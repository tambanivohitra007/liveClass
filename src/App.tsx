import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthListener } from './hooks/useAuthListener';
import { useNotificationListener } from './hooks/useNotificationListener';
import { useThemeStore } from './stores/themeStore';
import { useAuthStore } from './stores/authStore';
import { ADMIN_EMAIL } from './lib/config';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Footer from './components/Footer';
import BottomTabBar from './components/BottomTabBar';
import { useSidebarStore } from './stores/sidebarStore';
import ProtectedRoute from './components/ProtectedRoute';
import ToastContainer from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ChooseRole from './pages/ChooseRole';
import PendingApproval from './pages/PendingApproval';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminQuizzes from './pages/admin/AdminQuizzes';
import AdminClasses from './pages/admin/AdminClasses';
import AdminOverview from './pages/admin/AdminOverview';
import AdminSessions from './pages/admin/AdminSessions';
import AdminAssignments from './pages/admin/AdminAssignments';
import Dashboard from './pages/teacher/Dashboard';
import QuizLibrary from './pages/teacher/QuizLibrary';
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
import RubricList from './pages/teacher/RubricList';
import RubricEditor from './pages/teacher/RubricEditor';
import RosterList from './pages/teacher/RosterList';
import RosterEditor from './pages/teacher/RosterEditor';
import GradingSessionCreate from './pages/teacher/GradingSessionCreate';
import GradingInterface from './pages/teacher/GradingInterface';
import GradingResults from './pages/teacher/GradingResults';
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
  const { collapsed } = useSidebarStore();
  const location = useLocation();

  // Redirect new Google users to role selection
  if (firebaseUser && needsRoleSelection && location.pathname !== '/choose-role') {
    return <Navigate to="/choose-role" replace />;
  }

  // Hide navbar on full-screen game pages
  const isQuizEditor = location.pathname.startsWith('/quiz/') && !location.pathname.endsWith('/host') && !location.pathname.endsWith('/preview') && !location.pathname.endsWith('/worksheet') && !location.pathname.endsWith('/flashcards');
  const isGradingInterface = /^\/grading\/[^/]+$/.test(location.pathname);
  const isRubricEditor = location.pathname.startsWith('/rubric/');
  const hideNavbar = location.pathname.startsWith('/play/') || isQuizEditor || isRubricEditor || isGradingInterface || (location.pathname.startsWith('/quiz/') && (location.pathname.endsWith('/host') || location.pathname.endsWith('/preview') || location.pathname.endsWith('/worksheet')));

  const showSidebar = !hideNavbar && !!firebaseUser;

  return (
    <div className="flex min-h-screen">
      {showSidebar && <Sidebar />}
      <div className={`flex flex-col flex-1 min-h-screen transition-[margin-left] duration-300 ${
        showSidebar ? (collapsed ? 'md:ml-[68px]' : 'md:ml-64') : ''
      }`}>
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

          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminDashboard />} />
            <Route path="quizzes" element={<AdminQuizzes />} />
            <Route path="classes" element={<AdminClasses />} />
            <Route path="sessions" element={<AdminSessions />} />
            <Route path="assignments" element={<AdminAssignments />} />
          </Route>

          <Route path="/dashboard" element={<TeacherRoute><Dashboard /></TeacherRoute>} />
          <Route path="/library" element={<TeacherRoute><QuizLibrary /></TeacherRoute>} />
          <Route path="/quiz/:quizId" element={<TeacherRoute><QuizEditor /></TeacherRoute>} />
          <Route path="/quiz/:quizId/host" element={<TeacherRoute><HostSession /></TeacherRoute>} />
          <Route path="/quiz/:quizId/preview" element={<TeacherRoute><QuizPreview /></TeacherRoute>} />
          <Route path="/quiz/:quizId/flashcards" element={<TeacherRoute><Flashcards /></TeacherRoute>} />
          <Route path="/quiz/:quizId/worksheet" element={<TeacherRoute><Worksheet /></TeacherRoute>} />
          <Route path="/session/:sessionId/results" element={<TeacherRoute><SessionResults /></TeacherRoute>} />
          <Route path="/history" element={<TeacherRoute><SessionHistory /></TeacherRoute>} />
          <Route path="/collection/:collectionId" element={<TeacherRoute><CollectionView /></TeacherRoute>} />
          <Route path="/assignment/new" element={<TeacherRoute><AssignmentCreate /></TeacherRoute>} />
          <Route path="/rubrics" element={<TeacherRoute><RubricList /></TeacherRoute>} />
          <Route path="/rubric/:rubricId" element={<TeacherRoute><RubricEditor /></TeacherRoute>} />
          <Route path="/rosters" element={<TeacherRoute><RosterList /></TeacherRoute>} />
          <Route path="/roster/:rosterId" element={<TeacherRoute><RosterEditor /></TeacherRoute>} />
          <Route path="/grading/new" element={<TeacherRoute><GradingSessionCreate /></TeacherRoute>} />
          <Route path="/grading/:gradingSessionId" element={<TeacherRoute><GradingInterface /></TeacherRoute>} />
          <Route path="/grading/:gradingSessionId/results" element={<TeacherRoute><GradingResults /></TeacherRoute>} />
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
    </div>
  );
}

function App() {
  useAuthListener();
  useNotificationListener();
  const { theme, setTheme } = useThemeStore();
  const { firebaseUser, loading } = useAuthStore();

  // Force dark mode when not logged in (and reset on logout)
  useEffect(() => {
    if (loading) return;
    if (!firebaseUser && theme !== 'dark') {
      setTheme('dark');
    }
  }, [loading, firebaseUser, theme, setTheme]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
