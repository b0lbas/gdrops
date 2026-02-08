import { h, btn, pillGroup, toast } from "../ui.js";
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
import { pickMapMcq, renderMapMcq, preloadMap } from "../games/mapmcq.js";

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

  const MIN_KEY = "geodrops:lastMinutes";
  let minutes = parseInt(query.get("minutes") || localStorage.getItem(MIN_KEY) || "5", 10) || 5;
  if (![2,5,10].includes(minutes)) minutes = 5;
  localStorage.setItem(MIN_KEY, String(minutes));

  const quiz = await getQuiz(quizId);
  if (!quiz) return h("div",{class:"wrap"}, h("div",{class:"sub"},"missing"));

  const topic = topicId ? await getTopic(topicId) : null;

  let destroyed = false;
  let ticking = null;
  let running = false;
  const recentIds = [];

  function stop(){
    destroyed = true;
    running = false;
    ctx.state.practiceActive = false;
    if (ticking) clearInterval(ticking);
    ticking = null;
  }
  ctx.state.practiceStop = stop;

  const pills = pillGroup(
    [{value:"2",label:"2"},{value:"5",label:"5"},{value:"10",label:"10"}],
    String(minutes),
    (v)=>{
      // restart with new duration (Drops-like: no extra Start)
      nav("/practice", { quizId, topicId: topicId || "", mode, minutes: v, autostart: "1" });
    }
  );

  const top = h("div", { class:"topbar" },
    h("div", { class:"row", style:"justify-content:space-between;align-items:center;" },
      h("div", { class:"row" },
        btn("←", ()=>{ stop(); nav(`/quiz/${quizId}`); }, "btn"),
        h("div", { class:"title" }, mode === "dojo" ? "Dojo" : (topic?.title || "Practice"))
      ),
      pills
    )
  );

  const holder = h("div", { class:"col", style:"margin-top:10px;" });

  // auto-start always (closer to Drops)
  setTimeout(()=>start(), 0);

  async function start(){
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

    try { await preloadMap(); } catch {}

    const endAt = Date.now() + minutes * 60 * 1000;

    const stats = { correct:0, wrong:0, new:0, reviewed:0 };
    const wasNew = new Map();
    for (const it of items) wasNew.set(it.id, isNew(it));

    const order = shuffle(items.slice());
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

    let batchIndex = 0;
    let roundCount = 0;
    const lastKindAt = new Map();

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
      "mapmcq",
      "mcq_i2t",
      "wordgrid",
      "match",
      "truefalse",
      "speed"
    ];

    holder.innerHTML = "";
    const stage = h("div", { class:"col" });
    holder.appendChild(stage);

    const footer = h("div", { class:"footerRow" },
      h("div", { class:"small", id:"t" }, ""),
      h("div", { class:"small" }, "")
    );
    holder.appendChild(footer);

    function updateClock(){
      const left = Math.max(0, endAt - Date.now());
      const sec = Math.ceil(left/1000);
      const t = footer.querySelector("#t");
      if (t) t.textContent = sec + "s";
      if (left <= 0) finish();
    }

    ticking = setInterval(updateClock, 250);
    updateClock();

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
      if (kind === "mapmcq"){
        const q = pickMapMcq(useBase, { correctPool: cp, optionPool: op }) || pickMapMcq(items, { correctPool: cp, optionPool: op });
        return { kind:"mapmcq", q };
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
      if (Date.now() >= endAt) return finish();

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
      else if (round.kind === "mapmcq") node = renderMapMcq(round.q, onDone);
      else node = renderSpelling(round.q, onDone);

      stage.appendChild(node);
    }

    function finish(){
      if (destroyed || !running) return;
      running = false;
      ctx.state.practiceActive = false;
      if (ticking) clearInterval(ticking);
      ticking = null;

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
