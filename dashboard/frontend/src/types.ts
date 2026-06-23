export interface GpuData {
  name?: string;
  usage: number;
  mem_usage?: number;
  temp?: number;
  power_draw?: number;
  power_limit?: number;
  vram_used?: number;
  vram_total?: number;
  fan_pct?: number | null;
}

export interface Metrics {
  timestamp?: number;
  uptime?: number;
  cpu?: {
    usage: number;
    temp?: number;
    power?: number;
    cores?: number[];
  };
  gpu?: GpuData[];
  ram?: {
    percent: number;
    used?: number;
    cached?: number;
    buffers?: number;
    swap_used?: number;
    swap_total?: number;
  };
  network?: {
    iface?: string;
    rx_sec?: number;
    tx_sec?: number;
  };
  disk?: Array<{
    mount: string;
    used: number;
    size: number;
  }>;
  disk_io?: {
    rx_sec?: number;
    wx_sec?: number;
  };
  disk_breakdown?: Array<{
    path: string;
    label: string;
    bytes: number;
  }>;
  power?: {
    total?: number;
    cpu?: number;
    gpu?: number;
  };
  load?: {
    m1?: number;
    m5?: number;
    m15?: number;
  };
  portfolio_rpm?: number;
  portfolio_total?: number;
  proc_count?: number;
}

export interface HistoryEntry {
  ts: number;
  cpu: number | null;
  cpu_temp?: number | null;
  cores: number[];
  gpu: Array<{
    usage: number;
    temp?: number | null;
    vram_pct: number | null;
    vram_used?: number;
    vram_total?: number;
  }>;
  ram: number | null;
  ram_used?:    number | null;
  ram_cached?:  number | null;
  ram_buffers?: number | null;
  swap_used?:   number | null;
  net_rx: number | null;
  net_tx: number | null;
  disk_rx: number | null;
  disk_wx: number | null;
  pow_total: number | null;
  pow_cpu:   number | null;
  pow_gpu:   number | null;
}

export type HomeKind = 'climate' | 'plug' | 'light' | 'lock' | 'bot' | 'keypad' | 'generic';

export interface HomeDevice {
  deviceId: string;
  name: string;
  type: string;
  kind: HomeKind;
  online: boolean;
  battery: number | null;
  // climate
  temperature?: number | null;
  humidity?: number | null;
  lightLevel?: number | null;
  // plug
  power?: number | null;
  voltage?: number | null;
  current?: number | null;
  energyDay?: number | null;
  // on/off devices
  on?: boolean | null;
  brightness?: number | null;
  color?: string | null;
  colorTemp?: number | null;
  // lock
  lockState?: string | null;
  doorState?: string | null;
  // bot
  mode?: string | null;
}

export interface HomeState {
  devices: HomeDevice[];
  error: string | null;
  enabled: boolean;
}

export interface HomeHistoryEntry {
  ts: number;
  devices: Array<{
    deviceId: string;
    temperature?: number;
    humidity?: number;
    lightLevel?: number;
    power?: number;
    voltage?: number;
    current?: number;
    battery?: number;
    brightness?: number;
  }>;
}

export interface ContainerInfo {
  name: string;
  image: string;
  state: string;
  status: string;
}

export interface ContainerStats {
  cpu?: number;
  mem_percent?: number;
  mem_used?: number;
  mem_total?: number;
  disk_r_sec?: number;
  disk_w_sec?: number;
}
