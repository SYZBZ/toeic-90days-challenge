import { callGeminiWithBackoff, parseJsonSafely } from "./geminiClient";
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from "./aiModels";

const cooldownByModel = new Map();

function readAiSettings() {
  const raw = localStorage.getItem("toeic.ai.settings");
  if (!raw) return normalizeAiSettings();

  try {
    return normalizeAiSettings(JSON.parse(raw));
  } catch {
    return normalizeAiSettings();
  }
}

function isQuotaError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const status = error?.status || error?.code;
  return status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted");
}

function isServiceBusyError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const status = error?.status || error?.code;
  return status === 503 || msg.includes("503") || msg.includes("unavailable");
}

function isModelUnavailableError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const status = error?.status || error?.code;
  return (
    status === 404
    || (msg.includes("model") && (msg.includes("not found") || msg.includes("not enabled") || msg.includes("not supported")))
    || msg.includes("permission")
  );
}

function extractRetryMs(error) {
  const msg = String(error?.message || "");
  const match = msg.match(/retry in\s+([\d.]+)s/i);
  if (!match?.[1]) return null;

  const sec = Number(match[1]);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.ceil(sec * 1000);
}

function shouldSkipModelByCooldown(model) {
  const cooldownUntil = cooldownByModel.get(model) || 0;
  return Date.now() < cooldownUntil;
}

function markModelCooldown(model, error) {
  const retryMs = extractRetryMs(error) ?? 60000;
  cooldownByModel.set(model, Date.now() + retryMs);
}

function toUserFriendlyError(error, actionLabel) {
  if (isQuotaError(error)) {
    return new Error("Gemini 配額已達上限，系統已自動重試與降級模型；請約 1 分鐘後再試，或到 Google AI Studio 提高配額。");
  }

  if (isServiceBusyError(error)) {
    return new Error("Gemini 服務暫時忙碌，系統已自動重試；請稍後再試。");
  }

  if (isModelUnavailableError(error)) {
    return new Error("目前設定的模型不可用（未開通或名稱錯誤）。請到設定頁調整模型後重試。");
  }

  if (!error?.message) {
    return new Error(`${actionLabel}失敗，請稍後重試。`);
  }

  return error;
}

async function runModel({ apiKey, model, prompt, onRetry }) {
  return callGeminiWithBackoff({
    apiKey,
    model,
    prompt,
    onRetry,
  });
}

async function runWithFallback({ apiKey, primaryModel, fallbackModel, prompt, onRetry, actionLabel }) {
  if (shouldSkipModelByCooldown(primaryModel)) {
    try {
      const text = await runModel({ apiKey, model: fallbackModel, prompt, onRetry });
      return { text, modelUsed: fallbackModel };
    } catch (error) {
      throw toUserFriendlyError(error, actionLabel);
    }
  }

  try {
    const text = await runModel({ apiKey, model: primaryModel, prompt, onRetry });
    return { text, modelUsed: primaryModel };
  } catch (error) {
    const canFallback = isQuotaError(error) || isServiceBusyError(error) || isModelUnavailableError(error);
    if (!canFallback) throw toUserFriendlyError(error, actionLabel);

    if (isQuotaError(error) || isServiceBusyError(error)) {
      markModelCooldown(primaryModel, error);
    }

    try {
      const text = await runModel({ apiKey, model: fallbackModel, prompt, onRetry });
      return { text, modelUsed: fallbackModel };
    } catch (fallbackError) {
      throw toUserFriendlyError(fallbackError, actionLabel);
    }
  }
}

function questionPrompt({ part = "Part 5", level = "850+", count = 1 }) {
  return `
你是 TOEIC 閱讀測驗出題器。請產生 ${count} 題 ${part}，難度 ${level}。
規則：
0. 題目數量必須「剛好 ${count} 題」，不得多也不得少。
1. 每題都要 4 選 1。
2. 必須包含正解 index（0~3）與繁中解析 explanationZh。
3. Part 6 / Part 7 必須提供 passage；Part 5 不需要 passage。
4. 僅輸出 JSON，不要任何額外文字。

輸出格式：
{
  "questions": [
    {
      "type": "part5|part6|part7",
      "passage": "... 可省略",
      "question": "...",
      "options": ["A","B","C","D"],
      "answer": 0,
      "explanationZh": "..."
    }
  ]
}
`;
}

