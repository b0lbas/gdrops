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

function promptKinds(it){
  const kinds = [];
  if (it.promptImage && it.answerText) kinds.push("image_text");
  if (it.promptText && it.answerImage) kinds.push("text_image");
  if (it.promptText && it.answerText && normText(it.promptText) !== normText(it.answerText)) kinds.push("text_text");
  if (it.promptImage && it.answerImage) kinds.push("image_image");
  return kinds;
}

function buildQA(it, kind){
  if (kind === "image_text"){
    return {
      prompt: { kind:"image", image: it.promptImage, text:null },
      answer: { kind:"text", image:null, text: it.answerText }
    };
  }
  if (kind === "text_image"){
    return {
      prompt: { kind:"text", image:null, text: it.promptText },
      answer: { kind:"image", image: it.answerImage, text:null }
    };
  }
  if (kind === "text_text"){
    return {
      prompt: { kind:"text", image:null, text: it.promptText },
      answer: { kind:"text", image:null, text: it.answerText }
    };
  }
  return {
    prompt: { kind:"image", image: it.promptImage, text:null },
    answer: { kind:"image", image: it.answerImage, text:null }
  };
}

export function pickTrueFalse(items, opts=null){
  const correctPool = opts?.correctPool || items;
  const optionPool = opts?.optionPool || items;
  const base = correctPool.filter(it => (it.promptText || it.promptImage) && (it.answerText || it.answerImage));
  if (!base.length) return null;

  for (let tries=0; tries<40; tries++){
    const correct = base[Math.floor(Math.random()*base.length)];
    const kinds = promptKinds(correct);
    if (!kinds.length) continue;
    const kind = kinds[Math.floor(Math.random()*kinds.length)];
    const qa = buildQA(correct, kind);

    const isTrue = Math.random() < 0.5;
    if (isTrue){
      return { type:"truefalse", itemId: correct.id, prompt: qa.prompt, answer: qa.answer, isTrue };
    }

    const pool = shuffle(optionPool.filter(it => it.id !== correct.id));
    let wrong = null;
    for (const it of pool){
      if (kind === "image_text" && it.answerText) { wrong = it; break; }
      if (kind === "text_image" && it.answerImage) { wrong = it; break; }
      if (kind === "text_text" && it.answerText) { wrong = it; break; }
      if (kind === "image_image" && it.answerImage) { wrong = it; break; }
    }
    if (!wrong) continue;

    const wrongQA = buildQA(wrong, kind);
    return { type:"truefalse", itemId: correct.id, prompt: qa.prompt, answer: wrongQA.answer, isTrue:false };
  }

  return null;
}

export function renderTrueFalse(q, onDone){
  const prompt = h("div", { class:"prompt" },
    q.prompt.kind === "text" ? q.prompt.text : h("img", { src:q.prompt.image, alt:"" })
  );

  const answer = h("div", { class:"prompt" },
    q.answer.kind === "text" ? q.answer.text : h("img", { src:q.answer.image, alt:"" })
  );

  const btnRow = h("div", { class:"row", style:"justify-content:center;" },
    h("button", { class:"opt", onclick: ()=>choose(true) }, "V"),
    h("button", { class:"opt", onclick: ()=>choose(false) }, "X")
  );

  function choose(v){
    btnRow.querySelectorAll("button").forEach(b => b.disabled = true);
    const correct = v === q.isTrue;
    const btns = btnRow.querySelectorAll("button");
    if (correct){
      btns[v ? 0 : 1].classList.add("good");
    } else {
      btns[v ? 0 : 1].classList.add("bad");
      btns[q.isTrue ? 0 : 1].classList.add("good");
    }
    setTimeout(()=> onDone({ correct, itemId:q.itemId, meta:{ isTrue:q.isTrue } }), 900);
  }

  return h("div", { class:"practice" }, prompt, answer, btnRow);
}
