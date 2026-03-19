import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import CodeHostPrompt from '../shared/CodeHostPrompt';

const sqlOutputModule: GameModule = {
  type: 'sql_output',

  metadata: {
    name: 'SQL Output',
    description: 'Predict the result of SQL queries',
    icon: 'Calculator',
    color: 'blue',
  },

  configFields: [],

  defaultConfig: {
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: TextInput,
  HostPrompt: CodeHostPrompt,

  getRoundLabel: (round: MiniGameRound) => (round.meta?.topic as string) || round.type,

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default sqlOutputModule;
