const {execFile}=require('node:child_process'),{promisify}=require('node:util'),fs=require('node:fs'),path=require('node:path');
function endpoint(value){
 if(typeof value!=='string'||value.length>2048||/[\\\r\n\0#]/.test(value)||value.startsWith('/')||value.split('?')[0].split('/').some(p=>!p||p==='.'||p==='..'))throw Error('GitHub 资源路径无效');
 const url=new URL('https://api.github.com/'+value);
 if(!/^\/(user(?:\/repos)?|repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?|orgs\/[A-Za-z0-9_.-]+\/repos|search\/repositories)$/.test(url.pathname))throw Error('GitHub 资源不在授权范围');
 return value;
}
class GithubAccess{
 constructor(run=promisify(execFile)){this.run=run;const installed=path.join(process.env.ProgramFiles||'C:\\Program Files','GitHub CLI','gh.exe');this.gh=fs.existsSync(installed)?installed:'gh';}
 async environment(login,env){if(!/^[A-Za-z0-9-]{1,39}$/.test(login||''))throw Error('请先登录此 GitHub 账号');try{const {stdout}=await this.run(this.gh,['auth','token','--hostname','github.com','--user',login],{windowsHide:true,timeout:15000,maxBuffer:16384,env});const token=stdout.trim();if(!token||/\s/.test(token))throw Error();return {...env,GH_TOKEN:token,GH_HOST:'github.com',GH_PROMPT_DISABLED:'1'};}catch{throw Error('此账号的 GitHub 登录已失效，请重新登录');}}
 async get(login,resource,env){const target=endpoint(resource),authorized=await this.environment(login,env);try{const result=await this.run(this.gh,['api','--hostname','github.com','--method','GET',target],{windowsHide:true,timeout:30000,maxBuffer:2*1024*1024,env:authorized});return JSON.parse(result.stdout);}catch{throw Error('GitHub 请求失败，请检查网络、代理和账号权限');}}
 async clone(login,remote,folder,cwd,env){
  const {cleanFolder}=require('./git-service.cjs');cleanFolder(folder);
  if(typeof remote!=='string'||!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(remote)||new URL(remote).pathname.split('/').some(p=>p==='.'||p==='..'))throw Error('GitHub 远端地址无效');
  if(fs.existsSync(path.join(cwd,folder)))throw Error('目标目录已存在，请选择其他文件夹');const authorized=await this.environment(login,env),basic=Buffer.from('x-access-token:'+authorized.GH_TOKEN).toString('base64');
  try{await this.run('git',['clone','--',remote,folder],{cwd,windowsHide:true,timeout:120000,maxBuffer:1024*1024,env:{...env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'credential.helper',GIT_CONFIG_VALUE_0:'',GIT_CONFIG_KEY_1:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_1:'AUTHORIZATION: basic '+basic}});}catch{throw Error('克隆失败，请检查网络和权限；未完成的目录可能需要手动处理');}return folder;
 }
}
module.exports={GithubAccess,endpoint};
