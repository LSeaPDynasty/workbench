const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
const fs=require('node:fs');
async function privateFeed(run=promisify(execFile)){
 const installed=path.join(process.env.ProgramFiles||'C:\\Program Files','GitHub CLI','gh.exe');
 const executable=fs.existsSync(installed)?installed:'gh';
 let token;
 try{const response=await run(executable,['auth','token','--hostname','github.com'],{windowsHide:true,timeout:10000,maxBuffer:16384});token=response.stdout.trim();}catch{throw Error('请先通过 GitHub CLI 登录有仓库访问权限的账号');}
 if(!token||/\s/.test(token))throw Error('GitHub 登录凭据无效，请重新登录');
 return {provider:'github',owner:'LSeaPDynasty',repo:'workbench',private:true,token};
}
module.exports={privateFeed};
