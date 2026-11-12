const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {GithubLogin}=require('../electron/github-login.cjs');
function fake(){const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.writes=[];child.stdin=new EventEmitter();child.stdin.write=s=>child.writes.push(s);child.kill=()=>{child.killed=true;};return child;}
test('browser login streams split code, answers prompts and saves confirmed identity',async()=>{
 const child=fake(),saved=[],opened=[];let options;
 const service=new GithubLogin({launch:(exe,args,opts)=>{options=opts;return child;},save:async(...args)=>saved.push(args),open:async url=>opened.push(url)});
 try{
  assert.equal(service.start('one','account',{HTTPS_PROXY:'http://localhost:7897'}).phase,'starting');assert.equal(options.env.HTTPS_PROXY,'http://localhost:7897');assert.equal(service.status('two').phase,'idle');assert.throws(()=>service.start('one','other'));
  child.stderr.emit('data',Buffer.from('Authenticate Git with your GitHub credentials?'));
  child.stderr.emit('data',Buffer.from('! First copy your one-time code: ABCD-'));
  child.stderr.emit('data',Buffer.from('1234\nPress Enter to open https://github.com/login/device'));
  assert.equal(service.status('one').code,'ABCD-1234');assert.deepEqual(child.writes,['Y\n','\n']);await new Promise(r=>setImmediate(r));assert.deepEqual(opened,['https://github.com/login/device']);
  child.stderr.emit('data',Buffer.from('\n✓ Logged in as octocat\n'));child.emit('close',0);await new Promise(r=>setImmediate(r));
  assert.deepEqual(saved,[['one','account','octocat']]);assert.equal(service.status('one').phase,'success');assert.equal(service.status('one').code,undefined);
 }finally{service.dispose();}
});
test('cancel and close kill process, ignore late completion and allow retry',async()=>{
 const children=[],saved=[];const service=new GithubLogin({launch:()=>{const child=fake();children.push(child);return child;},save:async(...args)=>saved.push(args)});
 try{service.start('one','a');assert.equal(service.cancel('one').phase,'cancelled');assert.equal(children[0].killed,true);service.start('one','a');children[0].stderr.emit('data',Buffer.from('Logged in as stale'));children[0].emit('close',0);await new Promise(r=>setImmediate(r));assert.equal(saved.length,0);assert.equal(service.status('one').phase,'starting');service.close('one');assert.equal(children[1].killed,true);}finally{service.dispose();}
});
test('timeout and launch errors terminate without leaking process output',async()=>{
 const child=fake();const service=new GithubLogin({launch:()=>child,save:async()=>{},timeout:10});service.start('one','a');await new Promise(r=>setTimeout(r,25));assert.equal(service.status('one').phase,'error');assert.equal(child.killed,true);child.emit('error',Error('secret detail'));assert.ok(!JSON.stringify(service.status('one')).includes('secret'));service.dispose();
});
