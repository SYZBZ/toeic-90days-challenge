import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  deleteExamAttempt,
  fetchExamAttempt,
  fetchExamAttempts,
  removeMistake,
  saveExamAttempt,
  saveUserSettings,
  updateSummary,
  upsertMistake,
} from "../lib/firestoreService";
import { loadQuestionPart } from "../lib/localData";
import { getTargetLabel, normalizeTargetSettings } from "../lib/targetDifficulty";
import {
  appendToQuestionPool,
  archiveConsumedPool,
  dequeueFromPoolFIFO,
  getPoolStock,
  seedQuestionPoolFromLocal,
} from "../lib/questionPoolService";
import { analyzeListeningBatch, expandListeningPool } from "../lib/listeningEngine";
import { audioManager, useAudioCleanupOnUnmount } from "../lib/audioManager";
import { speakEnglishSegments, stopEnglishSpeech } from "../lib/speech";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import ReviewQuestion from "../components/ReviewQuestion";

const STATUS = {
  SETUP: "setup",
  TAKING: "taking",
  SUBMITTING: "submitting",
  RESULT: "result",
  REVIEW: "review",
};

const PART_LABEL = {
  part1: "Part 1 照片描述",
  part2: "Part 2 應答問題",
  part3: "Part 3 對話理解",
  part4: "Part 4 簡短獨白",
};

const PART_PRESETS = {
  part1: {
    "1x1": { count: 1, minutes: 1 },
    "10x5": { count: 10, minutes: 5 },
    "20x10": { count: 20, minutes: 10 },
  },
  part2: {
    "1x1": { count: 1, minutes: 1 },
    "10x5": { count: 10, minutes: 5 },
    "20x10": { count: 20, minutes: 10 },
  },
  part3: {
    "3x2": { count: 3, minutes: 2 },
    "9x5": { count: 9, minutes: 5 },
    "18x10": { count: 18, minutes: 10 },
  },
  part4: {
    "3x2": { count: 3, minutes: 2 },
    "9x5": { count: 9, minutes: 5 },
    "18x10": { count: 18, minutes: 10 },
  },
};

function normalizePart(value) {
  const x = String(value || "").toLowerCase().replace(/\s+/g, "");
  if (["part1", "part2", "part3", "part4"].includes(x)) return x;
  return "part1";
}

function normalizePreset(part, value) {
  const presets = PART_PRESETS[part] || PART_PRESETS.part1;
  if (presets[value]) return value;
  return Object.keys(presets)[0];
}

function normalizeFreshRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.3;
  return Math.min(1, Math.max(0, n));
}

