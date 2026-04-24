// ── Auth guard ───────────────────────────────────────────────────────────────
fetch('/auth/check').then(r => r.json()).then(d => {
  if (!d.authenticated) location.href = '/login.html';
}).catch(() => { location.href = '/login.html'; });

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  location.href = '/login.html';
}

// ── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ── Panel toggle ──────────────────────────────────────────────────────────────
let activePanel = 'server';

function switchPanel(name) {
  activePanel = name;
  document.getElementById('panel-server').style.display   = name === 'server'   ? 'grid' : 'none';
  document.getElementById('panel-services').style.display = name === 'services' ? 'flex' : 'none';
  document.querySelectorAll('.pt-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.panel === name)
  );
  // When switching to services, re-subscribe to active service logs
  if (name === 'services' && selectedService) {
    ws?.send(JSON.stringify({ type: 'subscribe_logs', container: selectedService }));
  }
}

// ── Gauge helpers ─────────────────────────────────────────────────────────────
const GAUGE_LEN = 204.2; // π × 65

function setGauge(id, pct, defaultColor) {
  const el = document.getElementById(id);
  if (!el) return;
  const p = Math.min(100, Math.max(0, pct ?? 0));
  el.setAttribute('stroke-dasharray', `${((p / 100) * GAUGE_LEN).toFixed(1)} ${GAUGE_LEN}`);
  el.style.stroke = p >= 85 ? 'var(--red)' : p >= 65 ? 'var(--amber)' : defaultColor;
}

function colorClass(pct) {
  if (pct >= 85) return 'color-crit';
  if (pct >= 65) return 'color-warn';
  return 'color-ok';
}

function setText(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (cls) el.className = cls;
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function fmtMB(mb) {
  if (mb == null) return '—';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function fmtBps(bps) {
  if (bps == null) return '—';
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}

function fmtUptime(s) {
  if (!s) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── History buffer ────────────────────────────────────────────────────────────
const MAX_HIST   = 1800;
let historyBuffer = [];
let timeWindow    = 60;   // data points currently displayed

function pushHistory(d) {
  historyBuffer.push({
    ts:      d.timestamp ?? Date.now(),
    cpu:     d.cpu?.usage   ?? null,
    cores:   d.cpu?.cores   ?? [],
    gpu:     (d.gpu ?? []).map(g => ({
      usage:      g.usage,
      vram_pct:   g.vram_total > 0 ? Math.round((g.vram_used / g.vram_total) * 100) : null,
      vram_used:  g.vram_used,
      vram_total: g.vram_total,
    })),
    ram:     d.ram?.percent     ?? null,
    net_rx:  d.network?.rx_sec  ?? null,
    net_tx:  d.network?.tx_sec  ?? null,
    disk_rx:   d.disk_io?.rx_sec  ?? null,
    disk_wx:   d.disk_io?.wx_sec  ?? null,
    web_rpm:   d.web_rpm          ?? null,
    pow_total: d.power?.total     ?? null,
    pow_cpu:   d.power?.cpu       ?? null,
    pow_gpu:   d.power?.gpu       ?? null,
    pow_dram:  d.power?.dram      ?? null,
  });
  if (historyBuffer.length > MAX_HIST) historyBuffer.shift();
}

function setTimeWindow(pts) {
  timeWindow = pts;
  document.querySelectorAll('.tr-btn').forEach(btn =>
    btn.classList.toggle('active', Number(btn.dataset.pts) === pts)
  );
  rebuildCharts();
}

function rebuildCharts() {
  const entries = historyBuffer.slice(-timeWindow);
  const pad = (arr, fill = null) => {
    const a = arr.slice(-timeWindow);
    return [...Array(Math.max(0, timeWindow - a.length)).fill(fill), ...a];
  };

  const resize = (chart, datasets) => {
    chart.data.labels = Array(timeWindow).fill('');
    datasets.forEach(([dsIdx, data]) => {
      chart.data.datasets[dsIdx].data = data;
    });
    chart.update('none');
  };

  resize(cpuChart, [[0, pad(entries.map(e => e.cpu))]]);
  resize(ramChart, [[0, pad(entries.map(e => e.ram))]]);
  resize(netChart, [
    [0, pad(entries.map(e => e.net_rx ?? 0), 0)],
    [1, pad(entries.map(e => e.net_tx ?? 0), 0)],
  ]);
  resize(webChart, [[0, pad(entries.map(e => e.web_rpm ?? 0), 0)]]);
  resize(diskIOChart, [
    [0, pad(entries.map(e => e.disk_rx ?? 0), 0)],
    [1, pad(entries.map(e => e.disk_wx ?? 0), 0)],
  ]);
  resize(powerChart, [
    [0, pad(entries.map(e => e.pow_total))],
    [1, pad(entries.map(e => e.pow_cpu))],
    [2, pad(entries.map(e => e.pow_gpu))],
    [3, pad(entries.map(e => e.pow_dram))],
  ]);

  if (gpuCardsReady) {
    gpuCharts.forEach((chart, i) =>
      resize(chart, [[0, pad(entries.map(e => e.gpu?.[i]?.usage ?? null))]]));
    vramCharts.forEach((chart, i) =>
      resize(chart, [[0, pad(entries.map(e => e.gpu?.[i]?.vram_pct ?? null))]]));
  }
}

// ── Chart factory ─────────────────────────────────────────────────────────────
const HIST = 60;

const BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: {
    x: { display: false },
    y: { display: false, min: 0 },
  },
  elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 1.5 } },
};

