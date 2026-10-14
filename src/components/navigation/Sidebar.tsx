import { Component, createSignal, For, Show } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import {
  Compass,
  Search,
  ListMusic,
  Heart,
  Clock,
  Library,
  Mic2,
  Settings,
  LogIn,
  LogOut,
  User,
  Puzzle,
  X,
  RotateCw,
  ChevronDown,
} from "lucide-solid";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: Component<SidebarProps> = (props) => {
  const getInitialPlaylistsExpanded = (): boolean => {
    try {
      return localStorage.getItem("ytm_playlists_expanded") === "true";
    } catch {
      return false;
    }
  };

  const [isPlaylistsExpanded, setIsPlaylistsExpanded] = createSignal<boolean>(getInitialPlaylistsExpanded());

  const togglePlaylistsExpanded = () => {
    setIsPlaylistsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("ytm_playlists_expanded", String(next));
      } catch {}
      return next;
    });
  };
  const navSections = [
    {
      items: [
        { id: "home", label: "Explore", icon: Compass },
        { id: "search", label: "Search", icon: Search },
        {
          id: "queue",
          label: "Play Queue",
          icon: ListMusic,
          badge: () => playerStore.queue().length,
        },
      ],
    },
    {
      items: [
        {
          id: "liked",
          label: "Liked Songs",
          icon: Heart,
          badge: () => playerStore.likedTracks().length,
        },
        { id: "history", label: "History", icon: Clock },
        { id: "library", label: "Playlist Loader", icon: Library },
        { id: "lyrics", label: "Synced Lyrics", icon: Mic2 },
      ],
    },
    {
      items: [
        { id: "plugins", label: "Plugins", icon: Puzzle },
        { id: "settings", label: "Settings", icon: Settings },
      ],
    },
  ];

  return (
    <aside class="w-56 xl:w-60 shrink-0 h-full overflow-hidden bg-[#000000] border-r border-[#181818] flex flex-col justify-between select-none text-xs font-mono">
      {/* Static Navigation Sections (Never scrolls) */}
      <div class="p-2 space-y-2 shrink-0">
        {navSections.map((section, idx) => (
          <div class={idx > 0 ? "pt-2 border-t border-[#141414]" : ""}>
            <div class="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = () => props.activeTab === item.id;
                return (
                  <button
                    onClick={() => {
                      if (item.id === "library") {
                        playerStore.closePlaylist();
                      }
                      props.setActiveTab(item.id);
                    }}
                    class={`w-full py-1.5 px-3 flex items-center justify-between rounded font-mono text-xs font-medium transition-colors text-left cursor-pointer ${
                      isActive()
                        ? "bg-[#140505] text-[#ff2222] font-bold border-l-2 border-l-[#ff2222]"
                        : "text-[#888888] hover:text-white hover:bg-[#0c0c0c]"
                    }`}
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      <Icon class={`w-4 h-4 shrink-0 transition-colors ${isActive() ? "text-[#ff2222]" : "text-[#666666]"}`} />
                      <span class="truncate text-xs font-mono font-medium">{item.label}</span>
                    </div>
                    <Show when={Boolean(item.badge && item.badge() > 0)}>
                      <span class={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        isActive()
                          ? "text-[#ff2222] bg-[#220a0a]"
                          : "text-[#555555] bg-[#111111]"
                      }`}>
                        {item.badge?.()}
                      </span>
                    </Show>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* PLAYLISTS Section: Collapsible, default collapsed */}
      <div class="flex-1 min-h-0 flex flex-col px-2 pt-1 pb-2 border-t border-[#181818]">
        <div
          onClick={togglePlaylistsExpanded}
          class="px-2 py-1 flex items-center justify-between shrink-0 cursor-pointer select-none group rounded hover:bg-[#0a0a0a] transition-colors"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <ChevronDown
              class={`w-3 h-3 text-[#666666] group-hover:text-[#cccccc] transition-transform duration-200 ${
                isPlaylistsExpanded() ? "" : "-rotate-90"
              }`}
            />
            <span class="text-[10px] font-bold uppercase tracking-wider text-[#555555] group-hover:text-[#aaaaaa] transition-colors">
              Playlists
            </span>
            <Show when={!isPlaylistsExpanded() && playerStore.savedPlaylists().length > 0}>
              <span class="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded text-[#555555] bg-[#111111]">
                {playerStore.savedPlaylists().length}
              </span>
            </Show>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (playerStore.isLoggedIn()) {
                playerStore.syncLibrary();
              } else {
                playerStore.openLoginWindow();
              }
            }}
            disabled={playerStore.isSyncing()}
            class="text-[10px] text-[#888888] hover:text-[#ff2222] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title={playerStore.isLoggedIn() ? "Sync playlists with account" : "Sign in to sync"}
          >
            <RotateCw class={`w-3 h-3 ${playerStore.isSyncing() ? "animate-spin text-[#ff2222]" : ""}`} />
            <span>Sync</span>
          </button>
        </div>

        {/* Scrollable Saved Playlists List - ONLY rendered when expanded */}
        <Show when={isPlaylistsExpanded()}>
          <div class="flex-1 min-h-0 overflow-y-auto scrollbar-none space-y-0.5 mt-1">
            <For each={playerStore.savedPlaylists()}>
              {(playlist) => {
                const displayCount = () => {
                  if (playlist.id === "LM" || playlist.title.toLowerCase().includes("liked")) {
                    return playerStore.likedTracks().length || playlist.trackCount;
                  }
                  return playlist.trackCount;
                };

                return (
                  <div
                    onClick={() => {
                      playerStore.closeArtist();
                      playerStore.openPlaylist(playlist.id, playlist.title, playlist.thumbnailUrl);
                    }}
                    class="group relative w-full py-1.5 px-2 flex items-center justify-between rounded font-mono text-xs transition-colors text-left cursor-pointer hover:bg-[#0c0c0c] text-[#888888] hover:text-white"
                  >
                    <div class="flex items-center gap-2 min-w-0 flex-1 pr-1">
                      <ListMusic class="w-3.5 h-3.5 text-[#555555] group-hover:text-[#ff2222] shrink-0 transition-colors" />
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-xs font-medium text-white group-hover:text-[#ff2222] transition-colors">
                          {playlist.title}
                        </div>
                        <div class="text-[10px] text-[#666666]">
                          {displayCount()} tracks
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playerStore.removeSavedPlaylist(playlist.id);
                      }}
                      title="Remove from library"
                      class="opacity-0 group-hover:opacity-100 p-1 text-[#666666] hover:text-[#ff2222] hover:bg-[#220a0a] rounded transition-all cursor-pointer shrink-0"
                    >
                      <X class="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }}
            </For>
            <Show when={playerStore.savedPlaylists().length === 0}>
              <div class="px-2 py-1 text-[11px] text-[#555555] italic">
                No saved playlists
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Google Sign In / Account section */}
      <div class="p-2.5 border-t border-[#181818] bg-[#050505] shrink-0">
        <Show
          when={playerStore.isLoggedIn()}
          fallback={
            <button
              onClick={() => playerStore.openLoginWindow()}
              class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-none bg-[#140505] hover:bg-[#200808] border border-[#ff2222]/40 text-[#ff2222] font-bold transition-colors text-xs cursor-pointer"
              title="Sign in with your Google / YouTube Music account"
            >
              <LogIn class="w-4 h-4 text-[#ff2222]" />
              <span>[&gt; Google Sign-In]</span>
            </button>
          }
        >
          <div class="p-2.5 rounded-none bg-[#0a0a0a] border border-[#181818] flex items-center justify-between gap-2.5">
            <div class="flex items-center gap-2.5 min-w-0">
              <Show
                when={playerStore.userProfile()?.avatar_url}
                fallback={
                  <div class="w-8 h-8 rounded-none bg-[#140505] border border-[#ff2222]/40 flex items-center justify-center shrink-0">
                    <User class="w-4 h-4 text-[#ff2222]" />
                  </div>
                }
              >
                <img
                  src={playerStore.userProfile()?.avatar_url}
                  alt={playerStore.userProfile()?.name || "avatar"}
                  class="w-8 h-8 rounded-none border border-[#262626] object-cover shrink-0 block"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    // Fallback to placeholder if image loading fails (e.g. 403 or network error)
                    const target = e.currentTarget;
                    target.style.display = "none";
                  }}
                />
              </Show>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-bold text-white truncate leading-tight">
                  {playerStore.userProfile()?.name || "Google User"}
                </div>
                <div class="text-[10px] text-[#27c93f] flex items-center gap-1 font-mono leading-none mt-1">
                  <span>●</span>
                  <span class="text-[#888888] truncate">{playerStore.userProfile()?.handle || "Synced"}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => playerStore.logoutUser()}
              title="Log out"
              class="p-1.5 text-[#555555] hover:text-[#ff2222] transition-colors cursor-pointer shrink-0"
            >
              <LogOut class="w-4 h-4" />
            </button>
          </div>
        </Show>
      </div>
    </aside>
  );
};
