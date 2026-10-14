import { createSignal, createRoot, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Track, SyncedLyrics, Playlist, SavedPlaylist, ArtistProfile, ExploreFeed, SearchSuggestions, ChartsData, MoodCategoryData, MoodGenreItem, cleanTrack, UnifiedSearchResults, UserProfile } from "../models/track";
import { AudioEngine } from "../services/audioPlayer";
import { pluginManager, PluginContext, triggerPluginToast } from "../services/pluginManager";

function createPlayerStore() {
  const [currentTrack, setCurrentTrack] = createSignal<Track | null>(null);
  const [isPlaying, setIsPlaying] = createSignal<boolean>(false);
  const [currentTime, setCurrentTime] = createSignal<number>(0);
  const [duration, setDuration] = createSignal<number>(0);
  const initialVolume: number = (() => {
    try {
      const saved = localStorage.getItem("ytm_volume");
      if (saved !== null) {
        const num = Number(saved);
        if (!isNaN(num)) return Math.max(0, Math.min(1, num));
      }
    } catch {}
    return 0.8;
  })();
  const [volume, setVolume] = createSignal<number>(initialVolume);
  const initialVolumeStep: number = (() => {
    try {
      const saved = localStorage.getItem("ytm_volume_step");
      if (saved) {
        const num = Number(saved);
        if (!isNaN(num) && num >= 1 && num <= 20) return num;
      }
    } catch {}
    return 1;
  })();
  const [volumeStep, setVolumeStepSignal] = createSignal<number>(initialVolumeStep);
  const [isMuted, setIsMuted] = createSignal<boolean>(false);
  const [defaultShuffle, setDefaultShuffleState] = createSignal<boolean>(
    localStorage.getItem("ytm_default_shuffle") === "true"
  );
  const [isShuffled, setIsShuffled] = createSignal<boolean>(defaultShuffle());
  const initialUiScale: number = (() => {
    try {
      const saved = localStorage.getItem("ytm_ui_scale");
      if (saved) {
        const num = Number(saved);
        if (!isNaN(num) && num >= 80 && num <= 140) return num;
      }
    } catch {}
    return 100;
  })();
  const [uiScale, setUiScaleSignal] = createSignal<number>(initialUiScale);

  function applyUiScale(pct: number) {
    if (typeof document !== "undefined") {
      const basePx = 16;
      const calcPx = (basePx * pct) / 100;
      document.documentElement.style.fontSize = `${calcPx}px`;
    }
  }

  applyUiScale(initialUiScale);

  const [startupTab, setStartupTabState] = createSignal<string>(
    localStorage.getItem("ytm_startup_tab") || "home"
  );
  const [startInTray, setStartInTrayState] = createSignal<boolean>(
    localStorage.getItem("ytm_start_in_tray") === "true"
  );
  const [repeatMode, setRepeatMode] = createSignal<"off" | "all" | "one">("off");
  const [crossfadeDuration, setCrossfadeDuration] = createSignal<number>(4);
  const [queue, setQueue] = createSignal<Track[]>([]);
  const [currentIndex, setCurrentIndex] = createSignal<number>(-1);
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [lyrics, setLyrics] = createSignal<SyncedLyrics | null>(null);
  const [currentLyricIndex, setCurrentLyricIndex] = createSignal<number>(-1);
  const [lyricOffset, setLyricOffsetSignal] = createSignal<number>(0);
  const [searchResults, setSearchResults] = createSignal<UnifiedSearchResults>({
    query: "",
    filter: "all",
    tracks: [],
    albums: [],
    artists: [],
    playlists: [],
  });
  const [isSearching, setIsSearching] = createSignal<boolean>(false);
  const initialSubscribed: Set<string> = (() => {
    try {
      const saved = localStorage.getItem("ytm_subscribed_artists");
      if (saved) return new Set<string>(JSON.parse(saved));
    } catch {}
    return new Set<string>();
  })();
  const [subscribedArtistIds, setSubscribedArtistIds] = createSignal<Set<string>>(initialSubscribed);
  const [homeTracks, setHomeTracks] = createSignal<Track[]>([]);
  const [isHomeLoading, setIsHomeLoading] = createSignal<boolean>(false);
  const [exploreFeed, setExploreFeed] = createSignal<ExploreFeed | null>(null);
  const [isExploreLoading, setIsExploreLoading] = createSignal<boolean>(false);
  const [chartsData, setChartsData] = createSignal<ChartsData | null>(null);
  const [isChartsLoading, setIsChartsLoading] = createSignal<boolean>(false);
  const [selectedCountry, setSelectedCountry] = createSignal<string>(
    localStorage.getItem("ytm_charts_country") || "UA"
  );
  const [moodCategory, setMoodCategory] = createSignal<MoodCategoryData | null>(null);
  const [isMoodLoading, setIsMoodLoading] = createSignal<boolean>(false);
  const [activeChartPlaylistId, setActiveChartPlaylistId] = createSignal<string | null>(null);
  const [activeChartTracks, setActiveChartTracks] = createSignal<Track[]>([]);
  const [loadedPlaylist, setLoadedPlaylist] = createSignal<Playlist | null>(null);
  const [exploreTab, setExploreTab] = createSignal<"releases" | "charts" | "moods">("releases");

  // Contextual Playback (current playlist / album / liked songs list without queue dumping)
  const [contextTracks, setContextTracks] = createSignal<Track[]>([]);
  const [contextName, setContextName] = createSignal<string>("");
  const [lastContextIndex, setLastContextIndex] = createSignal<number>(-1);
  const [shuffledContextIndices, setShuffledContextIndices] = createSignal<number[]>([]);
  const [contextHistory, setContextHistory] = createSignal<Track[]>([]);

  // Dedicated full-page Playlist / Album detail view state
  const [selectedPlaylistId, setSelectedPlaylistId] = createSignal<string | null>(null);
  const [selectedPlaylistMeta, setSelectedPlaylistMeta] = createSignal<{
    title?: string;
    thumbnail_url?: string;
    subtitle?: string;
  } | null>(null);
  const [openedPlaylist, setOpenedPlaylist] = createSignal<Playlist | null>(null);
  const [isPlaylistLoading, setIsPlaylistLoading] = createSignal<boolean>(false);

  // Recommendations for the currently playing song (Up Next / Radio)
  const [songRecommendations, setSongRecommendations] = createSignal<Track[]>([]);
  const [isRecommendationsLoading, setIsRecommendationsLoading] = createSignal<boolean>(false);
  const [nowPlayingSubTab, setNowPlayingSubTab] = createSignal<"upnext" | "lyrics" | "similar">("upnext");

  // Load persisted liked tracks from localStorage and sanitize generic artists
  const initialLiked: Track[] = (() => {
    try {
      const saved = localStorage.getItem("ytm_liked_tracks");
      if (!saved) return [];
      const parsed: Track[] = JSON.parse(saved);
      const cleaned = parsed.map(cleanTrack);
      localStorage.setItem("ytm_liked_tracks", JSON.stringify(cleaned));
      return cleaned;
    } catch {
      return [];
    }
  })();
  const [likedTracks, setLikedTracks] = createSignal<Track[]>(initialLiked);
  const [likedTrackIds, setLikedTrackIds] = createSignal<Set<string>>(
    new Set(initialLiked.map((t) => t.id))
  );
  const initialHistory: Track[] = (() => {
    try {
      const saved = localStorage.getItem("ytm_history_tracks");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  })();
  const [historyTracks, setHistoryTracks] = createSignal<Track[]>(initialHistory);
  const initialSavedPlaylists: SavedPlaylist[] = (() => {
    try {
      const saved = localStorage.getItem("ytm_saved_playlists");
      if (saved) {
        const parsed: SavedPlaylist[] = JSON.parse(saved);
        return parsed.map((p) => {
          if ((p.id === "LM" || p.title === "Liked Music" || p.title === "Liked Songs") && p.trackCount === 0) {
            return { ...p, trackCount: initialLiked.length };
          }
          return p;
        });
      }
    } catch {}
    return [];
  })();
  const [savedPlaylists, setSavedPlaylists] = createSignal<SavedPlaylist[]>(initialSavedPlaylists);
  const [isLoggedIn, setIsLoggedIn] = createSignal<boolean>(false);
  const [isSyncing, setIsSyncing] = createSignal<boolean>(false);
  const [userProfile, setUserProfile] = createSignal<UserProfile | null>(null);
  const [playbackRate, setPlaybackRate] = createSignal<number>(1.0);
  const [eqBass, setEqBass] = createSignal<number>(0);
  const [eqMid, setEqMid] = createSignal<number>(0);
  const [eqTreble, setEqTreble] = createSignal<number>(0);
  const [selectedArtistId, setSelectedArtistId] = createSignal<string | null>(null);
  const [artistProfile, setArtistProfile] = createSignal<ArtistProfile | null>(null);
  const [isArtistLoading, setIsArtistLoading] = createSignal<boolean>(false);

  let hasCrossfadedForCurrentTrack = false;
  let hasScrobbledCurrentTrack = false;
  let isUserScrubbing = false;
  let lastManualSeekTimestamp = 0;

  function setScrubbing(scrubbing: boolean) {
    isUserScrubbing = scrubbing;
  }

  function loadTrackLyricOffset(trackId: string) {
    try {
      const saved = localStorage.getItem(`ytm_lyric_offset_${trackId}`);
      if (saved !== null) {
        const val = parseFloat(saved);
        if (!isNaN(val)) {
          setLyricOffsetSignal(val);
          return;
        }
      }
    } catch {}
    setLyricOffsetSignal(0);
  }

  function updateLyricIndex(curTime: number = currentTime()) {
    const lyr = lyrics();
    if (lyr && lyr.lines.length > 0) {
      const effectiveTimeMs = (curTime - lyricOffset()) * 1000;
      let idx = -1;
      for (let i = 0; i < lyr.lines.length; i++) {
        if (effectiveTimeMs >= lyr.lines[i].time_ms) {
          idx = i;
        } else {
          break;
        }
      }
      setCurrentLyricIndex(idx);
    }
  }

  // Initialize AudioEngine
  const audio = new AudioEngine({
    onTimeUpdate: (cur, dur) => {
      if (dur > 0 && Math.abs(dur - duration()) > 0.5) {
        setDuration(dur);
      }

      if (!document.hidden) {
        if (
          !isUserScrubbing &&
          (Math.abs(cur - currentTime()) >= 0.45 || cur === 0 || (dur > 0 && dur - cur < 0.5))
        ) {
          setCurrentTime(cur);
        }

        // Synced lyrics tracking with offset
        const lyr = lyrics();
        if (lyr && lyr.lines.length > 0) {
          const effectiveTimeMs = (cur - lyricOffset()) * 1000;
          let idx = -1;
          for (let i = 0; i < lyr.lines.length; i++) {
            if (effectiveTimeMs >= lyr.lines[i].time_ms) {
              idx = i;
            } else {
              break;
            }
          }
          setCurrentLyricIndex(idx);
        }
      }

      // Notify plugins of time progress
      pluginManager.notifyTimeUpdate(cur, dur);

      // Preload next track when remaining time <= 15s
      const cf = crossfadeDuration();
      if (dur > 0 && cur >= dur - 15) {
        checkAndPreloadNext();
      }

      // Sync playback to official YouTube Music Watch History & recommendations after 15s (or 50% for short tracks)
      if (
        !hasScrobbledCurrentTrack &&
        cur >= Math.min(15, dur > 0 ? dur * 0.5 : 15) &&
        cur >= 5
      ) {
        hasScrobbledCurrentTrack = true;
        const track = currentTrack();
        if (track && track.id) {
          const cookies = localStorage.getItem("ytm_session_cookies");
          invoke<boolean>("record_playback", {
            videoId: track.id,
            cookies: cookies || null,
          }).catch((e) => {
            console.warn("YouTube watch history record notice:", e);
          });
        }
      }

      // Auto-skip silence / dead air at track edges when plugin is enabled
      if (
        pluginManager.isEnabled("auto-skip-silence") &&
        dur > 15 &&
        cur >= dur - 2.2 &&
        !hasCrossfadedForCurrentTrack &&
        !audio.getCrossfading() &&
        !isUserScrubbing &&
        Date.now() - lastManualSeekTimestamp >= 2500
      ) {
        hasCrossfadedForCurrentTrack = true;
        handleTrackEnd();
        return;
      }

      // Auto-trigger seamless crossfade before track ends
      if (
        cf > 0 &&
        dur > cf &&
        cur >= dur - cf &&
        !hasCrossfadedForCurrentTrack &&
        !audio.getCrossfading() &&
        !isUserScrubbing &&
        Date.now() - lastManualSeekTimestamp >= 2500
      ) {
        const q = queue();
        const idx = currentIndex();
        const ctx = contextTracks();
        const cur = currentTrack();
        let ctxIdx = cur ? ctx.findIndex((t) => t.id === cur.id) : -1;
        if (ctxIdx === -1) {
          ctxIdx = lastContextIndex();
        }
        const hasNext =
          (q.length > 0 && idx < q.length - 1) ||
          (repeatMode() === "all" && q.length > 0 && idx >= 0) ||
          (ctx.length > 0 && isShuffled() && (shuffledContextIndices().length > 0 || ctx.length > 1)) ||
          (ctx.length > 0 && ctxIdx !== -1 && ctxIdx < ctx.length - 1) ||
          (repeatMode() === "all" && ctx.length > 0) ||
          (repeatMode() === "off" && songRecommendations().length > 0);
        if (hasNext) {
          hasCrossfadedForCurrentTrack = true;
          playNext(true);
        }
      }
    },
    onEnded: () => {
      if (!hasCrossfadedForCurrentTrack) {
        handleTrackEnd();
      }
    },
    onLoading: (loading) => {
      setIsLoading(loading);
    },
    onError: (err) => {
      if (
        err.includes("interrupted") ||
        err.includes("abort") ||
        err.includes("AbortError")
      ) {
        return;
      }
      setErrorMessage(err);
      setIsPlaying(false);
      pluginManager.notifyPlaybackStateChange(false);
    },
  }, initialVolume);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !isUserScrubbing) {
        const cur = audio.activeAudio.currentTime;
        setCurrentTime(cur);
        const lyr = lyrics();
        if (lyr && lyr.lines.length > 0) {
          const effectiveTimeMs = (cur - lyricOffset()) * 1000;
          let idx = -1;
          for (let i = 0; i < lyr.lines.length; i++) {
            if (effectiveTimeMs >= lyr.lines[i].time_ms) {
              idx = i;
            } else {
              break;
            }
          }
          setCurrentLyricIndex(idx);
        }
      }
    });
  }

  function persistSessionQueue(tracks: Track[], idx: number) {
    if (!pluginManager.isEnabled("session-restore")) return;
    try {
      // Do not persist liked tracks dump or large library dump into saved session queue
      if (
        tracks.length >= 100 ||
        (likedTracks().length > 0 && tracks.length === likedTracks().length && tracks[0]?.id === likedTracks()[0]?.id)
      ) {
        localStorage.removeItem("ytm_saved_queue");
        localStorage.removeItem("ytm_saved_index");
        return;
      }
      localStorage.setItem("ytm_saved_queue", JSON.stringify(tracks));
      localStorage.setItem("ytm_saved_index", String(idx));
    } catch {}
  }

  // Windows MediaSession handlers
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => playNext());
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrevious());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) {
        seek(details.seekTime);
      }
    });
  }

  function initShuffledContext(tracks: Track[], currentId?: string) {
    if (tracks.length === 0) {
      setShuffledContextIndices([]);
      return;
    }
    const curIdx = currentId ? tracks.findIndex((t) => t.id === currentId) : -1;
    const pool: number[] = [];
    for (let i = 0; i < tracks.length; i++) {
      if (i !== curIdx) pool.push(i);
    }
    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setShuffledContextIndices(pool);
  }

  function getNextContextTrack(): { track: Track; index: number } | null {
    const ctx = contextTracks();
    if (ctx.length === 0) return null;
    const cur = currentTrack();

    if (isShuffled()) {
      let sIndices = shuffledContextIndices();
      if (sIndices.length === 0) {
        const curIdx = cur ? ctx.findIndex((t) => t.id === cur.id) : -1;
        const pool: number[] = [];
        for (let i = 0; i < ctx.length; i++) {
          if (i !== curIdx) pool.push(i);
        }
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        sIndices = pool;
      }

      if (sIndices.length > 0) {
        const nextIdx = sIndices[0];
        setShuffledContextIndices(sIndices.slice(1));
        return { track: ctx[nextIdx], index: nextIdx };
      } else if (repeatMode() === "all" && ctx.length > 0) {
        const randomIdx = Math.floor(Math.random() * ctx.length);
        return { track: ctx[randomIdx], index: randomIdx };
      }
      return null;
    }

    // Sequential order
    let ctxIdx = cur ? ctx.findIndex((t) => t.id === cur.id) : -1;
    if (ctxIdx === -1) {
      ctxIdx = lastContextIndex();
    }
    if (ctxIdx !== -1 && ctxIdx < ctx.length - 1) {
      return { track: ctx[ctxIdx + 1], index: ctxIdx + 1 };
    } else if (repeatMode() === "all" && ctx.length > 0) {
      return { track: ctx[0], index: 0 };
    }
    return null;
  }

  function setPlaybackContext(tracks: Track[], name: string) {
    clearQueue();
    setContextTracks(tracks);
    setContextName(name);
    setContextHistory([]);
    const cur = currentTrack();
    if (cur) {
      const idx = tracks.findIndex((t) => t.id === cur.id);
      setLastContextIndex(idx);
    } else {
      setLastContextIndex(-1);
    }
    if (isShuffled()) {
      initShuffledContext(tracks, cur?.id);
    } else {
      setShuffledContextIndices([]);
    }
  }

  function clearPlaybackContext() {
    setContextTracks([]);
    setContextName("");
    setLastContextIndex(-1);
    setShuffledContextIndices([]);
    setContextHistory([]);
  }

  const upcomingContextTracks = createMemo(() => {
    const ctx = contextTracks();
    if (ctx.length === 0) return [];
    if (isShuffled()) {
      const sIndices = shuffledContextIndices();
      if (sIndices.length > 0) {
        return sIndices.map((i) => ctx[i]).filter(Boolean);
      }
    }
    const cur = currentTrack();
    const idx = cur ? ctx.findIndex((t) => t.id === cur.id) : -1;
    if (idx !== -1) {
      return ctx.slice(idx + 1);
    }
    const lastIdx = lastContextIndex();
    if (lastIdx !== -1 && lastIdx < ctx.length - 1) {
      return ctx.slice(lastIdx + 1);
    }
    return ctx;
  });

  async function checkAndPreloadNext() {
    const q = queue();
    let nextTrackTarget: Track | null = null;
    if (q.length > 0) {
      nextTrackTarget = q[0];
    } else if (contextTracks().length > 0) {
      const ctx = contextTracks();
      if (isShuffled()) {
        const sIndices = shuffledContextIndices();
        if (sIndices.length > 0) {
          nextTrackTarget = ctx[sIndices[0]];
        } else if (repeatMode() === "all" && ctx.length > 0) {
          nextTrackTarget = ctx[Math.floor(Math.random() * ctx.length)];
        }
      } else {
        const cur = currentTrack();
        let ctxIdx = cur ? ctx.findIndex((t) => t.id === cur.id) : -1;
        if (ctxIdx === -1) {
          ctxIdx = lastContextIndex();
        }
        if (ctxIdx !== -1 && ctxIdx < ctx.length - 1) {
          nextTrackTarget = ctx[ctxIdx + 1];
        } else if (repeatMode() === "all" && ctx.length > 0) {
          nextTrackTarget = ctx[0];
        }
      }
    }

    if (!nextTrackTarget && repeatMode() === "off") {
      const recs = songRecommendations();
      if (recs.length > 0) {
        nextTrackTarget = recs[0];
      }
    }

    if (nextTrackTarget && !audio.getPreloaded(nextTrackTarget.id)) {
      try {
        const url = await invoke<string>("resolve_stream_url", { videoId: nextTrackTarget.id });
        audio.preloadNext(nextTrackTarget.id, url);
      } catch (e) {
        console.warn("Preload failed:", e);
      }
    }
  }

  function preloadTrack(_trackId: string) {
    // Intentionally disabled on mouse hover/scroll to prevent spawning yt-dlp/python processes
    // when scrolling through large playlists. Next track in queue is preloaded via checkAndPreloadNext().
  }

  async function handleTrackEnd() {
    if (repeatMode() === "one") {
      seek(0);
      audio.resume();
      setIsPlaying(true);
      pluginManager.notifyPlaybackStateChange(true);
      return;
    }

    const q = queue();
    if (q.length > 0) {
      const nextTrack = q[0];
      await removeFromQueue(0);
      await playTrack(nextTrack, false);
      return;
    }

    // Contextual playback (Liked Songs, Playlist, Album)
    if (contextTracks().length > 0) {
      const cur = currentTrack();
      if (cur) {
        setContextHistory((prev) => [...prev.slice(-50), cur]);
      }
      const next = getNextContextTrack();
      if (next) {
        setLastContextIndex(next.index);
        await playTrack(next.track, false);
        return;
      }
    }

    if (repeatMode() === "all" && currentTrack()) {
      seek(0);
      audio.resume();
      setIsPlaying(true);
      pluginManager.notifyPlaybackStateChange(true);
      return;
    }

    // Auto-continue with song recommendations like YouTube Music radio without injecting into manual queue!
    const recs = songRecommendations();
    if (recs.length > 0) {
      const nextRec = recs[0];
      setSongRecommendations(recs.slice(1));
      await playTrack(nextRec, false);
      return;
    }

    setIsPlaying(false);
    pluginManager.notifyPlaybackStateChange(false);
  }

  async function playTrack(track: Track, crossfade: boolean = false, forceRestart: boolean = false) {
    if (!crossfade && !forceRestart && currentTrack()?.id === track.id) {
      togglePlay();
      return;
    }

    const ctx = contextTracks();
    if (ctx.length > 0) {
      const ctxIdx = ctx.findIndex((t) => t.id === track.id);
      if (ctxIdx !== -1) {
        setLastContextIndex(ctxIdx);
        if (isShuffled()) {
          setShuffledContextIndices((prev) => prev.filter((i) => i !== ctxIdx));
        }
      }
      setCurrentIndex(-1);
    } else {
      const q = queue();
      const existingIdx = q.findIndex((t) => t.id === track.id);
      if (existingIdx !== -1) {
        setCurrentIndex(existingIdx);
        persistSessionQueue(q, existingIdx);
      } else {
        setCurrentIndex(-1);
        persistSessionQueue(q, -1);
      }
    }

    hasCrossfadedForCurrentTrack = false;
    hasScrobbledCurrentTrack = false;
    if (!crossfade) {
      audio.pause();
    }
    setCurrentTrack(track);
    loadTrackLyricOffset(track.id);
    setIsLoading(true);
    setErrorMessage(null);
    setCurrentTime(0);
    setDuration(track.duration_seconds || 0);

    // Notify plugins
    pluginManager.notifyTrackChange(track);

    // Add to history
    setHistoryTracks((prev) => {
      const filtered = prev.filter((t) => t.id !== track.id);
      const updated = [track, ...filtered].slice(0, 100);
      try {
        localStorage.setItem("ytm_history_tracks", JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // Fetch lyrics concurrently
    fetchLyrics(track);

    // Fetch song recommendations concurrently (Up Next / Radio)
    loadSongRecommendations(track.id);

    // Eagerly preload next track in queue after 500ms
    setTimeout(() => {
      checkAndPreloadNext();
    }, 500);

    try {
      // Check preloaded or resolve from Rust
      let streamUrl = audio.getPreloaded(track.id);
      if (!streamUrl) {
        streamUrl = await invoke<string>("resolve_stream_url", { videoId: track.id });
      }

      await audio.playStream(streamUrl, track, crossfade);
      setIsPlaying(true);
      pluginManager.notifyPlaybackStateChange(true);
      // Preload next target as soon as stream starts
      checkAndPreloadNext();
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || "Failed to resolve audio stream";
      if (
        msg.includes("interrupted") ||
        msg.includes("abort") ||
        msg.includes("AbortError")
      ) {
        return;
      }
      console.error("Failed to play track:", e);
      setErrorMessage(msg);
      setIsPlaying(false);
      pluginManager.notifyPlaybackStateChange(false);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchLyrics(track: Track) {
    loadTrackLyricOffset(track.id);
    try {
      const res = await invoke<SyncedLyrics>("get_synced_lyrics", {
        title: track.title,
        artist: track.artist,
        durationSeconds: track.duration_seconds || null,
      });
      setLyrics(res);
      setCurrentLyricIndex(-1);
      updateLyricIndex();
    } catch (e) {
      console.warn("Failed to load lyrics:", e);
      setLyrics(null);
    }
  }

  function setLyricOffset(seconds: number) {
    const val = Math.round(seconds * 10) / 10;
    setLyricOffsetSignal(val);
    const track = currentTrack();
    if (track && track.id) {
      try {
        localStorage.setItem(`ytm_lyric_offset_${track.id}`, val.toString());
      } catch {}
    }
    updateLyricIndex();
  }

  function adjustLyricOffset(deltaSeconds: number) {
    setLyricOffset(lyricOffset() + deltaSeconds);
  }

  function syncLyricsToLine(lineTimeMs: number) {
    const newOffset = currentTime() - (lineTimeMs / 1000);
    const rounded = Math.round(newOffset * 10) / 10;
    setLyricOffset(rounded);
    const sign = rounded > 0 ? "+" : "";
    triggerPluginToast({
      title: "Lyrics Synced",
      body: `Synced lyrics offset by ${sign}${rounded.toFixed(1)}s`,
    });
  }

  function resetLyricOffset() {
    setLyricOffsetSignal(0);
    const track = currentTrack();
    if (track && track.id) {
      try {
        localStorage.removeItem(`ytm_lyric_offset_${track.id}`);
      } catch {}
    }
    updateLyricIndex();
  }

  async function loadSongRecommendations(videoId: string) {
    if (!videoId) return;
    setIsRecommendationsLoading(true);
    try {
      const cookies = localStorage.getItem("ytm_session_cookies");
      const recs = await invoke<Track[]>("get_song_recommendations", {
        videoId,
        cookies: cookies || null,
      });
      const cleaned = (recs || []).map(cleanTrack);
      setSongRecommendations(cleaned);
      // If queue has no upcoming track, preload the first recommendation immediately!
      const q = queue();
      const idx = currentIndex();
      if (idx + 1 >= q.length && cleaned.length > 0) {
        checkAndPreloadNext();
      }
    } catch (e) {
      console.warn("Failed to load song recommendations:", e);
      setSongRecommendations([]);
    } finally {
      setIsRecommendationsLoading(false);
    }
  }

  async function addRecommendationsToQueue() {
    const recs = songRecommendations();
    for (const t of recs) {
      await addToQueue(t);
    }
  }

  async function startSongRadio(track: Track) {
    setIsLoading(true);
    try {
      const cookies = localStorage.getItem("ytm_session_cookies");
      const recs = await invoke<Track[]>("get_song_recommendations", {
        videoId: track.id,
        cookies: cookies || null,
      });
      const cleaned = (recs || []).map(cleanTrack);
      const fullRadio = [cleanTrack(track), ...cleaned];
      await setFullQueue(fullRadio, 0, false);
    } catch (e) {
      await playTrack(track);
    } finally {
      setIsLoading(false);
    }
  }

  async function togglePlay() {
    if (!currentTrack()) {
      const useShuffle = defaultShuffle() || isShuffled();
      if (queue().length > 0) {
        const startIdx = useShuffle
          ? Math.floor(Math.random() * queue().length)
          : Math.max(0, currentIndex());
        await playTrackAt(startIdx);
        return;
      }
      if (likedTracks().length > 0) {
        const tracks = likedTracks();
        const startIdx = useShuffle ? Math.floor(Math.random() * tracks.length) : 0;
        setPlaybackContext(tracks, "Liked Songs");
        await playTrack(tracks[startIdx]);
        return;
      }
      if (historyTracks().length > 0) {
        const tracks = historyTracks();
        const startIdx = useShuffle ? Math.floor(Math.random() * tracks.length) : 0;
        setPlaybackContext(tracks, "History");
        await playTrack(tracks[startIdx]);
        return;
      }
      if (homeTracks().length > 0) {
        const tracks = homeTracks();
        const startIdx = useShuffle ? Math.floor(Math.random() * tracks.length) : 0;
        setPlaybackContext(tracks, "Home");
        await playTrack(tracks[startIdx]);
        return;
      }
      // If nothing loaded yet, fetch liked songs or home feed and play immediately!
      await syncLikedSongs(true);
      if (likedTracks().length > 0) {
        const tracks = likedTracks();
        const startIdx = useShuffle ? Math.floor(Math.random() * tracks.length) : 0;
        setPlaybackContext(tracks, "Liked Songs");
        await playTrack(tracks[startIdx]);
        return;
      }
      await loadHomeFeed(true);
      if (homeTracks().length > 0) {
        const tracks = homeTracks();
        const startIdx = useShuffle ? Math.floor(Math.random() * tracks.length) : 0;
        setPlaybackContext(tracks, "Home");
        await playTrack(tracks[startIdx]);
      }
      return;
    }

    if (isPlaying()) {
      pause();
    } else {
      resume();
    }
  }

  function pause() {
    audio.pause();
    setIsPlaying(false);
    pluginManager.notifyPlaybackStateChange(false);
  }

  function resume() {
    audio.resume();
    setIsPlaying(true);
    pluginManager.notifyPlaybackStateChange(true);
  }

  function seek(seconds: number) {
    lastManualSeekTimestamp = Date.now();
    audio.seek(seconds);
    setCurrentTime(seconds);
    updateLyricIndex(seconds);
  }

  function changeVolume(val: number) {
    const clamped = Math.max(0, Math.min(1, val));
    audio.setVolume(clamped);
    setVolume(clamped);
    try {
      localStorage.setItem("ytm_volume", clamped.toString());
    } catch {}
    if (isMuted() && clamped > 0) {
      setIsMuted(false);
    }
  }

  function toggleMute() {
    const nextMuted = !isMuted();
    setIsMuted(nextMuted);
    audio.setMuted(nextMuted);
  }

  function toggleRepeat() {
    const cur = repeatMode();
    if (cur === "off") setRepeatMode("all");
    else if (cur === "all") setRepeatMode("one");
    else setRepeatMode("off");
  }

  async function toggleShuffle() {
    try {
      const shuffled = await invoke<boolean>("toggle_shuffle");
      setIsShuffled(shuffled);
      const q = await invoke<Track[]>("get_queue");
      setQueue(q);
      const curIdx = await invoke<number>("get_current_index");
      setCurrentIndex(curIdx);
      persistSessionQueue(q, curIdx);

      const ctx = contextTracks();
      if (ctx.length > 0) {
        if (shuffled) {
          initShuffledContext(ctx, currentTrack()?.id);
        } else {
          setShuffledContextIndices([]);
        }
      }

      setTimeout(() => {
        checkAndPreloadNext();
      }, 200);
    } catch (e) {
      console.error("Shuffle error:", e);
    }
  }

  async function playNext(isAuto: boolean = false) {
    const q = queue();
    const shouldCrossfade = isAuto && crossfadeDuration() > 0;
    if (q.length > 0) {
      const nextTrack = q[0];
      await removeFromQueue(0);
      await playTrack(nextTrack, shouldCrossfade);
      return;
    }

    // Contextual playback (Liked Songs, Playlist, Album)
    if (contextTracks().length > 0) {
      const cur = currentTrack();
      if (cur) {
        setContextHistory((prev) => [...prev.slice(-50), cur]);
      }
      const next = getNextContextTrack();
      if (next) {
        setLastContextIndex(next.index);
        await playTrack(next.track, shouldCrossfade);
        return;
      }
    }

    const recs = songRecommendations();
    if (recs.length > 0) {
      const nextRec = recs[0];
      setSongRecommendations(recs.slice(1));
      await playTrack(nextRec, shouldCrossfade);
      return;
    }

    if (repeatMode() === "all" && currentTrack()) {
      seek(0);
      audio.resume();
      setIsPlaying(true);
      pluginManager.notifyPlaybackStateChange(true);
    }
  }

  async function playPrevious() {
    const cur = currentTime();
    if (cur > 3) {
      seek(0);
      return;
    }

    // Contextual playback previous track
    const ctx = contextTracks();
    if (ctx.length > 0) {
      const hist = contextHistory();
      if (hist.length > 0) {
        const prevTrack = hist[hist.length - 1];
        setContextHistory(hist.slice(0, hist.length - 1));
        const idxInCtx = ctx.findIndex((t) => t.id === prevTrack.id);
        if (idxInCtx !== -1) {
          setLastContextIndex(idxInCtx);
        }
        await playTrack(prevTrack, false);
        return;
      }
      if (!isShuffled()) {
        const current = currentTrack();
        let ctxIdx = current ? ctx.findIndex((t) => t.id === current.id) : -1;
        if (ctxIdx === -1) {
          ctxIdx = lastContextIndex();
        }
        if (ctxIdx > 0) {
          const prevTrack = ctx[ctxIdx - 1];
          setLastContextIndex(ctxIdx - 1);
          await playTrack(prevTrack, false);
          return;
        }
      }
    }

    const idx = currentIndex();
    if (idx > 0) {
      await playTrackAt(idx - 1, false);
      return;
    }

    seek(0);
  }

  async function playTrackAt(index: number, crossfade: boolean = false) {
    try {
      const track = await invoke<Track | null>("play_track_at", { index });
      if (track) {
        setCurrentIndex(index);
        persistSessionQueue(queue(), index);
        await playTrack(track, crossfade, true);
      }
    } catch (e) {
      console.error("playTrackAt error:", e);
    }
  }

  async function setFullQueue(
    tracks: Track[],
    startIndex: number = 0,
    shuffle: boolean = false
  ) {
    try {
      if (tracks.length === 0) {
        await invoke("clear_queue");
        setQueue([]);
        setCurrentIndex(-1);
        setIsShuffled(false);
        audio.pause();
        setCurrentTrack(null);
        setLyricOffsetSignal(0);
        setIsPlaying(false);
        persistSessionQueue([], -1);
        return;
      }

      const initialIndex =
        shuffle && tracks.length > 1
          ? Math.floor(Math.random() * tracks.length)
          : startIndex;

      let current = await invoke<Track | null>("set_queue", {
        tracks,
        startIndex: initialIndex,
      });

      if (shuffle) {
        const shuffled = await invoke<boolean>("toggle_shuffle");
        setIsShuffled(shuffled);
        const q = await invoke<Track[]>("get_queue");
        const curIdx = await invoke<number>("get_current_index");
        setQueue(q);
        setCurrentIndex(curIdx);
        persistSessionQueue(q, curIdx);
        current = q[curIdx] || current;
      } else {
        setIsShuffled(false);
        setQueue(tracks);
        setCurrentIndex(initialIndex);
        persistSessionQueue(tracks, initialIndex);
      }

      if (current) {
        await playTrack(current, false, true);
      }
    } catch (e) {
      console.error("setFullQueue error:", e);
    }
  }

  async function addToQueue(track: Track) {
    try {
      await invoke("add_to_queue", { track });
      const q = await invoke<Track[]>("get_queue");
      setQueue(q);
      persistSessionQueue(q, currentIndex());
      checkAndPreloadNext();
    } catch (e) {
      console.error("addToQueue error:", e);
    }
  }

  async function removeFromQueue(index: number) {
    try {
      const isCur = index === currentIndex();
      await invoke("remove_from_queue", { index });
      const newQ = await invoke<Track[]>("get_queue");
      const curIdx = await invoke<number>("get_current_index");
      setQueue(newQ);
      setCurrentIndex(curIdx);
      persistSessionQueue(newQ, curIdx);
      if (isCur) {
        if (newQ.length > 0) {
          const nextIdx = Math.min(index, newQ.length - 1);
          await playTrackAt(nextIdx, false);
        } else {
          audio.pause();
          setCurrentTrack(null);
          setLyricOffsetSignal(0);
          setIsPlaying(false);
        }
      }
    } catch (e) {
      console.error("removeFromQueue error:", e);
      setQueue((prev) => prev.filter((_, i) => i !== index));
    }
  }

  async function clearQueue() {
    try {
      await invoke("clear_queue");
      setQueue([]);
      setCurrentIndex(-1);
      persistSessionQueue([], -1);
    } catch (e) {
      console.error("clearQueue error:", e);
      setQueue([]);
      setCurrentIndex(-1);
      persistSessionQueue([], -1);
    }
  }

  async function search(query: string, filter?: string) {
    if (!query.trim()) return;
    setIsSearching(true);
    setErrorMessage(null);
    try {
      const results = await invoke<UnifiedSearchResults>("search_unified", {
        query,
        limit: 50,
        filter: filter && filter !== "All" ? filter.toLowerCase() : null,
      });
      results.tracks = results.tracks.map(cleanTrack);
      setSearchResults(results);
    } catch (e: any) {
      console.error("Search error:", e);
      setErrorMessage(typeof e === "string" ? e : e?.message || "Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  async function openArtist(artistIdOrName: string) {
    if (!artistIdOrName) return;
    setSelectedPlaylistId(null);
    setSelectedArtistId(artistIdOrName);
    setIsArtistLoading(true);
    setErrorMessage(null);
    try {
      const profile = await invoke<ArtistProfile>("get_artist_profile", { browseId: artistIdOrName });
      profile.top_songs = profile.top_songs.map(cleanTrack);
      setArtistProfile(profile);
      if (
        profile.subscribed ||
        (profile.channel_id && subscribedArtistIds().has(profile.channel_id)) ||
        subscribedArtistIds().has(profile.id)
      ) {
        setSubscribedArtistIds((prev) => new Set([...prev, profile.id, ...(profile.channel_id ? [profile.channel_id] : [])]));
      }
    } catch (e: any) {
      console.error("Failed to load artist profile:", e);
      setErrorMessage(typeof e === "string" ? e : e?.message || "Failed to load artist profile");
    } finally {
      setIsArtistLoading(false);
    }
  }

  async function toggleSubscribeArtist(profile: ArtistProfile) {
    const channelId = profile.channel_id || profile.id;
    const isCurrentlySub =
      subscribedArtistIds().has(channelId) ||
      subscribedArtistIds().has(profile.id) ||
      !!profile.subscribed;
    const willSub = !isCurrentlySub;

    setSubscribedArtistIds((prev) => {
      const next = new Set(prev);
      if (willSub) {
        next.add(channelId);
        next.add(profile.id);
      } else {
        next.delete(channelId);
        next.delete(profile.id);
      }
      try {
        localStorage.setItem("ytm_subscribed_artists", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    setArtistProfile((p) => (p ? { ...p, subscribed: willSub } : null));

    try {
      const cookies = localStorage.getItem("ytm_session_cookies");
      await invoke<boolean>("toggle_subscribe_artist", {
        channelId,
        subscribe: willSub,
        cookies: cookies || null,
      });
    } catch (e) {
      console.warn("YouTube subscribe sync notice:", e);
    }
  }

  function closeArtist() {
    setSelectedArtistId(null);
    setArtistProfile(null);
  }

  async function openPlaylist(
    urlOrId: string,
    customTitle?: string,
    thumbnailUrl?: string,
    subtitle?: string
  ) {
    if (!urlOrId) return;
    setSelectedArtistId(null);
    setSelectedPlaylistId(urlOrId);
    setSelectedPlaylistMeta({
      title: customTitle,
      thumbnail_url: thumbnailUrl,
      subtitle,
    });
    setOpenedPlaylist(null);
    setIsPlaylistLoading(true);
    setErrorMessage(null);
    try {
      const playlist = await invoke<Playlist>("load_playlist", {
        urlOrId,
        cookiesPath: null,
      });
      if (customTitle && (playlist.title === "YouTube Music Playlist" || !playlist.title)) {
        playlist.title = customTitle;
      }
      setOpenedPlaylist(playlist);
    } catch (e: any) {
      console.error("Failed to open playlist/album:", e);
      setErrorMessage(typeof e === "string" ? e : e?.message || "Failed to load playlist or album");
    } finally {
      setIsPlaylistLoading(false);
    }
  }

  function closePlaylist() {
    setSelectedPlaylistId(null);
    setOpenedPlaylist(null);
    setSelectedPlaylistMeta(null);
    setLoadedPlaylist(null);
  }

  // 10-minute in-memory cache to prevent redundant InnerTube queries and JSON allocations
  const INNERTUBE_CACHE_TTL = 10 * 60 * 1000;
  let exploreFeedCachedAt = 0;
  let chartsDataCachedAt = 0;
  const chartsCache = new Map<string, { data: ChartsData; timestamp: number }>();

  async function loadHomeFeed(force: boolean = false) {
    if (!force && homeTracks().length > 0 && exploreFeed() && Date.now() - exploreFeedCachedAt < INNERTUBE_CACHE_TTL) {
      return;
    }
    setIsHomeLoading(true);
    try {
      let feed = exploreFeed();
      if (force || !feed || Date.now() - exploreFeedCachedAt >= INNERTUBE_CACHE_TTL) {
        feed = await invoke<ExploreFeed>("get_explore_feed");
        setExploreFeed(feed);
        exploreFeedCachedAt = Date.now();
      }
      if (feed.trending_songs.length > 0) {
        setHomeTracks(feed.trending_songs);
      } else {
        const tracks = await invoke<Track[]>("get_home_feed");
        setHomeTracks(tracks);
      }
    } catch (e) {
      console.warn("Home feed error, fallback search:", e);
      try {
        const fallback = await invoke<Track[]>("search_tracks", { query: "Top Hits 2024", limit: 20 });
        setHomeTracks(fallback);
      } catch (err) {
        console.error("Fallback search failed:", err);
      }
    } finally {
      setIsHomeLoading(false);
    }
  }

  async function loadExploreFeed(force: boolean = false) {
    if (!force && exploreFeed() && Date.now() - exploreFeedCachedAt < INNERTUBE_CACHE_TTL) {
      return;
    }
    setIsExploreLoading(true);
    try {
      const feed = await invoke<ExploreFeed>("get_explore_feed");
      setExploreFeed(feed);
      exploreFeedCachedAt = Date.now();
      if (feed.trending_songs.length > 0) {
        setHomeTracks(feed.trending_songs);
      }
    } catch (e) {
      console.error("Failed to load explore feed:", e);
    } finally {
      setIsExploreLoading(false);
    }
  }

  async function loadCharts(countryCode?: string, force: boolean = false) {
    const code = countryCode || selectedCountry();
    if (countryCode && countryCode !== selectedCountry()) {
      setSelectedCountry(countryCode);
      try {
        localStorage.setItem("ytm_charts_country", countryCode);
      } catch {}
    }

    const cached = chartsCache.get(code);
    if (!force && cached && Date.now() - cached.timestamp < INNERTUBE_CACHE_TTL) {
      if (chartsData() !== cached.data) {
        setChartsData(cached.data);
        setActiveChartPlaylistId(cached.data.playlists[0]?.id || null);
        setActiveChartTracks(cached.data.top_songs || []);
      }
      return;
    }

    if (
      !force &&
      chartsData() &&
      chartsData()!.country === code &&
      Date.now() - chartsDataCachedAt < INNERTUBE_CACHE_TTL
    ) {
      return;
    }

    setIsChartsLoading(true);
    try {
      const data = await invoke<ChartsData>("get_charts", { country: code });
      chartsCache.set(code, { data, timestamp: Date.now() });
      setChartsData(data);
      chartsDataCachedAt = Date.now();
      setActiveChartPlaylistId(data.playlists[0]?.id || null);
      setActiveChartTracks(data.top_songs || []);
    } catch (e) {
      console.error("Failed to load charts for country:", code, e);
    } finally {
      setIsChartsLoading(false);
    }
  }

  async function selectChartPlaylist(playlistId: string, playImmediately: boolean = false) {
    if (!playlistId) return;
    setActiveChartPlaylistId(playlistId);
    setIsChartsLoading(true);
    try {
      const pl = await invoke<Playlist>("load_playlist", {
        urlOrId: playlistId,
        cookiesPath: null,
      });
      if (pl.tracks.length > 0) {
        setActiveChartTracks(pl.tracks);
        if (playImmediately) {
          setPlaybackContext(pl.tracks, "Chart");
          await playTrack(pl.tracks[0]);
        }
      }
    } catch (e: any) {
      console.error("Failed to load chart playlist:", e);
    } finally {
      setIsChartsLoading(false);
    }
  }

  async function openMoodCategory(mood: MoodGenreItem) {
    setIsMoodLoading(true);
    setErrorMessage(null);
    try {
      if (mood.browse_id && mood.params) {
        const data = await invoke<MoodCategoryData>("get_mood_category", {
          browseId: mood.browse_id,
          params: mood.params,
          title: mood.title,
        });
        setMoodCategory(data);
      } else {
        const tracks = await invoke<Track[]>("search_tracks", {
          query: mood.title,
          limit: 40,
          filter: "songs",
        });
        setMoodCategory({
          title: mood.title,
          sections: [],
          tracks,
        });
      }
    } catch (e: any) {
      console.error("Failed to open mood category:", e);
      setErrorMessage(typeof e === "string" ? e : e?.message || "Failed to load mood category");
    } finally {
      setIsMoodLoading(false);
    }
  }

  function closeMoodCategory() {
    setMoodCategory(null);
  }

  async function fetchSuggestions(query: string): Promise<SearchSuggestions> {
    if (!query || query.trim().length === 0) {
      return { queries: [], items: [] };
    }
    try {
      return await invoke<SearchSuggestions>("get_search_suggestions", { query: query.trim() });
    } catch (e) {
      console.warn("Fetch suggestions failed:", e);
      return { queries: [], items: [] };
    }
  }

  async function loadPlaylistUrl(urlOrId: string, customTitle?: string, autoPlay: boolean = false) {
    setSelectedArtistId(null);
    setSelectedPlaylistId(null);
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const playlist = await invoke<Playlist>("load_playlist", {
        urlOrId,
        cookiesPath: null,
      });
      if (!playlist.id) {
        playlist.id = urlOrId.includes("list=") ? (urlOrId.split("list=")[1]?.split("&")[0] || urlOrId) : urlOrId;
      }
      if (customTitle && (playlist.title === "YouTube Music Playlist" || !playlist.title)) {
        playlist.title = customTitle;
      }
      if (playlist.tracks.length > 0) {
        setLoadedPlaylist(playlist);
        if (autoPlay) {
          setPlaybackContext(playlist.tracks, playlist.title || "Playlist");
          await playTrack(playlist.tracks[0]);
        }
      } else {
        setErrorMessage("No tracks found in playlist or album");
      }
    } catch (e: any) {
      console.error("Playlist load error:", e);
      setErrorMessage(typeof e === "string" ? e : e?.message || "Failed to load playlist");
    } finally {
      setIsLoading(false);
    }
  }

  function closeLoadedPlaylist() {
    setLoadedPlaylist(null);
  }

  async function toggleLike(track: Track) {
    const id = track.id;
    let willLike = false;
    setLikedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        willLike = false;
        setLikedTracks((l) => {
          const updated = l.filter((t) => t.id !== id);
          try {
            localStorage.setItem("ytm_liked_tracks", JSON.stringify(updated));
          } catch {}
          return updated;
        });
      } else {
        next.add(id);
        willLike = true;
        const cleaned = cleanTrack(track);
        setLikedTracks((l) => {
          const updated = [cleaned, ...l.filter((t) => t.id !== id)];
          try {
            localStorage.setItem("ytm_liked_tracks", JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
      return next;
    });

    // Asynchronously notify YouTube Music API
    try {
      const cookies = localStorage.getItem("ytm_session_cookies");
      await invoke<boolean>("toggle_like", {
        videoId: id,
        like: willLike,
        cookies: cookies || null,
      });
    } catch (e) {
      console.warn("YouTube like sync notice:", e);
    }
  }

  async function syncLikedSongs(silent: boolean = false) {
    setIsSyncing(true);
    if (!silent) setIsLoading(true);
    try {
      const cookies = localStorage.getItem("ytm_session_cookies");
      const fetched = await invoke<Track[]>("get_liked_songs", {
        cookies: cookies || null,
      });
      if (fetched) {
        const merged = fetched.map(cleanTrack);
        try {
          localStorage.setItem("ytm_liked_tracks", JSON.stringify(merged));
        } catch {}
        setLikedTrackIds(new Set(merged.map((t) => t.id)));
        setLikedTracks(merged);
      }
    } catch (e: any) {
      console.warn("Sync liked songs failed:", e);
      if (!silent) {
        setErrorMessage(typeof e === "string" ? e : e?.message || "Failed to sync liked songs from YouTube");
      }
    } finally {
      setIsSyncing(false);
      if (!silent) setIsLoading(false);
    }
  }

  async function syncHistorySongs(silent: boolean = false) {
    setIsSyncing(true);
    if (!silent) setIsLoading(true);
    try {
      const cookies = localStorage.getItem("ytm_session_cookies");
      const fetched = await invoke<Track[]>("get_history", {
        cookies: cookies || null,
      });
      if (fetched && fetched.length > 0) {
        setHistoryTracks((prev) => {
          const map = new Map<string, Track>();
          for (const t of prev) map.set(t.id, cleanTrack(t));
          for (const t of fetched) {
            if (!map.has(t.id)) map.set(t.id, cleanTrack(t));
          }
          const merged = Array.from(map.values()).slice(0, 150);
          try {
            localStorage.setItem("ytm_history_tracks", JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    } catch (e: any) {
      console.warn("Sync history failed:", e);
      if (!silent) {
        setErrorMessage(typeof e === "string" ? e : e?.message || "Failed to sync history from YouTube");
      }
    } finally {
      setIsSyncing(false);
      if (!silent) setIsLoading(false);
    }
  }

  function isPlaylistSaved(id: string): boolean {
    if (!id) return false;
    const cleanId = id.includes("list=") ? (id.split("list=")[1]?.split("&")[0] || id) : id;
    return savedPlaylists().some((p) => p.id === cleanId || p.id === id);
  }

  function savePlaylist(playlistMeta: SavedPlaylist) {
    if (!playlistMeta || !playlistMeta.id) return;
    const cleanId = playlistMeta.id.includes("list=")
      ? (playlistMeta.id.split("list=")[1]?.split("&")[0] || playlistMeta.id)
      : playlistMeta.id;
    const item: SavedPlaylist = {
      ...playlistMeta,
      id: cleanId,
    };
    setSavedPlaylists((prev) => {
      const filtered = prev.filter((p) => p.id !== cleanId && p.id !== playlistMeta.id);
      const next = [item, ...filtered];
      try {
        localStorage.setItem("ytm_saved_playlists", JSON.stringify(next));
      } catch {}
      return next;
    });
    triggerPluginToast({
      title: "Playlist Saved",
      body: `"${item.title}" added to library`,
      icon: item.thumbnailUrl,
    });
  }

  function removeSavedPlaylist(id: string) {
    if (!id) return;
    const cleanId = id.includes("list=") ? (id.split("list=")[1]?.split("&")[0] || id) : id;
    setSavedPlaylists((prev) => {
      const next = prev.filter((p) => p.id !== cleanId && p.id !== id);
      try {
        localStorage.setItem("ytm_saved_playlists", JSON.stringify(next));
      } catch {}
      return next;
    });
    triggerPluginToast({
      title: "Playlist Removed",
      body: "Playlist removed from library",
    });
  }

  async function syncLibrary(silent: boolean = false) {
    setIsSyncing(true);
    if (!silent) setIsLoading(true);
    try {
      const cookies = localStorage.getItem("ytm_session_cookies");
      const fetched = await invoke<SavedPlaylist[]>("sync_library", {
        cookies: cookies || null,
      });
      if (fetched && fetched.length > 0) {
        setSavedPlaylists((prev) => {
          const map = new Map<string, SavedPlaylist>();
          for (const p of prev) {
            map.set(p.id, p);
          }
          for (const p of fetched) {
            if ((p.id === "LM" || p.title === "Liked Music" || p.title === "Liked Songs") && p.trackCount === 0) {
              p.trackCount = likedTracks().length;
            }
            map.set(p.id, p);
          }
          const merged = Array.from(map.values());
          try {
            localStorage.setItem("ytm_saved_playlists", JSON.stringify(merged));
          } catch {}
          return merged;
        });
        triggerPluginToast({
          title: "Sync Successful",
          body: `Synced ${fetched.length} playlists from account`,
        });
      } else {
        if (!silent) {
          triggerPluginToast({
            title: "Sync",
            body: "No new playlists found in account",
          });
        }
      }
    } catch (e: any) {
      console.warn("Sync library playlists failed:", e);
      if (!silent) {
        setErrorMessage(typeof e === "string" ? e : e?.message || "Failed to sync library playlists from YouTube");
      }
    } finally {
      setIsSyncing(false);
      if (!silent) setIsLoading(false);
    }
  }

  async function syncAllUserData(silent: boolean = true) {
    setIsSyncing(true);
    try {
      await Promise.allSettled([syncLikedSongs(silent), syncHistorySongs(silent), syncLibrary(silent)]);
    } finally {
      setIsSyncing(false);
    }
  }

  async function openLoginWindow() {
    try {
      await invoke("open_login_window");
    } catch (e: any) {
      console.error("Failed to open login window:", e);
      setErrorMessage(typeof e === "string" ? e : "Failed to open login window");
    }
  }

  function clearAccountData() {
    setUserProfile(null);
    setIsLoggedIn(false);
    setLikedTracks([]);
    setLikedTrackIds(new Set<string>());
    setHistoryTracks([]);
    setSubscribedArtistIds(new Set<string>());
    try {
      localStorage.removeItem("ytm_liked_tracks");
      localStorage.removeItem("ytm_history_tracks");
      localStorage.removeItem("ytm_subscribed_artists");
      localStorage.removeItem("ytm_session_cookies");
    } catch {}
  }

  async function checkAuth() {
    try {
      const profile = await invoke<UserProfile | null>("check_auth_status");
      if (profile) {
        setUserProfile(profile);
        setIsLoggedIn(true);
        syncAllUserData(true);
      } else {
        clearAccountData();
      }
    } catch (e) {
      console.error("Failed to check auth status:", e);
    }
  }

  async function logoutUser() {
    try {
      await invoke("logout");
    } finally {
      clearAccountData();
    }
  }

  async function minimizeWindow() {
    try {
      await invoke("window_minimize");
    } catch (e) {
      console.error("Minimize window failed:", e);
    }
  }

  async function toggleMaximizeWindow() {
    try {
      await invoke("window_toggle_maximize");
    } catch (e) {
      console.error("Toggle maximize failed:", e);
    }
  }

  async function closeWindow() {
    try {
      await invoke("window_close");
    } catch (e) {
      console.error("Close window failed:", e);
    }
  }

  async function startDraggingWindow() {
    try {
      await invoke("window_start_dragging");
    } catch (e) {
      // Fallback or ignore if drag fails
    }
  }

  function updateCrossfade(seconds: number) {
    setCrossfadeDuration(seconds);
    audio.setCrossfadeDuration(seconds);
  }

  function updatePlaybackRate(rate: number) {
    setPlaybackRate(rate);
    audio.setPlaybackRate(rate);
  }

  function setVolumeStep(step: number) {
    const clamped = Math.max(1, Math.min(20, Math.round(step)));
    setVolumeStepSignal(clamped);
    try {
      localStorage.setItem("ytm_volume_step", String(clamped));
    } catch {}
  }

  function setUiScale(pct: number) {
    const clamped = Math.max(80, Math.min(140, Math.round(pct)));
    setUiScaleSignal(clamped);
    try {
      localStorage.setItem("ytm_ui_scale", String(clamped));
    } catch {}
    applyUiScale(clamped);
  }

  function setDefaultShuffle(val: boolean) {
    setDefaultShuffleState(val);
    try {
      localStorage.setItem("ytm_default_shuffle", String(val));
    } catch {}
    if (val !== isShuffled()) {
      if (queue().length > 0) {
        toggleShuffle();
      } else {
        setIsShuffled(val);
        const ctx = contextTracks();
        if (ctx.length > 0) {
          if (val) {
            initShuffledContext(ctx, currentTrack()?.id);
          } else {
            setShuffledContextIndices([]);
          }
        }
      }
    }
  }

  function setStartupTab(tab: string) {
    setStartupTabState(tab);
    try {
      localStorage.setItem("ytm_startup_tab", tab);
    } catch {}
  }

  function setStartInTray(val: boolean) {
    setStartInTrayState(val);
    try {
      localStorage.setItem("ytm_start_in_tray", String(val));
    } catch {}
  }

  function updateEqualizer(bass: number, mid: number, treble: number) {
    setEqBass(bass);
    setEqMid(mid);
    setEqTreble(treble);
    audio.setEqualizer(bass, mid, treble);
  }

  // Initialize Plugin Context & PluginManager
  const pluginContext: PluginContext = {
    playTrack: (t) => playTrack(t, false),
    nextTrack: () => playNext(),
    prevTrack: () => playPrevious(),
    togglePlay: () => togglePlay(),
    setVolume: (v) => changeVolume(v),
    getVolume: () => volume(),
    setVolumeStep: (s) => setVolumeStep(s),
    getCurrentTrack: () => currentTrack(),
    getQueue: () => queue(),
    seek: (s) => seek(s),
    notify: (title, body, icon) => triggerPluginToast({ title, body, icon }),
  };
  pluginManager.init(pluginContext);

  // Clean up any legacy or stale saved queue that contains liked songs library or large dump
  try {
    const savedQueueRaw = localStorage.getItem("ytm_saved_queue");
    if (savedQueueRaw) {
      const parsedQueue = JSON.parse(savedQueueRaw);
      const isLikedDump =
        Array.isArray(parsedQueue) &&
        (parsedQueue.length >= 100 ||
          (initialLiked.length > 0 && parsedQueue.length === initialLiked.length) ||
          (initialLiked.length > 0 && parsedQueue[0]?.id === initialLiked[0]?.id));
      if (isLikedDump) {
        localStorage.removeItem("ytm_saved_queue");
        localStorage.removeItem("ytm_saved_index");
      }
    }
  } catch {}

  // Restore saved session queue ONLY if "session-restore" plugin is enabled and NOT liked songs
  if (pluginManager.isEnabled("session-restore")) {
    try {
      const savedQueueRaw = localStorage.getItem("ytm_saved_queue");
      const savedIdxRaw = localStorage.getItem("ytm_saved_index");
      if (savedQueueRaw) {
        const parsedQueue: Track[] = JSON.parse(savedQueueRaw);
        const isLikedDump =
          Array.isArray(parsedQueue) &&
          (parsedQueue.length >= 100 ||
            (initialLiked.length > 0 && parsedQueue.length === initialLiked.length) ||
            (initialLiked.length > 0 && parsedQueue[0]?.id === initialLiked[0]?.id));
        if (isLikedDump) {
          localStorage.removeItem("ytm_saved_queue");
          localStorage.removeItem("ytm_saved_index");
        } else if (Array.isArray(parsedQueue) && parsedQueue.length > 0) {
          const cleanedQueue = parsedQueue.map(cleanTrack);
          const savedIdx = Math.max(
            0,
            Math.min(cleanedQueue.length - 1, Number(savedIdxRaw || "0") || 0)
          );
          setQueue(cleanedQueue);
          setCurrentIndex(savedIdx);
          invoke("set_queue", {
            tracks: cleanedQueue,
            startIndex: savedIdx,
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Failed to restore saved session queue:", e);
    }
  }

  return {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    volumeStep,
    setVolumeStep,
    uiScale,
    setUiScale,
    isMuted,
    isShuffled,
    defaultShuffle,
    setDefaultShuffle,
    startupTab,
    setStartupTab,
    startInTray,
    setStartInTray,
    repeatMode,
    crossfadeDuration,
    playbackRate,
    eqBass,
    eqMid,
    eqTreble,
    queue,
    currentIndex,
    isLoading,
    errorMessage,
    lyrics,
    currentLyricIndex,
    lyricOffset,
    setLyricOffset,
    adjustLyricOffset,
    syncLyricsToLine,
    resetLyricOffset,
    searchResults,
    isSearching,
    homeTracks,
    isHomeLoading,
    exploreFeed,
    isExploreLoading,
    loadExploreFeed,
    chartsData,
    isChartsLoading,
    selectedCountry,
    loadCharts,
    activeChartPlaylistId,
    activeChartTracks,
    selectChartPlaylist,
    moodCategory,
    isMoodLoading,
    openMoodCategory,
    closeMoodCategory,
    fetchSuggestions,
    syncLikedSongs,
    syncHistorySongs,
    syncAllUserData,
    isSyncing,
    likedTrackIds,
    likedTracks,
    historyTracks,
    savedPlaylists,
    isPlaylistSaved,
    savePlaylist,
    removeSavedPlaylist,
    syncLibrary,
    isLoggedIn,
    setIsLoggedIn,
    userProfile,
    setUserProfile,
    checkAuth,
    logoutUser,
    clearAccountData,
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow,
    startDraggingWindow,
    togglePlay,
    pause,
    resume,
    seek,
    setScrubbing,
    changeVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    playNext,
    playPrevious,
    playTrack,
    playTrackAt,
    setFullQueue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    search,
    loadHomeFeed,
    loadPlaylistUrl,
    loadedPlaylist,
    closeLoadedPlaylist,
    contextTracks,
    upcomingContextTracks,
    contextName,
    lastContextIndex,
    shuffledContextIndices,
    contextHistory,
    setPlaybackContext,
    clearPlaybackContext,
    toggleLike,
    openLoginWindow,
    updateCrossfade,
    updatePlaybackRate,
    updateEqualizer,
    selectedArtistId,
    artistProfile,
    isArtistLoading,
    openArtist,
    closeArtist,
    subscribedArtistIds,
    toggleSubscribeArtist,
    selectedPlaylistId,
    selectedPlaylistMeta,
    openedPlaylist,
    isPlaylistLoading,
    openPlaylist,
    closePlaylist,
    exploreTab,
    setExploreTab,
    preloadTrack,
    songRecommendations,
    isRecommendationsLoading,
    loadSongRecommendations,
    addRecommendationsToQueue,
    startSongRadio,
    nowPlayingSubTab,
    setNowPlayingSubTab,
    clearError: () => setErrorMessage(null),
  };
}

export const playerStore = createRoot(createPlayerStore);
