const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const URL='https://github.com/login/device';
class GithubLogin{
 constructor({launch=spawn,save,open=async()=>{},onState=()=>{},timeout=300000}){this.launch=launch;this.save=save;this.open=open;this.onState=onState;this.timeout=timeout;this.jobs=new Map();}
 status(owner){return this.jobs.get(owner)?.state||{phase:'idle'};}
 publish(owner,job,state){if(this.jobs.get(owner)!==job)return;job.state={...job.state,...state};this.onState(owner,job.state);}
 start(owner,accountId,env=process.env){
  if(['starting','waiting','finishing'].includes(this.status(owner).phase))throw Error('已有登录正在进行，可先取消');
  const job={accountId,state:{phase:'starting',accountId},child:null,buffer:'',answered:false,opened:false,finished:false};this.jobs.set(owner,job);
  const installed=path.join(process.env.ProgramFiles||'C:\\Program Files','GitHub CLI','gh.exe');
  try{
   job.child=this.launch(fs.existsSync(installed)?installed:'gh',['auth','login','--hostname','github.com','--web','--git-protocol','https'],{windowsHide:true,env:{...env,GH_FORCE_TTY:'0'},stdio:['pipe','pipe','pipe']});
   job.timer=setTimeout(()=>this.stop(owner,job,'error','登录超时，请重试'),this.timeout);job.timer.unref?.();
   const output=chunk=>{
    if(this.jobs.get(owner)!==job||job.finished)return;
    job.buffer=(job.buffer+chunk.toString().replace(/\x1b\[[0-9;?]*[A-Za-z]/g,'')).slice(-16000);
    if(!job.answered&&/Authenticate Git with your GitHub credentials/i.test(job.buffer)){job.answered=true;job.child.stdin.write('Y\n');}
    const code=job.buffer.match(/(?:code[^\r\n]*?)([A-Z0-9]{4}-[A-Z0-9]{4})\b/i);
    if(code){this.publish(owner,job,{phase:'waiting',code:code[1].toUpperCase(),url:URL});if(!job.browserRequested){job.browserRequested=true;void Promise.resolve().then(()=>{if(!job.finished)return this.open(URL);}).catch(()=>{if(!job.finished)this.publish(owner,job,{message:'无法打开浏览器，请手动打开授权页'});});}}
    if(!job.opened&&/Press Enter to open/i.test(job.buffer)){job.opened=true;job.child.stdin.write('\n');}
   };
   job.child.stdout.on('data',output);job.child.stderr.on('data',output);
   job.child.stdin.on('error',()=>{});
   job.child.on('error',()=>this.stop(owner,job,'error','无法启动 GitHub CLI，请确认已安装'));
   job.child.on('close',code=>{void this.complete(owner,job,code);});
  }catch{this.stop(owner,job,'error','无法启动 GitHub CLI，请确认已安装');}
  return this.status(owner);
 }
 async complete(owner,job,code){
  if(this.jobs.get(owner)!==job||job.finished)return;
  if(code!==0)return this.stop(owner,job,'error','登录失败，请检查网络、代理后重试');
  const login=job.buffer.match(/Logged in as\s+([A-Za-z0-9-]+)/i)?.[1];
  if(!login)return this.stop(owner,job,'error','未能确认登录账号，请重试');
  this.publish(owner,job,{phase:'finishing'});
  try{await this.save(owner,job.accountId,login);if(job.finished)return;clearTimeout(job.timer);job.finished=true;job.buffer='';this.publish(owner,job,{phase:'success',login,code:undefined,url:undefined});}
  catch{this.stop(owner,job,'error','登录已完成，但账号资料保存失败，请重试');}
 }
 stop(owner,job,phase,message){if(job.finished)return;job.finished=true;clearTimeout(job.timer);job.child?.kill();job.buffer='';this.publish(owner,job,{phase,message,code:undefined,url:undefined});}
 cancel(owner){const job=this.jobs.get(owner);if(job&&!job.finished){if(job.state.phase==='finishing')throw Error('正在保存登录结果，请稍候');this.stop(owner,job,'cancelled','已取消登录');}return this.status(owner);}
 close(owner){const job=this.jobs.get(owner);if(job&&!job.finished)this.stop(owner,job,'cancelled','已取消登录');}
 dispose(){for(const owner of this.jobs.keys())this.close(owner);}
}
module.exports={GithubLogin};
