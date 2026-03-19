import type { GameModule, MiniGameRound } from '../types';
import McqInput from '../shared/McqInput';
import CodeHostPrompt from '../shared/CodeHostPrompt';

const bigOModule: GameModule = {
  type: 'big_o',

  metadata: {
    name: 'Big-O Blitz',
    description: 'Identify the time complexity of code snippets',
    icon: 'Zap',
    color: 'warning',
  },

  configFields: [],

  defaultConfig: {
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: McqInput,
  HostPrompt: CodeHostPrompt,

  getRoundLabel: () => 'Time Complexity',

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default bigOModule;
