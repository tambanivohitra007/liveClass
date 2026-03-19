import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const TYPE_LABELS: Record<string, string> = {
  frac2dec: 'Fraction → Decimal',
  dec2frac: 'Decimal → Fraction',
  frac2pct: 'Fraction → Percent',
  pct2frac: 'Percent → Fraction',
};

const fractionFighterModule: GameModule = {
  type: 'fraction_fighter',
  metadata: {
    name: 'Fraction Fighter',
    description: 'Convert between fractions, decimals, and percentages',
    icon: 'Hash',
    color: 'purple',
  },
  configFields: [
    {
      key: 'conversionTypes',
      label: 'Conversion Types',
      type: 'multi-select',
      options: [
        { value: 'frac2dec', label: 'Fraction → Decimal' },
        { value: 'dec2frac', label: 'Decimal → Fraction' },
        { value: 'frac2pct', label: 'Fraction → Percent' },
        { value: 'pct2frac', label: 'Percent → Fraction' },
      ],
      default: ['frac2dec', 'dec2frac', 'frac2pct', 'pct2frac'],
    },
  ],
  defaultConfig: {
    conversionTypes: ['frac2dec', 'dec2frac', 'frac2pct', 'pct2frac'],
    roundCount: 10,
    timeLimitSec: 20,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round: MiniGameRound) => TYPE_LABELS[round.type] || round.type,
};

export default fractionFighterModule;
