const {test}=require('node:test'),assert=require('node:assert/strict'),{GithubAccess,endpoint}=require('../plugins/git/backend/github-access.cjs');
test('generic read capability binds account and GET method without returning credentials',async()=>{
 const calls=[];const service=new GithubAccess(async(exe,args,opts)=>{calls.push({exe,args,opts});return args[0]==='auth'?{stdout:'private-test-token\n'}:{stdout:JSON.stringify({content:'resource'})};});
 const data=await service.get('octocat','repos/octocat/workbench/issues?state=open',{HTTPS_PROXY:'http://localhost:7897'});assert.equal(calls[0].args.at(-1),'octocat');assert.equal(calls[1].opts.env.GH_TOKEN,'private-test-token');assert.equal(calls[1].opts.env.HTTPS_PROXY,'http://localhost:7897');assert.deepEqual(calls[1].args.slice(0,-1),['api','--hostname','github.com','--method','GET']);assert.equal(data.content,'resource');assert.ok(!JSON.stringify(data).includes('token'));
 for(const value of ['https://example.com/user','//example.com','user/../user','repos/a/b/../../user','--method=POST','user\nrepos'])assert.throws(()=>endpoint(value));
 await assert.rejects(()=>service.clone('octocat','https://evil.example/a/b.git','target','C:/',{}));
});
test('resource and credential errors redact process output',async()=>{
 const credentials=new GithubAccess(async()=>{throw Error('SECRET');});await assert.rejects(()=>credentials.get('octocat','user/repos',{}),e=>e.message.includes('重新登录')&&!e.message.includes('SECRET'));
 const api=new GithubAccess(async(exe,args)=>{if(args[0]==='auth')return {stdout:'SECRET'};throw Error('SECRET');});await assert.rejects(()=>api.get('octocat','user/repos',{}),e=>e.message.includes('网络')&&!e.message.includes('SECRET'));
});
