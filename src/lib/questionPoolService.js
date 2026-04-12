import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeTargetLevel } from "./targetDifficulty";

const PARTS = ["part1", "part2", "part3", "part4", "part5", "part6", "part7"];
const LEVELS = ["green", "blue", "gold"];
const SINGLE_PARTS = new Set(["part1", "part2", "part5"]);
const GROUP_PARTS = new Set(["part3", "part4", "part6", "part7"]);
const pendingLevelMigrations = new Map();
const runningLevelMigrations = new Set();

function normalizeLevel(value, fallback = "gold") {
  const normalized = String(value || "").trim().toLowerCase();
  if (LEVELS.includes(normalized)) return normalized;
  return normalizeTargetLevel(fallback, "gold");
}

function stableStringify(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((x) => stableStringify(x)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function fnv1aHash(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (`0000000${(h >>> 0).toString(16)}`).slice(-8);
}

function normalizeQuestionForPool(raw = {}, part, fallbackLevel = "gold") {
  return {
    id: raw.id || `${part}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    type: raw.type || part,
    question: String(raw.question || "").trim(),
    options: Array.isArray(raw.options) ? raw.options.map((x) => String(x || "").trim()) : [],
    answer: Number(raw.answer),
    difficulty: normalizeLevel(raw.difficulty, fallbackLevel),
    explanation: String(raw.explanation || raw.explanationZh || ""),
    question_zh: String(raw.question_zh || raw.questionZh || ""),
    options_zh: Array.isArray(raw.options_zh) ? raw.options_zh : (Array.isArray(raw.optionsZh) ? raw.optionsZh : []),
    passage: String(raw.passage || ""),
    passage_zh: String(raw.passage_zh || raw.passageZh || ""),
    audioUrl: String(raw.audioUrl || ""),
    imageUrl: String(raw.imageUrl || ""),
    transcript: raw.transcript && typeof raw.transcript === "object" ? raw.transcript : null,
    scriptSsml: String(raw.scriptSsml || ""),
  };
}

function isValidSingleByPart(part, q) {
  if (!Number.isInteger(q.answer)) return false;
  if (part === "part1" || part === "part5") {
    return q.options.length === 4 && q.answer >= 0 && q.answer <= 3;
  }
  if (part === "part2") {
    return q.options.length === 3 && q.answer >= 0 && q.answer <= 2;
  }
  return false;
}

function resolveGroupLevel(questions, fallbackLevel = "gold") {
  for (const q of questions || []) {
    const lv = String(q?.difficulty || "").trim().toLowerCase();
    if (LEVELS.includes(lv)) return lv;
  }
  return normalizeLevel(fallbackLevel, "gold");
}

function inferLevelFromPoolDoc(data = {}, fallbackLevel = "gold") {
  const direct = String(data?.level || "").trim().toLowerCase();
  if (LEVELS.includes(direct)) return direct;

  const payload = data?.payload || {};
  const singleLv = String(payload?.difficulty || "").trim().toLowerCase();
  if (LEVELS.includes(singleLv)) return singleLv;

  const groupLv = Array.isArray(payload?.questions)
    ? payload.questions.map((q) => String(q?.difficulty || "").trim().toLowerCase()).find((lv) => LEVELS.includes(lv))
    : "";
  if (LEVELS.includes(groupLv)) return groupLv;

  return normalizeLevel(fallbackLevel, "gold");
}

function queueLevelMigration(uid, updates = []) {
  const validUpdates = updates.filter((x) => x?.poolDocId && LEVELS.includes(String(x?.level || "").toLowerCase()));
  if (!validUpdates.length) return;

  const map = pendingLevelMigrations.get(uid) || new Map();
  for (const item of validUpdates) {
    map.set(item.poolDocId, normalizeLevel(item.level, "gold"));
  }
  pendingLevelMigrations.set(uid, map);

  if (runningLevelMigrations.has(uid)) return;
  runningLevelMigrations.add(uid);

  Promise.resolve().then(async () => {
    try {
      while (true) {
        const queued = pendingLevelMigrations.get(uid);
        if (!queued || queued.size === 0) break;

        pendingLevelMigrations.set(uid, new Map());
        const batch = writeBatch(db);
        for (const [poolDocId, level] of queued.entries()) {
          const ref = doc(db, "users", uid, "question_pool", poolDocId);
          batch.set(ref, {
            level: normalizeLevel(level, "gold"),
            updatedAt: serverTimestamp(),
            updatedAtMs: Date.now(),
          }, { merge: true });
        }

        try {
          await batch.commit();
        } catch {
          // Silent lazy migration: never block user-facing flow.
        }
      }
    } finally {
      runningLevelMigrations.delete(uid);
    }
  });
}

function toPassageGroups(part, docs = [], fallbackLevel = "gold") {
  if (SINGLE_PARTS.has(part)) {
    return docs
      .map((raw) => normalizeQuestionForPool(raw, part, fallbackLevel))
      .filter((q) => isValidSingleByPart(part, q) && (part !== "part5" || q.question))
      .map((q) => ({
        part,
        kind: "single",
        level: normalizeLevel(q.difficulty, fallbackLevel),
        size: 1,
        payload: {
          question: q.question,
          options: q.options,
          answer: q.answer,
          difficulty: normalizeLevel(q.difficulty, fallbackLevel),
          explanation: q.explanation,
          question_zh: q.question_zh,
          options_zh: q.options_zh,
          audioUrl: q.audioUrl,
          imageUrl: q.imageUrl,
          transcript: q.transcript,
          scriptSsml: q.scriptSsml,
          id: q.id,
          type: part,
        },
      }));
  }

  if (!GROUP_PARTS.has(part)) return [];

  const grouped = new Map();

  for (const raw of docs) {
    if (raw?.kind === "passage_group" && raw?.payload?.questions?.length) {
      const key = String(raw.payload.passage || raw.payload.audioUrl || "").trim() || `group_${Math.random().toString(36).slice(2, 8)}`;
      grouped.set(key, {
        passage: String(raw.payload.passage || ""),
        passage_zh: String(raw.payload.passage_zh || ""),
        audioUrl: String(raw.payload.audioUrl || ""),
        imageUrl: String(raw.payload.imageUrl || ""),
        transcript: raw.payload.transcript && typeof raw.payload.transcript === "object" ? raw.payload.transcript : null,
        scriptSsml: String(raw.payload.scriptSsml || ""),
        questions: raw.payload.questions.map((q) => normalizeQuestionForPool(q, part, fallbackLevel)),
      });
      continue;
    }

    const q = normalizeQuestionForPool(raw, part, fallbackLevel);
    if (!q.question || q.options.length !== 4 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) continue;

    const key = q.passage || q.audioUrl || `nogroup_${q.id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        passage: q.passage || "",
        passage_zh: q.passage_zh || "",
        audioUrl: q.audioUrl || "",
        imageUrl: q.imageUrl || "",
        transcript: q.transcript || null,
        scriptSsml: q.scriptSsml || "",
        questions: [],
      });
    }

    grouped.get(key).questions.push(q);
  }

  const out = [];
  for (const group of grouped.values()) {
    if (!group.questions.length) continue;

    const groupLevel = resolveGroupLevel(group.questions, fallbackLevel);
    out.push({
      part,
      kind: "passage_group",
      level: groupLevel,
      size: group.questions.length,
      payload: {
        passage: group.passage,
        passage_zh: group.passage_zh,
        audioUrl: group.audioUrl || "",
        imageUrl: group.imageUrl || "",
        transcript: group.transcript || null,
        scriptSsml: group.scriptSsml || "",
        questions: group.questions.map((q) => ({
          id: q.id,
          type: part,
          question: q.question,
          options: q.options,
          answer: q.answer,
          difficulty: normalizeLevel(q.difficulty, groupLevel),
          explanation: q.explanation,
          question_zh: q.question_zh,
          options_zh: q.options_zh,
        })),
      },
    });
  }

  return out;
}

