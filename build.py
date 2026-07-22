import json
import os
import re

def format_time(mins_str):
    try:
        mins = int(mins_str)
        hours = mins // 60
        minutes = mins % 60
        if hours > 0:
            return f"{hours}h {minutes:02d}m"
        return f"{minutes}m"
    except:
        return "---"

def make_stars(diff_str):
    try:
        diff = int(diff_str)
    except:
        diff = 0
    stars = ""
    for i in range(1, 6):
        if i <= diff:
            stars += '<i class="fa-solid fa-star"></i>'
        else:
            stars += '<i class="fa-regular fa-star"></i>'
    return stars

def build_recipes():
    # 1. JSON読み込み
    json_path = os.path.join("js", "recipes.json")
    if not os.path.exists(json_path):
        print("Error: js/recipes.json が見つかりません。")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        recipes = json.load(f)

    # 2. テンプレート読み込み
    if not os.path.exists("template.html"):
        print("Error: template.html が見つかりません。")
        return

    with open("template.html", "r", encoding="utf-8") as f:
        template_content = f.read()

    generated_count = 0

    for recipe in recipes:
        # ショート動画専用レシピはスキップ
        if recipe.get("isShort") is True:
            continue

        recipe_id = recipe.get("id")
        file_name = f"recipe-{recipe_id}.html"  # 出力ファイル名 (例: recipe-v066.html)

        # 時間と難易度
        formatted_time = format_time(recipe.get("time", 0))
        difficulty_stars = make_stars(recipe.get("difficulty", 0))

        # 材料HTMLと基準粉量の計算
        base_flour = 200
        ingredients_html = ""
        ingredients_ld = []

        raw_ingredients = recipe.get("ingredients", {})
        for group, items in raw_ingredients.items():
            ingredients_html += f'<div class="onao-ingredient-group"><h3>{group}</h3></div>'
            for idx, item in enumerate(items):
                name = item.get("name", "")
                amt = item.get("amount", "")
                unit = item.get("unit", "")
                ratio = item.get("ratio")

                if ratio == 100 and amt:
                    base_flour = amt

                ingredients_ld.append(f"{name} {amt}{unit}".strip())
                
                check_id = f"check-{re.sub(r'\\s+', '', group)}-{idx}"
                ingredients_html += f'''
                <div class="custom-control custom-checkbox d-flex align-items-center mb-2">
                    <input type="checkbox" class="custom-control-input ingredient-check" id="{check_id}">
                    <label class="custom-control-label d-flex justify-content-between w-100" for="{check_id}" style="cursor:pointer; padding-left:30px;">
                        <span>{name}</span><span>{amt}{unit}</span>
                    </label>
                </div>'''

        # 手順HTMLとHowToStep構造化データ
        steps_html = ""
        instructions_ld = []
        raw_steps = recipe.get("steps", [])

        for s_idx, section in enumerate(raw_steps):
            group_title = section.get("group")
            if group_title:
                steps_html += f'<div class="onao-section-title"><h3>{group_title}</h3></div>'
            
            items = section.get("items", [])
            for i_idx, step_text in enumerate(items):
                display_num = i_idx + 1
                unique_id = f"step-{s_idx}-{i_idx}"
                
                # タイマーリンク化処理（「5分割」などの誤誤爆を防ぎ、時間表記のみを正確に判定）
                processed_text = step_text
                
                def replace_timer(match):
                    full_match = match.group(0)
                    return f'<span class="timer-link" style="color:var(--onao-green); font-weight:bold; cursor:pointer; text-decoration:underline;">{full_match}</span>'

                # 「15分」「1時間半」「30秒」などのパターンのみを安全に置換
                processed_text = re.sub(
                    r'(?<![0-9a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])(\d+〜?\d*(?:時間|分|秒)(?:半)?)',
                    replace_timer,
                    processed_text
                )

                instructions_ld.append({
                    "@type": "HowToStep",
                    "text": step_text
                })

                steps_html += f'''
                <div class="single-preparation-step">
                    <div class="d-flex align-items-start">
                        <div class="step-left-column d-flex flex-column align-items-start mr-3">
                            <div class="step-number mb-2">
                                <h4>STEP {display_num}</h4>
                            </div>
                            <div class="custom-control custom-checkbox p-0 m-0">
                                <input type="checkbox" class="custom-control-input step-check" id="{unique_id}" aria-label="手順{display_num}を完了とする">
                                <label class="custom-control-label" for="{unique_id}"></label>
                            </div>
                        </div>
                        <div class="step-right-column flex-grow-1">
                            <p class="step-text">{processed_text}</p>
                        </div>
                    </div>
                </div>'''

        # JSON-LD構造化データの作成
        json_ld_data = {
            "@context": "https://schema.org/",
            "@type": "Recipe",
            "name": recipe.get("name"),
            "image": [
                f"https://img.youtube.com/vi/{recipe.get('youtube')}/maxresdefault.jpg"
            ],
            "author": {
                "@type": "Person",
                "name": "おなお"
            },
            "description": recipe.get("description", ""),
            "prepTime": f"PT{recipe.get('time', 0)}M",
            "totalTime": f"PT{recipe.get('time', 0)}M",
            "recipeIngredient": ingredients_ld,
            "recipeInstructions": instructions_ld,
            "keywords": ", ".join(recipe.get("keyword", [])) if recipe.get("keyword") else "パンレシピ, おなおドーナツ",
            "video": {
                "@type": "VideoObject",
                "name": f"{recipe.get('name')}の作り方動画",
                "description": recipe.get("description", ""),
                "thumbnailUrl": f"https://img.youtube.com/vi/{recipe.get('youtube')}/maxresdefault.jpg",
                "contentUrl": f"https://www.youtube.com/watch?v={recipe.get('youtube')}",
                "embedUrl": f"https://www.youtube.com/embed/{recipe.get('youtube')}"
            }
        }

        # テンプレートの置換
        html = template_content
        html = html.replace("{{ name }}", recipe.get("name", ""))
        html = html.replace("{{ description }}", recipe.get("description", ""))
        html = html.replace("{{ youtube }}", recipe.get("youtube", ""))
        html = html.replace("{{ file_name }}", file_name)
        html = html.replace("{{ formatted_time }}", formatted_time)
        html = html.replace("{{ difficulty_stars }}", difficulty_stars)
        html = html.replace("{{ base_flour }}", str(base_flour))
        html = html.replace("{{ ingredients_html }}", ingredients_html)
        html = html.replace("{{ steps_html }}", steps_html)
        html = html.replace("{{ json_ld }}", json.dumps(json_ld_data, ensure_ascii=False, indent=2))

        # コラム制御
        column_text = recipe.get("column", "")
        if column_text:
            html = html.replace("{% if column %}", "").replace("{% endif %}", "")
            html = html.replace("{{ column }}", column_text)
        else:
            # コラムがない場合はそのセクションごと削除
            html = re.sub(r'\{% if column %\}[\s\S]*?\{% endif %\}', '', html)

        # ファイル出力
        with open(file_name, "w", encoding="utf-8") as out:
            out.write(html)

        generated_count += 1

    print(f"完了！ {generated_count} 件の静的レシピHTMLを出力しました。")

if __name__ == "__main__":
    build_recipes()

# build.py の最後に以下のようなサイトマップ書き出し処理を追加
def generate_sitemap(recipes):
    site_url = "https://onaodonuts.com"
    
    # 固定ページのリスト
    static_pages = [
        "",
        "index.html",
        "recipe-search.html",
        "profile.html",
        # 他にある固定ページを追加
    ]
    
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    
    # 固定ページを出力
    for page in static_pages:
        xml += f'  <url>\n    <loc>{site_url}/{page}</loc>\n    <priority>0.8</priority>\n  </url>\n'
        
    # 動的に作成された全レシピページを出力
    for recipe in recipes:
        if not recipe.get("isShort"):
            recipe_id = recipe.get("id")
            xml += f'  <url>\n    <loc>{site_url}/recipe-{recipe_id}.html</loc>\n    <priority>1.0</priority>\n  </url>\n'
            
    xml += '</urlset>'
    
    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(xml)
    print("sitemap.xml も自動生成完了しました！")
