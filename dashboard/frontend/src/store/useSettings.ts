import { create } from 'zustand';

interface Settings {
  wheelLevel: number;  // 1–10 → factor 1.01–1.10
  pinchLevel: number;  // 1–10 → exponent 0.37–1.00
}

interface SettingsStore extends Settings {
  update: (s: Partial<Settings>) => void;
  reset:  () => void;
}

const DEFAULTS: Settings = { wheelLevel: 4, pinchLevel: 4 };
const KEY = 'numa-panzoom';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const s = JSON.parse(raw);
    return {
      wheelLevel: typeof s.wheelLevel === 'number' ? Math.min(10, Math.max(1, s.wheelLevel)) : DEFAULTS.wheelLevel,
      pinchLevel: typeof s.pinchLevel === 'number' ? Math.min(10, Math.max(1, s.pinchLevel)) : DEFAULTS.pinchLevel,
    };
  } catch {
    return DEFAULTS;
  }
}

export const useSettings = create<SettingsStore>((set) => ({
  ...load(),
  update: (partial) => set((s) => {
    const next = { ...s, ...partial };
    localStorage.setItem(KEY, JSON.stringify({ wheelLevel: next.wheelLevel, pinchLevel: next.pinchLevel }));
    return partial;
  }),
  reset: () => set(() => {
    localStorage.removeItem(KEY);
    return DEFAULTS;
  }),
}));
