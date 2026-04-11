import { GoogleGenerativeAI } from "@google/generative-ai";

function isRetriableError(error) {
  const status = error?.status || error?.code;
  const msg = String(error?.message || "").toLowerCase();
  return status === 429 || status === 503 || msg.includes("429") || msg.includes("503") || msg.includes("quota") || msg.includes("unavailable");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGeminiWithBackoff({
  apiKey,
  model,
  prompt,
  maxRetries = 5,
  baseDelayMs = 1000,
  maxDelayMs = 20000,
  onRetry,
}) {
  if (!apiKey) {
    throw new Error("尚未設定 GEMINI_API_KEY，請先到設定頁輸入。");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelClient = genAI.getGenerativeModel({ model });

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const result = await modelClient.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      if (!isRetriableError(error) || attempt === maxRetries) {
        throw error;
      }
      const cap = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      const waitMs = Math.floor(Math.random() * cap);
      if (typeof onRetry === "function") {
        onRetry({ attempt: attempt + 1, waitMs, error });
      }
      await sleep(waitMs);
      attempt += 1;
    }
  }

  throw new Error("Gemini 重試後仍失敗");
}

export function parseJsonSafely(text) {
  if (!text) return null;
  const raw = text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
