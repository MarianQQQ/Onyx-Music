use std::sync::{Arc, Mutex};
use tauri::State;

use crate::commands::auth::UserProfile;
use crate::innertube::extractor::StreamResolver;
use crate::innertube::lyrics::LyricsService;
use crate::innertube::models::Track;
use crate::innertube::proxy::AudioProxy;
use crate::innertube::queue::QueueManager;

pub struct AppState {
    pub queue: Arc<QueueManager>,
    pub resolver: Arc<StreamResolver>,
    pub lyrics: Arc<LyricsService>,
    pub proxy: Arc<AudioProxy>,
    pub cached_cookies: Arc<Mutex<Option<String>>>,
    pub user_profile: Arc<Mutex<Option<UserProfile>>>,
}

#[tauri::command]
pub fn get_queue(state: State<'_, AppState>) -> Vec<Track> {
    state.queue.get_tracks()
}

#[tauri::command]
pub fn get_current_track(state: State<'_, AppState>) -> Option<Track> {
    state.queue.current_track()
}

#[tauri::command]
pub fn get_current_index(state: State<'_, AppState>) -> usize {
    state.queue.get_current_index()
}

#[tauri::command]
pub fn set_queue(state: State<'_, AppState>, tracks: Vec<Track>, start_index: Option<usize>) -> Option<Track> {
    let idx = start_index.unwrap_or(0);
    state.queue.set_queue(tracks, idx);
    state.queue.current_track()
}

#[tauri::command]
pub fn play_track_at(state: State<'_, AppState>, index: usize) -> Option<Track> {
    state.queue.play_at(index)
}

#[tauri::command]
pub fn add_to_queue(state: State<'_, AppState>, track: Track) {
    state.queue.append_tracks(vec![track]);
}

#[tauri::command]
pub fn next_track(state: State<'_, AppState>) -> Option<Track> {
    state.queue.next_track()
}

#[tauri::command]
pub fn previous_track(state: State<'_, AppState>) -> Option<Track> {
    state.queue.previous_track()
}

#[tauri::command]
pub fn toggle_shuffle(state: State<'_, AppState>) -> bool {
    state.queue.shuffle();
    state.queue.is_shuffled()
}

#[tauri::command]
pub fn is_shuffled(state: State<'_, AppState>) -> bool {
    state.queue.is_shuffled()
}

#[tauri::command]
pub fn clear_queue(state: State<'_, AppState>) {
    state.queue.clear();
}

#[tauri::command]
pub fn remove_from_queue(index: usize, state: State<'_, AppState>) -> Option<Track> {
    state.queue.remove_at(index)
}

pub struct GlobalShortcutsState {
    pub mappings: Mutex<std::collections::HashMap<u32, String>>,
}

pub fn parse_shortcut_tolerant(raw: &str) -> Option<tauri_plugin_global_shortcut::Shortcut> {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

    let s = raw.trim();
    if s.is_empty() {
        return None;
    }

    let mut mods = Modifiers::empty();
    let mut key_code: Option<Code> = None;

    for part in s.split('+') {
        let token = part.trim();
        if token.is_empty() {
            continue;
        }
        let lower = token.to_ascii_lowercase();
        match lower.as_str() {
            "ctrl" | "control" => {
                mods |= Modifiers::CONTROL;
                continue;
            }
            "alt" | "option" => {
                mods |= Modifiers::ALT;
                continue;
            }
            "shift" => {
                mods |= Modifiers::SHIFT;
                continue;
            }
            "super" | "meta" | "win" | "windows" | "cmd" | "command" => {
                mods |= Modifiers::SUPER;
                continue;
            }
            _ => {}
        }

        // Resolve Code for the main key token
        let resolved = if let Ok(c) = token.parse::<Code>() {
            Some(c)
        } else if token.len() == 1 && token.chars().all(|ch| ch.is_ascii_alphabetic()) {
            format!("Key{}", token.to_ascii_uppercase()).parse::<Code>().ok()
        } else if token.len() == 1 && token.chars().all(|ch| ch.is_ascii_digit()) {
            format!("Digit{}", token).parse::<Code>().ok()
        } else {
            match lower.as_str() {
                "up" | "arrowup" => Some(Code::ArrowUp),
                "down" | "arrowdown" => Some(Code::ArrowDown),
                "left" | "arrowleft" => Some(Code::ArrowLeft),
                "right" | "arrowright" => Some(Code::ArrowRight),
                "space" | "spacebar" => Some(Code::Space),
                "mediaplaypause" | "playpause" => Some(Code::MediaPlayPause),
                "mediatracknext" | "medianext" => Some(Code::MediaTrackNext),
                "mediatrackprevious" | "mediaprev" | "mediaprevious" => Some(Code::MediaTrackPrevious),
                "mediastop" => Some(Code::MediaStop),
                "num0" | "numpad0" => Some(Code::Numpad0),
                "num1" | "numpad1" => Some(Code::Numpad1),
                "num2" | "numpad2" => Some(Code::Numpad2),
                "num3" | "numpad3" => Some(Code::Numpad3),
                "num4" | "numpad4" => Some(Code::Numpad4),
                "num5" | "numpad5" => Some(Code::Numpad5),
                "num6" | "numpad6" => Some(Code::Numpad6),
                "num7" | "numpad7" => Some(Code::Numpad7),
                "num8" | "numpad8" => Some(Code::Numpad8),
                "num9" | "numpad9" => Some(Code::Numpad9),
                "numadd" | "numpadadd" => Some(Code::NumpadAdd),
                "numsub" | "numpadsubtract" => Some(Code::NumpadSubtract),
                "nummul" | "numpadmultiply" => Some(Code::NumpadMultiply),
                "numdiv" | "numpaddivide" => Some(Code::NumpadDivide),
                "numenter" | "numpadenter" => Some(Code::NumpadEnter),
                "numdec" | "numpaddecimal" => Some(Code::NumpadDecimal),
                _ => None,
            }
        };

        if let Some(c) = resolved {
            key_code = Some(c);
        }
    }

    let code = key_code?;
    Some(Shortcut::new(
        if mods.is_empty() { None } else { Some(mods) },
        code,
    ))
}

#[tauri::command]
pub fn register_custom_shortcuts(
    app: tauri::AppHandle,
    play_pause: String,
    next: String,
    prev: String,
    vol_up: String,
    vol_down: String,
) -> Result<(), String> {
    use std::collections::HashMap;
    use tauri::Manager;
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let _ = app.global_shortcut().unregister_all();

    let mut new_mappings: HashMap<u32, String> = HashMap::new();

    let custom_entries = [
        (play_pause, "toggle-play"),
        (next, "next-track"),
        (prev, "previous-track"),
        (vol_up, "volume-up"),
        (vol_down, "volume-down"),
    ];

    for (raw_str, action) in custom_entries {
        if !raw_str.trim().is_empty() {
            if let Some(sc) = parse_shortcut_tolerant(&raw_str) {
                let _ = app.global_shortcut().register(sc);
                new_mappings.insert(sc.id(), action.to_string());
            }
        }
    }

    if let Some(state) = app.try_state::<Arc<GlobalShortcutsState>>() {
        if let Ok(mut guard) = state.mappings.lock() {
            *guard = new_mappings;
        }
    }

    Ok(())
}


