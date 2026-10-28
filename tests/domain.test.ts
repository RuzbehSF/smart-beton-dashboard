import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { filterItems, filterTasks, filterNotes, noteTags, taskProgress, taskView, parseSubtasks, selectNotes, relativeTime, commitSummary, selectProjects, displayPath, type Item } from '../src/domain.ts';

const items: Item[] = [
  {id:1, kind:'task', title:'Review API', body:'Check paths', done:false},
  {id:2, kind:'task', title:'Document', body:'API notes', done:true},
];
test('search matches title and body without case sensitivity', () => {
  assert.deepEqual(filterItems(items, ' api ').map(x => x.id), [1,2]);
  assert.deepEqual(filterItems(items, 'paths').map(x => x.id), [1]);
  assert.deepEqual(filterItems(items, 'missing'), []);
});
test('task filters combine status, priority, project and overdue dates', () => {
  const tasks: Item[] = [
    {id:1,kind:'task',title:'Late',body:'',done:false,priority:'high',project_id:2,due_date:'2026-01-01'},
    {id:2,kind:'task',title:'Done',body:'',done:true,priority:'high',project_id:2,due_date:'2026-01-01'},
    {id:3,kind:'task',title:'Today',body:'',done:false,priority:'normal',project_id:1,due_date:'2026-01-02'},
  ];
  assert.deepEqual(filterTasks(tasks,'overdue','high','2','2026-01-02').map(t=>t.id),[1]);
  assert.deepEqual(filterTasks(tasks,'completed','all','all','2026-01-02').map(t=>t.id),[2]);
  assert.deepEqual(filterTasks(tasks,'open','normal','1','2026-01-02').map(t=>t.id),[3]);
});
test('progress reports no denominator and uses actual completion', () => {
  assert.equal(taskProgress([]), null);
  assert.equal(taskProgress(items), 50);
  assert.equal(taskProgress([items[1]]), 100);
});
test('note filters use exact trimmed tags and combine category and project', () => {
  const notes:Item[]=[{id:1,kind:'note',title:'One',body:'',done:false,category:'Ideas',tags:' design, ui ',project_id:2},{id:2,kind:'note',title:'Two',body:'',done:false,category:'Ideas',tags:'ui-kit',project_id:2}];
  assert.deepEqual(noteTags(' one, , two '),['one','two']);
  assert.deepEqual(filterNotes(notes,'Ideas','ui','2').map(n=>n.id),[1]);
  assert.deepEqual(filterNotes(notes,'Ideas','ui','3'),[]);
});

test('task views split by due date and status', () => {
  const tasks: Item[] = [
    {id:1,kind:'task',title:'Late',body:'',done:false,due_date:'2026-01-01'},
    {id:2,kind:'task',title:'Today',body:'',done:false,due_date:'2026-01-02'},
    {id:3,kind:'task',title:'Soon',body:'',done:false,due_date:'2026-01-09',status:'in_progress'},
    {id:4,kind:'task',title:'Done',body:'',done:true,due_date:'2026-01-01'},
  ];
  assert.deepEqual(taskView(tasks,'overdue','2026-01-02').map(t=>t.id),[1]);
  assert.deepEqual(taskView(tasks,'today','2026-01-02').map(t=>t.id),[2]);
  assert.deepEqual(taskView(tasks,'upcoming','2026-01-02').map(t=>t.id),[3]);
  assert.deepEqual(taskView(tasks,'progress','2026-01-02').map(t=>t.id),[3]);
  assert.deepEqual(taskView(tasks,'completed','2026-01-02').map(t=>t.id),[4]);
});
test('subtask parsing ignores malformed data', () => {
  assert.deepEqual(parseSubtasks('[{"title":"a","done":true},{"x":1}]'),[{title:'a',done:true}]);
  assert.deepEqual(parseSubtasks('not json'),[]);
  assert.deepEqual(parseSubtasks(undefined),[]);
});
test('note selection handles inbox, archive, trash, pinning and sorting', () => {
  const notes: Item[] = [
    {id:1,kind:'note',title:'B',body:'',done:false,category:'',updated_at:'2026-01-01'},
    {id:2,kind:'note',title:'A',body:'',done:false,category:'Ideas',is_pinned:true,updated_at:'2025-01-01'},
    {id:3,kind:'note',title:'C',body:'',done:false,is_archived:true},
    {id:4,kind:'note',title:'D',body:'',done:false,deleted:true},
  ];
  const o = {scope:'all' as const,category:'',tag:'',project:'all',query:'',sort:'updated' as const};
  assert.deepEqual(selectNotes(notes,o).map(n=>n.id),[2,1]);
  assert.deepEqual(selectNotes(notes,{...o,scope:'inbox'}).map(n=>n.id),[1]);
  assert.deepEqual(selectNotes(notes,{...o,scope:'archived'}).map(n=>n.id),[3]);
  assert.deepEqual(selectNotes(notes,{...o,scope:'trash'}).map(n=>n.id),[4]);
  assert.deepEqual(selectNotes(notes,{...o,sort:'title'}).map(n=>n.id),[2,1]);
});

test('relative times read naturally', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  assert.equal(relativeTime('2026-10-29T11:59:50Z', now), 'just now');
  assert.equal(relativeTime('2026-10-29T11:30:00Z', now), '30 minutes ago');
  assert.equal(relativeTime('2026-10-28T12:00:00Z', now), '1 day ago');
  assert.equal(relativeTime('2026-10-26T12:00:00Z', now), '3 days ago');
  assert.equal(relativeTime('2026-05-01T12:00:00Z', now), '6 months ago');
  assert.equal(relativeTime('nonsense', now), '');
});
test('project blocks explain why a repository has no commit date', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  assert.match(commitSummary({id: 1, name: 'a', path: 'x', git_state: 'git', last_commit_at: '2026-10-26T12:00:00Z'}, now).text, /3 days ago/);
  assert.equal(commitSummary({id: 1, name: 'a', path: 'x', git_state: 'git', last_commit_at: null}, now).text, 'No commits yet');
  assert.equal(commitSummary({id: 1, name: 'a', path: 'x', git_state: 'none'}, now).text, 'Not a Git repository');
  assert.equal(commitSummary({id: 1, name: 'a', path: 'x', git_state: 'unavailable'}, now).text, 'Git is not installed');
  assert.equal(commitSummary({id: 1, name: 'a', path: 'x'}, now).text, 'Checking Git…');
});
test('projects sort by last commit and paths lose the Windows prefix', () => {
  const list = [{id: 1, name: 'Old', path: 'a', last_commit_at: '2026-01-01T00:00:00Z'}, {id: 2, name: 'New', path: 'b', last_commit_at: '2026-10-01T00:00:00Z'}, {id: 3, name: 'None', path: 'c'}];
  const names = (sort: 'commit' | 'name') => selectProjects(list, {query: '', scope: 'active', status: 'all', sort}).map(p => p.name);
  assert.deepEqual(names('commit'), ['New', 'Old', 'None']);
  assert.deepEqual(names('name'), ['New', 'None', 'Old']);
  assert.equal(displayPath('\\\\?\\A:\\SmartBeton\\panel'), 'A:\\SmartBeton\\panel');
});
