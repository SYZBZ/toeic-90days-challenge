import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchBookmarks, fetchSrsDue, reviewSrsWord } from "../lib/firestoreService";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";

export default function ReviewPage() {
  const { user } = useAuth();
  const [due, setDue] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.uid) return;
      setLoading(true);
      const [dueItems, bookmarkItems] = await Promise.all([
        fetchSrsDue(user.uid, 80),
        fetchBookmarks(user.uid, 120),
      ]);
      if (!active) return;
      setDue(dueItems);
      setBookmarks(bookmarkItems);
      setIndex(0);
      setShowAnswer(false);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const list = useMemo(() => (due.length ? due : bookmarks), [due, bookmarks]);
  const current = list[index] || null;

  async function review(grade) {
    if (!current || !user?.uid) return;
    await reviewSrsWord(user.uid, {
      id: current.wordId || current.id,
      word: current.word,
      translation: current.translation,
      source: current.source || [],
    }, grade);

    setShowAnswer(false);
    setIndex((i) => (i + 1 >= list.length ? 0 : i + 1));
  }

  if (loading) return <Card>載入單字複習中...</Card>;

  return (
    <div className="stack-lg">
      <section className="hero-panel compact">
        <p className="eyebrow">SRS REVIEW</p>
        <h2>單字複習</h2>
        <p className="muted">優先顯示到期單字，沒有到期時會用收藏清單補位。</p>
      </section>

      {!current ? (
        <Card>
          <p className="muted">目前沒有可複習的單字，先去單字庫收藏一些單字吧。</p>
          <Link className="link-btn" to="/vocabulary">前往單字庫</Link>
        </Card>
      ) : (
        <Card className="review-flashcard">
          <p className="eyebrow">{index + 1} / {list.length}</p>
          <h2>{current.word}</h2>
          <p className="muted">{(current.source || []).join("/") || "GENERAL"}</p>

          {showAnswer ? (
            <>
              <p className="flash-translation">{current.translation || "（尚無中譯）"}</p>
              <div className="row wrap">
                <Button variant="danger" onClick={() => review(0)}>Again</Button>
                <Button variant="secondary" onClick={() => review(1)}>Good</Button>
                <Button onClick={() => review(2)}>Easy</Button>
              </div>
            </>
          ) : (
            <Button onClick={() => setShowAnswer(true)}>顯示答案</Button>
          )}
        </Card>
      )}
    </div>
  );
}
