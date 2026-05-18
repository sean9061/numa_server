import { useStore } from '../../store/useStore';

export function LoadTile() {
  const metrics = useStore(s => s.metrics);
  const load    = metrics?.load;
  const proc    = metrics?.proc_count;

  const rows = [
    { label: '1 min',  val: load?.m1?.toFixed(2)  ?? '—' },
    { label: '5 min',  val: load?.m5?.toFixed(2)  ?? '—' },
    { label: '15 min', val: load?.m15?.toFixed(2) ?? '—' },
  ];

  return (
    <div className="card">
      <div className="card-title">LOAD AVG</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', marginTop: 6 }}>
        {rows.map(({ label, val }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--dim)', fontSize: 11 }}>{label}</span>
            <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
          </div>
        ))}
        <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--dim)', fontSize: 11 }}>Processes</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{proc ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
