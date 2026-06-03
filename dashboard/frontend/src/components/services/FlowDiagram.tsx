import { useStore } from '../../store/useStore';
import { CANVAS_W, FLOW_H } from '../../constants';
import { FlowNode } from './FlowNode';
import type { ContainerInfo, ContainerStats } from '../../types';

// ── Layout constants ──────────────────────────────────────────────────────────

const CX       = CANVAS_W / 2; // 678
const NODE_W   = 220;
const NODE_H   = 130;
const VNODE_W  = 120;
const VNODE_H  = 32;

const Y_INTERNET = 22;
const Y_NPM      = 72;
const Y_ROW      = 296;
const Y_OLLAMA   = 484;

// Node center X coords
const X_NPM       = CX;
const X_PORTFOLIO = CX - 300;
const X_WEBUI     = CX;
const X_DASHBOARD = CX + 300;
const X_OLLAMA    = CX;

// Anchor helpers (center-top / center-bottom of each node)
const anchors = {
  internet: { bx: CX, by: Y_INTERNET + VNODE_H },
  npm:      { tx: X_NPM,       ty: Y_NPM,            bx: X_NPM,       by: Y_NPM + NODE_H },
  portfolio:{ tx: X_PORTFOLIO, ty: Y_ROW },
  webui:    { tx: X_WEBUI,     ty: Y_ROW,             bx: X_WEBUI,     by: Y_ROW + NODE_H },
  dashboard:{ tx: X_DASHBOARD, ty: Y_ROW },
  ollama:   { tx: X_OLLAMA,    ty: Y_OLLAMA },
};

// ── Topology nodes ────────────────────────────────────────────────────────────

interface TopoNode {
  id: string;
  label: string;
  x: number; y: number;
  virtual?: true;
  containerName?: string;
  imageMatch?: string;
}

const TOPO_NODES: TopoNode[] = [
  {
    id: 'internet', label: 'Internet',
    x: CX - VNODE_W / 2, y: Y_INTERNET,
    virtual: true,
  },
  {
    id: 'npm', label: 'proxy-app-1',
    x: X_NPM - NODE_W / 2, y: Y_NPM,
    containerName: 'proxy-app-1', imageMatch: 'nginx-proxy-manager',
  },
  {
    id: 'portfolio', label: 'portfolio-container',
    x: X_PORTFOLIO - NODE_W / 2, y: Y_ROW,
    containerName: 'portfolio-container',
  },
  {
    id: 'webui', label: 'open-webui',
    x: X_WEBUI - NODE_W / 2, y: Y_ROW,
    containerName: 'open-webui',
  },
  {
    id: 'dashboard', label: 'dashboard',
    x: X_DASHBOARD - NODE_W / 2, y: Y_ROW,
    containerName: 'dashboard',
  },
  {
    id: 'ollama', label: 'ollama',
    x: X_OLLAMA - NODE_W / 2, y: Y_OLLAMA,
    containerName: 'ollama',
  },
];

// ── Edges ─────────────────────────────────────────────────────────────────────

interface Edge {
  from: keyof typeof anchors;
  to: keyof typeof anchors;
  network?: string;
}

const EDGES: Edge[] = [
  { from: 'internet', to: 'npm' },
  { from: 'npm', to: 'portfolio',  network: 'proxy_net' },
  { from: 'npm', to: 'webui',      network: 'proxy_net' },
  { from: 'npm', to: 'dashboard',  network: 'proxy_net' },
  { from: 'webui', to: 'ollama',   network: 'ollama_net' },
];

// ── Helper: match container to topology node ───────────────────────────────────

function resolveContainer(
  node: TopoNode,
  containers: ContainerInfo[],
): ContainerInfo | undefined {
  if (!node.containerName) return undefined;
  return (
    containers.find(c => c.name === node.containerName) ??
    (node.imageMatch
      ? containers.find(c => c.image.includes(node.imageMatch!))
      : undefined)
  );
}

// ── Edge SVG path ─────────────────────────────────────────────────────────────

function edgePath(from: keyof typeof anchors, to: keyof typeof anchors): string {
  const s = anchors[from] as { bx: number; by: number };
  const t = anchors[to]   as { tx: number; ty: number };
  const my = (s.by + t.ty) / 2;
  // Cubic bezier: both control points at vertical midpoint (works for straight vertical too)
  return `M ${s.bx} ${s.by} C ${s.bx} ${my} ${t.tx} ${my} ${t.tx} ${t.ty}`;
}

