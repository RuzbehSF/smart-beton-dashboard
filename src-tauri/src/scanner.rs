use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

const EXCLUDED: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    ".venv",
    "venv",
    ".next",
    "coverage",
    ".cache",
];
const MARKERS: &[&str] = &[
    ".git",
    "package.json",
    "pnpm-workspace.yaml",
    "Cargo.toml",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
    "composer.json",
    "pom.xml",
    "build.gradle",
    "Dockerfile",
    "compose.yaml",
    "docker-compose.yml",
];

static CANCEL_SCAN: AtomicBool = AtomicBool::new(false);

pub fn request_cancel_scan() {
    CANCEL_SCAN.store(true, Ordering::SeqCst);
}

pub fn reset_cancel_scan() {
    CANCEL_SCAN.store(false, Ordering::SeqCst);
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct DiscoveredProject {
    pub path: String,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub has_git: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ScanReport {
    pub projects: Vec<DiscoveredProject>,
    pub warnings: Vec<String>,
    pub cancelled: bool,
}

fn tag_for_marker(name: &str) -> Option<&'static str> {
    if name.eq_ignore_ascii_case(".git") {
        Some("Git")
    } else if name.eq_ignore_ascii_case("package.json")
        || name.eq_ignore_ascii_case("pnpm-workspace.yaml")
    {
        Some("Node.js")
    } else if name.eq_ignore_ascii_case("Cargo.toml") {
        Some("Rust")
    } else if name.eq_ignore_ascii_case("pyproject.toml")
        || name.eq_ignore_ascii_case("requirements.txt")
    {
        Some("Python")
    } else if name.eq_ignore_ascii_case("go.mod") {
        Some("Go")
    } else if name.eq_ignore_ascii_case("composer.json") {
        Some("PHP")
    } else if name.eq_ignore_ascii_case("pom.xml") || name.eq_ignore_ascii_case("build.gradle") {
        Some("Java")
    } else if name.eq_ignore_ascii_case("Dockerfile")
        || name.eq_ignore_ascii_case("compose.yaml")
        || name.eq_ignore_ascii_case("docker-compose.yml")
    {
        Some("Docker")
    } else if name.ends_with(".sln") || name.ends_with(".csproj") {
        Some(".NET")
    } else {
        None
    }
}

pub fn scan_with_options(
    root: &Path,
    extra_exclusions: &[String],
    nested: bool,
) -> Result<(Vec<PathBuf>, ScanReport), String> {
    if !root.is_dir() {
        return Err("The selected root is not a directory".into());
    }
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut pending = vec![(root.clone(), 0usize)];
    let mut found_paths = Vec::new();
    let mut found_projects = Vec::new();
    let mut warnings = Vec::new();
    let mut visited = 0usize;

    while let Some((dir, depth)) = pending.pop() {
        if CANCEL_SCAN.load(Ordering::SeqCst) {
            return Ok((
                found_paths,
                ScanReport {
                    projects: found_projects,
                    warnings,
                    cancelled: true,
                },
            ));
        }
        visited += 1;
        if visited > 10_000 {
            return Err("Scan stopped after 10,000 directories; choose a smaller root".into());
        }
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(e) => {
                if depth == 0 {
                    return Err(format!("Cannot read {}: {e}", dir.display()));
                }
                if warnings.len() < 25 {
                    warnings.push(format!("Skipped unreadable directory {}: {e}", dir.display()));
                }
                continue;
            }
        };

        let mut is_project = false;
        let mut has_git = false;
        let mut tags = Vec::new();
        let mut children: Vec<PathBuf> = Vec::new();
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(e) => {
                    if warnings.len() < 25 {
                        warnings.push(format!("Skipped unreadable entry in {}: {e}", dir.display()));
                    }
                    continue;
                }
            };
            let name_os = entry.file_name();
            let name = name_os.to_string_lossy();
            if MARKERS.iter().any(|m| name.eq_ignore_ascii_case(m))
                || name.ends_with(".sln")
                || name.ends_with(".csproj")
            {
                is_project = true;
                if name.eq_ignore_ascii_case(".git") { has_git = true; }
                if let Some(tag) = tag_for_marker(&name) {
                    if !tags.iter().any(|t| t == tag) {
                        tags.push(tag.to_string());
                    }
                }
            }
            // Hidden folders (.next-dev, .cache, .idea ...) hold tool output, never projects.
            let is_excluded = name.starts_with('.') || EXCLUDED.iter().any(|x| name.eq_ignore_ascii_case(x))
                || extra_exclusions
                    .iter()
                    .any(|x| !x.trim().is_empty() && name.eq_ignore_ascii_case(x.trim()));
            if depth >= 6 || is_excluded {
                continue;
            }
            let meta = match std::fs::symlink_metadata(entry.path()) {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            #[cfg(windows)]
            let is_link = {
                use std::os::windows::fs::MetadataExt;
                meta.file_attributes() & 0x400 != 0
            };
            #[cfg(not(windows))]
            let is_link = meta.file_type().is_symlink();
            if meta.is_dir() && !is_link {
                children.push(entry.path());
            }
        }
        // A project folder is one project: its own subfolders (front end, back end, src-tauri...) are not listed separately
        // unless nested projects were requested.
        if nested || !is_project {
            for child in children { pending.push((child, depth + 1)); }
        }
        if is_project {
            let folder_name = dir
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| dir.to_string_lossy().into_owned());
            found_projects.push(DiscoveredProject {
                path: dir.to_string_lossy().into_owned(),
                name: folder_name,
                tags,
                has_git,
            });
            found_paths.push(dir);
        }
    }
    found_paths.sort();
    found_projects.sort_by(|a, b| a.path.cmp(&b.path));
    Ok((
        found_paths,
        ScanReport {
            projects: found_projects,
            warnings,
            cancelled: false,
        },
    ))
}

