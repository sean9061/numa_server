import { useStore } from '../../store/useStore';
import { DualLineChart } from '../charts/DualLineChart';
import { fmtBps } from '../../utils';
import { HIST_DISPLAY } from '../../constants';

export function NetworkTile() {
  const metrics    = useStore(s => s.metrics);
  const history    = useStore(s => s.history);
  const timeWindow = useStore(s => s.timeWindow);

  const net  = metrics?.network;
  const win  = Math.min(timeWindow, HIST_DISPLAY);
  const slice = history.slice(-win);
  const pad = (arr: (number | null)[]) => {
    const a = arr.slice(-win);
    return [...Array(Math.max(0, win - a.length)).fill(0), ...a] as (number | null)[];
  };
  const rxData = pad(slice.map(e => e.net_rx ?? 0));
  const txData = pad(slice.map(e => e.net_tx ?? 0));

  return (
    <div className="card">
      <div className="card-title">
        NETWORK &mdash;&nbsp;
        <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text)' }}>
          {net?.iface ?? '—'}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', marginTop: 6 }}>
        <DualLineChart data0={rxData} data1={txData} color0="#3b82f6" color1="#818cf8" />
      </div>
      <div style={{ display: 'flex', gap: 14, flexShrink: 0, marginTop: 5 }}>
        <NetStat color="var(--blue)"   val={fmtBps(net?.rx_sec)} label="↓ RX" />
        <NetStat color="var(--purple)" val={fmtBps(net?.tx_sec)} label="↑ TX" />
      </div>
    </div>
  );
}

function NetStat({ color, val, label }: { color: string; val: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
      <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
      <span style={{ color: 'var(--dim)', fontSize: 10 }}>{label}</span>
    </div>
  );
}
