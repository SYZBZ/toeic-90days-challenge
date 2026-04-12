const dataCache = new Map();

async function loadJson(name) {
  if (dataCache.has(name)) return dataCache.get(name);

  const url = `${import.meta.env.BASE_URL}data/${name}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`載入資料失敗：${name}`);
  }
  const json = await res.json();
  dataCache.set(name, json);
  return json;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function loadVocabulary() {
  const data = await loadJson("vocabulary.json");
  return Array.isArray(data?.words) ? data.words : [];
}

export async function loadGrammar() {
  const data = await loadJson("grammar.json");
  return Array.isArray(data?.units) ? data.units : [];
}

export async function loadQuestionPart(part = 5) {
  const data = await loadJson(`questions-part${part}.json`);
  return Array.isArray(data?.questions) ? data.questions : [];
}

export function sampleQuestions(list = [], count = 10) {
  return shuffle(list).slice(0, Math.min(count, list.length));
}

export function sampleByPassage(list = [], count = 10) {
  if (!list.length) return [];

  const groups = new Map();
  for (const item of list) {
    const key = item.passage || item.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const keys = shuffle([...groups.keys()]);
  const out = [];
  for (const key of keys) {
    out.push(...groups.get(key));
    if (out.length >= count) break;
  }

  return out.slice(0, count);
}
