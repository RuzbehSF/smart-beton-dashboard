import React, {useEffect, useState} from 'react';
import {invoke, open} from './native';

type Tool = {slug:string; name:string; configured:string|null; detected:string|null};

/** Developer tool executables used by "Open in …" on the project page. Nothing runs until a project action is chosen. */
export function ToolSettings({onError}:{onError:(message:string)=>void}) {
  const [tools, setTools] = useState<Tool[]>([]), [message, setMessage] = useState('');
  async function load() { try { const list = await invoke<unknown>('list_tools'); setTools(Array.isArray(list) ? list as Tool[] : []); } catch (e) { onError(String(e)); } }
  useEffect(() => { load(); }, []);
  async function choose(tool:Tool) {
    try {
      const path = await open({multiple: false, filters: [{name: 'Windows program', extensions: ['exe', 'cmd']}]});
      if (!path || typeof path !== 'string') return;
      if (!window.confirm(`Allow ${tool.name} to be launched for your projects with this executable?\n${path}`)) return;
      await invoke('set_tool_path', {slug: tool.slug, path}); setMessage(`${tool.name} executable saved.`); await load();
    } catch (e) { onError(String(e)); }
  }
  async function clear(tool:Tool) { try { await invoke('set_tool_path', {slug: tool.slug, path: null}); setMessage(`${tool.name} reset to automatic detection.`); await load(); } catch (e) { onError(String(e)); } }
  return <div className="tool-settings"><h3>Developer tools</h3>
    <p className="muted">Used by the "Open in …" buttons on each project. Without a selection the app looks in the standard install folders.</p>
    {tools.map(tool => <div className="item" key={tool.slug}><div><strong>{tool.name}</strong><p dir="ltr" className="muted">{tool.configured ?? tool.detected ?? 'Not found'}</p><p className="muted">{tool.configured ? 'Selected by you' : tool.detected ? 'Detected automatically' : 'Select the executable to enable it'}</p></div>
      <button className="link" onClick={() => choose(tool)}>Select executable</button>{tool.configured && <button className="link" onClick={() => clear(tool)}>Use automatic</button>}</div>)}
    {!tools.length && <p className="muted">Tool list is available in the desktop app.</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
