export interface DesktopNotificationsSettings {
  inAppToast: boolean;
  nativeNotification: boolean;
  showCoverArt: boolean;
  toastDurationSeconds: number;
}

const STORAGE_KEY = "ytm_desktop_notifications_settings";

export const DEFAULT_DESKTOP_NOTIFICATIONS_SETTINGS: DesktopNotificationsSettings = {
  inAppToast: true,
  nativeNotification: true,
  showCoverArt: true,
  toastDurationSeconds: 4,
};

export function getDesktopNotificationsSettings(): DesktopNotificationsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        inAppToast: parsed.inAppToast !== undefined ? Boolean(parsed.inAppToast) : true,
        nativeNotification: parsed.nativeNotification !== undefined ? Boolean(parsed.nativeNotification) : true,
        showCoverArt: parsed.showCoverArt !== undefined ? Boolean(parsed.showCoverArt) : true,
        toastDurationSeconds: typeof parsed.toastDurationSeconds === "number" ? parsed.toastDurationSeconds : 4,
      };
    }
  } catch (e) {
    console.warn("Failed to load Desktop Notifications settings:", e);
  }
  return { ...DEFAULT_DESKTOP_NOTIFICATIONS_SETTINGS };
}

export function saveDesktopNotificationsSettings(settings: DesktopNotificationsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save Desktop Notifications settings:", e);
  }
}
