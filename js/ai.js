/* =============================================================================
 * ai.js — AI annotation engine.
 *   • Admin panel: provider / model / API key / concurrency.
 *   • Prompt + JSON schema are BUILT FROM CODING_SCHEME, so the AI rates the
 *     exact same instrument the humans use.
 *   • One request per DIALOGUE (gives the model within-dialogue context and is
 *     far cheaper than one call per turn). Results are written to Store under
 *     the "AI" coder, so Analytics compares them like any other rater.
 *   • Browser -> provider directly (your key stays local). For the full 100%
 *     run the offline Batches pipeline in journal_analysis/rater/ is cheaper.
 * ========================================================================== */

const AIEngine = (() => {
  const SCHEME = window.CODING_SCHEME;
  let running = false, stopFlag = false;

  /* ---------- prompt construction (derived from the scheme) -------------- */
  function allowed(fieldKey) {
    const f = SCHEME.field_by_key[fieldKey];
    if (f.type === "likert") return { kind: "int", min: f.min, max: f.max };
    return { kind: "enum", values: SCHEME.options_of(f).map((o) => o.value) };
  }

  function systemPrompt() {
    const lines = [];
    lines.push(
      "You are an expert psychology research annotator. You code human–AI support",
      "dialogues on a fixed instrument. The rating UNIT is one exchange: a user",
      "utterance and the AI's reply to it. Rate strictly from the text.",
      "",
      "Fields:");
    for (const f of SCHEME.fields) {
      if (f.type === "likert") {
        lines.push(`- ${f.key} (${f.side} side, integer ${f.min}..${f.max}): ${f.definition}`);
        lines.push("  anchors: " + Object.entries(f.anchors)
          .map(([k, v]) => `${k}=${v}`).join("; "));
        if (f.na_when_empty) lines.push("  → null when there is no user utterance.");
      } else {
        const how = f.multi
          ? "pick ONE OR MORE — return a JSON array of value strings (empty array if none apply)"
          : "pick ONE";
        lines.push(`- ${f.key} (${f.side} side, ${how}): ${f.definition}`);
        for (const o of SCHEME.options_of(f))
          lines.push(`    "${o.value}" = ${o.label}: ${o.def}`);
      }
    }
    const fieldTemplate = SCHEME.fields.map((f) => {
      if (f.type === "likert") return `"${f.key}":<int|null>`;
      if (f.multi) return `"${f.key}":["<value>", ...]|null`;
      return `"${f.key}":"<value>"|null`;
    }).join(",");
    lines.push("",
      "Return ONLY a JSON object of the form:",
      `{"labels":[{"index":<int>,${fieldTemplate}}, ...]}`,
      "One entry per exchange index provided. Use null (or [] for multi-select fields)",
      "when a field does not apply (e.g. sentiment when the user did not speak; " +
      "strategy/empathy when the AI reply is a bare greeting). Output no prose, no code fences.");
    return lines.join("\n");
  }

  function userPrompt(dialogue) {
    const parts = [`Dialogue ${dialogue.session_id} (study ${dialogue.study}` +
      (dialogue.meta.issue ? `, issue ${dialogue.meta.issue}` : "") + "):", ""];
    for (const ex of dialogue.exchanges) {
      parts.push(`[exchange ${ex.index}]`);
      parts.push("USER: " + (ex.user_text && ex.user_text.trim() ? ex.user_text : "(none)"));
      parts.push("AI: " + (ex.bot_text && ex.bot_text.trim() ? ex.bot_text : "(none)"));
      parts.push("");
    }
    parts.push(`Rate every exchange (${dialogue.exchanges.map((e) => e.index).join(", ")}).`);
    return parts.join("\n");
  }

  /* ---------- provider calls (browser -> API) --------------------------- */
  async function callAnthropic(s, system, user) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": s.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: s.model, max_tokens: 2048, temperature: 0,
        system, messages: [{ role: "user", content: user }],
      }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    return (data.content || []).map((b) => b.text || "").join("");
  }

  async function callOpenAI(s, system, user) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + s.apiKey },
      body: JSON.stringify({
        model: s.model, temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    return data.choices[0].message.content;
  }

  const call = (s, sys, usr) =>
    (s.provider === "openai" ? callOpenAI : callAnthropic)(s, sys, usr);

  /* ---------- parse + validate against the scheme ----------------------- */
  function parseLabels(raw) {
    let txt = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const b0 = txt.indexOf("{"), b1 = txt.lastIndexOf("}");
    if (b0 >= 0 && b1 > b0) txt = txt.slice(b0, b1 + 1);
    const obj = JSON.parse(txt);
    const arr = Array.isArray(obj) ? obj : obj.labels;
    if (!Array.isArray(arr)) throw new Error("no labels array in response");
    return arr;
  }

  function coerce(entry) {
    const out = {};
    for (const field of SCHEME.fields) {
      const key = field.key;
      const a = allowed(key);
      const v = entry[key];
      if (field.type === "likert") {
        if (v === null || v === undefined || v === "") { out[key] = null; continue; }
        const n = Math.round(+v);
        out[key] = (isFinite(n) && n >= a.min && n <= a.max) ? n : null;
      } else if (field.multi) {
        const arr = Array.isArray(v) ? v : (v ? [v] : []);
        const clean = [...new Set(arr.filter((x) => a.values.includes(x)))];
        out[key] = clean.length ? clean : null;
      } else {
        out[key] = a.values.includes(v) ? v : null;
      }
    }
    return out;
  }

  /* ---------- run over a set of dialogues with a concurrency pool -------- */
  async function run(dialogues, s, log, onProgress) {
    running = true; stopFlag = false;
    const system = systemPrompt();
    let done = 0, ok = 0, fail = 0;
    const queue = dialogues.slice();

    async function worker() {
      while (queue.length && !stopFlag) {
        const d = queue.shift();
        try {
          const raw = await call(s, system, userPrompt(d));
          const arr = parseLabels(raw);
          const byIdx = Object.fromEntries(arr.map((e) => [e.index, e]));
          for (const ex of d.exchanges) {
            const e = byIdx[ex.index];
            if (!e) continue;
            Store.setLabel("AI", d.session_id, ex.index, coerce(e));
          }
          ok++; log(`✓ ${d.session_id}（${arr.length} 個回合）`, "ok");
        } catch (err) {
          fail++; log(`✗ ${d.session_id} — ${err.message}`, "err");
        }
        done++; onProgress(done, dialogues.length, ok, fail);
      }
    }
    const pool = Math.max(1, Math.min(8, s.concurrency || 3));
    await Promise.all(Array.from({ length: pool }, worker));
    running = false;
    return { ok, fail };
  }
  const stop = () => { stopFlag = true; };

  /* ---------- view ------------------------------------------------------ */
  async function render(root) {
    clear(root);
    const s = Store.getSettings();
    const man = await Data.loadManifest();

    const providerSel = el("select.inp",
      { onchange: () => { onProviderChange(providerSel.value); } },
      Object.entries(APP_CONFIG.providers).map(([k, p]) =>
        el("option", { value: k, selected: k === s.provider }, p.label)));

    const modelSel = el("select.inp");
    function fillModels(prov, chosen) {
      clear(modelSel);
      for (const m of APP_CONFIG.providers[prov].models)
        modelSel.appendChild(el("option", { value: m.id, selected: m.id === chosen }, m.label));
    }
    fillModels(s.provider, s.model);
    function onProviderChange(prov) { fillModels(prov, null); }

    const keyInp = el("input.inp", { type: "password", value: s.apiKey || "",
      placeholder: s.provider === "openai" ? "sk-..." : "sk-ant-..." });
    const rememberChk = el("input", { type: "checkbox", checked: !!s.rememberKey });
    const concInp = el("input.inp.small", { type: "number", min: 1, max: 8, value: s.concurrency || 3 });

    const scopeSel = el("select.inp", null, [
      el("option", { value: "sample" }, "隨機抽樣（試跑）"),
      el("option", { value: "current" }, "僅目前這個對話"),
      el("option", { value: "study" }, "整個研究"),
    ]);
    const studySel = el("select.inp", null, man.studies.map((st) =>
      el("option", { value: st.key }, `${st.key} — ${st.n_dialogues} 個對話`)));
    const sampleN = el("input.inp.small", { type: "number", min: 1, value: 8 });

    const bar = el("div.progbar", [el("div.progfill")]);
    const stat = el("div.run-stat", { text: "閒置中" });
    const logBox = el("div.log");
    const log = (msg, kind) => {
      logBox.appendChild(el("div.log-line." + (kind || "info"), { text: msg }));
      logBox.scrollTop = logBox.scrollHeight;
    };
    const setProg = (done, total, ok, fail) => {
      bar.querySelector(".progfill").style.width = `${(done / total) * 100}%`;
      stat.textContent = `${done}/${total} 個對話 · 成功 ${ok} · 失敗 ${fail}`;
    };

    const runBtn = el("button.btn.primary", { text: "▶ 執行 AI 標註" });
    const stopBtn = el("button.btn", { text: "停止", disabled: true });

    function persist() {
      return Store.setSettings({
        provider: providerSel.value, model: modelSel.value,
        apiKey: keyInp.value.trim(), rememberKey: rememberChk.checked,
        concurrency: +concInp.value,
      });
    }

    runBtn.addEventListener("click", async () => {
      const set = persist();
      if (!set.apiKey) return toast("請先輸入 API 金鑰", "err");
      const study = await Data.loadStudy(studySel.value);
      let dialogues = study.dialogues;
      if (scopeSel.value === "current") {
        const st = Coding._state();
        const d = study.byId[st.sessionId];
        if (!d || st.studyKey !== studySel.value)
          return toast("請先在「標註」分頁開啟這個研究的對話", "err");
        dialogues = [d];
      } else if (scopeSel.value === "sample") {
        dialogues = [...study.dialogues].sort(() => Math.random() - 0.5)
          .slice(0, Math.max(1, +sampleN.value));
      }
      clear(logBox); setProg(0, dialogues.length, 0, 0);
      log(`正在使用 ${set.model} 執行 ${dialogues.length} 個對話…`);
      runBtn.disabled = true; stopBtn.disabled = false;
      try {
        const res = await run(dialogues, set, log, setProg);
        log(`完成 — 成功 ${res.ok}，失敗 ${res.fail}。AI 標籤已儲存。`, "ok");
        toast(`AI 執行完成：成功 ${res.ok}，失敗 ${res.fail}`, res.fail ? "err" : "ok");
      } catch (e) { log("發生嚴重錯誤：" + e.message, "err"); }
      runBtn.disabled = false; stopBtn.disabled = true;
    });
    stopBtn.addEventListener("click", () => { stop(); log("正在停止…"); });

    const field = (label, node, hint) =>
      el("div.form-row", [el("label.form-label", { text: label }), node,
        hint ? el("div.hint", { text: hint }) : null]);

    const panel = el("div.ai-panel", [
      el("h2", { text: "AI 標註引擎" }),
      el("p.muted", { html:
        "提示詞與資料結構會依照你的標註架構自動產生，所以 AI 使用的是跟人類完全相同的" +
        "標註標準。你的金鑰只會傳送給該服務商。若要跑 100% 全量資料，離線的 Batches 管線" +
        "（<code>journal_analysis/rater/</code>）比較便宜（兩個研究約 6 美元）。" }),
      el("div.form-grid", [
        field("供應商", providerSel),
        field("模型", modelSel),
        field("API 金鑰", keyInp, "只有勾選下方「記住金鑰」才會儲存。"),
        field("同時執行數", concInp, "同時進行的對話請求數（1–8）。"),
        el("div.form-row.checkbox", [rememberChk,
          el("label", { text: " 記住這個瀏覽器的金鑰（localStorage）" })]),
      ]),
      el("hr"),
      el("div.form-grid", [
        field("研究", studySel),
        field("範圍", scopeSel),
        field("樣本數", sampleN, "範圍選擇「隨機抽樣」時才會用到。"),
      ]),
      el("div.run-row", [runBtn, stopBtn, stat]),
      bar,
      logBox,
    ]);
    root.appendChild(panel);
  }

  return { render, run, systemPrompt, userPrompt, parseLabels, coerce };
})();

window.AIEngine = AIEngine;
