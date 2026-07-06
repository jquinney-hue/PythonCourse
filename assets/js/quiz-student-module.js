// ── STUDENT: Join quiz ─────────────────────────────────────────
document.getElementById('btn-join-quiz').onclick = function() {
  document.getElementById('input-lobby-code').value = '';
  document.getElementById('join-quiz-error').classList.add('hidden');
  document.getElementById('modal-join-quiz').classList.remove('hidden');
};

document.getElementById('btn-join-quiz-cancel').onclick = function() {
  document.getElementById('modal-join-quiz').classList.add('hidden');
};

// Prevent join-spam: track in-flight join request
var joinInProgress = false;

function stopForcedQuizWatcher() {
  if (state.forcedQuizRef && state.forcedQuizListener) {
    state.forcedQuizRef.off('value', state.forcedQuizListener);
  }
  state.forcedQuizRef = null;
  state.forcedQuizListener = null;
  state.forcedQuizCode = null;
}

function startForcedQuizWatcher(className) {
  stopForcedQuizWatcher();
  if (!className || state.isAdmin || !state.uid) return;
  state.forcedQuizRef = state.db.ref('classes/' + className + '/forcedQuiz');
  state.forcedQuizListener = state.forcedQuizRef.on('value', function(snap) {
    var forced = snap.val() || {};
    if (!forced.active || !forced.lobbyCode || String(forced.lessonId || '').indexOf('AP:') === 0) {
      state.forcedQuizCode = null;
      return;
    }
    if (state.forcedQuizCode === forced.lobbyCode && quiz.sessionRef) return;
    state.forcedQuizCode = forced.lobbyCode;
    // Collapse any open fullscreen editor so the quiz is visible
    try { exitAllEditorFullscreens(); } catch(e) {}
    joinQuizByCode(String(forced.lobbyCode), { forced: true, allowLate: true }).catch(function(e) {
      console.warn('Forced quiz join failed:', e.message);
    });
  });
}

document.getElementById('btn-join-quiz-submit').onclick = async function() {
  if (joinInProgress) return;
  var lobbyCode = document.getElementById('input-lobby-code').value.trim().toUpperCase();
  var errEl = document.getElementById('join-quiz-error');
  errEl.classList.add('hidden');
  if (!lobbyCode || lobbyCode.length !== 4) {
    errEl.textContent = 'Please enter a 4-digit code.'; errEl.classList.remove('hidden'); return;
  }

  joinInProgress = true;
  document.getElementById('btn-join-quiz-submit').disabled = true;
  try {
    await joinQuizByCode(lobbyCode, { forced: false, allowLate: true });
    document.getElementById('modal-join-quiz').classList.add('hidden');
  } catch(e) {
    try {
      await joinAssessmentByCode(lobbyCode, { forced: false });
      document.getElementById('modal-join-quiz').classList.add('hidden');
    } catch(apErr) {
      errEl.textContent = apErr.message || e.message || 'Error joining quiz.';
      errEl.classList.remove('hidden');
    }
  }
  joinInProgress = false;
  document.getElementById('btn-join-quiz-submit').disabled = false;
};

async function joinQuizByCode(lobbyCode, opts) {
  opts = opts || {};
  if (!state.uid || state.isAdmin) throw new Error('Students need to be logged in to join a quiz.');
  if (!lobbyCode || String(lobbyCode).length !== 4) throw new Error('Please enter a 4-digit code.');
  if (quiz.sessionRef && quiz.lobbyCode === lobbyCode && !quiz.displaced) {
    return;
  }

  var sessionRef = state.db.ref('quizSessions/' + lobbyCode);
  var snap = await sessionRef.get();
  if (!snap.exists()) throw new Error('No quiz found with that code.');
  if (String(snap.child('lessonId').val() || '').indexOf('AP:') === 0) throw new Error('That code is for an assessment.');
  var sessionState = snap.child('state').val();
  if (sessionState === 'finished') throw new Error('That quiz has already finished.');
  if (!opts.allowLate && sessionState !== 'lobby') throw new Error('No open lobby found with that code.');

  if (quiz.sessionRef && quiz.lobbyCode !== lobbyCode) {
    exitStudentQuiz({ removePlayer: false, keepForced: true });
  }

  var playerRef = sessionRef.child('players/' + state.uid);
  var playerData = {
    joinedAt: Date.now(),
    kicked: false,
    activeClientId: state.quizClientId,
    lastSeenAt: Date.now(),
    forced: !!opts.forced
  };
  var result = await playerRef.transaction(function(current) {
    if (current && current.kicked && !opts.forced) return;
    return Object.assign({}, current || {}, playerData);
  });

  if (!result.committed) throw new Error('You cannot rejoin this quiz right now.');

  // Prune stale Drive folder caches from previous quizzes, then cache this
  // session's folders while Firebase is live (before the 30s cleanup timer fires).
  if (window.drivePruneQuizFolderCache) window.drivePruneQuizFolderCache(lobbyCode);
  if (window.driveSaveQuizFolders) {
    var snapFolders = snap.child('studentFolders').val();
    if (snapFolders) {
      window.driveSaveQuizFolders(lobbyCode, {
        sessionFolderId: snap.child('driveFolderId').val() || null,
        studentFolders:  snapFolders
      });
    }
  }

  quiz.lobbyCode  = lobbyCode;
  quiz.sessionRef = sessionRef;
  quiz.myScore    = 0;
  quiz.myAnswered = false;
  quiz.myScored   = {};
  quiz.forced     = !!opts.forced || snap.child('forced').val() === true;
  quiz.displaced  = false;
  quiz.currentStudentQuestionKey = null;
  quiz.currentStudentRevealKey = null;
  quiz.currentStudentVotingKey = null;
  quiz.currentStudentShowcaseKey = null;
  var joinedQuestions = snap.val().questions || [];
  showStudentScreen(lobbyCode, Array.isArray(joinedQuestions) ? joinedQuestions : Object.values(joinedQuestions), { forced: quiz.forced });
}

document.getElementById('btn-join-quiz-cancel').onclick = function() {
  document.getElementById('modal-join-quiz').classList.add('hidden');
};

// ── STUDENT: Screen ────────────────────────────────────────────
function setStudentView(view) {
  ['lobby','kicked','question','reveal','voting','showcase','finished'].forEach(function(v) {
    document.getElementById('qs-' + v).classList.toggle('hidden', v !== view);
  });
}

function updateForcedQuizChrome() {
  var exitBtn = document.getElementById('btn-quiz-student-exit');
  var homeBtn = document.getElementById('btn-quiz-student-home');
  if (exitBtn) exitBtn.classList.toggle('hidden', !!quiz.forced);
  if (homeBtn) homeBtn.classList.toggle('hidden', !!quiz.forced);
}

function showQuizDisplacedMessage() {
  document.getElementById('quiz-student-screen').classList.remove('hidden');
  ['lobby','kicked','question','reveal','voting','showcase','finished'].forEach(function(v) {
    document.getElementById('qs-' + v).classList.add('hidden');
  });
  var lobby = document.getElementById('qs-lobby');
  lobby.classList.remove('hidden');
  lobby.innerHTML =
    '<div class="text-5xl mb-4">&#x1F5A5;</div>' +
    '<h2 class="text-xl font-bold mb-2">Quiz moved to another tab</h2>' +
    '<p class="text-gray-400 text-sm">This tab has been disconnected because the quiz was opened somewhere else.</p>';
}


function showStudentScreen(lobbyCode, questions, opts) {
  opts = opts || {};
  quiz.questions = questions;
  quiz.forced = !!opts.forced;
  quiz.displaced = false;
  // Does this quiz need Google Drive? (submission or voting with file-based types)
  var DRIVE_Q_TYPES = { canvas: 1, pixel_art: 1, blockbench_share: 1, pyscratch_share: 1, tshirt: 1, tshirt_contest: 1, blockbench_contest: 1 };
  var needsDrive = Array.isArray(questions) && questions.some(function(q) {
    return q && DRIVE_Q_TYPES[q.type];
  });

  document.getElementById('qs-lobby').innerHTML =
    '<div class="text-5xl mb-4">&#x23F3;</div>' +
    '<h2 class="text-xl font-bold mb-2">You are in the lobby!</h2>' +
    '<p class="text-gray-400 text-sm">Wait for your teacher to start the quiz&#x2026;</p>' +
    (needsDrive ? '<p id="qs-lobby-drive-status" class="text-gray-500 text-xs mt-3"></p>' : '') +
    '<p id="qs-my-code" class="text-gray-500 text-xs mt-4"></p>';
  document.getElementById('quiz-student-screen').classList.remove('hidden');
  document.getElementById('qs-my-code').textContent = 'Your code: ' + state.uid;
  updateForcedQuizChrome();
  setStudentView('lobby');

  // Prompt for Google sign-in now so students are ready before the first Drive question.
  // driveEnsureStudentToken resolves immediately if already signed in (no modal shown).
  if (needsDrive && window.driveEnsureStudentToken) {
    var driveStatusEl = document.getElementById('qs-lobby-drive-status');
    window.driveEnsureStudentToken(driveStatusEl).catch(function() {
      // Non-fatal — the submission/voting flows will re-prompt if needed.
    });
  }

  var sessionRef = state.db.ref('quizSessions/' + lobbyCode);
  if (tshirtContestHasContest(questions)) {
    startStudentTshirtContestCacheSync(sessionRef, lobbyCode, questions);
  } else {
    tshirtContestPruneCaches(null);
  }
  if (blockbenchContestHasContest(questions)) {
    startStudentBlockbenchContestCacheSync(sessionRef, lobbyCode, questions);
  } else {
    blockbenchContestPruneCaches(null);
  }

  // If the same student opens the quiz in a newer tab, that newer tab owns the
  // session. The old tab stops listening and shows a disconnected message.
  var activeClientRef = sessionRef.child('players/' + state.uid + '/activeClientId');
  var activeClientListener = activeClientRef.on('value', function(snap) {
    var activeClientId = snap.val();
    if (activeClientId && activeClientId !== state.quizClientId) {
      quiz.displaced = true;
      exitStudentQuiz({ removePlayer: false, displaced: true, keepForced: true });
    }
  });
  quiz.unsubscribers.push(function() { activeClientRef.off('value', activeClientListener); });

  // Listen to kicked state
  var kickedRef = sessionRef.child('players/' + state.uid + '/kicked');
  var kickedListener = kickedRef.on('value', function(snap) {
    if (snap.val() === true) setStudentView('kicked');
  });
  quiz.unsubscribers.push(function() { kickedRef.off('value', kickedListener); });

  // Listen only to the narrow fields that drive state transitions — avoids
  // downloading the full session (including all player answers) on every submission.
  var latestQzState = null;
  var latestQIdx = 0;
  var stateReady = false;
  var qIdxReady = false;

  function handleQuizStateChange() {
    if (!stateReady || !qIdxReady) return; // Wait for both listeners to fire once
    var qzState = latestQzState;
    var qIdx = latestQIdx;

    if (qzState === null) {
      // Session may have been deleted
      if (quiz.missingSessionTimer) return;
      quiz.missingSessionTimer = setTimeout(function() {
        var stillThisQuiz = quiz.sessionRef && quiz.sessionRef.toString() === sessionRef.toString();
        quiz.missingSessionTimer = null;
        if (!stillThisQuiz) return;
        sessionRef.get().then(function(latest) {
          if (!latest.exists()) exitStudentQuiz({ removePlayer: false });
        }).catch(function() {});
      }, 3000);
      return;
    }
    if (quiz.missingSessionTimer) { clearTimeout(quiz.missingSessionTimer); quiz.missingSessionTimer = null; }

    if (qzState === 'lobby') {
      quiz.currentStudentQuestionKey = null;
      quiz.currentStudentRevealKey = null;
      quiz.currentStudentContestKey = null;
      setStudentView('lobby');
    } else if (qzState === 'question') {
      // Fetch only the small fields we need — not the full session
      Promise.all([
        sessionRef.child('questionStart').get(),
        sessionRef.child('questionDuration').get(),
        sessionRef.child('answers/' + qIdx + '/' + state.uid).get(),
      ]).then(function(snaps) {
        var questionStart    = snaps[0].val();
        var questionDuration = snaps[1].val();
        var myAnswered       = snaps[2].exists();
        var questionKey = qIdx + ':' + questionStart;
        if (quiz.currentStudentQuestionKey !== questionKey) {
          quiz.currentStudentQuestionKey = questionKey;
          quiz.currentStudentRevealKey = null;
          quiz.myAnswered = myAnswered;
          // questions were passed on join; fall back to a one-time fetch if missing
          if (quiz.questions && quiz.questions[qIdx]) {
            renderStudentQuestion(qIdx, questionStart, questionDuration);
            if (myAnswered) lockStudentAnswers();
          } else {
            sessionRef.child('questions').get().then(function(qSnap) {
              if (qSnap.exists()) quiz.questions = Object.values(qSnap.val());
              renderStudentQuestion(qIdx, questionStart, questionDuration);
              if (myAnswered) lockStudentAnswers();
            });
          }
        }
      });
    } else if (qzState === 'answer') {
      quiz.currentStudentQuestionKey = null;
      if (quiz.currentStudentRevealKey !== String(qIdx)) {
        quiz.currentStudentRevealKey = String(qIdx);
        var q = quiz.questions && quiz.questions[qIdx];
        if (q) {
          renderStudentReveal(q, qIdx);
        } else {
          sessionRef.child('questions').get().then(function(qSnap) {
            if (qSnap.exists()) quiz.questions = Object.values(qSnap.val());
            renderStudentReveal(quiz.questions[qIdx], qIdx);
          });
        }
      }
    } else if (qzState === 'voting') {
      quiz.currentStudentQuestionKey = null;
      quiz.currentStudentRevealKey = null;
      if (quiz.currentStudentVotingKey !== String(qIdx)) {
        quiz.currentStudentVotingKey = String(qIdx);
        quiz.currentStudentShowcaseKey = null;
        renderStudentVoting(qIdx);
      }
    } else if (qzState === 'showcase') {
      quiz.currentStudentQuestionKey = null;
      quiz.currentStudentRevealKey = null;
      quiz.currentStudentVotingKey = null;
      if (quiz.currentStudentShowcaseKey !== String(qIdx)) {
        quiz.currentStudentShowcaseKey = String(qIdx);
        renderStudentShowcase(qIdx);
      }
    } else if (typeof isTshirtContestState === 'function' && isTshirtContestState(qzState)) {
      quiz.currentStudentQuestionKey = null;
      quiz.currentStudentRevealKey = null;
      quiz.currentStudentVotingKey = null;
      quiz.currentStudentShowcaseKey = null;
      Promise.all([
        sessionRef.child('questionStart').get(),
        sessionRef.child('questionDuration').get(),
        sessionRef.child('tshirtContest/roundIndex').get()
      ]).then(function(snaps) {
        var questionStart = snaps[0].val() || 0;
        var duration = snaps[1].val() || 30;
        var roundIndex = snaps[2].val();
        var contestKey = [qzState, qIdx, questionStart, roundIndex].join(':');
        if (quiz.currentStudentContestKey !== contestKey) {
          quiz.currentStudentContestKey = contestKey;
          renderStudentTshirtContest(qzState, qIdx, questionStart, duration);
        }
      });
    } else if (typeof isBlockbenchContestState === 'function' && isBlockbenchContestState(qzState)) {
      quiz.currentStudentQuestionKey = null;
      quiz.currentStudentRevealKey = null;
      quiz.currentStudentVotingKey = null;
      quiz.currentStudentShowcaseKey = null;
      Promise.all([
        sessionRef.child('questionStart').get(),
        sessionRef.child('questionDuration').get(),
        sessionRef.child('blockbenchContest/roundIndex').get()
      ]).then(function(snaps) {
        var questionStart = snaps[0].val() || 0;
        var duration = snaps[1].val() || 30;
        var roundIndex = snaps[2].val();
        var contestKey = [qzState, qIdx, questionStart, roundIndex].join(':');
        if (quiz.currentStudentContestKey !== contestKey) {
          quiz.currentStudentContestKey = contestKey;
          renderStudentBlockbenchContest(qzState, qIdx, questionStart, duration);
        }
      });
    } else if (qzState === 'finished') {
      quiz.currentStudentQuestionKey = null;
      quiz.currentStudentRevealKey = null;
      quiz.currentStudentContestKey = null;
      quiz.forced = false;
      updateForcedQuizChrome();
      setStudentView('finished');
      var isContestQuiz = (quiz.questions || []).some(function(q) { return q && (q.type === 'tshirt_contest' || q.type === 'blockbench_contest'); });
      var contestItem = studentTshirtContestCurrentItem();
      document.getElementById('qs-final-score').textContent = isContestQuiz
        ? (blockbenchContestHasContest(quiz.questions) ? 'Blockbench contest complete!' : contestItem.itemLabel + ' contest complete!')
        : ('You scored ' + quiz.myScore + ' / ' + quizMaxScore(quiz.questions));
      sessionRef.child('leaderboard').get().then(function(lb) {
        if (lb.exists()) renderStudentLeaderboard(lb.val());
      });
      quiz.unsubscribers.forEach(function(fn) { fn(); });
      quiz.unsubscribers = [];
    }
  }

  var stateChildRef = sessionRef.child('state');
  var qIdxChildRef  = sessionRef.child('questionIdx');
  var stateChildListener = stateChildRef.on('value', function(snap) {
    latestQzState = snap.val();
    stateReady = true;
    handleQuizStateChange();
  });
  var qIdxChildListener = qIdxChildRef.on('value', function(snap) {
    latestQIdx = snap.val() || 0;
    qIdxReady = true;
    handleQuizStateChange();
  });
  quiz.unsubscribers.push(function() {
    stateChildRef.off('value', stateChildListener);
    qIdxChildRef.off('value', qIdxChildListener);
  });
}

function sbLogDevice() {
  if (sbLogDevice._done) return;
  sbLogDevice._done = true;
  console.log('[ScratchBlocks device] dpr=' + window.devicePixelRatio +
    ' screen=' + screen.width + 'x' + screen.height +
    ' inner=' + window.innerWidth + 'x' + window.innerHeight +
    ' ua=' + navigator.userAgent.slice(0, 120));
  if (window.document && document.fonts) {
    console.log('[ScratchBlocks device] fonts.status=' + document.fonts.status);
  }
  // Check whether scratchblocks' injected CSS is actually being applied
  try {
    var probe = document.createElement('span');
    probe.className = 'sb3-label';
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    var pcs = getComputedStyle(probe);
    console.log('[ScratchBlocks device] .sb3-label computed: font-family=' + pcs.fontFamily +
      ' font-weight=' + pcs.fontWeight + ' font-size=' + pcs.fontSize +
      ' (if font-family is serif/sans-serif only, scratchblocks CSS did NOT load)');
    document.body.removeChild(probe);
  } catch(e) {}
  // Canvas font resolution — shows which fallback the browser actually uses for measurement
  try {
    var c = document.createElement('canvas').getContext('2d');
    c.font = '500 12pt Helvetica Neue, Helvetica, sans-serif';
    var resolved = c.font;
    var w1 = c.measureText('if <> then').width;
    console.log('[ScratchBlocks device] canvas resolved font: "' + resolved + '"');
    console.log('[ScratchBlocks device] canvas measureText("if <> then")=' + w1.toFixed(1) + 'px');
  } catch(e) {}
  // aspect-ratio CSS support check
  console.log('[ScratchBlocks device] aspect-ratio CSS supported: ' + ('aspectRatio' in document.documentElement.style));
}

