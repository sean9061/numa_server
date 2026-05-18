import { useEffect } from 'react';
import { usePanZoom } from '../../hooks/usePanZoom';
import { useStore } from '../../store/useStore';
import { ServiceCard } from '../services/ServiceCard';
import { LogDrawer }   from '../services/LogDrawer';
import { CANVAS_W } from '../../constants';

interface Props {
  visible: boolean;
}

export function ServicesPanel({ visible }: Props) {
  const { vpRef, canvasRef, fitServer } = usePanZoom(visible);
  const containers     = useStore(s => s.containers);
  const containerStats = useStore(s => s.containerStats);
  const metrics        = useStore(s => s.metrics);

  const portfolioRpm   = metrics?.portfolio_rpm ?? null;
  const portfolioTotal = metrics?.portfolio_total ?? null;

  useEffect(() => {
    if (visible) requestAnimationFrame(() => fitServer(false));
  }, [visible, fitServer]);

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        display: visible ? 'flex' : 'none',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      <div ref={vpRef} className="canvas-viewport" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div ref={canvasRef} className="canvas-layer" style={{ width: CANVAS_W }}>
          <div className="canvas-bg" />
          <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, padding: 6, zIndex: 1 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
              gap: 6,
            }}>
              {containers.length === 0
                ? <div style={{ color: 'var(--dim)', fontSize: 12, padding: 8 }}>Loading...</div>
                : containers.map(c => (
                  <ServiceCard
                    key={c.name}
                    container={c}
                    stats={containerStats[c.name]}
                    portfolioRpm={portfolioRpm}
                    portfolioTotal={portfolioTotal}
                  />
                ))
              }
            </div>
          </div>
        </div>
      </div>
      <LogDrawer />
    </div>
  );
}
