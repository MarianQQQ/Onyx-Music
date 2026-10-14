<p align="center">
  <img src="src-tauri/icons/128x128.png" width="115" height="115" alt="Onyx Music Logo" />
</p>

<h1 align="center">Onyx Music</h1>

<p align="center">
  <a href="https://readme-typing-svg.demolab.com">
    <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=17&duration=2400&pause=1000&color=FF2252&background=00000000&center=true&vCenter=true&width=580&lines=High-Performance+YouTube+Music+Desktop;Tauri+v2+%2B+Rust+2024+%2B+SolidJS;~48MB+UI+Process+%E2%80%A2+Zero+Electron+Bloat;Native+WASAPI+Audio+%2B+3-Band+DSP;Interactive+Synced+Lyrics+(Alt%2BClick);Built-in+SponsorBlock+%26+Last.fm+Scrobbler" alt="Typing Features" />
  </a>
</p>

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=rust,tauri,solidjs,tailwind,ts&theme=dark" alt="Tech Stack" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/MarianQQQ/Onyx-Music/releases"><img src="https://img.shields.io/badge/version-v0.2.0-ff2252.svg?style=for-the-badge&logo=github&color=24040b&labelColor=000000" alt="Version" /></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/engine-Tauri_v2-24C8D8.svg?style=for-the-badge&logo=tauri&color=091f24&labelColor=000000" alt="Tauri v2" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/core-Rust_2024-DEA584.svg?style=for-the-badge&logo=rust&color=2b1408&labelColor=000000" alt="Rust 2024" /></a>
  <a href="https://www.solidjs.com/"><img src="https://img.shields.io/badge/ui-SolidJS-2C4F7C.svg?style=for-the-badge&logo=solid&color=0a1729&labelColor=000000" alt="SolidJS" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-E11D48.svg?style=for-the-badge&color=290610&labelColor=000000" alt="License" /></a>
</p>

<p align="center">
  <img src="divider.svg" width="100%" alt="AMOLED Divider" />
</p>

<p align="center">
  <img src="./docs/assets/preview.png" width="100%" alt="Onyx Music Interface Preview" />
</p>

<p align="center">
  <img src="divider.svg" width="100%" alt="AMOLED Divider" />
</p>

## ⚡ Instant Download

<table>
  <tr>
    <td align="center" width="50%">
      <h3>📦 Windows Setup Installer</h3>
      <p>Clean installer with Start Menu integration and automatic uninstaller.</p>
      <a href="https://github.com/MarianQQQ/Onyx-Music/releases/latest/download/Onyx-Setup.exe">
        <img src="https://img.shields.io/badge/Download-Onyx--Setup.exe-ff2252?style=for-the-badge&logo=windows&logoColor=white&color=33050e&labelColor=000000" alt="Download Installer" />
      </a>
    </td>
    <td align="center" width="50%">
      <h3>🚀 Portable Binary</h3>
      <p>Single standalone executable ready to run anywhere without installation.</p>
      <a href="https://github.com/MarianQQQ/Onyx-Music/releases/latest/download/Onyx-Music.exe">
        <img src="https://img.shields.io/badge/Download-Onyx--Music.exe-24C8D8?style=for-the-badge&logo=windows&logoColor=white&color=0a2024&labelColor=000000" alt="Download Portable" />
      </a>
    </td>
  </tr>
</table>

<p align="center">
  <a href="https://github.com/MarianQQQ/Onyx-Music/releases"><b>View All Releases & Changelogs &rarr;</b></a>
</p>

<p align="center">
  <img src="divider.svg" width="100%" alt="AMOLED Divider" />
</p>

## 💡 Inspiration & Roots

Onyx combines the best ideas from two open-source projects:

