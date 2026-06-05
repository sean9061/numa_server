import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { SettingsPanel } from './SettingsPanel';
import { fmtUptime } from '../utils';

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  location.href = '/login.html';
}

interface Props {
  onFitServer: () => void;
}

export function Header({ onFitServer }: Props) {
  const [clock, setClock]         = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const wsStatus                  = useStore(s => s.wsStatus);
  const metrics             = useStore(s => s.metrics);
  const timeWindow          = useStore(s => s.timeWindow);
  const extRangeMs          = useStore(s => s.extRangeMs);
  const extLoading          = useStore(s => s.extLoading);
  const activePanel         = useStore(s => s.activePanel);
  const setTimeWindow       = useStore(s => s.setTimeWindow);
  const setExtRange         = useStore(s => s.setExtRange);
  const setActivePanel      = useStore(s => s.setActivePanel);

  useEffect(() => {
    const tick = () => setClock(
      new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const wsDot    = wsStatus === 'connected';
  const wsLabel  = wsStatus === 'connected' ? 'Live' : wsStatus === 'reconnecting' ? 'Reconnecting...' : 'Connecting';
  const uptime   = fmtUptime(metrics?.uptime);

  const panelBtns = [
    {
      id: 'server', title: 'Server Monitor',
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>,
    },
    {
      id: 'services', title: 'Services',
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="9" height="9" rx="1"/><rect x="13" y="3" width="9" height="9" rx="1"/>
        <rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/>
      </svg>,
    },
  ] as const;

  const shortRanges = [
    { pts: 60,   label: '2m'  },
    { pts: 300,  label: '10m' },
    { pts: 900,  label: '30m' },
    { pts: 1800, label: '1h'  },
  ];
  const longRanges = [
    { ms: 6  * 3600 * 1000, label: '6h'  },
    { ms: 24 * 3600 * 1000, label: '24h' },
    { ms: 7  * 86400 * 1000, label: '7d' },
    { ms: 30 * 86400 * 1000, label: '30d' },
    { ms: -1,               label: 'All' },
  ];

  const hdrStyle: React.CSSProperties = {
    position: 'fixed', top: 6, left: 6, right: 6, height: 48, zIndex: 100,
    display: 'flex', alignItems: 'center',
    padding: '0 12px',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
    gap: 16,
  };

  const ptBtnStyle = (active: boolean): React.CSSProperties => ({
    width: 30, height: 26, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, cursor: 'pointer',
    background: active ? 'var(--surface2)' : 'transparent',
    border: active ? '1px solid var(--blue)' : '1px solid var(--border)',
    color: active ? 'var(--blue)' : 'var(--dim)',
  });

  const trBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 9px', borderRadius: 5, fontSize: 11, fontWeight: 500,
    cursor: 'pointer',
    background: active ? 'var(--blue)' : 'transparent',
    border: active ? '1px solid var(--blue)' : '1px solid var(--border)',
    color: active ? '#fff' : 'var(--dim)',
  });

  return (
  <>
    <div style={hdrStyle}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--blue)', flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
        </svg>
        <span className="header-brand-text">NUMA MONITOR</span>
      </div>
      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Panel toggle */}
      <div style={{ display: 'flex', gap: 3 }}>
        {panelBtns.map(btn => (
          <button key={btn.id} style={ptBtnStyle(activePanel === btn.id)} title={btn.title}
            onClick={() => setActivePanel(btn.id)}>
            {btn.icon}
          </button>
        ))}
      </div>

      {/* Host / Uptime / WS — hidden on narrow screens */}
      <div id="header-meta" style={{ display: 'contents' }}>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--dim)', fontSize: 11 }}>HOST</span>
          <span style={{ color: 'var(--text)', fontSize: 12, fontWeight: 500 }}>numa_01</span>
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--dim)', fontSize: 11 }}>UPTIME</span>
          <span style={{ color: 'var(--text)', fontSize: 12, fontWeight: 500 }}>{uptime}</span>
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: wsDot ? 'var(--green)' : 'var(--red)', transition: 'background 0.3s', display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>{wsLabel}</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Time range + fit (server panel only) */}
      {activePanel === 'server' && (
        <div id="server-controls" style={{ display: 'contents' }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {shortRanges.map(({ pts, label }) => (
              <button key={pts} style={trBtnStyle(extRangeMs == null && timeWindow === pts)}
                onClick={() => { setTimeWindow(pts); setExtRange(null); }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: 3 }}>
            {longRanges.map(({ ms, label }) => (
              <button key={ms} style={trBtnStyle(extRangeMs === ms)}
                onClick={() => setExtRange(ms)}>
                {extLoading && extRangeMs === ms ? '…' : label}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          <button onClick={onFitServer} title="全体表示"
            style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--dim)', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>
            ⊡
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        </div>
      )}

      {/* Clock */}
      <div id="clock" style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{clock}</div>
      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Settings */}
      <button onClick={() => setSettingsOpen(o => !o)} title="設定"
        style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: settingsOpen ? 'var(--surface2)' : 'transparent', color: settingsOpen ? 'var(--blue)' : 'var(--dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Logout */}
      <button onClick={logout} style={{ padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--dim)', fontSize: 12, cursor: 'pointer' }}>
        Logout
      </button>
    </div>
    <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  </>
  );
}
