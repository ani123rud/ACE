// export_answers_to_excel.js
// Requires: npm install mongodb xlsx
const { MongoClient } = require('mongodb');
const fs = require('fs');
const XLSX = require('xlsx');

// Atlas URI provided by you (avoid committing it to Git)
const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";

const DB_NAME = "ai_interviewer";
const COLL = "answers";
const LIMIT = 500;

const CSV_OUT = "answers_export_with_header.csv";
const XLSX_OUT = "answers_export.xlsx";

(async () => {
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection(COLL);

    const cursor = col.aggregate([
      { $match: { "eval.score": { $ne: null } } },
      { $project: {
          _id: 0,
          answerId: { $toString: "$_id" },
          sessionId: { $toString: "$sessionId" },
          questionId: { $toString: "$questionId" },
          model_score: "$eval.score", // 0..10
          candidateText: 1
      }},
      { $sort: { _id: -1 } },
      { $limit: LIMIT }
    ]);

    const rows = [];
    const header = ["answer_id", "session_id", "question_id", "model_score"];
    rows.push(header);

    const dataForXlsx = [];
    for await (const doc of cursor) {
      const answerId = doc.answerId || "";
      const sessionId = doc.sessionId || "";
      const questionId = doc.questionId || "";
      const modelScoreStr = (doc.model_score ?? "").toString().replace(/,/g, ";");

      rows.push([answerId, sessionId, questionId, modelScoreStr]);
      dataForXlsx.push({
        answer_id: answerId,
        session_id: sessionId,
        question_id: questionId,
        model_score: Number.isFinite(Number(modelScoreStr)) ? Number(modelScoreStr) : modelScoreStr
      });
    }

    // CSV
    const csvContent = rows.map(r => r.map(f => String(f)).join(",")).join("\n");
    fs.writeFileSync(CSV_OUT, csvContent, { encoding: "utf8" });

    // Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataForXlsx);
    XLSX.utils.book_append_sheet(wb, ws, "answers");
    XLSX.writeFile(wb, XLSX_OUT);

    console.log(`Export complete:\n- ${CSV_OUT}\n- ${XLSX_OUT}\nNext: add a 'human_label' column (0/1) in Excel to compute F1.`);
  } catch (e) {
    console.error("Export failed:", e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
