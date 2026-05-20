import { useStore } from '../../store/useStore';
import { DualLineChart } from '../charts/DualLineChart';
import { CardLabel } from './TileCard';
import { statusColor, barColor, fmtMB, padHistory } from '../../utils';
import { GPU_COLORS, HIST_DISPLAY } from '../../constants';
import type { GpuData } from '../../types';

export function GpuTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);
  const gpus       = metrics?.gpu ?? [];

  const win   = Math.min(timeWindow, HIST_DISPLAY);
  const slice = history.slice(-win);

  if (!gpus.length) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        display: 'flex', flexDirection: 'column', padding: '14px 14px 10px',
      }}>
        <CardLabel>GPU</CardLabel>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', color: 'var(--dim)', fontSize: 12 }}>
          No GPU detected
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      padding: '14px 0 10px',
    }}>
      <div style={{ paddingInline: 14, flexShrink: 0 }}>
        <CardLabel>GPU</CardLabel>
      </div>

      {gpus.map((g, i) => (
        <GpuSection
          key={i}
          index={i}
          g={g}
          usageData={padHistory(slice.map(e => e.gpu?.[i]?.usage    ?? null), win)}
          vramData={padHistory(slice.map(e => e.gpu?.[i]?.vram_pct ?? null), win)}
          showDivider={i > 0}
        />
      ))}
    </div>
  );
}

function GpuSection({ index, g, usageData, vramData, showDivider }: {
  index: number;
  g: GpuData;
  usageData: (number | null)[];
  vramData:  (number | null)[];
  showDivider: boolean;
}) {
  const color     = GPU_COLORS[index % GPU_COLORS.length];
  const usagePct  = g.usage ?? 0;
  const vramPct   = g.vram_total ? Math.round((g.vram_used! / g.vram_total) * 100) : null;

  return (
    <>
      {showDivider && <div style={{ height: 1, background: 'var(--border)', flexShrink: 0, marginBlock: 10 }} />}

      <div style={{ flex: 1, minHeight: 0, paddingInline: 14, display: 'flex', flexDirection: 'column' }}>

        {/* Model name + index */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>GPU {index}</span>
          {g.name && (
            <span style={{ fontSize: 10, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
              {g.name}
            </span>
          )}
        </div>

        {/* Temp + power */}
        <div style={{ marginTop: 4, flexShrink: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
          {g.temp != null && (
            <span style={{ fontSize: 11, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{g.temp}</span>°C
            </span>
          )}
          {g.power_draw != null && (
            <span style={{ fontSize: 11, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
              ⚡ <span style={{ color: 'var(--text)', fontWeight: 500 }}>{g.power_draw.toFixed(0)}</span>
              {g.power_limit != null && <> / {g.power_limit.toFixed(0)}</>} W
            </span>
          )}
        </div>

        {/* Dual hero: GPU usage + VRAM % */}
        <div style={{ marginTop: 8, flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <HeroBlock
            value={`${usagePct.toFixed(0)}%`}
            label="GPU"
            color={statusColor(usagePct)}
            accent={color}
          />
          <HeroBlock
            value={vramPct != null ? `${vramPct}%` : '—'}
            label="VRAM"
            color={vramPct != null ? statusColor(vramPct) : 'var(--dim)'}
            accent="#f59e0b"
          />
        </div>

        {/* VRAM bar + capacity */}
        {g.vram_total != null && (
          <div style={{ marginTop: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VRAM</span>
              <span style={{ fontSize: 10, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{fmtMB(g.vram_used)}</span>
                {' / '}{fmtMB(g.vram_total)}
              </span>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${vramPct ?? 0}%`,
                background: barColor(vramPct ?? 0, '#f59e0b'),
                borderRadius: 2, transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* Chart legend */}
        <div style={{ marginTop: 8, flexShrink: 0, display: 'flex', gap: 12 }}>
          <LegendDot color={color} label="Usage" />
          <LegendDot color="#f59e0b" label="VRAM %" />
        </div>

        {/* Dual line chart */}
        <div style={{ flex: 1, minHeight: 0, marginTop: 4 }}>
          <DualLineChart
            data0={usageData}
            data1={vramData}
            color0={color}
            color1="#f59e0b"
            strip
            idPrefix={`gpu${index}`}
          />
        </div>
      </div>
    </>
  );
}

function HeroBlock({ value, label, color, accent }: {
  value: string; label: string; color: string; accent: string;
}) {
  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontSize: 9, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      <div style={{ height: 2, background: accent, borderRadius: 1, opacity: 0.5, marginTop: 2 }} />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 8, height: 2, background: color, borderRadius: 1 }} />
      <span style={{ fontSize: 9, color: 'var(--dim)' }}>{label}</span>
    </div>
  );
}
