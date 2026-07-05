// ── Byte Brawlers — T-shirt Designer ──────────────────────────────────────────
// A binary-themed freehand design surface for the "Byte Brawlers" contest
// (Jackbox Tee K.O. style). Same binary-learning core as the pixel-art game —
// you EARN a colour by typing its 4-bit binary index (calculator + 20s timer +
// 16 colour maps) — but you paint freehand with a round brush onto a t-shirt:
//   • The shirt PNG's alpha channel is the drawing MASK (nothing shows on the
//     transparent surround; exports stay a clean shirt cutout).
//   • The shirt is white, so the template is MULTIPLIED over the paint to keep
//     the fabric folds/shading — colours look printed on cloth.
//   • Brush draws an interpolated LINE between the previous and current pointer
//     position each move, so fast strokes never leave gaps. Fill = flood-fill
//     bounded by your lines + the shirt mask.
//
// Mount:  var t = window.initTshirtDesigner('containerId', { templateUrl });
// Export: t.toDataURL() / t.toBlob(cb) → PNG (transparent around the shirt).
//
// The template PNG must be same-origin (served, not file://) so the canvas can
// read its pixels for the mask.
(function () {
  'use strict';

  var FALLBACK_MAPS = [{ id: 'classic', name: 'Classic 16', colors: [
    '#000000','#ffffff','#ff2200','#00bb00','#0000ff','#ffff00','#ff00ff','#00ffff',
    '#888888','#cccccc','#ff8800','#9900cc','#00aa88','#aa0000','#0055cc','#ffaa66'] }];
  function MAPS() { return (window.PA_COLOR_MAPS && window.PA_COLOR_MAPS.length) ? window.PA_COLOR_MAPS : FALLBACK_MAPS; }

  var TIMER = 20;          // seconds a binary-selected colour lasts
  var STYLE_ID = 'tsd-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.tsd-root{font-family:ui-sans-serif,system-ui,sans-serif;color:#e2e8f0}' +
      '.tsd-cols{display:flex;gap:10px;min-height:520px;flex-wrap:wrap}' +
      '.tsd-left{flex:1;min-width:280px;display:flex;flex-direction:column;gap:6px}' +
      '.tsd-side{width:212px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;overflow-y:auto;max-height:560px}' +
      '.tsd-toolrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
      '.tsd-tbtn{padding:5px 10px;border-radius:5px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid #334155;background:#1e293b;color:#94a3b8}' +
      '.tsd-tbtn.sel{border-color:#3b82f6;background:#1e3a5f;color:#93c5fd}' +
      '.tsd-tbtn.danger{border-color:#ef4444;color:#f87171}' +
      '.tsd-sizewrap{display:flex;align-items:center;gap:5px;font-size:0.72rem;color:#94a3b8;margin-left:auto}' +
      '.tsd-sizewrap input{width:84px}' +
      '.tsd-stage{flex:1;min-height:0;border-radius:6px;border:1px solid #334155;display:flex;align-items:center;justify-content:center;overflow:hidden;' +
        'background-image:linear-gradient(45deg,#1e293b 25%,transparent 25%),linear-gradient(-45deg,#1e293b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1e293b 75%),linear-gradient(-45deg,transparent 75%,#1e293b 75%);' +
        'background-size:22px 22px;background-position:0 0,0 11px,11px -11px,-11px 0;background-color:#0a0f1a}' +
      '.tsd-canvas{max-width:100%;max-height:100%;display:block;touch-action:none;cursor:crosshair}' +
      '.tsd-lbl{font-size:0.65rem;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px}' +
      '.tsd-card{background:#0f172a;border:1px solid #1e293b;border-radius:6px;padding:8px}' +
      '.tsd-sel-select{width:100%;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:4px 6px;font-size:0.82rem}' +
      '.tsd-bit{width:36px;height:44px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;font-family:monospace;color:#e2e8f0}' +
      '.tsd-bitbtn{flex:1;padding:6px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;font-size:1.1rem;font-weight:700;font-family:monospace;cursor:pointer}' +
      '.tsd-msg{padding:24px;text-align:center;color:#94a3b8;font-size:0.9rem;line-height:1.5}';
    document.head.appendChild(s);
  }

  function d2b(n) { return ('0000' + n.toString(2)).slice(-4); }
  function hexToRgb(hex) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }

  window.initTshirtDesigner = function (containerId, options) {
    options = options || {};
    var el = (typeof containerId === 'string') ? document.getElementById(containerId) : containerId;
    if (!el) return null;
    injectStyle();

    var TEMPLATE = options.templateUrl || 'assets/byte-brawlers/tshirt.png';
    var MAXSIZE = options.maxSize || 620;
    var UNDO_MAX = 12;

    // ── State ──────────────────────────────────────────────────
    var W = 0, H = 0;
    var display, dctx, strokes, sctx, tcanvas, maskAlpha = null, img = new Image();
    var tool = 'brush', size = 16, painting = false, last = null, lineStart = null, undoStack = [];
    var mapId = (MAPS()[0] || {}).id, colorIdx = -1, buffer = '', timerEnd = 0, timerRaf = null, calcExpr = '';

    function G(id) { return el.querySelector('#' + id); }
    function colors() { var m = MAPS().find(function (x) { return x.id === mapId; }); return (m || MAPS()[0]).colors; }
    function currentColor() { return colorIdx >= 0 ? colors()[colorIdx] : null; }

    // ── Layout ─────────────────────────────────────────────────
    el.innerHTML =
      '<div class="tsd-root"><div class="tsd-cols">' +
        '<div class="tsd-left">' +
          '<div class="tsd-toolrow">' +
            '<button class="tsd-tbtn sel" data-tool="brush">🖌 Brush</button>' +
            '<button class="tsd-tbtn" data-tool="line">📏 Line</button>' +
            '<button class="tsd-tbtn" data-tool="fill">🪣 Fill</button>' +
            '<button class="tsd-tbtn" data-tool="eraser">🧽 Erase</button>' +
            '<button class="tsd-tbtn" id="tsd-undo">↶ Undo</button>' +
            '<button class="tsd-tbtn danger" id="tsd-clear">🗑 Clear</button>' +
            '<label class="tsd-sizewrap">Size<input type="range" id="tsd-size" min="2" max="72" value="' + size + '"></label>' +
          '</div>' +
          '<div class="tsd-stage"><canvas class="tsd-canvas" id="tsd-canvas"></canvas>' +
            '<div class="tsd-msg" id="tsd-msg" style="display:none"></div></div>' +
        '</div>' +
        '<div class="tsd-side">' +
          '<div><div class="tsd-lbl">Colour Map</div>' +
            '<select id="tsd-colormap" class="tsd-sel-select"></select></div>' +
          '<div class="tsd-card">' +
            '<div class="tsd-lbl">Selected Colour</div>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
              '<div id="tsd-sel-swatch" style="width:30px;height:30px;border-radius:5px;border:2px dashed #334155;flex-shrink:0"></div>' +
              '<span id="tsd-sel-label" style="font-size:0.82rem;font-weight:600;color:#94a3b8;font-family:monospace">No colour selected</span>' +
            '</div>' +
            '<div id="tsd-timer-wrap" style="display:none">' +
              '<div style="display:flex;justify-content:space-between;font-size:0.68rem;color:#64748b;margin-bottom:3px"><span>Expires in</span><span id="tsd-timer-secs" style="color:#fbbf24;font-weight:700">' + TIMER + 's</span></div>' +
              '<div style="background:#1e293b;border-radius:99px;height:5px;overflow:hidden"><div id="tsd-timer-bar" style="height:100%;width:100%;background:#fbbf24;border-radius:99px"></div></div>' +
            '</div>' +
            '<div id="tsd-timer-expired" style="display:none;font-size:0.7rem;color:#f87171;font-weight:600;margin-top:4px">Type new binary to continue</div>' +
          '</div>' +
          '<div class="tsd-card">' +
            '<div class="tsd-lbl">Type Binary (4 bits)</div>' +
            '<div id="tsd-binary-cells" style="display:flex;gap:4px;justify-content:center;margin-bottom:6px"></div>' +
            '<div id="tsd-binary-hint" style="font-size:0.68rem;color:#475569;text-align:center;margin-bottom:6px">Type 0 or 1 on keyboard</div>' +
            '<div style="display:flex;gap:4px;justify-content:center">' +
              '<button id="tsd-bit-0" class="tsd-bitbtn">0</button>' +
              '<button id="tsd-bit-1" class="tsd-bitbtn">1</button>' +
              '<button id="tsd-bit-bs" class="tsd-bitbtn" style="color:#94a3b8;font-size:0.85rem">&#x232B;</button>' +
            '</div>' +
          '</div>' +
          '<div><div class="tsd-lbl">Colours (binary index)</div>' +
            '<div id="tsd-palette" style="display:flex;flex-direction:column;gap:1px"></div></div>' +
          '<div class="tsd-card">' +
            '<div class="tsd-lbl">Calculator</div>' +
            '<div id="tsd-calc-display" style="background:#1e293b;color:#e2e8f0;font-family:monospace;font-size:1.1rem;text-align:right;padding:6px 8px;border-radius:4px;margin-bottom:6px;min-height:2rem;word-break:break-all">0</div>' +
            '<div id="tsd-calc-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px"></div>' +
          '</div>' +
        '</div>' +
      '</div></div>';

    display = G('tsd-canvas');
    dctx = display.getContext('2d');

    // ── Binary colour selection ────────────────────────────────
    function renderBinary() {
      var c = G('tsd-binary-cells'); if (!c) return;
      c.innerHTML = '';
      for (var i = 0; i < 4; i++) {
        var bit = buffer[i], div = document.createElement('div');
        div.className = 'tsd-bit';
        div.style.border = '2px solid ' + (i < buffer.length ? '#3b82f6' : (i === buffer.length ? '#6366f1' : '#334155'));
        div.style.background = (i < buffer.length ? '#1e3a5f' : '#0f172a');
        if (i === buffer.length) div.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.4)';
        div.textContent = bit !== undefined ? bit : '';
        c.appendChild(div);
      }
      var hint = G('tsd-binary-hint');
      if (hint) {
        if (buffer.length > 0 && buffer.length < 4) { hint.textContent = buffer.length + ' of 4 bits…'; hint.style.color = '#6366f1'; }
        else { hint.textContent = 'Type 0 or 1 on keyboard'; hint.style.color = '#475569'; }
      }
    }
    function pushBit(b) {
      buffer = (buffer + b).slice(0, 4);
      renderBinary();
      if (buffer.length === 4) { var idx = parseInt(buffer, 2); buffer = ''; renderBinary(); startTimer(idx); }
    }
    function keyHandler(e) {
      if (!document.body.contains(el)) { document.removeEventListener('keydown', keyHandler); return; }
      if (e.key === '0' || e.key === '1') { e.preventDefault(); pushBit(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); buffer = buffer.slice(0, -1); renderBinary(); }
    }
    function startTimer(idx) {
      stopTimer();
      colorIdx = idx; timerEnd = Date.now() + TIMER * 1000;
      G('tsd-timer-wrap').style.display = '';
      G('tsd-timer-expired').style.display = 'none';
      renderSelected(); renderPalette(); tick();
    }
    function stopTimer() { if (timerRaf) { cancelAnimationFrame(timerRaf); timerRaf = null; } }
    function tick() {
      var rem = Math.max(0, timerEnd - Date.now());
      var s = G('tsd-timer-secs'), b = G('tsd-timer-bar');
      if (s) s.textContent = Math.ceil(rem / 1000) + 's';
      if (b) b.style.width = (rem / (TIMER * 1000) * 100) + '%';
      if (rem <= 0) {
        colorIdx = -1;
        G('tsd-timer-wrap').style.display = 'none';
        G('tsd-timer-expired').style.display = '';
        renderSelected(); renderPalette(); return;
      }
      timerRaf = requestAnimationFrame(tick);
    }
    function renderSelected() {
      var sw = G('tsd-sel-swatch'), lb = G('tsd-sel-label');
      if (colorIdx < 0) {
        if (sw) { sw.style.background = 'transparent'; sw.style.border = '2px dashed #334155'; }
        if (lb) lb.textContent = 'No colour selected';
      } else {
        if (sw) { sw.style.background = colors()[colorIdx]; sw.style.border = '2px solid rgba(255,255,255,0.2)'; }
        if (lb) lb.textContent = d2b(colorIdx) + ' = ' + colorIdx;
      }
    }
    function renderPalette() {
      var c = G('tsd-palette'); if (!c) return;
      var cols = colors(); c.innerHTML = '';
      for (var i = 0; i < 16; i++) {
        var row = document.createElement('div');
        var selRow = i === colorIdx;
        row.style.cssText = 'display:flex;align-items:center;gap:7px;padding:3px 6px;border-radius:5px;' + (selRow ? 'background:rgba(59,130,246,0.25);outline:1px solid #3b82f6;' : '');
        var sw = document.createElement('div');
        sw.style.cssText = 'width:20px;height:20px;border-radius:3px;flex-shrink:0;border:1px solid rgba(255,255,255,0.15);background:' + cols[i];
        var lb = document.createElement('span');
        lb.style.cssText = 'font-family:monospace;font-size:0.72rem;color:' + (selRow ? '#93c5fd' : '#64748b');
        lb.textContent = d2b(i) + ' = ' + i;
        row.appendChild(sw); row.appendChild(lb); c.appendChild(row);
      }
    }
    function populateMap() {
      var sel = G('tsd-colormap'); if (!sel) return;
      sel.innerHTML = '';
      MAPS().forEach(function (m) {
        var o = document.createElement('option'); o.value = m.id; o.textContent = m.name;
        if (m.id === mapId) o.selected = true; sel.appendChild(o);
      });
      sel.onchange = function () { mapId = this.value; render(); renderPalette(); renderSelected(); };
    }
    function initCalc() {
      calcExpr = ''; calcDisplay('0');
      var grid = G('tsd-calc-grid'); if (!grid) return; grid.innerHTML = '';
      [['7','8','9','÷'],['4','5','6','×'],['1','2','3','−'],['C','0','=','+']].forEach(function (row) {
        row.forEach(function (label) {
          var btn = document.createElement('button');
          btn.textContent = label;
          var isOp = ['÷','×','−','+'].indexOf(label) >= 0, isEq = label === '=', isCl = label === 'C';
          btn.style.cssText = 'padding:10px 0;border-radius:5px;font-size:0.95rem;font-weight:600;cursor:pointer;border:none;background:' +
            (isCl ? '#7f1d1d' : isEq ? '#1d4ed8' : isOp ? '#334155' : '#1e293b') + ';color:#e2e8f0';
          btn.onclick = function () { calcPress(label); };
          grid.appendChild(btn);
        });
      });
    }
    function calcPress(key) {
      if (key === 'C') { calcExpr = ''; calcDisplay('0'); return; }
      if (key === '=') {
        try {
          var r = Function('"use strict";return (' + calcExpr.replace(/÷/g, '/').replace(/×/g, '*').replace(/−/g, '-') + ')')();
          r = Math.round(r * 1e10) / 1e10; calcExpr = String(r); calcDisplay(String(r));
        } catch (e) { calcDisplay('Error'); calcExpr = ''; }
        return;
      }
      calcExpr += key; calcDisplay(calcExpr);
    }
    function calcDisplay(v) { var e = G('tsd-calc-display'); if (e) e.textContent = v || '0'; }
    function flashNeedColour() {
      var h = G('tsd-binary-hint'); if (!h) return;
      var old = h.textContent; h.textContent = '⚠ Type binary to pick a colour!'; h.style.color = '#f87171';
      setTimeout(function () { h.textContent = old; h.style.color = '#475569'; }, 1800);
    }

    // ── Template + drawing surface ─────────────────────────────
    function showMsg(html) { display.style.display = 'none'; var m = G('tsd-msg'); m.style.display = 'block'; m.innerHTML = html; }
    img.crossOrigin = 'anonymous';
    img.onload = onTemplateLoad;
    img.onerror = function () { showMsg('⚠ Could not load the design template.<br>Check the PNG exists at <code>' + TEMPLATE + '</code> and serve the page (not file://).'); };
    img.src = TEMPLATE;

    function onTemplateLoad() {
      var iw = img.naturalWidth, ih = img.naturalHeight, s = Math.min(1, MAXSIZE / Math.max(iw, ih));
      W = Math.round(iw * s); H = Math.round(ih * s);
      display.width = W; display.height = H;
      strokes = document.createElement('canvas'); strokes.width = W; strokes.height = H; sctx = strokes.getContext('2d');
      tcanvas = document.createElement('canvas'); tcanvas.width = W; tcanvas.height = H;
      var tctx = tcanvas.getContext('2d'); tctx.drawImage(img, 0, 0, W, H);
      maskAlpha = new Uint8ClampedArray(W * H);
      var md = tctx.getImageData(0, 0, W, H).data;
      for (var i = 0; i < W * H; i++) maskAlpha[i] = md[i * 4 + 3];
      render(); wirePointer();
    }
    function inShirt(x, y) { return x >= 0 && y >= 0 && x < W && y < H && maskAlpha[y * W + x] >= 24; }

    function render() {
      if (!W) return;
      dctx.globalCompositeOperation = 'source-over';
      dctx.clearRect(0, 0, W, H);
      dctx.fillStyle = '#ffffff'; dctx.fillRect(0, 0, W, H);
      dctx.drawImage(strokes, 0, 0);
      dctx.globalCompositeOperation = 'destination-in'; dctx.drawImage(tcanvas, 0, 0);
      dctx.globalCompositeOperation = 'multiply'; dctx.drawImage(tcanvas, 0, 0);
      dctx.globalCompositeOperation = 'source-over';
      // preview marker for the line tool's first point
      if (lineStart) { dctx.fillStyle = 'rgba(59,130,246,0.9)'; dctx.beginPath(); dctx.arc(lineStart.x, lineStart.y, Math.max(4, size / 2), 0, Math.PI * 2); dctx.fill(); }
    }

    function pushUndo() { try { undoStack.push(sctx.getImageData(0, 0, W, H)); if (undoStack.length > UNDO_MAX) undoStack.shift(); } catch (e) {} }
    function undo() { if (undoStack.length) { sctx.putImageData(undoStack.pop(), 0, 0); render(); } }

    function drawSegment(a, b, erase) {
      sctx.save();
      sctx.lineCap = 'round'; sctx.lineJoin = 'round'; sctx.lineWidth = size;
      if (erase) { sctx.globalCompositeOperation = 'destination-out'; sctx.strokeStyle = 'rgba(0,0,0,1)'; }
      else { sctx.globalCompositeOperation = 'source-over'; sctx.strokeStyle = currentColor(); }
      sctx.beginPath(); sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y); sctx.stroke();
      sctx.restore();
    }

    function floodFill(px, py, hex) {
      var x = Math.round(px), y = Math.round(py);
      if (!inShirt(x, y)) return;
      var image = sctx.getImageData(0, 0, W, H), d = image.data, ti = (y * W + x) * 4;
      var tr = d[ti], tg = d[ti + 1], tb = d[ti + 2], ta = d[ti + 3], fc = hexToRgb(hex);
      if (ta === 255 && Math.abs(tr - fc.r) < 4 && Math.abs(tg - fc.g) < 4 && Math.abs(tb - fc.b) < 4) return;
      var TOL = 42;
      function match(i) { var a = d[i + 3]; if (ta < 24) return a < 24; return a >= 24 && Math.abs(d[i] - tr) <= TOL && Math.abs(d[i + 1] - tg) <= TOL && Math.abs(d[i + 2] - tb) <= TOL; }
      var stack = [[x, y]];
      while (stack.length) {
        var pt = stack.pop(), cx = pt[0], cy = pt[1];
        if (!inShirt(cx, cy) || !match((cy * W + cx) * 4)) continue;
        var lx = cx, rx = cx;
        while (lx - 1 >= 0 && inShirt(lx - 1, cy) && match((cy * W + (lx - 1)) * 4)) lx--;
        while (rx + 1 < W && inShirt(rx + 1, cy) && match((cy * W + (rx + 1)) * 4)) rx++;
        for (var xx = lx; xx <= rx; xx++) {
          var j = (cy * W + xx) * 4; d[j] = fc.r; d[j + 1] = fc.g; d[j + 2] = fc.b; d[j + 3] = 255;
          if (cy > 0 && inShirt(xx, cy - 1) && match(((cy - 1) * W + xx) * 4)) stack.push([xx, cy - 1]);
          if (cy < H - 1 && inShirt(xx, cy + 1) && match(((cy + 1) * W + xx) * 4)) stack.push([xx, cy + 1]);
        }
      }
      sctx.putImageData(image, 0, 0);
    }

    function pos(e) { var r = display.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; }
    function needColour() { if (colorIdx < 0) { flashNeedColour(); return true; } return false; }
    function wirePointer() {
      display.addEventListener('pointerdown', function (e) {
        if (!W) return; e.preventDefault();
        var p = pos(e);
        if (tool === 'eraser') { pushUndo(); painting = true; try { display.setPointerCapture(e.pointerId); } catch (_e) {} last = p; drawSegment(p, p, true); render(); return; }
        if (tool === 'fill') { if (needColour()) return; pushUndo(); floodFill(p.x, p.y, currentColor()); render(); return; }
        if (tool === 'line') {
          if (needColour()) return;
          if (!lineStart) { lineStart = p; render(); }
          else { pushUndo(); drawSegment(lineStart, p, false); lineStart = null; render(); }
          return;
        }
        // brush
        if (needColour()) return;
        pushUndo(); painting = true; try { display.setPointerCapture(e.pointerId); } catch (_e) {}
        last = p; drawSegment(p, p, false); render();
      });
      display.addEventListener('pointermove', function (e) {
        if (!painting) return; e.preventDefault();
        var p = pos(e); drawSegment(last, p, tool === 'eraser'); last = p; render();
      });
      function end() { painting = false; }
      display.addEventListener('pointerup', end);
      display.addEventListener('pointercancel', end);
      display.addEventListener('pointerleave', end);
    }

    // ── Wire tools / binary buttons / calc ─────────────────────
    function setTool(t) {
      tool = t; lineStart = null;
      Array.prototype.forEach.call(el.querySelectorAll('[data-tool]'), function (b) { b.classList.toggle('sel', b.dataset.tool === t); });
      if (W) render();
    }
    Array.prototype.forEach.call(el.querySelectorAll('[data-tool]'), function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
    G('tsd-size').addEventListener('input', function (e) { size = +e.target.value; });
    G('tsd-undo').addEventListener('click', undo);
    G('tsd-clear').addEventListener('click', function () { if (!W) return; pushUndo(); sctx.clearRect(0, 0, W, H); lineStart = null; render(); });
    G('tsd-bit-0').onclick = function () { pushBit('0'); };
    G('tsd-bit-1').onclick = function () { pushBit('1'); };
    G('tsd-bit-bs').onclick = function () { buffer = buffer.slice(0, -1); renderBinary(); };
    document.removeEventListener('keydown', keyHandler);
    document.addEventListener('keydown', keyHandler);

    populateMap(); renderPalette(); renderBinary(); renderSelected(); initCalc();

    // ── Public API ─────────────────────────────────────────────
    var api = {
      element: el,
      toDataURL: function (type) { return W ? display.toDataURL(type || 'image/png') : null; },
      toBlob: function (cb, type) { if (W) display.toBlob(cb, type || 'image/png'); else cb(null); },
      isEmpty: function () {
        if (!W) return true;
        try { var d = sctx.getImageData(0, 0, W, H).data; for (var i = 3; i < d.length; i += 4) if (d[i] > 8) return false; return true; } catch (e) { return false; }
      },
      clear: function () { if (W) { pushUndo(); sctx.clearRect(0, 0, W, H); render(); } },
      destroy: function () { stopTimer(); document.removeEventListener('keydown', keyHandler); }
    };
    el._tshirt = api;
    return api;
  };

  // ── Quiz integration ───────────────────────────────────────────
  // Mirrors pixel-art-module's initPixelArtQuestion / submitPixelArtAnswer: the
  // SAME Drive submit flow, only the drawing surface and filename differ. Writes
  // ONLY a Drive file reference to Firebase (answers/{qIdx}/{loginCode}) — no
  // image and no personal data ever go to Firebase.
  var _tshirtQuizInstance = null;
  window.initTshirtQuestion = function (qIdx) {
    var container = document.getElementById('qs-tshirt-canvas');
    if (!container) return;
    if (_tshirtQuizInstance && _tshirtQuizInstance.destroy) { try { _tshirtQuizInstance.destroy(); } catch (e) {} }
    container.innerHTML = '';
    _tshirtQuizInstance = window.initTshirtDesigner(container, { templateUrl: 'assets/byte-brawlers/tshirt.png' });
    var btn = document.getElementById('btn-tshirt-submit');
    var fb = document.getElementById('tshirt-feedback');
    if (btn) {
      btn.disabled = false; btn.textContent = 'Submit Design';
      btn.onclick = function () {
        if (typeof quiz !== 'undefined' && quiz.myAnswered) return;
        window.submitTshirtAnswer(qIdx, btn, fb);
      };
    }
  };

  window.submitTshirtAnswer = async function (qIdx, submitBtn, feedbackEl) {
    if (typeof quiz === 'undefined' || !quiz.sessionRef) return;
    if (quiz.myAnswered) return;
    function fb(msg, col) { if (feedbackEl) { feedbackEl.textContent = msg; feedbackEl.style.color = col || '#94a3b8'; } }
    var inst = _tshirtQuizInstance;
    if (!inst) { fb('❌ Designer not ready.', '#f87171'); return; }
    if (inst.isEmpty()) { fb('Draw something on the shirt first!', '#f87171'); return; }

    submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
    fb('Connecting to Google Drive…');

    var token, folderId;
    try {
      token = await window.driveEnsureStudentToken(feedbackEl);
      folderId = await window.driveLookupStudentFolder(quiz.sessionRef);
      if (!folderId) throw new Error('No Drive folder found. Ask your teacher to connect Google Drive before starting.');
    } catch (e) {
      fb('❌ ' + e.message, '#f87171'); submitBtn.disabled = false; submitBtn.textContent = 'Submit Design'; return;
    }

    fb('Creating image…');
    var blob;
    try {
      blob = await new Promise(function (res, rej) { inst.toBlob(function (b) { b ? res(b) : rej(new Error('could not render')); }, 'image/png'); });
    } catch (e) {
      fb('❌ Could not create image: ' + e.message, '#f87171'); submitBtn.disabled = false; submitBtn.textContent = 'Submit Design'; return;
    }

    fb('Uploading…');
    var uid = window.state && window.state.uid;
    var filename = String(uid || 'student') + '-tshirt.png';
    var result;
    try {
      result = await Promise.race([
        window.driveUploadFile(folderId, filename, blob, 'image/png', token),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('Upload timed out — tap Submit again.')); }, 45000); })
      ]);
    } catch (e) {
      fb('❌ ' + e.message, '#f87171'); submitBtn.disabled = false; submitBtn.textContent = 'Submit Design'; return;
    }

    try {
      await quiz.sessionRef.child('answers/' + qIdx + '/' + uid).set({ fileId: result.id, fileName: result.name, submittedAt: Date.now() });
      quiz.myAnswered = true;
      if (typeof lockStudentAnswers === 'function') lockStudentAnswers();
      fb('✓ Design submitted!', '#4ade80');
      submitBtn.textContent = 'Submitted ✓';
      var msg = document.getElementById('qs-answered-msg'); if (msg) msg.classList.remove('hidden');
      if (inst.destroy) inst.destroy();
    } catch (e) {
      fb('❌ Could not save: ' + e.message, '#f87171'); submitBtn.disabled = false; submitBtn.textContent = 'Submit Design';
    }
  };
})();
