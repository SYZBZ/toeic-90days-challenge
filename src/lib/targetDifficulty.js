export const TARGET_LEVELS = ["green", "blue", "gold"];
export const TARGET_SCORES = [470, 730, 860];

export const TARGET_LEVEL_CONFIG = {
  green: {
    score: 470,
    label: "綠證 470+",
    promptInject: "題目難度為中階與基礎。單字以日常與基礎辦公室詞彙為主。文法著重於基本八大詞性、單純時態與基礎主動被動語態。句子長度適中，避免過度複雜的子句，旨在建立作答自信。",
  },
  blue: {
    score: 730,
    label: "藍證 730+",
    promptInject: "題目難度為中高階。著重於標準職場情境與多益常考同義詞替換 (Paraphrasing)。文法需測驗時態對比、關係子句與介系詞搭配。陷阱選項需包含常見的詞性混淆與時態錯誤。",
  },
  gold: {
    score: 860,
    label: "金證 860+",
    promptInject: "題目難度為最高階。單字需包含進階商務詞彙與冷僻字義。文法需測驗複雜句型（如倒裝句、分詞構句、假設語氣）。陷阱選項 (Distractors) 必須極具迷惑性，需完全理解整句語意才能作答，嚴禁僅靠空格前後單字就能猜出的無腦題。",
  },
};

export function normalizeTargetLevel(value, fallback = "gold") {
  const raw = String(value || "").trim().toLowerCase();
  if (TARGET_LEVELS.includes(raw)) return raw;
  return TARGET_LEVELS.includes(fallback) ? fallback : "gold";
}

export function normalizeTargetScore(value, fallback = 860) {
  const n = Number(value);
  if (TARGET_SCORES.includes(n)) return n;
  return TARGET_SCORES.includes(fallback) ? fallback : 860;
}

export function targetLevelFromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "gold";
  if (n >= 860) return "gold";
  if (n >= 730) return "blue";
  return "green";
}

export function targetScoreFromLevel(level) {
  const lv = normalizeTargetLevel(level);
  return TARGET_LEVEL_CONFIG[lv].score;
}

export function inferTargetFromLegacyLevel(levelValue) {
  const raw = String(levelValue || "").trim().toLowerCase();
  if (!raw) return { targetScore: 860, targetLevel: "gold" };

  if (raw.includes("gold") || raw.includes("850") || raw.includes("860")) {
    return { targetScore: 860, targetLevel: "gold" };
  }

  if (raw.includes("blue") || raw.includes("730")) {
    return { targetScore: 730, targetLevel: "blue" };
  }

  if (raw.includes("green") || raw.includes("470")) {
    return { targetScore: 470, targetLevel: "green" };
  }

  const numMatch = raw.match(/\d+/);
  if (numMatch) {
    const n = Number(numMatch[0]);
    const targetLevel = targetLevelFromScore(n);
    return { targetScore: targetScoreFromLevel(targetLevel), targetLevel };
  }

  return { targetScore: 860, targetLevel: "gold" };
}

export function normalizeTargetSettings(settings = {}) {
  const hasScore = TARGET_SCORES.includes(Number(settings?.targetScore));
  const rawLevel = String(settings?.targetLevel || "").trim().toLowerCase();
  const hasLevel = TARGET_LEVELS.includes(rawLevel);

  if (hasScore) {
    const targetScore = Number(settings.targetScore);
    return { targetScore, targetLevel: targetLevelFromScore(targetScore) };
  }

  if (hasLevel) {
    const targetLevel = normalizeTargetLevel(rawLevel);
    return { targetScore: targetScoreFromLevel(targetLevel), targetLevel };
  }

  return inferTargetFromLegacyLevel(settings?.level);
}

export function getPromptInjectByLevel(level) {
  const lv = normalizeTargetLevel(level);
  return TARGET_LEVEL_CONFIG[lv].promptInject;
}

export function getTargetLabel(level) {
  const lv = normalizeTargetLevel(level);
  return TARGET_LEVEL_CONFIG[lv].label;
}
