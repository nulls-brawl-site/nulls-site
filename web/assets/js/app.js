/* ═══════════════════════════════════════════════════════════════
   Null's Brawl Mod Builder — app.js
   ═══════════════════════════════════════════════════════════════ */

const App = (() => {
'use strict';

// ── State ────────────────────────────────────────────────────────
let currentProjectId = null;
let autosaveTimer    = null;
let lastFailedJson   = '';
let csvFilesCache    = null;   // [{name,size}]
let keysCache        = {};     // filename → {keys, bool_cols}
let snackTimer       = null;

// ── Constants ────────────────────────────────────────────────────
const CSV_API  = '/api/csv';
const PHP_API  = '/api.php';
const COLORS   = ['#e53935','#e65100','#f9a825','#2e7d32','#0277bd','#4527a0','#ad1457'];
const HTML_TAGS = [
  {l:'Жирный',    t:'b',          c:'<b>'},
  {l:'Курсив',    t:'i',          c:'<i>'},
  {l:'Подчёркнут',t:'u',          c:'<u>'},
  {l:'Зачёркнут', t:'s',          c:'<s>'},
  {l:'Большой',   t:'big',        c:'<big>'},
  {l:'Маленький', t:'small',      c:'<small>'},
  {l:'Верх.инд',  t:'sup',        c:'<sup>'},
  {l:'Ниж.инд',   t:'sub',        c:'<sub>'},
  {l:'Монофонт',  t:'tt',         c:'<tt>'},
  {l:'Параграф',  t:'p',          c:'<p>'},
  {l:'Перенос',   t:'br',         c:'<br>',  single:true},
  {l:'Span',      t:'span',       c:'<span>'},
  {l:'Ссылка',    action:'link',  c:'<a href>'},
  {l:'H1',        t:'h1',         c:'<h1>'},
  {l:'H2',        t:'h2',         c:'<h2>'},
];

// ── Utility ──────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function genUUID() {
  const u = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0;
    return (c==='x' ? r : (r&0x3|0x8)).toString(16);
  });
  document.getElementById('uuid').value = u;
  scheduleAutosave();
}

function ripple(e, el) {
  const r   = el.getBoundingClientRect();
  const sz  = Math.max(el.offsetWidth, el.offsetHeight) * 2;
  const w   = document.createElement('span');
  w.className = 'ripple-wave';
  w.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX-r.left-sz/2}px;top:${e.clientY-r.top-sz/2}px`;
  el.classList.add('ripple-container');
  el.appendChild(w);
  w.addEventListener('animationend', () => w.remove());
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.btn,.btn-icon,.fab,.chip,.tag-btn,.search-item,.history-item');
  if (btn) ripple(e, btn);
});

// ── Loading ──────────────────────────────────────────────────────
function showLoading(text='Загрузка…', sub='') {
  const el = document.getElementById('loading');
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-sub').textContent  = sub;
  el.classList.add('show');
}
function hideLoading() { document.getElementById('loading').classList.remove('show'); }

// ── Snackbar ─────────────────────────────────────────────────────
function snack(msg, actionLabel='', actionFn=null, ms=3500) {
  clearTimeout(snackTimer);
  const el   = document.getElementById('snackbar');
  const act  = document.getElementById('snack-action');
  document.getElementById('snack-text').textContent = msg;
  if (actionLabel && actionFn) {
    act.textContent = actionLabel;
    act.onclick = actionFn;
    act.style.display = 'block';
  } else { act.style.display = 'none'; }
  el.classList.add('show');
  snackTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ── Dialog ───────────────────────────────────────────────────────
function dialog(title, body, buttons) {
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-body').innerHTML    = body;
  const act = document.getElementById('dialog-actions');
  act.innerHTML = '';
  buttons.forEach(({label, cls, fn}) => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.onclick = () => { closeDialog(); if(fn) fn(); };
    act.appendChild(b);
  });
  document.getElementById('dialog-backdrop').classList.add('open');
}
function closeDialog(e) {
  if (e && e.target !== document.getElementById('dialog-backdrop')) return;
  document.getElementById('dialog-backdrop').classList.remove('open');
}

// ── Error dialog ─────────────────────────────────────────────────
function showError(report, showFix=false) {
  document.getElementById('err-console').textContent = report;
  document.getElementById('btn-autofix').style.display = showFix ? 'inline-flex' : 'none';
  document.getElementById('err-backdrop').classList.add('open');
}
function closeError() { document.getElementById('err-backdrop').classList.remove('open'); }
function copyError() {
  navigator.clipboard.writeText(document.getElementById('err-console').textContent)
    .then(() => snack('Скопировано!'));
}

// ── Auto-save ────────────────────────────────────────────────────
function scheduleAutosave() {
  const badge = document.getElementById('save-badge');
  badge.textContent = 'Сохранение…'; badge.classList.add('show');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(doAutosave, 1200);
}
async function doAutosave() {
  try {
    const data    = collectData();
    data.id       = currentProjectId;
    const res     = await fetch(`${PHP_API}?action=save`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
    const json    = await res.json();
    if (json.success) {
      currentProjectId = json.id;
      const badge = document.getElementById('save-badge');
      badge.textContent = 'Сохранено';
      setTimeout(() => badge.classList.remove('show'), 2000);
    }
  } catch(_) {}
}

// ── CSV file list ────────────────────────────────────────────────
async function ensureCsvList() {
  if (csvFilesCache) return csvFilesCache;
  // PHP lists files directly
  const res  = await fetch(`${PHP_API}?action=csv_list`);
  if (res.ok) {
    csvFilesCache = await res.json();
  } else {
    // Fallback: ask Python service (it knows the dir)
    csvFilesCache = [];
  }
  return csvFilesCache;
}

// Actually we'll use a inline list endpoint in PHP — but PHP api.php doesn't have it yet.
// We'll fetch the list via a dedicated endpoint. Let's use PHP to list files:
async function getCsvList() {
  if (csvFilesCache) return csvFilesCache;
  const r = await fetch(`${PHP_API}?action=csv_list`);
  csvFilesCache = r.ok ? await r.json() : [];
  return csvFilesCache;
}

// ── History ───────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const r    = await fetch(`${PHP_API}?action=history`);
    const data = await r.json();
    const list = document.getElementById('history-list');
    if (!data.length) {
      list.innerHTML = '<div class="history-empty">Нет сохранённых проектов</div>';
      return;
    }
    list.innerHTML = '';
    data.forEach(item => {
      const el  = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="history-title">${escHtml(item.title)}</div>
        <div class="history-date">${item.date}</div>
        <div class="history-btns">
          <button class="btn btn-tonal btn-sm" onclick="App.loadProject('${item.id}')">
            <span class="material-symbols-rounded">folder_open</span>Загрузить
          </button>
          <button class="btn btn-danger btn-sm" onclick="App.confirmDeleteProject('${item.id}')">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>`;
      list.appendChild(el);
    });
  } catch(e) { console.error(e); }
}

