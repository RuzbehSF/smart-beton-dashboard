// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {Vault} from '../src/Vault';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('@tauri-apps/api/core',()=>({invoke}));
afterEach(()=>{cleanup();invoke.mockReset()});
test('credentials remain masked until explicitly revealed',async()=>{
  invoke.mockImplementation(async(command:string)=>command==='vault_list'?[{id:1,name:'Synthetic',username:'test'}]:command==='vault_reveal'?'synthetic-secret':undefined);
  render(<Vault/>);
  expect(await screen.findByText('Synthetic')).toBeTruthy();
  expect(invoke).not.toHaveBeenCalledWith('vault_reveal',expect.anything());
  fireEvent.click(screen.getByRole('button',{name:'Reveal'}));
  expect(await screen.findByText('synthetic-secret')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Hide'}));
  expect(screen.queryByText('synthetic-secret')).toBeNull();
});
test('saving passes a secret only to the protected-store command',async()=>{
  invoke.mockResolvedValue([]);render(<Vault/>);
  fireEvent.click(screen.getByRole('button',{name:'Add credential'}));
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Synthetic'}});
  fireEvent.change(screen.getByLabelText('Password'),{target:{value:'example-only'}});
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('vault_add',expect.objectContaining({name:'Synthetic',username:'',secret:'example-only',details:expect.objectContaining({kind:'website'})})));
  expect(screen.queryByRole('dialog')).toBeNull();
});
test('locking the view prevents an in-flight reveal from appearing',async()=>{
  let resolveSecret:((value:string)=>void)|undefined;
  invoke.mockImplementation((command:string)=>command==='vault_list'?Promise.resolve([{id:1,name:'Synthetic',username:'test'}]):new Promise<string>(resolve=>{resolveSecret=resolve}));
  render(<Vault/>);
  fireEvent.click(await screen.findByRole('button',{name:'Reveal'}));
  fireEvent.click(screen.getByRole('button',{name:'Lock view'}));
  resolveSecret?.('synthetic-secret');
  await waitFor(()=>expect(screen.getByText('Vault view locked.')).toBeTruthy());
  fireEvent.click(screen.getByRole('button',{name:'Unlock view'}));
  expect(screen.queryByText('synthetic-secret')).toBeNull();
});
test('editing metadata does not request or overwrite a secret',async()=>{
  invoke.mockImplementation(async(command:string)=>command==='vault_list'?[{id:1,name:'Synthetic',username:'before'}]:undefined);
  render(<Vault/>);
  fireEvent.click(await screen.findByRole('button',{name:'Edit details'}));
  fireEvent.change(screen.getByLabelText('Username'),{target:{value:'after'}});
  expect(screen.queryByLabelText('Secret')).toBeNull();
  expect(screen.queryByLabelText('Password')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('vault_update_metadata',expect.objectContaining({id:1,name:'Synthetic',username:'after'})));
  expect(invoke).not.toHaveBeenCalledWith('vault_reveal',expect.anything());
});
test('replacement reports cleanup warnings without retrying the change',async()=>{
  invoke.mockImplementation(async(command:string)=>command==='vault_list'?[{id:1,name:'Synthetic',username:'test'}]:command==='vault_replace_secret'?'cleanup warning':undefined);
  render(<Vault/>);
  fireEvent.click(await screen.findByRole('button',{name:'Replace secret'}));
  fireEvent.change(screen.getByLabelText('Secret'),{target:{value:'replacement-only'}});
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('vault_replace_secret',{id:1,secret:'replacement-only'}));
  expect(await screen.findByText('cleanup warning')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('each credential type shows its own fields and sends them as details',async()=>{
  invoke.mockResolvedValue([]);render(<Vault/>);
  fireEvent.click(screen.getByRole('button',{name:'Add credential'}));
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Type'),{target:{value:'database'}});
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Reporting DB'}});
  fireEvent.change(screen.getByLabelText('Host name or IP'),{target:{value:'db.example'}});
  fireEvent.change(screen.getByLabelText('Port'),{target:{value:'5432'}});
  fireEvent.change(screen.getByLabelText('Database name'),{target:{value:'reports'}});
  expect(screen.queryByLabelText('Website address')).toBeNull();
  fireEvent.change(screen.getByLabelText('Password'),{target:{value:'synthetic'}});
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('vault_add',expect.objectContaining({name:'Reporting DB',details:expect.objectContaining({kind:'database',hostname:'db.example',port:5432,database_name:'reports'})})));
});
test('a secure note stores its text through the protected command',async()=>{
  invoke.mockResolvedValue([]);render(<Vault/>);
  fireEvent.click(screen.getByRole('button',{name:'New secure note'}));
  fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Recovery codes'}});
  fireEvent.change(screen.getByLabelText('Secure note text'),{target:{value:'synthetic body'}});
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('vault_add',expect.objectContaining({name:'Recovery codes',secret:'synthetic body',details:expect.objectContaining({kind:'secure_note'})})));
});
test('search covers metadata but never secrets',async()=>{
  invoke.mockImplementation(async(command:string)=>command==='vault_list'?[{id:1,name:'Panel',username:'admin',kind:'website',website_url:'https://panel.example'},{id:2,name:'Reporting DB',username:'dbuser',kind:'database',hostname:'db.example'}]:[]);
  render(<Vault/>);
  expect(await screen.findByText('Panel')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Search vault metadata'),{target:{value:'db.example'}});
  expect(screen.queryByText('Panel')).toBeNull();
  expect(screen.getByText('Reporting DB')).toBeTruthy();
  expect(invoke).not.toHaveBeenCalledWith('vault_reveal',expect.anything());
});
