import {createPortal} from 'react-dom';
import React, {useEffect, useRef, useState} from 'react';
import {invoke} from './native';

type Project = {id:number; name:string; path:string};
type Step = {kind:string; project_id:number|null; title:string};
type Automation = {id:number|null; name:string; description:string; actions:Step[]; trigger_type:string; shortcut:string; enabled:boolean; schedule_time:string; schedule_days:string; schedule_kind:string; schedule_month_day:number};
type SavedCommand = {id:number; name:string; risk_level?:string};
type Props = {projects:Project[]; onChanged:()=>void; onShowNotes?:(projectId:number)=>void; autoRunId?:number|null; onAutoRunHandled?:()=>void};

const KINDS: [string, string][] = [['create_task', 'Create task'], ['create_note', 'Create note'], ['open_project', 'Open project folder'], ['open_app', 'Open tool in project'], ['show_notes', 'Show project notes'], ['open_url', 'Open web URL'], ['run_command', 'Run saved command'], ['start_session', 'Start working session'], ['end_session', 'End working session']];
const TOOLS: [string, string][] = [['vscode', 'VS Code'], ['claude', 'Claude Code'], ['codex', 'Codex'], ['antigravity', 'Antigravity'], ['terminal', 'Terminal']];
const NEEDS_PROJECT = ['open_project', 'open_app', 'show_notes', 'start_session', 'end_session'];
const TEMPLATES: [string, Step[]][] = [
  ['Start development', [{kind: 'open_project', project_id: null, title: ''}, {kind: 'open_app', project_id: null, title: 'vscode'}, {kind: 'start_session', project_id: null, title: ''}]],
  ['Open project workspace', [{kind: 'open_project', project_id: null, title: ''}, {kind: 'open_app', project_id: null, title: 'vscode'}, {kind: 'show_notes', project_id: null, title: ''}]],
  ['Start debugging', [{kind: 'open_app', project_id: null, title: 'terminal'}, {kind: 'open_app', project_id: null, title: 'vscode'}]],
  ['Finish working session', [{kind: 'end_session', project_id: null, title: ''}, {kind: 'create_task', project_id: null, title: 'Follow up'}]],
];
const blank = (): Automation => ({id: null, name: '', description: '', actions: [], trigger_type: 'manual', shortcut: '', enabled: true, schedule_time: '', schedule_days: '1,2,3,4,5,6,7', schedule_kind: 'daily', schedule_month_day: 1});
const normalize = (a:Automation): Automation => ({...blank(), ...a});
const DAYS: [string, string][] = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];
const scheduleText = (a:Automation) => a.schedule_kind === 'daily' ? `Every day at ${a.schedule_time}` : a.schedule_kind === 'monthly' ? `Monthly on day ${a.schedule_month_day} at ${a.schedule_time}` : `Weekly on ${a.schedule_days.split(',').map(d => DAYS.find(([id]) => id === d.trim())?.[1]).filter(Boolean).join(', ')} at ${a.schedule_time}`;
const newStep = (kind:string): Step => ({kind, project_id: null, title: kind === 'open_app' ? 'vscode' : ''});

