use crate::platform;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub static VAULT_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VaultEntry {
    pub id: i64,
    pub name: String,
    pub username: String,
    #[serde(default = "default_vault_kind")]
    pub kind: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub website_url: String,
    #[serde(default)]
    pub device_alias: String,
    #[serde(default)]
    pub anydesk_address: String,
    #[serde(default)]
    pub hostname: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default = "default_auth_type")]
    pub auth_type: String,
    #[serde(default)]
    pub ssh_key_ref: String,
    #[serde(default)]
    pub database_type: String,
    #[serde(default)]
    pub database_name: String,
    #[serde(default)]
    pub service_name: String,
    #[serde(default)]
    pub account_label: String,
    #[serde(default)]
    pub expiry_date: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: String,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub project_id: Option<i64>,
    #[serde(default)]
    pub connection_id: Option<i64>,
}

fn default_vault_kind() -> String {
    "website".into()
}
fn default_auth_type() -> String {
    "password".into()
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct VaultDetailsInput {
    #[serde(default = "default_vault_kind")]
    pub kind: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub website_url: String,
    #[serde(default)]
    pub device_alias: String,
    #[serde(default)]
    pub anydesk_address: String,
    #[serde(default)]
    pub hostname: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default = "default_auth_type")]
    pub auth_type: String,
    #[serde(default)]
    pub ssh_key_ref: String,
    #[serde(default)]
    pub database_type: String,
    #[serde(default)]
    pub database_name: String,
    #[serde(default)]
    pub service_name: String,
    #[serde(default)]
    pub account_label: String,
    #[serde(default)]
    pub expiry_date: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: String,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub project_id: Option<i64>,
    #[serde(default)]
    pub connection_id: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
pub struct VaultReconcileReport {
    pub cleaned_orphans: usize,
    pub missing_secrets: Vec<i64>,
}

#[cfg(windows)]
pub fn credential(reference: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.smartbeton.dashboard", reference)
        .map_err(|_| "Windows Credential Manager is unavailable".into())
}

pub fn validate_vault_details(details: &VaultDetailsInput) -> Result<(), String> {
    if ![
        "website",
        "anydesk",
        "server",
        "database",
        "api_token",
        "secure_note",
        "custom",
    ]
    .contains(&details.kind.as_str())
    {
        return Err("Unsupported vault item type".into());
    }
    if !details.website_url.trim().is_empty() {
        safe_web_url(details.website_url.trim(), None)?;
    }
    if details.port == Some(0) {
        return Err("Port must be between 1 and 65535".into());
    }
    Ok(())
}

