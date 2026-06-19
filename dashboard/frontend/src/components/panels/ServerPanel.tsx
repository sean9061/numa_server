import { CpuTile } from '../tiles/CpuTile';
import { GpuTile } from '../tiles/GpuTile';
import { PowerTile } from '../tiles/PowerTile';
import { RamTile } from '../tiles/RamTile';
import { NetworkTile } from '../tiles/NetworkTile';
import { DiskTile } from '../tiles/DiskTile';
import { LoadTile } from '../tiles/LoadTile';

export function ServerPanel() {
  return (
    <main className="grid">
      <CpuTile />
      <GpuTile />
      <PowerTile />
      <RamTile />
      <NetworkTile />
      <DiskTile />
      <LoadTile />
    </main>
  );
}
