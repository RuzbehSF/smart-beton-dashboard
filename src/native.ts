import {invoke as tauriInvoke} from '@tauri-apps/api/core';
import {open as dialogOpen, save as dialogSave} from '@tauri-apps/plugin-dialog';

/**
 * Single entry point to the desktop backend.
 * Inside the Tauri window it calls the real commands. In a plain browser (`npm run dev`) the Tauri bridge does not exist,
 * so calls go to a small in-memory preview for notes and tasks; everything that needs the desktop app fails with a clear message.
 */
export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const NEEDS_DESKTOP = 'This action needs the desktop app. Start it with "npm run tauri dev".';
const inBrowserPreview = () => typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window);

export async function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    if (error instanceof TypeError && inBrowserPreview()) return previewInvoke(command, args ?? {}) as T;
    throw error;
  }
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    if (error instanceof TypeError && inBrowserPreview()) throw new Error(NEEDS_DESKTOP);
    throw error;
  }
}
export const open = ((...args: Parameters<typeof dialogOpen>) => guard(() => dialogOpen(...args))) as typeof dialogOpen;
export const save = ((...args: Parameters<typeof dialogSave>) => guard(() => dialogSave(...args))) as typeof dialogSave;

// ---- in-memory preview (browser only; nothing is saved) ----
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const store = {
  items: [] as Row[], nextId: 1, events: [] as {kind: string; at: string}[], settings: {onboarding_done: '1'} as Record<string, string>,
  categories: ['Personal', 'Ideas', 'Development', 'Smart Beton', 'Projects', 'Tutorials', 'Important', 'Troubleshooting', 'Reference', 'Miscellaneous'].map((name, i) => ({id: i + 1, name})),
};
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
function find(id: number): Row { const x = store.items.find(i => i.id === id); if (!x) throw new Error('Item no longer exists'); return x; }
function create(kind: string, title: string, extra: Row = {}): Row {
  if (!String(title ?? '').trim()) throw new Error('Invalid item');
  const row: Row = {id: store.nextId++, kind, title: String(title).trim(), body: '', done: false, category: '', tags: '', project_id: null, deleted: false, priority: 'normal', due_date: null, is_goal: false, is_pinned: false, status: 'todo', is_favorite: false, is_archived: false, updated_at: stamp(), subtasks_json: '[]', ...extra};
  store.items.unshift(row);
  if (kind === 'task') store.events.push({kind: 'created', at: new Date().toISOString()});
  return row;
}
function activity() {
  const days: {day: string; created: number; completed: number}[] = [];
  for (let back = 6; back >= 0; back--) {
    const d = new Date(); d.setDate(d.getDate() - back);
    const day = d.toLocaleDateString('sv-SE');
    const on = store.events.filter(e => new Date(e.at).toLocaleDateString('sv-SE') === day);
    days.push({day, created: on.filter(e => e.kind === 'created').length, completed: on.filter(e => e.kind === 'completed').length});
  }
  return days;
}

