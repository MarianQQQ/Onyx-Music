import { Track } from "../models/track";

export type PlaybackCallback = {
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onEnded: () => void;
  onLoading: (isLoading: boolean) => void;
  onError: (error: string) => void;
  onTrackChange?: () => void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AudioEngine {
  private audioA: HTMLAudioElement;
  private audioB: HTMLAudioElement;
  private activeSlot: "A" | "B" = "A";
  private masterVolume: number = 0.8;
  private isMuted: boolean = false;
  private playbackRate: number = 1.0;
  private crossfadeDuration: number = 4; // seconds
  private callbacks: PlaybackCallback;
  private preloadedTrackId: string | null = null;
  private preloadedUrl: string | null = null;
  private pendingPreload: { trackId: string; url: string } | null = null;
  private isCrossfading: boolean = false;
  private fadeInterval: number | null = null;
  private intervalId: number | null = null;
  private rafId: number | null = null;
  private seekId = 0;
  private pauseToken = 0;
  private switchToken = 0;

  // Web Audio API graph (lazily initialized on user gesture, keeps WASAPI stream open!)
  private audioCtx: AudioContext | null = null;
  private sourceA: MediaElementAudioSourceNode | null = null;
  private sourceB: MediaElementAudioSourceNode | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;
  private gainMaster: GainNode | null = null;
  private filterBass: BiquadFilterNode | null = null;
  private filterMid: BiquadFilterNode | null = null;
  private filterTreble: BiquadFilterNode | null = null;

  private eqBass: number = 0;
  private eqMid: number = 0;
  private eqTreble: number = 0;
  private eqEnabled: boolean = false;
  private eqConnected: boolean = false;

  constructor(callbacks: PlaybackCallback, initialVolume: number = 0.8) {
    this.callbacks = callbacks;
    this.masterVolume = initialVolume;
    this.audioA = new Audio();
    this.audioA.volume = initialVolume;
    this.audioB = new Audio();
    this.audioB.volume = 0;

    this.setupAudioListeners(this.audioA, "A");
    this.setupAudioListeners(this.audioB, "B");

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = (): void => {
    const audio = this.activeAudio;
    if (audio.paused) {
      this.stopTimeUpdateTick();
      return;
    }

    // Adjust interval: 1000ms if hidden, 250ms if visible
    this.startTimeUpdateTick();

    // When document.hidden becomes false: restore normal 250ms tick and immediately fire 1 tick to sync UI
    if (typeof document !== "undefined" && !document.hidden && isFinite(audio.currentTime)) {
      this.callbacks.onTimeUpdate(audio.currentTime, audio.duration || 0);
    }
  };

  private startTimeUpdateTick(): void {
    this.stopTimeUpdateTick();
    const intervalMs = typeof document !== "undefined" && document.hidden ? 1000 : 500;
    this.intervalId = window.setInterval(() => {
      const audio = this.activeAudio;
      if (!audio.paused && isFinite(audio.currentTime)) {
        this.callbacks.onTimeUpdate(audio.currentTime, audio.duration || 0);
      } else if (audio.paused) {
        this.stopTimeUpdateTick();
      }
    }, intervalMs);
  }

  private stopTimeUpdateTick(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public destroy(): void {
    this.stopTimeUpdateTick();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
    if (this.fadeInterval !== null) {
      clearTimeout(this.fadeInterval);
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    this.audioA.pause();
    this.audioB.pause();
    this.audioA.src = "";
    this.audioB.src = "";
  }

  private syncEqGraph(): void {
    if (!this.audioCtx || !this.gainA || !this.gainB || !this.gainMaster) return;

    if (this.eqEnabled) {
      if (!this.filterBass || !this.filterMid || !this.filterTreble) {
        // 3-band Equalizer (Bass 100Hz, Mid 1000Hz, Treble 8000Hz)
        this.filterBass = this.audioCtx.createBiquadFilter();
        this.filterBass.type = "lowshelf";
        this.filterBass.frequency.value = 100;
        this.filterBass.gain.value = this.eqBass;

        this.filterMid = this.audioCtx.createBiquadFilter();
        this.filterMid.type = "peaking";
        this.filterMid.frequency.value = 1000;
        this.filterMid.Q.value = 1.0;
        this.filterMid.gain.value = this.eqMid;

        this.filterTreble = this.audioCtx.createBiquadFilter();
        this.filterTreble.type = "highshelf";
        this.filterTreble.frequency.value = 8000;
        this.filterTreble.gain.value = this.eqTreble;

        this.filterBass.connect(this.filterMid);
        this.filterMid.connect(this.filterTreble);
        this.filterTreble.connect(this.gainMaster);
      }

      if (!this.eqConnected) {
        this.gainA.disconnect();
        this.gainB.disconnect();
        this.gainA.connect(this.filterBass);
        this.gainB.connect(this.filterBass);
        this.eqConnected = true;
      }

      const now = this.audioCtx.currentTime;
      this.filterBass.gain.setTargetAtTime(this.eqBass, now, 0.02);
      this.filterMid.gain.setTargetAtTime(this.eqMid, now, 0.02);
      this.filterTreble.gain.setTargetAtTime(this.eqTreble, now, 0.02);
    } else if (this.eqConnected) {
      this.gainA.disconnect();
      this.gainB.disconnect();
      this.gainA.connect(this.gainMaster);
      this.gainB.connect(this.gainMaster);
      this.eqConnected = false;
    }
  }

  private async ensureWebAudio(): Promise<void> {
    if (!this.audioCtx) {
      try {
        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;

        this.audioCtx = new AudioContextClass();

        this.gainMaster = this.audioCtx.createGain();
        this.gainMaster.gain.value = this.isMuted ? 0 : this.masterVolume;

        this.gainA = this.audioCtx.createGain();
        this.gainA.gain.value = this.activeSlot === "A" ? 1 : 0;

        this.gainB = this.audioCtx.createGain();
        this.gainB.gain.value = this.activeSlot === "B" ? 1 : 0;

        this.gainMaster.connect(this.audioCtx.destination);

        // Connect HTMLAudioElements (with crossOrigin="anonymous") into Web Audio graph
        this.sourceA = this.audioCtx.createMediaElementSource(this.audioA);
        this.sourceB = this.audioCtx.createMediaElementSource(this.audioB);
        this.sourceA.connect(this.gainA);
        this.sourceB.connect(this.gainB);

        if (this.eqEnabled) {
          this.syncEqGraph();
        } else {
          this.gainA.connect(this.gainMaster);
          this.gainB.connect(this.gainMaster);
        }

        // Keep HTMLAudioElements at unity volume so GainNodes control all envelopes at 48kHz
        this.audioA.volume = 1.0;
        this.audioB.volume = 1.0;
      } catch (e) {
        console.warn("Web Audio initialization failed:", e);
      }
    }

    if (this.audioCtx && this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        console.warn("AudioContext resume failed:", e);
      }
    }
  }

  private rampGainNode(node: GainNode | null, target: number, ms: number) {
    if (!this.audioCtx || !node) return;
    const now = this.audioCtx.currentTime;
    const cur = node.gain.value;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(cur, now);
    if (ms <= 0) {
      node.gain.setValueAtTime(target, now);
    } else {
      node.gain.linearRampToValueAtTime(target, now + ms / 1000);
    }
  }

  public get activeGainNode(): GainNode | null {
    return this.activeSlot === "A" ? this.gainA : this.gainB;
  }

  public get inactiveGainNode(): GainNode | null {
    return this.activeSlot === "A" ? this.gainB : this.gainA;
  }

  public isEqEnabled(): boolean {
    return this.eqEnabled;
  }

  public setEqualizer(bassGain: number, midGain: number, trebleGain: number) {
    this.eqBass = bassGain;
    this.eqMid = midGain;
    this.eqTreble = trebleGain;
    this.eqEnabled = bassGain !== 0 || midGain !== 0 || trebleGain !== 0;

    if (this.eqEnabled && !this.audioCtx) {
      void this.ensureWebAudio();
      return;
    }

    if (this.audioCtx) {
      this.syncEqGraph();
    }
  }

  public getEqualizer(): { bass: number; mid: number; treble: number } {
    return { bass: this.eqBass, mid: this.eqMid, treble: this.eqTreble };
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.25, Math.min(2.5, rate));
    this.audioA.playbackRate = this.playbackRate;
    this.audioB.playbackRate = this.playbackRate;
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  private setupAudioListeners(audio: HTMLAudioElement, slot: "A" | "B") {
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";

    let waitingTimeout: number | null = null;

    const clearWaiting = () => {
      if (waitingTimeout !== null) {
        clearTimeout(waitingTimeout);
        waitingTimeout = null;
      }
      if (this.activeSlot === slot) {
        this.callbacks.onLoading(false);
      }
    };

    const syncDuration = () => {
      if (this.activeSlot === slot && audio.duration && isFinite(audio.duration)) {
        this.callbacks.onTimeUpdate(audio.currentTime, audio.duration);
      }
    };

    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);

    audio.addEventListener("waiting", () => {
      if (this.activeSlot === slot && waitingTimeout === null) {
        waitingTimeout = window.setTimeout(() => {
          this.callbacks.onLoading(true);
        }, 800);
      }
    });

    audio.addEventListener("playing", () => {
      clearWaiting();
      if (this.activeSlot === slot) {
        this.startTimeUpdateTick();
      }
    });

    audio.addEventListener("pause", () => {
      clearWaiting();
      if (this.activeSlot === slot) {
        this.stopTimeUpdateTick();
      }
    });

    audio.addEventListener("canplay", clearWaiting);

    audio.addEventListener("ended", () => {
      clearWaiting();
      if (this.activeSlot === slot) {
        this.stopTimeUpdateTick();
        if (!this.isCrossfading) {
          this.callbacks.onEnded();
        }
      }
    });

    audio.addEventListener("error", () => {
      if (this.activeSlot === slot) {
        this.stopTimeUpdateTick();
        clearWaiting();
        const err = audio.error;
        if (!err || !audio.src || audio.src === window.location.href || audio.src === "") {
          return;
        }
        let msg = err
          ? `Audio error (${err.code}): ${err.message || "Failed to load audio source"}`
          : "Playback error: audio stream unreachable";
        if (err && err.code === 4) {
          msg = "Stream connection refused or audio engine is still initializing. Please retry in a moment.";
        }
        console.error(`Audio ${slot} error:`, err);
        this.callbacks.onLoading(false);
        this.callbacks.onError(msg);
      }
    });
  }

  public get activeAudio(): HTMLAudioElement {
    return this.activeSlot === "A" ? this.audioA : this.audioB;
  }

  public get inactiveAudio(): HTMLAudioElement {
    return this.activeSlot === "A" ? this.audioB : this.audioA;
  }

  public getCrossfading(): boolean {
    return this.isCrossfading;
  }

  public setVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    this.applyMasterVolume();
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.applyMasterVolume();
  }

  private applyMasterVolume(immediate: boolean = false) {
    const target = this.isMuted ? 0 : this.masterVolume;
    if (this.audioCtx && this.gainMaster) {
      this.rampGainNode(this.gainMaster, target, immediate ? 5 : 30);
    } else {
      this.audioA.volume = target;
      this.audioB.volume = target;
    }
  }

  public setCrossfadeDuration(seconds: number) {
    this.crossfadeDuration = Math.max(0, Math.min(15, seconds));
  }

  public getCrossfadeDuration(): number {
    return this.crossfadeDuration;
  }

  public async playStream(url: string, track: Track, crossfade: boolean = false) {
    this.callbacks.onLoading(true);

    ++this.seekId;
    ++this.pauseToken;
    const switchId = ++this.switchToken;

    if (this.fadeInterval !== null) {
      clearTimeout(this.fadeInterval);
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    this.pendingPreload = null;

    await this.ensureWebAudio();
    if (switchId !== this.switchToken) return;

    const oldSlot = this.activeSlot;
    const newSlot = oldSlot === "A" ? "B" : "A";
    const currentAud = oldSlot === "A" ? this.audioA : this.audioB;
    const otherAud = newSlot === "A" ? this.audioA : this.audioB;
    const currentGain = oldSlot === "A" ? this.gainA : this.gainB;
    const otherGain = newSlot === "A" ? this.gainA : this.gainB;

    const isCurrentPlaying = !currentAud.paused && currentAud.currentTime > 0;
    const isPreloadedInOther =
      (this.preloadedTrackId === track.id && !!otherAud.src) ||
      (otherAud.src === url && !!url);

    if (isCurrentPlaying || isPreloadedInOther) {
      const canCrossfade =
        crossfade &&
        this.crossfadeDuration > 0 &&
        isCurrentPlaying &&
        currentAud.duration > 0;

      this.isCrossfading = true;
      this.rampGainNode(otherGain, 0, 0);
      if (otherAud.src !== url) {
        otherAud.src = url;
      }
      otherAud.playbackRate = this.playbackRate;
      otherAud.currentTime = 0;
      this.activeSlot = newSlot;
      this.preloadedTrackId = null;
      this.preloadedUrl = null;

      try {
        await otherAud.play();
        if (switchId !== this.switchToken) return;
        this.updateMediaSession(track);
        this.callbacks.onLoading(false);

        // Wait 20ms for decoder warmup while new deck gain is still 0.0
        await sleep(20);
        if (switchId !== this.switchToken) return;

        if (canCrossfade) {
          const fadeDurationMs = Math.max(500, this.crossfadeDuration * 1000);
          this.rampGainNode(currentGain, 0, fadeDurationMs);
          this.rampGainNode(otherGain, 1, fadeDurationMs);
          this.fadeInterval = window.setTimeout(() => {
            if (switchId !== this.switchToken) return;
            currentAud.pause();
            currentAud.removeAttribute("src");
            currentAud.load();
            this.isCrossfading = false;
            this.fadeInterval = null;
            if (this.pendingPreload) {
              const { trackId, url: pendingUrl } = this.pendingPreload;
              this.pendingPreload = null;
              this.preloadNext(trackId, pendingUrl);
            }
          }, fadeDurationMs + 25);
        } else {
          this.rampGainNode(currentGain, 0, 45);
          this.rampGainNode(otherGain, 1, 45);
          await sleep(65);
          if (switchId !== this.switchToken) return;
          currentAud.pause();
          currentAud.removeAttribute("src");
          currentAud.load();
          this.isCrossfading = false;
          if (this.pendingPreload) {
            const { trackId, url: pendingUrl } = this.pendingPreload;
            this.pendingPreload = null;
            this.preloadNext(trackId, pendingUrl);
          }
        }
      } catch (err: any) {
        if (
          switchId !== this.switchToken ||
          err.name === "AbortError" ||
          err.message?.includes("interrupted")
        ) {
          return;
        }
        console.error("Deck switch play error:", err);
        this.stopTimeUpdateTick();
        this.rampGainNode(currentGain, 0, 0);
        currentAud.pause();
        currentAud.removeAttribute("src");
        currentAud.load();
        this.isCrossfading = false;
        this.callbacks.onLoading(false);
        this.callbacks.onError(err.message || "Failed to start playback");
      }
    } else {
      this.isCrossfading = false;
      if (otherAud.src) {
        this.rampGainNode(otherGain, 0, 0);
        otherAud.pause();
        otherAud.removeAttribute("src");
        otherAud.load();
      }
      this.preloadedTrackId = null;
      this.preloadedUrl = null;

      this.rampGainNode(currentGain, 0, 0);
      currentAud.src = url;
      currentAud.playbackRate = this.playbackRate;

      try {
        await currentAud.play();
        if (switchId !== this.switchToken) return;
        this.updateMediaSession(track);
        this.callbacks.onLoading(false);
        await sleep(25);
        if (switchId !== this.switchToken) return;
        this.rampGainNode(currentGain, 1, 40);
      } catch (err: any) {
        if (
          switchId !== this.switchToken ||
          err.name === "AbortError" ||
          err.message?.includes("interrupted")
        ) {
          return;
        }
        console.error("Play error:", err);
        this.stopTimeUpdateTick();
        this.callbacks.onLoading(false);
        this.callbacks.onError(err.message || "Failed to start playback");
      }
    }
  }

  public preloadNext(trackId: string, url: string) {
    if (!url) return;
    if (this.isCrossfading) {
      // Do NOT overwrite inactiveAudio while it is still fading out the previous track!
      this.pendingPreload = { trackId, url };
      return;
    }
    this.preloadedTrackId = trackId;
    this.preloadedUrl = url;
    const nextAudio = this.inactiveAudio;
    const nextGain = this.inactiveGainNode;
    if (nextAudio.src !== url) {
      this.rampGainNode(nextGain, 0, 0);
      nextAudio.src = url;
      nextAudio.preload = "auto";
      try {
        nextAudio.load();
      } catch (e) {
        console.warn("Preload load error:", e);
      }
    }
  }

  public getPreloaded(trackId: string): string | null {
    if (this.preloadedTrackId === trackId && this.preloadedUrl) {
      return this.preloadedUrl;
    }
    if (this.pendingPreload?.trackId === trackId && this.pendingPreload.url) {
      return this.pendingPreload.url;
    }
    return null;
  }

  public async pause() {
    this.stopTimeUpdateTick();
    const id = ++this.pauseToken;
    const el = this.activeAudio;
    if (!el.paused) {
      this.rampGainNode(this.activeGainNode, 0, 35);
      await sleep(45);
      if (id !== this.pauseToken) return;
      el.pause();
    }
    this.stopTimeUpdateTick();
  }

  public async resume() {
    const id = ++this.pauseToken;
    await this.ensureWebAudio();
    if (id !== this.pauseToken) return;
    const el = this.activeAudio;
    this.rampGainNode(this.activeGainNode, 0, 0);
    try {
      await el.play();
      if (id !== this.pauseToken) return;
      await sleep(25);
      if (id !== this.pauseToken) return;
      this.rampGainNode(this.activeGainNode, 1, 40);
      this.startTimeUpdateTick();
    } catch (err) {
      console.error(err);
      this.stopTimeUpdateTick();
    }
  }

  public async seek(seconds: number) {
    const el = this.activeAudio;
    if (!el.duration || !isFinite(el.duration)) return;
    const targetSec = Math.max(0, Math.min(seconds, el.duration));
    const id = ++this.seekId;
    const wasPlaying = !el.paused;

    if (wasPlaying) {
      this.rampGainNode(this.activeGainNode, 0, 35);
      await sleep(45);
      if (id !== this.seekId) return;
    }

    const seekedPromise = new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          el.removeEventListener("seeked", done);
          resolve();
        }
      };
      el.addEventListener("seeked", done, { once: true });
      setTimeout(done, 350); // Safety fallback
    });

    el.currentTime = targetSec;
    await seekedPromise;
    if (id !== this.seekId) return;

    // Immediately sync UI with new seek position
    this.callbacks.onTimeUpdate(el.currentTime, el.duration || 0);

    if (wasPlaying && !el.paused) {
      await sleep(25);
      if (id !== this.seekId) return;
      this.rampGainNode(this.activeGainNode, 1, 35);
      this.startTimeUpdateTick();
    } else if (!wasPlaying) {
      this.rampGainNode(this.activeGainNode, 1, 0);
      this.stopTimeUpdateTick();
    }
  }

  public updateMediaSession(track: Track) {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || "YouTube Music",
        artwork: track.thumbnail_url
          ? [
              {
                src: track.thumbnail_url,
                sizes: "512x512",
                type: "image/jpeg",
              },
            ]
          : [],
      });
    }
  }
}
