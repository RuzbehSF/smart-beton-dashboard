import React, {useEffect, useRef, useState} from 'react';
import {invoke} from './native';
import {noteTags, selectNotes, type Item, type NoteScope} from './domain';
import {Markdown} from './Markdown';
import {codeBlock, linkSelection, numberLines, prefixLines, wrapSelection, type TextEdit} from './markdownEdit';

type Project = {id:number; name:string};
type Category = {id:number; name:string};
type Draft = {title:string; body:string; category:string; tags:string; projectId:number|null};
type SaveState = 'idle'|'unsaved'|'saving'|'saved'|'error'|'needs-title';
type Props = {items:Item[]; projects:Project[]; initialQuery:string; onChanged:()=>void; onPage:(index:number)=>void; onError:(message:string)=>void; onSecureNote?:()=>void};

const EMPTY: Draft = {title:'', body:'', category:'', tags:'', projectId:null};
const TEMPLATES: Record<string, {label:string; title:string; body:string}> = {
  blank: {label:'Blank note', title:'', body:''},
  idea: {label:'Idea', title:'New idea', body:'## Idea\n\n\n## Why it matters\n\n\n## Next step\n\n'},
  bug: {label:'Bug investigation', title:'Bug investigation', body:'## Symptoms\n\n\n## Steps to reproduce\n\n1. \n\n## Findings\n\n\n## Fix\n\n'},
  docs: {label:'Technical documentation', title:'Technical documentation', body:'## Overview\n\n\n## Details\n\n\n## References\n\n'},
  meeting: {label:'Meeting note', title:'Meeting note', body:'## Attendees\n\n\n## Notes\n\n\n## Action items\n\n- [ ] \n'},
  decision: {label:'Project decision', title:'Project decision', body:'## Decision\n\n\n## Context\n\n\n## Alternatives considered\n\n\n## Consequences\n\n'},
  checklist: {label:'Checklist', title:'Checklist', body:'- [ ] \n- [ ] \n- [ ] \n'},
};
const HINTS: Record<string, string> = {blank: 'Start from an empty page', idea: 'Capture an idea and why it matters', bug: 'Symptoms, steps and the fix', docs: 'Overview, details, references', meeting: 'Attendees, notes, action items', decision: 'Decision, context, alternatives', checklist: 'A list to tick off'};
const SCOPES: [NoteScope, string][] = [['all', 'All notes'], ['inbox', 'Idea inbox'], ['pinned', 'Pinned'], ['favorites', 'Favorites'], ['archived', 'Archived'], ['trash', 'Trash']];
const STATUS_TEXT: Record<SaveState, string> = {idle: '', unsaved: 'Unsaved changes…', saving: 'Saving…', saved: 'All changes saved', error: 'Could not save — will retry on your next edit', 'needs-title': 'Add a title to save'};

