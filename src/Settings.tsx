import React, {useEffect, useState} from 'react';
import {invoke, open, save} from './native';
import {ToolSettings} from './ToolSettings';
import logo from '../design/references/smart-beton-logo.png';

type Theme = 'light'|'dark'|'system';
type Density = 'comfortable'|'compact';
type Motion = 'system'|'reduced';
type AppInfo = {version:string; database_path:string; schema_version:number; credential_backend:string};
type Props = {
  theme:Theme; setTheme:(theme:Theme)=>void; density:Density; setDensity:(d:Density)=>void; motion:Motion; setMotion:(m:Motion)=>void; scale:'fit'|'full'; setScale:(s:'fit'|'full')=>void;
  displayName:string; onSaveName:(name:string)=>Promise<void>; editorPath:string|null; warnings:string[];
  onEditorChanged:()=>void; onRunSetup:()=>void; onChanged:()=>void; onError:(message:string)=>void;
};
const SHORTCUTS: [string, string, string][] = [['shortcut_palette', 'Search and command palette', 'Ctrl+Alt+K'], ['shortcut_quick_note', 'Quick note', 'Ctrl+Alt+N'], ['shortcut_idea', 'Capture idea', 'Ctrl+Alt+I'], ['shortcut_dashboard', 'Open dashboard', 'Ctrl+Alt+D']];
const SECTIONS = ['General', 'Appearance', 'Shortcuts', 'Notifications', 'Developer tools', 'Security', 'Data', 'About'] as const;
type SettingsSection = typeof SECTIONS[number];

