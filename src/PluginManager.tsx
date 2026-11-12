import {useState} from 'react';
import {PluginUpdates} from './PluginUpdates';
import type {PluginInfo} from './desktop';
export function PluginManager({plugins,onChange}:{plugins:PluginInfo[];onChange:(items:PluginInfo[])=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const updates=<PluginUpdates onChange={onChange}/>;
 async function run(fn:()=>Promise<PluginInfo[]>){setBusy(true);setError('');try{onChange(await fn());}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setBusy(false);}}
 return <><div className="pageheading"><h1>应用</h1><button className="primary" disabled={busy||!window.desktop} onClick={()=>run(()=>window.desktop!.install())}>安装插件</button></div>{updates}{error&&<p role="status">{error}</p>}{!window.desktop&&<p>请在桌面应用中安装插件</p>}<div className="pluginlist">{plugins.map(p=><div className="pluginrow" key={p.id}><div><h3>{p.name}<span>{p.version}</span></h3><p>{p.fileTypes.join(' ')}</p></div><span className="permission">{p.permissions.includes('folders.read')?'选择的文件夹':p.permissions.includes('file.receive')?'接收的文件':''}</span><button className={'toggle '+(p.enabled?'on':'')} role="switch" aria-label={'启用'+p.name} aria-checked={p.enabled} disabled={busy} onClick={()=>run(()=>window.desktop!.enable(p.id,!p.enabled))}><span/></button><button className="textbutton" disabled={busy} onClick={()=>run(()=>window.desktop!.remove(p.id))}>卸载</button></div>)}</div></>;
}
