//! Scheduled automations: daily, weekly (chosen weekdays) or monthly (a day of the month), at a set time.
//! While the app runs (it can stay in the tray) a timer checks every 20 seconds. Nothing runs silently: the window comes
//! forward and the usual review dialog asks for confirmation. An occurrence is offered once. If the app was closed at the
//! scheduled time, the most recent missed occurrence is offered once when the app next runs ("catch up"), within a limit.
use crate::{database, settings};
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

/// A scheduled time counts as "on time" for this many minutes after it passes (for example after waking from sleep).
const GRACE_MINUTES: i64 = 120;
static PENDING: Mutex<Vec<i64>> = Mutex::new(Vec::new());

#[derive(Clone, Copy, Debug)]
pub struct Schedule<'a> { pub kind: &'a str, pub time_min: u32, pub days: &'a str, pub month_day: u32 }

fn minutes(text: &str) -> Option<u32> {
    let (h, m) = text.trim().split_once(':')?;
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    if h < 24 && m < 60 { Some(h * 60 + m) } else { None }
}
pub fn valid_time(text: &str) -> bool { text.len() == 5 && minutes(text).is_some() }
pub fn valid_days(text: &str) -> bool {
    let days: Vec<u32> = text.split(',').filter_map(|d| d.trim().parse().ok()).collect();
    !days.is_empty() && days.len() == text.split(',').count() && days.iter().all(|d| (1..=7).contains(d))
}
pub fn valid_month_day(day: i64) -> bool { (1..=31).contains(&day) }

// ---- calendar arithmetic on day numbers (days since 1970-01-01), so no date library is needed
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * ((m + 9) % 12) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + if m <= 2 { 1 } else { 0 }, m, d)
}
fn days_in_month(y: i64, m: i64) -> i64 { days_from_civil(if m == 12 { y + 1 } else { y }, if m == 12 { 1 } else { m + 1 }, 1) - days_from_civil(y, m, 1) }
/// 1 = Monday ... 7 = Sunday.
fn weekday_iso(days: i64) -> u32 { ((days + 3).rem_euclid(7) + 1) as u32 }
pub fn parse_date(text: &str) -> Option<i64> {
    let mut parts = text.trim().split('-');
    let (y, m, d): (i64, i64, i64) = (parts.next()?.parse().ok()?, parts.next()?.parse().ok()?, parts.next()?.parse().ok()?);
    if parts.next().is_some() || !(1..=12).contains(&m) || d < 1 || d > days_in_month(y, m) { return None; }
    Some(days_from_civil(y, m, d))
}
pub fn format_date(days: i64) -> String { let (y, m, d) = civil_from_days(days); format!("{y:04}-{m:02}-{d:02}") }

fn fires_on(day: i64, s: &Schedule) -> bool {
    match s.kind {
        "daily" => true,
        "weekly" => s.days.split(',').any(|d| d.trim().parse::<u32>().ok() == Some(weekday_iso(day))),
        // A month that is shorter than the chosen day uses its last day.
        "monthly" => { let (y, m, d) = civil_from_days(day); d == (s.month_day as i64).min(days_in_month(y, m)) }
        _ => false,
    }
}

/// The most recent day (today or earlier) on which the schedule fired, ignoring today if its time has not come yet.
pub fn latest_occurrence(today: i64, now_min: u32, s: &Schedule) -> Option<i64> {
    (0..=62).map(|back| today - back).find(|&day| fires_on(day, s) && (day < today || s.time_min <= now_min))
}

#[derive(Debug, PartialEq)]
pub enum Offer { Nothing, Due, Missed }

fn catch_up_days(kind: &str) -> i64 { if kind == "monthly" { 35 } else { 7 } }

pub fn decide(today: i64, now_min: u32, s: &Schedule, last_offered: Option<i64>, catch_up: bool) -> Offer {
    let Some(occurrence) = latest_occurrence(today, now_min, s) else { return Offer::Nothing };
    if last_offered.map_or(false, |last| last >= occurrence) { return Offer::Nothing; }
    let late_minutes = (today - occurrence) * 1440 + now_min as i64 - s.time_min as i64;
    if late_minutes <= GRACE_MINUTES { Offer::Due }
    else if catch_up && today - occurrence <= catch_up_days(s.kind) { Offer::Missed }
    else { Offer::Nothing }
}

