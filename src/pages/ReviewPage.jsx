import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchMistakes } from "../lib/firestoreService";
import { Card } from "../ui/Card";

export default function ReviewPage() {
  const { user } = useAuth();
  const [mistakes, setMistakes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.uid) return;
      setLoading(true);
      const list = await fetchMistakes(user.uid, 100);
      if (!active) return;
      setMistakes(list);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  if (loading) return <Card>載入錯題中...</Card>;

  return (
    <div className="stack-lg">
      <section className="hero-panel compact">
        <p className="eyebrow">ERROR LOG</p>
        <h2>錯題本</h2>
        <p className="muted">這裡會保留你還沒修正的題目，方便重複複習。</p>
        <div className="mascot-tip compact">
          <span className="mascot-avatar" aria-hidden="true">🧩</span>
          <p>先解掉高頻錯題，再回去刷新題，分數會更穩。</p>
        </div>
      </section>

      <Card>
        {mistakes.length === 0 ? (
          <p className="muted">目前沒有錯題，太棒了。</p>
        ) : (
          <ul className="list stack-sm">
            {mistakes.map((m) => (
              <li key={m.id} className="list-item review-item">
                <p className="question">{m.question}</p>
                <p className="muted">你的答案：{m.yourAnswer ?? "-"} ｜ 正解：{m.correctAnswer ?? "-"}</p>
                {m.explanation ? <p className="muted">解析：{m.explanation}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