const GPU_COLORS  = ['#818cf8', '#a78bfa'];
const GPU_BG      = ['rgba(129,140,248,0.10)', 'rgba(167,139,250,0.10)'];

function makeSparkline(canvasId, color, bgColor, maxY = 100) {
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: Array(HIST).fill(''),
      datasets: [{ data: Array(HIST).fill(null), borderColor: color,
        backgroundColor: bgColor, fill: true }],
    },
    options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales, y: { display: false, min: 0, max: maxY } } },
  });
}

function makeNetChart(canvasId) {
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: Array(HIST).fill(''),
      datasets: [
        { data: Array(HIST).fill(0), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true },
        { data: Array(HIST).fill(0), borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.08)', fill: true },
      ],
    },
    options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales,
      y: { display: true, min: 0, grid: { color: 'rgba(30,45,74,0.5)' },
           ticks: { color: '#4e6282', font: { size: 9 }, maxTicksLimit: 3,
                    callback: v => fmtBps(v) }, border: { display: false } } } },
  });
}

function makeWebChart(canvasId) {
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: Array(HIST).fill(''),
      datasets: [{ data: Array(HIST).fill(0), borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)', fill: true }],
    },
    options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales,
      y: { display: true, min: 0, grid: { color: 'rgba(30,45,74,0.5)' },
           ticks: { color: '#4e6282', font: { size: 9 }, maxTicksLimit: 3 },
           border: { display: false } } } },
  });
}

function makeDiskIOChart(canvasId) {
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: Array(HIST).fill(''),
      datasets: [
        { data: Array(HIST).fill(0), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true },
        { data: Array(HIST).fill(0), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', fill: true },
      ],
    },
    options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales,
      y: { display: true, min: 0, grid: { color: 'rgba(30,45,74,0.5)' },
           ticks: { color: '#4e6282', font: { size: 9 }, maxTicksLimit: 3,
                    callback: v => fmtBps(v) }, border: { display: false } } } },
  });
}

function makePowerChart(canvasId) {
  const mk = (color, bg, width = 1.5) => ({
    data: Array(HIST).fill(null),
    borderColor: color, backgroundColor: bg,
    fill: false, borderWidth: width, spanGaps: true,
  });
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: Array(HIST).fill(''),
      datasets: [
        mk('#e2e8f0', 'transparent', 2),            // Total (bright white, thicker)
        mk('#3b82f6', 'rgba(59,130,246,0.08)'),     // CPU
        mk('#f59e0b', 'rgba(245,158,11,0.08)'),     // GPU
        mk('#818cf8', 'rgba(129,140,248,0.08)'),    // DRAM
      ],
    },
    options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales,
      y: { display: true, min: 0, grid: { color: 'rgba(30,45,74,0.5)' },
           ticks: { color: '#4e6282', font: { size: 9 }, maxTicksLimit: 4,
                    callback: v => `${v}W` }, border: { display: false } } } },
  });
}

function makeDiskDonut(canvasId) {
  return new Chart(document.getElementById(canvasId), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 0, hoverOffset: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '72%', animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  });
}

