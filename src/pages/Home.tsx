import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>LiveClass Game</h1>
      <p>Real-time gamified quiz platform</p>
      <div>
        <button onClick={() => navigate('/login')}>Teacher Login</button>
        <button onClick={() => navigate('/join')}>Join a Game</button>
      </div>
    </div>
  );
}