async function loadProject(id) {
  showLoading('Загрузка проекта…');
  try {
    const r = await fetch(`${PHP_API}?action=load&id=${id}`);
    const d = await r.json();
    if (!d.success) { snack('Ошибка загрузки'); return; }
    currentProjectId = id;
    await populateForm(d.data);
    closeDrawer();
    snack('Проект загружен');
  } catch(e) { snack('Ошибка: ' + e.message); }
  finally { hideLoading(); }
}

function confirmDeleteProject(id) {
  dialog('Удалить проект?', 'Это действие нельзя отменить.', [
    {label:'Отмена',  cls:'btn-outlined'},
    {label:'Удалить', cls:'btn-danger', fn:() => deleteProject(id)}
  ]);
}
async function deleteProject(id) {
  await fetch(`${PHP_API}?action=delete`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})});
  if (currentProjectId === id) { currentProjectId = null; }
  loadHistory();
  snack('Проект удалён');
}

function confirmNewProject() {
  dialog('Новый проект', 'Несохранённые изменения будут потеряны.', [
    {label:'Отмена',    cls:'btn-outlined'},
    {label:'Создать',   cls:'btn-filled', fn: newProject}
  ]);
}
function newProject() {
  currentProjectId = null;
  document.getElementById('title_ru').value = '';
  document.getElementById('title_en').value = '';
  document.getElementById('desc_ru').value  = '';
  document.getElementById('desc_en').value  = '';
  document.getElementById('author').value   = 'User';
  document.getElementById('version').value  = '1.0.0';
  document.getElementById('uuid').value     = '';
  document.getElementById('spec').value     = '';
  document.getElementById('patches-path').value = '';
  document.getElementById('patches-container').innerHTML  = '';
  document.getElementById('features-container').innerHTML = '';
  document.getElementById('groups-container').innerHTML   = '';
  document.getElementById('json-output').classList.remove('visible');
  document.getElementById('json-output').textContent = '';
  document.getElementById('dl-btn').style.display = 'none';
  closeDrawer();
  snack('Новый проект');
}

// ── Drawer ───────────────────────────────────────────────────────
function openDrawer() {
  document.getElementById('nav-drawer').classList.add('open');
  document.getElementById('scrim').classList.add('visible');
  loadHistory();
}
function closeDrawer() {
  document.getElementById('nav-drawer').classList.remove('open');
  document.getElementById('scrim').classList.remove('visible');
}

// ── Collapsible sections ─────────────────────────────────────────
function toggleSection(id) {
  document.getElementById(id).classList.toggle('expanded');
}

// ── Rich HTML tag menus ──────────────────────────────────────────
function initRichMenus() {
  document.querySelectorAll('.rich-toggle').forEach(toggle => {
    const targetId = toggle.dataset.target;
    const input    = document.getElementById(targetId);
    const menu     = toggle.nextElementSibling; // .html-menu
    if (!menu) return;

    // Build menu content
    const strip = document.createElement('div');
    strip.className = 'color-strip';
    COLORS.forEach(color => {
      const d = document.createElement('div');
      d.className = 'color-dot';
      d.style.background = color;
      d.onmousedown = e => { e.preventDefault(); insertTag(input, 'font', `color='${color}'`); };
      strip.appendChild(d);
    });
    const grid = document.createElement('div');
    grid.className = 'tag-grid';
    HTML_TAGS.forEach(item => {
      const b = document.createElement('div');
      b.className = 'tag-btn';
      b.innerHTML = `<span>${item.l}</span><span class="tag-code">${item.c}</span>`;
      b.onmousedown = e => {
        e.preventDefault();
        if (item.action === 'link') insertLink(input);
        else insertTag(input, item.t, '', item.single);
      };
      grid.appendChild(b);
    });
    menu.appendChild(strip);
    menu.appendChild(grid);

    toggle.onclick = () => {
      const open = menu.classList.toggle('open');
      toggle.textContent = open ? '▴' : '▾';
    };
    document.addEventListener('click', e => {
      if (!toggle.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.remove('open');
        toggle.textContent = '▾';
      }
    }, true);
  });
}

