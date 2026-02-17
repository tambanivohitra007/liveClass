import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuthListener } from './hooks/useAuthListener';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/teacher/Dashboard';
import QuizEditor from './pages/teacher/QuizEditor';
import HostSession from './pages/teacher/HostSession';
import JoinGame from './pages/student/JoinGame';
import PlayGame from './pages/student/PlayGame';

function App() {
  useAuthListener();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/quiz/:quizId" element={<QuizEditor />} />
        <Route path="/quiz/:quizId/host" element={<HostSession />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/play/:sessionId/:playerId" element={<PlayGame />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
