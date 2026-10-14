import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Track } from "../models/track";
import { sponsorBlockPlugin } from "./plugins/sponsorBlock";
import { lastFmPlugin } from "./plugins/lastfm";
import { getDiscordRpcSettings } from "./plugins/discordRpc";
import { getDesktopNotificationsSettings } from "./plugins/desktopNotifications";

export interface PluginContext {
  playTrack: (track: Track) => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  togglePlay: () => void;
  setVolume: (vol: number) => void;
  getVolume: () => number;
  setVolumeStep?: (step: number) => void;
  getCurrentTrack: () => Track | null;
  getQueue: () => Track[];
  seek?: (seconds: number) => void;
  notify: (title: string, body: string, icon?: string) => void;
}

export interface YTMPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled: boolean;
  hasSettings?: boolean;
  onEnable?: (ctx: PluginContext) => void | Promise<void>;
  onDisable?: (ctx?: PluginContext) => void | Promise<void>;
  onTrackChange?: (track: Track) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export interface PluginToast {
  title: string;
  body: string;
  icon?: string;
}

const STORAGE_KEY = "ytm_plugins_enabled";

const loadInitialEnabledIds = (): Set<string> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return new Set<string>(parsed);
      }
    }
  } catch (e) {
    console.warn("Failed to load plugin state from localStorage:", e);
  }
  // Default enabled plugins on first launch
  return new Set<string>(["session-restore"]);
};

export const [enabledPluginIds, setEnabledPluginIds] = createSignal<Set<string>>(
  loadInitialEnabledIds()
);

export const [activeToast, setActiveToast] = createSignal<PluginToast | null>(null);

export const [scrobbleCount, setScrobbleCount] = createSignal<number>(
  Number(localStorage.getItem("ytm_scrobbles_count") || "0")
);

let toastTimeoutId: number | null = null;

export function triggerPluginToast(toast: PluginToast, durationMs?: number) {
  if (toastTimeoutId !== null) {
    window.clearTimeout(toastTimeoutId);
  }
  setActiveToast(toast);
  const dur = durationMs ?? (getDesktopNotificationsSettings().toastDurationSeconds * 1000 || 3500);
  toastTimeoutId = window.setTimeout(() => {
    setActiveToast(null);
    toastTimeoutId = null;
  }, dur);
}

