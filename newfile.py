import os
import json
import uuid
import datetime
import pandas as pd
import ast
import re
from flask import Flask, render_template_string, request, jsonify, send_file
import io

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FOLDER = os.path.join(BASE_DIR, 'csv')
HISTORY_FOLDER = os.path.join(BASE_DIR, 'history')

for folder in [CSV_FOLDER, HISTORY_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder)
CSV_CACHE = {}

# сперма
HTML_TEMPLATE = r"""
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Null's brawl mods</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; }
        :root { --bg: #121212; --card: #1e1e1e; --input: #2d2d2d; --border: #333; --accent: #4a90e2; --text: #eee; --subtext: #aaa; --danger: #e74c3c; --success: #2ecc71; --fix-btn: #9b59b6; }
        body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; overflow-x: hidden; }
        .header { background: #181818; padding: 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 2000; }
        .app-title { font-weight: 700; font-size: 18px; }
        .menu-btn { font-size: 24px; cursor: pointer; padding: 5px; }
        .save-status { font-size: 12px; color: var(--success); opacity: 0; transition: opacity 0.2s; }
        .save-status.visible { opacity: 1; }
        .container { padding: 15px; width: 100%; max-width: 600px; margin: 0 auto; padding-bottom: 100px; }
        .section, .mod-item { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 15px; margin-bottom: 15px; width: 100%; }
        .mod-item { border-left: 4px solid var(--accent); position: relative; z-index: 1; }
        .mod-item.focused { z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border-color: var(--accent); }
        .section-title { color: var(--accent); font-weight: 700; font-size: 13px; text-transform: uppercase; margin-bottom: 10px; }
        label { display: block; color: var(--subtext); margin: 10px 0 5px; font-size: 12px; }
        input, textarea, select { width: 100%; padding: 12px; background: var(--input); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-size: 15px; font-family: inherit; }
        input:focus, textarea:focus { border-color: var(--accent); outline: none; }
        textarea { resize: none; }
        .rich-group { position: relative; margin-bottom: 10px; display: flex; align-items: stretch; }
        .rich-input { border-top-right-radius: 0 !important; border-bottom-right-radius: 0 !important; flex: 1; }
        .toggle-arrow { width: 44px; background: #252525; border: 1px solid var(--border); border-left: none; border-top-right-radius: 6px; border-bottom-right-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #888; font-size: 12px; transition: background 0.2s; }
        .toggle-arrow:active { background: #333; color: #fff; }
        .html-menu { position: absolute; top: 100%; left: 0; right: 0; background: #202020; border: 1px solid var(--border); z-index: 1500; display: none; border-radius: 0 0 8px 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.9); max-height: 250px; overflow-y: auto; }
        .html-menu.visible { display: block; }
        .rainbow-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; padding: 5px; border-bottom: 1px solid #333; background: #1a1a1a; }
        .color-dot { height: 24px; border-radius: 4px; cursor: pointer; border: 1px solid #444; }
        .menu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #333; }
        .tag-btn { background: #202020; padding: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .tag-btn:active { background: var(--accent); }
        .tag-lbl { font-size: 13px; color: #eee; }
        .tag-code { font-family: monospace; font-size: 10px; color: #888; background: #151515; padding: 2px 4px; border-radius: 3px; }
        .search-wrapper { position: relative; width: 100%; }
        .search-results { position: absolute; top: 100%; left: 0; right: 0; background: #252525; border: 1px solid var(--border); z-index: 1000; max-height: 250px; overflow-y: auto; display: none; border-radius: 0 0 6px 6px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
        .search-item { padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; }
        .search-item:last-child { border-bottom: none; }
        .search-item:active { background: var(--accent); color: #fff; }
        .field-row { background: rgba(0,0,0,0.2); padding: 10px; margin-top: 8px; border-radius: 6px; border: 1px solid transparent; }
        .field-row.changed { border-color: var(--success); background: rgba(46, 204, 113, 0.1); }
        .field-name { font-size: 11px; color: var(--subtext); display: block; margin-bottom: 4px; font-family: monospace; }
        .btn { display: block; width: 100%; padding: 14px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 10px; background: var(--input); color: var(--text); text-decoration: none; text-align: center; }
        .btn-add { border: 1px dashed var(--subtext); }
        .btn-gen { background: var(--accent); color: #fff; margin-top: 20px; }
        .btn-dl { background: var(--success); color: #fff; display: none; }
        .del-btn { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; border-radius: 50%; background: #333; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; z-index: 200; }
        .del-btn:hover { background: var(--danger); }
        .sidebar { position: fixed; top: 0; left: -100%; width: 80%; max-width: 300px; height: 100%; background: #1a1a1a; z-index: 3000; transition: 0.3s; padding: 20px; border-right: 1px solid var(--border); box-shadow: 10px 0 50px rgba(0,0,0,0.5); }
        .sidebar.open { left: 0; }
        .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2500; display: none; opacity: 0; transition: opacity 0.2s; }
        .overlay.open { display: block; opacity: 1; }
        .history-item { padding: 10px; background: #252525; margin-bottom: 10px; border-radius: 6px; }
        .history-title { font-weight: bold; margin-bottom: 5px; font-size: 14px; word-break: break-word; }
        .history-date { font-size: 11px; color: #777; margin-bottom: 10px; }
        .h-btns { display: flex; gap: 5px; }
        .btn-sm { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; color: #fff; font-size: 12px; }
        .btn-open { background: var(--accent); }
        .btn-del { background: var(--danger); }
        pre { background: #000; padding: 10px; overflow-x: auto; color: #2ecc71; font-size: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; }
        .modal-overlay-fix { z-index: 3900 !important; }
        .modal-box { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.9); width: 90%; max-width: 320px; background: #1e1e1e; border: 1px solid var(--border); border-radius: 12px; padding: 20px; z-index: 4000; opacity: 0; pointer-events: none; transition: 0.2s; box-shadow: 0 20px 50px rgba(0,0,0,0.9); }
        .modal-box.active { transform: translate(-50%, -50%) scale(1); opacity: 1; pointer-events: all; }
        .modal-title { font-size: 18px; font-weight: 700; margin-bottom: 10px; color: var(--text); }
        .modal-desc { font-size: 14px; color: var(--subtext); margin-bottom: 20px; line-height: 1.4; }
        .modal-actions { display: flex; gap: 10px; }
        .m-btn { flex: 1; padding: 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; }
        .m-cancel { background: #333; color: #eee; }
        .m-confirm { background: var(--accent); color: #fff; }
        .m-danger { background: var(--danger); color: #fff; }
        .loading-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:5000; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff; display:none; }
        .loading-spinner { border: 4px solid #333; border-top: 4px solid var(--accent); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 15px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .progress-text { font-family: monospace; color: var(--accent); }
        .err-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 6000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
        .err-box { width: 90%; max-width: 600px; background: #181818; border: 1px solid #333; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 0 50px rgba(231, 76, 60, 0.2); }
        .err-header { color: var(--danger); font-weight: bold; font-size: 16px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
        .err-console { background: #000; color: #ff6b6b; font-family: 'Consolas', monospace; padding: 15px; border-radius: 8px; font-size: 12px; height: 250px; overflow-y: auto; white-space: pre-wrap; margin-bottom: 20px; border: 1px solid #333; }
        .err-actions { display: flex; justify-content: flex-end; gap: 10px; }
        .btn-rounded { border-radius: 50px; padding: 10px 24px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: 0.2s; }
        .btn-copy-err { background: #2d2d2d; color: #eee; }
        .btn-copy-err:active { background: #444; }
        .btn-close-err { background: var(--danger); color: #fff; }
        .btn-fix { background: var(--fix-btn); color: #fff; flex: 1; text-align: center; border-radius: 50px; display: none; font-weight: 700; align-items: center; justify-content: center; }
        .btn-fix:active { opacity: 0.8; }
    </style>
</head>
<body>
<div class="loading-overlay" id="loading-overlay">
    <div class="loading-spinner"></div>
    <div id="loading-text">Загрузка...</div>
    <div class="progress-text" id="progress-text">0%</div>
</div>

<!-- Validation Error Modal -->
<div class="err-overlay" id="err-overlay">
    <div class="err-box">
        <div class="err-header">
            <span>Ошибка валидации JSON</span>
        </div>
        <div class="err-console" id="err-console"></div>
        <div class="err-actions">
            <button class="btn-fix" id="btn-auto-fix" onclick="autoFix()">AUTO FIX (Починить скобки/запятые)</button>
            <button class="btn-rounded btn-copy-err" onclick="copyError()">Копировать</button>
            <button class="btn-rounded btn-close-err" onclick="closeError()">Закрыть</button>
        </div>
    </div>
</div>

<div class="overlay modal-overlay-fix" id="modal-overlay"></div>
<div class="modal-box" id="modal-box">
    <div class="modal-title" id="m-title">Заголовок</div>
    <div class="modal-desc" id="m-desc">Текст</div>
    <div class="modal-actions" id="m-actions"></div>
</div>
<div class="sidebar" id="sidebar">
    <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
        <span style="font-weight:bold; font-size:18px;">История</span>
        <span onclick="toggleSidebar()" style="cursor:pointer; font-size:24px;">&times;</span>
    </div>
    <button class="btn" style="background:#333; margin-bottom:10px;" onclick="confirmNewProject()">+ Новый Проект</button>
    <button class="btn" style="background:#2ecc71; color:#fff; margin-bottom:20px;" onclick="document.getElementById('json-upload').click()">+ Загрузить JSON</button>
    <input type="file" id="json-upload" style="display:none" accept=".json" onchange="handleJsonUpload(this)">
    <div id="history-list">...</div>
</div>
<div class="header">
    <div style="display:flex; align-items:center; gap:15px;">
        <div class="menu-btn" onclick="toggleSidebar()">&#9776;</div>
        <div class="app-title">Null's brawl mods</div>
    </div>
    <div class="save-status" id="save-status">Сохранено</div>
</div>
<div class="container">
    <div class="section">
        <div class="section-title">Мета-инфа (HTML supported)</div>
        <div class="rich-group"><input type="text" id="title_ru" class="rich-input" placeholder="Название (RU)" oninput="triggerAutosave()"></div>
        <div class="rich-group"><input type="text" id="title_en" class="rich-input" placeholder="Title (EN)" oninput="triggerAutosave()"></div>
        <label>Описание</label>
        <div class="rich-group"><textarea id="desc_ru" class="rich-input" rows="2" placeholder="RU" oninput="triggerAutosave()"></textarea></div>
        <div class="rich-group"><textarea id="desc_en" class="rich-input" rows="2" placeholder="EN" oninput="triggerAutosave()"></textarea></div>
        <label>Автор мода</label>
        <div class="rich-group"><input type="text" id="author" class="rich-input" value="User" oninput="triggerAutosave()"></div>
    </div>
    <div id="mods-container"></div>
    <button class="btn btn-add" onclick="addModBlock()">+ Добавить файл</button>
    <div class="section" style="margin-top:20px;">
        <button class="btn btn-gen" onclick="generateJson()">Собрать мод</button>
        <pre id="output"></pre>
        <a id="dl-btn" class="btn btn-dl" target="_blank">Скачать .json</a>
    </div>
</div>
<script>
    let csvFilesInfo = {{ csv_files | tojson }};
    let currentProjectId = null;
    let autosaveTimer = null;
    let clientKeysCache = {}; 
    let lastFailedContent = "";
    const MENU_ITEMS = [
        { label: 'Жирный', tag: 'b', code: '<b>' },
        { label: 'Курсив', tag: 'i', code: '<i>' },
        { label: 'Подчерк', tag: 'u', code: '<u>' },
        { label: 'Зачерк (S)', tag: 's', code: '<s>' },
        { label: 'Зачерк (Del)', tag: 'del', code: '<del>' },
        { label: 'Большой', tag: 'big', code: '<big>' },
        { label: 'Маленький', tag: 'small', code: '<small>' },
        { label: 'Верхний индекс', tag: 'sup', code: '<sup>' },
        { label: 'Нижний индекс', tag: 'sub', code: '<sub>' },
        { label: 'Моно', tag: 'tt', code: '<tt>' },
        { label: 'Код', tag: 'code', code: '<code>' },
        { label: 'Параграф', tag: 'p', code: '<p>' },
        { label: 'Div', tag: 'div', code: '<div>' },
        { label: 'Span', tag: 'span', code: '<span>' },
        { label: 'Перенос', tag: 'br', code: '<br>', single:true },
        { label: 'Список', tag: 'ul', code: '<ul>' },
        { label: 'Элемент', tag: 'li', code: '<li>' },
        { label: 'Цитата', tag: 'cite', code: '<cite>' },
        { label: 'Блок цитаты', tag: 'blockquote', code: '<blockquote>' },
        { label: 'H1', tag: 'h1', code: '<h1>' },
        { label: 'H2', tag: 'h2', code: '<h2>' },
        { label: 'H3', tag: 'h3', code: '<h3>' },
        { label: 'Ссылка', action: 'link', code: '<a href>' }
    ];
    const RAINBOW = ['#ff0000','#ff7f00','#ffff00','#00ff00','#00bfff','#0000ff','#8b00ff'];
    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll('.rich-input').forEach(input => {
            const container = input.closest('.rich-group');
            const arrow = document.createElement('div');
            arrow.className = 'toggle-arrow';
            arrow.innerHTML = '&#9660;';
            container.appendChild(arrow);
            const menu = document.createElement('div');
            menu.className = 'html-menu';
            const gridColors = document.createElement('div');
            gridColors.className = 'rainbow-grid';
            RAINBOW.forEach(color => {
                const dot = document.createElement('div');
                dot.className = 'color-dot';
                dot.style.backgroundColor = color;
                dot.onmousedown = (e) => { e.preventDefault(); insertTag(input, 'font', ` color='${color}'`); };
                gridColors.appendChild(dot);
            });
            menu.appendChild(gridColors);
            const gridTags = document.createElement('div');
            gridTags.className = 'menu-grid';
            MENU_ITEMS.forEach(item => {
                const btn = document.createElement('div');
                btn.className = 'tag-btn';
                btn.innerHTML = `<span class="tag-lbl">${item.label}</span><span class="tag-code">${item.code}</span>`;
                btn.onmousedown = (e) => { e.preventDefault(); if(item.action === 'link') insertLink(input); else insertTag(input, item.tag, '', item.single); };
                gridTags.appendChild(btn);
            });
            menu.appendChild(gridTags);
            container.appendChild(menu);
            input.addEventListener('focus', () => { document.querySelectorAll('.html-menu').forEach(m => m.classList.remove('visible')); document.querySelectorAll('.toggle-arrow').forEach(a => a.innerHTML = '&#9660;'); menu.classList.add('visible'); arrow.innerHTML = '&#9650;'; });
            input.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== input) { menu.classList.remove('visible'); arrow.innerHTML = '&#9660;'; } }, 150); });
            arrow.onmousedown = (e) => { e.preventDefault(); const isVisible = menu.classList.contains('visible'); if (isVisible) { menu.classList.remove('visible'); arrow.innerHTML = '&#9660;'; input.blur(); } else { document.querySelectorAll('.html-menu').forEach(m => m.classList.remove('visible')); document.querySelectorAll('.toggle-arrow').forEach(a => a.innerHTML = '&#9660;'); menu.classList.add('visible'); arrow.innerHTML = '&#9650;'; input.focus(); } };
        });
    });
    
    /* FIX: Added missing removeMod function here */
    function removeMod(id) {
        const el = document.getElementById(`mod-${id}`);
        if(el) {
            el.remove();
            triggerAutosave();
        }
    }

    function insertTag(input, tag, attrs='', isSingle=false) {
        const start = input.selectionStart; const end = input.selectionEnd; const text = input.value; const openTag = `<${tag}${attrs}>`; const closeTag = isSingle ? '' : `</${tag}>`;
        let newCursor; if (start !== end) { const selected = text.substring(start, end); input.value = text.substring(0, start) + openTag + selected + closeTag + text.substring(end); newCursor = start + openTag.length + selected.length + closeTag.length; } else { input.value = text.substring(0, start) + openTag + closeTag + text.substring(end); newCursor = start + openTag.length; }
        triggerAutosave(); input.setSelectionRange(newCursor, newCursor);
    }
    function insertLink(input) {
        const open = `<a href=''>`; const close = `</a>`; const start = input.selectionStart; const val = input.value;
        input.value = val.substring(0, start) + open + val.substring(start, input.selectionEnd) + close + val.substring(input.selectionEnd);
        const newCursor = start + 9; triggerAutosave(); input.setSelectionRange(newCursor, newCursor);
    }
    function toggleLoading(show, text="Загрузка...", pct="") {
        const el = document.getElementById('loading-overlay');
        document.getElementById('loading-text').textContent = text;
        document.getElementById('progress-text').textContent = pct;
        el.style.display = show ? 'flex' : 'none';
    }
    
    // ERROR GUI (1488)
    function showError(report) {
        document.getElementById('err-console').textContent = report;
        document.getElementById('err-overlay').style.display = 'flex';
        // Show Auto Fix button
        document.getElementById('btn-auto-fix').style.display = 'flex';
    }
    function closeError() {
        document.getElementById('err-overlay').style.display = 'none';
    }
    function copyError() {
        const text = document.getElementById('err-console').textContent;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.querySelector('.btn-copy-err');
            const original = btn.textContent;
            btn.textContent = "Скопировано!";
            setTimeout(() => btn.textContent = original, 1500);
        });
    }

    async function autoFix() {
        if (!lastFailedContent) return;
        
        toggleLoading(true, "Анализ и исправление...", "Сканирование...");
        
        try {
            const res = await fetch('/api/auto_fix_json', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    json_content: lastFailedContent
                })
            });
            const data = await res.json();
            
            toggleLoading(false);
            
            if (!data.success) {
                alert("Не удалось исправить автоматически: " + data.message);
                return;
            }
            
            closeError();
            await processJsonContent(JSON.stringify(data.fixed_json));
            alert("Файл успешно исправлен и загружен!");
            
        } catch(e) {
            toggleLoading(false);
            alert("Ошибка соединения: " + e);
        }
    }

    async function processJsonContent(text) {
         try {
            const json = JSON.parse(text);

            const setVal = (id, val) => { if(val !== undefined && val !== null) document.getElementById(id).value = val; };
            setVal('author', json["@author"] || json["Author"]);
            
            const title = json["@title"] || json["Title"];
            if (typeof title === 'object') {
                setVal('title_ru', title["RU"]);
                setVal('title_en', title["EN"]);
            } else if (typeof title === 'string') {
                 setVal('title_en', title);
            }
            
            const desc = json["@description"] || json["Description"];
            if (typeof desc === 'object') {
                setVal('desc_ru', desc["RU"]);
                setVal('desc_en', desc["EN"]);
            } else if (typeof desc === 'string') {
                 setVal('desc_en', desc);
            }

            document.getElementById('mods-container').innerHTML = '';
            
            const tasks = [];
            for (const [csvName, rows] of Object.entries(json)) {
                if(csvName.startsWith("@") || csvName === "Author" || csvName === "Title" || csvName === "Description") continue;
                if (typeof rows !== 'object' || rows === null) continue;
                
                const filename = csvName + ".csv";
                for (const [rowKey, changes] of Object.entries(rows)) {
                    tasks.push({filename, rowKey, changes});
                }
            }
            const batchSize = 10;
            for (let i = 0; i < tasks.length; i += batchSize) {
                const chunk = tasks.slice(i, i + batchSize);
                await Promise.all(chunk.map(t => addModBlock({ filename: t.filename, key: t.rowKey, changes: t.changes })));
                toggleLoading(true, "Обработка...", `${Math.min(i + batchSize, tasks.length)} / ${tasks.length}`);
            }
            toggleSidebar(); triggerAutosave();
        } catch(e) { alert("Ошибка обработки JSON: " + e); }
    }

    async function handleJsonUpload(input) {
        const file = input.files[0]; if(!file) return;
        toggleLoading(true, "Чтение файла...");
        try {
            const text = await file.text();
            lastFailedContent = text; // Save for Fixer
            
            // тут чтото должно быть...
            toggleLoading(true, "Валидация...");
            const valRes = await fetch('/api/validate_json', {
                method: 'POST',
                headers: {'Content-Type': 'text/plain'},
                body: text
            });
            const valData = await valRes.json();
            
            if (!valData.success) {
                toggleLoading(false);
                input.value = '';
                showError(valData.report);
                return; 
            }
            
            await processJsonContent(text);
            input.value = '';

        } catch(e) { toggleLoading(false); alert("Неизвестная ошибка: " + e); }
        toggleLoading(false);
    }
    function triggerAutosave() { const status = document.getElementById('save-status'); status.textContent = "Сохранение..."; status.classList.add('visible'); clearTimeout(autosaveTimer); autosaveTimer = setTimeout(saveHistory, 1000); }
    async function saveHistory() {
        const payload = collectData(); payload.id = currentProjectId;
        try { const res = await fetch('/api/save_history', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) }); const data = await res.json(); if(data.success) { currentProjectId = data.id; const status = document.getElementById('save-status'); status.textContent = "Сохранено"; setTimeout(() => status.classList.remove('visible'), 2000); } } catch(e) {}
    }
    function collectData() { return { author: document.getElementById('author').value, title_ru: document.getElementById('title_ru').value, title_en: document.getElementById('title_en').value, desc_ru: document.getElementById('desc_ru').value, desc_en: document.getElementById('desc_en').value, mods: collectMods() }; }
    function collectMods() {
        const mods = []; document.querySelectorAll('.mod-item').forEach(item => {
            const filename = item.querySelector('.real-filename').value; const keySelect = item.querySelector('select[id^="key-select"]'); if (!keySelect) return; const key = keySelect.value; if (!filename || !key) return; const changes = {};
            item.querySelectorAll('.field-row.changed').forEach(row => { const name = row.querySelector('.field-name-hidden').value; const input = row.querySelector('input:not(.field-name-hidden), select'); let value = input.value; const type = input.getAttribute('data-type'); if (type === 'int') { if (value.length > 15) value = parseInt(value); else value = parseInt(value); } changes[name] = value; });
            if (Object.keys(changes).length > 0) mods.push({ filename: filename, key: key, changes: changes });
        }); return mods;
    }
    function showModal(title, desc, buttons) { const overlay = document.getElementById('modal-overlay'); const box = document.getElementById('modal-box'); document.getElementById('m-title').textContent = title; document.getElementById('m-desc').innerHTML = desc; const actions = document.getElementById('m-actions'); actions.innerHTML = ''; buttons.forEach(btn => { const b = document.createElement('button'); b.className = `m-btn ${btn.cls || ''}`; b.textContent = btn.text; b.onclick = () => { closeModal(); if(btn.onClick) btn.onClick(); }; actions.appendChild(b); }); overlay.classList.add('open'); box.classList.add('active'); }
    function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); document.getElementById('modal-box').classList.remove('active'); }
    function confirmNewProject() { showModal('Новый проект', 'Все несохраненные изменения будут потеряны.', [ { text: 'Отмена', cls: 'm-cancel' }, { text: 'Создать', cls: 'm-confirm', onClick: createNewProject } ]); }
    function confirmDeleteHistory(id) { showModal('Удаление', 'Удалить этот проект из истории?', [ { text: 'Отмена', cls: 'm-cancel' }, { text: 'Удалить', cls: 'm-danger', onClick: () => doDeleteHistory(id) } ]); }
    function createNewProject() { currentProjectId = null; document.querySelectorAll('.rich-input').forEach(el => el.value = ''); document.getElementById('author').value = 'User'; document.getElementById('mods-container').innerHTML = ''; document.getElementById('output').textContent = ''; document.getElementById('dl-btn').style.display = 'none'; toggleSidebar(); triggerAutosave(); }
    function toggleSidebar() { const sb = document.getElementById('sidebar'); const overlay = document.querySelector('.overlay:not(.modal-overlay-fix)'); sb.classList.toggle('open'); if(overlay) overlay.classList.toggle('open'); if(sb.classList.contains('open')) loadHistory(); }
    async function loadHistory() { const res = await fetch('/api/history'); const data = await res.json(); const list = document.getElementById('history-list'); list.innerHTML = ''; data.forEach(item => { const el = document.createElement('div'); el.className = 'history-item'; el.innerHTML = `<div class="history-title">${item.title}</div><div class="history-date">${item.date}</div><div class="h-btns"><button class="btn-sm btn-open" onclick="loadProject('${item.id}')">Загрузить</button><button class="btn-sm btn-del" onclick="confirmDeleteHistory('${item.id}')">Удалить</button></div>`; list.appendChild(el); }); }
    async function doDeleteHistory(id) { await fetch('/api/delete_history', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id:id})}); loadHistory(); }
    async function loadProject(id) { const res = await fetch('/api/get_history_item/' + id); const data = await res.json(); if(!data.success) return; currentProjectId = id; const d = data.data; document.getElementById('title_ru').value = d.title_ru || ''; document.getElementById('title_en').value = d.title_en || ''; document.getElementById('desc_ru').value = d.desc_ru || ''; document.getElementById('desc_en').value = d.desc_en || ''; document.getElementById('author').value = d.author || ''; document.getElementById('mods-container').innerHTML = ''; for (const mod of d.mods) await addModBlock(mod); toggleSidebar(); }
    async function generateJson() { const payload = collectData(); const res = await fetch('/generate_json', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) }); const result = await res.json(); document.getElementById('output').textContent = JSON.stringify(result, null, 2); await fetch('/api/stage_download', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({json_content: result}) }); const dlBtn = document.getElementById('dl-btn'); dlBtn.href = "/api/download_staged"; dlBtn.style.display = 'block'; }
    function focusModItem(id) { document.querySelectorAll('.mod-item').forEach(el => el.classList.remove('focused')); document.getElementById(`mod-${id}`).classList.add('focused'); }
    function blurModItem(id) { setTimeout(() => { const el = document.getElementById(`mod-${id}`); if(el && !el.querySelector('input:focus')) el.classList.remove('focused'); }, 200); }
async function addModBlock(restoreData = null) {
        const id = Date.now() + Math.random().toString().slice(2,5); 
        const container = document.getElementById('mods-container');
        
        const html = `
        <div class="mod-item" id="mod-${id}">
            <div class="del-btn" onclick="removeMod('${id}')">&times;</div>
            <label>Файл CSV</label>
            <div class="search-wrapper">
                <input type="text" class="file-search" placeholder="Выбрать..." 
                    oninput="searchFiles(this, '${id}')" 
                    onfocus="focusModItem('${id}'); searchFiles(this, '${id}')" 
                    onblur="blurModItem('${id}')">
                <div class="search-results" id="res-${id}"></div>
                <input type="hidden" class="real-filename" id="file-val-${id}">
            </div>
            <div id="row-select-area-${id}" style="display:none; margin-top:15px;">
                <label>Ключевые строки</label>
                <div class="search-wrapper">
                    <input type="text" placeholder="Поиск строки..." 
                        oninput="filterKeysDebounced(this, '${id}')" 
                        onfocus="focusModItem('${id}')" 
                        onblur="blurModItem('${id}')" 
                        id="key-search-${id}">
                    <select id="key-select-${id}" size="5" style="display:none; margin-top:5px;" onchange="loadFields('${id}')"></select>
                </div>
            </div>
            <div id="fields-container-${id}" style="margin-top:15px;"></div>
        </div>`;
        
        container.insertAdjacentHTML('beforeend', html);
        
        if (restoreData) { 
            const filenameNoExt = restoreData.filename.replace('.csv', ''); 
            document.querySelector(`#mod-${id} .file-search`).value = filenameNoExt; 
            document.getElementById(`file-val-${id}`).value = restoreData.filename; 
            
            const rowArea = document.getElementById(`row-select-area-${id}`);
            const keySelect = document.getElementById(`key-select-${id}`);
            
            rowArea.style.display = 'block';
            keySelect.style.display = 'block';
            
            keySelect.innerHTML = `<option value="${restoreData.key}" selected>${restoreData.key}</option>`;
            keySelect.value = restoreData.key;
            
            if (keySelect.value) {
                await loadFields(id, restoreData.changes); 
            }
        } else { 
            setTimeout(() => focusModItem(id), 100); 
            triggerAutosave(); 
        }
    }
    function searchFiles(inp, id) {
        const val = inp.value.toLowerCase(); const resDiv = document.getElementById(`res-${id}`); let matches = val.length === 0 ? csvFilesInfo : csvFilesInfo.filter(f => f.name.toLowerCase().includes(val));
        if (matches.length === 0) resDiv.innerHTML = '<div style="padding:10px; color:#666">Пусто</div>'; else { let html = ''; matches.slice(0, 100).forEach(f => { const displayName = f.name.replace('.csv', ''); html += f.size > 5242880 ? `<div class="search-item disabled">${displayName} (>5MB)</div>` : `<div class="search-item" onclick="selectFile('${f.name}', '${id}')">${displayName}</div>`; }); resDiv.innerHTML = html; } resDiv.style.display = 'block';
    }
    function selectFile(fullName, id) { document.querySelector(`#mod-${id} .file-search`).value = fullName.replace('.csv', ''); document.getElementById(`file-val-${id}`).value = fullName; document.getElementById(`res-${id}`).style.display = 'none'; loadKeysInternal(fullName, id); triggerAutosave(); }
    
    async function loadKeysInternal(filename, id, targetKey=null) { 
        const rowArea = document.getElementById(`row-select-area-${id}`); 
        const keySelect = document.getElementById(`key-select-${id}`); 
        rowArea.style.display = 'block'; keySelect.style.display = 'none'; 
        
        let keys = [];
        if (clientKeysCache[filename]) {
            keys = clientKeysCache[filename];
        } else {
            try { 
                const res = await fetch('/api/get_keys', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({filename: filename}) }); 
                const data = await res.json(); 
                if(data.success) {
                    keys = data.keys;
                    clientKeysCache[filename] = keys;
                }
            } catch(e) { return; }
        }
        
        if(keys.length > 0) {
            keySelect.dataset.allKeys = JSON.stringify(keys); 
            let listToRender = keys.slice(0, 100);
            if (targetKey && !listToRender.includes(targetKey) && keys.includes(targetKey)) {
                listToRender.push(targetKey);
            }
            renderKeyOptions(keySelect, listToRender); 
            keySelect.style.display = 'block'; 
        }
    }
    function renderKeyOptions(select, keys) { let opts = ''; keys.forEach(k => opts += `<option value="${k}">${k}</option>`); select.innerHTML = opts; }
    let debounceTimer;
    function filterKeysDebounced(inp, id) { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => filterKeys(inp, id), 300); }
    function filterKeys(inp, id) { const val = inp.value.toLowerCase(); const select = document.getElementById(`key-select-${id}`); if (!select.dataset.allKeys) return; const allKeys = JSON.parse(select.dataset.allKeys); renderKeyOptions(select, allKeys.filter(k => String(k).toLowerCase().includes(val)).slice(0, 100)); }
    async function loadFields(id, savedChanges = null) {
        const filename = document.getElementById(`file-val-${id}`).value; const keyVal = document.getElementById(`key-select-${id}`).value; const container = document.getElementById(`fields-container-${id}`); if(!keyVal) return; container.innerHTML = '<div style="color:#666; padding:10px;">Загрузка...</div>'; triggerAutosave();
        const res = await fetch('/api/get_row_data', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({filename: filename, row_key: keyVal}) }); const data = await res.json(); container.innerHTML = '';
        if(data.success) { data.fields.forEach(f => { let displayVal = savedChanges && savedChanges.hasOwnProperty(f.name) ? savedChanges[f.name] : f.value; let isChangedClass = savedChanges && savedChanges.hasOwnProperty(f.name) ? 'changed' : ''; let inputHtml = f.type.toLowerCase() === 'boolean' ? `<select data-orig="${f.value}" data-type="boolean" onchange="markChanged(this)"><option value="TRUE" ${String(displayVal).toUpperCase() === 'TRUE'?'selected':''}>TRUE</option><option value="FALSE" ${String(displayVal).toUpperCase() !== 'TRUE'?'selected':''}>FALSE</option></select>` : `<input type="${f.type.toLowerCase() === 'int'?'number':'text'}" value="${displayVal}" data-orig="${f.value}" data-type="${f.type}" oninput="markChanged(this)">`; container.insertAdjacentHTML('beforeend', `<div class="field-row ${isChangedClass}"><span class="field-name">${f.name}</span>${inputHtml}<input type="hidden" class="field-name-hidden" value="${f.name}"></div>`); }); }
    }
    function markChanged(elem) { const orig = String(elem.getAttribute('data-orig')); const wrapper = elem.closest('.field-row'); if (String(elem.value) !== orig) wrapper.classList.add('changed'); else wrapper.classList.remove('changed'); triggerAutosave(); }
    document.addEventListener('click', function(e) { if (!e.target.matches('input') && !e.target.closest('.search-results')) document.querySelectorAll('.search-results').forEach(el => el.style.display = 'none'); if (e.target.classList.contains('overlay') && !e.target.classList.contains('modal-overlay-fix') && !e.target.closest('.loading-overlay')) if (document.getElementById('sidebar').classList.contains('open')) toggleSidebar(); if (e.target.id === 'modal-overlay') closeModal(); });
</script>
</body>
</html>
"""
def get_csv_files_info():
    if not os.path.exists(CSV_FOLDER): return []
    files = []
    for f in os.listdir(CSV_FOLDER):
        if f.endswith('.csv'): files.append({'name': f, 'size': os.path.getsize(os.path.join(CSV_FOLDER, f))})
    return sorted(files, key=lambda x: x['name'])
