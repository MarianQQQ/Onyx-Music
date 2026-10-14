import { Component, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { formatDuration, getCleanArtist, cleanTrack, getHighResThumbnail } from "../../models/track";
import {
  ChevronDown,
  Heart,
  Radio,
  Shuffle,
  Trash2,
  Music2,
  X,
  Plus,
  Play,
  Loader2,
  Sparkles,
  Mic2,
} from "lucide-solid";
import { TrackRowPlayCell } from "./PlayingIndicator";

export interface NowPlayingViewProps {
  initialRightTab?: "upnext" | "lyrics" | "similar";
  onClose?: () => void;
}

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 44;
const BUFFER_ITEMS = 6;

export const NowPlayingView: Component<NowPlayingViewProps> = (props) => {
  const current = () => playerStore.currentTrack();
  const subTab = () => playerStore.nowPlayingSubTab();
  const setSubTab = (tab: "upnext" | "lyrics" | "similar") => playerStore.setNowPlayingSubTab(tab);
  const isLiked = () => (current() ? playerStore.likedTrackIds().has(current()!.id) : false);
  const recommendations = () => playerStore.songRecommendations();
  const isRecsLoading = () => playerStore.isRecommendationsLoading();

  const upcomingContextTracks = createMemo(() => {
    const ctx = playerStore.contextTracks();
    if (ctx.length === 0) return [];
    if (playerStore.isShuffled()) {
      const sIndices = playerStore.shuffledContextIndices();
      if (sIndices.length > 0) {
        return sIndices.map((i) => ctx[i]).filter(Boolean);
      }
    }
    const cur = current();
    const idx = cur ? ctx.findIndex((t) => t.id === cur.id) : -1;
    if (idx !== -1) {
      return ctx.slice(idx + 1);
    }
    const lastIdx = playerStore.lastContextIndex();
    if (lastIdx !== -1 && lastIdx < ctx.length - 1) {
      return ctx.slice(lastIdx + 1);
    }
    return ctx;
  });

  const queueLength = () => playerStore.queue().length;
  const contextLength = () => upcomingContextTracks().length;

  const totalUpNextCount = () => {
    return queueLength() + contextLength();
  };

  let upNextContainerRef: HTMLDivElement | undefined;
  const [upNextScrollTop, setUpNextScrollTop] = createSignal(0);
  const [upNextContainerHeight, setUpNextContainerHeight] = createSignal(600);
  let upNextScrollRaf: number | null = null;

  const handleUpNextScroll = (e: Event) => {
    if (upNextScrollRaf !== null) return;
    const target = e.currentTarget as HTMLElement;
    upNextScrollRaf = requestAnimationFrame(() => {
      upNextScrollRaf = null;
      if (target) {
        setUpNextScrollTop(target.scrollTop);
      }
    });
  };

  createEffect(() => {
    if (subTab() === "upnext" && upNextContainerRef) {
      setUpNextContainerHeight(upNextContainerRef.clientHeight || 600);
      setUpNextScrollTop(upNextContainerRef.scrollTop);
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.height > 0) {
            setUpNextContainerHeight(entry.contentRect.height);
          }
        }
      });
      ro.observe(upNextContainerRef);
      onCleanup(() => ro.disconnect());
    }
  });

  const queueRange = createMemo(() => {
    const qLen = queueLength();
    if (qLen === 0) return { start: 0, end: 0 };

    const top = upNextScrollTop();
    const height = upNextContainerHeight();

    const listStart = HEADER_HEIGHT;
    const listEnd = listStart + qLen * ROW_HEIGHT;

    const viewStart = Math.max(0, top - BUFFER_ITEMS * ROW_HEIGHT);
    const viewEnd = top + height + BUFFER_ITEMS * ROW_HEIGHT;

    if (viewEnd <= listStart) {
      return { start: 0, end: 0 };
    }
    if (viewStart >= listEnd) {
      return { start: qLen, end: qLen };
    }

    const start = Math.max(0, Math.min(qLen, Math.floor((viewStart - listStart) / ROW_HEIGHT)));
    const end = Math.max(start, Math.min(qLen, Math.ceil((viewEnd - listStart) / ROW_HEIGHT)));
    return { start, end };
  });

  const visibleQueue = createMemo(() => {
    const { start, end } = queueRange();
    if (start >= end) return [];
    return playerStore.queue().slice(start, end);
  });

  const contextRange = createMemo(() => {
    const cLen = contextLength();
    if (cLen === 0) return { start: 0, end: 0 };

    const qLen = queueLength();
    const top = upNextScrollTop();
    const height = upNextContainerHeight();

    const qSectionHeight = qLen > 0 ? (HEADER_HEIGHT + qLen * ROW_HEIGHT) : 0;
    const listStart = qSectionHeight + HEADER_HEIGHT;
    const listEnd = listStart + cLen * ROW_HEIGHT;

    const viewStart = Math.max(0, top - BUFFER_ITEMS * ROW_HEIGHT);
    const viewEnd = top + height + BUFFER_ITEMS * ROW_HEIGHT;

    if (viewEnd <= listStart) {
      return { start: 0, end: 0 };
    }
    if (viewStart >= listEnd) {
      return { start: cLen, end: cLen };
    }

    const start = Math.max(0, Math.min(cLen, Math.floor((viewStart - listStart) / ROW_HEIGHT)));
    const end = Math.max(start, Math.min(cLen, Math.ceil((viewEnd - listStart) / ROW_HEIGHT)));
    return { start, end };
  });

  const visibleContextTracks = createMemo(() => {
    const { start, end } = contextRange();
    if (start >= end) return [];
    return upcomingContextTracks().slice(start, end);
  });

  let lyricsContainerRef: HTMLDivElement | undefined;
  let lastLyricsScrolledIdx = -1;
  let lastLyricsTrackId = "";
  let lyricsRaf: number | null = null;

  onCleanup(() => {
    if (upNextScrollRaf !== null) {
      cancelAnimationFrame(upNextScrollRaf);
      upNextScrollRaf = null;
    }
    if (lyricsRaf !== null) {
      cancelAnimationFrame(lyricsRaf);
      lyricsRaf = null;
    }
  });

  onMount(() => {
    if (props.initialRightTab) {
      setSubTab(props.initialRightTab);
    }
  });

  createEffect(() => {
    const isLyricsTab = subTab() === "lyrics";
    const curIdx = playerStore.currentLyricIndex();
    const trackId = playerStore.currentTrack()?.id || "";

    if (trackId !== lastLyricsTrackId) {
      lastLyricsTrackId = trackId;
      lastLyricsScrolledIdx = -1;
    }

    if (isLyricsTab && curIdx >= 0 && curIdx !== lastLyricsScrolledIdx && lyricsContainerRef) {
      lastLyricsScrolledIdx = curIdx;
      if (lyricsRaf !== null) {
        cancelAnimationFrame(lyricsRaf);
      }
      lyricsRaf = requestAnimationFrame(() => {
        lyricsRaf = null;
        if (!lyricsContainerRef) return;
        const activeEl = lyricsContainerRef.querySelector(`[data-line-idx="${curIdx}"]`) as HTMLElement | null;
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
  });

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  return (
    <div class="grid grid-cols-1 lg:grid-cols-12 h-full bg-[#000000] font-mono text-xs overflow-hidden select-none">
      {/* LEFT COLUMN: Cover Art & Track Details (~58% width / 7 cols) */}
      <div class="lg:col-span-7 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Static Zero-Blur Ambient Radial Glow */}
        <Show when={current()?.thumbnail_url}>
          <div
            class="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(circle at 50% 45%, rgba(255, 34, 34, 0.06), transparent 70%)",
            }}
          />
        </Show>

        {/* Top Draggable Bar + Minimize / Collapse Player Button */}
        <div
          data-tauri-drag-region
          onMouseDown={handleDragMouseDown}
          class="absolute top-0 left-0 right-0 h-12 px-5 flex items-center justify-between z-20"
        >
          <button
            onClick={() => props.onClose?.()}
            class="px-2.5 py-1 rounded bg-[#0a0a0a]/90 hover:bg-[#140505] text-[#888888] hover:text-white border border-[#222222] hover:border-[#ff2222]/50 flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
            title="Minimize Player"
          >
            <ChevronDown class="w-3.5 h-3.5 text-[#ff2222]" />
            <span>Minimize Player</span>
          </button>

          <Show when={current()}>
            <span
              data-tauri-drag-region
              class="text-[10px] uppercase tracking-widest text-[#555555] font-bold pointer-events-none"
            >
              Now Playing
            </span>
          </Show>
        </div>

        {/* Center Cover Art & Track Metadata */}
        <Show
          when={current()}
          fallback={
            <div class="relative z-10 text-center text-[#555555] py-16">
              <div class="w-48 h-48 mx-auto mb-4 rounded bg-[#0a0a0a] border border-[#181818] flex items-center justify-center">
                <Music2 class="w-12 h-12 text-[#333333]" />
              </div>
              <p class="text-sm font-bold text-[#777777]">No Track Playing</p>
              <p class="text-[11px] text-[#444444] mt-1">
                Select any song or playlist to start playback.
              </p>
            </div>
          }
        >
          <div class="relative z-10 flex flex-col items-center max-w-md w-full mt-4">
            {/* Large Centered High-Res Cover Art */}
            <div class="relative w-72 h-72 lg:w-96 lg:h-96 bg-[#0a0a0a] border border-[#222222] shadow-2xl overflow-hidden shrink-0 group">
              <Show
                when={current()?.thumbnail_url}
                fallback={
                  <div class="w-full h-full flex items-center justify-center text-[#333333]">
                    <Music2 class="w-16 h-16" />
                  </div>
                }
              >
                <img
                  src={getHighResThumbnail(current()!.thumbnail_url)}
                  alt={current()!.title}
                  loading="lazy"
                  decoding="async"
                  class="w-full h-full object-cover"
                  onError={(e) => {
                    const fallback = current()?.thumbnail_url;
                    if (fallback && e.currentTarget.src !== fallback) {
                      e.currentTarget.src = fallback;
                    }
                  }}
                />
              </Show>
            </div>

            {/* Track Title, Artist, Badge & Actions */}
            <div class="mt-5 w-full text-center flex flex-col items-center">
              <h2 class="text-base font-bold text-white tracking-tight line-clamp-2">
                {cleanTrack(current()!).title}
              </h2>

              <button
                onClick={() => {
                  const target = current()?.artist_id || getCleanArtist(current()!);
                  if (target) {
                    playerStore.openArtist(target);
                  }
                }}
                class="mt-1 text-xs text-[#888888] hover:text-[#ff2222] hover:underline transition-colors cursor-pointer truncate max-w-full"
                title="Open artist profile"
              >
                {getCleanArtist(current()!)}
              </button>

              {/* Views / Duration / Album Badge */}
              <div class="mt-2 flex items-center justify-center gap-2 text-[11px] text-[#666666]">
                <Show when={current()?.album}>
                  <span class="px-1.5 py-0.5 rounded bg-[#0c0c0c] border border-[#1a1a1a] text-[#888888] truncate max-w-[180px]">
                    {current()!.album}
                  </span>
                </Show>
                <Show when={current()?.views}>
                  <span class="px-1.5 py-0.5 rounded bg-[#0c0c0c] border border-[#1a1a1a] text-[#888888]">
                    {current()!.views}
                  </span>
                </Show>
                <span class="px-1.5 py-0.5 rounded bg-[#0c0c0c] border border-[#1a1a1a] text-[#888888]">
                  {formatDuration(playerStore.duration() || current()!.duration_seconds)}
                </span>
              </div>

              {/* Action Buttons: Like & Start Radio */}
              <div class="mt-4 flex items-center justify-center gap-2.5">
                <button
                  onClick={() => playerStore.toggleLike(current()!)}
                  class={`px-3 py-1.5 rounded border text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isLiked()
                      ? "bg-[#140505] text-[#ff2222] border-[#ff2222]/60 font-bold"
                      : "bg-[#0a0a0a] text-[#888888] border-[#222222] hover:text-white hover:border-[#444444]"
                  }`}
                  title={isLiked() ? "Unlike track" : "Like track"}
                >
                  <Heart class={`w-3.5 h-3.5 ${isLiked() ? "fill-[#ff2222] text-[#ff2222]" : ""}`} />
                  <span>{isLiked() ? "Liked" : "Like"}</span>
                </button>

                <button
                  onClick={() => {
                    playerStore.startSongRadio(current()!);
                    setSubTab("similar");
                  }}
                  class="px-3 py-1.5 rounded bg-[#0a0a0a] hover:bg-[#140505] text-[#cccccc] hover:text-[#ff2222] border border-[#222222] hover:border-[#ff2222]/50 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Start Radio mix from this track"
                >
                  <Radio class="w-3.5 h-3.5 text-[#ff2222]" />
                  <span>Start Radio</span>
                </button>
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* RIGHT COLUMN: Tabbed Panel (UP NEXT | LYRICS | SIMILAR) (~42% width / 5 cols) */}
      <div class="lg:col-span-5 flex flex-col h-full min-h-0 border-l border-[#181818] bg-[#050505] overflow-hidden">
        {/* Top Horizontal Tab Header */}
        <div
          data-tauri-drag-region
          onMouseDown={handleDragMouseDown}
          class="grid grid-cols-3 border-b border-[#181818] bg-[#0a0a0a] shrink-0"
        >
          <button
            onClick={() => setSubTab("upnext")}
            class={`py-3 text-[11px] tracking-wider uppercase font-mono transition-colors cursor-pointer text-center ${
              subTab() === "upnext"
                ? "border-b-2 border-[#ff2222] text-white font-bold bg-[#110505]/60"
                : "text-[#777777] hover:text-white"
            }`}
          >
            UP NEXT ({totalUpNextCount()})
          </button>

          <button
            onClick={() => setSubTab("lyrics")}
            class={`py-3 text-[11px] tracking-wider uppercase font-mono transition-colors cursor-pointer text-center ${
              subTab() === "lyrics"
                ? "border-b-2 border-[#ff2222] text-white font-bold bg-[#110505]/60"
                : "text-[#777777] hover:text-white"
            }`}
          >
            LYRICS
          </button>

          <button
            onClick={() => setSubTab("similar")}
            class={`py-3 text-[11px] tracking-wider uppercase font-mono transition-colors cursor-pointer text-center ${
              subTab() === "similar"
                ? "border-b-2 border-[#ff2222] text-white font-bold bg-[#110505]/60"
                : "text-[#777777] hover:text-white"
            }`}
          >
            SIMILAR ({recommendations().length})
          </button>
        </div>

        {/* TAB 1: UP NEXT (Queue & Contextual Tracks) */}
        <Show when={subTab() === "upnext"}>
          <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <Show
              when={playerStore.queue().length > 0 || upcomingContextTracks().length > 0}
              fallback={
                <div class="py-20 text-center text-[#555555] px-4">
                  <Music2 class="w-7 h-7 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                  <p class="text-xs font-mono">Queue is empty.</p>
                  <p class="text-[11px] text-[#444444] mt-0.5">
                    Play any track or playlist to populate Up Next.
                  </p>
                </div>
              }
            >
              <div
                ref={upNextContainerRef}
                onScroll={handleUpNextScroll}
                class="flex-1 min-h-0 overflow-y-auto"
              >
                {/* Manual Queue Section (if manual queue has tracks) */}
                <Show when={playerStore.queue().length > 0}>
                  <div class="px-3.5 py-2.5 border-b border-[#141414] bg-[#080808] flex items-center justify-between gap-2 sticky top-0 z-10">
                    <div class="min-w-0">
                      <div class="text-[11px] font-bold text-white truncate">Playing from Queue</div>
                      <div class="text-[10px] text-[#666666]">
                        {playerStore.queue().length} tracks in manual queue
                      </div>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => playerStore.toggleShuffle()}
                        class={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition-colors border cursor-pointer ${
                          playerStore.isShuffled()
                            ? "bg-[#140505] text-[#ff2222] border-[#ff2222]"
                            : "bg-[#0c0c0c] text-[#888888] border-[#222222] hover:text-white"
                        }`}
                        title="Shuffle queue"
                      >
                        <Shuffle class="w-3 h-3 text-[#ff2222]" />
                        <span>Shuffle</span>
                      </button>

                      <button
                        onClick={() => playerStore.setFullQueue([])}
                        class="px-2 py-1 rounded bg-[#0c0c0c] hover:bg-[#140505] text-[11px] font-mono text-[#888888] hover:text-[#ff2222] border border-[#222222] hover:border-[#ff2222]/40 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Clear queue"
                      >
                        <Trash2 class="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    </div>
                  </div>

                  <div class="divide-y divide-[#111111] border-b border-[#181818]">
                    <Show when={queueRange().start > 0}>
                      <div style={{ height: `${queueRange().start * ROW_HEIGHT}px` }} />
                    </Show>
                    <For each={visibleQueue()}>
                      {(track, relIdx) => {
                        const index = () => queueRange().start + relIdx();
                        const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                        const trackLiked = () => playerStore.likedTrackIds().has(track.id);

                        return (
                          <div
                            onClick={() => {
                              if (isCurrent()) {
                                playerStore.togglePlay();
                              } else {
                                playerStore.playTrackAt(index());
                              }
                            }}
                            onMouseEnter={() => playerStore.preloadTrack(track.id)}
                            style={{ height: "44px", "content-visibility": "auto", contain: "strict" }}
                            class={`flex items-center gap-2.5 px-3 h-[44px] group hover:bg-[#0d0d0d] cursor-pointer ${
                              isCurrent()
                                ? "bg-[#140505] text-[#ff2222] font-bold border-l-2 border-l-[#ff2222]"
                                : "text-[#cccccc]"
                            }`}
                          >
                            <div class="w-5 flex items-center justify-center font-mono text-[11px] text-[#555555] shrink-0">
                              <TrackRowPlayCell trackId={track.id} index={index() + 1} accentColor="red" />
                            </div>

                            <div class="w-8 h-8 rounded bg-[#111111] overflow-hidden shrink-0 border border-[#1e1e1e]">
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

                            <div class="min-w-0 flex-1">
                              <h4
                                class={`truncate text-xs ${
                                  isCurrent() ? "text-[#ff2222] font-bold" : "text-white"
                                }`}
                              >
                                {cleanTrack(track).title}
                              </h4>
                              <p
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const target = track.artist_id || getCleanArtist(track);
                                  if (target) {
                                    playerStore.openArtist(target);
                                  }
                                }}
                                class="text-[11px] text-[#777777] hover:text-[#ff2222] hover:underline truncate cursor-pointer"
                                title="Open artist profile"
                              >
                                {getCleanArtist(track)}
                              </p>
                            </div>

                            <div
                              class="flex items-center gap-1 shrink-0 font-mono text-[11px] text-[#777777]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playerStore.toggleLike(track);
                                }}
                                title="Like track"
                                class={`p-1 rounded transition-colors cursor-pointer ${
                                  trackLiked()
                                    ? "text-[#ff2222]"
                                    : "text-[#555555] opacity-0 group-hover:opacity-100 hover:text-white"
                                }`}
                              >
                                <Heart class={`w-3.5 h-3.5 ${trackLiked() ? "fill-[#ff2222]" : ""}`} />
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playerStore.removeFromQueue(index());
                                }}
                                title="Remove from queue"
                                class="p-1 rounded text-[#555555] opacity-0 group-hover:opacity-100 hover:text-[#ff2222] hover:bg-[#140505] transition-all cursor-pointer"
                              >
                                <X class="w-3.5 h-3.5" />
                              </button>

                              <span class="w-9 text-right text-[10px]">
                                {formatDuration(track.duration_seconds)}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                    <Show when={queueLength() > queueRange().end}>
                      <div style={{ height: `${(queueLength() - queueRange().end) * ROW_HEIGHT}px` }} />
                    </Show>
                  </div>
                </Show>

                {/* Upcoming tracks from context (Liked Songs, Playlist, Album) */}
                <Show when={upcomingContextTracks().length > 0}>
                  <div class="px-3.5 py-2 border-b border-[#141414] bg-[#080808] flex items-center justify-between gap-2 sticky top-0 z-10">
                    <div class="min-w-0">
                      <div class="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                        <span class="text-[#ff2222] font-mono">&gt;</span>
                        <span>Next from: {playerStore.contextName() || "Playlist"}</span>
                      </div>
                      <div class="text-[10px] text-[#666666]">
                        {upcomingContextTracks().length} upcoming tracks
                      </div>
                    </div>
                  </div>

                  <div class="divide-y divide-[#111111]">
                    <Show when={contextRange().start > 0}>
                      <div style={{ height: `${contextRange().start * ROW_HEIGHT}px` }} />
                    </Show>
                    <For each={visibleContextTracks()}>
                      {(track, relIdx) => {
                        const idx = () => contextRange().start + relIdx();
                        const trackLiked = () => playerStore.likedTrackIds().has(track.id);

                        return (
                          <div
                            onClick={() => playerStore.playTrack(track)}
                            style={{ height: "44px", "content-visibility": "auto", contain: "strict" }}
                            class="flex items-center gap-2.5 px-3 h-[44px] group hover:bg-[#0d0d0d] cursor-pointer text-[#cccccc]"
                          >
                            <div class="w-5 flex items-center justify-center font-mono text-[11px] text-[#555555] shrink-0">
                              {idx() + 1}
                            </div>

                            <div class="w-8 h-8 rounded bg-[#111111] overflow-hidden shrink-0 border border-[#1e1e1e]">
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

                            <div class="min-w-0 flex-1">
                              <h4 class="truncate text-xs text-white group-hover:text-[#ff2222] transition-colors">
                                {cleanTrack(track).title}
                              </h4>
                              <p
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const target = track.artist_id || getCleanArtist(track);
                                  if (target) {
                                    playerStore.openArtist(target);
                                  }
                                }}
                                class="text-[11px] text-[#777777] hover:text-[#ff2222] hover:underline truncate cursor-pointer"
                                title="Open artist profile"
                              >
                                {getCleanArtist(track)}
                              </p>
                            </div>

                            <div
                              class="flex items-center gap-1 shrink-0 font-mono text-[11px] text-[#777777]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playerStore.toggleLike(track);
                                }}
                                title="Like track"
                                class={`p-1 rounded transition-colors cursor-pointer ${
                                  trackLiked()
                                    ? "text-[#ff2222]"
                                    : "text-[#555555] opacity-0 group-hover:opacity-100 hover:text-white"
                                }`}
                              >
                                <Heart class={`w-3.5 h-3.5 ${trackLiked() ? "fill-[#ff2222]" : ""}`} />
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playerStore.addToQueue(track);
                                }}
                                title="Add to queue"
                                class="p-1 rounded text-[#555555] opacity-0 group-hover:opacity-100 hover:text-[#ff2222] hover:bg-[#140505] transition-all cursor-pointer"
                              >
                                <Plus class="w-3.5 h-3.5" />
                              </button>

                              <span class="w-9 text-right text-[10px]">
                                {formatDuration(track.duration_seconds)}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                    <Show when={contextLength() > contextRange().end}>
                      <div style={{ height: `${(contextLength() - contextRange().end) * ROW_HEIGHT}px` }} />
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        {/* TAB 2: LYRICS (Synced Lyrics) */}
        <Show when={subTab() === "lyrics"}>
          <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="px-3.5 py-2.5 border-b border-[#141414] bg-[#080808] flex items-center justify-between gap-2 shrink-0">
              <div class="flex items-center gap-1.5 min-w-0">
                <Mic2 class="w-3.5 h-3.5 text-[#ff2222] shrink-0" />
                <span class="text-[11px] font-bold text-white truncate">
                  {current() ? cleanTrack(current()!).title : "Synced Lyrics"}
                </span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <Show when={playerStore.lyrics()?.lines && playerStore.lyrics()!.lines.length > 0}>
                  <div class="flex items-center gap-1 text-[10px] font-mono">
                    <span
                      class="px-1.5 py-0.5 rounded bg-[#111111] border border-[#222222] text-[#aaaaaa]"
                      title="Current lyric offset (audio - lyrics)"
                    >
                      Offset: {playerStore.lyricOffset() > 0 ? "+" : ""}{playerStore.lyricOffset().toFixed(1)}s
                    </span>
                    <button
                      onClick={() => playerStore.adjustLyricOffset(-0.5)}
                      class="px-1.5 py-0.5 rounded bg-[#141414] hover:bg-[#222222] border border-[#282828] text-[#888888] hover:text-white transition-colors cursor-pointer"
                      title="Adjust offset -0.5s"
                    >
                      -0.5s
                    </button>
                    <button
                      onClick={() => playerStore.adjustLyricOffset(0.5)}
                      class="px-1.5 py-0.5 rounded bg-[#141414] hover:bg-[#222222] border border-[#282828] text-[#888888] hover:text-white transition-colors cursor-pointer"
                      title="Adjust offset +0.5s"
                    >
                      +0.5s
                    </button>
                    <Show when={playerStore.lyricOffset() !== 0}>
                      <button
                        onClick={() => playerStore.resetLyricOffset()}
                        class="px-1.5 py-0.5 rounded bg-[#140505] hover:bg-[#200808] border border-[#ff2222]/40 text-[#ff4444] hover:text-[#ff2222] transition-colors cursor-pointer"
                        title="Reset offset to 0"
                      >
                        Reset
                      </button>
                    </Show>
                  </div>
                </Show>
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#111111] border border-[#222222] text-[#777777]">
                  LRCLIB
                </span>
              </div>
            </div>

            <div
              ref={lyricsContainerRef}
              class="flex-1 min-h-0 overflow-y-auto px-4 py-6 select-none"
            >
              <Show
                when={playerStore.lyrics()?.lines && playerStore.lyrics()!.lines.length > 0}
                fallback={
                  <Show
                    when={playerStore.lyrics()?.plain_lyrics}
                    fallback={
                      <div class="py-20 text-center text-[#555555]">
                        <Music2 class="w-7 h-7 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                        <p class="text-xs font-mono">No lyrics found for this song.</p>
                        <p class="text-[11px] text-[#444444] mt-0.5">
                          Synced lyrics stream automatically during playback.
                        </p>
                      </div>
                    }
                  >
                    <div class="whitespace-pre-line text-[#cccccc] text-xs leading-relaxed text-center font-mono">
                      {playerStore.lyrics()!.plain_lyrics}
                    </div>
                  </Show>
                }
              >
                <div class="space-y-3">
                  <For each={playerStore.lyrics()!.lines}>
                    {(line, idx) => {
                      const isActive = () => playerStore.currentLyricIndex() === idx();
                      const isPassed = () => playerStore.currentLyricIndex() > idx();

                      return (
                        <div
                          data-line-idx={idx()}
                          onClick={(e) => {
                            if (e.altKey) {
                              e.preventDefault();
                              playerStore.syncLyricsToLine(line.time_ms);
                            } else {
                              playerStore.seek(Math.max(0, line.time_ms / 1000 + playerStore.lyricOffset()));
                            }
                          }}
                          title="Click to seek • Alt+Click or click Sync to align lyrics"
                          class="group relative flex items-center justify-center py-1.5 px-3 rounded hover:bg-[#0c0c0c]/80 transition-colors cursor-pointer"
                        >
                          <p
                            class={`transition-colors duration-150 text-center select-none font-mono leading-relaxed ${
                              isActive()
                                ? "text-[#ff2222] text-sm md:text-base font-bold"
                                : isPassed()
                                ? "text-[#444444] group-hover:text-[#777777] text-xs"
                                : "text-[#888888] group-hover:text-white text-xs"
                            }`}
                          >
                            {line.text || "♪"}
                          </p>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playerStore.syncLyricsToLine(line.time_ms);
                            }}
                            class="opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161616] hover:bg-[#ff2222] hover:text-white text-[#888888] border border-[#2a2a2a] hover:border-[#ff2222] cursor-pointer"
                            title="Sync song to this line"
                          >
                            Sync
                          </button>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        {/* TAB 3: SIMILAR / RELATED TRACKS */}
        <Show when={subTab() === "similar"}>
          <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Sub-header with Play All & + Add All */}
            <div class="px-3.5 py-2.5 border-b border-[#141414] bg-[#080808] flex items-center justify-between gap-2 shrink-0">
              <div class="min-w-0">
                <div class="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                  <span>Related / Similar Tracks</span>
                  <Show when={isRecsLoading()}>
                    <Loader2 class="w-3 h-3 animate-spin text-[#ff2222]" />
                  </Show>
                </div>
                <div class="text-[10px] text-[#666666] truncate">
                  {current()
                    ? `Based on "${cleanTrack(current()!).title}"`
                    : "Play a song to load recommendations"}
                </div>
              </div>

              <Show when={recommendations().length > 0}>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => playerStore.setFullQueue(recommendations(), 0, false)}
                    class="px-2 py-1 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white text-[11px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Play all similar tracks"
                  >
                    <Play class="w-3 h-3 fill-white" />
                    <span>Play All</span>
                  </button>

                  <button
                    onClick={() => playerStore.addRecommendationsToQueue()}
                    class="px-2 py-1 rounded bg-[#0c0c0c] hover:bg-[#140505] text-[#cccccc] hover:text-white border border-[#222222] hover:border-[#ff2222]/40 text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
                    title="Add all similar tracks to queue"
                  >
                    <Plus class="w-3 h-3 text-[#ff2222]" />
                    <span>Add All</span>
                  </button>
                </div>
              </Show>
            </div>

            {/* Scrollable Similar Tracks List */}
            <div class="flex-1 min-h-0 overflow-y-auto divide-y divide-[#111111]">
              <Show
                when={recommendations().length > 0}
                fallback={
                  <div class="py-20 text-center text-[#555555] px-4">
                    <Show
                      when={isRecsLoading()}
                      fallback={
                        <>
                          <Sparkles class="w-7 h-7 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                          <p class="text-xs font-mono">
                            {current()
                              ? "No similar tracks loaded yet."
                              : "No track currently playing."}
                          </p>
                          <Show when={current()}>
                            <button
                              onClick={() => playerStore.loadSongRecommendations(current()!.id)}
                              class="mt-3 px-3 py-1.5 rounded bg-[#140505] hover:bg-[#200808] text-[#ff2222] border border-[#ff2222]/40 text-xs font-mono cursor-pointer transition-colors"
                            >
                              Load Similar Tracks
                            </button>
                          </Show>
                        </>
                      }
                    >
                      <Loader2 class="w-6 h-6 animate-spin text-[#ff2222] mx-auto mb-2" />
                      <p class="text-xs font-mono text-[#888888]">
                        Fetching similar songs from YouTube Music...
                      </p>
                    </Show>
                  </div>
                }
              >
                <For each={recommendations()}>
                  {(track, index) => {
                    const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                    const trackLiked = () => playerStore.likedTrackIds().has(track.id);

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
                        class={`flex items-center gap-2.5 px-3 py-2 group hover:bg-[#0d0d0d] cursor-pointer transition-colors ${
                          isCurrent()
                            ? "bg-[#140505] text-white border-l-2 border-l-[#ff2222]"
                            : "text-[#cccccc]"
                        }`}
                      >
                        <div class="w-5 flex items-center justify-center font-mono text-[11px] text-[#555555] shrink-0">
                          <TrackRowPlayCell trackId={track.id} index={index() + 1} accentColor="red" />
                        </div>

                        <div class="w-8 h-8 rounded bg-[#111111] overflow-hidden shrink-0 border border-[#1e1e1e]">
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

                        <div class="min-w-0 flex-1">
                          <h4
                            class={`truncate text-xs ${
                              isCurrent() ? "text-[#ff2222] font-bold" : "text-white"
                            }`}
                          >
                            {cleanTrack(track).title}
                          </h4>
                          <p
                            onClick={(e) => {
                              e.stopPropagation();
                              const target = track.artist_id || getCleanArtist(track);
                              if (target) {
                                playerStore.openArtist(target);
                              }
                            }}
                            class="text-[11px] text-[#777777] hover:text-[#ff2222] hover:underline truncate cursor-pointer"
                            title="Open artist profile"
                          >
                            {getCleanArtist(track)}
                          </p>
                        </div>

                        <div
                          class="flex items-center gap-1 shrink-0 font-mono text-[11px] text-[#777777]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playerStore.toggleLike(track);
                            }}
                            title="Like track"
                            class={`p-1 rounded transition-colors cursor-pointer ${
                              trackLiked()
                                ? "text-[#ff2222]"
                                : "text-[#555555] opacity-0 group-hover:opacity-100 hover:text-white"
                            }`}
                          >
                            <Heart class={`w-3.5 h-3.5 ${trackLiked() ? "fill-[#ff2222]" : ""}`} />
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

                          <span class="w-9 text-right text-[10px]">
                            {formatDuration(track.duration_seconds)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
