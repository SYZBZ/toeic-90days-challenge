// vocabulary.js — 單字庫搜尋、分頁、詳細顯示
const Vocabulary = (() => {
  let allWords = [];
  let filtered = [];
  let page = 1;
  const PAGE_SIZE = 20;

  async function init() {
    const data = await App.loadJSON('vocabulary.json');
    if (!data || !data.words) {
      document.getElementById('vocab-list').innerHTML =
        '<div class="empty">尚未建立單字庫。請先執行 <code>scripts/01_download_wordlists.py</code> 與 <code>02_enrich_vocabulary.py</code>。</div>';
      return;
    }
    allWords = data.words;
    filtered = allWords;

    document.getElementById('vocab-total').textContent = allWords.length;
    render();

    document.getElementById('vocab-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        filtered = allWords;
      } else {
        filtered = allWords.filter(w =>
          w.word.toLowerCase().includes(q) ||
          (w.definition || '').toLowerCase().includes(q) ||
          (w.translation || '').includes(q)
        );
      }
      page = 1;
      render();
    });

    document.getElementById('vocab-filter').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v === 'all') filtered = allWords;
      else if (v === 'tsl') filtered = allWords.filter(w => (w.source || []).includes('TSL'));
      else if (v === 'ngsl') filtered = allWords.filter(w => (w.source || []).includes('NGSL'));
      else if (v === 'learning') {
        const progress = Storage.getAllVocabProgress();
        filtered = allWords.filter(w => progress[w.id]);
      } else if (v === 'due') {
        const due = new Set(Storage.getDueVocab());
        filtered = allWords.filter(w => due.has(w.id));
      }
      page = 1;
      render();
    });
  }

  function render() {
    const list = document.getElementById('vocab-list');
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;
    const start = (page - 1) * PAGE_SIZE;
    const items = filtered.slice(start, start + PAGE_SIZE);

    if (!items.length) {
      list.innerHTML = '<div class="empty">沒有符合的單字。</div>';
      document.getElementById('vocab-pager').innerHTML = '';
      return;
    }

    const progress = Storage.getAllVocabProgress();

    list.innerHTML = items.map(w => {
      const prog = progress[w.id];
      const learning = prog ? `<span class="tag">學習中 · reps ${prog.reps}</span>` : '';
      const sourceTags = (w.source || []).map(s => `<span class="tag">${s}</span>`).join('');
      const phonetic = w.phonetic ? `<span class="phonetic">${w.phonetic}</span>` : '';
      const translation = w.translation
        ? `<div class="translation">${escapeHtml(w.translation)}</div>`
        : '';
      return `
        <div class="word-row" data-id="${w.id}">
          <div class="word-main">
            <div class="word-text">${escapeHtml(w.word)} ${phonetic}</div>
            ${translation}
            <div>${sourceTags} ${learning}</div>
            <div class="def">${escapeHtml(w.definition || '(尚無定義)')}</div>
            ${w.example ? `<div class="def" style="font-style:italic; color:var(--text-muted)">「${escapeHtml(w.example)}」</div>` : ''}
          </div>
          <div class="row">
            <button class="btn small secondary btn-say" title="發音">🔊</button>
            <button class="btn small ${prog ? 'success' : ''} btn-learn" title="${prog ? '再點一次可取消' : '加入學習'}">${prog ? '✓ 已加入（再點取消）' : '＋學習'}</button>
          </div>
        </div>
      `;
    }).join('');

    // 綁定按鈕
    list.querySelectorAll('.word-row').forEach(row => {
      const id = row.dataset.id;
      const w = allWords.find(x => x.id === id);
      row.querySelector('.btn-say').addEventListener('click', () => Speech.say(w.word));
      row.querySelector('.btn-learn').addEventListener('click', () => toggleLearn(id));
    });

    renderPager(pages);
  }

  function toggleLearn(id) {
    if (Storage.getVocabProgress(id)) {
      Storage.removeVocabProgress(id);
      App.toast('已取消學習');
    } else {
      Storage.setVocabProgress(id, SRS.newCard());
      Storage.incTodayNew(1);
      Storage.bumpStudyStreak();
      App.toast('已加入學習清單');
    }
    render();
  }

  function renderPager(pages) {
    const pager = document.getElementById('vocab-pager');
    if (pages <= 1) { pager.innerHTML = ''; return; }
    const buttons = [];
    buttons.push(`<button ${page === 1 ? 'disabled' : ''} data-p="${page-1}">‹</button>`);
    // 顯示最多 7 個頁碼
    let start = Math.max(1, page - 3);
    let end = Math.min(pages, start + 6);
    start = Math.max(1, end - 6);
    for (let p = start; p <= end; p++) {
      buttons.push(`<button class="${p === page ? 'active' : ''}" data-p="${p}">${p}</button>`);
    }
    buttons.push(`<button ${page === pages ? 'disabled' : ''} data-p="${page+1}">›</button>`);
    pager.innerHTML = buttons.join('');
    pager.querySelectorAll('button[data-p]').forEach(b => {
      b.addEventListener('click', () => { page = parseInt(b.dataset.p); render(); });
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  return { init };
})();
