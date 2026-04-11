// storage.js — 封裝所有 localStorage 存取
// 所有頁面都透過這個模組讀寫進度資料

const Storage = (() => {
  const KEYS = {
    VOCAB: 'toeic.vocabProgress',     // { wordId: { easiness, interval, nextReview, reps, lastReviewed } }
    MISTAKES: 'toeic.mistakes',        // [ { type, questionId, yourAnswer, correctAnswer, timestamp } ]
    STATS: 'toeic.stats',              // { streak, lastStudyDate, totalLearned, todayNewCount, todayDate }
    EXAM_HISTORY: 'toeic.examHistory', // [ { id, date, mode, part, score, total, timeSpent, questions: [{...snapshot, userAnswer}] } ]
    SETTINGS: 'toeic.settings',        // { startDate, theme }
    QUESTION_SRS: 'toeic.questionSRS', // { questionId: { easiness, interval, nextReview, reps } }
  };

  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      console.error('Storage read error', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage write error', key, e);
      return false;
    }
  }

  // ---------- Vocabulary progress ----------
  function getVocabProgress(wordId) {
    const all = read(KEYS.VOCAB, {});
    return all[wordId] || null;
  }

  function setVocabProgress(wordId, progress) {
    const all = read(KEYS.VOCAB, {});
    all[wordId] = progress;
    write(KEYS.VOCAB, all);
  }

  function removeVocabProgress(wordId) {
    const all = read(KEYS.VOCAB, {});
    if (!all[wordId]) return false;
    delete all[wordId];
    write(KEYS.VOCAB, all);
    // 回補 totalLearned（避免計數錯亂）
    const s = getStats();
    if (s.totalLearned > 0) {
      s.totalLearned -= 1;
      write(KEYS.STATS, s);
    }
    return true;
  }

  function getAllVocabProgress() {
    return read(KEYS.VOCAB, {});
  }

  function getDueVocab(todayISO) {
    const all = read(KEYS.VOCAB, {});
    const today = todayISO || new Date().toISOString().slice(0, 10);
    const due = [];
    for (const [id, p] of Object.entries(all)) {
      if (p.nextReview && p.nextReview <= today) due.push(id);
    }
    return due;
  }

  // ---------- Mistakes ----------
  function getMistakes() {
    return read(KEYS.MISTAKES, []);
  }

  function addMistake(m) {
    const list = read(KEYS.MISTAKES, []);
    list.push({ ...m, timestamp: Date.now() });
    // keep last 2000
    if (list.length > 2000) list.splice(0, list.length - 2000);
    write(KEYS.MISTAKES, list);
  }

  function removeMistake(questionId) {
    const list = read(KEYS.MISTAKES, []).filter(m => m.questionId !== questionId);
    write(KEYS.MISTAKES, list);
  }

  // ---------- Question SRS (for exam questions) ----------
  function getQuestionSRS(qid) {
    return read(KEYS.QUESTION_SRS, {})[qid] || null;
  }

  function setQuestionSRS(qid, progress) {
    const all = read(KEYS.QUESTION_SRS, {});
    all[qid] = progress;
    write(KEYS.QUESTION_SRS, all);
  }

  function getDueQuestions(todayISO) {
    const all = read(KEYS.QUESTION_SRS, {});
    const today = todayISO || new Date().toISOString().slice(0, 10);
    return Object.keys(all).filter(id => all[id].nextReview && all[id].nextReview <= today);
  }

  // ---------- Stats ----------
  function getStats() {
    return read(KEYS.STATS, {
      streak: 0,
      lastStudyDate: null,
      totalLearned: 0,
      todayNewCount: 0,
      todayDate: null,
    });
  }

  function bumpStudyStreak() {
    const s = getStats();
    const today = new Date().toISOString().slice(0, 10);
    if (s.lastStudyDate === today) return s;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.streak = s.lastStudyDate === yesterday ? s.streak + 1 : 1;
    s.lastStudyDate = today;
    if (s.todayDate !== today) {
      s.todayDate = today;
      s.todayNewCount = 0;
    }
    write(KEYS.STATS, s);
    return s;
  }

  function incTodayNew(n = 1) {
    const s = getStats();
    const today = new Date().toISOString().slice(0, 10);
    if (s.todayDate !== today) {
      s.todayDate = today;
      s.todayNewCount = 0;
    }
    s.todayNewCount += n;
    s.totalLearned += n;
    write(KEYS.STATS, s);
  }

  // ---------- Exam history ----------
  // 最多保留 80 次考試，並在容量不足時優先刪除舊紀錄。
  const MAX_EXAM_HISTORY = 80;

  function addExamResult(result) {
    const list = read(KEYS.EXAM_HISTORY, []);
    const id = 'exam_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const entry = { ...result, id, date: new Date().toISOString() };
    list.push(entry);
    // 超過上限時砍掉最舊的幾筆
    if (list.length > MAX_EXAM_HISTORY) list.splice(0, list.length - MAX_EXAM_HISTORY);

    // 容量不足時，自動刪舊保新，避免交卷後沒有可回顧紀錄。
    let ok = write(KEYS.EXAM_HISTORY, list);
    while (!ok && list.length > 1) {
      list.shift();
      ok = write(KEYS.EXAM_HISTORY, list);
    }
    if (!ok) write(KEYS.EXAM_HISTORY, [entry]);

    return id;
  }

  function getExamHistory() {
    return read(KEYS.EXAM_HISTORY, []);
  }

  function getExamById(id) {
    return read(KEYS.EXAM_HISTORY, []).find(e => e.id === id) || null;
  }

  function deleteExamById(id) {
    const list = read(KEYS.EXAM_HISTORY, []).filter(e => e.id !== id);
    write(KEYS.EXAM_HISTORY, list);
  }

  // ---------- Settings ----------
  function getSettings() {
    return read(KEYS.SETTINGS, {
      startDate: null,
      theme: 'light',
    });
  }

  function setSettings(s) {
    write(KEYS.SETTINGS, { ...getSettings(), ...s });
  }

  function ensureStartDate() {
    const s = getSettings();
    if (!s.startDate) {
      s.startDate = new Date().toISOString().slice(0, 10);
      write(KEYS.SETTINGS, s);
    }
    return s.startDate;
  }

  // ---------- Backup ----------
  function exportAll() {
    const dump = {};
    for (const k of Object.values(KEYS)) dump[k] = read(k, null);
    return dump;
  }

  function importAll(dump) {
    for (const [k, v] of Object.entries(dump)) {
      if (Object.values(KEYS).includes(k) && v !== null) write(k, v);
    }
  }

  function clearAll() {
    for (const k of Object.values(KEYS)) localStorage.removeItem(k);
  }

  return {
    KEYS,
    getVocabProgress, setVocabProgress, removeVocabProgress, getAllVocabProgress, getDueVocab,
    getMistakes, addMistake, removeMistake,
    getQuestionSRS, setQuestionSRS, getDueQuestions,
    getStats, bumpStudyStreak, incTodayNew,
    addExamResult, getExamHistory, getExamById, deleteExamById,
    getSettings, setSettings, ensureStartDate,
    exportAll, importAll, clearAll,
  };
})();

window.Storage = Storage;
