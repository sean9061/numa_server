import type { ReactNode } from 'react';
import { clamp } from '../utils';

/* ── Card shell ──────────────────────────────────────────── */
export function Card({
  title, area, dot, head, children,
}: {
  title: string;
  area: string;
  dot?: string;
  head?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`card area-${area}`}>
      <div className="card-head">
        <div className="card-title">
          <span className="tdot" style={dot ? { background: dot } : undefined} />
          {title}
        </div>
        {head}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

/* ── Big headline value ──────────────────────────────────── */
export function HeadVal({ value, unit, color }: { value: string; unit?: string; color?: string }) {
  return (
    <div className="card-head-val">
      <span className="big" style={color ? { color } : undefined}>{value}</span>
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

/* ── Labelled stat ───────────────────────────────────────── */
export function Stat({ label, value, sm }: { label: string; value: ReactNode; sm?: boolean }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={sm ? 'stat-value sm' : 'stat-value'}>{value}</span>
    </div>
  );
}

/* ── Progress bar ────────────────────────────────────────── */
export function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${clamp(pct, 0, 100)}%`, background: color }} />
    </div>
  );
}

/* ── Legend ──────────────────────────────────────────────── */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map(i => (
        <span className="legend-item" key={i.label}>
          <span className="legend-swatch" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* ── Spinning fan ────────────────────────────────────────────
   `pct` (0..1) drives the spin speed. Faster value → shorter period.   */
export function Fan({ pct, size = 20 }: { pct: number; size?: number }) {
  const p = clamp(pct, 0, 1);
  const spinning = p > 0.01;
  // 2.4s at idle → 0.28s at full
  const dur = (2.4 - p * 2.12).toFixed(2);
  return (
    <svg
      className={`fan-svg${spinning ? ' spin' : ''}`}
      style={{ animationDuration: `${dur}s` }}
      width={size} height={size} viewBox="0 0 24 24" fill="none"
    >
      <circle cx="12" cy="12" r="2.1" fill="currentColor" />
      {[0, 90, 180, 270].map(a => (
        <path
          key={a}
          d="M12 10.2 C13.8 8.6 14.4 5.6 13.2 3.4 C12.2 4.4 10.6 5.8 11 8.4 Z"
          fill="currentColor"
          opacity="0.85"
          transform={`rotate(${a} 12 12)`}
        />
      ))}
    </svg>
  );
}
