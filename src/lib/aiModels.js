export const DEFAULT_AI_SETTINGS = {
  questionModel: "gemini-2.5-flash",
  analysisModel: "gemini-3-flash",
  analysisFallbackModel: "gemini-2.5-flash",
};

function normalizeModelName(value, fallback) {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

export function normalizeAiSettings(ai = {}) {
  return {
    questionModel: normalizeModelName(ai.questionModel, DEFAULT_AI_SETTINGS.questionModel),
    analysisModel: normalizeModelName(ai.analysisModel, DEFAULT_AI_SETTINGS.analysisModel),
    analysisFallbackModel: normalizeModelName(ai.analysisFallbackModel, DEFAULT_AI_SETTINGS.analysisFallbackModel),
  };
}

export function resolveAiSettings(settings = {}) {
  return normalizeAiSettings(settings?.ai || {});
}
