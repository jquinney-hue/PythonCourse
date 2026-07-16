(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search || '');
  if (!params.has('turbobot')) return;

  var DEFAULT_LEVEL = [
    'Gold: 3',
    'Silver: 5',
    'Bronze: 8',
    'Dir: 0',
    '',
    'Height map:',
    '111111',
    '',
    'Item map:',
    'P0000L'
  ].join('\n');

  var BOT_BLOCKS = {
    turbobot_walkForward: 'walk_forward()',
    turbobot_turnRight: 'turn_right()',
    turbobot_turnLeft: 'turn_left()',
    turbobot_jump: 'jump()',
    turbobot_light: 'light()'
  };

  var BLOCK_SAVE_KEY = 'turbobotLevelBlocks.v1';

  var state = {
    vm: null,
    frame: null,
    status: null,
    lastCode: '',
    pendingRunCode: '',
    didSelectCategory: false,
    currentLevelLoaded: false,
    currentLevelKey: null,
    blockSaves: loadBlockSaves(),
    saveTimer: null,
    restoringWorkspace: false,
    workspaceAutosaveAttached: false,
    toolboxPatchAttached: false,
    useNativeLevels: !params.has('levelString'),
    levelString: decodeURIComponent(params.get('levelString') || '') || DEFAULT_LEVEL,
    pybotUrl: params.get('pybotUrl') ||
      ('../TurboBot/pybot.html?hideNav=true&turbobot=true&pybotv=20260716k' + (params.has('levelString') ? '&hideMenu=true' : ''))
  };

  function loadBlockSaves() {
    try {
      var parsed = JSON.parse(localStorage.getItem(BLOCK_SAVE_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object') return { levels: {} };
      if (!parsed.levels || typeof parsed.levels !== 'object') parsed.levels = {};
      return parsed;
    } catch (e) {
      return { levels: {} };
    }
  }

  function persistBlockSaves() {
    try {
      localStorage.setItem(BLOCK_SAVE_KEY, JSON.stringify(state.blockSaves));
    } catch (e) {}
  }

  function waitFor(test, timeoutMs) {
    timeoutMs = timeoutMs || 15000;
    var started = Date.now();
    return new Promise(function (resolve, reject) {
      (function tick() {
        var value = null;
        try { value = test(); } catch (e) {}
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error('Timed out waiting for TurboWarp'));
          return;
        }
        setTimeout(tick, 50);
      })();
    });
  }

  function injectStyles() {
    if (document.getElementById('turbobot-styles')) return;
    var style = document.createElement('style');
    style.id = 'turbobot-styles';
    style.textContent = [
      'body.turbobot-active { background:#0f172a; }',
      '.tb-panel {',
      '  display:flex;',
      '  flex-direction:column;',
      '  border:1px solid rgba(148,163,184,0.55);',
      '  border-radius:10px;',
      '  overflow:hidden;',
      '  background:#0f172a;',
      '  box-shadow:0 20px 45px rgba(15,23,42,0.35);',
      '}',
      '.tb-panel.tb-floating {',
      '  position:fixed;',
      '  top:92px;',
      '  right:12px;',
      '  bottom:12px;',
      '  width:min(46vw, 720px);',
      '  min-width:390px;',
      '  z-index:60;',
      '}',
      '.tb-panel.tb-docked {',
      '  position:absolute;',
      '  left:0;',
      '  right:0;',
      '  top:44px;',
      '  bottom:0;',
      '  width:auto;',
      '  min-width:0;',
      '  height:auto;',
      '  z-index:1;',
      '  border-radius:0;',
      '  border:0;',
      '  box-shadow:none;',
      '}',
      '.tb-panel.tb-fullscreen {',
      '  position:fixed;',
      '  inset:0;',
      '  width:100vw;',
      '  height:100vh;',
      '  min-width:0;',
      '  z-index:2147483647;',
      '  border:0;',
      '  border-radius:0;',
      '  box-shadow:none;',
      '}',
      '.tb-panel.tb-fullscreen.tb-internal-fullscreen {',
      '  top:2.75rem;',
      '  height:auto;',
      '}',
      '.tb-stage-host {',
      '  position:relative!important;',
      '  overflow:hidden!important;',
      '  background:#0f172a;',
      '  width:var(--tb-host-width, min(42vw, 520px))!important;',
      '  flex:0 0 var(--tb-host-width, min(42vw, 520px))!important;',
      '  min-width:390px!important;',
      '}',
      '.tb-stage-host > [class*="gui_target-wrapper"] { display:none!important; }',
      '.tb-stage-host [class*="stage-wrapper_stage-canvas-wrapper"],',
      '.tb-stage-host [class*="stage_stage-wrapper"],',
      '.tb-stage-host [class*="stage_stage_"] { display:none!important; }',
      '.tb-frame {',
      '  display:block;',
      '  width:100%;',
      '  height:100%;',
      '  flex:1;',
      '  border:0;',
      '  background:#111827;',
      '}',
      '.tb-toast {',
      '  position:fixed;',
      '  left:16px;',
      '  bottom:16px;',
      '  z-index:10000;',
      '  max-width:min(520px, calc(100vw - 32px));',
      '  padding:10px 12px;',
      '  border:1px solid rgba(148,163,184,0.45);',
      '  border-radius:8px;',
      '  background:#111827;',
      '  color:#e5e7eb;',
      '  font:600 13px/1.4 system-ui, -apple-system, Segoe UI, sans-serif;',
      '  box-shadow:0 12px 32px rgba(15,23,42,0.35);',
      '}',
      '.tb-hidden-by-mode { display:none!important; }',
      '@media (max-width: 900px) {',
      '  .tb-panel.tb-floating { left:10px; right:10px; width:auto; min-width:0; top:52vh; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function setStatus(text) {
    state.lastStatus = text;
    if (state.status) state.status.textContent = text;
  }

  function showToast(text) {
    var existing = document.querySelector('.tb-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'tb-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 5000);
  }

  function buildPanel() {
    if (state.frame) return;
    var panel = document.createElement('section');
    panel.className = 'tb-panel tb-floating';
    panel.setAttribute('aria-label', 'TurboBot game');

    var frame = document.createElement('iframe');
    frame.className = 'tb-frame';
    frame.title = 'PyBot game screen';
    frame.allow = 'fullscreen';
    frame.src = state.pybotUrl;
    frame.addEventListener('load', function () {
      setStatus(state.useNativeLevels ? 'Choose a PyBot level.' : 'Loading level...');
      applyPyBotLayout();
      sendToPyBot('TURBOBOT_MODE', { showLevelsButton: state.useNativeLevels });
      if (!state.useNativeLevels) {
        sendToPyBot('LOAD_CUSTOM_LEVEL', { levelString: state.levelString });
      }
    });

    panel.appendChild(frame);
    document.body.appendChild(panel);
    state.frame = frame;
    syncPanelDock();
  }

  function getStageHost() {
    return document.querySelector('[class*="gui_stage-and-target-wrapper"]');
  }

  function getFullscreenElement() {
    return document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null;
  }

  function classText(el) {
    return String((el && el.className) || '').toLowerCase();
  }

  function isElementVisible(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
  }

  function coversViewport(el) {
    if (!isElementVisible(el)) return false;
    var rect = el.getBoundingClientRect();
    var width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    var height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    if (width < 1 || height < 1) return false;
    return rect.width >= width * 0.78 &&
      rect.height >= height * 0.78 &&
      rect.left <= width * 0.12 &&
      rect.top <= height * 0.12;
  }

  function isTurboWarpFullscreenCandidate(el) {
    if (!el || el.classList.contains('tb-panel') || el.classList.contains('tb-frame')) return false;
    var cls = classText(el);
    if (cls.indexOf('tb-stage-host') !== -1) return false;
    return cls.indexOf('stage-wrapper_stage-wrapper') !== -1 &&
      cls.indexOf('stage-wrapper_full-screen') !== -1;
  }

  function scoreFullscreenCandidate(el) {
    if (!coversViewport(el) || !isTurboWarpFullscreenCandidate(el)) return -1;
    var rect = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    var cls = classText(el);
    var score = rect.width * rect.height;
    if (cls.indexOf('fullscreen') !== -1 || cls.indexOf('full-screen') !== -1) score += 10000000;
    if (cls.indexOf('stage') !== -1) score += 5000000;
    if (style.position === 'fixed') score += 2500000;
    if (Number(style.zIndex) >= 100) score += 1000000;
    return score;
  }

  function getInternalFullscreenHost() {
    var candidates = [];
    var seeds = Array.prototype.slice.call(document.querySelectorAll([
      '[class*="stage-wrapper_full-screen"]'
    ].join(',')));

    seeds.forEach(function (seed) {
      var el = seed;
      while (el && el !== document.body && el !== document.documentElement) {
        if (isTurboWarpFullscreenCandidate(el)) candidates.push(el);
        el = el.parentElement;
      }
    });

    var best = null;
    var bestScore = -1;
    candidates.forEach(function (candidate) {
      var score = scoreFullscreenCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    return bestScore > -1 ? best : null;
  }

  function syncPanelDock() {
    var nativeFullscreenElement = getFullscreenElement();
    if (nativeFullscreenElement) return dockPanelFullscreen(nativeFullscreenElement, true);
    if (getInternalFullscreenHost()) return dockPanelFullscreen(null, false);
    return dockPanel();
  }

  function dockPanel() {
    var panel = state.frame && state.frame.closest('.tb-panel');
    if (!panel) return false;
    var host = getStageHost();
    if (!host) return false;
    var hostBox = host.getBoundingClientRect();
    var hostWidth = hostBox.width;
    if (hostWidth < 120) {
      hostWidth = Math.max(390, Math.min(720, Math.round(window.innerWidth * 0.39)));
    }
    host.style.setProperty('--tb-host-width', hostWidth + 'px');
    host.classList.add('tb-stage-host');
    if (panel.parentElement !== host) host.appendChild(panel);
    panel.classList.remove('tb-floating', 'tb-fullscreen', 'tb-native-fullscreen', 'tb-internal-fullscreen');
    panel.classList.add('tb-docked');
    resizePyBotSoon();
    return true;
  }

  function dockPanelFullscreen(fullscreenElement, useNativeHost) {
    var panel = state.frame && state.frame.closest('.tb-panel');
    if (!panel) return false;
    var host = useNativeHost && fullscreenElement ? fullscreenElement : document.body;
    if (panel.parentElement !== host) host.appendChild(panel);
    panel.classList.remove('tb-floating', 'tb-docked', 'tb-native-fullscreen', 'tb-internal-fullscreen');
    panel.classList.add('tb-fullscreen', useNativeHost ? 'tb-native-fullscreen' : 'tb-internal-fullscreen');
    resizePyBotSoon();
    return true;
  }

  function resizePyBotSoon() {
    applyPyBotLayout();
    [0, 120, 350].forEach(function (delay) {
      setTimeout(function () {
        try {
          if (state.frame && state.frame.contentWindow) {
            state.frame.contentWindow.dispatchEvent(new Event('resize'));
          }
        } catch (e) {}
      }, delay);
    });
  }

  function handleFullscreenChange() {
    syncPanelDock();
  }

  function sendToPyBot(type, data) {
    if (!state.frame || !state.frame.contentWindow) return;
    try {
      state.frame.contentWindow.postMessage({ type: type, data: data || {} }, '*');
    } catch (e) {}
  }

  function applyPyBotLayout() {
    sendToPyBot('TURBOBOT_MODE', { showLevelsButton: state.useNativeLevels });
    try {
      var doc = state.frame && state.frame.contentWindow && state.frame.contentWindow.document;
      if (!doc || !doc.head) return false;
      var style = doc.getElementById('turbobot-pybot-layout');
      if (!style) {
        style = doc.createElement('style');
        style.id = 'turbobot-pybot-layout';
        style.textContent = [
          '#left-pane { display:none!important; }',
          '#right-pane { width:100%!important; max-width:none!important; flex:1 1 auto!important; }',
          '#main-area { display:flex!important; }',
          '#canvas-container { width:100%!important; height:100%!important; }',
          '#example-code-display, #editor-container { display:none!important; }'
        ].join('\n');
        doc.head.appendChild(style);
      }
      try {
        state.frame.contentWindow.dispatchEvent(new Event('resize'));
      } catch (_e) {}
      return true;
    } catch (e) {
      // Localhost cannot alter the production PyBot frame because it is a
      // different origin. On GitHub Pages, TurboBot and PyBot share an origin.
      return false;
    }
  }

  function getScratchWorkspace() {
    var ScratchBlocks = window.ScratchBlocks;
    if (!ScratchBlocks) return null;
    try {
      if (typeof ScratchBlocks.getMainWorkspace === 'function') {
        return ScratchBlocks.getMainWorkspace();
      }
    } catch (e) {}
    return ScratchBlocks.mainWorkspace || null;
  }

  function normalizeToolboxText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function toolboxCategoryKey(category) {
    return [
      category.getAttribute('id'),
      category.getAttribute('name'),
      category.getAttribute('colour'),
      category.getAttribute('custom')
    ].map(normalizeToolboxText).join('|');
  }

  function isAllowedToolboxCategory(category) {
    var key = toolboxCategoryKey(category);
    return key.indexOf('event') !== -1 ||
      key.indexOf('control') !== -1 ||
      key.indexOf('turbobot') !== -1;
  }

  function allowedToolboxBlock(category, type) {
    var key = toolboxCategoryKey(category);
    if (key.indexOf('event') !== -1) return type === 'event_whenflagclicked';
    if (key.indexOf('control') !== -1) return type === 'control_repeat';
    if (key.indexOf('turbobot') !== -1) return true;
    return false;
  }

  function filterToolboxXml(toolboxXml) {
    if (typeof toolboxXml !== 'string') return toolboxXml;
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(toolboxXml, 'text/xml');
      if (doc.querySelector('parsererror')) return toolboxXml;

      Array.prototype.slice.call(doc.querySelectorAll('category')).forEach(function (category) {
        if (!isAllowedToolboxCategory(category)) {
          category.parentNode.removeChild(category);
          return;
        }

        Array.prototype.slice.call(category.children).forEach(function (child) {
          var tagName = String(child.tagName || '').toLowerCase();
          if (tagName !== 'block') {
            child.parentNode.removeChild(child);
            return;
          }
          if (!allowedToolboxBlock(category, child.getAttribute('type'))) {
            child.parentNode.removeChild(child);
          }
        });
      });

      return new XMLSerializer().serializeToString(doc.documentElement);
    } catch (e) {
      console.warn('[TurboBot] Could not filter toolbox:', e);
      return toolboxXml;
    }
  }

  function patchToolbox(attempts) {
    if (state.toolboxPatchAttached) return;
    attempts = attempts == null ? 30 : attempts;
    var workspace = getScratchWorkspace();
    if (!workspace || typeof workspace.updateToolbox !== 'function') {
      if (attempts > 0) {
        setTimeout(function () {
          patchToolbox(attempts - 1);
        }, 200);
      }
      return;
    }

    var originalUpdateToolbox = workspace.updateToolbox.bind(workspace);
    workspace.updateToolbox = function (toolboxXml) {
      return originalUpdateToolbox(filterToolboxXml(toolboxXml));
    };
    state.toolboxPatchAttached = true;
    setTimeout(function () {
      filterVisibleFlyoutBlocks();
      selectEventsCategory();
    }, 0);
  }

  function isAllowedFlyoutBlock(type) {
    return type === 'event_whenflagclicked' ||
      type === 'control_repeat' ||
      String(type || '').indexOf('turbobot_') === 0;
  }

  function filterVisibleFlyoutBlocks() {
    var workspace = getScratchWorkspace();
    if (!workspace || !workspace.getFlyout) return;
    try {
      var flyout = workspace.getFlyout();
      var flyoutWorkspace = flyout && flyout.getWorkspace && flyout.getWorkspace();
      if (!flyoutWorkspace || !flyoutWorkspace.getTopBlocks) return;
      flyoutWorkspace.getTopBlocks(false).forEach(function (block) {
        var root = block && block.getSvgRoot && block.getSvgRoot();
        if (!root) return;
        root.style.display = isAllowedFlyoutBlock(block.type) ? '' : 'none';
      });
    } catch (e) {}
  }

  function getWorkspaceXml() {
    var ScratchBlocks = window.ScratchBlocks;
    var workspace = getScratchWorkspace();
    if (!ScratchBlocks || !workspace || !ScratchBlocks.Xml) return null;
    try {
      var dom = ScratchBlocks.Xml.workspaceToDom(workspace);
      if (typeof ScratchBlocks.Xml.domToText === 'function') {
        return ScratchBlocks.Xml.domToText(dom);
      }
      return new XMLSerializer().serializeToString(dom);
    } catch (e) {
      console.warn('[TurboBot] Could not save Scratch blocks:', e);
      return null;
    }
  }

  function setWorkspaceXml(xml) {
    var ScratchBlocks = window.ScratchBlocks;
    var workspace = getScratchWorkspace();
    if (!ScratchBlocks || !workspace || !ScratchBlocks.Xml) return false;
    var source = xml || '<xml xmlns="http://www.w3.org/1999/xhtml"></xml>';
    state.restoringWorkspace = true;
    try {
      var dom = ScratchBlocks.Xml.textToDom(source);
      if (typeof ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml === 'function') {
        ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
      } else {
        workspace.clear();
        ScratchBlocks.Xml.domToWorkspace(dom, workspace);
      }
      if (typeof workspace.clearUndo === 'function') workspace.clearUndo();
      if (typeof workspace.resize === 'function') workspace.resize();
      return true;
    } catch (e) {
      console.warn('[TurboBot] Could not restore Scratch blocks:', e);
      return false;
    } finally {
      setTimeout(function () {
        state.restoringWorkspace = false;
      }, 0);
    }
  }

  function levelKey(level) {
    return 'pybot:' + String(level);
  }

  function saveCurrentLevelWorkspace() {
    if (!state.useNativeLevels || !state.currentLevelKey || state.restoringWorkspace) return;
    var xml = getWorkspaceXml();
    if (xml == null) return;
    state.blockSaves.levels[state.currentLevelKey] = xml;
    persistBlockSaves();
  }

  function scheduleWorkspaceSave() {
    if (!state.useNativeLevels || !state.currentLevelKey || state.restoringWorkspace) return;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveCurrentLevelWorkspace, 250);
  }

  function restoreWorkspaceForLevel(level, attempts) {
    if (!state.useNativeLevels) return;
    attempts = attempts == null ? 20 : attempts;
    var key = levelKey(level);
    state.currentLevelKey = key;
    var workspace = getScratchWorkspace();
    if (!workspace) {
      if (attempts > 0) {
        setTimeout(function () {
          restoreWorkspaceForLevel(level, attempts - 1);
        }, 100);
      }
      return;
    }
    var xml = state.blockSaves.levels[key] || '';
    setWorkspaceXml(xml);
    scheduleInitialCategorySelect();
  }

  function attachWorkspaceAutosave(attempts) {
    if (!state.useNativeLevels || state.workspaceAutosaveAttached) return;
    attempts = attempts == null ? 30 : attempts;
    var workspace = getScratchWorkspace();
    if (!workspace) {
      if (attempts > 0) {
        setTimeout(function () {
          attachWorkspaceAutosave(attempts - 1);
        }, 200);
      }
      return;
    }
    workspace.addChangeListener(function (event) {
      if (state.restoringWorkspace) return;
      if (event && event.type === 'ui') return;
      scheduleWorkspaceSave();
    });
    state.workspaceAutosaveAttached = true;
  }

  function registerExtension(vm) {
    if (!vm || !vm.extensionManager) return;
    if (vm.extensionManager.isExtensionLoaded && vm.extensionManager.isExtensionLoaded('turbobot')) return;

    function TurboBotExtension() {}
    TurboBotExtension.prototype.getInfo = function () {
      return {
        id: 'turbobot',
        name: 'TurboBot',
        color1: '#2f855a',
        color2: '#276749',
        color3: '#22543d',
        blocks: [
          { blockType: 'label', text: 'Movement' },
          { opcode: 'walkForward', blockType: 'command', text: 'walk forward' },
          { opcode: 'jump', blockType: 'command', text: 'jump' },
          '---',
          { blockType: 'label', text: 'Turning' },
          { opcode: 'turnRight', blockType: 'command', text: 'turn right' },
          { opcode: 'turnLeft', blockType: 'command', text: 'turn left' },
          '---',
          { blockType: 'label', text: 'Goal' },
          { opcode: 'light', blockType: 'command', text: 'light tile' }
        ]
      };
    };
    TurboBotExtension.prototype.walkForward = function () {};
    TurboBotExtension.prototype.turnRight = function () {};
    TurboBotExtension.prototype.turnLeft = function () {};
    TurboBotExtension.prototype.jump = function () {};
    TurboBotExtension.prototype.light = function () {};

    try {
      vm.extensionManager.addBuiltinExtension('turbobot', TurboBotExtension);
      vm.extensionManager.loadExtensionIdSync('turbobot');
    } catch (e) {
      console.warn('[TurboBot] Could not register extension:', e);
    }
  }

  function getTarget() {
    var runtime = state.vm && state.vm.runtime;
    if (!runtime || !runtime.targets) return null;
    var editing = runtime.getEditingTarget && runtime.getEditingTarget();
    if (editing && !editing.isStage) return editing;
    return runtime.targets.find(function (target) { return target && !target.isStage; }) || null;
  }

  function getBlocks(target) {
    if (!target || !target.blocks) return {};
    return target.blocks._blocks || target.blocks._blocksById || {};
  }

  function getBlock(target, id) {
    if (!target || !id || !target.blocks) return null;
    try {
      if (typeof target.blocks.getBlock === 'function') return target.blocks.getBlock(id);
    } catch (e) {}
    return getBlocks(target)[id] || null;
  }

  function fieldValue(field) {
    if (field == null) return '';
    if (Array.isArray(field)) return field[0];
    if (typeof field === 'object' && Object.prototype.hasOwnProperty.call(field, 'value')) return field.value;
    return field;
  }

  function inputBlockId(block, name) {
    if (!block || !block.inputs) return null;
    var input = block.inputs[name];
    if (!input) return null;
    if (Array.isArray(input)) return input[1] || input[2] || null;
    return input.block || input.shadow || input.id || null;
  }

  function literalFromBlock(target, id) {
    var block = getBlock(target, id);
    if (!block) return null;
    var fields = block.fields || {};
    if (fields.NUM) return fieldValue(fields.NUM);
    if (fields.TEXT) return JSON.stringify(String(fieldValue(fields.TEXT)));
    if (fields.VARIABLE) return safeName(fieldValue(fields.VARIABLE));
    switch (block.opcode) {
      case 'math_number':
      case 'math_integer':
      case 'math_whole_number':
      case 'math_positive_number':
        return fieldValue(fields.NUM);
      case 'operator_add':
        return '(' + valueOfInput(target, block, 'NUM1', '0') + ' + ' + valueOfInput(target, block, 'NUM2', '0') + ')';
      case 'operator_subtract':
        return '(' + valueOfInput(target, block, 'NUM1', '0') + ' - ' + valueOfInput(target, block, 'NUM2', '0') + ')';
      case 'operator_multiply':
        return '(' + valueOfInput(target, block, 'NUM1', '0') + ' * ' + valueOfInput(target, block, 'NUM2', '0') + ')';
      case 'operator_divide':
        return '(' + valueOfInput(target, block, 'NUM1', '0') + ' / ' + valueOfInput(target, block, 'NUM2', '1') + ')';
      case 'data_variable':
        return safeName(fieldValue(fields.VARIABLE) || 'variable');
      default:
        return null;
    }
  }

  function valueOfInput(target, block, name, fallback) {
    var id = inputBlockId(block, name);
    var value = literalFromBlock(target, id);
    return value == null || value === '' ? fallback : value;
  }

  function safeName(name) {
    return String(name || 'value').replace(/[^A-Za-z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  }

  function boolOfInput(target, block, name) {
    var id = inputBlockId(block, name);
    var child = getBlock(target, id);
    if (!child) return 'True';
    switch (child.opcode) {
      case 'operator_equals':
        return valueOfInput(target, child, 'OPERAND1', '0') + ' == ' + valueOfInput(target, child, 'OPERAND2', '0');
      case 'operator_gt':
        return valueOfInput(target, child, 'OPERAND1', '0') + ' > ' + valueOfInput(target, child, 'OPERAND2', '0');
      case 'operator_lt':
        return valueOfInput(target, child, 'OPERAND1', '0') + ' < ' + valueOfInput(target, child, 'OPERAND2', '0');
      case 'operator_and':
        return '(' + boolOfInput(target, child, 'OPERAND1') + ') and (' + boolOfInput(target, child, 'OPERAND2') + ')';
      case 'operator_or':
        return '(' + boolOfInput(target, child, 'OPERAND1') + ') or (' + boolOfInput(target, child, 'OPERAND2') + ')';
      case 'operator_not':
        return 'not (' + boolOfInput(target, child, 'OPERAND') + ')';
      default:
        return 'True';
    }
  }

  function compileStack(target, startId, depth, warnings) {
    var lines = [];
    var seen = {};
    var id = startId;
    while (id && !seen[id]) {
      seen[id] = true;
      var block = getBlock(target, id);
      if (!block) break;
      lines = lines.concat(compileBlock(target, block, depth, warnings));
      id = block.next;
    }
    return lines;
  }

  function compileBlock(target, block, depth, warnings) {
    var indent = new Array(depth + 1).join('    ');
    var opcode = block.opcode;

    if (BOT_BLOCKS[opcode]) return [indent + BOT_BLOCKS[opcode]];

    switch (opcode) {
      case 'control_repeat': {
        var count = valueOfInput(target, block, 'TIMES', '1');
        var repeatLines = [indent + 'for i in range(' + count + '):'];
        var body = compileStack(target, inputBlockId(block, 'SUBSTACK'), depth + 1, warnings);
        return repeatLines.concat(body.length ? body : [indent + '    pass']);
      }
      case 'control_forever': {
        warnings.push('Forever blocks are limited to 20 repeats in TurboBot so PyBot cannot run forever.');
        var foreverLines = [indent + 'for i in range(20):'];
        var foreverBody = compileStack(target, inputBlockId(block, 'SUBSTACK'), depth + 1, warnings);
        return foreverLines.concat(foreverBody.length ? foreverBody : [indent + '    pass']);
      }
      case 'control_if': {
        var ifLines = [indent + 'if ' + boolOfInput(target, block, 'CONDITION') + ':'];
        var ifBody = compileStack(target, inputBlockId(block, 'SUBSTACK'), depth + 1, warnings);
        return ifLines.concat(ifBody.length ? ifBody : [indent + '    pass']);
      }
      case 'control_if_else': {
        var ifElseLines = [indent + 'if ' + boolOfInput(target, block, 'CONDITION') + ':'];
        var trueBody = compileStack(target, inputBlockId(block, 'SUBSTACK'), depth + 1, warnings);
        var falseBody = compileStack(target, inputBlockId(block, 'SUBSTACK2'), depth + 1, warnings);
        return ifElseLines
          .concat(trueBody.length ? trueBody : [indent + '    pass'])
          .concat([indent + 'else:'])
          .concat(falseBody.length ? falseBody : [indent + '    pass']);
      }
      case 'control_wait':
        warnings.push('Wait blocks are ignored by PyBot.');
        return [];
      case 'data_setvariableto':
        return [indent + safeName(fieldValue((block.fields || {}).VARIABLE) || 'variable') + ' = ' + valueOfInput(target, block, 'VALUE', '0')];
      case 'data_changevariableby':
        return [indent + safeName(fieldValue((block.fields || {}).VARIABLE) || 'variable') + ' += ' + valueOfInput(target, block, 'VALUE', '1')];
      default:
        if (opcode && !/^event_/.test(opcode)) warnings.push('Skipped unsupported block: ' + opcode);
        return [];
    }
  }

  function sortedTopBlocks(target) {
    var blocks = getBlocks(target);
    return Object.keys(blocks)
      .map(function (id) { return blocks[id]; })
      .filter(function (block) { return block && block.topLevel && block.opcode === 'event_whenflagclicked'; })
      .sort(function (a, b) {
        var ay = Number(a.y || 0);
        var by = Number(b.y || 0);
        if (ay !== by) return ay - by;
        return Number(a.x || 0) - Number(b.x || 0);
      });
  }

  function compileProject() {
    var target = getTarget();
    var warnings = [];
    if (!target) {
      return { code: '', warnings: ['No sprite is available to compile.'] };
    }
    var starts = sortedTopBlocks(target);
    if (!starts.length) {
      return { code: '', warnings: ['Add TurboBot blocks under a green flag, then click the green flag.'] };
    }
    var lines = [];
    starts.forEach(function (start, index) {
      var stackLines = compileStack(target, start.next, 0, warnings);
      if (stackLines.length) {
        if (index > 0 && lines.length) lines.push('');
        lines = lines.concat(stackLines);
      }
    });
    if (!lines.length) warnings.push('No TurboBot command blocks were found under the green flag.');
    return { code: lines.join('\n'), warnings: warnings };
  }

  function runProject() {
    var result = compileProject();
    state.lastCode = result.code;
    if (!result.code) {
      setStatus('Nothing to run yet.');
      showToast(result.warnings[0] || 'Add blocks under a green flag first.');
      return;
    }
    if (result.warnings.length) showToast(result.warnings[0]);
    if (state.useNativeLevels && !state.currentLevelLoaded) {
      setStatus('Choose a PyBot level first.');
      showToast('Choose a PyBot level in the level screen first.');
      sendToPyBot('SHOW_MENU');
      return;
    }
    setStatus('Running Scratch blocks in PyBot...');
    if (state.useNativeLevels) {
      state.pendingRunCode = '';
      clickPyBotPlay(result.code);
    } else {
      state.pendingRunCode = result.code;
      sendToPyBot('LOAD_CUSTOM_LEVEL', { levelString: state.levelString });
    }
  }

  function clickPyBotPlay(code) {
    sendToPyBot('RUN_CODE', { code: code });
  }

  function handlePyBotMessage(event) {
    if (!state.frame || event.source !== state.frame.contentWindow || !event.data) return;
    if (event.data.type === 'LEVEL_LOADED') {
      if (state.useNativeLevels) {
        saveCurrentLevelWorkspace();
        restoreWorkspaceForLevel(event.data.level);
      }
      state.currentLevelLoaded = true;
      applyPyBotLayout();
      if (state.pendingRunCode) {
        var code = state.pendingRunCode;
        state.pendingRunCode = '';
        setStatus('Running Scratch blocks in PyBot...');
        setTimeout(function () {
          sendToPyBot('SET_CODE', { code: code });
          clickPyBotPlay(code);
        }, 80);
      } else {
        setStatus('Ready. Build blocks, then click the green flag.');
      }
    }
    if (event.data.type === 'MENU_OPENED') {
      saveCurrentLevelWorkspace();
      state.currentLevelLoaded = false;
      setStatus('Choose a PyBot level.');
    }
    if (event.data.type === 'LEVEL_REQUIRED') {
      state.currentLevelLoaded = false;
      setStatus('Choose a PyBot level first.');
      showToast('Choose a PyBot level before running your blocks.');
    }
    if (event.data.type === 'LEVEL_COMPLETE') {
      setStatus('Complete: ' + (event.data.medal || '') + ' ' + event.data.lines + ' lines');
    }
  }

  function closestClickable(el) {
    var current = el;
    for (var i = 0; current && i < 6; i++) {
      if (current.matches && current.matches('button,[role="button"],li,[class*="tab"],[class*="category"],[class*="Category"],[class*="menu-item"],[class*="MenuItem"]')) return current;
      current = current.parentElement;
    }
    return el;
  }

  function elementsWithExactText(text) {
    var needle = String(text).trim().toLowerCase();
    var all = document.querySelectorAll('span,div,button');
    var matches = [];
    all.forEach(function (el) {
      if ((el.textContent || '').trim().toLowerCase() === needle) matches.push(el);
    });
    return matches;
  }

  function hideByText(text) {
    elementsWithExactText(text).forEach(function (el) {
      var row = el.closest && el.closest('.scratchCategoryMenuRow');
      (row || closestClickable(el)).classList.add('tb-hidden-by-mode');
    });
  }

  function selectEventsCategory() {
    if (state.didSelectCategory) return true;
    if (isEventsCategorySelected()) {
      state.didSelectCategory = true;
      filterVisibleFlyoutBlocks();
      return true;
    }
    var direct = document.querySelector('.scratchCategoryId-event');
    if (direct) {
      try {
        dispatchCategorySelection(direct);
        if (isEventsCategorySelected()) {
          state.didSelectCategory = true;
          setTimeout(filterVisibleFlyoutBlocks, 0);
          return true;
        }
      } catch (e) {}
    }
    var items = elementsWithExactText('Events');
    if (!items.length) return false;
    try {
      dispatchCategorySelection(closestClickable(items[0]));
      if (isEventsCategorySelected()) {
        state.didSelectCategory = true;
        setTimeout(filterVisibleFlyoutBlocks, 0);
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function isEventsCategorySelected() {
    var item = document.querySelector('.scratchCategoryId-event');
    return !!(item && /\bcategorySelected\b/.test(item.className || ''));
  }

  function dispatchCategorySelection(el) {
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(function (type) {
      try {
        el.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      } catch (e) {
        try { el.click(); } catch (_e) {}
      }
    });
  }

  function pruneUi() {
    [
      'Motion',
      'Looks',
      'Sound',
      'Sensing',
      'Operators',
      'Variables',
      'My Blocks',
      'Costumes',
      'Sounds'
    ].forEach(hideByText);
    filterVisibleFlyoutBlocks();
  }

  function scheduleInitialCategorySelect() {
    [250, 800, 1600, 2800, 4500].forEach(function (delay) {
      setTimeout(function () {
        selectEventsCategory();
        filterVisibleFlyoutBlocks();
        setTimeout(filterVisibleFlyoutBlocks, 80);
      }, delay);
    });
  }

  function watchUi() {
    pruneUi();
    scheduleDockPanel();
    scheduleInitialCategorySelect();
    var observer = new MutationObserver(function () {
      pruneUi();
      syncPanelDock();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', syncPanelDock);
    document.addEventListener('click', function () {
      [40, 160, 420, 900].forEach(function (delay) {
        setTimeout(syncPanelDock, delay);
      });
    }, true);
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (eventName) {
      document.addEventListener(eventName, handleFullscreenChange);
    });
  }

  function scheduleDockPanel() {
    [0, 250, 800, 1600, 2800, 4500].forEach(function (delay) {
      setTimeout(syncPanelDock, delay);
    });
  }

  function boot(vm) {
    state.vm = vm;
    document.body.classList.add('turbobot-active');
    injectStyles();
    buildPanel();
    registerExtension(vm);
    patchToolbox();
    watchUi();
    attachWorkspaceAutosave();
    window.addEventListener('message', handlePyBotMessage);
    window.addEventListener('beforeunload', saveCurrentLevelWorkspace);

    try {
      vm.runtime.on('PROJECT_START', function () {
        setTimeout(runProject, 0);
      });
    } catch (e) {
      console.warn('[TurboBot] Could not attach green flag handler:', e);
    }

    try {
      vm.runtime.on('PROJECT_STOP_ALL', function () {
        state.pendingRunCode = '';
        sendToPyBot('RESET');
        setStatus('Stopped. Build blocks, then click the green flag.');
      });
    } catch (e) {
      console.warn('[TurboBot] Could not attach stop handler:', e);
    }

    setTimeout(function () {
      setStatus('Ready. Build blocks, then click the green flag.');
    }, 1600);
  }

  waitFor(function () {
    return (window.vm && window.vm.runtime) ? window.vm : null;
  }).then(boot).catch(function (error) {
    console.warn('[TurboBot] Boot failed:', error);
  });
})();
