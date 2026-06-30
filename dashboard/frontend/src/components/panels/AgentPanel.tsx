import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { AgentRun, AgentStatus, GraphDef } from '../../types';

// --- グラフ図 (層別レイアウト) ---------------------------------------------
const NODE_W = 116;
const NODE_H = 32;
const GAP_X = 26;
const GAP_Y = 44;
const PAD = 16;

const LABEL: Record<string, string> = { __start__: 'START', __end__: 'END' };
const TERMINAL = new Set(['__start__', '__end__']);

interface Placed { id: string; x: number; y: number; }

function layout(def: GraphDef): { nodes: Placed[]; w: number; h: number } {
  const rank: Record<string, number> = {};
  def.nodes.forEach((n) => (rank[n] = 0));
  // __start__ からの最長経路でランク付け (DAG・辺を node数回リラックス)
  for (let i = 0; i < def.nodes.length; i++) {
    for (const e of def.edges) {
      if (rank[e.target] < rank[e.source] + 1) rank[e.target] = rank[e.source] + 1;
    }
  }
  const maxR = Math.max(0, ...Object.values(rank));
  if ('__end__' in rank) rank['__end__'] = maxR; // END は最下段へ
  const byRank: Record<number, string[]> = {};
  def.nodes.forEach((n) => ((byRank[rank[n]] ??= []).push(n)));
  const rowW = (cnt: number) => cnt * NODE_W + (cnt - 1) * GAP_X;
  const maxRowW = Math.max(...Object.values(byRank).map((r) => rowW(r.length)));
  const placed: Placed[] = [];
  for (const [r, ids] of Object.entries(byRank)) {
    const y = PAD + Number(r) * (NODE_H + GAP_Y);
    const startX = PAD + (maxRowW - rowW(ids.length)) / 2;
    ids.forEach((id, i) => placed.push({ id, x: startX + i * (NODE_W + GAP_X), y }));
  }
  return { nodes: placed, w: maxRowW + PAD * 2, h: PAD * 2 + (maxR + 1) * NODE_H + maxR * GAP_Y };
}

