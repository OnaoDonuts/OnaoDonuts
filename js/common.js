// js/common.js
// ヘッダー・フッター・ボトムナビを読み込む。
// build.py が最初からHTMLに埋め込んでいるページ（data-prerendered="1"）では、fetchせずに初期化だけ行う。

// classyNav を「同じ要素には1回だけ」しか実行しないようにする。
// ヘッダーを最初からHTMLに埋め込むと、active.js と common.js の両方が初期化を呼ぶため、
// 二重初期化でメニューの開閉が壊れるのを防ぐ。
(function () {
    if (!window.jQuery || !jQuery.fn || typeof jQuery.fn.classyNav !== 'function') return;
    if (jQuery.fn.classyNav.__onaoGuarded) return;

    const original = jQuery.fn.classyNav;
    const guarded = function () {
        const args = arguments;
        return this.each(function () {
            const $el = jQuery(this);
            if ($el.data('onaoClassyNavInit')) return;
            $el.data('onaoClassyNavInit', true);
            original.apply($el, args);
        });
    };
    guarded.__onaoGuarded = true;
    jQuery.fn.classyNav = guarded;
})();

document.addEventListener('DOMContentLoaded', function() {
    // ---- 1. ヘッダー ----
    const headerPlaceholder = document.getElementById('header-placeholder');

    const initHeader = () => {
        // 二重初期化を防ぐ
        if (headerPlaceholder && headerPlaceholder.dataset.navInit === '1') return;
        if (headerPlaceholder) headerPlaceholder.dataset.navInit = '1';

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
    };

    if (headerPlaceholder && headerPlaceholder.dataset.prerendered === '1') {
        initHeader();
    } else {
        fetch('header.html')
            .then(res => res.text())
            .then(data => {
                document.getElementById('header-placeholder').innerHTML = data;
                initHeader();
            });
    }

    // ---- 2. フッター ----
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder && footerPlaceholder.dataset.prerendered !== '1') {
        fetch('footer.html')
            .then(res => res.text())
            .then(data => {
                // innerHTML で挿入した <script> は実行されないため、年の表示だけここで置き換える
                const withYear = data.replace(
                    /<script>\s*document\.write\(new Date\(\)\.getFullYear\(\)\);?\s*<\/script>/g,
                    String(new Date().getFullYear())
                );
                footerPlaceholder.innerHTML = withYear;
            });
    }

    // ---- 3. ボトムナビ ----
    const bottomNavPlaceholder = document.getElementById('footer-nav-placeholder');

    const markBottomNavActive = () => {
        const currentPath = window.location.pathname.split("/").pop().split("?")[0] || "index.html";
        const navLinks = bottomNavPlaceholder.querySelectorAll('a');
        navLinks.forEach(link => {
            const href = link.getAttribute('href').split("/").pop().split("?")[0];
            if (href === currentPath) {
                link.classList.add('active');
            }
        });
    };

    if (bottomNavPlaceholder) {
        if (bottomNavPlaceholder.dataset.prerendered === '1') {
            markBottomNavActive();
        } else {
            fetch('bottom-nav.html')
                .then(res => res.text())
                .then(data => {
                    bottomNavPlaceholder.innerHTML = data;
                    markBottomNavActive();
                });
        }
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
