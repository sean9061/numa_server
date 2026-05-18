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

  if (gpus.length === 1) {
    const g = gpus[0];
    const pct      = g.usage ?? 0;
    const vramPct  = g.vram_total ? Math.round((g.vram_used! / g.vram_total) * 100) : null;
    const usageData = padHistory(slice.map(e => e.gpu?.[0]?.usage ?? null), win);

    return (
      <TileCard strip={<Sparkline data={usageData} color={GPU_COLORS[0]} strip />}>
        <CardLabel>GPU</CardLabel>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>GPU 0</span>
          <span style={{ fontSize: 11, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
            {g.temp != null && <>{g.temp}°C &nbsp;</>}
            {g.power_draw != null && <>⚡ {g.power_draw.toFixed(0)}W</>}
          </span>
        </div>
        <HeroNumber value={pct} unit="%" label="Usage" color={statusColor(pct)} />
        {g.vram_total != null && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VRAM</span>
              <span style={{ fontSize: 11, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{fmtMB(g.vram_used)}</span>
                {' / '}{fmtMB(g.vram_total)}
              </span>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${vramPct ?? 0}%`,
                background: barColor(vramPct ?? 0, 'var(--amber)'),
                borderRadius: 2, transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}
      </TileCard>
    );
  }

  // 2+ GPUs: side-by-side columns
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      padding: '14px 0 10px',
    }}>
      <div style={{ paddingInline: 14, flexShrink: 0 }}>
        <CardLabel>GPU</CardLabel>
      </div>

      <div style={{
        flex: 1, minHeight: 0, marginTop: 10,
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr',
      }}>
        {(() => {
          const [g0, g1] = gpus;
          const mk = (g: typeof g0, i: number) => {
            const pct       = g.usage ?? 0;
            const color     = GPU_COLORS[i % GPU_COLORS.length];
            const vramPct   = g.vram_total ? Math.round((g.vram_used! / g.vram_total) * 100) : null;
            const usageData = padHistory(slice.map(e => e.gpu?.[i]?.usage ?? null), win);
            return <GpuColumn key={i} index={i} g={g} pct={pct} color={color} vramPct={vramPct} usageData={usageData} />;
          };
          return [mk(g0, 0), <div key="div" style={{ background: 'var(--border)' }} />, mk(g1, 1)];
        })()}
      </div>
    </div>
  );
}

function GpuColumn({ index, g, pct, color, vramPct, usageData }: {
  index: number;
  g: { temp?: number | null; power_draw?: number | null; vram_used?: number | null; vram_total?: number | null };
  pct: number;
  color: string;
  vramPct: number | null;
  usageData: (number | null)[];
}) {
  return (
    <div style={{ paddingInline: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--dim)' }}>GPU {index}</span>
        <span style={{ fontSize: 10, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
          {g.temp != null && <>{g.temp}°</>}
        </span>
      </div>

      {/* Hero */}
      <div style={{ marginTop: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 38, fontWeight: 700, lineHeight: 1, color: statusColor(pct), fontVariantNumeric: 'tabular-nums' }}>
          {pct.toFixed(0)}
        </span>
        <span style={{ fontSize: 14, color: 'var(--dim)', marginLeft: 2 }}>%</span>
        {g.power_draw != null && (
          <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 1 }}>⚡ {g.power_draw.toFixed(0)}W</div>
        )}
      </div>

      {/* VRAM bar */}
      {g.vram_total != null && (
        <div style={{ marginTop: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VRAM</span>
            <span style={{ fontSize: 9, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>{vramPct}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${vramPct ?? 0}%`,
              background: barColor(vramPct ?? 0, 'var(--amber)'),
              borderRadius: 2, transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Sparkline */}
      <div style={{ flex: 1, minHeight: 0, marginTop: 8 }}>
        <Sparkline data={usageData} color={color} />
      </div>
    </div>
  );
}
