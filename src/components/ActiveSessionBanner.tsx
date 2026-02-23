import { useNavigate } from 'react-router-dom';
import { Radio, Users, Play, X } from 'lucide-react';
import type { ActiveSessionInfo } from '../hooks/useActiveSession';

interface Props {
  session: ActiveSessionInfo;
  onEnd: () => void;
}

export default function ActiveSessionBanner({ session, onEnd }: Props) {
  const navigate = useNavigate();

  return (
    <div className="mb-8 bg-white rounded-2xl border border-brand/30 shadow-[3px_3px_0px_0px_rgba(212,86,107,0.2)] p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 animate-fade-in">
      {/* Left: Status indicator */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <Radio className="w-5 h-5 text-brand" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-brand rounded-full animate-pulse" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-sm">Active Session</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              session.status === 'lobby'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {session.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 truncate">
            {session.quizTitle}
            <span className="mx-1.5 text-gray-300">|</span>
            PIN: <span className="font-mono font-bold text-gray-700">{session.pinCode}</span>
            <span className="mx-1.5 text-gray-300">|</span>
            <Users className="w-3 h-3 inline -mt-0.5" /> {session.playerCount}
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:ml-auto shrink-0">
        <button
          onClick={() => navigate(`/quiz/${session.quizId}/host?sessionId=${session.id}`)}
          className="px-4 py-2 bg-brand text-white font-semibold rounded-xl text-sm hover:bg-brand-dark transition-colors flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          Resume
        </button>
        <button
          onClick={onEnd}
          className="px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-xl text-sm hover:bg-gray-50 hover:border-danger/30 hover:text-danger transition-colors flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          End Session
        </button>
      </div>
    </div>
  );
}
