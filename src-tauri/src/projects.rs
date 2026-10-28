//! Project management commands: manual creation, metadata, favorites/archive, working sessions, tool launching and activity.
use crate::{database, platform, security};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const STATUSES: [&str; 3] = ["active", "paused", "completed"];
const TOOLS: [(&str, &str); 5] = [("vscode", "Visual Studio Code"), ("claude", "Claude Code"), ("codex", "Codex"), ("antigravity", "Antigravity"), ("terminal", "Terminal")];

pub fn is_tool(slug: &str) -> bool { TOOLS.iter().any(|(s, _)| *s == slug) }

/// Windows canonical paths carry a `\\?\` prefix that many programs do not understand; strip it for drive paths.
pub fn plain_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\") { if !rest.starts_with("UNC\\") { return PathBuf::from(rest); } }
    path.to_path_buf()
}

fn clean(value: &str, max: usize, what: &str, multiline: bool) -> Result<String, String> {
    let text = value.trim();
    if text.chars().count() > max || text.chars().any(|c| c.is_control() && !(multiline && c == '\n')) { return Err(format!("{what} is too long or contains control characters")); }
    Ok(text.to_string())
}

#[tauri::command]
pub fn create_project(app: tauri::AppHandle, name: String, path: String, description: String) -> Result<i64, String> {
    let name = clean(&name, 120, "Name", false)?;
    if name.is_empty() { return Err("Name is required".into()); }
    let canonical = Path::new(&path).canonicalize().map_err(|_| "The project folder does not exist".to_string())?;
    if !canonical.is_dir() { return Err("The project path is not a folder".into()); }
    let description = clean(&description, 2000, "Description", true)?;
    let db = database(&app)?;
    db.execute("INSERT INTO projects(path,name,description,created_at,updated_at) VALUES(?1,?2,?3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", params![canonical.to_string_lossy().as_ref(), name, description]).map_err(|_| "A project with this folder already exists".to_string())?;
    let id = db.last_insert_rowid();
    database::record_activity(&db, "project_created", "project", Some(id), Some(id), "Project added");
    Ok(id)
}

#[derive(Deserialize)]
pub struct ProjectUpdate { name: String, description: String, status: String, group_name: String, preferred_editor: String, technology_tags: String, website_url: String }

