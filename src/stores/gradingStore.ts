import { create } from 'zustand';
import type { GradingSession, Criterion, Evaluation, RosterStudent, SessionPlayer } from '../types/models';

interface GradingState {
  gradingSession: GradingSession | null;
  students: (RosterStudent | SessionPlayer)[];
  criteria: Criterion[];
  evaluations: Map<string, Evaluation>;
  currentStudentIndex: number;
  setGradingSession: (gs: GradingSession | null) => void;
  setStudents: (students: (RosterStudent | SessionPlayer)[]) => void;
  setCriteria: (criteria: Criterion[]) => void;
  setEvaluations: (evaluations: Map<string, Evaluation>) => void;
  updateEvaluation: (studentId: string, evaluation: Evaluation) => void;
  setCurrentStudentIndex: (index: number) => void;
  reset: () => void;
}

export const useGradingStore = create<GradingState>((set) => ({
  gradingSession: null,
  students: [],
  criteria: [],
  evaluations: new Map(),
  currentStudentIndex: 0,
  setGradingSession: (gradingSession) => set({ gradingSession }),
  setStudents: (students) => set({ students }),
  setCriteria: (criteria) => set({ criteria }),
  setEvaluations: (evaluations) => set({ evaluations }),
  updateEvaluation: (studentId, evaluation) =>
    set((state) => {
      const next = new Map(state.evaluations);
      next.set(studentId, evaluation);
      return { evaluations: next };
    }),
  setCurrentStudentIndex: (currentStudentIndex) => set({ currentStudentIndex }),
  reset: () =>
    set({
      gradingSession: null,
      students: [],
      criteria: [],
      evaluations: new Map(),
      currentStudentIndex: 0,
    }),
}));
