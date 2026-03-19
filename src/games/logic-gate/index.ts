import type { GameModule, MiniGameRound } from '../types';
import ToggleSingleInput from '../shared/ToggleSingleInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const logicGateModule: GameModule = {
  type: 'logic_gate',

  metadata: {
    name: 'Logic Gate Lab',
    description: 'Evaluate logic gate outputs from given inputs',
    icon: 'Cpu',
    color: 'emerald',
  },

  configFields: [
    {
      key: 'gates',
      label: 'Gates',
      type: 'multi-select',
      options: [
        { value: 'AND', label: 'AND' },
        { value: 'OR', label: 'OR' },
        { value: 'NOT', label: 'NOT' },
        { value: 'XOR', label: 'XOR' },
        { value: 'NAND', label: 'NAND' },
        { value: 'NOR', label: 'NOR' },
      ],
      default: ['AND', 'OR', 'NOT', 'XOR'],
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      options: [
        { value: 'single', label: 'Single Gate' },
        { value: 'chain', label: 'Chained Gates' },
      ],
      default: 'single',
    },
  ],

  defaultConfig: {
    gates: ['AND', 'OR', 'NOT', 'XOR'],
    difficulty: 'single',
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: ToggleSingleInput,
  HostPrompt: SimpleHostPrompt,

  getRoundLabel: (round: MiniGameRound) => round.type === 'chain' ? 'Chained Gates' : 'Single Gate',

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default logicGateModule;
