# Human–AI Dialogue Coding Platform

A zero-backend web app for coding the Study 1 / Study 2 support-dialogue corpora
on a fixed psychological instrument — by **two human coders** and by an **LLM
AI-rater** — and comparing their agreement.

Built to run as a **static site** (GitHub Pages, or just a local folder). No
server, no database, no build step. Vanilla JS + two CDN libraries
(Chart.js, SheetJS). The public deployment is **password-gated**: the corpus is
AES-256-GCM encrypted at rest and only decrypted client-side after the correct
password is entered (see **Deploy to GitHub Pages** below).

---

## What it does

1. **Code** — dialogues shown as chat cards; each exchange gets:
   - **User Valence** (`sentiment` key, kept for backward compatibility with
     existing labels) — 7-point signed Likert, −3…+3
   - **User Arousal** — 7-point signed Likert, −3…+3, independent of valence.
     Coders who labeled before this field existed (or upload a partial export)
     simply show as "not yet labeled" for arousal on those cells — no error.
   - **AI Emotion-Regulation Strategy** — Gross's process model
     (situation selection / modification, attentional deployment, cognitive
     change, response modulation, suppression) + positive-affect (savoring /
     dampening). **Multi-select** — a reply can validate *and* reframe *and*
     advise at once, so coders tag every strategy that clearly applies.
   - **Empathy Type** — cognitive / affective / motivational (single-select)
2. **AI Engine** — paste an Anthropic or OpenAI key, pick a model, and the app
   prompts the LLM **on the exact same instrument** (prompt is generated from the
   coding scheme, including the multi-select instruction) and stores its labels
   as a third rater.
3. **Analytics** — inter-rater agreement for every rater pair:
   - Valence and Arousal: quadratic-weighted κ + Pearson r (each scored
     independently, using only the cells both raters actually labeled)
   - Empathy Type (single-select categorical): Cohen's κ
   - Regulation Strategy (multi-select): mean per-category binary κ (κ̄) +
     Jaccard set-overlap similarity + exact-set agreement
   - Plus a **sentiment trajectory** chart with least-squares **slope** and the
     largest single-exchange **Turning Point**.
4. **Export** — combined results as CSV (long/tidy for R, or wide per-rater) and
   XLSX; plus per-rater JSON to merge blind coders working on separate machines.

This is the platform's **finalized coding scheme** — the categorical instrument
above (not the separate 16-dimension `journal_analysis/rater/codebook.md`
instrument used for the journal-paper AI-rater pipeline; the two are unrelated
projects sharing the same corpus).

---

## Quick start (local)

```bash
cd coding_platform
python3 tools/build_data.py                       # once: builds plaintext data/*.json
CODING_PLATFORM_PASSWORD=yourpassword node tools/encrypt_data.js   # or omit the env var to be prompted
python3 tools/serve.py                             # serves http://localhost:8123 (dual-stack)
# open http://localhost:8123, enter the password you set above
```

The app **always** requires the password, even locally — this keeps a single
code path and matches what coders will experience on the deployed site. Web
Crypto requires a secure context; `localhost` counts as one, so this works
without HTTPS locally.

## Deploy to GitHub Pages (public, password-gated)

The app is pure static files, so Pages "just works" — the corpus itself is
protected by client-side encryption, not by hiding the repo:

1. `cd coding_platform && python3 tools/build_data.py` (builds plaintext
   `data/*.json` locally — never committed, see `.gitignore`).
2. `node tools/encrypt_data.js` — set a password when prompted. This writes
   `data/manifest.enc.json`, `data/S1_dialogues.enc.json`,
   `data/S2_dialogues.enc.json`. **Run this yourself in your own terminal** so
   the password never appears in any chat log or AI conversation.
3. Create a repo; copy the **contents** of `coding_platform/` to its root (so
   `index.html` is at the repo root) and commit. The `.gitignore` shipped here
   excludes the plaintext `data/*.json` — only the `*.enc.json` files (ciphertext)
   get committed.
4. Repo **Settings → Pages → Source: Deploy from branch → `main` / root**.
5. Share the password with your coder **out-of-band** (Signal, in person, a
   password manager — not email, not a GitHub issue, not this chat).

