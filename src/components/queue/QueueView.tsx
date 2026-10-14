import { Component, For, Show } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { formatDuration, getCleanArtist, Track } from "../../models/track";
import { Shuffle, Trash2, Music2, Heart, X } from "lucide-solid";
import { TrackRowPlayCell } from "../player/PlayingIndicator";

export const QueueView: Component = () => {
  const displayTracks = (): Track[] => {
    if (playerStore.queue().length > 0) return playerStore.queue();
    return playerStore.upcomingContextTracks();
  };
  const isContextView = () => playerStore.queue().length === 0 && playerStore.upcomingContextTracks().length > 0;

  const totalDuration = () => {
    const list = displayTracks();
    const sumSecs = list.reduce((acc: number, t: Track) => acc + (t.duration_seconds || 0), 0);
    const hrs = Math.floor(sumSecs / 3600);
    const mins = Math.floor((sumSecs % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const isStandalone = () => {
    const cur = playerStore.currentTrack();
    if (!cur) return false;
    return playerStore.currentIndex() === -1;
  };

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  return (
    <div class="h-full flex flex-col p-5 select-none bg-[#000000] font-mono text-xs overflow-hidden">
      {/* 1. Static Top Header (Sticky) */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        class="shrink-0 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#181818] mb-3"
      >
        <div data-tauri-drag-region>
          <h2 data-tauri-drag-region class="text-base font-bold text-white tracking-tight">
            {isContextView() ? `Upcoming • ${playerStore.contextName() || "Playing"}` : "Play Queue"}
          </h2>
          <p data-tauri-drag-region class="text-[11px] text-[#888888] mt-0.5">
            {displayTracks().length} tracks &bull; {totalDuration()} total
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={() => playerStore.toggleShuffle()}
            class={`px-2.5 py-1 rounded text-xs font-mono flex items-center gap-1.5 transition-colors border cursor-pointer ${
              playerStore.isShuffled()
                ? "bg-[#140505] text-[#ff2222] border-[#ff2222]"
                : "bg-[#0a0a0a] text-[#888888] border-[#222222] hover:text-white hover:border-[#444444]"
            }`}
          >
            <Shuffle class="w-3 h-3 text-[#ff2222]" />
            <span>Shuffle (Fisher-Yates)</span>
          </button>

          <button
            onClick={() => playerStore.clearQueue()}
            class="px-2.5 py-1 rounded bg-[#0a0a0a] hover:bg-[#140505] text-xs font-mono text-[#888888] hover:text-[#ff2222] border border-[#222222] hover:border-[#ff2222]/40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 class="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* 2. Standalone Now Playing Card */}
      <Show when={isStandalone()}>
        {(_) => {
          const cur = () => playerStore.currentTrack()!;
          const isLiked = () => playerStore.likedTrackIds().has(cur().id);

          return (
            <div class="shrink-0 mb-3.5 p-3 rounded-lg border border-[#222222] bg-[#0c0c0c] flex items-center justify-between gap-3 shadow-md">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded bg-[#111111] overflow-hidden shrink-0 border border-[#222222]">
                  <Show
                    when={cur().thumbnail_url}
                    fallback={
                      <div class="w-full h-full flex items-center justify-center text-[#ff2222]">
                        <Music2 class="w-4 h-4" />
                      </div>
                    }
                  >
                    <img
                      src={cur().thumbnail_url}
                      alt={cur().title}
                      loading="lazy"
                      decoding="async"
                      class="w-full h-full object-cover"
                    />
                  </Show>
                </div>

                <div class="min-w-0">
                  <div class="text-[10px] uppercase font-bold text-[#ff2222] tracking-wider flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#ff2222] animate-pulse" />
                    Now Playing
                  </div>
                  <div class="text-xs font-semibold text-white truncate mt-0.5" title={cur().title}>
                    {cur().title}
                  </div>
                  <div class="text-[11px] text-[#888888] truncate">
                    <span
                      class="hover:text-[#ff2222] hover:underline cursor-pointer transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        const target = cur().artist_id || getCleanArtist(cur());
                        if (target) playerStore.openArtist(target);
                      }}
                    >
                      {getCleanArtist(cur())}
                    </span>
                  </div>
                </div>
              </div>

              <div class="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playerStore.toggleLike(cur());
                  }}
                  title="Like track"
                  class={`p-1.5 rounded transition-colors cursor-pointer ${
                    isLiked() ? "text-[#ff2222]" : "text-[#555555] hover:text-white"
                  }`}
                >
                  <Heart class={`w-3.5 h-3.5 ${isLiked() ? "fill-[#ff2222]" : ""}`} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playerStore.addToQueue(cur());
                  }}
                  title="Add to queue"
                  class="px-2.5 py-1 rounded bg-[#161616] hover:bg-[#202020] text-[#cccccc] hover:text-white border border-[#282828] text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer font-mono"
                >
                  <span>+ Queue</span>
                </button>
              </div>
            </div>
          );
        }}
      </Show>

      {/* 3. Main Queue Area */}
      <Show
        when={displayTracks().length > 0}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center text-[#555555] py-20 text-center px-4">
            <Music2 class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#ff2222]" />
            <p class="text-xs font-mono text-[#aaaaaa]">Your queue is empty.</p>
            <p class="text-[11px] text-[#555555] mt-1 max-w-sm">
              Add songs via context menu or the '+' button next to a track.
            </p>
          </div>
        }
      >
        <div class="flex-1 min-h-0 border border-[#181818] rounded bg-[#050505] w-full flex flex-col overflow-hidden">
          {/* Static Column Header (Sticky) */}
          <div class="shrink-0 grid grid-cols-12 gap-3 px-3 py-2 bg-[#0a0a0a] border-b border-[#181818] text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
            <span class="col-span-1 text-center">#</span>
            <span class="col-span-4">Title</span>
            <span class="col-span-2">Artist</span>
            <span class="col-span-2 hidden md:block truncate">Album</span>
            <span class="col-span-1 text-right hidden sm:block">Views</span>
            <span class="col-span-2 text-right">Time</span>
          </div>

          {/* Scrollable Song Rows */}
          <div class="flex-1 min-h-0 overflow-y-auto divide-y divide-[#141414]">
            <For each={displayTracks()}>
              {(track, index) => {
                const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                const isLiked = () => playerStore.likedTrackIds().has(track.id);

                return (
                  <div
                    onClick={() => {
                      if (isCurrent()) {
                        playerStore.togglePlay();
                      } else if (isContextView()) {
                        playerStore.playTrack(track);
                      } else {
                        playerStore.playTrackAt(index());
                      }
                    }}
                    class={`grid grid-cols-12 gap-3 items-center px-3 py-2 group hover:bg-[#0c0c0c] cursor-pointer text-xs transition-colors ${
                      isCurrent()
                        ? "bg-[#140505] text-white border-l-2 border-l-[#ff2222]"
                        : "text-[#cccccc]"
                    }`}
                  >
                    <div class="col-span-1 flex items-center justify-center font-mono text-[11px] text-[#555555]">
                      <TrackRowPlayCell trackId={track.id} index={index() + 1} accentColor="red" />
                    </div>

                    <div class="col-span-4 flex items-center gap-2.5 min-w-0">
                      <div class="w-7 h-7 rounded bg-[#111111] overflow-hidden shrink-0 border border-[#1e1e1e]">
                        <Show
                          when={track.thumbnail_url}
                          fallback={
                            <div class="w-full h-full flex items-center justify-center text-[#444444]">
                              <Music2 class="w-3.5 h-3.5" />
                            </div>
                          }
                        >
                          <img
                            src={track.thumbnail_url}
                            alt={track.title}
                            loading="lazy"
                            decoding="async"
                            class="w-full h-full object-cover"
                          />
                        </Show>
                      </div>

                      <h4
                        class={`truncate ${
                          isCurrent() ? "text-[#ff2222] font-bold" : "text-white"
                        }`}
                      >
                        {track.title}
                      </h4>
                    </div>

                    <div class="col-span-2 truncate text-[11px]">
                      <span
                        class="hover:text-[#ff2222] hover:underline cursor-pointer text-[#888888] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = track.artist_id || getCleanArtist(track);
                          if (target) {
                            playerStore.openArtist(target);
                          }
                        }}
                        title="Open artist profile"
                      >
                        {getCleanArtist(track)}
                      </span>
                    </div>

                    {/* Album */}
                    <div class="col-span-2 hidden md:block text-[11px] text-[#777777] truncate font-mono" title={track.album || "—"}>
                      {track.album || "—"}
                    </div>

                    {/* Views Count */}
                    <div class="col-span-1 hidden sm:block text-right font-mono text-[11px] text-[#777777] truncate">
                      {track.views || "-"}
                    </div>

                    <div
                      class="col-span-2 flex items-center justify-end gap-1.5 font-mono text-[11px] text-[#888888]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playerStore.toggleLike(track);
                        }}
                        title="Like track"
                        class={`p-1 rounded transition-colors cursor-pointer ${
                          isLiked() ? "text-[#ff2222]" : "text-[#555555] hover:text-white"
                        }`}
                      >
                        <Heart class={`w-3.5 h-3.5 ${isLiked() ? "fill-[#ff2222]" : ""}`} />
                      </button>
                      <Show when={!isContextView()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playerStore.removeFromQueue(index());
                          }}
                          title="Remove from queue"
                          class="p-1 rounded text-[#555555] hover:text-[#ff2222] hover:bg-[#140505] transition-colors cursor-pointer"
                        >
                          <X class="w-3.5 h-3.5" />
                        </button>
                      </Show>
                      <span class="w-10 text-right">
                        {formatDuration(track.duration_seconds)}
                      </span>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};

export const PlayQueueView = QueueView;
export default QueueView;