function hashForDoc(poolDoc) {
  if (poolDoc.kind === "single") {
    const payload = poolDoc.payload || {};
    const transcriptSeed = Array.isArray(payload?.transcript?.segments)
      ? payload.transcript.segments.map((s) => `${s.speaker || ""}:${s.text || ""}`).join("|")
      : "";
    const seed = stableStringify({
      part: poolDoc.part,
      question: payload.question,
      options: payload.options,
      answer: payload.answer,
      transcript: transcriptSeed,
    });
    return fnv1aHash(seed);
  }

  const payload = poolDoc.payload || {};
  const transcriptSeed = Array.isArray(payload?.transcript?.segments)
    ? payload.transcript.segments.map((s) => `${s.speaker || ""}:${s.text || ""}`).join("|")
    : "";
  const seed = stableStringify({
    part: poolDoc.part,
    passage: payload.passage,
    transcript: transcriptSeed,
    questions: (payload.questions || []).map((q) => ({
      question: q.question,
      options: q.options,
      answer: q.answer,
    })),
  });
  return fnv1aHash(seed);
}

function poolDocRef(uid, part, hashId) {
  return doc(db, "users", uid, "question_pool", `${part}_${hashId}`);
}

function flattenPayloadToQuestions(poolDoc) {
  const baseLevel = normalizeLevel(poolDoc.level, "gold");

  if (poolDoc.kind === "single") {
    return [{
      ...poolDoc.payload,
      type: poolDoc.part,
      difficulty: normalizeLevel(poolDoc.payload?.difficulty, baseLevel),
      passage: poolDoc.payload?.passage || "",
      passage_zh: poolDoc.payload?.passage_zh || "",
    }];
  }

  const payload = poolDoc.payload || {};
  const passage = payload.passage || "";
  const passageZh = payload.passage_zh || "";
  const audioUrl = payload.audioUrl || "";
  const imageUrl = payload.imageUrl || "";
  const transcript = payload.transcript || null;
  const scriptSsml = payload.scriptSsml || "";
  return (payload.questions || []).map((q) => ({
    ...q,
    type: poolDoc.part,
    difficulty: normalizeLevel(q?.difficulty, baseLevel),
    passage,
    passage_zh: passageZh,
    audioUrl,
    imageUrl,
    transcript,
    scriptSsml,
  }));
}

