import { useEffect, useRef, useState } from "react";

class AudioManager {
  constructor() {
    this.audio = null;
    this.objectUrl = null;
  }

  ensure() {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
    }
    return this.audio;
  }

  clearObjectUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  stopAll() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.src = "";
    this.audio.load();
    this.clearObjectUrl();
  }

  dispose() {
    this.stopAll();
  }

  async playUrl(url) {
    const audio = this.ensure();
    this.stopAll();
    audio.src = url;
    await audio.play();
    return audio;
  }

  async playBlob(blob) {
    const audio = this.ensure();
    this.stopAll();
    const objectUrl = URL.createObjectURL(blob);
    this.objectUrl = objectUrl;
    audio.src = objectUrl;
    await audio.play();
    return audio;
  }

  pause() {
    if (!this.audio) return;
    this.audio.pause();
  }

  getCurrentTime() {
    return this.audio ? this.audio.currentTime : 0;
  }

  getDuration() {
    return this.audio ? this.audio.duration || 0 : 0;
  }

  onEnded(handler) {
    const audio = this.ensure();
    audio.onended = handler || null;
  }

  onTimeUpdate(handler) {
    const audio = this.ensure();
    audio.ontimeupdate = handler || null;
  }
}

export const audioManager = new AudioManager();

export function useAudioCleanupOnUnmount() {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audioManager.dispose();
    };
  }, []);

  return mountedRef;
}

export function useAudioProgress() {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    audioManager.onTimeUpdate(() => {
      setCurrentTime(audioManager.getCurrentTime());
      setDuration(audioManager.getDuration());
    });

    return () => {
      audioManager.onTimeUpdate(null);
    };
  }, []);

  return { currentTime, duration };
}
