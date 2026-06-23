function lockStudentAnswers() {
  document.querySelectorAll('.quiz-ans-btn').forEach(function(btn) {
    btn.disabled = true; btn.style.opacity = '0.5';
  });
  var textInput = document.getElementById('qs-text-input');
  var textBtn = document.getElementById('btn-quiz-submit-text');
  if (textInput) textInput.disabled = true;
  if (textBtn) textBtn.disabled = true;
  var widgetBtn = document.getElementById('btn-quiz-submit-widget');
  if (widgetBtn) widgetBtn.disabled = true;
  var spreadsheetBtn = document.getElementById('btn-quiz-submit-spreadsheet');
  if (spreadsheetBtn) spreadsheetBtn.disabled = true;
  var codeInput = document.getElementById('qs-code-input');
  var codeBtn = document.getElementById('btn-quiz-submit-code');
  if (codeInput) codeInput.disabled = true;
  if (codeBtn) codeBtn.disabled = true;
  var scratchBtn = document.getElementById('btn-quiz-submit-scratch');
  if (scratchBtn) scratchBtn.disabled = true;
  var scratchWrap = document.getElementById('qs-scratch-wrap');
  if (scratchWrap && scratchWrap.classList.contains('qs-scratch-fullscreen')) toggleQsScratchFullscreen();
  var blockbenchBtn = document.getElementById('btn-quiz-submit-blockbench');
  if (blockbenchBtn) blockbenchBtn.disabled = true;
  var blockbenchWrap = document.getElementById('qs-blockbench-wrap');
  if (blockbenchWrap && blockbenchWrap.classList.contains('qs-blockbench-fullscreen')) toggleQsBlockbenchFullscreen();
  var pyBotWrap = document.getElementById('qs-pybot-wrap');
  if (pyBotWrap && pyBotWrap.classList.contains('qs-pybot-fullscreen')) toggleQsPyBotFullscreen();
  if (window._qsPyBotMsg) { window.removeEventListener('message', window._qsPyBotMsg); window._qsPyBotMsg = null; }
  var pyScratchBtn = document.getElementById('btn-quiz-submit-pyscratch');
  if (pyScratchBtn) pyScratchBtn.disabled = true;
  var pyScratchWrap = document.getElementById('qs-pyscratch-wrap');
  if (pyScratchWrap && pyScratchWrap.classList.contains('qs-pyscratch-fullscreen')) toggleQsPyScratchFullscreen();
}

async function submitStudentAnswer(qIdx, answerIdx, btn) {
  if (quiz.myAnswered) return;
  quiz.myAnswered = true;
  lockStudentAnswers();
  btn.style.opacity = '1';  // highlight chosen
  btn.style.outline = '3px solid white';

  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    answer: answerIdx,
    answeredAt: Date.now(),
  });

  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-answer-grid').classList.add('hidden');
}

async function submitStudentWidgetAnswer(qIdx) {
  if (quiz.myAnswered || !quiz.currentWidget) return;
  var q = quiz.questions[qIdx];
  var typed = quiz.currentWidget.getAnswer().trim().toUpperCase();
  var expected = String(q.answer || '').trim().toUpperCase();
  var correct = typed === expected;
  quiz.myAnswered = true;
  lockStudentAnswers();
  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    answerText: typed,
    correct: correct,
    answeredAt: Date.now(),
  });
  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-widget-answer').classList.add('hidden');
}

function quizCellToCoords(cell) {
  var m = String(cell || '').toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
  if (!m) return null;
  var x = 0;
  for (var i = 0; i < m[1].length; i++) x = x * 26 + (m[1].charCodeAt(i) - 64);
  return { x: x - 1, y: parseInt(m[2], 10) - 1 };
}

function normaliseFormulaText(value) {
  return String(value == null ? '' : value).toUpperCase().replace(/\s+/g, '');
}

function spreadsheetCellSnapshot(sheet, cell) {
  var pos = quizCellToCoords(cell);
  if (!pos) return { raw: '', value: '' };
  return {
    raw: sheet.getValueFromCoords(pos.x, pos.y, false),
    value: sheet.getValueFromCoords(pos.x, pos.y, true)
  };
}

function spreadsheetCellFormat(sheet, cell) {
  var fmts = sheet && sheet._jhnccNumberFormats ? sheet._jhnccNumberFormats : {};
  return (fmts[cell] && fmts[cell].type) || 'general';
}

