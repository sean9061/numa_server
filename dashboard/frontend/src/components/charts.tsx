import {
  ResponsiveContainer, AreaChart, Area, YAxis, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts';

const FILL_OPACITY = 0.13; // matte flat fill, no gradient

export interface Serie {
  key: string;
  color: string;
  data: (number | null)[];
  fill?: boolean;
}

/* ── Multi-series area/line sparkline ────────────────────── */
export function LineSet({ series, domain }: { series: Serie[]; domain?: [number, number] }) {
  const len = series.reduce((m, s) => Math.max(m, s.data.length), 0);
  const data = Array.from({ length: len }, (_, i) => {
    const o: Record<string, number | null> = { i };
    for (const s of series) o[s.key] = s.data[i] ?? null;
    return o;
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
        <YAxis hide domain={domain ?? ['auto', 'auto']} />
        {series.map(s => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            fill={s.color}
            fillOpacity={s.fill ? FILL_OPACITY : 0}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Network mirror (rx up / tx down) ────────────────────── */
export function MirrorNet({
  rx, tx, rxColor, txColor,
}: { rx: (number | null)[]; tx: (number | null)[]; rxColor: string; txColor: string }) {
  const len = Math.max(rx.length, tx.length);
  const data = Array.from({ length: len }, (_, i) => ({
    i,
    rx: rx[i] ?? null,
    tx: tx[i] != null ? -(tx[i] as number) : null,
  }));
  const vals = [...rx, ...tx].filter((n): n is number => n != null);
  const peak = Math.max(1, ...vals);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <YAxis hide domain={[-peak * 1.15, peak * 1.15]} />
        <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
        <Area type="monotone" dataKey="rx" stroke={rxColor} strokeWidth={2}
          fill={rxColor} fillOpacity={FILL_OPACITY} dot={false} isAnimationActive={false} connectNulls />
        <Area type="monotone" dataKey="tx" stroke={txColor} strokeWidth={2}
          fill={txColor} fillOpacity={FILL_OPACITY} dot={false} isAnimationActive={false} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Donut ───────────────────────────────────────────────── */
export function Donut({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="60%"
          outerRadius="92%"
          startAngle={90}
          endAngle={-270}
          stroke="none"
          paddingAngle={1}
          isAnimationActive={false}
        >
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
