const {Catalog}=require('./catalog.cjs'),{MediaServer}=require('./server.cjs'),fs=require('node:fs/promises'),path=require('node:path');
exports.create=async context=>{const catalog=new Catalog(context);await catalog.init();const server=new MediaServer(catalog,context);let closing=false;return {
 async request(method,args){if(closing)throw Error('媒体后台已停止');switch(method){
  case 'libraries':return catalog.libraries();
  case 'list':return catalog.list(args[0]);
  case 'cover':{const item=catalog.item(args[0]);if(!item.coverRelative)return null;const filename=await context.host('folders.resolve',item.rootId,item.coverRelative),file=await fs.open(filename,'r');try{const info=await file.stat();if(!info.isFile()||info.size>256*1024)return null;const buffer=Buffer.alloc(256*1024+1);let total=0;while(total<buffer.length){const {bytesRead}=await file.read(buffer,total,buffer.length-total,null);if(!bytesRead)break;total+=bytesRead;}if(total>256*1024)return null;const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[path.extname(filename).toLowerCase()];return mime?'data:'+mime+';base64,'+buffer.subarray(0,total).toString('base64'):null;}finally{await file.close();}}
  case 'status':return {scan:{...catalog.scan},revision:catalog.revision,share:server.info(),count:catalog.state.items.length};
  case 'add':return catalog.add(args[0]||'all');
  case 'enable':if(!args[1])server.revoke(args[0]);return catalog.change(args[0],args[1]);
  case 'remove':server.revoke(args[0]);return catalog.remove(args[0]);
  case 'scan':return catalog.start();
  case 'cancel':return catalog.cancel();
  case 'favorite':return catalog.favorite(args[0],args[1]);
  case 'open':return server.open(args[0]);
  case 'share.start':return server.start(true,args[0]===undefined?8098:args[0]);
  case 'share.stop':await server.stop(true);return server.info();
  default:throw Error('未知媒体操作');
 }},
 async dispose(){closing=true;catalog.cancel();await server.dispose();await catalog.tail;}
};};
