import type { GameModule } from '../types';
import TextInput from '../shared/TextInput';
import SimpleHostPrompt from '../shared/SimpleHostPrompt';

const unitConverterModule: GameModule = {
  type: 'unit_converter',
  metadata: {
    name: 'Unit Converter',
    description: 'Convert between units of data, length, mass, and time',
    icon: 'Calculator',
    color: 'brand',
  },
  configFields: [
    {
      key: 'categories',
      label: 'Categories',
      type: 'multi-select',
      options: [
        { value: 'data', label: 'Data (KB/MB/GB)' },
        { value: 'length', label: 'Length (mm/cm/m/km)' },
        { value: 'mass', label: 'Mass (g/kg)' },
        { value: 'time', label: 'Time (ms/s/min/hr)' },
      ],
      default: ['data', 'length', 'mass', 'time'],
    },
  ],
  defaultConfig: {
    categories: ['data', 'length', 'mass', 'time'],
    roundCount: 10,
    timeLimitSec: 20,
  },
  PlayerInput: TextInput,
  HostPrompt: SimpleHostPrompt,
  getRoundLabel: (round) => round.type,
};

export default unitConverterModule;
