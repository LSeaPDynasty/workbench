const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const backend=require('../plugins/mc-hanhua/backend/index.cjs');
const {resolvePack,packTag}=require('../plugins/mc-hanhua/backend/paths.cjs');
const {buildArgs}=require('../plugins/mc-hanhua/backend/job.cjs');

const PACK_NAME='Test Pack';
const PACK_TAG=packTag(PACK_NAME);
const NO_PATH=/这个路径不存在/;
const BAD_NAME=/不合法/;
const BAD_MODE=/未知的运行模式/;
const BAD_KIND=/未知的翻译范围/;
const BAD_TARGET=/未知的目录/;
const NO_DIR=/目录不存在/;

function writeJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(value,null,2),'utf8');
}

// 造一个假工具链 + 假整合包：字段形状照 work/*.json 的真实产物，别让后台读到 undefined。
function fixture(root,pack){
  writeJson(path.join(root,'config.local.json'),{baseUrl:'https://api.example.com/v1',model:'test-model',apiKey:'sk-test-1234567890abcd',concurrency:8,batchSize:40,packPath:pack});
  writeJson(path.join(root,'work','packver.json'),{id:'1.21.1',name:'1.21.1',protocol:769,resource_major:34,data_major:61,jar:'minecraft.jar'});
  writeJson(path.join(root,'work','modstats.json'),{namespaces:2,totalEn:100,alreadyZh:20,gap:80,perNs:{alpha:{en:60,zh:10,gap:50},beta:{en:40,zh:10,gap:30}}});
  writeJson(path.join(root,'work','verify.json'),{files:3,keys:100,total:100,translated:95,coverage:'95.0%',errors:[{key:'a'}],warns:[]});
  writeJson(path.join(root,'work','gap.json'),{generatedAt:'2026-11-01T00:00:00.000Z',surfaces:{quests:{units:10,done:9,byFile:{},fileCount:1,pct:'90.0%'},kubejs:{units:4,done:4,byFile:{},fileCount:1,pct:'100%'}},mods:{},guides:{total:8,en:5,zh:3},totalMissingKeys:12});
  fs.writeFileSync(path.join(root,'work','packpath.txt'),pack,'utf8');
  fs.writeFileSync(path.join(root,'work','tm.jsonl'),'{"a":1}\n\n{"b":2}\n','utf8');
  writeJson(path.join(root,'work','zh-mods',PACK_TAG+'.json'),{alpha:{'tile.alpha.one':'ALPHA-ONE-ZH'}});
  fs.mkdirSync(path.join(root,'work','jars','assets'),{recursive:true});
  writeJson(path.join(root,'work','jars','assets','alpha.en_us.json'),{'tile.alpha.one':'Alpha One','tile.alpha.two':'Alpha Two'});
  writeJson(path.join(root,'work','jars','assets','alpha.zh_cn.json'),{'tile.alpha.two':'ALPHA-TWO-JAR'});
  fs.mkdirSync(path.join(root,'dist'),{recursive:true});
  fs.writeFileSync(path.join(root,'dist',PACK_TAG+'-zh_cn-resourcepack.zip'),'x');
  fs.mkdirSync(path.join(root,'tools'),{recursive:true});
  fs.writeFileSync(path.join(root,'tools','pipeline.mjs'),[
    "console.log('=== 1/8 scan jar lang ===');",
    "console.log('[1/1] 3/3 done  2 fail 0  0s');",
    "console.error('[ERROR] boom');",
    'process.exit(0);',
  ].join('\n'),'utf8');

  fs.mkdirSync(path.join(pack,'mods'),{recursive:true});
  fs.mkdirSync(path.join(pack,'config','ftbquests','quests','lang','zh_cn'),{recursive:true});
  fs.writeFileSync(path.join(pack,'config','ftbquests','quests','lang','zh_cn','chapter.json'),'{}','utf8');
  fs.mkdirSync(path.join(pack,'resourcepacks'),{recursive:true});
  fs.writeFileSync(path.join(pack,'resourcepacks',PACK_TAG+'-zh_cn-resourcepack.zip'),'zip');
}

// 插件设置必须显式指向临时工具链：否则 defaultToolRoot() 会落到真实的 F:\Deepseek\mc-hanhua，
// 测试就会改写用户真实的 config.local.json（真发生过一次）。
function context(dataDir,toolRoot,packPath){
  fs.mkdirSync(dataDir,{recursive:true});
  if(toolRoot!==undefined){
    writeJson(path.join(dataDir,'settings.json'),{toolRoot,packPath:packPath===undefined?'':packPath});
  }
  return {id:'mc-hanhua',dataDir,host:async()=>null};
}

async function waitIdle(instance,timeout=20000){
  const started=Date.now();
  for(;;){
    const logs=await instance.request('logs',[0]);
    if(!logs.job.running)return logs;
    if(Date.now()-started>timeout)throw Error('pipeline did not finish in time');
    await new Promise(resolve=>setTimeout(resolve,80));
  }
}

