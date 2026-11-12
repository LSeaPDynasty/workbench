const {parentPort}=require('node:worker_threads');
const {execFile}=require('node:child_process');
const path=require('node:path');
const {promisify}=require('node:util');
const run=promisify(execFile);
const githubAccess=new (require('./github-access.cjs').GithubAccess)();
function relativeList(items){
  if(!Array.isArray(items)||items.length>200)throw Error('文件列表无效');
  return items.map(item=>{if(typeof item!=='string'||!item||item.length>1024||path.isAbsolute(item)||item.split(/[\\/]/).includes('..')||item.includes('\0'))throw Error('文件路径无效');return item;});
}
function branch(value){if(typeof value!=='string'||!value||value.length>160||/[\s~^:?*\[\\]/.test(value)||value.includes('..'))throw Error('分支无效');return value;}
function remoteName(value){if(typeof value!=='string'||!/^[-A-Za-z0-9_.]{1,64}$/.test(value))throw Error('远端名称无效');return value;}
async function command(binary,cwd,args,timeout=30000){
  const {stdout,stderr}=await run(binary,args,{cwd,windowsHide:true,timeout,maxBuffer:1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_PAGER:'cat'}});
  return {stdout:stdout||'',stderr:stderr||''};
}
const git=(cwd,args)=>command('git',cwd,args);
async function action(cwd,method,args){
  if(typeof cwd!=='string'||!path.isAbsolute(cwd))throw Error('仓库路径无效');
  switch(method){
    case 'inspect': {const [status,remotes,head]=await Promise.all([git(cwd,['status','--porcelain=v1','-b']),git(cwd,['remote','-v']),git(cwd,['branch','--show-current'])]);return {status:status.stdout,remotes:remotes.stdout,branch:head.stdout.trim()};}
    case 'log': {try{await git(cwd,['rev-parse','--verify','HEAD']);}catch{return '';}const count=Number.isSafeInteger(args?.[0])?Math.min(Math.max(args[0],1),100):30;return (await git(cwd,['log','-n',String(count),'--date=short','--pretty=format:%h%x09%ad%x09%an%x09%s'])).stdout;}
    case 'diff': return (await git(cwd,['diff','--stat'])).stdout;
    case 'githubGet':return githubAccess.get(args[0],args[1],args[2]);
    case 'authenticatedClone':return githubAccess.clone(args[0],args[1],args[2],cwd,args[3]);
    case 'init': return (await git(cwd,['init'])).stdout;
    case 'stage': {const files=relativeList(args?.[0]);return (await git(cwd,files.length?['add','--',...files]:['add','-A'])).stdout;}
    case 'unstage': {const files=relativeList(args?.[0]);if(!files.length)throw Error('请选择文件');return (await git(cwd,['restore','--staged','--',...files])).stdout;}
    case 'commit': {const message=args?.[0];if(typeof message!=='string'||!message.trim()||message.length>4096||message.includes('\0'))throw Error('提交说明无效');return (await git(cwd,['commit','-m',message.trim()])).stdout;}
    case 'push': return (await git(cwd,['push',remoteName(args?.[0]),branch(args?.[1])])).stdout;
    case 'pull': return (await git(cwd,['pull','--ff-only',remoteName(args?.[0]),branch(args?.[1])])).stdout;
    case 'clone': {const remote=args?.[0],folder=args?.[1];if(typeof remote!=='string'||typeof folder!=='string')throw Error('克隆参数无效');return (await command('git',cwd,['clone','--',remote,folder],120000)).stdout;}
    case 'githubActivate': {const user=args?.[0];if(typeof user!=='string'||!/^[A-Za-z0-9-]{1,39}$/.test(user))throw Error('GitHub 用户名无效');await command('gh',cwd,['auth','switch','--hostname','github.com','--user',user]);return (await command('gh',cwd,['auth','setup-git','--hostname','github.com'])).stdout;}
    default:throw Error('未知 Git 操作');
  }
}
parentPort.on('message',async({id,cwd,method,args})=>{try{parentPort.postMessage({id,data:await action(cwd,method,args)});}catch(e){parentPort.postMessage({id,error:(e.stderr||e.message||'Git 操作失败').trim().slice(0,4000)});}});
