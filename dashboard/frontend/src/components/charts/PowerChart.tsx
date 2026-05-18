import { ResponsiveContainer, LineChart, Line, YAxis } from 'recharts';

interface Props {
  total: (number | null)[];
  cpu:   (number | null)[];
  gpu:   (number | null)[];
  dram:  (number | null)[];
}

export function PowerChart({ total, cpu, gpu, dram }: Props) {
  const chartData = total.map((v, i) => ({
    i, total: v, cpu: cpu[i], gpu: gpu[i], dram: dram[i],
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <YAxis width={32} tick={{ fill: '#444', fontSize: 9 }} tickLine={false}
          axisLine={false} tickFormatter={(v: number) => `${v}W`} tickCount={4} />
        <Line type="monotone" dataKey="total" stroke="#e0e0e0" strokeWidth={2}   dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="cpu"   stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="gpu"   stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="dram"  stroke="#818cf8" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