function draftOf(item:Item): Draft { return {title:item.title, body:item.body, category:item.category ?? '', tags:item.tags ?? '', projectId:item.project_id ?? null}; }
function snippet(body:string) { return body.replace(/[#>*`\-\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90); }

export function Notes(p:Props) {
  const [categories, setCategories] = useState<Category[]>([]), [scope, setScope] = useState<NoteScope>('all'), [category, setCategory] = useState(''), [tag, setTag] = useState(''), [project, setProject] = useState('all'), [query, setQuery] = useState(p.initialQuery), [sort, setSort] = useState<'updated'|'title'|'created'>('updated');
  const [selected, setSelected] = useState<number|'new'|null>(null), [draft, setDraft] = useState<Draft>(EMPTY), [status, setStatus] = useState<SaveState>('idle'), [mode, setMode] = useState<'edit'|'preview'|'split'>('split'), [template, setTemplate] = useState('blank'), [newCategory, setNewCategory] = useState(''), [addingCategory, setAddingCategory] = useState(false);
  const draftRef = useRef<Draft>(EMPTY), idRef = useRef<number|null>(null), dirtyRef = useRef(false), savingRef = useRef(false), pendingSave = useRef<Promise<unknown>|null>(null), timer = useRef<number|undefined>(undefined), areaRef = useRef<HTMLTextAreaElement>(null);

  async function loadCategories() { try { const list = await invoke<unknown>('list_categories'); setCategories(Array.isArray(list) ? list as Category[] : []); } catch (e) { p.onError(String(e)); } }
  useEffect(() => { loadCategories(); return () => { save(); }; }, []);

  async function save(): Promise<void> {
    window.clearTimeout(timer.current);
    if (!dirtyRef.current || savingRef.current) return;
    const d = draftRef.current;
    if (!d.title.trim()) { setStatus('needs-title'); return; }
    savingRef.current = true; dirtyRef.current = false; setStatus('saving');
    let failed = false;
    try {
      const request = invoke<unknown>('save_item', {id: idRef.current, kind: 'note', title: d.title, body: d.body, category: d.category, tags: d.tags, projectId: d.projectId, priority: 'normal', dueDate: null});
      pendingSave.current = request;
      const id = await request;
      if (typeof id === 'number' && idRef.current === null) { idRef.current = id; setSelected(id); }
      setStatus(dirtyRef.current ? 'unsaved' : 'saved');
      p.onChanged();
    } catch (e) { failed = true; dirtyRef.current = true; setStatus('error'); p.onError(String(e)); }
    finally { savingRef.current = false; pendingSave.current = null; }
    if (!failed && dirtyRef.current) timer.current = window.setTimeout(save, 800); // edited while saving
  }
  function change(patch:Partial<Draft>) {
    const next = {...draftRef.current, ...patch};
    draftRef.current = next; setDraft(next); dirtyRef.current = true; setStatus('unsaved');
    window.clearTimeout(timer.current); timer.current = window.setTimeout(save, 800);
  }
  /** Saves pending edits before the editor switches notes; refuses to discard text that has no title. */
  async function leave(): Promise<boolean> {
    if (pendingSave.current) { try { await pendingSave.current; } catch { return false; } }
    if (dirtyRef.current && !draftRef.current.title.trim()) {
      if (draftRef.current.body.trim()) { p.onError('Add a title before leaving this note, or clear its text.'); return false; }
      dirtyRef.current = false;
    }
    await save();
    return !dirtyRef.current;
  }
  function load(id:number|'new', value:Draft) {
    idRef.current = id === 'new' ? null : id; draftRef.current = value; dirtyRef.current = false;
    setDraft(value); setSelected(id); setStatus('idle');
  }
  async function openNote(item:Item) { if (item.id === idRef.current && selected !== null) return; if (!(await leave())) return; load(item.id, draftOf(item)); }
  async function newNote(templateId:string = template) {
    if (!(await leave())) return;
    const t = TEMPLATES[templateId] ?? TEMPLATES.blank;
    load('new', {...EMPTY, title: t.title, body: t.body, category: category && scope !== 'trash' ? category : '', projectId: project !== 'all' ? Number(project) : null});
    if (t.title) { dirtyRef.current = true; setStatus('unsaved'); timer.current = window.setTimeout(save, 400); }
    setScope(scope === 'trash' || scope === 'archived' ? 'all' : scope);
  }
  async function run(command:string, args:Record<string, unknown>) { try { await invoke(command, args); p.onChanged(); return true; } catch (e) { p.onError(String(e)); return false; } }
  async function addCategory(e:React.FormEvent) { e.preventDefault(); if (!newCategory.trim()) return; if (await run('create_category', {name: newCategory})) { setNewCategory(''); setAddingCategory(false); loadCategories(); } }
  async function renameCategory(c:Category) { const name = window.prompt('Rename category', c.name); if (!name || name.trim() === c.name) return; if (await run('rename_category', {id: c.id, name})) { if (category === c.name) setCategory(name.trim()); if (draftRef.current.category === c.name) { draftRef.current = {...draftRef.current, category: name.trim()}; setDraft(draftRef.current); } loadCategories(); } }
  async function removeCategory(c:Category) { if (!window.confirm(`Delete the category "${c.name}"? Its notes are kept and move to the idea inbox.`)) return; if (await run('delete_category', {id: c.id})) { if (category === c.name) setCategory(''); loadCategories(); } }

  /** Applies a formatting edit to the text area and keeps the selection where the edit leaves it. */
  function format(edit:(text:string, start:number, end:number) => TextEdit) {
    const area = areaRef.current;
    if (!area) return;
    const result = edit(area.value, area.selectionStart, area.selectionEnd);
    change({body: result.text});
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(result.start, result.end); });
  }
  const wrap = (before:string, after?:string) => format((t, s, e) => wrapSelection(t, s, e, before, after));

  const current = typeof selected === 'number' ? p.items.find(x => x.id === selected) : undefined;
  const readOnly = !!current?.deleted;
  const notes = p.items.filter(x => x.kind === 'note');
  const tagOptions = [...new Set(notes.filter(x => !x.deleted).flatMap(x => noteTags(x.tags)))].sort();
  const list = selectNotes(p.items, {scope, category, tag, project, query, sort});
  const count = (s:NoteScope) => selectNotes(p.items, {scope: s, category: '', tag: '', project: 'all', query: '', sort: 'updated'}).length;
  const categoryNames = [...new Set([...categories.map(c => c.name), ...(draft.category ? [draft.category] : [])])];

  async function copyContent() { try { await navigator.clipboard.writeText(draftRef.current.body); } catch { p.onError('Could not copy to the clipboard.'); } }
  async function toTask() { if (idRef.current === null || !(await leave())) return; if (await run('convert_note_to_task', {id: idRef.current})) p.onError(''); }
  async function duplicate() { if (idRef.current === null || !(await leave())) return; await run('duplicate_item', {id: idRef.current}); }
  async function trash() { if (idRef.current === null || !window.confirm('Move this note to trash?')) return; if (!(await leave())) return; if (await run('delete_item', {id: idRef.current})) { load('new', EMPTY); setSelected(null); } }

  const words = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0;
  return <section className="notes-layout" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } }}>
    <aside className="card notes-filters" aria-label="Note filters">
      <nav className="collections" aria-label="Note collections">{SCOPES.map(([id, label]) => <button key={id} className={scope === id ? 'filter-btn active' : 'filter-btn'} aria-pressed={scope === id} onClick={() => setScope(id)}>{label}<span className="count">{count(id)}</span></button>)}</nav>
      <details className="side-section notes-disclosure">
        <summary>Categories {category && <span className="disclosure-value">· {category}</span>}</summary>
        <div className="side-head"><h3>Categories</h3><button className="link tiny" aria-label="Add category" aria-expanded={addingCategory} onClick={() => setAddingCategory(v => !v)}>{addingCategory ? '−' : '＋'}</button></div>
        {addingCategory && <form className="goal-form" onSubmit={addCategory}><input aria-label="New category" placeholder="Category name" autoFocus value={newCategory} onChange={e => setNewCategory(e.target.value)}/><button disabled={!newCategory.trim()}>Add</button></form>}
        <div className="filter-list"><button className={category === '' ? 'filter-btn active' : 'filter-btn'} onClick={() => setCategory('')}>Any category</button>
          {categories.map(c => <div className="cat-row" key={c.id}><button className={category === c.name ? 'filter-btn active' : 'filter-btn'} onClick={() => setCategory(category === c.name ? '' : c.name)}>{c.name}</button><span className="cat-actions"><button className="link tiny" aria-label={`Rename ${c.name}`} onClick={() => renameCategory(c)}>✎</button><button className="link tiny" aria-label={`Delete ${c.name}`} onClick={() => removeCategory(c)}>✕</button></span></div>)}</div>
      </details>
      <details className="side-section notes-disclosure">
        <summary>More filters {(tag || project !== 'all') && <span className="disclosure-value">· Active</span>}</summary>
        <label className="field">Tag<select aria-label="Filter by tag" value={tag} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{tagOptions.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="field">Project<select aria-label="Filter by project" value={project} onChange={e => setProject(e.target.value)}><option value="all">All projects</option>{p.projects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </details>
      {(category || tag || project !== 'all' || query) && <button className="link notes-clear" onClick={() => {setCategory(''); setTag(''); setProject('all'); setQuery('');}}>Clear filters</button>}
    </aside>

    <div className="card notes-list" aria-label="Note list">
      <div className="notes-list-head"><button className="new-note" onClick={() => newNote()}>＋ New note</button><label className="template-pick">Template<select aria-label="Template" value={template} onChange={e => setTemplate(e.target.value)}>{Object.entries(TEMPLATES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}</select></label></div>
      <input className="search" aria-label="Search notes" placeholder="Search notes…" value={query} onChange={e => setQuery(e.target.value)}/>
      <label className="sort">Sort<select value={sort} onChange={e => setSort(e.target.value as 'updated'|'title'|'created')}><option value="updated">Recently updated</option><option value="created">Newest first</option><option value="title">Title</option></select></label>
      <ul className="note-items">{list.map(x => <li key={x.id}><button className={x.id === selected ? 'note-item active' : 'note-item'} aria-current={x.id === selected} onClick={() => openNote(x)}><strong>{x.is_pinned ? '★ ' : ''}{x.title}</strong><span className="snippet">{snippet(x.body) || 'No text'}</span><span className="meta">{x.category && <span className="chip">{x.category}</span>}{noteTags(x.tags).slice(0, 2).map(t => <span className="chip" key={t}>{t}</span>)}<span className="muted">{x.updated_at ? x.updated_at.slice(0, 10) : ''}</span></span></button></li>)}</ul>
      {!list.length && <p className="muted empty-hint">{scope === 'trash' ? 'Trash is empty.' : query || category || tag || project !== 'all' ? 'No matching notes.' : 'No notes here yet. Press “New note” to write the first one.'}</p>}
    </div>

    <div className="card notes-editor">
      {selected === null ? <div className="note-empty"><div className="note-empty-icon" aria-hidden="true">✎</div><h3>Make space for your thoughts</h3><p className="muted">Select a note to read or edit, or start a new one.</p>
        <button className="new-note note-empty-create" onClick={() => newNote('blank')}>＋ New note</button>
        <details className="note-templates"><summary>Start from a template</summary><div className="tiles">{Object.entries(TEMPLATES).filter(([id]) => id !== 'blank').map(([id, t]) => <button key={id} className="tile" onClick={() => newNote(id)}><strong>{t.label}</strong><span>{HINTS[id]}</span></button>)}</div></details></div> : <>
        <div className="banner" role="note">Ordinary notes are not encrypted. Keep passwords and tokens in the Secure Vault. <button className="link" onClick={() => p.onSecureNote ? p.onSecureNote() : p.onPage(3)}>Create secure note</button></div>
        {readOnly ? <div className="row"><strong>{draft.title}</strong><span><button className="link" onClick={() => run('restore_item', {id: current!.id})}>Restore</button><button className="link danger" onClick={() => { if (window.confirm('Permanently delete this note? This cannot be undone.')) run('purge_item', {id: current!.id}).then(ok => { if (ok) setSelected(null); }); }}>Delete permanently</button></span></div> : <>
          <input className="title-input" aria-label="Note title" placeholder="Title" value={draft.title} onChange={e => change({title: e.target.value})}/>
          <div className="meta-row">
            <label>Category<select value={draft.category} onChange={e => change({category: e.target.value})}><option value="">Idea inbox (none)</option>{categoryNames.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
            <label>Tags<input value={draft.tags} placeholder="comma, separated" onChange={e => change({tags: e.target.value})}/></label>
            <label>Project<select value={draft.projectId ?? ''} onChange={e => change({projectId: e.target.value ? Number(e.target.value) : null})}><option value="">None</option>{p.projects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          </div>
          <div className="toolbar" role="toolbar" aria-label="Note actions">
            <div className="seg" role="group" aria-label="Editor view">{(['edit', 'split', 'preview'] as const).map(m => <button key={m} className={mode === m ? 'active' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div>
            {current && <><button className="link" aria-pressed={!!current.is_pinned} onClick={() => run('set_item_flag', {id: current.id, flag: 'pinned', value: !current.is_pinned})}>{current.is_pinned ? 'Unpin' : 'Pin'}</button>
              <button className="link" aria-pressed={!!current.is_favorite} onClick={() => run('set_item_flag', {id: current.id, flag: 'favorite', value: !current.is_favorite})}>{current.is_favorite ? 'Unfavorite' : 'Favorite'}</button>
              <details className="note-more"><summary>More actions</summary><div className="note-more-actions"><button className="link" onClick={() => run('set_item_flag', {id: current.id, flag: 'archived', value: !current.is_archived})}>{current.is_archived ? 'Unarchive' : 'Archive'}</button>
              <button className="link" onClick={duplicate}>Duplicate</button><button className="link" onClick={toTask}>Convert to task</button>
              {current.project_id && <button className="link" onClick={() => p.onPage(1)}>Open project</button>}
              <button className="link danger" onClick={trash}>Move to trash</button></div></details></>}
            <button className="link" onClick={copyContent}>Copy text</button>
            <span className="muted words">{words} word{words === 1 ? '' : 's'}</span>
            <span className={`save-status ${status}`} role="status">{STATUS_TEXT[status]}</span>
          </div>
          {mode !== 'preview' && <div className="fmt" role="toolbar" aria-label="Formatting" onMouseDown={e => e.preventDefault()}>
            <button onMouseDown={e => e.preventDefault()} title="Heading" aria-label="Heading" onClick={() => format((t, s, e) => prefixLines(t, s, e, '## '))}>H</button>
            <button onMouseDown={e => e.preventDefault()} title="Bold (Ctrl+B)" aria-label="Bold" onClick={() => wrap('**')}><b>B</b></button>
            <button onMouseDown={e => e.preventDefault()} title="Italic (Ctrl+I)" aria-label="Italic" onClick={() => wrap('*')}><i>I</i></button>
            <button onMouseDown={e => e.preventDefault()} title="Inline code" aria-label="Inline code" onClick={() => wrap('`')}>{'</>'}</button>
            <span className="sep"/>
            <button onMouseDown={e => e.preventDefault()} title="Bulleted list" aria-label="Bulleted list" onClick={() => format((t, s, e) => prefixLines(t, s, e, '- '))}>•</button>
            <button onMouseDown={e => e.preventDefault()} title="Numbered list" aria-label="Numbered list" onClick={() => format(numberLines)}>1.</button>
            <button onMouseDown={e => e.preventDefault()} title="Checklist" aria-label="Checklist" onClick={() => format((t, s, e) => prefixLines(t, s, e, '- [ ] '))}>☑</button>
            <button onMouseDown={e => e.preventDefault()} title="Quote" aria-label="Quote" onClick={() => format((t, s, e) => prefixLines(t, s, e, '> '))}>❝</button>
            <span className="sep"/>
            <button onMouseDown={e => e.preventDefault()} title="Link" aria-label="Link" onClick={() => format(linkSelection)}>🔗</button>
            <button onMouseDown={e => e.preventDefault()} title="Code block" aria-label="Code block" onClick={() => format(codeBlock)}>{'{ }'}</button>
          </div>}
        </>}
        <div className={`editor-panes mode-${readOnly ? 'preview' : mode}`}>
          {!readOnly && mode !== 'preview' && <textarea ref={areaRef} className="editor-text" aria-label="Note text (Markdown)" spellCheck placeholder="Start writing… Markdown works: **bold**, - lists, - [ ] checklists" value={draft.body} onChange={e => change({body: e.target.value})} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**'); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('*'); } }}/>}
          {(readOnly || mode !== 'edit') && <div className="editor-preview" aria-label="Preview"><Markdown source={draft.body}/></div>}
        </div>
      </>}
    </div>
  </section>;
}
