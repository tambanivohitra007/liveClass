import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import Leaderboard from '../../components/Leaderboard';
import { Download, ArrowLeft } from 'lucide-react';

interface QuestionAnalytics {
  questionIndex: number;
  totalAnswers: number;
  correctCount: number;
  correctPercent: number;
  avgTimeMs: number;
}

export default function SessionResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<QuestionAnalytics[]>([]);
  const [sessionPin, setSessionPin] = useState('');
  const [exporting, setExporting] = useState(false);
  const { addToast } = useToastStore();

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      if (sessionDoc.exists()) setSessionPin(sessionDoc.data().pinCode);

      const analyticsSnap = await getDocs(collection(db, `sessions/${sessionId}/analytics`));
      setAnalytics(
        analyticsSnap.docs
          .map((d) => d.data() as QuestionAnalytics)
          .sort((a, b) => a.questionIndex - b.questionIndex)
      );
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
    } catch {
      addToast('error', 'CSV export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (!sessionId) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-brand mb-2 flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to Dashboard</button>
          <h1 className="text-2xl font-bold text-gray-900">Session Results</h1>
          {sessionPin && <p className="text-gray-500 mt-1">PIN: {sessionPin}</p>}
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Analytics Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Per-Question Analytics</h2>
        </div>
        {analytics.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">No analytics data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-sm text-gray-500 border-b border-gray-100">
                  <th className="text-left px-6 py-3 font-medium">Question</th>
                  <th className="text-right px-6 py-3 font-medium">Responses</th>
                  <th className="text-right px-6 py-3 font-medium">Correct %</th>
                  <th className="text-right px-6 py-3 font-medium">Avg Time</th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((a) => (
                  <tr key={a.questionIndex} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-800">Q{a.questionIndex + 1}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{a.totalAnswers}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-sm font-medium ${
                        a.correctPercent >= 70 ? 'bg-success/10 text-success' :
                        a.correctPercent >= 40 ? 'bg-warning/10 text-warning' :
                        'bg-danger/10 text-danger'
                      }`}>
                        {a.correctPercent.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">{(a.avgTimeMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <Leaderboard sessionId={sessionId} />
      </div>
    </div>
  );
}
