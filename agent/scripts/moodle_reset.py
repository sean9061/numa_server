"""Moodle のタスク(Notion)と記憶(seen)をリセットして再取り込みできるようにする。

- Notion: source プロパティに "moodle:" を含むページ(=エージェントがMoodleから作った課題)を
  アーカイブ(ゴミ箱へ)。手動作成タスクは source が無いので巻き込まない。
- seen: data/seen_sources.json から "moodle:" の由来IDを削除し、再提案できるようにする。

実行(エージェントは停止してから):
  docker compose stop agent
  docker compose run --rm -v "$PWD/scripts:/app/scripts" agent python /app/scripts/moodle_reset.py
  docker compose up -d   # 再起動で run_on_start により再クロール
"""
import json
import os
import sys

from agent.config import settings
from agent.tools import notion


def reset_notion() -> list[str]:
    schema = notion._schema()
    client = notion._client()
    src_prop = settings.notion_source_prop
    archived: list[str] = []
    cursor = None
    while True:
        kw = {"data_source_id": schema["data_source_id"], "page_size": 100}
        if cursor:
            kw["start_cursor"] = cursor
        res = client.data_sources.query(**kw)
        for p in res.get("results", []):
            sp = p.get("properties", {}).get(src_prop, {})
            text = "".join(t.get("plain_text", "") for t in sp.get("rich_text", []))
            if "moodle:" in text:
                client.pages.update(page_id=p["id"], archived=True)
                archived.append(notion._extract_title(p, schema["title_prop"]))
        if not res.get("has_more"):
            break
        cursor = res.get("next_cursor")
    return archived


def reset_seen() -> int:
    path = os.path.join(settings.data_dir, "seen_sources.json")
    try:
        with open(path, encoding="utf-8") as f:
            store = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return 0
    removed = [k for k in store if any(t.startswith("moodle:") for t in k.split())]
    for k in removed:
        del store[k]
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return len(removed)


def main() -> int:
    archived = reset_notion()
    print(f"Notion: {len(archived)}件アーカイブ")
    for t in archived:
        print("  -", t)
    n = reset_seen()
    print(f"seen: moodle {n}件削除")
    print("→ docker compose up -d で再クロールされます。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
