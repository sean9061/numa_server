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

// ── Canvas layout constants ───────────────────────────────────────────────────
const CANVAS_W   = 1268;
const SERVER_H   = 564;   // row1(260) + gap(12) + row2(280) + gap(12)
const SERVICES_Y = 576;

// ── PanZoom ───────────────────────────────────────────────────────────────────
class PanZoom {
  constructor(vpEl, canvasEl) {
    this.vp    = vpEl;
    this.el    = canvasEl;
    this.x     = 0;
    this.y     = 0;
    this.scale = 1;
    this.MIN   = 0.18;
    this.MAX   = 3.0;
    this._drag = false;
    this._sx = 0; this._sy = 0; this._ox = 0; this._oy = 0;
    this._bind();
    this._initView();
  }

  _commit(animated = false) {
    if (animated) {
      this.el.style.transition = 'transform 0.38s cubic-bezier(0.4,0,0.2,1)';
      clearTimeout(this._tId);
      this._tId = setTimeout(() => { this.el.style.transition = 'none'; }, 400);
    } else {
      this.el.style.transition = 'none';
    }
    this.el.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.scale})`;
  }

  _clamp(s) { return Math.min(this.MAX, Math.max(this.MIN, s)); }

  _zoomAt(cx, cy, factor) {
    const ns = this._clamp(this.scale * factor);
    const r  = this.vp.getBoundingClientRect();
    const lx = cx - r.left, ly = cy - r.top;
    this.x = lx - (lx - this.x) * (ns / this.scale);
    this.y = ly - (ly - this.y) * (ns / this.scale);
    this.scale = ns;
    this._commit();
  }

  _bind() {
    const vp = this.vp;

    // Mouse drag
    vp.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('button,a,input,select,.log-view,canvas')) return;
      this._drag = true;
      this._sx = e.clientX; this._sy = e.clientY;
      this._ox = this.x;    this._oy = this.y;
      vp.classList.add('is-dragging');
    });
    window.addEventListener('mousemove', e => {
      if (!this._drag) return;
      this.x = this._ox + e.clientX - this._sx;
      this.y = this._oy + e.clientY - this._sy;
      this._commit();
    });
    window.addEventListener('mouseup', () => {
      this._drag = false;
      vp.classList.remove('is-dragging');
    });

    // Wheel zoom
    vp.addEventListener('wheel', e => {
      e.preventDefault();
      this._zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });

    // Touch pan + pinch
    let t1x, t1y, t1ox, t1oy, pinchDist = 0, pinchMx, pinchMy, touchPan = false;

    vp.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        if (t.target.closest('button,a,input,select,.log-view,canvas')) return;
        touchPan = true;
        t1x = t.clientX; t1y = t.clientY;
        t1ox = this.x;   t1oy = this.y;
      } else if (e.touches.length === 2) {
        touchPan = false;
        const [a, b] = e.touches;
        pinchDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        pinchMx   = (a.clientX + b.clientX) / 2;
        pinchMy   = (a.clientY + b.clientY) / 2;
        t1ox = this.x; t1oy = this.y;
      }
    }, { passive: true });

    vp.addEventListener('touchmove', e => {
      if (e.target.closest('.log-view')) return;
      e.preventDefault();
      if (e.touches.length === 1 && touchPan) {
        const t = e.touches[0];
        this.x = t1ox + t.clientX - t1x;
        this.y = t1oy + t.clientY - t1y;
        this._commit();
      } else if (e.touches.length === 2) {
        const [a, b] = e.touches;
        const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        const mx   = (a.clientX + b.clientX) / 2;
        const my   = (a.clientY + b.clientY) / 2;
        const r    = this.vp.getBoundingClientRect();
        const cx   = mx - r.left, cy = my - r.top;
        const factor = pinchDist > 0 ? dist / pinchDist : 1;
        const ns = this._clamp(this.scale * factor);
        this.x = cx - (cx - this.x) * (ns / this.scale) + (mx - pinchMx);
        this.y = cy - (cy - this.y) * (ns / this.scale) + (my - pinchMy);
        this.scale = ns;
        pinchDist = dist; pinchMx = mx; pinchMy = my;
        this._commit();
      }
    }, { passive: false });

    vp.addEventListener('touchend', () => { touchPan = false; pinchDist = 0; });
  }

  // Animate canvas so that point (canvasX, canvasY) appears at viewport centre
  goto(canvasX, canvasY, targetScale, animated = true) {
    this.scale = this._clamp(targetScale);
    this.x = this.vp.clientWidth  / 2 - canvasX * this.scale;
    this.y = this.vp.clientHeight / 2 - canvasY * this.scale;
    this._commit(animated);
  }

  // Fit a canvas rectangle into the viewport
  fitRect(rx, ry, rw, rh, pad = 40, animated = false) {
    const vw = this.vp.clientWidth, vh = this.vp.clientHeight;
    const s  = this._clamp(Math.min((vw - pad * 2) / rw, (vh - pad * 2) / rh));
    this.goto(rx + rw / 2, ry + rh / 2, s, animated);
  }

  // Fit server section on load
  fitServer(animated = false) {
    const vw = this.vp.clientWidth;
    // On narrow screens start at 0.72 showing ~2 tiles; on wide screens fit all
    const s = vw >= 900
      ? this._clamp(Math.min(1.15, (vw - 40) / CANVAS_W))
      : 0.72;
    this.goto(CANVAS_W / 2, SERVER_H / 2, s, animated);
  }

  _initView() {
    // Defer until layout is painted
    requestAnimationFrame(() => this.fitServer(false));
  }
}

// ── Panel toggle ──────────────────────────────────────────────────────────────
let activePanel = 'server';

function switchPanel(name) {
  activePanel = name;
  document.querySelectorAll('.pt-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.panel === name)
  );
  const isServer = name === 'server';
  document.getElementById('viewport').style.display        = isServer ? 'block'  : 'none';
  document.getElementById('panel-services').style.display  = isServer ? 'none'   : 'flex';
  document.getElementById('server-controls').style.display = isServer ? 'contents' : 'none';
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

  const tile = document.getElementById('tile-gpu');
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
  tile.appendChild(card);

  for (let i = 0; i < count; i++) {
    gpuCharts[i]  = makeSparkline(`gpu-chart-${i}`,  GPU_COLORS[i % GPU_COLORS.length], GPU_BG[i % GPU_BG.length]);
    vramCharts[i] = makeSparkline(`vram-chart-${i}`, '#f59e0b', 'rgba(245,158,11,0.10)');
  }
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

  // Portfolio web requests
  if (d.portfolio_rpm != null) updatePortfolioWebStats(d.portfolio_rpm, d.portfolio_total ?? 0);

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
let currentContainers    = [];
let selectedService      = null;
let portfolioWebStats    = { rpm: null, total: null };

function updatePortfolioWebStats(rpm, total) {
  portfolioWebStats = { rpm, total };
  const rpmEl   = document.getElementById('svc2-web-rpm');
  const totalEl = document.getElementById('svc2-web-total');
  if (rpmEl)   rpmEl.textContent   = rpm.toString();
  if (totalEl) totalEl.textContent = total.toString();
}

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
    const link        = SERVICE_LINKS[c.name];
    const stats       = containerStats[c.name];
    const isRunning   = c.state === 'running';
    const isPortfolio = c.name === 'portfolio-container';
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
      ${isPortfolio ? `
      <div class="svc2-web-stats">
        <div class="svc2-web-stat">
          <span class="svc2-web-val" id="svc2-web-rpm">${portfolioWebStats.rpm ?? '—'}</span>
          <span class="svc2-web-label">req/min</span>
        </div>
        <div class="svc2-web-sep"></div>
        <div class="svc2-web-stat">
          <span class="svc2-web-val" id="svc2-web-total">${portfolioWebStats.total ?? '—'}</span>
          <span class="svc2-web-label">total (1hr)</span>
        </div>
      </div>` : ''}
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

// ── PanZoom init ──────────────────────────────────────────────────────────────
const panzoom = new PanZoom(
  document.getElementById('viewport'),
  document.getElementById('canvas')
);

// ── Panel toggle wiring ───────────────────────────────────────────────────────
document.getElementById('pt-server')  ?.addEventListener('click', () => switchPanel('server'));
document.getElementById('pt-services')?.addEventListener('click', () => switchPanel('services'));