// GPU/VRAM charts: initialized dynamically when GPU card is created
const gpuCharts  = [];
const vramCharts = [];

const cpuChart  = makeSparkline('cpu-chart', '#3b82f6', 'rgba(59,130,246,0.10)');
const ramChart  = makeSparkline('ram-chart', '#22c55e', 'rgba(34,197,94,0.10)');
const netChart  = makeNetChart('net-chart');
const webChart  = makeWebChart('web-chart');
const diskChart   = makeDiskDonut('disk-chart');
const diskIOChart = makeDiskIOChart('disk-io-chart');
const powerChart  = makePowerChart('power-chart');

const DISK_COLORS     = ['#3b82f6', '#818cf8', '#22c55e', '#f59e0b', '#ef4444'];
const DISK_COLORS_DIM = ['rgba(59,130,246,0.18)', 'rgba(129,140,248,0.18)', 'rgba(34,197,94,0.18)', 'rgba(245,158,11,0.18)', 'rgba(239,68,68,0.18)'];

function sparkPush(chart, value, dsIdx = 0) {
  chart.data.datasets[dsIdx].data.shift();
  chart.data.datasets[dsIdx].data.push(value ?? null);
  chart.update('none');
}

// ── GPU combined card (dynamic) ───────────────────────────────────────────────
let gpuCardsReady = false;

function initGpuCards(count) {
  if (gpuCardsReady) return;
  gpuCardsReady = true;

  const row = document.getElementById('row-metrics');
  const ramCard = document.getElementById('ram-card');
  // CPU + GPU(combined, wider) + RAM
  row.style.gridTemplateColumns = `1fr 1.6fr 1fr`;

  const card = document.createElement('div');
  card.className = 'card';

  const sections = Array.from({ length: count }, (_, i) => `
    ${i > 0 ? '<div class="gpu-divider"></div>' : ''}
    <div class="gpu-section">
      <div class="gpu-section-header">
        <span class="gpu-section-title">GPU ${i}</span>
        <span class="gpu-section-meta">🌡 <span id="gpu-temp-${i}">—</span> &nbsp;⚡ <span id="gpu-pow-${i}">—</span></span>
      </div>
      <div class="gpu-section-body">
        <div class="gpu-pct-big" id="gpu-pct-${i}">—</div>
        <div class="gpu-charts">
          <div class="gpu-chart-wrap">
            <div class="gpu-chart-label">USAGE</div>
            <div class="gpu-chart-canvas"><canvas id="gpu-chart-${i}"></canvas></div>
          </div>
          <div class="gpu-chart-wrap">
            <div class="gpu-chart-label">VRAM &nbsp;<span id="vram-text-${i}" style="color:var(--text)">—</span></div>
            <div class="gpu-chart-canvas"><canvas id="vram-chart-${i}"></canvas></div>
          </div>
        </div>
      </div>
    </div>`).join('');

  card.innerHTML = `<div class="card-title">GPU</div>${sections}`;
  row.insertBefore(card, ramCard);

  for (let i = 0; i < count; i++) {
    gpuCharts[i]  = makeSparkline(`gpu-chart-${i}`,  GPU_COLORS[i % GPU_COLORS.length], GPU_BG[i % GPU_BG.length]);
    vramCharts[i] = makeSparkline(`vram-chart-${i}`, '#f59e0b', 'rgba(245,158,11,0.10)');
  }
  // Populate GPU charts from existing history buffer
  if (historyBuffer.length > 0) rebuildCharts();
}