function insertTag(input, tag, attrs='', single=false) {
  const s   = input.selectionStart, en = input.selectionEnd;
  const val = input.value;
  const open = `<${tag}${attrs ? ' '+attrs : ''}>`;
  const close= single ? '' : `</${tag}>`;
  const sel  = val.substring(s, en);
  input.value = val.substring(0,s) + open + sel + close + val.substring(en);
  const cur   = s + open.length + (single ? 0 : sel.length);
  input.setSelectionRange(cur, cur);
  input.focus();
  scheduleAutosave();
}
function insertLink(input) {
  const s = input.selectionStart, en = input.selectionEnd;
  const v = input.value;
  const open = `<a href=''>`, close = `</a>`;
  const sel  = v.substring(s, en);
  input.value = v.substring(0,s) + open + sel + close + v.substring(en);
  input.setSelectionRange(s+8, s+8);
  input.focus();
  scheduleAutosave();
}

// ── CSV patch blocks ─────────────────────────────────────────────
function addPatchBlock(restoreData=null) {
  const id  = uid();
  const el  = document.createElement('div');
  el.className = 'patch-block';
  el.id = `pb-${id}`;
  el.innerHTML = `
    <div class="patch-block-header">
      <span class="material-symbols-rounded" style="color:var(--md-on-primary-cont)">table_chart</span>
      <span class="patch-block-title" id="pbt-${id}">Выберите CSV файл…</span>
      <button class="btn-icon" onclick="App.removePatchBlock('${id}')" title="Удалить">
        <span class="material-symbols-rounded" style="color:var(--md-error)">delete</span>
      </button>
    </div>
    <div class="patch-block-body">
      <div class="field">
        <label>CSV файл</label>
        <div class="search-wrap">
          <input type="text" id="fs-${id}" placeholder="Искать файл…"
                 oninput="App.searchCsv(this,'${id}')"
                 onfocus="App.searchCsv(this,'${id}')"
                 autocomplete="off">
          <div class="search-results" id="sr-${id}"></div>
          <input type="hidden" id="fn-${id}">
        </div>
      </div>
      <div id="rows-${id}"></div>
      <button class="btn btn-outlined btn-block btn-sm" id="addrow-${id}"
              onclick="App.addRowEntry('${id}')" style="display:none;margin-top:8px">
        <span class="material-symbols-rounded">add</span>Добавить строку
      </button>
    </div>`;
  document.getElementById('patches-container').appendChild(el);

  // Hide search results on outside click
  document.addEventListener('click', e => {
    if (!el.contains(e.target)) document.getElementById(`sr-${id}`).classList.remove('open');
  });

  if (restoreData) {
    document.getElementById(`fs-${id}`).value = restoreData.filename.replace('.csv','');
    document.getElementById(`fn-${id}`).value = restoreData.filename;
    document.getElementById(`pbt-${id}`).textContent = restoreData.filename.replace('.csv','');
    document.getElementById(`addrow-${id}`).style.display = 'flex';
    restoreData.rows.forEach(row => addRowEntry(id, row));
  }
  scheduleAutosave();
  return id;
}

function removePatchBlock(id) {
  document.getElementById(`pb-${id}`)?.remove();
  scheduleAutosave();
}

async function searchCsv(inp, id) {
  const q   = inp.value.toLowerCase();
  const res = document.getElementById(`sr-${id}`);
  // Load file list
  if (!csvFilesCache) {
    const r = await fetch(`${PHP_API}?action=csv_list`);
    csvFilesCache = r.ok ? await r.json() : [];
  }
  const matches = q ? csvFilesCache.filter(f => f.name.toLowerCase().includes(q)) : csvFilesCache;
  if (!matches.length) {
    res.innerHTML = '<div class="search-item disabled">Ничего не найдено</div>';
  } else {
    res.innerHTML = matches.slice(0,80).map(f => {
      const name = f.name.replace('.csv','');
      const big  = f.size > 5*1024*1024;
      return `<div class="search-item${big?' disabled':''}"
                   title="${name}"
                   onmousedown="App.selectCsvFile('${f.name}','${id}')">${name}${big?' <small>(>5MB)</small>':''}</div>`;
    }).join('');
  }
  // Position dropdown using getBoundingClientRect (fixed positioning)
  const rect = inp.getBoundingClientRect();
  res.style.top   = (rect.bottom + 2) + 'px';
  res.style.left  = rect.left + 'px';
  res.style.width = rect.width + 'px';
  res.classList.add('open');
}

async function selectCsvFile(filename, blockId) {
  document.getElementById(`fs-${blockId}`).value = filename.replace('.csv','');
  document.getElementById(`fn-${blockId}`).value = filename;
  document.getElementById(`pbt-${blockId}`).textContent = filename.replace('.csv','');
  document.getElementById(`sr-${blockId}`).classList.remove('open');
  document.getElementById(`addrow-${blockId}`).style.display = 'flex';
  // Remove existing rows
  document.getElementById(`rows-${blockId}`).innerHTML = '';
  // Auto-add first row
  await addRowEntry(blockId);
  scheduleAutosave();
}

