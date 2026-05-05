import { useState, useRef } from 'react';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { useNavigate } from 'react-router-dom';
import { confirmAction } from '../lib/swal';
import { Camera, Save, KeyRound, Mail, Shield, Eye, EyeOff, Phone, MapPin } from 'lucide-react';
import BackButton from '../components/BackButton';

export default function Profile() {
  const { firebaseUser, user, setUser } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [role, setRole] = useState<'teacher' | 'student'>(user?.role || 'student');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>(user?.gender || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const currentPwRef = useRef<HTMLInputElement>(null);
  const newPwRef = useRef<HTMLInputElement>(null);
  const confirmPwRef = useRef<HTMLInputElement>(null);

  const handleRoleChange = async (newRole: 'teacher' | 'student') => {
    if (newRole === role) return;
    if (user?.role === 'teacher' && user.approvalStatus === 'approved' && newRole === 'student') {
      const { isConfirmed } = await confirmAction(
        'Switch to student?',
        'You will lose teacher access. Switching back to teacher will require admin approval again.',
        'Switch to Student'
      );
      if (!isConfirmed) return;
    }
    setRole(newRole);
  };

  const isEmailUser = firebaseUser?.providerData[0]?.providerId === 'password';

  const handleSaveProfile = async () => {
    if (!firebaseUser || !user) return;
    if (!displayName.trim()) {
      addToast('warning', 'Display name cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      // Update Firebase Auth profile
      await updateProfile(firebaseUser, { displayName: displayName.trim() });

      // Build update payload — handle approvalStatus based on role change
      const roleChanged = role !== user.role;
      const updateData: Record<string, unknown> = {
        displayName: displayName.trim(),
        role,
        gender: gender || '',
        phone: phone.trim(),
        address: address.trim(),
      };

      if (roleChanged && role === 'teacher') {
        updateData.approvalStatus = 'pending';
      } else if (roleChanged && role === 'student') {
        updateData.approvalStatus = deleteField();
      }

      // Update Firestore user doc
      await updateDoc(doc(db, 'users', firebaseUser.uid), updateData);

      // Update local state
      const updatedUser = { ...user, displayName: displayName.trim(), role, gender, phone: phone.trim(), address: address.trim() };
      if (roleChanged && role === 'teacher') {
        updatedUser.approvalStatus = 'pending';
      } else if (roleChanged && role === 'student') {
        delete updatedUser.approvalStatus;
      }
      setUser(updatedUser);

      if (roleChanged && role === 'teacher') {
        addToast('warning', 'Your teacher account is pending admin approval.');
        navigate('/pending-approval');
      } else if (roleChanged && role === 'student') {
        addToast('success', 'Switched to student. Welcome!');
        navigate('/student/dashboard');
      } else {
        addToast('success', 'Profile updated successfully.');
      }
    } catch {
      addToast('error', 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!firebaseUser || !user) return;
    if (!file.type.startsWith('image/')) {
      addToast('warning', 'Please select an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast('warning', 'Image must be under 2MB.');
      return;
    }

    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `avatars/${firebaseUser.uid}`);
      await uploadBytes(storageRef, file);
      const photoUrl = await getDownloadURL(storageRef);

      await updateProfile(firebaseUser, { photoURL: photoUrl });
      await updateDoc(doc(db, 'users', firebaseUser.uid), { photoUrl });

      setUser({ ...user, photoUrl });
      addToast('success', 'Profile photo updated.');
    } catch {
      addToast('error', 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (!firebaseUser || !firebaseUser.email) return;

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      newPwRef.current?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      confirmPwRef.current?.focus();
      return;
    }

    setChangingPassword(true);
    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);

      // Update password
      await updatePassword(firebaseUser, newPassword);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      addToast('success', 'Password changed successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password.';
      if (message.includes('wrong-password') || message.includes('invalid-credential')) {
        setPasswordError('Current password is incorrect.');
        currentPwRef.current?.focus();
      } else {
        setPasswordError('Failed to change password. Please try again.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  if (!firebaseUser || !user) return null;

  const initials = user.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const photoUrl = user.photoUrl || firebaseUser.photoURL;

  return (
    <div className="min-h-screen bg-linear-to-b from-[#E8EAF0] to-surface dark:from-surface-dark dark:to-surface-dark">
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <BackButton onClick={() => navigate(-1)} />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Profile Settings</h1>

      {/* Avatar Section */}
      <div className="card-night p-6 mb-6 animate-fade-in">
        <div className="flex items-center gap-6">
          <div className="relative group">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={user.displayName}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-gray-100 dark:border-white/20"
              />
            ) : (
              <div className="w-20 h-20 bg-linear-to-br from-brand to-accent rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
                {initials}
              </div>
            )}
            <label className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center">
              {uploadingPhoto ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
                className="hidden"
                disabled={uploadingPhoto}
              />
            </label>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{user.displayName}</h2>
            <p className="text-sm text-gray-400 dark:text-white/40">{user.email}</p>
            <span className="inline-block mt-1.5 text-xs px-2 py-0.5 bg-brand/10 text-brand rounded-full font-medium capitalize">
              {user.role}
            </span>
          </div>
        </div>
      </div>

      {/* Profile Info Form */}
      <div className="card-night p-6 mb-6 animate-fade-in">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Personal Information</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Email</label>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/10 text-gray-500 dark:text-white/60">
              <Mail className="w-4 h-4 text-gray-400 dark:text-white/40" />
              {user.email}
            </div>
            <p className="text-xs text-gray-400 dark:text-white/40 mt-1">Email cannot be changed</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-2">Gender</label>
            <div className="grid grid-cols-3 gap-3">
              {(['male', 'female', 'other'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(gender === g ? '' : g)}
                  className={`py-3 rounded-xl border-2 font-medium capitalize transition-all ${
                    gender === g
                      ? 'border-brand bg-brand/5 text-brand'
                      : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/60 hover:border-gray-300 dark:hover:border-white/25'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Phone</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/40" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+261 34 00 000 00"
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Address</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-3.5 w-4 h-4 text-gray-400 dark:text-white/40" />
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="City, Country"
                rows={2}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all text-gray-900 dark:text-white resize-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-2">Role</label>
            <div className="grid grid-cols-2 gap-3">
              {(['teacher', 'student'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRoleChange(r)}
                  disabled={user?.approvalStatus === 'pending'}
                  className={`py-3 rounded-xl border-2 font-medium capitalize transition-all ${
                    role === r
                      ? 'border-brand bg-brand/5 text-brand'
                      : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/60 hover:border-gray-300 dark:hover:border-white/25'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {r}
                </button>
              ))}
            </div>
            {user?.approvalStatus === 'pending' && (
              <p className="text-xs text-amber-600 mt-1.5">Role is locked while your teacher account is pending approval.</p>
            )}
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="btn-3d-cyan w-full disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Security Section */}
      <div className="card-night p-6 animate-fade-in">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-gray-400 dark:text-white/40" />
          Security
        </h3>

        {isEmailUser ? (
          <>
            {!showPasswordForm ? (
              <button
                onClick={() => setShowPasswordForm(true)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 font-medium hover:bg-gray-50 dark:hover:bg-white/10 transition-colors w-full"
              >
                <KeyRound className="w-4 h-4 text-gray-400 dark:text-white/40" />
                Change Password
              </button>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                {passwordError && (
                  <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm">
                    {passwordError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Current Password</label>
                  <div className="relative">
                    <input
                      ref={currentPwRef}
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }}
                      required
                      className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 transition-colors"
                    >
                      {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      ref={newPwRef}
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all text-gray-900 dark:text-white"
                      placeholder="Min 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 transition-colors"
                    >
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Confirm New Password</label>
                  <div className="relative">
                    <input
                      ref={confirmPwRef}
                      type={showConfirmPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 transition-colors"
                    >
                      {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowPasswordForm(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}
                    className="flex-1 py-3 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/70 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="flex-1 py-3 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
                  >
                    {changingPassword ? 'Changing...' : 'Update Password'}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/10 text-gray-500 dark:text-white/60 text-sm">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Signed in with Google. Password is managed by your Google account.
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10">
          <p className="text-xs text-gray-400 dark:text-white/40">
            Account created {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'recently'}
          </p>
        </div>
      </div>
    </div>
    </div>
  );
}
