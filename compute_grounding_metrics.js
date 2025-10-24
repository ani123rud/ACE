// compute_grounding_metrics.js
// Usage: node compute_grounding_metrics.js
// Outputs: Answers with sources (%), Avg retrieved snippets (k)
// Requires: npm install mongodb

const { MongoClient } = require('mongodb');

// Reuse the same Atlas URI and DB as export scripts
const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";

(async () => {
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const answers = db.collection('answers');

    const totalEval = await answers.countDocuments({ "eval.score": { $ne: null } });
    const withSources = await answers.countDocuments({ "retrievedRefs.0": { $exists: true } });

    const agg = await answers.aggregate([
      { $match: { retrievedRefs: { $type: 'array' } } },
      { $project: { k: { $size: "$retrievedRefs" } } },
      { $group: { _id: null, avgK: { $avg: "$k" }, n: { $sum: 1 } } }
    ]).toArray();

    const avgK = agg[0]?.avgK ?? 0;
    const nK = agg[0]?.n ?? 0;

    const pctSources = totalEval ? (100 * withSources / totalEval) : 0;

    console.log(JSON.stringify({
      answers_with_sources_pct: Number(pctSources.toFixed(2)),
      avg_retrieved_snippets_k: Number(avgK.toFixed(2)),
      counts: { total_evaluated: totalEval, with_sources: withSources, n_snippet_rows: nK }
    }, null, 2));
  } catch (e) {
    console.error("[grounding] failed:", e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
