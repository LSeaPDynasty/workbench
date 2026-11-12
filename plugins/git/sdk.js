const core=window.workbench;
const call=(method,...args)=>{if(!core.backend)return Promise.reject(Error('此插件需要主体 0.5.0 的通用后台运行时'));return core.backend.request(method,args);};
window.GitSDK={...core,git:{
 accounts:{list:()=>call('accounts.list'),save:data=>call('accounts.save',data),remove:id=>call('accounts.remove',id)},
 github:{start:id=>call('github.start',id),status:()=>call('github.status'),cancel:()=>call('github.cancel'),open:()=>call('github.open'),request:(id,resource)=>call('github.request',id,resource),openPage:resource=>call('github.openPage',resource),activate:id=>call('github.activate',id)},
 repos:{list:()=>call('repos.list'),remove:id=>call('repos.remove',id),register:(root,account)=>call('repos.register',root,account),init:(root,account)=>call('repos.init',root,account),clone:(root,remote,folder,account)=>call('repos.clone',root,remote,folder,account),cloneToFolder:(account,remote,folder)=>call('repos.cloneToFolder',account,remote,folder)},
 status:id=>call('status',id),log:(id,count)=>call('log',id,count),diff:id=>call('diff',id),stage:(id,files)=>call('stage',id,files),unstage:(id,files)=>call('unstage',id,files),commit:(id,message)=>call('commit',id,message),push:(id,remote,branch)=>call('push',id,remote,branch),pull:(id,remote,branch)=>call('pull',id,remote,branch)
}};