// ── Row entries inside patch block ──────────────────────────────
async function addRowEntry(blockId, restoreRow=null) {
  const filename = document.getElementById(`fn-${blockId}`)?.value;
  if (!filename) return;

  const rowId = uid();
  const el    = document.createElement('div');
  el.className = 'row-entry';
  el.id = `re-${rowId}`;

  // Get cached keys
  let info = keysCache[filename];
  if (!info) {
    showLoading('Загрузка строк…');
    try {
      const r = await fetch(`${CSV_API}/keys`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename})});
      info = await r.json();
      if (info.success) keysCache[filename] = info;
    } catch(e) {}
    hideLoading();
  }
  const keys     = info?.keys     || [];
  const boolCols = info?.bool_cols || [];

  const rowNum = document.querySelectorAll(`#rows-${blockId} .row-entry`).length + 1;

  el.innerHTML = `
    <div class="row-entry-header">
      <span class="row-num">${rowNum}</span>
      <button class="btn-icon" style="margin-left:auto" onclick="App.removeRowEntry('${rowId}','${blockId}')" title="Удалить строку">
        <span class="material-symbols-rounded" style="font-size:18px;color:var(--md-error)">remove_circle</span>
      </button>
    </div>
    <div class="filter-chips" id="chips-${rowId}">
      <div class="chip active" data-mode="row" onclick="App.setRowMode('${rowId}','row','${blockId}')">
        <span class="material-symbols-rounded">tag</span>Строка
      </div>
      ${boolCols.length ? `<div class="chip" data-mode="filter" onclick="App.setRowMode('${rowId}','filter','${blockId}')">
        <span class="material-symbols-rounded">filter_alt</span>Boolean фильтр
      </div>` : ''}
    </div>
    <div id="row-selector-${rowId}">
      <div class="field" id="row-normal-${rowId}">
        <input type="text" id="key-search-${rowId}" placeholder="Поиск строки…"
               oninput="App.filterKeys('${rowId}')" autocomplete="off">
        <select id="key-select-${rowId}" size="4" style="margin-top:4px"
                onchange="App.loadRowData('${blockId}','${rowId}')">
          ${keys.map(k => `<option value="${escAttr(k)}">${escHtml(k)}</option>`).join('')}
        </select>
        <input type="hidden" id="key-allkeys-${rowId}" value="${escAttr(JSON.stringify(keys))}">
      </div>
      <div class="field" id="row-filter-${rowId}" style="display:none">
        <label>Булевый столбец</label>
        <select id="filter-select-${rowId}" onchange="App.loadBoolRowData('${blockId}','${rowId}')">
          ${boolCols.map(c => `<option value="${escAttr(c)}">${escHtml(c)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="fields-list" id="fields-${rowId}" style="margin-top:10px">
      <div style="color:var(--md-on-surf-var);font-size:13px;padding:4px">Выберите строку…</div>
    </div>`;

  document.getElementById(`rows-${blockId}`).appendChild(el);

  if (restoreRow) {
    const key = String(restoreRow.key);
    const isFilter = key.startsWith('[') && key.endsWith(']');
    if (isFilter) {
      const colName = key.slice(1,-1);
      await setRowMode(rowId, 'filter', blockId);
      const sel = document.getElementById(`filter-select-${rowId}`);
      if (sel) sel.value = colName;
      await loadBoolRowData(blockId, rowId, restoreRow.changes);
    } else {
      const sel = document.getElementById(`key-select-${rowId}`);
      if (sel) { sel.value = key; }
      else {
        // Key might not be in list (need to add it)
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = key;
        document.getElementById(`key-select-${rowId}`).appendChild(opt);
        document.getElementById(`key-select-${rowId}`).value = key;
      }
      await loadRowData(blockId, rowId, restoreRow.changes);
    }
  }
}

function removeRowEntry(rowId, blockId) {
  document.getElementById(`re-${rowId}`)?.remove();
  // Renumber
  document.querySelectorAll(`#rows-${blockId} .row-num`).forEach((el,i) => el.textContent = i+1);
  scheduleAutosave();
}

function setRowMode(rowId, mode, blockId) {
  const chips = document.querySelectorAll(`#chips-${rowId} .chip`);
  chips.forEach(c => c.classList.toggle('active', c.dataset.mode === mode));
  document.getElementById(`row-normal-${rowId}`).style.display  = mode==='row'    ? 'block' : 'none';
  document.getElementById(`row-filter-${rowId}`).style.display  = mode==='filter' ? 'block' : 'none';
  if (mode === 'filter') {
    const filename = document.getElementById(`fn-${blockId}`)?.value;
    loadBoolRowData(blockId, rowId);
  } else {
    const sel = document.getElementById(`key-select-${rowId}`);
    if (sel?.value) loadRowData(blockId, rowId);
  }
}

function filterKeys(rowId) {
  const q    = document.getElementById(`key-search-${rowId}`).value.toLowerCase();
  const all  = JSON.parse(document.getElementById(`key-allkeys-${rowId}`).value || '[]');
  const sel  = document.getElementById(`key-select-${rowId}`);
  const cur  = sel.value;
  const filt = all.filter(k => k.toLowerCase().includes(q)).slice(0,100);
  sel.innerHTML = filt.map(k => `<option value="${escAttr(k)}"${k===cur?' selected':''}>${escHtml(k)}</option>`).join('');
}

async function loadRowData(blockId, rowId, savedChanges=null) {
  const filename = document.getElementById(`fn-${blockId}`)?.value;
  const key      = document.getElementById(`key-select-${rowId}`)?.value;
  if (!filename || !key) return;
  showLoading('Загрузка полей…');
  try {
    const r = await fetch(`${CSV_API}/row`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,row_key:key})});
    const d = await r.json();
    if (d.success) renderFields(rowId, d.fields, savedChanges);
  } catch(e) {}
  hideLoading();
  scheduleAutosave();
}

async function loadBoolRowData(blockId, rowId, savedChanges=null) {
  const filename = document.getElementById(`fn-${blockId}`)?.value;
  if (!filename) return;
  showLoading('Загрузка полей…');
  try {
    const r = await fetch(`${CSV_API}/bool_row`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename})});
    const d = await r.json();
    if (d.success) renderFields(rowId, d.fields, savedChanges);
  } catch(e) {}
  hideLoading();
  scheduleAutosave();
}

