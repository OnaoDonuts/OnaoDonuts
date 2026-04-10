/**
 * レシピ詳細ページ専用スクリプト - 完全統合版
 */

let timerInterval = null; 
let currentFlour = 200; 
let recipeData = null;  
// 1. タイマーのグローバル変数
let countdown;
let timerSeconds = 0;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const recipeId = urlParams.get('id');
    const preloader = document.getElementById('preloader');

    const hideLoader = () => {
        if (preloader) preloader.style.display = 'none';
    };

    if (!recipeId) {
        alert("レシピIDが指定されていません。");
        hideLoader();
        return;
    }

    try {
        const response = await fetch('js/recipes.json');
        if (!response.ok) throw new Error("JSON読み込み失敗");
        
        const recipes = await response.json();
        const recipe = recipes.find(r => r.id === recipeId);

        if (recipe) {
            if (recipe.isShort === true) {
                document.body.innerHTML = `<div style="padding:100px; text-align:center;"><h3>ショート専用レシピです</h3><a href="recipe-search.html">戻る</a></div>`;
                hideLoader();
                return;
            }
            renderRecipePage(recipe);
            setupFavorite(recipe.id);
        } else {
            alert("レシピが見つかりません。");
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        hideLoader();
    }

    // タイマー操作
    document.getElementById('timerStop')?.addEventListener('click', stopTimer);
    document.getElementById('timerClose')?.addEventListener('click', () => {
        stopTimer();
        document.getElementById('recipeTimer').style.display = 'none';
    });
});

/**
 * 1. レシピ詳細ページを描画するメイン関数
 */
function renderRecipePage(recipe) {
    recipeData = recipe; 

    // 1. SEO・メタタグ・ブラウザタイトルの更新
    document.title = `${recipe.name} | おなおドーナツ`;
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = "description";
        document.head.appendChild(metaDesc);
    }
    metaDesc.content = recipe.description || `${recipe.name}の作り方をご紹介します。`;


    // --- ratio 100 の材料から基準量を自動取得（グループ分け対応版） ---
    let foundBase = null;
    for (const group in recipe.ingredients) {
        foundBase = recipe.ingredients[group].find(ing => ing.ratio === 100);
        if (foundBase) break;
    }
    currentFlour = foundBase ? foundBase.amount : 200;
    

    // 入力欄（粉の量）に初期値をセット
    const flourInput = document.getElementById('flourAmount');
    if (flourInput) {
        flourInput.value = currentFlour;
    }

    // 3. ヒーローエリアの表示（新しいHTML構造に対応）
    // レシピ名
    const titleEl = document.getElementById('recipeTitle');
    if (titleEl) titleEl.textContent = recipe.name;

   // レシピの説明文を表示する
const descriptionEl = document.getElementById('recipeDescription');
if (descriptionEl && recipe.description) {
    descriptionEl.innerHTML = `
        <div class="onao-comment-text">
            <p>${recipe.description}</p>
        </div>
    `;
}

  // 時間表示
    const timeVal = document.querySelector('.time-val');
    if (timeVal) {
         
        // ★ここで formatTime を呼び出す
        timeVal.textContent = formatTime(recipe.time);
    }
    
       // 難易度の表示修正
const starsArea = document.querySelector('.stars-area');
if (starsArea) {
    
    const diff = parseInt(recipe.difficulty) || 0;
    // ★「難易度」ラベルをここで追加
    let starHtml = '';
    for (let i = 1; i <= 5; i++) {
        starHtml += (i <= diff) ?
         '<i class="fa-solid fa-star"></i>' :
          '<i class="fa-regular fa-star"></i>';
    }
    starsArea.innerHTML = starHtml;
}


// 背景の設定（シンプル背景に変更）
const hero = document.getElementById('recipeHero');
if (hero) {
    // 画像のセットを中止し、ビターチョコレート・ブラウンを直接指定
    hero.style.backgroundImage = 'none'; // 念のため既存の画像を消す
    hero.style.backgroundColor = '#4b3e2a'; // ここでお好きな色を指定
}



