import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const DIR_LABELS: Record<string, string> = {
  country2capital: 'Country → Capital',
  capital2country: 'Capital → Country',
};

const capitalCitiesModule: GameModule = {
  type: 'capital_cities',
  metadata: {
    name: 'Capital Cities',
    description: 'Match countries to their capital cities',
    icon: 'Globe',
    color: 'blue',
  },
  configFields: [
    {
      key: 'direction',
      label: 'Direction',
      type: 'select',
      options: [
        { value: 'country2capital', label: 'Country → Capital' },
        { value: 'capital2country', label: 'Capital → Country' },
        { value: 'both', label: 'Both' },
      ],
      default: 'both',
    },
    {
      key: 'regions',
      label: 'Regions',
      type: 'multi-select',
      options: [
        { value: 'asia', label: 'Asia' },
        { value: 'europe', label: 'Europe' },
        { value: 'americas', label: 'Americas' },
        { value: 'africa', label: 'Africa' },
        { value: 'oceania', label: 'Oceania' },
      ],
      default: ['asia', 'europe', 'americas', 'africa', 'oceania'],
    },
  ],
  defaultConfig: {
    direction: 'both',
    regions: ['asia', 'europe', 'americas', 'africa', 'oceania'],
    roundCount: 10,
    timeLimitSec: 20,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round: MiniGameRound) => DIR_LABELS[round.type] || round.type,
};

export default capitalCitiesModule;
