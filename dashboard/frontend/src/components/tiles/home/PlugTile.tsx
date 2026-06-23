import type { HomeDevice } from '../../../types';
import { C, HIST_DISPLAY } from '../../../constants';
import { useHomeHistory, deviceSeries } from '../../../hooks/useHomeHistory';
import { downsample, fmtW } from '../../../utils';
import { LineSet } from '../../charts';
import { Stat } from '../../ui';
import { DeviceCard, } from './DeviceCard';
import { StatePill } from './StatePill';

export function PlugTile({ device }: { device: HomeDevice }) {
  const hist = useHomeHistory();
  const power = downsample(deviceSeries(hist, device.deviceId, 'power'), HIST_DISPLAY);

  const usedMin = device.energyDay;
  const usedLabel = usedMin != null
    ? usedMin >= 60 ? `${Math.floor(usedMin / 60)}h ${Math.round(usedMin % 60)}m` : `${Math.round(usedMin)}m`
    : '—';

  return (
    <DeviceCard
      device={device}
      accent={C.accent}
      head={<StatePill on={device.on} />}
    >
      <div className="plug-main">
        <span className="big" style={{ color: device.power ? C.gold : C.dim }}>
          {device.power != null ? Math.round(device.power) : '—'}
        </span>
        <span className="unit">W</span>
      </div>

      <div className="chart sm">
        <LineSet series={[{ key: 'power', color: C.gold, data: power, fill: true }]} />
      </div>

      <div className="stat-row">
        <Stat label="電圧" value={device.voltage != null ? `${device.voltage.toFixed(1)} V` : '—'} />
        <Stat label="電流" value={device.current != null ? `${device.current} mA` : '—'} />
        <Stat label="本日稼働" value={usedLabel} />
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--dim)' }}>消費電力 {fmtW(device.power)}</div>
    </DeviceCard>
  );
}
