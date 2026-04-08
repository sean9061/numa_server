// ── Auth guard ──────────────────────────────────────────────────────────────
fetch('/auth/check').then(r => r.json()).then(d => {
  if (!d.authenticated) location.href = '/login.html';
}).catch(() => { location.href = '/login.html'; });

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  location.href = '/login.html';
}

// ── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ── Gauge helpers ─────────────────────────────────────────────────────────────
const GAUGE_LEN = 204.2; // π × 65 (radius of gauge arc)

function setGauge(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  const p = Math.min(100, Math.max(0, pct ?? 0));
  const filled = (p / 100) * GAUGE_LEN;
  el.setAttribute('stroke-dasharray', `${filled.toFixed(1)} ${GAUGE_LEN}`);
}

function gaugeColor(pct) {
  if (pct >= 85) return 'var(--red)';
  if (pct >= 65) return 'var(--amber)';
  return null; // keep default
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
function fmtBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtBps(bps) {
  if (bps == null) return '—';
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}

function fmtUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtGb(mb) {
  if (mb == null) return '—';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

// ── Chart.js setup ────────────────────────────────────────────────────────────
const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: {
    x: { display: false },
    y: {
      display: true,
      min: 0,
      grid: { color: 'rgba(30,45,74,0.6)' },
      ticks: { color: '#4e6282', font: { size: 10 }, maxTicksLimit: 4,
               callback: v => fmtBps(v) },
      border: { display: false },
    },
  },
  elements: { point: { radius: 0 }, line: { tension: 0.3, borderWidth: 1.5 } },
};

const NET_POINTS = 60;
const netLabels = Array(NET_POINTS).fill('');
const rxData    = Array(NET_POINTS).fill(0);
const txData    = Array(NET_POINTS).fill(0);

const netChart = new Chart(document.getElementById('net-chart'), {
  type: 'line',
  data: {
    labels: netLabels,
    datasets: [
      { data: rxData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true },
      { data: txData, borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.08)', fill: true },
    ],
  },
  options: { ...CHART_OPTS, scales: { ...CHART_OPTS.scales,
    y: { ...CHART_OPTS.scales.y, ticks: { ...CHART_OPTS.scales.y.ticks,
      callback: v => fmtBps(v) } },
  }},
});

const WEB_POINTS = 60;
const webLabels = Array(WEB_POINTS).fill('');
const webData   = Array(WEB_POINTS).fill(0);
let webRequestCount = 0;

const webChart = new Chart(document.getElementById('web-chart'), {
  type: 'line',
  data: {
    labels: webLabels,
    datasets: [
      { data: webData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', fill: true },
    ],
  },
  options: { ...CHART_OPTS, scales: { ...CHART_OPTS.scales,
    y: { ...CHART_OPTS.scales.y, ticks: { ...CHART_OPTS.scales.y.ticks,
      callback: v => `${v}` } },
  }},
});

// Push a value into a rolling chart dataset
function chartPush(chart, datasetIdx, value) {
  const ds = chart.data.datasets[datasetIdx];
  ds.data.shift();
  ds.data.push(value);
  chart.update('none');
}

// ── Metrics update ────────────────────────────────────────────────────────────
function updateMetrics(d) {
  // Uptime
  if (d.uptime != null) setText('h-uptime', fmtUptime(d.uptime));

  // CPU
  if (d.cpu) {
    const pct = d.cpu.usage ?? 0;
    setGauge('cpu-gauge', pct);
    const c = gaugeColor(pct);
    if (c) document.getElementById('cpu-gauge').style.stroke = c;
    else document.getElementById('cpu-gauge').style.stroke = 'var(--blue)';
    setText('cpu-pct', `${pct}%`, colorClass(pct));
    setText('cpu-temp', d.cpu.temp != null ? `${d.cpu.temp}°C` : '—');
    setText('cpu-pow',  d.cpu.power != null ? `${d.cpu.power}W` : '—');
  }

  // GPU
  if (d.gpu) {
    const pct = d.gpu.usage ?? 0;
    setGauge('gpu-gauge', pct);
    const c = gaugeColor(pct);
    if (c) document.getElementById('gpu-gauge').style.stroke = c;
    else document.getElementById('gpu-gauge').style.stroke = 'var(--purple)';
    setText('gpu-pct', `${pct}%`, colorClass(pct));
    setText('gpu-temp', `${d.gpu.temp ?? '—'}°C`);
    setText('gpu-pow', d.gpu.power_draw != null ? `${d.gpu.power_draw.toFixed(0)}W` : '—');
    // VRAM
    if (d.gpu.vram_total) {
      const vPct = Math.round((d.gpu.vram_used / d.gpu.vram_total) * 100);
      setText('vram-pct', `${vPct}%`);
    }
  }

  // RAM
  if (d.ram) {
    const pct = d.ram.percent ?? 0;
    setGauge('ram-gauge', pct);
    const c = gaugeColor(pct);
    if (c) document.getElementById('ram-gauge').style.stroke = c;
    else document.getElementById('ram-gauge').style.stroke = 'var(--green)';
    setText('ram-pct', `${pct}%`, colorClass(pct));
    setText('ram-used', fmtBytes(d.ram.used));
  }

  // Network
  if (d.network) {
    setText('rx-val', fmtBps(d.network.rx_sec));
    setText('tx-val', fmtBps(d.network.tx_sec));
    setText('net-iface', d.network.iface ?? '—');
    netChart.data.datasets[0].data.shift();
    netChart.data.datasets[0].data.push(d.network.rx_sec);
    netChart.data.datasets[1].data.shift();
    netChart.data.datasets[1].data.push(d.network.tx_sec);
    netChart.update('none');
  }

  // Disk
  if (d.disk && d.disk.length > 0) {
    const list = document.getElementById('disk-list');
    list.innerHTML = d.disk.map(disk => {
      const used = fmtBytes(disk.used);
      const total = fmtBytes(disk.size);
      const pct = disk.percent ?? 0;
      const barColor = pct >= 85 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--green)';
      return `<div class="disk-row">
        <div class="disk-mount" title="${disk.mount}">${disk.mount}</div>
        <div class="disk-bar-wrap"><div class="disk-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="disk-pct">${pct}%</div>
        <div style="font-size:10px;color:var(--dim);white-space:nowrap">${used}/${total}</div>
      </div>`;
    }).join('');
  }

  // Load average
  if (d.load) {
    setText('load-1',  d.load.m1?.toFixed(2)  ?? '—');
    setText('load-5',  d.load.m5?.toFixed(2)  ?? '—');
    setText('load-15', d.load.m15?.toFixed(2) ?? '—');
  }
}

// ── Docker / services update ───────────────────────────────────────────────────
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
    return `<${tag} class="service-row" ${attrs} onclick="setLogContainer('${c.name}', this)">
      <span class="status-dot ${dotClass}"></span>
      <span class="service-name">${c.name}</span>
      <span class="service-image">${c.image}</span>
      <span class="service-status-text">${c.status}</span>
    </${tag}>`;
  }).join('');

  // Update log tabs
  updateLogTabs(containers.filter(c => c.state === 'running').map(c => c.name));
}

