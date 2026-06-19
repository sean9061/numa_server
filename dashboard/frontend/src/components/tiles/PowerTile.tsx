import { useStore } from '../../store/useStore';
import { CHART_PTS, C } from '../../constants';
import { Card, HeadVal, Legend } from '../ui';
import { LineSet } from '../charts';
import { fmtW } from '../../utils';

export function PowerTile() {
  const m = useStore(s => s.metrics?.power);
  const history = useStore(s => s.history);
  const win = history.slice(-CHART_PTS);

  const total = win.map(e => e.pow_total ?? null);
  const cpu = win.map(e => e.pow_cpu ?? null);
  const gpu = win.map(e => e.pow_gpu ?? null);

  return (
    <Card
      title="POWER"
      area="pow"
      dot={C.gold}
      head={<HeadVal value={m?.total != null ? `${Math.round(m.total)}` : '—'} unit="W" />}
    >
      <div className="chart">
        <LineSet
          series={[
            { key: 'total', color: C.accent, data: total, fill: true },
            { key: 'cpu', color: C.accent2, data: cpu, fill: false },
            { key: 'gpu', color: C.gold, data: gpu, fill: false },
          ]}
        />
      </div>
      <Legend
        items={[
          { label: `Total ${fmtW(m?.total)}`, color: C.accent },
          { label: `CPU ${fmtW(m?.cpu)}`, color: C.accent2 },
          { label: `GPU ${fmtW(m?.gpu)}`, color: C.gold },
        ]}
      />
    </Card>
  );
}
