// export_answers_with_text.js
// Usage: node export_answers_with_text.js [--minDate YYYY-MM-DD] [--outfile answers_export_text.xlsx] [--sheetPrefix answers_with_text] [--includePending] [--domain DOMAIN]
// Exports Answers with question text, candidate text, model_score (eval.score), and a heuristic human_label.
// Heuristic human_label (no manual labeling):
//   human_label = 1 if (model_score >= 7) AND (retrievedRefs length >= 1)
//   else 0
// Requires: npm install mongodb xlsx

const { MongoClient, ObjectId } = require('mongodb');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { minDate: null, outfile: 'answers_export_text.xlsx', sheetPrefix: 'answers_with_text', includePending: false, domain: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--minDate') out.minDate = args[++i];
    else if (a === '--outfile') out.outfile = args[++i];
    else if (a === '--sheetPrefix') out.sheetPrefix = args[++i];
    else if (a === '--includePending') out.includePending = true;
    else if (a === '--domain') out.domain = args[++i];
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
    const questions = db.collection('questions');
    const sessions = db.collection('sessions');

    const match = opts.includePending ? {} : { 'eval.score': { $ne: null } };
    if (opts.minDate) {
      const d = new Date(opts.minDate);
      if (!isNaN(d.getTime())) match.createdAt = { $gte: d };
    }
    if (opts.domain) {
      // Join with sessions to filter by domain
      const sessionIds = await sessions.find({ domain: opts.domain }, { projection: { _id: 1 } }).toArray();
      if (sessionIds.length) match.sessionId = { $in: sessionIds.map(s => s._id) };
    }

    const cursor = answers.aggregate([
      { $match: match },
      { $project: { sessionId: 1, questionId: 1, candidateText: 1, eval: 1, retrievedRefs: 1, createdAt: 1 } },
      { $lookup: { from: 'questions', localField: 'questionId', foreignField: '_id', as: 'q' } },
      { $unwind: { path: '$q', preserveNullAndEmptyArrays: true } },
    ], { allowDiskUse: true });

    const rows = [];
    for await (const a of cursor) {
      let score = a?.eval?.score;
      const refs = Array.isArray(a?.retrievedRefs) ? a.retrievedRefs : [];
      let synthetic = false;
      if (typeof score !== 'number') {
        if (!opts.includePending) continue; // safety
        // Heuristic synthetic score when eval is missing: favor answers with refs
        score = refs.length > 0 ? 7 : 4;
        synthetic = true;
      }
      const human = (score >= 7 && refs.length >= 1) ? 1 : 0;
      rows.push({
        session_id: String(a.sessionId || ''),
        question_id: String(a.questionId || ''),
        question: a?.q?.question || '',
        candidate_text: a?.candidateText || '',
        model_score: score,
        synthetic_score: synthetic ? 1 : 0,
        human_label: human,
        created_at: a?.createdAt ? new Date(a.createdAt).toISOString() : ''
      });
    }

    if (rows.length === 0) {
      console.log('[export] no answers found to export');
      process.exit(0);
    }

    const wb = fs.existsSync(opts.outfile) ? XLSX.readFile(opts.outfile) : XLSX.utils.book_new();
    // Compact sheet name: prefix_YYYYMMDD_HHMMSS (<=31 chars)
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    let base = `${opts.sheetPrefix}_${ts}`.slice(0, 31);
    if (base.length > 31) base = base.slice(0, 31);
    let sheetName = base;
    let suffix = 1;
    while (wb.SheetNames.includes(sheetName)) {
      const suff = `_${suffix++}`;
      sheetName = (base.slice(0, Math.max(0, 31 - suff.length)) + suff);
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, opts.outfile);

    console.log(JSON.stringify({ outfile: path.basename(opts.outfile), sheet: sheetName, rows: rows.length, includePending: opts.includePending, domain: opts.domain || null }, null, 2));
  } catch (e) {
    console.error('[export] failed:', e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
