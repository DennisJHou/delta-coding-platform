/* =============================================================================
 * crypto.js — browser-side AES-GCM/PBKDF2 helpers (Web Crypto API), matching
 * the format produced by tools/encrypt_data.js. No dependencies.
 * ========================================================================== */

const CryptoUtil = (() => {
  function b64ToBytes(b64) {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  async function deriveKey(password, saltB64, iterations) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64ToBytes(saltB64), iterations, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }

  /** Decrypt a {v,kdf,iterations,salt,iv,data} payload with an already-derived
   *  key. Throws (AEAD auth failure) if the key/password was wrong. */
  async function decryptWithKey(payload, key) {
    const iv = b64ToBytes(payload.iv);
    const data = b64ToBytes(payload.data);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(plainBuf);
  }

  return { deriveKey, decryptWithKey };
})();

window.CryptoUtil = CryptoUtil;
