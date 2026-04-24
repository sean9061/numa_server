import Dockerode from 'dockerode';
import { readdir, stat, open } from 'fs/promises';
import { join } from 'path';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

// Active log stream handles per container
const activeStreams = new Map();

// Previous blkio values for rate calculation
const prevBlkio = new Map(); // name -> { read, write, time }

export async function listContainers() {
  const list = await docker.listContainers({ all: true });
  return list.map(c => ({
    id: c.Id.slice(0, 12),
    name: (c.Names[0] ?? '').replace(/^\//, ''),
    image: c.Image.split(':')[0],
    state: c.State,       // running, exited, paused, etc.
    status: c.Status,     // "Up 2 hours", "Exited (0) 5 days ago"
    created: c.Created,
  }));
}

export async function getContainerStats(nameOrId) {
  try {
    const container = docker.getContainer(nameOrId);
    const stats = await container.stats({ stream: false });

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const sysDelta = (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0);
    const numCpus = stats.cpu_stats.online_cpus ?? stats.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
    const cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * numCpus * 100 : 0;

    const memUsed = stats.memory_stats.usage - (stats.memory_stats.stats?.cache ?? 0);
    const memLimit = stats.memory_stats.limit;

    // Disk I/O rate from blkio_stats
    const blkio = stats.blkio_stats?.io_service_bytes_recursive ?? [];
    const readBytes  = blkio.filter(e => e.op === 'Read').reduce((s, e) => s + e.value, 0);
    const writeBytes = blkio.filter(e => e.op === 'Write').reduce((s, e) => s + e.value, 0);
    const now = Date.now();
    const prev = prevBlkio.get(nameOrId);
    let disk_r_sec = null, disk_w_sec = null;
    if (prev) {
      const dt = (now - prev.time) / 1000;
      if (dt > 0) {
        disk_r_sec = Math.max(0, Math.round((readBytes  - prev.read)  / dt));
        disk_w_sec = Math.max(0, Math.round((writeBytes - prev.write) / dt));
      }
    }
    prevBlkio.set(nameOrId, { read: readBytes, write: writeBytes, time: now });

    return {
      cpu: Math.round(cpuPercent * 10) / 10,
      mem_used: memUsed,
      mem_total: memLimit,
      mem_percent: memLimit > 0 ? Math.round((memUsed / memLimit) * 100) : 0,
      disk_r_sec,
      disk_w_sec,
    };
  } catch {
    return null;
  }
}

export async function containerAction(nameOrId, action) {
  const c = docker.getContainer(nameOrId);
  if (action === 'start')   await c.start();
  if (action === 'stop')    await c.stop();
  if (action === 'restart') await c.restart();
}

// ── Web request tracking (NPM access log files, server-side) ─────────────────

const NPM_LOG_DIR = process.env.NPM_LOG_DIR ?? '/npm-logs';
const HTTP_METHODS_RE = /\s(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT)\s/;

let webReqWindow = []; // timestamps of HTTP requests (last 60 minutes)
const filePositions = new Map(); // filepath -> byte offset

export function getWebStats() {
  const now = Date.now();
  return {
    rpm:      webReqWindow.filter(t => t > now - 60_000).length,
    total_1h: webReqWindow.length,
  };
}

async function tailNewLines(filepath) {
  try {
    const s = await stat(filepath);
    const prevPos = filePositions.get(filepath);

    // First visit: start from end (don't replay old logs)
    if (prevPos === undefined) {
      filePositions.set(filepath, s.size);
      return [];
    }

    if (s.size <= prevPos) {
      // File was truncated/rotated — reset position
      filePositions.set(filepath, s.size);
      return [];
    }

    const length = s.size - prevPos;
    const fh = await open(filepath, 'r');
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, prevPos);
    await fh.close();

    filePositions.set(filepath, s.size);
    return buf.toString('utf-8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function pollNpmLogs() {
  try {
    const files = await readdir(NPM_LOG_DIR);
    const accessLogs = files.filter(f => f.endsWith('_access.log'));

    const now = Date.now();
    for (const file of accessLogs) {
      const lines = await tailNewLines(join(NPM_LOG_DIR, file));
      for (const line of lines) {
        if (HTTP_METHODS_RE.test(line)) webReqWindow.push(now);
      }
    }

    const cutoff = now - 3_600_000;
    if (webReqWindow.length > 0 && webReqWindow[0] < cutoff) {
      webReqWindow = webReqWindow.filter(t => t > cutoff);
    }
  } catch {
    // log dir not yet accessible, silently skip
  }
}

export function startNpmTracking() {
  pollNpmLogs();
  setInterval(pollNpmLogs, 5_000);
}

// ── Container log streaming ────────────────────────────────────────────────────

/**
 * Stream logs from a container, calling onLine for each log line.
 * Returns a stop function.
 */
export function streamContainerLogs(nameOrId, onLine) {
  const key = nameOrId;
  if (activeStreams.has(key)) {
    activeStreams.get(key).destroy();
    activeStreams.delete(key);
  }

  const container = docker.getContainer(nameOrId);
  container.logs(
    { follow: true, stdout: true, stderr: true, tail: 30 },
    (err, stream) => {
      if (err || !stream) return;
      activeStreams.set(key, stream);

      const writeable = (data) => {
        const text = data.toString('utf-8').trimEnd();
        if (text) onLine(text);
      };

      docker.modem.demuxStream(stream, { write: writeable }, { write: writeable });

      stream.on('end', () => activeStreams.delete(key));
      stream.on('error', () => activeStreams.delete(key));
    }
  );

  return () => {
    const s = activeStreams.get(key);
    if (s) { s.destroy(); activeStreams.delete(key); }
  };
}
