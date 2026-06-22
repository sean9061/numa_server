import { useStore } from '../store/useStore';

const LIVE = [
  { pts: 60,   label: '2m'  },
  { pts: 300,  label: '10m' },
  { pts: 900,  label: '30m' },
  { pts: 1800, label: '1h'  },
];

const HOUR = 3_600_000;
const DAY  = 86_400_000;
const LONG = [
  { ms: 6 * HOUR,  label: '6h'  },
  { ms: 24 * HOUR, label: '24h' },
  { ms: 7 * DAY,   label: '7d'  },
  { ms: 30 * DAY,  label: '30d' },
  { ms: -1,        label: 'All' },
];

export function RangeBar({ scope = 'server' }: { scope?: 'server' | 'home' }) {
  const isHome = scope === 'home';
  const timeWindow    = useStore(s => isHome ? s.homeTimeWindow : s.timeWindow);
  const extRangeMs    = useStore(s => isHome ? s.homeExtRangeMs : s.extRangeMs);
  const extLoading    = useStore(s => isHome ? s.homeExtLoading : s.extLoading);
  const setTimeWindow = useStore(s => isHome ? s.setHomeTimeWindow : s.setTimeWindow);
  const setExtRange   = useStore(s => isHome ? s.setHomeExtRange : s.setExtRange);

  const selectLive = (pts: number) => { setExtRange(null); setTimeWindow(pts); };
  const selectLong = (ms: number)  => { setExtRange(ms); };

  return (
    <div className="rangebar">
      <div className="range-group">
        {LIVE.map(r => (
          <button
            key={r.pts}
            className={`range-pill${extRangeMs == null && timeWindow === r.pts ? ' active' : ''}`}
            onClick={() => selectLive(r.pts)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <span className="range-sep" />

      <div className="range-group">
        {LONG.map(r => (
          <button
            key={r.ms}
            className={`range-pill${extRangeMs === r.ms ? ' active' : ''}`}
            onClick={() => selectLong(r.ms)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {extLoading && <span className="range-loading">読込中…</span>}
    </div>
  );
}
