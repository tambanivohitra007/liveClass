import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const TYPE_LABELS: Record<string, string> = {
  percent_of: 'X% of Y',
  what_percent: 'What %?',
  percent_of_what: '% of What?',
};

const percentageProModule: GameModule = {
  type: 'percentage_pro',
  metadata: {
    name: 'Percentage Pro',
    description: 'Master percentage calculations under pressure',
    icon: 'Hash',
    color: 'warning',
  },
  configFields: [
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      options: [
        { value: 'easy', label: 'Easy (common percentages)' },
        { value: 'medium', label: 'Medium (multiples of 5%)' },
        { value: 'hard', label: 'Hard (any percentage)' },
      ],
      default: 'medium',
    },
  ],
  defaultConfig: {
    difficulty: 'medium',
    roundCount: 10,
    timeLimitSec: 20,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round: MiniGameRound) => TYPE_LABELS[round.type] || round.type,
};

export default percentageProModule;
