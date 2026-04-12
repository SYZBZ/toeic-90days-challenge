import { callGeminiWithBackoff, parseJsonSafely } from "./geminiClient";
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from "./aiModels";

const QUESTION_PROMPT = ({ part, topic, level }) => `
你是 TOEIC 金色證書（${level}）閱讀出題器。
請只產生 1 題 ${part} 題型（商務情境、偏高難度），不得提供正解。
輸出 JSON：
{
  "question": "...",
  "options": ["A","B","C","D"],
  "meta": { "part": "${part}", "topic": "${topic || "general business"}", "level": "${level}" }
}
僅輸出 JSON。
`;

const ANALYSIS_PROMPT = ({ question, options, userAnswer }) => `
你是 TOEIC 專家解析器。
我會提供題目、選項、使用者作答。請回傳 JSON（繁體中文）：
{
  "correctAnswerIndex": 0,
  "translationZh": "題目與關鍵語句翻譯",
  "trapExplanationZh": "為什麼容易選錯",
  "correctReasonZh": "正解理由",
  "optionReviewZh": ["A解析","B解析","C解析","D解析"]
}

題目: ${question}
選項: ${JSON.stringify(options)}
使用者作答 index: ${userAnswer}
僅輸出 JSON。
`;

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
    status === 404 ||
    msg.includes("model") && (msg.includes("not found") || msg.includes("not enabled") || msg.includes("not supported")) ||
    msg.includes("permission")
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

export async function probeModelAvailability({ apiKey, model, onRetry }) {
  const text = await runModel({
    apiKey,
    model,
    prompt: "Reply exactly: OK",
    onRetry,
  });
  return String(text || "").trim().length > 0;
}

export async function generateQuestion(payload, apiKey, onRetry) {
  const ai = readAiSettings();
  const questionModel = ai.questionModel || DEFAULT_AI_SETTINGS.questionModel;

  let text;
  try {
    text = await runModel({
      apiKey,
      model: questionModel,
      prompt: QUESTION_PROMPT(payload),
      onRetry,
    });
  } catch (error) {
    throw toUserFriendlyError(error, "出題");
  }

  const parsed = parseJsonSafely(text);
  if (!parsed?.question || !Array.isArray(parsed?.options) || parsed.options.length !== 4) {
    throw new Error("Gemini 出題格式不正確，請稍後重試。");
  }

  return {
    question: parsed.question,
    options: parsed.options,
    meta: {
      ...(parsed.meta || {}),
      part: parsed.meta?.part || payload.part,
      topic: parsed.meta?.topic || payload.topic || "general business",
      level: parsed.meta?.level || payload.level,
      questionModel,
    },
  };
}

export async function analyzeAnswer(payload, apiKey, onRetry) {
  const ai = readAiSettings();
  const primaryModel = ai.analysisModel || DEFAULT_AI_SETTINGS.analysisModel;
  const fallbackModel = ai.analysisFallbackModel || DEFAULT_AI_SETTINGS.analysisFallbackModel;
  const prompt = ANALYSIS_PROMPT(payload);
  let modelUsed = primaryModel;

  const runFallback = async () => {
    try {
      return await runModel({ apiKey, model: fallbackModel, prompt, onRetry });
    } catch (fallbackError) {
      throw toUserFriendlyError(fallbackError, "解析");
    }
  };

  let text;
  if (shouldSkipModelByCooldown(primaryModel)) {
    modelUsed = fallbackModel;
    text = await runFallback();
  } else {
    try {
      text = await runModel({ apiKey, model: primaryModel, prompt, onRetry });
    } catch (error) {
      const canFallback = isQuotaError(error) || isModelUnavailableError(error) || isServiceBusyError(error);
      if (!canFallback) {
        throw toUserFriendlyError(error, "解析");
      }

      if (isQuotaError(error) || isServiceBusyError(error)) {
        markModelCooldown(primaryModel, error);
      }

      modelUsed = fallbackModel;
      text = await runFallback();
    }
  }

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
    fallbackModel,
  };
}
