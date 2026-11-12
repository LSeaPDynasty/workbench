const {contextBridge,ipcRenderer}=require('electron');
const call=(method,...args)=>ipcRenderer.invoke('plugin:request',method,args).then(r=>{if(!r.ok)throw Error(r.error);return r.data;});
contextBridge.exposeInMainWorld('workbench',{
 folders:{list:()=>call('folders.list'),choose:()=>call('folders.choose'),enable:(id,value)=>call('folders.enable',id,value),remove:id=>call('folders.remove',id)},
 files:{list:(root,relative,offset)=>call('files.list',root,relative,offset),menu:token=>call('files.menu',token),readText:token=>call('files.read',token,'text'),readImage:token=>call('files.read',token,'image')},
 git:{
  accounts:{list:()=>call('git.accounts.list'),save:data=>call('git.accounts.save',data),remove:id=>call('git.accounts.remove',id)},
  github:{login:id=>call('git.github.login',id),activate:id=>call('git.github.activate',id)},
  repos:{list:()=>call('git.repos.list'),remove:id=>call('git.repos.remove',id),register:(rootId,accountId)=>call('git.repos.register',rootId,accountId),init:(rootId,accountId)=>call('git.repos.init',rootId,accountId),clone:(rootId,remote,folder,accountId)=>call('git.repos.clone',rootId,remote,folder,accountId)},
  status:id=>call('git.status',id),log:(id,count)=>call('git.log',id,count),diff:id=>call('git.diff',id),stage:(id,files)=>call('git.stage',id,files),unstage:(id,files)=>call('git.unstage',id,files),commit:(id,message)=>call('git.commit',id,message),push:(id,remote,branch)=>call('git.push',id,remote,branch),pull:(id,remote,branch)=>call('git.pull',id,remote,branch)
 },
 initial:()=>call('initial'),
 onOpen:cb=>{const fn=(_,data)=>cb(data);ipcRenderer.on('plugin:open',fn);return()=>ipcRenderer.removeListener('plugin:open',fn);},
 onTheme:cb=>{const fn=(_,value)=>cb(value);ipcRenderer.on('plugin:theme',fn);return()=>ipcRenderer.removeListener('plugin:theme',fn);}
});
