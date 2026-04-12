import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { analyzeExamBatch, generateExamQuestions } from "../lib/geminiService";
import {
  fetchExamAttempt,
  fetchExamAttempts,
  removeMistake,
  saveExamAttempt,
  saveUserSettings,
  updateSummary,
  upsertMistake,
} from "../lib/firestoreService";
import { loadQuestionPart } from "../lib/localData";
import {
  appendToQuestionPool,
  archiveConsumedPool,
  dequeueFromPoolFIFO,
  getPoolStock,
  seedQuestionPoolFromLocal,
} from "../lib/questionPoolService";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

const STATUS = {
  SETUP: "setup",
  TAKING: "taking",
  SUBMITTING: "submitting",
  RESULT: "result",
  REVIEW: "review",
};

const PRESETS = {
  "10x5": { count: 10, minutes: 5 },
  "20x10": { count: 20, minutes: 10 },
};

const MODE_LABEL = {
  part5: "Part 5 句子填空",
  part6: "Part 6 段落填空",
  part7: "Part 7 閱讀理解",
  mixed: "綜合題型",
};

function normalizeMode(value) {
  const raw = String(value || "").toLowerCase().replace(/\s+/g, "");
  if (raw === "part5" || raw === "part6" || raw === "part7" || raw === "mixed") return raw;
  return "part5";
}

function normalizePreset(value) {
  return value === "20x10" ? "20x10" : "10x5";
}

function normalizeFreshRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.3;
  return Math.min(1, Math.max(0, n));
}

function partNumber(part) {
  if (part === "part5") return 5;
  if (part === "part6") return 6;
  return 7;
}

function modeDist(mode, count) {
  if (mode !== "mixed") return { [mode]: count };
  if (count === 10) return { part5: 5, part6: 3, part7: 2 };
  return { part5: 8, part6: 6, part7: 6 };
}

function expandDistForMode(mode) {
  if (mode === "mixed") return { part5: 5, part6: 3, part7: 2 };
  return { [mode]: 10 };
}

