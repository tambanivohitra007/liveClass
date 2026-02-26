import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Users, FileText, Layers } from 'lucide-react';
import WaveBackground from '../../components/ui/WaveBackground';
import type { Session, Roster, Rubric, GradingSourceType } from '../../types/models';

const STEPS = [
  { label: 'Name & Source', icon: FileText },
  { label: 'Pick Source', icon: Users },
  { label: 'Pick Rubric', icon: Layers },
  { label: 'Confirm', icon: Check },
];

function formatDate(ts: unknown): string {
  if (!ts) return '';
  const ms = typeof ts === 'number'
    ? ts
    : (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function')
      ? (ts as { toMillis: () => number }).toMillis()
      : 0;
  if (!ms) return '';
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

interface SessionWithQuizTitle extends Session {
  quizTitle: string;
  playerCount: number;
}

export default function GradingSessionCreate() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  // Step state
  const [step, setStep] = useState(0);

  // Form state
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<GradingSourceType | ''>('');
  const [sourceId, setSourceId] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [rubricId, setRubricId] = useState('');
  const [rubricName, setRubricName] = useState('');
  const [creating, setCreating] = useState(false);

  // Fetched lists
  const [sessions, setSessions] = useState<SessionWithQuizTitle[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingRubrics, setLoadingRubrics] = useState(false);

  // Student count for the selected source (used when creating)
  const [selectedStudentCount, setSelectedStudentCount] = useState(0);

  // Fetch sources when entering step 2
  useEffect(() => {
    if (step !== 1 || !user || !sourceType) return;

    const fetchSources = async () => {
      setLoadingSources(true);
      try {
        if (sourceType === 'session') {
          const sessionsSnap = await getDocs(
            query(
              collection(db, 'sessions'),
              where('hostId', '==', user.id),
              where('status', '==', 'ended'),
            ),
          );

          const quizTitleCache = new Map<string, string>();
          const results: SessionWithQuizTitle[] = [];

          for (const sDoc of sessionsSnap.docs) {
            const sData = sDoc.data() as Omit<Session, 'id'>;
            const quizId = sData.quizId;

            if (!quizTitleCache.has(quizId)) {
              try {
                const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
                quizTitleCache.set(quizId, quizDoc.exists() ? (quizDoc.data().title || 'Untitled Quiz') : 'Deleted Quiz');
              } catch {
                quizTitleCache.set(quizId, 'Untitled Quiz');
              }
            }

            const playersSnap = await getDocs(collection(db, 'sessions', sDoc.id, 'players'));

            results.push({
              id: sDoc.id,
              ...sData,
              quizTitle: quizTitleCache.get(quizId) || 'Untitled Quiz',
              playerCount: playersSnap.size,
            } as SessionWithQuizTitle);
          }

          results.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
          setSessions(results);
        } else {
          const rostersSnap = await getDocs(
            query(collection(db, 'rosters'), where('ownerId', '==', user.id)),
          );
          const data = rostersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Roster[];
          data.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          setRosters(data);
        }
      } catch {
        addToast('error', 'Failed to load sources. Please try again.');
      } finally {
        setLoadingSources(false);
      }
    };

    fetchSources();
  }, [step, user, sourceType, addToast]);

  // Fetch rubrics when entering step 3
  useEffect(() => {
    if (step !== 2 || !user) return;

    const fetchRubrics = async () => {
      setLoadingRubrics(true);
      try {
        // Fetch user's own rubrics
        const ownSnap = await getDocs(
          query(collection(db, 'rubrics'), where('ownerId', '==', user.id)),
        );
        // Fetch template rubrics
        const templateSnap = await getDocs(
          query(collection(db, 'rubrics'), where('isTemplate', '==', true)),
        );

        const rubricMap = new Map<string, Rubric>();
        ownSnap.docs.forEach((d) => rubricMap.set(d.id, { id: d.id, ...d.data() } as Rubric));
        templateSnap.docs.forEach((d) => {
          if (!rubricMap.has(d.id)) {
            rubricMap.set(d.id, { id: d.id, ...d.data() } as Rubric);
          }
        });

        setRubrics(Array.from(rubricMap.values()));
      } catch {
        addToast('error', 'Failed to load rubrics. Please try again.');
      } finally {
        setLoadingRubrics(false);
      }
    };

    fetchRubrics();
  }, [step, user, addToast]);

  // Validation per step
  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return name.trim().length > 0 && sourceType !== '';
      case 1:
        return sourceId !== '';
      case 2:
        return rubricId !== '';
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < 3 && canProceed()) {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  };

  const handleSelectSource = (id: string, displayName: string, studentCount: number) => {
    setSourceId(id);
    setSourceName(displayName);
    setSelectedStudentCount(studentCount);
  };

  const handleSelectRubric = (id: string, displayName: string) => {
    setRubricId(id);
    setRubricName(displayName);
  };

  const handleCreate = async () => {
    if (!user || !sourceType) return;
    setCreating(true);
    try {
      const docRef = await addDoc(collection(db, 'grading_sessions'), {
        ownerId: user.id,
        name: name.trim(),
        rubricId,
        sourceType,
        sourceId,
        status: 'active',
        studentCount: selectedStudentCount,
        gradedCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      addToast('success', 'Grading session created successfully!');
      navigate(`/grading/${docRef.id}`);
    } catch {
      addToast('error', 'Failed to create grading session. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const myRubrics = rubrics.filter((r) => r.ownerId === user?.id && !r.isTemplate);
  const templateRubrics = rubrics.filter((r) => r.isTemplate && r.ownerId !== user?.id);

  return (
    <div className="relative min-h-screen bg-surface">
      <WaveBackground variant="dark" position="bottom" />
      <div className="absolute inset-0 pattern-stars pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-2xl text-white">New Grading Session</h1>
          <p className="text-white/40 mt-1 text-sm">Set up a new grading session in a few steps</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {STEPS.map((s, i) => {
            const isCompleted = i < step;
            const isActive = i === step;
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                      isCompleted
                        ? 'bg-success text-white'
                        : isActive
                          ? 'bg-brand text-white shadow-lg shadow-brand/30'
                          : 'bg-white/10 text-white/40'
                    }`}
                  >
                    {isCompleted ? <Check className="w-5 h-5" /> : i + 1}
                  </div>
                  <span
                    className={`text-[11px] font-medium transition-colors duration-300 ${
                      isActive ? 'text-white' : isCompleted ? 'text-success' : 'text-white/40'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-10 h-0.5 rounded-full mb-5 transition-colors duration-300 ${
                      i < step ? 'bg-success' : 'bg-white/10'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="card-night p-6 animate-fade-in" key={step}>
          {/* Step 1: Name & Source Type */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1.5">Session Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Midterm Grading - Class A"
                  className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-3">Student Source</label>
                <div className="grid grid-cols-2 gap-4">
                  {/* Session source card */}
                  <button
                    type="button"
                    onClick={() => {
                      setSourceType('session');
                      setSourceId('');
                      setSourceName('');
                    }}
                    className={`card-night p-5 text-left transition-all duration-200 ${
                      sourceType === 'session'
                        ? 'ring-2 ring-brand bg-brand/5'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                      sourceType === 'session' ? 'bg-brand/20 text-brand' : 'bg-white/10 text-white/50'
                    }`}>
                      <ClipboardCheck className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-sm text-white mb-1">LiveClass Session</h3>
                    <p className="text-xs text-white/40">Grade students from a completed live session</p>
                  </button>

                  {/* Roster source card */}
                  <button
                    type="button"
                    onClick={() => {
                      setSourceType('roster');
                      setSourceId('');
                      setSourceName('');
                    }}
                    className={`card-night p-5 text-left transition-all duration-200 ${
                      sourceType === 'roster'
                        ? 'ring-2 ring-brand bg-brand/5'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                      sourceType === 'roster' ? 'bg-brand/20 text-brand' : 'bg-white/10 text-white/50'
                    }`}>
                      <Users className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-sm text-white mb-1">Student Roster</h3>
                    <p className="text-xs text-white/40">Grade students from a predefined roster list</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Pick Source */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-2">
                {sourceType === 'session' ? 'Select a Session' : 'Select a Roster'}
              </h2>

              {loadingSources ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
                  <p className="text-white/40 text-sm mt-3">Loading...</p>
                </div>
              ) : sourceType === 'session' ? (
                sessions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                      <ClipboardCheck className="w-8 h-8 text-white/30" />
                    </div>
                    <p className="text-white/50 text-sm">No ended sessions found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {sessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectSource(s.id, s.quizTitle, s.playerCount)}
                        className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                          sourceId === s.id
                            ? 'border-brand bg-brand/10 ring-2 ring-brand'
                            : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm text-white truncate">{s.quizTitle}</h3>
                            <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                              <span>PIN: {s.pinCode}</span>
                              <span className="w-1 h-1 rounded-full bg-white/20" />
                              <span>{s.playerCount} players</span>
                              <span className="w-1 h-1 rounded-full bg-white/20" />
                              <span>{formatDate(s.endedAt)}</span>
                            </div>
                          </div>
                          {sourceId === s.id && (
                            <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center shrink-0 ml-3">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                rosters.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                      <Users className="w-8 h-8 text-white/30" />
                    </div>
                    <p className="text-white/50 text-sm">No rosters found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {rosters.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleSelectSource(r.id, r.name, r.studentCount)}
                        className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                          sourceId === r.id
                            ? 'border-brand bg-brand/10 ring-2 ring-brand'
                            : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm text-white truncate">{r.name}</h3>
                            <p className="text-xs text-white/40 mt-1">{r.studentCount} students</p>
                          </div>
                          {sourceId === r.id && (
                            <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center shrink-0 ml-3">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* Step 3: Pick Rubric */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-2">Select a Rubric</h2>

              {loadingRubrics ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
                  <p className="text-white/40 text-sm mt-3">Loading rubrics...</p>
                </div>
              ) : rubrics.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                    <Layers className="w-8 h-8 text-white/30" />
                  </div>
                  <p className="text-white/50 text-sm">No rubrics found. Create one first.</p>
                </div>
              ) : (
                <div className="space-y-6 max-h-96 overflow-y-auto pr-1">
                  {/* My Rubrics */}
                  {myRubrics.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">My Rubrics</h3>
                      <div className="space-y-2">
                        {myRubrics.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => handleSelectRubric(r.id, r.name)}
                            className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                              rubricId === r.id
                                ? 'border-brand bg-brand/10 ring-2 ring-brand'
                                : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-sm text-white truncate">{r.name}</h4>
                                {r.description && (
                                  <p className="text-xs text-white/40 mt-1 line-clamp-1">{r.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                                  <span>{r.criteriaCount} criteria</span>
                                  <span className="w-1 h-1 rounded-full bg-white/20" />
                                  <span>{r.totalMaxScore} pts max</span>
                                </div>
                              </div>
                              {rubricId === r.id && (
                                <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center shrink-0 ml-3">
                                  <Check className="w-4 h-4 text-white" />
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Template Rubrics */}
                  {templateRubrics.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">Templates</h3>
                      <div className="space-y-2">
                        {templateRubrics.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => handleSelectRubric(r.id, r.name)}
                            className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                              rubricId === r.id
                                ? 'border-brand bg-brand/10 ring-2 ring-brand'
                                : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-sm text-white truncate">{r.name}</h4>
                                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider">
                                    Template
                                  </span>
                                </div>
                                {r.description && (
                                  <p className="text-xs text-white/40 mt-1 line-clamp-1">{r.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                                  <span>{r.criteriaCount} criteria</span>
                                  <span className="w-1 h-1 rounded-full bg-white/20" />
                                  <span>{r.totalMaxScore} pts max</span>
                                </div>
                              </div>
                              {rubricId === r.id && (
                                <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center shrink-0 ml-3">
                                  <Check className="w-4 h-4 text-white" />
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Confirm & Create */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white mb-2">Review & Create</h2>

              <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">Session Name</span>
                  <span className="text-sm font-bold text-white">{name}</span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">Source Type</span>
                  <span className="text-sm font-bold text-white">
                    {sourceType === 'session' ? 'LiveClass Session' : 'Student Roster'}
                  </span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">Source</span>
                  <span className="text-sm font-bold text-white truncate ml-4">{sourceName}</span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">Students</span>
                  <span className="text-sm font-bold text-white">{selectedStudentCount}</span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">Rubric</span>
                  <span className="text-sm font-bold text-white truncate ml-4">{rubricName}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="btn-3d-cyan w-full disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="w-5 h-5" />
                    Create Grading Session
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0}
            className="btn-3d-ghost flex items-center gap-2 disabled:opacity-30 disabled:pointer-events-none"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {step < 3 && (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed()}
              className="btn-3d-cyan flex items-center gap-2 disabled:opacity-30 disabled:pointer-events-none"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
