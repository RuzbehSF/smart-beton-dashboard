import React, {useEffect, useState} from 'react';
import {invoke, isTauri, open} from './native';
import {commitSummary, displayPath, HARNESSES, selectProjects, type Item, type ProjectRecord} from './domain';
import {ProjectDetail} from './ProjectDetail';

type Props = {
  items:Item[]; projects:ProjectRecord[]; editorPath:string|null; today:string; initialDetail:number|null; initialTab?:string|null; onFocusConsumed:()=>void;
  onChanged:()=>void; onError:(message:string)=>void; onPage:(index:number)=>void;
  onCreateTask:(projectId:number)=>void; onCreateNote:(projectId:number)=>void; onEditItem:(item:Item)=>void;
};
type Root = {id:number; path:string; label:string; exclusions:string; project_count:number};
type Candidate = {root_id:number; path:string; name:string; tags:string[]; has_git:boolean; known:boolean};
type Scan = {candidates:Candidate[]; warnings:string[]; ignored:number};
type LaunchResult = {launched:string[]; failed:string[]};
const STATUS_LABEL: Record<string, string> = {active: 'Active', paused: 'Paused', completed: 'Completed'};
const tagList = (tags?:string) => (tags ?? '').split(',').map(t => t.trim()).filter(Boolean);
/** Name of the folder that contains the project; shown only when two projects share a name. */
const parentName = (path:string) => displayPath(path).split(/[\\/]/).filter(Boolean).slice(-2, -1)[0] ?? '';
const harnessName = (id?:string) => HARNESSES.find(([key]) => key === id)?.[1] ?? 'Claude Code';

