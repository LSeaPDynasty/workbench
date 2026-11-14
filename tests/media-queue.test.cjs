const {test}=require('node:test'),assert=require('node:assert/strict');
const Queue=require('../plugins/media/web/queue.cjs');
const track=(id,extra={})=>({id,title:id,kind:'music',available:true,...extra});
test('queue snapshots its source and crosses pages without changing browser data',async()=>{
 const calls=[],source={kind:'music',library:'one',query:'song',playlist:'p',favorite:true};
 const queue=new Queue(async(filters,page)=>{calls.push({filters,page});return page===0?{items:[track('a'),track('b')],next:1,total:3}:{items:[track('b'),track('c')],next:null,total:3};});
 queue.reset(source);source.library='other';await queue.locate('b');assert.equal((await queue.move('b',1)).id,'c');assert.equal((await queue.move('c',-1)).id,'b');assert.equal(await queue.move('a',-1),null);assert.equal(await queue.move('c',1),null);
 assert.deepEqual(queue.items.map(i=>i.id),['a','b','c']);assert.equal(calls[1].page,1);assert.equal(calls[1].filters.library,'one');assert.equal(calls[1].filters.favorite,true);
});
test('local favorites filter skipped pages, stay fixed and never shuffle outside the queue',async()=>{
 const ids=['a','d'],queue=new Queue(async(filters,page)=>[{items:[track('a')],next:1,total:4},{items:[track('b'),track('c'),track('video',{kind:'video'})],next:2,total:4},{items:[track('d')],next:null,total:4}][page]);
 queue.reset({kind:'music',localFavorites:ids});ids.push('b');await queue.locate('a');assert.equal((await queue.move('a',1)).id,'d');assert.equal((await queue.move('a',1,true)).id,'d');assert.deepEqual(queue.items.map(i=>i.id),['a','d']);queue.reset({kind:'music',localFavorites:['old-id']},{items:[track('new-id',{legacyIds:['old-id']})],next:null,total:1});assert.equal(queue.items[0].id,'new-id');
});
test('a late page from an old selection cannot replace the newer queue',async()=>{
 let resolve;const queue=new Queue(async(filters)=>filters.library==='old'?new Promise(r=>resolve=r):{items:[track('new')],next:null,total:1});
 queue.reset({kind:'music',library:'old'});const old=queue.loadMore();await Promise.resolve();await Promise.resolve();queue.reset({kind:'music',library:'new'});await queue.loadMore();resolve({items:[track('old')],next:null,total:1});await old;assert.deepEqual(queue.items.map(i=>i.id),['new']);assert.equal(queue.loading,false);
});
test('failed pages can be retried and parallel requests share one load',async()=>{
 let calls=0;const queue=new Queue(()=>{if(++calls===1)throw Error('temporary');return {items:[track('a')],next:null,total:1};});queue.reset({kind:'music'});await assert.rejects(queue.loadMore(),/temporary/);assert.equal(queue.loading,false);const first=queue.loadMore(),second=queue.loadMore();assert.equal(first,second);await first;assert.equal(queue.error,'');assert.equal(calls,2);
});
test('invalid paging cannot loop forever and seed pages retain order',async()=>{
 const queue=new Queue(async()=>({items:[],next:0,total:2}));queue.reset({kind:'music'});await assert.rejects(queue.loadMore(),/响应无效/);
 queue.reset({kind:'music'},{items:[track('b'),track('a'),track('missing',{available:false})],next:null,total:3});assert.equal((await queue.move('b',1)).id,'a');assert.equal(await queue.move('unknown',1),null);
});
