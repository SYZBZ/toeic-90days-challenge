import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchMistakes } from "../lib/firestoreService";
import { Card } from "../ui/Card";

export default function MistakesPage() {
  const { user } = useAuth();
  const [mistakes, setMistakes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.uid) return;
      setLoading(true);
      const list = await fetchMistakes(user.uid, 120);
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

  const answerLabel = (value) => {
    if (value == null) return "未作答";
    if (typeof value === "string" && value.length === 1) return value;
    const num = Number(value);
    if (Number.isInteger(num) && num >= 0 && num <= 3) return String.fromCharCode(65 + num);
    return String(value);
  };

  return (
    <div className="stack-lg">
      <section className="hero-panel compact">
        <p className="eyebrow">MISTAKES</p>
        <h2>錯題本</h2>
        <p className="muted">專門顯示考試中答錯的題目，和單字複習已分開。</p>
      </section>

      <Card>
        {mistakes.length === 0 ? (
          <p className="muted">目前沒有錯題，繼續保持。</p>
        ) : (
          <div className="stack">
            {mistakes.map((m) => (
              <div key={m.id} className="review-question">
                <p>{m.question}</p>
                {m.questionZh ? <p className="inline-zh">中譯：{m.questionZh}</p> : null}
                <p className="muted">你的答案：{answerLabel(m.yourAnswer)} ｜ 正解：{answerLabel(m.correctAnswer)}</p>
                {m.explanation ? <p>解析：{m.explanation}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
