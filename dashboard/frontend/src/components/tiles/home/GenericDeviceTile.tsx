import type { HomeDevice } from '../../../types';
import { C } from '../../../constants';
import { Stat } from '../../ui';
import { DeviceCard } from './DeviceCard';
import { StatePill } from './StatePill';

// Fallback tile for Bot / Keypad / any future device type. Shows whatever
// fields the API happens to return so new devices appear without code changes.
export function GenericDeviceTile({ device }: { device: HomeDevice }) {
  const stats: { label: string; value: string }[] = [];
  if (device.mode      != null) stats.push({ label: 'モード',  value: device.mode });
  if (device.battery   != null) stats.push({ label: '電池',    value: `${device.battery}%` });
  if (device.temperature != null) stats.push({ label: '温度',  value: `${device.temperature.toFixed(1)}°C` });
  if (device.humidity  != null) stats.push({ label: '湿度',    value: `${device.humidity}%` });

  return (
    <DeviceCard
      device={device}
      accent={C.dim}
      head={device.on != null ? <StatePill on={device.on} /> : undefined}
    >
      {device.on != null && (
        <div className="generic-main">
          <span className="big-mini" style={{ color: device.on ? C.accent : C.dim }}>
            {device.on ? 'ON' : 'OFF'}
          </span>
        </div>
      )}
      <div className="stat-row wrap">
        {stats.length > 0
          ? stats.map(s => <Stat key={s.label} label={s.label} value={s.value} />)
          : <span style={{ fontSize: 11, color: 'var(--dim)' }}>データなし</span>}
      </div>
    </DeviceCard>
  );
}
