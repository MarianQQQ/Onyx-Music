use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use super::extractor::StreamResolver;

pub struct AudioProxy {
    port: u16,
}

impl AudioProxy {
    pub async fn start(resolver: Arc<StreamResolver>) -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind local proxy: {}", e))?;

        let addr = listener.local_addr().map_err(|e| e.to_string())?;
        let port = addr.port();

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_default();
        let client = Arc::new(client);

        let resolver_clone = resolver.clone();
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((socket, _)) => {
                        let client = client.clone();
                        let resolver = resolver_clone.clone();
                        tokio::spawn(async move {
                            let _ = handle_connection(socket, client, resolver).await;
                        });
                    }
                    Err(e) => {
                        eprintln!("Audio proxy accept error: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(Self { port })
    }

    pub fn get_stream_url(&self, video_id: &str) -> String {
        format!("http://127.0.0.1:{}/stream?id={}", self.port, video_id)
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

const CORS_HEADERS: &str = "\
Access-Control-Allow-Origin: *\r\n\
Vary: Origin\r\n\
Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
Access-Control-Allow-Headers: Range, Content-Type, Accept, Origin\r\n\
Access-Control-Expose-Headers: Accept-Ranges, Content-Range, Content-Length\r\n";

async fn handle_connection(
    mut socket: TcpStream,
    client: Arc<reqwest::Client>,
    resolver: Arc<StreamResolver>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut buf = [0u8; 4096];
    let n = socket.read(&mut buf).await?;
    if n == 0 {
        return Ok(());
    }

    let req_str = String::from_utf8_lossy(&buf[..n]);
    let mut lines = req_str.lines();
    let first_line = match lines.next() {
        Some(l) => l,
        None => return Ok(()),
    };

    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Ok(());
    }

    let method = parts[0];
    let path = parts[1];

    // CORS preflight OPTIONS request
    if method == "OPTIONS" {
        let resp = format!(
            "HTTP/1.1 204 No Content\r\n\
{}Access-Control-Max-Age: 86400\r\n\
Content-Length: 0\r\n\
Connection: close\r\n\r\n",
            CORS_HEADERS
        );
        socket.write_all(resp.as_bytes()).await?;
        return Ok(());
    }

    // Extract Range header if present
    let mut range_val: Option<String> = None;
    for line in lines {
        if line.to_lowercase().starts_with("range:") {
            if let Some(pos) = line.find(':') {
                range_val = Some(line[pos + 1..].trim().to_string());
                break;
            }
        }
    }

    // Extract video ID from path: /stream?id=...
    let video_id = if let Some(query_idx) = path.find("id=") {
        let after = &path[query_idx + 3..];
        after.split('&').next().unwrap_or(after).to_string()
    } else {
        let resp = format!(
            "HTTP/1.1 400 Bad Request\r\n\
{}Content-Length: 16\r\n\
Connection: close\r\n\r\n\
Missing video ID",
            CORS_HEADERS
        );
        socket.write_all(resp.as_bytes()).await?;
        return Ok(());
    };

    // Resolve direct stream URL (cached or via yt-dlp)
    let upstream_url = match resolver.resolve_audio_url(&video_id).await {
        Ok(u) => u,
        Err(e) => {
            let body = format!("Failed to resolve stream: {}", e);
            let resp = format!(
                "HTTP/1.1 502 Bad Gateway\r\n\
{}Content-Length: {}\r\n\
Connection: close\r\n\r\n\
{}",
                CORS_HEADERS,
                body.len(),
                body
            );
            socket.write_all(resp.as_bytes()).await?;
            return Ok(());
        }
    };

    // Forward request to YouTube googlevideo CDN with Range header
    let mut req = if method == "HEAD" {
        client.head(&upstream_url)
    } else {
        client.get(&upstream_url)
    };
    if let Some(ref r) = range_val {
        req = req.header("Range", r);
    }

    let mut resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let body = format!("Upstream request failed: {}", e);
            let err_resp = format!(
                "HTTP/1.1 504 Gateway Timeout\r\n\
{}Content-Length: {}\r\n\
Connection: close\r\n\r\n\
{}",
                CORS_HEADERS,
                body.len(),
                body
            );
            socket.write_all(err_resp.as_bytes()).await?;
            return Ok(());
        }
    };

    let status = resp.status().as_u16();
    let reason = resp.status().canonical_reason().unwrap_or(if status == 416 {
        "Range Not Satisfiable"
    } else {
        "OK"
    });

    let accept_ranges = resp
        .headers()
        .get("accept-ranges")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("bytes");

    let mut res_headers = format!(
        "HTTP/1.1 {} {}\r\n\
{}Accept-Ranges: {}\r\n",
        status, reason, CORS_HEADERS, accept_ranges
    );

    if let Some(ct) = resp.headers().get("content-type") {
        if let Ok(s) = ct.to_str() {
            res_headers.push_str(&format!("Content-Type: {}\r\n", s));
        }
    }
    if let Some(cr) = resp.headers().get("content-range") {
        if let Ok(s) = cr.to_str() {
            res_headers.push_str(&format!("Content-Range: {}\r\n", s));
        }
    }
    if let Some(cl) = resp.headers().get("content-length") {
        if let Ok(s) = cl.to_str() {
            res_headers.push_str(&format!("Content-Length: {}\r\n", s));
        }
    }
    res_headers.push_str("Connection: close\r\n\r\n");

    socket.write_all(res_headers.as_bytes()).await?;

    if method == "HEAD" || status == 416 {
        drop(resp);
        return Ok(());
    }

    // Stream audio chunks to client
    while let Ok(Some(chunk)) = resp.chunk().await {
        if socket.write_all(&chunk).await.is_err() {
            drop(resp);
            break; // Client closed connection (e.g. seek / track skip)
        }
    }

    Ok(())
}
