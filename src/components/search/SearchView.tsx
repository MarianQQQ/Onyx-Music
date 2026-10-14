import { Component, createSignal, For, Show, onCleanup, onMount } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { formatDuration, Track, SuggestionItem, SearchSuggestions, getCleanArtist, cleanTrack, getHighResThumbnail } from "../../models/track";
import { Search, Play, Plus, Loader2, Music2, Heart, X, Disc3, Users, ListMusic, Shield } from "lucide-solid";
import { TrackRowPlayCell } from "../player/PlayingIndicator";
import { aiFilter } from "../../services/aiFilter";
import { openTrackContextMenu, TrackOptionsTrigger } from "../player/TrackContextMenu";

export const SearchView: Component = () => {
  const [query, setQuery] = createSignal("");
  const [activeChip, setActiveChip] = createSignal("All");

  // 0% CPU AI Track Filter for search results
  const filteredTracks = () => aiFilter.filterTracks(playerStore.searchResults().tracks);
  const [suggestions, setSuggestions] = createSignal<SearchSuggestions>({
    queries: [],
    items: [],
  });
  const [showSuggestions, setShowSuggestions] = createSignal(false);

  const chips = ["All", "Songs", "Videos", "Albums", "Artists", "Playlists"];

  let searchContainerRef: HTMLDivElement | undefined;
  let debounceTimeout: number | null = null;
  let suggestionReqCounter = 0;

  const cancelPendingSuggestions = () => {
    suggestionReqCounter++;
    if (debounceTimeout !== null) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
    setShowSuggestions(false);
  };

  onMount(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef && !searchContainerRef.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleOutsideClick);
      if (debounceTimeout !== null) clearTimeout(debounceTimeout);
    });
  });

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceTimeout !== null) clearTimeout(debounceTimeout);
    if (!val.trim()) {
      suggestionReqCounter++;
      setSuggestions({ queries: [], items: [] });
      setShowSuggestions(false);
      return;
    }
    const reqId = ++suggestionReqCounter;
    debounceTimeout = window.setTimeout(async () => {
      const res = await playerStore.fetchSuggestions(val.trim());
      if (reqId !== suggestionReqCounter) return;
      setSuggestions(res);
      setShowSuggestions(res.queries.length > 0 || res.items.length > 0);
    }, 180);
  };

  const handleSearch = (e?: Event) => {
    e?.preventDefault();
    cancelPendingSuggestions();
    const q = query().trim();
    if (q) {
      playerStore.search(q, activeChip());
    }
  };

  const handleSelectQuery = (q: string) => {
    setQuery(q);
    cancelPendingSuggestions();
    playerStore.search(q, activeChip());
  };

  const handleSelectItem = (it: SuggestionItem) => {
    cancelPendingSuggestions();
    if (it.video_id) {
      playerStore.playTrack({
        id: it.video_id,
        title: it.title,
        artist: it.subtitle || "YouTube Music",
        duration_seconds: 210,
        thumbnail_url: it.thumbnail_url,
      });
    } else if (it.browse_id) {
      if (it.browse_id.startsWith("UC")) {
        playerStore.openArtist(it.browse_id);
      } else {
        playerStore.openPlaylist(it.browse_id, it.title, it.thumbnail_url, it.subtitle);
      }
    } else {
      handleSelectQuery(it.title);
    }
  };

  const handleChipClick = (chip: string) => {
    setActiveChip(chip);
    cancelPendingSuggestions();
    const q = query().trim();
    if (q) {
      playerStore.search(q, chip);
    }
  };

  // Track click plays the selected track standalone
  const handlePlayResult = (track: Track) => {
    cancelPendingSuggestions();
    playerStore.playTrack(cleanTrack(track));
  };

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  return (
    <div class="h-full overflow-y-auto p-5 bg-[#000000] font-mono select-none text-xs">
      {/* Search Bar & Predictive Suggestions */}
      <div
        ref={searchContainerRef}
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        class="w-full mb-4 relative"
      >
        <form onSubmit={handleSearch} class="flex items-center gap-2">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
            <input
              type="text"
              value={query()}
              onInput={(e) => handleInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  cancelPendingSuggestions();
                }
              }}
              placeholder="Search YouTube Music (tracks, artists, albums)..."
              class="w-full bg-[#0a0a0a] text-white pl-9 pr-8 py-2 rounded border border-[#222222] focus:outline-none focus:border-[#ff2222] text-xs font-mono transition-colors placeholder:text-[#555555]"
            />
            <Show when={query().length > 0}>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSuggestions({ queries: [], items: [] });
                  cancelPendingSuggestions();
                }}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555555] hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                title="Clear query"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </Show>
          </div>
          <button
            type="submit"
            disabled={playerStore.isSearching()}
            class="px-3.5 py-2 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white font-mono text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Show
              when={playerStore.isSearching()}
              fallback={
                <>
                  <Search class="w-3.5 h-3.5" />
                  <span>Search</span>
                </>
              }
            >
              <Loader2 class="w-3.5 h-3.5 animate-spin" />
              <span>Searching...</span>
            </Show>
          </button>
        </form>

        {/* Category Chips */}
        <div class="flex items-center justify-between gap-1.5 mt-2.5 overflow-x-auto">
          <div class="flex items-center gap-1.5">
            <For each={chips}>
              {(chip) => (
                <button
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  class={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors border cursor-pointer ${
                    activeChip() === chip
                      ? "bg-[#140505] text-[#ff2222] border-[#ff2222]"
                      : "bg-[#0a0a0a] text-[#888888] border-[#222222] hover:bg-[#111111] hover:text-white hover:border-[#333333]"
                  }`}
                >
                  {chip}
                </button>
              )}
            </For>
          </div>

          <Show when={aiFilter.isEnabled()}>
            <span
              class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-[#ff4444] bg-[#1a0505] border border-[#ff2222]/30 select-none shrink-0"
              title="0% CPU AI Song Filter active (Suno, Udio, AI Covers, Voice Clones hidden)"
            >
              <Shield class="w-2.5 h-2.5" />
              <span>AI Filter On</span>
            </span>
          </Show>
        </div>

        {/* Predictive Search Suggestions Panel */}
        <Show
          when={
            showSuggestions() &&
            (suggestions().queries.length > 0 || suggestions().items.length > 0)
          }
        >
          <div class="mt-2.5 bg-[#0a0a0a] border border-[#181818] rounded overflow-hidden divide-y divide-[#181818] font-mono">
            <div class="px-3 py-1.5 bg-[#050505] flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
              <span>Search Suggestions</span>
              <button
                type="button"
                onClick={() => setShowSuggestions(false)}
                class="text-[#555555] hover:text-[#ff2222] flex items-center gap-1 cursor-pointer"
              >
                <span>Hide</span>
                <X class="w-3 h-3" />
              </button>
            </div>

            {/* Query Suggestions */}
            <Show when={suggestions().queries.length > 0}>
              <div class="py-1">
                <For each={suggestions().queries}>
                  {(qItem) => (
                    <div
                      onClick={() => handleSelectQuery(qItem)}
                      class="px-3 py-1.5 hover:bg-[#111111] cursor-pointer flex items-center gap-2.5 text-xs text-[#cccccc] hover:text-white transition-colors"
                    >
                      <Search class="w-3 h-3 text-[#555555] shrink-0" />
                      <span class="truncate">{qItem}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Direct Item Suggestions */}
            <Show when={suggestions().items.length > 0}>
              <div class="py-1 bg-[#050505]">
                <For each={suggestions().items}>
                  {(it) => (
                    <div
                      onClick={() => handleSelectItem(it)}
                      class="px-3 py-1.5 hover:bg-[#111111] cursor-pointer flex items-center gap-2.5 text-xs transition-colors group"
                    >
                      <div class="relative w-7 h-7 rounded bg-[#111111] shrink-0 overflow-hidden border border-[#222222]">
                        <Show
                          when={it.thumbnail_url}
                          fallback={
                            <div class="w-full h-full flex items-center justify-center text-[#555555]">
                              <Music2 class="w-3 h-3" />
                            </div>
                          }
                        >
                          <img
                            src={it.thumbnail_url}
                            alt={it.title}
                            loading="lazy"
                            decoding="async"
                            class="w-full h-full object-cover"
                          />
                        </Show>
                      </div>

                      <div class="min-w-0 flex-1">
                        <h4 class="text-white group-hover:text-[#ff2222] truncate text-xs">
                          {it.title}
                        </h4>
                        <Show when={it.subtitle}>
                          <p class="text-[10px] text-[#777777] truncate">{it.subtitle}</p>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Results View */}
      <div class="flex-1 w-full space-y-6">
        <Show when={playerStore.isSearching()}>
          <div class="py-20 flex flex-col items-center justify-center text-[#888888] gap-2">
            <Loader2 class="w-5 h-5 animate-spin text-[#ff2222]" />
            <p class="text-xs font-mono">Searching YouTube Music...</p>
          </div>
        </Show>

        <Show when={!playerStore.isSearching()}>
          {/* 1. ARTISTS ONLY TAB */}
          <Show when={activeChip() === "Artists"}>
            <Show
              when={playerStore.searchResults().artists.length > 0}
              fallback={
                <div class="py-16 text-center text-[#555555]">
                  <Users class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                  <p class="text-xs">No artists found for "{query() || playerStore.searchResults().query}"</p>
                </div>
              }
            >
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                <For each={playerStore.searchResults().artists}>
                  {(artist) => (
                    <div
                      onClick={() => playerStore.openArtist(artist.id)}
                      class="group p-2.5 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] transition-all flex flex-col items-center text-center cursor-pointer hover:border-[#ff2222]/40"
                    >
                      <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-[#141414] mb-2 border border-[#222222] shrink-0">
                        <Show
                          when={artist.thumbnail_url}
                          fallback={
                            <div class="w-full h-full flex items-center justify-center text-[#555555]">
                              <Users class="w-8 h-8" />
                            </div>
                          }
                        >
                          <img
                            src={getHighResThumbnail(artist.thumbnail_url, 300)}
                            alt={artist.name}
                            loading="lazy"
                            decoding="async"
                            class="w-full h-full object-cover"
                          />
                        </Show>
                      </div>
                      <h4 class="font-bold text-white text-xs truncate w-full group-hover:text-[#ff2222] transition-colors">
                        {artist.name}
                      </h4>
                      <p class="text-[11px] text-[#888888] truncate w-full mt-0.5 font-mono">
                        {artist.subscribers || "Artist"}
                      </p>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          {/* 2. ALBUMS ONLY TAB */}
          <Show when={activeChip() === "Albums"}>
            <Show
              when={playerStore.searchResults().albums.length > 0}
              fallback={
                <div class="py-16 text-center text-[#555555]">
                  <Disc3 class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                  <p class="text-xs">No albums found for "{query() || playerStore.searchResults().query}"</p>
                </div>
              }
            >
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                <For each={playerStore.searchResults().albums}>
                  {(album) => (
                    <div
                      onClick={() => playerStore.openPlaylist(album.id, album.title, album.thumbnail_url, album.artist || album.year)}
                      class="group p-2.5 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] transition-all flex flex-col cursor-pointer hover:border-[#ff2222]/40"
                    >
                      <div class="relative w-full aspect-square rounded overflow-hidden bg-[#141414] mb-2 border border-[#222222]">
                        <Show
                          when={album.thumbnail_url}
                          fallback={
                            <div class="w-full h-full flex items-center justify-center text-[#555555]">
                              <Disc3 class="w-8 h-8" />
                            </div>
                          }
                        >
                          <img
                            src={getHighResThumbnail(album.thumbnail_url)}
                            alt={album.title}
                            loading="lazy"
                            decoding="async"
                            class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </Show>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playerStore.selectChartPlaylist(album.id, true);
                          }}
                          title="Play Album"
                          class="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-[#ff2222] hover:bg-[#e01a1a] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <Play class="w-3 h-3 fill-white ml-0.5" />
                        </button>
                      </div>
                      <h4 class="font-bold text-white text-xs truncate group-hover:text-[#ff2222] transition-colors">
                        {album.title}
                      </h4>
                      <p class="text-[11px] text-[#888888] truncate mt-0.5">
                        {album.artist || album.year || "Album"}
                      </p>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          {/* 3. PLAYLISTS ONLY TAB */}
          <Show when={activeChip() === "Playlists"}>
            <Show
              when={playerStore.searchResults().playlists.length > 0}
              fallback={
                <div class="py-16 text-center text-[#555555]">
                  <ListMusic class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                  <p class="text-xs">No playlists found for "{query() || playerStore.searchResults().query}"</p>
                </div>
              }
            >
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                <For each={playerStore.searchResults().playlists}>
                  {(pl) => (
                    <div
                      onClick={() => playerStore.openPlaylist(pl.id, pl.title, pl.thumbnail_url, pl.subtitle)}
                      class="group p-2.5 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] transition-all flex flex-col cursor-pointer hover:border-[#ff2222]/40"
                    >
                      <div class="relative w-full aspect-square rounded overflow-hidden bg-[#141414] mb-2 border border-[#222222]">
                        <Show
                          when={pl.thumbnail_url}
                          fallback={
                            <div class="w-full h-full flex items-center justify-center text-[#555555]">
                              <ListMusic class="w-8 h-8" />
                            </div>
                          }
                        >
                          <img
                            src={getHighResThumbnail(pl.thumbnail_url)}
                            alt={pl.title}
                            loading="lazy"
                            decoding="async"
                            class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </Show>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playerStore.selectChartPlaylist(pl.id, true);
                          }}
                          title="Play Playlist"
                          class="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-[#ff2222] hover:bg-[#e01a1a] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <Play class="w-3 h-3 fill-white ml-0.5" />
                        </button>
                      </div>
                      <h4 class="font-bold text-white text-xs truncate group-hover:text-[#ff2222] transition-colors">
                        {pl.title}
                      </h4>
                      <p class="text-[11px] text-[#888888] truncate mt-0.5">
                        {pl.subtitle || "Playlist"}
                      </p>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          {/* 4. SONGS OR VIDEOS ONLY TAB */}
          <Show when={activeChip() === "Songs" || activeChip() === "Videos"}>
            <Show
              when={filteredTracks().length > 0}
              fallback={
                <div class="py-16 text-center text-[#555555]">
                  <Music2 class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                  <p class="text-xs">No {activeChip().toLowerCase()} found for "{query() || playerStore.searchResults().query}"</p>
                </div>
              }
            >
              <div class="border border-[#181818] rounded bg-[#050505]">
                <div class="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0a0a0a] border-b border-[#181818] text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
                  <span class="col-span-1 text-center font-mono">#</span>
                  <span class="col-span-6">Title</span>
                  <span class="col-span-3">Artist</span>
                  <span class="col-span-2 text-right">Time</span>
                </div>

                <For each={filteredTracks()}>
                  {(track, index) => {
                    const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                    const isLiked = () => playerStore.likedTrackIds().has(track.id);
                    const cleaned = cleanTrack(track);

                    return (
                      <div
                        onContextMenu={(e) => openTrackContextMenu(e, track)}
                        onClick={() => handlePlayResult(cleaned)}
                        class={`grid grid-cols-12 gap-2 items-center px-3 py-2 border-b border-[#141414] group text-xs transition-colors hover:bg-[#0c0c0c] cursor-pointer ${
                          isCurrent() ? "bg-[#140505] text-white border-l-2 border-l-[#ff2222]" : "text-[#cccccc]"
                        }`}
                      >
                        <div class="col-span-1 text-center font-mono text-[11px] text-[#555555] flex items-center justify-center">
                          <TrackRowPlayCell trackId={track.id} index={index() + 1} accentColor="red" />
                        </div>

                        <div class="col-span-6 flex items-center gap-2.5 min-w-0">
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
                                alt={cleaned.title}
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
                            {cleaned.title}
                          </span>
                        </div>

                        <div class="col-span-3 truncate text-[#888888] text-[11px]">
                          <span
                            class="hover:text-[#ff2222] cursor-pointer hover:underline transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              const cleanArt = getCleanArtist(track);
                              playerStore.openArtist(track.artist_id || cleanArt);
                            }}
                            title="Open artist profile"
                          >
                            {getCleanArtist(track)}
                          </span>
                        </div>

                        <div
                          class="col-span-2 flex items-center justify-end gap-1.5 text-right font-mono text-[11px] text-[#888888]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playerStore.toggleLike(track);
                            }}
                            title="Like track"
                            class={`p-1 transition-colors cursor-pointer ${
                              isLiked() ? "text-[#ff2222]" : "text-[#555555] hover:text-white"
                            }`}
                          >
                            <Heart class={`w-3.5 h-3.5 ${isLiked() ? "fill-[#ff2222]" : ""}`} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playerStore.addToQueue(cleaned);
                            }}
                            title="Add to queue"
                            class="p-1 text-[#555555] hover:text-[#ff2222] hover:bg-[#140505] rounded cursor-pointer"
                          >
                            <Plus class="w-3.5 h-3.5" />
                          </button>
                          <TrackOptionsTrigger track={cleaned} />
                          <Show when={track.duration_seconds > 0}>
                            <span class="w-9">{formatDuration(track.duration_seconds)}</span>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>

          {/* 5. ALL TAB (Structured Overview of Artists, Tracks, Albums, Playlists) */}
          <Show when={activeChip() === "All"}>
            <Show
              when={
                filteredTracks().length > 0 ||
                playerStore.searchResults().artists.length > 0 ||
                playerStore.searchResults().albums.length > 0 ||
                playerStore.searchResults().playlists.length > 0
              }
              fallback={
                <div class="py-20 text-center text-[#555555]">
                  <Music2 class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                  <p class="text-xs">Search songs, artists, albums, or paste a link.</p>
                </div>
              }
            >
              <div class="space-y-6">
                {/* Artists Shelf in "All" */}
                <Show when={playerStore.searchResults().artists.length > 0}>
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <h3 class="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                        <Users class="w-3.5 h-3.5 text-[#ff2222]" />
                        <span>Artists</span>
                      </h3>
                      <button
                        onClick={() => handleChipClick("Artists")}
                        class="text-[11px] text-[#ff2222] hover:underline cursor-pointer font-mono"
                      >
                        View all
                      </button>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      <For each={playerStore.searchResults().artists.slice(0, 6)}>
                        {(artist) => (
                          <div
                            onClick={() => playerStore.openArtist(artist.id)}
                            class="group p-2.5 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] transition-all flex flex-col items-center text-center cursor-pointer hover:border-[#ff2222]/40"
                          >
                            <div class="w-20 h-20 rounded-full overflow-hidden bg-[#141414] mb-2 border border-[#222222] shrink-0">
                              <Show
                                when={artist.thumbnail_url}
                                fallback={
                                  <div class="w-full h-full flex items-center justify-center text-[#555555]">
                                    <Users class="w-6 h-6" />
                                  </div>
                                }
                              >
                                <img
                                  src={getHighResThumbnail(artist.thumbnail_url, 300)}
                                  alt={artist.name}
                                  loading="lazy"
                                  decoding="async"
                                  class="w-full h-full object-cover"
                                />
                              </Show>
                            </div>
                            <h4 class="font-bold text-white text-xs truncate w-full group-hover:text-[#ff2222] transition-colors">
                              {artist.name}
                            </h4>
                            <p class="text-[10px] text-[#888888] truncate w-full mt-0.5">
                              {artist.subscribers || "Artist"}
                            </p>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Tracks in "All" */}
                <Show when={filteredTracks().length > 0}>
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <h3 class="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                        <Music2 class="w-3.5 h-3.5 text-[#ff2222]" />
                        <span>Songs</span>
                      </h3>
                      <button
                        onClick={() => handleChipClick("Songs")}
                        class="text-[11px] text-[#ff2222] hover:underline cursor-pointer font-mono"
                      >
                        View all
                      </button>
                    </div>
                    <div class="border border-[#181818] rounded bg-[#050505]">
                      <div class="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0a0a0a] border-b border-[#181818] text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
                        <span class="col-span-1 text-center font-mono">#</span>
                        <span class="col-span-6">Title</span>
                        <span class="col-span-3">Artist</span>
                        <span class="col-span-2 text-right">Time</span>
                      </div>

                      <For each={filteredTracks().slice(0, 15)}>
                        {(track, index) => {
                          const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                          const isLiked = () => playerStore.likedTrackIds().has(track.id);
                          const cleaned = cleanTrack(track);

                          return (
                            <div
                              onContextMenu={(e) => openTrackContextMenu(e, track)}
                              onClick={() => handlePlayResult(cleaned)}
                              class={`grid grid-cols-12 gap-2 items-center px-3 py-2 border-b border-[#141414] group text-xs transition-colors hover:bg-[#0c0c0c] cursor-pointer ${
                                isCurrent() ? "bg-[#140505] text-white border-l-2 border-l-[#ff2222]" : "text-[#cccccc]"
                              }`}
                            >
                              <div class="col-span-1 text-center font-mono text-[11px] text-[#555555] flex items-center justify-center">
                                <TrackRowPlayCell trackId={track.id} index={index() + 1} accentColor="red" />
                              </div>

                              <div class="col-span-6 flex items-center gap-2.5 min-w-0">
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
                                      alt={cleaned.title}
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
                                  {cleaned.title}
                                </span>
                              </div>

                              <div class="col-span-3 truncate text-[#888888] text-[11px]">
                                <span
                                  class="hover:text-[#ff2222] cursor-pointer hover:underline transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const cleanArt = getCleanArtist(track);
                                    playerStore.openArtist(track.artist_id || cleanArt);
                                  }}
                                  title="Open artist profile"
                                >
                                  {getCleanArtist(track)}
                                </span>
                              </div>

                              <div
                                class="col-span-2 flex items-center justify-end gap-1.5 text-right font-mono text-[11px] text-[#888888]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playerStore.toggleLike(track);
                                  }}
                                  title="Like track"
                                  class={`p-1 transition-colors cursor-pointer ${
                                    isLiked() ? "text-[#ff2222]" : "text-[#555555] hover:text-white"
                                  }`}
                                >
                                  <Heart class={`w-3.5 h-3.5 ${isLiked() ? "fill-[#ff2222]" : ""}`} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playerStore.addToQueue(cleaned);
                                  }}
                                  title="Add to queue"
                                  class="p-1 text-[#555555] hover:text-[#ff2222] hover:bg-[#140505] rounded cursor-pointer"
                                >
                                  <Plus class="w-3.5 h-3.5" />
                                </button>
                                <TrackOptionsTrigger track={cleaned} />
                                <Show when={track.duration_seconds > 0}>
                                  <span class="w-9">{formatDuration(track.duration_seconds)}</span>
                                </Show>
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Albums in "All" */}
                <Show when={playerStore.searchResults().albums.length > 0}>
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <h3 class="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                        <Disc3 class="w-3.5 h-3.5 text-[#ff2222]" />
                        <span>Albums</span>
                      </h3>
                      <button
                        onClick={() => handleChipClick("Albums")}
                        class="text-[11px] text-[#ff2222] hover:underline cursor-pointer font-mono"
                      >
                        View all
                      </button>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      <For each={playerStore.searchResults().albums.slice(0, 6)}>
                        {(album) => (
                          <div
                            onClick={() => playerStore.openPlaylist(album.id, album.title, album.thumbnail_url, album.artist || album.year)}
                            class="group p-2.5 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] transition-all flex flex-col cursor-pointer hover:border-[#ff2222]/40"
                          >
                            <div class="relative w-full aspect-square rounded overflow-hidden bg-[#141414] mb-2 border border-[#222222]">
                              <Show
                                when={album.thumbnail_url}
                                fallback={
                                  <div class="w-full h-full flex items-center justify-center text-[#555555]">
                                    <Disc3 class="w-8 h-8" />
                                  </div>
                                }
                              >
                                <img
                                  src={getHighResThumbnail(album.thumbnail_url)}
                                  alt={album.title}
                                  loading="lazy"
                                  decoding="async"
                                  class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              </Show>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playerStore.selectChartPlaylist(album.id, true);
                                }}
                                title="Play Album"
                                class="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-[#ff2222] hover:bg-[#e01a1a] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              >
                                <Play class="w-3 h-3 fill-white ml-0.5" />
                              </button>
                            </div>
                            <h4 class="font-bold text-white text-xs truncate group-hover:text-[#ff2222] transition-colors">
                              {album.title}
                            </h4>
                            <p class="text-[10px] text-[#888888] truncate mt-0.5">
                              {album.artist || album.year || "Album"}
                            </p>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Playlists in "All" */}
                <Show when={playerStore.searchResults().playlists.length > 0}>
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <h3 class="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                        <ListMusic class="w-3.5 h-3.5 text-[#ff2222]" />
                        <span>Playlists</span>
                      </h3>
                      <button
                        onClick={() => handleChipClick("Playlists")}
                        class="text-[11px] text-[#ff2222] hover:underline cursor-pointer font-mono"
                      >
                        View all
                      </button>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      <For each={playerStore.searchResults().playlists.slice(0, 6)}>
                        {(pl) => (
                          <div
                            onClick={() => playerStore.openPlaylist(pl.id, pl.title, pl.thumbnail_url, pl.subtitle)}
                            class="group p-2.5 rounded bg-[#0a0a0a] hover:bg-[#111111] border border-[#181818] transition-all flex flex-col cursor-pointer hover:border-[#ff2222]/40"
                          >
                            <div class="relative w-full aspect-square rounded overflow-hidden bg-[#141414] mb-2 border border-[#222222]">
                              <Show
                                when={pl.thumbnail_url}
                                fallback={
                                  <div class="w-full h-full flex items-center justify-center text-[#555555]">
                                    <ListMusic class="w-8 h-8" />
                                  </div>
                                }
                              >
                                <img
                                  src={getHighResThumbnail(pl.thumbnail_url)}
                                  alt={pl.title}
                                  loading="lazy"
                                  decoding="async"
                                  class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              </Show>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playerStore.selectChartPlaylist(pl.id, true);
                                }}
                                title="Play Playlist"
                                class="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-[#ff2222] hover:bg-[#e01a1a] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              >
                                <Play class="w-3 h-3 fill-white ml-0.5" />
                              </button>
                            </div>
                            <h4 class="font-bold text-white text-xs truncate group-hover:text-[#ff2222] transition-colors">
                              {pl.title}
                            </h4>
                            <p class="text-[10px] text-[#888888] truncate mt-0.5">
                              {pl.subtitle || "Playlist"}
                            </p>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
};