export function dismissPluginToast() {
  if (toastTimeoutId !== null) {
    window.clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
  setActiveToast(null);
}

class PluginManagerService {
  private plugins: Map<string, YTMPlugin> = new Map();
  private enabledIds: Set<string> = new Set();
  private context: PluginContext | null = null;

  constructor() {
    this.loadState();
  }

  private loadState() {
    this.enabledIds = new Set(enabledPluginIds());
  }

  private saveState() {
    try {
      const arr = Array.from(this.enabledIds);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      setEnabledPluginIds(new Set(arr));
    } catch (e) {
      console.warn("Failed to save plugin state:", e);
    }
  }

  public isEnabled(id: string): boolean {
    return enabledPluginIds().has(id);
  }

  public init(context: PluginContext) {
    this.context = context;
    // Register built-in plugins
    this.registerBuiltins();

    // Sync signal with registered defaults
    setEnabledPluginIds(new Set(this.enabledIds));

    // Start enabled plugins
    for (const [id, plugin] of this.plugins.entries()) {
      if (this.enabledIds.has(id)) {
        plugin.enabled = true;
        try {
          plugin.onEnable?.(this.context);
        } catch (e) {
          console.error(`Error enabling plugin ${id}:`, e);
        }
      } else {
        plugin.enabled = false;
      }
    }
  }

  public register(plugin: YTMPlugin) {
    if (this.plugins.has(plugin.id)) {
      return;
    }

    const isEnabled = this.enabledIds.has(plugin.id);
    plugin.enabled = isEnabled;
    this.plugins.set(plugin.id, plugin);

    if (isEnabled && this.context) {
      try {
        plugin.onEnable?.(this.context);
      } catch (e) {
        console.error(`Error enabling plugin ${plugin.id}:`, e);
      }
    }
  }

  public unregister(id: string) {
    const plugin = this.plugins.get(id);
    if (plugin && plugin.enabled) {
      try {
        plugin.onDisable?.(this.context || undefined);
      } catch (e) {
        console.error(`Error disabling plugin ${id}:`, e);
      }
    }
    this.plugins.delete(id);
  }

  public async togglePlugin(id: string): Promise<boolean> {
    const plugin = this.plugins.get(id);
    if (!plugin || !this.context) return false;

    if (plugin.enabled) {
      plugin.enabled = false;
      this.enabledIds.delete(id);
      this.saveState();
      try {
        await plugin.onDisable?.(this.context);
      } catch (e) {
        console.error(`Error in onDisable of plugin ${id}:`, e);
      }
      return false;
    } else {
      plugin.enabled = true;
      this.enabledIds.add(id);
      this.saveState();
      try {
        await plugin.onEnable?.(this.context);
      } catch (e) {
        console.error(`Error in onEnable of plugin ${id}:`, e);
      }
      return true;
    }
  }

  public getAllPlugins(): YTMPlugin[] {
    return Array.from(this.plugins.values());
  }

  public getPlugin(id: string): YTMPlugin | undefined {
    return this.plugins.get(id);
  }

  // Lifecycle dispatchers
  public notifyTrackChange(track: Track) {
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled) {
        try {
          plugin.onTrackChange?.(track);
        } catch (e) {
          console.error(`Plugin ${plugin.id} onTrackChange error:`, e);
        }
      }
    }
  }

  public notifyPlaybackStateChange(isPlaying: boolean) {
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled) {
        try {
          plugin.onPlaybackStateChange?.(isPlaying);
        } catch (e) {
          console.error(`Plugin ${plugin.id} onPlaybackStateChange error:`, e);
        }
      }
    }
  }

  public notifyTimeUpdate(currentTime: number, duration: number) {
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled) {
        try {
          plugin.onTimeUpdate?.(currentTime, duration);
        } catch (e) {
          console.error(`Plugin ${plugin.id} onTimeUpdate error:`, e);
        }
      }
    }
  }

  private registerBuiltins() {
    // 1. Precise Volume Control Plugin
    this.register({
      id: "precise-volume",
      name: "Precise Volume Step (1%)",
      version: "1.1.0",
      description: "Enables ultra-fine 1% volume increments and mousewheel control over player bar.",
      author: "Pear & YTM Team",
      enabled: false,
      onEnable: (ctx) => {
        ctx.setVolumeStep?.(1);
      },
      onDisable: (ctx) => {
        ctx?.setVolumeStep?.(5);
      },
    });

    // 2. Desktop Toast Notifications
    this.register({
      id: "desktop-notifications",
      name: "Native Desktop Notifications",
      version: "1.2.0",
      description: "Shows Windows system toast notification with cover art when a new track starts.",
      author: "Pear Music Port",
      enabled: false,
      hasSettings: true,
      onEnable: (ctx) => {
        const current = ctx.getCurrentTrack();
        if (current) {
          const cfg = getDesktopNotificationsSettings();
          if (cfg.inAppToast) {
            triggerPluginToast({
              title: current.title,
              body: current.artist,
              icon: cfg.showCoverArt ? current.thumbnail_url : undefined,
            });
          }
        }
      },
      onTrackChange: (track) => {
        const cfg = getDesktopNotificationsSettings();
        if (cfg.inAppToast) {
          triggerPluginToast({
            title: track.title,
            body: track.artist,
            icon: cfg.showCoverArt ? track.thumbnail_url : undefined,
          });
        }

        if (cfg.nativeNotification && "Notification" in window) {
          const icon = cfg.showCoverArt ? track.thumbnail_url || undefined : undefined;
          if (Notification.permission === "granted") {
            try {
              new Notification(track.title, {
                body: track.artist,
                icon,
                silent: true,
              });
            } catch (_) {}
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((permission) => {
              if (permission === "granted") {
                try {
                  new Notification(track.title, {
                    body: track.artist,
                    icon,
                    silent: true,
                  });
                } catch (_) {}
              }
            });
          }
        }
      },
    });

    // 3. Discord RPC / Rich Presence
    this.register({
      id: "discord-rich-presence",
      name: "Discord Rich Presence",
      version: "1.1.0",
      description: "Displays current track title, artist, and playback progress on Discord profile.",
      author: "YTM Desktop",
      enabled: false,
      hasSettings: true,
      onEnable: (ctx) => {
        const track = ctx.getCurrentTrack();
        if (track) {
          const cfg = getDiscordRpcSettings();
          const title = cfg.showDetails
            ? (cfg.customDetailsPrefix ? `${cfg.customDetailsPrefix} ${track.title}` : track.title)
            : "Playing Audio";
          const artist = cfg.showState ? track.artist : "";
          const durSecs = cfg.showTimeRemaining ? Math.round(track.duration_seconds || 0) : 0;
          invoke("set_discord_rpc", {
            title,
            artist,
            durationSecs: durSecs,
          }).catch(() => {});
        }
      },
      onTrackChange: (track) => {
        const cfg = getDiscordRpcSettings();
        const title = cfg.showDetails
          ? (cfg.customDetailsPrefix ? `${cfg.customDetailsPrefix} ${track.title}` : track.title)
          : "Playing Audio";
        const artist = cfg.showState ? track.artist : "";
        const durSecs = cfg.showTimeRemaining ? Math.round(track.duration_seconds || 0) : 0;
        invoke("set_discord_rpc", {
          title,
          artist,
          durationSecs: durSecs,
        }).catch(() => {});
      },
      onDisable: () => {
        invoke("clear_discord_rpc").catch(() => {});
      },
    });

    // 4. SponsorBlock for Music Videos
    sponsorBlockPlugin.hasSettings = true;
    this.register(sponsorBlockPlugin);

    // 5. Audio Scrobbler (Last.fm)
    lastFmPlugin.hasSettings = true;
    this.register(lastFmPlugin);

    // 6. Skip Silence & Dead Air
    this.register({
      id: "auto-skip-silence",
      name: "Skip Silence & Dead Air",
      version: "1.0.0",
      description: "Automatically cuts silence gaps at track edges for instantaneous flow.",
      author: "Pear Music Port",
      enabled: false,
    });

    // 7. Ambient Glow / Cover Lighting
    this.register({
      id: "ambient-glow",
      name: "Ambient Cover Glow",
      version: "1.2.0",
      description: "Dynamic fluid glow synchronized with the current track album art.",
      author: "Pear Music Port",
      enabled: false,
    });

    // 8. Auto-Save Session Queue
    this.register({
      id: "session-restore",
      name: "Auto-Save & Restore Queue",
      version: "1.0.0",
      description: "Preserves your queue and current playhead position across application restarts.",
      author: "YTM Team",
      enabled: true,
      onEnable: (ctx) => {
        try {
          const q = ctx.getQueue();
          const cur = ctx.getCurrentTrack();
          if (q.length > 0) {
            localStorage.setItem("ytm_saved_queue", JSON.stringify(q));
          }
          if (cur) {
            localStorage.setItem("ytm_last_track", JSON.stringify(cur));
          }
        } catch (_) {}
      },
      onTrackChange: (track) => {
        try {
          localStorage.setItem("ytm_last_track", JSON.stringify(track));
          const q = this.context?.getQueue() || [];
          if (q.length > 0) {
            localStorage.setItem("ytm_saved_queue", JSON.stringify(q));
            const idx = q.findIndex((t) => t.id === track.id);
            if (idx !== -1) {
              localStorage.setItem("ytm_saved_index", String(idx));
            }
          }
        } catch (_) {}
      },
    });
  }
}

export const pluginManager = new PluginManagerService();
