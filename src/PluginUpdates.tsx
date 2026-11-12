import {useState} from 'react';
import type {PluginInfo,PluginUpdate} from './desktop';
export function PluginUpdates({onChange}:{onChange:(items:PluginInfo[])=>void}){
 const [busy,setBusy]=useState(false),[updates,setUpdates]=useState<PluginUpdate[]>([]),[message,setMessage]=useState('');
 async function run(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'更新失败');}finally{setBusy(false);}}
 return <section className="plugin-update-panel"><button className="secondary" disabled={busy||!window.desktop} onClick={()=>run(async()=>{const items=await window.desktop!.plugins.checkUpdates();setUpdates(items);if(!items.length)setMessage('插件已是最新版本');})}>{busy?'处理中…':'检查插件更新'}</button>{message&&<p role="status">{message}</p>}{updates.map(item=><div className="settingrow" key={item.id}><span>{item.name} · {item.from} → {item.version}</span><button className="secondary" disabled={busy} onClick={()=>run(async()=>{const plugins=await window.desktop!.plugins.update(item.id);onChange(plugins);if(plugins.some(p=>p.id===item.id&&p.version===item.version))setUpdates(items=>items.filter(p=>p.id!==item.id));})}>更新</button></div>)}</section>;
}
