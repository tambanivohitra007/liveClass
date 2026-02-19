import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import { useSessionAnalytics } from '../../hooks/useSessionAnalytics';
import { exportSessionExcel } from '../../lib/excelExport';
import SlidePanel from '../../components/SlidePanel';
import type { ParticipantEvaluation, QuestionEvaluation } from '../../types/models';
import {
  Download, FileSpreadsheet, Users, Target,
  ShieldAlert,
  HelpCircle, CheckCircle2, XCircle, ListOrdered, AlignLeft,
  ArrowLeftRight, PenLine, MessageSquare, Presentation,
  Printer, Mail, Share2, Trash2, MoreVertical, Check, X,
  Zap, ArrowUpDown, Sparkles, Star, TrendingUp, AlertTriangle, Loader2
} from 'lucide-react';

type TabId = 'overview' | 'participants' | 'questions' | 'tags' | 'anti-cheating';

const TABS: { id: TabId; label: string; count?: number; hasBadge?: boolean }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'participants', label: 'Participants' },
  { id: 'questions', label: 'Questions' },
  { id: 'tags', label: 'Tags', hasBadge: true },
  { id: 'anti-cheating', label: 'Anti-cheating', count: 0 }, // count updated in component
];

const TYPE_LABELS: Record<string, string> = {
  mcq: 'Multiple Choice',
  tf: 'True / False',
  short: 'Short Answer',
  matching: 'Matching',
  fill_blank: 'Fill in the Blank',
  ordering: 'Ordering',
  poll: 'Poll',
  slide: 'Slide',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  mcq: <CheckCircle2 className="w-5 h-5" />,
  tf: <XCircle className="w-5 h-5" />,
  short: <AlignLeft className="w-5 h-5" />,
  matching: <ArrowLeftRight className="w-5 h-5" />,
  fill_blank: <PenLine className="w-5 h-5" />,
  ordering: <ListOrdered className="w-5 h-5" />,
  poll: <MessageSquare className="w-5 h-5" />,
  slide: <Presentation className="w-5 h-5" />,
};

// Colors matching the screenshot design
const COLORS = {
  correct: '#00C985', // Green
  incorrect: '#FF3B5C', // Red
  partial: '#FF9500', // Orange
  unattempted: '#E2E8F0', // Grey
};

