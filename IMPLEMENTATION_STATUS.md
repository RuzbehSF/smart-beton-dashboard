# Implementation status

The product is incomplete and is not ready for use with real credentials.

## Implemented in source

- Tauri 2, React, TypeScript, SQLite skeleton and reference-inspired shell using the supplied company logo.
- Basic task and note create, list, edit, completion, category, tags, project links, search, trash, restore and confirmed permanent deletion; notes can be filtered by category, tag and project; tasks also have priority, due date, and status/priority/project/overdue filters; dashboard counts use active records. Version 12 migration is atomic and serialized across concurrent connections; tests cover existing version 1 data, simultaneous first-open and rollback on failure.
- Added native folder picker and bounded project scanner, review and import in source, plus opening registered project folders in Explorer. Successful launch requests record last-opened time for the recent-project list. The scanner excludes common build folders and Windows reparse points, and limits depth and directory count. Import re-scans and validates selected paths. The full native integration remains unverified.
- Weekly task activity records creation and completion actions from this version onward, with a chart and accessible counts; earlier events are not reconstructed.
- Connection metadata can be created, edited, deleted and linked to a project. It is stored unencrypted. HTTP/HTTPS web panels can be opened with confirmation. RDP launching has been added in source but is unbuilt and untested; SSH, AnyDesk and credential associations remain unimplemented.
- A user-approved VS Code executable can be configured and launched with a project path as a separate argument. Native launching remains unverified.
- Experimental Windows Credential Manager vault supports add, metadata editing, secret replacement, reveal, hide and delete, with a non-authenticating view lock. Only metadata and opaque references are in SQLite; secret backups, copying, stronger authentication, and full security review remain. Synthetic native round-trip passed with Windows account access but fails in the restricted sandbox. Do not rely on it for real credentials yet.
- Manual automations support ordered create-note, create-task, open-project-folder and HTTP/HTTPS URL actions, review, reordering, cancellation between actions and error reporting; prior actions are not rolled back. Other action types and triggers remain pending.
- Saved commands support executable selection, structured arguments, project association, search, edit, delete and explicit confirmation before launch. Common shells are denied but arbitrary approved executables remain powerful; output and exit status are tracked in memory, with a combined 64 KiB output cap. Desktop execution has not been verified end to end.
- Project sessions save, edit and delete summaries and next actions; settings include an unencrypted SQLite snapshot to a new file. Backup restore is not implemented.
- Light, dark and follow-Windows theme choices persist in WebView local storage; theme changes are followed while the app runs. The product is English only (Persian support was removed at the user's request).
- Source now includes tray menu and global Ctrl+Alt+K / Ctrl+Alt+N shortcuts with conflict warnings; these changes have not been built or tested. Closing the main window still exits normally.
- Search and navigation palette covers sections, projects, notes and tasks (Ctrl+K); Ctrl+Shift+N opens quick capture while the app is focused. UI tests mock native commands. Rust tests cover scanning and migration.

## Latest session (not yet re-verified end to end)

- `database.rs`, `security.rs` and `platform.rs` are now compiled into the app. Schema is version 15 (the v15 connections rebuild no longer breaks foreign keys). Backup restore (`restore_database`) validates the file, tests it on a staged copy and saves a safety copy first; Settings has a Restore button.
- Vault commands now use `security.rs`: vault details, DPAPI secure notes, journal and `vault_reconcile`, plus `vault_copy_secret` (clipboard cleared after 30 s only if unchanged). The Vault page has a Copy secret button; type-specific forms are still missing in the UI.
- SSH and AnyDesk launching added (confirmation, validated arguments, no passwords). Command cancellation (`cancel_command`) has a UI button. System binaries (Explorer, mstsc, ssh) resolve from the Windows directory.
- UI restyled with a translucent glass look (`src/glass.css`) closer to the reference. Visual comparison is still pending.
- At the user's request, builds and tests are deferred to the end. Rust tests (27) passed once mid-session after the wiring; frontend tests and the new UI changes have not been run.

## Dashboard and onboarding session (built; desktop behavior unverified)

- The product is now English only; Persian strings, the language switch and RTL handling were removed (the original spec file still contains Persian requirements).
- New `Dashboard.tsx` follows the reference layout with real data: overall card (done tasks, projects, open, completed, notes, servers), weekly activity, task progress ring, goals (tasks flagged `is_goal`, added/completed/removed from the card), floating task cards with pin/edit/trash menu and an Add task card, dark recent-project cards with quick launch, recent notes. Month progress is overall completion because tasks have no completion timestamps yet.
- Header has Create, search, notifications (overdue tasks), theme toggle and a profile button; the sidebar is grouped (Workspace, Infrastructure, Productivity, Settings at the bottom) and collapsible. Display name is stored in SQLite settings.
- New `Onboarding.tsx`: welcome, appearance and display name, projects folder scan and import, developer tool detection (VS Code can be selected), notes/vault explanation, finish. Completion is stored as `onboarding_done`; Settings can rerun it. Imported roots are saved in `project_roots`.
- New backend commands: `save_goal`, `toggle_pin`, `get_setting`, `set_setting` (whitelisted keys), `detect_tools`.
- Frontend tests were updated only where Persian was removed; new dashboard behavior has no tests yet.

## Notes, tasks and polish session (built; desktop behavior unverified)

- Notes page is a three-pane layout: collections (all, idea inbox, pinned, favorites, archived, trash), categories (create, rename, delete; notes move to the inbox), tags and project filters; a list with search and sort; and an editor with Markdown edit/split/preview, autosave (800 ms, Ctrl+S, saves before switching notes), templates, pin, favorite, archive, duplicate, copy, convert to task, trash and restore. Markdown is rendered to React elements (no HTML injection); links open in the default browser through the backend. No syntax highlighting, and tags stay a comma-separated field rather than a separate table.
- Tasks page has views (all, today, upcoming, overdue, in progress, completed, by project, board), search and filters, statuses (inbox, to do, in progress, blocked, done) with a drag-and-drop board plus a status menu, pinning, goals shown with a marker, and per-task checklists. Reminders and notifications are not implemented.
- Backend: `save_item` now returns the item id and stamps `updated_at`; new commands `set_item_flag`, `duplicate_item`, `convert_note_to_task`, `set_task_status`, `set_subtasks`, category CRUD and `open_external_url`. Completing a task keeps its status in sync.
- Action words that used to look like underlined links are now real buttons across the app. Light animations (page rise-in, dialog pop, hover lift, drag highlight) were added and are disabled for reduced-motion users.
- The older generic notes/tasks list in `App.tsx` was replaced; its unused filter state remains and the edit dialog is still used for tasks and quick capture. Existing UI tests that targeted the old list will need updating.

## Project detail and browser-preview fix (built; desktop behavior unverified)

- **`npm run dev` error fixed:** "Cannot read properties of undefined (reading 'invoke')" came from opening the app in a plain browser, where Tauri's bridge does not exist. All backend and dialog calls now go through `src/native.ts`: inside the desktop app they call the real commands; in a browser, notes, tasks, goals and categories work from an in-memory preview (nothing is saved, a banner says so) and every other action shows "needs the desktop app". Use `npm run tauri dev` for the full app.
- Projects page (`Projects.tsx`): grid/list, search, status filter, sort, favorites and archived collections, manual project creation with the native folder picker, and folder scan/import (technology tags are now saved from detected markers).
- Project detail (`ProjectDetail.tsx`): overview (description, preferred tool, last session, next action, open tasks), notes, tasks, servers, credentials (names only, with link/unlink), commands, activity and sessions tabs; edit, favorite, archive and remove (files on disk are never touched); open folder, VS Code, Claude Code, Codex, Antigravity, terminal, copy path, open website; start/end session with the four end-of-session questions and duration.
- Backend (`projects.rs`): create/update project, favorite/archive flags, sessions (start, end, list), activity, `continue_info` for the new "Continue where you left off" dashboard card, tool launching, tool path settings (Settings > Developer tools), connection/vault linking. Claude Code and Codex start in their own console with the project as working directory; the terminal uses Windows Terminal (`wt -d`) or a new console. Antigravity receives the folder as its only argument, which is unverified. Paths no longer carry the `\?\` prefix when passed to tools.
- Not done: Git repository details, workspace profiles, project root management, per-project bookmarks, and notes/tasks linked many-to-many (a note or task has one project).

## Settings, vault, servers, commands and automation session

- **Settings page** (`Settings.tsx`, `settings.rs`): general (display name, start with Windows via the per-user Run key, keep running in the tray), appearance (theme, density, motion), configurable global shortcuts (command palette, quick note, open dashboard; invalid or taken shortcuts are rejected and the old value is restored), notifications (task counts, backups, automations; counts only, never titles or secrets), developer tool paths, security (credential backend status, vault lock minutes, clipboard clearing seconds, vault consistency check, clear sensitive state), data (database path and schema version, backup, restore) and About.
- **Desktop integration:** single instance (a second launch focuses the running window), tray menu plus left-click to open, optional minimize to tray on close, shortcut registration at startup, running commands are stopped when the app exits.
- **Vault:** seven credential types (website, AnyDesk, server, database, API token, secure note, custom) with their own fields, categories, tags, favorites, project and server links, search over metadata only, filters, copy username/password/AnyDesk ID, open website. Secure note text goes through the DPAPI-protected path; "Edit text" reloads it for replacement.
- **Servers:** environments (local, development, testing, staging, production), related website, linked credential, notes, search and filters by project, environment and type, copy address/username, connection instructions, optional user-triggered TCP reachability test, and production-flagged confirmations.
- **Commands:** risk level (read only, development, sensitive), category, description, optional subfolder inside the project, favorites, filters, copy command. Sensitive commands ask twice and cannot run from automations.
- **Automations:** actions for tasks, notes, project folder, tool in project, project notes, URL, saved command, start and end session; keyboard-shortcut trigger (it only opens the review dialog), enable/disable, and templates. Ending a session from an automation records a generic summary.
- **Visual pass against the reference:** smooth weekly chart with legend and weekday letters, goal form overflow fixed, translucent glass cards; checked in a 1440x900 browser preview in light and dark themes. It is not a pixel comparison.
- Not done: many-to-many project links for servers, capture-idea shortcut, scheduled automations, signed installer.

## Project folders, Git, AI launcher and scheduling session

- **Project detection fixed:** a project is one folder. Its own subfolders (front end, back end, `src-tauri`) and hidden tool folders such as `.next-dev` are no longer listed as separate projects; "include nested projects" is an option. Checked against the real `A:\SmartBeton`: 10 projects, all Git repositories, no sub-package or build-folder entries.
- **Project folders:** add the folder that holds everything, review what was found (already-added ones are marked), import, rescan ("Find new projects"), per-folder label and skipped folder names, remove a folder (imported projects stay). Deleting a project block (red button) never touches files and hides it from later scans until the ignore list is cleared.
- **Project blocks:** last commit date ("3 days ago · Oct 26, 2026"), branch, uncommitted-change count, tags, path (no `\\?\` prefix), parent folder when two projects share a name; sortable by last commit. Git facts come from the local `git` program (read only, 10 s limit, repository config cannot launch helpers) and are refreshed automatically and on demand.
- **AI launcher:** each block has an AI tool choice (Claude Code, Codex, Antigravity, remembered per project) and one button that opens the folder in VS Code and in that tool. Claude Code and Codex start in their own console in the project folder; npm `.cmd` launchers are supported. Tool paths can be set in Settings.
- **Project page:** Git tab (branch, last commit, remote, recent commits, open repository on the web) and Workspaces tab (saved profiles: folder, VS Code, AI tool, terminal, documentation link, show notes/tasks; templates for development, debugging and deployment preparation; profiles only open things).
- **Servers** can belong to several projects. **Capture idea** shortcut (default Ctrl+Alt+I) opens a note in the Ideas category. **Scheduled automations:** daily time and weekdays, offered while the app runs (up to two hours after the time), at most once per day, always with the usual review before anything runs.
- Schema is now version 16 (adds Git columns, AI tool, project folder link, profile AI tool, schedule columns, server-project links and the ignore list). Not done: weekly or monthly schedules, running missed schedules after the app was closed, Git operations that change a repository (by design).

## Schedules and full-HD layout session

- **Schedules:** scheduled automations repeat every day, every week (chosen weekdays) or every month (a day from 1 to 31; a shorter month uses its last day) at a set time. Each occurrence is offered once, always with the review dialog first. If the app was closed at the time, the most recent missed occurrence is offered once at the next start (daily and weekly within 7 days, monthly within 35 days); Settings can turn this off. Saving a schedule treats earlier occurrences as handled. Offers wait in a queue, so a window that was still loading does not lose them. The timer only runs while the app runs (it can stay in the tray). Schema version 17.
- **Full HD:** the page no longer scrolls. At 1920x1080 every page fits: the dashboard shares the height between three rows, Projects shows 12 blocks in two rows of six, Notes uses three full-height panes, long lists (vault, servers, commands, automations) use several cards per row, and Settings uses three columns. Panels that can still run out of room (very long lists, small windows) scroll inside themselves. Below 1500 px wide the dashboard stacks and scrolls inside. Measured in a 1920x1080 browser view; not yet seen in the desktop window.
- **Full screen:** a button in the header and the F11 key switch the window to full screen; the window also starts maximized.
- **Automatic fit:** the whole interface is scaled to the window (designed for 1600x900 and larger, never above 100%, never below 72%), so a 1080p screen at 125% or 150% Windows scaling (about 1536x864 or 1280x720) still shows every page without scrolling; checked at 1920x1080, 1536x864 and 1280x720. Settings > Appearance > Interface size can switch it to actual size.
- Not done: yearly schedules; a schedule that runs without your confirmation (by design).

## Checks

Latest verified run (this machine, Windows, account access):

- `npx tsc`: no errors. `npm run build`: succeeded.
- `npm test`: 10 domain tests and 42 UI tests (app, vault, markdown) passed. UI tests mock the native commands; they are not proof of desktop behavior.
- `cargo test --release`: 50 passed (one Windows Credential Manager test failed once in about four runs and passed on rerun; it is timing related).
- `npm run tauri build` succeeded: `src-tauri/target/release/smart-beton-dashboard.exe` and `src-tauri/target/release/bundle/nsis/Smart Beton Dashboard_1.0.0_x64-setup.exe` (unsigned). The app has not been launched and the installer has not been run, so tray, global shortcuts, tool launching, sessions, restore and the new pages are still unverified on the desktop.

Older notes below describe earlier runs.

- npm install succeeded outside the restricted network sandbox.
- npm run build succeeded.
- Before the latest RDP, tray and shortcut changes, npm test passed (29 tests) and cargo test --release passed (19 tests) with account access. The restricted sandbox denied Credential Manager access. The latest changes have not been built or tested at the user’s request.
- The Visual C++ linker and Windows SDK are installed. `npm run tauri build` succeeded under vcvars64.bat. Updated outputs: `src-tauri/target-next/release/smart-beton-dashboard.exe` and `src-tauri/target-next/release/bundle/nsis/Smart Beton Dashboard_1.0.0_x64-setup.exe`. The earlier `target/release` artifacts do not include these latest changes. An earlier EXE opened to the dashboard without a visible storage error. The latest build was interrupted at the user’s request; current release artifacts do not contain the latest source changes. Installer execution, database CRUD, native folder-picker integration and editor launching remain unverified.

## Remaining

Other project tools and project management beyond import, task reminders and expanded history, session continuation workflow, vault stronger authentication, secure notes and portable backup, SSH/AnyDesk launching and RDP verification and credential associations, additional automation actions and shortcuts, command risk classification, cancellation and terminal integration, comprehensive global search and palette actions, global shortcut and tray verification, backup restore, complete settings, localization, accessibility, visual comparison, integration and security tests, release packaging, and required documentation remain. The task progress shown is for all tasks, not the requested monthly metric. Weekly activity begins with version 6 and counts completion actions, including repeated completion after reopening a task.

## Next actions

Test project scanning and database persistence inside the desktop application and verify installer startup and uninstall behavior. Implement and test each remaining module, including backup restore and secure credential storage. Do not use notes as a credential store.
