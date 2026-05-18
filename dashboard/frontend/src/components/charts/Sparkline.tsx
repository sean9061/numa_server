import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';

interface Props {
  data: (number | null)[];
  color: string;
  maxY?: number;
  /** Strip mode: flush margins, slightly deeper fill */
  strip?: boolean;
}

export function Sparkline({ data, color, maxY = 100, strip }: Props) {
  const margin = strip
    ? { top: 6, right: 0, bottom: 0, left: 0 }
    : { top: 2, right: 2, bottom: 2, left: 2 };
  const gradId = `sg-${color.replace(/[^a-z0-9]/gi, '')}`;
  const opacity = strip ? [0.3, 0.04] : [0.22, 0.02];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data.map((v, i) => ({ i, v }))} margin={margin}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={opacity[0]} />
            <stop offset="95%" stopColor={color} stopOpacity={opacity[1]} />
          </linearGradient>
        </defs>
        <YAxis domain={[0, maxY]} hide />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#${gradId})`} dot={false} isAnimationActive={false} connectNulls={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
