use tauri::State;
use crate::commands::playback::AppState;
use crate::innertube::lyrics::SyncedLyrics;

#[tauri::command]
pub async fn get_synced_lyrics(
    state: State<'_, AppState>,
    title: String,
    artist: String,
    duration_seconds: Option<u32>,
) -> Result<SyncedLyrics, String> {
    state.lyrics.get_lyrics(&title, &artist, duration_seconds).await
}
