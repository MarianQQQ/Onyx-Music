use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use serde_json::{json, Value};
use crate::commands::playback::AppState;
use crate::innertube::client::{
    compute_sapisidhash, extract_sapisid, normalize_cookie_header, WEB_REMIX_CLIENT_VERSION,
    WEB_REMIX_USER_AGENT,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub name: String,
    pub handle: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
}

#[tauri::command]
pub async fn open_login_window(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("google-login") {
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let login_url = "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F";
    let parsed_url = login_url
        .parse()
        .map_err(|e| format!("Invalid URL: {}", e))?;

    let win = WebviewWindowBuilder::new(&app, "google-login", WebviewUrl::External(parsed_url))
        .title("Sign in to YouTube Music - Google Accounts")
        .user_agent(WEB_REMIX_USER_AGENT)
        .additional_browser_args("--js-flags=--max-old-space-size=64 --disable-features=Translate,OptimizationHints,MediaRouter")
        .inner_size(520.0, 700.0)
        .center()
        .resizable(true)
        .always_on_top(false)
        .build()
        .map_err(|e| format!("Failed to create login window: {}", e))?;

    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;

    // Background watcher: auto-detect login completion, extract profile, cache cookies, auto-close window
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        for _ in 0..120 {
            tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

            let win_opt = app_clone.get_webview_window("google-login");
            if win_opt.is_none() {
                break;
            }

            if let Some(cookies) = extract_webview_cookies(&app_clone) {
                if cookies.contains("SAPISID") || cookies.contains("LOGIN_INFO") {
                    // 1. Update cache immediately
                    if let Some(state) = app_clone.try_state::<AppState>() {
                        if let Ok(mut c) = state.cached_cookies.lock() {
                            *c = Some(cookies.clone());
                        }
                    }

                    // 2. Fetch profile via HTTP while window is still open and cookies are fresh
                    let profile = fetch_profile_from_cookies(&cookies).await;
                    if let Some(ref p) = profile {
                        if let Some(state) = app_clone.try_state::<AppState>() {
                            if let Ok(mut prof) = state.user_profile.lock() {
                                *prof = Some(p.clone());
                            }
                        }
                    }

                    // 3. Emit auth-success to frontend
                    let _ = app_clone.emit("auth-success", profile);

                    // 4. Close login window safely on main UI thread
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    let app_for_close = app_clone.clone();
                    let app_in_closure = app_for_close.clone();
                    let _ = app_for_close.run_on_main_thread(move || {
                        if let Some(w) = app_in_closure.get_webview_window("google-login") {
                            let _ = w.close();
                        }
                    });
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Automatically extracts YouTube Music cookies from cached AppState session or active WebViews
pub fn extract_webview_cookies(app: &AppHandle) -> Option<String> {
    // 1. First check if AppState already has cached session credentials
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(c) = state.cached_cookies.lock() {
            if let Some(ref cached) = *c {
                if cached.contains("SAPISID") || cached.contains("LOGIN_INFO") {
                    return Some(cached.clone());
                }
            }
        }
    }

    // 2. Try reading live cookies from google-login or main webviews
    let win_opt = app
        .get_webview_window("google-login")
        .or_else(|| app.get_webview_window("main"));

    if let Some(win) = win_opt {
        // Guard against querying WebView2 COM on a closing window
        if win.label() == "google-login" {
            if let Ok(visible) = win.is_visible() {
                if !visible {
                    return None;
                }
            }
        }

        let urls = [
            "https://music.youtube.com/",
            "https://www.youtube.com/",
            "https://youtube.com/",
            "https://accounts.google.com/",
            "https://google.com/",
        ];

        let mut seen = std::collections::HashSet::new();
        let mut pairs = Vec::new();

        for u in urls {
            if let Ok(parsed) = u.parse::<tauri::Url>() {
                if let Ok(cookies) = win.cookies_for_url(parsed) {
                    for c in cookies {
                        let name = c.name().to_string();
                        if seen.insert(name.clone()) {
                            pairs.push(format!("{}={}", name, c.value()));
                        }
                    }
                }
            }
        }

        if !pairs.is_empty() {
            let joined = pairs.join("; ");
            if joined.contains("SAPISID") || joined.contains("SID") || joined.contains("LOGIN_INFO") {
                // Update AppState cache if present
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut c) = state.cached_cookies.lock() {
                        *c = Some(joined.clone());
                    }
                }
                return Some(joined);
            }
        }
    }

    None
}

/// Recursively traverses a JSON value to find avatar image URLs and account headers
fn find_avatar_and_name_in_json(val: &Value) -> (Option<String>, Option<String>, Option<String>) {
    let mut name = None;
    let mut avatar = None;
    let mut handle = None;

    if let Some(obj) = val.as_object() {
        if let Some(header) = obj.get("activeAccountHeaderRenderer") {
            if let Some(n) = header["accountName"]["runs"][0]["text"].as_str() {
                name = Some(n.to_string());
            }
            if let Some(h) = header["channelHandle"]["runs"][0]["text"].as_str() {
                handle = Some(h.to_string());
            }
            if let Some(thumbs) = header["accountPhoto"]["thumbnails"].as_array() {
                if let Some(last) = thumbs.last() {
                    if let Some(u) = last["url"].as_str() {
                        avatar = Some(u.to_string());
                    }
                }
            }
        }

        if name.is_none() || avatar.is_none() {
            for (_, v) in obj {
                let (sub_name, sub_avatar, sub_handle) = find_avatar_and_name_in_json(v);
                if name.is_none() && sub_name.is_some() {
                    name = sub_name;
                }
                if avatar.is_none() && sub_avatar.is_some() {
                    avatar = sub_avatar;
                }
                if handle.is_none() && sub_handle.is_some() {
                    handle = sub_handle;
                }
            }
        }
    } else if let Some(arr) = val.as_array() {
        for v in arr {
            let (sub_name, sub_avatar, sub_handle) = find_avatar_and_name_in_json(v);
            if name.is_none() && sub_name.is_some() {
                name = sub_name;
            }
            if avatar.is_none() && sub_avatar.is_some() {
                avatar = sub_avatar;
            }
            if handle.is_none() && sub_handle.is_some() {
                handle = sub_handle;
            }
        }
    }

    (name, avatar, handle)
}

/// Fetches user profile data from YouTube Music InnerTube account menu or HTML page scrape
pub async fn fetch_profile_from_cookies(cookies: &str) -> Option<UserProfile> {
    let normalized = normalize_cookie_header(cookies);
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| Client::new());

    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": WEB_REMIX_CLIENT_VERSION,
                "hl": "en",
                "gl": "US"
            }
        }
    });

    let mut req = client
        .post("https://music.youtube.com/youtubei/v1/account/account_menu")
        .header("Content-Type", "application/json")
        .header("Cookie", &normalized)
        .header("User-Agent", WEB_REMIX_USER_AGENT)
        .header("Origin", "https://music.youtube.com")
        .header("X-Origin", "https://music.youtube.com")
        .header("X-Goog-AuthUser", "0");

    if let Some(sapisid) = extract_sapisid(&normalized) {
        let auth_val = compute_sapisidhash(&sapisid, "https://music.youtube.com");
        req = req.header("Authorization", auth_val);
    }

    if let Ok(resp) = req.json(&payload).send().await {
        if resp.status().is_success() {
            if let Ok(root) = resp.json::<Value>().await {
                let (found_name, found_avatar, found_handle) = find_avatar_and_name_in_json(&root);
                if let Some(name_str) = found_name {
                    return Some(UserProfile {
                        name: name_str,
                        handle: found_handle,
                        avatar_url: found_avatar,
                        email: None,
                    });
                }
            }
        }
    }

    // Secondary approach: fetch music.youtube.com home HTML with session cookies and extract initialData
    let mut page_req = client
        .get("https://music.youtube.com/")
        .header("Cookie", &normalized)
        .header("User-Agent", WEB_REMIX_USER_AGENT);

    if let Some(sapisid) = extract_sapisid(&normalized) {
        let auth_val = compute_sapisidhash(&sapisid, "https://music.youtube.com");
        page_req = page_req.header("Authorization", auth_val);
    }

    if let Ok(page_resp) = page_req.send().await {
        if let Ok(html) = page_resp.text().await {
            // Check for avatar photo URL in initial data (e.g. yt3.ggpht.com)
            let mut extracted_avatar = None;
            if let Some(idx) = html.find("https://yt3.ggpht.com/") {
                let tail = &html[idx..];
                if let Some(end_quote) = tail.find('"').or_else(|| tail.find('\\')) {
                    let url = &tail[..end_quote];
                    extracted_avatar = Some(url.to_string());
                }
            } else if let Some(idx) = html.find("https://lh3.googleusercontent.com/") {
                let tail = &html[idx..];
                if let Some(end_quote) = tail.find('"').or_else(|| tail.find('\\')) {
                    let url = &tail[..end_quote];
                    extracted_avatar = Some(url.to_string());
                }
            }

            if extracted_avatar.is_some() {
                return Some(UserProfile {
                    name: "YouTube Music User".to_string(),
                    handle: Some("@account".to_string()),
                    avatar_url: extracted_avatar,
                    email: None,
                });
            }
        }
    }

    // Fallback if cookies exist and SAPISID is valid
    if normalized.contains("SAPISID") || normalized.contains("LOGIN_INFO") {
        Some(UserProfile {
            name: "YouTube Music User".to_string(),
            handle: Some("@account".to_string()),
            avatar_url: None,
            email: None,
        })
    } else {
        None
    }
}

