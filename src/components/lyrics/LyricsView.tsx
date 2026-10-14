import { Component, createEffect, For, Show } from "solid-js";
import { playerStore } from "../../stores/playerStore";
import { Mic2, Music2 } from "lucide-solid";

export const LyricsView: Component = () => {
  let containerRef: HTMLDivElement | undefined;
  let lastScrolledIdx = -1;
  let lastTrackId = "";

  createEffect(() => {
    const curIdx = playerStore.currentLyricIndex();
    const trackId = playerStore.currentTrack()?.id;
    if (trackId !== lastTrackId) {
      lastTrackId = trackId || "";
      lastScrolledIdx = -1;
    }
    if (curIdx >= 0 && curIdx !== lastScrolledIdx && containerRef) {
      lastScrolledIdx = curIdx;
      const activeEl = containerRef.querySelector(`[data-line-idx="${curIdx}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  });

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  return (
    <div class="h-full flex flex-col p-5 overflow-hidden bg-[#000000] font-mono text-xs select-none">
      {/* Header */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        class="pb-3 border-b border-[#181818] mb-2 flex items-center justify-between gap-2"
      >
        <div data-tauri-drag-region class="min-w-0">
          <h2 data-tauri-drag-region class="text-base font-bold text-white flex items-center gap-2">
            <Mic2 class="w-4 h-4 text-[#ff2222] pointer-events-none" />
            <span data-tauri-drag-region>Synced Lyrics</span>
          </h2>
          <Show when={playerStore.currentTrack()}>
            <p data-tauri-drag-region class="text-[11px] text-[#888888] mt-0.5 truncate">
              {playerStore.currentTrack()?.title} &bull; {playerStore.currentTrack()?.artist}
            </p>
          </Show>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Show when={playerStore.lyrics()?.lines && playerStore.lyrics()!.lines.length > 0}>
            <div class="flex items-center gap-1.5 text-[10px] font-mono">
              <span
                class="px-2 py-0.5 rounded bg-[#111111] border border-[#222222] text-[#aaaaaa]"
                title="Current lyric offset (audio - lyrics)"
              >
                Offset: {playerStore.lyricOffset() > 0 ? "+" : ""}{playerStore.lyricOffset().toFixed(1)}s
              </span>
              <button
                onClick={() => playerStore.adjustLyricOffset(-0.5)}
                class="px-1.5 py-0.5 rounded bg-[#141414] hover:bg-[#222222] border border-[#282828] text-[#888888] hover:text-white transition-colors cursor-pointer"
                title="Offset lyrics -0.5s"
              >
                -0.5s
              </button>
              <button
                onClick={() => playerStore.adjustLyricOffset(0.5)}
                class="px-1.5 py-0.5 rounded bg-[#141414] hover:bg-[#222222] border border-[#282828] text-[#888888] hover:text-white transition-colors cursor-pointer"
                title="Offset lyrics +0.5s"
              >
                +0.5s
              </button>
              <Show when={playerStore.lyricOffset() !== 0}>
                <button
                  onClick={() => playerStore.resetLyricOffset()}
                  class="px-1.5 py-0.5 rounded bg-[#140505] hover:bg-[#220808] border border-[#ff2222]/40 text-[#ff4444] hover:text-[#ff2222] transition-colors cursor-pointer"
                  title="Reset lyric offset"
                >
                  Reset
                </button>
              </Show>
            </div>
          </Show>
          <span data-tauri-drag-region class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0a0a0a] border border-[#222222] text-[#888888] pointer-events-none">
            LRCLIB
          </span>
        </div>
      </div>

      {/* Lyrics Content */}
      <div
        ref={containerRef}
        class="flex-1 overflow-y-auto pr-2 scroll-smooth py-6 select-none"
      >
        <Show
          when={playerStore.lyrics()?.lines && playerStore.lyrics()!.lines.length > 0}
          fallback={
            <Show
              when={playerStore.lyrics()?.plain_lyrics}
              fallback={
                <div class="py-20 text-center text-[#555555]">
                  <Music2 class="w-8 h-8 mx-auto mb-2 opacity-30 text-[#ff2222]" />
                  <p class="text-xs font-mono">No lyrics found for this song.</p>
                  <p class="text-[11px] text-[#444444] mt-0.5">
                    Synced lyrics stream automatically during playback.
                  </p>
                </div>
              }
            >
              <div class="max-w-xl mx-auto whitespace-pre-line text-[#cccccc] text-xs leading-relaxed text-center font-mono">
                {playerStore.lyrics()!.plain_lyrics}
              </div>
            </Show>
          }
        >
          <div class="max-w-xl mx-auto space-y-3">
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
                      class="opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161616] hover:bg-[#ff2222] hover:text-white text-[#888888] border border-[#2a2a2a] hover:border-[#ff2222] cursor-pointer"
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
  );
};
