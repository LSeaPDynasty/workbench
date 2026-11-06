export type PluginInfo={id:string;name:string;version:string;enabled:boolean;permissions:string[];fileTypes:string[]};
type Bounds={x:number;y:number;width:number;height:number};
declare global {interface Window {desktop?:{
 list():Promise<PluginInfo[]>;install():Promise<PluginInfo[]>;enable(id:string,value:boolean):Promise<PluginInfo[]>;remove(id:string):Promise<PluginInfo[]>;
 show(id:string,bounds:Bounds):Promise<void>;hide():Promise<void>;bounds(rect:Bounds):Promise<void>;theme(value:string):Promise<void>;close(id:string):Promise<void>;
 onNavigate(cb:(id:string)=>void):()=>void;onError(cb:(message:string)=>void):()=>void;
};}}
