import { useStore } from '../../store/useStore';
import { Sparkline } from '../charts/Sparkline';
import { colorClass, gaugeColor, fmtBytes } from '../../utils';
import { HIST_DISPLAY } from '../../constants';

const GAUGE_LEN = 204.2;

export function RamTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);

  const ram  = metrics?.ram;
  const pct  = ram?.percent ?? 0;
  const stroke = gaugeColor(pct, 'var(--green)');
  const dashArr = `${((pct / 100) * GAUGE_LEN).toFixed(1)} ${GAUGE_LEN}`;

  const win = Math.min(timeWindow, HIST_DISPLAY);
  const slice = history.slice(-win);
  const pad = (arr: (number | null)[]) => {
    const a = arr.slice(-win);
    return [...Array(Math.max(0, win - a.length)).fill(null), ...a];
  };
  const ramData = pad(slice.map(e => e.ram));

  const swapPct = ram?.swap_total && ram.swap_total > 0
    ? Math.round(((ram.swap_used ?? 0) / ram.swap_total) * 100)
    : 0;

  return (
    <div className="card">
      <div className="card-title">RAM</div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6, alignItems: 'stretch', marginTop: 4 }}>
        <div style={{ width: 88, flexShrink: 0, position: 'relative', alignSelf: 'center' }}>
          <svg className="gauge-svg" viewBox="0 0 160 100">
            <path className="gauge-track"     d="M 15 88 A 65 65 0 0 1 145 88"/>
            <path className="gauge-indicator" d="M 15 88 A 65 65 0 0 1 145 88"
              stroke={stroke} strokeDasharray={dashArr}/>
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-44%)', textAlign: 'center', pointerEvents: 'none' }}>
            <div className={colorClass(pct)} style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {ram ? `${pct}%` : '—'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 1 }}>USED</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Sparkline data={ramData} color="#22c55e" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, flexShrink: 0 }}>
        {[
          { label: 'Used',  val: fmtBytes(ram?.used) },
          { label: 'Cache', val: fmtBytes((ram?.cached ?? 0) + (ram?.buffers ?? 0)) },
          { label: 'Swap',  val: ram?.swap_total ? `${swapPct}%` : '—' },
        ].map(({ label, val }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--dim)' }}>
            {label} <span style={{ color: 'var(--text)', fontWeight: 500 }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
