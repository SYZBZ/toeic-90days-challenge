import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeAiSettings, resolveAiSettings } from "./aiModels";
import {
  normalizeTargetLevel,
  normalizeTargetScore,
  normalizeTargetSettings,
  targetLevelFromScore,
} from "./targetDifficulty";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isoAfterDays(days = 1) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return 1;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const diff = Math.floor((end - start) / 86400000) + 1;
  return Math.max(1, diff);
}

function normalizeReminder(reminder = {}) {
  return {
    enabled: !!reminder?.enabled,
    time: typeof reminder?.time === "string" && reminder.time.match(/^\d{2}:\d{2}$/)
      ? reminder.time
      : "20:30",
  };
}

function normalizeExamSettings(exam = {}) {
  const rawFresh = Number(exam?.freshRate);
  const freshRate = Number.isFinite(rawFresh) ? Math.min(1, Math.max(0, rawFresh)) : 0.3;
  return { freshRate };
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function normalizeVocabPlan(vocabPlan = {}) {
  return {
    startDate: normalizeDateInput(vocabPlan?.startDate),
    examDate: normalizeDateInput(vocabPlan?.examDate),
  };
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeForFirestore(value) {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => {
      const next = sanitizeForFirestore(item);
      return next === undefined ? null : next;
    });
  }

  if (isPlainObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const next = sanitizeForFirestore(item);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }

  return value;
}

function normalizeUserSettings(settings = {}) {
  const target = normalizeTargetSettings(settings);
  const targetScore = normalizeTargetScore(target?.targetScore, 860);
  const targetLevel = targetLevelFromScore(targetScore);
  const legacyLevel = settings?.level || (
    targetLevel === "gold" ? "850+" : targetLevel === "blue" ? "730+" : "470+"
  );

  return {
    level: legacyLevel,
    targetScore,
    targetLevel: normalizeTargetLevel(targetLevel, "gold"),
    part: settings?.part || "part5",
    examPreset: settings?.examPreset || "10x5",
    exam: normalizeExamSettings(settings?.exam || {}),
    vocabPlan: normalizeVocabPlan(settings?.vocabPlan || {}),
    reminder: normalizeReminder(settings?.reminder || {}),
    ai: resolveAiSettings(settings),
  };
}

function mergeSettings(base = {}, patch = {}) {
  return normalizeUserSettings({
    ...base,
    ...patch,
    exam: {
      ...(base?.exam || {}),
      ...(patch?.exam || {}),
    },
    reminder: {
      ...(base?.reminder || {}),
      ...(patch?.reminder || {}),
    },
    vocabPlan: {
      ...(base?.vocabPlan || {}),
      ...(patch?.vocabPlan || {}),
    },
    ai: {
      ...(base?.ai || {}),
      ...(patch?.ai || {}),
    },
  });
}

function mistakeDocId(questionText = "", optionText = "") {
  const seed = `${questionText}::${optionText}`;
  try {
    return btoa(unescape(encodeURIComponent(seed))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 64) || `m_${Date.now()}`;
  } catch {
    return `m_${Date.now()}`;
  }
}

