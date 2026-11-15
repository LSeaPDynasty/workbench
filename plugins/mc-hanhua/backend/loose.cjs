// 容错 JSON 解析（JSON5 子集）：去 BOM、去字符串外注释与尾逗号、处理单引号与裸换行。
// 逻辑与汉化工具链 tools/lib.mjs 的 parseLoose 保持一致，模组语言文件才能同样解析。
function parseLoose(text){
  if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
  let stage='';
  for(let i=0;i<text.length;i+=1){
    const c=text[i];
    if(c==='"'||c==="'"){
      const quote=c;
      let j=i+1,buf='';
      while(j<text.length){
        const d=text[j];
        if(d==='\\'){
          const n=text[j+1]??'';
          if(n==="'"){buf+="'";j+=2;continue;}
          if(n==='"'&&quote==="'"){buf+='\\"';j+=2;continue;}
          buf+=d+n;j+=2;continue;
        }
        if(d===quote)break;
        if(d==='"'&&quote==="'"){buf+='\\"';j+=1;continue;}
        if(d==='\n'||d==='\r'||d==='\t'||d.charCodeAt(0)<0x20){buf+=JSON.stringify(d).slice(1,-1);j+=1;continue;}
        buf+=d;j+=1;
      }
      stage+='"'+buf+'"';i=j;continue;
    }
    if(c==='/'&&text[i+1]==='/'){while(i<text.length&&text[i]!=='\n')i+=1;stage+='\n';continue;}
    if(c==='/'&&text[i+1]==='*'){const k=text.indexOf('*/',i+2);i=k<0?text.length:k+1;continue;}
    stage+=c;
  }
  let out='',inStr=false,lastSig='';
  for(let i=0;i<stage.length;i+=1){
    const c=stage[i];
    if(inStr){
      out+=c;
      if(c==='\\'){out+=stage[++i]??'';continue;}
      if(c==='"'){inStr=false;lastSig='"';}
      continue;
    }
    if(c==='"'){
      if(lastSig==='"'||lastSig==='}'||lastSig===']'||/[0-9a-zA-Z]/.test(lastSig))out+=',';
      inStr=true;out+=c;continue;
    }
    if(c===','){
      let j=i+1;
      while(j<stage.length&&/\s/.test(stage[j]))j+=1;
      if(stage[j]==='}'||stage[j]===']')continue;
    }
    if(!/\s/.test(c))lastSig=c;
    out+=c;
  }
  if(!out.trim())return {};
  return JSON.parse(out);
}

module.exports={parseLoose};