export function Projects(p:Props) {
  const [detail, setDetail] = useState<number|null>(p.initialDetail), [query, setQuery] = useState(''), [sort, setSort] = useState<'commit'|'recent'|'name'|'created'>('commit'), [scope, setScope] = useState<'active'|'favorites'|'archived'>('active'), [status, setStatus] = useState('all'), [view, setView] = useState<'grid'|'list'>('grid');
  const [adding, setAdding] = useState(false), [name, setName] = useState(''), [path, setPath] = useState(''), [description, setDescription] = useState('');
  const [roots, setRoots] = useState<Root[]>([]), [ignored, setIgnored] = useState(0), [scan, setScan] = useState<Scan|null>(null), [selected, setSelected] = useState<string[]>([]), [nested, setNested] = useState(false), [scanning, setScanning] = useState(false), [editRoot, setEditRoot] = useState<Root|null>(null), [message, setMessage] = useState(''), [gitBusy, setGitBusy] = useState(false);

  async function loadRoots() {
    try { const list = await invoke<unknown>('list_project_roots'); setRoots(Array.isArray(list) ? list as Root[] : []); } catch (e) { p.onError(String(e)); }
    try { const n = await invoke<unknown>('ignored_project_count'); setIgnored(typeof n === 'number' ? n : 0); } catch { /* optional */ }
  }
  async function refreshGit(force:boolean) {
    setGitBusy(true);
    try { const n = await invoke<unknown>('refresh_git_info', {projectId: null, force}); if (typeof n === 'number' && n > 0) p.onChanged(); } catch (e) { if (force) p.onError(String(e)); } finally { setGitBusy(false); }
  }
  useEffect(() => { if (p.initialDetail !== null) p.onFocusConsumed(); loadRoots(); if (isTauri()) refreshGit(false); }, []);

  async function run(command:string, args:Record<string, unknown>) { try { await invoke(command, args); p.onChanged(); return true; } catch (e) { p.onError(String(e)); return false; } }
  async function chooseProjectFolder() {
    try { const chosen = await open({directory: true, multiple: false}); if (!chosen) return; setPath(chosen as string); if (!name.trim()) setName(displayPath(chosen as string).split(/[\\/]/).filter(Boolean).pop() ?? ''); } catch (e) { p.onError(String(e)); }
  }
  async function createProject(e:React.FormEvent) {
    e.preventDefault();
    try { const id = await invoke<number>('create_project', {name, path, description}); setAdding(false); setName(''); setPath(''); setDescription(''); p.onChanged(); if (typeof id === 'number') setDetail(id); } catch (err) { p.onError(String(err)); }
  }

  async function scanRoots(id:number|null) {
    setScanning(true); setMessage(''); p.onError('');
    try {
      const result = await invoke<Scan>('scan_project_root', {id, nested});
      setScan(result); setSelected(result.candidates.filter(c => !c.known).map(c => c.path));
      if (!result.candidates.some(c => !c.known)) setMessage(result.candidates.length ? 'No new projects were found; everything here is already on the dashboard.' : 'No projects were found in this folder.');
    } catch (e) { p.onError(String(e)); } finally { setScanning(false); }
  }
  async function addRoot() {
    try {
      const chosen = await open({directory: true, multiple: false});
      if (!chosen) return;
      const id = await invoke<number>('add_project_root', {path: chosen, label: ''});
      await loadRoots(); await scanRoots(typeof id === 'number' ? id : null);
    } catch (e) { p.onError(String(e)); }
  }
  async function importSelected() {
    if (!scan) return;
    try {
      const byRoot = new Map<number, string[]>();
      for (const c of scan.candidates) if (selected.includes(c.path)) byRoot.set(c.root_id, [...(byRoot.get(c.root_id) ?? []), c.path]);
      let added = 0;
      for (const [rootId, paths] of byRoot) { const n = await invoke<unknown>('import_root_projects', {rootId, paths, nested}); added += typeof n === 'number' ? n : paths.length; }
      setScan(null); setSelected([]); setMessage(`${added} project${added === 1 ? '' : 's'} added.`); p.onChanged(); loadRoots();
    } catch (e) { p.onError(String(e)); }
  }
  async function removeRoot(root:Root) {
    if (!window.confirm(`Stop watching "${root.label || displayPath(root.path)}"?\
\
Its ${root.project_count} imported project(s) stay on the dashboard and nothing on disk is touched.`)) return;
    if (await run('remove_project_root', {id: root.id})) loadRoots();
  }
  async function saveRoot(e:React.FormEvent) {
    e.preventDefault(); if (!editRoot) return;
    if (await run('update_project_root', {id: editRoot.id, label: editRoot.label, exclusions: editRoot.exclusions})) { setEditRoot(null); loadRoots(); }
  }

  async function openWorkspace(project:ProjectRecord) {
    const harness = project.ai_harness ?? 'claude';
    try {
      const result = await invoke<LaunchResult>('launch_workspace', {projectId: project.id, harness});
      const failed = result?.failed ?? [];
      if (failed.length) p.onError(failed.join(', ')); else p.onError('');
      setMessage(result?.launched?.length ? `Opened ${project.name} in ${result.launched.join(' and ')}.` : '');
      p.onChanged();
    } catch (e) { p.onError(String(e)); }
  }
  async function deleteProject(project:ProjectRecord) {
    if (!window.confirm(`Delete "${project.name}" from the dashboard?\
\
The folder and its files are NOT touched. Its notes and tasks stay but lose the project link, and its working sessions and saved commands are deleted. A rescan will not offer it again until you clear the ignore list.`)) return;
    if (await run('delete_project', {id: project.id})) { setMessage(`"${project.name}" was removed from the dashboard.`); loadRoots(); }
  }

  const current = detail !== null ? p.projects.find(x => x.id === detail) : undefined;
  if (current) return <ProjectDetail initialTab={p.initialTab} project={current} projects={p.projects} items={p.items} editorPath={p.editorPath} today={p.today} onBack={() => setDetail(null)} onChanged={p.onChanged} onError={p.onError} onPage={p.onPage} onCreateTask={p.onCreateTask} onCreateNote={p.onCreateNote} onEditItem={p.onEditItem}/>;

  const list = selectProjects(p.projects, {query, scope, status, sort});
  const sameName = (x:ProjectRecord) => p.projects.filter(y => y.name === x.name).length > 1;
  const card = (x:ProjectRecord) => {
    const commit = commitSummary(x), harness = x.ai_harness ?? 'claude';
    return <article className={view === 'grid' ? 'card proj-card' : 'card proj-row'} key={x.id}>
      <div className="row"><button className="proj-name" onClick={() => setDetail(x.id)}>{x.name}</button>
        <button className="link tiny star" aria-pressed={!!x.is_favorite} aria-label={x.is_favorite ? `Remove ${x.name} from favorites` : `Add ${x.name} to favorites`} onClick={() => run('set_project_flag', {id: x.id, flag: 'favorite', value: !x.is_favorite})}>{x.is_favorite ? '★' : '☆'}</button></div>
      <p className="commit-line" title={x.last_commit_subject || undefined}><strong>{commit.text}</strong>{commit.date && <span> · <bdi dir="ltr">{commit.date}</bdi></span>}</p>
      <div className="chips"><span className={`chip status-${x.status ?? 'active'}`}>{STATUS_LABEL[x.status ?? 'active'] ?? x.status}</span>{x.git_branch && <span className="chip" dir="ltr">⎇ {x.git_branch}</span>}{!!x.git_dirty && <span className="chip">{x.git_dirty} uncommitted</span>}{sameName(x) && <span className="chip" dir="ltr" title="Another project has the same name">in {parentName(x.path)}</span>}{x.is_archived && <span className="chip">Archived</span>}{tagList(x.technology_tags).filter(t => t !== 'Git').map(t => <span className="chip" key={t}>{t}</span>)}</div>
      {x.description && <p className="muted clamp">{x.description}</p>}
      <p className="path" dir="ltr" title={displayPath(x.path)}>{displayPath(x.path)}</p>
      <div className="launch-row">
        <label className="harness">AI tool<select aria-label={`AI tool for ${x.name}`} value={harness} onChange={e => run('set_project_harness', {id: x.id, harness: e.target.value})}>{HARNESSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <button className="launch-btn" title={`Opens ${x.name} in VS Code and in ${harnessName(harness)}`} onClick={() => openWorkspace(x)}>Open in VS Code + {harnessName(harness)}</button>
      </div>
      <div className="row actions"><button className="link" onClick={() => setDetail(x.id)}>Open project</button>
        <button className="link" onClick={() => run('open_project_folder', {id: x.id})}>Open folder</button>
        <button className="link danger" aria-label={`Delete ${x.name}`} onClick={() => deleteProject(x)}>Delete</button></div>
    </article>;
  };
  const unknown = scan?.candidates.filter(c => !c.known) ?? [];

  return <section className="projects-page">
    <div className="card collection">
      <div className="row"><h2>Projects</h2><div className="row"><button onClick={() => {p.onError(''); setAdding(true);}}>＋ Add project</button><button className="link" disabled={gitBusy} onClick={() => refreshGit(true)}>{gitBusy ? 'Reading Git…' : 'Refresh Git info'}</button></div></div>

      <div className="roots-panel">
        <div className="row"><h3>Project folders</h3><div className="row"><button onClick={addRoot} disabled={scanning}>＋ Add folder</button>{roots.length > 0 && <button className="link" disabled={scanning} onClick={() => scanRoots(null)}>{scanning ? 'Scanning…' : 'Find new projects'}</button>}</div></div>
        {!roots.length && <p className="muted">Add the folder that holds all your projects (for example A:\SmartBeton). Each project folder becomes one block; the folders inside a project, such as front end and back end, are not listed separately.</p>}
        {roots.map(root => <div className="item root-item" key={root.id}><div><strong>{root.label || displayPath(root.path)}</strong><p dir="ltr" className="path">{displayPath(root.path)}</p><p className="muted">{root.project_count} project{root.project_count === 1 ? '' : 's'}{root.exclusions ? ` · skipping ${root.exclusions}` : ''}</p></div>
          <button className="link" disabled={scanning} onClick={() => scanRoots(root.id)}>Rescan</button><button className="link" onClick={() => setEditRoot(root)}>Folder settings</button><button className="link danger" onClick={() => removeRoot(root)}>Remove folder</button></div>)}
        <label className="inline-check"><input type="checkbox" checked={nested} onChange={e => setNested(e.target.checked)}/>Also list projects inside other projects (for example monorepo packages)</label>
        {ignored > 0 && <p className="muted">{ignored} deleted project{ignored === 1 ? ' is' : 's are'} hidden from scans. <button className="link" onClick={async () => { if (await run('clear_ignored_projects', {})) { loadRoots(); setMessage('Deleted projects can be found by scans again.'); } }}>Show them again</button></p>}
      </div>

      {scan && <div className="scan-panel">
        <p><strong>{unknown.length}</strong> new project{unknown.length === 1 ? '' : 's'} found{scan.candidates.length > unknown.length ? ` (${scan.candidates.length - unknown.length} already added)` : ''}. Review before importing.</p>
        {scan.candidates.map(c => <label className="item" key={c.path}><input type="checkbox" disabled={c.known} checked={c.known || selected.includes(c.path)} onChange={e => setSelected(e.target.checked ? [...selected, c.path] : selected.filter(x => x !== c.path))}/><span dir="ltr"><strong>{c.name}</strong> <span className="muted">{displayPath(c.path)}{c.has_git ? ' · Git' : ''}{c.known ? ' · already added' : ''}</span></span></label>)}
        {scan.warnings.slice(0, 3).map((w, i) => <p className="muted" key={i}>{w}</p>)}
        <div className="row actions"><button disabled={!selected.length} onClick={importSelected}>Import selected</button><button className="link" onClick={() => {setScan(null); setSelected([]);}}>Cancel</button></div></div>}
      {message && <p role="status" className="status-line">{message}</p>}

      <div className="proj-toolbar">
        <input className="search" aria-label="Search projects" placeholder="Search name, description, tags or path" value={query} onChange={e => setQuery(e.target.value)}/>
        <div className="seg" role="group" aria-label="Project collection">{([['active', 'Active'], ['favorites', 'Favorites'], ['archived', 'Archived']] as const).map(([id, label]) => <button key={id} className={scope === id ? 'active' : ''} aria-pressed={scope === id} onClick={() => setScope(id)}>{label}</button>)}</div>
        <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
        <label>Sort<select value={sort} onChange={e => setSort(e.target.value as 'commit'|'recent'|'name'|'created')}><option value="commit">Last commit</option><option value="recent">Recently opened</option><option value="name">Name</option><option value="created">Newest added</option></select></label>
        <div className="seg" role="group" aria-label="Layout">{(['grid', 'list'] as const).map(v => <button key={v} className={view === v ? 'active' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'grid' ? 'Grid' : 'List'}</button>)}</div>
      </div>
    </div>
    <div className={view === 'grid' ? 'proj-grid' : 'proj-list'}>{list.map(card)}</div>
    {!list.length && <div className="card"><p className="muted">{p.projects.length ? 'No projects match these filters.' : 'No projects yet. Add the folder that holds your projects, or add one project by hand.'}</p></div>}

    {editRoot && <div className="overlay"><form className="dialog" role="dialog" aria-modal="true" aria-label="Folder settings" onSubmit={saveRoot} onKeyDown={e => { if (e.key === 'Escape') setEditRoot(null); }}>
      <h2>Folder settings</h2><p dir="ltr" className="path">{displayPath(editRoot.path)}</p>
      <label>Label (optional)<input maxLength={80} value={editRoot.label} onChange={e => setEditRoot({...editRoot, label: e.target.value})}/></label>
      <label>Folders to skip (comma separated names)<input dir="ltr" placeholder="archive, old, tmp" value={editRoot.exclusions} onChange={e => setEditRoot({...editRoot, exclusions: e.target.value})}/></label>
      <p className="muted">Hidden folders, node_modules, build output and similar are always skipped.</p>
      <div className="row"><button type="button" className="secondary" onClick={() => setEditRoot(null)}>Cancel</button><button>Save</button></div>
    </form></div>}

    {adding && <div className="overlay"><form className="dialog" role="dialog" aria-modal="true" aria-label="Add project" onSubmit={createProject} onKeyDown={e => { if (e.key === 'Escape') setAdding(false); }}>
      <h2>Add project</h2>
      <label>Project folder<input readOnly required dir="ltr" value={path} placeholder="Choose a folder"/></label><button type="button" className="secondary" onClick={chooseProjectFolder}>Choose folder</button>
      <label>Name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)}/></label>
      <label>Description (optional)<textarea maxLength={2000} value={description} onChange={e => setDescription(e.target.value)}/></label>
      <div className="row"><button type="button" className="secondary" onClick={() => setAdding(false)}>Cancel</button><button disabled={!path || !name.trim()}>Add project</button></div>
    </form></div>}
  </section>;
}
