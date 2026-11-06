(function(root){
 const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const extensions={js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',ts:'typescript',tsx:'typescript',py:'python',java:'java',c:'c',h:'c',cpp:'cpp',hpp:'cpp',cs:'csharp',go:'go',rs:'rust',sh:'shell',bash:'shell',ps1:'shell',bat:'shell',rb:'ruby',php:'php',json:'json',jsonc:'json',yaml:'yaml',yml:'yaml',ini:'config',toml:'config',conf:'config',env:'config',sql:'sql',css:'css',scss:'css',html:'markup',xml:'markup',svg:'markup',vue:'markup',md:'markdown'};
 const keywords=new Set(('abstract and as assert async await auto base begin bool boolean break byte case catch char class const continue def default defer del delete do double elif else end enum except export extends extern false final finally float fn for foreach from func function global go if implements import in include instanceof int interface internal is lambda let long map match module namespace native new nil none not null object of operator or override package pass private protected public raise readonly ref return select self short signed sizeof static string struct super switch synchronized template this throw throws trait true try type typedef typeof union unsigned unsafe use using var virtual void volatile when where while with yield').split(' '));
 const sql=new Set('select from where join inner outer left right full on as and or not null is in exists like between group by order asc desc having limit offset insert into values update set delete create alter drop table index view database primary key foreign references unique default constraint union all distinct case when then else end begin commit rollback'.split(' '));
 function language(name){const base=name.split(/[\\/]/).pop().toLowerCase();if(base==='dockerfile'||base==='makefile')return 'shell';return extensions[base.split('.').pop()]||'plain';}
 function tokenize(text,lang){
  if(lang==='plain')return [{type:'',value:text}];
  const out=[];const hash=['python','shell','ruby','yaml','config'].includes(lang),slash=!['python','shell','ruby','yaml','config','sql','markup','markdown'].includes(lang);
  const pattern=/<!--[\s\S]*?(?:-->|$)|\/\*[\s\S]*?(?:\*\/|$)|"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\/[^\r\n]*|#[^\r\n]*|--[^\r\n]*|<\/?[A-Za-z][^>]*>|\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|[A-Za-z_$][\w$-]*|[^A-Za-z_$\d"'`/#<\-]+|[\s\S]/g;
  let match;while((match=pattern.exec(text))){const value=match[0],lower=value.toLowerCase();let type='';
   if((value.startsWith('/*')&&slash)||(value.startsWith('//')&&slash)||(value.startsWith('#')&&hash)||(value.startsWith('--')&&lang==='sql')||(value.startsWith('<!--')&&lang==='markup'))type='comment';
   else if(/^["'`]/.test(value)){type='string';if(['json','yaml','config'].includes(lang)&&/^\s*:/.test(text.slice(pattern.lastIndex)))type='key';}
   else if(lang==='markup'&&/^<\/?[A-Za-z]/.test(value))type='tag';
   else if(/^\d/.test(value))type='number';
   else if(['true','false','null','none','nil','undefined'].includes(lower))type='literal';
   else if((lang==='sql'?sql:keywords).has(lower))type='keyword';
   else if(/^[A-Za-z_$]/.test(value)&&/^\s*\(/.test(text.slice(pattern.lastIndex)))type='function';
   else if(['yaml','config','css'].includes(lang)&&/^[A-Za-z_$]/.test(value)&&/^\s*[:=]/.test(text.slice(pattern.lastIndex)))type='key';
   else if(lang==='markdown'&&value.startsWith('#'))type='keyword';
   const last=out.at(-1);if(last&&last.type===type)last.value+=value;else out.push({type,value});
  }return out;
 }
 function lines(text,lang){const rows=[''];for(const token of tokenize(text,lang)){const pieces=token.value.split('\n');for(let i=0;i<pieces.length;i++){if(i)rows.push('');const value=escape(pieces[i].replace(/\r$/,''));rows[rows.length-1]+=token.type?'<span class="tok-'+token.type+'">'+value+'</span>':value;}}return rows;}
 const api={escape,language,tokenize,lines};if(typeof module!=='undefined')module.exports=api;else root.CodeHighlight=api;
})(globalThis);
