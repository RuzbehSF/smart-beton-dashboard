//! User preferences (stored in the `settings` table) and the system integration they control:
//! global shortcuts, start with Windows, minimize to tray and desktop notifications.
use crate::{database, platform, security};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

pub static MINIMIZE_TO_TRAY: AtomicBool = AtomicBool::new(false);
static LAST_DUE_NOTICE: Mutex<Option<(String, i64, i64)>> = Mutex::new(None);

const DEFAULTS: [(&str, &str); 12] = [
    ("automation_catch_up", "true"),
    ("shortcut_palette", "Ctrl+Alt+K"), ("shortcut_quick_note", "Ctrl+Alt+N"), ("shortcut_idea", "Ctrl+Alt+I"), ("shortcut_dashboard", "Ctrl+Alt+D"),
    ("minimize_to_tray", "false"), ("start_with_windows", "false"),
    ("notify_tasks", "true"), ("notify_backups", "true"), ("notify_automations", "true"),
    ("vault_lock_minutes", "5"), ("clipboard_timeout_seconds", "30"),
];
const SHORTCUTS: [(&str, &str); 4] = [("shortcut_palette", "open-palette"), ("shortcut_quick_note", "quick-capture"), ("shortcut_idea", "capture-idea"), ("shortcut_dashboard", "open-dashboard")];

pub fn parse_shortcut(text: &str) -> Result<Shortcut, String> {
    let shortcut: Shortcut = text.trim().parse().map_err(|_| format!("\"{}\" is not a valid shortcut. Example: Ctrl+Alt+K", text.trim()))?;
    if shortcut.mods.is_empty() { return Err("A shortcut needs at least one modifier key (Ctrl, Alt or Shift)".into()); }
    Ok(shortcut)
}

fn read(db: &Connection, key: &str) -> Result<Option<String>, String> {
    db.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0)).optional().map_err(|e| e.to_string())
}
fn value_of(db: &Connection, key: &str) -> Result<String, String> {
    let default = DEFAULTS.iter().find(|(k, _)| *k == key).map(|(_, v)| *v).unwrap_or("");
    Ok(read(db, key)?.unwrap_or_else(|| default.to_string()))
}
fn flag(db: &Connection, key: &str) -> Result<bool, String> { Ok(value_of(db, key)? == "true") }
pub fn clipboard_timeout(db: &Connection) -> u64 { value_of(db, "clipboard_timeout_seconds").ok().and_then(|v| v.parse().ok()).unwrap_or(30) }

fn normalize(key: &str, value: &str) -> Result<String, String> {
    let value = value.trim();
    match key {
        "shortcut_palette" | "shortcut_quick_note" | "shortcut_idea" | "shortcut_dashboard" => { parse_shortcut(value)?; Ok(value.to_string()) }
        "minimize_to_tray" | "start_with_windows" | "notify_tasks" | "notify_backups" | "notify_automations" | "automation_catch_up" => {
            if value == "true" || value == "false" { Ok(value.to_string()) } else { Err("Invalid value".into()) }
        }
        "vault_lock_minutes" => match value.parse::<u32>() { Ok(n) if (1..=60).contains(&n) => Ok(n.to_string()), _ => Err("Choose between 1 and 60 minutes".into()) },
        "clipboard_timeout_seconds" => match value.parse::<u32>() { Ok(n) if n <= 300 => Ok(n.to_string()), _ => Err("Choose between 0 (never clear) and 300 seconds".into()) },
        _ => Err("Unknown setting".into()),
    }
}

pub fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") { let _ = window.unminimize(); let _ = window.show(); let _ = window.set_focus(); }
}

