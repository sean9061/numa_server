import { useEffect } from 'react';
import { usePanZoom } from '../../hooks/usePanZoom';
import { CpuTile }     from '../tiles/CpuTile';
import { GpuTile }     from '../tiles/GpuTile';
import { RamTile }     from '../tiles/RamTile';
import { LoadTile }    from '../tiles/LoadTile';
import { NetworkTile } from '../tiles/NetworkTile';
import { DiskTile }    from '../tiles/DiskTile';
import { PowerTile }   from '../tiles/PowerTile';
import { TILES } from '../../constants';

interface Props {
  visible: boolean;
  fitRef: React.MutableRefObject<(() => void) | null>;
}

export function ServerPanel({ visible, fitRef }: Props) {
  const { vpRef, canvasRef, fitServer } = usePanZoom(visible);

  useEffect(() => { fitRef.current = fitServer; }, [fitServer, fitRef]);
  useEffect(() => { if (visible) requestAnimationFrame(() => fitServer(false)); }, [visible, fitServer]);

  return (
    <div ref={vpRef} className="canvas-viewport" style={{ display: visible ? 'block' : 'none' }}>
      <div ref={canvasRef} className="canvas-layer">
        <div className="canvas-bg" />

        {Object.entries({
          cpu:     <CpuTile />,
          gpu:     <GpuTile />,
          ram:     <RamTile />,
          load:    <LoadTile />,
          network: <NetworkTile />,
          disk:    <DiskTile />,
          power:   <PowerTile />,
        }).map(([key, tile]) => {
          const t = TILES[key as keyof typeof TILES];
          return (
            <div key={key} className="tile" style={{ left: t.x, top: t.y, width: t.w, height: t.h }}>
              {tile}
            </div>
          );
        })}
      </div>
    </div>
  );
}
