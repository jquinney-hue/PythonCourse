/**
 * binary-mine-3d-module.js
 *
 * "Binary Mine 3D" — a Three.js voxel version of the Binary Mine game.
 * Year 8 Binary L4.
 *
 * Same teaching mechanics as the 2D game (L3): every element is a positive
 * integer; combining two elements is binary ADDITION and the sum becomes a
 * crafted pickaxe item. To mine a block of value V you must equip a qualifying
 * pickaxe on the hotbar. Crafting consumes both inputs, so mining is the only
 * faucet of new element value.
 *
 * The ONLY difference from L3 is presentation: the mine is a 3D voxel world you
 * orbit, mine (left-click) and build in (right-click). Crafting, inventory,
 * shop, journal, leaderboard and save/load are DOM overlays, identical in spirit
 * to the 2D game.
 *
 * ── Fully separate from the 2D game ─────────────────────────────────────────
 *   Own localStorage key   : pylearn_mining3d_v1
 *   Own leaderboard path    : miningGame3D/{className}/{code}
 *   Own Drive save file     : binary-mine-3d-save.json  (app tag 'binary-mine-3d')
 *
 * ── Firebase / privacy (same guarantees as L3) ──────────────────────────────
 *   Writes ONLY:  miningGame3D/{className}/{code}: { money, best, updatedAt }
 *   where {code} is state.uid (the opaque LOGIN CODE, never a Google UID).
 *   No names / emails / UIDs are ever written.
 *
 * Three.js is loaded on demand (dynamic import via the page's import map) the
 * first time a student opens this lesson, so it costs nothing on other pages.
 *
 * Mounted via window.initBinaryMine3D(containerId). All DOM ids prefixed bmg3-.
 */

