import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { upsertMistake } from "../lib/firestoreService";
import { loadGrammar } from "../lib/localData";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export default function GrammarPage() {
  const { user } = useAuth();
  const [units, setUnits] = useState([]);
  const [active, setActive] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState({});

  useEffect(() => {
    let mounted = true;
    loadGrammar().then((list) => {
      if (!mounted) return;
      setUnits(list);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const current = units.find((u) => u.id === active);

  async function chooseQuiz(quizIndex, optionIndex) {
    if (!current) return;
    const q = current.quiz?.[quizIndex];
    if (!q) return;

    setAnswers((prev) => ({ ...prev, [quizIndex]: optionIndex }));
    setSubmitted((prev) => ({ ...prev, [quizIndex]: true }));

    if (optionIndex !== q.answer && user?.uid) {
      await upsertMistake(user.uid, {
        id: `grammar_${current.id}_${quizIndex}`,
        type: "grammar",
        questionId: `${current.id}_${quizIndex}`,
        question: q.question,
        options: q.options,
        yourAnswer: optionIndex,
        correctAnswer: q.answer,
        explanation: q.explanation,
      });
    }
  }

  if (!units.length) return <Card>載入語法資料中...</Card>;

  if (!current) {
    return (
      <div className="stack-lg">
        <section className="hero-panel compact">
          <p className="eyebrow">GRAMMAR</p>
          <h2>語法教學</h2>
          <p className="muted">共 {units.length} 個單元，包含重點摘要與練習題。</p>
        </section>

        <div className="grammar-grid">
          {units.map((unit) => (
            <Card key={unit.id}>
              <h3>{unit.title}</h3>
              <p className="muted">{unit.summary}</p>
              <p className="muted">章節 {unit.sections?.length || 0}｜小測 {unit.quiz?.length || 0}</p>
              <Button onClick={() => {
                setActive(unit.id);
                setAnswers({});
                setSubmitted({});
              }}>
                進入單元
              </Button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <Card>
        <div className="row between">
          <h3>{current.title}</h3>
          <Button variant="ghost" onClick={() => setActive(null)}>返回單元列表</Button>
        </div>
        <p className="muted">{current.summary}</p>
      </Card>

      {(current.sections || []).map((section, idx) => (
        <Card key={`${current.id}_section_${idx}`}>
          <h3>{section.heading}</h3>
          <div className="muted" dangerouslySetInnerHTML={{ __html: section.body || "" }} />
          {(section.examples || []).length > 0 && (
            <ul className="bullet-list">
              {section.examples.map((example, exIdx) => <li key={exIdx}>{example}</li>)}
            </ul>
          )}
        </Card>
      ))}

      <Card>
        <h3>小測驗</h3>
        <div className="stack">
          {(current.quiz || []).map((quiz, qi) => {
            const picked = answers[qi];
            const done = submitted[qi];
            return (
              <div key={`${current.id}_quiz_${qi}`} className="review-question">
                <p><strong>{qi + 1}.</strong> {quiz.question}</p>
                <div className="options">
                  {(quiz.options || []).map((opt, oi) => (
                    <button
                      key={`${current.id}_${qi}_${oi}`}
                      type="button"
                      className={`option-btn ${picked === oi ? "selected" : ""} ${done && quiz.answer === oi ? "correct" : ""} ${done && picked === oi && picked !== quiz.answer ? "wrong" : ""}`}
                      onClick={() => chooseQuiz(qi, oi)}
                      disabled={done}
                    >
                      <span className="option-key">{String.fromCharCode(65 + oi)}</span>
                      <span>{opt}</span>
                    </button>
                  ))}
                </div>
                {done && <p className="muted">解析：{quiz.explanation}</p>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
