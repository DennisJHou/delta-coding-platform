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
              def: "幫助使用者避開預期會引發負面情緒的情境，包括人、地點、任務等外在刺激。判斷口訣：句子核心動詞是「避開／遠離／不要接觸」——重點在「躲開情境」，而不是「改變情境」。" },
            { value: "situation_modification", label: "情境修改 Situation Modification",
              def: "建議使用者改變、移除或調整當前或預期情境的某些面向，以降低其情緒衝擊。判斷口訣：句子提出「具體可執行的行動方案」去解決／調整外部問題本身——不是只換想法，是真的要做點什麼改變現實。" },
            { value: "attentional_deployment", label: "注意力分散 Attentional Deployment",
              def: "嘗試將使用者的注意力從引發情緒反應的情境元素上移開，屬於注意力部署的一種形式。判斷口訣：AI 主動「換話題」到一件和問題「無關」的開心／中性事物上，而不是繼續談這個問題（哪怕是正面地談）。" },
            { value: "cognitive_change",       label: "認知重評 Cognitive Change (Reappraisal)",
              def: "幫助使用者重新詮釋引發情緒的情境，以改變其情緒影響；例如引導伴侶從不同角度看待問題。判斷口訣：問題「本身沒有改變」，但 AI 提供了「新的解釋／新的意義框架」，讓使用者對同一件事有不同的感受。" },
            { value: "expression",             label: "表達 Expression",
              def: "鼓勵使用者以語言、書寫或行為來表達其情緒狀態。判斷口訣：AI建議使用者「表達出來、多說一點」。" },
            { value: "suppression",            label: "壓抑 Suppression",
              def: "建議伴侶壓制或收斂其負面情緒的外在行為表現。判斷口訣：AI 建議使用者「忍住、別表現出來、先冷處理」——這在支持型對話中極少見，出現時通常很明顯（且常被視為較負面的介入方式）。" },
          ],
        },
        {
          name: "正向情緒策略",
          options: [
            { value: "savoring",  label: "品味 Savoring",
              def: "慶祝並延續伴侶的好消息或正向體驗，幫助其延長或增強正向情緒。判斷口訣：AI 跟著一起開心、放大喜悅，鼓勵使用者好好享受這個時刻。" },
            { value: "dampening", label: "抑制（淡化） Dampening",
              def: "試圖降低伴侶的正向情緒，例如指出令伴侶開心的事情可能存在的負面面向。判斷口訣：使用者正在開心／興奮，AI 卻「潑冷水」或提醒風險、叫使用者收斂。" },
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
          def: "AI是否準確理解並從使用者視角詮釋其想法與處境的能力，強調「理解」與「觀點採納」（perspective-taking）。判斷口訣：回覆的重點是「精準說出你在想什麼、你的處境是什麼」，像是把使用者的內心話講出來。" },
        { value: "affective",    label: "情感 Affective",
          def: "AI是否真實地感受、共鳴並回應使用者所經歷的情緒，強調情緒上的「共感」與「情感同步」（emotional synchrony）。判斷口訣：回覆的重點是「AI 自己也感受到了那份情緒」，像是被使用者的故事打動、跟著難過或開心。" },
        { value: "motivational", label: "動機 Motivational",
          def: "AI是否展現出主動關懷、願意提供支持與幫助的動機與意圖，強調「關心」（care）與「行動傾向」（desire to help）。判斷口訣：回覆的重點是「AI 表達想幫忙、在乎你的福祉」，帶有行動導向（提供建議、願意陪伴），而不只是理解或共感。" },
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
