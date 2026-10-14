import { Component, Show, createSignal } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { pluginManager } from "../../services/pluginManager";
import { formatDuration, getCleanArtist, cleanTrack } from "../../models/track";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Volume1,
  Heart,
  ListMusic,
  Loader2,
  Music2,
  Radio,
  Plus,
  ChevronUp,
  ChevronDown,
} from "lucide-solid";

interface PlayerBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  previousTab?: string;
}

export const PlayerBar: Component<PlayerBarProps> = (props) => {
  const current = () => playerStore.currentTrack();
  const isLiked = () => (current() ? playerStore.likedTrackIds().has(current()!.id) : false);
  const isNowPlayingOpen = () => props.activeTab === "now-playing";

  const toggleNowPlaying = () => {
    if (!current()) return;
    if (props.activeTab === "now-playing") {
      props.setActiveTab(props.previousTab || "home");
    } else {
      props.setActiveTab("now-playing");
    }
  };

  const [isDragging, setIsDragging] = createSignal(false);
  const [dragTime, setDragTime] = createSignal(0);

  const displayTime = () => (isDragging() ? dragTime() : playerStore.currentTime());

  const progressPct = () => {
    const dur = playerStore.duration();
    if (!dur || dur <= 0) return 0;
    return Math.min(100, Math.max(0, (displayTime() / dur) * 100));
  };

  const volumePct = () => {
    if (playerStore.isMuted()) return 0;
    return Math.min(100, Math.max(0, playerStore.volume() * 100));
  };

  const handleSeekInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const val = Number(e.currentTarget.value);
    setIsDragging(true);
    playerStore.setScrubbing(true);
    setDragTime(val);
  };

  const handleSeekCommit = (e: Event & { currentTarget: HTMLInputElement }) => {
    const val = isDragging() ? dragTime() : Number(e.currentTarget.value);
    playerStore.seek(val);
    setIsDragging(false);
    playerStore.setScrubbing(false);
    e.currentTarget.blur();
  };

  const handleVolumeChange = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const val = Number(e.currentTarget.value);
    playerStore.changeVolume(val);
  };

  const VolumeIcon = () => {
    if (playerStore.isMuted() || playerStore.volume() === 0) return VolumeX;
    if (playerStore.volume() < 0.5) return Volume1;
    return Volume2;
  };

  return (
    <footer class="relative overflow-hidden h-20 bg-[#0a0a0a] border-t border-[#181818] px-5 flex items-center justify-between select-none z-30 text-xs font-mono shrink-0">
      {/* Ambient Cover Glow Plugin Layer */}
      <Show when={pluginManager.isEnabled("ambient-glow") && current()?.thumbnail_url}>
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#1a0505] via-[#0a0a0a] to-[#0a0a0a]" />
      </Show>

      {/* 1. Track Info (Left) */}
      <div class="relative z-10 flex items-center gap-3.5 w-84 shrink-0 min-w-0">
        <div
          onClick={toggleNowPlaying}
          title="Open Now Playing View (Up Next • Lyrics • Similar)"
          class={`relative w-12 h-12 rounded bg-[#111111] shrink-0 overflow-hidden border transition-colors group ${
            current()
              ? isNowPlayingOpen()
                ? "border-[#ff2222] cursor-pointer"
                : "border-[#222222] hover:border-[#ff2222] cursor-pointer"
              : "border-[#222222]"
          }`}
        >
          <Show
            when={current()?.thumbnail_url}
            fallback={
              <div class="w-full h-full flex items-center justify-center text-[#555555]">
                <Music2 class="w-5 h-5" />
              </div>
            }
          >
            <img
              src={current()!.thumbnail_url}
              alt={current()!.title}
              loading="lazy"
              decoding="async"
              class="w-full h-full object-cover"
            />
          </Show>
          <Show when={current()}>
            <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Show
                when={isNowPlayingOpen()}
                fallback={<ChevronUp class="w-4.5 h-4.5 text-white" />}
              >
                <ChevronDown class="w-4.5 h-4.5 text-[#ff2222]" />
              </Show>
            </div>
          </Show>
        </div>

        <div class="min-w-0 flex-1">
          <Show
            when={current()}
            fallback={
              <div class="text-xs text-[#555555]">Onyx ready</div>
            }
          >
            <div
              onClick={toggleNowPlaying}
              title="Open Now Playing View (Up Next • Lyrics • Similar)"
              class="flex items-center gap-1.5 min-w-0 cursor-pointer group"
            >
              <span class="text-[#ff2222] text-xs font-bold shrink-0">▶</span>
              <h4 class="text-sm font-bold text-white group-hover:text-[#ff2222] transition-colors truncate">
                {cleanTrack(current()!).title}
              </h4>
            </div>
            <p
              onClick={() => {
                const target = current()?.artist_id || getCleanArtist(current()!);
                if (target) {
                  playerStore.openArtist(target);
                }
              }}
              class="text-xs truncate mt-0.5 text-[#888888] hover:text-[#ff2222] hover:underline cursor-pointer"
              title="Open artist profile"
            >
              {getCleanArtist(current()!)}
            </p>
          </Show>
        </div>

        <Show when={current()}>
          <div class="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                playerStore.toggleLike(current()!);
              }}
              class={`p-1.5 transition-colors cursor-pointer ${
                isLiked() ? "text-[#ff2222] fill-[#ff2222]" : "text-[#555555] hover:text-[#cccccc]"
              }`}
              title={isLiked() ? "Unlike" : "Like"}
            >
              <Heart class={`w-4 h-4 ${isLiked() ? "fill-[#ff2222]" : ""}`} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                playerStore.addToQueue(current()!);
              }}
              class="p-1.5 transition-colors cursor-pointer text-[#555555] hover:text-[#ff2222]"
              title="Add to queue"
            >
              <Plus class="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                playerStore.startSongRadio(current()!);
                playerStore.setNowPlayingSubTab("similar");
                if (props.activeTab !== "now-playing") {
                  props.setActiveTab("now-playing");
                }
              }}
              class={`p-1.5 transition-colors cursor-pointer ${
                isNowPlayingOpen() && playerStore.nowPlayingSubTab() === "similar"
                  ? "text-[#ff2222]"
                  : "text-[#555555] hover:text-[#ff2222]"
              }`}
              title="Start Song Radio (Similar Tracks)"
            >
              <Radio class="w-4 h-4" />
            </button>
          </div>
        </Show>
      </div>

      {/* 2. Controls & Progress (Center) */}
      <div class="relative z-10 flex flex-col items-center flex-1 max-w-2xl px-4 mx-auto">
        {/* Buttons */}
        <div class="flex items-center gap-4 mb-1">
          {/* Shuffle */}
          <button
            onClick={() => playerStore.toggleShuffle()}
            title="Fisher-Yates Shuffle"
            class={`p-1 transition-colors cursor-pointer text-xs ${
              playerStore.isShuffled()
                ? "text-[#ff2222] font-bold"
                : "text-[#666666] hover:text-white"
            }`}
          >
            <Shuffle class="w-4 h-4" />
          </button>

          {/* Previous */}
          <button
            onClick={() => playerStore.playPrevious()}
            class="p-1 text-[#888888] hover:text-white transition-colors cursor-pointer"
          >
            <SkipBack class="w-4.5 h-4.5 fill-current" />
          </button>

          {/* Play / Pause Button */}
          <button
            onClick={() => playerStore.togglePlay()}
            disabled={playerStore.isLoading()}
            class="w-10 h-10 rounded-full bg-[#ff2222] hover:bg-[#e01a1a] text-white flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Show
              when={playerStore.isLoading()}
              fallback={
                <Show
                  when={playerStore.isPlaying()}
                  fallback={<Play class="w-4.5 h-4.5 fill-white ml-0.5" />}
                >
                  <Pause class="w-4.5 h-4.5 fill-white" />
                </Show>
              }
            >
              <Loader2 class="w-4.5 h-4.5 animate-spin text-white" />
            </Show>
          </button>

          {/* Next */}
          <button
            onClick={() => playerStore.playNext()}
            class="p-1 text-[#888888] hover:text-white transition-colors cursor-pointer"
          >
            <SkipForward class="w-4.5 h-4.5 fill-current" />
          </button>

          {/* Repeat */}
          <button
            onClick={() => playerStore.toggleRepeat()}
            class={`p-1 transition-colors cursor-pointer text-xs ${
              playerStore.repeatMode() !== "off"
                ? "text-[#ff2222] font-bold"
                : "text-[#666666] hover:text-white"
            }`}
          >
            <Show
              when={playerStore.repeatMode() === "one"}
              fallback={<Repeat class="w-4 h-4" />}
            >
              <Repeat1 class="w-4 h-4" />
            </Show>
          </button>
        </div>

        {/* Progress Bar (Bold Solid Red Scrubber) */}
        <div class="flex items-center gap-3 w-full text-xs font-mono text-[#777777]">
          <span class="w-9 text-right shrink-0">
            {formatDuration(displayTime())}
          </span>
          <div class="relative flex-1 flex items-center group">
            <input
              type="range"
              min="0"
              max={playerStore.duration() || 1}
              step="0.1"
              value={displayTime()}
              onMouseDown={(e) => {
                setIsDragging(true);
                playerStore.setScrubbing(true);
                setDragTime(Number(e.currentTarget.value));
              }}
              onInput={handleSeekInput}
              onChange={handleSeekCommit}
              onMouseUp={handleSeekCommit}
              style={{
                background: `linear-gradient(to right, #ff2222 ${progressPct()}%, #222222 ${progressPct()}%)`,
              }}
              class="w-full h-1.5 bg-[#222222] rounded-none appearance-none cursor-pointer accent-[#ff2222] hover:accent-[#ff3b30] transition-all outline-none focus:outline-none focus:ring-0 border-none"
            />
          </div>
          <span class="w-8 text-left shrink-0">
            {formatDuration(playerStore.duration())}
          </span>
        </div>
      </div>

      {/* 3. Extras & Volume (Right) */}
      <div class="relative z-10 flex items-center justify-end gap-3 w-80 shrink-0 font-mono text-xs">
        {/* Queue / Now Playing Split View Button */}
        <button
          onClick={() => {
            if (props.activeTab === "now-playing" && playerStore.nowPlayingSubTab() === "upnext") {
              props.setActiveTab(props.previousTab || "home");
            } else {
              playerStore.setNowPlayingSubTab("upnext");
              props.setActiveTab("now-playing");
            }
          }}
          title={
            props.activeTab === "now-playing"
              ? "Close Now Playing View"
              : "Open Now Playing (Up Next • Lyrics • Similar)"
          }
          class={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer ${
            props.activeTab === "now-playing"
              ? "text-[#ff2222] font-bold"
              : "text-[#888888] hover:text-white"
          }`}
        >
          <ListMusic class="w-4 h-4" />
          <span class="text-xs font-mono font-medium">{playerStore.queue().length}</span>
        </button>

        {/* Volume with % display */}
        <div
          class="flex items-center gap-2"
          onWheel={(e) => {
            e.preventDefault();
            const step = playerStore.volumeStep() / 100;
            const delta = e.deltaY < 0 ? step : -step;
            const nextVol = Math.round((playerStore.volume() + delta) * 100) / 100;
            playerStore.changeVolume(Math.max(0, Math.min(1, nextVol)));
          }}
          title="Scroll to change volume"
        >
          <button
            onClick={() => playerStore.toggleMute()}
            class="text-[#888888] hover:text-white transition-colors p-1 cursor-pointer"
          >
            {(() => {
              const Icon = VolumeIcon();
              return <Icon class="w-4 h-4" />;
            })()}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={playerStore.isMuted() ? 0 : playerStore.volume()}
            onInput={handleVolumeChange}
            onMouseUp={(e) => e.currentTarget.blur()}
            style={{
              background: `linear-gradient(to right, #ff2222 ${volumePct()}%, #222222 ${volumePct()}%)`,
            }}
            class="w-18 h-1.5 bg-[#222222] rounded-none appearance-none cursor-pointer accent-[#ff2222] outline-none focus:outline-none focus:ring-0 border-none"
          />
          <span class="text-xs text-[#777777] w-8 text-right font-mono">
            {playerStore.isMuted() ? "off" : `${Math.round(playerStore.volume() * 100)}%`}
          </span>
        </div>
      </div>
    </footer>
  );
};
