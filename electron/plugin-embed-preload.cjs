const {contextBridge,ipcRenderer}=require('electron');
// Minimal bridge for embedded player views (local web pages hosted in a WebContentsView).
// The page cannot reach Node or the plugin API; the host may park it, close it,
// switch tracks without reloading, or send transport commands (toggle/next/previous).
contextBridge.exposeInMainWorld('embedHost',{
 embedded:true,
 park:()=>ipcRenderer.send('embed:park'),
 close:()=>ipcRenderer.send('embed:close'),
 onPlay:cb=>{const fn=(_,id)=>cb(id);ipcRenderer.on('embed:play',fn);return()=>ipcRenderer.removeListener('embed:play',fn);},
 onCommand:cb=>{const fn=(_,name)=>cb(name);ipcRenderer.on('embed:command',fn);return()=>ipcRenderer.removeListener('embed:command',fn);},
 report:state=>ipcRenderer.send('embed:state',state)
});