function analysisChunkPrompt(chunk) {
  return `
你是 TOEIC 閱讀解析助教。請針對下列題目提供繁中完整詳解。
要求：
1. 每題輸出 questionZh（整句翻譯）
2. 每題輸出 optionsZh（4 個選項的翻譯）
3. correctReasonZh：為什麼正解
4. trapExplanationZh：常見誤選陷阱
5. optionReviewZh：依 A/B/C/D 各給一行說明
6. 僅輸出 JSON，不要 markdown，不要多餘文字。

輸入：
${JSON.stringify(chunk)}

輸出格式：
{
  "results": [
    {
      "idx": 0,
      "questionZh": "...",
      "optionsZh": ["...","...","...","..."],
      "correctReasonZh": "...",
      "trapExplanationZh": "...",
      "optionReviewZh": ["...","...","...","..."]
    }
  ]
}
`;
}

function normalizeGeneratedQuestion(item, idx, partLabel) {
  const type = String(item?.type || partLabel || "part5").toLowerCase().replace(/\s+/g, "");
  const question = String(item?.question || "").trim();
  const options = Array.isArray(item?.options) ? item.options.map((x) => String(x || "").trim()) : [];
  const answer = Number(item?.answer);

  if (!question || options.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) {
    return null;
  }

  return {
    id: `${type}_gen_${Date.now()}_${idx}`,
    type,
    passage: String(item?.passage || "").trim() || undefined,
    question,
    options,
    answer,
    explanation: String(item?.explanationZh || item?.explanation || "").trim(),
  };
}

export async function probeModelAvailability({ apiKey, model, onRetry }) {
  const text = await runModel({
    apiKey,
    model,
    prompt: "Reply exactly: OK",
    onRetry,
  });
  return String(text || "").trim().length > 0;
}

export async function generateExamQuestions(payload, apiKey, onRetry) {
  const ai = readAiSettings();
  const questionModel = ai.questionModel || DEFAULT_AI_SETTINGS.questionModel;

  let text;
  try {
    text = await runModel({
      apiKey,
      model: questionModel,
      prompt: questionPrompt(payload),
      onRetry,
    });
  } catch (error) {
    throw toUserFriendlyError(error, "出題");
  }

  const parsed = parseJsonSafely(text);
  const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const normalized = list
    .map((x, idx) => normalizeGeneratedQuestion(x, idx, payload?.part || "part5"))
    .filter(Boolean)
    .slice(0, payload?.count || list.length);

  if (!normalized.length || normalized.length < (payload?.count || 1)) {
    throw new Error("Gemini 出題數量不足，請稍後重試。");
  }

  return normalized;
}