export function Settings(p:Props) {
  const [values, setValues] = useState<Record<string, string>>({}), [drafts, setDrafts] = useState<Record<string, string>>({}), [info, setInfo] = useState<AppInfo|null>(null), [message, setMessage] = useState(''), [name, setName] = useState(p.displayName);
  const [section, setSection] = useState<SettingsSection>('General');
  useEffect(() => setName(p.displayName), [p.displayName]);
  async function load(updatedKey?:string) {
    try { const all = await invoke<unknown>('get_settings'); if (all && typeof all === 'object' && !Array.isArray(all)) { const settings = all as Record<string, string>; setValues(settings); setDrafts(previous => updatedKey ? {...settings, ...Object.fromEntries(Object.entries(previous).filter(([key, value]) => key !== updatedKey && value !== (values[key] ?? '')))} : settings); } } catch (e) { p.onError(String(e)); }
    try { const data = await invoke<unknown>('app_info'); if (data && typeof data === 'object' && 'version' in data) setInfo(data as AppInfo); } catch { /* shown as unavailable */ }
  }
  useEffect(() => { load(); }, []);
  async function update(key:string, value:string, done?:string) {
    try { await invoke('update_setting', {key, value}); setMessage(done ?? 'Saved.'); p.onError(''); await load(key); } catch (e) { setMessage(''); p.onError(String(e)); }
  }
  const toggle = (key:string, label:string, help:string) => <label className="toggle-row"><input type="checkbox" checked={values[key] === 'true'} onChange={e => update(key, String(e.target.checked))}/><span><strong>{label}</strong><small>{help}</small></span></label>;

  async function chooseEditor() {
    try {
      const path = await open({multiple: false, filters: [{name: 'Windows executable', extensions: ['exe']}]});
      if (!path) return;
      if (!window.confirm('Allow this executable to be launched for your projects?\n' + path)) return;
      await invoke('configure_editor', {path}); p.onEditorChanged();
    } catch (e) { p.onError(String(e)); }
  }
  async function notify(kind:string, title:string, body:string) { try { await invoke('notify_user', {kind, title, body}); } catch { /* notifications are optional */ } }
  async function makeBackup() {
    try {
      setMessage(''); p.onError('');
      const destination = await save({title: 'Save database backup', defaultPath: 'smart-beton-backup.sqlite', filters: [{name: 'SQLite', extensions: ['sqlite']}]});
      if (!destination) return;
      await invoke('backup_database', {destination});
      setMessage('Backup saved. Store it securely; it contains your notes and project paths.');
      notify('backups', 'Backup saved', 'Your database backup was created.');
    } catch (e) { p.onError(String(e)); notify('backups', 'Backup failed', 'The database backup could not be created.'); }
  }
  async function restoreBackup() {
    try {
      setMessage(''); p.onError('');
      const source = await open({multiple: false, filters: [{name: 'SQLite', extensions: ['sqlite', 'sqlite3']}]});
      if (!source) return;
      if (!window.confirm('Replace all current data with this backup? A safety copy of the current data is saved first.\n' + source)) return;
      const safety = await invoke<string>('restore_database', {source});
      p.onChanged(); setMessage('Backup restored. Safety copy of previous data: ' + safety);
    } catch (e) { p.onError(String(e)); }
  }
  async function reconcile() {
    try { const report = await invoke<{cleaned_orphans:number; missing_secrets:number[]}>('vault_reconcile'); setMessage(`Vault check finished: ${report.cleaned_orphans} leftover credential(s) cleaned, ${report.missing_secrets.length} entr${report.missing_secrets.length === 1 ? 'y' : 'ies'} missing a secret.`); } catch (e) { p.onError(String(e)); }
  }
  function clearSensitive() {
    try { sessionStorage.removeItem('command_job'); } catch { /* storage may be unavailable */ }
    window.dispatchEvent(new Event('sensitive-clear'));
    setMessage('Revealed secrets and command results were cleared from this window. Text you copied earlier stays on the clipboard until it is replaced.');
  }

  return <section className="card collection settings-page">
    <div className="settings-intro"><h2>Settings</h2><p>Make this workspace your own.</p></div>
    {p.warnings.map((warning, i) => <p role="alert" className="error" key={i}>{warning}</p>)}
    {message && <p role="status" className="status-line">{message}</p>}

    <div className="settings-workspace"><nav className="settings-nav" aria-label="Settings sections">{SECTIONS.map(item => <button key={item} className={section === item ? 'active' : ''} aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item}<span aria-hidden="true">›</span></button>)}</nav><div className="settings-content">
    <div className="settings-group" hidden={section !== 'General'}><h3>General</h3>
      <div className="item"><div><strong>Display name</strong><p>Used in the dashboard greeting.</p></div><label>Name<input value={name} maxLength={60} onChange={e => setName(e.target.value)}/></label><button className="link" disabled={name.trim() === p.displayName} onClick={() => p.onSaveName(name)}>Save name</button></div>
      {toggle('start_with_windows', 'Start with Windows', 'Launches the dashboard when you sign in to Windows.')}
      {toggle('minimize_to_tray', 'Keep running in the tray when the window is closed', 'Closing the window hides it; use the tray menu to quit.')}
      {toggle('automation_catch_up', 'Offer missed scheduled automations', 'If the app was closed at the scheduled time, the latest missed run is offered once when it starts. You still review it first.')}
      <div className="item"><div><strong>First-run setup</strong><p>Run the welcome setup again.</p></div><button className="link" onClick={p.onRunSetup}>Run setup</button></div></div>

    <div className="settings-group" hidden={section !== 'Appearance'}><h3>Appearance</h3>
      <div className="item"><div><strong>Appearance</strong><p>Choose the application theme.</p></div><label>Theme<select value={p.theme} onChange={e => p.setTheme(e.target.value as Theme)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Follow Windows</option></select></label></div>
      <div className="item"><div><strong>Interface size</strong><p>Fit shrinks the interface so everything fits a smaller window or a high Windows display scale.</p></div><label>Size<select value={p.scale} onChange={e => p.setScale(e.target.value as 'fit'|'full')}><option value="fit">Fit the window</option><option value="full">Actual size (100%)</option></select></label></div>
      <div className="item"><div><strong>Interface density</strong><p>Compact uses tighter spacing.</p></div><label>Density<select value={p.density} onChange={e => p.setDensity(e.target.value as Density)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label></div>
      <div className="item"><div><strong>Motion</strong><p>Animations are short and subtle.</p></div><label>Motion<select value={p.motion} onChange={e => p.setMotion(e.target.value as Motion)}><option value="system">Follow Windows</option><option value="reduced">Reduce motion</option></select></label></div></div>

    <div className="settings-group" hidden={section !== 'Shortcuts'}><h3>Shortcuts</h3>
      <p className="muted">Global shortcuts work while other programs are in front. Use at least one modifier, for example Ctrl+Alt+K. Automations can also have their own shortcut.</p>
      {SHORTCUTS.map(([key, label, fallback]) => <div className="item" key={key}><div><strong>{label}</strong><p className="muted">Default {fallback}</p></div>
        <label>Shortcut<input dir="ltr" aria-label={`${label} shortcut`} value={drafts[key] ?? ''} onChange={e => setDrafts({...drafts, [key]: e.target.value})}/></label>
        <button className="link" disabled={(drafts[key] ?? '') === (values[key] ?? '')} onClick={() => update(key, drafts[key] ?? '', `${label} shortcut saved.`)}>Save</button>
        <button className="link" disabled={(values[key] ?? '') === fallback} onClick={() => update(key, fallback, `${label} shortcut reset.`)}>Reset</button></div>)}</div>

    <div className="settings-group" hidden={section !== 'Notifications'}><h3>Notifications</h3>
      {toggle('notify_tasks', 'Task reminders', 'Counts of overdue and due-today tasks, while the app is running.')}
      {toggle('notify_backups', 'Backups', 'When a backup finishes or fails.')}
      {toggle('notify_automations', 'Automations', 'When an automation finishes or fails.')}
      <div className="item"><div><strong>Test notification</strong><p>Notifications never include passwords or note text.</p></div><button className="link" onClick={async () => { try { await invoke('send_test_notification'); setMessage('Test notification sent.'); } catch (e) { p.onError(String(e)); } }}>Send test</button></div></div>

    <div className="settings-group" hidden={section !== 'Developer tools'}><h3>Developer tools</h3>
      <div className="item"><div><strong>VS Code executable</strong><p dir="ltr">{p.editorPath ?? 'Not configured'}</p><p>Select the executable you trust. The project directory is passed as one argument.</p></div><button className="link" onClick={chooseEditor}>Select executable</button></div>
      <ToolSettings onError={p.onError}/></div>

    <div className="settings-group" hidden={section !== 'Security'}><h3>Security</h3>
      <div className="item"><div><strong>Credential storage</strong><p>{info?.credential_backend ?? 'Unavailable'}</p><p className="muted">Secrets stay in Windows Credential Manager under your Windows account. The view lock is not extra authentication.</p></div><button className="link" onClick={reconcile}>Check vault</button></div>
      <div className="item"><div><strong>Vault view lock</strong><p>Hide revealed secrets after this much inactivity.</p></div><label>Minutes<select value={values.vault_lock_minutes ?? '5'} onChange={e => update('vault_lock_minutes', e.target.value)}>{['1', '5', '10', '15', '30', '60'].map(m => <option key={m} value={m}>{m}</option>)}</select></label></div>
      <div className="item"><div><strong>Clipboard clearing</strong><p>Copied secrets are cleared only if the clipboard still holds them. Clipboard history cannot be guaranteed to be erased.</p></div><label>Seconds<select value={values.clipboard_timeout_seconds ?? '30'} onChange={e => update('clipboard_timeout_seconds', e.target.value)}>{[['0', 'Never'], ['15', '15'], ['30', '30'], ['60', '60'], ['120', '120']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>
      <div className="item"><div><strong>Clear sensitive temporary state</strong><p>Hides revealed secrets and dismisses command output in this window.</p></div><button className="link" onClick={clearSensitive}>Clear now</button></div></div>

    <div className="settings-group" hidden={section !== 'Data'}><h3>Data</h3>
      <div className="item"><div><strong>Database</strong><p dir="ltr" className="path">{info?.database_path ?? 'Unavailable'}</p><p className="muted">Schema version {info?.schema_version ?? '—'}. Stored in your Windows user profile, never next to the program.</p></div></div>
      <div className="item"><div><strong>Database backup</strong><p>Creates a new, unencrypted SQLite file. Existing files are never overwritten. Theme and display preferences are not included.</p></div><button className="link" onClick={makeBackup}>Create backup</button><button className="link" onClick={restoreBackup}>Restore backup</button></div></div>

    <div className="settings-group about" hidden={section !== 'About'}><h3>About</h3>
      <div className="about-row"><img src={logo} alt="Smart Beton"/><div><strong>Smart Beton Dashboard</strong><p>Version {info?.version ?? '1.0.0'}</p><p className="muted">A local workspace. No account, no telemetry and no network access except actions you start. Notes, tasks and backups are not encrypted; vault secrets are protected by Windows. See SECURITY.md for the threat model and limits.</p></div></div></div>
    </div></div>
  </section>;
}
