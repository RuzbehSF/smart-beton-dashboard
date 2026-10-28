import React, {useEffect, useRef, useState} from 'react';
import {invoke} from './native';

type Entry = {id:number; name:string; username:string; kind?:string; category?:string; website_url?:string; device_alias?:string; anydesk_address?:string; hostname?:string; port?:number|null; auth_type?:string; ssh_key_ref?:string; database_type?:string; database_name?:string; service_name?:string; account_label?:string; expiry_date?:string|null; description?:string; tags?:string; is_favorite?:boolean; project_id?:number|null; connection_id?:number|null};
type Draft = {kind:string; name:string; username:string; secret:string; category:string; website_url:string; device_alias:string; anydesk_address:string; hostname:string; port:string; auth_type:string; ssh_key_ref:string; database_type:string; database_name:string; service_name:string; account_label:string; expiry_date:string; description:string; tags:string; is_favorite:boolean; project_id:string; connection_id:string};
type Mode = {type:'add'|'edit'|'replace'; id:number|null};
type Props = {projects?:{id:number; name:string}[]; onPage?:(index:number)=>void; initialKind?:string|null; onKindConsumed?:()=>void};

const KINDS: [string, string][] = [['website', 'Website login'], ['anydesk', 'AnyDesk'], ['server', 'Server'], ['database', 'Database'], ['api_token', 'API token'], ['secure_note', 'Secure note'], ['custom', 'Custom']];
const kindLabel = (kind?:string) => KINDS.find(([id]) => id === (kind ?? 'website'))?.[1] ?? 'Website login';
const EMPTY: Draft = {kind: 'website', name: '', username: '', secret: '', category: '', website_url: '', device_alias: '', anydesk_address: '', hostname: '', port: '', auth_type: 'password', ssh_key_ref: '', database_type: '', database_name: '', service_name: '', account_label: '', expiry_date: '', description: '', tags: '', is_favorite: false, project_id: '', connection_id: ''};
const secretLabel = (kind:string) => kind === 'api_token' ? 'API token' : kind === 'secure_note' ? 'Secure note text' : 'Password';

function draftOf(e:Entry): Draft {
  return {...EMPTY, kind: e.kind ?? 'website', name: e.name, username: e.username ?? '', category: e.category ?? '', website_url: e.website_url ?? '', device_alias: e.device_alias ?? '', anydesk_address: e.anydesk_address ?? '', hostname: e.hostname ?? '', port: e.port ? String(e.port) : '', auth_type: e.auth_type ?? 'password', ssh_key_ref: e.ssh_key_ref ?? '', database_type: e.database_type ?? '', database_name: e.database_name ?? '', service_name: e.service_name ?? '', account_label: e.account_label ?? '', expiry_date: e.expiry_date ?? '', description: e.description ?? '', tags: e.tags ?? '', is_favorite: !!e.is_favorite, project_id: e.project_id ? String(e.project_id) : '', connection_id: e.connection_id ? String(e.connection_id) : ''};
}
function detailsOf(d:Draft) {
  return {kind: d.kind, category: d.category, website_url: d.website_url, device_alias: d.device_alias, anydesk_address: d.anydesk_address, hostname: d.hostname, port: d.port ? Number(d.port) : null, auth_type: d.auth_type, ssh_key_ref: d.ssh_key_ref, database_type: d.database_type, database_name: d.database_name, service_name: d.service_name, account_label: d.account_label, expiry_date: d.expiry_date || null, description: d.description, tags: d.tags, is_favorite: d.is_favorite, project_id: d.project_id ? Number(d.project_id) : null, connection_id: d.connection_id ? Number(d.connection_id) : null};
}
function summary(e:Entry) {
  switch (e.kind ?? 'website') {
    case 'website': return e.website_url ?? '';
    case 'anydesk': return [e.device_alias, e.anydesk_address].filter(Boolean).join(' · ');
    case 'server': return [e.hostname && e.hostname + (e.port ? ':' + e.port : ''), e.auth_type === 'ssh_key' ? 'SSH key' : ''].filter(Boolean).join(' · ');
    case 'database': return [e.database_type, e.hostname && e.hostname + (e.port ? ':' + e.port : ''), e.database_name].filter(Boolean).join(' · ');
    case 'api_token': return [e.service_name, e.account_label, e.expiry_date && 'expires ' + e.expiry_date].filter(Boolean).join(' · ');
    default: return '';
  }
}

