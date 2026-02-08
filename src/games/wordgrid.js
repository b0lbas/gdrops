import { h } from "../ui.js";

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function lettersOnly(s){
  const t = String(s||"").trim().toUpperCase();
  const out = [];
  for (const ch of t){
    if (/[A-ZÀ-ÖØ-Ý0-9]/i.test(ch) || /[\u0400-\u04FF]/.test(ch) || /[\u3040-\u30ff\u4e00-\u9fff]/.test(ch) || /[\u0600-\u06FF]/.test(ch)) out.push(ch);
  }
  return out;
}

function neighbors(idx, size){
  const r = Math.floor(idx / size);
  const c = idx % size;
  const out = [];
  if (r > 0) out.push(idx - size);
  if (r < size-1) out.push(idx + size);
  if (c > 0) out.push(idx - 1);
  if (c < size-1) out.push(idx + 1);
  return out;
}

function buildPath(size, letters){
  const total = size * size;
  for (let tries=0; tries<100; tries++){
    const start = Math.floor(Math.random()*total);
    const path = [start];
    const used = new Set([start]);

    let ok = true;
    while (path.length < letters.length){
      const last = path[path.length-1];
      const opts = shuffle(neighbors(last, size).filter(i => !used.has(i)));
      if (!opts.length){ ok = false; break; }
      const next = opts[0];
      path.push(next);
      used.add(next);
    }
    if (ok) return path;
  }
  return null;
}

export function pickWordGrid(items){
  const base = items.filter(it => (
    (it.promptImage && it.answerText) ||
    (it.answerImage && it.promptText)
  ));
  if (!base.length) return null;

  for (let tries=0; tries<30; tries++){
    const item = base[Math.floor(Math.random()*base.length)];
    const usePromptImage = item.promptImage || item.answerImage;
    const useAnswerText = item.answerText || item.promptText;
    if (!usePromptImage || !useAnswerText) continue;

    const letters = lettersOnly(useAnswerText);
    if (letters.length < 3) continue;

    let size = 4;
    if (letters.length <= 4) size = 3;
    if (letters.length >= 9) size = 5;
    if (letters.length >= 13) size = 6;
    if (letters.length > size * size) continue;

    const path = buildPath(size, letters);
    if (!path) continue;

    const grid = new Array(size*size).fill(null);
    for (let i=0; i<letters.length; i++) grid[path[i]] = letters[i];

    const decoys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    for (let i=0; i<grid.length; i++){
      if (!grid[i]) grid[i] = decoys[Math.floor(Math.random()*decoys.length)];
    }

    return {
      type:"wordgrid",
      itemId: item.id,
      prompt: { kind:"image", image: usePromptImage },
      answer: useAnswerText,
      letters,
      size,
      grid
    };
  }

  return null;
}

export function renderWordGrid(q, onDone){
  const picked = [];
  const used = new Set();
  let dragging = false;

  const prompt = h("div", { class:"prompt" },
    h("img", { src:q.prompt.image, alt:"" })
  );

  const result = h("div", { class:"sub", style:"text-align:center;min-height:18px;" }, "");

  const gridEl = h("div", { class:"wordGrid", style:`--n:${q.size};` },
    q.grid.map((ch, idx)=>h("button", { class:"letterCell", "data-idx": String(idx) }, ch))
  );

  const ctrlRow = h("div", { class:"row", style:"justify-content:center;" },
    h("button", { class:"btn ghost", onclick: reset }, "Reset")
  );

  function tap(idx){
    if (used.has(idx)){
      const lastIdx = picked[picked.length-1];
      const prevIdx = picked[picked.length-2];
      if (idx === prevIdx){
        const removed = picked.pop();
        used.delete(removed);
        gridEl.children[removed].classList.remove("sel");
      }
      return;
    }
    if (picked.length){
      const last = picked[picked.length-1];
      const row = Math.floor(idx / q.size);
      const col = idx % q.size;
      const lastRow = Math.floor(last / q.size);
      const lastCol = last % q.size;
      const man = Math.abs(row-lastRow) + Math.abs(col-lastCol);
      if (man !== 1) return;
    }

    picked.push(idx);
    used.add(idx);
    gridEl.children[idx].classList.add("sel");

  }

  function idxFromEvent(e){
    const pt = e.touches ? e.touches[0] : e;
    if (!pt) return null;
    const el = document.elementFromPoint(pt.clientX, pt.clientY);
    if (!el) return null;
    const btn = el.closest(".letterCell");
    if (!btn) return null;
    const v = btn.getAttribute("data-idx");
    if (v === null) return null;
    return parseInt(v, 10);
  }

  function onStart(e){
    e.preventDefault();
    const idx = idxFromEvent(e);
    if (idx === null) return;
    dragging = true;
    tap(idx);
  }

  function onMove(e){
    if (!dragging) return;
    e.preventDefault();
    const idx = idxFromEvent(e);
    if (idx === null) return;
    tap(idx);
  }

  function onEnd(){
    if (!dragging) return;
    dragging = false;
    if (picked.length === q.letters.length) finish();
    else if (picked.length){
      reset();
    }
  }

  function reset(){
    picked.length = 0;
    used.clear();
    [...gridEl.children].forEach(b => b.classList.remove("sel","good","bad"));
  }

  function finish(){
    const got = picked.map(i => q.grid[i]).join("");
    const want = q.letters.join("");
    const correct = got === want;

    if (correct){
      picked.forEach(i => gridEl.children[i].classList.add("good"));
      result.textContent = "Correct";
    } else {
      picked.forEach(i => gridEl.children[i].classList.add("bad"));
      result.textContent = "Correct: " + q.answer;
    }
    gridEl.querySelectorAll("button").forEach(b => b.disabled = true);

    setTimeout(()=> onDone({ correct, itemId:q.itemId, meta:{ got, want } }), 900);
  }

  gridEl.addEventListener("pointerdown", onStart);
  gridEl.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onEnd);
  gridEl.addEventListener("touchstart", onStart, { passive:false });
  gridEl.addEventListener("touchmove", onMove, { passive:false });
  window.addEventListener("touchend", onEnd);

  return h("div", { class:"practice" }, prompt, gridEl, ctrlRow, result);
}
