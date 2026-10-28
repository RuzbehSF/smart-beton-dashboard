import React, {useEffect, useState} from 'react';
import {invoke} from './native';
import {commitSummary, relativeTime, shortDate, type ProjectRecord} from './domain';

type Commit = {hash:string; subject:string; author:string; date:string};

/** Read-only repository facts from the local Git program. Nothing here changes the repository. */
export function ProjectGit({project, onChanged, onError}:{project:ProjectRecord; onChanged:()=>void; onError:(message:string)=>void}) {
  const [commits, setCommits] = useState<Commit[]>([]), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const isRepo = project.git_state === 'git';
  async function load() {
    try { const list = await invoke<unknown>('git_recent_commits', {projectId: project.id, count: 20}); setCommits(Array.isArray(list) ? list as Commit[] : []); } catch { setCommits([]); } finally { setLoaded(true); }
  }
  useEffect(() => { if (project.git_state === 'git' || project.git_state === '') load(); else setLoaded(true); }, [project.id]);
  async function refresh() {
    setBusy(true);
    try { await invoke('refresh_git_info', {projectId: project.id, force: true}); onChanged(); await load(); } catch (e) { onError(String(e)); } finally { setBusy(false); }
  }
  const summary = commitSummary(project);
  return <div className="git-tab">
    <div className="row"><h3>Git</h3><div className="row actions"><button className="link" disabled={busy} onClick={refresh}>{busy ? 'Reading…' : 'Refresh'}</button>{project.git_web_url && <button className="link" onClick={() => invoke('open_external_url', {url: project.git_web_url}).catch(e => onError(String(e)))}>Open repository</button>}</div></div>
    {!isRepo && <p className="muted">{summary.text}.{project.git_state === 'none' ? ' This folder has no .git folder.' : project.git_state === 'unavailable' ? ' Install Git for Windows to see branch and commit details.' : ''}</p>}
    {isRepo && <>
      <dl className="git-facts">
        <dt>Branch</dt><dd dir="ltr">{project.git_branch || '—'}</dd>
        <dt>Last commit</dt><dd>{project.last_commit_at ? <>{relativeTime(project.last_commit_at)} · <bdi dir="ltr">{shortDate(project.last_commit_at)}</bdi> · <code>{project.last_commit_hash}</code> {project.last_commit_subject}</> : 'No commits yet'}</dd>
        <dt>Uncommitted changes</dt><dd>{project.git_dirty ? `${project.git_dirty} tracked file${project.git_dirty === 1 ? '' : 's'}` : 'None'}</dd>
        {project.git_remote && <><dt>Remote</dt><dd dir="ltr">{project.git_remote}</dd></>}
      </dl>
      <h3>Recent commits</h3>
      {commits.map(c => <div className="item" key={c.hash}><div><strong>{c.subject}</strong><p className="muted"><code>{c.hash}</code> · {c.author} · <bdi dir="ltr">{shortDate(c.date)}</bdi> ({relativeTime(c.date)})</p></div></div>)}
      {loaded && !commits.length && <p className="muted">No commits to show.</p>}
    </>}
  </div>;
}