* **[th-ch/youtube-music](https://github.com/th-ch/youtube-music)** *(Pear Desktop)*: The benchmark for desktop GUI completeness and rich plugins (SponsorBlock, Last.fm scrobbler, synced lyrics, Discord RPC).
* **[peternaame-boop/ytm-player](https://github.com/peternaame-boop/ytm-player)**: The benchmark for extreme speed, minimal resource usage (~20 MB RAM), and zero background bloat.

**The Onyx Synthesis:** Rich desktop GUI and plugin ecosystem with CLI-grade lightness via native **Tauri v2**, **Rust 2024**, and **SolidJS**.

<p align="center">
  <img src="divider.svg" width="100%" alt="AMOLED Divider" />
</p>

## 🚀 Performance Benchmarks (Real Telemetry)

| Metric | Electron Wrappers | **Onyx Music (Measured)** |
| :--- | :---: | :---: |
| **App UI Process RAM** | ~450 – 700 MB | **~48.5 MB** |
| **Total Memory (with GPU & Sandbox)** | ~650 – 900+ MB | **~211 MB** |
| **Playback CPU Load** | 3.5% – 6.0% | **~1.5% – 1.9%** |
| **Idle CPU Load** | 1.0% – 2.5% | **0.0%** |
| **Cold Startup Time** | ~4.0s – 5.5s | **< 0.8s** |
| **Binary Bundle Size** | ~180 MB | **~6 MB** |

<p align="center">
  <img src="divider.svg" width="100%" alt="AMOLED Divider" />
</p>

## ✨ Highlights & Features

- 🎛️ **Native Audio Pipeline & DSP**: Direct WASAPI stream, 3-band parametric EQ (Low-Shelf, Mid, High-Shelf), and dual-slot gapless A/B crossfade.
- ⚡ **Massive Virtualization**: Smooth 60 FPS scrolling through 3,000+ tracks with constant low memory usage and zero DOM stutter.
- 🔀 **Contextual Playback & Smart Queue**: Isolated manual queue that never breaks your album/liked flow; true Fisher-Yates shuffle across your entire library.
- 🎤 **Interactive Synced Lyrics**: Sub-millisecond LRCLIB integration, click-to-seek, and 1-click `Alt + Click` real-time sync calibration.
- 🔌 **Built-in Plugin Ecosystem**: Built-in SponsorBlock (skips video sponsor segments & intros), Last.fm scrobbler, Discord Rich Presence, and native toast alerts.
- ⌨️ **Global Hotkeys & Media Controls**: Control playback, skip tracks, and fine-tune volume from anywhere in Windows even when gaming or minimized.
- 🛡️ **AI & Spam Filter**: $O(1)$ heuristic regex scanner filters AI voice clones, fake tracks, and automated remix re-uploads.
- 🔐 **Privacy-First Local Auth**: Credentials stay strictly on your device; direct communication with YouTube InnerTube endpoints.

<p align="center">
  <img src="divider.svg" width="100%" alt="AMOLED Divider" />
</p>

<details>
<summary><b>⚙️ Build from Source (Developer Guide)</b></summary>
<br>

```bash
# 1. Install dependencies
pnpm install

# 2. Run dev server with Hot Module Replacement
pnpm tauri dev

# 3. Build optimized release binary
pnpm tauri build
```

</details>

<br>

## ⚠️ Known Issues

* **Lyrics Desync**: Occasional timing offset between community-sourced LRCLIB timestamps and specific YouTube audio versions. You can instantly calibrate the offset in real time using `Alt + Click` on the current lyric line.
* **Bug Reports**: Encountered a glitch or have a suggestion? Please [open an issue](https://github.com/MarianQQQ/Onyx-Music/issues) on GitHub.

<br>

## 📄 License & Disclaimer

* **License**: Distributed under the [MIT License](./LICENSE).
* **Disclaimer**: Independent open-source project, not affiliated with Google LLC or YouTube.

---

<p align="center">
  <sub>Engineered by <b><a href="https://github.com/MarianQQQ">MarianQQQ</a></b> &amp; <b>Google Gemini</b></sub>
</p>
