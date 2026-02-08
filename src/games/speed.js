import { h } from "../ui.js";
import { pickMcq, renderMcq } from "./mcq.js";

// opts forwarded to pickMcq
export function pickSpeed(items, opts=null){
  // prefer imageToText then textToImage
  const q = pickMcq(items, "imageToText", opts) || pickMcq(items, "textToImage", opts);
  if (!q) return null;
  return { ...q, type:"speed" };
}

export function renderSpeed(q, onDone, seconds=3.5){
  let done = false;
  let left = seconds;
  const label = h("div", { class:"sub" }, left.toFixed(1));
  const head = h("div", { class:"row", style:"justify-content:space-between;align-items:center;" }, h("div",{class:"sub"},"speed"), label);

  const body = renderMcq(q, (res)=>{
    if (done) return;
    done = true;
    clearInterval(tick);
    onDone(res);
  });

  const tick = setInterval(()=>{
    left = Math.max(0, left - 0.1);
    label.textContent = left.toFixed(1);
    if (left <= 0 && !done){
      done = true;
      clearInterval(tick);
      // timeout => incorrect
      onDone({ correct:false, itemId:q.itemId, meta:{ timeout:true, variant:q.variant } });
    }
  }, 100);

  return h("div", { class:"practice" }, head, body);
}
