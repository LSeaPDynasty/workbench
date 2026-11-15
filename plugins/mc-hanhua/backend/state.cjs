// 汇总工作台要显示的一切：整合包校验、覆盖率、缺口、产物、已装状态、缓存行数。
// 数据源都是工具链的 work/*.json 与 dist/*.zip，不自己算翻译。
const fs=require('node:fs'),path=require('node:path');
const {readText,readJson,stat,modsZhFile,findInstalledRp,rpName,patchName,NAMESPACE}=require('./paths.cjs');
const {parseLoose}=require('./loose.cjs');

const lineCache=new Map();

function countLines(file){
  const info=stat(file);
  if(!info)return 0;
  const hit=lineCache.get(file);
  if(hit&&hit.size===info.size&&hit.mtime===info.mtime)return hit.lines;
  let lines=0;
  try{
    for(const line of readText(file).split('\n'))if(line.trim())lines+=1;
  }catch{return 0;}
  lineCache.set(file,{size:info.size,mtime:info.mtime,lines});
  return lines;
}

function canWriteInto(dir){
  if(!dir)return false;
  const probe=path.join(dir,'.wb-write-probe');
  try{fs.writeFileSync(probe,'','utf8');fs.unlinkSync(probe);return true;}catch{return false;}
}

function countQuestFiles(pack){
  const base=path.join(pack,'config','ftbquests','quests','lang');
  let count=0;
  const walk=dir=>{
    let entries=[];
    try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
    for(const entry of entries){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory())walk(full);
      else if(/\.(json|json5|snbt)$/i.test(entry.name))count+=1;
    }
  };
  walk(path.join(base,'zh_cn'));
  if(fs.existsSync(path.join(base,'zh_cn.snbt')))count+=1;
  return count;
}

function modsZh(root,pack){
  const data=readJson(modsZhFile(path.join(root,'work'),pack),{});
  return data&&typeof data==='object'?data:{};
}

function sumKeys(map){
  let total=0;
  for(const value of Object.values(map||{})){
    if(value&&typeof value==='object')total+=Object.keys(value).length;
  }
  return total;
}

function collectStatus(root,pack,config){
  const work=path.join(root,'work');
  const dist=path.join(root,'dist');
  const toolOk=!!root&&fs.existsSync(path.join(root,'tools','pipeline.mjs'));
  const modstats=readJson(path.join(work,'modstats.json'),null);
  const verify=readJson(path.join(work,'verify.json'),null);
  const gap=readJson(path.join(work,'gap.json'),null);
  const packver=readJson(path.join(work,'packver.json'),null);
  const aiMods=modsZh(root,pack);
  const aiModKeys=sumKeys(aiMods);

  let scanned='';
  try{scanned=readText(path.join(work,'packpath.txt')).trim();}catch{}

  const ready=!!pack&&fs.existsSync(path.join(pack,'mods'));
  const stale=!!(scanned&&pack&&path.resolve(scanned).toLowerCase()!==path.resolve(pack).toLowerCase());

  let mods=null;
  if(modstats&&Number.isFinite(Number(modstats.totalEn))){
    const en=Number(modstats.totalEn)||0;
    const zh=Math.min(en,(Number(modstats.alreadyZh)||0)+aiModKeys);
    const missing=Math.max(0,(Number(modstats.gap)||0)-aiModKeys);
    mods={namespaces:Number(modstats.namespaces)||0,en,zh,gap:missing,pct:en?Math.round(zh/en*1000)/10:0,aiTranslated:aiModKeys};
  }

  let text=null;
  if(gap&&gap.surfaces){
    const quests=gap.surfaces.quests||{};
    const kubejs=gap.surfaces.kubejs||{};
    text={
      quests:{units:Number(quests.units)||0,done:Number(quests.done)||0,pct:quests.pct||''},
      kubejs:{units:Number(kubejs.units)||0,done:Number(kubejs.done)||0,pct:kubejs.pct||''},
      manuals:gap.guides||null,
    };
  }

  let verifyInfo=null;
  if(verify){
    const errors=Array.isArray(verify.errors)?verify.errors:[];
    const warns=Array.isArray(verify.warns)?verify.warns:[];
    verifyInfo={
      files:Number(verify.files)||0,
      keys:Number(verify.keys)||0,
      total:Number(verify.total)||0,
      translated:Number(verify.translated)||0,
      coverage:verify.coverage||'',
      errors:errors.length,
      warns:warns.length,
      errorList:errors.slice(0,20),
    };
  }

  const installedPath=ready?findInstalledRp(pack):null;
  const questFiles=ready?countQuestFiles(pack):0;

  return {
    tool:{root:root||'',ok:toolOk},
    pack:pack||'',
    ready,
    canWrite:ready?canWriteInto(pack):false,
    scanned,
    stale,
    packver:packver||null,
    config:config||null,
    mods,
    text,
    totalGap:gap&&Number.isFinite(Number(gap.totalMissingKeys))?Number(gap.totalMissingKeys):null,
    verify:verifyInfo,
    cache:countLines(path.join(work,'tm.jsonl')),
    dist:{
      rp:stat(path.join(dist,rpName(pack||''))),
      patch:stat(path.join(dist,patchName(pack||''))),
    },
    installed:{
      rp:installedPath?stat(installedPath):null,
      rpName:installedPath?path.basename(installedPath):'',
      questFiles,
      questOk:questFiles>0,
    },
  };
}

