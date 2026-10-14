import { Component, createSignal, onMount, onCleanup, Show } from "solid-js";

interface SplashScreenProps {
  onFinish?: () => void;
}

export const SplashScreen: Component<SplashScreenProps> = (props) => {
  const [progress, setProgress] = createSignal(0);
  const [isFading, setIsFading] = createSignal(false);
  const [isDismissed, setIsDismissed] = createSignal(false);

  let finished = false;

  const dismiss = () => {
    if (finished) return;
    finished = true;
    setIsFading(true);
    setTimeout(() => {
      setIsDismissed(true);
      props.onFinish?.();
    }, 150);
  };

  onMount(() => {
    const handleKeyDown = () => {
      dismiss();
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });

    const startTime = performance.now();
    const duration = 550; // Progress completes in 550ms

    const frame = () => {
      if (finished) return;
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      if (pct < 100) {
        requestAnimationFrame(frame);
      } else {
        setTimeout(() => {
          if (!finished) {
            dismiss();
          }
        }, 100);
      }
    };

    requestAnimationFrame(frame);
  });

  return (
    <Show when={!isDismissed()}>
      <div
        onClick={dismiss}
        class={`fixed inset-0 z-100 bg-[#000000] text-white flex flex-col items-center justify-center select-none cursor-pointer transition-opacity duration-200 ${
          isFading() ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <div class="flex flex-col items-center gap-3">
          {/* Logo / Title */}
          <div class="flex items-center">
            <span class="text-[#ff2222] mr-2 text-sm leading-none">●</span>
            <span class="font-bold text-white tracking-widest text-sm font-mono">Onyx</span>
          </div>

          {/* Minimalist 2px loading bar */}
          <div class="w-48 h-[2px] bg-[#181818] overflow-hidden rounded-full">
            <div
              class="h-full bg-[#ff2222] transition-all duration-75 ease-out"
              style={{ width: `${progress()}%` }}
            />
          </div>

          {/* Monospace subtitle */}
          <span class="font-mono text-[10px] tracking-widest text-[#555555] uppercase">
            STARTING...
          </span>
        </div>
      </div>
    </Show>
  );
};
