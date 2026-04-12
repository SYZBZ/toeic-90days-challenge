import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchBookmarks, reviewSrsWord } from "../lib/firestoreService";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Banner } from "../ui/Banner";

function pickRandom(list, n) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

export default function VocabGamePage() {
  const { user } = useAuth();
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("match");
  const [question, setQuestion] = useState(null);
  const [options, setOptions] = useState([]);
  const [answerInput, setAnswerInput] = useState("");
  const [remain, setRemain] = useState(5);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user?.uid) {
        if (active) setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const words = await fetchBookmarks(user.uid, 300);
        if (!active) return;
        setPool((words || []).map((w) => ({
          id: w.wordId || w.id,
          word: w.word,
          translation: w.translation,
          source: w.source || [],
        })));
      } catch (err) {
        if (!active) return;
        setPool([]);
        setError(err?.message || "單字遊戲載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const canPlay = pool.length >= 4;

  function nextRound() {
    if (!canPlay) return;

    const [target, ...rest] = pickRandom(pool, 4);
    setQuestion(target);
    setOptions(pickRandom([target, ...rest], 4));
    setAnswerInput("");
    setRemain(5);
    setRound((r) => r + 1);
    setFeedback("");
  }

  useEffect(() => {
    if (!question) return () => {};
    if (remain <= 0) {
      setFeedback("時間到，下題！");
      const timeout = setTimeout(() => nextRound(), 700);
      return () => clearTimeout(timeout);
    }

    const timer = setTimeout(() => setRemain((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remain, question]);

  async function markResult(isCorrect) {
    if (!question || !user?.uid) return;
    try {
      await reviewSrsWord(user.uid, question, isCorrect ? 2 : 0);
      if (isCorrect) setScore((s) => s + 1);
    } catch (err) {
      setError(err?.message || "寫入遊戲結果失敗");
    }
  }

  async function choose(option) {
    if (!question) return;
    const ok = option.id === question.id;
    await markResult(ok);
    setFeedback(ok ? "答對！" : `答錯，正解是 ${question.word}`);
    setTimeout(() => nextRound(), 700);
  }

  async function submitSpelling() {
    if (!question) return;
    const normalized = answerInput.trim().toLowerCase();
    const ok = normalized && normalized === String(question.word || "").toLowerCase();
    await markResult(ok);
    setFeedback(ok ? "拼字正確！" : `正解：${question.word}`);
    setTimeout(() => nextRound(), 700);
  }

  return (
    <div className="stack-lg">
      {error && <Banner tone="danger">{error}</Banner>}

      <section className="hero-panel compact">
        <p className="eyebrow">VOCAB GAME</p>
        <h2>單字背誦小遊戲</h2>
        <p className="muted">每題 5 秒，結果會寫回 SRS。</p>
      </section>

      <Card>
        <div className="row wrap">
          <button type="button" className={`choice-chip ${mode === "match" ? "active" : ""}`} onClick={() => setMode("match")}>中英配對</button>
          <button type="button" className={`choice-chip ${mode === "spelling" ? "active" : ""}`} onClick={() => setMode("spelling")}>聽音拼字</button>
          <Button onClick={nextRound} disabled={!canPlay}>開始 / 下一題</Button>
          <p className="muted">Score: {score} ｜ Round: {round}</p>
        </div>
        {loading && <p className="muted">載入收藏單字中...</p>}
        {!loading && !canPlay && <p className="muted">至少要先收藏 4 個單字才能玩遊戲。</p>}
      </Card>

      {question && (
        <Card className="game-card">
          <div className="row between">
            <p className="eyebrow">剩餘 {remain} 秒</p>
            <span className={`timer-pill ${remain <= 2 ? "danger" : ""}`}>{remain}s</span>
          </div>

          {mode === "match" ? (
            <>
              <h3>{question.translation || "（無中譯）"}</h3>
              <div className="options">
                {options.map((opt) => (
                  <button key={opt.id} type="button" className="option-btn" onClick={() => choose(opt)}>
                    <span>{opt.word}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3>{question.translation || "（無中譯）"}</h3>
              <p className="muted">請輸入英文拼字</p>
              <div className="row wrap">
                <input className="field-input" value={answerInput} onChange={(e) => setAnswerInput(e.target.value)} placeholder="輸入英文" />
                <Button onClick={submitSpelling}>提交</Button>
              </div>
            </>
          )}

          {feedback && <p className="muted">{feedback}</p>}
        </Card>
      )}
    </div>
  );
}
