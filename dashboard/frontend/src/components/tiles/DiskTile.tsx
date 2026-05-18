import { useStore } from '../../store/useStore';
import { DiskDonut } from '../charts/DiskDonut';
import { DualLineChart } from '../charts/DualLineChart';
import { colorClass, fmtBytes, fmtBps } from '../../utils';
import { DISK_COLORS, DISK_COLORS_DIM, HIST_DISPLAY } from '../../constants';

export function DiskTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);

  const disks  = metrics?.disk ?? [];
  const diskIO = metrics?.disk_io;

  const totalUsed = disks.reduce((s, x) => s + (x.used || 0), 0);
  const totalSize = disks.reduce((s, x) => s + (x.size || 0), 0);
  const pct = totalSize > 0 ? Math.round((totalUsed / totalSize) * 100) : 0;

  const segments: Array<{ value: number; color: string }> = [];
  disks.forEach((disk, i) => {
    const free = Math.max(0, disk.size - disk.used);
    segments.push(
      { value: disk.used, color: DISK_COLORS[i % DISK_COLORS.length] },
      { value: free,      color: DISK_COLORS_DIM[i % DISK_COLORS_DIM.length] },
    );
  });

  const win = Math.min(timeWindow, HIST_DISPLAY);
  const slice = history.slice(-win);
  const pad = (arr: (number | null)[]) => {
    const a = arr.slice(-win);
    return [...Array(Math.max(0, win - a.length)).fill(0), ...a] as (number | null)[];
  };
  const rxData = pad(slice.map(e => e.disk_rx ?? 0));
  const wxData = pad(slice.map(e => e.disk_wx ?? 0));

  return (
    <div className="card">
      <div className="card-title">DISK</div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', marginTop: 4 }}>
        {segments.length > 0 && <DiskDonut segments={segments} />}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div className={colorClass(pct)} style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {disks.length ? `${pct}%` : '—'}
          </div>
          <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>USED</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 5, flexShrink: 0 }}>
        {disks.map((disk, i) => {
          const diskPct = disk.size > 0 ? Math.round((disk.used / disk.size) * 100) : 0;
          const pctColor = diskPct >= 90 ? 'var(--red)' : diskPct >= 75 ? 'var(--amber)' : 'var(--dim)';
          return (
            <div key={disk.mount} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: DISK_COLORS[i % DISK_COLORS.length], flexShrink: 0, display: 'inline-block' }} />
              <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{disk.mount}</span>
              <span style={{ color: 'var(--dim)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtBytes(disk.used)} / {fmtBytes(disk.size)}</span>
              <span style={{ fontSize: 9, fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 3, color: pctColor }}>{diskPct}%</span>
            </div>
          );
        })}
      </div>

      <div style={{ height: 36, position: 'relative', marginTop: 4, flexShrink: 0 }}>
        <DualLineChart data0={rxData} data1={wxData} color0="#3b82f6" color1="#f59e0b" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexShrink: 0, marginTop: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--dim)' }}>
          <span style={{ color: 'var(--blue)' }}>↓</span> R <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtBps(diskIO?.rx_sec)}</span>
        </span>
        <span style={{ fontSize: 10, color: 'var(--dim)' }}>
          <span style={{ color: 'var(--amber)' }}>↑</span> W <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtBps(diskIO?.wx_sec)}</span>
        </span>
      </div>
    </div>
  );
}
