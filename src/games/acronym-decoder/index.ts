import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const CAT_LABELS: Record<string, string> = {
  tech: 'Tech',
  science: 'Science',
  organizations: 'Organizations',
  general: 'General',
};

const acronymDecoderModule: GameModule = {
  type: 'acronym_decoder',
  metadata: {
    name: 'Acronym Decoder',
    description: 'Expand abbreviations and acronyms',
    icon: 'Code',
    color: 'brand',
  },
  configFields: [
    {
      key: 'categories',
      label: 'Categories',
      type: 'multi-select',
      options: [
        { value: 'tech', label: 'Technology' },
        { value: 'science', label: 'Science' },
        { value: 'organizations', label: 'Organizations' },
        { value: 'general', label: 'General' },
      ],
      default: ['tech', 'science', 'organizations', 'general'],
    },
  ],
  defaultConfig: {
    categories: ['tech', 'science', 'organizations', 'general'],
    roundCount: 10,
    timeLimitSec: 30,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round: MiniGameRound) => CAT_LABELS[round.type] || round.type,
};

export default acronymDecoderModule;
