// srs.js — SM-2 簡化版間隔重複演算法
// 參考：https://en.wikipedia.org/wiki/SuperMemo#Description_of_SM-2_algorithm
//
// 每個卡片有：
//   easiness  (EF)      — 容易度因子，初始 2.5，最低 1.3
//   interval            — 下次複習間隔天數
//   repetitions (reps)  — 連續答對次數
//   nextReview          — ISO 日期字串 "YYYY-MM-DD"
//
// 使用者評分 quality: 0=Again(忘了) 3=Hard 4=Good 5=Easy

const SRS = (() => {
  function newCard() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      easiness: 2.5,
      interval: 0,
      reps: 0,
      nextReview: today,
      lastReviewed: null,
    };
  }

  function addDays(isoDate, days) {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function review(card, quality) {
    if (!card) card = newCard();
    const today = new Date().toISOString().slice(0, 10);
    const c = { ...card };

    if (quality < 3) {
      // 忘了 → 歸零重來
      c.reps = 0;
      c.interval = 1;
    } else {
      c.reps += 1;
      if (c.reps === 1) c.interval = 1;
      else if (c.reps === 2) c.interval = 3;
      else c.interval = Math.round(c.interval * c.easiness);
    }

    // 調整容易度
    c.easiness = c.easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (c.easiness < 1.3) c.easiness = 1.3;

    c.lastReviewed = today;
    c.nextReview = addDays(today, c.interval);
    return c;
  }

  const QUALITY = { AGAIN: 0, HARD: 3, GOOD: 4, EASY: 5 };

  return { newCard, review, QUALITY };
})();

window.SRS = SRS;