(function () {

  // ── Tunables ───────────────────────────────────────────────────
  var RENDER_RADIUS = 9;        // horizontal voxel radius rendered around the player
  var RENDER_DEPTH  = 22;       // vertical natural terrain scan below the player/surface
  var START_DEPTH = 5;          // legacy save field; terrain is now endless
  var SEED        = 20260629;   // shared world — identical for every player
  var BRUTE_BITS  = 2;          // a pickaxe brute-mines anything <= bits(pick)-2
  var START_INV   = { 1: 5 };   // five Hydrogen to bootstrap

  // ── Terrain ────────────────────────────────────────────────────
  // Like Minecraft: Perlin-noise hills, grass on the surface, dirt under that,
  // then endless rock layers. Rocks get harder by bit-length as they get deeper.
  var DIRT_LAYERS      = 2;     // depth 1..2 are dirt; depth >= 3 is stone
  var ELEMENT_PERMILLE = 220;   // element ore frequency in rock layers
  var REBUILD_STEP_XZ  = 4;     // move this many blocks before rebuilding the visible world
  var REBUILD_STEP_Y   = 5;     // vertical equivalent; keeps chunk loading from firing every step
  var MAX_SURFACE_CACHE = 24000;
  var MAX_CONTENT_CACHE = 90000;
  var GENERIC = {
    grass: { name: 'Grass', color: '#5fae3a', sym: 'Gr', bits: 0 },
    dirt:  { name: 'Dirt',  color: '#7a5230', sym: 'Di', bits: 0 }
  };
  function isGeneric(id) { return typeof id === 'string' && !!GENERIC[id]; }

  var ROCK_TYPES = [
    { id: 'rock:shale',      name: 'Shale',      color: '#5f6468', sym: 'Sh', bits: 2 },
    { id: 'rock:limestone',  name: 'Limestone',  color: '#a9a48d', sym: 'Lm', bits: 2 },
    { id: 'rock:sandstone',  name: 'Sandstone',  color: '#b99764', sym: 'Sa', bits: 3 },
    { id: 'rock:slate',      name: 'Slate',      color: '#4f5864', sym: 'Sl', bits: 3 },
    { id: 'rock:basalt',     name: 'Basalt',     color: '#34383d', sym: 'Ba', bits: 4 },
    { id: 'rock:granite',    name: 'Granite',    color: '#8f7b78', sym: 'Gn', bits: 4 },
    { id: 'rock:marble',     name: 'Marble',     color: '#d2d0c7', sym: 'Mb', bits: 5 },
    { id: 'rock:gneiss',     name: 'Gneiss',     color: '#756f65', sym: 'Gs', bits: 5 },
    { id: 'rock:quartzite',  name: 'Quartzite',  color: '#c8c5b7', sym: 'Qz', bits: 6 },
    { id: 'rock:obsidian',   name: 'Obsidian',   color: '#1b1726', sym: 'Ob', bits: 7 }
  ];
  ROCK_TYPES.forEach(function (r) { GENERIC[r.id] = r; });
  var ROCK_PRE = ['Umbral','Viridian','Cobalt','Aster','Ferric','Lunar','Amber','Onyx','Vesper','Solar'];
  var ROCK_SUF = ['shale','stone','basalt','granite','slate','gneiss','marble','schist','quartzite','tuff'];

  // Depth is endless. Each mine layer d (1-indexed) draws block values from a
  // band whose centre grows ~1.55x per level, so values pass 118 into procedural
  // territory the deeper you mine.
  function depthCentre(d) { return Math.max(1, Math.round(Math.pow(1.55, d))); }
  function bandForDepth(d) {
    if (d <= 1) return [1, 2];
    var c = depthCentre(d);
    return [Math.max(1, Math.round(c * 0.7)), Math.round(c * 1.35)];
  }
  var LS_KEY = 'pylearn_mining3d_v1';

  // ── Element identity (shared with the 2D game's conventions) ───
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
  function hashCoords(x, z, salt) {
    return hash32(Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(salt | 0, 1442695041) ^ SEED);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function grad2(ix, iz, x, z) {
    var h = hashCoords(ix, iz, 911);
    var angle = (h % 6283) / 1000;
    return Math.cos(angle) * (x - ix) + Math.sin(angle) * (z - iz);
  }
  function perlin2(x, z) {
    var x0 = Math.floor(x), z0 = Math.floor(z), x1 = x0 + 1, z1 = z0 + 1;
    var sx = fade(x - x0), sz = fade(z - z0);
    var n0 = lerp(grad2(x0, z0, x, z), grad2(x1, z0, x, z), sx);
    var n1 = lerp(grad2(x0, z1, x, z), grad2(x1, z1, x, z), sx);
    return lerp(n0, n1, sz);
  }
  function fbm2(x, z) {
    var amp = 1, freq = 1, sum = 0, norm = 0;
    for (var i = 0; i < 4; i++) {
      sum += perlin2(x * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return sum / norm;
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
  // ── Pickaxes ───────────────────────────────────────────────────
  // A pickaxe is an ITEM crafted from two elements (still binary addition). Its
  // POWER is the sum; a pickaxe of power P mines ore of value V when P === V, or
  // by brute force when bits(P) >= bits(V)+BRUTE_BITS. Any real pickaxe can mine
  // Hydrogen, because there is no possible pickaxe with power 1. Pickaxes are permanent
  // and kept in g.picks keyed by power; the recipe {a,b} drives the name and the
  // 2-colour voxel model. Naming: "<hi>-infused <lo> Pickaxe" with the HANDLE in
  // the higher element's colour and the AXE head in the lower element's colour
  // (e.g. Helium-infused Hydrogen → helium handle, hydrogen head).
  function pickSel(power) { return 'pick:' + power; }
  function isPickSel(sel) { return typeof sel === 'string' && sel.indexOf('pick:') === 0; }
  function selPower(sel) { return isPickSel(sel) ? +sel.slice(5) : null; }
  function pickInfoFor(a, b) {
    var lo = Math.min(a, b), hi = Math.max(a, b), power = a + b;
    var name = (lo === hi) ? (elementName(lo) + ' Pickaxe')
      : (elementName(hi) + '-infused ' + elementName(lo) + ' Pickaxe');
    return { power: power, lo: lo, hi: hi, name: name, handle: elementColor(hi), head: elementColor(lo) };
  }
  function pickInfoFromPower(power) {
    var rec = g.picks[power]; if (!rec) return null;
    return pickInfoFor(rec.a, rec.b);
  }
  function ownedPickPowers() {
    return Object.keys(g.picks).map(Number).sort(function (a, b) { return a - b; });
  }
  function pickCanMine(power, v) { return v === 1 || power === v || bits(power) >= bits(v) + BRUTE_BITS; }
  function anyPickCanMine(v) {
    var ps = ownedPickPowers();
    for (var i = 0; i < ps.length; i++) if (pickCanMine(ps[i], v)) return true;
    return false;
  }
  function gainPick(a, b) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    g.picks[a + b] = { a: lo, b: hi };
  }

  // ── Game state ─────────────────────────────────────────────────
  var g = null;
  function freshState() {
    return {
      inv: Object.assign({}, START_INV),  // value -> count
      money: 0,
      best: 1,
      depth: START_DEPTH,   // legacy save field; no longer gates terrain
      discovered: { 1: true },
      mined: {},            // "x,y,z" -> true  (natural cells removed)
      placed: {},           // "x,y,z" -> value | generic-type (built blocks)
      blocks: {},           // generic-type -> count (build-only, not craftable)
      picks: {},            // pickaxe power -> { a, b } ingredient values
      shop: {},             // value -> count (sold elements, buyable back at 2x)
      _lastLb: [],
      _lbClass: '',
      selected: 1,
      hotbar: new Array(8).fill(null),
      hotbarIndex: 0,
      slotA: null,
      slotB: null,
      craftGuess: null,
      craftCarry: null,
      dragSel: null,
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
      g.blocks     = raw.blocks || {};
      g.picks      = raw.picks || {};
      g.shop       = raw.shop || {};
      g.selected   = raw.selected || bestOwned() || 1;
      g.hotbar     = Array.isArray(raw.hotbar) ? raw.hotbar.slice(0, 8) : new Array(8).fill(null);
      while (g.hotbar.length < 8) g.hotbar.push(null);
      g.hotbarIndex = Math.max(0, Math.min(7, Math.floor(raw.hotbarIndex || 0)));
      repairHotbarAndSelection();
      return true;
    } catch (e) { return false; }
  }
  function save() {
    clearTimeout(g.saveTimer);
    g.saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          inv: g.inv, money: g.money, best: g.best, depth: g.depth,
          discovered: g.discovered, mined: g.mined, placed: g.placed, blocks: g.blocks,
          picks: g.picks, shop: g.shop, selected: g.selected, hotbar: g.hotbar, hotbarIndex: g.hotbarIndex
        }));
      } catch (e) {}
    }, 400);
  }

  // ── Firebase leaderboard (privacy-safe: class/code/money/best only) ──
  var LB_CLASS_KEY = 'pylearn_mining3d_lb_class';
  var lbClassLoadRetries = 0;

  function hasSavedStaffLogin() {
    try {
      return localStorage.getItem('pylearn_is_teacher') === '1' ||
        localStorage.getItem('pylearn_auth_mode') === 'google-admin';
    } catch (e) { return false; }
  }
  function isStaffUser() {
    return !!(window.state && (state.isAdmin || state.isTeacher || hasSavedStaffLogin()));
  }
  function savedLeaderboardClass() {
    try { return localStorage.getItem(LB_CLASS_KEY) || ''; } catch (e) { return ''; }
  }
  function saveLeaderboardClass(className) {
    try { localStorage.setItem(LB_CLASS_KEY, className || ''); } catch (e) {}
  }
  function leaderboardClassName() {
    if (!(window.state && state.db)) return '';
    if (isStaffUser()) {
      var sel = G('bmg3-class-select');
      return (sel && sel.value) || savedLeaderboardClass();
    }
    return state.className || '';
  }
  function leaderboardClassRef(className) {
    return state.db.ref('miningGame3D/' + className);
  }
  function setLeaderboardStatus(message, color) {
    var el = G('bmg3-lb-status'); if (!el) return;
    el.textContent = message || '';
    el.style.color = color || '#555';
  }
  function ensureStudentLeaderboardClass() {
    if (!(window.state && state.db) || isStaffUser()) return Promise.resolve(leaderboardClassName());
    if (state.className) return Promise.resolve(state.className);
    if (!state.uid || typeof findClassForCode !== 'function') return Promise.resolve('');
    return findClassForCode(state.uid).then(function (className) {
      state.className = className || '';
      renderLeaderboardClassPicker();
      return state.className;
    }).catch(function () { return ''; });
  }
  function getLeaderboardClassName() {
    if (!(window.state && state.db)) return Promise.resolve('');
    return isStaffUser() ? Promise.resolve(leaderboardClassName()) : ensureStudentLeaderboardClass();
  }
  function renderLeaderboardClassPicker() {
    var wrap = G('bmg3-class-picker'); if (!wrap) return;
    if (!(window.state && state.db)) { wrap.innerHTML = ''; return; }

    if (!isStaffUser()) {
      wrap.innerHTML = state.className
        ? '<span style="font-size:0.72rem;color:#555;font-weight:700">Class: ' + esc(state.className) + '</span>'
        : '';
      return;
    }

    wrap.innerHTML =
      '<label for="bmg3-class-select" style="font-size:0.72rem;color:#555;font-weight:700">Class</label>' +
      '<select id="bmg3-class-select" class="bmg3-btn" style="padding:2px 8px;font-size:0.74rem;min-width:96px">' +
        '<option value="">Loading...</option>' +
      '</select>';

    var sel = G('bmg3-class-select');
    var loader = (typeof getClassNames === 'function')
      ? getClassNames()
      : state.db.ref('classNames').get().then(function (snap) {
          return snap.exists() ? Object.keys(snap.val() || {}).sort() : [];
        });

    loader.then(function (names) {
      lbClassLoadRetries = 0;
      names = (names || []).slice().sort();
      var saved = savedLeaderboardClass();
      var selected = (saved && names.indexOf(saved) !== -1) ? saved : (names[0] || '');
      sel.innerHTML = names.length
        ? names.map(function (name) {
            return '<option value="' + esc(name) + '"' + (name === selected ? ' selected' : '') + '>' + esc(name) + '</option>';
          }).join('')
        : '<option value="">No classes</option>';
      if (selected) saveLeaderboardClass(selected);
      sel.onchange = function () {
        saveLeaderboardClass(sel.value);
        g._lbClass = '';
        renderLeaderboard([], sel.value ? 'Loading ' + sel.value + ' leaderboard...' : 'No class leaderboard selected.');
        setLeaderboardStatus('');
        fetchLeaderboard();
      };
      fetchLeaderboard();
    }).catch(function () {
      sel.innerHTML = '<option value="">Could not load</option>';
      setLeaderboardStatus('Could not load class list.', '#7a2a2a');
      if (isStaffUser() && lbClassLoadRetries < 5) {
        lbClassLoadRetries++;
        setTimeout(renderLeaderboardClassPicker, 1000);
      }
    });
  }

  function syncLeaderboard() {
    if (!(window.state && state.db && state.uid && !state.isAdmin && !state.isTeacher)) return;
    clearTimeout(g.syncTimer);
    g.syncTimer = setTimeout(function () {
      ensureStudentLeaderboardClass().then(function (className) {
        if (!className) return;
        return leaderboardClassRef(className).child(state.uid).set({
          money: Math.max(0, Math.floor(g.money)),
          best: Math.max(1, Math.floor(g.best)),
          updatedAt: Date.now()
        });
      }).catch(function () {});
    }, 2500);
  }
  function fetchLeaderboard() {
    if (!(window.state && state.db)) { renderLeaderboard([]); return; }
    if (isStaffUser() && !G('bmg3-class-select')) renderLeaderboardClassPicker();
    getLeaderboardClassName().then(function (className) {
      if (!className) {
        setLeaderboardStatus(isStaffUser() ? 'Choose a class to view.' : 'Your class is still loading.');
        renderLeaderboard([], 'No class leaderboard selected.');
        return null;
      }
      setLeaderboardStatus('');
      if (g._lbClass !== className) {
        g._lbClass = className;
        renderLeaderboard([], 'Loading ' + className + ' leaderboard...');
      }
      return leaderboardClassRef(className).get();
    }).then(function (snap) {
      if (!snap) return;
      var data = snap.val() || {};
      var rows = Object.keys(data).map(function (code) {
        var d = data[code] || {};
        return { code: code, money: +d.money || 0, best: +d.best || 0 };
      }).filter(function (r) { return r.best > 0 || r.money > 0; });
      rows.sort(function (a, b) { return b.best - a.best || b.money - a.money; });
      renderLeaderboard(rows);
    }).catch(function () {
      setLeaderboardStatus('Could not load leaderboard.', '#7a2a2a');
    });
  }

  // ── Helpers ────────────────────────────────────────────────────
  function G(id) { return document.getElementById(id); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s)) : String(s); }
  function have(v) { return (g.inv[v] || 0) > 0; }
  // True if the currently-held selection (pickaxe, element value, or terrain block) is owned.
  function haveSel(sel) {
    if (isPickSel(sel)) return !!g.picks[selPower(sel)];
    if (isGeneric(sel)) return g.blocks[sel] > 0;
    return typeof sel === 'number' && have(sel);
  }
  function sameSel(a, b) { return String(a) === String(b); }
  function ownedSelectors() {
    var entries = [];
    ownedPickPowers().forEach(function (power) { entries.push(pickSel(power)); });
    ownedValues().forEach(function (v) { entries.push(v); });
    Object.keys(GENERIC).forEach(function (t) { if (g.blocks[t] > 0) entries.push(t); });
    return entries;
  }
  function firstOwnedSelector() {
    var entries = ownedSelectors();
    return entries.length ? entries[0] : null;
  }
  function selectorText(sel) { return String(sel); }
  function selectorFromText(raw) {
    if (raw == null || raw === '') return null;
    if (isPickSel(raw)) return raw;
    if (isGeneric(raw)) return raw;
    var n = +raw;
    return isFinite(n) ? n : null;
  }
  function hotbarHas(sel) {
    for (var i = 0; i < g.hotbar.length; i++) if (sameSel(g.hotbar[i], sel)) return true;
    return false;
  }
  function entryForSelector(sel) {
    if (isPickSel(sel)) {
      var power = selPower(sel);
      return { kind: 'pick', id: sel, power: power, count: 1 };
    }
    if (isGeneric(sel)) return { kind: 'gen', id: sel, count: g.blocks[sel] || 0 };
    return { kind: 'el', id: sel, count: g.inv[sel] || 0 };
  }
  function putInHotbar(sel, idx) {
    if (!haveSel(sel)) return;
    idx = (idx == null) ? g.hotbarIndex : idx;
    idx = Math.max(0, Math.min(7, idx));
    for (var i = 0; i < g.hotbar.length; i++) {
      if (sameSel(g.hotbar[i], sel)) { g.hotbarIndex = i; g.selected = sel; return; }
    }
    g.hotbar[idx] = sel;
    g.hotbarIndex = idx;
    g.selected = sel;
  }
  function repairHotbarAndSelection() {
    if (!Array.isArray(g.hotbar)) g.hotbar = new Array(8).fill(null);
    while (g.hotbar.length < 8) g.hotbar.push(null);
    var seen = {};
    g.hotbar = g.hotbar.slice(0, 8).map(function (sel) {
      if (!haveSel(sel)) return null;
      var key = selectorText(sel);
      if (seen[key]) return null;
      seen[key] = true;
      return sel;
    });
    var entries = ownedSelectors();
    entries.forEach(function (sel) {
      if (g.hotbar.some(function (h) { return sameSel(h, sel); })) return;
      for (var i = 0; i < g.hotbar.length; i++) {
        if (g.hotbar[i] == null) { g.hotbar[i] = sel; return; }
      }
    });
    g.hotbarIndex = Math.max(0, Math.min(7, Math.floor(g.hotbarIndex || 0)));
    if (!haveSel(g.selected)) {
      g.selected = haveSel(g.hotbar[g.hotbarIndex]) ? g.hotbar[g.hotbarIndex] : firstOwnedSelector();
    }
    if (haveSel(g.selected)) {
      var found = -1;
      for (var j = 0; j < g.hotbar.length; j++) if (sameSel(g.hotbar[j], g.selected)) { found = j; break; }
      if (found >= 0) g.hotbarIndex = found;
      else putInHotbar(g.selected, g.hotbarIndex);
    }
  }
  function selectHotbar(idx) {
    repairHotbarAndSelection();
    idx = (idx + 8) % 8;
    g.hotbarIndex = idx;
    if (haveSel(g.hotbar[idx])) g.selected = g.hotbar[idx];
    renderInv(); renderHotbar(); renderSelected();
    renderPauseMenu();
    save();
  }
  function selectItem(sel) {
    if (!haveSel(sel)) return;
    putInHotbar(sel, g.hotbarIndex);
    renderInv(); renderHotbar(); renderSelected();
    renderPauseMenu();
    save();
  }
  function placeInHotbar(sel, idx) {
    if (!haveSel(sel)) return;
    idx = Math.max(0, Math.min(7, idx));
    var oldIdx = -1;
    for (var i = 0; i < g.hotbar.length; i++) {
      if (sameSel(g.hotbar[i], sel)) { oldIdx = i; break; }
    }
    var displaced = g.hotbar[idx];
    if (oldIdx >= 0 && oldIdx !== idx) g.hotbar[oldIdx] = displaced;
    g.hotbar[idx] = sel;
    g.hotbarIndex = idx;
    g.selected = sel;
    repairHotbarAndSelection();
    renderInv(); renderHotbar(); renderSelected();
    renderPauseMenu();
    save();
  }
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

  // ── Voxel world model ──────────────────────────────────────────
  // World coords are endless. Natural terrain exists at every column up to its
  // Perlin-noise surface height. Everything is keyed "x,y,z".
  var surfaceCache = Object.create(null), surfaceCacheCount = 0;
  var contentIdCache = Object.create(null), contentIdCacheCount = 0;
  function cellKey(x, y, z) { return x + ',' + y + ',' + z; }
  function natKey(x, z, y) { return cellKey(x, y, z); }
  function parseKey(k) { var p = k.split(','); return { x: +p[0], y: +p[1], z: +p[2] }; }

  function surfaceHeight(x, z) {
    x = x | 0; z = z | 0;
    var key = x + ',' + z;
    var cached = surfaceCache[key];
    if (cached !== undefined) return cached;
    var hills = fbm2(x * 0.055, z * 0.055);
    var detail = perlin2(x * 0.17 + 40, z * 0.17 - 15) * 0.8;
    var y = Math.floor(2 + hills * 8 + detail);
    if (surfaceCacheCount > MAX_SURFACE_CACHE) {
      surfaceCache = Object.create(null);
      surfaceCacheCount = 0;
    }
    surfaceCache[key] = y;
    surfaceCacheCount++;
    return y;
  }
  function depthBelowSurface(x, y, z) { return surfaceHeight(x, z) - y; }
  function proceduralRock(tier) {
    var id = 'rock:proc' + tier;
    if (GENERIC[id]) return GENERIC[id];
    var h = hash32(tier * 8191 + SEED);
    var name = ROCK_PRE[h % ROCK_PRE.length] + ' ' + ROCK_SUF[(h >>> 8) % ROCK_SUF.length];
    var hue = h % 360;
    var light = 36 + ((h >>> 12) % 18);
    var meta = { id: id, name: name, color: 'hsl(' + hue + ',22%,' + light + '%)', sym: 'R' + (tier + 1), bits: 7 + Math.floor((tier - ROCK_TYPES.length) / 2) };
    GENERIC[id] = meta;
    return meta;
  }
  function rockForDepth(depth) {
    var rockDepth = Math.max(0, depth - DIRT_LAYERS - 1);
    var tier = Math.floor(rockDepth / 4);
    return tier < ROCK_TYPES.length ? ROCK_TYPES[tier] : proceduralRock(tier);
  }
  function genericTypeForDepth(d) {
    if (d === 0) return 'grass';
    if (d <= DIRT_LAYERS) return 'dirt';
    return rockForDepth(d).id;
  }
  function genericTypeAt(x, y, z) {
    return genericTypeForDepth(depthBelowSurface(x, y, z));
  }
  // Is this cell an element ore vein? (Never in grass or dirt.)
  function isElementCellAtDepth(x, y, z, d) {
    if (d <= DIRT_LAYERS) return false;
    var rock = rockForDepth(d);
    var chance = Math.max(70, ELEMENT_PERMILLE - rock.bits * 10);
    return (hashCoords(x, z, y * 37 + 3007) % 1000) < chance;
  }
  function isElementCell(x, y, z) {
    return isElementCellAtDepth(x, y, z, depthBelowSurface(x, y, z));
  }
  // The element value of an ore cell (deeper = higher, same curve as the 2D game).
  function oreValueForDepth(x, y, z, d) {
    var oreDepth = Math.max(1, d - DIRT_LAYERS);
    var band = bandForDepth(oreDepth);
    var span = band[1] - band[0] + 1;
    return band[0] + (hashCoords(x, z, y * 53 + 15486233) % span);
  }
  function oreValue(x, y, z) {
    return oreValueForDepth(x, y, z, depthBelowSurface(x, y, z));
  }
  function contentIdAt(x, y, z) {
    var surf = surfaceHeight(x, z);
    if (y > surf) return null;
    var key = cellKey(x, y, z);
    var cached = contentIdCache[key];
    if (cached !== undefined) return cached;
    var d = surf - y;
    var id = isElementCellAtDepth(x, y, z, d) ? oreValueForDepth(x, y, z, d) : genericTypeForDepth(d);
    if (contentIdCacheCount > MAX_CONTENT_CACHE) {
      contentIdCache = Object.create(null);
      contentIdCacheCount = 0;
    }
    contentIdCache[key] = id;
    contentIdCacheCount++;
    return id;
  }
  function oreRenderId(v) { return 'ore:' + Math.min(64, bits(v)); }
  function isOreRenderId(id) { return typeof id === 'string' && id.indexOf('ore:') === 0; }
  function renderIdForContentId(id) {
    return (typeof id === 'number' && id >= 1 && id < REAL_NAMES.length) ? id
      : (typeof id === 'number' ? oreRenderId(id) : id);
  }
  // Content of a cell: { el: value } for ore, or { gen: type } for terrain.
  function contentAt(x, y, z) {
    var id = contentIdAt(x, y, z);
    if (id == null) return null;
    return typeof id === 'number' ? { el: id } : { gen: id };
  }
  // Natural (un-mined) content at a key, or null if air / mined / out of range.
  function naturalContentAt(key) {
    var w = parseKey(key);
    if (g.mined[key]) return null;
    return contentAt(w.x, w.y, w.z);
  }
  // The renderable id of a cell/placed block: an element value (number) or a
  // generic type (string). Both work as object keys and never collide.
  function idOfContent(c) { return c.el != null ? c.el : c.gen; }
  function solidAtXYZ(x, y, z) {
    var key = cellKey(x, y, z);
    return g.placed[key] != null || (!g.mined[key] && y <= surfaceHeight(x, z));
  }
  function solidAt(key) {
    var w = parseKey(key);
    return solidAtXYZ(w.x, w.y, w.z);
  }
  // Occluder = anything solid that hides a face.
  function occluderAt(key) {
    return solidAt(key);
  }
  var NB = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  function exposedAtXYZ(x, y, z) {
    for (var i = 0; i < 6; i++) {
      if (!solidAtXYZ(x + NB[i][0], y + NB[i][1], z + NB[i][2])) return true;
    }
    return false;
  }
  function exposed(key) {
    var w = parseKey(key);
    return exposedAtXYZ(w.x, w.y, w.z);
  }

  var FACE_DEFS = [
    { dx:  1, dy:  0, dz:  0, n: [ 1,  0,  0], c: [[ 0.5,-0.5,-0.5],[ 0.5, 0.5,-0.5],[ 0.5, 0.5, 0.5],[ 0.5,-0.5, 0.5]] },
    { dx: -1, dy:  0, dz:  0, n: [-1,  0,  0], c: [[-0.5,-0.5, 0.5],[-0.5, 0.5, 0.5],[-0.5, 0.5,-0.5],[-0.5,-0.5,-0.5]] },
    { dx:  0, dy:  1, dz:  0, n: [ 0,  1,  0], c: [[-0.5, 0.5, 0.5],[ 0.5, 0.5, 0.5],[ 0.5, 0.5,-0.5],[-0.5, 0.5,-0.5]] },
    { dx:  0, dy: -1, dz:  0, n: [ 0, -1,  0], c: [[-0.5,-0.5,-0.5],[ 0.5,-0.5,-0.5],[ 0.5,-0.5, 0.5],[-0.5,-0.5, 0.5]] },
    { dx:  0, dy:  0, dz:  1, n: [ 0,  0,  1], c: [[ 0.5,-0.5, 0.5],[ 0.5, 0.5, 0.5],[-0.5, 0.5, 0.5],[-0.5,-0.5, 0.5]] },
    { dx:  0, dy:  0, dz: -1, n: [ 0,  0, -1], c: [[-0.5,-0.5,-0.5],[-0.5, 0.5,-0.5],[ 0.5, 0.5,-0.5],[ 0.5,-0.5,-0.5]] }
  ];

  function faceMaskAtXYZ(x, y, z) {
    var mask = 0;
    for (var i = 0; i < FACE_DEFS.length; i++) {
      var f = FACE_DEFS[i];
      if (!solidAtXYZ(x + f.dx, y + f.dy, z + f.dz)) mask |= (1 << i);
    }
    return mask;
  }

  function canMine(v) {
    var power = selectedPickPower();
    return power != null && pickCanMine(power, v);
  }
  function selectedPickPower() {
    if (!isPickSel(g.selected)) return null;
    var power = selPower(g.selected);
    return g.picks[power] ? power : null;
  }
  function selectedPickBits() {
    var power = selectedPickPower();
    return power == null ? 0 : bits(power);
  }
  function canMineGeneric(type) {
    var meta = GENERIC[type];
    if (!meta) return false;
    return (meta.bits || 0) <= selectedPickBits();
  }
  function anyPickCanMineGeneric(type) {
    var meta = GENERIC[type];
    if (!meta) return false;
    var need = meta.bits || 0;
    if (need <= 0) return true;
    var ps = ownedPickPowers();
    for (var i = 0; i < ps.length; i++) if (bits(ps[i]) >= need) return true;
    return false;
  }
  function gainElement(v, n) {
    n = n || 1;
    g.inv[v] = (g.inv[v] || 0) + n;
    if (!g.discovered[v]) g.discovered[v] = true;
    if (v > g.best) g.best = v;
  }
  function gainBlock(type, n) {
    n = n || 1;
    g.blocks[type] = (g.blocks[type] || 0) + n;
  }

  // ── Toast ──────────────────────────────────────────────────────
  function toast(msg, color) {
    var el = G('bmg3-toast'); if (!el) return;
    el.textContent = msg;
    el.style.color = color || '#2f6a2f';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 2200);
  }

  // ── Minecraft-style skin (injected once) ───────────────────────
  function injectStyle() {
    if (document.getElementById('bmg3-style')) return;
    var s = document.createElement('style');
    s.id = 'bmg3-style';
    s.textContent =
      '.bmg3-wrap{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#222}' +
      '.bmg3-panel{background:#c6c6c6;border:4px solid;border-color:#fff #565656 #565656 #fff;padding:10px}' +
      '.bmg3-h{font-size:1.02rem;font-weight:800;color:#3f3f3f;letter-spacing:1px;margin:0 0 6px;text-shadow:1px 1px 0 #fff}' +
      '.bmg3-slot{width:42px;height:42px;background:#8b8b8b;border:3px solid;border-color:#373737 #fff #fff #373737;box-sizing:border-box;position:relative}' +
      '.bmg3-slot.sel{box-shadow:inset 0 0 0 3px #ffd34d}' +
      '.bmg3-gamebox{position:relative;width:100%;height:480px;background:#8fb7de;overflow:hidden;user-select:none}' +
      '.bmg3-gamebox *{user-select:none}' +
      '.bmg3-gamebox:fullscreen{width:100vw;height:100vh;background:#8fb7de}' +
      '.bmg3-gamebox:fullscreen .bmg3-canvas{height:100%;border:none}' +
      '.bmg3-hud{position:absolute;left:10px;right:10px;top:10px;display:flex;align-items:flex-start;gap:8px;z-index:5;pointer-events:none}' +
      '.bmg3-hud-panel{background:rgba(198,198,198,0.92);border:3px solid;border-color:#fff #565656 #565656 #fff;padding:7px;pointer-events:auto}' +
      '.bmg3-hud-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:min(620px,62vw)}' +
      '.bmg3-hud-actions{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;pointer-events:auto}' +
      '.bmg3-hud-actions .bmg3-btn{padding:4px 9px;font-size:0.74rem}' +
      '.bmg3-menu-btn{min-width:76px;text-align:center}' +
      '.bmg3-hotbar{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:grid;grid-template-columns:repeat(8,46px);gap:3px;justify-content:center;margin:0;z-index:5;pointer-events:auto}' +
      '.bmg3-hotbar-slot{width:46px;height:46px;background:#8b8b8b;border:3px solid;border-color:#373737 #fff #fff #373737;box-sizing:border-box;position:relative}' +
      '.bmg3-hotbar-slot.sel{box-shadow:inset 0 0 0 3px #ffd34d}' +
      '.bmg3-inventory-hotbar{display:grid;grid-template-columns:repeat(8,46px);gap:3px;justify-content:center;margin-top:16px;padding-top:12px;border-top:3px solid #8f8f8f}' +
      '.bmg3-hotkey{position:absolute;left:2px;top:0;font-size:10px;font-weight:800;color:#fff;text-shadow:1px 1px 0 #333;z-index:2}' +
      '.bmg3-slot.bmg3-drop{background:#a7a76a}' +
      '.bmg3-item{position:absolute;inset:2px;display:flex;align-items:center;justify-content:center;user-select:none}' +
      '.bmg3-item[draggable=true]{cursor:grab}.bmg3-item[draggable=true]:active{cursor:grabbing}' +
      '.bmg3-sym{font-family:ui-sans-serif,system-ui,sans-serif;font-weight:800;color:#0a0f1a;font-size:13px;text-shadow:0 1px 0 rgba(255,255,255,0.4)}' +
      '.bmg3-count{position:absolute;right:1px;bottom:-4px;font-size:13px;font-weight:800;color:#fff;text-shadow:1px 1px 0 #3f3f3f}' +
      '.bmg3-arrow{font-size:1.7rem;color:#5a5a5a;font-weight:800;line-height:1}' +
      '.bmg3-btn{font-family:inherit;background:#c6c6c6;border:3px solid;border-color:#fff #565656 #565656 #fff;color:#2a2a2a;font-weight:700;cursor:pointer}' +
      '.bmg3-btn:active{border-color:#565656 #fff #fff #565656}' +
      '.bmg3-btn:disabled{color:#888;cursor:not-allowed}' +
      '.bmg3-bit{width:26px;height:30px;display:inline-flex;align-items:center;justify-content:center;font-family:ui-monospace,monospace;font-size:1.05rem;font-weight:800;background:#8b8b8b;border:2px solid;border-color:#373737 #fff #fff #373737;cursor:pointer;color:#2a2a2a;margin:0 1px;box-sizing:border-box}' +
      '.bmg3-bit.on{background:#f4d03f;color:#1a1a1a}' +
      '.bmg3-canvas{position:relative;width:100%;height:100%;border:3px solid;border-color:#373737 #fff #fff #373737;background:#8fb7de;overflow:hidden;touch-action:none;box-sizing:border-box}' +
      '.bmg3-canvas canvas{display:block;width:100%;height:100%}' +
      '.bmg3-inv-overlay{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.34);z-index:6;padding:18px;box-sizing:border-box}' +
      '.bmg3-inv-overlay.open{display:flex}' +
      '.bmg3-inventory-panel{width:min(760px,calc(100% - 18px));max-height:calc(100% - 18px);overflow:auto;box-sizing:border-box}' +
      '.bmg3-pause-overlay{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,13,22,0.62);z-index:8;padding:18px;box-sizing:border-box;pointer-events:auto}' +
      '.bmg3-pause-overlay.open{display:flex}' +
      '.bmg3-pause-card{width:min(390px,calc(100% - 18px));max-height:calc(100% - 18px);overflow:auto;box-sizing:border-box}' +
      '.bmg3-pause-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.bmg3-pause-grid .bmg3-btn{padding:9px 10px;font-size:0.82rem;text-align:left}' +
      '.bmg3-pause-grid .wide{grid-column:1/-1;text-align:center}' +
      '.bmg3-pause-selected{background:#bdbdbd;border:2px solid;border-color:#fff #8c8c8c #8c8c8c #fff;padding:8px;margin:8px 0 10px;font-size:0.78rem;color:#333}' +
      '.bmg3-fullscreen-btn{position:absolute;right:10px;bottom:10px;z-index:9;width:34px;height:34px;padding:0;font-size:1.05rem;line-height:1}' +
      '.bmg3-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#123;font-weight:700;font-size:0.9rem;text-align:center;padding:16px}' +
      '.bmg3-cross{position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;pointer-events:none;z-index:3}' +
      '.bmg3-cross:before,.bmg3-cross:after{content:"";position:absolute;background:rgba(255,255,255,0.9);box-shadow:0 0 2px rgba(0,0,0,0.8)}' +
      '.bmg3-cross:before{left:9px;top:0;width:2px;height:20px}' +
      '.bmg3-cross:after{top:9px;left:0;height:2px;width:20px}' +
      '.bmg3-lockmsg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;color:#fff;background:rgba(10,20,35,0.5);font-weight:800;font-size:1.05rem;cursor:pointer;z-index:4;padding:16px}' +
      '.bmg3-tutorial{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:min(470px,calc(100% - 16px));max-height:calc(100% - 20px);overflow:auto;background:rgba(14,22,36,0.95);border:2px solid #ffd34d;border-radius:10px;padding:10px 12px;color:#eef2f7;z-index:12;display:none;box-shadow:0 10px 30px rgba(0,0,0,0.55)}' +
      '.bmg3-tutorial.open{display:block}' +
      '.bmg3-tut-tile{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;background:#8b8b8b;border:2px solid;border-color:#373737 #fff #fff #373737;font-weight:800;color:#0a0f1a;font-size:0.72rem;box-sizing:border-box}' +
      '.bmg3-tut-glow{outline:3px solid #ffd34d !important;outline-offset:1px;animation:bmg3pulse 1.05s ease-in-out infinite;z-index:2}' +
      '@keyframes bmg3pulse{0%,100%{box-shadow:0 0 0 2px rgba(255,211,77,0.35),0 0 9px rgba(255,211,77,0.5)}50%{box-shadow:0 0 0 5px rgba(255,211,77,0.7),0 0 20px rgba(255,211,77,0.95)}}' +
      '.bmg3-gamebox.bmg3-tut .bmg3-inv-overlay{align-items:flex-end}' +
      '.bmg3-gamebox.bmg3-tut .bmg3-inventory-panel{max-height:calc(100% - 118px)}';
    document.head.appendChild(s);
  }

  function itemHTML(v, count, drag) {
    return '<div class="bmg3-item"' + (drag ? ' draggable="true"' : '') + ' data-val="' + v + '" ' +
      'data-sel="' + esc(selectorText(v)) + '" ' +
      'title="' + esc(elementName(v)) + ' — ' + binStr(v) + '" style="background:' + elementColor(v) + '">' +
      '<span class="bmg3-sym">' + esc(elementSymbol(v)) + '</span>' +
      ((count && count > 1) ? '<span class="bmg3-count">' + count + '</span>' : '') +
    '</div>';
  }
  function pickIconHTML(power, drag) {
    var info = pickInfoFromPower(power);
    if (!info) return '';
    return '<div class="bmg3-item"' + (drag ? ' draggable="true"' : '') + ' data-pick="' + power + '" data-sel="' + esc(pickSel(power)) + '" title="' + esc(info.name) + ' - power ' + power + '">' +
      '<span style="position:absolute;width:8px;height:28px;left:17px;top:9px;background:' + info.handle + ';border:1px solid rgba(0,0,0,0.35);transform:rotate(38deg);transform-origin:center"></span>' +
      '<span style="position:absolute;width:28px;height:8px;left:8px;top:11px;background:' + info.head + ';border:1px solid rgba(0,0,0,0.35)"></span>' +
      '<span class="bmg3-sym" style="font-size:10px;position:absolute;right:2px;bottom:0;color:#111">' + power + '</span>' +
    '</div>';
  }
  // Terrain block shown in the inventory just like an element item (build-only:
  // not draggable into the craft slots).
  function genericItemHTML(type, count, drag) {
    var meta = GENERIC[type];
    return '<div class="bmg3-item"' + (drag ? ' draggable="true"' : '') + ' data-block="' + type + '" data-sel="' + esc(type) + '" ' +
      'title="' + esc(meta.name) + ' — build block" style="background:' + meta.color + '">' +
      '<span class="bmg3-sym" style="font-size:11px">' + esc(meta.sym) + '</span>' +
      ((count && count > 1) ? '<span class="bmg3-count">' + count + '</span>' : '') +
    '</div>';
  }

  // Fill / clear the two crafting ingredient slots.
  function slotClick(which) {
    var cur = (which === 'A') ? g.slotA : g.slotB;
    if (cur) { if (which === 'A') g.slotA = null; else g.slotB = null; }
    else if (typeof g.selected === 'number' && have(g.selected)) { if (which === 'A') g.slotA = g.selected; else g.slotB = g.selected; }
    g.craftGuess = null; g.craftCarry = null; renderCraft();
    if ((which === 'A' ? g.slotA : g.slotB) != null) tutorialNotify(which === 'A' ? 'slotA' : 'slotB');
  }
  function slotDrop(which, val) {
    if (val == null || !have(val)) return;
    if (which === 'A') g.slotA = val; else g.slotB = val;
    g.craftGuess = null; g.craftCarry = null; renderCraft();
    tutorialNotify(which === 'A' ? 'slotA' : 'slotB');
  }

  // ── Three.js scene (first-person) ──────────────────────────────
  var THREE = null, PointerLockControls = null;
  var renderer = null, scene = null, camera = null, controls = null, worldGroup = null;
  var raycaster = null, matCache = {};
  var canvasWrap = null, resizeObs = null;
  var threeLoad = null;
  var heldPickGroup = null, heldPickSel = null;
  var heldPickSwingStart = 0;
  var HELD_PICK_BASE = { x: 0.68, y: -0.66, z: -0.92, rx: 0.88, ry: 5.22, rz: -0.32 };
  var HELD_PICK_SWING_MS = 260;
  var HELD_PICK_TUNE_STEP = 0.08;

  // First-person player: ~1.8 blocks tall, ~0.75 wide, eye near the top of the
  // space it occupies. Position is the FEET (bottom-centre); the camera sits at
  // feet + EYE each frame.
  var PLAYER_H = 1.8, PLAYER_HW = 0.375, EYE = 1.7;
  var GRAVITY = -26, JUMP_SPEED = 8.0, MOVE_SPEED = 4.6;
  var player = null;          // { x, y, z, vy, onGround }
  var keys = null;            // { f, b, l, r, jump }
  var clockLast = 0;
  var worldRenderKey = '';
  var worldDirty = false;
  var statsLast = 0;
  var inputHandlers = null;   // document-level listeners, removed on teardown

  function loadThree() {
    if (threeLoad) return threeLoad;
    // Dynamic imports resolve through the page's <script type="importmap">.
    threeLoad = Promise.all([
      import('three'),
      import('three/addons/controls/PointerLockControls.js')
    ]).then(function (mods) {
      return { THREE: mods[0], PointerLockControls: mods[1].PointerLockControls };
    });
    return threeLoad;
  }

  function symbolCanvas(v) {
    var c = document.createElement('canvas'); c.width = c.height = 96;
    var ctx = c.getContext('2d');
    ctx.fillStyle = elementColor(v); ctx.fillRect(0, 0, 96, 96);
    ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 7; ctx.strokeRect(3.5, 3.5, 89, 89);
    ctx.fillStyle = '#0a0f1a';
    ctx.font = 'bold 42px system-ui,-apple-system,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(elementSymbol(v), 48, 52);
    return c;
  }
  // Plain terrain block: base colour + deterministic speckle (no symbol).
  function genericCanvas(type) {
    var meta = GENERIC[type] || GENERIC.dirt;
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var ctx = c.getContext('2d');
    ctx.fillStyle = meta.color; ctx.fillRect(0, 0, 64, 64);
    for (var i = 0; i < 90; i++) {
      var h = hash32((i + 1) * 2654435761 + type.charCodeAt(0) * 40503);
      var x = h % 64, y = (h >> 6) % 64, s = 2 + ((h >> 12) % 3);
      var dark = ((h >> 14) & 1) === 0;
      ctx.fillStyle = dark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.09)';
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, 61, 61);
    return c;
  }
  // Procedural/high-value ore is rendered by bit-length, not exact value. The
  // mined value is still deterministic per cell; grouping keeps deep layers fast.
  function oreCanvas(id) {
    var b = Math.max(1, Math.min(64, parseInt(String(id).slice(4), 10) || 1));
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var hue = (b * 43 + 190) % 360;
    ctx.fillStyle = 'hsl(' + hue + ',58%,50%)';
    ctx.fillRect(0, 0, 64, 64);
    for (var i = 0; i < 48; i++) {
      var h = hash32((i + 17) * 1103515245 + b * 977);
      var x = h % 64, y = (h >> 6) % 64, s = 2 + ((h >> 12) % 4);
      ctx.fillStyle = ((h >> 15) & 1) ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)';
      ctx.fillRect(x, y, s, s);
    }
    ctx.fillStyle = 'rgba(8,12,20,0.82)';
    ctx.fillRect(10, 19, 44, 26);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px system-ui,-apple-system,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b + 'b', 32, 33);
    ctx.strokeStyle = 'rgba(0,0,0,0.24)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, 61, 61);
    return c;
  }
  // Material for any block id: an element value (number) or a generic type string.
  function materialForId(id) {
    if (matCache[id]) return matCache[id];
    var tex = new THREE.CanvasTexture(isGeneric(id) ? genericCanvas(id) : (isOreRenderId(id) ? oreCanvas(id) : symbolCanvas(+id)));
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.anisotropy = 4;
    var m = new THREE.MeshLambertMaterial({ map: tex });
    matCache[id] = m;
    return m;
  }

  function makeHeldPickaxe(info) {
    var group = new THREE.Group();
    var model = new THREE.Group();
    model.rotation.z = Math.PI / 2;
    model.position.set(-0.05, -0.04, 0);
    group.add(model);
    resetHeldPickPose(group);
    var u = 0.105;
    var handleMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(info.handle) });
    var headMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(info.head) });
    function cube(mat, x, y, z, sx, sy, sz) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(sx || u, sy || u, sz || (u * 1.15)), mat);
      mesh.position.set(x, y, z);
      model.add(mesh);
    }
    for (var i = 0; i < 8; i++) cube(handleMat, 0, i * u * 0.72, 0, u * 0.92, u * 0.92, u * 1.1);
    for (var h = -3; h <= 3; h++) cube(headMat, h * u * 0.86, 7 * u * 0.72, 0, u, u, u * 1.2);
    cube(headMat, -3 * u * 0.86, 6 * u * 0.72, 0, u, u, u * 1.2);
    cube(headMat, -4 * u * 0.86, 5 * u * 0.72, 0, u, u, u * 1.2);
    cube(headMat, 3 * u * 0.86, 6 * u * 0.72, 0, u, u, u * 1.2);
    cube(headMat, 4 * u * 0.86, 5 * u * 0.72, 0, u, u, u * 1.2);
    return group;
  }
  function resetHeldPickPose(group) {
    if (!group) return;
    group.position.set(HELD_PICK_BASE.x, HELD_PICK_BASE.y, HELD_PICK_BASE.z);
    group.rotation.set(HELD_PICK_BASE.rx, HELD_PICK_BASE.ry, HELD_PICK_BASE.rz);
  }
  function logHeldPickPose() {
    if (!window.console) return;
    console.log(
      '[Binary Mine 3D pickaxe pose] var HELD_PICK_BASE = { x: ' +
      HELD_PICK_BASE.x.toFixed(2) + ', y: ' +
      HELD_PICK_BASE.y.toFixed(2) + ', z: ' +
      HELD_PICK_BASE.z.toFixed(2) + ', rx: ' +
      HELD_PICK_BASE.rx.toFixed(2) + ', ry: ' +
      HELD_PICK_BASE.ry.toFixed(2) + ', rz: ' +
      HELD_PICK_BASE.rz.toFixed(2) + ' };'
    );
  }
  function tuneHeldPickRotation(axis, dir) {
    var key = 'r' + axis;
    if (HELD_PICK_BASE[key] == null) return;
    HELD_PICK_BASE[key] = Math.round((HELD_PICK_BASE[key] + dir * HELD_PICK_TUNE_STEP) * 100) / 100;
    heldPickSwingStart = 0;
    updateHeldPickaxe();
    resetHeldPickPose(heldPickGroup);
    logHeldPickPose();
  }
  function triggerHeldPickSwing() {
    updateHeldPickaxe();
    if (!heldPickGroup) return;
    heldPickSwingStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }
  function animateHeldPickaxe(now) {
    if (!heldPickGroup || !heldPickSwingStart) return;
    var t = (now - heldPickSwingStart) / HELD_PICK_SWING_MS;
    if (t >= 1) {
      heldPickSwingStart = 0;
      resetHeldPickPose(heldPickGroup);
      return;
    }
    t = Math.max(0, t);
    var arc = Math.sin(t * Math.PI);
    var impact = (t > 0.38 && t < 0.58) ? Math.sin(((t - 0.38) / 0.20) * Math.PI) : 0;
    heldPickGroup.position.set(
      HELD_PICK_BASE.x + 0.05 * arc,
      HELD_PICK_BASE.y - 0.08 * arc,
      HELD_PICK_BASE.z - 0.11 * arc - 0.035 * impact
    );
    heldPickGroup.rotation.set(
      HELD_PICK_BASE.rx - 1.05 * arc - 0.18 * impact,
      HELD_PICK_BASE.ry + 0.16 * arc,
      HELD_PICK_BASE.rz - 0.55 * arc
    );
  }
  function disposeHeldPickaxe(obj) {
    if (!obj) return;
    obj.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  function updateHeldPickaxe() {
    if (!THREE || !camera) return;
    var sel = (isPickSel(g.selected) && haveSel(g.selected)) ? g.selected : null;
    if (sameSel(sel, heldPickSel)) return;
    if (heldPickGroup) {
      camera.remove(heldPickGroup);
      disposeHeldPickaxe(heldPickGroup);
      heldPickGroup = null;
    }
    heldPickSel = sel;
    heldPickSwingStart = 0;
    if (!sel) return;
    var info = pickInfoFromPower(selPower(sel));
    if (!info) return;
    heldPickGroup = makeHeldPickaxe(info);
    camera.add(heldPickGroup);
  }

  function initScene() {
    // Tear down any previous instance (re-mount / re-entry into the lesson).
    teardownInput();
    if (controls) { try { controls.dispose && controls.dispose(); } catch (e) {} controls = null; }
    if (renderer) {
      try { renderer.setAnimationLoop(null); renderer.dispose(); if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); } catch (e) {}
    }
    if (resizeObs) { try { resizeObs.disconnect(); } catch (e) {} resizeObs = null; }
    matCache = {};
    heldPickGroup = null;
    heldPickSel = null;
    heldPickSwingStart = 0;

    canvasWrap = G('bmg3-canvas');
    canvasWrap.innerHTML = '';
    var w = canvasWrap.clientWidth || 480, h = canvasWrap.clientHeight || 480;

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#8fb7de');
    scene.fog = new THREE.Fog(0x8fb7de, 24, 60);

    camera = new THREE.PerspectiveCamera(72, w / h, 0.05, 2000);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    canvasWrap.appendChild(renderer.domElement);

    // Crosshair + "click to play" overlay.
    var cross = document.createElement('div'); cross.className = 'bmg3-cross'; canvasWrap.appendChild(cross);
    var lockmsg = document.createElement('div'); lockmsg.className = 'bmg3-lockmsg'; lockmsg.id = 'bmg3-lockmsg';
    lockmsg.innerHTML = 'Click to play' +
      '<span style="font-weight:600;font-size:0.76rem;max-width:390px">Move <b>W A S D</b> &middot; Look <b>mouse</b> &middot; Inventory <b>E</b> &middot; Hotbar <b>1-8</b>/scroll &middot; Jump <b>Space</b> &middot; Mine <b>click</b> &middot; Build <b>right-click</b> &middot; Release <b>Esc</b></span>';
    canvasWrap.appendChild(lockmsg);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5a68, 1.05));
    var dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(10, 24, 8);
    scene.add(dir);

    worldGroup = new THREE.Group();
    scene.add(worldGroup);

    raycaster = new THREE.Raycaster();

    controls = new PointerLockControls(camera, renderer.domElement);
    updateHeldPickaxe();

    // Spawn the player standing on the deterministic surface at world origin.
    player = { x: 0, y: 0, z: 0, vy: 0, onGround: false };
    player.y = surfaceTop(player.x, player.z);
    camera.position.set(player.x, player.y + EYE, player.z);
    keys = { f: false, b: false, l: false, r: false, jump: false };

    setupInput(lockmsg);

    resizeObs = new ResizeObserver(resize);
    resizeObs.observe(canvasWrap);

    clockLast = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    renderer.setAnimationLoop(function () {
      if (!canvasWrap || !canvasWrap.isConnected) {  // lesson navigated away
        try { renderer.setAnimationLoop(null); teardownInput(); renderer.dispose(); } catch (e) {}
        return;
      }
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var dt = Math.min(0.05, (now - clockLast) / 1000);
      clockLast = now;
      updatePlayer(dt);
      maybeRebuildWorldAroundPlayer();
      if (now - statsLast > 700) { statsLast = now; renderStats(); }
      animateHeldPickaxe(now);
      renderer.render(scene, camera);
    });
  }

  // Highest solid surface (incl. bedrock) in the column under (px,pz).
  function surfaceTop(px, pz) {
    var ix = Math.round(px), iz = Math.round(pz);
    var surf = surfaceHeight(ix, iz);
    for (var iy = surf + 8; iy >= surf - RENDER_DEPTH; iy--) {
      if (solidAtXYZ(ix, iy, iz)) return iy + 0.5;
    }
    return surf + 0.5;
  }
  function respawnPlayer() {
    if (!player) return;
    player.x = 0; player.z = 0; player.vy = 0;
    player.y = surfaceTop(player.x, player.z);
    if (camera) camera.position.set(player.x, player.y + EYE, player.z);
  }

  // ── Player physics (AABB vs voxels) ────────────────────────────
  function solidForPlayer(ix, iy, iz) { return solidAtXYZ(ix, iy, iz); }
  function playerCollides(px, py, pz) {
    var HW = PLAYER_HW;
    var ix0 = Math.floor(px - HW + 0.5), ix1 = Math.floor(px + HW + 0.5);
    var iz0 = Math.floor(pz - HW + 0.5), iz1 = Math.floor(pz + HW + 0.5);
    var iy0 = Math.floor(py + 0.5), iy1 = Math.floor(py + PLAYER_H - 0.001 + 0.5);
    for (var ix = ix0; ix <= ix1; ix++)
      for (var iy = iy0; iy <= iy1; iy++)
        for (var iz = iz0; iz <= iz1; iz++)
          if (solidForPlayer(ix, iy, iz)) return true;
    return false;
  }
  // Top surface the feet should rest on, among the footprint columns.
  function supportTop(px, pz, feetY) {
    var HW = PLAYER_HW;
    var ix0 = Math.floor(px - HW + 0.5), ix1 = Math.floor(px + HW + 0.5);
    var iz0 = Math.floor(pz - HW + 0.5), iz1 = Math.floor(pz + HW + 0.5);
    var start = Math.round(feetY), top = -Infinity;
    for (var ix = ix0; ix <= ix1; ix++)
      for (var iz = iz0; iz <= iz1; iz++)
        for (var iy = start; iy >= start - 4; iy--)
          if (solidAtXYZ(ix, iy, iz)) { if (iy + 0.5 > top) top = iy + 0.5; break; }
    return (top === -Infinity) ? feetY : top;
  }
  function updatePlayer(dt) {
    if (!player) return;
    // Sub-step so a fast fall can never tunnel through the 1-block surface.
    var reach = (Math.abs(player.vy) + MOVE_SPEED) * dt;
    var steps = Math.max(1, Math.min(6, Math.ceil(reach / 0.4)));
    var sdt = dt / steps;
    for (var i = 0; i < steps; i++) stepPhysics(sdt);
    camera.position.set(player.x, player.y + EYE, player.z);
  }
  function stepPhysics(dt) {
    if (controls && controls.isLocked) {
      var d = new THREE.Vector3();
      camera.getWorldDirection(d); d.y = 0;
      if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
      d.normalize();
      var rx = -d.z, rz = d.x;  // right vector (horizontal)
      var f = (keys.f ? 1 : 0) - (keys.b ? 1 : 0);
      var s = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
      var mx = d.x * f + rx * s, mz = d.z * f + rz * s;
      var len = Math.hypot(mx, mz);
      if (len > 0) {
        mx = mx / len * MOVE_SPEED * dt; mz = mz / len * MOVE_SPEED * dt;
        if (!playerCollides(player.x + mx, player.y, player.z)) player.x += mx;
        if (!playerCollides(player.x, player.y, player.z + mz)) player.z += mz;
      }
      if (keys.jump && player.onGround) { player.vy = JUMP_SPEED; player.onGround = false; }
    }
    // Gravity + vertical resolution (always, so the player settles on terrain).
    player.vy += GRAVITY * dt;
    if (player.vy < -40) player.vy = -40;
    var ny = player.y + player.vy * dt;
    if (player.vy <= 0) {
      if (playerCollides(player.x, ny, player.z)) {
        player.y = supportTop(player.x, player.z, player.y);
        player.vy = 0; player.onGround = true;
      } else { player.y = ny; player.onGround = false; }
    } else {
      if (playerCollides(player.x, ny, player.z)) player.vy = 0;  // bonk head
      else { player.y = ny; player.onGround = false; }
    }
  }

  // ── First-person input + reach ─────────────────────────────────
  function setLockOverlay(show) {
    if (show && (isInventoryOpen() || isPauseOpen() || activeTut)) show = false;
    var msg = G('bmg3-lockmsg'); if (!msg) return;
    if (msg) msg.style.display = show ? 'flex' : 'none';
  }
  function resetMovementKeys() {
    if (keys) keys.f = keys.b = keys.l = keys.r = keys.jump = false;
  }
  function isInventoryOpen() {
    var el = G('bmg3-inv-overlay');
    return !!(el && el.classList.contains('open'));
  }
  function setInventoryOpen(open, relock) {
    var el = G('bmg3-inv-overlay'); if (!el) return;
    if (open && isPauseOpen()) setPauseOpen(false, false);
    el.classList.toggle('open', !!open);
    if (open) {
      resetMovementKeys();
      renderInv(); renderCraft(); renderSelected();
      if (controls && controls.isLocked) {
        try { controls.unlock(); } catch (e) {}
      }
    } else if (relock && controls && !controls.isLocked) {
      try { controls.lock(); } catch (e) {}
    }
    tutorialNotify(open ? 'inv-open' : 'inv-close');
  }
  function toggleInventory() {
    if (G('bmg3-shop') || G('bmg3-journal') || G('bmg3-drive') || G('bmg3-gameover')) return;
    if (isPauseOpen()) { setPauseOpen(false, false); setInventoryOpen(true, false); return; }
    setInventoryOpen(!isInventoryOpen(), true);
  }
  function isPauseOpen() {
    var el = G('bmg3-pause-overlay');
    return !!(el && el.classList.contains('open'));
  }
  function selectedSaleInfo() {
    var v = g && typeof g.selected === 'number' && have(g.selected) ? g.selected : null;
    return v == null ? null : { value: v, name: elementName(v), bits: binStr(v), count: g.inv[v] || 0 };
  }
  function renderPauseMenu() {
    var card = G('bmg3-pause-card'); if (!card) return;
    var sale = selectedSaleInfo();
    var selected = sale
      ? '<b>' + esc(sale.name) + '</b><span style="color:#555;margin-left:6px">' + esc(sale.bits) + ' x' + sale.count + '</span>'
      : '<span style="color:#555">Select an element on the hotbar or in the inventory to sell it.</span>';
    card.innerHTML =
      '<div class="bmg3-h" style="margin-bottom:4px">Game Menu</div>' +
      '<div class="bmg3-pause-selected">' + selected + '</div>' +
      '<div class="bmg3-pause-grid">' +
        '<button class="bmg3-btn wide" data-pause-act="resume">Resume</button>' +
        '<button class="bmg3-btn" data-pause-act="inventory">Inventory / Crafting</button>' +
        '<button class="bmg3-btn" data-pause-act="sell" ' + (sale ? '' : 'disabled') + '>' + (sale ? ('Sell selected +' + sale.value) : 'Sell selected') + '</button>' +
        '<button class="bmg3-btn" data-pause-act="shop">Shop / Buy back</button>' +
        '<button class="bmg3-btn" data-pause-act="journal">Journal</button>' +
        '<button class="bmg3-btn" data-pause-act="save">Save</button>' +
        '<button class="bmg3-btn" data-pause-act="load">Load</button>' +
        '<button class="bmg3-btn wide" data-pause-act="reset" style="color:#7a3a3a">Reset mine</button>' +
      '</div>';
    Array.prototype.forEach.call(card.querySelectorAll('[data-pause-act]'), function (btn) {
      btn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); runPauseAction(btn.dataset.pauseAct); };
    });
  }
  function setPauseOpen(open, relock) {
    var el = G('bmg3-pause-overlay'); if (!el) return;
    el.classList.toggle('open', !!open);
    if (open) {
      resetMovementKeys();
      setInventoryOpen(false, false);
      renderPauseMenu();
      if (controls && controls.isLocked) {
        try { controls.unlock(); } catch (e) {}
      } else {
        setLockOverlay(false);
      }
    } else if (relock && controls && !controls.isLocked) {
      try { controls.lock(); } catch (e) {}
    }
  }
  function togglePauseMenu() {
    if (G('bmg3-shop') || G('bmg3-journal') || G('bmg3-drive') || G('bmg3-gameover')) return;
    if (activeTut) return;
    setPauseOpen(!isPauseOpen(), true);
  }
  function runPauseAction(act) {
    if (act === 'resume') { setPauseOpen(false, true); return; }
    if (act === 'inventory') { setPauseOpen(false, false); setInventoryOpen(true, false); return; }
    if (act === 'sell') {
      if (selectedSaleInfo()) sellSelected();
      renderPauseMenu();
      return;
    }
    if (act === 'shop') { setPauseOpen(false, false); openShop(); return; }
    if (act === 'journal') { setPauseOpen(false, false); openJournal(); return; }
    if (act === 'save') { setPauseOpen(false, false); driveSaveOrLoad('save'); return; }
    if (act === 'load') { setPauseOpen(false, false); driveSaveOrLoad('load'); return; }
    if (act === 'reset') {
      if (!confirm('Reset your mine, inventory and money? This cannot be undone.')) return;
      setPauseOpen(false, false);
      doReset();
    }
  }
  function updateFullscreenKeyboardLock() {
    var kb = navigator.keyboard;
    if (!kb) return;
    var inGameFullscreen = document.fullscreenElement === G('bmg3-gamebox');
    if (inGameFullscreen && kb.lock) {
      try {
        var locked = kb.lock(['Escape']);
        if (locked && locked.catch) locked.catch(function () {});
      } catch (e) {}
    } else if (!inGameFullscreen && kb.unlock) {
      try { kb.unlock(); } catch (e) {}
    }
  }
  function toggleGameFullscreen() {
    var target = G('bmg3-gamebox'); if (!target) return;
    try {
      if (document.fullscreenElement === target) {
        var exit = document.exitFullscreen && document.exitFullscreen();
        if (exit && exit.then) exit.then(updateFullscreenKeyboardLock).catch(function () {});
      } else if (target.requestFullscreen) {
        var enter = target.requestFullscreen();
        if (enter && enter.then) enter.then(updateFullscreenKeyboardLock).catch(function () {});
      }
    } catch (e) {}
    setTimeout(resize, 80);
  }
  function setupInput(lockmsg) {
    var dom = renderer.domElement;
    function resetKeys() { resetMovementKeys(); }
    function key(down) {
      return function (e) {
        if (down && e.code === 'Escape' && !e.repeat) {
          if (G('bmg3-shop') || G('bmg3-journal') || G('bmg3-drive') || G('bmg3-gameover')) return;
          if (activeTut) {
            if (isInventoryOpen()) setInventoryOpen(false, false);
            else endTutorial(true);
          } else if (isInventoryOpen()) setInventoryOpen(false, true);
          else togglePauseMenu();
          e.preventDefault();
          return;
        }
        if (down && !e.repeat && (e.code === 'KeyP' || e.code === 'KeyM')) {
          if (G('bmg3-shop') || G('bmg3-journal') || G('bmg3-drive') || G('bmg3-gameover')) return;
          if (activeTut) { e.preventDefault(); return; }
          if (isInventoryOpen()) setInventoryOpen(false, true);
          else togglePauseMenu();
          e.preventDefault();
          return;
        }
        if (down && e.code === 'KeyE' && !e.repeat) {
          if (isPauseOpen()) { setPauseOpen(false, false); setInventoryOpen(true, false); }
          else toggleInventory();
          e.preventDefault();
          return;
        }
        if (isPauseOpen()) {
          resetMovementKeys();
          if (down) e.preventDefault();
          return;
        }
        if (isInventoryOpen()) {
          resetMovementKeys();
          if (down) e.preventDefault();
          return;
        }
        if (down && controls && controls.isLocked) {
          var hotkey = null;
          if (/^Digit[1-8]$/.test(e.code)) hotkey = +e.code.slice(5) - 1;
          else if (/^Numpad[1-8]$/.test(e.code)) hotkey = +e.code.slice(6) - 1;
          if (hotkey != null) {
            selectHotbar(hotkey);
            e.preventDefault();
            return;
          }
          if (e.code === 'KeyX' || e.code === 'KeyY' || e.code === 'KeyZ') {
            tuneHeldPickRotation(e.code.charAt(3).toLowerCase(), e.shiftKey ? -1 : 1);
            e.preventDefault();
            return;
          }
        }
        switch (e.code) {
          case 'KeyW': case 'ArrowUp':    keys.f = down; break;
          case 'KeyS': case 'ArrowDown':  keys.b = down; break;
          case 'KeyA': case 'ArrowLeft':  keys.l = down; break;
          case 'KeyD': case 'ArrowRight': keys.r = down; break;
          case 'Space': keys.jump = down; if (controls && controls.isLocked) e.preventDefault(); break;
          default: return;
        }
      };
    }
    var kd = key(true), ku = key(false);
    function tryLock() { if (controls && !controls.isLocked) { try { controls.lock(); } catch (e) {} } }
    function onMouseDown(e) {
      if (!controls) return;
      if (activeTut) return;      // tutorial owns the cursor; interact via its card / inventory
      if (isPauseOpen()) return;
      if (isInventoryOpen()) return;
      if (!controls.isLocked) { tryLock(); return; }  // re-acquire control by clicking the world
      if (e.button === 0) { triggerHeldPickSwing(); fpsAction('mine'); }
      else if (e.button === 2) fpsAction('place');
    }
    function onContext(e) { e.preventDefault(); }
    function onDoubleClick(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    function onWheel(e) {
      if (!(controls && controls.isLocked)) return;
      e.preventDefault();
      var delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      selectHotbar(g.hotbarIndex + (delta > 0 ? 1 : -1));
    }
    // NB: three r160 dispatches 'lock'/'unlock' BEFORE it updates controls.isLocked,
    // so we drive the overlay from the event type itself, never from isLocked.
    function onLock() { resetKeys(); setLockOverlay(false); }
    function onUnlock() {
      resetKeys();
      if (activeTut) { setLockOverlay(false); return; }
      if (!isPauseOpen() && !isInventoryOpen() && !G('bmg3-shop') && !G('bmg3-journal') && !G('bmg3-drive') && !G('bmg3-gameover')) {
        setPauseOpen(true, false);
        return;
      }
      setLockOverlay(!(isPauseOpen() || isInventoryOpen()));
    }
    function onPlayClick() { tryLock(); }

    document.addEventListener('keydown', kd);
    document.addEventListener('keyup', ku);
    dom.addEventListener('mousedown', onMouseDown);
    dom.addEventListener('contextmenu', onContext);
    dom.addEventListener('dblclick', onDoubleClick, true);
    if (canvasWrap) canvasWrap.addEventListener('dblclick', onDoubleClick, true);
    dom.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('wheel', onWheel, { passive: false });
    if (lockmsg) lockmsg.addEventListener('click', onPlayClick);
    if (controls.addEventListener) { controls.addEventListener('lock', onLock); controls.addEventListener('unlock', onUnlock); }

    inputHandlers = {
      kd: kd, ku: ku, dom: dom, onMouseDown: onMouseDown, onContext: onContext,
      onDoubleClick: onDoubleClick, onWheel: onWheel, lockmsg: lockmsg, onPlayClick: onPlayClick,
      onLock: onLock, onUnlock: onUnlock
    };
    setLockOverlay(true);  // start unlocked → overlay visible
  }
  function teardownInput() {
    if (!inputHandlers) return;
    try {
      document.removeEventListener('keydown', inputHandlers.kd);
      document.removeEventListener('keyup', inputHandlers.ku);
      if (inputHandlers.dom) {
        inputHandlers.dom.removeEventListener('mousedown', inputHandlers.onMouseDown);
        inputHandlers.dom.removeEventListener('contextmenu', inputHandlers.onContext);
        inputHandlers.dom.removeEventListener('dblclick', inputHandlers.onDoubleClick, true);
        inputHandlers.dom.removeEventListener('wheel', inputHandlers.onWheel);
      }
      if (canvasWrap) canvasWrap.removeEventListener('dblclick', inputHandlers.onDoubleClick, true);
      document.removeEventListener('wheel', inputHandlers.onWheel);
      if (inputHandlers.lockmsg) inputHandlers.lockmsg.removeEventListener('click', inputHandlers.onPlayClick);
      if (controls && controls.removeEventListener) {
        controls.removeEventListener('lock', inputHandlers.onLock);
        controls.removeEventListener('unlock', inputHandlers.onUnlock);
      }
    } catch (e) {}
    inputHandlers = null;
    if (keys) keys.f = keys.b = keys.l = keys.r = keys.jump = false;
  }
  function cellOverlapsPlayer(key) {
    if (!player) return false;
    var w = parseKey(key), HW = PLAYER_HW;
    return (w.x + 0.5 > player.x - HW && w.x - 0.5 < player.x + HW &&
            w.z + 0.5 > player.z - HW && w.z - 0.5 < player.z + HW &&
            w.y + 0.5 > player.y && w.y - 0.5 < player.y + PLAYER_H);
  }
  // Mine/build the block under the crosshair (screen centre), within reach.
  function fpsAction(kind) {
    if (!raycaster || !worldGroup) return;
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = 6;
    var hits = raycaster.intersectObjects(worldGroup.children, false);
    if (!hits.length) return;
    var h = hits[0];
    if (h.distance > 5.5) return;
    var cells = h.object.userData && (h.object.userData.faceCells || h.object.userData.cells);
    if (!cells) return;
    var hitIndex = (h.instanceId != null) ? h.instanceId : Math.floor((h.faceIndex || 0) / 2);
    var info = cells[hitIndex];
    if (!info) return;
    if (kind === 'mine') {
      if (g.placed[info.key] != null) pickUp(info.key);
      else mineNatural(info.key);
    } else {
      var w = parseKey(info.key);
      var n = h.face ? h.face.normal : { x: 0, y: 1, z: 0 };  // local == world (no rotation)
      var nk = (w.x + Math.round(n.x)) + ',' + (w.y + Math.round(n.y)) + ',' + (w.z + Math.round(n.z));
      if (cellOverlapsPlayer(nk)) { toast('Too close to build there', '#a32a2a'); return; }
      placeAt(nk);
    }
  }

  function resize() {
    if (!renderer || !canvasWrap) return;
    var w = canvasWrap.clientWidth || 480, h = canvasWrap.clientHeight || 440;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function renderKeyForPlayer() {
    if (!player) return '0,0,0';
    return Math.floor(player.x / REBUILD_STEP_XZ) + ',' + Math.floor(player.z / REBUILD_STEP_XZ) + ',' + Math.floor(player.y / REBUILD_STEP_Y);
  }
  function maybeRebuildWorldAroundPlayer() {
    if (!player || !worldGroup) return;
    var key = renderKeyForPlayer();
    if (!worldDirty && key === worldRenderKey) return;
    rebuildWorld();
  }
  function requestWorldRebuild() {
    worldDirty = true;
  }
  function naturalScanBand(x, z, py) {
    var surf = surfaceHeight(x, z);
    if (py < surf - 8) {
      return {
        top: Math.min(surf, py + 10),
        bottom: py - RENDER_DEPTH
      };
    }
    return { top: surf, bottom: surf - RENDER_DEPTH };
  }

  function addCellFaces(groups, id, key, x, y, z, mask) {
    var list = groups[id] || (groups[id] = []);
    for (var i = 0; i < FACE_DEFS.length; i++) {
      if (mask & (1 << i)) list.push({ key: key, x: x, y: y, z: z, face: i });
    }
  }
  function buildFaceMesh(id, faces) {
    var positions = [], normals = [], uvs = [], indices = [], faceCells = [];
    var uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (var i = 0; i < faces.length; i++) {
      var rec = faces[i], def = FACE_DEFS[rec.face];
      var base = positions.length / 3;
      for (var c = 0; c < 4; c++) {
        var p = def.c[c];
        positions.push(rec.x + p[0], rec.y + p[1], rec.z + p[2]);
        normals.push(def.n[0], def.n[1], def.n[2]);
        uvs.push(uv[c][0], uv[c][1]);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      faceCells.push({ key: rec.key, x: rec.x, y: rec.y, z: rec.z, face: rec.face });
    }
    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    var mesh = new THREE.Mesh(geom, materialForId(id));
    mesh.userData.faceCells = faceCells;
    mesh.userData.cells = faceCells; // compatibility with older hit handling
    return mesh;
  }

  function rebuildWorld() {
    if (!scene || !worldGroup) { worldDirty = true; return; }
    // Remove and dispose the previous generated chunk meshes.
    worldGroup.children.slice().forEach(function (m) {
      worldGroup.remove(m);
      if (m.geometry) { try { m.geometry.dispose(); } catch (e) {} }
    });

    var groups = {};  // render id -> exposed face records

    var cx = player ? Math.round(player.x) : 0;
    var cz = player ? Math.round(player.z) : 0;
    var py = player ? Math.floor(player.y) : surfaceHeight(cx, cz);
    var radiusSq = (RENDER_RADIUS + 0.5) * (RENDER_RADIUS + 0.5);
    var x, z, y;
    for (x = cx - RENDER_RADIUS; x <= cx + RENDER_RADIUS; x++) {
      for (z = cz - RENDER_RADIUS; z <= cz + RENDER_RADIUS; z++) {
        var dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz > radiusSq) continue;
        var band = naturalScanBand(x, z, py);
        for (y = band.top; y >= band.bottom; y--) {
          var key = cellKey(x, y, z);
          if (g.mined[key]) continue;
          var mask = faceMaskAtXYZ(x, y, z);
          if (!mask) continue;
          addCellFaces(groups, renderIdForContentId(contentIdAt(x, y, z)), key, x, y, z, mask);
        }
      }
    }
    Object.keys(g.placed).forEach(function (key) {
      var w = parseKey(key);
      if (Math.abs(w.x - cx) <= RENDER_RADIUS + 2 && Math.abs(w.z - cz) <= RENDER_RADIUS + 2) {
        var mask = faceMaskAtXYZ(w.x, w.y, w.z);
        if (mask) addCellFaces(groups, g.placed[key], key, w.x, w.y, w.z, mask);
      }
    });

    Object.keys(groups).forEach(function (id) {
      worldGroup.add(buildFaceMesh(id, groups[id]));
    });
    worldRenderKey = renderKeyForPlayer();
    worldDirty = false;
  }

  // ── Inventory + selection ──────────────────────────────────────
  // The inventory holds elements AND collected terrain blocks, side by side.
  function renderInv() {
    var el = G('bmg3-inv'); if (!el) return;
    repairHotbarAndSelection();
    var entries = ownedSelectors()
      .filter(function (sel) { return !hotbarHas(sel); })
      .map(entryForSelector);
    var INV_COLS = 8, INV_MIN = 32;
    var slots = Math.max(INV_MIN, Math.ceil(entries.length / INV_COLS) * INV_COLS);
    var html = '';
    for (var i = 0; i < slots; i++) {
      var e = entries[i];
      if (!e) { html += '<div class="bmg3-slot"></div>'; continue; }
      var sel = sameSel(g.selected, e.id) ? ' sel' : '';
      if (e.kind === 'pick') {
        html += '<div class="bmg3-slot' + sel + '" data-pick="' + e.power + '">' + pickIconHTML(e.power, true) + '</div>';
      } else if (e.kind === 'el') {
        html += '<div class="bmg3-slot' + sel + '" data-inv="' + e.id + '">' + itemHTML(e.id, e.count, true) + '</div>';
      } else {
        html += '<div class="bmg3-slot' + sel + '" data-block="' + e.id + '">' + genericItemHTML(e.id, e.count, true) + '</div>';
      }
    }
    el.innerHTML = html;
    renderHotbar();
  }
  function hotbarItemHTML(sel) {
    if (isPickSel(sel)) return pickIconHTML(selPower(sel), true);
    if (isGeneric(sel)) return genericItemHTML(sel, g.blocks[sel] || 0, true);
    if (typeof sel === 'number') return itemHTML(sel, g.inv[sel] || 0, true);
    return '';
  }
  function renderHotbar() {
    repairHotbarAndSelection();
    var html = '';
    for (var i = 0; i < 8; i++) {
      var sel = g.hotbar[i];
      html += '<div class="bmg3-hotbar-slot' + (i === g.hotbarIndex ? ' sel' : '') + '" data-hotbar="' + i + '">' +
        '<span class="bmg3-hotkey">' + (i + 1) + '</span>' +
        (haveSel(sel) ? hotbarItemHTML(sel) : '') +
      '</div>';
    }
    var live = G('bmg3-hotbar'); if (live) live.innerHTML = html;
    var inv = G('bmg3-inv-hotbar'); if (inv) inv.innerHTML = html;
  }
  function renderSelected() {
    var el = G('bmg3-selbar'); if (!el) return;
    var v = g.selected;
    updateHeldPickaxe();
    if (isPickSel(v)) {
      var power = selPower(v);
      var info = pickInfoFromPower(power);
      if (!info) {
        el.innerHTML = '<span style="color:#5a5a5a;font-size:0.76rem">Choose a tool or block from the hotbar.</span>';
        return;
      }
      el.innerHTML =
        '<span style="width:24px;height:24px;flex-shrink:0;position:relative;border:2px solid;border-color:#373737 #fff #fff #373737;background:#8b8b8b">' + pickIconHTML(power) + '</span>' +
        '<span style="font-weight:800;color:#2a2a2a">' + esc(info.name) + '</span>' +
        '<span style="font-family:ui-monospace,monospace;color:#444">power ' + power + '</span>' +
        '<span style="color:#5a5a5a;font-size:0.74rem;margin-left:6px">left-click ore to mine</span>';
      return;
    }
    if (isGeneric(v)) {
      el.innerHTML =
        '<span style="width:24px;height:24px;flex-shrink:0;background:' + GENERIC[v].color + ';border:2px solid;border-color:#373737 #fff #fff #373737"></span>' +
        '<span style="font-weight:800;color:#2a2a2a">' + esc(GENERIC[v].name) + '</span>' +
        '<span style="color:#555">×' + (g.blocks[v] || 0) + '</span>' +
        '<span style="color:#5a5a5a;font-size:0.74rem;margin-left:6px">right-click a block face to build</span>';
      return;
    }
    if (!v || !have(v)) {
      el.innerHTML = '<span style="color:#5a5a5a;font-size:0.76rem">Click an item to select it, then Sell it — or right-click a block to build with it.</span>';
      return;
    }
    el.innerHTML =
      '<span style="width:24px;height:24px;flex-shrink:0;background:' + elementColor(v) + ';border:2px solid;border-color:#373737 #fff #fff #373737"></span>' +
      '<span style="font-weight:800;color:#2a2a2a">' + esc(elementName(v)) + '</span>' +
      '<span style="font-family:ui-monospace,monospace;color:#444">' + binStr(v) + '</span>' +
      '<span style="color:#555">×' + g.inv[v] + '</span>' +
      '<button id="bmg3-sell" class="bmg3-btn" style="margin-left:auto;padding:3px 10px;font-size:0.76rem">Sell +' + v + ' 💰</button>';
    G('bmg3-sell').onclick = function () { sellSelected(); };
  }


  // ── Stats (top bar) ────────────────────────────────────────────
  function renderStats() {
    var el = G('bmg3-stats'); if (!el) return;
    function stat(label, val) {
      return '<span style="display:inline-flex;gap:5px;align-items:baseline">' +
        '<span style="color:#555;font-size:0.72rem">' + label + '</span>' +
        '<span style="color:#222;font-weight:800">' + val + '</span></span>';
    }
    var layer = 'Surface';
    if (player) {
      var px = Math.round(player.x), pz = Math.round(player.z);
      var depth = Math.max(0, surfaceHeight(px, pz) - Math.floor(player.y));
      layer = 'D' + depth + ' ' + GENERIC[genericTypeAt(px, Math.min(surfaceHeight(px, pz), Math.floor(player.y)), pz)].name;
    }
    el.innerHTML =
      '<span style="font-weight:800;color:#2a2a2a;letter-spacing:1px;white-space:nowrap">⛏ BINARY MINE 3D</span>' +
      stat('💰', g.money) +
      stat('Layer', esc(layer)) +
      stat('⛏', esc(elementSymbol(g.best)) + ' ' + binStr(g.best)) +
      stat('📖', discoveredCount());
  }

  // ── Mining + hint ──────────────────────────────────────────────
  function mineNatural(key) {
    if (g.mined[key]) return;
    var c = naturalContentAt(key);
    if (!c) return;
    if (c.gen != null) {
      var meta = GENERIC[c.gen];
      if (!canMineGeneric(c.gen)) {
        if (meta && (meta.bits || 0) > 0 && ownedPickPowers().length === 0 && !tutorialSeen('need-pickaxe') && !activeTut) { startTutorial('need-pickaxe'); return; }
        var need = meta && meta.bits ? meta.bits : 0;
        if (anyPickCanMineGeneric(c.gen)) toast('Select a pickaxe with bit-length ' + need + '+ to mine ' + meta.name + '.', '#a35a1a');
        else toast(meta.name + ' needs a pickaxe with bit-length ' + need + '+.', '#a35a1a');
        return;
      }
      g.mined[key] = true;
      gainBlock(c.gen, 1);
      toast('+ ' + meta.name, '#5a4a30');
      requestWorldRebuild(); renderInv(); renderSelected(); renderStats();
      save();
      return;
    }
    var v = c.el;
    if (!tutorialSeen('first-ore') && !activeTut) { startTutorial('first-ore', { value: v }); return; }
    var w = parseKey(key);
    var layerType = genericTypeAt(w.x, w.y, w.z);
    var layerMeta = GENERIC[layerType];
    if (!canMineGeneric(layerType)) {
      var layerNeed = layerMeta && layerMeta.bits ? layerMeta.bits : 0;
      if (anyPickCanMineGeneric(layerType)) toast('Select a pickaxe with bit-length ' + layerNeed + '+ to mine ore in ' + layerMeta.name + '.', '#a35a1a');
      else toast(layerMeta.name + ' needs a pickaxe with bit-length ' + layerNeed + '+.', '#a35a1a');
      return;
    }
    if (canMine(v)) {
      g.mined[key] = true;
      gainElement(v, 1);
      toast('+ ' + elementName(v) + ' (' + binStr(v) + ')', '#2f6a2f');
      requestWorldRebuild(); renderInv(); renderSelected(); renderStats();
      clearHint();
      save(); syncLeaderboard();
    } else if (anyPickCanMine(v)) {
      toast('Select a pickaxe on the hotbar to mine this ore.', '#a35a1a');
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
      return (q[0] * q[1]) - (p[0] * p[1]);
    });
    return { pairs: pairs, craftable: craftable };
  }
  function showHint(v) {
    var el = G('bmg3-hint'); if (!el) return;
    var wasOpen = isInventoryOpen();
    var target = (v === 1) ? 2 : v;
    var rp = recipePairs(target);
    var list = rp.pairs.slice(0, 5).map(function (p) {
      var ok = rp.craftable(p);
      var info = pickInfoFor(p[0], p[1]);
      return '<button class="bmg3-recipe" data-a="' + p[0] + '" data-b="' + p[1] + '" ' +
        'style="display:block;width:100%;text-align:left;padding:5px 7px;margin-top:4px;border-radius:5px;cursor:pointer;' +
        'border:1px solid ' + (ok ? '#16a34a' : '#334155') + ';background:' + (ok ? '#0f2417' : '#0f172a') + '">' +
        '<span style="font-family:monospace;font-size:0.78rem;color:#e2e8f0">' +
          binStr(p[0]) + ' + ' + binStr(p[1]) + '</span>' +
        '<span style="display:block;font-size:0.68rem;color:' + (ok ? '#86efac' : '#64748b') + '">' +
          esc(info.name) + (ok ? ' - you have both' : ' - need ' +
            (have(p[0]) ? esc(elementName(p[1])) : esc(elementName(p[0])))) + '</span>' +
      '</button>';
    }).join('');
    if (!list) list = '<div style="font-size:0.72rem;color:#64748b;margin-top:4px">No known pickaxe recipes yet - discover more elements by mining softer ore.</div>';
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:#f87171;font-weight:700">Too tough</span>' +
        '<button id="bmg3-hint-x" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:0.9rem">x</button>' +
      '</div>' +
      '<div style="font-size:0.78rem;color:#cbd5e1;margin:4px 0 2px">' +
        'Craft and equip a pickaxe that can mine <b>' + esc(elementName(v)) + '</b>:' +
      '</div>' + list +
      '<div style="font-size:0.68rem;color:#64748b;margin-top:6px">Pick a recipe, work out the binary sum below, then select the pickaxe on the hotbar.</div>';
    el.style.display = 'block';
    if (!wasOpen) toast('Too tough - press E to craft a stronger pickaxe.', '#a35a1a');
    G('bmg3-hint-x').onclick = clearHint;
    Array.prototype.forEach.call(el.querySelectorAll('.bmg3-recipe'), function (btn) {
      btn.onclick = function () {
        g.slotA = +btn.dataset.a; g.slotB = +btn.dataset.b; g.craftGuess = null; g.craftCarry = null;
        renderCraft();
        var sa = G('bmg3-slotA'); if (sa) sa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    });
  }
  function clearHint() { var el = G('bmg3-hint'); if (el) { el.style.display = 'none'; el.innerHTML = ''; } }

  // ── Selling + buyback + placing ────────────────────────────────
  function buybackCost(v) { return v * 2; }
  function sellSelected() {
    var v = g.selected;
    if (typeof v !== 'number' || !have(v)) return;
    g.inv[v]--; if (g.inv[v] <= 0) delete g.inv[v];
    g.money += v;
    g.shop[v] = (g.shop[v] || 0) + 1;
    toast('Sold ' + elementName(v) + ' for ' + v + ' 💰', '#7a5a10');
    if (!have(v)) repairHotbarAndSelection();
    renderInv(); renderSelected(); renderStats(); renderPauseMenu();
    save(); syncLeaderboard();
    checkGameOver();
  }
  function buyBack(v) {
    var cost = buybackCost(v);
    if (!(g.shop[v] > 0) || g.money < cost) return false;
    g.money -= cost;
    g.shop[v]--; if (g.shop[v] <= 0) delete g.shop[v];
    gainElement(v, 1);
    putInHotbar(v, g.hotbarIndex);
    toast('Bought back ' + elementName(v) + ' for ' + cost + ' 💰', '#2f6a2f');
    renderInv(); renderSelected(); renderStats(); renderPauseMenu();
    save(); syncLeaderboard();
    return true;
  }
  function placeAt(key) {
    var sel = g.selected;
    if (solidAt(key)) return;
    if (isPickSel(sel)) { toast('Pickaxes are tools, not blocks', '#a32a2a'); return; }
    if (isGeneric(sel)) {
      if (!(g.blocks[sel] > 0)) { toast('No ' + GENERIC[sel].name + ' blocks to place', '#a32a2a'); return; }
      g.placed[key] = sel;
      g.blocks[sel]--; if (g.blocks[sel] <= 0) { delete g.blocks[sel]; repairHotbarAndSelection(); }
    } else {
      if (typeof sel !== 'number' || !have(sel)) { toast('Select something to build with first', '#a32a2a'); return; }
      g.placed[key] = sel;
      g.inv[sel]--; if (g.inv[sel] <= 0) delete g.inv[sel];
      if (!have(sel)) repairHotbarAndSelection();
    }
    requestWorldRebuild(); renderInv(); renderSelected();
    save();
    checkGameOver();
  }
  function pickUp(key) {
    var v = g.placed[key]; if (v == null) return;
    delete g.placed[key];
    if (isGeneric(v)) gainBlock(v, 1); else gainElement(v, 1);
    requestWorldRebuild(); renderInv(); renderSelected();
    save();
  }

  // ── Craft table (the teaching surface) ─────────────────────────
  function additionRows(a, b) {
    var width = Math.max(bits(a), bits(b)) + 1;
    return {
      sum: a + b, width: width,
      aB: a.toString(2).padStart(width, '0'),
      bB: b.toString(2).padStart(width, '0')
    };
  }
  function renderCraft() {
    var slotA = G('bmg3-slotA'), slotB = G('bmg3-slotB'), out = G('bmg3-slotOut');
    var binA = G('bmg3-binA'), binB = G('bmg3-binB'), entry = G('bmg3-craft-entry');
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
    var r = additionRows(a, b);
    var alreadyHave = !!g.picks[r.sum];
    var canDo = ((a === b) ? (g.inv[a] || 0) >= 2 : have(a) && have(b)) && !alreadyHave;
    var W = r.width;
    if (!g.craftGuess || g.craftGuess.length !== W) g.craftGuess = new Array(W).fill(0);
    if (!g.craftCarry || g.craftCarry.length !== W) g.craftCarry = new Array(W).fill(0);
    out.innerHTML = '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:#5a5a5a;font-weight:800">?</span>';

    var GUT = 20, COLW = 28;
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
    var carryCells = gutter('');
    for (var c = 0; c < W; c++) carryCells += '<span class="bmg3-bit' + (g.craftCarry[c] ? ' on' : '') + '" data-carry-i="' + c + '" title="Carry helper">' + g.craftCarry[c] + '</span>';
    var ansCells = gutter('');
    for (var j = 0; j < W; j++) ansCells += '<span class="bmg3-bit' + (g.craftGuess[j] ? ' on' : '') + '" data-answer-i="' + j + '">' + g.craftGuess[j] + '</span>';

    entry.innerHTML =
      '<div style="font-size:0.74rem;color:#444;margin-bottom:6px">Add the two binary numbers, column by column:</div>' +
      '<div style="display:inline-block;background:#bdbdbd;border:2px solid;border-color:#fff #999 #999 #fff;padding:6px 10px 8px;margin-bottom:8px">' +
        '<div style="display:flex;align-items:center;margin-bottom:2px">' + carryCells + '</div>' +
        opRow(r.aB, '') +
        opRow(r.bB, '+') +
        '<div style="height:3px;background:#555;width:' + (GUT + W * COLW) + 'px;margin:3px 0"></div>' +
        '<div style="display:flex;align-items:center">' + ansCells + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
        '<button id="bmg3-craftbtn" class="bmg3-btn" ' + (canDo ? '' : 'disabled') + ' style="padding:4px 14px;font-size:0.82rem">Craft</button>' +
        '<button id="bmg3-craftclear" class="bmg3-btn" style="padding:4px 10px;font-size:0.76rem">Clear</button>' +
        '<span id="bmg3-craft-msg" style="font-size:0.73rem;color:#7a2a2a"></span>' +
      '</div>' +
      (canDo ? '' : '<div style="font-size:0.72rem;color:#7a2a2a;margin-top:4px">' + (alreadyHave ? 'You already have this pickaxe.' : 'You don\'t have both ingredients.') + '</div>');

    Array.prototype.forEach.call(entry.querySelectorAll('.bmg3-bit'), function (cell) {
      cell.onclick = function () {
        if (cell.dataset.carryI != null) {
          var c = +cell.dataset.carryI;
          g.craftCarry[c] = g.craftCarry[c] ? 0 : 1;
        } else {
          var i = +cell.dataset.answerI;
          g.craftGuess[i] = g.craftGuess[i] ? 0 : 1;
        }
        renderCraft();
      };
    });
    G('bmg3-craftbtn').onclick = function () { doCraft(a, b, r); };
    G('bmg3-craftclear').onclick = function () { g.slotA = null; g.slotB = null; g.craftGuess = null; g.craftCarry = null; renderCraft(); };
  }
  function doCraft(a, b, r) {
    if (g.picks[r.sum]) return;
    var canDo = (a === b) ? (g.inv[a] || 0) >= 2 : have(a) && have(b);
    if (!canDo) return;
    if (parseInt(g.craftGuess.join(''), 2) !== r.sum) {
      var m = G('bmg3-craft-msg');
      if (m) { m.textContent = 'Not quite — add column by column and try again.'; }
      return;
    }
    g.inv[a]--; if (g.inv[a] <= 0) delete g.inv[a];
    g.inv[b]--; if (g.inv[b] <= 0) delete g.inv[b];
    gainPick(a, b);
    putInHotbar(pickSel(r.sum), g.hotbarIndex);
    g.slotA = null; g.slotB = null; g.craftGuess = null; g.craftCarry = null;
    var info = pickInfoFromPower(r.sum);
    toast('Crafted ' + info.name + '!', '#2f6a2f');
    clearHint();
    renderInv(); renderSelected(); renderStats(); renderCraft();
    var out = G('bmg3-slotOut');
    if (out) { out.innerHTML = pickIconHTML(r.sum); setTimeout(function () { if (g.slotA == null && g.slotB == null) out.innerHTML = ''; }, 800); }
    tutorialNotify('craft');
    save(); syncLeaderboard();
    checkGameOver();
  }

  // ── Leaderboard render ─────────────────────────────────────────
  function renderLeaderboard(rows, emptyMessage) {
    var el = G('bmg3-lb'); if (!el) return;
    g._lastLb = rows || [];
    if (emptyMessage && (!rows || !rows.length)) { el.innerHTML = '<div style="color:#555;font-size:0.8rem;padding:6px;grid-column:1/-1">' + esc(emptyMessage) + '</div>'; return; }
    if (!rows || !rows.length) { el.innerHTML = '<div style="color:#555;font-size:0.8rem;padding:6px;grid-column:1/-1">No miners yet — be the first!</div>'; return; }
    var me = window.state && state.uid;
    var medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = rows.slice(0, 30).map(function (r, i) {
      var nm = (typeof studentName === 'function' && studentName(r.code)) || r.code;
      var isMe = (r.code === me);
      var bestTitle = elementName(r.best) + ' - denary ' + r.best;
      return '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border:2px solid;border-color:#fff #999 #999 #fff;background:' + (isMe ? '#e6c64a' : '#bdbdbd') + '">' +
        '<span style="width:22px;text-align:center;font-size:0.82rem;font-weight:800;color:#333">' + (medals[i] || (i + 1)) + '</span>' +
        '<span style="flex:1;min-width:0;font-size:0.8rem;font-weight:700;color:#1f1f1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(nm) + (isMe ? ' (you)' : '') + '</span>' +
        '<span style="font-family:ui-monospace,monospace;font-size:0.76rem;font-weight:800;color:#1a5a2a;white-space:nowrap;flex-shrink:0" title="' + esc(bestTitle) + '">' + esc(elementSymbol(r.best)) + ' ' + r.best + '</span>' +
        '<span style="font-size:0.76rem;font-weight:800;color:#6a4e10">' + r.money + '💰</span>' +
      '</div>';
    }).join('');
  }

  // ── Element journal ────────────────────────────────────────────
  function openJournal() {
    var existing = G('bmg3-journal'); if (existing) { try { document.body.removeChild(existing); } catch (e) {} }
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
    overlay.id = 'bmg3-journal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(2,6,15,0.88);display:flex;align-items:center;justify-content:center;padding:24px';
    overlay.innerHTML =
      '<div style="background:#0b1220;border:1px solid #1e293b;border-radius:14px;max-width:780px;width:100%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.6)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #1e293b">' +
          '<div><span style="font-size:1.05rem;font-weight:800;color:#f1f5f9">📖 Element Journal</span>' +
          '<span style="font-size:0.74rem;color:#94a3b8;margin-left:8px">' + vals.length + ' discovered &middot; ' + realCount + ' real, ' + (vals.length - realCount) + ' synthetic</span></div>' +
          '<button id="bmg3-journal-x" style="background:#334155;color:#f1f5f9;border:none;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:0.85rem;font-weight:600">✕ Close</button>' +
        '</div>' +
        '<div style="padding:14px 18px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">' + cards + '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function close() { try { document.body.removeChild(overlay); } catch (e) {} document.removeEventListener('keydown', onEsc); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    G('bmg3-journal-x').onclick = close;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc);
  }

  // ── Shop (buy back what you've sold, at 2x) ────────────────────
  function openShop() {
    var existing = G('bmg3-shop'); if (existing) { try { document.body.removeChild(existing); } catch (e) {} }
    var overlay = document.createElement('div');
    overlay.id = 'bmg3-shop';
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
          '<button class="bmg3-btn bmg3-buyback" data-v="' + v + '" ' + (can ? '' : 'disabled') + ' style="padding:4px 10px;font-size:0.78rem">Buy back — ' + cost + ' 💰</button>' +
        '</div>';
      }).join('');
      if (!rows) rows = '<div style="color:#555;font-size:0.82rem;padding:6px">You haven\'t sold anything yet. Sell elements you no longer need, then buy them back here if you change your mind.</div>';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:3px solid #999">' +
          '<div><span style="font-size:1.05rem;font-weight:800;color:#2a2a2a">🛒 Shop</span>' +
          '<span style="font-size:0.76rem;color:#555;margin-left:10px">Buy back at 2× the sale price &middot; 💰 ' + g.money + '</span></div>' +
          '<button id="bmg3-shop-x" class="bmg3-btn" style="padding:5px 12px;font-size:0.82rem">✕ Close</button>' +
        '</div>' +
        '<div style="padding:14px 18px;overflow-y:auto">' + rows + '</div>';
    }
    function refresh() { overlay.querySelector('.bmg3-shop-card').innerHTML = body(); wire(); }
    function wire() {
      G('bmg3-shop-x').onclick = close;
      Array.prototype.forEach.call(overlay.querySelectorAll('.bmg3-buyback'), function (btn) {
        btn.onclick = function () { if (buyBack(+btn.dataset.v)) refresh(); };
      });
    }
    overlay.innerHTML = '<div class="bmg3-shop-card bmg3-panel" style="max-width:520px;width:100%;max-height:84vh;display:flex;flex-direction:column;padding:0">' + body() + '</div>';
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
  function anyCraftableNewPick() {
    if (totalItemCount() < 2) return false;
    var vals = ownedValues();
    for (var i = 0; i < vals.length; i++) {
      for (var j = i; j < vals.length; j++) {
        var a = vals[i], b = vals[j];
        if (g.picks[a + b]) continue;
        if (a === b ? (g.inv[a] || 0) >= 2 : have(a) && have(b)) return true;
      }
    }
    return false;
  }
  function anyMineableNaturalNearby() {
    var powers = ownedPickPowers();
    if (!powers.length) return false;
    var cx = player ? Math.round(player.x) : 0;
    var cz = player ? Math.round(player.z) : 0;
    var py = player ? Math.floor(player.y) : surfaceHeight(cx, cz);
    for (var x = cx - RENDER_RADIUS; x <= cx + RENDER_RADIUS; x++) {
      for (var z = cz - RENDER_RADIUS; z <= cz + RENDER_RADIUS; z++) {
        var band = naturalScanBand(x, z, py);
        for (var y = band.top; y >= band.bottom; y--) {
          var key = cellKey(x, y, z);
          if (g.mined[key] || !exposedAtXYZ(x, y, z)) continue;
          var id = contentIdAt(x, y, z);
          if (typeof id === 'number') {
            var layerType = genericTypeAt(x, y, z);
            if (anyPickCanMineGeneric(layerType) && anyPickCanMine(id)) return true;
          } else if (anyPickCanMineGeneric(id)) {
            return true;
          }
        }
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
  function isHardLocked() {
    if (anyMineableNaturalNearby()) return false;  // terrain or ore we can still mine
    if (anyCraftableNewPick()) return false;        // can craft a new pickaxe
    if (anyAffordableBuyback()) return false;       // can buy an element back
    return true;
  }
  function deepestReachedDepth() {
    var maxDepth = 0;
    if (player) maxDepth = Math.max(maxDepth, surfaceHeight(Math.round(player.x), Math.round(player.z)) - Math.floor(player.y));
    Object.keys(g.mined || {}).forEach(function (key) {
      var w = parseKey(key);
      maxDepth = Math.max(maxDepth, depthBelowSurface(w.x, w.y, w.z));
    });
    return Math.max(0, Math.floor(maxDepth));
  }
  function renderAll() {
    requestWorldRebuild(); renderInv(); renderSelected(); renderStats(); renderCraft();
  }
  function doReset() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    g = freshState();
    g.selected = 1;
    repairHotbarAndSelection();
    renderAll();
    respawnPlayer();
    save(); syncLeaderboard();
  }
  function checkGameOver() {
    if (!isHardLocked()) return;
    if (G('bmg3-gameover')) return;
    var deepest = deepestReachedDepth();
    var overlay = document.createElement('div');
    overlay.id = 'bmg3-gameover';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(2,6,15,0.92);display:flex;align-items:center;justify-content:center;padding:24px;font-family:ui-monospace,monospace';
    overlay.innerHTML =
      '<div class="bmg3-panel" style="max-width:380px;width:100%;text-align:center">' +
        '<div style="font-size:2.4rem;margin-bottom:6px">💀</div>' +
        '<div style="font-size:1.3rem;font-weight:800;color:#7a2a2a;letter-spacing:1px;margin-bottom:4px">GAME OVER</div>' +
        '<div style="font-size:0.8rem;color:#444;margin-bottom:12px">You ran out of moves - no nearby rock or ore you can mine, nothing to craft, and nothing useful to buy back. Here\'s how you did:</div>' +
        '<div style="background:#bdbdbd;border:2px solid;border-color:#fff #999 #999 #fff;padding:10px;text-align:left;font-size:0.86rem;margin-bottom:14px">' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#555">⛏ Best element</span><b>' + esc(elementName(g.best)) + ' (' + binStr(g.best) + ')</b></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#555">📖 Discovered</span><b>' + discoveredCount() + '</b></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#555">Deepest layer</span><b>D' + deepest + '</b></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#555">💰 Money</span><b>' + g.money + '</b></div>' +
        '</div>' +
        '<button id="bmg3-gameover-reset" class="bmg3-btn" style="padding:8px 18px;font-size:0.95rem;font-weight:800;color:#1a4a1a">Start again</button>' +
      '</div>';
    document.body.appendChild(overlay);
    G('bmg3-gameover-reset').onclick = function () {
      try { document.body.removeChild(overlay); } catch (e) {}
      doReset();
    };
  }

  // ── Load names from the class code spreadsheet (local only) ────
  function loadLeaderboardNames() {
    var btn = G('bmg3-loadnames'), status = G('bmg3-loadnames-status');
    if (!btn) return;
    if (typeof requestGoogleStudentToken !== 'function' || typeof fetchAllStudentSheetData !== 'function' ||
        typeof findGoogleCodeSpreadsheet !== 'function' || typeof googleLookupRowToCandidate !== 'function') {
      if (status) { status.textContent = 'Name loading is not available here.'; status.style.color = '#7a2a2a'; }
      return;
    }
    var orig = '📋 Load names';
    btn.disabled = true; btn.textContent = '⏳ Connecting…';
    if (status) status.textContent = '';
    (async function () {
      try {
        if (!window.googleStudentAccessToken) await requestGoogleStudentToken();
        btn.textContent = '⏳ Finding sheet…';
        var spreadsheetId = sessionStorage.getItem('pylearn_student_sheet_id');
        if (!spreadsheetId) {
          var sheet = await findGoogleCodeSpreadsheet();
          if (!sheet) throw new Error('Could not find the code spreadsheet.');
          spreadsheetId = sheet.id;
          sessionStorage.setItem('pylearn_student_sheet_id', spreadsheetId);
        }
        btn.textContent = '⏳ Reading names…';
        var sheetData = await fetchAllStudentSheetData(spreadsheetId);
        var imported = 0;
        sheetData.forEach(function (sheet) {
          var cols = googleLookupHeaderIndexes(sheet.rows[0] || []);
          var hasHeader = cols.email != null || cols.name != null || cols.firstName != null || cols.code != null;
          for (var r = hasHeader ? 1 : 0; r < sheet.rows.length; r++) {
            var cand = googleLookupRowToCandidate(sheet.rows[r], sheet.title, hasHeader ? cols : null);
            if (cand && cand.code && cand.displayName) { state.nameMap[cand.code] = cand.displayName; imported++; }
          }
        });
        if (imported) { try { localStorage.setItem('pylearn_name_map', JSON.stringify(state.nameMap)); } catch (_e) {} }
        renderLeaderboard(g._lastLb || []);
        btn.textContent = '✓ ' + imported + ' names';
        if (status) { status.textContent = imported ? '' : 'No names found — check the sheet.'; status.style.color = imported ? '#1a4a1a' : '#7a5a10'; }
        setTimeout(function () { btn.disabled = false; btn.textContent = orig; }, 2500);
      } catch (e) {
        btn.disabled = false; btn.textContent = orig;
        if (status) { status.textContent = '⚠ ' + (e.message || 'Failed'); status.style.color = '#7a2a2a'; }
      }
    })();
  }

  // ── Save / Load to Google Drive (tamper-evident) ───────────────
  var SAVE_FOLDER = 'JHNCC Computing';
  var SAVE_FILENAME = 'binary-mine-3d-save.json';
  var SAVE_SECRET = 'bm3d-JHNCC-4e91b2a7-do-not-edit';

  function snapshotState() {
    return {
      inv: g.inv, money: g.money, best: g.best, depth: g.depth,
      discovered: g.discovered, mined: g.mined, placed: g.placed, blocks: g.blocks,
      picks: g.picks, shop: g.shop, selected: g.selected, hotbar: g.hotbar, hotbarIndex: g.hotbarIndex
    };
  }
  function sha256hex(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(str) { return decodeURIComponent(escape(atob(str))); }
  function encodeSave() {
    var payload = b64encode(JSON.stringify(snapshotState()));
    return sha256hex(SAVE_SECRET + payload).then(function (sig) {
      return JSON.stringify({ app: 'binary-mine-3d', v: 1, payload: payload, sig: sig });
    });
  }
  function decodeSave(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return Promise.reject(new Error('That is not a Binary Mine 3D save file.')); }
    if (!obj || obj.app !== 'binary-mine-3d' || !obj.payload || !obj.sig) return Promise.reject(new Error('That is not a Binary Mine 3D save file.'));
    return sha256hex(SAVE_SECRET + obj.payload).then(function (sig) {
      if (sig !== obj.sig) throw new Error('This save file has been changed or is corrupt — it cannot be loaded.');
      return JSON.parse(b64decode(obj.payload));
    });
  }
  function applyLoadedState(s) {
    if (!s || typeof s !== 'object') throw new Error('Save file is empty.');
    g.inv        = s.inv || {};
    g.money      = Math.max(0, Math.floor(s.money || 0));
    g.best       = Math.max(1, Math.floor(s.best || 1));
    g.depth      = Math.max(START_DEPTH, Math.floor(s.depth || START_DEPTH));
    g.discovered = s.discovered || { 1: true };
    g.mined      = s.mined || {};
    g.placed     = s.placed || {};
    g.blocks     = s.blocks || {};
    g.picks      = s.picks || {};
    g.shop       = s.shop || {};
    g.hotbar     = Array.isArray(s.hotbar) ? s.hotbar.slice(0, 8) : new Array(8).fill(null);
    while (g.hotbar.length < 8) g.hotbar.push(null);
    g.hotbarIndex = Math.max(0, Math.min(7, Math.floor(s.hotbarIndex || 0)));
    g.slotA = null; g.slotB = null; g.craftGuess = null; g.craftCarry = null;
    g.selected = haveSel(s.selected) ? s.selected : firstOwnedSelector();
    repairHotbarAndSelection();
    renderAll();
    respawnPlayer();
    save(); syncLeaderboard(); checkGameOver();
  }
  function openDriveModal(title) {
    var existing = G('bmg3-drive'); if (existing) { try { document.body.removeChild(existing); } catch (e) {} }
    var overlay = document.createElement('div');
    overlay.id = 'bmg3-drive';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(2,6,15,0.82);display:flex;align-items:center;justify-content:center;padding:24px;font-family:ui-monospace,monospace';
    overlay.innerHTML =
      '<div class="bmg3-panel" style="max-width:420px;width:100%">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
          '<span style="font-size:1.02rem;font-weight:800;color:#2a2a2a">' + esc(title) + '</span>' +
          '<button id="bmg3-drive-x" class="bmg3-btn" style="padding:4px 10px;font-size:0.8rem">✕ Close</button>' +
        '</div>' +
        '<div id="bmg3-drive-status" style="font-size:0.84rem;color:#333;min-height:1.4em">Connecting to Google Drive…</div>' +
        '<div id="bmg3-drive-folder" style="font-size:0.78rem;margin-top:8px"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    function close() { try { document.body.removeChild(overlay); } catch (e) {} document.removeEventListener('keydown', onEsc); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    G('bmg3-drive-x').onclick = close;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc);
    return {
      status: function (msg, color) { var el = G('bmg3-drive-status'); if (el) { el.textContent = msg; el.style.color = color || '#333'; } },
      showFolder: function (folderId) {
        var el = G('bmg3-drive-folder'); if (!el) return;
        el.innerHTML = '📁 <a href="https://drive.google.com/drive/folders/' + esc(folderId) + '" target="_blank" rel="noopener" style="color:#1a4a8a;font-weight:700">Open “' + esc(SAVE_FOLDER) + '” in Google Drive</a>';
      },
      close: close
    };
  }
  var driveBusy = false;
  function driveSaveOrLoad(mode) {
    if (driveBusy) return;
    if (typeof driveEnsureStudentToken !== 'function' || typeof window.driveFindOrCreateRootFolder !== 'function') {
      toast('Google Drive is not available here.', '#a32a2a'); return;
    }
    driveBusy = true;
    var isSave = (mode === 'save');
    (async function () {
      var modal = null;
      try {
        var token = await driveEnsureStudentToken(null);
        modal = openDriveModal(isSave ? '💾 Save to Google Drive' : '📂 Load from Google Drive');
        modal.status('Finding your “' + SAVE_FOLDER + '” folder…');
        var folderId = await window.driveFindOrCreateRootFolder(SAVE_FOLDER, token);
        modal.showFolder(folderId);
        if (isSave) {
          modal.status('Saving your game…');
          var text = await encodeSave();
          await window.driveUpsertTextFile(folderId, SAVE_FILENAME, text, token);
          modal.status('✓ Saved! Your progress is safely stored in Google Drive.', '#1a4a1a');
          toast('Saved to Google Drive', '#2f6a2f');
        } else {
          modal.status('Looking for your save…');
          var file = await window.driveFindLatestFileByName(folderId, SAVE_FILENAME, token);
          if (!file) { modal.status('No save file found in “' + SAVE_FOLDER + '”. Save your game first.', '#7a5a10'); return; }
          var raw = await window.driveFetchFileAsText(file.id, token);
          var loaded = await decodeSave(raw);
          applyLoadedState(loaded);
          modal.status('✓ Loaded! Your game has been restored from Google Drive.', '#1a4a1a');
          toast('Loaded from Google Drive', '#2f6a2f');
        }
      } catch (e) {
        var msg = (e && e.message) ? e.message : 'Something went wrong.';
        if (modal) modal.status('⚠ ' + msg, '#7a2a2a');
        else toast('⚠ ' + msg, '#a32a2a');
      } finally {
        driveBusy = false;
      }
    })();
  }

  // ── First-time tutorials ───────────────────────────────────────
  // Step-by-step coach cards that appear the first time a mechanic bites (e.g.
  // hitting rock with no pickaxe, or clicking element ore). They guide REAL
  // interaction — open the inventory, drag elements into the craft slots, do the
  // binary addition — and advance when the player actually does each action.
  // "Seen" state lives in its own localStorage key so it survives game resets.
  var TUT_KEY = 'pylearn_mining3d_tutorials';
  var activeTut = null;         // { id, steps, i, ctx }
  var TUT_HIGHLIGHTS = [];
  function tutorialsSeen() { try { return JSON.parse(localStorage.getItem(TUT_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function tutorialSeen(id) { return !!tutorialsSeen()[id]; }
  function markTutorialSeen(id) { try { var s = tutorialsSeen(); s[id] = 1; localStorage.setItem(TUT_KEY, JSON.stringify(s)); } catch (e) {} }

  function tutTile(bg, inner) {
    return '<span class="bmg3-tut-tile" style="background:' + bg + '">' + inner + '</span>';
  }
  function tutElTile(v) { return tutTile(elementColor(v), esc(elementSymbol(v))); }
  function tutArrow() { return '<span style="color:#ffd34d;font-weight:800;font-size:1.1rem">&#10142;</span>'; }

  // The interactive crafting walkthrough, shared by tutorials that need it.
  function hasAnyPick() { return ownedPickPowers().length > 0; }
  function craftWalkthroughSteps(intro) {
    return [
      { title: 'Craft a pickaxe', html: intro, requireInv: true, cta: 'open', waitFor: 'inv-open',
        done: function () { return isInventoryOpen() || hasAnyPick(); } },
      { title: 'Add the first element', requireInv: true, highlight: ['#bmg3-inv', '#bmg3-slotA'], waitFor: 'slotA',
        html: 'Your elements are in the <b>Inventory</b> grid. <b>Drag one</b> (e.g. Hydrogen ' + tutElTile(1) + ') into the <b>left</b> crafting slot.',
        done: function () { return g.slotA != null || hasAnyPick(); } },
      { title: 'Add the second element', requireInv: true, highlight: ['#bmg3-inv', '#bmg3-slotB'], waitFor: 'slotB',
        html: 'Now drag a <b>second element</b> into the <b>right</b> crafting slot. ' + tutElTile(1) + ' ' + tutArrow() + ' + ' + tutArrow() + ' ' + tutElTile(1),
        done: function () { return g.slotB != null || hasAnyPick(); } },
      { title: 'Do the binary addition', requireInv: true, highlight: ['#bmg3-craft-entry'], waitFor: 'craft',
        html: 'Add the two binary numbers, column by column. <b>Tap the answer squares</b> to enter the sum, then press <b>Craft</b>. The sum is your pickaxe\'s power.',
        done: function () { return hasAnyPick(); } },
      { title: 'Pickaxe ready!', final: true,
        html: 'Your new pickaxe is crafted and <b>equipped on the hotbar</b>. Press <b>E</b> to close the inventory, then <b>left-click</b> the block to mine it.' }
    ];
  }
  function buildTutorial(id, ctx) {
    if (id === 'need-pickaxe') {
      var intro =
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
          tutTile('#8f8f8f', 'Rock') + '<span style="font-size:1.15rem">&#9995;&#10060;</span>' + tutArrow() + tutTile('#8b8b8b', '&#9935;') +
        '</div>' +
        'That block is <b>rock</b> — too hard to mine with your bare hands. You need a <b>pickaxe</b>. Craft one by combining two elements.';
      return craftWalkthroughSteps(intro);
    }
    if (id === 'first-ore') {
      var v = (ctx && ctx.value) || 1;
      return [
        { title: 'You found ore!', next: true,
          html: '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' + tutElTile(v) +
            '<div>This glowing block is <b>ore</b> — a raw <b>element</b>, ' + esc(elementName(v)) +
            ', worth <code>' + binStr(v) + '</code> in binary.</div></div>' +
            'Mining ore is how you collect elements.' },
        { title: 'Elements make pickaxes', final: true,
          html: 'Combine two elements in your inventory (press <b>E</b>) to craft a <b>pickaxe</b> — its power is the <b>binary sum</b>. A pickaxe can mine ore of the same value (or brute-force weaker ore). Left-click ore to collect it.' }
      ];
    }
    return null;
  }

  function clearTutHighlights() {
    TUT_HIGHLIGHTS.forEach(function (el) { try { el.classList.remove('bmg3-tut-glow'); } catch (e) {} });
    TUT_HIGHLIGHTS = [];
  }
  function renderTutorial() {
    var card = G('bmg3-tutorial'); if (!card) return;
    clearTutHighlights();
    if (!activeTut) { card.classList.remove('open'); card.innerHTML = ''; var gb0 = G('bmg3-gamebox'); if (gb0) gb0.classList.remove('bmg3-tut'); return; }
    var step = activeTut.steps[activeTut.i];
    if (step.done && step.done()) { tutorialAdvance(); return; }  // already satisfied → never wait on it
    var n = activeTut.steps.length;
    var dots = '';
    for (var k = 0; k < n; k++) dots += '<span style="width:7px;height:7px;border-radius:50%;background:' + (k === activeTut.i ? '#ffd34d' : 'rgba(255,255,255,0.35)') + '"></span>';
    var needOpen = step.requireInv && !isInventoryOpen();
    var buttons = '';
    if (needOpen || step.cta === 'open') buttons += '<button class="bmg3-btn" data-tut="open" style="padding:3px 10px;font-size:0.76rem">Open inventory (E)</button>';
    if (step.next) buttons += '<button class="bmg3-btn" data-tut="next" style="padding:3px 10px;font-size:0.76rem">Next &#10142;</button>';
    if (step.final) buttons += '<button class="bmg3-btn" data-tut="finish" style="padding:3px 12px;font-size:0.78rem;font-weight:800">Got it!</button>';
    card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px">' +
        '<span style="font-weight:800;color:#ffe9a8;font-size:0.9rem">' + esc(step.title) + '</span>' +
        '<span style="display:flex;gap:4px;align-items:center">' + dots + '</span>' +
      '</div>' +
      '<div style="font-size:0.82rem;line-height:1.4;color:#eef2f7">' + step.html + '</div>' +
      (step.waitFor && !needOpen ? '<div style="font-size:0.7rem;color:#ffd34d;margin-top:6px">&#9757; do the highlighted step to continue</div>' : '') +
      '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap">' + buttons +
        '<button class="bmg3-btn" data-tut="skip" style="margin-left:auto;font-size:0.68rem;padding:2px 8px;opacity:0.85">Skip</button>' +
      '</div>';
    card.classList.add('open');
    var gb = G('bmg3-gamebox'); if (gb) gb.classList.add('bmg3-tut');
    if (step.highlight && isInventoryOpen()) {
      step.highlight.forEach(function (sel) { var el = document.querySelector(sel); if (el) { el.classList.add('bmg3-tut-glow'); TUT_HIGHLIGHTS.push(el); } });
    }
    Array.prototype.forEach.call(card.querySelectorAll('[data-tut]'), function (btn) {
      btn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); tutButton(btn.dataset.tut); };
    });
  }
  function tutButton(act) {
    if (act === 'open') { setInventoryOpen(true, false); return; }
    if (act === 'next') { tutorialAdvance(); return; }
    if (act === 'finish' || act === 'skip') { endTutorial(true); return; }
  }
  function tutorialAdvance() {
    if (!activeTut) return;
    activeTut.i++;
    if (activeTut.i >= activeTut.steps.length) { endTutorial(true); return; }
    renderTutorial();
  }
  function endTutorial(seen) {
    if (!activeTut) return;
    if (seen) markTutorialSeen(activeTut.id);
    activeTut = null;
    clearTutHighlights();
    renderTutorial();
  }
  function tutorialNotify(evt) {
    if (!activeTut) return;
    var step = activeTut.steps[activeTut.i];
    if (step && step.waitFor === evt) tutorialAdvance();
    else if (step && step.requireInv && (evt === 'inv-open' || evt === 'inv-close')) renderTutorial(); // refresh CTA / highlights
  }
  function startTutorial(id, ctx) {
    if (tutorialSeen(id) || activeTut) return;
    var steps = buildTutorial(id, ctx);
    if (!steps || !steps.length) return;
    activeTut = { id: id, steps: steps, i: 0, ctx: ctx };
    if (controls && controls.isLocked) { try { controls.unlock(); } catch (e) {} }
    setLockOverlay(false);
    renderTutorial();
  }

  // ── Mount ──────────────────────────────────────────────────────
  window.initBinaryMine3D = function (containerId) {
    var wrap = G(containerId); if (!wrap) return;
    injectStyle();
    activeTut = null; TUT_HIGHLIGHTS = [];

    g = freshState();
    load();
    g.selected = haveSel(g.selected) ? g.selected : firstOwnedSelector();
    repairHotbarAndSelection();

    wrap.innerHTML =
      '<div class="bmg3-wrap">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">' +
          // Left column: the 3D mine
          '<div class="bmg3-panel" style="flex:1 1 460px;min-width:320px">' +
            '<div class="bmg3-h">The Mine</div>' +
            '<div id="bmg3-gamebox" class="bmg3-gamebox">' +
              '<div id="bmg3-canvas" class="bmg3-canvas"><div class="bmg3-loading">Loading the 3D mine…</div></div>' +
              '<div class="bmg3-hud">' +
                '<div class="bmg3-hud-panel bmg3-hud-main">' +
                  '<div id="bmg3-stats" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"></div>' +
                  '<span id="bmg3-toast" style="font-size:0.78rem;font-weight:700;opacity:0;transition:opacity .2s">&nbsp;</span>' +
                '</div>' +
                '<div class="bmg3-hud-actions">' +
                  '<button id="bmg3-menu-btn" class="bmg3-btn bmg3-menu-btn">Menu</button>' +
                '</div>' +
              '</div>' +
              '<div id="bmg3-hotbar" class="bmg3-hotbar"></div>' +
              '<button id="bmg3-fullscreen" class="bmg3-btn bmg3-fullscreen-btn" title="Fullscreen">&#x26F6;</button>' +
              '<div id="bmg3-tutorial" class="bmg3-tutorial"></div>' +
              '<div id="bmg3-pause-overlay" class="bmg3-pause-overlay">' +
                '<div id="bmg3-pause-card" class="bmg3-panel bmg3-pause-card"></div>' +
              '</div>' +
              '<div id="bmg3-inv-overlay" class="bmg3-inv-overlay">' +
                '<div class="bmg3-panel bmg3-inventory-panel">' +
                  '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">' +
                    '<div class="bmg3-h" style="margin:0">Crafting</div>' +
                    '<button id="bmg3-inv-close" class="bmg3-btn" style="padding:2px 8px;font-size:0.76rem">x</button>' +
                  '</div>' +
                  '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
                    '<div style="display:flex;flex-direction:column;gap:3px">' +
                      '<div style="display:flex;align-items:center;gap:6px"><div class="bmg3-slot" id="bmg3-slotA"></div><span id="bmg3-binA" style="font-family:ui-monospace,monospace;font-weight:800;color:#333"></span></div>' +
                      '<div style="color:#555;font-weight:800;padding-left:15px;line-height:0.6">+</div>' +
                      '<div style="display:flex;align-items:center;gap:6px"><div class="bmg3-slot" id="bmg3-slotB"></div><span id="bmg3-binB" style="font-family:ui-monospace,monospace;font-weight:800;color:#333"></span></div>' +
                    '</div>' +
                    '<div class="bmg3-arrow">&#10142;</div>' +
                    '<div class="bmg3-slot" id="bmg3-slotOut"></div>' +
                  '</div>' +
                  '<div id="bmg3-craft-entry" style="margin-top:8px"></div>' +
                  '<div id="bmg3-hint" style="display:none;background:#b85c5c;border:3px solid;border-color:#fff #6e2e2e #6e2e2e #fff;padding:8px;margin:10px 0"></div>' +
                  '<div class="bmg3-h" style="margin-top:10px">Inventory</div>' +
                  '<div id="bmg3-inv" style="display:grid;grid-template-columns:repeat(8,42px);gap:2px;max-height:188px;overflow-y:auto"></div>' +
                  '<div id="bmg3-inv-hotbar" class="bmg3-inventory-hotbar"></div>' +
                  '<div id="bmg3-selbar" style="display:flex;align-items:center;gap:8px;margin-top:8px;min-height:26px;font-size:0.8rem"></div>' +
                  '<div style="text-align:right;margin-top:8px"><button id="bmg3-reset" class="bmg3-btn" style="padding:2px 8px;font-size:0.66rem;color:#7a3a3a">Reset</button></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Leaderboard — full width, at the very bottom
        '<div class="bmg3-panel" style="margin-top:10px">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">' +
            '<span id="bmg3-class-picker" style="display:flex;align-items:center;gap:6px"></span>' +
            '<span class="bmg3-h" style="margin:0">🏆 Class Leaderboard</span>' +
            '<button id="bmg3-loadnames" class="bmg3-btn" style="padding:3px 10px;font-size:0.74rem">📋 Load names</button>' +
            '<span id="bmg3-loadnames-status" style="font-size:0.72rem;color:#555"></span>' +
            '<span id="bmg3-lb-status" style="font-size:0.72rem;color:#555"></span>' +
          '</div>' +
          '<div id="bmg3-lb" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:5px"></div>' +
        '</div>' +
      '</div>';

    // Wire inventory: click to select (elements or terrain blocks), drag
    // elements into the craft slots.
    var inv = G('bmg3-inv');
    var invHotbar = G('bmg3-inv-hotbar');
    var gamebox = G('bmg3-gamebox');
    inv.addEventListener('click', function (e) {
      var ps = e.target.closest('.bmg3-slot[data-pick]');
      if (ps) { selectItem(pickSel(+ps.dataset.pick)); return; }
      var es = e.target.closest('.bmg3-slot[data-inv]');
      if (es) { selectItem(+es.dataset.inv); return; }
      var bs = e.target.closest('.bmg3-slot[data-block]');
      if (bs) { selectItem(bs.dataset.block); return; }
    });
    var hotbar = G('bmg3-hotbar');
    function onHotbarClick(e) {
      var slot = e.target.closest('.bmg3-hotbar-slot[data-hotbar]');
      if (slot) selectHotbar(+slot.dataset.hotbar);
    }
    function onHotbarDragOver(e) {
      var slot = e.target.closest('.bmg3-hotbar-slot[data-hotbar]');
      if (!slot) return;
      e.preventDefault();
      slot.classList.add('bmg3-drop');
    }
    function onHotbarDragLeave(e) {
      var slot = e.target.closest('.bmg3-hotbar-slot[data-hotbar]');
      if (slot) slot.classList.remove('bmg3-drop');
    }
    function onHotbarDrop(e) {
      var slot = e.target.closest('.bmg3-hotbar-slot[data-hotbar]');
      if (!slot) return;
      e.preventDefault();
      slot.classList.remove('bmg3-drop');
      var raw = (e.dataTransfer && e.dataTransfer.getData('application/x-bmg3-sel')) || selectorText(g.dragSel || '');
      var sel = selectorFromText(raw);
      if (haveSel(sel)) placeInHotbar(sel, +slot.dataset.hotbar);
      g.dragSel = null; g.dragVal = null;
    }
    [hotbar, invHotbar].forEach(function (bar) {
      if (!bar) return;
      bar.addEventListener('click', onHotbarClick);
      bar.addEventListener('dragover', onHotbarDragOver);
      bar.addEventListener('dragleave', onHotbarDragLeave);
      bar.addEventListener('drop', onHotbarDrop);
    });
    G('bmg3-inv-close').onclick = function (e) { if (e) { e.preventDefault(); e.stopPropagation(); } setInventoryOpen(false, true); };
    var menuBtn = G('bmg3-menu-btn');
    menuBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    menuBtn.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      togglePauseMenu();
    };
    var pauseOverlay = G('bmg3-pause-overlay');
    pauseOverlay.addEventListener('click', function (e) {
      if (e.target === pauseOverlay) setPauseOpen(false, true);
    });
    var fsBtn = G('bmg3-fullscreen');
    fsBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    fsBtn.addEventListener('dblclick', function (e) { e.preventDefault(); e.stopPropagation(); });
    fsBtn.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      if (e.detail && e.detail > 1) return;
      toggleGameFullscreen();
    };
    if (window._bmg3FsResize) document.removeEventListener('fullscreenchange', window._bmg3FsResize);
    window._bmg3FsResize = function () { updateFullscreenKeyboardLock(); setTimeout(resize, 80); };
    document.addEventListener('fullscreenchange', window._bmg3FsResize);
    gamebox.addEventListener('dragstart', function (e) {
      var it = e.target.closest('.bmg3-item[data-sel]'); if (!it) return;
      var sel = selectorFromText(it.dataset.sel);
      if (!haveSel(sel)) return;
      g.dragSel = sel;
      g.dragVal = (typeof sel === 'number') ? sel : null;
      try {
        e.dataTransfer.setData('application/x-bmg3-sel', selectorText(sel));
        e.dataTransfer.setData('text/plain', selectorText(sel));
        e.dataTransfer.effectAllowed = 'copyMove';
      } catch (_e) {}
    });
    gamebox.addEventListener('dragend', function () {
      g.dragSel = null; g.dragVal = null;
    });

    // Wire crafting slots (drag-drop + click)
    [['A', G('bmg3-slotA')], ['B', G('bmg3-slotB')]].forEach(function (p) {
      var which = p[0], slot = p[1];
      slot.addEventListener('dragover', function (e) { e.preventDefault(); slot.classList.add('bmg3-drop'); });
      slot.addEventListener('dragleave', function () { slot.classList.remove('bmg3-drop'); });
      slot.addEventListener('drop', function (e) {
        e.preventDefault(); slot.classList.remove('bmg3-drop');
        var val = (g.dragVal != null) ? g.dragVal : parseInt(e.dataTransfer.getData('text/plain'), 10);
        slotDrop(which, val); g.dragSel = null; g.dragVal = null;
      });
      slot.addEventListener('click', function () { slotClick(which); });
    });

    G('bmg3-loadnames').onclick = loadLeaderboardNames;
    G('bmg3-reset').onclick = function () {
      if (!confirm('Reset your mine, inventory and money? This cannot be undone.')) return;
      doReset();
    };

    // Paint the DOM parts immediately; the 3D world fills in once three loads.
    renderInv(); renderSelected(); renderStats(); renderCraft();
    renderLeaderboardClassPicker();

    // Load Three.js on demand, then build the voxel world.
    loadThree().then(function (mods) {
      THREE = mods.THREE; PointerLockControls = mods.PointerLockControls;
      initScene();
      rebuildWorld();
      resize();
      checkGameOver();
    }).catch(function (e) {
      var cw = G('bmg3-canvas');
      if (cw) cw.innerHTML = '<div class="bmg3-loading" style="color:#7a2a2a">The 3D mine could not load. Your browser may not support WebGL, or you may be offline.<br>' + esc((e && e.message) || '') + '</div>';
    });

    // Leaderboard: immediate + 30s poll (clear any previous widget's timer)
    if (window._bmg3LbTimer) { clearInterval(window._bmg3LbTimer); window._bmg3LbTimer = null; }
    fetchLeaderboard();
    syncLeaderboard();
    window._bmg3LbTimer = setInterval(fetchLeaderboard, 30000);

    // Lesson step auto-completes on mount (it's a sandbox, not a graded task)
    if (window.__markStepComplete) { try { window.__markStepComplete(); } catch (e) {} }
  };

})();
