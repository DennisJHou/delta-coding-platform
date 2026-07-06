/* =============================================================================
 * analytics.js — agreement dashboard + sentiment trajectory / turning points.
 *   • Agreement table: for each field × each rater pair, the metric that fits
 *     that field (Cohen's κ for categorical; weighted-κ + Pearson r for the
 *     ordinal sentiment scale), with the co-labelled n.
 *   • Trajectory chart: sentiment across a dialogue for every rater present,
 *     with least-squares slope and the largest-swing "Turning Point".
 * ========================================================================== */

const Analytics = (() => {
  const SCHEME = window.CODING_SCHEME;
  const PAIRS = [["Human A", "Human B"], ["Human A", "AI"], ["Human B", "AI"]];

  const present = (coder) => Object.keys(Store.allLabels(coder)).length > 0;

  function collectPairs(exchanges, field, cx, cy) {
    const lx = Store.allLabels(cx), ly = Store.allLabels(cy);
    const out = [];
    for (const ex of exchanges) {
      const k = Store.cellKey(ex.session_id, ex.index);
      const a = lx[k] && lx[k][field.key], b = ly[k] && ly[k][field.key];
      if (a != null && b != null) out.push([a, b]);
    }
    return out;
  }

  function scoreField(exchanges, field, cx, cy) {
    if (field.multi) {
      const pairs = collectPairs(exchanges, field, cx, cy);   // arrays are truthy when non-empty
      if (!pairs.length) return { n: 0 };
      const cats = SCHEME.options_of(field).map((o) => o.value);
      const setStr = (arr) => JSON.stringify([...arr].sort());
      return {
        n: pairs.length,
        primary: { name: "κ̄", value: Stats.multiLabelKappaMacro(pairs, cats) },
        extra: [
          { name: "Jaccard", value: Stats.jaccardMean(pairs) },
          { name: "exact-set", value: Stats.percentAgreement(pairs.map(([a, b]) => [setStr(a), setStr(b)])) },
        ],
      };
    }
    const pairs = collectPairs(exchanges, field, cx, cy);
    if (!pairs.length) return { n: 0 };
    if (field.type === "likert") {
      const cats = []; for (let v = field.min; v <= field.max; v++) cats.push(v);
      return {
        n: pairs.length,
        primary: { name: "wκ", value: Stats.weightedKappa(pairs, cats) },
        extra: [
          { name: "r", value: Stats.pearson(pairs) },
          { name: "exact", value: Stats.percentAgreement(pairs) },
        ],
      };
    }
    const cats = SCHEME.options_of(field).map((o) => o.value);
    return {
      n: pairs.length,
      primary: { name: "κ", value: Stats.cohensKappa(pairs, cats) },
      extra: [{ name: "agr", value: Stats.percentAgreement(pairs) }],
    };
  }

  async function render(root) {
    clear(root);
    const wrap = el("div.analytics");
    wrap.appendChild(el("h2", { text: "一致性與動態分析" }));

    const man = await Data.loadManifest();
    let studyKey = Coding._state().studyKey || man.studies[0].key;
    const studySel = el("select.inp", null, man.studies.map((s) =>
      el("option", { value: s.key, selected: s.key === studyKey }, `${s.key} — ${s.label}`)));
    wrap.appendChild(el("div.toolbar", [el("label", { text: "研究 " }), studySel,
      el("button.btn.small", { text: "↻ 重新計算", onclick: () => build() }),
      el("span.muted.small", { text:
        "　小提示：先讓 AI 跑一遍，再手動標 20–30%，就能在這裡看到人類↔AI 的一致性。" })]));

    const body = el("div.analytics-body");
    wrap.appendChild(body);
    root.appendChild(wrap);

    async function build() {
      studyKey = studySel.value;
      clear(body);
      const exchanges = await Data.allExchanges(studyKey);
      const active = SCHEME.coders.filter(present);
      if (active.length < 2) {
        body.appendChild(el("div.empty", { text:
          "需要至少兩位有標註紀錄的標註者。請以標註者 A、標註者 B 身份標註，" +
          "並／或執行 AI 引擎，再重新計算。" }));
        return;
      }
      body.appendChild(agreementTable(exchanges, active));
      body.appendChild(await trajectorySection(studyKey));
    }
    build();
  }

  function agreementTable(exchanges, active) {
    const box = el("div.card-block");
    box.appendChild(el("h3", { text: "標註者間一致性" }));
    const pairs = PAIRS.filter((p) => active.includes(p[0]) && active.includes(p[1]));

    const table = el("table.agr");
    const head = el("tr", [el("th", { text: "項目" }),
      ...pairs.map((p) => el("th", { text: p.map(SCHEME.coderLabel).join(" ↔ ") }))]);
    table.appendChild(el("thead", null, head));
    const tb = el("tbody");
    for (const f of SCHEME.fields) {
      const tr = el("tr", [el("td.fname", [el("strong", { text: f.short || f.label }),
        el("div.metric-tag", { text: f.type === "likert" ? "序位量尺" :
          f.multi ? "多選" : "類別" })])]);
      for (const [cx, cy] of pairs) {
        const s = scoreField(exchanges, f, cx, cy);
        if (!s.n) { tr.appendChild(el("td.cell.na", { text: "—" })); continue; }
        const v = s.primary.value;
        const cls = v == null ? "" : v >= 0.6 ? "good" : v >= 0.4 ? "mid" : "low";
        const extra = (s.extra || []).map((e) => `${e.name} ${fmtNum(e.value)}`).join(" · ");
        tr.appendChild(el("td.cell." + cls, [
          el("div.big", { text: `${s.primary.name} ${fmtNum(v)}` }),
          el("div.sub", { text: (f.type === "categorical" ? Stats.kappaLabel(v) + " · " : "") +
            extra + `　(n=${s.n})` }),
        ]));
      }
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    box.appendChild(table);
    box.appendChild(el("p.legend", { text:
      "κ / wκ = Cohen's κ 與加權 κ · κ̄ = 多選欄位的類別二元 κ 平均值 · r = Pearson 相關 · " +
      "Jaccard = 集合重疊相似度 · exact/agr/exact-set = 原始一致率 · " +
      "n = 兩位標註者都標註過的回合數。綠色 ≥ .60 為高度一致，橙色 .40–.60 為中度，" +
      "紅色 < .40 為偏低。" }));
    return box;
  }

  async function trajectorySection(studyKey) {
    const box = el("div.card-block");
    box.appendChild(el("h3", { text: "情緒軌跡與轉折點" }));
    const study = await Data.loadStudy(studyKey);
    const sel = el("select.inp", null, study.dialogues.map((d) =>
      el("option", { value: d.session_id }, d.session_id +
        (d.meta.issue ? ` (${SCHEME.issueLabel(d.meta.issue)})` : ""))));
    const caption = el("div.traj-cap");
    const canvasWrap = el("div.chart-wrap", [el("canvas", { id: "trajChart", height: 300 })]);
    box.append(el("div.toolbar", [el("label", { text: "對話 " }), sel]), canvasWrap, caption);

    let chart = null;
    function draw() {
      const d = study.byId[sel.value];
      const field = SCHEME.field_by_key.sentiment;
      const labels = d.exchanges.map((e) => "#" + e.index);
      const palette = { "Human A": "#c2410c", "Human B": "#b45309", "AI": "#9d174d" };
      const datasets = []; const capLines = [];
      for (const coder of SCHEME.coders) {
        if (!present(coder)) continue;
        const store = Store.allLabels(coder);
        const pts = d.exchanges.map((e) => {
          const rec = store[Store.cellKey(d.session_id, e.index)];
          return { x: e.index, y: rec && typeof rec.sentiment === "number" ? rec.sentiment : null };
        });
        if (!pts.some((p) => p.y != null)) continue;
        datasets.push({
          label: SCHEME.coderLabel(coder), data: pts.map((p) => p.y),
          borderColor: palette[coder], backgroundColor: palette[coder],
          spanGaps: true, tension: 0.25, pointRadius: 4,
        });
        const sl = Stats.slope(pts), tp = Stats.turningPoint(pts);
        capLines.push(`${SCHEME.coderLabel(coder)}：斜率 ${fmtNum(sl, 3)}` +
          (tp ? ` · 轉折點在第 ${tp.atIndex} 回合（Δ ${tp.delta > 0 ? "+" : ""}${tp.delta}）` : ""));
      }
      if (chart) chart.destroy();
      chart = new Chart(document.getElementById("trajChart"), {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { y: { min: field.min, max: field.max,
            title: { display: true, text: "情緒（−3…+3）" } },
            x: { title: { display: true, text: "回合" } } },
          plugins: { legend: { position: "top" } },
        },
      });
      clear(caption);
      capLines.forEach((l) => caption.appendChild(el("div", { text: l })));
      caption.appendChild(el("div.muted.small", { text:
        "斜率＝整段對話中使用者情緒的整體趨勢；轉折點＝單一回合間最大幅度的變化。" }));
    }
    sel.addEventListener("change", draw);
    setTimeout(draw, 0);   // canvas must be in DOM first
    return box;
  }

  return { render, scoreField };
})();

window.Analytics = Analytics;
