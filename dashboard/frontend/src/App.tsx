import { useEffect } from 'react';
import { wsConnect } from './store/useStore';
import { Dashboard } from './components/Dashboard';

export default function App() {
  // Auth guard
  useEffect(() => {
    fetch('/auth/check')
      .then(r => r.json())
      .then(d => { if (!d.authenticated) location.href = '/login.html'; })
      .catch(() => { location.href = '/login.html'; });
  }, []);

  // WebSocket
  useEffect(() => { wsConnect(); }, []);

  return <Dashboard />;
}