// 完成写真（メイン画像）
const descImg = document.getElementById('descriptionMainImg');
if (descImg && recipe.youtube) {
    // 検索結果と同じ、確実に存在するサイズ（mqまたはhq）を指定します
    // ひとまず検索結果と同じ「mqdefault」にすれば、100%表示されます
    descImg.src = `https://img.youtube.com/vi/${recipe.youtube}/hqdefault.jpg`;
}

    // 4. 材料リストの描画（計算機機能）
    if (flourInput) {
        // 入力されるたびに updateIngredients を実行
        flourInput.addEventListener('input', () => {
            updateIngredients();
        });
    }
    updateIngredients();

    // 5. 手順（Steps）の表示とタイマー連動
    const stepsDiv = document.getElementById('stepsList');
    if (stepsDiv && recipe.steps) {
        let stepsHtml = "";
recipe.steps.forEach((section, sIndex) => { // セクションの番号(sIndex)を追加
    if (section.group) {
        stepsHtml += `<div class="onao-section-title"><h3>${section.group}</h3></div>`;
    }
    section.items.forEach((stepText, iIndex) => {
        // セクション番号とアイテム番号を組み合わせて、唯一無二のIDを作る
        const uniqueId = `step-${sIndex}-${iIndex}`; 
        stepsHtml += createStepItemHtml(iIndex + 1, stepText, uniqueId);
    });
});
        stepsDiv.innerHTML = stepsHtml;
        
        stepsDiv.querySelectorAll('.step-text').forEach(text => {
            text.addEventListener('click', function() {
                const check = this.closest('.single-preparation-step').querySelector('.step-check');
                check.click();
            });
        });
    }

    // 6. YouTube動画の表示
    const videoContainer = document.getElementById('videoContainer');
    if (videoContainer && recipe.youtube) {
        // 1. まずは枠組みだけ作る（iframeの代わりに div#player を置く）
        videoContainer.innerHTML = `
            <div class="embed-responsive embed-responsive-16by9" style="border-radius:15px; overflow:hidden; box-shadow:0 8px 20px rgba(0,0,0,0.15);">
                <div id="player"></div>
            </div>`;

        // 2. YouTube APIの本体（scriptタグ）を読み込む（まだ読み込まれていない場合のみ）
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        // 3. APIの準備ができたらプレーヤーを作成し、ミュートにする命令を送る
        // ※ すでにAPIが読み込み済みの場合は直接作成、そうでなければコールバックを待つ
        const createPlayer = () => {
            new YT.Player('player', {
                videoId: recipe.youtube,
                playerVars: {
                    'rel': 0,
                    'mute': 1,        // ブラウザへのミュート指定
                    'playsinline': 1
                },
                events: {
                    'onReady': (event) => {
                        event.target.mute(); // 準備ができたら確実に消音
                        // event.target.playVideo(); // 自動再生もしたい場合はこれを入れる
                    }
                }
            });
        };

        if (window.YT && window.YT.Player) {
            createPlayer();
        } else {
            window.onYouTubeIframeAPIReady = createPlayer;
        }
    }

    setupTimer();           
    // ★全てのHTMLを入れ終わった「後」に、これを追記します
    setupCheckEvent(); 
    displayRelatedRecipes(recipe);
     

    updateRecipeSchema(recipe);

        // --- ここから追加 ---
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.rel = 'canonical';
        document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = `https://onaodonuts.github.io/OnaoDonuts/recipe-detail.html?id=${recipe.id}`;
    // --- ここまで追加 ---
    
        // --- 追加：SNSシェア用（OGP）の動的書き換え ---
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = `${recipe.name} | おなおドーナツ`;

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = recipe.description || "おなおドーナツの美味しいパンレシピ紹介";

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage && recipe.youtube) {
        // SNSでシェアされた時、YouTubeのサムネイルをデカデカと表示させる
        ogImage.content = `https://img.youtube.com/vi/${recipe.youtube}/maxresdefault.jpg`;
    }
    
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
        ogUrl.content = `https://onaodonuts.github.io/OnaoDonuts/recipe-detail.html?id=${recipe.id}`;
    }

    // お気に入りボタンの制御（デグレ修正）
    const faveBtn = document.getElementById('faveBtn');
    const faveIcon = document.getElementById('faveIcon');
  const faveText = faveBtn ? faveBtn.querySelector('span') : null; // ボタン内の文字
  
 if (faveBtn && faveIcon) {
        let favorites = JSON.parse(localStorage.getItem('onao_favorites') || '[]');
        
        // 状態更新用の共通関数
        const updateFaveUI = (isFav) => {
            if (isFav) {
                faveBtn.classList.add('active');
                faveIcon.classList.replace('fa-regular', 'fa-solid');
                faveIcon.style.color = '#ff6b6b';
                if (faveText) faveText.textContent = "お気に入りを解除";
            } else {
                faveBtn.classList.remove('active');
                faveIcon.classList.replace('fa-solid', 'fa-regular');
                faveIcon.style.color = '#ccc';
                if (faveText) faveText.textContent = "お気に入りに登録";
            }
        };

        // 初期チェック
        updateFaveUI(favorites.includes(recipe.id));

        faveBtn.onclick = function() {
            favorites = JSON.parse(localStorage.getItem('onao_favorites') || '[]');
            const index = favorites.indexOf(recipe.id);
            if (index > -1) {
                favorites.splice(index, 1);
                updateFaveUI(false);
            } else {
                favorites.push(recipe.id);
                updateFaveUI(true);
            }
            localStorage.setItem('onao_favorites', JSON.stringify(favorites));
        };
    }
}

