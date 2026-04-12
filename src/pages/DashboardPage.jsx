import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchRecentHistory, fetchSummary } from "../lib/firestoreService";
import { Card } from "../ui/Card";

function accuracy(total, correct) {
  if (!total) return "0%";
  return `${Math.round((correct / total) * 100)}%`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const trend = useMemo(() => {
    const map = new Map();
    for (const item of recent) {
      const d = item.createdAt?.toDate ? item.createdAt.toDate().toISOString().slice(0, 10) : "unknown";
      map.set(d, (map.get(d) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
  }, [recent]);

  if (loading) return <Card>載入儀表板中...</Card>;

  return (
    <div className="stack-lg">
      <section className="hero-panel">
        <p className="eyebrow">TODAY MISSION</p>
        <h2>90 天第 {summary?.dayX || 1} 天</h2>
        <p className="muted">先做一回合測驗，再回來複習錯題，連續天數會更穩定。</p>
        <div className="row wrap">
          <Link className="link-btn" to="/practice">開始考試</Link>
          <Link className="link-btn ghost-link" to="/mistakes">看錯題本</Link>
        </div>
      </section>

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
