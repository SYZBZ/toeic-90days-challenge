import { callGeminiWithBackoff, parseJsonSafely } from "./geminiClient";
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from "./aiModels";
import { getPromptInjectByLevel, normalizeTargetLevel, normalizeTargetScore } from "./targetDifficulty";
import { buildSsmlFromSegments } from "./ssmlService";
import { uploadAudioBase64, uploadImageBase64 } from "./storageUploadService";
import { appendToQuestionPool } from "./questionPoolService";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || "";
const TTS_API_KEY = import.meta.env.VITE_TTS_API_KEY || "";
const VERTEX_AI_KEY = import.meta.env.VITE_VERTEX_AI_KEY || "";

function readAiSettings() {
  const raw = localStorage.getItem("toeic.ai.settings");
  if (!raw) return normalizeAiSettings();
  try {
    return normalizeAiSettings(JSON.parse(raw));
  } catch {
    return normalizeAiSettings();
  }
}

function ensureGeminiKey() {
  if (!GEMINI_API_KEY) {
    throw new Error("缺少 VITE_GEMINI_API_KEY（或舊版 VITE_GOOGLE_API_KEY），請先在 .env 設定後重啟。");
  }
  return GEMINI_API_KEY;
}

function ensureTtsKey() {
  if (!TTS_API_KEY) {
    throw new Error("缺少 VITE_TTS_API_KEY，請先在 .env 設定後重啟。");
  }
  return TTS_API_KEY;
}

function ensureVertexAiKey() {
  if (!VERTEX_AI_KEY) {
    throw new Error("缺少 VITE_VERTEX_AI_KEY，請先在 .env 設定後重啟。");
  }
  return VERTEX_AI_KEY;
}

function normalizeSegments(segments = []) {
  return (Array.isArray(segments) ? segments : [])
    .map((seg) => ({
      speaker: String(seg?.speaker || "NARRATOR"),
      text: String(seg?.text || "").trim(),
      accent: String(seg?.accent || "").toLowerCase() || undefined,
      gender: String(seg?.gender || "").toLowerCase() || undefined,
    }))
    .filter((seg) => seg.text);
}

function normalizePart(part) {
  const value = String(part || "").toLowerCase().replace(/\s+/g, "");
  if (["part1", "part2", "part3", "part4"].includes(value)) return value;
  return "part1";
}

function toPromptPartLabel(part) {
  return part.toUpperCase().replace("PART", "Part ");
}

function buildListeningPrompt({ part, count, targetScore, targetLevel, promptInject }) {
  const partLabel = toPromptPartLabel(part);
  const groupCount = (part === "part3" || part === "part4") ? Math.floor(count / 3) : count;

  if (part === "part1") {
    return `
你是 TOEIC Listening ${partLabel}（Photographs）出題器。
請產生剛好 ${count} 題，難度對應 ${targetScore}+ (${targetLevel})。
難度規則：${promptInject}

每題格式：
- imagePrompt: 提供給 Imagen 的英文畫面描述（詳細可生成辦公室場景）
- transcript.segments: 音檔要朗讀的內容（含 4 個選項敘述）
- options: 四個英文敘述（A/B/C/D）
- answer: 0~3
- questionZh/optionsZh/explanationZh
- difficulty 必須是 "${targetLevel}"

只輸出 JSON：
{
  "items": [
    {
      "imagePrompt": "...",
      "transcript": { "segments": [{"speaker":"NARRATOR","text":"A. ...","accent":"us","gender":"female"}] },
      "options": ["...","...","...","..."],
      "answer": 0,
      "questionZh": "...",
      "optionsZh": ["...","...","...","..."],
      "explanationZh": "...",
      "difficulty": "${targetLevel}"
    }
  ]
}`;
  }

  if (part === "part2") {
    return `
你是 TOEIC Listening ${partLabel}（Question-Response）出題器。
請產生剛好 ${count} 題，難度對應 ${targetScore}+ (${targetLevel})。
難度規則：${promptInject}

每題格式：
- transcript.segments：包含提問與 3 句回應
- options：三個回應句
- answer：0~2
- questionZh/optionsZh/explanationZh
- difficulty 必須是 "${targetLevel}"

只輸出 JSON：
{
  "items": [
    {
      "transcript": { "segments": [{"speaker":"SPEAKER_A","text":"Where is the meeting room?","accent":"uk","gender":"male"}] },
      "options": ["...","...","..."],
      "answer": 0,
      "questionZh": "...",
      "optionsZh": ["...","...","..."],
      "explanationZh": "...",
      "difficulty": "${targetLevel}"
    }
  ]
}`;
  }

  return `
你是 TOEIC Listening ${partLabel} 出題器。
請產生剛好 ${groupCount} 組題組（每組 3 題，共 ${count} 題），難度對應 ${targetScore}+ (${targetLevel})。
難度規則：${promptInject}

每組格式：
- transcript.segments：對話/獨白內容，需包含 speaker、text、accent(us|uk|au)、gender(male|female)
- questions：固定 3 題，每題 4 選 1
- answer：0~3
- questionZh/optionsZh/explanationZh
- difficulty 必須是 "${targetLevel}"

只輸出 JSON：
{
  "groups": [
    {
      "transcript": { "segments": [{"speaker":"SPEAKER_A","text":"...","accent":"uk","gender":"male"}] },
      "questions": [
        {
          "question": "...",
          "options": ["...","...","...","..."],
          "answer": 0,
          "questionZh": "...",
          "optionsZh": ["...","...","...","..."],
          "explanationZh": "...",
          "difficulty": "${targetLevel}"
        }
      ]
    }
  ]
}`;
}

