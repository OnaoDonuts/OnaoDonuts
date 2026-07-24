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

def generate_sitemap(recipes):
    site_url = "https://onaodonuts.com"
    
    static_pages = [
        "",
        "index.html",
        "recipe-search.html",
        "video-list.html",
        "profile.html",
        "policy.html",
        "contact.html",
    ]
    
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    
    for page in static_pages:
        xml += f'  <url>\n    <loc>{site_url}/{page}</loc>\n    <priority>0.8</priority>\n  </url>\n'
        
    for recipe in recipes:
        if not recipe.get("isShort"):
            recipe_id = recipe.get("id")
            xml += f'  <url>\n    <loc>{site_url}/recipe-{recipe_id}.html</loc>\n    <priority>1.0</priority>\n  </url>\n'
            
    xml += '</urlset>'
    
    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(xml)
    print("sitemap.xml も自動生成完了しました！")

def build_recipes():
    json_path = os.path.join("js", "recipes.json")
    if not os.path.exists(json_path):
        print("Error: js/recipes.json が見つかりません。")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        recipes = json.load(f)

    if not os.path.exists("template.html"):
        print("Error: template.html が見つかりません。")
        return

    with open("template.html", "r", encoding="utf-8") as f:
        template_content = f.read()

    generated_count = 0

    for recipe in recipes:
        if recipe.get("isShort") is True:
            continue

        recipe_id = recipe.get("id")
        file_name = f"recipe-{recipe_id}.html"

        image_dir = os.path.join("img", "recipes", recipe_id)
        os.makedirs(image_dir, exist_ok=True)

        formatted_time = format_time(recipe.get("time", 0))
        difficulty_stars = make_stars(recipe.get("difficulty", 0))

        youtube_id = recipe.get("youtube")
        
        # JSONからuploadDateを取得。空欄または未設定ならデフォルト値（例: 2024-01-01）を適用
        upload_date = recipe.get("uploadDate")
        if not upload_date or not upload_date.strip():
            upload_date = "2024-01-01"

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
                
                processed_text = step_text
                
                def replace_timer(match):
                    full_match = match.group(0)
                    return f'<span class="timer-link" style="color:var(--onao-green); font-weight:bold; cursor:pointer; text-decoration:underline;">{full_match}</span>'

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

        # JSON-LD構造化データ
        json_ld_data = {
            "@context": "https://schema.org/",
            "@type": "Recipe",
            "name": recipe.get("name"),
            "image": [
                f"https://img.youtube.com/vi/{youtube_id}/maxresdefault.jpg"
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
                "thumbnailUrl": f"https://img.youtube.com/vi/{youtube_id}/maxresdefault.jpg",
                "contentUrl": f"https://www.youtube.com/watch?v={youtube_id}",
                "embedUrl": f"https://www.youtube.com/embed/{youtube_id}",
                "uploadDate": f"{upload_date}T00:00:00+09:00"
            }
        }

        html = template_content
        html = html.replace("{{ name }}", recipe.get("name", ""))
        html = html.replace("{{ description }}", recipe.get("description", ""))
        html = html.replace("{{ youtube }}", youtube_id or "")
        html = html.replace("{{ file_name }}", file_name)
        html = html.replace("{{ formatted_time }}", formatted_time)
        html = html.replace("{{ difficulty_stars }}", difficulty_stars)
        html = html.replace("{{ base_flour }}", str(base_flour))
        html = html.replace("{{ ingredients_html }}", ingredients_html)
        html = html.replace("{{ steps_html }}", steps_html)
        html = html.replace("{{ json_ld }}", json.dumps(json_ld_data, ensure_ascii=False, indent=2))

        column_text = recipe.get("column", "")
        if column_text:
            html = html.replace("{% if column %}", "").replace("{% endif %}", "")
            html = html.replace("{{ column }}", column_text)
        else:
            html = re.sub(r'\{% if column %\}[\s\S]*?\{% endif %\}', '', html)

        with open(file_name, "w", encoding="utf-8") as out:
            out.write(html)

        generated_count += 1

    print(f"完了！ {generated_count} 件の静的レシピHTMLを出力しました。")
    generate_sitemap(recipes)

if __name__ == "__main__":
    build_recipes()
