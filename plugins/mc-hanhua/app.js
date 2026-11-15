'use strict';

/* MC 汉化插件前端：所有数据与操作都走工作台后台，页面本身不发网络请求。 */

const core=window.workbench;
const call=(method,...args)=>core.backend.request(method,args);

const $=id=>document.getElementById(id);
const val=id=>{const node=$(id);return node&&typeof node.value==='string'?node.value:'';};
const msgOf=error=>error&&error.message?String(error.message):String(error||'未知错误');
const num=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
const fmtInt=value=>num(value).toLocaleString('zh-CN');
const mb=size=>(num(size)/1048576).toFixed(2)+' MB';
const baseName=path=>{const parts=String(path||'').split(/[\\/]+/).filter(Boolean);return parts.length?parts[parts.length-1]:'';};
const tagOf=path=>baseName(path).replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,'-');
const when=iso=>{
  if(!iso)return '';
  const date=new Date(iso);
  if(Number.isNaN(date.getTime()))return '';
  return date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
};

const STATUS_MS=3000;
const LOG_MS=1500;

const S={
  view:'overview',
  status:null,
  items:[],
  modsLoaded:false,
  modsLoading:false,
  lastSeq:0,
  seen:new Set(),
  follow:true,
  logEmpty:true,
  progressKnown:false,
  phase:'',
  prevRunning:false,
  optimistic:false,
  apiFilled:false,
  packDirty:false,
  drawerNs:'',
  drawerTrigger:null,
  query:'',
  sort:'gap',
  gapOnly:true,
  timerStatus:0,
  timerLog:0,
};

/* ---------------- 提示条 ---------------- */

let noticeTimer=0;

function notify(message,kind){
  const bar=$('notice');
  if(!bar)return;
  const text=$('notice-text');
  if(text)text.textContent=String(message||'');
  bar.classList.toggle('ok',kind==='ok');
  bar.hidden=false;
  clearTimeout(noticeTimer);
  if(kind==='ok')noticeTimer=setTimeout(()=>{bar.hidden=true;},6000);
}

function hideNotice(){
  const bar=$('notice');
  if(bar)bar.hidden=true;
  clearTimeout(noticeTimer);
}

/* ---------------- 视图切换 ---------------- */

const navButtons=Array.from(document.querySelectorAll('.nav button'));
const views=Array.from(document.querySelectorAll('.view'));

function showView(name){
  if(!name)return;
  S.view=name;
  for(const button of navButtons){
    const on=button.dataset.view===name;
    button.classList.toggle('selected',on);
    if(on)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }
  for(const view of views){
    view.hidden=view.dataset.view!==name;
  }
  if(name==='mods'&&!S.modsLoaded)loadMods();
  if(name==='api'&&!S.apiFilled)fillApiForm(S.status&&S.status.config);
}

/* ---------------- 状态 ---------------- */

async function refreshStatus(force){
  if(document.hidden&&!force)return;
  try{
    const status=await call('status');
    renderStatus(status);
  }catch(error){
    const name=$('pack-name');
    if(name)name.textContent='读取状态失败';
    setChip('api-chip','api-chip-text','warn','状态不可用');
    setChip('job-chip','job-chip-text','warn','状态不可用');
    notify('读取状态失败：'+msgOf(error),'err');
  }
}

function setChip(chipId,textId,state,label){
  const chip=$(chipId);
  if(chip){
    chip.classList.toggle('ok',state==='ok');
    chip.classList.toggle('warn',state==='warn');
  }
  const text=$(textId);
  if(text&&text.textContent!==label)text.textContent=label;
}

function setBar(fill,pct){
  if(!fill)return;
  fill.style.width=Math.max(0,Math.min(100,num(pct)))+'%';
}

function ariaBar(node,pct){
  if(!node)return;
  if(pct===null||pct===undefined){node.removeAttribute('aria-valuenow');return;}
  node.setAttribute('aria-valuenow',String(Math.round(num(pct))));
}

