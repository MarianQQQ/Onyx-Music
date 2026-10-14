export interface UserProfile {
  name: string;
  handle?: string;
  avatar_url?: string;
  email?: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  artist_id?: string;
  album?: string;
  duration_seconds: number;
  thumbnail_url?: string;
  views?: string;
}

export interface Playlist {
  id: string;
  title: string;
  track_count: number;
  tracks: Track[];
}

export interface SavedPlaylist {
  id: string;
  title: string;
  trackCount: number;
  thumbnailUrl?: string;
}

export interface AlbumItem {
  id: string;
  title: string;
  year?: string;
  thumbnail_url?: string;
  artist?: string;
}

export interface ArtistItem {
  id: string;
  name: string;
  subscribers?: string;
  thumbnail_url?: string;
}

export interface ArtistProfile {
  id: string;
  name: string;
  description?: string;
  audience?: string;
  thumbnail_url?: string;
  banner_url?: string;
  top_songs: Track[];
  albums: AlbumItem[];
  related_artists: ArtistItem[];
  subscribed?: boolean;
  subscriber_count?: string;
  channel_id?: string;
  is_channel?: boolean;
}

export interface UnifiedSearchResults {
  query: string;
  filter: string;
  tracks: Track[];
  albums: AlbumItem[];
  artists: ArtistItem[];
  playlists: ChartItem[];
}

export interface SuggestionItem {
  title: string;
  subtitle?: string;
  thumbnail_url?: string;
  video_id?: string;
  browse_id?: string;
}

export interface SearchSuggestions {
  queries: string[];
  items: SuggestionItem[];
}

export interface MoodGenreItem {
  title: string;
  color_hex: string;
  params?: string;
  browse_id?: string;
}

export interface ExploreFeed {
  new_albums: AlbumItem[];
  trending_songs: Track[];
  moods_and_genres: MoodGenreItem[];
  new_videos: Track[];
}

export interface ChartItem {
  id: string;
  title: string;
  subtitle?: string;
  thumbnail_url?: string;
}

export interface ChartsData {
  country: string;
  playlists: ChartItem[];
  top_songs: Track[];
  top_artists: ArtistItem[];
  genres: ChartItem[];
}

export interface MoodCategorySection {
  title: string;
  playlists: ChartItem[];
}

export interface MoodCategoryData {
  title: string;
  sections: MoodCategorySection[];
  tracks: Track[];
}

export const CHART_COUNTRIES: { code: string; name: string }[] = [
  { code: "UA", name: "Ukraine" },
  { code: "ZZ", name: "Global" },
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BO", name: "Bolivia" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "CR", name: "Costa Rica" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GT", name: "Guatemala" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KE", name: "Kenya" },
  { code: "LU", name: "Luxembourg" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "PA", name: "Panama" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "RS", name: "Serbia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "UG", name: "Uganda" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "VN", name: "Vietnam" },
  { code: "ZW", name: "Zimbabwe" },
];


export interface LyricLine {
  time_ms: number;
  text: string;
}

export interface SyncedLyrics {
  plain_lyrics?: string;
  lines: LyricLine[];
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getCleanArtist(track: Track): string {
  let artist = (track.artist || "").trim();
  const lower = artist.toLowerCase();
  const isGeneric =
    !artist ||
    artist === "-" ||
    lower === "video" ||
    lower === "song" ||
    lower === "unknown artist" ||
    lower === "youtube" ||
    lower === "youtube music" ||
    artist === "Відео" ||
    artist === "Видео" ||
    artist === "Пісня" ||
    artist === "Песня";

  let cleanTitle = (track.title || "").trim();
  const hashIdx = cleanTitle.indexOf("#");
  if (hashIdx !== -1) {
    cleanTitle = cleanTitle.slice(0, hashIdx).trim();
  }

  for (const sep of [" - ", " – ", " — "]) {
    if (cleanTitle.includes(sep)) {
      const parts = cleanTitle.split(sep);
      const left = parts[0]?.trim();
      const right = parts.slice(1).join(sep).trim();
      if (left && right) {
        if (isGeneric) {
          return left;
        }
        if (artist.includes(" / ")) {
          const aliases = artist.split("/").map((s) => s.trim().toLowerCase());
          const leftLower = left.toLowerCase();
          if (aliases.some((a) => leftLower === a || leftLower.includes(a) || a.includes(leftLower))) {
            return left;
          }
        }
      }
    }
  }

  return artist || "Unknown Artist";
}

export function cleanTrack(track: Track): Track {
  const cleanArtist = getCleanArtist(track);
  let cleanTitle = (track.title || "").trim();

  // Strip trailing hashtags like #music #rock #alternativerock
  const hashIdx = cleanTitle.indexOf("#");
  if (hashIdx !== -1) {
    cleanTitle = cleanTitle.slice(0, hashIdx).trim();
  }

  // Strip redundant artist prefix if title starts with artist
  for (const sep of [" - ", " – ", " — "]) {
    if (cleanTitle.includes(sep)) {
      const parts = cleanTitle.split(sep);
      const left = parts[0]?.trim();
      const right = parts.slice(1).join(sep).trim();
      if (left && right) {
        if (left.toLowerCase() === cleanArtist.toLowerCase()) {
          cleanTitle = right;
          break;
        }
        if (track.artist && track.artist.includes(" / ")) {
          const aliases = track.artist.split("/").map((s) => s.trim().toLowerCase());
          if (aliases.some((a) => left.toLowerCase() === a || left.toLowerCase().includes(a))) {
            cleanTitle = right;
            break;
          }
        }
      }
    }
  }

  return {
    ...track,
    title: cleanTitle || track.title,
    artist: cleanArtist,
  };
}

export function getHighResThumbnail(url?: string, size: number = 544): string | undefined {
  if (!url) return undefined;
  if (url.includes("googleusercontent.com") || url.includes("ggpht.com")) {
    return url
      .replace(/=w\d+-h\d+[^&?]*/g, `=w${size}-h${size}-l90-rj`)
      .replace(/=s\d+[^&?]*/g, `=s${size}-l90-rj`);
  }
  if (url.includes("ytimg.com")) {
    return url.replace(/(mqdefault|sddefault|default)\.jpg/, "hqdefault.jpg");
  }
  return url;
}
