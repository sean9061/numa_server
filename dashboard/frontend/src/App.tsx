import { useEffect, useRef } from 'react';
import { useStore, wsConnect } from './store/useStore';
import { Header }        from './components/Header';
import { ServerPanel }   from './components/panels/ServerPanel';
import { ServicesPanel } from './components/panels/ServicesPanel';

export default function App() {
  const activePanel    = useStore(s => s.activePanel);
  const fitServerRef   = useRef<(() => void) | null>(null);

  // Auth guard
  useEffect(() => {
    fetch('/auth/check')
      .then(r => r.json())
      .then(d => { if (!d.authenticated) location.href = '/login.html'; })
      .catch(() => { location.href = '/login.html'; });
  }, []);

  // WebSocket
  useEffect(() => {
    wsConnect();
  }, []);

  return (
    <>
      <Header onFitServer={() => fitServerRef.current?.()} />
      <div style={{ position: 'fixed', top: 60, left: 0, right: 0, bottom: 0 }}>
        <ServerPanel
          visible={activePanel === 'server'}
          fitRef={fitServerRef}
        />
        <ServicesPanel
          visible={activePanel === 'services'}
        />
      </div>
    </>
  );
}
