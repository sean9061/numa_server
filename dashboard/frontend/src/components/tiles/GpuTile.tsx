import { useStore } from '../../store/useStore';
import { CHART_PTS, C } from '../../constants';
import { Card, HeadVal, Stat, Fan, Legend } from '../ui';
import { LineSet } from '../charts';
import { fmtTemp, fmtW, fmtVram, statusColor, clamp } from '../../utils';
import type { HistoryEntry } from '../../types';

function GpuBlock({ idx, win }: { idx: number; win: HistoryEntry[] }) {
  const g = useStore(s => s.metrics?.gpu?.[idx]);
  if (!g) return null;

  const usage = win.map(e => e.gpu[idx]?.usage ?? null);
  const vram = win.map(e => e.gpu[idx]?.vram_pct ?? null);
  const temp = win.map(e => e.gpu[idx]?.temp ?? null);
  const vramPct = g.vram_total ? clamp(Math.round((g.vram_used ?? 0) / g.vram_total * 100), 0, 100) : 0;
  const fanPct = g.fan_pct != null ? clamp(g.fan_pct / 100, 0, 1) : 0;

  return (
    <div className="gpu-item">
      <div className="card-head" style={{ alignItems: 'flex-end' }}>
        <span className="gpu-name">{g.name ?? `GPU ${idx}`}</span>
        <HeadVal value={g.usage != null ? `${Math.round(g.usage)}` : '—'} unit="%" color={statusColor(g.usage ?? 0)} />
      </div>

      <div className="chart">
        <LineSet
          series={[
            { key: 'u', color: C.accent, data: usage, fill: true },
            { key: 'v', color: C.gold, data: vram, fill: false },
          ]}
          domain={[0, 100]}
        />
      </div>
      <Legend items={[{ label: 'Usage', color: C.accent }, { label: `VRAM ${vramPct}%`, color: C.gold }]} />

      <div className="stat-row">
        <Stat
          label="Temp"
          value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 50, height: 20, display: 'block' }}>
                <LineSet series={[{ key: 't', color: C.warn, data: temp, fill: true }]} />
              </span>
              {fmtTemp(g.temp)}
            </span>
          }
        />
        <Stat label="Power" value={`${fmtW(g.power_draw)} / ${fmtW(g.power_limit)}`} />
        <Stat label="VRAM" value={`${fmtVram(g.vram_used)} / ${fmtVram(g.vram_total)}`} />
        <Stat
          label={`Fan${g.fan_pct != null ? ` · ${Math.round(g.fan_pct)}%` : ''}`}
          value={
            <span className="fan">
              <Fan pct={fanPct} />
              {g.fan_pct != null ? `${Math.round(g.fan_pct)}%` : '—'}
            </span>
          }
        />
      </div>
    </div>
  );
}

export function GpuTile() {
  const count = useStore(s => s.metrics?.gpu?.length ?? 0);
  const history = useStore(s => s.history);
  const win = history.slice(-CHART_PTS);

  return (
    <Card title="GPU" area="gpu" dot={C.accent2}>
      <div className="gpu-list">
        {count === 0
          ? <div style={{ color: 'var(--dim)', fontSize: 12 }}>No GPU detected</div>
          : Array.from({ length: count }, (_, i) => <GpuBlock key={i} idx={i} win={win} />)}
      </div>
    </Card>
  );
}
