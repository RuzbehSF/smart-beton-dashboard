import React, {useEffect, useState} from 'react';
import {invoke} from './native';
import {taskProgress, type Item} from './domain';
import {WeeklyActivity, type ActivityDay} from './WeeklyActivity';

type Project = {id:number; name:string; path:string; last_opened_at?:string|null};
export type DashboardProps = {
  items:Item[]; projects:Project[]; activity:ActivityDay[]; today:string; editorPath:string|null;
  onToggle:(id:number)=>void; onEdit:(item:Item)=>void; onTrash:(id:number)=>void; onPin:(id:number)=>void;
  onAddTask:()=>void; onAddNote:()=>void; onAddGoal:(title:string)=>Promise<void>;
  onOpenFolder:(id:number)=>void; onOpenEditor:(id:number)=>void; onPage:(index:number)=>void; onOpenProject:(id:number)=>void;
};

function Ring({percent}:{percent:number|null}) {
  const radius = 52, circumference = 2 * Math.PI * radius, value = percent ?? 0;
  return <svg className="ring-svg" viewBox="0 0 130 130" role="img" aria-label={percent === null ? 'No tasks yet' : `${percent}% of tasks completed`}>
    <circle cx="65" cy="65" r={radius} fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="10"/>
    <circle cx="65" cy="65" r={radius} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} transform="rotate(-90 65 65)"/>
    <text x="65" y="72" textAnchor="middle" className="ring-text">{percent === null ? '—' : `${percent}%`}</text>
  </svg>;
}

