import { useStore, wsSend } from '../../store/useStore';
import type { ContainerInfo, ContainerStats } from '../../types';
import { fmtBytes, fmtBps, barColor } from '../../utils';
import { SERVICE_LINKS } from '../../constants';

const SVG_START   = <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="currentColor"/></svg>;
const SVG_STOP    = <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/></svg>;
const SVG_RESTART = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
  </svg>
);
const SVG_LOGS = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/>
  </svg>
);

function dotClass(state: string) {
  return state === 'running' ? 'status-running' : state === 'exited' ? 'status-exited' : state === 'paused' ? 'status-paused' : 'status-other';
}
function badgeClass(state: string) {
  return state === 'running' ? 'running' : state === 'exited' ? 'exited' : state === 'paused' ? 'paused' : 'other';
}

async function svcControl(name: string, action: string) {
  try {
    const r = await fetch(`/api/containers/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
    if (!r.ok) console.error(`[svcControl] ${action} ${name}:`, (await r.json()).error);
  } catch (err) {
    console.error(`[svcControl] ${action} ${name}:`, err);
  }
}

interface Props {
  container: ContainerInfo;
  stats?: ContainerStats;
  portfolioRpm?: number | null;
  portfolioTotal?: number | null;
}

export function ServiceCard({ container: c, stats, portfolioRpm, portfolioTotal }: Props) {
  const selectedService = useStore(s => s.selectedService);
  const setSelectedService = useStore(s => s.setSelectedService);
  const clearLogs = useStore(s => s.clearLogs);

  const isRunning   = c.state === 'running';
  const isPortfolio = c.name === 'portfolio-container';
  const link        = SERVICE_LINKS[c.name];
  const logActive   = selectedService === c.name;

  const cpuPct = stats?.cpu ?? 0;
  const memPct = stats?.mem_percent ?? 0;
  const cpuVal = stats?.cpu      != null ? `${stats.cpu.toFixed(1)}%`  : '—';
  const memVal = stats?.mem_used != null ? fmtBytes(stats.mem_used)    : '—';
  const memTot = stats?.mem_total != null ? ` / ${fmtBytes(stats.mem_total)}` : '';
  const diskR  = stats?.disk_r_sec != null ? fmtBps(stats.disk_r_sec)  : '—';
  const diskW  = stats?.disk_w_sec != null ? fmtBps(stats.disk_w_sec)  : '—';

  function toggleLogs() {
    if (logActive) {
      wsSend({ type: 'unsubscribe_logs', container: c.name });
      setSelectedService(null);
    } else {
      if (selectedService) wsSend({ type: 'unsubscribe_logs', container: selectedService });
      setSelectedService(c.name);
      clearLogs();
      wsSend({ type: 'subscribe_logs', container: c.name });
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: `1px solid var(--border)`,
    borderRadius: 10,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  };

  const btnBase: React.CSSProperties = {
    width: 34, height: 30, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, cursor: 'pointer',
    background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={`status-dot ${dotClass(c.state)}`} style={{ width: 9, height: 9 }} />
        <span style={{ fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.name}
        </span>
        <span className={`svc-state-badge ${badgeClass(c.state)}`} style={{ fontSize: 10, padding: '3px 8px' }}>
          {c.state}
        </span>
      </div>

      {/* Meta */}
      <div style={{ fontSize: 11, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.image} · {c.status}
      </div>

      {/* Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <BarRow label="CPU"  pct={cpuPct}  val={cpuVal}            color={barColor(cpuPct)} />
        <BarRow label="MEM"  pct={memPct}  val={`${memVal}${memTot}`} color={barColor(memPct, 'var(--green)')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: 'var(--dim)', width: 34, flexShrink: 0 }}>DISK</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            ↓ <span style={{ color: 'var(--text)', fontWeight: 500 }}>{diskR}</span>
            &ensp;↑ <span style={{ color: 'var(--text)', fontWeight: 500 }}>{diskW}</span>
          </span>
        </div>
      </div>

      {/* Portfolio web stats */}
      {isPortfolio && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 14px' }}>
          <WebStat val={portfolioRpm ?? '—'} label="req/min" />
          <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
          <WebStat val={portfolioTotal ?? '—'} label="total (1hr)" />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={btnBase} title="Start"   disabled={isRunning}  onClick={() => svcControl(c.name, 'start')}>{SVG_START}</button>
        <button style={btnBase} title="Stop"    disabled={!isRunning} onClick={() => svcControl(c.name, 'stop')}>{SVG_STOP}</button>
        <button style={btnBase} title="Restart" disabled={!isRunning} onClick={() => svcControl(c.name, 'restart')}>{SVG_RESTART}</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={toggleLogs}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', background: logActive ? 'rgba(74,158,255,0.10)' : 'transparent',
            border: logActive ? '1px solid rgba(74,158,255,0.4)' : '1px solid var(--border)',
            color: logActive ? 'var(--blue)' : 'var(--dim)',
          }}
        >
          {SVG_LOGS} Logs
        </button>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
              textDecoration: 'none',
              background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.3)',
              color: 'var(--blue)',
            }}
          >
            ↗ Open
          </a>
        )}
      </div>
    </div>
  );
}

function BarRow({ label, pct, val, color }: { label: string; pct: number; val: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 10, color: 'var(--dim)', width: 34, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div className="svc2-bar-fill" style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--dim)', width: 110, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {val}
      </span>
    </div>
  );
}

function WebStat({ val, label }: { val: number | string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--green)' }}>{val}</span>
      <span style={{ fontSize: 9, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  );
}
