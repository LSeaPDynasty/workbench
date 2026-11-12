const {app,BrowserWindow,WebContentsView,ipcMain,dialog,Menu,protocol,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {Worker}=require('node:worker_threads');
const {Registry,validatePackage}=require('./plugin-registry.cjs');
const {GitService,cleanFolder,cleanRemote}=require('./git-service.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'wb-plugin',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let win,registry,worker,gitWorker,gitService,autoUpdater,theme='light',active=null,sequence=0,installing=false;
const views=new Map(),pending=new Map(),gitPending=new Map(),lastOpened=new Map();
let updateStatus={phase:'unsupported',message:'仅安装版支持更新'};
const hostURL=pathToFileURL(path.join(__dirname,'../dist/index.html')).href;
function files(method,...args){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('文件操作超时'));},15000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,method,args});});}
function git(cwd,method,...args){return new Promise((resolve,reject)=>{const id=++sequence;const timeout=method==='githubLogin'?305000:35000;const timer=setTimeout(()=>{gitPending.delete(id);reject(Error('Git 操作超时'));},timeout);gitPending.set(id,{resolve,reject,timer});gitWorker.postMessage({id,cwd,method,args});});}
function result(fn){return async(...args)=>{try{return {ok:true,data:await fn(...args)};}catch(e){return {ok:false,error:e.message};}};}
function hostSender(e){if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||e.senderFrame.url!==hostURL)throw Error('禁止访问');}
function pluginSender(e){for(const [id,v]of views){if(e.sender===v.webContents&&e.senderFrame===v.webContents.mainFrame&&new URL(e.senderFrame.url).hostname===id){registry.get(id);return id;}}throw Error('插件身份无效');}
function requirePermission(id,permission){if(!registry.get(id).permissions.includes(permission))throw Error('未授予此权限');}
async function repoPath(id,repoId){const repo=gitService.getRepo(id,repoId);return {repo,cwd:await files('resolve',id,repo.rootId,repo.relative)};}
async function activateGitHub(owner,accountId){if(!accountId)return;const account=gitService.getAccount(owner,accountId);if(account.provider==='github'&&account.githubLogin)await git(app.getPath('userData'),'githubActivate',account.githubLogin);}
function setUpdateStatus(next){updateStatus={...updateStatus,...next};if(win&&!win.isDestroyed())win.webContents.send('host:update',updateStatus);}
async function checkUpdates(){
 if(!autoUpdater)throw Error('仅安装版支持检查更新');
 const feed=await require('./update-auth.cjs').privateFeed();
 autoUpdater.setFeedURL(feed);
 return autoUpdater.checkForUpdates();
}
function setupUpdates(){
 if(!app.isPackaged)return;
 try{autoUpdater=require('electron-updater').autoUpdater;autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=false;
  autoUpdater.on('checking-for-update',()=>setUpdateStatus({phase:'checking',message:'正在检查更新'}));
  autoUpdater.on('update-not-available',()=>setUpdateStatus({phase:'idle',message:'已是最新版本'}));
  autoUpdater.on('update-available',info=>setUpdateStatus({phase:'downloading',version:info.version,message:'正在下载更新'}));
  autoUpdater.on('download-progress',info=>setUpdateStatus({phase:'downloading',progress:Math.round(info.percent),message:'正在下载更新'}));
  autoUpdater.on('update-downloaded',info=>setUpdateStatus({phase:'downloaded',version:info.version,progress:100,message:'更新已下载'}));
  autoUpdater.logger=null;
  autoUpdater.on('error',()=>setUpdateStatus({phase:'error',message:'更新失败，请检查网络和 GitHub 仓库权限'}));
  void checkUpdates().catch(error=>setUpdateStatus({phase:'error',message:error.message?.startsWith('请先')?error.message:'更新失败，请检查网络和 GitHub 仓库权限'}));
 }catch(error){setUpdateStatus({phase:'error',message:error.message||'更新服务不可用'});}
}
function bounds(rect){if(!rect||!['x','y','width','height'].every(k=>Number.isFinite(rect[k])))throw Error('窗口尺寸无效');const [width,height]=win.getContentSize();const x=Math.min(Math.max(0,Math.round(rect.x)),width),y=Math.min(Math.max(0,Math.round(rect.y)),height);return {x,y,width:Math.min(Math.max(0,Math.round(rect.width)),width-x),height:Math.min(Math.max(0,Math.round(rect.height)),height-y)};}
function hide(){for(const v of views.values())v.setVisible(false);active=null;}
function close(id){const v=views.get(id);if(v){views.delete(id);win.contentView.removeChildView(v);v.webContents.close();}lastOpened.delete(id);if(active===id)active=null;}
async function show(id,rect){const manifest=registry.get(id);hide();let view=views.get(id);if(!view){
 const ses=session.fromPartition('plugin:'+id);
 if(ses.protocol.isProtocolHandled && await ses.protocol.isProtocolHandled('wb-plugin'))ses.protocol.unhandle('wb-plugin');
 ses.setPermissionRequestHandler((wc,permission,callback)=>callback(false));ses.setPermissionCheckHandler(()=>false);
 ses.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('wb-plugin://'+id+'/')&&!details.url.startsWith('data:image/')}));
 ses.protocol.handle('wb-plugin',async request=>{try{const url=new URL(request.url);if(url.hostname!==id||request.method!=='GET')return new Response('',{status:403});const rel=decodeURIComponent(url.pathname.slice(1));const data=await registry.asset(id,rel);const ext=path.extname(rel);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};return new Response(data,{headers:{'Content-Type':types[ext]||'application/octet-stream','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff'}});}catch{return new Response('',{status:404});}});
 view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'plugin-preload.cjs'),session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:true}});
 view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.on('will-navigate',e=>e.preventDefault());view.webContents.on('will-attach-webview',e=>e.preventDefault());
 view.webContents.on('render-process-gone',()=>{close(id);if(!win.isDestroyed())win.webContents.send('host:error',manifest.name+'已停止，可重新打开');});
 views.set(id,view);win.contentView.addChildView(view);view.setVisible(false);
 try{await view.webContents.loadURL('wb-plugin://'+id+'/'+manifest.entry);}catch(e){close(id);throw e;}
 }
 // A newer host selection may already have superseded this request.
 return view;
}
async function install(){if(installing)throw Error('正在安装');installing=true;try{hide();const selected=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'工作台插件',extensions:['wbplugin']}]});if(selected.canceled)return registry.list();const info=await fs.stat(selected.filePaths[0]);if(info.size>6*1024*1024)throw Error('插件包超过 6 MB');const pkg=JSON.parse(await fs.readFile(selected.filePaths[0],'utf8'));const m=validatePackage(pkg);const permissions=m.permissions.map(p=>({'folders.read':'读取你选择的文件夹','file.receive':'读取交给此应用的文件','git.manage':'在你选择的目录中执行受限 Git 操作'})[p]);const consent=await dialog.showMessageBox(win,{type:'question',buttons:['取消','安装'],defaultId:0,cancelId:0,message:m.name+' '+m.version,detail:permissions.join('\n')||'无文件权限'});if(consent.response!==1)return registry.list();close(m.id);await files('revokePlugin',m.id);await registry.install(pkg);return registry.list();}finally{installing=false;}}
let selectionGeneration=0;
ipcMain.handle('host:request',result(async(e,method,args)=>{hostSender(e);if(!Array.isArray(args))throw Error('参数无效');switch(method){
 case 'list':return registry.list();case 'install':return install();
 case 'enable':case 'remove':{const [id,enabled]=args;if(typeof id!=='string')throw Error('参数无效');if(method==='enable')await registry.setEnabled(id,enabled);else {const consent=await dialog.showMessageBox(win,{type:'question',buttons:['取消','卸载'],defaultId:0,cancelId:0,message:'卸载此插件？',detail:'保留文件夹配置，不删除原文件。'});if(consent.response!==1)return registry.list();await registry.remove(id);}close(id);await files('revokePlugin',id);return registry.list();}
 case 'show':{const [id,rect]=args;const checked=bounds(rect),generation=++selectionGeneration;const view=await show(id,checked);if(generation!==selectionGeneration)return;view.setBounds(checked);view.setVisible(true);active=id;view.webContents.send('plugin:theme',theme);return;}
 case 'hide':selectionGeneration++;hide();return;
 case 'bounds':if(active&&views.has(active))views.get(active).setBounds(bounds(args[0]));return;
 case 'theme':if(!['light','dark'].includes(args[0]))throw Error('主题无效');theme=args[0];for(const v of views.values())v.webContents.send('plugin:theme',theme);return;
 case 'close':close(args[0]);return;
 case 'update.status':return updateStatus;
 case 'update.check':try{await checkUpdates();}catch{setUpdateStatus({phase:'error',message:'更新失败，请检查 GitHub CLI 登录、网络和仓库权限'});}return updateStatus;
 case 'update.install':if(!autoUpdater||updateStatus.phase!=='downloaded')throw Error('没有可安装的更新');autoUpdater.quitAndInstall(false,true);return;
 default:throw Error('未知操作');
}}));
ipcMain.handle('plugin:request',result(async(e,method,args)=>{const id=pluginSender(e);if(!Array.isArray(args)||args.length>4)throw Error('参数无效');
 if(method==='initial')return {theme,file:lastOpened.get(id)||null};
 if(method.startsWith('folders.')||method==='files.list'||method==='files.menu')requirePermission(id,'folders.read');
 if(method.startsWith('git.'))requirePermission(id,'git.manage');
 switch(method){
 case 'folders.list':return files('listRoots',id);
 case 'folders.choose':{if(active!==id)throw Error('请先打开此应用');const picked=await dialog.showOpenDialog(win,{properties:['openDirectory','multiSelections']});if(!picked.canceled){for(const dir of picked.filePaths){registry.get(id);await files('add',id,dir);}}return files('listRoots',id);}
 case 'folders.enable':return files('change',id,args[0],args[1]);
 case 'folders.remove':return files('remove',id,args[0]);
 case 'files.list':return files('list',id,args[0],args[1]||'',args[2]||0);
 case 'files.read':requirePermission(id,'file.receive');return files('read',id,args[0],args[1]);
 case 'files.menu':{if(active!==id)throw Error('应用不在前台');const token=args[0],file=await files('describe',id,token);const handlers=registry.handlers(file.name);const items=handlers.length?handlers.map(handler=>({label:handler.name,click:async()=>{try{registry.get(handler.id);requirePermission(handler.id,'file.receive');const grant=await files('grant',id,token,handler.id);lastOpened.set(handler.id,grant);const target=views.get(handler.id);if(target)target.webContents.send('plugin:open',grant);win.webContents.send('host:navigate',handler.id);}catch(err){win.webContents.send('host:error',err.message);}}})):[{label:'没有可用应用',enabled:false}];Menu.buildFromTemplate([{label:'打开方式',submenu:items}]).popup({window:win});return;}
 case 'git.accounts.list':return gitService.listAccounts(id);
 case 'git.accounts.save':return gitService.saveAccount(id,args[0]);
 case 'git.accounts.remove':return gitService.removeAccount(id,args[0]);
 case 'git.github.login':{const account=gitService.getAccount(id,args[0]);if(account.provider!=='github')throw Error('请选择 GitHub 账号');const login=await git(app.getPath('userData'),'githubLogin');return gitService.setGithubLogin(id,account.id,login);}
 case 'git.github.activate':{const account=gitService.getAccount(id,args[0]);if(account.provider!=='github'||!account.githubLogin)throw Error('请先通过浏览器登录 GitHub');return activateGitHub(id,account.id);}
 case 'git.repos.list':return gitService.listRepos(id);
 case 'git.repos.remove':return gitService.removeRepo(id,args[0]);
 case 'git.repos.register':{const cwd=await files('resolve',id,args[0],'');await git(cwd,'inspect');return gitService.addRepo(id,args[0],'',args[1]);}
 case 'git.repos.init':{const cwd=await files('resolve',id,args[0],'');await git(cwd,'init');return gitService.addRepo(id,args[0],'',args[1]);}
 case 'git.repos.clone':{const rootId=args[0],remote=cleanRemote(args[1]),folder=cleanFolder(args[2]),accountId=args[3];const cwd=await files('resolve',id,rootId,'');await git(cwd,'clone',remote,folder);return gitService.addRepo(id,rootId,folder,accountId);}
 case 'git.status':{const {cwd}=await repoPath(id,args[0]);return git(cwd,'inspect');}
 case 'git.log':{const {cwd}=await repoPath(id,args[0]);return git(cwd,'log',args[1]);}
 case 'git.diff':{const {cwd}=await repoPath(id,args[0]);return git(cwd,'diff');}
 case 'git.stage':{const {cwd}=await repoPath(id,args[0]);return git(cwd,'stage',args[1]);}
 case 'git.unstage':{const {cwd}=await repoPath(id,args[0]);return git(cwd,'unstage',args[1]);}
 case 'git.commit':{const {cwd}=await repoPath(id,args[0]);return git(cwd,'commit',args[1]);}
 case 'git.push':{const {repo,cwd}=await repoPath(id,args[0]);await activateGitHub(id,repo.accountId);return git(cwd,'push',args[1],args[2]);}
 case 'git.pull':{const {repo,cwd}=await repoPath(id,args[0]);await activateGitHub(id,repo.accountId);return git(cwd,'pull',args[1],args[2]);}
 default:throw Error('未知操作');
 }
}));
app.whenReady().then(async()=>{registry=new Registry(path.join(app.getPath('userData'),'plugins-v1'));await registry.init();
 gitService=new GitService(path.join(app.getPath('userData'),'git-v1.json'));await gitService.init();
 const builtin=path.join(app.getAppPath(),'bundled-plugins');for(const entry of await fs.readdir(builtin)){if(entry.endsWith('.wbplugin')){const pkg=JSON.parse(await fs.readFile(path.join(builtin,entry),'utf8'));if(!registry.items.has(pkg.manifest.id)&&!await fs.stat(path.join(app.getPath('userData'),'plugins-seeded')).then(()=>true,()=>false))await registry.install(pkg);}}
 await fs.writeFile(path.join(app.getPath('userData'),'plugins-seeded'),'1');
 worker=new Worker(path.join(__dirname,'files-worker.cjs'),{workerData:{config:path.join(app.getPath('userData'),'folders-v1.json')}});
 worker.on('message',({id,data,error})=>{const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);error?p.reject(Error(error)):p.resolve(data);});
 worker.on('error',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('文件服务停止，请重启'));}pending.clear();});
 gitWorker=new Worker(path.join(__dirname,'git-worker.cjs'));
 gitWorker.on('message',({id,data,error})=>{const p=gitPending.get(id);if(!p)return;clearTimeout(p.timer);gitPending.delete(id);error?p.reject(Error(error)):p.resolve(data);});
 gitWorker.on('error',()=>{for(const p of gitPending.values()){clearTimeout(p.timer);p.reject(Error('Git 服务停止，请重启'));}gitPending.clear();});
 win=new BrowserWindow({width:1320,height:880,minWidth:960,minHeight:640,backgroundColor:'#eeeee8',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.on('closed',()=>{for(const v of views.values())v.webContents.close();views.clear();worker.terminate();gitWorker.terminate();});await win.loadURL(hostURL);setupUpdates();
}).catch(e=>{dialog.showErrorBox('无法启动',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