function validateQuizSpreadsheet(q) {
  if (!quiz.currentSpreadsheet || !quiz.currentSpreadsheet.sheet) {
    return { correct: false, message: 'Spreadsheet not ready.', summary: '' };
  }
  var sheet = quiz.currentSpreadsheet.sheet;
  var checks = Array.isArray(q.checks) ? q.checks : [];
  var messages = [];
  var summary = [];
  var allCorrect = checks.length > 0;

  checks.forEach(function(check) {
    var snap = spreadsheetCellSnapshot(sheet, check.cell);
    var raw = String(snap.raw == null ? '' : snap.raw);
    var rawNorm = normaliseFormulaText(raw);
    var display = String(snap.value == null ? '' : snap.value);
    var numeric = parseFloat(display);
    var ok = true;

    if (check.requireFormula !== false && raw.charAt(0) !== '=') {
      ok = false;
      messages.push(check.cell + ' needs a formula starting with =.');
    }
    if (ok && check.functionName && rawNorm.indexOf(String(check.functionName).toUpperCase() + '(') === -1) {
      ok = false;
      messages.push(check.cell + ' should use ' + String(check.functionName).toUpperCase() + '.');
    }
    if (ok && Array.isArray(check.formulaContains)) {
      check.formulaContains.forEach(function(part) {
        if (rawNorm.indexOf(normaliseFormulaText(part)) === -1) {
          ok = false;
        }
      });
      if (!ok) messages.push(check.cell + ' formula is missing an expected cell/range/operator.');
    }
    if (ok && check.expected != null) {
      var tolerance = check.tolerance != null ? Number(check.tolerance) : 0.01;
      if (isNaN(numeric) || Math.abs(numeric - Number(check.expected)) > tolerance) {
        ok = false;
        messages.push(check.cell + ' gives ' + display + ' but should calculate to ' + check.expected + '.');
      }
    }
    if (ok && check.expectedFormat) {
      var gotFormat = spreadsheetCellFormat(sheet, check.cell);
      if (gotFormat !== String(check.expectedFormat).toLowerCase()) {
        ok = false;
        messages.push(check.cell + ' should be formatted as ' + check.expectedFormat + '.');
      }
    }
    if (ok && check.expectedText != null) {
      var gotText = display.trim().toLowerCase();
      var expectedText = String(check.expectedText).trim().toLowerCase();
      if (gotText !== expectedText) {
        ok = false;
        messages.push(check.cell + ' gives "' + display + '" but should give "' + check.expectedText + '".');
      }
    }
    summary.push(check.cell + ': ' + raw + ' -> ' + display);
    if (!ok) allCorrect = false;
  });

  return {
    correct: allCorrect,
    message: allCorrect ? 'Submitted.' : (messages[0] || 'Check the requested cells and try again.'),
    summary: summary.join('\n')
  };
}

async function submitStudentSpreadsheetAnswer(qIdx) {
  if (quiz.myAnswered) return;
  var q = quiz.questions[qIdx];
  var btn = document.getElementById('btn-quiz-submit-spreadsheet');
  var fb = document.getElementById('qs-spreadsheet-feedback');
  if (btn) btn.disabled = true;
  if (fb) fb.textContent = 'Checking...';
  var validation = validateQuizSpreadsheet(q);
  quiz.myAnswered = true;
  lockStudentAnswers();

  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    answerText: validation.summary,
    correct: validation.correct,
    answeredAt: Date.now(),
  });

  if (fb) fb.textContent = validation.message;
  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-spreadsheet-answer').classList.add('hidden');
}

async function submitStudentTextAnswer(qIdx) {
  if (quiz.myAnswered) return;
  var q = quiz.questions[qIdx];
  var textInput = document.getElementById('qs-text-input');
  var typed = textInput.value.trim().toUpperCase().replace(/\s+/g, '');
  var expected = String(q.answer || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!typed) {
    document.getElementById('qs-text-feedback').textContent = 'Type your answer first.';
    return;
  }
  var correct = typed === expected;
  quiz.myAnswered = true;
  lockStudentAnswers();
  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    answerText: typed,
    correct: correct,
    answeredAt: Date.now(),
  });
  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-text-answer').classList.add('hidden');
}

