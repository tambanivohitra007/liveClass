import type { GameModule } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const DIFF_LABELS: Record<string, string> = {
  easy: 'Linear (ax + b = c)',
  medium: 'Both sides (ax + b = cx + d)',
  hard: 'Fractions',
};

const equationSolverModule: GameModule = {
  type: 'equation_solver',
  metadata: {
    name: 'Equation Solver',
    description: 'Solve for x in algebraic equations',
    icon: 'Calculator',
    color: 'purple',
  },
  configFields: [
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      options: [
        { value: 'easy', label: 'Easy (ax + b = c)' },
        { value: 'medium', label: 'Medium (ax + b = cx + d)' },
        { value: 'hard', label: 'Hard (includes fractions)' },
      ],
      default: 'medium',
    },
  ],
  defaultConfig: {
    difficulty: 'medium',
    roundCount: 10,
    timeLimitSec: 25,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round) => DIFF_LABELS[round.type] || round.type,
};

export default equationSolverModule;
