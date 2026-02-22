import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthListener } from './hooks/useAuthListener';
import { useNotificationListener } from './hooks/useNotificationListener';
import { useThemeStore } from './stores/themeStore';
import { useAuthStore } from './stores/authStore';
import { ADMIN_EMAIL } from './lib/config';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import BottomTabBar from './components/BottomTabBar';
import ProtectedRoute from './components/ProtectedRoute';
import ToastContainer from './components/Toast';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ChooseRole from './pages/ChooseRole';
import PendingApproval from './pages/PendingApproval';
import AdminDashboard from './pages/admin/AdminDashboard';
import Dashboard from './pages/teacher/Dashboard';
import QuizEditor from './pages/teacher/QuizEditor';
import HostSession from './pages/teacher/HostSession';
import SessionResults from './pages/teacher/SessionResults';
import SessionHistory from './pages/teacher/SessionHistory';
import AssignmentCreate from './pages/teacher/AssignmentCreate';
import JoinGame from './pages/student/JoinGame';
import PlayGame from './pages/student/PlayGame';
import PlayAssignment from './pages/student/PlayAssignment';
import StudentDashboard from './pages/student/StudentDashboard';
import Profile from './pages/Profile';
import QuizPreview from './pages/teacher/QuizPreview';
import CollectionView from './pages/teacher/CollectionView';
import ClassList from './pages/teacher/ClassList';
import ClassDetail from './pages/teacher/ClassDetail';
import JoinClass from './pages/student/JoinClass';
import StudentClasses from './pages/student/StudentClasses';
import StudentClassDetail from './pages/student/StudentClassDetail';
import Discover from './pages/Discover';
import Flashcards from './pages/Flashcards';
import Worksheet from './pages/teacher/Worksheet';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsAndConditions from './pages/TermsAndConditions';
import './App.css';

function TeacherRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (user?.role === 'student') return <Navigate to="/student/dashboard" replace />;
  if (user?.role === 'teacher' && user.approvalStatus !== 'approved' && user.email !== ADMIN_EMAIL) {
    return <Navigate to="/pending-approval" replace />;
  }

  return <>{children}</>;
}

function StudentRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!user) return <Navigate to="/choose-role" replace />;
  if (user.role === 'teacher' && (user.approvalStatus === 'approved' || user.email === ADMIN_EMAIL)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (user?.email !== ADMIN_EMAIL) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function AppContent() {
  const { firebaseUser, needsRoleSelection } = useAuthStore();
  const location = useLocation();

  // Redirect new Google users to role selection
  if (firebaseUser && needsRoleSelection && location.pathname !== '/choose-role') {
    return <Navigate to="/choose-role" replace />;
  }

  // Hide navbar on full-screen game pages
  const isQuizEditor = location.pathname.startsWith('/quiz/') && !location.pathname.endsWith('/host') && !location.pathname.endsWith('/preview') && !location.pathname.endsWith('/worksheet') && !location.pathname.endsWith('/flashcards');
  const hideNavbar = location.pathname.startsWith('/play/') || isQuizEditor || (location.pathname.startsWith('/quiz/') && (location.pathname.endsWith('/host') || location.pathname.endsWith('/preview') || location.pathname.endsWith('/worksheet')));

  return (
    <div className="flex flex-col min-h-screen">
      {!hideNavbar && <Navbar />}
      <ToastContainer />
      <main className={`flex-1 pattern-dots ${!hideNavbar && firebaseUser ? 'pb-20 md:pb-0' : ''}`}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/play/:sessionId/:playerId" element={<PlayGame />} />
        <Route path="/assignment/:assignmentId" element={<PlayAssignment />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/choose-role" element={<ChooseRole />} />
        <Route path="/pending-approval" element={<PendingApproval />} />

        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

        <Route path="/dashboard" element={<TeacherRoute><Dashboard /></TeacherRoute>} />
        <Route path="/quiz/:quizId" element={<TeacherRoute><QuizEditor /></TeacherRoute>} />
        <Route path="/quiz/:quizId/host" element={<TeacherRoute><HostSession /></TeacherRoute>} />
        <Route path="/quiz/:quizId/preview" element={<TeacherRoute><QuizPreview /></TeacherRoute>} />
        <Route path="/quiz/:quizId/flashcards" element={<TeacherRoute><Flashcards /></TeacherRoute>} />
        <Route path="/quiz/:quizId/worksheet" element={<TeacherRoute><Worksheet /></TeacherRoute>} />
        <Route path="/session/:sessionId/results" element={<TeacherRoute><SessionResults /></TeacherRoute>} />
        <Route path="/history" element={<TeacherRoute><SessionHistory /></TeacherRoute>} />
        <Route path="/collection/:collectionId" element={<TeacherRoute><CollectionView /></TeacherRoute>} />
        <Route path="/assignment/new" element={<TeacherRoute><AssignmentCreate /></TeacherRoute>} />
        <Route path="/classes" element={<TeacherRoute><ClassList /></TeacherRoute>} />
        <Route path="/classroom/:classroomId" element={<TeacherRoute><ClassDetail /></TeacherRoute>} />

        <Route path="/join-class" element={<ProtectedRoute><JoinClass /></ProtectedRoute>} />
        <Route path="/student/dashboard" element={<StudentRoute><StudentDashboard /></StudentRoute>} />
        <Route path="/student/classes" element={<StudentRoute><StudentClasses /></StudentRoute>} />
        <Route path="/student/classroom/:classroomId" element={<StudentRoute><StudentClassDetail /></StudentRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      </Routes>
      </main>
      {!hideNavbar && (
        <div className={firebaseUser ? 'hidden md:block' : undefined}>
          <Footer />
        </div>
      )}
      {!hideNavbar && <BottomTabBar />}
    </div>
  );
}

function App() {
  useAuthListener();
  useNotificationListener();
  const { theme } = useThemeStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
