// compute_f1.js
// Usage: node compute_f1.js [--file answers_export_text.xlsx] [--sheet SHEET_NAME] [--threshold 6] [--prevalence 0.5] [--write] [--bootstrap] [--iters 1000]
// - If --write is provided, and human_label is missing or blank, it will create a new sheet with random human_label values.
// - Computes precision, recall, and F1 comparing model predictions (model_score >= threshold) vs human_label (0/1).
// - If --bootstrap is provided, computes 95% CI via bootstrap with --iters resamples (default 1000).
// Requires: npm install xlsx

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    file: 'answers_export_text.xlsx',
    sheet: null,
    threshold: 6,
    prevalence: 0.5,
    write: false,
    bootstrap: false,
    iters: 1000,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file') out.file = args[++i];
    else if (a === '--sheet') out.sheet = args[++i];
    else if (a === '--threshold') out.threshold = Number(args[++i]);
    else if (a === '--prevalence') out.prevalence = Number(args[++i]);
    else if (a === '--write') out.write = true;
    else if (a === '--bootstrap') out.bootstrap = true;
    else if (a === '--iters') out.iters = Number(args[++i]);
  }
  return out;
}

function pickSheetName(wb, preferred) {
  if (preferred && wb.SheetNames.includes(preferred)) return preferred;
  // Prefer the last appended answers_with_text* sheet
  const candidates = wb.SheetNames.filter(s => /^answers_with_text(\b|_)/i.test(s));
  if (candidates.length) return candidates[candidates.length - 1];
  // fallback: first sheet
  return wb.SheetNames[0];
}

function computeMetrics(rows, threshold) {
  let TP = 0, FP = 0, FN = 0, TN = 0;
  for (const r of rows) {
    const y = Number(r.human_label);
    if (!Number.isFinite(y)) continue;
    const pred = Number(r.model_score) >= threshold ? 1 : 0;
    if (pred === 1 && y === 1) TP++;
    else if (pred === 1 && y === 0) FP++;
    else if (pred === 0 && y === 1) FN++;
    else if (pred === 0 && y === 0) TN++;
  }
  const precision = TP + FP === 0 ? 0 : TP / (TP + FP);
  const recall = TP + FN === 0 ? 0 : TP / (TP + FN);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { TP, FP, FN, TN, precision, recall, f1 };
}

function bootstrapCI(rows, threshold, iters = 1000, alpha = 0.05) {
  const labeled = rows.filter(r => String(r.human_label).trim() !== '');
  if (labeled.length === 0) return null;
  const prec = [], rec = [], f1s = [];
  for (let i = 0; i < iters; i++) {
    const sample = Array.from({ length: labeled.length }, () => labeled[Math.floor(Math.random() * labeled.length)]);
    const m = computeMetrics(sample, threshold);
    prec.push(m.precision);
    rec.push(m.recall);
    f1s.push(m.f1);
  }
  const pct = (arr, p) => {
    const a = [...arr].sort((x, y) => x - y);
    const idx = Math.max(0, Math.min(a.length - 1, Math.floor(p * a.length)));
    return a[idx];
  };
  const lo = alpha / 2;
  const hi = 1 - alpha / 2;
  return {
    precision95: [pct(prec, lo), pct(prec, hi)],
    recall95: [pct(rec, lo), pct(rec, hi)],
    f195: [pct(f1s, lo), pct(f1s, hi)],
  };
}

(function main() {
  const opts = parseArgs();
  if (!fs.existsSync(opts.file)) {
    console.error(`File not found: ${opts.file}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(opts.file);
  const sheetName = pickSheetName(wb, opts.sheet);
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.error(`Sheet not found: ${sheetName}`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // Ensure human_label exists; if write flag set and column is missing/blank, generate random labels
  const hasHuman = rows.some(r => r.hasOwnProperty('human_label'));
  const anyHumanFilled = rows.some(r => String(r.human_label).trim() !== '');
  let usedSheetName = sheetName;

  if (opts.write && (!hasHuman || !anyHumanFilled)) {
    const p = Math.max(0, Math.min(1, opts.prevalence));
    const labeled = rows.map(r => ({ ...r, human_label: Math.random() < p ? 1 : 0 }));
    const ws2 = XLSX.utils.json_to_sheet(labeled);
    let base = sheetName + '_labeled';
    let name = base;
    let idx = 1;
    while (wb.SheetNames.includes(name)) { idx++; name = base + '_' + idx; }
    XLSX.utils.book_append_sheet(wb, ws2, name);
    usedSheetName = name;
    XLSX.writeFile(wb, opts.file);
    console.log(`[write] Added random human_label (p=${p}) to new sheet '${name}' in ${opts.file}`);
  }

  // Re-read the sheet we will compute on
  const wsUsed = wb.Sheets[usedSheetName];
  const rowsUsed = XLSX.utils.sheet_to_json(wsUsed, { defval: '' });
  const metrics = computeMetrics(rowsUsed, opts.threshold);

  console.log(`[metrics] file=${path.basename(opts.file)} sheet='${usedSheetName}' threshold=${opts.threshold}`);
  console.log(metrics);
  if (opts.bootstrap) {
    const ci = bootstrapCI(rowsUsed, opts.threshold, Number.isFinite(opts.iters) && opts.iters > 0 ? opts.iters : 1000);
    if (ci) {
      console.log({
        precision95: ci.precision95,
        recall95: ci.recall95,
        f195: ci.f195,
        iters: opts.iters,
      });
    } else {
      console.log('[bootstrap] no labeled rows; CI unavailable');
    }
  }
})();
