/* ══════════════════════════════════════════════════════
   Null's Brawl Mod Builder — app.js
   ══════════════════════════════════════════════════════ */
'use strict';

const App = (() => {

/* ── State ─────────────────────────────────────────── */
let pid   = null;   // current project id
let stAT  = null;   // autosave timer
let snkT  = null;   // snackbar timer
let lastFail = '';  // last failed JSON for autofix
let csvList  = null;// [{name,size}]
let keysC    = {};  // keys cache: filename→{keys,bool_cols}
let restoring = false;
let downloadUrl = null;
let keyFilterRAF = {};

/* ── API endpoints ──────────────────────────────────── */
const PHP = '/api.php';
const CSV = '/api/csv';

/* ── HTML tag definitions ───────────────────────────── */
const TAGS = [
  {l:'Жирный',    t:'b',c:'<b>'},{l:'Курсив',     t:'i',c:'<i>'},
  {l:'Подчёрк',   t:'u',c:'<u>'},{l:'Зачёрк',     t:'s',c:'<s>'},
  {l:'Большой',   t:'big',c:'<big>'},{l:'Маленький',t:'small',c:'<small>'},
  {l:'Верх',      t:'sup',c:'<sup>'},{l:'Низ',     t:'sub',c:'<sub>'},
  {l:'Моно',      t:'tt',c:'<tt>'},{l:'Параграф',  t:'p',c:'<p>'},
  {l:'Перенос',   t:'br',c:'<br>',one:true},{l:'Span',t:'span',c:'<span>'},
  {l:'Ссылка',    fn:'link',c:'<a>'},{l:'H1',      t:'h1',c:'<h1>'},
  {l:'H2',        t:'h2',c:'<h2>'},{l:'H3',        t:'h3',c:'<h3>'},
];
const COLORS = ['#e53935','#e65100','#f9a825','#2e7d32','#0277bd','#4527a0','#ad1457'];

/* ── Utilities ──────────────────────────────────────── */
const uid  = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const $ = id => document.getElementById(id);
const h = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const a = s => String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const ico = name => `<span class="material-symbols-rounded" aria-hidden="true">${name}</span>`;
const setHidden = (el, hidden) => el?.classList.toggle('is-hidden', hidden);
const parseList = s => String(s||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean);

async function fetchJson(url, opts={}, fallback='Ошибка API'){
  const r = await fetch(url, opts);
  if(!r.ok) throw new Error(`${fallback}: HTTP ${r.status}`);
  return await r.json();
}

function setRichOpen(toggle, open){
  toggle.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function clearDownload(){
  if(downloadUrl){
    URL.revokeObjectURL(downloadUrl);
    downloadUrl=null;
  }
  const btn=$('dl-btn');
  if(btn){
    btn.href='#';
    btn.removeAttribute('data-ready');
    setHidden(btn,true);
  }
}

function setDownload(jsonText){
  clearDownload();
  const blob=new Blob([jsonText],{type:'application/json;charset=utf-8'});
  downloadUrl=URL.createObjectURL(blob);
  const btn=$('dl-btn');
  btn.href=downloadUrl;
  btn.download='content.json';
  btn.setAttribute('data-ready','1');
  setHidden(btn,false);
}

function downloadJson(){
  const btn=$('dl-btn');
  if(btn?.dataset.ready==='1') btn.click();
}

/* ── Ripple ─────────────────────────────────────────── */
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.btn,.btn-icon,.fab,.chip,.tag-btn,.search-opt,.hist-item');
  if (!el) return;
  const r = el.getBoundingClientRect();
  const sz = Math.max(el.offsetWidth, el.offsetHeight) * 2.2;
  const rip = document.createElement('span');
  rip.className = 'ripple';
  rip.style.setProperty('--rw', sz+'px');
  rip.style.setProperty('--rx', (e.clientX - r.left)+'px');
  rip.style.setProperty('--ry', (e.clientY - r.top)+'px');
  el.style.overflow = 'hidden';
  el.style.position = el.style.position || 'relative';
  el.appendChild(rip);
  rip.addEventListener('animationend', ()=>rip.remove(), {once:true});
});

/* ── Loading ────────────────────────────────────────── */
function showLoad(t='Загрузка…',s=''){$('loading').classList.add('show');$('load-text').textContent=t;$('load-sub').textContent=s}
function hideLoad(){$('loading').classList.remove('show')}

/* ── Snackbar ───────────────────────────────────────── */
function snack(msg, actLabel='', actFn=null, ms=3500){
  clearTimeout(snkT);
  const el=$('snackbar'),act=$('snack-act');
  $('snack-msg').textContent=msg;
  if(actLabel&&actFn){act.textContent=actLabel;act.onclick=actFn;setHidden(act,false)}
  else setHidden(act,true);
  el.classList.add('show');
  snkT=setTimeout(()=>el.classList.remove('show'), ms);
}

/* ── Dialog ─────────────────────────────────────────── */
function dlg(title, body, btns){
  $('dlg-title').textContent=title;
  $('dlg-body').innerHTML=body;
  const act=$('dlg-actions'); act.innerHTML='';
  btns.forEach(({l,cls,fn,i})=>{
    const b=document.createElement('button');
    b.className=`btn ${cls}`;
    b.innerHTML=`${i?ico(i):''}${h(l)}`;
    b.onclick=()=>{closeDlg();if(fn)fn()};
    act.appendChild(b);
  });
  $('dlg-back').classList.add('open');
}
function closeDlg(e){
  if(e&&e.target!==$('dlg-back'))return;
  $('dlg-back').classList.remove('open');
}

/* ── Error ──────────────────────────────────────────── */
function showErr(rep, fix=false){
  $('err-console').textContent=rep;
  setHidden($('btn-autofix'), !fix);
  $('err-back').classList.add('open');
}
function closeError(){$('err-back').classList.remove('open')}
function copyError(){navigator.clipboard.writeText($('err-console').textContent).then(()=>snack('Скопировано!'))}

/* ── Autosave ───────────────────────────────────────── */
function save(){
  if(restoring) return;
  clearDownload();
  const badge=$('save-badge');
  badge.textContent='Сохранение…';badge.classList.add('show');
  clearTimeout(stAT); stAT=setTimeout(doSave,1100);
}
async function doSave(){
  try{
    const d=collect(); d.id=pid;
    const j=await fetchJson(`${PHP}?action=save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)},'Сохранение');
    if(j.success){
      pid=j.id;
      $('save-badge').textContent='Сохранено';
      setTimeout(()=>$('save-badge').classList.remove('show'),2200);
    } else {
      throw new Error(j.error||'save failed');
    }
  }catch(e){
    $('save-badge').textContent='Ошибка сохранения';
    setTimeout(()=>$('save-badge').classList.remove('show'),3200);
  }
}

/* ── CSV List ───────────────────────────────────────── */
async function loadCsvList(){
  if(csvList)return csvList;
  try{
    const data=await fetchJson(`${CSV}/list`,{},'Список CSV');
    csvList=Array.isArray(data) ? data : (data.files||[]);
  }catch(_){
    const r=await fetch(`${PHP}?action=csv_list`).catch(()=>null);
    csvList=r?.ok ? await r.json() : [];
  }
  return csvList;
}

/* ── Drawer ─────────────────────────────────────────── */
function openDrawer(){
  $('nav-drawer').classList.add('open');
  $('scrim').classList.add('open');
  loadHist();
}
function closeDrawer(){
  $('nav-drawer').classList.remove('open');
  $('scrim').classList.remove('open');
}

/* ── Section collapse ───────────────────────────────── */
function toggleSection(id){$(id).classList.toggle('open')}

/* ── History ────────────────────────────────────────── */
async function loadHist(){
  try{
    const r=await fetch(`${PHP}?action=history`);
    const data=await r.json();
    const list=$('hist-list');
    if(!data.length){list.innerHTML='<div class="hist-empty">Нет сохранённых проектов</div>';return}
    list.innerHTML='';
    data.forEach(item=>{
      const el=document.createElement('div');
      el.className='hist-item';
      el.innerHTML=`
        <div class="hist-title">${h(item.title)}</div>
        <div class="hist-date">${item.date}</div>
        <div class="hist-btns">
          <button class="btn btn-tonal btn-sm" onclick="App.loadProj('${item.id}')">
            <span class="material-symbols-rounded">folder_open</span>Загрузить
          </button>
          <button class="btn btn-danger btn-sm" onclick="App.confirmDel('${item.id}')">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>`;
      list.appendChild(el);
    });
  }catch(e){snack('Ошибка истории: '+e.message)}
}

async function loadProj(id){
  showLoad('Загрузка проекта…');
  try{
    const r=await fetch(`${PHP}?action=load&id=${id}`);
    const d=await r.json();
    if(!d.success){snack('Ошибка загрузки');return}
    pid=id; await populate(d.data);
    closeDrawer(); snack('Проект загружен');
  }catch(e){snack('Ошибка: '+e.message)}
  finally{hideLoad()}
}

function confirmDel(id){
  dlg('Удалить проект?','Это действие нельзя отменить.',[
    {l:'Отмена',cls:'btn-outlined',i:'close'},
    {l:'Удалить',cls:'btn-danger',i:'delete',fn:()=>delProj(id)}
  ]);
}
async function delProj(id){
  await fetch(`${PHP}?action=delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
  if(pid===id)pid=null;
  loadHist(); snack('Удалено');
}

function confirmNew(){
  dlg('Новый проект','Несохранённые изменения будут потеряны.',[
    {l:'Отмена',cls:'btn-outlined',i:'close'},
    {l:'Создать',cls:'btn-filled',i:'add',fn:newProj}
  ]);
}
function newProj(){
  pid=null;
  ['title_ru','title_en','desc_ru','desc_en','spec','patches_path','uuid'].forEach(id=>$(id).value='');
  $('author').value='User'; $('version').value='1.0.0'; $('gv').value='65';
  $('patches').innerHTML='';
  $('feats-list').innerHTML=''; $('groups-list').innerHTML='';
  $('json-out').textContent=''; $('json-out').classList.remove('show');
  clearDownload();
  closeDrawer(); snack('Новый проект');
}

/* ── Rich HTML Tag Menus ────────────────────────────── */
function initRichMenus(){
  document.querySelectorAll('.rich-group').forEach(grp=>{
    const inp    = grp.querySelector('input,textarea');
    const toggle = grp.querySelector('.rich-toggle');
    const menu   = grp.querySelector('.html-menu');
    if(!inp||!toggle||!menu)return;

    // Color strip
    const strip=document.createElement('div'); strip.className='color-strip';
    COLORS.forEach(color=>{
      const d=document.createElement('div');
      d.className='color-dot'; d.style.background=color;
      d.onmousedown=e=>{e.preventDefault();tagInsert(inp,'font',`color='${color}'`)};
      strip.appendChild(d);
    });
    // Tag grid
    const grid=document.createElement('div'); grid.className='tag-grid';
    TAGS.forEach(item=>{
      const b=document.createElement('div');
      b.className='tag-btn';
      b.innerHTML=`<span>${item.l}</span><span class="tag-code">${item.c}</span>`;
      b.onmousedown=e=>{e.preventDefault();item.fn==='link'?linkInsert(inp):tagInsert(inp,item.t,'',item.one)};
      grid.appendChild(b);
    });
    menu.appendChild(strip); menu.appendChild(grid);

    toggle.setAttribute('aria-expanded','false');
    toggle.onclick=()=>{const o=menu.classList.toggle('open');setRichOpen(toggle,o)};
    document.addEventListener('click',e=>{
      if(!grp.contains(e.target)){menu.classList.remove('open');setRichOpen(toggle,false)}
    },true);
  });
}

function tagInsert(el,tag,attrs='',single=false){
  const s=el.selectionStart,e=el.selectionEnd,v=el.value;
  const open=`<${tag}${attrs?' '+attrs:''}>`,close=single?'':`</${tag}>`;
  const sel=v.substring(s,e);
  el.value=v.substring(0,s)+open+sel+close+v.substring(e);
  el.setSelectionRange(s+open.length+(single?0:sel.length),s+open.length+(single?0:sel.length));
  el.focus(); save();
}
function linkInsert(el){
  const s=el.selectionStart,e=el.selectionEnd,v=el.value;
  const sel=v.substring(s,e);
  el.value=v.substring(0,s)+`<a href=''>`+sel+`</a>`+v.substring(e);
  el.setSelectionRange(s+9,s+9); el.focus(); save();
}

/* ── CSV Patch Blocks ───────────────────────────────── */
async function addPatch(restoreData=null){
  const id=uid();
  const el=document.createElement('div');
  el.className='patch-block'; el.id=`pb-${id}`;
  el.innerHTML=`
    <div class="patch-header">
      <span class="material-symbols-rounded patch-leading">table_chart</span>
      <span class="patch-title" id="pt-${id}">Выберите CSV файл…</span>
      <button class="btn-icon" onclick="App.rmPatch('${id}')" title="Удалить блок">
        <span class="material-symbols-rounded icon-danger">delete</span>
      </button>
    </div>
    <div class="patch-body">
      <div class="field">
        <label>CSV файл</label>
        <div class="search-wrap">
          <input type="text" id="fs-${id}" placeholder="Введите название файла…"
                 oninput="App.srchCsv(this,'${id}')"
                 onfocus="App.srchCsv(this,'${id}')"
                 autocomplete="off">
          <input type="hidden" id="fn-${id}">
        </div>
        <!-- dropdown is global, positioned fixed -->
      </div>
      <div id="rows-${id}"></div>
      <button class="btn btn-outlined btn-block btn-sm is-hidden mt-10" id="addrow-${id}"
              onclick="App.addRow('${id}')">
        <span class="material-symbols-rounded">add</span>Добавить строку
      </button>
    </div>`;
  $('patches').appendChild(el);

  if(restoreData){
    $(`fs-${id}`).value=restoreData.filename.replace('.csv','');
    $(`fn-${id}`).value=restoreData.filename;
    $(`pt-${id}`).textContent=restoreData.filename.replace('.csv','');
    setHidden($(`addrow-${id}`), false);
    for(const row of (restoreData.rows||[])) await addRow(id,row);
  }
  save();
}

function rmPatch(id){$(`pb-${id}`)?.remove();save()}

/* Global search dropdown (one shared) */
let srchActive = {id:null,inp:null};
const srchDrop = (() => {
  const d = document.createElement('div');
  d.className = 'search-dropdown';
  d.id = 'g-srch';
  document.body.appendChild(d);
  return d;
})();

function positionDrop(inp){
  const r=inp.getBoundingClientRect();
  srchDrop.style.top    = (r.bottom+4)+'px';
  srchDrop.style.left   = r.left+'px';
  srchDrop.style.width  = r.width+'px';
}

document.addEventListener('click', e=>{
  if(!e.target.closest('.search-wrap') && !srchDrop.contains(e.target)){
    srchDrop.classList.remove('open');
    srchActive={id:null,inp:null};
  }
});
window.addEventListener('scroll',()=>{
  if(srchActive.inp) positionDrop(srchActive.inp);
},{passive:true});
window.addEventListener('resize',()=>{
  if(srchActive.inp) positionDrop(srchActive.inp);
},{passive:true});

async function srchCsv(inp, id){
  const q=inp.value.toLowerCase();
  if(!csvList) await loadCsvList();
  const matches=q ? csvList.filter(f=>f.name.toLowerCase().includes(q)) : csvList;

  srchDrop.innerHTML = matches.length
    ? matches.slice(0,80).map(f=>{
        const name=f.name.replace('.csv','');
        const big=f.size>5*1024*1024;
        return `<div class="search-opt${big?' disabled':''}"
                     title="${a(name)}"
                     onmousedown="App.pickCsv('${a(f.name)}','${id}')">
                  ${h(name)}${big?'<span class="opt-size">(>5MB)</span>':''}
                </div>`;
      }).join('')
    : '<div class="search-opt disabled">Ничего не найдено</div>';

  srchActive={id,inp};
  positionDrop(inp);
  srchDrop.classList.add('open');
}

async function pickCsv(filename, blockId){
  $(`fs-${blockId}`).value=filename.replace('.csv','');
  $(`fn-${blockId}`).value=filename;
  $(`pt-${blockId}`).textContent=filename.replace('.csv','');
  srchDrop.classList.remove('open');
  srchActive={id:null,inp:null};
  setHidden($(`addrow-${blockId}`), false);
  $(`rows-${blockId}`).innerHTML='';
  await addRow(blockId);
  save();
}

/* ── Row entries ────────────────────────────────────── */
async function addRow(blockId, restore=null){
  const fn=$(`fn-${blockId}`)?.value;
  if(!fn)return;
  const rowId=uid();

  // Load keys
  let info=keysC[fn];
  if(!info){
    showLoad('Загрузка строк…');
    try{
      info=await fetchJson(`${CSV}/keys`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:fn})},'CSV keys');
      if(info.success)keysC[fn]=info;
    }catch(e){
      snack(e.message);
    }finally{
      hideLoad();
    }
  }
  if(!info?.success){
    snack(info?.error ? `CSV: ${info.error}` : 'Не удалось загрузить CSV');
    return;
  }
  const keys=info?.keys||[];
  const bools=info?.bool_cols||[];
  const rowN=($(`rows-${blockId}`)?.querySelectorAll('.row-entry').length||0)+1;

  const el=document.createElement('div');
  el.className='row-entry'; el.id=`re-${rowId}`;
  el.innerHTML=`
    <div class="row-entry-header">
      <span class="row-num">${rowN}</span>
      <button class="btn-icon row-remove"
              onclick="App.rmRow('${rowId}','${blockId}')" title="Удалить строку">
        <span class="material-symbols-rounded icon-danger">remove_circle</span>
      </button>
    </div>
    <div class="mode-chips" id="mc-${rowId}">
      <div class="chip active" data-m="row" onclick="App.setMode('${rowId}','row','${blockId}')">
        <span class="material-symbols-rounded">tag</span>Строка
      </div>
      ${bools.length?`<div class="chip" data-m="flt" onclick="App.setMode('${rowId}','flt','${blockId}')">
        <span class="material-symbols-rounded">filter_alt</span>Boolean фильтр
      </div>`:''}
    </div>
    <div id="rsel-${rowId}">
      <div id="rnorm-${rowId}" class="field">
        <input type="text" id="ksrch-${rowId}" placeholder="Поиск строки…" oninput="App.filterKeys('${rowId}')">
        <select class="key-select-list" id="ksel-${rowId}"
                onchange="App.loadFields('${blockId}','${rowId}')">
          ${keys.map(k=>`<option value="${a(k)}">${h(k)}</option>`).join('')}
        </select>
        <input type="hidden" id="kallkeys-${rowId}" value="${a(JSON.stringify(keys))}">
      </div>
      <div id="rflt-${rowId}" class="field is-hidden">
        <label>Boolean столбец</label>
        <select id="fsel-${rowId}" onchange="App.loadFltFields('${blockId}','${rowId}')">
          ${bools.map(b=>`<option value="${a(b)}">${h(b)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="fields-list" id="fl-${rowId}">
      <div class="empty-hint">Выберите строку для редактирования…</div>
    </div>`;
  $(`rows-${blockId}`).appendChild(el);

  if(restore){
    const key=String(restore.key);
    const isFlt=key.startsWith('[')&&key.endsWith(']');
    if(isFlt){
      await setMode(rowId,'flt',blockId);
      const col=key.slice(1,-1);
      const fs=$(`fsel-${rowId}`);
      if(fs) fs.value=col;
      await loadFltFields(blockId,rowId,restore.changes);
    } else {
      const sel=$(`ksel-${rowId}`);
      if(sel){
        // Ensure the key exists in options
        if(![...sel.options].some(o=>o.value===key)){
          sel.insertAdjacentHTML('afterbegin',`<option value="${a(key)}">${h(key)}</option>`);
        }
        sel.value=key;
      }
      await loadFields(blockId,rowId,restore.changes);
    }
  }
}

function rmRow(rowId,blockId){
  $(`re-${rowId}`)?.remove();
  $(`rows-${blockId}`)?.querySelectorAll('.row-num').forEach((el,i)=>el.textContent=i+1);
  save();
}

async function setMode(rowId,mode,blockId){
  $(`mc-${rowId}`).querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.m===mode));
  setHidden($(`rnorm-${rowId}`), mode!=='row');
  setHidden($(`rflt-${rowId}`), mode!=='flt');
  if(mode==='flt') await loadFltFields(blockId,rowId);
  else if($(`ksel-${rowId}`)?.value) await loadFields(blockId,rowId);
}

function filterKeys(rowId){
  cancelAnimationFrame(keyFilterRAF[rowId]);
  keyFilterRAF[rowId]=requestAnimationFrame(()=>filterKeysNow(rowId));
}

function filterKeysNow(rowId){
  const q=$(`ksrch-${rowId}`).value.toLowerCase();
  const all=JSON.parse($(`kallkeys-${rowId}`).value||'[]');
  const sel=$(`ksel-${rowId}`);
  const cur=sel.value;
  sel.innerHTML=all.filter(k=>k.toLowerCase().includes(q)).slice(0,100)
    .map(k=>`<option value="${a(k)}"${k===cur?' selected':''}>${h(k)}</option>`).join('');
}

async function loadFields(blockId,rowId,saved=null){
  const fn=$(`fn-${blockId}`)?.value;
  const key=$(`ksel-${rowId}`)?.value;
  if(!fn||!key)return;
  showLoad('Загрузка полей…');
  try{
    const d=await fetchJson(`${CSV}/row`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:fn,row_key:key})},'CSV row');
    if(d.success) renderFields(rowId,d.fields,saved);
    else snack(d.error||'Строка не найдена');
  }catch(e){snack(e.message)}
  finally{hideLoad(); save()}
}

async function loadFltFields(blockId,rowId,saved=null){
  const fn=$(`fn-${blockId}`)?.value;
  if(!fn)return;
  showLoad('Загрузка полей…');
  try{
    const d=await fetchJson(`${CSV}/bool_row`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:fn})},'CSV boolean row');
    if(d.success) renderFields(rowId,d.fields,saved);
    else snack(d.error||'Boolean поля не найдены');
  }catch(e){snack(e.message)}
  finally{hideLoad(); save()}
}

function renderFields(rowId,fields,saved=null){
  const cont=$(`fl-${rowId}`);
  if(!fields?.length){
    const empty=document.createElement('div');
    empty.className='empty-hint';
    empty.textContent='Нет доступных полей';
    cont.replaceChildren(empty);
    return;
  }
  const frag=document.createDocumentFragment();
  fields.forEach(f=>{
    const changed=saved&&Object.prototype.hasOwnProperty.call(saved,f.name);
    const dv=changed?saved[f.name]:f.value;
    const isChanged=changed&&String(dv)!==String(f.value);
    const tp=String(f.type).toLowerCase();
    let ctrl;
    if(tp==='boolean'){
      ctrl=`<select data-type="boolean" onchange="App.markChg(this)">
        <option value="TRUE"  ${String(dv).toUpperCase()==='TRUE'?'selected':''}>TRUE</option>
        <option value="FALSE" ${String(dv).toUpperCase()!=='TRUE'?'selected':''}>FALSE</option>
      </select>`;
    } else {
      ctrl=`<input type="${tp==='int'||tp==='integer'?'number':'text'}"
                   value="${a(String(dv))}" data-type="${tp}"
                   oninput="App.markChg(this)">`;
    }
    const item=document.createElement('div');
    item.className='field-item'+(isChanged?' changed':'');
    item.dataset.fn=f.name; item.dataset.orig=String(f.value ?? '');
    item.innerHTML=`<span class="fname" title="${a(f.name)}">${h(f.name)}</span>${ctrl}`;
    frag.appendChild(item);
  });
  cont.replaceChildren(frag);
}

function markChg(el){
  const item=el.closest('.field-item');
  item.classList.toggle('changed',String(el.value)!==String(item.dataset.orig));
  save();
}

/* ── UUID ────────────────────────────────────────────── */
function genUUID(){
  $('uuid').value='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);
  }); save();
}

/* ── Features ───────────────────────────────────────── */
function addFeat(rid=null,rd=null){
  const id=rid||uid();
  const d=rd||{};
  const enabled=d['@enabled']!==false;
  const el=document.createElement('div');
  el.className='feat-block'; el.id=`fb-${id}`;
  el.innerHTML=`
    <div class="feat-header">
      <span class="feat-badge" id="fbdg-${id}">${h(rid||'MyFeature')}</span>
      <button class="btn-icon row-remove" onclick="App.rmFeat('${id}')" title="Удалить фичу">
        <span class="material-symbols-rounded icon-danger">delete</span>
      </button>
    </div>
    <div class="field">
      <label>ID фичи</label>
      <input type="text" id="fid-${id}" value="${a(rid||'MyFeature')}"
             oninput="App.updFBadge('${id}');App.save()">
    </div>
    <div class="field">
      <label>@name (RU)</label>
      <input type="text" id="fnru-${id}" value="${a(typeof d['@name']==='object'?d['@name']?.RU||'':d['@name']||'')}"
             placeholder="Название фичи" oninput="App.save()">
    </div>
    <div class="field">
      <label>@name (EN)</label>
      <input type="text" id="fnen-${id}" value="${a(d['@name']?.EN||'')}" placeholder="Feature name" oninput="App.save()">
    </div>
    <div class="field">
      <label>@description (RU) <small>(необяз.)</small></label>
      <input type="text" id="fdru-${id}" value="${a(typeof d['@description']==='object'?d['@description']?.RU||'':d['@description']||'')}" oninput="App.save()">
    </div>
    <div class="field">
      <label>@description (EN)</label>
      <input type="text" id="fden-${id}" value="${a(d['@description']?.EN||'')}" oninput="App.save()">
    </div>
    <div class="field">
      <label>@patches <small>(путь, необяз.)</small></label>
      <input type="text" id="fptch-${id}" value="${a(d['@patches']||'')}" placeholder="json/mods/feat.json" oninput="App.save()">
    </div>
    <div class="field">
      <label>@root <small>(папка файлов)</small></label>
      <input type="text" id="froot-${id}" value="${a(d['@root']||'')}" placeholder="files/myFeature" oninput="App.save()">
    </div>
    <div class="field-row-wrap">
      <div class="field">
        <label>@priority</label>
        <input type="number" id="fprio-${id}" value="${d['@priority']||0}" oninput="App.save()">
      </div>
    </div>
    <div class="field">
      <label>@conflicts <small>(ID через Enter)</small></label>
      <div class="tags-wrap" id="fconf-${id}" onclick="this.querySelector('input').focus()">
        ${(d['@conflicts']||[]).map(c=>`<span class="tag-pill" data-value="${a(c)}"><span>${h(c)}</span><button type="button" class="tag-remove" onclick="this.closest('.tag-pill').remove();App.save()">${ico('close')}</button></span>`).join('')}
        <input type="text" placeholder="featureId…" onkeydown="App.addConf(event,'${id}')">
      </div>
    </div>
    <div class="switch-row">
      <label>@enabled (по умолчанию включена)</label>
      <label class="md-switch">
        <input type="checkbox" id="fen-${id}" ${enabled?'checked':''} onchange="App.save()">
        <div class="md-track"><div class="md-thumb"></div></div>
      </label>
    </div>`;
  $('feats-list').appendChild(el);
}
function rmFeat(id){$(`fb-${id}`)?.remove();save()}
function updFBadge(id){const v=$(`fid-${id}`)?.value;if(v)$(`fbdg-${id}`).textContent=v}
function addConf(e,id){
  if(e.key!=='Enter'&&e.key!==',')return; e.preventDefault();
  const inp=e.target,v=inp.value.trim(); if(!v)return;
  const pill=document.createElement('span'); pill.className='tag-pill';
  pill.dataset.value=v;
  pill.innerHTML=`<span>${h(v)}</span><button type="button" class="tag-remove" onclick="this.closest('.tag-pill').remove();App.save()">${ico('close')}</button>`;
  inp.before(pill); inp.value=''; save();
}

/* ── Feature Groups ─────────────────────────────────── */
function addGroup(rid=null,rd=null){
  const id=rid||uid();
  const d=rd||{};
  const type=d['@type']||'DEFAULT';
  const el=document.createElement('div');
  el.className='grp-block'; el.id=`gb-${id}`;
  el.innerHTML=`
    <div class="feat-header">
      <span class="feat-badge" id="gbdg-${id}">${h(rid||'group1')}</span>
      <button class="btn-icon row-remove" onclick="App.rmGroup('${id}')" title="Удалить группу">
        <span class="material-symbols-rounded icon-danger">delete</span>
      </button>
    </div>
    <div class="field"><label>ID группы</label>
      <input type="text" id="gid-${id}" value="${a(rid||'group1')}"
             oninput="App.updGBadge('${id}');App.save()"></div>
    <div class="field"><label>@name (RU)</label>
      <input type="text" id="gnru-${id}" value="${a(typeof d['@name']==='object'?d['@name']?.RU||'':d['@name']||'')}" oninput="App.save()"></div>
    <div class="field"><label>@name (EN)</label>
      <input type="text" id="gnen-${id}" value="${a(d['@name']?.EN||'')}" oninput="App.save()"></div>
    <div class="field"><label>@description (RU) <small>(необяз.)</small></label>
      <input type="text" id="gdru-${id}" value="${a(typeof d['@description']==='object'?d['@description']?.RU||'':d['@description']||'')}" oninput="App.save()"></div>
    <div class="field"><label>@description (EN)</label>
      <input type="text" id="gden-${id}" value="${a(d['@description']?.EN||'')}" oninput="App.save()"></div>
    <div class="field"><label>@type</label>
      <select id="gtyp-${id}" onchange="App.save()">
        <option value="DEFAULT"     ${type==='DEFAULT'?'selected':''}>DEFAULT (множественный выбор)</option>
        <option value="RADIO_GROUP" ${type==='RADIO_GROUP'?'selected':''}>RADIO_GROUP (один выбор)</option>
      </select></div>
    <div class="field"><label>@features <small>(ID через запятую)</small></label>
      <input type="text" id="gfts-${id}" value="${a((d['@features']||[]).join(', '))}"
             placeholder="MyFeature, MyFeature2" oninput="App.save()"></div>`;
  $('groups-list').appendChild(el);
}
function rmGroup(id){$(`gb-${id}`)?.remove();save()}
function updGBadge(id){const v=$(`gid-${id}`)?.value;if(v)$(`gbdg-${id}`).textContent=v}

/* ── Collect form data ──────────────────────────────── */
function collect(){
  const meta={
    title_ru:$('title_ru').value, title_en:$('title_en').value,
    desc_ru:$('desc_ru').value,   desc_en:$('desc_en').value,
    author:$('author').value,     version:$('version').value||'1.0.0',
    gv:parseInt($('gv').value||'65',10)||65,
    uuid:$('uuid').value,         spec:$('spec').value,
    patches_path:$('patches_path').value,
  };

  // CSV patches
  const patches=[];
  document.querySelectorAll('.patch-block').forEach(pb=>{
    const bid=pb.id.replace('pb-','');
    const fn=$(`fn-${bid}`)?.value; if(!fn)return;
    const rows=[];
    pb.querySelectorAll('.row-entry').forEach(re=>{
      const rid=re.id.replace('re-','');
      const isFlt=!$(`rflt-${rid}`)?.classList.contains('is-hidden');
      let key;
      if(isFlt){const c=$(`fsel-${rid}`)?.value; key=c?`[${c}]`:null}
      else key=$(`ksel-${rid}`)?.value;
      if(!key)return;
      const changes={};
      re.querySelectorAll('.field-item.changed').forEach(fi=>{
        const nm=fi.dataset.fn;
        const inp=fi.querySelector('input,select'); if(!nm||!inp)return;
        const tp=inp.dataset.type;
        let v=inp.value;
        if(tp==='boolean') v=String(v).toUpperCase()==='TRUE';
        else if(tp==='int'||tp==='integer') v=v===''?null:parseInt(v,10);
        changes[nm]=v;
      });
      if(Object.keys(changes).length) rows.push({key,changes});
    });
    if(rows.length) patches.push({filename:fn,rows});
  });

  // Features
  const features={};
  document.querySelectorAll('.feat-block').forEach(fb=>{
    const id=fb.id.replace('fb-','');
    const key=$(`fid-${id}`)?.value?.trim(); if(!key)return;
    const nru=$(`fnru-${id}`)?.value, nen=$(`fnen-${id}`)?.value;
    const dru=$(`fdru-${id}`)?.value, den=$(`fden-${id}`)?.value;
    const feat={};
    if(nru||nen) feat['@name']=nen?{RU:nru,EN:nen}:nru;
    if(dru||den) feat['@description']=den?{RU:dru,EN:den}:dru;
    const ptch=$(`fptch-${id}`)?.value; if(ptch) feat['@patches']=ptch;
    const root=$(`froot-${id}`)?.value; if(root) feat['@root']=root;
    const prio=parseInt($(`fprio-${id}`)?.value||'0',10); if(prio) feat['@priority']=prio;
    const enb=$(`fen-${id}`)?.checked; if(!enb) feat['@enabled']=false;
    const pills=[...(document.querySelectorAll(`#fconf-${id} .tag-pill`)||[])];
    if(pills.length) feat['@conflicts']=pills.map(p=>p.dataset.value||p.querySelector('span')?.textContent.trim()).filter(Boolean);
    features[key]=feat;
  });

  // Groups
  const feature_groups={};
  document.querySelectorAll('.grp-block').forEach(gb=>{
    const id=gb.id.replace('gb-','');
    const key=$(`gid-${id}`)?.value?.trim(); if(!key)return;
    const nru=$(`gnru-${id}`)?.value, nen=$(`gnen-${id}`)?.value;
    const dru=$(`gdru-${id}`)?.value, den=$(`gden-${id}`)?.value;
    const type=$(`gtyp-${id}`)?.value||'DEFAULT';
    const fstr=$(`gfts-${id}`)?.value||'';
    const grp={};
    if(nru||nen) grp['@name']=nen?{RU:nru,EN:nen}:nru;
    if(dru||den) grp['@description']=den?{RU:dru,EN:den}:dru;
    grp['@type']=type;
    const fts=fstr.split(',').map(s=>s.trim()).filter(Boolean);
    if(fts.length) grp['@features']=fts;
    feature_groups[key]=grp;
  });

  return{...meta,patches,features,feature_groups};
}

