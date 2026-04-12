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
  const [status, setStatus] = useState("idle");
  const [totalRounds, setTotalRounds] = useState(10);
  const [currentRound, setCurrentRound] = useState(0);
  const [question, setQuestion] = useState(null);
  const [options, setOptions] = useState([]);
  const [answerInput, setAnswerInput] = useState("");
  const [remain, setRemain] = useState(5);
  const [score, setScore] = useState(0);
  const [isResolving, setIsResolving] = useState(false);
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

  function buildRound(roundNumber) {
    if (!canPlay) return;
    const [target, ...rest] = pickRandom(pool, 4);
    setQuestion(target);
    setOptions(pickRandom([target, ...rest], 4));
    setAnswerInput("");
    setRemain(5);
    setCurrentRound(roundNumber);
    setFeedback("");
    setIsResolving(false);
  }

  function endGame() {
    setStatus("finished");
    setQuestion(null);
    setOptions([]);
    setRemain(0);
    setIsResolving(false);
  }

  function resetGame() {
    setStatus("idle");
    setQuestion(null);
    setOptions([]);
    setAnswerInput("");
    setFeedback("");
    setRemain(5);
    setCurrentRound(0);
    setScore(0);
    setIsResolving(false);
  }

  function startGame() {
    if (!canPlay) return;
    setScore(0);
    setStatus("playing");
    buildRound(1);
  }

  function skipRound() {
    if (status !== "playing" || isResolving) return;
    if (currentRound >= totalRounds) {
      endGame();
      return;
    }
    buildRound(currentRound + 1);
  }

  useEffect(() => {
    resetGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, totalRounds]);

  useEffect(() => {
    if (!canPlay && status === "playing") {
      endGame();
    }
  }, [canPlay, status]);

  async function markResult(isCorrect) {
    if (!question || !user?.uid) return;
    try {
      await reviewSrsWord(user.uid, question, isCorrect ? 2 : 0);
      if (isCorrect) setScore((s) => s + 1);
    } catch (err) {
      setError(err?.message || "寫入遊戲結果失敗");
    }
  }

  async function resolveRound(isCorrect, message) {
    if (!question || status !== "playing" || isResolving) return;
    setIsResolving(true);
    await markResult(isCorrect);
    setFeedback(message);

    const isLast = currentRound >= totalRounds;
    setTimeout(() => {
      if (isLast) {
        endGame();
      } else {
        buildRound(currentRound + 1);
      }
    }, 700);
  }

  useEffect(() => {
    if (!question || status !== "playing") return () => {};
    if (remain <= 0 && !isResolving) {
      resolveRound(false, `時間到，正解是 ${question.word}`);
      return () => {};
    }

    const timer = setTimeout(() => setRemain((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remain, question, status, isResolving, currentRound, totalRounds]);

  async function choose(option) {
    if (!question || isResolving || status !== "playing") return;
    const ok = option.id === question.id;
    await resolveRound(ok, ok ? "答對！" : `答錯，正解是 ${question.word}`);
  }

  async function submitSpelling() {
    if (!question || isResolving || status !== "playing") return;
    const normalized = answerInput.trim().toLowerCase();
    const ok = Boolean(normalized) && normalized === String(question.word || "").toLowerCase();
    await resolveRound(ok, ok ? "拼字正確！" : `正解：${question.word}`);
  }

  return (
    <div className="stack-lg">
      {error && <Banner tone="danger">{error}</Banner>}

      <section className="hero-panel compact">
        <p className="eyebrow">VOCAB GAME</p>
        <h2>單字背誦小遊戲</h2>
        <p className="muted">每題 5 秒，可選 10 題或 20 題，回合結束後會自動停止。</p>
      </section>

      <Card>
        <div className="row wrap">
          <button
            type="button"
            className={`choice-chip ${mode === "match" ? "active" : ""}`}
            onClick={() => setMode("match")}
            disabled={status === "playing"}
          >
            中英配對
          </button>
          <button
            type="button"
            className={`choice-chip ${mode === "spelling" ? "active" : ""}`}
            onClick={() => setMode("spelling")}
            disabled={status === "playing"}
          >
            聽音拼字
          </button>

          <label className="field-wrap">
            <span className="field-label">回合數</span>
            <select
              className="field-input"
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value))}
              disabled={status === "playing"}
            >
              <option value={10}>10 題</option>
              <option value={20}>20 題</option>
            </select>
          </label>

          {status !== "playing" ? (
            <Button onClick={startGame} disabled={!canPlay}>開始遊戲</Button>
          ) : (
            <Button variant="ghost" onClick={skipRound} disabled={isResolving}>跳過此題</Button>
          )}

          <p className="muted">Score: {score} ｜ Round: {currentRound}/{totalRounds}</p>
        </div>

        {loading && <p className="muted">載入收藏單字中...</p>}
        {!loading && !canPlay && <p className="muted">至少要先收藏 4 個單字才能玩遊戲。</p>}
      </Card>

      {status === "finished" && (
        <Card className="game-card">
          <h3>本輪完成</h3>
          <p className="muted">你答對 {score} / {totalRounds} 題</p>
          <div className="row wrap" style={{ justifyContent: "center" }}>
            <Button onClick={startGame} disabled={!canPlay}>再玩一輪</Button>
            <Button variant="ghost" onClick={resetGame}>重設</Button>
          </div>
        </Card>
      )}

      {status === "playing" && question && (
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
                  <button
                    key={opt.id}
                    type="button"
                    className="option-btn"
                    onClick={() => choose(opt)}
                    disabled={isResolving}
                  >
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
                <input
                  className="field-input"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  placeholder="輸入英文"
                  disabled={isResolving}
                />
                <Button onClick={submitSpelling} disabled={isResolving}>提交</Button>
              </div>
            </>
          )}

          {feedback && <p className="muted">{feedback}</p>}
        </Card>
      )}
    </div>
  );
}
