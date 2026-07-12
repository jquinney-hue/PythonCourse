(function () {
  var STYLE_ID = 'hex-machine-lesson-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.hex-machine-shell{position:relative;width:100%;height:min(780px,calc(100vh - 150px));min-height:620px;border:1px solid #334155;border-radius:8px;overflow:hidden;background:#111827}' +
      '.hex-machine-frame{width:100%;height:100%;border:0;display:block;background:#c6c6c6}' +
      '.hex-machine-shell:fullscreen{width:100vw;height:100vh;border:0;border-radius:0}' +
      '.hex-machine-shell:fullscreen .hex-machine-frame{height:100vh}';
    document.head.appendChild(style);
  }

  window.initHexMachineGame = function (containerId) {
    var root = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!root) return;
    injectStyle();
    root.innerHTML =
      '<div class="hex-machine-shell">' +
        '<iframe class="hex-machine-frame" title="Hex Machine" src="assets/hex-machine.html?v=20260712a" allow="fullscreen" allowfullscreen></iframe>' +
      '</div>';
    if (window.__markStepComplete) {
      try { window.__markStepComplete(); } catch (_e) {}
    }
  };
})();
