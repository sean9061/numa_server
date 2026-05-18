import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { fmtBps } from '../../utils';

interface Props {
  data0: (number | null)[];
  data1: (number | null)[];
  color0: string;
  color1: string;
  tickFormatter?: (v: number) => string;
}

export function DualLineChart({ data0, data1, color0, color1, tickFormatter = fmtBps }: Props) {
  const chartData = data0.map((v, i) => ({ i, v0: v, v1: data1[i] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
        <defs>
          <linearGradient id="dg0" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color0} stopOpacity={0.15} />
            <stop offset="95%" stopColor={color0} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="dg1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color1} stopOpacity={0.15} />
            <stop offset="95%" stopColor={color1} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis
          width={36}
          tick={{ fill: '#4e6282', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={tickFormatter}
          tickCount={3}
        />
        <Area type="monotone" dataKey="v0" stroke={color0} strokeWidth={1.5}
          fill="url(#dg0)" dot={false} isAnimationActive={false} connectNulls={false} />
        <Area type="monotone" dataKey="v1" stroke={color1} strokeWidth={1.5}
          fill="url(#dg1)" dot={false} isAnimationActive={false} connectNulls={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
