import {createPortal} from 'react-dom';
import React, {useEffect, useState} from 'react';
import {invoke} from './native';
import {commitSummary, displayPath, formatDuration, HARNESSES, parseUtc, type Item, type ProjectRecord} from './domain';
import {ProjectGit} from './ProjectGit';
import {ProjectWorkspaces} from './ProjectWorkspaces';

type Session = {id:number; project_id:number; summary:string; unfinished:string; problems:string; next_action:string; started_at:string|null; ended_at:string|null; duration_seconds:number; is_active:boolean; created_at:string};
type Activity = {id:number; action_type:string; summary:string; occurred_at:string};
type Connection = {id:number; name:string; kind:string; address:string; port:number|null; project_id:number|null; project_ids?:number[]};
type VaultRow = {id:number; name:string; username:string; kind?:string; project_id?:number|null};
type SavedCommand = {id:number; name:string; executable:string; project_id:number};
type Tab = 'overview'|'notes'|'tasks'|'servers'|'credentials'|'commands'|'git'|'workspaces'|'activity'|'sessions';
type Props = {
  initialTab?:string|null; project:ProjectRecord; projects:ProjectRecord[]; items:Item[]; editorPath:string|null; today:string; onBack:()=>void; onChanged:()=>void; onError:(message:string)=>void; onPage:(index:number)=>void;
  onCreateTask:(projectId:number)=>void; onCreateNote:(projectId:number)=>void; onEditItem:(item:Item)=>void;
};
const TABS: [Tab, string][] = [['overview', 'Overview'], ['notes', 'Notes'], ['tasks', 'Tasks'], ['servers', 'Servers'], ['credentials', 'Credentials'], ['commands', 'Commands'], ['git', 'Git'], ['workspaces', 'Workspaces'], ['activity', 'Activity'], ['sessions', 'Sessions']];
const TOOLS: [string, string][] = [['vscode', 'VS Code'], ['claude', 'Claude Code'], ['codex', 'Codex'], ['antigravity', 'Antigravity'], ['terminal', 'Terminal']];
const STATUSES: [string, string][] = [['active', 'Active'], ['paused', 'Paused'], ['completed', 'Completed']];
const asArray = <T,>(value:unknown): T[] => Array.isArray(value) ? value as T[] : [];

