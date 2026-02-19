import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, updateDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete } from '../../lib/swal';
import { SkeletonCard } from '../../components/Skeleton';
import {
  ArrowLeft, Copy, RefreshCw, Trash2, UserPlus, Users, Shield,
  X as XIcon, Clock, Link as LinkIcon, Mail,
} from 'lucide-react';
import { COLLECTION_COLORS } from '../../types/models';
import type { Classroom, ClassroomMember, ClassroomColor } from '../../types/models';

function daysUntil(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClassDetail() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState<ClassroomColor>('brand');
  const [saving, setSaving] = useState(false);

  // Add co-teacher
  const [coTeacherEmail, setCoTeacherEmail] = useState('');
  const [addingCoTeacher, setAddingCoTeacher] = useState(false);

  // Action states
  const [regenerating, setRegenerating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Real-time classroom doc
  useEffect(() => {
    if (!classroomId) return;
    const unsub = onSnapshot(doc(db, 'classrooms', classroomId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Classroom;
        setClassroom(data);
        setEditName(data.name);
        setEditDesc(data.description);
        setEditColor(data.color);
      }
      setLoading(false);
    });
    return unsub;
  }, [classroomId]);

  // Real-time members subcollection
  useEffect(() => {
    if (!classroomId) return;
    const unsub = onSnapshot(collection(db, 'classrooms', classroomId, 'members'), (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ClassroomMember[]);
    });
    return unsub;
  }, [classroomId]);

  const isOwner = classroom?.ownerId === user?.id;
  const isExpired = classroom ? Date.now() > classroom.joinCodeExpiresAt : false;

  const students = members.filter((m) => m.role === 'student');
  const coTeachers = members.filter((m) => m.role === 'co-teacher');

  const handleSaveEdit = async () => {
    if (!classroomId || !editName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'classrooms', classroomId), {
        name: editName.trim(),
        description: editDesc.trim(),
        color: editColor,
        updatedAt: Date.now(),
      });
      setEditing(false);
      addToast('success', 'Class updated');
    } catch {
      addToast('error', 'Failed to update class');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClassroom = async () => {
    if (!classroomId || !classroom) return;
    const { isConfirmed } = await confirmDelete(classroom.name);
    if (!isConfirmed) return;
    try {
      await deleteDoc(doc(db, 'classrooms', classroomId));
      addToast('success', `"${classroom.name}" deleted`);
      navigate('/classes');
    } catch {
      addToast('error', 'Failed to delete class');
    }
  };

  const handleCopyCode = () => {
    if (!classroom) return;
    navigator.clipboard.writeText(classroom.joinCode);
    addToast('success', 'Join code copied!');
  };

  const handleCopyLink = () => {
    if (!classroom) return;
    const url = `${window.location.origin}/join-class?code=${classroom.joinCode}`;
    navigator.clipboard.writeText(url);
    addToast('success', 'Join link copied!');
  };

  const handleRegenerate = async () => {
    if (!classroomId) return;
    setRegenerating(true);
    try {
      const fn = httpsCallable<{ classroomId: string }, { joinCode: string }>(functions, 'regenerateJoinCode');
      const result = await fn({ classroomId });
      addToast('success', `New code: ${result.data.joinCode}`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to regenerate code');
    } finally {
      setRegenerating(false);
    }
  };

  const handleAddCoTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classroomId || !coTeacherEmail.trim()) return;
    setAddingCoTeacher(true);
    try {
      const fn = httpsCallable<
        { classroomId: string; email: string },
        { success: boolean; displayName: string }
      >(functions, 'addCoTeacher');
      const result = await fn({ classroomId, email: coTeacherEmail.trim() });
      addToast('success', `${result.data.displayName} added as co-teacher`);
      setCoTeacherEmail('');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to add co-teacher');
    } finally {
      setAddingCoTeacher(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!classroomId) return;
    const { isConfirmed } = await confirmDelete(memberName);
    if (!isConfirmed) return;
    setRemovingId(memberId);
    try {
      const fn = httpsCallable<{ classroomId: string; userId: string }, { success: boolean }>(functions, 'removeClassroomMember');
      await fn({ classroomId, userId: memberId });
      addToast('success', `${memberName} removed`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemovingId(null);
    }
  };

  const colorMeta = COLLECTION_COLORS.find((c) => c.key === (classroom?.color || 'brand')) || COLLECTION_COLORS[0];

  if (loading || !classroom) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back */}
      <button
        onClick={() => navigate('/classes')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Classes
      </button>

      {/* Header Card */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden mb-6 animate-fade-in">
        <div className={`h-2 ${colorMeta.bg}`} />
        {editing ? (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
              <div className="flex gap-2">
                {COLLECTION_COLORS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setEditColor(c.key)}
                    className={`w-8 h-8 rounded-full ${c.bg} transition-all ${editColor === c.key ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editName.trim()}
                className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditName(classroom.name); setEditDesc(classroom.description); setEditColor(classroom.color); }}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{classroom.name}</h1>
              {classroom.description && <p className="text-gray-500">{classroom.description}</p>}
              <div className="flex items-center gap-4 text-sm text-gray-400 mt-2">
                <span>{classroom.studentCount} student{classroom.studentCount !== 1 ? 's' : ''}</span>
                <span>{classroom.coTeacherCount} co-teacher{classroom.coTeacherCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:text-brand hover:border-brand/20 transition-colors"
              >
                Edit
              </button>
              {isOwner && (
                <button
                  onClick={handleDeleteClassroom}
                  className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-danger hover:border-danger/20 transition-colors"
                  title="Delete class"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Join Code Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 animate-fade-in">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Join Code</h2>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 flex items-center gap-3">
            <span className="text-4xl font-black tracking-[0.2em] text-gray-900 font-mono">{classroom.joinCode}</span>
            <div className="flex items-center gap-1">
              {isExpired ? (
                <span className="text-xs font-bold text-danger bg-danger/10 px-2 py-1 rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Expired
                </span>
              ) : (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {daysUntil(classroom.joinCodeExpiresAt)}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyCode}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-brand/30 transition-all flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> Copy Code
            </button>
            <button
              onClick={handleCopyLink}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-brand/30 transition-all flex items-center gap-2"
            >
              <LinkIcon className="w-4 h-4" /> Copy Link
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-brand/30 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} /> Regenerate
            </button>
          </div>
        </div>
      </div>

      {/* Co-Teachers Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4" /> Co-Teachers ({coTeachers.length})
          </h2>
        </div>

        {/* Add co-teacher form */}
        <form onSubmit={handleAddCoTeacher} className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={coTeacherEmail}
              onChange={(e) => setCoTeacherEmail(e.target.value)}
              placeholder="Enter teacher's email..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-sm text-gray-800"
            />
          </div>
          <button
            type="submit"
            disabled={addingCoTeacher || !coTeacherEmail.trim()}
            className="px-4 py-2.5 bg-brand text-white font-medium text-sm rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {addingCoTeacher ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            Add
          </button>
        </form>

        {/* Owner */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 mb-2">
          <div className="w-9 h-9 bg-gradient-to-br from-brand to-accent rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {classroom.ownerId === user?.id ? `${user.displayName} (You)` : 'Owner'}
            </p>
          </div>
          <span className="text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full uppercase">Owner</span>
        </div>

        {/* Co-teacher list */}
        {coTeachers.map((member) => (
          <div key={member.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
            <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-bold shrink-0">
              {member.displayName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{member.displayName}</p>
              <p className="text-xs text-gray-400 truncate">{member.email}</p>
            </div>
            <span className="text-xs text-gray-400">{formatDate(member.joinedAt)}</span>
            <button
              onClick={() => handleRemoveMember(member.id, member.displayName)}
              disabled={removingId === member.id}
              className="p-1.5 rounded-lg text-gray-300 hover:text-danger hover:bg-danger/5 transition-colors disabled:opacity-50"
              title="Remove"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
        {coTeachers.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3">No co-teachers yet. Add one above.</p>
        )}
      </div>

      {/* Students Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-fade-in">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-4">
          <Users className="w-4 h-4" /> Students ({students.length})
        </h2>

        {students.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No students have joined yet.</p>
            <p className="text-xs text-gray-400 mt-1">Share the join code above to invite students.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {students.map((member) => (
              <div key={member.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-bold shrink-0">
                  {member.displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{member.displayName}</p>
                  <p className="text-xs text-gray-400 truncate">{member.email}</p>
                </div>
                <span className="text-xs text-gray-400">{formatDate(member.joinedAt)}</span>
                <button
                  onClick={() => handleRemoveMember(member.id, member.displayName)}
                  disabled={removingId === member.id}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-danger hover:bg-danger/5 transition-colors disabled:opacity-50"
                  title="Remove student"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