pub fn scan(root: &Path) -> Result<Vec<PathBuf>, String> {
    reset_cancel_scan();
    scan_with_options(root, &[], false).map(|(paths, _)| paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovers_nested_projects_and_skips_excluded_directories() {
        let root = std::env::temp_dir().join(format!("smart-beton-scan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("app")).unwrap();
        std::fs::create_dir_all(root.join("node_modules/ignored")).unwrap();
        std::fs::write(root.join("app/package.json"), "{}").unwrap();
        std::fs::write(root.join("node_modules/ignored/Cargo.toml"), "").unwrap();
        let result = scan(&root).unwrap();
        assert_eq!(result, vec![root.join("app").canonicalize().unwrap()]);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn custom_exclusions_and_technology_tags_are_detected() {
        let root =
            std::env::temp_dir().join(format!("smart-beton-scan-tags-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("rust-service")).unwrap();
        std::fs::create_dir_all(root.join("custom-skip/nested")).unwrap();
        std::fs::write(root.join("rust-service/Cargo.toml"), "").unwrap();
        std::fs::write(root.join("rust-service/Dockerfile"), "").unwrap();
        std::fs::write(root.join("custom-skip/nested/package.json"), "{}").unwrap();
        let (paths, report) = scan_with_options(&root, &["custom-skip".to_string()], false).unwrap();
        assert_eq!(paths.len(), 1);
        assert_eq!(report.projects.len(), 1);
        assert!(report.projects[0].tags.contains(&"Rust".to_string()));
        assert!(report.projects[0].tags.contains(&"Docker".to_string()));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_project_is_listed_once_without_its_subfolders_or_tool_output() {
        let root = std::env::temp_dir().join(format!("smart-beton-scan-nested-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        for dir in ["panel/backend", "panel/frontend", "panel/.next-dev/inner", "tools/helper", "plain-container/site"] { std::fs::create_dir_all(root.join(dir)).unwrap(); }
        std::fs::create_dir_all(root.join("panel/.git")).unwrap();
        for file in ["panel/backend/package.json", "panel/frontend/package.json", "panel/.next-dev/package.json", "panel/.next-dev/inner/package.json", "plain-container/site/package.json"] { std::fs::write(root.join(file), "{}").unwrap(); }
        std::fs::write(root.join("tools/helper/Cargo.toml"), "").unwrap();
        let names = |nested: bool| { let mut n: Vec<String> = scan_with_options(&root, &[], nested).unwrap().1.projects.iter().map(|p| p.name.clone()).collect(); n.sort(); n };
        assert_eq!(names(false), vec!["helper", "panel", "site"]);
        assert_eq!(names(true), vec!["backend", "frontend", "helper", "panel", "site"]);
        let (_, report) = scan_with_options(&root, &[], false).unwrap();
        assert!(report.projects.iter().find(|p| p.name == "panel").unwrap().has_git);
        std::fs::remove_dir_all(root).unwrap();
    }

    /// Developer utility: `SMART_BETON_SCAN_ROOT=A:\SmartBeton cargo test --release scan_a_real_folder -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn scan_a_real_folder() {
        let Some(root) = std::env::var_os("SMART_BETON_SCAN_ROOT") else { return };
        let (_, report) = scan_with_options(Path::new(&root), &[], false).unwrap();
        for p in &report.projects { println!("{:<40} git={:<5} {}", p.name, p.has_git, p.tags.join(", ")); }
        println!("{} projects, {} warnings", report.projects.len(), report.warnings.len());
    }
}
