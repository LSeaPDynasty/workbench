import {useEffect,useRef,useState} from 'react';
export function PluginStage({id,paused}:{id:string;paused:boolean}){
 const ref=useRef<HTMLDivElement>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const api=window.desktop;if(!api){setError('请在桌面应用中打开');return;}if(paused){void api.hide();return;}let disposed=false;const bounds=()=>{const r=ref.current!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};setError('');void api.show(id,bounds()).catch(e=>{if(!disposed)setError(e.message);});const update=()=>{if(!disposed)void api.bounds(bounds()).catch(()=>{});};const observer=new ResizeObserver(update);observer.observe(ref.current!);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);return()=>{disposed=true;observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);void api.hide();};},[id,paused,retry]);
 return <div className="plugin-stage" ref={ref}>{error&&<div className="empty">{error}<button className="secondary" onClick={()=>setRetry(x=>x+1)}>重试</button></div>}</div>;
}
