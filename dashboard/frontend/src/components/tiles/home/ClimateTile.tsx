import type { HomeDevice } from '../../../types';
import { C, HIST_DISPLAY } from '../../../constants';
import { useHomeHistory, deviceSeries } from '../../../hooks/useHomeHistory';
import { downsample } from '../../../utils';
import { LineSet } from '../../charts';
import { Stat } from '../../ui';
import { DeviceCard } from './DeviceCard';

export function ClimateTile({ device }: { device: HomeDevice }) {
  const hist = useHomeHistory();
  const temp = downsample(deviceSeries(hist, device.deviceId, 'temperature'), HIST_DISPLAY);
  const humi = downsample(deviceSeries(hist, device.deviceId, 'humidity'), HIST_DISPLAY);

  const t = device.temperature;
  const tColor = t == null ? C.text : t >= 28 ? C.crit : t <= 18 ? C.accent : C.gold;

  return (
    <DeviceCard device={device} accent={C.gold}>
      <div className="climate-main">
        <div className="climate-temp" style={{ color: tColor }}>
          {t != null ? t.toFixed(1) : '—'}<span className="climate-unit">°C</span>
        </div>
        <div className="climate-side">
          <div className="climate-humi">
            <span className="big-mini" style={{ color: C.accent }}>{device.humidity ?? '—'}</span>
            <span className="unit">%</span>
            <span className="climate-label">湿度</span>
          </div>
        </div>
      </div>

      <div className="chart sm">
        <LineSet
          series={[
            { key: 'temp', color: C.gold, data: temp, fill: true },
            { key: 'humi', color: C.accent, data: humi, fill: false },
          ]}
        />
      </div>

      <div className="stat-row">
        <Stat label="温度" value={<span style={{ color: C.gold }}>{t != null ? `${t.toFixed(1)}°C` : '—'}</span>} />
        <Stat label="湿度" value={<span style={{ color: C.accent }}>{device.humidity != null ? `${device.humidity}%` : '—'}</span>} />
        {device.lightLevel != null && <Stat label="照度" value={`${device.lightLevel}`} />}
      </div>
    </DeviceCard>
  );
}