// 関連レシピを表示する関数
async function displayRelatedRecipes(currentRecipe) {
    try {
        const response = await fetch('js/recipes.json');
        const allRecipes = await response.json();

        // 1. 自分以外のレシピで、かつカテゴリーが1つでも一致するものを探す
        let related = allRecipes.filter(r => {
            return r.id !== currentRecipe.id && 
                   !r.isShort && // ショート動画専用は除外
                   r.category.some(cat => currentRecipe.category.includes(cat));
        });

        // 2. ランダムにシャッフルして3つ選ぶ
        related.sort(() => Math.random() - 0.5);
        const pickup = related.slice(0, 3);

        // 3. HTMLを生成して表示
        const relatedDiv = document.getElementById('relatedRecipes');
        if (!relatedDiv) return;

        if (pickup.length === 0) {
            relatedDiv.innerHTML = '<p class="ml-3 text-muted">関連レシピはまだありません</p>';
            return;
        }

let html = "";
pickup.forEach(r => {
    html += `
        <div class="col-12 col-sm-4 mb-4">
            <div class="onao-related-card" onclick="location.href='recipe-detail.html?id=${r.id}'">
                <div class="onao-related-thumb">
                    <img src="https://img.youtube.com/vi/${r.youtube}/mqdefault.jpg" alt="${r.name}の完成写真"  loading="lazy">
                </div>
                <div class="onao-related-body">
                    <h3>${r.name}</h3>
                </div>
            </div>
        </div>`;
});
relatedDiv.innerHTML = html;


    } catch (error) {
        console.error("Related Recipes Error:", error);
    }
}

/**
 * 2. 手順の1項目分を生成する補助関数
 */
function createStepItemHtml(displayNumber, stepContent, stepId) { 
    let processedStep = stepContent;
    
    // 新：時間や半にも対応できるパターン
const timeMatch = stepContent.match(/(\d+〜?\d*)(時間|分)(半)?/g);

    if (timeMatch) {
        timeMatch.forEach(match => {
            processedStep = processedStep.replace(match, `<span class="timer-link" style="color:var(--onao-green); font-weight:bold; cursor:pointer; text-decoration:underline;">${match}</span>`);
        });
    }

    // 2. HTMLを組み立てる
    return `
        <div class="single-preparation-step">
            <div class="d-flex align-items-start">
                <div class="step-left-column d-flex flex-column align-items-start mr-3">
                    <div class="step-number mb-2">
                        <h4>STEP ${displayNumber}</h4>
                    </div>
                    <div class="custom-control custom-checkbox p-0 m-0">
<input type="checkbox" class="custom-control-input step-check" id="${stepId}" aria-label="手順${displayNumber}を完了とする">
                        <label class="custom-control-label" for="${stepId}"></label>
                    </div>
                </div>
                <div class="step-right-column flex-grow-1">
                    <p class="step-text">${processedStep}</p>
                </div>
            </div>
        </div>`;
}


/**
 * 3. お気に入り機能のロジック
 */
function setupFavorite(recipeId) {
    const favBtn = document.getElementById('favoriteBtn');
    if (!favBtn) return;

    let favorites = JSON.parse(localStorage.getItem('onao_favorites')) || [];
    
    const updateBtnLook = (active) => {
        const icon = favBtn.querySelector('i');
        const text = favBtn.querySelector('.fav-text');
        if (active) {
            favBtn.classList.add('active');
            icon?.classList.replace('fa-regular', 'fa-solid');
            if (text) text.textContent = 'お気に入り登録済み';
        } else {
            favBtn.classList.remove('active');
            icon?.classList.replace('fa-solid', 'fa-regular');
            if (text) text.textContent = 'お気に入りに入れる';
        }
    };

    updateBtnLook(favorites.includes(recipeId));

    favBtn.onclick = (e) => {
        e.preventDefault();
        favorites = JSON.parse(localStorage.getItem('onao_favorites')) || [];
        const index = favorites.indexOf(recipeId);
        if (index > -1) {
            favorites.splice(index, 1);
            updateBtnLook(false);
        } else {
            favorites.push(recipeId);
            updateBtnLook(true);
        }
        localStorage.setItem('onao_favorites', JSON.stringify(favorites));
    };
}

