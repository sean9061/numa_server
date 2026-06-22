import type { HomeDevice } from '../../../types';
import { ClimateTile } from './ClimateTile';
import { PlugTile } from './PlugTile';
import { LightTile } from './LightTile';
import { LockTile } from './LockTile';
import { GenericDeviceTile } from './GenericDeviceTile';

/** Pick the right tile renderer for a device's kind. */
export function DeviceTile({ device }: { device: HomeDevice }) {
  switch (device.kind) {
    case 'climate': return <ClimateTile device={device} />;
    case 'plug':    return <PlugTile device={device} />;
    case 'light':   return <LightTile device={device} />;
    case 'lock':    return <LockTile device={device} />;
    default:        return <GenericDeviceTile device={device} />;
  }
}
