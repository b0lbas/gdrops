import { h } from "../ui.js";

const SVG_NS = "http://www.w3.org/2000/svg";
let _mapPromise = null;
let _mapData = null;

function svgEl(tag, attrs = null, ...children){
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs){
    for (const [k, v] of Object.entries(attrs)){
      if (v === false || v === null || v === undefined) continue;
      el.setAttribute(k, String(v));
    }
  }
  for (const ch of children.flat()){
    if (ch === null || ch === undefined || ch === false) continue;
    if (typeof ch === "string" || typeof ch === "number") el.appendChild(document.createTextNode(String(ch)));
    else el.appendChild(ch);
  }
  return el;
}

function normName(s){
  return String(s||"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const alias = new Map([
  ["seville", "sevilla"],
  ["balearic islands", "illes balears"],
  ["biscay", "vizcaya"],
  ["gipuzkoa", "gipuzkoa"],
  ["navarre", "navarra"],
  ["a coruna", "a coruna"],
  ["alava", "alava"],
  ["leon", "leon"],
  ["lleida", "lerida"],
  ["girona", "gerona"],
  ["castellon", "castellon"],
  ["la rioja", "la rioja"],
  ["cadiz", "cadiz"],
  ["cordoba", "cordoba"],
  ["malaga", "malaga"],
  ["jaen", "jaen"],
  ["almeria", "almeria"],
  ["avila", "avila"],
  ["guipuzcoa", "gipuzkoa"],
  ["bizkaia", "vizcaya"],
  ["illes balears", "illes balears"],
  ["santa cruz de tenerife", "santa cruz de tenerife"],
  ["las palmas", "las palmas"],
  ["valencia", "valencia"],
  ["castellon", "castellon"],
  ["alicante", "alicante"],
  ["madrid", "madrid"],
  ["murcia", "murcia"],
  ["zaragoza", "zaragoza"],
  ["huesca", "huesca"],
  ["teruel", "teruel"],
  ["barcelona", "barcelona"],
  ["tarragona", "tarragona"],
  ["pontevedra", "pontevedra"],
  ["ourense", "ourense"],
  ["lugo", "lugo"],
  ["salamanca", "salamanca"],
  ["segovia", "segovia"],
  ["soria", "soria"],
  ["valladolid", "valladolid"],
  ["zamora", "zamora"],
  ["badajoz", "badajoz"],
  ["caceres", "caceres"],
  ["guadalajara", "guadalajara"],
  ["cuenca", "cuenca"],
  ["toledo", "toledo"],
  ["albacete", "albacete"],
  ["ciudad real", "ciudad real"]
]);

function normalizeKey(name){
  const key = normName(name);
  return alias.get(key) || key;
}

function eachCoord(geom, fn){
  const t = geom.type;
  if (t === "Polygon"){
    for (const ring of geom.coordinates){
      for (const c of ring) fn(c);
    }
  } else if (t === "MultiPolygon"){
    for (const poly of geom.coordinates){
      for (const ring of poly){
        for (const c of ring) fn(c);
      }
    }
  }
}