/* ── Build JSON ─────────────────────────────────────── */
function buildJson(d){
  const o={};
  if(d.title_ru||d.title_en) o['@title']=d.title_en?{RU:d.title_ru,EN:d.title_en}:d.title_ru;
  if(d.desc_ru||d.desc_en)   o['@description']=d.desc_en?{RU:d.desc_ru,EN:d.desc_en}:d.desc_ru;
  o['@version']=d.version||'1.0.0';
  o['@author']=d.author||'User';
  o['@gv']=parseInt(d.gv||65,10)||65;
  if(d.spec!=='')    o['@spec']=parseInt(d.spec,10)||0;
  const patchFiles=parseList(d.patches_path);
  if(patchFiles.length) o['@patches']=patchFiles;
  if(Object.keys(d.features||{}).length)        o['@features']=d.features;
  if(Object.keys(d.feature_groups||{}).length)  o['@feature_groups']=d.feature_groups;
  (d.patches||[]).forEach(b=>{
    const k=b.filename.replace('.csv','');
    if(!o[k])o[k]={};
    (b.rows||[]).forEach(r=>{if(r.key&&Object.keys(r.changes||{}).length)o[k][r.key]=r.changes});
  });
  return o;
}

/* ── Generate ───────────────────────────────────────── */
async function generate(){
  try{
    const json=buildJson(collect());
    const str=JSON.stringify(json,null,2);
    $('json-out').textContent=str; $('json-out').classList.add('show');
    lastFail=str;
    const vd=await fetchJson(`${PHP}?action=validate`,{method:'POST',headers:{'Content-Type':'text/plain'},body:str},'Валидация');
    if(!vd.success){
      showErr(vd.report||'JSON не прошел валидацию', true);
      return;
    }
    setDownload(str);
    fetchJson(`${PHP}?action=stage`,{method:'POST',headers:{'Content-Type':'application/json'},body:str},'Сборка').catch(()=>{});
    snack('content.json собран!','Скачать',downloadJson);
    $('json-out').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){
    snack(e.message||'Ошибка сборки');
  }
}