#[tauri::command]
pub async fn get_user_profile(app: AppHandle) -> Result<Option<UserProfile>, String> {
    if let Some(cookies) = extract_webview_cookies(&app) {
        if let Some(profile) = fetch_profile_from_cookies(&cookies).await {
            if let Some(state) = app.try_state::<AppState>() {
                if let Ok(mut p) = state.user_profile.lock() {
                    *p = Some(profile.clone());
                }
            }
            return Ok(Some(profile));
        }
    }

    // Check if AppState already has cached profile
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(p) = state.user_profile.lock() {
            if let Some(ref prof) = *p {
                return Ok(Some(prof.clone()));
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn check_auth_status(app: AppHandle) -> Result<Option<UserProfile>, String> {
    get_user_profile(app).await
}

#[tauri::command]
pub async fn logout(app: AppHandle) -> Result<(), String> {
    // 1. Close login window if opened
    if let Some(win) = app.get_webview_window("google-login") {
        let _ = win.close();
    }

    // 2. Clear AppState cached credentials
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut c) = state.cached_cookies.lock() {
            *c = None;
        }
        if let Ok(mut p) = state.user_profile.lock() {
            *p = None;
        }
    }

    // 3. Clear browsing data & cookies from WebView2 instances
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.clear_all_browsing_data();
    }

    // 4. Emit logout event to frontend
    let _ = app.emit("auth-logout", ());
    Ok(())
}

