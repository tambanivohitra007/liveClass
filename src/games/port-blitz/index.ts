import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const DIRECTION_LABELS: Record<string, string> = {
  service2port: 'Service → Port',
  port2service: 'Port → Service',
};

const portBlitzModule: GameModule = {
  type: 'port_blitz',

  metadata: {
    name: 'Port Blitz',
    description: 'Match network services to their port numbers',
    icon: 'Globe',
    color: 'emerald',
  },

  configFields: [
    {
      key: 'direction',
      label: 'Direction',
      type: 'select',
      options: [
        { value: 'service2port', label: 'Service → Port' },
        { value: 'port2service', label: 'Port → Service' },
        { value: 'both', label: 'Both' },
      ],
      default: 'both',
    },
  ],

  defaultConfig: {
    direction: 'both',
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,

  getRoundLabel: (round: MiniGameRound) => DIRECTION_LABELS[round.type] || round.type,

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default portBlitzModule;