function renderStatus(status){
  if(!status||typeof status!=='object')return;
  S.status=status;

  const pack=String(status.pack||'');
  const packver=status.packver||null;
  const name=packver&&packver.name?String(packver.name):(pack?baseName(pack):'未选择整合包');
  const nameNode=$('pack-name');
  if(nameNode)nameNode.textContent=name;

  const pathNode=$('pack-path');
  const pathText=pack||'还没有选择整合包目录';
  if(pathNode){
    if(pathNode.textContent!==pathText)pathNode.textContent=pathText;
    pathNode.title=pathText;
  }

  const config=status.config||{};
  setChip('api-chip','api-chip-text',config.hasKey?'ok':'warn',config.hasKey?'接口已配置':'接口未配置');

  const tool=status.tool||{};
  const toolState=$('tool-state');
  if(toolState)toolState.textContent=tool.ok?'工具链就绪':(tool.root?'工具链目录无效':'未设置工具链');
  const toolDot=$('tool-dot');
  if(toolDot)toolDot.classList.toggle('bad',!tool.ok);

  const toolInput=$('tool-input');
  if(toolInput&&toolInput.value!==(tool.root||''))toolInput.value=tool.root||'';

  const packInput=$('pack-input');
  if(packInput&&!S.packDirty&&packInput.value!==pack)packInput.value=pack;

  renderStats(status);
  renderArtifacts(status);
  renderFlags(status);
  renderJob(status.job||{});
  fillApiForm(config);

  const cfgState=$('cfg-api-state');
  if(cfgState)cfgState.textContent=config.hasKey?('已配置 '+(config.keyHint||''))+(config.fromEnv?'（环境变量）':''):'未配置';
  const cfgModel=$('cfg-model');
  if(cfgModel)cfgModel.textContent=config.model||'—';
  const cfgNums=$('cfg-nums');
  if(cfgNums)cfgNums.textContent=(config.concurrency||'—')+' / '+(config.batchSize||'—');
  const cfgFile=$('cfg-file');
  if(cfgFile){
    const root=(status.settings&&status.settings.toolRoot)||tool.root||'';
    cfgFile.textContent=root?root+'\\config.local.json':'—';
    cfgFile.title=cfgFile.textContent;
  }

  const hint=$('game-hint');
  if(hint){
    const rpName=(tagOf(pack)||'<包名>')+'-zh_cn-resourcepack';
    hint.textContent='进游戏后在资源包列表最上面启用 '+rpName+'；任务书改动重进世界或执行 /ftbquests reload。';
  }
}

function renderStats(status){
  const mods=status.mods;
  const pctValue=$('stat-pct');
  if(mods){
    const pct=num(mods.pct);
    if(pctValue)pctValue.textContent=pct.toFixed(1)+'%';
    setBar($('bar-pct'),pct);
    ariaBar($('stat-pct-bar'),pct);
    setNote('stat-pct-note',fmtInt(mods.zh)+' / '+fmtInt(mods.en)+' 键已有中文');
    setNote('stat-gap',fmtInt(mods.gap),true);
    setNote('stat-gap-note',fmtInt(mods.namespaces)+' 个命名空间，AI 补 '+fmtInt(mods.aiTranslated)+' 键');
  }else{
    if(pctValue)pctValue.textContent='—';
    setBar($('bar-pct'),0);
    ariaBar($('stat-pct-bar'),0);
    setNote('stat-pct-note','尚未扫描');
    setNote('stat-gap','—',true);
    setNote('stat-gap-note','尚未扫描');
  }

  const text=status.text;
  if(text&&text.quests){
    const quests=text.quests;
    const kubejs=text.kubejs||{};
    setNote('stat-text',fmtInt(quests.done)+'/'+fmtInt(quests.units),true);
    setNote('stat-text-note','KubeJS '+fmtInt(kubejs.done)+'/'+fmtInt(kubejs.units)+' 单元');
  }else{
    setNote('stat-text','—',true);
    setNote('stat-text-note','尚未扫描');
  }

  const verify=status.verify;
  const verifyNode=$('stat-verify');
  if(verify){
    // errors 是校验失败，warns 只是「未译且较长」这类待补提示，两者不能合并成「N 个问题」吓人。
    const errors=num(verify.errors),warns=num(verify.warns);
    if(verifyNode){
      if(errors>0){verifyNode.textContent=fmtInt(errors)+' 个错误';verifyNode.classList.add('bad');verifyNode.classList.remove('good');}
      else if(warns>0){verifyNode.textContent=fmtInt(warns)+' 处待补';verifyNode.classList.remove('bad');verifyNode.classList.remove('good');}
      else{verifyNode.textContent='通过';verifyNode.classList.remove('bad');verifyNode.classList.add('good');}
    }
    setNote('stat-verify-note','覆盖率 '+(verify.coverage||'—')+' · '+fmtInt(verify.translated)+'/'+fmtInt(verify.total)+' 键'+(warns>0&&errors===0?' · 无错误':''));
  }else{
    if(verifyNode){
      verifyNode.textContent='—';
      verifyNode.classList.remove('bad');
      verifyNode.classList.remove('good');
    }
    setNote('stat-verify-note','尚未扫描');
  }
}

