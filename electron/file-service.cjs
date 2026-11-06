const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
class FileService {
  constructor(config){this.config=config;this.roots=[];this.tokens=new Map();this.saveTail=Promise.resolve();}
  async init(){try{this.roots=JSON.parse(await fs.readFile(this.config,'utf8'));if(!Array.isArray(this.roots)||this.roots.some(r=>typeof r.path!=='string'||typeof r.id!=='string'))throw Error('invalid');}catch(e){if(e.code!=='ENOENT')throw Error('文件夹配置损坏');}}
  async save(){const data=JSON.stringify(this.roots);const op=this.saveTail.then(async()=>{await fs.mkdir(path.dirname(this.config),{recursive:true});await fs.writeFile(this.config+'.tmp',data);await fs.rename(this.config+'.tmp',this.config);});this.saveTail=op.catch(()=>{});return op;}
  listRoots(owner){return this.roots.filter(r=>r.owner===owner).map(r=>({...r}));}
  async add(owner,dir){const real=await fs.realpath(dir);if(!(await fs.stat(real)).isDirectory())throw Error('请选择文件夹');if(!this.roots.some(r=>r.owner===owner&&r.path.toLowerCase()===real.toLowerCase())){this.roots.push({id:randomUUID(),owner,path:real,name:path.basename(real)||real,enabled:true});await this.save();}return this.listRoots(owner);}
  async change(owner,id,enabled){const r=this.roots.find(x=>x.owner===owner&&x.id===id);if(!r||typeof enabled!=='boolean')throw Error('文件夹不存在');r.enabled=enabled;await this.save();this.revoke(id);return this.listRoots(owner);}
  async remove(owner,id){if(!this.roots.some(r=>r.owner===owner&&r.id===id))throw Error('文件夹不存在');this.roots=this.roots.filter(r=>!(r.owner===owner&&r.id===id));this.revoke(id);await this.save();return this.listRoots(owner);}
  revoke(id){for(const [key,t]of this.tokens)if(t.rootId===id)this.tokens.delete(key);}
  revokePlugin(id){for(const [key,t]of this.tokens)if(t.owner===id||t.recipient===id)this.tokens.delete(key);}
  async resolve(owner,id,relative=''){
    const root=this.roots.find(r=>r.owner===owner&&r.id===id&&r.enabled);if(!root)throw Error('文件夹未加载');
    if(typeof relative!=='string'||relative.length>4096||relative.includes('\0')||relative.includes(':')||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('路径无效');
    const realRoot=await fs.realpath(root.path);if(realRoot.toLowerCase()!==root.path.toLowerCase())throw Error('文件夹位置已改变，请重新添加');
    const target=await fs.realpath(path.join(realRoot,relative));const rel=path.relative(realRoot,target);if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('禁止访问文件夹外部');return target;
  }
  token(owner,rootId,relative,name){const key=owner+'\0'+rootId+'\0'+relative;for(const [id,t]of this.tokens)if(t.key===key&&!t.recipient)return id;const id=randomUUID();this.tokens.set(id,{key,owner,rootId,relative,name});if(this.tokens.size>10000)this.tokens.delete(this.tokens.keys().next().value);return id;}
  async list(owner,rootId,relative='',offset=0){if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw Error('分页无效');const dir=await this.resolve(owner,rootId,relative);const entries=[];let i=0,more=false;
    const handle=await fs.opendir(dir);for await(const entry of handle){if(i++<offset)continue;if(entries.length>=200){more=true;break;}const rel=path.join(relative,entry.name);const kind=entry.isSymbolicLink()?'link':entry.isDirectory()?'directory':entry.isFile()?'file':'other';let size=null,modified=null;try{const info=await fs.lstat(path.join(dir,entry.name));size=kind==='file'?info.size:null;modified=info.mtime.toISOString();}catch{}
      entries.push({name:entry.name,relative:rel,kind,size,modified,token:kind==='file'?this.token(owner,rootId,rel,entry.name):null});}
    return {entries,next:more?offset+entries.length:null};
  }
  async describe(owner,token){const t=this.tokens.get(token);if(!t||t.owner!==owner||t.recipient)throw Error('文件引用已失效');const file=await this.resolve(t.owner,t.rootId,t.relative);if(!(await fs.stat(file)).isFile())throw Error('不是文件');return {name:t.name};}
  async grant(owner,token,recipient){await this.describe(owner,token);const t=this.tokens.get(token);const id=randomUUID();this.tokens.set(id,{...t,recipient});return {token:id,name:t.name};}
  async read(recipient,token,format='text'){
    const t=this.tokens.get(token);if(!t||t.recipient!==recipient)throw Error('没有文件读取权限');const file=await this.resolve(t.owner,t.rootId,t.relative);const fd=await fs.open(file,'r');try{const stat=await fd.stat();const limit=format==='image'?8*1024*1024:2*1024*1024;if(!stat.isFile()||stat.size>limit)throw Error(format==='image'?'图片超过 8 MB':'文本超过 2 MB');const buf=Buffer.alloc(limit+1);let count=0;while(count<buf.length){const {bytesRead}=await fd.read(buf,count,buf.length-count,null);if(!bytesRead)break;count+=bytesRead;}if(count>limit)throw Error('文件过大');const content=buf.subarray(0,count);
      if(format==='image'){const ext=path.extname(t.name).toLowerCase(),mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'}[ext];if(!mime)throw Error('不支持的图片');return {name:t.name,data:'data:'+mime+';base64,'+content.toString('base64')};}
      if(format!=='text'||content.includes(0))throw Error('不支持的文本编码');let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(content);}catch{throw Error('仅支持 UTF-8 文本');}return {name:t.name,text};
    }finally{await fd.close();}
  }
}
module.exports={FileService};
