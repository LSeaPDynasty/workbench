// 读取/保存工具链的 config.local.json，并做一次连通性测试。
// 与 tools/llm.mjs 的字段和优先级保持一致（环境变量 > 文件 > 默认值）。
const fs=require('node:fs'),path=require('node:path');
const {readText}=require('./paths.cjs');

const cfgFile=root=>path.join(root,'config.local.json');

const positive=(...values)=>{
  for(const value of values){
    const number=Number(value);
    if(Number.isFinite(number)&&number>0)return number;
  }
  return 0;
};

function loadConfig(root){
  const file=cfgFile(root);
  let stored={},fileError='';
  if(fs.existsSync(file)){
    try{stored=JSON.parse(readText(file))||{};}catch(error){fileError='config.local.json 不是合法 JSON：'+error.message;stored={};}
  }
  if(!stored||typeof stored!=='object')stored={};
  const cfg={
    baseUrl:String(process.env.AI_BASE_URL||stored.baseUrl||'https://api.deepseek.com/v1').replace(/\/+$/,''),
    model:String(process.env.AI_MODEL||stored.model||'deepseek-chat'),
    apiKey:String(process.env.AI_API_KEY||stored.apiKey||'').trim(),
    concurrency:positive(process.env.AI_CONCURRENCY,stored.concurrency,4),
    batchSize:positive(process.env.AI_BATCH,stored.batchSize,50),
    temperature:Number.isFinite(Number(stored.temperature))?Number(stored.temperature):0.2,
    timeoutMs:positive(stored.timeoutMs,120000),
    jsonMode:stored.jsonMode!==false,
  };
  return {cfg,stored,fileError};
}

function safeConfig(root){
  const {cfg,fileError}=loadConfig(root);
  return {
    hasKey:!!cfg.apiKey,
    keyHint:cfg.apiKey?'••••'+cfg.apiKey.slice(-4):'',
    baseUrl:cfg.baseUrl,
    model:cfg.model,
    concurrency:cfg.concurrency,
    batchSize:cfg.batchSize,
    temperature:cfg.temperature,
    jsonMode:cfg.jsonMode,
    fromEnv:!!process.env.AI_API_KEY,
    error:fileError||undefined,
  };
}

const CONFIG_KEYS=['baseUrl','model','apiKey','concurrency','batchSize','temperature','jsonMode'];

function saveConfig(root,patch){
  const file=cfgFile(root);
  let stored={};
  if(fs.existsSync(file)){
    try{stored=JSON.parse(readText(file))||{};}catch(error){throw Error('config.local.json 不是合法 JSON，先修好它：'+error.message);}
  }
  if(!stored||typeof stored!=='object')stored={};
  const next={...stored};
  for(const key of CONFIG_KEYS){
    if(!Object.prototype.hasOwnProperty.call(patch,key))continue;
    const value=patch[key];
    if(value===undefined||value===null)continue;
    if(key==='apiKey'){
      const text=String(value).trim();
      if(text==='__clear__')delete next.apiKey;
      else if(text)next.apiKey=text;
      continue;
    }
    if(key==='concurrency'||key==='batchSize'){
      const number=Math.round(Number(value));
      if(Number.isFinite(number)&&number>=1)next[key]=Math.min(number,64);
      continue;
    }
    if(key==='temperature'){
      const number=Number(value);
      if(Number.isFinite(number))next.temperature=Math.max(0,Math.min(2,number));
      continue;
    }
    if(key==='jsonMode'){next.jsonMode=!!value;continue;}
    next[key]=String(value).trim();
  }
  fs.writeFileSync(file,JSON.stringify(next,null,2)+'\n','utf8');
  return safeConfig(root);
}

async function testConnection(root){
  const {cfg,fileError}=loadConfig(root);
  if(fileError)throw Error(fileError);
  if(!cfg.apiKey)throw Error('还没配置 API Key。填在下面，或设置环境变量 AI_API_KEY。');
  const body={
    model:cfg.model,
    messages:[
      {role:'system',content:'你是 Minecraft 模组汉化助手。只输出 JSON 对象，键是英文原文，值是简体中文译文。'},
      {role:'user',content:'把这两条译成简体中文，返回 JSON 对象：{"0":"Oak Planks","1":"Marble Bricks Slab"}'},
    ],
    temperature:cfg.temperature,
  };
  if(cfg.jsonMode)body.response_format={type:'json_object'};
  const started=Date.now();
  let response;
  try{
    response=await fetch(cfg.baseUrl+'/chat/completions',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer '+cfg.apiKey},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(Math.min(cfg.timeoutMs,60000)),
    });
  }catch(error){
    throw Error('连不上 '+cfg.baseUrl+'：'+(error&&error.message?error.message:String(error)));
  }
  const text=await response.text();
  if(!response.ok)throw Error('HTTP '+response.status+' '+text.slice(0,300));
  let data;
  try{data=JSON.parse(text);}catch{throw Error('接口返回的不是 JSON：'+text.slice(0,200));}
  const content=String(data?.choices?.[0]?.message?.content||'');
  let sample='';
  try{
    const map=JSON.parse(content);
    sample=String(map['0']||Object.values(map)[0]||'');
  }catch{sample=content.slice(0,80);}
  return {ok:true,ms:Date.now()-started,model:cfg.model,sample,usage:data?.usage||null};
}

module.exports={cfgFile,loadConfig,safeConfig,saveConfig,testConnection};
