/**
 * binary-mining-module.js
 *
 * "Binary Mine" — a 2D Minecraft-style mining game that teaches binary
 * addition. Year 8 Binary L3.
 *
 * Core idea: every element is just a positive integer (its value). Combining
 * two elements = binary addition; the sum is a new element. To mine a block of
 * value V you must OWN a qualifying pickaxe: an element equal to V (exact) or
 * one whose bit-length is >= bits(V)+2 (brute force). Crafting CONSUMES its two
 * inputs (binary addition conserves value), so mining is the only faucet of new
 * value — that keeps the climb honest.
 *
 * The craft table is the teaching surface: the player types the binary sum and
 * the carries are revealed as scaffolding.
 *
 * ── Firebase / privacy ──────────────────────────────────────────────────────
 *   Writes ONLY:  miningGame/{code}: { money, best, updatedAt }
 *   where {code} is state.uid (the opaque LOGIN CODE, never a Google UID).
 *   No names / emails / UIDs are ever written. Leaderboard names come from
 *   studentName() / state.nameMap (localStorage only), exactly like quizzes.
 *
 * Mounted via window.initBinaryMiningGame(containerId). All DOM ids prefixed
 * bmg- so nothing clashes with the rest of the app.
 */

(function () {

  // ── Tunables ───────────────────────────────────────────────────
  var COLS        = 8;
  var SKY_ROWS    = 2;
  var START_DEPTH = 5;          // mine rows unlocked at the start
  var MAX_VIS_ROWS = 13;        // grid scrolls beyond this many rows
  var CELL        = 40;
  var SEED        = 20260629;   // shared world — identical for every player
  var BRUTE_BITS  = 2;          // a pickaxe brute-mines anything <= bits(pick)-2
  var START_INV   = { 1: 5 };   // five Hydrogen to bootstrap

  // Depth is endless. Each mine row d (1-indexed) draws block values from a band
  // whose centre grows ~1.55x per level, so values pass 118 into procedural
  // territory the deeper you dig.
  function depthCentre(d) { return Math.max(1, Math.round(Math.pow(1.55, d))); }
  function bandForDepth(d) {
    if (d <= 1) return [1, 2];
    var c = depthCentre(d);
    return [Math.max(1, Math.round(c * 0.7)), Math.round(c * 1.35)];
  }
  // Cost in money to unlock the next mine row below the current depth.
  function digCost(depth) { return Math.max(5, Math.round(depthCentre(depth + 1) * 2)); }

  var LS_KEY = 'pylearn_mining_v1';

  // ── Element identity ───────────────────────────────────────────
  var REAL_NAMES = ['', // index 0 unused
    'Hydrogen','Helium','Lithium','Beryllium','Boron','Carbon','Nitrogen','Oxygen','Fluorine','Neon',
    'Sodium','Magnesium','Aluminium','Silicon','Phosphorus','Sulfur','Chlorine','Argon','Potassium','Calcium',
    'Scandium','Titanium','Vanadium','Chromium','Manganese','Iron','Cobalt','Nickel','Copper','Zinc',
    'Gallium','Germanium','Arsenic','Selenium','Bromine','Krypton','Rubidium','Strontium','Yttrium','Zirconium',
    'Niobium','Molybdenum','Technetium','Ruthenium','Rhodium','Palladium','Silver','Cadmium','Indium','Tin',
    'Antimony','Tellurium','Iodine','Xenon','Caesium','Barium','Lanthanum','Cerium','Praseodymium','Neodymium',
    'Promethium','Samarium','Europium','Gadolinium','Terbium','Dysprosium','Holmium','Erbium','Thulium','Ytterbium',
    'Lutetium','Hafnium','Tantalum','Tungsten','Rhenium','Osmium','Iridium','Platinum','Gold','Mercury',
    'Thallium','Lead','Bismuth','Polonium','Astatine','Radon','Francium','Radium','Actinium','Thorium',
    'Protactinium','Uranium','Neptunium','Plutonium','Americium','Curium','Berkelium','Californium','Einsteinium','Fermium',
    'Mendelevium','Nobelium','Lawrencium','Rutherfordium','Dubnium','Seaborgium','Bohrium','Hassium','Meitnerium','Darmstadtium',
    'Roentgenium','Copernicium','Nihonium','Flerovium','Moscovium','Livermorium','Tennessine','Oganesson'
  ];

  var REAL_SYMBOLS = ['',
    'H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca',
    'Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr',
    'Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I','Xe','Cs','Ba','La','Ce','Pr','Nd',
    'Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg',
    'Tl','Pb','Bi','Po','At','Rn','Fr','Ra','Ac','Th','Pa','U','Np','Pu','Am','Cm','Bk','Cf','Es','Fm',
    'Md','No','Lr','Rf','Db','Sg','Bh','Hs','Mt','Ds','Rg','Cn','Nh','Fl','Mc','Lv','Ts','Og'
  ];

  var PROC_PRE = ['Cry','Nov','Lum','Vor','Zeph','Pyr','Aur','Quar','Xan','Therm','Gly','Obs','Vex','Tor','Kry','Mag','Sol','Neb','Drac','Fyr'];
  var PROC_MID = ['a','o','i','y','e','ae','io','ou'];
  var PROC_SUF = ['lite','rium','ite','on','ide','ux','ar','yx','ium','ane','ol','yte'];

  var COLOR_OVERRIDE = {
    26: '#a8a8a8', 29: '#c87533', 47: '#c8c8d0', 79: '#ffd34d', 80: '#b8c0c8', 82: '#6e7b8b', 6: '#3a3a44'
  };

  function hash32(n) {
    n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15);
    return (n >>> 0);
  }
  function bits(v)   { return v.toString(2).length; }
  function binStr(v) { return v.toString(2); }

  function elementName(v) {
    if (v >= 1 && v < REAL_NAMES.length) return REAL_NAMES[v];
    var a = hash32(v * 3 + 1), b = hash32(v * 7 + 2), c = hash32(v * 13 + 3);
    return PROC_PRE[a % PROC_PRE.length] + PROC_MID[b % PROC_MID.length] + PROC_SUF[c % PROC_SUF.length];
  }
  function elementSymbol(v) {
    if (v >= 1 && v < REAL_SYMBOLS.length) return REAL_SYMBOLS[v];
    var n = elementName(v);
    return n.charAt(0).toUpperCase() + (n.charAt(1) || '').toLowerCase();
  }
  function elementColor(v) {
    if (COLOR_OVERRIDE[v]) return COLOR_OVERRIDE[v];
    var h = hash32(v * 2654435761) % 360;
    return 'hsl(' + h + ',68%,57%)';
  }
  var CRAFT_VERBS = ['Imbued', 'Forged', 'Tempered', 'Charged', 'Veined', 'Crusted', 'Bound', 'Fused'];
  function pickaxeName(a, b) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    var verb = CRAFT_VERBS[hash32(lo * 31 + hi) % CRAFT_VERBS.length];
    return elementName(lo) + '-' + verb + ' ' + elementName(hi) + ' Pickaxe';
  }

  // ── Game state ─────────────────────────────────────────────────
  var g = null;
  function freshState() {
    return {
      inv: Object.assign({}, START_INV),  // value -> count
      money: 0,
      best: 1,
      depth: START_DEPTH,  // mine rows unlocked
      discovered: { 1: true },
      mined: {},      // "x,y" -> true  (mine cells removed)
      placed: {},     // "x,y" -> value (built on the surface)
      shop: {},       // value -> count  (sold elements, buyable back at 2x)
      selected: 1,
      slotA: null,
      slotB: null,
      craftGuess: null,
      dragVal: null,
      saveTimer: null,
      syncTimer: null
    };
  }

  // ── Persistence ────────────────────────────────────────────────
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!raw) return false;
      g.inv        = raw.inv || Object.assign({}, START_INV);
      g.money      = raw.money || 0;
      g.best       = raw.best || 1;
      g.depth      = raw.depth || START_DEPTH;
      g.discovered = raw.discovered || { 1: true };
      g.mined      = raw.mined || {};
      g.placed     = raw.placed || {};
      g.shop       = raw.shop || {};
      g.selected   = raw.selected || bestOwned() || 1;
      return true;
    } catch (e) { return false; }
  }
  function save() {
    clearTimeout(g.saveTimer);
    g.saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          inv: g.inv, money: g.money, best: g.best, depth: g.depth,
          discovered: g.discovered, mined: g.mined, placed: g.placed, shop: g.shop, selected: g.selected
        }));
      } catch (e) {}
    }, 400);
  }

  // ── Firebase leaderboard (privacy-safe: code/money/best only) ──
  function syncLeaderboard() {
    if (!(window.state && state.db && state.uid && !state.isAdmin)) return;
    clearTimeout(g.syncTimer);
    g.syncTimer = setTimeout(function () {
      try {
        state.db.ref('miningGame/' + state.uid).set({
          money: Math.max(0, Math.floor(g.money)),
          best: Math.max(1, Math.floor(g.best)),
          updatedAt: Date.now()
        });
      } catch (e) {}
    }, 2500);
  }
  function fetchLeaderboard() {
    if (!(window.state && state.db)) { renderLeaderboard([]); return; }
    state.db.ref('miningGame').get().then(function (snap) {
      var data = snap.val() || {};
      var rows = Object.keys(data).map(function (code) {
        var d = data[code] || {};
        return { code: code, money: +d.money || 0, best: +d.best || 0 };
      }).filter(function (r) { return r.best > 0 || r.money > 0; });
      rows.sort(function (a, b) { return b.best - a.best || b.money - a.money; });
      renderLeaderboard(rows);
    }).catch(function () {});
  }

  // ── Helpers ────────────────────────────────────────────────────
  function G(id) { return document.getElementById(id); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s)) : String(s); }
  function have(v) { return (g.inv[v] || 0) > 0; }
  function bestOwned() {
    var best = 0;
    Object.keys(g.inv).forEach(function (k) { if (g.inv[k] > 0 && +k > best) best = +k; });
    return best;
  }
  function ownedValues() {
    return Object.keys(g.inv).map(Number).filter(function (v) { return g.inv[v] > 0; })
      .sort(function (a, b) { return a - b; });
  }
  function discoveredCount() { return Object.keys(g.discovered).length; }

  function cellValue(x, y) {
    if (y === 0) return (x % 2 === 0) ? 1 : 2;  // gentle, guaranteed onboarding row
    var band = bandForDepth(y + 1);
    var span = band[1] - band[0] + 1;
    return band[0] + (hash32((x + 1) * 92837 + (y + 1) * 689287 + SEED) % span);
  }

  function canMine(v) {
    var owned = ownedValues();
    for (var i = 0; i < owned.length; i++) {
      var w = owned[i];
      if (w === v) return true;
      if (bits(w) >= bits(v) + BRUTE_BITS) return true;
    }
    return false;
  }
  function pickaxeFor(v) {
    // The element we'd wield: prefer exact match, else smallest brute-capable.
    var owned = ownedValues();
    if (g.inv[v] > 0) return v;
    for (var i = 0; i < owned.length; i++) {
      if (bits(owned[i]) >= bits(v) + BRUTE_BITS) return owned[i];
    }
    return null;
  }

  function gainElement(v, n) {
    n = n || 1;
    g.inv[v] = (g.inv[v] || 0) + n;
    if (!g.discovered[v]) g.discovered[v] = true;
    if (v > g.best) g.best = v;
  }

  // ── Toast ──────────────────────────────────────────────────────
  function toast(msg, color) {
    var el = G('bmg-toast'); if (!el) return;
    el.textContent = msg;
    el.style.color = color || '#2f6a2f';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 2200);
  }

  // ── Minecraft-style skin (injected once) ───────────────────────
  function injectStyle() {
    if (document.getElementById('bmg-style')) return;
    var s = document.createElement('style');
    s.id = 'bmg-style';
    s.textContent =
      '.bmg-wrap{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#222}' +
      '.bmg-panel{background:#c6c6c6;border:4px solid;border-color:#fff #565656 #565656 #fff;padding:10px}' +
      '.bmg-h{font-size:1.02rem;font-weight:800;color:#3f3f3f;letter-spacing:1px;margin:0 0 6px;text-shadow:1px 1px 0 #fff}' +
      '.bmg-slot{width:42px;height:42px;background:#8b8b8b;border:3px solid;border-color:#373737 #fff #fff #373737;box-sizing:border-box;position:relative}' +
      '.bmg-slot.sel{box-shadow:inset 0 0 0 3px #ffd34d}' +
      '.bmg-slot.bmg-drop{background:#a7a76a}' +
      '.bmg-item{position:absolute;inset:2px;display:flex;align-items:center;justify-content:center;user-select:none}' +
      '.bmg-item[draggable=true]{cursor:grab}.bmg-item[draggable=true]:active{cursor:grabbing}' +
      '.bmg-sym{font-family:ui-sans-serif,system-ui,sans-serif;font-weight:800;color:#0a0f1a;font-size:13px;text-shadow:0 1px 0 rgba(255,255,255,0.4)}' +
      '.bmg-count{position:absolute;right:1px;bottom:-4px;font-size:13px;font-weight:800;color:#fff;text-shadow:1px 1px 0 #3f3f3f}' +
      '.bmg-char{width:104px;height:140px;background:#0a0a0a;border:3px solid;border-color:#373737 #fff #fff #373737;display:flex;align-items:center;justify-content:center;color:#4a4a4a;font-size:0.66rem;text-align:center;line-height:1.5}' +
      '.bmg-arrow{font-size:1.7rem;color:#5a5a5a;font-weight:800;line-height:1}' +
      '.bmg-btn{font-family:inherit;background:#c6c6c6;border:3px solid;border-color:#fff #565656 #565656 #fff;color:#2a2a2a;font-weight:700;cursor:pointer}' +
      '.bmg-btn:active{border-color:#565656 #fff #fff #565656}' +
      '.bmg-btn:disabled{color:#888;cursor:not-allowed}' +
      '.bmg-bit{width:26px;height:30px;display:inline-flex;align-items:center;justify-content:center;font-family:ui-monospace,monospace;font-size:1.05rem;font-weight:800;background:#8b8b8b;border:2px solid;border-color:#373737 #fff #fff #373737;cursor:pointer;color:#2a2a2a;margin:0 1px;box-sizing:border-box}' +
      '.bmg-bit.on{background:#f4d03f;color:#1a1a1a}';
    document.head.appendChild(s);
  }

  function itemHTML(v, count, drag) {
    return '<div class="bmg-item"' + (drag ? ' draggable="true"' : '') + ' data-val="' + v + '" ' +
      'title="' + esc(elementName(v)) + ' — ' + binStr(v) + '" style="background:' + elementColor(v) + '">' +
      '<span class="bmg-sym">' + esc(elementSymbol(v)) + '</span>' +
      ((count && count > 1) ? '<span class="bmg-count">' + count + '</span>' : '') +
    '</div>';
  }

  // Fill / clear the two crafting ingredient slots.
  function slotClick(which) {
    var cur = (which === 'A') ? g.slotA : g.slotB;
    if (cur) { if (which === 'A') g.slotA = null; else g.slotB = null; }
    else if (g.selected && have(g.selected)) { if (which === 'A') g.slotA = g.selected; else g.slotB = g.selected; }
    g.craftGuess = null; renderCraft();
  }
  function slotDrop(which, val) {
    if (val == null || !have(val)) return;
    if (which === 'A') g.slotA = val; else g.slotB = val;
    g.craftGuess = null; renderCraft();
  }

  // ── Grid render ────────────────────────────────────────────────
  function cellInner(value) {
    return '<span style="font-family:system-ui,sans-serif;font-size:13px;color:#0a0f1a;' +
      'font-weight:800;text-shadow:0 1px 0 rgba(255,255,255,0.35)">' + esc(elementSymbol(value)) + '</span>';
  }
  function renderGrid() {
    var wrap = G('bmg-grid'); if (!wrap) return;
    var html = '';
    // Surface (sky) rows
    for (var sy = 0; sy < SKY_ROWS; sy++) {
      for (var sx = 0; sx < COLS; sx++) {
        var skey = sx + ',s' + sy;
        var pv = g.placed[skey];
        if (pv) {
          html += '<div class="bmg-cell" data-kind="placed" data-key="' + skey + '" title="' +
            esc(elementName(pv)) + ' — left-click to pick up" ' +
            'style="background:' + elementColor(pv) + ';border:1px solid rgba(0,0,0,0.3);' +
            'display:flex;align-items:center;justify-content:center;cursor:pointer">' + cellInner(pv) + '</div>';
        } else {
          html += '<div class="bmg-cell" data-kind="sky" data-key="' + skey + '" title="Right-click to place your selected block" ' +
            'style="background:linear-gradient(#1b2942,#16213a);border:1px solid #0f1830;cursor:crosshair"></div>';
        }
      }
    }
    // Underground rows (only the unlocked depth)
    for (var y = 0; y < g.depth; y++) {
      for (var x = 0; x < COLS; x++) {
        var key = x + ',' + y;
        if (g.mined[key]) {
          html += '<div class="bmg-cell" style="background:#0a0f1a;border:1px solid #0c1220"></div>';
          continue;
        }
        var v = cellValue(x, y);
        var minable = canMine(v);
        var shade = Math.min(0.5, y * 0.04);
        var ov = 'position:absolute;inset:0;pointer-events:none;background:rgba(0,0,0,' + shade + ')';
        if (!minable) ov += ';box-shadow:inset 0 0 0 2px rgba(0,0,0,0.5)';
        var sym = elementSymbol(v);
        html += '<div class="bmg-cell" data-kind="mine" data-key="' + key + '" data-val="' + v + '" ' +
          'title="' + esc(elementName(v)) + '" ' +
          'style="position:relative;background:' + elementColor(v) + ';border:1px solid rgba(0,0,0,0.35);' +
          'display:flex;align-items:center;justify-content:center;cursor:pointer">' +
          '<span style="' + ov + '"></span>' +
          '<span style="position:relative;z-index:1;font-family:system-ui,sans-serif;font-size:13px;color:#0a0f1a;font-weight:800;text-shadow:0 1px 0 rgba(255,255,255,0.35)">' + esc(sym) + '</span>' +
          (minable ? '' : '<span style="position:absolute;bottom:0;right:2px;font-size:9px;z-index:1">🔒</span>') +
          '</div>';
      }
    }
    wrap.innerHTML = html;
  }

  // ── Inventory + selection ──────────────────────────────────────
  function renderInv() {
    var el = G('bmg-inv'); if (!el) return;
    var vals = ownedValues();
    var INV_COLS = 8, INV_MIN = 32;
    var slots = Math.max(INV_MIN, Math.ceil(vals.length / INV_COLS) * INV_COLS);
    var html = '';
    for (var i = 0; i < slots; i++) {
      var v = vals[i];
      html += '<div class="bmg-slot' + (v === g.selected ? ' sel' : '') + '"' + (v != null ? ' data-inv="' + v + '"' : '') + '>' +
        (v != null ? itemHTML(v, g.inv[v], true) : '') + '</div>';
    }
    el.innerHTML = html;
  }
  function renderSelected() {
    var el = G('bmg-selbar'); if (!el) return;
    var v = g.selected;
    if (!v || !have(v)) {
      el.innerHTML = '<span style="color:#5a5a5a;font-size:0.76rem">Click an item to select it, then Sell it — or right-click the sky to build with it.</span>';
      return;
    }
    el.innerHTML =
      '<span style="width:24px;height:24px;flex-shrink:0;background:' + elementColor(v) + ';border:2px solid;border-color:#373737 #fff #fff #373737"></span>' +
      '<span style="font-weight:800;color:#2a2a2a">' + esc(elementName(v)) + '</span>' +
      '<span style="font-family:ui-monospace,monospace;color:#444">' + binStr(v) + '</span>' +
      '<span style="color:#555">×' + g.inv[v] + '</span>' +
      '<button id="bmg-sell" class="bmg-btn" style="margin-left:auto;padding:3px 10px;font-size:0.76rem">Sell +' + v + ' 💰</button>';
    G('bmg-sell').onclick = function () { sellSelected(); };
  }

  // ── Stats (top bar) ────────────────────────────────────────────
  function renderStats() {
    var el = G('bmg-stats'); if (!el) return;
    function stat(label, val) {
      return '<span style="display:inline-flex;gap:5px;align-items:baseline">' +
        '<span style="color:#555;font-size:0.72rem">' + label + '</span>' +
        '<span style="color:#222;font-weight:800">' + val + '</span></span>';
    }
    el.innerHTML =
      '<span style="font-weight:800;color:#2a2a2a;letter-spacing:1px">⛏ BINARY MINE</span>' +
      stat('💰', g.money) +
      stat('🪜', g.depth) +
      stat('⛏', esc(elementSymbol(g.best)) + ' ' + binStr(g.best)) +
      stat('📖', discoveredCount());
  }

  // ── Mining + hint ──────────────────────────────────────────────
  function tryMine(key) {
    if (g.mined[key]) return;
    var parts = key.split(','); var x = +parts[0], y = +parts[1];
    var v = cellValue(x, y);
    if (canMine(v)) {
      g.mined[key] = true;
      gainElement(v, 1);
      if (!have(g.selected)) g.selected = v;
      toast('+ ' + elementName(v) + ' (' + binStr(v) + ')', '#2f6a2f');
      renderGrid(); renderInv(); renderSelected(); renderStats();
      clearHint();
      save(); syncLeaderboard();
    } else {
      showHint(v);
    }
  }
  function recipePairs(v) {
    var pairs = [];
    for (var a = 1; a <= Math.floor(v / 2); a++) {
      var b = v - a;
      if (g.discovered[a] && g.discovered[b]) pairs.push([a, b]);
    }
    function craftable(p) {
      return (p[0] === p[1]) ? (g.inv[p[0]] || 0) >= 2 : have(p[0]) && have(p[1]);
    }
    pairs.sort(function (p, q) {
      var pc = craftable(p) ? 0 : 1, qc = craftable(q) ? 0 : 1;
      if (pc !== qc) return pc - qc;
      return (q[0] * q[1]) - (p[0] * p[1]); // prefer more balanced pairs
    });
    return { pairs: pairs, craftable: craftable };
  }
  function showHint(v) {
    var el = G('bmg-hint'); if (!el) return;
    var rp = recipePairs(v);
    var list = rp.pairs.slice(0, 5).map(function (p) {
      var ok = rp.craftable(p);
      return '<button class="bmg-recipe" data-a="' + p[0] + '" data-b="' + p[1] + '" ' +
        'style="display:block;width:100%;text-align:left;padding:5px 7px;margin-top:4px;border-radius:5px;cursor:pointer;' +
        'border:1px solid ' + (ok ? '#16a34a' : '#334155') + ';background:' + (ok ? '#0f2417' : '#0f172a') + '">' +
        '<span style="font-family:monospace;font-size:0.78rem;color:#e2e8f0">' +
          binStr(p[0]) + ' + ' + binStr(p[1]) + '</span>' +
        '<span style="display:block;font-size:0.68rem;color:' + (ok ? '#86efac' : '#64748b') + '">' +
          esc(pickaxeName(p[0], p[1])) + (ok ? '  ✓ you have both' : '  · need ' +
            (have(p[0]) ? esc(elementName(p[1])) : esc(elementName(p[0])))) + '</span>' +
      '</button>';
    }).join('');
    if (!list) list = '<div style="font-size:0.72rem;color:#64748b;margin-top:4px">No known recipes yet — discover more elements by mining softer blocks.</div>';
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:#f87171;font-weight:700">🔒 Too tough</span>' +
        '<button id="bmg-hint-x" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:0.9rem">✕</button>' +
      '</div>' +
      '<div style="font-size:0.78rem;color:#cbd5e1;margin:4px 0 2px">' +
        'You need a stronger pickaxe. Combine two elements to make <b>' + esc(elementName(v)) + '</b>, then mine it:' +
      '</div>' + list +
      '<div style="font-size:0.68rem;color:#64748b;margin-top:6px">Pick a recipe, then work out the binary sum yourself below.</div>';
    el.style.display = 'block';
    G('bmg-hint-x').onclick = clearHint;
    Array.prototype.forEach.call(el.querySelectorAll('.bmg-recipe'), function (btn) {
      btn.onclick = function () {
        g.slotA = +btn.dataset.a; g.slotB = +btn.dataset.b; g.craftGuess = null;
        renderCraft();
        var sa = G('bmg-slotA'); if (sa) sa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    });
  }
  function clearHint() { var el = G('bmg-hint'); if (el) { el.style.display = 'none'; el.innerHTML = ''; } }

  // ── Selling + buyback + placing + digging ──────────────────────
  function buybackCost(v) { return v * 2; }  // sold for v, bought back for 2v
  function sellSelected() {
    var v = g.selected;
    if (!have(v)) return;
    g.inv[v]--; if (g.inv[v] <= 0) delete g.inv[v];
    g.money += v;
    g.shop[v] = (g.shop[v] || 0) + 1;  // stock it for buyback
    toast('Sold ' + elementName(v) + ' for ' + v + ' 💰', '#7a5a10');
    if (!have(v)) g.selected = bestOwned() || 1;
    renderInv(); renderSelected(); renderStats(); renderGrid(); renderDig();
    save(); syncLeaderboard();
    checkGameOver();
  }
  function buyBack(v) {
    var cost = buybackCost(v);
    if (!(g.shop[v] > 0) || g.money < cost) return false;
    g.money -= cost;
    g.shop[v]--; if (g.shop[v] <= 0) delete g.shop[v];
    gainElement(v, 1);
    g.selected = v;
    toast('Bought back ' + elementName(v) + ' for ' + cost + ' 💰', '#2f6a2f');
    renderInv(); renderSelected(); renderStats(); renderGrid(); renderDig();
    save(); syncLeaderboard();
    return true;
  }
  function renderDig() {
    var b = G('bmg-dig'); if (!b) return;
    var cost = digCost(g.depth);
    var can = g.money >= cost;
    b.innerHTML = '⛏ Dig deeper — ' + cost + ' 💰';
    b.disabled = !can;
    b.title = can ? 'Unlock the next, richer layer of ore' : 'Sell elements to afford ' + cost + ' money';
  }
  function digDeeper() {
    var cost = digCost(g.depth);
    if (g.money < cost) return;
    g.money -= cost;
    g.depth += 1;
    toast('Dug deeper! Layer ' + g.depth + ' unlocked.', '#2f6a2f');
    renderGrid(); renderStats(); renderDig();
    // Keep the newest row in view
    var grid = G('bmg-grid'); if (grid) grid.scrollTop = grid.scrollHeight;
    save(); syncLeaderboard();
    checkGameOver();
  }
  function placeAt(key) {
    var v = g.selected;
    if (!have(v)) { toast('Select an element to place first', '#a32a2a'); return; }
    g.placed[key] = v;
    g.inv[v]--; if (g.inv[v] <= 0) delete g.inv[v];
    if (!have(v)) g.selected = bestOwned() || g.selected;
    renderGrid(); renderInv(); renderSelected();
    save();
    checkGameOver();
  }
  function pickUp(key) {
    var v = g.placed[key]; if (!v) return;
    delete g.placed[key];
    gainElement(v, 1);
    renderGrid(); renderInv(); renderSelected();
    save();
  }

  // ── Craft table (the teaching surface) ─────────────────────────
  function additionRows(a, b) {
    // Width has room for a carry-out so its length never leaks whether one occurs.
    var width = Math.max(bits(a), bits(b)) + 1;
    return {
      sum: a + b, width: width,
      aB: a.toString(2).padStart(width, '0'),
      bB: b.toString(2).padStart(width, '0')
    };
  }
  function renderCraft() {
    var slotA = G('bmg-slotA'), slotB = G('bmg-slotB'), out = G('bmg-slotOut');
    var binA = G('bmg-binA'), binB = G('bmg-binB'), entry = G('bmg-craft-entry');
    if (!slotA) return;
    var a = g.slotA, b = g.slotB;
    slotA.innerHTML = a ? itemHTML(a, 0, false) : '';
    slotB.innerHTML = b ? itemHTML(b, 0, false) : '';
    slotA.classList.toggle('sel', !!a);
    slotB.classList.toggle('sel', !!b);
    binA.textContent = a ? binStr(a) : '';
    binB.textContent = b ? binStr(b) : '';

    if (!a || !b) {
      out.innerHTML = '';
      entry.innerHTML = '<div style="color:#5a5a5a;font-size:0.76rem">Drag two elements into the slots (or click a slot to drop your selected one), then add their binary codes.</div>';
      return;
    }
    var canDo = (a === b) ? (g.inv[a] || 0) >= 2 : have(a) && have(b);
    var r = additionRows(a, b);
    var W = r.width;
    if (!g.craftGuess || g.craftGuess.length !== W) g.craftGuess = new Array(W).fill(0);
    out.innerHTML = '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:#5a5a5a;font-weight:800">?</span>';

    // Column-addition layout: gutter (for +/sign) then W aligned digit columns.
    var GUT = 20, COLW = 28; // bmg-bit footprint = 26 + 1px margin each side
    function dcell(ch) {
      return '<span style="display:inline-flex;width:26px;height:30px;align-items:center;justify-content:center;' +
        'font-family:ui-monospace,monospace;font-size:1.1rem;font-weight:800;color:#222;margin:0 1px;box-sizing:border-box">' + ch + '</span>';
    }
    function gutter(ch) {
      return '<span style="display:inline-flex;width:' + GUT + 'px;height:30px;align-items:center;justify-content:center;' +
        'font-family:ui-monospace,monospace;font-size:1.15rem;font-weight:800;color:#555">' + ch + '</span>';
    }
    function opRow(str, sign) {
      var s = '<div style="display:flex;align-items:center">' + gutter(sign);
      for (var i = 0; i < W; i++) s += dcell(str[i]);
      return s + '</div>';
    }
    var ansCells = gutter('');
    for (var j = 0; j < W; j++) ansCells += '<span class="bmg-bit' + (g.craftGuess[j] ? ' on' : '') + '" data-i="' + j + '">' + g.craftGuess[j] + '</span>';

    entry.innerHTML =
      '<div style="font-size:0.74rem;color:#444;margin-bottom:6px">Add the two binary numbers, column by column:</div>' +
      '<div style="display:inline-block;background:#bdbdbd;border:2px solid;border-color:#fff #999 #999 #fff;padding:6px 10px 8px;margin-bottom:8px">' +
        opRow(r.aB, '') +
        opRow(r.bB, '+') +
        '<div style="height:3px;background:#555;width:' + (GUT + W * COLW) + 'px;margin:3px 0"></div>' +
        '<div style="display:flex;align-items:center">' + ansCells + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
        '<button id="bmg-craftbtn" class="bmg-btn" ' + (canDo ? '' : 'disabled') + ' style="padding:4px 14px;font-size:0.82rem">Craft</button>' +
        '<button id="bmg-craftclear" class="bmg-btn" style="padding:4px 10px;font-size:0.76rem">Clear</button>' +
        '<span id="bmg-craft-msg" style="font-size:0.73rem;color:#7a2a2a"></span>' +
      '</div>' +
      (canDo ? '' : '<div style="font-size:0.72rem;color:#7a2a2a;margin-top:4px">You don\'t have both ingredients.</div>');

    Array.prototype.forEach.call(entry.querySelectorAll('.bmg-bit'), function (cell) {
      cell.onclick = function () { var i = +cell.dataset.i; g.craftGuess[i] = g.craftGuess[i] ? 0 : 1; renderCraft(); };
    });
    G('bmg-craftbtn').onclick = function () { doCraft(a, b, r); };
    G('bmg-craftclear').onclick = function () { g.slotA = null; g.slotB = null; g.craftGuess = null; renderCraft(); };
  }
  function doCraft(a, b, r) {
    var canDo = (a === b) ? (g.inv[a] || 0) >= 2 : have(a) && have(b);
    if (!canDo) return;
    if (parseInt(g.craftGuess.join(''), 2) !== r.sum) {
      var m = G('bmg-craft-msg');
      if (m) { m.textContent = 'Not quite — add column by column and try again.'; }
      return;
    }
    g.inv[a]--; if (g.inv[a] <= 0) delete g.inv[a];
    g.inv[b]--; if (g.inv[b] <= 0) delete g.inv[b];
    gainElement(r.sum, 1);
    g.selected = r.sum;
    g.slotA = null; g.slotB = null; g.craftGuess = null;
    toast('Crafted ' + elementName(r.sum) + '!', '#2f6a2f');
    clearHint();
    renderGrid(); renderInv(); renderSelected(); renderStats(); renderCraft();
    // Brief flash of the crafted item in the output slot
    var out = G('bmg-slotOut');
    if (out) { out.innerHTML = itemHTML(r.sum, 0, false); setTimeout(function () { if (g.slotA == null && g.slotB == null) out.innerHTML = ''; }, 800); }
    save(); syncLeaderboard();
    checkGameOver();
  }

  // ── Leaderboard render ─────────────────────────────────────────
  function renderLeaderboard(rows) {
    var el = G('bmg-lb'); if (!el) return;
    if (!rows || !rows.length) { el.innerHTML = '<div style="color:#64748b;font-size:0.78rem;padding:6px">No miners yet — be the first!</div>'; return; }
    var me = window.state && state.uid;
    var medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = rows.slice(0, 12).map(function (r, i) {
      var nm = (typeof studentName === 'function' && studentName(r.code)) || r.code;
      var isMe = (r.code === me);
      return '<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;' +
        'background:' + (isMe ? 'rgba(251,191,36,0.16)' : 'transparent') + '">' +
        '<span style="width:20px;text-align:center;font-size:0.78rem">' + (medals[i] || (i + 1)) + '</span>' +
        '<span style="flex:1;min-width:0;font-size:0.76rem;color:' + (isMe ? '#fde68a' : '#cbd5e1') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(nm) + (isMe ? ' (you)' : '') + '</span>' +
        '<span style="font-family:monospace;font-size:0.72rem;color:#a7f3d0" title="' + esc(elementName(r.best)) + '">' + binStr(r.best) + '</span>' +
        '<span style="font-size:0.72rem;color:#fcd34d;width:48px;text-align:right">' + r.money + '💰</span>' +
      '</div>';
    }).join('');
  }

  // ── Element journal (encyclopedia of discoveries) ──────────────
  // The one place decimal values are revealed — you "earn" them by discovering
  // the element, so the in-world puzzle stays pure.
  function openJournal() {
    var existing = G('bmg-journal'); if (existing) { try { document.body.removeChild(existing); } catch (e) {} }
    var vals = Object.keys(g.discovered).map(Number).sort(function (a, b) { return a - b; });
    var realCount = vals.filter(function (v) { return v < REAL_NAMES.length; }).length;

    var cards = vals.map(function (v) {
      var owned = g.inv[v] || 0;
      var real = v < REAL_NAMES.length;
      return '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="width:34px;height:34px;border-radius:7px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + elementColor(v) + ';font-weight:800;color:#0a0f1a;font-size:0.9rem">' + esc(elementSymbol(v)) + '</span>' +
          '<div style="min-width:0">' +
            '<div style="font-size:0.82rem;font-weight:700;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(elementName(v)) + '</div>' +
            '<div style="font-size:0.64rem;color:' + (real ? '#86efac' : '#c4b5fd') + '">' + (real ? 'Element #' + v : 'Synthetic') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-family:monospace;font-size:0.8rem">' +
          '<span style="color:#fcd34d">' + binStr(v) + '</span><span style="color:#64748b">= ' + v + '</span></div>' +
        '<div style="font-size:0.64rem;color:#94a3b8">' + (owned ? 'In stock: ' + owned : 'Not in stock') + '</div>' +
      '</div>';
    }).join('');

    var overlay = document.createElement('div');
    overlay.id = 'bmg-journal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(2,6,15,0.88);display:flex;align-items:center;justify-content:center;padding:24px';
    overlay.innerHTML =
      '<div style="background:#0b1220;border:1px solid #1e293b;border-radius:14px;max-width:780px;width:100%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.6)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #1e293b">' +
          '<div><span style="font-size:1.05rem;font-weight:800;color:#f1f5f9">📖 Element Journal</span>' +
          '<span style="font-size:0.74rem;color:#94a3b8;margin-left:8px">' + vals.length + ' discovered &middot; ' + realCount + ' real, ' + (vals.length - realCount) + ' synthetic</span></div>' +
          '<button id="bmg-journal-x" style="background:#334155;color:#f1f5f9;border:none;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:0.85rem;font-weight:600">✕ Close</button>' +
        '</div>' +
        '<div style="padding:14px 18px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">' + cards + '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function close() { try { document.body.removeChild(overlay); } catch (e) {} document.removeEventListener('keydown', onEsc); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    G('bmg-journal-x').onclick = close;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc);
  }

  // ── Shop (buy back what you've sold, at 2x) ────────────────────
  function openShop() {
    var existing = G('bmg-shop'); if (existing) { try { document.body.removeChild(existing); } catch (e) {} }
    var overlay = document.createElement('div');
    overlay.id = 'bmg-shop';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(2,6,15,0.82);display:flex;align-items:center;justify-content:center;padding:24px;font-family:ui-monospace,monospace';

    function body() {
      var vals = Object.keys(g.shop).map(Number).filter(function (v) { return g.shop[v] > 0; }).sort(function (a, b) { return a - b; });
      var rows = vals.map(function (v) {
        var cost = buybackCost(v);
        var can = g.money >= cost;
        return '<div style="display:flex;align-items:center;gap:10px;padding:7px;background:#bdbdbd;border:2px solid;border-color:#fff #999 #999 #fff;margin-bottom:6px">' +
          '<span style="width:30px;height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + elementColor(v) + ';border:2px solid;border-color:#373737 #fff #fff #373737;font-weight:800;color:#0a0f1a">' + esc(elementSymbol(v)) + '</span>' +
          '<span style="flex:1;min-width:0"><span style="font-weight:800;color:#222">' + esc(elementName(v)) + '</span> ' +
            '<span style="font-family:ui-monospace,monospace;color:#444">' + binStr(v) + '</span> ' +
            '<span style="color:#666">×' + g.shop[v] + '</span></span>' +
          '<button class="bmg-btn bmg-buyback" data-v="' + v + '" ' + (can ? '' : 'disabled') + ' style="padding:4px 10px;font-size:0.78rem">Buy back — ' + cost + ' 💰</button>' +
        '</div>';
      }).join('');
      if (!rows) rows = '<div style="color:#555;font-size:0.82rem;padding:6px">You haven\'t sold anything yet. Sell elements you no longer need, then buy them back here if you change your mind.</div>';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:3px solid #999">' +
          '<div><span style="font-size:1.05rem;font-weight:800;color:#2a2a2a">🛒 Shop</span>' +
          '<span style="font-size:0.76rem;color:#555;margin-left:10px">Buy back at 2× the sale price &middot; 💰 ' + g.money + '</span></div>' +
          '<button id="bmg-shop-x" class="bmg-btn" style="padding:5px 12px;font-size:0.82rem">✕ Close</button>' +
        '</div>' +
        '<div style="padding:14px 18px;overflow-y:auto">' + rows + '</div>';
    }
    function refresh() {
      overlay.querySelector('.bmg-shop-card').innerHTML = body();
      wire();
    }
    function wire() {
      G('bmg-shop-x').onclick = close;
      Array.prototype.forEach.call(overlay.querySelectorAll('.bmg-buyback'), function (btn) {
        btn.onclick = function () { if (buyBack(+btn.dataset.v)) refresh(); };
      });
    }
    overlay.innerHTML = '<div class="bmg-shop-card bmg-panel" style="max-width:520px;width:100%;max-height:84vh;display:flex;flex-direction:column;padding:0">' + body() + '</div>';
    document.body.appendChild(overlay);
    function close() { try { document.body.removeChild(overlay); } catch (e) {} document.removeEventListener('keydown', onEsc); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc);
    wire();
  }

  // ── Hard-lock detection + game over ────────────────────────────
  function totalItemCount() {
    var n = 0; Object.keys(g.inv).forEach(function (k) { n += g.inv[k]; }); return n;
  }
  function anyVisibleMineable() {
    for (var y = 0; y < g.depth; y++) {
      for (var x = 0; x < COLS; x++) {
        if (g.mined[x + ',' + y]) continue;
        if (canMine(cellValue(x, y))) return true;
      }
    }
    return false;
  }
  function anyAffordableBuyback() {
    var ks = Object.keys(g.shop);
    for (var i = 0; i < ks.length; i++) {
      if (g.shop[ks[i]] > 0 && buybackCost(+ks[i]) <= g.money) return true;
    }
    return false;
  }
  // True dead end: nothing to mine, can't craft (need 2 items), can't dig, can't buy back.
  function isHardLocked() {
    if (anyVisibleMineable()) return false;   // can still mine
    if (totalItemCount() >= 2) return false;  // can still craft → progress
    if (g.money >= digCost(g.depth)) return false; // can dig deeper
    if (anyAffordableBuyback()) return false; // can buy something back
    return true;
  }
  function renderAll() {
    renderGrid(); renderInv(); renderSelected(); renderStats(); renderCraft(); renderDig();
  }
  function doReset() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    g = freshState();
    g.selected = 1;
    renderAll();
    save(); syncLeaderboard();
  }
  function checkGameOver() {
    if (!isHardLocked()) return;
    if (G('bmg-gameover')) return;
    var overlay = document.createElement('div');
    overlay.id = 'bmg-gameover';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(2,6,15,0.92);display:flex;align-items:center;justify-content:center;padding:24px;font-family:ui-monospace,monospace';
    overlay.innerHTML =
      '<div class="bmg-panel" style="max-width:380px;width:100%;text-align:center">' +
        '<div style="font-size:2.4rem;margin-bottom:6px">💀</div>' +
        '<div style="font-size:1.3rem;font-weight:800;color:#7a2a2a;letter-spacing:1px;margin-bottom:4px">GAME OVER</div>' +
        '<div style="font-size:0.8rem;color:#444;margin-bottom:12px">You ran out of moves — no ore you can mine, nothing to craft or buy back, and not enough money to dig. Here\'s how you did:</div>' +
        '<div style="background:#bdbdbd;border:2px solid;border-color:#fff #999 #999 #fff;padding:10px;text-align:left;font-size:0.86rem;margin-bottom:14px">' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#555">⛏ Best element</span><b>' + esc(elementName(g.best)) + ' (' + binStr(g.best) + ')</b></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#555">📖 Discovered</span><b>' + discoveredCount() + '</b></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#555">🪜 Depth reached</span><b>' + g.depth + '</b></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#555">💰 Money</span><b>' + g.money + '</b></div>' +
        '</div>' +
        '<button id="bmg-gameover-reset" class="bmg-btn" style="padding:8px 18px;font-size:0.95rem;font-weight:800;color:#1a4a1a">Start again</button>' +
      '</div>';
    document.body.appendChild(overlay);
    G('bmg-gameover-reset').onclick = function () {
      try { document.body.removeChild(overlay); } catch (e) {}
      doReset();
    };
  }

  // ── Mount ──────────────────────────────────────────────────────
  window.initBinaryMiningGame = function (containerId) {
    var wrap = G(containerId); if (!wrap) return;
    injectStyle();

    g = freshState();
    load();
    g.selected = have(g.selected) ? g.selected : (bestOwned() || 1);

    var GRIDW = COLS * CELL;
    wrap.innerHTML =
      '<div class="bmg-wrap">' +
        // Top bar
        '<div class="bmg-panel" style="display:flex;align-items:center;gap:16px;margin-bottom:10px;flex-wrap:wrap">' +
          '<div id="bmg-stats" style="display:flex;align-items:center;gap:16px;flex:1;flex-wrap:wrap"></div>' +
          '<span id="bmg-toast" style="font-size:0.78rem;font-weight:700;opacity:0;transition:opacity .2s">&nbsp;</span>' +
          '<button id="bmg-shop-btn" class="bmg-btn" style="padding:4px 10px;font-size:0.78rem">🛒 Shop</button>' +
          '<button id="bmg-journal-btn" class="bmg-btn" style="padding:4px 10px;font-size:0.78rem">📖 Journal</button>' +
        '</div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">' +
          // Left column: mine + leaderboard
          '<div style="flex:0 0 auto;display:flex;flex-direction:column;gap:10px">' +
            '<div class="bmg-panel">' +
              '<div class="bmg-h">The Mine</div>' +
              '<div id="bmg-grid" style="display:grid;grid-template-columns:repeat(' + COLS + ',' + CELL + 'px);grid-auto-rows:' + CELL + 'px;gap:0;border:3px solid;border-color:#373737 #fff #fff #373737;overflow-y:auto;overflow-x:hidden;max-height:' + (MAX_VIS_ROWS * CELL) + 'px;user-select:none"></div>' +
              '<button id="bmg-dig" class="bmg-btn" style="width:' + GRIDW + 'px;margin-top:8px;padding:7px;font-size:0.82rem"></button>' +
              '<div style="font-size:0.66rem;color:#555;margin-top:5px;max-width:' + GRIDW + 'px">Left-click to <b>mine</b> &middot; right-click the sky to <b>build</b> &middot; <b>Dig deeper</b> for richer ore.</div>' +
            '</div>' +
            '<div class="bmg-panel"><div class="bmg-h">🏆 Leaderboard</div><div id="bmg-lb"></div></div>' +
          '</div>' +
          // Right column: Minecraft inventory panel
          '<div class="bmg-panel" style="flex:1;min-width:350px;max-width:470px">' +
            '<div style="display:flex;gap:12px;margin-bottom:10px">' +
              '<div class="bmg-char">Character<br>(coming<br>soon)</div>' +
              '<div style="flex:1;min-width:0">' +
                '<div class="bmg-h">Crafting</div>' +
                '<div style="display:flex;align-items:center;gap:10px">' +
                  '<div style="display:flex;flex-direction:column;gap:3px">' +
                    '<div style="display:flex;align-items:center;gap:6px"><div class="bmg-slot" id="bmg-slotA"></div><span id="bmg-binA" style="font-family:ui-monospace,monospace;font-weight:800;color:#333"></span></div>' +
                    '<div style="color:#555;font-weight:800;padding-left:15px;line-height:0.6">+</div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><div class="bmg-slot" id="bmg-slotB"></div><span id="bmg-binB" style="font-family:ui-monospace,monospace;font-weight:800;color:#333"></span></div>' +
                  '</div>' +
                  '<div class="bmg-arrow">&#10142;</div>' +
                  '<div class="bmg-slot" id="bmg-slotOut"></div>' +
                '</div>' +
                '<div id="bmg-craft-entry" style="margin-top:8px"></div>' +
              '</div>' +
            '</div>' +
            '<div id="bmg-hint" style="display:none;background:#b85c5c;border:3px solid;border-color:#fff #6e2e2e #6e2e2e #fff;padding:8px;margin-bottom:10px"></div>' +
            '<div class="bmg-h">Inventory</div>' +
            '<div id="bmg-inv" style="display:grid;grid-template-columns:repeat(8,42px);gap:2px;max-height:188px;overflow-y:auto"></div>' +
            '<div id="bmg-selbar" style="display:flex;align-items:center;gap:8px;margin-top:8px;min-height:26px;font-size:0.8rem"></div>' +
            '<div style="text-align:right;margin-top:8px"><button id="bmg-reset" class="bmg-btn" style="padding:2px 8px;font-size:0.66rem;color:#7a3a3a">Reset</button></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Wire mine grid
    var grid = G('bmg-grid');
    grid.addEventListener('click', function (e) {
      var cell = e.target.closest('.bmg-cell'); if (!cell) return;
      var kind = cell.dataset.kind;
      if (kind === 'mine') tryMine(cell.dataset.key);
      else if (kind === 'placed') pickUp(cell.dataset.key);
    });
    grid.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var cell = e.target.closest('.bmg-cell'); if (!cell) return;
      if (cell.dataset.kind === 'sky') placeAt(cell.dataset.key);
    });

    // Wire inventory: click to select, drag to craft slots
    var inv = G('bmg-inv');
    inv.addEventListener('click', function (e) {
      var s = e.target.closest('.bmg-slot[data-inv]'); if (!s) return;
      g.selected = +s.dataset.inv;
      renderInv(); renderSelected();
    });
    inv.addEventListener('dragstart', function (e) {
      var it = e.target.closest('.bmg-item'); if (!it) return;
      g.dragVal = +it.dataset.val;
      try { e.dataTransfer.setData('text/plain', it.dataset.val); e.dataTransfer.effectAllowed = 'copy'; } catch (_e) {}
    });

    // Wire crafting slots (drag-drop + click)
    [['A', G('bmg-slotA')], ['B', G('bmg-slotB')]].forEach(function (p) {
      var which = p[0], slot = p[1];
      slot.addEventListener('dragover', function (e) { e.preventDefault(); slot.classList.add('bmg-drop'); });
      slot.addEventListener('dragleave', function () { slot.classList.remove('bmg-drop'); });
      slot.addEventListener('drop', function (e) {
        e.preventDefault(); slot.classList.remove('bmg-drop');
        var val = (g.dragVal != null) ? g.dragVal : parseInt(e.dataTransfer.getData('text/plain'), 10);
        slotDrop(which, val); g.dragVal = null;
      });
      slot.addEventListener('click', function () { slotClick(which); });
    });

    G('bmg-dig').onclick = digDeeper;
    G('bmg-journal-btn').onclick = openJournal;
    G('bmg-shop-btn').onclick = openShop;

    G('bmg-reset').onclick = function () {
      if (!confirm('Reset your mine, inventory and money? This cannot be undone.')) return;
      doReset();
    };

    renderAll();

    // Leaderboard: immediate + 30s poll (clear any previous widget's timer)
    if (window._bmgLbTimer) { clearInterval(window._bmgLbTimer); window._bmgLbTimer = null; }
    fetchLeaderboard();
    syncLeaderboard();
    window._bmgLbTimer = setInterval(fetchLeaderboard, 30000);

    // A loaded save could already be in a dead end — check on mount.
    checkGameOver();

    // Lesson step auto-completes on mount (it's a sandbox, not a graded task)
    if (window.__markStepComplete) { try { window.__markStepComplete(); } catch (e) {} }
  };

})();
