import type { GameModule, MiniGameRound } from '../types';
import TextInput from '../shared/TextInput';
import SubnetHostPrompt from './HostPrompt';

const QUESTION_TYPE_LABELS: Record<string, string> = {
  subnet_mask: 'Subnet Mask',
  network_addr: 'Network Address',
  broadcast_addr: 'Broadcast Address',
  host_count: 'Host Count',
};

const subnetModule: GameModule = {
  type: 'subnet',

  metadata: {
    name: 'Subnet Showdown',
    description: 'Calculate subnet masks, network addresses, and more',
    icon: 'Globe',
    color: 'brand',
  },

  configFields: [
    {
      key: 'questionTypes',
      label: 'Question Types',
      type: 'multi-select',
      options: [
        { value: 'subnet_mask', label: 'Subnet Mask' },
        { value: 'network_addr', label: 'Network Address' },
        { value: 'broadcast_addr', label: 'Broadcast Address' },
        { value: 'host_count', label: 'Host Count' },
      ],
      default: ['subnet_mask', 'network_addr'],
    },
  ],

  defaultConfig: {
    questionTypes: ['subnet_mask', 'network_addr'],
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: TextInput,
  HostPrompt: SubnetHostPrompt,

  getRoundLabel: (round: MiniGameRound) => QUESTION_TYPE_LABELS[round.type] || round.type,

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default subnetModule;
