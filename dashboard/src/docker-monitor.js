import Dockerode from 'dockerode';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

// Active log stream handles per container
const activeStreams = new Map();

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

    return {
      cpu: Math.round(cpuPercent * 10) / 10,
      mem_used: memUsed,
      mem_total: memLimit,
      mem_percent: memLimit > 0 ? Math.round((memUsed / memLimit) * 100) : 0,
    };
  } catch {
    return null;
  }
}

// ── Web request tracking (NPM access logs, server-side) ───────────────────────

let webReqWindow = []; // timestamps of HTTP requests (last 60 minutes)
const HTTP_METHODS_RE = /"(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT)\s/;

export function getWebStats() {
  const now = Date.now();
  return {
    rpm:      webReqWindow.filter(t => t > now - 60_000).length,
    total_1h: webReqWindow.length,
  };
}

export function startNpmTracking() {
  docker.listContainers({ all: false }, (err, list) => {
    if (err || !list) {
      setTimeout(startNpmTracking, 15_000);
      return;
    }

    const npm = list.find(c => c.Image.includes('nginx-proxy-manager'));
    if (!npm) {
      console.log('[web-tracking] NPM container not found, retrying in 30s');
      setTimeout(startNpmTracking, 30_000);
      return;
    }

    docker.getContainer(npm.Id).logs(
      { follow: true, stdout: true, stderr: false, tail: 0 },
      (err, stream) => {
        if (err || !stream) {
          console.error('[web-tracking] Log attach failed:', err?.message);
          setTimeout(startNpmTracking, 15_000);
          return;
        }

        docker.modem.demuxStream(stream, {
          write(chunk) {
            const now = Date.now();
            for (const line of chunk.toString('utf-8').split('\n')) {
              if (HTTP_METHODS_RE.test(line)) webReqWindow.push(now);
            }
            // keep only last 60 minutes
            const cutoff = now - 3_600_000;
            if (webReqWindow.length > 0 && webReqWindow[0] < cutoff) {
              webReqWindow = webReqWindow.filter(t => t > cutoff);
            }
          },
        }, { write() {} });

        stream.on('end',   () => { console.log('[web-tracking] stream ended, reconnecting'); setTimeout(startNpmTracking, 5_000); });
        stream.on('error', () => setTimeout(startNpmTracking, 5_000));
      }
    );
  });
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
