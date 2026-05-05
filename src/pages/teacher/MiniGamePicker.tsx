import { useNavigate } from 'react-router-dom';
import { getAllGameModules } from '../../games/registry';
import BackButton from '../../components/BackButton';
import {
  Binary, Globe, Hash, Zap, Calculator, Code, Cpu, Gamepad2, ArrowRight,
} from 'lucide-react';

const ICON_MAP: Record<string, typeof Binary> = { Binary, Globe, Hash, Zap, Calculator, Code, Cpu, Gamepad2 };

export default function MiniGamePicker() {
  const navigate = useNavigate();
  const modules = getAllGameModules();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-gray-900 dark:text-white">
      <div className="mb-8">
        <BackButton to="/dashboard" label="Back to Dashboard" />
        <h1 className="text-2xl font-bold">Mini Games</h1>
        <p className="text-gray-500 dark:text-white/50 mt-1">Choose a game to host for your students</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {modules.map((mod) => {
          const Icon = ICON_MAP[mod.metadata.icon] || Gamepad2;
          return (
            <button
              key={mod.type}
              onClick={() => navigate(`/mini-game/${mod.type}/host`)}
              className="card-night card-night-hover p-5 flex flex-col items-start gap-3 text-left group animate-fade-in"
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand" />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 dark:text-white/30 group-hover:text-brand transition-colors" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-brand transition-colors">
                  {mod.metadata.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-white/40 mt-1">
                  {mod.metadata.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
