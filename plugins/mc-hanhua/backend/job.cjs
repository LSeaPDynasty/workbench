// 流水线子进程：启动 tools/pipeline.mjs、合并两路输出成日志、可停止。
const fs=require('node:fs'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {PIPELINE}=require('./settings.cjs');
const {NAMESPACE}=require('./paths.cjs');

const MAX_LINES=2000;
const isWindows=process.platform==='win32';

let cachedNode=null;
let probedNode=false;

// 后台跑在 Electron 的 utility process 里，process.execPath 是 electron.exe：
// 优先找真正的 node.exe，找不到才用 ELECTRON_RUN_AS_NODE 复用 electron 的 node 内核。
function resolveNode(){
  if(probedNode)return cachedNode;
  probedNode=true;
  const candidates=[];
  if(process.env.MC_HANHUA_NODE)candidates.push(process.env.MC_HANHUA_NODE);
  if(/node(\.exe)?$/i.test(path.basename(process.execPath)))candidates.push(process.execPath);
  if(isWindows){
    try{
      const found=execFileSync('where.exe',['node'],{windowsHide:true,encoding:'utf8'});
      for(const line of String(found).split(/\r?\n/)){
        const file=line.trim();
        if(file&&/node\.exe$/i.test(file))candidates.push(file);
      }
    }catch{}
    const programFiles=process.env.ProgramFiles||'C:\\Program Files';
    const programFilesX86=process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)';
    candidates.push(path.join(programFiles,'nodejs','node.exe'));
    candidates.push(path.join(programFilesX86,'nodejs','node.exe'));
    if(process.env.LOCALAPPDATA)candidates.push(path.join(process.env.LOCALAPPDATA,'Programs','nodejs','node.exe'));
  }
  for(const candidate of candidates){
    try{
      if(candidate&&fs.statSync(candidate).isFile()){cachedNode={command:candidate,extraEnv:{}};return cachedNode;}
    }catch{}
  }
  cachedNode={command:process.execPath,extraEnv:{ELECTRON_RUN_AS_NODE:'1'}};
  return cachedNode;
}

function buildArgs(mode,options){
  const opts=options||{};
  if(mode==='dry')return ['--dry'];
  if(mode==='build')return ['--no-ai'];
  if(mode!=='translate')throw Error('未知的运行模式：'+String(mode));
  const args=[];
  const kind=String(opts.kind||'all');
  if(kind!=='all'){
    if(kind!=='mods'&&kind!=='text')throw Error('未知的翻译范围：'+kind);
    args.push('--kind',kind);
  }
  const ns=String(opts.ns||'').trim();
  if(ns){
    if(!NAMESPACE.test(ns))throw Error('命名空间不合法：'+ns);
    args.push('--ns',ns);
  }
  const limit=Number(opts.limit);
  if(Number.isFinite(limit)&&limit>0)args.push('--limit',String(Math.min(Math.round(limit),100000)));
  return args;
}

class Pipeline{
  constructor({getRoot,getPack,logFile}){
    this.getRoot=getRoot;
    this.getPack=getPack;
    this.logFile=logFile;
    this.child=null;
    this.mode='';
    this.startedAt=0;
    this.seq=0;
    this.lines=[];
    this.lastExit=null;
    this.lastFinishedAt=0;
  }

  get running(){return !!this.child;}

  push(text){
    const line=String(text);
    if(!line.trim())return;
    this.seq+=1;
    this.lines.push({n:this.seq,t:line});
    if(this.lines.length>MAX_LINES)this.lines.splice(0,this.lines.length-MAX_LINES);
    if(this.logFile){
      try{fs.appendFileSync(this.logFile,line+'\n','utf8');}catch{}
    }
  }

  snapshot(){
    return {
      running:this.running,
      mode:this.mode||'',
      startedAt:this.startedAt||0,
      elapsed:this.running?Math.round((Date.now()-this.startedAt)/1000):0,
      lastExit:this.lastExit,
      lastFinishedAt:this.lastFinishedAt,
    };
  }

  logs(since){
    const from=Number(since)||0;
    return {
      seq:this.seq,
      lines:this.lines.filter(line=>line.n>from),
      job:this.snapshot(),
    };
  }

  start(mode,options){
    if(this.running)throw Error('已有任务在跑，先停止再启动新的。');
    const root=this.getRoot();
    const pipeline=PIPELINE(root);
    if(!fs.existsSync(pipeline))throw Error('找不到汉化工具链：'+pipeline+'。在「设置」里指定工具链目录。');
    const pack=this.getPack();
    if(!pack)throw Error('还没选整合包目录。');
    const args=buildArgs(mode,options);
    const node=resolveNode();
    const env={...process.env,...node.extraEnv,MC_PACK:pack};

    this.lines=[];
    this.seq=0;
    if(this.logFile){
      try{fs.mkdirSync(path.dirname(this.logFile),{recursive:true});fs.writeFileSync(this.logFile,'','utf8');}catch{}
    }
    const child=spawn(node.command,[pipeline,...args],{
      cwd:root,
      env,
      windowsHide:true,
      stdio:['ignore','pipe','pipe'],
    });
    this.child=child;
    this.mode=mode;
    this.startedAt=Date.now();
    this.lastExit=null;

    const read=(stream)=>{
      let buffer='';
      stream.setEncoding('utf8');
      stream.on('data',chunk=>{
        buffer+=chunk;
        const parts=buffer.split(/\r\n|\n|\r/);
        buffer=parts.pop()||'';
        for(const part of parts){
          if(part.trim())this.push(part.replace(/\s+$/,''));
        }
      });
      stream.on('end',()=>{if(buffer.trim())this.push(buffer);buffer='';});
    };
    read(child.stdout);
    read(child.stderr);
    child.on('error',error=>this.push('[错误] '+(error&&error.message?error.message:String(error))));
    child.on('close',code=>{
      this.child=null;
      this.lastExit=typeof code==='number'?code:-1;
      this.lastFinishedAt=Date.now();
      this.push(code===0?'[完成] 流水线正常结束':'[结束] 退出码 '+String(code));
    });

    return {started:true,mode,args,node:node.command};
  }

  stop(){
    if(!this.child)return {stopped:false};
    const pid=this.child.pid;
    this.push('[已请求停止]');
    if(isWindows){
      try{spawn('taskkill',['/F','/T','/PID',String(pid)],{windowsHide:true,stdio:'ignore'});}catch{}
    }
    try{this.child.kill('SIGKILL');}catch{}
    return {stopped:true};
  }

  dispose(){
    if(!this.child)return;
    const pid=this.child.pid;
    if(isWindows){
      try{spawn('taskkill',['/F','/T','/PID',String(pid)],{windowsHide:true,stdio:'ignore'});}catch{}
    }
    try{this.child.kill('SIGKILL');}catch{}
    this.child=null;
  }
}

module.exports={Pipeline,resolveNode,buildArgs,MAX_LINES};
