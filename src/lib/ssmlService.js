const VOICE_MAP = {
  narrator_us_f: "en-US-Neural2-F",
  narrator_us_m: "en-US-Neural2-D",
  uk_f: "en-GB-Neural2-A",
  uk_m: "en-GB-Neural2-B",
  au_f: "en-AU-Neural2-A",
  au_m: "en-AU-Neural2-B",
};

function pickVoice(segment = {}, idx = 0) {
  const speaker = String(segment?.speaker || "").toLowerCase();
  const accent = String(segment?.accent || "").toLowerCase();
  const gender = String(segment?.gender || "").toLowerCase();

  if (accent === "uk") return gender === "male" ? VOICE_MAP.uk_m : VOICE_MAP.uk_f;
  if (accent === "au") return gender === "male" ? VOICE_MAP.au_m : VOICE_MAP.au_f;
  if (accent === "us") return gender === "male" ? VOICE_MAP.narrator_us_m : VOICE_MAP.narrator_us_f;

  if (speaker.includes("narrator")) return VOICE_MAP.narrator_us_f;
  if (speaker.includes("speaker_a") || speaker.includes("man") || speaker.includes("male")) {
    return idx % 2 === 0 ? VOICE_MAP.uk_m : VOICE_MAP.au_m;
  }
  if (speaker.includes("speaker_b") || speaker.includes("woman") || speaker.includes("female")) {
    return idx % 2 === 0 ? VOICE_MAP.au_f : VOICE_MAP.uk_f;
  }

  return idx % 2 === 0 ? VOICE_MAP.uk_f : VOICE_MAP.au_m;
}

function escapeXml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSsmlFromSegments(segments = []) {
  const lines = segments
    .filter((x) => x?.text)
    .map((seg, idx) => {
      const voice = pickVoice(seg, idx);
      return `<voice name="${voice}">${escapeXml(seg.text)}</voice><break time="450ms"/>`;
    });

  return `<speak>${lines.join("")}</speak>`;
}

export { VOICE_MAP };
