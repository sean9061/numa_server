import { useStore } from '../../store/useStore';
import { DiskDonut } from '../charts/DiskDonut';
import { DualLineChart } from '../charts/DualLineChart';
import { CardLabel } from './TileCard';
import { statusColor, fmtBps, downsample } from '../../utils';
import { HIST_DISPLAY } from '../../constants';

// Breakdown dir colors: Docker, /home, /opt, /root, Other
const BREAK_COLORS  = ['#3b82f6', '#22c55e', '#818cf8', '#f59e0b', '#52525b'];
const MOUNT_COLORS  = ['#e879f9', '#34d399', '#fb923c'];

function fmtGB(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function DiskTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);

  const disks     = metrics?.disk     ?? [];
  const diskIO    = metrics?.disk_io;
  const breakdown = metrics?.disk_breakdown ?? null;

  const slice  = history.slice(-timeWindow);
  const rxData = downsample(slice.map(e => e.disk_rx ?? 0), HIST_DISPLAY);
  const wxData = downsample(slice.map(e => e.disk_wx ?? 0), HIST_DISPLAY);

  const totalUsed = disks.reduce((s, x) => s + (x.used || 0), 0);
  const totalSize = disks.reduce((s, x) => s + (x.size || 0), 0);
  const totalPct  = totalSize > 0 ? Math.round((totalUsed / totalSize) * 100) : 0;

  // Build labeled segments
  type Seg = { label: string; bytes: number; color: string };
  const segs: Seg[] = [];

  const rootDisk   = disks.find(d => d.mount === '/') ?? disks[0];
  const otherDisks = disks.filter(d => d !== rootDisk);

  if (breakdown && breakdown.length > 0 && rootDisk) {
    breakdown.forEach((b, i) => {
      segs.push({ label: b.label, bytes: b.bytes, color: BREAK_COLORS[i % BREAK_COLORS.length] });
    });
    const known = breakdown.reduce((s, b) => s + b.bytes, 0);
    const other = Math.max(0, rootDisk.used - known);
    if (other > 50 * 1024 * 1024) {
      segs.push({ label: 'Other', bytes: other, color: BREAK_COLORS[4] });
    }
    otherDisks.forEach((d, i) => {
      segs.push({ label: d.mount, bytes: d.used, color: MOUNT_COLORS[i % MOUNT_COLORS.length] });
    });
  } else {
    // Breakdown not yet loaded — show per-mount until it arrives
    disks.forEach((d, i) => {
      segs.push({ label: d.mount, bytes: d.used, color: BREAK_COLORS[i % BREAK_COLORS.length] });
    });
  }

  const totalFree = Math.max(0, totalSize - totalUsed);
  const donutSegs = [
    ...segs.map(s => ({ value: s.bytes, color: s.color })),
    ...(totalFree > 0 ? [{ value: totalFree, color: 'rgba(255,255,255,0.05)' }] : []),
  ];

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
      <CardLabel>Disk</CardLabel>

      {/* Donut + center % */}
      <div style={{ position: 'relative', height: 88, flexShrink: 0, marginTop: 8 }}>
        {donutSegs.length > 0
          ? <DiskDonut segments={donutSegs} />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 11 }}>No data</div>
        }
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: statusColor(totalPct) }}>
            {disks.length ? `${totalPct}%` : '—'}
          </div>
          <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2, textTransform: 'uppercase' }}>Used</div>
        </div>
      </div>

      {/* Breakdown legend */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, marginTop: 6 }}>
        {segs.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: 'var(--dim)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.label}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 500, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {fmtGB(s.bytes)}
            </span>
          </div>
        ))}
      </div>

      {/* I/O values */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '5px 0 4px', flexShrink: 0 }}>
        <IoStat arrow="↓" label="R" value={fmtBps(diskIO?.rx_sec)} color="var(--blue)" />
        <IoStat arrow="↑" label="W" value={fmtBps(diskIO?.wx_sec)} color="var(--amber)" />
      </div>

      {/* I/O strip */}
      <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />
      <div style={{ height: 36, flexShrink: 0 }}>
        <DualLineChart data0={rxData} data1={wxData} color0="var(--blue)" color1="var(--amber)" strip idPrefix="disk" />
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