function normalizeListeningBlueprintItem(part, item, idx, targetLevel) {
  if (!item || typeof item !== "object") return null;

  if (part === "part1") {
    const options = Array.isArray(item.options) ? item.options.map((x) => String(x || "").trim()) : [];
    const optionsZh = Array.isArray(item.optionsZh) ? item.optionsZh.map((x) => String(x || "")) : [];
    const answer = Number(item.answer);
    const segments = normalizeSegments(item?.transcript?.segments || []);
    const difficulty = normalizeTargetLevel(item.difficulty, targetLevel);

    if (options.length !== 4 || optionsZh.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3 || difficulty !== targetLevel) {
      return null;
    }

    return {
      id: `${part}_${Date.now()}_${idx}`,
      type: part,
      question: "",
      options,
      answer,
      difficulty,
      explanation: String(item.explanationZh || ""),
      question_zh: String(item.questionZh || ""),
      options_zh: optionsZh,
      transcript: { segments },
      imagePrompt: String(item.imagePrompt || "").trim(),
    };
  }

  if (part === "part2") {
    const options = Array.isArray(item.options) ? item.options.map((x) => String(x || "").trim()) : [];
    const optionsZh = Array.isArray(item.optionsZh) ? item.optionsZh.map((x) => String(x || "")) : [];
    const answer = Number(item.answer);
    const segments = normalizeSegments(item?.transcript?.segments || []);
    const difficulty = normalizeTargetLevel(item.difficulty, targetLevel);

    if (options.length !== 3 || optionsZh.length !== 3 || !Number.isInteger(answer) || answer < 0 || answer > 2 || difficulty !== targetLevel) {
      return null;
    }

    return {
      id: `${part}_${Date.now()}_${idx}`,
      type: part,
      question: "",
      options,
      answer,
      difficulty,
      explanation: String(item.explanationZh || ""),
      question_zh: String(item.questionZh || ""),
      options_zh: optionsZh,
      transcript: { segments },
    };
  }

  const segments = normalizeSegments(item?.transcript?.segments || []);
  const questions = Array.isArray(item.questions) ? item.questions : [];
  const normalizedQuestions = questions.map((q, qIdx) => {
    const options = Array.isArray(q.options) ? q.options.map((x) => String(x || "").trim()) : [];
    const optionsZh = Array.isArray(q.optionsZh) ? q.optionsZh.map((x) => String(x || "")) : [];
    const answer = Number(q.answer);
    const difficulty = normalizeTargetLevel(q.difficulty, targetLevel);

    if (!q?.question || options.length !== 4 || optionsZh.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3 || difficulty !== targetLevel) {
      return null;
    }

    return {
      id: `${part}_${Date.now()}_${idx}_${qIdx}`,
      type: part,
      question: String(q.question || "").trim(),
      options,
      answer,
      difficulty,
      explanation: String(q.explanationZh || ""),
      question_zh: String(q.questionZh || ""),
      options_zh: optionsZh,
      transcript: { segments },
    };
  }).filter(Boolean);

  if (normalizedQuestions.length !== 3 || !segments.length) return null;

  return {
    kind: "passage_group",
    payload: {
      passage: "",
      passage_zh: "",
      transcript: { segments },
      questions: normalizedQuestions,
    },
  };
}

