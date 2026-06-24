// ── Pixel Art Quiz Module ─────────────────────────────────────────────────────
// Handles the pixel_art quiz question type: 16×16 pixel canvas with binary
// colour selection, regular calculator, drawing tools, and Drive submission.

(function () {
  'use strict';

  // ── Colour maps ───────────────────────────────────────────────────────────
  // Each map has exactly 16 colours. Index 0 is always black.

  var COLOR_MAPS = [
    { id: 'classic',    name: 'Classic 16', colors: [
      '#000000','#ffffff','#ff2200','#00bb00','#0000ff','#ffff00','#ff00ff','#00ffff',
      '#888888','#cccccc','#ff8800','#9900cc','#00aa88','#aa0000','#0055cc','#ffaa66'
    ]},
    { id: 'pastel',     name: 'Pastel Dream', colors: [
      '#000000','#ffd6e0','#ffc0cb','#ffb3ba','#ffdfba','#ffffba','#baffc9','#bae1ff',
      '#e8baff','#ffbaf6','#c9baff','#bafff0','#fff0ba','#d4f0d4','#f0d4d4','#ffffff'
    ]},
    { id: 'neon',       name: 'Neon City', colors: [
      '#000000','#ff0066','#ff3300','#ff8800','#ffee00','#aaff00','#00ff44','#00ffcc',
      '#00aaff','#0044ff','#aa00ff','#ff00cc','#ff77aa','#77ffcc','#77aaff','#ffffff'
    ]},
    { id: 'sunset',     name: 'Sunset', colors: [
      '#000000','#0d0518','#2a0a2e','#4a1030','#7a1530','#aa2020','#d04020','#e86020',
      '#f08840','#f5aa60','#f8c880','#fae0a0','#fceebb','#fff0cc','#fff8e6','#ffffff'
    ]},
    { id: 'ocean',      name: 'Ocean Depths', colors: [
      '#000000','#020a18','#041830','#063050','#084878','#0a68a0','#1088c8','#20a8e0',
      '#40c0f0','#70d8f8','#a0e8ff','#c0f4ff','#003344','#006699','#0088bb','#e0f8ff'
    ]},
    { id: 'forest',     name: 'Forest', colors: [
      '#000000','#0a0d00','#141e00','#223200','#334d00','#446600','#5a8800','#72aa10',
      '#8acc30','#a0e050','#b8f070','#cef890','#3d1e00','#6b3500','#9a5a00','#d4a060'
    ]},
    { id: 'grayscale',  name: 'Grayscale', colors: [
      '#000000','#111111','#222222','#333333','#444444','#555555','#666666','#777777',
      '#888888','#999999','#aaaaaa','#bbbbbb','#cccccc','#dddddd','#eeeeee','#ffffff'
    ]},
    { id: 'retrocga',   name: 'Retro CGA', colors: [
      '#000000','#0000aa','#00aa00','#00aaaa','#aa0000','#aa00aa','#aa5500','#aaaaaa',
      '#555555','#5555ff','#55ff55','#55ffff','#ff5555','#ff55ff','#ffff55','#ffffff'
    ]},
    { id: 'candy',      name: 'Candy Shop', colors: [
      '#000000','#ff0090','#ff4499','#ff88bb','#ffbbdd','#ff4400','#ff8833','#ffcc66',
      '#ffff99','#99ff33','#55dd00','#00aa00','#0099ff','#0044cc','#6600cc','#ffffff'
    ]},
    { id: 'autumn',     name: 'Autumn', colors: [
      '#000000','#1a0800','#3d1400','#6b2800','#994400','#c86000','#e87c20','#f09a40',
      '#f8b860','#f5d080','#eed8a0','#f0e8b8','#556600','#334400','#223300','#f5f0e0'
    ]},
    { id: 'arctic',     name: 'Arctic', colors: [
      '#000000','#0a1428','#142850','#1e3c78','#285098','#3268b8','#4080cc','#589ae0',
      '#78b4e8','#98ccf0','#b8e4f8','#d8f4ff','#003344','#00556a','#007799','#f0faff'
    ]},
    { id: 'volcano',    name: 'Volcano', colors: [
      '#000000','#1a0000','#3d0000','#6b0000','#990000','#cc1100','#ee2200','#ff5500',
      '#ff7700','#ff9900','#ffbb00','#ffdd00','#ffee44','#fff088','#fff8cc','#ffffff'
    ]},
    { id: 'minecraft',  name: 'Minecraft', colors: [
      '#000000','#ffffff','#9d9d97','#474f52','#8b5a2b','#c8a064','#7cbd1f','#546d28',
      '#5dc5e2','#3c6eb4','#e57540','#d83030','#b045c4','#7033b0','#f0d858','#f5e8a0'
    ]},
    { id: 'rainbow',    name: 'Rainbow', colors: [
      '#000000','#ff0000','#ff4400','#ff8800','#ffcc00','#ffff00','#aaff00','#00ff00',
      '#00ffaa','#00ffff','#00aaff','#0000ff','#4400ff','#8800ff','#cc00ff','#ffffff'
    ]},
    { id: 'gameboy',    name: 'Game Boy', colors: [
      '#000000','#0f380f','#306230','#8bac0f','#9bbc0f','#88a820','#557028','#184028',
      '#082018','#0a2a10','#365020','#607040','#889060','#a0a870','#b8b888','#d0d0b0'
    ]},
    { id: 'synthwave',  name: 'Synthwave', colors: [
      '#000000','#0d0221','#190d4a','#2b0f69','#4a0080','#7a00aa','#aa10cc','#dd40ee',
      '#ff60ff','#ff2266','#ff6600','#ffaa00','#00ffcc','#00aaff','#ffffff','#ffddff'
    ]},
  ];

  // ── Module state ──────────────────────────────────────────────────────────

  var PA_GRID   = 16;
  var PA_CELL   = 32;           // internal canvas px per grid cell
  var PA_SIZE   = PA_GRID * PA_CELL; // 512
  var PA_TIMER  = 20;           // seconds a colour selection lasts

  var pa = {
    pixels:    null,            // Uint8Array(256) colour indices
    mapId:     'classic',
    colorIdx:  -1,              // currently selected colour index (-1 = none)
    timerEnd:  0,
    timerRaf:  null,
    tool:      'paint',         // 'paint' | 'line' | 'fill'
    lineStart: null,            // {x,y} while placing line
    mouseDown: false,
    buffer:    '',              // binary digit buffer
    calcExpr:  '',              // calculator display string
    qIdx:      -1,
    dead:      false,           // true after submit, disables input
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getMap()    { return COLOR_MAPS.find(function(m){ return m.id === pa.mapId; }) || COLOR_MAPS[0]; }
  function getColors() { return getMap().colors; }
  function getCanvas() { return document.getElementById('qs-pa-canvas'); }
  function getCtx()    { var c = getCanvas(); return c ? c.getContext('2d') : null; }
  function d2b(n)      { return ('0000' + n.toString(2)).slice(-4); }

  // ── Canvas rendering ──────────────────────────────────────────────────────

  function redraw(overlay, showGrid) {
    var ctx = getCtx();
    if (!ctx || !pa.pixels) return;
    var colors = getColors();
    ctx.imageSmoothingEnabled = false;
    for (var i = 0; i < PA_GRID * PA_GRID; i++) {
      var x  = i % PA_GRID;
      var y  = Math.floor(i / PA_GRID);
      var ci = (overlay && overlay[i] !== undefined) ? overlay[i] : pa.pixels[i];
      ctx.fillStyle = colors[ci];
      ctx.fillRect(x * PA_CELL, y * PA_CELL, PA_CELL, PA_CELL);
    }
    if (showGrid !== false) drawGrid(ctx);
  }

  function drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth   = 0.5;
    for (var g = 1; g < PA_GRID; g++) {
      ctx.beginPath(); ctx.moveTo(g * PA_CELL, 0);          ctx.lineTo(g * PA_CELL, PA_SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,          g * PA_CELL); ctx.lineTo(PA_SIZE,     g * PA_CELL); ctx.stroke();
    }
  }

  function cellAt(canvas, cx, cy) {
    var rect = canvas.getBoundingClientRect();
    var px = Math.floor((cx - rect.left) / rect.width  * PA_GRID);
    var py = Math.floor((cy - rect.top)  / rect.height * PA_GRID);
    return { x: Math.max(0, Math.min(PA_GRID - 1, px)),
             y: Math.max(0, Math.min(PA_GRID - 1, py)) };
  }

  // ── Drawing tools ─────────────────────────────────────────────────────────

  function paintCell(x, y) {
    if (pa.colorIdx < 0) return;
    pa.pixels[y * PA_GRID + x] = pa.colorIdx;
    var ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = getColors()[pa.colorIdx];
    ctx.fillRect(x * PA_CELL, y * PA_CELL, PA_CELL, PA_CELL);
    // Restore grid lines over this cell
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth   = 0.5;
    if (x > 0)            { ctx.beginPath(); ctx.moveTo(x*PA_CELL, y*PA_CELL); ctx.lineTo(x*PA_CELL, (y+1)*PA_CELL); ctx.stroke(); }
    if (y > 0)            { ctx.beginPath(); ctx.moveTo(x*PA_CELL, y*PA_CELL); ctx.lineTo((x+1)*PA_CELL, y*PA_CELL); ctx.stroke(); }
  }

  function bresenham(x0, y0, x1, y1) {
    var pts = [];
    var dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    for (;;) {
      pts.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 <  dx) { err += dx; y0 += sy; }
    }
    return pts;
  }

  function floodFill(sx, sy) {
    if (pa.colorIdx < 0) return;
    var oldIdx = pa.pixels[sy * PA_GRID + sx];
    var newIdx = pa.colorIdx;
    if (oldIdx === newIdx) return;
    var stack = [sy * PA_GRID + sx];
    var vis   = new Uint8Array(PA_GRID * PA_GRID);
    while (stack.length) {
      var idx = stack.pop();
      var x = idx % PA_GRID, y = Math.floor(idx / PA_GRID);
      if (x < 0 || x >= PA_GRID || y < 0 || y >= PA_GRID || vis[idx] || pa.pixels[idx] !== oldIdx) continue;
      vis[idx]      = 1;
      pa.pixels[idx] = newIdx;
      stack.push(idx + 1, idx - 1, idx + PA_GRID, idx - PA_GRID);
    }
    redraw();
  }

  // ── Canvas event handlers ─────────────────────────────────────────────────

  function onDown(e) {
    if (pa.dead) return;
    e.preventDefault();
    var c = getCanvas(); if (!c) return;
    var pt   = e.touches ? e.touches[0] : e;
    var cell = cellAt(c, pt.clientX, pt.clientY);

    if (pa.tool === 'paint') {
      if (pa.colorIdx < 0) { flashNeedColour(); return; }
      pa.mouseDown = true;
      paintCell(cell.x, cell.y);
      scheduleSave();
    } else if (pa.tool === 'fill') {
      if (pa.colorIdx < 0) { flashNeedColour(); return; }
      floodFill(cell.x, cell.y);
      scheduleSave();
    } else if (pa.tool === 'line') {
      if (pa.colorIdx < 0) { flashNeedColour(); return; }
      if (!pa.lineStart) {
        pa.lineStart = cell;
        highlightLineStart(cell);
      } else {
        var pts = bresenham(pa.lineStart.x, pa.lineStart.y, cell.x, cell.y);
        pts.forEach(function(p) { pa.pixels[p.y * PA_GRID + p.x] = pa.colorIdx; });
        pa.lineStart = null;
        redraw();
        scheduleSave();
      }
    }
  }

  function onMove(e) {
    if (pa.dead) return;
    e.preventDefault();
    var c = getCanvas(); if (!c) return;
    var pt   = e.touches ? e.touches[0] : e;
    var cell = cellAt(c, pt.clientX, pt.clientY);

    if (pa.tool === 'paint' && pa.mouseDown && pa.colorIdx >= 0) {
      paintCell(cell.x, cell.y);
    } else if (pa.tool === 'line' && pa.lineStart && pa.colorIdx >= 0) {
      var ov = Array.from(pa.pixels);
      var pts = bresenham(pa.lineStart.x, pa.lineStart.y, cell.x, cell.y);
      pts.forEach(function(p) { ov[p.y * PA_GRID + p.x] = pa.colorIdx; });
      redraw(ov);
    }
  }

  function onUp(e) {
    if (pa.mouseDown) { pa.mouseDown = false; scheduleSave(); }
  }

  function highlightLineStart(cell) {
    // Draw a small dot to show where the line starts
    var ctx = getCtx(); if (!ctx) return;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    var cx = cell.x * PA_CELL + PA_CELL / 2;
    var cy = cell.y * PA_CELL + PA_CELL / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, PA_CELL * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── LocalStorage save/restore ─────────────────────────────────────────────

  var _saveTimer = null;
  function storageKey() { return 'pylearn_pa_' + (typeof quiz !== 'undefined' ? (quiz.lobbyCode || '') : '') + '_' + pa.qIdx; }

  function scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() {
      try { localStorage.setItem(storageKey(), JSON.stringify(Array.from(pa.pixels))); } catch(_) {}
    }, 400);
  }

  function restoreFromStorage() {
    try {
      var raw = localStorage.getItem(storageKey());
      if (!raw) return false;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length !== 256) return false;
      for (var i = 0; i < 256; i++) pa.pixels[i] = arr[i] & 0xf;
      redraw();
      return true;
    } catch(_) { return false; }
  }

  function clearStorage() {
    try { localStorage.removeItem(storageKey()); } catch(_) {}
  }

  // ── Binary input ──────────────────────────────────────────────────────────

  function paKeyHandler(e) {
    if (pa.dead) return;
    var panel = document.getElementById('qs-pixel-art-answer');
    if (!panel || panel.classList.contains('hidden')) return;
    if (e.key === '0' || e.key === '1') {
      e.preventDefault();
      pa.buffer = (pa.buffer + e.key).slice(0, 4);
      renderBinaryDisplay();
      if (pa.buffer.length === 4) commitBinary();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      pa.buffer = pa.buffer.slice(0, -1);
      renderBinaryDisplay();
    }
  }

  function pushBit(bit) { paKeyHandler({ key: String(bit), preventDefault: function(){} }); }
  function backspaceBit() { paKeyHandler({ key: 'Backspace', preventDefault: function(){} }); }

  function commitBinary() {
    var idx = parseInt(pa.buffer, 2);
    pa.buffer = '';
    renderBinaryDisplay();
    startColourTimer(idx);
  }

  function renderBinaryDisplay() {
    var container = document.getElementById('pa-binary-cells');
    if (!container) return;
    container.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      var bit = pa.buffer[i];
      var div = document.createElement('div');
      div.style.cssText =
        'width:36px;height:44px;border-radius:6px;display:flex;align-items:center;justify-content:center;' +
        'font-size:1.5rem;font-weight:700;font-family:monospace;color:#e2e8f0;' +
        'border:2px solid ' + (i < pa.buffer.length ? '#3b82f6' : (i === pa.buffer.length ? '#6366f1' : '#334155')) + ';' +
        'background:' + (i < pa.buffer.length ? '#1e3a5f' : '#0f172a') + ';' +
        (i === pa.buffer.length ? 'box-shadow:0 0 0 3px rgba(99,102,241,0.4);' : '');
      div.textContent = bit !== undefined ? bit : '';
      container.appendChild(div);
    }
    var hint = document.getElementById('pa-binary-hint');
    if (hint) {
      if (pa.buffer.length > 0 && pa.buffer.length < 4) {
        hint.textContent = pa.buffer.length + ' of 4 bits entered…';
        hint.style.color = '#6366f1';
      } else {
        hint.textContent = 'Type 0 or 1 on keyboard';
        hint.style.color = '#475569';
      }
    }
  }

  // ── Colour timer ──────────────────────────────────────────────────────────

  function startColourTimer(idx) {
    stopColourTimer();
    pa.colorIdx = idx;
    pa.timerEnd = Date.now() + PA_TIMER * 1000;
    document.getElementById('pa-timer-wrap')    && (document.getElementById('pa-timer-wrap').style.display    = '');
    document.getElementById('pa-timer-expired') && (document.getElementById('pa-timer-expired').style.display = 'none');
    renderSelectedColour();
    renderPalette();
    tickTimer();
  }

  function stopColourTimer() {
    if (pa.timerRaf) { cancelAnimationFrame(pa.timerRaf); pa.timerRaf = null; }
  }

  function tickTimer() {
    var rem  = Math.max(0, pa.timerEnd - Date.now());
    var secs = document.getElementById('pa-timer-secs');
    var bar  = document.getElementById('pa-timer-bar');
    if (secs) secs.textContent = Math.ceil(rem / 1000) + 's';
    if (bar)  bar.style.width  = (rem / (PA_TIMER * 1000) * 100) + '%';
    if (rem <= 0) {
      pa.colorIdx = -1;
      document.getElementById('pa-timer-wrap')    && (document.getElementById('pa-timer-wrap').style.display    = 'none');
      document.getElementById('pa-timer-expired') && (document.getElementById('pa-timer-expired').style.display = '');
      renderSelectedColour();
      renderPalette();
      return;
    }
    pa.timerRaf = requestAnimationFrame(tickTimer);
  }

  function renderSelectedColour() {
    var swatch  = document.getElementById('pa-sel-swatch');
    var label   = document.getElementById('pa-sel-label');
    var colors  = getColors();
    if (pa.colorIdx < 0) {
      if (swatch) { swatch.style.background = 'transparent'; swatch.style.border = '2px dashed #334155'; }
      if (label)  label.textContent = 'No colour selected';
    } else {
      if (swatch) { swatch.style.background = colors[pa.colorIdx]; swatch.style.border = '2px solid rgba(255,255,255,0.2)'; }
      if (label)  label.textContent = d2b(pa.colorIdx) + ' = ' + pa.colorIdx;
    }
  }

  // ── Palette ───────────────────────────────────────────────────────────────

  function renderPalette() {
    var container = document.getElementById('pa-palette');
    if (!container) return;
    var colors = getColors();
    container.innerHTML = '';
    for (var i = 0; i < 16; i++) {
      var row = document.createElement('div');
      var isSelected = i === pa.colorIdx;
      row.style.cssText =
        'display:flex;align-items:center;gap:7px;padding:3px 6px;border-radius:5px;cursor:default;' +
        (isSelected ? 'background:rgba(59,130,246,0.25);outline:1px solid #3b82f6;' : '');
      var sw = document.createElement('div');
      sw.style.cssText =
        'width:20px;height:20px;border-radius:3px;flex-shrink:0;border:1px solid rgba(255,255,255,0.15);background:' + colors[i];
      var lbl = document.createElement('span');
      lbl.style.cssText = 'font-family:monospace;font-size:0.72rem;color:' + (isSelected ? '#93c5fd' : '#64748b');
      lbl.textContent   = i + '';
      row.appendChild(sw);
      row.appendChild(lbl);
      container.appendChild(row);
    }
  }

  // ── Tool buttons ──────────────────────────────────────────────────────────

  function updateToolButtons() {
    ['paint', 'line', 'fill'].forEach(function(t) {
      var btn = document.getElementById('btn-pa-' + t);
      if (!btn) return;
      var active = t === pa.tool;
      btn.style.cssText =
        'padding:5px 10px;border-radius:5px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid;' +
        'border-color:' + (active ? '#3b82f6' : '#334155') + ';' +
        'background:'   + (active ? '#1e3a5f' : '#1e293b') + ';' +
        'color:'        + (active ? '#93c5fd' : '#94a3b8');
    });
  }

  function flashNeedColour() {
    var hint = document.getElementById('pa-binary-hint');
    if (!hint) return;
    var old = hint.textContent;
    hint.textContent = '⚠ Type binary first!';
    hint.style.color = '#f87171';
    setTimeout(function() {
      hint.textContent = old;
      hint.style.color = '#475569';
    }, 2000);
  }

  // ── Calculator ────────────────────────────────────────────────────────────
  // Standard arithmetic calculator. Students use it to add bit values
  // (e.g. 8+4+1 = 13, so they type 1101 to select colour 13).

  function initCalc() {
    pa.calcExpr = '';
    renderCalcDisplay('0');
    var grid = document.getElementById('pa-calc-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var btns = [
      ['7','8','9','÷'],
      ['4','5','6','×'],
      ['1','2','3','−'],
      ['C','0','=','+'],
    ];

    btns.forEach(function(row) {
      row.forEach(function(label) {
        var btn = document.createElement('button');
        btn.textContent = label;
        var isOp  = ['÷','×','−','+'].indexOf(label) >= 0;
        var isEq  = label === '=';
        var isCl  = label === 'C';
        btn.style.cssText =
          'padding:10px 0;border-radius:5px;font-size:0.95rem;font-weight:600;cursor:pointer;border:none;' +
          'background:' + (isCl ? '#7f1d1d' : isEq ? '#1d4ed8' : isOp ? '#334155' : '#1e293b') + ';' +
          'color:#e2e8f0;';
        btn.onclick = function() { calcPress(label); };
        grid.appendChild(btn);
      });
    });
  }

  function calcPress(key) {
    var dispEl = document.getElementById('pa-calc-display');
    if (key === 'C') {
      pa.calcExpr = '';
      renderCalcDisplay('0');
      return;
    }
    if (key === '=') {
      try {
        var expr = pa.calcExpr.replace(/÷/g, '/').replace(/×/g, '*').replace(/−/g, '-');
        var result = Function('"use strict"; return (' + expr + ')')();
        result = Math.round(result * 1e10) / 1e10; // fix float rounding
        pa.calcExpr = String(result);
        renderCalcDisplay(String(result));
      } catch (_) {
        renderCalcDisplay('Error');
        pa.calcExpr = '';
      }
      return;
    }
    // Operators
    var opMap = { '÷': '÷', '×': '×', '−': '−', '+': '+' };
    if (opMap[key]) {
      pa.calcExpr += key;
      renderCalcDisplay(pa.calcExpr);
      return;
    }
    // Digits
    pa.calcExpr += key;
    renderCalcDisplay(pa.calcExpr);
  }

  function renderCalcDisplay(val) {
    var el = document.getElementById('pa-calc-display');
    if (el) el.textContent = val || '0';
  }

  // ── Colour map select ─────────────────────────────────────────────────────

  function populateMapSelect() {
    var sel = document.getElementById('qs-pa-colormap');
    if (!sel) return;
    sel.innerHTML = '';
    COLOR_MAPS.forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (m.id === pa.mapId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = function() {
      pa.mapId = this.value;
      // Keep same index but show new colour
      redraw();
      renderPalette();
      renderSelectedColour();
    };
  }

  // ── Initialise question ───────────────────────────────────────────────────

  window.initPixelArtQuestion = function(qIdx) {
    pa.qIdx      = qIdx;
    pa.dead      = false;
    pa.pixels    = new Uint8Array(256); // all 0 = black
    pa.colorIdx  = -1;
    pa.buffer    = '';
    pa.tool      = 'paint';
    pa.lineStart = null;
    pa.mouseDown = false;
    pa.calcExpr  = '';
    stopColourTimer();

    // Replace canvas to clear old event listeners
    var oldCanvas = document.getElementById('qs-pa-canvas');
    if (oldCanvas) {
      var newCanvas = oldCanvas.cloneNode(false);
      newCanvas.width  = PA_SIZE;
      newCanvas.height = PA_SIZE;
      oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
    }

    // Restore saved pixel data (survives page refresh)
    if (!restoreFromStorage()) {
      // Default: all black — already done by Uint8Array init
    }
    redraw();

    // Canvas events
    var c = document.getElementById('qs-pa-canvas');
    if (c) {
      c.addEventListener('mousedown',  onDown, { passive: false });
      c.addEventListener('mousemove',  onMove, { passive: false });
      c.addEventListener('mouseup',    onUp);
      c.addEventListener('mouseleave', onUp);
      c.addEventListener('touchstart', onDown, { passive: false });
      c.addEventListener('touchmove',  onMove, { passive: false });
      c.addEventListener('touchend',   onUp);
    }

    // Tool buttons
    ['paint', 'line', 'fill'].forEach(function(tool) {
      var btn = document.getElementById('btn-pa-' + tool);
      if (btn) btn.onclick = function() {
        pa.tool      = tool;
        pa.lineStart = null;
        updateToolButtons();
      };
    });
    updateToolButtons();

    // Clear button
    var clrBtn = document.getElementById('btn-pa-clear');
    if (clrBtn) clrBtn.onclick = function() {
      pa.pixels.fill(0);
      pa.lineStart = null;
      redraw();
      scheduleSave();
    };

    // Submit button
    var subBtn = document.getElementById('btn-pa-submit');
    if (subBtn) {
      subBtn.disabled    = false;
      subBtn.textContent = 'Submit Drawing';
      subBtn.onclick = function() {
        if (typeof quiz !== 'undefined' && quiz.myAnswered) return;
        window.submitPixelArtAnswer(qIdx, subBtn, document.getElementById('pa-feedback'));
      };
    }

    // On-screen binary buttons (tablet support)
    var b0 = document.getElementById('btn-pa-bit-0');
    var b1 = document.getElementById('btn-pa-bit-1');
    var bs = document.getElementById('btn-pa-bit-bs');
    if (b0) b0.onclick = function() { pushBit(0); };
    if (b1) b1.onclick = function() { pushBit(1); };
    if (bs) bs.onclick = function() { backspaceBit(); };

    // Colour map, palette, binary display, timer, calc
    populateMapSelect();
    renderPalette();
    renderBinaryDisplay();
    renderSelectedColour();
    initCalc();

    var tw = document.getElementById('pa-timer-wrap');
    var te = document.getElementById('pa-timer-expired');
    if (tw) tw.style.display = 'none';
    if (te) te.style.display = 'none';

    // Keyboard handler
    document.removeEventListener('keydown', paKeyHandler);
    document.addEventListener('keydown', paKeyHandler);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  window.submitPixelArtAnswer = async function(qIdx, submitBtn, feedbackEl) {
    if (typeof quiz === 'undefined' || !quiz.sessionRef) return;
    if (quiz.myAnswered) return;

    function fb(msg, col) {
      if (feedbackEl) { feedbackEl.textContent = msg; feedbackEl.style.color = col || '#94a3b8'; }
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting…';
    fb('Connecting to Google Drive…');

    var token, folderId;
    try {
      token    = await window.driveEnsureStudentToken(feedbackEl);
      folderId = await window.driveLookupStudentFolder(quiz.sessionRef);
      if (!folderId) throw new Error('No Drive folder found. Ask your teacher to connect Google Drive before starting.');
    } catch (e) {
      fb('❌ ' + e.message, '#f87171');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Drawing';
      return;
    }

    fb('Creating image…');
    var blob;
    try { blob = await paToBlob(); } catch (e) {
      fb('❌ Could not create image: ' + e.message, '#f87171');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Drawing';
      return;
    }

    fb('Uploading…');
    var uid      = window.state && window.state.uid;
    var filename = String(uid || 'student') + '-pixel-art.png';
    var result;
    try {
      result = await Promise.race([
        window.driveUploadFile(folderId, filename, blob, 'image/png', token),
        new Promise(function(_, rej) { setTimeout(function() { rej(new Error('Upload timed out — tap Submit again.')); }, 45000); })
      ]);
    } catch (e) {
      fb('❌ ' + e.message, '#f87171');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Drawing';
      return;
    }

    try {
      await quiz.sessionRef.child('answers/' + qIdx + '/' + uid).set({
        fileId: result.id, fileName: result.name, submittedAt: Date.now()
      });
      quiz.myAnswered = true;
      if (typeof lockStudentAnswers === 'function') lockStudentAnswers();
      fb('✓ Drawing submitted!', '#4ade80');
      submitBtn.textContent = 'Submitted ✓';
      var msg = document.getElementById('qs-answered-msg');
      if (msg) msg.classList.remove('hidden');
      pa.dead = true;
      document.removeEventListener('keydown', paKeyHandler);
      clearStorage();
    } catch (e) {
      fb('❌ Could not save: ' + e.message, '#f87171');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Drawing';
    }
  };

  // Export a proper 16×16 PNG from the pixel data
  function paToBlob() {
    return new Promise(function(resolve, reject) {
      try {
        var c   = document.createElement('canvas');
        c.width = PA_GRID; c.height = PA_GRID;
        var ctx = c.getContext('2d');
        var colors = getColors();
        for (var i = 0; i < 256; i++) {
          ctx.fillStyle = colors[pa.pixels[i]];
          ctx.fillRect(i % PA_GRID, Math.floor(i / PA_GRID), 1, 1);
        }
        c.toBlob(function(b) { b ? resolve(b) : reject(new Error('toBlob returned null')); }, 'image/png');
      } catch (e) { reject(e); }
    });
  }

  // ── Export for use in showcase/voting display ─────────────────────────────
  // Called by quiz-student-module when rendering pixel_art images from Drive.
  window.PA_IS_PIXEL_ART_TYPE = function(type) { return type === 'pixel_art'; };

})();
