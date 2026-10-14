import { Component, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { formatDuration, Track, getHighResThumbnail } from "../../models/track";
import {
  ArrowLeft,
  Play,
  Shuffle,
  Heart,
  Plus,
  Loader2,
  Music2,
  Disc3,
  Check,
  X,
} from "lucide-solid";
import { TrackRowPlayCell } from "../player/PlayingIndicator";

const rowHeight = 44;

export const PlaylistView: Component = () => {
  let containerRef: HTMLDivElement | undefined;
  let tableRef: HTMLDivElement | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(600);
  const [tableOffsetTop, setTableOffsetTop] = createSignal(200);
  let scrollRaf: number | null = null;

  const playlist = () => playerStore.openedPlaylist();
  const meta = () => playerStore.selectedPlaylistMeta();

  const handleScroll = (e: Event) => {
    if (scrollRaf !== null) return;
    const target = e.currentTarget as HTMLElement;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      if (target) {
        setScrollTop(target.scrollTop);
      }
    });
  };

  onMount(() => {
    if (containerRef) {
      setContainerHeight(containerRef.clientHeight || 600);
      setScrollTop(containerRef.scrollTop);
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.height > 0) {
            setContainerHeight(entry.contentRect.height);
          }
        }
      });
      ro.observe(containerRef);
      onCleanup(() => ro.disconnect());
    }
  });

  onCleanup(() => {
    if (scrollRaf !== null) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = null;
    }
  });

  createEffect(() => {
    const pl = playlist();
    if (pl && pl.tracks.length > 0) {
      requestAnimationFrame(() => {
        if (tableRef && containerRef) {
          const cRect = containerRef.getBoundingClientRect();
          const tRect = tableRef.getBoundingClientRect();
          const offset = Math.max(0, tRect.top - cRect.top + containerRef.scrollTop);
          if (offset > 0) {
            setTableOffsetTop(offset);
          }
        }
      });
    }
  });

  const total = () => playlist()?.tracks.length || 0;
  const isVirtual = () => total() > 30;

  const relativeScrollTop = createMemo(() => {
    return Math.max(0, scrollTop() - tableOffsetTop());
  });

  const startIndex = createMemo(() => {
    if (!isVirtual()) return 0;
    return Math.max(0, Math.floor(relativeScrollTop() / rowHeight) - 8);
  });

  const endIndex = createMemo(() => {
    const tot = total();
    if (!isVirtual()) return tot;
    return Math.min(tot, startIndex() + Math.ceil(containerHeight() / rowHeight) + 16);
  });

  const visibleSlice = createMemo(() => {
    const tracks = playlist()?.tracks;
    if (!tracks) return [];
    if (!isVirtual()) return tracks;
    return tracks.slice(startIndex(), endIndex());
  });

  const displayTitle = () =>
    playlist()?.title || meta()?.title || "Playlist / Album";

  const displayThumb = () =>
    meta()?.thumbnail_url ||
    playlist()?.tracks?.[0]?.thumbnail_url ||
    undefined;

  const isAlbum = () =>
    (playerStore.selectedPlaylistId() || "").startsWith("MPREb_") ||
    (meta()?.subtitle || "").toLowerCase().includes("album") ||
    (meta()?.subtitle || "").toLowerCase().includes("single");

  const currentPlaylistId = () =>
    playerStore.selectedPlaylistId() || playlist()?.id || "";

  const isSaved = () => {
    const id = currentPlaylistId();
    return id ? playerStore.isPlaylistSaved(id) : false;
  };

  const handleToggleSave = () => {
    const id = currentPlaylistId();
    if (!id) return;
    if (isSaved()) {
      playerStore.removeSavedPlaylist(id);
    } else {
      playerStore.savePlaylist({
        id,
        title: displayTitle(),
        trackCount: playlist()?.tracks?.length || playlist()?.track_count || 0,
        thumbnailUrl: displayThumb(),
      });
    }
  };

  const handlePlayAll = (shuffle: boolean = false) => {
    const pl = playlist();
    if (pl && pl.tracks.length > 0) {
      const list = shuffle ? [...pl.tracks].sort(() => Math.random() - 0.5) : pl.tracks;
      playerStore.setPlaybackContext(list, displayTitle());
      playerStore.playTrack(list[0]);
    }
  };

  const handlePlaySong = (track: Track, _index?: number) => {
    const pl = playlist();
    if (pl && pl.tracks.length > 0) {
      playerStore.setPlaybackContext(pl.tracks, displayTitle());
    }
    playerStore.playTrack(track);
  };

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      class="h-full overflow-y-auto bg-[#000000] select-none text-xs font-mono"
    >
      {/* Top Navigation Bar */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        class="sticky top-0 z-30 bg-[#000000] px-5 py-2.5 border-b border-[#181818] flex items-center justify-between"
      >
        <div data-tauri-drag-region class="flex items-center gap-3">
          <button
            onClick={() => playerStore.closePlaylist()}
            class="px-2 py-0.5 rounded bg-[#111111] hover:bg-[#1a1a1a] text-[#cccccc] hover:text-white border border-[#222222] flex items-center gap-1.5 transition-colors text-xs cursor-pointer font-mono"
          >
            <ArrowLeft class="w-3 h-3" />
            <span>Back</span>
          </button>
          <span data-tauri-drag-region class="text-[#444444]">&bull;</span>
          <span data-tauri-drag-region class="text-white font-bold truncate text-xs">{displayTitle()}</span>
        </div>
      </div>

      {/* Loading state */}
      <Show when={playerStore.isPlaylistLoading()}>
        <div class="py-32 flex flex-col items-center justify-center text-[#777777] gap-3">
          <Loader2 class="w-6 h-6 animate-spin text-[#ff2222]" />
          <span class="text-xs">Loading tracks from YouTube Music...</span>
        </div>
      </Show>

      {/* Playlist / Album Content */}
      <Show when={!playerStore.isPlaylistLoading() && playlist()}>
        <div class="p-6 space-y-5 w-full max-w-full">
          {/* 1. Header Banner (Clean retro styling matching YT Music) */}
          <div class="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-5 border-b border-[#181818] pb-5">
            <div class="flex items-start sm:items-center gap-4">
              <div class="w-24 h-24 rounded bg-[#111111] overflow-hidden border border-[#222222] shrink-0">
                <Show
                  when={displayThumb()}
                  fallback={
                    <div class="w-full h-full flex items-center justify-center text-[#444444]">
                      <Disc3 class="w-8 h-8" />
                    </div>
                  }
                >
                  <img
                    src={getHighResThumbnail(displayThumb(), 400)}
                    alt={displayTitle()}
                    loading="lazy"
                    decoding="async"
                    class="w-full h-full object-cover"
                  />
                </Show>
              </div>

              <div class="space-y-1">
                <span class="text-[10px] uppercase font-bold text-[#ff2222] tracking-wider">
                  {isAlbum() ? "Album" : "Playlist"}
                </span>
                <h1 class="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {displayTitle()}
                </h1>
                <p class="text-xs text-[#888888]">
                  {playlist()!.tracks.length} tracks
                  <Show when={meta()?.subtitle}>
                    <span> &bull; {meta()!.subtitle}</span>
                  </Show>
                </p>

                {/* Actions */}
                <div class="flex items-center gap-2 pt-1.5 flex-wrap">
                  <Show
                    when={isSaved()}
                    fallback={
                      <button
                        onClick={handleToggleSave}
                        class="px-3 py-1 rounded bg-[#111111] hover:bg-[#1a1a1a] text-[#facc15] hover:text-white border border-[#2a2a2a] hover:border-[#facc15]/50 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Save to library"
                      >
                        <span>⭐</span>
                        <span>Add to Library</span>
                      </button>
                    }
                  >
                    <div class="flex items-center gap-1">
                      <button
                        onClick={handleToggleSave}
                        class="px-3 py-1 rounded bg-[#0d2310] hover:bg-[#143018] text-[#4ade80] border border-[#1b4324] text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Click to remove from library"
                      >
                        <Check class="w-3.5 h-3.5 text-[#4ade80]" />
                        <span>✓ Saved in Library</span>
                      </button>
                      <button
                        onClick={handleToggleSave}
                        class="p-1 rounded bg-[#111111] hover:bg-[#220a0a] text-[#888888] hover:text-[#ff2222] border border-[#222222] text-xs transition-colors cursor-pointer"
                        title="Remove from library"
                      >
                        <X class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Show>

                  <button
                    onClick={() => handlePlayAll(false)}
                    class="px-3.5 py-1 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <Play class="w-3 h-3 fill-white" />
                    <span>Play All</span>
                  </button>

                  <button
                    onClick={() => handlePlayAll(true)}
                    class="px-3 py-1 rounded bg-[#111111] hover:bg-[#1a1a1a] text-[#cccccc] border border-[#222222] text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Shuffle class="w-3 h-3 text-[#ff2222]" />
                    <span>Shuffle</span>
                  </button>

                  <button
                    onClick={() => {
                      const first = playlist()?.tracks?.[0];
                      if (first) playerStore.startSongRadio(first);
                    }}
                    class="px-2.5 py-1 text-xs text-[#ff2222] hover:underline cursor-pointer font-bold"
                  >
                    [▶ Start Radio]
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Tracks Table */}
          <Show
            when={playlist()!.tracks.length > 0}
            fallback={
              <div class="py-16 text-center text-[#666666]">
                <Music2 class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#444444]" />
                <p class="text-xs">No tracks found in this playlist or album.</p>
              </div>
            }
          >
            <div class="w-full">
              {/* Table Column Headers (Sticky below top navigation) */}
              <div class="sticky top-[41px] z-20 bg-[#0a0a0a] grid grid-cols-12 gap-2 px-3 py-2 border-b border-[#181818] text-[10px] font-bold uppercase tracking-wider text-[#555555]">
                <span class="col-span-1 text-center">#</span>
                <span class="col-span-5">Title</span>
                <span class="col-span-2">Artist</span>
                <span class="col-span-2 text-right hidden sm:block">Views</span>
                <span class="col-span-2 text-right">Duration</span>
              </div>

              <div ref={tableRef} class="divide-y divide-[#141414]">
                <Show when={isVirtual() && startIndex() > 0}>
                  <div style={{ height: `${startIndex() * rowHeight}px` }} />
                </Show>
                <For each={visibleSlice()}>
                  {(track, index) => {
                    const actualIndex = () => (isVirtual() ? startIndex() + index() : index());
                    const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                    const isLiked = () => playerStore.likedTrackIds().has(track.id);

                    return (
                      <div
                        onClick={() => {
                          if (isCurrent()) {
                            playerStore.togglePlay();
                          } else {
                            handlePlaySong(track, actualIndex());
                          }
                        }}
                        style={{ height: "44px", "content-visibility": "auto", contain: "strict" }}
                        class={`grid grid-cols-12 gap-2 items-center px-3 py-1.5 group text-xs hover:bg-[#0c0c0c] cursor-pointer ${
                          isCurrent() ? "bg-[#140505] text-[#ff2222] font-bold" : "text-[#dddddd]"
                        }`}
                      >
                        {/* Index / Play-Pause */}
                        <div class="col-span-1 text-center font-mono text-[11px] text-[#555555] flex items-center justify-center">
                          <TrackRowPlayCell trackId={track.id} index={actualIndex() + 1} accentColor="red" />
                        </div>

                        {/* Title */}
                        <div class="col-span-5 flex items-center gap-2 min-w-0">
                          <span
                            class={`truncate ${
                              isCurrent() ? "text-[#ff2222] font-bold" : "text-[#e5e5e5]"
                            }`}
                          >
                            {track.title}
                          </span>
                        </div>

                        {/* Artist */}
                        <div class="col-span-2 truncate text-[#888888] text-[11px]">
                          <span
                            class={
                              track.artist_id
                                ? "hover:text-[#ff2222] hover:underline cursor-pointer"
                                : ""
                            }
                            onClick={(e) => {
                              if (track.artist_id) {
                                e.stopPropagation();
                                playerStore.openArtist(track.artist_id);
                              }
                            }}
                          >
                            {track.artist}
                          </span>
                        </div>

                        {/* Views */}
                        <div class="col-span-2 hidden sm:block text-right font-mono text-[11px] text-[#777777] truncate">
                          {track.views || "-"}
                        </div>

                        {/* Duration & Actions */}
                        <div
                          class="col-span-2 flex items-center justify-end gap-2 text-right font-mono text-[11px] text-[#777777]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playerStore.toggleLike(track);
                            }}
                            title="Like track"
                            class={`p-1 cursor-pointer ${
                              isLiked() ? "text-[#ff2222] fill-[#ff2222]" : "text-[#444444] hover:text-[#cccccc]"
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
                            class="p-1 text-[#444444] hover:text-[#cccccc] cursor-pointer"
                          >
                            <Plus class="w-3.5 h-3.5" />
                          </button>
                          <span class="w-10">
                            {formatDuration(track.duration_seconds)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                </For>
                <Show when={isVirtual() && total() > endIndex()}>
                  <div style={{ height: `${(total() - endIndex()) * rowHeight}px` }} />
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