type ContinueInfo = {session_id:number; project_id:number; project_name:string; summary:string; next_action:string; started_at:string|null; ended_at:string|null; is_active:boolean};
export function Dashboard(p:DashboardProps) {
  const [cont, setCont] = useState<ContinueInfo|null>(null), [servers, setServers] = useState<number|null>(null), [goalTitle, setGoalTitle] = useState(''), [menu, setMenu] = useState<number|null>(null);
  useEffect(() => {
    let alive = true;
    (async () => { try { const list = await invoke<unknown>('list_connections'); if (alive && Array.isArray(list)) setServers(list.length); } catch { /* count stays hidden */ } })();
    (async () => { try { const info = await invoke<ContinueInfo|null>('continue_info'); if (alive) setCont(info && typeof info === 'object' && typeof (info as ContinueInfo).project_id === 'number' ? info : null); } catch { /* optional card */ } })();
    return () => { alive = false; };
  }, []);
  const live = p.items.filter(x => x.kind === 'task' && !x.deleted);
  const tasks = live.filter(x => !x.is_goal), goals = live.filter(x => x.is_goal);
  const notes = p.items.filter(x => x.kind === 'note' && !x.deleted);
  const done = tasks.filter(x => x.done).length;
  const doneGoals = goals.filter(x => x.done).length;
  const open = tasks.filter(x => !x.done).sort((a, b) => Number(!!b.is_pinned) - Number(!!a.is_pinned));
  const recent = p.projects.filter(x => x.last_opened_at).slice(0, 3);
  const projectName = (id?:number|null) => p.projects.find(x => x.id === id)?.name;
  async function submitGoal(e:React.FormEvent) { e.preventDefault(); const title = goalTitle.trim(); if (!title) return; await p.onAddGoal(title); setGoalTitle(''); }
  return <div className="bento">
    <section className="card contrast b-overall"><h2>Overall information</h2>
      <div className="overall-numbers"><div><span className="big">{done}</span> <small>tasks done for all time</small></div><div><span className="big">{p.projects.length}</span> <small>projects registered</small></div></div>
      <div className="metrics"><div><strong>{open.length}</strong>Open</div><div><strong>{done}</strong>Completed</div><div><strong>{notes.length}</strong>Notes</div><div><strong>{servers ?? '—'}</strong>Servers</div></div>
    </section>
    <div className="b-weekly"><WeeklyActivity days={p.activity}/></div>
    <section className="card b-month"><h2>Task progress</h2><Ring percent={taskProgress(tasks)}/><p className="muted center">{tasks.length ? `${done} of ${tasks.length} tasks completed` : 'Completion appears once you add tasks.'}</p></section>
    <section className="card goals b-goals"><div className="row"><h2>Goals</h2><span className="chip" aria-label="Goals completed">{doneGoals}/{goals.length}</span></div>
      <div className="goal-list">{goals.map(x => <div className="goal-row" key={x.id}><label><input type="checkbox" checked={x.done} onChange={() => p.onToggle(x.id)}/><span className={x.done ? 'struck' : ''}>{x.title}</span></label><button className="link" aria-label={`Remove goal ${x.title}`} onClick={() => p.onTrash(x.id)}>✕</button></div>)}
      {!goals.length && <p className="muted">No goals yet. Add one below.</p>}</div>
      <form className="goal-form" onSubmit={submitGoal}><input aria-label="New goal" placeholder="Add a goal" value={goalTitle} onChange={e => setGoalTitle(e.target.value)}/><button disabled={!goalTitle.trim()}>Add</button></form>
    </section>
    <section className="b-tasks"><div className="row"><h2>Tasks in process ({open.length})</h2><button className="link" onClick={() => p.onPage(5)}>Open all tasks ›</button></div>
      <div className="task-cards">
        {open.slice(0, 3).map((x, i) => <article className={`task-card tilt-${i % 3}`} key={x.id}>
          <div className="row"><label className="check-circle"><input type="checkbox" aria-label={`Complete ${x.title}`} checked={x.done} onChange={() => p.onToggle(x.id)}/></label>
            <div className="menu-wrap"><button className="link dots" aria-label={`Menu for ${x.title}`} aria-expanded={menu === x.id} onClick={() => setMenu(menu === x.id ? null : x.id)}>⋯</button>
              {menu === x.id && <div className="popover task-menu"><button onClick={() => {setMenu(null); p.onPin(x.id);}}>{x.is_pinned ? 'Unpin' : 'Pin'}</button><button onClick={() => {setMenu(null); p.onEdit(x);}}>Edit</button><button onClick={() => {setMenu(null); p.onTrash(x.id);}}>Move to trash</button></div>}</div></div>
          <strong className="task-title">{x.is_pinned ? '★ ' : ''}{x.title}</strong>
          <p className="muted">{[projectName(x.project_id), x.priority ?? 'normal'].filter(Boolean).join(' · ')}</p>
          <p className={x.due_date && x.due_date < p.today ? 'due overdue' : 'due'}>{x.due_date ? <bdi dir="ltr">{x.due_date}</bdi> : 'No due date'}{x.due_date && x.due_date < p.today ? ' · overdue' : ''}</p>
        </article>)}
        <button className="task-card add-task" onClick={p.onAddTask}>＋ Add task</button>
      </div>
    </section>
    <section className="b-projects"><div className="row"><h2>Recent projects</h2><button className="link" onClick={() => p.onPage(1)}>All projects ›</button></div>
      <div className="project-cards">
        {recent.map(x => <article className="project-card" key={x.id}><button className="proj-name on-dark" onClick={() => p.onOpenProject(x.id)}>{x.name}</button><p dir="ltr" className="path">{x.path}</p><p className="muted">Last opened <bdi dir="ltr">{x.last_opened_at} UTC</bdi></p>
          <div className="row actions"><button className="link" onClick={() => p.onOpenFolder(x.id)}>Open folder</button><button className="link" disabled={!p.editorPath} title={!p.editorPath ? 'Configure the editor in Settings first' : undefined} onClick={() => p.onOpenEditor(x.id)}>Open in VS Code</button></div></article>)}
        {!recent.length && <p className="muted empty-line">Opened projects will appear here.</p>}
      </div>
    </section>
    <div className={`b-side${cont ? ' with-continue' : ''}`}>
      {cont && <section className="card b-continue"><div className="row"><div><h2>Continue where you left off</h2><p><strong>{cont.project_name}</strong>{cont.is_active ? ' · session in progress' : ''}</p><p className="muted">{cont.is_active ? <>Started <bdi dir="ltr">{cont.started_at} UTC</bdi></> : cont.summary || 'Session ended'}</p>{!cont.is_active && cont.next_action && <p><strong>Next:</strong> {cont.next_action}</p>}</div><button onClick={() => p.onOpenProject(cont.project_id)}>{cont.is_active ? 'Return to session' : 'Resume project'}</button></div></section>}
    <section className="card b-notes"><div className="row"><h2>Recent notes</h2><button className="link" onClick={p.onAddNote}>＋ Add note</button></div>
      {notes.slice(0, 3).map(x => <p key={x.id}>{x.title}</p>)}{!notes.length && <p className="muted">Your notes will appear here.</p>}</section></div>
  </div>;
}
