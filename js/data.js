/* =============================================================================
 * data.js — loads the dialogue corpus (manifest + per-study JSON), caches it.
 * ========================================================================== */

const Data = (() => {
  let manifest = null;
  const studies = {};        // key -> {dialogues:[...], byId:{...}}

  async function fetchEncrypted(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`${path} not found — run tools/build_data.py then tools/encrypt_data.js`);
    const payload = await r.json();
    const text = await CryptoUtil.decryptWithKey(payload, Auth.getKey());
    return JSON.parse(text);
  }

  async function loadManifest() {
    if (manifest) return manifest;
    manifest = await fetchEncrypted("data/manifest.enc.json");
    return manifest;
  }

  async function loadStudy(key) {
    if (studies[key]) return studies[key];
    const m = await loadManifest();
    const entry = m.studies.find((s) => s.key === key);
    if (!entry) throw new Error("unknown study " + key);
    const encFile = entry.file.replace(/\.json$/, ".enc.json");
    const json = await fetchEncrypted(encFile);
    const byId = Object.fromEntries(json.dialogues.map((d) => [d.session_id, d]));
    studies[key] = { entry, dialogues: json.dialogues, byId };
    return studies[key];
  }

  async function getDialogue(studyKey, sessionId) {
    const s = await loadStudy(studyKey);
    return s.byId[sessionId];
  }

  /** Flat list of every exchange across a study, for AI runs / analytics. */
  async function allExchanges(studyKey) {
    const s = await loadStudy(studyKey);
    const out = [];
    for (const d of s.dialogues) {
      for (const e of d.exchanges) {
        out.push({ session_id: d.session_id, study: d.study, pid: d.pid,
                   index: e.index, user_text: e.user_text, bot_text: e.bot_text,
                   orig_rating: e.orig_rating, meta: e.meta, dialogue_meta: d.meta });
      }
    }
    return out;
  }

  return { loadManifest, loadStudy, getDialogue, allExchanges };
})();

window.Data = Data;
