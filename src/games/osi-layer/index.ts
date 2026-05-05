import type { GameModule, MiniGameRound } from '../types';
import McqInput from '../shared/McqInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const osiLayerModule: GameModule = {
  type: 'osi_layer',

  metadata: {
    name: 'OSI Layer Quiz',
    description: 'Identify the correct OSI model layer by number or name',
    icon: 'Globe',
    color: 'blue',
  },

  configFields: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'number', label: 'Identify by Number' },
        { value: 'name', label: 'Identify by Name' },
      ],
      default: 'number',
    },
  ],

  defaultConfig: {
    mode: 'number',
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: McqInput,
  HostPrompt: SimpleHostPrompt,

  getRoundLabel: () => 'Identify Layer',

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default osiLayerModule;
