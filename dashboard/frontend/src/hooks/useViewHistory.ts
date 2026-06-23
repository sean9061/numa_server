import { useStore } from '../store/useStore';
import type { HistoryEntry } from '../types';

/**
 * Returns the history slice the charts should render, honoring the
 * selected time range:
 *   - extRangeMs != null → extended history fetched from /api/history
 *   - otherwise          → the live ring buffer, last `timeWindow` points
 * Tiles downsample the result to HIST_DISPLAY points for rendering.
 */
export function useViewHistory(): HistoryEntry[] {
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);
  const extHistory = useStore(s => s.extHistory);
  const extRangeMs = useStore(s => s.extRangeMs);

  if (extRangeMs != null) return extHistory ?? [];
  return history.slice(-timeWindow);
}
