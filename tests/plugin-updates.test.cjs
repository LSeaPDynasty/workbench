const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {Registry}=require('../electron/plugin-registry.cjs');
const {PluginUpdates,candidates,catalogAssets}=require('../electron/plugin-updates.cjs');
test('plugin discovery compares numeric versions and ignores uninstalled/unhashed assets',()=>{
 const asset={name:'text-reader-1.10.0.wbplugin',id:1,size:1,digest:'sha256:'+'a'.repeat(64)};
 assert.equal(candidates([{id:'text-reader',version:'1.9.0'}],[asset])[0].version,'1.10.0');
 assert.equal(candidates([],[asset]).length,0);assert.equal(candidates([{id:'text-reader',version:'2.0.0'}],[asset]).length,0);
 assert.equal(candidates([{id:'text-reader',version:'1.0.0'}],[{...asset,digest:null}]).length,0);
});
test('online catalog discovers uninstalled packages, selects newest and rejects malformed assets',()=>{
 const asset={name:'local-media-1.0.0.wbplugin',label:'影音库',id:1,size:100,digest:'sha256:'+'a'.repeat(64)};
 const items=catalogAssets([asset,{...asset,id:2,name:'local-media-1.1.0.wbplugin'},{...asset,id:3,size:-1,name:'invalid-size-1.0.0.wbplugin'},{...asset,id:4,digest:null,name:'no-digest-1.0.0.wbplugin'},{...asset,id:5,name:'setup.exe'}]);
 assert.equal(items.length,1);assert.equal(items[0].name,'影音库');assert.equal(items[0].version,'1.1.0');assert.equal(candidates([], [asset]).length,0);
});
test('online install verifies a new package, rejects tampering and prevents replacing installed data',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wb-online-'));try{
  const registry=new Registry(dir);await registry.init();const pkg={manifest:{id:'new-plugin',name:'新应用',version:'1.0.0',apiVersion:1,entry:'index.html',permissions:[]},files:{'index.html':'new'}};
  let body=Buffer.from(JSON.stringify(pkg)),asset={id:43,label:'新应用',name:'new-plugin-1.0.0.wbplugin',size:body.length,digest:'sha256:'+createHash('sha256').update(body).digest('hex')};let corrupt=false;
  const updater=new PluginUpdates(registry,async url=>url.endsWith('/latest')?new Response(JSON.stringify({assets:[asset]})):new Response(corrupt?Buffer.alloc(body.length):body),async()=>({token:'test'}));
  await assert.rejects(()=>updater.downloadNew('new-plugin'),/刷新/);const items=await updater.catalog();assert.deepEqual(items,[{id:'new-plugin',name:'新应用',version:'1.0.0',size:body.length}]);
  corrupt=true;await assert.rejects(()=>updater.downloadNew('new-plugin'),/校验失败/);assert.equal(registry.list().length,0);corrupt=false;
  const downloaded=await updater.downloadNew('new-plugin');assert.equal(downloaded.old,null);assert.equal(registry.list().length,0); // Download and cancellation never install code.
  body=Buffer.from(JSON.stringify({...pkg,manifest:{...pkg.manifest,id:'other-plugin'}}));asset={...asset,size:body.length,digest:'sha256:'+createHash('sha256').update(body).digest('hex')};await updater.catalog();await assert.rejects(()=>updater.downloadNew('new-plugin'),/身份或版本/);
  await registry.install(downloaded.pkg);await registry.setEnabled('new-plugin',false);await assert.rejects(()=>updater.downloadNew('new-plugin'),/已安装/);assert.equal(registry.list()[0].enabled,false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('failed online refresh preserves cached catalog and limits release body size',async()=>{
 const registry={list:()=>[]};let fail=false;
 const updater=new PluginUpdates(registry,async()=>fail?new Response('x'.repeat(2*1024*1024+1)):new Response(JSON.stringify({assets:[{name:'test-plugin-1.0.0.wbplugin',id:1,size:1,digest:'sha256:'+'a'.repeat(64)}]})),async()=>({token:'test'}));
 await updater.catalog();fail=true;await assert.rejects(()=>updater.catalog(),/过大/);assert.equal(updater.available.size,1);
});
test('download verifies digest and identity; registry update preserves disabled state and can restart',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wb-update-'));try{
  const registry=new Registry(dir);await registry.init();
  const pkg={manifest:{id:'test-plugin',name:'测试',version:'1.0.0',apiVersion:1,entry:'index.html',permissions:[]},files:{'index.html':'old'}};
  await registry.install(pkg);await registry.setEnabled('test-plugin',false);
  const next={...pkg,manifest:{...pkg.manifest,version:'1.1.0'},files:{'index.html':'new'}};
  const body=Buffer.from(JSON.stringify(next)),asset={id:42,name:'test-plugin-1.1.0.wbplugin',size:body.length,digest:'sha256:'+createHash('sha256').update(body).digest('hex')};let corrupt=false;
  const updater=new PluginUpdates(registry,async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer test');return url.endsWith('/latest')?new Response(JSON.stringify({assets:[asset]})):new Response(corrupt?Buffer.alloc(body.length):body);},async()=>({token:'test'}));
  assert.equal((await updater.check()).length,1);corrupt=true;await assert.rejects(()=>updater.download('test-plugin'),/校验失败/);assert.equal(registry.list()[0].version,'1.0.0');corrupt=false;
  const downloaded=await updater.download('test-plugin');await registry.install(downloaded.pkg,{preserveEnabled:true});
  const restored=new Registry(dir);await restored.init();assert.equal(restored.list()[0].version,'1.1.0');assert.equal(restored.list()[0].enabled,false);assert.equal((await updater.check()).length,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
