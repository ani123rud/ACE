// seed_questions.js
// Purpose: Seed MongoDB with a reasonable set of questions for domains detected in sessions
// without relying on LlamaIndex runtime. Uses upsert to avoid duplicates.
// Requires: npm install mongodb

const { MongoClient } = require('mongodb');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";

// Basic seed bank per domain keyword
const TEMPLATES = {
  dbms: [
    { q: "Explain normalization and its types.", d: "easy" },
    { q: "What is an index in databases and when to use it?", d: "easy" },
    { q: "Compare ACID vs BASE properties.", d: "medium" },
    { q: "Explain transaction isolation levels with examples.", d: "medium" },
    { q: "Design a schema for an e-commerce order system.", d: "hard" },
    { q: "How would you detect and resolve deadlocks?", d: "hard" }
  ],
  javascript: [
    { q: "Explain closures with an example.", d: "easy" },
    { q: "What is event loop and microtask queue?", d: "medium" },
    { q: "Difference between var, let, const.", d: "easy" },
    { q: "Explain prototypes and prototypal inheritance.", d: "medium" },
    { q: "Optimize a large list rendering scenario.", d: "hard" },
    { q: "What is debouncing vs throttling?", d: "easy" }
  ],
  go: [
    { q: "What are goroutines and channels?", d: "easy" },
    { q: "Explain Go memory management and escape analysis.", d: "hard" },
    { q: "How does context.Context propagate cancellation?", d: "medium" },
    { q: "Interface vs concrete types trade-offs.", d: "medium" },
    { q: "Design a worker pool in Go.", d: "hard" }
  ],
  technical: [
    { q: "Explain Big-O for common data structures.", d: "easy" },
    { q: "Design a URL shortener.", d: "medium" },
    { q: "CAP theorem: implications for system design.", d: "medium" },
    { q: "Consistency models in distributed systems.", d: "hard" }
  ]
};

function pickTemplates(domain) {
  const key = String(domain || '').toLowerCase();
  if (TEMPLATES[key]) return TEMPLATES[key];
  // default generic set
  return [
    { q: `What are the core concepts in ${domain}?`, d: "easy" },
    { q: `Explain an important algorithm or technique in ${domain}.`, d: "medium" },
    { q: `Discuss trade-offs of two approaches in ${domain}.`, d: "medium" },
    { q: `Design a solution to a common ${domain} problem.`, d: "hard" }
  ];
}

(async () => {
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const sessions = db.collection('sessions');
    const questions = db.collection('questions');

    // Discover domains from sessions (excluding null) and add a known set
    const fromSessions = await sessions.aggregate([
      { $match: { domain: { $ne: null } } },
      { $group: { _id: "$domain", c: { $sum: 1 } } },
      { $sort: { c: -1 } },
      { $limit: 20 }
    ]).toArray();

    const candidateDomains = new Set(["dbms", "javascript", "go", "technical"]);
    for (const d of fromSessions) {
      if (d._id) candidateDomains.add(String(d._id));
    }

    const domains = Array.from(candidateDomains);
    console.log("[seed] target domains:", domains.join(", "));

    const ops = [];
    for (const domain of domains) {
      const bank = pickTemplates(domain);
      for (const item of bank) {
        ops.push({
          updateOne: {
            filter: { domain, question: item.q },
            update: {
              $setOnInsert: { domain, question: item.q },
              $set: {
                difficulty: item.d,
                tags: [],
                source: 'seed:auto',
              }
            },
            upsert: true
          }
        });
      }
    }

    if (ops.length) {
      const res = await questions.bulkWrite(ops, { ordered: false });
      console.log("[seed] bulk upsert done:", JSON.stringify(res, null, 2));
    } else {
      console.log("[seed] no operations to perform");
    }

    // Print post counts
    const counts = await questions.aggregate([
      { $group: { _id: "$domain", count: { $sum: 1 }, sources: { $addToSet: "$source" } } },
      { $sort: { count: -1 } }]).toArray();
    console.log("\n[questions by domain after seed]");
    counts.forEach((d, i) => console.log(`${i+1}. ${d._id || '(null)'}: ${d.count} [${(d.sources||[]).filter(Boolean).join('|')}]`));

  } catch (e) {
    console.error('Seed failed:', e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
