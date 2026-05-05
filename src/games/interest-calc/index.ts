import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const TYPE_LABELS: Record<string, string> = {
  simple: 'Simple Interest',
  compound: 'Compound Interest',
};

const interestCalcModule: GameModule = {
  type: 'interest_calc',
  metadata: {
    name: 'Interest Calculator',
    description: 'Calculate simple and compound interest',
    icon: 'Calculator',
    color: 'emerald',
  },
  configFields: [
    {
      key: 'type',
      label: 'Interest Type',
      type: 'select',
      options: [
        { value: 'simple', label: 'Simple Interest' },
        { value: 'compound', label: 'Compound Interest' },
        { value: 'both', label: 'Both' },
      ],
      default: 'both',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      options: [
        { value: 'easy', label: 'Easy (small numbers)' },
        { value: 'hard', label: 'Hard (larger numbers)' },
      ],
      default: 'easy',
    },
  ],
  defaultConfig: {
    type: 'both',
    difficulty: 'easy',
    roundCount: 10,
    timeLimitSec: 30,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round: MiniGameRound) => TYPE_LABELS[round.type] || round.type,
};

export default interestCalcModule;
