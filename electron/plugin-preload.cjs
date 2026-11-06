const {contextBridge,ipcRenderer}=require('electron');
const call=(method,...args)=>ipcRenderer.invoke('plugin:request',method,args).then(r=>{if(!r.ok)throw Error(r.error);return r.data;});
contextBridge.exposeInMainWorld('workbench',{
 folders:{list:()=>call('folders.list'),choose:()=>call('folders.choose'),enable:(id,value)=>call('folders.enable',id,value),remove:id=>call('folders.remove',id)},
 files:{list:(root,relative,offset)=>call('files.list',root,relative,offset),menu:token=>call('files.menu',token),readText:token=>call('files.read',token,'text'),readImage:token=>call('files.read',token,'image')},
 initial:()=>call('initial'),
 onOpen:cb=>{const fn=(_,data)=>cb(data);ipcRenderer.on('plugin:open',fn);return()=>ipcRenderer.removeListener('plugin:open',fn);},
 onTheme:cb=>{const fn=(_,value)=>cb(value);ipcRenderer.on('plugin:theme',fn);return()=>ipcRenderer.removeListener('plugin:theme',fn);}
});
