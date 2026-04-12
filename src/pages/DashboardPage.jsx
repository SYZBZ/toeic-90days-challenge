import { useEffect, useMemo, useState } from "react";
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
    return <Card>載入儀表板中...</Card>;
  }

  return (
    <div className="stack-lg ethereal-layout">
      <section className="ethereal-hero">
        <div className="ethereal-hero-copy">
          <h2>Welcome back, Scholar!</h2>
          <p>Your streak is still alive. Keep your rhythm and push to 875+ this week.</p>
          <button className="hero-cta" type="button">Start Studying</button>
        </div>
        <img
          alt="Mascot"
          className="ethereal-hero-mascot"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBdL58anVGvd6mb4JwWPHdoqRx66ZD5MyFF4er2iVP66JGAkixq_0-0WakseS1WldBRyJB53pC-BJkeqUq3w-tImzDP6KmPdkpf0PKtVpr84cvzIOA8pecxJlLC79ebJ7UnXi-MCHGHGvqE9hRE9MfEH--Fb0_TNeKCCsWmw-jiwqK1fWwg85v0pjjaTebOHSw5tfR6m-wdpXWHtAk_klWcSCyaAImN8u2nVuSV-9Ctyp1B-6GuUayVoIKMIhtiehesTXF0zuZ822I"
        />
      </section>

      <section className="ethereal-stats-grid">
        <article className="ethereal-stat">
          <p className="label">Words Mastered</p>
          <p className="value">{summary?.totalAnswered || 0}</p>
        </article>
        <article className="ethereal-stat">
          <p className="label">Accuracy</p>
          <p className="value">{accuracy(summary?.totalAnswered || 0, summary?.totalCorrect || 0)}</p>
        </article>
        <article className="ethereal-stat">
          <p className="label">Streak</p>
          <p className="value">{summary?.streakDays || 0}</p>
        </article>
        <article className="ethereal-stat">
          <p className="label">Today</p>
          <p className="value">{summary?.dayProgress || 0}</p>
        </article>
      </section>

      <div className="ethereal-bento-grid">
        <Card className="ethereal-main-card">
          <div className="row between">
            <div>
              <h3>TOEIC Progress</h3>
              <p className="muted">Live synced from your attempts</p>
            </div>
            <strong className="progress-pill">{accuracy(summary?.totalAnswered || 0, summary?.totalCorrect || 0)}</strong>
          </div>

          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, (summary?.dayProgress || 0) * 10)}%` }} />
          </div>

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
        </Card>

        <Card className="ethereal-side-card">
          <h3>Recent Attempts</h3>
          {recent.length === 0 ? (
            <p className="muted">先去刷一題吧。</p>
          ) : (
            <ul className="list stack-sm">
              {recent.slice(0, 6).map((item) => (
                <li key={item.id} className="list-row">
                  <span>{item.meta?.part || "Part 5"}</span>
                  <span>{item.correct ? "Correct" : "Wrong"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
