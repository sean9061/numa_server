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

export function fmtUptime(s?: number | null): string {
  if (!s) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function colorClass(pct: number): string {
  if (pct >= 85) return 'color-crit';
  if (pct >= 65) return 'color-warn';
  return 'color-ok';
}

export function barColor(pct: number, okColor = 'var(--blue)'): string {
  if (pct >= 85) return 'var(--red)';
  if (pct >= 65) return 'var(--amber)';
  return okColor;
}

export function gaugeColor(pct: number, defaultColor: string): string {
  if (pct >= 85) return 'var(--red)';
  if (pct >= 65) return 'var(--amber)';
  return defaultColor;
}
