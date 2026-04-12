function pickEnglishVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  return voices.find((v) => /^en[-_]/i.test(v.lang) && /google|samantha|aria|microsoft/i.test(v.name))
    || voices.find((v) => /^en[-_]/i.test(v.lang))
    || null;
}

export function speakEnglishWord(text, opts = {}) {
  const word = String(text || "").trim();
  if (!word) return { ok: false, message: "沒有可播放的單字。" };

  if (!("speechSynthesis" in window)) {
    return { ok: false, message: "此瀏覽器不支援語音發音。" };
  }

  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = opts.lang || "en-US";
  utter.rate = Number.isFinite(opts.rate) ? opts.rate : 0.95;
  utter.pitch = Number.isFinite(opts.pitch) ? opts.pitch : 1;

  const voice = pickEnglishVoice();
  if (voice) utter.voice = voice;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
  return { ok: true, message: "" };
}
