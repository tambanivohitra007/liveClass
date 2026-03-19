import { useNavigate } from 'react-router-dom';
import { Radio, Users, Play, X, Mic, Gamepad2 } from 'lucide-react';
import type { ActiveSessionInfo } from '../hooks/useActiveSession';

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Radio; border: string; iconColor: string; pulse: string; bg: string }> = {
  quiz: {
    label: 'Quiz Session',
    icon: Radio,
    border: 'border-brand/30',
    iconColor: 'text-brand',
    pulse: 'bg-brand',
    bg: 'bg-brand/5 dark:bg-brand/10',
  },
  live_grading: {
    label: 'Live Grading',
    icon: Mic,
    border: 'border-emerald-500/30',
    iconColor: 'text-emerald-400',
    pulse: 'bg-emerald-400',
    bg: 'bg-emerald-500/5 dark:bg-emerald-500/10',
  },
  mini_game: {
    label: 'Mini Game',
    icon: Gamepad2,
    border: 'border-purple-500/30',
    iconColor: 'text-purple-400',
    pulse: 'bg-purple-400',
    bg: 'bg-purple-500/5 dark:bg-purple-500/10',
  },
};

const DEFAULT_CONFIG = {
  label: 'Session', icon: Radio, border: 'border-brand/30', iconColor: 'text-brand', pulse: 'bg-brand', bg: '',
};

interface Props {
  session: ActiveSessionInfo;
  onEnd: () => void;
}

export default function ActiveSessionBanner({ session, onEnd }: Props) {
  const navigate = useNavigate();
  const cfg = TYPE_CONFIG[session.type] || DEFAULT_CONFIG;
  const Icon = cfg.icon;

  return (
    <div className={`mb-4 card-night ${cfg.border} ${cfg.bg} p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-fade-in`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 ${cfg.pulse} rounded-full animate-pulse`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-white text-sm">{cfg.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              session.status === 'lobby' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
            }`}>
              {session.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-white/50 truncate">
            {session.title}
            <span className="mx-1.5 text-gray-300 dark:text-white/20">|</span>
            PIN: <span className="font-mono font-bold text-gray-700 dark:text-white/70">{session.pinCode}</span>
            <span className="mx-1.5 text-gray-300 dark:text-white/20">|</span>
            <Users className="w-3 h-3 inline -mt-0.5" /> {session.playerCount}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:ml-auto shrink-0">
        <button
          onClick={() => navigate(session.resumeUrl)}
          className="btn-3d-cyan btn-3d-sm text-sm flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          Resume
        </button>
        <button
          onClick={onEnd}
          className="btn-3d-ghost btn-3d-sm text-sm flex items-center gap-1.5 hover:border-danger/30! hover:text-danger!"
        >
          <X className="w-3.5 h-3.5" />
          End
        </button>
      </div>
    </div>
  );
}