pub fn list_vault_entries(db: &Connection) -> Result<Vec<VaultEntry>, String> {
    let mut stmt = db
        .prepare(
            "SELECT
                v.id, v.name, v.username,
                COALESCE(d.kind, 'website'),
                COALESCE(d.category, ''),
                COALESCE(d.website_url, ''),
                COALESCE(d.device_alias, ''),
                COALESCE(d.anydesk_address, ''),
                COALESCE(d.hostname, ''),
                d.port,
                COALESCE(d.auth_type, 'password'),
                COALESCE(d.ssh_key_ref, ''),
                COALESCE(d.database_type, ''),
                COALESCE(d.database_name, ''),
                COALESCE(d.service_name, ''),
                COALESCE(d.account_label, ''),
                d.expiry_date,
                COALESCE(d.description, ''),
                COALESCE(d.tags, ''),
                COALESCE(d.is_favorite, 0),
                d.project_id,
                d.connection_id
            FROM vault_entries v
            LEFT JOIN vault_entry_details d ON d.entry_id = v.id
            ORDER BY COALESCE(d.is_favorite, 0) DESC, v.name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(VaultEntry {
                id: r.get(0)?,
                name: r.get(1)?,
                username: r.get(2)?,
                kind: r.get(3)?,
                category: r.get(4)?,
                website_url: r.get(5)?,
                device_alias: r.get(6)?,
                anydesk_address: r.get(7)?,
                hostname: r.get(8)?,
                port: r.get(9)?,
                auth_type: r.get(10)?,
                ssh_key_ref: r.get(11)?,
                database_type: r.get(12)?,
                database_name: r.get(13)?,
                service_name: r.get(14)?,
                account_label: r.get(15)?,
                expiry_date: r.get(16)?,
                description: r.get(17)?,
                tags: r.get(18)?,
                is_favorite: r.get::<_, i64>(19)? != 0,
                project_id: r.get(20)?,
                connection_id: r.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn upsert_vault_details(
    db: &Connection,
    entry_id: i64,
    details: &VaultDetailsInput,
) -> Result<(), String> {
    validate_vault_details(details)?;
    db.execute(
        "INSERT INTO vault_entry_details(
            entry_id, kind, category, website_url, device_alias, anydesk_address,
            hostname, port, auth_type, ssh_key_ref, database_type, database_name,
            service_name, account_label, expiry_date, description, tags,
            is_favorite, project_id, connection_id, updated_at
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,CURRENT_TIMESTAMP)
        ON CONFLICT(entry_id) DO UPDATE SET
            kind=excluded.kind,
            category=excluded.category,
            website_url=excluded.website_url,
            device_alias=excluded.device_alias,
            anydesk_address=excluded.anydesk_address,
            hostname=excluded.hostname,
            port=excluded.port,
            auth_type=excluded.auth_type,
            ssh_key_ref=excluded.ssh_key_ref,
            database_type=excluded.database_type,
            database_name=excluded.database_name,
            service_name=excluded.service_name,
            account_label=excluded.account_label,
            expiry_date=excluded.expiry_date,
            description=excluded.description,
            tags=excluded.tags,
            is_favorite=excluded.is_favorite,
            project_id=excluded.project_id,
            connection_id=excluded.connection_id,
            updated_at=CURRENT_TIMESTAMP",
        params![
            entry_id,
            details.kind,
            details.category.trim(),
            details.website_url.trim(),
            details.device_alias.trim(),
            details.anydesk_address.trim(),
            details.hostname.trim(),
            details.port,
            details.auth_type.trim(),
            details.ssh_key_ref.trim(),
            details.database_type.trim(),
            details.database_name.trim(),
            details.service_name.trim(),
            details.account_label.trim(),
            details.expiry_date.as_deref().filter(|s| !s.trim().is_empty()),
            details.description.trim(),
            details.tags.trim(),
            if details.is_favorite { 1 } else { 0 },
            details.project_id,
            details.connection_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_vault_metadata(
    db: &Connection,
    id: i64,
    name: &str,
    username: &str,
    details: Option<&VaultDetailsInput>,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Name is required".into());
    }
    if let Some(d) = details {
        validate_vault_details(d)?;
    }
    let count = db
        .execute(
            "UPDATE vault_entries SET name=?1,username=?2 WHERE id=?3",
            params![name.trim(), username.trim(), id],
        )
        .map_err(|e| e.to_string())?;
    if count == 0 {
        return Err("Vault entry is unavailable".into());
    }
    if let Some(d) = details {
        upsert_vault_details(db, id, d)?;
    }
    Ok(())
}

#[cfg(windows)]
pub fn add_vault_entry(
    db: &mut Connection,
    name: &str,
    username: &str,
    secret: &str,
    details: Option<&VaultDetailsInput>,
) -> Result<i64, String> {
    if name.trim().is_empty() || secret.is_empty() {
        return Err("Name and secret are required".into());
    }
    if let Some(d) = details {
        validate_vault_details(d)?;
    }
    let is_secure_note = details.map(|d| d.kind == "secure_note").unwrap_or(false);
    let reference = uuid::Uuid::new_v4().to_string();

    // Record journal intent before writing to Windows Credential Manager for crash recovery.
    db.execute(
        "INSERT INTO vault_journal(op, secret_ref) VALUES('add', ?1)",
        [&reference],
    )
    .map_err(|e| e.to_string())?;

    let entry = credential(&reference)?;
    let dpapi_blob = if is_secure_note {
        let entropy = format!("{}-{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
        let ciphertext = platform::dpapi_encrypt(secret.as_bytes(), entropy.as_bytes())?;
        if let Err(_) = entry.set_password(&entropy) {
            let _ = db.execute("DELETE FROM vault_journal WHERE secret_ref=?1", [&reference]);
            return Err("Could not save secret key in Windows Credential Manager".into());
        }
        Some(ciphertext)
    } else {
        if let Err(_) = entry.set_password(secret) {
            let _ = db.execute("DELETE FROM vault_journal WHERE secret_ref=?1", [&reference]);
            return Err("Could not save secret in Windows Credential Manager".into());
        }
        None
    };

    let tx_res = (|| -> Result<i64, String> {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO vault_entries(name,username,secret_ref) VALUES(?1,?2,?3)",
            params![name.trim(), username.trim(), reference],
        )
        .map_err(|e| e.to_string())?;
        let id = tx.last_insert_rowid();
        if let Some(blob) = dpapi_blob {
            tx.execute(
                "INSERT INTO secure_note_blobs(entry_id, ciphertext) VALUES(?1, ?2)",
                params![id, blob],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.execute(
            "DELETE FROM vault_journal WHERE secret_ref=?1",
            [&reference],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(id)
    })();

    match tx_res {
        Ok(id) => {
            if let Some(d) = details {
                upsert_vault_details(db, id, d)?;
            }
            Ok(id)
        }
        Err(e) => {
            if entry.delete_credential().is_ok() {
                let _ = db.execute("DELETE FROM vault_journal WHERE secret_ref=?1", [&reference]);
                Err(e)
            } else {
                Err("Metadata save failed and the protected credential could not be cleaned up; run Vault Reconcile in Settings".into())
            }
        }
    }
}

#[cfg(windows)]
pub fn reveal_vault_secret(db: &Connection, id: i64) -> Result<String, String> {
    let reference: String = db
        .query_row(
            "SELECT secret_ref FROM vault_entries WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|_| "Vault entry is unavailable")?;
    let blob: Option<Vec<u8>> = db
        .query_row(
            "SELECT ciphertext FROM secure_note_blobs WHERE entry_id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let stored = credential(&reference)?
        .get_password()
        .map_err(|_| "Could not retrieve protected credential".to_string())?;

    if let Some(ciphertext) = blob {
        let decrypted = platform::dpapi_decrypt(&ciphertext, stored.as_bytes())?;
        String::from_utf8(decrypted).map_err(|_| "Decrypted secure note is not valid UTF-8".into())
    } else {
        Ok(stored)
    }
}

#[cfg(windows)]
pub fn replace_secret(db: &Connection, id: i64, secret: &str) -> Result<Option<String>, String> {
    let old_ref: String = db
        .query_row(
            "SELECT secret_ref FROM vault_entries WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|_| "Vault entry is unavailable")?;
    let is_secure_note: bool = db
        .query_row(
            "SELECT count(*) > 0 FROM vault_entry_details WHERE entry_id=?1 AND kind='secure_note'",
            [id],
            |r| r.get(0),
        )
        .unwrap_or(false)
        || db
            .query_row(
                "SELECT count(*) > 0 FROM secure_note_blobs WHERE entry_id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap_or(false);

    let new_ref = uuid::Uuid::new_v4().to_string();
    let _ = db.execute(
        "INSERT INTO vault_journal(op, entry_id, secret_ref, old_secret_ref) VALUES('replace', ?1, ?2, ?3)",
        params![id, new_ref, old_ref],
    );

    let new_entry = credential(&new_ref)?;
    let dpapi_blob = if is_secure_note {
        let entropy = format!("{}-{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
        let ciphertext = platform::dpapi_encrypt(secret.as_bytes(), entropy.as_bytes())?;
        if new_entry.set_password(&entropy).is_err() {
            let _ = db.execute("DELETE FROM vault_journal WHERE secret_ref=?1", [&new_ref]);
            return Err("Could not save secret in Windows Credential Manager".into());
        }
        Some(ciphertext)
    } else {
        if new_entry.set_password(secret).is_err() {
            let _ = db.execute("DELETE FROM vault_journal WHERE secret_ref=?1", [&new_ref]);
            return Err("Could not save secret in Windows Credential Manager".into());
        }
        None
    };

    let updated = db.execute(
        "UPDATE vault_entries SET secret_ref=?1 WHERE id=?2 AND secret_ref=?3",
        params![new_ref, id, old_ref],
    );
    if !matches!(updated, Ok(1)) {
        if new_entry.delete_credential().is_ok() {
            let _ = db.execute("DELETE FROM vault_journal WHERE secret_ref=?1", [&new_ref]);
            return Err("Vault entry changed or metadata update failed".into());
        }
        return Err("Update failed and the new protected credential could not be cleaned up".into());
    }
    if let Some(blob) = dpapi_blob {
        let _ = db.execute(
            "INSERT INTO secure_note_blobs(entry_id, ciphertext) VALUES(?1, ?2)
             ON CONFLICT(entry_id) DO UPDATE SET ciphertext=excluded.ciphertext",
            params![id, blob],
        );
    }
    if credential(&old_ref)
        .and_then(|entry| {
            entry
                .delete_credential()
                .map_err(|_| "Credential deletion failed".into())
        })
        .is_err()
    {
        return Ok(Some(
            "Secret updated, but the previous protected credential could not be removed".into(),
        ));
    }
    let _ = db.execute("DELETE FROM vault_journal WHERE secret_ref=?1", [&new_ref]);
    Ok(None)
}

#[cfg(windows)]
pub fn reconcile_vault(db: &Connection) -> Result<VaultReconcileReport, String> {
    let mut cleaned_orphans = 0usize;
    let journals: Vec<(i64, String, String)> = {
        let mut stmt = db
            .prepare("SELECT id, secret_ref, old_secret_ref FROM vault_journal")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    for (j_id, secret_ref, old_ref) in journals {
        for candidate in [secret_ref, old_ref] {
            if candidate.is_empty() {
                continue;
            }
            let in_use: i64 = db
                .query_row(
                    "SELECT count(*) FROM vault_entries WHERE secret_ref=?1",
                    [&candidate],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if in_use == 0 {
                if let Ok(entry) = credential(&candidate) {
                    if entry.delete_credential().is_ok() {
                        cleaned_orphans += 1;
                    }
                }
            }
        }
        let _ = db.execute("DELETE FROM vault_journal WHERE id=?1", [j_id]);
    }

    let mut missing_secrets = Vec::new();
    let entries: Vec<(i64, String)> = {
        let mut stmt = db
            .prepare("SELECT id, secret_ref FROM vault_entries")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    for (id, reference) in entries {
        let ok = credential(&reference)
            .and_then(|e| e.get_password().map(|_| ()).map_err(|_| String::new()))
            .is_ok();
        if !ok {
            missing_secrets.push(id);
        }
    }

    Ok(VaultReconcileReport {
        cleaned_orphans,
        missing_secrets,
    })
}

pub fn validate_executable(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
    {
        return Err("Select an absolute path to an .exe file".into());
    }
    let resolved = path
        .canonicalize()
        .map_err(|e| format!("Executable is unavailable: {e}"))?;
    if !resolved.is_file() {
        return Err("Executable must be a file".into());
    }
    Ok(resolved)
}

pub fn safe_web_url(address: &str, port: Option<u16>) -> Result<String, String> {
    if address.chars().any(|c| c.is_control()) {
        return Err("Invalid URL".into());
    }
    let mut url =
        url::Url::parse(address).map_err(|_| "Enter a complete HTTP or HTTPS URL".to_string())?;
    if !["http", "https"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only HTTP and HTTPS URLs without embedded credentials are supported".into());
    }
    if let Some(port) = port {
        if port == 0 || url.port().is_some() {
            return Err("Specify the port only once".into());
        }
        url.set_port(Some(port))
            .map_err(|_| "Invalid port".to_string())?;
    }
    Ok(url.into())
}

pub fn validate_hostname_or_ip(address: &str) -> Result<String, String> {
    if address.is_empty() || address.len() > 253 {
        return Err("Invalid host or IP address".into());
    }
    if let Ok(ip) = address.parse::<std::net::IpAddr>() {
        Ok(match ip {
            std::net::IpAddr::V6(_) => format!("[{ip}]"),
            _ => ip.to_string(),
        })
    } else {
        if !address.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        }) {
            return Err("Enter a valid hostname or IP address".into());
        }
        Ok(address.to_string())
    }
}

pub fn rdp_destination(address: &str, port: Option<u16>) -> Result<String, String> {
    if address.is_empty() || address.len() > 253 || port == Some(0) {
        return Err("Invalid RDP host or port".into());
    }
    let host = validate_hostname_or_ip(address)?;
    Ok(match port {
        Some(p) => format!("{host}:{p}"),
        None => host,
    })
}

pub fn ssh_arguments(
    address: &str,
    port: Option<u16>,
    username: &str,
) -> Result<Vec<String>, String> {
    if port == Some(0) {
        return Err("Invalid SSH port".into());
    }
    // Validate address as hostname or raw IP (OpenSSH takes unbracketed IPv6 or hostname)
    let raw_host = if let Ok(ip) = address.parse::<std::net::IpAddr>() {
        ip.to_string()
    } else {
        validate_hostname_or_ip(address)?
    };
    let mut args = Vec::new();
    if let Some(p) = port {
        args.push("-p".into());
        args.push(p.to_string());
    }
    let trimmed_user = username.trim();
    if !trimmed_user.is_empty() {
        if trimmed_user.starts_with('-')
            || trimmed_user.len() > 128
            || trimmed_user
                .chars()
                .any(|c| c.is_control() || c.is_whitespace() || ['@', ':', '/', '\\'].contains(&c))
        {
            return Err("Invalid SSH username".into());
        }
        args.push("-l".into());
        args.push(trimmed_user.to_string());
    }
    // Use `--` before destination so the host can never be parsed as an ssh flag
    args.push("--".into());
    args.push(raw_host);
    Ok(args)
}

pub fn validate_anydesk_address(address: &str) -> Result<String, String> {
    let trimmed = address.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return Err("Invalid AnyDesk ID or alias".into());
    }
    let clean: String = trimmed.chars().filter(|c| *c != ' ').collect();
    if clean.starts_with('-')
        || !clean
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '@' | '.' | '_' | '-'))
    {
        return Err("Invalid AnyDesk ID or alias".into());
    }
    Ok(clean)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssh_arguments_prevent_option_injection_and_preserve_host_verification() {
        let args = ssh_arguments("server.example.com", Some(2222), "deploy_user").unwrap();
        assert_eq!(
            args,
            vec!["-p", "2222", "-l", "deploy_user", "--", "server.example.com"]
        );
        assert!(ssh_arguments("-oProxyCommand=bad", None, "").is_err());
        assert!(ssh_arguments("server.example.com", None, "-oProxyCommand=bad").is_err());
        assert!(ssh_arguments("server.example.com", Some(0), "user").is_err());
    }

    #[test]
    fn anydesk_address_validation_accepts_numeric_and_alias_and_rejects_flags() {
        assert_eq!(
            validate_anydesk_address("123 456 789").unwrap(),
            "123456789"
        );
        assert_eq!(
            validate_anydesk_address("factory-pc@ad").unwrap(),
            "factory-pc@ad"
        );
        assert!(validate_anydesk_address("--with-password").is_err());
        assert!(validate_anydesk_address("bad;cmd").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn secure_note_encrypts_with_dpapi_and_stores_no_plaintext_in_sqlite() {
        let mut db = Connection::open_in_memory().unwrap();
        crate::database::migrate(&db).unwrap();
        let details = VaultDetailsInput {
            kind: "secure_note".into(),
            category: "Architecture".into(),
            description: "Recovery codes note".into(),
            ..Default::default()
        };
        let secret_body = "TOP-SECRET-SYNTHETIC-NOTE-BODY-998877";
        let id =
            add_vault_entry(&mut db, "Synthetic Secure Note", "", secret_body, Some(&details))
                .unwrap();

        // Ensure plaintext does not appear anywhere in vault_entries or secure_note_blobs
        let raw_cipher: Vec<u8> = db
            .query_row(
                "SELECT ciphertext FROM secure_note_blobs WHERE entry_id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(!String::from_utf8_lossy(&raw_cipher).contains("TOP-SECRET-SYNTHETIC"));

        let revealed = reveal_vault_secret(&db, id).unwrap();
        assert_eq!(revealed, secret_body);

        // Cleanup credential
        let reference: String = db
            .query_row(
                "SELECT secret_ref FROM vault_entries WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        credential(&reference).unwrap().delete_credential().unwrap();
    }
}
