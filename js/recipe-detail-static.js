/**
 * 静的レシピページ専用スクリプト（完全修正版：動画タイムスタンプ＆タイマー連動対応）
 */

let countdown;
let timerSeconds = 0;
let currentRecipeData = null;
let ytPlayer = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 0. HTML上にタイマーモーダルが無い場合、JSで自動挿入する
    injectTimerModal();

    // 1. URLから現在のレシピIDを取得
    const path = window.location.pathname;
    const match = path.match(/recipe-(v\d+)\.html/);
    const currentId = match ? match[1] : null;

    if (currentId) {
        setupFavorite(currentId);
        await loadRecipeDataAndSetupFlour(currentId);
        await loadRelatedRecipes(currentId);
        loadStepImages(currentId);
    }

    // 2. 手順テキスト内の「時間・分」をタイマー化 ＆ 「[動画 MM:SS]」をタイムスタンプ化
    enableStepLinks();

    // 3. タイマーの起動・停止ロジックをセットアップ
    setupTimer();

    // 4. チェックボックスのイベント
    setupCheckEvent();

    // 5. YouTube動画プレイヤーの初期化＆タイムスタンプクリック設定
    setupMutedYouTubePlayer();
    setupVideoTimestampLinks();
});

/**
 * ★ 手順テキスト内の「〜分」と「[動画 MM:SS]」を同時にリンク化する関数
 */
function enableStepLinks() {
    const stepTexts = document.querySelectorAll('.step-text');
    
    stepTexts.forEach(el => {
        let text = el.innerHTML;
        
        // 1. 「〜時間」「〜分」をタイマーリンクに置換
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
        }

        // 2. 「[動画 MM:SS]」をYouTubeジャンプ用リンクに置換
        const videoMatch = text.match(/\[動画\s*(\d+:\d{2}(?::\d{2})?)\]/g);
        if (videoMatch) {
            text = text.replace(
                /\[動画\s*(\d+:\d{2}(?::\d{2})?)\]/g, 
                `<span class="video-timestamp" style="color:var(--onao-green, #52ad1a); font-weight:bold; cursor:pointer; text-decoration:underline;">[動画 $1]</span>`
            );
        }

        el.innerHTML = text;
    });
}

/**
 * ★ タイムスタンプをクリックしたときにYouTubeを指定時間にジャンプさせる処理
 */
function setupVideoTimestampLinks() {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.video-timestamp');
        if (!target) return;

        e.preventDefault();
        const text = target.innerText;
        const match = text.match(/(\d+:\d{2}(?:\:\d{2})?)/);
        if (!match) return;

        const timeStr = match[1];
        const seconds = convertVideoTimeToSeconds(timeStr);

        // iframeのsrcを書き換えて指定秒数へジャンプ＆自動再生させる
        const iframe = document.querySelector('#videoContainer iframe');
        if (iframe) {
            let src = iframe.src.split('&start=')[0].split('?start=')[0];
            const separator = src.includes('?') ? '&' : '?';
            iframe.src = `${src}${separator}start=${seconds}&autoplay=1`;

            const videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
                videoContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
}

/**
 * 動画の時間文字列を秒数に変換するヘルパー
 */
function convertVideoTimeToSeconds(timeStr) {
    const parts = timeStr.trim().split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 1 && !isNaN(parts[0])) {
        return parts[0];
    }
    return 0;
}

/**
 * 手順画像の自動挿入処理
 */
function loadStepImages(recipeId) {
    const stepItems = document.querySelectorAll('.single-preparation-step');

    stepItems.forEach((stepEl, index) => {
        const stepNum = index + 1;
        const imgPath = `img/recipes/${recipeId}/step-${stepNum}.webp`;

        const img = new Image();
        img.src = imgPath;

        img.onload = () => {
            const textContainer = stepEl.querySelector('.step-right-column') || stepEl.querySelector('.step-text')?.parentElement;

            if (textContainer && !textContainer.querySelector('.step-inserted-image')) {
                const imgDiv = document.createElement('div');
                imgDiv.className = 'step-inserted-image mt-2 mb-2';
                
                imgDiv.innerHTML = `
                    <img src="${imgPath}" 
                         alt="手順${stepNum}の画像" 
                         loading="lazy"
                         style="width: 100%; max-width: 420px; height: auto; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); display: block; margin-top: 8px;">
                `;
                textContainer.appendChild(imgDiv);
            }
        };

        img.onerror = () => {};
    });
}

/**
 * 埋め込みYouTube動画をAPI化して確実に初期消音（Mute）に設定する関数
 */
function setupMutedYouTubePlayer() {
    const iframe = document.querySelector('#videoContainer iframe');
    if (!iframe) return;

    iframe.id = 'recipeYoutubeIframe';

    let src = iframe.src;
    if (!src.includes('enablejsapi=1')) {
        src += (src.includes('?') ? '&' : '?') + 'enablejsapi=1&mute=1';
        iframe.src = src;
    }
}

/**
 * タイマー用HTML（モーダル）を動的にページへ注入する関数
 */
function injectTimerModal() {
    if (document.getElementById('recipeTimer')) return;

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

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * recipes.json を読み込んで粉量に応じた材料数値を動的計算・更新する処理
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

        let totalFlourBase = 0;
        let ratioSum = 0;

        if (currentRecipeData.ingredients) {
            for (const group in currentRecipeData.ingredients) {
                currentRecipeData.ingredients[group].forEach(ing => {
                    const r = parseFloat(ing.ratio) || 0;
                    const a = parseFloat(ing.amount) || 0;

                    if (r > 0 && ratioSum < 100) {
                        totalFlourBase += a;
                        ratioSum += r;
                    }
                });
            }
        }

        if (totalFlourBase === 0) totalFlourBase = 200;

        flourInput.value = totalFlourBase;
        updateIngredientsDisplay(totalFlourBase, totalFlourBase);

        // 粉量が変わったときのイベント
        flourInput.oninput = (e) => {
            const val = parseFloat(e.target.value) || 0;
            updateIngredientsDisplay(val, totalFlourBase);
        };

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
 * タイマー機能
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
    } catch (e) {}

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
    } catch (e) {}
}

/**
 * 関連レシピの読み込み
 */
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
                            <img src="https://img.youtube.com/vi/${r.youtube}/hqdefault.jpg" 
                                 alt="${r.name}の完成写真" 
                                 loading="lazy"
                                 onerror="this.src='https://img.youtube.com/vi/${r.youtube}/mqdefault.jpg';">
                        </div>
                        <div class="onao-related-body">
                            <h3 style="font-size:1rem; margin-top:10px; color:#4b3e2a;">${r.name}</h3>
                        </div>
                    </div>
                </div>`;
        });
        relatedDiv.innerHTML = html;

    } catch (error) {}
}

/**
 * お気に入り機能
 */
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

/**
 * チェックボックスの打ち消し線などのイベント
 */
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

/**
 * コラムの「続きを読む」開閉処理
 */
document.addEventListener("DOMContentLoaded", function() {
    const recipeDescription = document.getElementById("recipeDescription");
    const readMoreBtn = document.getElementById("readMoreBtn");

    if (recipeDescription && readMoreBtn) {
        if (recipeDescription.scrollHeight > 95) {
            readMoreBtn.style.display = "block";
        } else {
            readMoreBtn.style.display = "none";
        }

        readMoreBtn.addEventListener("click", function() {
            recipeDescription.classList.toggle("open");
            
            if (recipeDescription.classList.contains("open")) {
                readMoreBtn.textContent = "閉じる";
            } else {
                readMoreBtn.textContent = "続きを読む";
            }
        });
    }
});
