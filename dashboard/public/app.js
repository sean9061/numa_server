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
  document.getElementById('panel-services').style.display = name === 'services' ? 'grid' : 'none';
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
    disk_rx: d.disk_io?.rx_sec  ?? null,
    disk_wx: d.disk_io?.wx_sec  ?? null,
    web_rpm: d.web_rpm          ?? null,
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
const diskChart = makeDiskDonut('disk-chart');

const DISK_COLORS = ['#3b82f6', '#818cf8', '#22c55e', '#f59e0b', '#ef4444'];

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

  // Disk — donut chart + legend
  if (d.disk && d.disk.length > 0) {
    const totalUsed = d.disk.reduce((s, x) => s + (x.used || 0), 0);
    const totalSize = d.disk.reduce((s, x) => s + (x.size || 0), 0);
    const free = Math.max(0, totalSize - totalUsed);
    const pct  = totalSize > 0 ? Math.round((totalUsed / totalSize) * 100) : 0;

    diskChart.data.labels = [...d.disk.map(x => x.mount), 'Free'];
    diskChart.data.datasets[0].data = [...d.disk.map(x => x.used), free];
    diskChart.data.datasets[0].backgroundColor = [
      ...d.disk.map((_, i) => DISK_COLORS[i % DISK_COLORS.length]),
      'rgba(26,45,74,0.7)',
    ];
    diskChart.update('none');

    setText('disk-pct-text', `${pct}%`, colorClass(pct));

    const legend = document.getElementById('disk-legend');
    if (legend) {
      legend.innerHTML = d.disk.map((disk, i) =>
        `<div class="disk-legend-item">
          <span class="disk-legend-dot" style="background:${DISK_COLORS[i % DISK_COLORS.length]}"></span>
          <span class="disk-legend-mount">${disk.mount}</span>
          <span class="disk-legend-val">${fmtBytes(disk.used)} / ${fmtBytes(disk.size)}</span>
        </div>`
      ).join('');
    }
  }

  // Disk I/O
  if (d.disk_io) {
    setText('disk-rx', fmtBps(d.disk_io.rx_sec));
    setText('disk-wx', fmtBps(d.disk_io.wx_sec));
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
}

// ── Docker / services ──────────────────────────────────────────────────────────
const SERVICE_LINKS = {
  'portfolio-container': 'https://s3an.dev',
  'open-webui':          'https://chat.s3an.dev',
  'ollama':              'https://ollama.s3an.dev',
};

// Container stats from container_stats WebSocket messages
const containerStats = {};

let currentContainers = [];
let selectedService = null;

function updateDocker(containers) {
  currentContainers = containers;
  renderServiceCards(containers);
  // Update detail panel stats if a service is selected
  if (selectedService) {
    const c = containers.find(x => x.name === selectedService);
    if (c) updateDetailMeta(c);
  }
}