def read_brawl_csv(filename):
    if filename in CSV_CACHE: return CSV_CACHE[filename]
    try:
        df = pd.read_csv(os.path.join(CSV_FOLDER, filename), header=0, encoding='utf-8')
        if df.empty: return pd.DataFrame(), {}, None
        pk = df.columns[0]
        ui_keys = []
        last_valid_key = "UNKNOWN"
        count = 0
        for val in df[pk]:
            is_empty = pd.isna(val) or str(val).strip() == ""
            
            if is_empty:
                count += 1
                ui_keys.append(f"{last_valid_key} [{count}]")
            else:
                last_valid_key = str(val)
                count = 0
                ui_keys.append(last_valid_key)
        df['_ui_key'] = ui_keys
        types_row = df.iloc[0].to_dict()
        
        res = (df, types_row, pk)
        CSV_CACHE[filename] = res
        return res
    except Exception as e:
        print(f"Error reading {filename}: {e}")
        return pd.DataFrame(), {}, None
@app.route('/api/validate_json', methods=['POST'])
def validate_json_endpoint():
    raw_data = request.get_data(as_text=True)
    try:
        data = json.loads(raw_data)
    except json.JSONDecodeError as e:
        error_msg = (
            f"Syntax Error in JSON:\n"
            f"Line {e.lineno}, Column {e.colno}\n"
            f"Reason: {str(e)}\n\n"
            f"The Auto Fixer can now try to repair missing commas and structural errors."
        )
        return jsonify({'success': False, 'report': error_msg})

    errors = []
    if not data.get('@author') and not data.get('Author'):
        errors.append("[METADATA] Missing 'Author' field.")
    
    title = data.get('@title') or data.get('Title')
    if not title:
        errors.append("[METADATA] Missing 'Title' field.")
        
    desc = data.get('@description') or data.get('Description')
    if not desc:
        errors.append("[METADATA] Missing 'Description' field.")

    for filename_key, content in data.items():
        if filename_key.startswith('@') or filename_key in ['Author', 'Title', 'Description']:
            continue
        real_filename = filename_key if filename_key.endswith('.csv') else filename_key + ".csv"
        file_path = os.path.join(CSV_FOLDER, real_filename)
        if not os.path.exists(file_path):
            errors.append(f"[FILE] File not found in server: {real_filename}")
            continue
        if not isinstance(content, dict):
            continue 
    if errors:
        return jsonify({'success': False, 'report': "\n".join(errors)})
    return jsonify({'success': True})

