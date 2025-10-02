import React, { useEffect, useMemo, useState } from 'react';
import { fetchFinalReport } from '../api/client';
import LoadingOverlay from './LoadingOverlay';
import { Link, useParams } from 'react-router-dom';

export default function ReportPage() {
  const { sessionId = '' } = useParams();
  const [report, setReport] = useState<any>(null);
  const [polling, setPolling] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    let stop = false;
    let attempts = 0;
    setElapsed(0);
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    async function poll() {
      try {
        const res = await fetchFinalReport(sessionId);
        if (stop) return;
        if (res.ready && res.report) {
          setReport(res.report);
          setPolling(false);
          clearInterval(tick);
          return;
        }
      } catch (e: any) {
        if (!stop) setError('Failed to fetch report. Retrying…');
      }
      attempts += 1;
      if (!stop) setTimeout(poll, 4000);
    }
    poll();
    return () => { stop = true; clearInterval(tick); };
  }, [sessionId]);

  const overall = useMemo(() => {
    const r = report || {};
    if (typeof r.overall_score_100 === 'number') return r.overall_score_100;
    if (typeof r.overall_score_10 === 'number') return Math.round(r.overall_score_10 * 10);
    return null;
  }, [report]);

  const improvementSuggestions = useMemo(() => {
    const r = report || {};
    const out: string[] = [];
    if (Array.isArray(r.improvements) && r.improvements.length) return r.improvements;
    if (Array.isArray(r.weaknesses) && r.weaknesses.length) return r.weaknesses;
    // Generate basic suggestions based on scores if lists are missing
    const content = Number.isFinite(r.content_score_10) ? r.content_score_10 : null;
    const delivery = Number.isFinite(r.delivery_score_10) ? r.delivery_score_10 : null;
    const integrity = Number.isFinite(r.integrity_adjustment_10) ? r.integrity_adjustment_10 : null;
    if (content != null && content <= 6) {
      out.push('Strengthen core concepts and be specific: define terms, explain why, and add 1-2 concrete examples.');
      out.push('Structure answers using a framework (e.g., STAR or 1-2-3 bullet points) to improve clarity.');
    }
    if (delivery != null && delivery <= 6) {
      out.push('Practice concise delivery: lead with the answer, then 2-3 supporting points.');
      out.push('Slow down and enunciate; avoid filler words. Summarize at the end in one line.');
    }
    if (integrity != null && integrity < 0) {
      out.push('Improve proctoring integrity: keep a single face in frame, stable lighting, and avoid tab switching.');
    }
    if (!out.length) out.push('Great job. For further improvement, add concrete examples and quantify results when possible.');
    return out;
  }, [report]);

  return (
    <div className="container" style={{ padding: 16 }}>
      <LoadingOverlay show={polling} text="Finalizing report…" />
      <h2>Interview Report</h2>
      <div style={{ marginBottom: 12 }}>
        <Link to="/interview">← Back to Interview</Link>
      </div>
      {error && <div className="error">{error}</div>}
      {polling && (
        <div className="muted" style={{ marginBottom: 8 }}>
          Finalizing your report. This may take a few moments. You can keep this tab open; we will update automatically.
          {elapsed > 5 && (
            <span> Elapsed: {Math.floor(elapsed / 60)}m {(elapsed % 60)}s</span>
          )}
        </div>
      )}
      {!report && !polling && (
        <div className="muted">Report not ready yet. Please wait…</div>
      )}
      {report && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Overall: {overall != null ? `${overall}/100` : 'n/a'}</div>
          <div>Content (0-10): {report.content_score_10 ?? report.content_score ?? 'n/a'}</div>
          <div>Delivery (0-10): {report.delivery_score_10 ?? report.delivery_score ?? 'n/a'}</div>
          {report.integrity_adjustment_10 != null && (
            <div>Integrity Adj (0-10): {report.integrity_adjustment_10}</div>
          )}
          <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8, background: '#fafafa' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>What to improve next</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {improvementSuggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          {Array.isArray(report.strengths) && report.strengths.length > 0 && (
            <div>
              <h3>Strengths</h3>
              <ul>
                {report.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {Array.isArray(report.weaknesses) && report.weaknesses.length > 0 && (
            <div>
              <h3>Weaknesses</h3>
              <ul>
                {report.weaknesses.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {Array.isArray(report.improvements) && report.improvements.length > 0 && (
            <div>
              <h3>Suggested Improvements</h3>
              <ul>
                {report.improvements.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {typeof report.confidence === 'number' && (
            <div>Confidence: {(report.confidence * 100).toFixed(0)}%</div>
          )}
        </div>
      )}
    </div>
  );
}
