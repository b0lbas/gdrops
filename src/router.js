export function parseHash() {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const [pathPart, queryPart] = raw.split("?");
  const path = (pathPart || "/").replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(queryPart || "");
  return { path, query };
}

export function nav(path, queryObj=null, replace=false) {
  let hash = "#" + (path.startsWith("/") ? path : "/" + path);
  if (queryObj) {
    const q = new URLSearchParams(queryObj);
    const s = q.toString();
    if (s) hash += "?" + s;
  }
  if (replace) location.replace(hash);
  else location.hash = hash;
}

export function routeMatch(path, pattern) {
  // pattern: /quiz/:id/edit
  const p = path.split("/").filter(Boolean);
  const r = pattern.split("/").filter(Boolean);
  if (p.length !== r.length) return null;
  const params = {};
  for (let i=0;i<r.length;i++){
    const seg = r[i];
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(p[i]);
    else if (seg !== p[i]) return null;
  }
  return params;
}
