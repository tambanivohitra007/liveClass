import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';

export default function JoinGame() {
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setJoining(true);

    try {
      const sessionsRef = collection(db, 'sessions');
      const q = query(sessionsRef, where('pinCode', '==', pin), where('status', '!=', 'ended'));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError('No active session found with that PIN.');
        setJoining(false);
        return;
      }

      const sessionDoc = snapshot.docs[0];
      const sessionData = sessionDoc.data();

      if (sessionData.joinLocked) {
        setError('This session is locked. No more players can join.');
        setJoining(false);
        return;
      }

      const joinFn = httpsCallable<
        { sessionId: string; nickname: string },
        { playerId: string }
      >(functions, 'joinSession');
      const result = await joinFn({ sessionId: sessionDoc.id, nickname });

      navigate(`/play/${sessionDoc.id}/${result.data.playerId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div>
      <h1>Join a Game</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleJoin}>
        <input
          type="text"
          placeholder="Game PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          maxLength={6}
        />
        <input
          type="text"
          placeholder="Your Nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          maxLength={20}
        />
        <button type="submit" disabled={joining}>
          {joining ? 'Joining...' : 'Join'}
        </button>
      </form>
    </div>
  );
}
