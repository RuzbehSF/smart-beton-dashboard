# User guide

This version is not complete; see `IMPLEMENTATION_STATUS.md` for features and limitations. Do not store real credentials in the experimental vault until it has been security tested.

**Projects.** Choose a folder and scan it, review the discovered projects, then import them. The root folder is never guessed. To open a project in VS Code, select a trusted executable in Settings and confirm it.

**Notes and tasks.** Create, edit, search, link to a project, move to trash and restore. Permanent deletion asks for confirmation. Tasks have priority, due date and filters. Goals on the dashboard are tasks flagged as goals; tasks can be pinned from their menu.

**Sessions.** Use the Sessions button on a project to save a summary and the next action.

**Servers and connections.** Store non-secret details only. Web, SSH, Remote Desktop and AnyDesk entries open after confirmation; no password is ever passed.

**Commands and automations.** Save a trusted executable with separate arguments for a project; every run asks for confirmation and output is limited to 64 KiB. Automations run reviewed steps in order and do not roll back.

**Search and shortcuts.** Ctrl+K opens search and navigation, Ctrl+Shift+N quick-captures a note while the window is focused, and Ctrl+Alt+K / Ctrl+Alt+N work globally.

**Settings.** Choose light, dark or follow-Windows theme, set your display name, create or restore a backup. Backups are unencrypted and do not contain vault secrets.

**Settings.** Change shortcuts under Shortcuts (use at least one modifier, for example Ctrl+Alt+K). Start with Windows and keep-in-tray are under General. Notifications can be switched off per type. Vault lock time and clipboard clearing are under Security.

**Vault.** Choose the credential type when adding; each type has its own fields. Use New secure note for private text. Copy and reveal are explicit actions; nothing is revealed automatically.

**Servers.** Set the environment for each connection; production entries are marked and add a warning to confirmations. Test connection only checks that the port answers.

**Commands and automations.** Mark commands read only, development or sensitive. Automations can run on a keyboard shortcut: the window opens with the review and you confirm before anything runs.

**Schedules.** An automation can repeat every day, every week on chosen days, or every month on a chosen day, at a set time. When the time comes the window opens with the review; nothing runs until you confirm. If the app was closed, the most recent missed run is offered once when you start it (you can switch this off in Settings). The app must be running, for example in the tray.

**Full screen.** Use the button at the top right or press F11.

**Window size.** The interface fits the window automatically, so you should not need to scroll on a full HD screen, even with Windows display scaling at 125% or 150%. Settings > Appearance > Interface size can switch it to actual size.
