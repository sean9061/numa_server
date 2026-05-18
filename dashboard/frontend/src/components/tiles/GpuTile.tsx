import { useStore } from '../../store/useStore';
import { Sparkline } from '../charts/Sparkline';
import { colorClass, fmtMB } from '../../utils';
import { GPU_COLORS, HIST_DISPLAY } from '../../constants';

export function GpuTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);
  const gpus       = metrics?.gpu ?? [];

  const win = Math.min(timeWindow, HIST_DISPLAY);
  const slice = history.slice(-win);
  const pad = (arr: (number | null)[]) => {
    const a = arr.slice(-win);
    return [...Array(Math.max(0, win - a.length)).fill(null), ...a];
  };

  if (!gpus.length) {
    return (
      <div className="card">
        <div className="card-title">GPU</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 11 }}>
          No GPU
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">GPU</div>
      {gpus.map((g, i) => {
        const pct      = g.usage ?? 0;
        const color     = GPU_COLORS[i % GPU_COLORS.length];
        const usageData = pad(slice.map(e => e.gpu?.[i]?.usage ?? null));
        const vramData  = pad(slice.map(e => e.gpu?.[i]?.vram_pct ?? null));
        const vramText  = g.vram_total ? `${fmtMB(g.vram_used)}/${fmtMB(g.vram_total)}` : '—';

        return (
          <div key={i} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {i > 0 && <div style={{ height: 1, background: 'var(--border)', flexShrink: 0, margin: '2px 0' }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>GPU {i}</span>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>
                🌡 <span style={{ color: 'var(--text)' }}>{g.temp != null ? `${g.temp}°C` : '—'}</span>
                &nbsp;&nbsp;⚡ <span style={{ color: 'var(--text)' }}>{g.power_draw != null ? `${g.power_draw.toFixed(0)}W` : '—'}</span>
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6, alignItems: 'stretch' }}>
              <div className={colorClass(pct)} style={{ fontSize: 20, fontWeight: 700, width: 44, flexShrink: 0, textAlign: 'center', fontVariantNumeric: 'tabular-nums', alignSelf: 'center' }}>
                {pct}%
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ fontSize: 8, color: 'var(--dim)', flexShrink: 0, marginBottom: 1 }}>USAGE</div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <Sparkline data={usageData} color={color} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ fontSize: 8, color: 'var(--dim)', flexShrink: 0, marginBottom: 1 }}>
                    VRAM&nbsp;<span style={{ color: 'var(--text)' }}>{vramText}</span>
                  </div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <Sparkline data={vramData} color="#f59e0b" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
