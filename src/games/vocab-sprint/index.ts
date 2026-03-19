import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const DIR_LABELS: Record<string, string> = {
  en2target: 'EN → Target',
  target2en: 'Target → EN',
};

const vocabSprintModule: GameModule = {
  type: 'vocab_sprint',
  metadata: {
    name: 'Vocab Sprint',
    description: 'Translate words between English and other languages',
    icon: 'Globe',
    color: 'purple',
  },
  configFields: [
    {
      key: 'language',
      label: 'Language',
      type: 'select',
      options: [
        { value: 'french', label: 'French' },
        { value: 'spanish', label: 'Spanish' },
        { value: 'japanese', label: 'Japanese (Romaji)' },
      ],
      default: 'french',
    },
    {
      key: 'direction',
      label: 'Direction',
      type: 'select',
      options: [
        { value: 'en2target', label: 'English → Target Language' },
        { value: 'target2en', label: 'Target Language → English' },
        { value: 'both', label: 'Both' },
      ],
      default: 'both',
    },
  ],
  defaultConfig: {
    language: 'french',
    direction: 'both',
    roundCount: 10,
    timeLimitSec: 15,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round: MiniGameRound) => DIR_LABELS[round.type] || round.type,
};

export default vocabSprintModule;
