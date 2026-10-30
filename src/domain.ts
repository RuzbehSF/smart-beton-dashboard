export type Item = {id:number; kind:'task'|'note'; title:string; body:string; done:boolean; category?:string; tags?:string; project_id?:number|null; deleted?:boolean; priority?:string; due_date?:string|null; is_goal?:boolean; is_pinned?:boolean; status?:string; is_favorite?:boolean; is_archived?:boolean; updated_at?:string; subtasks_json?:string};

export function filterItems(items: Item[], query: string): Item[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(item => (item.title + ' ' + item.body + ' ' + (item.category ?? '') + ' ' + (item.tags ?? '')).toLocaleLowerCase().includes(needle));
}

export function taskProgress(tasks: Item[]): number | null {
  if (!tasks.length) return null;
  return Math.round(tasks.filter(task => task.done).length / tasks.length * 100);
}

export function filterTasks(tasks: Item[], status: string, priority: string, project: string, today: string): Item[] {
  return tasks.filter(task => {
    if (status === 'open' && task.done) return false;
    if (status === 'completed' && !task.done) return false;
    if (status === 'overdue' && (task.done || !task.due_date || task.due_date >= today)) return false;
    if (priority !== 'all' && (task.priority ?? 'normal') !== priority) return false;
    if (project !== 'all' && String(task.project_id ?? '') !== project) return false;
    return true;
  });
}

export function noteTags(value: string | undefined): string[] {
  return (value ?? '').split(',').map(tag => tag.trim()).filter(Boolean);
}

export function filterNotes(notes: Item[], category: string, tag: string, project: string): Item[] {
  return notes.filter(note => {
    if (category && note.category !== category) return false;
    if (tag && !noteTags(note.tags).includes(tag)) return false;
    if (project !== 'all' && String(note.project_id ?? '') !== project) return false;
    return true;
  });
}

export const STATUSES: [string, string][] = [['inbox', 'Inbox'], ['todo', 'To do'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']];
export type TaskView = 'all'|'today'|'upcoming'|'overdue'|'progress'|'completed'|'project'|'board'|'calendar';
export type Subtask = {title:string; done:boolean};

/** Narrows live tasks to one saved view; board and by-project views show every task. */
export function taskView(tasks: Item[], view: TaskView, today: string): Item[] {
  return tasks.filter(task => {
    if (view === 'today') return !task.done && task.due_date === today;
    if (view === 'upcoming') return !task.done && !!task.due_date && task.due_date > today;
    if (view === 'overdue') return !task.done && !!task.due_date && task.due_date < today;
    if (view === 'progress') return !task.done && task.status === 'in_progress';
    if (view === 'completed') return task.done;
    return true;
  });
}

export function parseSubtasks(json: string | undefined): Subtask[] {
  try {
    const value: unknown = JSON.parse(json || '[]');
    return Array.isArray(value) ? value.filter((x): x is Subtask => !!x && typeof x.title === 'string' && typeof x.done === 'boolean') : [];
  } catch { return []; }
}

export type NoteScope = 'all'|'inbox'|'pinned'|'favorites'|'archived'|'trash';
export function selectNotes(items: Item[], o: {scope: NoteScope; category: string; tag: string; project: string; query: string; sort: 'updated'|'title'|'created'}): Item[] {
  let list = items.filter(x => x.kind === 'note');
  list = o.scope === 'trash' ? list.filter(x => x.deleted) : list.filter(x => !x.deleted);
  if (o.scope === 'archived') list = list.filter(x => x.is_archived);
  else if (o.scope !== 'trash') list = list.filter(x => !x.is_archived);
  if (o.scope === 'inbox') list = list.filter(x => !(x.category ?? '').trim());
  if (o.scope === 'pinned') list = list.filter(x => x.is_pinned);
  if (o.scope === 'favorites') list = list.filter(x => x.is_favorite);
  list = filterNotes(filterItems(list, o.query), o.category, o.tag, o.project);
  return [...list].sort((a, b) => Number(!!b.is_pinned) - Number(!!a.is_pinned)
    || (o.sort === 'title' ? a.title.localeCompare(b.title) : o.sort === 'created' ? b.id - a.id : (b.updated_at ?? '').localeCompare(a.updated_at ?? '') || b.id - a.id));
}

export const HARNESSES: [string, string][] = [['claude', 'Claude Code'], ['codex', 'Codex'], ['antigravity', 'Antigravity']];
export type ProjectRecord = {id:number; name:string; path:string; last_opened_at?:string|null; description?:string; status?:string; group_name?:string; preferred_editor?:string; technology_tags?:string; is_favorite?:boolean; is_archived?:boolean; website_url?:string; created_at?:string; ai_harness?:string; git_state?:string; last_commit_at?:string|null; last_commit_hash?:string; last_commit_subject?:string; git_branch?:string; git_dirty?:number; git_remote?:string; git_web_url?:string|null};

/** Windows canonical paths carry a `\\?\` prefix that users should not see. */
export function displayPath(path: string): string { return path.replace(/^\\\\\?\\/, ''); }

export function selectProjects(projects: ProjectRecord[], o: {query: string; scope: 'active'|'favorites'|'archived'; status: string; sort: 'commit'|'recent'|'name'|'created'}): ProjectRecord[] {
  const needle = o.query.trim().toLocaleLowerCase();
  const list = projects.filter(x => {
    if (o.scope === 'archived' ? !x.is_archived : x.is_archived) return false;
    if (o.scope === 'favorites' && !x.is_favorite) return false;
    if (o.status !== 'all' && (x.status ?? 'active') !== o.status) return false;
    return !needle || [x.name, x.description, x.technology_tags, x.group_name, x.path].some(v => (v ?? '').toLocaleLowerCase().includes(needle));
  });
  return list.sort((a, b) => Number(!!b.is_favorite) - Number(!!a.is_favorite)
    || (o.sort === 'name' ? a.name.localeCompare(b.name)
      : o.sort === 'commit' ? (b.last_commit_at ?? '').localeCompare(a.last_commit_at ?? '') || a.name.localeCompare(b.name)
      : o.sort === 'created' ? (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id - a.id
      : (b.last_opened_at ?? '').localeCompare(a.last_opened_at ?? '') || a.name.localeCompare(b.name)));
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds)), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m` : `${total}s`;
}

/** The backend stores UTC timestamps as "YYYY-MM-DD HH:MM:SS". */
export function parseUtc(value: string): number { return Date.parse(value.replace(' ', 'T') + 'Z'); }

/** "3 days ago" style text for an ISO date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  const minutes = Math.floor(seconds / 60); if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60); if (hours < 24) return plural(hours, 'hour');
  const days = Math.floor(hours / 24); if (days < 30) return plural(days, 'day');
  const months = Math.floor(days / 30); if (months < 12) return plural(months, 'month');
  return plural(Math.floor(days / 365), 'year');
}

export function shortDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : new Date(time).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'});
}

/** The line shown on a project block: the date of the last commit, or why there is none. */
export function commitSummary(p: ProjectRecord, now: number = Date.now()): {text: string; date: string} {
  switch (p.git_state ?? '') {
    case 'git': return p.last_commit_at ? {text: `Last commit ${relativeTime(p.last_commit_at, now)}`, date: shortDate(p.last_commit_at)} : {text: 'No commits yet', date: ''};
    case 'none': return {text: 'Not a Git repository', date: ''};
    case 'unavailable': return {text: 'Git is not installed', date: ''};
    case 'error': return {text: 'Git could not read this repository', date: ''};
    default: return {text: 'Checking Git…', date: ''};
  }
}
