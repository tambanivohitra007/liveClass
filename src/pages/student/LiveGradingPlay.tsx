import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  Mic, Clock, CheckCircle2, Award, Users, Hourglass, Download,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { LiveGrading, LiveGradingPlayer, Criterion, Evaluation } from '../../types/models';

const MESH_BG: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, rgba(0,158,226,0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 0%, rgba(112,30,168,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(244,207,93,0.06) 0%, transparent 50%),
    linear-gradient(160deg, #080F1E 0%, #0F1729 40%, #080F1E 100%)
  `,
};

export default function LiveGradingPlay() {
  const { liveGradingId, playerId } = useParams<{ liveGradingId: string; playerId: string }>();
  const navigate = useNavigate();

  const [liveGrading, setLiveGrading] = useState<LiveGrading | null>(null);
  const [players, setPlayers] = useState<LiveGradingPlayer[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [myEvaluation, setMyEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);

  // Force dark mode
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.add('dark');
    return () => { if (!wasDark) document.documentElement.classList.remove('dark'); };
  }, []);

  // Subscribe to live grading session
  useEffect(() => {
    if (!liveGradingId || !playerId) return;

    const unsubs: Array<() => void> = [];

    // Session doc
    unsubs.push(onSnapshot(doc(db, 'live_gradings', liveGradingId), (snap) => {
      if (snap.exists()) {
        const lg = { id: snap.id, ...snap.data() } as LiveGrading;
        setLiveGrading(lg);
        setLoading(false);

        // Load criteria once we have rubricId
        if (lg.rubricId && criteria.length === 0) {
          getDocs(query(collection(db, 'rubrics', lg.rubricId, 'criteria'), orderBy('order')))
            .then((cSnap) => {
              setCriteria(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Criterion[]);
            })
            .catch(() => { /* Non-critical: criteria may load on next snapshot */ });
        }
      } else {
        setLoading(false);
      }
    }));

    // Players
    unsubs.push(onSnapshot(collection(db, `live_gradings/${liveGradingId}/players`), (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LiveGradingPlayer[]);
    }));

    // My evaluation
    unsubs.push(onSnapshot(doc(db, 'live_gradings', liveGradingId, 'evaluations', playerId), (snap) => {
      if (snap.exists()) {
        setMyEvaluation({ id: snap.id, ...snap.data() } as Evaluation);
      }
    }));

    return () => unsubs.forEach((u) => u());
  }, [liveGradingId, playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={MESH_BG}>
        <div className="w-10 h-10 border-3 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (!liveGrading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={MESH_BG}>
        <div className="text-center">
          <p className="text-lg text-white/60 mb-4">Session not found</p>
          <button onClick={() => navigate('/join')} className="btn-3d-ghost">Back to Join</button>
        </div>
      </div>
    );
  }

  const myPlayer = players.find((p) => p.id === playerId);
  const currentPresenter = liveGrading.currentStudentId
    ? players.find((p) => p.id === liveGrading.currentStudentId)
    : null;
  const isMyTurn = liveGrading.currentStudentId === playerId;
  const isGraded = !!myEvaluation;
  const myQueuePosition = liveGrading.studentOrder.indexOf(playerId!);
  const queueAhead = myQueuePosition >= 0 ? myQueuePosition - liveGrading.currentStudentIndex : -1;

  const rubricCriteriaById = new Map(criteria.map((c) => [c.id, c]));
  const evaluationCriterionMeta = myEvaluation?.criterionMeta || {};
  const scoreEntries = myEvaluation ? Object.entries(myEvaluation.scores || {}) : [];
  const displayCriteria = scoreEntries.map(([criterionId, evaluationScore], index) => {
    const rubricCriterion = rubricCriteriaById.get(criterionId);
    const evalCriterion = evaluationCriterionMeta[criterionId];
    const fallbackName = `Criterion ${index + 1}`;

    return {
      id: criterionId,
      name: rubricCriterion?.name || evalCriterion?.name || fallbackName,
      type: rubricCriterion?.type || evalCriterion?.type || 'numeric',
      maxScore: rubricCriterion?.maxScore ?? evalCriterion?.maxScore,
      weight: rubricCriterion?.weight ?? evalCriterion?.weight,
      score: evaluationScore?.score || 0,
      levelLabel: evaluationScore?.levelLabel,
    };
  });

  const handleDownloadResults = () => {
    if (!myEvaluation) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const lineHeight = 16;
    const colCriterion = margin;
    const colMaxShare = 360;
    const colWeighted = 470;
    const generatedAt = new Date();
    const generatedAtText = generatedAt.toLocaleString();
    const appSignature = 'Generated by LiveClass Game';

    let y = margin;
    const ensureSpace = (needed = lineHeight) => {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Student Grading Result', margin, y);
    y += 26;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Student: ${myPlayer?.nickname || 'Student'}`, margin, y);
    y += lineHeight;
    doc.text(`Session: ${liveGrading?.rubricName || 'Live Grading'}`, margin, y);
    y += lineHeight;
    doc.text(`Generated: ${generatedAtText}`, margin, y);
    y += lineHeight;
    doc.text(`Total Score: ${myEvaluation.totalScore.toFixed(1)} / ${myEvaluation.maxPossibleScore.toFixed(1)}`, margin, y);
    y += lineHeight;
    doc.text(`Final Percentage: ${myEvaluation.percentage.toFixed(1)}%`, margin, y);
    y += 24;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Weighted Percentage Breakdown', margin, y);
    y += 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Criterion', colCriterion, y);
    doc.text('Max Share', colMaxShare, y, { align: 'right' });
    doc.text('Weighted %', colWeighted, y, { align: 'right' });
    y += 8;
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    displayCriteria.forEach((c) => {
      ensureSpace(24);

      const maxScore = typeof c.maxScore === 'number' ? c.maxScore : null;
      const weight = typeof c.weight === 'number' ? c.weight : null;
      const weightedPts = maxScore !== null && weight !== null ? c.score * weight : null;
      const weightedMax = maxScore !== null && weight !== null ? maxScore * weight : null;
      const maxSharePct = weightedMax !== null && myEvaluation.maxPossibleScore > 0
        ? (weightedMax / myEvaluation.maxPossibleScore) * 100
        : null;
      const weightedPct = weightedPts !== null && myEvaluation.maxPossibleScore > 0
        ? (weightedPts / myEvaluation.maxPossibleScore) * 100
        : null;

      const criterionLabel = c.name.length > 42 ? `${c.name.slice(0, 39)}...` : c.name;
      doc.text(criterionLabel, colCriterion, y);
      doc.text(maxSharePct !== null ? `${maxSharePct.toFixed(1)}%` : '--', colMaxShare, y, { align: 'right' });
      doc.text(weightedPct !== null ? `${weightedPct.toFixed(1)}%` : '--', colWeighted, y, { align: 'right' });
      y += lineHeight;

      const detail = `Score: ${c.score} / ${maxScore ?? '--'}${weight !== null ? `   Weight: x${weight}` : ''}`;
      doc.setTextColor(110);
      doc.text(detail, colCriterion + 8, y);
      doc.setTextColor(0);
      y += 8;
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;
    });

    ensureSpace(28);
    doc.setFont('helvetica', 'bold');
    doc.text('Total', colCriterion, y);
    doc.text('100.0%', colMaxShare, y, { align: 'right' });
    doc.text(`${myEvaluation.percentage.toFixed(1)}%`, colWeighted, y, { align: 'right' });
    y += 24;

    if (myEvaluation.comment) {
      ensureSpace(40);
      doc.setFont('helvetica', 'bold');
      doc.text('Teacher Feedback', margin, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      const wrapped = doc.splitTextToSize(myEvaluation.comment, pageWidth - margin * 2);
      wrapped.forEach((line: string) => {
        ensureSpace();
        doc.text(line, margin, y);
        y += lineHeight;
      });
    }

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(appSignature, margin, pageHeight - 18);
      doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
      doc.setTextColor(0);
    }

    const safeName = (myPlayer?.nickname || 'student').replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeSession = (liveGrading?.rubricName || 'live-grading').replace(/[^a-zA-Z0-9-_]/g, '_');
    const fileName = `${safeSession}_${safeName}_result.pdf`;
    doc.save(fileName);
  };

  // ============ LOBBY ============
  if (liveGrading.status === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white px-6" style={MESH_BG}>
        <div className="text-center animate-fade-in max-w-md">
          {/* Avatar */}
          {myPlayer && (
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-6">
              {myPlayer.avatar
                ? <span className="text-4xl leading-none">{myPlayer.avatar}</span>
                : <span className="text-2xl font-bold text-emerald-400">{myPlayer.nickname.charAt(0).toUpperCase()}</span>}
            </div>
          )}
          <h2 className="text-2xl font-bold mb-2">{myPlayer?.nickname || 'Student'}</h2>
          <p className="text-white/40 text-sm mb-8">You've joined the grading session</p>

          <div className="bg-white/[0.07] border border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Hourglass className="w-5 h-5 text-brand animate-pulse" />
              <span className="font-bold">Waiting for teacher to start...</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-white/40">
              <Users className="w-4 h-4" />
              <span>{players.length} student{players.length !== 1 ? 's' : ''} joined</span>
            </div>
          </div>

          <p className="text-xs text-white/30">
            You&apos;ll be called up in a random order for your oral presentation
          </p>
        </div>
      </div>
    );
  }

  // ============ GRADED (show results) ============
  if (isGraded) {
    return (
      <div className="min-h-screen flex flex-col text-white" style={MESH_BG}>
        <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8 max-w-lg mx-auto w-full overflow-y-auto">
          {/* Score Header */}
          <div className="text-center mb-6 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-xl font-bold mb-1">Your Results</h2>
            <p className="text-white/40 text-sm">{myPlayer?.nickname}</p>
          </div>

          {/* Total Score */}
          <div className="bg-white/[0.07] border border-white/10 rounded-2xl p-5 w-full mb-4 text-center animate-fade-in">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Total Score</p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-4xl font-bold tabular-nums">{myEvaluation.totalScore.toFixed(1)}</span>
              <span className="text-sm text-white/30">/ {myEvaluation.maxPossibleScore.toFixed(1)}</span>
            </div>
            <div className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-bold ${
              myEvaluation.percentage >= 70 ? 'bg-success/20 text-success' :
              myEvaluation.percentage >= 40 ? 'bg-warning/20 text-warning' :
              'bg-danger/20 text-danger'
            }`}>
              {myEvaluation.percentage.toFixed(0)}%
            </div>
          </div>

          {/* Criteria Breakdown */}
          <div className="w-full space-y-2 mb-4">
            {displayCriteria.map((c) => {
              const pts = c.score;
              const maxScore = c.maxScore;
              const weight = c.weight;
              const hasRubricMeta = typeof maxScore === 'number' && typeof weight === 'number';
              const weightedPts = hasRubricMeta ? pts * weight : null;
              const weightedMax = hasRubricMeta ? maxScore * weight : null;
              const pct = hasRubricMeta && maxScore > 0 ? (pts / maxScore) * 100 : 0;
              return (
                <div key={c.id} className="bg-white/[0.05] border border-white/10 rounded-xl p-3 animate-fade-in">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-sm font-bold tabular-nums">
                      {pts} <span className="text-white/30">/ {typeof c.maxScore === 'number' ? c.maxScore : '--'}</span>
                      {typeof c.weight === 'number' && c.weight !== 1 && <span className="text-warning text-xs ml-1">x{c.weight}</span>}
                    </span>
                  </div>
                  <div className="text-xs text-white/50 mb-1.5 tabular-nums">
                    Contribution: {weightedPts !== null && weightedMax !== null ? `${weightedPts.toFixed(1)} / ${weightedMax.toFixed(1)} pts` : '--'}
                  </div>
                  {c.levelLabel && (
                    <span className="text-xs text-brand font-medium">{c.levelLabel}</span>
                  )}
                  <div className="w-full h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-danger'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Weighted Percentage Table */}
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 mb-4 animate-fade-in overflow-x-auto">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Weighted Percentage Breakdown</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="py-2 pr-3 font-semibold">Criterion</th>
                  <th className="py-2 pr-3 font-semibold text-right">Max Share</th>
                  <th className="py-2 pr-3 font-semibold text-right">Weighted %</th>
                </tr>
              </thead>
              <tbody>
                {displayCriteria.map((c) => {
                  const pts = c.score;
                  const maxScore = c.maxScore;
                  const weight = c.weight;
                  const hasRubricMeta = typeof maxScore === 'number' && typeof weight === 'number';
                  const weightedPts = hasRubricMeta ? pts * weight : null;
                  const weightedMax = hasRubricMeta ? maxScore * weight : null;
                  const maxSharePct = weightedMax !== null && myEvaluation.maxPossibleScore > 0
                    ? (weightedMax / myEvaluation.maxPossibleScore) * 100
                    : null;
                  const weightedPct = weightedPts !== null && myEvaluation.maxPossibleScore > 0
                    ? (weightedPts / myEvaluation.maxPossibleScore) * 100
                    : null;

                  return (
                    <tr key={`weighted-pct-${c.id}`} className="border-b border-white/5 last:border-b-0">
                      <td className="py-2 pr-3 text-white/85">{c.name}</td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums text-white/60">
                        {maxSharePct !== null ? `${maxSharePct.toFixed(1)}%` : '--'}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums text-white/90">
                        {weightedPct !== null ? `${weightedPct.toFixed(1)}%` : '--'}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-white/10">
                  <td className="pt-2.5 pr-3 font-bold text-white">Total</td>
                  <td className="pt-2.5 pr-3 text-right font-bold tabular-nums text-white">
                    100.0%
                  </td>
                  <td className="pt-2.5 pr-3 text-right font-bold tabular-nums text-brand">
                    {myEvaluation.percentage.toFixed(1)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Teacher Comment */}
          {myEvaluation.comment && (
            <div className="w-full bg-white/[0.05] border border-white/10 rounded-xl p-4 mb-4 animate-fade-in">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Teacher Feedback</p>
              <p className="text-sm text-white/80 leading-relaxed">{myEvaluation.comment}</p>
            </div>
          )}

          <button
            onClick={handleDownloadResults}
            className="w-full btn-3d-ghost py-2.5 text-sm font-medium flex items-center justify-center gap-2 mb-2"
          >
            <Download className="w-4 h-4" />
            Download Results (PDF)
          </button>

          {/* Status */}
          {liveGrading.status === 'live' ? (
            <p className="text-xs text-white/30 text-center mt-2">
              Please wait while others present...
            </p>
          ) : (
            <div className="text-center mt-4">
              <p className="text-sm text-white/50 mb-4">Session complete. Thank you!</p>
              <button onClick={() => navigate('/')} className="btn-3d-ghost px-6 py-2 text-sm">
                Go Home
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ PRESENTING (my turn) ============
  if (isMyTurn && liveGrading.status === 'live') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white px-6" style={MESH_BG}>
        <div className="text-center animate-bounce-in max-w-md">
          <div className="relative mx-auto mb-8">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center mx-auto animate-pulse">
              <Mic className="w-12 h-12 text-emerald-400" />
            </div>
            <div className="absolute inset-0 w-24 h-24 mx-auto rounded-full border-2 border-emerald-400/30 animate-ping" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold mb-3">
            It&apos;s Your Turn!
          </h1>
          <p className="text-lg text-white/60 mb-2">
            Please begin your presentation
          </p>
          <p className="text-sm text-white/30">
            The teacher is grading you now
          </p>
        </div>
      </div>
    );
  }

  // ============ WAITING (not my turn, not graded, session is live) ============
  if (liveGrading.status === 'live') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white px-6" style={MESH_BG}>
        <div className="text-center animate-fade-in max-w-md">
          {/* Current Presenter */}
          {currentPresenter && (
            <div className="bg-white/[0.07] border border-white/10 rounded-2xl p-6 mb-6">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Now Presenting</p>
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  {currentPresenter.avatar
                    ? <span className="text-xl leading-none">{currentPresenter.avatar}</span>
                    : <span className="text-sm font-bold text-emerald-400">{currentPresenter.nickname.charAt(0).toUpperCase()}</span>}
                </div>
                <span className="text-lg font-bold">{currentPresenter.nickname}</span>
                <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />
              </div>
            </div>
          )}

          {/* Queue Position */}
          <div className="bg-white/[0.07] border border-white/10 rounded-2xl p-6 mb-6">
            <Clock className="w-8 h-8 text-brand mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">
              {queueAhead > 0
                ? `You are #${queueAhead} in line`
                : 'You\'re up next!'}
            </h2>
            <p className="text-sm text-white/40">
              {queueAhead > 0
                ? `${queueAhead} student${queueAhead !== 1 ? 's' : ''} before you`
                : 'Get ready for your presentation'}
            </p>
          </div>

          <p className="text-xs text-white/30">
            Please wait while others present
          </p>
        </div>
      </div>
    );
  }

  // ============ ENDED (no evaluation — was skipped or session ended) ============
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-white px-6" style={MESH_BG}>
      <div className="text-center animate-fade-in max-w-md">
        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
          <Award className="w-8 h-8 text-white/40" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Session Complete</h2>
        <p className="text-white/50 text-sm mb-6">Thank you for participating!</p>
        <button onClick={() => navigate('/')} className="btn-3d-ghost px-6 py-2 text-sm">
          Go Home
        </button>
      </div>
    </div>
  );
}
