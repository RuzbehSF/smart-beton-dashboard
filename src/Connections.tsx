import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {invoke} from './native';

type Project = {id:number; name:string};
type Connection = {id:number|null; name:string; kind:string; address:string; port:number|null; username:string; project_id:number|null; environment:string; description:string; website_url:string; credential_id:number|null; project_ids:number[]};
type Credential = {id:number; name:string};
const KINDS: [string, string][] = [['ssh', 'SSH'], ['rdp', 'RDP'], ['web', 'Web panel'], ['anydesk', 'AnyDesk'], ['database', 'Database'], ['local_service', 'Local service'], ['other', 'Other']];
const ENVIRONMENTS: [string, string][] = [['local', 'Local'], ['development', 'Development'], ['testing', 'Testing'], ['staging', 'Staging'], ['production', 'Production']];
const blank = (): Connection => ({id: null, name: '', kind: 'ssh', address: '', port: null, username: '', project_id: null, environment: 'development', description: '', website_url: '', credential_id: null, project_ids: []});
const label = (list:[string, string][], id:string) => list.find(([key]) => key === id)?.[1] ?? id;
const normalize = (c:Connection): Connection => ({...blank(), ...c, project_ids: c.project_ids ?? (c.project_id ? [c.project_id] : [])});

function instructions(c:Connection): string {
  const port = c.port ? ` (port ${c.port})` : '';
  switch (c.kind) {
    case 'ssh': return `ssh ${c.port ? `-p ${c.port} ` : ''}${c.username ? c.username + '@' : ''}${c.address}\nHost key verification stays on. Enter the password in the terminal; it is never stored here.`;
    case 'rdp': return `mstsc /v:${c.address}${c.port ? ':' + c.port : ''}\nThe Remote Desktop client asks for credentials itself.`;
    case 'web': return `${c.address}${port}\nOpens in your default browser.`;
    case 'anydesk': return `AnyDesk ID: ${c.address}\nOpens the installed AnyDesk app; enter the password there.`;
    default: return `${c.address}${c.port ? ':' + c.port : ''}${port ? '' : ''}\nUse your database or service client with the credential linked below.`;
  }
}

