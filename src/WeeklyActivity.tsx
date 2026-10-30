import React from 'react';
export type ActivityDay = {day:string; created:number; completed:number};

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const weekday = (day:string) => LETTERS[new Date(day + 'T00:00:00').getDay()] ?? '';

/** Smooth line through the points (Catmull-Rom converted to cubic Bézier segments). */
function smooth(points:[number, number][]): string {
  if (points.length < 2) return '';
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return path;
}

export function WeeklyActivity({days}:{days:ActivityDay[]}) {
  const max = Math.max(1, ...days.flatMap(d => [d.created, d.completed]));
  const step = days.length > 1 ? 272 / (days.length - 1) : 0;
  const points = (field:'created'|'completed'): [number, number][] => days.map((d, i) => [Math.round(14 + i * step), Math.round(100 - (d[field] / max) * 76)]);
  const hasActivity = days.some(d => d.created || d.completed);
  const created = points('created'), done = points('completed');
  const today = created[created.length - 1];
  const area = (pts: [number, number][]) => pts.length < 2 ? '' : `${smooth(pts)} L${pts[pts.length - 1][0]},106 L${pts[0][0]},106 Z`;
  return <section className="card soft weekly"><h2>Weekly task activity</h2>
    {hasActivity ? <>
      <ul className="legend" aria-hidden="true"><li><span className="dot solid"/>Created</li><li><span className="dot light"/>Completed</li></ul>
      <svg viewBox="0 0 300 120" role="img" aria-label="Task creation and completion events in the last seven days">
        <defs>
          <linearGradient id="appleChartGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28"/>
            <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[24, 52, 80].map(y => <line key={y} x1="10" x2="290" y1={y} y2={y} className="gridline"/>)}
        <path d={area(created)} fill="url(#appleChartGlow)" className="area-glow"/>
        <path d={smooth(done)} fill="none" className="line light" strokeWidth="2.5" strokeLinecap="round"/>
        <path d={smooth(created)} fill="none" className="line solid" strokeWidth="3" strokeLinecap="round"/>
        {today && <><circle cx={today[0]} cy={today[1]} r="7.5" className="today-dot-pulse" opacity="0.25"/><circle cx={today[0]} cy={today[1]} r="4" className="today-dot"/></>}
      </svg>
      <div className="weekdays" aria-hidden="true">{days.map((d, i) => <span key={d.day} className={i === days.length - 1 ? 'today' : ''}>{weekday(d.day)}</span>)}</div>
      <table className="activity-table sr-only"><caption>Created and completed task actions per day. Tracking begins with this version.</caption><thead><tr><th>Date</th><th>Created</th><th>Completed</th></tr></thead><tbody>{days.map(d => <tr key={d.day}><td dir="ltr">{d.day}</td><td>{d.created}</td><td>{d.completed}</td></tr>)}</tbody></table>
    </> : <div className="weekly-empty"><span aria-hidden="true">⌁</span><strong>Activity starts here</strong><p>Created and completed tasks will appear over the last seven days.</p></div>}
  </section>;
}
