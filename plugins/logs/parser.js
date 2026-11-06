(function(root){
 const normalize=value=>{const v=String(value||'').toUpperCase();return ({WARNING:'WARN',CRITICAL:'FATAL',ERR:'ERROR',INFORMATION:'INFO'})[v]||(['TRACE','DEBUG','INFO','NOTICE','WARN','ERROR','FATAL'].includes(v)?v:'UNKNOWN');};
 function metadata(line){let match;const timestamp=line.match(/^\s*(?:\[)?(\d{4}[-/]\d{2}[-/]\d{2}[T ][\d:.,+Z-]+)/)?.[1]||'';
  if(line.trim().startsWith('{')){try{const j=JSON.parse(line);if(j&&typeof j==='object'){const value=j.level??j.severity??j.log_level;const normalized=normalize(value);return {level:normalized,timestamp:String(j.timestamp??j.time??j['@timestamp']??''),start:value!==undefined||j.timestamp!==undefined||j.time!==undefined};}}catch{}}
  match=line.match(/(?:^|\[|\s)(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|FATAL|CRITICAL)(?=\]|\s|:|$)/i);
  return {level:normalize(match?.[1]),timestamp,start:!!match||!!timestamp};
 }
 function parse(text){const entries=[];text.replace(/\r\n/g,'\n').split('\n').forEach((line,index)=>{const meta=metadata(line);if(meta.start||!entries.length)entries.push({level:meta.level,timestamp:meta.timestamp,lines:[{number:index+1,text:line}]});else entries.at(-1).lines.push({number:index+1,text:line});});return entries;}
 function filter(entries,level,query){const q=query.toLowerCase();return entries.filter(e=>(level==='ALL'||e.level===level)&&(!q||e.lines.some(l=>l.text.toLowerCase().includes(q))));}
 const api={parse,filter,metadata,normalize};if(typeof module!=='undefined')module.exports=api;else root.LogParser=api;
})(globalThis);