async function validateQuizCode(q, code) {
  if (!code.trim()) return { correct: false, message: 'No code submitted.' };
  if (q.type === 'code_regex') {
    try {
      var re = new RegExp(q.pattern, q.flags || 'im');
      return { correct: re.test(code), message: re.test(code) ? 'Submitted.' : 'Submitted.' };
    } catch(e) {
      return { correct: false, message: 'Question validation error.' };
    }
  }
  if (q.type === 'code_output') {
    var result = await PyLearn.runPython(code, { inputs: q.inputs || [] });
    if (result.error) return { correct: false, message: 'Submitted with an error.' };
    var out = result.output.trim();
    var correct = false;
    if (q.expectedOutput != null) correct = out === String(q.expectedOutput).trim();
    else if (q.expectedContains != null) correct = out.toLowerCase().indexOf(String(q.expectedContains).toLowerCase()) !== -1;
    return { correct: correct, message: 'Submitted.' };
  }
  return { correct: false, message: 'Unknown code question type.' };
}

async function submitStudentCodeAnswer(qIdx) {
  if (quiz.myAnswered) return;
  var q = quiz.questions[qIdx];
  var codeInput = document.getElementById('qs-code-input');
  var fb = document.getElementById('qs-code-feedback');
  var code = codeInput.value;
  if (!code.trim()) {
    fb.textContent = 'Write your code first.';
    fb.className = 'quiz-code-feedback err';
    return;
  }
  document.getElementById('btn-quiz-submit-code').disabled = true;
  fb.textContent = 'Checking...';
  fb.className = 'quiz-code-feedback';
  var validation = await validateQuizCode(q, code);
  quiz.myAnswered = true;
  lockStudentAnswers();

  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    answerText: code,
    correct: validation.correct,
    answeredAt: Date.now(),
  });

  fb.textContent = validation.message;
  fb.className = 'quiz-code-feedback ' + (validation.correct ? 'ok' : 'err');
  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-code-answer').classList.add('hidden');
}

function renderStudentReveal(q, qIdx) {
  clearStudentTimer();
  setStudentView('reveal');
  if (!q) return;
  if (q.type === 'scratch_build') resetScratchQuizFrame();
  if (q.type === 'blockbench_build') resetBlockbenchQuizFrame();

  // Canvas questions get a gallery instead of the standard reveal
  if (q.type === 'canvas') {
    renderGalleryReveal(q, qIdx);
    return;
  }

  quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).get().then(function(snap) {
    var isTextInput = q.type === 'text_input';
    var isWidget = q.type === 'bit_input' || q.type === 'addition_input';
    var isScratch = q.type === 'scratch_build';
    var isPyBot = q.type === 'pybot_level';
    var isBlockbench = q.type === 'blockbench_build';
    var isSpreadsheet = q.type === 'spreadsheet_task';
    var isCodeQuestion = q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq' && !isTextInput && !isWidget && !isScratch && !isPyBot && !isBlockbench && !isSpreadsheet;
    var points = snap.exists() ? quizAnswerPoints(q, snap) : 0;
    var correct = points > 0;
    if (points > 0 && !quiz.myScored[qIdx]) {
      quiz.myScore += points;
      quiz.myScored[qIdx] = true;
    }
    document.getElementById('qs-reveal-result').textContent = isPyBot && snap.exists() ? ('Scored ' + points + ' point' + (points === 1 ? '' : 's')) : (correct ? 'Correct!' : 'Wrong');
    var revealEl = document.getElementById('qs-reveal-answer');
    if (isPyBot) {
      var medal = snap.exists() ? snap.child('medal').val() : '';
      var lines = snap.exists() ? snap.child('lines').val() : 0;
      revealEl.textContent = snap.exists() ? (pyBotMedalLabel(medal) + ' - ' + points + ' point' + (points === 1 ? '' : 's') + ' - ' + lines + ' line' + (lines === 1 ? '' : 's')) : 'Not completed';
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 whitespace-pre-wrap';
    } else if (isTextInput || isWidget) {
      revealEl.textContent = 'Answer: ' + q.answer;
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 font-mono whitespace-pre-wrap';
    } else if (isScratch) {
      revealEl.textContent = q.sampleAnswer || "See your teacher's screen";
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 whitespace-pre-wrap';
    } else if (isBlockbench) {
      revealEl.textContent = q.sampleAnswer || 'Model checked automatically';
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 whitespace-pre-wrap';
    } else if (isSpreadsheet) {
      revealEl.textContent = q.sampleAnswer || 'Spreadsheet task checked automatically';
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 whitespace-pre-wrap text-left';
    } else if (isCodeQuestion) {
      revealEl.textContent = 'Example: ' + (q.sampleAnswer || 'See teacher');
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 font-mono whitespace-pre-wrap text-left';
    } else {
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 whitespace-pre-wrap';
      renderTextWithBlocks(revealEl, 'Answer: ' + q.options[q.answer]);
    }
  });
}

