pub mod commands;
pub mod innertube;
#[cfg(windows)]
pub mod session_branding;

use std::sync::Arc;
use commands::auth::{
    check_auth_status, clear_discord_rpc, get_autostart_status, get_user_profile,
    is_launched_minimized, logout, open_login_window, set_autostart, set_discord_rpc,
    window_close, window_minimize, window_show, window_start_dragging, window_toggle_maximize,
};
use commands::lyrics::get_synced_lyrics;
use commands::playback::{
    add_to_queue, clear_queue, get_current_index, get_current_track, get_queue, is_shuffled,
    next_track, play_track_at, previous_track, remove_from_queue, set_queue, toggle_shuffle,
    register_custom_shortcuts, AppState, GlobalShortcutsState,
};
use commands::search::{
    get_artist_profile, get_charts, get_explore_feed, get_history, get_home_feed, get_liked_songs,
    get_mood_category, get_search_suggestions, get_song_recommendations, load_playlist, record_playback, search_tracks, search_unified,
    sync_library, toggle_like, toggle_subscribe_artist,
};
use commands::stream::resolve_stream_url;
use innertube::extractor::StreamResolver;
use innertube::lyrics::LyricsService;
use innertube::proxy::AudioProxy;
use innertube::queue::QueueManager;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    unsafe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--js-flags=--max-old-space-size=64 --disable-features=Translate,OptimizationHints,MediaRouter",
        );
    }

    // Security: ensure any legacy plaintext temp cookies are permanently deleted on launch
    let _ = std::fs::remove_file(std::env::temp_dir().join("ytm_stream_cookies.txt"));

    #[cfg(windows)]
    session_branding::session_branding::start_audio_session_branding_watcher();

    let resolver = Arc::new(StreamResolver::new());
    let startup_resolver = resolver.clone();
    tauri::async_runtime::spawn(async move {
        let _ = startup_resolver.ensure_binary().await;
    });

    let proxy = tauri::async_runtime::block_on(async {
        AudioProxy::start(resolver.clone())
            .await
            .expect("Failed to start local audio proxy")
    });

    let app_state = AppState {
        queue: Arc::new(QueueManager::new()),
        resolver,
        lyrics: Arc::new(LyricsService::new()),
        proxy: Arc::new(proxy),
        cached_cookies: Arc::new(std::sync::Mutex::new(None)),
        user_profile: Arc::new(std::sync::Mutex::new(None)),
    };

    let shortcuts_state = Arc::new(GlobalShortcutsState {
        mappings: Mutex::new(HashMap::new()),
    });

    tauri::Builder::default()
        .manage(app_state)
        .manage(shortcuts_state.clone())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    use tauri::Emitter;
                    if let Some(state) = app.try_state::<Arc<GlobalShortcutsState>>() {
                        if let Ok(guard) = state.mappings.lock() {
                            if let Some(action) = guard.get(&shortcut.id()) {
                                match event.state() {
                                    ShortcutState::Pressed => {
                                        let _ = app.emit("global-media-action", action.as_str());
                                    }
                                    ShortcutState::Released => {
                                        if action == "volume-up" {
                                            let _ = app.emit("global-media-action", "volume-up-release");
                                        } else if action == "volume-down" {
                                            let _ = app.emit("global-media-action", "volume-down-release");
                                        }
                                    }
                                }
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = win.set_icon(icon.clone());
                }
                let _ = win.set_background_color(Some(tauri::window::Color(0, 0, 0, 255)));
                let _ = win.set_min_size(Some(tauri::LogicalSize::new(900.0, 580.0)));
            }

            // Build Tray Menu with playback controls
            let show_i = MenuItem::with_id(app, "show", "Show Onyx Music", true, None::<&str>)?;
            let play_i = MenuItem::with_id(app, "play_pause", "Play / Pause", true, None::<&str>)?;
            let next_i = MenuItem::with_id(app, "next", "Next Track", true, None::<&str>)?;
            let prev_i = MenuItem::with_id(app, "prev", "Previous Track", true, None::<&str>)?;
            let sep1 = MenuItem::with_id(app, "sep1", "---", false, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let tray_menu = Menu::with_items(app, &[&show_i, &sep1, &play_i, &next_i, &prev_i, &sep1, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Onyx Music")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    use tauri::Emitter;
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.maximize();
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                            }
                        }
                        "play_pause" => {
                            let _ = app.emit("global-media-action", "toggle-play");
                        }
                        "next" => {
                            let _ = app.emit("global-media-action", "next-track");
                        }
                        "prev" => {
                            let _ = app.emit("global-media-action", "previous-track");
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.maximize();
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        // Prevent actual exit; minimize / hide to tray instead
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_queue,
            get_current_track,
            get_current_index,
            set_queue,
            play_track_at,
            add_to_queue,
            next_track,
            previous_track,
            toggle_shuffle,
            is_shuffled,
            clear_queue,
            remove_from_queue,
            resolve_stream_url,
            search_tracks,
            search_unified,
            get_home_feed,
            load_playlist,
            get_synced_lyrics,
            open_login_window,
            check_auth_status,
            get_user_profile,
            logout,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_start_dragging,
            window_show,
            get_artist_profile,
            get_search_suggestions,
            get_explore_feed,
            get_charts,
            get_mood_category,
            toggle_like,
            toggle_subscribe_artist,
            get_liked_songs,
            record_playback,
            get_history,
            get_song_recommendations,
            register_custom_shortcuts,
            get_autostart_status,
            set_autostart,
            is_launched_minimized,
            set_discord_rpc,
            clear_discord_rpc,
            sync_library
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
