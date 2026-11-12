const path=require('node:path'),fs=require('node:fs/promises');
class BackendManager{
 constructor({registry,dataDir,fork,host}){Object.assign(this,{registry,dataDir,fork,host});this.jobs=new Map();this.sequence=0;}
 async ensure(id){
  const manifest=this.registry.get(id);if(!manifest.backend||!manifest.permissions.includes('native.backend'))throw Error('此插件没有本机后台权限');
  const existing=this.jobs.get(id);if(existing){if(existing.stopping||existing.generation!==manifest.folder){this.stop(id);await existing.stopped;return this.ensure(id);}await existing.ready;return existing;}
  const job={pending:new Map(),generation:manifest.folder,stopping:false};job.stopped=new Promise(resolve=>{job.resolveStopped=resolve;});this.jobs.set(id,job);
  job.ready=this.launch(id,manifest,job);await job.ready;return job;
 }
 async launch(id,manifest,job){
  try{
   const entry=await this.registry.backendPath(id),dataDir=path.join(this.dataDir,id);await fs.mkdir(dataDir,{recursive:true});
   if(this.jobs.get(id)!==job||this.registry.get(id).folder!==manifest.folder)throw Error('插件后台已停止');
   job.child=this.fork(path.join(__dirname,'backend-runner.cjs'),[],{serviceName:'Plugin: '+manifest.name,stdio:'ignore'});
   await new Promise((resolve,reject)=>{
    job.rejectReady=reject;job.timer=setTimeout(()=>{reject(Error('插件后台启动超时'));this.stop(id);},15000);
    job.child.on('message',message=>{
     if(this.jobs.get(id)!==job)return;
     if(message.type==='ready'){clearTimeout(job.timer);resolve();}
     else if(message.type==='fatal'){reject(Error(message.error||'插件后台启动失败'));this.stop(id);}
     else if(message.type==='result'){const call=job.pending.get(message.id);if(call){job.pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error)):call.resolve(message.data);}}
     else if(message.type==='host'){void (async()=>{try{if(this.registry.get(id).folder!==job.generation||job.stopping)throw Error('插件后台正在停止');const data=await this.host(id,message.method,message.args);if(this.jobs.get(id)===job&&!job.stopping)this.post(id,job,{type:'hostResult',id:message.id,data});}catch(error){if(this.jobs.get(id)===job)this.post(id,job,{type:'hostResult',id:message.id,error:error.message});}})();}
     else if(message.type==='stopped')this.finish(id,job);
    });
    job.child.on('exit',()=>this.finish(id,job));job.child.on('error',()=>this.finish(id,job));
    this.post(id,job,{type:'boot',pluginId:id,entry,dataDir});
   });return job;
  }catch(error){this.finish(id,job);throw error;}
 }
 async request(id,method,args){
  if(typeof method!=='string'||!method||method.length>100||!Array.isArray(args)||Buffer.byteLength(JSON.stringify(args))>65536)throw Error('后台请求参数无效');
  const job=await this.ensure(id);if(this.jobs.get(id)!==job||job.stopping)throw Error('插件后台已停止');
  return new Promise((resolve,reject)=>{const requestId=++this.sequence;const timer=setTimeout(()=>{job.pending.delete(requestId);reject(Error('插件后台请求超时'));},150000);job.pending.set(requestId,{resolve,reject,timer});this.post(id,job,{type:'request',id:requestId,method,args});});
 }
 post(id,job,message){if(job.finished)return false;try{job.child.postMessage(message);return true;}catch{this.finish(id,job);return false;}}
 finish(id,job){
  if(job.finished)return;job.finished=true;
  if(this.jobs.get(id)===job)this.jobs.delete(id);clearTimeout(job.timer);clearTimeout(job.killTimer);job.rejectReady?.(Error('插件后台已停止'));
  for(const call of job.pending.values()){clearTimeout(call.timer);call.reject(Error('插件后台已停止'));}job.pending.clear();job.resolveStopped();job.child?.kill();
 }
 stop(id){const job=this.jobs.get(id);if(!job||job.stopping)return;job.stopping=true;for(const call of job.pending.values()){clearTimeout(call.timer);call.reject(Error('插件后台已停止'));}job.pending.clear();if(job.child){this.post(id,job,{type:'stop'});job.killTimer=setTimeout(()=>this.finish(id,job),2000);job.killTimer.unref?.();}else this.finish(id,job);}
 dispose(){for(const id of this.jobs.keys())this.stop(id);}
 async shutdown(){const jobs=[...this.jobs.values()];this.dispose();await Promise.all(jobs.map(job=>job.stopped));}
}
module.exports={BackendManager};
