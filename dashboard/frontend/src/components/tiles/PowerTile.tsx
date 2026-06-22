import { useStore } from '../../store/useStore';
import { useViewHistory } from '../../hooks/useViewHistory';
import { PowerChart } from '../charts/PowerChart';
import { CardLabel } from './TileCard';
import { downsample } from '../../utils';
import { HIST_DISPLAY } from '../../constants';

export function PowerTile() {
  const metrics = useStore(s => s.metrics);
  const slice   = useViewHistory();

  const power = metrics?.power;
  const fmt   = (w?: number | null) => w != null ? `${w}W` : '—';
  const total = downsample(slice.map(e => e.pow_total), HIST_DISPLAY);
  const cpu   = downsample(slice.map(e => e.pow_cpu),   HIST_DISPLAY);
  const gpu   = downsample(slice.map(e => e.pow_gpu),   HIST_DISPLAY);

  const breakdown = [
    { color: '#3b82f6', label: 'CPU', value: fmt(power?.cpu) },
    { color: '#f59e0b', label: 'GPU', value: fmt(power?.gpu) },
  ];

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      padding: '14px 14px 12px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header: label + total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexShrink: 0 }}>
        <CardLabel>Power</CardLabel>
        <div style={{ lineHeight: 1 }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {power?.total ?? '—'}
          </span>
          {power?.total != null && (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dim)', marginLeft: 3 }}>W</span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, marginTop: 10 }}>
        <PowerChart total={total} cpu={cpu} gpu={gpu} />
      </div>

      {/* Breakdown */}
      <div style={{ display: 'flex', gap: 16, flexShrink: 0, marginTop: 10 }}>
        {breakdown.map(({ color, label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