document.getElementById('btn-quiz-student-exit').onclick = function() {
  if (confirm('Leave the quiz?')) exitStudentQuiz({ removePlayer: true });
};

// ── Gallery reveal (canvas questions) ─────────────────────────

function renderGalleryReveal(q, qIdx) {
  // Show gallery panel, hide standard reveal panel
  document.getElementById('qs-reveal-standard').classList.add('hidden');
  document.getElementById('qs-reveal-gallery').classList.remove('hidden');

  var grid      = document.getElementById('qs-gallery-grid');
  var statusEl  = document.getElementById('qs-gallery-status');
  grid.innerHTML  = '';
  statusEl.textContent = 'Loading submissions…';

  var votesRef = quiz.sessionRef.child('votes/' + qIdx);

  // submissions keyed by emailKey → { name, fileId, fileName, dataUrl }
  var submissions = {};
  var myVote = null;

  function renderGrid() {
    grid.innerHTML = '';
    var keys = Object.keys(submissions);
    if (!keys.length) { statusEl.textContent = 'No submissions yet.'; return; }
    var voted = myVote ? ' · You voted ✓' : ' · Tap to vote!';
    statusEl.textContent = keys.length + ' submission' + (keys.length === 1 ? '' : 's') + voted;

    keys.forEach(function(key) {
      var sub = submissions[key];
      var card = document.createElement('div');
      card.style.cssText = 'background:#1e293b;border-radius:8px;overflow:hidden;' +
        'border:2px solid ' + (myVote === key ? '#4ade80' : '#334155') +
        ';cursor:pointer;transition:border-color .2s';

      var label = document.createElement('p');
      label.textContent = sub.name || 'Student';
      label.style.cssText = 'font-size:0.75rem;color:#94a3b8;padding:4px 8px;text-align:center;margin:0';

      if (sub.dataUrl) {
        var img = document.createElement('img');
        img.src = sub.dataUrl;
        img.style.cssText = 'display:block;width:100%;aspect-ratio:17/10;object-fit:cover';
        card.appendChild(img);
      } else {
        var ph = document.createElement('div');
        ph.style.cssText = 'width:100%;aspect-ratio:17/10;background:#0f172a;display:flex;' +
          'align-items:center;justify-content:center;color:#475569;font-size:0.75rem';
        ph.textContent = sub.fileId ? 'Loading…' : 'Not submitted';
        card.appendChild(ph);
      }
      card.appendChild(label);

      card.onclick = function() {
        if (myVote === key || !sub.fileId) return;
        myVote = key;
        votesRef.child(state.uid).set(key).catch(function(e) {
          console.warn('[Gallery] Vote failed:', e.message);
        });
        renderGrid();
      };
      grid.appendChild(card);
    });
  }

  // Load student folders from Firebase, then fetch submitted files from Drive
  quiz.sessionRef.child('studentFolders').get().then(function(foldersSnap) {
    if (!foldersSnap.exists()) { statusEl.textContent = 'No student folders found.'; return; }
    var folders = foldersSnap.val(); // emailKey → { folderId, name, email }

    // Populate with placeholders
    Object.keys(folders).forEach(function(key) {
      submissions[key] = { name: folders[key].name, fileId: null, dataUrl: null };
    });
    renderGrid();

    // Get Drive token, then load each student's submitted file
    window.driveEnsureStudentToken(statusEl).then(function(token) {
      // Also look at Firebase answers to get the specific fileId for each submission
      quiz.sessionRef.child('answers/' + qIdx).get().then(function(answersSnap) {
        var answers = answersSnap.exists() ? answersSnap.val() : {};

        // Map uid→answer; we need to cross-reference with studentFolders by email
        // The answer stores { fileId, fileName }; look up by iterating studentFolders
        Object.keys(folders).forEach(function(key) {
          var folderId = folders[key].folderId;
          // Find file in Drive folder (student may have uploaded)
          window.driveListFolderFiles(folderId, token).then(function(files) {
            if (!files.length) return; // not submitted yet
            var file = files[0];
            submissions[key].fileId = file.id;
            renderGrid();
            // Fetch image
            window.driveFetchFileAsDataUrl(file.id, token).then(function(dataUrl) {
              submissions[key].dataUrl = dataUrl;
              renderGrid();
            }).catch(function(e) { console.warn('[Gallery] Image load failed:', key, e.message); });
          }).catch(function(e) { console.warn('[Gallery] Folder list failed:', key, e.message); });
        });
      });
    }).catch(function(e) {
      statusEl.textContent = '⚠️ Sign in to Google Drive to view the gallery.';
    });

    // Live vote updates
    votesRef.on('value', function(vSnap) {
      var votes = vSnap.val() || {};
      if (votes[state.uid]) myVote = votes[state.uid];
      renderGrid();
    });
  });
}

