import { create } from 'zustand';
import type { Metrics, HistoryEntry, ContainerInfo, ContainerStats, HomeState, HomeHistoryEntry } from '../types';
import { MAX_HIST } from '../constants';

function buildHistoryEntry(d: Metrics): HistoryEntry {
  return {
    ts:        d.timestamp ?? Date.now(),
    cpu:       d.cpu?.usage   ?? null,
    cpu_temp:  d.cpu?.temp    ?? null,
    cores:     d.cpu?.cores   ?? [],
    gpu: (d.gpu ?? []).map(g => ({
      usage:      g.usage,
      temp:       g.temp ?? null,
      vram_pct:   g.vram_total ? Math.round((g.vram_used! / g.vram_total) * 100) : null,
      vram_used:  g.vram_used,
      vram_total: g.vram_total,
    })),
    ram:         d.ram?.percent   ?? null,
    ram_used:    d.ram?.used      ?? null,
    ram_cached:  d.ram?.cached    ?? null,
    ram_buffers: d.ram?.buffers   ?? null,
    swap_used:   d.ram?.swap_used ?? null,
    net_rx:    d.network?.rx_sec ?? null,
    net_tx:    d.network?.tx_sec ?? null,
    disk_rx:   d.disk_io?.rx_sec ?? null,
    disk_wx:   d.disk_io?.wx_sec ?? null,
    pow_total: d.power?.total ?? null,
    pow_cpu:   d.power?.cpu   ?? null,
    pow_gpu:   d.power?.gpu   ?? null,
  };
}

type WsStatus = 'connecting' | 'connected' | 'reconnecting';
type Panel = 'server' | 'services' | 'home';

const HOME_MAX_HIST = 1440; // mirrors backend home ring

interface Store {
  // WebSocket
  wsStatus: WsStatus;

  // Live metrics
  metrics: Metrics | null;
  history: HistoryEntry[];
  timeWindow: number;

  // Docker
  containers: ContainerInfo[];
  containerStats: Record<string, ContainerStats>;

  // UI state
  activePanel: Panel;
  selectedService: string | null;
  logLines: string[];

  // Extended history (long time ranges fetched from API)
  extHistory:  HistoryEntry[] | null;
  extLoading:  boolean;
  extRangeMs:  number | null; // null = use ring buffer; -1 = all time; >0 = ms span

  // Home (SwitchBot) panel
  home: HomeState | null;
  homeHistory: HomeHistoryEntry[];
  homeTimeWindow: number;
  homeExtHistory: HomeHistoryEntry[] | null;
  homeExtLoading: boolean;
  homeExtRangeMs: number | null;

  // Actions
  setMetrics: (d: Metrics) => void;
  setHistory: (entries: HistoryEntry[]) => void;
  setTimeWindow: (pts: number) => void;
  setExtRange: (ms: number | null) => Promise<void>;
  setHome: (d: HomeState) => void;
  setHomeHistory: (entries: HomeHistoryEntry[]) => void;
  setHomeTimeWindow: (pts: number) => void;
  setHomeExtRange: (ms: number | null) => Promise<void>;
  setContainers: (c: ContainerInfo[]) => void;
  updateContainerStats: (arr: Array<{ name: string; stats: ContainerStats | null }>) => void;
  setActivePanel: (p: Panel) => void;
  setSelectedService: (name: string | null) => void;
  appendLog: (container: string, line: string) => void;
  clearLogs: () => void;
  setWsStatus: (s: WsStatus) => void;
}

