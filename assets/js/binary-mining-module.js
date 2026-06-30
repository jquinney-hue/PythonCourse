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
      selected: 1,
      slotA: null,
      slotB: null,
      craftGuess: null,
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
          discovered: g.discovered, mined: g.mined, placed: g.placed, selected: g.selected
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
          money: g.money | 0, best: g.best | 0, updatedAt: Date.now()
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
    el.style.color = color || '#4ade80';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 2200);
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
    if (!vals.length) { el.innerHTML = '<div style="color:#64748b;font-size:0.8rem;padding:6px">Empty — go mining!</div>'; return; }
    el.innerHTML = vals.map(function (v) {
      var sel = (v === g.selected);
      return '<button class="bmg-invtile" data-val="' + v + '" title="' + esc(elementName(v)) + '" ' +
        'style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;' +
        'border:1px solid ' + (sel ? '#fbbf24' : '#334155') + ';background:' + (sel ? '#3a2f12' : '#111827') + ';text-align:left">' +
        '<span style="width:18px;height:18px;border-radius:4px;flex-shrink:0;background:' + elementColor(v) + '"></span>' +
        '<span style="flex:1;min-width:0">' +
          '<span style="display:block;font-size:0.72rem;color:#e2e8f0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(elementName(v)) + '</span>' +
          '<span style="font-family:monospace;font-size:0.72rem;color:#94a3b8">' + binStr(v) + '</span>' +
        '</span>' +
        '<span style="font-size:0.72rem;color:#fbbf24;font-weight:700">×' + g.inv[v] + '</span>' +
      '</button>';
    }).join('');
  }
  function renderSelected() {
    var el = G('bmg-selected'); if (!el) return;
    var v = g.selected;
    if (!v || !have(v)) { el.innerHTML = '<div style="color:#64748b;font-size:0.8rem">No element selected.</div>'; return; }
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span style="width:30px;height:30px;border-radius:6px;background:' + elementColor(v) + '"></span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:0.82rem;color:#f1f5f9;font-weight:700">' + esc(elementName(v)) + '</div>' +
          '<div style="font-family:monospace;font-size:0.8rem;color:#94a3b8">' + binStr(v) + ' <span style="color:#475569">(' + v + ')</span></div>' +
        '</div>' +
        '<span style="font-size:0.78rem;color:#fbbf24;font-weight:700">×' + g.inv[v] + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
        '<button id="bmg-toA" style="flex:1;padding:5px;border-radius:5px;border:1px solid #3b82f6;background:#1e3a5f;color:#bfdbfe;font-size:0.75rem;font-weight:600;cursor:pointer">→ Slot A</button>' +
        '<button id="bmg-toB" style="flex:1;padding:5px;border-radius:5px;border:1px solid #3b82f6;background:#1e3a5f;color:#bfdbfe;font-size:0.75rem;font-weight:600;cursor:pointer">→ Slot B</button>' +
        '<button id="bmg-sell" style="flex:1;padding:5px;border-radius:5px;border:1px solid #f59e0b;background:#3a2f12;color:#fcd34d;font-size:0.75rem;font-weight:600;cursor:pointer">Sell +' + v + '</button>' +
      '</div>';
    G('bmg-toA').onclick  = function () { addToCraft('A'); };
    G('bmg-toB').onclick  = function () { addToCraft('B'); };
    G('bmg-sell').onclick = function () { sellSelected(); };
  }

  // ── Stats ──────────────────────────────────────────────────────
  function renderStats() {
    var el = G('bmg-stats'); if (!el) return;
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">💰 Money</span><span style="color:#fcd34d;font-weight:700">' + g.money + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">⛏ Best</span><span style="color:#a7f3d0;font-weight:700">' + esc(elementName(g.best)) + ' <span style="font-family:monospace">' + binStr(g.best) + '</span></span></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">📖 Discovered</span><span style="color:#e2e8f0;font-weight:700">' + discoveredCount() + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">🪜 Depth</span><span style="color:#e2e8f0;font-weight:700">' + g.depth + '</span></div>';
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
      toast('+ ' + elementName(v) + ' (' + binStr(v) + ')', '#4ade80');
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
        G('bmg-craft').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    });
  }
  function clearHint() { var el = G('bmg-hint'); if (el) { el.style.display = 'none'; el.innerHTML = ''; } }

  // ── Selling + placing + digging ────────────────────────────────
  function sellSelected() {
    var v = g.selected;
    if (!have(v)) return;
    g.inv[v]--; if (g.inv[v] <= 0) delete g.inv[v];
    g.money += v;
    toast('Sold ' + elementName(v) + ' for ' + v + ' 💰', '#fcd34d');
    if (!have(v)) g.selected = bestOwned() || 1;
    renderInv(); renderSelected(); renderStats(); renderGrid(); renderDig();
    save(); syncLeaderboard();
  }
  function renderDig() {
    var b = G('bmg-dig'); if (!b) return;
    var cost = digCost(g.depth);
    var can = g.money >= cost;
    b.innerHTML = '⛏ Dig deeper &nbsp;<span style="color:#fcd34d">' + cost + ' 💰</span>';
    b.disabled = !can;
    b.style.opacity = can ? '1' : '0.5';
    b.style.cursor = can ? 'pointer' : 'not-allowed';
    b.title = can ? 'Unlock the next, richer layer of ore' : 'Sell elements to afford ' + cost + ' money';
  }
  function digDeeper() {
    var cost = digCost(g.depth);
    if (g.money < cost) return;
    g.money -= cost;
    g.depth += 1;
    toast('Dug deeper! Layer ' + g.depth + ' unlocked.', '#a7f3d0');
    renderGrid(); renderStats(); renderDig();
    // Keep the newest row in view
    var grid = G('bmg-grid'); if (grid) grid.scrollTop = grid.scrollHeight;
    save(); syncLeaderboard();
  }
  function placeAt(key) {
    var v = g.selected;
    if (!have(v)) { toast('Select an element to place first', '#f87171'); return; }
    g.placed[key] = v;
    g.inv[v]--; if (g.inv[v] <= 0) delete g.inv[v];
    if (!have(v)) g.selected = bestOwned() || g.selected;
    renderGrid(); renderInv(); renderSelected();
    save();
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
  function addToCraft(slot) {
    var v = g.selected;
    if (!have(v)) return;
    if (slot === 'A') g.slotA = v; else g.slotB = v;
    g.craftGuess = null;
    renderCraft();
  }
  function bitCell(ch, opts) {
    opts = opts || {};
    return '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:30px;' +
      'font-family:monospace;font-size:1.05rem;font-weight:700;border-radius:4px;margin:0 1px;' +
      'color:' + (opts.color || '#e2e8f0') + ';background:' + (opts.bg || 'transparent') + ';' +
      (opts.border ? 'border:1px solid ' + opts.border + ';' : '') + (opts.cursor ? 'cursor:pointer;' : '') + '" ' +
      (opts.attrs || '') + '>' + ch + '</span>';
  }
  function renderCraft() {
    var el = G('bmg-craft-body'); if (!el) return;
    var a = g.slotA, b = g.slotB;

    if (!a || !b) {
      el.innerHTML = '<div style="color:#64748b;font-size:0.8rem;padding:8px 0">' +
        'Pick two elements (use <b>→ Slot A</b> / <b>→ Slot B</b>) to combine them.' +
        '<div style="margin-top:6px;color:#94a3b8">A: ' + (a ? esc(elementName(a)) + ' (' + binStr(a) + ')' : '—') +
        ' &nbsp; B: ' + (b ? esc(elementName(b)) + ' (' + binStr(b) + ')' : '—') + '</div></div>';
      return;
    }
    var canDo = (a === b) ? (g.inv[a] || 0) >= 2 : have(a) && have(b);
    var r = additionRows(a, b);
    var W = r.width;
    if (!g.craftGuess || g.craftGuess.length !== W) g.craftGuess = new Array(W).fill(0);

    function inputRow(binPadded, label) {
      var cells = '';
      for (var i = 0; i < W; i++) cells += bitCell(binPadded[i], { color: '#cbd5e1' });
      return '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="width:104px;font-size:0.7rem;color:#93c5fd;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(label) + '</span>' +
        '<span style="display:flex">' + cells + '</span></div>';
    }
    var resultCells = '';
    for (var j = 0; j < W; j++) {
      var bit = g.craftGuess[j];
      resultCells += bitCell(String(bit), {
        color: bit ? '#fcd34d' : '#475569', bg: '#0f172a', border: '#334155', cursor: true,
        attrs: 'class="bmg-guess" data-i="' + j + '"'
      });
    }

    el.innerHTML =
      inputRow(r.aB, elementName(a) + ' ' + binStr(a)) +
      inputRow(r.bB, '+ ' + elementName(b) + ' ' + binStr(b)) +
      '<div style="border-top:1px solid #334155;margin:4px 0 4px 112px"></div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="width:104px;font-size:0.7rem;color:#fcd34d;text-align:right">= your answer</span>' +
        '<span style="display:flex">' + resultCells + '</span></div>' +
      '<div id="bmg-craft-msg" style="font-size:0.74rem;color:#94a3b8;margin:6px 0 0 112px;min-height:1rem">Tap the boxes to enter the binary sum, then Check.</div>' +
      '<div style="display:flex;gap:6px;margin-top:8px;margin-left:112px;flex-wrap:wrap">' +
        '<button id="bmg-craftbtn" ' + (canDo ? '' : 'disabled') + ' style="padding:5px 12px;border-radius:5px;border:none;background:' + (canDo ? '#16a34a' : '#334155') + ';color:#fff;font-size:0.78rem;font-weight:700;cursor:' + (canDo ? 'pointer' : 'not-allowed') + '">Check &amp; Craft</button>' +
        '<button id="bmg-craftclear" style="padding:5px 9px;border-radius:5px;border:1px solid #475569;background:#1e293b;color:#94a3b8;font-size:0.75rem;cursor:pointer">Clear</button>' +
      '</div>' +
      (canDo ? '' : '<div style="font-size:0.72rem;color:#f87171;margin:6px 0 0 112px">You don\'t have both ingredients.</div>');

    Array.prototype.forEach.call(el.querySelectorAll('.bmg-guess'), function (cell) {
      cell.onclick = function () {
        var i = +cell.dataset.i;
        g.craftGuess[i] = g.craftGuess[i] ? 0 : 1;
        renderCraft();
      };
    });
    G('bmg-craftbtn').onclick = function () { doCraft(a, b, r); };
    G('bmg-craftclear').onclick = function () { g.slotA = null; g.slotB = null; g.craftGuess = null; renderCraft(); };
  }
  function doCraft(a, b, r) {
    var canDo = (a === b) ? (g.inv[a] || 0) >= 2 : have(a) && have(b);
    if (!canDo) return;
    if (parseInt(g.craftGuess.join(''), 2) !== r.sum) {
      var m = G('bmg-craft-msg');
      if (m) { m.textContent = 'Not quite — add the two binary numbers column by column and try again.'; m.style.color = '#f87171'; }
      return;
    }
    g.inv[a]--; if (g.inv[a] <= 0) delete g.inv[a];
    g.inv[b]--; if (g.inv[b] <= 0) delete g.inv[b];
    gainElement(r.sum, 1);
    g.selected = r.sum;
    g.slotA = null; g.slotB = null; g.craftGuess = null;
    toast('Crafted ' + elementName(r.sum) + '!', '#a7f3d0');
    clearHint();
    renderGrid(); renderInv(); renderSelected(); renderStats(); renderCraft();
    save(); syncLeaderboard();
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

  // ── Mount ──────────────────────────────────────────────────────
  window.initBinaryMiningGame = function (containerId) {
    var wrap = G(containerId); if (!wrap) return;

    g = freshState();
    load();
    g.selected = have(g.selected) ? g.selected : (bestOwned() || 1);

    wrap.innerHTML = [
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">',
        // Left: world
        '<div style="flex:0 0 auto">',
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">',
            '<span style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">Your mine</span>',
            '<span id="bmg-toast" style="font-size:0.76rem;font-weight:600;opacity:0;transition:opacity .2s">&nbsp;</span>',
          '</div>',
          '<div id="bmg-grid" style="display:grid;grid-template-columns:repeat(' + COLS + ',' + CELL + 'px);grid-auto-rows:' + CELL + 'px;gap:0;border:2px solid #1e293b;border-radius:6px;overflow-y:auto;overflow-x:hidden;max-height:' + (MAX_VIS_ROWS * CELL) + 'px;user-select:none"></div>',
          '<button id="bmg-dig" style="margin-top:6px;width:' + (COLS * CELL) + 'px;padding:7px;border-radius:6px;border:1px solid #3b82f6;background:#15233b;color:#bfdbfe;font-size:0.8rem;font-weight:700"></button>',
          '<div style="font-size:0.68rem;color:#64748b;margin-top:5px;max-width:' + (COLS * CELL) + 'px">',
            'Left-click a block to <b>mine</b> it (you need a strong enough pickaxe). Right-click the sky to <b>place</b> your selected block. <b>Dig deeper</b> to reach richer ore.',
          '</div>',
        '</div>',
        // Right: panels
        '<div style="flex:1;min-width:280px;max-width:430px;display:flex;flex-direction:column;gap:10px">',
          panel('Stats', '<div id="bmg-stats" style="display:flex;flex-direction:column;gap:3px;font-size:0.8rem"></div>' +
            '<button id="bmg-journal-btn" style="margin-top:8px;width:100%;padding:6px;border-radius:6px;border:1px solid #4c3a78;background:#1d1733;color:#c4b5fd;font-size:0.76rem;font-weight:700;cursor:pointer">📖 Open Element Journal</button>'),
          '<div id="bmg-hint" style="display:none;background:#1a1320;border:1px solid #4c1d2e;border-radius:8px;padding:8px"></div>',
          panel('Selected', '<div id="bmg-selected"></div>'),
          panel('Combine — work out the binary sum',
            '<div id="bmg-craft-body"></div>', 'bmg-craft'),
          panel('Inventory', '<div id="bmg-inv" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;max-height:150px;overflow-y:auto"></div>'),
          panel('🏆 Class leaderboard', '<div id="bmg-lb"></div>'),
          '<button id="bmg-reset" style="align-self:flex-start;padding:3px 8px;border-radius:5px;border:1px solid #3f1d1d;background:#1a0f0f;color:#7f5252;font-size:0.66rem;cursor:pointer">Reset game</button>',
        '</div>',
      '</div>'
    ].join('');

    function panel(title, body, id) {
      return '<div' + (id ? ' id="' + id + '"' : '') + ' style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:9px 10px">' +
        '<div style="font-size:0.66rem;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:6px;font-weight:700">' + title + '</div>' +
        body +
      '</div>';
    }

    // Wire grid
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

    // Wire inventory selection
    G('bmg-inv').addEventListener('click', function (e) {
      var t = e.target.closest('.bmg-invtile'); if (!t) return;
      g.selected = +t.dataset.val;
      renderInv(); renderSelected();
    });

    G('bmg-dig').onclick = digDeeper;
    G('bmg-journal-btn').onclick = openJournal;

    G('bmg-reset').onclick = function () {
      if (!confirm('Reset your mine, inventory and money? This cannot be undone.')) return;
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      g = freshState();
      renderAll();
      save(); syncLeaderboard();
    };

    function renderAll() {
      renderGrid(); renderInv(); renderSelected(); renderStats(); renderCraft(); renderDig();
    }
    renderAll();

    // Leaderboard: immediate + 30s poll (clear any previous widget's timer)
    if (window._bmgLbTimer) { clearInterval(window._bmgLbTimer); window._bmgLbTimer = null; }
    fetchLeaderboard();
    syncLeaderboard();
    window._bmgLbTimer = setInterval(fetchLeaderboard, 30000);

    // Lesson step auto-completes on mount (it's a sandbox, not a graded task)
    if (window.__markStepComplete) { try { window.__markStepComplete(); } catch (e) {} }
  };

})();
