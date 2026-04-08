import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';

const exec = promisify(execFile);

// State for delta calculations
let prevCpuStats = null;
let prevNetStats = null;
let prevNetTime = null;
let prevRaplEnergy = null;
let prevRaplTime = null;

// CPU usage from /proc/stat
async function getCpuUsage() {
  const content = await readFile('/proc/stat', 'utf-8');
  const line = content.split('\n')[0].split(/\s+/).slice(1).map(Number);
  const [user, nice, sys, idle, iowait, irq, softirq, steal] = line;
  const total = user + nice + sys + idle + iowait + irq + softirq + (steal ?? 0);
  const busy = total - idle - (iowait ?? 0);

  let usage = null;
  if (prevCpuStats) {
    const dt = total - prevCpuStats.total;
    const db = busy - prevCpuStats.busy;
    usage = dt > 0 ? Math.min(100, Math.round((db / dt) * 100)) : 0;
  }
  prevCpuStats = { total, busy };
  return usage;
}

// Memory from /proc/meminfo
async function getMemory() {
  const content = await readFile('/proc/meminfo', 'utf-8');
  const kv = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+)/);
    if (m) kv[m[1]] = parseInt(m[2]) * 1024;
  }
  const total = kv.MemTotal ?? 0;
  const available = kv.MemAvailable ?? 0;
  const used = total - available;
  return {
    total,
    used,
    available,
    percent: total > 0 ? Math.round((used / total) * 100) : 0,
    swap_total: kv.SwapTotal ?? 0,
    swap_used: (kv.SwapTotal ?? 0) - (kv.SwapFree ?? 0),
    cached: kv.Cached ?? 0,
    buffers: kv.Buffers ?? 0,
  };
}

// Network rates from host via /proc/1/net/dev (accessible with pid: host)
async function getNetworkRate() {
  const now = Date.now();
  try {
    // /proc/1/net/dev is the host init process's network namespace
    const content = await readFile('/proc/1/net/dev', 'utf-8').catch(
      () => readFile('/proc/net/dev', 'utf-8')
    );
    const lines = content.split('\n').slice(2);
    const interfaces = {};
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      const iface = parts[0].replace(':', '');
      interfaces[iface] = { rx: parseInt(parts[1]), tx: parseInt(parts[9]) };
    }

    // Pick primary interface (not loopback, not virtual/container bridges)
    const primary = Object.keys(interfaces).find(n =>
      n !== 'lo' &&
      !n.startsWith('docker') &&
      !n.startsWith('veth') &&
      !n.startsWith('br-') &&
      !n.startsWith('virbr')
    );

    if (!primary) return { rx_sec: 0, tx_sec: 0, iface: 'unknown' };

    const cur = interfaces[primary];
    const result = { rx_sec: 0, tx_sec: 0, iface: primary };

    if (prevNetStats?.iface === primary && prevNetTime) {
      const dt = (now - prevNetTime) / 1000;
      if (dt > 0) {
        result.rx_sec = Math.max(0, Math.round((cur.rx - prevNetStats.rx) / dt));
        result.tx_sec = Math.max(0, Math.round((cur.tx - prevNetStats.tx) / dt));
      }
    }

    prevNetStats = { iface: primary, ...cur };
    prevNetTime = now;
    return result;
  } catch {
    return { rx_sec: 0, tx_sec: 0, iface: 'unknown' };
  }
}

// GPU via nvidia-smi
async function getGpu() {
  try {
    const { stdout } = await exec(
      'nvidia-smi',
      ['--query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,power.limit',
       '--format=csv,noheader,nounits'],
      { timeout: 5000 }
    );
    const nv = s => { const v = parseFloat(s.trim()); return isNaN(v) ? null : v; };
    const parts = stdout.trim().split(',').map(nv);
    if (parts.length < 4 || parts[0] == null || parts[3] == null) return null;
    return {
      usage:       parts[0],
      mem_usage:   parts[1],
      vram_used:   parts[2],
      vram_total:  parts[3],
      temp:        parts[4],
      power_draw:  parts[5],
      power_limit: parts[6],
    };
  } catch {
    return null;
  }
}

// CPU temperature from /sys/class/thermal
async function getCpuTemp() {
  try {
    const zones = [];
    for (let i = 0; i < 30; i++) {
      try {
        const [temp, type] = await Promise.all([
          readFile(`/sys/class/thermal/thermal_zone${i}/temp`, 'utf-8'),
          readFile(`/sys/class/thermal/thermal_zone${i}/type`, 'utf-8'),
        ]);
        zones.push({ type: type.trim(), temp: parseInt(temp.trim()) / 1000 });
      } catch {
        break;
      }
    }
    // Prefer package/die temperature
    const cpu = zones.find(z => /x86_pkg|cpu|package|core/i.test(z.type));
    return cpu?.temp ?? zones[0]?.temp ?? null;
  } catch {
    return null;
  }
}

// CPU power via Intel RAPL
async function getCpuPower() {
  const now = Date.now();
  try {
    const raw = await readFile('/sys/class/powercap/intel-rapl/intel-rapl:0/energy_uj', 'utf-8');
    const energy = parseInt(raw.trim());

    let watts = null;
    if (prevRaplEnergy !== null && prevRaplTime !== null) {
      const dE = energy - prevRaplEnergy;
      const dt = (now - prevRaplTime) / 1000;
      if (dt > 0 && dE >= 0) watts = Math.round((dE / 1e6 / dt) * 10) / 10;
    }
    prevRaplEnergy = energy;
    prevRaplTime = now;
    return watts;
  } catch {
    return null;
  }
}

// Disk usage
async function getDisk() {
  try {
    const disks = await si.fsSize();
    const realFs = ['ext4', 'xfs', 'btrfs', 'ext3', 'ext2', 'vfat', 'ntfs', 'f2fs', 'zfs', 'apfs'];
    return disks
      .filter(d => realFs.includes(d.type))
      .map(d => ({ mount: d.mount, type: d.type, used: d.used, size: d.size, percent: Math.round(d.use) }));
  } catch {
    return [];
  }
}

// Load average from /proc/loadavg
async function getLoadAvg() {
  try {
    const parts = (await readFile('/proc/loadavg', 'utf-8')).split(' ');
    return { m1: parseFloat(parts[0]), m5: parseFloat(parts[1]), m15: parseFloat(parts[2]) };
  } catch {
    return null;
  }
}

// System uptime in seconds
async function getUptime() {
  try {
    const val = (await readFile('/proc/uptime', 'utf-8')).split(' ')[0];
    return Math.floor(parseFloat(val));
  } catch {
    return null;
  }
}

export async function collectMetrics() {
  const results = await Promise.allSettled([
    getCpuUsage(),   // 0
    getMemory(),     // 1
    getNetworkRate(),// 2
    getGpu(),        // 3
    getCpuTemp(),    // 4
    getCpuPower(),   // 5
    getDisk(),       // 6
    getLoadAvg(),    // 7
    getUptime(),     // 8
  ]);

  const v = (i) => results[i].status === 'fulfilled' ? results[i].value : null;

  return {
    cpu:      { usage: v(0), temp: v(4), power: v(5) },
    gpu:      v(3),
    ram:      v(1),
    network:  v(2) ?? { rx_sec: 0, tx_sec: 0, iface: 'unknown' },
    disk:     v(6) ?? [],
    load:     v(7),
    uptime:   v(8),
    timestamp: Date.now(),
  };
}
