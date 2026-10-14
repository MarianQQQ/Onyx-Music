use crate::commands::auth::extract_webview_cookies;
use crate::innertube::client::YTClient;
use crate::innertube::models::{ArtistProfile, ChartsData, ExploreFeed, MoodCategoryData, Playlist, SavedPlaylist, SearchSuggestions, Track, UnifiedSearchResults};
use tauri::AppHandle;

#[tauri::command]
pub async fn search_tracks(
    query: String,
    limit: Option<usize>,
    filter: Option<String>,
) -> Result<Vec<Track>, String> {
    YTClient::search(&query, limit.unwrap_or(50), filter.as_deref()).await
}

#[tauri::command]
pub async fn search_unified(
    query: String,
    filter: Option<String>,
    limit: Option<usize>,
) -> Result<UnifiedSearchResults, String> {
    YTClient::search_unified(&query, filter.as_deref(), limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn get_home_feed() -> Result<Vec<Track>, String> {
    YTClient::get_home_feed().await
}

#[tauri::command]
pub async fn load_playlist(
    app: AppHandle,
    url_or_id: String,
    cookies_path: Option<String>,
) -> Result<Playlist, String> {
    let resolved_cookies = extract_webview_cookies(&app)
        .or_else(|| cookies_path.filter(|s| !s.trim().is_empty()));
    YTClient::get_playlist(&url_or_id, resolved_cookies.as_deref()).await
}

#[tauri::command]
pub async fn get_artist_profile(browse_id: String) -> Result<ArtistProfile, String> {
    YTClient::get_artist_profile(&browse_id).await
}

#[tauri::command]
pub async fn get_search_suggestions(query: String) -> Result<SearchSuggestions, String> {
    YTClient::get_search_suggestions(&query).await
}

#[tauri::command]
pub async fn get_explore_feed() -> Result<ExploreFeed, String> {
    YTClient::get_explore_feed().await
}

#[tauri::command]
pub async fn get_charts(country: Option<String>) -> Result<ChartsData, String> {
    let code = country.unwrap_or_else(|| "UA".to_string());
    YTClient::get_charts(&code).await
}

#[tauri::command]
pub async fn get_mood_category(
    browse_id: String,
    params: Option<String>,
    title: Option<String>,
) -> Result<MoodCategoryData, String> {
    YTClient::get_mood_category(
        &browse_id,
        params.as_deref(),
        title.as_deref().unwrap_or("Moods & genres"),
    )
    .await
}

#[tauri::command]
pub async fn toggle_like(
    app: AppHandle,
    video_id: String,
    like: bool,
    cookies: Option<String>,
) -> Result<bool, String> {
    let resolved_cookies = extract_webview_cookies(&app).or_else(|| cookies.filter(|s| !s.trim().is_empty()));
    YTClient::toggle_like(&video_id, like, resolved_cookies.as_deref()).await
}

#[tauri::command]
pub async fn toggle_subscribe_artist(
    app: AppHandle,
    channel_id: String,
    subscribe: bool,
    cookies: Option<String>,
) -> Result<bool, String> {
    let resolved_cookies = extract_webview_cookies(&app).or_else(|| cookies.filter(|s| !s.trim().is_empty()));
    YTClient::toggle_subscribe(&channel_id, subscribe, resolved_cookies.as_deref()).await
}

#[tauri::command]
pub async fn get_liked_songs(app: AppHandle, cookies: Option<String>) -> Result<Vec<Track>, String> {
    let resolved_cookies = extract_webview_cookies(&app).or_else(|| cookies.filter(|s| !s.trim().is_empty()));
    YTClient::get_liked_songs(resolved_cookies.as_deref()).await
}

#[tauri::command]
pub async fn record_playback(
    app: AppHandle,
    video_id: String,
    cookies: Option<String>,
) -> Result<bool, String> {
    let resolved_cookies = extract_webview_cookies(&app).or_else(|| cookies.filter(|s| !s.trim().is_empty()));
    YTClient::record_playback(&video_id, resolved_cookies.as_deref()).await
}

#[tauri::command]
pub async fn get_history(app: AppHandle, cookies: Option<String>) -> Result<Vec<Track>, String> {
    let resolved_cookies = extract_webview_cookies(&app).or_else(|| cookies.filter(|s| !s.trim().is_empty()));
    YTClient::get_history(resolved_cookies.as_deref()).await
}

#[tauri::command]
pub async fn get_song_recommendations(
    app: AppHandle,
    video_id: String,
    cookies: Option<String>,
) -> Result<Vec<Track>, String> {
    let resolved_cookies = extract_webview_cookies(&app).or_else(|| cookies.filter(|s| !s.trim().is_empty()));
    YTClient::get_song_recommendations(&video_id, resolved_cookies.as_deref()).await
}

#[tauri::command]
pub async fn sync_library(
    app: AppHandle,
    cookies: Option<String>,
) -> Result<Vec<SavedPlaylist>, String> {
    let resolved_cookies = extract_webview_cookies(&app).or_else(|| cookies.filter(|s| !s.trim().is_empty()));
    YTClient::sync_library(resolved_cookies.as_deref()).await
}




