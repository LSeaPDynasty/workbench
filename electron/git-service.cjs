const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

const PROVIDERS=new Set(['github','gitlab','self-hosted']);
const AUTH_METHODS=new Set(['system','ssh']);
function cleanText(value,field,max=120){
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\0\r\n]/.test(value))throw Error(field+'无效');
  return value.trim();
}
function cleanRelative(value){
  if(value===''||value===undefined)return '';
  if(typeof value!=='string'||value.length>240||value.includes('\0')||path.isAbsolute(value)||value.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'))throw Error('仓库目录无效');
  return value.replaceAll('\\','/');
}
function cleanFolder(value){
  const result=cleanRelative(value);
  if(!result||result.includes('/'))throw Error('仓库名称无效');
  return result;
}
function cleanRemote(value){
  const remote=cleanText(value,'远端地址',2048);
  if(/\s/.test(remote)||/^https?:\/\/[^/]*@/i.test(remote))throw Error('远端地址无效');
  if(!/^(https?:\/\/|ssh:\/\/|git@|[\w.-]+@[^:\s]+:)/i.test(remote))throw Error('远端地址无效');
  return remote;
}
class GitService {
  constructor(config){this.config=config;this.accounts=[];this.repos=[];this.tail=Promise.resolve();}
  async init(){
    let data={accounts:[],repos:[]};
    try{data=JSON.parse(await fs.readFile(this.config,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Git 配置损坏');}
    if(!Array.isArray(data.accounts)||!Array.isArray(data.repos))throw Error('Git 配置损坏');
    this.accounts=data.accounts.filter(a=>a&&typeof a.id==='string'&&typeof a.owner==='string'&&typeof a.name==='string'&&PROVIDERS.has(a.provider)&&AUTH_METHODS.has(a.auth));
    this.repos=data.repos.filter(r=>r&&typeof r.id==='string'&&typeof r.owner==='string'&&typeof r.rootId==='string'&&typeof r.relative==='string');
  }
  serial(fn){const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next;}
  async save(){const data=JSON.stringify({accounts:this.accounts,repos:this.repos});await fs.mkdir(path.dirname(this.config),{recursive:true});await fs.writeFile(this.config+'.tmp',data);await fs.rename(this.config+'.tmp',this.config);}
  listAccounts(owner){return this.accounts.filter(a=>a.owner===owner).map(a=>({...a}));}
  listRepos(owner){return this.repos.filter(r=>r.owner===owner).map(r=>({...r}));}
  saveAccount(owner,input){return this.serial(async()=>{
    if(typeof owner!=='string')throw Error('插件身份无效');
    const account={id:typeof input?.id==='string'&&this.accounts.some(a=>a.id===input.id&&a.owner===owner)?input.id:randomUUID(),owner,name:cleanText(input?.name,'账号名称',60),provider:input?.provider,server:cleanText(input?.server,'服务器地址',260),auth:input?.auth};
    if(!PROVIDERS.has(account.provider)||!AUTH_METHODS.has(account.auth))throw Error('账号类型无效');
    const index=this.accounts.findIndex(a=>a.id===account.id);if(index<0)this.accounts.push(account);else this.accounts[index]=account;await this.save();return account;
  });}
  removeAccount(owner,id){return this.serial(async()=>{if(typeof id!=='string'||this.repos.some(r=>r.owner===owner&&r.accountId===id))throw Error('账号仍被仓库使用');const before=this.accounts.length;this.accounts=this.accounts.filter(a=>!(a.owner===owner&&a.id===id));if(before===this.accounts.length)throw Error('账号不存在');await this.save();});}
  addRepo(owner,rootId,relative,accountId){return this.serial(async()=>{
    if(typeof owner!=='string'||typeof rootId!=='string')throw Error('仓库信息无效');relative=cleanRelative(relative);
    if(accountId!==null&&accountId!==undefined&&!this.accounts.some(a=>a.owner===owner&&a.id===accountId))throw Error('账号不存在');
    const existing=this.repos.find(r=>r.owner===owner&&r.rootId===rootId&&r.relative===relative);
    if(existing){existing.accountId=accountId||null;await this.save();return {...existing};}
    const repo={id:randomUUID(),owner,rootId,relative,accountId:accountId||null};this.repos.push(repo);await this.save();return {...repo};
  });}
  getRepo(owner,id){const repo=this.repos.find(r=>r.owner===owner&&r.id===id);if(!repo)throw Error('仓库不存在');return {...repo};}
  removeRepo(owner,id){return this.serial(async()=>{const before=this.repos.length;this.repos=this.repos.filter(r=>!(r.owner===owner&&r.id===id));if(before===this.repos.length)throw Error('仓库不存在');await this.save();});}
}
module.exports={GitService,cleanRelative,cleanFolder,cleanRemote};
