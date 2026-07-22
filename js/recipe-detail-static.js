/**
 * 静的レシピページ専用スクリプト
 * （関連レシピの取得・お気に入り・タイマー機能の制御）
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. URLやHTMLから現在のレシピIDを取得 (例: recipe-v066.html -> v066)
    const path = window.location.pathname;
    const match = path.match(/recipe-(v\d+)\.html/);
    const currentId = match ? match[1] : null;

    if (currentId) {
        setupFavorite(currentId);
        await loadRelatedRecipes(currentId);
    }

    setupTimer();
    setupCheckEvent();
});

// 関連レシピをランダムで3つ抽出して表示する関数
async function loadRelatedRecipes(currentId) {
    const relatedDiv = document.getElementById('relatedRecipes');
    if (!relatedDiv) return;

    try {
        const response = await fetch('js/recipes.json');
        if (!response.ok) return;
        
        const allRecipes = await response.json();
        const currentRecipe = allRecipes.find(r => r.id === currentId);

        if (!currentRecipe) return;

        // 自分以外のレシピで、かつカテゴリーが1つでも一致するものを探す
        let related = allRecipes.filter(r => {
            return r.id !== currentId && 
                   !r.isShort && 
                   r.category && currentRecipe.category &&
                   r.category.some(cat => currentRecipe.category.includes(cat));
        });

        // 該当が少ない場合は全体のランダムから補充
        if (related.length < 3) {
            const others = allRecipes.filter(r => r.id !== currentId && !r.isShort);
            related = [...new Set([...related, ...others])];
        }

        // シャッフルして3つ選ぶ
        related.sort(() => Math.random() - 0.5);
        const pickup = related.slice(0, 3);

        if (pickup.length === 0) {
            relatedDiv.innerHTML = '<p class="ml-3 text-muted">関連レシピはまだありません</p>';
            return;
        }

        let html = "";
        pickup.forEach(r => {
            html += `
                <div class="col-12 col-sm-4 mb-4">
                    <div class="onao-related-card" style="cursor:pointer;" onclick="location.href='recipe-${r.id}.html'">
                        <div class="onao-related-thumb">
                            <img src="https://img.youtube.com/vi/${r.youtube}/mqdefault.jpg" alt="${r.name}の完成写真" loading="lazy">
                        </div>
                        <div class="onao-related-body">
                            <h3 style="font-size:1rem; margin-top:10px; color:#4b3e2a;">${r.name}</h3>
                        </div>
                    </div>
                </div>`;
        });
        relatedDiv.innerHTML = html;

    } catch (error) {
        console.error("Related Recipes Error:", error);
    }
}

// お気に入りボタンの制御
function setupFavorite(recipeId) {
    const faveBtn = document.getElementById('faveBtn');
    const faveIcon = document.getElementById('faveIcon');
    if (!faveBtn || !faveIcon) return;

    let favorites = JSON.parse(localStorage.getItem('onao_favorites') || '[]');
    
    const updateFaveUI = (isFav) => {
        if (isFav) {
            faveBtn.classList.add('active');
            faveIcon.classList.replace('fa-regular', 'fa-solid');
            faveIcon.style.color = '#ff6b6b';
        } else {
            faveBtn.classList.remove('active');
            faveIcon.classList.replace('fa-solid', 'fa-regular');
            faveIcon.style.color = '#ccc';
        }
    };

    updateFaveUI(favorites.includes(recipeId));

    faveBtn.onclick = function() {
        favorites = JSON.parse(localStorage.getItem('onao_favorites') || '[]');
        const index = favorites.indexOf(recipeId);
        if (index > -1) {
            favorites.splice(index, 1);
            updateFaveUI(false);
        } else {
            favorites.push(recipeId);
            updateFaveUI(true);
        }
        localStorage.setItem('onao_favorites', JSON.stringify(favorites));
    };
}

// タイマー・チェックボックスの初期化処理
function setupTimer() {
    // (タイマー連動の処理が必要な場合はここに記述)
}

function setupCheckEvent() {
    document.querySelectorAll('.step-check').forEach(check => {
        check.addEventListener('change', function() {
            const stepText = this.closest('.single-preparation-step')?.querySelector('.step-text');
            if (stepText) {
                if (this.checked) stepText.classList.add('checked-item');
                else stepText.classList.remove('checked-item');
            }
        });
    });

    document.querySelectorAll('.ingredient-check').forEach(check => {
        check.addEventListener('change', function() {
            const label = this.parentElement.querySelector('label');
            if (label) {
                if (this.checked) label.classList.add('checked-item');
                else label.classList.remove('checked-item');
            }
        });
    });
}
