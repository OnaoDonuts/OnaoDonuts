/**
 * search.js - 最終修正版（お気に入りボタン復旧・シンプルハートデザイン）
 */

let currentCategory = "0";
let allRecipesData = []; 

// カテゴリー番号と名前の対応表
const categoryMap = {
    "1": "ホームベーカリー",
    "2": "こねないパン",
    "3": "お菓子・惣菜パン",
    "4": "成形"
};

function formatTime(totalMinutes) {
    if (!totalMinutes || totalMinutes === "0" || totalMinutes === "") return '---';
    const mins = parseInt(totalMinutes);
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    const displayMins = String(minutes).padStart(2, '0');
    return `${hours}h ${displayMins}m`;
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearch');
    
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('cat');    
    const searchParam = urlParams.get('search'); 

    if (catParam || searchParam) {
        currentCategory = catParam || "0";
        const initialQuery = searchParam || categoryMap[catParam] || "";
        if (searchInput) {
            searchInput.value = initialQuery;
            sessionStorage.setItem('lastSearchQuery', initialQuery);
        }
        sessionStorage.setItem('lastCategory', currentCategory);
        
        if (catParam) {
            fetchAndDisplayRecipes("", currentCategory); 
        } else {
            fetchAndDisplayRecipes(initialQuery, currentCategory);
        }
    } 
    else {
        const lastQuery = sessionStorage.getItem('lastSearchQuery') || "";
        currentCategory = sessionStorage.getItem('lastCategory') || "0";
        if (searchInput) searchInput.value = lastQuery;
        fetchAndDisplayRecipes(lastQuery, currentCategory);
    }

    if (searchInput) {
        let timeoutId;
        searchInput.addEventListener('input', () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                sessionStorage.setItem('lastSearchQuery', searchInput.value);
                fetchAndDisplayRecipes(searchInput.value, currentCategory);
            }, 300); 
        });
    }
    
    if (clearBtn && searchInput) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = "";
            currentCategory = "0";
            sessionStorage.setItem('lastSearchQuery', "");
            sessionStorage.setItem('lastCategory', "0");
            fetchAndDisplayRecipes("", "0");
        });
    }
});

/**
 * メインの検索・表示関数
 */
async function fetchAndDisplayRecipes(query = "", category = "0") {
    try {
        const response = await fetch('js/recipes.json');
        const data = await response.json();
        allRecipesData = data; 
        
        const resultsDiv = document.getElementById('results');
        const countSpan = document.getElementById('searchCount');
        const noResultsMsg = document.getElementById('noResults');
        if (!resultsDiv) return;

        const recipes = [...data];
        recipes.sort((a, b) => {
            const idA = parseInt(String(a.id).toLowerCase().replace('v', '')) || 0;
            const idB = parseInt(String(b.id).toLowerCase().replace('v', '')) || 0;
            return idB - idA;
        });

        const toKatakana = (str) => str.replace(/[ぁ-ん]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x60));

        const currentFavorites = JSON.parse(localStorage.getItem('onao_favorites')) || [];

        const filtered = recipes.filter(recipe => {
            if (recipe.isShort === true) return false;
            let matchesCategory = category === "0" || (Array.isArray(recipe.category) ? recipe.category : [recipe.category]).some(c => String(c) === String(category));

            let allIngs = [];
            if (recipe.ingredients) {
                Object.keys(recipe.ingredients).forEach(key => {
                    const group = recipe.ingredients[key];
                    if (Array.isArray(group)) group.forEach(item => { if (item && item.name) allIngs.push(item.name); });
                });
            }
            recipe._ingNames = allIngs.join(', ');

            const q = query.toLowerCase().trim();
            if (!q) return matchesCategory;

            const keywordStr = Array.isArray(recipe.keyword) ? recipe.keyword.join(' ') : (recipe.keyword || "");
            const searchTarget = toKatakana([recipe.name, recipe.title, recipe.comment, recipe._ingNames, keywordStr].join(' ').toLowerCase());
            const keywords = toKatakana(q).split(/[\s　]+/).filter(k => k.length > 0);
            return matchesCategory && keywords.every(word => searchTarget.includes(word));
        });

        resultsDiv.innerHTML = "";
        if (filtered.length === 0) {
            if (noResultsMsg) noResultsMsg.style.display = 'block';
            if (countSpan) countSpan.innerHTML = `<strong>0</strong> 件のレシピが見つかりました`;
        } else {
            if (noResultsMsg) noResultsMsg.style.display = 'none';
            if (countSpan) countSpan.innerHTML = `<strong>${filtered.length}</strong> 件のレシピが見つかりました`;

            filtered.forEach(recipe => {
                const zukanNo = recipe.id.replace('v', '');
                const diff = parseInt(recipe.difficulty) || 0;
                let starHtml = "";
                for (let i = 1; i <= 5; i++) starHtml += (i <= diff) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star" style="opacity: 0.3;"></i>';

// --- お気に入り判定とHTML作成 ---
const isFav = currentFavorites.includes(recipe.id);
const heartHtml = `
    <span class="zukan-heart" onclick="toggleFavorite(event, '${recipe.id}')">
        <i class="fa-heart ${isFav ? 'fa-solid active' : 'fa-regular inactive'}"></i>
    </span>
`;

                const card = `
                    <div class="col-12 col-md-6 col-lg-3 mb-4 rs-card-col">
                        <a href="recipe-detail.html?id=${recipe.id}" class="rs-link">
                            <div class="zukan-card-inner">
                                <div class="zukan-image-wrapper">
                                    <span class="zukan-no">No.${zukanNo}</span>
<img src="https://img.youtube.com/vi/${recipe.youtube}/mqdefault.jpg" alt="${recipe.name}のレシピ" loading="lazy">
                                </div>
                                <div class="zukan-content">
                                    <div class="zukan-meta-row">
                                        <div class="rs-meta-top-row">
                                            <span class="rs-time"><i class="fa-regular fa-clock"></i> ${formatTime(recipe.time)}</span>
                                            ${heartHtml}
                                        </div>
                                        <div class="rs-meta-bottom-row">
                                            <span class="zukan-difficulty"><span class="rs-lvl-label">難易度：</span>${starHtml}</span>
                                        </div>
                                    </div>
                                    <h3 class="zukan-title">${recipe.name}</h3>
                                    <p class="zukan-description">${recipe._ingNames}</p>
                                </div>
                            </div>
                        </a>
                    </div>
                `;
                resultsDiv.insertAdjacentHTML('beforeend', card);
            });
            // ★ここに追加！表示されたレシピのリストをGoogleに教える
        updateListSchema(filtered);
        }
    } catch (e) { console.error("Error:", e); }
}

