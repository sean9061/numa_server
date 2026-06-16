"""プレーンな状態に戻すリセットツール (RAG/directive 効果テスト用)。

エージェントが「処理済み」とみなしている記憶と、Notionへ追加したタスクを消し、
次回クロールで全件を再評価させる。**directives.json(方針) と Chroma は消さない**
(テスト対象＝残す)。

消す対象:
  1. data/seen_sources.json  — タスク由来の記憶(applied/rejected) → 全タスク再提案
  2. data/seen_drafts.json   — 返信案を提示済みメールの記憶 → 全候補を再評価
  3. Notion のエージェント追加タスク — タグ(Select=Agent) か 由来(source) を持つページを
     archive(=ゴミ箱へ。Notion上で30日間は復元可能)。ユーザー自作タスクには触れない。

既定はドライラン(集計のみ・無変更)。実行は --apply。
  ドライラン: python /app/scripts/reset_state.py
  実行:       python /app/scripts/reset_state.py --apply
"""
import os
import sys

from agent.config import settings
from agent.tools import notion


def _is_agent_task(page: dict) -> bool:
    """Select=Agent タグ または source(由来) を持つ = エージェント追加。"""
    props = page.get("properties", {})
    tag = props.get(settings.notion_tag_prop, {})
    names = []
    if tag.get("type") == "select" and tag.get("select"):
        names = [tag["select"].get("name")]
    elif tag.get("type") == "multi_select":
        names = [o.get("name") for o in tag.get("multi_select", [])]
    if settings.notion_agent_tag in names:
        return True
    src = props.get(settings.notion_source_prop, {})
    if src.get("type") == "rich_text" and src.get("rich_text"):
        return True
    return False


def _all_pages() -> list[dict]:
    client = notion._client()
    schema = notion._schema()
    pages, cursor = [], None
    while True:
        kw = {"data_source_id": schema["data_source_id"], "page_size": 100}
        if cursor:
            kw["start_cursor"] = cursor
        res = client.data_sources.query(**kw)
        pages.extend(res.get("results", []))
        if not res.get("has_more"):
            break
        cursor = res.get("next_cursor")
    return pages, client, schema


def main() -> None:
    apply = "--apply" in sys.argv
    no_notion = "--no-notion" in sys.argv  # 記憶ファイルだけ消す(Notionアクセスなし)
    mode = "APPLY(実行)" if apply else "DRY-RUN(集計のみ・無変更)"
    print(f"=== reset_state [{mode}{' / no-notion' if no_notion else ''}] ===")

    if not no_notion:
        pages, client, schema = _all_pages()
        agent_pages = [p for p in pages if _is_agent_task(p)]
        print(f"Notion 総タスク: {len(pages)}件 / うちエージェント追加: {len(agent_pages)}件")
        for p in agent_pages[:10]:
            print(f"  - {notion._extract_title(p, schema['title_prop'])}")
        if len(agent_pages) > 10:
            print(f"  …他 {len(agent_pages) - 10}件")
    else:
        print("Notion: 対象外(--no-notion) ※ Notionタスクは手動で削除してください")

    seen_files = [
        os.path.join(settings.data_dir, "seen_sources.json"),
        os.path.join(settings.data_dir, "seen_drafts.json"),
    ]
    print("\n消す記憶ファイル:")
    for f in seen_files:
        print(f"  - {f} ({'存在' if os.path.exists(f) else '無し'})")
    print("※ directives.json と chroma/ は残す(テスト対象)")

    if not apply:
        print("\n--apply を付けると上記を実行します。")
        return

    print("\n--- 実行 ---")
    if not no_notion:
        archived = 0
        for p in agent_pages:
            client.pages.update(page_id=p["id"], archived=True)
            archived += 1
        print(f"Notion: {archived}件を archive(ゴミ箱へ)")
    for f in seen_files:
        if os.path.exists(f):
            os.remove(f)
            print(f"削除: {f}")
    print("\n完了。次回クロールでプレーンな状態から再評価されます。")
    print("※ 稼働中agentは記憶をメモリにキャッシュ済み。反映には agent コンテナの再起動が必要。")


if __name__ == "__main__":
    main()