function renderFields(rowId, fields, savedChanges=null) {
  const cont = document.getElementById(`fields-${rowId}`);
  cont.innerHTML = '';
  fields.forEach(f => {
    const changed = savedChanges && Object.prototype.hasOwnProperty.call(savedChanges, f.name);
    const displayVal = changed ? savedChanges[f.name] : f.value;
    const isChanged  = changed && String(displayVal) !== String(f.value);

    const item = document.createElement('div');
    item.className = 'field-row-item' + (isChanged ? ' changed' : '');
    item.dataset.fieldName = f.name;
    item.dataset.orig      = f.value;

    const type = String(f.type).toLowerCase();
    let ctrl = '';
    if (type === 'boolean') {
      ctrl = `<select data-type="boolean" onchange="App.markChanged(this)">
        <option value="TRUE"  ${String(displayVal).toUpperCase()==='TRUE' ?'selected':''}>TRUE</option>
        <option value="FALSE" ${String(displayVal).toUpperCase()!=='TRUE'?'selected':''}>FALSE</option>
      </select>`;
    } else {
      ctrl = `<input type="${type==='int'||type==='integer'?'number':'text'}"
                     value="${escAttr(String(displayVal))}"
                     data-type="${type}"
                     oninput="App.markChanged(this)">`;
    }
    item.innerHTML = `<span class="field-name">${escHtml(f.name)}</span>${ctrl}`;
    cont.appendChild(item);
  });
}

function markChanged(el) {
  const item = el.closest('.field-row-item');
  const orig = String(item.dataset.orig);
  item.classList.toggle('changed', String(el.value) !== orig);
  scheduleAutosave();
}

// ── Features ─────────────────────────────────────────────────────
function addFeature(restoreId=null, restoreData=null) {
  const id  = restoreId || uid();
  const el  = document.createElement('div');
  el.className = 'feature-block';
  el.id = `feat-${id}`;
  const d = restoreData || {};
  const enabled = d['@enabled'] !== false;

  el.innerHTML = `
    <div class="feature-block-header">
      <span class="feature-id-badge" id="fbadge-${id}">${escHtml(restoreId || 'new_feature')}</span>
      <button class="btn-icon" style="margin-left:auto" onclick="App.removeFeature('${id}')">
        <span class="material-symbols-rounded" style="color:var(--md-error)">delete</span>
      </button>
    </div>
    <div class="field">
      <label>ID фичи (ключ)</label>
      <input type="text" id="fid-${id}" value="${escAttr(restoreId||'MyFeature')}"
             placeholder="MyFeature" oninput="App.updateFeatureBadge('${id}');App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@name (RU)</label>
      <input type="text" id="fname-ru-${id}" value="${escAttr(d['@name']?.RU||d['@name']||'')}"
             placeholder="Название фичи" oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@name (EN)</label>
      <input type="text" id="fname-en-${id}" value="${escAttr(d['@name']?.EN||'')}"
             placeholder="Feature name" oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@description (RU) <span style="color:var(--md-on-surf-var)">(необяз.)</span></label>
      <input type="text" id="fdesc-ru-${id}" value="${escAttr(d['@description']?.RU||d['@description']||'')}"
             placeholder="…" oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@description (EN)</label>
      <input type="text" id="fdesc-en-${id}" value="${escAttr(d['@description']?.EN||'')}"
             placeholder="…" oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@patches <span style="color:var(--md-on-surf-var)">(путь, необяз.)</span></label>
      <input type="text" id="fpatch-${id}" value="${escAttr(d['@patches']||'')}"
             placeholder="json/mods/myFeature.json" oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@root <span style="color:var(--md-on-surf-var)">(папка файлов, необяз.)</span></label>
      <input type="text" id="froot-${id}" value="${escAttr(d['@root']||'')}"
             placeholder="files/myFeature" oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@priority <span style="color:var(--md-on-surf-var)">(число, необяз.)</span></label>
      <input type="number" id="fprio-${id}" value="${d['@priority']||0}"
             oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@conflicts <span style="color:var(--md-on-surf-var)">(ID через Enter)</span></label>
      <div class="tags-input" id="fconflicts-${id}" onclick="this.querySelector('input').focus()">
        ${(d['@conflicts']||[]).map(c=>`<span class="tag-pill">${escHtml(c)}<button onclick="App.removeConflict(this,'${id}')">×</button></span>`).join('')}
        <input type="text" placeholder="featureId…" onkeydown="App.addConflict(event,'${id}')">
      </div>
    </div>
    <div class="switch-row" style="margin-top:8px">
      <label>@enabled (включена по умолчанию)</label>
      <label class="switch">
        <input type="checkbox" id="fenabled-${id}" ${enabled?'checked':''} onchange="App.scheduleAutosave()">
        <div class="switch-track"><div class="switch-thumb"></div></div>
      </label>
    </div>`;
  document.getElementById('features-container').appendChild(el);
}

function removeFeature(id) {
  document.getElementById(`feat-${id}`)?.remove();
  scheduleAutosave();
}
function updateFeatureBadge(id) {
  const val = document.getElementById(`fid-${id}`).value;
  document.getElementById(`fbadge-${id}`).textContent = val || 'feature';
}
function addConflict(e, id) {
  if (e.key !== 'Enter' && e.key !== ',') return;
  e.preventDefault();
  const inp = e.target;
  const val = inp.value.trim();
  if (!val) return;
  const pill = document.createElement('span');
  pill.className = 'tag-pill';
  pill.innerHTML = `${escHtml(val)}<button onclick="App.removeConflict(this,'${id}')">×</button>`;
  inp.before(pill);
  inp.value = '';
  scheduleAutosave();
}
function removeConflict(btn, id) {
  btn.closest('.tag-pill').remove();
  scheduleAutosave();
}

