// MC 汉化工作台插件后台：只做「读工具链状态 / 改配置 / 起停流水线」，翻译本身仍由
// 工具链（tools/pipeline.mjs）完成，插件不重写一份，避免两条实现慢慢跑偏。
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {readText,readJson,resolvePack}=require('./paths.cjs');
const {createSettings,PIPELINE,looksLikeToolRoot}=require('./settings.cjs');
const {safeConfig,saveConfig,testConnection,cfgFile}=require('./ai.cjs');
const {collectStatus,modsList,preview}=require('./state.cjs');
const {Pipeline}=require('./job.cjs');

const cleanPath=value=>String(value||'').trim();

exports.create=async function create(context){
  const settings=createSettings(context.dataDir);
  const logFile=path.join(context.dataDir,'pipeline.log');
  const job=new Pipeline({getRoot:()=>settings.read().toolRoot,getPack:()=>currentPack(),logFile});

  function currentRoot(){return settings.read().toolRoot;}
  function currentPack(){
    const stored=settings.read().packPath;
    if(stored)return stored;
    const file=cfgFile(currentRoot());
    const data=readJson(file,{});
    const fallback=typeof data.packPath==='string'?data.packPath.trim():'';
    return fallback;
  }

  function toolInfo(){
    const root=currentRoot();
    return {root,ok:!!root&&looksLikeToolRoot(root)};
  }

  // 写回工具链的 config.local.json，让命令行入口和插件用同一个整合包；
  // 只动 packPath，其它字段原样保留，解析失败就跳过（绝不破坏用户配置）。
  function rememberPack(pack){
    const root=currentRoot();
    if(!root)return;
    const file=cfgFile(root);
    let stored={};
    try{
      if(fs.existsSync(file))stored=JSON.parse(readText(file))||{};
    }catch{return;}
    if(!stored||typeof stored!=='object')return;
    stored.packPath=pack;
    try{fs.writeFileSync(file,JSON.stringify(stored,null,2)+'\n','utf8');}catch{}
  }

  async function pickDirectory(){
    const root=await context.host('dialog.directory');
    if(!root)return null;
    const dir=typeof root==='string'?root:root.path;
    return cleanPath(dir)||null;
  }

  function openTarget(target){
    const root=currentRoot();
    const pack=currentPack();
    const targets={
      root:()=>root,
      dist:()=>path.join(root,'dist'),
      work:()=>path.join(root,'work'),
      data:()=>path.join(root,'data'),
      pack:()=>pack,
      resourcepacks:()=>path.join(pack,'resourcepacks'),
      quests:()=>path.join(pack,'config','ftbquests','quests','lang','zh_cn'),
    };
    const resolve=targets[String(target||'')];
    if(!resolve)throw Error('未知的目录：'+String(target));
    const dir=resolve();
    if(!dir||!fs.existsSync(dir))throw Error('目录不存在：'+(dir||'（未设置）'));
    spawn('explorer',[dir],{detached:true,stdio:'ignore',windowsHide:true}).unref();
    return {path:dir};
  }

  function status(){
    const tool=toolInfo();
    const pack=currentPack();
    let config;
    try{config=safeConfig(tool.root||'');}catch(error){config={hasKey:false,keyHint:'',baseUrl:'',model:'',concurrency:4,batchSize:50,error:error.message};}
    let snapshot;
    if(tool.ok){
      snapshot=collectStatus(tool.root,pack,config);
    }else{
      snapshot={tool,pack,ready:false,canWrite:false,scanned:'',stale:false,packver:null,config,mods:null,text:null,totalGap:null,verify:null,cache:0,dist:{rp:null,patch:null},installed:{rp:null,rpName:'',questFiles:0,questOk:false}};
    }
    snapshot.tool=tool;
    snapshot.settings={toolRoot:tool.root,packPath:settings.read().packPath,logFile};
    snapshot.job=job.snapshot();
    return snapshot;
  }

  return {
    async request(method,args){
      const options=Array.isArray(args)?args:[];
      switch(method){
        case 'status':
          return status();
        case 'mods':
          return modsList(currentRoot(),currentPack());
        case 'preview':
          return preview(currentRoot(),currentPack(),options[0]);
        case 'savePack':{
          const result=resolvePack(cleanPath(options[0]));
          if(!result.ok)throw Error(result.error);
          settings.write({packPath:result.path});
          rememberPack(result.path);
          return {ok:true,pack:result.path,note:result.note||''};
        }
        case 'pickPack':{
          const dir=await pickDirectory();
          if(!dir)return {ok:false,canceled:true};
          const result=resolvePack(dir);
          if(!result.ok)throw Error(result.error);
          settings.write({packPath:result.path});
          rememberPack(result.path);
          return {ok:true,pack:result.path,note:result.note||''};
        }
        case 'setToolRoot':{
          const dir=await pickDirectory();
          if(!dir)return {ok:false,canceled:true};
          if(!looksLikeToolRoot(dir))throw Error('这个目录里没有 tools/pipeline.mjs，不是汉化工具链：'+dir);
          settings.write({toolRoot:dir});
          return {ok:true,tool:{root:dir,ok:true}};
        }
        case 'saveApi':{
          const patch=options[0]&&typeof options[0]==='object'?options[0]:{};
          const allowed={};
          for(const key of ['baseUrl','model','apiKey','concurrency','batchSize','temperature','jsonMode']){
            if(Object.prototype.hasOwnProperty.call(patch,key))allowed[key]=patch[key];
          }
          return saveConfig(currentRoot(),allowed);
        }
        case 'testApi':
          return testConnection(currentRoot());
        case 'run':{
          const mode=String(options[0]||'translate');
          if(mode==='translate'){
            const config=safeConfig(currentRoot());
            if(!config.hasKey)throw Error('还没配置 API Key。先在「接口」里填 key，或设置环境变量 AI_API_KEY。');
          }
          const info=job.start(mode,options[1]||{});
          return {...info,pack:currentPack()};
        }
        case 'stop':
          return job.stop();
        case 'logs':
          return job.logs(options[0]);
        case 'open':
          return openTarget(options[0]);
        default:
          throw Error('未知的汉化操作：'+String(method));
      }
    },
    async dispose(){
      job.dispose();
    },
  };
};

module.exports.PIPELINE=PIPELINE;
