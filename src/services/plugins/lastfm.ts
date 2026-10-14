import SparkMD5 from "spark-md5";
import { YTMPlugin, PluginContext, scrobbleCount, setScrobbleCount } from "../pluginManager";
import { Track } from "../../models/track";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface LastFmSettings {
  apiKey: string;
  apiSecret: string;
  username: string;
  sessionKey: string;
  updateNowPlaying: boolean;
  showToastOnScrobble: boolean;
}

// User-configurable Last.fm credentials (configured via Plugin Settings)
export const DEFAULT_LASTFM_API_KEY = "";
export const DEFAULT_LASTFM_API_SECRET = "";

const STORAGE_KEY = "ytm_lastfm_settings";

export const DEFAULT_LASTFM_SETTINGS: LastFmSettings = {
  apiKey: DEFAULT_LASTFM_API_KEY,
  apiSecret: DEFAULT_LASTFM_API_SECRET,
  username: "",
  sessionKey: "",
  updateNowPlaying: true,
  showToastOnScrobble: true,
};

export function getLastFmSettings(): LastFmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: typeof parsed.apiKey === "string" && parsed.apiKey ? parsed.apiKey : DEFAULT_LASTFM_API_KEY,
        apiSecret: typeof parsed.apiSecret === "string" && parsed.apiSecret ? parsed.apiSecret : DEFAULT_LASTFM_API_SECRET,
        username: typeof parsed.username === "string" ? parsed.username : "",
        sessionKey: typeof parsed.sessionKey === "string" ? parsed.sessionKey : "",
        updateNowPlaying: parsed.updateNowPlaying !== undefined ? Boolean(parsed.updateNowPlaying) : true,
        showToastOnScrobble: parsed.showToastOnScrobble !== undefined ? Boolean(parsed.showToastOnScrobble) : true,
      };
    }
  } catch (e) {
    console.warn("Failed to load Last.fm settings:", e);
  }
  return { ...DEFAULT_LASTFM_SETTINGS };
}

export function saveLastFmSettings(settings: LastFmSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save Last.fm settings:", e);
  }
}

/**
 * Generate Last.fm API signature:
 * Sort all parameter keys alphabetically, concatenate key + value, append apiSecret, hash with MD5.
 */
export function generateApiSignature(params: Record<string, string>, apiSecret: string): string {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== "format" && k !== "callback" && k !== "api_sig")
    .sort();

  let sigString = "";
  for (const key of sortedKeys) {
    sigString += key + params[key];
  }
  sigString += apiSecret;

  return SparkMD5.hash(sigString);
}

let activeContext: PluginContext | null = null;
let currentTrackStartTimestamp: number = 0;
let currentTrackId: string | null = null;
let hasScrobbledCurrent = false;
let pendingAuthToken: string | null = null;

export async function requestLastFmAuthToken(): Promise<string> {
  const settings = getLastFmSettings();
  const apiKey = settings.apiKey.trim() || DEFAULT_LASTFM_API_KEY;

  if (!apiKey) {
    throw new Error("API Key is required. Please enter your Last.fm API Key and Secret below under 'API Credentials', or paste an existing Session Key.");
  }

  const url = `https://ws.audioscrobbler.com/2.0/?method=auth.getToken&api_key=${encodeURIComponent(
    apiKey
  )}&format=json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to get Last.fm auth token: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data?.token) {
    throw new Error("Invalid response from Last.fm getToken");
  }

  pendingAuthToken = data.token;
  return data.token;
}

export async function openLastFmAuthPage(token?: string): Promise<string> {
  const settings = getLastFmSettings();
  const apiKey = settings.apiKey.trim() || DEFAULT_LASTFM_API_KEY;

  if (!apiKey) {
    throw new Error("API Key is required. Please enter your Last.fm API Key below first.");
  }

  const authToken = token || (await requestLastFmAuthToken());

  const authUrl = `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(
    apiKey
  )}&token=${encodeURIComponent(authToken)}`;

  try {
    await openUrl(authUrl);
  } catch {
    window.open(authUrl, "_blank");
  }

  return authToken;
}

export async function completeLastFmAuth(token?: string): Promise<{ username: string; sessionKey: string }> {
  const settings = getLastFmSettings();
  const apiKey = settings.apiKey.trim() || DEFAULT_LASTFM_API_KEY;
  const apiSecret = settings.apiSecret.trim() || DEFAULT_LASTFM_API_SECRET;
  const authToken = token || pendingAuthToken;

  if (!apiKey || !apiSecret) {
    throw new Error("Both API Key and API Secret are required to complete web authorization.");
  }

  if (!authToken) {
    throw new Error("No pending authorization token found. Please start authentication first.");
  }

  const params: Record<string, string> = {
    method: "auth.getSession",
    api_key: apiKey,
    token: authToken,
  };

  const apiSig = generateApiSignature(params, apiSecret);
  params.api_sig = apiSig;
  params.format = "json";

  const searchParams = new URLSearchParams(params);
  const url = `https://ws.audioscrobbler.com/2.0/?${searchParams.toString()}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data?.error) {
    throw new Error(data.message || `Last.fm auth failed (code ${data.error})`);
  }

  const session = data?.session;
  if (!session?.key || !session?.name) {
    throw new Error("Failed to extract session credentials from Last.fm response");
  }

  const updatedSettings: LastFmSettings = {
    ...settings,
    username: session.name,
    sessionKey: session.key,
  };

  saveLastFmSettings(updatedSettings);
  pendingAuthToken = null;

  return {
    username: session.name,
    sessionKey: session.key,
  };
}

