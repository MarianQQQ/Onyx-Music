import { Component, For, Show, createSignal } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { formatDuration, Track, getCleanArtist, cleanTrack, getHighResThumbnail } from "../../models/track";
import {
  ArrowLeft,
  Play,
  Shuffle,
  Heart,
  Plus,
  Loader2,
  Music2,
  Disc3,
  Users,
  Bell,
} from "lucide-solid";
import { TrackRowPlayCell } from "../player/PlayingIndicator";

type SortField = "default" | "title" | "artist" | "views" | "duration";

export const ArtistView: Component = () => {
  const profile = () => playerStore.artistProfile();
  const [sortField, setSortField] = createSignal<SortField>("default");
  const [sortAsc, setSortAsc] = createSignal<boolean>(true);

  const parseViewsToNumber = (viewsStr?: string): number => {
    if (!viewsStr) return 0;
    const cleaned = viewsStr.toLowerCase().replace(/,/g, "").trim();
    const match = cleaned.match(/([\d.]+)\s*([kmbмлрдтис]+)?/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    if (isNaN(num)) return 0;
    const unit = match[2] || "";
    if (unit.startsWith("b") || unit.startsWith("млрд")) return num * 1_000_000_000;
    if (unit.startsWith("m") || unit.startsWith("млн")) return num * 1_000_000;
    if (unit.startsWith("k") || unit.startsWith("тис")) return num * 1_000;
    return num;
  };

  const sortedSongs = () => {
    const songs = profile()?.top_songs || [];
    const field = sortField();
    if (field === "default") return songs;

    const asc = sortAsc();
    return [...songs].sort((a, b) => {
      let cmp = 0;
      if (field === "title") {
        cmp = cleanTrack(a).title.localeCompare(cleanTrack(b).title);
      } else if (field === "artist") {
        cmp = getCleanArtist(a).localeCompare(getCleanArtist(b));
      } else if (field === "views") {
        cmp = parseViewsToNumber(a.views) - parseViewsToNumber(b.views);
      } else if (field === "duration") {
        cmp = (a.duration_seconds || 0) - (b.duration_seconds || 0);
      }
      return asc ? cmp : -cmp;
    });
  };

  const toggleSort = (field: SortField) => {
    if (sortField() === field) {
      const isInitialDir = sortAsc() === (field === "views" || field === "duration" ? false : true);
      if (isInitialDir) {
        setSortAsc(field === "views" || field === "duration" ? true : false);
      } else {
        setSortField("default");
        setSortAsc(true);
      }
    } else {
      setSortField(field);
      setSortAsc(field === "views" || field === "duration" ? false : true);
    }
  };

  const isSubscribed = () => {
    const p = profile();
    if (!p) return false;
    return (
      playerStore.subscribedArtistIds().has(p.id) ||
      (p.channel_id ? playerStore.subscribedArtistIds().has(p.channel_id) : false) ||
      !!p.subscribed
    );
  };

  const handlePlayTopSongs = (shuffle: boolean = false) => {
    const songs = sortedSongs();
    if (songs.length > 0) {
      const list = shuffle ? [...songs].sort(() => Math.random() - 0.5) : songs;
      playerStore.setPlaybackContext(list.map(cleanTrack), profile()?.name || "Artist");
      playerStore.playTrack(cleanTrack(list[0]));
    }
  };

  const handlePlaySong = (track: Track, _index?: number) => {
    const songs = sortedSongs();
    if (songs.length > 0) {
      playerStore.setPlaybackContext(songs.map(cleanTrack), profile()?.name || "Artist");
    }
    playerStore.playTrack(cleanTrack(track));
  };

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  return (
    <div class="h-full overflow-y-auto bg-[#000000] select-none text-xs font-mono">
      {/* Top Navigation Bar */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        class="sticky top-0 z-30 bg-[#000000] px-5 py-2.5 border-b border-[#181818] flex items-center gap-3"
      >
        <button
          onClick={() => playerStore.closeArtist()}
          class="px-2 py-0.5 rounded bg-[#0a0a0a] hover:bg-[#111111] text-[#888888] hover:text-white border border-[#222222] flex items-center gap-1.5 transition-colors text-xs font-mono cursor-pointer"
        >
          <ArrowLeft class="w-3 h-3" />
          <span>Back</span>
        </button>
        <span data-tauri-drag-region class="text-[#444444] font-mono text-[11px]">&bull;</span>
        <span data-tauri-drag-region class="text-white font-medium truncate">{profile()?.name || "Artist Profile"}</span>
      </div>

      {/* Loading state */}
      <Show when={playerStore.isArtistLoading()}>
        <div class="py-28 flex flex-col items-center justify-center text-[#888888] gap-2">
          <Loader2 class="w-5 h-5 animate-spin text-[#ff2222]" />
          <span class="text-xs font-mono">Loading artist profile from YouTube Music...</span>
        </div>
      </Show>

      {/* Profile Content */}
      <Show when={!playerStore.isArtistLoading() && profile()}>
        <div class="p-5 space-y-7 w-full max-w-full">
          {/* 1. Hero Header Banner */}
          <div class="relative rounded overflow-hidden bg-[#050505] border border-[#181818] p-5 md:p-6 flex flex-col md:flex-row items-center md:items-end justify-between gap-5">
            <div class="flex items-center gap-5 z-10">
              {/* Circular Avatar */}
              <div class="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden bg-[#111111] border-2 border-[#ff2222] shrink-0">
                <Show
                  when={profile()?.thumbnail_url}
                  fallback={
                    <div class="w-full h-full flex items-center justify-center text-[#555555]">
                      <Users class="w-8 h-8" />
                    </div>
                  }
                >
                  <img
                    src={getHighResThumbnail(profile()!.thumbnail_url, 400)}
                    alt={profile()!.name}
                    loading="lazy"
                    decoding="async"
                    class="w-full h-full object-cover"
                  />
                </Show>
              </div>

              {/* Artist Info */}
              <div class="space-y-1">
                <Show
                  when={profile()?.is_channel}
                  fallback={
                    <span class="text-[10px] font-mono uppercase tracking-wider text-[#ff2222] font-semibold px-2 py-0.5 rounded bg-[#140505] border border-[#ff2222]/30 inline-block">
                      Official Artist
                    </span>
                  }
                >
                  <span class="text-[10px] font-mono uppercase tracking-wider text-[#ff2222] font-semibold px-2 py-0.5 rounded bg-[#140505] border border-[#ff2222]/30 inline-block">
                    YouTube Channel
                  </span>
                </Show>
                <h1 class="text-xl md:text-3xl font-bold text-white tracking-tight">
                  {profile()!.name}
                </h1>
                <Show when={profile()!.audience}>
                  <p class="text-xs text-[#888888]">
                    {profile()!.audience} monthly audience
                  </p>
                </Show>
                <Show when={profile()!.description}>
                  <p class="text-[11px] text-[#777777] max-w-2xl line-clamp-2 leading-relaxed">
                    {profile()!.description}
                  </p>
                </Show>

                {/* Buttons */}
                <div class="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => handlePlayTopSongs(false)}
                    class="px-3 py-1 rounded bg-[#ff2222] hover:bg-[#e01a1a] text-white font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play class="w-3 h-3 fill-white" />
                    <span>Play Top Songs</span>
                  </button>

                  <button
                    onClick={() => handlePlayTopSongs(true)}
                    class="px-2.5 py-1 rounded bg-[#0a0a0a] hover:bg-[#140505] text-[#888888] hover:text-[#ff2222] border border-[#222222] text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Shuffle class="w-3 h-3 text-[#ff2222]" />
                    <span>Shuffle</span>
                  </button>

                  {/* Subscribe / Follow Button */}
                  <button
                    onClick={() => {
                      const prof = profile();
                      if (prof) playerStore.toggleSubscribeArtist(prof);
                    }}
                    class={`px-3 py-1 rounded font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isSubscribed()
                        ? "bg-[#0a0a0a] hover:bg-[#140505] text-[#888888] border border-[#222222]"
                        : "bg-[#ff2222] hover:bg-[#e01a1a] text-white"
                    }`}
                  >
                    <Bell class={`w-3 h-3 ${isSubscribed() ? "text-[#ff2222] fill-[#ff2222]" : "text-white fill-white"}`} />
                    <span>
                      {isSubscribed()
                        ? "Subscribed"
                        : profile()?.subscriber_count
                        ? `Subscribe ${profile()!.subscriber_count}`
                        : "Subscribe"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Top Songs */}
          <Show when={profile()!.top_songs.length > 0}>
            <div>
              <div class="flex items-center justify-between mb-2.5 border-b border-[#181818] pb-1.5">
                <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Music2 class="w-3.5 h-3.5 text-[#ff2222]" />
                  <span>{profile()?.is_channel ? "Uploaded Videos & Songs" : "Top Songs"}</span>
                </h3>
                <div class="flex items-center gap-2">
                  <Show when={sortField() !== "default"}>
                    <button
                      onClick={() => { setSortField("default"); setSortAsc(true); }}
                      class="text-[10px] text-[#ff2222] hover:underline cursor-pointer font-mono"
                    >
                      [Reset Order]
                    </button>
                  </Show>
                  <span class="text-[11px] text-[#888888] font-mono">
                    {profile()!.top_songs.length} tracks
                  </span>
                </div>
              </div>

              <div class="border border-[#181818] rounded bg-[#050505] w-full">
                {/* Column Headers with Interactive Sorting */}
                <div class="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0a0a0a] border-b border-[#181818] text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
                  <span
                    onClick={() => { setSortField("default"); setSortAsc(true); }}
                    class="col-span-1 text-center cursor-pointer hover:text-white transition-colors"
                    title="Reset to default order"
                  >
                    # {sortField() === "default" ? "•" : ""}
                  </span>
                  <span
                    onClick={() => toggleSort("title")}
                    class="col-span-4 cursor-pointer hover:text-white transition-colors flex items-center gap-1 select-none"
                    title="Sort by Title (A-Z / Z-A)"
                  >
                    <span>TITLE</span>
                    <Show when={sortField() === "title"}>
                      <span class="text-[#ff2222] font-bold">{sortAsc() ? "▲" : "▼"}</span>
                    </Show>
                  </span>
                  <span
                    onClick={() => toggleSort("artist")}
                    class="col-span-3 cursor-pointer hover:text-white transition-colors flex items-center gap-1 select-none"
                    title="Sort by Artist (A-Z / Z-A)"
                  >
                    <span>ARTIST</span>
                    <Show when={sortField() === "artist"}>
                      <span class="text-[#ff2222] font-bold">{sortAsc() ? "▲" : "▼"}</span>
                    </Show>
                  </span>
                  <span
                    onClick={() => toggleSort("views")}
                    class="col-span-2 text-right cursor-pointer hover:text-white transition-colors flex items-center justify-end gap-1 select-none"
                    title="Sort by Plays / Views"
                  >
                    <span>PLAYS / VIEWS</span>
                    <Show when={sortField() === "views"}>
                      <span class="text-[#ff2222] font-bold">{sortAsc() ? "▲" : "▼"}</span>
                    </Show>
                  </span>
                  <span
                    onClick={() => toggleSort("duration")}
                    class="col-span-2 text-right cursor-pointer hover:text-white transition-colors flex items-center justify-end gap-1 select-none pr-1"
                    title="Sort by Duration"
                  >
                    <span>TIME</span>
                    <Show when={sortField() === "duration"}>
                      <span class="text-[#ff2222] font-bold">{sortAsc() ? "▲" : "▼"}</span>
                    </Show>
                  </span>
                </div>

                <div class="divide-y divide-[#141414]">
                  <For each={sortedSongs()}>
                    {(track, index) => {
                      const isCurrent = () => playerStore.currentTrack()?.id === track.id;
                      const isLiked = () => playerStore.likedTrackIds().has(track.id);

                      return (
                        <div
                          onClick={() => handlePlaySong(track, index())}
                          class={`grid grid-cols-12 gap-2 items-center px-3 py-2 group text-xs transition-colors hover:bg-[#0c0c0c] cursor-pointer ${
                            isCurrent() ? "bg-[#140505] text-white border-l-2 border-l-[#ff2222]" : "text-[#cccccc]"
                          }`}
                        >
                          {/* Equalizer / Play-Pause & index */}
                          <div class="col-span-1 text-center font-mono text-[11px] text-[#555555] flex items-center justify-center">
                            <TrackRowPlayCell trackId={track.id} index={index() + 1} accentColor="red" />
                          </div>

                          {/* Thumbnail & Title */}
                          <div class="col-span-4 flex items-center gap-2.5 min-w-0">
                            <div class="w-7 h-7 rounded bg-[#111111] overflow-hidden shrink-0 border border-[#1e1e1e]">
                              <Show
                                when={track.thumbnail_url}
                                fallback={
                                  <div class="w-full h-full flex items-center justify-center text-[#555555]">
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
                              {cleanTrack(track).title}
                            </span>
                          </div>

                          {/* Artist */}
                          <div class="col-span-3 truncate text-[#888888] text-[11px]">
                            <span
                              class="cursor-pointer hover:underline hover:text-[#ff2222] transition-colors"
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

                          {/* Plays / Views */}
                          <div class="col-span-2 text-right truncate text-[11px] font-mono text-[#777777]">
                            {track.views || "—"}
                          </div>

                          {/* Duration & Actions */}
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
                                playerStore.addToQueue(track);
                              }}
                              title="Add to queue"
                              class="p-1 text-[#555555] hover:text-[#ff2222] hover:bg-[#140505] rounded cursor-pointer"
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
                </div>
              </div>
            </div>
          </Show>

          {/* 3. Albums & Singles */}
          <Show when={profile()!.albums.length > 0}>
            <div>
              <div class="flex items-center justify-between mb-2.5 border-b border-[#181818] pb-1.5">
                <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Disc3 class="w-3.5 h-3.5 text-[#ff2222]" />
                  <span>Albums &amp; Singles</span>
                </h3>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <For each={profile()!.albums}>
                  {(album) => (
                    <div
                      onClick={() =>
                        playerStore.openPlaylist(
                          album.id,
                          album.title,
                          album.thumbnail_url,
                          album.year
                        )
                      }
                      class="p-2.5 rounded bg-[#0a0a0a] border border-[#181818] hover:border-[#ff2222]/40 hover:bg-[#111111] cursor-pointer transition-all group flex flex-col"
                    >
                      <div class="w-full aspect-square rounded overflow-hidden bg-[#141414] mb-2 border border-[#222222]">
                        <Show
                          when={album.thumbnail_url}
                          fallback={
                            <div class="w-full h-full flex items-center justify-center text-[#555555]">
                              <Disc3 class="w-6 h-6" />
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
                      </div>
                      <h4 class="text-xs font-semibold text-white truncate group-hover:text-[#ff2222] transition-colors">
                        {album.title}
                      </h4>
                      <Show when={album.year}>
                        <p class="text-[10px] text-[#888888] truncate mt-0.5">
                          {album.year}
                        </p>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* 4. Fans Might Also Like (Related Artists) */}
          <Show when={profile()!.related_artists.length > 0}>
            <div>
              <div class="flex items-center justify-between mb-2.5 border-b border-[#181818] pb-1.5">
                <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Users class="w-3.5 h-3.5 text-[#ff2222]" />
                  <span>Fans Might Also Like</span>
                </h3>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <For each={profile()!.related_artists}>
                  {(artist) => (
                    <div
                      onClick={() => playerStore.openArtist(artist.id)}
                      class="p-2.5 rounded bg-[#0a0a0a] border border-[#181818] hover:border-[#ff2222]/40 hover:bg-[#111111] cursor-pointer transition-all group flex flex-col items-center text-center"
                    >
                      <div class="w-20 h-20 rounded-full overflow-hidden bg-[#141414] mb-2 border border-[#222222]">
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
                            class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </Show>
                      </div>
                      <h4 class="text-xs font-semibold text-white truncate w-full group-hover:text-[#ff2222] transition-colors">
                        {artist.name}
                      </h4>
                      <Show when={artist.subscribers}>
                        <p class="text-[10px] text-[#888888] truncate mt-0.5">
                          {artist.subscribers}
                        </p>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Empty fallback */}
          <Show when={profile()!.top_songs.length === 0 && profile()!.albums.length === 0}>
            <div class="py-16 text-center text-[#888888] bg-[#050505] border border-[#181818] rounded">
              <Music2 class="w-8 h-8 mx-auto mb-2 opacity-40 text-[#ff2222]" />
              <p class="text-xs font-semibold text-[#888888]">No songs or releases found for this artist.</p>
              <p class="text-[11px] text-[#555555] mt-0.5">Try searching directly by name in the Search tab.</p>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
