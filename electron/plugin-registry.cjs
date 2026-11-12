const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const PERMISSIONS = new Set(['folders.read', 'file.receive', 'git.manage']);
function safeRelative(name) {
  if (typeof name !== 'string' || name.length > 240 || name.includes('\\') || name.includes(':') || name.includes('\0') || name.startsWith('/') || name.split('/').some(x => !x || x === '.' || x === '..' || /[. ]$/.test(x) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(x))) throw Error('无效的插件路径');
  return name;
}
function validatePackage(pkg) {
  const m = pkg?.manifest;
  if (!m || !/^[a-z][a-z0-9-]{1,40}$/.test(m.id) || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 40 || !/^\d+\.\d+\.\d+$/.test(m.version) || m.apiVersion !== 1) throw Error('插件信息或 API 版本无效');
  safeRelative(m.entry);
  if (!Array.isArray(m.permissions) || m.permissions.some(x=>!PERMISSIONS.has(x))) throw Error('不支持的插件权限');
  if (m.fileTypes !== undefined && (!Array.isArray(m.fileTypes) || m.fileTypes.length > 50 || m.fileTypes.some(x=>typeof x!=='string'||!/^\.[a-z0-9]{1,12}$/.test(x)))) throw Error('文件类型无效');
  if (m.fileTypes?.length && !m.permissions.includes('file.receive')) throw Error('缺少接收文件权限');
  if (!pkg.files || typeof pkg.files !== 'object' || Array.isArray(pkg.files)) throw Error('插件文件缺失');
  const keys=Object.keys(pkg.files), seen=new Set();let total=0;
  if (!keys.length || keys.length > 100) throw Error('插件文件数量超限');
  for (const k of keys) {
    safeRelative(k);const lower=k.toLowerCase();if(seen.has(lower))throw Error('重复文件名');seen.add(lower);
    if (typeof pkg.files[k]!=='string')throw Error('文件内容无效');total+=Buffer.byteLength(pkg.files[k]);
  }
  if(total>5*1024*1024 || !Object.hasOwn(pkg.files,m.entry))throw Error('入口缺失或插件包过大');
  return {id:m.id,name:m.name.trim(),version:m.version,apiVersion:1,entry:m.entry,permissions:[...new Set(m.permissions)],fileTypes:m.fileTypes||[]};
}
class Registry {
  constructor(dir){this.dir=dir;this.items=new Map();this.tail=Promise.resolve();}
  async init(){await fs.mkdir(this.dir,{recursive:true});let data;try{data=JSON.parse(await fs.readFile(path.join(this.dir,'registry.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('插件注册表损坏');data=[];}
    for(const item of data){try{if(!/^[a-z][a-z0-9-]{1,40}$/.test(item.id)||!/^\d+\.\d+\.\d+-[a-f0-9-]+$/.test(item.folder))continue;const pkg=JSON.parse(await fs.readFile(path.join(this.dir,item.id,item.folder,'package.wbplugin'),'utf8'));const manifest=validatePackage(pkg);if(manifest.id!==item.id)continue;this.items.set(item.id,{...manifest,folder:item.folder,enabled:item.enabled!==false});}catch{ /* A broken package stays unregistered. */ }}
  }
  list(){return [...this.items.values()].map(({folder,...m})=>m);}
  get(id){const item=this.items.get(id);if(!item||!item.enabled)throw Error('插件未启用');return item;}
  async save(){const target=path.join(this.dir,'registry.json'),tmp=target+'.tmp';await fs.writeFile(tmp,JSON.stringify([...this.items.values()],null,2));await fs.rename(tmp,target);}
  serial(fn){const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next;}
  install(pkg,options={}){return this.serial(async()=>{const m=validatePackage(pkg);const previous=this.items.get(m.id);const folder=m.version+'-'+randomUUID(),dest=path.join(this.dir,m.id,folder);await fs.mkdir(dest,{recursive:true});
    await fs.writeFile(path.join(dest,'package.wbplugin'),JSON.stringify(pkg));
    for(const [name,content] of Object.entries(pkg.files)){const out=path.join(dest,name);await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,content);}
    this.items.set(m.id,{...m,folder,enabled:options.preserveEnabled&&previous?previous.enabled:true});try{await this.save();}catch(e){if(previous)this.items.set(m.id,previous);else this.items.delete(m.id);throw e;}return m;
  });}
  setEnabled(id,enabled){return this.serial(async()=>{const item=this.items.get(id);if(!item||typeof enabled!=='boolean')throw Error('无效的插件');const old=item.enabled;item.enabled=enabled;try{await this.save();}catch(e){item.enabled=old;throw e;}});}
  remove(id){return this.serial(async()=>{const old=this.items.get(id);this.items.delete(id);try{await this.save();}catch(e){if(old)this.items.set(id,old);throw e;}});}
  handlers(name){const base=path.basename(name).toLowerCase();const ext=path.extname(base)||(/^\.[a-z0-9]+$/.test(base)?base:'');return this.list().filter(m=>m.enabled&&m.fileTypes.includes(ext));}
  async asset(id,rel){const m=this.get(id);safeRelative(rel);const base=await fs.realpath(path.join(this.dir,id,m.folder));const file=await fs.realpath(path.join(base,rel));const relative=path.relative(base,file);if(relative.startsWith('..')||path.isAbsolute(relative)||rel==='package.wbplugin')throw Error('禁止访问');return fs.readFile(file);}
}
module.exports={Registry,validatePackage,safeRelative};