/* ── Import JSON ────────────────────────────────────── */
async function importJson(inp){
  const file=inp.files[0]; if(!file)return;
  showLoad('Чтение файла…');
  try{
    const txt=await file.text();
    lastFail=txt;
    showLoad('Валидация…');
    const vr=await fetch(`${PHP}?action=validate`,{method:'POST',headers:{'Content-Type':'text/plain'},body:txt});
    const vd=await vr.json();
    if(!vd.success){hideLoad();inp.value='';showErr(vd.report,true);return}
    await processJson(txt);
    inp.value=''; snack('JSON загружен');
  }catch(e){snack('Ошибка: '+e.message)}
  finally{hideLoad()}
}

async function processJson(txt){
  restoring=true;
  try{
    const j=JSON.parse(txt);
    const sv=(id,v)=>{if(v!==undefined&&v!==null)$(id).value=v};
    const tl=j['@title']; if(typeof tl==='object'){sv('title_ru',tl.RU);sv('title_en',tl.EN)}else if(tl)sv('title_en',tl);
    const ds=j['@description']; if(typeof ds==='object'){sv('desc_ru',ds.RU);sv('desc_en',ds.EN)}else if(ds)sv('desc_en',ds);
  sv('author',j['@author']); sv('version',j['@version']); sv('gv',j['@gv']);
  sv('uuid',j['@uuid']); sv('spec',j['@spec']); sv('patches_path',j['@patches']);
    $('patches').innerHTML=''; $('feats-list').innerHTML=''; $('groups-list').innerHTML='';

    showLoad('Загрузка патчей…');
    for(const[k,rows] of Object.entries(j)){
      if(k.startsWith('@')||k==='$schema'||typeof rows!=='object'||rows===null)continue;
      const bid=uid();
      $('patches').insertAdjacentHTML('beforeend',
        `<div class="patch-block" id="pb-${bid}">
          <div class="patch-header">
            <span class="material-symbols-rounded patch-leading">table_chart</span>
            <span class="patch-title" id="pt-${bid}">${h(k)}</span>
            <button class="btn-icon" onclick="App.rmPatch('${bid}')">
              <span class="material-symbols-rounded icon-danger">delete</span>
            </button>
          </div>
          <div class="patch-body">
            <div class="field"><label>CSV файл</label>
              <div class="search-wrap">
                <input type="text" id="fs-${bid}" value="${a(k)}"
                       oninput="App.srchCsv(this,'${bid}')" onfocus="App.srchCsv(this,'${bid}')" autocomplete="off">
                <input type="hidden" id="fn-${bid}" value="${a(k+'.csv')}">
              </div>
            </div>
            <div id="rows-${bid}"></div>
            <button class="btn btn-outlined btn-block btn-sm mt-10" id="addrow-${bid}" onclick="App.addRow('${bid}')">
              <span class="material-symbols-rounded">add</span>Добавить строку
            </button>
          </div>
        </div>`);
      for(const[rk,changes] of Object.entries(rows)) await addRow(bid,{key:rk,changes});
    }
    if(j['@features']) for(const[fid,fd] of Object.entries(j['@features'])){addFeat(fid,fd)}
    if(j['@feature_groups']) for(const[gid,gd] of Object.entries(j['@feature_groups'])){addGroup(gid,gd)}
    if(Object.keys(j['@features']||{}).length) $('feats-section').classList.add('open');
    if(Object.keys(j['@feature_groups']||{}).length) $('groups-section').classList.add('open');
  }finally{
    restoring=false;
    hideLoad();
    save();
  }
}

