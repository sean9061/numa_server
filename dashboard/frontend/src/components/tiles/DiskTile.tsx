import { useStore } from '../../store/useStore';
import { DiskDonut } from '../charts/DiskDonut';
import { DualLineChart } from '../charts/DualLineChart';
import { CardLabel } from './TileCard';
import { statusColor, fmtBps, barColor, padHistory } from '../../utils';
import { DISK_COLORS, DISK_COLORS_DIM, HIST_DISPLAY } from '../../constants';

export function DiskTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);

  const disks  = metrics?.disk ?? [];
  const diskIO = metrics?.disk_io;

  const totalUsed = disks.reduce((s, x) => s + (x.used || 0), 0);
  const totalSize = disks.reduce((s, x) => s + (x.size || 0), 0);
  const totalPct  = totalSize > 0 ? Math.round((totalUsed / totalSize) * 100) : 0;

  const segments = disks.flatMap((disk, i) => [
    { value: disk.used,                      color: DISK_COLORS[i % DISK_COLORS.length] },
    { value: Math.max(0, disk.size - disk.used), color: DISK_COLORS_DIM[i % DISK_COLORS_DIM.length] },
  ]);

  const win    = Math.min(timeWindow, HIST_DISPLAY);
  const slice  = history.slice(-win);
  const rxData = padHistory(slice.map(e => e.disk_rx ?? 0), win);
  const wxData = padHistory(slice.map(e => e.disk_wx ?? 0), win);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      padding: '14px 14px 0',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <CardLabel>Disk</CardLabel>

      {/* Donut + center text */}
      <div style={{ position: 'relative', height: 96, flexShrink: 0, marginTop: 8 }}>
        {segments.length > 0
          ? <DiskDonut segments={segments} />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 11 }}>No data</div>
        }
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: statusColor(totalPct) }}>
            {disks.length ? `${totalPct}%` : '—'}
          </div>
          <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2, textTransform: 'uppercase' }}>Used</div>
        </div>
      </div>

      {/* Mount list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, marginTop: 8 }}>
        {disks.map((disk, i) => {
          const pct = disk.size > 0 ? Math.round((disk.used / disk.size) * 100) : 0;
          return (
            <div key={disk.mount} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: DISK_COLORS[i % DISK_COLORS.length], flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: 'var(--dim)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {disk.mount}
              </span>
              <div style={{ width: 52, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct, DISK_COLORS[i % DISK_COLORS.length]), borderRadius: 2, transition: 'width 0.4s ease' }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--dim)', width: 26, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
            </div>
          );
        })}
      </div>

      {/* I/O values */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '6px 0 6px', flexShrink: 0 }}>
        <IoStat arrow="↓" label="R" value={fmtBps(diskIO?.rx_sec)} color="var(--blue)" />
        <IoStat arrow="↑" label="W" value={fmtBps(diskIO?.wx_sec)} color="var(--amber)" />
      </div>

      {/* I/O strip */}
      <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />
      <div style={{ height: 36, flexShrink: 0 }}>
        <DualLineChart data0={rxData} data1={wxData} color0="var(--blue)" color1="var(--amber)" strip />
      </div>
    </div>
  );
}

function IoStat({ arrow, label, value, color }: { arrow: string; label: string; value: string; color: string }) {
  return (
    <span style={{ fontSize: 11, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color }}>{arrow}</span> {label}&nbsp;
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{value}</span>
    </span>
  );
}
