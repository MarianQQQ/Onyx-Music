use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricLine {
    pub time_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncedLyrics {
    pub plain_lyrics: Option<String>,
    pub lines: Vec<LyricLine>,
}

#[derive(Deserialize)]
struct LrclibResponse {
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
}

pub struct LyricsService {
    client: Client,
}

impl LyricsService {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }

    pub async fn get_lyrics(
        &self,
        title: &str,
        artist: &str,
        duration_seconds: Option<u32>,
    ) -> Result<SyncedLyrics, String> {
        let clean_title = sanitize_title(title, artist);

        let mut req = self
            .client
            .get("https://lrclib.net/api/get")
            .query(&[("track_name", clean_title.as_str()), ("artist_name", artist)]);

        let dur_str;
        if let Some(dur) = duration_seconds {
            if dur > 0 {
                dur_str = dur.to_string();
                req = req.query(&[("duration", dur_str.as_str())]);
            }
        }

        let resp = req
            .header("User-Agent", "YTMusicDesktop/1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to reach LRCLIB: {}", e))?;

        if !resp.status().is_success() {
            return Ok(SyncedLyrics {
                plain_lyrics: None,
                lines: Vec::new(),
            });
        }

        let body: LrclibResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse LRCLIB response: {}", e))?;

        let lines = if let Some(synced) = body.synced_lyrics.as_deref() {
            parse_lrc(synced)
        } else {
            Vec::new()
        };

        Ok(SyncedLyrics {
            plain_lyrics: body.plain_lyrics,
            lines,
        })
    }
}

fn sanitize_title(title: &str, artist: &str) -> String {
    let mut t = title.to_string();

    // Remove noise regexes / strings
    let noise = [
        "(Official Music Video)",
        "(Official Video)",
        "(Official Audio)",
        "[Official Music Video]",
        "[Official Video]",
        "[Official Audio]",
        "(Audio)",
        "(HD)",
        "(Lyrics)",
        "[Lyrics]",
        "(Lyric Video)",
        "[Lyric Video]",
        "(Visualizer)",
        "(Remastered)",
        "[Remastered]",
        "(Live)",
        "[Live]",
    ];

    for n in noise {
        t = t.replace(n, "");
    }

    // Strip "Artist - " prefix if present
    let prefix = format!("{} - ", artist);
    if t.to_lowercase().starts_with(&prefix.to_lowercase()) {
        t = t[prefix.len()..].to_string();
    }

    t.trim().to_string()
}

fn parse_lrc(lrc: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    for line in lrc.lines() {
        let line = line.trim();
        if !line.starts_with('[') {
            continue;
        }

        if let Some(bracket_end) = line.find(']') {
            let timestamp_str = &line[1..bracket_end];
            let text = line[bracket_end + 1..].trim().to_string();

            if let Some(time_ms) = parse_timestamp(timestamp_str) {
                lines.push(LyricLine { time_ms, text });
            }
        }
    }
    lines
}

fn parse_timestamp(ts: &str) -> Option<u64> {
    // Format: "mm:ss.xx" or "mm:ss"
    let parts: Vec<&str> = ts.split(':').collect();
    if parts.len() != 2 {
        return None;
    }

    let minutes: u64 = parts[0].parse().ok()?;
    let sec_parts: Vec<&str> = parts[1].split('.').collect();
    let seconds: u64 = sec_parts[0].parse().ok()?;
    let millis: u64 = if sec_parts.len() > 1 {
        let ms_str = sec_parts[1];
        if ms_str.len() == 2 {
            ms_str.parse::<u64>().ok()? * 10
        } else if ms_str.len() >= 3 {
            ms_str[..3].parse::<u64>().ok()?
        } else {
            0
        }
    } else {
        0
    };

    Some(minutes * 60_000 + seconds * 1_000 + millis)
}
