import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadVocabulary } from "../lib/localData";
import { buildVocabPlan, findTodayPlanIndex } from "../lib/vocabPlan";
import { Banner } from "../ui/Banner";
import { Card } from "../ui/Card";

export default function DailyVocabPage() {
  const { profile } = useAuth();
  const [allWords, setAllWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dayIndex, setDayIndex] = useState(0);

  const startDate = profile?.settings?.vocabPlan?.startDate || "";
  const examDate = profile?.settings?.vocabPlan?.examDate || "";

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const words = await loadVocabulary();
      if (!active) return;
      setAllWords(words);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const plan = useMemo(() => buildVocabPlan(allWords, startDate, examDate), [allWords, startDate, examDate]);

  useEffect(() => {
    setDayIndex(findTodayPlanIndex(plan.days));
  }, [startDate, examDate, plan.days.length]);

  const currentDay = plan.days?.[dayIndex] || null;

  if (loading) return <Card>載入每日單字中...</Card>;

  return (
    <div className="stack-lg">
      <section className="hero-panel compact">
        <p className="eyebrow">DAILY VOCAB</p>
        <h2>每日單字</h2>
        <p className="muted">依照你的備考日期自動切分每天該背的單字。</p>
      </section>

      {!startDate || !examDate ? (
        <Card>
          <Banner tone="danger">尚未設定備考日期。請先到設定頁完成「備考日程規劃」。</Banner>
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
            <p className="muted">起訖：{startDate} ~ {examDate}</p>
            <p className="muted">共 {plan.totalWords} 字，{plan.totalDays} 天，平均每日約 {plan.avg} 字。</p>

            <label className="field-wrap">
              <span className="field-label">選擇日程</span>
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

          <Card>
            {currentDay ? (
              <div className="stack-sm">
                <h3>Day {currentDay.day} · {currentDay.date}</h3>
                {currentDay.words.length === 0 ? (
                  <p className="muted">今天沒有新增單字，建議做複習。</p>
                ) : (
                  <ul className="list stack-sm">
                    {currentDay.words.map((word) => (
                      <li key={`daily_${word.id}`} className="list-row">
                        <span>{word.word}</span>
                        <span>{word.translation || "（待補）"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="muted">無可用日程資料。</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
