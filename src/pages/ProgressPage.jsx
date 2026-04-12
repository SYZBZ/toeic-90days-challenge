import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Banner } from "../ui/Banner";
import { fetchRecentHistory, fetchSrsItems, fetchSummary } from "../lib/firestoreService";
import { Card } from "../ui/Card";

export default function ProgressPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [srsItems, setSrsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.uid) return;
      setLoading(true);
      setError("");
      try {
        const [s, r, srs] = await Promise.all([
          fetchSummary(user.uid),
          fetchRecentHistory(user.uid, 40),
          fetchSrsItems(user.uid, 3000),
        ]);
        if (!active) return;
        setSummary(s || null);
        setRecent(r || []);
        setSrsItems(srs || []);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "進度頁載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const mastered = useMemo(() => srsItems.filter((x) => x.mastered || (x.correctCount || 0) >= 3).length, [srsItems]);
  const progress90 = Math.min(100, Math.round(((summary?.dayX || 1) / 90) * 100));

  if (loading) return <Card>載入進度中...</Card>;

  return (
    <div className="stack-lg">
      {error && <Banner tone="danger">{error}</Banner>}

      <section className="hero-panel compact">
        <p className="eyebrow">PROGRESS</p>
        <h2>學習進度頁</h2>
        <p className="muted">Day X/90、連續學習天數、SRS 已熟練數獨立呈現。</p>
      </section>

      <section className="ethereal-stats-grid">
        <article className="ethereal-stat">
          <p className="label">Day</p>
          <p className="value">{summary?.dayX || 1}<span className="tiny">/90</span></p>
        </article>
        <article className="ethereal-stat">
          <p className="label">連續天數</p>
          <p className="value">{summary?.streakDays || 0}</p>
        </article>
        <article className="ethereal-stat">
          <p className="label">SRS 已熟練</p>
          <p className="value">{mastered}</p>
        </article>
        <article className="ethereal-stat">
          <p className="label">總作答</p>
          <p className="value">{summary?.totalAnswered || 0}</p>
        </article>
      </section>

      <Card>
        <h3>90 天進度</h3>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress90}%` }} />
        </div>
        <p className="muted">目前完成 {progress90}%</p>
      </Card>

      <Card>
        <h3>最近練習紀錄</h3>
        {recent.length === 0 ? (
          <p className="muted">尚無資料</p>
        ) : (
          <ul className="list stack-sm">
            {recent.slice(0, 12).map((r) => (
              <li key={r.id} className="list-row">
                <span>{r.mode || "practice"}</span>
                <span>{r.score != null ? `${r.score}/${r.total}` : "-"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
