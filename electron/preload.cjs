const {contextBridge,ipcRenderer}=require('electron');
const call=(method,...args)=>ipcRenderer.invoke('host:request',method,args).then(r=>{if(!r.ok)throw Error(r.error);return r.data;});
contextBridge.exposeInMainWorld('desktop',{
 list:()=>call('list'),install:()=>call('install'),enable:(id,value)=>call('enable',id,value),remove:id=>call('remove',id),
 show:(id,bounds)=>call('show',id,bounds),hide:()=>call('hide'),bounds:rect=>call('bounds',rect),theme:value=>call('theme',value),close:id=>call('close',id),
 onNavigate:cb=>{const fn=(_,id)=>cb(id);ipcRenderer.on('host:navigate',fn);return()=>ipcRenderer.removeListener('host:navigate',fn);},
 onError:cb=>{const fn=(_,msg)=>cb(msg);ipcRenderer.on('host:error',fn);return()=>ipcRenderer.removeListener('host:error',fn);}
});
