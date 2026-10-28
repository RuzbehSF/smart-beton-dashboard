//! Read-only Git facts about a project folder (branch, last commit, uncommitted changes, remote).
//! Only the `git` program is run, with fixed arguments, a time limit and settings that stop a repository's own configuration
//! from launching helper programs. Nothing is ever written to a repository.
use crate::platform;
use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct GitInfo {
    /// "git" (repository read), "none" (no .git folder), "unavailable" (Git is not installed) or "error" (Git could not read it).
    pub state: String,
    pub last_commit_at: Option<String>,
    pub last_commit_hash: String,
    pub last_commit_subject: String,
    pub branch: String,
    pub dirty: i64,
    pub remote: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CommitSummary { pub hash: String, pub subject: String, pub author: String, pub date: String }

pub fn git_executable() -> Option<PathBuf> {
    platform::detect_standard_tool_path("git").or_else(|| platform::find_in_path(&["git.exe"]))
}

fn run_git(git: &Path, dir: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new(git);
    command.args(["-c", "core.fsmonitor=false", "--no-optional-locks", "-C"]).arg(dir).args(args)
        .env("GIT_TERMINAL_PROMPT", "0").stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x0800_0000); }
    let mut child = command.spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || { let mut bytes = Vec::new(); let _ = stdout.read_to_end(&mut bytes); bytes });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => { let bytes = reader.join().ok()?; return if status.success() { Some(String::from_utf8_lossy(&bytes).into_owned()) } else { None }; }
            Ok(None) => {
                if started.elapsed() > Duration::from_secs(10) { let _ = child.kill(); let _ = child.wait(); return None; }
                std::thread::sleep(Duration::from_millis(15));
            }
            Err(_) => return None,
        }
    }
}

/// Removes any user name or password embedded in a remote address before it is stored or shown.
pub fn sanitize_remote(remote: &str) -> String {
    let remote = remote.trim();
    if let Ok(mut url) = url::Url::parse(remote) {
        if url.scheme() == "http" || url.scheme() == "https" || url.scheme() == "ssh" {
            let _ = url.set_username(""); let _ = url.set_password(None);
            return url.to_string();
        }
    }
    remote.to_string()
}

/// Web address of the repository for http(s) remotes and the common `git@host:path` form.
pub fn web_url(remote: &str) -> Option<String> {
    let remote = remote.trim().trim_end_matches('/');
    let trimmed = remote.strip_suffix(".git").unwrap_or(remote);
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") { return Some(trimmed.to_string()); }
    let rest = trimmed.strip_prefix("git@")?;
    let (host, path) = rest.split_once(':')?;
    if host.is_empty() || path.is_empty() || path.starts_with('/') { return None; }
    Some(format!("https://{host}/{path}"))
}

pub fn read_git_info(project: &Path) -> GitInfo {
    if !project.join(".git").exists() { return GitInfo { state: "none".into(), ..Default::default() }; }
    let Some(git) = git_executable() else { return GitInfo { state: "unavailable".into(), ..Default::default() }; };
    if run_git(&git, project, &["rev-parse", "--is-inside-work-tree"]).map(|s| s.trim() == "true") != Some(true) {
        return GitInfo { state: "error".into(), ..Default::default() };
    }
    let mut info = GitInfo { state: "git".into(), ..Default::default() };
    if let Some(log) = run_git(&git, project, &["log", "-1", "--format=%cI%x1f%h%x1f%s"]) {
        let mut parts = log.trim_end().splitn(3, '\u{1f}');
        info.last_commit_at = parts.next().filter(|s| !s.is_empty()).map(str::to_string);
        info.last_commit_hash = parts.next().unwrap_or("").to_string();
        info.last_commit_subject = parts.next().unwrap_or("").chars().take(200).collect();
    }
    info.branch = run_git(&git, project, &["symbolic-ref", "--short", "-q", "HEAD"]).map(|s| s.trim().to_string())
        .or_else(|| run_git(&git, project, &["rev-parse", "--short", "HEAD"]).map(|s| format!("detached at {}", s.trim()))).unwrap_or_default();
    info.dirty = run_git(&git, project, &["status", "--porcelain", "-uno"]).map(|s| s.lines().count() as i64).unwrap_or(0);
    info.remote = run_git(&git, project, &["config", "--get", "remote.origin.url"]).map(|s| sanitize_remote(&s)).unwrap_or_default();
    info
}

pub fn recent_commits(project: &Path, count: usize) -> Result<Vec<CommitSummary>, String> {
    if !project.join(".git").exists() { return Err("This folder is not a Git repository".into()); }
    let git = git_executable().ok_or("Git was not found. Install Git for Windows to see repository details.")?;
    let limit = format!("-n{}", count.clamp(1, 50));
    let out = run_git(&git, project, &["log", &limit, "--format=%h%x1f%an%x1f%cI%x1f%s"]).ok_or("Git could not read the commit history")?;
    Ok(out.lines().filter_map(|line| {
        let mut p = line.splitn(4, '\u{1f}');
        Some(CommitSummary { hash: p.next()?.to_string(), author: p.next()?.to_string(), date: p.next()?.to_string(), subject: p.next()?.chars().take(200).collect() })
    }).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_addresses_lose_embedded_credentials() {
        assert_eq!(sanitize_remote("https://user:token@example.com/org/repo.git"), "https://example.com/org/repo.git");
        assert_eq!(sanitize_remote("git@example.com:org/repo.git"), "git@example.com:org/repo.git");
    }
    #[test]
    fn repository_web_addresses_are_derived_safely() {
        assert_eq!(web_url("https://example.com/org/repo.git").as_deref(), Some("https://example.com/org/repo"));
        assert_eq!(web_url("git@example.com:org/repo.git").as_deref(), Some("https://example.com/org/repo"));
        assert_eq!(web_url("file:///C:/repo"), None);
        assert_eq!(web_url("git@example.com:/abs"), None);
    }
    #[test]
    fn folders_without_git_are_reported_as_such() {
        let dir = std::env::temp_dir().join(format!("smart-beton-git-none-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir); std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(read_git_info(&dir).state, "none");
        assert!(recent_commits(&dir, 5).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn a_real_repository_reports_its_last_commit() {
        let Some(git) = git_executable() else { return };
        let dir = std::env::temp_dir().join(format!("smart-beton-git-real-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir); std::fs::create_dir_all(&dir).unwrap();
        let run = |args: &[&str]| Command::new(&git).args(["-c", "user.name=Test", "-c", "user.email=test@example.com", "-C"]).arg(&dir).args(args).output().unwrap();
        run(&["init", "-q"]); std::fs::write(dir.join("a.txt"), "x").unwrap(); run(&["add", "."]); run(&["commit", "-q", "-m", "First commit"]);
        let info = read_git_info(&dir);
        assert_eq!(info.state, "git");
        assert_eq!(info.last_commit_subject, "First commit");
        assert!(info.last_commit_at.is_some());
        assert_eq!(recent_commits(&dir, 5).unwrap().len(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
