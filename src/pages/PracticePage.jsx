import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { analyzeAnswer, generateQuestion } from "../lib/geminiService";
import { removeMistake, saveHistory, updateSummary, upsertMistake } from "../lib/firestoreService";

const STATUS = {
  IDLE: "idle",
  GENERATING: "generating",
  QUESTION: "questionReady",
  ANALYZING: "analyzing",
  RESULT: "resultReady",
};

export default function PracticePage() {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState(STATUS.IDLE);
  const [topic, setTopic] = useState("business email");
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [retryHint, setRetryHint] = useState("");

  useEffect(() => {
    if (retryHint) {
      const timer = setTimeout(() => setRetryHint(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [retryHint]);

  const onRetry = ({ waitMs, attempt }) => {
    const sec = (waitMs / 1000).toFixed(1);
    setRetryHint(`伺服器忙碌中，第 ${attempt} 次重試：預計 ${sec} 秒後自動重試...`);
  };

  const startQuestion = async () => {
    setError("");
    setAnalysis(null);
    setSelected(null);
    setRetryHint("");
    setStatus(STATUS.GENERATING);
    try {
      const q = await generateQuestion(
        { part: profile?.settings?.part || "Part 5", topic, level: "850+" },
        profile?.geminiApiKey,
        onRetry,
      );
      setQuestion(q);
      setStatus(STATUS.QUESTION);
    } catch (err) {
      setError(err.message || "出題失敗");
      setStatus(STATUS.IDLE);
    }
  };

  const submitAnswer = async () => {
    if (selected == null || !question) return;
    setError("");
    setRetryHint("");
    setStatus(STATUS.ANALYZING);
    try {
      const a = await analyzeAnswer({
        question: question.question,
        options: question.options,
        userAnswer: selected,
      }, profile?.geminiApiKey, onRetry);

      setAnalysis(a);
      setStatus(STATUS.RESULT);

      const isCorrect = selected === a.correctAnswerIndex;
      await saveHistory(user.uid, {
        question: question.question,
        options: question.options,
        userAnswer: selected,
        correctAnswer: a.correctAnswerIndex,
        correct: isCorrect,
        explanation: a.correctReasonZh,
        trapExplanation: a.trapExplanationZh,
        translationZh: a.translationZh,
        meta: question.meta,
      });

      const mistakeId = `${question.question.slice(0, 30)}-${a.correctAnswerIndex}`;
      if (!isCorrect) {
        await upsertMistake(user.uid, {
          id: mistakeId,
          question: question.question,
          options: question.options,
          yourAnswer: selected,
          correctAnswer: a.correctAnswerIndex,
          explanation: a.correctReasonZh,
          trapExplanation: a.trapExplanationZh,
        });
      } else {
        await removeMistake(user.uid, mistakeId);
      }

      await updateSummary(user.uid, {
        answered: 1,
        correct: isCorrect ? 1 : 0,
        practiceDate: new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      setError(err.message || "解析失敗");
      setStatus(STATUS.QUESTION);
    }
  };

  if (!profile?.geminiApiKey) {
    return (
      <div className="card">
        <h3>尚未設定 GEMINI_API_KEY</h3>
        <p className="muted">請先到設定頁輸入 API Key，才能開始刷題。</p>
        <Link className="btn primary" to="/settings">前往設定</Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h3>刷題練習（Part 5）</h3>
        <label>主題（可選）</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="business email / HR / finance" />

        {status === STATUS.IDLE && <button className="btn primary" onClick={startQuestion}>產生題目</button>}
        {status === STATUS.GENERATING && <p className="muted">題目生成中...</p>}
        {retryHint && <p className="alert">{retryHint}</p>}
        {error && <p className="alert danger">{error}</p>}
      </section>

      {(status === STATUS.QUESTION || status === STATUS.ANALYZING || status === STATUS.RESULT) && question && (
        <section className="card">
          <p className="question">{question.question}</p>
          <div className="options">
            {question.options.map((opt, idx) => (
              <button
                key={idx}
                className={`option-btn ${selected === idx ? "selected" : ""} ${status === STATUS.RESULT && analysis?.correctAnswerIndex === idx ? "correct" : ""}`}
                disabled={status === STATUS.ANALYZING || status === STATUS.RESULT}
                onClick={() => setSelected(idx)}
              >
                {String.fromCharCode(65 + idx)}. {opt}
              </button>
            ))}
          </div>

          {status === STATUS.QUESTION && (
            <button className="btn primary" onClick={submitAnswer} disabled={selected == null}>送出作答</button>
          )}
          {status === STATUS.ANALYZING && <p className="muted">解析中...</p>}
        </section>
      )}

      {status === STATUS.RESULT && analysis && (
        <section className="card">
          <h3>完整解析</h3>
          <p><strong>正解：</strong>{String.fromCharCode(65 + analysis.correctAnswerIndex)}</p>
          <p><strong>翻譯：</strong>{analysis.translationZh}</p>
          <p><strong>為何容易錯：</strong>{analysis.trapExplanationZh}</p>
          <p><strong>正解理由：</strong>{analysis.correctReasonZh}</p>
          {analysis.optionReviewZh.length > 0 && (
            <ul className="list">
              {analysis.optionReviewZh.map((item, idx) => <li key={idx}>{String.fromCharCode(65 + idx)}. {item}</li>)}
            </ul>
          )}
          <button className="btn primary" onClick={startQuestion}>下一題</button>
        </section>
      )}
    </div>
  );
}