export function ProjectDetail(p:Props) {
  const project = p.project;
  const [tab, setTab] = useState<Tab>(TABS.some(([id]) => id === p.initialTab) ? p.initialTab as Tab : 'overview'), [sessions, setSessions] = useState<Session[]>([]), [activity, setActivity] = useState<Activity[]>([]), [connections, setConnections] = useState<Connection[]>([]), [vault, setVault] = useState<VaultRow[]>([]), [commands, setCommands] = useState<SavedCommand[]>([]);
  const [notice, setNotice] = useState(''), [editing, setEditing] = useState(false), [ending, setEnding] = useState(false), [tick, setTick] = useState(0), [linkConnection, setLinkConnection] = useState(''), [linkVault, setLinkVault] = useState('');
  const [form, setForm] = useState({name: '', description: '', status: 'active', group_name: '', preferred_editor: 'vscode', technology_tags: '', website_url: ''});
  const [report, setReport] = useState({completed: '', unfinished: '', problems: '', next_action: ''});

  async function reload() {
    const get = async <T,>(command:string, args?:Record<string, unknown>): Promise<T[]> => { try { return asArray<T>(await invoke<unknown>(command, args)); } catch { return []; } };
    const [s, a, c, v, k] = await Promise.all([get<Session>('project_sessions', {projectId: project.id}), get<Activity>('project_activity', {projectId: project.id}), get<Connection>('list_connections'), get<VaultRow>('vault_list'), get<SavedCommand>('list_commands')]);
    setSessions(s); setActivity(a); setConnections(c); setVault(v); setCommands(k);
  }
  useEffect(() => { reload(); }, [project.id]);
  const active = sessions.find(x => x.is_active), last = sessions.find(x => !x.is_active);
  useEffect(() => { if (!active) return; const id = window.setInterval(() => setTick(t => t + 1), 30000); return () => window.clearInterval(id); }, [active?.id]);

  async function run(command:string, args:Record<string, unknown>, done?:string) {
    try { const result = await invoke(command, args); if (done) setNotice(done); p.onChanged(); await reload(); return result ?? true; } catch (e) { p.onError(String(e)); return false; }
  }
  const launch = (tool:string, label:string) => run('launch_project_tool', {projectId: project.id, tool}, `Opened in ${label}.`);
  async function copyPath() { try { await navigator.clipboard.writeText(displayPath(project.path)); setNotice('Path copied.'); } catch { p.onError('Could not copy to the clipboard.'); } }
  function startEdit() {
    p.onError(''); setForm({name: project.name, description: project.description ?? '', status: project.status ?? 'active', group_name: project.group_name ?? '', preferred_editor: project.preferred_editor ?? 'vscode', technology_tags: project.technology_tags ?? '', website_url: project.website_url ?? ''}); setEditing(true);
  }
  async function saveEdit(e:React.FormEvent) { e.preventDefault(); if (await run('update_project', {id: project.id, update: form}, 'Project saved.')) setEditing(false); }
  async function endSession(e:React.FormEvent) { e.preventDefault(); if (!active) return; if (await run('end_project_session', {id: active.id, completed: report.completed, unfinished: report.unfinished, problems: report.problems, nextAction: report.next_action}, 'Session saved.')) { setEnding(false); setReport({completed: '', unfinished: '', problems: '', next_action: ''}); } }
  async function openWorkspace() {
    const harness = project.ai_harness ?? 'claude';
    try {
      const result = await invoke<{launched:string[]; failed:string[]}>('launch_workspace', {projectId: project.id, harness});
      p.onError(result?.failed?.length ? result.failed.join('\n') : '');
      setNotice(result?.launched?.length ? `Opened in ${result.launched.join(' and ')}.` : '');
      p.onChanged(); await reload();
    } catch (e) { p.onError(String(e)); }
  }
  async function remove() {
    if (!window.confirm(`Delete "${project.name}" from the dashboard?\n\nThe folder and its files are NOT touched. Notes, tasks and servers stay but lose the project link; this project's working sessions and saved commands are deleted. Rescans will not offer it again until you clear the ignore list.`)) return;
    try { await invoke('delete_project', {id: project.id}); p.onChanged(); p.onBack(); } catch (e) { p.onError(String(e)); }
  }

  const notes = p.items.filter(x => x.kind === 'note' && !x.deleted && x.project_id === project.id);
  const tasks = p.items.filter(x => x.kind === 'task' && !x.deleted && x.project_id === project.id);
  const openTasks = tasks.filter(x => !x.done);
  const isLinked = (x:Connection) => !!x.project_ids?.includes(project.id) || x.project_id === project.id;
  const linkedConnections = connections.filter(isLinked), freeConnections = connections.filter(x => !isLinked(x));
  const linkedVault = vault.filter(x => x.project_id === project.id), freeVault = vault.filter(x => x.project_id !== project.id);
  const linkedCommands = commands.filter(x => x.project_id === project.id);
  const elapsed = active?.started_at ? Math.max(0, Math.round((Date.now() - parseUtc(active.started_at)) / 1000)) : 0; void tick;
  const git = commitSummary(project);
  const tags = (project.technology_tags ?? '').split(',').map(t => t.trim()).filter(Boolean);
  const preferred = project.preferred_editor ?? 'vscode';
  const count = (tabId:Tab) => tabId === 'notes' ? notes.length : tabId === 'tasks' ? openTasks.length : tabId === 'servers' ? linkedConnections.length : tabId === 'credentials' ? linkedVault.length : tabId === 'commands' ? linkedCommands.length : null;

  return <section className="project-detail">
    <div className="card detail-head">
      <button className="link" onClick={p.onBack}>← All projects</button>
      <div className="row"><div><h2>{project.name}</h2><p className="path" dir="ltr">{displayPath(project.path)}</p></div>
        <div className="row actions">
          <button className="link" aria-pressed={!!project.is_favorite} onClick={() => run('set_project_flag', {id: project.id, flag: 'favorite', value: !project.is_favorite})}>{project.is_favorite ? '★ Favorite' : '☆ Favorite'}</button>
          <button className="link" onClick={() => run('set_project_flag', {id: project.id, flag: 'archived', value: !project.is_archived})}>{project.is_archived ? 'Unarchive' : 'Archive'}</button>
          <button className="link" onClick={startEdit}>Edit</button><button className="link danger" onClick={remove}>Delete project</button></div></div>
      <div className="chips"><span className={`chip status-${project.status ?? 'active'}`}>{STATUSES.find(([id]) => id === (project.status ?? 'active'))?.[1]}</span>{project.is_archived && <span className="chip">Archived</span>}{project.group_name && <span className="chip">{project.group_name}</span>}{tags.map(t => <span className="chip" key={t}>{t}</span>)}</div>
      <div className="launch-row"><label className="harness">AI tool<select aria-label="AI tool" value={project.ai_harness ?? 'claude'} onChange={e => run('set_project_harness', {id: project.id, harness: e.target.value})}>{HARNESSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><button className="launch-btn" onClick={openWorkspace}>Open in VS Code + {HARNESSES.find(([id]) => id === (project.ai_harness ?? 'claude'))?.[1]}</button></div>
      <div className="tool-actions" role="toolbar" aria-label="Project actions">
        <button className="link" onClick={() => run('open_project_folder', {id: project.id}, 'Opened the folder.')}>Open folder</button>
        {active ? <button onClick={() => {p.onError(''); setEnding(true);}}>End session ({formatDuration(elapsed)})</button> : <button onClick={() => run('start_project_session', {projectId: project.id}, 'Session started.')}>Start session</button>}
        <details className="project-more"><summary>More actions</summary><div className="project-more-actions">
          {TOOLS.map(([id, label]) => <button key={id} className={id === preferred ? 'link preferred' : 'link'} title={id === preferred ? 'Preferred tool for this project' : undefined} onClick={() => launch(id, label)}>{id === 'terminal' ? 'Open terminal' : `Open in ${label}`}</button>)}
          <button className="link" onClick={copyPath}>Copy path</button>
          {project.website_url && <button className="link" onClick={() => run('open_external_url', {url: project.website_url}, 'Opened the website.')}>Open website</button>}
        </div></details>
      </div>
      {notice && <p role="status" className="muted">{notice}</p>}
    </div>

    <div className="tabs" role="tablist" aria-label="Project sections">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>{label}{count(id) ? <span className="count">{count(id)}</span> : null}</button>)}</div>

    <div className="card collection">
      {tab === 'overview' && <div className="overview">
        {active && <div className="session-panel"><strong>Session in progress</strong><p className="muted">Started <bdi dir="ltr">{active.started_at} UTC</bdi> · {formatDuration(elapsed)}</p></div>}
        <div className="info-grid">
          <div><h3>About</h3><p>{project.description || <span className="muted">No description yet. Use Edit to add one.</span>}</p>
            <dl><dt>Preferred tool</dt><dd>{TOOLS.find(([id]) => id === preferred)?.[1]}</dd><dt>Git</dt><dd>{git.text}{git.date ? ` · ${git.date}` : ''}{project.git_branch ? ` · ${project.git_branch}` : ''}</dd><dt>Last opened</dt><dd>{project.last_opened_at ? <bdi dir="ltr">{project.last_opened_at} UTC</bdi> : 'Never'}</dd>{project.website_url && <><dt>Website</dt><dd dir="ltr">{project.website_url}</dd></>}</dl></div>
          <div><h3>Where you left off</h3>{last ? <><p>{last.summary}</p>{last.unfinished && <p><strong>Unfinished:</strong> {last.unfinished}</p>}{last.problems && <p><strong>Problems:</strong> {last.problems}</p>}<p className="next-action"><strong>Next action:</strong> {last.next_action || 'Not recorded'}</p><p className="muted">Ended <bdi dir="ltr">{last.ended_at ?? last.created_at} UTC</bdi>{last.duration_seconds ? ` · ${formatDuration(last.duration_seconds)}` : ''}</p></> : <p className="muted">No finished sessions yet. Start a session when you begin working and end it to record where you stopped.</p>}</div>
          <div><h3>Open tasks ({openTasks.length})</h3>{openTasks.slice(0, 5).map(x => <label className="goal-row" key={x.id}><span><input type="checkbox" aria-label={`Complete ${x.title}`} checked={x.done} onChange={() => run('toggle_task', {id: x.id})}/> {x.title}</span></label>)}{!openTasks.length && <p className="muted">Nothing open for this project.</p>}</div>
          <div><h3>Linked items</h3><p>{notes.length} notes · {tasks.length} tasks · {linkedConnections.length} servers · {linkedVault.length} credentials · {linkedCommands.length} commands</p></div>
        </div></div>}

      {tab === 'notes' && <><div className="row"><h3>Notes</h3><button onClick={() => p.onCreateNote(project.id)}>＋ New note</button></div>
        {notes.map(x => <div className="item" key={x.id}><div><strong>{x.title}</strong><p className="muted">{(x.body || '').slice(0, 120)}</p></div><button className="link" onClick={() => p.onEditItem(x)}>Edit</button></div>)}
        {!notes.length && <p className="muted">No notes linked to this project.</p>}</>}

      {tab === 'tasks' && <><div className="row"><h3>Tasks</h3><button onClick={() => p.onCreateTask(project.id)}>＋ New task</button></div>
        {tasks.map(x => <div className="item" key={x.id}><input type="checkbox" aria-label={`Complete ${x.title}`} checked={x.done} onChange={() => run('toggle_task', {id: x.id})}/><div><strong className={x.done ? 'struck' : ''}>{x.title}</strong><p className="muted">Priority: {x.priority ?? 'normal'}{x.due_date ? ` · ${x.due_date}` : ''}{!x.done && x.due_date && x.due_date < p.today ? ' (overdue)' : ''}</p></div><button className="link" onClick={() => p.onEditItem(x)}>Edit</button></div>)}
        {!tasks.length && <p className="muted">No tasks linked to this project.</p>}</>}

      {tab === 'servers' && <><div className="row"><h3>Servers and connections</h3><button className="link" onClick={() => p.onPage(4)}>Manage connections</button></div>
        {linkedConnections.map(x => <div className="item" key={x.id}><div><strong>{x.name}</strong><p dir="ltr"><bdi>{x.kind.toUpperCase()} · {x.address}{x.port ? `:${x.port}` : ''}</bdi></p></div><button className="link" onClick={() => run('link_connection_project', {id: x.id, projectId: project.id, linked: false})}>Unlink</button></div>)}
        {!linkedConnections.length && <p className="muted">No connections linked to this project.</p>}
        {freeConnections.length > 0 && <div className="link-row"><label>Link an existing connection<select value={linkConnection} onChange={e => setLinkConnection(e.target.value)}><option value="">Choose…</option>{freeConnections.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><button disabled={!linkConnection} onClick={async () => { if (await run('link_connection_project', {id: Number(linkConnection), projectId: project.id, linked: true})) setLinkConnection(''); }}>Link</button></div>}</>}

      {tab === 'credentials' && <><div className="row"><h3>Credentials</h3><button className="link" onClick={() => p.onPage(3)}>Open Secure Vault</button></div>
        <p className="muted">Only names and usernames appear here. Reveal or copy a secret from the Secure Vault.</p>
        {linkedVault.map(x => <div className="item" key={x.id}><div><strong>{x.name}</strong><p dir="auto">{x.username}</p></div><button className="link" onClick={() => run('link_vault_project', {id: x.id, projectId: null})}>Unlink</button></div>)}
        {!linkedVault.length && <p className="muted">No credentials linked to this project.</p>}
        {freeVault.length > 0 && <div className="link-row"><label>Link an existing credential<select value={linkVault} onChange={e => setLinkVault(e.target.value)}><option value="">Choose…</option>{freeVault.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><button disabled={!linkVault} onClick={async () => { if (await run('link_vault_project', {id: Number(linkVault), projectId: project.id})) setLinkVault(''); }}>Link</button></div>}</>}

      {tab === 'commands' && <><div className="row"><h3>Saved commands</h3><button className="link" onClick={() => p.onPage(7)}>Open Commands</button></div>
        {linkedCommands.map(x => <div className="item" key={x.id}><div><strong>{x.name}</strong><p dir="ltr"><bdi>{x.executable}</bdi></p></div></div>)}
        {!linkedCommands.length && <p className="muted">No commands saved for this project. Commands run only after you review and confirm them on the Commands page.</p>}</>}

      {tab === 'git' && <ProjectGit project={project} onChanged={p.onChanged} onError={p.onError}/>}
      {tab === 'workspaces' && <ProjectWorkspaces project={project} onNavigate={t => setTab(t as Tab)} onError={p.onError} onChanged={p.onChanged}/>}
      {tab === 'activity' && <><h3>Activity</h3>{activity.map(x => <div className="item" key={x.id}><div><strong>{x.summary}</strong><p className="muted"><bdi dir="ltr">{x.occurred_at} UTC</bdi></p></div></div>)}{!activity.length && <p className="muted">Activity appears when you open the project, launch tools or run sessions.</p>}</>}

      {tab === 'sessions' && <><h3>Working sessions</h3>{sessions.map(x => <div className="item" key={x.id}><div><strong>{x.is_active ? 'In progress' : x.summary}</strong>{!x.is_active && <>{x.unfinished && <p>Unfinished: {x.unfinished}</p>}{x.problems && <p>Problems: {x.problems}</p>}{x.next_action && <p>Next: {x.next_action}</p>}</>}<p className="muted"><bdi dir="ltr">{x.started_at ?? x.created_at} UTC</bdi>{x.duration_seconds ? ` · ${formatDuration(x.duration_seconds)}` : ''}</p></div>
        <button className="link" disabled={x.is_active} onClick={async () => { if (window.confirm('Delete this working session?')) run('delete_session', {id: x.id, projectId: project.id}); }}>Delete</button></div>)}{!sessions.length && <p className="muted">No sessions yet.</p>}</>}
    </div>

    {editing && createPortal(<div className="overlay"><form className="dialog" role="dialog" aria-modal="true" aria-label="Edit project" onSubmit={saveEdit} onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}>
      <h2>Edit project</h2>
      <label>Name<input required maxLength={120} value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
      <label>Description<textarea maxLength={2000} value={form.description} onChange={e => setForm({...form, description: e.target.value})}/></label>
      <label>Status<select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>{STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Preferred tool<select value={form.preferred_editor} onChange={e => setForm({...form, preferred_editor: e.target.value})}>{TOOLS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Group (optional)<input maxLength={80} value={form.group_name} onChange={e => setForm({...form, group_name: e.target.value})}/></label>
      <label>Technology tags (comma separated)<input maxLength={200} value={form.technology_tags} onChange={e => setForm({...form, technology_tags: e.target.value})}/></label>
      <label>Website (optional, http or https)<input dir="ltr" maxLength={500} value={form.website_url} onChange={e => setForm({...form, website_url: e.target.value})}/></label>
      <div className="row"><button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button><button>Save</button></div>
    </form></div>, document.querySelector('.app') ?? document.body)}

    {ending && createPortal(<div className="overlay"><form className="dialog" role="dialog" aria-modal="true" aria-label="End working session" onSubmit={endSession} onKeyDown={e => { if (e.key === 'Escape') setEnding(false); }}>
      <h2>End session</h2>
      <label>What did you complete?<textarea value={report.completed} onChange={e => setReport({...report, completed: e.target.value})}/></label>
      <label>What is unfinished?<textarea value={report.unfinished} onChange={e => setReport({...report, unfinished: e.target.value})}/></label>
      <label>Are there unresolved problems?<textarea value={report.problems} onChange={e => setReport({...report, problems: e.target.value})}/></label>
      <label>What should you do next time?<input value={report.next_action} onChange={e => setReport({...report, next_action: e.target.value})}/></label>
      <div className="row"><button type="button" className="secondary" onClick={() => setEnding(false)}>Keep working</button><button>Save and end session</button></div>
    </form></div>, document.querySelector('.app') ?? document.body)}
  </section>;
}
