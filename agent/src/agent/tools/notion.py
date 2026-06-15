"""Notion タスクDB 連携。タイトルプロパティはスキーマから自動検出する。

提供: list_tasks() 既存タスク取得 / create_task() 新規作成。
DBごとにプロパティ名が異なるため、title型プロパティは自動検出し、
締切(date)と由来ID(rich_text)のプロパティ名は設定(.env)で指定する。

※ 新しい Notion API では DB の下に「データソース(data source)」があり、
   プロパティ定義とクエリ・作成はデータソース側で行う。
   DB ID から先頭のデータソースを解決して使う。
"""
from __future__ import annotations

import logging
from functools import lru_cache

from notion_client import Client

from ..config import settings

log = logging.getLogger("agent.tools.notion")


def _client() -> Client:
    if not settings.notion_api_token:
        raise RuntimeError("NOTION_API_TOKEN が未設定です。")
    return Client(auth=settings.notion_api_token)


@lru_cache(maxsize=1)
def _schema() -> dict:
    """DB→先頭データソースを解決し、プロパティ定義と title プロパティ名をキャッシュ。"""
    client = _client()
    db = client.databases.retrieve(database_id=settings.notion_tasks_db_id)
    sources = db.get("data_sources", [])
    if not sources:
        raise RuntimeError("Notion DB にデータソースが見つかりません。DB IDを確認してください。")
    ds_id = sources[0]["id"]
    ds = client.data_sources.retrieve(data_source_id=ds_id)
    props = ds.get("properties", {})
    title_prop = next((name for name, p in props.items() if p.get("type") == "title"), None)
    if not title_prop:
        raise RuntimeError("Notion データソースに title 型プロパティが見つかりません。")
    return {"data_source_id": ds_id, "title_prop": title_prop, "props": props}


def _extract_title(page: dict, title_prop: str) -> str:
    rich = page.get("properties", {}).get(title_prop, {}).get("title", [])
    return "".join(t.get("plain_text", "") for t in rich).strip()


def list_tasks() -> list[dict]:
    """既存タスク(タイトル + ページID)を返す。重複提案の除去に使う。"""
    schema = _schema()
    res = _client().data_sources.query(data_source_id=schema["data_source_id"], page_size=100)
    out = [
        {"id": p["id"], "title": _extract_title(p, schema["title_prop"])}
        for p in res.get("results", [])
    ]
    log.info("Notion: 既存タスク %d件", len(out))
    return out


def _apply_status(properties: dict, props: dict) -> None:
    """デフォルトのステータスを設定。status型は既存オプションに一致する場合のみ設定する
    (status型は API から新規オプションを作れないため。select型は自動作成される)。"""
    prop_name = settings.notion_status_prop
    value = settings.notion_default_status
    if not prop_name or not value or prop_name not in props:
        return
    ptype = props[prop_name].get("type")
    if ptype == "status":
        options = props[prop_name].get("status", {}).get("options", [])
        if not any(o.get("name") == value for o in options):
            log.warning("Notion: status '%s' に '%s' が無いためスキップ", prop_name, value)
            return
        properties[prop_name] = {"status": {"name": value}}
    elif ptype == "select":
        properties[prop_name] = {"select": {"name": value}}


def _apply_tag(properties: dict, props: dict) -> None:
    """挿入者タグ(例: Agent)を付与。multi_select/select の双方に対応(オプションは自動作成)。"""
    prop_name = settings.notion_tag_prop
    value = settings.notion_agent_tag
    if not prop_name or not value or prop_name not in props:
        return
    ptype = props[prop_name].get("type")
    if ptype == "multi_select":
        properties[prop_name] = {"multi_select": [{"name": value}]}
    elif ptype == "select":
        properties[prop_name] = {"select": {"name": value}}


def create_task(
    title: str,
    due: str | None = None,
    source: str | None = None,
    source_url: str | None = None,
    source_label: str | None = None,
) -> str:
    """新規タスクを作成しページIDを返す。

    due/source は対応プロパティが存在する場合のみ設定する。
    source_url があれば由来プロパティをクリック可能なリンクにし、ページ本文にも
    「🔗 ソース」リンクブロックを追加する。ステータスと挿入者タグはデフォルトで付与する。
    """
    schema = _schema()
    props = schema["props"]
    properties: dict = {schema["title_prop"]: {"title": [{"text": {"content": title}}]}}

    due_prop = settings.notion_due_prop
    if due and due_prop in props and props[due_prop].get("type") == "date":
        properties[due_prop] = {"date": {"start": due}}

    # 由来: 重複判定のためテキストは source(ID) のまま、リンクがあれば url を付与
    src_prop = settings.notion_source_prop
    if source and src_prop and src_prop in props and props[src_prop].get("type") == "rich_text":
        text: dict = {"content": source}
        if source_url:
            text["link"] = {"url": source_url}
        properties[src_prop] = {"rich_text": [{"text": text}]}

    _apply_status(properties, props)
    _apply_tag(properties, props)

    children = None
    if source_url:
        label = source_label or source or "ソース"
        children = [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [
                        {"type": "text", "text": {"content": "🔗 ソース: "}},
                        {"type": "text", "text": {"content": label, "link": {"url": source_url}}},
                    ]
                },
            }
        ]

    page = _client().pages.create(
        parent={"type": "data_source_id", "data_source_id": schema["data_source_id"]},
        properties=properties,
        **({"children": children} if children else {}),
    )
    log.info("Notion: タスク作成 '%s'", title)
    return page["id"]