def robust_json_parse(text):
    text = re.sub(r'//.*', '', text)
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    text = re.sub(r'(["\]\}0-9]|true|false|null)\s+(?=["\{])', r'\1, ', text)
    text = re.sub(r'(["\]\}0-9]|true|false|null)\s+(?=")', r'\1, ', text)
    text = text.replace('true', 'True').replace('false', 'False').replace('null', 'None')
    open_c = text.count('{') - text.count('}')
    open_s = text.count('[') - text.count(']')
    open_p = text.count('(') - text.count(')')

    if open_c > 0: text += '}' * open_c
    if open_s > 0: text += ']' * open_s
    if open_p > 0: text += ')' * open_p

    try:
        parsed = ast.literal_eval(text)
        if isinstance(parsed, tuple):
            for item in parsed:
                if isinstance(item, dict): return item
            return {}
        return parsed
    except Exception as e:
        raise ValueError(f"Repair failed: {str(e)}")

@app.route('/api/auto_fix_json', methods=['POST'])
def auto_fix_json():
    content = request.json.get('json_content')
    
    data = None
    try:
        data = json.loads(content)
    except:
        try:
            data = robust_json_parse(content)
        except Exception as e:
             return jsonify({'success': False, 'message': f"Fatal Parse Error: {str(e)}"})

    if not isinstance(data, dict):
        return jsonify({'success': False, 'message': "Parsed data is not a dictionary"})

    # опозорить пользователя
    if '@author' not in data and 'Author' not in data:
        data['@author'] = 'User'
    
    if '@title' not in data and 'Title' not in data:
        data['@title'] = {'RU': 'Auto Fixed Mod', 'EN': 'Auto Fixed Mod'}
        
    if '@description' not in data and 'Description' not in data:
        data['@description'] = {'RU': 'Fixed by System', 'EN': 'Fixed by System'}

    # починить наверное, или сломать?
    available_files = [f['name'] for f in get_csv_files_info()]
    new_data = {}
    
    all_csv_keys = {} 
    
    for k, v in data.items():
        if k.startswith('@') or k in ['Author', 'Title', 'Description']:
            new_data[k] = v
            continue
            
        current_name = k if k.endswith('.csv') else k + '.csv'
        
        # If file exists, keep it
        if current_name in available_files:
            clean_key = current_name.replace('.csv', '')
            new_data[clean_key] = v
            continue
            
        # если пользователь уебан в конец
        if isinstance(v, dict):
            target_rows = list(v.keys())
            if not target_rows:
                new_data[k] = v 
                continue
                
            found_file = None
            
            for candidate_file in available_files:
                if candidate_file not in all_csv_keys:
                    df, _, pk = read_brawl_csv(candidate_file)
                    if pk:
                        all_csv_keys[candidate_file] = set(df.iloc[1:][pk].dropna().astype(str).tolist())
                    else:
                        all_csv_keys[candidate_file] = set()
                
                first_key = str(target_rows[0])
                if first_key in all_csv_keys[candidate_file]:
                    found_file = candidate_file
                    break
            
            if found_file:
                clean_key = found_file.replace('.csv', '')
                new_data[clean_key] = v
            else:
                new_data[k] = v
        else:
             new_data[k] = v

    return jsonify({'success': True, 'fixed_json': new_data})

