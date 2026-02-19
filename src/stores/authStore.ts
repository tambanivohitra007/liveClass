import { create } from 'zustand';
import type { User as FirebaseUser } from 'firebase/auth';
import type { User } from '../types/models';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  needsRoleSelection: boolean;
  setFirebaseUser: (user: FirebaseUser | null) => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setNeedsRoleSelection: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  user: null,
  loading: true,
  needsRoleSelection: false,
  setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
  setUser: (user) => set({ user, ...(user ? { needsRoleSelection: false } : {}) }),
  setLoading: (loading) => set({ loading }),
  setNeedsRoleSelection: (needsRoleSelection) => set({ needsRoleSelection }),
}));