function sbLogSvg(svg, label) {
  var vb = svg.getAttribute('viewBox');
  var w  = svg.getAttribute('width');
  var h  = svg.getAttribute('height');
  console.log('[ScratchBlocks ' + label + '] viewBox="' + vb + '" attr w=' + w + ' h=' + h);
  requestAnimationFrame(function() {
    var texts = svg.querySelectorAll('text');
    var tInfo = 'no <text>';
    if (texts.length) {
      var tcs = getComputedStyle(texts[0]);
      tInfo = 'font-family=' + tcs.fontFamily +
              ' font-weight=' + tcs.fontWeight +
              ' font-size=' + tcs.fontSize;
    }
    console.log('[ScratchBlocks ' + label + '] rendered offsetW=' + svg.offsetWidth +
      ' offsetH=' + svg.offsetHeight + ' aspectRatio=' + svg.style.aspectRatio +
      ' | text[0]: ' + tInfo);
  });
}

function renderTextWithBlocks(el, text) {
  var str = String(text || '');
  if (!window.scratchblocks || str.indexOf('<sb>') === -1) {
    safeText(el, text);
    return;
  }
  el.innerHTML = '';
  var parts = str.split(/(<sb>[\s\S]*?<\/sb>)/);
  parts.forEach(function(part) {
    var match = part.match(/^<sb>([\s\S]*?)<\/sb>$/);
    if (match) {
      try {
        var script = scratchblocks.parse(match[1], { style: 'scratch3' });
        var svg = scratchblocks.render(script, { style: 'scratch3' });
        sbLogDevice();
        sbLogSvg(svg, 'sb-inline');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.display        = 'inline-block';
        svg.style.height         = '2em';
        svg.style.width          = 'auto';
        svg.style.verticalAlign  = 'middle';
        svg.style.overflow       = 'hidden';
        svg.style.pointerEvents  = 'none';
        svg.style.fontWeight     = 'normal';
        svg.style.fontStyle      = 'normal';
        el.appendChild(svg);
      } catch(e) {
        console.error('[ScratchBlocks sb-inline] render error:', e);
        el.appendChild(document.createTextNode(match[1]));
      }
    } else if (part) {
      var lines = part.split('\n');
      lines.forEach(function(line, i) {
        if (i > 0) el.appendChild(document.createElement('br'));
        if (line) el.appendChild(document.createTextNode(line));
      });
    }
  });
}

function safeText(el, text) {
  // Questions use \n\n to separate the question from the code snippet.
  // Render the code part in monospace for readability.
  var str = String(text || '');
  var parts = str.split('\n\n');
  if (parts.length >= 2) {
    // First part: question text; rest: code snippet
    var questionText = parts[0];
    var codeText = parts.slice(1).join('\n\n');
    el.innerHTML =
      '<span>' + questionText.replace(/\n/g, '<br>') + '</span>' +
      '<pre class="mt-3 bg-gray-700/60 rounded-lg px-4 py-3 text-left text-sm font-mono text-green-300 whitespace-pre-wrap">' +
      codeText.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
      '</pre>';
  } else {
    el.innerHTML = str.replace(/\n/g, '<br>');
  }
}

function ensureQuizSpreadsheetAssets(cb) {
  function addCss(u) {
    if (!document.querySelector('link[href="' + u + '"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = u;
      document.head.appendChild(l);
    }
  }
  function addScript(u, done) {
    var existing = document.querySelector('script[data-jhncc-src="' + u + '"]');
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1') done();
      else existing.addEventListener('load', done, { once: true });
      return;
    }
    var s = document.createElement('script');
    s.setAttribute('data-jhncc-src', u);
    s.src = u;
    s.onload = function() { s.setAttribute('data-loaded', '1'); done(); };
    s.onerror = function() {
      var fb = document.getElementById('qs-spreadsheet-feedback');
      if (fb) fb.textContent = 'The spreadsheet tool could not load. Please refresh and try again.';
    };
    document.head.appendChild(s);
  }
  addCss('assets/css/jsuites.css');
  addCss('assets/css/jspreadsheet.css');
  addScript('assets/js/jsuites.js', function() {
    addScript('assets/js/jspreadsheet.js', function() {
      addScript('assets/js/jspreadsheet-formula-bar.js?v=27', function() {
        addScript('assets/js/jspreadsheet-chart.js?v=2', cb);
      });
    });
  });
}

function quizSpreadsheetCellToCoords(cell) {
  var m = String(cell || '').toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
  if (!m) return null;
  var x = 0;
  for (var i = 0; i < m[1].length; i++) x = x * 26 + (m[1].charCodeAt(i) - 64);
  return { x: x - 1, y: parseInt(m[2], 10) - 1 };
}

function renderQuizSpreadsheetTask(qIdx, q) {
  quiz.currentSpreadsheet = null;
  var holder = document.getElementById('qs-spreadsheet-sheet');
  var fb = document.getElementById('qs-spreadsheet-feedback');
  var btn = document.getElementById('btn-quiz-submit-spreadsheet');
  holder.innerHTML = '';
  fb.textContent = 'Loading spreadsheet...';
  btn.disabled = true;
  btn.onclick = null;
  ensureQuizSpreadsheetAssets(function() {
    holder.innerHTML = '';
    // Remove any toolbar / formula-bar siblings left over from a previous init.
    // These are inserted as siblings (not children) of holder, so innerHTML = ''
    // does not remove them — they must be cleaned up explicitly.
    (function() {
      var prev = holder.previousElementSibling;
      while (prev && prev.classList &&
             (prev.classList.contains('jhncc-toolbar') || prev.classList.contains('jhncc-fbar'))) {
        var toRemove = prev;
        prev = prev.previousElementSibling;
        toRemove.parentNode.removeChild(toRemove);
      }
    })();
    var columns = Array.isArray(q.columns) && q.columns.length ? q.columns : null;
    if (!columns && Array.isArray(q.sheetData) && q.sheetData[0]) {
      columns = q.sheetData[0].map(function() { return { width: 120 }; });
    }
    var sheet = jspreadsheet(holder, {
      data: q.sheetData || [['']],
      columns: columns,
      minDimensions: [
        Math.max((q.sheetData && q.sheetData[0] && q.sheetData[0].length) || 1, q.minColumns || 1),
        Math.max((q.sheetData && q.sheetData.length) || 1, q.minRows || 1)
      ],
      tableOverflow: true,
      tableWidth: '100%',
      toolbar: false,
      about: false
    });
    if (typeof JHNCCAddFormulaBar === 'function') JHNCCAddFormulaBar(holder, sheet);
    if (typeof JHNCCAddFormatToolbar === 'function') JHNCCAddFormatToolbar(holder, sheet);
    if (typeof JHNCCAddSheetTabs === 'function') JHNCCAddSheetTabs(holder, sheet);
    // If the question defines a chart config, render a live chart below the sheet
    if (q.chart && typeof JHNCCAddChart === 'function') {
      JHNCCAddChart(holder, sheet, q.chart);
    }
    var firstCheck = Array.isArray(q.checks) && q.checks.length ? quizSpreadsheetCellToCoords(q.checks[0].cell) : null;
    if (firstCheck && typeof sheet.updateSelectionFromCoords === 'function') {
      setTimeout(function() {
        try {
          sheet.updateSelectionFromCoords(firstCheck.x, firstCheck.y, firstCheck.x, firstCheck.y);
        } catch(e) {}
      }, 0);
    }
    quiz.currentSpreadsheet = { sheet: sheet, question: q };
    fb.textContent = 'Complete the spreadsheet task, then submit.';
    btn.disabled = false;
    btn.onclick = function() { submitStudentSpreadsheetAnswer(qIdx); };
  });
}

// ── Canvas drawing question ────────────────────────────────────

function initCanvasQuestion(qIdx, q) {
  var canvasEl  = document.getElementById('qs-canvas-el');
  var colorPick = document.getElementById('qs-canvas-color');
  var sizePick  = document.getElementById('qs-canvas-size');
  var eraserBtn = document.getElementById('qs-canvas-eraser');
  var clearBtn  = document.getElementById('qs-canvas-clear');
  var submitBtn = document.getElementById('btn-quiz-submit-canvas');
  var feedback  = document.getElementById('qs-canvas-feedback');

  // Resize canvas to its CSS width
  canvasEl.width  = q.canvasWidth  || canvasEl.offsetWidth  || 680;
  canvasEl.height = q.canvasHeight || 400;

  var ctx = canvasEl.getContext('2d');
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  var drawing  = false;
  var erasing  = false;

  function getPos(e) {
    var rect = canvasEl.getBoundingClientRect();
    var scaleX = canvasEl.width  / rect.width;
    var scaleY = canvasEl.height / rect.height;
    var src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing = true;
    var p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function moveDraw(e) {
    e.preventDefault();
    if (!drawing) return;
    var p = getPos(e);
    ctx.lineWidth   = parseInt(sizePick.value) || 6;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = erasing ? '#111827' : colorPick.value;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  var _canvasSaveTimer = null;
  var _canvasStorageKey = 'qlc_' + (quiz.lobbyCode || '') + '_' + qIdx;
  function stopDraw(e) {
    drawing = false;
    // Debounce-save canvas to localStorage — restores after a page refresh
    clearTimeout(_canvasSaveTimer);
    _canvasSaveTimer = setTimeout(function() {
      try { localStorage.setItem(_canvasStorageKey, canvasEl.toDataURL('image/png')); } catch(_e) {}
    }, 500);
  }

  // Remove old listeners by replacing the element clone
  var fresh = canvasEl.cloneNode(true);
  canvasEl.parentNode.replaceChild(fresh, canvasEl);
  canvasEl = document.getElementById('qs-canvas-el');
  // Re-draw background on fresh clone
  var ctx2 = canvasEl.getContext('2d');
  ctx2.fillStyle = '#111827';
  ctx2.fillRect(0, 0, canvasEl.width, canvasEl.height);
  ctx = ctx2;

  // Restore saved drawing if student refreshed mid-question
  (function() {
    var saved = !quiz.myAnswered && localStorage.getItem(_canvasStorageKey);
    if (!saved) return;
    var img = new Image();
    img.onload = function() { try { ctx.drawImage(img, 0, 0); } catch(e) {} };
    img.src = saved;
  })();

  canvasEl.addEventListener('mousedown',  startDraw);
  canvasEl.addEventListener('mousemove',  moveDraw);
  canvasEl.addEventListener('mouseup',    stopDraw);
  canvasEl.addEventListener('mouseleave', stopDraw);
  canvasEl.addEventListener('touchstart', startDraw, { passive: false });
  canvasEl.addEventListener('touchmove',  moveDraw,  { passive: false });
  canvasEl.addEventListener('touchend',   stopDraw);

  eraserBtn.onclick = function() {
    erasing = !erasing;
    eraserBtn.style.background = erasing ? '#f87171' : '#334155';
    eraserBtn.style.color      = erasing ? '#fff'    : '#cbd5e1';
  };
  clearBtn.onclick = function() {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    try { localStorage.setItem(_canvasStorageKey, canvasEl.toDataURL('image/png')); } catch(_e) {}
  };

  feedback.textContent = '';
  submitBtn.disabled  = false;
  submitBtn.onclick   = function() { submitCanvasAnswer(qIdx, canvasEl, feedback, submitBtn); };
}

async function submitCanvasAnswer(qIdx, canvasEl, feedback, submitBtn) {
  submitBtn.disabled = true;
  feedback.textContent = 'Connecting to Google Drive…';
  feedback.style.color = '#94a3b8';

  // Ensure student Drive token first — keep re-prompting until all scopes granted
  var token;
  try {
    token = await window.driveEnsureStudentToken(feedback);
  } catch (e) {
    feedback.textContent = '❌ Google Drive access is required to submit. ' + e.message;
    feedback.style.color = '#f87171';
    submitBtn.disabled = false;
    return;
  }

  // Look up the student's own subfolder using their Google email
  var studentEmail = window.driveStudentEmail && window.driveStudentEmail();
  if (!studentEmail) {
    feedback.textContent = '❌ Could not determine your Google account email.';
    feedback.style.color = '#f87171';
    submitBtn.disabled = false;
    return;
  }

  feedback.textContent = 'Finding your folder…';
  var folderId;
  try {
    folderId = await window.driveLookupStudentFolder(quiz.sessionRef);
  } catch (e) {
    feedback.textContent = '❌ Could not load session data: ' + e.message;
    feedback.style.color = '#f87171';
    submitBtn.disabled = false;
    return;
  }
  if (!folderId) {
    feedback.textContent = '❌ No folder found for your account (' + studentEmail + '). ' +
      'Check your teacher set up this quiz with your class.';
    feedback.style.color = '#f87171';
    submitBtn.disabled = false;
    return;
  }

  // Convert canvas to PNG blob
  feedback.textContent = 'Uploading…';
  var blob = await new Promise(function(resolve) { canvasEl.toBlob(resolve, 'image/png'); });
  var filename = String(state.uid || 'student') + '.png';

  var fileResult;
  try {
    fileResult = await Promise.race([
      window.driveUploadFile(folderId, filename, blob, 'image/png', token),
      new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('Upload timed out — tap Submit again.')); }, 45000);
      })
    ]);
  } catch (e) {
    feedback.textContent = '❌ Upload failed: ' + e.message;
    feedback.style.color = '#f87171';
    submitBtn.disabled = false;
    return;
  }

  // Store file ID as the answer in Firebase
  try {
    await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
      fileId:   fileResult.id,
      fileName: fileResult.name,
      submittedAt: Date.now()
    });
    quiz.myAnswered = true;
    feedback.textContent = '✓ Drawing submitted!';
    feedback.style.color = '#4ade80';
    lockStudentAnswers();
    // Clear saved canvas now that the submission succeeded
    try { localStorage.removeItem('qlc_' + (quiz.lobbyCode || '') + '_' + qIdx); } catch(_e) {}
  } catch (e) {
    feedback.textContent = '❌ Could not save answer: ' + e.message;
    feedback.style.color = '#f87171';
    submitBtn.disabled = false;
  }
}

async function submitStudentPyScratchShare(qIdx, submitBtn, feedbackEl) {
  if (quiz.myAnswered) return;
  submitBtn.disabled = true;
  if (feedbackEl) { feedbackEl.textContent = 'Connecting to Google Drive…'; feedbackEl.style.color = '#94a3b8'; }

  // 1. Drive auth
  var token;
  try {
    token = await window.driveEnsureStudentToken(feedbackEl);
  } catch (e) {
    if (feedbackEl) { feedbackEl.textContent = '❌ ' + e.message; feedbackEl.style.color = '#f87171'; }
    submitBtn.disabled = false; return;
  }

  // 2. Student email / folder
  var studentEmail = window.driveStudentEmail && window.driveStudentEmail();
  if (!studentEmail) {
    if (feedbackEl) { feedbackEl.textContent = '❌ Could not get your Google email.'; feedbackEl.style.color = '#f87171'; }
    submitBtn.disabled = false; return;
  }
  if (feedbackEl) { feedbackEl.textContent = 'Finding your folder…'; feedbackEl.style.color = '#94a3b8'; }
  var folderId;
  try { folderId = await window.driveLookupStudentFolder(quiz.sessionRef); }
  catch (e) {
    if (feedbackEl) { feedbackEl.textContent = '❌ ' + e.message; feedbackEl.style.color = '#f87171'; }
    submitBtn.disabled = false; return;
  }
  if (!folderId) {
    if (feedbackEl) { feedbackEl.textContent = '❌ No folder found for your account (' + studentEmail + ').'; feedbackEl.style.color = '#f87171'; }
    submitBtn.disabled = false; return;
  }

  // 3. Export SB3 from PyScratch iframe
  if (feedbackEl) { feedbackEl.textContent = 'Saving your game…'; feedbackEl.style.color = '#94a3b8'; }
  var frame = document.getElementById('qs-pyscratch-frame');
  var blob;
  try {
    blob = await new Promise(function(resolve, reject) {
      var t = setTimeout(function() {
        window.removeEventListener('message', handler);
        reject(new Error('Export timed out — try again.'));
      }, 12000);
      function handler(ev) {
        if (!ev.data) return;
        if (ev.data.type === 'PS_EXPORT_SB3_RESULT') {
          clearTimeout(t); window.removeEventListener('message', handler);
          resolve(new Blob([ev.data.buffer], { type: 'application/zip' }));
        }
        if (ev.data.type === 'PS_EXPORT_SB3_ERROR') {
          clearTimeout(t); window.removeEventListener('message', handler);
          reject(new Error(ev.data.error || 'Export failed'));
        }
      }
      window.addEventListener('message', handler);
      try { frame.contentWindow.postMessage({ type: 'PS_EXPORT_SB3' }, '*'); }
      catch (e) { clearTimeout(t); window.removeEventListener('message', handler); reject(e); }
    });
  } catch (e) {
    if (feedbackEl) { feedbackEl.textContent = '❌ ' + e.message; feedbackEl.style.color = '#f87171'; }
    submitBtn.disabled = false; return;
  }

  // 4. Upload to Drive
  if (feedbackEl) { feedbackEl.textContent = 'Uploading…'; feedbackEl.style.color = '#94a3b8'; }
  var filename = String(state.uid || 'student') + '.sb3';
  var fileResult;
  try { fileResult = await window.driveUploadFile(folderId, filename, blob, 'application/zip', token); }
  catch (e) {
    if (feedbackEl) { feedbackEl.textContent = '❌ Upload failed: ' + e.message; feedbackEl.style.color = '#f87171'; }
    submitBtn.disabled = false; return;
  }

  // 5. Store in Firebase
  try {
    await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
      fileId: fileResult.id, fileName: fileResult.name,
      submittedAt: Date.now()
    });
    quiz.myAnswered = true;
    if (feedbackEl) { feedbackEl.textContent = '✓ Game submitted!'; feedbackEl.style.color = '#4ade80'; }
    lockStudentAnswers();
    submitBtn.textContent = '✓ Submitted';
  } catch (e) {
    if (feedbackEl) { feedbackEl.textContent = '❌ Could not save answer: ' + e.message; feedbackEl.style.color = '#f87171'; }
    submitBtn.disabled = false;
  }
}

