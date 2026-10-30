use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const SCHEMA_VERSION: i64 = 17;
static RESTORE_LOCK: Mutex<()> = Mutex::new(());

pub fn migrate(db: &Connection) -> Result<(), String> {
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    db.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|e| e.to_string())?;
    let tx =
        rusqlite::Transaction::new_unchecked(db, rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
    let version: i64 = tx
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version > SCHEMA_VERSION {
        return Err("Database was created by a newer version of the application".into());
    }
    if version == 0 {
        tx.execute_batch("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('task','note')), title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL); PRAGMA user_version=1;")
            .map_err(|e| e.to_string())?;
    }
    if version < 2 {
        tx.execute_batch("ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT ''; ALTER TABLE items ADD COLUMN tags TEXT NOT NULL DEFAULT ''; ALTER TABLE items ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL; ALTER TABLE items ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)); CREATE INDEX IF NOT EXISTS items_kind_deleted ON items(kind,deleted); PRAGMA user_version=2;")
            .map_err(|e| e.to_string())?;
    }
    if version < 3 {
        tx.execute_batch("CREATE TABLE sessions (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, summary TEXT NOT NULL, next_action TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX sessions_project ON sessions(project_id, id DESC); PRAGMA user_version=3;")
            .map_err(|e| e.to_string())?;
    }
    if version < 4 {
        tx.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=4;")
            .map_err(|e| e.to_string())?;
    }
    if version < 5 {
        tx.execute_batch("CREATE TABLE connections (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('ssh','rdp','web','anydesk','other')), address TEXT NOT NULL, port INTEGER, username TEXT NOT NULL DEFAULT '', project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL); CREATE INDEX connections_project ON connections(project_id); PRAGMA user_version=5;")
            .map_err(|e| e.to_string())?;
    }
    if version < 6 {
        tx.execute_batch("CREATE TABLE task_events (id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('created','completed')), occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX task_events_date ON task_events(occurred_at); PRAGMA user_version=6;")
            .map_err(|e| e.to_string())?;
    }
    if version < 7 {
        tx.execute_batch("ALTER TABLE items ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')); ALTER TABLE items ADD COLUMN due_date TEXT; PRAGMA user_version=7;")
            .map_err(|e| e.to_string())?;
    }
    if version < 8 {
        tx.execute_batch("ALTER TABLE projects ADD COLUMN last_opened_at TEXT; CREATE INDEX projects_last_opened ON projects(last_opened_at DESC); PRAGMA user_version=8;")
            .map_err(|e| e.to_string())?;
    }
    if version < 9 {
        tx.execute_batch("CREATE TABLE vault_entries (id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL DEFAULT '', secret_ref TEXT NOT NULL UNIQUE); PRAGMA user_version=9;")
            .map_err(|e| e.to_string())?;
    }
    if version < 10 {
        tx.execute_batch("CREATE TABLE commands (id INTEGER PRIMARY KEY, name TEXT NOT NULL, executable TEXT NOT NULL, arguments TEXT NOT NULL, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE); PRAGMA user_version=10;")
            .map_err(|e| e.to_string())?;
    }
    if version < 11 {
        tx.execute_batch("CREATE TABLE automations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT ''); CREATE TABLE automation_actions (automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE, position INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('open_project','create_note','create_task')), project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT '', PRIMARY KEY(automation_id,position)); PRAGMA user_version=11;")
            .map_err(|e| e.to_string())?;
    }
    if version < 12 {
        tx.execute_batch("ALTER TABLE automation_actions RENAME TO automation_actions_old; CREATE TABLE automation_actions (automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE, position INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('open_project','create_note','create_task','open_url')), project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT '', PRIMARY KEY(automation_id,position)); INSERT INTO automation_actions SELECT * FROM automation_actions_old; DROP TABLE automation_actions_old; PRAGMA user_version=12;")
            .map_err(|e| e.to_string())?;
    }
    if version < 13 {
        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS project_roots (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL DEFAULT '',
                exclusions TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
            ALTER TABLE projects ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN preferred_editor TEXT NOT NULL DEFAULT 'vscode';
            ALTER TABLE projects ADD COLUMN technology_tags TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1));
            ALTER TABLE projects ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1));
            ALTER TABLE projects ADD COLUMN website_url TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
            CREATE TABLE IF NOT EXISTS project_workspace_profiles (
                id INTEGER PRIMARY KEY,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                open_folder INTEGER NOT NULL DEFAULT 0,
                launch_editor INTEGER NOT NULL DEFAULT 0,
                launch_terminal INTEGER NOT NULL DEFAULT 0,
                doc_url TEXT NOT NULL DEFAULT '',
                show_notes INTEGER NOT NULL DEFAULT 1,
                show_tasks INTEGER NOT NULL DEFAULT 1
            );
            ALTER TABLE items ADD COLUMN status TEXT NOT NULL DEFAULT 'todo';
            ALTER TABLE items ADD COLUMN is_urgent INTEGER NOT NULL DEFAULT 0 CHECK(is_urgent IN (0,1));
            ALTER TABLE items ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0,1));
            ALTER TABLE items ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1));
            ALTER TABLE items ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1));
            ALTER TABLE items ADD COLUMN is_goal INTEGER NOT NULL DEFAULT 0 CHECK(is_goal IN (0,1));
            ALTER TABLE items ADD COLUMN subtasks_json TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE items ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
            ALTER TABLE items ADD COLUMN completed_at TEXT;
            CREATE TABLE IF NOT EXISTS note_categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                parent_id INTEGER REFERENCES note_categories(id) ON DELETE SET NULL
            );
            INSERT OR IGNORE INTO note_categories(name) VALUES
                ('Personal'),('Ideas'),('Development'),('Smart Beton'),('Projects'),
                ('Tutorials'),('Important'),('Troubleshooting'),('Reference'),('Miscellaneous');
            ALTER TABLE sessions ADD COLUMN unfinished TEXT NOT NULL DEFAULT '';
            ALTER TABLE sessions ADD COLUMN problems TEXT NOT NULL DEFAULT '';
            ALTER TABLE sessions ADD COLUMN started_at TEXT;
            ALTER TABLE sessions ADD COLUMN ended_at TEXT;
            ALTER TABLE sessions ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE sessions ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1));
            PRAGMA user_version=13;",
        )
        .map_err(|e| e.to_string())?;
    }
    if version < 14 {
        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS vault_entry_details (
                entry_id INTEGER PRIMARY KEY REFERENCES vault_entries(id) ON DELETE CASCADE,
                kind TEXT NOT NULL DEFAULT 'website' CHECK(kind IN ('website','anydesk','server','database','api_token','secure_note','custom')),
                category TEXT NOT NULL DEFAULT '',
                website_url TEXT NOT NULL DEFAULT '',
                device_alias TEXT NOT NULL DEFAULT '',
                anydesk_address TEXT NOT NULL DEFAULT '',
                hostname TEXT NOT NULL DEFAULT '',
                port INTEGER,
                auth_type TEXT NOT NULL DEFAULT 'password',
                ssh_key_ref TEXT NOT NULL DEFAULT '',
                database_type TEXT NOT NULL DEFAULT '',
                database_name TEXT NOT NULL DEFAULT '',
                service_name TEXT NOT NULL DEFAULT '',
                account_label TEXT NOT NULL DEFAULT '',
                expiry_date TEXT,
                description TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1)),
                project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS secure_note_blobs (
                entry_id INTEGER PRIMARY KEY REFERENCES vault_entries(id) ON DELETE CASCADE,
                ciphertext BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS vault_journal (
                id INTEGER PRIMARY KEY,
                op TEXT NOT NULL,
                entry_id INTEGER,
                secret_ref TEXT NOT NULL,
                old_secret_ref TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            PRAGMA user_version=14;",
        )
        .map_err(|e| e.to_string())?;
    }
    if version < 15 {
        tx.execute_batch(
            "CREATE TABLE connections_new (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('ssh','rdp','web','anydesk','database','local_service','other')),
                address TEXT NOT NULL,
                port INTEGER,
                username TEXT NOT NULL DEFAULT '',
                project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                environment TEXT NOT NULL DEFAULT 'development',
                description TEXT NOT NULL DEFAULT '',
                website_url TEXT NOT NULL DEFAULT '',
                credential_id INTEGER REFERENCES vault_entries(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO connections_new(id,name,kind,address,port,username,project_id)
                SELECT id,name,kind,address,port,username,project_id FROM connections;
            DROP TABLE connections;
            ALTER TABLE connections_new RENAME TO connections;
            CREATE INDEX IF NOT EXISTS connections_project ON connections(project_id);
            ALTER TABLE commands ADD COLUMN description TEXT NOT NULL DEFAULT '';
            ALTER TABLE commands ADD COLUMN working_directory TEXT NOT NULL DEFAULT '';
            ALTER TABLE commands ADD COLUMN category TEXT NOT NULL DEFAULT 'development';
            ALTER TABLE commands ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'development' CHECK(risk_level IN ('read_only','development','sensitive'));
            ALTER TABLE commands ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1));
            CREATE TABLE IF NOT EXISTS tool_configurations (
                id INTEGER PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                tool_type TEXT NOT NULL DEFAULT 'editor',
                executable_path TEXT NOT NULL DEFAULT '',
                launch_mode TEXT NOT NULL DEFAULT 'gui',
                is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE automations ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual';
            ALTER TABLE automations ADD COLUMN shortcut TEXT NOT NULL DEFAULT '';
            ALTER TABLE automations ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1));
            ALTER TABLE automation_actions RENAME TO automation_actions_v12;
            CREATE TABLE automation_actions (
                automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('open_project','open_folder','open_url','open_app','open_terminal','open_in_editor','show_notes','create_note','create_task','run_command','start_session','end_session')),
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                title TEXT NOT NULL DEFAULT '',
                PRIMARY KEY(automation_id,position)
            );
            INSERT INTO automation_actions SELECT * FROM automation_actions_v12;
            DROP TABLE automation_actions_v12;
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY,
                action_type TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id INTEGER,
                project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                summary TEXT NOT NULL,
                occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS activity_log_occurred ON activity_log(occurred_at DESC);
            PRAGMA user_version=15;",
        )
        .map_err(|e| e.to_string())?;
    }
    if version < 16 {
        tx.execute_batch(
            "ALTER TABLE projects ADD COLUMN ai_harness TEXT NOT NULL DEFAULT 'claude' CHECK(ai_harness IN ('claude','codex','antigravity'));
            ALTER TABLE projects ADD COLUMN git_state TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN last_commit_at TEXT;
            ALTER TABLE projects ADD COLUMN last_commit_hash TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN last_commit_subject TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN git_branch TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN git_dirty INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE projects ADD COLUMN git_remote TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN git_checked_at TEXT;
            ALTER TABLE projects ADD COLUMN project_root_id INTEGER REFERENCES project_roots(id) ON DELETE SET NULL;
            ALTER TABLE project_workspace_profiles ADD COLUMN ai_harness TEXT NOT NULL DEFAULT '';
            ALTER TABLE automations ADD COLUMN schedule_time TEXT NOT NULL DEFAULT '';
            ALTER TABLE automations ADD COLUMN schedule_days TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7';
            CREATE TABLE IF NOT EXISTS connection_projects (
                connection_id INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                PRIMARY KEY(connection_id, project_id)
            );
            CREATE INDEX IF NOT EXISTS connection_projects_project ON connection_projects(project_id);
            CREATE TABLE IF NOT EXISTS ignored_projects (path TEXT PRIMARY KEY, ignored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            INSERT OR IGNORE INTO connection_projects(connection_id, project_id) SELECT id, project_id FROM connections WHERE project_id IS NOT NULL;
            PRAGMA user_version=16;",
        )
        .map_err(|e| e.to_string())?;
    }
    if version < 17 {
        tx.execute_batch(
            "ALTER TABLE automations ADD COLUMN schedule_kind TEXT NOT NULL DEFAULT 'weekly' CHECK(schedule_kind IN ('daily','weekly','monthly'));
            ALTER TABLE automations ADD COLUMN schedule_month_day INTEGER NOT NULL DEFAULT 1 CHECK(schedule_month_day BETWEEN 1 AND 31);
            PRAGMA user_version=17;",
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn write_backup(db: &Connection, destination: &Path) -> Result<(), String> {
    // Claim a new file atomically: an existing backup must never be overwritten.
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|e| format!("Cannot create backup: {e}"))?;
    drop(file);
    let result = db
        .execute("VACUUM INTO ?1", [destination.to_string_lossy().as_ref()])
        .map_err(|e| e.to_string());
    if result.is_err() {
        // Remove empty placeholder file on failure so an invalid 0-byte file is never left behind.
        let _ = std::fs::remove_file(destination);
    }
    result.map(|_| ())
}

fn validate_backup_file(backup_path: &Path) -> Result<i64, String> {
    if !backup_path.is_file() {
        return Err("Selected backup file does not exist".into());
    }
    let meta = std::fs::metadata(backup_path).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        return Err("Selected backup file is empty".into());
    }
    let conn = Connection::open_with_flags(backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Could not open backup database: {e}"))?;
    let integrity: String = conn
        .pragma_query_value(None, "integrity_check", |r| r.get(0))
        .map_err(|_| "File is not a valid SQLite database".to_string())?;
    if !integrity.eq_ignore_ascii_case("ok") {
        return Err(format!("Backup failed SQLite integrity check: {integrity}"));
    }
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version < 1 || version > SCHEMA_VERSION {
        return Err(format!(
            "Unsupported backup schema version {version} (expected 1..={SCHEMA_VERSION})"
        ));
    }
    for required_table in ["items", "projects"] {
        let exists: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                [required_table],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            return Err(format!(
                "Backup is missing required table '{required_table}'"
            ));
        }
    }
    Ok(version)
}

pub fn restore_database_from_file(
    active_db_path: &Path,
    backup_path: &Path,
) -> Result<PathBuf, String> {
    let _guard = RESTORE_LOCK
        .lock()
        .map_err(|_| "Database restore lock is unavailable")?;

    let canonical_backup = backup_path
        .canonicalize()
        .map_err(|e| format!("Backup file is unavailable: {e}"))?;
    if let Ok(canonical_active) = active_db_path.canonicalize() {
        if canonical_active == canonical_backup {
            return Err("Cannot restore the active database file onto itself".into());
        }
    }

    // 1. Validate source backup integrity and schema version before touching anything.
    validate_backup_file(&canonical_backup)?;

    let parent_dir = active_db_path
        .parent()
        .ok_or("Active database has no parent directory")?;
    std::fs::create_dir_all(parent_dir).map_err(|e| e.to_string())?;

    // 2. Stage and migrate a temporary copy first to verify migration and foreign keys cleanly.
    let staging_path = parent_dir.join(format!(
        "restore-staging-{}.sqlite3",
        uuid::Uuid::new_v4()
    ));
    std::fs::copy(&canonical_backup, &staging_path)
        .map_err(|e| format!("Failed to stage backup for verification: {e}"))?;

    let stage_check = (|| -> Result<(), String> {
        let stage_conn = Connection::open(&staging_path).map_err(|e| e.to_string())?;
        migrate(&stage_conn)?;
        let fk_errors: i64 = stage_conn
            .prepare("PRAGMA foreign_key_check")
            .map_err(|e| e.to_string())?
            .query_map([], |_| Ok(1))
            .map_err(|e| e.to_string())?
            .count() as i64;
        if fk_errors > 0 {
            return Err("Backup contains broken foreign key references".into());
        }
        Ok(())
    })();

    if let Err(err) = stage_check {
        let _ = std::fs::remove_file(&staging_path);
        return Err(err);
    }

    // 3. Open active database and create a mandatory pre-restore safety snapshot.
    let active_conn = Connection::open(active_db_path).map_err(|e| e.to_string())?;
    migrate(&active_conn)?;
    let safety_path = parent_dir.join(format!(
        "pre-restore-safety-{}.sqlite3",
        uuid::Uuid::new_v4()
    ));
    if let Err(e) = write_backup(&active_conn, &safety_path) {
        let _ = std::fs::remove_file(&staging_path);
        return Err(format!(
            "Aborted restore because pre-restore safety backup could not be created: {e}"
        ));
    }

    // 4. Copy all tables from validated staging DB into active DB under an EXCLUSIVE transaction.
    let restore_res = (|| -> Result<(), String> {
        active_conn
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        active_conn
            .execute_batch("PRAGMA foreign_keys=OFF;")
            .map_err(|e| e.to_string())?;
        active_conn
            .execute(
                "ATTACH DATABASE ?1 AS restore_src",
                [staging_path.to_string_lossy().as_ref()],
            )
            .map_err(|e| format!("Could not attach staged backup: {e}"))?;

        let tx_res = (|| -> Result<(), String> {
            let tx = rusqlite::Transaction::new_unchecked(
                &active_conn,
                rusqlite::TransactionBehavior::Exclusive,
            )
            .map_err(|e| e.to_string())?;

            let tables: Vec<String> = {
                let mut stmt = tx
                    .prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map([], |r| r.get(0))
                    .map_err(|e| e.to_string())?;
                rows.collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?
            };

            for table in &tables {
                tx.execute(&format!("DELETE FROM main.\"{table}\""), [])
                    .map_err(|e| format!("Failed clearing {table}: {e}"))?;
                let src_exists: i64 = tx
                    .query_row(
                        "SELECT count(*) FROM restore_src.sqlite_master WHERE type='table' AND name=?1",
                        [table],
                        |r| r.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                if src_exists > 0 {
                    tx.execute(
                        &format!("INSERT INTO main.\"{table}\" SELECT * FROM restore_src.\"{table}\""),
                        [],
                    )
                    .map_err(|e| format!("Failed restoring {table}: {e}"))?;
                }
            }

            tx.commit().map_err(|e| e.to_string())
        })();

        let _ = active_conn.execute_batch("DETACH DATABASE restore_src; PRAGMA foreign_keys=ON;");
        tx_res
    })();

    let _ = std::fs::remove_file(&staging_path);

    if let Err(err) = restore_res {
        return Err(format!(
            "Restore failed and was rolled back ({err}). Safety backup is at {}",
            safety_path.display()
        ));
    }

    Ok(safety_path)
}

#[derive(Serialize, Deserialize)]
#[allow(dead_code)]
pub struct NonSecretExport {
    pub format: String,
    pub schema_version: i64,
    pub exported_at: String,
    pub projects: Vec<serde_json::Value>,
    pub items: Vec<serde_json::Value>,
    pub connections: Vec<serde_json::Value>,
    pub commands: Vec<serde_json::Value>,
    pub automations: Vec<serde_json::Value>,
    pub sessions: Vec<serde_json::Value>,
}

pub fn record_activity(
    db: &Connection,
    action_type: &str,
    entity_type: &str,
    entity_id: Option<i64>,
    project_id: Option<i64>,
    summary: &str,
) {
    let _ = db.execute(
        "INSERT INTO activity_log(action_type,entity_type,entity_id,project_id,summary) VALUES(?1,?2,?3,?4,?5)",
        params![action_type, entity_type, entity_id, project_id, summary],
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_validates_upgrades_and_creates_pre_restore_safety_backup() {
        let dir = std::env::temp_dir().join(format!("smart-beton-restore-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let active_path = dir.join("dashboard.sqlite3");
        let backup_path = dir.join("old-backup.sqlite3");
        let invalid_path = dir.join("not-sqlite.sqlite3");

        // Create active DB with current data
        {
            let active = Connection::open(&active_path).unwrap();
            migrate(&active).unwrap();
            active
                .execute(
                    "INSERT INTO items(kind,title) VALUES('note','Current active note')",
                    [],
                )
                .unwrap();
        }

        // Create a version-1 backup DB to verify automatic migration during restore
        {
            let old = Connection::open(&backup_path).unwrap();
            old.execute_batch(
                "CREATE TABLE items (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
                 CREATE TABLE projects (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
                 INSERT INTO items(kind,title) VALUES('note','Restored from v1 backup');
                 PRAGMA user_version=1;",
            )
            .unwrap();
        }

        // Reject invalid non-SQLite file without corrupting active DB
        std::fs::write(&invalid_path, b"not a valid sqlite file").unwrap();
        assert!(restore_database_from_file(&active_path, &invalid_path).is_err());

        // Reject restoring active DB onto itself
        assert!(restore_database_from_file(&active_path, &active_path).is_err());

        // Perform valid restore
        let safety_path = restore_database_from_file(&active_path, &backup_path).unwrap();
        assert!(safety_path.exists());

        // Verify active DB now has the restored data at SCHEMA_VERSION
        let active = Connection::open(&active_path).unwrap();
        let title: String = active
            .query_row("SELECT title FROM items", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "Restored from v1 backup");

        // Verify safety backup preserved the pre-restore data
        let safety = Connection::open(&safety_path).unwrap();
        let old_title: String = safety
            .query_row("SELECT title FROM items", [], |r| r.get(0))
            .unwrap();
        assert_eq!(old_title, "Current active note");

        drop(active);
        drop(safety);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
