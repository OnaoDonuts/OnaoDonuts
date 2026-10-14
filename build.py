import html as htmllib
import json
import os
import re
from datetime import datetime

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

def to_plain_text(text):
    """HTMLタグ・「[動画 09:20]」を取り除いた、プレーンな文章にする（構造化データ・メタ説明用）"""
    t = str(text or "")
    t = re.sub(r"<br\s*/?>", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"<[^>]+>", "", t)
    t = htmllib.unescape(t)
    t = re.sub(r"[（(]\s*\[動画[^\]]*\]\s*[）)]", "", t)
    t = re.sub(r"\[動画[^\]]*\]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def iso_duration(minutes):
    """分 → ISO 8601 の長さ（例：270 → PT4H30M）。不正な値なら None。"""
    try:
        m = int(minutes)
    except (TypeError, ValueError):
        return None
    if m <= 0:
        return None
    h, mm = divmod(m, 60)
    out = "PT"
    if h:
        out += f"{h}H"
    if mm or not h:
        out += f"{mm}M"
    return out


def clean_keywords(keywords, limit=10):
    """キーワードの重複（大文字小文字違い含む）を除き、最大 limit 個にする。"""
    seen, out = set(), []
    for k in keywords or []:
        k = str(k).strip()
        if k and k.lower() not in seen:
            seen.add(k.lower())
            out.append(k)
    return out[:limit]


# ---- 著者ボックスの内容（ここを書き換えれば、全レシピページに反映されます）----
AUTHOR = {
    "name": "おなおドーナツ",
    "tagline": "主婦です / パン作りとプログラミングが趣味です",
    "bio": (
        "子供の頃からパンが大好きで、お家で自由に作り始めたのがきっかけです。"
        "YouTubeチャンネルを中心に、ホームベーカリー（HB）を使ったレシピや、"
        "成形が楽しいパン、手軽に作れるこねないパンの作り方を発信しています。"
    ),
    "image": "img/core-img/logo-profile.png",
    "youtube_url": "https://youtube.com/@OnaoDonuts",
    "profile_url": "profile.html",
    "recipes_url": "recipe-search.html",
}


def iso_date(value):
    """'2024-12-15' や '2024-12-15T00:00:00' → '2024-12-15'。読み取れなければ空文字。"""
    m = re.match(r"^\s*(\d{4})-(\d{1,2})-(\d{1,2})", str(value or ""))
    if not m:
        return ""
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def format_date_ja(iso):
    y, m, d = iso.split("-")
    return f"{int(y)}年{int(m)}月{int(d)}日"


def build_author_box(recipe):
    """記事の末尾に置く、著者ボックスと公開日・最終更新日。"""
    pub = iso_date(recipe.get("uploadDate"))
    upd = iso_date(recipe.get("updatedDate"))

    dates = ""
    if pub:
        dates += f'<span>公開日：<time datetime="{pub}">{format_date_ja(pub)}</time></span>'
    if upd and upd != pub:
        dates += f'<span>最終更新日：<time datetime="{upd}">{format_date_ja(upd)}</time></span>'
    dates_html = f'\n            <p class="onao-author-dates">{dates}</p>' if dates else ""

    a = AUTHOR
    return f'''
                    <aside class="onao-author-box" aria-label="この記事を書いた人">
                        <div class="onao-author-head">
                            <a href="{esc(a['profile_url'])}" rel="author"><img class="onao-author-avatar" src="{esc(a['image'])}" alt="{esc(a['name'])}" width="72" height="72" loading="lazy"></a>
                            <div>
                                <p class="onao-author-label">この記事を書いた人</p>
                                <p class="onao-author-name"><a href="{esc(a['profile_url'])}" rel="author">{esc(a['name'])}</a></p>
                                <p class="onao-author-tagline">{esc(a['tagline'])}</p>
                            </div>
                        </div>
                        <p class="onao-author-bio">{esc(a['bio'])}</p>
                        <ul class="onao-author-links">
                            <li><a href="{esc(a['youtube_url'])}" target="_blank" rel="noopener"><i class="fa-brands fa-youtube" aria-hidden="true"></i> YouTubeチャンネル</a></li>
                            <li><a href="{esc(a['profile_url'])}"><i class="fa-solid fa-user" aria-hidden="true"></i> 運営者について</a></li>
                            <li><a href="{esc(a['recipes_url'])}"><i class="fa-solid fa-list" aria-hidden="true"></i> レシピ一覧</a></li>
                        </ul>{dates_html}
                    </aside>'''


def read_partial(path):
    """header.html などの部品ファイルを読む。無ければ空文字を返す。"""
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def esc(text):
    """HTMLの属性値・本文に安全に入れるためのエスケープ"""
    return htmllib.escape(htmllib.unescape(str(text)), quote=True)


def plain_step_title(step_title):
    """手順の見出しからHTMLタグと「[動画 09:20]」を取り除く（画像のalt用）"""
    t = re.sub(r"<[^>]+>", "", step_title)
    t = re.sub(r"[（(]?\s*\[動画[^\]]*\]\s*[）)]?", "", t)
    return t.strip()


def get_image_size(path):
    """Pillow があれば画像サイズ(width, height)を返す。無ければ None。"""
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.size
    except Exception:
        return None


def pick_related(recipe, recipes, count=3):
    """関連レシピを固定で選ぶ（毎回同じ結果）。
    同じカテゴリーのレシピをID順に並べ、自分の次のものから count 件を選ぶ。
    足りなければ、ほかのレシピをID順で補う。"""
    cur_id = recipe.get("id", "")
    cur_cats = recipe.get("category") or []
    if not isinstance(cur_cats, list):
        cur_cats = [cur_cats]

    candidates = [r for r in recipes if not r.get("isShort") and r.get("id") != cur_id]
    candidates.sort(key=lambda r: r.get("id", ""))

    def has_common_category(r):
        cats = r.get("category") or []
        if not isinstance(cats, list):
            cats = [cats]
        return any(c in cur_cats for c in cats)

    same = [r for r in candidates if cur_cats and has_common_category(r)]
    same_ids = {r.get("id") for r in same}
    others = [r for r in candidates if r.get("id") not in same_ids]

    def rotate(lst):
        start = next((i for i, r in enumerate(lst) if r.get("id", "") > cur_id), 0)
        return lst[start:] + lst[:start]

    picked = rotate(same)[:count]
    if len(picked) < count:
        picked += rotate(others)[:count - len(picked)]
    return picked


def build_related_html(picked):
    out = ""
    for r in picked:
        rid = esc(r.get("id", ""))
        name = esc(r.get("name", ""))
        yt = esc(r.get("youtube", ""))
        out += f'''
                <div class="col-12 col-sm-4 mb-4">
                    <div class="onao-related-card" style="cursor:pointer;">
                        <a href="recipe-{rid}.html" style="display:block; color:inherit; text-decoration:none;">
                            <div class="onao-related-thumb" style="position: relative; overflow: hidden; background: #000;">
                                <img src="https://img.youtube.com/vi/{yt}/hqdefault.jpg" alt="{name}の完成写真" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; transform: scale(1.4); transform-origin: center;" onerror="this.onerror=null; this.src='https://img.youtube.com/vi/{yt}/mqdefault.jpg';">
                            </div>
                            <div class="onao-related-body">
                                <h3 style="font-size:1rem; margin-top:10px; color:#4b3e2a;">{name}</h3>
                            </div>
                        </a>
                    </div>
                </div>'''
    return out


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

# ---- 手書きページ（index.html など）へのヘッダー・フッター埋め込み ----
STATIC_PAGES = [
    "index.html",
    "recipe-search.html",
    "video-list.html",
    "profile.html",
    "policy.html",
    "contact.html",
]


def _add_prerender_attr(open_tag):
    if "data-prerendered" in open_tag:
        return open_tag
    return open_tag[:-1] + ' data-prerendered="1">'


def _wrap(marker, content):
    return f"<!-- prerender:{marker}:start -->\n{content}\n<!-- prerender:{marker}:end -->"


def inject_partials_into_static_pages(header_html, footer_html, bottom_nav_html):
    """手書きページの header / footer / bottom-nav を、JSではなく最初からHTMLに埋め込む。
    <!-- prerender:◯◯:start --> と <!-- prerender:◯◯:end --> の間を、毎回最新の部品で置き換える。
    何度実行しても同じ結果になる（冪等）。"""

    header_pat = re.compile(r'(<header\b[^>]*\bid="header-placeholder"[^>]*>)[\s\S]*?(</header>)')

    def div_pat(eid, marker):
        return re.compile(
            r'(<div\b[^>]*\bid="' + eid + r'"[^>]*>)'
            r'(?:\s*<!-- prerender:' + marker + r':start -->[\s\S]*?<!-- prerender:' + marker + r':end -->)?'
            r'\s*(</div>)'
        )

    # 外側の <footer> と、footer.html 内の <footer> が入れ子にならないよう、外側を <div> にする（空のうちに1回だけ）
    nested_footer = re.compile(
        r'<footer class="footer-area">(\s*<div id="footer-placeholder"[^>]*></div>'
        r'\s*<div id="footer-nav-placeholder"[^>]*></div>\s*)</footer>'
    )

    for page in STATIC_PAGES:
        if not os.path.exists(page):
            print(f"スキップ: {page} が見つかりません。")
            continue

        with open(page, "r", encoding="utf-8") as f:
            src = f.read()
        out = nested_footer.sub(lambda m: '<div class="footer-area">' + m.group(1) + '</div>', src)

        targets = [
            ("header", header_pat, header_html),
            ("footer", div_pat("footer-placeholder", "footer"), footer_html),
            ("bottom-nav", div_pat("footer-nav-placeholder", "bottom-nav"), bottom_nav_html),
        ]
        for marker, pat, content in targets:
            if not content:
                continue
            if not pat.search(out):
                print(f"注意: {page} の {marker} 部分が想定の形ではないため、埋め込みをスキップしました。")
                continue
            out = pat.sub(
                lambda m, mk=marker, ct=content: m.group(1)[:-1] + ('' if 'data-prerendered' in m.group(1) else ' data-prerendered="1"') + '>'
                + _wrap(mk, ct.strip("\n")) + m.group(2),
                out,
                count=1
            )

        if out != src:
            with open(page, "w", encoding="utf-8") as f:
                f.write(out)
            print(f"埋め込み完了: {page}")
        else:
            print(f"変更なし: {page}")


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

    header_html = read_partial("header.html")
    footer_html = read_partial("footer.html")
    bottom_nav_html = read_partial("bottom-nav.html")
    for fname, content in (("header.html", header_html), ("footer.html", footer_html), ("bottom-nav.html", bottom_nav_html)):
        if not content:
            print(f"注意: {fname} が見つからないため、その部分はこれまで通りJSで読み込みます。")

    # footer.html 内の「document.write(年)」は、HTMLに埋め込む時に実行されないため、ビルド時の年に置き換える
    footer_html = re.sub(
        r"<script>\s*document\.write\(new Date\(\)\.getFullYear\(\)\);?\s*</script>",
        str(datetime.now().year),
        footer_html
    )

    generated_count = 0
    long_titles = []

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

        # Get uploadDate from JSON. Use default value if empty or not set.
        upload_date = recipe.get("uploadDate")
        if not upload_date or not upload_date.strip():
            upload_date = "2024-01-01"

        base_flour = 200
        base_yield = recipe.get("yield")
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

        global_step_no = 0  # 画像ファイル名(step-N.webp)用の、ページ全体の通し番号

        for s_idx, section in enumerate(raw_steps):
            group_title = section.get("group")
            anchor_id = section.get("anchor", group_title)

            if group_title:
                steps_html += f'<div class="onao-section-title" id="{anchor_id}"><h3>{group_title}</h3></div>'

            items = section.get("items", [])
            section_steps_ld = []


            for i_idx, step_text in enumerate(items):
                display_num = i_idx + 1
                global_step_no += 1
                unique_id = f"step-{s_idx}-{i_idx}"

                # 時間表記のタイマーリンク化は recipe-detail-static.js 側で一括処理する
                processed_text = step_text

                # Split STEP text into title and description at the first double line break.
                step_parts = re.split(
                    r'<br\s*/?>\s*<br\s*/?>',
                    processed_text,
                    maxsplit=1,
                    flags=re.IGNORECASE
                )

                step_title = step_parts[0].strip()
                step_description = step_parts[1].strip() if len(step_parts) > 1 else ""

                if step_description:
                    step_content = f'<strong>{step_title}</strong><br><br>{step_description}'
                else:
                    step_content = f'<strong>{step_title}</strong>'

                # 手順画像：ファイルがあれば最初からHTMLに書き出す（JSに頼らない）
                step_image_html = ""
                img_rel = f"img/recipes/{recipe_id}/step-{global_step_no}.webp"
                if os.path.exists(img_rel):
                    size = get_image_size(img_rel)
                    size_attr = f' width="{size[0]}" height="{size[1]}"' if size else ""
                    alt_title = plain_step_title(step_title) or f"手順{global_step_no}"
                    alt_text = esc("：".join([p for p in [recipe.get("name", ""), alt_title] if p]))
                    step_image_html = (
                        f'<div class="step-inserted-image mt-2 mb-2">'
                        f'<img src="{img_rel}" alt="{alt_text}"{size_attr} loading="lazy" '
                        f'style="width: 100%; max-width: 420px; height: auto; border-radius: 10px; '
                        f'box-shadow: 0 4px 12px rgba(0,0,0,0.08); display: block; margin-top: 8px;">'
                        f'</div>'
                    )

                # 構造化データ用の手順（HTMLタグなし。画像があれば image も付ける）
                ld_name = to_plain_text(step_title)
                ld_text = to_plain_text(step_description) or ld_name
                # name（短い見出し）と url（その手順への直リンク）は、すべての手順に付ける
                ld_step = {
                    "@type": "HowToStep",
                    "name": ld_name or ld_text,
                    "text": ld_text,
                    "url": f"https://onaodonuts.com/{file_name}#{unique_id}",
                }
                if os.path.exists(img_rel):
                    ld_step["image"] = f"https://onaodonuts.com/{img_rel}"
                section_steps_ld.append(ld_step)

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
                            <div class="step-text" style="font-size: 1rem; font-weight: 400; line-height: 1.8; color: #5d4037;">{step_content}</div>{step_image_html}
                        </div>
                    </div>
                </div>'''

            if group_title and len(raw_steps) > 1:
                instructions_ld.append({
                    "@type": "HowToSection",
                    "name": to_plain_text(group_title),
                    "itemListElement": section_steps_ld
                })
            else:
                instructions_ld.extend(section_steps_ld)

        # JSON-LD structured data
        description_plain = to_plain_text(recipe.get("description", ""))
        total_time_iso = iso_duration(recipe.get("time", 0))

        json_ld_data = {
            "@context": "https://schema.org/",
            "@type": "Recipe",
            "name": recipe.get("name"),
            "image": [
                f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg"
            ],
            "author": {
                "@type": "Person",
                "name": "おなお",
                "url": "https://onaodonuts.com/profile.html"
            },
            "description": description_plain,
            "recipeIngredient": ingredients_ld,
            "recipeInstructions": instructions_ld,
            "video": {
                "@type": "VideoObject",
                "name": f"{recipe.get('name')}の作り方動画",
                "description": description_plain,
                "thumbnailUrl": f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg",
                "contentUrl": f"https://www.youtube.com/watch?v={youtube_id}",
                "embedUrl": f"https://www.youtube.com/embed/{youtube_id}",
                "uploadDate": f"{upload_date}T00:00:00+09:00"
            }
        }

        if recipe.get("uploadDate") and str(recipe.get("uploadDate")).strip():
            json_ld_data["datePublished"] = str(recipe.get("uploadDate")).strip()
        if iso_date(recipe.get("updatedDate")):
            json_ld_data["dateModified"] = iso_date(recipe.get("updatedDate"))
        if total_time_iso:
            json_ld_data["totalTime"] = total_time_iso
        if base_yield:
            y = str(base_yield).strip()
            json_ld_data["recipeYield"] = [y, f"{y}個分"] if y.isdigit() else [y]
        # 構造化データのキーワードは、サイト内検索用の "keyword"（表記ゆれを含む）とは分けて、
        # 厳選した "ldKeywords" だけを使う。無ければ keywords は出さない。
        kw = clean_keywords(recipe.get("ldKeywords"), limit=8)
        if kw:
            json_ld_data["keywords"] = ", ".join(kw)

        yield_heading = ""
        if base_yield:
            yield_heading = (
                f' <span class="yield-inline">'
                f'<span id="yieldAmount">{base_yield}</span>'
                f'<span class="yield-unit">個分</span></span>'
            )
            
        html = template_content
        html = html.replace("{{ name }}", recipe.get("name", ""))
        html = html.replace("{{ description }}", recipe.get("description", ""))
        html = html.replace("{{ youtube }}", youtube_id or "")
        html = html.replace("{{ file_name }}", file_name)
        html = html.replace("{{ formatted_time }}", formatted_time)
        html = html.replace("{{ difficulty_stars }}", difficulty_stars)
        html = html.replace("{{ base_flour }}", str(base_flour))
        html = html.replace("{{ yield_heading }}", yield_heading)
        html = html.replace("{{ ingredients_html }}", ingredients_html)
        html = html.replace("{{ steps_html }}", steps_html)
        html = html.replace("{{ json_ld }}", json.dumps(json_ld_data, ensure_ascii=False, indent=2).replace("</", "<\\/"))
        html = html.replace("{{ description_plain }}", esc(description_plain))

        # ページの <title> / og:title 用。seoTitle があればそれを、無ければレシピ名を使う（サイト名は自動で付く）
        seo_title = str(recipe.get("seoTitle") or "").strip() or recipe.get("name", "")
        html = html.replace("{{ seo_title }}", esc(seo_title))
        if len(seo_title) + len(" | おなおドーナツ") > 35:
            long_titles.append((recipe_id, seo_title, len(seo_title) + len(" | おなおドーナツ")))

        # 関連レシピ（固定）
        related_html = build_related_html(pick_related(recipe, recipes))

        # ヘッダー・フッター・関連レシピ・手順画像を、最初からHTMLに埋め込む。
        # data-prerendered="1" が付いている部分は、JS側では読み込み直さない。
        html = html.replace("{{ header_html }}", header_html)
        html = html.replace("{{ header_attr }}", ' data-prerendered="1"' if header_html else "")
        html = html.replace("{{ footer_html }}", footer_html)
        html = html.replace("{{ footer_attr }}", ' data-prerendered="1"' if footer_html else "")
        html = html.replace("{{ bottom_nav_html }}", bottom_nav_html)
        html = html.replace("{{ bottom_nav_attr }}", ' data-prerendered="1"' if bottom_nav_html else "")
        html = html.replace("{{ related_html }}", related_html)
        html = html.replace("{{ related_attr }}", ' data-prerendered="1"' if related_html else "")
        html = html.replace("{{ steps_attr }}", ' data-images-prerendered="1"')
        html = html.replace("{{ author_box_html }}", build_author_box(recipe))

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

    if long_titles:
        print("\n注意: 次のタイトルは長めです（サイト名を含めて約35文字を超えると、検索結果で途中までしか表示されない目安）。")
        for rid, ttl, n in long_titles:
            print(f"  {rid}: {ttl}（{n}文字）")

    generate_sitemap(recipes)

    inject_partials_into_static_pages(header_html, footer_html, bottom_nav_html)


if __name__ == "__main__":
    build_recipes()