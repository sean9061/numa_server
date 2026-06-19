export const HIST_DISPLAY = 60;    // chart render points (always fixed)
export const MAX_HIST = 1800;      // frontend store limit (1h at 2s intervals)
export const CHART_PTS = 60;       // recent points sliced from history for live charts
export const LOG_MAX = 200;        // max log lines retained

/** Chart colours (JS side — CSS mirrors these in :root) */
export const C = {
  accent:  '#81a6c6',
  accent2: '#6A8AAF',
  accent3: '#b9d1e6',
  cream:   '#f5ebd4',
  gold:    '#ffe3a3',
  warn:    '#ffe3a3',
  crit:    '#d98a8e',
  text:    '#ccd8e5',
  dim:     '#8497ab',
  track:   '#2d3947',
} as const;

/** Donut palette — cycled for disk mounts / breakdown slices */
export const PIE_COLORS = ['#6A8AAF', '#81a6c6', '#b9d1e6', '#ffe3a3', '#f5ebd4'];

export const SERVICE_LINKS: Record<string, string> = {
  'portfolio-container': 'https://s3an.dev',
  'open-webui':          'https://chat.s3an.dev',
  'ollama':              'https://ollama.s3an.dev',
  'audio-log-distiller': 'https://distiller.s3an.dev',
};
