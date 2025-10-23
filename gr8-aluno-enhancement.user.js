// ==UserScript==
// @name         GR8 Aluno — GR8+ Melhorias Completas
// @namespace    https://alunos.gr8.com.br/
// @version      1.1.0
// @description  Conjunto de melhorias para portal GR8 Aluno: modo escuro, compact view, export CSV, destacar notas baixas, calcular médias, impressão, auto-refresh, atalhos, persistência de preferências e monitoramento de Single-Page Apps.
// @author       ChatGPT (GPT-5)
// @match        https://alunos.gr8.com.br/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* -------------------- CONFIG / STORAGE -------------------- */
  const STORAGE_KEY = 'gr8plus.settings.v1';
  const DEFAULTS = {
    lowGradeThreshold: 6.0,
    autoRefreshMinutes: 0,
    compactTableDefault: false,
    darkModeDefault: false,
    addKeyboardShortcuts: true,
    csvFilename: 'gr8-notas-export.csv',
    highlightLowGrades: true,
    autoCalcOnChange: true
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) {
      console.warn('GR8+: erro ao carregar settings, usando defaults', e);
      return { ...DEFAULTS };
    }
  }
  function saveSettings(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }
  const CONFIG = loadSettings();

  /* -------------------- HELPERS -------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function parseFloatFromText(txt) {
    if (!txt) return null;
    const cleaned = ('' + txt).replace(/\s+/g, ' ').replace(',', '.');
    const m = cleaned.match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  function downloadBlob(content, filename, mime = 'text/csv;charset=utf-8;') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* -------------------- STYLES -------------------- */
  const STYLE_ID = 'gr8plus-style';
  const STYLE = `
  #gr8plus-panel { position: fixed; right: 14px; bottom: 14px; z-index: 999999; background: rgba(255,255,255,0.96); border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.12); padding: 10px; font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; width: 280px; max-width: 90vw; }
  #gr8plus-panel h4 { margin:0 0 6px 0; font-size:14px }
  #gr8plus-panel .row { display:flex; gap:8px; align-items:center; margin-top:6px; flex-wrap:wrap; }
  #gr8plus-panel button, #gr8plus-panel select { padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.08); background:#fff; cursor:pointer; font-size:13px; }
  #gr8plus-panel input[type='number'], #gr8plus-panel input[type='text'] { padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.08); font-size:13px; width:100px; }
  .gr8-dark-mode { background:#071020 !important; color:#e6eef8 !important; }
  .gr8-dark-mode table, .gr8-dark-mode th, .gr8-dark-mode td { border-color: rgba(255,255,255,0.06) !important; }
  .gr8-compact table { font-size:13px !important; letter-spacing:0.2px; }
  .gr8-low-grade { background: linear-gradient(90deg,#fff7ee,#ffecec) !important; border-left: 4px solid #ff6b6b !important; }
  .gr8-print-target { /* marker for print CSS */ }
  @media print {
    body * { visibility: hidden; }
    .gr8-print-target, .gr8-print-target * { visibility: visible; }
    .gr8-print-target { position: initial; left:0; top:0; }
  }
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  /* -------------------- PANEL UI -------------------- */
  function createPanel() {
    if ($('#gr8plus-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'gr8plus-panel';
    panel.innerHTML = `
      <h4>GR8+ — Melhorias</h4>
      <div style="font-size:12px;opacity:.85">Ferramentas rápidas para o portal GR8 Aluno</div>

      <div class="row">
        <button id="gr8-btn-dark">Alternar Modo Escuro</button>
        <button id="gr8-btn-compact">Compactar Tabelas</button>
      </div>

      <div class="row">
        <button id="gr8-btn-calc">Calcular Médias</button>
        <button id="gr8-btn-export">Exportar Notas (CSV)</button>
      </div>

      <div class="row">
        <button id="gr8-btn-print">Imprimir Tabela</button>
        <button id="gr8-btn-clear-highlights">Limpar Destaques</button>
      </div>

      <div class="row" style="margin-top:8px;">
        <label style="font-size:13px">Limiar <input id="gr8-threshold" type="number" step="0.1" min="0" max="10" value="${CONFIG.lowGradeThreshold}" /></label>
        <label style="font-size:13px">Nome CSV <input id="gr8-csvfile" type="text" value="${CONFIG.csvFilename}" /></label>
      </div>

      <div class="row" style="margin-top:8px;">
        <label style="font-size:13px"><input id="gr8-autorefresh" type="number" min="0" step="1" style="width:70px" value="${CONFIG.autoRefreshMinutes}" /> min auto-refresh</label>
        <label style="font-size:13px"><input id="gr8-auto-calc" type="checkbox" ${CONFIG.autoCalcOnChange ? 'checked' : ''}/> auto-calc</label>
      </div>

      <div class="row" style="margin-top:8px;">
        <button id="gr8-save-settings">Salvar</button>
        <button id="gr8-reset-settings">Reset</button>
      </div>

      <div style="margin-top:8px;font-size:12px;opacity:.8">Atalhos: Alt+D (escuro), Alt+C (compacto), Alt+E (export), Alt+M (médias)</div>
    `;
    document.body.appendChild(panel);

    // bind
    $('#gr8-btn-dark').addEventListener('click', toggleDarkMode);
    $('#gr8-btn-compact').addEventListener('click', toggleCompact);
    $('#gr8-btn-calc').addEventListener('click', highlightAndCalc);
    $('#gr8-btn-export').addEventListener('click', exportGradesCSV);
    $('#gr8-btn-print').addEventListener('click', printFirstTable);
    $('#gr8-btn-clear-highlights').addEventListener('click', clearHighlights);

    $('#gr8-save-settings').addEventListener('click', () => {
      CONFIG.lowGradeThreshold = parseFloat($('#gr8-threshold').value) || DEFAULTS.lowGradeThreshold;
      CONFIG.csvFilename = ($('#gr8-csvfile').value || DEFAULTS.csvFilename).trim();
      CONFIG.autoRefreshMinutes = parseInt($('#gr8-autorefresh').value) || 0;
      CONFIG.autoCalcOnChange = !!$('#gr8-auto-calc').checked;
      saveSettings(CONFIG);
      startAutoRefresh(CONFIG.autoRefreshMinutes);
      showToast('Configurações salvas');
    });

    $('#gr8-reset-settings').addEventListener('click', () => {
      Object.assign(CONFIG, DEFAULTS);
      saveSettings(CONFIG);
      // update UI
      $('#gr8-threshold').value = CONFIG.lowGradeThreshold;
      $('#gr8-csvfile').value = CONFIG.csvFilename;
      $('#gr8-autorefresh').value = CONFIG.autoRefreshMinutes;
      $('#gr8-auto-calc').checked = CONFIG.autoCalcOnChange;
      showToast('Configurações restauradas');
      startAutoRefresh(CONFIG.autoRefreshMinutes);
    });
  }

  /* -------------------- Toast (pequenas mensagens) -------------------- */
  const TOAST_ID = 'gr8plus-toast';
  function showToast(msg, ms = 2200) {
    let t = document.getElementById(TOAST_ID);
    if (!t) {
      t = document.createElement('div');
      t.id = TOAST_ID;
      t.style.position = 'fixed';
      t.style.right = '16px';
      t.style.bottom = '120px';
      t.style.zIndex = '999999';
      t.style.background = 'rgba(0,0,0,0.8)';
      t.style.color = '#fff';
      t.style.padding = '8px 12px';
      t.style.borderRadius = '8px';
      t.style.fontSize = '13px';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, ms);
  }

  /* -------------------- Table detection & parsing -------------------- */
  function candidateTables() {
    const all = $all('table');
    if (!all.length) return [];
    // Score tables by presence of keywords in header or nearby labels
    function scoreTable(t) {
      const txt = (t.innerText || '').toLowerCase();
      let score = 0;
      if (/disciplina|matéria|materia|nota|média|media|avaliacao|avaliação|bimestre|semestre|conceito/.test(txt)) score += 3;
      // fewer columns might be actual list; reward tables with 3-8 columns
      const cols = t.querySelectorAll('tr:first-child th, tr:first-child td').length || 0;
      if (cols >= 2 && cols <= 8) score += 1;
      // prefer tables inside main content
      if (t.closest('main') || t.closest('#content') || /content|main|app/.test((t.parentElement && t.parentElement.id) || '')) score += 1;
      return score;
    }
    const scored = all.map(t => ({ t, s: scoreTable(t) })).sort((a,b)=>b.s-a.s);
    // return top 3 candidates with score>0, otherwise up to 3 first tables
    const filtered = scored.filter(x => x.s>0).slice(0,3).map(x=>x.t);
    return filtered.length ? filtered : all.slice(0,3);
  }

  /* -------------------- Highlight & Calculate -------------------- */
  function clearHighlights() {
    $all('.gr8-low-grade').forEach(el => el.classList.remove('gr8-low-grade'));
    $all('.gr8-summary').forEach(el => el.remove());
    showToast('Destaques limpos');
  }

  function highlightAndCalc() {
    const tables = candidateTables();
    if (!tables.length) { showToast('Nenhuma tabela encontrada'); return; }
    tables.forEach(table => {
      table.classList.add('gr8-print-target');
      // ensure tbody exists
      const rows = Array.from(table.querySelectorAll('tbody tr')).length ? Array.from(table.querySelectorAll('tbody tr')) : Array.from(table.querySelectorAll('tr')).slice(1);
      let sum = 0, count = 0;
      rows.forEach(row => {
        // try to find grade cell in the row
        const tds = Array.from(row.querySelectorAll('td, th'));
        let found = false;
        for (const td of tds) {
          const val = parseFloatFromText(td.textContent);
          if (val !== null && !isNaN(val)) {
            // heurística: notas normalmente entre 0 e 10 ou 0-100; prefer 0-10
            if (val >= 0 && val <= 100) {
              found = true;
              // normalize if value > 10 and likely percent -> ignore as average candidate (but still include)
              let normalized = val;
              if (val > 10 && val <= 100) {
                // if majority values >10, don't normalize; but for single cell we treat as percent: convert to 0-10 if <=100
                normalized = (val > 10 && val <= 100) ? (val/10) : val;
              }
              sum += normalized;
              count++;
              if (CONFIG.highlightLowGrades && normalized < CONFIG.lowGradeThreshold) {
                row.classList.add('gr8-low-grade');
              }
              break;
            }
          }
        }
      });
      const avg = count ? (sum / count) : null;
      // insert or update summary above table
      let summary = table.previousElementSibling && table.previousElementSibling.classList && table.previousElementSibling.classList.contains('gr8-summary') ? table.previousElementSibling : null;
      if (!summary) {
        summary = document.createElement('div');
        summary.className = 'gr8-summary';
        summary.style.margin = '8px 0';
        table.parentNode.insertBefore(summary, table);
      }
      summary.innerHTML = `<strong>Resumo GR8+</strong>: ${count?('Média aproximada: <strong>'+ (avg.toFixed(2)) +'</strong> — '+count+' itens'):'Nenhuma nota detectada.'} ` +
        `Limiar: ${CONFIG.lowGradeThreshold}.`;
    });
    showToast('Médias calculadas & destaques aplicados');
  }

  /* -------------------- CSV Export -------------------- */
  function sanitizeCell(text) {
    if (text === null || text === undefined) return '';
    // remove excessive whitespace, escape quotes
    return ('' + text).replace(/\r?\n/g,' ').trim().replace(/"/g, '""');
  }

  function exportGradesCSV() {
    const tables = candidateTables();
    if (!tables.length) { showToast('Nenhuma tabela encontrada para exportar'); return; }
    const parts = [];
    tables.forEach((table, idx) => {
      const headerCells = Array.from(table.querySelectorAll('thead th')).map(th => sanitizeCell(th.textContent));
      // fallback: try first row as header if thead missing
      if (!headerCells.length) {
        const firstRowCells = Array.from(table.querySelectorAll('tr:first-child td, tr:first-child th')).map(c => sanitizeCell(c.textContent));
        if (firstRowCells.length) headerCells.push(...firstRowCells);
      }
      parts.push(`"Tabela ${idx+1}"`);
      if (headerCells.length) parts.push(headerCells.map(h => `"${h}"`).join(','));
      const rows = Array.from(table.querySelectorAll('tbody tr')).length ? Array.from(table.querySelectorAll('tbody tr')) : Array.from(table.querySelectorAll('tr')).slice(headerCells.length?1:0);
      rows.forEach(row => {
        const cols = Array.from(row.querySelectorAll('td, th')).map(td => `"${sanitizeCell(td.textContent)}"`);
        if (cols.length) parts.push(cols.join(','));
      });
      parts.push(''); // blank line separator
    });
    const csv = parts.join('\n');
    const filename = CONFIG.csvFilename || DEFAULTS.csvFilename;
    downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
    showToast(`CSV gerado: ${filename}`);
  }

  /* -------------------- Print -------------------- */
  function printFirstTable() {
    const t = candidateTables()[0];
    if (!t) { showToast('Nenhuma tabela para imprimir'); return; }
    // mark only this as print-target
    $all('.gr8-print-target').forEach(el => el.classList.remove('gr8-print-target'));
    t.classList.add('gr8-print-target');
    window.print();
  }

  /* -------------------- Auto Refresh -------------------- */
  let _autoRefTimer = null;
  function startAutoRefresh(minutes) {
    stopAutoRefresh();
    if (!minutes || minutes <= 0) return;
    _autoRefTimer = setInterval(() => location.reload(), minutes * 60 * 1000);
  }
  function stopAutoRefresh() {
    if (_autoRefTimer) clearInterval(_autoRefTimer);
    _autoRefTimer = null;
  }

  /* -------------------- Shortcuts -------------------- */
  function setupShortcuts() {
    if (!CONFIG.addKeyboardShortcuts) return;
    window.addEventListener('keydown', (e) => {
      if (!e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'd') { e.preventDefault(); toggleDarkMode(); }
      if (k === 'c') { e.preventDefault(); toggleCompact(); }
      if (k === 'e') { e.preventDefault(); exportGradesCSV(); }
      if (k === 'm') { e.preventDefault(); highlightAndCalc(); }
    });
  }

  /* -------------------- Dark / Compact toggles -------------------- */
  function toggleDarkMode() {
    document.documentElement.classList.toggle('gr8-dark-mode');
    // persist preference in CONFIG
    CONFIG.darkModeDefault = document.documentElement.classList.contains('gr8-dark-mode');
    saveSettings(CONFIG);
  }
  function toggleCompact() {
    document.documentElement.classList.toggle('gr8-compact');
    CONFIG.compactTableDefault = document.documentElement.classList.contains('gr8-compact');
    saveSettings(CONFIG);
    showToast('Compact view ' + (CONFIG.compactTableDefault ? 'ativado' : 'desativado'));
  }

  /* -------------------- Mutation observer for SPAs + auto-calc -------------------- */
  let mutationTimer = null;
  function observeDOMChanges() {
    const mo = new MutationObserver((mutations) => {
      // debounce multiple mutations
      if (mutationTimer) clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => {
        if (CONFIG.autoCalcOnChange) highlightAndCalc();
      }, 700);
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: false });
    return mo;
  }

  /* -------------------- Init -------------------- */
  function init() {
    injectStyle();
    createPanel();
    // apply defaults if toggles set in CONFIG
    if (CONFIG.darkModeDefault) document.documentElement.classList.add('gr8-dark-mode');
    if (CONFIG.compactTableDefault) document.documentElement.classList.add('gr8-compact');
    setupShortcuts();
    startAutoRefresh(CONFIG.autoRefreshMinutes);
    observeDOMChanges();
    // initial calculation after load
    setTimeout(() => { try { highlightAndCalc(); } catch(e) { console.warn('GR8+: cálculo inicial falhou', e); } }, 900);
    console.info('GR8+ (melhorias) carregado — atalho Alt+D/C/E/M');
  }

  // run
  init();

})();
