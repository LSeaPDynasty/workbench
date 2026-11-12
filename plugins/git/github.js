// GitHub repository presentation belongs to this plugin. The host only supplies
// account-bound GET requests, native clone and browser capabilities.
window.GithubProvider={
 async list(accountId,page=1){
  if(!Number.isSafeInteger(page)||page<1||page>1000)throw Error('分页无效');
  const data=await window.GitSDK.git.github.request(accountId,`user/repos?per_page=30&page=${page}&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member`);
  if(!Array.isArray(data))throw Error('GitHub 返回了无效仓库列表');
  return {entries:data.filter(r=>/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.full_name||'')).map(r=>({fullName:r.full_name,name:r.name,description:typeof r.description==='string'?r.description.slice(0,300):'',private:r.private===true,language:r.language||'',updated:r.pushed_at||null})),next:data.length===30?page+1:null};
 },
 clone(accountId,name){if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name))throw Error('仓库名称无效');return window.GitSDK.git.repos.cloneToFolder(accountId,'https://github.com/'+name+'.git',name.split('/')[1]);},
 open(name){return window.GitSDK.git.github.openPage(name);}
};
