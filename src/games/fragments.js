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
  const t = String(s||"").trim().toLowerCase();
  const out = [];
  for (const ch of t){
    if (/[A-ZÀ-ÖØ-Ý0-9]/i.test(ch) || /[\u0400-\u04FF]/.test(ch) || /[\u3040-\u30ff\u4e00-\u9fff]/.test(ch) || /[\u0600-\u06FF]/.test(ch)) out.push(ch);
  }
  return out;
}

function splitWords(s){
  return String(s||"")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeAnswer(s){
  const words = splitWords(s).map(w => lettersOnly(w).join(""));
  return words.filter(Boolean).join(" ");
}

function splitFragments(letters){
  const n = letters.length;
  if (n < 3) return null;
  let parts = 2;
  if (n >= 6) parts = 3;
  if (n >= 9) parts = 4;

  const base = Math.floor(n / parts);
  let rem = n % parts;
  const sizes = [];
  for (let i=0;i<parts;i++){
    sizes.push(base + (rem > 0 ? 1 : 0));
    rem -= 1;
  }
  // Avoid 1-letter fragments
  for (let i=0;i<sizes.length;i++){
    if (sizes[i] === 1){
      const j = sizes.findIndex((s, idx)=>s > 2 && idx !== i);
      if (j >= 0){
        sizes[i] += 1;
        sizes[j] -= 1;
      }
    }
  }

  const out = [];
  let pos = 0;
  for (const size of sizes){
    out.push(letters.slice(pos, pos + size).join(""));
    pos += size;
  }
  return out.filter(Boolean);
}

function uniq(arr){
  const seen = new Set();
  const out = [];
  for (const x of arr){
    const k = String(x).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export function pickFragments(items){
  const base = items.filter(it => !!it.promptImage && !!it.answerText);
  if (!base.length) return null;

  for (let tries=0; tries<30; tries++){
    const item = base[Math.floor(Math.random()*base.length)];
    const words = splitWords(item.answerText);
    if (!words.length) continue;

    const wordFrags = [];
    for (const w of words){
      const letters = lettersOnly(w);
      if (!letters.length) continue;
      if (letters.length < 3) wordFrags.push([letters.join("")]);
      else {
        const parts = splitFragments(letters);
        if (!parts || !parts.length) continue;
        wordFrags.push(parts);
      }
    }
    if (!wordFrags.length) continue;

    const slots = [];
    for (let i=0; i<wordFrags.length; i++){
      const fr = wordFrags[i];
      for (const p of fr) slots.push({ type:"frag", text:p.toLowerCase() });
      if (i < wordFrags.length - 1) slots.push({ type:"gap" });
    }

    const parts = slots.filter(s=>s.type==="frag").map(s=>s.text);
    if (parts.length < 2) continue;

    const decoys = [];
    for (const it of shuffle(items)){
      if (!it.answerText || it.id === item.id) continue;
      const w = splitWords(it.answerText);
      for (const ww of w){
        const l = lettersOnly(ww);
        if (!l.length) continue;
        const p = (l.length < 3) ? [l.join("")] : (splitFragments(l) || []);
        if (!p.length) continue;
        decoys.push(...p.map(x=>x.toLowerCase()));
      }
      if (decoys.length >= 8) break;
    }

    const options = uniq([...parts, ...decoys]);
    const need = Math.max(parts.length + 2, Math.min(12, parts.length + 7));
    const rest = options.filter(o => !parts.includes(o));
    const finalOptions = shuffle([...parts, ...shuffle(rest).slice(0, Math.max(0, need - parts.length))]);

    return {
      type: "fragments",
      itemId: item.id,
      prompt: { kind: "image", image: item.promptImage },
      answer: item.answerText,
      answerNorm: normalizeAnswer(item.answerText),
      slots,
      fragments: parts,
      options: shuffle(finalOptions)
    };
  }

  return null;
}

export function renderFragments(q, onDone){
  const filled = [];
  const used = new Array(q.options.length).fill(false);

  const prompt = h("div", { class:"prompt" },
    h("img", { src:q.prompt.image, alt:"" })
  );

  const slots = h("div", { class:"slotRow" }, q.slots.map(s =>
    s.type === "gap" ? h("div", { class:"slotGap" }, " ") : h("div", { class:"slot" }, "_")
  ));
  const tilesRow = h("div", { class:"tileRow" });
  const result = h("div", { class:"sub", style:"text-align:center;min-height:18px;" }, "");

  function renderTiles(){
    tilesRow.innerHTML = "";
    q.options.forEach((ch, idx)=>{
      const b = h("button", { class:"tile", onclick: ()=>tap(idx), disabled: used[idx] }, ch);
      tilesRow.appendChild(b);
    });
    tilesRow.appendChild(h("button", { class:"tile", onclick: back }, "Back" ));
  }

  function renderSlots(){
    let fi = 0;
    [...slots.children].forEach((el, i)=>{
      if (q.slots[i].type === "gap") return;
      el.textContent = filled[fi] || "_";
      el.style.color = filled[fi] ? "var(--fg)" : "var(--muted)";
      fi += 1;
    });
  }

  function tap(idx){
    if (used[idx]) return;
    if (filled.length >= q.fragments.length) return;
    used[idx]=true;
    filled.push(q.options[idx]);
    renderTiles(); renderSlots();
    if (filled.length === q.fragments.length) finish();
  }

  function back(){
    if (!filled.length) return;
    const ch = filled.pop();
    for (let i=q.options.length-1;i>=0;i--){
      if (used[i] && q.options[i] === ch) { used[i]=false; break; }
    }
    renderTiles(); renderSlots();
  }

  function finish(){
    tilesRow.querySelectorAll("button").forEach(b => b.disabled = true);
    const got = filled.join(" ").trim().toLowerCase();
    const want = String(q.answerNorm || "").toLowerCase();
    const correct = got === want;
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
