const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {setupDesktopLifecycle}=require('../electron/desktop-lifecycle.cjs');
test('tray retains windows and backend jobs until explicit exit, then permits shutdown',async()=>{
 const app=new EventEmitter(),win=new EventEmitter();let menu,quit=0,stops=0,destroyed=false,minimized=true,restored=false,shown=false,hidden=false,focused=false;
 app.quit=()=>quit++;Object.assign(win,{isDestroyed:()=>false,isMinimized:()=>minimized,restore:()=>{restored=true;minimized=false;},show:()=>shown=true,hide:()=>hidden=true,focus:()=>focused=true});
 const backendManager={jobs:new Map([['plugin',{}]]),shutdown:async()=>{stops++;backendManager.jobs.clear();}};
 const electron={Tray:class extends EventEmitter {setToolTip(){}setContextMenu(value){menu=value;}destroy(){destroyed=true;}},Menu:{buildFromTemplate:items=>items},nativeImage:{createFromBitmap:()=>({})}};
 const {tray}=setupDesktopLifecycle({app,win,backendManager,electron});
 let prevented=0;const event={preventDefault(){prevented++;}};
 win.emit('close',event);assert.equal(hidden,true);assert.equal(stops,0);assert.equal(backendManager.jobs.size,1);
 tray.emit('click');assert.ok(restored&&shown&&focused);menu[0].click();
 menu[2].click();assert.equal(quit,1);app.emit('before-quit',event);await new Promise(resolve=>setImmediate(resolve));assert.equal(stops,1);assert.equal(quit,2);
 prevented=0;win.emit('close',event);assert.equal(prevented,0);app.emit('will-quit');assert.equal(destroyed,true);
});
