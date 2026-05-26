/**
 * Spinning fan SVG icon.
 * rpm: for CPU (actual RPM). pct: for GPU (0-100 %).
 * Pass exactly one.
 */
export function FanIcon({ rpm, pct, size = 14 }: { rpm?: number | null; pct?: number | null; size?: number }) {
  const speed = rpm != null ? rpm : (pct != null ? pct * 20 : 0);
  const running = speed > 0;
  // Visual speed: 2000 virtual-RPM → ~1s per rotation
  const duration = running ? Math.max(0.4, 2000 / Math.max(1, speed)) : 0;

  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        animation: running ? `fan-spin ${duration}s linear infinite` : 'none',
        transformOrigin: '50% 50%',
      }}
    >
      {/* 3 blades as rotated ellipses */}
      <ellipse cx="12" cy="6.5" rx="2.2" ry="4.5" />
      <ellipse cx="12" cy="6.5" rx="2.2" ry="4.5" transform="rotate(120 12 12)" />
      <ellipse cx="12" cy="6.5" rx="2.2" ry="4.5" transform="rotate(240 12 12)" />
      {/* Hub: outer ring in surface color to "punch out" center, inner dot */}
      <circle cx="12" cy="12" r="2.8" fill="var(--surface)" />
      <circle cx="12" cy="12" r="1.6" />
    </svg>
  );
}