@app.route('/api/get_keys', methods=['POST'])
def get_keys():
    filename = request.json.get('filename')
    df, _, pk = read_brawl_csv(filename)
    if pk is None or df.empty: return jsonify({'success': False})
    keys = df.iloc[1:]['_ui_key'].tolist()
    
    return jsonify({'success': True, 'keys': keys})
@app.route('/api/get_row_data', methods=['POST'])
def get_row_data():
    filename = request.json.get('filename')
    row_key = request.json.get('row_key')
    
    df, types, pk = read_brawl_csv(filename)
    
    # Пропускаем строку типов и ищем по нашему виртуальному ключу
    df_data = df.iloc[1:].reset_index(drop=True)
    row = df_data[df_data['_ui_key'] == str(row_key)]
    
    if row.empty: return jsonify({'success': False})
    
    row_data = row.iloc[0].to_dict()
    fields = []
    for c, v in row_data.items():
        if c == '_ui_key': continue 
        fields.append({
            'name': c, 
            'value': v if pd.notna(v) else "", 
            'type': types.get(c, 'string')
        })
        
    return jsonify({'success': True, 'fields': fields})
@app.route('/api/save_history', methods=['POST'])
def save_history():
    data = request.json
    uid = data.get('id') or str(uuid.uuid4())
    title = data.get('title_ru') or data.get('title_en') or f"Проект {uid[:4]}"
    item = {"id": uid, "date": datetime.datetime.now().strftime("%d.%m %H:%M"), "title": title, "data": data}
    with open(os.path.join(HISTORY_FOLDER, uid + '.json'), 'w', encoding='utf-8') as f: json.dump(item, f, ensure_ascii=False)
    return jsonify({'success': True, 'id': uid})
