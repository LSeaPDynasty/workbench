const {test}=require('node:test');
const assert=require('node:assert/strict');
const {privateFeed}=require('../electron/update-auth.cjs');
test('private update authentication stays in host feed and errors hide credentials',async()=>{
 const feed=await privateFeed(async(executable,args)=>{assert.deepEqual(args,['auth','token','--hostname','github.com']);return {stdout:'test-token\n'};});
 assert.equal(feed.private,true);assert.equal(feed.token,'test-token');assert.equal(feed.repo,'workbench');
 await assert.rejects(()=>privateFeed(async()=>{throw Error('secret');}),error=>!error.message.includes('secret'));
 await assert.rejects(()=>privateFeed(async()=>({stdout:''})));
});
