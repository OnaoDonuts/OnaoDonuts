/**
 * お笑い動画図鑑（パフォーマンス改善・完全版）
 */

let allRecipes = [];        // 全データ
let filteredRecipes = [];   // 絞り込み後のデータ
let currentDisplayCount = 0; // 現在表示されている件数
const PAGE_SIZE = 9;         // 1回に表示する件数（3列なので3の倍数が綺麗です）

// 時間のフォーマット関数（これがないとエラーで止まります）
function formatTime(totalMinutes) {
    if (!totalMinutes || totalMinutes === "0") return '---';
    const mins = parseInt(totalMinutes);
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

document.addEventListener('DOMContentLoaded', async () => {
    allRecipes = await fetchRecipes();
    
    // 初期状態は「すべて」を表示
    filterVideos("すべて");

    // 「もっと見る」ボタンのクリックイベント
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            renderMoreCards();
        });
    }

    // チップのクリックイベント設定
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', function() {
            chips.forEach(c => c.classList.remove('active'));
            this.classList.add('active');

            const filterType = this.textContent.trim();
            filterVideos(filterType);
        });
    });

    $('#videoModal').on('hide.bs.modal', function () {
        $("#videoIframe").attr('src', '');
    });
});

async function fetchRecipes() {
    try {
        const response = await fetch('js/recipes.json');
        let data = await response.json();

data = data.filter(recipe => {
    const isFun = (parseInt(recipe.fun) || 0) >= 5;
    const isGachi = Array.isArray(recipe.category) ? recipe.category.includes(4) : recipe.category == 4;
    // ★「isShortがtrue」または「カテゴリー5」も通るように追加
    const isShort = recipe.isShort === true || (Array.isArray(recipe.category) && recipe.category.includes(5));
    
    return isFun || isGachi || isShort; // いずれかに当てはまれば残す
});


        // IDの降順ソート
        data.sort((a, b) => {
            const idA = parseInt(a.id.replace('v', ''));
            const idB = parseInt(b.id.replace('v', ''));
            return idB - idA;
        });
        return data;
    } catch (e) {
        console.error("JSON読み込み失敗:", e);
        return [];
    }
}

/**
 * フィルターをかけて表示をリセットする
 */
function filterVideos(type) {
    console.log("フィルタリング開始:", type); // 動作確認用

    if (type === "すべて") {
        filteredRecipes = allRecipes;
    } 
    else if (type === "おすすめ") {
        // 仕様：fun が 5 以上のものを表示
        filteredRecipes = allRecipes.filter(r => {
            return parseInt(r.fun) >= 5;
        });
    } 
    else if (type === "成形") {
        // 仕様：category 配列の中に 4 が含まれるものを表示
        filteredRecipes = allRecipes.filter(r => {
            return r.category && Array.isArray(r.category) && r.category.includes(4);
        });
    } 
    else if (type === "ショート") {
        // 仕様：isShort が true のもの、またはカテゴリー 5 を表示
        filteredRecipes = allRecipes.filter(r => {
            return r.isShort === true || (r.category && r.category.includes(5));
        });
    }

    // 表示をリセットして再描画
    currentDisplayCount = 0;
    const videoResults = document.getElementById('video-results');
    if (videoResults) {
        videoResults.innerHTML = '';
        renderMoreCards();
    }
        updateVideoListSchema(filteredRecipes);
}


function renderMoreCards() {
    const videoResults = document.getElementById('video-results');
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    const nextRecipes = filteredRecipes.slice(currentDisplayCount, currentDisplayCount + PAGE_SIZE);

    nextRecipes.forEach(recipe => {
        const thumbImg = `https://img.youtube.com/vi/${recipe.youtube}/mqdefault.jpg`;
        const diff = parseInt(recipe.difficulty) || 0;
        let starHtml = "";
        for (let i = 1; i <= 5; i++) {
            starHtml += (i <= diff) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
        }

        const isShort = recipe.isShort === true || (recipe.category && recipe.category.includes(5));
        const gridClass = isShort 
                ? 'col-4 col-md-4 col-lg-2 px-1 mb-2' 
                : 'col-12 col-md-6 col-lg-4 mb-4';

        const videoCard = `
            <div class="${gridClass}">
                <div class="yt-card ${isShort ? 'is-short' : ''}" id="card-${recipe.youtube}">
                    <div class="yt-thumb-container" onclick="playVideoInline('${recipe.youtube}', ${isShort})">
                        <div id="player-${recipe.youtube}" class="video-embed-wrapper">
                    <img src="${thumbImg}" alt="${recipe.name}の作り方動画" class="yt-thumb-img" loading="lazy">
                            <div class="yt-play-badge"><i class="fas fa-play"></i></div>
                        </div>
                    </div>

                    <div class="yt-info-flex ${isShort ? 'is-short-info' : ''}">
                        <div class="yt-text-box">
                            <h3 class="yt-video-title">${recipe.name}</h3>
                            ${!isShort ? `
                            <div class="yt-video-meta">
                                <span class="yt-diff-label">難易度: </span>
                                <span class="yt-stars">${starHtml}</span>
                                <span class="yt-sep">•</span>
                                <span>おなおドーナツ</span>
                            </div>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        videoResults.insertAdjacentHTML('beforeend', videoCard);
    });

    currentDisplayCount += nextRecipes.length;
    if(loadMoreBtn) loadMoreBtn.style.display = currentDisplayCount < filteredRecipes.length ? 'inline-block' : 'none';
    
}

/**
 * その場で動画を再生する（自動再生の成功率を上げる修正版）
 */
function playVideoInline(youtubeId, isShort) {
    const container = document.getElementById(`player-${youtubeId}`);
    if (!container) return;

    // パラメータ解説：
    // autoplay=1 (自動再生)
    // mute=1 (消音にすることでブラウザの自動再生ブロックを回避)
    // rel=0 (関連動画を自分のチャンネル内に絞る)
    // playsinline=1 (iPhone等で勝手に全画面表示になるのを防ぐ)
    const videoSrc = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&rel=0&playsinline=1&modestbranding=1`;

    const iframeHtml = `
        <iframe 
            src="${videoSrc}" 
            style="width:100%; height:100%; border:none; border-radius:12px;" 
            allow="autoplay; encrypted-media; fullscreen" 
            allowfullscreen>
        </iframe>`;

    container.innerHTML = iframeHtml;
    container.parentElement.onclick = null;
}


function filterVideoCards(category, element) {
    // 1. すべてのボタンから緑色（activeクラス）を消す（クラス名を .v-nav-item に修正）
    const navItems = document.querySelectorAll('.v-nav-item');
    navItems.forEach(item => item.classList.remove('active'));

    // 2. クリックされたボタンだけに緑色（activeクラス）をつける
    element.classList.add('active');

    // 3. 実際の動画フィルタリング機能を実行（既存の関数を呼び出す）
    if (typeof filterVideos === 'function') {
        filterVideos(category);
    }
}


/**
 * 動画リストの構造化データを生成
 */
function updateVideoListSchema(recipes) {
    const oldScript = document.getElementById('video-list-json-ld');
    if (oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.id = 'video-list-json-ld';
    script.type = 'application/ld+json';
    
    // 最初の10件をリストとして登録
    const itemListElement = recipes.slice(0, 10).map((recipe, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "url": `${window.location.origin}/recipe-detail.html?id=${recipe.id}`,
        "name": `${recipe.name}の作り方動画`
    }));

    script.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "おなおドーナツ パン作り動画図鑑",
        "itemListElement": itemListElement
    });
    document.head.appendChild(script);
}
