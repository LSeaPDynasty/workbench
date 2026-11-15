// 工具链位置与插件设置（存插件自己的 dataDir，不污染工具链目录）。
const fs=require('node:fs'),path=require('node:path');
const {readText}=require('./paths.cjs');

const PIPELINE=root=>path.join(root,'tools','pipeline.mjs');

function looksLikeToolRoot(root){
  try{return fs.statSync(PIPELINE(root)).isFile();}catch{return false;}
}

function defaultToolRoot(){
  const candidates=[
    process.env.MC_HANHUA_ROOT,
    'F:\\Deepseek\\mc-hanhua',
    path.join(process.env.USERPROFILE||'', 'mc-hanhua'),
  ].filter(Boolean);
  for(const root of candidates){if(looksLikeToolRoot(root))return root;}
  return candidates[1]||'';
}

function createSettings(dataDir){
  const file=path.join(dataDir,'settings.json');
  function read(){
    let raw={};
    try{raw=JSON.parse(readText(file));}catch{raw={};}
    if(!raw||typeof raw!=='object')raw={};
    const toolRoot=typeof raw.toolRoot==='string'&&raw.toolRoot.trim()?raw.toolRoot.trim():defaultToolRoot();
    const packPath=typeof raw.packPath==='string'?raw.packPath.trim():'';
    const nodePath=typeof raw.nodePath==='string'?raw.nodePath.trim():'';
    return {toolRoot,packPath,nodePath};
  }
  function write(patch){
    const next={...read(),...patch};
    fs.mkdirSync(dataDir,{recursive:true});
    fs.writeFileSync(file,JSON.stringify(next,null,2),'utf8');
    return next;
  }
  return {file,read,write};
}

module.exports={PIPELINE,looksLikeToolRoot,defaultToolRoot,createSettings};
