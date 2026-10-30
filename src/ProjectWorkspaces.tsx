import {createPortal} from 'react-dom';
import React, {useEffect, useState} from 'react';
import {invoke} from './native';
import {HARNESSES, type ProjectRecord} from './domain';

type Profile = {id:number|null; project_id:number; name:string; open_folder:boolean; launch_editor:boolean; ai_harness:string; launch_terminal:boolean; doc_url:string; show_notes:boolean; show_tasks:boolean};
type Result = {launched:string[]; failed:string[]; show_notes:boolean; show_tasks:boolean};
type Props = {project:ProjectRecord; onNavigate:(tab:string)=>void; onError:(message:string)=>void; onChanged:()=>void};

const blank = (projectId:number): Profile => ({id: null, project_id: projectId, name: '', open_folder: true, launch_editor: true, ai_harness: '', launch_terminal: false, doc_url: '', show_notes: false, show_tasks: false});
const templates = (p:ProjectRecord): [string, Partial<Profile>][] => [
  ['Development', {name: 'Development', open_folder: true, launch_editor: true, ai_harness: p.ai_harness ?? 'claude'}],
  ['Debugging', {name: 'Debugging', open_folder: false, launch_editor: true, launch_terminal: true, show_tasks: true}],
  ['Deployment preparation', {name: 'Deployment preparation', open_folder: false, launch_editor: false, show_notes: true, show_tasks: true}],
];
const describe = (x:Profile) => [x.open_folder && 'folder', x.launch_editor && 'VS Code', x.ai_harness && HARNESSES.find(([id]) => id === x.ai_harness)?.[1], x.launch_terminal && 'terminal', x.doc_url && 'documentation', x.show_notes && 'notes', x.show_tasks && 'tasks'].filter(Boolean).join(' · ') || 'No actions';

/** Saved launch sets for a project. Profiles only open things; they never run builds, scripts or deployments. */
export function ProjectWorkspaces({project, onNavigate, onError, onChanged}:Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]), [form, setForm] = useState<Profile|null>(null), [notice, setNotice] = useState('');
  async function load() { try { const list = await invoke<unknown>('list_workspace_profiles', {projectId: project.id}); setProfiles(Array.isArray(list) ? list as Profile[] : []); } catch (e) { onError(String(e)); } }
  useEffect(() => { load(); }, [project.id]);
  async function save(profile:Profile) { try { await invoke('save_workspace_profile', {profile}); setForm(null); await load(); return true; } catch (e) { onError(String(e)); return false; } }
  async function run(profile:Profile) {
    try {
      const result = await invoke<Result>('run_workspace_profile', {id: profile.id});
      onError(result?.failed?.length ? result.failed.join('\n') : '');
      setNotice(result?.launched?.length ? `Opened: ${result.launched.join(', ')}.` : 'Nothing was opened.');
      onChanged();
      if (result?.show_notes) onNavigate('notes'); else if (result?.show_tasks) onNavigate('tasks');
    } catch (e) { onError(String(e)); }
  }
  async function remove(profile:Profile) { if (!window.confirm(`Delete the profile "${profile.name}"?`)) return; try { await invoke('delete_workspace_profile', {id: profile.id}); await load(); } catch (e) { onError(String(e)); } }
  return <div className="workspaces-tab">
    <div className="row"><h3>Workspace profiles</h3><button onClick={() => {onError(''); setForm(blank(project.id));}}>＋ New profile</button></div>
    <p className="muted">A profile is a saved set of things to open for this project. Start from a template, or build your own.</p>
    <div className="templates">{templates(project).map(([label, values]) => <button className="link" key={label} onClick={() => save({...blank(project.id), ...values} as Profile)}>{`Add "${label}"`}</button>)}</div>
    {notice && <p role="status" className="status-line">{notice}</p>}
    {profiles.map(x => <div className="item" key={x.id}><div><strong>{x.name}</strong><p className="muted">{describe(x)}</p></div>
      <button className="link" onClick={() => run(x)}>Run</button><button className="link" onClick={() => {onError(''); setForm(x);}}>Edit</button><button className="link danger" onClick={() => remove(x)}>Delete</button></div>)}
    {!profiles.length && <p className="muted">No profiles yet.</p>}
    {form && createPortal(<div className="overlay"><form className="dialog" role="dialog" aria-modal="true" aria-label="Workspace profile" onSubmit={async e => { e.preventDefault(); await save(form); }} onKeyDown={e => { if (e.key === 'Escape') setForm(null); }}>
      <h2>{form.id ? 'Edit profile' : 'New profile'}</h2>
      <label>Name<input required maxLength={60} value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
      <label className="inline-check"><input type="checkbox" checked={form.open_folder} onChange={e => setForm({...form, open_folder: e.target.checked})}/>Open the project folder</label>
      <label className="inline-check"><input type="checkbox" checked={form.launch_editor} onChange={e => setForm({...form, launch_editor: e.target.checked})}/>Open in VS Code</label>
      <label>Also open in an AI tool<select value={form.ai_harness} onChange={e => setForm({...form, ai_harness: e.target.value})}><option value="">None</option>{HARNESSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="inline-check"><input type="checkbox" checked={form.launch_terminal} onChange={e => setForm({...form, launch_terminal: e.target.checked})}/>Open a terminal in the project</label>
      <label>Documentation link (optional)<input dir="ltr" placeholder="https://" value={form.doc_url} onChange={e => setForm({...form, doc_url: e.target.value})}/></label>
      <label className="inline-check"><input type="checkbox" checked={form.show_notes} onChange={e => setForm({...form, show_notes: e.target.checked})}/>Show the project notes</label>
      <label className="inline-check"><input type="checkbox" checked={form.show_tasks} onChange={e => setForm({...form, show_tasks: e.target.checked})}/>Show the project tasks</label>
      <div className="row"><button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button><button>Save</button></div>
    </form></div>, document.querySelector('.app') ?? document.body)}
  </div>;
}
