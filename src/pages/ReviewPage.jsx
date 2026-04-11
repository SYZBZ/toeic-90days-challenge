import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchMistakes } from "../lib/firestoreService";

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

  if (loading) return <div className="card">載入錯題中…</div>;

  return (
    <div className="card">
      <h3>錯題本</h3>
      {mistakes.length === 0 ? (
        <p className="muted">目前沒有錯題，太棒了！</p>
      ) : (
        <ul className="list stack-sm">
          {mistakes.map((m) => (
            <li key={m.id} className="list-item">
              <p>{m.question}</p>
              <p className="muted">你的答案：{m.yourAnswer ?? "-"} ｜ 正解：{m.correctAnswer ?? "-"}</p>
              {m.explanation && <p className="muted">解析：{m.explanation}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
