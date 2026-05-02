import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const DATA_DIR    = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const HIST_FILE   = join(DATA_DIR, 'metrics_history.json');
const MAX_ENTRIES = 1800; // 1 hour at 2s intervals

let ring = [];

export function pushEntry(metrics, webRpm) {
  ring.push({
    ts:      Date.now(),
    cpu:     metrics.cpu?.usage   ?? null,
    cores:   metrics.cpu?.cores   ?? [],
    gpu:     (metrics.gpu ?? []).map(g => ({
      usage:      g.usage,
      vram_pct:   g.vram_total > 0 ? Math.round((g.vram_used / g.vram_total) * 100) : null,
      vram_used:  g.vram_used,
      vram_total: g.vram_total,
    })),
    ram:     metrics.ram?.percent     ?? null,
    net_rx:  metrics.network?.rx_sec  ?? null,
    net_tx:  metrics.network?.tx_sec  ?? null,
    disk_rx: metrics.disk_io?.rx_sec  ?? null,
    disk_wx: metrics.disk_io?.wx_sec  ?? null,
    portfolio_rpm: webRpm ?? null,
  });
  if (ring.length > MAX_ENTRIES) ring.shift();
}

export function getEntries() {
  return ring;
}

export async function loadFromDisk() {
  try {
    const raw = await readFile(HIST_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      ring = data.slice(-MAX_ENTRIES);
      console.log(`[history] Loaded ${ring.length} entries`);
    }
  } catch {
    // No history file yet — start fresh
  }
}

export async function saveToDisk() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(HIST_FILE, JSON.stringify(ring));
  } catch (err) {
    console.error('[history] Save failed:', err.message);
  }
}