export async function appendToQuestionPool(uid, part, docs, meta = {}) {
  const normalizedPart = String(part || "").toLowerCase();
  if (!PARTS.includes(normalizedPart)) throw new Error(`Unsupported part: ${part}`);

  const currentTargetLevel = normalizeLevel(meta.currentTargetLevel || meta.level, "gold");
  const groupedDocs = toPassageGroups(normalizedPart, docs, currentTargetLevel);
  if (!groupedDocs.length) {
    return {
      addedDocs: 0,
      addedQuestions: 0,
      skippedDuplicates: 0,
      upgradedDuplicates: 0,
    };
  }

  let addedDocs = 0;
  let addedQuestions = 0;
  let skippedDuplicates = 0;
  let upgradedDuplicates = 0;
  const addedPoolDocs = [];

  for (const candidate of groupedDocs) {
    const hashId = hashForDoc(candidate);
    const ref = poolDocRef(uid, normalizedPart, hashId);
    const exists = await getDoc(ref);

    const candidateLevel = normalizeLevel(candidate.level || meta.level, currentTargetLevel);

    if (exists.exists()) {
      const old = exists.data() || {};
      const oldLevel = inferLevelFromPoolDoc(old, currentTargetLevel);

      if (candidateLevel === currentTargetLevel && oldLevel !== currentTargetLevel) {
        await setDoc(ref, {
          level: currentTargetLevel,
          updatedAt: serverTimestamp(),
          updatedAtMs: Date.now(),
        }, { merge: true });
        upgradedDuplicates += 1;
      }

      skippedDuplicates += 1;
      continue;
    }

    const now = Date.now();
    await setDoc(ref, {
      part: normalizedPart,
      kind: candidate.kind,
      level: candidateLevel,
      hashId,
      size: candidate.size,
      payload: candidate.payload,
      source: meta.source || "api",
      generatorModel: meta.generatorModel || "",
      createdAt: serverTimestamp(),
      createdAtMs: now,
    });

    addedPoolDocs.push({
      poolDocId: `${normalizedPart}_${hashId}`,
      part: normalizedPart,
      kind: candidate.kind,
      level: candidateLevel,
      hashId,
      size: candidate.size,
      payload: candidate.payload,
      source: meta.source || "api",
      generatorModel: meta.generatorModel || "",
      createdAt: null,
      createdAtMs: now,
    });

    addedDocs += 1;
    addedQuestions += candidate.size;
  }

  return { addedDocs, addedQuestions, skippedDuplicates, upgradedDuplicates, addedPoolDocs };
}

export async function getPoolStock(uid, options = {}) {
  const targetLevel = options?.targetLevel ? normalizeLevel(options.targetLevel, "gold") : "";
  const out = {
    part1: 0,
    part2: 0,
    part3: 0,
    part4: 0,
    part5: 0,
    part6: 0,
    part7: 0,
    mixed: 0,
    mixedListening: 0,
    docs: 0,
    targetLevel: targetLevel || null,
  };

  const migration = [];
  const snap = await getDocs(collection(db, "users", uid, "question_pool"));
  snap.forEach((d) => {
    const data = d.data() || {};
    const size = Number(data.size || 0);
    const part = data.part;
    if (!PARTS.includes(part) || !size) return;

    const resolvedLevel = inferLevelFromPoolDoc(data, targetLevel || "gold");
    if (!data.level) {
      migration.push({ poolDocId: d.id, level: resolvedLevel });
    }

    if (targetLevel && resolvedLevel !== targetLevel) return;

    out[part] += size;
    out.docs += 1;
  });

  queueLevelMigration(uid, migration);

  out.mixed = out.part5 + out.part6 + out.part7;
  out.mixedListening = out.part1 + out.part2 + out.part3 + out.part4;
  return out;
}