function bounds(features){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features){
    eachCoord(f.geometry, ([x, y])=>{
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  }
  return { minX, minY, maxX, maxY };
}

function projectFn(b, w, h){
  const dx = b.maxX - b.minX;
  const dy = b.maxY - b.minY;
  return ([x, y])=>{
    const px = ((x - b.minX) / dx) * w;
    const py = ((b.maxY - y) / dy) * h;
    return [px, py];
  };
}

function pathForFeature(feature, project){
  const geom = feature.geometry;
  let d = "";
  if (geom.type === "Polygon"){
    for (const ring of geom.coordinates){
      d += ringToPath(ring, project);
    }
  } else if (geom.type === "MultiPolygon"){
    for (const poly of geom.coordinates){
      for (const ring of poly){
        d += ringToPath(ring, project);
      }
    }
  }
  return d.trim();
}

function ringToPath(ring, project){
  if (!ring.length) return "";
  const [sx, sy] = project(ring[0]);
  let d = `M ${sx.toFixed(2)} ${sy.toFixed(2)}`;
  for (let i=1; i<ring.length; i++){
    const [x, y] = project(ring[i]);
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  d += " Z ";
  return d;
}

async function loadMap(){
  if (_mapData) return _mapData;
  if (_mapPromise) return _mapPromise;
  _mapPromise = fetch("/spain-provinces.geojson")
    .then(r => r.json())
    .then(data => {
      const features = data.features || [];
      const b = bounds(features);
      const w = 1000;
      const h = 720;
      const project = projectFn(b, w, h);

      const paths = [];
      const byKey = new Map();
      for (const f of features){
        const name = f?.properties?.name || "";
        const segments = String(name).split("/");
        const d = pathForFeature(f, project);
        const entry = { name, d };
        paths.push(entry);
        for (const seg of segments){
          const k = normalizeKey(seg);
          if (!byKey.has(k)) byKey.set(k, entry);
        }
      }
      _mapData = { paths, byKey, viewBox: `0 0 ${w} ${h}` };
      return _mapData;
    })
    .catch(()=>{
      _mapData = { paths: [], byKey: new Map(), viewBox: "0 0 1000 720" };
      return _mapData;
    });
  return _mapPromise;
}

export async function preloadMap(){
  await loadMap();
}

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function imageForItem(it){
  return it.answerImage || it.promptImage || null;
}

function pickUnique(items, keyFn, limit){
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

export function pickMapMcq(items, opts = null){
  const correctPool = (opts?.correctPool || items);
  const optionPool  = (opts?.optionPool || items);

  const cp = correctPool.filter(it => {
    const name = it.answerText || it.promptText;
    if (!name) return false;
    if (!_mapData) return true;
    return _mapData.byKey.has(normalizeKey(name));
  });
  if (!cp.length) return null;

  const useImageOptions = optionPool.filter(it => !!imageForItem(it)).length >= 4 && Math.random() < 0.5;

  for (let tries=0; tries<30; tries++){
    const correct = cp[Math.floor(Math.random()*cp.length)];
    const name = correct.answerText || correct.promptText;
    if (!name) continue;

    const candidates = shuffle(optionPool.filter(it => it.id !== correct.id));
    let uniq;
    if (useImageOptions){
      const op = optionPool.filter(it => !!imageForItem(it));
      uniq = pickUnique([correct, ...shuffle(op.filter(it => it.id !== correct.id))], it => String(imageForItem(it)), 4);
    } else {
      uniq = pickUnique([correct, ...candidates], it => String(it.answerText || it.promptText), 4);
    }
    if (uniq.length < 2) continue;

    const options = shuffle(uniq.map(it => ({
      kind: useImageOptions ? "image" : "text",
      text: useImageOptions ? null : (it.answerText || it.promptText),
      image: useImageOptions ? imageForItem(it) : null,
      isCorrect: it.id === correct.id,
      itemId: it.id
    })));

    return {
      type: "mapmcq",
      itemId: correct.id,
      targetName: name,
      options
    };
  }

  return null;
}

export function renderMapMcq(q, onDone){
  const wrap = h("div", { class:"practice" });
  const mapHost = h("div", { class:"mapWrap" });
  mapHost.appendChild(h("div", { class:"sub", style:"text-align:center;" }, "map"));
  wrap.appendChild(mapHost);

  const opts = h("div", { class:"grid2" }, q.options.map((o) => {
    const node = h("button", { class:"opt", onclick: ()=>choose(o, node) },
      o.kind === "text" ? o.text : h("img", { src:o.image, alt:"" })
    );
    return node;
  }));
  wrap.appendChild(opts);

  let mapReady = false;
  loadMap().then(data => {
    if (!data || !data.paths.length) return;
    const key = normalizeKey(q.targetName);
    const hit = data.byKey.get(key);
    const svg = svgEl("svg", { class:"mapSvg", viewBox: data.viewBox, preserveAspectRatio:"xMidYMid meet" });
    for (const p of data.paths){
      const cls = (hit && p.d === hit.d) ? "mapPath active" : "mapPath";
      svg.appendChild(svgEl("path", { d: p.d, class: cls }));
    }
    mapHost.innerHTML = "";
    mapHost.appendChild(svg);
    mapReady = true;
  });

  function choose(opt, node){
    if (!mapReady) return;
    opts.querySelectorAll("button").forEach(b => b.disabled = true);
    node.classList.add(opt.isCorrect ? "good" : "bad");
    const correctIdx = q.options.findIndex(o => o.isCorrect);
    if (correctIdx >= 0) opts.children[correctIdx].classList.add("good");
    setTimeout(()=> onDone({ correct: !!opt.isCorrect, itemId: q.itemId, meta:{ map:true } }), 900);
  }

  return wrap;
}
