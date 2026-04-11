import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function mistakeDocId(questionText = "", optionText = "") {
  const seed = `${questionText}::${optionText}`;
  return btoa(unescape(encodeURIComponent(seed))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 64) || `m_${Date.now()}`;
}

export async function ensureUserProfile(uid, email) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: email || "",
      geminiApiKey: "",
      settings: { level: "850+", part: "part5" },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, { email: email || snap.data()?.email || "", updatedAt: serverTimestamp() }, { merge: true });
  }
}

export async function loadUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function saveUserKey(uid, geminiApiKey) {
  await setDoc(doc(db, "users", uid), { geminiApiKey, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveHistory(uid, record) {
  const ref = collection(db, "users", uid, "history");
  await addDoc(ref, {
    ...record,
    createdAt: serverTimestamp(),
  });
}

export async function upsertMistake(uid, record) {
  const id = record.id || mistakeDocId(record.question || "", String(record.correctAnswer ?? ""));
  await setDoc(doc(db, "users", uid, "mistakes", id), {
    ...record,
    updatedAt: serverTimestamp(),
    count: (record.count || 0) + 1,
  }, { merge: true });
}

export async function removeMistake(uid, id) {
  if (!id) return;
  await setDoc(doc(db, "users", uid, "mistakes", id), { resolvedAt: serverTimestamp(), resolved: true }, { merge: true });
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
      updatedAt: null,
    };

    const practiceDate = delta.practiceDate || todayIso();
    const prevDate = old.lastStudyDate;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streakDays = prevDate === practiceDate ? old.streakDays : (prevDate === yesterday ? old.streakDays + 1 : 1);

    tx.set(ref, {
      totalAnswered: (old.totalAnswered || 0) + (delta.answered || 0),
      totalCorrect: (old.totalCorrect || 0) + (delta.correct || 0),
      streakDays,
      lastStudyDate: practiceDate,
      dayProgress: delta.dayProgress ?? old.dayProgress ?? 0,
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

export async function fetchMistakes(uid, size = 50) {
  const q = query(collection(db, "users", uid, "mistakes"), orderBy("updatedAt", "desc"), limit(size));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.resolved);
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

  for (const item of history.slice(-100)) {
    await saveHistory(uid, {
      mode: item.mode || item.part || "legacy",
      score: item.score || 0,
      total: item.total || 0,
      timeSpent: item.timeSpent || 0,
      source: "legacy-localStorage",
      questionCount: Array.isArray(item.questions) ? item.questions.length : 0,
    });
    importedHistory += 1;
  }

  for (const m of mistakes.slice(-200)) {
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
