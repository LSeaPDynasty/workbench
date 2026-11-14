const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomBytes,timingSafeEqual}=require('node:crypto'),{pipeline}=require('node:stream/promises');
const {publicItem,fingerprint}=require('./catalog.cjs');
function privateAddress(value){const ip=(value||'').replace(/^::ffff:/,'');return ip==='::1'||/^127\./.test(ip)||/^10\./.test(ip)||/^192\.168\./.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip)||/^169\.254\./.test(ip)||/^(fc|fd|fe80:)/i.test(ip);}
function addresses(){return Object.values(os.networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal&&privateAddress(a.address)).map(a=>a.address);}
function range(value,size){if(!value)return {start:0,end:size-1,partial:false};const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||!size||(!match[1]&&!match[2]))throw Error('range');let start,end;if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)throw Error('range');start=Math.max(0,size-suffix);end=size-1;}else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw Error('range');return {start,end,partial:true};}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
async function body(req){let text='';for await(const chunk of req){text+=chunk.toString();if(Buffer.byteLength(text)>2048)throw Error('请求过大');}return JSON.parse(text);}
class MediaServer{
 constructor(catalog,context){this.catalog=catalog;this.context=context;this.local=null;this.lan=null;this.streams=new Set();this.starting={};this.closing=false;}
 info(){const server=this.lan;return {enabled:!!server,port:server?.port||8098,urls:server?addresses().map(ip=>'http://'+ip+':'+server.port+'/#token='+server.secret):[],clients:server?[...server.sessions.values()].filter(s=>s.expires>Date.now()).length:0};}
 async start(lan=false,port=0){if(this.closing)throw Error('服务已停止');const key=lan?'lan':'local';if(this.starting[key])return this.starting[key];const task=this.listen(lan,port);this.starting[key]=task;try{return await task;}finally{if(this.starting[key]===task)delete this.starting[key];}}
 async listen(lan=false,port=0){if(lan&&(!Number.isSafeInteger(port)||port<1024||port>65535))throw Error('端口需为 1024–65535');if(lan?this.lan:this.local)return lan?this.info():this.local;
  const state={lan,secret:randomBytes(32).toString('base64url'),sessions:new Map(),attempts:new Map(),cookie:'wm_'+randomBytes(6).toString('hex')};
  state.server=http.createServer((req,res)=>{void this.handle(state,req,res).catch(()=>{if(res.destroyed)return;if(!res.headersSent)json(res,410,{error:'媒体文件不可用，请刷新或重新扫描'});else res.destroy();});});state.server.requestTimeout=15000;state.server.headersTimeout=10000;state.server.maxHeadersCount=40;state.server.on('clientError',(_,socket)=>socket.destroy());
  try{await new Promise((resolve,reject)=>{state.server.once('error',reject);state.server.listen(port,lan?'0.0.0.0':'127.0.0.1',resolve);});}catch{throw Error('服务无法启动，端口可能已被占用');}
  state.port=state.server.address().port;state.server.maxConnections=32;state.server.on('error',()=>{});if(lan)this.lan=state;else this.local=state;return lan?this.info():state;
 }
 async handle(state,req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(!privateAddress(req.socket.remoteAddress)){json(res,403,{error:'仅允许本机或局域网访问'});return;}
  let host;try{host=new URL('http://'+req.headers.host);if(host.port!==String(state.port)||!['127.0.0.1','localhost',...addresses()].includes(host.hostname)||host.username||host.password)throw Error();}catch{json(res,403,{error:'访问地址无效'});return;}
  if(req.headers.origin&&req.headers.origin!==host.origin){json(res,403,{error:'不允许跨站请求'});return;}
  const url=new URL(req.url,host.origin),route=url.pathname;
  if(req.method==='POST'&&route==='/api/session'){
   const ip=req.socket.remoteAddress,now=Date.now(),attempt=state.attempts.get(ip);if(attempt&&attempt.until>now&&attempt.count>=20){json(res,429,{error:'尝试过多，请稍后再试'});return;}state.attempts.set(ip,{until:now+60000,count:attempt&&attempt.until>now?attempt.count+1:1});if(state.attempts.size>256)state.attempts.delete(state.attempts.keys().next().value);
   let token;try{token=(await body(req)).token;}catch{json(res,400,{error:'授权码无效'});return;}const given=Buffer.from(typeof token==='string'?token:'');const expected=Buffer.from(state.secret);if(given.length!==expected.length||!timingSafeEqual(given,expected)){json(res,401,{error:'分享链接无效或已过期'});return;}
   const session=randomBytes(32).toString('base64url');state.sessions.set(session,{expires:Date.now()+12*3600000});if(state.sessions.size>128)state.sessions.delete(state.sessions.keys().next().value);res.setHeader('Set-Cookie',state.cookie+'='+session+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200');json(res,200,{ok:true});return;
  }
  if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'只读服务'});return;}
  const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/tokens.css':'../tokens.css'};
  if(route==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(Object.hasOwn(assets,route)){const file=assets[route];let data;try{data=await fs.readFile(path.join(__dirname,'../web',file));}catch{if(route!=='/tokens.css')throw Error();data=await fs.readFile(path.join(__dirname,'../../../design/tokens.css'));}res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);return;}
  const cookie=(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(state.cookie+'='))?.slice(state.cookie.length+1);const session=state.sessions.get(cookie);if(!session||session.expires<Date.now()){if(cookie)state.sessions.delete(cookie);json(res,401,{error:'请使用有效分享链接进入'});return;}
  if(route==='/api/library'){const page=Number(url.searchParams.get('page')||0);try{const data=this.catalog.list({page,kind:url.searchParams.get('kind')||'all',query:url.searchParams.get('q')||'',library:url.searchParams.get('library')||'',playlist:url.searchParams.get('playlist')||'',availableOnly:true});json(res,200,data);}catch{json(res,400,{error:'筛选参数无效'});}return;}
  if(route==='/api/playlists'){json(res,200,this.catalog.playlists().map(({id,name,available})=>({id,name,count:available})));return;}
  if(route==='/api/libraries'){json(res,200,this.catalog.libraries().filter(l=>l.enabled).map(({id,name,kind,count})=>({id,name,kind,count})));return;}
  const detail=/^\/api\/item\/([a-f0-9]{32}|[a-f0-9]{64})$/.exec(route);if(detail){try{json(res,200,publicItem(this.catalog.item(detail[1])));}catch{json(res,404,{error:'媒体不存在'});}return;}
  const match=/^\/(media|cover|subtitle)\/([a-f0-9]{32}|[a-f0-9]{64})$/.exec(route);if(!match){json(res,404,{error:'不存在'});return;}
  if(this.streams.size>=12){json(res,429,{error:'同时播放连接过多，请稍后再试'});return;}
  let item;try{item=this.catalog.item(match[2]);}catch{json(res,404,{error:'媒体不存在或已停用'});return;}
  const cover=match[1]==='cover',subtitle=match[1]==='subtitle';if(cover&&!item.hasCover||subtitle&&!item.hasSubtitle){res.writeHead(404);res.end();return;}
  const resolved=await this.catalog.resolve(match[2],match[1]),{filename,file,relative}=resolved;item=resolved.item;let transferred=false;
  try{
   const info=await file.stat();if(!info.isFile()||!Number.isSafeInteger(info.size)||cover&&info.size>4*1024*1024||subtitle&&info.size>512*1024)throw Error();const checked=await this.context.host('folders.resolve',item.rootId,relative),current=await fs.stat(checked,{bigint:true}),descriptor=await file.stat({bigint:true});if(checked.toLowerCase()!==filename.toLowerCase()||current.ino!==descriptor.ino||current.dev!==descriptor.dev||!cover&&!subtitle&&fingerprint(current)!==item.fingerprint)throw Error();this.catalog.library(item.rootId);
   let bytes;try{bytes=range(cover||subtitle?undefined:req.headers.range,info.size);}catch{res.writeHead(416,{'Content-Range':'bytes */'+info.size});res.end();return;}
   const mime=cover?{'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[path.extname(relative).toLowerCase()]:subtitle?'text/vtt; charset=utf-8':item.mime;if(!mime)throw Error();
   const headers={'Content-Type':mime,'Content-Length':Math.max(0,bytes.end-bytes.start+1),'Accept-Ranges':'bytes','Content-Disposition':'inline'};if(bytes.partial)headers['Content-Range']=`bytes ${bytes.start}-${bytes.end}/${info.size}`;res.writeHead(bytes.partial?206:200,headers);
   if(req.method==='HEAD'||info.size===0){res.end();return;}
   const stream=file.createReadStream({start:bytes.start,end:bytes.end,autoClose:true}),record={rootId:item.rootId,state,stream,res};transferred=true;this.streams.add(record);try{await pipeline(stream,res);}finally{this.streams.delete(record);}
  }finally{if(!transferred)await file.close();}
 }
 revoke(rootId){for(const item of this.streams)if(item.rootId===rootId){item.stream.destroy();item.res.destroy();}}
 async stop(lan=true){await this.starting[lan?'lan':'local']?.catch(()=>{});const state=lan?this.lan:this.local;if(!state)return;for(const item of this.streams)if(item.state===state){item.stream.destroy();item.res.destroy();}state.sessions.clear();state.server.closeAllConnections();await new Promise(resolve=>state.server.close(resolve));if(lan)this.lan=null;else this.local=null;}
 async open(id,playlist){const url=await this.embedUrl(id,playlist);await this.context.host('browser.open',url);return true;}
 async embedUrl(id,playlist){if(id)this.catalog.item(id);if(playlist)this.catalog.playlist(playlist);const state=await this.start(false);return 'http://127.0.0.1:'+state.port+'/#token='+state.secret+(id?'&play='+id:'')+(playlist?'&playlist='+encodeURIComponent(playlist):'');}
 async dispose(){this.closing=true;await Promise.all([this.stop(true),this.stop(false)]);}
}
module.exports={MediaServer,range,privateAddress};
