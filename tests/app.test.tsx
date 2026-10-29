// @vitest-environment jsdom
import React from 'react';
import {afterEach, expect, test, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {App} from '../src/App';

const invoke = vi.hoisted(() => vi.fn());
const open = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({invoke,isTauri:()=>false}));
vi.mock('@tauri-apps/plugin-dialog', () => ({open,save}));
const go = (name: RegExp) => fireEvent.click(within(document.querySelector('aside')!).getByRole('button', {name}));
afterEach(() => {cleanup(); localStorage.clear(); sessionStorage.clear(); invoke.mockReset(); open.mockReset(); save.mockReset()});

test('creates a task through the native command and refreshes the dashboard', async () => {
  let items: unknown[] = [];
  invoke.mockImplementation(async (command: string, args: any) => {
    if (command === 'list_items') return items;
    if (command === 'list_projects') return [];
    if (command === 'save_item') items = [{...args, id: 1, done: false}];
  });
  render(<App/>);
  fireEvent.click(screen.getByRole('button', {name: /create task/i}));
  fireEvent.change(screen.getByLabelText('Title'), {target:{value:'Review project'}});
  fireEvent.click(screen.getByRole('button', {name:'Save'}));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('save_item', {id:null,kind:'task',title:'Review project',body:'',category:'',tags:'',projectId:null,priority:'normal',dueDate:null}));
  expect(await screen.findByText('Review project')).toBeTruthy();
});

test('adding a folder lists its projects for review before importing', async () => {
  open.mockResolvedValue('A:\\SmartBeton');
  invoke.mockImplementation(async (command: string) => {
    if (command === 'add_project_root') return 3;
    if (command === 'scan_project_root') return {candidates: [{root_id: 3, path: 'A:\\SmartBeton\\panel', name: 'panel', tags: ['Git'], has_git: true, known: false}, {root_id: 3, path: 'A:\\SmartBeton\\other', name: 'other', tags: [], has_git: false, known: false}, {root_id: 3, path: 'A:\\SmartBeton\\old', name: 'old', tags: [], has_git: false, known: true}], warnings: [], ignored: 0};
    if (command === 'import_root_projects') return 1;
    return command === 'editor_path' || command === 'continue_info' ? null : [];
  });
  render(<App/>);
  go(/projects/i);
  fireEvent.click(screen.getByRole('button', {name: /add folder/i}));
  const other = await screen.findByRole('checkbox', {name: /SmartBeton.other/});
  fireEvent.click(other);
  expect((screen.getByRole('checkbox', {name: /old/}) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', {name: /import selected/i}));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('import_root_projects', {rootId: 3, paths: ['A:\\SmartBeton\\panel'], nested: false}));
});

test('project blocks show the last commit and open VS Code plus the chosen AI tool', async () => {
  const project = {id: 1, name: 'Panel', path: '\\\\?\\A:\\SmartBeton\\panel', status: 'active', technology_tags: 'Git, Node.js', git_state: 'git', git_branch: 'main', git_dirty: 2, last_commit_at: new Date(Date.now() - 3 * 86400000).toISOString(), last_commit_subject: 'Fix login', ai_harness: 'codex'};
  invoke.mockImplementation(async (command: string) => command === 'list_projects' ? [project] : command === 'launch_workspace' ? {launched: ['VS Code', 'Codex'], failed: []} : command === 'editor_path' || command === 'continue_info' ? null : []);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<App/>);
  go(/projects/i);
  expect(await screen.findByText(/Last commit 3 days ago/)).toBeTruthy();
  expect(screen.getByText('A:\\SmartBeton\\panel')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: 'Open in VS Code + Codex'}));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('launch_workspace', {projectId: 1, harness: 'codex'}));
  fireEvent.change(screen.getByLabelText('AI tool for Panel'), {target: {value: 'claude'}});
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('set_project_harness', {id: 1, harness: 'claude'}));
  fireEvent.click(screen.getByRole('button', {name: 'Delete Panel'}));
  expect(invoke).not.toHaveBeenCalledWith('delete_project', expect.anything());
  fireEvent.click(screen.getByRole('button', {name: 'Delete Panel'}));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('delete_project', {id: 1}));
  expect(confirm.mock.calls[0][0]).toContain('NOT touched');
  confirm.mockRestore();
});

