import { useStore } from '../../store/useStore';
import { PowerChart } from '../charts/PowerChart';
import { HIST_DISPLAY } from '../../constants';

export function PowerTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);

  const power = metrics?.power;
  const fmt   = (w?: number | null) => w != null ? `${w}W` : '—';

  const win = Math.min(timeWindow, HIST_DISPLAY);
  const slice = history.slice(-win);
  const pad = (arr: (number | null)[]) => {
    const a = arr.slice(-win);
    return [...Array(Math.max(0, win - a.length)).fill(null), ...a] as (number | null)[];
  };

  const totalData = pad(slice.map(e => e.pow_total));
  const cpuData   = pad(slice.map(e => e.pow_cpu));
  const gpuData   = pad(slice.map(e => e.pow_gpu));
  const dramData  = pad(slice.map(e => e.pow_dram));

  const legend = [
    { color: '#3b82f6', label: 'CPU',  val: fmt(power?.cpu)  },
    { color: '#f59e0b', label: 'GPU',  val: fmt(power?.gpu)  },
    { color: '#818cf8', label: 'DRAM', val: fmt(power?.dram) },
  ];

  return (
    <div className="card">
      <div className="card-title">POWER</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', marginTop: 4, flexShrink: 0 }}>
        {fmt(power?.total)}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', marginTop: 4 }}>
        <PowerChart total={totalData} cpu={cpuData} gpu={gpuData} dram={dramData} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, flexShrink: 0 }}>
        {legend.map(({ color, label, val }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ color: 'var(--dim)' }}>{label}</span>
            <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
