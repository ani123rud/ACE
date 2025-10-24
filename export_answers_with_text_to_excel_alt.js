// export_answers_with_text_to_excel_alt.js
// Same as previous script but writes to a new Excel file to avoid file lock (EBUSY)
// Requires: npm install mongodb xlsx
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const XLSX = require('xlsx');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";
const LIMIT = 500;

// Write to a new file to bypass lock on answers_export.xlsx
const XLSX_OUT = "answers_export_text.xlsx";

(async () => {
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const answers = db.collection('answers');
    const questions = db.collection('questions');

    const cursor = answers.aggregate([
      { $match: { "eval.score": { $ne: null } } },
      { $project: { _id: 1, sessionId: 1, questionId: 1, candidateText: 1, model_score: "$eval.score" } },
      { $sort: { _id: -1 } },
      { $limit: LIMIT }
    ]);

    const rows = [];
    const qIds = new Set();
    for await (const doc of cursor) {
      const aid = String(doc._id);
      const sid = doc.sessionId ? String(doc.sessionId) : "";
      const qid = doc.questionId ? String(doc.questionId) : "";
      if (qid) qIds.add(qid);
      rows.push({ answer_id: aid, session_id: sid, question_id: qid, candidate_text: doc.candidateText || "", model_score: doc.model_score });
    }

    const qidArr = Array.from(qIds).filter(Boolean);
    const qMap = new Map();
    if (qidArr.length) {
      const qDocs = await questions.find({ _id: { $in: qidArr.map(id => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) } })
        .project({ question: 1 })
        .toArray();
      for (const q of qDocs) qMap.set(String(q._id), q.question || "");
    }

    const out = rows.map(r => ({
      answer_id: r.answer_id,
      session_id: r.session_id,
      question_id: r.question_id,
      question_text: qMap.get(r.question_id) || "",
      candidate_text: r.candidate_text,
      model_score: r.model_score
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(out);
    XLSX.utils.book_append_sheet(wb, ws, "answers_with_text");
    XLSX.writeFile(wb, XLSX_OUT);

    console.log(`Exported: ${XLSX_OUT}`);
  } catch (e) {
    console.error("Export with text failed:", e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
