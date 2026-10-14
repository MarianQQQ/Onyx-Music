#[cfg(windows)]
pub mod session_branding {
    use std::collections::HashSet;
    use std::path::PathBuf;
    use std::time::Duration;
    use windows::core::{Interface, GUID, HSTRING};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::{
        eRender, DEVICE_STATE_ACTIVE, IAudioSessionControl2,
        IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    pub fn start_audio_session_branding_watcher() {
        std::thread::spawn(move || {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }

            let my_pid = std::process::id();
            let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("onyx-music.exe"));
            let mut exe_path_str = exe_path.to_string_lossy().to_string();
            if let Some(stripped) = exe_path_str.strip_prefix(r"\\?\") {
                exe_path_str = stripped.to_string();
            }

            loop {
                std::thread::sleep(Duration::from_millis(1500));
                let _ = brand_sessions(my_pid, &exe_path_str);
            }
        });
    }

    fn brand_sessions(my_pid: u32, exe_path: &str) -> windows::core::Result<()> {
        let related_pids = get_related_pids(my_pid);

        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let devices = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
            let dev_count = devices.GetCount()?;

            let app_name = HSTRING::from("Onyx Music");
            let icon_path = HSTRING::from(format!("{},0", exe_path));
            let event_context = GUID::zeroed();

            for d_idx in 0..dev_count {
                if let Ok(device) = devices.Item(d_idx) {
                    if let Ok(session_manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) {
                        if let Ok(session_enumerator) = session_manager.GetSessionEnumerator() {
                            let count = session_enumerator.GetCount().unwrap_or(0);
                            for i in 0..count {
                                if let Ok(control) = session_enumerator.GetSession(i) {
                                    if let Ok(control2) = control.cast::<IAudioSessionControl2>() {
                                        if let Ok(pid) = control2.GetProcessId() {
                                            if related_pids.contains(&pid) {
                                                let _ = control.SetDisplayName(&app_name, &event_context);
                                                let _ = control.SetIconPath(&icon_path, &event_context);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn get_related_pids(my_pid: u32) -> HashSet<u32> {
        let mut pids = HashSet::new();
        pids.insert(my_pid);

        let mut all_processes: Vec<(u32, u32)> = Vec::new();

        unsafe {
            let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
                Ok(h) => h,
                Err(_) => return pids,
            };

            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };

            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    all_processes.push((entry.th32ProcessID, entry.th32ParentProcessID));
                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }

            let _ = CloseHandle(snapshot);
        }

        let mut changed = true;
        while changed {
            changed = false;
            for &(pid, parent_pid) in &all_processes {
                if pids.contains(&parent_pid) && !pids.contains(&pid) {
                    pids.insert(pid);
                    changed = true;
                }
            }
        }

        pids
    }
}
