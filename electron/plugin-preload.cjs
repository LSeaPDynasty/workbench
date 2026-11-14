const {contextBridge,ipcRenderer}=require('electron');
const call=(method,...args)=>ipcRenderer.invoke('plugin:request',method,args).then(r=>{if(!r.ok)throw Error(r.error);return r.data;});
contextBridge.exposeInMainWorld('workbench',{
 folders:{list:()=>call('folders.list'),choose:()=>call('folders.choose'),enable:(id,value)=>call('folders.enable',id,value),remove:id=>call('folders.remove',id)},
 files:{list:(root,relative,offset)=>call('files.list',root,relative,offset),menu:token=>call('files.menu',token),readText:token=>call('files.read',token,'text'),readImage:token=>call('files.read',token,'image')},
 backend:{request:(method,args=[])=>call('backend.request',method,args)},
 view:{open:(url,rect)=>call('view.open',url,rect),bounds:rect=>call('view.bounds',rect),close:()=>call('view.close'),command:name=>call('view.command',name)},
 initial:()=>call('initial'),
 onOpen:cb=>{const fn=(_,data)=>cb(data);ipcRenderer.on('plugin:open',fn);return()=>ipcRenderer.removeListener('plugin:open',fn);},
 onTheme:cb=>{const fn=(_,value)=>cb(value);ipcRenderer.on('plugin:theme',fn);return()=>ipcRenderer.removeListener('plugin:theme',fn);},
 onEmbedClosed:cb=>{const fn=()=>cb();ipcRenderer.on('plugin:embed-closed',fn);return()=>ipcRenderer.removeListener('plugin:embed-closed',fn);},
 onEmbedParked:cb=>{const fn=()=>cb();ipcRenderer.on('plugin:embed-parked',fn);return()=>ipcRenderer.removeListener('plugin:embed-parked',fn);},
 onEmbedState:cb=>{const fn=(_,state)=>cb(state);ipcRenderer.on('plugin:embed-state',fn);return()=>ipcRenderer.removeListener('plugin:embed-state',fn);},
 onEmbedError:cb=>{const fn=(_,message)=>cb(message);ipcRenderer.on('plugin:embed-error',fn);return()=>ipcRenderer.removeListener('plugin:embed-error',fn);}
});