// ── Feature groups ───────────────────────────────────────────────
function addGroup(restoreId=null, restoreData=null) {
  const id = restoreId || uid();
  const el = document.createElement('div');
  el.className = 'group-block';
  el.id = `grp-${id}`;
  const d = restoreData || {};
  const type = d['@type'] || 'DEFAULT';
  const feats = (d['@features'] || []).join(', ');

  el.innerHTML = `
    <div class="feature-block-header">
      <span class="feature-id-badge" id="gbadge-${id}">${escHtml(restoreId||'new_group')}</span>
      <button class="btn-icon" style="margin-left:auto" onclick="App.removeGroup('${id}')">
        <span class="material-symbols-rounded" style="color:var(--md-error)">delete</span>
      </button>
    </div>
    <div class="field">
      <label>ID группы</label>
      <input type="text" id="gid-${id}" value="${escAttr(restoreId||'group1')}"
             oninput="App.updateGroupBadge('${id}');App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@name (RU)</label>
      <input type="text" id="gname-ru-${id}" value="${escAttr(d['@name']?.RU||d['@name']||'')}"
             oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@name (EN)</label>
      <input type="text" id="gname-en-${id}" value="${escAttr(d['@name']?.EN||'')}"
             oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@description (RU) <span style="color:var(--md-on-surf-var)">(необяз.)</span></label>
      <input type="text" id="gdesc-ru-${id}" value="${escAttr(d['@description']?.RU||d['@description']||'')}"
             oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@description (EN)</label>
      <input type="text" id="gdesc-en-${id}" value="${escAttr(d['@description']?.EN||'')}"
             oninput="App.scheduleAutosave()">
    </div>
    <div class="field">
      <label>@type</label>
      <select id="gtype-${id}" onchange="App.scheduleAutosave()">
        <option value="DEFAULT"     ${type==='DEFAULT'?'selected':''}>DEFAULT (множественный выбор)</option>
        <option value="RADIO_GROUP" ${type==='RADIO_GROUP'?'selected':''}>RADIO_GROUP (один выбор)</option>
      </select>
    </div>
    <div class="field">
      <label>@features <span style="color:var(--md-on-surf-var)">(ID через запятую)</span></label>
      <input type="text" id="gfeats-${id}" value="${escAttr(feats)}"
             placeholder="MyFeature, MyFeature2" oninput="App.scheduleAutosave()">
    </div>`;
  document.getElementById('groups-container').appendChild(el);
}
function removeGroup(id) { document.getElementById(`grp-${id}`)?.remove(); scheduleAutosave(); }
function updateGroupBadge(id) {
  document.getElementById(`gbadge-${id}`).textContent = document.getElementById(`gid-${id}`).value || 'group';
}

// ── Collect data from form ───────────────────────────────────────
function collectData() {
  // Meta
  const meta = {
    title_ru:     document.getElementById('title_ru').value,
    title_en:     document.getElementById('title_en').value,
    desc_ru:      document.getElementById('desc_ru').value,
    desc_en:      document.getElementById('desc_en').value,
    author:       document.getElementById('author').value,
    version:      document.getElementById('version').value || '1.0.0',
    uuid:         document.getElementById('uuid').value,
    spec:         document.getElementById('spec').value,
    patches_path: document.getElementById('patches-path').value,
  };

  // CSV patches
  const patches = [];
  document.querySelectorAll('.patch-block').forEach(block => {
    const blockId  = block.id.replace('pb-','');
    const filename = document.getElementById(`fn-${blockId}`)?.value;
    if (!filename) return;
    const rows = [];
    block.querySelectorAll('.row-entry').forEach(re => {
      const rowId = re.id.replace('re-','');
      // Determine key
      const filterActive = document.getElementById(`row-filter-${rowId}`)?.style.display !== 'none';
      let key;
      if (filterActive) {
        const col = document.getElementById(`filter-select-${rowId}`)?.value;
        key = col ? `[${col}]` : null;
      } else {
        key = document.getElementById(`key-select-${rowId}`)?.value;
      }
      if (!key) return;
      // Collect changed fields
      const changes = {};
      re.querySelectorAll('.field-row-item.changed').forEach(item => {
        const name  = item.dataset.fieldName;
        const input = item.querySelector('input,select');
        if (!name || !input) return;
        const type  = input.dataset.type;
        let val     = input.value;
        if (type === 'int' || type === 'integer') val = parseInt(val, 10);
        changes[name] = val;
      });
      if (Object.keys(changes).length) rows.push({key, changes});
    });
    if (rows.length) patches.push({filename, rows});
  });

  // Features
  const features = {};
  document.querySelectorAll('.feature-block').forEach(fb => {
    const id  = fb.id.replace('feat-','');
    const key = document.getElementById(`fid-${id}`)?.value?.trim();
    if (!key) return;
    const nameRu = document.getElementById(`fname-ru-${id}`)?.value;
    const nameEn = document.getElementById(`fname-en-${id}`)?.value;
    const descRu = document.getElementById(`fdesc-ru-${id}`)?.value;
    const descEn = document.getElementById(`fdesc-en-${id}`)?.value;

    const feat = {};
    if (nameRu || nameEn) {
      feat['@name'] = nameEn ? {RU:nameRu, EN:nameEn} : nameRu;
    }
    if (descRu || descEn) {
      feat['@description'] = descEn ? {RU:descRu, EN:descEn} : descRu;
    }
    const patch = document.getElementById(`fpatch-${id}`)?.value;
    if (patch) feat['@patches'] = patch;
    const root  = document.getElementById(`froot-${id}`)?.value;
    if (root)  feat['@root']    = root;
    const prio  = parseInt(document.getElementById(`fprio-${id}`)?.value, 10);
    if (prio)  feat['@priority'] = prio;
    const enabled = document.getElementById(`fenabled-${id}`)?.checked;
    if (!enabled)  feat['@enabled'] = false;
    // Conflicts
    const pills = document.querySelectorAll(`#fconflicts-${id} .tag-pill`);
    if (pills.length) feat['@conflicts'] = [...pills].map(p => p.childNodes[0].textContent.trim());
    features[key] = feat;
  });

  // Feature groups
  const groups = {};
  document.querySelectorAll('.group-block').forEach(gb => {
    const id  = gb.id.replace('grp-','');
    const key = document.getElementById(`gid-${id}`)?.value?.trim();
    if (!key) return;
    const nameRu = document.getElementById(`gname-ru-${id}`)?.value;
    const nameEn = document.getElementById(`gname-en-${id}`)?.value;
    const descRu = document.getElementById(`gdesc-ru-${id}`)?.value;
    const descEn = document.getElementById(`gdesc-en-${id}`)?.value;
    const type   = document.getElementById(`gtype-${id}`)?.value || 'DEFAULT';
    const featsStr = document.getElementById(`gfeats-${id}`)?.value || '';
    const feats  = featsStr.split(',').map(s=>s.trim()).filter(Boolean);

    const grp = {};
    if (nameRu || nameEn) grp['@name'] = nameEn ? {RU:nameRu,EN:nameEn} : nameRu;
    if (descRu || descEn) grp['@description'] = descEn ? {RU:descRu,EN:descEn} : descRu;
    grp['@type'] = type;
    if (feats.length) grp['@features'] = feats;
    groups[key] = grp;
  });

  return { ...meta, patches, features, feature_groups: groups };
}