// ── Metrics update ────────────────────────────────────────────────────────────
function updateMetrics(d) {
  if (d.uptime != null) setText('h-uptime', fmtUptime(d.uptime));

  // CPU
  if (d.cpu) {
    const p = d.cpu.usage ?? 0;
    setGauge('cpu-gauge', p, 'var(--blue)');
    setText('cpu-pct',  `${p}%`, colorClass(p));
    setText('cpu-temp', d.cpu.temp  != null ? `${d.cpu.temp}°C` : '—');
    setText('cpu-pow',  d.cpu.power != null ? `${d.cpu.power}W` : '—');
    sparkPush(cpuChart, p);

    // Per-core bars
    if (d.cpu.cores && d.cpu.cores.length > 0) {
      const grid = document.getElementById('cpu-cores');
      if (grid.children.length !== d.cpu.cores.length) {
        grid.innerHTML = d.cpu.cores.map((_, i) =>
          `<div class="core-item">
            <span class="core-label">${i}</span>
            <div class="core-track"><div class="core-fill" id="core-fill-${i}"></div></div>
            <span class="core-pct" id="core-pct-${i}">—</span>
          </div>`
        ).join('');
      }
      d.cpu.cores.forEach((usage, i) => {
        const pct = usage ?? 0;
        const fill = document.getElementById(`core-fill-${i}`);
        if (fill) {
          fill.style.width = `${pct}%`;
          fill.style.background = pct >= 85 ? 'var(--red)' : pct >= 65 ? 'var(--amber)' : 'var(--blue)';
        }
        setText(`core-pct-${i}`, `${pct}%`);
      });
    }
  }

  // GPU (array → combined card)
  if (d.gpu && d.gpu.length > 0) {
    if (!gpuCardsReady) initGpuCards(d.gpu.length);
    d.gpu.forEach((g, i) => {
      const p = g.usage ?? 0;
      setText(`gpu-pct-${i}`,  `${p}%`, colorClass(p));
      setText(`gpu-temp-${i}`, g.temp       != null ? `${g.temp}°C` : '—');
      setText(`gpu-pow-${i}`,  g.power_draw != null ? `${g.power_draw.toFixed(0)}W` : '—');
      sparkPush(gpuCharts[i], g.usage);

      if (g.vram_total) {
        const vp = Math.round((g.vram_used / g.vram_total) * 100);
        sparkPush(vramCharts[i], vp);
        setText(`vram-text-${i}`, `${fmtMB(g.vram_used)}/${fmtMB(g.vram_total)}`);
      }
    });
  }

  // RAM
  if (d.ram) {
    const p = d.ram.percent ?? 0;
    setGauge('ram-gauge', p, 'var(--green)');
    setText('ram-pct',    `${p}%`, colorClass(p));
    setText('ram-used',   fmtBytes(d.ram.used));
    setText('ram-cached', fmtBytes((d.ram.cached ?? 0) + (d.ram.buffers ?? 0)));
    const swapPct = d.ram.swap_total > 0
      ? Math.round((d.ram.swap_used / d.ram.swap_total) * 100) : 0;
    setText('ram-swap', d.ram.swap_total > 0 ? `${swapPct}%` : '—');
    sparkPush(ramChart, d.ram.percent);
  }

  // Network
  if (d.network) {
    setText('rx-val', fmtBps(d.network.rx_sec));
    setText('tx-val', fmtBps(d.network.tx_sec));
    setText('net-iface', d.network.iface ?? '—');
    sparkPush(netChart, d.network.rx_sec, 0);
    sparkPush(netChart, d.network.tx_sec, 1);
    netChart.update('none');
  }

  // Disk — donut chart + legend (per-disk used/free breakdown)
  if (d.disk && d.disk.length > 0) {
    const totalUsed = d.disk.reduce((s, x) => s + (x.used || 0), 0);
    const totalSize = d.disk.reduce((s, x) => s + (x.size || 0), 0);
    const pct  = totalSize > 0 ? Math.round((totalUsed / totalSize) * 100) : 0;

    const segLabels = [], segData = [], segColors = [];
    d.disk.forEach((disk, i) => {
      const free = Math.max(0, disk.size - disk.used);
      segLabels.push(disk.mount + ' used', disk.mount + ' free');
      segData.push(disk.used, free);
      segColors.push(DISK_COLORS[i % DISK_COLORS.length], DISK_COLORS_DIM[i % DISK_COLORS_DIM.length]);
    });

    diskChart.data.labels = segLabels;
    diskChart.data.datasets[0].data = segData;
    diskChart.data.datasets[0].backgroundColor = segColors;
    diskChart.update('none');

    setText('disk-pct-text', `${pct}%`, colorClass(pct));

    const legend = document.getElementById('disk-legend');
    if (legend) {
      legend.innerHTML = d.disk.map((disk, i) => {
        const diskPct = disk.size > 0 ? Math.round((disk.used / disk.size) * 100) : 0;
        return `<div class="disk-legend-item">
          <span class="disk-legend-dot" style="background:${DISK_COLORS[i % DISK_COLORS.length]}"></span>
          <span class="disk-legend-mount">${disk.mount}</span>
          <span class="disk-legend-val">${fmtBytes(disk.used)} / ${fmtBytes(disk.size)}</span>
          <span class="disk-legend-pct" style="color:${diskPct>=90?'var(--red)':diskPct>=75?'var(--amber)':'var(--dim)'}">${diskPct}%</span>
        </div>`;
      }).join('');
    }
  }

  // Disk I/O
  if (d.disk_io) {
    setText('disk-rx', fmtBps(d.disk_io.rx_sec));
    setText('disk-wx', fmtBps(d.disk_io.wx_sec));
    sparkPush(diskIOChart, d.disk_io.rx_sec ?? 0, 0);
    sparkPush(diskIOChart, d.disk_io.wx_sec ?? 0, 1);
    diskIOChart.update('none');
  }

  // Web requests (merged into metrics message)
  if (d.web_rpm != null) {
    setText('web-rpm',   d.web_rpm.toString());
    setText('web-total', (d.web_total ?? 0).toString());
    sparkPush(webChart, d.web_rpm);
  }

  // Load average
  if (d.load) {
    setText('load-1',  d.load.m1?.toFixed(2)  ?? '—');
    setText('load-5',  d.load.m5?.toFixed(2)  ?? '—');
    setText('load-15', d.load.m15?.toFixed(2) ?? '—');
  }

  // Power
  if (d.power) {
    const fmt = w => w != null ? `${w}W` : '—';
    setText('pow-total', fmt(d.power.total));
    setText('pow-cpu',   fmt(d.power.cpu));
    setText('pow-gpu',   fmt(d.power.gpu));
    setText('pow-dram',  fmt(d.power.dram));
    sparkPush(powerChart, d.power.total, 0);
    sparkPush(powerChart, d.power.cpu,   1);
    sparkPush(powerChart, d.power.gpu,   2);
    sparkPush(powerChart, d.power.dram,  3);
    powerChart.update('none');
  }
}

