import { useStore } from '../../store/useStore';
import { useViewHistory } from '../../hooks/useViewHistory';
import { Sparkline } from '../charts/Sparkline';
import { TileCard, CardLabel, HeroNumber } from './TileCard';
import { FanIcon } from '../FanIcon';
import { statusColor, barColor, downsample } from '../../utils';
import { HIST_DISPLAY } from '../../constants';

export function CpuTile() {
  const metrics = useStore(s => s.metrics);
  const history = useViewHistory();

  const cpu  = metrics?.cpu;
  const pct  = cpu?.usage ?? 0;
  const data = downsample(history.map(e => e.cpu), HIST_DISPLAY);

  return (
    <TileCard strip={<Sparkline data={data} color="#3b82f6" strip />}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <CardLabel>CPU</CardLabel>
        {cpu?.temp != null && (
          <Pill>{cpu.temp}°C</Pill>
        )}
      </div>

      {/* Hero */}
      <div style={{ marginTop: 10, flexShrink: 0 }}>
        <HeroNumber
          value={cpu ? pct : '—'}
          unit={cpu ? '%' : undefined}
          label="Usage"
          color={statusColor(pct)}
        />
      </div>

      {/* Core bars */}
      {cpu?.cores && cpu.cores.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, marginTop: 10 }}>
          <CoreGrid cores={cpu.cores} />
        </div>
      )}

      {/* Power + Fan */}
      <div style={{ marginTop: 6, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {cpu?.power != null
          ? <Pill dim>⚡ {cpu.power}W</Pill>
          : <span />}
        {cpu?.fan_rpm != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--dim)' }}>
            <FanIcon rpm={cpu.fan_rpm} size={13} />
            <Pill dim>{cpu.fan_rpm} RPM</Pill>
          </div>
        )}
      </div>
    </TileCard>
  );
}

function CoreGrid({ cores }: { cores: number[] }) {
  const COLS = 4;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${COLS}, 1fr)`,
      gap: '4px 8px',
      height: '100%',
      alignContent: 'start',
    }}>
      {cores.map((usage, i) => {
        const pct = usage ?? 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 8, color: 'var(--dim)', width: 10, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{i}</span>
            <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', minWidth: 0 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: barColor(pct), borderRadius: 2, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Pill({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <span style={{ fontSize: 11, color: dim ? 'var(--dim)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  );
}
