/* =============================================================================
 * config.js — THE CODING SCHEME (single source of truth)
 * -----------------------------------------------------------------------------
 * This one object drives everything:
 *   • the human coding UI widgets          (coding.js)
 *   • the AI annotation prompt + schema     (ai.js)
 *   • the agreement statistics chosen        (analytics.js)
 *   • the export columns                     (export.js)
 *
 * UI language: Chinese-first. Annotation OPTIONS (the pickable values/anchors)
 * are bilingual "中文 English" for precision; everything else (field labels,
 * definitions, all other UI text) is Chinese only.
 *
 * Rating UNIT = one "exchange": a user utterance + the bot's reply to it.
 *   - `side:"user"` fields rate the USER utterance   (e.g. Sentiment)
 *   - `side:"bot"`  fields rate the BOT reply         (Strategy, Empathy)
 * ========================================================================== */

window.CODING_SCHEME = {
  version: "v1 分類式架構（Gross 情緒調節歷程模型 + 多維同理心）",
  rating_unit: "exchange",

  fields: [
    /* ---- USER SIDE : Valence (7-point signed Likert) ----------------------
     * key stays "sentiment" for backward compatibility with labels already
     * saved under this key (e.g. coders who annotated before the "arousal"
     * dimension existed) — only the display label was clarified to "valence"
     * now that a second user-side dimension exists alongside it. */
    {
      key: "sentiment",
      label: "使用者情緒效價",
      short: "效價",
      side: "user",
      type: "likert",
      min: -3, max: 3,
      metric: "weighted_kappa",           // + Pearson r reported alongside
      na_when_empty: true,                 // opening bot greeting has no user text
      definition:
        "此句使用者情緒的效價（valence）強度與正負向，範圍從極度負面 (-3)、中性 (0)，到極度正面 (+3)。",
      anchors: {
        "-3": "極度負面 Extremely negative",
        "-2": "偏負面 Quite negative",
        "-1": "略負面 Slightly negative",
        "0":  "中性／混合 Neutral / mixed",
        "1":  "略正面 Slightly positive",
        "2":  "偏正面 Quite positive",
        "3":  "極度正面 Extremely positive",
      },
    },

    /* ---- USER SIDE : Arousal (7-point signed Likert) ----------------------
     * Same rating unit and range as valence (side:"user", -3..+3), but a
     * separate independent dimension — a coder may have valence but not yet
     * have arousal labeled (or vice versa) for the same cell; that's treated
     * as "not yet labeled" for arousal specifically, not an error. */
    {
      key: "arousal",
      label: "使用者情緒喚醒度",
      short: "喚醒度",
      side: "user",
      type: "likert",
      min: -3, max: 3,
      metric: "weighted_kappa",           // + Pearson r reported alongside
      na_when_empty: true,                 // opening bot greeting has no user text
      definition:
        "此句使用者情緒的喚醒（激動）程度，範圍從極度平靜／低落 (-3)、中等喚醒 (0)，到極度激動／亢奮 (+3)。",
      anchors: {
        "-3": "極度平靜 Extremely calm / deactivated",
        "-2": "偏平靜 Quite calm",
        "-1": "略平靜 Slightly calm",
        "0":  "中等喚醒 Moderate arousal",
        "1":  "略激動 Slightly aroused",
        "2":  "偏激動 Quite aroused",
        "3":  "極度激動 Extremely aroused / activated",
      },
    },

    /* ---- BOT SIDE : Emotion-Regulation Strategy (Gross) ------------------- */
    {
      key: "regulation_strategy",
      label: "AI 情緒調節策略",
      short: "策略",
      side: "bot",
      type: "categorical",
      multi: true,              // 一則回覆可能同時做好幾件事（例如同時安撫又重新框架）
      metric: "multi_label_kappa",
      definition:
        "AI 回覆所使用的情緒調節策略，依據 Gross 的情緒調節歷程模型（情境 → 注意力 → " +
        "評估 → 反應），加上正向情緒的調節策略。請勾選所有明顯符合的策略——大多數回覆是" +
        "1 個，少數會有 2-3 個。",
      groups: [
        {
          name: "負向情緒策略（Gross）",
          options: [
            { value: "situation_selection",   label: "情境選擇 Situation Selection",
              def: "引導使用者趨近或避開某些情境，以預先防範該情緒（例如「或許可以先避開那個場合」）。" },
            { value: "situation_modification", label: "情境改變 Situation Modification",
              def: "協助改變外部情境／問題本身——具體的問題解決、改變現實條件。" },
            { value: "attentional_deployment", label: "注意力轉移 Attentional Deployment",
              def: "轉移注意力——分散注意力，或將焦點轉向情境的其他面向。" },
            { value: "cognitive_change",       label: "認知改變（重新評估）Cognitive Change (Reappraisal)",
              def: "重新框架情境的「意義」以改變其情緒衝擊——重新評估的核心動作。" },
            { value: "response_modulation",    label: "反應調節 Response Modulation",
              def: "在情緒反應出現後給予支持——安撫、安慰、肯定、引導呼吸、身體或情感上的支持。" },
            { value: "suppression",            label: "壓抑 Suppression",
              def: "鼓勵抑制或收斂情緒的外在表達。" },
          ],
        },
        {
          name: "正向情緒策略",
          options: [
            { value: "savoring",  label: "品味延續 Savoring",
              def: "放大或延續使用者的正向情緒——一起慶祝、細細品味美好、鼓勵好好享受。" },
            { value: "dampening", label: "淡化 Dampening",
              def: "冷處理或壓低使用者的正向情緒——冷淡、輕描淡寫、消減興致。" },
          ],
        },
      ],
      extra_options: [
        { value: "none", label: "無／不適用 None / N.A.",
          def: "沒有出現任何情緒調節策略（如問候、事務性對話、離題）。" },
      ],
    },

    /* ---- BOT SIDE : Empathy Type (multi-dimensional empathy) -------------- */
    {
      key: "empathy_type",
      label: "同理心類型",
      short: "同理心",
      side: "bot",
      type: "categorical",
      multi: false,
      metric: "cohens_kappa",
      definition:
        "AI 回覆所展現的主要同理心類型，區分認知、情感、動機三個同理心成分。",
      options: [
        { value: "cognitive",    label: "認知 Cognitive",
          def: "理解使用者的「想法／觀點」——「我能理解你為什麼會這樣看待這件事」。" },
        { value: "affective",    label: "情感 Affective",
          def: "與使用者「一起感受」——分享或映照使用者的情緒。" },
        { value: "motivational", label: "動機 Motivational",
          def: "希望「幫助」使用者、為其福祉行動——關懷、提供支持。" },
      ],
      extra_options: [
        { value: "none", label: "無 None",
          def: "此回覆沒有展現任何同理心。" },
      ],
    },
  ],

  /* Who can produce labels. Human A / Human B code independently (blind); AI is
   * produced by the annotation engine. Analytics compares any pair. Keys stay
   * ASCII (storage keys / CSV column values); coder_labels below is the
   * Chinese-only display text shown in the UI. */
  coders: ["Human A", "Human B", "AI"],
  coder_labels: { "Human A": "標註者 A", "Human B": "標註者 B", "AI": "AI" },

  /* Chinese display text for raw data values that appear in the UI but must
   * stay unchanged in the underlying data/export (S2 issue field). */
  issue_labels: { "Career": "職涯", "Inter": "人際" },
};

