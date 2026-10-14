import { Component, createSignal, onMount, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { playerStore } from "../../stores/playerStore";
import { pluginManager, enabledPluginIds, triggerPluginToast } from "../../services/pluginManager";
import { aiFilter } from "../../services/aiFilter";
import {
  Settings,
  Sliders,
  Shield,
  Keyboard,
  Check,
  LogIn,
  LogOut,
  RotateCcw,
  X,
  Power,
  Shuffle,
  Compass,
  Zap,
  SlidersHorizontal,
  User,
  Radio,
  Bell,
  RefreshCw,
  Trash2,
  Maximize2,
} from "lucide-solid";

const STARTUP_TAB_OPTIONS: { id: string; label: string }[] = [
  { id: "liked", label: "Liked Songs" },
  { id: "home", label: "Explore" },
  { id: "search", label: "Search" },
  { id: "queue", label: "Play Queue" },
  { id: "similar", label: "Similar Tracks" },
  { id: "history", label: "History" },
  { id: "library", label: "Playlist Loader" },
];

const UI_SCALE_OPTIONS = [
  { value: 90, label: "90%" },
  { value: 100, label: "100% (Default)" },
  { value: 110, label: "110%" },
  { value: 120, label: "120%" },
];

interface GlobalShortcutsConfig {
  play_pause: string;
  next: string;
  prev: string;
  vol_up: string;
  vol_down: string;
}

const DEFAULT_GLOBAL_SHORTCUTS: GlobalShortcutsConfig = {
  play_pause: "",
  next: "",
  prev: "",
  vol_up: "",
  vol_down: "",
};

type SettingsTab = "general" | "audio" | "shortcuts" | "account";

const formatShortcutDisplay = (raw: string): string => {
  if (!raw || !raw.trim()) return "Not bound (Click to set)";
  return raw
    .split("+")
    .map((part) => {
      const token = part.trim();
      if (token.startsWith("Key") && token.length === 4) {
        return token.slice(3);
      }
      if (token.startsWith("Digit") && token.length === 6) {
        return token.slice(5);
      }
      if (token === "ArrowUp" || token === "Up") return "↑ Up";
      if (token === "ArrowDown" || token === "Down") return "↓ Down";
      if (token === "ArrowLeft" || token === "Left") return "← Left";
      if (token === "ArrowRight" || token === "Right") return "→ Right";
      return token;
    })
    .join("+");
};

export const SettingsView: Component = () => {
  const [activeTab, setActiveTab] = createSignal<SettingsTab>("general");
  const [cookieInput, setCookieInput] = createSignal("");
  const [cookieSaved, setCookieSaved] = createSignal(false);
  const [autostartEnabled, setAutostartEnabled] = createSignal(false);

  onMount(() => {
    invoke<boolean>("get_autostart_status")
      .then((status) => setAutostartEnabled(!!status))
      .catch(() => {});
  });

  const handleToggleAutostart = async () => {
    const nextVal = !autostartEnabled();
    setAutostartEnabled(nextVal);
    try {
      await invoke<boolean>("set_autostart", {
        enabled: nextVal,
        startMinimized: playerStore.startInTray(),
      });
    } catch (e) {
      console.warn("Failed to set autostart:", e);
    }
  };

  const handleToggleStartInTray = async () => {
    const nextVal = !playerStore.startInTray();
    playerStore.setStartInTray(nextVal);
    if (autostartEnabled()) {
      try {
        await invoke<boolean>("set_autostart", {
          enabled: true,
          startMinimized: nextVal,
        });
      } catch (e) {
        console.warn("Failed to sync autostart minimized flag:", e);
      }
    }
  };

  // Global Shortcuts State
  const loadSavedShortcuts = (): GlobalShortcutsConfig => {
    try {
      const saved = localStorage.getItem("ytm_global_shortcuts");
      if (saved) {
        return { ...DEFAULT_GLOBAL_SHORTCUTS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn("Failed to parse saved shortcuts:", e);
    }
    return { ...DEFAULT_GLOBAL_SHORTCUTS };
  };

  const [shortcuts, setShortcuts] = createSignal<GlobalShortcutsConfig>(loadSavedShortcuts());
  const [recordingAction, setRecordingAction] = createSignal<keyof GlobalShortcutsConfig | null>(null);
  const [shortcutFeedback, setShortcutFeedback] = createSignal<string | null>(null);

  const applyShortcuts = async (updated: GlobalShortcutsConfig, feedbackMsg: string = "Saved & Registered") => {
    try {
      localStorage.setItem("ytm_global_shortcuts", JSON.stringify(updated));
      await invoke("register_custom_shortcuts", {
        playPause: updated.play_pause,
        next: updated.next,
        prev: updated.prev,
        volUp: updated.vol_up,
        volDown: updated.vol_down,
      });
      setShortcutFeedback(feedbackMsg);
      setTimeout(() => setShortcutFeedback(null), 2500);
    } catch (err) {
      console.error("Failed to register shortcuts:", err);
      setShortcutFeedback("Error registering key");
      setTimeout(() => setShortcutFeedback(null), 2500);
    }
  };

  const handleClearSingleShortcut = async (action: keyof GlobalShortcutsConfig) => {
    const updated = { ...shortcuts(), [action]: "" };
    setShortcuts(updated);
    if (recordingAction() === action) {
      setRecordingAction(null);
    }
    await applyShortcuts(updated, "Shortcut Cleared");
  };

  const handleResetShortcuts = async () => {
    setRecordingAction(null);
    setShortcuts({ ...DEFAULT_GLOBAL_SHORTCUTS });
    await applyShortcuts(DEFAULT_GLOBAL_SHORTCUTS, "All Shortcuts Cleared");
  };

  const handleShortcutKeyDown = (action: keyof GlobalShortcutsConfig, e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore standalone modifier presses
    if (
      ["Control", "Alt", "Shift", "Meta"].includes(e.key) ||
      ["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"].includes(e.code)
    ) {
      return;
    }

    // Escape cancels recording
    if (e.key === "Escape" || e.code === "Escape") {
      setRecordingAction(null);
      return;
    }

    // Backspace or Delete without modifiers clears this shortcut
    if (
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      !e.metaKey &&
      (e.key === "Backspace" || e.key === "Delete" || e.code === "Backspace" || e.code === "Delete")
    ) {
      handleClearSingleShortcut(action);
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Super");

    const keyName = e.code || e.key;

    if (!parts.includes(keyName)) {
      parts.push(keyName);
    }

    const shortcutStr = parts.join("+");
    const updated = { ...shortcuts(), [action]: shortcutStr };
    setShortcuts(updated);
    setRecordingAction(null);
    applyShortcuts(updated);
  };

  const handleSaveCookie = () => {
    if (cookieInput().trim()) {
      localStorage.setItem("ytm_session_cookies", cookieInput().trim());
      setCookieSaved(true);
      setTimeout(() => setCookieSaved(false), 2000);
    }
  };

  const handleClearCache = async () => {
    try {
      if ("caches" in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((k) => window.caches.delete(k)));
      }
      sessionStorage.clear();
    } catch (e) {
      console.warn("Failed to clear local cache:", e);
    }
    triggerPluginToast({
      title: "Cache Cleared",
      body: "Album art and audio cache have been successfully cleared.",
    });
  };

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  const tabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: "general", label: "General & Startup", icon: Zap },
    { id: "audio", label: "Audio & Equalizer", icon: SlidersHorizontal },
    { id: "shortcuts", label: "Global Shortcuts", icon: Keyboard },
    { id: "account", label: "Account & Session", icon: Shield },
  ];

  return (
    <div class="h-full flex flex-col w-full text-xs bg-[#000000] font-mono select-none overflow-hidden">
      {/* Scrollable Container */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        {/* Unified Centered Shell */}
        <div class="max-w-5xl mx-auto w-full px-4 py-6 space-y-6">
          {/* Header */}
          <div
            data-tauri-drag-region
            onMouseDown={handleDragMouseDown}
            class="flex items-center justify-between"
          >
            <div>
              <h2 data-tauri-drag-region class="text-base font-bold text-white flex items-center gap-2">
                <Settings class="w-5 h-5 text-[#ff2222] pointer-events-none" />
                <span data-tauri-drag-region>Settings & Preferences</span>
              </h2>
              <p data-tauri-drag-region class="text-xs text-[#888888] mt-1">
                Playback engine, autostart, hotkeys, and account synchronization.
              </p>
            </div>
          </div>

          {/* Retro Tab Navigation Bar */}
          <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none border-b border-[#181818] pb-[1px]">
            <For each={tabs}>
              {(tab) => {
                const Icon = tab.icon;
                const isActive = () => activeTab() === tab.id;
                return (
                  <button
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    class={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono border-b-2 font-medium transition-all cursor-pointer whitespace-nowrap ${
                      isActive()
                        ? "border-[#ff2222] text-white bg-[#0e0404]"
                        : "border-transparent text-[#777777] hover:text-[#cccccc] hover:bg-[#0a0a0a]"
                    }`}
                  >
                    <Icon
                      class={`w-4 h-4 transition-colors ${
                        isActive() ? "text-[#ff2222]" : "text-[#555555]"
                      }`}
                    />
                    <span>{tab.label}</span>
                  </button>
                );
              }}
            </For>
          </div>

          {/* ========================================================= */}
          {/* TAB 1: General & Startup (Centered 2-Column Responsive Dashboard) */}
          {/* ========================================================= */}
          <Show when={activeTab() === "general"}>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full items-start">
              {/* LEFT COLUMN: Startup & System Integrations */}
              <div class="space-y-4">
              {/* Card 1: Startup & Background Behavior */}
              <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] space-y-3.5">
                <div class="flex items-center gap-2">
                  <Power class="w-4 h-4 text-[#ff2222]" />
                  <div>
                    <h3 class="text-xs font-semibold text-white">Startup & Background Behavior</h3>
                    <p class="text-[11px] text-[#888888]">
                      Control how Onyx initializes on boot and operates in system tray.
                    </p>
                  </div>
                </div>

                <div class="space-y-2.5">
                  {/* 1. Launch on Windows Startup */}
                  <div class="flex items-center justify-between p-3 rounded bg-[#070707] border border-[#181818]">
                    <div>
                      <div class="text-white font-medium text-xs">Windows Autostart</div>
                      <div class="text-[#666666] text-[11px]">Boot on login</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autostartEnabled()}
                      onClick={handleToggleAutostart}
                      class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors duration-150 ease-in-out focus:outline-none ${
                        autostartEnabled() ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                      }`}
                      title="Toggle Windows Autostart"
                    >
                      <span
                        class={`pointer-events-none inline-block h-3.5 w-3.5 transform shadow transition duration-150 ease-in-out mt-[2px] ml-[2px] ${
                          autostartEnabled() ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                        }`}
                      />
                    </button>
                  </div>

                  {/* 2. Start Hidden in System Tray */}
                  <div class="flex items-center justify-between p-3 rounded bg-[#070707] border border-[#181818]">
                    <div>
                      <div class="text-white font-medium text-xs">Start in Tray</div>
                      <div class="text-[#666666] text-[11px]">Boot hidden</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={playerStore.startInTray()}
                      onClick={handleToggleStartInTray}
                      class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors duration-150 ease-in-out focus:outline-none ${
                        playerStore.startInTray() ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                      }`}
                      title="Toggle Start in System Tray"
                    >
                      <span
                        class={`pointer-events-none inline-block h-3.5 w-3.5 transform shadow transition duration-150 ease-in-out mt-[2px] ml-[2px] ${
                          playerStore.startInTray() ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                        }`}
                      />
                    </button>
                  </div>

                  {/* 3. Enable Shuffle by Default */}
                  <div class="flex items-center justify-between p-3 rounded bg-[#070707] border border-[#181818]">
                    <div>
                      <div class="text-white font-medium text-xs flex items-center gap-1.5">
                        <Shuffle class="w-3.5 h-3.5 text-[#ff2222]" />
                        <span>Default Shuffle</span>
                      </div>
                      <div class="text-[#666666] text-[11px]">Randomized playback by default</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={playerStore.defaultShuffle()}
                      onClick={() => playerStore.setDefaultShuffle(!playerStore.defaultShuffle())}
                      class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors duration-150 ease-in-out focus:outline-none ${
                        playerStore.defaultShuffle() ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                      }`}
                      title="Toggle Default Shuffle"
                    >
                      <span
                        class={`pointer-events-none inline-block h-3.5 w-3.5 transform shadow transition duration-150 ease-in-out mt-[2px] ml-[2px] ${
                          playerStore.defaultShuffle() ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* UI Scale Factor Selector */}
                <div class="p-3 rounded-sm bg-[#050505] border border-[#181818] flex flex-col gap-2.5">
                  <div class="flex items-center gap-2">
                    <Maximize2 class="w-3.5 h-3.5 text-[#ff2222]" />
                    <div>
                      <div class="text-white font-medium text-[11px]">UI Scaling (+Scale Factor)</div>
                      <div class="text-[10px] text-[#666666]">Adjust interface scaling</div>
                    </div>
                  </div>
                  <div class="grid grid-cols-4 gap-1.5 w-full">
                    <For each={UI_SCALE_OPTIONS}>
                      {(opt) => (
                        <button
                          onClick={() => playerStore.setUiScale(opt.value)}
                          class={`px-2 py-1.5 rounded-sm text-[10px] font-mono border transition-colors cursor-pointer text-center whitespace-nowrap flex items-center justify-center ${
                            playerStore.uiScale() === opt.value
                              ? "bg-[#ff2222] text-black border-[#ff2222] font-bold"
                              : "bg-[#121212] hover:bg-[#1a1a1a] text-[#888888] hover:text-white border-[#222222]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                {/* Default Startup Tab Selector Pills */}
                <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <Compass class="w-3.5 h-3.5 text-[#ff2222]" />
                    <div>
                      <div class="text-white font-medium text-[11px]">Default Startup Tab</div>
                      <div class="text-[10px] text-[#666666]">Initial screen opened on app launch</div>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5 pt-1">
                    <For each={STARTUP_TAB_OPTIONS}>
                      {(opt) => (
                        <button
                          onClick={() => playerStore.setStartupTab(opt.id)}
                          class={`px-2.5 py-1 rounded-sm text-[10px] font-mono border transition-colors cursor-pointer ${
                            playerStore.startupTab() === opt.id
                              ? "bg-[#ff2222] text-black border-[#ff2222] font-bold"
                              : "bg-[#121212] hover:bg-[#1a1a1a] text-[#888888] hover:text-white border-[#222222]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </div>

              {/* Card 2: System Integrations */}
              <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] space-y-3">
                <div class="flex items-center gap-2">
                  <Radio class="w-4 h-4 text-[#ff2222]" />
                  <div>
                    <h3 class="text-xs font-semibold text-white">System Integrations</h3>
                    <p class="text-[11px] text-[#888888]">
                      Discord Rich Presence broadcasting and desktop toast notifications.
                    </p>
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Discord RPC Toggle */}
                  <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2 min-w-0">
                      <Radio class="w-3.5 h-3.5 text-[#ff2222] shrink-0" />
                      <div class="min-w-0">
                        <div class="text-white font-medium text-[11px] truncate">Discord RPC</div>
                        <div class="text-[10px] text-[#666666] truncate">Show track in profile</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pluginManager.isEnabled("discord-rich-presence")}
                      onClick={() => pluginManager.togglePlugin("discord-rich-presence")}
                      class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors duration-150 ease-in-out focus:outline-none ${
                        enabledPluginIds().has("discord-rich-presence") ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                      }`}
                      title="Toggle Discord RPC"
                    >
                      <span
                        class={`pointer-events-none inline-block h-3.5 w-3.5 transform bg-black shadow transition duration-150 ease-in-out mt-[2px] ml-[2px] ${
                          enabledPluginIds().has("discord-rich-presence") ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Desktop Toast Notifications Toggle */}
                  <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2 min-w-0">
                      <Bell class="w-3.5 h-3.5 text-[#ff2222] shrink-0" />
                      <div class="min-w-0">
                        <div class="text-white font-medium text-[11px] truncate">Desktop Alerts</div>
                        <div class="text-[10px] text-[#666666] truncate">Track skip toast</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pluginManager.isEnabled("desktop-notifications")}
                      onClick={() => pluginManager.togglePlugin("desktop-notifications")}
                      class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors duration-150 ease-in-out focus:outline-none ${
                        enabledPluginIds().has("desktop-notifications") ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                      }`}
                      title="Toggle Desktop Notifications"
                    >
                      <span
                        class={`pointer-events-none inline-block h-3.5 w-3.5 transform bg-black shadow transition duration-150 ease-in-out mt-[2px] ml-[2px] ${
                          enabledPluginIds().has("desktop-notifications") ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: AI Filter & Diagnostics */}
            <div class="space-y-4">
              {/* Card 1: 🛡️ AI Content Filter */}
              <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <Shield class="w-4 h-4 text-[#ff2222]" />
                    <div>
                      <h3 class="text-xs font-semibold text-white">
                        🛡️ AI Content Filter (Suno / Udio / Covers)
                      </h3>
                      <p class="text-[11px] text-[#888888]">
                        Automatically hide generated tracks and AI covers with zero performance impact
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={aiFilter.isEnabled()}
                    onClick={() => aiFilter.toggle()}
                    class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors duration-150 ease-in-out focus:outline-none ${
                      aiFilter.isEnabled() ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                    }`}
                    title="Toggle AI song filter"
                  >
                    <span
                      class={`pointer-events-none inline-block h-3.5 w-3.5 transform bg-black shadow transition duration-150 ease-in-out mt-[2px] ml-[2px] ${
                        aiFilter.isEnabled() ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                      }`}
                    />
                  </button>
                </div>

                {/* Blocked AI Artists Blacklist Management */}
                <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex flex-col gap-2">
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="text-[#888888]">
                      Blocked artists:{" "}
                      <span class="text-white font-bold">{aiFilter.getBlockedArtists().length}</span>
                    </span>
                    <Show when={aiFilter.getBlockedArtists().length > 0}>
                      <button
                        onClick={() => aiFilter.clearBlockedArtists()}
                        class="px-2 py-0.5 rounded text-[10px] font-mono text-[#ff4444] hover:text-white bg-[#1a0505] hover:bg-[#ff2222] border border-[#ff2222]/40 transition-colors cursor-pointer"
                        title="Clear blacklist"
                      >
                        Clear blacklist
                      </button>
                    </Show>
                  </div>

                  <Show
                    when={aiFilter.getBlockedArtists().length > 0}
                    fallback={
                      <div class="text-[10px] text-[#555555]">
                        Blacklist is empty (add artists via right-click or track options menu).
                      </div>
                    }
                  >
                    <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                      <For each={aiFilter.getBlockedArtists()}>
                        {(artist) => (
                          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] bg-[#111111] text-[#cccccc] border border-[#222222]">
                            <span>{artist}</span>
                            <button
                              onClick={() => aiFilter.unblockArtist(artist)}
                              class="text-[#666666] hover:text-[#ff4444] transition-colors cursor-pointer"
                              title={`Unblock ${artist}`}
                            >
                              ×
                            </button>
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>

              {/* Card 2: ⚡ System & Audio Engine Diagnostics */}
              <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] space-y-3">
                <div class="flex items-center gap-2">
                  <Zap class="w-4 h-4 text-[#ff2222]" />
                  <div>
                    <h3 class="text-xs font-semibold text-white">⚡ System & Audio Engine Diagnostics</h3>
                    <p class="text-[11px] text-[#888888]">
                      Runtime telemetry, hardware audio stream, and memory cleanup.
                    </p>
                  </div>
                </div>

                <div class="space-y-2 text-[11px] font-mono">
                  <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex items-center justify-between">
                    <span class="text-[#888888]">App Version</span>
                    <span class="text-white font-bold">v1.0.0 Desktop (Tauri v2)</span>
                  </div>

                  <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex items-center justify-between">
                    <span class="text-[#888888]">Audio Engine</span>
                    <span class="text-[#27c93f] font-bold flex items-center gap-1.5">
                      <span class="text-xs">●</span> WASAPI Exclusive Stream (Low Latency)
                    </span>
                  </div>

                  <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex items-center justify-between">
                    <span class="text-[#888888]">Crossfade Engine</span>
                    <span class="text-white font-medium">WebAudio Gain Crossfader</span>
                  </div>

                  <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex items-center justify-between">
                    <span class="text-[#888888]">Active Plugins</span>
                    <span class="text-[#ff2222] font-bold">{enabledPluginIds().size} active</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearCache}
                  class="w-full py-2 px-3 rounded-sm bg-[#140505] hover:bg-[#200808] border border-[#ff2222]/40 text-[#ff2222] hover:text-white font-bold transition-all text-xs flex items-center justify-center gap-2 cursor-pointer mt-1"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  <span>Clear Artwork & Audio Cache</span>
                </button>
              </div>
            </div>
          </div>
        </Show>

        {/* ========================================================= */}
        {/* TAB 2: Audio & Equalizer (Symmetric Clean Hierarchy) */}
        {/* ========================================================= */}
        <Show when={activeTab() === "audio"}>
          <div class="space-y-4 w-full">
            {/* Card 1: Audio Equalizer & DSP (3-Band) + Hardware Volume Step */}
            <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] space-y-4">
              {/* Equalizer Header */}
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <SlidersHorizontal class="w-4 h-4 text-[#ff2222]" />
                  <div>
                    <h3 class="text-xs font-semibold text-white">Audio Equalizer & DSP (3-Band)</h3>
                    <p class="text-[11px] text-[#888888]">
                      Low-shelf, peak, and high-shelf biquad filtering.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => playerStore.updateEqualizer(0, 0, 0)}
                  class="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#140505] hover:bg-[#200808] text-[#ff2222] border border-[#ff2222]/30 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw class="w-3 h-3" />
                  <span>Reset Flat</span>
                </button>
              </div>

              {/* 3-Band Equalizer Sliders */}
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-[11px]">
                {/* Bass */}
                <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex flex-col items-center">
                  <span class="text-[#888888] mb-1">Bass (100Hz)</span>
                  <span class="text-xs font-bold text-[#ff2222] mb-2">
                    {playerStore.eqBass() > 0 ? `+${playerStore.eqBass()}` : playerStore.eqBass()} dB
                  </span>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={playerStore.eqBass()}
                    onInput={(e) =>
                      playerStore.updateEqualizer(
                        Number(e.currentTarget.value),
                        playerStore.eqMid(),
                        playerStore.eqTreble()
                      )
                    }
                    class="w-full accent-[#ff2222] h-1.5 bg-[#181818] rounded-none cursor-pointer"
                  />
                </div>

                {/* Mid */}
                <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex flex-col items-center">
                  <span class="text-[#888888] mb-1">Mids (1kHz)</span>
                  <span class="text-xs font-bold text-[#ff2222] mb-2">
                    {playerStore.eqMid() > 0 ? `+${playerStore.eqMid()}` : playerStore.eqMid()} dB
                  </span>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={playerStore.eqMid()}
                    onInput={(e) =>
                      playerStore.updateEqualizer(
                        playerStore.eqBass(),
                        Number(e.currentTarget.value),
                        playerStore.eqTreble()
                      )
                    }
                    class="w-full accent-[#ff2222] h-1.5 bg-[#181818] rounded-none cursor-pointer"
                  />
                </div>

                {/* Treble */}
                <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex flex-col items-center">
                  <span class="text-[#888888] mb-1">Treble (3kHz)</span>
                  <span class="text-xs font-bold text-[#ff2222] mb-2">
                    {playerStore.eqTreble() > 0 ? `+${playerStore.eqTreble()}` : playerStore.eqTreble()} dB
                  </span>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={playerStore.eqTreble()}
                    onInput={(e) =>
                      playerStore.updateEqualizer(
                        playerStore.eqBass(),
                        playerStore.eqMid(),
                        Number(e.currentTarget.value)
                      )
                    }
                    class="w-full accent-[#ff2222] h-1.5 bg-[#181818] rounded-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Hardware Volume Step Section */}
              <div class="pt-3 border-t border-[#181818] space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Sliders class="w-4 h-4 text-[#ff2222]" />
                    <div>
                      <h3 class="text-xs font-semibold text-white">Hardware Volume Step (%)</h3>
                      <p class="text-[11px] text-[#888888]">
                        Percentage delta adjusted per hotkey trigger and mouse wheel tick.
                      </p>
                    </div>
                  </div>
                  <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-sm bg-[#140505] text-[#ff2222] border border-[#ff2222]/30">
                    {playerStore.volumeStep()}%
                  </span>
                </div>
                <div class="flex flex-col sm:flex-row items-center gap-3 pt-0.5">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={playerStore.volumeStep()}
                    onInput={(e) => playerStore.setVolumeStep(Number(e.currentTarget.value))}
                    class="w-full flex-1 accent-[#ff2222] h-1.5 bg-[#181818] rounded-none cursor-pointer"
                  />
                  <div class="flex items-center gap-1 shrink-0">
                    <For each={[1, 2, 5, 10]}>
                      {(preset) => (
                        <button
                          onClick={() => playerStore.setVolumeStep(preset)}
                          class={`px-2.5 py-1 rounded-sm text-[10px] font-mono border cursor-pointer transition-colors ${
                            playerStore.volumeStep() === preset
                              ? "bg-[#ff2222] text-black border-[#ff2222] font-bold"
                              : "bg-[#121212] hover:bg-[#1a1a1a] text-[#888888] border-[#222222]"
                          }`}
                        >
                          {preset}%
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: 2-Column Symmetrical Grid (Crossfade Duration + Playback Rate) */}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              {/* Card 2A: Hardware Crossfade Duration */}
              <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] flex flex-col justify-between space-y-3 h-full">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Sliders class="w-4 h-4 text-[#ff2222]" />
                    <div>
                      <h3 class="text-xs font-semibold text-white">Hardware Crossfade Duration (SC-08)</h3>
                      <p class="text-[11px] text-[#888888]">
                        Dual-stream mixing with linear amplitude interpolation.
                      </p>
                    </div>
                  </div>
                  <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-sm bg-[#140505] text-[#ff2222] border border-[#ff2222]/30 shrink-0">
                    {playerStore.crossfadeDuration()}s
                  </span>
                </div>

                <div class="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min="0"
                    max="12"
                    step="1"
                    value={playerStore.crossfadeDuration()}
                    onInput={(e) => playerStore.updateCrossfade(Number(e.currentTarget.value))}
                    class="w-full accent-[#ff2222] h-1.5 bg-[#181818] rounded-none cursor-pointer"
                  />
                </div>
                <div class="flex justify-between text-[10px] text-[#666666] font-mono">
                  <span>0s (Gapless)</span>
                  <span>4s (Recommended)</span>
                  <span>12s (Long Mix)</span>
                </div>
              </div>

              {/* Card 2B: Playback Rate / Speed */}
              <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] flex flex-col justify-between space-y-3 h-full">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Sliders class="w-4 h-4 text-[#ff2222]" />
                    <div>
                      <h3 class="text-xs font-semibold text-white">Playback Rate / Speed</h3>
                      <p class="text-[11px] text-[#888888]">
                        Pitch-preserved hardware time-stretching (0.5x &ndash; 2.0x).
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => playerStore.updatePlaybackRate(1.0)}
                      class="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#140505] hover:bg-[#200808] text-[#ff2222] border border-[#ff2222]/30 transition-colors cursor-pointer"
                      title="Reset playback speed to 1.0x"
                    >
                      1.0x (Normal)
                    </button>
                    <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-sm bg-[#140505] text-[#ff2222] border border-[#ff2222]/30">
                      {playerStore.playbackRate().toFixed(2)}x
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={playerStore.playbackRate()}
                    onInput={(e) => playerStore.updatePlaybackRate(Number(e.currentTarget.value))}
                    class="w-full accent-[#ff2222] h-1.5 bg-[#181818] rounded-none cursor-pointer"
                  />
                </div>
                <div class="flex justify-between text-[10px] text-[#666666] font-mono">
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>1.5x</span>
                  <span>2.0x</span>
                </div>
              </div>
            </div>
          </div>
        </Show>

        {/* ========================================================= */}
        {/* TAB 3: Global Shortcuts (Centered 2-Column Shortcuts Grid) */}
        {/* ========================================================= */}
        <Show when={activeTab() === "shortcuts"}>
          <div class="w-full space-y-4">
            <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] space-y-4">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <Keyboard class="w-4 h-4 text-[#ff2222]" />
                  <div>
                    <h3 class="text-xs font-semibold text-white">System Global Shortcuts (Background Hotkeys)</h3>
                    <p class="text-[11px] text-[#888888]">
                      Global keyboard hooks registered with Windows. Active even when Onyx is minimized in tray.
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <Show when={shortcutFeedback()}>
                    <span class="text-[10px] text-[#ff2222] font-mono px-2 py-0.5 rounded-sm bg-[#140505] border border-[#ff2222]/30">
                      {shortcutFeedback()}
                    </span>
                  </Show>
                  <button
                    onClick={handleResetShortcuts}
                    class="px-2.5 py-1 rounded-sm bg-[#140505] hover:bg-[#200808] text-[#ff2222] border border-[#ff2222]/40 text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
                    title="Unbind and clear all global shortcuts"
                  >
                    <RotateCcw class="w-3 h-3" />
                    <span>Clear All Shortcuts</span>
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
                {/* Play / Pause */}
                <div class="p-2.5 px-3 rounded-sm bg-[#050505] border border-[#181818] flex justify-between items-center gap-2 md:col-span-2">
                  <div>
                    <div class="text-white font-medium">Play / Pause</div>
                    <div class="text-[10px] text-[#666666]">Toggle audio playback</div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      tabIndex={0}
                      onClick={() => setRecordingAction("play_pause")}
                      onKeyDown={(e) => {
                        if (recordingAction() === "play_pause") {
                          handleShortcutKeyDown("play_pause", e);
                        }
                      }}
                      class={`px-2.5 py-1 rounded-sm font-mono text-[11px] border transition-all cursor-pointer ${
                        recordingAction() === "play_pause"
                          ? "bg-[#ff2222] text-black border-[#ff2222] font-bold animate-pulse"
                          : shortcuts().play_pause
                          ? "bg-[#121212] hover:bg-[#1a1a1a] text-[#ff2222] border-[#222222]"
                          : "bg-[#0d0d0d] hover:bg-[#161616] text-[#666666] border-[#1c1c1c]"
                      }`}
                    >
                      {recordingAction() === "play_pause" ? "Press keys..." : formatShortcutDisplay(shortcuts().play_pause)}
                    </button>
                    <Show when={shortcuts().play_pause}>
                      <button
                        onClick={() => handleClearSingleShortcut("play_pause")}
                        title="Clear Play / Pause shortcut"
                        class="p-1 rounded-sm bg-[#121212] hover:bg-[#200808] text-[#777777] hover:text-[#ff2222] border border-[#222222] transition-colors cursor-pointer"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </Show>
                  </div>
                </div>

                {/* Next Track */}
                <div class="p-2.5 px-3 rounded-sm bg-[#050505] border border-[#181818] flex justify-between items-center gap-2">
                  <div>
                    <div class="text-white font-medium">Next Track</div>
                    <div class="text-[10px] text-[#666666]">Skip to next track in queue</div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      tabIndex={0}
                      onClick={() => setRecordingAction("next")}
                      onKeyDown={(e) => {
                        if (recordingAction() === "next") {
                          handleShortcutKeyDown("next", e);
                        }
                      }}
                      class={`px-2.5 py-1 rounded-sm font-mono text-[11px] border transition-all cursor-pointer ${
                        recordingAction() === "next"
                          ? "bg-[#ff2222] text-black border-[#ff2222] font-bold animate-pulse"
                          : shortcuts().next
                          ? "bg-[#121212] hover:bg-[#1a1a1a] text-[#ff2222] border-[#222222]"
                          : "bg-[#0d0d0d] hover:bg-[#161616] text-[#666666] border-[#1c1c1c]"
                      }`}
                    >
                      {recordingAction() === "next" ? "Press keys..." : formatShortcutDisplay(shortcuts().next)}
                    </button>
                    <Show when={shortcuts().next}>
                      <button
                        onClick={() => handleClearSingleShortcut("next")}
                        title="Clear Next Track shortcut"
                        class="p-1 rounded-sm bg-[#121212] hover:bg-[#200808] text-[#777777] hover:text-[#ff2222] border border-[#222222] transition-colors cursor-pointer"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </Show>
                  </div>
                </div>

                {/* Previous Track */}
                <div class="p-2.5 px-3 rounded-sm bg-[#050505] border border-[#181818] flex justify-between items-center gap-2">
                  <div>
                    <div class="text-white font-medium">Previous Track</div>
                    <div class="text-[10px] text-[#666666]">Return to previous track</div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      tabIndex={0}
                      onClick={() => setRecordingAction("prev")}
                      onKeyDown={(e) => {
                        if (recordingAction() === "prev") {
                          handleShortcutKeyDown("prev", e);
                        }
                      }}
                      class={`px-2.5 py-1 rounded-sm font-mono text-[11px] border transition-all cursor-pointer ${
                        recordingAction() === "prev"
                          ? "bg-[#ff2222] text-black border-[#ff2222] font-bold animate-pulse"
                          : shortcuts().prev
                          ? "bg-[#121212] hover:bg-[#1a1a1a] text-[#ff2222] border-[#222222]"
                          : "bg-[#0d0d0d] hover:bg-[#161616] text-[#666666] border-[#1c1c1c]"
                      }`}
                    >
                      {recordingAction() === "prev" ? "Press keys..." : formatShortcutDisplay(shortcuts().prev)}
                    </button>
                    <Show when={shortcuts().prev}>
                      <button
                        onClick={() => handleClearSingleShortcut("prev")}
                        title="Clear Previous Track shortcut"
                        class="p-1 rounded-sm bg-[#121212] hover:bg-[#200808] text-[#777777] hover:text-[#ff2222] border border-[#222222] transition-colors cursor-pointer"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </Show>
                  </div>
                </div>

                {/* Volume Up */}
                <div class="p-2.5 px-3 rounded-sm bg-[#050505] border border-[#181818] flex justify-between items-center gap-2">
                  <div>
                    <div class="text-white font-medium">Volume Up</div>
                    <div class="text-[10px] text-[#666666]">Increase level by {playerStore.volumeStep()}%</div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      tabIndex={0}
                      onClick={() => setRecordingAction("vol_up")}
                      onKeyDown={(e) => {
                        if (recordingAction() === "vol_up") {
                          handleShortcutKeyDown("vol_up", e);
                        }
                      }}
                      class={`px-2.5 py-1 rounded-sm font-mono text-[11px] border transition-all cursor-pointer ${
                        recordingAction() === "vol_up"
                          ? "bg-[#ff2222] text-black border-[#ff2222] font-bold animate-pulse"
                          : shortcuts().vol_up
                          ? "bg-[#121212] hover:bg-[#1a1a1a] text-[#ff2222] border-[#222222]"
                          : "bg-[#0d0d0d] hover:bg-[#161616] text-[#666666] border-[#1c1c1c]"
                      }`}
                    >
                      {recordingAction() === "vol_up" ? "Press keys..." : formatShortcutDisplay(shortcuts().vol_up)}
                    </button>
                    <Show when={shortcuts().vol_up}>
                      <button
                        onClick={() => handleClearSingleShortcut("vol_up")}
                        title="Clear Volume Up shortcut"
                        class="p-1 rounded-sm bg-[#121212] hover:bg-[#200808] text-[#777777] hover:text-[#ff2222] border border-[#222222] transition-colors cursor-pointer"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </Show>
                  </div>
                </div>

                {/* Volume Down */}
                <div class="p-2.5 px-3 rounded-sm bg-[#050505] border border-[#181818] flex justify-between items-center gap-2">
                  <div>
                    <div class="text-white font-medium">Volume Down</div>
                    <div class="text-[10px] text-[#666666]">Decrease level by {playerStore.volumeStep()}%</div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      tabIndex={0}
                      onClick={() => setRecordingAction("vol_down")}
                      onKeyDown={(e) => {
                        if (recordingAction() === "vol_down") {
                          handleShortcutKeyDown("vol_down", e);
                        }
                      }}
                      class={`px-2.5 py-1 rounded-sm font-mono text-[11px] border transition-all cursor-pointer ${
                        recordingAction() === "vol_down"
                          ? "bg-[#ff2222] text-black border-[#ff2222] font-bold animate-pulse"
                          : shortcuts().vol_down
                          ? "bg-[#121212] hover:bg-[#1a1a1a] text-[#ff2222] border-[#222222]"
                          : "bg-[#0d0d0d] hover:bg-[#161616] text-[#666666] border-[#1c1c1c]"
                      }`}
                    >
                      {recordingAction() === "vol_down" ? "Press keys..." : formatShortcutDisplay(shortcuts().vol_down)}
                    </button>
                    <Show when={shortcuts().vol_down}>
                      <button
                        onClick={() => handleClearSingleShortcut("vol_down")}
                        title="Clear Volume Down shortcut"
                        class="p-1 rounded-sm bg-[#121212] hover:bg-[#200808] text-[#777777] hover:text-[#ff2222] border border-[#222222] transition-colors cursor-pointer"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </Show>
                  </div>
                </div>
              </div>

              <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] text-[10px] text-[#777777] flex items-center justify-between">
                <span>Tip: Click any box and press desired keys (e.g., <kbd class="px-1 py-0.5 bg-[#141414] border border-[#282828] text-white">Ctrl+Alt+Space</kbd> or media keys). Press <kbd class="px-1 py-0.5 bg-[#141414] border border-[#282828] text-white">Esc</kbd> to cancel.</span>
              </div>
            </div>
          </div>
        </Show>

        {/* ========================================================= */}
        {/* TAB 4: Account & Session (Centered Account Profile & Cookies) */}
        {/* ========================================================= */}
        <Show when={activeTab() === "account"}>
          <div class="w-full space-y-4">
            {/* Google Account Profile Card */}
            <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] space-y-3">
              <div class="flex items-center gap-2">
                <User class="w-4 h-4 text-[#ff2222]" />
                <div>
                  <h3 class="text-xs font-semibold text-white">Google & YouTube Music Profile</h3>
                  <p class="text-[11px] text-[#888888]">
                    Manage authentication session, liked songs synchronization, and recommendations.
                  </p>
                </div>
              </div>

              <Show
                when={playerStore.isLoggedIn()}
                fallback={
                  <div class="p-3.5 rounded-sm bg-[#050505] border border-[#181818] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div class="text-white font-medium text-[11px]">No Google Account Connected</div>
                      <div class="text-[10px] text-[#666666] mt-0.5">
                        Log in via dedicated Webview window to automatically sync your Liked Songs, library and playlists.
                      </div>
                    </div>
                    <button
                      onClick={() => playerStore.openLoginWindow()}
                      class="px-3.5 py-2 rounded-sm bg-[#ff2222] hover:bg-[#e01a1a] text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <LogIn class="w-3.5 h-3.5" />
                      <span>Launch Google Sign-In Window</span>
                    </button>
                  </div>
                }
              >
                <div class="p-3.5 rounded-sm bg-[#050505] border border-[#181818] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <Show
                      when={playerStore.userProfile()?.avatar_url}
                      fallback={
                        <div class="w-10 h-10 rounded-sm bg-[#140505] border border-[#ff2222]/40 flex items-center justify-center shrink-0">
                          <User class="w-5 h-5 text-[#ff2222]" />
                        </div>
                      }
                    >
                      <img
                        src={playerStore.userProfile()?.avatar_url}
                        alt="Profile avatar"
                        class="w-10 h-10 rounded-sm border border-[#262626] object-cover shrink-0"
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                      />
                    </Show>
                    <div class="min-w-0">
                      <div class="text-white font-bold text-xs truncate">
                        {playerStore.userProfile()?.name || "Connected User"}
                      </div>
                      <div class="text-[10px] text-[#27c93f] flex items-center gap-1 mt-0.5">
                        <span>●</span>
                        <span class="text-[#888888] truncate">{playerStore.userProfile()?.handle || "Authenticated & Synced"}</span>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => playerStore.syncAllUserData(true)}
                      disabled={playerStore.isSyncing()}
                      class="px-3.5 py-1.5 rounded-sm bg-[#140505] hover:bg-[#200808] text-[#ff2222] border border-[#ff2222]/40 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      title="Sync Liked Songs and Library"
                    >
                      <RefreshCw class={`w-3.5 h-3.5 ${playerStore.isSyncing() ? "animate-spin" : ""}`} />
                      <span>{playerStore.isSyncing() ? "Syncing..." : "Sync Library"}</span>
                    </button>

                    <button
                      onClick={() => playerStore.logoutUser()}
                      class="px-3.5 py-1.5 rounded-sm bg-[#121212] hover:bg-[#200808] text-[#888888] hover:text-[#ff2222] border border-[#222222] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Sign out from this session"
                    >
                      <LogOut class="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </Show>

              {/* Auto Sync Info Bar */}
              <div class="p-2.5 rounded-sm bg-[#050505] border border-[#181818] flex items-center justify-between text-[10px] text-[#666666]">
                <span>Auto-sync interval: 5 minutes when logged in</span>
                <span class="text-[#888888]">{playerStore.likedTracks().length} Liked Tracks Cached</span>
              </div>
            </div>

            {/* Manual Cookie Storage Fallback */}
            <div class="p-4 rounded-sm bg-[#0a0a0a] border border-[#181818] space-y-3">
              <div class="flex items-center gap-2">
                <Shield class="w-4 h-4 text-[#ff2222]" />
                <div>
                  <h3 class="text-xs font-semibold text-white">Manual Cookie Storage (Fallback)</h3>
                  <p class="text-[11px] text-[#888888]">
                    Optional fallback for Netscape cookies.txt or Cookie header export if Webview login is blocked.
                  </p>
                </div>
              </div>

              <textarea
                rows="3"
                value={cookieInput()}
                onInput={(e) => setCookieInput(e.currentTarget.value)}
                placeholder="Paste raw Netscape cookies.txt string here..."
                class="w-full bg-[#050505] text-white p-2.5 rounded-sm border border-[#181818] text-[11px] font-mono focus:outline-none focus:border-[#ff2222]"
              />

              <div class="flex justify-end">
                <button
                  onClick={handleSaveCookie}
                  class="px-3.5 py-1.5 rounded-sm bg-[#140505] hover:bg-[#200808] text-[#ff2222] border border-[#ff2222]/40 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Show when={cookieSaved()} fallback={<span>Save Cookies</span>}>
                    <Check class="w-3.5 h-3.5 text-[#ff2222]" />
                    <span class="text-[#ff2222] font-semibold">Saved</span>
                  </Show>
                </button>
              </div>
            </div>
          </div>
        </Show>
        </div>
      </div>
    </div>
  );
};
