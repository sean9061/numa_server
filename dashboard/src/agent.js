// エージェント (LangGraph) パネル用のデータ提供 (#72)。
//  - getGraphs(): グラフ構造 (agent-graphs.json・compiled graph から機械生成したもの)
//  - getRuns(limit): agent の実行履歴 (runlog の data/runs.jsonl・read-only マウント) の直近N件
//
// agent コンテナ(ollama_net)と dashboard(proxy_net)はネットワーク分離されているため、
// 実行履歴は agent の data ディレクトリを read-only マウントしてファイル経由で読む (#72 段階1の方式A)。
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRAPHS_PATH = join(__dirname, 'agent-graphs.json');
// agent の data/ をマウントした場所 (compose で ../agent/data:/agent-data:ro)
const AGENT_DATA = process.env.AGENT_DATA_DIR || '/agent-data';
const RUNS_PATH = join(AGENT_DATA, 'runs.jsonl');
const STATUS_PATH = join(AGENT_DATA, 'agent_status.json');

let _graphsCache = null;

export async function getGraphs() {
  if (!_graphsCache) {
    const raw = await readFile(GRAPHS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    delete data._comment;
    _graphsCache = data;
  }
  return _graphsCache;
}

// runs.jsonl の末尾 limit 件を新しい順で返す。ファイルが無ければ空配列。
export async function getRuns(limit = 20) {
  if (!existsSync(RUNS_PATH)) return [];
  const raw = await readFile(RUNS_PATH, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());
  const tail = lines.slice(-limit);
  const runs = [];
  for (const line of tail) {
    try {
      runs.push(JSON.parse(line));
    } catch {
      // 壊れた行はスキップ
    }
  }
  return runs.reverse(); // 新しい順
}

// 実行中のライブ状態 (#72 段階2)。agent が astream 中に書き出す agent_status.json。
export async function getStatus() {
  const idle = { running: false, graph: null, node: null };
  if (!existsSync(STATUS_PATH)) return idle;
  try {
    return JSON.parse(await readFile(STATUS_PATH, 'utf-8'));
  } catch {
    return idle;
  }
}
