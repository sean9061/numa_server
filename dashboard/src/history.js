import { readFile, writeFile, mkdir, appendFile, readdir } from 'fs/promises';
import { join } from 'path';

const DATA_DIR    = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const HIST_FILE   = join(DATA_DIR, 'metrics_history.json');
const MAX_ENTRIES = 1800; // 1 hour at 2s intervals

let ring = [];

// Ensure data directory exists at startup before any appends
const dataDirReady = mkdir(DATA_DIR, { recursive: true }).catch(() => {});

export function pushEntry(metrics, webRpm) {
  const entry = {
    ts:        Date.now(),
    cpu:       metrics.cpu?.usage      ?? null,
    cpu_temp:  metrics.cpu?.temp       ?? null,
    cores:     metrics.cpu?.cores      ?? [],
    gpu:       (metrics.gpu ?? []).map(g => ({
      usage:      g.usage,
      temp:       g.temp ?? null,
      vram_pct:   g.vram_total > 0 ? Math.round((g.vram_used / g.vram_total) * 100) : null,
      vram_used:  g.vram_used,
      vram_total: g.vram_total,
    })),
    ram:         metrics.ram?.percent   ?? null,
    ram_used:    metrics.ram?.used      ?? null,
    ram_cached:  metrics.ram?.cached    ?? null,
    ram_buffers: metrics.ram?.buffers   ?? null,
    swap_used:   metrics.ram?.swap_used ?? null,
    net_rx:    metrics.network?.rx_sec ?? null,
    net_tx:    metrics.network?.tx_sec ?? null,
    disk_rx:   metrics.disk_io?.rx_sec ?? null,
    disk_wx:   metrics.disk_io?.wx_sec ?? null,
    pow_total: metrics.power?.total    ?? null,
    pow_cpu:   metrics.power?.cpu      ?? null,
    pow_gpu:   metrics.power?.gpu      ?? null,
    portfolio_rpm: webRpm ?? null,
  };

  ring.push(entry);
  if (ring.length > MAX_ENTRIES) ring.shift();

  // Permanent append to daily log — fire and forget
  const date = new Date(entry.ts).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  dataDirReady
    .then(() => appendFile(join(DATA_DIR, `metrics_${date}.jsonl`), JSON.stringify(entry) + '\n'))
    .catch(err => console.error('[history] Append failed:', err.message));
}

export function getEntries() {
  return ring;
}

// Query history from JSONL files with server-side bucket aggregation
export async function queryHistory(fromTs, toTs, buckets) {
  let allFiles;
  try {
    allFiles = await readdir(DATA_DIR);
  } catch {
    return [];
  }

  const pattern = /^metrics_(\d{4}-\d{2}-\d{2})\.jsonl$/;
  const files = allFiles
    .filter(f => {
      const m = f.match(pattern);
      if (!m) return false;
      const dayStart = new Date(m[1] + 'T00:00:00Z').getTime();
      const dayEnd   = dayStart + 86_400_000;
      return dayEnd >= fromTs && dayStart <= toTs;
    })
    .sort();

  const entries = [];
  for (const file of files) {
    try {
      const content = await readFile(join(DATA_DIR, file), 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          if (e.ts >= fromTs && e.ts <= toTs) entries.push(e);
        } catch { /* skip malformed lines */ }
      }
    } catch { /* file not found or unreadable */ }
  }

  if (entries.length === 0) return [];
  if (entries.length <= buckets) return entries;

  // Aggregate into time buckets
  const span       = toTs - fromTs;
  const bucketSpan = span / buckets;

  return Array.from({ length: buckets }, (_, i) => {
    const bFrom = fromTs + i * bucketSpan;
    const bTo   = bFrom + bucketSpan;
    const mid   = Math.round(bFrom + bucketSpan / 2);
    const slice = entries.filter(e => e.ts >= bFrom && e.ts < bTo);

    if (slice.length === 0) {
      return { ts: mid, cpu: null, cpu_temp: null, ram: null, ram_used: null,
               ram_cached: null, ram_buffers: null, swap_used: null,
               net_rx: null, net_tx: null, disk_rx: null, disk_wx: null,
               pow_total: null, pow_cpu: null, pow_gpu: null, gpu: [], cores: [] };
    }

    const avg = key => {
      const vals = slice.map(e => e[key]).filter(v => v != null && typeof v === 'number');
      return vals.length ? Math.round(vals.reduce((a, b) => a + b) / vals.length * 10) / 10 : null;
    };

    const coreCount = Math.max(...slice.map(e => e.cores?.length ?? 0));
    const cores = Array.from({ length: coreCount }, (_, ci) => {
      const vals = slice.map(e => e.cores?.[ci]).filter(v => v != null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : null;
    });

    const midEntry = slice[Math.floor(slice.length / 2)];

    return {
      ts:        mid,
      cpu:       avg('cpu'),
      cpu_temp:  avg('cpu_temp'),
      ram:       avg('ram'),
      ram_used:    avg('ram_used'),
      ram_cached:  avg('ram_cached'),
      ram_buffers: avg('ram_buffers'),
      swap_used:   avg('swap_used'),
      net_rx:    avg('net_rx'),
      net_tx:    avg('net_tx'),
      disk_rx:   avg('disk_rx'),
      disk_wx:   avg('disk_wx'),
      pow_total: avg('pow_total'),
      pow_cpu:   avg('pow_cpu'),
      pow_gpu:   avg('pow_gpu'),
      gpu:       midEntry?.gpu ?? [],
      cores,
    };
  });
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
