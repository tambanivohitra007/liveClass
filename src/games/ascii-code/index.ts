import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const DIRECTION_LABELS: Record<string, string> = {
  char2code: 'Char → Code',
  code2char: 'Code → Char',
};

const asciiCodeModule: GameModule = {
  type: 'ascii_code',

  metadata: {
    name: 'ASCII Code',
    description: 'Convert between ASCII characters and their numeric codes',
    icon: 'Hash',
    color: 'purple',
  },

  configFields: [
    {
      key: 'direction',
      label: 'Direction',
      type: 'select',
      options: [
        { value: 'char2code', label: 'Char → Code' },
        { value: 'code2char', label: 'Code → Char' },
        { value: 'both', label: 'Both' },
      ],
      default: 'both',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      options: [
        { value: 'common', label: 'Common (A-Z, 0-9)' },
        { value: 'all', label: 'All printable' },
      ],
      default: 'common',
    },
  ],

  defaultConfig: {
    direction: 'both',
    difficulty: 'common',
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,

  getRoundLabel: (round: MiniGameRound) => DIRECTION_LABELS[round.type] || round.type,

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default asciiCodeModule;
