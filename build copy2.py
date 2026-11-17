import argparse
import html as htmllib
import json
import os
import re
import subprocess
import sys
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
    "name": "おなお",
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


# ---- AdSense審査用：手順画像を1レシピあたり数枚に絞るための仕組み ----
REVIEW_OVERRIDES_FILE = "review_images.json"
REVIEW_REPORT_FILE = "review_images_report.md"

# 見た目で分かりやすい手順ほど高い点数（見出しの言葉で判定）。画像を残す優先度の目安。
VISUAL_WORDS = [
    (4, ("成形", "巻", "編", "ねじ", "切れ込み", "包", "重ね", "のせ", "詰め", "絞", "折")),
    (3, ("焼", "仕上", "完成", "トッピング", "アイシング", "盛")),
    (2, ("伸ばす", "広げ", "切る", "切り", "分割", "発酵", "膨ら")),
    (1, ("捏ね", "こね", "混ぜ", "叩")),
]


def visual_score(title):
    for score, words in VISUAL_WORDS:
        if any(w in title for w in words):
            return score
    return 0


def mentions_image(title, desc):
    """手順の本文に「画像」「写真」とあれば、その画像を見てほしい手順なので、必ず残す。"""
    text = f"{title} {desc}"
    return "画像" in text or "写真" in text


