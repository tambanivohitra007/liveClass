import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import Leaderboard from '../../components/Leaderboard';

interface QuestionAnalytics {
  questionIndex: number;
  totalAnswers: number;
  correctCount: number;
  correctPercent: number;
  avgTimeMs: number;
}

export default function SessionResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [analytics, setAnalytics] = useState<QuestionAnalytics[]>([]);
  const [sessionPin, setSessionPin] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const load = async () => {
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      if (sessionDoc.exists()) {
        setSessionPin(sessionDoc.data().pinCode);
      }

      const analyticsSnap = await getDocs(
        collection(db, `sessions/${sessionId}/analytics`)
      );
      const data = analyticsSnap.docs
        .map((d) => d.data() as QuestionAnalytics)
        .sort((a, b) => a.questionIndex - b.questionIndex);
      setAnalytics(data);
    };
    load();
  }, [sessionId]);

  const handleExportCsv = async () => {
    if (!sessionId) return;
    setExporting(true);
    try {
      const fn = httpsCallable<{ sessionId: string }, { csv: string }>(functions, 'exportCsv');
      const result = await fn({ sessionId });

      const blob = new Blob([result.data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${sessionId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  if (!sessionId) return <p>No session selected</p>;

  return (
    <div>
      <h1>Session Results</h1>
      {sessionPin && <p>PIN: {sessionPin}</p>}

      <button onClick={handleExportCsv} disabled={exporting}>
        {exporting ? 'Exporting...' : 'Export CSV'}
      </button>

      <h2>Per-Question Analytics</h2>
      {analytics.length === 0 ? (
        <p>No analytics data available</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Question</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Answers</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Correct %</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Avg Time</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((a) => (
              <tr key={a.questionIndex} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>Q{a.questionIndex + 1}</td>
                <td style={{ textAlign: 'right', padding: '0.5rem' }}>{a.totalAnswers}</td>
                <td style={{ textAlign: 'right', padding: '0.5rem' }}>{a.correctPercent.toFixed(1)}%</td>
                <td style={{ textAlign: 'right', padding: '0.5rem' }}>{(a.avgTimeMs / 1000).toFixed(1)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Leaderboard sessionId={sessionId} />
    </div>
  );
}
