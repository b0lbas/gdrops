export function h(tag, attrs = null, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === false || v === null || v === undefined) continue;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const ch of children.flat()) {
    if (ch === null || ch === undefined || ch === false) continue;
    if (typeof ch === "string" || typeof ch === "number") el.appendChild(document.createTextNode(String(ch)));
    else el.appendChild(ch);
  }
  return el;
}

export function mount(root, node) {
  root.innerHTML = "";
  root.appendChild(node);
}

export function btn(label, onClick, kind = "btn primary") {
  return h("button", { class: kind, onclick: onClick }, label);
}

export function iconBtn(label, onClick, kind="btn") {
  return h("button", { class: kind, onclick: onClick, title: label, "aria-label": label }, label);
}

export function input(value, onInput, placeholder="") {
  return h("input", { class: "input", value, placeholder, oninput: (e) => onInput(e.target.value) });
}

export function textarea(value, onInput, placeholder="") {
  return h("textarea", { class: "textarea", placeholder, oninput: (e) => onInput(e.target.value) }, value ?? "");
}

export function select(options, value, onChange) {
  const el = h("select", { class: "select", onchange: (e) => onChange(e.target.value) },
    options.map(o => h("option", { value: o.value, selected: o.value === value }, o.label))
  );
  return el;
}

export function filePicker(onFile, accept="image/*") {
  const inp = h("input", { type: "file", accept, class: "input" });
  inp.addEventListener("change", async () => {
    const f = inp.files?.[0];
    if (!f) return;
    onFile(f);
    inp.value = "";
  });
  return inp;
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}

export function toast(text, ms=900) {
  const t = h("div", { class:"card", style:"position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99;max-width:min(680px,calc(100% - 28px));" },
    h("div", { class:"sub" }, text)
  );
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), ms);
}

export function modal(contentNode) {
  const back = h("div", { class:"modalBack" });
  const box = h("div", { class:"modal" }, contentNode);
  back.appendChild(box);
  back.addEventListener("click", (e)=>{ if (e.target === back) back.remove(); });
  return { back, close: ()=>back.remove() };
}

export function pillGroup(items, current, onPick) {
  return h("div", { class:"pillrow" }, items.map(it =>
    h("button", { class: "pill" + (it.value===current ? " on" : ""), onclick: ()=>onPick(it.value) }, it.label)
  ));
}

export function fmtPct(n) {
  return Math.round(n * 100) + "%";
}

export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
