import { useEffect } from 'react';
import { usePanZoom } from '../../hooks/usePanZoom';
import { LogDrawer }  from '../services/LogDrawer';
import { FlowDiagram } from '../services/FlowDiagram';
import { CANVAS_W, FLOW_H } from '../../constants';

interface Props {
  visible: boolean;
}

export function ServicesPanel({ visible }: Props) {
  const { vpRef, canvasRef, goto } = usePanZoom(visible);

  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      const vp = vpRef.current;
      if (!vp) return;
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      const sW = (vw - 40) / CANVAS_W;
      const sH = (vh - 60) / FLOW_H;
      const s  = Math.min(1.0, sW, sH, 1.15);
      goto(CANVAS_W / 2, FLOW_H / 2, Math.max(0.18, s), false);
    });
  }, [visible, goto, vpRef]);

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
          <FlowDiagram />
        </div>

      </div>
      <LogDrawer />
    </div>
  );
}