// Window control commands for custom borderless titlebar
#[tauri::command]
pub fn window_minimize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
}

#[tauri::command]
pub fn window_toggle_maximize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(is_max) = win.is_maximized() {
            if is_max {
                let _ = win.unmaximize();
            } else {
                let _ = win.maximize();
            }
        }
    }
}

#[tauri::command]
pub fn window_close(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.close();
    }
}

#[tauri::command]
pub fn window_start_dragging(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.start_dragging();
    }
}

#[tauri::command]
pub fn window_show(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.maximize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
pub fn is_launched_minimized() -> bool {
    std::env::args().any(|a| a == "--minimized" || a == "--tray" || a == "--hidden")
}

#[tauri::command]
pub fn get_autostart_status() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(output) = std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "Onyx",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            return output.status.success();
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
pub fn set_autostart(enabled: bool, start_minimized: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        if enabled {
            let val = if start_minimized {
                format!("\"{}\" --minimized", exe_path.display())
            } else {
                format!("\"{}\"", exe_path.display())
            };
            let output = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "Onyx",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &val,
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| e.to_string())?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).to_string());
            }
        } else {
            let _ = std::process::Command::new("reg")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "Onyx",
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
        Ok(enabled)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (enabled, start_minimized);
        Ok(false)
    }
}

