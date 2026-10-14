import { Component, createSignal, Show, For, onMount } from "solid-js";
import {
  X,
  Shield,
  Radio,
  Tv,
  Bell,
  Check,
  ExternalLink,
  RefreshCw,
  LogOut,
  Sparkles,
  Info,
} from "lucide-solid";
import {
  getSponsorBlockSettings,
  saveSponsorBlockSettings,
  SPONSORBLOCK_CATEGORIES,
  SponsorBlockSettings,
} from "../../services/plugins/sponsorBlock";
import {
  getLastFmSettings,
  saveLastFmSettings,
  openLastFmAuthPage,
  completeLastFmAuth,
  disconnectLastFm,
  LastFmSettings,
} from "../../services/plugins/lastfm";
import {
  getDiscordRpcSettings,
  saveDiscordRpcSettings,
  DiscordRpcSettings,
} from "../../services/plugins/discordRpc";
import {
  getDesktopNotificationsSettings,
  saveDesktopNotificationsSettings,
  DesktopNotificationsSettings,
} from "../../services/plugins/desktopNotifications";
import { triggerPluginToast, scrobbleCount } from "../../services/pluginManager";
import { invoke } from "@tauri-apps/api/core";
import { playerStore } from "../../stores/playerStore";

interface PluginSettingsModalProps {
  pluginId: string | null;
  onClose: () => void;
}

