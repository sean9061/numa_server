import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { fmtUptime } from '../utils';
import { RangeBar } from './RangeBar';

const WS_LABEL: Record<string, string> = {
  connected: 'LIVE',
  reconnecting: 'RECONNECTING',
  connecting: 'CONNECTING',
};

const IconServer = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const IconServices = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="9" height="9" rx="1" /><rect x="13" y="3" width="9" height="9" rx="1" />
    <rect x="2" y="13" width="9" height="9" rx="1" /><rect x="13" y="13" width="9" height="9" rx="1" />
  </svg>
);

export function Header() {
  const ws          = useStore(s => s.wsStatus);
  const uptime      = useStore(s => s.metrics?.uptime);
  const procs       = useStore(s => s.metrics?.proc_count);
  const activePanel = useStore(s => s.activePanel);
  const setPanel    = useStore(s => s.setActivePanel);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark"><span>N</span></div>
        <div>
          <div className="brand-name">Numa Monitor</div>
          <div className="brand-sub">Server Telemetry</div>
        </div>
      </div>

      <div className="header-controls">
        <div className="panel-toggle">
          <button
            className={`panel-btn${activePanel === 'server' ? ' active' : ''}`}
            onClick={() => setPanel('server')} title="Server" aria-label="Server"
          ><IconServer /></button>
          <button
            className={`panel-btn${activePanel === 'services' ? ' active' : ''}`}
            onClick={() => setPanel('services')} title="Services" aria-label="Services"
          ><IconServices /></button>
        </div>
        {activePanel === 'server' && <RangeBar />}
      </div>

      <div className="header-meta">
        <div className="meta-item">
          <span className="meta-label">Processes</span>
          <span className="meta-value">{procs ?? '—'}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Uptime</span>
          <span className="meta-value">{fmtUptime(uptime)}</span>
        </div>
        <div className="clock">{now.toLocaleTimeString('ja-JP', { hour12: false })}</div>
        <div className={`ws-pill ${ws}`}>
          <span className="ws-dot" />
          {WS_LABEL[ws] ?? 'OFFLINE'}
        </div>
      </div>
    </header>
  );
}
