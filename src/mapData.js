const GEOJSON_CACHE = new Map();

function slugify(value){
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(s){
  const raw = (s || "").trim().toLowerCase();
  const noDiacritics = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noDiacritics
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function expandNameVariants(name){
  const out = [];
  const raw = String(name || "").trim();
  if (!raw) return out;
  out.push(raw);

  const patterns = [
    /^wojew[oó]dztwo\s+/i,
    /^voivodeship\s+of\s+/i,
    /^canton\s+of\s+/i,
    /^province\s+of\s+/i,
    /^state\s+of\s+/i,
    /^district\s+of\s+/i,
    /^prefecture\s+of\s+/i,
    /^federated\s+state\s+of\s+/i
  ];

  for (const re of patterns){
    if (re.test(raw)) out.push(raw.replace(re, ""));
  }

  return out;
}

function collectNames(feature){
  const props = feature && feature.properties ? feature.properties : {};
  const out = [];
  for (const v of Object.values(props)){
    if (typeof v !== "string" || !v.trim()) continue;
    out.push(...expandNameVariants(v));
  }
  return out;
}

export function geojsonPathForItems(items){
  const sample = items.find(it => it?.tags?.country && it?.tags?.subdivisionType);
  if (!sample) return null;
  const country = String(sample.tags.country || "").toLowerCase();
  const subdivision = slugify(sample.tags.subdivisionType || "");
  if (!country || !subdivision) return null;
  return `/geojson/${country}-${subdivision}.geojson`;
}

function geojsonPathCandidates(items){
  const sample = items.find(it => it?.tags?.country && it?.tags?.subdivisionType);
  if (!sample) return [];
  const country = String(sample.tags.country || "").toLowerCase();
  const subdivision = slugify(sample.tags.subdivisionType || "");
  if (!country || !subdivision) return [];
  return [
    `/geojson/${country}-${subdivision}.geojson`,
    `/${country}-${subdivision}.geojson`
  ];
}

async function fetchGeojson(path){
  if (!path) return null;
  if (GEOJSON_CACHE.has(path)) return GEOJSON_CACHE.get(path);
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const data = await res.json();
    GEOJSON_CACHE.set(path, data);
    return data;
  } catch {
    return null;
  }
}

export function buildFeatureIndex(geojson){
  const index = new Map();
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  for (const f of features){
    const names = collectNames(f);
    for (const n of names){
      const key = normalizeText(n);
      if (!key || index.has(key)) continue;
      index.set(key, f);
    }
  }
  return index;
}

export function findFeatureForItem(item, index){
  const names = [item?.answerText, ...(item?.altAnswers || [])];
  for (const n of names){
    const key = normalizeText(n);
    if (!key) continue;
    const f = index.get(key);
    if (f) return f;
  }
  return null;
}

export function getFeatureForItem(mapData, item){
  if (!mapData || !item) return null;
  if (mapData.itemFeature.has(item.id)) return mapData.itemFeature.get(item.id);
  const f = findFeatureForItem(item, mapData.index);
  if (f) mapData.itemFeature.set(item.id, f);
  return f || null;
}

function projectCoord(coord){
  const lon = Number(coord[0]);
  const lat = Number(coord[1]);
  return [lon, -lat];
}

function addRingPoints(ring, polygon, bbox){
  const out = [];
  for (const pt of ring){
    const [x, y] = projectCoord(pt);
    if (x < bbox.minX) bbox.minX = x;
    if (x > bbox.maxX) bbox.maxX = x;
    if (y < bbox.minY) bbox.minY = y;
    if (y > bbox.maxY) bbox.maxY = y;
    out.push([x, y]);
  }
  polygon.push(out);
}

function geometryToPolygons(geom, bbox){
  const polygons = [];
  if (!geom || !geom.type || !geom.coordinates) return polygons;

  if (geom.type === "Polygon"){
    const poly = [];
    for (const ring of geom.coordinates){
      addRingPoints(ring, poly, bbox);
    }
    polygons.push(poly);
  } else if (geom.type === "MultiPolygon"){
    for (const polyCoords of geom.coordinates){
      const poly = [];
      for (const ring of polyCoords){
        addRingPoints(ring, poly, bbox);
      }
      polygons.push(poly);
    }
  }
  return polygons;
}

export function prepareGeojson(geojson){
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  const bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const prepared = [];
  const featureToPaths = new Map();

  for (const f of features){
    const polys = geometryToPolygons(f.geometry, bbox);
    const entry = { feature: f, polygons: polys };
    prepared.push(entry);
    featureToPaths.set(f, polys);
  }

  if (!Number.isFinite(bbox.minX)){
    bbox.minX = -1; bbox.maxX = 1; bbox.minY = -1; bbox.maxY = 1;
  }

  return { features: prepared, featureToPaths, bbox };
}

export async function loadMapData(items){
  const candidates = geojsonPathCandidates(items);
  if (!candidates.length) return null;

  let geojson = null;
  let path = null;
  for (const p of candidates){
    const data = await fetchGeojson(p);
    if (data) {
      geojson = data;
      path = p;
      break;
    }
  }
  if (!geojson) return null;

  const index = buildFeatureIndex(geojson);
  const prepared = prepareGeojson(geojson);
  const itemFeature = new Map();

  for (const it of items){
    const f = findFeatureForItem(it, index);
    if (f) itemFeature.set(it.id, f);
  }

  if (itemFeature.size < 4) return null;
  return { path, geojson, index, prepared, itemFeature };
}