export function Connections({projects}: {projects:Project[]}) {
  const [items, setItems] = useState<Connection[]>([]), [form, setForm] = useState<Connection|null>(null), [error, setError] = useState(''), [credentials, setCredentials] = useState<Credential[]>([]), [checks, setChecks] = useState<Record<number, string>>({}), [open, setOpen] = useState<number|null>(null), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [projectFilter, setProjectFilter] = useState('all'), [environmentFilter, setEnvironmentFilter] = useState('all'), [kindFilter, setKindFilter] = useState('all');
  async function refresh() { try { const list = await invoke<unknown>('list_connections'); setItems(Array.isArray(list) ? (list as Connection[]).map(normalize) : []); setError(''); } catch (e) { setError(String(e)); } }
  useEffect(() => {
    refresh();
    (async () => { try { const list = await invoke<unknown>('vault_list'); if (Array.isArray(list)) setCredentials((list as Credential[]).map(x => ({id: x.id, name: x.name}))); } catch { /* the vault is optional here */ } })();
  }, []);
  async function submit(e:React.FormEvent) { e.preventDefault(); if (!form) return; try { await invoke('save_connection', {item: {...form, project_id: form.project_ids[0] ?? null}}); setForm(null); await refresh(); } catch (err) { setError(String(err)); } }
  const risky = (item:Connection) => item.environment === 'production' ? 'This is a PRODUCTION connection.\n' : '';
  const where = (item:Connection) => item.address + (item.port ? ' (port ' + item.port + ')' : '');
  async function openWeb(item:Connection) { if (!window.confirm(risky(item) + 'Open this web connection in your browser?\n' + where(item))) return; try { await invoke('open_web_connection', {id: item.id, confirmedAddress: item.address, confirmedPort: item.port}); setError(''); } catch (e) { setError(String(e)); } }
  async function openRdp(item:Connection) { if (!window.confirm(risky(item) + 'Open Remote Desktop to this host? No password or username will be supplied.\n' + where(item))) return; try { await invoke('open_rdp_connection', {id: item.id, confirmedAddress: item.address, confirmedPort: item.port}); setError(''); } catch (e) { setError(String(e)); } }
  async function openSsh(item:Connection) { if (!window.confirm(risky(item) + 'Open an SSH session? Host key verification stays enabled and no password is supplied.\n' + (item.username ? item.username + '@' : '') + where(item))) return; try { await invoke('open_ssh_connection', {id: item.id, confirmedAddress: item.address, confirmedPort: item.port}); setError(''); } catch (e) { setError(String(e)); } }
  async function openAnyDesk(item:Connection) { if (!window.confirm(risky(item) + 'Open AnyDesk for this ID? No password will be supplied.\n' + item.address)) return; try { await invoke('open_anydesk_connection', {id: item.id, confirmedAddress: item.address}); setError(''); } catch (e) { setError(String(e)); } }
  async function check(item:Connection) {
    if (!window.confirm(risky(item) + `Test whether ${where(item)} accepts a TCP connection? No data is sent.`)) return;
    try { const result = await invoke<{reachable:boolean; message:string}>('check_connection', {id: item.id}); setChecks({...checks, [item.id!]: (result.reachable ? 'Reachable: ' : 'Not reachable: ') + result.message}); setError(''); } catch (e) { setError(String(e)); }
  }
  async function copy(text:string, what:string) { try { await navigator.clipboard.writeText(text); setNotice(`${what} copied.`); } catch { setError('Could not copy to the clipboard.'); } }
  async function remove(id:number) { if (!window.confirm('Delete this connection entry? Nothing on the server is changed.')) return; try { await invoke('delete_connection', {id}); await refresh(); } catch (e) { setError(String(e)); } }

  const needle = query.trim().toLocaleLowerCase();
  const list = items.filter(x => (projectFilter === 'all' || x.project_ids.includes(Number(projectFilter))) && (environmentFilter === 'all' || x.environment === environmentFilter) && (kindFilter === 'all' || x.kind === kindFilter)
    && (!needle || [x.name, x.address, x.username, x.description].some(v => (v ?? '').toLocaleLowerCase().includes(needle))));
  const projectName = (id:number|null) => projects.find(p => p.id === id)?.name;
  const credentialName = (id:number|null) => credentials.find(c => c.id === id)?.name;

  return <section className="card collection connections-page">
    <div className="row"><h2>Server</h2><button onClick={() => {setError(''); setForm(blank());}}>＋ Add</button></div>
    <p className="muted">Metadata only. Do not enter passwords, tokens, or credential-bearing URLs; link a Secure Vault entry instead. Web, SSH, Remote Desktop and AnyDesk entries open after confirmation, and nothing connects on its own.</p>
    <div className="proj-toolbar">
      <input className="search" aria-label="Search connections" placeholder="Search name, address, user or notes" value={query} onChange={e => setQuery(e.target.value)}/>
      <label>Project<select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}><option value="all">All</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Environment<select value={environmentFilter} onChange={e => setEnvironmentFilter(e.target.value)}><option value="all">All</option>{ENVIRONMENTS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
      <label>Type<select value={kindFilter} onChange={e => setKindFilter(e.target.value)}><option value="all">All</option>{KINDS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
      {(query || projectFilter !== 'all' || environmentFilter !== 'all' || kindFilter !== 'all') && <button className="link" onClick={() => {setQuery(''); setProjectFilter('all'); setEnvironmentFilter('all'); setKindFilter('all');}}>Clear filters</button>}
    </div>
    {error && !form && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <p className="collection-count" aria-live="polite">{list.length} {list.length === 1 ? 'connection' : 'connections'}</p>
    {list.map(item => <article className="item connection-item" key={item.id}>
      <div className="vault-main">
        <div className="row"><strong>{item.name}</strong></div>
        <div className="chips"><span className="chip">{label(KINDS, item.kind)}</span><span className={`chip env-${item.environment}`}>{label(ENVIRONMENTS, item.environment)}</span>{item.project_ids.map(id => projectName(id) && <span className="chip" key={id}>{projectName(id)}</span>)}</div>
        <p dir="ltr"><bdi>{item.kind.toUpperCase()} · {item.address}{item.port ? `:${item.port}` : ''}</bdi></p>
        {(item.username || credentialName(item.credential_id)) && <p>{item.username}{item.username && credentialName(item.credential_id) ? ' · ' : ''}{credentialName(item.credential_id) && `Credential: ${credentialName(item.credential_id)}`}</p>}
        {item.description && <p className="muted">{item.description}</p>}
        {checks[item.id!] && <p role="status" className="muted">{checks[item.id!]}</p>}
        {open === item.id && <pre className="instructions" dir="ltr">{instructions(item)}</pre>}
      </div>
      <div className="row actions">
        {item.kind === 'ssh' && <button className="link" onClick={() => openSsh(item)}>Open SSH</button>}
        {item.kind === 'rdp' && <button className="link" onClick={() => openRdp(item)}>Open Remote Desktop</button>}
        {item.kind === 'anydesk' && <button className="link" onClick={() => openAnyDesk(item)}>Open AnyDesk</button>}
        {item.kind === 'web' && <button className="link" onClick={() => openWeb(item)}>Open web panel</button>}
        {!!item.website_url && item.kind !== 'web' && <button className="link" onClick={() => invoke('open_external_url', {url: item.website_url}).catch(e => setError(String(e)))}>Open website</button>}
        {item.kind !== 'anydesk' && <button className="link" onClick={() => check(item)}>Test connection</button>}
        <button className="link" onClick={() => copy(item.address + (item.port && item.kind !== 'web' ? ':' + item.port : ''), 'Address')}>Copy address</button>
        {!!item.username && <button className="link" onClick={() => copy(item.username, 'Username')}>Copy username</button>}
        <button className="link" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>Instructions</button>
        <button className="link" onClick={() => {setError(''); setForm(item);}}>Edit</button>
        <button className="link" onClick={() => remove(item.id!)}>Delete</button>
      </div>
    </article>)}
    {!list.length && <div className="collection-empty"><p>{items.length ? 'No connections match these filters.' : 'No connections saved yet.'}</p>{items.length ? <button className="link" onClick={() => {setQuery(''); setProjectFilter('all'); setEnvironmentFilter('all'); setKindFilter('all');}}>Clear filters</button> : <button className="link" onClick={() => {setError(''); setForm(blank());}}>Add connection</button>}</div>}

    {form && createPortal(<div className="overlay"><form className="dialog" role="dialog" aria-modal="true" aria-label="Connection" onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') setForm(null); }}>
      <h2>{form.id ? 'Edit connection' : 'New connection'}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <label>Name<input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
      <div className="two-col"><label>Type<select value={form.kind} onChange={e => setForm({...form, kind: e.target.value})}>{KINDS.map(([id, text]) => <option key={id} value={id}>{text.toUpperCase()}</option>)}</select></label>
        <label>Environment<select value={form.environment} onChange={e => setForm({...form, environment: e.target.value})}>{ENVIRONMENTS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label></div>
      <label>Address<input required dir="ltr" value={form.address} onChange={e => setForm({...form, address: e.target.value})}/></label>
      <div className="two-col"><label>Port (optional)<input type="number" min="1" max="65535" dir="ltr" value={form.port ?? ''} onChange={e => setForm({...form, port: e.target.value ? Number(e.target.value) : null})}/></label>
        <label>Username (optional)<input dir="ltr" value={form.username} onChange={e => setForm({...form, username: e.target.value})}/></label></div>
      <label>Related website (optional)<input dir="ltr" placeholder="https://" value={form.website_url} onChange={e => setForm({...form, website_url: e.target.value})}/></label>
      <fieldset className="project-checks"><legend>Projects (a server can belong to several)</legend>{projects.map(p => <label className="inline-check" key={p.id}><input type="checkbox" checked={form.project_ids.includes(p.id)} onChange={e => setForm({...form, project_ids: e.target.checked ? [...form.project_ids, p.id] : form.project_ids.filter(x => x !== p.id)})}/>{p.name}</label>)}{!projects.length && <span className="muted">No projects yet</span>}</fieldset>
      <div className="two-col">
        <label>Credential<select value={form.credential_id ?? ''} onChange={e => setForm({...form, credential_id: e.target.value ? Number(e.target.value) : null})}><option value="">None</option>{credentials.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
      <label>Notes<textarea className="short" value={form.description} onChange={e => setForm({...form, description: e.target.value})}/></label>
      <div className="row"><button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button><button>Save</button></div>
    </form></div>, document.querySelector('.app') ?? document.body)}
  </section>;
}
