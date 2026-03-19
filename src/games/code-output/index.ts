import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import CodeHostPrompt from '../shared/CodeHostPrompt';

const LANGUAGE_LABELS: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  c: 'C',
};

const codeOutputModule: GameModule = {
  type: 'code_output',

  metadata: {
    name: 'Code Output',
    description: 'Predict the output of code snippets',
    icon: 'Code',
    color: 'emerald',
  },

  configFields: [
    {
      key: 'languages',
      label: 'Languages',
      type: 'multi-select',
      options: [
        { value: 'python', label: 'Python' },
        { value: 'javascript', label: 'JavaScript' },
        { value: 'c', label: 'C' },
      ],
      default: ['python', 'javascript'],
    },
  ],

  defaultConfig: {
    languages: ['python', 'javascript'],
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: TextInput,
  HostPrompt: CodeHostPrompt,

  getRoundLabel: (round: MiniGameRound) => LANGUAGE_LABELS[round.type] || round.type,

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default codeOutputModule;
