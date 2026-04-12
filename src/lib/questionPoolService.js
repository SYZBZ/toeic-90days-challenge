import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

const PARTS = ["part5", "part6", "part7"];

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

function normalizeQuestionForPool(raw = {}, part) {
  return {
    id: raw.id || `${part}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    type: raw.type || part,
    question: String(raw.question || "").trim(),
    options: Array.isArray(raw.options) ? raw.options.map((x) => String(x || "").trim()) : [],
    answer: Number(raw.answer),
    explanation: String(raw.explanation || raw.explanationZh || ""),
    question_zh: String(raw.question_zh || raw.questionZh || ""),
    options_zh: Array.isArray(raw.options_zh) ? raw.options_zh : (Array.isArray(raw.optionsZh) ? raw.optionsZh : []),
    passage: String(raw.passage || ""),
    passage_zh: String(raw.passage_zh || raw.passageZh || ""),
  };
}

function toPassageGroups(part, docs = []) {
  if (part === "part5") {
    return docs
      .map((raw) => normalizeQuestionForPool(raw, part))
      .filter((q) => q.question && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3)
      .map((q) => ({
        part,
        kind: "single",
        size: 1,
        payload: {
          question: q.question,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation,
          question_zh: q.question_zh,
          options_zh: q.options_zh,
          id: q.id,
          type: part,
        },
      }));
  }

  const grouped = new Map();

  for (const raw of docs) {
    if (raw?.kind === "passage_group" && raw?.payload?.questions?.length) {
      const key = String(raw.payload.passage || "").trim() || `group_${Math.random().toString(36).slice(2, 8)}`;
      grouped.set(key, {
        passage: String(raw.payload.passage || ""),
        passage_zh: String(raw.payload.passage_zh || ""),
        questions: raw.payload.questions.map((q) => normalizeQuestionForPool(q, part)),
      });
      continue;
    }

    const q = normalizeQuestionForPool(raw, part);
    if (!q.question || q.options.length !== 4 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) continue;

    const key = q.passage || `nogroup_${q.id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        passage: q.passage || "",
        passage_zh: q.passage_zh || "",
        questions: [],
      });
    }

    grouped.get(key).questions.push(q);
  }

  const out = [];
  for (const group of grouped.values()) {
    if (!group.questions.length) continue;
    out.push({
      part,
      kind: "passage_group",
      size: group.questions.length,
      payload: {
        passage: group.passage,
        passage_zh: group.passage_zh,
        questions: group.questions.map((q) => ({
          id: q.id,
          type: part,
          question: q.question,
          options: q.options,
          answer: q.answer,
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
    const seed = stableStringify({
      part: poolDoc.part,
      question: payload.question,
      options: payload.options,
      answer: payload.answer,
    });
    return fnv1aHash(seed);
  }

  const payload = poolDoc.payload || {};
  const seed = stableStringify({
    part: poolDoc.part,
    passage: payload.passage,
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
  if (poolDoc.kind === "single") {
    return [{
      ...poolDoc.payload,
      type: poolDoc.part,
      passage: "",
      passage_zh: "",
    }];
  }

  const payload = poolDoc.payload || {};
  const passage = payload.passage || "";
  const passageZh = payload.passage_zh || "";
  return (payload.questions || []).map((q) => ({
    ...q,
    type: poolDoc.part,
    passage,
    passage_zh: passageZh,
  }));
}

export async function appendToQuestionPool(uid, part, docs, meta = {}) {
  const normalizedPart = String(part || "").toLowerCase();
  if (!PARTS.includes(normalizedPart)) throw new Error(`Unsupported part: ${part}`);

  const groupedDocs = toPassageGroups(normalizedPart, docs);
  if (!groupedDocs.length) {
    return { addedDocs: 0, addedQuestions: 0, skippedDuplicates: 0 };
  }

  let addedDocs = 0;
  let addedQuestions = 0;
  let skippedDuplicates = 0;

  for (const candidate of groupedDocs) {
    const hashId = hashForDoc(candidate);
    const ref = poolDocRef(uid, normalizedPart, hashId);
    const exists = await getDoc(ref);
    if (exists.exists()) {
      skippedDuplicates += 1;
      continue;
    }

    const now = Date.now();
    await setDoc(ref, {
      part: normalizedPart,
      kind: candidate.kind,
      hashId,
      size: candidate.size,
      payload: candidate.payload,
      source: meta.source || "api",
      generatorModel: meta.generatorModel || "",
      createdAt: serverTimestamp(),
      createdAtMs: now,
    });

    addedDocs += 1;
    addedQuestions += candidate.size;
  }

  return { addedDocs, addedQuestions, skippedDuplicates };
}

export async function getPoolStock(uid) {
  const out = { part5: 0, part6: 0, part7: 0, mixed: 0, docs: 0 };

  const snap = await getDocs(collection(db, "users", uid, "question_pool"));
  snap.forEach((d) => {
    const data = d.data() || {};
    const size = Number(data.size || 0);
    const part = data.part;
    if (PARTS.includes(part)) {
      out[part] += size;
      out.docs += 1;
    }
  });

  out.mixed = out.part5 + out.part6 + out.part7;
  return out;
}

export async function dequeueFromPoolFIFO(uid, part, maxQuestions, sessionId) {
  const normalizedPart = String(part || "").toLowerCase();
  if (!PARTS.includes(normalizedPart)) throw new Error(`Unsupported part: ${part}`);

  const target = Math.max(0, Number(maxQuestions || 0));
  if (target === 0) return { docs: [], questionCount: 0, questions: [] };

  const q = query(
    collection(db, "users", uid, "question_pool"),
    where("part", "==", normalizedPart),
    orderBy("createdAt", "asc"),
    limit(200),
  );

  const snap = await getDocs(q);
  const picked = [];
  let pickedCount = 0;

  for (const d of snap.docs) {
    const data = d.data() || {};
    const size = Number(data.size || 0);
    if (!size) continue;

    if (pickedCount + size > target) {
      break;
    }

    picked.push({
      poolDocId: d.id,
      part: data.part,
      kind: data.kind,
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

export async function seedQuestionPoolFromLocal(uid, localByPart) {
  const part5 = await appendToQuestionPool(uid, "part5", localByPart.part5 || [], { source: "seed" });
  const part6 = await appendToQuestionPool(uid, "part6", localByPart.part6 || [], { source: "seed" });
  const part7 = await appendToQuestionPool(uid, "part7", localByPart.part7 || [], { source: "seed" });

  return {
    part5,
    part6,
    part7,
    addedQuestions: part5.addedQuestions + part6.addedQuestions + part7.addedQuestions,
  };
}
