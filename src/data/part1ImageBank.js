import bank from "./part1ImageBank.json";

function assetUrl(publicSrc) {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = String(publicSrc || "").replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
}

function scoreImage(item, usedIds) {
  return usedIds.has(item.id) ? 1 : 0;
}

export const part1ImageBank = bank.map((item) => ({
  ...item,
  imageUrl: assetUrl(item.publicSrc),
}));

export function pickPart1Images(count, usedIds = new Set()) {
  const safeCount = Math.max(1, Number(count || 1));
  const sorted = [...part1ImageBank].sort((a, b) => {
    const usedDelta = scoreImage(a, usedIds) - scoreImage(b, usedIds);
    if (usedDelta !== 0) return usedDelta;
    return a.id.localeCompare(b.id);
  });

  const picked = [];
  for (let i = 0; i < safeCount; i += 1) {
    picked.push(sorted[i % sorted.length]);
  }
  return picked;
}

export function getPart1ImageById(id) {
  return part1ImageBank.find((item) => item.id === id) || null;
}
