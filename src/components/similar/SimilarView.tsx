import { Component, For, Show } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { formatDuration, getCleanArtist, cleanTrack } from "../../models/track";
import { Radio, Sparkles, Plus, Loader2, Music2, Heart } from "lucide-solid";
import { TrackRowPlayCell } from "../player/PlayingIndicator";

export const SimilarView: Component = () => {
  const current = () => playerStore.currentTrack();
  const recommendations = () => playerStore.songRecommendations();
  const isLoading = () => playerStore.isRecommendationsLoading();

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  return (
    <div class="h-full overflow-y-auto p-5 select-none bg-[#000000] font-mono text-xs">
      {/* Header */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#181818] mb-4"
      >
        <div data-tauri-drag-region>
          <div data-tauri-drag-region class="flex items-center gap-2">
            <Radio class="w-4 h-4 text-[#ff2222] pointer-events-none" />
            <h2 data-tauri-drag-region class="text-base font-bold text-white tracking-tight">
              Similar Tracks
            </h2>
            <Show when={isLoading()}>
              <Loader2 class="w-3.5 h-3.5 animate-spin text-[#ff2222]" />
            </Show>
          </div>
          <Show
            when={current()}
            fallback={
              <p data-tauri-drag-region class="text-[11px] text-[#777777] mt-0.5">
                Play any track to discover algorithmically similar songs and radio automix.
              </p>
            }
          >
            <p data-tauri-drag-region class="text-[11px] text-[#888888] mt-0.5">
              Automix based on <span data-tauri-drag-region class="text-white font-semibold">"{cleanTrack(current()!).title}"</span> &bull; {getCleanArtist(current()!)}
            </p>
          </Show>
        </div>

        <div class="flex items-center gap-2">
          <Show when={current()}>
            <button
              onClick={() => playerStore.startSongRadio(current()!)}
              class="px-3 py-1.5 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Refresh / Start Radio based on current track"
            >
              <Radio class="w-3.5 h-3.5" />
              <span>Start Song Radio</span>
            </button>
          </Show>
          <Show when={recommendations().length > 0}>
            <button
              onClick={() => playerStore.addRecommendationsToQueue()}
              class="px-3 py-1.5 rounded bg-[#0a0a0a] hover:bg-[#140505] text-[#888888] hover:text-white border border-[#222222] hover:border-[#ff2222]/40 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Append all similar songs to playback queue"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Add All to Queue</span>
            </button>
          </Show>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 w-full">
        <Show
          when={recommendations().length > 0}
          fallback={
            <div class="py-24 text-center text-[#555555] bg-[#050505] border border-[#181818] rounded">
              <Show
                when={isLoading()}
                fallback={
                  <>
                    <Sparkles class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                    <p class="text-xs font-mono">
                      {current() ? "No similar tracks found for this song." : "No track currently playing."}
                    </p>
                    <p class="text-[11px] text-[#444444] mt-0.5">
                      {current()
                        ? "Click 'Start Song Radio' above to query YouTube Music InnerTube radio."
                        : "Start playing any song to see automated radio recommendations."}
                    </p>
                  </>
                }
              >
                <Loader2 class="w-6 h-6 animate-spin text-[#ff2222] mx-auto mb-2" />
                <p class="text-xs font-mono text-[#888888]">
                  Fetching YouTube Music radio recommendations...
                </p>
              </Show>
            </div>
          }
        >
          <div class="border border-[#181818] rounded bg-[#050505] w-full">
            <div class="grid grid-cols-12 gap-3 px-3 py-2 bg-[#0a0a0a] border-b border-[#181818] text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
              <span class="col-span-1 text-center">#</span>
              <span class="col-span-5">Title</span>
              <span class="col-span-3">Artist</span>
              <span class="col-span-1 hidden md:block">Source</span>
              <span class="col-span-2 text-right">Time & Actions</span>
            </div>

            <div class="divide-y divide-[#141414]">
              <For each={recommendations()}>
                {(track, index) => {
                  const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                  const isLiked = () => playerStore.likedTrackIds().has(track.id);

                  return (
                    <div
                      onClick={() => {
                        if (isCurrent()) {
                          playerStore.togglePlay();
                        } else {
                          playerStore.setFullQueue(recommendations(), index(), false);
                        }
                      }}
                      onMouseEnter={() => playerStore.preloadTrack(track.id)}
                      class={`grid grid-cols-12 gap-3 items-center px-3 py-2 group hover:bg-[#0c0c0c] cursor-pointer text-xs transition-colors ${
                        isCurrent()
                          ? "bg-[#140505] text-white border-l-2 border-l-[#ff2222]"
                          : "text-[#cccccc]"
                      }`}
                    >
                      <div class="col-span-1 flex items-center justify-center font-mono text-[11px] text-[#555555]">
                        <TrackRowPlayCell trackId={track.id} index={index() + 1} accentColor="red" />
                      </div>

                      <div class="col-span-5 flex items-center gap-2.5 min-w-0">
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

                      <div class="col-span-3 truncate text-[#888888] text-[11px]">
                        <span
                          class="hover:text-[#ff2222] hover:underline cursor-pointer transition-colors"
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

                      <div class="col-span-1 hidden md:block truncate text-[11px] text-[#555555]">
                        Radio
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
    </div>
  );
};
