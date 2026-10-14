import { YTMPlugin, PluginContext } from "../pluginManager";
import { Track } from "../../models/track";

export interface SponsorBlockCategory {
  id: string;
  name: string;
  description: string;
}

export const SPONSORBLOCK_CATEGORIES: SponsorBlockCategory[] = [
  {
    id: "music_offtopic",
    name: "Music: Non-Music Section",
    description: "Spoken intros, music video skits, pauses, or off-topic dialogue.",
  },
  {
    id: "sponsor",
    name: "Sponsor",
    description: "Paid promotion or product advertisement segments.",
  },
  {
    id: "intro",
    name: "Intro / Intermission",
    description: "Introductory animation, silence, or intermissions.",
  },
  {
    id: "outro",
    name: "Outro / Endcards",
    description: "Credits, subscribe reminders, and end-screen cards.",
  },
  {
    id: "preview",
    name: "Preview / Recap",
    description: "Preview of what's to come or recap of previous section.",
  },
  {
    id: "selfpromo",
    name: "Unpaid / Self Promotion",
    description: "Merch links, Patreon mentions, or social media plugs.",
  },
  {
    id: "interaction",
    name: "Interaction Reminder",
    description: "Like and subscribe reminders.",
  },
];

export interface SponsorBlockSettings {
  categories: string[];
  autoSkip: boolean; // true = auto seek past segment; false = notify only
  showNotification: boolean; // show in-app toast notification
}

const STORAGE_KEY = "ytm_sponsorblock_settings";

export const DEFAULT_SPONSORBLOCK_SETTINGS: SponsorBlockSettings = {
  categories: ["music_offtopic"],
  autoSkip: true,
  showNotification: true,
};

export function getSponsorBlockSettings(): SponsorBlockSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        categories: Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : DEFAULT_SPONSORBLOCK_SETTINGS.categories,
        autoSkip: parsed.autoSkip !== undefined ? Boolean(parsed.autoSkip) : DEFAULT_SPONSORBLOCK_SETTINGS.autoSkip,
        showNotification: parsed.showNotification !== undefined ? Boolean(parsed.showNotification) : DEFAULT_SPONSORBLOCK_SETTINGS.showNotification,
      };
    }
  } catch (e) {
    console.warn("Failed to load SponsorBlock settings:", e);
  }
  return { ...DEFAULT_SPONSORBLOCK_SETTINGS };
}

export function saveSponsorBlockSettings(settings: SponsorBlockSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save SponsorBlock settings:", e);
  }
}

export interface SkipSegment {
  category: string;
  start: number;
  end: number;
  uuid: string;
}

// In-memory cache of videoId -> SkipSegment[]
const segmentCache = new Map<string, SkipSegment[]>();
let currentTrackId: string | null = null;
let currentSegments: SkipSegment[] = [];
const skippedSegmentUuids = new Set<string>();
let activeContext: PluginContext | null = null;
let isSeeking = false;

async function fetchSegmentsForVideo(videoId: string, categories: string[]): Promise<SkipSegment[]> {
  if (!videoId || videoId.length < 5) return [];

  const cacheKey = `${videoId}_${categories.slice().sort().join(",")}`;
  if (segmentCache.has(cacheKey)) {
    return segmentCache.get(cacheKey) || [];
  }

  try {
    const categoriesParam = encodeURIComponent(JSON.stringify(categories));
    const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${categoriesParam}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      // Normal: no segments found
      segmentCache.set(cacheKey, []);
      return [];
    }

    if (!response.ok) {
      console.warn(`SponsorBlock API returned HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      const segments: SkipSegment[] = data
        .filter((item: any) => Array.isArray(item.segment) && item.segment.length >= 2)
        .map((item: any) => ({
          category: String(item.category || "music_offtopic"),
          start: Number(item.segment[0]),
          end: Number(item.segment[1]),
          uuid: String(item.UUID || `${item.segment[0]}-${item.segment[1]}`),
        }))
        .filter((s) => s.end > s.start && s.start >= 0);

      segmentCache.set(cacheKey, segments);
      return segments;
    }
  } catch (e) {
    // Network errors or timeout
    console.warn("SponsorBlock fetch notice:", e);
  }

  return [];
}

export const sponsorBlockPlugin: YTMPlugin = {
  id: "sponsorblock",
  name: "SponsorBlock for Music",
  version: "1.2.0",
  description: "Skip non-music intros, music video dialogue, sponsor sections, and outros automatically.",
  author: "Ajay & SponsorBlock Community",
  enabled: false,

  onEnable: (ctx) => {
    activeContext = ctx;
    const current = ctx.getCurrentTrack();
    if (current && current.id) {
      currentTrackId = current.id;
      skippedSegmentUuids.clear();
      const settings = getSponsorBlockSettings();
      fetchSegmentsForVideo(current.id, settings.categories).then((segs) => {
        if (currentTrackId === current.id) {
          currentSegments = segs;
        }
      });
    }
  },

  onDisable: () => {
    activeContext = null;
    currentSegments = [];
    currentTrackId = null;
    skippedSegmentUuids.clear();
  },

  onTrackChange: (track: Track) => {
    if (!track || !track.id) {
      currentSegments = [];
      currentTrackId = null;
      skippedSegmentUuids.clear();
      return;
    }

    currentTrackId = track.id;
    skippedSegmentUuids.clear();
    currentSegments = [];

    const settings = getSponsorBlockSettings();
    if (settings.categories.length === 0) return;

    fetchSegmentsForVideo(track.id, settings.categories).then((segs) => {
      if (currentTrackId === track.id) {
        currentSegments = segs;
      }
    });
  },

  onTimeUpdate: (currentTime: number, _duration: number) => {
    if (!activeContext || isSeeking || currentSegments.length === 0) return;

    const settings = getSponsorBlockSettings();

    for (const segment of currentSegments) {
      // Check if current playhead is inside segment [start, end]
      // Use small threshold to catch fast playheads
      if (
        currentTime >= segment.start - 0.1 &&
        currentTime < segment.end - 0.2 &&
        !skippedSegmentUuids.has(segment.uuid)
      ) {
        skippedSegmentUuids.add(segment.uuid);

        if (settings.autoSkip) {
          isSeeking = true;
          // Seek cleanly to the end of the non-music section
          const targetTime = segment.end + 0.05;
          if (activeContext.seek) {
            activeContext.seek(targetTime);
          }

          if (settings.showNotification) {
            activeContext.notify(
              "SponsorBlock",
              "⏭️ Skipped non-music intro/outro (SponsorBlock)"
            );
          }

          window.setTimeout(() => {
            isSeeking = false;
          }, 400);
        } else {
          // Notify mode only
          if (settings.showNotification) {
            const catLabel =
              SPONSORBLOCK_CATEGORIES.find((c) => c.id === segment.category)?.name ||
              segment.category;
            activeContext.notify(
              "SponsorBlock Notice",
              `⚠️ Non-music section detected (${catLabel}: ${Math.round(segment.start)}s - ${Math.round(segment.end)}s)`
            );
          }
        }
        break;
      }
    }
  },
};