function formatSec(sec) {
  const safe = Math.max(0, sec);
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function makeSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeQuestion(item, part) {
  return {
    id: item.id || `${part}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    type: item.type || part,
    passage: item.passage || "",
    question: item.question,
    options: item.options,
    answer: item.answer,
    explanation: item.explanation || item.explanationZh || "",
    question_zh: item.question_zh || item.questionZh || "",
    options_zh: item.options_zh || item.optionsZh || [],
    passage_zh: item.passage_zh || item.passageZh || "",
  };
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function PracticePage() {
  const { user, profile } = useAuth();

  const [status, setStatus] = useState(STATUS.SETUP);
  const [mode, setMode] = useState(normalizeMode(profile?.settings?.part));
  const [preset, setPreset] = useState(normalizePreset(profile?.settings?.examPreset));
  const [freshRate, setFreshRate] = useState(normalizeFreshRate(profile?.settings?.exam?.freshRate));

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deadlineMs, setDeadlineMs] = useState(0);
  const [remainSec, setRemainSec] = useState(0);
  const [score, setScore] = useState(0);

  const [poolStock, setPoolStock] = useState({ part5: 0, part6: 0, part7: 0, mixed: 0, docs: 0 });
  const [toasts, setToasts] = useState([]);

  const [retryHint, setRetryHint] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [reviewAttempt, setReviewAttempt] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState("");

  const statusRef = useRef(status);
  const questionsRef = useRef(questions);
  const answersRef = useRef(answers);
  const remainSecRef = useRef(remainSec);

  const presetValue = PRESETS[preset] || PRESETS["10x5"];
  const currentQuestion = useMemo(() => questions[currentIndex] || null, [questions, currentIndex]);

  const onRetry = ({ waitMs, attempt }) => {
    const sec = (waitMs / 1000).toFixed(1);
    setRetryHint(`伺服器忙碌中，預計 ${sec} 秒後第 ${attempt} 次重試...`);
  };

  function pushToast(text, tone = "info") {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }

  async function refreshPool() {
    if (!user?.uid) return;
    const stock = await getPoolStock(user.uid);
    setPoolStock(stock);
    return stock;
  }

  async function ensureSeededPool() {
    if (!user?.uid) return;
    const stock = await getPoolStock(user.uid);
    setPoolStock(stock);

    if (stock.docs > 0) return;

    setAnalysisProgress("正在初始化題庫...");
    const [p5, p6, p7] = await Promise.all([
      loadQuestionPart(5),
      loadQuestionPart(6),
      loadQuestionPart(7),
    ]);

    const seeded = await seedQuestionPoolFromLocal(user.uid, {
      part5: p5,
      part6: p6,
      part7: p7,
    });

    setAnalysisProgress("");
    pushToast(`題庫初始化完成，新增 ${seeded.addedQuestions} 題。`);
    await refreshPool();
  }

  useEffect(() => {
    setMode(normalizeMode(profile?.settings?.part));
    setPreset(normalizePreset(profile?.settings?.examPreset));
    setFreshRate(normalizeFreshRate(profile?.settings?.exam?.freshRate));
  }, [profile?.settings?.part, profile?.settings?.examPreset, profile?.settings?.exam?.freshRate]);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { remainSecRef.current = remainSec; }, [remainSec]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.uid) return;
      const list = await fetchExamAttempts(user.uid, 20);
      if (!active) return;
      setHistory(list);
      await ensureSeededPool();
    }

    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (status !== STATUS.TAKING || !deadlineMs) return () => {};

    const timer = setInterval(() => {
      const sec = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setRemainSec(sec);
      if (sec <= 0) {
        clearInterval(timer);
        submitExam(true, {
          statusOverride: statusRef.current,
          questionsOverride: questionsRef.current,
          answersOverride: answersRef.current,
          remainSecOverride: remainSecRef.current,
        });
      }
    }, 250);

    return () => clearInterval(timer);
  }, [status, deadlineMs]);

  async function expandPoolInBackground() {
    if (!user?.uid) return;
    if (!profile?.geminiApiKey) {
      setError("請先在設定頁填入 Gemini API Key。");
      return;
    }

    setError("");
    setRetryHint("");
    setAnalysisProgress("正在背景擴充題庫...");

    const dist = expandDistForMode(mode);
    const level = profile?.settings?.level || "850+";
    const modelName = profile?.settings?.ai?.questionModel || "";

    try {
      let addedQuestions = 0;
      for (const [part, count] of Object.entries(dist)) {
        const generated = await generateExamQuestions(
          { part: `Part ${partNumber(part)}`, count, level },
          profile.geminiApiKey,
          onRetry,
        );
        const result = await appendToQuestionPool(user.uid, part, generated, {
          source: "api",
          generatorModel: modelName,
        });
        addedQuestions += result.addedQuestions;
      }

      const latest = await refreshPool();
      pushToast(`成功新增 ${addedQuestions} 題，目前庫存 ${latest?.mixed || 0} 題。`, "success");
    } catch (err) {
      setError(err.message || "背景擴充失敗");
    } finally {
      setAnalysisProgress("");
    }
  }

  async function dispatchPartQuestions({ part, count, level, sessionId }) {
    const safeCount = Math.max(0, Number(count || 0));
    const mustNew = Math.round(safeCount * freshRate);
    const allowedStock = safeCount - mustNew;

    const fromPool = await dequeueFromPoolFIFO(user.uid, part, allowedStock, sessionId);
    const actualStock = fromPool.questionCount;
    const apiFetch = mustNew + (allowedStock - actualStock);

    let generated = [];
    if (apiFetch > 0) {
      const raw = await generateExamQuestions(
        { part: `Part ${partNumber(part)}`, count: apiFetch, level },
        profile.geminiApiKey,
        onRetry,
      );
      generated = raw.map((x) => normalizeQuestion(x, part));
    }

    const questionsOut = [
      ...fromPool.questions.map((x) => normalizeQuestion(x, part)),
      ...generated,
    ];

    if (questionsOut.length !== safeCount) {
      throw new Error(`${part.toUpperCase()} 組卷失敗（預期 ${safeCount} 題，實得 ${questionsOut.length} 題）`);
    }

    return {
      part,
      count: safeCount,
      mustNew,
      allowedStock,
      actualStock,
      apiFetch,
      questions: questionsOut,
      consumedDocs: fromPool.docs,
    };
  }

  async function startExam() {
    setError("");
    setRetryHint("");
    setAnswers({});
    setScore(0);
    setReviewAttempt(null);

    if (!profile?.geminiApiKey) {
      setError("請先到設定頁填入 Gemini API Key，才能出題與產生完整中譯詳解。");
      return;
    }

    try {
      setStatus(STATUS.SUBMITTING);
      setAnalysisProgress("正在計算 fresh_rate 與調度題庫...");

      await saveUserSettings(user.uid, { exam: { freshRate } });

      const dist = modeDist(mode, presetValue.count);
      const level = profile?.settings?.level || "850+";
      const sessionId = makeSessionId();

      const partsResult = [];
      for (const [part, count] of Object.entries(dist)) {
        setAnalysisProgress(`正在調度 ${part.toUpperCase()} 題庫...`);
        const result = await dispatchPartQuestions({ part, count, level, sessionId });
        partsResult.push(result);
      }

      const allConsumed = partsResult.flatMap((x) => x.consumedDocs);
      if (allConsumed.length > 0) {
        await archiveConsumedPool(user.uid, allConsumed, sessionId);
      }

      const merged = shuffle(partsResult.flatMap((x) => x.questions)).slice(0, presetValue.count);
      if (!merged.length) {
        setError("目前無可用題目，請稍後再試。");
        setStatus(STATUS.SETUP);
        return;
      }

      await refreshPool();
      setQuestions(merged);
      setCurrentIndex(0);
      const deadline = Date.now() + presetValue.minutes * 60 * 1000;
      setDeadlineMs(deadline);
      setRemainSec(presetValue.minutes * 60);
      setStatus(STATUS.TAKING);
      setAnalysisProgress("");

      const summary = partsResult
        .map((x) => `${x.part.toUpperCase()}:庫存${x.actualStock}/新題${x.apiFetch}`)
        .join(" | ");
      pushToast(`組卷完成：${summary}`, "success");
    } catch (err) {
      setError(err.message || "建立測驗失敗");
      setStatus(STATUS.SETUP);
      setAnalysisProgress("");
    }
  }

  async function submitExam(isAuto = false, overrides = null) {
    const currentStatus = overrides?.statusOverride || status;
    const currentQuestions = overrides?.questionsOverride || questions;
    const currentAnswers = overrides?.answersOverride || answers;
    const currentRemain = Number.isFinite(overrides?.remainSecOverride) ? overrides.remainSecOverride : remainSec;

    if (!currentQuestions.length || currentStatus === STATUS.SUBMITTING || currentStatus === STATUS.RESULT) return;

    setStatus(STATUS.SUBMITTING);
    setRetryHint("");
    setError("");

    try {
      const answerArr = currentQuestions.map((_, idx) => (Number.isInteger(currentAnswers[idx]) ? currentAnswers[idx] : null));

      setAnalysisProgress("正在產生中譯與詳解（1/2）...");
      const analysisResult = await analyzeExamBatch(
        { questions: currentQuestions, answers: answerArr },
        profile?.geminiApiKey,
        onRetry,
        ({ done, total }) => setAnalysisProgress(`正在產生中譯與詳解（${done}/${total}）...`),
      );

      const finalQuestions = currentQuestions.map((q, idx) => {
        const a = analysisResult[idx] || {};
        const userAnswer = answerArr[idx];
        const isCorrect = userAnswer != null && userAnswer === q.answer;

        return {
          ...q,
          userAnswer,
          correct: !!isCorrect,
          questionZh: a.questionZh || q.question_zh || "",
          optionsZh: Array.isArray(a.optionsZh) && a.optionsZh.length === 4 ? a.optionsZh : (q.options_zh || ["", "", "", ""]),
          correctReasonZh: a.correctReasonZh || q.explanation || "",
          trapExplanationZh: a.trapExplanationZh || "",
          optionReviewZh: Array.isArray(a.optionReviewZh) && a.optionReviewZh.length === 4 ? a.optionReviewZh : ["", "", "", ""],
          modelUsed: a.modelUsed,
        };
      });

      const nextScore = finalQuestions.filter((x) => x.correct).length;
      setScore(nextScore);

      setAnalysisProgress("正在儲存到歷史與錯題本（2/2）...");
      const timeSpentSec = presetValue.minutes * 60 - currentRemain;

      const attemptPayload = {
        mode,
        preset,
        freshRate,
        timeLimitMin: presetValue.minutes,
        timeSpentSec: Math.max(0, timeSpentSec),
        score: nextScore,
        total: finalQuestions.length,
        meta: mode === "mixed"
          ? { autoSubmitted: isAuto, mixedRatio: modeDist(mode, presetValue.count) }
          : { autoSubmitted: isAuto },
        questions: finalQuestions,
      };

      const attemptId = await saveExamAttempt(user.uid, attemptPayload);

      for (const q of finalQuestions) {
        if (q.correct) {
          await removeMistake(user.uid, q.id);
        } else {
          await upsertMistake(user.uid, {
            id: q.id,
            questionId: q.id,
            type: q.type,
            question: q.question,
            questionZh: q.questionZh,
            options: q.options,
            optionsZh: q.optionsZh,
            yourAnswer: q.userAnswer,
            correctAnswer: q.answer,
            explanation: q.correctReasonZh,
            trapExplanation: q.trapExplanationZh,
            reviewedFromAttemptId: attemptId,
          });
        }
      }

      await updateSummary(user.uid, {
        answered: finalQuestions.length,
        correct: nextScore,
        dayProgress: 1,
        practiceDate: new Date().toISOString().slice(0, 10),
      });

      const list = await fetchExamAttempts(user.uid, 20);
      setHistory(list);
      setQuestions(finalQuestions);
      setStatus(STATUS.RESULT);
      setAnalysisProgress("");
      pushToast("交卷完成，已更新歷史與錯題。", "success");
    } catch (err) {
      setError(err.message || "交卷失敗");
      setStatus(STATUS.TAKING);
      setAnalysisProgress("");
    }
  }

  async function openReview(attemptId) {
    setError("");
    const item = await fetchExamAttempt(user.uid, attemptId);
    if (!item) {
      setError("找不到該次考卷。");
      return;
    }
    setReviewAttempt(item);
    setStatus(STATUS.REVIEW);
  }

  function resetToSetup() {
    setStatus(STATUS.SETUP);
    setReviewAttempt(null);
    setQuestions([]);
    setAnswers({});
    setScore(0);
    setError("");
    setRetryHint("");
    setAnalysisProgress("");
  }

  const answeredCount = Object.values(answers).filter((x) => Number.isInteger(x)).length;

  return (
    <div className="stack-lg">
      {(error || retryHint || analysisProgress) && (
        <div className="stack-sm">
          {retryHint && <Banner>{retryHint}</Banner>}
          {analysisProgress && <Banner>{analysisProgress}</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}
        </div>
      )}

      <div className="toast-wrap" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.tone || "info"}`}>{t.text}</div>
        ))}
      </div>

      {status === STATUS.SETUP && (
        <>
          <Card>
            <h3>模擬考設定</h3>
            <p className="muted">Hybrid Pool + Freshness Engine：庫存題與新題混合調度。</p>

            <div className="stack-sm">
              <div className="row wrap">
                {Object.entries(MODE_LABEL).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`choice-chip ${mode === k ? "active" : ""}`}
                    onClick={() => setMode(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="row wrap">
                {Object.entries(PRESETS).map(([k, info]) => (
                  <button
                    key={k}
                    type="button"
                    className={`choice-chip ${preset === k ? "active" : ""}`}
                    onClick={() => setPreset(k)}
                  >
                    {info.count} 題 / {info.minutes} 分鐘
                  </button>
                ))}
              </div>

              <div className="field-wrap">
                <span className="field-label">Fresh Rate：{Math.round(freshRate * 100)}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={Math.round(freshRate * 100)}
                  onChange={(e) => setFreshRate(normalizeFreshRate(Number(e.target.value) / 100))}
                />
                <p className="muted">新題比例，預設 30%。</p>
              </div>

              <div className="row wrap">
                <Button onClick={startExam}>開始測驗</Button>
                <Button variant="secondary" onClick={expandPoolInBackground}>📥 背景擴充題庫</Button>
                <Link className="link-btn ghost-link" to="/settings">設定 API Key</Link>
              </div>
            </div>
          </Card>

          <Card>
            <h3>題庫庫存</h3>
            <div className="pool-stock-grid">
              <div className="pool-stock-item"><span>Part 5</span><strong>{poolStock.part5}</strong></div>
              <div className="pool-stock-item"><span>Part 6</span><strong>{poolStock.part6}</strong></div>
              <div className="pool-stock-item"><span>Part 7</span><strong>{poolStock.part7}</strong></div>
              <div className="pool-stock-item"><span>綜合(虛擬)</span><strong>{poolStock.mixed}</strong></div>
            </div>
            <p className="muted">FIFO：先進先出；Part 6/7 以整篇題組出庫，不拆散。</p>
          </Card>

          <Card>
            <div className="row between">
              <h3>歷史考卷回顧</h3>
              <span className="muted">可重看當次題目與詳解</span>
            </div>

            {history.length === 0 ? (
              <p className="muted">目前還沒有考卷紀錄。</p>
            ) : (
              <ul className="list stack-sm">
                {history.map((h) => (
                  <li key={h.id} className="list-row">
                    <span>{MODE_LABEL[h.mode] || h.mode || "考卷"}</span>
                    <span>{h.score}/{h.total}</span>
                    <button type="button" className="text-btn" onClick={() => openReview(h.id)}>回顧</button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {status === STATUS.TAKING && currentQuestion && (
        <>
          <Card>
            <div className="row between">
              <div>
                <h3>{MODE_LABEL[mode]} · {presetValue.count} 題</h3>
                <p className="muted">已作答 {answeredCount} / {questions.length}</p>
              </div>
              <strong className={`timer-pill ${remainSec <= 60 ? "danger" : remainSec <= 180 ? "warn" : ""}`}>
                {formatSec(remainSec)}
              </strong>
            </div>

            <div className="question-index-row">
              {questions.map((q, idx) => (
                <button
                  key={`${q.id}_${idx}`}
                  type="button"
                  className={`q-index ${idx === currentIndex ? "active" : ""} ${Number.isInteger(answers[idx]) ? "done" : ""}`}
                  onClick={() => setCurrentIndex(idx)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="row between">
              <span className="progress-pill">{String(currentQuestion.type || "part5").toUpperCase()}</span>
              <span className="muted">第 {currentIndex + 1} 題</span>
            </div>

            {currentQuestion.passage && (
              <div className="passage-box">
                <p>{currentQuestion.passage}</p>
              </div>
            )}

            <p className="question">{currentQuestion.question}</p>

            <div className="options">
              {currentQuestion.options.map((opt, idx) => (
                <button
                  key={`${currentQuestion.id}_${idx}`}
                  type="button"
                  className={`option-btn ${answers[currentIndex] === idx ? "selected" : ""}`}
                  onClick={() => setAnswers((prev) => ({ ...prev, [currentIndex]: idx }))}
                >
                  <span className="option-key">{String.fromCharCode(65 + idx)}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>

            <div className="row wrap">
              <Button variant="secondary" onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))} disabled={currentIndex === 0}>上一題</Button>
              <Button variant="secondary" onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))} disabled={currentIndex === questions.length - 1}>下一題</Button>
              <Button variant="danger" onClick={() => submitExam(false)}>交卷</Button>
            </div>
          </Card>
        </>
      )}

      {(status === STATUS.RESULT || status === STATUS.REVIEW) && (
        <Card>
          <div className="row between">
            <div>
              <h3>{status === STATUS.REVIEW ? "考卷回顧" : "交卷完成"}</h3>
              {status === STATUS.RESULT && (
                <p className="muted">成績：{score} / {questions.length}（{questions.length ? Math.round((score / questions.length) * 100) : 0}%）</p>
              )}
            </div>
            <div className="row wrap">
              <Button variant="ghost" onClick={resetToSetup}>回設定</Button>
              <Button onClick={startExam}>再來一回</Button>
            </div>
          </div>

          <div className="stack">
            {(status === STATUS.REVIEW ? (reviewAttempt?.questions || []) : questions).map((q, idx) => {
              const userAnswer = q.userAnswer;
              const isCorrect = userAnswer != null && userAnswer === q.answer;
              const optionsZh = Array.isArray(q.optionsZh) ? q.optionsZh : (Array.isArray(q.options_zh) ? q.options_zh : ["", "", "", ""]);
              const optionReview = Array.isArray(q.optionReviewZh) ? q.optionReviewZh : ["", "", "", ""];

              return (
                <div key={`${q.id}_${idx}`} className="review-question">
                  <div className="row between">
                    <strong>Q{idx + 1}</strong>
                    <span className={`pill ${isCorrect ? "ok" : "ng"}`}>{isCorrect ? "答對" : "答錯"}</span>
                  </div>

                  {q.passage ? <p className="muted">{q.passage}</p> : null}
                  {q.passageZh ? <p className="inline-zh">中譯：{q.passageZh}</p> : null}

                  <p>{q.question}</p>
                  {q.questionZh ? <p className="inline-zh">中譯：{q.questionZh}</p> : null}

                  <ul className="list stack-sm">
                    {q.options.map((opt, optionIdx) => (
                      <li
                        key={`${q.id}_opt_${optionIdx}`}
                        className={`option-review ${q.answer === optionIdx ? "correct" : ""} ${userAnswer === optionIdx && q.answer !== optionIdx ? "wrong" : ""}`}
                      >
                        <p>
                          <strong>{String.fromCharCode(65 + optionIdx)}.</strong> {opt}
                        </p>
                        {optionsZh[optionIdx] ? <p className="inline-zh">{optionsZh[optionIdx]}</p> : null}
                        {optionReview[optionIdx] ? <p className="muted">{optionReview[optionIdx]}</p> : null}
                      </li>
                    ))}
                  </ul>

                  <p><strong>正解：</strong>{String.fromCharCode(65 + q.answer)}</p>
                  <p><strong>正解理由：</strong>{q.correctReasonZh || q.explanation || ""}</p>
                  {q.trapExplanationZh ? <p><strong>陷阱解析：</strong>{q.trapExplanationZh}</p> : null}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
