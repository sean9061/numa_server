import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface Segment {
  value: number;
  color: string;
}

interface Props {
  segments: Segment[];
}

export function DiskDonut({ segments }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={segments}
          cx="50%"
          cy="50%"
          innerRadius="68%"
          outerRadius="88%"
          dataKey="value"
          startAngle={90}
          endAngle={-270}
          isAnimationActive={false}
          strokeWidth={0}
        >
          {segments.map((seg, i) => (
            <Cell key={i} fill={seg.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
