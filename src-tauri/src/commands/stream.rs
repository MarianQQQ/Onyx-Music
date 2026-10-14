use tauri::State;
use crate::commands::playback::AppState;

#[tauri::command]
pub async fn resolve_stream_url(
    state: State<'_, AppState>,
    video_id: String,
) -> Result<String, String> {
    // Proactively verify / download audio engine binary if needed
    state.resolver.ensure_binary().await?;

    // Proactively warm up resolution in background so it's ready when audio tag connects
    let resolver = state.resolver.clone();
    let vid = video_id.clone();
    tokio::spawn(async move {
        let _ = resolver.resolve_audio_url(&vid).await;
    });

    Ok(state.proxy.get_stream_url(&video_id))
}
