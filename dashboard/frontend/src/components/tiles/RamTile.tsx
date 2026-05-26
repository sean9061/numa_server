import { useStore } from '../../store/useStore';
import { Sparkline } from '../charts/Sparkline';
import { TileCard, CardLabel, HeroNumber } from './TileCard';
import { statusColor, fmtBytes, downsample } from '../../utils';
import { HIST_DISPLAY } from '../../constants';

export function RamTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);

  const ram   = metrics?.ram;
  const pct   = ram?.percent ?? 0;
  const data  = downsample(history.slice(-timeWindow).map(e => e.ram), HIST_DISPLAY);
  const dramW = metrics?.power?.dram;

  const swapPct = ram?.swap_total
    ? Math.round(((ram.swap_used ?? 0) / ram.swap_total) * 100)
    : null;

  const meta = [
    { label: 'Used',  value: fmtBytes(ram?.used) },
    { label: 'Cache', value: fmtBytes((ram?.cached ?? 0) + (ram?.buffers ?? 0)) },
    { label: 'Swap',  value: swapPct != null ? `${swapPct}%` : '—' },
  ];

  return (
    <TileCard strip={<Sparkline data={data} color="#22c55e" strip />}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <CardLabel>RAM</CardLabel>
        {dramW != null && (
          <span style={{ fontSize: 11, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>⚡ {dramW}W</span>
        )}
      </div>

      {/* Hero */}
      <div style={{ marginTop: 10, flexShrink: 0 }}>
        <HeroNumber
          value={ram ? pct : '—'}
          unit={ram ? '%' : undefined}
          label="Used"
          color={statusColor(pct)}
        />
      </div>

      {/* Meta grid */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
        {meta.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          </div>
        ))}
      </div>
    </TileCard>
  );
}
