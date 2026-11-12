const {app,BrowserWindow,WebContentsView,ipcMain,dialog,Menu,protocol,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {Worker}=require('node:worker_threads');
const {Registry,validatePackage}=require('./plugin-registry.cjs');
const {BackendManager}=require('./backend-manager.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'wb-plugin',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let win,registry,worker,backendManager,autoUpdater,theme='light',active=null,sequence=0,installing=false;
const views=new Map(),pending=new Map(),lastOpened=new Map();
let updateStatus={phase:'unsupported',message:'仅安装版支持更新'},pluginUpdater;
function pluginUpdates(){if(!pluginUpdater){const {PluginUpdates}=require('./plugin-updates.cjs');pluginUpdater=new PluginUpdates(registry,(...args)=>require('electron').net.fetch(...args),require('./update-auth.cjs').privateFeed);}return pluginUpdater;}
async function updatePlugin(id){
 if(installing)throw Error('正在安装');installing=true;
 try{
  const {pkg,manifest,old}=await pluginUpdates().download(id);
  const labels=permissionLabels;
  const added=manifest.permissions.filter(p=>!old.permissions.includes(p));
  const consent=await dialog.showMessageBox(win,{type:'question',buttons:['取消','更新'],defaultId:0,cancelId:0,message:manifest.name+' '+old.version+' → '+manifest.version,detail:added.length?'新增权限：\n'+added.map(p=>labels[p]).join('\n'):'保留插件数据'});
  if(consent.response!==1)return registry.list();
  if(!registry.items.has(id)||registry.items.get(id).version!==old.version)throw Error('插件已改变，请重新检查');
  await registry.install(pkg,{preserveEnabled:true});close(id);await files('revokePlugin',id);pluginUpdates().pending.delete(id);return registry.list();
 }finally{installing=false;}
}
const permissionLabels={'folders.read':'读取你选择的文件夹','file.receive':'读取交给此应用的文件','git.manage':'旧版扩展权限','native.backend':'运行本机后台代码（可访问此用户的文件、网络并启动程序；仅安装你信任的插件）','browser.open':'打开外部浏览器','network.proxy':'读取系统代理设置'};
const hostURL=pathToFileURL(path.join(__dirname,'../dist/index.html')).href;
function files(method,...args){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('文件操作超时'));},15000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,method,args});});}
function result(fn){return async(...args)=>{try{return {ok:true,data:await fn(...args)};}catch(e){return {ok:false,error:e.message};}};}
function hostSender(e){if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||e.senderFrame.url!==hostURL)throw Error('禁止访问');}
function pluginSender(e){for(const [id,v]of views){if(e.sender===v.webContents&&e.senderFrame===v.webContents.mainFrame&&new URL(e.senderFrame.url).hostname===id){registry.get(id);return id;}}throw Error('插件身份无效');}
function requirePermission(id,permission){if(!registry.get(id).permissions.includes(permission))throw Error('未授予此权限');}
async function backendCapability(id,method,args){
 requirePermission(id,'native.backend');if(!Array.isArray(args)||args.length>4)throw Error('后台能力参数无效');
 switch(method){
  case 'folders.list':requirePermission(id,'folders.read');return files('listRoots',id);
  case 'folders.resolve':requirePermission(id,'folders.read');return files('resolve',id,args[0],args[1]||'');
  case 'dialog.directory':{requirePermission(id,'folders.read');if(active!==id)throw Error('请先打开此应用');const picked=await dialog.showOpenDialog(win,{properties:['openDirectory']});if(picked.canceled)return null;registry.get(id);const real=await fs.realpath(picked.filePaths[0]);let roots=await files('add',id,real),root=roots.find(r=>r.path.toLowerCase()===real.toLowerCase());if(!root)throw Error('文件夹授权失败');if(!root.enabled){roots=await files('change',id,root.id,true);root=roots.find(r=>r.id===root.id);}return root;}
  case 'browser.open':{requirePermission(id,'browser.open');if(active!==id)throw Error('请先打开此应用');const url=new URL(args[0]);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>2048)throw Error('网页地址无效');await require('electron').shell.openExternal(url.href);return;}
  case 'network.proxy':{requirePermission(id,'network.proxy');const url=new URL(args[0]);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('代理请求地址无效');return session.defaultSession.resolveProxy(url.href);}
  default:throw Error('未知后台能力');
 }
}
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
function close(id){backendManager?.stop(id);const v=views.get(id);if(v){views.delete(id);win.contentView.removeChildView(v);v.webContents.close();}lastOpened.delete(id);if(active===id)active=null;}
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
async function install(){if(installing)throw Error('正在安装');installing=true;try{hide();const selected=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'工作台插件',extensions:['wbplugin']}]});if(selected.canceled)return registry.list();const info=await fs.stat(selected.filePaths[0]);if(info.size>6*1024*1024)throw Error('插件包超过 6 MB');const pkg=JSON.parse(await fs.readFile(selected.filePaths[0],'utf8'));const m=validatePackage(pkg);const permissions=m.permissions.map(p=>(permissionLabels)[p]);const consent=await dialog.showMessageBox(win,{type:'question',buttons:['取消','安装'],defaultId:0,cancelId:0,message:m.name+' '+m.version,detail:permissions.join('\n')||'无文件权限'});if(consent.response!==1)return registry.list();close(m.id);await files('revokePlugin',m.id);await registry.install(pkg);return registry.list();}finally{installing=false;}}
let selectionGeneration=0;
ipcMain.handle('host:request',result(async(e,method,args)=>{hostSender(e);if(!Array.isArray(args))throw Error('参数无效');switch(method){
 case 'list':return registry.list();case 'install':return install();
 case 'plugins.checkUpdates':return pluginUpdates().check();
 case 'plugins.update':return updatePlugin(args[0]);
 case 'enable':case 'remove':{const [id,enabled]=args;if(typeof id!=='string')throw Error('参数无效');if(method==='enable')await registry.setEnabled(id,enabled);else {const consent=await dialog.showMessageBox(win,{type:'question',buttons:['取消','卸载'],defaultId:0,cancelId:0,message:'卸载此插件？',detail:'保留文件夹配置，不删除原文件。'});if(consent.response!==1)return registry.list();await registry.remove(id);}close(id);await files('revokePlugin',id);return registry.list();}
 case 'show':{const [id,rect]=args;const checked=bounds(rect),generation=++selectionGeneration;const view=await show(id,checked);if(generation!==selectionGeneration)return;view.setBounds(checked);view.setVisible(true);active=id;view.webContents.send('plugin:theme',theme);return;}
 case 'hide':selectionGeneration++;hide();return;
 case 'bounds':if(active&&views.has(active))views.get(active).setBounds(bounds(args[0]));return;
 case 'theme':if(!['light','dark'].includes(args[0]))throw Error('主题无效');theme=args[0];for(const v of views.values())v.webContents.send('plugin:theme',theme);return;
 case 'close':close(args[0]);return;
 case 'update.status':return updateStatus;
 case 'update.check':try{await checkUpdates();}catch{setUpdateStatus({phase:'error',message:'更新失败，请检查 GitHub CLI 登录、网络和仓库权限'});}return updateStatus;
 case 'update.install':if(!autoUpdater||updateStatus.phase!=='downloaded')throw Error('没有可安装的更新');await backendManager.shutdown();autoUpdater.quitAndInstall(false,true);return;
 default:throw Error('未知操作');
}}));
ipcMain.handle('plugin:request',result(async(e,method,args)=>{const id=pluginSender(e);if(!Array.isArray(args)||args.length>4)throw Error('参数无效');
 if(method==='initial'){if(registry.get(id).permissions.some(p=>permissionLabels[p]==='旧版扩展权限'))throw Error('此插件需升级，请在插件管理中更新');return {theme,file:lastOpened.get(id)||null};}
 if(method.startsWith('folders.')||method==='files.list'||method==='files.menu')requirePermission(id,'folders.read');
 switch(method){
 case 'folders.list':return files('listRoots',id);
 case 'folders.choose':{if(active!==id)throw Error('请先打开此应用');const picked=await dialog.showOpenDialog(win,{properties:['openDirectory','multiSelections']});if(!picked.canceled){for(const dir of picked.filePaths){registry.get(id);await files('add',id,dir);}}return files('listRoots',id);}
 case 'folders.enable':return files('change',id,args[0],args[1]);
 case 'folders.remove':return files('remove',id,args[0]);
 case 'files.list':return files('list',id,args[0],args[1]||'',args[2]||0);
 case 'files.read':requirePermission(id,'file.receive');return files('read',id,args[0],args[1]);
 case 'files.menu':{if(active!==id)throw Error('应用不在前台');const token=args[0],file=await files('describe',id,token);const handlers=registry.handlers(file.name);const items=handlers.length?handlers.map(handler=>({label:handler.name,click:async()=>{try{registry.get(handler.id);requirePermission(handler.id,'file.receive');const grant=await files('grant',id,token,handler.id);lastOpened.set(handler.id,grant);const target=views.get(handler.id);if(target)target.webContents.send('plugin:open',grant);win.webContents.send('host:navigate',handler.id);}catch(err){win.webContents.send('host:error',err.message);}}})):[{label:'没有可用应用',enabled:false}];Menu.buildFromTemplate([{label:'打开方式',submenu:items}]).popup({window:win});return;}
 case 'backend.request':return backendManager.request(id,args[0],args[1]);
 default:throw Error('未知操作');
 }
}));
app.whenReady().then(async()=>{registry=new Registry(path.join(app.getPath('userData'),'plugins-v1'));await registry.init();
 const builtin=path.join(app.getAppPath(),'bundled-plugins');for(const entry of await fs.readdir(builtin)){if(entry.endsWith('.wbplugin')){const pkg=JSON.parse(await fs.readFile(path.join(builtin,entry),'utf8'));if(!registry.items.has(pkg.manifest.id)&&!await fs.stat(path.join(app.getPath('userData'),'plugins-seeded')).then(()=>true,()=>false))await registry.install(pkg);}}
 await fs.writeFile(path.join(app.getPath('userData'),'plugins-seeded'),'1');
 worker=new Worker(path.join(__dirname,'files-worker.cjs'),{workerData:{config:path.join(app.getPath('userData'),'folders-v1.json')}});
 worker.on('message',({id,data,error})=>{const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);error?p.reject(Error(error)):p.resolve(data);});
 worker.on('error',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('文件服务停止，请重启'));}pending.clear();});
 backendManager=new BackendManager({registry,dataDir:path.join(app.getPath('userData'),'plugin-data'),fork:(...args)=>require('electron').utilityProcess.fork(...args),host:backendCapability});
 app.on('before-quit',event=>{if(backendManager.jobs.size){event.preventDefault();void backendManager.shutdown().then(()=>app.quit());}});
 win=new BrowserWindow({width:1320,height:880,minWidth:960,minHeight:640,backgroundColor:'#eeeee8',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.on('closed',()=>{for(const v of views.values())v.webContents.close();views.clear();worker.terminate();backendManager.dispose();});await win.loadURL(hostURL);setupUpdates();
}).catch(e=>{dialog.showErrorBox('无法启动',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
