import { h, btn, toast } from "../ui.js";
import { nav } from "../router.js";
import { listItemsByQuiz, listItemsByTopic, getQuiz, getTopic, putItem } from "../db.js";
import { isNew, updateSrs } from "../srs.js";
import { pickMcq, renderMcq } from "../games/mcq.js";
import { pickMatch, renderMatch } from "../games/match.js";
import { pickSpelling, renderSpelling } from "../games/spelling.js";
import { pickSpeed, renderSpeed } from "../games/speed.js";
import { pickFragments, renderFragments } from "../games/fragments.js";
import { pickTrueFalse, renderTrueFalse } from "../games/truefalse.js";
import { pickWordGrid, renderWordGrid } from "../games/wordgrid.js";
import { pickMapName, pickMapFlag, renderMapQuiz } from "../games/mapQuiz.js";
import { loadMapData, getFeatureForItem } from "../mapData.js";
import { GAME_TYPES } from "../gameTypes.js";

const SESSION_VERSION = 1;

function practiceSessionKey(quizId, topicId){
  return `geodrops:practiceSession:${quizId || ""}:${topicId || ""}`;
}

function loadPracticeSession(key){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SESSION_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

function savePracticeSession(key, data){
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function clearPracticeSession(key){
  try { localStorage.removeItem(key); } catch {}
}

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function enabledGameTypes(quiz){
  const disabled = new Set(Array.isArray(quiz?.disabledTypes) ? quiz.disabledTypes : []);
  return GAME_TYPES.map(t => t.id).filter(id => !disabled.has(id));
}

const SINGLE_TYPES = new Set([
  "mcq_t2t",
  "mcq_t2i",
  "mcq_i2t",
  "mcq_t2p",
  "fragments",
  "spell",
  "wordgrid",
  "truefalse",
  "speed",
  "map_name",
  "map_flag"
]);

function normText(s){
  return (s||"").trim().toLowerCase().replace(/\s+/g, " ");
}

function letterCount(s){
  let n = 0;
  for (const ch of String(s||"")){
    if (/[\p{L}\p{N}]/u.test(ch)) n += 1;
  }
  return n;
}

function isEligibleForType(it, type, mapData){
  if (!it) return false;
  if (type === "mcq_t2t") return !!it.promptText && !!it.answerText && normText(it.promptText) !== normText(it.answerText);
  if (type === "mcq_i2t") return !!it.promptImage && !!it.answerText;
  if (type === "mcq_t2i") return !!it.promptText && !!it.answerImage;
  if (type === "mcq_t2p") return !!it.promptText && !!it.answerText && normText(it.promptText) !== normText(it.answerText);
  if (type === "spell") return !!it.answerText && (it.promptText || it.promptImage) && letterCount(it.answerText) >= 3;
  if (type === "fragments") return !!it.promptImage && !!it.answerText && letterCount(it.answerText) >= 1;
  if (type === "wordgrid") {
    const useAnswer = it.answerText || it.promptText;
    const usePrompt = it.promptImage || it.answerImage;
    return !!useAnswer && !!usePrompt && letterCount(useAnswer) >= 3;
  }
  if (type === "truefalse") return (it.promptText || it.promptImage) && (it.answerText || it.answerImage);
  if (type === "speed") return (it.promptImage && it.answerText) || (it.promptText && it.answerImage);
  if (type === "map_name") return !!mapData && !!getFeatureForItem(mapData, it) && !!it.answerText;
  if (type === "map_flag") return !!mapData && !!getFeatureForItem(mapData, it) && !!it.promptImage;
  if (type === "match") return (it.promptText || it.promptImage) && (it.answerText || it.answerImage);
  return false;
}

function serializeBatchState(state){
  if (!state) return null;
  return {
    batchIds: state.batchIds,
    planIndex: state.planIndex,
    lastSingleId: state.lastSingleId,
    remainingByType: [...state.remainingByType.entries()].map(([k, set]) => [k, [...set]])
  };
}

function buildBatchState(batchItems, enabledTypes, mapData, plan, resumeState){
  const batchIds = batchItems.map(it => it.id);
  const remainingByType = new Map();

  for (const kind of plan){
    if (!enabledTypes.has(kind)) continue;
    const eligible = batchItems.filter(it => isEligibleForType(it, kind, mapData));
    if (kind === "match") {
      if (eligible.length < 4) continue;
    } else if (!eligible.length) {
      continue;
    }
    remainingByType.set(kind, new Set(eligible.map(it => it.id)));
  }

  let planIndex = 0;
  let lastSingleId = null;
  if (resumeState && Array.isArray(resumeState.batchIds)) {
    const sameBatch = resumeState.batchIds.join("|") === batchIds.join("|");
    if (sameBatch && Array.isArray(resumeState.remainingByType)) {
      for (const [k, ids] of resumeState.remainingByType) {
        if (!remainingByType.has(k)) continue;
        const set = new Set(ids.filter(id => batchIds.includes(id)));
        remainingByType.set(k, set);
      }
      planIndex = Number.isFinite(resumeState.planIndex) ? resumeState.planIndex : 0;
      lastSingleId = resumeState.lastSingleId || null;
    }
  }

  return { batchIds, remainingByType, planIndex, lastSingleId };
}

function batchComplete(state){
  for (const set of state.remainingByType.values()){
    if (set.size) return false;
  }
  return true;
}

function nextKind(state, plan){
  if (!state) return null;
  for (let scan = 0; scan < plan.length; scan++){
    const idx = (state.planIndex + scan) % plan.length;
    const kind = plan[idx];
    const remaining = state.remainingByType.get(kind);
    if (remaining && remaining.size) {
      state.planIndex = (idx + 1) % plan.length;
      return kind;
    }
  }
  return null;
}

function pickSingleItem(state, kind, batchItems){
  const remaining = state.remainingByType.get(kind);
  if (!remaining || !remaining.size) return null;
  const candidates = batchItems.filter(it => remaining.has(it.id));
  if (!candidates.length) return null;
  const alt = state.lastSingleId ? candidates.filter(it => it.id !== state.lastSingleId) : candidates;
  const pool = alt.length ? alt : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function PracticeScreen(ctx, query){
  // stop any previous practice timers (route rerenders do not unmount intervals)
  if (typeof ctx.state.practiceStop === "function") ctx.state.practiceStop();

  const quizId = query.get("quizId");
  const topicId = query.get("topicId");
  const sessionKey = practiceSessionKey(quizId, topicId || "");

  const quiz = await getQuiz(quizId);
  if (!quiz) return h("div",{class:"wrap"}, h("div",{class:"sub"},"missing"));

  const topic = topicId ? await getTopic(topicId) : null;

  let destroyed = false;
  let running = false;
  let saveTimer = null;
  let saveSessionFn = null;
  let onVisibilityChange = null;
  const recentIds = [];

  function stop(){
    destroyed = true;
    if (saveSessionFn) saveSessionFn();
    saveSessionFn = null;
    if (saveTimer) clearInterval(saveTimer);
    saveTimer = null;
    if (onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
    onVisibilityChange = null;
    running = false;
    ctx.state.practiceActive = false;
  }
  ctx.state.practiceStop = stop;

  const top = h("div", { class:"topbar" },
    h("div", { class:"row", style:"align-items:center;" },
      btn("Back", ()=>{ stop(); history.back(); }, "btn ghost")
    )
  );

  const holder = h("div", { class:"col", style:"margin-top:10px;" });

  // auto-start (unless there is a saved session to resume)
  setTimeout(()=>maybeStart(), 0);

  function showResumePrompt(saved){
    holder.innerHTML = "";
    const card = h("div", { class:"card" },
      h("div", { class:"title" }, "Resume session?"),
      h("div", { class:"row" },
        btn("Resume", ()=>start(saved)),
        btn("New", ()=>{ clearPracticeSession(sessionKey); start(null); }, "btn")
      )
    );
    holder.appendChild(card);
  }

  function maybeStart(){
    if (destroyed) return;
    const saved = loadPracticeSession(sessionKey);
    if (saved) return showResumePrompt(saved);
    start(null);
  }

  async function start(resume){
    if (destroyed || running) return;
    running = true;
    ctx.state.practiceActive = true;

    const all = topicId ? await listItemsByTopic(topicId) : await listItemsByQuiz(quizId);

    if (!all.length){ toast("empty"); running=false; return; }

    // filter out mastered
    const items = all.filter(it => (it.masteredHits||0) < 10);
    if (!items.length){ toast("done"); running=false; return; }

    const enabledTypes = new Set(enabledGameTypes(quiz));
    const wantsMap = enabledTypes.has("map_name") || enabledTypes.has("map_flag");
    const mapData = wantsMap ? await loadMapData(all) : null;
    if (!mapData) {
      enabledTypes.delete("map_name");
      enabledTypes.delete("map_flag");
    }


    const stats = resume?.stats
      ? { correct: resume.stats.correct || 0, wrong: resume.stats.wrong || 0, new: resume.stats.new || 0, reviewed: resume.stats.reviewed || 0 }
      : { correct:0, wrong:0, new:0, reviewed:0 };
    const wasNew = new Map();
    const resumeNewIds = Array.isArray(resume?.wasNewIds) ? new Set(resume.wasNewIds) : null;
    for (const it of items){
      wasNew.set(it.id, resumeNewIds ? resumeNewIds.has(it.id) : isNew(it));
    }

    const itemsById = new Map(items.map(it => [it.id, it]));
    let order = [];
    if (Array.isArray(resume?.orderIds) && resume.orderIds.length) {
      const used = new Set();
      for (const id of resume.orderIds) {
        const it = itemsById.get(id);
        if (!it || used.has(id)) continue;
        used.add(id);
        order.push(it);
      }
      const remaining = items.filter(it => !used.has(it.id));
      order = order.concat(shuffle(remaining));
    } else {
      order = shuffle(items.slice());
    }
    const batches = [];
    for (let i=0; i<order.length; i+=4){
      batches.push(order.slice(i, i+4));
    }

    const seenCount = new Map();
    const streakCount = new Map();
    for (const it of items){
      seenCount.set(it.id, 0);
      streakCount.set(it.id, 0);
    }
    if (Array.isArray(resume?.seenCount)) {
      for (const [id, val] of resume.seenCount) {
        if (seenCount.has(id)) seenCount.set(id, Number(val) || 0);
      }
    }
    if (Array.isArray(resume?.streakCount)) {
      for (const [id, val] of resume.streakCount) {
        if (streakCount.has(id)) streakCount.set(id, Number(val) || 0);
      }
    }

    let batchIndex = Number.isFinite(resume?.batchIndex) ? resume.batchIndex : 0;
    recentIds.length = 0;
    if (Array.isArray(resume?.recentIds)) {
      recentIds.push(...resume.recentIds.slice(0, 3));
    }

    // session plan (varied micro-games, no Start between them)
    const basePlan = [
      "mcq_t2t",
      "mcq_t2i",
      "mcq_i2t",
      "mcq_t2p",
      "fragments",
      "spell",
      "wordgrid",
      "map_name",
      "mcq_i2t",
      "wordgrid",
      "map_flag",
      "match",
      "truefalse",
      "speed"
    ];
    let plan = basePlan.filter(kind => enabledTypes.has(kind));
    if (!plan.length) plan = basePlan.slice();

    let batchState = null;
    function resetBatchState(resumeState=null){
      batchState = buildBatchState(currentBatch(), enabledTypes, mapData, plan, resumeState);
    }
    resetBatchState(resume?.batchState);

    holder.innerHTML = "";
    const stage = h("div", { class:"col" });
    holder.appendChild(stage);

    function currentBatch(){
      return batches[batchIndex] || [];
    }

    function oldItems(){
      if (batchIndex <= 0) return [];
      return batches.slice(0, batchIndex).flat();
    }

    function allMastered(){
      return items.every(it => (streakCount.get(it.id) || 0) >= 10);
    }

    function buildSession(){
      const wasNewIds = [];
      for (const [id, val] of wasNew.entries()) if (val) wasNewIds.push(id);
      return {
        version: SESSION_VERSION,
        quizId,
        topicId: topicId || "",
        stats,
        orderIds: order.map(it => it.id),
        batchIndex,
        recentIds: recentIds.slice(0, 3),
        seenCount: [...seenCount.entries()],
        streakCount: [...streakCount.entries()],
        wasNewIds,
        batchState: serializeBatchState(batchState)
      };
    }

    function persistSession(){
      if (!running || destroyed) return;
      savePracticeSession(sessionKey, buildSession());
    }

    saveSessionFn = persistSession;
    saveTimer = setInterval(persistSession, 5000);
    onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persistSession();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    function buildRound(){
      const batchItems = currentBatch();
      const optionPool = items;
      for (let guard=0; guard<plan.length * 2; guard++){
        const kind = nextKind(batchState, plan);
        if (!kind) return null;

        if (kind === "match"){
          const eligible = batchItems.filter(it => isEligibleForType(it, kind, mapData));
          if (eligible.length < 4) {
            const set = batchState.remainingByType.get(kind);
            if (set) set.clear();
            continue;
          }
          const mix = shuffle(eligible).slice(0, 4);
          const q = pickMatch(mix, { count: 4 });
          if (!q) {
            const set = batchState.remainingByType.get(kind);
            if (set) set.clear();
            continue;
          }
          return { kind:"match", q, mode:"multi" };
        }

        const item = pickSingleItem(batchState, kind, batchItems);
        if (!item) {
          const set = batchState.remainingByType.get(kind);
          if (set) set.clear();
          continue;
        }

        let q = null;
        if (kind === "speed"){
          q = pickSpeed(optionPool, { correctPool: [item], optionPool });
          if (q) return { kind:"speed", q, mode:"single", itemId: item.id };
        } else if (kind === "mcq_t2t"){
          q = pickMcq(optionPool, "textToText", { correctPool: [item], optionPool });
          if (q) return { kind, q, mode:"single", itemId: item.id };
        } else if (kind === "mcq_i2t"){
          q = pickMcq(optionPool, "imageToText", { correctPool: [item], optionPool });
          if (q) return { kind, q, mode:"single", itemId: item.id };
        } else if (kind === "mcq_t2i"){
          q = pickMcq(optionPool, "textToImage", { correctPool: [item], optionPool });
          if (q) return { kind, q, mode:"single", itemId: item.id };
        } else if (kind === "mcq_t2p"){
          q = pickMcq(optionPool, "textToPrompt", { correctPool: [item], optionPool });
          if (q) return { kind, q, mode:"single", itemId: item.id };
        } else if (kind === "truefalse"){
          q = pickTrueFalse(optionPool, { correctPool: [item], optionPool });
          if (q) return { kind:"truefalse", q, mode:"single", itemId: item.id };
        } else if (kind === "spell"){
          q = pickSpelling([item]);
          if (q) return { kind:"spell", q, mode:"single", itemId: item.id };
        } else if (kind === "fragments"){
          q = pickFragments([item]);
          if (q) return { kind:"fragments", q, mode:"single", itemId: item.id };
        } else if (kind === "wordgrid"){
          q = pickWordGrid([item]);
          if (q) return { kind:"wordgrid", q, mode:"single", itemId: item.id };
        } else if (kind === "map_name"){
          q = pickMapName(optionPool, mapData, { correctPool: [item], optionPool });
          if (q) return { kind:"map_name", q, mode:"single", itemId: item.id };
        } else if (kind === "map_flag"){
          q = pickMapFlag(optionPool, mapData, { correctPool: [item], optionPool });
          if (q) return { kind:"map_flag", q, mode:"single", itemId: item.id };
        }

        const set = batchState.remainingByType.get(kind);
        if (set) set.delete(item.id);
      }
      return null;
    }

    async function applyResult(res){
      if (!res) return;
      const ids = res.itemIds ? res.itemIds : (res.itemId ? [res.itemId] : []);
      for (const id of ids){
        const it = items.find(x=>x.id===id);
        if (!it) continue;

        const preNew = wasNew.get(id) === true;
        if (preNew) stats.new += 1;
        else stats.reviewed += 1;

        updateSrs(it, { correct: !!res.correct });
        await putItem(it);
      }

      if (res.correct) stats.correct += 1;
      else stats.wrong += 1;

      for (const id of ids){
        if (!id) continue;
        const seen = seenCount.get(id) || 0;
        seenCount.set(id, seen + 1);
        if (res.correct) streakCount.set(id, (streakCount.get(id) || 0) + 1);
        else streakCount.set(id, 0);
      }

      for (const id of ids){
        if (!id) continue;
        recentIds.unshift(id);
      }
      while (recentIds.length > 3) recentIds.pop();

      // no stage-level feedback
      persistSession();
    }

    function renderPreviewItem(it, onNext){
      const p = it.promptText ? it.promptText : (it.promptImage ? h("img", { src: it.promptImage, alt:"" }) : "missing");
      const a = it.answerText ? it.answerText : (it.answerImage ? h("img", { src: it.answerImage, alt:"" }) : "missing");
      const prompt = h("div", { class:"prompt" }, p);
      const answer = h("div", { class:"prompt" }, a);
      return h("div", { class:"practice" }, prompt, answer, btn("Next", onNext));
    }

    function showBatchPreview(){
      const batch = currentBatch();
      let idx = 0;
      const show = ()=>{
        if (destroyed || !running) return;
        stage.innerHTML = "";
        if (!batch.length){ next(); return; }
        const node = renderPreviewItem(batch[idx], ()=>{
          idx += 1;
          if (idx >= batch.length) next();
          else show();
        });
        stage.appendChild(node);
      };
      show();
    }

    async function next(){
      if (destroyed || !running) return;

      const round = buildRound();
      if (!round || !round.q) return finish();

      stage.innerHTML = "";

      const onDone = async (res)=>{
        await applyResult(res);
        if (destroyed || !running) return;

        if (round.mode === "single"){
          const set = batchState.remainingByType.get(round.kind);
          if (set) set.delete(round.itemId);
          batchState.lastSingleId = round.itemId;
        } else if (round.mode === "multi"){
          const set = batchState.remainingByType.get(round.kind);
          if (set) set.clear();
        }

        if (allMastered()) return finish();
        if (batchComplete(batchState)){
          if (batchIndex < batches.length - 1){
            batchIndex += 1;
            resetBatchState();
            return showBatchPreview();
          }
          return finish();
        }
        setTimeout(()=>next(), 220);
      };

      let node = null;
      if (round.kind === "speed") node = renderSpeed(round.q, onDone, 3.5);
      else if (round.kind.startsWith("mcq_")) node = renderMcq(round.q, onDone);
      else if (round.kind === "match") node = renderMatch(round.q, onDone);
      else if (round.kind === "fragments") node = renderFragments(round.q, onDone);
      else if (round.kind === "truefalse") node = renderTrueFalse(round.q, onDone);
      else if (round.kind === "wordgrid") node = renderWordGrid(round.q, onDone);
      else if (round.kind === "map_name" || round.kind === "map_flag") node = renderMapQuiz(round.q, onDone);
      else node = renderSpelling(round.q, onDone);

      stage.appendChild(node);
    }

    function finish(){
      if (destroyed || !running) return;
      running = false;
      ctx.state.practiceActive = false;
      if (saveTimer) clearInterval(saveTimer);
      saveTimer = null;
      if (onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
      onVisibilityChange = null;
      saveSessionFn = null;
      clearPracticeSession(sessionKey);

      holder.innerHTML = "";
      holder.appendChild(h("div",{class:"card"},
        h("div",{class:"title"}, `${stats.correct} / ${stats.correct+stats.wrong}`),
        h("div",{class:"sub"}, `${stats.new} new · ${stats.reviewed} rev`)
      ));
      holder.appendChild(btn("Back", ()=>{ stop(); nav(`/quiz/${quizId}`); }, "btn"));
    }

    showBatchPreview();
  }

  return h("div", { class:"wrap" }, top, holder);
}
