import { STRIP_H } from '../../constants';

interface Props {
  children: React.ReactNode;
  strip?: React.ReactNode;
  stripHeight?: number;
  noPad?: boolean;
}

/** Card wrapper with optional bleed-to-edge chart strip at bottom */
export function TileCard({ children, strip, stripHeight = STRIP_H, noPad }: Props) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        flex: 1, minHeight: 0,
        padding: noPad ? 0 : '14px 14px 10px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {children}
      </div>
      {strip && (
        <>
          <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ height: stripHeight, flexShrink: 0 }}>
            {strip}
          </div>
        </>
      )}
    </div>
  );
}

/** Section label inside a card */
export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--dim)',
    }}>
      {children}
    </span>
  );
}

/** Large hero metric number */
export function HeroNumber({
  value, unit, label, color = 'var(--text)',
}: { value: string | number; unit?: string; label?: string; color?: string }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ lineHeight: 1 }}>
        <span style={{ fontSize: 46, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dim)', marginLeft: 3 }}>
            {unit}
          </span>
        )}
      </div>
      {label && (
        <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </div>
      )}
    </div>
  );
}
