export function parseDateInput(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildVocabPlan(words, startDate, examDate) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(examDate);

  if (!start && !end) {
    return { days: [], error: "", empty: true };
  }

  if (!start || !end) {
    return { days: [], error: "請先填入有效的開始日期與考試日期。", empty: false };
  }

  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (diffDays <= 0) {
    return { days: [], error: "考試日期不能早於開始日期。", empty: false };
  }

  const totalWords = words.length;
  if (!totalWords) {
    return { days: [], error: "目前沒有可規劃的單字資料。", empty: false };
  }

  const days = Array.from({ length: diffDays }, (_, idx) => {
    const from = Math.floor((idx * totalWords) / diffDays);
    const to = Math.floor(((idx + 1) * totalWords) / diffDays);
    const date = new Date(start);
    date.setDate(start.getDate() + idx);

    return {
      day: idx + 1,
      date: formatYmd(date),
      words: words.slice(from, to),
    };
  });

  return {
    days,
    totalWords,
    totalDays: diffDays,
    avg: Math.ceil(totalWords / diffDays),
    error: "",
    empty: false,
  };
}

export function findTodayPlanIndex(days = []) {
  if (!Array.isArray(days) || !days.length) return 0;
  const today = formatYmd(new Date());
  const idx = days.findIndex((x) => x.date === today);
  return idx >= 0 ? idx : 0;
}
