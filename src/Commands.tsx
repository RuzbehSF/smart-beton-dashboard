import {createPortal} from 'react-dom';
import React, {useEffect, useState} from 'react';
import {invoke, open} from './native';

type Project = {id:number; name:string; path:string};
type Command = {id:number|null; name:string; executable:string; arguments:string[]; project_id:number; description:string; working_directory:string; category:string; risk_level:string; is_favorite:boolean};
type JobStatus = {output:string; truncated:boolean; finished:boolean; exit_code:number|null; error:string|null};
const RISKS: [string, string, string][] = [['read_only', 'Read only', 'Looks at things without changing them.'], ['development', 'Development', 'Builds, tests or edits files inside the project.'], ['sensitive', 'Sensitive', 'Can change systems or data; asks twice and never runs from automations.']];
const riskLabel = (risk?:string) => RISKS.find(([id]) => id === risk)?.[1] ?? 'Development';
const normalize = (c:Command): Command => ({...c, description: c.description ?? '', working_directory: c.working_directory ?? '', category: c.category ?? 'development', risk_level: c.risk_level ?? 'development', is_favorite: !!c.is_favorite});
const commandLine = (c:Command) => [c.executable, ...c.arguments.map(a => /\s|"/.test(a) ? JSON.stringify(a) : a)].join(' ');

export function Commands({projects}: {projects:Project[]}) {
  const [items, setItems] = useState<Command[]>([]), [form, setForm] = useState<Command|null>(null), [args, setArgs] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [search, setSearch] = useState(''), [riskFilter, setRiskFilter] = useState('all'), [categoryFilter, setCategoryFilter] = useState('all'), [favoritesOnly, setFavoritesOnly] = useState(false), [jobId, setJobId] = useState<string|null>(() => sessionStorage.getItem('command_job')), [job, setJob] = useState<JobStatus|null>(null);
  async function refresh() { try { const list = await invoke<unknown>('list_commands'); setItems(Array.isArray(list) ? (list as Command[]).map(normalize) : []); setError(''); } catch (e) { setError(String(e)); } }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    const poll = async () => { try { const state = await invoke<JobStatus>('command_status', {id: jobId}); if (alive) setJob(state); } catch (e) { if (alive) { setError(String(e)); setJobId(null); sessionStorage.removeItem('command_job'); } } };
    poll(); const timer = window.setInterval(poll, 1000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [jobId]);
  useEffect(() => {
    const clear = () => { if (job?.finished) dismiss(); };
    window.addEventListener('sensitive-clear', clear);
    return () => window.removeEventListener('sensitive-clear', clear);
  }, [job?.finished, jobId]);
  async function dismiss() { if (!jobId) return; try { await invoke('dismiss_command', {id: jobId}); setJobId(null); setJob(null); sessionStorage.removeItem('command_job'); } catch (e) { setError(String(e)); } }
  async function cancelJob() { if (!jobId) return; try { await invoke('cancel_command', {id: jobId}); } catch (e) { setError(String(e)); } }
  async function choose() { try { const path = await open({multiple: false, filters: [{name: 'Windows executable', extensions: ['exe']}]}); if (path && form) setForm({...form, executable: path as string}); } catch (e) { setError(String(e)); } }
  async function submit(e:React.FormEvent) {
    e.preventDefault(); if (!form) return;
    try {
      const parsed: unknown = JSON.parse(args);
      if (!Array.isArray(parsed) || !parsed.every(x => typeof x === 'string')) throw new Error('Arguments must be a JSON array of strings');
      await invoke('save_command', {item: {...form, arguments: parsed}}); setForm(null); await refresh();
    } catch (err) { setError(String(err)); }
  }
  async function run(item:Command) {
    const project = projects.find(p => p.id === item.project_id);
    if (!project) { setError('Project is unavailable'); return; }
    const sensitive = item.risk_level === 'sensitive';
    const details = `${sensitive ? 'SENSITIVE COMMAND\n' : ''}Run this executable?\n${item.executable}\n${JSON.stringify(item.arguments)}\nWorking directory: ${project.path}${item.working_directory ? '\\' + item.working_directory : ''}`;
    if (!window.confirm(details)) return;
    if (sensitive && !window.confirm(`"${item.name}" is marked sensitive. Run it now?`)) return;
    try { const id = await invoke<string>('run_command', {confirmed: item}); setJobId(id); sessionStorage.setItem('command_job', id); setJob(null); setMessage(''); setError(''); } catch (err) { setError(String(err)); }
  }
  async function copyCommand(item:Command) { try { await navigator.clipboard.writeText(commandLine(item)); setMessage('Command copied. Run it from a terminal you trust.'); } catch { setError('Could not copy to the clipboard.'); } }
  async function toggleFavorite(item:Command) { try { await invoke('set_command_favorite', {id: item.id, value: !item.is_favorite}); await refresh(); } catch (e) { setError(String(e)); } }
  async function remove(id:number) { if (!window.confirm('Delete this saved command?')) return; try { await invoke('delete_command', {id}); await refresh(); } catch (e) { setError(String(e)); } }

  const categories = [...new Set(items.map(x => x.category).filter(Boolean))].sort();
  const needle = search.toLocaleLowerCase();
  const list = items.filter(x => (riskFilter === 'all' || x.risk_level === riskFilter) && (categoryFilter === 'all' || x.category === categoryFilter) && (!favoritesOnly || x.is_favorite)
    && (!needle || [x.name, x.executable, x.description, x.category].some(v => (v ?? '').toLocaleLowerCase().includes(needle))));

  return <section className="card collection commands-page">
    <div className="row"><h2>Developer Tools</h2><button disabled={!projects.length} title={!projects.length ? 'Import a project first' : undefined} onClick={() => {setError(''); setArgs('[]'); setForm({id: null, name: '', executable: '', arguments: [], project_id: projects[0].id, description: '', working_directory: '', category: 'development', risk_level: 'development', is_favorite: false});}}>Add command</button></div>
    <p className="muted">Only run trusted executables. Arguments are saved in plaintext; never put passwords or tokens in them. Some common shells are blocked, but any executable can perform harmful actions. Output is kept in memory and limited to 64 KiB. It may contain sensitive information.</p>
    {error && !form && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {jobId && <section className="card soft"><h2>Command result</h2><p role="status">{job?.finished ? 'Finished' : 'Running or waiting for output'}{job?.finished && ` · Exit code: ${job.exit_code ?? '—'}`}</p>{job?.error && <p className="error">{job.error}</p>}{job?.truncated && <p>Output truncated at 64 KiB.</p>}<pre className="command-output" dir="ltr">{job?.output}</pre><button disabled={!!job?.finished} onClick={cancelJob}>Cancel command</button><button disabled={!job?.finished} onClick={dismiss}>Dismiss result</button></section>}
    <div className="proj-toolbar">
      <input className="search" aria-label="Search commands" placeholder="Search name, program, category or description" value={search} onChange={e => setSearch(e.target.value)}/>
      <label>Risk<select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}><option value="all">All</option>{RISKS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
      <label>Category<select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">All</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
      <label className="inline-check"><input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)}/>Favorites only</label>
      {(search || riskFilter !== 'all' || categoryFilter !== 'all' || favoritesOnly) && <button className="link" onClick={() => {setSearch(''); setRiskFilter('all'); setCategoryFilter('all'); setFavoritesOnly(false);}}>Clear filters</button>}
    </div>
    <p className="collection-count" aria-live="polite">{list.length} {list.length === 1 ? 'command' : 'commands'}</p>
    {list.map(item => <article className="item connection-item" key={item.id}>
      <div className="vault-main">
        <div className="row"><strong>{item.name}</strong><button className="link tiny star" aria-pressed={item.is_favorite} aria-label={item.is_favorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`} onClick={() => toggleFavorite(item)}>{item.is_favorite ? '★' : '☆'}</button></div>
        <div className="chips"><span className={`chip risk-${item.risk_level}`}>{riskLabel(item.risk_level)}</span><span className="chip">{item.category}</span></div>
        {item.description && <p className="muted">{item.description}</p>}
        <p dir="ltr"><bdi>{item.executable}</bdi></p><pre dir="ltr">{JSON.stringify(item.arguments)}</pre>
        <p dir="auto" className="muted">{projects.find(p => p.id === item.project_id)?.name}{item.working_directory ? ` · ${item.working_directory}` : ''}</p>
      </div>
      <div className="row actions">
        <button className="link" disabled={!!jobId} title={jobId ? 'Dismiss the current result first' : undefined} onClick={() => run(item)}>Review and run</button>
        <button className="link" onClick={() => copyCommand(item)}>Copy command</button>
        <button className="link" onClick={() => {setError(''); setArgs(JSON.stringify(item.arguments, null, 2)); setForm(item);}}>Edit</button>
        <button className="link" onClick={() => remove(item.id!)}>Delete</button>
      </div>
    </article>)}
    {!list.length && <div className="collection-empty"><p>{items.length ? 'No commands match these filters.' : projects.length ? 'No commands saved yet. Use Add command to get started.' : 'Add a project before creating a command.'}</p>{items.length > 0 && <button className="link" onClick={() => {setSearch(''); setRiskFilter('all'); setCategoryFilter('all'); setFavoritesOnly(false);}}>Clear filters</button>}</div>}

    {form && createPortal(<div className="overlay"><form className="dialog" role="dialog" aria-modal="true" aria-label="Command" onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') {setForm(null); setError('');} }}>
      <h2>Command</h2>
      {error && <p role="alert" className="error">{error}</p>}
      <label>Name<input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
      <label>Description (optional)<input value={form.description} onChange={e => setForm({...form, description: e.target.value})}/></label>
      <label>Executable<input required readOnly dir="ltr" value={form.executable}/></label><button type="button" onClick={choose}>Select executable</button>
      <label>Arguments (JSON array)<textarea dir="ltr" value={args} onChange={e => setArgs(e.target.value)}/></label>
      <div className="two-col"><label>Project<select value={form.project_id} onChange={e => setForm({...form, project_id: Number(e.target.value)})}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Subfolder (optional)<input dir="ltr" placeholder="packages\app" value={form.working_directory} onChange={e => setForm({...form, working_directory: e.target.value})}/></label></div>
      <div className="two-col"><label>Category<input required value={form.category} onChange={e => setForm({...form, category: e.target.value})}/></label>
        <label>Risk level<select value={form.risk_level} onChange={e => setForm({...form, risk_level: e.target.value})}>{RISKS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label></div>
      <p className="muted">{RISKS.find(([id]) => id === form.risk_level)?.[2]}</p>
      <label className="inline-check"><input type="checkbox" checked={form.is_favorite} onChange={e => setForm({...form, is_favorite: e.target.checked})}/>Favorite</label>
      <div className="row"><button type="button" className="secondary" onClick={() => {setForm(null); setError('');}}>Cancel</button><button>Save</button></div>
    </form></div>, document.querySelector('.app') ?? document.body)}
  </section>;
}
