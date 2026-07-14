/* =============================================================================
 * auth.js — password gate for the public deployment.
 *   Fetches the (small) encrypted manifest, tries the entered password against
 *   it (AES-GCM auth-tag check == real pass/fail, not just a UI trick), and on
 *   success keeps the derived key in memory for data.js to decrypt the rest.
 *   The password itself (not the key) is cached in sessionStorage so a coder
 *   isn't re-prompted on every reload within the same browser tab session.
 * ========================================================================== */

const Auth = (() => {
  const SS_KEY = window.APP_CONFIG.storage_prefix + ":sessionPassword";
  let derivedKey = null;
  let manifestPayload = null;

  async function fetchManifestPayload() {
    if (manifestPayload) return manifestPayload;
    const r = await fetch("data/manifest.enc.json", { cache: "no-store" });
    if (!r.ok) throw new Error("data/manifest.enc.json not found — run tools/encrypt_data.js");
    manifestPayload = await r.json();
    return manifestPayload;
  }

  /** Throws if the password is wrong (AEAD auth-tag failure). */
  async function tryPassword(password) {
    const payload = await fetchManifestPayload();
    const key = await CryptoUtil.deriveKey(password, payload.salt, payload.iterations);
    const text = await CryptoUtil.decryptWithKey(payload, key);   // throws on wrong password
    JSON.parse(text);
    derivedKey = key;
  }

  function getKey() {
    if (!derivedKey) throw new Error("not authenticated yet");
    return derivedKey;
  }

  /** Render a password prompt into rootEl; resolves once authenticated. */
  function gate(rootEl) {
    return new Promise((resolve, reject) => {
      (async () => {
        try { await fetchManifestPayload(); }
        catch (e) { reject(e); return; }

        const remembered = sessionStorage.getItem(SS_KEY);
        if (remembered) {
          try { await tryPassword(remembered); resolve(); return; }
          catch (_) { sessionStorage.removeItem(SS_KEY); }
        }

        clear(rootEl);
        const input = el("input.inp", { type: "password", placeholder: "網站密碼" });
        const errBox = el("div.auth-err");
        const btn = el("button.btn.primary", { text: "進入" });

        const submit = async () => {
          const pw = input.value;
          if (!pw) return;
          btn.disabled = true; input.disabled = true; clear(errBox);
          try {
            await tryPassword(pw);
            sessionStorage.setItem(SS_KEY, pw);
            resolve();
          } catch (_) {
            errBox.appendChild(el("div", { text: "密碼錯誤，請再試一次。" }));
            btn.disabled = false; input.disabled = false;
            input.value = ""; input.focus();
          }
        };
        btn.addEventListener("click", submit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

        rootEl.appendChild(el("div.auth-gate", null, [
          el("div.auth-box", null, [
            el("div.auth-logo", { text: "◐" }),
            el("h2", { text: "人機對話標註平台" }),
            el("p.muted", { text: "此網站包含敏感研究資料，請輸入密碼繼續。" }),
            input, btn, errBox,
          ]),
        ]));
        setTimeout(() => input.focus(), 0);
      })();
    });
  }

  return { gate, getKey };
})();

window.Auth = Auth;
