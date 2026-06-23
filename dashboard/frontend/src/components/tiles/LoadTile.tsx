import { useStore } from '../../store/useStore';
import { C } from '../../constants';
import { Card, Bar } from '../ui';
import { clamp, meterColor } from '../../utils';

export function LoadTile() {
  const load = useStore(s => s.metrics?.load);
  const nproc = useStore(s => s.metrics?.cpu?.cores?.length ?? 0);
  const procs = useStore(s => s.metrics?.proc_count);

  const cells: { v?: number; l: string }[] = [
    { v: load?.m1, l: '1 MIN' },
    { v: load?.m5, l: '5 MIN' },
    { v: load?.m15, l: '15 MIN' },
  ];
  const loadPct = nproc > 0 && load?.m1 != null ? clamp((load.m1 / nproc) * 100, 0, 100) : 0;

  return (
    <Card title="LOAD" area="load" dot={C.accent2}>
      <div className="load-grid">
        {cells.map(c => (
          <div className="load-cell" key={c.l}>
            <div className="lv" style={{ color: c.v != null ? meterColor(nproc ? (c.v / nproc) * 100 : 0) : 'var(--muted)' }}>
              {c.v != null ? c.v.toFixed(2) : '—'}
            </div>
            <div className="ll">{c.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--dim)', fontWeight: 600 }}>
          <span>1m load / {nproc} cores</span>
          <span>{Math.round(loadPct)}%</span>
        </div>
        <Bar pct={loadPct} color={meterColor(loadPct)} />
      </div>

      <div className="stat-row" style={{ marginTop: 'auto' }}>
        <div className="stat">
          <span className="stat-label">CPU Threads</span>
          <span className="stat-value">{nproc || '—'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Processes</span>
          <span className="stat-value">{procs ?? '—'}</span>
        </div>
      </div>
    </Card>
  );
}
