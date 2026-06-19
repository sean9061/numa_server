import { useStore } from '../../store/useStore';
import { CHART_PTS, C, PIE_COLORS } from '../../constants';
import { Card, Stat } from '../ui';
import { LineSet, Donut } from '../charts';
import { fmtBps, fmtGB } from '../../utils';

export function DiskTile() {
  const disks = useStore(s => s.metrics?.disk);
  const breakdown = useStore(s => s.metrics?.disk_breakdown);
  const io = useStore(s => s.metrics?.disk_io);
  const history = useStore(s => s.history);
  const win = history.slice(-CHART_PTS);

  const rx = win.map(e => e.disk_rx ?? null);
  const wx = win.map(e => e.disk_wx ?? null);

  // primary disk: root mount, else largest
  const list = disks ?? [];
  const primary = list.find(d => d.mount === '/') ??
    [...list].sort((a, b) => b.size - a.size)[0];
  const pct = primary && primary.size > 0 ? Math.round((primary.used / primary.size) * 100) : 0;

  const usageData = primary
    ? [
        { name: 'used', value: primary.used, color: C.accent },
        { name: 'free', value: Math.max(0, primary.size - primary.used), color: C.track },
      ]
    : [];

  const bd = breakdown ?? [];
  const bdData = bd.map((b, i) => ({ name: b.label, value: b.bytes, color: PIE_COLORS[i % PIE_COLORS.length] }));
  const bdTotal = bd.reduce((s, b) => s + b.bytes, 0);

  return (
    <Card title="DISK" area="dsk" dot={C.accent}>
      <div className="disk-top">
        <div className="donut-wrap">
          <div className="donut-box">
            <Donut data={usageData} />
            <div className="donut-center">
              <span className="pct" style={{ color: C.accent }}>{pct}%</span>
              <span className="sub">{primary ? `${fmtGB(primary.used)} / ${fmtGB(primary.size)}` : '—'}</span>
            </div>
          </div>
          <div className="donut-title">{primary?.mount ?? 'disk'}</div>
        </div>

        <div className="donut-wrap">
          <div className="donut-box">
            <Donut data={bdData} />
            <div className="donut-center">
              <span className="pct">{fmtGB(bdTotal)}</span>
              <span className="sub">tracked</span>
            </div>
          </div>
          <div className="donut-title">
            {bd.map((b, i) => (
              <span key={b.label} style={{ color: PIE_COLORS[i % PIE_COLORS.length], marginRight: 7 }}>
                ● {b.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-sm">
        <LineSet
          series={[
            { key: 'rx', color: C.accent2, data: rx, fill: true },
            { key: 'wx', color: C.warn, data: wx, fill: false },
          ]}
        />
      </div>
      <div className="stat-row">
        <Stat label="Read" value={<span style={{ color: C.accent2 }}>{fmtBps(io?.rx_sec)}</span>} sm />
        <Stat label="Write" value={<span style={{ color: C.warn }}>{fmtBps(io?.wx_sec)}</span>} sm />
      </div>
    </Card>
  );
}
