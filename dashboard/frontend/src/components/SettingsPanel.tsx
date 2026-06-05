import { useSettings } from '../store/useSettings';

// Staircase heights for the level-meter segments (px)
const SEG_H = [8, 9, 10, 11, 13, 14, 15, 17, 18, 20];

interface MeterProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function LevelMeter({ label, value, onChange }: MeterProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* Label + readout */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.13em',
          textTransform: 'uppercase', color: 'var(--dim)',
        }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <span style={{
            fontSize: 19, fontWeight: 700, lineHeight: 1,
            color: 'var(--blue)', fontVariantNumeric: 'tabular-nums',
          }}>
            {value}
          </span>
          <span style={{ fontSize: 9, color: 'var(--dim)', opacity: 0.45 }}>/10</span>
        </div>
      </div>

      {/* Segment bars + invisible range input */}
      <div style={{ position: 'relative', height: 22 }}>
        <div style={{
          display: 'flex', gap: 3, height: '100%',
          alignItems: 'flex-end', pointerEvents: 'none',
        }}>
          {SEG_H.map((h, i) => {
            const active = i < value;
            const last   = i === value - 1;
            const op     = active ? (last ? 1 : 0.28 + (i / 9) * 0.55) : 0.13;
            return (
              <div
                key={i}
                style={{
                  flex: 1, height: h,
                  borderRadius: '2px 2px 1px 1px',
                  background: active ? 'var(--blue)' : 'var(--surface2)',
                  opacity: op,
                  boxShadow: last ? '0 0 7px var(--blue), 0 0 2px var(--blue)' : 'none',
                  transition: 'opacity 0.07s, box-shadow 0.07s',
                }}
              />
            );
          })}
        </div>
        <input
          type="range"
          min={1} max={10} step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="seg-range"
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', margin: 0,
          }}
        />
      </div>
    </div>
  );
}

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wheelLevel, pinchLevel, update, reset } = useSettings();

  if (!open) return null;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 149 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 62, right: 6, zIndex: 150,
        width: 220,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: '2px solid var(--blue)',
        borderRadius: '0 0 10px 10px',
        overflow: 'hidden',
        boxShadow: '0 14px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 13px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface2)',
        }}>
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--dim)',
          }}>
            設定
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', color: 'var(--dim)', fontSize: 10, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 13px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{
            fontSize: 7, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--dim)', opacity: 0.45,
          }}>
            ズーム感度
          </span>

          <LevelMeter label="ホイール" value={wheelLevel} onChange={v => update({ wheelLevel: v })} />
          <LevelMeter label="ピンチ"   value={pinchLevel} onChange={v => update({ pinchLevel: v })} />

          <button
            onClick={reset}
            style={{
              marginTop: 2, width: '100%', padding: '5px 0',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--dim)', fontSize: 8,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            デフォルトに戻す
          </button>
        </div>
      </div>
    </>
  );
}
