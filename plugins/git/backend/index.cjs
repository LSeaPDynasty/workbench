const path=require('node:path'),fs=require('node:fs/promises'),{Worker}=require('node:worker_threads');
const {GitService,cleanRemote,cleanFolder}=require('./git-service.cjs');
const {GithubLogin}=require('./github-login.cjs');
exports.create=async context=>{
 const owner=context.id,config=path.join(context.dataDir,'state-v1.json');
 // Migration belongs to this plugin. Keep the old file intact for recovery.
 try{await fs.stat(config);}catch(error){if(error.code!=='ENOENT')throw error;const legacy=path.resolve(context.dataDir,'../..','git-v1.json');try{const data=JSON.parse(await fs.readFile(legacy,'utf8'));if(!Array.isArray(data.accounts)||!Array.isArray(data.repos))throw Error('旧版 Git 数据无效');const own={accounts:data.accounts.filter(a=>a.owner===owner),repos:data.repos.filter(r=>r.owner===owner)};await fs.writeFile(config+'.tmp',JSON.stringify(own));await fs.rename(config+'.tmp',config);}catch(e){if(e.code!=='ENOENT')throw e;}}
 const service=new GitService(config);await service.init();
 const worker=new Worker(path.join(__dirname,'git-worker.cjs')),pending=new Map();let sequence=0,disposed=false;
 function operation(cwd,method,...args){if(disposed)return Promise.reject(Error('Git 后台已停止'));return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Git 操作超时'));},140000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,cwd,method,args});});}
 worker.on('message',({id,data,error})=>{const call=pending.get(id);if(!call)return;pending.delete(id);clearTimeout(call.timer);error?call.reject(Error(error)):call.resolve(data);});
 function fail(){for(const call of pending.values()){clearTimeout(call.timer);call.reject(Error('Git 后台已停止'));}pending.clear();}
 worker.on('error',()=>{disposed=true;fail();});
 worker.on('exit',()=>{disposed=true;fail();});
 const login=new GithubLogin({save:(id,account,user)=>service.setGithubLogin(id,account,user),open:url=>context.host('browser.open',url)});
 async function environment(){const env={...process.env};let proxy='';try{proxy=await context.host('network.proxy','https://github.com');}catch{}const target=proxy.split(';').map(s=>s.trim()).find(s=>/^PROXY [\w.\[\]:-]+$/.test(s));if(target){env.HTTPS_PROXY='http://'+target.slice(6);env.HTTP_PROXY=env.HTTPS_PROXY;}return env;}
 async function repository(id){const repo=service.getRepo(owner,id);return {repo,cwd:await context.host('folders.resolve',repo.rootId,repo.relative)};}
 async function activate(accountId){if(!accountId)return;const account=service.getAccount(owner,accountId);if(account.provider==='github'&&account.githubLogin)await operation(context.dataDir,'githubActivate',account.githubLogin);}
 async function clone(rootId,remote,folder,accountId){remote=cleanRemote(remote);folder=cleanFolder(folder);const account=accountId?service.getAccount(owner,accountId):null,cwd=await context.host('folders.resolve',rootId,'');if(account?.provider==='github'&&account.githubLogin&&remote.startsWith('https://github.com/'))await operation(cwd,'authenticatedClone',account.githubLogin,remote,folder,await environment());else await operation(cwd,'clone',remote,folder);return service.addRepo(owner,rootId,folder,accountId);}
 return {
  async request(method,args){if(disposed)throw Error('Git 后台已停止');switch(method){
   case 'accounts.list':return service.listAccounts(owner);
   case 'accounts.save':return service.saveAccount(owner,args[0]);
   case 'accounts.remove':return service.removeAccount(owner,args[0]);
   case 'github.start':{const account=service.getAccount(owner,args[0]);if(account.provider!=='github')throw Error('请选择 GitHub 账号');return login.start(owner,account.id,await environment());}
   case 'github.status':return login.status(owner);
   case 'github.cancel':return login.cancel(owner);
   case 'github.open':if(login.status(owner).phase!=='waiting')throw Error('当前没有待完成的登录');return context.host('browser.open','https://github.com/login/device');
   case 'github.request':{const account=service.getAccount(owner,args[0]);if(account.provider!=='github'||!account.githubLogin)throw Error('请先登录此 GitHub 账号');return operation(context.dataDir,'githubGet',account.githubLogin,args[1],await environment());}
   case 'github.openPage':{const resource=args[0];if(typeof resource!=='string'||resource.length>500||!/^\/?[A-Za-z0-9_.\/-]+$/.test(resource)||resource.startsWith('//')||resource.split('/').some(p=>p==='.'||p==='..'))throw Error('网页路径无效');return context.host('browser.open','https://github.com/'+resource.replace(/^\//,''));}
   case 'github.activate':return activate(args[0]);
   case 'repos.list':return service.listRepos(owner);
   case 'repos.remove':return service.removeRepo(owner,args[0]);
   case 'repos.register':case 'repos.init':{const cwd=await context.host('folders.resolve',args[0],'');await operation(cwd,method==='repos.init'?'init':'inspect');return service.addRepo(owner,args[0],'',args[1]);}
   case 'repos.clone':return clone(...args);
   case 'repos.cloneToFolder':{cleanRemote(args[1]);cleanFolder(args[2]);if(args[0])service.getAccount(owner,args[0]);const root=await context.host('dialog.directory');return root?clone(root.id,args[1],args[2],args[0]):null;}
   case 'status':case 'log':case 'diff':case 'stage':case 'unstage':case 'commit':case 'push':case 'pull':{const {repo,cwd}=await repository(args[0]);if(method==='push'||method==='pull')await activate(repo.accountId);return operation(cwd,method==='status'?'inspect':method,...args.slice(1));}
   default:throw Error('未知 Git 操作');
  }},
  async dispose(){login.dispose();try{await operation(context.dataDir,'shutdown');}catch{}disposed=true;fail();await worker.terminate();}
 };
};
