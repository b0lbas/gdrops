import { h } from "../ui.js";

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function norm(s){
  return (s||"").trim();
}

function normLower(s){
  return (s||"").trim().toLowerCase().replace(/\s+/g, " ");
}

function lettersFor(s){
  // keep letters/digits only; remove spaces, punctuation
  const t = norm(s).toUpperCase();
  const out = [];
  for (const ch of t){
    if (/[A-ZÀ-ÖØ-Ý0-9]/i.test(ch) || /[\u0400-\u04FF]/.test(ch) || /[\u3040-\u30ff\u4e00-\u9fff]/.test(ch) || /[\u0600-\u06FF]/.test(ch)) out.push(ch);
  }
  return out;
}

export function pickSpelling(items){
  // Avoid the "copy the same text" anti-exercise:
  // - prefer image -> text
  // - otherwise, only text -> different text
  const base = items.filter(it => !!it.answerText && (it.promptText || it.promptImage));
  if (!base.length) return null;

  const pref = base.filter(it => !!it.promptImage);
  const alt = base.filter(it => !!it.promptText && normLower(it.promptText) !== normLower(it.answerText));
  const pool = pref.length ? pref : alt.length ? alt : [];
  if (!pool.length) return null;

  const item = pool[Math.floor(Math.random()*pool.length)];
  const ans = lettersFor(item.answerText);
  if (ans.length < 3) return null;

  const tiles = shuffle(ans.slice());
  // add a few decoys (latin only, minimal)
  const decoys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  while (tiles.length < Math.min(18, ans.length + 4)) {
    tiles.push(decoys[Math.floor(Math.random()*decoys.length)]);
  }
  return { type:"spelling", itemId:item.id, prompt: item.promptImage ? {kind:"image", image:item.promptImage} : {kind:"text", text:item.promptText}, answer:item.answerText, answerLetters: ans, tiles: shuffle(tiles) };
}

export function renderSpelling(q, onDone){
  const filled = [];
  const used = new Array(q.tiles.length).fill(false);

  const prompt = h("div", { class:"prompt" },
    q.prompt.kind==="text" ? q.prompt.text : h("img", { src:q.prompt.image, alt:"" })
  );

  const slots = h("div", { class:"slotRow" }, q.answerLetters.map(()=>h("div",{class:"slot"},"_")));
  const tilesRow = h("div", { class:"tileRow" });
  const result = h("div", { class:"sub", style:"text-align:center;min-height:18px;" }, "");

  function renderTiles(){
    tilesRow.innerHTML="";
    q.tiles.forEach((ch, idx)=>{
      const b = h("button", { class:"tile", onclick: ()=>tap(idx), disabled: used[idx] }, ch);
      tilesRow.appendChild(b);
    });
    tilesRow.appendChild(h("button", { class:"tile", onclick: back }, "Back"));
  }

  function renderSlots(){
    [...slots.children].forEach((el, i)=>{
      el.textContent = filled[i] || "_";
      el.style.color = filled[i] ? "var(--fg)" : "var(--muted)";
    });
  }

  function tap(idx){
    if (used[idx]) return;
    if (filled.length >= q.answerLetters.length) return;
    used[idx]=true;
    filled.push(q.tiles[idx]);
    renderTiles(); renderSlots();
    if (filled.length === q.answerLetters.length) finish();
  }

  function back(){
    if (!filled.length) return;
    // unuse last used tile (find last true where tile equals that char and index not already reused)
    const ch = filled.pop();
    // find last used tile index with that char
    for (let i=q.tiles.length-1;i>=0;i--){
      if (used[i] && q.tiles[i] === ch) { used[i]=false; break; }
    }
    renderTiles(); renderSlots();
  }

  function finish(){
    const got = filled.join("");
    const want = q.answerLetters.join("");
    const correct = got === want;
    tilesRow.querySelectorAll("button").forEach(b => b.disabled = true);
    if (correct){
      [...slots.children].forEach(el => el.classList.add("good"));
      result.textContent = "Correct";
    } else {
      [...slots.children].forEach(el => el.classList.add("bad"));
      result.textContent = "Correct: " + q.answer;
    }
    setTimeout(()=> onDone({ correct, itemId:q.itemId, meta:{ got, want } }), 900);
  }

  renderTiles(); renderSlots();

  return h("div", { class:"practice" }, prompt, slots, tilesRow, result);
}
