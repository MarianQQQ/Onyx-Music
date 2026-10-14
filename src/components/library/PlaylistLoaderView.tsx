import { Component, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { formatDuration } from "../../models/track";
import { Library, Link2, Loader2, Sparkles, Play, Shuffle, Music2, Heart, Plus, Check, X, RotateCw } from "lucide-solid";
import { TrackRowPlayCell } from "../player/PlayingIndicator";

const rowHeight = 44;

export const PlaylistLoaderView: Component = () => {
  const [playlistInput, setPlaylistInput] = createSignal("");
  let containerRef: HTMLDivElement | undefined;
  let tableRef: HTMLDivElement | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(600);
  const [tableOffsetTop, setTableOffsetTop] = createSignal(80);
  let scrollRaf: number | null = null;

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
    const pl = playerStore.loadedPlaylist();
    if (pl && (pl.id === "LM" || pl.title?.toLowerCase().includes("liked"))) {
      playerStore.closeLoadedPlaylist();
    }
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
    const pl = playerStore.loadedPlaylist();
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

  const total = () => playerStore.loadedPlaylist()?.tracks.length || 0;
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
    const tracks = playerStore.loadedPlaylist()?.tracks;
    if (!tracks) return [];
    if (!isVirtual()) return tracks;
    return tracks.slice(startIndex(), endIndex());
  });

  const samplePlaylists = [
    {
      title: "Today's Hot Hits",
      id: "PLDIoUOhQQPlXr63I_vwF9GD8sAKh77dWU",
      desc: "Top trending pop & global charts",
    },
    {
      title: "Pop Music Hits",
      id: "PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
      desc: "100+ timeless pop & dance hits",
    },
    {
      title: "Global Top 100 Songs",
      id: "PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i",
      desc: "Official YouTube Music Global Top 100",
    },
  ];

  const handleLoad = (e?: Event) => {
    e?.preventDefault();
    const val = playlistInput().trim();
    if (val) {
      playerStore.loadPlaylistUrl(val, undefined, false);
    }
  };

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  const isLoadedSaved = () => {
    const pl = playerStore.loadedPlaylist();
    return pl ? playerStore.isPlaylistSaved(pl.id) : false;
  };

  const handleToggleSaveLoaded = () => {
    const pl = playerStore.loadedPlaylist();
    if (!pl) return;
    if (isLoadedSaved()) {
      playerStore.removeSavedPlaylist(pl.id);
    } else {
      playerStore.savePlaylist({
        id: pl.id,
        title: pl.title || "YouTube Music Playlist",
        trackCount: pl.tracks.length,
        thumbnailUrl: pl.tracks[0]?.thumbnail_url,
      });
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      class="h-full overflow-y-auto p-5 space-y-6 bg-[#000000] text-xs font-mono select-none"
    >
      {/* Centered Loading State */}
      <Show when={playerStore.isLoading()}>
        <div class="py-32 flex flex-col items-center justify-center text-[#777777] gap-3">
          <Loader2 class="w-6 h-6 animate-spin text-[#ff2222]" />
          <span class="text-xs">Loading playlist details from YouTube Music...</span>
        </div>
      </Show>

      {/* Input Form & Presets: ONLY shown when NOT loading and NO playlist is currently loaded */}
      <Show when={!playerStore.isLoading() && !playerStore.loadedPlaylist()}>
        <div class="w-full">
          <div data-tauri-drag-region onMouseDown={handleDragMouseDown}>
            <h2 data-tauri-drag-region class="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Library class="w-4 h-4 text-[#ff2222] pointer-events-none" />
              <span data-tauri-drag-region>Full Playlist &amp; Album Loader</span>
            </h2>
            <p data-tauri-drag-region class="text-[11px] text-[#888888] mb-3">
              Loads the complete playlist or album so you can browse tracks, play individual songs, or Play All / Shuffle.
            </p>
          </div>

          {/* Input Form */}
          <form onSubmit={handleLoad} class="flex items-center gap-2">
            <div class="relative flex-1">
              <Link2 class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
              <input
                type="text"
                value={playlistInput()}
                onInput={(e) => setPlaylistInput(e.currentTarget.value)}
                placeholder="Paste YouTube or YouTube Music playlist/album link or ID..."
                class="w-full bg-[#0a0a0a] text-white pl-9 pr-3 py-2 rounded border border-[#222222] focus:outline-none focus:border-[#ff2222] text-xs font-mono transition-colors placeholder:text-[#555555]"
              />
            </div>
            <button
              type="submit"
              disabled={playerStore.isLoading()}
              class="px-3.5 py-2 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white font-mono text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
            >
              <Show
                when={playerStore.isLoading()}
                fallback={
                  <>
                    <Sparkles class="w-3.5 h-3.5" />
                    <span>Open Playlist</span>
                  </>
                }
              >
                <Loader2 class="w-3.5 h-3.5 animate-spin" />
                <span>Fetching...</span>
              </Show>
            </button>
          </form>
        </div>

        {/* Recommended Playlists */}
        <div class="w-full">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-[#555555]">
              Curated Presets
            </h3>
            <Show when={playerStore.isLoggedIn()}>
              <button
                onClick={() => playerStore.syncLibrary()}
                disabled={playerStore.isSyncing()}
                class="px-2.5 py-1 rounded bg-[#111111] hover:bg-[#1a1a1a] text-[#888888] hover:text-[#ff2222] border border-[#222222] text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Sync playlists with account"
              >
                <RotateCw class={`w-3 h-3 ${playerStore.isSyncing() ? "animate-spin text-[#ff2222]" : "text-[#ff2222]"}`} />
                <span>🔄 Sync with Account</span>
              </button>
            </Show>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <For each={samplePlaylists}>
              {(pl) => (
                <div
                  onClick={() => {
                    setPlaylistInput(pl.id);
                    playerStore.loadPlaylistUrl(pl.id, pl.title, false);
                  }}
                  class="p-2.5 rounded bg-[#0a0a0a] border border-[#181818] hover:border-[#ff2222]/40 hover:bg-[#111111] transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <h4 class="text-xs font-semibold text-white group-hover:text-[#ff2222] transition-colors">
                      {pl.title}
                    </h4>
                    <p class="text-[11px] text-[#888888] mt-0.5">{pl.desc}</p>
                  </div>
                  <button
                    type="button"
                    class="p-1.5 rounded bg-[#141414] group-hover:bg-[#ff2222] text-[#888888] group-hover:text-white transition-colors cursor-pointer"
                    title="Open Playlist"
                  >
                    <Play class="w-3 h-3 fill-current ml-0.5" />
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Loaded Playlist Tracklist */}
      <Show when={!playerStore.isLoading() && playerStore.loadedPlaylist() && playerStore.loadedPlaylist()!.tracks.length > 0}>
        <div class="space-y-2.5">
          <div class="flex items-center justify-between border-b border-[#181818] pb-2">
            <div class="flex items-center gap-3">
              <button
                onClick={() => playerStore.closePlaylist()}
                class="px-2.5 py-1 rounded bg-[#111111] hover:bg-[#1f0a0a] hover:text-[#ff2222] text-[#888888] border border-[#222222] text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5"
                title="Load another playlist"
              >
                <span>&larr;</span>
                <span>Change Playlist</span>
              </button>
              <div>
                <h3 class="text-xs font-bold text-white uppercase tracking-wider">
                  {playerStore.loadedPlaylist()!.title}
                </h3>
                <p class="text-[11px] text-[#888888]">
                  {playerStore.loadedPlaylist()!.tracks.length} tracks loaded
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Show
                when={isLoadedSaved()}
                fallback={
                  <button
                    onClick={handleToggleSaveLoaded}
                    class="px-2.5 py-1 rounded bg-[#111111] hover:bg-[#1a1a1a] text-[#facc15] hover:text-white border border-[#2a2a2a] hover:border-[#facc15]/50 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Save to library"
                  >
                    <span>⭐</span>
                    <span>Add to Library</span>
                  </button>
                }
              >
                <div class="flex items-center gap-1">
                  <button
                    onClick={handleToggleSaveLoaded}
                    class="px-2.5 py-1 rounded bg-[#0d2310] hover:bg-[#143018] text-[#4ade80] border border-[#1b4324] text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Click to remove from library"
                  >
                    <Check class="w-3.5 h-3.5 text-[#4ade80]" />
                    <span>✓ Saved in Library</span>
                  </button>
                  <button
                    onClick={handleToggleSaveLoaded}
                    class="p-1 rounded bg-[#141414] hover:bg-[#220a0a] text-[#888888] hover:text-[#ff2222] border border-[#222222] text-xs transition-colors cursor-pointer"
                    title="Remove from library"
                  >
                    <X class="w-3.5 h-3.5" />
                  </button>
                </div>
              </Show>

              <button
                onClick={() => {
                  const pl = playerStore.loadedPlaylist();
                  if (pl && pl.tracks.length > 0) {
                    playerStore.setPlaybackContext(pl.tracks, pl.title || "Playlist");
                    playerStore.playTrack(pl.tracks[0]);
                  }
                }}
                class="px-2.5 py-1 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Play class="w-3 h-3 fill-white" />
                <span>Play All</span>
              </button>
              <button
                onClick={() => {
                  const pl = playerStore.loadedPlaylist();
                  if (pl && pl.tracks.length > 0) {
                    const shuffled = [...pl.tracks].sort(() => Math.random() - 0.5);
                    playerStore.setPlaybackContext(shuffled, pl.title || "Playlist");
                    playerStore.playTrack(shuffled[0]);
                  }
                }}
                class="px-2.5 py-1 rounded bg-[#0a0a0a] hover:bg-[#140505] text-[#888888] hover:text-[#ff2222] border border-[#222222] text-xs font-mono flex items-center gap-1.5 cursor-pointer"
              >
                <Shuffle class="w-3 h-3 text-[#ff2222]" />
                <span>Shuffle</span>
              </button>
            </div>
          </div>

          <div ref={tableRef} class="border border-[#181818] rounded bg-[#050505]">
            <Show when={isVirtual() && startIndex() > 0}>
              <div style={{ height: `${startIndex() * rowHeight}px` }} />
            </Show>
            <For each={visibleSlice()}>
              {(track, idx) => {
                const actualIndex = () => (isVirtual() ? startIndex() + idx() : idx());
                const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                const isLiked = () => playerStore.likedTrackIds().has(track.id);
                return (
                  <div
                    onClick={() => {
                      if (isCurrent()) {
                        playerStore.togglePlay();
                      } else {
                        const pl = playerStore.loadedPlaylist();
                        if (pl && pl.tracks.length > 0) {
                          playerStore.setPlaybackContext(pl.tracks, pl.title || "Playlist");
                        }
                        playerStore.playTrack(track);
                      }
                    }}
                    style={{ height: "44px", "content-visibility": "auto", contain: "strict" }}
                    class={`grid grid-cols-12 gap-2 items-center px-3 py-2 border-b border-[#141414] hover:bg-[#0c0c0c] cursor-pointer text-xs ${
                      isCurrent() ? "bg-[#140505] text-[#ff2222] font-bold border-l-2 border-l-[#ff2222]" : "text-[#cccccc]"
                    }`}
                  >
                    <div class="col-span-1 text-center font-mono text-[11px] text-[#555555] flex items-center justify-center">
                      <TrackRowPlayCell trackId={track.id} index={actualIndex() + 1} accentColor="red" />
                    </div>
                    <div class="col-span-6 flex items-center gap-2.5 min-w-0">
                      <div class="w-7 h-7 rounded bg-[#111111] overflow-hidden shrink-0 border border-[#1e1e1e]">
                        <Show
                          when={track.thumbnail_url}
                          fallback={
                            <div class="w-full h-full flex items-center justify-center text-[#555555]">
                              <Music2 class="w-3 h-3" />
                            </div>
                          }
                        >
                          <img
                            src={track.thumbnail_url}
                            alt={track.title}
                            width="28"
                            height="28"
                            decoding="async"
                            class="w-full h-full object-cover"
                          />
                        </Show>
                      </div>
                      <span class={`truncate ${isCurrent() ? "text-[#ff2222] font-bold" : "text-white"}`}>{track.title}</span>
                    </div>
                    <span class="col-span-3 truncate text-[11px] text-[#888888]">
                      {track.artist}
                    </span>
                    <div
                      class="col-span-2 flex items-center justify-end gap-1.5 font-mono text-[11px] text-[#888888]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playerStore.toggleLike(track);
                        }}
                        class={`p-1 cursor-pointer transition-colors ${isLiked() ? "text-[#ff2222]" : "text-[#555555] hover:text-white"}`}
                      >
                        <Heart class={`w-3.5 h-3.5 ${isLiked() ? "fill-[#ff2222]" : ""}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playerStore.addToQueue(track);
                        }}
                        class="p-1 text-[#555555] hover:text-[#ff2222] hover:bg-[#140505] rounded cursor-pointer"
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
            <Show when={isVirtual() && total() > endIndex()}>
              <div style={{ height: `${(total() - endIndex()) * rowHeight}px` }} />
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