function tshirtContestSlots(correct) {
  correct = Math.max(0, Number(correct) || 0);
  return Math.max(0, Math.floor(Math.log(correct + 1) / Math.log(2)));
}

function tshirtContestValues(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj.filter(function(x) { return x != null; }) : Object.keys(obj).map(function(k) { return obj[k]; }).filter(function(x) { return x != null; });
}

function tshirtContestSubmissionBlocked(submission) {
  return !!(submission && submission.blocked === true);
}

function studentTshirtContestItemConfig(q) {
  q = q || {};
  var key = String(q.itemType || q.clothingType || q.garmentType || q.templateKind || 'tshirt').toLowerCase();
  var items = {
    tshirt: {
      itemType: 'tshirt',
      templateUrl: 'assets/byte-brawlers/tshirt.png',
      fileSlug: 'tshirt',
      itemLabel: 'T-shirt',
      itemLabelLower: 'T-shirt',
      itemPluralLabel: 'T-shirt designs',
      itemDesignLabel: 'T-shirt design',
      contestTitle: 'Byte Brawlers T-shirt Contest'
    },
    jeans: {
      itemType: 'jeans',
      templateUrl: 'assets/byte-brawlers/jeans.png',
      fileSlug: 'jeans',
      itemLabel: 'Jeans',
      itemLabelLower: 'jeans',
      itemPluralLabel: 'jeans designs',
      itemDesignLabel: 'jeans design',
      contestTitle: 'Byte Brawlers Jeans Contest'
    },
    baseballcap: {
      itemType: 'baseballcap',
      templateUrl: 'assets/byte-brawlers/baseballcap.png',
      fileSlug: 'baseballcap',
      itemLabel: 'Baseball Cap',
      itemLabelLower: 'baseball cap',
      itemPluralLabel: 'baseball cap designs',
      itemDesignLabel: 'baseball cap design',
      contestTitle: 'Byte Brawlers Baseball Cap Contest'
    }
  };
  var item = items[key] || items.tshirt;
  return {
    itemType: item.itemType,
    templateUrl: q.templateUrl || item.templateUrl,
    fileSlug: q.fileSlug || item.fileSlug,
    itemLabel: q.itemLabel || item.itemLabel,
    itemLabelLower: q.itemLabelLower || item.itemLabelLower,
    itemPluralLabel: q.itemPluralLabel || item.itemPluralLabel,
    itemDesignLabel: q.itemDesignLabel || item.itemDesignLabel,
    contestTitle: q.contestTitle || q.q || item.contestTitle
  };
}

function studentTshirtContestItemForQuestion(qIdx, contest) {
  if (contest && contest.config) return studentTshirtContestItemConfig(contest.config);
  return studentTshirtContestItemConfig((quiz.questions && quiz.questions[qIdx]) || {});
}

function studentTshirtContestCurrentItem() {
  var q = (quiz.questions || []).find(function(item) { return item && item.type === 'tshirt_contest'; }) || {};
  return studentTshirtContestItemConfig(q);
}

var TSHIRT_CONTEST_CACHE_PREFIX = 'pylearn_tshirt_contest_';

function tshirtContestHasContest(questions) {
  return Array.isArray(questions) && questions.some(function(q) { return q && q.type === 'tshirt_contest'; });
}

function tshirtContestCacheKey(lobbyCode) {
  return TSHIRT_CONTEST_CACHE_PREFIX + String(lobbyCode || '').toUpperCase();
}

function tshirtContestPruneCaches(activeLobbyCode) {
  try {
    if (!window.localStorage) return;
    var keepKey = activeLobbyCode ? tshirtContestCacheKey(activeLobbyCode) : '';
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var key = localStorage.key(i);
      if (key && key.indexOf(TSHIRT_CONTEST_CACHE_PREFIX) === 0 && key !== keepKey) {
        localStorage.removeItem(key);
      }
    }
  } catch(e) {}
}

function tshirtContestSaveCache(lobbyCode, contest) {
  try {
    if (!window.localStorage || !lobbyCode || !contest) return;
    localStorage.setItem(tshirtContestCacheKey(lobbyCode), JSON.stringify({
      savedAt: Date.now(),
      lobbyCode: String(lobbyCode).toUpperCase(),
      contest: tshirtContestBuildCacheContest(contest)
    }));
  } catch(e) {}
}

function tshirtContestLoadCache(lobbyCode) {
  try {
    if (!window.localStorage || !lobbyCode) return null;
    var raw = localStorage.getItem(tshirtContestCacheKey(lobbyCode));
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return parsed && parsed.contest ? parsed.contest : null;
  } catch(e) {
    return null;
  }
}

function tshirtContestBuildCacheContest(contest) {
  contest = contest || {};
  var cleanSubmissions = {};
  Object.keys(contest.submissions || {}).forEach(function(roundKey) {
    cleanSubmissions[roundKey] = {};
    Object.keys(contest.submissions[roundKey] || {}).forEach(function(code) {
      var sub = contest.submissions[roundKey][code] || {};
      if (!sub.fileId) return;
      cleanSubmissions[roundKey][code] = {
        fileId: sub.fileId,
        submittedAt: sub.submittedAt || null,
        blocked: sub.blocked === true,
        blockedAt: sub.blockedAt || null
      };
    });
  });
  return {
    config: contest.config || null,
    roundIndex: contest.roundIndex || 0,
    rounds: contest.rounds || null,
    submissions: cleanSubmissions,
    champion: contest.champion || null,
    finalLeaderboard: contest.finalLeaderboard || null
  };
}

function startStudentTshirtContestCacheSync(sessionRef, lobbyCode, questions) {
  if (!sessionRef || !tshirtContestHasContest(questions)) return;
  if (quiz.studentTshirtContestCacheOff) {
    try { quiz.studentTshirtContestCacheOff(); } catch(e) {}
    quiz.studentTshirtContestCacheOff = null;
  }
  tshirtContestPruneCaches(lobbyCode);
  var contestRef = sessionRef.child('tshirtContest');
  var contestListener = contestRef.on('value', function(snap) {
    var contest = snap.val();
    if (contest) tshirtContestSaveCache(lobbyCode, contest);
  });
  quiz.studentTshirtContestCacheOff = function() {
    contestRef.off('value', contestListener);
    quiz.studentTshirtContestCacheOff = null;
  };
}

async function getStudentTshirtContestData() {
  if (quiz.sessionRef) {
    try {
      var snap = await quiz.sessionRef.child('tshirtContest').get();
      if (snap.exists()) {
        var liveContest = snap.val() || {};
        tshirtContestSaveCache(quiz.lobbyCode, liveContest);
        return liveContest;
      }
    } catch(e) {}
  }
  return tshirtContestLoadCache(quiz.lobbyCode) || {};
}

function isBlockbenchContestState(stateVal) {
  return [
    'blockbench_topics',
    'blockbench_topic_vote',
    'blockbench_draw',
    'blockbench_bracket_vote'
  ].indexOf(stateVal) !== -1;
}

var BLOCKBENCH_CONTEST_CACHE_PREFIX = 'pylearn_blockbench_contest_';

function blockbenchContestHasContest(questions) {
  return Array.isArray(questions) && questions.some(function(q) { return q && q.type === 'blockbench_contest'; });
}

function blockbenchContestSubmissionBlocked(submission) {
  return !!(submission && submission.blocked === true);
}

function blockbenchContestCacheKey(lobbyCode) {
  return BLOCKBENCH_CONTEST_CACHE_PREFIX + String(lobbyCode || '');
}

function blockbenchContestPruneCaches(activeLobbyCode) {
  try {
    var keepKey = activeLobbyCode ? blockbenchContestCacheKey(activeLobbyCode) : '';
    Object.keys(localStorage).forEach(function(key) {
      if (key.indexOf(BLOCKBENCH_CONTEST_CACHE_PREFIX) === 0 && key !== keepKey) localStorage.removeItem(key);
    });
  } catch(e) {}
}

function blockbenchContestSaveCache(lobbyCode, contest) {
  if (!lobbyCode || !contest) return;
  try {
    localStorage.setItem(blockbenchContestCacheKey(lobbyCode), JSON.stringify({
      savedAt: Date.now(),
      contest: blockbenchContestBuildCacheContest(contest)
    }));
  } catch(e) {}
}

function blockbenchContestLoadCache(lobbyCode) {
  try {
    var raw = localStorage.getItem(blockbenchContestCacheKey(lobbyCode));
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return parsed && parsed.contest ? parsed.contest : null;
  } catch(e) {
    return null;
  }
}

function blockbenchContestBuildCacheContest(contest) {
  contest = contest || {};
  var cleanSubmissions = {};
  Object.keys(contest.submissions || {}).forEach(function(roundKey) {
    cleanSubmissions[roundKey] = {};
    Object.keys(contest.submissions[roundKey] || {}).forEach(function(code) {
      var sub = contest.submissions[roundKey][code] || {};
      cleanSubmissions[roundKey][code] = {
        fileId: sub.fileId || '',
        submittedAt: sub.submittedAt || 0,
        blocked: sub.blocked === true,
        blockedAt: sub.blockedAt || null,
        cubeCount: sub.cubeCount || 0
      };
    });
  });
  return {
    config: contest.config || null,
    roundIndex: contest.roundIndex || 0,
    rounds: contest.rounds || null,
    submissions: cleanSubmissions,
    champion: contest.champion || null,
    finalLeaderboard: contest.finalLeaderboard || null
  };
}

function startStudentBlockbenchContestCacheSync(sessionRef, lobbyCode, questions) {
  if (!sessionRef || !blockbenchContestHasContest(questions)) return;
  if (quiz.studentBlockbenchContestCacheOff) {
    try { quiz.studentBlockbenchContestCacheOff(); } catch(e) {}
    quiz.studentBlockbenchContestCacheOff = null;
  }
  blockbenchContestPruneCaches(lobbyCode);
  var contestRef = sessionRef.child('blockbenchContest');
  var contestListener = contestRef.on('value', function(snap) {
    var contest = snap.val();
    if (contest) blockbenchContestSaveCache(lobbyCode, contest);
  });
  quiz.studentBlockbenchContestCacheOff = function() {
    contestRef.off('value', contestListener);
    quiz.studentBlockbenchContestCacheOff = null;
  };
}

async function getStudentBlockbenchContestData() {
  if (quiz.sessionRef) {
    try {
      var snap = await quiz.sessionRef.child('blockbenchContest').get();
      if (snap.exists()) {
        var liveContest = snap.val() || {};
        blockbenchContestSaveCache(quiz.lobbyCode, liveContest);
        return liveContest;
      }
    } catch(e) {}
  }
  return blockbenchContestLoadCache(quiz.lobbyCode) || {};
}

function renderStudentTshirtBlockedSquare(container) {
  if (!container) return;
  container.innerHTML = '<span style="font-weight:700;letter-spacing:0;color:#f8fafc">Blocked by teacher</span>';
  container.style.background = '#000';
  container.style.color = '#f8fafc';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.textAlign = 'center';
}

function tshirtContestHideQuestionPanels() {
  [
    'qs-answer-grid','qs-code-answer','qs-text-answer','qs-widget-answer','qs-scratch-answer',
    'qs-pybot-answer','qs-blockbench-answer','qs-spreadsheet-answer','qs-pyscratch-answer',
    'qs-canvas-answer','qs-pixel-art-answer','qs-tshirt-answer'
  ].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  var answered = document.getElementById('qs-answered-msg');
  if (answered) answered.classList.add('hidden');
  var visual = document.getElementById('qs-q-visual');
  if (visual) { visual.innerHTML = ''; visual.classList.add('hidden'); }
}

function startStudentTshirtContestTimer(questionStart, duration) {
  clearStudentTimer();
  var timerEnd = (questionStart || Date.now()) + (duration || 30) * 1000;
  var key = quiz.currentStudentContestKey;
  function tick() {
    if (quiz.currentStudentContestKey !== key) return;
    var rem = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
    var timer = document.getElementById('qs-timer');
    if (timer) timer.textContent = rem;
    var bar = document.getElementById('qs-timer-bar');
    if (bar) {
      var pct = duration > 0 ? ((timerEnd - Date.now()) / (duration * 1000)) * 100 : 0;
      bar.style.width = Math.max(0, pct) + '%';
      bar.className = 'h-1.5 transition-all ' + (pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500');
    }
    if (rem <= 0) {
      clearStudentTimer();
      document.querySelectorAll('[data-tshirt-live]').forEach(function(el) {
        el.disabled = true;
        el.classList.add('opacity-50');
      });
    }
  }
  tick();
  quiz.studentTimerInterval = setInterval(tick, 500);
}

function setupStudentTshirtContestQuestion(title, progress, questionStart, duration) {
  setStudentView('question');
  tshirtContestHideQuestionPanels();
  document.getElementById('qs-q-progress').textContent = progress || 'Design Contest';
  document.getElementById('qs-q-text').textContent = title || '';
  startStudentTshirtContestTimer(questionStart, duration);
}

function renderStudentTshirtContest(stateVal, qIdx, questionStart, duration) {
  if (stateVal === 'tshirt_binary') {
    renderStudentTshirtBinarySprint(qIdx, questionStart, duration);
  } else if (stateVal === 'tshirt_topics') {
    renderStudentTshirtTopics(qIdx, questionStart, duration);
  } else if (stateVal === 'tshirt_topic_vote') {
    renderStudentTshirtTopicVote(qIdx, questionStart, duration);
  } else if (stateVal === 'tshirt_draw') {
    renderStudentTshirtDraw(qIdx, questionStart, duration);
  } else if (stateVal === 'tshirt_bracket_vote') {
    renderStudentTshirtBracketVote(qIdx, questionStart, duration);
  } else if (stateVal === 'tshirt_round_results') {
    renderStudentTshirtRoundResults(qIdx);
  }
}

function renderStudentTshirtBinarySprint(qIdx, questionStart, duration) {
  setupStudentTshirtContestQuestion('Binary sprint: convert as many 4-bit numbers as you can.', 'Topic slots', questionStart, duration);
  var wrap = document.getElementById('qs-widget-answer');
  var box = document.getElementById('qs-widget-container');
  wrap.classList.remove('hidden');
  box.innerHTML =
    '<div class="text-center">' +
      '<div class="text-sm text-gray-400 mb-2">Each correct answer helps unlock topic slots: 1, 3, 7, 15...</div>' +
      '<div id="tsc-binary-prompt" class="text-5xl font-mono font-bold text-yellow-300 my-5"></div>' +
      '<div id="tsc-binary-grid" class="grid grid-cols-4 gap-2 max-w-md mx-auto"></div>' +
      '<div id="tsc-binary-status" class="mt-4 text-sm text-gray-300"></div>' +
    '</div>';
  var promptEl = document.getElementById('tsc-binary-prompt');
  var grid = document.getElementById('tsc-binary-grid');
  var status = document.getElementById('tsc-binary-status');
  var correct = 0;
  var target = 0;

  function bits(n) { return ('0000' + Number(n).toString(2)).slice(-4); }
  function saveProgress() {
    var slots = tshirtContestSlots(correct);
    if (status) status.textContent = correct + ' correct = ' + slots + ' topic slot' + (slots === 1 ? '' : 's');
    quiz.sessionRef.child('tshirtContest/binary/' + state.uid).set({
      correct: correct,
      slots: slots,
      updatedAt: Date.now()
    }).catch(function(e) { console.warn('[T-shirt contest] binary save failed:', e.message); });
  }
  function nextQuestion() {
    target = Math.floor(Math.random() * 16);
    promptEl.textContent = bits(target);
  }
  function buildButtons() {
    grid.innerHTML = '';
    for (var i = 0; i < 16; i++) {
      (function(n) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.tshirtLive = '1';
        btn.className = 'rounded-lg bg-gray-700 hover:bg-gray-600 active:scale-95 px-4 py-3 text-xl font-bold text-white';
        btn.textContent = n;
        btn.onclick = function() {
          if ((questionStart || Date.now()) + duration * 1000 <= Date.now()) return;
          if (n === target) {
            correct++;
            saveProgress();
            nextQuestion();
          } else {
            status.textContent = 'Not quite. ' + bits(target) + ' is ' + target + '.';
            status.style.color = '#f87171';
            setTimeout(function() { status.style.color = '#cbd5e1'; saveProgress(); }, 650);
            nextQuestion();
          }
        };
        grid.appendChild(btn);
      })(i);
    }
  }
  quiz.sessionRef.child('tshirtContest/binary/' + state.uid).get().then(function(snap) {
    if (snap.exists()) correct = Number(snap.child('correct').val()) || 0;
    saveProgress();
    nextQuestion();
    buildButtons();
  });
}