function setNote(id,text){
  const node=$(id);
  if(!node)return;
  if(node.textContent!==text)node.textContent=text;
}

function renderArtifacts(status){
  const installed=status.installed||{};
  const rp=installed.rp;
  setNote('art-rp',rp?((installed.rpName||'资源包')+' · '+mb(rp.size)+(rp.mtime?' · '+when(rp.mtime):'')):'未安装');

  const quests=num(installed.questFiles);
  setNote('art-quest',installed.questOk?fmtInt(quests)+' 个文件':(quests>0?fmtInt(quests)+' 个文件':'未安装'));

  setNote('art-cache',fmtInt(status.cache)+' 条');
  setNote('art-gap',status.totalGap===null||status.totalGap===undefined?'—':fmtInt(status.totalGap));
}

function renderFlags(status){
  const box=$('flags');
  if(!box)return;
  const list=[];
  const tool=status.tool||{};
  const config=status.config||{};

  if(!tool.ok)list.push({text:'找不到汉化工具链目录，里面要有 tools/pipeline.mjs。',action:'tool',label:'选择工具链目录'});
  if(!status.ready)list.push({text:'找不到整合包目录：路径没设，或者文件夹里没有 mods。',action:'pack',label:'选择文件夹'});
  if(status.ready&&status.stale)list.push({text:'目录已切换，统计还是上一次的，先跑一次扫描估算。',action:'scan',label:'扫描估算'});
  if(status.ready&&status.canWrite===false)list.push({text:'写不进游戏目录，打包安装会失败（游戏正在运行？权限不够？）'});
  if(config.error)list.push({text:config.error});

  box.replaceChildren();
  if(!list.length){box.hidden=true;return;}
  box.hidden=false;

  for(const item of list){
    const row=document.createElement('div');
    row.className='flag';
    const text=document.createElement('p');
    text.textContent=item.text;
    row.append(text);
    if(item.action){
      const button=document.createElement('button');
      button.type='button';
      button.textContent=item.label;
      button.addEventListener('click',()=>{
        if(item.action==='tool')pickTool();
        else if(item.action==='pack')pickPack();
        else if(item.action==='scan'){
          const mode=$('mode');
          if(mode)mode.value='dry';
          showView('translate');
          startRun();
        }
      });
      row.append(button);
    }
    box.append(row);
  }
}

/* ---------------- 任务状态 ---------------- */

function setJobBusy(running){
  const busy=!!running||S.optimistic;
  const run=$('run');
  const stop=$('stop');
  if(run)run.disabled=busy;
  if(stop)stop.disabled=!busy;
}

function renderJob(job){
  const running=!!job.running;
  const elapsed=num(job.elapsed);

  if(running){
    setChip('job-chip','job-chip-text','ok','运行中 · '+elapsed+' 秒');
  }else if(job.lastExit!==null&&job.lastExit!==undefined&&num(job.lastExit)!==0){
    setChip('job-chip','job-chip-text','warn','上次退出码 '+String(job.lastExit));
  }else if(job.lastExit!==null&&job.lastExit!==undefined){
    setChip('job-chip','job-chip-text','','上次成功');
  }else{
    setChip('job-chip','job-chip-text','','空闲');
  }

  setJobBusy(running);

  if(running){
    if(!S.progressKnown){
      const wrap=$('job-bar-wrap');
      if(wrap&&!wrap.classList.contains('indeterminate')){
        wrap.classList.add('indeterminate');
        setBar($('job-bar'),30);
        ariaBar(wrap,null);
      }
      const text=$('progress-text');
      const label='运行中 · 已 '+elapsed+' 秒'+(S.phase?' · '+S.phase:'');
      if(text&&text.textContent!==label)text.textContent=label;
    }
  }else if(S.prevRunning){
    S.prevRunning=false;
    S.progressKnown=false;
    S.phase='';
    const wrap=$('job-bar-wrap');
    if(wrap)wrap.classList.remove('indeterminate');
    const ok=num(job.lastExit)===0;
    setBar($('job-bar'),ok?100:0);
    ariaBar($('job-bar-wrap'),ok?100:0);
    setNote('progress-text',ok?'任务结束':('任务结束（退出码 '+String(job.lastExit)+'）'));
    refreshStatus(true).then(()=>loadMods(true));
    return;
  }

  S.prevRunning=running;
}

/* ---------------- 日志 ---------------- */

