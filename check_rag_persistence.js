// check_rag_persistence.js
// Read-only check of MongoDB Atlas to verify RAG question persistence and session volume.
// Requires: npm install mongodb (already installed)
const { MongoClient } = require('mongodb');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";

(async () => {
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const questions = db.collection('questions');
    const sessions = db.collection('sessions');
    const answers = db.collection('answers');

    // Basic counts
    const [qCount, sCount, aCount] = await Promise.all([
      questions.countDocuments({}),
      sessions.countDocuments({}),
      answers.countDocuments({}),
    ]);

    console.log('[counts] questions:', qCount);
    console.log('[counts] sessions :', sCount);
    console.log('[counts] answers  :', aCount);

    // Top domains by question count
    const topDomains = await questions.aggregate([
      { $group: { _id: "$domain", count: { $sum: 1 }, sources: { $addToSet: "$source" } } },
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]).toArray();

    console.log('\n[top domains by question count]');
    topDomains.forEach((d, i) => {
      console.log(`${i+1}. domain=${d._id || '(null)'} count=${d.count} sources=${(d.sources||[]).filter(Boolean).join('|')}`);
    });

    // Inspect whether RAG-sourced items exist (source:'rag:llamaindex')
    const ragCount = await questions.countDocuments({ source: 'rag:llamaindex' });
    console.log(`\n[rag persistence] questions with source:\'rag:llamaindex\' = ${ragCount}`);

    // If available, show a small sample of RAG questions
    if (ragCount > 0) {
      const ragSample = await questions.find({ source: 'rag:llamaindex' }).project({ _id: 0, domain: 1, question: 1, difficulty: 1 }).limit(5).toArray();
      console.log('\n[sample rag questions]');
      ragSample.forEach((q, idx) => console.log(`${idx+1}. [${q.domain}] (${q.difficulty}) ${q.question}`));
    }

    // Sessions by domain (top 10)
    const sessionByDomain = await sessions.aggregate([
      { $group: { _id: "$domain", sessions: { $sum: 1 } } },
      { $sort: { sessions: -1 } },
      { $limit: 10 }
    ]).toArray();
    console.log('\n[top domains by sessions]');
    sessionByDomain.forEach((d, i) => console.log(`${i+1}. domain=${d._id || '(null)'} sessions=${d.sessions}`));

  } catch (e) {
    console.error('Check failed:', e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
