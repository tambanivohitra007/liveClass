import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading } = useAuthStore();

  if (loading) return <p>Loading...</p>;
  if (!firebaseUser) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
