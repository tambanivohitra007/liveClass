import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthListener } from './hooks/useAuthListener';
import { useNotificationListener } from './hooks/useNotificationListener';
import { useThemeStore } from './stores/themeStore';
import { useAuthStore } from './stores/authStore';
import { ADMIN_EMAIL } from './lib/config';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Footer from './components/Footer';
import BottomTabBar from './components/BottomTabBar';
import { useSidebarStore } from './stores/sidebarStore';
import ProtectedRoute from './components/ProtectedRoute';
import ToastContainer from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import KnowledgeBaseFab from './components/KnowledgeBaseFab';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ChooseRole from './pages/ChooseRole';
import PendingApproval from './pages/PendingApproval';
import JoinGame from './pages/student/JoinGame';
import { useDeepLinks } from './hooks/useDeepLinks';
import { usePushNotifications } from './hooks/usePushNotifications';
import './App.css';

// Lazy-loaded pages — only loaded when the route is visited
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminQuizzes = lazy(() => import('./pages/admin/AdminQuizzes'));
const AdminClasses = lazy(() => import('./pages/admin/AdminClasses'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminSessions = lazy(() => import('./pages/admin/AdminSessions'));
const AdminAssignments = lazy(() => import('./pages/admin/AdminAssignments'));
const Dashboard = lazy(() => import('./pages/teacher/Dashboard'));
const QuizLibrary = lazy(() => import('./pages/teacher/QuizLibrary'));
const QuizEditor = lazy(() => import('./pages/teacher/QuizEditor'));
const HostSession = lazy(() => import('./pages/teacher/HostSession'));
const SessionResults = lazy(() => import('./pages/teacher/SessionResults'));
const SessionHistory = lazy(() => import('./pages/teacher/SessionHistory'));
const AssignmentCreate = lazy(() => import('./pages/teacher/AssignmentCreate'));
const PlayGame = lazy(() => import('./pages/student/PlayGame'));
const PlayAssignment = lazy(() => import('./pages/student/PlayAssignment'));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const Profile = lazy(() => import('./pages/Profile'));
const QuizPreview = lazy(() => import('./pages/teacher/QuizPreview'));
const CollectionView = lazy(() => import('./pages/teacher/CollectionView'));
const ClassList = lazy(() => import('./pages/teacher/ClassList'));
const ClassDetail = lazy(() => import('./pages/teacher/ClassDetail'));
const JoinClass = lazy(() => import('./pages/student/JoinClass'));
const StudentClasses = lazy(() => import('./pages/student/StudentClasses'));
const StudentClassDetail = lazy(() => import('./pages/student/StudentClassDetail'));
const Discover = lazy(() => import('./pages/Discover'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const Worksheet = lazy(() => import('./pages/teacher/Worksheet'));
const RubricList = lazy(() => import('./pages/teacher/RubricList'));
const RubricEditor = lazy(() => import('./pages/teacher/RubricEditor'));
const RosterList = lazy(() => import('./pages/teacher/RosterList'));
const RosterEditor = lazy(() => import('./pages/teacher/RosterEditor'));
const GradingSessionCreate = lazy(() => import('./pages/teacher/GradingSessionCreate'));
const GradingInterface = lazy(() => import('./pages/teacher/GradingInterface'));
const GradingResults = lazy(() => import('./pages/teacher/GradingResults'));
const HostLiveGrading = lazy(() => import('./pages/teacher/HostLiveGrading'));
const LiveGradingResults = lazy(() => import('./pages/teacher/LiveGradingResults'));
const LiveGradingPlay = lazy(() => import('./pages/student/LiveGradingPlay'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'));

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
  useDeepLinks();

  // Redirect new Google users to role selection
  if (firebaseUser && needsRoleSelection && location.pathname !== '/choose-role') {
    return <Navigate to="/choose-role" replace />;
  }

  // Hide navbar on full-screen game pages
  const isQuizEditor = location.pathname.startsWith('/quiz/') && !location.pathname.endsWith('/host') && !location.pathname.endsWith('/preview') && !location.pathname.endsWith('/worksheet') && !location.pathname.endsWith('/flashcards');
  const isGradingInterface = /^\/grading\/[^/]+$/.test(location.pathname);
  const isRubricEditor = location.pathname.startsWith('/rubric/');
  const hideNavbar = location.pathname.startsWith('/play/') || (location.pathname.startsWith('/live-grading/') && !location.pathname.endsWith('/results')) || isQuizEditor || isRubricEditor || isGradingInterface || (location.pathname.startsWith('/quiz/') && (location.pathname.endsWith('/host') || location.pathname.endsWith('/preview') || location.pathname.endsWith('/worksheet')));

  const showSidebar = !hideNavbar && !!firebaseUser;

  return (
    <div className="flex min-h-dvh px-safe">
      {showSidebar && <Sidebar />}
      <div className={`flex flex-col flex-1 min-w-0 min-h-dvh overflow-x-hidden transition-[margin-left] duration-300 ${
        showSidebar ? (collapsed ? 'md:ml-[68px]' : 'md:ml-64') : ''
      }`}>
        {!hideNavbar && <Navbar />}
        {showSidebar && <TopBar />}
        <ToastContainer />
        <main className={`flex-1 pattern-dots ${!hideNavbar && firebaseUser ? 'pb-20 md:pb-0' : ''}`}>
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
          </div>
        }>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/join" element={<JoinGame />} />
          <Route path="/play/:sessionId/:playerId" element={<PlayGame />} />
          <Route path="/live-grading/:liveGradingId/:playerId" element={<LiveGradingPlay />} />
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
          <Route path="/rubric/:rubricId/host" element={<TeacherRoute><HostLiveGrading /></TeacherRoute>} />
          <Route path="/live-grading/:liveGradingId/results" element={<TeacherRoute><LiveGradingResults /></TeacherRoute>} />
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
        </Suspense>
        </main>
        {!hideNavbar && (
          <div className={firebaseUser ? 'hidden md:block' : undefined}>
            <Footer />
          </div>
        )}
        {!hideNavbar && <BottomTabBar />}
        {!hideNavbar && firebaseUser && <KnowledgeBaseFab />}
      </div>
    </div>
  );
}

function App() {
  useAuthListener();
  useNotificationListener();
  usePushNotifications();
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
