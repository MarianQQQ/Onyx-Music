import { Component, createSignal, onCleanup, onMount, Show } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/navigation/Sidebar";
import { HomeView } from "./components/home/HomeView";
import { SearchView } from "./components/search/SearchView";
import { QueueView } from "./components/queue/QueueView";
import { SimilarView } from "./components/similar/SimilarView";
import { LikedView } from "./components/library/LikedView";
import { HistoryView } from "./components/history/HistoryView";
import { LyricsView } from "./components/lyrics/LyricsView";
import { PlaylistLoaderView } from "./components/library/PlaylistLoaderView";
import { PlaylistView } from "./components/library/PlaylistView";
import { SettingsView } from "./components/settings/SettingsView";
import { PluginsView } from "./components/plugins/PluginsView";
import { ArtistView } from "./components/artist/ArtistView";
import { PlayerBar } from "./components/player/PlayerBar";
import { NowPlayingView } from "./components/player/NowPlayingView";
import { playerStore } from "./stores/playerStore";
import { activeToast, dismissPluginToast, pluginManager } from "./services/pluginManager";
import { UserProfile } from "./models/track";
import { AlertCircle, X, Copy, Check, Music2 } from "lucide-solid";
import { TrackContextMenu } from "./components/player/TrackContextMenu";
import "./App.css";

