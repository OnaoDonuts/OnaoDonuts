#!/usr/bin/env python3
"""recipes.json の文章を、決まった文字列の置き換えで書き換える小さなツール。

使い方:
    python apply_column_edits.py edits_v089.json            # 実際に書き換える（recipes.json.bak に元を保存）
    python apply_column_edits.py edits_v089.json --dry-run  # 書き換えずに確認だけ
    python apply_column_edits.py edits_v089.json --json path/to/recipes.json

edits ファイルの形:
    [{"id": "v089", "replacements": [{"before": "元の文章", "after": "新しい文章"}, ...]}]

安全のため、次の場合は何も書き換えずに止まります。
  - 該当のレシピの中に before が見つからない / 2か所以上ある
  - 書き換え後の recipes.json が JSON として正しくない
元ファイルの書式（インデントや改行）は、置き換えた部分以外は一切変わりません。
"""
import json
import re
import shutil
import sys


def esc(s):
    """JSONの文字列として書かれている形に直す（" や \\ を含んでも一致するように）"""
    return json.dumps(s, ensure_ascii=False)[1:-1]


def recipe_range(text, rid):
    m = re.search(r'"id":\s*' + re.escape(json.dumps(rid)), text)
    if not m:
        raise SystemExit(f"エラー: id {rid} が recipes.json に見つかりません。")
    nxt = re.search(r'"id":\s*"', text[m.end():])
    end = m.end() + nxt.start() if nxt else len(text)
    return m.start(), end


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("-"):
        raise SystemExit(__doc__)
    edits_path = args[0]
    dry = "--dry-run" in args
    json_path = "js/recipes.json"
    if "--json" in args:
        json_path = args[args.index("--json") + 1]

    with open(json_path, "r", encoding="utf-8") as f:
        text = f.read()
    with open(edits_path, "r", encoding="utf-8") as f:
        edits = json.load(f)

    new_text = text
    for edit in edits:
        rid = edit["id"]
        for rep in edit["replacements"]:
            start, end = recipe_range(new_text, rid)
            block = new_text[start:end]
            before, after = esc(rep["before"]), esc(rep["after"])
            n = block.count(before)
            if n != 1:
                head = rep["before"][:30]
                raise SystemExit(f"エラー: {rid} で「{head}…」が{n}か所見つかりました（1か所である必要があります）。何も書き換えていません。")
            new_text = new_text[:start] + block.replace(before, after, 1) + new_text[end:]
            print(f"OK: {rid} 「{rep['before'][:20]}…」→「{rep['after'][:20]}…」")

    json.loads(new_text)  # JSONとして正しいか

    if dry:
        print("--dry-run のため、書き換えていません。")
        return
    shutil.copyfile(json_path, json_path + ".bak")
    with open(json_path, "w", encoding="utf-8") as f:
        f.write(new_text)
    print(f"完了: {json_path} を書き換えました（元のファイルは {json_path}.bak）。")


if __name__ == "__main__":
    main()
