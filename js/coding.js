/* =============================================================================
 * coding.js — the human coding interface.
 *   Sidebar: study switch + dialogue list with per-dialogue progress.
 *   Main:    the selected dialogue as chat cards, each with rating controls
 *            generated from CODING_SCHEME. Every click saves immediately to
 *            Store under the ACTIVE coder.
 * ========================================================================== */

const Coding = (() => {
  const SCHEME = window.CODING_SCHEME;
  let studyKey = "S1";
  let sessionId = null;
  let focus = null;            // {sessionId, index} for keyboard sentiment entry

  const appliesTo = (field, ex) =>
    field.side === "user" ? !!(ex.user_text && ex.user_text.trim())
                          : !!(ex.bot_text && ex.bot_text.trim());

  /* progress = filled applicable slots / total applicable slots in a dialogue */
  function progress(coder, dialogue) {
    let total = 0, filled = 0;
    const labels = Store.allLabels(coder);
    for (const ex of dialogue.exchanges) {
      for (const f of SCHEME.fields) {
        if (!appliesTo(f, ex)) continue;
        total++;
        const rec = labels[Store.cellKey(dialogue.session_id, ex.index)];
        if (rec && rec[f.key] != null) filled++;
      }
    }
    return { filled, total };
  }

  async function render(root) {
    clear(root);
    const layout = el("div.code-layout");
    const side = el("aside.code-side");
    const main = el("section.code-main");
    layout.append(side, main);
    root.appendChild(layout);
    await renderSidebar(side, main);
  }

  async function renderSidebar(side, main) {
    clear(side);
    const man = await Data.loadManifest();
    const tabs = el("div.study-tabs");
    for (const s of man.studies) {
      tabs.appendChild(el("button.study-tab" + (s.key === studyKey ? ".active" : ""),
        { onclick: () => { studyKey = s.key; sessionId = null; renderSidebar(side, main); } },
        s.key));
    }
    side.appendChild(tabs);

    const study = await Data.loadStudy(studyKey);
    const coder = Store.activeCoder();
    side.appendChild(el("div.side-head", { text: study.entry.label }));

    const list = el("div.dlg-list");
    for (const d of study.dialogues) {
      const p = progress(coder, d);
      const done = p.total > 0 && p.filled === p.total;
      const item = el("button.dlg-item" + (d.session_id === sessionId ? ".active" : "") +
        (done ? ".done" : ""),
        { onclick: () => { sessionId = d.session_id; renderSidebar(side, main); } },
        [
          el("span.dlg-id", { text: d.session_id.replace(/^S\d_/, "") }),
          el("span.dlg-meta", { text: metaLine(d) }),
          el("span.dlg-prog", { text: `${p.filled}/${p.total}` }),
        ]);
      list.appendChild(item);
    }
    side.appendChild(list);

    if (!sessionId && study.dialogues.length) sessionId = study.dialogues[0].session_id;
    if (sessionId) renderDialogue(main, study.byId[sessionId], side);
  }

  const metaLine = (d) =>
    d.study === "S2"
      ? `${SCHEME.issueLabel(d.meta.issue) || "？"} · ${d.meta.n_pairs} 組`
      : `${d.meta.n_turns} 回合`;

  function renderDialogue(main, dialogue, side) {
    clear(main);
    const coder = Store.activeCoder();
    main.appendChild(el("div.dlg-head", null, [
      el("div.dlg-title", { text: dialogue.session_id }),
      el("div.dlg-sub", { text:
        `研究 ${dialogue.study} · 編號 ${dialogue.pid}` +
        (dialogue.meta.issue ? ` · ${SCHEME.issueLabel(dialogue.meta.issue)}` : "") +
        ` · 標註身份： ` }),
      el("span.badge-coder", { text: SCHEME.coderLabel(coder) }),
    ]));

    const stream = el("div.stream");
    for (const ex of dialogue.exchanges)
      stream.appendChild(exchangeCard(dialogue, ex, () => refreshSidebarProgress(side)));
    main.appendChild(stream);
  }

  function refreshSidebarProgress(side) {
    // cheap: re-render sidebar list progress only
    const coder = Store.activeCoder();
    Data.loadStudy(studyKey).then((study) => {
      side.querySelectorAll(".dlg-item").forEach((item, i) => {
        const d = study.dialogues[i];
        const p = progress(coder, d);
        item.querySelector(".dlg-prog").textContent = `${p.filled}/${p.total}`;
        item.classList.toggle("done", p.total > 0 && p.filled === p.total);
      });
    });
  }

  function exchangeCard(dialogue, ex, onChange) {
    const coder = Store.activeCoder();
    const rec = Store.getLabel(coder, dialogue.session_id, ex.index) || {};
    const card = el("div.card", { dataset: { sid: dialogue.session_id, idx: ex.index },
      onclick: () => setFocus(dialogue.session_id, ex.index, card) });

    card.appendChild(el("div.turn-no", { text: "#" + ex.index }));

    if (ex.user_text && ex.user_text.trim())
      card.appendChild(el("div.bubble.user", null, [
        el("div.who", { text: "使用者" }),
        el("div.msg", { text: ex.user_text }),
      ]));
    else
      card.appendChild(el("div.bubble.user.empty", { text: "－（開場白，沒有使用者訊息）－" }));

    if (ex.bot_text && ex.bot_text.trim())
      card.appendChild(el("div.bubble.bot", null, [
        el("div.who", { text: "AI" }),
        el("div.msg", { text: ex.bot_text }),
      ]));

    const controls = el("div.controls");
    for (const f of SCHEME.fields) {
      const box = el("div.field.side-" + f.side);
      box.appendChild(el("label.field-label", { title: f.definition }, [
        f.label, el("span.side-tag", { text: f.side === "user" ? "使用者" : "AI" }) ]));
      if (!appliesTo(f, ex)) {
        box.appendChild(el("div.na", { text: f.side === "user" ? "不適用（無使用者文字）" : "不適用" }));
      } else {
        box.appendChild(fieldControl(f, dialogue.session_id, ex.index, rec, card, onChange));
      }
      controls.appendChild(box);
    }
    card.appendChild(controls);
    return card;
  }

  function fieldControl(field, sid, idx, rec, card, onChange) {
    const wrap = el("div.control");
    const save = (value) => {
      Store.setLabel(Store.activeCoder(), sid, idx, { [field.key]: value });
      onChange && onChange();
    };

    if (field.type === "likert") {
      const row = el("div.likert");
      for (let v = field.min; v <= field.max; v++) {
        const sel = rec[field.key] === v;
        row.appendChild(el("button.lk" + (sel ? ".sel" : ""),
          { title: field.anchors[String(v)] || "", dataset: { v },
            onclick: (e) => { e.stopPropagation();
              const nv = rec[field.key] === v ? null : v; rec[field.key] = nv;
              row.querySelectorAll(".lk").forEach((b) =>
                b.classList.toggle("sel", nv != null && +b.dataset.v === nv));
              save(nv); },
            style: `--w:${(v - field.min) / (field.max - field.min)}` },
          v > 0 ? "+" + v : String(v)));
      }
      wrap.appendChild(row);
    } else { // categorical -> grouped chips (single- or multi-select per field.multi)
      const groups = field.groups
        ? field.groups.map((g) => ({ name: g.name, options: g.options }))
        : [{ name: null, options: field.options }];
      const extras = field.extra_options || [];
      const extraValues = extras.map((o) => o.value);
      const isMulti = !!field.multi;

      const currentArr = () => Array.isArray(rec[field.key]) ? rec[field.key] : [];
      const isSelected = (val) => isMulti ? currentArr().includes(val) : rec[field.key] === val;
      const paintAll = (activeVals) => wrap.querySelectorAll(".chip").forEach((b) =>
        b.classList.toggle("sel", activeVals.includes(b.dataset.v)));

      const applySingle = (val) => {
        const nv = rec[field.key] === val ? null : val;
        rec[field.key] = nv;
        paintAll(nv != null ? [nv] : []);
        save(nv);
      };
      const applyMulti = (val, isExtra) => {
        let arr = currentArr();
        if (isExtra) {
          arr = arr.includes(val) ? [] : [val];              // "none" clears / toggles alone
        } else {
          arr = arr.filter((v) => !extraValues.includes(v));  // picking a real option drops "none"
          arr = arr.includes(val) ? arr.filter((v) => v !== val) : arr.concat(val);
        }
        rec[field.key] = arr.length ? arr : null;
        paintAll(arr);
        save(rec[field.key]);
      };

      const renderChip = (o, isExtra) => {
        const sel = isSelected(o.value);
        return el("button.chip" + (sel ? ".sel" : ""),
          { title: o.def, dataset: { v: o.value },
            onclick: (e) => { e.stopPropagation();
              isMulti ? applyMulti(o.value, isExtra) : applySingle(o.value); } },
          o.label);
      };
      for (const g of groups) {
        if (g.name) wrap.appendChild(el("div.grp-name", { text: g.name }));
        const chips = el("div.chips");
        g.options.forEach((o) => chips.appendChild(renderChip(o, false)));
        wrap.appendChild(chips);
      }
      if (extras.length) {
        const chips = el("div.chips.extra");
        extras.forEach((o) => chips.appendChild(renderChip(o, true)));
        wrap.appendChild(chips);
      }
      if (isMulti) wrap.appendChild(el("div.multi-hint", { text: "可多選" }));
    }
    return wrap;
  }

  /* ---- click-to-focus + keyboard sentiment entry (1..7 => -3..+3) -------- */
  function setFocus(sid, idx, card) {
    focus = { sid, idx };
    document.querySelectorAll(".card.focused").forEach((c) => c.classList.remove("focused"));
    card.classList.add("focused");
  }
  document.addEventListener("keydown", (e) => {
    if (!focus) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    const f = SCHEME.field_by_key.sentiment;
    if (!f) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= (f.max - f.min + 1)) {
      const v = f.min + (n - 1);
      const card = document.querySelector(`.card[data-sid="${focus.sid}"][data-idx="${focus.idx}"]`);
      if (!card) return;
      const btn = card.querySelector(`.likert .lk[data-v="${v}"]`);
      if (btn) { btn.click(); e.preventDefault(); }
    }
  });

  return { render, _state: () => ({ studyKey, sessionId }) };
})();

window.Coding = Coding;
