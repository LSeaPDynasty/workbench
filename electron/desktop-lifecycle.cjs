// A small local BGRA icon; no runtime downloads or external assets.
function trayIcon(nativeImage){
 const size=32,pixels=Buffer.alloc(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,mark=x>=8&&x<24&&(y>=8&&y<12||y>=15&&y<19||y>=22&&y<26);
  pixels[i]=mark?223:85;pixels[i+1]=mark?233:104;pixels[i+2]=mark?224:53;pixels[i+3]=255;
 }
 return nativeImage.createFromBitmap(pixels,{width:size,height:size,scaleFactor:1});
}
function setupDesktopLifecycle({app,win,backendManager,electron}){
 const {Tray,Menu,nativeImage}=electron;
 let quitting=false,stopping=false;
 const restore=()=>{if(win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();};
 const tray=new Tray(trayIcon(nativeImage));
 tray.setToolTip('栖桌');
 tray.setContextMenu(Menu.buildFromTemplate([{label:'打开栖桌',click:restore},{type:'separator'},{label:'退出',click:()=>app.quit()}]));
 tray.on('click',restore);
 win.on('close',event=>{if(!quitting){event.preventDefault();win.hide();}});
 app.on('activate',restore);
 app.on('before-quit',event=>{
  quitting=true;
  if(backendManager.jobs.size){event.preventDefault();if(!stopping){stopping=true;void backendManager.shutdown().then(()=>app.quit());}}
 });
 app.on('will-quit',()=>tray.destroy());
 return {tray,restore};
}
module.exports={setupDesktopLifecycle};
