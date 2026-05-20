import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { fmtBps } from '../../utils';

interface Props {
  data0: (number | null)[];
  data1: (number | null)[];
  color0: string;
  color1: string;
  tickFormatter?: (v: number) => string;
  /** Strip mode: flush margins, no Y-axis */
  strip?: boolean;
  /** Unique prefix for SVG gradient IDs (avoids conflicts when multiple instances render) */
  idPrefix?: string;
}

export function DualLineChart({ data0, data1, color0, color1, tickFormatter = fmtBps, strip, idPrefix = 'dg' }: Props) {
  const id0 = `${idPrefix}0`;
  const id1 = `${idPrefix}1`;
  const chartData = data0.map((v, i) => ({ i, v0: v ?? 0, v1: data1[i] ?? 0 }));
  const margin = strip
    ? { top: 6, right: 0, bottom: 0, left: 0 }
    : { top: 4, right: 4, bottom: 4, left: 4 };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={margin}>
        <defs>
          <linearGradient id={id0} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color0} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color0} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={id1} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color1} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color1} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {!strip && (
          <YAxis width={38} tick={{ fill: '#444', fontSize: 9 }} tickLine={false}
            axisLine={false} tickFormatter={tickFormatter} tickCount={3} />
        )}
        <Area type="monotone" dataKey="v0" stroke={color0} strokeWidth={1.5}
          fill={`url(#${id0})`} dot={false} isAnimationActive={false} connectNulls={false} />
        <Area type="monotone" dataKey="v1" stroke={color1} strokeWidth={1.5}
          fill={`url(#${id1})`} dot={false} isAnimationActive={false} connectNulls={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
