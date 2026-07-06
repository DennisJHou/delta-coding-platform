/* =============================================================================
 * stats.js — pure statistics (no DOM, no globals it doesn't own). Testable.
 *   • pearson            — for the sentiment scale
 *   • cohensKappa        — for categorical agreement (strategy, empathy)
 *   • weightedKappa      — quadratic-weighted, for ordinal sentiment
 *   • percentAgreement
 *   • slope / turningPoint — sentiment trajectory dynamics (the "Turning Point")
 * All take `pairs` = array of [a, b] with nulls already filtered out.
 * ========================================================================== */

const Stats = (() => {
  function pearson(pairs) {
    const n = pairs.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pairs) { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
    const cov = sxy - (sx * sy) / n;
    const vx = sxx - (sx * sx) / n;
    const vy = syy - (sy * sy) / n;
    if (vx <= 0 || vy <= 0) return null;   // no variance -> r undefined
    return cov / Math.sqrt(vx * vy);
  }

  function _confusion(pairs, categories) {
    const idx = Object.fromEntries(categories.map((c, i) => [String(c), i]));
    const k = categories.length;
    const M = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const [a, b] of pairs) {
      const i = idx[String(a)], j = idx[String(b)];
      if (i === undefined || j === undefined) continue;
      M[i][j]++;
    }
    return M;
  }

  function cohensKappa(pairs, categories) {
    const n = pairs.length;
    if (!n) return null;
    const k = categories.length;
    const M = _confusion(pairs, categories);
    let po = 0; for (let i = 0; i < k; i++) po += M[i][i]; po /= n;
    const rows = M.map((r) => r.reduce((a, b) => a + b, 0));
    const cols = categories.map((_, j) => M.reduce((a, r) => a + r[j], 0));
    let pe = 0; for (let i = 0; i < k; i++) pe += (rows[i] / n) * (cols[i] / n);
    if (pe === 1) return 1;                // everyone used one category & agreed
    return (po - pe) / (1 - pe);
  }

  /** Quadratic-weighted kappa for ORDERED categories (e.g. -3..3). */
  function weightedKappa(pairs, categories) {
    const n = pairs.length;
    if (!n) return null;
    const k = categories.length;
    if (k < 2) return null;
    const O = _confusion(pairs, categories);
    const rows = O.map((r) => r.reduce((a, b) => a + b, 0));
    const cols = categories.map((_, j) => O.reduce((a, r) => a + r[j], 0));
    const w = (i, j) => ((i - j) * (i - j)) / ((k - 1) * (k - 1));
    let num = 0, den = 0;
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++) {
        const eij = (rows[i] * cols[j]) / n;
        num += w(i, j) * O[i][j];
        den += w(i, j) * eij;
      }
    if (den === 0) return 1;
    return 1 - num / den;
  }

  function percentAgreement(pairs) {
    if (!pairs.length) return null;
    let a = 0;
    for (const [x, y] of pairs) if (String(x) === String(y)) a++;
    return a / pairs.length;
  }

  /** Mean Jaccard similarity (|A∩B|/|A∪B|) across co-labelled multi-select cells. */
  function jaccardMean(pairsOfArrays) {
    const f = pairsOfArrays.filter(([a, b]) => a && b && a.length && b.length);
    if (!f.length) return null;
    let sum = 0;
    for (const [a, b] of f) {
      const A = new Set(a), B = new Set(b);
      const inter = [...A].filter((x) => B.has(x)).length;
      const union = new Set([...A, ...B]).size;
      sum += union === 0 ? 1 : inter / union;
    }
    return sum / f.length;
  }

  /** Multi-label agreement for categorical sets: macro-average of per-category
   *  binary present/absent Cohen's kappa, skipping categories neither rater
   *  ever used (no information -> would otherwise show a meaningless kappa). */
  function multiLabelKappaMacro(pairsOfArrays, categories) {
    const f = pairsOfArrays.filter(([a, b]) => a && b && a.length && b.length);
    if (!f.length) return null;
    let total = 0, counted = 0;
    for (const cat of categories) {
      const bin = f.map(([a, b]) => [a.includes(cat) ? 1 : 0, b.includes(cat) ? 1 : 0]);
      if (!bin.some(([x, y]) => x === 1 || y === 1)) continue;   // never used by either rater
      const k = cohensKappa(bin, [0, 1]);
      if (k == null || Number.isNaN(k)) continue;
      total += k; counted++;
    }
    return counted ? total / counted : null;
  }

  /** Least-squares slope of y over x for points [{x,y}], nulls filtered. */
  function slope(points) {
    const f = points.filter((p) => p.y != null);
    const n = f.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of f) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
    const d = n * sxx - sx * sx;
    if (d === 0) return null;
    return (n * sxy - sx * sy) / d;
  }

  /** Largest single-step change in sentiment = candidate "Turning Point". */
  function turningPoint(points) {
    const f = points.filter((p) => p.y != null);
    let best = null;
    for (let i = 1; i < f.length; i++) {
      const delta = f[i].y - f[i - 1].y;
      if (best === null || Math.abs(delta) > Math.abs(best.delta))
        best = { atIndex: f[i].x, fromIndex: f[i - 1].x, delta };
    }
    return best;
  }

  /** Interpret a kappa with the common Landis & Koch bands (Chinese labels). */
  function kappaLabel(k) {
    if (k == null) return "—";
    if (k < 0) return "不佳";
    if (k < 0.20) return "輕微";
    if (k < 0.40) return "尚可";
    if (k < 0.60) return "中度";
    if (k < 0.80) return "高度";
    return "近乎完美";
  }

  return { pearson, cohensKappa, weightedKappa, percentAgreement,
           jaccardMean, multiLabelKappaMacro,
           slope, turningPoint, kappaLabel };
})();

// Node (test) + browser (global) dual-export.
if (typeof module !== "undefined" && module.exports) module.exports = Stats;
if (typeof window !== "undefined") window.Stats = Stats;
