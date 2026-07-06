/* =============================================================================
 * util.js — tiny DOM + formatting helpers (no framework, no build step).
 * ========================================================================== */

/** el("div.klass#id", {onclick, title, ...}, [children|string])
 *  el("div.klass", [children]) is also accepted (props is never legitimately
 *  an array, so an array in the props slot is treated as children). */
function el(spec, props, children) {
  if (Array.isArray(props)) { children = props; props = null; }
  const m = spec.match(/^([a-z0-9]+)?(.*)$/i);
  const tag = m[1] || "div";
  const node = document.createElement(tag);
  const rest = m[2] || "";
  const idm = rest.match(/#([\w-]+)/);
  if (idm) node.id = idm[1];
  const classes = (rest.match(/\.([\w-]+)/g) || []).map((c) => c.slice(1));
  if (classes.length) node.className = classes.join(" ");
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null) continue;
      if (k === "class") node.className = (node.className + " " + v).trim();
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k === "dataset") Object.assign(node.dataset, v);
      else if (k.startsWith("on") && typeof v === "function")
        node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in node) { try { node[k] = v; } catch (_) { node.setAttribute(k, v); } }
      else node.setAttribute(k, v);
    }
  }
  const kids = children == null ? [] : Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" || typeof c === "number"
      ? document.createTextNode(String(c)) : c);
  }
  return node;
}

const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

const fmtNum = (v, d = 2) => (v == null || Number.isNaN(v) ? "—" : (+v).toFixed(d));

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const downloadText = (filename, text, mime = "text/plain") =>
  downloadBlob(filename, new Blob([text], { type: mime + ";charset=utf-8" }));

/** Read a user-picked file as text (for import). */
function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = el("input", { type: "file", accept, style: "display:none" });
    inp.addEventListener("change", () => {
      const f = inp.files[0];
      if (!f) return resolve(null);
      const rd = new FileReader();
      rd.onload = () => resolve({ name: f.name, text: rd.result });
      rd.readAsText(f);
    });
    document.body.appendChild(inp); inp.click(); inp.remove();
  });
}

function toast(msg, kind = "info") {
  const t = el("div.toast." + kind, { text: msg });
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
}

window.el = el; window.clear = clear; window.fmtNum = fmtNum;
window.downloadText = downloadText; window.downloadBlob = downloadBlob;
window.pickFile = pickFile; window.toast = toast;