function kindOf(text){
  if(/^===/.test(text))return 'step';
  if(/\[完成\]/.test(text))return 'ok';
  if(/\[错误\]|\[失败\]|\[结束\]|失败|错误|异常|超时|拒绝|HTTP\s*[45]\d\d|Error|error:/.test(text))return 'err';
  if(/警告|跳过|warn/i.test(text))return 'warn';
  return 'plain';
}

function readProgress(text){
  const step=/^===\s*(.*?)\s*===/.exec(text);
  if(step&&step[1]){
    S.phase=step[1];
    if(!S.progressKnown)setNote('progress-text','进行中 · '+step[1]);
  }
  const hit=/^\[(\d+)\/(\d+)\]\s+(\d+)\/(\d+)\s+条/.exec(text);
  if(!hit)return;
  const index=num(hit[1]);
  const steps=num(hit[2]);
  const done=num(hit[3]);
  const total=num(hit[4]);
  S.progressKnown=true;
  const wrap=$('job-bar-wrap');
  if(wrap)wrap.classList.remove('indeterminate');
  const pct=steps?Math.min(100,index/steps*100):0;
  setBar($('job-bar'),pct);
  ariaBar($('job-bar-wrap'),pct);
  setNote('progress-text','['+index+'/'+steps+'] '+fmtInt(done)+'/'+fmtInt(total)+' 条'+(S.phase?' · '+S.phase:''));
}

function appendLine(n,text){
  const log=$('log');
  if(!log)return;
  if(S.logEmpty){
    log.replaceChildren();
    S.logEmpty=false;
  }
  const line=document.createElement('div');
  line.className='log-line '+kindOf(text);
  line.dataset.n=String(n);
  line.textContent=text;
  log.append(line);
  readProgress(text);
  if(S.follow)log.scrollTop=log.scrollHeight;
}

function applyLogs(data){
  if(!data)return;
  const lines=Array.isArray(data.lines)?data.lines:[];
  for(const line of lines){
    const n=num(line&&line.n);
    if(!n||S.seen.has(n))continue;
    S.seen.add(n);
    appendLine(n,String(line&&line.t!=null?line.t:''));
  }
  if(typeof data.seq==='number')S.lastSeq=Math.max(S.lastSeq,num(data.seq));
  if(data.job)renderJob(data.job);
}

async function tickLogs(){
  if(!$('log'))return;
  try{
    const data=await call('logs',S.lastSeq);
    if(!data)return;
    if(typeof data.seq==='number'&&num(data.seq)<S.lastSeq){
      // 后台缓冲被新任务重置过，从头拉
      S.lastSeq=0;
      S.seen.clear();
      S.logEmpty=true;
      const log=$('log');
      if(log)log.replaceChildren();
      const again=await call('logs',0);
      applyLogs(again);
      return;
    }
    applyLogs(data);
  }catch(error){
    /* 轮询失败不打断页面，状态轮询会给出提示 */
  }
}

async function clearLogs(){
  const log=$('log');
  if(!log)return;
  log.replaceChildren();
  S.seen.clear();
  S.logEmpty=false;
  const placeholder=document.createElement('p');
  placeholder.className='log-empty';
  placeholder.textContent='面板已清空。下一次运行会重新开始记录。';
  log.append(placeholder);
  S.logEmpty=true;
  try{
    const data=await call('logs',S.lastSeq);
    if(data&&typeof data.seq==='number')S.lastSeq=Math.max(S.lastSeq,num(data.seq));
  }catch(error){/* 忽略 */}
}

/* ---------------- 运行 / 停止 ---------------- */

async function startRun(){
  const mode=(val('mode')||'translate').trim();
  const kind=(val('kind')||'all').trim();
  const ns=val('ns').trim();
  const rawLimit=val('limit').trim();
  const limit=rawLimit?Math.max(0,Math.round(Number(rawLimit))||0):0;

  const config=(S.status&&S.status.config)||null;
  if(mode==='translate'&&config&&!config.hasKey){
    notify('还没配置 API Key，先去「接口」填。','err');
    showView('api');
    return;
  }

  S.optimistic=true;
  setJobBusy(true);
  S.progressKnown=false;
  S.phase='';
  S.prevRunning=true;
  S.seen.clear();
  S.lastSeq=0;
  S.logEmpty=true;
  const log=$('log');
  if(log)log.replaceChildren();
  const wrap=$('job-bar-wrap');
  if(wrap)wrap.classList.remove('indeterminate');
  setBar($('job-bar'),0);
  ariaBar($('job-bar-wrap'),0);
  setNote('progress-text','正在启动…');

  try{
    await call('run',mode,{kind,ns,limit});
  }catch(error){
    S.optimistic=false;
    S.prevRunning=false;
    setJobBusy(false);
    setNote('progress-text','启动失败');
    notify('启动失败：'+msgOf(error),'err');
    return;
  }

  S.optimistic=false;
  notify(mode==='dry'?'已开始估算':(mode==='build'?'已开始打包回写':'已开始翻译'),'ok');
  await tickLogs();
  await refreshStatus(true);
}

