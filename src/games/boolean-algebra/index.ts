import type { GameModule, MiniGameRound } from '../types';
import ToggleSingleInput from '../shared/ToggleSingleInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const booleanAlgebraModule: GameModule = {
  type: 'boolean_algebra',

  metadata: {
    name: 'Boolean Algebra',
    description: 'Evaluate boolean expressions to 0 or 1',
    icon: 'Cpu',
    color: 'purple',
  },

  configFields: [
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      options: [
        { value: 'simple', label: 'Simple' },
        { value: 'compound', label: 'Compound' },
        { value: 'mixed', label: 'Mixed' },
      ],
      default: 'simple',
    },
  ],

  defaultConfig: {
    difficulty: 'simple',
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: ToggleSingleInput,
  HostPrompt: SimpleHostPrompt,

  getRoundLabel: () => 'Evaluate',

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default booleanAlgebraModule;
