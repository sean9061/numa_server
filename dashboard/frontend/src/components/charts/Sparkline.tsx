import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';

interface Props {
  data: (number | null)[];
  color: string;
  maxY?: number;
}

export function Sparkline({ data, color, maxY = 100 }: Props) {
  const chartData = data.map((v, i) => ({ i, v }));
  const gradId = `sg-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.22} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis domain={[0, maxY]} hide />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
