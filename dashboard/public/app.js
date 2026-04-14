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

const CORE_COLORS = [
  '#3b82f6','#818cf8','#22c55e','#f59e0b','#ef4444','#06b6d4',
  '#f97316','#84cc16','#ec4899','#10b981','#8b5cf6','#14b8a6',
  '#f43f5e','#a3e635','#fb923c','#38bdf8',
];
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

// GPU charts: initialized dynamically when GPU cards are created
const gpuCharts = [];

const cpuChart = makeSparkline('cpu-chart', '#3b82f6', 'rgba(59,130,246,0.10)');
const ramChart = makeSparkline('ram-chart', '#22c55e', 'rgba(34,197,94,0.10)');
const netChart = makeNetChart('net-chart');
const webChart = makeWebChart('web-chart');

function sparkPush(chart, value, dsIdx = 0) {
  chart.data.datasets[dsIdx].data.shift();
  chart.data.datasets[dsIdx].data.push(value ?? null);
  chart.update('none');
}

// ── GPU cards (dynamic) ────────────────────────────────────────────────────────
let gpuCardsReady = false;

function initGpuCards(count) {
  if (gpuCardsReady) return;
  gpuCardsReady = true;

  const row = document.getElementById('row-metrics');
  const ramCard = document.getElementById('ram-card');
  // CPU + N GPUs + RAM
  row.style.gridTemplateColumns = `1fr ${Array(count).fill('1fr').join(' ')} 1fr`;

  for (let i = 0; i < count; i++) {
    const color = GPU_COLORS[i % GPU_COLORS.length];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title">GPU ${i}</div>
      <div class="metric-body">
        <div class="metric-gauge">
          <svg class="gauge-svg" viewBox="0 0 160 100">
            <path class="gauge-track" d="M 15 88 A 65 65 0 0 1 145 88"/>
            <path class="gauge-indicator" d="M 15 88 A 65 65 0 0 1 145 88"
              id="gpu-gauge-${i}" stroke="${color}" stroke-dasharray="0 204.2"/>
          </svg>
          <div class="gauge-center-text">
            <div class="gauge-pct" id="gpu-pct-${i}">—</div>
            <div class="gauge-sub">USAGE</div>
          </div>
        </div>
        <div class="metric-chart"><canvas id="gpu-chart-${i}"></canvas></div>
      </div>
      <div class="vram-row">
        <span class="vram-label">VRAM</span>
        <div class="vram-bar-wrap"><div class="vram-bar-fill" id="vram-bar-${i}" style="width:0%"></div></div>
        <span class="vram-label" id="vram-text-${i}">—</span>
      </div>
      <div class="metric-meta">
        <div class="meta-pill">🌡 <span id="gpu-temp-${i}">—</span></div>
        <div class="meta-pill">⚡ <span id="gpu-pow-${i}">—</span></div>
      </div>`;
    row.insertBefore(card, ramCard);
    gpuCharts[i] = makeSparkline(`gpu-chart-${i}`, color, GPU_BG[i % GPU_BG.length]);
  }
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

  // GPU (array)
  if (d.gpu && d.gpu.length > 0) {
    if (!gpuCardsReady) initGpuCards(d.gpu.length);
    d.gpu.forEach((g, i) => {
      const p = g.usage ?? 0;
      setGauge(`gpu-gauge-${i}`, p, GPU_COLORS[i % GPU_COLORS.length]);
      setText(`gpu-pct-${i}`,  `${p}%`, colorClass(p));
      setText(`gpu-temp-${i}`, g.temp       != null ? `${g.temp}°C` : '—');
      setText(`gpu-pow-${i}`,  g.power_draw != null ? `${g.power_draw.toFixed(0)}W` : '—');
      sparkPush(gpuCharts[i], g.usage);

      if (g.vram_total) {
        const vp = Math.round((g.vram_used / g.vram_total) * 100);
        const bar = document.getElementById(`vram-bar-${i}`);
        if (bar) {
          bar.style.width = `${vp}%`;
          bar.style.background = vp >= 85 ? 'var(--red)' : 'var(--amber)';
        }
        setText(`vram-text-${i}`, `${fmtMB(g.vram_used)}/${fmtMB(g.vram_total)}`);
      }
    });
  }

  // RAM
  if (d.ram) {
    const p = d.ram.percent ?? 0;
    setGauge('ram-gauge', p, 'var(--green)');
    setText('ram-pct',  `${p}%`, colorClass(p));
    setText('ram-used', fmtBytes(d.ram.used));
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

  // Disk — aggregate total
  if (d.disk && d.disk.length > 0) {
    const totalUsed = d.disk.reduce((s, x) => s + (x.used || 0), 0);
    const totalSize = d.disk.reduce((s, x) => s + (x.size || 0), 0);
    const pct = totalSize > 0 ? Math.round((totalUsed / totalSize) * 100) : 0;
    const color = pct >= 85 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--green)';
    setText('disk-pct-text', `${pct}%`, colorClass(pct));
    const bar = document.getElementById('disk-bar');
    if (bar) { bar.style.width = `${pct}%`; bar.style.background = color; }
    setText('disk-used-text', `${fmtBytes(totalUsed)} / ${fmtBytes(totalSize)}`);
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

function updateDocker(containers) {
  const list = document.getElementById('services-list');
  list.innerHTML = containers.map(c => {
    const dotClass = c.state === 'running' ? 'status-running'
                   : c.state === 'exited'  ? 'status-exited'
                   : c.state === 'paused'  ? 'status-paused' : 'status-other';
    const link = SERVICE_LINKS[c.name];
    const tag = link ? 'a' : 'div';
    const attrs = link ? `href="${link}" target="_blank" rel="noopener"` : '';
    return `<${tag} class="service-row" ${attrs} onclick="handleServiceClick('${c.name}', event)">
      <span class="status-dot ${dotClass}"></span>
      <span class="service-name">${c.name}</span>
      <span class="service-image">${c.image}</span>
      <span class="service-status-text">${c.status}</span>
    </${tag}>`;
  }).join('');

  updateLogTabs(containers.filter(c => c.state === 'running').map(c => c.name));
}

function handleServiceClick(name, event) {
  if (SERVICE_LINKS[name] && event.target.closest('a')) return;
  event.preventDefault();
  switchLogTab(name);
}

// ── Log streaming ──────────────────────────────────────────────────────────────
let activeLogContainer = null;
const LOG_MAX = 200;

function updateLogTabs(names) {
  const tabs = document.getElementById('log-tabs');
  const existing = new Set([...tabs.querySelectorAll('.log-tab')].map(t => t.dataset.name));
  const wanted   = new Set(names);

  for (const name of names) {
    if (!existing.has(name)) {
      const btn = document.createElement('button');
      btn.className = 'log-tab';
      btn.dataset.name = name;
      btn.textContent = name;
      btn.onclick = () => switchLogTab(name);
      tabs.appendChild(btn);
    }
  }
  for (const btn of tabs.querySelectorAll('.log-tab')) {
    if (!wanted.has(btn.dataset.name)) btn.remove();
  }
  if (!activeLogContainer && tabs.firstElementChild) {
    switchLogTab(tabs.firstElementChild.dataset.name);
  }
}

function switchLogTab(name) {
  activeLogContainer = name;
  for (const btn of document.querySelectorAll('.log-tab')) {
    btn.classList.toggle('active', btn.dataset.name === name);
  }
  document.getElementById('log-view').innerHTML = '';
  ws?.send(JSON.stringify({ type: 'subscribe_logs', container: name }));
}

function appendLog(container, line) {
  if (container !== activeLogContainer) return;
  const view = document.getElementById('log-view');
  const atBottom = view.scrollHeight - view.clientHeight <= view.scrollTop + 20;
  const div = document.createElement('div');
  div.className = 'log-line' + (/error|err|fatal|warn/i.test(line) ? ' err' : '');
  div.textContent = line;
  view.appendChild(div);
  while (view.children.length > LOG_MAX) view.removeChild(view.firstChild);
  if (atBottom) view.scrollTop = view.scrollHeight;


}

// ── Web requests (server-side data) ──────────────────────────────────────────
function updateWebRequests(d) {
  setText('web-rpm',   d.rpm.toString());
  setText('web-total', d.total_1h.toString());
  sparkPush(webChart, d.rpm);
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
    if (activeLogContainer) ws.send(JSON.stringify({ type: 'subscribe_logs', container: activeLogContainer }));
  };

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'metrics')      updateMetrics(msg.data);
      if (msg.type === 'docker')       updateDocker(msg.data);
      if (msg.type === 'log')          appendLog(msg.container, msg.line);
      if (msg.type === 'web_requests') updateWebRequests(msg.data);
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
