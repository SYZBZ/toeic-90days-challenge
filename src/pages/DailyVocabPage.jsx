import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import VocabWordCard from "../components/VocabWordCard";
import { useAuth } from "../context/AuthContext";
import { fetchBookmarkIds, removeBookmark, reviewSrsWord, setBookmark } from "../lib/firestoreService";
import { loadVocabulary } from "../lib/localData";
import { speakEnglishWord } from "../lib/speech";
import { buildVocabPlan, findTodayPlanIndex } from "../lib/vocabPlan";
import { Banner } from "../ui/Banner";
import { Card } from "../ui/Card";

export default function DailyVocabPage() {
  const { user, profile } = useAuth();
  const [allWords, setAllWords] = useState([]);
  const [bookmarkIds, setBookmarkIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [dayIndex, setDayIndex] = useState(0);
  const [speechMessage, setSpeechMessage] = useState("");

  const startDate = profile?.settings?.vocabPlan?.startDate || "";
  const examDate = profile?.settings?.vocabPlan?.examDate || "";

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

  const plan = useMemo(() => buildVocabPlan(allWords, startDate, examDate), [allWords, startDate, examDate]);

  useEffect(() => {
    setDayIndex(findTodayPlanIndex(plan.days));
  }, [startDate, examDate, plan.days.length]);

  const currentDay = plan.days?.[dayIndex] || null;

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

  if (loading) return <Card>載入每日單字中...</Card>;

  return (
    <div className="stack-lg">
      <section className="hero-panel compact">
        <p className="eyebrow">DAILY VOCAB</p>
        <h2>每日單字</h2>
        <p className="muted">依你的備考時程自動分配，每日清單與單字庫卡片樣式一致。</p>
      </section>

      {!startDate || !examDate ? (
        <Card>
          <Banner tone="danger">請先到設定頁填寫備考開始日期與考試日期，才能產生每日單字清單。</Banner>
          <Link className="link-btn" to="/settings">前往設定</Link>
        </Card>
      ) : plan.error ? (
        <Card>
          <Banner tone="danger">{plan.error}</Banner>
          <Link className="link-btn" to="/settings">調整日期</Link>
        </Card>
      ) : (
        <>
          <Card>
            <p className="muted">區間：{startDate} ~ {examDate}</p>
            <p className="muted">共 {plan.totalWords} 字，{plan.totalDays} 天，平均每日約 {plan.avg} 字。</p>

            <label className="field-wrap">
              <span className="field-label">切換學習日</span>
              <select
                className="field-input"
                value={dayIndex}
                onChange={(e) => setDayIndex(Number(e.target.value))}
              >
                {plan.days.map((day, idx) => (
                  <option key={`${day.date}_${idx}`} value={idx}>
                    Day {day.day} ({day.date}) - {day.words.length} 字
                  </option>
                ))}
              </select>
            </label>
          </Card>

          {speechMessage && <Banner>{speechMessage}</Banner>}

          <Card>
            {currentDay ? (
              <div className="stack-sm">
                <h3>Day {currentDay.day} · {currentDay.date}</h3>
                <p className="muted">今日共 {currentDay.words.length} 字</p>
              </div>
            ) : (
              <p className="muted">查無當日單字。</p>
            )}
          </Card>

          <div className="stack-sm">
            {(currentDay?.words || []).map((word) => (
              <VocabWordCard
                key={`daily_${word.id}`}
                word={word}
                isBookmarked={bookmarkIds.has(word.id)}
                onToggleBookmark={toggleBookmark}
                onSpeak={speakWord}
                onMarkMastered={markMastered}
              />
            ))}
          </div>

          {currentDay && currentDay.words.length === 0 ? (
            <Card>
              <p className="muted">這天沒有分配到單字，你可以到設定頁調整備考日期區間。</p>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