function toPlainTtsText(segments = []) {
  return segments
    .map((s) => s.text)
    .filter(Boolean)
    .join(" ");
}

export async function synthesizeTtsBase64({ part, segments, useSsml = false, speakingRate = 0.95, onRetry }) {
  const apiKey = ensureTtsKey();
  const normalizedPart = normalizePart(part);
  const safeSegments = normalizeSegments(segments);
  if (!safeSegments.length) throw new Error("TTS 缺少可朗讀內容。");

  const maxRetries = 4;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const isSsml = useSsml || normalizedPart === "part3" || normalizedPart === "part4";
    const body = {
      input: isSsml
        ? { ssml: buildSsmlFromSegments(safeSegments) }
        : { text: toPlainTtsText(safeSegments) },
      voice: isSsml
        ? { languageCode: "en-US", name: "en-US-Neural2-F" }
        : { languageCode: "en-US", name: "en-US-Neural2-F" },
      audioConfig: { audioEncoding: "MP3", speakingRate },
    };

    try {
      const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.audioContent) {
        const msg = data?.error?.message || `TTS 失敗 (${res.status})`;
        const retriable = res.status === 429 || res.status === 503;
        if (!retriable || attempt === maxRetries) throw new Error(msg);

        const waitMs = Math.floor(Math.random() * Math.min(20000, 1000 * (2 ** attempt)));
        if (typeof onRetry === "function") onRetry({ attempt: attempt + 1, waitMs, source: "tts", status: res.status });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        attempt += 1;
        continue;
      }

      return {
        base64: data.audioContent,
        ssml: isSsml ? buildSsmlFromSegments(safeSegments) : "",
      };
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const waitMs = Math.floor(Math.random() * Math.min(20000, 1000 * (2 ** attempt)));
      if (typeof onRetry === "function") onRetry({ attempt: attempt + 1, waitMs, source: "tts", error });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt += 1;
    }
  }

  throw new Error("TTS 重試後仍失敗。");
}

export async function generateImagenBase64({ prompt, onRetry }) {
  const apiKey = ensureVertexAiKey();
  const model = "imagen-3.0-generate-002";
  const maxRetries = 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: String(prompt || "Office scene with professional people").trim() }],
          parameters: { sampleCount: 1 },
        }),
      });

      const data = await res.json().catch(() => ({}));
      const base64 = data?.predictions?.[0]?.bytesBase64Encoded || data?.predictions?.[0]?.image?.bytesBase64Encoded;

      if (!res.ok || !base64) {
        const message = data?.error?.message || `Imagen 失敗 (${res.status})`;
        if (res.status === 403 || String(message).toLowerCase().includes("permission")) {
          throw new Error("Imagen API 不可用或未開通，Part 1 已中止。請先啟用 Imagen API。");
        }

        const retriable = res.status === 429 || res.status === 503;
        if (!retriable || attempt === maxRetries) throw new Error(message);

        const waitMs = Math.floor(Math.random() * Math.min(12000, 1000 * (2 ** attempt)));
        if (typeof onRetry === "function") onRetry({ attempt: attempt + 1, waitMs, source: "imagen", status: res.status });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        attempt += 1;
        continue;
      }

      return base64;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const waitMs = Math.floor(Math.random() * Math.min(12000, 1000 * (2 ** attempt)));
      if (typeof onRetry === "function") onRetry({ attempt: attempt + 1, waitMs, source: "imagen", error });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt += 1;
    }
  }

  throw new Error("Imagen 重試後仍失敗。");
}

