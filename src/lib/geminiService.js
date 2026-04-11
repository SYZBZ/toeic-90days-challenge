import { callGeminiWithBackoff, parseJsonSafely } from "./geminiClient";

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

export async function generateQuestion(payload, apiKey, onRetry) {
  const text = await callGeminiWithBackoff({
    apiKey,
    model: "gemini-2.5-flash",
    prompt: QUESTION_PROMPT(payload),
    onRetry,
  });
  const parsed = parseJsonSafely(text);
  if (!parsed?.question || !Array.isArray(parsed?.options) || parsed.options.length !== 4) {
    throw new Error("Gemini 出題格式不正確，請稍後重試。");
  }
  return {
    question: parsed.question,
    options: parsed.options,
    meta: parsed.meta || { part: payload.part, topic: payload.topic || "general business", level: payload.level },
  };
}

export async function analyzeAnswer(payload, apiKey, onRetry) {
  const text = await callGeminiWithBackoff({
    apiKey,
    model: "gemini-2.5-pro",
    prompt: ANALYSIS_PROMPT(payload),
    onRetry,
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
  };
}
