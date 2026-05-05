import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const OP_LABELS: Record<string, string> = {
  '+': 'Addition',
  '-': 'Subtraction',
  '×': 'Multiplication',
  '÷': 'Division',
};

const mentalMathModule: GameModule = {
  type: 'mental_math',
  metadata: {
    name: 'Mental Math',
    description: 'Rapid arithmetic under time pressure',
    icon: 'Calculator',
    color: 'warning',
  },
  configFields: [
    {
      key: 'operations',
      label: 'Operations',
      type: 'multi-select',
      options: [
        { value: '+', label: 'Addition (+)' },
        { value: '-', label: 'Subtraction (-)' },
        { value: '×', label: 'Multiplication (×)' },
        { value: '÷', label: 'Division (÷)' },
      ],
      default: ['+', '-', '×', '÷'],
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      options: [
        { value: 'easy', label: 'Easy (1-20)' },
        { value: 'medium', label: 'Medium (1-100)' },
        { value: 'hard', label: 'Hard (1-999)' },
      ],
      default: 'medium',
    },
  ],
  defaultConfig: {
    operations: ['+', '-', '×', '÷'],
    difficulty: 'medium',
    roundCount: 10,
    timeLimitSec: 15,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round: MiniGameRound) => OP_LABELS[round.type] || round.type,
};

export default mentalMathModule;
