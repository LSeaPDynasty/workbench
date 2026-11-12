export type PluginInfo={id:string;name:string;version:string;enabled:boolean;permissions:string[];fileTypes:string[]};
type Bounds={x:number;y:number;width:number;height:number};
export type UpdateStatus={phase:'unsupported'|'idle'|'checking'|'downloading'|'downloaded'|'error';message:string;version?:string;progress?:number};
declare global {interface Window {desktop?:{
 list():Promise<PluginInfo[]>;install():Promise<PluginInfo[]>;enable(id:string,value:boolean):Promise<PluginInfo[]>;remove(id:string):Promise<PluginInfo[]>;
 show(id:string,bounds:Bounds):Promise<void>;hide():Promise<void>;bounds(rect:Bounds):Promise<void>;theme(value:string):Promise<void>;close(id:string):Promise<void>;
 update:{status():Promise<UpdateStatus>;check():Promise<UpdateStatus>;install():Promise<void>};
 onNavigate(cb:(id:string)=>void):()=>void;onError(cb:(message:string)=>void):()=>void;
 onUpdate(cb:(state:UpdateStatus)=>void):()=>void;
};}}