const App: Component = () => {
  const initialTab = playerStore.startupTab() || "home";
  const [activeTab, setActiveTab] = createSignal(initialTab);
  const [previousTab, setPreviousTab] = createSignal(initialTab);
  const [copiedError, setCopiedError] = createSignal(false);

  const handleTabChange = (tab: string) => {
    playerStore.closeArtist();
    playerStore.closePlaylist();
    if (tab === activeTab() && (tab === "queue" || tab === "lyrics" || tab === "now-playing")) {
      setActiveTab(previousTab());
    } else {
      if (activeTab() !== "queue" && activeTab() !== "lyrics" && activeTab() !== "now-playing") {
        setPreviousTab(activeTab());
      }
      setActiveTab(tab);
    }
  };

  const handleCopyError = () => {
    const err = playerStore.errorMessage();
    if (err) {
      navigator.clipboard.writeText(err);
      setCopiedError(true);
      setTimeout(() => setCopiedError(false), 2000);
    }
  };

  onMount(() => {
    (async () => {
      const launchedMinimized = await invoke<boolean>("is_launched_minimized").catch(() => false);
      if (!playerStore.startInTray() && !launchedMinimized) {
        requestAnimationFrame(() => {
          invoke("window_show").catch(() => {});
        });
      }
    })();

    // Disable default browser context menu globally
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Allow default context menu only on text inputs or textareas if user explicitly right-clicks to copy/paste text
      if (target.closest("input[type='text'], input[type='search'], textarea, [contenteditable='true']")) {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("contextmenu", handleContextMenu);

    // Initial auth status restoration and home feed preloading so hotkey play works immediately
    playerStore.checkAuth();
    playerStore.loadHomeFeed();

    // Register only user-configured global shortcuts on startup (default: all unbound / "")
    try {
      const saved = localStorage.getItem("ytm_global_shortcuts");
      const parsed = saved ? JSON.parse(saved) : {};
      invoke("register_custom_shortcuts", {
        playPause: parsed.play_pause || "",
        next: parsed.next || "",
        prev: parsed.prev || "",
        volUp: parsed.vol_up || "",
        volDown: parsed.vol_down || "",
      }).catch((err) => console.warn("Global shortcut register notice:", err));
    } catch (e) {
      console.warn("Global shortcuts load error:", e);
    }

    // Listen to background auth-success and auth-logout events
    const unlistenAuthPromise = listen<UserProfile | null>("auth-success", (event) => {
      if (event.payload) {
        playerStore.setUserProfile(event.payload);
        playerStore.setIsLoggedIn(true);
        playerStore.syncAllUserData(true);
      } else {
        playerStore.checkAuth();
      }
    });

    const unlistenLogoutPromise = listen("auth-logout", () => {
      playerStore.clearAccountData();
    });

    // Automatic background sync every 5 minutes when logged in
    const syncInterval = window.setInterval(() => {
      if (playerStore.isLoggedIn()) {
        playerStore.syncAllUserData(true);
      }
    }, 5 * 60 * 1000);

    // Hold-to-repeat timers for global Volume Up / Volume Down shortcuts
    let volUpDelayTimer: number | null = null;
    let volUpRepeatTimer: number | null = null;
    let volDownDelayTimer: number | null = null;
    let volDownRepeatTimer: number | null = null;

    const clearVolUpTimers = () => {
      if (volUpDelayTimer !== null) {
        window.clearTimeout(volUpDelayTimer);
        volUpDelayTimer = null;
      }
      if (volUpRepeatTimer !== null) {
        window.clearInterval(volUpRepeatTimer);
        volUpRepeatTimer = null;
      }
    };

    const clearVolDownTimers = () => {
      if (volDownDelayTimer !== null) {
        window.clearTimeout(volDownDelayTimer);
        volDownDelayTimer = null;
      }
      if (volDownRepeatTimer !== null) {
        window.clearInterval(volDownRepeatTimer);
        volDownRepeatTimer = null;
      }
    };

    const stepVolumeBy = (direction: 1 | -1) => {
      const step = playerStore.volumeStep() / 100;
      const nextVol = Math.round((playerStore.volume() + direction * step) * 100) / 100;
      playerStore.changeVolume(Math.max(0, Math.min(1, nextVol)));
    };

    // Global background / tray media shortcuts listener
    const unlistenPromise = listen<string>("global-media-action", (event) => {
      const action = event.payload;
      if (action === "toggle-play") {
        playerStore.togglePlay();
      } else if (action === "next-track") {
        playerStore.playNext();
      } else if (action === "previous-track") {
        playerStore.playPrevious();
      } else if (action === "volume-up") {
        clearVolDownTimers();
        stepVolumeBy(1);
        if (volUpDelayTimer === null && volUpRepeatTimer === null) {
          volUpDelayTimer = window.setTimeout(() => {
            volUpDelayTimer = null;
            volUpRepeatTimer = window.setInterval(() => {
              stepVolumeBy(1);
            }, 55);
          }, 220);
        }
      } else if (action === "volume-up-release") {
        clearVolUpTimers();
      } else if (action === "volume-down") {
        clearVolUpTimers();
        stepVolumeBy(-1);
        if (volDownDelayTimer === null && volDownRepeatTimer === null) {
          volDownDelayTimer = window.setTimeout(() => {
            volDownDelayTimer = null;
            volDownRepeatTimer = window.setInterval(() => {
              stepVolumeBy(-1);
            }, 55);
          }, 220);
        }
      } else if (action === "volume-down-release") {
        clearVolDownTimers();
      }
    });

    onCleanup(() => {
      window.removeEventListener("contextmenu", handleContextMenu);
      clearVolUpTimers();
      clearVolDownTimers();
      window.clearInterval(syncInterval);
      unlistenPromise.then((unlisten) => unlisten());
      unlistenAuthPromise.then((unlisten) => unlisten());
      unlistenLogoutPromise.then((unlisten) => unlisten());
    });
  });

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  const handleDragDblClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.toggleMaximizeWindow();
  };

  return (
    <div class="h-screen w-screen flex flex-col bg-[#000000] text-[#e5e5e5] overflow-hidden select-none font-mono">
      {/* Onyx Window Titlebar with native dragging and window controls */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        onDblClick={handleDragDblClick}
        class="h-8 bg-[#0a0a0a] border-b border-[#181818] flex items-center justify-between pl-3 pr-0 select-none shrink-0 text-xs cursor-default"
      >
        <div data-tauri-drag-region class="flex items-center gap-2 pointer-events-none">
          <span
            data-tauri-drag-region
            class="font-mono text-white font-bold text-xs tracking-tight select-none flex items-center gap-1.5"
          >
            <span data-tauri-drag-region class="text-[#ff2222]">▶</span> Onyx Music
          </span>
        </div>

        {/* Center Draggable Region */}
        <div data-tauri-drag-region class="flex-1 h-full pointer-events-none" />

        {/* Right side window control buttons */}
        <div class="flex items-center text-[#888888] h-full">
          <button
            onClick={() => playerStore.minimizeWindow()}
            title="Minimize"
            class="h-8 w-11 hover:text-white hover:bg-[#1f1f1f] transition-colors text-xs flex items-center justify-center cursor-pointer"
          >
            &#x2014;
          </button>
          <button
            onClick={() => playerStore.toggleMaximizeWindow()}
            title="Maximize / Restore"
            class="h-8 w-11 hover:text-white hover:bg-[#1f1f1f] transition-colors text-xs flex items-center justify-center cursor-pointer"
          >
            &#x25A2;
          </button>
          <button
            onClick={() => playerStore.closeWindow()}
            title="Close"
            class="h-8 w-11 hover:text-white hover:bg-[#e81123] transition-colors text-xs flex items-center justify-center cursor-pointer"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Retro-Red Desktop Notification Toast (Plugin: desktop-notifications) */}
      <Show when={activeToast()}>
        <div class="fixed bottom-20 right-4 z-50 w-72 bg-[#0a0a0a] border border-[#ff2222]/60 rounded-sm p-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.9)] flex items-center gap-2.5 text-xs font-mono">
          <div class="w-10 h-10 rounded-none bg-[#141414] border border-[#262626] shrink-0 overflow-hidden flex items-center justify-center">
            <Show
              when={activeToast()?.icon}
              fallback={<Music2 class="w-4 h-4 text-[#ff2222]" />}
            >
              <img
                src={activeToast()!.icon}
                alt={activeToast()!.title}
                loading="lazy"
                decoding="async"
                class="w-full h-full object-cover"
              />
            </Show>
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[9px] uppercase tracking-wider text-[#ff2222] font-bold">
              Now Playing
            </div>
            <div class="text-xs font-bold text-white truncate">
              {activeToast()?.title}
            </div>
            <div class="text-[11px] text-[#888888] truncate">
              {activeToast()?.body}
            </div>
          </div>
          <button
            onClick={() => dismissPluginToast()}
            class="text-[#666666] hover:text-white p-1 transition-colors cursor-pointer shrink-0"
            title="Dismiss notification"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </Show>

      {/* Centered Error Alert Modal / Toast with Copy Support */}
      <Show when={playerStore.errorMessage()}>
        <div class="fixed left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 z-50 bg-[#0a0a0a] border border-[#ff2222] text-[#e5e5e5] p-4 rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.95)] flex flex-col gap-2.5 max-w-lg w-[90%] text-xs animate-in fade-in duration-200">
          <div class="flex items-center justify-between border-b border-[#222222] pb-2">
            <div class="flex items-center gap-2 text-[#ff2222] font-bold">
              <AlertCircle class="w-4 h-4 shrink-0 text-[#ff2222]" />
              <span>Playback / Stream Notice</span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                onClick={handleCopyError}
                class="px-2 py-0.5 rounded bg-[#181818] hover:bg-[#222222] text-[#e5e5e5] border border-[#2a2a2a] flex items-center gap-1 transition-colors text-[11px] cursor-pointer"
                title="Copy error details to clipboard"
              >
                <Show when={copiedError()} fallback={<Copy class="w-3 h-3" />}>
                  <Check class="w-3 h-3 text-[#ff2222]" />
                </Show>
                <span>{copiedError() ? "Copied" : "Copy"}</span>
              </button>

              <button
                onClick={() => playerStore.clearError()}
                class="text-[#888888] hover:text-white p-1 rounded hover:bg-[#222222] transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="bg-[#050505] border border-[#1a1a1a] p-3 rounded font-mono text-[11px] text-[#888888] break-all select-text max-h-40 overflow-y-auto leading-relaxed">
            {playerStore.errorMessage()}
          </div>
        </div>
      </Show>

      {/* Main Container */}
      <div class="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Ambient Cover Glow in Main Container when plugin is enabled */}
        <Show when={pluginManager.isEnabled("ambient-glow") && playerStore.currentTrack()?.thumbnail_url}>
          <div
            class="pointer-events-none absolute inset-0 z-10"
            style={{
              background: "radial-gradient(circle at 30% 80%, rgba(255, 34, 34, 0.07), transparent 65%)",
            }}
          />
        </Show>

        {/* Left Sidebar */}
        <Sidebar activeTab={activeTab()} setActiveTab={handleTabChange} />

        {/* Content View Area */}
        <main class="flex-1 h-full min-h-0 overflow-hidden bg-[#000000] relative">
          <Show
            when={!playerStore.selectedArtistId()}
            fallback={<ArtistView />}
          >
            <Show
              when={!playerStore.selectedPlaylistId()}
              fallback={<PlaylistView />}
            >
              <Show when={activeTab() === "home"}>
                <HomeView />
              </Show>
              <Show when={activeTab() === "search"}>
                <SearchView />
              </Show>
              <Show when={activeTab() === "queue"}>
                <QueueView />
              </Show>
              <Show when={activeTab() === "now-playing"}>
                <NowPlayingView onClose={() => handleTabChange(previousTab() || "home")} />
              </Show>
              <Show when={activeTab() === "similar"}>
                <SimilarView />
              </Show>
              <Show when={activeTab() === "liked"}>
                <LikedView />
              </Show>
              <Show when={activeTab() === "history"}>
                <HistoryView />
              </Show>
              <Show when={activeTab() === "library" || activeTab() === "playlist"}>
                <PlaylistLoaderView />
              </Show>
              <Show when={activeTab() === "lyrics"}>
                <LyricsView />
              </Show>
              <Show when={activeTab() === "plugins"}>
                <PluginsView />
              </Show>
              <Show when={activeTab() === "settings"}>
                <SettingsView />
              </Show>
            </Show>
          </Show>
        </main>
      </div>

      {/* Bottom Player Bar */}
      <PlayerBar
        activeTab={activeTab()}
        setActiveTab={handleTabChange}
        previousTab={previousTab()}
      />

      {/* Global Track Actions / Context Menu */}
      <TrackContextMenu />
    </div>
  );
};

export default App;