export async function generateListeningBlueprint({ part, count, targetScore, targetLevel, onRetry }) {
  const apiKey = ensureGeminiKey();
  const ai = readAiSettings();
  const model = ai.questionModel || DEFAULT_AI_SETTINGS.questionModel;

  const normalizedPart = normalizePart(part);
  const expectedCount = Math.max(1, Number(count || 1));
  const score = normalizeTargetScore(targetScore, 860);
  const level = normalizeTargetLevel(targetLevel, "gold");
  const promptInject = getPromptInjectByLevel(level);

  const prompt = buildListeningPrompt({
    part: normalizedPart,
    count: expectedCount,
    targetScore: score,
    targetLevel: level,
    promptInject,
  });

  const text = await callGeminiWithBackoff({
    apiKey,
    model,
    prompt,
    onRetry,
  });

  const parsed = parseJsonSafely(text) || {};
  const rawItems = normalizedPart === "part3" || normalizedPart === "part4"
    ? (Array.isArray(parsed.groups) ? parsed.groups : [])
    : (Array.isArray(parsed.items) ? parsed.items : []);

  const normalized = rawItems
    .map((item, idx) => normalizeListeningBlueprintItem(normalizedPart, item, idx, level))
    .filter(Boolean);

  if (normalizedPart === "part3" || normalizedPart === "part4") {
    const requiredGroups = Math.floor(expectedCount / 3);
    if (normalized.length !== requiredGroups) {
      throw new Error(`Listening ${normalizedPart.toUpperCase()} 題組不足（預期 ${requiredGroups} 組，實際 ${normalized.length} 組）。`);
    }
  } else if (normalized.length !== expectedCount) {
    throw new Error(`Listening ${normalizedPart.toUpperCase()} 題數不足（預期 ${expectedCount} 題，實際 ${normalized.length} 題）。`);
  }

  return normalized;
}

export async function expandListeningPool({ uid, part, count, targetScore, targetLevel, onProgress, onRetry }) {
  const normalizedPart = normalizePart(part);
  const expectedCount = Math.max(1, Number(count || 1));
  const level = normalizeTargetLevel(targetLevel, "gold");

  let collectedDocs = [];
  let generatedQuestions = [];
  let appendedPoolDocs = [];
  let tries = 0;

  while (generatedQuestions.length < expectedCount && tries < 4) {
    tries += 1;
    const missing = expectedCount - generatedQuestions.length;
    const blueprints = await generateListeningBlueprint({
      part: normalizedPart,
      count: missing,
      targetScore,
      targetLevel: level,
      onRetry,
    });

    const docs = [];

    for (let i = 0; i < blueprints.length; i += 1) {
      const blueprint = blueprints[i];
      const fileName = `${normalizedPart}_${Date.now()}_${tries}_${i}`;

      if (typeof onProgress === "function") {
        onProgress({ stage: "media", done: i + 1, total: blueprints.length });
      }

      if (normalizedPart === "part1" || normalizedPart === "part2") {
        const { base64 } = await synthesizeTtsBase64({
          part: normalizedPart,
          segments: blueprint.transcript?.segments || [],
          useSsml: false,
          onRetry,
        });
        const audio = await uploadAudioBase64(uid, base64, `${fileName}_audio`);

        let imageUrl = "";
        if (normalizedPart === "part1") {
          const imageBase64 = await generateImagenBase64({
            prompt: blueprint.imagePrompt || "Professional office scene, high detail",
            onRetry,
          });
          const image = await uploadImageBase64(uid, imageBase64, `${fileName}_image`);
          imageUrl = image.url;
        }

        docs.push({
          ...blueprint,
          audioUrl: audio.url,
          imageUrl,
          level,
        });

        generatedQuestions.push({
          ...blueprint,
          audioUrl: audio.url,
          imageUrl,
          level,
        });
      } else {
        const segments = blueprint?.payload?.transcript?.segments || [];
        const { base64, ssml } = await synthesizeTtsBase64({
          part: normalizedPart,
          segments,
          useSsml: true,
          onRetry,
        });
        const audio = await uploadAudioBase64(uid, base64, `${fileName}_audio`);

        docs.push({
          ...blueprint,
          level,
          payload: {
            ...blueprint.payload,
            audioUrl: audio.url,
            scriptSsml: ssml,
          },
        });

        generatedQuestions.push(
          ...(blueprint.payload.questions || []).map((q) => ({
            ...q,
            level,
            type: normalizedPart,
            passage: blueprint.payload?.passage || "",
            passage_zh: blueprint.payload?.passage_zh || "",
            transcript: blueprint.payload?.transcript || null,
            audioUrl: audio.url,
            scriptSsml: ssml,
          })),
        );
      }
    }

    collectedDocs = collectedDocs.concat(docs);

    if (typeof onProgress === "function") {
      onProgress({ stage: "pool", done: generatedQuestions.length, total: expectedCount });
    }
  }

  if (generatedQuestions.length < expectedCount) {
    throw new Error(`Listening 擴充不足，預期 ${expectedCount} 題，實際 ${generatedQuestions.length} 題。`);
  }

  const appendResult = await appendToQuestionPool(uid, normalizedPart, collectedDocs, {
    source: "api",
    generatorModel: readAiSettings().questionModel || DEFAULT_AI_SETTINGS.questionModel,
    level,
    currentTargetLevel: level,
  });

  appendedPoolDocs = appendResult.addedPoolDocs || [];

  return {
    ...appendResult,
    part: normalizedPart,
    generatedQuestions: generatedQuestions.slice(0, expectedCount),
    appendedPoolDocs,
  };
}