// ── Build final JSON ──────────────────────────────────────────────
function buildJson(data) {
  const out = {};
  out['$schema'] = 'https://ext.nulls.gg/mods/schema/schema.json';

  // Title
  if (data.title_ru || data.title_en) {
    out['@title'] = data.title_en ? {RU:data.title_ru, EN:data.title_en} : data.title_ru;
  }
  // Description
  if (data.desc_ru || data.desc_en) {
    out['@description'] = data.desc_en ? {RU:data.desc_ru, EN:data.desc_en} : data.desc_ru;
  }
  out['@version'] = data.version || '1.0.0';
  out['@author']  = data.author || 'User';
  if (data.uuid)         out['@uuid']    = data.uuid;
  if (data.spec)         out['@spec']    = data.spec;
  if (data.patches_path) out['@patches'] = data.patches_path;

  // Features
  if (Object.keys(data.features || {}).length) out['@features'] = data.features;
  if (Object.keys(data.feature_groups || {}).length) out['@feature_groups'] = data.feature_groups;

  // CSV patches
  (data.patches || []).forEach(block => {
    const csvKey = block.filename.replace('.csv','');
    if (!out[csvKey]) out[csvKey] = {};
    (block.rows || []).forEach(row => {
      if (row.key && Object.keys(row.changes||{}).length) out[csvKey][row.key] = row.changes;
    });
  });

  return out;
}

// ── Generate ──────────────────────────────────────────────────────
async function generateJson() {
  const data  = collectData();
  const json  = buildJson(data);
  const str   = JSON.stringify(json, null, 2);

  const out   = document.getElementById('json-output');
  out.textContent = str;
  out.classList.add('visible');

  // Stage for download
  await fetch(`${PHP_API}?action=stage`, {method:'POST', headers:{'Content-Type':'application/json'}, body:str});
  const btn = document.getElementById('dl-btn');
  btn.href = `${PHP_API}?action=download`;
  btn.style.display = 'flex';

  snack('Мод собран!', 'Скачать', () => btn.click());
  out.scrollIntoView({behavior:'smooth'});
}

// ── JSON Import ───────────────────────────────────────────────────
async function handleJsonUpload(input) {
  const file = input.files[0];
  if (!file) return;
  showLoading('Чтение файла…');
  try {
    const text = await file.text();
    lastFailedJson = text;

    // Validate
    const vr   = await fetch(`${PHP_API}?action=validate`, {method:'POST', headers:{'Content-Type':'text/plain'}, body:text});
    const vd   = await vr.json();
    if (!vd.success) {
      hideLoading();
      input.value = '';
      showError(vd.report, true);
      return;
    }
    await processJsonContent(text);
    input.value = '';
    snack('JSON загружен');
  } catch(e) { snack('Ошибка: ' + e.message); }
  finally { hideLoading(); }
}

