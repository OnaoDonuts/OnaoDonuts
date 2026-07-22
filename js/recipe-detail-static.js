/**
 * 静的レシピページ専用スクリプト（タイマー自動挿入・粉量自動計算版）
 */

let countdown;
let timerSeconds = 0;
let currentRecipeData = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 0. ★ HTML上にタイマーモーダルが無い場合、JSで自動挿入する
    injectTimerModal();

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
 * ★ タイマー用HTML（モーダル）を動的にページへ注入する関数
 */
function injectTimerModal() {
    // すでにHTML内に #recipeTimer があれば二重追加を防ぐために処理をスキップ
    if (document.getElementById('recipeTimer')) return;

    // 画面に挿入したいタイマーのHTML構造
    const modalHtml = `
    <div id="recipeTimer" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999; justify-content:center; align-items:center;">
        <div style="background:#fff; padding:30px; border-radius:15px; text-align:center; min-width:280px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <h4 style="margin-bottom:15px; font-weight:bold; color:#4b3e2a;">タイマー</h4>
            <div id="timerDisplay" style="font-size:3rem; font-weight:bold; margin:20px 0; color:#4b3e2a;">00:00</div>
            <div id="timerFinishedMessage" style="display:none; font-size:1.5rem; color:#ff6b6b; font-weight:bold; margin:20px 0;">時間になりました！</div>
            <div style="display:flex; justify-content:center; gap:10px;">
                <button id="timerStop" class="btn btn-danger" style="background-color:#ff6b6b; border:none; padding:8px 20px;">ストップ</button>
                <button id="timerClose" class="btn btn-secondary" style="padding:8px 20px;">閉じる</button>
            </div>
        </div>
    </div>`;

    // <body> タグの一番最後（</body>の直前）に HTML を挿入する
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * ① recipes.json を読み込んで粉量計算機能を有効化する処理（粉量自動算出修正版）
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

        // レシピ内の粉類（ratioの合計が100%に達するまでの材料）の合計量を算出
        let totalFlourBase = 0;
        let ratioSum = 0;

        if (currentRecipeData.ingredients) {
            for (const group in currentRecipeData.ingredients) {
                currentRecipeData.ingredients[group].forEach(ing => {
                    const r = parseFloat(ing.ratio) || 0;
                    const a = parseFloat(ing.amount) || 0;

                    // ratioが入っていて、まだ粉の合計（100%）に達していない場合のみ加算
                    if (r > 0 && ratioSum < 100) {
                        totalFlourBase += a;
                        ratioSum += r;
                    }
                });
            }
        }

        // 万が一粉がないレシピの場合はデフォルト200gとする
        if (totalFlourBase === 0) totalFlourBase = 200;

        // 初期値をレシピの正確な粉の合計量にセットする
        flourInput.value = totalFlourBase;

        // 初回の材料リスト描画
        updateIngredientsDisplay(totalFlourBase, totalFlourBase);

        // 入力イベントリスナーの設定
        flourInput.addEventListener('input', () => {
            const inputVal = parseFloat(flourInput.value) || 0;
            updateIngredientsDisplay(inputVal, totalFlourBase);
        });

    } catch (error) {
        console.error("Flour Calc Setup Error:", error);
    }
}

/**
 * 入力された粉の量に応じて画面上の材料数値を更新する関数
 */
function updateIngredientsDisplay(currentFlourVal, baseAmount) {
    if (!currentRecipeData || !currentRecipeData.ingredients) return;

    const listDiv = document.getElementById('ingredientsList');
    if (!listDiv) return;

    // 現在の入力値 / 本来の総粉量 で正確な倍率（multiplier）を算出
    const multiplier = baseAmount > 0 ? (currentFlourVal / baseAmount) : 1;

    let html = "";
    for (const group in currentRecipeData.ingredients) {
        html += `<div class="onao-ingredient-group"><h3>${group}</h3></div>`;
        
        currentRecipeData.ingredients[group].forEach((item, index) => {
            let amt;
            if (item.ratio !== undefined && item.ratio !== "" && typeof item.amount === 'number') {
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

    setupCheckEvent();
}

/**
 * ② 手順のテキストから時間表記を探してタイマーリンクに置換する
 */
function enableTimerLinksInSteps() {
    const stepTexts = document.querySelectorAll('.step-text');
    
    stepTexts.forEach(el => {
        let text = el.innerHTML;
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
 * ③ タイマー機能（iPad・iOSタッチイベント完全対応版）
 */
function setupTimer() {
    const handleTimerClick = (e) => {
        const target = e.target.closest('.timer-link');
        if (!target) return;

        if (e.type === 'touchend') {
            e.preventDefault();
        }

        const fullText = target.innerText;
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
    };

    let isTouched = false;
    document.addEventListener('touchend', (e) => {
        isTouched = true;
        handleTimerClick(e);
        setTimeout(() => { isTouched = false; }, 500);
    }, { passive: false });

    document.addEventListener('click', (e) => {
        if (!isTouched) {
            handleTimerClick(e);
        }
    });

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
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            const tempCtx = new AudioCtx();
            tempCtx.resume();
        }
    } catch (e) {
        console.log("AudioContext init skipped");
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
            playTimerSound(); 

            if (display) display.style.display = 'none';
            if (msgEl) msgEl.style.display = 'block';

            if (stopBtn) {
                stopBtn.textContent = "リセット";
                stopBtn.style.backgroundColor = "#52ad1a";
            }
        }
    }, 1000);
}

function playTimerSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const context = new AudioCtx();
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
