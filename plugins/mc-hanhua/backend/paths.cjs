// 整合包路径规则：产物文件名、模组译文文件、已装资源包定位、目录纠正。
// 与汉化工具链 tools/lib.mjs、tools/build.mjs、tools/pack.mjs 的规则保持一致。
const fs=require('node:fs'),path=require('node:path');

const readText=file=>fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
const readJson=(file,fallback)=>{try{return JSON.parse(readText(file));}catch{return fallback;}};
// 命名空间会拼进文件路径与命令行参数，只认字母数字开头的那一小撮字符。
const NAMESPACE=/^[a-z0-9][a-z0-9_.-]{0,63}$/i;
const stat=file=>{try{const info=fs.statSync(file);return {size:info.size,mtime:info.mtime.toISOString()};}catch{return null;}};
const ensureDir=dir=>fs.mkdirSync(dir,{recursive:true});

function packTag(pack){return path.basename(String(pack||'')).replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,'-');}
const rpName=pack=>packTag(pack)+'-zh_cn-resourcepack.zip';
const patchName=pack=>packTag(pack)+'-zh_cn-patch.zip';
const modsZhFile=(work,pack)=>path.join(work,'zh-mods',packTag(pack)+'.json');

function findInstalledRp(pack){
  const dir=path.join(pack,'resourcepacks');
  let list=[];
  try{list=fs.readdirSync(dir);}catch{return null;}
  const mine=rpName(pack);
  if(list.includes(mine))return path.join(dir,mine);
  const any=list.filter(file=>/-zh_cn-resourcepack\.zip$/i.test(file)).sort().pop();
  return any?path.join(dir,any):null;
}

function resolvePack(input){
  const clean=String(input||'').trim().replace(/^"+|"+$/g,'').replace(/[\\/]+$/,'');
  if(!clean)return {ok:false,error:'路径是空的'};
  let info;
  try{info=fs.statSync(clean);}catch{return {ok:false,error:'这个路径不存在：'+clean};}
  if(!info.isDirectory())return {ok:false,error:'这不是文件夹：'+clean};
  const has=name=>fs.existsSync(path.join(clean,name));
  const tooMany=found=>'这个目录下有多个整合包：'+found.slice(0,6).map(item=>path.basename(item)).join(' / ')+(found.length>6?' 等':'')+'，请选具体那一个版本文件夹';
  if(has('versions')){
    const base=path.join(clean,'versions'),found=[];
    try{for(const entry of fs.readdirSync(base,{withFileTypes:true})){if(!entry.isDirectory())continue;const dir=path.join(base,entry.name);if(fs.existsSync(path.join(dir,'mods')))found.push(dir);}}catch{}
    if(found.length===1)return {ok:true,path:found[0],note:'你选的是上层目录，已自动定位到版本文件夹：'+path.basename(found[0])};
    if(found.length>1)return {ok:false,error:tooMany(found)};
  }
  if(has('mods'))return {ok:true,path:clean,note:has('config')?'':'没有 config 目录，任务书/KubeJS 层会跳过（模组层照常）'};
  const found=[];
  for(const base of [path.join(clean,'versions'),clean]){
    if(!fs.existsSync(base))continue;
    let entries=[];
    try{entries=fs.readdirSync(base,{withFileTypes:true});}catch{continue;}
    for(const entry of entries){if(!entry.isDirectory())continue;const dir=path.join(base,entry.name);if(fs.existsSync(path.join(dir,'mods')))found.push(dir);}
    if(found.length)break;
  }
  if(found.length===1)return {ok:true,path:found[0],note:'你选的是上层目录，已自动定位到版本文件夹：'+path.basename(found[0])};
  if(found.length>1)return {ok:false,error:tooMany(found)};
  return {ok:false,error:'里面没有 mods 目录，不像整合包版本文件夹：'+clean};
}

module.exports={readText,readJson,stat,ensureDir,NAMESPACE,packTag,rpName,patchName,modsZhFile,findInstalledRp,resolvePack};
