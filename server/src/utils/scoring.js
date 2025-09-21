export function computeIntegrityScore(logs) {
  // Simple placeholder scoring: start from 100 and subtract
  let score = 100;

  // Defensive: handle missing logs
  if (!Array.isArray(logs) || logs.length === 0) return score;

  // Rate-limit deductions per type to avoid rapid drops due to bursty detectors
  // Allow at most one deduction per type per 60s window.
  const lastApplied = {
    tab_switch: 0,
    face_count: 0,
    noise: 0,
    multi_speaker: 0,
  };
  const WINDOW_MS = 60_000; // 1 minute

  // Sort by timestamp ascending to apply rate-limiting correctly
  const sorted = [...logs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const l of sorted) {
    const t = l.type;
    if (!t || !(t in lastApplied)) continue;
    const nowTs = new Date(l.createdAt).getTime() || Date.now();
    if (nowTs - lastApplied[t] < WINDOW_MS) continue; // skip if within cooldown window

    // Penalties tuned to be less harsh; "face_count" is common to be transient
    if (t === 'tab_switch') {
      score -= 5;
      lastApplied[t] = nowTs;
    } else if (t === 'face_count') {
      const c = l?.data?.count;
      if (c === 0 || c > 1) {
        score -= 4; // smaller penalty for transient or setup issues
        lastApplied[t] = nowTs;
      }
    } else if (t === 'noise') {
      score -= 1; // minor deduction
      lastApplied[t] = nowTs;
    } else if (t === 'multi_speaker') {
      score -= 6;
      lastApplied[t] = nowTs;
    }
  }

  return Math.max(0, Math.min(100, score));
}
