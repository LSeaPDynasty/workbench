const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs/promises');
test('repository behavior lives in replaceable plugin resources',async()=>{
 const code=await fs.readFile(require.resolve('../plugins/git/github.js'),'utf8');const calls=[];
 const window={GitSDK:{git:{github:{request:async(id,resource)=>{calls.push({id,resource});return [{name:'workbench',full_name:'octocat/workbench',private:true}];},openPage:async value=>value},repos:{cloneToFolder:async(...args)=>{calls.push(args);return {id:'local'};}}}}};vm.runInNewContext(code,{window});const provider=window.GithubProvider;
 const page=await provider.list('account',2);assert.equal(page.entries[0].fullName,'octocat/workbench');assert.match(calls[0].resource,/page=2/);await provider.clone('account','octocat/workbench');assert.deepEqual(calls[1],['account','https://github.com/octocat/workbench.git','workbench']);assert.equal(await provider.open('octocat/workbench'),'octocat/workbench');
 vm.runInNewContext(code.replace('per_page=30','per_page=10'),{window});await window.GithubProvider.list('account',1);assert.match(calls[2].resource,/per_page=10/);
});
