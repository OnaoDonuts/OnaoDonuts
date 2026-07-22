/**
 * 静的レシピページ専用スクリプト（完全修正版）
 * （計算機・かっこ対応タイマー・関連レシピ・お気に入り・チェックボックス）
 */

let countdown;
let timerSeconds = 0;
let currentRecipeData = null; // レシピデータを保持

document.addEventListener('DOMContentLoaded', async () => {
    // 1. URLから現在のレシピIDを取得 (例: recipe-v066.html -> v066)
    const path = window.location.pathname;
    const match = path.match(/recipe-(v\d+)\.html/);
    const currentId = match ? match[1] : null;

    if (currentId) {
        setupFavorite(currentId);
        await loadRecipeDataAndSetupFlour(currentId);
        await loadRelatedRecipes(currentId);
    }

    // 2. 手順テキスト内の時間表記を自動でタイマー化（かっこ無し対応）
    enableTimerLinksInSteps();

    // 3. タイマーの起動・停止ロジックをセットアップ
    setupTimer();

    // 4. チェックボックスのイベント
    setupCheckEvent();
});

/**
 * ① recipes.json を読み込んで粉量計算機能を有効化する処理
 */
async function loadRecipeDataAndSetupFlour(recipeId) {
    const flourInput = document.getElementById('flourAmount');
    if (!flourInput) return;

    try {
        const response = await fetch('js/recipes.json');
        if (!response.ok) return;

        const recipes = await response.json();
        currentRecipeData = recipes.find(r => r.id === recipeId);

        if (!currentRecipeData) return;

        // 粉の基準量（ratio === 100 の材料）を自動取得
        let baseAmount = 200;
        if (currentRecipeData.ingredients) {
            for (const group in currentRecipeData.ingredients) {
                const found = currentRecipeData.ingredients[group].find(ing => ing.ratio === 100);
                if (found) {
                    baseAmount = found.amount;
                    break;
                }
            }
        }

        // 初期値をセット
        if (!flourInput.value) {
            flourInput.value = baseAmount;
        }

        // 入力イベントリスナーの設定
        flourInput.addEventListener('input', () => {
            const inputVal = parseFloat(flourInput.value) || 0;
            updateIngredientsDisplay(inputVal, baseAmount);
        });

    } catch (error) {
        console.error("Flour Calc Setup Error:", error);
    }
}

/**
 * 入力された粉の量に応じて画面上の材料数値を更新する
 */
function updateIngredientsDisplay(currentFlourVal, baseAmount) {
    if (!currentRecipeData || !currentRecipeData.ingredients) return;

    const listDiv = document.getElementById('ingredientsList');
    if (!listDiv) return;

    let html = "";
    for (const group in currentRecipeData.ingredients) {
        html += `<div class="onao-ingredient-group"><h3>${group}</h3></div>`;
        
        currentRecipeData.ingredients[group].forEach((item, index) => {
            let amt;
            if (item.ratio !== undefined && item.ratio !== "") {
                const multiplier = currentFlourVal / baseAmount;
                amt = Math.round((item.amount * multiplier) * 10) / 10;
            } else {
                amt = item.amount || "";
            }

            const unit = item.unit || "";
            const id = `check-${group.replace(/\s+/g, '')}-${index}`;
            
            html += `
                <div class="custom-control custom-checkbox d-flex align-items-center mb-2">
                    <input type="checkbox" class="custom-control-input ingredient-check" id="${id}">
                    <label class="custom-control-label d-flex justify-content-between w-100" for="${id}" style="cursor:pointer; padding-left:30px;">
                        <span>${item.name}</span><span>${amt}${unit}</span>
                    </label>
                </div>`;
        });
    }
    listDiv.innerHTML = html;

    // 再描画後にチェックボックスイベントを再割り当て
    setupCheckEvent();
}

/**
 * ② 手順のテキストから時間表記を探してタイマーリンクに置換する
 * （かっこ付き・かっこ無し両方に対応）
 */
function enableTimerLinksInSteps() {
    const stepTexts = document.querySelectorAll('.step-text');
    
    stepTexts.forEach(el => {
        let text = el.innerHTML;
        // 「10分」「1時間半」「15〜20分」などを自動判定（かっこ無しOK）
        const timeMatch = text.match(/(\d+〜?\d*)(時間|分)(半)?/g);
        
        if (timeMatch) {
            timeMatch.forEach(match => {
                if (!text.includes(`class="timer-link"`)) {
                    text = text.replace(
                        match, 
                        `<span class="timer-link" style="color:var(--onao-green, #52ad1a); font-weight:bold; cursor:pointer; text-decoration:underline;">${match}</span>`
                    );
                }
            });
            el.innerHTML = text;
        }
    });
}

