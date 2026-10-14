use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

struct CachedStream {
    url: String,
    fetched_at: Instant,
}

pub struct StreamResolver {
    cache: Mutex<HashMap<String, CachedStream>>,
    in_flight: tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    semaphore: tokio::sync::Semaphore,
    binary_path: Mutex<Option<PathBuf>>,
    download_lock: tokio::sync::Mutex<()>,
}

impl StreamResolver {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            in_flight: tokio::sync::Mutex::new(HashMap::new()),
            semaphore: tokio::sync::Semaphore::new(2),
            binary_path: Mutex::new(None),
            download_lock: tokio::sync::Mutex::new(()),
        }
    }

    /// Locate or auto-download yt-dlp binary if not present on system
    pub async fn ensure_binary(&self) -> Result<PathBuf, String> {
        // Fast path: already resolved and validated
        {
            let guard = self.binary_path.lock().unwrap();
            if let Some(ref p) = *guard {
                if p.to_string_lossy() == "yt-dlp" || p.is_file() {
                    return Ok(p.clone());
                }
            }
        }

        let _download_guard = self.download_lock.lock().await;

        // Re-check after acquiring download lock
        {
            let guard = self.binary_path.lock().unwrap();
            if let Some(ref p) = *guard {
                if p.to_string_lossy() == "yt-dlp" || p.is_file() {
                    return Ok(p.clone());
                }
            }
        }

        // 1. Check next to running executable
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                let next_to_exe = parent.join("yt-dlp.exe");
                if next_to_exe.is_file() {
                    let mut guard = self.binary_path.lock().unwrap();
                    *guard = Some(next_to_exe.clone());
                    return Ok(next_to_exe);
                }
            }
        }

        // 2. Check local AppData: %LOCALAPPDATA%\Onyx\bin\yt-dlp.exe
        let target_dir = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            PathBuf::from(local_app_data).join("Onyx").join("bin")
        } else if let Ok(app_data) = std::env::var("APPDATA") {
            PathBuf::from(app_data).join("Onyx").join("bin")
        } else {
            std::env::temp_dir().join("Onyx").join("bin")
        };

        let appdata_binary = target_dir.join("yt-dlp.exe");
        if appdata_binary.is_file() {
            let mut guard = self.binary_path.lock().unwrap();
            *guard = Some(appdata_binary.clone());
            return Ok(appdata_binary);
        }

        // 3. Check system PATH
        let path_probe = {
            let mut cmd = tokio::process::Command::new("yt-dlp");
            #[cfg(windows)]
            {
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            cmd.arg("--version");
            tokio::time::timeout(Duration::from_secs(2), cmd.output()).await
        };

        if let Ok(Ok(output)) = path_probe {
            if output.status.success() {
                let p = PathBuf::from("yt-dlp");
                let mut guard = self.binary_path.lock().unwrap();
                *guard = Some(p.clone());
                return Ok(p);
            }
        }

        // 4. Download standalone yt-dlp.exe from official GitHub releases
        let _ = std::fs::create_dir_all(&target_dir);
        let temp_download = target_dir.join("yt-dlp.tmp");

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(90))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe")
            .send()
            .await
            .map_err(|e| format!("Failed to download audio engine (yt-dlp): {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Audio engine download returned HTTP {}", resp.status()));
        }

        let bytes = resp.bytes().await.map_err(|e| format!("Failed to read binary bytes: {}", e))?;
        tokio::fs::write(&temp_download, &bytes).await.map_err(|e| format!("Failed to write binary: {}", e))?;
        let _ = tokio::fs::remove_file(&appdata_binary).await;
        tokio::fs::rename(&temp_download, &appdata_binary).await.map_err(|e| format!("Failed to install binary: {}", e))?;

        let mut guard = self.binary_path.lock().unwrap();
        *guard = Some(appdata_binary.clone());
        Ok(appdata_binary)
    }

    pub async fn resolve_audio_url(&self, video_id: &str) -> Result<String, String> {
        // 1. Fast path: check in-memory cache (TTL: 4 hours)
        {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get(video_id) {
                if cached.fetched_at.elapsed() < Duration::from_secs(4 * 3600) {
                    return Ok(cached.url.clone());
                }
            }
        }

        // 2. Acquire per-video_id async lock for in-flight deduplication
        let video_lock = {
            let mut in_flight = self.in_flight.lock().await;
            in_flight
                .entry(video_id.to_string())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                .clone()
        };

        let _guard = video_lock.lock().await;

        // 3. Re-check cache in case another caller populated it while we waited
        {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get(video_id) {
                if cached.fetched_at.elapsed() < Duration::from_secs(4 * 3600) {
                    return Ok(cached.url.clone());
                }
            }
        }

        // 4. Limit global concurrent yt-dlp child processes to at most 2
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|e| format!("Semaphore error: {}", e))?;

        // Re-check cache after acquiring semaphore permit
        {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get(video_id) {
                if cached.fetched_at.elapsed() < Duration::from_secs(4 * 3600) {
                    return Ok(cached.url.clone());
                }
            }
        }

        // 5. Ensure audio extractor binary is present or downloaded
        let binary_path = self.ensure_binary().await?;

        // 6. Resolve via yt-dlp (strictly anonymous: user Google account cookies are NEVER passed
        //    to stream extraction to keep audio stream resolution 100% isolated from the user's account)
        let video_url = format!("https://www.youtube.com/watch?v={}", video_id);
        let mut cmd = tokio::process::Command::new(&binary_path);
        cmd.kill_on_drop(true);
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.args(&[
            "-f", "251/250/140/ba/b",
            "-g",
            "--no-playlist",
            "--no-warnings",
            "--no-check-certificates",
            "--socket-timeout", "6",
            "--extractor-args", "youtube:player_client=android",
            &video_url,
        ]);

        let output_res = match tokio::time::timeout(Duration::from_secs(10), cmd.output()).await {
            Ok(res) => res.map_err(|e| format!("Failed to execute yt-dlp: {}", e)),
            Err(_) => Err("yt-dlp timed out after 10s".to_string()),
        };

        // Clean up in_flight entry if no other task is waiting on the Arc
        let result = match output_res {
            Ok(output) => {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    Err(format!("yt-dlp stream resolution failed: {}", stderr))
                } else {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    stdout
                        .lines()
                        .find(|line| line.starts_with("https://"))
                        .ok_or_else(|| "No valid stream URL returned by yt-dlp".to_string())
                        .map(|s| s.trim().to_string())
                }
            }
            Err(e) => Err(e),
        };

        if let Ok(ref stream_url) = result {
            // 6. Cache the resolved URL
            let mut cache = self.cache.lock().unwrap();
            cache.insert(
                video_id.to_string(),
                CachedStream {
                    url: stream_url.clone(),
                    fetched_at: Instant::now(),
                },
            );
        }

        {
            let mut in_flight = self.in_flight.lock().await;
            if Arc::strong_count(&video_lock) <= 2 {
                in_flight.remove(video_id);
            }
        }

        result
    }
}
