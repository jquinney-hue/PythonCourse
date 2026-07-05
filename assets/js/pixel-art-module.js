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

  // Shared with other binary-themed drawing games (e.g. the Byte Brawlers
  // t-shirt designer) so the 16-colour maps stay a single source of truth.
  try { window.PA_COLOR_MAPS = COLOR_MAPS; } catch (e) {}

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

  // ── Practice canvas (lesson step) ─────────────────────────────────────────
  // Self-contained pixel art canvas for lesson mode. Uses pra-* IDs so it
  // never clashes with the quiz panel (qs-pixel-art-answer / pa-* IDs).

  var pra = {
    pixels: null, mapId: 'classic', colorIdx: -1,
    timerEnd: 0, timerRaf: null, tool: 'paint',
    lineStart: null, mouseDown: false, buffer: '', calcExpr: ''
  };

  function praG(id)      { return document.getElementById(id); }
  function praColors()   { return (COLOR_MAPS.find(function(m){ return m.id === pra.mapId; }) || COLOR_MAPS[0]).colors; }

  function praRedraw(overlay) {
    var c = praG('pra-canvas'); if (!c || !pra.pixels) return;
    var ctx = c.getContext('2d'), colors = praColors();
    ctx.imageSmoothingEnabled = false;
    for (var i = 0; i < 256; i++) {
      var ci = (overlay && overlay[i] !== undefined) ? overlay[i] : pra.pixels[i];
      ctx.fillStyle = colors[ci];
      ctx.fillRect((i % 16) * 32, Math.floor(i / 16) * 32, 32, 32);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 0.5;
    for (var g = 1; g < 16; g++) {
      ctx.beginPath(); ctx.moveTo(g*32, 0);   ctx.lineTo(g*32, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,   g*32); ctx.lineTo(512,  g*32); ctx.stroke();
    }
  }

  function praPaint(x, y) {
    if (pra.colorIdx < 0) return;
    pra.pixels[y*16+x] = pra.colorIdx;
    var c = praG('pra-canvas'); if (!c) return;
    var ctx = c.getContext('2d');
    ctx.fillStyle = praColors()[pra.colorIdx];
    ctx.fillRect(x*32, y*32, 32, 32);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 0.5;
    if (x > 0) { ctx.beginPath(); ctx.moveTo(x*32, y*32); ctx.lineTo(x*32, (y+1)*32); ctx.stroke(); }
    if (y > 0) { ctx.beginPath(); ctx.moveTo(x*32, y*32); ctx.lineTo((x+1)*32, y*32); ctx.stroke(); }
  }

  function praFill(sx, sy) {
    if (pra.colorIdx < 0) return;
    var old = pra.pixels[sy*16+sx], nw = pra.colorIdx;
    if (old === nw) return;
    var stack = [sy*16+sx], vis = new Uint8Array(256);
    while (stack.length) {
      var idx = stack.pop(), x = idx%16, y = Math.floor(idx/16);
      if (x < 0 || x >= 16 || y < 0 || y >= 16 || vis[idx] || pra.pixels[idx] !== old) continue;
      vis[idx] = 1; pra.pixels[idx] = nw;
      stack.push(idx+1, idx-1, idx+16, idx-16);
    }
    praRedraw();
  }

  function praCellAt(c, cx, cy) {
    var r = c.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(15, Math.floor((cx - r.left) / r.width  * 16))),
      y: Math.max(0, Math.min(15, Math.floor((cy - r.top)  / r.height * 16)))
    };
  }

  function praFlashNeedColour() {
    var h = praG('pra-binary-hint'); if (!h) return;
    var old = h.textContent;
    h.textContent = 'Type binary first!'; h.style.color = '#f87171';
    setTimeout(function(){ h.textContent = old; h.style.color = '#475569'; }, 2000);
  }

  function praOnDown(e) {
    e.preventDefault();
    var c = praG('pra-canvas'); if (!c) return;
    var pt = e.touches ? e.touches[0] : e, cell = praCellAt(c, pt.clientX, pt.clientY);
    if (pra.tool === 'paint') {
      if (pra.colorIdx < 0) { praFlashNeedColour(); return; }
      pra.mouseDown = true; praPaint(cell.x, cell.y); praSave();
    } else if (pra.tool === 'fill') {
      if (pra.colorIdx < 0) { praFlashNeedColour(); return; }
      praFill(cell.x, cell.y); praSave();
    } else if (pra.tool === 'line') {
      if (pra.colorIdx < 0) { praFlashNeedColour(); return; }
      if (!pra.lineStart) { pra.lineStart = cell; }
      else {
        bresenham(pra.lineStart.x, pra.lineStart.y, cell.x, cell.y)
          .forEach(function(p){ pra.pixels[p.y*16+p.x] = pra.colorIdx; });
        pra.lineStart = null; praRedraw(); praSave();
      }
    }
  }

  function praOnMove(e) {
    e.preventDefault();
    var c = praG('pra-canvas'); if (!c) return;
    var pt = e.touches ? e.touches[0] : e, cell = praCellAt(c, pt.clientX, pt.clientY);
    if (pra.tool === 'paint' && pra.mouseDown && pra.colorIdx >= 0) {
      praPaint(cell.x, cell.y);
    } else if (pra.tool === 'line' && pra.lineStart && pra.colorIdx >= 0) {
      var ov = Array.from(pra.pixels);
      bresenham(pra.lineStart.x, pra.lineStart.y, cell.x, cell.y)
        .forEach(function(p){ ov[p.y*16+p.x] = pra.colorIdx; });
      praRedraw(ov);
    }
  }

  function praOnUp() { if (pra.mouseDown) { pra.mouseDown = false; praSave(); } }

  var _praSaveTimer = null;
  function praSave() {
    clearTimeout(_praSaveTimer);
    _praSaveTimer = setTimeout(function(){
      try { localStorage.setItem('pylearn_pra_practice', JSON.stringify(Array.from(pra.pixels))); } catch(_){}
    }, 400);
  }

  function praRestore() {
    try {
      var raw = localStorage.getItem('pylearn_pra_practice');
      if (!raw) return false;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length !== 256) return false;
      for (var i = 0; i < 256; i++) pra.pixels[i] = arr[i] & 0xf;
      praRedraw(); return true;
    } catch(_){ return false; }
  }

  function praRenderBinaryDisplay() {
    var container = praG('pra-binary-cells'); if (!container) return;
    container.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      var bit = pra.buffer[i], div = document.createElement('div');
      div.style.cssText =
        'width:36px;height:44px;border-radius:6px;display:flex;align-items:center;justify-content:center;' +
        'font-size:1.5rem;font-weight:700;font-family:monospace;color:#e2e8f0;' +
        'border:2px solid ' + (i < pra.buffer.length ? '#3b82f6' : (i === pra.buffer.length ? '#6366f1' : '#334155')) + ';' +
        'background:' + (i < pra.buffer.length ? '#1e3a5f' : '#0f172a') + ';' +
        (i === pra.buffer.length ? 'box-shadow:0 0 0 3px rgba(99,102,241,0.4);' : '');
      div.textContent = bit !== undefined ? bit : '';
      container.appendChild(div);
    }
    var hint = praG('pra-binary-hint');
    if (hint) {
      if (pra.buffer.length > 0 && pra.buffer.length < 4) {
        hint.textContent = pra.buffer.length + ' of 4 bits…'; hint.style.color = '#6366f1';
      } else {
        hint.textContent = 'Type 0 or 1 on keyboard'; hint.style.color = '#475569';
      }
    }
  }

  function praKeyHandler(e) {
    if (!praG('pra-canvas')) return;
    if (e.key === '0' || e.key === '1') {
      e.preventDefault();
      pra.buffer = (pra.buffer + e.key).slice(0, 4);
      praRenderBinaryDisplay();
      if (pra.buffer.length === 4) {
        var idx = parseInt(pra.buffer, 2); pra.buffer = '';
        praRenderBinaryDisplay(); praStartTimer(idx);
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault(); pra.buffer = pra.buffer.slice(0, -1); praRenderBinaryDisplay();
    }
  }

  function praStartTimer(idx) {
    praStopTimer();
    pra.colorIdx = idx; pra.timerEnd = Date.now() + 20000;
    var tw = praG('pra-timer-wrap'), te = praG('pra-timer-expired');
    if (tw) tw.style.display = ''; if (te) te.style.display = 'none';
    praRenderColour(); praRenderPalette(); praTick();
  }

  function praStopTimer() {
    if (pra.timerRaf) { cancelAnimationFrame(pra.timerRaf); pra.timerRaf = null; }
  }

  function praTick() {
    var rem = Math.max(0, pra.timerEnd - Date.now());
    var s = praG('pra-timer-secs'), b = praG('pra-timer-bar');
    if (s) s.textContent = Math.ceil(rem / 1000) + 's';
    if (b) b.style.width  = (rem / 20000 * 100) + '%';
    if (rem <= 0) {
      pra.colorIdx = -1;
      var tw = praG('pra-timer-wrap'), te = praG('pra-timer-expired');
      if (tw) tw.style.display = 'none'; if (te) te.style.display = '';
      praRenderColour(); praRenderPalette(); return;
    }
    pra.timerRaf = requestAnimationFrame(praTick);
  }

  function praRenderColour() {
    var sw = praG('pra-sel-swatch'), lb = praG('pra-sel-label'), colors = praColors();
    if (pra.colorIdx < 0) {
      if (sw) { sw.style.background = 'transparent'; sw.style.border = '2px dashed #334155'; }
      if (lb) lb.textContent = 'No colour selected';
    } else {
      if (sw) { sw.style.background = colors[pra.colorIdx]; sw.style.border = '2px solid rgba(255,255,255,0.2)'; }
      if (lb) lb.textContent = d2b(pra.colorIdx) + ' = ' + pra.colorIdx;
    }
  }

  function praRenderPalette() {
    var container = praG('pra-palette'); if (!container) return;
    var colors = praColors(); container.innerHTML = '';
    for (var i = 0; i < 16; i++) {
      var row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:7px;padding:3px 6px;border-radius:5px;cursor:default;' +
        (i === pra.colorIdx ? 'background:rgba(59,130,246,0.25);outline:1px solid #3b82f6;' : '');
      var sw = document.createElement('div');
      sw.style.cssText = 'width:20px;height:20px;border-radius:3px;flex-shrink:0;border:1px solid rgba(255,255,255,0.15);background:' + colors[i];
      var lb = document.createElement('span');
      lb.style.cssText = 'font-family:monospace;font-size:0.72rem;color:' + (i === pra.colorIdx ? '#93c5fd' : '#64748b');
      lb.textContent = i + '';
      row.appendChild(sw); row.appendChild(lb); container.appendChild(row);
    }
  }

  function praUpdateTools() {
    ['paint', 'line', 'fill'].forEach(function(t) {
      var btn = praG('btn-pra-' + t); if (!btn) return;
      var active = t === pra.tool;
      btn.style.borderColor = active ? '#3b82f6' : '#334155';
      btn.style.background  = active ? '#1e3a5f' : '#1e293b';
      btn.style.color       = active ? '#93c5fd' : '#94a3b8';
    });
  }

  function praInitCalc() {
    pra.calcExpr = ''; praCalcDisplay('0');
    var grid = praG('pra-calc-grid'); if (!grid) return;
    grid.innerHTML = '';
    [['7','8','9','÷'],['4','5','6','×'],['1','2','3','−'],['C','0','=','+']].forEach(function(row) {
      row.forEach(function(label) {
        var btn = document.createElement('button');
        btn.textContent = label;
        var isOp = ['÷','×','−','+'].indexOf(label) >= 0, isEq = label === '=', isCl = label === 'C';
        btn.style.cssText =
          'padding:10px 0;border-radius:5px;font-size:0.95rem;font-weight:600;cursor:pointer;border:none;' +
          'background:' + (isCl ? '#7f1d1d' : isEq ? '#1d4ed8' : isOp ? '#334155' : '#1e293b') + ';color:#e2e8f0;';
        btn.onclick = function() { praCalcPress(label); };
        grid.appendChild(btn);
      });
    });
  }

  function praCalcPress(key) {
    if (key === 'C') { pra.calcExpr = ''; praCalcDisplay('0'); return; }
    if (key === '=') {
      try {
        var r = Function('"use strict";return (' + pra.calcExpr.replace(/÷/g,'/').replace(/×/g,'*').replace(/−/g,'-') + ')')();
        r = Math.round(r * 1e10) / 1e10; pra.calcExpr = String(r); praCalcDisplay(String(r));
      } catch(_){ praCalcDisplay('Error'); pra.calcExpr = ''; }
      return;
    }
    pra.calcExpr += key; praCalcDisplay(pra.calcExpr);
  }

  function praCalcDisplay(val) { var e = praG('pra-calc-display'); if (e) e.textContent = val || '0'; }

  function praPopulateMap() {
    var sel = praG('pra-colormap'); if (!sel) return;
    sel.innerHTML = '';
    COLOR_MAPS.forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.name;
      if (m.id === pra.mapId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = function() { pra.mapId = this.value; praRedraw(); praRenderPalette(); praRenderColour(); };
  }

  window.initPixelArtPractice = function(containerId) {
    var wrap = document.getElementById(containerId); if (!wrap) return;

    wrap.innerHTML = [
      '<div id="qs-pra-answer" style="width:100%">',
        '<div style="display:flex;gap:10px;height:520px">',
          '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">',
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">',
              '<button id="btn-pra-paint" style="padding:5px 10px;border-radius:5px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid #3b82f6;background:#1e3a5f;color:#93c5fd">Paint</button>',
              '<button id="btn-pra-line"  style="padding:5px 10px;border-radius:5px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid #334155;background:#1e293b;color:#94a3b8">Line</button>',
              '<button id="btn-pra-fill"  style="padding:5px 10px;border-radius:5px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid #334155;background:#1e293b;color:#94a3b8">Fill</button>',
              '<button id="btn-pra-clear" style="padding:5px 10px;border-radius:5px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid #ef4444;background:#1e293b;color:#f87171">Clear</button>',
            '</div>',
            '<div style="flex:1;min-height:0;background:#0a0f1a;border-radius:6px;border:1px solid #334155;display:flex;align-items:center;justify-content:center;overflow:hidden">',
              '<canvas id="pra-canvas" width="512" height="512" style="max-width:100%;max-height:100%;image-rendering:pixelated;image-rendering:crisp-edges;cursor:crosshair;display:block;touch-action:none"></canvas>',
            '</div>',
          '</div>',
          '<div style="width:210px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;overflow-y:auto">',
            '<div>',
              '<div style="font-size:0.65rem;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Colour Map</div>',
              '<select id="pra-colormap" style="width:100%;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:4px 6px;font-size:0.82rem"></select>',
            '</div>',
            '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:6px;padding:8px">',
              '<div style="font-size:0.65rem;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Selected Colour</div>',
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">',
                '<div id="pra-sel-swatch" style="width:30px;height:30px;border-radius:5px;border:2px dashed #334155;flex-shrink:0"></div>',
                '<span id="pra-sel-label" style="font-size:0.82rem;font-weight:600;color:#94a3b8;font-family:monospace">No colour selected</span>',
              '</div>',
              '<div id="pra-timer-wrap" style="display:none">',
                '<div style="display:flex;justify-content:space-between;font-size:0.68rem;color:#64748b;margin-bottom:3px">',
                  '<span>Expires in</span><span id="pra-timer-secs" style="color:#fbbf24;font-weight:700">20s</span>',
                '</div>',
                '<div style="background:#1e293b;border-radius:99px;height:5px;overflow:hidden">',
                  '<div id="pra-timer-bar" style="height:100%;width:100%;background:#fbbf24;border-radius:99px"></div>',
                '</div>',
              '</div>',
              '<div id="pra-timer-expired" style="display:none;font-size:0.7rem;color:#f87171;font-weight:600;margin-top:4px">Type new binary to continue</div>',
            '</div>',
            '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:6px;padding:8px">',
              '<div style="font-size:0.65rem;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Type Binary (4 bits)</div>',
              '<div id="pra-binary-cells" style="display:flex;gap:4px;justify-content:center;margin-bottom:6px"></div>',
              '<div id="pra-binary-hint" style="font-size:0.68rem;color:#475569;text-align:center;margin-bottom:6px">Type 0 or 1 on keyboard</div>',
              '<div style="display:flex;gap:4px;justify-content:center">',
                '<button id="btn-pra-bit-0" style="flex:1;padding:6px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;font-size:1.1rem;font-weight:700;font-family:monospace;cursor:pointer">0</button>',
                '<button id="btn-pra-bit-1" style="flex:1;padding:6px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;font-size:1.1rem;font-weight:700;font-family:monospace;cursor:pointer">1</button>',
                '<button id="btn-pra-bit-bs" style="flex:1;padding:6px;background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:5px;font-size:0.85rem;cursor:pointer">&#x232B;</button>',
              '</div>',
            '</div>',
            '<div>',
              '<div style="font-size:0.65rem;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Colours</div>',
              '<div id="pra-palette" style="display:flex;flex-direction:column;gap:1px"></div>',
            '</div>',
            '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:6px;padding:8px">',
              '<div style="font-size:0.65rem;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Calculator</div>',
              '<div id="pra-calc-display" style="background:#1e293b;color:#e2e8f0;font-family:monospace;font-size:1.1rem;text-align:right;padding:6px 8px;border-radius:4px;margin-bottom:6px;min-height:2rem;word-break:break-all">0</div>',
              '<div id="pra-calc-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px"></div>',
            '</div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    // Reset state
    pra.pixels    = new Uint8Array(256);
    pra.colorIdx  = -1; pra.buffer = ''; pra.tool = 'paint';
    pra.lineStart = null; pra.mouseDown = false; pra.calcExpr = '';
    praStopTimer();

    // Replace canvas to clear old listeners
    var oldC = praG('pra-canvas');
    if (oldC) {
      var newC = oldC.cloneNode(false);
      newC.width = 512; newC.height = 512;
      oldC.parentNode.replaceChild(newC, oldC);
    }
    praRestore() || praRedraw();

    var c = praG('pra-canvas');
    if (c) {
      c.addEventListener('mousedown',  praOnDown, { passive: false });
      c.addEventListener('mousemove',  praOnMove, { passive: false });
      c.addEventListener('mouseup',    praOnUp);
      c.addEventListener('mouseleave', praOnUp);
      c.addEventListener('touchstart', praOnDown, { passive: false });
      c.addEventListener('touchmove',  praOnMove, { passive: false });
      c.addEventListener('touchend',   praOnUp);
    }

    ['paint', 'line', 'fill'].forEach(function(t) {
      var btn = praG('btn-pra-' + t); if (!btn) return;
      btn.onclick = function() { pra.tool = t; pra.lineStart = null; praUpdateTools(); };
    });
    praUpdateTools();

    var clr = praG('btn-pra-clear');
    if (clr) clr.onclick = function() { pra.pixels.fill(0); pra.lineStart = null; praRedraw(); praSave(); };

    var b0 = praG('btn-pra-bit-0'), b1 = praG('btn-pra-bit-1'), bs = praG('btn-pra-bit-bs');
    if (b0) b0.onclick = function() { praKeyHandler({ key: '0', preventDefault: function(){} }); };
    if (b1) b1.onclick = function() { praKeyHandler({ key: '1', preventDefault: function(){} }); };
    if (bs) bs.onclick = function() { praKeyHandler({ key: 'Backspace', preventDefault: function(){} }); };

    praPopulateMap();
    praRenderPalette();
    praRenderBinaryDisplay();
    praRenderColour();
    praInitCalc();

    document.removeEventListener('keydown', praKeyHandler);
    document.addEventListener('keydown', praKeyHandler);
  };

})();
