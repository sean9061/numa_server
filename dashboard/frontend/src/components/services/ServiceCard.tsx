import { useStore, wsSend } from '../../store/useStore';
import type { ContainerInfo, ContainerStats } from '../../types';
import { fmtBytes, fmtBps, barColor } from '../../utils';
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

function stateStyle(state: string): { bg: string; color: string } {
  switch (state) {
    case 'running': return { bg: 'rgba(34,197,94,0.12)',  color: 'var(--green)' };
    case 'exited':  return { bg: 'rgba(239,68,68,0.12)',  color: 'var(--red)'   };
    case 'paused':  return { bg: 'rgba(245,158,11,0.12)', color: 'var(--amber)' };
    default:        return { bg: 'rgba(102,102,102,0.12)', color: 'var(--dim)'  };
  }
}

function dotBg(state: string) {
  if (state === 'running') return 'var(--green)';
  if (state === 'exited')  return 'var(--red)';
  if (state === 'paused')  return 'var(--amber)';
  return 'var(--dim)';
}

async function svcControl(name: string, action: string) {
  try {
    const r = await fetch(`/api/containers/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
    if (!r.ok) console.error(`[svcControl] ${action} ${name}:`, (await r.json()).error);
  } catch (err) {
    console.error(`[svcControl] ${action} ${name}:`, err);
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  container: ContainerInfo;
  stats?: ContainerStats;
  portfolioRpm?: number | null;
  portfolioTotal?: number | null;
}

export function ServiceCard({ container: c, stats, portfolioRpm, portfolioTotal }: Props) {
  const selectedService    = useStore(s => s.selectedService);
  const setSelectedService = useStore(s => s.setSelectedService);
  const clearLogs          = useStore(s => s.clearLogs);

  const isRunning   = c.state === 'running';
  const isPortfolio = c.name === 'portfolio-container';
  const link        = SERVICE_LINKS[c.name];
  const logActive   = selectedService === c.name;
  const ss          = stateStyle(c.state);

  const cpuPct = stats?.cpu ?? 0;
  const memPct = stats?.mem_percent ?? 0;
  const cpuVal = stats?.cpu      != null ? `${stats.cpu.toFixed(1)}%` : '—';
  const memVal = stats?.mem_used != null ? fmtBytes(stats.mem_used)   : '—';
  const memTot = stats?.mem_total != null ? ` / ${fmtBytes(stats.mem_total)}` : '';
  const diskR  = stats?.disk_r_sec != null ? fmtBps(stats.disk_r_sec) : '—';
  const diskW  = stats?.disk_w_sec != null ? fmtBps(stats.disk_w_sec) : '—';

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

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Header ── */}
      <div style={{ padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {/* Running dot */}
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
            background: dotBg(c.state),
            boxShadow: isRunning ? `0 0 6px ${dotBg(c.state)}` : 'none',
          }} />
          {/* Name */}
          <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
            {c.name}
          </span>
          {/* State badge */}
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 5, flexShrink: 0,
            background: ss.bg, color: ss.color,
          }}>
            {c.state}
          </span>
        </div>
        {/* Meta */}
        <span style={{ fontSize: 10, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 17 }}>
          {c.image} · {c.status}
        </span>
      </div>

      {/* ── Separator ── */}
      <div style={{ height: 1, background: 'var(--border)', marginInline: 18 }} />

      {/* ── Metrics ── */}
      <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <MetricRow label="CPU"  pct={cpuPct}  color={barColor(cpuPct)}>
          <strong style={{ color: cpuPct >= 65 ? barColor(cpuPct) : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{cpuVal}</strong>
        </MetricRow>
        <MetricRow label="MEM"  pct={memPct}  color={barColor(memPct, 'var(--green)')}>
          <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{memVal}</span>
          <span style={{ color: 'var(--dim)' }}>{memTot}</span>
        </MetricRow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--dim)', width: 36, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Disk</span>
          <span style={{ fontSize: 11, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: 'var(--blue)' }}>↓</span>&nbsp;
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{diskR}</span>
            &emsp;
            <span style={{ color: 'var(--amber)' }}>↑</span>&nbsp;
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{diskW}</span>
          </span>
        </div>
      </div>

      {/* ── Portfolio web stats ── */}
      {isPortfolio && (
        <>
          <div style={{ height: 1, background: 'var(--border)', marginInline: 18 }} />
          <div style={{ padding: '12px 18px', display: 'flex', gap: 24, alignItems: 'baseline' }}>
            <WebNum value={portfolioRpm ?? '—'} label="req / min" />
            <WebNum value={portfolioTotal ?? '—'} label="total (1 hr)" />
          </div>
        </>
      )}

      {/* ── Actions ── */}
      <div style={{ height: 1, background: 'var(--border)', marginInline: 18 }} />
      <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconBtn title="Start"   disabled={isRunning}  onClick={() => svcControl(c.name, 'start')}><IcoStart /></IconBtn>
        <IconBtn title="Stop"    disabled={!isRunning} onClick={() => svcControl(c.name, 'stop')}><IcoStop /></IconBtn>
        <IconBtn title="Restart" disabled={!isRunning} onClick={() => svcControl(c.name, 'restart')}><IcoRestart /></IconBtn>
        <div style={{ flex: 1 }} />
        <TextBtn active={logActive} onClick={toggleLogs}><IcoLogs /> Logs</TextBtn>
        {link && (
          <a href={link} target="_blank" rel="noopener" style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            textDecoration: 'none',
            background: 'rgba(74,158,255,0.08)',
            border: '1px solid rgba(74,158,255,0.25)',
            color: 'var(--blue)',
          }}>
            ↗ Open
          </a>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricRow({ label, pct, color, children }: {
  label: string; pct: number; color: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--dim)', width: 36, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div className="svc2-bar-fill" style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: 11, flexShrink: 0, minWidth: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {children}
      </div>
    </div>
  );
}

function WebNum({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--green)', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: 'var(--dim)' }}>{label}</span>
    </div>
  );
}

function IconBtn({ children, disabled, onClick, title }: {
  children: React.ReactNode; disabled?: boolean; onClick: () => void; title?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 30, height: 28, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
        background: 'transparent',
        border: '1px solid var(--border)',
        color: 'var(--dim)',
        opacity: disabled ? 0.28 : 1,
      }}
    >
      {children}
    </button>
  );
}

function TextBtn({ children, active, onClick }: {
  children: React.ReactNode; active?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        cursor: 'pointer',
        background: active ? 'rgba(74,158,255,0.10)' : 'transparent',
        border: active ? '1px solid rgba(74,158,255,0.35)' : '1px solid var(--border)',
        color: active ? 'var(--blue)' : 'var(--dim)',
      }}
    >
      {children}
    </button>
  );
}
