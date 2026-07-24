import json
import os

def add_keys():
    json_path = os.path.join("js", "recipes.json")
    if not os.path.exists(json_path):
        print("Error: js/recipes.json が見つかりません。")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        recipes = json.load(f)

    updated_count = 0
    for recipe in recipes:
        # まだ uploadDate キーが存在しない場合のみ追加
        if "uploadDate" not in recipe:
            recipe["uploadDate"] = ""  # 空の箱を用意（あるいは "2024-01-01" などでもOK）
            updated_count += 1

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(recipes, f, ensure_ascii=False, indent=4)

    print(f"完了！ {updated_count} 件のレシピに uploadDate の箱を追加しました。")

if __name__ == "__main__":
    add_keys()
