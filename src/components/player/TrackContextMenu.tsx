import { Component, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Track, getCleanArtist, cleanTrack } from "../../models/track";
import { playerStore } from "../../stores/playerStore";
import { blockArtist, showNotification } from "../../services/aiFilter";
import {
  ShieldAlert,
  Play,
  Plus,
  Heart,
  User,
  MoreVertical,
  X,
} from "lucide-solid";

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  track: Track | null;
}

const [menuState, setMenuState] = createSignal<ContextMenuState>({
  isOpen: false,
  x: 0,
  y: 0,
  track: null,
});

export function openTrackContextMenu(e: MouseEvent, track: Track) {
  e.preventDefault();
  e.stopPropagation();

  // Clamp menu inside window viewport boundaries
  const menuWidth = 240;
  const menuHeight = 220;
  const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
  const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);

  setMenuState({
    isOpen: true,
    x: Math.max(10, x),
    y: Math.max(10, y),
    track,
  });
}

export function closeTrackContextMenu() {
  setMenuState((prev) => ({ ...prev, isOpen: false, track: null }));
}

export const TrackContextMenu: Component = () => {
  let menuRef: HTMLDivElement | undefined;

  const handleDocumentClick = (e: MouseEvent) => {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      closeTrackContextMenu();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeTrackContextMenu();
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleBlockArtist = () => {
    const t = menuState().track;
    if (!t) return;
    const artist = getCleanArtist(t) || t.artist;
    blockArtist(artist);
    showNotification(
      "🛡️ AI Filter",
      `Artist "${artist}" blocked and marked as AI.`,
      t.thumbnail_url
    );
    closeTrackContextMenu();
  };

  const handlePlayNow = () => {
    const t = menuState().track;
    if (t) {
      playerStore.playTrack(cleanTrack(t));
    }
    closeTrackContextMenu();
  };

  const handleAddToQueue = () => {
    const t = menuState().track;
    if (t) {
      playerStore.addToQueue(cleanTrack(t));
    }
    closeTrackContextMenu();
  };

  const handleToggleLike = () => {
    const t = menuState().track;
    if (t) {
      playerStore.toggleLike(t);
    }
    closeTrackContextMenu();
  };

  const handleOpenArtist = () => {
    const t = menuState().track;
    if (t) {
      const art = t.artist_id || getCleanArtist(t);
      playerStore.openArtist(art);
    }
    closeTrackContextMenu();
  };

  const isLiked = () => {
    const t = menuState().track;
    return t ? playerStore.likedTrackIds().has(t.id) : false;
  };

  return (
    <Show when={menuState().isOpen && menuState().track}>
      {/* Invisible backdrop to capture interactions and prevent scroll-through */}
      <div
        class="fixed inset-0 z-50 pointer-events-auto"
        onClick={() => closeTrackContextMenu()}
        onContextMenu={(e) => {
          e.preventDefault();
          closeTrackContextMenu();
        }}
      >
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          class="fixed z-50 w-64 bg-[#0a0a0a] border border-[#222222] rounded shadow-[0_16px_40px_rgba(0,0,0,0.95)] text-xs font-mono overflow-hidden divide-y divide-[#181818] animate-in fade-in duration-100"
          style={{
            top: `${menuState().y}px`,
            left: `${menuState().x}px`,
          }}
        >
          {/* Header Info */}
          <div class="p-2.5 bg-[#050505] flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="text-white font-semibold truncate text-[11px]">
                {cleanTrack(menuState().track!).title}
              </div>
              <div class="text-[#888888] truncate text-[10px]">
                {getCleanArtist(menuState().track!)}
              </div>
            </div>
            <button
              onClick={() => closeTrackContextMenu()}
              class="text-[#555555] hover:text-white p-1 transition-colors cursor-pointer"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Action Items */}
          <div class="py-1">
            {/* Primary Action: Block as AI / Hide artist */}
            <button
              onClick={handleBlockArtist}
              class="w-full text-left px-3 py-2 flex items-center gap-2.5 text-[#ff4444] hover:bg-[#1a0505] hover:text-[#ff2222] transition-colors cursor-pointer font-bold text-[11px]"
              title="Mark artist as AI generator and hide their tracks"
            >
              <ShieldAlert class="w-3.5 h-3.5 shrink-0 text-[#ff2222]" />
              <span>🛡️ Mark as AI / Hide Artist</span>
            </button>

            <button
              onClick={handlePlayNow}
              class="w-full text-left px-3 py-1.5 flex items-center gap-2.5 text-[#cccccc] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer text-[11px]"
            >
              <Play class="w-3.5 h-3.5 shrink-0 text-[#888888]" />
              <span>Play Now</span>
            </button>

            <button
              onClick={handleAddToQueue}
              class="w-full text-left px-3 py-1.5 flex items-center gap-2.5 text-[#cccccc] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer text-[11px]"
            >
              <Plus class="w-3.5 h-3.5 shrink-0 text-[#888888]" />
              <span>Add to Queue</span>
            </button>

            <button
              onClick={handleToggleLike}
              class="w-full text-left px-3 py-1.5 flex items-center gap-2.5 text-[#cccccc] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer text-[11px]"
            >
              <Heart
                class={`w-3.5 h-3.5 shrink-0 ${
                  isLiked() ? "fill-[#ff2222] text-[#ff2222]" : "text-[#888888]"
                }`}
              />
              <span>{isLiked() ? "Remove from Liked Songs" : "Add to Liked Songs"}</span>
            </button>

            <button
              onClick={handleOpenArtist}
              class="w-full text-left px-3 py-1.5 flex items-center gap-2.5 text-[#cccccc] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer text-[11px]"
            >
              <User class="w-3.5 h-3.5 shrink-0 text-[#888888]" />
              <span>Go to Artist</span>
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export const TrackOptionsTrigger: Component<{
  track: Track;
  class?: string;
}> = (props) => {
  return (
    <button
      onClick={(e) => openTrackContextMenu(e, props.track)}
      class={`p-1 rounded text-[#555555] hover:text-[#ff2222] hover:bg-[#140505] transition-colors cursor-pointer ${
        props.class || ""
      }`}
      title="Track Options / Mark as AI"
    >
      <MoreVertical class="w-3.5 h-3.5" />
    </button>
  );
};

export default TrackContextMenu;
