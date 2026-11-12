const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {Registry}=require('../electron/plugin-registry.cjs');
const {PluginUpdates,candidates}=require('../electron/plugin-updates.cjs');
test('plugin discovery compares numeric versions and ignores uninstalled/unhashed assets',()=>{
 const asset={name:'text-reader-1.10.0.wbplugin',id:1,size:1,digest:'sha256:'+'a'.repeat(64)};
 assert.equal(candidates([{id:'text-reader',version:'1.9.0'}],[asset])[0].version,'1.10.0');
 assert.equal(candidates([],[asset]).length,0);assert.equal(candidates([{id:'text-reader',version:'2.0.0'}],[asset]).length,0);
 assert.equal(candidates([{id:'text-reader',version:'1.0.0'}],[{...asset,digest:null}]).length,0);
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
