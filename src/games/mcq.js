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
  return (s||"")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function imageKey(dataUrl){
  const s = String(dataUrl||"");
  // cheap stable-ish key to prevent duplicates in options
  return s.slice(0, 120) + "|" + s.length;
}

function takeUniqueItems(items, keyFn, limit){
  const out = [];
  const seen = new Set();
  for (const it of items){
    const k = keyFn(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

function assertUniqueOptions(options){
  const keys = new Set();
  for (const o of options){
    const k = o.kind === "text" ? ("t:"+normText(o.text)) : ("i:"+imageKey(o.image));
    if (keys.has(k)) return false;
    keys.add(k);
  }
  return true;
}

// opts: { correctPool?:Item[], optionPool?:Item[] }
export function pickMcq(items, variant, opts = null){
  const correctPool = (opts?.correctPool || items);
  const optionPool  = (opts?.optionPool  || items);

  if (variant === "textToImage"){
    const cp = correctPool.filter(it => !!it.promptText && !!it.answerImage);
    const op = optionPool.filter(it => !!it.answerImage);
    if (cp.length < 1) return null;

    for (let tries=0; tries<30; tries++){
      const correct = cp[Math.floor(Math.random()*cp.length)];
      const candidates = shuffle(op.filter(it => it.id !== correct.id));
      const uniq = takeUniqueItems([correct, ...candidates], it => imageKey(it.answerImage), 4);
      if (uniq.length < 2) continue;

      const options = shuffle(uniq.map(it => ({
        kind:"image",
        image: it.answerImage,
        text: null,
        isCorrect: it.id === correct.id,
        itemId: it.id
      })));
      if (!options.some(o=>o.isCorrect)) continue;
      if (!assertUniqueOptions(options)) continue;

      return {
        type:"mcq",
        variant,
        itemId: correct.id,
        prompt: { kind:"text", text: correct.promptText, image:null },
        options
      };
    }
    return null;
  }

  if (variant === "imageToText"){
    const cp = correctPool.filter(it => !!it.promptImage && !!it.answerText);
    const op = optionPool.filter(it => !!it.answerText);
    if (cp.length < 1) return null;

    for (let tries=0; tries<30; tries++){
      const correct = cp[Math.floor(Math.random()*cp.length)];
      const candidates = shuffle(op.filter(it => it.id !== correct.id));
      const uniq = takeUniqueItems([correct, ...candidates], it => normText(it.answerText), 4);
      if (uniq.length < 2) continue;

      const options = shuffle(uniq.map(it => ({
        kind:"text",
        text: it.answerText,
        image: null,
        isCorrect: it.id === correct.id,
        itemId: it.id
      })));
      if (!options.some(o=>o.isCorrect)) continue;
      if (!assertUniqueOptions(options)) continue;

      return {
        type:"mcq",
        variant,
        itemId: correct.id,
        prompt: { kind:"image", text:null, image: correct.promptImage },
        options
      };
    }
    return null;
  }

  if (variant === "textToText"){
    const cp = correctPool.filter(it => !!it.promptText && !!it.answerText && normText(it.promptText) !== normText(it.answerText));
    const op = optionPool.filter(it => !!it.answerText);
    if (cp.length < 1) return null;

    for (let tries=0; tries<30; tries++){
      const correct = cp[Math.floor(Math.random()*cp.length)];
      const candidates = shuffle(op.filter(it => it.id !== correct.id));
      const uniq = takeUniqueItems([correct, ...candidates], it => normText(it.answerText), 4);
      if (uniq.length < 2) continue;

      const options = shuffle(uniq.map(it => ({
        kind:"text",
        text: it.answerText,
        image: null,
        isCorrect: it.id === correct.id,
        itemId: it.id
      })));
      if (!options.some(o=>o.isCorrect)) continue;
      if (!assertUniqueOptions(options)) continue;

      return {
        type:"mcq",
        variant,
        itemId: correct.id,
        prompt: { kind:"text", text: correct.promptText, image:null },
        options
      };
    }
    return null;
  }

  if (variant === "textToPrompt"){
    const cp = correctPool.filter(it => !!it.promptText && !!it.answerText && normText(it.promptText) !== normText(it.answerText));
    const op = optionPool.filter(it => !!it.promptText);
    if (cp.length < 1) return null;

    for (let tries=0; tries<30; tries++){
      const correct = cp[Math.floor(Math.random()*cp.length)];
      const candidates = shuffle(op.filter(it => it.id !== correct.id));
      const uniq = takeUniqueItems([correct, ...candidates], it => normText(it.promptText), 4);
      if (uniq.length < 2) continue;

      const options = shuffle(uniq.map(it => ({
        kind:"text",
        text: it.promptText,
        image: null,
        isCorrect: it.id === correct.id,
        itemId: it.id
      })));
      if (!options.some(o=>o.isCorrect)) continue;
      if (!assertUniqueOptions(options)) continue;

      return {
        type:"mcq",
        variant,
        itemId: correct.id,
        prompt: { kind:"text", text: correct.answerText, image:null },
        options
      };
    }
    return null;
  }

  return null;
}

export function renderMcq(q, onDone){
  const isSymbol = q.prompt.kind === "text" && q.prompt.text && q.prompt.text.length <= 5;
  const prompt = h("div", { class: isSymbol ? "prompt symbol" : "prompt" },
    q.prompt.kind === "text" ? q.prompt.text :
    h("img", { src: q.prompt.image, alt:"" })
  );

  const opts = h("div", { class:"grid2" }, q.options.map((o) => {
    const isOptSymbol = o.kind === "text" && o.text && o.text.length <= 5;
    const node = h("button", { class: isOptSymbol ? "opt symbol" : "opt", onclick: ()=>choose(o, node) },
      o.kind === "text" ? o.text : h("img", { src:o.image, alt:"" })
    );
    return node;
  }));

  function choose(opt, node){
    // lock
    opts.querySelectorAll("button").forEach(b => b.disabled = true);
    node.classList.add(opt.isCorrect ? "good" : "bad");

    // also mark correct
    const correctIdx = q.options.findIndex(o => o.isCorrect);
    if (correctIdx >= 0) opts.children[correctIdx].classList.add("good");

    setTimeout(()=> onDone({ correct: !!opt.isCorrect, itemId: q.itemId, meta:{ variant: q.variant } }), 900);
  }

  return h("div", { class:"practice" }, prompt, opts);
}
