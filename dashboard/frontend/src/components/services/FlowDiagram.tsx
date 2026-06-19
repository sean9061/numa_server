import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { FlowNode } from './FlowNode';
import { clamp } from '../../utils';
import type { ContainerInfo } from '../../types';

/* ── Virtual board geometry (fixed coords, scaled to fit) ─── */
const NODE_W = 230, NODE_H = 150;
const X_NPM = 30, X_SVC = 370, X_OLLAMA = 710;
const VBW = 970, VBH = 706;
const Y0 = 20, GAP = 22;
const yRow = (i: number) => Y0 + i * (NODE_H + GAP);
const Y_PORT = yRow(0), Y_WEBUI = yRow(1), Y_AUDIO = yRow(2), Y_DASH = yRow(3);
const Y_NPM = Math.round(((Y_PORT + NODE_H / 2) + (Y_DASH + NODE_H / 2)) / 2 - NODE_H / 2);

const anchors: Record<string, { x: number; y: number }> = {
  npmR:    { x: X_NPM + NODE_W,    y: Y_NPM + NODE_H / 2 },
  portL:   { x: X_SVC,             y: Y_PORT + NODE_H / 2 },
  webuiL:  { x: X_SVC,             y: Y_WEBUI + NODE_H / 2 },
  webuiR:  { x: X_SVC + NODE_W,    y: Y_WEBUI + NODE_H / 2 },
  audioL:  { x: X_SVC,             y: Y_AUDIO + NODE_H / 2 },
  dashL:   { x: X_SVC,             y: Y_DASH + NODE_H / 2 },
  ollamaL: { x: X_OLLAMA,          y: Y_WEBUI + NODE_H / 2 },
};

interface TopoNode {
  id: string; label: string; x: number; y: number; name: string; img?: string;
}
const NODES: TopoNode[] = [
  { id: 'npm',       label: 'proxy-app-1',         x: X_NPM,    y: Y_NPM,   name: 'proxy-app-1', img: 'nginx-proxy-manager' },
  { id: 'portfolio', label: 'portfolio-container', x: X_SVC,    y: Y_PORT,  name: 'portfolio-container' },
  { id: 'webui',     label: 'open-webui',          x: X_SVC,    y: Y_WEBUI, name: 'open-webui' },
  { id: 'audio',     label: 'audio-log-distiller', x: X_SVC,    y: Y_AUDIO, name: 'audio-log-distiller' },
  { id: 'dashboard', label: 'dashboard',           x: X_SVC,    y: Y_DASH,  name: 'dashboard' },
  { id: 'ollama',    label: 'ollama',              x: X_OLLAMA, y: Y_WEBUI, name: 'ollama' },
];

interface Edge { fromId: string; toId: string; from: string; to: string; net: string; }
const EDGES: Edge[] = [
  { fromId: 'npm',   toId: 'portfolio', from: 'npmR',   to: 'portL',   net: 'proxy_net' },
  { fromId: 'npm',   toId: 'webui',     from: 'npmR',   to: 'webuiL',  net: 'proxy_net' },
  { fromId: 'npm',   toId: 'audio',     from: 'npmR',   to: 'audioL',  net: 'proxy_net' },
  { fromId: 'npm',   toId: 'dashboard', from: 'npmR',   to: 'dashL',   net: 'proxy_net' },
  { fromId: 'webui', toId: 'ollama',    from: 'webuiR', to: 'ollamaL', net: 'ollama_net' },
];

function edgePath(from: string, to: string): string {
  const s = anchors[from], t = anchors[to];
  const mx = (s.x + t.x) / 2;
  return `M ${s.x} ${s.y} C ${mx} ${s.y} ${mx} ${t.y} ${t.x} ${t.y}`;
}

function resolveContainer(node: TopoNode, containers: ContainerInfo[]): ContainerInfo | undefined {
  return containers.find(c => c.name === node.name)
    ?? (node.img ? containers.find(c => c.image.includes(node.img!)) : undefined);
}

export function FlowDiagram() {
  const containers     = useStore(s => s.containers);
  const containerStats = useStore(s => s.containerStats);
  const metrics        = useStore(s => s.metrics);
  const portfolioRpm   = metrics?.portfolio_rpm ?? null;
  const portfolioTotal = metrics?.portfolio_total ?? null;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (cw === 0 || ch === 0) return;
      const fit = Math.min(cw / VBW, ch / VBH);
      setScale(clamp(fit, 0.4, 1));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const resolved = new Map(NODES.map(n => [n.id, resolveContainer(n, containers)]));
  const isRunning = (id: string) => resolved.get(id)?.state === 'running';

  function trafficSignal(toId: string): boolean {
    switch (toId) {
      case 'portfolio': return (portfolioRpm ?? 0) > 0;
      case 'webui':     return (containerStats['open-webui']?.cpu ?? 0) > 1;
      case 'audio':     return (containerStats['audio-log-distiller']?.cpu ?? 0) > 0.5;
      case 'dashboard': return (containerStats['dashboard']?.cpu ?? 0) > 0.5;
      case 'ollama':    return (containerStats['ollama']?.cpu ?? 0) > 2;
      default:          return false;
    }
  }
  const isEdgeActive = (e: Edge) => isRunning(e.fromId) && isRunning(e.toId) && trafficSignal(e.toId);

  return (
    <div className="flow-viewport" ref={wrapRef}>
      <div className="flow-scaler" style={{ width: VBW * scale, height: VBH * scale }}>
        <div className="flow-board" style={{ width: VBW, height: VBH, transform: `scale(${scale})` }}>
          <svg className="flow-edges" viewBox={`0 0 ${VBW} ${VBH}`} width={VBW} height={VBH}>
            <defs>
              <marker id="arrow-on" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 1 L 9 5 L 0 9 Z" fill="var(--accent)" />
              </marker>
              <marker id="arrow-off" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 1 L 9 5 L 0 9 Z" fill="#3a4757" />
              </marker>
            </defs>
            {EDGES.map((e, i) => {
              const active = isEdgeActive(e);
              const d = edgePath(e.from, e.to);
              const m = anchors[e.from], n = anchors[e.to];
              return (
                <g key={i}>
                  <path
                    d={d} fill="none"
                    stroke={active ? 'var(--accent)' : '#3a4757'}
                    strokeWidth={1.6}
                    strokeDasharray={active ? '7 5' : '4 5'}
                    strokeOpacity={active ? 0.95 : 0.5}
                    markerEnd={active ? 'url(#arrow-on)' : 'url(#arrow-off)'}
                    className={active ? 'edge-active' : undefined}
                  />
                  <text
                    x={(m.x + n.x) / 2} y={(m.y + n.y) / 2 - 7}
                    textAnchor="middle" fontSize={11} fontWeight={600} letterSpacing="0.04em"
                    fill={active ? 'var(--accent3)' : 'var(--muted)'}
                    fontFamily="Inter, system-ui, sans-serif"
                  >
                    {e.net}
                  </text>
                </g>
              );
            })}
          </svg>

          {NODES.map(n => {
            const c = resolved.get(n.id);
            return (
              <div key={n.id} className="fnode-pos" style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}>
                <FlowNode
                  container={c}
                  stats={c ? containerStats[c.name] : undefined}
                  label={n.label}
                  isPortfolio={n.id === 'portfolio'}
                  portfolioRpm={n.id === 'portfolio' ? portfolioRpm : null}
                  portfolioTotal={n.id === 'portfolio' ? portfolioTotal : null}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
