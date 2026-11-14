(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MediaQueue=factory();})(typeof globalThis==='object'?globalThis:this,()=>{
 class PlaybackQueue{
  constructor(loadPage,onChange=()=>{}){this.loadPage=loadPage;this.onChange=onChange;this.version=0;this.items=[];this.next=null;this.total=0;this.loading=false;this.error='';this.pending=null;this.filters=Object.freeze({});}
  reset(filters,seed){
   this.version++;this.filters=Object.freeze({...filters,...(filters.localFavorites?{localFavorites:Object.freeze([...filters.localFavorites])}:{})});
   this.items=[];this.next=0;this.total=0;this.loading=false;this.error='';this.pending=null;
   if(seed){this.append(seed.items);this.next=seed.next;this.total=seed.total;}this.onChange();return this.version;
  }
  append(items){const ids=new Set(this.items.map(item=>item.id)),favorites=this.filters.localFavorites?new Set(this.filters.localFavorites):null;for(const item of items){if(item.kind!==this.filters.kind||item.available===false||favorites&&!favorites.has(item.id)&&!(Array.isArray(item.legacyIds)?item.legacyIds:[]).some(id=>favorites.has(id))||ids.has(item.id))continue;ids.add(item.id);this.items.push(item);}}
  loadMore(){
   if(this.pending)return this.pending;if(this.next===null)return Promise.resolve();
   const version=this.version,page=this.next,filters=this.filters;this.loading=true;this.error='';this.onChange();
   const task=(async()=>{try{const result=await Promise.resolve().then(()=>this.loadPage(filters,page));if(version!==this.version)return;
    if(!result||!Array.isArray(result.items)||result.items.length>60||!Number.isInteger(result.total)||result.total<0||result.total>50000||result.items.some(item=>!item||typeof item.id!=='string'||typeof item.title!=='string')||(result.next!==null&&(!Number.isInteger(result.next)||result.next<=page||result.next>Math.ceil(50000/60))))throw Error('播放列表响应无效');
    this.append(result.items);this.next=result.next;this.total=result.total;
   }catch(error){if(version===this.version)this.error=error.message;throw error;}finally{if(version===this.version){this.loading=false;this.pending=null;this.onChange();}}})();this.pending=task;return task;
  }
  async locate(id){const version=this.version;while(version===this.version&&!this.items.some(item=>item.id===id)&&this.next!==null)await this.loadMore();return version===this.version?this.items.findIndex(item=>item.id===id):-1;}
  async move(id,direction,shuffle=false){
   const version=this.version;let index=await this.locate(id);if(version!==this.version||index<0)return null;
   if(shuffle){while(version===this.version&&this.items.length<2&&this.next!==null)await this.loadMore();if(version!==this.version)return null;const choices=this.items.filter(item=>item.id!==id);return choices.length?choices[Math.floor(Math.random()*choices.length)]:null;}
   while(direction>0&&version===this.version&&index===this.items.length-1&&this.next!==null)await this.loadMore();
   return version===this.version?this.items[index+direction]||null:null;
  }
 }
 return PlaybackQueue;
});