async function stopRun(){
  try{
    const result=await call('stop');
    const stopped=!!(result&&result.stopped);
    notify(stopped?'已请求停止':'当前没有在跑的任务',stopped?'ok':'err');
  }catch(error){
    notify('停止失败：'+msgOf(error),'err');
  }
  await refreshStatus(true);
}

/* ---------------- 路径 ---------------- */

async function applyPack(){
  const raw=val('pack-input');
  const path=raw.trim().replace(/^"+|"+$/g,'').replace(/[\\/]+$/,'');
  if(!path){
    notify('先填整合包路径，或者点「选择文件夹」。','err');
    return;
  }
  try{
    const result=await call('savePack',path);
    S.packDirty=false;
    notify(result&&result.note?result.note:'整合包已切换','ok');
    await refreshStatus(true);
    await loadMods(true);
  }catch(error){
    notify('应用失败：'+msgOf(error),'err');
  }
}

async function pickPack(){
  try{
    const result=await call('pickPack');
    if(!result||result.canceled)return;
    S.packDirty=false;
    notify(result.note||'整合包已切换','ok');
    await refreshStatus(true);
    await loadMods(true);
  }catch(error){
    notify('选择失败：'+msgOf(error),'err');
  }
}

async function pickTool(){
  try{
    const result=await call('setToolRoot');
    if(!result||result.canceled)return;
    S.apiFilled=false;
    notify('工具链目录已更新','ok');
    await refreshStatus(true);
  }catch(error){
    notify('工具链目录无效：'+msgOf(error),'err');
  }
}

async function openTarget(target){
  try{
    await call('open',target);
  }catch(error){
    notify('打不开目录：'+msgOf(error),'err');
  }
}

/* ---------------- 接口设置 ---------------- */

function fillApiForm(config,force){
  if(!config)return;
  if(!force&&S.apiFilled)return;
  const put=(id,value)=>{
    const node=$(id);
    if(!node)return;
    if(document.activeElement===node)return;
    node.value=value===null||value===undefined?'':String(value);
  };
  put('f-base',config.baseUrl||'');
  put('f-model',config.model||'');
  put('f-key','');
  put('f-concurrency',config.concurrency||'');
  put('f-batch',config.batchSize||'');

  const key=$('f-key');
  if(key)key.placeholder=config.hasKey?('已保存 '+(config.keyHint||'••••')+'，留空则不改'):'还没有保存 Key，粘贴一个';
  const row=$('key-clear-row');
  if(row)row.hidden=!config.hasKey;
  S.apiFilled=true;
}

async function saveApiForm(){
  const patch={};
  const base=val('f-base').trim();
  const model=val('f-model').trim();
  const concurrency=val('f-concurrency').trim();
  const batchSize=val('f-batch').trim();
  const key=val('f-key').trim();
  const clear=$('f-clear');

  if(base)patch.baseUrl=base;
  if(model)patch.model=model;
  if(concurrency)patch.concurrency=concurrency;
  if(batchSize)patch.batchSize=batchSize;
  if(key)patch.apiKey=key;
  if(clear&&clear.checked)patch.apiKey='__clear__';

  const out=$('api-out');
  if(!Object.keys(patch).length){
    if(out)out.textContent='没有改动。';
    return;
  }

  try{
    const config=await call('saveApi',patch);
    const keyNode=$('f-key');
    if(keyNode)keyNode.value='';
    if(clear)clear.checked=false;
    S.apiFilled=false;
    fillApiForm(config,true);
    if(out)out.textContent='已保存到工具链目录的 config.local.json。';
    notify('接口配置已保存','ok');
    await refreshStatus(true);
  }catch(error){
    if(out)out.textContent='保存失败：'+msgOf(error);
    notify('保存失败：'+msgOf(error),'err');
  }
}

async function testApi(){
  const out=$('api-out');
  if(out)out.textContent='正在发一个小请求测试…';
  try{
    const result=await call('testApi');
    const parts=['接口正常'];
    if(result&&result.model)parts.push(String(result.model));
    if(result&&result.ms!==undefined&&result.ms!==null)parts.push(num(result.ms)+' ms');
    let line=parts.join(' · ');
    if(result&&result.sample)line+=' · 返回样例：'+String(result.sample);
    if(out)out.textContent=line;
    notify('接口连通','ok');
  }catch(error){
    if(out)out.textContent='测试失败：'+msgOf(error);
    notify('测试失败：'+msgOf(error),'err');
  }
}