export async function ensureUserProfile(uid, email) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      email: email || "",
      geminiApiKey: "",
      settings: {
        level: "850+",
        targetScore: 860,
        targetLevel: "gold",
        part: "part5",
        examPreset: "10x5",
        exam: normalizeExamSettings(),
        vocabPlan: normalizeVocabPlan(),
        reminder: normalizeReminder(),
        ai: normalizeAiSettings(),
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const old = snap.data() || {};
  await setDoc(ref, {
    email: email || old.email || "",
    settings: normalizeUserSettings(old.settings),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    ...data,
    settings: normalizeUserSettings(data.settings),
  };
}

export async function saveUserKey(uid, geminiApiKey, aiSettings, extraSettings = {}) {
  const snap = await getDoc(doc(db, "users", uid));
  const oldSettings = snap.exists() ? snap.data()?.settings || {} : {};

  const mergedSettings = mergeSettings(oldSettings, {
    ...extraSettings,
    ai: aiSettings ? normalizeAiSettings(aiSettings) : resolveAiSettings(oldSettings),
  });

  await setDoc(doc(db, "users", uid), {
    geminiApiKey,
    settings: mergedSettings,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function saveUserSettings(uid, patchSettings = {}) {
  const snap = await getDoc(doc(db, "users", uid));
  const oldSettings = snap.exists() ? snap.data()?.settings || {} : {};
  const mergedSettings = mergeSettings(oldSettings, patchSettings);

  await setDoc(doc(db, "users", uid), {
    settings: mergedSettings,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function resolveTargetSettings(settings = {}) {
  const normalized = normalizeUserSettings(settings);
  return {
    targetScore: normalized.targetScore,
    targetLevel: normalized.targetLevel,
  };
}

export async function saveHistory(uid, record) {
  const ref = collection(db, "users", uid, "history");
  await addDoc(ref, sanitizeForFirestore({
    ...record,
    createdAt: serverTimestamp(),
  }));
}

export async function saveExamAttempt(uid, attempt) {
  const ref = collection(db, "users", uid, "examAttempts");
  const docRef = await addDoc(ref, sanitizeForFirestore({
    ...attempt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  await saveHistory(uid, {
    mode: attempt.mode,
    score: attempt.score,
    total: attempt.total,
    accuracy: attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0,
    timeSpentSec: attempt.timeSpentSec,
    attemptId: docRef.id,
    meta: attempt.meta || {},
  });

  return docRef.id;
}

export async function fetchExamAttempts(uid, size = 20) {
  const q = query(collection(db, "users", uid, "examAttempts"), orderBy("createdAt", "desc"), limit(size));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchExamAttempt(uid, attemptId) {
  const snap = await getDoc(doc(db, "users", uid, "examAttempts", attemptId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function deleteExamAttempt(uid, attemptId) {
  if (!uid || !attemptId) return { deleted: false };

  const attemptRef = doc(db, "users", uid, "examAttempts", attemptId);
  const attemptSnap = await getDoc(attemptRef);
  if (!attemptSnap.exists()) return { deleted: false };

  const attemptData = attemptSnap.data() || {};
  const score = Number(attemptData.score || 0);
  const total = Number(attemptData.total || 0);

  const [historySnap, mistakeSnap] = await Promise.all([
    getDocs(query(collection(db, "users", uid, "history"), where("attemptId", "==", attemptId))),
    getDocs(query(collection(db, "users", uid, "mistakes"), where("reviewedFromAttemptId", "==", attemptId))),
  ]);

  const batch = writeBatch(db);
  batch.delete(attemptRef);
  historySnap.forEach((item) => batch.delete(item.ref));
  mistakeSnap.forEach((item) => batch.delete(item.ref));
  await batch.commit();

  const summaryRef = doc(db, "users", uid, "stats", "summary");
  await runTransaction(db, async (tx) => {
    const summarySnap = await tx.get(summaryRef);
    if (!summarySnap.exists()) return;
    const old = summarySnap.data() || {};
    tx.set(summaryRef, {
      totalAnswered: Math.max(0, Number(old.totalAnswered || 0) - total),
      totalCorrect: Math.max(0, Number(old.totalCorrect || 0) - score),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  return {
    deleted: true,
    removedHistory: historySnap.size,
    removedMistakes: mistakeSnap.size,
  };
}

export async function upsertMistake(uid, record) {
  const id = record.id || mistakeDocId(record.question || "", String(record.correctAnswer ?? ""));
  await setDoc(doc(db, "users", uid, "mistakes", id), sanitizeForFirestore({
    ...record,
    count: (record.count || 0) + 1,
    resolved: false,
    updatedAt: serverTimestamp(),
  }), { merge: true });
}

export async function removeMistake(uid, id) {
  if (!id) return;
  await setDoc(doc(db, "users", uid, "mistakes", id), {
    resolvedAt: serverTimestamp(),
    resolved: true,
  }, { merge: true });
}

export async function fetchMistakes(uid, size = 80) {
  const q = query(collection(db, "users", uid, "mistakes"), orderBy("updatedAt", "desc"), limit(size));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.resolved);
}

export async function setBookmark(uid, word) {
  if (!word?.id) return;
  await setDoc(doc(db, "users", uid, "bookmarks", word.id), {
    wordId: word.id,
    word: word.word || "",
    translation: word.translation || "",
    source: Array.isArray(word.source) ? word.source : [],
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function removeBookmark(uid, wordId) {
  if (!wordId) return;
  await deleteDoc(doc(db, "users", uid, "bookmarks", wordId));
}

export async function fetchBookmarks(uid, size = 3000) {
  const q = query(collection(db, "users", uid, "bookmarks"), orderBy("updatedAt", "desc"), limit(size));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchBookmarkIds(uid) {
  const items = await fetchBookmarks(uid);
  return new Set(items.map((x) => x.wordId || x.id));
}

export async function reviewSrsWord(uid, word, grade = 1) {
  if (!word?.id) return;
  const ref = doc(db, "users", uid, "srs", word.id);

  let masteredDelta = 0;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const old = snap.exists() ? snap.data() : {
      wordId: word.id,
      word: word.word || "",
      translation: word.translation || "",
      correctCount: 0,
      wrongCount: 0,
      intervalDays: 1,
      mastered: false,
    };

    const correctCount = old.correctCount + (grade > 0 ? 1 : 0);
    const wrongCount = old.wrongCount + (grade <= 0 ? 1 : 0);

    let intervalDays = old.intervalDays || 1;
    if (grade <= 0) intervalDays = 1;
    else if (grade === 1) intervalDays = Math.min(30, Math.max(1, Math.round(intervalDays * 2)));
    else intervalDays = Math.min(60, Math.max(2, Math.round(intervalDays * 2 + 1)));

    const mastered = correctCount >= 3;
    if (!old.mastered && mastered) masteredDelta = 1;

    tx.set(ref, {
      wordId: word.id,
      word: word.word || old.word || "",
      translation: word.translation || old.translation || "",
      source: Array.isArray(word.source) ? word.source : (old.source || []),
      correctCount,
      wrongCount,
      intervalDays,
      mastered,
      nextReviewAt: isoAfterDays(intervalDays),
      lastReviewedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  if (masteredDelta > 0) {
    await updateSummary(uid, { masteredDelta, dayProgress: 1 });
  }
}

export async function fetchSrsItems(uid, size = 1000) {
  const q = query(collection(db, "users", uid, "srs"), orderBy("updatedAt", "desc"), limit(size));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchSrsDue(uid, size = 60) {
  const all = await fetchSrsItems(uid, Math.max(size * 5, 200));
  const now = Date.now();
  return all
    .filter((x) => !x.nextReviewAt || new Date(x.nextReviewAt).getTime() <= now)
    .slice(0, size);
}

export async function updateSummary(uid, delta) {
  const ref = doc(db, "users", uid, "stats", "summary");
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const old = snap.exists() ? snap.data() : {
      totalAnswered: 0,
      totalCorrect: 0,
      streakDays: 0,
      lastStudyDate: null,
      dayProgress: 0,
      masteredWords: 0,
      dayX: 1,
      startDate: null,
      updatedAt: null,
    };

    const practiceDate = delta.practiceDate || todayIso();
    const prevDate = old.lastStudyDate;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streakDays = prevDate === practiceDate ? old.streakDays : (prevDate === yesterday ? old.streakDays + 1 : 1);

    const startDate = old.startDate || practiceDate;
    const dayX = Math.min(90, daysBetween(startDate, practiceDate));

    tx.set(ref, {
      totalAnswered: (old.totalAnswered || 0) + (delta.answered || 0),
      totalCorrect: (old.totalCorrect || 0) + (delta.correct || 0),
      streakDays,
      lastStudyDate: practiceDate,
      dayProgress: (old.dayProgress || 0) + (delta.dayProgress || 0),
      masteredWords: Math.max(0, (old.masteredWords || 0) + (delta.masteredDelta || 0)),
      dayX,
      startDate,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export async function fetchSummary(uid) {
  const snap = await getDoc(doc(db, "users", uid, "stats", "summary"));
  return snap.exists() ? snap.data() : null;
}

export async function fetchRecentHistory(uid, size = 20) {
  const q = query(collection(db, "users", uid, "history"), orderBy("createdAt", "desc"), limit(size));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function importLegacyLocalData(uid) {
  const historyRaw = localStorage.getItem("toeic.examHistory");
  const mistakesRaw = localStorage.getItem("toeic.mistakes");
  const statsRaw = localStorage.getItem("toeic.stats");

  const history = historyRaw ? JSON.parse(historyRaw) : [];
  const mistakes = mistakesRaw ? JSON.parse(mistakesRaw) : [];
  const stats = statsRaw ? JSON.parse(statsRaw) : null;

  let importedHistory = 0;
  let importedMistakes = 0;

  for (const item of history.slice(-50)) {
    await saveHistory(uid, {
      mode: item.mode || item.part || "legacy",
      score: item.score || 0,
      total: item.total || 0,
      timeSpentSec: item.timeSpent || 0,
      source: "legacy-localStorage",
    });
    importedHistory += 1;
  }

  for (const m of mistakes.slice(-150)) {
    await upsertMistake(uid, {
      id: m.questionId || undefined,
      questionId: m.questionId || "legacy",
      question: m.question || "Legacy mistake",
      yourAnswer: m.yourAnswer || "",
      correctAnswer: m.correctAnswer || "",
      source: "legacy-localStorage",
      count: 0,
    });
    importedMistakes += 1;
  }

  if (stats) {
    await setDoc(doc(db, "users", uid, "stats", "summary"), {
      totalAnswered: stats.totalAnswered || stats.totalLearned || 0,
      totalCorrect: stats.totalCorrect || 0,
      streakDays: stats.streak || 0,
      lastStudyDate: stats.lastStudyDate || null,
      dayProgress: stats.todayNewCount || 0,
      updatedAt: serverTimestamp(),
      importedFromLegacyAt: serverTimestamp(),
    }, { merge: true });
  }

  return { importedHistory, importedMistakes, hadStats: !!stats };
}
