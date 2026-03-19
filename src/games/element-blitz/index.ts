import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const DIR_LABELS: Record<string, string> = {
  name2symbol: 'Name → Symbol',
  symbol2name: 'Symbol → Name',
  name2number: 'Name → Number',
  number2name: 'Number → Name',
};

const elementBlitzModule: GameModule = {
  type: 'element_blitz',
  metadata: {
    name: 'Element Blitz',
    description: 'Match element names, symbols, and atomic numbers',
    icon: 'Zap',
    color: 'emerald',
  },
  configFields: [
    {
      key: 'directions',
      label: 'Question Types',
      type: 'multi-select',
      options: [
        { value: 'name2symbol', label: 'Name → Symbol' },
        { value: 'symbol2name', label: 'Symbol → Name' },
        { value: 'name2number', label: 'Name → Atomic Number' },
        { value: 'number2name', label: 'Atomic Number → Name' },
      ],
      default: ['name2symbol', 'symbol2name'],
    },
  ],
  defaultConfig: {
    directions: ['name2symbol', 'symbol2name'],
    roundCount: 10,
    timeLimitSec: 15,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round: MiniGameRound) => DIR_LABELS[round.type] || round.type,
};

export default elementBlitzModule;
