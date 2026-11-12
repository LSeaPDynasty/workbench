const {createHash}=require('node:crypto');
const {validatePackage}=require('./plugin-registry.cjs');
const API='https://api.github.com/repos/LSeaPDynasty/workbench';
function newer(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function candidates(installed,assets){
 const updates=new Map();
 for(const asset of assets){
  const match=/^([a-z][a-z0-9-]{1,40})-(\d+\.\d+\.\d+)\.wbplugin$/.exec(asset.name||'');
  if(!match||!Number.isSafeInteger(asset.id)||asset.size>6*1024*1024||!/^sha256:[a-f0-9]{64}$/.test(asset.digest||''))continue;
  const [,id,version]=match,old=installed.find(p=>p.id===id);
  if(!old||!newer(version,old.version)||(updates.has(id)&&!newer(version,updates.get(id).version)))continue;
  updates.set(id,{id,name:old.name,from:old.version,version,assetId:asset.id,digest:asset.digest,size:asset.size});
 }
 return [...updates.values()];
}
async function readLimited(response,limit){
 if(!response.ok)throw Error('更新源访问失败，请检查网络和 GitHub 仓库权限');
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw Error('更新文件过大');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 return Buffer.concat(chunks);
}
class PluginUpdates{
 constructor(registry,fetch,feed){this.registry=registry;this.fetch=fetch;this.feed=feed;this.pending=new Map();}
 async request(url,accept){const {token}=await this.feed();return this.fetch(url,{headers:{Authorization:'Bearer '+token,Accept:accept,'User-Agent':'ModularWorkbench','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(60000)});}
 async check(){
  const response=await this.request(API+'/releases/latest','application/vnd.github+json');
  const release=JSON.parse((await readLimited(response,2*1024*1024)).toString('utf8'));
  const items=candidates(this.registry.list(),Array.isArray(release.assets)?release.assets:[]);
  this.pending=new Map(items.map(item=>[item.id,item]));
  return items.map(({assetId,digest,size,...item})=>item);
 }
 async download(id){
  const item=this.pending.get(id);if(!item)throw Error('请先检查插件更新');
  const old=this.registry.list().find(p=>p.id===id);if(!old||old.version!==item.from)throw Error('插件版本已改变，请重新检查');
  const response=await this.request(API+'/releases/assets/'+item.assetId,'application/octet-stream');
  const body=await readLimited(response,6*1024*1024);
  if(body.length!==item.size||'sha256:'+createHash('sha256').update(body).digest('hex')!==item.digest)throw Error('插件校验失败');
  const pkg=JSON.parse(body.toString('utf8')),manifest=validatePackage(pkg);
  if(manifest.id!==id||manifest.version!==item.version)throw Error('插件身份或版本不匹配');
  return {pkg,manifest,old};
 }
}
module.exports={PluginUpdates,candidates,newer,readLimited};