// Reset gallery state when leaving the reveal (called when a new question starts)
var _origSetStudentView = setStudentView;
setStudentView = function(view) {
  if (view !== 'reveal') {
    var std = document.getElementById('qs-reveal-standard');
    var gal = document.getElementById('qs-reveal-gallery');
    if (std) std.classList.remove('hidden');
    if (gal) gal.classList.add('hidden');
  }
  _origSetStudentView(view);
};

document.getElementById('btn-quiz-student-home').onclick = function() {
  exitStudentQuiz({ removePlayer: true });
};

document.getElementById('btn-quiz-rejoin').onclick = async function() {
  // Remove kicked flag and re-join
  if (!quiz.sessionRef) return;
  var result = await quiz.sessionRef.child('players/' + state.uid).transaction(function(current) {
    if (!current) return;
    return { joinedAt: Date.now(), kicked: false };
  });
  if (result.committed) setStudentView('lobby');
};

function exitStudentQuiz(opts) {
  opts = opts || {};
  if (quiz.forced && !opts.keepForced && !opts.displaced) return;
  clearStudentTimer();
  if (quiz.missingSessionTimer) {
    clearTimeout(quiz.missingSessionTimer);
    quiz.missingSessionTimer = null;
  }
  quiz.unsubscribers.forEach(function(fn) { fn(); });
  quiz.unsubscribers = [];
  if (opts.removePlayer && quiz.sessionRef) {
    quiz.sessionRef.child('players/' + state.uid).remove();
  }
  quiz.sessionRef = null;
  quiz.forced = false;
  if (opts.displaced) {
    showQuizDisplacedMessage();
  } else {
    document.getElementById('quiz-student-screen').classList.add('hidden');
  }
  updateForcedQuizChrome();
}

// ── Wire up join quiz button visibility ────────────────────────
var _origUpdateAuthUI = updateAuthUI;
updateAuthUI = function(first, last, isAdmin) {
  _origUpdateAuthUI(first, last, isAdmin);
  var show = !!first && !isAdmin;
  document.getElementById('btn-join-quiz').classList.toggle('hidden', !show);
};

// ── Init lobby code input: numbers only, auto-submit at 4 digits ─
document.getElementById('input-lobby-code').addEventListener('input', function() {
  this.value = this.value.replace(/[^0-9]/g, '').slice(0, 4);
  if (this.value.length === 4) document.getElementById('btn-join-quiz-submit').click();
});

// ── Init quiz setup radio handler
document.querySelectorAll('input[name="quiz-mode"]').forEach(function(r) {
  r.onchange = function() {
    var isCustom = this.value === 'custom';
    document.getElementById('quiz-quick-opts').classList.toggle('hidden', isCustom);
    document.getElementById('quiz-custom-opts').classList.toggle('hidden', !isCustom);
  };
});

// ── Init ──────────────────────────────────────────────────────
loadApp().catch(function(e) {
  document.getElementById('loading-screen').innerHTML =
    '<div class="text-center text-red-500"><p class="font-semibold">Failed to load</p><p class="text-sm mt-1">'+e.message+'</p><p class="text-xs mt-2 text-gray-400">Ensure config/firebase.json and lessons/index.json exist and you are serving over HTTP.</p></div>';
});