export async function analyzeListeningBatch(payload, onRetry) {
  const apiKey = ensureGeminiKey();
  const ai = readAiSettings();
  const model = ai.analysisModel || DEFAULT_AI_SETTINGS.analysisModel;

  const questions = Array.isArray(payload?.questions) ? payload.questions : [];
  if (!questions.length) return [];

  const prompt = `
你是 TOEIC Listening 詳解助教。請針對輸入題目輸出 JSON：
{
  "results": [
    {
      "idx": 0,
      "questionZh": "...",
      "optionsZh": ["..."],
      "correctReasonZh": "...",
      "trapExplanationZh": "...",
      "optionReviewZh": ["..."]
    }
  ]
}

輸入：${JSON.stringify({
    questions: questions.map((q, idx) => ({
      idx,
      type: q.type,
      question: q.question,
      options: q.options,
      answer: q.answer,
      userAnswer: payload?.answers?.[idx] ?? null,
      transcript: q.transcript,
    })),
  })}

只輸出 JSON。
`;

  const text = await callGeminiWithBackoff({ apiKey, model, prompt, onRetry });
  const parsed = parseJsonSafely(text);
  const list = Array.isArray(parsed?.results) ? parsed.results : [];

  const map = new Map();
  for (const item of list) {
    const idx = Number(item?.idx);
    if (!Number.isInteger(idx)) continue;
    map.set(idx, {
      questionZh: String(item?.questionZh || ""),
      optionsZh: Array.isArray(item?.optionsZh) ? item.optionsZh.map((x) => String(x || "")) : [],
      correctReasonZh: String(item?.correctReasonZh || ""),
      trapExplanationZh: String(item?.trapExplanationZh || ""),
      optionReviewZh: Array.isArray(item?.optionReviewZh) ? item.optionReviewZh.map((x) => String(x || "")) : [],
    });
  }

  return questions.map((q, idx) => {
    const x = map.get(idx);
    if (!x) {
      return {
        questionZh: q.question_zh || "",
        optionsZh: q.options_zh || [],
        correctReasonZh: q.explanation || "",
        trapExplanationZh: "",
        optionReviewZh: Array.isArray(q.options) ? q.options.map(() => "") : [],
      };
    }
    return {
      questionZh: x.questionZh || q.question_zh || "",
      optionsZh: (x.optionsZh?.length || 0) === (q.options?.length || 0) ? x.optionsZh : (q.options_zh || []),
      correctReasonZh: x.correctReasonZh || q.explanation || "",
      trapExplanationZh: x.trapExplanationZh || "",
      optionReviewZh: (x.optionReviewZh?.length || 0) === (q.options?.length || 0)
        ? x.optionReviewZh
        : (Array.isArray(q.options) ? q.options.map(() => "") : []),
    };
  });
}


