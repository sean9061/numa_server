import { useStore } from '../store/useStore';
import type { HomeHistoryEntry } from '../types';

/**
 * Home (SwitchBot) history slice honoring the selected range:
 *   - homeExtRangeMs != null → extended history from /api/home/history
 *   - otherwise              → live ring buffer, last `homeTimeWindow` points
 */
export function useHomeHistory(): HomeHistoryEntry[] {
  const history    = useStore(s => s.homeHistory);
  const timeWindow = useStore(s => s.homeTimeWindow);
  const extHistory = useStore(s => s.homeExtHistory);
  const extRangeMs = useStore(s => s.homeExtRangeMs);

  if (extRangeMs != null) return extHistory ?? [];
  return history.slice(-timeWindow);
}

type NumField = 'temperature' | 'humidity' | 'lightLevel' | 'power' | 'voltage' | 'current' | 'battery' | 'brightness';

/** Extract a single device's numeric series from a home-history slice. */
export function deviceSeries(history: HomeHistoryEntry[], deviceId: string, field: NumField): (number | null)[] {
  return history.map(e => e.devices.find(d => d.deviceId === deviceId)?.[field] ?? null);
}