export async function analyzeExamBatch(payload, apiKey, onRetry, onProgress) {
  const ai = readAiSettings();
  const primaryModel = ai.analysisModel || DEFAULT_AI_SETTINGS.analysisModel;
  const fallbackModel = ai.analysisFallbackModel || DEFAULT_AI_SETTINGS.analysisFallbackModel;

  const questions = Array.isArray(payload?.questions) ? payload.questions : [];
  if (!questions.length) return [];

  const chunkSize = 4;
  const chunks = [];
  for (let i = 0; i < questions.length; i += chunkSize) {
    const chunk = questions.slice(i, i + chunkSize).map((q, offset) => ({
      idx: i + offset,
      part: q.type || q.meta?.part || "part5",
      passage: q.passage || "",
      question: q.question,
      options: q.options,
      correctAnswerIndex: q.answer,
      userAnswerIndex: payload?.answers?.[i + offset] ?? null,
    }));
    chunks.push(chunk);
  }

  const all = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const prompt = analysisChunkPrompt(chunks[i]);
    const { text, modelUsed } = await runWithFallback({
      apiKey,
      primaryModel,
      fallbackModel,
      prompt,
      onRetry,
      actionLabel: "解析",
    });

    const parsed = parseJsonSafely(text);
    const results = Array.isArray(parsed?.results) ? parsed.results : [];

    for (const item of results) {
      const idx = Number(item?.idx);
      if (!Number.isInteger(idx)) continue;

      all[idx] = {
        questionZh: String(item?.questionZh || ""),
        optionsZh: Array.isArray(item?.optionsZh) ? item.optionsZh.map((x) => String(x || "")) : ["", "", "", ""],
        correctReasonZh: String(item?.correctReasonZh || ""),
        trapExplanationZh: String(item?.trapExplanationZh || ""),
        optionReviewZh: Array.isArray(item?.optionReviewZh) ? item.optionReviewZh.map((x) => String(x || "")) : ["", "", "", ""],
        modelUsed,
      };
    }

    if (typeof onProgress === "function") {
      onProgress({ done: i + 1, total: chunks.length });
    }
  }

  return questions.map((q, idx) => {
    const fallbackReason = q.explanation || "";
    const item = all[idx] || {};
    const optionsZh = Array.isArray(item.optionsZh) && item.optionsZh.length === 4
      ? item.optionsZh
      : ["", "", "", ""];

    return {
      questionZh: item.questionZh || "",
      optionsZh,
      correctReasonZh: item.correctReasonZh || fallbackReason,
      trapExplanationZh: item.trapExplanationZh || "",
      optionReviewZh: Array.isArray(item.optionReviewZh) && item.optionReviewZh.length === 4
        ? item.optionReviewZh
        : ["", "", "", ""],
      modelUsed: item.modelUsed || primaryModel,
    };
  });
}

export async function generateQuestion(payload, apiKey, onRetry) {
  const list = await generateExamQuestions({ ...payload, count: 1 }, apiKey, onRetry);
  const first = list[0];
  return {
    question: first.question,
    options: first.options,
    meta: {
      part: payload?.part || "Part 5",
      topic: payload?.topic || "general",
      level: payload?.level || "850+",
    },
  };
}

export async function analyzeAnswer(payload, apiKey, onRetry) {
  const ai = readAiSettings();
  const primaryModel = ai.analysisModel || DEFAULT_AI_SETTINGS.analysisModel;
  const fallbackModel = ai.analysisFallbackModel || DEFAULT_AI_SETTINGS.analysisFallbackModel;

  const prompt = `
你是 TOEIC 專家解析器。
我會提供題目、選項、使用者作答。請回傳 JSON（繁體中文）：
{
  "correctAnswerIndex": 0,
  "translationZh": "題目翻譯",
  "trapExplanationZh": "為什麼容易選錯",
  "correctReasonZh": "正解理由",
  "optionReviewZh": ["A解析","B解析","C解析","D解析"]
}

題目: ${payload.question}
選項: ${JSON.stringify(payload.options || [])}
使用者作答 index: ${payload.userAnswer}
僅輸出 JSON。
`;

  const { text, modelUsed } = await runWithFallback({
    apiKey,
    primaryModel,
    fallbackModel,
    prompt,
    onRetry,
    actionLabel: "解析",
  });
  const parsed = parseJsonSafely(text);
  if (!parsed || typeof parsed.correctAnswerIndex !== "number") {
    throw new Error("Gemini 解析格式不正確，請稍後重試。");
  }

  return {
    correctAnswerIndex: parsed.correctAnswerIndex,
    translationZh: parsed.translationZh || "",
    trapExplanationZh: parsed.trapExplanationZh || "",
    correctReasonZh: parsed.correctReasonZh || "",
    optionReviewZh: Array.isArray(parsed.optionReviewZh) ? parsed.optionReviewZh : [],
    modelUsed,
  };
}
