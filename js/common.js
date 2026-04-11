// js/common.js

document.addEventListener('DOMContentLoaded', function() {
    // 1. ヘッダーの読み込みとActive設定
    fetch('header.html')
        .then(res => res.text())
        .then(data => {
            document.getElementById('header-placeholder').innerHTML = data;
            if ($.fn.classyNav) $('#deliciousNav').classyNav();

            // アクティブ判定（最強版）
            const currentFile = window.location.pathname.split("/").pop().split("?")[0] || "index.html";
            const navLinks = document.querySelectorAll('.classynav ul li a');
            navLinks.forEach(link => {
                const linkHref = link.getAttribute('href').split("/").pop().split("?")[0];
                if (linkHref === currentFile) {
                    link.parentElement.classList.add('active');
                    const parentDropdown = link.closest('.dropdown');
                    if (parentDropdown) parentDropdown.classList.add('active');
                }
            });
        });

    // 2. フッターの読み込み
    fetch('footer.html')
        .then(res => res.text())
        .then(data => {
            const footerPlaceholder = document.getElementById('footer-placeholder');
            if (footerPlaceholder) footerPlaceholder.innerHTML = data;
        });

    // 3. ボトムナビの読み込みとActive設定
    const bottomNavPlaceholder = document.getElementById('footer-nav-placeholder');
    if (bottomNavPlaceholder) {
        fetch('bottom-nav.html')
            .then(res => res.text())
            .then(data => {
                bottomNavPlaceholder.innerHTML = data;
                
                const currentPath = window.location.pathname.split("/").pop().split("?")[0] || "index.html";
                const navLinks = bottomNavPlaceholder.querySelectorAll('a');
                navLinks.forEach(link => {
                    const href = link.getAttribute('href').split("/").pop().split("?")[0];
                    if (href === currentPath) {
                        link.classList.add('active');
                    }
                });
            });
    }
});


window.addEventListener('pageshow', (event) => {
    // 戻るボタンでページが表示された場合
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        
        // 【追加】戻った時は、まずプレローダーを非表示にする
        const preloader = document.getElementById('preloader');
        if (preloader) {
            preloader.style.display = 'none';
        }

        // search.js に存在する、描画用のメイン関数を呼び出す
        if (typeof fetchAndDisplayRecipes === 'function') {
            const lastQuery = sessionStorage.getItem('lastSearchQuery') || "";
            const lastCategory = sessionStorage.getItem('lastCategory') || "0";
            
            // 保存されている検索条件で再描画する
            fetchAndDisplayRecipes(lastQuery, lastCategory);
        } else {
            // 【変更】トップページなど関数がない場所では、強制リロードをせず
            // そのまま表示を維持する（これでくるくるが消えた状態で止まります）
            console.log("戻り時のリロードをスキップしました");
        }
    }
});

/**
 * ギャラリーの画像をYouTubeサムネイルに自動置換
 * (common.jsの最後の方に追記)
 */
async function initGalleryThumbs() {
    const galleryItems = document.querySelectorAll('.single-insta-feeds a');
    if (galleryItems.length === 0) return; // ギャラリーがないページでは何もしない

    try {
        const response = await fetch('js/recipes.json');
        const recipes = await response.json();

        galleryItems.forEach(link => {
            const url = new URL(link.href, window.location.origin);
            const recipeId = url.searchParams.get('id');
            const recipe = recipes.find(r => r.id === recipeId);

            if (recipe && recipe.youtube) {
                const img = link.querySelector('img');
                if (img) {
                    // サイズが小さい場所なので mqdefault(320x180) で十分軽量
                    img.src = `https://img.youtube.com/vi/${recipe.youtube}/mqdefault.webp`;
                    img.onerror = function() {
                        this.src = `https://img.youtube.com/vi/${recipe.youtube}/mqdefault.jpg`;
                    };
                }
            }
        });
    } catch (e) {
        console.error("Gallery thumbs error:", e);
    }
}

// ページ読み込み完了時に実行
document.addEventListener('DOMContentLoaded', initGalleryThumbs);
