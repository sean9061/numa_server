import type { HomeDevice } from '../../../types';
import { C } from '../../../constants';
import { Stat } from '../../ui';
import { DeviceCard } from './DeviceCard';

const IconLock = ({ locked }: { locked: boolean }) => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    {locked
      ? <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      : <path d="M8 11V7a4 4 0 0 1 8 0" />}
    <circle cx="12" cy="16" r="1.4" fill="currentColor" />
  </svg>
);

const LOCK_LABEL: Record<string, string> = { locked: '施錠', unlocked: '解錠', jammed: '異常' };
const DOOR_LABEL: Record<string, string> = { closed: '閉', open: '開', timeout: 'タイムアウト' };

export function LockTile({ device }: { device: HomeDevice }) {
  const locked = device.lockState === 'locked';
  const color = locked ? C.accent : C.crit;
  const doorOpen = device.doorState === 'open';

  return (
    <DeviceCard device={device} accent={C.accent2}>
      <div className="lock-main" style={{ color }}>
        <IconLock locked={locked} />
        <div className="lock-state">{LOCK_LABEL[device.lockState ?? ''] ?? device.lockState ?? '—'}</div>
      </div>

      <div className="stat-row">
        <Stat
          label="ドア"
          value={<span style={{ color: doorOpen ? C.crit : C.text }}>{DOOR_LABEL[device.doorState ?? ''] ?? device.doorState ?? '—'}</span>}
        />
        <Stat label="電池" value={device.battery != null ? `${device.battery}%` : '—'} />
      </div>
    </DeviceCard>
  );
}