/* ---------------- 模组清单 ---------------- */

async function loadMods(force){
  if(S.modsLoading)return;
  S.modsLoading=true;
  const body=$('mod-body');
  if(body&&!S.items.length){
    body.replaceChildren();
    const row=document.createElement('tr');
    const cell=document.createElement('td');
    cell.className='table-empty';
    cell.colSpan=6;
    cell.textContent='正在读取模组清单…';
    row.append(cell);
    body.append(row);
  }
  try{
    const data=await call('mods');
    S.items=Array.isArray(data&&data.items)?data.items:[];
    S.modsLoaded=true;
    renderMods();
  }catch(error){
    S.modsLoaded=false;
    if(body){
      body.replaceChildren();
      const row=document.createElement('tr');
      const cell=document.createElement('td');
      cell.className='table-empty';
      cell.colSpan=6;
      cell.textContent='读取模组清单失败：'+msgOf(error);
      row.append(cell);
      body.append(row);
    }
    notify('读取模组清单失败：'+msgOf(error),'err');
  }finally{
    S.modsLoading=false;
  }
}

function filteredMods(){
  const query=S.query.trim().toLowerCase();
  const list=S.items.filter(item=>{
    if(S.gapOnly&&num(item.gap)<=0)return false;
    if(query&&String(item.ns||'').toLowerCase().indexOf(query)<0)return false;
    return true;
  });
  const by={
    gap:(left,right)=>num(right.gap)-num(left.gap)||num(right.en)-num(left.en),
    pct:(left,right)=>num(left.pct)-num(right.pct)||num(right.gap)-num(left.gap),
    en:(left,right)=>num(right.en)-num(left.en),
    ns:(left,right)=>String(left.ns||'').localeCompare(String(right.ns||''),'zh-Hans-CN'),
  };
  return list.slice().sort(by[S.sort]||by.gap);
}

function renderMods(){
  renderChips();
  const body=$('mod-body');
  if(!body)return;
  const list=filteredMods();

  const countText=$('mod-count');
  if(countText){
    const gapSum=list.reduce((sum,item)=>sum+num(item.gap),0);
    countText.textContent=list.length?('显示 '+fmtInt(list.length)+' / '+fmtInt(S.items.length)+' 个命名空间，缺口 '+fmtInt(gapSum)+' 键'):('共 '+fmtInt(S.items.length)+' 个命名空间');
  }

  body.replaceChildren();

  if(!list.length){
    const row=document.createElement('tr');
    const cell=document.createElement('td');
    cell.className='table-empty';
    cell.colSpan=6;
    cell.textContent=S.items.length?'没有符合条件的结果，试试关掉「只看有缺口的」或清空搜索。':'还没有扫描结果。先到「翻译」里点一次「扫描估算」。';
    row.append(cell);
    body.append(row);
    return;
  }

  for(const item of list){
    const row=document.createElement('tr');
    row.dataset.ns=String(item.ns||'');

    const nsCell=document.createElement('td');
    nsCell.className='ns-cell';
    const code=document.createElement('span');
    code.className='ns-name';
    code.textContent=String(item.ns||'');
    nsCell.append(code);
    if(num(item.ai)>0){
      const badge=document.createElement('span');
      badge.className='badge';
      badge.textContent='AI +'+fmtInt(item.ai);
      nsCell.append(badge);
    }

    const enCell=cell('num',fmtInt(item.en));
    const zhCell=cell('num',fmtInt(item.zh));
    const gapCell=cell('num',fmtInt(item.gap));
    if(num(item.gap)>0)gapCell.classList.add('bad');

    const pctCell=document.createElement('td');
    const wrap=document.createElement('div');
    wrap.className='mini';
    const track=document.createElement('div');
    track.className='mini-bar';
    const fill=document.createElement('i');
    setBar(fill,num(item.pct));
    track.append(fill);
    const label=document.createElement('span');
    label.className='mini-label';
    label.textContent=fmtInt(item.pct)+'%';
    wrap.append(track,label);
    pctCell.append(wrap);

    const actionCell=document.createElement('td');
    actionCell.className='action-cell';
    const button=document.createElement('button');
    button.type='button';
    button.className='ghost';
    button.textContent='预览';
    button.setAttribute('aria-label','预览模组 '+String(item.ns||''));
    button.addEventListener('click',event=>{
      event.stopPropagation();
      openPreview(String(item.ns||''),button);
    });
    actionCell.append(button);

    row.append(nsCell,enCell,zhCell,gapCell,pctCell,actionCell);
    row.addEventListener('click',()=>openPreview(String(item.ns||''),row));
    body.append(row);
  }
}

