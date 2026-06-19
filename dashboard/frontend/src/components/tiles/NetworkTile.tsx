import { useStore } from '../../store/useStore';
import { C, HIST_DISPLAY } from '../../constants';
import { useViewHistory } from '../../hooks/useViewHistory';
import { Card, Stat } from '../ui';
import { MirrorNet } from '../charts';
import { fmtBps, downsample } from '../../utils';

export function NetworkTile() {
  const m = useStore(s => s.metrics?.network);
  const win = useViewHistory();

  const rx = downsample(win.map(e => e.net_rx ?? null), HIST_DISPLAY);
  const tx = downsample(win.map(e => e.net_tx ?? null), HIST_DISPLAY);

  return (
    <Card
      title="NETWORK"
      area="net"
      dot={C.accent}
      head={<span className="stat-value" style={{ color: 'var(--dim)' }}>{m?.iface ?? '—'}</span>}
    >
      <div className="chart">
        <MirrorNet rx={rx} tx={tx} rxColor={C.accent} txColor={C.gold} />
      </div>
      <div className="stat-row">
        <Stat label="↓ RX" value={<span style={{ color: C.accent }}>{fmtBps(m?.rx_sec)}</span>} />
        <Stat label="↑ TX" value={<span style={{ color: C.warn }}>{fmtBps(m?.tx_sec)}</span>} />
      </div>
    </Card>
  );
}