#[tauri::command]
pub fn update_project(app: tauri::AppHandle, id: i64, update: ProjectUpdate) -> Result<(), String> {
    let name = clean(&update.name, 120, "Name", false)?;
    if name.is_empty() { return Err("Name is required".into()); }
    if !STATUSES.contains(&update.status.as_str()) { return Err("Invalid status".into()); }
    if !TOOLS.iter().any(|(slug, _)| *slug == update.preferred_editor) { return Err("Invalid preferred editor".into()); }
    let website = clean(&update.website_url, 500, "Website", false)?;
    if !website.is_empty() { security::safe_web_url(&website, None)?; }
    let n = database(&app)?.execute("UPDATE projects SET name=?1,description=?2,status=?3,group_name=?4,preferred_editor=?5,technology_tags=?6,website_url=?7,updated_at=CURRENT_TIMESTAMP WHERE id=?8",
        params![name, clean(&update.description, 2000, "Description", true)?, update.status, clean(&update.group_name, 80, "Group", false)?, update.preferred_editor, clean(&update.technology_tags, 200, "Tags", false)?, website, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Project no longer exists".into()); } Ok(())
}

#[tauri::command]
pub fn set_project_flag(app: tauri::AppHandle, id: i64, flag: String, value: bool) -> Result<(), String> {
    let column = match flag.as_str() { "favorite" => "is_favorite", "archived" => "is_archived", _ => return Err("Unknown flag".into()) };
    let n = database(&app)?.execute(&format!("UPDATE projects SET {column}=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2"), params![value, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Project no longer exists".into()); } Ok(())
}

#[derive(Serialize)]
pub struct SessionRecord { id: i64, project_id: i64, summary: String, unfinished: String, problems: String, next_action: String, started_at: Option<String>, ended_at: Option<String>, duration_seconds: i64, is_active: bool, created_at: String }

#[tauri::command]
pub fn project_sessions(app: tauri::AppHandle, project_id: i64) -> Result<Vec<SessionRecord>, String> {
    let db = database(&app)?;
    let mut stmt = db.prepare("SELECT id,project_id,summary,unfinished,problems,next_action,started_at,ended_at,duration_seconds,is_active,created_at FROM sessions WHERE project_id=?1 ORDER BY id DESC LIMIT 100").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([project_id], |r| Ok(SessionRecord { id: r.get(0)?, project_id: r.get(1)?, summary: r.get(2)?, unfinished: r.get(3)?, problems: r.get(4)?, next_action: r.get(5)?, started_at: r.get(6)?, ended_at: r.get(7)?, duration_seconds: r.get(8)?, is_active: r.get(9)?, created_at: r.get(10)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Starting a session only records the project and the start time; nothing is monitored.
#[tauri::command]
pub fn start_project_session(app: tauri::AppHandle, project_id: i64) -> Result<i64, String> {
    let db = database(&app)?;
    let exists: i64 = db.query_row("SELECT count(*) FROM projects WHERE id=?1", [project_id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if exists == 0 { return Err("Project no longer exists".into()); }
    let active: i64 = db.query_row("SELECT count(*) FROM sessions WHERE project_id=?1 AND is_active=1", [project_id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if active > 0 { return Err("A session is already active for this project".into()); }
    db.execute("INSERT INTO sessions(project_id,summary,started_at,is_active) VALUES(?1,'',CURRENT_TIMESTAMP,1)", [project_id]).map_err(|e| e.to_string())?;
    let id = db.last_insert_rowid();
    database::record_activity(&db, "session_started", "session", Some(id), Some(project_id), "Working session started");
    Ok(id)
}

#[tauri::command]
pub fn end_project_session(app: tauri::AppHandle, id: i64, completed: String, unfinished: String, problems: String, next_action: String) -> Result<(), String> {
    let completed = clean(&completed, 4000, "Completed work", true)?;
    let summary = if completed.is_empty() { "Session ended".to_string() } else { completed };
    let db = database(&app)?;
    let project_id: i64 = db.query_row("SELECT project_id FROM sessions WHERE id=?1 AND is_active=1", [id], |r| r.get(0)).map_err(|_| "There is no active session to end".to_string())?;
    db.execute("UPDATE sessions SET summary=?1,unfinished=?2,problems=?3,next_action=?4,ended_at=CURRENT_TIMESTAMP,is_active=0,duration_seconds=MAX(0,COALESCE(CAST(strftime('%s','now')-strftime('%s',started_at) AS INTEGER),0)) WHERE id=?5",
        params![summary, clean(&unfinished, 4000, "Unfinished work", true)?, clean(&problems, 4000, "Problems", true)?, clean(&next_action, 1000, "Next action", true)?, id]).map_err(|e| e.to_string())?;
    database::record_activity(&db, "session_ended", "session", Some(id), Some(project_id), "Working session ended");
    Ok(())
}

#[derive(Serialize)]
pub struct ContinueInfo { session_id: i64, project_id: i64, project_name: String, summary: String, next_action: String, started_at: Option<String>, ended_at: Option<String>, is_active: bool }

/// The newest active (or, failing that, finished) session of a non-archived project, for "Continue where you left off".
#[tauri::command]
pub fn continue_info(app: tauri::AppHandle) -> Result<Option<ContinueInfo>, String> {
    database(&app)?.query_row("SELECT s.id,s.project_id,p.name,s.summary,s.next_action,s.started_at,s.ended_at,s.is_active FROM sessions s JOIN projects p ON p.id=s.project_id WHERE p.is_archived=0 ORDER BY s.is_active DESC, s.id DESC LIMIT 1", [],
        |r| Ok(ContinueInfo { session_id: r.get(0)?, project_id: r.get(1)?, project_name: r.get(2)?, summary: r.get(3)?, next_action: r.get(4)?, started_at: r.get(5)?, ended_at: r.get(6)?, is_active: r.get(7)? })).optional().map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct ActivityRecord { id: i64, action_type: String, summary: String, occurred_at: String }

#[tauri::command]
pub fn project_activity(app: tauri::AppHandle, project_id: i64) -> Result<Vec<ActivityRecord>, String> {
    let db = database(&app)?;
    let mut stmt = db.prepare("SELECT id,action_type,summary,occurred_at FROM activity_log WHERE project_id=?1 ORDER BY id DESC LIMIT 100").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([project_id], |r| Ok(ActivityRecord { id: r.get(0)?, action_type: r.get(1)?, summary: r.get(2)?, occurred_at: r.get(3)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Tools are .exe files; Claude Code and Codex are often installed as npm .cmd launchers, which are also accepted for them.
fn validate_tool_path(slug: &str, path: &Path) -> Result<PathBuf, String> {
    let batch = path.extension().map(|e| e.eq_ignore_ascii_case("cmd")).unwrap_or(false);
    if batch && (slug == "claude" || slug == "codex") {
        if !path.is_absolute() { return Err("Select an absolute path".into()); }
        let resolved = path.canonicalize().map_err(|e| format!("Executable is unavailable: {e}"))?;
        return if resolved.is_file() { Ok(resolved) } else { Err("Executable must be a file".into()) };
    }
    security::validate_executable(path)
}

fn tool_name(slug: &str) -> &'static str { TOOLS.iter().find(|(s, _)| *s == slug).map(|(_, n)| *n).unwrap_or("Tool") }

fn configured_path(db: &Connection, slug: &str) -> Result<Option<String>, String> {
    db.query_row("SELECT executable_path FROM tool_configurations WHERE slug=?1 AND is_enabled=1 AND executable_path<>''", [slug], |r| r.get(0)).optional().map_err(|e| e.to_string())
}

/// Order: executable the user selected, then (VS Code only) the editor chosen in Settings, then standard install folders.
fn tool_executable(db: &Connection, slug: &str) -> Result<PathBuf, String> {
    if let Some(path) = configured_path(db, slug)? { return validate_tool_path(slug, Path::new(&path)); }
    if slug == "vscode" {
        let editor: Option<String> = db.query_row("SELECT value FROM settings WHERE key='editor_path'", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        if let Some(path) = editor { return security::validate_executable(Path::new(&path)); }
    }
    platform::detect_standard_tool_path(slug).ok_or_else(|| format!("{} was not found. Select its executable in Settings, under Developer tools.", tool_name(slug)))
}

#[derive(Serialize)]
pub struct ToolInfo { slug: String, name: String, configured: Option<String>, detected: Option<String> }

#[tauri::command]
pub fn list_tools(app: tauri::AppHandle) -> Result<Vec<ToolInfo>, String> {
    let db = database(&app)?;
    TOOLS.iter().map(|(slug, name)| Ok(ToolInfo { slug: slug.to_string(), name: name.to_string(), configured: configured_path(&db, slug)?, detected: platform::detect_standard_tool_path(slug).map(|p| p.to_string_lossy().into_owned()) })).collect()
}

/// Saves (or, with an empty path, clears) the executable used for a tool. The caller must confirm the path with the user first.
#[tauri::command]
pub fn set_tool_path(app: tauri::AppHandle, slug: String, path: Option<String>) -> Result<(), String> {
    if !TOOLS.iter().any(|(s, _)| *s == slug) { return Err("Unknown tool".into()); }
    let db = database(&app)?;
    match path.filter(|p| !p.trim().is_empty()) {
        None => { db.execute("DELETE FROM tool_configurations WHERE slug=?1", [&slug]).map_err(|e| e.to_string())?; }
        Some(path) => {
            let resolved = validate_tool_path(&slug, Path::new(&path))?;
            db.execute("INSERT INTO tool_configurations(slug,name,tool_type,executable_path,updated_at) VALUES(?1,?2,?3,?4,CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET executable_path=excluded.executable_path,is_enabled=1,updated_at=CURRENT_TIMESTAMP",
                params![slug, tool_name(&slug), if slug == "terminal" { "terminal" } else { "editor" }, resolved.to_string_lossy().as_ref()]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Opens the project in a developer tool. Editors receive the folder as one argument; Claude Code and Codex start in their own
/// console with the project as working directory; the terminal opens in the project. No shell string is ever built.
#[tauri::command]
pub fn launch_project_tool(app: tauri::AppHandle, project_id: i64, tool: String) -> Result<(), String> {
    if !TOOLS.iter().any(|(s, _)| *s == tool) { return Err("Unsupported tool".into()); }
    let db = database(&app)?;
    let path: String = db.query_row("SELECT path FROM projects WHERE id=?1", [project_id], |r| r.get(0)).map_err(|_| "Project is unavailable".to_string())?;
    let project = plain_path(&Path::new(&path).canonicalize().map_err(|e| format!("Project is unavailable: {e}"))?);
    if !project.is_dir() { return Err("Project path is not a directory".into()); }
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        const NEW_CONSOLE: u32 = 0x0000_0010;
        let executable = tool_executable(&db, &tool)?;
        let is_batch = executable.extension().map(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat")).unwrap_or(false);
        let mut command = if is_batch { let mut shell = std::process::Command::new(platform::cmd_exe()?); shell.arg("/k").arg(&executable); shell } else { std::process::Command::new(&executable) };
        match tool.as_str() {
            "vscode" | "antigravity" => { command.arg(&project); }
            "claude" | "codex" => { command.creation_flags(NEW_CONSOLE); }
            _ => {
                let is_windows_terminal = executable.file_name().map(|n| n.to_string_lossy().eq_ignore_ascii_case("wt.exe")).unwrap_or(false);
                if is_windows_terminal { command.arg("-d").arg(&project); } else { command.creation_flags(NEW_CONSOLE); }
            }
        }
        command.current_dir(&project).spawn().map_err(|e| format!("Could not start {}: {e}", tool_name(&tool)))?;
        db.execute("UPDATE projects SET last_opened_at=CURRENT_TIMESTAMP WHERE id=?1", [project_id]).map_err(|e| e.to_string())?;
        database::record_activity(&db, "tool_launched", "project", Some(project_id), Some(project_id), &format!("Opened in {}", tool_name(&tool)));
        Ok(())
    }
    #[cfg(not(windows))] { let _ = (db, project); Err("Launching tools is only supported on Windows".into()) }
}

/// Adds or removes the link between a server entry and a project (a server can belong to several projects).
#[tauri::command]
pub fn link_connection_project(app: tauri::AppHandle, id: i64, project_id: i64, linked: bool) -> Result<(), String> {
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let exists: i64 = tx.query_row("SELECT count(*) FROM connections WHERE id=?1", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if exists == 0 { return Err("Connection no longer exists".into()); }
    if linked { tx.execute("INSERT OR IGNORE INTO connection_projects(connection_id,project_id) VALUES(?1,?2)", params![id, project_id]).map_err(|e| e.to_string())?; }
    else { tx.execute("DELETE FROM connection_projects WHERE connection_id=?1 AND project_id=?2", params![id, project_id]).map_err(|e| e.to_string())?; }
    tx.execute("UPDATE connections SET project_id=(SELECT min(project_id) FROM connection_projects WHERE connection_id=?1),updated_at=CURRENT_TIMESTAMP WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// Links a vault entry (metadata only) to a project; secrets are never read or moved.
#[tauri::command]
pub fn link_vault_project(app: tauri::AppHandle, id: i64, project_id: Option<i64>) -> Result<(), String> {
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let n = tx.execute("INSERT OR IGNORE INTO vault_entry_details(entry_id) SELECT id FROM vault_entries WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    let exists: i64 = tx.query_row("SELECT count(*) FROM vault_entries WHERE id=?1", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if exists == 0 { return Err("Vault entry is unavailable".into()); }
    let _ = n;
    tx.execute("UPDATE vault_entry_details SET project_id=?1,updated_at=CURRENT_TIMESTAMP WHERE entry_id=?2", params![project_id, id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------------------------------
// Project folders (roots), discovery and import
// ---------------------------------------------------------------------------------------------------------------------
#[derive(Serialize)]
pub struct RootRecord { id: i64, path: String, label: String, exclusions: String, project_count: i64 }

#[tauri::command]
pub fn list_project_roots(app: tauri::AppHandle) -> Result<Vec<RootRecord>, String> {
    let db = database(&app)?;
    let mut stmt = db.prepare("SELECT r.id,r.path,r.label,r.exclusions,(SELECT count(*) FROM projects p WHERE p.project_root_id=r.id) FROM project_roots r ORDER BY r.path COLLATE NOCASE").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(RootRecord { id: r.get(0)?, path: r.get(1)?, label: r.get(2)?, exclusions: r.get(3)?, project_count: r.get(4)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn clean_exclusions(text: &str) -> Result<String, String> {
    let names: Vec<String> = text.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect();
    if names.len() > 50 || names.iter().any(|n| n.len() > 80 || n.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) || n.chars().any(|c| c.is_control())) { return Err("Exclusions are folder names separated by commas (no paths or wildcards)".into()); }
    Ok(names.join(", "))
}

/// Remembers a folder that contains many projects. The folder is never changed.
#[tauri::command]
pub fn add_project_root(app: tauri::AppHandle, path: String, label: String) -> Result<i64, String> {
    let canonical = Path::new(&path).canonicalize().map_err(|_| "The folder does not exist".to_string())?;
    if !canonical.is_dir() { return Err("The selected path is not a folder".into()); }
    let label = clean(&label, 80, "Label", false)?;
    let db = database(&app)?;
    db.execute("INSERT INTO project_roots(path,label) VALUES(?1,?2)", params![canonical.to_string_lossy().as_ref(), label]).map_err(|_| "This folder is already in the list".to_string())?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn update_project_root(app: tauri::AppHandle, id: i64, label: String, exclusions: String) -> Result<(), String> {
    let n = database(&app)?.execute("UPDATE project_roots SET label=?1,exclusions=?2 WHERE id=?3", params![clean(&label, 80, "Label", false)?, clean_exclusions(&exclusions)?, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Folder no longer exists".into()); } Ok(())
}

/// Forgets the folder. Imported projects stay and nothing on disk is touched.
#[tauri::command]
pub fn remove_project_root(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    database(&app)?.execute("DELETE FROM project_roots WHERE id=?1", [id]).map_err(|e| e.to_string())?; Ok(())
}

#[derive(Serialize)]
pub struct Candidate { root_id: i64, path: String, name: String, tags: Vec<String>, has_git: bool, known: bool }
#[derive(Serialize)]
pub struct RootScan { candidates: Vec<Candidate>, warnings: Vec<String>, ignored: i64 }

fn scan_one_root(db: &Connection, id: i64, nested: bool) -> Result<(Vec<Candidate>, Vec<String>, i64), String> {
    let (path, exclusions): (String, String) = db.query_row("SELECT path,exclusions FROM project_roots WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|_| "Folder no longer exists".to_string())?;
    let extra: Vec<String> = exclusions.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect();
    crate::scanner::reset_cancel_scan();
    let (_, report) = crate::scanner::scan_with_options(Path::new(&path), &extra, nested)?;
    let mut known = std::collections::HashSet::new();
    { let mut stmt = db.prepare("SELECT path FROM projects").map_err(|e| e.to_string())?; for row in stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())? { known.insert(row.map_err(|e| e.to_string())?); } }
    let mut ignored_paths = std::collections::HashSet::new();
    { let mut stmt = db.prepare("SELECT path FROM ignored_projects").map_err(|e| e.to_string())?; for row in stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())? { ignored_paths.insert(row.map_err(|e| e.to_string())?); } }
    let mut ignored = 0;
    let mut candidates = Vec::new();
    for found in report.projects {
        if ignored_paths.contains(&found.path) { ignored += 1; continue; }
        candidates.push(Candidate { root_id: id, known: known.contains(&found.path), path: found.path, name: found.name, tags: found.tags, has_git: found.has_git });
    }
    Ok((candidates, report.warnings, ignored))
}

/// Looks for projects in one saved folder (or in all of them) without importing anything.
#[tauri::command]
pub async fn scan_project_root(app: tauri::AppHandle, id: Option<i64>, nested: bool) -> Result<RootScan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db = database(&app)?;
        let ids: Vec<i64> = match id { Some(id) => vec![id], None => { let mut stmt = db.prepare("SELECT id FROM project_roots ORDER BY path").map_err(|e| e.to_string())?; let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?; rows.collect::<Result<Vec<i64>, _>>().map_err(|e| e.to_string())? } };
        let mut scan = RootScan { candidates: Vec::new(), warnings: Vec::new(), ignored: 0 };
        for root in ids { let (found, warnings, ignored) = scan_one_root(&db, root, nested)?; scan.candidates.extend(found); scan.warnings.extend(warnings); scan.ignored += ignored; }
        scan.candidates.sort_by(|a, b| a.path.cmp(&b.path));
        scan.candidates.dedup_by(|a, b| a.path == b.path);
        Ok(scan)
    }).await.map_err(|e| e.to_string())?
}

/// Imports the chosen paths from a folder. The folder is scanned again so only real, current project folders are accepted.
#[tauri::command]
pub async fn import_root_projects(app: tauri::AppHandle, root_id: i64, paths: Vec<String>, nested: bool) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut db = database(&app)?;
        let (candidates, _, _) = scan_one_root(&db, root_id, nested)?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let mut added = 0;
        for path in &paths {
            let candidate = candidates.iter().find(|c| &c.path == path).ok_or("A selected folder is no longer a discovered project")?;
            added += tx.execute("INSERT OR IGNORE INTO projects(path,name,technology_tags,project_root_id,created_at,updated_at) VALUES(?1,?2,?3,?4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", params![candidate.path, candidate.name, candidate.tags.join(", "), root_id]).map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM ignored_projects WHERE path=?1", [&candidate.path]).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        refresh_git(&db, None, true)?;
        Ok(added)
    }).await.map_err(|e| e.to_string())?
}

/// Removes the project block from the dashboard only; its folder and files stay untouched. Rescans will not offer it again until the ignore list is cleared.
#[tauri::command]
pub fn delete_project(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let path: String = tx.query_row("SELECT path FROM projects WHERE id=?1", [id], |r| r.get(0)).map_err(|_| "Project no longer exists".to_string())?;
    tx.execute("INSERT OR IGNORE INTO ignored_projects(path) VALUES(?1)", [&path]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM projects WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ignored_project_count(app: tauri::AppHandle) -> Result<i64, String> {
    database(&app)?.query_row("SELECT count(*) FROM ignored_projects", [], |r| r.get(0)).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn clear_ignored_projects(app: tauri::AppHandle) -> Result<(), String> {
    database(&app)?.execute("DELETE FROM ignored_projects", []).map_err(|e| e.to_string())?; Ok(())
}

// ---------------------------------------------------------------------------------------------------------------------
// Git facts
// ---------------------------------------------------------------------------------------------------------------------
fn refresh_git(db: &Connection, project_id: Option<i64>, force: bool) -> Result<usize, String> {
    let rows: Vec<(i64, String)> = {
        let mut stmt = db.prepare("SELECT id,path FROM projects WHERE (?1 IS NULL OR id=?1) AND (?2=1 OR git_checked_at IS NULL OR git_checked_at < datetime('now','-600 seconds'))").map_err(|e| e.to_string())?;
        let found = stmt.query_map(params![project_id, force], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
        found.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    for (id, path) in &rows {
        let info = crate::git::read_git_info(&plain_path(Path::new(path)));
        db.execute("UPDATE projects SET git_state=?1,last_commit_at=?2,last_commit_hash=?3,last_commit_subject=?4,git_branch=?5,git_dirty=?6,git_remote=?7,git_checked_at=CURRENT_TIMESTAMP WHERE id=?8",
            params![info.state, info.last_commit_at, info.last_commit_hash, info.last_commit_subject, info.branch, info.dirty, info.remote, id]).map_err(|e| e.to_string())?;
    }
    Ok(rows.len())
}

/// Reads branch, last commit and uncommitted changes (read only). Recently checked projects are skipped unless `force` is set.
#[tauri::command]
pub async fn refresh_git_info(app: tauri::AppHandle, project_id: Option<i64>, force: bool) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || refresh_git(&database(&app)?, project_id, force)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_recent_commits(app: tauri::AppHandle, project_id: i64, count: usize) -> Result<Vec<crate::git::CommitSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path: String = database(&app)?.query_row("SELECT path FROM projects WHERE id=?1", [project_id], |r| r.get(0)).map_err(|_| "Project is unavailable".to_string())?;
        crate::git::recent_commits(&plain_path(Path::new(&path)), count)
    }).await.map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------------------------------------------------
// Workspaces: VS Code plus the chosen AI tool, and saved workspace profiles
// ---------------------------------------------------------------------------------------------------------------------
const HARNESSES: [&str; 3] = ["claude", "codex", "antigravity"];

#[derive(Serialize, Default)]
pub struct WorkspaceResult { launched: Vec<String>, failed: Vec<String>, show_notes: bool, show_tasks: bool }

fn launch_each(app: &tauri::AppHandle, project_id: i64, tools: &[&str], result: &mut WorkspaceResult) {
    for tool in tools {
        match launch_project_tool(app.clone(), project_id, tool.to_string()) {
            Ok(()) => result.launched.push(tool_name(tool).to_string()),
            Err(e) => result.failed.push(format!("{}: {e}", tool_name(tool))),
        }
    }
}

#[tauri::command]
pub fn set_project_harness(app: tauri::AppHandle, id: i64, harness: String) -> Result<(), String> {
    if !HARNESSES.contains(&harness.as_str()) { return Err("Choose Claude Code, Codex or Antigravity".into()); }
    let n = database(&app)?.execute("UPDATE projects SET ai_harness=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2", params![harness, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Project no longer exists".into()); } Ok(())
}

/// Opens the project folder in VS Code and in the chosen AI tool at the same time, and remembers the choice for next time.
#[tauri::command]
pub fn launch_workspace(app: tauri::AppHandle, project_id: i64, harness: String) -> Result<WorkspaceResult, String> {
    if !HARNESSES.contains(&harness.as_str()) { return Err("Choose Claude Code, Codex or Antigravity".into()); }
    let n = database(&app)?.execute("UPDATE projects SET ai_harness=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2", params![harness, project_id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Project no longer exists".into()); }
    let mut result = WorkspaceResult::default();
    launch_each(&app, project_id, &["vscode", harness.as_str()], &mut result);
    Ok(result)
}

#[derive(Serialize, Deserialize)]
pub struct Profile { id: Option<i64>, project_id: i64, name: String, open_folder: bool, launch_editor: bool, #[serde(default)] ai_harness: String, launch_terminal: bool, doc_url: String, show_notes: bool, show_tasks: bool }

fn validate_profile(p: &Profile) -> Result<(), String> {
    if clean(&p.name, 60, "Name", false)?.is_empty() { return Err("Name is required".into()); }
    if !p.ai_harness.is_empty() && !HARNESSES.contains(&p.ai_harness.as_str()) { return Err("Unknown AI tool".into()); }
    let url = clean(&p.doc_url, 500, "Documentation link", false)?;
    if !url.is_empty() { security::safe_web_url(&url, None)?; }
    Ok(())
}

#[tauri::command]
pub fn list_workspace_profiles(app: tauri::AppHandle, project_id: i64) -> Result<Vec<Profile>, String> {
    let db = database(&app)?;
    let mut stmt = db.prepare("SELECT id,project_id,name,open_folder,launch_editor,ai_harness,launch_terminal,doc_url,show_notes,show_tasks FROM project_workspace_profiles WHERE project_id=?1 ORDER BY id").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([project_id], |r| Ok(Profile { id: r.get(0)?, project_id: r.get(1)?, name: r.get(2)?, open_folder: r.get(3)?, launch_editor: r.get(4)?, ai_harness: r.get(5)?, launch_terminal: r.get(6)?, doc_url: r.get(7)?, show_notes: r.get(8)?, show_tasks: r.get(9)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_workspace_profile(app: tauri::AppHandle, profile: Profile) -> Result<(), String> {
    validate_profile(&profile)?;
    let db = database(&app)?;
    let name = profile.name.trim();
    if let Some(id) = profile.id {
        let n = db.execute("UPDATE project_workspace_profiles SET name=?1,open_folder=?2,launch_editor=?3,ai_harness=?4,launch_terminal=?5,doc_url=?6,show_notes=?7,show_tasks=?8 WHERE id=?9 AND project_id=?10",
            params![name, profile.open_folder, profile.launch_editor, profile.ai_harness, profile.launch_terminal, profile.doc_url.trim(), profile.show_notes, profile.show_tasks, id, profile.project_id]).map_err(|e| e.to_string())?;
        if n == 0 { return Err("Profile no longer exists".into()); }
    } else {
        db.execute("INSERT INTO project_workspace_profiles(project_id,name,open_folder,launch_editor,ai_harness,launch_terminal,doc_url,show_notes,show_tasks) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![profile.project_id, name, profile.open_folder, profile.launch_editor, profile.ai_harness, profile.launch_terminal, profile.doc_url.trim(), profile.show_notes, profile.show_tasks]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_workspace_profile(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    database(&app)?.execute("DELETE FROM project_workspace_profiles WHERE id=?1", [id]).map_err(|e| e.to_string())?; Ok(())
}

/// Runs only the actions saved in the profile. It never runs commands, builds or deployments.
#[tauri::command]
pub fn run_workspace_profile(app: tauri::AppHandle, id: i64) -> Result<WorkspaceResult, String> {
    let db = database(&app)?;
    let profile: Profile = db.query_row("SELECT id,project_id,name,open_folder,launch_editor,ai_harness,launch_terminal,doc_url,show_notes,show_tasks FROM project_workspace_profiles WHERE id=?1", [id],
        |r| Ok(Profile { id: r.get(0)?, project_id: r.get(1)?, name: r.get(2)?, open_folder: r.get(3)?, launch_editor: r.get(4)?, ai_harness: r.get(5)?, launch_terminal: r.get(6)?, doc_url: r.get(7)?, show_notes: r.get(8)?, show_tasks: r.get(9)? })).map_err(|_| "Profile no longer exists".to_string())?;
    validate_profile(&profile)?;
    let mut result = WorkspaceResult { show_notes: profile.show_notes, show_tasks: profile.show_tasks, ..Default::default() };
    if profile.open_folder {
        match crate::open_project_folder(app.clone(), profile.project_id) { Ok(()) => result.launched.push("Folder".into()), Err(e) => result.failed.push(format!("Folder: {e}")) }
    }
    let mut tools: Vec<&str> = Vec::new();
    if profile.launch_editor { tools.push("vscode"); }
    if !profile.ai_harness.is_empty() { tools.push(profile.ai_harness.as_str()); }
    if profile.launch_terminal { tools.push("terminal"); }
    launch_each(&app, profile.project_id, &tools, &mut result);
    if !profile.doc_url.trim().is_empty() {
        match crate::launch_web_url(&security::safe_web_url(profile.doc_url.trim(), None)?) { Ok(()) => result.launched.push("Documentation".into()), Err(e) => result.failed.push(format!("Documentation: {e}")) }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exclusions_are_plain_folder_names() {
        assert_eq!(clean_exclusions(" dist , ,coverage ").unwrap(), "dist, coverage");
        assert!(clean_exclusions("a\\b").is_err());
        assert!(clean_exclusions("*.log").is_err());
    }
    #[test]
    fn profiles_validate_tools_and_links() {
        let mut p = Profile { id: None, project_id: 1, name: "Dev".into(), open_folder: true, launch_editor: true, ai_harness: "claude".into(), launch_terminal: false, doc_url: String::new(), show_notes: false, show_tasks: false };
        assert!(validate_profile(&p).is_ok());
        p.ai_harness = "other".into(); assert!(validate_profile(&p).is_err());
        p.ai_harness = String::new(); p.doc_url = "javascript:alert(1)".into(); assert!(validate_profile(&p).is_err());
        p.doc_url = "https://example.test/docs".into(); assert!(validate_profile(&p).is_ok());
        p.name = " ".into(); assert!(validate_profile(&p).is_err());
    }
    #[test]
    fn windows_verbatim_prefixes_are_removed_for_drive_paths_only() {
        assert_eq!(plain_path(Path::new(r"\\?\C:\work\app")), PathBuf::from(r"C:\work\app"));
        assert_eq!(plain_path(Path::new(r"\\?\UNC\server\share")), PathBuf::from(r"\\?\UNC\server\share"));
    }
}
