import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuthListener } from './hooks/useAuthListener';
import ProtectedRoute from './components/ProtectedRoute';
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

function App() {
  useAuthListener();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/play/:sessionId/:playerId" element={<PlayGame />} />
        <Route path="/assignment/:assignmentId" element={<PlayAssignment />} />

        {/* Protected teacher routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/quiz/:quizId" element={<ProtectedRoute><QuizEditor /></ProtectedRoute>} />
        <Route path="/quiz/:quizId/host" element={<ProtectedRoute><HostSession /></ProtectedRoute>} />
        <Route path="/session/:sessionId/results" element={<ProtectedRoute><SessionResults /></ProtectedRoute>} />
        <Route path="/assignment/new" element={<ProtectedRoute><AssignmentCreate /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
