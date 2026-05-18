import { useStore } from '../../store/useStore';
import { Sparkline } from '../charts/Sparkline';
import { colorClass, gaugeColor, barColor } from '../../utils';
import { HIST_DISPLAY } from '../../constants';

const GAUGE_LEN = 204.2;

export function CpuTile() {
  const metrics     = useStore(s => s.metrics);
  const history     = useStore(s => s.history);
  const timeWindow  = useStore(s => s.timeWindow);

  const cpu    = metrics?.cpu;
  const pct    = cpu?.usage ?? 0;
  const stroke = gaugeColor(pct, 'var(--blue)');
  const dashArr = `${((pct / 100) * GAUGE_LEN).toFixed(1)} ${GAUGE_LEN}`;

  const win = Math.min(timeWindow, HIST_DISPLAY);
  const slice = history.slice(-win);
  const pad = (arr: (number | null)[]) => {
    const a = arr.slice(-win);
    return [...Array(Math.max(0, win - a.length)).fill(null), ...a];
  };
  const cpuData = pad(slice.map(e => e.cpu));

  return (
    <div className="card">
      <div className="card-title">CPU</div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6, alignItems: 'stretch', marginTop: 4 }}>
        <div style={{ width: 88, flexShrink: 0, position: 'relative', alignSelf: 'center' }}>
          <svg className="gauge-svg" viewBox="0 0 160 100">
            <path className="gauge-track"     d="M 15 88 A 65 65 0 0 1 145 88"/>
            <path className="gauge-indicator" d="M 15 88 A 65 65 0 0 1 145 88"
              stroke={stroke} strokeDasharray={dashArr}/>
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-44%)', textAlign: 'center', pointerEvents: 'none' }}>
            <div className={`${colorClass(pct)}`} style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {cpu ? `${pct}%` : '—'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 1 }}>USAGE</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Sparkline data={cpuData} color="#3b82f6" />
        </div>
      </div>
      <CoreGrid cores={cpu?.cores ?? []} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, flexShrink: 0 }}>
        <MetaPill label="🌡" val={cpu?.temp != null ? `${cpu.temp}°C` : '—'} />
        <MetaPill label="⚡" val={cpu?.power != null ? `${cpu.power}W` : '—'} />
      </div>
    </div>
  );
}

function CoreGrid({ cores }: { cores: number[] }) {
  if (!cores.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px 5px', marginTop: 4, flexShrink: 0 }}>
      {cores.map((usage, i) => {
        const pct = usage ?? 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 8, color: 'var(--dim)', width: 12, flexShrink: 0 }}>{i}</span>
            <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div className="core-fill" style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: barColor(pct) }} />
            </div>
            <span style={{ fontSize: 8, color: 'var(--dim)', width: 22, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MetaPill({ label, val }: { label: string; val: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--dim)' }}>
      {label} <span style={{ color: 'var(--text)', fontWeight: 500 }}>{val}</span>
    </div>
  );
}