export async function disconnectLastFm(): Promise<void> {
  const settings = getLastFmSettings();
  saveLastFmSettings({
    ...settings,
    username: "",
    sessionKey: "",
  });
  pendingAuthToken = null;
}

async function sendNowPlaying(track: Track): Promise<void> {
  const settings = getLastFmSettings();
  if (!settings.sessionKey || !settings.updateNowPlaying) return;
  if (!track.title || !track.artist) return;

  const apiKey = settings.apiKey.trim() || DEFAULT_LASTFM_API_KEY;
  const apiSecret = settings.apiSecret.trim() || DEFAULT_LASTFM_API_SECRET;

  const params: Record<string, string> = {
    method: "track.updateNowPlaying",
    api_key: apiKey,
    sk: settings.sessionKey,
    artist: track.artist,
    track: track.title,
  };

  if (track.album) {
    params.album = track.album;
  }
  if (track.duration_seconds && track.duration_seconds > 0) {
    params.duration = Math.round(track.duration_seconds).toString();
  }

  params.api_sig = generateApiSignature(params, apiSecret);
  params.format = "json";

  const body = new URLSearchParams(params);

  try {
    await fetch("https://ws.audioscrobbler.com/2.0/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (e) {
    console.warn("Last.fm Now Playing notice:", e);
  }
}

async function submitScrobble(track: Track, timestampSecs: number): Promise<void> {
  const settings = getLastFmSettings();
  if (!track.title || !track.artist) return;

  // If session key is configured, post to Last.fm API
  if (settings.sessionKey) {
    const apiKey = settings.apiKey.trim() || DEFAULT_LASTFM_API_KEY;
    const apiSecret = settings.apiSecret.trim() || DEFAULT_LASTFM_API_SECRET;

    const params: Record<string, string> = {
      method: "track.scrobble",
      api_key: apiKey,
      sk: settings.sessionKey,
      artist: track.artist,
      track: track.title,
      timestamp: timestampSecs.toString(),
    };

    if (track.album) {
      params.album = track.album;
    }

    params.api_sig = generateApiSignature(params, apiSecret);
    params.format = "json";

    const body = new URLSearchParams(params);

    try {
      const res = await fetch("https://ws.audioscrobbler.com/2.0/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        console.warn(`Last.fm scrobble HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn("Last.fm scrobble notice:", e);
    }
  }

  // Also record playback to YouTube watch history
  if (track.id) {
    const cookies = localStorage.getItem("ytm_session_cookies");
    invoke<boolean>("record_playback", {
      videoId: track.id,
      cookies: cookies || null,
    }).catch(() => {});
  }

  // Increment scrobble counter
  const nextCount = scrobbleCount() + 1;
  setScrobbleCount(nextCount);
  try {
    localStorage.setItem("ytm_scrobbles_count", String(nextCount));
  } catch (_) {}

  // Trigger feedback toast if enabled
  if (settings.showToastOnScrobble && activeContext) {
    activeContext.notify(
      "Last.fm Scrobbler",
      `🎵 Scrobbled: ${track.title} • ${track.artist}`,
      track.thumbnail_url
    );
  }
}

export const lastFmPlugin: YTMPlugin = {
  id: "scrobbler",
  name: "Audio Scrobbler (Last.fm)",
  version: "2.0.0",
  description: "Submits scrobbles to Last.fm after listening to 50% or 4 minutes of a song, with live Now Playing updates.",
  author: "Last.fm & YTM Community",
  enabled: false,

  onEnable: (ctx) => {
    activeContext = ctx;
    const current = ctx.getCurrentTrack();
    if (current) {
      currentTrackId = current.id;
      currentTrackStartTimestamp = Math.floor(Date.now() / 1000);
      hasScrobbledCurrent = false;
      sendNowPlaying(current);
    }
  },

  onDisable: () => {
    activeContext = null;
    currentTrackId = null;
    hasScrobbledCurrent = false;
  },

  onTrackChange: (track: Track) => {
    currentTrackId = track.id;
    currentTrackStartTimestamp = Math.floor(Date.now() / 1000);
    hasScrobbledCurrent = false;

    if (track) {
      sendNowPlaying(track);
    }
  },

  onTimeUpdate: (cur: number, dur: number) => {
    const track = activeContext?.getCurrentTrack();
    if (!track || !track.id) return;

    // Track ID check to prevent duplicate scrobbles
    if (hasScrobbledCurrent && currentTrackId === track.id) return;

    // Last.fm scrobble condition:
    // Track duration >= 30s
    // Listened to at least 50% of track or 240s (4 minutes)
    // Minimum listened: at least 10 seconds
    const thresholdSecs = dur > 0 ? Math.min(dur * 0.5, 240) : 240;

    if (dur >= 30 && cur >= thresholdSecs && cur >= 10) {
      hasScrobbledCurrent = true;
      currentTrackId = track.id;
      const timestamp = currentTrackStartTimestamp > 0
        ? currentTrackStartTimestamp
        : Math.floor(Date.now() / 1000) - Math.floor(cur);

      submitScrobble(track, timestamp);
    }
  },
};
