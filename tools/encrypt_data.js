#!/usr/bin/env node
/**
 * encrypt_data.js — encrypt data/*.json into data/*.enc.json for public deploy.
 *
 * The corpus contains real (de-identified but sensitive) participant dialogue.
 * Publishing coding_platform/ on GitHub Pages makes it world-readable unless the
 * data itself is opaque without a password. This encrypts each JSON file with
 * AES-256-GCM, key derived via PBKDF2-SHA256 from a password you choose. The
 * browser (js/crypto.js + js/auth.js) derives the same key from the password a
 * visitor types and decrypts client-side — nothing is sent to a server.
 *
 * This defends against passive/casual access (viewing the repo, network tab,
 * search-engine indexing) — NOT against someone who learns the password, or an
 * unlimited offline brute-force attempt. That's the ceiling of what's possible
 * on a static site with no backend; treat the password like a shared secret,
 * not like real per-user authentication.
 *
 * Usage:
 *   node tools/encrypt_data.js
 *     -> prompts for a password (masked input), confirms it, encrypts.
 *   CODING_PLATFORM_PASSWORD=xxxx node tools/encrypt_data.js
 *     -> non-interactive (e.g. CI), reads password from the env var.
 *
 * Output: data/manifest.enc.json, data/S1_dialogues.enc.json, data/S2_dialogues.enc.json
 * Deploy ONLY the .enc.json files publicly. Keep the plaintext .json files out
 * of the public repo (see the coding_platform/.gitignore this ships with).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const FILES = ["manifest.json", "S1_dialogues.json", "S2_dialogues.json"];
const ITERATIONS = 210000;   // OWASP-recommended floor for PBKDF2-HMAC-SHA256 (2023)

const KEY_ENTER = ["\n", "\r", "\x04"];   // \x04 = Ctrl-D / EOF
const KEY_CTRL_C = "\x03";
const KEY_BACKSPACE = ["\x7f", "\b"];      // DEL and classic backspace

function readPasswordMasked(promptText) {
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    const stdin = process.stdin;
    const wasTTY = stdin.isTTY;
    if (wasTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let pw = "";
    const onData = (chr) => {
      chr = String(chr);
      if (KEY_ENTER.includes(chr)) {
        if (wasTTY) stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(pw);
      } else if (chr === KEY_CTRL_C) {
        process.stdout.write("\n");
        process.exit(1);
      } else if (KEY_BACKSPACE.includes(chr)) {
        pw = pw.slice(0, -1);
        if (wasTTY) process.stdout.write("\b \b");
      } else {
        pw += chr;
        if (wasTTY) process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

async function getPassword() {
  if (process.env.CODING_PLATFORM_PASSWORD) return process.env.CODING_PLATFORM_PASSWORD;
  const pw1 = await readPasswordMasked("Set site password: ");
  const pw2 = await readPasswordMasked("Confirm password:  ");
  if (!pw1) { console.error("Password cannot be empty. Aborting."); process.exit(1); }
  if (pw1 !== pw2) { console.error("Passwords did not match. Aborting."); process.exit(1); }
  return pw1;
}

function encryptOne(plainPath, encPath, password, salt) {
  const plaintext = fs.readFileSync(plainPath, "utf8");
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  const iv = crypto.randomBytes(12);              // fresh random IV per file — required for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = {
    v: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS,
    salt: salt.toString("base64"), iv: iv.toString("base64"),
    data: Buffer.concat([enc, tag]).toString("base64"),   // Web Crypto expects tag appended
  };
  fs.writeFileSync(encPath, JSON.stringify(payload));
  return fs.statSync(encPath).size;
}

(async () => {
  for (const f of FILES) {
    if (!fs.existsSync(path.join(DATA, f))) {
      console.error(`Missing data/${f} — run tools/build_data.py first.`);
      process.exit(1);
    }
  }
  const password = await getPassword();
  const salt = crypto.randomBytes(16);   // shared across files -> browser derives the key once, reuses it
  console.log("");
  for (const f of FILES) {
    const plainPath = path.join(DATA, f);
    const encPath = path.join(DATA, f.replace(/\.json$/, ".enc.json"));
    const size = encryptOne(plainPath, encPath, password, salt);
    console.log(`  ${f} -> ${path.basename(encPath)}  (${(size / 1024).toFixed(0)} KB)`);
  }
  console.log("\nDone. Deploy ONLY the *.enc.json files publicly.");
  console.log("Share the password with your coder out-of-band (not via git/chat logs).");
})();
