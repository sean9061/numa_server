"""エージェント・メモリ層(directive)の初期投入スクリプト (段階A)。

ゴミタスク(低重要度・見当違い)を抑制するための初期方針を `data/directives.json` に書き込む。
固定idなので**何度実行しても重複しない**(上書き)。投入後は対話(段階B)や手動編集で育てる。

実行(docker):
  docker run --rm -e DISCORD_BOT_TOKEN=x -e DISCORD_CHANNEL_ID=1 \
    -v "$PWD/data:/app/data" -v "$PWD/scripts:/app/scripts" \
    numa-agent python /app/scripts/seed_directives.py

確認: docker ... python /app/scripts/seed_directives.py --list
"""
import sys

from agent import memory

# (id, domain, priority, text)
SEED = [
    # --- global (全動作に効く) ---
    ("g-noise", "global", 90,
     "広告・宣伝・メルマガ・通知・自動配信・SNS/サービスからの定型メールは、本人が個別対応すべき用件ではないので扱わない。"),
    ("g-recruit", "global", 80,
     "採用・求人・スカウト・キャンペーン・アンケート依頼の類は、本人が望んだやり取りでない限り対応不要として扱う。"),
    # --- task (タスク抽出) ---
    ("t-actionable", "task", 100,
     "タスクは『本人が具体的な行動を起こす必要があるもの』だけにする。単なる情報共有・FYI・確認だけで完了する内容はタスク化しない。"),
    ("t-importance", "task", 95,
     "重要度を内心で1〜5に見積もり、3未満(緊急性も締切も具体的アクションも無い)はタスク化しない。迷ったら出さない方を選ぶ。"),
    ("t-dedup", "task", 70,
     "既存タスクや過去に出した提案と実質同じものは出さない。表現違いの重複も避ける。"),
]


def main() -> None:
    if "--list" in sys.argv:
        for d in memory.list_directives(include_inactive=True):
            flag = " " if d["active"] else "x"
            print(f"[{flag}] ({d['domain']}/p{d['priority']}) {d['id']}: {d['text']}")
        return
    for did, domain, prio, text in SEED:
        memory.add_directive(text, domain=domain, priority=prio, origin="seed", id=did)
    print(f"投入完了: {len(SEED)}件。確認は --list。")
    print("\n--- task領域に注入されるブロック ---")
    print(memory.directives_block("task"))


if __name__ == "__main__":
    main()
