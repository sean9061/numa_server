export const CANVAS_W = 1268;
export const HIST_DISPLAY = 60;
export const MAX_HIST = 1800;
export const LOG_MAX = 200;
export const STRIP_H = 44; // bottom chart strip height

// Tile layout — Row 1 (h=220), Row 2 (y=232, h=260)
export const TILES = {
  cpu:     { x: 0,   y: 0,   w: 284, h: 220 },
  gpu:     { x: 296, y: 0,   w: 388, h: 220 },
  ram:     { x: 696, y: 0,   w: 284, h: 220 },
  load:    { x: 992, y: 0,   w: 276, h: 220 },
  network: { x: 0,   y: 232, w: 476, h: 260 },
  disk:    { x: 488, y: 232, w: 296, h: 260 },
  power:   { x: 796, y: 232, w: 472, h: 260 },
} as const;

export const SERVER_H = 232 + 260; // 492

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
