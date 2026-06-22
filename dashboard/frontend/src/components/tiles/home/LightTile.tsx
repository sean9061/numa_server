import type { HomeDevice } from '../../../types';
import { C } from '../../../constants';
import { clamp } from '../../../utils';
import { Stat, Bar } from '../../ui';
import { DeviceCard } from './DeviceCard';
import { StatePill } from './StatePill';

// SwitchBot color is "r:g:b". When all-zero the bulb is in white/CCT mode,
// so fall back to a warm/cool tone derived from colorTemp.
function swatch(color?: string | null, colorTemp?: number | null): string {
  if (color && /^\d+:\d+:\d+$/.test(color)) {
    const [r, g, b] = color.split(':').map(Number);
    if (r || g || b) return `rgb(${r}, ${g}, ${b})`;
  }
  if (colorTemp != null) {
    // 2700K (warm) → 6500K (cool), simple lerp between amber and pale blue
    const t = clamp((colorTemp - 2700) / (6500 - 2700), 0, 1);
    const r = Math.round(255 - t * 40);
    const g = Math.round(200 + t * 40);
    const b = Math.round(140 + t * 115);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return 'var(--track)';
}

export function LightTile({ device }: { device: HomeDevice }) {
  const on = device.on === true;
  const tone = swatch(device.color, device.colorTemp);
  const br = device.brightness ?? 0;

  return (
    <DeviceCard
      device={device}
      accent={C.accent3}
      head={<StatePill on={device.on} />}
    >
      <div className="light-main">
        <span
          className="light-bulb"
          style={{ background: on ? tone : 'var(--track)', boxShadow: on ? `0 0 24px ${tone}` : 'none' }}
        />
        <div className="light-info">
          <div className="big-mini" style={{ color: on ? 'var(--text)' : 'var(--dim)' }}>
            {device.brightness != null ? `${device.brightness}%` : on ? 'ON' : 'OFF'}
          </div>
          <div className="climate-label">明るさ</div>
        </div>
      </div>

      <div style={{ marginTop: 4 }}>
        <Bar pct={on ? br : 0} color={tone} />
      </div>

      <div className="stat-row">
        <Stat label="状態" value={on ? 'ON' : 'OFF'} />
        {device.colorTemp != null && <Stat label="色温度" value={`${device.colorTemp}K`} />}
      </div>
    </DeviceCard>
  );
}
