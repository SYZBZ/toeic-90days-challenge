import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { analyzeAnswer, generateQuestion } from "../lib/geminiService";
import { removeMistake, saveHistory, updateSummary, upsertMistake } from "../lib/firestoreService";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InputField } from "../ui/InputField";

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

  const onRetry = ({ waitMs, attempt }) => {
    const sec = (waitMs / 1000).toFixed(1);
    setRetryHint(`Server busy, retry #${attempt} in ${sec}s ...`);
  };

  const startQuestion = async () => {
    setError("");
    setAnalysis(null);
    setSelected(null);
    setRetryHint("");
    setStatus(STATUS.GENERATING);

    try {
      const q = await generateQuestion(
        { part: profile?.settings?.part || "Part 5", topic, level: profile?.settings?.level || "850+" },
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
      const a = await analyzeAnswer(
        {
          question: question.question,
          options: question.options,
          userAnswer: selected,
        },
        profile?.geminiApiKey,
        onRetry,
      );

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
      <Card>
        <h3>尚未設定 GEMINI_API_KEY</h3>
        <p className="muted">請先到設定頁輸入 API Key，才能開始刷題。</p>
        <Link className="link-btn" to="/settings">前往設定</Link>
      </Card>
    );
  }

  return (
    <div className="stack-lg">
      <section className="test-shell">
        <Card className="test-left">
          <div className="row between">
            <h3>Reading Prompt</h3>
            <span className="progress-pill">Part 5</span>
          </div>

          <InputField
            label="Topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="business email / HR / finance"
          />

          {status === STATUS.IDLE && <Button onClick={startQuestion}>Generate Question</Button>}
          {status === STATUS.GENERATING && <p className="muted">Generating...</p>}
          {retryHint && <Banner>{retryHint}</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}

          <img
            alt="Mascot"
            className="test-mascot"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAYjwVmYUMsgceNjWV7GjUUvis4aGku5mFTuA3DZCf7d3f97W1-vHKHNE9IyIj1rsQg26gFX7rs3dLua92O8ddNDh73myYYZlA6eTfowAxo7LZZwPZHil4Kpjg9TULq7wUbRs3t7AChvbs7-xf0qP2XQnD6qOV3a-ei8q7URN4Mk97roGsnbH875QCOce2uHLz0Zjgvn1Y-gmN53WswzyVzG9dKZIKV9o6x0oBVEfA4FC9qjxMjojzAlokqrxlCQbUhn8lrvBxmTTc"
          />
        </Card>

        {(status === STATUS.QUESTION || status === STATUS.ANALYZING || status === STATUS.RESULT) && question && (
          <Card className="test-right">
            <span className="question-badge">QUESTION</span>
            <p className="question">{question.question}</p>

            <div className="options">
              {question.options.map((opt, idx) => (
                <button
                  key={idx}
                  className={`option-btn ${selected === idx ? "selected" : ""} ${
                    status === STATUS.RESULT && analysis?.correctAnswerIndex === idx ? "correct" : ""
                  }`}
                  disabled={status === STATUS.ANALYZING || status === STATUS.RESULT}
                  onClick={() => setSelected(idx)}
                >
                  <span className="option-key">{String.fromCharCode(65 + idx)}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>

            {status === STATUS.QUESTION && (
              <Button onClick={submitAnswer} disabled={selected == null}>Submit</Button>
            )}
            {status === STATUS.ANALYZING && <p className="muted">Analyzing...</p>}
          </Card>
        )}
      </section>

      {status === STATUS.RESULT && analysis && (
        <Card>
          <h3>解析結果</h3>
          <p><strong>正解：</strong>{String.fromCharCode(65 + analysis.correctAnswerIndex)}</p>
          <p><strong>翻譯：</strong>{analysis.translationZh}</p>
          <p><strong>陷阱：</strong>{analysis.trapExplanationZh}</p>
          <p><strong>理由：</strong>{analysis.correctReasonZh}</p>
          <Button onClick={startQuestion}>下一題</Button>
        </Card>
      )}
    </div>
  );
}