function formatSec(sec) {
  const safe = Math.max(0, sec);
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function makeSessionId() {
  return `lsess_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function firstTranscriptLine(question) {
  const seg = question?.transcript?.segments || [];
  if (!seg.length) return "";
  return seg.map((x) => x.text).join(" ");
}

function getEmbeddedListeningAnalysis(q = {}) {
  const optionsZh = Array.isArray(q.optionsZh) ? q.optionsZh : (Array.isArray(q.options_zh) ? q.options_zh : []);
  const optionReviewZh = Array.isArray(q.optionReviewZh) ? q.optionReviewZh : [];
  return {
    questionZh: q.questionZh || q.question_zh || "",
    optionsZh,
    correctReasonZh: q.correctReasonZh || q.explanation || "",
    trapExplanationZh: q.trapExplanationZh || "",
    optionReviewZh,
  };
}

function hasEmbeddedListeningAnalysis(q = {}) {
  const analysis = getEmbeddedListeningAnalysis(q);
  return Boolean(
    analysis.questionZh
    || analysis.correctReasonZh
    || (Array.isArray(analysis.optionsZh) && analysis.optionsZh.length === (q.options || []).length),
  );
}

function stripInlineMedia(question = {}) {
  const audioUrl = String(question.audioUrl || "");
  const imageUrl = String(question.imageUrl || "");
  return {
    ...question,
    audioUrl: audioUrl.startsWith("data:") ? "" : audioUrl,
    imageUrl: imageUrl.startsWith("data:") ? "" : imageUrl,
    scriptSsml: "",
  };
}

function ImageCredit({ source }) {
  if (!source?.url) return null;
  const label = [source.author, source.license].filter(Boolean).join(" · ");
  return (
    <p className="muted tiny">
      Image: <a href={source.url} target="_blank" rel="noreferrer">{source.title || "source"}</a>
      {label ? ` (${label})` : ""}
    </p>
  );
}

export default function PracticeListeningPanel() {
  const { user, profile } = useAuth();
  useAudioCleanupOnUnmount();

  const [status, setStatus] = useState(STATUS.SETUP);
  const [part, setPart] = useState("part1");
  const [preset, setPreset] = useState("10x5");
  const [freshRate, setFreshRate] = useState(0.3);

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deadlineMs, setDeadlineMs] = useState(0);
  const [remainSec, setRemainSec] = useState(0);
  const [score, setScore] = useState(0);

  const [poolStock, setPoolStock] = useState({ part1: 0, part2: 0, part3: 0, part4: 0, mixedListening: 0 });
  const [toasts, setToasts] = useState([]);
  const [retryHint, setRetryHint] = useState("");
  const [error, setError] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [isExpanding, setIsExpanding] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const [history, setHistory] = useState([]);
  const [reviewAttempt, setReviewAttempt] = useState(null);

  const statusRef = useRef(status);
  const questionsRef = useRef(questions);
  const answersRef = useRef(answers);
  const remainSecRef = useRef(remainSec);
  const submittingRef = useRef(false);

  const target = useMemo(() => normalizeTargetSettings(profile?.settings || {}), [profile?.settings]);
  const targetLabel = getTargetLabel(target.targetLevel);
  const presetValue = (PART_PRESETS[part] || PART_PRESETS.part1)[preset] || { count: 10, minutes: 5 };
  const currentQuestion = questions[currentIndex] || null;
  const apiKeys = useMemo(() => ({
    geminiApiKey: profile?.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || "",
    ttsApiKey: profile?.ttsApiKey || import.meta.env.VITE_TTS_API_KEY || "",
    vertexAiKey: profile?.vertexAiKey || import.meta.env.VITE_VERTEX_AI_KEY || "",
  }), [profile?.geminiApiKey, profile?.ttsApiKey, profile?.vertexAiKey]);

  const onRetry = ({ waitMs, attempt, source }) => {
    const sec = (waitMs / 1000).toFixed(1);
    setRetryHint(`伺服器忙碌（${source || "gemini"}），${sec} 秒後第 ${attempt} 次重試...`);
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
    const stock = await getPoolStock(user.uid, { targetLevel: target.targetLevel });
    setPoolStock(stock);
    return stock;
  }

  async function ensureSeededListeningPool(preferredPart = "") {
    if (!user?.uid) return null;
    const stock = await getPoolStock(user.uid, { targetLevel: target.targetLevel });
    const parts = ["part1", "part2", "part3", "part4"];
    const needsSeed = parts.filter((key) => {
      if (preferredPart && key !== preferredPart) return false;
      return Number(stock[key] || 0) === 0;
    });

    if (!needsSeed.length) {
      setPoolStock(stock);
      return stock;
    }

    setAnalysisProgress("正在初始化本地聽力題庫...");
    const loaded = await Promise.all(needsSeed.map(async (key) => [key, await loadQuestionPart(Number(key.replace("part", "")))]));
    const localByPart = Object.fromEntries(loaded);
    const seeded = await seedQuestionPoolFromLocal(user.uid, localByPart, { currentTargetLevel: target.targetLevel });
    const latest = await getPoolStock(user.uid, { targetLevel: target.targetLevel });
    setPoolStock(latest);
    setAnalysisProgress("");

    if (seeded.addedQuestions > 0) {
      pushToast(`本地聽力題庫已補入 ${seeded.addedQuestions} 題。`, "success");
    }
    return latest;
  }

  useEffect(() => {
    setPart((prev) => normalizePart(prev));
    setPreset((prev) => normalizePreset(normalizePart(part), prev));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPreset((prev) => normalizePreset(part, prev));
  }, [part]);

  useEffect(() => {
    setFreshRate(normalizeFreshRate(profile?.settings?.exam?.freshRate));
  }, [profile?.settings?.exam?.freshRate]);

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
      setHistory(list.filter((x) => String(x.mode || "").startsWith("listening-")));
      await ensureSeededListeningPool();
    }
    load();
    return () => { active = false; };
  }, [user?.uid, target.targetLevel]);

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

  useEffect(() => {
    audioManager.stopAll();
    setIsPlaying(false);
  }, [currentIndex, status]);

  async function playCurrentAudio() {
    if (!currentQuestion?.audioUrl && !currentQuestion?.transcript?.segments?.length) return;
    try {
      setIsPlaying(true);
      if (currentQuestion.audioUrl) {
        audioManager.onEnded(() => setIsPlaying(false));
        await audioManager.playUrl(currentQuestion.audioUrl);
      } else {
        await speakEnglishSegments(currentQuestion.transcript?.segments || []);
        setIsPlaying(false);
      }
    } catch (err) {
      setError(err?.message || "音訊播放失敗");
      setIsPlaying(false);
    }
  }

  function stopAudio() {
    audioManager.stopAll();
    stopEnglishSpeech();
    setIsPlaying(false);
  }

  async function expandPoolInBackground() {
    if (!user?.uid || isExpanding) return;
    setError("");
    setRetryHint("");
    setAnalysisProgress("正在背景擴充聽力題庫...");
    setIsExpanding(true);

    try {
      const result = await expandListeningPool({
        uid: user.uid,
        part,
        count: presetValue.count,
        targetScore: target.targetScore,
        targetLevel: target.targetLevel,
        onRetry,
        onProgress: ({ stage, done, total }) => {
          if (stage === "media") setAnalysisProgress(`正在整理聽力文字與播放資料（${done}/${total}）...`);
          if (stage === "pool") setAnalysisProgress(`正在完成背景擴充（${done}/${total}）...`);
        },
        apiKeys,
        playbackMode: "browser",
      });

      const appended = await appendToQuestionPool(user.uid, part, result.generatedQuestions || [], {
        source: "api",
        generatorModel: profile?.settings?.ai?.questionModel || "",
        level: target.targetLevel,
        currentTargetLevel: target.targetLevel,
      });

      const latest = await refreshPool();
      pushToast(`已背景新增 ${appended.addedQuestions} 題，目前聽力庫存 ${latest?.[part] || 0} 題。`, "success");
    } catch (err) {
      setError(err?.message || "背景擴充聽力題庫失敗");
    } finally {
      setIsExpanding(false);
      setAnalysisProgress("");
    }
  }

  async function dispatchQuestions(sessionId) {
    const count = presetValue.count;
    const mustNew = Math.round(count * freshRate);
    const allowedStock = count - mustNew;

    const fromPool = await dequeueFromPoolFIFO(user.uid, part, allowedStock, sessionId, { targetLevel: target.targetLevel });
    const actualStock = fromPool.questionCount;
    const apiFetch = mustNew + (allowedStock - actualStock);

    let generatedQuestions = [];
    let generatedPoolDocs = [];

    if (apiFetch > 0) {
      const result = await expandListeningPool({
        uid: user.uid,
        part,
        count: apiFetch,
        targetScore: target.targetScore,
        targetLevel: target.targetLevel,
        onRetry,
        onProgress: ({ stage, done, total }) => {
          if (stage === "media") setAnalysisProgress(`正在整理聽力文字與播放資料（${done}/${total}）...`);
          if (stage === "pool") setAnalysisProgress(`正在寫入新題（${done}/${total}）...`);
        },
        apiKeys,
      });
      generatedQuestions = result.generatedQuestions || [];
      generatedPoolDocs = result.appendedPoolDocs || [];
    }

    const merged = [...fromPool.questions, ...generatedQuestions].slice(0, count);
    if (merged.length !== count) {
      throw new Error(`聽力組卷失敗（預期 ${count} 題，實得 ${merged.length} 題）。`);
    }

    return {
      questions: merged,
      consumedDocs: [...fromPool.docs, ...generatedPoolDocs],
      mustNew,
      allowedStock,
      actualStock,
      apiFetch,
    };
  }

  async function startExam() {
    setError("");
    setRetryHint("");
    setAnswers({});
    setScore(0);
    setReviewAttempt(null);

    try {
      setStatus(STATUS.SUBMITTING);
      setAnalysisProgress("正在建立聽力考卷...");

      await saveUserSettings(user.uid, {
        exam: { freshRate },
        targetScore: target.targetScore,
        targetLevel: target.targetLevel,
      });

      await ensureSeededListeningPool(part);

      const sessionId = makeSessionId();
      const planned = await dispatchQuestions(sessionId);

      if (planned.consumedDocs.length) {
        await archiveConsumedPool(user.uid, planned.consumedDocs, sessionId);
      }

      setQuestions(planned.questions);
      setCurrentIndex(0);
      setDeadlineMs(Date.now() + presetValue.minutes * 60 * 1000);
      setRemainSec(presetValue.minutes * 60);
      setStatus(STATUS.TAKING);
      setAnalysisProgress("");
      await refreshPool();

      pushToast(`組卷完成：庫存 ${planned.actualStock} 題 + 新題 ${planned.apiFetch} 題。`, "success");
    } catch (err) {
      setError(err?.message || "建立聽力測驗失敗");
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
    if (submittingRef.current) return;
    submittingRef.current = true;

    setStatus(STATUS.SUBMITTING);
    setError("");
    setRetryHint("");
    stopAudio();

    try {
      const answerArr = currentQuestions.map((_, idx) => (Number.isInteger(currentAnswers[idx]) ? currentAnswers[idx] : null));

      const analysis = [];
      const missing = currentQuestions
        .map((q, idx) => ({ q, idx }))
        .filter(({ q }) => !hasEmbeddedListeningAnalysis(q));

      currentQuestions.forEach((q, idx) => {
        analysis[idx] = getEmbeddedListeningAnalysis(q);
      });

      if (missing.length > 0) {
        setAnalysisProgress(`正在補齊聽力詳解（${missing.length} 題）...`);
        const missingAnalysis = await analyzeListeningBatch(
          {
            questions: missing.map(({ q }) => q),
            answers: missing.map(({ idx }) => answerArr[idx]),
          },
          onRetry,
          apiKeys,
        );
        missing.forEach(({ idx }, localIdx) => {
          analysis[idx] = missingAnalysis[localIdx] || analysis[idx];
        });
      } else {
        setAnalysisProgress("已使用題庫內建詳解，正在整理結果...");
      }

      const finalQuestions = currentQuestions.map((q, idx) => {
        const a = analysis[idx] || {};
        const userAnswer = answerArr[idx];
        const isCorrect = userAnswer != null && userAnswer === q.answer;
        return {
          ...q,
          userAnswer,
          correct: !!isCorrect,
          questionZh: a.questionZh || q.question_zh || "",
          optionsZh: a.optionsZh || q.options_zh || [],
          correctReasonZh: a.correctReasonZh || q.explanation || "",
          trapExplanationZh: a.trapExplanationZh || "",
          optionReviewZh: a.optionReviewZh || (q.options || []).map(() => ""),
        };
      });

      const nextScore = finalQuestions.filter((x) => x.correct).length;
      setScore(nextScore);

      setAnalysisProgress("正在儲存成績與錯題（2/2）...");
      const attemptId = await saveExamAttempt(user.uid, {
        mode: `listening-${part}`,
        preset,
        freshRate,
        targetScore: target.targetScore,
        targetLevel: target.targetLevel,
        timeLimitMin: presetValue.minutes,
        timeSpentSec: Math.max(0, presetValue.minutes * 60 - currentRemain),
        score: nextScore,
        total: finalQuestions.length,
        meta: {
          autoSubmitted: isAuto,
          listeningPart: part,
        },
        questions: finalQuestions.map(stripInlineMedia),
      });

      for (const q of finalQuestions) {
        if (q.correct) {
          await removeMistake(user.uid, q.id);
        } else {
          await upsertMistake(user.uid, {
            id: q.id,
            questionId: q.id,
            type: q.type,
            question: q.question || firstTranscriptLine(q),
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
      setHistory(list.filter((x) => String(x.mode || "").startsWith("listening-")));

      setQuestions(finalQuestions);
      setStatus(STATUS.RESULT);
      setAnalysisProgress("");
      pushToast("交卷完成，已更新聽力歷史與錯題。", "success");
    } catch (err) {
      setError(err?.message || "交卷失敗");
      setStatus(STATUS.TAKING);
      setAnalysisProgress("");
    } finally {
      submittingRef.current = false;
    }
  }

  async function openReview(attemptId) {
    setError("");
    const item = await fetchExamAttempt(user.uid, attemptId);
    if (!item) {
      setError("找不到該次聽力考卷。");
      return;
    }
    setReviewAttempt(item);
    setStatus(STATUS.REVIEW);
  }

  async function onDeleteAttempt(attemptId) {
    const ok = window.confirm("確定要刪除此聽力考卷紀錄嗎？");
    if (!ok) return;

    try {
      await deleteExamAttempt(user.uid, attemptId);
      const list = await fetchExamAttempts(user.uid, 20);
      setHistory(list.filter((x) => String(x.mode || "").startsWith("listening-")));
      pushToast("已刪除聽力紀錄。", "success");
      if (reviewAttempt?.id === attemptId) {
        setReviewAttempt(null);
        setStatus(STATUS.SETUP);
      }
    } catch (err) {
      setError(err?.message || "刪除失敗");
    }
  }

  function resetToSetup() {
    stopAudio();
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
            <h3>聽力模擬考設定</h3>
            <p className="muted">目標難度：{targetLabel}。Part 1/2 支援 1 題快速測試；Part 3/4 為固定 3 題一組（提供 9/18 題）。</p>

            <div className="stack-sm">
              <div className="row wrap">
                {Object.entries(PART_LABEL).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`choice-chip ${part === k ? "active" : ""}`}
                    onClick={() => setPart(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="row wrap">
                {Object.entries(PART_PRESETS[part] || {}).map(([k, info]) => (
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
              </div>

              <div className="row wrap">
                <Button onClick={startExam}>開始測驗</Button>
                <Button variant="secondary" onClick={expandPoolInBackground} disabled={isExpanding || status === STATUS.SUBMITTING}>
                  {isExpanding ? "擴充中..." : "背景擴充聽力題庫"}
                </Button>
                <Link className="link-btn ghost-link" to="/settings">前往設定</Link>
              </div>
            </div>
          </Card>

          <Card>
            <h3>聽力庫存（{targetLabel}）</h3>
            <div className="pool-stock-grid">
              <div className="pool-stock-item"><span>Part 1</span><strong>{poolStock.part1}</strong></div>
              <div className="pool-stock-item"><span>Part 2</span><strong>{poolStock.part2}</strong></div>
              <div className="pool-stock-item"><span>Part 3</span><strong>{poolStock.part3}</strong></div>
              <div className="pool-stock-item"><span>Part 4</span><strong>{poolStock.part4}</strong></div>
            </div>
          </Card>

          <Card>
            <div className="row between">
              <h3>聽力歷史回顧</h3>
              <span className="muted">可回看每題詳解</span>
            </div>
            {history.length === 0 ? (
              <p className="muted">目前沒有聽力作答紀錄。</p>
            ) : (
              <ul className="list stack-sm">
                {history.map((h) => (
                  <li key={h.id} className="list-row">
                    <span>{h.mode || "listening"}</span>
                    <span>{h.score}/{h.total}</span>
                    <div className="row wrap">
                      <button type="button" className="text-btn" onClick={() => openReview(h.id)}>回顧</button>
                      <button type="button" className="text-btn danger" onClick={() => onDeleteAttempt(h.id)}>刪除</button>
                    </div>
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
                <h3>{PART_LABEL[part]} · {presetValue.count} 題</h3>
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
              <span className="progress-pill">{part.toUpperCase()}</span>
              <span className="muted">第 {currentIndex + 1} 題</span>
            </div>

            {part === "part1" && currentQuestion.imageUrl ? (
              <div className="passage-box" style={{ textAlign: "center" }}>
                <img src={currentQuestion.imageUrl} alt="listening visual" style={{ maxWidth: "100%", borderRadius: "12px" }} />
                <ImageCredit source={currentQuestion.imageSource} />
              </div>
            ) : null}

            <div className="row wrap">
              <Button variant="secondary" onClick={playCurrentAudio}>播放音檔</Button>
              <Button variant="ghost" onClick={stopAudio} disabled={!isPlaying}>■ 停止</Button>
            </div>

            {currentQuestion.question ? <p className="question">{currentQuestion.question}</p> : <p className="muted">請依音檔內容選擇最適合答案。</p>}

            <div className="options">
              {currentQuestion.options.map((opt, idx) => (
                <button
                  key={`${currentQuestion.id}_${idx}`}
                  type="button"
                  className={`option-btn ${answers[currentIndex] === idx ? "selected" : ""}`}
                  onClick={() => setAnswers((prev) => ({ ...prev, [currentIndex]: idx }))}
                >
                  <span className="option-key">{String.fromCharCode(65 + idx)}</span>
                  {(part === "part3" || part === "part4") ? <span>{opt}</span> : <span>選項 {String.fromCharCode(65 + idx)}</span>}
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
              <h3>{status === STATUS.REVIEW ? "聽力考卷回顧" : "交卷完成"}</h3>
              {status === STATUS.RESULT && (
                <p className="muted">成績：{score} / {questions.length}</p>
              )}
            </div>
            <div className="row wrap">
              <Button variant="ghost" onClick={resetToSetup}>回設定</Button>
              <Button onClick={startExam}>再來一回</Button>
            </div>
          </div>

          <div className="review-list">
            {(status === STATUS.REVIEW ? (reviewAttempt?.questions || []) : questions).map((q, idx) => {
              const extras = (q.audioUrl || q.imageUrl || q.transcript?.segments?.length) ? (
                <div className="review-media">
                  {q.audioUrl ? (
                    <Button variant="ghost" onClick={() => audioManager.playUrl(q.audioUrl)}>重播此題音檔</Button>
                  ) : q.transcript?.segments?.length ? (
                    <Button variant="ghost" onClick={() => speakEnglishSegments(q.transcript.segments)}>重播此題語音</Button>
                  ) : null}
                  {q.imageUrl ? (
                    <div className="review-image">
                      <img src={q.imageUrl} alt="review visual" />
                      <ImageCredit source={q.imageSource} />
                    </div>
                  ) : null}
                  {q.transcript?.segments?.length ? (
                    <div className="passage-box">
                      {q.transcript.segments.map((seg, segIdx) => (
                        <p key={`${q.id}_review_seg_${segIdx}`} className="muted">
                          <strong>{seg.speaker}:</strong> {seg.text}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null;
              return (
                <ReviewQuestion key={`${q.id}_${idx}`} question={q} index={idx} extraHeader={extras} />
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}


