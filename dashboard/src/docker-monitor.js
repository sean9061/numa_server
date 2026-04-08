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