function renderServiceCards(containers) {
  const list = document.getElementById('svc-cards-list');
  if (!containers.length) {
    list.innerHTML = '<div style="color:var(--dim);font-size:12px">No containers found</div>';
    return;
  }

  list.innerHTML = containers.map(c => {
    const dotClass   = dotClassFor(c.state);
    const badgeClass = c.state === 'running' ? 'running'
                     : c.state === 'exited'  ? 'exited'
                     : c.state === 'paused'  ? 'paused' : 'other';
    const link = SERVICE_LINKS[c.name];
    const stats = containerStats[c.name];
    const cpuVal = stats?.cpu      != null ? `${stats.cpu.toFixed(1)}%` : '—';
    const memVal = stats?.mem_used != null ? fmtBytes(stats.mem_used)  : '—';
    const selected = c.name === selectedService ? ' selected' : '';
    return `<div class="svc-card${selected}" data-name="${c.name}" onclick="selectService('${c.name}')">
      <div class="svc-card-header">
        <span class="status-dot ${dotClass}"></span>
        <span class="svc-card-name">${c.name}</span>
        <span class="svc-state-badge ${badgeClass}">${c.state}</span>
      </div>
      <div class="svc-card-meta">
        <span>${c.image}</span>
        <span class="svc-card-meta-sep">·</span>
        <span>${c.status}</span>
      </div>
      <div class="svc-card-stats">
        <div class="svc-stat-chip" id="svc-cpu-chip-${c.name}">CPU <span>${cpuVal}</span></div>
        <div class="svc-stat-chip" id="svc-mem-chip-${c.name}">MEM <span>${memVal}</span></div>
      </div>
      ${link ? `<div class="svc-card-footer"><a class="svc-link-btn" href="${link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open ↗</a></div>` : ''}
    </div>`;
  }).join('');
}

function dotClassFor(state) {
  return state === 'running' ? 'status-running'
       : state === 'exited'  ? 'status-exited'
       : state === 'paused'  ? 'status-paused' : 'status-other';
}

function updateContainerStats(statsArray) {
  // statsArray: [{ name, stats: { cpu, mem_used, mem_limit, mem_percent } }]
  statsArray.forEach(s => { containerStats[s.name] = s.stats; });
  // Update chips in service cards
  statsArray.forEach(({ name, stats }) => {
    const cpuChip = document.getElementById(`svc-cpu-chip-${name}`);
    const memChip = document.getElementById(`svc-mem-chip-${name}`);
    if (cpuChip) cpuChip.innerHTML = `CPU <span>${stats.cpu != null ? stats.cpu.toFixed(1) + '%' : '—'}</span>`;
    if (memChip) memChip.innerHTML = `MEM <span>${stats.mem_used != null ? fmtBytes(stats.mem_used) : '—'}</span>`;
  });
  // Update detail panel stats if showing
  if (selectedService) {
    const s = containerStats[selectedService];
    if (s) {
      const detailCpu = document.getElementById('svc-detail-cpu');
      const detailMem = document.getElementById('svc-detail-mem');
      if (detailCpu) detailCpu.textContent = s.cpu != null ? `${s.cpu.toFixed(1)}%` : '—';
      if (detailMem) detailMem.textContent = s.mem_used != null
        ? `${fmtBytes(s.mem_used)}${s.mem_limit ? ' / ' + fmtBytes(s.mem_limit) : ''}` : '—';
    }
  }
}

// ── Service selection & detail panel ─────────────────────────────────────────
function selectService(name) {
  // Update card selection state
  document.querySelectorAll('.svc-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.name === name);
  });

  selectedService = name;
  const c = currentContainers.find(x => x.name === name);
  renderDetailPanel(c);

  // Subscribe to logs
  ws?.send(JSON.stringify({ type: 'subscribe_logs', container: name }));
}

function renderDetailPanel(c) {
  const col = document.getElementById('svc-detail-col');
  if (!c) {
    col.innerHTML = '<div class="svc-detail-empty">Service not found</div>';
    return;
  }

  const link = SERVICE_LINKS[c.name];
  const dotClass = dotClassFor(c.state);
  const badgeClass = c.state === 'running' ? 'running'
                   : c.state === 'exited'  ? 'exited'
                   : c.state === 'paused'  ? 'paused' : 'other';
  const stats = containerStats[c.name];
  const cpuVal = stats?.cpu      != null ? `${stats.cpu.toFixed(1)}%` : '—';
  const memVal = stats?.mem_used != null
    ? `${fmtBytes(stats.mem_used)}${stats.mem_limit ? ' / ' + fmtBytes(stats.mem_limit) : ''}` : '—';

  col.innerHTML = `
    <div class="svc-detail-header">
      <span class="status-dot ${dotClass}" style="width:8px;height:8px"></span>
      <span class="svc-detail-name">${c.name}</span>
      <span class="svc-state-badge ${badgeClass}" style="font-size:10px">${c.state}</span>
      <div class="header-spacer"></div>
      <div class="svc-detail-actions">
        ${link ? `<a class="svc-detail-action-btn" href="${link}" target="_blank" rel="noopener">Open ↗</a>` : ''}
      </div>
    </div>
    <div class="svc-detail-meta">
      <span>${c.image}</span>
      <span>·</span>
      <span>${c.status}</span>
    </div>
    <div class="svc-detail-stats">
      <div class="svc-detail-stat-chip">CPU <span id="svc-detail-cpu">${cpuVal}</span></div>
      <div class="svc-detail-stat-chip">MEM <span id="svc-detail-mem">${memVal}</span></div>
    </div>
    <div class="svc-detail-divider"></div>
    <div class="svc-detail-log-title">LOGS</div>
    <div class="log-view" id="svc-log-view"><span style="color:var(--dim)">Loading logs...</span></div>
  `;
}

function updateDetailMeta(c) {
  const badgeClass = c.state === 'running' ? 'running'
                   : c.state === 'exited'  ? 'exited'
                   : c.state === 'paused'  ? 'paused' : 'other';
  const dot = document.querySelector('#svc-detail-col .status-dot');
  if (dot) dot.className = `status-dot ${dotClassFor(c.state)}`;
  const badge = document.querySelector('#svc-detail-col .svc-state-badge');
  if (badge) { badge.className = `svc-state-badge ${badgeClass}`; badge.textContent = c.state; }
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
