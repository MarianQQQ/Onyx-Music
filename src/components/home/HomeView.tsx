import { Component, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import {
  formatDuration,
  Track,
  MoodGenreItem,
  ChartItem,
  CHART_COUNTRIES,
  getHighResThumbnail,
} from "../../models/track";
import {
  Play,
  Shuffle,
  Sparkles,
  Loader2,
  Compass,
  TrendingUp,
  Disc,
  Smile,
  Video,
  Flame,
  ArrowUpRight,
  ArrowLeft,
  Globe,
  Users,
  Heart,
  Plus,
  Music2,
  ChevronDown,
  Shield,
} from "lucide-solid";
import { TrackThumbnailOverlay, TrackRowPlayCell } from "../player/PlayingIndicator";
import { aiFilter } from "../../services/aiFilter";
import { openTrackContextMenu, TrackOptionsTrigger } from "../player/TrackContextMenu";

export const HomeView: Component = () => {
  const activeExploreFilter = () => playerStore.exploreTab();

  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = createSignal(false);
  let dropdownRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setIsCountryDropdownOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    playerStore.loadExploreFeed();
    playerStore.loadCharts();
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  const handleRefresh = () => {
    if (activeExploreFilter() === "charts") {
      playerStore.loadCharts(playerStore.selectedCountry(), true);
    } else {
      playerStore.loadExploreFeed(true);
    }
  };

  const handleFilterChange = (filter: "releases" | "charts" | "moods") => {
    playerStore.setExploreTab(filter);
    if (filter === "charts" && !playerStore.chartsData()) {
      playerStore.loadCharts();
    }
  };

  const handleCountryChange = (code: string) => {
    playerStore.loadCharts(code, true);
    setIsCountryDropdownOpen(false);
  };

  // Single track click: plays ONLY that track without adding whole lists to Play Queue
  const handlePlaySingleTrack = (track: Track) => {
    playerStore.playTrack(track);
  };

  // Explicit Play All / Shuffle button click: loads list into Playback Context
  const handlePlayAllTracks = (tracks: Track[], shuffle: boolean = false) => {
    if (tracks.length > 0) {
      const list = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
      playerStore.setPlaybackContext(list, "Explore Charts");
      playerStore.playTrack(list[0]);
    }
  };

  const handleOpenChartPlaylist = (chart: ChartItem) => {
    playerStore.openPlaylist(
      chart.id,
      chart.title,
      chart.thumbnail_url,
      chart.subtitle || "YouTube Music Chart"
    );
  };

  const handleSelectMood = (mood: MoodGenreItem) => {
    playerStore.openMoodCategory(mood);
  };

  const feed = () => playerStore.exploreFeed();
  const charts = () => playerStore.chartsData();
  const moodCat = () => playerStore.moodCategory();

  // 0% CPU AI Track Filtering for Home / Explore / Charts
  const filteredNewVideos = () => aiFilter.filterTracks(feed()?.new_videos || []);
  const filteredChartTracks = () => aiFilter.filterTracks(playerStore.activeChartTracks());
  const filteredMoodTracks = () => aiFilter.filterTracks(moodCat()?.tracks || []);

  const isLoading = () =>
    playerStore.isExploreLoading() ||
    playerStore.isHomeLoading() ||
    playerStore.isChartsLoading() ||
    playerStore.isMoodLoading();

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  return (
    <div class="h-full w-full flex flex-col overflow-hidden select-none bg-[#000000] text-[#cccccc] font-mono text-xs">
      {/* Pinned Non-Shrinkable Header & 3 Dedicated Tabs */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        class="shrink-0 px-5 pt-3 pb-3 border-b border-[#181818] bg-[#000000] z-10 space-y-3"
      >
        <div data-tauri-drag-region class="flex items-center justify-between">
          <div data-tauri-drag-region>
            <h2 data-tauri-drag-region class="text-base font-bold text-white flex items-center gap-2 tracking-tight">
              <Compass class="w-4 h-4 text-[#ff2222] shrink-0 pointer-events-none" />
              <span data-tauri-drag-region>Explore</span>
            </h2>
            <p data-tauri-drag-region class="text-[11px] text-[#888888] mt-0.5">
              Music videos, country charts (68 regions), and curated moods &amp; genres
            </p>
          </div>

          <div class="flex items-center gap-2">
            <Show when={aiFilter.isEnabled()}>
              <span
                class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-[#ff4444] bg-[#1a0505] border border-[#ff2222]/30 select-none"
                title="0% CPU AI Song Filter active (Suno, Udio, AI Covers, Voice Clones hidden)"
              >
                <Shield class="w-2.5 h-2.5" />
                <span>AI Filter On</span>
              </span>
            </Show>

            <button
              onClick={handleRefresh}
              disabled={isLoading()}
              class="px-2.5 py-1 text-xs rounded bg-[#0a0a0a] hover:bg-[#111111] text-[#888888] hover:text-white transition-colors flex items-center gap-1.5 border border-[#222222] disabled:opacity-50 shrink-0 cursor-pointer font-mono"
              title="Refresh current Explore section"
            >
              <Sparkles class={`w-3 h-3 text-[#ff2222] ${isLoading() ? "animate-spin" : ""}`} />
              <span>{isLoading() ? "Loading..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* 3 Clean Dedicated Tabs: Music Videos | Charts | Moods & genres */}
        <div data-tauri-drag-region class="flex items-center gap-2 overflow-x-auto py-0.5">
          <button
            onClick={() => handleFilterChange("releases")}
            class={`shrink-0 h-7 flex items-center gap-1.5 px-3 rounded text-xs font-mono transition-colors border cursor-pointer ${
              activeExploreFilter() === "releases"
                ? "bg-[#140505] text-[#ff2222] border-[#ff2222]"
                : "bg-[#0a0a0a] text-[#888888] border-[#222222] hover:bg-[#111111] hover:text-white hover:border-[#333333]"
            }`}
          >
            <Video class="w-3 h-3 text-[#ff2222] shrink-0" />
            <span>Music Videos</span>
          </button>

          <button
            onClick={() => handleFilterChange("charts")}
            class={`shrink-0 h-7 flex items-center gap-1.5 px-3 rounded text-xs font-mono transition-colors border cursor-pointer ${
              activeExploreFilter() === "charts"
                ? "bg-[#140505] text-[#ff2222] border-[#ff2222]"
                : "bg-[#0a0a0a] text-[#888888] border-[#222222] hover:bg-[#111111] hover:text-white hover:border-[#333333]"
            }`}
          >
            <TrendingUp class="w-3 h-3 text-[#ff2222] shrink-0" />
            <span>Charts</span>
          </button>

          <button
            onClick={() => handleFilterChange("moods")}
            class={`shrink-0 h-7 flex items-center gap-1.5 px-3 rounded text-xs font-mono transition-colors border cursor-pointer ${
              activeExploreFilter() === "moods"
                ? "bg-[#140505] text-[#ff2222] border-[#ff2222]"
                : "bg-[#0a0a0a] text-[#888888] border-[#222222] hover:bg-[#111111] hover:text-white hover:border-[#333333]"
            }`}
          >
            <Smile class="w-3 h-3 text-[#ff2222] shrink-0" />
            <span>Moods &amp; genres</span>
          </button>
        </div>
      </div>

      {/* Scrollable Main Content Area */}
      <div class="flex-1 min-h-0 overflow-y-auto p-5 space-y-7">
        {/* ========================================================= */}
        {/* TAB 1: MUSIC VIDEOS                                       */}
        {/* ========================================================= */}
        <Show when={activeExploreFilter() === "releases"}>
          <Show when={playerStore.isExploreLoading() && !feed()}>
            <div class="py-20 flex flex-col items-center justify-center text-[#888888] gap-2">
              <Loader2 class="w-5 h-5 animate-spin text-[#ff2222]" />
              <span class="text-xs font-mono">Loading Music Videos from YouTube Music...</span>
            </div>
          </Show>

          <Show when={feed()}>
            {/* New music videos */}
            <Show when={filteredNewVideos().length > 0}>
              <div class="space-y-2.5">
                <div class="flex items-center justify-between border-b border-[#181818] pb-1.5">
                  <div class="flex items-center gap-2">
                    <Video class="w-3.5 h-3.5 text-[#ff2222]" />
                    <h3 class="text-xs font-bold text-white uppercase tracking-wider">
                      New music videos
                    </h3>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] text-[#888888] font-mono mr-1">
                      {filteredNewVideos().length} videos
                    </span>
                    <button
                      onClick={() => handlePlayAllTracks(filteredNewVideos(), false)}
                      class="px-2.5 py-1 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white text-[11px] font-mono font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play class="w-3 h-3 fill-white" />
                      <span>Play All</span>
                    </button>
                    <button
                      onClick={() => handlePlayAllTracks(filteredNewVideos(), true)}
                      class="px-2.5 py-1 rounded bg-[#0a0a0a] hover:bg-[#140505] text-[#888888] hover:text-[#ff2222] border border-[#222222] text-[11px] font-mono font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Shuffle class="w-3 h-3 text-[#ff2222]" />
                      <span>Shuffle</span>
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <For each={filteredNewVideos()}>
                    {(video) => (
                      <div
                        onContextMenu={(e) => openTrackContextMenu(e, video)}
                        onClick={() => handlePlaySingleTrack(video)}
                        class="group p-2 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] hover:border-[#ff2222]/40 transition-all cursor-pointer flex flex-col"
                      >
                        <div class="relative w-full aspect-video rounded bg-[#141414] overflow-hidden mb-2 border border-[#222222]">
                          <Show
                            when={video.thumbnail_url}
                            fallback={
                              <div class="w-full h-full flex items-center justify-center text-[#555555]">
                                <Video class="w-6 h-6" />
                              </div>
                            }
                          >
                            <img
                              src={getHighResThumbnail(video.thumbnail_url)}
                              alt={video.title}
                              loading="lazy"
                              decoding="async"
                              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </Show>
                          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <div class="w-8 h-8 rounded-full bg-[#ff2222] text-white flex items-center justify-center shadow">
                              <Play class="w-3.5 h-3.5 fill-white translate-x-0.5" />
                            </div>
                          </div>
                        </div>

                        <h4 class="text-xs font-semibold text-white truncate group-hover:text-[#ff2222] transition-colors">
                          {video.title}
                        </h4>
                        <p class="text-[11px] text-[#888888] truncate mt-0.5">{video.artist}</p>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        </Show>

        {/* ========================================================= */}
        {/* TAB 2: CHARTS (Single Country Selector + Country Songs)   */}
        {/* ========================================================= */}
        <Show when={activeExploreFilter() === "charts"}>
          {/* Country Selector Bar */}
          <div class="flex flex-wrap items-center justify-between gap-3 bg-[#0a0a0a] border border-[#181818] rounded px-3.5 py-2.5">
            <div class="flex items-center gap-2">
              <Globe class="w-4 h-4 text-[#ff2222] shrink-0" />
              <div>
                <h3 class="text-xs font-bold text-white uppercase tracking-wider">
                  YouTube Music Charts &bull;{" "}
                  {CHART_COUNTRIES.find((c) => c.code === playerStore.selectedCountry())?.name ||
                    playerStore.selectedCountry()}
                </h3>
                <p class="text-[11px] text-[#888888]">
                  Select any of the 68 supported countries/regions to load local charts, songs, and top artists
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 relative" ref={dropdownRef}>
              <span class="text-xs text-[#888888] font-mono">Region:</span>
              <button
                type="button"
                onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen())}
                class="bg-[#111111] hover:bg-[#181818] border border-[#222222] hover:border-[#ff2222]/60 rounded px-2.5 py-1 text-xs font-mono text-white flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
              >
                <span class="max-w-[140px] truncate">
                  {CHART_COUNTRIES.find((c) => c.code === playerStore.selectedCountry())?.name ||
                    playerStore.selectedCountry()}
                </span>
                <ChevronDown
                  class={`w-3.5 h-3.5 text-[#ff2222] transition-transform duration-150 ${
                    isCountryDropdownOpen() ? "rotate-180" : ""
                  }`}
                />
              </button>

              <Show when={isCountryDropdownOpen()}>
                <div class="absolute right-0 top-full mt-1.5 w-64 bg-[#0a0a0a] border border-[#ff2222]/40 rounded shadow-xl max-h-60 overflow-y-auto z-50 divide-y divide-[#141414]">
                  <For each={CHART_COUNTRIES}>
                    {(c) => {
                      const isSelected = () => c.code === playerStore.selectedCountry();
                      return (
                        <div
                          onClick={() => handleCountryChange(c.code)}
                          class={`px-3 py-1.5 cursor-pointer text-xs font-mono flex items-center justify-between transition-colors ${
                            isSelected()
                              ? "bg-[#140505] text-[#ff2222] font-bold"
                              : "text-[#cccccc] hover:bg-[#140505] hover:text-[#ff2222]"
                          }`}
                        >
                          <span class="truncate">{c.name}</span>
                          <span class="text-[10px] text-[#666666] uppercase ml-2 shrink-0">
                            {c.code}
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </div>

          <Show when={playerStore.isChartsLoading()}>
            <div class="py-20 flex flex-col items-center justify-center text-[#888888] gap-2">
              <Loader2 class="w-5 h-5 animate-spin text-[#ff2222]" />
              <span class="text-xs font-mono">
                Loading charts for{" "}
                {CHART_COUNTRIES.find((c) => c.code === playerStore.selectedCountry())?.name ||
                  playerStore.selectedCountry()}
                ...
              </span>
            </div>
          </Show>

          <Show when={!playerStore.isChartsLoading() && charts()}>
            {/* 1. Country Top Songs */}
            <Show when={filteredChartTracks().length > 0}>
              <div class="space-y-2.5">
                <div class="flex items-center justify-between border-b border-[#181818] pb-1.5">
                  <div class="flex items-center gap-2">
                    <Flame class="w-3.5 h-3.5 text-[#ff2222]" />
                    <h3 class="text-xs font-bold text-white uppercase tracking-wider">
                      {charts()!.playlists.find((p) => p.id === playerStore.activeChartPlaylistId())
                        ?.title || "Top songs"}{" "}
                      &bull;{" "}
                      {CHART_COUNTRIES.find((c) => c.code === charts()!.country)?.name ||
                        charts()!.country}
                    </h3>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      onClick={() => handlePlayAllTracks(filteredChartTracks(), false)}
                      class="px-2.5 py-1 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play class="w-3 h-3 fill-white" />
                      <span>Play All ({filteredChartTracks().length})</span>
                    </button>
                    <button
                      onClick={() => handlePlayAllTracks(filteredChartTracks(), true)}
                      class="px-2.5 py-1 rounded bg-[#0a0a0a] hover:bg-[#140505] text-[#888888] hover:text-[#ff2222] border border-[#222222] text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Shuffle class="w-3 h-3 text-[#ff2222]" />
                      <span>Shuffle</span>
                    </button>
                  </div>
                </div>

                <div class="border border-[#181818] rounded overflow-hidden bg-[#050505]">
                  <div class="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0a0a0a] border-b border-[#181818] text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
                    <span class="col-span-1 text-center font-mono">#</span>
                    <span class="col-span-6">Title</span>
                    <span class="col-span-3">Artist</span>
                    <span class="col-span-2 text-right">Duration</span>
                  </div>

                  <div class="max-h-[480px] overflow-y-auto divide-y divide-[#141414]">
                    <For each={filteredChartTracks()}>
                      {(track, index) => {
                        const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                        const isLiked = () => playerStore.likedTrackIds().has(track.id);
                        const rank = index() + 1;

                        return (
                          <div
                            onContextMenu={(e) => openTrackContextMenu(e, track)}
                            onClick={() => {
                              if (isCurrent()) {
                                playerStore.togglePlay();
                              } else {
                                playerStore.playTrack(track);
                              }
                            }}
                            class={`grid grid-cols-12 gap-2 items-center px-3 py-2 group text-xs transition-colors hover:bg-[#0c0c0c] cursor-pointer ${
                              isCurrent() ? "bg-[#140505] text-white border-l-2 border-l-[#ff2222]" : "text-[#cccccc]"
                            }`}
                          >
                            <div class="col-span-1 flex items-center justify-center font-mono font-bold text-xs text-[#555555]">
                              <TrackRowPlayCell
                                trackId={track.id}
                                index={rank}
                                accentColor="red"
                              />
                            </div>

                            <div class="col-span-6 flex items-center gap-2.5 min-w-0">
                              <div class="relative w-7 h-7 rounded bg-[#111111] overflow-hidden shrink-0 border border-[#1e1e1e]">
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
                              <span
                                class={`truncate ${
                                  isCurrent() ? "text-[#ff2222] font-bold" : "text-white"
                                }`}
                              >
                                {track.title}
                              </span>
                            </div>

                            <div class="col-span-3 truncate text-[#888888] text-[11px]">
                              <span
                                class={
                                  track.artist_id
                                    ? "hover:text-[#ff2222] hover:underline cursor-pointer transition-colors"
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

                            <div
                              class="col-span-2 flex items-center justify-end gap-1.5 font-mono text-[11px] text-[#888888]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playerStore.toggleLike(track);
                                }}
                                class={`p-1 transition-colors cursor-pointer ${
                                  isLiked() ? "text-[#ff2222]" : "text-[#555555] hover:text-white"
                                }`}
                                title="Like track"
                              >
                                <Heart class={`w-3.5 h-3.5 ${isLiked() ? "fill-[#ff2222]" : ""}`} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playerStore.addToQueue(track);
                                }}
                                class="p-1 text-[#555555] hover:text-[#ff2222] hover:bg-[#140505] rounded cursor-pointer"
                                title="Add to queue"
                              >
                                <Plus class="w-3.5 h-3.5" />
                              </button>
                              <TrackOptionsTrigger track={track} />
                              <Show when={track.duration_seconds > 0}>
                                <span class="w-10 text-right">
                                  {formatDuration(track.duration_seconds)}
                                </span>
                              </Show>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </div>
            </Show>

            {/* 2. Country Chart Playlists */}
            <Show when={charts()!.playlists.length > 0}>
              <div class="space-y-2.5">
                <div class="flex items-center justify-between border-b border-[#181818] pb-1.5">
                  <div class="flex items-center gap-2">
                    <TrendingUp class="w-3.5 h-3.5 text-[#ff2222]" />
                    <h3 class="text-xs font-bold text-white uppercase tracking-wider">
                      Chart playlists
                    </h3>
                  </div>
                  <span class="text-[11px] text-[#888888]">
                    Click any chart playlist to open it
                  </span>
                </div>

                <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  <For each={charts()!.playlists}>
                    {(chart) => (
                      <div
                        onClick={() => handleOpenChartPlaylist(chart)}
                        class="group p-2 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] hover:border-[#ff2222]/40 transition-all cursor-pointer flex flex-col"
                      >
                        <div class="relative w-full aspect-square rounded bg-[#141414] overflow-hidden mb-2 border border-[#222222]">
                          <Show
                            when={chart.thumbnail_url}
                            fallback={
                              <div class="w-full h-full flex items-center justify-center text-[#555555]">
                                <TrendingUp class="w-6 h-6" />
                              </div>
                            }
                          >
                            <img
                              src={getHighResThumbnail(chart.thumbnail_url)}
                              alt={chart.title}
                              loading="lazy"
                              decoding="async"
                              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </Show>
                        </div>

                        <h4 class="text-xs font-semibold text-white truncate group-hover:text-[#ff2222] transition-colors">
                          {chart.title}
                        </h4>
                        <p class="text-[10px] text-[#888888] truncate mt-0.5">
                          {chart.subtitle || "YouTube Music Chart"}
                        </p>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* 3. Genre Charts */}
            <Show when={charts()!.genres.length > 0}>
              <div class="space-y-2.5">
                <div class="flex items-center justify-between border-b border-[#181818] pb-1.5">
                  <div class="flex items-center gap-2">
                    <Disc class="w-3.5 h-3.5 text-[#ff2222]" />
                    <h3 class="text-xs font-bold text-white uppercase tracking-wider">Genre charts</h3>
                  </div>
                  <span class="text-[11px] text-[#888888] font-mono">
                    {charts()!.genres.length} genre lists
                  </span>
                </div>

                <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2.5">
                  <For each={charts()!.genres}>
                    {(genreChart) => (
                      <div
                        onClick={() => handleOpenChartPlaylist(genreChart)}
                        class="group p-2 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] hover:border-[#ff2222]/40 transition-all cursor-pointer flex flex-col"
                      >
                        <div class="relative w-full aspect-square rounded bg-[#141414] overflow-hidden mb-1.5 border border-[#222222]">
                          <Show when={genreChart.thumbnail_url}>
                            <img
                              src={getHighResThumbnail(genreChart.thumbnail_url)}
                              alt={genreChart.title}
                              loading="lazy"
                              decoding="async"
                              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </Show>
                        </div>
                        <h4 class="text-[11px] font-semibold text-white truncate group-hover:text-[#ff2222] transition-colors">
                          {genreChart.title}
                        </h4>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* 4. Top Artists for Selected Country */}
            <Show when={charts()!.top_artists.length > 0}>
              <div class="space-y-2.5">
                <div class="flex items-center justify-between border-b border-[#181818] pb-1.5">
                  <div class="flex items-center gap-2">
                    <Users class="w-3.5 h-3.5 text-[#ff2222]" />
                    <h3 class="text-xs font-bold text-white uppercase tracking-wider">
                      Top artists &bull;{" "}
                      {CHART_COUNTRIES.find((c) => c.code === charts()!.country)?.name ||
                        charts()!.country}
                    </h3>
                  </div>
                  <span class="text-[11px] text-[#888888] font-mono">
                    Top {charts()!.top_artists.length}
                  </span>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <For each={charts()!.top_artists}>
                    {(artist, index) => (
                      <div
                        onClick={() => playerStore.openArtist(artist.id)}
                        class="group p-2.5 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] hover:border-[#ff2222]/40 transition-all cursor-pointer flex flex-col items-center text-center relative"
                      >
                        <span class="absolute top-2 left-2 text-[11px] font-mono font-bold text-[#555555] group-hover:text-[#ff2222]">
                          #{index() + 1}
                        </span>

                        <div class="w-20 h-20 rounded-full bg-[#141414] overflow-hidden mb-2 border border-[#222222]">
                          <Show
                            when={artist.thumbnail_url}
                            fallback={
                              <div class="w-full h-full flex items-center justify-center text-[#555555] font-bold text-base">
                                {artist.name.charAt(0)}
                              </div>
                            }
                          >
                            <img
                              src={getHighResThumbnail(artist.thumbnail_url, 300)}
                              alt={artist.name}
                              loading="lazy"
                              decoding="async"
                              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </Show>
                        </div>

                        <h4 class="text-xs font-semibold text-white truncate w-full group-hover:text-[#ff2222] transition-colors">
                          {artist.name}
                        </h4>
                        <Show when={artist.subscribers}>
                          <p class="text-[10px] text-[#888888] truncate w-full mt-0.5">
                            {artist.subscribers}
                          </p>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        </Show>

        {/* ========================================================= */}
        {/* TAB 3: MOODS & GENRES (With Category Drill-down View!)    */}
        {/* ========================================================= */}
        <Show when={activeExploreFilter() === "moods"}>
          <Show when={playerStore.isMoodLoading()}>
            <div class="py-20 flex flex-col items-center justify-center text-[#888888] gap-2">
              <Loader2 class="w-5 h-5 animate-spin text-[#ff2222]" />
              <span class="text-xs font-mono">Loading curated playlists &amp; tracks...</span>
            </div>
          </Show>

          {/* Drill-down View when a Mood/Genre is opened */}
          <Show when={!playerStore.isMoodLoading() && moodCat()}>
            <div class="space-y-6">
              <div class="flex items-center justify-between border-b border-[#181818] pb-2.5">
                <div class="flex items-center gap-2.5">
                  <button
                    onClick={() => playerStore.closeMoodCategory()}
                    class="px-2.5 py-1 rounded bg-[#0a0a0a] hover:bg-[#111111] text-[#888888] hover:text-white border border-[#222222] text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft class="w-3 h-3" />
                    <span>All Moods &amp; genres</span>
                  </button>
                  <div class="flex items-center gap-2">
                    <Smile class="w-3.5 h-3.5 text-[#ff2222]" />
                    <h3 class="text-sm font-bold text-white tracking-tight">
                      {moodCat()!.title}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Curated Playlist Shelves inside the selected Mood/Genre */}
              <For each={moodCat()!.sections}>
                {(section) => (
                  <div class="space-y-2.5">
                    <div class="flex items-center justify-between border-b border-[#181818] pb-1.5">
                      <h4 class="text-xs font-bold text-white uppercase tracking-wider">{section.title}</h4>
                      <span class="text-[11px] text-[#888888] font-mono">
                        {section.playlists.length} playlists
                      </span>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      <For each={section.playlists}>
                        {(pl: ChartItem) => (
                          <div
                            onClick={() =>
                              playerStore.openPlaylist(
                                pl.id,
                                pl.title,
                                pl.thumbnail_url,
                                pl.subtitle || moodCat()!.title
                              )
                            }
                            class="group p-2.5 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] hover:border-[#ff2222]/40 transition-all cursor-pointer flex flex-col"
                          >
                            <div class="relative w-full aspect-square rounded bg-[#141414] overflow-hidden mb-2 border border-[#222222]">
                              <Show
                                when={pl.thumbnail_url}
                                fallback={
                                  <div class="w-full h-full flex items-center justify-center text-[#555555]">
                                    <Disc class="w-6 h-6" />
                                  </div>
                                }
                              >
                                <img
                                  src={getHighResThumbnail(pl.thumbnail_url)}
                                  alt={pl.title}
                                  loading="lazy"
                                  decoding="async"
                                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              </Show>
                            </div>
                            <h5 class="text-xs font-semibold text-white truncate group-hover:text-[#ff2222] transition-colors">
                              {pl.title}
                            </h5>
                            <Show when={pl.subtitle}>
                              <p class="text-[11px] text-[#888888] truncate mt-0.5">{pl.subtitle}</p>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>

              {/* Songs in this Mood/Genre */}
              <Show when={filteredMoodTracks().length > 0}>
                <div class="space-y-2.5">
                  <div class="flex items-center justify-between border-b border-[#181818] pb-1.5">
                    <div class="flex items-center gap-2">
                      <Music2 class="w-3.5 h-3.5 text-[#ff2222]" />
                      <h4 class="text-xs font-bold text-white uppercase tracking-wider">
                        {moodCat()!.title} &bull; Featured Tracks
                      </h4>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        onClick={() => handlePlayAllTracks(filteredMoodTracks(), false)}
                        class="px-2.5 py-1 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play class="w-3 h-3 fill-white" />
                        <span>Play All ({filteredMoodTracks().length})</span>
                      </button>
                      <button
                        onClick={() => handlePlayAllTracks(filteredMoodTracks(), true)}
                        class="px-2.5 py-1 rounded bg-[#0a0a0a] hover:bg-[#140505] text-[#888888] hover:text-[#ff2222] border border-[#222222] text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                      >
                        <Shuffle class="w-3 h-3 text-[#ff2222]" />
                        <span>Shuffle</span>
                      </button>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    <For each={filteredMoodTracks()}>
                      {(track) => {
                        const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                        return (
                          <div
                            onContextMenu={(e) => openTrackContextMenu(e, track)}
                            onClick={() => {
                              if (isCurrent()) {
                                playerStore.togglePlay();
                              } else {
                                playerStore.playTrack(track);
                              }
                            }}
                            class={`group p-2 rounded bg-[#0a0a0a] hover:bg-[#111111] border transition-all flex items-center justify-between cursor-pointer ${
                              isCurrent()
                                ? "border-[#ff2222] bg-[#140505] text-white border-l-2 border-l-[#ff2222]"
                                : "border-[#181818] hover:border-[#ff2222]/30"
                            }`}
                          >
                            <div class="flex items-center gap-2.5 min-w-0">
                              <div class="relative w-8 h-8 rounded bg-[#111111] shrink-0 overflow-hidden border border-[#222222]">
                                <Show when={track.thumbnail_url}>
                                  <img
                                    src={track.thumbnail_url}
                                    alt={track.title}
                                    loading="lazy"
                                    decoding="async"
                                    class="w-full h-full object-cover"
                                  />
                                </Show>
                                <TrackThumbnailOverlay trackId={track.id} accentColor="red" />
                              </div>
                              <div class="min-w-0">
                                <h5 class="text-xs font-semibold text-white truncate">
                                  {track.title}
                                </h5>
                                <p class="text-[11px] text-[#888888] truncate mt-0.5">
                                  {track.artist}
                                </p>
                              </div>
                            </div>
                            <div
                              class="flex items-center gap-1 shrink-0 ml-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <TrackOptionsTrigger track={track} />
                              <Show when={track.duration_seconds > 0}>
                                <span class="text-[11px] font-mono text-[#888888]">
                                  {formatDuration(track.duration_seconds)}
                                </span>
                              </Show>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          {/* All Moods & Genres Grid */}
          <Show when={!playerStore.isMoodLoading() && !moodCat() && feed()}>
            <Show when={feed()!.moods_and_genres.length > 0}>
              <div class="space-y-2.5">
                <div class="flex items-center justify-between border-b border-[#181818] pb-1.5">
                  <div class="flex items-center gap-2">
                    <Smile class="w-3.5 h-3.5 text-[#ff2222]" />
                    <h3 class="text-xs font-bold text-white uppercase tracking-wider">
                      Moods &amp; genres
                    </h3>
                  </div>
                  <span class="text-[11px] text-[#888888] font-mono">
                    {feed()!.moods_and_genres.length} categories
                  </span>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                  <For each={feed()!.moods_and_genres}>
                    {(mood) => (
                      <button
                        onClick={() => handleSelectMood(mood)}
                        class="relative h-10 px-3 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] hover:border-[#ff2222]/40 transition-all flex items-center justify-between group overflow-hidden text-left cursor-pointer font-mono"
                      >
                        <div
                          class="absolute left-0 top-0 bottom-0 w-1 rounded-l transition-all group-hover:w-1.5"
                          style={{ "background-color": mood.color_hex }}
                        />

                        <span class="text-xs text-[#cccccc] group-hover:text-white pl-1.5 truncate">
                          {mood.title}
                        </span>
                        <ArrowUpRight class="w-3 h-3 text-[#555555] group-hover:text-[#ff2222] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
};
