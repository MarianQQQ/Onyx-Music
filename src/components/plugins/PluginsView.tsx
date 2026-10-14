import { Component, createSignal, Index, Show } from "solid-js";
import { pluginManager, scrobbleCount, YTMPlugin } from "../../services/pluginManager";
import { playerStore } from "../../stores/playerStore";
import { Puzzle, Sparkles, Settings } from "lucide-solid";
import { PluginSettingsModal } from "./PluginSettingsModal";

export const PluginsView: Component = () => {
  const [plugins, setPlugins] = createSignal<YTMPlugin[]>(
    pluginManager.getAllPlugins().map((p) => ({ ...p }))
  );
  const [selectedConfigPluginId, setSelectedConfigPluginId] = createSignal<string | null>(null);

  const handleToggle = async (pluginId: string) => {
    await pluginManager.togglePlugin(pluginId);
    // Guarantee fresh reactive object references for SolidJS
    setPlugins(pluginManager.getAllPlugins().map((p) => ({ ...p })));
  };

  const handleDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea, [data-no-drag]")) return;
    playerStore.startDraggingWindow();
  };

  const isConfigurable = (plugin: YTMPlugin) => {
    return (
      Boolean(plugin.hasSettings) ||
      plugin.id === "sponsorblock" ||
      plugin.id === "scrobbler" ||
      plugin.id === "discord-rich-presence" ||
      plugin.id === "desktop-notifications"
    );
  };

  return (
    <div class="h-full overflow-y-auto p-5 w-full text-xs bg-[#000000] font-mono select-none">
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        class="mb-4 pb-3 border-b border-[#181818] flex items-center justify-between"
      >
        <div data-tauri-drag-region>
          <h2 data-tauri-drag-region class="text-sm font-bold text-white flex items-center gap-2">
            <Puzzle class="w-4 h-4 text-[#ff2222] pointer-events-none" />
            <span data-tauri-drag-region>Plugin Ecosystem</span>
          </h2>
          <p data-tauri-drag-region class="text-[11px] text-[#888888] mt-0.5">
            Modular extension system for SponsorBlock skip segments, Last.fm scrobbling, Discord Rich Presence, and audio enhancement.
          </p>
        </div>

        <div data-tauri-drag-region class="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[#140505] border border-[#ff2222]/30 text-[11px] text-[#ff2222] font-medium pointer-events-none">
          <Sparkles class="w-3.5 h-3.5 text-[#ff2222]" />
          <span>{plugins().filter((p) => p.enabled).length} Active</span>
        </div>
      </div>

      {/* Responsive Grid for Fullscreen */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5 w-full">
        <Index each={plugins()}>
          {(plugin) => (
            <div class="p-3.5 rounded-sm bg-[#0a0a0a] border border-[#181818] hover:border-[#ff2222]/40 transition-colors flex items-center justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-xs font-semibold text-white truncate">{plugin().name}</h3>
                  <span class="text-[9px] font-mono px-1.5 py-0.5 rounded-none bg-[#141414] text-[#888888] border border-[#222222]">
                    v{plugin().version}
                  </span>
                  {plugin().author && (
                    <span class="text-[10px] text-[#888888] truncate">by {plugin().author}</span>
                  )}
                  <Show when={plugin().id === "scrobbler"}>
                    <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-none bg-[#140505] text-[#ff2222] border border-[#ff2222]/40">
                      {scrobbleCount()} Scrobbles
                    </span>
                  </Show>
                </div>
                <p class="text-[11px] text-[#888888] mt-1 leading-relaxed">
                  {plugin().description}
                </p>
              </div>

              {/* Controls: Settings Button + Retro switch button */}
              <div class="flex items-center gap-2.5 shrink-0">
                <Show when={isConfigurable(plugin())}>
                  <button
                    type="button"
                    onClick={() => setSelectedConfigPluginId(plugin().id)}
                    class="p-1.5 bg-[#121212] hover:bg-[#1f0a0a] border border-[#222222] hover:border-[#ff2222]/60 text-[#888888] hover:text-[#ff2222] transition-colors"
                    title={`Configure ${plugin().name}`}
                  >
                    <Settings class="w-3.5 h-3.5" />
                  </button>
                </Show>

                {/* Retro switch button */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={plugin().enabled}
                  onClick={() => handleToggle(plugin().id)}
                  class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border border-[#333333] transition-colors duration-150 ease-in-out focus:outline-none ${
                    plugin().enabled ? "bg-[#ff2222] border-[#ff2222]" : "bg-[#141414]"
                  }`}
                  title={plugin().enabled ? "Disable plugin" : "Enable plugin"}
                >
                  <span
                    class={`pointer-events-none inline-block h-3.5 w-3.5 transform bg-black shadow transition duration-150 ease-in-out mt-[2px] ml-[2px] ${
                      plugin().enabled ? "translate-x-4 bg-black" : "translate-x-0 bg-[#666666]"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </Index>
      </div>

      {/* Retro-red Plugin Settings Modal */}
      <Show when={selectedConfigPluginId()}>
        <PluginSettingsModal
          pluginId={selectedConfigPluginId()}
          onClose={() => setSelectedConfigPluginId(null)}
        />
      </Show>
    </div>
  );
};
