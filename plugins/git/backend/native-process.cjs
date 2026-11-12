const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),children=new Set();
function runFile(...args){const result=exec(...args);if(result.child)children.add(result.child);void result.then(()=>children.delete(result.child),()=>children.delete(result.child));return result;}
async function shutdown(){await Promise.allSettled([...children].map(async child=>{if(child.pid&&process.platform==='win32'){try{await exec('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:1000});}catch{child.kill();}}else child.kill();}));}
module.exports={runFile,shutdown};