function cell(className,text){
  const node=document.createElement('td');
  if(className)node.className=className;
  node.textContent=text;
  return node;
}

function renderChips(){
  const box=$('mod-chips');
  if(!box)return;
  box.replaceChildren();
  const top=S.items.filter(item=>num(item.gap)>0).slice().sort((left,right)=>num(right.gap)-num(left.gap)).slice(0,6);
  if(!top.length){
    box.hidden=true;
    return;
  }
  box.hidden=false;
  const label=document.createElement('span');
  label.className='chips-label';
  label.textContent='缺口最多：';
  box.append(label);
  for(const item of top){
    const button=document.createElement('button');
    button.type='button';
    button.className='chip-btn';
    button.setAttribute('aria-label','预览模组 '+String(item.ns||''));
    button.append(document.createTextNode(String(item.ns||'')));
    const badge=document.createElement('span');
    badge.className='badge';
    badge.textContent=fmtInt(item.gap);
    button.append(badge);
    button.addEventListener('click',()=>openPreview(String(item.ns||''),button));
    box.append(button);
  }
}

/* ---------------- 预览抽屉 ---------------- */

async function openPreview(ns,trigger){
  const drawer=$('drawer');
  if(!drawer||!ns)return;
  S.drawerNs=ns;
  S.drawerTrigger=trigger||null;
  drawer.hidden=false;

  const title=$('drawer-title');
  if(title)title.textContent=ns;
  const meta=$('drawer-meta');
  if(meta)meta.textContent='正在读取语言文件…';
  const body=$('drawer-body');
  if(body){
    body.replaceChildren();
    const empty=document.createElement('p');
    empty.className='drawer-empty';
    empty.textContent='正在读取…';
    body.append(empty);
  }

  try{
    const data=await call('preview',ns);
    if(S.drawerNs!==ns)return;
    renderPreview(data);
  }catch(error){
    if(meta)meta.textContent='读取失败';
    if(body){
      body.replaceChildren();
      const empty=document.createElement('p');
      empty.className='drawer-empty';
      empty.textContent='读取失败：'+msgOf(error);
      body.append(empty);
    }
  }

  const close=$('drawer-close');
  if(close)close.focus();
}

function renderPreview(data){
  const meta=$('drawer-meta');
  const body=$('drawer-body');
  if(!body)return;
  const rows=Array.isArray(data&&data.rows)?data.rows:[];
  const total=num(data&&data.total);
  const translated=num(data&&data.translated);

  if(meta){
    let line=fmtInt(translated)+'/'+fmtInt(total)+' 键已有中文';
    if(data&&data.note)line+=' · '+String(data.note);
    if(rows.length&&total>rows.length)line+=' · 只显示前 '+rows.length+' 条';
    meta.textContent=line;
  }

  body.replaceChildren();
  if(!rows.length){
    const empty=document.createElement('p');
    empty.className='drawer-empty';
    empty.textContent=(data&&data.note)?String(data.note):'没有可显示的条目。';
    body.append(empty);
    return;
  }

  const list=document.createElement('div');
  list.className='preview-list';
  for(const row of rows){
    const line=document.createElement('div');
    line.className='preview-row';

    const key=document.createElement('div');
    key.className='preview-key';
    key.textContent=String(row.key||'');
    key.title=String(row.key||'');

    const en=document.createElement('div');
    en.className='preview-en';
    en.textContent=String(row.en||'');

    const zh=document.createElement('div');
    zh.className='preview-zh';
    if(row.zh){
      zh.textContent=String(row.zh);
      if(row.src==='ai'||row.src==='jar'){
        const tag=document.createElement('span');
        tag.className='badge tag-'+(row.src==='ai'?'ai':'jar');
        tag.textContent=row.src==='ai'?'AI':'自带';
        zh.append(tag);
      }
    }else{
      zh.classList.add('empty');
      zh.textContent='未译';
    }

    line.append(key,en,zh);
    list.append(line);
  }
  body.append(list);
}

function closeDrawer(){
  const drawer=$('drawer');
  if(drawer)drawer.hidden=true;
  S.drawerNs='';
  const trigger=S.drawerTrigger;
  S.drawerTrigger=null;
  if(trigger&&document.contains(trigger))trigger.focus();
}