// ── FlowDiagram ───────────────────────────────────────────────────────────────

export function FlowDiagram() {
  const containers     = useStore(s => s.containers);
  const containerStats = useStore(s => s.containerStats);
  const metrics        = useStore(s => s.metrics);

  const portfolioRpm = metrics?.portfolio_rpm ?? null;

  // Build id → container lookup
  const resolved = new Map<string, ContainerInfo | undefined>(
    TOPO_NODES.map(n => [n.id, resolveContainer(n, containers)])
  );

  function isEdgeActive(from: keyof typeof anchors, to: keyof typeof anchors): boolean {
    if (from === 'internet') {
      // Active as long as NPM is running
      const npm = resolved.get('npm');
      return npm?.state === 'running';
    }
    return resolved.get(from)?.state === 'running' &&
           resolved.get(to)?.state   === 'running';
  }

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: FLOW_H, zIndex: 1 }}>

      {/* SVG edges (behind nodes) */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <marker id="ah-g" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 1 L 9 5 L 0 9 Z" fill="var(--green)" />
          </marker>
          <marker id="ah-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 1 L 9 5 L 0 9 Z" fill="#3a3a3a" />
          </marker>
        </defs>

        {EDGES.map((edge, i) => {
          const active = isEdgeActive(edge.from, edge.to);
          const d      = edgePath(edge.from, edge.to);
          return (
            <g key={i}>
              {/* Inactive shadow */}
              <path
                d={d}
                fill="none"
                stroke={active ? 'rgba(34,197,94,0.12)' : 'transparent'}
                strokeWidth={active ? 8 : 0}
              />
              {/* Main stroke */}
              <path
                d={d}
                fill="none"
                stroke={active ? 'var(--green)' : '#333'}
                strokeWidth={active ? 1.5 : 1.5}
                strokeDasharray={active ? '7 5' : '4 4'}
                strokeOpacity={active ? 0.9 : 0.35}
                markerEnd={active ? 'url(#ah-g)' : 'url(#ah-d)'}
                className={active ? 'edge-active' : undefined}
              />
              {/* Network label */}
              {edge.network && (
                <EdgeLabel d={d} label={edge.network} active={active} />
              )}
            </g>
          );
        })}
      </svg>

      {/* Virtual Internet node */}
      <VirtualNode label="Internet" x={CX - VNODE_W / 2} y={Y_INTERNET} w={VNODE_W} h={VNODE_H} />

      {/* Service nodes */}
      {TOPO_NODES.filter(n => !n.virtual).map(n => {
        const container = resolved.get(n.id);
        const stats: ContainerStats | undefined = container
          ? containerStats[container.name]
          : undefined;
        return (
          <div key={n.id} style={{ position: 'absolute', left: n.x, top: n.y, width: NODE_W, height: NODE_H }}>
            <FlowNode
              container={container}
              stats={stats}
              label={n.label}
              portfolioRpm={n.id === 'portfolio' ? portfolioRpm : null}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VirtualNode({ label, x, y, w, h }: { label: string; x: number; y: number; w: number; h: number }) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: w, height: h,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 20,
      fontSize: 11, fontWeight: 600,
      color: 'var(--dim)',
      userSelect: 'none',
    }}>
      <span style={{ fontSize: 13 }}>🌐</span>
      {label}
    </div>
  );
}

// Compute approximate midpoint of a cubic bezier at t=0.5
function bezierMid(d: string): { x: number; y: number } | null {
  const m = d.match(/M ([\d.]+) ([\d.]+) C ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/);
  if (!m) return null;
  const [p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y] = m.slice(1).map(Number);
  const t = 0.5;
  const mt = 1 - t;
  return {
    x: mt**3*p0x + 3*mt**2*t*p1x + 3*mt*t**2*p2x + t**3*p3x,
    y: mt**3*p0y + 3*mt**2*t*p1y + 3*mt*t**2*p2y + t**3*p3y,
  };
}

function EdgeLabel({ d, label, active }: { d: string; label: string; active: boolean }) {
  const mid = bezierMid(d);
  if (!mid) return null;
  return (
    <text
      x={mid.x}
      y={mid.y - 6}
      textAnchor="middle"
      fontSize={9}
      fill={active ? 'rgba(34,197,94,0.65)' : 'rgba(100,100,100,0.5)'}
      fontFamily="Inter, system-ui, sans-serif"
      fontWeight="600"
      letterSpacing="0.05em"
    >
      {label}
    </text>
  );
}
