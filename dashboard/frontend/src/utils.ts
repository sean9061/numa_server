export function fmtBytes(b?: number | null): string {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtMB(mb?: number | null): string {
  if (mb == null) return '—';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function fmtBps(bps?: number | null): string {
  if (bps == null) return '—';
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}

/** Watts — one decimal under 100W, integer above */
export function fmtW(w?: number | null): string {
  if (w == null) return '—';
  return w < 100 ? `${w.toFixed(1)} W` : `${Math.round(w)} W`;
}

/** Celsius, rounded */
export function fmtTemp(c?: number | null): string {
  if (c == null) return '—';
  return `${Math.round(c)}°C`;
}

/** Bytes → GB (fixed unit, for memory) */
export function fmtGB(bytes?: number | null): string {
  if (bytes == null) return '—';
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** nvidia-smi VRAM is MiB → GB */
export function fmtVram(mib?: number | null): string {
  if (mib == null) return '—';
  return `${(mib / 1024).toFixed(1)} GB`;
}

export const toGB = (bytes?: number | null): number | null =>
  bytes == null ? null : bytes / 1024 ** 3;

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export function fmtUptime(s?: number | null): string {
  if (!s) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Numeral color — stays neutral until the reading is notable. */
export function statusColor(pct: number): string {
  if (pct >= 85) return 'var(--crit)';
  if (pct >= 65) return 'var(--warn)';
  return 'var(--text)';
}

/** Tick-meter fill — resting cyan signal, escalating to warn/crit. */
export function meterColor(pct: number, resting = 'var(--accent)'): string {
  if (pct >= 85) return 'var(--crit)';
  if (pct >= 65) return 'var(--warn)';
  return resting;
}

export function barColor(pct: number, okColor = 'var(--accent)'): string {
  if (pct >= 85) return 'var(--crit)';
  if (pct >= 65) return 'var(--warn)';
  return okColor;
}

/** Pad history array to `win` entries (null-fill left side) */
export function padHistory(arr: (number | null)[], win: number): (number | null)[] {
  const a = arr.slice(-win);
  return [...Array(Math.max(0, win - a.length)).fill(null), ...a];
}

/**
 * Downsample `arr` to exactly `target` points.
 * If shorter than target: pad left with nulls (same as padHistory).
 * If longer: average-bucket aggregate so larger timeWindows show full range.
 */
export function downsample(arr: (number | null)[], target: number): (number | null)[] {
  if (arr.length === 0) return Array(target).fill(null);
  if (arr.length <= target) {
    return [...Array(target - arr.length).fill(null), ...arr];
  }
  const result: (number | null)[] = [];
  const bucketSize = arr.length / target;
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * bucketSize);
    const end   = Math.floor((i + 1) * bucketSize);
    const vals  = arr.slice(start, end).filter((v): v is number => v !== null);
    result.push(vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  }
  return result;
}
