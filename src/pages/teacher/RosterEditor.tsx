import { useEffect, useState, useRef, useCallback } from 'react';
import {
  doc, collection, addDoc, getDocs, updateDoc,
  query, where, orderBy, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import WaveBackground from '../../components/ui/WaveBackground';
import {
  ArrowLeft, Plus, Trash2, GripVertical, Upload, Save, Users, School,
} from 'lucide-react';
import type { Roster, RosterStudent, Classroom, ClassroomMember } from '../../types/models';

export default function RosterEditor() {
  const { rosterId } = useParams<{ rosterId: string }>();
  const isNew = !rosterId || rosterId === 'new';
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();

  const [rosterName, setRosterName] = useState('');
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [originalStudents, setOriginalStudents] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Classroom import
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  const [importingClassroom, setImportingClassroom] = useState(false);

  // CSV file input ref
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Track changes
  useEffect(() => {
    if (loading) return;
    const studentsChanged =
      JSON.stringify(students) !== JSON.stringify(originalStudents);
    setHasChanges(studentsChanged || (isNew && rosterName.trim().length > 0));
  }, [students, originalStudents, rosterName, isNew, loading]);

  // Load existing roster
  useEffect(() => {
    if (isNew || !rosterId || !user) return;

    const loadRoster = async () => {
      try {
        const rosterDoc = await getDocs(
          query(collection(db, 'rosters'), where('__name__', '==', rosterId)),
        );
        if (rosterDoc.empty) {
          addToast('error', 'Roster not found');
          navigate('/rosters');
          return;
        }
        const rosterData = { id: rosterDoc.docs[0].id, ...rosterDoc.docs[0].data() } as Roster;
        if (rosterData.ownerId !== user.id) {
          addToast('error', 'You do not have permission to edit this roster');
          navigate('/rosters');
          return;
        }
        setRosterName(rosterData.name);

        // Load students
        const studentsSnap = await getDocs(
          query(
            collection(db, 'rosters', rosterId, 'students'),
            orderBy('order', 'asc'),
          ),
        );
        const studentsData = studentsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as RosterStudent[];
        setStudents(studentsData);
        setOriginalStudents(studentsData);
      } catch {
        addToast('error', 'Failed to load roster');
        navigate('/rosters');
      } finally {
        setLoading(false);
      }
    };

    loadRoster();
  }, [rosterId, isNew, user, navigate, addToast]);

  // Fetch teacher's classrooms for import
  useEffect(() => {
    if (!user) return;
    setLoadingClassrooms(true);

    const fetchClassrooms = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'classrooms'), where('ownerId', '==', user.id)),
        );
        setClassrooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Classroom[]);
      } catch {
        // Silently fail; classrooms are optional
      } finally {
        setLoadingClassrooms(false);
      }
    };

    fetchClassrooms();
  }, [user]);

  // --- Student management ---

  const addStudent = () => {
    const newStudent: RosterStudent = {
      id: crypto.randomUUID(),
      name: '',
      studentNumber: '',
      email: '',
      order: students.length,
    };
    setStudents((prev) => [...prev, newStudent]);
  };

  const updateStudent = (index: number, field: keyof RosterStudent, value: string) => {
    setStudents((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  };

  const removeStudent = (index: number) => {
    setStudents((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((s, i) => ({ ...s, order: i }));
    });
  };

  // --- Drag and drop ---

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const reordered = [...students];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dragOverIndex, 0, moved);
      setStudents(reordered.map((s, i) => ({ ...s, order: i })));
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // --- CSV Import ---

  const handleCsvImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) {
        addToast('warning', 'CSV file appears empty or has no data rows');
        return;
      }

      // Skip header row
      const dataLines = lines.slice(1);
      const newStudents: RosterStudent[] = [];
      let currentOrder = students.length;

      for (const line of dataLines) {
        // Handle comma-separated values (basic CSV parsing)
        const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
        const name = cols[0] || '';
        const studentNumber = cols[1] || '';

        if (!name) continue;

        newStudents.push({
          id: crypto.randomUUID(),
          name,
          studentNumber,
          email: cols[2] || '',
          order: currentOrder++,
        });
      }

      if (newStudents.length === 0) {
        addToast('warning', 'No valid student rows found in CSV');
        return;
      }

      setStudents((prev) => [...prev, ...newStudents]);
      addToast('success', `Imported ${newStudents.length} student${newStudents.length !== 1 ? 's' : ''} from CSV`);
    };

    reader.readAsText(file);
    // Reset the input so the same file can be re-imported
    e.target.value = '';
  }, [students.length, addToast]);

  // --- Classroom Import ---

  const handleClassroomImport = async (classroomId: string) => {
    if (!classroomId) return;
    setImportingClassroom(true);

    try {
      const membersSnap = await getDocs(
        query(
          collection(db, 'classrooms', classroomId, 'members'),
          where('role', '==', 'student'),
        ),
      );
      const members = membersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ClassroomMember[];

      if (members.length === 0) {
        addToast('warning', 'No students found in this classroom');
        setImportingClassroom(false);
        return;
      }

      // Avoid duplicates by name
      const existingNames = new Set(students.map((s) => s.name.toLowerCase()));
      let currentOrder = students.length;
      let addedCount = 0;

      const newStudents: RosterStudent[] = [];
      for (const member of members) {
        if (existingNames.has(member.displayName.toLowerCase())) continue;
        newStudents.push({
          id: crypto.randomUUID(),
          name: member.displayName,
          email: member.email || '',
          order: currentOrder++,
        });
        addedCount++;
      }

      if (addedCount === 0) {
        addToast('info', 'All students from this classroom are already in the roster');
      } else {
        setStudents((prev) => [...prev, ...newStudents]);
        addToast('success', `Added ${addedCount} student${addedCount !== 1 ? 's' : ''} from classroom`);
      }
    } catch {
      addToast('error', 'Failed to import students from classroom');
    } finally {
      setImportingClassroom(false);
    }
  };

  // --- Save ---

  const handleSave = async () => {
    if (!user) return;
    if (!rosterName.trim()) {
      addToast('warning', 'Please enter a roster name');
      return;
    }

    // Validate that all students have names
    const invalidStudents = students.filter((s) => !s.name.trim());
    if (invalidStudents.length > 0) {
      addToast('warning', 'All students must have a name');
      return;
    }

    setSaving(true);

    try {
      if (isNew) {
        // Create new roster
        const rosterRef = await addDoc(collection(db, 'rosters'), {
          ownerId: user.id,
          name: rosterName.trim(),
          studentCount: students.length,
          classroomId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        // Batch write students
        if (students.length > 0) {
          const batch = writeBatch(db);
          students.forEach((student, index) => {
            const studentRef = doc(collection(db, 'rosters', rosterRef.id, 'students'));
            batch.set(studentRef, {
              name: student.name.trim(),
              studentNumber: student.studentNumber || '',
              email: student.email || '',
              order: index,
            });
          });
          await batch.commit();
        }

        addToast('success', `"${rosterName.trim()}" created with ${students.length} student${students.length !== 1 ? 's' : ''}`);
        navigate(`/roster/${rosterRef.id}`);
      } else if (rosterId) {
        // Update existing roster
        await updateDoc(doc(db, 'rosters', rosterId), {
          name: rosterName.trim(),
          studentCount: students.length,
          updatedAt: Date.now(),
        });

        // Diff students: figure out what to add, update, and delete
        const originalIds = new Set(originalStudents.map((s) => s.id));
        const currentIds = new Set(students.map((s) => s.id));

        // Students to delete (in original but not in current)
        const toDelete = originalStudents.filter((s) => !currentIds.has(s.id));
        // Students to add (in current but not in original, i.e. local UUID-based IDs)
        const toAdd = students.filter((s) => !originalIds.has(s.id));
        // Students to update (in both)
        const toUpdate = students.filter((s) => originalIds.has(s.id));

        const batch = writeBatch(db);

        for (const student of toDelete) {
          batch.delete(doc(db, 'rosters', rosterId, 'students', student.id));
        }

        for (const student of toAdd) {
          const studentRef = doc(collection(db, 'rosters', rosterId, 'students'));
          batch.set(studentRef, {
            name: student.name.trim(),
            studentNumber: student.studentNumber || '',
            email: student.email || '',
            order: student.order,
          });
        }

        for (const student of toUpdate) {
          batch.update(doc(db, 'rosters', rosterId, 'students', student.id), {
            name: student.name.trim(),
            studentNumber: student.studentNumber || '',
            email: student.email || '',
            order: student.order,
          });
        }

        await batch.commit();

        // Refresh original state
        setOriginalStudents([...students]);
        addToast('success', 'Roster saved successfully');
      }
    } catch {
      addToast('error', 'Failed to save roster. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="h-8 w-48 bg-gray-100 dark:bg-white/10 rounded-lg animate-pulse mb-8" />
        <div className="card-night p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-surface">
      <WaveBackground variant="dark" position="bottom" />
      <div className="absolute inset-0 pattern-stars pointer-events-none" />
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/rosters')}
              className="p-2 rounded-xl text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl text-gray-900 dark:text-white">
                {isNew ? 'New Roster' : rosterName || 'Edit Roster'}
              </h1>
              <p className="text-sm text-gray-400 dark:text-white/40">
                {students.length} student{students.length !== 1 ? 's' : ''}
                {hasChanges && ' (unsaved changes)'}
              </p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !rosterName.trim()}
            className="btn-3d-cyan btn-3d-sm flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Roster Name */}
        <div className="card-night p-6 mb-6">
          <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1.5">
            Roster Name
          </label>
          <input
            type="text"
            value={rosterName}
            onChange={(e) => setRosterName(e.target.value)}
            placeholder="e.g. Grade 10 - Section A"
            className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
            autoFocus={isNew}
          />
        </div>

        {/* Import Section */}
        <div className="card-night p-6 mb-6">
          <h2 className="text-sm font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-4">
            Import Students
          </h2>
          <div className="flex flex-wrap gap-3">
            {/* CSV Import */}
            <button
              onClick={() => csvInputRef.current?.click()}
              className="btn-3d-ghost btn-3d-sm flex items-center gap-2 text-sm"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvImport}
              className="hidden"
            />

            {/* Classroom Import */}
            {!loadingClassrooms && classrooms.length > 0 && (
              <div className="flex items-center gap-2">
                <School className="w-4 h-4 text-gray-400 dark:text-white/40" />
                <select
                  defaultValue=""
                  onChange={(e) => handleClassroomImport(e.target.value)}
                  disabled={importingClassroom}
                  className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-sm outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:opacity-50"
                >
                  <option value="" disabled className="bg-surface-card text-white">
                    {importingClassroom ? 'Importing...' : 'Import from classroom...'}
                  </option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id} className="bg-surface-card text-white">
                      {c.name} ({c.studentCount} students)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-white/30 mt-3">
            CSV format: name, studentNumber, email (first row is header)
          </p>
        </div>

        {/* Student List */}
        <div className="card-night p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4" />
              Students ({students.length})
            </h2>
            <button
              onClick={addStudent}
              className="btn-3d-cyan btn-3d-sm flex items-center gap-1.5 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Student
            </button>
          </div>

          {students.length === 0 ? (
            <div className="text-center py-12 animate-fade-in">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-gray-300 dark:text-white/20" />
              </div>
              <p className="text-sm text-gray-500 dark:text-white/40 mb-4">
                No students yet. Add them manually, import a CSV, or pull from a classroom.
              </p>
              <button
                onClick={addStudent}
                className="btn-3d-ghost btn-3d-sm text-sm"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Add your first student
              </button>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="hidden sm:grid grid-cols-[32px_1fr_140px_180px_40px] gap-3 px-3 py-2 text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider border-b border-gray-200 dark:border-white/10 mb-2">
                <span />
                <span>Name</span>
                <span>Student No.</span>
                <span>Email</span>
                <span />
              </div>

              {/* Student Rows */}
              <div className="space-y-1">
                {students.map((student, index) => (
                  <div
                    key={student.id}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                    onDragEnd={handleDragEnd}
                    className={`group grid grid-cols-1 sm:grid-cols-[32px_1fr_140px_180px_40px] gap-2 sm:gap-3 items-center px-3 py-2 rounded-xl transition-all ${
                      dragOverIndex === index && dragIndex !== index ? 'ring-2 ring-brand' : ''
                    } ${dragIndex === index ? 'opacity-40' : ''} hover:bg-gray-50 dark:hover:bg-white/5`}
                  >
                    {/* Drag handle */}
                    <div className="hidden sm:flex items-center justify-center">
                      <GripVertical className="w-4 h-4 text-gray-300 dark:text-white/20 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* Name */}
                    <input
                      type="text"
                      value={student.name}
                      onChange={(e) => updateStudent(index, 'name', e.target.value)}
                      placeholder="Student name *"
                      className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-sm outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-white/20"
                    />

                    {/* Student Number */}
                    <input
                      type="text"
                      value={student.studentNumber || ''}
                      onChange={(e) => updateStudent(index, 'studentNumber', e.target.value)}
                      placeholder="ID / No."
                      className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-sm outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-white/20"
                    />

                    {/* Email */}
                    <input
                      type="email"
                      value={student.email || ''}
                      onChange={(e) => updateStudent(index, 'email', e.target.value)}
                      placeholder="email@example.com"
                      className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-sm outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-white/20"
                    />

                    {/* Delete */}
                    <button
                      onClick={() => removeStudent(index)}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-white/30 hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100 justify-self-center"
                      title="Remove student"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add another row */}
              <button
                onClick={addStudent}
                className="w-full mt-3 p-3 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-white/15 rounded-xl hover:border-brand hover:bg-brand/5 transition-all text-gray-400 dark:text-white/30 hover:text-brand text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Add Student
              </button>
            </>
          )}
        </div>

        {/* Bottom Save Bar (visible when scrolled) */}
        {hasChanges && (
          <div className="sticky bottom-6 mt-6 flex justify-end animate-fade-in">
            <button
              onClick={handleSave}
              disabled={saving || !rosterName.trim()}
              className="btn-3d-cyan flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : `Save Roster (${students.length} students)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
