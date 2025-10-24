// compute_integrity_metrics.js
// Usage: node compute_integrity_metrics.js [--t1 0.8] [--t2 0.85]
// Heuristic ground truth: session is positive (breach) if it has any high-severity alert,
// or >= 2 alerts among key types (tab_switch, multi_speaker, face_count) within the session.
// Computes TPR/FPR at thresholds and AUC over integrity score derived from alerts
// using computeIntegrityScore() logic replicated here for portability.
// Requires: npm install mongodb

const { MongoClient } = require('mongodb');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { t1: 0.8, t2: 0.85 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--t1') out.t1 = Number(args[++i]);
    else if (a === '--t2') out.t2 = Number(args[++i]);
  }
  return out;
}

function computeIntegrityScore(logs) {
  let score = 100;
  if (!Array.isArray(logs) || logs.length === 0) return score;
  const lastApplied = { tab_switch: 0, face_count: 0, noise: 0, multi_speaker: 0 };
  const WINDOW_MS = 60_000;
  const sorted = [...logs].sort((a, b) => new Date(a.at || a.createdAt || 0) - new Date(b.at || b.createdAt || 0));
  for (const l of sorted) {
    const t = l.type;
    if (!t || !(t in lastApplied)) continue;
    const nowTs = new Date(l.at || l.createdAt || Date.now()).getTime();
    if (nowTs - lastApplied[t] < WINDOW_MS) continue;
    if (t === 'tab_switch') { score -= 5; lastApplied[t] = nowTs; }
    else if (t === 'face_count') {
      const c = l?.data?.count;
      if (c === 0 || c > 1) { score -= 4; lastApplied[t] = nowTs; }
    } else if (t === 'noise') { score -= 1; lastApplied[t] = nowTs; }
    else if (t === 'multi_speaker') { score -= 6; lastApplied[t] = nowTs; }
  }
  return Math.max(0, Math.min(100, score));
}

function rocAUC(points) {
  // points: array of { thr, tpr, fpr }
  // Sort by fpr asc and integrate TPR over FPR using trapezoidal rule
  const a = [...points].sort((x, y) => x.fpr - y.fpr);
  let auc = 0;
  for (let i = 1; i < a.length; i++) {
    const x0 = a[i-1].fpr, x1 = a[i].fpr;
    const y0 = a[i-1].tpr, y1 = a[i].tpr;
    auc += (x1 - x0) * (y0 + y1) / 2;
  }
  return auc;
}

function binarize(yScore, thr) {
  return yScore >= thr ? 1 : 0;
}

(async () => {
  const opts = parseArgs();
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const alerts = db.collection('alerts');
    // Pull alerts per session
    const cur = alerts.aggregate([
      { $group: { _id: '$sessionId', events: { $push: { type: '$type', severity: '$severity', at: '$at', data: '$data' } } } }
    ]);
    const rows = [];
    for await (const s of cur) {
      const sessionId = String(s._id || '');
      const evs = (s.events || []).map(e => ({ type: e.type, severity: e.severity, at: Number(e.at) || Date.now(), data: e.data || {} }));
      const score = computeIntegrityScore(evs) / 100; // 0..1
      // Heuristic ground truth for breach
      const hasHigh = evs.some(e => String(e.severity).toLowerCase() === 'high');
      const keyTypes = new Set();
      for (const e of evs) if (['tab_switch','multi_speaker','face_count'].includes(e.type)) keyTypes.add(e.type);
      const gt = (hasHigh || keyTypes.size >= 2) ? 1 : 0;
      rows.push({ sessionId, score, gt });
    }
    if (rows.length === 0) {
      console.log(JSON.stringify({ note: 'no alerts found' }, null, 2));
      return;
    }
    // TPR/FPR at thresholds
    function tprfpr(thr) {
      let TP=0, FP=0, FN=0, TN=0;
      for (const r of rows) {
        const pred = binarize(r.score, thr);
        if (pred===1 && r.gt===1) TP++; else if (pred===1 && r.gt===0) FP++; else if (pred===0 && r.gt===1) FN++; else TN++;
      }
      const TPR = (TP+FN) ? TP/(TP+FN) : 0; // recall
      const FPR = (FP+TN) ? FP/(FP+TN) : 0;
      return { TPR, FPR, TP, FP, FN, TN };
    }

    const t1 = Number(opts.t1);
    const t2 = Number(opts.t2);
    const sPoints = [];
    for (let thr = 0; thr <= 1.0001; thr += 0.01) {
      const { TPR, FPR } = tprfpr(Number(thr.toFixed(2)));
      sPoints.push({ thr: Number(thr.toFixed(2)), tpr: TPR, fpr: FPR });
    }
    const auc = rocAUC(sPoints);
    const m1 = tprfpr(t1);
    const m2 = tprfpr(t2);

    console.log(JSON.stringify({
      n_sessions: rows.length,
      threshold_0_80: { TPR: Number(m1.TPR.toFixed(3)), FPR: Number(m1.FPR.toFixed(3)), TP: m1.TP, FP: m1.FP, FN: m1.FN, TN: m1.TN },
      threshold_0_85: { TPR: Number(m2.TPR.toFixed(3)), FPR: Number(m2.FPR.toFixed(3)), TP: m2.TP, FP: m2.FP, FN: m2.FN, TN: m2.TN },
      AUC: Number(auc.toFixed(3))
    }, null, 2));
  } catch (e) {
    console.error('[integrity] failed:', e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
