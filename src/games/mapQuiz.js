import { h, clamp } from "../ui.js";
import { getFeatureForItem } from "../mapData.js";

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

function itemsWithFeature(items, mapData){
  return items.filter(it => !!getFeatureForItem(mapData, it));
}

export function pickMapName(items, mapData, opts=null){
  const correctPool = itemsWithFeature(opts?.correctPool || items, mapData)
    .filter(it => !!it.answerText);
  const optionPool = itemsWithFeature(opts?.optionPool || items, mapData)
    .filter(it => !!it.answerText);
  if (!correctPool.length) return null;

  for (let tries=0; tries<30; tries++){
    const correct = correctPool[Math.floor(Math.random()*correctPool.length)];
    const feature = getFeatureForItem(mapData, correct);
    if (!feature) continue;
    const candidates = shuffle(optionPool.filter(it => it.id !== correct.id));
    const uniq = takeUniqueItems([correct, ...candidates], it => normText(it.answerText), 4);
    if (uniq.length < 4) continue;

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
      type:"map",
      variant:"name",
      itemId: correct.id,
      feature,
      mapData,
      options
    };
  }
  return null;
}

export function pickMapFlag(items, mapData, opts=null){
  const correctPool = itemsWithFeature(opts?.correctPool || items, mapData)
    .filter(it => !!it.promptImage);
  const optionPool = itemsWithFeature(opts?.optionPool || items, mapData)
    .filter(it => !!it.promptImage);
  if (!correctPool.length) return null;

  for (let tries=0; tries<30; tries++){
    const correct = correctPool[Math.floor(Math.random()*correctPool.length)];
    const feature = getFeatureForItem(mapData, correct);
    if (!feature) continue;
    const candidates = shuffle(optionPool.filter(it => it.id !== correct.id));
    const uniq = takeUniqueItems([correct, ...candidates], it => imageKey(it.promptImage), 4);
    if (uniq.length < 4) continue;

    const options = shuffle(uniq.map(it => ({
      kind:"image",
      text: null,
      image: it.promptImage,
      isCorrect: it.id === correct.id,
      itemId: it.id
    })));
    if (!options.some(o=>o.isCorrect)) continue;
    if (!assertUniqueOptions(options)) continue;

    return {
      type:"map",
      variant:"flag",
      itemId: correct.id,
      feature,
      mapData,
      options
    };
  }
  return null;
}

function drawFeaturePath(ctx, polygons){
  for (const poly of polygons){
    for (const ring of poly){
      if (!ring.length) continue;
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i=1; i<ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.closePath();
    }
  }
}

function renderMap(mapData, highlightFeature){
  const wrap = h("div", { class:"mapWrap" });
  const canvas = h("canvas", { class:"mapCanvas" });
  wrap.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const state = {
    dragging: false,
    lastX: 0,
    lastY: 0,
    scale: 1,
    minScale: 1,
    maxScale: 10,
    tx: 0,
    ty: 0,
    viewW: 1,
    viewH: 1,
    dpr: window.devicePixelRatio || 1,
    inited: false
  };

  const { bbox, features, featureToPaths } = mapData.prepared;

  function initTransform(){
    const mapW = bbox.maxX - bbox.minX;
    const mapH = bbox.maxY - bbox.minY;
    const pad = 12;
    const scale = Math.min((state.viewW - pad * 2) / mapW, (state.viewH - pad * 2) / mapH);
    const safeScale = Number.isFinite(scale) ? scale : 1;
    state.scale = safeScale;
    state.minScale = safeScale * 0.6;
    state.maxScale = safeScale * 8;
    state.tx = (state.viewW - mapW * state.scale) / 2 - bbox.minX * state.scale;
    state.ty = (state.viewH - mapH * state.scale) / 2 - bbox.minY * state.scale;
    state.inited = true;
  }

  function draw(){
    if (!ctx) return;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.viewW, state.viewH);

    ctx.translate(state.tx, state.ty);
    ctx.scale(state.scale, state.scale);

    const strokeBase = "rgba(255,255,255,0.28)";
    const highlight = "#b000ff";
    const lineWidth = 1 / state.scale;

    for (const entry of features){
      const polys = entry.polygons;
      const isHighlight = entry.feature === highlightFeature;
      ctx.beginPath();
      drawFeaturePath(ctx, polys);
      if (isHighlight){
        ctx.fillStyle = highlight;
        ctx.fill("evenodd");
        ctx.lineWidth = Math.max(lineWidth * 1.4, 0.6 / state.scale);
        ctx.strokeStyle = highlight;
        ctx.stroke();
      } else {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = strokeBase;
        ctx.stroke();
      }
    }
  }

  function resize(){
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    state.viewW = w;
    state.viewH = h;
    state.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * state.dpr);
    canvas.height = Math.floor(h * state.dpr);
    if (!state.inited) initTransform();
    draw();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(wrap);
  setTimeout(resize, 0);

  function onPointerDown(e){
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e){
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.tx += dx;
    state.ty += dy;
    draw();
  }

  function onPointerUp(e){
    state.dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  }

  function onWheel(e){
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const scaleBy = e.deltaY < 0 ? 1.12 : 0.9;
    const newScale = clamp(state.scale * scaleBy, state.minScale, state.maxScale);
    const k = newScale / state.scale;
    state.tx = cx - (cx - state.tx) * k;
    state.ty = cy - (cy - state.ty) * k;
    state.scale = newScale;
    draw();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive:false });

  return wrap;
}

export function renderMapQuiz(q, onDone){
  const mapNode = renderMap(q.mapData, q.feature);

  const opts = h("div", { class:"grid2" }, q.options.map((o) => {
    const node = h("button", { class:"opt", onclick: ()=>choose(o, node) },
      o.kind === "text" ? o.text : h("img", { src:o.image, alt:"" })
    );
    return node;
  }));

  function choose(opt, node){
    opts.querySelectorAll("button").forEach(b => b.disabled = true);
    node.classList.add(opt.isCorrect ? "good" : "bad");

    const correctIdx = q.options.findIndex(o => o.isCorrect);
    if (correctIdx >= 0) opts.children[correctIdx].classList.add("good");

    setTimeout(()=> onDone({ correct: !!opt.isCorrect, itemId: q.itemId, meta:{ variant: q.variant } }), 900);
  }

  return h("div", { class:"practice" }, mapNode, opts);
}
