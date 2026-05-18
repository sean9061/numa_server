import { useEffect } from 'react';
import { usePanZoom } from '../../hooks/usePanZoom';
import { CpuTile }     from '../tiles/CpuTile';
import { GpuTile }     from '../tiles/GpuTile';
import { RamTile }     from '../tiles/RamTile';
import { LoadTile }    from '../tiles/LoadTile';
import { NetworkTile } from '../tiles/NetworkTile';
import { DiskTile }    from '../tiles/DiskTile';
import { PowerTile }   from '../tiles/PowerTile';

interface Props {
  visible: boolean;
  fitRef: React.MutableRefObject<(() => void) | null>;
}

export function ServerPanel({ visible, fitRef }: Props) {
  const { vpRef, canvasRef, fitServer } = usePanZoom(visible);

  useEffect(() => {
    fitRef.current = fitServer;
  }, [fitServer, fitRef]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => fitServer(false));
  }, [visible, fitServer]);

  return (
    <div
      ref={vpRef}
      className="canvas-viewport"
      style={{ display: visible ? 'block' : 'none' }}
    >
      <div ref={canvasRef} className="canvas-layer">
        <div className="canvas-bg" />

        {/* Row 1: CPU | GPU | RAM | Load */}
        <div className="tile" style={{ left: 0,    top: 0, width: 310, height: 260 }}><CpuTile /></div>
        <div className="tile" style={{ left: 322,  top: 0, width: 388, height: 260 }}><GpuTile /></div>
        <div className="tile" style={{ left: 722,  top: 0, width: 310, height: 260 }}><RamTile /></div>
        <div className="tile" style={{ left: 1044, top: 0, width: 224, height: 260 }}><LoadTile /></div>

        {/* Row 2: Network | Disk | Power */}
        <div className="tile" style={{ left: 0,   top: 272, width: 460, height: 280 }}><NetworkTile /></div>
        <div className="tile" style={{ left: 472, top: 272, width: 290, height: 280 }}><DiskTile /></div>
        <div className="tile" style={{ left: 774, top: 272, width: 258, height: 280 }}><PowerTile /></div>
      </div>
    </div>
  );
}
