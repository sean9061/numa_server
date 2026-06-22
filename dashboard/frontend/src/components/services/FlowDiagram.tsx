import { useStore } from '../../store/useStore';
import { CANVAS_W, FLOW_H } from '../../constants';
import { FlowNode } from './FlowNode';
import type { ContainerInfo, ContainerStats } from '../../types';

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W  = 220;
const NODE_H  = 130;

// Column X positions (left edge)
const X_NPM      = 100;
const X_SERVICES = 430;
const X_OLLAMA   = 770;

// Row Y positions — 4 service nodes evenly spaced within FLOW_H
const GAP         = Math.round((FLOW_H - 4 * NODE_H) / 5);
const Y_PORTFOLIO = GAP;
const Y_WEBUI     = GAP + NODE_H + GAP;
const Y_AUDIO     = GAP + NODE_H + GAP + NODE_H + GAP;
const Y_DASHBOARD = GAP + NODE_H + GAP + NODE_H + GAP + NODE_H + GAP;

// NPM vertically centered between portfolio and dashboard
const CY_MID = (Y_PORTFOLIO + NODE_H / 2 + Y_DASHBOARD + NODE_H / 2) / 2;
const Y_NPM  = Math.round(CY_MID - NODE_H / 2);

// Anchor helpers (right-center / left-center)
const anchors = {
  npm:      { lx: X_NPM,                  ly: Y_NPM      + NODE_H / 2,
              rx: X_NPM      + NODE_W,     ry: Y_NPM      + NODE_H / 2 },
  portfolio:{ lx: X_SERVICES,             ly: Y_PORTFOLIO + NODE_H / 2 },
  webui:    { lx: X_SERVICES,             ly: Y_WEBUI    + NODE_H / 2,
              rx: X_SERVICES + NODE_W,     ry: Y_WEBUI    + NODE_H / 2 },
  audio:    { lx: X_SERVICES,             ly: Y_AUDIO     + NODE_H / 2 },
  dashboard:{ lx: X_SERVICES,             ly: Y_DASHBOARD + NODE_H / 2 },
  ollama:   { lx: X_OLLAMA,               ly: Y_WEBUI    + NODE_H / 2 },
};

// ── Topology nodes ────────────────────────────────────────────────────────────

interface TopoNode {
  id: string;
  label: string;
  x: number; y: number;
  containerName?: string;
  imageMatch?: string;
}

const TOPO_NODES: TopoNode[] = [
  {
    id: 'npm', label: 'proxy-app-1',
    x: X_NPM, y: Y_NPM,
    containerName: 'proxy-app-1', imageMatch: 'nginx-proxy-manager',
  },
  {
    id: 'portfolio', label: 'portfolio-container',
    x: X_SERVICES, y: Y_PORTFOLIO,
    containerName: 'portfolio-container',
  },
  {
    id: 'webui', label: 'open-webui',
    x: X_SERVICES, y: Y_WEBUI,
    containerName: 'open-webui',
  },
  {
    id: 'audio', label: 'audio-log-distiller',
    x: X_SERVICES, y: Y_AUDIO,
    containerName: 'audio-log-distiller',
  },
  {
    id: 'dashboard', label: 'dashboard',
    x: X_SERVICES, y: Y_DASHBOARD,
    containerName: 'dashboard',
  },
  {
    id: 'ollama', label: 'ollama',
    x: X_OLLAMA, y: Y_WEBUI,
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
  { from: 'npm', to: 'portfolio',  network: 'proxy_net' },
  { from: 'npm', to: 'webui',      network: 'proxy_net' },
  { from: 'npm', to: 'audio',      network: 'proxy_net' },
  { from: 'npm', to: 'dashboard',  network: 'proxy_net' },
  { from: 'webui', to: 'ollama',   network: 'ollama_net' },
];

// ── Helper ────────────────────────────────────────────────────────────────────

function resolveContainer(
  node: TopoNode,
  containers: ContainerInfo[],
): ContainerInfo | undefined {
  return (
    containers.find(c => c.name === node.containerName) ??
    (node.imageMatch
      ? containers.find(c => c.image.includes(node.imageMatch!))
      : undefined)
  );
}

// ── Edge SVG path (horizontal S-curve) ────────────────────────────────────────

function edgePath(from: keyof typeof anchors, to: keyof typeof anchors): string {
  const s = anchors[from] as { rx: number; ry: number };
  const t = anchors[to]   as { lx: number; ly: number };
  const mx = (s.rx + t.lx) / 2;
  return `M ${s.rx} ${s.ry} C ${mx} ${s.ry} ${mx} ${t.ly} ${t.lx} ${t.ly}`;
}

// ── FlowDiagram ───────────────────────────────────────────────────────────────

export function FlowDiagram() {
  const containers     = useStore(s => s.containers);
  const containerStats = useStore(s => s.containerStats);
  const metrics        = useStore(s => s.metrics);

  const portfolioRpm = metrics?.portfolio_rpm ?? null;

  const resolved = new Map<string, ContainerInfo | undefined>(
    TOPO_NODES.map(n => [n.id, resolveContainer(n, containers)])
  );

  function isRunning(id: string): boolean {
    return resolved.get(id)?.state === 'running';
  }

  // Active = both ends running AND actual traffic signal present
  function isEdgeActive(from: keyof typeof anchors, to: keyof typeof anchors): boolean {
    if (!isRunning(from as string) || !isRunning(to as string)) return false;

    if (from === 'npm' && to === 'portfolio') {
      return (metrics?.portfolio_rpm ?? 0) > 0;
    }
    if (from === 'npm' && to === 'webui') {
      return (containerStats['open-webui']?.cpu ?? 0) > 1;
    }
    if (from === 'npm' && to === 'audio') {
      return (containerStats['audio-log-distiller']?.cpu ?? 0) > 0.5;
    }
    if (from === 'npm' && to === 'dashboard') {
      return (containerStats['dashboard']?.cpu ?? 0) > 0.5;
    }
    if (from === 'webui' && to === 'ollama') {
      return (containerStats['ollama']?.cpu ?? 0) > 2;
    }
    return false;
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
              <path
                d={d}
                fill="none"
                stroke={active ? 'rgba(34,197,94,0.12)' : 'transparent'}
                strokeWidth={active ? 8 : 0}
              />
              <path
                d={d}
                fill="none"
                stroke={active ? 'var(--green)' : '#333'}
                strokeWidth={1.5}
                strokeDasharray={active ? '7 5' : '4 4'}
                strokeOpacity={active ? 0.9 : 0.35}
                markerEnd={active ? 'url(#ah-g)' : 'url(#ah-d)'}
                className={active ? 'edge-active' : undefined}
              />
              {edge.network && (
                <EdgeLabel d={d} label={edge.network} active={active} />
              )}
            </g>
          );
        })}
      </svg>

      {/* Service nodes */}
      {TOPO_NODES.map(n => {
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