async function processJsonContent(text) {
  const json = JSON.parse(text);
  // Meta
  const title = json['@title'];
  if (typeof title === 'object') {
    document.getElementById('title_ru').value = title.RU || '';
    document.getElementById('title_en').value = title.EN || '';
  } else if (title) {
    document.getElementById('title_en').value = title;
  }
  const desc = json['@description'];
  if (typeof desc === 'object') {
    document.getElementById('desc_ru').value = desc.RU || '';
    document.getElementById('desc_en').value = desc.EN || '';
  } else if (desc) { document.getElementById('desc_en').value = desc; }
  if (json['@author'])  document.getElementById('author').value  = json['@author'];
  if (json['@version']) document.getElementById('version').value = json['@version'];
  if (json['@uuid'])    document.getElementById('uuid').value    = json['@uuid'];
  if (json['@spec'])    document.getElementById('spec').value    = json['@spec'];
  if (json['@patches']) document.getElementById('patches-path').value = json['@patches'];

  // Clear
  document.getElementById('patches-container').innerHTML  = '';
  document.getElementById('features-container').innerHTML = '';
  document.getElementById('groups-container').innerHTML   = '';

  // CSV patches
  const tasks = [];
  for (const [csvName, rows] of Object.entries(json)) {
    if (csvName.startsWith('@') || csvName === '$schema' || typeof rows !== 'object' || rows === null) continue;
    const filename = csvName + '.csv';
    const blockRows = Object.entries(rows).map(([key, changes]) => ({key, changes}));
    if (blockRows.length) tasks.push({filename, rows: blockRows});
  }
  showLoading('Загрузка патчей…');
  for (const t of tasks) {
    const blockId = addPatchBlock();
    document.getElementById(`fn-${blockId}`).value = t.filename;
    document.getElementById(`fs-${blockId}`).value = t.filename.replace('.csv','');
    document.getElementById(`pbt-${blockId}`).textContent = t.filename.replace('.csv','');
    document.getElementById(`addrow-${blockId}`).style.display = 'flex';
    for (const row of t.rows) await addRowEntry(blockId, row);
  }

  // Features
  if (json['@features']) {
    for (const [fid, fdata] of Object.entries(json['@features'])) addFeature(fid, fdata);
    if (Object.keys(json['@features']).length) document.getElementById('features-section').classList.add('expanded');
  }
  // Groups
  if (json['@feature_groups']) {
    for (const [gid, gdata] of Object.entries(json['@feature_groups'])) addGroup(gid, gdata);
    if (Object.keys(json['@feature_groups']).length) document.getElementById('groups-section').classList.add('expanded');
  }
  hideLoading();
  scheduleAutosave();
}

// ── Auto fix ──────────────────────────────────────────────────────
async function autoFix() {
  if (!lastFailedJson) return;
  showLoading('Auto Fix…');
  try {
    const r = await fetch(`${CSV_API}/fix`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({json_content: lastFailedJson})});
    const d = await r.json();
    hideLoading();
    if (!d.success) { snack('Не удалось починить: ' + d.message); return; }
    closeError();
    await processJsonContent(JSON.stringify(d.fixed_json));
    snack('Исправлено и загружено!');
  } catch(e) { hideLoading(); snack('Ошибка: ' + e.message); }
}

// ── Populate form from saved data ────────────────────────────────
async function populateForm(data) {
  document.getElementById('title_ru').value     = data.title_ru     || '';
  document.getElementById('title_en').value     = data.title_en     || '';
  document.getElementById('desc_ru').value      = data.desc_ru      || '';
  document.getElementById('desc_en').value      = data.desc_en      || '';
  document.getElementById('author').value       = data.author       || 'User';
  document.getElementById('version').value      = data.version      || '1.0.0';
  document.getElementById('uuid').value         = data.uuid         || '';
  document.getElementById('spec').value         = data.spec         || '';
  document.getElementById('patches-path').value = data.patches_path || '';

  document.getElementById('patches-container').innerHTML  = '';
  document.getElementById('features-container').innerHTML = '';
  document.getElementById('groups-container').innerHTML   = '';

  showLoading('Восстановление…');
  for (const p of (data.patches||[])) await addPatchBlock(p);
  for (const [fid, fd] of Object.entries(data.features||{})) addFeature(fid, fd);
  for (const [gid, gd] of Object.entries(data.feature_groups||{})) addGroup(gid, gd);
  hideLoading();
}

// ── Escape helpers ────────────────────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  // Pre-fetch CSV list
  const r = await fetch(`${PHP_API}?action=csv_list`).catch(()=>null);
  if (r?.ok) csvFilesCache = await r.json();

  // Init rich menus
  initRichMenus();

  // Close search on outside click
  document.addEventListener('click', e => {
    if (!e.target.matches('input[id^="fs-"]')) {
      document.querySelectorAll('.search-results.open').forEach(sr => sr.classList.remove('open'));
    }
  });
  // Reposition dropdowns on scroll
  window.addEventListener('scroll', () => {
    document.querySelectorAll('.search-results.open').forEach(sr => {
      const blockId = sr.id.replace('sr-','');
      const inp = document.getElementById(`fs-${blockId}`);
      if (inp) {
        const rect = inp.getBoundingClientRect();
        sr.style.top  = (rect.bottom + 2) + 'px';
        sr.style.left = rect.left + 'px';
      }
    });
  }, {passive:true});
}

document.addEventListener('DOMContentLoaded', init);

// ── Public API ────────────────────────────────────────────────────
return {
  // Drawer
  openDrawer, closeDrawer,
  // Project
  confirmNewProject, newProject, loadProject, confirmDeleteProject, deleteProject,
  // Patches
  addPatchBlock, removePatchBlock, searchCsv, selectCsvFile,
  addRowEntry, removeRowEntry, setRowMode, filterKeys,
  loadRowData, loadBoolRowData, markChanged,
  // Features
  addFeature, removeFeature, updateFeatureBadge, addConflict, removeConflict,
  // Groups
  addGroup, removeGroup, updateGroupBadge,
  // Section
  toggleSection,
  // Generate/Import
  generateJson, handleJsonUpload, autoFix,
  // Util
  genUUID, scheduleAutosave,
  // Dialog/Error
  closeDialog, closeError, copyError,
  // Snack (expose for inline)
  snack,
};
})();
