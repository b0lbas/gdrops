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

const SESSION_VERSION = 1;

function practiceSessionKey(quizId, topicId, mode){
  return `geodrops:practiceSession:${quizId || ""}:${topicId || ""}:${mode || ""}`;
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

function pickPlanKind(plan, idx){
  return plan[idx % plan.length];
}

export async function PracticeScreen(ctx, query){
  // stop any previous practice timers (route rerenders do not unmount intervals)
  if (typeof ctx.state.practiceStop === "function") ctx.state.practiceStop();

  const quizId = query.get("quizId");
  const topicId = query.get("topicId");
  const mode = query.get("mode") || "topic";
  const sessionKey = practiceSessionKey(quizId, topicId || "", mode);

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
    h("div", { class:"row", style:"justify-content:space-between;align-items:center;" },
      h("div", { class:"row" },
        btn("←", ()=>{ stop(); nav(`/quiz/${quizId}`); }, "btn"),
        h("div", { class:"title" }, mode === "dojo" ? "Dojo" : (topic?.title || "Practice"))
      )
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

    const all = (mode === "dojo")
      ? await listItemsByQuiz(quizId)
      : await listItemsByTopic(topicId);

    if (!all.length){ toast("empty"); running=false; return; }

    // filter out mastered
    const items = all.filter(it => (it.masteredHits||0) < 10);
    if (!items.length){ toast("done"); running=false; return; }


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
    let roundCount = Number.isFinite(resume?.roundCount) ? resume.roundCount : 0;
    const lastKindAt = new Map();
    if (Array.isArray(resume?.lastKindAt)) {
      for (const [kind, val] of resume.lastKindAt) lastKindAt.set(kind, Number(val) || 0);
    }
    recentIds.length = 0;
    if (Array.isArray(resume?.recentIds)) {
      recentIds.push(...resume.recentIds.slice(0, 3));
    }

    function kindAllowed(kind){
      const last = lastKindAt.get(kind);
      if (last === undefined) return true;
      const gap = roundCount - last;
      if (kind === "truefalse") return gap >= 10;
      if (kind === "match") return gap >= 3;
      return gap >= 1;
    }

    // session plan (varied micro-games, no Start between them)
    const plan = [
      "mcq_t2t",
      "mcq_t2i",
      "mcq_i2t",
      "mcq_t2p",
      "fragments",
      "spell",
      "wordgrid",
      "mcq_i2t",
      "wordgrid",
      "match",
      "truefalse",
      "speed"
    ];

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

    function batchNeedsExposure(){
      return currentBatch().some(it => (seenCount.get(it.id) || 0) < 5);
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
        mode,
        stats,
        orderIds: order.map(it => it.id),
        batchIndex,
        roundCount,
        recentIds: recentIds.slice(0, 3),
        seenCount: [...seenCount.entries()],
        streakCount: [...streakCount.entries()],
        lastKindAt: [...lastKindAt.entries()],
        wasNewIds
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

    function weightedPool(baseItems){
      const need = baseItems.filter(it => (seenCount.get(it.id) || 0) < 5);
      if (!need.length) return baseItems;
      return [...need, ...need, ...baseItems];
    }

    function uniqById(list){
      const out = [];
      const seen = new Set();
      for (const it of list){
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        out.push(it);
      }
      return out;
    }

    function pickFew(itemsList, n){
      const sorted = itemsList.slice().sort((a,b)=>(seenCount.get(a.id)||0)-(seenCount.get(b.id)||0));
      return shuffle(sorted.slice(0, Math.min(n, sorted.length)));
    }

    function matchItems(){
      const cur = currentBatch();
      const old = oldItems();
      const mix = [];
      if (cur.length) mix.push(...pickFew(cur, Math.min(2, cur.length)));
      if (old.length) mix.push(...pickFew(old, Math.min(2, old.length)));

      const all = uniqById([...cur, ...old]);
      for (const it of all){
        if (mix.find(x=>x.id===it.id)) continue;
        mix.push(it);
        if (mix.length >= 4) break;
      }
      if (mix.length < 4) return null;
      return mix.slice(0,4);
    }

    function baseItemsForRound(){
      const cur = currentBatch();
      const old = oldItems();
      if (!old.length || batchIndex === 0) return cur;
      const useOld = Math.random() < 0.2;
      return useOld ? old : cur;
    }

    function pickRound(kind){
      const recentSet = new Set(recentIds);
      const base = baseItemsForRound();
      const baseNoRecent = base.filter(it => !recentSet.has(it.id));
      const useBase = baseNoRecent.length ? baseNoRecent : base;
      const cp = weightedPool(useBase);
      const op = useBase.length ? useBase : items;

      if (kind === "speed"){
        return { kind:"speed", q: pickSpeed(useBase.length ? useBase : items, { correctPool: cp, optionPool: op }) };
      }
      if (kind === "mcq_t2t"){
        const q = pickMcq(useBase.length ? useBase : items, "textToText", { correctPool: cp, optionPool: op });
        return { kind:"mcq", q };
      }
      if (kind === "mcq_i2t"){
        const q = pickMcq(useBase.length ? useBase : items, "imageToText", { correctPool: cp, optionPool: op });
        return { kind:"mcq", q };
      }
      if (kind === "mcq_t2i"){
        const q = pickMcq(useBase.length ? useBase : items, "textToImage", { correctPool: cp, optionPool: op });
        return { kind:"mcq", q };
      }
      if (kind === "mcq_t2p"){
        const q = pickMcq(useBase.length ? useBase : items, "textToPrompt", { correctPool: cp, optionPool: op });
        return { kind:"mcq", q };
      }
      if (kind === "truefalse"){
        const q = pickTrueFalse(useBase) || pickTrueFalse(items);
        return { kind:"truefalse", q };
      }
      if (kind === "match"){
        const mix = matchItems();
        const q = mix ? pickMatch(mix, { count: 4 }) : null;
        return { kind:"match", q };
      }
      if (kind === "spell"){
        const q = pickSpelling(useBase) || pickSpelling(items);
        return { kind:"spell", q };
      }
      if (kind === "fragments"){
        const q = pickFragments(useBase) || pickFragments(items);
        return { kind:"fragments", q };
      }
      if (kind === "wordgrid"){
        const q = pickWordGrid(useBase) || pickWordGrid(items);
        return { kind:"wordgrid", q };
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

      // try current plan slot then scan ahead (never end early just because one type can't render)
      let round = null;
      for (let scan=0; scan<plan.length; scan++){
        const kind = pickPlanKind(plan, roundCount + scan);
        if (!kindAllowed(kind)) continue;
        const r = pickRound(kind);
        if (r && r.q){ round = r; break; }
      }

      if (!round){
        // last fallback: try any mcq
        const recentSet = new Set(recentIds);
        const base = baseItemsForRound();
        const baseNoRecent = base.filter(it => !recentSet.has(it.id));
        const useBase = baseNoRecent.length ? baseNoRecent : base;
        const cp = weightedPool(useBase);
        const op = useBase.length ? useBase : items;

        const q = pickMcq(useBase.length ? useBase : items, "textToText", { correctPool: cp, optionPool: op }) ||
                  pickMcq(useBase.length ? useBase : items, "textToPrompt", { correctPool: cp, optionPool: op }) ||
                  pickMcq(useBase.length ? useBase : items, "imageToText", { correctPool: cp, optionPool: op }) ||
                  pickMcq(useBase.length ? useBase : items, "textToImage", { correctPool: cp, optionPool: op });
        if (q) round = { kind:"mcq", q };
      }

      if (!round) return finish();

      roundCount += 1;
      lastKindAt.set(round.kind, roundCount);
      stage.innerHTML = "";

      const onDone = async (res)=>{
        await applyResult(res);
        if (destroyed || !running) return;
        if (allMastered()) return finish();
        if (!batchNeedsExposure() && batchIndex < batches.length - 1){
          batchIndex += 1;
          return showBatchPreview();
        }
        setTimeout(()=>next(), 220);
      };

      let node = null;
      if (round.kind === "speed") node = renderSpeed(round.q, onDone, 3.5);
      else if (round.kind === "mcq") node = renderMcq(round.q, onDone);
      else if (round.kind === "match") node = renderMatch(round.q, onDone);
      else if (round.kind === "fragments") node = renderFragments(round.q, onDone);
      else if (round.kind === "truefalse") node = renderTrueFalse(round.q, onDone);
      else if (round.kind === "wordgrid") node = renderWordGrid(round.q, onDone);
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
