use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static CLIPBOARD_GENERATION: AtomicU64 = AtomicU64::new(0);

#[cfg(windows)]
pub fn system32_dir() -> Result<PathBuf, String> {
    use std::os::windows::ffi::OsStringExt;
    let mut buf = vec![0u16; 32768];
    let len = unsafe {
        windows_sys::Win32::System::SystemInformation::GetSystemDirectoryW(
            buf.as_mut_ptr(),
            buf.len() as u32,
        )
    } as usize;
    if len == 0 || len >= buf.len() {
        return Err("Could not locate Windows system directory".into());
    }
    Ok(PathBuf::from(std::ffi::OsString::from_wide(&buf[..len])))
}

#[cfg(not(windows))]
pub fn system32_dir() -> Result<PathBuf, String> {
    Err("Windows system directory is only available on Windows".into())
}

#[cfg(windows)]
pub fn windows_dir() -> Result<PathBuf, String> {
    use std::os::windows::ffi::OsStringExt;
    let mut buf = vec![0u16; 32768];
    let len = unsafe {
        windows_sys::Win32::System::SystemInformation::GetWindowsDirectoryW(
            buf.as_mut_ptr(),
            buf.len() as u32,
        )
    } as usize;
    if len == 0 || len >= buf.len() {
        return Err("Could not locate Windows directory".into());
    }
    Ok(PathBuf::from(std::ffi::OsString::from_wide(&buf[..len])))
}

#[cfg(not(windows))]
pub fn windows_dir() -> Result<PathBuf, String> {
    Err("Windows directory is only available on Windows".into())
}

pub fn explorer_exe() -> Result<PathBuf, String> {
    let exe = windows_dir()?.join("explorer.exe");
    if !exe.is_file() {
        return Err("Windows Explorer executable was not found in Windows directory".into());
    }
    Ok(exe)
}

pub fn mstsc_exe() -> Result<PathBuf, String> {
    let exe = system32_dir()?.join("mstsc.exe");
    if !exe.is_file() {
        return Err("Remote Desktop client (mstsc.exe) was not found in System32".into());
    }
    Ok(exe)
}

pub fn openssh_exe() -> Result<PathBuf, String> {
    let exe = system32_dir()?.join("OpenSSH").join("ssh.exe");
    if !exe.is_file() {
        return Err("Windows OpenSSH client (ssh.exe) was not found in System32\\OpenSSH".into());
    }
    Ok(exe)
}

pub fn cmd_exe() -> Result<PathBuf, String> {
    let exe = system32_dir()?.join("cmd.exe");
    if !exe.is_file() {
        return Err("Windows Command Prompt (cmd.exe) was not found in System32".into());
    }
    Ok(exe)
}

#[cfg(windows)]
mod dpapi_ffi {
    #[repr(C)]
    pub struct DataBlob {
        pub cb_data: u32,
        pub pb_data: *mut u8,
    }

