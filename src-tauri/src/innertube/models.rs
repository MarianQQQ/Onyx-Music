use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub artist_id: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    pub duration_seconds: u32,
    #[serde(default)]
    pub thumbnail_url: Option<String>,
    #[serde(default)]
    pub views: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub title: String,
    pub track_count: usize,
    pub tracks: Vec<Track>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPlaylist {
    pub id: String,
    pub title: String,
    pub track_count: usize,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlbumItem {
    pub id: String,
    pub title: String,
    pub year: Option<String>,
    pub thumbnail_url: Option<String>,
    pub artist: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistItem {
    pub id: String,
    pub name: String,
    pub subscribers: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistProfile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub audience: Option<String>,
    pub thumbnail_url: Option<String>,
    pub banner_url: Option<String>,
    pub top_songs: Vec<Track>,
    pub albums: Vec<AlbumItem>,
    pub related_artists: Vec<ArtistItem>,
    pub subscribed: Option<bool>,
    pub subscriber_count: Option<String>,
    pub channel_id: Option<String>,
    pub is_channel: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedSearchResults {
    pub query: String,
    pub filter: String,
    pub tracks: Vec<Track>,
    pub albums: Vec<AlbumItem>,
    pub artists: Vec<ArtistItem>,
    pub playlists: Vec<ChartItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestionItem {
    pub title: String,
    pub subtitle: Option<String>,
    pub thumbnail_url: Option<String>,
    pub video_id: Option<String>,
    pub browse_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchSuggestions {
    pub queries: Vec<String>,
    pub items: Vec<SuggestionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodGenreItem {
    pub title: String,
    pub color_hex: String,
    pub params: Option<String>,
    pub browse_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExploreFeed {
    pub new_albums: Vec<AlbumItem>,
    pub trending_songs: Vec<Track>,
    pub moods_and_genres: Vec<MoodGenreItem>,
    pub new_videos: Vec<Track>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartItem {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartsData {
    pub country: String,
    pub playlists: Vec<ChartItem>,
    pub top_songs: Vec<Track>,
    pub top_artists: Vec<ArtistItem>,
    pub genres: Vec<ChartItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodCategorySection {
    pub title: String,
    pub playlists: Vec<ChartItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodCategoryData {
    pub title: String,
    pub sections: Vec<MoodCategorySection>,
    pub tracks: Vec<Track>,
}