@app.route('/api/history', methods=['GET'])
def get_history_list():
    items = []
    if os.path.exists(HISTORY_FOLDER):
        for f in os.listdir(HISTORY_FOLDER):
            if f.endswith('.json'):
                try:
                    with open(os.path.join(HISTORY_FOLDER, f), 'r', encoding='utf-8') as file:
                        d = json.load(file)
                        items.append({'id': d['id'], 'title': d['title'], 'date': d['date']})
                except: continue
    return jsonify(sorted(items, key=lambda x: x['date'], reverse=True))
@app.route('/api/get_history_item/<id>', methods=['GET'])
def get_history_item(id):
    path = os.path.join(HISTORY_FOLDER, id + '.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f: return jsonify({'success': True, 'data': json.load(f)['data']})
    return jsonify({'success': False})
@app.route('/api/delete_history', methods=['POST'])
def delete_history_route():
    path = os.path.join(HISTORY_FOLDER, request.json.get('id') + '.json')
    if os.path.exists(path): os.remove(path)
    return jsonify({'success': True})
staged_json = {}
@app.route('/api/stage_download', methods=['POST'])
def stage_download():
    global staged_json
    staged_json = request.json.get('json_content')
    return jsonify({'success': True})
@app.route('/api/download_staged')
def download_staged():
    global staged_json
    mem = io.BytesIO()
    mem.write(json.dumps(staged_json, indent=2, ensure_ascii=False).encode('utf-8'))
    mem.seek(0)
    return send_file(mem, as_attachment=True, download_name='mod.json', mimetype='application/json')
@app.route('/generate_json', methods=['POST'])
def generate_json_route():
    data = request.json
    final_json = {}
    final_json["@title"] = {"RU": data.get('title_ru', ''), "EN": data.get('title_en', '')}
    final_json["@description"] = {"RU": data.get('desc_ru', ''), "EN": data.get('desc_en', '')}
    final_json["@author"] = data.get('author', 'User')
    final_json["@version"] = "1.0.0"
    for mod in data.get('mods', []):
        csv_key = mod['filename'].replace('.csv', '')
        if mod['changes']:
            if csv_key not in final_json: final_json[csv_key] = {}
            final_json[csv_key][mod['key']] = mod['changes']
    return jsonify(final_json)
@app.route('/')
def index():
    csv_files = get_csv_files_info()
    return render_template_string(HTML_TEMPLATE, csv_files=csv_files)
if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0', threaded=True)