export function Vault(props:Props) {
  const projects = props.projects ?? [];
  const [items, setItems] = useState<Entry[]>([]), [connections, setConnections] = useState<{id:number; name:string}[]>([]), [mode, setMode] = useState<Mode|null>(null), [draft, setDraft] = useState<Draft>(EMPTY), [revealed, setRevealed] = useState<{id:number; value:string}|null>(null), [error, setError] = useState(''), [locked, setLocked] = useState(false), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [kindFilter, setKindFilter] = useState('all'), [projectFilter, setProjectFilter] = useState('all'), [favoritesOnly, setFavoritesOnly] = useState(false), [lockMinutes, setLockMinutes] = useState(5);
  const generation = useRef(0);

  async function refresh() { try { const list = await invoke<unknown>('vault_list'); setItems(Array.isArray(list) ? list as Entry[] : []); setError(''); } catch (e) { setError(String(e)); } }
  useEffect(() => {
    refresh();
    (async () => { try { const list = await invoke<unknown>('list_connections'); if (Array.isArray(list)) setConnections(list as {id:number; name:string}[]); } catch { /* optional links */ } })();
    (async () => { try { const all = await invoke<unknown>('get_settings'); const minutes = Number((all as Record<string, string>)?.vault_lock_minutes); if (minutes >= 1 && minutes <= 60) setLockMinutes(minutes); } catch { /* default applies */ } })();
  }, []);
  useEffect(() => { if (props.initialKind) { openAdd(props.initialKind); props.onKindConsumed?.(); } }, []);
  useEffect(() => { if (!revealed) return; const id = window.setTimeout(() => setRevealed(null), 30000); return () => window.clearTimeout(id); }, [revealed]);
  function lock() { generation.current++; setRevealed(null); setDraft(EMPTY); setMode(null); setLocked(true); setError(''); }
  useEffect(() => {
    if (locked) return;
    let timer: number;
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(lock, lockMinutes * 60 * 1000); };
    const hide = () => { if (document.hidden) lock(); };
    window.addEventListener('pointerdown', reset); window.addEventListener('keydown', reset); window.addEventListener('sensitive-clear', lock); document.addEventListener('visibilitychange', hide); reset();
    return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset); window.removeEventListener('sensitive-clear', lock); document.removeEventListener('visibilitychange', hide); };
  }, [locked, lockMinutes]);

  function openAdd(kind = 'website') { setError(''); setNotice(''); setDraft({...EMPTY, kind}); setMode({type: 'add', id: null}); }
  function close() { setDraft(EMPTY); setMode(null); setError(''); }
  const set = (patch:Partial<Draft>) => setDraft({...draft, ...patch});

  async function submit(e:React.FormEvent) {
    e.preventDefault();
    if (!mode) return;
    try {
      let warning: string | null = null;
      if (mode.type === 'replace') warning = await invoke<string|null>('vault_replace_secret', {id: mode.id, secret: draft.secret});
      else if (mode.type === 'add') await invoke('vault_add', {name: draft.name, username: draft.username, secret: draft.secret, details: detailsOf(draft)});
      else await invoke('vault_update_metadata', {id: mode.id, name: draft.name, username: draft.username, details: detailsOf(draft)});
      setNotice(warning ?? ''); close(); await refresh();
    } catch (err) { setError(String(err)); }
  }
  async function reveal(id:number) {
    const requested = generation.current;
    try { const value = await invoke<string>('vault_reveal', {id}); if (requested === generation.current) { setRevealed({id, value}); setError(''); } } catch (err) { if (requested === generation.current) setError(String(err)); }
  }
  async function copySecret(id:number, label:string) { try { await invoke('vault_copy_secret', {id}); setNotice(`${label} copied; it is cleared from the clipboard after the time set in Settings if unchanged.`); setError(''); } catch (err) { setError(String(err)); } }
  async function copyText(text:string, label:string) { try { await navigator.clipboard.writeText(text); setNotice(`${label} copied.`); } catch { setError('Could not copy to the clipboard.'); } }
  async function remove(id:number) { if (!window.confirm('Permanently delete this protected credential?')) return; try { await invoke('vault_delete', {id}); setRevealed(null); await refresh(); } catch (err) { setError(String(err)); } }
  async function toggleFavorite(entry:Entry) { try { const d = draftOf(entry); await invoke('vault_update_metadata', {id: entry.id, name: entry.name, username: entry.username ?? '', details: detailsOf({...d, is_favorite: !entry.is_favorite})}); await refresh(); } catch (err) { setError(String(err)); } }
  async function editSecretText(entry:Entry) {
    try { const value = await invoke<string>('vault_reveal', {id: entry.id}); setDraft({...draftOf(entry), secret: value}); setMode({type: 'replace', id: entry.id}); setError(''); setNotice(''); setRevealed(null); } catch (err) { setError(String(err)); }
  }

  const needle = query.trim().toLocaleLowerCase();
  const visible = items.filter(x => {
    if (kindFilter !== 'all' && (x.kind ?? 'website') !== kindFilter) return false;
    if (projectFilter !== 'all' && String(x.project_id ?? '') !== projectFilter) return false;
    if (favoritesOnly && !x.is_favorite) return false;
    return !needle || [x.name, x.username, kindLabel(x.kind), x.category, x.tags, x.website_url, x.hostname, x.service_name, x.description, x.device_alias, x.anydesk_address, x.account_label, x.database_name].some(v => (v ?? '').toLocaleLowerCase().includes(needle));
  });
  const projectName = (id?:number|null) => projects.find(x => x.id === id)?.name;
  const connectionName = (id?:number|null) => connections.find(x => x.id === id)?.name;
  const kind = draft.kind, isNote = kind === 'secure_note', replacing = mode?.type === 'replace', adding = mode?.type === 'add';

  return <section className="card collection vault-page">
    <div className="row"><h2>Secure Vault</h2>{locked ? <button onClick={() => setLocked(false)}>Unlock view</button> : <><button onClick={lock}>Lock view</button><button onClick={() => openAdd()}>Add credential</button><button onClick={() => openAdd('secure_note')}>New secure note</button></>}</div>
    <p className="muted">Experimental: secrets use Windows Credential Manager under this Windows account; secure notes are also encrypted with Windows DPAPI. Database backups do not include them. The view lock is not additional authentication. Do not rely on this vault until security testing is complete.</p>
    {locked ? <p>Vault view locked.</p> : <>
      <div className="proj-toolbar">
        <input className="search" aria-label="Search vault metadata" placeholder="Search names, usernames, categories and tags (never secrets)" value={query} onChange={e => setQuery(e.target.value)}/>
        <label>Type<select value={kindFilter} onChange={e => setKindFilter(e.target.value)}><option value="all">All types</option>{KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Project<select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}><option value="all">All projects</option>{projects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="inline-check"><input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)}/>Favorites only</label>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && !mode && <p role="alert" className="error">{error}</p>}
      {visible.map(item => {
        const shown = revealed?.id === item.id, note = (item.kind ?? 'website') === 'secure_note', line = summary(item), tags = (item.tags ?? '').split(',').map(t => t.trim()).filter(Boolean);
        return <article className="item vault-item" key={item.id}>
          <div className="vault-main">
            <div className="row"><strong>{item.name}</strong><button className="link tiny star" aria-pressed={!!item.is_favorite} aria-label={item.is_favorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`} onClick={() => toggleFavorite(item)}>{item.is_favorite ? '★' : '☆'}</button></div>
            <div className="chips"><span className="chip">{kindLabel(item.kind)}</span>{item.category && <span className="chip">{item.category}</span>}{tags.map(t => <span className="chip" key={t}>{t}</span>)}{projectName(item.project_id) && <span className="chip">{projectName(item.project_id)}</span>}</div>
            {line && <p dir="ltr" className="muted"><bdi>{line}</bdi></p>}
            {item.username && <p dir="auto">{item.username}</p>}
            {item.description && <p className="muted">{item.description}</p>}
            {connectionName(item.connection_id) && <p className="muted">Linked server: {connectionName(item.connection_id)}</p>}
            {shown && (note ? <pre className="secret-note"><bdi>{revealed.value}</bdi></pre> : <p><bdi>{revealed.value}</bdi></p>)}
          </div>
          <div className="row actions">
            {shown ? <button className="link" onClick={() => setRevealed(null)}>Hide</button> : <button className="link" onClick={() => reveal(item.id)}>Reveal</button>}
            <button className="link" onClick={() => copySecret(item.id, note ? 'Text' : (item.kind === 'api_token' ? 'Token' : 'Password'))}>{note ? 'Copy text' : item.kind === 'api_token' ? 'Copy token' : 'Copy password'}</button>
            {!!item.username && !note && <button className="link" onClick={() => copyText(item.username, 'Username')}>Copy username</button>}
            {!!item.anydesk_address && <button className="link" onClick={() => copyText(item.anydesk_address!, 'AnyDesk ID')}>Copy AnyDesk ID</button>}
            {!!item.website_url && <button className="link" onClick={() => invoke('open_external_url', {url: item.website_url}).catch(err => setError(String(err)))}>Open website</button>}
            {!!item.connection_id && <button className="link" onClick={() => props.onPage?.(4)}>View server</button>}
            <button className="link" onClick={() => { setError(''); setNotice(''); setRevealed(null); setDraft(draftOf(item)); setMode({type: 'edit', id: item.id}); }}>Edit details</button>
            {note ? <button className="link" onClick={() => editSecretText(item)}>Edit text</button> : <button className="link" onClick={() => { setError(''); setNotice(''); setRevealed(null); setDraft({...draftOf(item), secret: ''}); setMode({type: 'replace', id: item.id}); }}>Replace secret</button>}
            <button className="link" onClick={() => remove(item.id)}>Delete</button>
          </div>
        </article>;
      })}
      {!visible.length && <p className="muted">{items.length ? 'No credentials match these filters.' : 'No credentials yet. Add one, or create a secure note instead of keeping secrets in ordinary notes.'}</p>}
    </>}

    {mode && !locked && <div className="overlay"><form className="dialog vault-dialog" role="dialog" aria-modal="true" aria-label="Credential" onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <h2>{replacing ? (isNote ? 'Edit secure note text' : 'Replace secret') : adding ? 'New credential' : 'Edit details'}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {!replacing && <>
        {adding && <label>Type<select value={kind} onChange={e => set({kind: e.target.value})}>{KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
        <label>{isNote ? 'Title' : 'Name'}<input autoFocus required value={draft.name} onChange={e => set({name: e.target.value})}/></label>
        {kind === 'website' && <label>Website address<input dir="ltr" placeholder="https://" value={draft.website_url} onChange={e => set({website_url: e.target.value})}/></label>}
        {kind === 'anydesk' && <><label>Device alias<input value={draft.device_alias} onChange={e => set({device_alias: e.target.value})}/></label><label>AnyDesk ID or alias<input dir="ltr" value={draft.anydesk_address} onChange={e => set({anydesk_address: e.target.value})}/></label></>}
        {(kind === 'server' || kind === 'database') && <div className="two-col"><label>Host name or IP<input dir="ltr" value={draft.hostname} onChange={e => set({hostname: e.target.value})}/></label><label>Port<input type="number" min="1" max="65535" dir="ltr" value={draft.port} onChange={e => set({port: e.target.value})}/></label></div>}
        {kind === 'server' && <div className="two-col"><label>Authentication<select value={draft.auth_type} onChange={e => set({auth_type: e.target.value})}><option value="password">Password</option><option value="ssh_key">SSH key</option></select></label>{draft.auth_type === 'ssh_key' && <label>SSH key file (path only)<input dir="ltr" value={draft.ssh_key_ref} onChange={e => set({ssh_key_ref: e.target.value})}/></label>}</div>}
        {kind === 'database' && <div className="two-col"><label>Database type<input placeholder="PostgreSQL, MySQL…" value={draft.database_type} onChange={e => set({database_type: e.target.value})}/></label><label>Database name<input dir="ltr" value={draft.database_name} onChange={e => set({database_name: e.target.value})}/></label></div>}
        {kind === 'api_token' && <><div className="two-col"><label>Service<input value={draft.service_name} onChange={e => set({service_name: e.target.value})}/></label><label>Account label<input value={draft.account_label} onChange={e => set({account_label: e.target.value})}/></label></div><label>Expiry date (optional)<input type="date" value={draft.expiry_date} onChange={e => set({expiry_date: e.target.value})}/></label></>}
        {!isNote && kind !== 'api_token' && <label>Username<input value={draft.username} onChange={e => set({username: e.target.value})}/></label>}
        <div className="two-col"><label>Category<input value={draft.category} onChange={e => set({category: e.target.value})}/></label><label>Tags (comma separated)<input value={draft.tags} onChange={e => set({tags: e.target.value})}/></label></div>
        <label>Notes (not secret)<textarea className="short" value={draft.description} onChange={e => set({description: e.target.value})}/></label>
        <div className="two-col"><label>Project<select value={draft.project_id} onChange={e => set({project_id: e.target.value})}><option value="">None</option>{projects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{!isNote && <label>Linked server<select value={draft.connection_id} onChange={e => set({connection_id: e.target.value})}><option value="">None</option>{connections.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}</div>
        <label className="inline-check"><input type="checkbox" checked={draft.is_favorite} onChange={e => set({is_favorite: e.target.checked})}/>Favorite</label>
      </>}
      {adding && (isNote
        ? <label>{secretLabel(kind)}<textarea required autoComplete="off" value={draft.secret} onChange={e => set({secret: e.target.value})}/></label>
        : <label>{secretLabel(kind)}<input type="password" required autoComplete="new-password" value={draft.secret} onChange={e => set({secret: e.target.value})}/></label>)}
      {replacing && (isNote
        ? <label>{secretLabel(kind)}<textarea required autoComplete="off" value={draft.secret} onChange={e => set({secret: e.target.value})}/></label>
        : <label>Secret<input type="password" autoFocus required autoComplete="new-password" value={draft.secret} onChange={e => set({secret: e.target.value})}/></label>)}
      <div className="row"><button type="button" className="secondary" onClick={close}>Cancel</button><button>Save</button></div>
    </form></div>}
  </section>;
}
