import { useStore } from '../../store/useStore';
import { DualLineChart } from '../charts/DualLineChart';
import { CardLabel } from './TileCard';
import { fmtBps, downsample } from '../../utils';
import { HIST_DISPLAY } from '../../constants';

export function NetworkTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);

  const net  = metrics?.network;
  const slice  = history.slice(-timeWindow);
  const rxData = downsample(slice.map(e => e.net_rx ?? 0), HIST_DISPLAY);
  const txData = downsample(slice.map(e => e.net_tx ?? 0), HIST_DISPLAY);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      padding: '14px 14px 0',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <CardLabel>Network</CardLabel>
        {net?.iface && (
          <span style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'monospace' }}>{net.iface}</span>
        )}
      </div>

      {/* Chart — fills remaining space, bleeds to bottom */}
      <div style={{ flex: 1, minHeight: 0, marginTop: 8 }}>
        <DualLineChart data0={rxData} data1={txData} color0="#3b82f6" color1="#9b8ffc" tickFormatter={fmtBps} />
      </div>

      {/* Current values row — sits above bottom edge */}
      <div style={{ display: 'flex', gap: 24, flexShrink: 0, padding: '8px 0 14px' }}>
        <NetStat direction="↓" label="RX" value={fmtBps(net?.rx_sec)} color="var(--blue)" />
        <NetStat direction="↑" label="TX" value={fmtBps(net?.tx_sec)} color="var(--purple)" />
      </div>
    </div>
  );
}

function NetStat({ direction, label, value, color }: { direction: string; label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--dim)' }}>{direction} {label}</span>
    </div>
  );
}