test('a server can be linked to several projects', async () => {
  invoke.mockImplementation(async (command: string) => command === 'list_projects' ? [{id: 1, name: 'Alpha', path: 'C:\\a'}, {id: 2, name: 'Beta', path: 'C:\\b'}] : command === 'editor_path' ? null : []);
  render(<App/>);
  go(/servers & connections/i);
  fireEvent.click(screen.getByRole('button', {name: /add/i}));
  fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Shared box'}});
  fireEvent.change(screen.getByLabelText('Address'), {target: {value: 'host.example'}});
  fireEvent.click(await screen.findByLabelText('Alpha'));
  fireEvent.click(screen.getByLabelText('Beta'));
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('save_connection', {item: expect.objectContaining({name: 'Shared box', project_ids: [1, 2], project_id: 1})}));
});

test('saves note metadata and restores a trashed note', async () => {
  let items: any[] = [{id:7,kind:'note',title:'Old note',body:'',done:false,deleted:true}];
  invoke.mockImplementation(async (command:string, args:any) => {
    if (command === 'list_items') return items;
    if (command === 'list_projects') return [{id:1,name:'Example',path:'C:\\example'}];
    if (command === 'list_categories') return [{id:1,name:'Ideas'}];
    if (command === 'save_item') { items = [...items,{...args,id:8,done:false,deleted:false}]; return 8; }
    if (command === 'restore_item') items = items.map(x=>x.id===args.id?{...x,deleted:false}:x);
  });
  render(<App/>);
  go(/notes/i);
  fireEvent.click(screen.getByRole('button',{name:/^trash/i}));
  fireEvent.click(await screen.findByText('Old note'));
  fireEvent.click(await screen.findByRole('button',{name:'Restore'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('restore_item',{id:7}));
  fireEvent.click(screen.getByRole('button',{name:/^all notes/i}));
  expect(await screen.findByText('Old note')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/new note/i}));
  await waitFor(()=>expect((screen.getByLabelText('Note title') as HTMLInputElement).value).toBe(''));
  const title=screen.getByLabelText('Note title');
  fireEvent.change(title,{target:{value:'Idea'}});
  fireEvent.change(await screen.findByRole('option',{name:'Ideas'}).then(o=>o.closest('select')!),{target:{value:'Ideas'}});
  fireEvent.change(screen.getByLabelText('Tags'),{target:{value:'design, ui'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Project'}),{target:{value:'1'}});
  fireEvent.keyDown(title,{key:'s',ctrlKey:true});
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('save_item',expect.objectContaining({id:null,kind:'note',title:'Idea',category:'Ideas',tags:'design, ui',projectId:1})));
});

test('note tag filter selects exact matching notes', async () => {
  invoke.mockImplementation(async (command:string)=>command==='list_items'?[{id:1,kind:'note',title:'First',body:'',done:false,tags:'ui, design'},{id:2,kind:'note',title:'Second',body:'',done:false,tags:'ui-kit'}]:command==='editor_path'?null:[]);
  render(<App/>);
  go(/notes/i);
  expect(await screen.findByText('First')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Filter by tag'),{target:{value:'ui'}});
  expect(screen.getByText('First')).toBeTruthy();
  expect(screen.queryByText('Second')).toBeNull();
});

test('permanent deletion requires confirmation', async () => {
  invoke.mockImplementation(async (command:string)=>command==='list_items'?[{id:7,kind:'note',title:'Discarded',body:'',done:false,deleted:true}]:command==='editor_path'?null:[]);
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<App/>); go(/notes/i);
  fireEvent.click(screen.getByRole('button',{name:/^trash/i}));
  fireEvent.click(await screen.findByText('Discarded'));
  fireEvent.click(await screen.findByRole('button',{name:'Delete permanently'}));
  expect(invoke).not.toHaveBeenCalledWith('purge_item',expect.anything());
  fireEvent.click(screen.getByRole('button',{name:'Delete permanently'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('purge_item',{id:7}));
  confirm.mockRestore();
});

test('keyboard palette navigates to a section', async () => {
  invoke.mockResolvedValue([]);
  render(<App/>);
  fireEvent.keyDown(window,{key:'k',ctrlKey:true});
  const dialog=screen.getByRole('dialog',{name:'Search and navigation'});
  fireEvent.change(dialog.querySelector('input')!,{target:{value:'Settings'}});
  fireEvent.click(screen.getByRole('button',{name:'Settings'}));
  expect(screen.queryByRole('dialog',{name:'Search and navigation'})).toBeNull();
  expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
});

test('backup only runs after a destination is selected', async () => {
  invoke.mockResolvedValue([]);
  save.mockResolvedValueOnce(null).mockResolvedValueOnce('C:\\backup.sqlite');
  render(<App/>);
  go(/settings/i);
  fireEvent.click(screen.getByRole('button',{name:'Create backup'}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
  expect(invoke).not.toHaveBeenCalledWith('backup_database',expect.anything());
  fireEvent.click(screen.getByRole('button',{name:'Create backup'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('backup_database',{destination:'C:\\backup.sqlite'}));
  expect(await screen.findByRole('status')).toBeTruthy();
});

test('starts and ends a working session from the project page', async () => {
  let sessions: any[] = [];
  invoke.mockImplementation(async (command:string, args:any) => {
    if (command === 'list_projects') return [{id:1,name:'Example',path:'C:\\example',status:'active'}];
    if (command === 'project_sessions') return sessions;
    if (command === 'start_project_session') { sessions = [{id:5,project_id:1,summary:'',unfinished:'',problems:'',next_action:'',started_at:'2026-01-01 10:00:00',ended_at:null,duration_seconds:0,is_active:true,created_at:'2026-01-01 10:00:00'}]; return 5; }
    if (command === 'end_project_session') { sessions = [{...sessions[0],is_active:false,summary:args.completed,next_action:args.nextAction}]; return null; }
    return command === 'editor_path' || command === 'continue_info' ? null : [];
  });
  render(<App/>);
  go(/projects/i);
  fireEvent.click(await screen.findByRole('button',{name:'Open project'}));
  fireEvent.click(await screen.findByRole('button',{name:'Start session'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('start_project_session',{projectId:1}));
  fireEvent.click(await screen.findByRole('button',{name:/end session/i}));
  fireEvent.change(screen.getByLabelText('What did you complete?'),{target:{value:'Reviewed code'}});
  fireEvent.change(screen.getByLabelText('What should you do next time?'),{target:{value:'Write tests'}});
  fireEvent.click(screen.getByRole('button',{name:'Save and end session'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('end_project_session',{id:5,completed:'Reviewed code',unfinished:'',problems:'',nextAction:'Write tests'}));
  expect(await screen.findByText('Write tests')).toBeTruthy();
});

test('removing a finished session asks for confirmation', async () => {
  const done = {id:9,project_id:1,summary:'Previous work',unfinished:'',problems:'',next_action:'Continue',started_at:null,ended_at:null,duration_seconds:0,is_active:false,created_at:'2026-01-01'};
  invoke.mockImplementation(async (command:string) => {
    if (command === 'list_projects') return [{id:1,name:'Example',path:'C:\\example'}];
    if (command === 'project_sessions') return [done];
    return command === 'editor_path' || command === 'continue_info' ? null : [];
  });
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<App/>);
  go(/projects/i);
  fireEvent.click(await screen.findByRole('button',{name:'Open project'}));
  fireEvent.click(await screen.findByRole('tab',{name:'Sessions'}));
  fireEvent.click(await screen.findByRole('button',{name:'Delete'}));
  expect(invoke).not.toHaveBeenCalledWith('delete_session',expect.anything());
  fireEvent.click(screen.getByRole('button',{name:'Delete'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('delete_session',{id:9,projectId:1}));
  confirm.mockRestore();
});

test('editor selection requires explicit confirmation', async () => {
  invoke.mockImplementation(async (command:string)=>command==='editor_path'?null:[]);
  open.mockResolvedValue('C:\\Tools\\Code.exe');
  const confirm = vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<App/>);
  go(/settings/i);
  fireEvent.click(screen.getByRole('button',{name:'Select executable'}));
  await waitFor(()=>expect(confirm).toHaveBeenCalledTimes(1));
  expect(invoke).not.toHaveBeenCalledWith('configure_editor',expect.anything());
  fireEvent.click(screen.getByRole('button',{name:'Select executable'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('configure_editor',{path:'C:\\Tools\\Code.exe'}));
  confirm.mockRestore();
});

test('saves connection metadata without a password field', async () => {
  invoke.mockImplementation(async (command:string)=>command==='editor_path'?null:[]);
  render(<App/>);
  fireEvent.click(screen.getByRole('button',{name:/servers & connections/i}));
  fireEvent.click(screen.getByRole('button',{name:/add/i}));
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Test server'}});
  fireEvent.change(screen.getByLabelText('Address'),{target:{value:'host.example'}});
  fireEvent.change(screen.getByLabelText('Port (optional)'),{target:{value:'22'}});
  expect(screen.queryByLabelText(/password/i)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('save_connection',{item:{id:null,name:'Test server',kind:'ssh',address:'host.example',port:22,username:'',project_id:null,environment:'development',description:'',website_url:'',credential_id:null,project_ids:[]}}));
});

test('weekly activity displays actual counts from the backend', async () => {
  invoke.mockImplementation(async (command:string)=>command==='task_activity'?[{day:'2026-10-28',created:3,completed:1}]:command==='editor_path'?null:[]);
  render(<App/>);
  expect(await screen.findByRole('img',{name:/task creation and completion events/i})).toBeTruthy();
  expect(screen.getByText('2026-10-28')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
});

test('task list filters by completion status', async () => {
  invoke.mockImplementation(async (command:string)=>command==='list_items'?[{id:1,kind:'task',title:'Open task',body:'',done:false},{id:2,kind:'task',title:'Finished task',body:'',done:true}]:command==='editor_path'?null:[]);
  render(<App/>);
  go(/my tasks/i);
  expect(await screen.findByText('Open task')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab',{name:'Completed'}));
  expect(screen.queryByText('Open task')).toBeNull();
  expect(screen.getByText('Finished task')).toBeTruthy();
});

test('opening a web panel requires confirmation', async () => {
  invoke.mockImplementation(async (command:string)=>command==='list_connections'?[{id:4,name:'Panel',kind:'web',address:'https://example.test/',port:null,username:'',project_id:null}]:command==='editor_path'?null:[]);
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<App/>);
  fireEvent.click(screen.getByRole('button',{name:/servers & connections/i}));
  fireEvent.click(await screen.findByRole('button',{name:'Open web panel'}));
  expect(invoke).not.toHaveBeenCalledWith('open_web_connection',expect.anything());
  fireEvent.click(screen.getByRole('button',{name:'Open web panel'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('open_web_connection',{id:4,confirmedAddress:'https://example.test/',confirmedPort:null}));
  confirm.mockRestore();
});
test('Remote Desktop requires confirmation and passes only reviewed host and port',async()=>{
  invoke.mockImplementation(async (command:string)=>command==='list_connections'?[{id:2,name:'Synthetic RDP',kind:'rdp',address:'example.test',port:3389,username:'test',project_id:null}]:command==='editor_path'?null:[]);
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<App/>);fireEvent.click(screen.getByRole('button',{name:/servers & connections/i}));
  fireEvent.click(await screen.findByRole('button',{name:'Open Remote Desktop'}));
  expect(invoke).not.toHaveBeenCalledWith('open_rdp_connection',expect.anything());
  fireEvent.click(screen.getByRole('button',{name:'Open Remote Desktop'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('open_rdp_connection',{id:2,confirmedAddress:'example.test',confirmedPort:3389}));
  confirm.mockRestore();
});

test('follow Windows theme responds to system changes and persists', async () => {
  let listener: ((event:{matches:boolean})=>void)|undefined;
  const media={matches:false,addEventListener:vi.fn((_name:string,fn:typeof listener)=>{listener=fn}),removeEventListener:vi.fn()};
  Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn(()=>media)});
  invoke.mockImplementation(async (command:string)=>command==='editor_path'?null:[]);
  const {container}=render(<App/>);
  go(/settings/i);
  fireEvent.change(screen.getByLabelText('Theme'),{target:{value:'system'}});
  await waitFor(()=>expect(localStorage.getItem('theme')).toBe('system'));
  expect(container.querySelector('.app.dark')).toBeNull();
  const {act}=await import('@testing-library/react');
  act(()=>listener?.({matches:true}));
  expect(container.querySelector('.app.dark')).toBeTruthy();
  delete (window as any).matchMedia;
});

test('dashboard shows only projects with recorded open activity', async () => {
  invoke.mockImplementation(async (command:string)=>command==='list_projects'?[{id:1,name:'Opened',path:'C:\\one',last_opened_at:'2026-01-01 12:00:00'},{id:2,name:'Not opened',path:'C:\\two',last_opened_at:null}]:command==='editor_path'?null:[]);
  render(<App/>);
  expect(await screen.findByText('Opened')).toBeTruthy();
  expect(screen.queryByText('Not opened')).toBeNull();
});
test('running a saved command requires explicit confirmation',async()=>{
  const command={id:5,name:'Synthetic',executable:'C:\\tools\\example.exe',arguments:['one two',';'],project_id:1,description:'',working_directory:'',category:'development',risk_level:'development',is_favorite:false};
  invoke.mockImplementation(async(name:string)=>name==='list_projects'?[{id:1,name:'Demo',path:'C:\\demo'}]:name==='list_commands'?[command]:name==='run_command'?'job-1':name==='command_status'?{output:'synthetic output',finished:true,exit_code:0,truncated:false,error:null}:name==='editor_path'?null:[]);
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<App/>);
  fireEvent.click(screen.getByRole('button',{name:/developer tools/i}));
  fireEvent.click(await screen.findByRole('button',{name:'Review and run'}));
  expect(invoke).not.toHaveBeenCalledWith('run_command',expect.anything());
  expect(confirm.mock.calls[0][0]).toContain('C:\\demo');
  expect(confirm.mock.calls[0][0]).toContain('["one two",";"]');
  fireEvent.click(screen.getByRole('button',{name:'Review and run'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('run_command',{confirmed:command}));
  expect(await screen.findByText('synthetic output')).toBeTruthy();
  confirm.mockRestore();
});
test('manual automation runs reviewed steps in order only after confirmation',async()=>{
  const automation={id:1,name:'Synthetic',description:'',trigger_type:'manual',shortcut:'',enabled:true,schedule_time:'',schedule_days:'1,2,3,4,5,6,7',schedule_kind:'daily',schedule_month_day:1,actions:[{kind:'create_task',project_id:null,title:'First'},{kind:'create_note',project_id:null,title:'Second'}]};
  invoke.mockImplementation(async(name:string)=>name==='list_automations'?[automation]:name==='editor_path'?null:[]);
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<App/>);
  fireEvent.click(screen.getByRole('button',{name:/automations/i}));
  fireEvent.click(await screen.findByRole('button',{name:'Review and run'}));
  expect(invoke).not.toHaveBeenCalledWith('run_automation_step',expect.anything());
  fireEvent.click(screen.getByRole('button',{name:'Review and run'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('run_automation_step',{confirmed:automation,index:1}));
  const calls=invoke.mock.calls.filter(call=>call[0]==='run_automation_step');
  expect(calls.map(call=>call[1].index)).toEqual([0,1]);
  confirm.mockRestore();
});
test('cancelling an automation stops before the next action',async()=>{
  const automation={id:1,name:'Synthetic',description:'',trigger_type:'manual',shortcut:'',enabled:true,schedule_time:'',schedule_days:'1,2,3,4,5,6,7',schedule_kind:'daily',schedule_month_day:1,actions:[{kind:'create_task',project_id:null,title:'First'},{kind:'create_note',project_id:null,title:'Second'}]};
  let finish: (()=>void)|undefined;
  invoke.mockImplementation((name:string)=>name==='list_automations'?Promise.resolve([automation]):name==='run_automation_step'?new Promise<void>(resolve=>{finish=resolve}):Promise.resolve(name==='editor_path'?null:[]));
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
  render(<App/>); fireEvent.click(screen.getByRole('button',{name:/automations/i}));
  fireEvent.click(await screen.findByRole('button',{name:'Review and run'}));
  await waitFor(()=>expect(finish).toBeDefined());
  fireEvent.click(screen.getByRole('button',{name:'Cancel remaining actions'}));
  finish?.();
  expect(await screen.findByText('Cancelled before the next action.')).toBeTruthy();
  expect(invoke.mock.calls.filter(call=>call[0]==='run_automation_step')).toHaveLength(1);
  confirm.mockRestore();
});

test('connections can be filtered by environment and production launches are flagged',async()=>{
  const rows=[{id:1,name:'Staging box',kind:'rdp',address:'stage.example',port:null,username:'',project_id:null,environment:'staging',description:'',website_url:'',credential_id:null},{id:2,name:'Live box',kind:'rdp',address:'live.example',port:null,username:'',project_id:null,environment:'production',description:'',website_url:'',credential_id:null}];
  invoke.mockImplementation(async(command:string)=>command==='list_connections'?rows:command==='editor_path'?null:[]);
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  render(<App/>);
  go(/servers & connections/i);
  expect(await screen.findByText('Live box')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Environment'),{target:{value:'production'}});
  expect(screen.queryByText('Staging box')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Open Remote Desktop'}));
  expect(confirm.mock.calls[0][0]).toContain('PRODUCTION');
  confirm.mockRestore();
});
test('sensitive commands ask twice before they run',async()=>{
  const command={id:5,name:'Deploy',executable:'C:\\tools\\deploy.exe',arguments:[],project_id:1,description:'',working_directory:'',category:'release',risk_level:'sensitive',is_favorite:false};
  invoke.mockImplementation(async(name:string)=>name==='list_projects'?[{id:1,name:'Demo',path:'C:\\demo'}]:name==='list_commands'?[command]:name==='run_command'?'job-2':name==='command_status'?{output:'',finished:false,exit_code:null,truncated:false,error:null}:name==='editor_path'?null:[]);
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false);
  render(<App/>);
  go(/developer tools/i);
  fireEvent.click(await screen.findByRole('button',{name:'Review and run'}));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(confirm.mock.calls[0][0]).toContain('SENSITIVE');
  expect(invoke).not.toHaveBeenCalledWith('run_command',expect.anything());
  confirm.mockRestore();
});
test('favorite commands can be toggled and filtered',async()=>{
  const base={executable:'C:\\tools\\a.exe',arguments:[],project_id:1,description:'',working_directory:'',category:'development',risk_level:'development'};
  invoke.mockImplementation(async(name:string)=>name==='list_commands'?[{...base,id:1,name:'Alpha',is_favorite:true},{...base,id:2,name:'Beta',is_favorite:false}]:name==='list_projects'?[{id:1,name:'Demo',path:'C:\\demo'}]:name==='editor_path'?null:[]);
  render(<App/>);
  go(/developer tools/i);
  fireEvent.click(await screen.findByLabelText('Add Beta to favorites'));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('set_command_favorite',{id:2,value:true}));
  fireEvent.click(screen.getByLabelText('Favorites only'));
  expect(screen.queryByText('Beta')).toBeNull();
  expect(screen.getByText('Alpha')).toBeTruthy();
});
test('settings save shortcuts and toggles through the backend',async()=>{
  const settings:Record<string,string>={shortcut_palette:'Ctrl+Alt+K',shortcut_quick_note:'Ctrl+Alt+N',shortcut_dashboard:'Ctrl+Alt+D',minimize_to_tray:'false',start_with_windows:'false',notify_tasks:'true',notify_backups:'true',notify_automations:'true',vault_lock_minutes:'5',clipboard_timeout_seconds:'30'};
  invoke.mockImplementation(async(name:string,args:any)=>{ if(name==='get_settings')return {...settings}; if(name==='update_setting'){settings[args.key]=args.value;return null} if(name==='app_info')return {version:'1.0.0',database_path:'C:\\data\\dashboard.sqlite3',schema_version:15,credential_backend:'Windows Credential Manager (available)'}; return name==='editor_path'?null:[]; });
  render(<App/>);
  go(/settings/i);
  const field=await screen.findByLabelText('Quick note shortcut');
  fireEvent.change(field,{target:{value:'Ctrl+Shift+J'}});
  fireEvent.click(within(field.closest('.item') as HTMLElement).getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('update_setting',{key:'shortcut_quick_note',value:'Ctrl+Shift+J'}));
  fireEvent.click(screen.getByLabelText(/Keep running in the tray/));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('update_setting',{key:'minimize_to_tray',value:'true'}));
  expect(await screen.findByText('C:\\data\\dashboard.sqlite3')).toBeTruthy();
});
test('an automation with several action types is reviewed before running',async()=>{
  const automation={id:1,name:'Morning',description:'',trigger_type:'manual',shortcut:'',enabled:true,schedule_time:'',schedule_days:'1,2,3,4,5,6,7',schedule_kind:'daily',schedule_month_day:1,actions:[{kind:'start_session',project_id:1,title:''},{kind:'open_app',project_id:1,title:'vscode'}]};
  invoke.mockImplementation(async(name:string)=>name==='list_automations'?[automation]:name==='list_projects'?[{id:1,name:'Demo',path:'C:\\demo'}]:name==='editor_path'?null:[]);
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(true);
  render(<App/>);
  go(/automations/i);
  fireEvent.click(await screen.findByRole('button',{name:'Review and run'}));
  expect(confirm.mock.calls[0][0]).toContain('Start working session in Demo');
  expect(confirm.mock.calls[0][0]).toContain('Open VS Code in Demo');
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('run_automation_step',{confirmed:automation,index:1}));
  confirm.mockRestore();
});

test('the full screen button switches the window to full screen', async () => {
  invoke.mockResolvedValue([]);
  const request = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(document.documentElement, 'requestFullscreen', {configurable: true, value: request});
  render(<App/>);
  fireEvent.click(screen.getByRole('button', {name: 'Toggle full screen'}));
  await waitFor(() => expect(request).toHaveBeenCalled());
  fireEvent.keyDown(window, {key: 'F11'});
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  delete (document.documentElement as any).requestFullscreen;
});
test('monthly schedules ask for a day of the month and are saved with their time', async () => {
  invoke.mockImplementation(async (name: string) => name === 'editor_path' ? null : []);
  render(<App/>);
  go(/automations/i);
  fireEvent.click(await screen.findByRole('button', {name: 'Add automation'}));
  const dialog = within(screen.getByRole('dialog', {name: 'Automation'}));
  fireEvent.change(dialog.getByLabelText('Name'), {target: {value: 'Month end'}});
  fireEvent.change(dialog.getByLabelText('Trigger'), {target: {value: 'scheduled'}});
  expect(dialog.queryByLabelText('Day of the month')).toBeNull();
  fireEvent.change(dialog.getByLabelText('Repeats'), {target: {value: 'monthly'}});
  fireEvent.change(dialog.getByLabelText('Day of the month'), {target: {value: '28'}});
  fireEvent.click(dialog.getByRole('button', {name: 'Add action'}));
  fireEvent.change(dialog.getByLabelText('Title'), {target: {value: 'Close the month'}});
  fireEvent.click(dialog.getByRole('button', {name: 'Save'}));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('save_automation', {item: expect.objectContaining({name: 'Month end', trigger_type: 'scheduled', schedule_kind: 'monthly', schedule_month_day: 28, schedule_time: '09:00'})}));
});
test('weekly schedules offer weekday checkboxes', async () => {
  invoke.mockImplementation(async (name: string) => name === 'editor_path' ? null : []);
  render(<App/>);
  go(/automations/i);
  fireEvent.click(await screen.findByRole('button', {name: 'Add automation'}));
  const dialog = within(screen.getByRole('dialog', {name: 'Automation'}));
  fireEvent.change(dialog.getByLabelText('Trigger'), {target: {value: 'scheduled'}});
  expect(dialog.queryByLabelText('Mon')).toBeNull();
  fireEvent.change(dialog.getByLabelText('Repeats'), {target: {value: 'weekly'}});
  expect(dialog.getByLabelText('Mon')).toBeTruthy();
  expect(dialog.getByLabelText('Sun')).toBeTruthy();
});

test('the interface shrinks to fit a small window and can be set to actual size', async () => {
  invoke.mockImplementation(async (name: string) => name === 'editor_path' ? null : name === 'get_settings' ? {} : []);
  Object.defineProperty(window, 'innerWidth', {configurable: true, value: 1280});
  Object.defineProperty(window, 'innerHeight', {configurable: true, value: 720});
  render(<App/>);
  await waitFor(() => expect(document.documentElement.style.getPropertyValue('--ui-zoom')).toBe('0.8'));
  expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('900px');
  expect(document.documentElement.hasAttribute('data-narrow')).toBe(false);
  go(/settings/i);
  fireEvent.change(await screen.findByLabelText('Size'), {target: {value: 'full'}});
  await waitFor(() => expect(document.documentElement.style.getPropertyValue('--ui-zoom')).toBe('1'));
  expect(document.documentElement.hasAttribute('data-narrow')).toBe(true);
  expect(localStorage.getItem('scale')).toBe('full');
});

test('formatting buttons edit the note text and the empty editor offers templates', async () => {
  invoke.mockImplementation(async (name: string) => name === 'editor_path' ? null : name === 'save_item' ? 1 : []);
  render(<App/>);
  go(/notes/i);
  fireEvent.click(await screen.findByRole('button', {name: /^Blank note/}));
  const area = await screen.findByLabelText('Note text (Markdown)') as HTMLTextAreaElement;
  fireEvent.change(area, {target: {value: 'hello world'}});
  area.setSelectionRange(0, 5);
  fireEvent.click(screen.getByRole('button', {name: 'Bold'}));
  expect(area.value).toBe('**hello** world');
  area.setSelectionRange(0, area.value.length);
  fireEvent.click(screen.getByRole('button', {name: 'Checklist'}));
  expect(area.value).toBe('- [ ] **hello** world');
});
test('project blocks have a red delete button and a collapsed folder summary', async () => {
  const project = {id: 1, name: 'Panel', path: 'A:\\SmartBeton\\panel', status: 'active', git_state: 'none', ai_harness: 'claude'};
  invoke.mockImplementation(async (command: string) => command === 'list_projects' ? [project] : command === 'list_project_roots' ? [{id: 1, path: 'A:\\SmartBeton', label: '', exclusions: '', project_count: 1}] : command === 'editor_path' || command === 'continue_info' ? null : []);
  render(<App/>);
  go(/projects/i);
  const del = await screen.findByRole('button', {name: 'Delete Panel'});
  expect(del.className).toContain('danger');
  expect(await screen.findByText(/1 project folder/)).toBeTruthy();
  expect(screen.queryByRole('button', {name: /add folder/i})).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Manage folders'}));
  expect(screen.getByRole('button', {name: /add folder/i})).toBeTruthy();
});