function previewInvoke(command: string, a: Row): unknown {
  switch (command) {
    case 'list_items': return store.items.map(x => ({...x}));
    case 'save_item': {
      if (a.id != null) { const x = find(a.id); if (!String(a.title ?? '').trim()) throw new Error('Invalid item'); Object.assign(x, {title: a.title.trim(), body: a.body ?? '', category: a.category ?? '', tags: a.tags ?? '', project_id: a.projectId ?? null, priority: a.priority ?? 'normal', due_date: a.dueDate ?? null, updated_at: stamp()}); return x.id; }
      return create(a.kind, a.title, {body: a.body ?? '', category: a.category ?? '', tags: a.tags ?? '', project_id: a.projectId ?? null, priority: a.priority ?? 'normal', due_date: a.dueDate ?? null}).id;
    }
    case 'save_goal': create('task', a.title, {is_goal: true, due_date: a.dueDate ?? null}); return undefined;
    case 'toggle_task': { const x = find(a.id); x.done = !x.done; x.status = x.done ? 'done' : 'todo'; if (x.done) store.events.push({kind: 'completed', at: new Date().toISOString()}); return undefined; }
    case 'set_task_status': { const x = find(a.id), was = x.done; x.status = a.status; x.done = a.status === 'done'; if (x.done && !was) store.events.push({kind: 'completed', at: new Date().toISOString()}); return undefined; }
    case 'set_subtasks': find(a.id).subtasks_json = JSON.stringify(a.subtasks); return undefined;
    case 'delete_item': find(a.id).deleted = true; return undefined;
    case 'restore_item': find(a.id).deleted = false; return undefined;
    case 'purge_item': { const x = find(a.id); if (!x.deleted) throw new Error('Item is not in the trash'); store.items = store.items.filter(i => i !== x); return undefined; }
    case 'toggle_pin': { const x = find(a.id); x.is_pinned = !x.is_pinned; return undefined; }
    case 'set_item_flag': { const x = find(a.id); x['is_' + a.flag] = a.value; return undefined; }
    case 'duplicate_item': { const x = find(a.id); return create(x.kind, 'Copy of ' + x.title, {body: x.body, category: x.category, tags: x.tags, project_id: x.project_id, priority: x.priority, due_date: x.due_date}).id; }
    case 'convert_note_to_task': { const x = find(a.id); return create('task', x.title, {body: x.body, category: x.category, tags: x.tags, project_id: x.project_id}).id; }
    case 'list_categories': return store.categories.map(c => ({...c}));
    case 'create_category': { if (store.categories.some(c => c.name.toLowerCase() === String(a.name).trim().toLowerCase())) throw new Error('That category already exists'); store.categories.push({id: store.nextId++, name: String(a.name).trim()}); return undefined; }
    case 'rename_category': { const c = store.categories.find(x => x.id === a.id); if (!c) throw new Error('Category no longer exists'); store.items.forEach(i => { if (i.category === c.name) i.category = String(a.name).trim(); }); c.name = String(a.name).trim(); return undefined; }
    case 'delete_category': { const c = store.categories.find(x => x.id === a.id); if (!c) throw new Error('Category no longer exists'); store.items.forEach(i => { if (i.category === c.name) i.category = ''; }); store.categories = store.categories.filter(x => x !== c); return undefined; }
    case 'task_activity': return activity();
    case 'get_settings': return {shortcut_palette: 'Ctrl+Alt+K', shortcut_quick_note: 'Ctrl+Alt+N', shortcut_dashboard: 'Ctrl+Alt+D', minimize_to_tray: 'false', start_with_windows: 'false', notify_tasks: 'true', notify_backups: 'true', notify_automations: 'true', vault_lock_minutes: '5', clipboard_timeout_seconds: '30', automation_catch_up: 'true', ...store.settings};
    case 'update_setting': store.settings[a.key] = a.value; return undefined;
    case 'app_info': return {version: 'browser preview', database_path: 'Not available in a browser', schema_version: 0, credential_backend: 'Not available in a browser'};
    case 'check_due_notifications': case 'notify_user': return undefined;
    case 'get_setting': return store.settings[a.key] ?? null;
    case 'set_setting': store.settings[a.key] = a.value; return undefined;
    case 'editor_path': case 'continue_info': return null;
    case 'refresh_git_info': case 'ignored_project_count': return 0;
    case 'list_project_roots': case 'list_workspace_profiles': case 'git_recent_commits': return [];
    // Test seam for the browser preview only: JSON in localStorage key "previewProjects" shows the layout with many projects.
    case 'list_projects': try { const saved = JSON.parse(localStorage.getItem('previewProjects') ?? '[]'); return Array.isArray(saved) ? saved : []; } catch { return []; }
    case 'list_connections': case 'list_commands': case 'list_automations': case 'vault_list': case 'list_sessions':
    case 'project_sessions': case 'project_activity': case 'list_tools': case 'detect_tools': case 'integration_warnings': return [];
    default: throw new Error(NEEDS_DESKTOP);
  }
}