// ── Docker / services ──────────────────────────────────────────────────────────
const SERVICE_LINKS = {
  'portfolio-container': 'https://s3an.dev',
  'open-webui':          'https://chat.s3an.dev',
  'ollama':              'https://ollama.s3an.dev',
};

const containerStats = {};
let currentContainers = [];
let selectedService   = null;

// SVG icons for control buttons
const SVG_START   = `<svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="currentColor"/></svg>`;
const SVG_STOP    = `<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/></svg>`;
const SVG_RESTART = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>`;
const SVG_LOGS    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/></svg>`;

function dotClassFor(state) {
  return state === 'running' ? 'status-running'
       : state === 'exited'  ? 'status-exited'
       : state === 'paused'  ? 'status-paused' : 'status-other';
}

function badgeClassFor(state) {
  return state === 'running' ? 'running' : state === 'exited' ? 'exited' : state === 'paused' ? 'paused' : 'other';
}

function updateDocker(containers) {
  currentContainers = containers;
  renderServiceGrid(containers);
}

function renderServiceGrid(containers) {
  const grid = document.getElementById('svc-grid');
  if (!containers.length) {
    grid.innerHTML = '<div style="color:var(--dim);font-size:12px;padding:8px">No containers found</div>';
    return;
  }

  grid.innerHTML = containers.map(c => {
    const link      = SERVICE_LINKS[c.name];
    const stats     = containerStats[c.name];
    const isRunning = c.state === 'running';
    const cpuPct    = stats?.cpu ?? 0;
    const memPct    = stats?.mem_percent ?? 0;
    const cpuVal    = stats?.cpu      != null ? `${stats.cpu.toFixed(1)}%` : '—';
    const memVal    = stats?.mem_used != null ? fmtBytes(stats.mem_used)  : '—';
    const memTot    = stats?.mem_total != null ? ` / ${fmtBytes(stats.mem_total)}` : '';
    const diskR     = stats?.disk_r_sec != null ? fmtBps(stats.disk_r_sec) : '—';
    const diskW     = stats?.disk_w_sec != null ? fmtBps(stats.disk_w_sec) : '—';
    const cpuColor  = cpuPct >= 85 ? 'var(--red)' : cpuPct >= 65 ? 'var(--amber)' : 'var(--blue)';
    const memColor  = memPct >= 85 ? 'var(--red)' : memPct >= 65 ? 'var(--amber)' : 'var(--green)';
    const logActive = selectedService === c.name ? ' active' : '';

    return `<div class="svc2-card" data-name="${c.name}">
      <div class="svc2-header">
        <span class="status-dot ${dotClassFor(c.state)}"></span>
        <span class="svc2-name">${c.name}</span>
        <span class="svc-state-badge ${badgeClassFor(c.state)}">${c.state}</span>
      </div>
      <div class="svc2-meta">${c.image} · ${c.status}</div>
      <div class="svc2-bars">
        <div class="svc2-bar-row">
          <span class="svc2-bar-label">CPU</span>
          <div class="svc2-bar-track"><div class="svc2-bar-fill" id="svc2-cpu-bar-${c.name}" style="width:${Math.min(100,cpuPct)}%;background:${cpuColor}"></div></div>
          <span class="svc2-bar-val" id="svc2-cpu-val-${c.name}">${cpuVal}</span>
        </div>
        <div class="svc2-bar-row">
          <span class="svc2-bar-label">MEM</span>
          <div class="svc2-bar-track"><div class="svc2-bar-fill" id="svc2-mem-bar-${c.name}" style="width:${Math.min(100,memPct)}%;background:${memColor}"></div></div>
          <span class="svc2-bar-val" id="svc2-mem-val-${c.name}">${memVal}${memTot}</span>
        </div>
        <div class="svc2-bar-row">
          <span class="svc2-bar-label">DISK</span>
          <div class="svc2-disk-io" id="svc2-disk-val-${c.name}">↓ <span>${diskR}</span>&ensp;↑ <span>${diskW}</span></div>
        </div>
      </div>
      <div class="svc2-actions">
        <button class="svc2-ctrl-btn" title="Start"   ${isRunning ? 'disabled' : ''} onclick="svcControl('${c.name}','start')">${SVG_START}</button>
        <button class="svc2-ctrl-btn" title="Stop"    ${!isRunning ? 'disabled' : ''} onclick="svcControl('${c.name}','stop')">${SVG_STOP}</button>
        <button class="svc2-ctrl-btn" title="Restart" ${!isRunning ? 'disabled' : ''} onclick="svcControl('${c.name}','restart')">${SVG_RESTART}</button>
        <div class="svc2-spacer"></div>
        <button class="svc2-log-btn${logActive}" onclick="toggleLogs('${c.name}')">${SVG_LOGS} Logs</button>
        ${link ? `<a class="svc-link-btn" href="${link}" target="_blank" rel="noopener">↗ Open</a>` : ''}
      </div>
    </div>`;
  }).join('');
}

