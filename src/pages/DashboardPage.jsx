import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchRecentHistory, fetchSummary, saveUserSettings } from "../lib/firestoreService";
import { getTargetLabel, normalizeTargetSettings, targetLevelFromScore } from "../lib/targetDifficulty";
import { Card } from "../ui/Card";
import { Banner } from "../ui/Banner";

function accuracy(total, correct) {
  if (!total) return "0%";
  return `${Math.round((correct / total) * 100)}%`;
}

export default function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetScore, setTargetScore] = useState(860);
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetMessage, setTargetMessage] = useState("");

  useEffect(() => {
    const target = normalizeTargetSettings(profile?.settings || {});
    setTargetScore(target.targetScore);
  }, [profile?.settings]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.uid) return;
      setLoading(true);
      const [s, r] = await Promise.all([
        fetchSummary(user.uid),
        fetchRecentHistory(user.uid, 10),
      ]);
      if (!active) return;
      setSummary(s);
      setRecent(r);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  async function onTargetScoreChange(nextScore) {
    if (!user?.uid || savingTarget) return;
    const score = Number(nextScore);
    setTargetScore(score);
    setSavingTarget(true);
    setTargetMessage("");
    try {
      await saveUserSettings(user.uid, {
        targetScore: score,
        targetLevel: targetLevelFromScore(score),
      });
      await refreshProfile(user.uid);
      setTargetMessage("目標分數已更新，後續出題將套用新難度。");
    } catch (err) {
      setTargetMessage(err?.message || "更新目標分數失敗");
    } finally {
      setSavingTarget(false);
    }
  }

  const trend = useMemo(() => {
    const map = new Map();
    for (const item of recent) {
      const d = item.createdAt?.toDate ? item.createdAt.toDate().toISOString().slice(0, 10) : "unknown";
      map.set(d, (map.get(d) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
  }, [recent]);

  const targetLabel = getTargetLabel(targetLevelFromScore(targetScore));

  if (loading) return <Card>載入儀表板中...</Card>;

  return (
    <div className="stack-lg">
      <section className="hero-panel">
        <p className="eyebrow">TODAY MISSION</p>
        <h2>90 天第 {summary?.dayX || 1} 天</h2>
        <p className="muted">先做一回合測驗，再回來複習錯題，連續天數會更穩定。</p>
        <div className="field-wrap">
          <span className="field-label">目標分數（目前：{targetLabel}）</span>
          <select
            className="field-input"
            value={targetScore}
            onChange={(e) => onTargetScoreChange(e.target.value)}
            disabled={savingTarget}
          >
            <option value={470}>綠證 470+</option>
            <option value={730}>藍證 730+</option>
            <option value={860}>金證 860+</option>
          </select>
        </div>
        <div className="row wrap">
          <Link className="link-btn" to="/practice">開始考試</Link>
          <Link className="link-btn ghost-link" to="/mistakes">看錯題本</Link>
        </div>
      </section>

      {targetMessage && (
        <Banner tone={targetMessage.includes("失敗") ? "danger" : "info"}>
          {targetMessage}
        </Banner>
      )}

      <section className="ethereal-stats-grid">
        <article className="ethereal-stat">
          <p className="label">總作答</p>
          <p className="value">{summary?.totalAnswered || 0}</p>
        </article>
        <article className="ethereal-stat">
          <p className="label">正確率</p>
          <p className="value">{accuracy(summary?.totalAnswered || 0, summary?.totalCorrect || 0)}</p>
        </article>
        <article className="ethereal-stat">
          <p className="label">連續天數</p>
          <p className="value">{summary?.streakDays || 0}</p>
        </article>
        <article className="ethereal-stat">
          <p className="label">已熟練 SRS</p>
          <p className="value">{summary?.masteredWords || 0}</p>
        </article>
      </section>

      <div className="ethereal-bento-grid">
        <Card>
          <div className="row between">
            <div>
              <h3>近 7 天練習量</h3>
              <p className="muted">每次交卷會即時寫入</p>
            </div>
            <Link to="/progress" className="link-inline">看完整進度</Link>
          </div>
          <div className="mini-chart">
            {trend.length === 0 ? <p className="muted">先做一次測驗就會有資料。</p> : trend.map(([d, c]) => (
              <div key={d} className="bar-row">
                <span>{d.slice(5)}</span>
                <div className="bar"><div className="fill" style={{ width: `${Math.min(100, c * 16)}%` }} /></div>
                <strong>{c}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3>最近紀錄</h3>
          {recent.length === 0 ? (
            <p className="muted">尚無紀錄</p>
          ) : (
            <ul className="list stack-sm">
              {recent.slice(0, 6).map((item) => (
                <li key={item.id} className="list-row">
                  <span>{item.mode || item.meta?.mode || "practice"}</span>
                  <span>{item.score != null ? `${item.score}/${item.total}` : "-"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
