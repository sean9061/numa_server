import { useStore } from '../../store/useStore';
import type { HomeKind } from '../../types';
import { DeviceTile } from '../tiles/home';

const ORDER: Record<HomeKind, number> = {
  climate: 0, plug: 1, light: 2, lock: 3, bot: 4, keypad: 5, generic: 6,
};

export function HomePanel() {
  const home = useStore(s => s.home);

  if (home && !home.enabled) {
    return <main className="home-empty">SwitchBot が未設定です（.env に SWITCHBOT_TOKEN / SWITCHBOT_SECRET を設定）</main>;
  }
  if (!home || home.devices.length === 0) {
    return <main className="home-empty">{home?.error ?? 'デバイスを取得中…'}</main>;
  }

  const devices = [...home.devices].sort(
    (a, b) => (ORDER[a.kind] - ORDER[b.kind]) || a.name.localeCompare(b.name)
  );

  return (
    <main className="home-grid">
      {devices.map(d => <DeviceTile key={d.deviceId} device={d} />)}
    </main>
  );
}
