import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { BookOpen, Loader2, Search } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { ARCADE_MODES, ARCADE_QUESTION_TYPES, type ArcadeMode, type ArcadeSettings } from '../../types/arcade';
import { arcadeApi, errorMessage } from './api';

interface QuizRow {
  id: string;
  title: string;
  playable: number;
  mine: boolean;
}

const TIME_OPTIONS = [3, 5, 7, 10, 15, 20];
const GOLD_GOALS = [null, 1000, 5000, 10000, 25000];
const RACE_GOALS = [10, 15, 20, 30, 50];

const MODE_STYLE: Record<ArcadeMode, string> = {
  gold: 'from-amber-400/30 to-yellow-700/20 border-amber-300/40',
  racing: 'from-emerald-400/30 to-teal-700/20 border-emerald-300/40',
  tower: 'from-sky-400/30 to-indigo-700/20 border-sky-300/40',
  cafe: 'from-orange-400/30 to-rose-700/20 border-orange-300/40',
};

export default function ArcadePicker() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const addToast = useToastStore((s) => s.addToast);
  const [mode, setMode] = useState<ArcadeMode>('gold');
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [quizId, setQuizId] = useState('');
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState<ArcadeSettings>(ARCADE_MODES.gold.defaults);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [mine, pub, questions] = await Promise.all([
        getDocs(query(collection(db, 'quizzes'), where('ownerId', '==', user.id))),
        getDocs(query(collection(db, 'quizzes'), where('visibility', '==', 'public'))),
        getDocs(query(collection(db, 'questions'), where('type', 'in', [...ARCADE_QUESTION_TYPES]))),
      ]);
      const counts = new Map<string, number>();
      for (const q of questions.docs) {
        const id = q.data().quizId as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const rows = new Map<string, QuizRow>();
      for (const d of [...mine.docs, ...pub.docs]) {
        if (rows.has(d.id)) continue;
        const data = d.data();
        rows.set(d.id, {
          id: d.id,
          title: (data.title as string) || 'Untitled',
          playable: counts.get(d.id) ?? 0,
          mine: data.ownerId === user.id,
        });
      }
      const list = [...rows.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || b.playable - a.playable);
      setQuizzes(list);
      const first = list.find((q) => q.playable > 0);
      if (first) setQuizId((cur) => cur || first.id);
    })().catch((e) => addToast('error', errorMessage(e)));
  }, [user, addToast]);

  const filtered = useMemo(
    () => (quizzes ?? []).filter((q) => q.title.toLowerCase().includes(search.trim().toLowerCase())),
    [quizzes, search],
  );

  const pickMode = (m: ArcadeMode) => {
    setMode(m);
    setSettings(ARCADE_MODES[m].defaults);
  };

  const create = async () => {
    if (!quizId) return;
    setCreating(true);
    try {
      const r = await arcadeApi.create({ quizId, mode, settings });
      navigate(`/arcade/${r.gameId}/host`);
    } catch (e) {
      addToast('error', errorMessage(e));
      setCreating(false);
    }
  };

  const minutes = settings.timeLimitSec ? Math.round(settings.timeLimitSec / 60) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-10 space-y-8">
      <div>
        <h1 className="text-3xl sm:text-4xl text-gray-900 dark:text-white">Arcade</h1>
        <p className="text-gray-500 dark:text-white/50 font-semibold mt-1">
          Blooket-style games for your classroom. Students play at their own pace on any phone or laptop on the school Wi-Fi.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-bold text-gray-700 dark:text-white/80 mb-3">1. Pick a game mode</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(ARCADE_MODES) as ArcadeMode[]).map((m) => {
            const info = ARCADE_MODES[m];
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => pickMode(m)}
                className={`text-left rounded-3xl p-4 sm:p-5 border-2 bg-gradient-to-br transition-all ${MODE_STYLE[m]} ${
                  active ? 'ring-4 ring-brand/60 scale-[1.02]' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <div className="text-4xl sm:text-5xl mb-2">{info.emoji}</div>
                <div className="text-xl text-gray-900 dark:text-white">{info.name}</div>
                <p className="text-sm text-gray-600 dark:text-white/60 font-semibold mt-1 leading-snug">{info.tagline}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-lg font-bold text-gray-700 dark:text-white/80 flex-1">2. Choose a question set</h2>
          <label className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-brand"
            />
          </label>
        </div>
        {quizzes === null ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-night p-8 text-center text-gray-500 dark:text-white/60 font-semibold">
            No question sets yet.{' '}
            <Link to="/quiz/new" className="text-brand underline">Create one</Link> or import a file from the Quizzes page.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
            {filtered.map((q) => {
              const active = q.id === quizId;
              const disabled = q.playable === 0;
              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setQuizId(q.id)}
                  className={`flex items-center gap-3 text-left rounded-2xl p-4 border-2 transition-all ${
                    active ? 'border-brand bg-brand/10' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-brand/50'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <BookOpen className="w-6 h-6 text-brand shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 dark:text-white truncate">{q.title}</div>
                    <div className="text-xs text-gray-500 dark:text-white/50 font-semibold">
                      {disabled ? 'No playable questions' : `${q.playable} question${q.playable === 1 ? '' : 's'}`}
                      {q.mine ? '' : ' · public'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-700 dark:text-white/80 mb-3">3. Settings</h2>
        <div className="card-night p-5 flex flex-wrap gap-6 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-gray-500 dark:text-white/50">Time limit</span>
            <select
              value={minutes ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, timeLimitSec: e.target.value ? Number(e.target.value) * 60 : null }))}
              className="px-3 py-2 rounded-xl bg-white dark:bg-[#1a2236] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white"
            >
              {(mode === 'racing' || mode === 'gold') && <option value="">No limit</option>}
              {TIME_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </label>
          {mode === 'gold' && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-gray-500 dark:text-white/50">Gold goal</span>
              <select
                value={settings.goal ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, goal: e.target.value ? Number(e.target.value) : null }))}
                className="px-3 py-2 rounded-xl bg-white dark:bg-[#1a2236] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white"
              >
                {GOLD_GOALS.map((g) => (
                  <option key={g ?? 'none'} value={g ?? ''}>{g ? `${g.toLocaleString()} gold` : 'Most gold when time is up'}</option>
                ))}
              </select>
            </label>
          )}
          {mode === 'racing' && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-gray-500 dark:text-white/50">Race length</span>
              <select
                value={settings.goal ?? 20}
                onChange={(e) => setSettings((s) => ({ ...s, goal: Number(e.target.value) }))}
                className="px-3 py-2 rounded-xl bg-white dark:bg-[#1a2236] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white"
              >
                {RACE_GOALS.map((g) => (
                  <option key={g} value={g}>{g} correct answers</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={create}
            disabled={!quizId || creating || (mode === 'gold' && !settings.timeLimitSec && !settings.goal)}
            className="btn-3d-success btn-3d-lg px-8 py-3 disabled:opacity-40"
          >
            {creating ? 'Creating…' : `Host ${ARCADE_MODES[mode].name}`}
          </button>
        </div>
      </section>
    </div>
  );
}
