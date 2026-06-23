// Persistence for HOME (SwitchBot) sensor history. Mirrors history.js:
// in-memory ring for the live view + permanent daily JSONL append. Polling is
// slow (~90s) so volume is tiny (~1k entries/day/device).
import { readFile, writeFile, mkdir, appendFile, readdir } from 'fs/promises';
import { join } from 'path';

const DATA_DIR    = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const HIST_FILE   = join(DATA_DIR, 'home_history.json');
const MAX_ENTRIES = 1440; // ~1.5 days at 90s — enough for the live ring

// Only numeric fields worth charting are persisted per device.
const NUM_FIELDS = ['temperature', 'humidity', 'lightLevel', 'power', 'voltage', 'current', 'battery', 'brightness'];

let ring = [];

const dataDirReady = mkdir(DATA_DIR, { recursive: true }).catch(() => {});

function snapshot(devices) {
  return {
    ts: Date.now(),
    devices: devices.map(d => {
      const o = { deviceId: d.deviceId };
      for (const f of NUM_FIELDS) if (d[f] != null) o[f] = d[f];
      return o;
    }),
  };
}

export function pushHomeEntry(devices) {
  const entry = snapshot(devices);
  ring.push(entry);
  if (ring.length > MAX_ENTRIES) ring.shift();

  const date = new Date(entry.ts).toISOString().slice(0, 10);
  dataDirReady
    .then(() => appendFile(join(DATA_DIR, `home_${date}.jsonl`), JSON.stringify(entry) + '\n'))
    .catch(err => console.error('[home-history] Append failed:', err.message));
}

export function getHomeEntries() {
  return ring;
}

// Read JSONL files overlapping [fromTs, toTs] and aggregate into `buckets`
// time buckets, averaging each numeric field per device.
export async function queryHomeHistory(fromTs, toTs, buckets) {
  let allFiles;
  try {
    allFiles = await readdir(DATA_DIR);
  } catch {
    return [];
  }

  const pattern = /^home_(\d{4}-\d{2}-\d{2})\.jsonl$/;
  const files = allFiles
    .filter(f => {
      const m = f.match(pattern);
      if (!m) return false;
      const dayStart = new Date(m[1] + 'T00:00:00Z').getTime();
      return dayStart + 86_400_000 >= fromTs && dayStart <= toTs;
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
        } catch { /* skip malformed */ }
      }
    } catch { /* unreadable */ }
  }

  if (entries.length === 0) return [];
  if (entries.length <= buckets) return entries;

  const span       = toTs - fromTs;
  const bucketSpan = span / buckets;

  return Array.from({ length: buckets }, (_, i) => {
    const bFrom = fromTs + i * bucketSpan;
    const bTo   = bFrom + bucketSpan;
    const mid   = Math.round(bFrom + bucketSpan / 2);
    const slice = entries.filter(e => e.ts >= bFrom && e.ts < bTo);

    if (slice.length === 0) return { ts: mid, devices: [] };

    // Union of device ids in this bucket, each field averaged.
    const ids = [...new Set(slice.flatMap(e => e.devices.map(d => d.deviceId)))];
    const devices = ids.map(id => {
      const o = { deviceId: id };
      for (const f of NUM_FIELDS) {
        const vals = slice
          .map(e => e.devices.find(d => d.deviceId === id)?.[f])
          .filter(v => typeof v === 'number');
        if (vals.length) o[f] = Math.round((vals.reduce((a, b) => a + b) / vals.length) * 10) / 10;
      }
      return o;
    });
    return { ts: mid, devices };
  });
}

export async function loadHomeFromDisk() {
  try {
    const data = JSON.parse(await readFile(HIST_FILE, 'utf-8'));
    if (Array.isArray(data)) {
      ring = data.slice(-MAX_ENTRIES);
      console.log(`[home-history] Loaded ${ring.length} entries`);
    }
  } catch {
    // none yet
  }
}

export async function saveHomeToDisk() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(HIST_FILE, JSON.stringify(ring));
  } catch (err) {
    console.error('[home-history] Save failed:', err.message);
  }
}
