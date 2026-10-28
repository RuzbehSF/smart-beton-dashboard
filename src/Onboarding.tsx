import React, {useEffect, useState} from 'react';
import {invoke} from './native';
import {open} from './native';
import {displayPath} from './domain';
import logo from '../design/references/smart-beton-logo.png';

type Theme = 'light'|'dark'|'system';
type Tool = {slug:string; name:string; path:string|null};
type Props = {theme:Theme; setTheme:(theme:Theme)=>void; onFinished:()=>void};
const STEPS = ['Welcome', 'Appearance', 'Projects folder', 'Developer tools', 'Notes and vault', 'Finish'];

export function Onboarding({theme, setTheme, onFinished}:Props) {
  const [step, setStep] = useState(0), [error, setError] = useState(''), [root, setRoot] = useState(''), [found, setFound] = useState<string[]>([]), [selected, setSelected] = useState<string[]>([]), [scanning, setScanning] = useState(false), [imported, setImported] = useState<number|null>(null), [tools, setTools] = useState<Tool[]>([]), [editorSet, setEditorSet] = useState(false), [name, setName] = useState('');
  useEffect(() => {
    if (step !== 3) return;
    (async () => { try { const list = await invoke<unknown>('detect_tools'); setTools(Array.isArray(list) ? list as Tool[] : []); } catch (e) { setError(String(e)); } })();
  }, [step]);
  async function chooseRoot() {
    try { const path = await open({directory: true, multiple: false}); if (!path) return; setError(''); setRoot(path as string); setScanning(true); setFound([]); setSelected([]); setImported(null);
      const list = await invoke<string[]>('scan_projects', {root: path}); setFound(list); setSelected(list);
    } catch (e) { setError(String(e)); } finally { setScanning(false); }
  }
  async function importSelected() {
    try { await invoke('import_projects', {root, paths: selected}); setImported(selected.length); setError(''); } catch (e) { setError(String(e)); }
  }
  async function useEditor(tool:Tool) {
    if (!tool.path || !window.confirm('Allow this executable to be launched for your projects?\n' + tool.path)) return;
    try { await invoke('configure_editor', {path: tool.path}); setEditorSet(true); setError(''); } catch (e) { setError(String(e)); }
  }
  async function finish() {
    try { if (name.trim()) await invoke('set_setting', {key: 'display_name', value: name.trim()}); await invoke('set_setting', {key: 'onboarding_done', value: '1'}); onFinished(); } catch (e) { setError(String(e)); }
  }
  const last = step === STEPS.length - 1;
  return <div className="overlay"><section className="dialog onboarding" role="dialog" aria-modal="true" aria-label="Welcome setup">
    <ol className="steps" aria-label="Setup progress">{STEPS.map((label, i) => <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>{label}</li>)}</ol>
    {error && <p role="alert" className="error">{error}</p>}
    {step === 0 && <div className="center"><img className="onboard-logo" src={logo} alt="Smart Beton"/><h2>Welcome to Smart Beton Dashboard</h2><p>A local workspace for your projects, notes, tasks, servers and developer tools. Everything stays on this computer. No account or internet connection is required.</p></div>}
    {step === 1 && <div><h2>Appearance</h2><div className="choice-row" role="radiogroup" aria-label="Theme">{(['light', 'dark', 'system'] as Theme[]).map(x => <button key={x} role="radio" aria-checked={theme === x} className={theme === x ? 'choice selected' : 'choice'} onClick={() => setTheme(x)}>{x === 'system' ? 'Follow Windows' : x[0].toUpperCase() + x.slice(1)}</button>)}</div>
      <label>What should the greeting call you? (optional)<input value={name} maxLength={60} onChange={e => setName(e.target.value)}/></label></div>}
    {step === 2 && <div><h2>Projects folder</h2><p>Choose the folder that holds your Smart Beton projects. It is scanned for project markers such as .git or package.json; file contents are not read.</p>
      <button onClick={chooseRoot} disabled={scanning}>{scanning ? 'Scanning…' : root ? 'Choose another folder' : 'Choose folder and scan'}</button>
      {root && <p dir="ltr" className="path">{root}</p>}
      {found.map(path => <label className="item" key={path}><input type="checkbox" checked={selected.includes(path)} onChange={e => setSelected(e.target.checked ? [...selected, path] : selected.filter(x => x !== path))}/><span dir="ltr">{displayPath(path)}</span></label>)}
      {root && !scanning && !found.length && <p className="muted">No projects found.</p>}
      {found.length > 0 && <button disabled={!selected.length || imported !== null} onClick={importSelected}>{imported !== null ? `Imported ${imported}` : 'Import selected'}</button>}
      <p className="muted">You can skip this step and add projects later from the Projects page.</p></div>}
    {step === 3 && <div><h2>Developer tools</h2><p>Detected in standard install folders. Nothing is launched.</p>
      {tools.map(tool => <div className="item" key={tool.slug}><div><strong>{tool.name}</strong><p dir="ltr" className="muted">{tool.path ?? 'Not found'}</p></div>{tool.slug === 'vscode' && tool.path && <button className="link" disabled={editorSet} onClick={() => useEditor(tool)}>{editorSet ? 'Selected' : 'Use for projects'}</button>}</div>)}
      {!tools.length && <p className="muted">Detecting…</p>}<p className="muted">Other executables can be selected later in Settings.</p></div>}
    {step === 4 && <div><h2>Notes and the vault</h2><ul className="plain"><li><strong>Notes</strong> are ordinary, unencrypted text in a local database. Do not put passwords or tokens in them.</li><li><strong>Secure Vault</strong> keeps secrets in Windows Credential Manager under your Windows account. It is experimental and protected only by that account.</li><li>Backups are unencrypted and do not contain vault secrets.</li></ul></div>}
    {last && <div className="center"><h2>You're all set</h2><p>Open the dashboard to start. You can rerun this setup from Settings.</p></div>}
    <div className="row onboarding-actions"><button type="button" className="secondary" disabled={step === 0} onClick={() => {setError(''); setStep(step - 1);}}>Back</button>{last ? <button onClick={finish}>Open dashboard</button> : <button onClick={() => {setError(''); setStep(step + 1);}}>{step === 0 ? 'Get started' : 'Next'}</button>}</div>
  </section></div>;
}
