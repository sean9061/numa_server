import { useStore } from '../../store/useStore';
import { Sparkline } from '../charts/Sparkline';
import { TileCard, CardLabel, HeroNumber } from './TileCard';
import { statusColor, barColor, fmtMB, padHistory } from '../../utils';
import { GPU_COLORS, HIST_DISPLAY } from '../../constants';

export function GpuTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);
  const gpus       = metrics?.gpu ?? [];

  const win   = Math.min(timeWindow, HIST_DISPLAY);
  const slice = history.slice(-win);

  if (!gpus.length) {
    return (
      <TileCard>
        <CardLabel>GPU</CardLabel>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', color: 'var(--dim)', fontSize: 12 }}>
          No GPU
        </div>
      </TileCard>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ flex: 1, minHeight: 0, padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        <CardLabel>GPU</CardLabel>

        {gpus.map((g, i) => {
          const pct      = g.usage ?? 0;
          const color    = GPU_COLORS[i % GPU_COLORS.length];
          const vramPct  = g.vram_total ? Math.round((g.vram_used! / g.vram_total) * 100) : null;
          const usageData = padHistory(slice.map(e => e.gpu?.[i]?.usage ?? null), win);
          const vramData  = padHistory(slice.map(e => e.gpu?.[i]?.vram_pct ?? null), win);

          return (
            <div key={i} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {i > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '8px 0', flexShrink: 0 }} />}

              {/* Header: GPU index + temp + power */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, marginTop: i === 0 ? 10 : 0 }}>
                <span style={{ fontSize: 10, color: 'var(--dim)' }}>GPU {i}</span>
                <span style={{ fontSize: 11, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
                  {g.temp != null && <>{g.temp}°C &nbsp;</>}
                  {g.power_draw != null && <>⚡ {g.power_draw.toFixed(0)}W</>}
                </span>
              </div>

              {/* Hero */}
              <div style={{ marginTop: 6, flexShrink: 0 }}>
                <HeroNumber value={pct} unit="%" label="Usage" color={statusColor(pct)} />
              </div>

              {/* VRAM bar */}
              {g.vram_total != null && (
                <div style={{ marginTop: 10, flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VRAM</span>
                    <span style={{ fontSize: 11, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{fmtMB(g.vram_used)}</span>
                      {' / '}{fmtMB(g.vram_total)}
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${vramPct ?? 0}%`,
                      background: barColor(vramPct ?? 0, 'var(--amber)'),
                      borderRadius: 3,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Dual sparklines */}
              <div style={{ flex: 1, minHeight: 0, marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <MiniChart label="Usage" data={usageData} color={color} />
                <MiniChart label="VRAM"  data={vramData}  color="#f59e0b" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniChart({ label, data, color }: { label: string; data: (number | null)[]; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <span style={{ fontSize: 8, color: 'var(--dim)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Sparkline data={data} color={color} />
      </div>
    </div>
  );
}
