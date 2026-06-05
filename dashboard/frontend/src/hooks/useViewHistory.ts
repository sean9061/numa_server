import { useStore } from '../store/useStore';
import type { HistoryEntry } from '../types';

export function useViewHistory(): HistoryEntry[] {
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);
  const extHistory = useStore(s => s.extHistory);
  const extRangeMs = useStore(s => s.extRangeMs);
  return extRangeMs != null ? (extHistory ?? []) : history.slice(-timeWindow);
}