function renderStudentTshirtTopics(qIdx, questionStart, duration) {
  var item = studentTshirtContestItemForQuestion(qIdx);
  setupStudentTshirtContestQuestion('Write your ' + item.itemLabelLower + ' topics.', 'Topic writing', questionStart, duration);
  var wrap = document.getElementById('qs-widget-answer');
  var box = document.getElementById('qs-widget-container');
  wrap.classList.remove('hidden');
  box.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading your topic slots...</p>';
  Promise.all([
    quiz.sessionRef.child('tshirtContest/binary/' + state.uid).get(),
    quiz.sessionRef.child('tshirtContest/topics/' + state.uid).get()
  ]).then(function(snaps) {
    var slots = Number(snaps[0].child('slots').val()) || 0;
    var existing = snaps[1].val() || {};
    if (slots <= 0) {
      box.innerHTML = '<div class="text-center text-gray-300">You did not unlock a topic slot this time. Wait for the voting stage.</div>';
      return;
    }
    var html =
      '<div class="max-w-lg mx-auto">' +
        '<p class="text-gray-400 text-sm text-center mb-4">You unlocked <strong class="text-yellow-300">' + slots + '</strong> topic slot' + (slots === 1 ? '' : 's') + '.</p>' +
        '<div class="space-y-2">';
    for (var i = 0; i < slots; i++) {
      var old = existing['slot' + i] && existing['slot' + i].text ? existing['slot' + i].text : '';
      html += '<input data-tshirt-live="1" class="tsc-topic-input w-full rounded-lg bg-gray-800 border border-gray-600 px-4 py-3 text-white focus:outline-none focus:border-yellow-400" maxlength="60" value="' + escapeHtml(old) + '" placeholder="Topic ' + (i + 1) + '" />';
    }
    html +=
        '</div>' +
        '<button id="btn-tsc-save-topics" data-tshirt-live="1" class="jhncc-primary w-full mt-4 py-3 rounded-lg font-bold">Submit topics</button>' +
        '<div id="tsc-topic-feedback" class="text-sm text-gray-400 text-center mt-3"></div>' +
      '</div>';
    box.innerHTML = html;
    document.getElementById('btn-tsc-save-topics').onclick = async function() {
      var btn = this;
      var fb = document.getElementById('tsc-topic-feedback');
      var obj = {};
      var count = 0;
      document.querySelectorAll('.tsc-topic-input').forEach(function(input, idx) {
        var text = String(input.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        if (!text) return;
        var key = String(state.uid || 'student').replace(/[.#$/[\]]/g, '_') + '_slot' + idx;
        obj['slot' + idx] = { key: key, text: text, submittedAt: Date.now() };
        count++;
      });
      btn.disabled = true;
      try {
        await quiz.sessionRef.child('tshirtContest/topics/' + state.uid).set(obj);
        fb.textContent = count + ' topic' + (count === 1 ? '' : 's') + ' submitted.';
        fb.style.color = '#4ade80';
        btn.textContent = 'Submitted';
      } catch(e) {
        fb.textContent = 'Could not submit topics: ' + e.message;
        fb.style.color = '#f87171';
        btn.disabled = false;
      }
    };
  });
}

function renderStudentTshirtTopicVote(qIdx, questionStart, duration) {
  setStudentView('voting');
  startStudentTshirtContestTimer(questionStart, duration);
  var voting = document.getElementById('qs-voting');
  var h2 = voting.querySelector('h2');
  var p = voting.querySelector('p');
  if (h2) h2.textContent = 'Vote on topics';
  if (p) p.textContent = 'Use up or down votes. The scores are hidden.';
  var cardEl = document.getElementById('qs-voting-card');
  cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading topics...</p>';
  Promise.all([
    quiz.sessionRef.child('tshirtContest/topics').get(),
    quiz.sessionRef.child('tshirtContest/topicVotes/' + state.uid).get()
  ]).then(function(snaps) {
    var topics = [];
    snaps[0].forEach(function(studentSnap) {
      studentSnap.forEach(function(topicSnap) {
        var text = String(topicSnap.child('text').val() || '').trim();
        var key = topicSnap.child('key').val() || (studentSnap.key + '_' + topicSnap.key);
        if (text) topics.push({ key: key, text: text });
      });
    });
    var votes = snaps[1].val() || {};
    if (!topics.length) {
      cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">No topics were submitted. A default topic will be used.</p>';
      return;
    }
    topics.sort(function(a, b) { return a.text.localeCompare(b.text); });
    cardEl.innerHTML = '<div class="space-y-2">' + topics.map(function(t) {
      var v = Number(votes[t.key]) || 0;
      return '<div class="rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 flex items-center gap-3">' +
        '<div class="flex-1 min-w-0 font-semibold text-white truncate">' + escapeHtml(t.text) + '</div>' +
        '<button data-tshirt-live="1" data-topic-key="' + escapeHtml(t.key) + '" data-vote="1" class="tsc-topic-vote rounded px-3 py-2 font-bold ' + (v > 0 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200') + '">Up</button>' +
        '<button data-tshirt-live="1" data-topic-key="' + escapeHtml(t.key) + '" data-vote="-1" class="tsc-topic-vote rounded px-3 py-2 font-bold ' + (v < 0 ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-200') + '">Down</button>' +
      '</div>';
    }).join('') + '</div>';
    cardEl.querySelectorAll('.tsc-topic-vote').forEach(function(btn) {
      btn.onclick = function() {
        var key = btn.dataset.topicKey;
        var vote = Number(btn.dataset.vote);
        if (Number(votes[key]) === vote) vote = 0;
        votes[key] = vote;
        var ref = quiz.sessionRef.child('tshirtContest/topicVotes/' + state.uid + '/' + key);
        (vote === 0 ? ref.remove() : ref.set(vote)).catch(function(e) { console.warn('[T-shirt contest] topic vote failed:', e.message); });
        renderStudentTshirtTopicVote(qIdx, questionStart, duration);
      };
    });
  });
}

function renderStudentTshirtDraw(qIdx, questionStart, duration) {
  var drawItem = studentTshirtContestItemForQuestion(qIdx);
  setupStudentTshirtContestQuestion('Draw your ' + drawItem.itemDesignLabel + '.', 'Drawing round', questionStart, duration);
  Promise.all([
    quiz.sessionRef.child('tshirtContest/roundIndex').get(),
    quiz.sessionRef.child('tshirtContest').get()
  ]).then(function(snaps) {
    var roundIndex = Number(snaps[0].val()) || 0;
    var contest = snaps[1].val() || {};
    var item = studentTshirtContestItemForQuestion(qIdx, contest);
    var round = contest.rounds && contest.rounds[roundIndex] ? contest.rounds[roundIndex] : {};
    var brackets = tshirtContestValues(round.brackets);
    var myBracket = null;
    brackets.forEach(function(b) {
      if (tshirtContestValues(b.entrants).indexOf(state.uid) !== -1) myBracket = b;
    });
    var already = contest.submissions && contest.submissions[roundIndex] && contest.submissions[roundIndex][state.uid];
    if (!myBracket) {
      var waitWrap = document.getElementById('qs-widget-answer');
      var waitBox = document.getElementById('qs-widget-container');
      waitWrap.classList.remove('hidden');
      waitBox.innerHTML =
        '<div class="text-center text-gray-300">' +
          '<div class="text-xl font-bold text-yellow-300 mb-2">' + escapeHtml(round.topic || 'Computing') + '</div>' +
          '<p>You are not drawing this round — sit tight, then you will help judge the designs when voting opens.</p>' +
        '</div>';
      return;
    }
    document.getElementById('qs-tshirt-answer').classList.remove('hidden');
    document.getElementById('qs-q-text').textContent = 'Topic: ' + (round.topic || 'Computing');
    var container = document.getElementById('qs-tshirt-canvas');
    var btn = document.getElementById('btn-tshirt-submit');
    var fb = document.getElementById('tshirt-feedback');
    if (quiz._tshirtContestDesigner && quiz._tshirtContestDesigner.destroy) {
      try { quiz._tshirtContestDesigner.destroy(); } catch(_e) {}
    }
    container.innerHTML = '';
    if (already) {
      if (btn) { btn.disabled = true; btn.textContent = 'Submitted'; }
      if (fb) { fb.textContent = 'Design submitted. Wait for voting.'; fb.style.color = '#4ade80'; }
      container.innerHTML = '<p class="text-green-300 text-center py-8">Your design is submitted for this round.</p>';
      return;
    }
    quiz._tshirtContestDesigner = window.initTshirtDesigner(container, { templateUrl: item.templateUrl });
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Submit Design';
      btn.onclick = function() { submitStudentTshirtContestDesign(roundIndex, btn, fb, item); };
    }
    if (fb) { fb.textContent = ''; fb.style.color = '#94a3b8'; }
  });
}

async function submitStudentTshirtContestDesign(roundIndex, submitBtn, feedbackEl, item) {
  item = studentTshirtContestItemConfig(item || {});
  function fb(msg, col) { if (feedbackEl) { feedbackEl.textContent = msg; feedbackEl.style.color = col || '#94a3b8'; } }
  var inst = quiz._tshirtContestDesigner;
  if (!inst) { fb('Designer not ready.', '#f87171'); return; }
  if (inst.isEmpty()) { fb('Draw something on the ' + item.itemLabelLower + ' first.', '#f87171'); return; }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  var token, folderId;
  try {
    token = await window.driveEnsureStudentToken(feedbackEl);
    folderId = await window.driveLookupStudentFolder(quiz.sessionRef);
    if (!folderId) throw new Error('No Drive folder found. Ask your teacher to connect Google Drive before starting.');
  } catch(e) {
    fb(e.message, '#f87171');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Design';
    return;
  }
  fb('Creating image...');
  var blob;
  try {
    blob = await new Promise(function(resolve, reject) {
      inst.toBlob(function(b) { b ? resolve(b) : reject(new Error('could not render')); }, 'image/png');
    });
  } catch(e2) {
    fb('Could not create image: ' + e2.message, '#f87171');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Design';
    return;
  }
  fb('Uploading...');
  var filename = String(state.uid || 'student') + '-' + item.fileSlug + '-round-' + (roundIndex + 1) + '.png';
  try {
    var result = await Promise.race([
      window.driveUploadFile(folderId, filename, blob, 'image/png', token),
      new Promise(function(_, reject) { setTimeout(function() { reject(new Error('Upload timed out. Tap Submit again.')); }, 45000); })
    ]);
    await quiz.sessionRef.child('tshirtContest/submissions/' + roundIndex + '/' + state.uid).set({
      fileId: result.id,
      submittedAt: Date.now(),
      blocked: false
    });
    fb('Design submitted.', '#4ade80');
    submitBtn.textContent = 'Submitted';
    if (inst.destroy) inst.destroy();
  } catch(e3) {
    fb(e3.message, '#f87171');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Design';
  }
}

function renderStudentTshirtBracketVote(qIdx, questionStart, duration) {
  setStudentView('voting');
  startStudentTshirtContestTimer(questionStart, duration);
  var voting = document.getElementById('qs-voting');
  var h2 = voting.querySelector('h2');
  var p = voting.querySelector('p');
  if (h2) h2.textContent = 'Choose the best design';
  if (p) p.textContent = 'Pick the winner of every mini competition. You cannot vote in one you are competing in.';
  var cardEl = document.getElementById('qs-voting-card');
  cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading designs...</p>';
  quiz.sessionRef.child('tshirtContest').get().then(async function(snap) {
    var contest = snap.val() || {};
    var item = studentTshirtContestItemForQuestion(qIdx, contest);
    if (h2) h2.textContent = 'Choose the best ' + item.itemLabelLower;
    var roundIndex = Number(contest.roundIndex) || 0;
    var round = contest.rounds && contest.rounds[roundIndex] ? contest.rounds[roundIndex] : {};
    var submissions = contest.submissions && contest.submissions[roundIndex] ? contest.submissions[roundIndex] : {};
    var myVotes = (contest.bracketVotes && contest.bracketVotes[roundIndex] && contest.bracketVotes[roundIndex][state.uid]) || {};
    // Every mini competition (1v1 or 1v1v1) the student is NOT competing in, with
    // 2+ real designs to compare. Blocked designs are dropped from the contest.
    var voteable = tshirtContestValues(round.brackets).filter(function(bracket) {
      return tshirtContestValues(bracket.entrants).indexOf(state.uid) === -1;
    }).map(function(bracket) {
      var entries = tshirtContestValues(bracket.entrants).filter(function(code) {
        return submissions[code] && submissions[code].fileId && !tshirtContestSubmissionBlocked(submissions[code]);
      }).map(function(code) {
        return { code: code, fileId: submissions[code].fileId };
      });
      return { bracket: bracket, entries: entries };
    }).filter(function(v) { return v.entries.length >= 2; });

    if (!voteable.length) {
      cardEl.innerHTML = '<p class="text-green-400 font-semibold text-center">No competitions for you to judge this round. Sit tight — results are on the way.</p>';
      return;
    }

    var token;
    try {
      token = await window.driveEnsureStudentToken(cardEl);
    } catch(e) {
      cardEl.innerHTML = '<p class="text-red-400 text-sm text-center">Google Drive access is needed to view designs.</p>';
      return;
    }

    var total = voteable.length;
    function updateProgress() {
      var voted = voteable.filter(function(v) { return !!myVotes[v.bracket.id]; }).length;
      var pr = document.getElementById('tsc-vote-progress');
      if (!pr) return;
      pr.textContent = voted >= total
        ? '✓ All done — you voted in all ' + total + ' competition' + (total === 1 ? '' : 's') + '. Waiting for the round to end…'
        : 'Voted in ' + voted + ' of ' + total + ' competition' + (total === 1 ? '' : 's');
    }

    // Render ONCE. Voting updates the selection in place — the view is never
    // rebuilt, so the design images never reload.
    cardEl.innerHTML =
      '<div id="tsc-vote-progress" class="text-center text-sm font-semibold text-yellow-300 mb-3"></div>' +
      '<div class="space-y-4">' + voteable.map(function(v, idx) {
        var voted = !!myVotes[v.bracket.id];
        return '<div class="tsc-bracket-card rounded-xl bg-gray-800 border border-gray-700 overflow-hidden" data-bracket-id="' + escapeHtml(v.bracket.id) + '">' +
          '<div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">' +
            '<span class="font-bold text-white">Competition ' + (idx + 1) + ' of ' + total + '</span>' +
            '<span class="tsc-bracket-status text-xs ' + (voted ? 'text-green-400 font-semibold' : 'text-gray-400') + '">' + (voted ? '✓ Voted' : 'Tap a design to vote') + '</span>' +
          '</div>' +
          '<div class="grid gap-3 p-3" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' +
            v.entries.map(function(entry) {
              var selected = myVotes[v.bracket.id] === entry.code;
              return '<button data-tshirt-live="1" class="tsc-shirt-choice rounded-lg border ' + (selected ? 'border-yellow-400 bg-yellow-900/30' : 'border-gray-700 bg-gray-900 hover:border-yellow-300') + ' p-2 text-left" data-bracket-id="' + escapeHtml(v.bracket.id) + '" data-code="' + escapeHtml(entry.code) + '" data-file-id="' + escapeHtml(entry.fileId) + '">' +
                '<div class="tsc-shirt-img rounded bg-gray-700 mb-2 flex items-center justify-center text-xs text-gray-400" style="aspect-ratio:1">Loading…</div>' +
                '<div class="font-semibold text-sm text-white truncate">' + escapeHtml(studentName(entry.code) || entry.code) + '</div>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    updateProgress();

    cardEl.querySelectorAll('.tsc-shirt-choice').forEach(function(btn) {
      // Fetch each design once.
      var imgBox = btn.querySelector('.tsc-shirt-img');
      window.driveFetchFileAsDataUrl(btn.dataset.fileId, token).then(function(dataUrl) {
        imgBox.innerHTML = '';
        var img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#334155;border-radius:6px';
        imgBox.appendChild(img);
      }).catch(function() { imgBox.textContent = 'Could not load'; });

      btn.onclick = function() {
        var bracketId = btn.dataset.bracketId;
        var code = btn.dataset.code;
        if (myVotes[bracketId] === code) return;
        var card = btn.closest('.tsc-bracket-card');
        if (card) {
          card.querySelectorAll('.tsc-shirt-choice').forEach(function(other) {
            other.classList.remove('border-yellow-400', 'bg-yellow-900/30');
            other.classList.add('border-gray-700', 'bg-gray-900');
          });
          btn.classList.remove('border-gray-700', 'bg-gray-900');
          btn.classList.add('border-yellow-400', 'bg-yellow-900/30');
          var st = card.querySelector('.tsc-bracket-status');
          if (st) { st.textContent = '✓ Voted'; st.className = 'tsc-bracket-status text-xs text-green-400 font-semibold'; }
        }
        myVotes[bracketId] = code;
        updateProgress();
        quiz.sessionRef.child('tshirtContest/bracketVotes/' + roundIndex + '/' + state.uid + '/' + bracketId).set(code).catch(function(e) {
          console.warn('[T-shirt contest] bracket vote failed:', e.message);
        });
      };
    });
  });
}

function renderStudentTshirtRoundResults(qIdx) {
  setStudentView('voting');
  clearStudentTimer();
  if (quiz._tshirtContestDesigner && quiz._tshirtContestDesigner.destroy) {
    try { quiz._tshirtContestDesigner.destroy(); } catch(_e) {}
    quiz._tshirtContestDesigner = null;
  }
  var timer = document.getElementById('qs-timer');
  var bar = document.getElementById('qs-timer-bar');
  if (timer) timer.textContent = '--';
  if (bar) {
    bar.style.width = '100%';
    bar.className = 'h-1.5 transition-all bg-gray-500';
  }
  var voting = document.getElementById('qs-voting');
  var h2 = voting.querySelector('h2');
  var p = voting.querySelector('p');
  if (h2) h2.textContent = 'Round results';
  if (p) p.textContent = 'The winners are shown below. Wait for your teacher to start the next round.';
  var cardEl = document.getElementById('qs-voting-card');
  cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading round results...</p>';
  quiz.sessionRef.child('tshirtContest').get().then(async function(snap) {
    var contest = snap.val() || {};
    var item = studentTshirtContestItemForQuestion(qIdx, contest);
    var roundIndex = Number(contest.roundIndex) || 0;
    var round = contest.rounds && contest.rounds[roundIndex] ? contest.rounds[roundIndex] : {};
    var brackets = tshirtContestValues(round.brackets);
    var pending = contest.pendingRoundAdvance || {};
    var submissions = contest.submissions && contest.submissions[roundIndex] ? contest.submissions[roundIndex] : {};
    if (h2) h2.textContent = 'Round ' + (roundIndex + 1) + ' results';
    if (p) {
      p.textContent = pending.type === 'finish'
        ? 'The final result is ready. Wait for your teacher to show the leaderboard.'
        : 'The winners below move into the next ' + item.itemLabelLower + ' drawing round.';
    }
    if (!brackets.length) {
      cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">No bracket results were recorded for this round.</p>';
      return;
    }
    var myBracket = brackets.find(function(bracket) {
      return tshirtContestValues(bracket.entrants).indexOf(state.uid) !== -1;
    });
    var myWinner = myBracket && myBracket.winner === state.uid;
    var myLost = myBracket && myBracket.winner && myBracket.winner !== state.uid;
    var status = myWinner
      ? (pending.type === 'finish' ? 'You won the contest.' : 'You passed to the next round.')
      : myLost
        ? 'You were eliminated. Your bracket winner was ' + (studentName(myBracket.winner) || myBracket.winner) + '.'
        : myBracket
          ? 'Your bracket has been resolved.'
          : 'You were judging this round.';
    var token = null;
    try {
      token = await window.driveEnsureStudentToken(cardEl);
    } catch(_e) {}
    cardEl.innerHTML =
      '<div class="rounded-xl bg-gray-800 border border-gray-700 p-4 mb-4 text-center">' +
        '<div class="text-xs uppercase tracking-wide text-yellow-300 mb-1">Round topic</div>' +
        '<div class="text-2xl font-bold text-yellow-100 mb-2">' + escapeHtml(round.topic || 'Computing') + '</div>' +
        '<div class="text-sm font-semibold ' + (myWinner ? 'text-green-300' : myLost ? 'text-red-300' : 'text-gray-300') + '">' + escapeHtml(status) + '</div>' +
      '</div>' +
      '<div class="space-y-3">' + brackets.map(function(bracket, idx) {
        var entrants = tshirtContestValues(bracket.entrants);
        var winnerName = bracket.winner ? (studentName(bracket.winner) || bracket.winner) : 'No winner';
        var winnerSubmission = bracket.winner && submissions[bracket.winner];
        var winnerBlocked = tshirtContestSubmissionBlocked(winnerSubmission);
        var winnerFileId = winnerSubmission && winnerSubmission.fileId && !winnerBlocked ? winnerSubmission.fileId : '';
        var entrantNames = entrants.map(function(code) {
          var isMe = code === state.uid;
          return '<span class="rounded-full px-3 py-1 text-sm ' + (bracket.winner === code ? 'bg-green-700 text-green-100' : isMe ? 'bg-yellow-700/50 text-yellow-100' : 'bg-gray-700 text-gray-100') + '">' +
            escapeHtml(studentName(code) || code) + (isMe ? ' (you)' : '') + (bracket.winner === code ? ' (winner)' : '') +
          '</span>';
        }).join('');
        return '<div class="rounded-lg bg-gray-800 border border-gray-700 px-4 py-3">' +
          '<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center">' +
            '<div class="min-w-0">' +
              '<div class="text-xs text-gray-500 mb-2">Bracket ' + (idx + 1) + '</div>' +
              '<div class="flex flex-wrap gap-2">' + entrantNames + '</div>' +
              '<div class="mt-3 rounded-lg bg-green-700/30 border border-green-500/40 px-3 py-2 text-green-100 font-bold">' +
                'Winner: ' + escapeHtml(winnerName) +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="tsc-round-winner-img rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center text-xs text-gray-400 overflow-hidden" ' +
                'style="aspect-ratio:1" data-file-id="' + escapeHtml(winnerFileId) + '" data-blocked="' + (winnerBlocked ? '1' : '0') + '">' +
                (bracket.winner ? (winnerBlocked ? 'Blocked by teacher' : (winnerFileId ? 'Loading design...' : 'No design submitted')) : 'No winner') +
              '</div>' +
              '<div class="text-xs text-gray-400 mt-2 text-center">Drawn by ' + escapeHtml(winnerName) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    cardEl.querySelectorAll('.tsc-round-winner-img').forEach(function(box) {
      if (box.dataset.blocked === '1') {
        renderStudentTshirtBlockedSquare(box);
        return;
      }
      var fileId = box.dataset.fileId;
      if (!fileId) return;
      if (!token) {
        box.textContent = 'Sign in to Drive to view design';
        return;
      }
      window.driveFetchFileAsDataUrl(fileId, token).then(function(dataUrl) {
        box.innerHTML = '';
        var img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'Winning ' + item.itemDesignLabel;
        img.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;background:#334155';
        box.appendChild(img);
      }).catch(function() {
        box.textContent = 'Could not load design';
      });
    });
  }).catch(function(e) {
    cardEl.innerHTML = '<p class="text-red-400 text-sm text-center">Could not load round results: ' + escapeHtml(e.message) + '</p>';
  });
}

function studentBlockbenchContestConfig(q) {
  q = q || {};
  return {
    topicSlots: Number(q.topicSlots) || 2,
    modelLabel: q.modelLabel || 'Blockbench Model',
    modelLabelLower: q.modelLabelLower || 'Blockbench model',
    modelPluralLabel: q.modelPluralLabel || 'Blockbench models',
    modelDesignLabel: q.modelDesignLabel || 'Blockbench model',
    contestTitle: q.contestTitle || q.q || 'Blockbench Bracket Contest'
  };
}

function renderStudentBlockbenchContest(stateVal, qIdx, questionStart, duration) {
  if (stateVal === 'blockbench_topics') {
    renderStudentBlockbenchTopics(qIdx, questionStart, duration);
  } else if (stateVal === 'blockbench_topic_vote') {
    renderStudentBlockbenchTopicVote(qIdx, questionStart, duration);
  } else if (stateVal === 'blockbench_draw') {
    renderStudentBlockbenchDraw(qIdx, questionStart, duration);
  } else if (stateVal === 'blockbench_bracket_vote') {
    renderStudentBlockbenchBracketVote(qIdx, questionStart, duration);
  }
}

function renderStudentBlockbenchTopics(qIdx, questionStart, duration) {
  var cfg = studentBlockbenchContestConfig((quiz.questions && quiz.questions[qIdx]) || {});
  setupStudentTshirtContestQuestion('Write your Blockbench modelling topics.', 'Topic writing', questionStart, duration);
  var wrap = document.getElementById('qs-widget-answer');
  var box = document.getElementById('qs-widget-container');
  wrap.classList.remove('hidden');
  box.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading your topic slots...</p>';
  Promise.all([
    quiz.sessionRef.child('blockbenchContest/config').get(),
    quiz.sessionRef.child('blockbenchContest/topics/' + state.uid).get()
  ]).then(function(snaps) {
    var liveCfg = Object.assign({}, cfg, snaps[0].val() || {});
    var slots = Math.max(1, Number(liveCfg.topicSlots) || 2);
    var existing = snaps[1].val() || {};
    var html =
      '<div class="max-w-lg mx-auto">' +
        '<p class="text-gray-400 text-sm text-center mb-4">Submit up to <strong class="text-yellow-300">' + slots + '</strong> topics for the modelling brackets.</p>' +
        '<div class="space-y-2">';
    for (var i = 0; i < slots; i++) {
      var old = existing['slot' + i] && existing['slot' + i].text ? existing['slot' + i].text : '';
      html += '<input data-tshirt-live="1" class="bbc-topic-input w-full rounded-lg bg-gray-800 border border-gray-600 px-4 py-3 text-white focus:outline-none focus:border-yellow-400" maxlength="60" value="' + escapeHtml(old) + '" placeholder="Topic ' + (i + 1) + '" />';
    }
    html +=
        '</div>' +
        '<button id="btn-bbc-save-topics" data-tshirt-live="1" class="jhncc-primary w-full mt-4 py-3 rounded-lg font-bold">Submit topics</button>' +
        '<div id="bbc-topic-feedback" class="text-sm text-gray-400 text-center mt-3"></div>' +
      '</div>';
    box.innerHTML = html;
    document.getElementById('btn-bbc-save-topics').onclick = async function() {
      var btn = this;
      var fb = document.getElementById('bbc-topic-feedback');
      var obj = {};
      var count = 0;
      document.querySelectorAll('.bbc-topic-input').forEach(function(input, idx) {
        var text = String(input.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        if (!text) return;
        var key = String(state.uid || 'student').replace(/[.#$/[\]]/g, '_') + '_bb_slot' + idx;
        obj['slot' + idx] = { key: key, text: text, submittedAt: Date.now() };
        count++;
      });
      btn.disabled = true;
      try {
        await quiz.sessionRef.child('blockbenchContest/topics/' + state.uid).set(obj);
        fb.textContent = count + ' topic' + (count === 1 ? '' : 's') + ' submitted.';
        fb.style.color = '#4ade80';
        btn.textContent = 'Submitted';
      } catch(e) {
        fb.textContent = 'Could not submit topics: ' + e.message;
        fb.style.color = '#f87171';
        btn.disabled = false;
      }
    };
  });
}

function renderStudentBlockbenchTopicVote(qIdx, questionStart, duration) {
  setStudentView('voting');
  startStudentTshirtContestTimer(questionStart, duration);
  var voting = document.getElementById('qs-voting');
  var h2 = voting.querySelector('h2');
  var p = voting.querySelector('p');
  if (h2) h2.textContent = 'Vote on topics';
  if (p) p.textContent = 'Use up or down votes. The scores are hidden.';
  var cardEl = document.getElementById('qs-voting-card');
  cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading topics...</p>';
  Promise.all([
    quiz.sessionRef.child('blockbenchContest/topics').get(),
    quiz.sessionRef.child('blockbenchContest/topicVotes/' + state.uid).get()
  ]).then(function(snaps) {
    var topics = [];
    snaps[0].forEach(function(studentSnap) {
      studentSnap.forEach(function(topicSnap) {
        var text = String(topicSnap.child('text').val() || '').trim();
        var key = topicSnap.child('key').val() || (studentSnap.key + '_' + topicSnap.key);
        if (text) topics.push({ key: key, text: text });
      });
    });
    var votes = snaps[1].val() || {};
    if (!topics.length) {
      cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">No topics were submitted. A default topic will be used.</p>';
      return;
    }
    topics.sort(function(a, b) { return a.text.localeCompare(b.text); });
    cardEl.innerHTML = '<div class="space-y-2">' + topics.map(function(t) {
      var v = Number(votes[t.key]) || 0;
      return '<div class="rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 flex items-center gap-3">' +
        '<div class="flex-1 min-w-0 font-semibold text-white truncate">' + escapeHtml(t.text) + '</div>' +
        '<button data-tshirt-live="1" data-topic-key="' + escapeHtml(t.key) + '" data-vote="1" class="bbc-topic-vote rounded px-3 py-2 font-bold ' + (v > 0 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200') + '">Up</button>' +
        '<button data-tshirt-live="1" data-topic-key="' + escapeHtml(t.key) + '" data-vote="-1" class="bbc-topic-vote rounded px-3 py-2 font-bold ' + (v < 0 ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-200') + '">Down</button>' +
      '</div>';
    }).join('') + '</div>';
    cardEl.querySelectorAll('.bbc-topic-vote').forEach(function(btn) {
      btn.onclick = function() {
        var key = btn.dataset.topicKey;
        var vote = Number(btn.dataset.vote);
        if (Number(votes[key]) === vote) vote = 0;
        votes[key] = vote;
        var ref = quiz.sessionRef.child('blockbenchContest/topicVotes/' + state.uid + '/' + key);
        (vote === 0 ? ref.remove() : ref.set(vote)).catch(function(e) { console.warn('[Blockbench contest] topic vote failed:', e.message); });
        renderStudentBlockbenchTopicVote(qIdx, questionStart, duration);
      };
    });
  });
}

function renderStudentBlockbenchDraw(qIdx, questionStart, duration) {
  setupStudentTshirtContestQuestion('Build your Blockbench model.', 'Modelling round', questionStart, duration);
  Promise.all([
    quiz.sessionRef.child('blockbenchContest/roundIndex').get(),
    quiz.sessionRef.child('blockbenchContest').get()
  ]).then(function(snaps) {
    var roundIndex = Number(snaps[0].val()) || 0;
    var contest = snaps[1].val() || {};
    var round = contest.rounds && contest.rounds[roundIndex] ? contest.rounds[roundIndex] : {};
    var brackets = tshirtContestValues(round.brackets);
    var myBracket = null;
    brackets.forEach(function(b) {
      if (tshirtContestValues(b.entrants).indexOf(state.uid) !== -1) myBracket = b;
    });
    var already = contest.submissions && contest.submissions[roundIndex] && contest.submissions[roundIndex][state.uid];
    if (!myBracket || already) {
      resetBlockbenchQuizFrame();
      var waitWrap = document.getElementById('qs-widget-answer');
      var waitBox = document.getElementById('qs-widget-container');
      waitWrap.classList.remove('hidden');
      waitBox.innerHTML =
        '<div class="text-center text-gray-300">' +
          '<div class="text-xl font-bold text-yellow-300 mb-2">' + escapeHtml(round.topic || 'Game asset') + '</div>' +
          (already
            ? '<p>Your model is submitted for this round. Wait for voting.</p>'
            : '<p>You are not modelling in this round. You will vote when submissions are ready.</p>') +
        '</div>';
      return;
    }
    document.getElementById('qs-blockbench-answer').classList.remove('hidden');
    document.getElementById('qs-q-text').textContent = 'Topic: ' + (round.topic || 'Game asset');
    var frame = document.getElementById('qs-blockbench-frame');
    var btn = document.getElementById('btn-quiz-submit-blockbench');
    var fb = document.getElementById('qs-blockbench-feedback');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Loading editor...';
      btn.onclick = null;
    }
    if (fb) {
      fb.textContent = 'Create your model in Blockbench, then submit it for the bracket.';
      fb.style.color = '#94a3b8';
    }
    var loadKey = 'blockbench-contest:' + qIdx + ':' + roundIndex + ':' + questionStart;
    if (frame && frame.dataset.quizLoadKey !== loadKey) {
      loadBlockbenchQuizEditor(qIdx, loadKey, 0);
    } else {
      requestAnimationFrame(scaleBlockbenchQuizFrame);
      waitForBlockbenchQuizReady(qIdx, loadKey, 0);
    }
    if (window._qsBlockbenchResize) window.removeEventListener('resize', window._qsBlockbenchResize);
    window._qsBlockbenchResize = scaleBlockbenchQuizFrame;
    window.addEventListener('resize', window._qsBlockbenchResize);
  });
}

async function submitStudentBlockbenchContestModel(qIdx) {
  var frame = document.getElementById('qs-blockbench-frame');
  var fb = document.getElementById('qs-blockbench-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-blockbench');
  var originalText = submitBtn ? submitBtn.textContent : 'Submit Model';
  function setFb(msg, col) { if (fb) { fb.textContent = msg; fb.style.color = col || '#94a3b8'; } }
  try {
    var cw = frame && frame.contentWindow;
    if (!cw || !cw.Outliner) {
      setFb('Editor still loading - wait a moment and try again.', '#f87171');
      return;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }
    if (frame) frame.style.pointerEvents = 'none';

    var roundSnap = await quiz.sessionRef.child('blockbenchContest/roundIndex').get();
    var roundIndex = Number(roundSnap.val()) || 0;
    var existingSnap = await quiz.sessionRef.child('blockbenchContest/submissions/' + roundIndex + '/' + state.uid).get();
    if (existingSnap.exists()) {
      setFb('Model already submitted for this round.', '#4ade80');
      if (submitBtn) submitBtn.textContent = 'Submitted';
      return;
    }

    var token = await window.driveEnsureStudentToken(fb);
    var folderId = await window.driveLookupStudentFolder(quiz.sessionRef);
    if (!folderId) throw new Error('No Drive folder found for your code. Ask your teacher to restart Drive setup for this quiz.');

    setFb('Preparing model...');
    var fallbackModel = exportBlockbenchModel(cw);
    var json;
    try {
      json = exportBlockbenchProjectText(cw, fallbackModel);
    } catch(_exportErr) {
      json = JSON.stringify(fallbackModel);
    }
    var cubeCount = 0;
    try {
      var savedProject = JSON.parse(json);
      if (savedProject && Array.isArray(savedProject.elements)) cubeCount = savedProject.elements.length;
    } catch(_parseErr) {}
    var blob = new Blob([json], { type: 'application/json' });
    var filename = String(state.uid || 'student') + '-blockbench-round-' + (roundIndex + 1) + '.bbmodel';

    setFb('Uploading model...');
    var fileResult = await Promise.race([
      window.driveUploadFile(folderId, filename, blob, 'application/json', token),
      new Promise(function(_, reject) { setTimeout(function() { reject(new Error('Upload timed out. Tap Submit again.')); }, 45000); })
    ]);

    await quiz.sessionRef.child('blockbenchContest/submissions/' + roundIndex + '/' + state.uid).set({
      fileId: fileResult.id,
      submittedAt: Date.now(),
      blocked: false,
      cubeCount: cubeCount
    });
    setFb('Model submitted.', '#4ade80');
    if (submitBtn) submitBtn.textContent = 'Submitted';
  } catch(e) {
    unlockBlockbenchTesting(frame, submitBtn, originalText);
    setFb('Could not submit: ' + e.message, '#f87171');
  }
}

function renderBlockbenchContestPreview(container, projectText) {
  if (!container) return;
  try {
    if (typeof renderBlockbenchSnapshotPreview === 'function') {
      renderBlockbenchSnapshotPreview(container, JSON.parse(projectText));
      return;
    }
  } catch(e) {}
  if (typeof renderBlockbenchModelViewer === 'function') {
    renderBlockbenchModelViewer(container, projectText, { height: 260, spin: true });
  } else {
    container.textContent = 'Model preview unavailable';
  }
}

function renderStudentBlockbenchBracketVote(qIdx, questionStart, duration) {
  setStudentView('voting');
  startStudentTshirtContestTimer(questionStart, duration);
  var voting = document.getElementById('qs-voting');
  var h2 = voting.querySelector('h2');
  var p = voting.querySelector('p');
  if (h2) h2.textContent = 'Choose the best model';
  if (p) p.textContent = 'You do not vote on your own bracket.';
  var cardEl = document.getElementById('qs-voting-card');
  cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading brackets...</p>';
  quiz.sessionRef.child('blockbenchContest').get().then(async function(snap) {
    var contest = snap.val() || {};
    var roundIndex = Number(contest.roundIndex) || 0;
    var round = contest.rounds && contest.rounds[roundIndex] ? contest.rounds[roundIndex] : {};
    var submissions = contest.submissions && contest.submissions[roundIndex] ? contest.submissions[roundIndex] : {};
    var myVotes = contest.bracketVotes && contest.bracketVotes[roundIndex] && contest.bracketVotes[roundIndex][state.uid] ? contest.bracketVotes[roundIndex][state.uid] : {};
    var brackets = tshirtContestValues(round.brackets).filter(function(bracket) {
      return tshirtContestValues(bracket.entrants).indexOf(state.uid) === -1;
    });
    var voteable = brackets.map(function(bracket) {
      var entries = tshirtContestValues(bracket.entrants).filter(function(code) {
        return submissions[code] && submissions[code].fileId;
      }).map(function(code) {
        return { code: code, fileId: submissions[code].fileId, blocked: blockbenchContestSubmissionBlocked(submissions[code]) };
      });
      return { bracket: bracket, entries: entries };
    }).filter(function(item) {
      return item.entries.filter(function(entry) { return !entry.blocked; }).length >= 2;
    });
    if (!voteable.length) {
      cardEl.innerHTML = '<p class="text-green-400 font-semibold text-center">No brackets for you to vote on this round. Waiting for results...</p>';
      return;
    }
    var token;
    try {
      token = await window.driveEnsureStudentToken(cardEl);
    } catch(e) {
      cardEl.innerHTML = '<p class="text-red-400 text-sm text-center">Google Drive access is needed to view models.</p>';
      return;
    }
    cardEl.innerHTML = '<div class="space-y-4">' + voteable.map(function(item, idx) {
      return '<div class="bbc-bracket-card rounded-xl bg-gray-800 border border-gray-700 overflow-hidden" data-bracket-id="' + escapeHtml(item.bracket.id) + '">' +
        '<div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">' +
          '<span class="font-bold text-white">Bracket ' + (idx + 1) + '</span>' +
          '<span class="text-xs text-gray-400">' + escapeHtml(round.topic || 'Game asset') + '</span>' +
        '</div>' +
        '<div class="grid gap-3 p-3" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">' +
          item.entries.map(function(entry) {
            var selected = !entry.blocked && myVotes[item.bracket.id] === entry.code;
            return '<button data-tshirt-live="1" class="bbc-model-choice rounded-lg border ' + (selected ? 'border-yellow-400 bg-yellow-900/30' : 'border-gray-700 bg-gray-900') + ' p-2 text-left ' + (entry.blocked ? 'opacity-80 cursor-not-allowed' : 'hover:border-yellow-300') + '" data-bracket-id="' + escapeHtml(item.bracket.id) + '" data-code="' + escapeHtml(entry.code) + '" data-file-id="' + escapeHtml(entry.fileId) + '" data-blocked="' + (entry.blocked ? '1' : '0') + '"' + (entry.blocked ? ' disabled' : '') + '>' +
              '<div class="bbc-model-img rounded bg-gray-700 mb-2 flex items-center justify-center text-xs text-gray-400 overflow-hidden" style="aspect-ratio:17/10">' + (entry.blocked ? 'Blocked by teacher' : 'Loading...') + '</div>' +
              '<div class="font-semibold text-sm text-white truncate">' + escapeHtml(studentName(entry.code) || entry.code) + '</div>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
    cardEl.querySelectorAll('.bbc-model-choice').forEach(function(btn) {
      var modelBox = btn.querySelector('.bbc-model-img');
      if (btn.dataset.blocked === '1') {
        renderStudentTshirtBlockedSquare(modelBox);
        return;
      }
      window.driveFetchFileAsText(btn.dataset.fileId, token).then(function(text) {
        renderBlockbenchContestPreview(modelBox, text);
      }).catch(function() { modelBox.textContent = 'Could not load'; });
      btn.onclick = function() {
        if (btn.dataset.blocked === '1') return;
        var bracketId = btn.dataset.bracketId;
        var code = btn.dataset.code;
        quiz.sessionRef.child('blockbenchContest/bracketVotes/' + roundIndex + '/' + state.uid + '/' + bracketId).set(code).then(function() {
          renderStudentBlockbenchBracketVote(qIdx, questionStart, duration);
        }).catch(function(e) {
          console.warn('[Blockbench contest] bracket vote failed:', e.message);
        });
      };
    });
  });
}

function renderStudentQuestion(qIdx, questionStart, duration) {
  setStudentView('question');
  var q = quiz.questions[qIdx];
  if (!q) return;

  renderTextWithBlocks(document.getElementById('qs-q-text'), q.q);
  var quizVisual = document.getElementById('qs-q-visual');
  if (q.html) {
    quizVisual.innerHTML = q.html;
    quizVisual.classList.remove('hidden');
  } else {
    quizVisual.innerHTML = '';
    quizVisual.classList.add('hidden');
  }
  document.getElementById('qs-q-progress').textContent =
    'Question ' + (qIdx + 1) + ' of ' + quiz.questions.length;
  document.getElementById('qs-answered-msg').classList.add('hidden');
  var codeFeedback = document.getElementById('qs-code-feedback');
  codeFeedback.textContent = '';
  codeFeedback.className = 'quiz-code-feedback';

  var isTextInput = q.type === 'text_input';
  var isWidget = q.type === 'bit_input' || q.type === 'addition_input';
  var isScratch = q.type === 'scratch_build';
  var isPyBot = q.type === 'pybot_level';
  var isBlockbench = q.type === 'blockbench_build' || q.type === 'blockbench_share';
  var isSpreadsheet = q.type === 'spreadsheet_task';
  var isPyScratch = q.type === 'pyscratch_build';
  var isPyScratchShare = q.type === 'pyscratch_share';
  var isCanvas = q.type === 'canvas';
  var isPixelArt = q.type === 'pixel_art';
  var isTshirt = q.type === 'tshirt';
  var isCodeQuestion = q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq' && !isTextInput && !isWidget && !isScratch && !isPyBot && !isBlockbench && !isSpreadsheet && !isPyScratch && !isPyScratchShare && !isCanvas && !isPixelArt && !isTshirt;
  document.getElementById('qs-answer-grid').classList.toggle('hidden', isCodeQuestion || isTextInput || isWidget || isScratch || isPyBot || isBlockbench || isSpreadsheet || isPyScratch || isPyScratchShare || isCanvas || isPixelArt || isTshirt);
  document.getElementById('qs-code-answer').classList.toggle('hidden', !isCodeQuestion);
  document.getElementById('qs-text-answer').classList.toggle('hidden', !isTextInput);
  document.getElementById('qs-widget-answer').classList.toggle('hidden', !isWidget);
  document.getElementById('qs-scratch-answer').classList.toggle('hidden', !isScratch);
  document.getElementById('qs-pybot-answer').classList.toggle('hidden', !isPyBot);
  document.getElementById('qs-blockbench-answer').classList.toggle('hidden', !isBlockbench);
  document.getElementById('qs-spreadsheet-answer').classList.toggle('hidden', !isSpreadsheet);
  document.getElementById('qs-pyscratch-answer').classList.toggle('hidden', !isPyScratch && !isPyScratchShare);
  document.getElementById('qs-canvas-answer').classList.toggle('hidden', !isCanvas);
  document.getElementById('qs-pixel-art-answer').classList.toggle('hidden', !isPixelArt);
  document.getElementById('qs-tshirt-answer').classList.toggle('hidden', !isTshirt);
  if (!isScratch) resetScratchQuizFrame();
  if (!isBlockbench) resetBlockbenchQuizFrame();
  if (!isPyScratch && !isPyScratchShare) resetPyScratchQuizFrame();
  if (isWidget) {
    quiz.currentWidget = null;
    var widgetContainer = document.getElementById('qs-widget-container');
    widgetContainer.innerHTML = '';
    if (q.type === 'bit_input') {
      quiz.currentWidget = BinaryLesson.mountBitInput(widgetContainer, { showTotal: !q.useNibbles, useNibbles: !!q.useNibbles });
    } else if (q.type === 'addition_input') {
      quiz.currentWidget = BinaryLesson.mountAddInput(widgetContainer, q.rowA, q.rowB);
    }
    document.getElementById('btn-quiz-submit-widget').disabled = false;
    document.getElementById('btn-quiz-submit-widget').onclick = function() { submitStudentWidgetAnswer(qIdx); };
  } else if (isTextInput) {
    var textInput = document.getElementById('qs-text-input');
    textInput.value = '';
    textInput.disabled = false;
    document.getElementById('qs-text-feedback').textContent = '';
    document.getElementById('btn-quiz-submit-text').disabled = false;
    document.getElementById('btn-quiz-submit-text').onclick = function() { submitStudentTextAnswer(qIdx); };
    textInput.onkeydown = function(e) { if (e.key === 'Enter') submitStudentTextAnswer(qIdx); };
    setTimeout(function() { textInput.focus(); }, 0);
  } else if (isCodeQuestion) {
    var codeInput = document.getElementById('qs-code-input');
    codeInput.value = '';
    codeInput.disabled = false;
    codeInput.onkeydown = function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = codeInput.selectionStart;
        var end = codeInput.selectionEnd;
        codeInput.value = codeInput.value.substring(0, start) + '    ' + codeInput.value.substring(end);
        codeInput.selectionStart = codeInput.selectionEnd = start + 4;
      }
    };
    document.getElementById('btn-quiz-submit-code').disabled = false;
    document.getElementById('btn-quiz-submit-code').onclick = function() { submitStudentCodeAnswer(qIdx); };
    setTimeout(function() { codeInput.focus(); }, 0);
  } else if (isScratch) {
    var scratchFrame = document.getElementById('qs-scratch-frame');
    if (scratchFrame) scratchFrame.style.pointerEvents = '';
    var scratchLoadKey = qIdx + ':' + questionStart;
    var scratchSubmitBtn = document.getElementById('btn-quiz-submit-scratch');
    scratchSubmitBtn.disabled = true;
    scratchSubmitBtn.textContent = 'Loading editor...';
    scratchSubmitBtn.onclick = null;
    document.getElementById('qs-scratch-feedback').textContent = 'Loading TurboWarp editor...';
    if (scratchFrame && scratchFrame.dataset.quizLoadKey !== scratchLoadKey) {
      loadScratchQuizEditor(qIdx, scratchLoadKey, 0);
    } else {
      requestAnimationFrame(scaleScratchQuizFrame);
      waitForScratchQuizReady(qIdx, scratchLoadKey, 0);
    }
    document.getElementById('btn-qs-scratch-fs').onclick = toggleQsScratchFullscreen;
    if (window._qsScratchResize) window.removeEventListener('resize', window._qsScratchResize);
    window._qsScratchResize = scaleScratchQuizFrame;
    window.addEventListener('resize', window._qsScratchResize);
    if (window._qsScratchEsc) document.removeEventListener('keydown', window._qsScratchEsc);
    window._qsScratchEsc = function(e) {
      if (e.key === 'Escape') {
        var w = document.getElementById('qs-scratch-wrap');
        if (w && w.classList.contains('qs-scratch-fullscreen')) toggleQsScratchFullscreen();
      }
    };
    document.addEventListener('keydown', window._qsScratchEsc);
  } else if (isPyBot) {
    var pyBotFrame = document.getElementById('qs-pybot-frame');
    var pyBotFb    = document.getElementById('qs-pybot-feedback');
    if (pyBotFb) pyBotFb.textContent = 'Loading level…';

    if (window._qsPyBotRetryInterval) { clearInterval(window._qsPyBotRetryInterval); window._qsPyBotRetryInterval = null; }
    if (window._qsPyBotMsg) { window.removeEventListener('message', window._qsPyBotMsg); window._qsPyBotMsg = null; }

    var levelAcked = false;
    window._qsPyBotMsg = function(e) {
      if (e.origin !== 'https://jquinney-hue.github.io') return;
      var data = e.data || {};
      if (data.type === 'LEVEL_LOADED') {
        levelAcked = true;
        if (window._qsPyBotRetryInterval) { clearInterval(window._qsPyBotRetryInterval); window._qsPyBotRetryInterval = null; }
        if (pyBotFb) pyBotFb.textContent = 'Complete the level to submit.';
      }
      if (data.type === 'LEVEL_COMPLETE') {
        submitStudentPyBotAnswer(qIdx, data.medal, data.lines);
      }
    };
    window.addEventListener('message', window._qsPyBotMsg);

    // Append _q param so each question gets a distinct URL — browsers won't reload
    // on same-URL assignment, which would silently swallow the onload event.
    pyBotFrame.onload = function() {
      requestAnimationFrame(scalePyBotQuizFrame);
      var attempts = 0;
      function sendLevel() {
        try { pyBotFrame.contentWindow.postMessage({ type: 'LOAD_CUSTOM_LEVEL', data: { levelString: q.levelString || '' } }, '*'); } catch(e2) {}
        if (q.starterCode) {
          setTimeout(function() {
            try { pyBotFrame.contentWindow.postMessage({ type: 'SET_CODE', data: { code: q.starterCode } }, '*'); } catch(e3) {}
          }, 500);
        }
      }
      sendLevel();
      window._qsPyBotRetryInterval = setInterval(function() {
        if (levelAcked || ++attempts > 20) { clearInterval(window._qsPyBotRetryInterval); window._qsPyBotRetryInterval = null; return; }
        sendLevel();
      }, 500);
    };
    pyBotFrame.src = 'https://jquinney-hue.github.io/PyBot?hideMenu=true&_q=' + qIdx + '_' + questionStart;
    document.getElementById('btn-qs-pybot-fs').onclick = toggleQsPyBotFullscreen;
    if (window._qsPyBotResize) window.removeEventListener('resize', window._qsPyBotResize);
    window._qsPyBotResize = scalePyBotQuizFrame;
    window.addEventListener('resize', window._qsPyBotResize);
    if (window._qsPyBotEsc) document.removeEventListener('keydown', window._qsPyBotEsc);
    window._qsPyBotEsc = function(e) {
      if (e.key === 'Escape') {
        var w = document.getElementById('qs-pybot-wrap');
        if (w && w.classList.contains('qs-pybot-fullscreen')) toggleQsPyBotFullscreen();
      }
    };
    document.addEventListener('keydown', window._qsPyBotEsc);
  } else if (isBlockbench) {
    var blockbenchFrame = document.getElementById('qs-blockbench-frame');
    if (blockbenchFrame) blockbenchFrame.style.pointerEvents = '';
    var blockbenchSubmitBtn = document.getElementById('btn-quiz-submit-blockbench');
    if (blockbenchSubmitBtn) {
      blockbenchSubmitBtn.disabled = true;
      blockbenchSubmitBtn.textContent = 'Loading editor...';
      blockbenchSubmitBtn.onclick = null;
    }
    document.getElementById('qs-blockbench-feedback').textContent = 'Loading Blockbench editor...';
    var blockbenchLoadKey = qIdx + ':' + questionStart;
    if (blockbenchFrame && blockbenchFrame.dataset.quizLoadKey !== blockbenchLoadKey) {
      loadBlockbenchQuizEditor(qIdx, blockbenchLoadKey, 0);
    } else {
      requestAnimationFrame(scaleBlockbenchQuizFrame);
      waitForBlockbenchQuizReady(qIdx, blockbenchLoadKey, 0);
    }
    if (window._qsBlockbenchResize) window.removeEventListener('resize', window._qsBlockbenchResize);
    window._qsBlockbenchResize = scaleBlockbenchQuizFrame;
    window.addEventListener('resize', window._qsBlockbenchResize);
  } else if (isPyScratch || isPyScratchShare) {
    var pyScratchFrame = document.getElementById('qs-pyscratch-frame');
    if (pyScratchFrame) pyScratchFrame.style.pointerEvents = '';
    var psLoadKey = qIdx + ':' + questionStart;
    var psSubmitBtn = document.getElementById('btn-quiz-submit-pyscratch');
    psSubmitBtn.disabled = true;
    psSubmitBtn.textContent = 'Loading editor...';
    psSubmitBtn.onclick = null;
    document.getElementById('qs-pyscratch-feedback').textContent = 'Loading PyScratch editor...';
    if (pyScratchFrame && pyScratchFrame.dataset.quizLoadKey !== psLoadKey) {
      loadPyScratchQuizEditor(qIdx, psLoadKey, 0);
    } else {
      requestAnimationFrame(scalePyScratchQuizFrame);
      waitForPyScratchQuizReady(qIdx, psLoadKey, 0);
    }
    document.getElementById('btn-qs-pyscratch-fs').onclick = toggleQsPyScratchFullscreen;
    if (window._qsPyScratchResize) window.removeEventListener('resize', window._qsPyScratchResize);
    window._qsPyScratchResize = scalePyScratchQuizFrame;
    window.addEventListener('resize', window._qsPyScratchResize);
    if (window._qsPyScratchEsc) document.removeEventListener('keydown', window._qsPyScratchEsc);
    window._qsPyScratchEsc = function(e) {
      if (e.key === 'Escape') {
        var w = document.getElementById('qs-pyscratch-wrap');
        if (w && w.classList.contains('qs-pyscratch-fullscreen')) toggleQsPyScratchFullscreen();
      }
    };
    document.addEventListener('keydown', window._qsPyScratchEsc);
    if (isPyScratchShare) {
      // Drive-upload submit
      var psShareFb  = document.getElementById('qs-pyscratch-feedback');
      var psShareBtn = document.getElementById('btn-quiz-submit-pyscratch');
      if (psShareBtn) {
        psShareBtn.disabled = false;
        psShareBtn.textContent = '📤 Submit My Game';
        psShareBtn.onclick = function() { submitStudentPyScratchShare(qIdx, psShareBtn, psShareFb); };
      }
    }
  } else if (isCanvas) {
    initCanvasQuestion(qIdx, q);
  } else if (isPixelArt) {
    if (typeof window.initPixelArtQuestion === 'function') window.initPixelArtQuestion(qIdx);
  } else if (isTshirt) {
    if (typeof window.initTshirtQuestion === 'function') window.initTshirtQuestion(qIdx);
  } else if (isSpreadsheet) {
    renderQuizSpreadsheetTask(qIdx, q);
  } else {
    document.querySelectorAll('.quiz-ans-btn').forEach(function(btn, i) {
      // Restore structure if a previous scratch_mcq removed the bullet + span
      if (!btn.querySelector('span')) {
        btn.innerHTML = '&#x25CF; ';
        btn.appendChild(document.createElement('span'));
      }
      btn.style.paddingTop = '';
      btn.style.paddingBottom = '';
      if (q.type === 'scratch_mcq' && window.scratchblocks) {
        try {
          var script = scratchblocks.parse(q.options[i], { style: 'scratch3' });
          var svg = scratchblocks.render(script, { style: 'scratch3' });
          sbLogDevice();
          var natW = parseFloat(svg.getAttribute('width'))  || 200;
          var natH = parseFloat(svg.getAttribute('height')) || 60;
          sbLogSvg(svg, 'scratch_mcq-opt' + i);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.style.display       = 'block';
          svg.style.width         = '100%';
          svg.style.height        = 'auto';
          svg.style.aspectRatio   = (natW / natH).toFixed(4);
          svg.style.maxWidth      = natW + 'px';
          svg.style.overflow      = 'hidden';
          svg.style.pointerEvents = 'none';
          svg.style.margin        = '0 auto';
          svg.style.fontWeight    = 'normal';
          svg.style.fontStyle     = 'normal';
          btn.innerHTML = '';
          btn.style.paddingTop = '0.75rem';
          btn.style.paddingBottom = '0.75rem';
          btn.appendChild(svg);
        } catch(e) {
          console.error('[ScratchBlocks scratch_mcq-opt' + i + '] render error:', e);
          safeText(btn.querySelector('span'), q.options[i]);
        }
      } else {
        renderTextWithBlocks(btn.querySelector('span'), q.options[i]);
      }
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.outline = '';
      btn.onclick = function() { submitStudentAnswer(qIdx, i, btn); };
    });
  }

  // Timer based on server start time
  var elapsed    = (Date.now() - questionStart) / 1000;
  var remaining  = Math.max(0, duration - elapsed);
  clearStudentTimer();
  var timerEnd   = Date.now() + remaining * 1000;
  var studentQuestionKey = qIdx + ':' + questionStart;

  function tick() {
    if (quiz.currentStudentQuestionKey !== studentQuestionKey) return;
    var rem = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
    document.getElementById('qs-timer').textContent = rem;
    var pct = ((timerEnd - Date.now()) / (duration * 1000)) * 100;
    var bar = document.getElementById('qs-timer-bar');
    bar.style.width = Math.max(0, pct) + '%';
    bar.className = 'h-1.5 transition-all ' + (pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500');
    if (rem <= 0) { clearStudentTimer(); lockStudentAnswers(); }
  }
  tick();
  quiz.studentTimerInterval = setInterval(tick, 500);
}

// ── Voting phase (canvas questions) ─────────────────────────────

function renderStudentVoting(qIdx) {
  setStudentView('voting');
  clearStudentTimer();
  var votingView = document.getElementById('qs-voting');
  if (votingView) {
    var vh = votingView.querySelector('h2');
    var vp = votingView.querySelector('p');
    if (vh) vh.textContent = 'Rate the submissions';
    if (vp) vp.textContent = 'You have 20 seconds to rate each one.';
  }
  var cardEl = document.getElementById('qs-voting-card');
  cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading submissions…</p>';

  quiz.sessionRef.child('votingItems/' + qIdx).get().then(function(snap) {
    if (!snap.exists()) {
      cardEl.innerHTML = '<p class="text-gray-400 text-sm text-center">No submissions to vote on.</p>';
      return;
    }
    var itemsObj = snap.val() || {};
    var items = Object.values(itemsObj).filter(Boolean);

    // Shuffle client-side
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = items[i]; items[i] = items[j]; items[j] = tmp;
    }

    // Filter out own submission
    items = items.filter(function(item) {
      return (item.code || item.uid) !== state.uid;
    });

    if (!items.length) {
      cardEl.innerHTML = '<p class="text-green-400 font-semibold text-center">&#x2713; No other submissions to rate. Waiting for results…</p>';
      return;
    }

    // Check which items the student has already voted on, then process remaining
    var votedRef = quiz.sessionRef.child('votes/' + qIdx + '/' + state.uid);
    votedRef.get().then(function(votedSnap) {
      var alreadyVoted = votedSnap.exists() ? votedSnap.val() : {};
      var toRate = items.filter(function(item) {
        return !alreadyVoted[item.code || item.uid];
      });
      if (!toRate.length) {
        cardEl.innerHTML = '<p class="text-green-400 font-semibold text-center">&#x2713; All voted! Waiting for results…</p>';
        return;
      }
      driveEnsureStudentTokenCached(function(token) {
        processVotingItems(qIdx, toRate, 0, token, cardEl);
      }, cardEl);
    });
  }).catch(function(e) {
    cardEl.innerHTML = '<p class="text-red-400 text-sm text-center">Error loading submissions: ' + escapeHtml(e.message) + '</p>';
  });
}

function driveEnsureStudentTokenCached(cb, statusEl) {
  window.driveEnsureStudentToken(statusEl).then(cb).catch(function(e) {
    var cardEl = document.getElementById('qs-voting-card');
    if (cardEl) cardEl.innerHTML = '<p class="text-red-400 text-sm text-center">&#x274C; Google Drive access required to vote. ' + escapeHtml(e.message) + '</p>';
  });
}

function quizSafeFirebaseKey(value) {
  return String(value || '').replace(/[.#$/[\]]/g, '_');
}

function blockbenchShareQuestionFilename(qIdx) {
  if (typeof blockbenchShareFilename === 'function') return blockbenchShareFilename(qIdx);
  return 'question-' + (Number(qIdx) + 1) + '-blockbench-model.bbmodel';
}

async function getQuizStudentFolderId(code) {
  if (!code) return null;
  var safeCode = quizSafeFirebaseKey(code);
  if (quiz.sessionRef) {
    try {
      var snap = await quiz.sessionRef.child('studentFolders/' + safeCode).get();
      if (snap.exists()) {
        var folderId = snap.val();
        if (window.driveSaveQuizFolders && quiz.lobbyCode) {
          var sf = {}; sf[safeCode] = folderId;
          window.driveSaveQuizFolders(quiz.lobbyCode, { studentFolders: sf });
        }
        return folderId;
      }
    } catch(e) {}
  }
  if (window.driveLoadQuizFolders && quiz.lobbyCode) {
    var cached = window.driveLoadQuizFolders(quiz.lobbyCode);
    return (cached && cached.studentFolders && cached.studentFolders[safeCode]) || null;
  }
  return null;
}

async function loadBlockbenchShareModelText(qIdx, code, token) {
  var folderId = await getQuizStudentFolderId(code);
  if (!folderId) throw new Error('No Drive folder found for this student.');
  var filename = blockbenchShareQuestionFilename(qIdx);
  var file = await window.driveFindLatestFileByName(folderId, filename, token);
  if (!file || !file.id) {
    var legacyName = 'question-' + (Number(qIdx) + 1) + '-blockbench-model.json';
    file = await window.driveFindLatestFileByName(folderId, legacyName, token);
  }
  if (!file || !file.id) throw new Error('No submitted Blockbench model found.');
  return {
    text: await window.driveFetchFileAsText(file.id, token),
    file: file
  };
}

async function loadBlockbenchShareSnapshot(qIdx, code, token) {
  var loaded = await loadBlockbenchShareModelText(qIdx, code, token);
  var text = loaded.text;
  var snapshot = JSON.parse(text);
  if (!snapshot || (snapshot.format !== 'jhncc-blockbench-snapshot-v1' && !Array.isArray(snapshot.elements))) {
    throw new Error('The model file is not in the expected format.');
  }
  return snapshot;
}

function processVotingItems(qIdx, items, index, token, cardEl) {
  if (index >= items.length) {
    cardEl.innerHTML = '<p class="text-green-400 font-semibold text-center text-lg mt-8">&#x2713; All voted! Waiting for results…</p>';
    return;
  }

  var item = items[index];
  var itemCode = item.code || item.uid;
  var TIMER_SECS = 20;

  // Render a loading card
  cardEl.innerHTML =
    '<div class="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 w-full">' +
      '<div id="qs-vcard-img-wrap" class="w-full" style="aspect-ratio:17/10;background:#0f172a;display:flex;align-items:center;justify-content:center;color:#475569;font-size:0.85rem">Loading image…</div>' +
      '<div class="px-4 pt-3 pb-1">' +
        '<div class="h-2 bg-gray-700 rounded overflow-hidden mb-3"><div id="qs-vote-timer-bar" class="h-2 bg-yellow-400 transition-all" style="width:100%"></div></div>' +
        '<div class="flex justify-center gap-3 mb-3" id="qs-star-btns"></div>' +
        '<p class="text-xs text-gray-500 text-center mb-2">' + (index + 1) + ' of ' + items.length + '</p>' +
      '</div>' +
    '</div>';

  // Star buttons
  var starContainer = document.getElementById('qs-star-btns');
  var voted = false;
  var timerInterval = null;

  function advanceNext(rating) {
    if (voted) return;
    voted = true;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    // Write vote to Firebase
    quiz.sessionRef.child('votes/' + qIdx + '/' + state.uid + '/' + itemCode).set(rating).catch(function(e) {
      console.warn('[Voting] vote write failed:', e.message);
    });
    processVotingItems(qIdx, items, index + 1, token, cardEl);
  }

  for (var s = 1; s <= 5; s++) {
    (function(star) {
      var btn = document.createElement('button');
      btn.textContent = '★';
      btn.title = star + ' star' + (star === 1 ? '' : 's');
      btn.style.cssText = 'font-size:2rem;background:none;border:none;cursor:pointer;color:#6b7280;transition:color .1s;padding:0.25rem';
      btn.onmouseover = function() {
        starContainer.querySelectorAll('button').forEach(function(b, bi) {
          b.style.color = bi < star ? '#fbbf24' : '#6b7280';
        });
      };
      btn.onmouseout = function() {
        starContainer.querySelectorAll('button').forEach(function(b) { b.style.color = '#6b7280'; });
      };
      btn.onclick = function() { advanceNext(star); };
      starContainer.appendChild(btn);
    })(s);
  }

  // Timer countdown
  var timerEnd = Date.now() + TIMER_SECS * 1000;
  timerInterval = setInterval(function() {
    if (voted) { clearInterval(timerInterval); return; }
    var remaining = Math.max(0, (timerEnd - Date.now()) / (TIMER_SECS * 1000));
    var barEl = document.getElementById('qs-vote-timer-bar');
    if (barEl) {
      barEl.style.width = (remaining * 100) + '%';
      barEl.className = 'h-2 transition-all ' + (remaining > 0.5 ? 'bg-yellow-400' : remaining > 0.2 ? 'bg-orange-400' : 'bg-red-500');
    }
    if (remaining <= 0) {
      clearInterval(timerInterval);
      advanceNext(3); // auto-rate 3 stars on timeout
    }
  }, 200);

  // Load image, game, or Blockbench model preview.
  var imgWrap = document.getElementById('qs-vcard-img-wrap');
  var votingQType = quiz.questions && quiz.questions[qIdx] && quiz.questions[qIdx].type;
  if (votingQType === 'blockbench_share') {
    if (imgWrap) {
      imgWrap.style.aspectRatio = 'auto';
      imgWrap.innerHTML = '<p style="color:#94a3b8;font-size:0.8rem;text-align:center;padding:1rem">Loading model...</p>';
    }
    loadBlockbenchShareModelText(qIdx, itemCode, token).then(function(loaded) {
      if (voted || !imgWrap) return;
      var bbH = Math.max(320, window.innerHeight - 220);
      renderBlockbenchModelViewer(imgWrap, loaded.text, { height: bbH, spin: true });
    }).catch(function(e) {
      if (imgWrap) imgWrap.innerHTML = '<p style="color:#f87171;font-size:0.8rem;text-align:center;padding:1rem">Could not load model: ' + escapeHtml(e.message) + '</p>';
    });
    return;
  }
  if (votingQType === 'pyscratch_share') {
    // Show game iframe instead of image — download SB3 and load into PyScratch player
    if (imgWrap) {
      imgWrap.innerHTML = '<p style="color:#94a3b8;font-size:0.8rem;text-align:center;padding:1rem">Loading game…</p>';
    }
    window.driveFetchFileAsDataUrl(item.fileId, token).then(function(dataUrl) {
      if (voted || !imgWrap) return;
      // dataUrl is base64 of the SB3 zip — convert back to blob URL
      fetch(dataUrl).then(function(r) { return r.blob(); }).then(function(sb3Blob) {
        if (voted || !imgWrap) return;
        var blobUrl = URL.createObjectURL(sb3Blob);
        var gameFrame = document.createElement('iframe');
        gameFrame.style.cssText = 'display:block;width:100%;aspect-ratio:17/10;border:none;background:#000';
        gameFrame.sandbox = 'allow-scripts allow-same-origin';
        gameFrame.allow = 'microphone; camera';
        imgWrap.innerHTML = '';
        imgWrap.appendChild(gameFrame);
        // Load PyScratch in player mode with the SB3 blob URL
        gameFrame.src = 'scratch/editor.html?pyscratch=1&project_url=' + encodeURIComponent(blobUrl);
        gameFrame.onload = function() {
          setTimeout(function() {
            try { gameFrame.contentWindow.postMessage({ type: 'PS_PLAYER_MODE' }, '*'); } catch(_) {}
            // Revoke blob URL after iframe has loaded it
            setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 3000);
          }, 2500);
        };
      });
    }).catch(function(e) {
      if (imgWrap) imgWrap.innerHTML = '<p style="color:#f87171;font-size:0.8rem;text-align:center;padding:1rem">Could not load game</p>';
      console.warn('[Voting] Game load failed:', e.message);
    });
    return; // skip the normal image fetch below
  }
  window.driveFetchFileAsDataUrl(item.fileId, token).then(function(dataUrl) {
    if (voted || !imgWrap) return;
    imgWrap.innerHTML = '';
    var img = document.createElement('img');
    img.src = dataUrl;
    var isPixelArtVote = votingQType === 'pixel_art';
    var isTshirtVote = votingQType === 'tshirt';
    var containV = isPixelArtVote || isTshirtVote;
    img.style.cssText = 'display:block;width:100%;aspect-ratio:' + (containV ? '1' : '17/10') + ';object-fit:' + (containV ? 'contain' : 'cover') + ';' + (isPixelArtVote ? 'image-rendering:pixelated;background:#000;' : (isTshirtVote ? 'background:#334155;' : ''));
    imgWrap.appendChild(img);
  }).catch(function() {
    if (imgWrap) imgWrap.textContent = 'Could not load image';
  });
}

async function renderStudentShowcase(qIdx) {
  setStudentView('showcase');
  var gridEl = document.getElementById('qs-showcase-grid');
  gridEl.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading top submissions…</p>';

  var snap = await quiz.sessionRef.child('showcaseItems/' + qIdx).get();
  var items = snap.exists() ? Object.values(snap.val()).filter(Boolean) : [];
  var medals = ['🥇', '🥈', '🥉'];

  if (!items.length) {
    gridEl.innerHTML = '<p class="text-gray-400 text-sm text-center">No results yet.</p>';
    return;
  }

  // Get Drive token (use cached, prompt if needed)
  var token = null;
  try {
    token = await window.driveEnsureStudentToken(null);
  } catch(e) {
    // No token — show without images
  }

  gridEl.innerHTML = '';
  var showcaseQType = quiz.questions && quiz.questions[qIdx] && quiz.questions[qIdx].type;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var avg = typeof item.avg === 'number' ? item.avg.toFixed(1) : '–';
    var card = document.createElement('div');
    card.className = 'bg-gray-800 rounded-xl overflow-hidden border border-gray-700';
    var header = document.createElement('div');
    header.className = 'flex items-center justify-between px-4 py-2';
    var code = item.code || item.uid || '';
    var displayName = studentName(code) || item.name || code;
    header.innerHTML =
      '<span class="text-2xl">' + (medals[i] || (i+1)+'.') + '</span>' +
      '<span class="font-semibold text-gray-100 flex-1 mx-3 truncate">' + escapeHtml(displayName) + '</span>' +
      '<span class="text-yellow-400 font-bold text-sm shrink-0">' + avg + ' &#x2B50;</span>';
    card.appendChild(header);
    if (token && showcaseQType === 'blockbench_share') {
      var modelPlaceholder = document.createElement('div');
      modelPlaceholder.style.cssText = 'width:100%;aspect-ratio:17/10;background:#0f172a;display:flex;align-items:center;justify-content:center;color:#475569;font-size:0.8rem';
      modelPlaceholder.textContent = 'Loading model...';
      card.appendChild(modelPlaceholder);
      (function(ph, codeForModel, tkn) {
        loadBlockbenchShareModelText(qIdx, codeForModel, tkn).then(function(loaded) {
          renderBlockbenchModelViewer(ph, loaded.text, { height: 320, spin: true });
        }).catch(function() { ph.textContent = 'Could not load model'; });
      })(modelPlaceholder, code, token);
    } else if (item.fileId && token) {
      var imgPlaceholder = document.createElement('div');
      imgPlaceholder.style.cssText = 'width:100%;aspect-ratio:17/10;background:#0f172a;display:flex;align-items:center;justify-content:center;color:#475569;font-size:0.8rem';
      imgPlaceholder.textContent = 'Loading…';
      card.appendChild(imgPlaceholder);
      (function(ph, fileId, tkn) {
        window.driveFetchFileAsDataUrl(fileId, tkn).then(function(dataUrl) {
          ph.innerHTML = '';
          ph.style.cssText = '';
          var img = document.createElement('img');
          img.src = dataUrl;
          var isPAShowcase = showcaseQType === 'pixel_art';
          var isTshirtShowcase = showcaseQType === 'tshirt';
          var containS = isPAShowcase || isTshirtShowcase;
          img.style.cssText = 'display:block;width:100%;aspect-ratio:' + (containS ? '1' : '17/10') + ';object-fit:' + (containS ? 'contain' : 'cover') + ';' + (isPAShowcase ? 'image-rendering:pixelated;background:#000;' : (isTshirtShowcase ? 'background:#334155;' : ''));
          ph.appendChild(img);
        }).catch(function() { ph.textContent = 'Could not load image'; });
      })(imgPlaceholder, item.fileId, token);
    }
    gridEl.appendChild(card);
  }
}

function renderStudentLeaderboard(lb) {
  // Cache so "Load names" can re-render after populating nameMap
  quiz._lastStudentLeaderboard = Array.isArray(lb) ? lb : Object.values(lb);
  var el = document.getElementById('qs-final-score');
  var total = quizMaxScore(quiz.questions);
  var isTshirtContest = (quiz.questions || []).some(function(q) { return q && q.type === 'tshirt_contest'; });
  var isBlockbenchContest = (quiz.questions || []).some(function(q) { return q && q.type === 'blockbench_contest'; });
  var isContest = isTshirtContest || isBlockbenchContest;
  var medals = ['🥇','🥈','🥉'];
  var lbArr = quiz._lastStudentLeaderboard;

  var hasMedia = (quiz.questions || []).some(function(q) {
    return q.type === 'canvas' || q.type === 'pyscratch_share' || q.type === 'blockbench_share' || q.type === 'pixel_art' || q.type === 'tshirt';
  }) || isContest;

  el.innerHTML = '';
  var container = document.createElement('div');
  container.className = 'space-y-2 mt-4 w-full max-w-xl mx-auto';

  lbArr.forEach(function(entry, i) {
    var isMe = entry.code === state.uid;
    var row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-4 rounded-lg px-6 py-3 ' +
      (isMe ? 'bg-yellow-600/40 border border-yellow-400' : 'bg-white/10') +
      (hasMedia ? ' cursor-pointer hover:bg-white/20 transition-colors select-none' : '');
    row.innerHTML =
      '<span class="text-lg shrink-0">' + (medals[i] || (i+1)+'.') + '</span>' +
      '<span class="font-mono flex-1 text-sm text-left ' + (isMe ? 'text-yellow-300 font-bold' : 'text-gray-300') + '">' +
      escapeHtml(studentName(entry.code) || entry.code) + (isMe ? ' (you)' : '') + '</span>' +
      (hasMedia ? '<span class="text-gray-500 text-xs shrink-0">🖼</span>' : '') +
      '<span class="font-bold text-yellow-400 text-right shrink-0">' + (isContest ? escapeHtml(entry.label || (entry.score + ' wins')) : (entry.score + '/' + total)) + '</span>';

    if (hasMedia) {
      row.title = 'Click to view their submission';
      row.onclick = function() { showStudentWorkForCode(entry.code); };
    }
    container.appendChild(row);
  });

  el.appendChild(container);
  if (isTshirtContest) appendStudentTshirtContestSummary(el);
  if (isBlockbenchContest) appendStudentBlockbenchContestSummary(el);
}

function appendStudentTshirtContestSummary(el) {
  if (!el || (!quiz.sessionRef && !quiz.lobbyCode)) return;
  var holder = document.createElement('div');
  holder.className = 'mt-6 w-full max-w-xl mx-auto text-left';
  holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-gray-400 text-sm text-center">Loading bracket results...</p>';
  el.appendChild(holder);
  getStudentTshirtContestData().then(function(contest) {
    var rounds = tshirtContestValues(contest.rounds).sort(function(a, b) { return (a.index || 0) - (b.index || 0); });
    if (!rounds.length) {
      holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-gray-400 text-sm text-center">No bracket results recorded.</p>';
      return;
    }
    holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3>';
    rounds.forEach(function(round) {
      var section = document.createElement('div');
      section.className = 'rounded-lg bg-white/10 border border-white/10 p-4 mb-3';
      var brackets = tshirtContestValues(round.brackets);
      section.innerHTML =
        '<div class="font-bold text-yellow-300 mb-2">Round ' + ((round.index || 0) + 1) + ': ' + escapeHtml(round.topic || 'Computing') + '</div>' +
        '<div class="space-y-2">' + brackets.map(function(bracket, idx) {
          var entrants = tshirtContestValues(bracket.entrants).map(function(code) { return studentName(code) || code; }).join(' vs ');
          var winner = bracket.winner ? (studentName(bracket.winner) || bracket.winner) : 'No winner';
          return '<div class="flex items-center justify-between gap-3 text-sm bg-black/20 rounded px-3 py-2">' +
            '<span class="text-gray-300 truncate">Bracket ' + (idx + 1) + ': ' + escapeHtml(entrants) + '</span>' +
            '<span class="text-green-300 font-bold shrink-0">' + escapeHtml(winner) + '</span>' +
          '</div>';
        }).join('') + '</div>';
      holder.appendChild(section);
    });
  }).catch(function(e) {
    holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-red-300 text-sm text-center">Could not load bracket results: ' + escapeHtml(e.message) + '</p>';
  });
}

function appendStudentBlockbenchContestSummary(el) {
  if (!el || (!quiz.sessionRef && !quiz.lobbyCode)) return;
  var holder = document.createElement('div');
  holder.className = 'mt-6 w-full max-w-xl mx-auto text-left';
  holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-gray-400 text-sm text-center">Loading bracket results...</p>';
  el.appendChild(holder);
  getStudentBlockbenchContestData().then(function(contest) {
    var rounds = tshirtContestValues(contest.rounds).sort(function(a, b) { return (a.index || 0) - (b.index || 0); });
    if (!rounds.length) {
      holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-gray-400 text-sm text-center">No bracket results recorded.</p>';
      return;
    }
    holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3>';
    rounds.forEach(function(round) {
      var section = document.createElement('div');
      section.className = 'rounded-lg bg-white/10 border border-white/10 p-4 mb-3';
      var brackets = tshirtContestValues(round.brackets);
      section.innerHTML =
        '<div class="font-bold text-yellow-300 mb-2">Round ' + ((round.index || 0) + 1) + ': ' + escapeHtml(round.topic || 'Game asset') + '</div>' +
        '<div class="space-y-2">' + brackets.map(function(bracket, idx) {
          var entrants = tshirtContestValues(bracket.entrants).map(function(code) { return studentName(code) || code; }).join(' vs ');
          var winner = bracket.winner ? (studentName(bracket.winner) || bracket.winner) : 'No winner';
          return '<div class="flex items-center justify-between gap-3 text-sm bg-black/20 rounded px-3 py-2">' +
            '<span class="text-gray-300 truncate">Bracket ' + (idx + 1) + ': ' + escapeHtml(entrants) + '</span>' +
            '<span class="text-green-300 font-bold shrink-0">' + escapeHtml(winner) + '</span>' +
          '</div>';
        }).join('') + '</div>';
      holder.appendChild(section);
    });
  }).catch(function(e) {
    holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-red-300 text-sm text-center">Could not load bracket results: ' + escapeHtml(e.message) + '</p>';
  });
}

async function showStudentTshirtContestWorkForCode(code) {
  var name = studentName(code) || code;
  var initialItem = studentTshirtContestCurrentItem();
  var token = null;
  try {
    token = await window.driveEnsureStudentToken(null);
  } catch(e) {
    alert('Google Drive access is required to view designs. Please sign in again.');
    return;
  }

  var contest = await getStudentTshirtContestData();
  var item = studentTshirtContestItemConfig(contest.config || initialItem);
  var submissions = contest.submissions || {};
  var rounds = tshirtContestValues(contest.rounds).sort(function(a, b) {
    return (a.index || 0) - (b.index || 0);
  });

  var overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);' +
    'display:flex;flex-direction:column;align-items:center;overflow-y:auto;padding:2rem 1rem';

  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:760px';

  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;gap:1rem';
  var titleEl = document.createElement('h2');
  titleEl.style.cssText = 'color:#f1f5f9;font-size:1.25rem;font-weight:700;margin:0';
  titleEl.textContent = name + "'s " + item.itemPluralLabel;
  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'background:#334155;color:#f1f5f9;border:none;border-radius:6px;' +
    'padding:0.4rem 1rem;cursor:pointer;font-size:0.9rem;font-weight:600';
  closeBtn.onclick = function() { document.body.removeChild(overlay); };
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  inner.appendChild(header);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  var shown = 0;
  rounds.forEach(function(round) {
    var roundIndex = Number(round.index) || 0;
    var bracket = tshirtContestValues(round.brackets).find(function(b) {
      return tshirtContestValues(b.entrants).indexOf(code) !== -1;
    });
    var sub = submissions[roundIndex] && submissions[roundIndex][code];
    if (!bracket && !sub) return;
    shown++;

    var section = document.createElement('div');
    section.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;border:1px solid #334155';
    var entrants = bracket ? tshirtContestValues(bracket.entrants).map(function(uid) { return studentName(uid) || uid; }).join(' vs ') : 'No bracket recorded';
    var status = bracket && bracket.winner
      ? (bracket.winner === code ? 'Won this bracket' : 'Winner: ' + (studentName(bracket.winner) || bracket.winner))
      : 'No result recorded';
    section.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:0.75rem">' +
        '<div>' +
          '<div style="color:#fbbf24;font-weight:700">Round ' + (roundIndex + 1) + ': ' + escapeHtml(round.topic || 'Computing') + '</div>' +
          '<div style="color:#94a3b8;font-size:0.78rem;margin-top:0.2rem">' + escapeHtml(entrants) + '</div>' +
        '</div>' +
        '<div style="color:' + (bracket && bracket.winner === code ? '#4ade80' : '#cbd5e1') + ';font-size:0.78rem;font-weight:700;text-align:right;flex-shrink:0">' + escapeHtml(status) + '</div>' +
      '</div>' +
      '<div class="tsc-contest-shirt-img" style="min-height:220px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:0.85rem">Loading design...</div>';
    inner.appendChild(section);

    var imgWrap = section.querySelector('.tsc-contest-shirt-img');
    if (!sub || !sub.fileId) {
      imgWrap.textContent = 'No design submitted for this round.';
      return;
    }
    if (tshirtContestSubmissionBlocked(sub)) {
      renderStudentTshirtBlockedSquare(imgWrap);
      return;
    }
    window.driveFetchFileAsDataUrl(sub.fileId, token).then(function(dataUrl) {
      imgWrap.innerHTML = '';
      var img = document.createElement('img');
      img.src = dataUrl;
      img.style.cssText = 'display:block;width:100%;max-width:420px;margin:0 auto;background:#334155;border-radius:8px;padding:6px;box-sizing:border-box';
      imgWrap.appendChild(img);
    }).catch(function(e) {
      imgWrap.textContent = 'Could not load design: ' + (e.message || 'Drive error');
    });
  });

  if (!shown) {
    var empty = document.createElement('div');
    empty.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;color:#94a3b8;text-align:center';
    empty.textContent = 'No ' + item.itemPluralLabel + ' were recorded for this student.';
    inner.appendChild(empty);
  }
}

async function showStudentBlockbenchContestWorkForCode(code) {
  var name = studentName(code) || code;
  var token = null;
  try {
    token = await window.driveEnsureStudentToken(null);
  } catch(e) {
    alert('Google Drive access is required to view models. Please sign in again.');
    return;
  }

  var contest = await getStudentBlockbenchContestData();
  var submissions = contest.submissions || {};
  var rounds = tshirtContestValues(contest.rounds).sort(function(a, b) {
    return (a.index || 0) - (b.index || 0);
  });

  var overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);' +
    'display:flex;flex-direction:column;align-items:center;overflow-y:auto;padding:2rem 1rem';

  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:820px';

  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;gap:1rem';
  var titleEl = document.createElement('h2');
  titleEl.style.cssText = 'color:#f1f5f9;font-size:1.25rem;font-weight:700;margin:0';
  titleEl.textContent = name + "'s Blockbench models";
  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'background:#334155;color:#f1f5f9;border:none;border-radius:6px;' +
    'padding:0.4rem 1rem;cursor:pointer;font-size:0.9rem;font-weight:600';
  closeBtn.onclick = function() { document.body.removeChild(overlay); };
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  inner.appendChild(header);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  var shown = 0;
  rounds.forEach(function(round) {
    var roundIndex = Number(round.index) || 0;
    var bracket = tshirtContestValues(round.brackets).find(function(b) {
      return tshirtContestValues(b.entrants).indexOf(code) !== -1;
    });
    var sub = submissions[roundIndex] && submissions[roundIndex][code];
    if (!bracket && !sub) return;
    shown++;

    var section = document.createElement('div');
    section.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;border:1px solid #334155';
    var entrants = bracket ? tshirtContestValues(bracket.entrants).map(function(uid) { return studentName(uid) || uid; }).join(' vs ') : 'No bracket recorded';
    var status = bracket && bracket.winner
      ? (bracket.winner === code ? 'Won this bracket' : 'Winner: ' + (studentName(bracket.winner) || bracket.winner))
      : 'No result recorded';
    section.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:0.75rem">' +
        '<div>' +
          '<div style="color:#fbbf24;font-weight:700">Round ' + (roundIndex + 1) + ': ' + escapeHtml(round.topic || 'Game asset') + '</div>' +
          '<div style="color:#94a3b8;font-size:0.78rem;margin-top:0.2rem">' + escapeHtml(entrants) + '</div>' +
        '</div>' +
        '<div style="color:' + (bracket && bracket.winner === code ? '#4ade80' : '#cbd5e1') + ';font-size:0.78rem;font-weight:700;text-align:right;flex-shrink:0">' + escapeHtml(status) + '</div>' +
      '</div>' +
      '<div class="bbc-contest-model" style="min-height:260px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:0.85rem">Loading model...</div>';
    inner.appendChild(section);

    var modelWrap = section.querySelector('.bbc-contest-model');
    if (!sub || !sub.fileId) {
      modelWrap.textContent = 'No model submitted for this round.';
      return;
    }
    if (blockbenchContestSubmissionBlocked(sub)) {
      renderStudentTshirtBlockedSquare(modelWrap);
      return;
    }
    window.driveFetchFileAsText(sub.fileId, token).then(function(text) {
      renderBlockbenchModelViewer(modelWrap, text, { height: 460, spin: true });
    }).catch(function(e) {
      modelWrap.textContent = 'Could not load model: ' + (e.message || 'Drive error');
    });
  });

  if (!shown) {
    var empty = document.createElement('div');
    empty.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;color:#94a3b8;text-align:center';
    empty.textContent = 'No Blockbench models were recorded for this student.';
    inner.appendChild(empty);
  }
}

async function showStudentWorkForCode(code) {
  var name = studentName(code) || code;
  var isTshirtContest = (quiz.questions || []).some(function(q) { return q && q.type === 'tshirt_contest'; });
  var isBlockbenchContest = (quiz.questions || []).some(function(q) { return q && q.type === 'blockbench_contest'; });
  if (isTshirtContest) {
    await showStudentTshirtContestWorkForCode(code);
    return;
  }
  if (isBlockbenchContest) {
    await showStudentBlockbenchContestWorkForCode(code);
    return;
  }

  var mediaQs = (quiz.questions || []).map(function(q, i) {
    return { q: q, idx: i };
  }).filter(function(item) {
    return item.q.type === 'canvas' || item.q.type === 'pyscratch_share' || item.q.type === 'blockbench_share' || item.q.type === 'pixel_art' || item.q.type === 'tshirt';
  });
  if (!mediaQs.length) return;

  // Ensure Drive token
  var token = null;
  try {
    token = await window.driveEnsureStudentToken(null);
  } catch(e) {
    alert('Google Drive access is required to view submissions. Please sign in again.');
    return;
  }

  // Build overlay
  var overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);' +
    'display:flex;flex-direction:column;align-items:center;overflow-y:auto;padding:2rem 1rem';

  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:680px';

  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem';
  var titleEl = document.createElement('h2');
  titleEl.style.cssText = 'color:#f1f5f9;font-size:1.25rem;font-weight:700;margin:0';
  titleEl.textContent = name + '’s Work';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ Close';
  closeBtn.style.cssText =
    'background:#334155;color:#f1f5f9;border:none;border-radius:6px;' +
    'padding:0.4rem 1rem;cursor:pointer;font-size:0.9rem;font-weight:600';
  closeBtn.onclick = function() {
    overlay.querySelectorAll('iframe[data-bloburl]').forEach(function(iframe) {
      try { URL.revokeObjectURL(iframe.dataset.bloburl); } catch(e) {}
    });
    document.body.removeChild(overlay);
  };
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  inner.appendChild(header);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  mediaQs.forEach(function(mq) {
    var section = document.createElement('div');
    section.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem';

    var qLabel = document.createElement('p');
    qLabel.style.cssText = 'color:#64748b;font-size:0.78rem;margin:0 0 0.75rem';
    qLabel.textContent = 'Q' + (mq.idx + 1) + ': ' + (mq.q.q || '');
    section.appendChild(qLabel);

    var contentEl = document.createElement('div');
    contentEl.innerHTML = '<p style="color:#64748b;font-size:0.85rem">Loading…</p>';
    section.appendChild(contentEl);
    inner.appendChild(section);

    (function(mq, contentEl) {
      var qType = mq.q.type;
      // Gallery is Drive-only — look up folder ID with localStorage fallback so
      // it still works after the Firebase session is cleaned up (30 s after end).
      getQuizStudentFolderId(code).then(function(folderId) {
        if (!folderId) {
          contentEl.innerHTML = '<p style="color:#64748b;font-size:0.85rem;text-align:center;padding:1rem 0">No Drive folder found for this student.</p>';
          return;
        }
        if (qType === 'blockbench_share') {
          loadBlockbenchShareModelText(mq.idx, code, token).then(function(loaded) {
            renderBlockbenchModelViewer(contentEl, loaded.text, { height: 480, spin: true });
          }).catch(function(e) {
            contentEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem">Could not load model: ' + escapeHtml(e.message) + '</p>';
          });
          return;
        }
        // For canvas / pixel_art / pyscratch_share: find the file by its known
        // filename rather than reading the fileId from Firebase (which may be gone).
        var filename =
          qType === 'pixel_art'    ? code + '-pixel-art.png' :
          qType === 'tshirt'       ? code + '-tshirt.png' :
          qType === 'pyscratch_share' ? code + '.sb3' :
          code + '.png'; // canvas
        window.driveFindLatestFileByName(folderId, filename, token).then(function(file) {
          if (!file) {
            contentEl.innerHTML = '<p style="color:#64748b;font-size:0.85rem;text-align:center;padding:1rem 0">No submission.</p>';
            return;
          }
          return window.driveFetchFileAsDataUrl(file.id, token).then(function(dataUrl) {
            contentEl.innerHTML = '';
            if (qType === 'canvas') {
              var img = document.createElement('img');
              img.src = dataUrl;
              img.style.cssText = 'width:100%;border-radius:8px;display:block';
              contentEl.appendChild(img);
            } else if (qType === 'pyscratch_share') {
              fetch(dataUrl).then(function(r) { return r.blob(); }).then(function(sb3Blob) {
                var blobUrl = URL.createObjectURL(sb3Blob);
                var iframe = document.createElement('iframe');
                iframe.src = 'scratch/editor.html?pyscratch=1&project_url=' + encodeURIComponent(blobUrl);
                iframe.style.cssText = 'width:100%;height:420px;border:none;border-radius:8px;display:block;background:#000';
                iframe.dataset.bloburl = blobUrl;
                iframe.allow = 'microphone; camera';
                contentEl.appendChild(iframe);
                setTimeout(function() {
                  try { iframe.contentWindow.postMessage({ type: 'PS_PLAYER_MODE' }, '*'); } catch(e) {}
                }, 2500);
              });
            } else if (qType === 'pixel_art') {
              var img = document.createElement('img');
              img.src = dataUrl;
              img.style.cssText = 'display:block;width:100%;max-width:512px;image-rendering:pixelated;image-rendering:crisp-edges;background:#000;border-radius:8px';
              contentEl.appendChild(img);
            } else if (qType === 'tshirt') {
              var timg = document.createElement('img');
              timg.src = dataUrl;
              timg.style.cssText = 'display:block;width:100%;max-width:420px;margin:0 auto;background:#334155;border-radius:8px;padding:6px;box-sizing:border-box';
              contentEl.appendChild(timg);
            }
          });
        }).catch(function(e) {
          contentEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem">Could not load: ' + escapeHtml(e.message) + '</p>';
        });
      }).catch(function(e) {
        contentEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem">Error: ' + escapeHtml(e.message) + '</p>';
      });
    })(mq, contentEl);
  });
}

// ── Load names from Drive (student finished screen) ────────────
// Uses the same student Google token and code spreadsheet from login.
// All rows in every sheet tab are parsed and mapped code → display name.
// Names are stored only in state.nameMap / localStorage — never in Firebase.
document.getElementById('btn-qs-load-names').onclick = async function() {
  var btn    = this;
  var status = document.getElementById('qs-load-names-status');
  btn.disabled    = true;
  btn.textContent = '⏳ Connecting…';
  status.textContent = '';
  status.style.color = '#94a3b8';

  try {
    // requestGoogleStudentToken() is in auth-module.js and must be called
    // directly from this onclick to keep the browser's user-gesture chain.
    if (!window.googleStudentAccessToken) {
      await requestGoogleStudentToken();
    }

    btn.textContent = '⏳ Finding sheet…';

    // Reuse the cached spreadsheet ID from login (sessionStorage) if available
    var spreadsheetId = sessionStorage.getItem('pylearn_student_sheet_id');
    if (!spreadsheetId) {
      var sheet = await findGoogleCodeSpreadsheet();
      if (!sheet) throw new Error('Could not find the code spreadsheet in Drive.');
      spreadsheetId = sheet.id;
      sessionStorage.setItem('pylearn_student_sheet_id', spreadsheetId);
    }

    btn.textContent = '⏳ Reading names…';

    // Single API call returns all sheet tabs with all cell values
    var sheetData = await fetchAllStudentSheetData(spreadsheetId);

    var imported = 0;
    sheetData.forEach(function(sheet) {
      var cols      = googleLookupHeaderIndexes(sheet.rows[0] || []);
      var hasHeader = cols.email != null || cols.name != null ||
                      cols.firstName != null || cols.code != null;
      for (var r = hasHeader ? 1 : 0; r < sheet.rows.length; r++) {
        var candidate = googleLookupRowToCandidate(
          sheet.rows[r], sheet.title, hasHeader ? cols : null
        );
        if (candidate && candidate.code && candidate.displayName) {
          state.nameMap[candidate.code] = candidate.displayName;
          imported++;
        }
      }
    });

    // Persist locally — no Firebase write
    if (imported) {
      try { localStorage.setItem('pylearn_name_map', JSON.stringify(state.nameMap)); } catch(_e) {}
    }

    // Re-render leaderboard with names now showing
    if (quiz._lastStudentLeaderboard && quiz._lastStudentLeaderboard.length) {
      renderStudentLeaderboard(quiz._lastStudentLeaderboard);
    }

    btn.textContent    = '✓ ' + imported + ' names loaded';
    status.textContent = imported
      ? ''
      : 'No names found — check the sheet format.';
    status.style.color = imported ? '#4ade80' : '#fbbf24';
  } catch(e) {
    btn.textContent    = '📋 Load names';
    btn.disabled       = false;
    status.textContent = '⚠ ' + (e.message || 'Failed');
    status.style.color = '#f87171';
  }
};
