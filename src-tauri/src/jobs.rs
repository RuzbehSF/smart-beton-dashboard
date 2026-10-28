use serde::Serialize;
use std::{
    collections::HashMap,
    io::Read,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
};

const LIMIT: usize = 64 * 1024;

#[derive(Default)]
struct Job {
    output: Vec<u8>,
    truncated: bool,
    finished: bool,
    cancelled: bool,
    exit_code: Option<i32>,
    error: Option<String>,
    child: Option<Arc<Mutex<Child>>>,
}

#[derive(Serialize, Clone)]
pub struct Status {
    pub output: String,
    pub truncated: bool,
    pub finished: bool,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

type Registry = Mutex<HashMap<String, Arc<Mutex<Job>>>>;

fn registry() -> &'static Registry {
    static JOBS: OnceLock<Registry> = OnceLock::new();
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn drain(mut input: impl Read, job: Arc<Mutex<Job>>) {
    let mut buffer = [0u8; 4096];
    loop {
        match input.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                if let Ok(mut j) = job.lock() {
                    let available = LIMIT.saturating_sub(j.output.len());
                    let kept = n.min(available);
                    j.output.extend_from_slice(&buffer[..kept]);
                    if kept < n {
                        j.truncated = true;
                    }
                }
            }
            Err(e) => {
                if let Ok(mut j) = job.lock() {
                    j.error = Some(format!("Output read failed: {e}"));
                }
                break;
            }
        }
    }
}

pub fn start(mut command: Command) -> Result<String, String> {
    let mut map = registry().lock().map_err(|_| "Command monitor unavailable")?;
    if map.len() >= 20 {
        return Err("Too many tracked commands; dismiss completed results first".into());
    }
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| format!("Could not launch command: {e}"))?;
    let out = child.stdout.take().ok_or("Could not capture output")?;
    let err = child.stderr.take().ok_or("Could not capture error output")?;
    let child_arc = Arc::new(Mutex::new(child));
    let id = uuid::Uuid::new_v4().to_string();
    let job = Arc::new(Mutex::new(Job {
        child: Some(child_arc.clone()),
        ..Job::default()
    }));
    map.insert(id.clone(), job.clone());
    drop(map);

    let out_job = job.clone();
    let err_job = job.clone();
    let out_reader = std::thread::spawn(move || drain(out, out_job));
    let err_reader = std::thread::spawn(move || drain(err, err_job));

    std::thread::spawn(move || {
        let wait_result = loop {
            let status_res = if let Ok(mut c) = child_arc.lock() {
                c.try_wait()
            } else {
                break Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "Child lock poisoned",
                ));
            };
            match status_res {
                Ok(Some(status)) => break Ok(status),
                Ok(None) => std::thread::sleep(std::time::Duration::from_millis(25)),
                Err(e) => break Err(e),
            }
        };
        let _ = out_reader.join();
        let _ = err_reader.join();
        if let Ok(mut j) = job.lock() {
            j.child = None;
            match wait_result {
                Ok(status) => {
                    j.exit_code = status.code();
                    if j.cancelled && j.error.is_none() {
                        j.error = Some("Process was cancelled by user.".into());
                    }
                }
                Err(e) => j.error = Some(format!("Could not wait for command: {e}")),
            }
            j.finished = true;
        }
    });
    Ok(id)
}

pub fn cancel(id: &str) -> Result<(), String> {
    let map = registry().lock().map_err(|_| "Command monitor unavailable")?;
    let job_arc = map.get(id).ok_or("Command result is unavailable")?.clone();
    drop(map);
    let child_arc = {
        let mut job = job_arc.lock().map_err(|_| "Command monitor unavailable")?;
        if job.finished {
            return Ok(());
        }
        job.cancelled = true;
        job.child.clone()
    };
    if let Some(c_arc) = child_arc {
        if let Ok(mut child) = c_arc.lock() {
            let _ = child.kill();
        }
    }
    Ok(())
}

pub fn terminate_all() {
    if let Ok(map) = registry().lock() {
        for job_arc in map.values() {
            if let Ok(mut job) = job_arc.lock() {
                if !job.finished {
                    job.cancelled = true;
                    if let Some(ref c_arc) = job.child {
                        if let Ok(mut child) = c_arc.lock() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        }
    }
}

pub fn status(id: &str) -> Result<Status, String> {
    let map = registry().lock().map_err(|_| "Command monitor unavailable")?;
    let job = map
        .get(id)
        .ok_or("Command result is unavailable")?
        .lock()
        .map_err(|_| "Command monitor unavailable")?;
    Ok(Status {
        output: String::from_utf8_lossy(&job.output).into_owned(),
        truncated: job.truncated,
        finished: job.finished,
        exit_code: job.exit_code,
        error: job.error.clone(),
    })
}

pub fn dismiss(id: &str) -> Result<(), String> {
    let mut map = registry().lock().map_err(|_| "Command monitor unavailable")?;
    let job = map.get(id).ok_or("Command result is unavailable")?;
    if !job.lock().map_err(|_| "Command monitor unavailable")?.finished {
        return Err("Command is still running".into());
    }
    map.remove(id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_output_is_drained_and_marked() {
        let job = Arc::new(Mutex::new(Job::default()));
        drain(std::io::Cursor::new(vec![b'x'; LIMIT + 123]), job.clone());
        let result = job.lock().unwrap();
        assert_eq!(result.output.len(), LIMIT);
        assert!(result.truncated);
    }
    #[test]
    fn synthetic_process_reports_output_and_exit() {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.arg("--list");
        let id = start(command).unwrap();
        let start = std::time::Instant::now();
        loop {
            let s = status(&id).unwrap();
            if s.finished {
                assert_eq!(s.exit_code, Some(0));
                assert!(s.output.contains("synthetic_process_reports_output_and_exit"));
                break;
            }
            assert!(start.elapsed() < std::time::Duration::from_secs(10));
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        dismiss(&id).unwrap();
        assert!(status(&id).is_err());
    }
}
