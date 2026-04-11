// app.js — 共用導覽列、資料載入、全域初始化

const App = (() => {
  const NAV = [
    { href: 'index.html',            label: '首頁' },
    { href: 'pages/daily.html',      label: '每日學習' },
    { href: 'pages/vocabulary.html', label: '單字庫' },
    { href: 'pages/grammar.html',    label: '語法教學' },
    { href: 'pages/exam.html',       label: '模擬考' },
    { href: 'pages/review.html',     label: '複習' },
    { href: 'pages/progress.html',   label: '進度' },
  ];

  function renderNav(activeHref) {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    // 判斷目前在哪個目錄層級，修正相對路徑
    const inPages = location.pathname.includes('/pages/');
    const prefix = inPages ? '../' : '';
    nav.innerHTML = `
      <div class="nav-brand">📚 TOEIC 875</div>
      <ul class="nav-links">
        ${NAV.map(n => {
          const href = n.href.startsWith('index') ? prefix + n.href
                     : inPages ? n.href.replace('pages/', '') : n.href;
          const isActive = activeHref && n.href.includes(activeHref);
          return `<li><a href="${href}" class="${isActive ? 'active' : ''}">${n.label}</a></li>`;
        }).join('')}
      </ul>
    `;
  }

  // 相對路徑到專案根目錄（給 data 檔案用）
  function dataPath(name) {
    const inPages = location.pathname.includes('/pages/');
    return (inPages ? '../data/' : 'data/') + name;
  }

  async function loadJSON(name) {
    // 1. 優先從打包檔讀（雙擊 file:// 開啟時唯一能用的方式）
    if (window.BUNDLED_DATA && window.BUNDLED_DATA[name]) {
      return window.BUNDLED_DATA[name];
    }
    // 2. 沒有打包檔時 fallback 去 fetch（例如用 Live Server / http.server 開的狀況）
    try {
      const res = await fetch(dataPath(name));
      if (!res.ok) throw new Error(`${name} not found (${res.status})`);
      return await res.json();
    } catch (e) {
      console.error('loadJSON failed:', name, e,
        '\n提示：若是雙擊 HTML 開啟，請先執行 python scripts/bundle_data.py 產生 data/data.js');
      return null;
    }
  }

  function toast(msg) {
    let t = document.getElementById('app-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'app-toast';
      t.className = 'app-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function init(activeHref) {
    renderNav(activeHref);
    Storage.ensureStartDate();
  }

  return { init, loadJSON, dataPath, toast };
})();

window.App = App;