static DISCORD_PIPE: std::sync::OnceLock<std::sync::Mutex<Option<std::fs::File>>> =
    std::sync::OnceLock::new();

fn get_discord_pipe_mutex() -> &'static std::sync::Mutex<Option<std::fs::File>> {
    DISCORD_PIPE.get_or_init(|| std::sync::Mutex::new(None))
}

fn write_discord_frame(pipe: &mut std::fs::File, opcode: u32, payload: &str) -> std::io::Result<()> {
    use std::io::Write;
    let bytes = payload.as_bytes();
    let len = bytes.len() as u32;
    let mut header = [0u8; 8];
    header[0..4].copy_from_slice(&opcode.to_le_bytes());
    header[4..8].copy_from_slice(&len.to_le_bytes());
    pipe.write_all(&header)?;
    pipe.write_all(bytes)?;
    pipe.flush()?;
    Ok(())
}

fn read_discord_frame(pipe: &mut std::fs::File) -> std::io::Result<()> {
    use std::io::Read;
    let mut header = [0u8; 8];
    pipe.read_exact(&mut header)?;
    let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    if len > 0 && len < 65536 {
        let mut buf = vec![0u8; len];
        pipe.read_exact(&mut buf)?;
    }
    Ok(())
}

fn connect_discord_pipe() -> Option<std::fs::File> {
    const CLIENT_ID: &str = "1108588477600890980";
    for i in 0..10 {
        let path = format!(r"\\.\pipe\discord-ipc-{}", i);
        if let Ok(mut pipe) = std::fs::OpenOptions::new().read(true).write(true).open(&path) {
            let handshake = json!({
                "v": 1,
                "client_id": CLIENT_ID
            })
            .to_string();
            if write_discord_frame(&mut pipe, 0, &handshake).is_ok()
                && read_discord_frame(&mut pipe).is_ok()
            {
                return Some(pipe);
            }
        }
    }
    None
}

#[tauri::command]
pub async fn set_discord_rpc(
    title: String,
    artist: String,
    duration_secs: u64,
) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let mutex = get_discord_pipe_mutex();
        let mut guard = match mutex.lock() {
            Ok(g) => g,
            Err(_) => return Ok(false),
        };

        if guard.is_none() {
            *guard = connect_discord_pipe();
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let mut activity = json!({
            "details": title,
            "state": format!("by {}", artist),
            "type": 2
        });

        if duration_secs > 0 {
            activity["timestamps"] = json!({
                "start": now,
                "end": now + duration_secs
            });
        }

        let payload = json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": std::process::id(),
                "activity": activity
            },
            "nonce": format!("ytm-{}", now)
        })
        .to_string();

        if let Some(ref mut pipe) = *guard {
            if write_discord_frame(pipe, 1, &payload).is_ok() && read_discord_frame(pipe).is_ok() {
                return Ok(true);
            }
        }

        // Reconnect once if pipe was broken
        *guard = connect_discord_pipe();
        if let Some(ref mut pipe) = *guard {
            if write_discord_frame(pipe, 1, &payload).is_ok() && read_discord_frame(pipe).is_ok() {
                return Ok(true);
            }
        }

        *guard = None;
        Ok(false)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clear_discord_rpc() -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let mutex = get_discord_pipe_mutex();
        if let Ok(mut guard) = mutex.lock() {
            if let Some(ref mut pipe) = *guard {
                let payload = json!({
                    "cmd": "SET_ACTIVITY",
                    "args": {
                        "pid": std::process::id(),
                        "activity": Value::Null
                    },
                    "nonce": "ytm-clear"
                })
                .to_string();
                let _ = write_discord_frame(pipe, 1, &payload);
            }
            *guard = None;
        }
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}


