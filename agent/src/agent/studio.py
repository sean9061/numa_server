"""LangGraph Studio / `langgraph dev` 用のグラフ公開モジュール。

Studio(LangGraph API サーバ)は永続化(checkpoint)・割り込み再開・time-travel を
プラットフォーム側で提供するため、ここでは **checkpointer を渡さずにコンパイル**した
グラフを公開する(本番の runtime は自前の AsyncSqliteSaver で別途ビルドしている)。

langgraph.json から ./src/agent/studio.py:task などとして参照される。
"""
from .draft_graph import build_draft_graph
from .graph import build_graph
from .orchestrator import build_orchestrator_graph

task = build_graph()              # crawl → reconcile →(承認)→ apply
orchestrator = build_orchestrator_graph()  # gather → plan → execute → integrate → apply
draft = build_draft_graph()       # gather → compose
