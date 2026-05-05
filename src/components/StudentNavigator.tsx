import { Check, Minus } from 'lucide-react';
import type { RosterStudent, SessionPlayer, Evaluation } from '../types/models';

interface Props {
  students: (RosterStudent | SessionPlayer)[];
  evaluations: Map<string, Evaluation>;
  currentIndex: number;
  onSelect: (index: number) => void;
}

function getStudentName(student: RosterStudent | SessionPlayer): string {
  if ('name' in student) return student.name;
  if ('nickname' in student) return student.nickname;
  return 'Unknown';
}

function getStudentNumber(student: RosterStudent | SessionPlayer): string | undefined {
  if ('studentNumber' in student) return student.studentNumber;
  return undefined;
}

function getGradingStatus(evaluation: Evaluation | undefined): 'none' | 'partial' | 'complete' {
  if (!evaluation) return 'none';
  const hasScores = Object.values(evaluation.scores).some((s) => s.score > 0);
  const hasComment = !!evaluation.comment;
  if (hasScores || hasComment) {
    return evaluation.gradedAt > 0 ? 'complete' : 'partial';
  }
  return 'none';
}

export default function StudentNavigator({ students, evaluations, currentIndex, onSelect }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-white/10">
        <p className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">
          Students ({students.length})
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {students.map((student, index) => {
          const evaluation = evaluations.get(student.id);
          const status = getGradingStatus(evaluation);
          const isActive = index === currentIndex;

          return (
            <button
              key={student.id}
              onClick={() => onSelect(index)}
              className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                isActive
                  ? 'bg-brand/20 border-l-2 border-brand'
                  : 'hover:bg-gray-50 dark:hover:bg-white/5 border-l-2 border-transparent'
              }`}
            >
              {/* Status indicator */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                status === 'complete' ? 'bg-success/20 text-success' :
                status === 'partial' ? 'bg-warning/20 text-warning' :
                'bg-gray-100 dark:bg-white/10 text-gray-300 dark:text-white/30'
              }`}>
                {status === 'complete' ? <Check className="w-3.5 h-3.5" /> :
                 status === 'partial' ? <Minus className="w-3.5 h-3.5" /> :
                 <span className="text-xs">{index + 1}</span>}
              </div>

              {/* Name + number */}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-white/70'}`}>
                  {getStudentName(student)}
                </p>
                {getStudentNumber(student) && (
                  <p className="text-[11px] text-gray-400 dark:text-white/40 truncate">
                    {getStudentNumber(student)}
                  </p>
                )}
              </div>

              {/* Score badge */}
              {evaluation && evaluation.totalScore > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  evaluation.percentage >= 70 ? 'bg-success/20 text-success' :
                  evaluation.percentage >= 40 ? 'bg-warning/20 text-warning' :
                  'bg-danger/20 text-danger'
                }`}>
                  {Math.round(evaluation.percentage)}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { getStudentName, getStudentNumber };
