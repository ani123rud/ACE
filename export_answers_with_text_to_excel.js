// export_answers_with_text_to_excel.js
// Requires: npm install mongodb xlsx
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const XLSX = require('xlsx');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";
const LIMIT = 500;

const XLSX_OUT = "answers_export_text.xlsx"; // append as new sheet if exists

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function writeFileWithRetry(workbook, outPath, retries = 10, delayMs = 1000) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      XLSX.writeFile(workbook, outPath);
      return;
    } catch (e) {
      lastErr = e;
      if (e && e.code === 'EBUSY') {
        if (i < retries) await sleep(delayMs);
        else break;
      } else {
        break;
      }
    }
  }
  throw lastErr;
}

(async () => {
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const answers = db.collection('answers');
    const questions = db.collection('questions');

    // Pull recent answers that have eval.score
    const cursor = answers.aggregate([
      { $match: { "eval.score": { $ne: null } } },
      { $project: {
          _id: 1,
          sessionId: 1,
          questionId: 1,
          candidateText: 1,
          model_score: "$eval.score"
      }},
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
      rows.push({
        answer_id: aid,
        session_id: sid,
        question_id: qid,
        candidate_text: doc.candidateText || "",
        model_score: doc.model_score
      });
    }

    // Fetch question texts for these IDs
    const qidArr = Array.from(qIds).filter(Boolean);
    const qMap = new Map();
    if (qidArr.length) {
      const qDocs = await questions.find({ _id: { $in: qidArr.map(id => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) } })
        .project({ question: 1 })
        .toArray();
      for (const q of qDocs) {
        qMap.set(String(q._id), q.question || "");
      }
    }

    // Attach question text
    const out = rows.map(r => ({
      answer_id: r.answer_id,
      session_id: r.session_id,
      question_id: r.question_id,
      question_text: qMap.get(r.question_id) || "",
      candidate_text: r.candidate_text,
      model_score: r.model_score,
      human_label: "" // 0/1 or your chosen schema; leave blank for manual labeling
    }));

    // Load or create workbook
    let wb;
    if (fs.existsSync(XLSX_OUT)) {
      wb = XLSX.readFile(XLSX_OUT);
    } else {
      wb = XLSX.utils.book_new();
    }

    // Append as new sheet (do not overwrite prior sheet)
    const ws = XLSX.utils.json_to_sheet(out);
    const sheetNameBase = "answers_with_text";
    let sheetName = sheetNameBase;
    let idx = 1;
    while (wb.SheetNames.includes(sheetName)) {
      idx += 1;
      sheetName = `${sheetNameBase}_${idx}`;
    }
    // Append sheet first so we can safely compute ranges
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Add threshold and metrics + a predicted column with formulas
    const headerRow = 1;
    const dataStart = 2;
    const dataEnd = out.length + 1; // header + rows
    // Header for predicted
    ws["H" + headerRow] = { t: 's', v: 'predicted' };
    // Threshold label/value
    ws["L1"] = { t: 's', v: 'threshold' };
    ws["M1"] = { t: 'n', v: 7 };
    // Metrics labels
    ws["L3"] = { t: 's', v: 'TP' };
    ws["L4"] = { t: 's', v: 'FP' };
    ws["L5"] = { t: 's', v: 'FN' };
    ws["L6"] = { t: 's', v: 'Precision' };
    ws["L7"] = { t: 's', v: 'Recall' };
    ws["L8"] = { t: 's', v: 'F1' };
    // Formulas for metrics
    ws["M3"] = { t: 'n', f: `COUNTIFS(G:G,1,H:H,1)` };
    ws["M4"] = { t: 'n', f: `COUNTIFS(G:G,0,H:H,1)` };
    ws["M5"] = { t: 'n', f: `COUNTIFS(G:G,1,H:H,0)` };
    ws["M6"] = { t: 'n', f: `IF(M3+M4=0,0,M3/(M3+M4))` };
    ws["M7"] = { t: 'n', f: `IF(M3+M5=0,0,M3/(M3+M5))` };
    ws["M8"] = { t: 'n', f: `IF(M6+M7=0,0,2*M6*M7/(M6+M7))` };

    // Per-row predicted formulas based on threshold in M1
    for (let r = dataStart; r <= dataEnd; r++) {
      ws["H" + r] = { t: 'n', f: `--(F${r}>=\$M\$1)` };
    }

    // Expand the worksheet range to include added columns/rows
    const maxRow = Math.max(dataEnd, 8);
    ws['!ref'] = `A1:M${maxRow}`;

    await writeFileWithRetry(wb, XLSX_OUT);

    console.log(`Appended sheet '${sheetName}' to ${XLSX_OUT}`);
  } catch (e) {
    console.error("Export with text failed:", e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
