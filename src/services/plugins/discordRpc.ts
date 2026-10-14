export interface DiscordRpcSettings {
  showDetails: boolean;
  showState: boolean;
  showTimeRemaining: boolean;
  customDetailsPrefix: string;
}

const STORAGE_KEY = "ytm_discord_rpc_settings";

export const DEFAULT_DISCORD_RPC_SETTINGS: DiscordRpcSettings = {
  showDetails: true,
  showState: true,
  showTimeRemaining: true,
  customDetailsPrefix: "",
};

export function getDiscordRpcSettings(): DiscordRpcSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        showDetails: parsed.showDetails !== undefined ? Boolean(parsed.showDetails) : true,
        showState: parsed.showState !== undefined ? Boolean(parsed.showState) : true,
        showTimeRemaining: parsed.showTimeRemaining !== undefined ? Boolean(parsed.showTimeRemaining) : true,
        customDetailsPrefix: typeof parsed.customDetailsPrefix === "string" ? parsed.customDetailsPrefix : "",
      };
    }
  } catch (e) {
    console.warn("Failed to load Discord RPC settings:", e);
  }
  return { ...DEFAULT_DISCORD_RPC_SETTINGS };
}

export function saveDiscordRpcSettings(settings: DiscordRpcSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save Discord RPC settings:", e);
  }
}
