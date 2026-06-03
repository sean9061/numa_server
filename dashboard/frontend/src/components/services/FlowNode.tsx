import { useStore, wsSend } from '../../store/useStore';
import type { ContainerInfo, ContainerStats } from '../../types';
import { fmtBytes, barColor } from '../../utils';
import { SERVICE_LINKS } from '../../constants';

// ── Icons ────────────────────────────────────────────────────────────────────

const IcoStart = () => (
  <svg width="9" height="9" viewBox="0 0 9 9"><polygon points="1,0 9,4.5 1,9" fill="currentColor"/></svg>
);
const IcoStop = () => (
  <svg width="9" height="9" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" rx="1.5" fill="currentColor"/></svg>
);
const IcoRestart = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
  </svg>
);
const IcoLogs = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/>
  </svg>
);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function svcControl(name: string, action: string) {
  try {
    const r = await fetch(`/api/containers/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
    if (!r.ok) console.error(`[svcControl] ${action} ${name}:`, (await r.json()).error);
  } catch (err) {
    console.error(`[svcControl] ${action} ${name}:`, err);
  }
}

function dotColor(state: string) {
  if (state === 'running') return 'var(--green)';
  if (state === 'exited')  return 'var(--red)';
  if (state === 'paused')  return 'var(--amber)';
  return 'var(--dim)';
}

function stateBadgeStyle(state: string): { bg: string; color: string } {
  switch (state) {
    case 'running': return { bg: 'rgba(34,197,94,0.12)',   color: 'var(--green)' };
    case 'exited':  return { bg: 'rgba(239,68,68,0.12)',   color: 'var(--red)'   };
    case 'paused':  return { bg: 'rgba(245,158,11,0.12)', color: 'var(--amber)' };
    default:        return { bg: 'rgba(102,102,102,0.12)', color: 'var(--dim)'   };
  }
}

// ── FlowNode ─────────────────────────────────────────────────────────────────

interface Props {
  container?: ContainerInfo;
  stats?: ContainerStats;
  label: string;
  portfolioRpm?: number | null;
}

export function FlowNode({ container, stats, label, portfolioRpm }: Props) {
  const selectedService    = useStore(s => s.selectedService);
  const setSelectedService = useStore(s => s.setSelectedService);
  const clearLogs          = useStore(s => s.clearLogs);

  const c          = container;
  const state      = c?.state ?? 'unknown';
  const isRunning  = state === 'running';
  const name       = c?.name ?? label;
  const isPortfolio = name === 'portfolio-container';
  const link       = c ? SERVICE_LINKS[c.name] : undefined;
  const logActive  = selectedService === name;
  const ss         = stateBadgeStyle(state);

  const cpuPct = stats?.cpu ?? 0;
  const memPct = stats?.mem_percent ?? 0;
  const cpuVal = stats?.cpu      != null ? `${stats.cpu.toFixed(1)}%` : '—';
  const memVal = stats?.mem_used != null ? fmtBytes(stats.mem_used)   : '—';

  function toggleLogs() {
    if (!c) return;
    if (logActive) {
      wsSend({ type: 'unsubscribe_logs', container: name });
      setSelectedService(null);
    } else {
      if (selectedService) wsSend({ type: 'unsubscribe_logs', container: selectedService });
      setSelectedService(name);
      clearLogs();
      wsSend({ type: 'subscribe_logs', container: name });
    }
  }

  // Ghost node — container not tracked by backend yet
  if (!c) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'var(--surface)',
        border: '1px dashed var(--border)',
        borderRadius: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 4,
        opacity: 0.45,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim)' }}>{label}</span>
        <span style={{ fontSize: 9, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>offline</span>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface)',
      border: `1px solid ${logActive ? 'rgba(74,158,255,0.40)' : 'var(--border)'}`,
      borderRadius: 10,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div style={{ padding: '9px 11px 7px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: dotColor(state),
          boxShadow: isRunning ? `0 0 5px ${dotColor(state)}` : 'none',
        }} />
        <span style={{
          fontSize: 12, fontWeight: 700, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text)',
        }}>
          {name}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 4, flexShrink: 0,
          background: ss.bg, color: ss.color,
        }}>
          {state}
        </span>
      </div>

      <div style={{ height: 1, background: 'var(--border)', marginInline: 11 }} />

      {/* Metrics */}
      <div style={{ padding: '8px 11px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        <MiniBar label="CPU" pct={cpuPct} color={barColor(cpuPct)}              value={cpuVal} />
        <MiniBar label="MEM" pct={memPct} color={barColor(memPct, 'var(--green)')} value={memVal} />
        {isPortfolio && portfolioRpm != null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 1 }}>
            <span style={{ fontSize: 9, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 28 }}>WEB</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{portfolioRpm}</span>
            <span style={{ fontSize: 9, color: 'var(--dim)' }}>req/min</span>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border)', marginInline: 11 }} />

      {/* Actions */}
      <div style={{ padding: '6px 11px', display: 'flex', alignItems: 'center', gap: 4 }}>
        <IBtn title="Start"   disabled={isRunning}  onClick={() => svcControl(name, 'start')}><IcoStart /></IBtn>
        <IBtn title="Stop"    disabled={!isRunning} onClick={() => svcControl(name, 'stop')}><IcoStop /></IBtn>
        <IBtn title="Restart" disabled={!isRunning} onClick={() => svcControl(name, 'restart')}><IcoRestart /></IBtn>
        <div style={{ flex: 1 }} />
        <TBtn active={logActive} onClick={toggleLogs}><IcoLogs /></TBtn>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
            textDecoration: 'none',
            background: 'rgba(74,158,255,0.08)',
            border: '1px solid rgba(74,158,255,0.25)',
            color: 'var(--blue)',
          }}>↗</a>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MiniBar({ label, pct, color, value }: { label: string; pct: number; color: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, color: 'var(--dim)', width: 28, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function IBtn({ children, disabled, onClick, title }: {
  children: React.ReactNode; disabled?: boolean; onClick: () => void; title?: string;
}) {
  return (
    <button title={title} disabled={disabled} onClick={onClick} style={{
      width: 26, height: 24, padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 5, cursor: disabled ? 'default' : 'pointer',
      background: 'transparent',
      border: '1px solid var(--border)',
      color: 'var(--dim)',
      opacity: disabled ? 0.28 : 1,
    }}>
      {children}
    </button>
  );
}

function TBtn({ children, active, onClick }: {
  children: React.ReactNode; active?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
      cursor: 'pointer',
      background: active ? 'rgba(74,158,255,0.10)' : 'transparent',
      border: active ? '1px solid rgba(74,158,255,0.35)' : '1px solid var(--border)',
      color: active ? 'var(--blue)' : 'var(--dim)',
    }}>
      {children}
    </button>
  );
}
