import { h } from "../ui.js";

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function normText(s){
  return (s||"").trim().toLowerCase().replace(/\s+/g, " ");
}

function imageKey(dataUrl){
  const s = String(dataUrl||"");
  return s.slice(0, 120) + "|" + s.length;
}

function leftKey(it){
  return it.promptImage ? ("i:"+imageKey(it.promptImage)) : ("t:"+normText(it.promptText||""));
}
function rightKey(it){
  return it.answerImage ? ("i:"+imageKey(it.answerImage)) : ("t:"+normText(it.answerText||""));
}

function reprPrompt(it){
  if (it.promptImage) return { kind:"image", image: it.promptImage, text:null };
  return { kind:"text", text: it.promptText || "", image:null };
}
function reprAnswer(it){
  if (it.answerImage) return { kind:"image", image: it.answerImage, text:null };
  return { kind:"text", text: it.answerText || "", image:null };
}

// opts: { count?: number }
export function pickMatch(items, opts = null){
  const count = opts?.count ?? null;
  const pool = items.filter(it => (it.promptText || it.promptImage) && (it.answerText || it.answerImage));
  const minNeeded = count ?? 6;
  if (pool.length < minNeeded) return null;
  const n = count ?? Math.min(10, Math.max(6, Math.floor(pool.length / 2)));
  // enforce unique prompts/answers inside the set (no duplicates on either side)
  const usedL = new Set();
  const usedR = new Set();
  const pairs = [];
  for (const it of shuffle(pool)){
    const lk = leftKey(it);
    const rk = rightKey(it);
    if (usedL.has(lk) || usedR.has(rk)) continue;
    usedL.add(lk);
    usedR.add(rk);
    pairs.push({ itemId: it.id, left: reprPrompt(it), right: reprAnswer(it) });
    if (pairs.length >= n) break;
  }
  if (pairs.length < minNeeded) return null;
  const usePairs = pairs.slice(0, n);
  const left = usePairs.map((p, idx)=>({ idx, itemId:p.itemId, ...p.left }));
  const right = shuffle(usePairs.map((p, idx)=>({ idx, itemId:p.itemId, ...p.right })));
  return { type:"match", pairs: usePairs, left, right, itemIds: usePairs.map(p=>p.itemId) };
}

export function renderMatch(q, onDone){
  const state = {
    leftPick: null,
    rightPick: null,
    matched: new Set(),
    mistakes: 0
  };

  const rows = q.left.map((p, idx)=>{
    const l = renderCell(p, "L");
    const r = renderCell(q.right[idx], "R");
    return h("div", { class:"matchRow" }, l, r);
  });
  const grid = h("div", { class:"matchTable" }, rows);

  const head = h("div", { class:"row" },
    h("div", { class:"sub" }, "match")
  );

  function renderCell(p, side){
    const btn = h("button", { class:"opt", onclick: ()=>pick(side, p, btn) },
      p.kind === "text" ? p.text : h("img", { src:p.image, alt:"" })
    );
    btn.dataset.itemId = p.itemId;
    btn.dataset.side = side;
    btn.dataset.idx = String(p.idx);
    return btn;
  }

  function pick(side, p, btn){
    if (state.matched.has(p.itemId)) return;

    // clear previous on same side
    const row = btn.parentElement;
    if (row) row.querySelectorAll("button").forEach(b => b.classList.remove("pick","flashBad"));

    if (side === "L") state.leftPick = { itemId:p.itemId, btn };
    else state.rightPick = { itemId:p.itemId, btn };

    btn.classList.add("pick");

    if (state.leftPick && state.rightPick){
      const ok = state.leftPick.itemId === state.rightPick.itemId;
      if (ok){
        state.matched.add(p.itemId);
        state.leftPick.btn.classList.add("good");
        state.rightPick.btn.classList.add("good");
        state.leftPick.btn.disabled = true;
        state.rightPick.btn.disabled = true;
      } else {
        state.mistakes += 1;
        state.leftPick.btn.classList.remove("pick");
        state.rightPick.btn.classList.remove("pick");
        state.leftPick.btn.classList.add("flashBad");
        state.rightPick.btn.classList.add("flashBad");
      }
      const lp = state.leftPick, rp = state.rightPick;
      state.leftPick = null; state.rightPick = null;
      setTimeout(()=>{
        lp.btn.classList.remove("flashBad","pick");
        rp.btn.classList.remove("flashBad","pick");
      }, 180);

      if (state.matched.size === q.pairs.length){
        const correct = state.mistakes === 0;
        // treat as one review for each item: if mistakes>0 => incorrect
        setTimeout(()=> onDone({ correct, itemIds: q.itemIds, meta:{ mistakes: state.mistakes } }), 900);
      }
    }
  }

  return h("div", { class:"practice" }, head, grid);
}
