import type { ReactNode } from 'react';
import type { HomeDevice } from '../../../types';
import { clamp } from '../../../utils';

/** Battery indicator — green→warn→crit as it drains. */
export function BatteryPill({ pct }: { pct: number }) {
  const p = clamp(pct, 0, 100);
  const color = p <= 15 ? 'var(--crit)' : p <= 35 ? 'var(--warn)' : 'var(--accent)';
  return (
    <span className="batt" title={`Battery ${p}%`}>
      <span className="batt-shell">
        <span className="batt-fill" style={{ width: `${p}%`, background: color }} />
      </span>
      <span className="batt-pct" style={{ color }}>{p}%</span>
    </span>
  );
}

/** Shared card shell for every HOME device tile. */
export function DeviceCard({
  device, accent, head, children,
}: {
  device: HomeDevice;
  accent: string;
  head?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`home-card${device.online ? '' : ' offline'}`}>
      <div className="home-card-head">
        <div className="home-card-title">
          <span className="tdot" style={{ background: accent }} />
          <span className="home-card-name">{device.name}</span>
        </div>
        <div className="home-card-meta">
          {device.battery != null && <BatteryPill pct={device.battery} />}
          {head}
        </div>
      </div>
      <div className="home-card-type">{device.type}</div>
      <div className="home-card-body">{children}</div>
    </section>
  );
}
