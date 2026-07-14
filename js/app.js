/* =============================================================================
 * app.js — shell: top nav, active-coder selector, view routing.
 * ========================================================================== */

const App = (() => {
  const views = {
    code:      { label: "標註",     render: (r) => Coding.render(r) },
    ai:        { label: "AI 引擎",  render: (r) => AIEngine.render(r) },
    analytics: { label: "分析",     render: (r) => Analytics.render(r) },
    export:    { label: "匯出",     render: (r) => Exporter.render(r) },
  };
  let current = "code";
  let main, tabsEl;

  function setTab(name) {
    current = name;
    tabsEl.querySelectorAll(".nav-tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.view === name));
    clear(main);
    Promise.resolve(views[name].render(main)).catch((e) => {
      main.appendChild(el("div.empty", { text: "發生錯誤：" + e.message }));
      console.error(e);
    });
  }

  function header() {
    tabsEl = el("nav.nav-tabs", null, Object.entries(views).map(([k, v]) =>
      el("button.nav-tab" + (k === current ? ".active" : ""),
        { dataset: { view: k }, onclick: () => setTab(k) }, v.label)));

    const coderSel = el("select.coder-select",
      { onchange: () => { Store.setActiveCoder(coderSel.value); refreshCoderClass();
                          if (current === "code") setTab("code"); } },
      CODING_SCHEME.coders.map((c) =>
        el("option", { value: c, selected: c === Store.activeCoder() }, CODING_SCHEME.coderLabel(c))));

    return el("header.app-header", [
      el("div.brand", [el("span.logo", { text: "◐" }),
        el("div", [el("div.title", { text: "人機對話標註平台" }),
          el("div.subtitle", { text: CODING_SCHEME.version })])]),
      tabsEl,
      el("div.coder-box", [
        el("a.btn.small", { href: "codebook.html", target: "_blank",
          style: "text-decoration:none;margin-right:6px;", text: "📖 Codebook" }),
        el("label", { text: "標註身份" }), coderSel]),
    ]);
  }

  function refreshCoderClass() {
    document.body.dataset.coder =
      Store.activeCoder() === "Human A" ? "a" : Store.activeCoder() === "Human B" ? "b" : "ai";
  }

  async function init() {
    const gateRoot = el("div#gate-root");
    document.body.appendChild(gateRoot);
    try { await Auth.gate(gateRoot); }
    catch (e) {
      gateRoot.appendChild(el("div.empty", { html:
        "找不到 <code>data/manifest.enc.json</code>。<br>請先執行 " +
        "<code>python3 tools/build_data.py</code>，再執行 " +
        "<code>node tools/encrypt_data.js</code>，並以 http/https 方式提供服務" +
        "（Web Crypto 需要安全環境——本機 localhost 可以）。" }));
      return;
    }
    gateRoot.remove();

    document.body.append(header(), el("main.app-main", { id: "app-main" }));
    main = document.getElementById("app-main");
    refreshCoderClass();
    try { await Data.loadManifest(); }
    catch (e) {
      main.appendChild(el("div.empty", { text: "資料載入失敗：" + e.message }));
      return;
    }
    setTab("code");
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