/**
 * ③ タイマー機能（クリック監視・タイマーモーダル制御）
 */
function setupTimer() {
    // 画面全体のクリックを監視（動的な .timer-link も確実に反応）
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('timer-link')) {
            const fullText = e.target.innerText; // 例：「1時間半」「15分」
            let totalSeconds = 0;

            const numMatch = fullText.match(/\d+/);
            if (!numMatch) return;
            const num = parseInt(numMatch[0]);

            if (fullText.includes('時間')) {
                totalSeconds = num * 3600;
                if (fullText.includes('半')) totalSeconds += 1800;
            } else if (fullText.includes('分')) {
                totalSeconds = num * 60;
                if (fullText.includes('半')) totalSeconds += 30;
            }

            if (totalSeconds > 0) {
                startTimer(totalSeconds);
            }
        }
    });

    // ストップ／閉じるボタンの設定
    const stopBtn = document.getElementById('timerStop');
    const closeBtn = document.getElementById('timerClose');

    if (stopBtn) {
        stopBtn.onclick = () => {
            clearInterval(countdown);
            const display = document.getElementById('timerDisplay');
            const msgEl = document.getElementById('timerFinishedMessage');
            if (display) {
                display.style.display = 'block';
                display.textContent = "00:00";
            }
            if (msgEl) msgEl.style.display = 'none';
            stopBtn.textContent = "ストップ";
        };
    }

    if (closeBtn) {
        closeBtn.onclick = () => {
            clearInterval(countdown);
            const timerOverlay = document.getElementById('recipeTimer');
            if (timerOverlay) timerOverlay.style.display = 'none';
            const display = document.getElementById('timerDisplay');
            const msgEl = document.getElementById('timerFinishedMessage');
            if (display) display.style.display = 'block';
            if (msgEl) msgEl.style.display = 'none';
        };
    }
}

function startTimer(seconds) {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') {
        context.resume();
    }
    
    const timerOverlay = document.getElementById('recipeTimer');
    const display = document.getElementById('timerDisplay');
    const msgEl = document.getElementById('timerFinishedMessage');
    const stopBtn = document.getElementById('timerStop');
    
    if (display) display.style.display = 'block';
    if (msgEl) msgEl.style.display = 'none';

    if (stopBtn) {
        stopBtn.style.backgroundColor = "#ff6b6b"; 
        stopBtn.style.color = "white";
        stopBtn.style.border = "none";
        stopBtn.style.outline = "none";
        stopBtn.textContent = "ストップ";
    }
    
    clearInterval(countdown);
    if (timerOverlay) timerOverlay.style.display = 'flex';
    timerSeconds = seconds;

    countdown = setInterval(() => {
        timerSeconds--;
        const mins = Math.floor(timerSeconds / 60);
        const secs = timerSeconds % 60;
        if (display) {
            display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        if (timerSeconds <= 0) {
            clearInterval(countdown);
            playTimerSound(context); 

            if (display) display.style.display = 'none';
            if (msgEl) msgEl.style.display = 'block';

            if (stopBtn) {
                stopBtn.textContent = "リセット";
                stopBtn.style.backgroundColor = "#52ad1a";
            }
        }
    }, 1000);
}

function playTimerSound(existingContext) {
    try {
        const context = existingContext || new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        
        oscillator.connect(gain);
        gain.connect(context.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, context.currentTime);
        gain.gain.setValueAtTime(0.3, context.currentTime);
        
        oscillator.start();
        oscillator.stop(context.currentTime + 0.5);
    } catch (e) {
        console.error("Audio Error:", e);
    }
}

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

        let related = allRecipes.filter(r => {
            return r.id !== currentId && 
                   !r.isShort && 
                   r.category && currentRecipe.category &&
                   r.category.some(cat => currentRecipe.category.includes(cat));
        });

        if (related.length < 3) {
            const others = allRecipes.filter(r => r.id !== currentId && !r.isShort);
            related = [...new Set([...related, ...others])];
        }

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

// チェックボックスの打ち消し線イベント設定
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
