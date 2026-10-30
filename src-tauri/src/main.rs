#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
mod scanner;
mod jobs;
mod database;
mod security;
mod platform;
mod projects;
mod settings;
mod git;
mod scheduler;
use security::{validate_executable,safe_web_url,rdp_destination};

#[derive(Serialize)]
struct Item { id: i64, kind: String, title: String, body: String, done: bool, category: String, tags: String, project_id: Option<i64>, deleted: bool, priority: String, due_date: Option<String>, is_goal: bool, is_pinned: bool, status: String, is_favorite: bool, is_archived: bool, updated_at: String, subtasks_json: String }
fn database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db = Connection::open(dir.join("dashboard.sqlite3")).map_err(|e| e.to_string())?;
    migrate(&db)?;
    Ok(db)
}
use database::{migrate,write_backup};
#[tauri::command]
fn list_items(app: tauri::AppHandle) -> Result<Vec<Item>, String> {
    let db = database(&app)?;
    let mut stmt = db.prepare("SELECT id,kind,title,body,done,category,tags,project_id,deleted,priority,due_date,is_goal,is_pinned,status,is_favorite,is_archived,updated_at,subtasks_json FROM items ORDER BY id DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Item { id:r.get(0)?, kind:r.get(1)?, title:r.get(2)?, body:r.get(3)?, done:r.get(4)?, category:r.get(5)?, tags:r.get(6)?, project_id:r.get(7)?, deleted:r.get(8)?, priority:r.get(9)?, due_date:r.get(10)?, is_goal:r.get(11)?, is_pinned:r.get(12)?, status:r.get(13)?, is_favorite:r.get(14)?, is_archived:r.get(15)?, updated_at:r.get(16)?, subtasks_json:r.get(17)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}
#[tauri::command]
fn toggle_task(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let count = tx.execute("UPDATE items SET done=1-done, status=CASE WHEN done=0 THEN 'done' ELSE 'todo' END, completed_at=CASE WHEN done=0 THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND kind='task' AND deleted=0", [id]).map_err(|e| e.to_string())?;
    if count == 0 { return Err("Task no longer exists".into()); }
    tx.execute("INSERT INTO task_events(task_id,kind) SELECT id,'completed' FROM items WHERE id=?1 AND done=1", [id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_task_due_date(app: tauri::AppHandle, id: i64, due_date: Option<String>) -> Result<(), String> {
    let db = database(&app)?;
    if let Some(ref date) = due_date {
        if !valid_due_date(&db, date)? { return Err("Invalid due date".into()); }
    }
    let n = db.execute("UPDATE items SET due_date=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2 AND kind='task' AND deleted=0", rusqlite::params![due_date, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Task no longer exists".into()); }
    Ok(())
}

#[tauri::command]
fn delete_item(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    database(&app)?.execute("UPDATE items SET deleted=1 WHERE id=?1", [id]).map_err(|e| e.to_string())?; Ok(())
}
#[tauri::command]
fn restore_item(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    database(&app)?.execute("UPDATE items SET deleted=0 WHERE id=?1", [id]).map_err(|e| e.to_string())?; Ok(())
}
fn purge_trashed(db: &Connection, id:i64) -> Result<(),String> {
    let n=db.execute("DELETE FROM items WHERE id=?1 AND deleted=1",[id]).map_err(|e|e.to_string())?;
    if n==0 { return Err("Item is not in the trash".into()); } Ok(())
}
#[tauri::command]
fn purge_item(app:tauri::AppHandle,id:i64) -> Result<(),String> { purge_trashed(&database(&app)?,id) }
fn valid_due_date(db: &Connection, date: &str) -> Result<bool, String> {
    let valid: Option<bool> = db.query_row("SELECT length(?1)=10 AND ?1 GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(?1,'+0 days')=?1", [date], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(valid.unwrap_or(false))
}
#[tauri::command]
fn save_item(app: tauri::AppHandle, id: Option<i64>, kind: String, title: String, body: String, category: String, tags: String, project_id: Option<i64>, priority: String, due_date: Option<String>) -> Result<i64, String> {
    if !["task", "note"].contains(&kind.as_str()) || title.trim().is_empty() { return Err("Invalid item".into()); }
    if !["low","normal","high"].contains(&priority.as_str()) { return Err("Invalid priority".into()); }
    if let Some(ref date) = due_date {
        let db = database(&app)?;
        if !valid_due_date(&db, date)? { return Err("Invalid due date".into()); }
    }
    let mut db = database(&app)?;
    if let Some(id) = id {
        let count = db.execute("UPDATE items SET title=?1,body=?2,category=?3,tags=?4,project_id=?5,priority=?6,due_date=?7,updated_at=CURRENT_TIMESTAMP WHERE id=?8 AND kind=?9 AND deleted=0", params![title.trim(),body,category.trim(),tags.trim(),project_id,priority,due_date,id,kind]).map_err(|e| e.to_string())?;
        if count == 0 { return Err("Item no longer exists".into()); }
        Ok(id)
    } else {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO items(kind,title,body,category,tags,project_id,priority,due_date,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,CURRENT_TIMESTAMP)", params![kind,title.trim(),body,category.trim(),tags.trim(),project_id,priority,due_date]).map_err(|e| e.to_string())?;
        let new_id = tx.last_insert_rowid();
        if kind == "task" { tx.execute("INSERT INTO task_events(task_id,kind) VALUES(?1,'created')", [tx.last_insert_rowid()]).map_err(|e| e.to_string())?; }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(new_id)
    }
}
#[tauri::command]
fn set_item_flag(app: tauri::AppHandle, id: i64, flag: String, value: bool) -> Result<(), String> {
    let column = match flag.as_str() { "pinned" => "is_pinned", "favorite" => "is_favorite", "archived" => "is_archived", _ => return Err("Unknown flag".into()) };
    let n = database(&app)?.execute(&format!("UPDATE items SET {column}=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2 AND deleted=0"), params![value, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Item no longer exists".into()); } Ok(())
}
#[tauri::command]
fn duplicate_item(app: tauri::AppHandle, id: i64) -> Result<i64, String> {
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let n = tx.execute("INSERT INTO items(kind,title,body,category,tags,project_id,priority,due_date,updated_at) SELECT kind,'Copy of '||title,body,category,tags,project_id,priority,due_date,CURRENT_TIMESTAMP FROM items WHERE id=?1 AND deleted=0", [id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Item no longer exists".into()); }
    let new_id = tx.last_insert_rowid();
    tx.execute("INSERT INTO task_events(task_id,kind) SELECT id,'created' FROM items WHERE id=?1 AND kind='task'", [new_id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?; Ok(new_id)
}
/// Creates a task from a note; the note is kept.
#[tauri::command]
fn convert_note_to_task(app: tauri::AppHandle, id: i64) -> Result<i64, String> {
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let n = tx.execute("INSERT INTO items(kind,title,body,category,tags,project_id,updated_at) SELECT 'task',title,body,category,tags,project_id,CURRENT_TIMESTAMP FROM items WHERE id=?1 AND kind='note' AND deleted=0", [id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Note no longer exists".into()); }
    let new_id = tx.last_insert_rowid();
    tx.execute("INSERT INTO task_events(task_id,kind) VALUES(?1,'created')", [new_id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?; Ok(new_id)
}
#[tauri::command]
fn set_task_status(app: tauri::AppHandle, id: i64, status: String) -> Result<(), String> {
    if !["inbox", "todo", "in_progress", "blocked", "done"].contains(&status.as_str()) { return Err("Invalid status".into()); }
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let was_done: bool = tx.query_row("SELECT done FROM items WHERE id=?1 AND kind='task' AND deleted=0", [id], |r| r.get(0)).map_err(|_| "Task no longer exists".to_string())?;
    let now_done = status == "done";
    tx.execute("UPDATE items SET status=?1,done=?2,completed_at=CASE WHEN ?2=1 THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?3", params![status, now_done, id]).map_err(|e| e.to_string())?;
    if now_done && !was_done { tx.execute("INSERT INTO task_events(task_id,kind) VALUES(?1,'completed')", [id]).map_err(|e| e.to_string())?; }
    tx.commit().map_err(|e| e.to_string())
}
#[derive(Serialize, Deserialize)]
struct Subtask { title: String, done: bool }
#[tauri::command]
fn set_subtasks(app: tauri::AppHandle, id: i64, subtasks: Vec<Subtask>) -> Result<(), String> {
    if subtasks.len() > 50 || subtasks.iter().any(|x| x.title.trim().is_empty() || x.title.len() > 200) { return Err("Checklist items need a title of up to 200 characters; at most 50 items".into()); }
    let cleaned: Vec<Subtask> = subtasks.into_iter().map(|x| Subtask { title: x.title.trim().to_string(), done: x.done }).collect();
    let json = serde_json::to_string(&cleaned).map_err(|e| e.to_string())?;
    let n = database(&app)?.execute("UPDATE items SET subtasks_json=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2 AND kind='task' AND deleted=0", params![json, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Task no longer exists".into()); } Ok(())
}
#[derive(Serialize)]
struct Category { id: i64, name: String }
#[tauri::command]
fn list_categories(app: tauri::AppHandle) -> Result<Vec<Category>, String> {
    let db = database(&app)?;
    let mut stmt = db.prepare("SELECT id,name FROM note_categories ORDER BY name COLLATE NOCASE").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Category { id: r.get(0)?, name: r.get(1)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
fn clean_category_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 60 || name.chars().any(|c| c.is_control()) { return Err("Category names need 1-60 visible characters".into()); }
    Ok(name.to_string())
}
#[tauri::command]
fn create_category(app: tauri::AppHandle, name: String) -> Result<(), String> {
    database(&app)?.execute("INSERT INTO note_categories(name) VALUES(?1)", [clean_category_name(&name)?]).map_err(|_| "That category already exists".to_string())?; Ok(())
}
#[tauri::command]
fn rename_category(app: tauri::AppHandle, id: i64, name: String) -> Result<(), String> {
    let name = clean_category_name(&name)?;
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let old: String = tx.query_row("SELECT name FROM note_categories WHERE id=?1", [id], |r| r.get(0)).map_err(|_| "Category no longer exists".to_string())?;
    tx.execute("UPDATE note_categories SET name=?1 WHERE id=?2", params![name, id]).map_err(|_| "That category already exists".to_string())?;
    tx.execute("UPDATE items SET category=?1 WHERE category=?2 AND kind='note'", params![name, old]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}
/// Notes in the deleted category move back to the idea inbox (no category); no note is deleted.
#[tauri::command]
fn delete_category(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let old: String = tx.query_row("SELECT name FROM note_categories WHERE id=?1", [id], |r| r.get(0)).map_err(|_| "Category no longer exists".to_string())?;
    tx.execute("UPDATE items SET category='' WHERE category=?1 AND kind='note'", [&old]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM note_categories WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}
/// Opens a link from rendered Markdown in the default browser; only http(s) without embedded credentials.
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> { launch_web_url(&safe_web_url(&url, None)?) }
/// Goals are tasks flagged with is_goal so they share completion, trash and activity tracking.
#[tauri::command]
fn save_goal(app: tauri::AppHandle, title: String, due_date: Option<String>) -> Result<(), String> {
    if title.trim().is_empty() { return Err("Goal title is required".into()); }
    let mut db = database(&app)?;
    if let Some(ref date) = due_date { if !valid_due_date(&db, date)? { return Err("Invalid due date".into()); } }
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO items(kind,title,is_goal,due_date) VALUES('task',?1,1,?2)", params![title.trim(), due_date]).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO task_events(task_id,kind) VALUES(?1,'created')", [tx.last_insert_rowid()]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}
#[tauri::command]
fn toggle_pin(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let n = database(&app)?.execute("UPDATE items SET is_pinned=1-is_pinned WHERE id=?1 AND deleted=0", [id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Item no longer exists".into()); } Ok(())
}
const SETTING_KEYS: [&str; 2] = ["onboarding_done", "display_name"];
#[tauri::command]
fn get_setting(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    use rusqlite::OptionalExtension;
    if !SETTING_KEYS.contains(&key.as_str()) { return Err("Unknown setting".into()); }
    database(&app)?.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0)).optional().map_err(|e| e.to_string())
}
#[tauri::command]
fn set_setting(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    if !SETTING_KEYS.contains(&key.as_str()) || value.len() > 200 || value.chars().any(|c| c.is_control()) { return Err("Invalid setting".into()); }
    database(&app)?.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value.trim()]).map_err(|e| e.to_string())?; Ok(())
}
#[derive(Serialize)]
struct DetectedTool { slug: String, name: String, path: Option<String> }
/// Looks only in standard install folders; nothing is launched or read.
#[tauri::command]
fn detect_tools() -> Vec<DetectedTool> {
    [("vscode", "Visual Studio Code"), ("claude", "Claude Code"), ("codex", "Codex"), ("antigravity", "Antigravity"), ("terminal", "Windows Terminal"), ("git", "Git"), ("anydesk", "AnyDesk")]
        .iter().map(|(slug, name)| DetectedTool { slug: slug.to_string(), name: name.to_string(), path: platform::detect_standard_tool_path(slug).map(|p| p.to_string_lossy().into_owned()) }).collect()
}
#[derive(Serialize)]
struct ActivityDay { day:String, created:i64, completed:i64 }
#[tauri::command]
fn task_activity(app: tauri::AppHandle) -> Result<Vec<ActivityDay>, String> {
    let db = database(&app)?;
    activity_for_db(&db)
}
fn activity_for_db(db: &Connection) -> Result<Vec<ActivityDay>, String> {
    let mut stmt = db.prepare("WITH RECURSIVE days(day) AS (SELECT date('now','localtime','-6 days') UNION ALL SELECT date(day,'+1 day') FROM days WHERE day < date('now','localtime')) SELECT days.day, COALESCE(SUM(CASE WHEN e.kind='created' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN e.kind='completed' THEN 1 ELSE 0 END),0) FROM days LEFT JOIN task_events e ON date(e.occurred_at,'localtime')=days.day GROUP BY days.day ORDER BY days.day").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(ActivityDay{day:r.get(0)?,created:r.get(1)?,completed:r.get(2)?})).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}
#[derive(Serialize)]
struct Project { id: i64, path: String, name: String, last_opened_at: Option<String>, description: String, status: String, group_name: String, preferred_editor: String, technology_tags: String, is_favorite: bool, is_archived: bool, website_url: String, created_at: String, ai_harness: String, git_state: String, last_commit_at: Option<String>, last_commit_hash: String, last_commit_subject: String, git_branch: String, git_dirty: i64, git_remote: String, git_web_url: Option<String> }
fn d_manual() -> String { "manual".into() }
fn d_true() -> bool { true }
fn d_days() -> String { "1,2,3,4,5,6,7".into() }
fn d_weekly() -> String { "weekly".into() }
fn d_one() -> i64 { 1 }
fn d_category() -> String { "development".into() }
fn d_risk() -> String { "development".into() }
#[derive(Serialize,Deserialize,PartialEq,Clone)]
struct AutomationAction {kind:String,project_id:Option<i64>,title:String}
#[derive(Serialize,Deserialize,PartialEq)]
struct Automation {id:Option<i64>,name:String,description:String,actions:Vec<AutomationAction>,#[serde(default="d_manual")] trigger_type:String,#[serde(default)] shortcut:String,#[serde(default="d_true")] enabled:bool,#[serde(default)] schedule_time:String,#[serde(default="d_days")] schedule_days:String,#[serde(default="d_weekly")] schedule_kind:String,#[serde(default="d_one")] schedule_month_day:i64}
fn validate_automation(a:&Automation)->Result<(),String>{
    if a.name.trim().is_empty() || a.actions.is_empty() || a.actions.len()>20{return Err("A name and 1–20 actions are required".into())}
    match a.trigger_type.as_str(){
        "manual"=>{if !a.shortcut.trim().is_empty(){return Err("Manual automations do not use a shortcut".into())}}
        "shortcut"=>{settings::parse_shortcut(&a.shortcut)?;}
        "scheduled"=>{
            if !a.shortcut.trim().is_empty(){return Err("Scheduled automations do not use a shortcut".into())}
            if !scheduler::valid_time(a.schedule_time.trim()){return Err("Choose the time as HH:MM".into())}
            match a.schedule_kind.as_str(){
                "daily"=>{}
                "weekly"=>{if !scheduler::valid_days(&a.schedule_days){return Err("Choose at least one day of the week".into())}}
                "monthly"=>{if !scheduler::valid_month_day(a.schedule_month_day){return Err("Choose a day of the month from 1 to 31".into())}}
                _=>return Err("Invalid schedule".into()),
            }
        }
        _=>return Err("Invalid trigger".into()),
    }
    for step in &a.actions {
        let valid=match step.kind.as_str(){
            "open_project"|"show_notes"|"start_session"|"end_session"=>step.project_id.is_some(),
            "create_note"|"create_task"=>!step.title.trim().is_empty(),
            "open_url" if step.project_id.is_none()=>{safe_web_url(&step.title,None)?;true},
            "open_app"=>step.project_id.is_some()&&projects::is_tool(&step.title),
            "run_command"=>step.title.trim().parse::<i64>().is_ok(),
            _=>false,
        };
        if !valid{return Err("Invalid automation action".into())}
    }
    Ok(())
}
fn load_automations(db:&Connection)->Result<Vec<Automation>,String>{
    let mut stmt=db.prepare("SELECT id,name,description,trigger_type,shortcut,enabled,schedule_time,schedule_days,schedule_kind,schedule_month_day FROM automations ORDER BY name COLLATE NOCASE").map_err(|e|e.to_string())?;
    let rows=stmt.query_map([],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,bool>(5)?,r.get::<_,String>(6)?,r.get::<_,String>(7)?,r.get::<_,String>(8)?,r.get::<_,i64>(9)?))).map_err(|e|e.to_string())?;
    let mut result=Vec::new();
    for row in rows {
        let (id,name,description,trigger_type,shortcut,enabled,schedule_time,schedule_days,schedule_kind,schedule_month_day)=row.map_err(|e|e.to_string())?;
        let mut actions=db.prepare("SELECT kind,project_id,title FROM automation_actions WHERE automation_id=?1 ORDER BY position").map_err(|e|e.to_string())?;
        let items=actions.query_map([id],|r|Ok(AutomationAction{kind:r.get(0)?,project_id:r.get(1)?,title:r.get(2)?})).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        result.push(Automation{id:Some(id),name,description,actions:items,trigger_type,shortcut,enabled,schedule_time,schedule_days,schedule_kind,schedule_month_day});
    }
    Ok(result)
}
#[tauri::command]
fn list_automations(app:tauri::AppHandle)->Result<Vec<Automation>,String>{load_automations(&database(&app)?)}
#[tauri::command]
fn save_automation(app:tauri::AppHandle,item:Automation)->Result<(),String>{
    validate_automation(&item)?;let mut db=database(&app)?;let tx=db.transaction().map_err(|e|e.to_string())?;
    let shortcut=item.shortcut.trim().to_string();
    let id=if let Some(id)=item.id {
        let n=tx.execute("UPDATE automations SET name=?1,description=?2,trigger_type=?3,shortcut=?4,enabled=?5,schedule_time=?6,schedule_days=?7,schedule_kind=?8,schedule_month_day=?9 WHERE id=?10",params![item.name.trim(),item.description.trim(),item.trigger_type,shortcut,item.enabled,item.schedule_time.trim(),item.schedule_days,item.schedule_kind,item.schedule_month_day,id]).map_err(|e|e.to_string())?;
        if n==0{return Err("Automation no longer exists".into())}
        tx.execute("DELETE FROM automation_actions WHERE automation_id=?1",[id]).map_err(|e|e.to_string())?;id
    } else {
        tx.execute("INSERT INTO automations(name,description,trigger_type,shortcut,enabled,schedule_time,schedule_days,schedule_kind,schedule_month_day) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![item.name.trim(),item.description.trim(),item.trigger_type,shortcut,item.enabled,item.schedule_time.trim(),item.schedule_days,item.schedule_kind,item.schedule_month_day]).map_err(|e|e.to_string())?;tx.last_insert_rowid()
    };
    for (index,step) in item.actions.iter().enumerate(){tx.execute("INSERT INTO automation_actions(automation_id,position,kind,project_id,title) VALUES(?1,?2,?3,?4,?5)",params![id,index as i64,step.kind,step.project_id,step.title.trim()]).map_err(|e|e.to_string())?;}
    tx.commit().map_err(|e|e.to_string())?;
    scheduler::reset_baseline(&db,id)?;
    settings::apply_shortcuts(&app).map_err(|e|format!("Saved, but the shortcut could not be registered: {e}"))
}
#[tauri::command]
fn delete_automation(app:tauri::AppHandle,id:i64)->Result<(),String>{database(&app)?.execute("DELETE FROM automations WHERE id=?1",[id]).map_err(|e|e.to_string())?;let _=settings::apply_shortcuts(&app);Ok(())}
/// Runs one reviewed step. Returns a job id when the step started a saved command so the Commands page can show its output.
#[tauri::command]
fn run_automation_step(app:tauri::AppHandle,confirmed:Automation,index:usize)->Result<Option<String>,String>{
    let db=database(&app)?;
    let step=verified_automation_step(&db,&confirmed,index)?;
    if !confirmed.enabled{return Err("This automation is disabled".into())}
    let project=||step.project_id.ok_or_else(||"Project is required".to_string());
    match step.kind.as_str(){
        "open_project"=>open_project_folder(app.clone(),project()?).map(|_|None),
        "open_url"=>launch_web_url(&safe_web_url(&step.title,None)?).map(|_|None),
        "create_note"|"create_task"=>save_item(app.clone(),None,if step.kind=="create_note"{"note"}else{"task"}.into(),step.title.clone(),String::new(),String::new(),String::new(),step.project_id,"normal".into(),None).map(|_|None),
        "open_app"=>projects::launch_project_tool(app.clone(),project()?,step.title.clone()).map(|_|None),
        "show_notes"=>{db.query_row("SELECT id FROM projects WHERE id=?1",[project()?],|r|r.get::<_,i64>(0)).map_err(|_|"Project is unavailable".to_string())?;Ok(None)},
        "run_command"=>{
            let id:i64=step.title.trim().parse().map_err(|_|"Invalid command".to_string())?;
            let stored=load_commands(&db)?.into_iter().find(|x|x.id==Some(id)).ok_or("The saved command no longer exists")?;
            if stored.risk_level=="sensitive"{return Err("Sensitive commands cannot run inside automations. Run them from the Commands page.".into())}
            start_saved_command(&db,&stored).map(Some)
        },
        "start_session"=>projects::start_project_session(app.clone(),project()?).map(|_|None),
        "end_session"=>{
            let pid=project()?;
            let session:i64=db.query_row("SELECT id FROM sessions WHERE project_id=?1 AND is_active=1 ORDER BY id DESC LIMIT 1",[pid],|r|r.get(0)).map_err(|_|"There is no active session to end".to_string())?;
            projects::end_project_session(app.clone(),session,"Ended by an automation".into(),String::new(),String::new(),String::new()).map(|_|None)
        },
        _=>Err("Unsupported action".into()),
    }
}
fn verified_automation_step(db:&Connection,confirmed:&Automation,index:usize)->Result<AutomationAction,String>{
    validate_automation(&confirmed)?;let id=confirmed.id.ok_or("Automation must be saved first")?;
    let current=load_automations(db)?.into_iter().find(|a|a.id==Some(id)).ok_or("Automation no longer exists")?;
    if current!=*confirmed{return Err("Automation changed; review it again".into())}
    current.actions.get(index).cloned().ok_or("Invalid action index".into())
}
#[derive(Serialize,Deserialize,PartialEq)]
struct SavedCommand { id:Option<i64>, name:String, executable:String, arguments:Vec<String>, project_id:i64, #[serde(default)] description:String, #[serde(default)] working_directory:String, #[serde(default="d_category")] category:String, #[serde(default="d_risk")] risk_level:String, #[serde(default)] is_favorite:bool }
fn validate_command(item:&SavedCommand) -> Result<(),String> {
    if item.name.trim().is_empty() {return Err("Name is required".into())}
    let exe=validate_executable(std::path::Path::new(&item.executable))?;
    let basename=exe.file_name().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
    if ["cmd.exe","powershell.exe","pwsh.exe","bash.exe","wsl.exe","cscript.exe","wscript.exe","rundll32.exe","mshta.exe","wt.exe"].contains(&basename.as_str()) { return Err("Shells and script hosts are not supported".into()); }
    if item.arguments.len()>64 || item.arguments.iter().any(|a|a.contains('\0') || a.len()>4096) {return Err("Invalid arguments".into())}
    if !["read_only","development","sensitive"].contains(&item.risk_level.as_str()) {return Err("Invalid risk level".into())}
    if item.category.trim().is_empty() || item.category.chars().count()>60 || item.category.chars().any(|c|c.is_control()) {return Err("Category must be 1-60 characters".into())}
    if item.description.chars().count()>500 {return Err("Description is too long".into())}
    let sub=item.working_directory.trim();
    if !sub.is_empty() {
        let path=std::path::Path::new(sub);
        if sub.len()>200 || sub.chars().any(|c|c.is_control()) || path.is_absolute() || path.components().any(|c|!matches!(c,std::path::Component::Normal(_))) {return Err("The working subfolder must be a relative path inside the project".into())}
    }
    Ok(())
}
fn load_commands(db:&Connection) -> Result<Vec<SavedCommand>,String> {
    let mut stmt=db.prepare("SELECT id,name,executable,arguments,project_id,description,working_directory,category,risk_level,is_favorite FROM commands ORDER BY is_favorite DESC, name COLLATE NOCASE").map_err(|e|e.to_string())?;
    let rows=stmt.query_map([],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,i64>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?,r.get::<_,String>(7)?,r.get::<_,String>(8)?,r.get::<_,bool>(9)?))).map_err(|e|e.to_string())?;
    rows.map(|row|{
        let (id,name,executable,args,project_id,description,working_directory,category,risk_level,is_favorite)=row.map_err(|e|e.to_string())?;
        let arguments=serde_json::from_str(&args).map_err(|_|"Invalid saved arguments".to_string())?;
        Ok(SavedCommand{id:Some(id),name,executable,arguments,project_id,description,working_directory,category,risk_level,is_favorite})
    }).collect()
}
#[tauri::command]
fn list_commands(app:tauri::AppHandle)->Result<Vec<SavedCommand>,String>{load_commands(&database(&app)?)}
#[tauri::command]
fn save_command(app:tauri::AppHandle,item:SavedCommand)->Result<(),String>{
    validate_command(&item)?; let db=database(&app)?; let args=serde_json::to_string(&item.arguments).map_err(|e|e.to_string())?;
    if let Some(id)=item.id {
        let n=db.execute("UPDATE commands SET name=?1,executable=?2,arguments=?3,project_id=?4,description=?5,working_directory=?6,category=?7,risk_level=?8,is_favorite=?9 WHERE id=?10",params![item.name.trim(),item.executable,args,item.project_id,item.description.trim(),item.working_directory.trim(),item.category.trim(),item.risk_level,item.is_favorite,id]).map_err(|e|e.to_string())?;
        if n==0{return Err("Command no longer exists".into())}
    } else {
        db.execute("INSERT INTO commands(name,executable,arguments,project_id,description,working_directory,category,risk_level,is_favorite) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![item.name.trim(),item.executable,args,item.project_id,item.description.trim(),item.working_directory.trim(),item.category.trim(),item.risk_level,item.is_favorite]).map_err(|e|e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn set_command_favorite(app:tauri::AppHandle,id:i64,value:bool)->Result<(),String>{
    let n=database(&app)?.execute("UPDATE commands SET is_favorite=?1 WHERE id=?2",params![value,id]).map_err(|e|e.to_string())?;
    if n==0{return Err("Command no longer exists".into())} Ok(())
}
#[tauri::command]
fn delete_command(app:tauri::AppHandle,id:i64)->Result<(),String>{database(&app)?.execute("DELETE FROM commands WHERE id=?1",[id]).map_err(|e|e.to_string())?;Ok(())}
/// Starts a saved command in its project (or a subfolder inside it) as an argument array; no shell is involved.
fn start_saved_command(db:&Connection,stored:&SavedCommand)->Result<String,String>{
    validate_command(stored)?;
    let path:String=db.query_row("SELECT path FROM projects WHERE id=?1",[stored.project_id],|r|r.get(0)).map_err(|_|"Project is unavailable")?;
    let project=std::path::Path::new(&path).canonicalize().map_err(|_|"Project directory is unavailable")?;
    if !project.is_dir(){return Err("Project path is not a directory".into())}
    let mut directory=project.clone();
    let sub=stored.working_directory.trim();
    if !sub.is_empty(){
        let joined=project.join(sub).canonicalize().map_err(|_|"The working subfolder does not exist".to_string())?;
        if !joined.starts_with(&project)||!joined.is_dir(){return Err("The working subfolder must be inside the project".into())}
        directory=joined;
    }
    let executable=validate_executable(std::path::Path::new(&stored.executable))?;
    let mut command=std::process::Command::new(executable);command.args(&stored.arguments).current_dir(projects::plain_path(&directory));
    let job=jobs::start(command)?;
    database::record_activity(db,"command_run","command",stored.id,Some(stored.project_id),&format!("Ran saved command: {}",stored.name.trim()));
    Ok(job)
}
#[tauri::command]
fn run_command(app:tauri::AppHandle,confirmed:SavedCommand)->Result<String,String>{
    let db=database(&app)?; let id=confirmed.id.ok_or("Command must be saved first")?;
    let stored=load_commands(&db)?.into_iter().find(|x|x.id==Some(id)).ok_or("Command no longer exists")?;
    if stored!=confirmed{return Err("Command changed; review it again".into())}
    start_saved_command(&db,&stored)
}
#[tauri::command]
fn command_status(id:String)->Result<jobs::Status,String>{jobs::status(&id)}
#[tauri::command]
fn dismiss_command(id:String)->Result<(),String>{jobs::dismiss(&id)}
#[tauri::command]
fn vault_list(app:tauri::AppHandle) -> Result<Vec<security::VaultEntry>,String> {
    security::list_vault_entries(&database(&app)?)
}
#[tauri::command]
fn vault_update_metadata(app:tauri::AppHandle,id:i64,name:String,username:String,details:Option<security::VaultDetailsInput>) -> Result<(),String> {
    let _guard=security::VAULT_LOCK.lock().map_err(|_|"Vault is unavailable")?;
    security::update_vault_metadata(&database(&app)?,id,&name,&username,details.as_ref())
}
#[tauri::command]
fn vault_add(app:tauri::AppHandle,name:String,username:String,secret:String,details:Option<security::VaultDetailsInput>) -> Result<(),String> {
    #[cfg(windows)] {
        let _guard=security::VAULT_LOCK.lock().map_err(|_|"Vault is unavailable")?;
        let mut db=database(&app)?;
        security::add_vault_entry(&mut db,&name,&username,&secret,details.as_ref()).map(|_|())
    }
    #[cfg(not(windows))] { let _=(app,name,username,secret,details); Err("Vault requires Windows Credential Manager".into()) }
}
#[tauri::command]
fn vault_reveal(app:tauri::AppHandle,id:i64) -> Result<String,String> {
    #[cfg(windows)] {
        let _guard=security::VAULT_LOCK.lock().map_err(|_|"Vault is unavailable")?;
        security::reveal_vault_secret(&database(&app)?,id)
    }
    #[cfg(not(windows))] { let _=(app,id); Err("Vault requires Windows Credential Manager".into()) }
}
/// Copies a secret to the clipboard; it is cleared after 30 seconds only if the clipboard still holds the same value.
#[tauri::command]
fn vault_copy_secret(app:tauri::AppHandle,id:i64) -> Result<(),String> {
    #[cfg(windows)] {
        let _guard=security::VAULT_LOCK.lock().map_err(|_|"Vault is unavailable")?;
        let value=security::reveal_vault_secret(&database(&app)?,id)?;
        platform::copy_with_conditional_clear(value,settings::clipboard_timeout(&database(&app)?))
    }
    #[cfg(not(windows))] { let _=(app,id); Err("Vault requires Windows Credential Manager".into()) }
}
#[tauri::command]
fn vault_replace_secret(app:tauri::AppHandle,id:i64,secret:String) -> Result<Option<String>,String> {
    if secret.is_empty() { return Err("Secret is required".into()); }
    #[cfg(windows)] {
        let _guard=security::VAULT_LOCK.lock().map_err(|_|"Vault is unavailable")?;
        security::replace_secret(&database(&app)?,id,&secret)
    }
    #[cfg(not(windows))] { let _=(app,id,secret); Err("Vault requires Windows Credential Manager".into()) }
}
/// Removes orphaned protected credentials left by interrupted operations and reports entries whose secret is missing.
#[tauri::command]
fn vault_reconcile(app:tauri::AppHandle) -> Result<security::VaultReconcileReport,String> {
    #[cfg(windows)] {
        let _guard=security::VAULT_LOCK.lock().map_err(|_|"Vault is unavailable")?;
        security::reconcile_vault(&database(&app)?)
    }
    #[cfg(not(windows))] { let _=app; Err("Vault requires Windows Credential Manager".into()) }
}
#[tauri::command]
fn vault_delete(app:tauri::AppHandle,id:i64) -> Result<(),String> {
    #[cfg(windows)] {
        let _guard=security::VAULT_LOCK.lock().map_err(|_|"Vault is unavailable")?;
        let db=database(&app)?;
        let reference:String=db.query_row("SELECT secret_ref FROM vault_entries WHERE id=?1",[id],|r|r.get(0)).map_err(|_|"Vault entry is unavailable")?;
        security::credential(&reference)?.delete_credential().map_err(|_|"Could not delete protected credential")?;
        db.execute("DELETE FROM vault_entries WHERE id=?1",[id]).map_err(|_|"Credential deleted but metadata removal failed")?; Ok(())
    }
    #[cfg(not(windows))] { let _=(app,id); Err("Vault requires Windows Credential Manager".into()) }
}
fn d_environment() -> String { "development".into() }
#[derive(Serialize, Deserialize)]
struct ConnectionRecord { id: Option<i64>, name: String, kind: String, address: String, port: Option<u16>, username: String, project_id: Option<i64>, #[serde(default="d_environment")] environment: String, #[serde(default)] description: String, #[serde(default)] website_url: String, #[serde(default)] credential_id: Option<i64>, #[serde(default)] project_ids: Vec<i64> }
fn validate_connection(item: &ConnectionRecord) -> Result<(), String> {
    if item.name.trim().is_empty() || item.address.trim().is_empty() { return Err("Name and address are required".into()); }
    if !["ssh", "rdp", "web", "anydesk", "database", "local_service", "other"].contains(&item.kind.as_str()) { return Err("Unsupported connection type".into()); }
    if !["local", "development", "testing", "staging", "production"].contains(&item.environment.as_str()) { return Err("Unsupported environment".into()); }
    if item.port == Some(0) { return Err("Port must be between 1 and 65535".into()); }
    if item.address.chars().any(|c| c.is_control()) || item.username.chars().any(|c| c.is_control()) { return Err("Control characters are not allowed".into()); }
    if item.description.chars().count() > 1000 || item.description.chars().any(|c| c.is_control() && c != '\n') { return Err("The description is too long or contains control characters".into()); }
    if !item.website_url.trim().is_empty() { safe_web_url(item.website_url.trim(), None)?; }
    // Metadata must not include embedded URL credentials; no password field is provided.
    if item.address.contains('@') { return Err("Do not include credentials in the address".into()); }
    Ok(())
}
#[tauri::command]
fn list_connections(app: tauri::AppHandle) -> Result<Vec<ConnectionRecord>, String> {
    let db = database(&app)?;
    let mut stmt = db.prepare("SELECT id,name,kind,address,port,username,project_id,environment,description,website_url,credential_id FROM connections ORDER BY name COLLATE NOCASE").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(ConnectionRecord {id:r.get(0)?,name:r.get(1)?,kind:r.get(2)?,address:r.get(3)?,port:r.get(4)?,username:r.get(5)?,project_id:r.get(6)?,environment:r.get(7)?,description:r.get(8)?,website_url:r.get(9)?,credential_id:r.get(10)?,project_ids:Vec::new()})).map_err(|e| e.to_string())?;
    let mut list = rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
    let mut links = db.prepare("SELECT connection_id,project_id FROM connection_projects ORDER BY project_id").map_err(|e| e.to_string())?;
    let pairs = links.query_map([], |r| Ok((r.get::<_,i64>(0)?, r.get::<_,i64>(1)?))).map_err(|e| e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
    for item in &mut list { if let Some(id) = item.id { item.project_ids = pairs.iter().filter(|p| p.0 == id).map(|p| p.1).collect(); } }
    Ok(list)
}
#[tauri::command]
fn save_connection(app: tauri::AppHandle, item: ConnectionRecord) -> Result<(), String> {
    validate_connection(&item)?;
    let mut ids = item.project_ids.clone();
    if ids.is_empty() { if let Some(p) = item.project_id { ids.push(p); } }
    ids.sort(); ids.dedup();
    let first = ids.first().copied();
    let mut db = database(&app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let id = if let Some(id) = item.id {
        let n = tx.execute("UPDATE connections SET name=?1,kind=?2,address=?3,port=?4,username=?5,project_id=?6,environment=?7,description=?8,website_url=?9,credential_id=?10,updated_at=CURRENT_TIMESTAMP WHERE id=?11", params![item.name.trim(),item.kind,item.address.trim(),item.port,item.username.trim(),first,item.environment,item.description.trim(),item.website_url.trim(),item.credential_id,id]).map_err(|e| e.to_string())?;
        if n == 0 { return Err("Connection no longer exists".into()); }
        id
    } else {
        tx.execute("INSERT INTO connections(name,kind,address,port,username,project_id,environment,description,website_url,credential_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)", params![item.name.trim(),item.kind,item.address.trim(),item.port,item.username.trim(),first,item.environment,item.description.trim(),item.website_url.trim(),item.credential_id]).map_err(|e| e.to_string())?;
        tx.last_insert_rowid()
    };
    tx.execute("DELETE FROM connection_projects WHERE connection_id=?1", [id]).map_err(|e| e.to_string())?;
    for project in ids { tx.execute("INSERT INTO connection_projects(connection_id,project_id) VALUES(?1,?2)", params![id, project]).map_err(|e| e.to_string())?; }
    tx.commit().map_err(|e| e.to_string())
}
#[derive(Serialize)]
struct ConnectionCheck { reachable: bool, message: String, latency_ms: Option<u64> }
/// Lightweight TCP reachability test with round-trip latency measurement.
#[tauri::command]
async fn check_connection(app: tauri::AppHandle, id: i64) -> Result<ConnectionCheck, String> {
    let (kind, address, port): (String, String, Option<u16>) = database(&app)?.query_row("SELECT kind,address,port FROM connections WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::net::{TcpStream, ToSocketAddrs};
        let (host, target): (String, u16) = match kind.as_str() {
            "web" => { let url = url::Url::parse(&address).map_err(|_| "Enter a complete HTTP or HTTPS URL".to_string())?; let host = url.host_str().ok_or("The address has no host")?.to_string(); let target = port.or(url.port_or_known_default()).ok_or("There is no port to test")?; (host, target) }
            "anydesk" => return Err("AnyDesk IDs cannot be tested from here".to_string()),
            _ => { let host = security::validate_hostname_or_ip(&address)?; let host = host.trim_matches(|c| c == '[' || c == ']').to_string(); let target = port.or(match kind.as_str() { "ssh" => Some(22), "rdp" => Some(3389), _ => None }).ok_or("Add a port to test this connection")?; (host, target) }
        };
        let socket = (host.as_str(), target).to_socket_addrs().map_err(|_| "The host name could not be resolved".to_string())?.next().ok_or("The host name could not be resolved")?;
        let start = std::time::Instant::now();
        Ok(match TcpStream::connect_timeout(&socket, std::time::Duration::from_secs(3)) {
            Ok(_) => {
                let ms = start.elapsed().as_millis() as u64;
                ConnectionCheck { reachable: true, message: format!("{host}:{target} responded in {ms}ms"), latency_ms: Some(ms) }
            },
            Err(e) => ConnectionCheck { reachable: false, message: format!("{host}:{target} did not respond ({e})"), latency_ms: None },
        })
    }).await.map_err(|e| e.to_string())?
}

/// Tests reachability of an arbitrary TCP port on a target host.
#[tauri::command]
async fn check_port(host: String, port: u16) -> Result<ConnectionCheck, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::net::{TcpStream, ToSocketAddrs};
        let trimmed_host = host.trim().trim_matches(|c| c == '[' || c == ']');
        if trimmed_host.is_empty() { return Err("Host address is required".into()); }
        let valid_host = security::validate_hostname_or_ip(trimmed_host)?;
        let socket = (valid_host.as_str(), port).to_socket_addrs().map_err(|e| format!("Could not resolve {valid_host}: {e}"))?.next().ok_or("The host name could not be resolved")?;
        let start = std::time::Instant::now();
        Ok(match TcpStream::connect_timeout(&socket, std::time::Duration::from_secs(3)) {
            Ok(_) => {
                let ms = start.elapsed().as_millis() as u64;
                ConnectionCheck { reachable: true, message: format!("Port {port} on {valid_host} is OPEN ({ms}ms)"), latency_ms: Some(ms) }
            },
            Err(e) => ConnectionCheck { reachable: false, message: format!("Port {port} on {valid_host} is closed or unreachable ({e})"), latency_ms: None },
        })
    }).await.map_err(|e| e.to_string())?
}

/// Executes a single remote command via OpenSSH client and returns a streaming job id.
#[tauri::command]
fn run_ssh_command(app: tauri::AppHandle, id: i64, command: String) -> Result<String, String> {
    let (kind, address, port, username): (String, String, Option<u16>, String) = database(&app)?
        .query_row("SELECT kind,address,port,username FROM connections WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .map_err(|e| e.to_string())?;
    if kind != "ssh" { return Err("Only SSH connections support quick terminal command execution".into()); }
    let trimmed = command.trim();
    if trimmed.is_empty() { return Err("Command cannot be empty".into()); }
    #[cfg(windows)] {
        let exe = platform::openssh_exe()?;
        let mut args = security::ssh_arguments(&address, port, &username)?;
        args.insert(0, "-o".into());
        args.insert(1, "BatchMode=yes".into());
        args.insert(2, "-o".into());
        args.insert(3, "ConnectTimeout=5".into());
        args.insert(4, "-o".into());
        args.insert(5, "StrictHostKeyChecking=accept-new".into());
        args.push(trimmed.to_string());
        let mut cmd = std::process::Command::new(exe);
        cmd.args(&args);
        jobs::start(cmd)
    }
    #[cfg(not(windows))] {
        let _ = (trimmed, port, address, username);
        Err("SSH terminal execution is only supported on Windows".into())
    }
}

/// Runs a local terminal command in a project directory or default path.
#[tauri::command]
fn run_terminal_command(command: String, args: Vec<String>, cwd: Option<String>) -> Result<String, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() { return Err("Command cannot be empty".into()); }
    let mut cmd = std::process::Command::new(trimmed);
    cmd.args(&args);
    if let Some(dir) = cwd {
        if !dir.trim().is_empty() && std::path::Path::new(&dir).is_dir() {
            cmd.current_dir(dir);
        }
    }
    jobs::start(cmd)
}
#[tauri::command]
fn delete_connection(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    database(&app)?.execute("DELETE FROM connections WHERE id=?1", [id]).map_err(|e| e.to_string())?; Ok(())
}
#[tauri::command]
fn open_web_connection(app: tauri::AppHandle, id: i64, confirmed_address: String, confirmed_port: Option<u16>) -> Result<(), String> {
    let db = database(&app)?;
    let (kind,address,port): (String,String,Option<u16>) = db.query_row("SELECT kind,address,port FROM connections WHERE id=?1", [id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|e|e.to_string())?;
    if kind != "web" || address != confirmed_address || port != confirmed_port { return Err("Connection changed; review it before opening".into()); }
    let url = safe_web_url(&address,port)?;
    launch_web_url(&url)
}
#[tauri::command]
fn open_rdp_connection(app:tauri::AppHandle,id:i64,confirmed_address:String,confirmed_port:Option<u16>)->Result<(),String>{
    let db=database(&app)?;
    let (kind,address,port):(String,String,Option<u16>)=db.query_row("SELECT kind,address,port FROM connections WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|e|e.to_string())?;
    if kind!="rdp"||address!=confirmed_address||port!=confirmed_port{return Err("Connection changed; review it again".into())}
    let destination=rdp_destination(&address,port)?;
    #[cfg(windows)] {
        let executable=platform::mstsc_exe()?;
        std::process::Command::new(executable).arg(format!("/v:{destination}")).spawn().map_err(|e|format!("Could not start Remote Desktop: {e}"))?;Ok(())
    }
    #[cfg(not(windows))] {let _=destination;Err("Remote Desktop launching is only supported on Windows".into())}
}
fn launch_web_url(url:&str)->Result<(),String>{
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = std::ffi::OsStr::new(&url).encode_wide().chain(std::iter::once(0)).collect();
        // The URL has been limited to http(s), and is passed directly to Windows, without a shell command.
        let result = unsafe { windows_sys::Win32::UI::Shell::ShellExecuteW(std::ptr::null_mut(), std::ptr::null(), wide.as_ptr(), std::ptr::null(), std::ptr::null(), windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL) };
        if (result as isize) <= 32 { return Err("Windows could not open the URL".into()); }
        Ok(())
    }
    #[cfg(not(windows))]
    { let _ = url; Err("Opening web connections is only supported on Windows".into()) }
}
#[derive(Serialize)]
struct Session { id: i64, project_id: i64, summary: String, next_action: String, created_at: String }
#[tauri::command]
fn list_sessions(app: tauri::AppHandle, project_id: i64) -> Result<Vec<Session>, String> {
    let db = database(&app)?;
    let mut stmt = db.prepare("SELECT id,project_id,summary,next_action,created_at FROM sessions WHERE project_id=?1 AND is_active=0 ORDER BY id DESC LIMIT 100").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([project_id], |r| Ok(Session {id:r.get(0)?, project_id:r.get(1)?, summary:r.get(2)?, next_action:r.get(3)?, created_at:r.get(4)?})).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}
#[tauri::command]
fn add_session(app: tauri::AppHandle, project_id: i64, summary: String, next_action: String) -> Result<(), String> {
    if summary.trim().is_empty() { return Err("Session summary is required".into()); }
    database(&app)?.execute("INSERT INTO sessions(project_id,summary,next_action) VALUES(?1,?2,?3)", params![project_id,summary.trim(),next_action.trim()]).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn update_session(app: tauri::AppHandle, id:i64, project_id:i64, summary:String, next_action:String) -> Result<(),String> {
    if summary.trim().is_empty() { return Err("Session summary is required".into()); }
    let n=database(&app)?.execute("UPDATE sessions SET summary=?1,next_action=?2 WHERE id=?3 AND project_id=?4", params![summary.trim(),next_action.trim(),id,project_id]).map_err(|e|e.to_string())?;
    if n==0 { return Err("Session no longer exists".into()); } Ok(())
}
#[tauri::command]
fn delete_session(app: tauri::AppHandle, id:i64, project_id:i64) -> Result<(),String> {
    let n=database(&app)?.execute("DELETE FROM sessions WHERE id=?1 AND project_id=?2",params![id,project_id]).map_err(|e|e.to_string())?;
    if n==0 { return Err("Session no longer exists".into()); } Ok(())
}
#[tauri::command]
async fn scan_projects(root: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || scanner::scan(std::path::Path::new(&root)).map(|paths| paths.into_iter().map(|p| p.to_string_lossy().into_owned()).collect())).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<Vec<Project>, String> {
    let db = database(&app)?;
    let mut stmt = db.prepare("SELECT id,path,name,last_opened_at,description,status,group_name,preferred_editor,technology_tags,is_favorite,is_archived,website_url,created_at,ai_harness,git_state,last_commit_at,last_commit_hash,last_commit_subject,git_branch,git_dirty,git_remote FROM projects ORDER BY last_opened_at IS NULL, last_opened_at DESC, name COLLATE NOCASE").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Project { id:r.get(0)?, path:r.get(1)?, name:r.get(2)?, last_opened_at:r.get(3)?, description:r.get(4)?, status:r.get(5)?, group_name:r.get(6)?, preferred_editor:r.get(7)?, technology_tags:r.get(8)?, is_favorite:r.get(9)?, is_archived:r.get(10)?, website_url:r.get(11)?, created_at:r.get(12)?, ai_harness:r.get(13)?, git_state:r.get(14)?, last_commit_at:r.get(15)?, last_commit_hash:r.get(16)?, last_commit_subject:r.get(17)?, git_branch:r.get(18)?, git_dirty:r.get(19)?, git_remote:r.get(20)?, git_web_url:git::web_url(&r.get::<_,String>(20)?) })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}
#[tauri::command]
async fn import_projects(app: tauri::AppHandle, root: String, paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        scanner::reset_cancel_scan();
        let (found, report) = scanner::scan_with_options(std::path::Path::new(&root), &[], false)?;
        let mut db = database(&app)?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        for path in paths {
            let canonical = std::path::Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
            if !found.contains(&canonical) { return Err("Selected path is no longer a discovered project".into()); }
            let name = canonical.file_name().ok_or("Project has no directory name")?.to_string_lossy();
            let tags = report.projects.iter().find(|d| std::path::Path::new(&d.path) == canonical.as_path()).map(|d| d.tags.join(", ")).unwrap_or_default();
            tx.execute("INSERT OR IGNORE INTO projects(path,name,technology_tags,created_at,updated_at) VALUES(?1,?2,?3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", params![canonical.to_string_lossy().as_ref(), name.as_ref(), tags]).map_err(|e| e.to_string())?;
        }
        if let Ok(canonical_root) = std::path::Path::new(&root).canonicalize() {
            tx.execute("INSERT OR IGNORE INTO project_roots(path) VALUES(?1)", [canonical_root.to_string_lossy().as_ref()]).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn open_project_folder(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let path: String = database(&app)?.query_row("SELECT path FROM projects WHERE id=?1", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if !std::path::Path::new(&path).is_dir() { return Err("Project directory is unavailable".into()); }
    #[cfg(target_os = "windows")]
    { let explorer=platform::explorer_exe()?; std::process::Command::new(explorer).arg(projects::plain_path(std::path::Path::new(&path))).spawn().map_err(|e| e.to_string())?; let db=database(&app)?; db.execute("UPDATE projects SET last_opened_at=CURRENT_TIMESTAMP WHERE id=?1", [id]).map_err(|e| e.to_string())?; database::record_activity(&db,"project_opened","project",Some(id),Some(id),"Opened project folder"); Ok(()) }
    #[cfg(not(target_os = "windows"))]
    { Err("Opening projects is only supported on Windows".into()) }
}
#[tauri::command]
fn configure_editor(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let resolved = validate_executable(std::path::Path::new(&path))?;
    database(&app)?.execute("INSERT INTO settings(key,value) VALUES('editor_path',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [resolved.to_string_lossy().as_ref()]).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn editor_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use rusqlite::OptionalExtension;
    database(&app)?.query_row("SELECT value FROM settings WHERE key='editor_path'", [], |r| r.get(0)).optional().map_err(|e| e.to_string())
}
#[tauri::command]
fn open_in_editor(app: tauri::AppHandle, project_id: i64) -> Result<(), String> {
    let db = database(&app)?;
    let project: String = db.query_row("SELECT path FROM projects WHERE id=?1", [project_id], |r| r.get(0)).map_err(|e| e.to_string())?;
    let project = std::path::Path::new(&project).canonicalize().map_err(|e| format!("Project is unavailable: {e}"))?;
    if !project.is_dir() { return Err("Project path is not a directory".into()); }
    let editor: String = db.query_row("SELECT value FROM settings WHERE key='editor_path'", [], |r| r.get(0)).map_err(|_| "Configure the VS Code executable in Settings first".to_string())?;
    let executable = validate_executable(std::path::Path::new(&editor))?;
    let project = projects::plain_path(&project);
    std::process::Command::new(executable).arg(&project).current_dir(&project).spawn().map_err(|e| format!("Could not launch editor: {e}"))?;
    db.execute("UPDATE projects SET last_opened_at=CURRENT_TIMESTAMP WHERE id=?1", [project_id]).map_err(|e| e.to_string())?;
    database::record_activity(&db, "project_opened", "project", Some(project_id), Some(project_id), "Opened in editor");
    Ok(())
}
#[tauri::command]
async fn backup_database(app: tauri::AppHandle, destination: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || write_backup(&database(&app)?, std::path::Path::new(&destination))).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn restore_database(app: tauri::AppHandle, source: String) -> Result<String, String> {
    let active = app.path().app_data_dir().map_err(|e| e.to_string())?.join("dashboard.sqlite3");
    tauri::async_runtime::spawn_blocking(move || database::restore_database_from_file(&active, std::path::Path::new(&source)).map(|p| p.to_string_lossy().into_owned())).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_command(id: String) -> Result<(), String> { jobs::cancel(&id) }
#[tauri::command]
fn cancel_scan() { scanner::request_cancel_scan() }
/// Opens the Windows OpenSSH client in its own console. Host key verification is left untouched and no password is passed.
#[tauri::command]
fn open_ssh_connection(app: tauri::AppHandle, id: i64, confirmed_address: String, confirmed_port: Option<u16>) -> Result<(), String> {
    let (kind, address, port, username): (String, String, Option<u16>, String) = database(&app)?.query_row("SELECT kind,address,port,username FROM connections WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).map_err(|e| e.to_string())?;
    if kind != "ssh" || address != confirmed_address || port != confirmed_port { return Err("Connection changed; review it again".into()); }
    let args = security::ssh_arguments(&address, port, &username)?;
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        let exe = platform::openssh_exe()?;
        std::process::Command::new(exe).args(args).creation_flags(0x0000_0010).spawn().map_err(|e| format!("Could not start SSH: {e}"))?; Ok(())
    }
    #[cfg(not(windows))] { let _ = args; Err("SSH launching is only supported on Windows".into()) }
}
/// Opens the installed AnyDesk client for the saved ID. Passwords are never passed on the command line.
#[tauri::command]
fn open_anydesk_connection(app: tauri::AppHandle, id: i64, confirmed_address: String) -> Result<(), String> {
    let (kind, address): (String, String) = database(&app)?.query_row("SELECT kind,address FROM connections WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
    if kind != "anydesk" || address != confirmed_address { return Err("Connection changed; review it again".into()); }
    let target = security::validate_anydesk_address(&address)?;
    let exe = platform::detect_standard_tool_path("anydesk").ok_or("AnyDesk was not found in its standard install folders")?;
    std::process::Command::new(exe).arg(target).spawn().map_err(|e| format!("Could not start AnyDesk: {e}"))?; Ok(())
}
#[derive(Default)]
struct IntegrationStatus(std::sync::Mutex<Vec<String>>);
/// Switches the main window between full screen and normal; returns the new state.
#[tauri::command]
fn toggle_fullscreen(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main").ok_or("The window is unavailable")?;
    let next = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}
#[tauri::command]
fn is_fullscreen(app: tauri::AppHandle) -> bool { app.get_webview_window("main").and_then(|w| w.is_fullscreen().ok()).unwrap_or(false) }
#[tauri::command]
fn exit_app(app:tauri::AppHandle){jobs::terminate_all();app.exit(0)}
#[tauri::command]
fn integration_warnings(state:tauri::State<'_,IntegrationStatus>)->Vec<String>{state.0.lock().map(|v|v.clone()).unwrap_or_else(|_|vec!["Integration status unavailable".into()])}
fn show_main(app: &tauri::AppHandle) { settings::show_main(app); }
fn main() {
    tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
    .plugin(tauri_plugin_notification::init())
    .manage(IntegrationStatus::default()).plugin(tauri_plugin_dialog::init())
    .setup(|app| {
        let handle = app.handle().clone();
        let warn = |message: String| { if let Ok(mut warnings) = handle.state::<IntegrationStatus>().0.lock() { warnings.push(message); } };
        if let Err(e) = settings::load_startup(&handle) { warn(e); }
        scheduler::start(handle.clone());
        match app.handle().plugin(tauri_plugin_global_shortcut::Builder::new().build()) {
            Ok(_) => { if let Err(e) = settings::apply_shortcuts(&handle) { warn(e); } }
            Err(_) => warn("Global shortcuts are unavailable.".into()),
        }
        let tray_result = (|| -> tauri::Result<()> {
            let show = tauri::menu::MenuItem::with_id(app, "show", "Open dashboard", true, None::<&str>)?;
            let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
            let mut builder = tauri::tray::TrayIconBuilder::new().menu(&menu).tooltip("Smart Beton Dashboard")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => { show_main(app); let _ = app.emit("request-exit", ()); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event { show_main(tray.app_handle()); }
                });
            if let Some(icon) = app.default_window_icon() { builder = builder.icon(icon.clone()); }
            builder.build(app)?; Ok(())
        })();
        if tray_result.is_err() { warn("Could not create the system tray icon.".into()); }
        Ok(())
    })
    .on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if settings::MINIMIZE_TO_TRAY.load(std::sync::atomic::Ordering::Relaxed) { api.prevent_close(); let _ = window.hide(); }
        }
    })
    .invoke_handler(tauri::generate_handler![list_items,toggle_task,delete_item,restore_item,purge_item,save_item,scan_projects,list_projects,import_projects,projects::delete_project,projects::list_project_roots,projects::add_project_root,projects::update_project_root,projects::remove_project_root,projects::scan_project_root,projects::import_root_projects,projects::ignored_project_count,projects::clear_ignored_projects,projects::refresh_git_info,projects::git_recent_commits,projects::launch_workspace,scheduler::take_automation_offers,toggle_fullscreen,is_fullscreen,projects::set_project_harness,projects::list_workspace_profiles,projects::save_workspace_profile,projects::delete_workspace_profile,projects::run_workspace_profile,open_project_folder,backup_database,list_sessions,add_session,update_session,delete_session,configure_editor,editor_path,open_in_editor,list_connections,save_connection,delete_connection,open_web_connection,open_rdp_connection,task_activity,vault_list,vault_add,vault_reveal,vault_delete,vault_update_metadata,vault_replace_secret,vault_copy_secret,vault_reconcile,restore_database,cancel_command,cancel_scan,save_goal,toggle_pin,settings::get_settings,settings::update_setting,settings::app_info,settings::notify_user,settings::send_test_notification,settings::check_due_notifications,set_command_favorite,check_connection,projects::create_project,projects::update_project,projects::set_project_flag,projects::project_sessions,projects::start_project_session,projects::end_project_session,projects::continue_info,projects::project_activity,projects::list_tools,projects::set_tool_path,projects::launch_project_tool,projects::link_connection_project,projects::link_vault_project,set_item_flag,duplicate_item,convert_note_to_task,set_task_status,set_subtasks,list_categories,create_category,rename_category,delete_category,open_external_url,get_setting,set_setting,detect_tools,open_ssh_connection,open_anydesk_connection,list_commands,save_command,delete_command,run_command,command_status,dismiss_command,list_automations,save_automation,delete_automation,run_automation_step,integration_warnings,exit_app,set_task_due_date,check_port,run_ssh_command,run_terminal_command])
    .run(tauri::generate_context!()).expect("error running application");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_preserves_existing_items_and_enforces_project_reference() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE items (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE projects (id INTEGER PRIMARY KEY,path TEXT NOT NULL UNIQUE,name TEXT NOT NULL); INSERT INTO items(kind,title) VALUES('note','Existing'); PRAGMA user_version=1;").unwrap();
        migrate(&db).unwrap();
        let row: (String,String,bool) = db.query_row("SELECT title, category, deleted FROM items", [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
        assert_eq!(row, ("Existing".into(), "".into(), false));
        assert!(db.execute("UPDATE items SET project_id=999", []).is_err());
        assert!(db.execute("INSERT INTO sessions(project_id,summary) VALUES(999,'test')", []).is_err());
        db.execute("INSERT INTO projects(path,name) VALUES('example','Example')", []).unwrap();
        let last: Option<String> = db.query_row("SELECT last_opened_at FROM projects WHERE name='Example'", [], |r| r.get(0)).unwrap();
        assert_eq!(last, None);
        migrate(&db).unwrap();
    }
    #[test]
    fn backup_preserves_data_and_does_not_overwrite() {
        let db = Connection::open_in_memory().unwrap();
        migrate(&db).unwrap();
        db.execute("INSERT INTO items(kind,title) VALUES('note','Synthetic')", []).unwrap();
        let path = std::env::temp_dir().join(format!("smart-beton-backup-test-{}.sqlite", std::process::id()));
        assert!(!path.exists());
        write_backup(&db, &path).unwrap();
        let saved = Connection::open(&path).unwrap();
        let title: String = saved.query_row("SELECT title FROM items", [], |r| r.get(0)).unwrap();
        assert_eq!(title, "Synthetic");
        assert!(write_backup(&db, &path).is_err());
        drop(saved);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn executable_validation_rejects_relative_batch_and_missing_paths() {
        assert!(validate_executable(std::path::Path::new("relative.exe")).is_err());
        assert!(validate_executable(std::path::Path::new("C:\\missing.cmd")).is_err());
        assert!(validate_executable(std::path::Path::new("C:\\missing.exe")).is_err());
    }
    #[test]
    fn connection_validation_rejects_credentials_invalid_types_and_ports() {
        let mut c = ConnectionRecord { id:None, name:"Example".into(), kind:"ssh".into(), address:"host.example".into(), port:Some(22), username:"user".into(), project_id:None, environment:"development".into(), description:String::new(), website_url:String::new(), credential_id:None, project_ids: vec![] };
        assert!(validate_connection(&c).is_ok());
        c.address = "https://user:pass@example.com".into(); assert!(validate_connection(&c).is_err());
        c.address = "host".into(); c.port = Some(0); assert!(validate_connection(&c).is_err());
        c.port = None; c.kind = "invalid".into(); assert!(validate_connection(&c).is_err());
    }
    #[test]
    fn activity_counts_only_events_in_last_seven_days() {
        let db = Connection::open_in_memory().unwrap();
        migrate(&db).unwrap();
        db.execute_batch("INSERT INTO items(kind,title) VALUES('task','Example'); INSERT INTO task_events(task_id,kind) VALUES(1,'created'),(1,'completed'); INSERT INTO task_events(task_id,kind,occurred_at) VALUES(1,'created',datetime('now','-30 days'));").unwrap();
        let days=activity_for_db(&db).unwrap();
        assert_eq!(days.len(),7);
        assert_eq!(days.iter().map(|d|d.created).sum::<i64>(),1);
        assert_eq!(days.iter().map(|d|d.completed).sum::<i64>(),1);
    }
    #[test]
    fn due_date_requires_a_real_iso_calendar_date() {
        let db=Connection::open_in_memory().unwrap();
        assert!(valid_due_date(&db,"2024-02-29").unwrap());
        assert!(!valid_due_date(&db,"2025-02-29").unwrap());
        assert!(!valid_due_date(&db,"not-a-date").unwrap());
    }
    #[test]
    fn purge_only_deletes_items_already_in_trash() {
        let db=Connection::open_in_memory().unwrap(); migrate(&db).unwrap();
        db.execute("INSERT INTO items(kind,title) VALUES('note','Active')",[]).unwrap();
        assert!(purge_trashed(&db,1).is_err());
        db.execute("UPDATE items SET deleted=1 WHERE id=1",[]).unwrap();
        assert!(purge_trashed(&db,1).is_ok());
        assert!(purge_trashed(&db,1).is_err());
    }
    #[test]
    fn web_urls_reject_unsafe_schemes_credentials_and_duplicate_ports() {
        assert_eq!(safe_web_url("https://example.com/panel",Some(8443)).unwrap(),"https://example.com:8443/panel");
        assert!(safe_web_url("file:///C:/secret",None).is_err());
        assert!(safe_web_url("javascript:alert(1)",None).is_err());
        assert!(safe_web_url("https://user:pass@example.com/",None).is_err());
        assert!(safe_web_url("https://example.com:1234/",Some(5678)).is_err());
    }
    #[test]
    fn rdp_destination_rejects_options_and_formats_ipv6() {
        assert_eq!(rdp_destination("example.com",Some(3389)).unwrap(),"example.com:3389");
        assert_eq!(rdp_destination("::1",Some(3389)).unwrap(),"[::1]:3389");
        assert!(rdp_destination("/admin",None).is_err());
        assert!(rdp_destination("-bad.example",None).is_err());
        assert!(rdp_destination("host name",None).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn synthetic_credential_roundtrip() {
        let reference=format!("test-{}",uuid::Uuid::new_v4());
        let entry=security::credential(&reference).unwrap();
        entry.set_password("synthetic-test-only").expect("credential write failed");
        let read=entry.get_password();
        let cleanup=entry.delete_credential();
        assert_eq!(read.unwrap(),"synthetic-test-only");
        cleanup.expect("synthetic credential cleanup failed");
    }
    #[cfg(windows)]
    #[test]
    fn synthetic_secret_replacement_keeps_reference_consistent() {
        let db=Connection::open_in_memory().unwrap(); migrate(&db).unwrap();
        let reference=format!("test-{}",uuid::Uuid::new_v4());
        let original=security::credential(&reference).unwrap(); original.set_password("synthetic-old").unwrap();
        db.execute("INSERT INTO vault_entries(name,secret_ref) VALUES('Synthetic',?1)",[&reference]).unwrap();
        let result=security::replace_secret(&db,1,"synthetic-new");
        let current:String=db.query_row("SELECT secret_ref FROM vault_entries WHERE id=1",[],|r|r.get(0)).unwrap();
        let entry=security::credential(&current).unwrap(); let read=entry.get_password(); let cleanup=entry.delete_credential();
        assert!(result.unwrap().is_none()); assert_ne!(reference,current);
        assert_eq!(read.unwrap(),"synthetic-new"); cleanup.unwrap();
    }
    #[test]
    fn vault_schema_contains_only_metadata_and_reference() {
        let db=Connection::open_in_memory().unwrap(); migrate(&db).unwrap();
        db.execute("INSERT INTO vault_entries(name,username,secret_ref) VALUES(?1,?2,?3)",params!["Synthetic","test","opaque-reference"]).unwrap();
        let columns:Vec<String>=db.prepare("PRAGMA table_info(vault_entries)").unwrap().query_map([],|r|r.get(1)).unwrap().collect::<Result<_,_>>().unwrap();
        assert_eq!(columns,vec!["id","name","username","secret_ref"]);
        security::update_vault_metadata(&db,1,"Updated","other",None).unwrap();
        let reference:String=db.query_row("SELECT secret_ref FROM vault_entries WHERE id=1",[],|r|r.get(0)).unwrap();
        assert_eq!(reference,"opaque-reference");
        assert!(security::update_vault_metadata(&db,1," ","other",None).is_err());
        assert!(security::update_vault_metadata(&db,999,"missing","",None).is_err());
    }
    #[test]
    fn command_storage_preserves_argument_boundaries_and_requires_existing_project() {
        let db=Connection::open_in_memory().unwrap(); migrate(&db).unwrap();
        assert!(db.execute("INSERT INTO commands(name,executable,arguments,project_id) VALUES('x','x','[]',123)",[]).is_err());
        db.execute("INSERT INTO projects(name,path) VALUES('Test','test')",[]).unwrap();
        db.execute("INSERT INTO commands(name,executable,arguments,project_id) VALUES(?1,?2,?3,1)",params!["Example","synthetic.exe",r#"["a b",";","$(test)"]"#]).unwrap();
        let commands=load_commands(&db).unwrap();
        assert_eq!(commands[0].arguments,vec!["a b",";","$(test)"]);
        assert!(validate_command(&commands[0]).is_err());
    }
    #[test]
    fn automation_actions_are_ordered_and_reject_unknown_types() {
        let db=Connection::open_in_memory().unwrap();migrate(&db).unwrap();
        db.execute("INSERT INTO automations(name) VALUES('Synthetic')",[]).unwrap();
        db.execute("INSERT INTO automation_actions VALUES(1,1,'create_note',NULL,'Second')",[]).unwrap();
        db.execute("INSERT INTO automation_actions VALUES(1,0,'create_task',NULL,'First')",[]).unwrap();
        let mut items=load_automations(&db).unwrap();
        assert_eq!(items[0].actions[0].title,"First");
        assert!(validate_automation(&items[0]).is_ok());
        assert!(verified_automation_step(&db,&items[0],0).is_ok());
        db.execute("UPDATE automation_actions SET title='Changed' WHERE automation_id=1 AND position=0",[]).unwrap();
        assert!(verified_automation_step(&db,&items[0],0).is_err());
        db.execute("UPDATE automation_actions SET title='First' WHERE automation_id=1 AND position=0",[]).unwrap();
        items[0].actions[0].kind="shell".into();
        assert!(validate_automation(&items[0]).is_err());
        items[0].actions[0].kind="open_url".into(); items[0].actions[0].title="javascript:alert(1)".into();
        assert!(validate_automation(&items[0]).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn command_validation_blocks_system_shell() {
        let shell=std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32").join("cmd.exe");
        let command=SavedCommand{id:None,name:"Shell".into(),executable:shell.to_string_lossy().into_owned(),arguments:vec![],project_id:1,description:String::new(),working_directory:String::new(),category:"development".into(),risk_level:"development".into(),is_favorite:false};
        assert!(validate_command(&command).is_err());
    }
    #[test]
    fn simultaneous_first_open_migrates_once() {
        let path = std::env::temp_dir().join(format!("smart-beton-migrate-test-{}.sqlite", std::process::id()));
        assert!(!path.exists());
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(4));
        let threads: Vec<_> = (0..4).map(|_| {
            let path = path.clone(); let barrier = barrier.clone();
            std::thread::spawn(move || { let db = Connection::open(path).unwrap(); barrier.wait(); migrate(&db) })
        }).collect();
        for thread in threads { thread.join().unwrap().unwrap(); }
        let db = Connection::open(&path).unwrap();
        let version: i64 = db.pragma_query_value(None, "user_version", |r|r.get(0)).unwrap();
        assert_eq!(version, database::SCHEMA_VERSION);
        drop(db); std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn failed_migration_rolls_back_partial_changes() {
        let db=Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE items(id INTEGER PRIMARY KEY, kind TEXT, category TEXT); CREATE TABLE projects(id INTEGER PRIMARY KEY); PRAGMA user_version=1;").unwrap();
        assert!(migrate(&db).is_err());
        let version:i64=db.pragma_query_value(None,"user_version",|r|r.get(0)).unwrap();
        assert_eq!(version,1);
        let session_count:i64=db.query_row("SELECT count(*) FROM sqlite_master WHERE name='sessions'",[],|r|r.get(0)).unwrap();
        assert_eq!(session_count,0);
    }
}

#[cfg(test)]
mod more_tests {
    use super::*;
    fn automation(kind: &str, project: Option<i64>, title: &str) -> Automation {
        Automation { id: None, name: "Synthetic".into(), description: String::new(), actions: vec![AutomationAction { kind: kind.into(), project_id: project, title: title.into() }], trigger_type: "manual".into(), shortcut: String::new(), enabled: true, schedule_time: String::new(), schedule_days: "1,2,3,4,5,6,7".into(), schedule_kind: "weekly".into(), schedule_month_day: 1 }
    }
    #[test]
    fn automation_actions_need_their_own_parameters() {
        assert!(validate_automation(&automation("start_session", Some(1), "")).is_ok());
        assert!(validate_automation(&automation("start_session", None, "")).is_err());
        assert!(validate_automation(&automation("open_app", Some(1), "vscode")).is_ok());
        assert!(validate_automation(&automation("open_app", Some(1), "calc.exe")).is_err());
        assert!(validate_automation(&automation("run_command", None, "12")).is_ok());
        assert!(validate_automation(&automation("run_command", None, "rm -rf")).is_err());
        assert!(validate_automation(&automation("show_notes", Some(1), "")).is_ok());
    }
    #[test]
    fn automation_triggers_validate_shortcuts() {
        let mut a = automation("create_task", None, "Task");
        a.trigger_type = "shortcut".into(); a.shortcut = "Ctrl+Alt+J".into();
        assert!(validate_automation(&a).is_ok());
        a.shortcut = "J".into(); assert!(validate_automation(&a).is_err());
        a.trigger_type = "manual".into(); a.shortcut = "Ctrl+Alt+J".into(); assert!(validate_automation(&a).is_err());
        a.trigger_type = "other".into(); a.shortcut.clear(); assert!(validate_automation(&a).is_err());
    }
    #[test]
    fn command_metadata_is_validated() {
        let exe = std::env::current_exe().unwrap();
        let mut c = SavedCommand { id: None, name: "Test".into(), executable: exe.to_string_lossy().into_owned(), arguments: vec![], project_id: 1, description: String::new(), working_directory: String::new(), category: "development".into(), risk_level: "read_only".into(), is_favorite: false };
        assert!(validate_command(&c).is_ok());
        c.risk_level = "dangerous".into(); assert!(validate_command(&c).is_err());
        c.risk_level = "sensitive".into(); assert!(validate_command(&c).is_ok());
        c.working_directory = "..\\other".into(); assert!(validate_command(&c).is_err());
        c.working_directory = "C:\\Windows".into(); assert!(validate_command(&c).is_err());
        c.working_directory = "packages\\app".into(); assert!(validate_command(&c).is_ok());
    }
    #[test]
    fn connection_environment_and_website_are_validated() {
        let mut c = ConnectionRecord { id: None, name: "Panel".into(), kind: "web".into(), address: "https://example.test".into(), port: None, username: String::new(), project_id: None, environment: "production".into(), description: "Notes".into(), website_url: "https://example.test/admin".into(), credential_id: None, project_ids: vec![] };
        assert!(validate_connection(&c).is_ok());
        c.environment = "prod".into(); assert!(validate_connection(&c).is_err());
        c.environment = "staging".into(); c.website_url = "javascript:alert(1)".into(); assert!(validate_connection(&c).is_err());
    }
    #[test]
    fn scheduled_automations_need_a_time_and_days() {
        let mut a = automation("create_task", None, "Task");
        a.trigger_type = "scheduled".into(); a.schedule_time = "08:30".into(); a.schedule_days = "1,2,3".into();
        assert!(validate_automation(&a).is_ok());
        a.schedule_kind = "monthly".into(); a.schedule_month_day = 31; assert!(validate_automation(&a).is_ok());
        a.schedule_month_day = 32; assert!(validate_automation(&a).is_err());
        a.schedule_kind = "daily".into(); a.schedule_days = String::new(); assert!(validate_automation(&a).is_ok());
        a.schedule_kind = "yearly".into(); assert!(validate_automation(&a).is_err());
        a.schedule_kind = "weekly".into(); a.schedule_days = "1,2,3".into();
        a.schedule_time = "8:30".into(); assert!(validate_automation(&a).is_err());
        a.schedule_time = "08:30".into(); a.schedule_days = "0".into(); assert!(validate_automation(&a).is_err());
        a.schedule_days = "1".into(); a.shortcut = "Ctrl+Alt+J".into(); assert!(validate_automation(&a).is_err());
    }
    #[test]
    fn a_server_can_belong_to_several_projects() {
        let db = Connection::open_in_memory().unwrap(); migrate(&db).unwrap();
        db.execute_batch("INSERT INTO projects(path,name) VALUES('a','A'),('b','B'); INSERT INTO connections(name,kind,address) VALUES('Box','ssh','host'); INSERT INTO connection_projects VALUES(1,1),(1,2);").unwrap();
        let n: i64 = db.query_row("SELECT count(*) FROM connection_projects WHERE connection_id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
        db.execute("DELETE FROM projects WHERE id=1", []).unwrap();
        let left: i64 = db.query_row("SELECT count(*) FROM connection_projects", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 1);
    }
}
