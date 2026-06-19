import { useStore } from '../../store/useStore';
import { CHART_PTS, C } from '../../constants';
import { Card, HeadVal, Stat, Legend } from '../ui';
import { LineSet } from '../charts';
import { fmtGB, statusColor, toGB } from '../../utils';

export function RamTile() {
  const m = useStore(s => s.metrics?.ram);
  const history = useStore(s => s.history);
  const win = history.slice(-CHART_PTS);

  const used = win.map(e => toGB(e.ram_used));
  const cached = win.map(e => toGB(e.ram_cached));
  const buffers = win.map(e => toGB(e.ram_buffers));
  const swap = win.map(e => toGB(e.swap_used));

  const pct = m?.percent ?? 0;

  return (
    <Card
      title="RAM"
      area="ram"
      dot={C.accent}
      head={<HeadVal value={m?.percent != null ? `${m.percent}` : '—'} unit="%" color={statusColor(pct)} />}
    >
      <div className="chart">
        <LineSet
          series={[
            { key: 'used', color: C.accent, data: used, fill: true },
            { key: 'cached', color: C.accent3, data: cached, fill: false },
            { key: 'buffers', color: C.gold, data: buffers, fill: false },
          ]}
        />
      </div>
      <Legend
        items={[
          { label: `Used ${fmtGB(m?.used)}`, color: C.accent },
          { label: `Cached ${fmtGB(m?.cached)}`, color: C.accent3 },
          { label: `Buffers ${fmtGB(m?.buffers)}`, color: C.gold },
        ]}
      />

      <div className="chart-sm">
        <LineSet series={[{ key: 'swap', color: C.accent2, data: swap, fill: true }]} />
      </div>
      <div className="stat-row">
        <Stat label="Swap Used" value={fmtGB(m?.swap_used)} sm />
        <Stat label="Swap Total" value={fmtGB(m?.swap_total)} sm />
      </div>
    </Card>
  );
}
