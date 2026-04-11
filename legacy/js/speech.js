// speech.js — 封裝瀏覽器 Web Speech API 發音

const Speech = (() => {
  let voices = [];

  function loadVoices() {
    voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function pickEnglishVoice() {
    if (!voices.length) loadVoices();
    // 優先選美式英文
    return voices.find(v => /en.?US/i.test(v.lang))
        || voices.find(v => /^en/i.test(v.lang))
        || null;
  }

  function say(text, opts = {}) {
    if (!window.speechSynthesis) {
      console.warn('speechSynthesis not available');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickEnglishVoice();
    if (v) u.voice = v;
    u.lang = 'en-US';
    u.rate = opts.rate || 0.95;
    u.pitch = opts.pitch || 1;
    window.speechSynthesis.speak(u);
  }

  return { say };
})();

window.Speech = Speech;
