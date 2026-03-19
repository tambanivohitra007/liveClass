import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const BASE_LABELS: Record<string, string> = {
  '2': 'Binary',
  '8': 'Octal',
  '10': 'Decimal',
  '16': 'Hex',
};

const baseConverterModule: GameModule = {
  type: 'base_converter',

  metadata: {
    name: 'Base Converter',
    description: 'Convert numbers between different bases',
    icon: 'Hash',
    color: 'brand',
  },

  configFields: [
    {
      key: 'bases',
      label: 'Bases',
      type: 'multi-select',
      options: [
        { value: '2', label: 'Binary (Base 2)' },
        { value: '8', label: 'Octal (Base 8)' },
        { value: '10', label: 'Decimal (Base 10)' },
        { value: '16', label: 'Hex (Base 16)' },
      ],
      default: ['2', '10', '16'],
    },
    {
      key: 'maxValue',
      label: 'Max Value',
      type: 'number',
      min: 15,
      max: 65535,
      default: 255,
    },
  ],

  defaultConfig: {
    bases: ['2', '10', '16'],
    maxValue: 255,
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,

  getRoundLabel: (round: MiniGameRound) => {
    const fromBase = round.meta?.fromBase as string | undefined;
    const toBase = round.meta?.toBase as string | undefined;
    if (fromBase && toBase) {
      return `Base ${fromBase} → Base ${toBase}`;
    }
    return round.type;
  },

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => {
    const fromBase = round.meta?.fromBase as string | undefined;
    const toBase = round.meta?.toBase as string | undefined;
    if (fromBase && toBase) {
      return `Convert ${round.prompt} from ${BASE_LABELS[fromBase] || `Base ${fromBase}`} to ${BASE_LABELS[toBase] || `Base ${toBase}`}`;
    }
    return round.prompt;
  },
};

export default baseConverterModule;
