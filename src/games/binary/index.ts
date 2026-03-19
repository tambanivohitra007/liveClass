import type { GameModule, MiniGameRound } from '../types';
import BinaryPlayerInput from './PlayerInput';
import BinaryHostPrompt from './HostPrompt';

const CONVERSION_LABELS: Record<string, string> = {
  dec2bin: 'DEC → BIN',
  bin2dec: 'BIN → DEC',
  dec2hex: 'DEC → HEX',
  hex2dec: 'HEX → DEC',
  hex2bin: 'HEX → BIN',
  bin2hex: 'BIN → HEX',
};

const binaryModule: GameModule = {
  type: 'binary',

  metadata: {
    name: 'Binary Challenge',
    description: 'Convert between binary, decimal, and hexadecimal',
    icon: 'Binary',
    color: 'brand',
  },

  configFields: [
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      options: [
        { value: '4bit', label: '4-bit (0-15)' },
        { value: '8bit', label: '8-bit (0-255)' },
      ],
      default: '8bit',
    },
    {
      key: 'conversionTypes',
      label: 'Conversion Types',
      type: 'multi-select',
      options: [
        { value: 'dec2bin', label: 'DEC → BIN' },
        { value: 'bin2dec', label: 'BIN → DEC' },
        { value: 'dec2hex', label: 'DEC → HEX' },
        { value: 'hex2dec', label: 'HEX → DEC' },
        { value: 'hex2bin', label: 'HEX → BIN' },
        { value: 'bin2hex', label: 'BIN → HEX' },
      ],
      default: ['dec2bin', 'bin2dec'],
    },
  ],

  defaultConfig: {
    difficulty: '8bit',
    conversionTypes: ['dec2bin', 'bin2dec'],
    roundCount: 10,
    timeLimitSec: 30,
  },

  PlayerInput: BinaryPlayerInput,
  HostPrompt: BinaryHostPrompt,

  getRoundLabel: (round: MiniGameRound) => CONVERSION_LABELS[round.type] || round.type,

  formatAnswer: (round: MiniGameRound) => round.answer,
  formatPrompt: (round: MiniGameRound) => round.prompt,
};

export default binaryModule;
