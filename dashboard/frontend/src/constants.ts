export const CANVAS_W = 1356;
export const HIST_DISPLAY = 60;
export const MAX_HIST = 1800;
export const LOG_MAX = 200;
export const STRIP_H = 44; // bottom chart strip height

// Tile layout — GPU spans full height; row 2 sits under cpu/ram/load columns
// Col widths: 308 | 12gap | 408 | 12gap | 308 | 12gap | 296 = 1356
// Row heights: 240 | 12gap | 296 = 548
export const TILES = {
  cpu:     { x: 0,    y: 0,   w: 308, h: 240 },
  gpu:     { x: 320,  y: 0,   w: 408, h: 548 },
  ram:     { x: 740,  y: 0,   w: 308, h: 240 },
  load:    { x: 1060, y: 0,   w: 296, h: 240 },
  network: { x: 0,    y: 252, w: 308, h: 296 },
  disk:    { x: 740,  y: 252, w: 308, h: 296 },
  power:   { x: 1060, y: 252, w: 296, h: 296 },
} as const;

export const SERVER_H = 252 + 296; // 548
export const FLOW_H   = 740;       // services flow diagram total height

export const SERVICE_LINKS: Record<string, string> = {
  'portfolio-container': 'https://s3an.dev',
  'open-webui':          'https://chat.s3an.dev',
  'ollama':              'https://ollama.s3an.dev',
};

export const DISK_COLORS     = ['#3b82f6', '#818cf8', '#22c55e', '#f59e0b', '#ef4444'];
export const DISK_COLORS_DIM = [
  'rgba(59,130,246,0.15)', 'rgba(129,140,248,0.15)',
  'rgba(34,197,94,0.15)',  'rgba(245,158,11,0.15)',
  'rgba(239,68,68,0.15)',
];

export const GPU_COLORS = ['#818cf8', '#a78bfa'];