async function autoFix(){
  if(!lastFail)return;
  showLoad('Auto Fix…');
  try{
    const r=await fetch(`${CSV}/fix`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({json_content:lastFail})});
    const d=await r.json();
    hideLoad();
    if(!d.success){snack('Не удалось починить: '+d.message);return}
    closeError(); await processJson(JSON.stringify(d.fixed_json));
    snack('Исправлено и загружено!');
  }catch(e){hideLoad();snack('Ошибка: '+e.message)}
}

/* ── Populate from history ──────────────────────────── */
async function populate(d){
  restoring=true;
  try{
    ['title_ru','title_en','desc_ru','desc_en','author','version','gv','uuid','spec','patches_path'].forEach(k=>{
      const el=$(k); if(el) el.value=d[k]||'';
    });
    if(!$('author').value) $('author').value='User';
    if(!$('version').value) $('version').value='1.0.0';
    if(!$('gv').value) $('gv').value='65';
    $('patches').innerHTML=''; $('feats-list').innerHTML=''; $('groups-list').innerHTML='';
    showLoad('Восстановление…');
    for(const p of (d.patches||[])) await addPatch(p);
    for(const [fi,fd] of Object.entries(d.features||{})) addFeat(fi,fd);
    for(const [gi,gd] of Object.entries(d.feature_groups||{})) addGroup(gi,gd);
  }finally{
    restoring=false;
    hideLoad();
  }
}

/* ── Init ───────────────────────────────────────────── */
async function init(){
  await loadCsvList();
  initRichMenus();
}
document.addEventListener('DOMContentLoaded', init);

/* ── Public API ─────────────────────────────────────── */
return{
  openDrawer,closeDrawer,toggleSection,
  confirmNew,newProj,loadProj,confirmDel,
  addPatch,rmPatch,srchCsv,pickCsv,
  addRow,rmRow,setMode,filterKeys,loadFields,loadFltFields,markChg,
  addFeat,rmFeat,updFBadge,addConf,
  addGroup,rmGroup,updGBadge,
  generate,importJson,autoFix,downloadJson,
  genUUID,save,
  closeDlg,closeError,copyError,snack,
};
})();
