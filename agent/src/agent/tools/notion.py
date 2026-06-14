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


def create_task(title: str, due: str | None = None, source: str | None = None) -> str:
    """新規タスクを作成しページIDを返す。due/source は対応プロパティが存在する場合のみ設定。"""
    schema = _schema()
    props = schema["props"]
    properties: dict = {schema["title_prop"]: {"title": [{"text": {"content": title}}]}}

    due_prop = settings.notion_due_prop
    if due and due_prop in props and props[due_prop].get("type") == "date":
        properties[due_prop] = {"date": {"start": due}}

    src_prop = settings.notion_source_prop
    if source and src_prop and src_prop in props and props[src_prop].get("type") == "rich_text":
        properties[src_prop] = {"rich_text": [{"text": {"content": source}}]}

    page = _client().pages.create(
        parent={"type": "data_source_id", "data_source_id": schema["data_source_id"]},
        properties=properties,
    )
    log.info("Notion: タスク作成 '%s'", title)
    return page["id"]
