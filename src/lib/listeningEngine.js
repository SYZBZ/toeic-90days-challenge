import { callGeminiWithBackoff, parseJsonSafely } from "./geminiClient";
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from "./aiModels";
import { getPromptInjectByLevel, normalizeTargetLevel, normalizeTargetScore } from "./targetDifficulty";
import { buildSsmlFromSegments } from "./ssmlService";
import { getPart1ImageById, pickPart1Images } from "../data/part1ImageBank";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
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

function ensureGeminiKey(overrideKey = "") {
  const key = String(overrideKey || GEMINI_API_KEY || "").trim();
  if (!key) {
    throw new Error("缺少 Gemini API Key，請先到設定頁填入，或在本機 .env 設定 VITE_GEMINI_API_KEY。");
  }
  return key;
}

function ensureTtsKey(overrideKey = "") {
  const key = String(overrideKey || TTS_API_KEY || "").trim();
  if (!key) {
    throw new Error("缺少 Text-to-Speech API Key，請先到設定頁填入，或在本機 .env 設定 VITE_TTS_API_KEY。");
  }
  return key;
}

function ensureVertexAiKey(overrideKey = "") {
  const key = String(overrideKey || VERTEX_AI_KEY || "").trim();
  if (!key) {
    throw new Error("缺少 Imagen / Vertex AI API Key，請先到設定頁填入，或在本機 .env 設定 VITE_VERTEX_AI_KEY。");
  }
  return key;
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

function buildListeningPrompt({ part, count, targetScore, targetLevel, promptInject, imageBankItems = [] }) {
  const partLabel = toPromptPartLabel(part);
  const groupCount = (part === "part3" || part === "part4") ? Math.floor(count / 3) : count;

  if (part === "part1") {
    const imageContext = imageBankItems.map((item, index) => ({
      idx: index,
      imageId: item.id,
      scene: item.scene,
      objects: item.objects,
      actions: item.actions,
      tags: item.tags,
      prompt: item.prompt,
    }));

    return `
你是 TOEIC Listening ${partLabel}（Photographs）出題器。
請根據下方圖片庫 metadata 產生剛好 ${count} 題，難度對應 ${targetScore}+ (${targetLevel})。
難度規則：${promptInject}

圖片庫 metadata：
${JSON.stringify(imageContext, null, 2)}

每題格式：
- imageId: 必須使用圖片庫中的 imageId，且每題盡量不同
- transcript.segments: 音檔要朗讀的內容（含 4 個選項敘述）
- options: 四個英文敘述（A/B/C/D）
- answer: 0~3
- questionZh/optionsZh/explanationZh/trapExplanationZh/optionReviewZh
- difficulty 必須是 "${targetLevel}"

出題規則：
1. 正解必須符合圖片 metadata 中可見場景、物件或動作。
2. 干擾選項可以合理但不可與圖片 metadata 明顯衝突到荒謬。
3. 不要描述圖片 metadata 沒有提到的具體人物身份或品牌。

只輸出 JSON：
{
  "items": [
    {
      "imageId": "...",
      "transcript": { "segments": [{"speaker":"NARRATOR","text":"A. ...","accent":"us","gender":"female"}] },
      "options": ["...","...","...","..."],
      "answer": 0,
      "questionZh": "...",
      "optionsZh": ["...","...","...","..."],
      "explanationZh": "...",
      "trapExplanationZh": "...",
      "optionReviewZh": ["...","...","...","..."],
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
- questionZh/optionsZh/explanationZh/trapExplanationZh/optionReviewZh
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
      "trapExplanationZh": "...",
      "optionReviewZh": ["...","...","..."],
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
- questionZh/optionsZh/explanationZh/trapExplanationZh/optionReviewZh
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
          "trapExplanationZh": "...",
          "optionReviewZh": ["...","...","...","..."],
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
      trapExplanationZh: String(item.trapExplanationZh || ""),
      optionReviewZh: Array.isArray(item.optionReviewZh) ? item.optionReviewZh.map((x) => String(x || "")) : [],
      question_zh: String(item.questionZh || ""),
      options_zh: optionsZh,
      transcript: { segments },
      imagePrompt: String(item.imagePrompt || "").trim(),
      imageId: String(item.imageId || "").trim(),
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
      trapExplanationZh: String(item.trapExplanationZh || ""),
      optionReviewZh: Array.isArray(item.optionReviewZh) ? item.optionReviewZh.map((x) => String(x || "")) : [],
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
      trapExplanationZh: String(q.trapExplanationZh || ""),
      optionReviewZh: Array.isArray(q.optionReviewZh) ? q.optionReviewZh.map((x) => String(x || "")) : [],
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

function toDataUrl(contentType, base64) {
  return `data:${contentType};base64,${base64}`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapWords(text, maxLineLength = 48, maxLines = 5) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines.length ? lines : ["Professional office scene"];
}

function promptToFallbackImageUrl(prompt) {
  const lines = wrapWords(prompt || "Professional office scene");
  const tspans = lines
    .map((line, idx) => `<tspan x="48" y="${184 + idx * 34}">${escapeXml(line)}</tspan>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="1" stop-color="#dbeafe"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <rect x="44" y="72" width="872" height="396" rx="20" fill="#ffffff" stroke="#94a3b8" stroke-width="3"/>
  <text x="48" y="128" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#0f172a">TOEIC Part 1 Visual Prompt</text>
  <text font-family="Arial, sans-serif" font-size="26" fill="#334155">${tspans}</text>
  <text x="48" y="430" font-family="Arial, sans-serif" font-size="20" fill="#64748b">Imagen is unavailable, so this free fallback uses the generated scene description.</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function localPart1OptionSet(image = {}, idx = 0) {
  const action = image.actions?.[idx % Math.max(1, image.actions.length)] || `a ${image.scene || "workplace"} is shown`;
  const object = image.objects?.[0] || image.tags?.[0] || "workplace item";
  const scene = image.scene || "workplace scene";
  const options = [
    action.replace(/^./, (ch) => ch.toUpperCase()).replace(/\.$/, ""),
    "A vehicle is being repaired outside.",
    "Several packages are floating on the water.",
    "A person is cooking in a private kitchen.",
  ];

  return {
    options,
    answer: 0,
    questionZh: `請選出最符合圖片「${scene}」的描述。`,
    optionsZh: [
      `圖片中可見：${action}。`,
      "車輛正在戶外維修。",
      "幾個包裹漂浮在水面上。",
      "有人正在私人廚房烹飪。",
    ],
    explanation: `正解描述了圖片 metadata 中的主要場景或動作：${action}。`,
    trapExplanationZh: `其他選項加入了圖片 metadata 未出現的場景，例如車輛維修、水面包裹或私人廚房。`,
    optionReviewZh: [
      `符合圖片中的 ${object} / ${scene} 線索。`,
      "圖片 metadata 沒有戶外修車情境。",
      "圖片 metadata 沒有水面或漂浮物。",
      "圖片 metadata 沒有私人廚房烹飪情境。",
    ],
  };
}

function buildLocalPart1Blueprints(images = [], targetLevel = "gold") {
  return images.map((image, idx) => {
    const set = localPart1OptionSet(image, idx);
    return {
      id: `part1_local_${image.id || idx}_${Date.now()}`,
      type: "part1",
      question: "",
      options: set.options,
      answer: set.answer,
      difficulty: targetLevel,
      explanation: set.explanation,
      trapExplanationZh: set.trapExplanationZh,
      optionReviewZh: set.optionReviewZh,
      question_zh: set.questionZh,
      options_zh: set.optionsZh,
      transcript: {
        segments: set.options.map((option, optionIdx) => ({
          speaker: "NARRATOR",
          text: `${String.fromCharCode(65 + optionIdx)}. ${option}.`,
          accent: "us",
          gender: "female",
        })),
      },
      imagePrompt: image.prompt || "",
      imageId: image.id || "",
      localFallback: true,
    };
  });
}

export async function synthesizeTtsBase64({ part, segments, useSsml = false, speakingRate = 0.95, onRetry, apiKey: overrideApiKey = "" }) {
  const apiKey = ensureTtsKey(overrideApiKey);
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

export async function generateImagenBase64({ prompt, onRetry, apiKey: overrideApiKey = "" }) {
  const apiKey = ensureVertexAiKey(overrideApiKey);
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

export async function generateListeningBlueprint({ part, count, targetScore, targetLevel, onRetry, apiKeys = {}, imageBankItems = [] }) {
  const apiKey = ensureGeminiKey(apiKeys.geminiApiKey);
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
    imageBankItems,
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

export async function expandListeningPool({ uid, part, count, targetScore, targetLevel, onProgress, onRetry, apiKeys = {}, playbackMode = "" }) {
  const normalizedPart = normalizePart(part);
  const expectedCount = Math.max(1, Number(count || 1));
  const level = normalizeTargetLevel(targetLevel, "gold");
  const ai = readAiSettings();
  const resolvedPlaybackMode = String(playbackMode || ai.listeningPlaybackMode || "browser").trim().toLowerCase();
  const useTts = resolvedPlaybackMode === "tts";
  const part1Images = normalizedPart === "part1" ? pickPart1Images(expectedCount) : [];

  let generatedQuestions = [];
  let tries = 0;

  while (generatedQuestions.length < expectedCount && tries < 4) {
    tries += 1;
    const missing = expectedCount - generatedQuestions.length;
    const imagesForBatch = normalizedPart === "part1" ? part1Images.slice(generatedQuestions.length, generatedQuestions.length + missing) : [];
    let blueprints = normalizedPart === "part1" && imagesForBatch.length
      ? buildLocalPart1Blueprints(imagesForBatch, level)
      : null;

    try {
      if (blueprints) {
        // Part 1 is optimized for speed: local licensed images + metadata templates avoid image/API waits.
      } else {
      blueprints = await generateListeningBlueprint({
        part: normalizedPart,
        count: missing,
        targetScore,
        targetLevel: level,
        onRetry,
        apiKeys,
        imageBankItems: imagesForBatch,
      });
      }
    } catch (error) {
      if (normalizedPart !== "part1" || !imagesForBatch.length) throw error;
      blueprints = buildLocalPart1Blueprints(imagesForBatch, level);
    }

    for (let i = 0; i < blueprints.length; i += 1) {
      const blueprint = blueprints[i];

      if (typeof onProgress === "function") {
        onProgress({ stage: "media", done: i + 1, total: blueprints.length });
      }

      if (normalizedPart === "part1" || normalizedPart === "part2") {
        let audioUrl = "";
        if (useTts) {
          const { base64 } = await synthesizeTtsBase64({
            part: normalizedPart,
            segments: blueprint.transcript?.segments || [],
            useSsml: false,
            onRetry,
            apiKey: apiKeys.ttsApiKey,
          });
          audioUrl = toDataUrl("audio/mpeg", base64);
        }

        let imageUrl = "";
        let imageMeta = null;
        if (normalizedPart === "part1") {
          imageMeta = getPart1ImageById(blueprint.imageId) || part1Images[generatedQuestions.length] || null;
          if (imageMeta?.imageUrl) {
            imageUrl = imageMeta.imageUrl;
          } else {
            try {
              const imageBase64 = await generateImagenBase64({
                prompt: blueprint.imagePrompt || "Professional office scene, high detail",
                onRetry,
                apiKey: apiKeys.vertexAiKey,
              });
              imageUrl = toDataUrl("image/jpeg", imageBase64);
            } catch {
              imageUrl = promptToFallbackImageUrl(blueprint.imagePrompt);
            }
          }
        }

        generatedQuestions.push({
          ...blueprint,
          imageId: normalizedPart === "part1" ? (blueprint.imageId || imageMeta?.id || "") : "",
          imageSource: normalizedPart === "part1" && imageMeta ? {
            title: imageMeta.sourceTitle,
            url: imageMeta.sourceUrl,
            author: imageMeta.author,
            license: imageMeta.license,
            licenseUrl: imageMeta.licenseUrl,
          } : null,
          audioUrl,
          imageUrl,
          level,
        });
      } else {
        const segments = blueprint?.payload?.transcript?.segments || [];
        let audioUrl = "";
        let ssml = "";
        if (useTts) {
          const tts = await synthesizeTtsBase64({
            part: normalizedPart,
            segments,
            useSsml: true,
            onRetry,
            apiKey: apiKeys.ttsApiKey,
          });
          audioUrl = toDataUrl("audio/mpeg", tts.base64);
          ssml = tts.ssml;
        }
        const groupId = blueprint.payload?.passage || `${normalizedPart}_generated_${Date.now()}_${generatedQuestions.length}_${i}`;

        generatedQuestions.push(
          ...(blueprint.payload.questions || []).map((q) => ({
            ...q,
            level,
            type: normalizedPart,
            passage: groupId,
            passage_zh: blueprint.payload?.passage_zh || "",
            transcript: blueprint.payload?.transcript || null,
            audioUrl,
            scriptSsml: ssml,
          })),
        );
      }
    }

    if (typeof onProgress === "function") {
      onProgress({ stage: "pool", done: generatedQuestions.length, total: expectedCount });
    }
  }

  if (generatedQuestions.length < expectedCount) {
    throw new Error(`Listening 擴充不足，預期 ${expectedCount} 題，實際 ${generatedQuestions.length} 題。`);
  }

  return {
    part: normalizedPart,
    addedDocs: 0,
    addedQuestions: generatedQuestions.length,
    skippedDuplicates: 0,
    upgradedDuplicates: 0,
    generatedQuestions: generatedQuestions.slice(0, expectedCount),
    appendedPoolDocs: [],
    persisted: false,
    mediaMode: useTts ? "inline-data-url" : "browser-speech",
  };
}

export async function analyzeListeningBatch(payload, onRetry, apiKeys = {}) {
  const apiKey = ensureGeminiKey(apiKeys.geminiApiKey);
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
        trapExplanationZh: q.trapExplanationZh || "",
        optionReviewZh: Array.isArray(q.optionReviewZh) ? q.optionReviewZh : (Array.isArray(q.options) ? q.options.map(() => "") : []),
      };
    }
    return {
      questionZh: x.questionZh || q.question_zh || "",
      optionsZh: (x.optionsZh?.length || 0) === (q.options?.length || 0) ? x.optionsZh : (q.options_zh || []),
      correctReasonZh: x.correctReasonZh || q.explanation || "",
      trapExplanationZh: x.trapExplanationZh || q.trapExplanationZh || "",
      optionReviewZh: (x.optionReviewZh?.length || 0) === (q.options?.length || 0)
        ? x.optionReviewZh
        : (Array.isArray(q.optionReviewZh) ? q.optionReviewZh : (Array.isArray(q.options) ? q.options.map(() => "") : [])),
    };
  });
}