// ── Log streaming ──────────────────────────────────────────────────────────────
let activeLogContainer = null;
const LOG_MAX = 200;

function updateLogTabs(containerNames) {
  const tabs = document.getElementById('log-tabs');
  const existing = new Set(Array.from(tabs.querySelectorAll('.log-tab')).map(t => t.dataset.name));
  const wanted = new Set(containerNames);

  // Add new tabs
  for (const name of containerNames) {
    if (!existing.has(name)) {
      const btn = document.createElement('button');
      btn.className = 'log-tab';
      btn.dataset.name = name;
      btn.textContent = name;
      btn.onclick = () => switchLogTab(name);
      tabs.appendChild(btn);
    }
  }

  // Remove stale tabs
  for (const btn of tabs.querySelectorAll('.log-tab')) {
    if (!wanted.has(btn.dataset.name)) btn.remove();
  }

  // Auto-select first tab if nothing active
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

function setLogContainer(name, el) {
  if (el.tagName === 'A') return; // let link open
  switchLogTab(name);
}

function appendLog(container, line) {
  if (container !== activeLogContainer) return;
  const view = document.getElementById('log-view');
  const isBottom = view.scrollHeight - view.clientHeight <= view.scrollTop + 20;

  const div = document.createElement('div');
  div.className = 'log-line' + (/error|err|fatal|warn/i.test(line) ? ' err' : '');
  div.textContent = line;
  view.appendChild(div);

  // Trim old lines
  while (view.children.length > LOG_MAX) view.removeChild(view.firstChild);
  if (isBottom) view.scrollTop = view.scrollHeight;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
let ws = null;
let wsReconnectTimer = null;
let wsReconnectDelay = 1000;

function wsConnect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    wsReconnectDelay = 1000;
    document.getElementById('ws-dot').className = 'ws-dot connected';
    document.getElementById('ws-label').textContent = 'Live';
    if (activeLogContainer) {
      ws.send(JSON.stringify({ type: 'subscribe_logs', container: activeLogContainer }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'metrics') updateMetrics(msg.data);
      if (msg.type === 'docker')  updateDocker(msg.data);
      if (msg.type === 'log')     appendLog(msg.container, msg.line);
    } catch {}
  };

  ws.onclose = () => {
    document.getElementById('ws-dot').className = 'ws-dot';
    document.getElementById('ws-label').textContent = 'Reconnecting...';
    wsReconnectTimer = setTimeout(() => {
      wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, 15000);
      wsConnect();
    }, wsReconnectDelay);
  };

  ws.onerror = () => ws.close();
}

wsConnect();

// ── Web requests tracking (from NPM container logs) ───────────────────────────
// Count HTTP access log lines arriving from proxy container
// Pattern: NPM access log lines contain status codes
let webReqPerMin = 0;
let webReqWindow = []; // timestamps of recent requests

function trackWebRequest() {
  const now = Date.now();
  webReqWindow.push(now);
  // Keep only last 60 minutes
  const cutoff = now - 60 * 60 * 1000;
  webReqWindow = webReqWindow.filter(t => t > cutoff);

  // RPM = requests in last 60 seconds
  const rpm = webReqWindow.filter(t => t > now - 60000).length;
  setText('web-rpm', rpm.toString());
  setText('web-total', webReqWindow.length.toString());

  // Push to chart
  webData.shift();
  webData.push(rpm);
  webChart.update('none');
}

// Monkey-patch appendLog to also count NPM access log lines
const _appendLog = appendLog;
window.appendLogWithTracking = function(container, line) {
  // NPM access log pattern: contains HTTP status codes (e.g. " 200 " or " 404 ")
  if (/proxy-app|npm/.test(container) && /"\s+(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)\s+/.test(line)) {
    trackWebRequest();
  }
  _appendLog(container, line);
};
