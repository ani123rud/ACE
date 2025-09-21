import React, { useEffect, useMemo, useState } from 'react';
import { fetchFinalReport } from '../api/client';
import LoadingOverlay from './LoadingOverlay';
import { Link, useParams } from 'react-router-dom';

export default function ReportPage() {
  const { sessionId = '' } = useParams();
  const [report, setReport] = useState<any>(null);
  const [polling, setPolling] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let attempts = 0;
    async function poll() {
      try {
        const res = await fetchFinalReport(sessionId);
        if (stop) return;
        if (res.ready && res.report) {
          setReport(res.report);
          setPolling(false);
          return;
        }
      } catch (e: any) {
        if (!stop) setError('Failed to fetch report. Retrying…');
      }
      attempts += 1;
      if (!stop) setTimeout(poll, 4000);
    }
    poll();
    return () => { stop = true; };
  }, [sessionId]);

  const overall = useMemo(() => {
    const r = report || {};
    if (typeof r.overall_score_100 === 'number') return r.overall_score_100;
    if (typeof r.overall_score_10 === 'number') return Math.round(r.overall_score_10 * 10);
    return null;
  }, [report]);

  return (
    <div className="container" style={{ padding: 16 }}>
      <LoadingOverlay show={polling} text="Finalizing report…" />
      <h2>Interview Report</h2>
      <div style={{ marginBottom: 12 }}>
        <Link to="/interview">← Back to Interview</Link>
      </div>
      {error && <div className="error">{error}</div>}
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
