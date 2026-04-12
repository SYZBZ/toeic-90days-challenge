import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  fetchBookmarkIds,
  removeBookmark,
  reviewSrsWord,
  saveUserSettings,
  setBookmark,
} from "../lib/firestoreService";
import { loadVocabulary } from "../lib/localData";
import { speakEnglishWord } from "../lib/speech";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InputField } from "../ui/InputField";

const PAGE_SIZE = 30;

function parseDateInput(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildVocabPlan(words, startDate, examDate) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(examDate);

  if (!start && !end) {
    return { days: [], error: "", empty: true };
  }

  if (!start || !end) {
    return { days: [], error: "請先填入有效的開始日期與考試日期。" };
  }

  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (diffDays <= 0) {
    return { days: [], error: "考試日期不能早於開始日期。" };
  }

  const totalWords = words.length;
  if (!totalWords) {
    return { days: [], error: "目前沒有可規劃的單字資料。" };
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

export default function VocabularyPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [allWords, setAllWords] = useState([]);
  const [bookmarkIds, setBookmarkIds] = useState(new Set());
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [speechMessage, setSpeechMessage] = useState("");

  const [planStartDate, setPlanStartDate] = useState("");
  const [planExamDate, setPlanExamDate] = useState("");
  const [planDayIndex, setPlanDayIndex] = useState(0);
  const [planSaving, setPlanSaving] = useState(false);
  const [planMessage, setPlanMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const [words, bIds] = await Promise.all([
        loadVocabulary(),
        user?.uid ? fetchBookmarkIds(user.uid) : Promise.resolve(new Set()),
      ]);

      if (!active) return;
      setAllWords(words);
      setBookmarkIds(bIds);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    setPlanStartDate(profile?.settings?.vocabPlan?.startDate || "");
    setPlanExamDate(profile?.settings?.vocabPlan?.examDate || "");
  }, [profile?.settings?.vocabPlan?.startDate, profile?.settings?.vocabPlan?.examDate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allWords.filter((word) => {
      if (sourceFilter === "tsl" && !word.source?.includes("TSL")) return false;
      if (sourceFilter === "ngsl" && !word.source?.includes("NGSL")) return false;
      if (sourceFilter === "bookmark" && !bookmarkIds.has(word.id)) return false;

      if (!q) return true;
      return [word.word, word.translation, word.definition, word.example]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(q));
    });
  }, [allWords, bookmarkIds, query, sourceFilter]);

  const plan = useMemo(() => buildVocabPlan(allWords, planStartDate, planExamDate), [allWords, planStartDate, planExamDate]);

  useEffect(() => {
    setPlanDayIndex(0);
  }, [planStartDate, planExamDate, allWords.length]);

  const currentPlanDay = plan.days?.[planDayIndex] || null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, sourceFilter]);

  async function savePlan() {
    if (!user?.uid) return;

    const start = parseDateInput(planStartDate);
    const end = parseDateInput(planExamDate);
    if (!start || !end) {
      setPlanMessage("請填入有效日期後再儲存。");
      return;
    }

    if (end.getTime() < start.getTime()) {
      setPlanMessage("考試日期不能早於開始日期。");
      return;
    }

    setPlanSaving(true);
    setPlanMessage("");
    try {
      await saveUserSettings(user.uid, {
        vocabPlan: {
          startDate: planStartDate,
          examDate: planExamDate,
        },
      });
      await refreshProfile(user.uid);
      setPlanMessage("已儲存備考單字規劃日期。");
    } catch (err) {
      setPlanMessage(err?.message || "儲存規劃失敗。");
    } finally {
      setPlanSaving(false);
    }
  }

  async function toggleBookmark(word) {
    if (!user?.uid) return;

    if (bookmarkIds.has(word.id)) {
      await removeBookmark(user.uid, word.id);
      setBookmarkIds((prev) => {
        const next = new Set(prev);
        next.delete(word.id);
        return next;
      });
    } else {
      await setBookmark(user.uid, word);
      setBookmarkIds((prev) => new Set(prev).add(word.id));
    }
  }

  async function markMastered(word) {
    if (!user?.uid) return;
    await reviewSrsWord(user.uid, word, 2);
  }

  function speakWord(word) {
    const result = speakEnglishWord(word?.word, { lang: "en-US", rate: 0.92 });
    if (!result.ok) {
      setSpeechMessage(result.message);
      return;
    }
    setSpeechMessage(`正在播放：${word.word}`);
  }

  if (loading) return <Card>載入單字庫中...</Card>;

  return (
    <div className="stack-lg">
      <section className="hero-panel compact">
        <p className="eyebrow">VOCABULARY</p>
        <h2>單字庫</h2>
        <p className="muted">共 {allWords.length} 筆，支援搜尋、來源篩選、收藏、SRS 與備考日程規劃。</p>
      </section>

      <Card>
        <h3>備考日程規劃</h3>
        <p className="muted">輸入你開始準備到正式考試的日期，系統會把全部單字自動切成 Day1、Day2... 的每日清單。</p>
        <div className="row wrap">
          <InputField
            label="開始日期"
            type="date"
            value={planStartDate}
            onChange={(e) => setPlanStartDate(e.target.value)}
          />
          <InputField
            label="考試日期"
            type="date"
            value={planExamDate}
            onChange={(e) => setPlanExamDate(e.target.value)}
          />
          <Button onClick={savePlan} disabled={planSaving}>{planSaving ? "儲存中..." : "儲存規劃日期"}</Button>
        </div>

        {planMessage && (
          <Banner tone={planMessage.includes("失敗") || planMessage.includes("不能") ? "danger" : "info"}>
            <span className="preline">{planMessage}</span>
          </Banner>
        )}

        {plan.error ? (
          <Banner tone="danger">{plan.error}</Banner>
        ) : plan.empty ? (
          <p className="muted">設定開始日與考試日後，這裡會自動產生 Day1 到 DayN 的單字清單。</p>
        ) : (
          <div className="stack-sm">
            <p className="muted">共 {plan.totalWords} 字，{plan.totalDays} 天，平均每日約 {plan.avg} 字。</p>
            <label className="field-wrap">
              <span className="field-label">查看日程</span>
              <select
                className="field-input"
                value={planDayIndex}
                onChange={(e) => setPlanDayIndex(Number(e.target.value))}
              >
                {plan.days.map((day, idx) => (
                  <option key={`${day.date}_${idx}`} value={idx}>
                    Day {day.day} ({day.date}) - {day.words.length} 字
                  </option>
                ))}
              </select>
            </label>

            {currentPlanDay ? (
              <div className="stack-sm">
                <p><strong>Day {currentPlanDay.day}</strong>｜{currentPlanDay.date}｜{currentPlanDay.words.length} 字</p>
                {currentPlanDay.words.length === 0 ? (
                  <p className="muted">這天不需新增單字，可用於複習。</p>
                ) : (
                  <ul className="list stack-sm">
                    {currentPlanDay.words.map((word) => (
                      <li key={`plan_${word.id}`} className="list-row">
                        <span>{word.word}</span>
                        <span>{word.translation || "（待補）"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card>
        <div className="row wrap">
          <InputField
            label="搜尋"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="輸入單字、中文或定義"
            className="grow-input"
          />

          <label className="field-wrap">
            <span className="field-label">篩選</span>
            <select className="field-input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="all">全部</option>
              <option value="tsl">TSL</option>
              <option value="ngsl">NGSL</option>
              <option value="bookmark">僅收藏</option>
            </select>
          </label>
        </div>

        <div className="row wrap">
          <Link className="link-btn" to="/review">去單字複習</Link>
          <Link className="link-btn ghost-link" to="/vocab-game">玩單字遊戲</Link>
          <p className="muted">結果：{filtered.length} 筆</p>
        </div>
      </Card>

      {speechMessage && <Banner>{speechMessage}</Banner>}

      <div className="stack-sm">
        {pageData.map((word) => {
          const isBookmarked = bookmarkIds.has(word.id);
          return (
            <Card key={word.id} className="vocab-card">
              <div className="row between">
                <div>
                  <h3>{word.word}</h3>
                  <p className="muted">{word.partOfSpeech || "-"} · {(word.source || []).join("/") || "-"}</p>
                </div>
                <button type="button" className={`star-btn ${isBookmarked ? "active" : ""}`} onClick={() => toggleBookmark(word)}>
                  {isBookmarked ? "★" : "☆"}
                </button>
              </div>

              <p><strong>中譯：</strong>{word.translation || "（待補）"}</p>
              {word.phonetic ? <p className="muted">音標：{word.phonetic}</p> : null}
              {word.definition ? <p className="muted">{word.definition}</p> : null}
              {word.example ? <p className="muted">例句：{word.example}</p> : null}

              <div className="row wrap">
                <Button variant="ghost" onClick={() => speakWord(word)}>🔊 發音</Button>
                <Button variant="secondary" onClick={() => markMastered(word)}>熟練 +1</Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div className="row between">
          <Button variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>上一頁</Button>
          <span>第 {page} / {totalPages} 頁</span>
          <Button variant="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>下一頁</Button>
        </div>
      </Card>
    </div>
  );
}