export const PluginSettingsModal: Component<PluginSettingsModalProps> = (props) => {
  // SponsorBlock state
  const [sbSettings, setSbSettings] = createSignal<SponsorBlockSettings>(
    getSponsorBlockSettings()
  );

  // Last.fm state
  const [lfmSettings, setLfmSettings] = createSignal<LastFmSettings>(
    getLastFmSettings()
  );
  const [lfmPendingToken, setLfmPendingToken] = createSignal<string | null>(null);
  const [lfmLoading, setLfmLoading] = createSignal(false);
  const [lfmStatusMsg, setLfmStatusMsg] = createSignal<string | null>(null);

  // Discord RPC state
  const [rpcSettings, setRpcSettings] = createSignal<DiscordRpcSettings>(
    getDiscordRpcSettings()
  );

  // Desktop Notifications state
  const [notifSettings, setNotifSettings] = createSignal<DesktopNotificationsSettings>(
    getDesktopNotificationsSettings()
  );

  onMount(() => {
    setSbSettings(getSponsorBlockSettings());
    setLfmSettings(getLastFmSettings());
    setRpcSettings(getDiscordRpcSettings());
    setNotifSettings(getDesktopNotificationsSettings());
  });

  // --- SponsorBlock Handlers ---
  const handleToggleSbCategory = (catId: string) => {
    const current = sbSettings();
    const exists = current.categories.includes(catId);
    const updatedCats = exists
      ? current.categories.filter((c) => c !== catId)
      : [...current.categories, catId];

    const updated = { ...current, categories: updatedCats };
    setSbSettings(updated);
    saveSponsorBlockSettings(updated);
  };

  const handleToggleSbAutoSkip = (autoSkip: boolean) => {
    const updated = { ...sbSettings(), autoSkip };
    setSbSettings(updated);
    saveSponsorBlockSettings(updated);
  };

  const handleToggleSbNotification = () => {
    const updated = { ...sbSettings(), showNotification: !sbSettings().showNotification };
    setSbSettings(updated);
    saveSponsorBlockSettings(updated);
  };

  // --- Last.fm Handlers ---
  const handleStartLfmAuth = async () => {
    setLfmLoading(true);
    setLfmStatusMsg("Opening Last.fm authorization in browser...");
    try {
      const token = await openLastFmAuthPage();
      setLfmPendingToken(token);
      setLfmStatusMsg("Approve permission in your browser, then click 'Complete Connection' below.");
    } catch (err: any) {
      setLfmStatusMsg(`Error: ${err?.message || "Failed to start authorization"}`);
    } finally {
      setLfmLoading(false);
    }
  };

  const handleCompleteLfmAuth = async () => {
    setLfmLoading(true);
    setLfmStatusMsg("Exchanging token for Last.fm session...");
    try {
      const res = await completeLastFmAuth(lfmPendingToken() || undefined);
      setLfmSettings(getLastFmSettings());
      setLfmPendingToken(null);
      setLfmStatusMsg(`Connected successfully as ${res.username}!`);
      triggerPluginToast({
        title: "Last.fm Connected",
        body: `Logged in as ${res.username}`,
      });
    } catch (err: any) {
      setLfmStatusMsg(`Auth Error: ${err?.message || "Failed to complete authentication"}`);
    } finally {
      setLfmLoading(false);
    }
  };

  const handleDisconnectLfm = async () => {
    await disconnectLastFm();
    setLfmSettings(getLastFmSettings());
    setLfmPendingToken(null);
    setLfmStatusMsg("Disconnected from Last.fm.");
  };

  const handleUpdateLfmField = (field: keyof LastFmSettings, val: any) => {
    const updated = { ...lfmSettings(), [field]: val };
    setLfmSettings(updated);
    saveLastFmSettings(updated);
  };

  // --- Discord RPC Handlers ---
  const handleUpdateRpcField = (field: keyof DiscordRpcSettings, val: any) => {
    const updated = { ...rpcSettings(), [field]: val };
    setRpcSettings(updated);
    saveDiscordRpcSettings(updated);

    // Refresh Discord presence if track is currently playing
    const cur = playerStore.currentTrack();
    if (cur) {
      const title = updated.showDetails
        ? (updated.customDetailsPrefix ? `${updated.customDetailsPrefix} ${cur.title}` : cur.title)
        : "Playing Audio";
      const artist = updated.showState ? cur.artist : "";
      const durSecs = updated.showTimeRemaining ? Math.round(cur.duration_seconds || 0) : 0;
      invoke("set_discord_rpc", {
        title,
        artist,
        durationSecs: durSecs,
      }).catch(() => {});
    }
  };

  const handleTestDiscordRpc = () => {
    const cur = playerStore.currentTrack();
    const title = cur ? cur.title : "YouTube Music Desktop";
    const artist = cur ? cur.artist : "Pear & YTM Team";
    const durSecs = cur ? Math.round(cur.duration_seconds || 0) : 180;
    invoke("set_discord_rpc", {
      title,
      artist,
      durationSecs: durSecs,
    })
      .then(() => {
        triggerPluginToast({
          title: "Discord RPC",
          body: "Presence payload dispatched to Discord pipe.",
        });
      })
      .catch((e) => {
        triggerPluginToast({
          title: "Discord RPC Notice",
          body: String(e || "Discord client not detected"),
        });
      });
  };

  // --- Desktop Notifications Handlers ---
  const handleUpdateNotifField = (field: keyof DesktopNotificationsSettings, val: any) => {
    const updated = { ...notifSettings(), [field]: val };
    setNotifSettings(updated);
    saveDesktopNotificationsSettings(updated);
  };

  const handleTestNotification = () => {
    const cur = playerStore.currentTrack();
    const title = cur ? cur.title : "Retro Red Notification";
    const body = cur ? `by ${cur.artist}` : "Desktop Toast Notification System is Active";
    const icon = notifSettings().showCoverArt ? cur?.thumbnail_url : undefined;

    if (notifSettings().inAppToast) {
      triggerPluginToast({ title, body, icon });
    }

    if (notifSettings().nativeNotification && "Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          new Notification(title, { body, icon, silent: true });
        } catch (_) {}
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            try {
              new Notification(title, { body, icon, silent: true });
            } catch (_) {}
          }
        });
      }
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 font-mono select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="relative w-full max-w-xl max-h-[88vh] flex flex-col bg-[#0a0a0a] border border-[#ff2222]/50 shadow-[0_0_35px_rgba(255,34,34,0.18)] text-xs text-white">
        {/* Retro Header Accent Bar */}
        <div class="h-0.5 bg-[#ff2222] w-full" />

        {/* Modal Header */}
        <div class="px-5 py-3.5 border-b border-[#181818] flex items-center justify-between bg-[#0e0e0e]">
          <div class="flex items-center gap-2.5">
            <Show when={props.pluginId === "sponsorblock"}>
              <Shield class="w-4 h-4 text-[#ff2222]" />
              <h3 class="text-sm font-bold text-white tracking-wide">SponsorBlock Settings</h3>
            </Show>
            <Show when={props.pluginId === "scrobbler"}>
              <Radio class="w-4 h-4 text-[#ff2222]" />
              <h3 class="text-sm font-bold text-white tracking-wide">Last.fm Scrobbler Settings</h3>
            </Show>
            <Show when={props.pluginId === "discord-rich-presence"}>
              <Tv class="w-4 h-4 text-[#ff2222]" />
              <h3 class="text-sm font-bold text-white tracking-wide">Discord Rich Presence Settings</h3>
            </Show>
            <Show when={props.pluginId === "desktop-notifications"}>
              <Bell class="w-4 h-4 text-[#ff2222]" />
              <h3 class="text-sm font-bold text-white tracking-wide">Desktop Notifications Settings</h3>
            </Show>
          </div>

          <button
            type="button"
            onClick={props.onClose}
            class="p-1 hover:bg-[#1a0505] text-[#888888] hover:text-[#ff2222] border border-transparent hover:border-[#ff2222]/40 transition-colors"
            title="Close modal"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div class="p-5 overflow-y-auto space-y-5 flex-1 min-h-[300px]">
          {/* ==================== SPONSORBLOCK SETTINGS ==================== */}
          <Show when={props.pluginId === "sponsorblock"}>
            <div class="space-y-4">
              <div class="p-3 bg-[#120606] border border-[#ff2222]/30 flex items-start gap-2.5 text-[#aaaaaa] text-[11px] leading-relaxed">
                <Info class="w-4 h-4 text-[#ff2222] shrink-0 mt-0.5" />
                <div>
                  <span class="text-white font-semibold">SponsorBlock for Music: </span>
                  Automatically skips non-music intros, music video dialogue, skit scenes, and sponsored interruptions using crowdsourced segment markers from Ajay's SponsorBlock database.
                </div>
              </div>

              {/* Behavior Mode Selector */}
              <div>
                <label class="block text-[11px] font-bold text-[#aaaaaa] uppercase tracking-wider mb-2">
                  Action Mode
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSbAutoSkip(true)}
                    class={`p-2.5 border text-left flex items-center justify-between transition-colors ${
                      sbSettings().autoSkip
                        ? "border-[#ff2222] bg-[#1a0505] text-white"
                        : "border-[#222222] bg-[#111111] text-[#888888] hover:border-[#333333]"
                    }`}
                  >
                    <div>
                      <div class="font-bold text-xs">Auto-Skip (Seek)</div>
                      <div class="text-[10px] text-[#888888] mt-0.5">Jump past segments automatically</div>
                    </div>
                    <Show when={sbSettings().autoSkip}>
                      <Check class="w-4 h-4 text-[#ff2222]" />
                    </Show>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleSbAutoSkip(false)}
                    class={`p-2.5 border text-left flex items-center justify-between transition-colors ${
                      !sbSettings().autoSkip
                        ? "border-[#ff2222] bg-[#1a0505] text-white"
                        : "border-[#222222] bg-[#111111] text-[#888888] hover:border-[#333333]"
                    }`}
                  >
                    <div>
                      <div class="font-bold text-xs">Notify Only</div>
                      <div class="text-[10px] text-[#888888] mt-0.5">Show in-app banner without skipping</div>
                    </div>
                    <Show when={!sbSettings().autoSkip}>
                      <Check class="w-4 h-4 text-[#ff2222]" />
                    </Show>
                  </button>
                </div>
              </div>

              {/* In-app Notification Toggle */}
              <div class="flex items-center justify-between p-3 bg-[#111111] border border-[#1e1e1e]">
                <div>
                  <div class="font-semibold text-white text-xs">In-App Notification</div>
                  <div class="text-[10px] text-[#888888] mt-0.5">
                    Show "⏭️ Skipped non-music intro/outro (SponsorBlock)" toast
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={sbSettings().showNotification}
                  onClick={handleToggleSbNotification}
                  class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors ${
                    sbSettings().showNotification ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                  }`}
                >
                  <span
                    class={`inline-block h-3.5 w-3.5 transform bg-black shadow transition mt-[2px] ml-[2px] ${
                      sbSettings().showNotification ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                    }`}
                  />
                </button>
              </div>

              {/* Categories Selection */}
              <div>
                <label class="block text-[11px] font-bold text-[#aaaaaa] uppercase tracking-wider mb-2">
                  Active Skip Categories ({sbSettings().categories.length} selected)
                </label>
                <div class="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  <For each={SPONSORBLOCK_CATEGORIES}>
                    {(cat) => {
                      const isChecked = () => sbSettings().categories.includes(cat.id);
                      return (
                        <div
                          onClick={() => handleToggleSbCategory(cat.id)}
                          class={`p-2.5 border cursor-pointer flex items-center justify-between transition-colors ${
                            isChecked()
                              ? "bg-[#140606] border-[#ff2222]/50 text-white"
                              : "bg-[#101010] border-[#1c1c1c] text-[#888888] hover:border-[#2a2a2a]"
                          }`}
                        >
                          <div class="min-w-0 pr-3">
                            <div class="font-bold text-xs flex items-center gap-2">
                              <span>{cat.name}</span>
                              <span class="text-[9px] px-1 py-0.2 rounded-none bg-[#1a1a1a] text-[#888888]">
                                {cat.id}
                              </span>
                            </div>
                            <div class="text-[10px] text-[#777777] mt-0.5 truncate">{cat.description}</div>
                          </div>
                          <div
                            class={`w-4 h-4 shrink-0 border flex items-center justify-center ${
                              isChecked() ? "border-[#ff2222] bg-[#ff2222] text-black" : "border-[#333333] bg-[#161616]"
                            }`}
                          >
                            <Show when={isChecked()}>
                              <Check class="w-3 h-3 stroke-[3]" />
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </div>
          </Show>

          {/* ==================== LAST.FM SCROBBLER SETTINGS ==================== */}
          <Show when={props.pluginId === "scrobbler"}>
            <div class="space-y-4">
              {/* Connection Status Card */}
              <div class="p-3.5 bg-[#120606] border border-[#ff2222]/40 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div class="text-[10px] uppercase font-bold text-[#888888]">Last.fm Account</div>
                  <div class="text-sm font-bold flex items-center gap-2 mt-0.5">
                    <Show
                      when={Boolean(lfmSettings().sessionKey && lfmSettings().username)}
                      fallback={
                        <span class="text-[#ff5555] flex items-center gap-1.5">
                          <span class="w-2 h-2 rounded-full bg-[#ff3333] inline-block animate-pulse" />
                          Not Connected
                        </span>
                      }
                    >
                      <span class="text-[#55ff55] flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-[#33ff33] inline-block" />
                        Connected as {lfmSettings().username}
                      </span>
                    </Show>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <span class="text-[10px] px-2 py-0.5 bg-[#1c0808] border border-[#ff2222]/30 text-[#ff2222] font-bold">
                    {scrobbleCount()} Scrobbles
                  </span>
                  <Show when={Boolean(lfmSettings().sessionKey)}>
                    <button
                      type="button"
                      onClick={handleDisconnectLfm}
                      class="px-2.5 py-1 text-[10px] bg-[#181818] hover:bg-[#250808] text-[#888888] hover:text-[#ff3333] border border-[#2a2a2a] hover:border-[#ff3333]/40 flex items-center gap-1 transition-colors"
                    >
                      <LogOut class="w-3 h-3" />
                      Disconnect
                    </button>
                  </Show>
                </div>
              </div>

              {/* Status Message */}
              <Show when={lfmStatusMsg()}>
                <div class="p-2.5 bg-[#141414] border border-[#ff2222]/30 text-[11px] text-[#ffaaaa]">
                  {lfmStatusMsg()}
                </div>
              </Show>

              {/* Quick Connect Actions */}
              <div class="p-3 bg-[#101010] border border-[#1e1e1e] space-y-2.5">
                <div class="text-[11px] font-bold text-white uppercase tracking-wider">
                  Authentication & Setup
                </div>
                <p class="text-[10px] text-[#888888]">
                  Link your Last.fm profile via web authorization or paste your existing session key directly.
                </p>

                <div class="flex items-center gap-2 flex-wrap pt-1">
                  <button
                    type="button"
                    disabled={lfmLoading()}
                    onClick={handleStartLfmAuth}
                    class="px-3 py-1.5 bg-[#1a0808] hover:bg-[#ff2222] text-[#ff2222] hover:text-black border border-[#ff2222]/50 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <ExternalLink class="w-3.5 h-3.5" />
                    <span>1. Authorize on Last.fm</span>
                  </button>

                  <button
                    type="button"
                    disabled={lfmLoading() || !lfmPendingToken()}
                    onClick={handleCompleteLfmAuth}
                    class={`px-3 py-1.5 border font-bold text-xs flex items-center gap-1.5 transition-colors ${
                      lfmPendingToken()
                        ? "bg-[#ff2222] text-black border-[#ff2222] hover:bg-white"
                        : "bg-[#141414] text-[#666666] border-[#252525] opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <RefreshCw class={`w-3.5 h-3.5 ${lfmLoading() ? "animate-spin" : ""}`} />
                    <span>2. Complete Connection</span>
                  </button>
                </div>
              </div>

              {/* Scrobbler Options */}
              <div class="space-y-2">
                <div class="flex items-center justify-between p-2.5 bg-[#101010] border border-[#1e1e1e]">
                  <div>
                    <div class="font-semibold text-white text-xs">Update "Now Playing"</div>
                    <div class="text-[10px] text-[#888888] mt-0.5">
                      Displays currently playing song in your Last.fm profile in real-time
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={lfmSettings().updateNowPlaying}
                    onClick={() => handleUpdateLfmField("updateNowPlaying", !lfmSettings().updateNowPlaying)}
                    class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors ${
                      lfmSettings().updateNowPlaying ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                    }`}
                  >
                    <span
                      class={`inline-block h-3.5 w-3.5 transform bg-black shadow transition mt-[2px] ml-[2px] ${
                        lfmSettings().updateNowPlaying ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                      }`}
                    />
                  </button>
                </div>

                <div class="flex items-center justify-between p-2.5 bg-[#101010] border border-[#1e1e1e]">
                  <div>
                    <div class="font-semibold text-white text-xs">In-App Scrobble Toast</div>
                    <div class="text-[10px] text-[#888888] mt-0.5">
                      Shows notification banner when a track is successfully scrobbled
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={lfmSettings().showToastOnScrobble}
                    onClick={() => handleUpdateLfmField("showToastOnScrobble", !lfmSettings().showToastOnScrobble)}
                    class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors ${
                      lfmSettings().showToastOnScrobble ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                    }`}
                  >
                    <span
                      class={`inline-block h-3.5 w-3.5 transform bg-black shadow transition mt-[2px] ml-[2px] ${
                        lfmSettings().showToastOnScrobble ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Manual Credentials */}
              <div class="p-3 bg-[#0d0d0d] border border-[#1b1b1b] space-y-2">
                <div class="flex items-center justify-between">
                  <div class="text-[10px] font-bold text-[#888888] uppercase tracking-wider">
                    API Credentials & Session
                  </div>
                  <a
                    href="https://www.last.fm/api/account/create"
                    target="_blank"
                    rel="noreferrer"
                    class="text-[9px] text-[#ff5555] hover:text-[#ff2222] flex items-center gap-1 underline"
                  >
                    <span>Get free API key</span>
                    <ExternalLink class="w-2.5 h-2.5" />
                  </a>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-[#777777] mb-1">Username</label>
                    <input
                      type="text"
                      value={lfmSettings().username}
                      onInput={(e) => handleUpdateLfmField("username", e.currentTarget.value)}
                      placeholder="lastfm_user"
                      class="w-full bg-[#141414] border border-[#242424] focus:border-[#ff2222] px-2 py-1 text-xs text-white outline-none"
                    />
                  </div>

                  <div>
                    <label class="block text-[10px] text-[#777777] mb-1">Session Key (sk)</label>
                    <input
                      type="password"
                      value={lfmSettings().sessionKey}
                      onInput={(e) => handleUpdateLfmField("sessionKey", e.currentTarget.value)}
                      placeholder="Paste 32-char session key"
                      class="w-full bg-[#141414] border border-[#242424] focus:border-[#ff2222] px-2 py-1 text-xs text-white outline-none"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label class="block text-[10px] text-[#777777] mb-1">Custom API Key</label>
                    <input
                      type="text"
                      value={lfmSettings().apiKey}
                      onInput={(e) => handleUpdateLfmField("apiKey", e.currentTarget.value)}
                      placeholder="Last.fm API key"
                      class="w-full bg-[#141414] border border-[#242424] focus:border-[#ff2222] px-2 py-1 text-xs text-white outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label class="block text-[10px] text-[#777777] mb-1">Custom API Secret</label>
                    <input
                      type="password"
                      value={lfmSettings().apiSecret}
                      onInput={(e) => handleUpdateLfmField("apiSecret", e.currentTarget.value)}
                      placeholder="Last.fm secret"
                      class="w-full bg-[#141414] border border-[#242424] focus:border-[#ff2222] px-2 py-1 text-xs text-white outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Show>

          {/* ==================== DISCORD RPC SETTINGS ==================== */}
          <Show when={props.pluginId === "discord-rich-presence"}>
            <div class="space-y-4">
              <div class="p-3 bg-[#120606] border border-[#ff2222]/30 flex items-start gap-2.5 text-[#aaaaaa] text-[11px] leading-relaxed">
                <Info class="w-4 h-4 text-[#ff2222] shrink-0 mt-0.5" />
                <div>
                  <span class="text-white font-semibold">Discord Rich Presence: </span>
                  Integrates with local Discord IPC socket on Windows to display playback title, artist, and remaining time on your Discord profile card.
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between p-3 bg-[#101010] border border-[#1e1e1e]">
                  <div>
                    <div class="font-semibold text-white text-xs">Show Track Title</div>
                    <div class="text-[10px] text-[#888888] mt-0.5">
                      Display title on presence "Details" line
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rpcSettings().showDetails}
                    onClick={() => handleUpdateRpcField("showDetails", !rpcSettings().showDetails)}
                    class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors ${
                      rpcSettings().showDetails ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                    }`}
                  >
                    <span
                      class={`inline-block h-3.5 w-3.5 transform bg-black shadow transition mt-[2px] ml-[2px] ${
                        rpcSettings().showDetails ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                      }`}
                    />
                  </button>
                </div>

                <div class="flex items-center justify-between p-3 bg-[#101010] border border-[#1e1e1e]">
                  <div>
                    <div class="font-semibold text-white text-xs">Show Artist Name</div>
                    <div class="text-[10px] text-[#888888] mt-0.5">
                      Display artist on presence "State" line
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rpcSettings().showState}
                    onClick={() => handleUpdateRpcField("showState", !rpcSettings().showState)}
                    class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors ${
                      rpcSettings().showState ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                    }`}
                  >
                    <span
                      class={`inline-block h-3.5 w-3.5 transform bg-black shadow transition mt-[2px] ml-[2px] ${
                        rpcSettings().showState ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                      }`}
                    />
                  </button>
                </div>

                <div class="flex items-center justify-between p-3 bg-[#101010] border border-[#1e1e1e]">
                  <div>
                    <div class="font-semibold text-white text-xs">Show Elapsed / Time Remaining</div>
                    <div class="text-[10px] text-[#888888] mt-0.5">
                      Display countdown clock in Discord profile
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rpcSettings().showTimeRemaining}
                    onClick={() => handleUpdateRpcField("showTimeRemaining", !rpcSettings().showTimeRemaining)}
                    class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors ${
                      rpcSettings().showTimeRemaining ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                    }`}
                  >
                    <span
                      class={`inline-block h-3.5 w-3.5 transform bg-black shadow transition mt-[2px] ml-[2px] ${
                        rpcSettings().showTimeRemaining ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Custom prefix */}
              <div class="p-3 bg-[#101010] border border-[#1e1e1e]">
                <label class="block text-[11px] font-bold text-white mb-1">
                  Details Prefix (Optional)
                </label>
                <input
                  type="text"
                  value={rpcSettings().customDetailsPrefix}
                  onInput={(e) => handleUpdateRpcField("customDetailsPrefix", e.currentTarget.value)}
                  placeholder="e.g. 🎵 or Listening to"
                  class="w-full bg-[#141414] border border-[#242424] focus:border-[#ff2222] px-2.5 py-1.5 text-xs text-white outline-none"
                />
              </div>

              {/* Test Action */}
              <div class="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestDiscordRpc}
                  class="px-3 py-1.5 bg-[#1a0808] hover:bg-[#ff2222] text-[#ff2222] hover:text-black border border-[#ff2222]/50 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles class="w-3.5 h-3.5" />
                  <span>Update Presence Now</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    invoke("clear_discord_rpc").catch(() => {});
                    triggerPluginToast({ title: "Discord RPC", body: "Cleared presence from Discord." });
                  }}
                  class="px-3 py-1.5 bg-[#141414] hover:bg-[#201010] text-[#888888] hover:text-[#ff4444] border border-[#262626] text-xs transition-colors"
                >
                  Clear Presence
                </button>
              </div>
            </div>
          </Show>

          {/* ==================== DESKTOP NOTIFICATIONS SETTINGS ==================== */}
          <Show when={props.pluginId === "desktop-notifications"}>
            <div class="space-y-4">
              <div class="p-3 bg-[#120606] border border-[#ff2222]/30 flex items-start gap-2.5 text-[#aaaaaa] text-[11px] leading-relaxed">
                <Info class="w-4 h-4 text-[#ff2222] shrink-0 mt-0.5" />
                <div>
                  <span class="text-white font-semibold">Desktop Notifications: </span>
                  Displays toast notifications when tracks change, supporting both custom in-app retro notifications and Windows native notification center.
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between p-3 bg-[#101010] border border-[#1e1e1e]">
                  <div>
                    <div class="font-semibold text-white text-xs">In-App Retro Toast</div>
                    <div class="text-[10px] text-[#888888] mt-0.5">
                      Show cyberpunk red floating notification banner inside application
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifSettings().inAppToast}
                    onClick={() => handleUpdateNotifField("inAppToast", !notifSettings().inAppToast)}
                    class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors ${
                      notifSettings().inAppToast ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                    }`}
                  >
                    <span
                      class={`inline-block h-3.5 w-3.5 transform bg-black shadow transition mt-[2px] ml-[2px] ${
                        notifSettings().inAppToast ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                      }`}
                    />
                  </button>
                </div>

                <div class="flex items-center justify-between p-3 bg-[#101010] border border-[#1e1e1e]">
                  <div>
                    <div class="font-semibold text-white text-xs">Windows System Notification</div>
                    <div class="text-[10px] text-[#888888] mt-0.5">
                      Show OS toast in Windows notification corner
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifSettings().nativeNotification}
                    onClick={() => handleUpdateNotifField("nativeNotification", !notifSettings().nativeNotification)}
                    class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors ${
                      notifSettings().nativeNotification ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                    }`}
                  >
                    <span
                      class={`inline-block h-3.5 w-3.5 transform bg-black shadow transition mt-[2px] ml-[2px] ${
                        notifSettings().nativeNotification ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                      }`}
                    />
                  </button>
                </div>

                <div class="flex items-center justify-between p-3 bg-[#101010] border border-[#1e1e1e]">
                  <div>
                    <div class="font-semibold text-white text-xs">Display Album Cover Art</div>
                    <div class="text-[10px] text-[#888888] mt-0.5">
                      Include album artwork thumbnail inside notifications
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifSettings().showCoverArt}
                    onClick={() => handleUpdateNotifField("showCoverArt", !notifSettings().showCoverArt)}
                    class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors ${
                      notifSettings().showCoverArt ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                    }`}
                  >
                    <span
                      class={`inline-block h-3.5 w-3.5 transform bg-black shadow transition mt-[2px] ml-[2px] ${
                        notifSettings().showCoverArt ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Duration selector */}
              <div class="p-3 bg-[#101010] border border-[#1e1e1e]">
                <label class="block text-[11px] font-bold text-white mb-2">
                  In-App Toast Duration
                </label>
                <div class="grid grid-cols-4 gap-2">
                  <For each={[2, 3.5, 5, 8]}>
                    {(sec) => (
                      <button
                        type="button"
                        onClick={() => handleUpdateNotifField("toastDurationSeconds", sec)}
                        class={`py-1.5 text-center text-xs border transition-colors ${
                          notifSettings().toastDurationSeconds === sec
                            ? "border-[#ff2222] bg-[#1a0808] text-[#ff2222] font-bold"
                            : "border-[#222222] bg-[#141414] text-[#888888] hover:border-[#333333]"
                        }`}
                      >
                        {sec}s
                      </button>
                    )}
                  </For>
                </div>
              </div>

              {/* Test Action */}
              <div class="pt-2">
                <button
                  type="button"
                  onClick={handleTestNotification}
                  class="px-3.5 py-1.5 bg-[#1a0808] hover:bg-[#ff2222] text-[#ff2222] hover:text-black border border-[#ff2222]/50 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Bell class="w-3.5 h-3.5" />
                  <span>Send Test Notification</span>
                </button>
              </div>
            </div>
          </Show>
        </div>

        {/* Modal Footer */}
        <div class="px-5 py-3 border-t border-[#181818] bg-[#0c0c0c] flex items-center justify-between">
          <span class="text-[10px] text-[#666666] flex items-center gap-1">
            <Check class="w-3 h-3 text-[#ff2222]" />
            Settings automatically saved to localStorage
          </span>

          <button
            type="button"
            onClick={props.onClose}
            class="px-4 py-1.5 bg-[#ff2222] hover:bg-white text-black font-bold text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