/**
 * 4. 材料リスト表示・計算
 */
function updateIngredients() {
    const listDiv = document.getElementById('ingredientsList');
    // HTMLから現在の入力値を確実に取得する
    const flourInput = document.getElementById('flourAmount');
    if (flourInput) currentFlour = parseFloat(flourInput.value) || 0;
   
    // ★重要：recipeData が空だと計算できないのでチェック
    if (!listDiv || !recipeData || !recipeData.ingredients) {
        console.log("データがまだ読み込まれていません");
        return;
    }

    let baseAmount = 200; // 見つからなかった時の予備
    
    // ingredientsがオブジェクト（グループ分けされている）形式なので、全グループを探索
    for (const group in recipeData.ingredients) {
        const found = recipeData.ingredients[group].find(ing => ing.ratio === 100);
        if (found) {
            baseAmount = found.amount;
            break; // 見つかったらループ終了
        }
    }
    
    let html = "";
    for (const group in recipeData.ingredients) {
html += `<div class="onao-ingredient-group"><h3>${group}</h3></div>`;
        
        recipeData.ingredients[group].forEach((item, index) => {
            // ★JSONのratioをそのまま使って計算
            let amt;
            if (item.ratio !== undefined && item.ratio !== "") {
const multiplier = currentFlour / baseAmount;
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

}



/**
 * レシピの構造化データを動的に生成してGoogleに伝える
 */
function updateRecipeSchema(recipe) {
    const schemaElement = document.getElementById('recipe-schema');
    if (!schemaElement || !recipe) return;

    // 材料をフラットな配列に変換
    let ingredientsArray = [];
    if (recipe.ingredients) {
        Object.keys(recipe.ingredients).forEach(key => {
            recipe.ingredients[key].forEach(item => {
                if (item.name) ingredientsArray.push(`${item.name} ${item.amount || ''}`);
            });
        });
    }

    // JSON-LDの作成
    const schemaData = {
        "@context": "https://schema.org/",
        "@type": "Recipe",
        "name": recipe.name,
        "image": [
            // 本来はフルURLが理想です。ドメインが決まったら追加してください
            `https://img.youtube.com/vi/${recipe.youtube}/hqdefault.jpg`
        ],
        "author": {
            "@type": "Person",
            "name": "おなおドーナツ"
        },
        "description": recipe.description || `${recipe.name}の美味しい作り方レシピをご紹介します。`,
        "prepTime": `PT${recipe.time || 0}M`, // 調理時間（分）
        "recipeIngredient": ingredientsArray,
        "totalTime": `PT${recipe.time || 0}M`,
        "keywords": "ホームベーカリー, こねないパン, おなおドーナツ",
        "recipeInstructions": recipe.steps ? recipe.steps.map(step => ({
            "@type": "HowToStep",
            "text": step
        })) : [],
        "video": {
            "@type": "VideoObject",
            "name": `${recipe.name}の作り方動画`,
            "description": `${recipe.name}を動画で分かりやすく解説します。`,
            "thumbnailUrl": `https://img.youtube.com/vi/${recipe.youtube}/hqdefault.jpg`,
            "contentUrl": `https://www.youtube.com/watch?v=${recipe.youtube}`,
            "embedUrl": `https://www.youtube.com/embed/${recipe.youtube}`,
            "uploadDate": "2022-01-18T08:00:00+09:00" 
        }
    };

    schemaElement.text = JSON.stringify(schemaData);
}



/**
 * 5. 時間表示形式変換
 */
function formatTime(totalMinutes) {
    if (!totalMinutes || totalMinutes === "0" || totalMinutes === "") return '---';
    const mins = parseInt(totalMinutes);
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    
    if (hours > 0) {
        const displayMins = String(minutes).padStart(2, '0');
        return `${hours}h ${displayMins}m`;
    } else {
        return `${minutes}m`;
    }
}



// 2. タイマーを表示・セットする関数
function setupTimer() {
    const timerOverlay = document.getElementById('recipeTimer');
    const closeBtn = document.getElementById('timerClose');
    const stopBtn = document.getElementById('timerStop');

    // 画面全体のクリックを監視
    document.onclick = function(e) {
        // クリックされたのが「タイマーリンク」だった場合
        if (e.target.classList.contains('timer-link')) {
            const fullText = e.target.innerText; // 例：「1時間半」「15分」
            let totalSeconds = 0;

            // 1. 数字（1〜999）を抜き出す
            const numMatch = fullText.match(/\d+/);
            if (!numMatch) return;
            const num = parseInt(numMatch[0]);

            // 2. 単位を判定して秒数に変換する（ここが「賢い」ポイント！）
            if (fullText.includes('時間')) {
                // 「時間」が含まれる場合
                totalSeconds = num * 3600; // 1時間 = 3600秒
                if (fullText.includes('半')) {
                    totalSeconds += 1800; // 「半」があれば 30分(1800秒)プラス
                }
            } else if (fullText.includes('分')) {
                // 「分」が含まれる場合
                totalSeconds = num * 60; // 1分 = 60秒
                if (fullText.includes('半')) {
                    totalSeconds += 30; // 「半」があれば 30秒プラス
                }
            }

            // 3. 計算された秒数でタイマーを起動
            if (totalSeconds > 0) {
                startTimer(totalSeconds);
            }
        }
    };

  if (closeBtn) {
        closeBtn.onclick = () => {
            timerOverlay.style.display = 'none';
            clearInterval(countdown);
            // 次回のために表示を戻しておく
            document.getElementById('timerDisplay').style.display = 'block';
            document.getElementById('timerFinishedMessage').style.display = 'none';
        };
    }

    if (stopBtn) {
        stopBtn.onclick = () => {
            clearInterval(countdown);
            
            // リセット状態の表示
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
}


function startTimer(seconds) {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') {
        context.resume();
    }
    
    const timerOverlay = document.getElementById('recipeTimer');
    const display = document.getElementById('timerDisplay');
    const msgEl = document.getElementById('timerFinishedMessage'); // 追加
    const stopBtn = document.getElementById('timerStop');
    
    // 【開始時のリセット】数字を表示し、メッセージを隠す
    if (display) display.style.display = 'block';
    if (msgEl) msgEl.style.display = 'none';

    if (stopBtn) {
        stopBtn.style.backgroundColor = "#ff6b6b"; 
        stopBtn.style.color = "white";
        stopBtn.style.border = "none";    // ★枠線を消す
        stopBtn.style.outline = "none";   // ★クリック時の青い枠なども消す
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
            
            // 1. 音を鳴らす
            playTimerSound(context); 

            // 2. 表示の切り替え：数字を消して、メッセージを出す
            if (display) display.style.display = 'none';
            if (msgEl) msgEl.style.display = 'block';

            // 3. ボタンを「リセット」に変える
            if (stopBtn) {
                stopBtn.textContent = "リセット";
                stopBtn.style.backgroundColor = "#52ad1a"; // おなおグリーン
            }
            
            // ★ alertはもう不要なので消してOKです！
        }
    }, 1000);
}

// 音を鳴らす専用の補助関数
function playTimerSound(existingContext) {
    try {
        const context = existingContext || new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        
        oscillator.connect(gain);
        gain.connect(context.destination);
        
        oscillator.type = 'sine'; // 柔らかい音
        oscillator.frequency.setValueAtTime(880, context.currentTime); // ラの音
        gain.gain.setValueAtTime(0.3, context.currentTime); // 音量
        
        oscillator.start();
        oscillator.stop(context.currentTime + 0.5); // 0.5秒間
    } catch (e) {
        console.error("Audio Error:", e);
    }
}


function setupCheckEvent() {
    // 1. 手順のチェック
    document.querySelectorAll('.step-check').forEach(check => {
        check.addEventListener('change', function() {
            // .single-preparation-step の中にある .step-text を探す
            const stepText = this.closest('.single-preparation-step').querySelector('.step-text');
            if (stepText) {
                // クラスを付け外しする
                if (this.checked) {
                    stepText.classList.add('checked-item');
                } else {
                    stepText.classList.remove('checked-item');
                }
            }
        });
    });

    // 2. 材料のチェック
    document.querySelectorAll('.ingredient-check').forEach(check => {
        check.addEventListener('change', function() {
            // 材料の場合は label 全体をターゲットにする
            const label = this.parentElement.querySelector('label');
            if (label) {
                if (this.checked) {
                    label.classList.add('checked-item');
                } else {
                    label.classList.remove('checked-item');
                }
            }
        });
    });
}