export const useStore = create<Store>((set, get) => ({
  wsStatus: 'connecting',
  metrics: null,
  history: [],
  timeWindow: 60,
  containers: [],
  containerStats: {},
  activePanel: 'server',
  selectedService: null,
  logLines: [],

  extHistory: null,
  extLoading: false,
  extRangeMs: null,

  home: null,
  homeHistory: [],
  homeTimeWindow: 60,
  homeExtHistory: null,
  homeExtLoading: false,
  homeExtRangeMs: null,

  setMetrics: (d) => {
    const entry = buildHistoryEntry(d);
    set(s => ({
      metrics: d,
      history: s.history.length >= MAX_HIST
        ? [...s.history.slice(1), entry]
        : [...s.history, entry],
    }));
  },

  setHistory: (entries) => set({ history: entries }),

  setTimeWindow: (pts) => set({ timeWindow: pts }),

  setExtRange: async (ms) => {
    if (ms == null) {
      set({ extHistory: null, extLoading: false, extRangeMs: null });
      return;
    }
    set({ extRangeMs: ms, extLoading: true, extHistory: null });
    const now  = Date.now();
    const from = ms === -1 ? 0 : now - ms;
    try {
      const res  = await fetch(`/api/history?from=${from}&to=${now}&buckets=300`, { credentials: 'include' });
      const data = await res.json() as HistoryEntry[];
      set({ extHistory: data, extLoading: false });
    } catch {
      set({ extLoading: false });
    }
  },

  setHome: (home) => set(s => {
    // Each live `home` message is one history tick — append to the ring.
    const entry: HomeHistoryEntry = {
      ts: Date.now(),
      devices: home.devices.map(d => ({
        deviceId: d.deviceId,
        ...(d.temperature != null && { temperature: d.temperature }),
        ...(d.humidity    != null && { humidity: d.humidity }),
        ...(d.lightLevel  != null && { lightLevel: d.lightLevel }),
        ...(d.power       != null && { power: d.power }),
        ...(d.voltage     != null && { voltage: d.voltage }),
        ...(d.current     != null && { current: d.current }),
        ...(d.battery     != null && { battery: d.battery }),
        ...(d.brightness  != null && { brightness: d.brightness }),
      })),
    };
    return {
      home,
      homeHistory: s.homeHistory.length >= HOME_MAX_HIST
        ? [...s.homeHistory.slice(1), entry]
        : [...s.homeHistory, entry],
    };
  }),

  setHomeHistory: (homeHistory) => set({ homeHistory }),

  setHomeTimeWindow: (homeTimeWindow) => set({ homeTimeWindow }),

  setHomeExtRange: async (ms) => {
    if (ms == null) {
      set({ homeExtHistory: null, homeExtLoading: false, homeExtRangeMs: null });
      return;
    }
    set({ homeExtRangeMs: ms, homeExtLoading: true, homeExtHistory: null });
    const now  = Date.now();
    const from = ms === -1 ? 0 : now - ms;
    try {
      const res  = await fetch(`/api/home/history?from=${from}&to=${now}&buckets=300`, { credentials: 'include' });
      const data = await res.json() as HomeHistoryEntry[];
      set({ homeExtHistory: data, homeExtLoading: false });
    } catch {
      set({ homeExtLoading: false });
    }
  },

  setContainers: (containers) => set({ containers }),

  updateContainerStats: (arr) => set(s => {
    const next = { ...s.containerStats };
    arr.forEach(({ name, stats }) => { if (stats) next[name] = stats; });
    return { containerStats: next };
  }),

  setActivePanel: (activePanel) => set({ activePanel }),

  setSelectedService: (name) => set({ selectedService: name, logLines: [] }),

  appendLog: (container, line) => {
    if (get().selectedService !== container) return;
    set(s => {
      const lines = s.logLines.length >= 200
        ? [...s.logLines.slice(1), line]
        : [...s.logLines, line];
      return { logLines: lines };
    });
  },

  clearLogs: () => set({ logLines: [] }),

  setWsStatus: (wsStatus) => set({ wsStatus }),
}));

// WebSocket singleton (outside React tree)
let ws: WebSocket | null = null;
let wsDelay = 1000;

export function wsConnect() {
  const store = useStore.getState();
  store.setWsStatus('connecting');

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    wsDelay = 1000;
    useStore.getState().setWsStatus('connected');
    const sel = useStore.getState().selectedService;
    if (sel) ws!.send(JSON.stringify({ type: 'subscribe_logs', container: sel }));
  };

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data as string);
      const s = useStore.getState();
      if (msg.type === 'metrics')          s.setMetrics(msg.data);
      if (msg.type === 'history')          s.setHistory(msg.data);
      if (msg.type === 'home')             s.setHome(msg.data);
      if (msg.type === 'home_history')     s.setHomeHistory(msg.data);
      if (msg.type === 'docker')           s.setContainers(msg.data);
      if (msg.type === 'container_stats')  s.updateContainerStats(msg.data);
      if (msg.type === 'log')              s.appendLog(msg.container, msg.line);
    } catch { /* ignore */ }
  };

  ws.onclose = () => {
    useStore.getState().setWsStatus('reconnecting');
    setTimeout(() => { wsDelay = Math.min(wsDelay * 1.5, 15000); wsConnect(); }, wsDelay);
  };

  ws.onerror = () => ws?.close();
}

export function wsSend(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
