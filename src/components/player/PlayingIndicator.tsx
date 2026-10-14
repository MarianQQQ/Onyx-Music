import { Component, Show } from "solid-js";
import { Play, Pause } from "lucide-solid";
import { playerStore } from "../../stores/playerStore";

export const EqualizerBars: Component<{ colorClass?: string }> = (props) => {
  const barColor = () => props.colorClass || "bg-red-500";
  return (
    <div class="flex items-end justify-center gap-[2.5px] h-4 w-4">
      <span class={`w-[3px] rounded-full ${barColor()} animate-eq-1`} />
      <span class={`w-[3px] rounded-full ${barColor()} animate-eq-2`} />
      <span class={`w-[3px] rounded-full ${barColor()} animate-eq-3`} />
    </div>
  );
};

export const TrackThumbnailOverlay: Component<{
  trackId: string;
  accentColor?: "red" | "emerald" | "amber";
}> = (props) => {
  const isCurrent = () => playerStore.currentTrack()?.id === props.trackId;
  const isPlaying = () => isCurrent() && playerStore.isPlaying();

  const barColor = () => {
    if (props.accentColor === "emerald") return "bg-emerald-400";
    if (props.accentColor === "amber") return "bg-amber-400";
    return "bg-red-400";
  };

  return (
    <div
      class={`absolute inset-0 flex items-center justify-center transition-opacity ${
        isCurrent()
          ? "bg-black/60 opacity-100"
          : "bg-black/45 opacity-0 group-hover:opacity-100"
      }`}
    >
      <Show
        when={isCurrent()}
        fallback={<Play class="w-4 h-4 fill-white text-white translate-x-[0.5px]" />}
      >
        <Show
          when={isPlaying()}
          fallback={<Play class="w-4 h-4 fill-white text-white translate-x-[0.5px]" />}
        >
          {/* Show animated equalizer when not hovered, and Pause icon when hovered */}
          <div class="group-hover:hidden flex items-center justify-center">
            <EqualizerBars colorClass={barColor()} />
          </div>
          <div class="hidden group-hover:flex items-center justify-center">
            <Pause class="w-4 h-4 fill-white text-white" />
          </div>
        </Show>
      </Show>
    </div>
  );
};

export const TrackRowPlayCell: Component<{
  trackId: string;
  index: number;
  accentColor?: "red" | "emerald" | "amber";
}> = (props) => {
  const isCurrent = () => playerStore.currentTrack()?.id === props.trackId;
  const isPlaying = () => isCurrent() && playerStore.isPlaying();

  const barColor = () => {
    if (props.accentColor === "emerald") return "bg-emerald-400";
    if (props.accentColor === "amber") return "bg-amber-400";
    return "bg-[#ff2222]";
  };

  return (
    <div class="flex items-center justify-center w-full h-full font-mono">
      <Show
        when={isCurrent()}
        fallback={
          <>
            <span
              class={`group-hover:hidden font-mono text-[11px] font-medium ${
                props.index <= 3 ? "text-white" : "text-[#666666]"
              }`}
            >
              {props.index}
            </span>
            <Play class="w-3.5 h-3.5 fill-white text-white hidden group-hover:block translate-x-[0.5px]" />
          </>
        }
      >
        <Show
          when={isPlaying()}
          fallback={<span class="text-[#ff2222] font-bold text-xs">▶</span>}
        >
          <div class="group-hover:hidden flex items-center justify-center">
            <EqualizerBars colorClass={barColor()} />
          </div>
          <Pause class="w-3.5 h-3.5 fill-white text-white hidden group-hover:block" />
        </Show>
      </Show>
    </div>
  );
};