function translateNs(ns){
  closeDrawer();
  showView('translate');
  const kind=$('kind');
  if(kind)kind.value='mods';
  const mode=$('mode');
  if(mode)mode.value='translate';
  const nsInput=$('ns');
  if(nsInput)nsInput.value=ns||'';
  const run=$('run');
  if(run)run.focus();
}

/* ---------------- 事件绑定 ---------------- */

function bindEvents(){
  for(const button of navButtons){
    button.addEventListener('click',()=>showView(button.dataset.view));
  }

  const noticeClose=$('notice-close');
  if(noticeClose)noticeClose.addEventListener('click',hideNotice);

  /* 概览 */
  const packInput=$('pack-input');
  if(packInput){
    packInput.addEventListener('input',()=>{S.packDirty=true;});
    packInput.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();applyPack();}
    });
  }
  const packButton=$('pick-pack');
  if(packButton)packButton.addEventListener('click',pickPack);
  const applyButton=$('apply-pack');
  if(applyButton)applyButton.addEventListener('click',applyPack);
  const openPack=$('open-pack');
  if(openPack)openPack.addEventListener('click',()=>openTarget('pack'));
  const pickToolButton=$('pick-tool');
  if(pickToolButton)pickToolButton.addEventListener('click',pickTool);
  const openRoot=$('open-root');
  if(openRoot)openRoot.addEventListener('click',()=>openTarget('root'));

  for(const button of document.querySelectorAll('[data-open]')){
    button.addEventListener('click',()=>openTarget(button.dataset.open));
  }

  /* 翻译 */
  const runButton=$('run');
  if(runButton)runButton.addEventListener('click',startRun);
  const stopButton=$('stop');
  if(stopButton)stopButton.addEventListener('click',stopRun);
  const clearButton=$('clear-log');
  if(clearButton)clearButton.addEventListener('click',clearLogs);
  const log=$('log');
  if(log){
    log.addEventListener('scroll',()=>{
      S.follow=log.scrollHeight-log.scrollTop-log.clientHeight<24;
    });
  }
  for(const id of ['kind','ns','limit','mode']){
    const node=$(id);
    if(node)node.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();startRun();}
    });
  }

  /* 接口 */
  const saveButton=$('save-config');
  if(saveButton)saveButton.addEventListener('click',saveApiForm);
  const testButton=$('test-api');
  if(testButton)testButton.addEventListener('click',testApi);
  for(const id of ['f-base','f-model','f-key','f-concurrency','f-batch']){
    const node=$(id);
    if(node)node.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();saveApiForm();}
    });
  }

  /* 模组清单 */
  const search=$('mod-search');
  if(search)search.addEventListener('input',()=>{S.query=search.value;renderMods();});
  const sort=$('mod-sort');
  if(sort){
    sort.value=S.sort;
    sort.addEventListener('change',()=>{S.sort=sort.value;renderMods();});
  }
  const gapOnly=$('mod-gap-only');
  if(gapOnly){
    gapOnly.checked=S.gapOnly;
    gapOnly.addEventListener('change',()=>{S.gapOnly=gapOnly.checked;renderMods();});
  }

  /* 抽屉 */
  const closeButton=$('drawer-close');
  if(closeButton)closeButton.addEventListener('click',closeDrawer);
  const drawerTranslate=$('drawer-translate');
  if(drawerTranslate)drawerTranslate.addEventListener('click',()=>translateNs(S.drawerNs));

  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const drawer=$('drawer');
    if(drawer&&!drawer.hidden){
      event.preventDefault();
      closeDrawer();
    }
  });
}

/* ---------------- 启动 ---------------- */

function applyTheme(theme){
  if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme;
}

async function startTheme(){
  try{
    if(core&&typeof core.onTheme==='function')core.onTheme(applyTheme);
    if(core&&typeof core.initial==='function'){
      const info=await core.initial();
      if(info&&info.theme)applyTheme(info.theme);
    }
  }catch(error){
    /* 主题拿不到就用宿主默认的浅色 */
  }
}

function startTimers(){
  clearInterval(S.timerStatus);
  clearInterval(S.timerLog);
  S.timerStatus=setInterval(()=>{if(!document.hidden)refreshStatus();},STATUS_MS);
  S.timerLog=setInterval(()=>{if(!document.hidden)tickLogs();},LOG_MS);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)return;
    refreshStatus(true);
    tickLogs();
  });
}

async function boot(){
  bindEvents();
  await startTheme();
  await refreshStatus(true);
  await tickLogs();
  startTimers();
}

boot();