    pub const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    #[link(name = "crypt32")]
    extern "system" {
        pub fn CryptProtectData(
            p_data_in: *const DataBlob,
            sz_data_descr: *const u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;

        pub fn CryptUnprotectData(
            p_data_in: *const DataBlob,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn LocalFree(h_mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }
}

#[cfg(windows)]
pub fn dpapi_encrypt(plaintext: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
    use dpapi_ffi::*;
    let mut in_buf = plaintext.to_vec();
    let mut ent_buf = entropy.to_vec();
    let in_blob = DataBlob {
        cb_data: in_buf.len() as u32,
        pb_data: in_buf.as_mut_ptr(),
    };
    let ent_blob = DataBlob {
        cb_data: ent_buf.len() as u32,
        pb_data: ent_buf.as_mut_ptr(),
    };
    let mut out_blob = DataBlob {
        cb_data: 0,
        pb_data: std::ptr::null_mut(),
    };

    let ok = unsafe {
        CryptProtectData(
            &in_blob,
            std::ptr::null(),
            if ent_buf.is_empty() {
                std::ptr::null()
            } else {
                &ent_blob
            },
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
    };

    for b in &mut in_buf {
        *b = 0;
    }
    for b in &mut ent_buf {
        *b = 0;
    }

    if ok == 0 || out_blob.pb_data.is_null() {
        return Err("Windows DPAPI encryption failed".into());
    }
    let result = unsafe {
        std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize).to_vec()
    };
    unsafe {
        LocalFree(out_blob.pb_data as *mut std::ffi::c_void);
    }
    Ok(result)
}

#[cfg(not(windows))]
pub fn dpapi_encrypt(_plaintext: &[u8], _entropy: &[u8]) -> Result<Vec<u8>, String> {
    Err("Windows DPAPI encryption requires Windows".into())
}

#[cfg(windows)]
pub fn dpapi_decrypt(ciphertext: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
    use dpapi_ffi::*;
    if ciphertext.is_empty() {
        return Err("Encrypted payload is empty".into());
    }
    let mut in_buf = ciphertext.to_vec();
    let mut ent_buf = entropy.to_vec();
    let in_blob = DataBlob {
        cb_data: in_buf.len() as u32,
        pb_data: in_buf.as_mut_ptr(),
    };
    let ent_blob = DataBlob {
        cb_data: ent_buf.len() as u32,
        pb_data: ent_buf.as_mut_ptr(),
    };
    let mut out_blob = DataBlob {
        cb_data: 0,
        pb_data: std::ptr::null_mut(),
    };

    let ok = unsafe {
        CryptUnprotectData(
            &in_blob,
            std::ptr::null_mut(),
            if ent_buf.is_empty() {
                std::ptr::null()
            } else {
                &ent_blob
            },
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
    };

    for b in &mut ent_buf {
        *b = 0;
    }

    if ok == 0 || out_blob.pb_data.is_null() {
        return Err("Windows DPAPI decryption failed or payload was tampered with".into());
    }
    let slice =
        unsafe { std::slice::from_raw_parts_mut(out_blob.pb_data, out_blob.cb_data as usize) };
    let result = slice.to_vec();
    for b in slice.iter_mut() {
        *b = 0;
    }
    unsafe {
        LocalFree(out_blob.pb_data as *mut std::ffi::c_void);
    }
    Ok(result)
}

#[cfg(not(windows))]
pub fn dpapi_decrypt(_ciphertext: &[u8], _entropy: &[u8]) -> Result<Vec<u8>, String> {
    Err("Windows DPAPI decryption requires Windows".into())
}

#[cfg(windows)]
mod clipboard_ffi {
    pub const CF_UNICODETEXT: u32 = 13;
    pub const GMEM_MOVEABLE: u32 = 0x0002;

    #[link(name = "user32")]
    extern "system" {
        pub fn OpenClipboard(h_wnd_new_owner: *mut std::ffi::c_void) -> i32;
        pub fn CloseClipboard() -> i32;
        pub fn EmptyClipboard() -> i32;
        pub fn SetClipboardData(u_format: u32, h_mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
        pub fn GetClipboardData(u_format: u32) -> *mut std::ffi::c_void;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn GlobalAlloc(u_flags: u32, dw_bytes: usize) -> *mut std::ffi::c_void;
        pub fn GlobalLock(h_mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
        pub fn GlobalUnlock(h_mem: *mut std::ffi::c_void) -> i32;
        pub fn GlobalFree(h_mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }
}

#[cfg(windows)]
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    use clipboard_ffi::*;
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = std::ffi::OsStr::new(text)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let bytes = wide.len() * std::mem::size_of::<u16>();

    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err("Could not open Windows clipboard".into());
        }
        if EmptyClipboard() == 0 {
            let _ = CloseClipboard();
            return Err("Could not clear Windows clipboard".into());
        }
        let h_mem = GlobalAlloc(GMEM_MOVEABLE, bytes);
        if h_mem.is_null() {
            let _ = CloseClipboard();
            return Err("Could not allocate clipboard memory".into());
        }
        let ptr = GlobalLock(h_mem) as *mut u16;
        if ptr.is_null() {
            let _ = GlobalFree(h_mem);
            let _ = CloseClipboard();
            return Err("Could not lock clipboard memory".into());
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
        let _ = GlobalUnlock(h_mem);
        if SetClipboardData(CF_UNICODETEXT, h_mem).is_null() {
            let _ = GlobalFree(h_mem);
            let _ = CloseClipboard();
            return Err("Could not write to Windows clipboard".into());
        }
        let _ = CloseClipboard();
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn set_clipboard_text(_text: &str) -> Result<(), String> {
    Err("Native clipboard requires Windows".into())
}

#[cfg(windows)]
pub fn get_clipboard_text() -> Option<String> {
    use clipboard_ffi::*;
    use std::os::windows::ffi::OsStringExt;
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return None;
        }
        let h_data = GetClipboardData(CF_UNICODETEXT);
        if h_data.is_null() {
            let _ = CloseClipboard();
            return None;
        }
        let ptr = GlobalLock(h_data) as *const u16;
        if ptr.is_null() {
            let _ = CloseClipboard();
            return None;
        }
        let mut len = 0usize;
        while len < 1_048_576 && *ptr.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(ptr, len);
        let text = std::ffi::OsString::from_wide(slice)
            .to_string_lossy()
            .into_owned();
        let _ = GlobalUnlock(h_data);
        let _ = CloseClipboard();
        Some(text)
    }
}

#[cfg(not(windows))]
pub fn get_clipboard_text() -> Option<String> {
    None
}

#[cfg(windows)]
pub fn clear_clipboard_if_matches(expected: &str) -> bool {
    use clipboard_ffi::*;
    if get_clipboard_text().as_deref() != Some(expected) {
        return false;
    }
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return false;
        }
        let cleared = EmptyClipboard() != 0;
        let _ = CloseClipboard();
        cleared
    }
}

#[cfg(not(windows))]
pub fn clear_clipboard_if_matches(_expected: &str) -> bool {
    false
}

pub fn copy_with_conditional_clear(value: String, timeout_secs: u64) -> Result<(), String> {
    set_clipboard_text(&value)?;
    let gen = CLIPBOARD_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    if timeout_secs > 0 {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(timeout_secs));
            if CLIPBOARD_GENERATION.load(Ordering::SeqCst) == gen {
                let _ = clear_clipboard_if_matches(&value);
            }
        });
    }
    Ok(())
}

