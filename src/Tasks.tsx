import React, {useState} from 'react';
import {invoke} from './native';
import {filterItems, parseSubtasks, taskView, STATUSES, type Item, type Subtask, type TaskView} from './domain';

type Project = {id:number; name:string};
type Props = {items:Item[]; projects:Project[]; today:string; initialQuery:string; onChanged:()=>void; onCreate:()=>void; onEdit:(item:Item)=>void; onError:(message:string)=>void};
const VIEWS: [TaskView, string][] = [
  ['all', 'All tasks'],
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
  ['overdue', 'Overdue'],
  ['progress', 'In progress'],
  ['completed', 'Completed'],
  ['project', 'By project'],
  ['board', 'Board'],
  ['calendar', 'Calendar'],
];
const RANK: Record<string, number> = {high: 0, normal: 1, low: 2};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Tasks(p:Props) {
  const [view, setView] = useState<TaskView>('all');
  const [query, setQuery] = useState(p.initialQuery);
  const [priority, setPriority] = useState('all');
  const [project, setProject] = useState('all');
  const [trash, setTrash] = useState(false);
  const [open, setOpen] = useState<number|null>(null);
  const [newItem, setNewItem] = useState('');
  const [dragging, setDragging] = useState<number|null>(null);
  const [dropTarget, setDropTarget] = useState<string|null>(null);

  // Calendar State
  const [calMode, setCalMode] = useState<'month'|'week'>('month');
  const [calDate, setCalDate] = useState(() => {
    const parts = (p.today || '').split('-');
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    return new Date();
  });
  const [calDropDate, setCalDropDate] = useState<string|null>(null);

  async function run(command:string, args:Record<string, unknown>) {
    try {
      await invoke(command, args);
      p.onChanged();
      return true;
    } catch (e) {
      p.onError(String(e));
      return false;
    }
  }

  const projectName = (id?:number|null) => p.projects.find(x => x.id === id)?.name;

  const base = p.items.filter(x => x.kind === 'task' && !!x.deleted === trash);
  const scoped = trash ? base : taskView(base, view, p.today);
  const list = filterItems(scoped, query)
    .filter(x => (priority === 'all' || (x.priority ?? 'normal') === priority) && (project === 'all' || String(x.project_id ?? '') === project))
    .sort((a, b) => Number(!!b.is_pinned) - Number(!!a.is_pinned) || RANK[a.priority ?? 'normal'] - RANK[b.priority ?? 'normal'] || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));

  function statusSelect(x:Item) {
    return <select aria-label={`Status of ${x.title}`} value={x.status ?? (x.done ? 'done' : 'todo')} onChange={e => run('set_task_status', {id: x.id, status: e.target.value})}>{STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>;
  }

  function checklist(x:Item) {
    const subs = parseSubtasks(x.subtasks_json);
    const save = (next:Subtask[]) => run('set_subtasks', {id: x.id, subtasks: next});
    return <div className="checklist">
      {subs.map((s, i) => <div className="goal-row" key={i}><label><input type="checkbox" checked={s.done} onChange={() => save(subs.map((y, j) => j === i ? {...y, done: !y.done} : y))}/><span className={s.done ? 'struck' : ''}>{s.title}</span></label><button className="link tiny" aria-label={`Remove ${s.title}`} onClick={() => save(subs.filter((_, j) => j !== i))}>✕</button></div>)}
      {!subs.length && <p className="muted">No checklist items yet.</p>}
      <form className="goal-form" onSubmit={async e => { e.preventDefault(); const title = newItem.trim(); if (!title) return; if (await save([...subs, {title, done: false}])) setNewItem(value => value.trim() === title ? '' : value); }}><input aria-label="New checklist item" placeholder="Add checklist item" value={newItem} onChange={e => setNewItem(e.target.value)}/><button disabled={!newItem.trim()}>Add</button></form>
    </div>;
  }

  function meta(x:Item) {
    const subs = parseSubtasks(x.subtasks_json), late = !x.done && !!x.due_date && x.due_date < p.today;
    return <p className="muted">{[projectName(x.project_id), `Priority: ${x.priority ?? 'normal'}`, subs.length ? `${subs.filter(s => s.done).length}/${subs.length} checklist` : ''].filter(Boolean).join(' · ')}{x.due_date && <bdi dir="ltr" className={late ? 'overdue' : ''}> · {x.due_date}{late ? ' (overdue)' : ''}</bdi>}</p>;
  }

  function row(x:Item) {
    return <div className="item task-row" key={x.id}>
      {!x.deleted && <input type="checkbox" aria-label={`Complete ${x.title}`} checked={x.done} onChange={() => run('toggle_task', {id: x.id})}/>}
      <div><strong>{x.is_pinned ? '★ ' : ''}{x.is_goal ? '◎ ' : ''}{x.title}</strong>{x.body && <p>{x.body}</p>}{meta(x)}{open === x.id && !x.deleted && checklist(x)}</div>
      {x.deleted ? <><button className="link" onClick={() => run('restore_item', {id: x.id})}>Restore</button><button className="link" onClick={() => { if (window.confirm('Permanently delete this item? This cannot be undone.')) run('purge_item', {id: x.id}); }}>Delete permanently</button></> : <>
        {statusSelect(x)}
        <button className="link" aria-expanded={open === x.id} onClick={() => { setNewItem(''); setOpen(open === x.id ? null : x.id); }}>Checklist</button>
        <button className="link" onClick={() => run('toggle_pin', {id: x.id})}>{x.is_pinned ? 'Unpin' : 'Pin'}</button>
        <button className="link" onClick={() => p.onEdit(x)}>Edit</button>
        <button className="link" onClick={() => { if (window.confirm('Move this item to trash?')) run('delete_item', {id: x.id}); }}>Move to trash</button></>}
    </div>;
  }

  function boardCard(x:Item) {
    return <article className={dragging === x.id ? 'board-card dragging' : 'board-card'} key={x.id} draggable onDragStart={e => { setDragging(x.id); e.dataTransfer.setData('text/plain', String(x.id)); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDragging(null); setDropTarget(null); }}>
      <strong>{x.is_pinned ? '★ ' : ''}{x.title}</strong>{meta(x)}{statusSelect(x)}
      <div className="row actions"><button className="link" onClick={() => p.onEdit(x)}>Edit</button></div>
    </article>;
  }

  function board() {
    return <div className="board" aria-label="Task board">{STATUSES.map(([id, label]) => {
      const cards = list.filter(x => (x.status ?? (x.done ? 'done' : 'todo')) === id);
      return <section key={id} className={dropTarget === id ? 'board-col over' : 'board-col'} aria-label={label}
        onDragOver={e => { e.preventDefault(); setDropTarget(id); }} onDragLeave={() => setDropTarget(null)}
        onDrop={e => { e.preventDefault(); const taskId = Number(e.dataTransfer.getData('text/plain')); setDropTarget(null); setDragging(null); const t = p.items.find(y => y.id === taskId); if (t && (t.status ?? (t.done ? 'done' : 'todo')) !== id) run('set_task_status', {id: taskId, status: id}); }}>
        <h3>{label} <span className="count">{cards.length}</span></h3>{cards.map(boardCard)}{!cards.length && <p className="muted">Drop tasks here</p>}</section>;
    })}</div>;
  }

  function grouped() {
    const groups = new Map<number|null, Item[]>();
    for (const x of list) { const id = x.project_id ?? null; groups.set(id, [...(groups.get(id) ?? []), x]); }
    return [...groups.entries()].sort(([a], [b]) => a === null ? 1 : b === null ? -1 : (projectName(a) ?? '').localeCompare(projectName(b) ?? '')).map(([id, tasks]) => <div key={id ?? 'none'}><h3 className="group-title">{id === null ? 'No project' : projectName(id) ?? 'Unknown project'} <span className="count">{tasks.length}</span></h3>{tasks.map(row)}</div>);
  }

  // --- CALENDAR IMPLEMENTATION ---
  function formatIsoDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function moveDate(offset: number) {
    const next = new Date(calDate);
    if (calMode === 'month') {
      next.setMonth(next.getMonth() + offset);
    } else {
      next.setDate(next.getDate() + offset * 7);
    }
    setCalDate(next);
  }

  function jumpToday() {
    const parts = (p.today || '').split('-');
    if (parts.length === 3) {
      setCalDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    } else {
      setCalDate(new Date());
    }
  }

  function renderCalendar() {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const monthTitle = calDate.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});

    let dayCells: {dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean}[] = [];

    if (calMode === 'month') {
      const firstDayOfWeek = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const prevMonthDays = new Date(year, month, 0).getDate();

      // Days from prev month
      for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const d = new Date(year, month - 1, prevMonthDays - i);
        const dateStr = formatIsoDate(d);
        dayCells.push({dateStr, dayNum: prevMonthDays - i, isCurrentMonth: false, isToday: dateStr === p.today});
      }
      // Current month days
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        const dateStr = formatIsoDate(d);
        dayCells.push({dateStr, dayNum: i, isCurrentMonth: true, isToday: dateStr === p.today});
      }
      // Next month padding to fill grid to multiple of 7
      const totalCells = dayCells.length <= 35 ? 35 : 42;
      let nextDay = 1;
      while (dayCells.length < totalCells) {
        const d = new Date(year, month + 1, nextDay);
        const dateStr = formatIsoDate(d);
        dayCells.push({dateStr, dayNum: nextDay, isCurrentMonth: false, isToday: dateStr === p.today});
        nextDay++;
      }
    } else {
      // Week View: 7 days starting from Sunday
      const curr = new Date(calDate);
      const first = curr.getDate() - curr.getDay();
      for (let i = 0; i < 7; i++) {
        const d = new Date(curr.setDate(first + i));
        const dateStr = formatIsoDate(d);
        dayCells.push({dateStr, dayNum: d.getDate(), isCurrentMonth: d.getMonth() === month, isToday: dateStr === p.today});
      }
    }

    const unscheduled = p.items.filter(x => x.kind === 'task' && !x.deleted && !x.due_date);

    return (
      <div className="calendar-view-container">
        {/* Calendar Navigation Bar */}
        <div className="calendar-navbar">
          <div className="calendar-nav-left">
            <button type="button" className="calendar-nav-btn" onClick={() => moveDate(-1)} aria-label="Previous">
              ‹
            </button>
            <button type="button" className="calendar-nav-btn" onClick={() => moveDate(1)} aria-label="Next">
              ›
            </button>
            <button type="button" className="calendar-today-btn" onClick={jumpToday}>
              Today
            </button>
            <h3 className="calendar-title">{monthTitle}</h3>
          </div>
          <div className="calendar-nav-right">
            <div className="calendar-mode-toggle">
              <button
                type="button"
                className={`cal-mode-btn ${calMode === 'month' ? 'active' : ''}`}
                onClick={() => setCalMode('month')}
              >
                Month
              </button>
              <button
                type="button"
                className={`cal-mode-btn ${calMode === 'week' ? 'active' : ''}`}
                onClick={() => setCalMode('week')}
              >
                Week
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Layout: Grid + Unscheduled Tray */}
        <div className="calendar-layout">
          <div className="calendar-grid-wrap">
            {/* Weekday Header */}
            <div className="calendar-weekdays-row">
              {WEEKDAYS.map(w => (
                <div key={w} className="calendar-weekday-cell">
                  {w}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className={`calendar-days-grid ${calMode}`}>
              {dayCells.map(cell => {
                const dayTasks = list.filter(t => t.due_date === cell.dateStr);
                const isDropTarget = calDropDate === cell.dateStr;

                return (
                  <div
                    key={cell.dateStr}
                    className={`calendar-day-cell ${cell.isCurrentMonth ? '' : 'outside'} ${cell.isToday ? 'today' : ''} ${isDropTarget ? 'drop-active' : ''}`}
                    onDragOver={e => {
                      e.preventDefault();
                      setCalDropDate(cell.dateStr);
                    }}
                    onDragLeave={() => setCalDropDate(null)}
                    onDrop={async e => {
                      e.preventDefault();
                      const taskId = Number(e.dataTransfer.getData('text/plain'));
                      setCalDropDate(null);
                      setDragging(null);
                      if (taskId) {
                        await run('set_task_due_date', {id: taskId, dueDate: cell.dateStr});
                      }
                    }}
                  >
                    <div className="calendar-day-header">
                      <span className={`calendar-day-num ${cell.isToday ? 'today-pill' : ''}`}>
                        {cell.dayNum}
                      </span>
                      {dayTasks.length > 0 && (
                        <span className="calendar-day-count">{dayTasks.length}</span>
                      )}
                    </div>

                    <div className="calendar-day-tasks">
                      {dayTasks.map(t => (
                        <div
                          key={t.id}
                          className={`calendar-task-chip priority-${t.priority ?? 'normal'} ${t.done ? 'done' : ''}`}
                          draggable
                          onDragStart={e => {
                            setDragging(t.id);
                            e.dataTransfer.setData('text/plain', String(t.id));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setCalDropDate(null);
                          }}
                          onClick={() => p.onEdit(t)}
                          title={`${t.title} (${t.priority ?? 'normal'} priority)`}
                        >
                          <span className={`chip-priority-dot ${t.priority ?? 'normal'}`} />
                          <span className="chip-title">{t.title}</span>
                          {t.done && <span className="chip-check">✔</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Unscheduled Tasks Side Tray */}
          <aside className="calendar-tray">
            <div className="calendar-tray-header">
              <h4>Unscheduled Tasks</h4>
              <span className="tray-count">{unscheduled.length}</span>
            </div>
            <p className="tray-help">Drag tasks onto any day to schedule their due date.</p>

            <div
              className={`calendar-drop-clear-zone ${calDropDate === 'clear' ? 'drop-active' : ''}`}
              onDragOver={e => {
                e.preventDefault();
                setCalDropDate('clear');
              }}
              onDragLeave={() => setCalDropDate(null)}
              onDrop={async e => {
                e.preventDefault();
                const taskId = Number(e.dataTransfer.getData('text/plain'));
                setCalDropDate(null);
                setDragging(null);
                if (taskId) {
                  await run('set_task_due_date', {id: taskId, dueDate: null});
                }
              }}
            >
              <span>📥 Drop here to remove due date</span>
            </div>

            <div className="calendar-tray-list">
              {unscheduled.map(t => (
                <div
                  key={t.id}
                  className={`tray-task-card priority-${t.priority ?? 'normal'} ${dragging === t.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={e => {
                    setDragging(t.id);
                    e.dataTransfer.setData('text/plain', String(t.id));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => p.onEdit(t)}
                >
                  <div className="tray-card-top">
                    <span className={`chip-priority-dot ${t.priority ?? 'normal'}`} />
                    <strong>{t.title}</strong>
                  </div>
                  {projectName(t.project_id) && (
                    <span className="tray-card-project">{projectName(t.project_id)}</span>
                  )}
                </div>
              ))}
              {unscheduled.length === 0 && (
                <p className="muted" style={{fontSize: '12px', padding: '12px', textAlign: 'center'}}>
                  All tasks are scheduled!
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return <section className="card collection tasks-page">
    <div className="row"><h2>My Tasks</h2><button onClick={p.onCreate}>＋ Add task</button></div>
    {!trash && <div className="tabs" role="tablist" aria-label="Task views">{VIEWS.map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'tab active' : 'tab'} onClick={() => setView(id)}>{label}</button>)}</div>}
    <div className="filters">
      <input className="search" aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={e => setQuery(e.target.value)}/>
      <label>Priority<select value={priority} onChange={e => setPriority(e.target.value)}><option value="all">All</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
      <label>Project<select value={project} onChange={e => setProject(e.target.value)}><option value="all">All</option>{p.projects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <button className="link" aria-pressed={trash} onClick={() => setTrash(!trash)}>{trash ? 'Show active' : 'Show trash'}</button>
      {(query || priority !== 'all' || project !== 'all') && <button className="link" onClick={() => {setQuery(''); setPriority('all'); setProject('all');}}>Clear filters</button>}
    </div>
    {!trash && view === 'calendar' ? renderCalendar() : !trash && view === 'board' ? board() : !trash && view === 'project' ? grouped() : list.map(row)}
    {!list.length && view !== 'calendar' && <div className="collection-empty"><p>{trash ? 'Trash is empty.' : query || priority !== 'all' || project !== 'all' || view !== 'all' ? 'No tasks match this view.' : 'No tasks yet.'}</p>{!trash && view !== 'board' && <button className="link" onClick={p.onCreate}>＋ Add task</button>}</div>}
  </section>;
}
