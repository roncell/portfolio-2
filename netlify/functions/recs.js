// Serves precomputed recommendations (cosine on mean-centered XLM-R lyric embeddings,
// 84 MPD tracks from the repo's April 2025 prototype). No model runs here.
const RECS = require("../../music/data/recs.json");
const LANGS = new Set(["en", "ko-Latn", "mixed", "any"]);
const headers = { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "public, max-age=300" };

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  if (q.seed === undefined) {
    const catalog = Object.values(RECS).map((r) => r.seed);
    return { statusCode: 200, headers, body: JSON.stringify({ tracks: catalog }) };
  }
  const entry = RECS[String(parseInt(q.seed, 10))];
  if (!entry) return { statusCode: 404, headers, body: JSON.stringify({ error: "Unknown seed. Call /api/recs with no seed to list track ids." }) };
  const lang = LANGS.has(q.lang) ? q.lang : "any";
  const k = Math.min(10, Math.max(1, parseInt(q.k, 10) || 5));
  return { statusCode: 200, headers, body: JSON.stringify({ seed: entry.seed, lang, k, model: "xlm-roberta-base (mean-centered cosine)", recs: entry.recs[lang].slice(0, k) }) };
};
