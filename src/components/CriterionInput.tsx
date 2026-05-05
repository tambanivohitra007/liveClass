import { Minus, Plus, Check } from 'lucide-react';
import type { Criterion, EvaluationScore } from '../types/models';

interface Props {
  criterion: Criterion;
  value: EvaluationScore;
  onChange: (value: EvaluationScore) => void;
}

export default function CriterionInput({ criterion, value, onChange }: Props) {
  if (criterion.type === 'numeric') {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange({ score: Math.max(0, value.score - 1) })}
          disabled={value.score <= 0}
          className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-gray-900 dark:text-white transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="min-w-[64px] text-center">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{value.score}</span>
          <span className="text-sm text-gray-400 dark:text-white/40"> / {criterion.maxScore}</span>
        </div>
        <button
          onClick={() => onChange({ score: Math.min(criterion.maxScore, value.score + 1) })}
          disabled={value.score >= criterion.maxScore}
          className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-gray-900 dark:text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (criterion.type === 'level' && criterion.levels) {
    return (
      <div className="flex flex-wrap gap-2">
        {criterion.levels.map((level) => {
          const isSelected = value.score === level.score && value.levelLabel === level.label;
          return (
            <button
              key={level.label}
              onClick={() => onChange({ score: level.score, levelLabel: level.label })}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-brand text-white shadow-lg shadow-brand/30 scale-105'
                  : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/70 hover:bg-gray-200 dark:hover:bg-white/20 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {level.label}
              <span className={`ml-1.5 text-xs ${isSelected ? 'text-white/70' : 'text-gray-400 dark:text-white/40'}`}>
                ({level.score})
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (criterion.type === 'checkbox') {
    const isChecked = value.score === criterion.maxScore;
    return (
      <button
        onClick={() => onChange({ score: isChecked ? 0 : criterion.maxScore })}
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all ${
          isChecked
            ? 'bg-success/20 text-success border border-success/30'
            : 'bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-white/50 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10'
        }`}
      >
        <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
          isChecked ? 'bg-success text-white' : 'border border-gray-300 dark:border-white/30'
        }`}>
          {isChecked && <Check className="w-3.5 h-3.5" />}
        </div>
        <span className="text-sm font-medium">
          {isChecked ? `${criterion.maxScore} pts` : `0 / ${criterion.maxScore} pts`}
        </span>
      </button>
    );
  }

  return null;
}
