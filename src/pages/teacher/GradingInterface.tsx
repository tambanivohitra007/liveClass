import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useGradingSession } from '../../hooks/useGradingSession';
import { useGradingStore } from '../../stores/gradingStore';
import { useToastStore } from '../../stores/toastStore';
import CriterionInput from '../../components/CriterionInput';
import StudentNavigator, { getStudentName, getStudentNumber } from '../../components/StudentNavigator';
import {
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight,
  Check, CloudOff,
  X, Menu, CheckCircle2,
} from 'lucide-react';
import { confirmAction } from '../../lib/swal';
import type { Evaluation, EvaluationScore } from '../../types/models';

export default function GradingInterface() {
  const { gradingSessionId } = useParams<{ gradingSessionId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToastStore();

  const {
    gradingSession, students, criteria, evaluations, loading,
    saveStatus, pendingCount, saveEvaluation, completeSession,
  } = useGradingSession(gradingSessionId);

  const { currentStudentIndex, setCurrentStudentIndex } = useGradingStore();

  // Local state for current student's scores and comment
  const [currentScores, setCurrentScores] = useState<Record<string, EvaluationScore>>({});
  const [comment, setComment] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);

  // Current student
  const currentStudent = students[currentStudentIndex];

  // Load existing evaluation when student changes
  useEffect(() => {
    if (!currentStudent) return;
    const existing = evaluations.get(currentStudent.id);
    if (existing) {
      setCurrentScores(existing.scores);
      setComment(existing.comment);
    } else {
      setCurrentScores({});
      setComment('');
    }
  }, [currentStudentIndex, currentStudent?.id, evaluations]);

  // Scoring calculations
  const totalScore = criteria.reduce(
    (sum, c) => sum + (currentScores[c.id]?.score || 0) * c.weight, 0
  );
  const maxPossibleScore = criteria.reduce(
    (sum, c) => sum + c.maxScore * c.weight, 0
  );
  const percentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

  // Graded count for progress
  const gradedCount = Array.from(evaluations.values()).filter(
    (e) => e.totalScore > 0 || e.comment
  ).length;

  // Build and save evaluation
  const buildAndSave = useCallback(() => {
    if (!currentStudent) return;
    const evaluation: Evaluation = {
      id: currentStudent.id,
      studentName: getStudentName(currentStudent),
      studentNumber: getStudentNumber(currentStudent),
      totalScore,
      maxPossibleScore,
      percentage,
      comment,
      scores: currentScores,
      gradedAt: Date.now(),
    };
    saveEvaluation(currentStudent.id, evaluation);
  }, [currentStudent, totalScore, maxPossibleScore, percentage, comment, currentScores, saveEvaluation]);

  // Auto-save when scores or comment change
  useEffect(() => {
    if (!currentStudent) return;
    const hasContent = Object.values(currentScores).some((s) => s.score > 0) || comment;
    if (hasContent) {
      buildAndSave();
    }
  }, [currentScores, comment]);

  // Handle criterion score change
  const handleScoreChange = useCallback((criterionId: string, value: EvaluationScore) => {
    setCurrentScores((prev) => ({ ...prev, [criterionId]: value }));
  }, []);

  // Navigation
  const goToStudent = useCallback((index: number) => {
    if (index < 0 || index >= students.length) return;
    setCurrentStudentIndex(index);
    setSidebarOpen(false);
  }, [students.length, setCurrentStudentIndex]);

  const goPrev = useCallback(() => {
    goToStudent(currentStudentIndex - 1);
  }, [currentStudentIndex, goToStudent]);

  const goNext = useCallback(() => {
    goToStudent(currentStudentIndex + 1);
  }, [currentStudentIndex, goToStudent]);

  const markCompleteAndNext = useCallback(() => {
    buildAndSave();
    if (currentStudentIndex < students.length - 1) {
      goNext();
    } else {
      addToast('success', 'All students graded!');
    }
  }, [buildAndSave, currentStudentIndex, students.length, goNext, addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTextarea = target.tagName === 'TEXTAREA';

      if (e.key === 'Escape') {
        e.preventDefault();
        setShowExitDialog(true);
        return;
      }

      if (e.key === 'ArrowLeft' && !isTextarea) {
        e.preventDefault();
        goPrev();
        return;
      }

      if (e.key === 'ArrowRight' && !isTextarea) {
        e.preventDefault();
        goNext();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        markCompleteAndNext();
        return;
      }

      if (e.key === 'Enter' && !isTextarea) {
        e.preventDefault();
        markCompleteAndNext();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, markCompleteAndNext]);

  // Block browser tab close if there are pending changes
  useEffect(() => {
    if (pendingCount === 0 && saveStatus === 'saved') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingCount, saveStatus]);

  // Handle exit navigation
  const handleExit = useCallback(async () => {
    if (pendingCount > 0 || saveStatus === 'saving') {
      const { isConfirmed } = await confirmAction(
        'Unsaved changes',
        `You have ${pendingCount} pending change${pendingCount !== 1 ? 's' : ''}. Are you sure you want to leave?`,
        'Leave anyway',
      );
      if (!isConfirmed) return;
    }
    navigate(`/dashboard`);
  }, [pendingCount, saveStatus, navigate, gradingSessionId]);

  // Handle complete session
  const handleCompleteSession = useCallback(async () => {
    const { isConfirmed } = await confirmAction(
      'Complete grading session?',
      'This will mark the session as completed. You can still view results afterward.',
      'Yes, complete',
    );
    if (!isConfirmed) return;
    await completeSession();
    navigate(`/dashboard`);
  }, [completeSession, navigate, gradingSessionId]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-surface">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  // No students
  if (!loading && students.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-surface">
        <div className="text-center">
          <p className="text-gray-500 dark:text-white/60 text-lg mb-4">No students found</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-brand underline text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Save status indicator
  const renderSaveStatus = () => {
    if (saveStatus === 'saved') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 border border-success/20">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span className="text-xs font-medium text-success">Saved</span>
        </div>
      );
    }
    if (saveStatus === 'saving') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning/10 border border-warning/20">
          <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
          <span className="text-xs font-medium text-warning">Saving...</span>
        </div>
      );
    }
    // offline
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-danger/10 border border-danger/20">
        <div className="w-2 h-2 rounded-full bg-danger" />
        <span className="text-xs font-medium text-danger">
          Offline ({pendingCount} pending)
        </span>
      </div>
    );
  };

  // Check if a criterion has been scored
  const isCriterionScored = (criterionId: string) => {
    const score = currentScores[criterionId];
    return score && score.score > 0;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface text-gray-900 dark:text-white flex">

      {/* ===================== DESKTOP SIDEBAR ===================== */}
      <aside className="hidden md:flex flex-col w-72 bg-white dark:bg-[#0B1220] border-r border-gray-200 dark:border-white/10 shrink-0 h-screen sticky top-0">
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-white/10 flex items-center gap-2">
          <button
            onClick={handleExit}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white"
            title="Back to dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold truncate flex-1">
            {gradingSession?.name || 'Grading'}
          </span>
        </div>

        {/* Student navigator */}
        <StudentNavigator
          students={students}
          evaluations={evaluations}
          currentIndex={currentStudentIndex}
          onSelect={goToStudent}
        />
      </aside>

      {/* ===================== MOBILE SIDEBAR OVERLAY ===================== */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-[#0B1220] border-r border-gray-200 dark:border-white/10 flex flex-col animate-slide-right z-10">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
              <span className="text-sm font-bold">Students</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <StudentNavigator
              students={students}
              evaluations={evaluations}
              currentIndex={currentStudentIndex}
              onSelect={goToStudent}
            />
          </aside>
        </div>
      )}

      {/* ===================== MAIN PANEL ===================== */}
      <div className="flex-1 flex flex-col min-h-screen">

        {/* ─── HEADER BAR ─── */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-surface/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 px-4 py-2.5 flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-white/60"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Back button (mobile only, since desktop has sidebar) */}
          <button
            onClick={handleExit}
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Session name */}
          <h1 className="text-sm font-bold truncate hidden sm:block">
            {gradingSession?.name || 'Grading'}
          </h1>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Progress */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
            <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
            <span className="text-xs font-bold tabular-nums">
              {gradedCount}/{students.length}
            </span>
            <span className="text-xs text-gray-400 dark:text-white/40 hidden sm:inline">graded</span>
          </div>

          {/* Save status */}
          {renderSaveStatus()}

          {/* Student nav arrows (desktop) */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={goPrev}
              disabled={currentStudentIndex <= 0}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous student"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold tabular-nums text-gray-500 dark:text-white/60 min-w-[40px] text-center">
              {currentStudentIndex + 1}/{students.length}
            </span>
            <button
              onClick={goNext}
              disabled={currentStudentIndex >= students.length - 1}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next student"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Complete session button */}
          {gradingSession?.status === 'active' && (
            <button
              onClick={handleCompleteSession}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/20 text-success text-xs font-bold hover:bg-success/20 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Complete
            </button>
          )}
        </header>

        {/* ─── MOBILE STUDENT STRIP ─── */}
        <div className="md:hidden px-3 py-2 border-b border-gray-100 dark:border-white/5 overflow-x-auto">
          <div className="flex gap-2">
            {students.map((student, index) => {
              const isActive = index === currentStudentIndex;
              const eval_ = evaluations.get(student.id);
              const hasScore = eval_ && (eval_.totalScore > 0 || eval_.comment);
              return (
                <button
                  key={student.id}
                  onClick={() => goToStudent(index)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-brand text-white shadow-lg shadow-brand/30'
                      : hasScore
                        ? 'bg-success/10 text-success border border-success/20'
                        : 'bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-white/50 border border-gray-200 dark:border-white/10'
                  }`}
                >
                  {getStudentName(student).split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── SCROLLABLE GRADING AREA ─── */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-32 md:pb-6">

          {/* Current student header */}
          {currentStudent && (
            <div className="mb-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl sm:text-2xl font-bold">
                  {getStudentName(currentStudent)}
                </h2>
                {evaluations.get(currentStudent.id) && (
                  <span className="px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-bold">
                    Graded
                  </span>
                )}
              </div>
              {getStudentNumber(currentStudent) && (
                <p className="text-sm text-gray-400 dark:text-white/40">{getStudentNumber(currentStudent)}</p>
              )}
            </div>
          )}

          {/* Criteria cards */}
          <div className="space-y-3 sm:space-y-4 max-w-2xl">
            {criteria.map((c) => {
              const scored = isCriterionScored(c.id);
              return (
                <div
                  key={c.id}
                  className={`card-night p-4 sm:p-5 transition-all ${
                    scored
                      ? 'border-success/30 border-l-4 border-l-success'
                      : 'border-gray-200 dark:border-white/10'
                  }`}
                >
                  {/* Card header */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <h3 className="text-sm sm:text-base font-bold flex-1 min-w-0">
                      {c.name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      c.type === 'numeric' ? 'bg-brand/10 text-brand' :
                      c.type === 'level' ? 'bg-purple-500/10 text-purple-400' :
                      'bg-info/10 text-info'
                    }`}>
                      {c.type}
                    </span>
                    {c.weight !== 1 && (
                      <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-bold">
                        x{c.weight}
                      </span>
                    )}
                    <span className="text-sm font-bold tabular-nums text-gray-500 dark:text-white/50">
                      {currentScores[c.id]?.score || 0} / {c.maxScore} pts
                    </span>
                  </div>

                  {/* Card body */}
                  <CriterionInput
                    criterion={c}
                    value={currentScores[c.id] || { score: 0 }}
                    onChange={(value) => handleScoreChange(c.id, value)}
                  />
                </div>
              );
            })}
          </div>

          {/* Comment textarea */}
          <div className="max-w-2xl mt-4 sm:mt-6">
            <label className="block text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2">
              Comment
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add feedback for this student..."
              rows={3}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-white/30 resize-y focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/30 transition-colors"
            />
          </div>

          {/* Total score display and action */}
          <div className="max-w-2xl mt-4 sm:mt-6">
            <div className="card-night p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-1">Total Score</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-bold tabular-nums">
                    {totalScore.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-300 dark:text-white/30">/ {maxPossibleScore.toFixed(1)}</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ml-2 ${
                    percentage >= 70 ? 'bg-success/20 text-success' :
                    percentage >= 40 ? 'bg-warning/20 text-warning' :
                    'bg-danger/20 text-danger'
                  }`}>
                    {percentage.toFixed(0)}%
                  </span>
                </div>
              </div>
              <button
                onClick={markCompleteAndNext}
                className="btn-3d-cyan text-white font-bold px-6 py-3 rounded-full flex items-center gap-2 group whitespace-nowrap w-full sm:w-auto justify-center"
              >
                {currentStudentIndex < students.length - 1 ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Mark Complete & Next</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Mark Complete</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Keyboard hints (desktop only) */}
          <div className="hidden md:flex max-w-2xl mt-6 items-center justify-center gap-4 text-gray-200 dark:text-white/15 text-xs">
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-50 dark:bg-white/5 rounded text-gray-300 dark:text-white/25 text-[10px]">&larr;</kbd>
              <kbd className="px-1.5 py-0.5 bg-gray-50 dark:bg-white/5 rounded text-gray-300 dark:text-white/25 text-[10px] ml-1">&rarr;</kbd>
              navigate students
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-50 dark:bg-white/5 rounded text-gray-300 dark:text-white/25 text-[10px]">Enter</kbd>
              complete & next
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-50 dark:bg-white/5 rounded text-gray-300 dark:text-white/25 text-[10px]">Esc</kbd>
              exit
            </span>
          </div>
        </main>

        {/* ─── MOBILE FIXED BOTTOM BAR ─── */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-surface/95 backdrop-blur-xl border-t border-gray-200 dark:border-white/10 px-4 py-3 flex items-center gap-3">
          {/* Nav arrows */}
          <button
            onClick={goPrev}
            disabled={currentStudentIndex <= 0}
            className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Mark complete button */}
          <button
            onClick={markCompleteAndNext}
            className="flex-1 btn-3d-cyan text-white font-bold py-3 rounded-full flex items-center justify-center gap-2 text-sm"
          >
            <Check className="w-4 h-4" />
            {currentStudentIndex < students.length - 1 ? 'Complete & Next' : 'Complete'}
          </button>

          {/* Nav arrow */}
          <button
            onClick={goNext}
            disabled={currentStudentIndex >= students.length - 1}
            className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ===================== EXIT CONFIRMATION DIALOG ===================== */}
      {showExitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
                <CloudOff className="w-5 h-5 text-warning" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Leave grading?</h3>
            </div>
            <p className="text-gray-500 dark:text-white/60 text-sm mb-6">
              {pendingCount > 0
                ? `You have ${pendingCount} unsaved change${pendingCount !== 1 ? 's' : ''}. Leaving now may result in lost work.`
                : 'Your progress has been saved. You can return to continue grading later.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowExitDialog(false)}
                className="flex-1 px-5 py-3 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
              >
                Stay
              </button>
              <button
                onClick={() => {
                  setShowExitDialog(false);
                  navigate('/dashboard');
                }}
                className="flex-1 px-5 py-3 bg-danger text-white font-semibold rounded-xl hover:brightness-110 transition-all"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
