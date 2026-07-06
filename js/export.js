/* =============================================================================
 * export.js — export combined results (CSV/XLSX) + share/merge coder labels.
 *   Long (tidy)  : one row per exchange per rater  → best for R (lmer, irr).
 *   Wide         : one row per exchange, a column per rater×field → quick view.
 *   Share        : export/import one rater's labels as JSON, so blind coders on
 *                  separate machines can be merged for analysis.
 * ========================================================================== */

const Exporter = (() => {
  const SCHEME = window.CODING_SCHEME;
  const short = (c) => (c === "Human A" ? "A" : c === "Human B" ? "B" : "AI");
  const present = (c) => Object.keys(Store.allLabels(c)).length > 0;
  const cellVal = (v) => Array.isArray(v) ? v.join(";") : (v ?? "");   // multi-select -> "a;b"

  async function longRows(studyKey) {
    const exchanges = await Data.allExchanges(studyKey);
    const coders = SCHEME.coders.filter(present);
    const rows = [];
    for (const ex of exchanges) {
      for (const coder of coders) {
        const rec = Store.getLabel(coder, ex.session_id, ex.index) || {};
        const row = {
          study: ex.study, session_id: ex.session_id, pid: ex.pid,
          issue: (ex.dialogue_meta && ex.dialogue_meta.issue) || "",
          exchange_index: ex.index, coder,
        };
        for (const f of SCHEME.fields) row[f.key] = cellVal(rec[f.key]);
        row.orig_human_rating = ex.orig_rating ?? "";
        row.user_text = ex.user_text; row.bot_text = ex.bot_text;
        rows.push(row);
      }
    }
    return rows;
  }

  async function wideRows(studyKey) {
    const exchanges = await Data.allExchanges(studyKey);
    const coders = SCHEME.coders.filter(present);
    return exchanges.map((ex) => {
      const row = {
        study: ex.study, session_id: ex.session_id, pid: ex.pid,
        issue: (ex.dialogue_meta && ex.dialogue_meta.issue) || "",
        exchange_index: ex.index, orig_human_rating: ex.orig_rating ?? "",
      };
      for (const coder of coders) {
        const rec = Store.getLabel(coder, ex.session_id, ex.index) || {};
        for (const f of SCHEME.fields) row[`${f.key}_${short(coder)}`] = cellVal(rec[f.key]);
      }
      row.user_text = ex.user_text; row.bot_text = ex.bot_text;
      return row;
    });
  }

  /* ---- CSV ------------------------------------------------------------- */
  function toCSV(rows) {
    if (!rows.length) return "";
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(",")];
    for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
    return "﻿" + lines.join("\r\n");        // BOM → Excel reads UTF-8 CJK
  }

  /* ---- XLSX (SheetJS, loaded from CDN) --------------------------------- */
  function toXLSX(sheets, filename) {
    if (!window.XLSX) return toast("XLSX library not loaded", "err");
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    XLSX.writeFile(wb, filename);
  }

  /* ---- view ------------------------------------------------------------ */
  async function render(root) {
    clear(root);
    const man = await Data.loadManifest();
    const studySel = el("select.inp", null,
      [el("option", { value: "__all" }, "兩個研究"),
       ...man.studies.map((s) => el("option", { value: s.key }, s.key))]);

    const keys = () => studySel.value === "__all" ? man.studies.map((s) => s.key) : [studySel.value];

    async function gather(fn) {
      const out = {};
      for (const k of keys()) out[k] = await fn(k);
      return out;
    }
    const stamp = () => new Date().toISOString().slice(0, 10);

    const btnCsvLong = el("button.btn.primary", { text: "⬇ CSV — long (tidy, for R)",
      onclick: async () => {
        const all = [].concat(...Object.values(await gather(longRows)));
        if (!all.length) return toast("目前還沒有任何標註", "err");
        downloadText(`coding_long_${stamp()}.csv`, toCSV(all), "text/csv");
      } });
    const btnCsvWide = el("button.btn", { text: "⬇ CSV — 寬格式（每位標註者一欄）",
      onclick: async () => {
        const all = [].concat(...Object.values(await gather(wideRows)));
        if (!all.length) return toast("目前還沒有任何標註", "err");
        downloadText(`coding_wide_${stamp()}.csv`, toCSV(all), "text/csv");
      } });
    const btnXlsx = el("button.btn", { text: "⬇ XLSX — 長格式＋寬格式工作表",
      onclick: async () => {
        const long = [].concat(...Object.values(await gather(longRows)));
        const wide = [].concat(...Object.values(await gather(wideRows)));
        if (!long.length) return toast("目前還沒有任何標註", "err");
        toXLSX({ long, wide }, `coding_results_${stamp()}.xlsx`);
      } });

    /* share / merge coder files */
    const counts = el("div.coder-counts");
    function refreshCounts() {
      clear(counts);
      for (const c of SCHEME.coders)
        counts.appendChild(el("div.coder-count" + (present(c) ? ".has" : ""),
          [el("strong", { text: SCHEME.coderLabel(c) }), el("span", { text: ` ${Store.countLabeled(c)} 筆` })]));
    }
    refreshCounts();

    const exportCoderSel = el("select.inp", null,
      SCHEME.coders.map((c) => el("option", { value: c }, SCHEME.coderLabel(c))));
    const btnExportCoder = el("button.btn", { text: "⬇ 匯出此標註者的標籤（JSON）",
      onclick: () => {
        const c = exportCoderSel.value;
        const payload = { platform: "hacp", kind: "annotations", coder: c,
          scheme: SCHEME.version, exported: new Date().toISOString(),
          labels: Store.allLabels(c) };
        downloadText(`labels_${short(c)}_${stamp()}.json`, JSON.stringify(payload), "application/json");
      } });

    const btnImport = el("button.btn", { text: "⬆ 匯入標註者的標籤檔案",
      onclick: async () => {
        const f = await pickFile(".json");
        if (!f) return;
        let p; try { p = JSON.parse(f.text); } catch (_) { return toast("不是有效的 JSON 檔案", "err"); }
        if (p.kind !== "annotations" || !p.labels) return toast("不是標籤匯出檔案", "err");
        const target = p.coder && SCHEME.coders.includes(p.coder) ? p.coder : null;
        if (!target) return toast("檔案中找不到可辨識的標註者欄位", "err");
        const n = Object.keys(p.labels).length;
        if (!confirm(`要合併 ${n} 筆標註到「${SCHEME.coderLabel(target)}」嗎？相同回合的既有標註將被覆蓋。`)) return;
        Store.mergeLabels(target, p.labels);
        refreshCounts(); toast(`已合併 ${n} 筆標註到 ${SCHEME.coderLabel(target)}`, "ok");
      } });

    const panel = el("div.export-panel", [
      el("h2", { text: "匯出與合併" }),
      el("div.card-block", [
        el("h3", { text: "彙整結果" }),
        el("div.form-row", [el("label.form-label", { text: "研究" }), studySel]),
        el("div.btn-row", [btnCsvLong, btnCsvWide, btnXlsx]),
        el("p.muted.small", { html:
          "長格式＝每位標註者、每個回合各一列（可直接餵給 R：" +
          "<code>lmer</code>、<code>irr::kappa2</code>）。寬格式＝每個回合一列，" +
          "以 <code>sentiment_A</code>、<code>sentiment_AI</code>… 等欄位呈現。" }),
      ]),
      el("div.card-block", [
        el("h3", { text: "分享與合併盲評標註" }),
        el("p.muted.small", { text:
          "標註者 A 與標註者 B 在各自的瀏覽器中獨立標註。標註完成後各自匯出標籤，再由一" +
          "人在這裡匯入兩份檔案進行比對。AI 的標籤來自「AI 引擎」分頁（或匯入其他地方" +
          "產生的 JSON 檔）。" }),
        counts,
        el("div.btn-row", [exportCoderSel, btnExportCoder, btnImport]),
      ]),
    ]);
    root.appendChild(panel);
  }

  return { render, longRows, wideRows, toCSV };
})();

window.Exporter = Exporter;