function modsList(root,pack){
  const modstats=readJson(path.join(root,'work','modstats.json'),null);
  const perNs=(modstats&&modstats.perNs)||{};
  const aiMods=modsZh(root,pack);
  const items=Object.entries(perNs).map(([ns,value])=>{
    const en=Number(value&&value.en)||0;
    const ai=Math.min(value&&aiMods[ns]&&typeof aiMods[ns]==='object'?Object.keys(aiMods[ns]).length:0,en);
    const jarZh=Number(value&&value.zh)||0;
    const zh=Math.min(en,jarZh+ai);
    const missing=Math.max(0,(Number(value&&value.gap)||0)-ai);
    return {ns,en,zh,ai,jarZh,gap:missing,pct:en?Math.round(zh/en*100):100};
  });
  items.sort((left,right)=>right.gap-left.gap||right.en-left.en);
  return {items};
}

function readLang(file){
  try{
    return {data:parseLoose(readText(file)),error:''};
  }catch(error){
    return {data:null,error:error&&error.message?error.message:String(error)};
  }
}

function preview(root,pack,ns){
  const name=String(ns||'').trim();
  if(!NAMESPACE.test(name))throw Error('命名空间不合法：'+name);
  const assets=path.join(root,'work','jars','assets');
  let enFile=path.join(assets,name+'.en_us.json');
  if(!fs.existsSync(enFile))enFile=path.join(assets,name+'.en_US.json');
  if(!fs.existsSync(enFile)){
    // assets 整个空掉是常见状态（换过包、清理过 work），这时给的是「先扫描」而不是「没这个模组」。
    let emptyAssets=false;
    try{emptyAssets=fs.readdirSync(assets).length===0;}catch{emptyAssets=true;}
    return {ns:name,rows:[],total:0,translated:0,note:emptyAssets?'还没解出语言文件：先跑一次「只估算」或「开始」，会在 work/jars/assets 里生成':'没有这个命名空间的英文语言文件'};
  }

  const en=readLang(enFile);
  if(!en.data)return {ns:name,rows:[],total:0,translated:0,note:'语言文件解析失败：'+en.error};
  let jarZh={};
  const zhFile=path.join(assets,name+'.zh_cn.json');
  if(fs.existsSync(zhFile)){
    const parsed=readLang(zhFile);
    if(parsed.data&&typeof parsed.data==='object')jarZh=parsed.data;
  }
  const aiMods=modsZh(root,pack);
  const ai=(aiMods[name]&&typeof aiMods[name]==='object')?aiMods[name]:{};
  const keys=Object.keys(en.data);
  const rows=[];
  for(const key of keys.slice(0,300)){
    const source=String(en.data[key]??'');
    const mine=typeof ai[key]==='string'?ai[key]:'';
    const built=typeof jarZh[key]==='string'?jarZh[key]:'';
    rows.push({key,en:source,zh:mine||built||'',src:mine?'ai':(built?'jar':'')});
  }
  return {ns:name,rows,total:keys.length,translated:rows.filter(row=>row.zh).length};
}

module.exports={collectStatus,modsList,preview,countLines,sumKeys,modsZh};
