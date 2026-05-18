import { useStore } from '../../store/useStore';
import { CardLabel } from './TileCard';

export function LoadTile() {
  const metrics = useStore(s => s.metrics);
  const load    = metrics?.load;
  const proc    = metrics?.proc_count;

  const rows = [
    { label: '1 min',  value: load?.m1?.toFixed(2)  ?? '—' },
    { label: '5 min',  value: load?.m5?.toFixed(2)  ?? '—' },
    { label: '15 min', value: load?.m15?.toFixed(2) ?? '—' },
  ];

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      padding: '14px 18px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <CardLabel>Load Avg</CardLabel>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', marginTop: 8 }}>
        {rows.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</span>
            <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', lineHeight: 1 }}>
              {value}
            </span>
          </div>
        ))}

        <div style={{ height: 1, background: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>Processes</span>
          <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', lineHeight: 1 }}>
            {proc ?? '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
