use super::models::{AlbumItem, ArtistItem, ArtistProfile, ChartItem, ChartsData, ExploreFeed, MoodCategoryData, MoodCategorySection, MoodGenreItem, Playlist, SavedPlaylist, SearchSuggestions, SuggestionItem, Track, UnifiedSearchResults};
use reqwest::Client;
use serde_json::{json, Value};

pub const WEB_REMIX_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
pub const WEB_REMIX_CLIENT_VERSION: &str = "1.20250101.01.00";

pub struct YTClient;

impl YTClient {
    /// Perform instant search via YouTube Music InnerTube API (0 child processes, ~50ms)
    pub async fn search(query: &str, limit: usize, filter: Option<&str>) -> Result<Vec<Track>, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .unwrap_or_else(|_| Client::new());

        let params = match filter {
            Some("songs") => Some("EgWKAQIIAWoMEAMQBBAJEAoQBRAV"),
            Some("videos") => Some("EgWKAQIQAWoMEAMQBBAJEAoQBRAV"),
            Some("albums") => Some("EgWKAQIYAWoMEAMQBBAJEAoQBRAV"),
            Some("artists") => Some("EgWKAQIgAWoMEAMQBBAJEAoQBRAV"),
            _ => None,
        };

        let mut payload = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": WEB_REMIX_CLIENT_VERSION,
                    "hl": "en",
                    "gl": "US"
                }
            },
            "query": query
        });

        if let Some(p) = params {
            payload["params"] = json!(p);
        }

        let resp = client
            .post("https://music.youtube.com/youtubei/v1/search")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .json(&payload)
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(root) = res.json::<Value>().await {
                    let tracks = Self::parse_innertube_search(&root, limit);
                    if !tracks.is_empty() {
                        return Ok(tracks);
                    }
                }
            }
        }

        // Fallback to yt-dlp with CREATE_NO_WINDOW if InnerTube fails
        Self::search_ytdlp_fallback(query, limit).await
    }

    /// Direct InnerTube home explore feed (charts & trending)
    pub async fn get_home_feed() -> Result<Vec<Track>, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(6))
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
            },
            "browseId": "FEmusic_home"
        });

        if let Ok(resp) = client
            .post("https://music.youtube.com/youtubei/v1/browse")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .json(&payload)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(root) = resp.json::<Value>().await {
                    let tracks = Self::parse_innertube_browse(&root, 30);
                    if !tracks.is_empty() {
                        return Ok(tracks);
                    }
                }
            }
        }

        // Reliable fallback: Instant search for trending charts
        Self::search("Trending Music", 30, None).await
    }

    pub async fn get_playlist(url_or_id: &str, cookies_path: Option<&str>) -> Result<Playlist, String> {
        // Extract raw playlist ID if given full URL or ID
        let clean_id = if let Some(pos) = url_or_id.find("list=") {
            let sub = &url_or_id[pos + 5..];
            sub.split('&').next().unwrap_or(sub).to_string()
        } else {
            url_or_id.trim().to_string()
        };

        // 1. Try native InnerTube browse (Instant <300ms, 0 CPU, multi-page 100+ tracks)
        if let Ok(pl) = Self::get_playlist_innertube(&clean_id, cookies_path).await {
            if !pl.tracks.is_empty() {
                return Ok(pl);
            }
        }

        // 2. Fallback to yt-dlp if InnerTube did not find tracks
        let full_url = if url_or_id.starts_with("http") {
            url_or_id.to_string()
        } else {
            format!("https://www.youtube.com/playlist?list={}", clean_id)
        };

        let mut cmd = tokio::process::Command::new("yt-dlp");
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.args(&[
            &full_url,
            "--dump-single-json",
            "--flat-playlist",
            "--no-warnings",
        ]);

        if let Some(cookies) = cookies_path.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if std::path::Path::new(cookies).exists() {
                cmd.arg("--cookies").arg(cookies);
            }
        }

        let output = cmd
            .output()
            .await
            .map_err(|e| format!("Failed to run yt-dlp playlist dump: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Playlist fetch failed: {}", err));
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let root: Value = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse playlist JSON: {}", e))?;

        let playlist_id = root.get("id").and_then(|v| v.as_str()).unwrap_or(&clean_id).to_string();
        let title = root.get("title").and_then(|v| v.as_str()).unwrap_or("Playlist").to_string();

        let mut tracks = Vec::new();
        if let Some(entries) = root.get("entries").and_then(|e| e.as_array()) {
            for entry in entries {
                if let Some(track) = Self::parse_track_entry(entry) {
                    tracks.push(track);
                }
            }
        }

        let track_count = tracks.len();

        Ok(Playlist {
            id: playlist_id,
            title,
            track_count,
            tracks,
        })
    }

    pub async fn get_playlist_innertube(playlist_id: &str, cookies: Option<&str>) -> Result<Playlist, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| Client::new());

        let clean = playlist_id.trim();
        let browse_id = if clean.starts_with("VL")
            || clean.starts_with("MPREb_")
            || clean.starts_with("FEmusic_")
        {
            clean.to_string()
        } else {
            format!("VL{}", clean)
        };

        let cookie_header = cookies
            .map(|c| c.trim())
            .filter(|c| !c.is_empty())
            .map(|c| {
                if std::path::Path::new(c).exists() {
                    std::fs::read_to_string(c)
                        .map(|s| normalize_cookie_header(&s))
                        .unwrap_or_default()
                } else {
                    normalize_cookie_header(c)
                }
            })
            .filter(|c| !c.is_empty());

        let body = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": WEB_REMIX_CLIENT_VERSION,
                    "hl": "en",
                    "gl": "US"
                }
            },
            "browseId": browse_id
        });

        let mut req = client
            .post("https://music.youtube.com/youtubei/v1/browse")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .header("Origin", "https://music.youtube.com")
            .header("X-Origin", "https://music.youtube.com");

        if let Some(ref ch) = cookie_header {
            req = req
                .header("X-Goog-AuthUser", "0")
                .header("Cookie", ch);
            if let Some(sapisid) = extract_sapisid(ch) {
                let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
                req = req.header("Authorization", auth);
            }
        }

        let resp = req
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("InnerTube request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("InnerTube HTTP {}", resp.status()));
        }

        let root: Value = resp.json().await.map_err(|e| format!("JSON decode error: {}", e))?;

        let resp_header = root
            .pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicResponsiveHeaderRenderer")
            .or_else(|| root.pointer("/header/musicResponsiveHeaderRenderer"))
            .or_else(|| root.pointer("/header/musicDetailHeaderRenderer"));

        let title = resp_header
            .and_then(|h| h.pointer("/title/runs/0/text"))
            .or_else(|| root.pointer("/microformat/microformatDataRenderer/title"))
            .and_then(|v| v.as_str())
            .unwrap_or("YouTube Playlist")
            .trim_end_matches(" - YouTube Music")
            .to_string();

        let header_artist = resp_header
            .and_then(|h| h.pointer("/straplineTextOne/runs"))
            .and_then(|runs| runs.as_array())
            .map(|runs| {
                let parts: Vec<&str> = runs
                    .iter()
                    .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                    .map(|t| t.trim())
                    .filter(|&t| !t.is_empty() && t != "•" && t != "," && t != "&")
                    .collect();
                parts.join(", ")
            })
            .filter(|s| !s.is_empty());

        let header_artist_id = resp_header
            .and_then(|h| h.pointer("/straplineTextOne/runs/0/navigationEndpoint/browseEndpoint/browseId"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let header_thumb = resp_header
            .and_then(|h| h.pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails"))
            .or_else(|| root.pointer("/microformat/microformatDataRenderer/thumbnail/thumbnails"))
            .and_then(|t| t.as_array())
            .and_then(|arr| arr.last())
            .and_then(|th| th.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        let mut tracks = Vec::new();

        // 1. Check secondaryContents (musicPlaylistShelfRenderer OR musicShelfRenderer for MPREb_ albums)
        if let Some(sec_contents) = root
            .pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents")
            .and_then(|c| c.as_array())
        {
            for sec in sec_contents {
                let items_opt = sec
                    .pointer("/musicPlaylistShelfRenderer/contents")
                    .or_else(|| sec.pointer("/musicShelfRenderer/contents"))
                    .and_then(|c| c.as_array());
                if let Some(items) = items_opt {
                    for item in items {
                        if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                            if let Some(track) = Self::extract_responsive_item(resp_item) {
                                tracks.push(track);
                            }
                        }
                    }
                }
            }
        }

        // 2. Check tabs musicPlaylistShelfRenderer / musicShelfRenderer
        if tracks.is_empty() {
            if let Some(sec_contents) = root
                .pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
                .and_then(|c| c.as_array())
            {
                for sec in sec_contents {
                    let items_opt = sec
                        .pointer("/musicPlaylistShelfRenderer/contents")
                        .or_else(|| sec.pointer("/musicShelfRenderer/contents"))
                        .and_then(|c| c.as_array());
                    if let Some(items) = items_opt {
                        for item in items {
                            if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                                if let Some(track) = Self::extract_responsive_item(resp_item) {
                                    tracks.push(track);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Check singleColumnBrowseResultsRenderer
        if tracks.is_empty() {
            if let Some(sections) = root
                .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
                .and_then(|c| c.as_array())
            {
                for section in sections {
                    let items_opt = section
                        .pointer("/musicPlaylistShelfRenderer/contents")
                        .or_else(|| section.pointer("/musicShelfRenderer/contents"))
                        .and_then(|c| c.as_array());
                    if let Some(items) = items_opt {
                        for item in items {
                            if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                                if let Some(track) = Self::extract_responsive_item(resp_item) {
                                    tracks.push(track);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fetch all subsequent continuation pages (up to 30 pages = 3,000+ tracks)
        if !tracks.is_empty() {
            Self::fetch_all_browse_continuations(
                &client,
                &root,
                &mut tracks,
                cookie_header.as_deref(),
                30,
            )
            .await;
        }

        // Enrich tracks with album header metadata when individual rows omit artist/thumbnail
        for t in &mut tracks {
            if (t.artist == "Unknown Artist" || t.artist.is_empty() || t.artist == "-" || Self::is_metadata_or_type_token(&t.artist)) && header_artist.is_some() {
                t.artist = header_artist.clone().unwrap();
            }
            Self::sanitize_track_artist_and_title(&mut t.title, &mut t.artist);
            if t.artist_id.is_none() && header_artist_id.is_some() {
                t.artist_id = header_artist_id.clone();
            }
            if t.thumbnail_url.is_none() && header_thumb.is_some() {
                t.thumbnail_url = header_thumb.clone();
            }
            if t.album.is_none() && clean.starts_with("MPREb_") {
                t.album = Some(title.clone());
            }
        }

        let track_count = tracks.len();
        if track_count == 0 {
            return Err("No tracks found in InnerTube browse response".to_string());
        }

        Ok(Playlist {
            id: playlist_id.to_string(),
            title,
            track_count,
            tracks,
        })
    }

    fn parse_innertube_search(root: &Value, limit: usize) -> Vec<Track> {
        let mut tracks = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        // 1. Check musicCardShelfRenderer (Top Result card)
        if let Some(card) = root.pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicCardShelfRenderer") {
            let video_id = card
                .pointer("/buttons/0/buttonRenderer/command/watchEndpoint/videoId")
                .or_else(|| card.pointer("/title/runs/0/navigationEndpoint/watchEndpoint/videoId"))
                .and_then(|v| v.as_str());

            if let Some(vid) = video_id {
                let title = card.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("Top Result").to_string();
                let mut artist_parts = Vec::new();
                let mut artist_id = None;
                let mut duration_seconds = 0;

                if let Some(runs) = card.pointer("/subtitle/runs").and_then(|r| r.as_array()) {
                    for run in runs {
                        if let Some(txt) = run.get("text").and_then(|v| v.as_str()) {
                            let t = txt.trim();
                            if t.is_empty() || t == "•" || t == "," || t == "&" || t == "-" {
                                continue;
                            }
                            if t.eq_ignore_ascii_case("Song")
                                || t.eq_ignore_ascii_case("Video")
                                || t.eq_ignore_ascii_case("Album")
                                || t.eq_ignore_ascii_case("Single")
                                || t.eq_ignore_ascii_case("EP")
                                || t.contains("views")
                                || t.contains("plays")
                            {
                                continue;
                            }
                            if t.contains(':') && t.chars().all(|c| c.is_ascii_digit() || c == ':') {
                                duration_seconds = parse_duration_string(t);
                                continue;
                            }
                            if artist_id.is_none() {
                                artist_id = run
                                    .pointer("/navigationEndpoint/browseEndpoint/browseId")
                                    .and_then(|v| v.as_str())
                                    .filter(|id| id.starts_with("UC"))
                                    .map(|s| s.to_string());
                            }
                            artist_parts.push(t.to_string());
                        }
                    }
                }

                let artist = if artist_parts.is_empty() {
                    "YouTube Music".to_string()
                } else {
                    artist_parts.join(", ")
                };

                let thumb = card
                    .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                    .and_then(|t| t.as_array())
                    .and_then(|a| a.last())
                    .and_then(|l| l.get("url"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string());

                seen_ids.insert(vid.to_string());
                tracks.push(Track {
                    id: vid.to_string(),
                    title,
                    artist,
                    artist_id,
                    album: None,
                    duration_seconds,
                    thumbnail_url: thumb,
                    views: None,
                });
            }

            // Also extract songs inside the card shelf's contents
            if let Some(card_items) = card.get("contents").and_then(|c| c.as_array()) {
                for item in card_items {
                    if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                        if let Some(track) = Self::extract_responsive_item(resp_item) {
                            if seen_ids.insert(track.id.clone()) {
                                tracks.push(track);
                            }
                        }
                    }
                }
            }
        }

        let contents = match root
            .pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
            .and_then(|c| c.as_array())
        {
            Some(c) => c,
            None => return tracks,
        };

        for section in contents {
            // Check shelf title to skip Podcast Episodes / Profiles
            let shelf_title = section
                .pointer("/musicShelfRenderer/title/runs/0/text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            if shelf_title.contains("episode") || shelf_title.contains("podcast") || shelf_title.contains("profile") {
                continue;
            }

            // Check itemSectionRenderer
            if let Some(items) = section
                .pointer("/itemSectionRenderer/contents")
                .and_then(|i| i.as_array())
            {
                for item in items {
                    if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                        if let Some(track) = Self::extract_responsive_item(resp_item) {
                            if !track.artist.starts_with("Episode,") && seen_ids.insert(track.id.clone()) {
                                tracks.push(track);
                                if tracks.len() >= limit {
                                    return tracks;
                                }
                            }
                        }
                    }
                }
            }

            // Check musicShelfRenderer
            if let Some(items) = section
                .pointer("/musicShelfRenderer/contents")
                .and_then(|i| i.as_array())
            {
                for item in items {
                    if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                        if let Some(track) = Self::extract_responsive_item(resp_item) {
                            if !track.artist.starts_with("Episode,") && seen_ids.insert(track.id.clone()) {
                                tracks.push(track);
                                if tracks.len() >= limit {
                                    return tracks;
                                }
                            }
                        }
                    }
                }
            }
        }

        tracks
    }

    fn parse_innertube_browse(root: &Value, limit: usize) -> Vec<Track> {
        let mut tracks = Vec::new();
        let contents = match root
            .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
            .and_then(|c| c.as_array())
        {
            Some(c) => c,
            None => return tracks,
        };

        for section in contents {
            if let Some(items) = section
                .pointer("/musicCarouselShelfRenderer/contents")
                .and_then(|i| i.as_array())
            {
                for item in items {
                    if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                        if let Some(track) = Self::extract_responsive_item(resp_item) {
                            tracks.push(track);
                            if tracks.len() >= limit {
                                return tracks;
                            }
                        }
                    } else if let Some(two_row) = item.get("musicTwoRowItemRenderer") {
                        if let Some(track) = Self::extract_two_row_item(two_row) {
                            tracks.push(track);
                            if tracks.len() >= limit {
                                return tracks;
                            }
                        }
                    }
                }
            }
        }

        tracks
    }

    pub(crate) fn is_metadata_or_type_token(t: &str) -> bool {
        let s = t.trim();
        if s.is_empty() || s == "•" || s == "," || s == "&" || s == "-" {
            return true;
        }
        let lower = s.to_lowercase();
        if lower == "video"
            || lower == "song"
            || lower == "album"
            || lower == "single"
            || lower == "ep"
            || lower == "відео"
            || lower == "видео"
            || lower == "пісня"
            || lower == "песня"
            || lower == "альбом"
            || lower == "сингл"
            || lower == "міні-альбом"
            || lower == "мини-альбом"
            || lower == "mini-album"
            || lower == "реліз"
            || lower == "релиз"
            || lower == "release"
            || lower == "unknown artist"
            || lower == "youtube"
            || lower == "youtube music"
            || lower.ends_with("views")
            || lower.ends_with("plays")
            || lower.ends_with("listeners")
            || lower.ends_with("subscribers")
            || lower.contains("перегляд")
            || lower.contains("просмотр")
            || lower.contains("прослуховуван")
        {
            return true;
        }
        parse_duration_string(s) > 0
    }

    pub(crate) fn sanitize_track_artist_and_title(title: &mut String, artist: &mut String) {
        // 1. Strip trailing hashtags like #music #rock #alternativerock
        if let Some(hash_pos) = title.find('#') {
            let after = &title[hash_pos..];
            if after.split_whitespace().all(|token| token.starts_with('#')) {
                *title = title[..hash_pos].trim().to_string();
            }
        }

        let a_clean = artist.trim();
        let is_generic = Self::is_metadata_or_type_token(a_clean);

        for sep in &[" - ", " – ", " — "] {
            if let Some(pos) = title.find(sep) {
                let left = title[..pos].trim();
                let right = title[pos + sep.len()..].trim();
                if !left.is_empty() && !right.is_empty() {
                    if is_generic {
                        *artist = left.to_string();
                        *title = right.to_string();
                        return;
                    }

                    // If artist is composite (e.g. "Andromeda / Follentass / Андрей Щербин")
                    // and `left` contains or matches one of the composite aliases
                    if artist.contains(" / ") {
                        let matches_alias = artist.split('/').any(|part| {
                            let p = part.trim().to_lowercase();
                            let l = left.to_lowercase();
                            l == p || l.contains(&p) || p.contains(&l)
                        });
                        if matches_alias {
                            *artist = left.to_string();
                            *title = right.to_string();
                            return;
                        }
                    }

                    // If title starts with the exact artist name (e.g. artist is "Andromeda", title is "Andromeda - Song")
                    if artist.eq_ignore_ascii_case(left) {
                        *title = right.to_string();
                        return;
                    }
                }
            }
        }
    }

    pub(crate) fn extract_artist_and_id_from_runs(runs: &[Value]) -> (String, Option<String>) {
        // 1. Prefer run with browseEndpoint pointing to an artist channel (UC... or FEmusic_library)
        for r in runs {
            if let Some(bid) = r.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|v| v.as_str()) {
                if bid.starts_with("UC") || bid.starts_with("FEmusic_library") {
                    if let Some(txt) = r.get("text").and_then(|v| v.as_str()).map(|t| t.trim()).filter(|t| !t.is_empty()) {
                        if !Self::is_metadata_or_type_token(txt) {
                            return (txt.to_string(), Some(bid.to_string()));
                        }
                    }
                }
            }
        }

        // 2. Collect tokens that are not metadata/type tokens
        let mut parts = Vec::new();
        let mut found_id = None;
        for r in runs {
            if let Some(txt) = r.get("text").and_then(|v| v.as_str()).map(|t| t.trim()) {
                if Self::is_metadata_or_type_token(txt) {
                    continue;
                }
                if found_id.is_none() {
                    found_id = r
                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                        .and_then(|v| v.as_str())
                        .filter(|id| id.starts_with("UC") || id.starts_with("FEmusic_library"))
                        .map(|s| s.to_string());
                }
                parts.push(txt.to_string());
            }
        }

        if !parts.is_empty() {
            (parts.join(", "), found_id)
        } else {
            ("Unknown Artist".to_string(), None)
        }
    }

    fn is_views_or_plays_string(s: &str) -> bool {
        let lower = s.to_lowercase();
        let has_keyword = lower.contains("play")
            || lower.contains("view")
            || lower.contains("перегляд")
            || lower.contains("прослухов")
            || lower.contains("відтворен");
        let has_digit = s.chars().any(|c| c.is_ascii_digit());
        has_keyword && has_digit
    }

    fn extract_responsive_item(item: &Value) -> Option<Track> {
        // Video ID from play button or navigation endpoint
        let id = item
            .pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId")
            .or_else(|| item.pointer("/playlistItemData/videoId"))
            .or_else(|| item.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/watchEndpoint/videoId"))
            .and_then(|v| v.as_str())?
            .to_string();

        let mut title = item
            .pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Title")
            .to_string();

        let (mut artist, mut artist_id) = item
            .pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs")
            .and_then(|runs| runs.as_array())
            .map(|runs| Self::extract_artist_and_id_from_runs(runs))
            .unwrap_or_else(|| ("Unknown Artist".to_string(), None));

        // If flexColumns/1 was just "Video" or metadata (e.g. search where col 1 is type), check flexColumns/2
        if artist == "Unknown Artist" || Self::is_metadata_or_type_token(&artist) {
            if let Some(col2_runs) = item.pointer("/flexColumns/2/musicResponsiveListItemFlexColumnRenderer/text/runs").and_then(|r| r.as_array()) {
                let (col2_artist, col2_id) = Self::extract_artist_and_id_from_runs(col2_runs);
                if col2_artist != "Unknown Artist" && !Self::is_metadata_or_type_token(&col2_artist) {
                    artist = col2_artist;
                    if artist_id.is_none() {
                        artist_id = col2_id;
                    }
                }
            }
        }

        Self::sanitize_track_artist_and_title(&mut title, &mut artist);

        if artist_id.is_none() {
            artist_id = item.pointer("/navigationEndpoint/browseEndpoint/browseId")
                .and_then(|v| v.as_str())
                .filter(|id| id.starts_with("UC"))
                .map(|id| id.to_string());
        }

        let mut extracted_duration = 0;
        let mut extracted_views: Option<String> = None;

        // 1. Search fixedColumns for duration or views (title.runs or text.runs or simpleText)
        if let Some(fixed_cols) = item.get("fixedColumns").and_then(|c| c.as_array()) {
            for col in fixed_cols {
                if let Some(renderer) = col.get("musicResponsiveListItemFixedColumnRenderer") {
                    let runs_opt = renderer
                        .pointer("/title/runs")
                        .or_else(|| renderer.pointer("/text/runs"))
                        .and_then(|r| r.as_array());

                    if let Some(runs) = runs_opt {
                        for r in runs {
                            if let Some(txt) = r.get("text").and_then(|t| t.as_str()) {
                                let trimmed = txt.trim();
                                let d = parse_duration_string(trimmed);
                                if d > 0 && extracted_duration == 0 {
                                    extracted_duration = d;
                                }
                                if Self::is_views_or_plays_string(trimmed) && extracted_views.is_none() {
                                    extracted_views = Some(trimmed.to_string());
                                }
                            }
                        }
                    }

                    let simple_opt = renderer
                        .pointer("/title/simpleText")
                        .or_else(|| renderer.pointer("/text/simpleText"))
                        .and_then(|t| t.as_str());

                    if let Some(txt) = simple_opt {
                        let trimmed = txt.trim();
                        let d = parse_duration_string(trimmed);
                        if d > 0 && extracted_duration == 0 {
                            extracted_duration = d;
                        }
                        if Self::is_views_or_plays_string(trimmed) && extracted_views.is_none() {
                            extracted_views = Some(trimmed.to_string());
                        }
                    }
                }
            }
        }

        // 2. Search flexColumns for duration and views
        if let Some(flex_cols) = item.get("flexColumns").and_then(|c| c.as_array()) {
            for col in flex_cols {
                let runs_opt = col
                    .pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs")
                    .or_else(|| col.pointer("/musicResponsiveListItemFlexColumnRenderer/title/runs"))
                    .and_then(|r| r.as_array());

                if let Some(runs) = runs_opt {
                    for r in runs {
                        if let Some(txt) = r.get("text").and_then(|t| t.as_str()) {
                            let trimmed = txt.trim();
                            let d = parse_duration_string(trimmed);
                            if d > 0 && extracted_duration == 0 {
                                extracted_duration = d;
                            }
                            if Self::is_views_or_plays_string(trimmed) && extracted_views.is_none() {
                                extracted_views = Some(trimmed.to_string());
                            }
                        }
                    }
                }
            }
        }

        // 3. Fallbacks for duration
        if extracted_duration == 0 {
            if let Some(txt) = item.pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/title/runs/0/text")
                .or_else(|| item.pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/runs/0/text"))
                .or_else(|| item.pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/title/simpleText"))
                .or_else(|| item.pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/simpleText"))
                .or_else(|| item.pointer("/lengthText/runs/0/text"))
                .or_else(|| item.pointer("/lengthText/simpleText"))
                .or_else(|| item.pointer("/duration/runs/0/text"))
                .or_else(|| item.pointer("/duration/simpleText"))
                .or_else(|| item.pointer("/accessibility/accessibilityData/label"))
                .and_then(|v| v.as_str())
            {
                extracted_duration = parse_duration_string(txt);
            }
        }

        // 4. Subtitle fallback for views
        if extracted_views.is_none() {
            if let Some(runs) = item.pointer("/subtitle/runs").and_then(|r| r.as_array()) {
                for r in runs {
                    if let Some(txt) = r.get("text").and_then(|t| t.as_str()) {
                        let trimmed = txt.trim();
                        if Self::is_views_or_plays_string(trimmed) {
                            extracted_views = Some(trimmed.to_string());
                            break;
                        }
                    }
                }
            }
        }

        let raw_album = item
            .pointer("/flexColumns/2/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
            .and_then(|v| v.as_str())
            .map(|s| s.trim());

        let album = match raw_album {
            Some(s) if !s.is_empty() && !Self::is_views_or_plays_string(s) => Some(s.to_string()),
            Some(s) if Self::is_views_or_plays_string(s) => {
                if extracted_views.is_none() {
                    extracted_views = Some(s.to_string());
                }
                None
            }
            _ => None,
        };

        let thumbnail_url = item
            .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
            .and_then(|t| t.as_array())
            .and_then(|arr| arr.last())
            .and_then(|th| th.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        Some(Track {
            id,
            title,
            artist,
            artist_id,
            album,
            duration_seconds: extracted_duration,
            thumbnail_url,
            views: extracted_views,
        })
    }

    fn extract_two_row_item(item: &Value) -> Option<Track> {
        let id = item
            .pointer("/navigationEndpoint/watchEndpoint/videoId")
            .or_else(|| item.pointer("/thumbnailOverlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId"))
            .and_then(|v| v.as_str())?
            .to_string();

        let mut title = item
            .pointer("/title/runs/0/text")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Title")
            .to_string();

        let (mut artist, artist_id) = item
            .pointer("/subtitle/runs")
            .and_then(|runs| runs.as_array())
            .map(|runs| Self::extract_artist_and_id_from_runs(runs))
            .unwrap_or_else(|| {
                let art = item.pointer("/subtitle/runs/0/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("YouTube Music")
                    .to_string();
                (art, None)
            });

        let mut views = None;
        if let Some(runs) = item.pointer("/subtitle/runs").and_then(|r| r.as_array()) {
            for r in runs {
                if let Some(txt) = r.get("text").and_then(|t| t.as_str()) {
                    let trimmed = txt.trim();
                    if Self::is_views_or_plays_string(trimmed) {
                        views = Some(trimmed.to_string());
                        break;
                    }
                }
            }
        }

        Self::sanitize_track_artist_and_title(&mut title, &mut artist);

        let thumbnail_url = item
            .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
            .and_then(|t| t.as_array())
            .and_then(|arr| arr.last())
            .and_then(|th| th.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        Some(Track {
            id,
            title,
            artist,
            artist_id,
            album: None,
            duration_seconds: 0,
            thumbnail_url,
            views,
        })
    }

    async fn search_ytdlp_fallback(query: &str, limit: usize) -> Result<Vec<Track>, String> {
        let search_arg = format!("ytsearch{}:{}", limit, query);
        let mut cmd = tokio::process::Command::new("yt-dlp");
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.args(&[
            &search_arg,
            "--dump-single-json",
            "--flat-playlist",
            "--no-warnings",
        ]);

        let output = cmd
            .output()
            .await
            .map_err(|e| format!("Failed to run fallback search: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Search failed: {}", err));
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let root: Value = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse search JSON: {}", e))?;

        let mut tracks = Vec::new();
        if let Some(entries) = root.get("entries").and_then(|e| e.as_array()) {
            for entry in entries {
                if let Some(track) = Self::parse_track_entry(entry) {
                    tracks.push(track);
                }
            }
        }

        Ok(tracks)
    }

    fn parse_track_entry(entry: &Value) -> Option<Track> {
        let id = entry.get("id").and_then(|v| v.as_str())?.to_string();
        let raw_title = entry.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown Title");
        let artist = entry
            .get("channel")
            .or_else(|| entry.get("uploader"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Artist")
            .to_string();

        let duration_seconds = entry
            .get("duration")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        let thumbnail_url = entry.get("thumbnails").and_then(|t| t.as_array()).and_then(|arr| {
            arr.last().and_then(|th| th.get("url")).and_then(|u| u.as_str())
        }).map(|s| s.to_string());

        let views = entry.get("view_count").and_then(|v| v.as_u64()).map(|n| {
            if n >= 1_000_000_000 {
                format!("{:.1}B views", n as f64 / 1_000_000_000.0)
            } else if n >= 1_000_000 {
                format!("{:.1}M views", n as f64 / 1_000_000.0)
            } else if n >= 1_000 {
                format!("{}K views", n / 1_000)
            } else {
                format!("{} views", n)
            }
        });

        let artist_id = entry.get("channel_id").and_then(|v| v.as_str()).map(|s| s.to_string());

        Some(Track {
            id,
            title: raw_title.to_string(),
            artist,
            artist_id,
            album: None,
            duration_seconds,
            thumbnail_url,
            views,
        })
    }

    pub async fn resolve_artist_id(query: &str) -> Option<String> {
        let clean = query.trim();
        if clean.starts_with("UC") || clean.starts_with("FEmusic") {
            return Some(clean.to_string());
        }

        // If composite name like "Andromeda / Follentass / Андрей Щербин", take first alias
        let search_name = clean.split('/').next().unwrap_or(clean).trim();

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(5))
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
            },
            "query": search_name,
            "params": "EgWKAQIgAWoMEAMQBBAJEAoQBRAV" // Artists filter
        });

        if let Ok(resp) = client
            .post("https://music.youtube.com/youtubei/v1/search")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .json(&payload)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(root) = resp.json::<Value>().await {
                    if let Some(card_id) = root
                        .pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicCardShelfRenderer/title/runs/0/navigationEndpoint/browseEndpoint/browseId")
                        .and_then(|v| v.as_str())
                    {
                        if card_id.starts_with("UC") || card_id.starts_with("FEmusic") {
                            return Some(card_id.to_string());
                        }
                    }

                    if let Some(sections) = root
                        .pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
                        .and_then(|c| c.as_array())
                    {
                        for sec in sections {
                            if let Some(items) = sec.pointer("/musicShelfRenderer/contents").and_then(|i| i.as_array()) {
                                for item in items {
                                    if let Some(id) = item
                                        .pointer("/musicResponsiveListItemRenderer/navigationEndpoint/browseEndpoint/browseId")
                                        .or_else(|| item.pointer("/musicResponsiveListItemRenderer/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/browseEndpoint/browseId"))
                                        .and_then(|v| v.as_str())
                                    {
                                        if id.starts_with("UC") || id.starts_with("FEmusic") {
                                            return Some(id.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fallback: search without filter and look for artist_id
        if let Ok(tracks) = Self::search(search_name, 5, None).await {
            for t in tracks {
                if let Some(aid) = t.artist_id {
                    if aid.starts_with("UC") {
                        return Some(aid);
                    }
                }
            }
        }

        None
    }

    pub async fn get_artist_profile(browse_id: &str) -> Result<ArtistProfile, String> {
        let effective_id = if !browse_id.starts_with("UC") && !browse_id.starts_with("FEmusic") {
            Self::resolve_artist_id(browse_id).await.unwrap_or_else(|| browse_id.to_string())
        } else {
            browse_id.to_string()
        };

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
            },
            "browseId": effective_id
        });

        let resp = client
            .post("https://music.youtube.com/youtubei/v1/browse")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Network request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("InnerTube HTTP error: {}", resp.status()));
        }

        let root: Value = resp.json().await.map_err(|e| format!("JSON decode error: {}", e))?;

        let header = root.get("header");
        let name = header
            .and_then(|h| h.pointer("/musicImmersiveHeaderRenderer/title/runs/0/text"))
            .or_else(|| header.and_then(|h| h.pointer("/musicVisualHeaderRenderer/title/runs/0/text")))
            .or_else(|| header.and_then(|h| h.pointer("/musicResponsiveHeaderRenderer/title/runs/0/text")))
            .or_else(|| root.pointer("/microformat/microformatDataRenderer/title"))
            .and_then(|v| v.as_str())
            .unwrap_or("Artist")
            .trim_end_matches(" - YouTube Music")
            .to_string();

        let audience = header
            .and_then(|h| h.pointer("/musicImmersiveHeaderRenderer/subscriptionButton/subscribeButtonRenderer/subscriberCountText/runs/0/text"))
            .or_else(|| header.and_then(|h| h.pointer("/musicVisualHeaderRenderer/subscriptionButton/subscribeButtonRenderer/subscriberCountText/runs/0/text")))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let sub_btn = header
            .and_then(|h| h.pointer("/musicImmersiveHeaderRenderer/subscriptionButton/subscribeButtonRenderer"))
            .or_else(|| header.and_then(|h| h.pointer("/musicVisualHeaderRenderer/subscriptionButton/subscribeButtonRenderer")))
            .or_else(|| header.and_then(|h| h.pointer("/musicHeaderRenderer/subscriptionButton/subscribeButtonRenderer")));

        let subscribed = sub_btn.and_then(|b| b.get("subscribed").and_then(|v| v.as_bool()));
        let channel_id = sub_btn
            .and_then(|b| b.get("channelId").and_then(|v| v.as_str()))
            .map(|s| s.to_string())
            .or_else(|| if effective_id.starts_with("UC") { Some(effective_id.clone()) } else { None });
        let subscriber_count = audience.clone();

        let description = header
            .and_then(|h| h.pointer("/musicImmersiveHeaderRenderer/description/runs/0/text"))
            .or_else(|| header.and_then(|h| h.pointer("/musicVisualHeaderRenderer/description/runs/0/text")))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let banner_url = header
            .and_then(|h| h.pointer("/musicImmersiveHeaderRenderer/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails"))
            .or_else(|| header.and_then(|h| h.pointer("/musicVisualHeaderRenderer/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")))
            .or_else(|| root.pointer("/microformat/microformatDataRenderer/thumbnail/thumbnails"))
            .and_then(|t| t.as_array())
            .and_then(|arr| arr.last())
            .and_then(|l| l.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        let thumbnail_url = banner_url.clone();

        let mut top_songs = Vec::new();
        let mut seen_track_ids = std::collections::HashSet::new();
        let mut artist_playlist_ids: Vec<String> = Vec::new();
        let mut albums = Vec::new();
        let mut related_artists = Vec::new();

        // Check header playButton playlistId
        if let Some(play_pl) = header
            .and_then(|h| h.pointer("/musicImmersiveHeaderRenderer/playButton/buttonRenderer/navigationEndpoint/watchEndpoint/playlistId"))
            .or_else(|| header.and_then(|h| h.pointer("/musicVisualHeaderRenderer/playButton/buttonRenderer/navigationEndpoint/watchEndpoint/playlistId")))
            .and_then(|v| v.as_str())
        {
            if !play_pl.starts_with("RD") {
                artist_playlist_ids.push(play_pl.to_string());
            }
        }

        if let Some(sections) = root
            .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
            .and_then(|c| c.as_array())
        {
            for sec in sections {
                // 1. Top songs shelf
                if let Some(shelf) = sec.get("musicShelfRenderer") {
                    let shelf_title = shelf.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("");
                    if let Some(more_id) = shelf
                        .pointer("/bottomEndpoint/browseEndpoint/browseId")
                        .or_else(|| shelf.pointer("/title/runs/0/navigationEndpoint/browseEndpoint/browseId"))
                        .and_then(|v| v.as_str())
                    {
                        if !artist_playlist_ids.contains(&more_id.to_string()) {
                            artist_playlist_ids.push(more_id.to_string());
                        }
                    }

                    if shelf_title.to_lowercase().contains("song") || top_songs.is_empty() {
                        if let Some(items) = shelf.get("contents").and_then(|c| c.as_array()) {
                            for item in items {
                                if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                                    if let Some(mut track) = Self::extract_responsive_item(resp_item) {
                                        if track.artist == "Unknown Artist" || track.artist.is_empty() || track.artist == "-" || Self::is_metadata_or_type_token(&track.artist) {
                                            track.artist = name.clone();
                                        }
                                        Self::sanitize_track_artist_and_title(&mut track.title, &mut track.artist);
                                        if track.artist_id.is_none() {
                                            track.artist_id = Some(browse_id.to_string());
                                        }
                                        if seen_track_ids.insert(track.id.clone()) {
                                            top_songs.push(track);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // 2. Carousel shelves (Albums, Singles, Related, Videos)
                if let Some(carousel) = sec.get("musicCarouselShelfRenderer") {
                    let c_title = carousel
                        .pointer("/header/musicCarouselShelfBasicHeaderRenderer/title/runs/0/text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if c_title.contains("video") || c_title.contains("song") {
                        if let Some(more_id) = carousel
                            .pointer("/header/musicCarouselShelfBasicHeaderRenderer/title/runs/0/navigationEndpoint/browseEndpoint/browseId")
                            .or_else(|| carousel.pointer("/header/musicCarouselShelfBasicHeaderRenderer/moreContentButton/buttonRenderer/navigationEndpoint/browseEndpoint/browseId"))
                            .and_then(|v| v.as_str())
                        {
                            if !artist_playlist_ids.contains(&more_id.to_string()) {
                                artist_playlist_ids.push(more_id.to_string());
                            }
                        }
                    }

                    if let Some(items) = carousel.get("contents").and_then(|c| c.as_array()) {
                        for item in items {
                            if let Some(two_row) = item.get("musicTwoRowItemRenderer") {
                                let mut item_title = two_row.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let item_thumb = two_row
                                    .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                                    .and_then(|t| t.as_array())
                                    .and_then(|arr| arr.last())
                                    .and_then(|l| l.get("url"))
                                    .and_then(|u| u.as_str())
                                    .map(|s| s.to_string());
                                let subtitle = two_row.pointer("/subtitle/runs/0/text").and_then(|v| v.as_str()).map(|s| s.to_string());

                                // Check if this item has a watchEndpoint (playable track/video in carousel)
                                if let Some(video_id) = two_row.pointer("/navigationEndpoint/watchEndpoint/videoId").and_then(|v| v.as_str()) {
                                    let (mut extracted_artist, _) = two_row
                                        .pointer("/subtitle/runs")
                                        .and_then(|r| r.as_array())
                                        .map(|runs| Self::extract_artist_and_id_from_runs(runs))
                                        .unwrap_or_else(|| (name.clone(), None));
                                    if extracted_artist == "Unknown Artist" || Self::is_metadata_or_type_token(&extracted_artist) {
                                        extracted_artist = name.clone();
                                    }
                                    Self::sanitize_track_artist_and_title(&mut item_title, &mut extracted_artist);
                                    let mut views = None;
                                    let mut album = subtitle.clone();
                                    if let Some(ref sub) = subtitle {
                                        if Self::is_views_or_plays_string(sub) {
                                            views = Some(sub.clone());
                                            album = None;
                                        }
                                    }
                                    if seen_track_ids.insert(video_id.to_string()) {
                                        top_songs.push(Track {
                                            id: video_id.to_string(),
                                            title: item_title,
                                            artist: extracted_artist,
                                            artist_id: Some(effective_id.clone()),
                                            album,
                                            duration_seconds: 180,
                                            thumbnail_url: item_thumb.clone(),
                                            views,
                                        });
                                    }
                                } else if let Some(item_id) = two_row.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|v| v.as_str()) {
                                    if c_title.contains("album") || c_title.contains("single") || c_title.contains("ep") || c_title.contains("release") {
                                        albums.push(AlbumItem {
                                            id: item_id.to_string(),
                                            title: item_title,
                                            year: subtitle,
                                            thumbnail_url: item_thumb,
                                            artist: Some(name.clone()),
                                        });
                                    } else if c_title.contains("like") || c_title.contains("similar") || c_title.contains("fan") {
                                        related_artists.push(ArtistItem {
                                            id: item_id.to_string(),
                                            name: item_title,
                                            subscribers: subtitle,
                                            thumbnail_url: item_thumb,
                                        });
                                    }
                                }
                            } else if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                                if let Some(mut track) = Self::extract_responsive_item(resp_item) {
                                    if track.artist == "Unknown Artist" || track.artist.is_empty() || Self::is_metadata_or_type_token(&track.artist) {
                                        track.artist = name.clone();
                                    }
                                    Self::sanitize_track_artist_and_title(&mut track.title, &mut track.artist);
                                    if seen_track_ids.insert(track.id.clone()) {
                                        top_songs.push(track);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Also add the universal YouTube channel uploads playlist (UU...) so all songs/videos on the channel are loaded
        if effective_id.starts_with("UC") && effective_id.len() > 2 {
            let uploads_pl = format!("UU{}", &effective_id[2..]);
            if !artist_playlist_ids.contains(&uploads_pl) {
                artist_playlist_ids.push(uploads_pl);
            }
        }

        // Fetch full Songs / Videos / Uploads playlists for this artist
        for pl_id in artist_playlist_ids {
            if let Ok(pl) = Self::get_playlist_innertube(&pl_id, None).await {
                for mut track in pl.tracks {
                    if track.artist == "Unknown Artist" || track.artist.is_empty() || track.artist == "-" || Self::is_metadata_or_type_token(&track.artist) {
                        track.artist = name.clone();
                    }
                    Self::sanitize_track_artist_and_title(&mut track.title, &mut track.artist);
                    if track.artist_id.is_none() {
                        track.artist_id = Some(effective_id.clone());
                    }
                    if seen_track_ids.insert(track.id.clone()) {
                        top_songs.push(track);
                    } else if let Some(existing) = top_songs.iter_mut().find(|t| t.id == track.id) {
                        if (existing.duration_seconds == 0 || existing.duration_seconds == 180) && track.duration_seconds > 0 {
                            existing.duration_seconds = track.duration_seconds;
                        }
                        if existing.views.is_none() && track.views.is_some() {
                            existing.views = track.views.clone();
                        }
                    }
                }
            }
        }

        // Automatic fallback: if shelves returned no playable songs, search artist's songs
        if top_songs.is_empty() {
            if let Ok(fallback) = Self::search(&name, 50, Some("songs")).await {
                if !fallback.is_empty() {
                    top_songs = fallback;
                }
            }
        }

        let is_channel = Some(albums.is_empty() && (sub_btn.is_some() || effective_id.starts_with("UC")));

        Ok(ArtistProfile {
            id: effective_id,
            name,
            description,
            audience,
            thumbnail_url,
            banner_url,
            top_songs,
            albums,
            related_artists,
            subscribed,
            subscriber_count,
            channel_id,
            is_channel,
        })
    }

    /// Predictive search suggestions (queries and direct items)
    pub async fn get_search_suggestions(query: &str) -> Result<SearchSuggestions, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(4))
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
            },
            "input": query
        });

        let resp = client
            .post("https://music.youtube.com/youtubei/v1/music/get_search_suggestions")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Suggestions request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("HTTP error: {}", resp.status()));
        }

        let root: Value = resp.json().await.map_err(|e| format!("JSON decode error: {}", e))?;

        let mut queries = Vec::new();
        let mut items = Vec::new();

        if let Some(contents) = root.get("contents").and_then(|c| c.as_array()) {
            for section in contents {
                if let Some(section_items) = section.pointer("/searchSuggestionsSectionRenderer/contents").and_then(|c| c.as_array()) {
                    for item in section_items {
                        if let Some(sugg) = item.get("searchSuggestionRenderer") {
                            if let Some(runs) = sugg.pointer("/suggestion/runs").and_then(|r| r.as_array()) {
                                let mut full_q = String::new();
                                for r in runs {
                                    if let Some(t) = r.get("text").and_then(|v| v.as_str()) {
                                        full_q.push_str(t);
                                    }
                                }
                                if !full_q.trim().is_empty() {
                                    queries.push(full_q);
                                }
                            }
                        } else if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                            let title = resp_item.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            let mut subtitle_parts = Vec::new();
                            if let Some(sub_runs) = resp_item.pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs").and_then(|r| r.as_array()) {
                                for r in sub_runs {
                                    if let Some(t) = r.get("text").and_then(|v| v.as_str()) {
                                        if t != " • " && !t.trim().is_empty() {
                                            subtitle_parts.push(t);
                                        }
                                    }
                                }
                            }
                            let subtitle = if subtitle_parts.is_empty() { None } else { Some(subtitle_parts.join(" • ")) };

                            let thumb = resp_item.pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                                .and_then(|t| t.as_array())
                                .and_then(|arr| arr.last())
                                .and_then(|l| l.get("url"))
                                .and_then(|u| u.as_str())
                                .map(|s| s.to_string());

                            let video_id = resp_item.pointer("/navigationEndpoint/watchEndpoint/videoId")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            let browse_id = resp_item.pointer("/navigationEndpoint/browseEndpoint/browseId")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            if !title.is_empty() {
                                items.push(SuggestionItem {
                                    title,
                                    subtitle,
                                    thumbnail_url: thumb,
                                    video_id,
                                    browse_id,
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(SearchSuggestions { queries, items })
    }

    /// Full Explore Feed (New albums & singles, Moods & genres, Trending, New music videos)
    pub async fn get_explore_feed() -> Result<ExploreFeed, String> {
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
            },
            "browseId": "FEmusic_explore"
        });

        let resp = client
            .post("https://music.youtube.com/youtubei/v1/browse")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Explore request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("HTTP error: {}", resp.status()));
        }

        let root: Value = resp.json().await.map_err(|e| format!("JSON decode error: {}", e))?;

        let mut new_albums = Vec::new();
        let mut trending_songs = Vec::new();
        let mut moods_and_genres = Vec::new();
        let mut new_videos = Vec::new();

        if let Some(sections) = root
            .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
            .and_then(|c| c.as_array())
        {
            for sec in sections {
                if let Some(carousel) = sec.get("musicCarouselShelfRenderer") {
                    let title = carousel
                        .pointer("/header/musicCarouselShelfBasicHeaderRenderer/title/runs/0/text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if let Some(contents) = carousel.get("contents").and_then(|c| c.as_array()) {
                        for item in contents {
                            if title.contains("album") || title.contains("single") {
                                if let Some(two_row) = item.get("musicTwoRowItemRenderer") {
                                    let item_title = two_row.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let item_id = two_row.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let item_thumb = two_row
                                        .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                                        .and_then(|t| t.as_array())
                                        .and_then(|arr| arr.last())
                                        .and_then(|l| l.get("url"))
                                        .and_then(|u| u.as_str())
                                        .map(|s| s.to_string());
                                    let mut album_artist: Option<String> = None;
                                    let mut album_year: Option<String> = None;

                                    if let Some(runs) = two_row.pointer("/subtitle/runs").and_then(|r| r.as_array()) {
                                        // 1. Check for explicit artist channel navigation endpoint
                                        for r in runs {
                                            if let Some(bid) = r.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|v| v.as_str()) {
                                                if bid.starts_with("UC") || bid.starts_with("FEmusic_library") {
                                                    if let Some(txt) = r.get("text").and_then(|v| v.as_str()).map(|t| t.trim()).filter(|t| !t.is_empty()) {
                                                        if !Self::is_metadata_or_type_token(txt) {
                                                            album_artist = Some(txt.to_string());
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        // 2. Filter runs into clean text tokens excluding bullet/dash separators
                                        let tokens: Vec<&str> = runs
                                            .iter()
                                            .filter_map(|r| r.get("text").and_then(|v| v.as_str()).map(|s| s.trim()))
                                            .filter(|s| !s.is_empty() && *s != "•" && *s != "·" && *s != "-" && *s != ",")
                                            .collect();

                                        // 3. Identify year / album type vs artist from tokens
                                        for token in &tokens {
                                            if album_year.is_none() {
                                                if (token.len() == 4 && token.chars().all(|c| c.is_ascii_digit())) || Self::is_metadata_or_type_token(token) {
                                                    album_year = Some(token.to_string());
                                                }
                                            }
                                            if album_artist.is_none() && !Self::is_metadata_or_type_token(token) && !(token.len() == 4 && token.chars().all(|c| c.is_ascii_digit())) {
                                                album_artist = Some(token.to_string());
                                            }
                                        }

                                        // 4. Fallbacks if one or the other wasn't classified
                                        if album_year.is_none() && !tokens.is_empty() {
                                            if album_artist.as_deref() != Some(tokens[0]) {
                                                album_year = Some(tokens[0].to_string());
                                            } else if tokens.len() > 1 {
                                                album_year = Some(tokens[1].to_string());
                                            }
                                        }

                                        if album_artist.is_none() && tokens.len() > 1 {
                                            if album_year.as_deref() == Some(tokens[0]) {
                                                album_artist = Some(tokens[1].to_string());
                                            }
                                        }
                                    } else {
                                        album_year = two_row.pointer("/subtitle/runs/0/text").and_then(|v| v.as_str()).map(|s| s.to_string());
                                    }

                                    if !item_title.is_empty() {
                                        new_albums.push(AlbumItem {
                                            id: item_id,
                                            title: item_title,
                                            year: album_year,
                                            thumbnail_url: item_thumb,
                                            artist: album_artist,
                                        });
                                    }
                                }
                            } else if title.contains("mood") || title.contains("genre") {
                                if let Some(nav_btn) = item.get("musicNavigationButtonRenderer") {
                                    let text = nav_btn.pointer("/buttonText/runs/0/text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let color_num = nav_btn.pointer("/solid/leftStripeColor").and_then(|v| v.as_u64()).unwrap_or(4288988671);
                                    let color_hex = format!("#{:06x}", color_num & 0xFFFFFF);
                                    let params = nav_btn.pointer("/clickCommand/browseEndpoint/params").and_then(|v| v.as_str()).map(|s| s.to_string());
                                    let browse_id = nav_btn.pointer("/clickCommand/browseEndpoint/browseId").and_then(|v| v.as_str()).map(|s| s.to_string());
                                    if !text.is_empty() {
                                        moods_and_genres.push(MoodGenreItem {
                                            title: text,
                                            color_hex,
                                            params,
                                            browse_id,
                                        });
                                    }
                                }
                            } else if title.contains("trending") || title.contains("chart") || title.contains("top") {
                                if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                                    if let Some(track) = Self::extract_responsive_item(resp_item) {
                                        trending_songs.push(track);
                                    }
                                }
                            } else if title.contains("video") {
                                if let Some(two_row) = item.get("musicTwoRowItemRenderer") {
                                    let mut item_title = two_row.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let video_id = two_row.pointer("/navigationEndpoint/watchEndpoint/videoId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let item_thumb = two_row
                                        .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                                        .and_then(|t| t.as_array())
                                        .and_then(|arr| arr.last())
                                        .and_then(|l| l.get("url"))
                                        .and_then(|u| u.as_str())
                                        .map(|s| s.to_string());
                                    let (mut artist, artist_id) = two_row
                                        .pointer("/subtitle/runs")
                                        .and_then(|runs| runs.as_array())
                                        .map(|runs| Self::extract_artist_and_id_from_runs(runs))
                                        .unwrap_or_else(|| ("YouTube Music".to_string(), None));
                                    Self::sanitize_track_artist_and_title(&mut item_title, &mut artist);
                                    if !video_id.is_empty() && !item_title.is_empty() {
                                        new_videos.push(Track {
                                            id: video_id,
                                            title: item_title,
                                            artist,
                                            artist_id,
                                            album: None,
                                            duration_seconds: 210,
                                            thumbnail_url: item_thumb,
                                            views: None,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fallback for trending songs if empty
        if trending_songs.is_empty() {
            if let Ok(feed) = Self::get_home_feed().await {
                trending_songs = feed;
            }
        }

        Ok(ExploreFeed {
            new_albums,
            trending_songs,
            moods_and_genres,
            new_videos,
        })
    }

    /// Fetch Country-specific Charts (Video charts, Daily Top 100, Top artists, Genre charts)
    pub async fn get_charts(country: &str) -> Result<ChartsData, String> {
        let country_code = if country.trim().is_empty() {
            "UA"
        } else {
            country.trim()
        };

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
                    "gl": country_code
                }
            },
            "browseId": "FEmusic_charts",
            "formData": {
                "selectedValues": [country_code]
            }
        });

        let resp = client
            .post("https://music.youtube.com/youtubei/v1/browse")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Charts request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("HTTP error: {}", resp.status()));
        }

        let root: Value = resp.json().await.map_err(|e| format!("JSON decode error: {}", e))?;

        let mut playlists = Vec::new();
        let mut top_songs = Vec::new();
        let mut top_artists = Vec::new();
        let mut genres = Vec::new();

        if let Some(sections) = root
            .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
            .and_then(|c| c.as_array())
        {
            for sec in sections {
                if let Some(carousel) = sec.get("musicCarouselShelfRenderer") {
                    let c_title = carousel
                        .pointer("/header/musicCarouselShelfBasicHeaderRenderer/title/runs/0/text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if let Some(contents) = carousel.get("contents").and_then(|c| c.as_array()) {
                        for item in contents {
                            if let Some(two_row) = item.get("musicTwoRowItemRenderer") {
                                let item_title = two_row.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let item_id = two_row.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let item_thumb = two_row
                                    .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                                    .and_then(|t| t.as_array())
                                    .and_then(|arr| arr.last())
                                    .and_then(|l| l.get("url"))
                                    .and_then(|u| u.as_str())
                                    .map(|s| s.to_string());
                                let subtitle = two_row.pointer("/subtitle/runs/0/text").and_then(|v| v.as_str()).map(|s| s.to_string());

                                if item_id.is_empty() || item_title.is_empty() {
                                    continue;
                                }

                                if c_title.contains("artist") {
                                    top_artists.push(ArtistItem {
                                        id: item_id,
                                        name: item_title,
                                        subscribers: subtitle,
                                        thumbnail_url: item_thumb,
                                    });
                                } else if c_title.contains("genre") {
                                    genres.push(ChartItem {
                                        id: item_id,
                                        title: item_title,
                                        subtitle,
                                        thumbnail_url: item_thumb,
                                    });
                                } else if !c_title.contains("podcast") && !item_id.starts_with("MPSP") {
                                    playlists.push(ChartItem {
                                        id: item_id,
                                        title: item_title,
                                        subtitle,
                                        thumbnail_url: item_thumb,
                                    });
                                }
                            } else if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                                if c_title.contains("artist") {
                                    let artist_name = resp_item
                                        .pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let subscribers = resp_item
                                        .pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                    let artist_id = resp_item
                                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let thumb = resp_item
                                        .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                                        .and_then(|t| t.as_array())
                                        .and_then(|arr| arr.last())
                                        .and_then(|l| l.get("url"))
                                        .and_then(|u| u.as_str())
                                        .map(|s| s.to_string());

                                    if !artist_id.is_empty() && !artist_name.is_empty() {
                                        top_artists.push(ArtistItem {
                                            id: artist_id,
                                            name: artist_name,
                                            subscribers,
                                            thumbnail_url: thumb,
                                        });
                                    }
                                } else if let Some(track) = Self::extract_responsive_item(resp_item) {
                                    top_songs.push(track);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Automatically load tracks from the country's primary chart playlist so Top Songs match the selected country!
        if top_songs.is_empty() && !playlists.is_empty() {
            for chart_pl in playlists.iter().take(2) {
                if let Ok(pl) = Self::get_playlist_innertube(&chart_pl.id, None).await {
                    if !pl.tracks.is_empty() {
                        top_songs = pl.tracks;
                        break;
                    }
                }
            }
        }

        Ok(ChartsData {
            country: country_code.to_string(),
            playlists,
            top_songs,
            top_artists,
            genres,
        })
    }

    /// Fetch Mood & Genre Category page (curated playlists + tracks for a selected mood/genre)
    pub async fn get_mood_category(
        browse_id: &str,
        params: Option<&str>,
        title: &str,
    ) -> Result<MoodCategoryData, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .unwrap_or_else(|_| Client::new());

        let mut sections_out = Vec::new();
        let mut tracks_out = Vec::new();

        if !browse_id.trim().is_empty() {
            let mut payload = json!({
                "context": {
                    "client": {
                        "clientName": "WEB_REMIX",
                        "clientVersion": WEB_REMIX_CLIENT_VERSION,
                        "hl": "en",
                        "gl": "US"
                    }
                },
                "browseId": browse_id.trim()
            });

            if let Some(p) = params.filter(|s| !s.trim().is_empty()) {
                payload["params"] = json!(p);
            }

            if let Ok(resp) = client
                .post("https://music.youtube.com/youtubei/v1/browse")
                .header("Content-Type", "application/json")
                .header("User-Agent", WEB_REMIX_USER_AGENT)
                .json(&payload)
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(root) = resp.json::<Value>().await {
                        if let Some(sections) = root
                            .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
                            .and_then(|c| c.as_array())
                        {
                            for sec in sections {
                                if let Some(carousel) = sec.get("musicCarouselShelfRenderer") {
                                    let sec_title = carousel
                                        .pointer("/header/musicCarouselShelfBasicHeaderRenderer/title/runs/0/text")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or(title)
                                        .to_string();

                                    let mut pls = Vec::new();
                                    if let Some(contents) = carousel.get("contents").and_then(|c| c.as_array()) {
                                        for item in contents {
                                            if let Some(two_row) = item.get("musicTwoRowItemRenderer") {
                                                let item_title = two_row.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                                let item_id = two_row.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                                let item_thumb = two_row
                                                    .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                                                    .and_then(|t| t.as_array())
                                                    .and_then(|arr| arr.last())
                                                    .and_then(|l| l.get("url"))
                                                    .and_then(|u| u.as_str())
                                                    .map(|s| s.to_string());
                                                let subtitle = two_row
                                                    .pointer("/subtitle/runs")
                                                    .and_then(|r| r.as_array())
                                                    .map(|runs| {
                                                        runs.iter()
                                                            .filter_map(|x| x.get("text").and_then(|t| t.as_str()))
                                                            .collect::<Vec<_>>()
                                                            .join("")
                                                    });

                                                if !item_id.is_empty() && !item_title.is_empty() {
                                                    pls.push(ChartItem {
                                                        id: item_id,
                                                        title: item_title,
                                                        subtitle,
                                                        thumbnail_url: item_thumb,
                                                    });
                                                }
                                            } else if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                                                if let Some(t) = Self::extract_responsive_item(resp_item) {
                                                    tracks_out.push(t);
                                                }
                                            }
                                        }
                                    }

                                    if !pls.is_empty() {
                                        sections_out.push(MoodCategorySection {
                                            title: sec_title,
                                            playlists: pls,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Load playable songs from the first playlist in this mood/genre (or via search)
        if tracks_out.is_empty() {
            if let Some(first_pl) = sections_out.first().and_then(|s| s.playlists.first()) {
                if let Ok(pl) = Self::get_playlist_innertube(&first_pl.id, None).await {
                    tracks_out = pl.tracks;
                }
            }
        }
        if tracks_out.is_empty() {
            if let Ok(searched) = Self::search(title, 30, Some("songs")).await {
                tracks_out = searched;
            }
        }

        Ok(MoodCategoryData {
            title: title.to_string(),
            sections: sections_out,
            tracks: tracks_out,
        })
    }

    /// Toggle Like on YouTube Music via InnerTube with SAPISIDHASH Authentication
    pub async fn toggle_like(video_id: &str, like: bool, cookies: Option<&str>) -> Result<bool, String> {
        let raw_cookies = match cookies.filter(|s| !s.trim().is_empty()) {
            Some(c) => normalize_cookie_header(c),
            None => return Err("Not logged in to YouTube Music".to_string()),
        };

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .unwrap_or_else(|_| Client::new());

        let endpoint = if like { "like/like" } else { "like/removelike" };
        let url = format!("https://music.youtube.com/youtubei/v1/{}", endpoint);

        let mut req = client.post(&url)
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .header("Origin", "https://music.youtube.com")
            .header("X-Origin", "https://music.youtube.com")
            .header("X-Goog-AuthUser", "0")
            .header("Cookie", &raw_cookies);

        if let Some(sapisid) = extract_sapisid(&raw_cookies) {
            let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
            req = req.header("Authorization", auth);
        }

        let payload = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": WEB_REMIX_CLIENT_VERSION,
                    "hl": "en",
                    "gl": "US"
                }
            },
            "target": {
                "videoId": video_id
            }
        });

        let resp = req.json(&payload).send().await.map_err(|e| e.to_string())?;
        Ok(resp.status().is_success())
    }

    /// Fetch official Liked Songs playlist via authenticated InnerTube (matching ytm-player auth flow)
    pub async fn get_liked_songs(cookies: Option<&str>) -> Result<Vec<Track>, String> {
        let raw_input = cookies
            .map(|c| c.trim())
            .filter(|c| !c.is_empty())
            .ok_or_else(|| {
                "Для синхронізації вподобаних треків увійдіть у Google акаунт (Settings -> Google Sign-In) або вставте Cookie сесії.".to_string()
            })?;

        let cookie_header = normalize_cookie_header(raw_input);

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| Client::new());

        // Try VLLM first (full Liked Music playlist with continuations), then FEmusic_liked
        for browse_id in ["VLLM", "FEmusic_liked"] {
            let mut req = client
                .post("https://music.youtube.com/youtubei/v1/browse")
                .header("Content-Type", "application/json")
                .header("User-Agent", WEB_REMIX_USER_AGENT)
                .header("Origin", "https://music.youtube.com")
                .header("X-Origin", "https://music.youtube.com")
                .header("X-Goog-AuthUser", "0")
                .header("Cookie", &cookie_header);

            if let Some(sapisid) = extract_sapisid(&cookie_header) {
                let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
                req = req.header("Authorization", auth);
            }

            let body = json!({
                "context": {
                    "client": {
                        "clientName": "WEB_REMIX",
                        "clientVersion": WEB_REMIX_CLIENT_VERSION,
                        "hl": "en",
                        "gl": "US"
                    }
                },
                "browseId": browse_id
            });

            if let Ok(resp) = req.json(&body).send().await {
                if resp.status().is_success() {
                    if let Ok(root) = resp.json::<Value>().await {
                        let mut tracks = Self::extract_playlist_tracks_from_browse(&root);
                        if !tracks.is_empty() {
                            Self::fetch_all_browse_continuations(
                                &client,
                                &root,
                                &mut tracks,
                                Some(&cookie_header),
                                30,
                            )
                            .await;
                            return Ok(tracks);
                        }
                    }
                }
            }
        }
        Err("Failed to load Liked Songs. Please ensure you are logged into your YouTube Music account.".to_string())
    }

    /// Record playback in official YouTube Music Watch History via InnerTube player + videostats ping
    pub async fn record_playback(video_id: &str, cookies: Option<&str>) -> Result<bool, String> {
        let raw_input = match cookies.map(|c| c.trim()).filter(|c| !c.is_empty()) {
            Some(c) => c,
            None => return Ok(false), // Silently skip if not signed in
        };

        let cookie_header = normalize_cookie_header(raw_input);

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .unwrap_or_else(|_| Client::new());

        // 1. Compute signatureTimestamp (days since 1970-01-01 UTC)
        let now = std::time::SystemTime::now();
        let days = now
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() / 86400;
        let sig_ts = if days > 0 { days - 1 } else { 19000 };

        // 2. Query player endpoint with authentication to generate playback tracking URLs
        let mut player_req = client
            .post("https://music.youtube.com/youtubei/v1/player")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .header("Origin", "https://music.youtube.com")
            .header("X-Origin", "https://music.youtube.com")
            .header("X-Goog-AuthUser", "0")
            .header("Cookie", &cookie_header);

        if let Some(sapisid) = extract_sapisid(&cookie_header) {
            let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
            player_req = player_req.header("Authorization", auth);
        }

        let body = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": WEB_REMIX_CLIENT_VERSION,
                    "hl": "en",
                    "gl": "US"
                }
            },
            "playbackContext": {
                "contentPlaybackContext": {
                    "signatureTimestamp": sig_ts
                }
            },
            "videoId": video_id
        });

        let resp = player_req.json(&body).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Player endpoint returned HTTP {}", resp.status()));
        }

        let root: Value = resp.json().await.map_err(|e| e.to_string())?;

        // 3. Extract videostatsPlaybackUrl
        let playback_base_url = root
            .get("playbackTracking")
            .and_then(|pt| pt.get("videostatsPlaybackUrl"))
            .and_then(|v| v.get("baseUrl"))
            .and_then(|b| b.as_str());

        let Some(base_url) = playback_base_url else {
            return Ok(false);
        };

        // 4. Generate random 16-char CPN (Client Playback Nonce)
        let cpn = generate_cpn();

        // 5. Send playback ping to commit track to Google Watch History
        let ping_url = format!("{}&ver=2&c=WEB_REMIX&cpn={}", base_url, cpn);

        let mut ping_req = client
            .get(&ping_url)
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .header("Origin", "https://music.youtube.com")
            .header("Referer", "https://music.youtube.com/")
            .header("X-Goog-AuthUser", "0")
            .header("Cookie", &cookie_header);

        if let Some(sapisid) = extract_sapisid(&cookie_header) {
            let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
            ping_req = ping_req.header("Authorization", auth);
        }

        let ping_resp = ping_req.send().await.map_err(|e| e.to_string())?;

        // 6. Also ping atrUrl (Active Tracking) if available
        if let Some(atr_base) = root
            .get("playbackTracking")
            .and_then(|pt| pt.get("atrUrl"))
            .and_then(|v| v.get("baseUrl"))
            .and_then(|b| b.as_str())
        {
            let atr_url = format!("{}&cpn={}", atr_base, cpn);
            let mut atr_req = client
                .get(&atr_url)
                .header("User-Agent", WEB_REMIX_USER_AGENT)
                .header("Origin", "https://music.youtube.com")
                .header("Referer", "https://music.youtube.com/")
                .header("Cookie", &cookie_header);
            if let Some(sapisid) = extract_sapisid(&cookie_header) {
                let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
                atr_req = atr_req.header("Authorization", auth);
            }
            let _ = atr_req.send().await;
        }

        Ok(ping_resp.status().is_success() || ping_resp.status().as_u16() == 204)
    }

    /// Fetch official YouTube Music playback history
    pub async fn get_history(cookies: Option<&str>) -> Result<Vec<Track>, String> {
        let raw_input = match cookies.map(|c| c.trim()).filter(|c| !c.is_empty()) {
            Some(c) => c,
            None => return Err("Для перегляду офіційної історії увійдіть у Google акаунт".to_string()),
        };

        let cookie_header = normalize_cookie_header(raw_input);

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| Client::new());

        let mut req = client
            .post("https://music.youtube.com/youtubei/v1/browse")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .header("Origin", "https://music.youtube.com")
            .header("X-Origin", "https://music.youtube.com")
            .header("X-Goog-AuthUser", "0")
            .header("Cookie", &cookie_header);

        if let Some(sapisid) = extract_sapisid(&cookie_header) {
            let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
            req = req.header("Authorization", auth);
        }

        let body = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": WEB_REMIX_CLIENT_VERSION,
                    "hl": "en",
                    "gl": "US"
                }
            },
            "browseId": "FEmusic_history"
        });

        let resp = req.json(&body).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("InnerTube browse returned HTTP {}", resp.status()));
        }

        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        let tracks = Self::extract_playlist_tracks_from_browse(&root);
        Ok(tracks)
    }

    fn extract_playlist_tracks_from_browse(root: &Value) -> Vec<Track> {
        let mut tracks = Vec::new();

        // 1. Check twoColumnBrowseResultsRenderer secondaryContents
        if let Some(sec_contents) = root
            .pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents")
            .and_then(|c| c.as_array())
        {
            for sec in sec_contents {
                let items_opt = sec
                    .pointer("/musicPlaylistShelfRenderer/contents")
                    .or_else(|| sec.pointer("/musicShelfRenderer/contents"))
                    .and_then(|c| c.as_array());
                if let Some(items) = items_opt {
                    for item in items {
                        if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                            if let Some(track) = Self::extract_responsive_item(resp_item) {
                                tracks.push(track);
                            }
                        }
                    }
                }
            }
        }

        // 2. Check twoColumnBrowseResultsRenderer tabs
        if tracks.is_empty() {
            if let Some(sec_contents) = root
                .pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
                .and_then(|c| c.as_array())
            {
                for sec in sec_contents {
                    let items_opt = sec
                        .pointer("/musicPlaylistShelfRenderer/contents")
                        .or_else(|| sec.pointer("/musicShelfRenderer/contents"))
                        .and_then(|c| c.as_array());
                    if let Some(items) = items_opt {
                        for item in items {
                            if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                                if let Some(track) = Self::extract_responsive_item(resp_item) {
                                    tracks.push(track);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Check singleColumnBrowseResultsRenderer
        if tracks.is_empty() {
            if let Some(sections) = root
                .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
                .and_then(|c| c.as_array())
            {
                for section in sections {
                    let items_opt = section
                        .pointer("/musicPlaylistShelfRenderer/contents")
                        .or_else(|| section.pointer("/musicShelfRenderer/contents"))
                        .and_then(|c| c.as_array());
                    if let Some(items) = items_opt {
                        for item in items {
                            if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                                if let Some(track) = Self::extract_responsive_item(resp_item) {
                                    tracks.push(track);
                                }
                            }
                        }
                    }
                }
            }
        }

        if tracks.is_empty() {
            Self::collect_all_responsive_items(root, &mut tracks);
        }

        tracks
    }

    /// Extract next continuation token from an initial browse response or continuation response
    pub(crate) fn extract_continuation_token(root: &Value) -> Option<String> {
        let priority_paths = [
            "/continuationContents/musicPlaylistShelfContinuation",
            "/continuationContents/musicShelfContinuation",
            "/continuationContents/sectionListContinuation",
            "/onResponseReceivedActions",
            "/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents",
            "/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents",
            "/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents",
        ];

        for path in priority_paths {
            if let Some(sub) = root.pointer(path) {
                if let Some(tok) = Self::find_continuation_token(sub) {
                    return Some(tok);
                }
            }
        }

        Self::find_continuation_token(root)
    }

    /// Recursively search a JSON value for an InnerTube continuation token
    pub(crate) fn find_continuation_token(val: &Value) -> Option<String> {
        match val {
            Value::Object(map) => {
                for ptr in [
                    "/continuationItemRenderer/continuationEndpoint/continuationCommand/token",
                    "/continuationEndpoint/continuationCommand/token",
                    "/continuationCommand/token",
                    "/nextContinuationData/continuation",
                    "/reloadContinuationData/continuation",
                ] {
                    if let Some(tok) = val.pointer(ptr).and_then(|v| v.as_str()) {
                        let trimmed = tok.trim();
                        if !trimmed.is_empty() {
                            return Some(trimmed.to_string());
                        }
                    }
                }

                // Check priority shelf / continuation containers first
                for key in [
                    "musicPlaylistShelfRenderer",
                    "musicPlaylistShelfContinuation",
                    "musicShelfRenderer",
                    "musicShelfContinuation",
                    "appendContinuationItemsAction",
                    "reloadContinuationItemsCommand",
                    "continuations",
                    "continuationItems",
                    "contents",
                ] {
                    if let Some(child) = map.get(key) {
                        if let Some(tok) = Self::find_continuation_token(child) {
                            return Some(tok);
                        }
                    }
                }

                for (k, child) in map {
                    if matches!(
                        k.as_str(),
                        "musicPlaylistShelfRenderer"
                            | "musicPlaylistShelfContinuation"
                            | "musicShelfRenderer"
                            | "musicShelfContinuation"
                            | "appendContinuationItemsAction"
                            | "reloadContinuationItemsCommand"
                            | "continuations"
                            | "continuationItems"
                            | "contents"
                            | "musicResponsiveListItemRenderer"
                            | "musicTwoRowItemRenderer"
                            | "responseContext"
                            | "microformat"
                    ) {
                        continue;
                    }
                    if let Some(tok) = Self::find_continuation_token(child) {
                        return Some(tok);
                    }
                }
                None
            }
            Value::Array(arr) => {
                // Check in reverse first since continuationItemRenderer is typically the last item in contents/continuationItems
                for item in arr.iter().rev() {
                    if let Some(tok) = Self::find_continuation_token(item) {
                        return Some(tok);
                    }
                }
                None
            }
            _ => None,
        }
    }

    /// Extract tracks from an InnerTube browse continuation response
    pub(crate) fn extract_tracks_from_continuation(root: &Value) -> Vec<Track> {
        let mut tracks = Vec::new();

        for path in [
            "/continuationContents/musicPlaylistShelfContinuation/contents",
            "/continuationContents/musicShelfContinuation/contents",
        ] {
            if let Some(items) = root.pointer(path).and_then(|c| c.as_array()) {
                for item in items {
                    if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                        if let Some(track) = Self::extract_responsive_item(resp_item) {
                            tracks.push(track);
                        }
                    }
                }
            }
        }

        if let Some(actions) = root.pointer("/onResponseReceivedActions").and_then(|a| a.as_array()) {
            for action in actions {
                let items_opt = action
                    .pointer("/appendContinuationItemsAction/continuationItems")
                    .or_else(|| action.pointer("/reloadContinuationItemsCommand/continuationItems"))
                    .and_then(|c| c.as_array());
                if let Some(items) = items_opt {
                    for item in items {
                        if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                            if let Some(track) = Self::extract_responsive_item(resp_item) {
                                tracks.push(track);
                            }
                        }
                    }
                }
            }
        }

        if tracks.is_empty() {
            Self::collect_all_responsive_items(root, &mut tracks);
        }

        tracks
    }

    /// Recursive fallback to collect all `musicResponsiveListItemRenderer` tracks in a JSON subtree
    pub(crate) fn collect_all_responsive_items(val: &Value, out: &mut Vec<Track>) {
        match val {
            Value::Object(map) => {
                if let Some(resp_item) = map.get("musicResponsiveListItemRenderer") {
                    if let Some(track) = Self::extract_responsive_item(resp_item) {
                        out.push(track);
                    }
                    return;
                }
                for child in map.values() {
                    Self::collect_all_responsive_items(child, out);
                }
            }
            Value::Array(arr) => {
                for item in arr {
                    Self::collect_all_responsive_items(item, out);
                }
            }
            _ => {}
        }
    }

    /// Follow InnerTube browse continuation tokens across multiple pages to load all tracks in large playlists
    async fn fetch_all_browse_continuations(
        client: &Client,
        initial_root: &Value,
        tracks: &mut Vec<Track>,
        cookie_header: Option<&str>,
        max_pages: usize,
    ) {
        let mut seen_ids: std::collections::HashSet<String> =
            tracks.iter().map(|t| t.id.clone()).collect();
        let mut seen_tokens: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut next_token = Self::extract_continuation_token(initial_root);

        for _ in 0..max_pages {
            let Some(token) = next_token.take() else {
                break;
            };
            if token.is_empty() || !seen_tokens.insert(token.clone()) {
                break;
            }

            let url = format!(
                "https://music.youtube.com/youtubei/v1/browse?ctoken={}&continuation={}&type=next",
                token, token
            );

            let mut req = client
                .post(&url)
                .header("Content-Type", "application/json")
                .header("User-Agent", WEB_REMIX_USER_AGENT)
                .header("Origin", "https://music.youtube.com")
                .header("X-Origin", "https://music.youtube.com");

            if let Some(ch) = cookie_header.filter(|s| !s.trim().is_empty()) {
                req = req
                    .header("X-Goog-AuthUser", "0")
                    .header("Cookie", ch);
                if let Some(sapisid) = extract_sapisid(ch) {
                    let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
                    req = req.header("Authorization", auth);
                }
            }

            let body = json!({
                "context": {
                    "client": {
                        "clientName": "WEB_REMIX",
                        "clientVersion": WEB_REMIX_CLIENT_VERSION,
                        "hl": "en",
                        "gl": "US"
                    }
                },
                "continuation": token
            });

            let Ok(resp) = req.json(&body).send().await else {
                break;
            };
            if !resp.status().is_success() {
                break;
            }
            let Ok(cont_root) = resp.json::<Value>().await else {
                break;
            };

            let page_tracks = Self::extract_tracks_from_continuation(&cont_root);
            if page_tracks.is_empty() {
                break;
            }

            for t in page_tracks {
                if seen_ids.insert(t.id.clone()) {
                    tracks.push(t);
                }
            }

            next_token = Self::extract_continuation_token(&cont_root);
        }
    }

    /// Fetch song recommendations (Up Next / Radio) for a specific song via InnerTube /next API
    pub async fn get_song_recommendations(video_id: &str, cookies: Option<&str>) -> Result<Vec<Track>, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .unwrap_or_else(|_| Client::new());

        let mut req = client
            .post("https://music.youtube.com/youtubei/v1/next")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .header("Origin", "https://music.youtube.com")
            .header("Referer", "https://music.youtube.com/");

        if let Some(c) = cookies.filter(|s| !s.trim().is_empty()) {
            let normalized = normalize_cookie_header(c);
            if !normalized.is_empty() {
                req = req.header("Cookie", normalized.clone());
                if let Some(sapisid) = extract_sapisid(&normalized) {
                    req = req.header("Authorization", compute_sapisidhash(&sapisid, "https://music.youtube.com"));
                }
            }
        }

        let payload = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": WEB_REMIX_CLIENT_VERSION,
                    "hl": "en",
                    "gl": "US"
                }
            },
            "videoId": video_id,
            "playlistId": format!("RDAMVM{}", video_id)
        });

        let resp = req
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("InnerTube next request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("InnerTube next returned HTTP {}", resp.status()));
        }

        let root: Value = resp.json().await.map_err(|e| format!("Failed to parse next response: {}", e))?;
        let tracks = Self::parse_innertube_radio(&root, video_id);
        Ok(tracks)
    }

    fn parse_innertube_radio(root: &Value, current_video_id: &str) -> Vec<Track> {
        let mut tracks = Vec::new();
        let mut seen = std::collections::HashSet::new();

        let tabs = root
            .pointer("/contents/singleColumnMusicWatchNextResultsRenderer/tabbedRenderer/watchNextTabbedResultsRenderer/tabs")
            .and_then(|t| t.as_array());

        let tabs_slice = match tabs {
            Some(t) => t.as_slice(),
            None => return tracks,
        };

        for tab in tabs_slice {
            let queue_renderer = tab.pointer("/tabRenderer/content/musicQueueRenderer");
            if let Some(qr) = queue_renderer {
                let items = qr
                    .pointer("/content/playlistPanelRenderer/contents")
                    .and_then(|c| c.as_array());

                if let Some(arr) = items {
                    for it in arr {
                        let r = match it.get("playlistPanelVideoRenderer") {
                            Some(v) => v,
                            None => continue,
                        };

                        let vid = match r.get("videoId").and_then(|v| v.as_str()) {
                            Some(v) if !v.is_empty() && v != current_video_id => v,
                            _ => continue,
                        };

                        if !seen.insert(vid.to_string()) {
                            continue;
                        }

                        let title = r
                            .pointer("/title/runs/0/text")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim();

                        if title.is_empty() {
                            continue;
                        }

                        let artist = r
                            .pointer("/longBylineText/runs/0/text")
                            .or_else(|| r.pointer("/shortBylineText/runs/0/text"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown Artist")
                            .trim();

                        let artist_id = r
                            .pointer("/longBylineText/runs/0/navigationEndpoint/browseEndpoint/browseId")
                            .or_else(|| r.pointer("/shortBylineText/runs/0/navigationEndpoint/browseEndpoint/browseId"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        let dur_str = r
                            .pointer("/lengthText/runs/0/text")
                            .and_then(|v| v.as_str())
                            .unwrap_or("0:00");
                        let dur_secs = parse_duration_string(dur_str);

                        let thumb = r
                            .pointer("/thumbnail/thumbnails")
                            .and_then(|arr| arr.as_array())
                            .and_then(|arr| arr.last())
                            .and_then(|t| t.get("url"))
                            .and_then(|u| u.as_str())
                            .map(|s| s.to_string());

                        tracks.push(Track {
                            id: vid.to_string(),
                            title: title.to_string(),
                            artist: artist.to_string(),
                            artist_id,
                            album: None,
                            duration_seconds: dur_secs,
                            thumbnail_url: thumb,
                            views: None,
                        });
                    }
                }
                break;
            }
        }

        tracks
    }

    /// Toggle Channel/Artist Subscription on YouTube Music via InnerTube
    pub async fn toggle_subscribe(channel_id: &str, subscribe: bool, cookies: Option<&str>) -> Result<bool, String> {
        let raw_cookies = match cookies.filter(|s| !s.trim().is_empty()) {
            Some(c) => normalize_cookie_header(c),
            None => return Err("Not logged in to YouTube Music".to_string()),
        };

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .unwrap_or_else(|_| Client::new());

        let endpoint = if subscribe { "subscription/subscribe" } else { "subscription/unsubscribe" };
        let url = format!("https://music.youtube.com/youtubei/v1/{}", endpoint);

        let mut req = client.post(&url)
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .header("Origin", "https://music.youtube.com")
            .header("X-Origin", "https://music.youtube.com")
            .header("X-Goog-AuthUser", "0")
            .header("Cookie", &raw_cookies);

        if let Some(sapisid) = extract_sapisid(&raw_cookies) {
            let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
            req = req.header("Authorization", auth);
        }

        let payload = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": WEB_REMIX_CLIENT_VERSION,
                    "hl": "en",
                    "gl": "US"
                }
            },
            "channelIds": [channel_id]
        });

        let resp = req.json(&payload).send().await.map_err(|e| e.to_string())?;
        Ok(resp.status().is_success())
    }

    /// Unified search across Songs, Videos, Albums, Artists, and Playlists
    pub async fn search_unified(query: &str, filter: Option<&str>, limit: usize) -> Result<UnifiedSearchResults, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .unwrap_or_else(|_| Client::new());

        let clean_filter = filter.unwrap_or("all").to_lowercase();
        let params = match clean_filter.as_str() {
            "songs" => Some("EgWKAQIIAWoMEAMQBBAJEAoQBRAV"),
            "videos" => Some("EgWKAQIQAWoMEAMQBBAJEAoQBRAV"),
            "albums" => Some("EgWKAQIYAWoMEAMQBBAJEAoQBRAV"),
            "artists" => Some("EgWKAQIgAWoMEAMQBBAJEAoQBRAV"),
            "playlists" => Some("EgWKAQIoAWoMEAMQBBAJEAoQBRAV"),
            _ => None,
        };

        let mut payload = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": WEB_REMIX_CLIENT_VERSION,
                    "hl": "en",
                    "gl": "US"
                }
            },
            "query": query
        });

        if let Some(p) = params {
            payload["params"] = json!(p);
        }

        let resp = client
            .post("https://music.youtube.com/youtubei/v1/search")
            .header("Content-Type", "application/json")
            .header("User-Agent", WEB_REMIX_USER_AGENT)
            .json(&payload)
            .send()
            .await;

        let mut tracks = Vec::new();
        let mut albums = Vec::new();
        let mut artists = Vec::new();
        let mut playlists = Vec::new();

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(root) = res.json::<Value>().await {
                    Self::parse_unified_search_response(&root, &mut tracks, &mut albums, &mut artists, &mut playlists, limit);
                }
            }
        }

        // Fallback for song/video searches if empty
        if tracks.is_empty() && albums.is_empty() && artists.is_empty() && playlists.is_empty() {
            if clean_filter == "songs" || clean_filter == "videos" || clean_filter == "all" {
                if let Ok(fb) = Self::search_ytdlp_fallback(query, limit).await {
                    tracks = fb;
                }
            }
        }

        Ok(UnifiedSearchResults {
            query: query.to_string(),
            filter: clean_filter,
            tracks,
            albums,
            artists,
            playlists,
        })
    }

    pub fn parse_unified_search_response(
        root: &Value,
        tracks: &mut Vec<Track>,
        albums: &mut Vec<AlbumItem>,
        artists: &mut Vec<ArtistItem>,
        playlists: &mut Vec<ChartItem>,
        limit: usize,
    ) {
        let mut seen_track_ids = std::collections::HashSet::new();
        let mut seen_album_ids = std::collections::HashSet::new();
        let mut seen_artist_ids = std::collections::HashSet::new();
        let mut seen_playlist_ids = std::collections::HashSet::new();

        // 1. Check musicCardShelfRenderer (Top result card)
        if let Some(card) = root.pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicCardShelfRenderer") {
            let card_title = card.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let card_browse_id = card.pointer("/title/runs/0/navigationEndpoint/browseEndpoint/browseId").and_then(|v| v.as_str());
            let card_video_id = card
                .pointer("/buttons/0/buttonRenderer/command/watchEndpoint/videoId")
                .or_else(|| card.pointer("/title/runs/0/navigationEndpoint/watchEndpoint/videoId"))
                .and_then(|v| v.as_str());

            let card_thumb = card
                .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                .and_then(|t| t.as_array())
                .and_then(|a| a.last())
                .and_then(|l| l.get("url"))
                .and_then(|u| u.as_str())
                .map(|s| s.to_string());

            let subtitle = card
                .pointer("/subtitle/runs")
                .and_then(|r| r.as_array())
                .map(|runs| {
                    runs.iter()
                        .filter_map(|x| x.get("text").and_then(|t| t.as_str()))
                        .map(|s| s.trim())
                        .filter(|s| !s.is_empty() && *s != "•")
                        .collect::<Vec<_>>()
                        .join(" • ")
                });

            if let Some(bid) = card_browse_id {
                if bid.starts_with("UC") {
                    if seen_artist_ids.insert(bid.to_string()) {
                        artists.push(ArtistItem {
                            id: bid.to_string(),
                            name: card_title.clone(),
                            subscribers: subtitle.clone(),
                            thumbnail_url: card_thumb.clone(),
                        });
                    }
                } else if bid.starts_with("MPREb_") {
                    if seen_album_ids.insert(bid.to_string()) {
                        let card_artist = card
                            .pointer("/subtitle/runs")
                            .and_then(|r| r.as_array())
                            .and_then(|runs| {
                                runs.iter().find_map(|r| {
                                    let is_art = r
                                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                                        .and_then(|v| v.as_str())
                                        .map(|id| id.starts_with("UC") || id.starts_with("FEmusic_library"))
                                        .unwrap_or(false);
                                    if is_art {
                                        r.get("text").and_then(|t| t.as_str()).map(|s| s.trim().to_string())
                                    } else {
                                        None
                                    }
                                })
                            });
                        albums.push(AlbumItem {
                            id: bid.to_string(),
                            title: card_title.clone(),
                            year: subtitle.clone(),
                            thumbnail_url: card_thumb.clone(),
                            artist: card_artist,
                        });
                    }
                } else if bid.starts_with("VL") || bid.starts_with("PL") {
                    if seen_playlist_ids.insert(bid.to_string()) {
                        playlists.push(ChartItem {
                            id: bid.to_string(),
                            title: card_title.clone(),
                            subtitle: subtitle.clone(),
                            thumbnail_url: card_thumb.clone(),
                        });
                    }
                }
            } else if let Some(vid) = card_video_id {
                let (mut artist, artist_id) = card
                    .pointer("/subtitle/runs")
                    .and_then(|r| r.as_array())
                    .map(|runs| Self::extract_artist_and_id_from_runs(runs))
                    .unwrap_or_else(|| ("YouTube Music".to_string(), None));

                let mut title = card_title;
                Self::sanitize_track_artist_and_title(&mut title, &mut artist);

                if seen_track_ids.insert(vid.to_string()) {
                    tracks.push(Track {
                        id: vid.to_string(),
                        title,
                        artist,
                        artist_id,
                        album: None,
                        duration_seconds: 0,
                        thumbnail_url: card_thumb,
                        views: None,
                    });
                }
            }

            // Also check songs inside top card
            if let Some(card_items) = card.get("contents").and_then(|c| c.as_array()) {
                for item in card_items {
                    if let Some(resp_item) = item.get("musicResponsiveListItemRenderer") {
                        if let Some(track) = Self::extract_responsive_item(resp_item) {
                            if seen_track_ids.insert(track.id.clone()) {
                                tracks.push(track);
                            }
                        }
                    }
                }
            }
        }

        // 2. Iterate sections
        let sections = match root
            .pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
            .and_then(|c| c.as_array())
        {
            Some(s) => s,
            None => return,
        };

        for sec in sections {
            let items_opt = sec
                .pointer("/musicShelfRenderer/contents")
                .or_else(|| sec.pointer("/itemSectionRenderer/contents"))
                .and_then(|c| c.as_array());

            if let Some(items) = items_opt {
                for item in items {
                    let resp = match item.get("musicResponsiveListItemRenderer") {
                        Some(r) => r,
                        None => continue,
                    };

                    let title = resp
                        .pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();

                    if title.is_empty() {
                        continue;
                    }

                    let thumb = resp
                        .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                        .and_then(|t| t.as_array())
                        .and_then(|a| a.last())
                        .and_then(|l| l.get("url"))
                        .and_then(|u| u.as_str())
                        .map(|s| s.to_string());

                    let nav_browse_id = resp
                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                        .or_else(|| resp.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/browseEndpoint/browseId"))
                        .and_then(|v| v.as_str());

                    let page_type = resp
                        .pointer("/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
                        .or_else(|| resp.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    let col1_runs = resp
                        .pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs")
                        .and_then(|r| r.as_array());

                    let col1_text = col1_runs.map(|runs| {
                        runs.iter()
                            .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty() && *s != "•")
                            .collect::<Vec<_>>()
                            .join(" • ")
                    }).unwrap_or_default();

                    let is_artist = page_type == "MUSIC_PAGE_TYPE_ARTIST"
                        || page_type == "MUSIC_PAGE_TYPE_USER_CHANNEL"
                        || (nav_browse_id.map_or(false, |id| id.starts_with("UC")) && (col1_text.to_lowercase().contains("artist") || col1_text.to_lowercase().contains("subscriber") || col1_text.to_lowercase().contains("audience")));

                    let is_album = page_type == "MUSIC_PAGE_TYPE_ALBUM"
                        || (nav_browse_id.map_or(false, |id| id.starts_with("MPREb_")) || col1_text.to_lowercase().contains("album") || col1_text.to_lowercase().contains("ep") || col1_text.to_lowercase().contains("single"));

                    let is_playlist = page_type == "MUSIC_PAGE_TYPE_PLAYLIST"
                        || (nav_browse_id.map_or(false, |id| id.starts_with("VL") || id.starts_with("PL")) && !is_album);

                    if is_artist {
                        if let Some(bid) = nav_browse_id {
                            if seen_artist_ids.insert(bid.to_string()) {
                                artists.push(ArtistItem {
                                    id: bid.to_string(),
                                    name: title,
                                    subscribers: if col1_text.is_empty() { None } else { Some(col1_text) },
                                    thumbnail_url: thumb,
                                });
                                if artists.len() >= limit {
                                    return;
                                }
                            }
                        }
                    } else if is_album {
                        if let Some(bid) = nav_browse_id {
                            if seen_album_ids.insert(bid.to_string()) {
                                let mut album_artist = None;
                                let mut album_year = None;
                                if let Some(runs) = col1_runs {
                                    for r in runs {
                                        if let Some(txt) = r.get("text").and_then(|v| v.as_str()).map(|s| s.trim()) {
                                            if txt.len() == 4 && txt.chars().all(|c| c.is_ascii_digit()) {
                                                album_year = Some(txt.to_string());
                                            } else if !txt.is_empty() && !txt.eq_ignore_ascii_case("album") && !txt.eq_ignore_ascii_case("single") && !txt.eq_ignore_ascii_case("ep") && txt != "•" {
                                                if album_artist.is_none() {
                                                    album_artist = Some(txt.to_string());
                                                }
                                            }
                                        }
                                    }
                                }
                                albums.push(AlbumItem {
                                    id: bid.to_string(),
                                    title,
                                    year: album_year.or_else(|| if col1_text.is_empty() { None } else { Some(col1_text) }),
                                    thumbnail_url: thumb,
                                    artist: album_artist,
                                });
                                if albums.len() >= limit {
                                    return;
                                }
                            }
                        }
                    } else if is_playlist {
                        if let Some(bid) = nav_browse_id {
                            if seen_playlist_ids.insert(bid.to_string()) {
                                playlists.push(ChartItem {
                                    id: bid.to_string(),
                                    title,
                                    subtitle: if col1_text.is_empty() { None } else { Some(col1_text) },
                                    thumbnail_url: thumb,
                                });
                                if playlists.len() >= limit {
                                    return;
                                }
                            }
                        }
                    } else {
                        // Regular track or video
                        if let Some(track) = Self::extract_responsive_item(resp) {
                            if seen_track_ids.insert(track.id.clone()) {
                                tracks.push(track);
                                if tracks.len() >= limit {
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// Extract saved playlist items from InnerTube library browse response
    pub fn extract_saved_playlists_from_browse(root: &Value) -> Vec<SavedPlaylist> {
        let mut results = Vec::new();
        Self::collect_saved_playlists(root, &mut results);
        results
    }

    fn collect_saved_playlists(val: &Value, results: &mut Vec<SavedPlaylist>) {
        match val {
            Value::Object(map) => {
                if let Some(two_row) = map.get("musicTwoRowItemRenderer") {
                    let title = two_row
                        .pointer("/title/runs/0/text")
                        .or_else(|| two_row.pointer("/title/simpleText"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();

                    let mut id = two_row
                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                        .or_else(|| two_row.pointer("/navigationEndpoint/watchEndpoint/playlistId"))
                        .or_else(|| two_row.pointer("/title/runs/0/navigationEndpoint/browseEndpoint/browseId"))
                        .or_else(|| two_row.pointer("/title/runs/0/navigationEndpoint/watchEndpoint/playlistId"))
                        .or_else(|| two_row.pointer("/thumbnailRenderer/musicThumbnailRenderer/navigationEndpoint/browseEndpoint/browseId"))
                        .or_else(|| two_row.pointer("/thumbnailRenderer/musicThumbnailRenderer/navigationEndpoint/watchEndpoint/playlistId"))
                        .or_else(|| two_row.pointer("/thumbnailOverlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/playlistId"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    if id.starts_with("VL") {
                        id = id.strip_prefix("VL").unwrap_or(&id).to_string();
                    }

                    let is_playlist_or_album = !id.is_empty()
                        && !id.starts_with("UC")
                        && !id.starts_with("FEmusic_library_")
                        && !id.starts_with("FEchannel_")
                        && !title.is_empty();

                    if is_playlist_or_album {
                        let thumb = two_row
                            .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                            .and_then(|t| t.as_array())
                            .and_then(|arr| arr.last())
                            .and_then(|l| l.get("url"))
                            .and_then(|u| u.as_str())
                            .map(|s| s.to_string());

                        let mut track_count = 0;
                        if let Some(runs) = two_row.pointer("/subtitle/runs").and_then(|v| v.as_array()) {
                            for r in runs {
                                if let Some(txt) = r.get("text").and_then(|t| t.as_str()) {
                                    let digits: String = txt.chars().filter(|c| c.is_ascii_digit()).collect();
                                    if let Ok(n) = digits.parse::<usize>() {
                                        if n > 0 {
                                            track_count = n;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        if !results.iter().any(|p| p.id == id) {
                            results.push(SavedPlaylist {
                                id,
                                title,
                                track_count,
                                thumbnail_url: thumb,
                            });
                        }
                    }
                } else if let Some(list_item) = map.get("musicResponsiveListItemRenderer") {
                    let title = list_item
                        .pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();

                    let mut id = list_item
                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                        .or_else(|| list_item.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/browseEndpoint/browseId"))
                        .or_else(|| list_item.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/watchEndpoint/playlistId"))
                        .or_else(|| list_item.pointer("/navigationEndpoint/watchEndpoint/playlistId"))
                        .or_else(|| list_item.pointer("/playlistItemData/playlistSetVideoId"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    if id.starts_with("VL") {
                        id = id.strip_prefix("VL").unwrap_or(&id).to_string();
                    }

                    let is_playlist_or_album = !id.is_empty()
                        && !id.starts_with("UC")
                        && !id.starts_with("FEmusic_library_")
                        && !id.starts_with("FEchannel_")
                        && !title.is_empty();

                    if is_playlist_or_album {
                        let thumb = list_item
                            .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                            .and_then(|t| t.as_array())
                            .and_then(|arr| arr.last())
                            .and_then(|l| l.get("url"))
                            .and_then(|u| u.as_str())
                            .map(|s| s.to_string());

                        let mut track_count = 0;
                        if let Some(runs) = list_item
                            .pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs")
                            .and_then(|v| v.as_array())
                        {
                            for r in runs {
                                if let Some(txt) = r.get("text").and_then(|t| t.as_str()) {
                                    let digits: String = txt.chars().filter(|c| c.is_ascii_digit()).collect();
                                    if let Ok(n) = digits.parse::<usize>() {
                                        if n > 0 {
                                            track_count = n;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        if !results.iter().any(|p| p.id == id) {
                            results.push(SavedPlaylist {
                                id,
                                title,
                                track_count,
                                thumbnail_url: thumb,
                            });
                        }
                    }
                }

                for v in map.values() {
                    Self::collect_saved_playlists(v, results);
                }
            }
            Value::Array(arr) => {
                for v in arr {
                    Self::collect_saved_playlists(v, results);
                }
            }
            _ => {}
        }
    }

    /// Fetch official account playlists from YouTube Music Library via InnerTube
    pub async fn sync_library(cookies: Option<&str>) -> Result<Vec<SavedPlaylist>, String> {
        let raw_input = cookies
            .map(|c| c.trim())
            .filter(|c| !c.is_empty())
            .ok_or_else(|| {
                "Для синхронізації плейлистів увійдіть у свій акаунт Google (Settings -> Google Sign-In).".to_string()
            })?;

        let cookie_header = normalize_cookie_header(raw_input);

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| Client::new());

        let mut all_playlists = Vec::new();

        for browse_id in ["FEmusic_library_playlists", "FEmusic_library_landing", "FEmusic_liked_playlists"] {
            let mut req = client
                .post("https://music.youtube.com/youtubei/v1/browse")
                .header("Content-Type", "application/json")
                .header("User-Agent", WEB_REMIX_USER_AGENT)
                .header("Origin", "https://music.youtube.com")
                .header("X-Origin", "https://music.youtube.com")
                .header("X-Goog-AuthUser", "0")
                .header("Cookie", &cookie_header);

            if let Some(sapisid) = extract_sapisid(&cookie_header) {
                let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
                req = req.header("Authorization", auth);
            }

            let body = json!({
                "context": {
                    "client": {
                        "clientName": "WEB_REMIX",
                        "clientVersion": WEB_REMIX_CLIENT_VERSION,
                        "hl": "en",
                        "gl": "US"
                    }
                },
                "browseId": browse_id
            });

            if let Ok(resp) = req.json(&body).send().await {
                if resp.status().is_success() {
                    if let Ok(root) = resp.json::<Value>().await {
                        let playlists = Self::extract_saved_playlists_from_browse(&root);
                        if !playlists.is_empty() {
                            for pl in playlists {
                                if !all_playlists.iter().any(|existing: &SavedPlaylist| existing.id == pl.id) {
                                    all_playlists.push(pl);
                                }
                            }

                            // Fetch continuation pages for library playlists
                            let mut next_token = Self::extract_continuation_token(&root);
                            let mut seen_tokens = std::collections::HashSet::new();
                            for _ in 0..10 {
                                let Some(token) = next_token.take() else { break; };
                                if !seen_tokens.insert(token.clone()) { break; }
                                let mut cont_req = client
                                    .post(format!("https://music.youtube.com/youtubei/v1/browse?continuation={}&ctoken={}", token, token))
                                    .header("Content-Type", "application/json")
                                    .header("User-Agent", WEB_REMIX_USER_AGENT)
                                    .header("Origin", "https://music.youtube.com")
                                    .header("X-Origin", "https://music.youtube.com")
                                    .header("X-Goog-AuthUser", "0")
                                    .header("Cookie", &cookie_header);
                                if let Some(sapisid) = extract_sapisid(&cookie_header) {
                                    let auth = compute_sapisidhash(&sapisid, "https://music.youtube.com");
                                    cont_req = cont_req.header("Authorization", auth);
                                }
                                let cont_body = json!({
                                    "context": {
                                        "client": {
                                            "clientName": "WEB_REMIX",
                                            "clientVersion": WEB_REMIX_CLIENT_VERSION,
                                            "hl": "en",
                                            "gl": "US"
                                        }
                                    }
                                });
                                if let Ok(cont_resp) = cont_req.json(&cont_body).send().await {
                                    if cont_resp.status().is_success() {
                                        if let Ok(cont_root) = cont_resp.json::<Value>().await {
                                            let cont_playlists = Self::extract_saved_playlists_from_browse(&cont_root);
                                            for pl in cont_playlists {
                                                if !all_playlists.iter().any(|existing: &SavedPlaylist| existing.id == pl.id) {
                                                    all_playlists.push(pl);
                                                }
                                            }
                                            next_token = Self::extract_continuation_token(&cont_root);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(all_playlists)
    }
}

/// Converts either a raw Cookie header OR a Netscape cookies.txt string into `k=v; k2=v2`
pub(crate) fn normalize_cookie_header(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.contains('\t') || trimmed.starts_with("# Netscape") || trimmed.starts_with("# HTTP Cookie") {
        let mut pairs = Vec::new();
        for line in trimmed.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() >= 7 {
                pairs.push(format!("{}={}", cols[5].trim(), cols[6].trim()));
            }
        }
        if !pairs.is_empty() {
            return pairs.join("; ");
        }
    }

    let without_prefix = if let Some(rest) = trimmed.strip_prefix("Cookie:") {
        rest.trim()
    } else if let Some(rest) = trimmed.strip_prefix("cookie:") {
        rest.trim()
    } else {
        trimmed
    };

    without_prefix.replace('\n', "; ").replace('\r', "")
}

/// Extracts SAPISID or __Secure-3PAPISID from a cookie header string
pub(crate) fn extract_sapisid(cookie_header: &str) -> Option<String> {
    let mut fallback = None;
    for part in cookie_header.split(';') {
        if let Some((k, v)) = part.trim().split_once('=') {
            let key = k.trim();
            let val = v.trim();
            if key == "SAPISID" {
                return Some(val.to_string());
            } else if key == "__Secure-3PAPISID" || key == "PAPISID" {
                fallback = Some(val.to_string());
            }
        }
    }
    fallback
}

/// Computes YouTube's `SAPISIDHASH <timestamp>_<sha1>` header
pub(crate) fn compute_sapisidhash(sapisid: &str, origin: &str) -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let input = format!("{} {} {}", ts, sapisid, origin);
    let hash = sha1_hex(input.as_bytes());
    format!("SAPISIDHASH {}_{}", ts, hash)
}

/// Pure-Rust SHA1 implementation for SAPISIDHASH
fn sha1_hex(data: &[u8]) -> String {
    let mut h0: u32 = 0x67452301;
    let mut h1: u32 = 0xEFCDAB89;
    let mut h2: u32 = 0x98BADCFE;
    let mut h3: u32 = 0x10325476;
    let mut h4: u32 = 0xC3D2E1F0;

    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let (mut a, mut b, mut c, mut d, mut e) = (h0, h1, h2, h3, h4);
        for i in 0..80 {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(w[i]);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }
        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }
    format!("{:08x}{:08x}{:08x}{:08x}{:08x}", h0, h1, h2, h3, h4)
}

fn parse_duration_string(s: &str) -> u32 {
    let clean = s.trim();
    let parts: Vec<&str> = clean.split(':').collect();
    if parts.len() == 2 {
        let mins: u32 = parts[0].trim().parse().unwrap_or(0);
        let secs: u32 = parts[1].trim().parse().unwrap_or(0);
        return mins * 60 + secs;
    } else if parts.len() == 3 {
        let hrs: u32 = parts[0].trim().parse().unwrap_or(0);
        let mins: u32 = parts[1].trim().parse().unwrap_or(0);
        let secs: u32 = parts[2].trim().parse().unwrap_or(0);
        return hrs * 3600 + mins * 60 + secs;
    }

    // Check textual format (e.g. "3 minutes, 36 seconds")
    if clean.contains("minute") || clean.contains("second") || clean.contains("hour") {
        let mut total = 0u32;
        let mut cur_num = 0u32;
        for word in clean.split_whitespace() {
            let num_clean: String = word.chars().filter(|c| c.is_ascii_digit()).collect();
            if let Ok(n) = num_clean.parse::<u32>() {
                cur_num = n;
            }
            let w_lower = word.to_lowercase();
            if w_lower.contains("hour") {
                total += cur_num * 3600;
                cur_num = 0;
            } else if w_lower.contains("minute") {
                total += cur_num * 60;
                cur_num = 0;
            } else if w_lower.contains("second") {
                total += cur_num;
                cur_num = 0;
            }
        }
        if total > 0 {
            return total;
        }
    }

    0
}

/// Generates a random 16-character Client Playback Nonce (CPN)
fn generate_cpn() -> String {
    let cpn_chars = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..16)
        .map(|_| {
            let idx = rng.gen_range(0..cpn_chars.len());
            cpn_chars[idx] as char
        })
        .collect()
}


