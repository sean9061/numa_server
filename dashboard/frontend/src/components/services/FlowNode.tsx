import { useStore, wsSend } from '../../store/useStore';
import type { ContainerInfo, ContainerStats } from '../../types';
import { fmtBytes, fmtBps, barColor } from '../../utils';
import { SERVICE_LINKS } from '../../constants';

async function svcControl(name: string, action: string) {
  try {
    const r = await fetch(`/api/containers/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
    if (!r.ok) console.error(`[svcControl] ${action} ${name}:`, (await r.json().catch(() => ({}))).error);
  } catch (err) {
    console.error(`[svcControl] ${action} ${name}:`, err);
  }
}

interface Props {
  container?: ContainerInfo;
  stats?: ContainerStats;
  label: string;
  isPortfolio: boolean;
  portfolioRpm?: number | null;
  portfolioTotal?: number | null;
}

export function FlowNode({ container: c, stats, label, isPortfolio, portfolioRpm, portfolioTotal }: Props) {
  const selected    = useStore(s => s.selectedService);
  const setSelected = useStore(s => s.setSelectedService);
  const clearLogs   = useStore(s => s.clearLogs);

  const state     = c?.state ?? 'absent';
  const running   = state === 'running';
  const link      = c ? SERVICE_LINKS[c.name] : undefined;
  const logActive = c ? selected === c.name : false;

  const cpu = stats?.cpu ?? 0;
  const mem = stats?.mem_percent ?? 0;

  function toggleLogs() {
    if (!c) return;
    if (logActive) {
      wsSend({ type: 'unsubscribe_logs', container: c.name });
      setSelected(null);
    } else {
      if (selected) wsSend({ type: 'unsubscribe_logs', container: selected });
      setSelected(c.name);
      clearLogs();
      wsSend({ type: 'subscribe_logs', container: c.name });
    }
  }

  return (
    <div className={`fnode state-${state}`}>
      <div className="fnode-head">
        <span className="fnode-dot" />
        <span className="fnode-name" title={label}>{label}</span>
        <span className="fnode-badge">{state}</span>
      </div>

      <div className="fbar">
        <span className="fbar-l">CPU</span>
        <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, cpu)}%`, background: barColor(cpu) }} /></div>
        <span className="fbar-v">{stats?.cpu != null ? `${stats.cpu.toFixed(0)}%` : '—'}</span>
      </div>
      <div className="fbar">
        <span className="fbar-l">MEM</span>
        <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, mem)}%`, background: barColor(mem, 'var(--accent3)') }} /></div>
        <span className="fbar-v">{stats?.mem_used != null ? fmtBytes(stats.mem_used) : '—'}</span>
      </div>

      <div className="fnode-io">
        {isPortfolio ? (
          <><span className="io-k">web</span><b>{portfolioRpm ?? '—'}</b> req/min · {portfolioTotal ?? '—'} /1h</>
        ) : (
          <>
            <span className="io-k">disk</span>
            <span className="io-down">↓</span> {fmtBps(stats?.disk_r_sec)}
            <span className="io-up">↑</span> {fmtBps(stats?.disk_w_sec)}
          </>
        )}
      </div>

      <div className="fnode-actions">
        <button className="ibtn" title="Start"   disabled={!c || running}  onClick={() => c && svcControl(c.name, 'start')}>▶</button>
        <button className="ibtn" title="Stop"    disabled={!running}       onClick={() => c && svcControl(c.name, 'stop')}>■</button>
        <button className="ibtn" title="Restart" disabled={!running}       onClick={() => c && svcControl(c.name, 'restart')}>↻</button>
        <span style={{ flex: 1 }} />
        <button className={`tbtn${logActive ? ' active' : ''}`} disabled={!c} onClick={toggleLogs}>Logs</button>
        {link && <a className="tbtn link" href={link} target="_blank" rel="noopener">Open ↗</a>}
      </div>
    </div>
  );
}
