import { useStore } from '../../store/useStore';
import { C, HIST_DISPLAY } from '../../constants';
import { useViewHistory } from '../../hooks/useViewHistory';
import { Card, HeadVal, Stat } from '../ui';
import { LineSet } from '../charts';
import { fmtTemp, fmtW, statusColor, meterColor, downsample } from '../../utils';

export function CpuTile() {
  const m = useStore(s => s.metrics?.cpu);
  const win = useViewHistory();

  const usage = downsample(win.map(e => e.cpu ?? null), HIST_DISPLAY);
  const temp = downsample(win.map(e => e.cpu_temp ?? null), HIST_DISPLAY);

  const cores = m?.cores ?? [];
  const u = m?.usage ?? 0;

  return (
    <Card
      title="CPU"
      area="cpu"
      dot={C.accent}
      head={<HeadVal value={m?.usage != null ? `${m.usage}` : '—'} unit="%" color={statusColor(u)} />}
    >
      <div className="chart">
        <LineSet series={[{ key: 'u', color: C.accent, data: usage, fill: true }]} domain={[0, 100]} />
      </div>

      <div className="cores">
        {cores.map((c, i) => {
          const v = c ?? 0;
          return (
            <div className="core" key={i} title={`core ${i}: ${v}%`}>
              <div className="core-fill" style={{ height: `${v}%`, background: meterColor(v) }} />
            </div>
          );
        })}
      </div>

      <div className="stat-row">
        <Stat
          label="Temp"
          value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 58, height: 22, display: 'block' }}>
                <LineSet series={[{ key: 't', color: C.warn, data: temp, fill: true }]} />
              </span>
              {fmtTemp(m?.temp)}
            </span>
          }
        />
        <Stat label="Power" value={fmtW(m?.power)} />
      </div>
    </Card>
  );
}
