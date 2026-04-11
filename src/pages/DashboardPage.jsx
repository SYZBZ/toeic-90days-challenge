import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchRecentHistory, fetchSummary } from "../lib/firestoreService";

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
        fetchRecentHistory(user.uid, 12),
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
    const days = new Map();
    for (const item of recent) {
      const date = item.createdAt?.toDate ? item.createdAt.toDate().toISOString().slice(0, 10) : "unknown";
      days.set(date, (days.get(date) || 0) + 1);
    }
    return Array.from(days.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
  }, [recent]);

  if (loading) {
    return <div className="card">載入儀表板中…</div>;
  }

  return (
    <div className="stack">
      <section className="grid two">
        <div className="card stat">
          <h3>總刷題數</h3>
          <p className="value">{summary?.totalAnswered || 0}</p>
        </div>
        <div className="card stat">
          <h3>正確率</h3>
          <p className="value">{accuracy(summary?.totalAnswered || 0, summary?.totalCorrect || 0)}</p>
        </div>
        <div className="card stat">
          <h3>連續天數</h3>
          <p className="value">{summary?.streakDays || 0}</p>
        </div>
        <div className="card stat">
          <h3>今日進度</h3>
          <p className="value">{summary?.dayProgress || 0}</p>
        </div>
      </section>

      <section className="card">
        <h3>近 7 天刷題趨勢</h3>
        <div className="mini-chart">
          {trend.length === 0 && <p className="muted">尚無資料</p>}
          {trend.map(([d, c]) => (
            <div key={d} className="bar-row">
              <span>{d.slice(5)}</span>
              <div className="bar"><div className="fill" style={{ width: `${Math.min(100, c * 12)}%` }} /></div>
              <strong>{c}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>最近作答</h3>
        {recent.length === 0 ? <p className="muted">先去刷一題吧！</p> : (
          <ul className="list">
            {recent.slice(0, 8).map((item) => (
              <li key={item.id}>
                <span>{item.meta?.part || "part5"}</span>
                <span>{item.correct ? "✅ 正確" : "❌ 錯誤"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