/// First match of any of the file names in the folders of the PATH variable.
pub fn find_in_path(names: &[&str]) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).flat_map(|dir| names.iter().map(move |name| dir.join(name))).find(|candidate| candidate.is_file())
}

pub fn detect_standard_tool_path(slug: &str) -> Option<PathBuf> {
    detect_in_standard_folders(slug).or_else(|| match slug {
        "claude" => find_in_path(&["claude.exe", "claude.cmd"]),
        "codex" => find_in_path(&["codex.exe", "codex.cmd"]),
        "antigravity" => find_in_path(&["antigravity.exe"]),
        "vscode" => find_in_path(&["Code.exe"]),
        "git" => find_in_path(&["git.exe"]),
        _ => None,
    })
}

fn detect_in_standard_folders(slug: &str) -> Option<PathBuf> {
    let local_app = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let prog_files = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let user_profile = std::env::var_os("USERPROFILE").map(PathBuf::from);

    let candidates: Vec<PathBuf> = match slug {
        "vscode" => {
            let mut v = Vec::new();
            if let Some(ref l) = local_app {
                v.push(l.join("Programs").join("Microsoft VS Code").join("Code.exe"));
            }
            if let Some(ref p) = prog_files {
                v.push(p.join("Microsoft VS Code").join("Code.exe"));
            }
            v
        }
        "antigravity" => {
            let mut v = Vec::new();
            if let Some(ref l) = local_app {
                v.push(l.join("Programs").join("Antigravity").join("Antigravity.exe"));
                v.push(l.join("Antigravity").join("Antigravity.exe"));
            }
            if let Some(ref p) = prog_files {
                v.push(p.join("Antigravity").join("Antigravity.exe"));
            }
            v
        }
        "terminal" => {
            let mut v = Vec::new();
            if let Some(ref l) = local_app {
                v.push(l.join("Microsoft").join("WindowsApps").join("wt.exe"));
            }
            if let Ok(cmd) = cmd_exe() {
                v.push(cmd);
            }
            v
        }
        "git" => {
            let mut v = Vec::new();
            if let Some(ref p) = prog_files {
                v.push(p.join("Git").join("cmd").join("git.exe"));
                v.push(p.join("Git").join("bin").join("git.exe"));
            }
            if let Some(ref l) = local_app {
                v.push(l.join("Programs").join("Git").join("cmd").join("git.exe"));
            }
            v
        }
        "claude" => {
            let mut v = Vec::new();
            if let Some(app_data) = std::env::var_os("APPDATA").map(PathBuf::from) { v.push(app_data.join("npm").join("claude.cmd")); }
            if let Some(ref u) = user_profile {
                v.push(u.join(".local").join("bin").join("claude.exe"));
            }
            if let Some(ref l) = local_app {
                v.push(l.join("Programs").join("claude-code").join("claude.exe"));
            }
            v
        }
        "codex" => {
            let mut v = Vec::new();
            if let Some(app_data) = std::env::var_os("APPDATA").map(PathBuf::from) { v.push(app_data.join("npm").join("codex.cmd")); }
            if let Some(ref u) = user_profile {
                v.push(u.join(".local").join("bin").join("codex.exe"));
            }
            v
        }
        "anydesk" => {
            let mut v = Vec::new();
            if let Some(ref p) = prog_files {
                v.push(p.join("AnyDesk").join("AnyDesk.exe"));
            }
            if let Some(p86) = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from) {
                v.push(p86.join("AnyDesk").join("AnyDesk.exe"));
            }
            v
        }
        _ => Vec::new(),
    };

    candidates.into_iter().find(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn dpapi_roundtrip_and_tamper_detection() {
        let secret = b"Synthetic secure note body for Smart Beton Dashboard test";
        let entropy = b"per-note-random-entropy-key-12345";
        let encrypted = dpapi_encrypt(secret, entropy).expect("DPAPI encrypt should succeed");
        assert_ne!(encrypted.as_slice(), secret);

        let decrypted = dpapi_decrypt(&encrypted, entropy).expect("DPAPI decrypt should succeed");
        assert_eq!(decrypted.as_slice(), secret);

        // Wrong entropy must fail
        assert!(dpapi_decrypt(&encrypted, b"wrong-entropy").is_err());

        // Corrupted ciphertext must fail
        let mut tampered = encrypted.clone();
        if let Some(last) = tampered.last_mut() {
            *last ^= 0xFF;
        }
        assert!(dpapi_decrypt(&tampered, entropy).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn resolves_windows_system_binaries() {
        assert!(explorer_exe().is_ok());
        assert!(mstsc_exe().is_ok());
        assert!(cmd_exe().is_ok());
    }
}