window.CODING_SCHEME.coderLabel = function (coder) {
  return window.CODING_SCHEME.coder_labels[coder] || coder;
};
window.CODING_SCHEME.issueLabel = function (issue) {
  return window.CODING_SCHEME.issue_labels[issue] || issue || "";
};

/* Flat helper: every field, and a value->label lookup per categorical field. */
window.CODING_SCHEME.field_by_key = Object.fromEntries(
  window.CODING_SCHEME.fields.map((f) => [f.key, f])
);

window.CODING_SCHEME.options_of = function (field) {
  if (field.type !== "categorical") return [];
  const flat = field.groups
    ? field.groups.flatMap((g) => g.options)
    : field.options.slice();
  return flat.concat(field.extra_options || []);
};

/* App-level settings (non-scheme). */
window.APP_CONFIG = {
  storage_prefix: "hacp",             // Human-AI Coding Platform
  providers: {
    anthropic: {
      label: "Anthropic (Claude)",
      models: [
        { id: "claude-opus-4-8",            label: "Claude Opus 4.8（品質最高，適合當裁判）" },
        { id: "claude-sonnet-5",            label: "Claude Sonnet 5（速度與品質平衡）" },
        { id: "claude-haiku-4-5-20251001",  label: "Claude Haiku 4.5（快速／便宜，適合大量跑）" },
      ],
    },
    openai: {
      label: "OpenAI (GPT)",
      models: [
        { id: "gpt-4o",      label: "GPT-4o" },
        { id: "gpt-4o-mini", label: "GPT-4o mini（便宜）" },
      ],
    },
  },
  default_provider: "anthropic",
};