test('status aggregates coverage, gap, artifacts and installed state',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-'));
  const root=path.join(base,'tool'),pack=path.join(base,PACK_NAME);
  try{
    fixture(root,pack);
    const instance=await backend.create(context(path.join(base,'data'),root,pack));
    const status=await instance.request('status',[]);
    assert.equal(status.tool.ok,true);
    assert.equal(status.pack,pack);
    assert.equal(status.ready,true);
    assert.equal(status.canWrite,true);
    assert.equal(status.stale,false);
    // alreadyZh 20 + one AI key = 21 / 100
    assert.deepEqual(status.mods,{namespaces:2,en:100,zh:21,gap:79,pct:21,aiTranslated:1});
    assert.equal(status.text.quests.done,9);
    assert.equal(status.text.kubejs.units,4);
    assert.deepEqual(status.text.manuals,{total:8,en:5,zh:3});
    assert.equal(status.totalGap,12);
    assert.equal(status.verify.coverage,'95.0%');
    assert.equal(status.verify.errors,1);
    assert.equal(status.cache,2);
    assert.equal(status.installed.rpName,PACK_TAG+'-zh_cn-resourcepack.zip');
    assert.equal(status.installed.questOk,true);
    assert.equal(status.installed.questFiles,1);
    assert.equal(status.dist.rp.size,1);
    assert.equal(status.packver.resource_major,34);
    assert.equal(status.config.hasKey,true);
    assert.equal(status.config.keyHint,'••••abcd');
    assert.equal(status.job.running,false);
    assert.equal(status.settings.toolRoot,root);
    await instance.dispose();
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('status stays usable when the tool chain is missing',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-empty-'));
  try{
    const instance=await backend.create(context(path.join(base,'data'),path.join(base,'missing'),''));
    const status=await instance.request('status',[]);
    assert.equal(status.tool.ok,false);
    assert.equal(status.mods,null);
    assert.equal(status.job.running,false);
    await instance.dispose();
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('savePack resolves parent folders and keeps foreign config fields',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-pack-'));
  const root=path.join(base,'tool');
  const minecraft=path.join(base,'.minecraft');
  const pack=path.join(minecraft,'versions',PACK_NAME);
  try{
    fixture(root,pack);
    const instance=await backend.create(context(path.join(base,'data'),root,''));
    const saved=await instance.request('savePack',[minecraft]);
    assert.equal(saved.ok,true);
    assert.equal(saved.pack,pack);
    assert.match(saved.note,/已自动定位/);
    const stored=JSON.parse(fs.readFileSync(path.join(root,'config.local.json'),'utf8'));
    assert.equal(stored.packPath,pack);
    assert.equal(stored.apiKey,'sk-test-1234567890abcd');
    assert.equal(stored.concurrency,8);
    assert.equal(stored.model,'test-model');
    assert.equal(JSON.parse(fs.readFileSync(path.join(base,'data','settings.json'),'utf8')).packPath,pack);
    await assert.rejects(()=>instance.request('savePack',[path.join(base,'nope')]),NO_PATH);
    await instance.dispose();
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('resolvePack refuses to guess between several packs',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-multi-'));
  try{
    for(const name of ['Pack A','Pack B'])fs.mkdirSync(path.join(base,'versions',name,'mods'),{recursive:true});
    const result=resolvePack(path.join(base,'versions'));
    assert.equal(result.ok,false);
    assert.match(result.error,/Pack A/);
    assert.match(result.error,/Pack B/);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('preview separates AI translations from resource pack ones',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-preview-'));
  const root=path.join(base,'tool'),pack=path.join(base,PACK_NAME);
  try{
    fixture(root,pack);
    const instance=await backend.create(context(path.join(base,'data'),root,pack));
    const preview=await instance.request('preview',['alpha']);
    assert.equal(preview.total,2);
    assert.equal(preview.translated,2);
    const byKey=Object.fromEntries(preview.rows.map(row=>[row.key,row]));
    assert.equal(byKey['tile.alpha.one'].zh,'ALPHA-ONE-ZH');
    assert.equal(byKey['tile.alpha.one'].src,'ai');
    assert.equal(byKey['tile.alpha.two'].zh,'ALPHA-TWO-JAR');
    assert.equal(byKey['tile.alpha.two'].src,'jar');
    const missing=await instance.request('preview',['nope']);
    assert.equal(missing.rows.length,0);
    assert.match(missing.note,/没有这个命名空间/);
    // assets 整个空掉时提示要指向「先扫描」，别让用户以为模组没有英文文件。
    fs.rmSync(path.join(root,'work','jars','assets'),{recursive:true,force:true});
    const emptied=await instance.request('preview',['alpha']);
    assert.equal(emptied.rows.length,0);
    assert.match(emptied.note,/只估算/);
    await assert.rejects(()=>instance.request('preview',['../evil']),BAD_NAME);
    await instance.dispose();
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('mods list sorts by gap and counts AI additions',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-mods-'));
  const root=path.join(base,'tool'),pack=path.join(base,PACK_NAME);
  try{
    fixture(root,pack);
    const instance=await backend.create(context(path.join(base,'data'),root,pack));
    const {items}=await instance.request('mods',[]);
    assert.equal(items.length,2);
    assert.equal(items[0].ns,'alpha');
    assert.equal(items[0].ai,1);
    assert.equal(items[0].gap,49);
    assert.equal(items[0].pct,18);
    await instance.dispose();
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('run spawns the pipeline, streams logs and records the exit code',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-run-'));
  const root=path.join(base,'tool'),pack=path.join(base,PACK_NAME);
  try{
    fixture(root,pack);
    const instance=await backend.create(context(path.join(base,'data'),root,pack));
    const started=await instance.request('run',['dry',{}]);
    assert.equal(started.started,true);
    assert.deepEqual(started.args,['--dry']);
    const logs=await waitIdle(instance);
    assert.equal(logs.job.lastExit,0);
    const text=logs.lines.map(line=>line.t).join('\n');
    assert.match(text,/=== 1\/8 scan jar lang ===/);
    assert.match(text,/\[ERROR\] boom/);
    assert.match(text,/\[1\/1\] 3\/3 done/);
    const again=await instance.request('logs',[logs.seq]);
    assert.equal(again.lines.length,0);
    await instance.dispose();
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('translate refuses to start without an API key',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-nokey-'));
  const root=path.join(base,'tool'),pack=path.join(base,PACK_NAME);
  const savedKey=process.env.AI_API_KEY;
  try{
    fixture(root,pack);
    const file=path.join(root,'config.local.json');
    const stored=JSON.parse(fs.readFileSync(file,'utf8'));
    delete stored.apiKey;
    fs.writeFileSync(file,JSON.stringify(stored),'utf8');
    delete process.env.AI_API_KEY;
    const instance=await backend.create(context(path.join(base,'data'),root,pack));
    await assert.rejects(()=>instance.request('run',['translate',{}]),/API Key/);
    await instance.dispose();
  }finally{
    if(savedKey!==undefined)process.env.AI_API_KEY=savedKey;
    fs.rmSync(base,{recursive:true,force:true});
  }
});

test('buildArgs only accepts known modes and clean namespaces',()=>{
  assert.deepEqual(buildArgs('build',{}),['--no-ai']);
  assert.deepEqual(buildArgs('translate',{kind:'mods',ns:'alpha',limit:20}),['--kind','mods','--ns','alpha','--limit','20']);
  assert.deepEqual(buildArgs('translate',{kind:'all',ns:'',limit:0}),[]);
  assert.throws(()=>buildArgs('stop',{}),BAD_MODE);
  assert.throws(()=>buildArgs('translate',{kind:'everything'}),BAD_KIND);
  assert.throws(()=>buildArgs('translate',{ns:'--force'}),BAD_NAME);
});

test('saveApi merges config, keeps an empty key and clears on __clear__',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-api-'));
  const root=path.join(base,'tool'),pack=path.join(base,PACK_NAME);
  const savedKey=process.env.AI_API_KEY;
  try{
    delete process.env.AI_API_KEY;
    fixture(root,pack);
    const instance=await backend.create(context(path.join(base,'data'),root,pack));
    const config=await instance.request('saveApi',[{baseUrl:'https://api.deepseek.com/v1',model:'deepseek-chat',apiKey:'',concurrency:4,batchSize:50}]);
    assert.equal(config.model,'deepseek-chat');
    assert.equal(config.concurrency,4);
    assert.equal(config.hasKey,true);
    const stored=JSON.parse(fs.readFileSync(path.join(root,'config.local.json'),'utf8'));
    assert.equal(stored.apiKey,'sk-test-1234567890abcd');
    const cleared=await instance.request('saveApi',[{apiKey:'__clear__'}]);
    assert.equal(cleared.hasKey,false);
    const clearedFile=JSON.parse(fs.readFileSync(path.join(root,'config.local.json'),'utf8'));
    assert.equal(clearedFile.apiKey,undefined);
    assert.equal(clearedFile.model,'deepseek-chat');
    await instance.dispose();
  }finally{
    if(savedKey!==undefined)process.env.AI_API_KEY=savedKey;
    fs.rmSync(base,{recursive:true,force:true});
  }
});

test('open only follows known targets',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wb-mc-open-'));
  const root=path.join(base,'tool'),pack=path.join(base,PACK_NAME);
  try{
    fixture(root,pack);
    const instance=await backend.create(context(path.join(base,'data'),root,pack));
    await assert.rejects(()=>instance.request('open',['C:\\Windows']),BAD_TARGET);
    fs.rmSync(path.join(pack,'config','ftbquests','quests','lang','zh_cn'),{recursive:true,force:true});
    await assert.rejects(()=>instance.request('open',['quests']),NO_DIR);
    await instance.dispose();
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});
