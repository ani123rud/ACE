// inspect_recent_answers.js
// Usage: node inspect_recent_answers.js [--minutes 180] [--limit 100]
// Prints recent answers with session domain, question text, createdAt, and eval.score presence.
// Requires: npm install mongodb

const { MongoClient, ObjectId } = require('mongodb');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { minutes: 180, limit: 100 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--minutes') out.minutes = Number(args[++i]);
    else if (a === '--limit') out.limit = Number(args[++i]);
  }
  return out;
}

(async () => {
  const opts = parseArgs();
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const answers = db.collection('answers');
    const sessions = db.collection('sessions');
    const questions = db.collection('questions');

    const since = new Date(Date.now() - (opts.minutes * 60 * 1000));

    const pipeline = [
      { $match: { createdAt: { $gte: since } } },
      { $sort: { createdAt: -1 } },
      { $limit: Math.max(1, Math.min(1000, opts.limit)) },
      { $lookup: { from: 'sessions', localField: 'sessionId', foreignField: '_id', as: 's' } },
      { $unwind: { path: '$s', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'questions', localField: 'questionId', foreignField: '_id', as: 'q' } },
      { $unwind: { path: '$q', preserveNullAndEmptyArrays: true } },
      { $project: {
          _id: 0,
          answer_id: '$_id',
          createdAt: 1,
          sessionId: 1,
          domain: '$s.domain',
          question: '$q.question',
          eval_score: '$eval.score',
          has_refs: { $gt: [{ $size: { $ifNull: ['$retrievedRefs', []] } }, 0] }
      }}
    ];

    const list = await answers.aggregate(pipeline, { allowDiskUse: true }).toArray();
    console.log(JSON.stringify({ since: since.toISOString(), count: list.length, items: list }, null, 2));
  } catch (e) {
    console.error('[inspect] failed:', e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