def load_review_overrides():
    """review_images.json（任意）：{"v127": [8, 15, 20]} のように、レシピごとに公開する手順番号を指定できる。"""
    if not os.path.exists(REVIEW_OVERRIDES_FILE):
        return {}
    with open(REVIEW_OVERRIDES_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {k: [int(n) for n in v] for k, v in raw.items() if not k.startswith("_") and isinstance(v, list)}


def select_review_images(steps, max_images, override=None):
    """公開する手順画像の番号の集合と、その理由を返す。
    1) 本文に「画像」「写真」とある手順は必ず残す
    2) override（手動指定）があれば、それも残す。指定があれば自動選択はしない
    3) 足りない分は、見た目で分かりやすい手順を優先し、なるべく離れた位置から自動で選ぶ"""
    cands = [st for st in steps if st["has_image"]]
    reasons = {}
    for st in cands:
        if mentions_image(st["title"], st["desc"]):
            reasons[st["no"]] = "本文に「画像」「写真」とある"
    if override:
        valid = {st["no"] for st in cands}
        for n in override:
            if n in valid:
                reasons.setdefault(n, "手動指定（review_images.json）")
        return set(reasons), reasons

    order = [st["no"] for st in cands]
    pos = {n: i for i, n in enumerate(order)}
    scores = {st["no"]: visual_score(st["title"]) for st in cands}
    span = max(1, len(order) - 1)
    need = max_images - len(reasons)
    while need > 0:
        remaining = [n for n in order if n not in reasons]
        if not remaining:
            break
        chosen = [pos[n] for n in reasons]

        def value(n):
            if chosen:
                gap = min(abs(pos[n] - p) for p in chosen) / span
            else:
                gap = 1 - abs(pos[n] / span - 0.6)   # 最初の1枚は、成形〜焼成にあたる後半寄りを優先
            return (scores[n] + 4 * gap, -pos[n])

        best = max(remaining, key=value)
        reasons[best] = "自動（成形・焼成など、見た目で分かる手順を優先）"
        need -= 1
    return set(reasons), reasons


def write_review_report(rows, max_images):
    lines = ["# 審査用ページ：公開する手順画像の一覧", "",
             f"- 1レシピあたりの目標は {max_images} 枚です。本文に「画像」「写真」とある手順は、これに加えて必ず公開します。",
             f"- 変えたいときは `{REVIEW_OVERRIDES_FILE}` に、レシピIDと公開したい手順番号（step-◯.webp の◯）を書いてください。",
             ""]
    total_all = total_kept = 0
    for rid, name, steps, keep, reasons in rows:
        n_img = sum(1 for st in steps if st["has_image"])
        total_all += n_img
        total_kept += len(keep)
        lines += [f"## {rid} {name}（画像 {n_img} 枚のうち {len(keep)} 枚を公開）", ""]
        for st in steps:
            if st["no"] in keep:
                lines.append(f"- step-{st['no']}.webp：{st['title']}（{reasons[st['no']]}）")
        lines.append("")
    lines.insert(2, f"- 全体：{total_all} 枚のうち {total_kept} 枚を公開（{len(rows)} レシピ）")
    with open(REVIEW_REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def current_git_branch():
    """今のGitブランチ名。Gitが使えない場合は None。"""
    try:
        out = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, timeout=5)
        return out.stdout.strip() if out.returncode == 0 else None
    except Exception:
        return None


def generate_sitemap(recipes):
    site_url = "https://onaodonuts.com"

    # noindex を付けたページ（recipe-search.html / video-list.html）は、サイトマップに入れない
    static_pages = [
        "",
        "index.html",
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


# ---- recipe-search.html / video-list.html：一覧を最初からHTMLに書き込む ----
# JSが動く前（クローラーなど）でも、一覧の中身が見えるようにする。JSが動くと、これまでどおり描画し直す。
VIDEO_PAGE_SIZE = 9   # video-list.js の PAGE_SIZE と同じ（最初に表示される件数）


def _to_int(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return 0


def _id_num(rid):
    m = re.search(r"\d+", str(rid))
    return int(m.group()) if m else 0


def _categories(recipe):
    cat = recipe.get("category")
    return cat if isinstance(cat, list) else ([cat] if cat is not None else [])


def format_time_search(total):
    """search.js の formatTime と同じ表記（例：180 → 3h 00m）"""
    if not total or str(total) in ("0", ""):
        return "---"
    mins = _to_int(total)
    return f"{mins // 60}h {mins % 60:02d}m"


def ingredient_names(recipe):
    names = []
    for group in (recipe.get("ingredients") or {}).values():
        if isinstance(group, list):
            for item in group:
                if item and item.get("name"):
                    names.append(item["name"])
    return ", ".join(names)


def search_card_html(r):
    """search.js が作るカードと同じ形（お気に入りは未登録の状態）"""
    zukan_no = str(r["id"]).replace("v", "", 1)
    diff = _to_int(r.get("difficulty"))
    stars = "".join(
        '<i class="fa-solid fa-star"></i>' if i <= diff else '<i class="fa-regular fa-star" style="opacity: 0.3;"></i>'
        for i in range(1, 6)
    )
    rid, name = esc(r["id"]), esc(r.get("name", ""))
    return f'''
                    <div class="col-12 col-md-6 col-lg-3 mb-4 rs-card-col">
                       <a href="recipe-{rid}.html" class="rs-link">
                       <div class="zukan-card-inner">
                                <div class="zukan-image-wrapper">
                                    <span class="zukan-no">No.{zukan_no}</span>
<img src="https://img.youtube.com/vi/{esc(r.get("youtube", ""))}/mqdefault.jpg" alt="{name}のレシピ" loading="lazy">
                                </div>
                                <div class="zukan-content">
                                    <div class="zukan-meta-row">
                                        <div class="rs-meta-top-row">
                                            <span class="rs-time"><i class="fa-regular fa-clock"></i> {format_time_search(r.get("time"))}</span>
                                            <span class="zukan-heart"><i class="fa-heart fa-regular inactive"></i></span>
                                        </div>
                                        <div class="rs-meta-bottom-row">
                                            <span class="zukan-difficulty"><span class="rs-lvl-label">難易度：</span>{stars}</span>
                                        </div>
                                    </div>
                                    <h3 class="zukan-title">{name}</h3>
                                    <p class="zukan-description">{esc(ingredient_names(r))}</p>
                                </div>
                            </div>
                        </a>
                    </div>'''


def video_list_recipes(recipes):
    """video-list.js の fetchRecipes と同じ絞り込み・並び順（ID の新しい順）"""
    out = []
    for r in recipes:
        cats = _categories(r)
        if _to_int(r.get("fun")) >= 5 or 4 in cats or r.get("isShort") is True or 5 in cats:
            out.append(r)
    out.sort(key=lambda r: -_id_num(r["id"]))
    return out


def video_card_html(r):
    """video-list.js が作るカードと同じ形。レシピページがある動画は、タイトルをリンクにする"""
    yt = esc(r.get("youtube", ""))
    diff = _to_int(r.get("difficulty"))
    stars = "".join('<i class="fas fa-star"></i>' if i <= diff else '<i class="far fa-star"></i>' for i in range(1, 6))
    is_short = r.get("isShort") is True or 5 in _categories(r)
    grid = "col-4 col-md-4 col-lg-2 px-1 mb-2" if is_short else "col-12 col-md-6 col-lg-4 mb-4"
    name = esc(r.get("name", ""))
    h3 = f'<h3 class="yt-video-title">{name}</h3>'
    title_block = h3 if is_short else (
        f'<a href="recipe-{esc(r["id"])}.html" style="text-decoration: none; color: inherit;">\n'
        f'                                {h3}\n'
        f'                            </a>'
    )
    meta = "" if is_short else f'''
                            <div class="yt-video-meta">
                                <span class="yt-diff-label">難易度: </span>
                                <span class="yt-stars">{stars}</span>
                                <span class="yt-sep">•</span>
                                <span>おなおドーナツ</span>
                            </div>'''
    return f'''
            <div class="{grid}">
                <div class="yt-card {"is-short" if is_short else ""}" id="card-{yt}">
                    <div class="yt-thumb-container" onclick="playVideoInline('{yt}', {"true" if is_short else "false"})">
                        <div id="player-{yt}" class="video-embed-wrapper">
                    <img src="https://img.youtube.com/vi/{yt}/mqdefault.jpg" alt="{name}の作り方動画" class="yt-thumb-img" loading="lazy">
                            <div class="yt-play-badge"><i class="fas fa-play"></i></div>
                        </div>
                    </div>

                    <div class="yt-info-flex {"is-short-info" if is_short else ""}">
                        <div class="yt-text-box">
                            {title_block}{meta}
                        </div>
                    </div>
                </div>
            </div>'''


def _inject_into_empty_div(html, element_id, marker, content):
    """<div id="element_id" ...></div> の中身を、目印付きで content に入れ替える（何度実行しても同じ結果）"""
    pat = re.compile(
        r'(<div\b[^>]*\bid="' + re.escape(element_id) + r'"[^>]*>)'
        r'(?:\s*<!-- prerender:' + marker + r':start -->[\s\S]*?<!-- prerender:' + marker + r':end -->)?'
        r'\s*(</div>)'
    )
    if not pat.search(html):
        return None
    return pat.sub(lambda m: m.group(1) + f"<!-- prerender:{marker}:start -->" + content + f"\n<!-- prerender:{marker}:end -->" + m.group(2), html, count=1)


def inject_list_pages(recipes):
    # --- recipe-search.html：全レシピのカード＋件数 ---
    page = "recipe-search.html"
    if os.path.exists(page):
        with open(page, "r", encoding="utf-8") as f:
            src = f.read()
        items = sorted([r for r in recipes if not r.get("isShort")], key=lambda r: -_id_num(r["id"]))
        out = _inject_into_empty_div(src, "results", "search-results", "".join(search_card_html(r) for r in items))
        if out is None:
            print(f"注意: {page} の <div id=\"results\"> が想定の形ではないため、一覧の書き込みをスキップしました。")
        else:
            count_pat = re.compile(r'(<div id="searchCount"[^>]*>)[\s\S]*?(</div>)')
            if count_pat.search(out):
                out = count_pat.sub(
                    lambda m: m.group(1) + "<!-- prerender:search-count:start -->\n        <span id=\"currentSearchTerm\"></span> "
                    + f"<strong>{len(items)}</strong> 件のレシピが見つかりました\n    <!-- prerender:search-count:end -->" + m.group(2),
                    out, count=1)
            if out != src:
                with open(page, "w", encoding="utf-8") as f:
                    f.write(out)
                print(f"一覧を書き込みました: {page}（{len(items)} 件）")
            else:
                print(f"変更なし: {page}")

    # --- video-list.html：最初に表示される分（VIDEO_PAGE_SIZE 件）の動画カード ---
    page = "video-list.html"
    if os.path.exists(page):
        with open(page, "r", encoding="utf-8") as f:
            src = f.read()
        vids = video_list_recipes(recipes)[:VIDEO_PAGE_SIZE]
        out = _inject_into_empty_div(src, "video-results", "video-results", "".join(video_card_html(r) for r in vids))
        if out is None:
            print(f"注意: {page} の <div id=\"video-results\"> が想定の形ではないため、一覧の書き込みをスキップしました。")
        elif out != src:
            with open(page, "w", encoding="utf-8") as f:
                f.write(out)
            print(f"一覧を書き込みました: {page}（先頭 {len(vids)} 件）")
        else:
            print(f"変更なし: {page}")


def build_recipes(review=False, max_images=3):
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
    review_overrides = load_review_overrides() if review else {}
    review_rows = []

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

        # 審査用モード：公開する手順画像を絞る（通常モードでは None ＝ すべて公開）
        review_keep = None
        if review:
            steps_info, _no = [], 0
            for _section in raw_steps:
                for _text in _section.get("items", []):
                    _no += 1
                    _parts = re.split(r"<br\s*/?>\s*<br\s*/?>", _text, maxsplit=1)
                    steps_info.append({
                        "no": _no,
                        "title": plain_step_title(_parts[0]),
                        "desc": to_plain_text(_parts[1]) if len(_parts) > 1 else "",
                        "has_image": os.path.exists(f"img/recipes/{recipe_id}/step-{_no}.webp"),
                    })
            review_keep, review_reasons = select_review_images(steps_info, max_images, review_overrides.get(recipe_id))
            review_rows.append((recipe_id, recipe.get("name", ""), steps_info, review_keep, review_reasons))

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
                use_img = os.path.exists(img_rel) and (review_keep is None or global_step_no in review_keep)
                if use_img:
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
                if use_img:
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

    if review:
        write_review_report(review_rows, max_images)
        kept = sum(len(r[3]) for r in review_rows)
        total = sum(1 for r in review_rows for st in r[2] if st["has_image"])
        print(f"審査用モード：手順画像 {total} 枚のうち {kept} 枚を公開しました（1レシピ目標 {max_images} 枚＋本文に「画像」「写真」とある手順）。")
        print(f"公開する画像の一覧は {REVIEW_REPORT_FILE} に書き出しました。")

    generate_sitemap(recipes)

    inject_partials_into_static_pages(header_html, footer_html, bottom_nav_html)
    inject_list_pages(recipes)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="レシピページ・サイトマップ・各ページの共通部品を生成します。")
    parser.add_argument("--review", action="store_true",
                        help="AdSense審査用：手順画像を1レシピあたり数枚に絞って生成する（通常のビルドでは付けません）")
    parser.add_argument("--max-images", type=int, default=3,
                        help="--review のとき、1レシピで公開する手順画像の目標枚数（既定：3）")
    parser.add_argument("--allow-main", action="store_true",
                        help="main/master ブランチでも --review を実行する（通常は使いません）")
    args = parser.parse_args()
    if args.review and not args.allow_main and current_git_branch() in ("main", "master"):
        print("中止しました：いま main ブランチにいます。--review は、審査用のブランチ（例：adsense-review）で実行してください。")
        print("  ブランチを切り替える：git checkout adsense-review")
        print("  どうしても main で実行する場合のみ：python build.py --review --allow-main")
        sys.exit(1)
    build_recipes(review=args.review, max_images=args.max_images)