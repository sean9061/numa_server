import { create } from 'zustand';
import type { Metrics, HistoryEntry, ContainerInfo, ContainerStats } from '../types';
import { MAX_HIST } from '../constants';

function buildHistoryEntry(d: Metrics): HistoryEntry {
  return {
    ts:        d.timestamp ?? Date.now(),
    cpu:       d.cpu?.usage   ?? null,
    cores:     d.cpu?.cores   ?? [],
    gpu: (d.gpu ?? []).map(g => ({
      usage:      g.usage,
      vram_pct:   g.vram_total ? Math.round((g.vram_used! / g.vram_total) * 100) : null,
      vram_used:  g.vram_used,
      vram_total: g.vram_total,
    })),
    ram:       d.ram?.percent    ?? null,
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
type Panel = 'server' | 'services';

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

  // Actions
  setMetrics: (d: Metrics) => void;
  setHistory: (entries: HistoryEntry[]) => void;
  setTimeWindow: (pts: number) => void;
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
