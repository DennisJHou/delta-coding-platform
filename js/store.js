/* =============================================================================
 * store.js — storage abstraction (the ONLY module that touches persistence)
 * -----------------------------------------------------------------------------
 * Today: browser localStorage, namespaced per coder. Each coder's labels live
 * only in their own browser — which is exactly right for blind inter-rater
 * coding. Merge happens at analysis time via export/import.
 *
 * To move to a shared backend (Supabase, etc.) later, reimplement this module's
 * public API (getLabel/setLabel/allLabels/...) against the DB. No other file
 * references localStorage.
 *
 * Label record shape:  { sentiment: -3..3|null, arousal: -3..3|null,
 *                        regulation_strategy: str|null, empathy_type: str|null,
 *                        _ts: epoch_ms }
 * Fields are independent and optional — a record missing a given field key
 * (e.g. older labels saved before "arousal" existed) just means that field is
 * unlabeled for that cell, not an invalid record. Keyed by:
 *                        coder -> `${session_id}#${exchange_index}`
 * ========================================================================== */

const Store = (() => {
  const P = window.APP_CONFIG.storage_prefix;
  const K = {
    ann: (coder) => `${P}:ann:${coder}`,
    settings: `${P}:settings`,
    activeCoder: `${P}:activeCoder`,
  };

  const read = (k, fallback) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch (_) { return fallback; }
  };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const cellKey = (sessionId, index) => `${sessionId}#${index}`;

  /* ---- active coder identity ------------------------------------------- */
  function activeCoder() {
    return read(K.activeCoder, null) || window.CODING_SCHEME.coders[0];
  }
  function setActiveCoder(name) { write(K.activeCoder, name); }

  /* ---- per-cell labels -------------------------------------------------- */
  function allLabels(coder) { return read(K.ann(coder), {}); }

  function getLabel(coder, sessionId, index) {
    return allLabels(coder)[cellKey(sessionId, index)] || null;
  }

  /** Merge a partial label patch into a cell. Pass value=undefined to leave a
   *  field untouched; pass null to clear it. Returns the merged record. */
  function setLabel(coder, sessionId, index, patch) {
    const map = allLabels(coder);
    const key = cellKey(sessionId, index);
    const rec = Object.assign({}, map[key]);
    for (const [f, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (v === null) delete rec[f]; else rec[f] = v;
    }
    const hasData = Object.keys(rec).some((f) => f !== "_ts");
    if (hasData) { rec._ts = Date.now(); map[key] = rec; }
    else { delete map[key]; }
    write(K.ann(coder), map);
    return map[key] || null;
  }

  /** How many cells this coder has any label on (for progress display). */
  function countLabeled(coder, sessionIdPrefix) {
    const map = allLabels(coder);
    let n = 0;
    for (const k of Object.keys(map)) {
      if (!sessionIdPrefix || k.startsWith(sessionIdPrefix)) n++;
    }
    return n;
  }

  /* ---- bulk import / replace (for merging coders + AI output) ----------- */
  function replaceLabels(coder, map) { write(K.ann(coder), map || {}); }
  function mergeLabels(coder, map) {
    const cur = allLabels(coder);
    Object.assign(cur, map || {});
    write(K.ann(coder), cur);
  }
  function clearLabels(coder) { localStorage.removeItem(K.ann(coder)); }

  /* ---- settings (provider, model, api key, options) --------------------- */
  const defaultSettings = () => ({
    provider: window.APP_CONFIG.default_provider,
    model: window.APP_CONFIG.providers[window.APP_CONFIG.default_provider].models[0].id,
    apiKey: "",
    rememberKey: false,
    concurrency: 3,
  });
  function getSettings() { return Object.assign(defaultSettings(), read(K.settings, {})); }
  function setSettings(patch) {
    const s = Object.assign(getSettings(), patch);
    const toStore = Object.assign({}, s);
    if (!s.rememberKey) toStore.apiKey = "";   // don't persist key unless asked
    write(K.settings, toStore);
    return s;
  }

  return {
    cellKey, activeCoder, setActiveCoder,
    allLabels, getLabel, setLabel, countLabeled,
    replaceLabels, mergeLabels, clearLabels,
    getSettings, setSettings,
  };
})();

window.Store = Store;
