const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const TYPES={'.mp3':['music','audio/mpeg'],'.flac':['music','audio/flac'],'.wav':['music','audio/wav'],'.m4a':['music','audio/mp4'],'.aac':['music','audio/aac'],'.ogg':['music','audio/ogg'],'.opus':['music','audio/ogg'],'.mp4':['video','video/mp4'],'.m4v':['video','video/mp4'],'.webm':['video','video/webm'],'.mkv':['video','video/x-matroska'],'.mov':['video','video/quicktime'],'.avi':['video','video/x-msvideo']};
const LIMIT=50000,MAX_PLAYLISTS=200,MAX_TRACKS=10000;
const key=(root,relative)=>JSON.stringify([root,relative]);
function legacyId(root,relative){return createHash('sha256').update(root+'\0'+relative).digest('hex').slice(0,32);}
function fingerprint(info){return [info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');}
function publicItem(item,favorites=[]){
 const {id,rootId,title,kind,mime,hasCover,hasSubtitle,artist,album,size,modified,available,copies,filename,legacyIds}=item;
 return {id,hash:id,rootId,title,kind,mime,hasCover,hasSubtitle,artist,album,size,modified,available,copies,filename,legacyIds,favorite:favorites.includes(id)};
}
class Catalog{
 constructor(context){
  this.context=context;this.state={version:2,libraries:[],items:[],favorites:[],playlists:[],aliases:{},legacy:[]};
  this.revision=0;this.generation=0;this.scan={running:false,visited:0,found:0,errors:0,hashedBytes:0};this.tasks=new Set();this.tail=Promise.resolve();
  this.file=path.join(context.dataDir,'catalog-v2.json');this.byId=new Map();
 }
 async read(file){const info=await fs.stat(file);if(info.size>64*1024*1024)throw Error('媒体索引过大');return JSON.parse(await fs.readFile(file,'utf8'));}
 async init(){
  try{const data=await this.read(this.file);this.validate(data);this.state=data;}
  catch(error){
   if(error.code!=='ENOENT')throw error;
   try{
    const old=await this.read(path.join(this.context.dataDir,'catalog-v1.json'));
    if(old.version!==1||!Array.isArray(old.libraries)||!Array.isArray(old.items)||old.items.length>LIMIT||!Array.isArray(old.favorites))throw Error('旧媒体索引格式无效');
    this.state.libraries=old.libraries;this.state.legacy=old.items.map(i=>({id:i.id,rootId:i.rootId,relative:i.relative,favorite:old.favorites.includes(i.id)}));
    await this.save(); // Keep v1 intact; an explicit scan computes hashes and migrates references.
   }catch(legacyError){if(legacyError.code!=='ENOENT')throw legacyError;}
  }
  this.reindex();
 }
 validate(data){
  const text=(v,max=256)=>typeof v==='string'&&v.length<=max;
  if(data.version!==2||!Array.isArray(data.libraries)||!Array.isArray(data.items)||data.items.length>LIMIT||!Array.isArray(data.favorites)||!Array.isArray(data.playlists)||data.playlists.length>MAX_PLAYLISTS||!data.aliases||typeof data.aliases!=='object'||Array.isArray(data.aliases)||!Array.isArray(data.legacy))throw Error('媒体索引格式无效');
  const ids=new Set();let locations=0;
  for(const i of data.items){
   if(!/^[a-f0-9]{64}$/.test(i.id)||ids.has(i.id)||!i.defaults||!i.overrides||!Array.isArray(i.locations)||!['music','video'].includes(i.defaults.kind))throw Error('媒体记录无效');ids.add(i.id);
   for(const f of ['title','artist','album'])if(!text(i.defaults[f])||Object.hasOwn(i.overrides,f)&&!text(i.overrides[f]))throw Error('媒体资料无效');
   for(const l of i.locations){locations++;if(!text(l.rootId,100)||!text(l.relative,32768)||path.isAbsolute(l.relative)||l.relative.split(/[\\/]/).includes('..')||!text(l.fingerprint)||!TYPES[path.extname(l.relative).toLowerCase()])throw Error('媒体位置无效');}
  }
  if(locations>LIMIT||data.favorites.some(id=>!ids.has(id)))throw Error('媒体关联无效');
  const pids=new Set();for(const p of data.playlists){if(!text(p.id,64)||pids.has(p.id)||!text(p.name,80)||!p.name.trim()||!Array.isArray(p.tracks)||p.tracks.length>MAX_TRACKS||new Set(p.tracks).size!==p.tracks.length||p.tracks.some(id=>!ids.has(id)))throw Error('歌单无效');pids.add(p.id);}
 }
 reindex(){this.byId=new Map(this.state.items.map(i=>[i.id,i]));this.aliasesById=new Map();for(const [old,id]of Object.entries(this.state.aliases)){if(!this.aliasesById.has(id))this.aliasesById.set(id,[]);this.aliasesById.get(id).push(old);}}
 save(){const data=JSON.stringify(this.state);if(Buffer.byteLength(data)>64*1024*1024)return Promise.reject(Error('媒体索引超过 64 MiB'));const operation=this.tail.then(async()=>{await fs.writeFile(this.file+'.tmp',data);await fs.rename(this.file+'.tmp',this.file);});this.tail=operation.catch(()=>{});return operation;}
 record(id){const value=this.byId.get(this.state.aliases[id]||id);if(!value)throw Error('媒体不存在，请重新扫描');return value;}
 activeLocations(record,library=''){const enabled=new Set(this.state.libraries.filter(l=>l.enabled).map(l=>l.id));return record.locations.filter(l=>enabled.has(l.rootId)&&(!library||l.rootId===library));}
 materialize(record,library=''){
  const locations=this.activeLocations(record,library),location=locations[0];
  return {...record.defaults,...location,...record.overrides,id:record.id,available:!!location,copies:locations.length,hasCover:locations.some(l=>!!l.coverRelative),hasSubtitle:locations.some(l=>!!l.subtitleRelative),filename:location?path.basename(location.relative):'',legacyIds:this.aliasesById?.get(record.id)||[]};
 }
 libraries(){return this.state.libraries.map(l=>({...l,count:this.state.items.filter(i=>i.locations.some(p=>p.rootId===l.id)).length}));}
 library(id){const value=this.state.libraries.find(l=>l.id===id&&l.enabled);if(!value)throw Error('媒体库未启用');return value;}
 item(id){const value=this.materialize(this.record(id));if(!value.available)throw Error('文件不可用，请启用媒体库或重新扫描');return value;}
 list(input={}){
  const {kind='all',query='',library='',favorite=false,page=0,playlist='',availableOnly=false}=input;
  if(!['all','music','video'].includes(kind)||typeof query!=='string'||query.length>256||typeof library!=='string'||typeof playlist!=='string'||!Number.isSafeInteger(page)||page<0||page>1000)throw Error('筛选参数无效');
  const selected=playlist?this.playlist(playlist):null,q=query.toLowerCase();
  let items=(selected?selected.tracks.map(id=>this.byId.get(id)).filter(Boolean):this.state.items).map(i=>this.materialize(i,library)).filter(i=>(selected||i.available)&&(!availableOnly||i.available)&&(!library||i.available)&&(kind==='all'||i.kind===kind)&&(!favorite||this.state.favorites.includes(i.id))&&(!q||(i.title+' '+i.artist+' '+i.album).toLowerCase().includes(q)));
  if(!selected)items.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
  return {items:items.slice(page*60,(page+1)*60).map(i=>publicItem(i,this.state.favorites)),total:items.length,next:(page+1)*60<items.length?page+1:null};
 }
 async add(kind){if(!['all','music','video'].includes(kind))throw Error('媒体库类型无效');const root=await this.context.host('dialog.directory');if(!root)return this.libraries();const old=this.state.libraries.find(l=>l.id===root.id);if(old){old.kind=kind;old.enabled=true;}else this.state.libraries.push({id:root.id,name:root.name,kind,enabled:true});await this.save();this.start();return this.libraries();}
 async change(id,enabled){const library=this.state.libraries.find(l=>l.id===id);if(!library||typeof enabled!=='boolean')throw Error('媒体库无效');this.cancel();library.enabled=enabled;this.revision++;await this.save();if(enabled)this.start();return this.libraries();}
 async remove(id){if(!this.state.libraries.some(l=>l.id===id))throw Error('媒体库无效');this.cancel();this.state.libraries=this.state.libraries.filter(l=>l.id!==id);for(const item of this.state.items)item.locations=item.locations.filter(l=>l.rootId!==id);this.revision++;await this.save();return this.libraries();}
 async favorite(id,value){const record=this.record(id);if(typeof value!=='boolean')throw Error('收藏参数无效');this.state.favorites=this.state.favorites.filter(v=>v!==record.id);if(value)this.state.favorites.push(record.id);this.revision++;await this.save();return value;}
 async edit(id,patch){
  const record=this.record(id);if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!['title','artist','album'].includes(k)))throw Error('媒体资料无效');
  const values={...record.overrides};for(const [field,value]of Object.entries(patch)){if(value===null){delete values[field];continue;}if(typeof value!=='string'||value.length>256||field==='title'&&!value.trim())throw Error('媒体资料无效');values[field]=value.trim();}
  record.overrides=values;this.revision++;await this.save();return publicItem(this.materialize(record),this.state.favorites);
 }
 playlist(id){const p=this.state.playlists.find(p=>p.id===id);if(!p)throw Error('歌单不存在');return p;}
 playlists(){return this.state.playlists.map(p=>({id:p.id,name:p.name,count:p.tracks.length,available:p.tracks.filter(id=>{const i=this.byId.get(id);return i&&this.activeLocations(i).length;}).length}));}
 async playlistCreate(name){if(this.state.playlists.length>=MAX_PLAYLISTS)throw Error('歌单数量已达上限');const item={id:randomUUID(),name:this.playlistName(name),tracks:[]};this.state.playlists.push(item);this.revision++;await this.save();return item.id;}
 playlistName(name){if(typeof name!=='string'||!name.trim()||name.length>80)throw Error('歌单名称需为 1–80 个字符');return name.trim();}
 async playlistRename(id,name){const value=this.playlistName(name);this.playlist(id).name=value;this.revision++;await this.save();return this.playlists();}
 async playlistRemove(id){this.playlist(id);this.state.playlists=this.state.playlists.filter(p=>p.id!==id);this.revision++;await this.save();return this.playlists();}
 async playlistTrack(id,mediaId,operation){
  const playlist=this.playlist(id),record=this.record(mediaId),index=playlist.tracks.indexOf(record.id);
  if(!['add','remove','up','down'].includes(operation))throw Error('歌单操作无效');
  if(operation==='add'){if(record.defaults.kind!=='music')throw Error('歌单仅支持音乐');if(index<0){if(playlist.tracks.length>=MAX_TRACKS)throw Error('歌单歌曲已达上限');playlist.tracks.push(record.id);}}
  else if(index>=0){if(operation==='remove')playlist.tracks.splice(index,1);else{const target=index+(operation==='up'?-1:1);if(target>=0&&target<playlist.tracks.length)[playlist.tracks[index],playlist.tracks[target]]=[playlist.tracks[target],playlist.tracks[index]];}}
  this.revision++;await this.save();return this.playlists();
 }
 cancel(){this.generation++;this.scan={...this.scan,running:false,cancelled:true};return {...this.scan};}
 start(){const run=++this.generation;this.scan={running:true,visited:0,found:0,errors:0,hashedBytes:0,truncated:false};const task=this.scanAll(run);this.tasks.add(task);void task.finally(()=>this.tasks.delete(task));return {...this.scan};}
 async hashFile(rootId,relative,run){
  const filename=await this.context.host('folders.resolve',rootId,relative),file=await fs.open(filename,'r');
  try{
   const before=await file.stat({bigint:true});if(!before.isFile())throw Error('非文件');const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);let offset=0;
   for(;;){if(run!==this.generation)throw Error('扫描已取消');const {bytesRead}=await file.read(buffer,0,buffer.length,offset);if(run!==this.generation)throw Error('扫描已取消');if(!bytesRead)break;hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;this.scan.hashedBytes+=bytesRead;}
   const after=await file.stat({bigint:true}),resolved=await this.context.host('folders.resolve',rootId,relative),current=await fs.stat(resolved,{bigint:true});
   if(run!==this.generation||fingerprint(before)!==fingerprint(after)||fingerprint(after)!==fingerprint(current)||resolved!==filename||BigInt(offset)!==after.size)throw Error('文件在扫描时发生变化');
   return {hash:hash.digest('hex'),size:Number(after.size),modified:new Date(Number(after.mtimeMs)).toISOString(),fingerprint:fingerprint(after)};
  }finally{await file.close();}
 }
 async scanAll(run){
  const found=[],complete=new Set(),seen=new Set(),scan=this.scan;
  try{
   const libraries=this.state.libraries.filter(l=>l.enabled).map(l=>({...l}));
   for(const library of libraries){
    if(run!==this.generation)return;const errors=scan.errors;try{await this.context.host('folders.resolve',library.id,'');}catch{scan.errors++;continue;}
    const stack=[{relative:'',depth:0}];let limited=false;
    while(stack.length){
     if(run!==this.generation)return;const current=stack.pop();let handle;try{const folder=await this.context.host('folders.resolve',library.id,current.relative);handle=await fs.opendir(folder);}catch{scan.errors++;continue;}
     const media=[],images=[],subtitles=new Map();
     for await(const entry of handle){
      if(run!==this.generation)return;scan.visited++;if(entry.isSymbolicLink())continue;const relative=path.join(current.relative,entry.name);
      if(entry.isDirectory()){if(current.depth<32)stack.push({relative,depth:current.depth+1});else limited=true;}
      else if(entry.isFile()){const type=TYPES[path.extname(entry.name).toLowerCase()];if(type&&(library.kind==='all'||library.kind===type[0]))media.push({relative,name:entry.name,type});if(/^(cover|folder|poster)\.(jpg|jpeg|png|webp)$/i.test(entry.name))images.push(relative);if(/\.vtt$/i.test(entry.name))subtitles.set(path.basename(entry.name,path.extname(entry.name)),relative);}
      if(scan.visited%200===0)await new Promise(r=>setImmediate(r));if(scan.visited>=250000){limited=true;stack.length=0;break;}
     }
     const cover=images.find(p=>/cover\./i.test(p))||images[0]||null;
     for(const entry of media){
      if(run!==this.generation)return;
      try{
       const result=await this.hashFile(library.id,entry.relative,run),folders=current.relative.split(path.sep).filter(Boolean),title=path.basename(entry.name,path.extname(entry.name));
       const location={rootId:library.id,relative:entry.relative,coverRelative:cover,subtitleRelative:subtitles.get(title)||null,kind:entry.type[0],mime:entry.type[1],title,artist:entry.type[0]==='music'&&folders.length>1?folders.at(-2):'',album:entry.type[0]==='music'?folders.at(-1)||library.name:'',size:result.size,modified:result.modified,fingerprint:result.fingerprint};
       found.push({id:result.hash,location});seen.add(key(library.id,entry.relative));scan.found=found.length;
      }catch{if(run!==this.generation)return;scan.errors++;}
      if(found.length>=LIMIT){limited=true;break;}
     }
     if(found.length>=LIMIT||scan.visited>=250000)break;
    }
    if(!limited&&errors===scan.errors)complete.add(library.id);if(limited)scan.truncated=true;if(found.length>=LIMIT||scan.visited>=250000)break;
   }
   if(run!==this.generation)return;
   // Merge current records so edits made while hashing survive; preserve unvisited locations on incomplete scans.
   const records=new Map(this.state.items.map(i=>[i.id,{...i,locations:i.locations.filter(l=>!complete.has(l.rootId)&&!seen.has(key(l.rootId,l.relative)))}]));
   let locationCount=[...records.values()].reduce((sum,i)=>sum+i.locations.length,0);
   const aliases={...this.state.aliases},legacyByPath=new Map(this.state.legacy.map(i=>[key(i.rootId,i.relative),i])),migrated=new Set(),favorites=new Set(this.state.favorites);
   for(const {id,location}of found){
    if(!records.has(id)){if(records.size>=LIMIT||locationCount>=LIMIT){scan.truncated=true;continue;}records.set(id,{id,defaults:{},overrides:{},locations:[]});}
    const item=records.get(id);if(locationCount>=LIMIT){scan.truncated=true;continue;}item.locations.push(location);locationCount++;
    const {rootId,relative,coverRelative,subtitleRelative,fingerprint,...defaults}=location;item.defaults=defaults;
    const old=legacyByPath.get(key(rootId,relative));if(old){aliases[old.id]=id;if(old.favorite)favorites.add(id);migrated.add(old.id);}
   }
   this.state={...this.state,items:[...records.values()],aliases,favorites:[...favorites],legacy:this.state.legacy.filter(i=>!migrated.has(i.id))};this.reindex();await this.save();
   if(run===this.generation){this.revision++;scan.running=false;scan.cancelled=false;}
  }catch{if(run===this.generation){scan.running=false;scan.error='索引更新失败，原文件未修改';}}
 }
 async resolve(id,type='media'){
  const record=this.record(id);
  for(const location of this.activeLocations(record)){
   const relative=type==='cover'?location.coverRelative:type==='subtitle'?location.subtitleRelative:location.relative;if(!relative)continue;
   try{const filename=await this.context.host('folders.resolve',location.rootId,relative),file=await fs.open(filename,'r');try{const info=await file.stat({bigint:true});if(!info.isFile()||type==='media'&&fingerprint(info)!==location.fingerprint)throw Error('文件已变化，请重新扫描');return {file,filename,relative,item:{...this.materialize(record),...location,...record.overrides,id:record.id}};}catch(error){await file.close();throw error;}}catch{ /* Try another authorized copy of the same content. */ }
  }
  throw Error('文件不可用或已变化，请重新扫描');
 }
 async dispose(){this.cancel();await Promise.allSettled([...this.tasks]);await this.tail;}
}
module.exports={Catalog,TYPES,publicItem,fingerprint,legacyId};