export async function dequeueFromPoolFIFO(uid, part, maxQuestions, sessionId, options = {}) {
  const normalizedPart = String(part || "").toLowerCase();
  if (!PARTS.includes(normalizedPart)) throw new Error(`Unsupported part: ${part}`);

  const target = Math.max(0, Number(maxQuestions || 0));
  const targetLevel = options?.targetLevel ? normalizeLevel(options.targetLevel, "gold") : "";
  if (target === 0) return { docs: [], questionCount: 0, questions: [] };

  const q = query(
    collection(db, "users", uid, "question_pool"),
    where("part", "==", normalizedPart),
    limit(300),
  );

  const snap = await getDocs(q);
  const sortedDocs = [...snap.docs].sort((a, b) => {
    const da = a.data() || {};
    const dbb = b.data() || {};

    const msA = Number(da.createdAtMs || 0);
    const msB = Number(dbb.createdAtMs || 0);
    if (msA !== msB) return msA - msB;

    const tsA = Number(da?.createdAt?.seconds || 0);
    const tsB = Number(dbb?.createdAt?.seconds || 0);
    if (tsA !== tsB) return tsA - tsB;

    return String(a.id).localeCompare(String(b.id));
  });

  const picked = [];
  let pickedCount = 0;
  const migration = [];

  for (const d of sortedDocs) {
    const data = d.data() || {};
    const size = Number(data.size || 0);
    if (!size) continue;

    const resolvedLevel = inferLevelFromPoolDoc(data, targetLevel || "gold");
    if (!data.level) {
      migration.push({ poolDocId: d.id, level: resolvedLevel });
    }

    if (targetLevel && resolvedLevel !== targetLevel) {
      continue;
    }

    if (pickedCount + size > target) {
      break;
    }

    picked.push({
      poolDocId: d.id,
      part: data.part,
      kind: data.kind,
      level: resolvedLevel,
      hashId: data.hashId,
      size,
      payload: data.payload,
      source: data.source || "",
      generatorModel: data.generatorModel || "",
      createdAt: data.createdAt || null,
      createdAtMs: data.createdAtMs || null,
      attemptSessionId: sessionId,
    });
    pickedCount += size;
    if (pickedCount >= target) break;
  }

  queueLevelMigration(uid, migration);

  const questions = picked.flatMap(flattenPayloadToQuestions);
  return { docs: picked, questionCount: pickedCount, questions };
}

export async function archiveConsumedPool(uid, consumedDocs, sessionId) {
  const list = Array.isArray(consumedDocs) ? consumedDocs : [];
  if (!list.length) return { archivedDocs: 0, archivedQuestions: 0 };

  const batch = writeBatch(db);
  let archivedQuestions = 0;

  for (const item of list) {
    const historyRef = doc(collection(db, "users", uid, "pool_history"));
    batch.set(historyRef, {
      poolDocId: item.poolDocId,
      hashId: item.hashId,
      part: item.part,
      kind: item.kind,
      level: item.level || "",
      size: item.size,
      payload: item.payload,
      source: item.source || "",
      generatorModel: item.generatorModel || "",
      consumedAt: serverTimestamp(),
      consumedAtMs: Date.now(),
      attemptSessionId: sessionId || item.attemptSessionId || "",
    });

    const poolRef = doc(db, "users", uid, "question_pool", item.poolDocId);
    batch.delete(poolRef);
    archivedQuestions += Number(item.size || 0);
  }

  await batch.commit();
  return { archivedDocs: list.length, archivedQuestions };
}

export async function seedQuestionPoolFromLocal(uid, localByPart, options = {}) {
  const currentTargetLevel = normalizeLevel(options?.currentTargetLevel || options?.level, "gold");

  const part5 = await appendToQuestionPool(uid, "part5", localByPart.part5 || [], {
    source: "seed",
    level: currentTargetLevel,
    currentTargetLevel,
  });
  const part6 = await appendToQuestionPool(uid, "part6", localByPart.part6 || [], {
    source: "seed",
    level: currentTargetLevel,
    currentTargetLevel,
  });
  const part7 = await appendToQuestionPool(uid, "part7", localByPart.part7 || [], {
    source: "seed",
    level: currentTargetLevel,
    currentTargetLevel,
  });

  return {
    part5,
    part6,
    part7,
    addedQuestions: part5.addedQuestions + part6.addedQuestions + part7.addedQuestions,
  };
}