**What this does and doesn't protect against:** the dialogue text is opaque
ciphertext to anyone browsing the repo, sniffing network traffic, or letting a
search engine crawl the site — that covers the realistic risk for a small
research tool. It does **not** protect against someone who obtains the correct
password, or an attacker willing to run unlimited offline password-guessing
against the public ciphertext — there's no way to do real per-user
authentication on a static site with no backend. Treat the password as a shared
team secret, not a login system, and pick one that isn't trivially guessable.

If you ever need to rotate the password, just re-run `tools/encrypt_data.js`
with a new one and re-deploy — old links stop working immediately since the old
key can no longer decrypt the new ciphertext.

---

## Workflow (two blind coders + AI)

Inter-rater reliability requires coders to label **independently**. This app
keeps each coder's labels in their own browser (`localStorage`) — so blindness is
automatic; the shared password only gates *reading the corpus*, not the labels.

1. Coder opens the site, enters the shared password once (remembered for that
   browser tab's session), picks their identity (**Coding as: Human A / Human
   B**, top-right), and codes dialogues. Saved instantly, per coder.
2. Each coder → **Export** tab → *Export this rater's labels (JSON)* → sends the
   file to whoever runs the analysis.
3. Analyst → **Export** tab → *Import a rater's labels file* for A and B.
4. **AI Engine** tab → run the model on a pilot sample (per the plan: run AI
   first, hand-code 20–30%, check Human↔AI agreement before committing to
   100%).
5. **Analytics** tab → agreement table + trajectories.
6. **Export** tab → CSV/XLSX for R (`irr::kappa2`, `lmer`, …).

---

## Changing the coding scheme

Everything — the coding widgets, the AI prompt, the chosen statistics, and the
export columns — is driven by **one file: [`js/config.js`](js/config.js)**
(`window.CODING_SCHEME`). Edit `fields` to change scales/categories; set
`multi: true`/`false` on a categorical field to toggle multi-select; nothing
else needs to change — the AI prompt, agreement stats, and export columns all
adapt automatically.

---

## AI Engine notes

- Browser → provider directly. Your key stays in your browser (persisted only if
  you tick *Remember key*). Anthropic is called with
  `anthropic-dangerous-direct-browser-access`.
- Models: Claude Opus 4.8 / Sonnet 5 / Haiku 4.5, or GPT-4o / GPT-4o-mini.
- One request per **dialogue** (gives the model within-dialogue context; cheaper
  than per-turn).
- **For the full 100% run**, the offline Batches pipeline in
  `../journal_analysis/rater/` is cheaper (~$6 both studies, 50% Batch discount) —
  but note that pipeline codes the *other* (16-dim) instrument, not this one.
  Use the in-app runner for this platform's pilots / spot checks / full runs.

---

## Files

```
coding_platform/
  index.html            app shell (loads CDN + js/*)
  css/style.css
  .gitignore             excludes plaintext data/*.json from git
  js/
    config.js           ← THE coding scheme (single source of truth)
    util.js             DOM + download helpers
    crypto.js            AES-GCM/PBKDF2 helpers (Web Crypto API)
    auth.js               password gate (decrypts manifest to verify)
    store.js             persistence layer (localStorage; swap here for Supabase)
    data.js               corpus loader (fetches + decrypts *.enc.json)
    stats.js             κ, weighted-κ, κ̄ (multi-label), Jaccard, Pearson, slope, turning point (pure)
    coding.js             human coding UI (single- and multi-select controls)
    ai.js                 AI annotation engine
    analytics.js          agreement dashboard + trajectory chart
    export.js             CSV / XLSX / rater-JSON merge
    app.js                 nav + routing + auth gating
  data/
    manifest.json  S1_dialogues.json  S2_dialogues.json   plaintext (gitignored)
    manifest.enc.json  S1_dialogues.enc.json  S2_dialogues.enc.json   ciphertext (commit these)
  tools/
    build_data.py         long-tables CSV -> plaintext data/*.json
    encrypt_data.js       plaintext data/*.json -> encrypted data/*.enc.json
    serve.py               local dual-stack static server
```

## Regenerating data

`tools/build_data.py` reads `../journal_analysis/data/S1_turns_long.csv` and
`S2_pairs_long.csv` (25 dialogues / 285 exchanges; 120 / 1229) and writes
plaintext `data/*.json`. Re-run it whenever those long-tables change, then
re-run `tools/encrypt_data.js` (same password) before redeploying.