// チップスクリック処理
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('keyword-tag')) {
        e.preventDefault();
        const tagText = e.target.textContent.replace('#', '').trim();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = tagText; 
            sessionStorage.setItem('lastSearchQuery', tagText); 
            fetchAndDisplayRecipes(tagText, currentCategory);
        }
    }
});

/**
 * お気に入りレシピの表示切り替え（トグル機能付き）
 */
function filterFavorites() {
    const btn = document.getElementById('favFilterBtn');
    
    // 1. もし現在「お気に入り表示中」なら、通常表示に戻す
    if (btn && btn.classList.contains('is-filtering-fav')) {
        const searchInput = document.getElementById('searchInput');
        const query = searchInput ? searchInput.value : "";
        
        // ボタンを通常状態にリセット
        btn.innerHTML = '<i class="fa-solid fa-heart mr-2"></i> お気に入りレシピを表示';
        btn.style.backgroundColor = "#ff6b6b";
        btn.classList.remove('is-filtering-fav');
        
        // 通常の検索表示を実行
        fetchAndDisplayRecipes(query, currentCategory);
        return;
    }

    // 2. お気に入り表示を開始する
    const favorites = JSON.parse(localStorage.getItem('onao_favorites')) || [];
    if (favorites.length === 0) {
        alert("お気に入り登録されたレシピがありません。");
        return;
    }

    // ボタンを「戻る」モードに切り替え
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-rotate-left mr-2"></i> 全レシピ表示に戻る';
        btn.style.backgroundColor = "#9b9b9b"; // グレーに変更
        btn.classList.add('is-filtering-fav');
    }

    // データがなければ読み込み、あれば表示
    if (allRecipesData.length === 0) {
        fetch('js/recipes.json')
            .then(res => res.json())
            .then(data => {
                allRecipesData = data;
                renderFavoriteResults(favorites);
            });
    } else {
        renderFavoriteResults(favorites);
    }
}

/**
 * お気に入りレシピだけを描画する
 */