/// Re-registers every global shortcut: the three application shortcuts plus enabled automations with a shortcut trigger.
/// Automations only open the review dialog in the window; they never run silently.
pub fn apply_shortcuts(app: &tauri::AppHandle) -> Result<(), String> {
    let db = database(app)?;
    let mut wanted: Vec<(Shortcut, String, String, Option<String>)> = Vec::new();
    for (key, event) in SHORTCUTS { let text = value_of(&db, key)?; wanted.push((parse_shortcut(&text)?, text, event.to_string(), None)); }
    {
        let mut stmt = db.prepare("SELECT id,shortcut FROM automations WHERE trigger_type='shortcut' AND enabled=1 AND shortcut<>''").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
        for row in rows { let (id, text) = row.map_err(|e| e.to_string())?; if let Ok(shortcut) = parse_shortcut(&text) { wanted.push((shortcut, text, "run-automation".into(), Some(id.to_string()))); } }
    }
    for (i, a) in wanted.iter().enumerate() {
        if wanted[..i].iter().any(|b| b.0 == a.0) { return Err(format!("The shortcut {} is used more than once", a.1)); }
    }
    let registry = app.global_shortcut();
    registry.unregister_all().map_err(|e| e.to_string())?;
    let mut failed = Vec::new();
    for (shortcut, text, event, payload) in wanted {
        let registered = registry.on_shortcut(shortcut, move |app, _, pressed| {
            if pressed.state() != ShortcutState::Pressed { return; }
            show_main(app);
            match &payload {
                Some(p) => { if let Ok(id) = p.parse::<i64>() { crate::scheduler::offer(app, id); } }
                None => { let _ = app.emit(&event, ()); }
            }
        });
        if registered.is_err() { failed.push(text); }
    }
    if failed.is_empty() { Ok(()) } else { Err(format!("Could not register {} (another program may be using it)", failed.join(", "))) }
}

const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
fn registry_command() -> Result<std::process::Command, String> {
    let mut command = std::process::Command::new(platform::system32_dir()?.join("reg.exe"));
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x0800_0000); }
    Ok(command)
}
pub fn autostart_enabled() -> bool {
    registry_command().ok().map(|mut c| c.args(["query", RUN_KEY, "/v", "SmartBetonDashboard"]).output().map(|o| o.status.success()).unwrap_or(false)).unwrap_or(false)
}
fn set_autostart(enable: bool) -> Result<(), String> {
    let mut command = registry_command()?;
    if enable {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        command.args(["add", RUN_KEY, "/v", "SmartBetonDashboard", "/t", "REG_SZ", "/d"]).arg(format!("\"{}\"", exe.display())).arg("/f");
    } else {
        if !autostart_enabled() { return Ok(()); }
        command.args(["delete", RUN_KEY, "/v", "SmartBetonDashboard", "/f"]);
    }
    let output = command.output().map_err(|e| format!("Could not change the Windows startup entry: {e}"))?;
    if output.status.success() { Ok(()) } else { Err("Windows did not allow changing the startup entry".into()) }
}

pub fn load_startup(app: &tauri::AppHandle) -> Result<(), String> {
    MINIMIZE_TO_TRAY.store(flag(&database(app)?, "minimize_to_tray")?, Ordering::Relaxed);
    Ok(())
}

fn apply_effect(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
    match key {
        "shortcut_palette" | "shortcut_quick_note" | "shortcut_idea" | "shortcut_dashboard" => apply_shortcuts(app),
        "minimize_to_tray" => { MINIMIZE_TO_TRAY.store(value == "true", Ordering::Relaxed); Ok(()) }
        "start_with_windows" => set_autostart(value == "true"),
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    let db = database(&app)?;
    let mut all = HashMap::new();
    for (key, _) in DEFAULTS { all.insert(key.to_string(), value_of(&db, key)?); }
    all.insert("start_with_windows".into(), autostart_enabled().to_string());
    Ok(all)
}

/// Saves one preference and applies it. If applying fails (for example a shortcut that is already taken) the old value is restored.
#[tauri::command]
pub fn update_setting(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let value = normalize(&key, &value)?;
    let db = database(&app)?;
    let previous = read(&db, &key)?;
    db.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(|e| e.to_string())?;
    if let Err(error) = apply_effect(&app, &key, &value) {
        match &previous {
            Some(old) => { let _ = db.execute("UPDATE settings SET value=?1 WHERE key=?2", params![old, key]); }
            None => { let _ = db.execute("DELETE FROM settings WHERE key=?1", [&key]); }
        }
        let _ = apply_effect(&app, &key, &previous.unwrap_or_else(|| DEFAULTS.iter().find(|(k, _)| *k == key).map(|(_, v)| v.to_string()).unwrap_or_default()));
        return Err(error);
    }
    Ok(())
}

#[derive(Serialize)]
pub struct AppInfo { version: String, database_path: String, schema_version: i64, credential_backend: String }

#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> Result<AppInfo, String> {
    let db_path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("dashboard.sqlite3");
    let db = database(&app)?;
    let version: i64 = db.pragma_query_value(None, "user_version", |r| r.get(0)).map_err(|e| e.to_string())?;
    #[cfg(windows)] let backend = if security::credential("availability-check").is_ok() { "Windows Credential Manager (available)" } else { "Windows Credential Manager (unavailable)" };
    #[cfg(not(windows))] let backend = "Not available on this platform";
    Ok(AppInfo { version: app.package_info().version.to_string(), database_path: db_path.to_string_lossy().into_owned(), schema_version: version, credential_backend: backend.into() })
}