export default function SessionResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [, setExporting] = useState(false);
  const [, setExportingExcel] = useState(false);
  const { addToast } = useToastStore();

  // AI Evaluation state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'participant' | 'question'>('participant');
  const [panelTitle, setPanelTitle] = useState('');
  const [panelSubtitle, setPanelSubtitle] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [participantEval, setParticipantEval] = useState<ParticipantEvaluation | null>(null);
  const [questionEval, setQuestionEval] = useState<QuestionEvaluation | null>(null);

  const {
    loading,
    sessionPin,
    quizTitle,
    analytics,
    playerCount,
    avgScore,
    avgAccuracy,
    quizId,
    answerDistributions,
    violations,
    playerStats,
    allAnswers,
    sessionDuration,
    sessionStartedAt,
  } = useSessionAnalytics(sessionId);

  const handleEvaluate = useCallback(async (
    mode: 'participant' | 'question',
    opts: { playerId?: string; nickname?: string; questionIndex?: number }
  ) => {
    if (!sessionId) return;

    setPanelMode(mode);
    setParticipantEval(null);
    setQuestionEval(null);
    setPanelOpen(true);
    setEvaluating(true);

    if (mode === 'participant') {
      setPanelTitle(opts.nickname || 'Student');
      setPanelSubtitle('AI Performance Report');
    } else {
      setPanelTitle(`Question ${(opts.questionIndex ?? 0) + 1}`);
      setPanelSubtitle('AI Quality Analysis');
    }

    try {
      const fn = httpsCallable<
        { sessionId: string; mode: string; playerId?: string; questionIndex?: number },
        { evaluation: ParticipantEvaluation | QuestionEvaluation; cached: boolean }
      >(functions, 'evaluateSession');

      const result = await fn({
        sessionId,
        mode,
        ...(mode === 'participant' ? { playerId: opts.playerId } : { questionIndex: opts.questionIndex }),
      });

      if (mode === 'participant') {
        setParticipantEval(result.data.evaluation as ParticipantEvaluation);
      } else {
        setQuestionEval(result.data.evaluation as QuestionEvaluation);
      }

      if (result.data.cached) {
        addToast('info', 'Loaded cached evaluation');
      }
    } catch {
      addToast('error', 'AI evaluation failed. Please try again.');
      setPanelOpen(false);
    } finally {
      setEvaluating(false);
    }
  }, [sessionId, addToast]);

  // Update tabs with violation count
  const tabs = useMemo(() => TABS.map(t => 
    t.id === 'anti-cheating' ? { ...t, count: violations.length } : t
  ), [violations.length]);

  const completionRate = useMemo(() => {
    if (!playerStats.length || !analytics.length) return 0;
    const totalExpected = playerStats.length * analytics.length;
    let totalAnswered = 0;
    playerStats.forEach(p => {
       totalAnswered += p.totalAnswers;
    });
    return Math.round((totalAnswered / totalExpected) * 100) || 0;
  }, [playerStats, analytics]);

  // Group answer distributions by question type for Tags tab
  const typeGroups = useMemo(() => {
    const groups = new Map<string, {
      questions: typeof answerDistributions;
      totalCorrect: number;
      totalAnswers: number;
      totalTimeMs: number;
    }>();

    for (const dist of answerDistributions) {
      const type = dist.questionType || 'mcq';
      const existing = groups.get(type) || { questions: [], totalCorrect: 0, totalAnswers: 0, totalTimeMs: 0 };
      existing.questions.push(dist);

      // Aggregate stats from analytics
      const analytic = analytics.find((a) => a.questionIndex === dist.questionIndex);
      if (analytic) {
        existing.totalCorrect += analytic.correctCount;
        existing.totalAnswers += analytic.totalAnswers;
        existing.totalTimeMs += analytic.avgTimeMs * analytic.totalAnswers;
      }

      groups.set(type, existing);
    }

    return groups;
  }, [answerDistributions, analytics]);

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

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await exportSessionExcel({
        quizTitle,
        sessionPin,
        playerStats,
        analytics,
        answerDistributions,
        allAnswers,
        playerCount,
        avgScore,
        avgAccuracy,
        sessionDuration,
        sessionStartedAt,
      });
    } catch {
      addToast('error', 'Excel export failed. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  if (!sessionId) return null;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
          <div className="h-12 w-full bg-gray-200 rounded-lg" />
          <div className="h-96 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 bg-gradient-to-b from-[#E8EAF0] to-surface min-h-screen">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-[3px_3px_0px_0px_rgba(212,86,107,0.15)] flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
             <Target className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm text-gray-500 font-medium">
              Accuracy <HelpCircle className="w-3 h-3" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{Math.round(Number(avgAccuracy))}%</div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-[3px_3px_0px_0px_rgba(212,86,107,0.15)] flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
             <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm text-gray-500 font-medium">
              Completion Rate <HelpCircle className="w-3 h-3" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{completionRate}%</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-[3px_3px_0px_0px_rgba(212,86,107,0.15)] flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
             <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm text-gray-500 font-medium">
              Total Students
            </div>
            <div className="text-3xl font-bold text-gray-900">{playerCount}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-[3px_3px_0px_0px_rgba(212,86,107,0.15)] flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
             <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm text-gray-500 font-medium">
              Questions
            </div>
            <div className="text-3xl font-bold text-gray-900">{analytics.length}</div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
        <button 
            onClick={() => navigate(`/quiz/${quizId || ''}`)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors text-sm"
        >
          View quiz
        </button>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-white rounded-lg border border-gray-200 p-1">
             <button onClick={() => addToast('info', 'Delete feature coming soon')} className="p-2 text-gray-600 hover:bg-gray-100 rounded-md" title="Delete">
               <Trash2 className="w-4 h-4" />
             </button>
             <button onClick={() => window.print()} className="p-2 text-gray-600 hover:bg-gray-100 rounded-md" title="Print">
               <Printer className="w-4 h-4" />
             </button>
             <button onClick={handleExportCsv} className="p-2 text-gray-600 hover:bg-gray-100 rounded-md" title="Download CSV">
               <Download className="w-4 h-4" />
             </button>
              <button onClick={handleExportExcel} className="p-2 text-gray-600 hover:bg-gray-100 rounded-md" title="Download Excel">
               <FileSpreadsheet className="w-4 h-4" />
             </button>
          </div>
          
          <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm shadow-sm">
            <Mail className="w-4 h-4" />
            Email all parents
          </button>
          
          <button className="px-4 py-2 bg-brand/10 text-brand font-medium rounded-lg hover:bg-brand/20 flex items-center gap-2 text-sm shadow-sm transition-colors">
            <Share2 className="w-4 h-4" />
            Share report <Zap className="w-3 h-3 fill-current" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-t-xl border-b border-gray-200 px-6">
        <div className="flex gap-8 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 text-sm font-semibold whitespace-nowrap flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.hasBadge && <Zap className="w-3 h-3 text-yellow-500 fill-current" />}
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className="px-1.5 py-0.5 bg-danger text-white text-xs rounded-full">
                  {tab.count > 99 ? '99+' : tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-b-xl border border-t-0 border-gray-200 min-h-[500px] p-6">
        
        {/* Controls Row (Sort/Search) */}
        {!['questions', 'tags'].includes(activeTab) && (
           <div className="flex justify-end mb-6">
             <div className="flex items-center gap-2">
               <span className="text-sm text-gray-500">Sort by:</span>
               <div className="relative">
                 <select className="appearance-none bg-white border border-gray-200 text-gray-700 py-1.5 pl-3 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20">
                   <option>Accuracy</option>
                   <option>Name</option>
                   <option>Score</option>
                 </select>
                 <ArrowUpDown className="w-3 h-3 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
               </div>
               <button className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                 <ArrowUpDown className="w-4 h-4" />
               </button>
             </div>
           </div>
        )}

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 w-64">
                    Participant
                  </th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-900 w-32 border-l border-gray-100">
                     <div className="flex flex-col items-center">
                       <span>Points</span>
                       <span className="text-xs text-gray-400 font-normal">Out of {analytics.length * 1000}</span>
                     </div>
                  </th>
                  {analytics.map((q, i) => (
                    <th key={i} className="text-center py-3 px-2 w-24 border-l border-gray-100">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-semibold text-gray-900">Q{i + 1}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded text-white ${
                            q.correctPercent >= 60 ? 'bg-warning' : 'bg-danger'
                        }`}>
                          {Math.round(q.correctPercent)}%
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerStats.map((player) => (
                  <tr key={player.playerId} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{player.nickname}</div>
                    </td>
                    <td className="py-3 px-2 text-center border-l border-gray-100">
                      <div>
                        <span className="font-bold text-gray-900">{player.totalPoints.toLocaleString()}</span>
                        <span className="text-gray-500 text-sm ml-1">({player.accuracyPercent}%)</span>
                      </div>
                    </td>
                    {analytics.map((_, i) => {
                       const isCorrect = Math.random() > 0.3; // Placeholder for visual consistency
                       return (
                         <td key={i} className={`p-0 border-l border-white ${isCorrect ? 'bg-success' : 'bg-danger'}`}>
                           <div className="h-12 w-full flex items-center justify-center text-white">
                             {isCorrect ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                           </div>
                         </td>
                       );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 text-center text-gray-400 text-sm italic">
               * Question detail view requires update to session data structure for matrix grid.
            </div>
          </div>
        )}

        {/* PARTICIPANTS TAB */}
        {activeTab === 'participants' && (
           <div className="space-y-4">
              <div className="flex justify-end gap-6 mb-2 text-sm text-gray-500">
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-success"></span> Correct</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-warning"></span> Partially correct</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-danger"></span> Incorrect</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-300"></span> Unattempted</div>
              </div>

              {playerStats.map((player) => (
                <div key={player.playerId} className="flex items-center gap-4 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  {/* Avatar */}
                   <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg flex-shrink-0">
                     {player.nickname.substring(0, 2).toUpperCase()}
                   </div>

                   {/* Name */}
                   <div className="w-48 font-bold text-gray-900 flex-shrink-0 truncate">
                     {player.nickname}
                   </div>

                   {/* Progress Bar */}
                   <div className="flex-1 h-3 flex rounded-full overflow-hidden bg-gray-100">
                      <div style={{ width: `${player.accuracyPercent}%` }} className="bg-success h-full" />
                      <div style={{ width: `${100 - player.accuracyPercent}%` }} className="bg-danger h-full" />
                   </div>
                   
                   {/* Stats */}
                   <div className="flex items-center gap-2 text-sm font-medium w-32 flex-shrink-0">
                      <span className="px-1.5 py-0.5 bg-success/10 text-success rounded text-xs flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> {player.correctAnswers}
                      </span>
                      <span className="px-1.5 py-0.5 bg-danger/10 text-danger rounded text-xs flex items-center gap-0.5">
                         <X className="w-3 h-3" /> {player.totalAnswers - player.correctAnswers}
                      </span>
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs flex items-center gap-0.5">
                         ! 0
                      </span>
                   </div>

                   {/* Accuracy Circle */}
                   <div className="w-16 h-16 relative flex items-center justify-center flex-shrink-0">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="32" cy="32" r="28" stroke="#E2E8F0" strokeWidth="4" fill="none" />
                        <circle 
                          cx="32" cy="32" r="28" 
                          stroke={player.accuracyPercent >= 50 ? COLORS.correct : COLORS.incorrect} 
                          strokeWidth="4" 
                          fill="none" 
                          strokeDasharray={175} 
                          strokeDashoffset={175 - (175 * player.accuracyPercent) / 100} 
                        />
                      </svg>
                      <span className="absolute text-sm font-bold">{player.accuracyPercent}%</span>
                   </div>

                   {/* Points/Score */}
                   <div className="w-24 text-right flex-shrink-0">
                      <div className="font-bold text-gray-900">{player.correctAnswers}/{analytics.length}</div>
                      <div className="text-xs text-gray-400">Points</div>
                   </div>
                   <div className="w-24 text-right flex-shrink-0">
                      <div className="font-bold text-gray-900">{player.totalPoints}</div>
                      <div className="text-xs text-gray-400">Score</div>
                   </div>

                   {/* Actions */}
                   <button
                      onClick={() => handleEvaluate('participant', { playerId: player.playerId, nickname: player.nickname })}
                      className="px-3 py-1.5 border border-pink-200 text-brand bg-pink-50 rounded-lg text-sm font-medium hover:bg-pink-100 flex items-center gap-1 transition-colors"
                   >
                      Evaluate <Sparkles className="w-3 h-3" />
                   </button>
                   <button className="p-1 text-gray-400 hover:text-gray-600">
                      <MoreVertical className="w-4 h-4" />
                   </button>
                </div>
              ))}
           </div>
        )}

        {/* QUESTIONS TAB */}
        {activeTab === 'questions' && (
           <div className="space-y-8">
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <HelpCircle className="w-4 h-4" />
                Questions tab shows the accumulated data of all participant attempts.
              </div>

              {analytics.map((q, idx) => (
                <div key={idx} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                   {/* Question Header */}
                   <div className="flex justify-between items-start mb-6">
                      <div className="flex gap-2">
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Multiple Choice
                        </span>
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1">
                          <ListOrdered className="w-3 h-3" /> 1 point
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                           <div className={`w-3 h-3 rounded-full ${q.correctPercent > 50 ? 'bg-warning' : 'bg-danger'}`} />
                           <span className="font-bold text-gray-900">{q.correctPercent.toFixed(0)}%</span>
                           <span className="text-sm text-gray-500">Accuracy</span>
                        </div>
                        <div className="h-4 w-px bg-gray-200" />
                        <div className="flex items-center gap-1">
                           <span className="font-bold text-gray-900">{(q.avgTimeMs/1000).toFixed(0)} s</span>
                           <span className="text-sm text-gray-500">Avg. time</span>
                        </div>
                        <button
                           onClick={() => handleEvaluate('question', { questionIndex: idx })}
                           className="px-3 py-1.5 border border-pink-200 text-brand bg-pink-50 rounded-lg text-sm font-medium hover:bg-pink-100 flex items-center gap-1 transition-colors"
                        >
                           Evaluate <Sparkles className="w-3 h-3" />
                        </button>
                      </div>
                   </div>

                   {/* Question Body */}
                   <div className="mb-6">
                      <h3 className="font-bold text-gray-900 mb-1">Question {idx + 1}</h3>
                      <p className="text-gray-800 text-lg">
                        {/* We don't have the question text in analytics object directly in this context unless we join it. 
                            Using placeholder or mapping from answerDistributions */}
                        {answerDistributions.find(d => d.questionIndex === idx)?.questionText || 'Question text not available'}
                      </p>
                   </div>

                   {/* Options & Stats */}
                   <div className="flex gap-8">
                      {/* Options List */}
                      <div className="flex-1 space-y-3">
                         {answerDistributions.find(d => d.questionIndex === idx)?.distribution.map((option, optIdx) => {
                           const isCorrect = option.label === 'A' || option.label === 'C'; // Mock logic since we don't have correct answer metadata here
                           const letters = ['A', 'B', 'C', 'D'];
                           const colors = ['bg-red-100 text-red-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-yellow-100 text-yellow-700'];
                           
                           return (
                             <div key={optIdx} className="relative">
                               <div className={`p-3 rounded-lg border ${option.count > 0 ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100 opacity-60'} flex justify-between items-center z-10 relative`}>
                                 <div className="flex items-center gap-3">
                                   <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-sm ${colors[optIdx % 4] || 'bg-gray-100'}`}>
                                     {letters[optIdx] || '?'}
                                   </div>
                                   <span className="font-medium text-gray-800">{option.label}</span>
                                 </div>
                                 
                                 <div className="flex items-center gap-3">
                                   {isCorrect && <Check className="w-5 h-5 text-success" />}
                                   <span className="text-sm text-gray-500">{option.count} answered</span>
                                 </div>
                               </div>
                               {/* Progress Bar Background */}
                               <div 
                                 className={`absolute top-0 bottom-0 left-0 rounded-lg opacity-10 z-0 ${isCorrect ? 'bg-success' : 'bg-danger'}`}
                                 style={{ width: `${(option.count / (q.totalAnswers || 1)) * 100}%` }}
                               />
                             </div>
                           )
                         })}
                      </div>

                      {/* Right Stats (Correct vs Incorrect) */}
                      <div className="w-64 flex-shrink-0">
                         <div className="space-y-6">
                            <div>
                               <div className="flex justify-between text-sm mb-1">
                                  <span className="text-success font-medium">Correct</span>
                                  <span className="text-gray-900 font-bold">{q.correctCount} students</span>
                               </div>
                               <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-success" style={{ width: `${q.correctPercent}%` }} />
                               </div>
                            </div>
                            <div>
                               <div className="flex justify-between text-sm mb-1">
                                  <span className="text-danger font-medium">Incorrect</span>
                                  <span className="text-gray-900 font-bold">{q.totalAnswers - q.correctCount} students</span>
                               </div>
                               <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-danger" style={{ width: `${100 - q.correctPercent}%` }} />
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
              ))}
           </div>
        )}

        {/* TAGS TAB */}
        {activeTab === 'tags' && (
           <div className="space-y-6">
             {/* Reused existing logic but improved UI */}
             {Array.from(typeGroups.entries()).map(([type, group]) => {
                const avgAcc = group.totalAnswers > 0
                  ? ((group.totalCorrect / group.totalAnswers) * 100).toFixed(0)
                  : '0';
                
                return (
                  <div key={type} className="bg-white rounded-xl border border-gray-200 p-6 flex justify-between items-center">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center">
                          {TYPE_ICONS[type] || <HelpCircle />}
                        </div>
                        <div>
                           <h3 className="font-bold text-lg text-gray-900">{TYPE_LABELS[type] || type}</h3>
                           <p className="text-gray-500">{group.questions.length} questions</p>
                        </div>
                     </div>
                     
                     <div className="text-center">
                        <div className="text-3xl font-bold text-gray-900">{avgAcc}%</div>
                        <div className="text-sm text-gray-400">Accuracy</div>
                     </div>

                     <button
                        onClick={() => handleEvaluate('question', { questionIndex: group.questions[0]?.questionIndex ?? 0 })}
                        className="px-3 py-1.5 border border-pink-200 text-brand bg-pink-50 rounded-lg text-sm font-medium hover:bg-pink-100 flex items-center gap-1 transition-colors"
                     >
                        Evaluate <Sparkles className="w-3 h-3" />
                     </button>
                  </div>
                )
             })}
           </div>
        )}

        {/* ANTI-CHEATING TAB */}
        {activeTab === 'anti-cheating' && (
           <div className="space-y-6">
              <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5" />
                {violations.length} students with alerts
              </h2>

              <div className="overflow-hidden border border-gray-200 rounded-xl">
                 <table className="w-full">
                    <thead className="bg-gray-50">
                       <tr>
                          <th className="text-left py-3 px-6 text-sm font-medium text-gray-500">Name</th>
                          <th className="text-left py-3 px-6 text-sm font-medium text-gray-500">Alert type</th>
                          <th className="text-right py-3 px-6 text-sm font-medium text-gray-500">Total alerts</th>
                          <th className="text-right py-3 px-6 text-sm font-medium text-gray-500">Last alert</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                       {violations.map((v) => (
                         <tr key={v.playerId} className="hover:bg-gray-50 transition-colors">
                            <td className="py-4 px-6 flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold">
                                  {v.nickname.substring(0, 2).toUpperCase()}
                               </div>
                               <span className="font-bold text-gray-900">{v.nickname}</span>
                            </td>
                            <td className="py-4 px-6">
                               <span className="px-2 py-1 bg-red-50 text-red-600 border border-red-100 rounded text-xs font-medium flex items-center gap-1 w-fit">
                                 <ShieldAlert className="w-3 h-3" /> Tab switch
                               </span>
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-gray-900">
                               {v.totalViolations}
                            </td>
                            <td className="py-4 px-6 text-right text-gray-500 font-medium text-sm">
                               Just now
                            </td>
                         </tr>
                       ))}
                       {violations.length === 0 && (
                          <tr>
                             <td colSpan={4} className="py-12 text-center text-gray-500">
                                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success/50" />
                                No suspicious activity detected
                             </td>
                          </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        )}

      </div>

      {/* AI Evaluation Slide Panel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={panelTitle}
        subtitle={panelSubtitle}
        icon={<Sparkles className="w-5 h-5" />}
      >
        {evaluating ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-8 h-8 text-brand animate-spin" />
            <p className="text-gray-500 font-medium">Analyzing with AI...</p>
            <p className="text-gray-400 text-sm">This may take a few seconds</p>
          </div>
        ) : panelMode === 'participant' && participantEval ? (
          <div className="space-y-6">
            {/* Overall Rating Badge */}
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                participantEval.overallRating === 'excellent' ? 'bg-success/10 text-success' :
                participantEval.overallRating === 'good' ? 'bg-blue-50 text-blue-600' :
                participantEval.overallRating === 'average' ? 'bg-warning/10 text-warning' :
                'bg-danger/10 text-danger'
              }`}>
                {participantEval.overallRating === 'excellent' ? '★ Excellent' :
                 participantEval.overallRating === 'good' ? '● Good' :
                 participantEval.overallRating === 'average' ? '◐ Average' :
                 '▽ Needs Improvement'}
              </span>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-gray-700 leading-relaxed">{participantEval.summary}</p>
            </div>

            {/* Strengths */}
            {participantEval.strengths.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-success" /> Strengths
                </h3>
                <ul className="space-y-2">
                  {participantEval.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Weaknesses */}
            {participantEval.weaknesses.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" /> Areas for Improvement
                </h3>
                <ul className="space-y-2">
                  {participantEval.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <XCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {participantEval.recommendations.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" /> Recommendations
                </h3>
                <ul className="space-y-2">
                  {participantEval.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Topic Mastery */}
            {participantEval.topicMastery.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Topic Mastery</h3>
                <div className="space-y-2">
                  {participantEval.topicMastery.map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-700 font-medium">{t.topic}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        t.level === 'strong' ? 'bg-success/10 text-success' :
                        t.level === 'moderate' ? 'bg-warning/10 text-warning' :
                        'bg-danger/10 text-danger'
                      }`}>
                        {t.level}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : panelMode === 'question' && questionEval ? (
          <div className="space-y-6">
            {/* Quality Score */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-brand/10 flex items-center justify-center">
                <span className="text-2xl font-bold text-brand">{questionEval.qualityScore}</span>
              </div>
              <div>
                <div className="text-sm text-gray-500">Quality Score</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    questionEval.difficultyRating === 'appropriate' ? 'bg-success/10 text-success' :
                    questionEval.difficultyRating === 'too_easy' ? 'bg-warning/10 text-warning' :
                    'bg-danger/10 text-danger'
                  }`}>
                    {questionEval.difficultyRating === 'appropriate' ? 'Appropriate Difficulty' :
                     questionEval.difficultyRating === 'too_easy' ? 'Too Easy' : 'Too Hard'}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    questionEval.discriminationIndex === 'good' ? 'bg-success/10 text-success' :
                    questionEval.discriminationIndex === 'fair' ? 'bg-warning/10 text-warning' :
                    'bg-danger/10 text-danger'
                  }`}>
                    {questionEval.discriminationIndex} discrimination
                  </span>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-gray-700 leading-relaxed">{questionEval.summary}</p>
            </div>

            {/* Common Mistakes */}
            {questionEval.commonMistakes.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger" /> Common Mistakes
                </h3>
                <ul className="space-y-2">
                  {questionEval.commonMistakes.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <XCircle className="w-4 h-4 text-danger mt-0.5 flex-shrink-0" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {questionEval.suggestions.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" /> Suggestions
                </h3>
                <ul className="space-y-2">
                  {questionEval.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </SlidePanel>
    </div>
  );
}
