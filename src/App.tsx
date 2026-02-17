import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useAuthListener } from './hooks/useAuthListener';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import ToastContainer from './components/Toast';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/teacher/Dashboard';
import QuizEditor from './pages/teacher/QuizEditor';
import HostSession from './pages/teacher/HostSession';
import SessionResults from './pages/teacher/SessionResults';
import AssignmentCreate from './pages/teacher/AssignmentCreate';
import JoinGame from './pages/student/JoinGame';
import PlayGame from './pages/student/PlayGame';
import PlayAssignment from './pages/student/PlayAssignment';
import StudentDashboard from './pages/student/StudentDashboard';
import Profile from './pages/Profile';
import './App.css';

function AppContent() {
  const location = useLocation();
  // Hide navbar on full-screen game pages
  const hideNavbar = location.pathname.startsWith('/play/') || (location.pathname.startsWith('/quiz/') && location.pathname.endsWith('/host'));

  return (
    <>
      {!hideNavbar && <Navbar />}
      <ToastContainer />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/play/:sessionId/:playerId" element={<PlayGame />} />
        <Route path="/assignment/:assignmentId" element={<PlayAssignment />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/student/dashboard" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
        <Route path="/quiz/:quizId" element={<ProtectedRoute><QuizEditor /></ProtectedRoute>} />
        <Route path="/quiz/:quizId/host" element={<ProtectedRoute><HostSession /></ProtectedRoute>} />
        <Route path="/session/:sessionId/results" element={<ProtectedRoute><SessionResults /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/assignment/new" element={<ProtectedRoute><AssignmentCreate /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

function App() {
  useAuthListener();

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