function renderFavoriteResults(favorites) {
    const resultsDiv = document.getElementById('results');
    const countSpan = document.getElementById('searchCount');
    const noResultsMsg = document.getElementById('noResults');

    // 常に最新のストレージからお気に入りIDを取得
    const currentFavs = JSON.parse(localStorage.getItem('onao_favorites')) || [];
    const favRecipes = allRecipesData.filter(recipe => currentFavs.includes(recipe.id));

    // カウント表示の更新
    if (countSpan) {
        countSpan.innerHTML = `<span style="color: #ff6b6b;"><i class="fa-solid fa-heart"></i> お気に入り</span> <strong>${favRecipes.length}</strong> 件を表示中`;
    }

    if (favRecipes.length === 0) {
        if (noResultsMsg) noResultsMsg.style.display = 'block';
        resultsDiv.innerHTML = '';
        return;
    }

    if (noResultsMsg) noResultsMsg.style.display = 'none';
    resultsDiv.innerHTML = '';
    
    favRecipes.forEach(recipe => {
        // 材料テキストの生成
        let allIngs = [];
        if (recipe.ingredients) {
            Object.keys(recipe.ingredients).forEach(key => {
                if (Array.isArray(recipe.ingredients[key])) {
                    recipe.ingredients[key].forEach(item => { if (item.name) allIngs.push(item.name); });
                }
            });
        }
        const ingredientText = allIngs.join(', ');
        const zukanNo = recipe.id.replace('v', '');
        const diff = parseInt(recipe.difficulty) || 0;
        let starHtml = "";
        for (let i = 1; i <= 5; i++) starHtml += (i <= diff) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star" style="opacity: 0.3;"></i>';

        const card = `
            <div class="col-12 col-md-6 col-lg-3 mb-4 rs-card-col">
                <a href="recipe-detail.html?id=${recipe.id}" class="rs-link">
                    <div class="zukan-card-inner">
                        <div class="zukan-image-wrapper">
                            <span class="zukan-no">No.${zukanNo}</span>
<img src="https://img.youtube.com/vi/${recipe.youtube}/mqdefault.jpg" alt="${recipe.name}のレシピ" loading="lazy">
                        </div>
                        <div class="zukan-content">
                            <div class="zukan-meta-row">
                                <div class="rs-meta-top-row">
                                    <span class="rs-time"><i class="fa-regular fa-clock"></i> ${formatTime(recipe.time)}</span>
                                    <span class="zukan-heart" onclick="toggleFavorite(event, '${recipe.id}')">
                                        <i class="fa-heart fa-solid active"></i>
                                    </span>
                                </div>
                                <div class="rs-meta-bottom-row">
                                    <span class="zukan-difficulty"><span class="rs-lvl-label">難易度：</span>${starHtml}</span>
                                </div>
                            </div>
                            <h3 class="zukan-title">${recipe.name}</h3>
                            <p class="zukan-description">${ingredientText}</p>
                        </div>
                    </div>
                </a>
            </div>
        `;
        resultsDiv.insertAdjacentHTML('beforeend', card);
    });

    // スキーマの更新（もしあれば）
    if (typeof updateListSchema === "function") {
        updateListSchema(favRecipes);
    }
}

/**
 * その場でお気に入りを切り替える
 * @param {Event} event - クリックイベント
 * @param {string} recipeId - レシピID
 */
function toggleFavorite(event, recipeId) {
    // 1. 詳細ページへの遷移（親要素のaタグの動き）を止める
    event.preventDefault();
    event.stopPropagation();

    let favorites = JSON.parse(localStorage.getItem('onao_favorites')) || [];
    const index = favorites.indexOf(recipeId);

    if (index > -1) {
        // すでに登録済みなら解除
        favorites.splice(index, 1);
    } else {
        // 未登録なら追加
        favorites.push(recipeId);
    }

    // 2. 保存
    localStorage.setItem('onao_favorites', JSON.stringify(favorites));

    // 3. 画面をリロードせずに見た目だけ更新（現在の検索状態を維持）
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value : "";
    
    // 今「お気に入り一覧」を表示しているかどうかで挙動を変える
    const countText = document.getElementById('searchCount')?.textContent || "";
    if (countText.includes("表示中")) {
        // お気に入り一覧画面なら、消えたことを反映するために再描画
        renderFavoriteResults(favorites);
    } else {
        // 通常の検索画面なら、ハートの色だけ変えるために再描画
        fetchAndDisplayRecipes(query, currentCategory);
    }
}

/**
 * Googleに「レシピのリスト」であることを伝える構造化データを生成
 */
function updateListSchema(recipes) {
    // 古いデータがあれば消す
    const oldScript = document.getElementById('list-json-ld');
    if (oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.id = 'list-json-ld';
    script.type = 'application/ld+json';
    
    // 検索結果の最初の10件分をリストとして登録
    const itemListElement = recipes.slice(0, 10).map((recipe, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "url": `${window.location.origin}/recipe-detail.html?id=${recipe.id}`,
        "name": recipe.name
    }));

    script.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": itemListElement
    });
    document.head.appendChild(script);
}