fn show_notification(app: &tauri::AppHandle, title: &str, body: &str) -> Result<(), String> {
    app.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())
}

/// Shows a notification for one of the categories (tasks, backups, automations) unless the user turned it off. Bodies never contain secrets.
#[tauri::command]
pub fn notify_user(app: tauri::AppHandle, kind: String, title: String, body: String) -> Result<(), String> {
    if !["tasks", "backups", "automations"].contains(&kind.as_str()) { return Err("Unknown notification type".into()); }
    if !flag(&database(&app)?, &format!("notify_{kind}"))? { return Ok(()); }
    show_notification(&app, title.chars().take(80).collect::<String>().as_str(), body.chars().take(200).collect::<String>().as_str())
}

#[tauri::command]
pub fn send_test_notification(app: tauri::AppHandle) -> Result<(), String> { show_notification(&app, "Smart Beton Dashboard", "Notifications are working.") }

/// Counts open tasks that are overdue or due today and notifies once per change (counts only; no task titles).
#[tauri::command]
pub fn check_due_notifications(app: tauri::AppHandle) -> Result<(), String> {
    let db = database(&app)?;
    if !flag(&db, "notify_tasks")? { return Ok(()); }
    let (today, overdue, due): (String, i64, i64) = db.query_row(
        "SELECT date('now','localtime'), COALESCE(SUM(CASE WHEN due_date<date('now','localtime') THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN due_date=date('now','localtime') THEN 1 ELSE 0 END),0) FROM items WHERE kind='task' AND deleted=0 AND done=0 AND due_date IS NOT NULL",
        [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(|e| e.to_string())?;
    if overdue + due == 0 { return Ok(()); }
    let current = (today, overdue, due);
    let mut last = LAST_DUE_NOTICE.lock().map_err(|_| "Notifications are unavailable".to_string())?;
    if last.as_ref() == Some(&current) { return Ok(()); }
    *last = Some(current);
    show_notification(&app, "Tasks need attention", &format!("{overdue} overdue, {due} due today"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shortcuts_need_a_modifier_and_a_key() {
        assert!(parse_shortcut("Ctrl+Alt+K").is_ok());
        assert!(parse_shortcut("ctrl+shift+space").is_ok());
        assert!(parse_shortcut("K").is_err());
        assert!(parse_shortcut("Ctrl+Alt").is_err());
        assert!(parse_shortcut("").is_err());
    }
    #[test]
    fn settings_are_validated_per_key() {
        assert_eq!(normalize("minimize_to_tray", " true ").unwrap(), "true");
        assert!(normalize("minimize_to_tray", "yes").is_err());
        assert_eq!(normalize("vault_lock_minutes", "10").unwrap(), "10");
        assert!(normalize("vault_lock_minutes", "0").is_err());
        assert!(normalize("clipboard_timeout_seconds", "301").is_err());
        assert!(normalize("clipboard_timeout_seconds", "0").is_ok());
        assert!(normalize("display_name", "x").is_err());
    }
}