function updateContainerStats(statsArray) {
  statsArray.forEach(s => { containerStats[s.name] = s.stats; });
  statsArray.forEach(({ name, stats }) => {
    if (!stats) return;
    const cpuPct   = stats.cpu ?? 0;
    const memPct   = stats.mem_percent ?? 0;
    const cpuColor = cpuPct >= 85 ? 'var(--red)' : cpuPct >= 65 ? 'var(--amber)' : 'var(--blue)';
    const memColor = memPct >= 85 ? 'var(--red)' : memPct >= 65 ? 'var(--amber)' : 'var(--green)';

    const cpuBar  = document.getElementById(`svc2-cpu-bar-${name}`);
    const cpuVal  = document.getElementById(`svc2-cpu-val-${name}`);
    const memBar  = document.getElementById(`svc2-mem-bar-${name}`);
    const memVal  = document.getElementById(`svc2-mem-val-${name}`);
    const diskVal = document.getElementById(`svc2-disk-val-${name}`);

    if (cpuBar) { cpuBar.style.width = `${Math.min(100, cpuPct)}%`; cpuBar.style.background = cpuColor; }
    if (cpuVal) cpuVal.textContent = stats.cpu != null ? `${stats.cpu.toFixed(1)}%` : '—';
    if (memBar) { memBar.style.width = `${Math.min(100, memPct)}%`; memBar.style.background = memColor; }
    if (memVal) {
      const u = stats.mem_used  != null ? fmtBytes(stats.mem_used)  : '—';
      const t = stats.mem_total != null ? ` / ${fmtBytes(stats.mem_total)}` : '';
      memVal.textContent = u + t;
    }
    if (diskVal) {
      const r = stats.disk_r_sec != null ? fmtBps(stats.disk_r_sec) : '—';
      const w = stats.disk_w_sec != null ? fmtBps(stats.disk_w_sec) : '—';
      diskVal.innerHTML = `↓ <span>${r}</span>&ensp;↑ <span>${w}</span>`;
    }
  });
}