fn now_local(db: &Connection) -> Result<(i64, u32), String> {
    let (date, hm): (String, String) = db.query_row("SELECT strftime('%Y-%m-%d','now','localtime'), strftime('%H:%M','now','localtime')", [], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
    Ok((parse_date(&date).ok_or("Could not read the date")?, minutes(&hm).ok_or("Could not read the time")?))
}

fn last_key(id: i64) -> String { format!("automation_last_run_{id}") }

/// After a schedule is saved, earlier occurrences are treated as handled so only future ones are offered.
pub fn reset_baseline(db: &Connection, id: i64) -> Result<(), String> {
    let row: Option<(String, String, String, String, i64)> = db.query_row("SELECT trigger_type,schedule_kind,schedule_time,schedule_days,schedule_month_day FROM automations WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))).optional().map_err(|e| e.to_string())?;
    let key = last_key(id);
    let Some((trigger, kind, time, days, month_day)) = row else { return Ok(()) };
    if trigger != "scheduled" { db.execute("DELETE FROM settings WHERE key=?1", [&key]).map_err(|e| e.to_string())?; return Ok(()); }
    let (today, now_min) = now_local(db)?;
    let schedule = Schedule { kind: &kind, time_min: minutes(&time).unwrap_or(0), days: &days, month_day: month_day.clamp(1, 31) as u32 };
    match latest_occurrence(today, now_min, &schedule) {
        Some(day) => { db.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, format_date(day)]).map_err(|e| e.to_string())?; }
        None => { db.execute("DELETE FROM settings WHERE key=?1", [&key]).map_err(|e| e.to_string())?; }
    }
    Ok(())
}

/// Puts an automation in the queue the window reads from and brings the window forward.
pub fn offer(app: &tauri::AppHandle, id: i64) {
    if let Ok(mut queue) = PENDING.lock() { if !queue.contains(&id) { queue.push(id); } }
    settings::show_main(app);
    let _ = app.emit("run-automation", id.to_string());
}

/// The automations waiting for review (a window that was still loading when they were offered picks them up here).
#[tauri::command]
pub fn take_automation_offers() -> Vec<i64> { PENDING.lock().map(|mut queue| std::mem::take(&mut *queue)).unwrap_or_default() }

fn catch_up_enabled(db: &Connection) -> bool {
    db.query_row("SELECT value FROM settings WHERE key='automation_catch_up'", [], |r| r.get::<_, String>(0)).optional().ok().flatten().map(|v| v != "false").unwrap_or(true)
}

