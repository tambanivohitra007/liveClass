import type { GameModule, MiniGameRound } from '../types';
import McqInput from '../shared/McqInput';
import RegexHostPrompt from './HostPrompt';

const regexMatchModule: GameModule = {
  type: 'regex_match',

  metadata: {
    name: 'Regex Match',
    description: 'Determine whether a regex pattern matches a test string',
    icon: 'Code',
    color: 'warning',
  },

  configFields: [],

  defaultConfig: {
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: McqInput,
  HostPrompt: RegexHostPrompt,

  getRoundLabel: () => 'Does it match?',

  formatAnswer: (round: MiniGameRound) => round.answer === '1' ? 'Match' : 'No Match',
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default regexMatchModule;
