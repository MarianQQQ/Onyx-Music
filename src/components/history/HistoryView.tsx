import { Component, For, Show, onMount } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { formatDuration, getCleanArtist } from "../../models/track";
import { Clock, Music2, Heart, Plus, Play, Shuffle } from "lucide-solid";
import { TrackRowPlayCell } from "../player/PlayingIndicator";

export const HistoryView: Component = () => {
  onMount(() => {
    if (playerStore.isLoggedIn()) {
      playerStore.syncHistorySongs(true);
    }
  });

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
        class="shrink-0 mb-3 pb-3 border-b border-[#181818] flex flex-wrap items-center justify-between gap-3"
      >
        <div data-tauri-drag-region>
          <h2 data-tauri-drag-region class="text-base font-bold text-white flex items-center gap-2 tracking-tight">
            <Clock class="w-4 h-4 text-[#ff2222] shrink-0 pointer-events-none" />
            <span data-tauri-drag-region>Playback History</span>
          </h2>
          <p data-tauri-drag-region class="text-[11px] text-[#888888] mt-0.5">
            {playerStore.historyTracks().length} tracks (synced with YouTube Watch History)
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Show when={playerStore.historyTracks().length > 0}>
            <button
              onClick={() => { const tracks = playerStore.historyTracks(); playerStore.setPlaybackContext(tracks, "History"); playerStore.playTrack(tracks[0]); }}
              class="px-2.5 py-1 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white font-semibold text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play class="w-3 h-3 fill-white" />
              <span>Play All</span>
            </button>
            <button
              onClick={() => { const tracks = [...playerStore.historyTracks()].sort(() => Math.random() - 0.5); playerStore.setPlaybackContext(tracks, "History"); playerStore.playTrack(tracks[0]); }}
              class="px-2.5 py-1 rounded bg-[#0a0a0a] hover:bg-[#140505] text-[#888888] hover:text-[#ff2222] border border-[#222222] hover:border-[#ff2222]/40 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Shuffle class="w-3 h-3 text-[#ff2222]" />
              <span>Shuffle</span>
            </button>
          </Show>
        </div>
      </div>

      {/* 2. Main Table Area */}
      <Show
        when={playerStore.historyTracks().length > 0}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center text-[#555555] py-20">
            <Clock class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#ff2222]" />
            <p class="text-xs font-mono">No playback history yet.</p>
            <p class="text-[11px] text-[#444444] mt-0.5">
              Tracks you listen to will automatically appear here.
            </p>
          </div>
        }
      >
        <div class="flex-1 min-h-0 border border-[#181818] rounded bg-[#050505] w-full flex flex-col overflow-hidden">
          {/* Static Column Header (Sticky) */}
          <div class="shrink-0 grid grid-cols-12 gap-3 px-3 py-2 bg-[#0a0a0a] border-b border-[#181818] text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
            <span class="col-span-1 text-center">#</span>
            <span class="col-span-4">Title</span>
            <span class="col-span-3">Artist</span>
            <span class="col-span-2 text-right hidden sm:block">Views</span>
            <span class="col-span-2 text-right">Time</span>
          </div>

          {/* Scrollable Song Rows */}
          <div class="flex-1 min-h-0 overflow-y-auto divide-y divide-[#141414]">
            <For each={playerStore.historyTracks()}>
              {(track, index) => {
                const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                const isLiked = () => playerStore.likedTrackIds().has(track.id);

                return (
                  <div
                    onClick={() => {
                      if (isCurrent()) {
                        playerStore.togglePlay();
                      } else {
                        playerStore.setPlaybackContext(playerStore.historyTracks(), "History"); playerStore.playTrack(track);
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

                    <div class="col-span-3 truncate text-[11px]">
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

                    {/* Views Count */}
                    <div class="col-span-2 hidden sm:block text-right font-mono text-[11px] text-[#777777] truncate">
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playerStore.addToQueue(track);
                        }}
                        title="Add to queue"
                        class="p-1 rounded text-[#555555] hover:text-[#ff2222] hover:bg-[#140505] transition-colors cursor-pointer"
                      >
                        <Plus class="w-3.5 h-3.5" />
                      </button>
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

