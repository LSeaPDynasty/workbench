const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');const {EventEmitter}=require('node:events'),{createRequire}=require('node:module');
test('host IPC authorizes senders and routes files to dynamically installed plugins',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'wb-host-')),root=path.resolve(__dirname,'..'),callbacks=new Map(),sessions=new Map(),views=[];let window,menu,selection=[],loaded=false,startError;
 class WC extends EventEmitter {constructor(){super();this.mainFrame={url:''};this.events=[];}async loadURL(url){this.mainFrame.url=url;loaded=true;}setWindowOpenHandler(){}send(name,data){this.events.push({name,data});}close(){this.closed=true;}}
 class Win extends EventEmitter {constructor(){super();window=this;this.webContents=new WC();this.contentView={addChildView(){},removeChildView(){}};}getContentSize(){return [1320,880];}isDestroyed(){return false;}async loadURL(url){await this.webContents.loadURL(url);}}
 class View {constructor(){this.webContents=new WC();views.push(this);}setVisible(v){this.visible=v;}setBounds(r){this.rect=r;}}
 const electron={app:{whenReady:()=>Promise.resolve(),getPath:()=>base,getAppPath:()=>root,on(){},quit(){}},BrowserWindow:Win,WebContentsView:View,
  ipcMain:{handle:(key,fn)=>callbacks.set(key,fn)},protocol:{registerSchemesAsPrivileged(){}},session:{fromPartition:id=>{if(!sessions.has(id))sessions.set(id,{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}},protocol:{isProtocolHandled:async()=>false,handle(){},unhandle(){}}});return sessions.get(id);}},
  dialog:{showOpenDialog:async()=>({canceled:false,filePaths:selection}),showMessageBox:async()=>({response:1}),showErrorBox:(title,msg)=>{startError=msg;}},Menu:{buildFromTemplate:items=>{menu=items;return {popup(){}};}}
 };
 const req=createRequire(path.join(root,'electron/main.cjs'));const code=await fs.readFile(path.join(root,'electron/main.cjs'),'utf8');
 vm.runInNewContext(code,{require:id=>id==='electron'?electron:req(id),__dirname:path.join(root,'electron'),URL,Response,Buffer,console,setTimeout,clearTimeout});
 try{for(let i=0;i<100&&!loaded&&!startError;i++)await new Promise(r=>setTimeout(r,20));assert.equal(startError,undefined);assert.ok(window&&loaded);
  const event=wc=>({sender:wc,senderFrame:wc.mainFrame});const host=(method,...args)=>callbacks.get('host:request')(event(window.webContents),method,args);const plugin=(view,method,...args)=>callbacks.get('plugin:request')(event(view.webContents),method,args);
  assert.equal((await callbacks.get('host:request')({sender:{},senderFrame:{}},'list',[])).ok,false);
  const list=(await host('list')).data;assert.ok(list.some(p=>p.id==='builtin-files'));const update=(await host('update.status')).data;assert.equal(update.phase,'unsupported');assert.equal((await host('update.install')).ok,false);
  assert.equal((await host('show','builtin-files',{x:20,y:90,width:1000,height:600})).ok,true);const fileView=views.at(-1);
  assert.equal((await callbacks.get('plugin:request')({sender:fileView.webContents,senderFrame:{url:fileView.webContents.mainFrame.url}},'folders.list',[])).ok,false);
  const chosen=path.join(base,'chosen');await fs.mkdir(chosen);await fs.writeFile(path.join(chosen,'app.log'),'INFO hello\nERROR oops');selection=[chosen];const roots=(await plugin(fileView,'folders.choose')).data;assert.equal(roots.length,1);const listing=(await plugin(fileView,'files.list',roots[0].id,'',0)).data;const token=listing.entries[0].token;
  assert.equal((await plugin(fileView,'files.read',token,'text')).ok,false);
  const oldMenu=await plugin(fileView,'files.menu',token);assert.equal(oldMenu.ok,true);assert.ok(!menu[0].submenu.some(x=>x.label==='日志查看器'));
  selection=[path.join(root,'plugin-packages/log-viewer-1.0.0.wbplugin')];const installed=await host('install');assert.equal(installed.ok,true);assert.ok(installed.data.some(p=>p.id==='log-viewer'));
  await host('show','builtin-files',{x:20,y:90,width:1000,height:600});await plugin(fileView,'files.menu',token);await menu[0].submenu.find(x=>x.label==='日志查看器').click();assert.ok(window.webContents.events.some(e=>e.name==='host:navigate'&&e.data==='log-viewer'));
  await host('show','log-viewer',{x:20,y:90,width:1000,height:600});const logView=views.at(-1);const init=(await plugin(logView,'initial')).data;assert.equal(init.file.name,'app.log');assert.equal((await plugin(logView,'files.read',init.file.token,'text')).data.text,'INFO hello\nERROR oops');assert.equal((await plugin(logView,'folders.list')).ok,false);
  await host('show','builtin-files',{x:20,y:90,width:1000,height:600});await plugin(fileView,'folders.enable',roots[0].id,false);assert.equal((await plugin(logView,'files.read',init.file.token,'text')).ok,false);assert.equal(await fs.readFile(path.join(root,'electron/main.cjs'),'utf8'),code);
 }finally{if(window)window.emit('closed');await new Promise(r=>setTimeout(r,50));await fs.rm(base,{recursive:true,force:true});}
});