function toggleLogs(name) {
  if (selectedService === name) { closeLogs(); return; }

  if (selectedService) ws?.send(JSON.stringify({ type: 'unsubscribe_logs', container: selectedService }));
  selectedService = name;

  const drawer = document.getElementById('svc-log-drawer');
  drawer.style.display = 'flex';
  document.getElementById('svc-log-drawer-title').textContent = `LOGS — ${name}`;
  document.getElementById('svc-log-view').innerHTML = '<span style="color:var(--dim)">Loading...</span>';

  document.querySelectorAll('.svc2-log-btn').forEach(btn =>
    btn.classList.toggle('active', btn.closest('.svc2-card')?.dataset.name === name)
  );

  ws?.send(JSON.stringify({ type: 'subscribe_logs', container: name }));
}

function closeLogs() {
  if (selectedService) ws?.send(JSON.stringify({ type: 'unsubscribe_logs', container: selectedService }));
  selectedService = null;
  document.getElementById('svc-log-drawer').style.display = 'none';
  document.querySelectorAll('.svc2-log-btn').forEach(btn => btn.classList.remove('active'));
}

async function svcControl(name, action) {
  try {
    const r = await fetch(`/api/containers/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
    if (!r.ok) console.error(`[svcControl] ${action} ${name}:`, (await r.json()).error);
  } catch (err) {
    console.error(`[svcControl] ${action} ${name}:`, err);
  }
}

// ── Log streaming ──────────────────────────────────────────────────────────────
const LOG_MAX = 200;

function appendLog(container, line) {
  if (container !== selectedService) return;
  const view = document.getElementById('svc-log-view');
  if (!view) return;

  // Clear the placeholder on first real log line
  if (view.children.length === 1 && view.firstElementChild?.style.color) {
    view.innerHTML = '';
  }

  const atBottom = view.scrollHeight - view.clientHeight <= view.scrollTop + 20;
  const div = document.createElement('div');
  div.className = 'log-line' + (/error|err|fatal|warn/i.test(line) ? ' err' : '');
  div.textContent = line;
  view.appendChild(div);
  while (view.children.length > LOG_MAX) view.removeChild(view.firstChild);
  if (atBottom) view.scrollTop = view.scrollHeight;
}

// ── WebSocket ──────────────────────────────────────────────────────────────────
let ws = null;
let wsDelay = 1000;

function wsConnect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    wsDelay = 1000;
    document.getElementById('ws-dot').className = 'ws-dot connected';
    document.getElementById('ws-label').textContent = 'Live';
    if (selectedService) ws.send(JSON.stringify({ type: 'subscribe_logs', container: selectedService }));
  };

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'metrics') {
        pushHistory(msg.data);
        updateMetrics(msg.data);
      }
      if (msg.type === 'history') {
        historyBuffer = msg.data;
        rebuildCharts();
        // Init GPU cards from history if not yet done
        if (!gpuCardsReady && historyBuffer.length > 0) {
          const gpuCount = historyBuffer[historyBuffer.length - 1].gpu?.length ?? 0;
          if (gpuCount > 0) {
            initGpuCards(gpuCount);
            rebuildCharts();
          }
        }
      }
      if (msg.type === 'docker')          updateDocker(msg.data);
      if (msg.type === 'container_stats') updateContainerStats(msg.data);
      if (msg.type === 'log')             appendLog(msg.container, msg.line);
    } catch {}
  };

  ws.onclose = () => {
    document.getElementById('ws-dot').className = 'ws-dot';
    document.getElementById('ws-label').textContent = 'Reconnecting...';
    setTimeout(() => { wsDelay = Math.min(wsDelay * 1.5, 15000); wsConnect(); }, wsDelay);
  };

  ws.onerror = () => ws.close();
}

wsConnect();

// ── Panel toggle wiring ───────────────────────────────────────────────────────
document.getElementById('pt-server')  ?.addEventListener('click', () => switchPanel('server'));
document.getElementById('pt-services')?.addEventListener('click', () => switchPanel('services'));