export function Automations({projects, onChanged, onShowNotes, autoRunId, onAutoRunHandled}: Props) {
  const [items, setItems] = useState<Automation[]>([]), [form, setForm] = useState<Automation|null>(null), [commands, setCommands] = useState<SavedCommand[]>([]), [error, setError] = useState(''), [progress, setProgress] = useState(''), [running, setRunning] = useState(false);
  const cancelled = useRef(false);
  async function refresh() { try { const list = await invoke<unknown>('list_automations'); setItems(Array.isArray(list) ? (list as Automation[]).map(normalize) : []); setError(''); } catch (e) { setError(String(e)); } }
  useEffect(() => {
    refresh();
    (async () => { try { const list = await invoke<unknown>('list_commands'); if (Array.isArray(list)) setCommands(list as SavedCommand[]); } catch { /* optional */ } })();
  }, []);
  useEffect(() => {
    if (autoRunId == null || !items.length || running) return;
    const item = items.find(x => x.id === autoRunId);
    onAutoRunHandled?.();
    if (item) run(item); else setError('That automation no longer exists.');
  }, [autoRunId, items.length, running]);

  function updateStep(index:number, patch:Partial<Step>) { if (!form) return; setForm({...form, actions: form.actions.map((step, i) => i === index ? {...step, ...patch} : step)}); }
  function move(index:number, delta:number) { if (!form) return; const next = [...form.actions], target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setForm({...form, actions: next}); }
  async function save(e:React.FormEvent) { e.preventDefault(); if (!form) return; try { await invoke('save_automation', {item: form}); setForm(null); await refresh(); } catch (err) { setError(String(err)); await refresh(); } }
  async function remove(id:number) { if (!window.confirm('Delete this automation?')) return; try { await invoke('delete_automation', {id}); await refresh(); } catch (e) { setError(String(e)); } }
  async function toggleEnabled(item:Automation) { try { await invoke('save_automation', {item: {...item, enabled: !item.enabled}}); await refresh(); } catch (e) { setError(String(e)); } }
  const projectName = (id:number|null) => projects.find(p => p.id === id)?.name;
  function describe(step:Step) {
    const project = projectName(step.project_id);
    switch (step.kind) {
      case 'open_url': return `Open URL: ${step.title}`;
      case 'open_project': return `Open project folder: ${projects.find(p => p.id === step.project_id)?.path ?? 'Unavailable'}`;
      case 'open_app': return `Open ${TOOLS.find(([id]) => id === step.title)?.[1] ?? step.title} in ${project ?? 'unavailable project'}`;
      case 'show_notes': return `Show notes of ${project ?? 'unavailable project'}`;
      case 'start_session': return `Start working session in ${project ?? 'unavailable project'}`;
      case 'end_session': return `End working session in ${project ?? 'unavailable project'}`;
      case 'run_command': return `Run saved command: ${commands.find(c => String(c.id) === step.title)?.name ?? 'unavailable command'}`;
      default: return `${step.kind === 'create_note' ? 'Create note' : 'Create task'}: ${step.title}${project ? ' · ' + project : ''}`;
    }
  }
  async function notify(title:string, body:string) { try { await invoke('notify_user', {kind: 'automations', title, body}); } catch { /* optional */ } }
  async function run(item:Automation) {
    if (!item.enabled) { setError('This automation is disabled. Enable it first.'); return; }
    const preview = item.actions.map((s, i) => `${i + 1}. ${describe(s)}`).join('\n');
    if (!window.confirm(`Run these actions in order?\n${preview}`)) return;
    cancelled.current = false; setRunning(true); setError('');
    let notes: number|null = null;
    try {
      for (let i = 0; i < item.actions.length; i++) {
        if (cancelled.current) { setProgress('Cancelled before the next action.'); return; }
        setProgress(`Running action ${i + 1}/${item.actions.length}`);
        const job = await invoke<unknown>('run_automation_step', {confirmed: item, index: i});
        if (typeof job === 'string') sessionStorage.setItem('command_job', job);
        if (item.actions[i].kind === 'show_notes') notes = item.actions[i].project_id;
      }
      setProgress('All actions processed; external applications may still be running.');
      notify('Automation finished', `${item.name} completed.`);
      if (notes !== null) onShowNotes?.(notes);
    } catch (e) {
      setError(String(e)); setProgress('Stopped after an error. Earlier actions were not undone.');
      notify('Automation failed', `${item.name} stopped after an error.`);
    } finally { setRunning(false); onChanged(); }
  }

  const stepKinds = (s:Step) => KINDS.map(([id, text]) => <option key={id} value={id}>{text}</option>);
  return <section className="card collection automations-page">
    <div className="row"><h2>Automations</h2><button disabled={running} onClick={() => {setError(''); setForm(blank());}}>Add automation</button></div>
    <p className="muted">Manual actions, optional keyboard shortcuts and daily schedules. A shortcut or schedule only brings this window forward and shows the review; nothing runs until you confirm. Completed actions are not rolled back. Values are stored unencrypted; do not include secrets in URLs or titles.</p>
    {error && !form && <p className="error" role="alert">{error}</p>}
    {progress && <p role="status">{progress}</p>}
    {running && <button onClick={() => {cancelled.current = true;}}>Cancel remaining actions</button>}
    {items.map(item => <article className="item" key={item.id}>
      <div className="vault-main"><div className="row"><strong>{item.name}</strong></div>
        <div className="chips"><span className="chip">{item.trigger_type === 'shortcut' ? `Shortcut ${item.shortcut}` : item.trigger_type === 'scheduled' ? scheduleText(item) : 'Manual'}</span>{!item.enabled && <span className="chip">Disabled</span>}</div>
        <p>{item.description}</p><ol>{item.actions.map((step, i) => <li key={i}>{describe(step)}</li>)}</ol></div>
      <div className="row actions">
        <button className="link" disabled={running || !item.enabled} onClick={() => run(item)}>Review and run</button>
        <button className="link" disabled={running} onClick={() => toggleEnabled(item)}>{item.enabled ? 'Disable' : 'Enable'}</button>
        <button className="link" disabled={running} onClick={() => {setError(''); setForm(item);}}>Edit</button>
        <button className="link" disabled={running} onClick={() => remove(item.id!)}>Delete</button></div>
    </article>)}
    {!items.length && <div className="collection-empty"><p>No automations yet. Start with a template or create your own.</p><button className="link" disabled={running} onClick={() => {setError(''); setForm(blank());}}>Create automation</button></div>}

    {form && createPortal(<div className="overlay"><form className="dialog wide-dialog" role="dialog" aria-modal="true" aria-label="Automation" onSubmit={save}>
      <h2>Automation</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {!form.id && !form.actions.length && <div className="templates"><span className="muted">Start from a template (choose the projects afterwards):</span>{TEMPLATES.map(([name, steps]) => <button type="button" className="link" key={name} onClick={() => setForm({...form, name: form.name || name, actions: steps.map(s => ({...s}))})}>{name}</button>)}</div>}
      <label>Name<input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
      <label>Description<input value={form.description} onChange={e => setForm({...form, description: e.target.value})}/></label>
      <div className="two-col"><label>Trigger<select value={form.trigger_type} onChange={e => setForm({...form, trigger_type: e.target.value, shortcut: e.target.value === 'shortcut' ? form.shortcut : '', schedule_time: e.target.value === 'scheduled' ? (form.schedule_time || '09:00') : form.schedule_time})}><option value="manual">Manual</option><option value="shortcut">Keyboard shortcut</option><option value="scheduled">Scheduled</option></select></label>
        {form.trigger_type === 'scheduled' && <><label>Repeats<select value={form.schedule_kind} onChange={e => setForm({...form, schedule_kind: e.target.value})}><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label><label>Time<input type="time" required value={form.schedule_time} onChange={e => setForm({...form, schedule_time: e.target.value})}/></label>{form.schedule_kind === 'monthly' && <label>Day of the month<input type="number" min="1" max="31" required value={form.schedule_month_day} onChange={e => setForm({...form, schedule_month_day: Number(e.target.value)})}/></label>}</>}{form.trigger_type === 'shortcut' && <label>Shortcut<input dir="ltr" placeholder="Ctrl+Alt+J" value={form.shortcut} onChange={e => setForm({...form, shortcut: e.target.value})}/></label>}</div>
      {form.trigger_type === 'scheduled' && form.schedule_kind === 'weekly' && <fieldset className="project-checks"><legend>Days</legend>{DAYS.map(([id, label]) => <label className="inline-check" key={id}><input type="checkbox" checked={form.schedule_days.split(',').includes(id)} onChange={e => { const set = new Set(form.schedule_days.split(',').filter(Boolean)); if (e.target.checked) set.add(id); else set.delete(id); setForm({...form, schedule_days: DAYS.map(([d]) => d).filter(d => set.has(d)).join(',')}); }}/>{label}</label>)}</fieldset>}
      {form.trigger_type === 'scheduled' && <p className="muted">It is offered at that time while the app is running (it can stay in the tray). If the app was closed then, the latest missed run is offered once when it starts (Settings can turn this off). A month shorter than the chosen day uses its last day. You always review and confirm before anything runs.</p>}
      <label className="inline-check"><input type="checkbox" checked={form.enabled} onChange={e => setForm({...form, enabled: e.target.checked})}/>Enabled</label>
      {form.actions.map((step, i) => <div className="item" key={i}><div>
        <label>Action<select value={step.kind} onChange={e => setForm({...form, actions: form.actions.map((s, j) => j === i ? newStep(e.target.value) : s)})}>{stepKinds(step)}</select></label>
        {(step.kind === 'create_task' || step.kind === 'create_note') && <label>Title<input required value={step.title} onChange={e => updateStep(i, {title: e.target.value})}/></label>}
        {step.kind === 'open_url' && <label>HTTP or HTTPS URL<input required dir="ltr" value={step.title} onChange={e => updateStep(i, {title: e.target.value})}/></label>}
        {step.kind === 'open_app' && <label>Tool<select value={step.title} onChange={e => updateStep(i, {title: e.target.value})}>{TOOLS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>}
        {step.kind === 'run_command' && <label>Saved command<select required value={step.title} onChange={e => updateStep(i, {title: e.target.value})}><option value="">Choose…</option>{commands.filter(c => c.risk_level !== 'sensitive').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {step.kind !== 'open_url' && step.kind !== 'run_command' && <label>Project<select required={NEEDS_PROJECT.includes(step.kind)} value={step.project_id ?? ''} onChange={e => updateStep(i, {project_id: e.target.value ? Number(e.target.value) : null})}><option value="">{NEEDS_PROJECT.includes(step.kind) ? 'Choose…' : 'None'}</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      </div>
        <button type="button" className="link" disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button type="button" className="link" disabled={i === form.actions.length - 1} onClick={() => move(i, 1)}>↓</button>
        <button type="button" className="link" onClick={() => setForm({...form, actions: form.actions.filter((_, j) => j !== i)})}>Remove</button></div>)}
      <button type="button" disabled={form.actions.length >= 20} onClick={() => setForm({...form, actions: [...form.actions, newStep('create_task')]})}>Add action</button>
      <div className="row"><button type="button" className="secondary" onClick={() => {setForm(null); setError('');}}>Cancel</button><button disabled={!form.actions.length}>Save</button></div>
    </form></div>, document.querySelector('.app') ?? document.body)}
  </section>;
}
