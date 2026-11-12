// The same protocol supports Electron utility processes and Node IPC tests.
const port=process.parentPort;
const send=message=>port?port.postMessage(message):process.send?.(message);
const listen=fn=>port?port.on('message',event=>fn(event.data)):process.on('message',fn);
let service,ready,sequence=0;const pending=new Map();
function host(method,...args){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('主体能力调用超时'));},60000);pending.set(id,{resolve,reject,timer});send({type:'host',id,method,args});});}
listen(async message=>{
 try{
  if(message.type==='boot'){
   if(ready)throw Error('后台已初始化');
   ready=Promise.resolve().then(()=>require(message.entry).create({id:message.pluginId,dataDir:message.dataDir,host})).then(value=>{service=value;send({type:'ready'});});
   await ready;return;
  }
  if(message.type==='hostResult'){const call=pending.get(message.id);if(call){pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error)):call.resolve(message.data);}return;}
  if(message.type==='stop'){await service?.dispose?.();send({type:'stopped'});process.exit(0);}
  if(message.type==='request'){await ready;if(!service||typeof service.request!=='function')throw Error('后台入口无效');const data=await service.request(message.method,message.args);send({type:'result',id:message.id,data});}
 }catch(error){send({type:message.type==='boot'?'fatal':'result',id:message.id,error:error.message||'后台操作失败'});}
});
process.on('disconnect',()=>{void Promise.resolve(service?.dispose?.()).finally(()=>process.exit(0));});