function GraphView({ def, activeNode }: { def: GraphDef; activeNode?: string | null }) {
  const { nodes, w, h } = useMemo(() => layout(def), [def]);
  const pos = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <svg className="agent-graph" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMin meet">
      <defs>
        <marker id="ag-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0 0 L7 3.5 L0 7 z" fill="var(--muted)" />
        </marker>
      </defs>
      {def.edges.map((e, i) => {
        const s = pos[e.source];
        const t = pos[e.target];
        if (!s || !t) return null;
        const x1 = s.x + NODE_W / 2;
        const y1 = s.y + NODE_H;
        const x2 = t.x + NODE_W / 2;
        const y2 = t.y;
        const my = (y1 + y2) / 2;
        return (
          <path
            key={i}
            d={`M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={1.3}
            strokeDasharray={e.conditional ? '4 3' : undefined}
            opacity={e.conditional ? 0.7 : 1}
            markerEnd="url(#ag-arrow)"
          />
        );
      })}
      {nodes.map((n) => {
        const term = TERMINAL.has(n.id);
        const active = n.id === activeNode;
        return (
          <g key={n.id} className={active ? 'agent-node-active' : undefined}>
            <rect
              x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={8}
              fill={active ? 'var(--gold)' : term ? 'var(--accent)' : 'var(--surface-2)'}
              stroke={active ? 'var(--gold)' : term ? 'var(--accent)' : 'var(--border)'}
              strokeWidth={active ? 2 : 1}
            />
            <text
              x={n.x + NODE_W / 2} y={n.y + NODE_H / 2 + 4}
              textAnchor="middle" fontSize={13}
              fill={active || term ? 'var(--bg)' : 'var(--text)'}
              fontWeight={active || term ? 700 : 500}
            >
              {LABEL[n.id] ?? n.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// --- 実行履歴 ---------------------------------------------------------------
const OUTCOME_COLOR: Record<string, string> = {
  applied: 'var(--accent)',
  proposed: 'var(--gold)',
  suggested: 'var(--gold)',
  awaiting_approval: 'var(--warn)',
  none: 'var(--muted)',
  error: 'var(--crit)',
};

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function RunCard({ run }: { run: AgentRun }) {
  const saw = run.saw ?? {};
  const did = run.did ?? {};
  const t = new Date(run.ts);
  const when = isNaN(+t) ? run.ts : t.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const isDraft = run.kind === 'draft';

  const sawParts = isDraft
    ? [`返信候補${num(saw.candidates)}`]
    : [`メール${num(saw.emails)}`, `予定${num(saw.events)}`,
       ...(num(saw.moodle) ? [`課題${num(saw.moodle)}`] : []),
       `既存${num(saw.existing_tasks)}`];
  const didParts = isDraft
    ? [`返信案${num(did.suggestions)}`]
    : [`提案${num(did.proposals)}`, `追加${num(did.applied)}`];

  return (
    <div className="agent-run">
      <div className="agent-run-head">
        <span className="agent-run-when">{when}</span>
        <span className="agent-badge">{run.kind}</span>
        {run.mode ? <span className="agent-badge dim">{run.mode}</span> : null}
        <span className="agent-badge dim">{run.trigger}</span>
        <span className="agent-run-outcome" style={{ color: OUTCOME_COLOR[run.outcome] ?? 'var(--dim)' }}>
          ● {run.outcome}
        </span>
      </div>
      <div className="agent-run-line"><span className="agent-run-k">見た</span>{sawParts.join(' ・ ')}</div>
      <div className="agent-run-line"><span className="agent-run-k">やった</span>{didParts.join(' ・ ')}</div>
      {saw.moodle_expired ? (
        <div className="agent-run-warn">⚠ Moodle再ログインが必要</div>
      ) : null}
      {run.error ? <div className="agent-run-err">{run.error}</div> : null}
    </div>
  );
}

// --- パネル本体 -------------------------------------------------------------
const GRAPH_ORDER = ['orchestrator', 'task', 'draft'];

export function AgentPanel() {
  const graphs = useStore((s) => s.agentGraphs);
  const runs = useStore((s) => s.agentRuns);
  const loading = useStore((s) => s.agentLoading);
  const loadAgent = useStore((s) => s.loadAgent);
  const [sel, setSel] = useState('orchestrator');
  const [userPicked, setUserPicked] = useState(false); // 手動でタブを選んだか
  const [status, setStatus] = useState<AgentStatus>({ running: false, graph: null, node: null });
  const prevRunning = useRef(false);

  useEffect(() => {
    loadAgent();
    const t = setInterval(loadAgent, 30_000); // 履歴を30秒ごとに更新
    return () => clearInterval(t);
  }, [loadAgent]);

  // ライブ状態を2秒間隔でポーリング (#72 段階2)
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = (await fetch('/api/agent/status', { credentials: 'include' }).then((r) => r.json())) as AgentStatus;
        if (alive) setStatus(s);
        // 実行が終わった瞬間に履歴を取り直す
        if (alive && prevRunning.current && !s.running) loadAgent();
        prevRunning.current = !!s?.running;
      } catch { /* 無視 */ }
    };
    poll();
    const t = setInterval(poll, 2_000);
    return () => { alive = false; clearInterval(t); };
  }, [loadAgent]);

  const names = graphs ? GRAPH_ORDER.filter((n) => graphs[n]) : [];
  // 実行中はそのグラフを自動表示 (ユーザーが手動でタブを触っていない限り)
  const running = status.running && status.graph;
  const effectiveSel = running && !userPicked && graphs?.[status.graph!] ? status.graph! : sel;
  const active = graphs?.[effectiveSel] ? effectiveSel : names[0];
  const def = active ? graphs?.[active] : undefined;
  const activeNode = running && status.graph === active ? status.node : null;

  return (
    <main className="agent-panel">
      <section className="agent-graph-box">
        <div className="agent-tabs">
          {names.map((n) => (
            <button
              key={n}
              className={`agent-tab${active === n ? ' active' : ''}`}
              onClick={() => { setSel(n); setUserPicked(true); }}
            >{n}</button>
          ))}
          <span className={`agent-live${running ? ' on' : ''}`}>
            {running ? `● 実行中: ${status.node ?? '…'}` : '○ idle'}
          </span>
        </div>
        {def ? <GraphView def={def} activeNode={activeNode} />
          : <div className="agent-empty">{loading ? 'グラフを取得中…' : 'グラフを取得できません'}</div>}
      </section>

      <section className="agent-runs-box">
        <div className="agent-runs-title">実行履歴</div>
        {runs.length === 0
          ? <div className="agent-empty">{loading ? '読み込み中…' : '実行履歴がありません'}</div>
          : <div className="agent-runs">{runs.map((r, i) => <RunCard key={`${r.ts}-${i}`} run={r} />)}</div>}
      </section>
    </main>
  );
}