fn tick(app: &tauri::AppHandle) -> Result<(), String> {
    let db = database(app)?;
    let (today, now_min) = now_local(&db)?;
    let catch_up = catch_up_enabled(&db);
    let rows: Vec<(i64, String, String, String, String, i64)> = {
        let mut stmt = db.prepare("SELECT id,name,schedule_kind,schedule_time,schedule_days,schedule_month_day FROM automations WHERE trigger_type='scheduled' AND enabled=1").map_err(|e| e.to_string())?;
        let found = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))).map_err(|e| e.to_string())?;
        found.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    for (id, name, kind, time, days, month_day) in rows {
        let Some(time_min) = minutes(&time) else { continue };
        let schedule = Schedule { kind: &kind, time_min, days: &days, month_day: month_day.clamp(1, 31) as u32 };
        let last: Option<String> = db.query_row("SELECT value FROM settings WHERE key=?1", [last_key(id)], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        let verdict = decide(today, now_min, &schedule, last.as_deref().and_then(parse_date), catch_up);
        if verdict == Offer::Nothing { continue; }
        if let Some(occurrence) = latest_occurrence(today, now_min, &schedule) {
            db.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![last_key(id), format_date(occurrence)]).map_err(|e| e.to_string())?;
        }
        offer(app, id);
        let text = if verdict == Offer::Missed { format!("{name} was scheduled while the app was closed. Review it when you are ready.") } else { format!("{name} is scheduled for now.") };
        let _ = settings::notify_user(app.clone(), "automations".into(), "Automation ready to review".into(), text);
    }
    Ok(())
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(6)); // let the window finish loading before the first offer
        loop { let _ = tick(&app); std::thread::sleep(Duration::from_secs(20)); }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn day(text: &str) -> i64 { parse_date(text).unwrap() }
    fn sched<'a>(kind: &'a str, time: &str, days: &'a str, month_day: u32) -> Schedule<'a> { Schedule { kind, time_min: minutes(time).unwrap(), days, month_day } }

    #[test]
    fn calendar_arithmetic_matches_known_dates() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(format_date(day("2024-02-29")), "2024-02-29");
        assert_eq!(parse_date("2025-02-29"), None);
        assert_eq!(days_in_month(2026, 2), 28);
        assert_eq!(days_in_month(2028, 2), 29);
        assert_eq!(weekday_iso(day("2026-10-29")), 4); // Thursday
        assert_eq!(weekday_iso(day("2026-11-01")), 7); // Sunday
        assert_eq!(format_date(day("2026-12-31") + 1), "2027-01-01");
    }
    #[test]
    fn daily_and_weekly_schedules_fire_on_the_right_days() {
        let weekly = sched("weekly", "09:00", "1,3", 1); // Monday and Wednesday
        assert!(fires_on(day("2026-10-26"), &weekly) && fires_on(day("2026-10-28"), &weekly));
        assert!(!fires_on(day("2026-10-27"), &weekly));
        assert!(fires_on(day("2026-10-27"), &sched("daily", "09:00", "", 1)));
    }
    #[test]
    fn monthly_schedules_fall_back_to_the_last_day_of_short_months() {
        let monthly = sched("monthly", "08:00", "", 31);
        assert!(fires_on(day("2026-10-31"), &monthly));
        assert!(fires_on(day("2026-11-30"), &monthly));
        assert!(!fires_on(day("2026-11-29"), &monthly));
        assert!(fires_on(day("2027-02-28"), &monthly));
        assert!(fires_on(day("2028-02-29"), &sched("monthly", "08:00", "", 30)));
        assert!(fires_on(day("2026-10-15"), &sched("monthly", "08:00", "", 15)));
    }
    #[test]
    fn an_occurrence_is_due_on_time_and_never_offered_twice() {
        let s = sched("daily", "09:00", "", 1);
        let today = day("2026-10-27");
        assert_eq!(decide(today, 8 * 60 + 59, &s, Some(today - 1), true), Offer::Nothing); // not yet
        assert_eq!(decide(today, 9 * 60, &s, Some(today - 1), true), Offer::Due);
        assert_eq!(decide(today, 10 * 60 + 30, &s, Some(today - 1), true), Offer::Due);
        assert_eq!(decide(today, 10 * 60 + 30, &s, Some(today), true), Offer::Nothing); // already offered
    }
    #[test]
    fn missed_occurrences_are_offered_once_within_the_limit() {
        let s = sched("daily", "09:00", "", 1);
        let today = day("2026-10-27");
        assert_eq!(decide(today, 14 * 60, &s, Some(today - 1), true), Offer::Missed); // app started late today
        assert_eq!(decide(today, 14 * 60, &s, Some(today - 1), false), Offer::Nothing); // catch-up switched off
        assert_eq!(decide(today, 7 * 60, &s, Some(today - 4), true), Offer::Missed); // yesterday's run was missed
        assert_eq!(decide(today, 7 * 60, &s, Some(today - 20), true), Offer::Missed); // still only one offer
        let monday = sched("weekly", "09:00", "1", 1);
        assert_eq!(decide(day("2026-10-29"), 12 * 60, &monday, Some(day("2026-10-19")), true), Offer::Missed); // Monday 26th
        assert_eq!(decide(day("2026-11-05"), 7 * 60, &monday, Some(day("2026-10-19")), true), Offer::Missed);
        assert_eq!(decide(day("2026-11-20"), 12 * 60, &monday, Some(day("2026-10-19")), true), Offer::Missed); // Monday 16th
        let monthly = sched("monthly", "09:00", "", 1);
        assert_eq!(decide(day("2026-11-20"), 12 * 60, &monthly, Some(day("2026-10-01")), true), Offer::Missed); // 1 Nov, 19 days ago
        assert_eq!(decide(day("2026-12-20"), 12 * 60, &monthly, Some(day("2026-10-01")), true), Offer::Missed); // 1 Dec, still inside 35 days
        assert_eq!(decide(day("2027-01-20"), 12 * 60, &monthly, Some(day("2026-12-01")), true), Offer::Missed);
        assert_eq!(decide(day("2026-12-30"), 12 * 60, &sched("weekly", "09:00", "1", 1), Some(day("2026-10-19")), true), Offer::Missed);
    }
    #[test]
    fn a_schedule_without_days_never_fires_and_late_starts_are_missed() {
        let s = sched("daily", "09:00", "", 1);
        let today = day("2026-10-27");
        // The latest occurrence is always recent for a daily schedule, so use a weekly one that fired long ago.
        let weekly = sched("weekly", "09:00", "1", 1);
        assert_eq!(latest_occurrence(today, 12 * 60, &weekly), Some(day("2026-10-26")));
        assert!(latest_occurrence(today, 12 * 60, &sched("weekly", "09:00", "", 1)).is_none());
        assert_eq!(decide(today, 12 * 60, &s, None, true), Offer::Missed);
    }
    #[test]
    fn time_and_day_text_is_validated() {
        assert!(valid_time("07:30") && valid_time("23:59"));
        assert!(!valid_time("24:00") && !valid_time("7:30") && !valid_time("07:60") && !valid_time(""));
        assert!(valid_days("1,3,7") && !valid_days("") && !valid_days("0,1") && !valid_days("1,x"));
        assert!(valid_month_day(1) && valid_month_day(31) && !valid_month_day(0) && !valid_month_day(32));
    }
}
