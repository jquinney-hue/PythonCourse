// ── Python question generator ──────────────────────────────────
function genPyQuestion(mode) {
  var WORDS  = ['Hello','Python','Ready','Winner','Score','Level','Start','Player','Quest','Code','Launch','Spark'];
  var NAMES  = ['Alex','Sam','Mia','Jordan','Taylor','Riley','Morgan','Jamie','Casey','Drew'];
  var FOODS  = ['pasta','pizza','sushi','rice','bread','soup','tacos','curry','salad','stew'];
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  if (mode === 'py_print_word') {
    var w = rand(WORDS);
    return { type:'code_output', q:'Write one line of Python that outputs the word ' + w + '.', inputs:[], expectedOutput:w, sampleAnswer:'print("' + w + '")', duration:60 };
  }
  if (mode === 'py_print_two_words') {
    var w1 = rand(WORDS), w2 = rand(WORDS.filter(function(x){return x!==w1;}));
    return { type:'code_output', q:'Write two print statements so the output shows ' + w1 + ' on one line and ' + w2 + ' on the next.', inputs:[], expectedOutput:w1+'\n'+w2, sampleAnswer:'print("'+w1+'")\nprint("'+w2+'")', duration:60 };
  }
  if (mode === 'py_var_store_string') {
    var name = rand(NAMES);
    return { type:'code_output', q:'Create a variable for a name, store ' + name + ' in it, then print the variable.', inputs:[], expectedOutput:name, sampleAnswer:'name = "'+name+'"\nprint(name)', duration:60 };
  }
  if (mode === 'py_var_store_number') {
    var n = randInt(10, 200);
    return { type:'code_regex', q:'Create a variable called score and store the number ' + n + ' in it.', pattern:'^\\s*score\\s*=\\s*'+n+'\\s*$', flags:'m', sampleAnswer:'score = '+n, duration:90 };
  }
  if (mode === 'py_var_arithmetic') {
    var start = randInt(5, 20), add = randInt(3, 15), total = start + add;
    return { type:'code_output', q:'Create a number variable, add ' + add + ' to it, and print the final value ' + total + '.', inputs:[], expectedOutput:String(total), sampleAnswer:'total = '+start+'\ntotal = total + '+add+'\nprint(total)', duration:60 };
  }
  if (mode === 'py_input_name') {
    var name = rand(NAMES);
    return { type:'code_output', q:'Ask the user for their name, store it, then print a greeting using the stored value. Test input: ' + name + '.', inputs:[name], expectedContains:name, sampleAnswer:'name = input("Name: ")\nprint("Hello", name)', duration:60 };
  }
  if (mode === 'py_input_int_add') {
    var n = randInt(5, 20);
    return { type:'code_output', q:'Ask the user for a whole number and print that number plus one. Test input: ' + n + '.', inputs:[String(n)], expectedOutput:String(n+1), sampleAnswer:'num = int(input("Number: "))\nprint(num + 1)', duration:60 };
  }
  if (mode === 'py_input_string') {
    var food = rand(FOODS);
    return { type:'code_output', q:'Ask the user for a food and print a sentence that includes what they typed. Test input: ' + food + '.', inputs:[food], expectedContains:food, sampleAnswer:'food = input("Food: ")\nprint("I like", food)', duration:60 };
  }
  return null;
}

// ── ADMIN: Open quiz setup modal ───────────────────────────────
function quizLessonsForCourse(yearGroupId, courseId) {
  return state.allLessons.filter(function(l) {
    return l.meta.yearGroupId === yearGroupId &&
           l.meta.courseId === courseId &&
           l.data.quizQuestions &&
           l.data.quizQuestions.length;
  });
}

function getSelectedQuizLesson() {
  var lessonId = document.getElementById('quiz-lesson-select').value;
  return state.allLessons.find(function(l) { return l.meta.id === lessonId; }) || null;
}

function quizLessonById(lessonId) {
  return state.allLessons.find(function(l) { return l.meta.id === lessonId; }) || null;
}

function refreshQuizSetupQuestions() {
  var lesson = getSelectedQuizLesson();
  var allQs = lesson && lesson.data.quizQuestions ? lesson.data.quizQuestions : [];
  document.getElementById('quiz-setup-lesson-name').textContent = lesson ? (lesson.data.title || lesson.meta.title || lesson.meta.id) : 'No quiz available';
  document.getElementById('quiz-q-count').max = Math.max(1, allQs.length);
  document.getElementById('quiz-q-count').value = Math.min(5, Math.max(1, allQs.length));
  document.getElementById('btn-quiz-start-host').disabled = !allQs.length;
  document.getElementById('btn-quiz-start-host').classList.toggle('opacity-60', !allQs.length);

  // Show Drive setup panel if any question requires it
  var hasCanvas = allQs.some(function(q) { return q.type === 'canvas'; });
  var drivePanel = document.getElementById('quiz-drive-setup');
  if (drivePanel) {
    drivePanel.classList.toggle('hidden', !hasCanvas);
    if (hasCanvas) populateDriveClassPicker();
  }
  quiz._driveFolderId       = null; // reset on lesson change
  quiz._driveClassId        = null;
  quiz._driveStudentFolders = null;

  var customList = document.getElementById('quiz-custom-list');
  customList.innerHTML = '';
  if (!allQs.length) {
    customList.innerHTML = '<p class="text-xs text-gray-500">This lesson does not currently have quiz questions.</p>';
    return;
  }
  allQs.forEach(function(q, idx) {
    var row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    row.innerHTML =
      '<input type="checkbox" class="quiz-custom-check accent-[rgb(176,28,35)]" data-idx="' + idx + '" />' +
      '<span class="text-sm text-gray-700 flex-1">' + escapeHtml(q.q || q.title || ('Question ' + (idx + 1))) + '</span>' +
      '<input type="number" class="quiz-custom-time w-16 border border-gray-300 rounded px-2 py-0.5 text-xs" value="' + (q.duration || 60) + '" min="10" max="300" />';
    customList.appendChild(row);
  });
}

function populateQuizLessonSelect() {
  var yearEl = document.getElementById('quiz-year-select');
  var courseEl = document.getElementById('quiz-course-select');
  var lessonEl = document.getElementById('quiz-lesson-select');
  var yg = state.yearGroups.find(function(y) { return y.id === yearEl.value; });
  var courses = (yg && yg.courses) || [];
  var previousCourse = courseEl.value;
  courseEl.innerHTML = '';
  courses.forEach(function(course) {
    var hasQuizzes = quizLessonsForCourse(yg.id, course.id).length > 0;
    if (!hasQuizzes) return;
    var opt = document.createElement('option');
    opt.value = course.id;
    opt.textContent = course.label;
    courseEl.appendChild(opt);
  });
  if (previousCourse && courseEl.querySelector('option[value="' + previousCourse + '"]')) courseEl.value = previousCourse;

  var lessons = quizLessonsForCourse(yearEl.value, courseEl.value);
  var previousLesson = lessonEl.value;
  lessonEl.innerHTML = '';
  lessons.forEach(function(lesson) {
    var opt = document.createElement('option');
    opt.value = lesson.meta.id;
    opt.textContent = lesson.data.title || lesson.meta.title || lesson.meta.id;
    lessonEl.appendChild(opt);
  });
  if (previousLesson && lessonEl.querySelector('option[value="' + previousLesson + '"]')) lessonEl.value = previousLesson;
  refreshQuizSetupQuestions();
}

function populateQuizSelectSet(ids, preferred) {
  preferred = preferred || {};
  var yearEl = document.getElementById(ids.year);
  var courseEl = document.getElementById(ids.course);
  var lessonEl = document.getElementById(ids.lesson);
  if (!yearEl || !courseEl || !lessonEl) return;

  var previousYear = preferred.yearGroupId || yearEl.value || state.currentYearGroup;
  yearEl.innerHTML = '';
  state.yearGroups.forEach(function(yg) {
    var hasQuizzes = (yg.courses || []).some(function(course) {
      return quizLessonsForCourse(yg.id, course.id).length > 0;
    });
    if (!hasQuizzes) return;
    var opt = document.createElement('option');
    opt.value = yg.id;
    opt.textContent = yg.label;
    yearEl.appendChild(opt);
  });
  if (previousYear && yearEl.querySelector('option[value="' + previousYear + '"]')) yearEl.value = previousYear;

  function refreshCoursesAndLessons(preferredCourse, preferredLesson) {
    var yg = state.yearGroups.find(function(y) { return y.id === yearEl.value; });
    var courses = (yg && yg.courses) || [];
    var keepCourse = preferredCourse || courseEl.value;
    courseEl.innerHTML = '';
    courses.forEach(function(course) {
      if (!quizLessonsForCourse(yg.id, course.id).length) return;
      var opt = document.createElement('option');
      opt.value = course.id;
      opt.textContent = course.label;
      courseEl.appendChild(opt);
    });
    if (keepCourse && courseEl.querySelector('option[value="' + keepCourse + '"]')) courseEl.value = keepCourse;

    var keepLesson = preferredLesson || lessonEl.value;
    var lessons = quizLessonsForCourse(yearEl.value, courseEl.value);
    lessonEl.innerHTML = '';
    lessons.forEach(function(lesson) {
      var opt = document.createElement('option');
      opt.value = lesson.meta.id;
      opt.textContent = lesson.data.title || lesson.meta.title || lesson.meta.id;
      lessonEl.appendChild(opt);
    });
    if (keepLesson && lessonEl.querySelector('option[value="' + keepLesson + '"]')) lessonEl.value = keepLesson;
  }

  refreshCoursesAndLessons(preferred.courseId || state.currentCourse, preferred.lessonId || (state.lessons[state.currentLessonIdx] && state.lessons[state.currentLessonIdx].meta.id));
  yearEl.onchange = function() { refreshCoursesAndLessons(null, null); if (ids.onchange) ids.onchange(); };
  courseEl.onchange = function() { refreshCoursesAndLessons(courseEl.value, null); if (ids.onchange) ids.onchange(); };
  lessonEl.onchange = function() { if (ids.onchange) ids.onchange(); };
}

function refreshFinishedQuizPanel() {
  var lesson = quizLessonById(document.getElementById('qh-next-lesson-select').value);
  var count = document.getElementById('qh-next-q-count');
  var btn = document.getElementById('btn-qh-next-start');
  var allQs = lesson && lesson.data.quizQuestions ? lesson.data.quizQuestions : [];
  if (count) {
    count.max = Math.max(1, allQs.length);
    count.value = Math.min(parseInt(count.value, 10) || 5, Math.max(1, allQs.length));
  }
  if (btn) {
    btn.disabled = !allQs.length;
    btn.classList.toggle('opacity-60', !allQs.length);
  }
}

function prepareFinishedQuizPanel() {
  populateQuizSelectSet({
    year: 'qh-next-year-select',
    course: 'qh-next-course-select',
    lesson: 'qh-next-lesson-select',
    onchange: refreshFinishedQuizPanel
  }, { lessonId: quiz.lessonId });
  document.getElementById('qh-next-force-class').checked = !!quiz.forced;
  refreshFinishedQuizPanel();
}

function openQuizSetup(className) {
  quiz.className = className;
  var yearEl = document.getElementById('quiz-year-select');
  var courseEl = document.getElementById('quiz-course-select');
  yearEl.innerHTML = '';
  state.yearGroups.forEach(function(yg) {
    var hasQuizzes = (yg.courses || []).some(function(course) {
      return quizLessonsForCourse(yg.id, course.id).length > 0;
    });
    if (!hasQuizzes) return;
    var opt = document.createElement('option');
    opt.value = yg.id;
    opt.textContent = yg.label;
    yearEl.appendChild(opt);
  });
  if (state.currentYearGroup && yearEl.querySelector('option[value="' + state.currentYearGroup + '"]')) yearEl.value = state.currentYearGroup;
  populateQuizLessonSelect();
  if (state.currentCourse && courseEl.querySelector('option[value="' + state.currentCourse + '"]')) {
    courseEl.value = state.currentCourse;
    populateQuizLessonSelect();
  }
  var currentLesson = state.lessons[state.currentLessonIdx];
  if (currentLesson && document.getElementById('quiz-lesson-select').querySelector('option[value="' + currentLesson.meta.id + '"]')) {
    document.getElementById('quiz-lesson-select').value = currentLesson.meta.id;
    refreshQuizSetupQuestions();
  }
  document.getElementById('quiz-force-class').checked = false;
  // Only teachers with forceQuiz permission (or full admins) can force the quiz class-wide
  var forceRow = document.getElementById('quiz-force-class').closest('label');
  if (forceRow) forceRow.classList.toggle('hidden', !canDo('forceQuiz'));
  yearEl.onchange = populateQuizLessonSelect;
  courseEl.onchange = populateQuizLessonSelect;
  document.getElementById('quiz-lesson-select').onchange = refreshQuizSetupQuestions;

  document.getElementById('modal-quiz-setup').classList.remove('hidden');
  document.getElementById('modal-admin').classList.add('hidden');
}

document.querySelectorAll('input[name="quiz-mode"]').forEach(function(radio) {
  radio.onchange = function() {
    var isCustom = radio.value === 'custom';
    document.getElementById('quiz-quick-opts').classList.toggle('hidden', isCustom);
    document.getElementById('quiz-custom-opts').classList.toggle('hidden', !isCustom);
  };
});

document.getElementById('btn-quiz-setup-close').onclick = function() {
  document.getElementById('modal-quiz-setup').classList.add('hidden');
  document.getElementById('modal-admin').classList.remove('hidden');
};

document.getElementById('btn-quiz-start-host').onclick = async function() {
  var lesson = getSelectedQuizLesson();
  if (!lesson) { alert('Choose a lesson with quiz questions first.'); return; }
  var allQs  = lesson.data.quizQuestions || [];
  if (!allQs.length) { alert('That lesson does not currently have quiz questions.'); return; }
  var mode   = document.querySelector('input[name="quiz-mode"]:checked').value;
  var forceClass = document.getElementById('quiz-force-class').checked;
  var selectedQs = [];

  if (mode === 'quick') {
    var count   = Math.min(parseInt(document.getElementById('quiz-q-count').value) || 5, allQs.length);
    var timeEach = parseInt(document.getElementById('quiz-q-time').value) || 60;
    // Shuffle and take count
    var shuffled = allQs.slice().sort(function() { return Math.random() - 0.5; });
    selectedQs = shuffled.slice(0, count).map(function(q) { return Object.assign({}, q, { duration: timeEach }); });
  } else {
    var checks = document.querySelectorAll('.quiz-custom-check:checked');
    checks.forEach(function(cb) {
      var idx = parseInt(cb.dataset.idx);
      var time = parseInt(cb.closest('div').querySelector('.quiz-custom-time').value) || 60;
      selectedQs.push(Object.assign({}, allQs[idx], { duration: time }));
    });
    if (!selectedQs.length) { alert('Select at least one question.'); return; }
  }

  document.getElementById('modal-quiz-setup').classList.add('hidden');

  // Resolve generated question templates — host generates random values so all students see the same question
  selectedQs = selectedQs.map(function(q) {
    if (q.type !== 'generated') return q;
    var gen = BinaryLesson.genQuestion(q.mode) || genPyQuestion(q.mode);
    return gen ? Object.assign({}, gen, { duration: q.duration || 60 }) : q;
  });

  // If any canvas questions are included, Drive setup must have completed first
  var hasCanvas = selectedQs.some(function(q) { return q.type === 'canvas'; });
  if (hasCanvas && !quiz._driveClassId) {
    alert('This quiz includes a drawing activity. Please click "Connect Google Drive" and select a class before starting.');
    document.getElementById('modal-quiz-setup').classList.remove('hidden');
    return;
  }

  await createHostedQuizLobby(lesson, selectedQs, forceClass);
};

async function createHostedQuizLobby(lesson, selectedQs, forceClass) {
  if (quiz.cleanupTimer) {
    clearTimeout(quiz.cleanupTimer);
    quiz.cleanupTimer = null;
  }
  quiz.unsubscribers.forEach(function(fn) { try { fn(); } catch(e) {} });
  quiz.unsubscribers = [];
  var oldSessionRef = quiz.sessionRef;
  var lobbyCode = await genLobbyCode();
  quiz.lobbyCode  = lobbyCode;
  quiz.questions  = selectedQs;
  quiz.lessonId   = lesson.meta.id;
  quiz.lessonTitle = lesson.data.title || lesson.meta.title || lesson.meta.id;
  quiz.forced = !!forceClass;
  quiz.hostPlayers = {};
  quiz.sessionRef = state.db.ref('quizSessions/' + lobbyCode);

  // Now that we have the real lobby code, create Drive folders if needed
  var hasCanvas = selectedQs.some(function(q) { return q.type === 'canvas'; });
  if (hasCanvas && quiz._driveClassId) {
    var driveStatusEl = document.getElementById('quiz-drive-status');
    try {
      var driveResult = await window.driveSetupSession(quiz._driveClassId, lobbyCode, function(msg) {
        if (driveStatusEl) { driveStatusEl.textContent = msg; driveStatusEl.style.color = '#1d4ed8'; }
      });
      quiz._driveFolderId       = driveResult.sessionFolderId;
      quiz._driveStudentFolders = driveResult.studentFolders;
      var count = Object.keys(driveResult.studentFolders || {}).length;
      if (driveStatusEl) { driveStatusEl.textContent = '✓ ' + count + ' folder(s) created.'; driveStatusEl.style.color = '#15803d'; }
    } catch (e) {
      // Non-fatal — quiz continues but canvas submissions won't have a folder
      console.error('[Drive] Setup failed:', e.message);
      if (driveStatusEl) { driveStatusEl.textContent = '⚠️ Drive setup failed: ' + e.message; driveStatusEl.style.color = '#dc2626'; }
    }
  }

  var firebaseUid = state.auth.currentUser && state.auth.currentUser.uid;
  await quiz.sessionRef.set({
    hostUid:       firebaseUid,
    state:         'lobby',
    questionIdx:   -1,
    lessonId:      lesson.meta.id,
    className:     quiz.className || null,
    forced:        !!forceClass,
    createdAt:     Date.now(),
    driveFolderId:     quiz._driveFolderId || null,
    studentFolders:    quiz._driveStudentFolders || null,
    questions:   selectedQs.map(function(q) {
      var isCodeType = q.type === 'code_regex' || q.type === 'code_output';
      return {
        type: q.type || 'mcq',
        q: q.q || '',
        html: q.html || null,
        options: q.options || null,
        answer: isCodeType ? null : (q.answer != null ? q.answer : 0),
        useNibbles: q.useNibbles || null,
        rowA: q.rowA || null,
        rowB: q.rowB || null,
        duration: q.duration || 60,
        pattern: q.pattern || null,
        flags: q.flags || 'im',
        inputs: q.inputs || null,
        expectedOutput: q.expectedOutput != null ? q.expectedOutput : null,
        expectedContains: q.expectedContains != null ? q.expectedContains : null,
        sampleAnswer: q.sampleAnswer || null,
        check: q.check || null,
        checkCounts: q.checkCounts || null,
        checkFields: normaliseScratchCheckFields(q.checkFields),
        checkAlternatives: normaliseScratchCheckAlternatives(q.checkAlternatives),
        runtimeTest: q.runtimeTest || null,
        blockbenchCheck: q.blockbenchCheck || null,
        sheetData: q.sheetData || null,
        columns: q.columns || null,
        minColumns: q.minColumns || null,
        minRows: q.minRows || null,
        checks: q.checks || null,
        levelString: q.levelString || null,
        starterCode: q.starterCode || null
      };
    }),
  });

  if (forceClass && quiz.className) {
    await state.db.ref('classes/' + quiz.className + '/forcedQuiz').set({
      active: true,
      lobbyCode: lobbyCode,
      hostUid: firebaseUid || null,
      lessonId: lesson.meta.id,
      startedAt: Date.now()
    });
  }

  // Do not remove the whole quiz on a transient host disconnect. Students can be
  // dropped from Firebase briefly during heavy embedded tasks, so quizzes are
  // cleaned up explicitly when the host ends/finishes them instead.

  localStorage.setItem('pylearn_host_quiz', lobbyCode);
  if (oldSessionRef && oldSessionRef !== quiz.sessionRef) oldSessionRef.remove().catch(function(){});
  showQuizHostScreen();
}

// ── ADMIN: Host screen ─────────────────────────────────────────
function normaliseScratchCheckFields(checkFields) {
  if (!checkFields) return null;
  if (Array.isArray(checkFields)) return checkFields;
  return Object.keys(checkFields).map(function(key) {
    var parts = key.split('.');
    return {
      opcode: parts[0],
      field: parts.slice(1).join('.'),
      values: checkFields[key]
    };
  });
}

function normaliseScratchCheckAlternatives(checkAlternatives) {
  if (!Array.isArray(checkAlternatives)) return null;
  return checkAlternatives.map(function(rule) {
    return Object.assign({}, rule, {
      checkFields: normaliseScratchCheckFields(rule.checkFields)
    });
  });
}

function showQuizHostScreen() {
  document.getElementById('quiz-host-screen').classList.remove('hidden');
  document.getElementById('qh-lobby-code').textContent = quiz.lobbyCode;
  document.getElementById('qh-lobby-code-big').textContent = quiz.lobbyCode;
  document.getElementById('qh-lesson-name').textContent = quiz.lessonTitle ||
    ((state.allLessons.find(function(l) { return l.meta.id === quiz.lessonId; }) || {data:{title:''}}).data.title);

  quiz.hostSessionRenderKey = null;
  setQuizHostView('lobby');

  // Listen for players joining/leaving/being kicked
  var playersRef = quiz.sessionRef.child('players');
  var playersListener = playersRef.on('value', function(snap) {
    var players = snap.val() || {};
    quiz.hostPlayers = players;
    var playerCodes = Object.keys(players).filter(function(c) { return !players[c].kicked; });
    quiz.playerCount = playerCodes.length;
    renderHostPlayerList(players);
    renderQuizManageStudents();
    document.getElementById('btn-quiz-begin').disabled = playerCodes.length === 0;
  });
  quiz.unsubscribers.push(function() { playersRef.off('value', playersListener); });

  var hostSessionRef = quiz.sessionRef;
  var sessionListener = hostSessionRef.on('value', function(snap) {
    if (!snap.exists()) return;
    renderQuizHostFromSession(snap);
  });
  quiz.unsubscribers.push(function() { hostSessionRef.off('value', sessionListener); });
}

function renderQuizHostFromSession(snap) {
  var stateVal = snap.child('state').val() || 'lobby';
  var qIdx = Number(snap.child('questionIdx').val());
  var questionStart = snap.child('questionStart').val() || 0;
  var answerRevealStart = snap.child('answerRevealStart').val() || 0;
  var renderKey = [stateVal, qIdx, questionStart, answerRevealStart].join(':');
  if (quiz.hostSessionRenderKey === renderKey) return;
  quiz.hostSessionRenderKey = renderKey;

  if (stateVal === 'lobby') {
    clearAllQuizTimers();
    setQuizHostView('lobby');
    return;
  }
  if (stateVal === 'question' && qIdx >= 0 && quiz.questions[qIdx]) {
    renderHostQuestionView(qIdx, questionStart, snap.child('questionDuration').val() || quiz.questions[qIdx].duration || 60);
    return;
  }
  if (stateVal === 'answer' && qIdx >= 0 && quiz.questions[qIdx]) {
    renderHostRevealView(qIdx, answerRevealStart);
    return;
  }
  if (stateVal === 'voting') {
    renderHostVotingView(qIdx);
    return;
  }
  if (stateVal === 'showcase') {
    renderHostShowcaseView(qIdx);
    return;
  }
  if (stateVal === 'finished') {
    clearAllQuizTimers();
    var leaderboard = snap.child('leaderboard').val() || [];
    renderHostLeaderboard(Array.isArray(leaderboard) ? leaderboard : Object.values(leaderboard));
    setQuizHostView('finished');
  }
}

function setQuizHostView(view) {
  ['lobby','question','reveal','voting','showcase','finished'].forEach(function(v) {
    document.getElementById('qh-' + v).classList.toggle('hidden', v !== view);
  });
  quiz.currentState = view;
  if (view === 'finished') prepareFinishedQuizPanel();
}

function renderHostPlayerList(players) {
  var list = document.getElementById('qh-player-list');
  list.innerHTML = '';
  Object.keys(players).forEach(function(code) {
    var p = players[code];
    var chip = document.createElement('div');
    chip.className = 'flex items-center gap-1 bg-gray-700 rounded-full px-3 py-1 text-sm';
    var displayName = studentName(code) || code;
    chip.innerHTML =
      '<span>' + displayName + '</span>' +
      '<button class="text-red-400 hover:text-red-300 text-xs ml-1 font-bold" title="Kick">&#x2715;</button>';
    chip.querySelector('button').onclick = async function() {
      await quiz.sessionRef.child('players/' + code + '/kicked').set(true);
    };
    list.appendChild(chip);
  });
}

// ── Drive setup for canvas questions ───────────────────────────

async function populateDriveClassPicker() {
  var sel = document.getElementById('quiz-drive-class-select');
  if (!sel || sel.dataset.populated) return;
  // Don't auto-authenticate here — that requires a user gesture or the COOP
  // popup-communication block will fire. If we already have a token (e.g. from
  // the admin Classroom panel) we can populate immediately; otherwise wait for
  // the Connect button click which carries a real user gesture.
  if (window.classroomState && window.classroomState.token) {
    sel.innerHTML = '<option value="">Loading classes…</option>';
    try {
      var courses = await classroomListCourses();
      sel.innerHTML = '<option value="">— select a class —</option>' +
        courses.map(function(c) {
          return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
        }).join('');
      sel.dataset.populated = '1';
    } catch (e) {
      sel.innerHTML = '<option value="">Could not load classes — ' + escapeHtml(e.message) + '</option>';
    }
  } else {
    sel.innerHTML = '<option value="">— click Connect to load classes —</option>';
  }
}

(function () {
  // The connect button is a two-step flow:
  //   Step 1 (no token / not populated): authenticate → populate dropdown → prompt user to select + click Confirm
  //   Step 2 (authenticated, class selected): store _driveClassId and show ✓ Ready
  //
  // All OAuth popup calls happen directly inside the button onclick, which carries
  // a real user gesture and avoids the COOP "window.closed blocked" error.

  var btn      = document.getElementById('btn-quiz-drive-connect');
  var statusEl = document.getElementById('quiz-drive-status');
  var sel      = document.getElementById('quiz-drive-class-select');

  // When the class selection changes after auth, reset confirmation so the
  // teacher must click Confirm again with the new selection.
  if (sel) {
    sel.onchange = function() {
      if (quiz._driveClassId) {
        quiz._driveClassId = null;
        btn.disabled    = false;
        btn.textContent = 'Confirm Class';
        if (statusEl) { statusEl.textContent = 'Select a class and click Confirm.'; statusEl.style.color = '#f59e0b'; }
      }
    };
  }

  btn.onclick = async function() {
    btn.disabled = true;
    statusEl.style.color = '#1d4ed8';

    // ── Step 1: authenticate if needed ────────────────────────
    if (!window.classroomState || !window.classroomState.token) {
      btn.textContent = 'Connecting…';
      statusEl.textContent = 'Waiting for Google sign-in…';
      try {
        await getClassroomToken();
      } catch (e) {
        statusEl.textContent = '⚠️ ' + (e.message || 'Sign-in failed.');
        statusEl.style.color = '#dc2626';
        btn.disabled    = false;
        btn.textContent = 'Try Again';
        return;
      }
    }

    // ── Step 2: populate dropdown if not yet done ─────────────
    if (sel && !sel.dataset.populated) {
      btn.textContent = 'Loading classes…';
      statusEl.textContent = 'Fetching Google Classroom courses…';
      try {
        var courses = await classroomListCourses();
        sel.innerHTML = '<option value="">— select a class —</option>' +
          courses.map(function(c) {
            return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
          }).join('');
        sel.dataset.populated = '1';
      } catch (e) {
        sel.innerHTML = '<option value="">Could not load classes</option>';
        statusEl.textContent = '⚠️ Could not load classes: ' + (e.message || 'unknown error');
        statusEl.style.color = '#dc2626';
        btn.disabled    = false;
        btn.textContent = 'Try Again';
        return;
      }
    }

    // ── Step 3: confirm class selection ───────────────────────
    var courseId = sel ? sel.value : '';
    if (!courseId) {
      statusEl.textContent = 'Select a class from the dropdown, then click Confirm.';
      statusEl.style.color = '#f59e0b';
      btn.disabled    = false;
      btn.textContent = 'Confirm Class';
      return;
    }

    // All done — store class; folder creation happens in createHostedQuizLobby.
    quiz._driveClassId = courseId;
    statusEl.textContent = '✓ Ready — folders will be created when the lobby opens.';
    statusEl.style.color = '#15803d';
    btn.textContent      = '✓ Connected';
    btn.disabled         = true;
  };
})();

function openQuizManageStudents() {
  document.getElementById('modal-quiz-manage-students').classList.remove('hidden');
  document.getElementById('quiz-manage-subtitle').textContent = quiz.lobbyCode ? ('Lobby code ' + quiz.lobbyCode) : '';
  renderQuizManageStudents();
}

function renderQuizManageStudents() {
  var modal = document.getElementById('modal-quiz-manage-students');
  if (!modal || modal.classList.contains('hidden')) return;
  var list = document.getElementById('quiz-manage-list');
  var players = quiz.hostPlayers || {};
  var codes = Object.keys(players).sort(function(a, b) {
    return String(studentName(a) || a).localeCompare(String(studentName(b) || b));
  });
  if (!codes.length) {
    list.innerHTML = '<p class="text-gray-400 text-sm text-center py-6">No students have joined this quiz yet.</p>';
    return;
  }
  list.innerHTML = '';
  codes.forEach(function(code) {
    var p = players[code] || {};
    var kicked = p.kicked === true;
    var row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2';
    row.innerHTML =
      '<div class="min-w-0"><div class="font-medium text-gray-100 truncate">' + escapeHtml(studentName(code) || code) + '</div>' +
      '<div class="text-xs text-gray-500 font-mono">' + escapeHtml(code) + (p.lastSeenAt ? ' · seen ' + new Date(p.lastSeenAt).toLocaleTimeString('en-GB') : '') + '</div></div>' +
      (kicked
        ? '<span class="text-xs text-red-300 border border-red-500/40 rounded px-2 py-1">Kicked</span>'
        : '<button class="btn-quiz-kick-student px-3 py-1 rounded border border-red-500 text-red-200 text-xs hover:bg-red-900/30" data-code="' + escapeHtml(code) + '">Kick</button>');
    var btn = row.querySelector('.btn-quiz-kick-student');
    if (btn) {
      btn.onclick = async function() {
        if (!quiz.sessionRef) return;
        if (!confirm('Kick ' + (studentName(code) || code) + ' from this quiz?')) return;
        btn.disabled = true;
        btn.textContent = 'Kicking...';
        try {
          await quiz.sessionRef.child('players/' + code + '/kicked').set(true);
        } catch(e) {
          alert('Could not kick student: ' + e.message);
          btn.disabled = false;
          btn.textContent = 'Kick';
        }
      };
    }
    list.appendChild(row);
  });
}

document.getElementById('btn-quiz-manage-students').onclick = openQuizManageStudents;
document.getElementById('btn-quiz-manage-close').onclick = function() {
  document.getElementById('modal-quiz-manage-students').classList.add('hidden');
};

document.getElementById('btn-quiz-begin').onclick = async function() {
  await startNextQuestion();
};

document.getElementById('btn-quiz-next').onclick = async function() {
  clearHostQuestionTimer();
  await showAnswerReveal();
};

document.getElementById('btn-quiz-continue').onclick = async function() {
  await startNextQuestion();
};

document.getElementById('btn-quiz-host-exit').onclick = async function() {
  if (!confirm('End the quiz for all players?')) return;
  await clearForcedQuizForCurrentClass();
  await endQuiz();
};

document.getElementById('btn-quiz-host-home').onclick = function() {
  exitHostQuizScreen();
};

document.getElementById('btn-qh-next-start').onclick = async function() {
  var lesson = quizLessonById(document.getElementById('qh-next-lesson-select').value);
  if (!lesson) { alert('Choose a lesson with quiz questions first.'); return; }
  var allQs = lesson.data.quizQuestions || [];
  if (!allQs.length) { alert('That lesson does not currently have quiz questions.'); return; }
  var count = Math.min(parseInt(document.getElementById('qh-next-q-count').value, 10) || 5, allQs.length);
  var timeEach = parseInt(document.getElementById('qh-next-q-time').value, 10) || 60;
  var forceClass = document.getElementById('qh-next-force-class').checked;
  var shuffled = allQs.slice().sort(function() { return Math.random() - 0.5; });
  var selectedQs = shuffled.slice(0, count).map(function(q) { return Object.assign({}, q, { duration: timeEach }); });
  selectedQs = selectedQs.map(function(q) {
    if (q.type !== 'generated') return q;
    var gen = BinaryLesson.genQuestion(q.mode) || genPyQuestion(q.mode);
    return gen ? Object.assign({}, gen, { duration: q.duration || 60 }) : q;
  });
  await createHostedQuizLobby(lesson, selectedQs, forceClass);
};

function exitHostQuizScreen() {
  clearAllQuizTimers();
  quiz.unsubscribers.forEach(function(fn) { fn(); });
  quiz.unsubscribers = [];
  quiz.sessionRef = null;
  quiz.currentState = null;
  quiz.hostPlayers = {};
  localStorage.removeItem('pylearn_host_quiz');
  document.getElementById('modal-quiz-manage-students').classList.add('hidden');
  document.getElementById('quiz-host-screen').classList.add('hidden');
}

async function startNextQuestion() {
  clearHostQuestionTimer();
  clearRevealTimer();
  var snap = await quiz.sessionRef.child('questionIdx').get();
  var nextIdx = (snap.exists() ? snap.val() : -1) + 1;

  if (nextIdx >= quiz.questions.length) {
    await endQuiz(); return;
  }

  var q = quiz.questions[nextIdx];
  var now = Date.now();
  await quiz.sessionRef.update({
    state:           'question',
    questionIdx:     nextIdx,
    questionStart:   now,
    questionDuration: q.duration,
    answerRevealStart: null,
  });

  renderHostQuestionView(nextIdx, now, q.duration);
}

function renderHostQuestionView(qIdx, questionStart, duration) {
  clearRevealTimer();
  var q = quiz.questions[qIdx];
  if (!q) return;
  safeText(document.getElementById('qh-q-text'), q.q);
  var hostVisual = document.getElementById('qh-q-visual');
  if (q.html) {
    hostVisual.innerHTML = q.html;
    hostVisual.classList.remove('hidden');
  } else {
    hostVisual.innerHTML = '';
    hostVisual.classList.add('hidden');
  }
  var isTextInput = q.type === 'text_input';
  var isWidget = q.type === 'bit_input' || q.type === 'addition_input';
  var isScratch = q.type === 'scratch_build';
  var isPyBot = q.type === 'pybot_level';
  var isBlockbench = q.type === 'blockbench_build';
  var isSpreadsheet = q.type === 'spreadsheet_task';
  var isPyScratch = q.type === 'pyscratch_build';
  var isCodeQuestion = q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq' && !isTextInput && !isWidget && !isScratch && !isPyBot && !isBlockbench && !isSpreadsheet && !isPyScratch;
  var hostOptions = ['qh-opt-0','qh-opt-1','qh-opt-2','qh-opt-3'].map(function(id) { return document.getElementById(id); });
  if (isCodeQuestion || isTextInput || isWidget || isScratch || isPyBot || isBlockbench || isSpreadsheet || isPyScratch) {
    var label = isWidget ? 'Interactive answer'
      : isTextInput ? 'Typed answer'
      : isScratch ? 'Scratch build'
      : isPyBot ? 'PyBot level'
      : isBlockbench ? 'Blockbench build'
      : isSpreadsheet ? 'Spreadsheet task'
      : isPyScratch ? 'PyScratch build'
      : 'Code answer';
    hostOptions.forEach(function(el) {
      el.textContent = label;
      el.className = 'rounded-xl p-4 text-center font-semibold text-lg bg-gray-700 text-gray-200';
    });
  } else {
    (q.options || []).forEach(function(opt, i) {
      safeText(document.getElementById('qh-opt-' + i), opt);
    });
  }
  document.getElementById('qh-q-progress').textContent =
    'Question ' + (qIdx + 1) + ' of ' + quiz.questions.length;
  document.getElementById('qh-answered-count').textContent = '';
  document.getElementById('qh-unanswered-list').innerHTML = '<span class="text-gray-400">Waiting for answers...</span>';

  setQuizHostView('question');
  startHostTimer(duration || q.duration || 60, qIdx, questionStart || Date.now());
}

function clearHostQuestionTimer() {
  if (quiz.timerInterval) {
    clearInterval(quiz.timerInterval);
    quiz.timerInterval = null;
  }
}

function clearRevealTimer() {
  if (quiz.revealTimer) {
    clearTimeout(quiz.revealTimer);
    quiz.revealTimer = null;
  }
}

function clearStudentTimer() {
  if (quiz.studentTimerInterval) {
    clearInterval(quiz.studentTimerInterval);
    quiz.studentTimerInterval = null;
  }
}

function clearAllQuizTimers() {
  clearHostQuestionTimer();
  clearRevealTimer();
  clearStudentTimer();
}

function startHostTimer(duration, qIdx, questionStart) {
  quiz.timerEnd = (questionStart || Date.now()) + duration * 1000;
  clearHostQuestionTimer();
  quiz.hostTimerToken++;
  var timerToken = quiz.hostTimerToken;

  function tick() {
    if (timerToken !== quiz.hostTimerToken || quiz.currentState !== 'question') return;
    var remaining = Math.max(0, Math.ceil((quiz.timerEnd - Date.now()) / 1000));
    document.getElementById('qh-timer').textContent = remaining;
    var pct = ((quiz.timerEnd - Date.now()) / (duration * 1000)) * 100;
    var bar = document.getElementById('qh-timer-bar');
    bar.style.width = Math.max(0, pct) + '%';
    bar.className = 'h-2 transition-all ' + (pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500');

    // Check how many have answered and who is still outstanding.
    Promise.all([
      quiz.sessionRef.child('answers/' + qIdx).get(),
      quiz.sessionRef.child('players').get()
    ]).then(function(results) {
      if (timerToken !== quiz.hostTimerToken || quiz.currentState !== 'question') return;
      var snap = results[0];
      var playersSnap = results[1];
      var answeredCodes = snap.exists() ? Object.keys(snap.val()) : [];
      var answeredSet = {};
      answeredCodes.forEach(function(code) { answeredSet[code] = true; });
      var activeCodes = [];
      if (playersSnap.exists()) {
        var players = playersSnap.val() || {};
        activeCodes = Object.keys(players).filter(function(code) {
          return players[code] && !players[code].kicked;
        });
      }
      var answered = answeredCodes.filter(function(code) { return activeCodes.indexOf(code) !== -1; }).length;
      var unanswered = activeCodes.filter(function(code) { return !answeredSet[code]; });
      quiz.playerCount = activeCodes.length;
      document.getElementById('qh-answered-count').textContent =
        answered + ' / ' + quiz.playerCount + ' answered';
      renderHostUnansweredList(unanswered);
      if (answered >= quiz.playerCount && quiz.playerCount > 0) {
        clearHostQuestionTimer();
        showAnswerReveal(qIdx, questionStart);
      }
    });

    if (remaining <= 0) {
      clearHostQuestionTimer();
      showAnswerReveal(qIdx, questionStart);
    }
  }
  tick();
  quiz.timerInterval = setInterval(tick, 500);
}

function renderHostUnansweredList(codes) {
  var el = document.getElementById('qh-unanswered-list');
  if (!el) return;
  codes = codes || [];
  if (!codes.length) {
    el.innerHTML = '<div class="font-semibold text-green-300">Everyone has answered.</div>';
    return;
  }
  var names = codes.map(function(code) { return studentName(code) || code; }).sort();
  el.innerHTML =
    '<div class="font-semibold text-yellow-300 mb-2">Still to answer (' + names.length + ')</div>' +
    '<div class="flex flex-wrap gap-2">' +
    names.map(function(name) {
      return '<span class="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-100">' + escapeHtml(name) + '</span>';
    }).join('') +
    '</div>';
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
  });
}

async function showAnswerReveal(expectedQIdx, expectedQuestionStart) {
  clearHostQuestionTimer();
  quiz.hostTimerToken++;
  clearRevealTimer();
  var sessionSnap = await quiz.sessionRef.get();
  if (!sessionSnap.exists()) return;
  var qIdx = sessionSnap.child('questionIdx').val();
  var currentStart = sessionSnap.child('questionStart').val();
  if (expectedQIdx != null && qIdx !== expectedQIdx) return;
  if (expectedQuestionStart != null && currentStart !== expectedQuestionStart) return;
  if (sessionSnap.child('state').val() !== 'question') return;
  var q = quiz.questions[qIdx];
  var now = Date.now();

  if (q.type === 'canvas') {
    await startVotingPhase(qIdx);
    return;
  }

  await quiz.sessionRef.update({ state: 'answer', answerRevealStart: now });
  await renderHostRevealView(qIdx, now);
}

async function renderHostRevealView(qIdx, revealStart) {
  clearHostQuestionTimer();
  clearRevealTimer();
  var revealEl = document.getElementById('qh-reveal-answer');
  var q = quiz.questions[qIdx];
  if (!q) return;
  var isTextInput = q.type === 'text_input';
  var isWidget = q.type === 'bit_input' || q.type === 'addition_input';
  var isScratch = q.type === 'scratch_build';
  var isPyBot = q.type === 'pybot_level';
  var isBlockbench = q.type === 'blockbench_build';
  var isSpreadsheet = q.type === 'spreadsheet_task';
  var isPyScratch = q.type === 'pyscratch_build';
  var isCodeQuestion = q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq' && !isTextInput && !isWidget && !isScratch && !isPyBot && !isBlockbench && !isSpreadsheet && !isPyScratch;
  if (isTextInput || isWidget) {
    safeText(revealEl, 'Answer: ' + q.answer);
    revealEl.className = 'text-2xl font-bold rounded-xl px-8 py-4 mb-6 bg-green-600 font-mono';
  } else if (isPyBot) {
    safeText(revealEl, q.sampleAnswer || 'Complete the PyBot level');
    revealEl.className = 'text-xl font-bold rounded-xl px-8 py-4 mb-6 bg-green-600 whitespace-pre-wrap';
  } else if (isScratch) {
    safeText(revealEl, q.sampleAnswer || "See your teacher's screen");
    revealEl.className = 'text-xl font-bold rounded-xl px-8 py-4 mb-6 bg-green-600 whitespace-pre-wrap';
  } else if (isBlockbench) {
    safeText(revealEl, q.sampleAnswer || 'Model checked automatically');
    revealEl.className = 'text-xl font-bold rounded-xl px-8 py-4 mb-6 bg-green-600 whitespace-pre-wrap';
  } else if (isSpreadsheet) {
    safeText(revealEl, q.sampleAnswer || 'Spreadsheet task checked automatically');
    revealEl.className = 'text-xl font-bold rounded-xl px-8 py-4 mb-6 bg-green-600 whitespace-pre-wrap';
  } else if (isPyScratch) {
    safeText(revealEl, q.sampleAnswer || 'Code checked automatically');
    revealEl.className = 'text-xl font-bold rounded-xl px-8 py-4 mb-6 bg-green-600 font-mono whitespace-pre-wrap';
  } else if (isCodeQuestion) {
    safeText(revealEl, q.sampleAnswer || 'Teacher checks accepted code');
    revealEl.className = 'text-xl font-bold rounded-xl px-8 py-4 mb-6 bg-green-600 font-mono whitespace-pre-wrap';
  } else {
    var colours = ['bg-red-600','bg-blue-600','bg-yellow-500','bg-green-600'];
    safeText(revealEl, q.options[q.answer]);
    revealEl.className = 'text-2xl font-bold rounded-xl px-8 py-4 mb-6 ' + colours[q.answer];
  }

  var statsEl = document.getElementById('qh-reveal-stats');
  statsEl.innerHTML = '';
  statsEl.className = 'w-full flex gap-6 justify-center items-start flex-wrap mb-6';

  // Fetch all answers up to and including this question; capture current question's snap
  var scores = {};
  var currentQSnap = null;
  for (var qi = 0; qi <= qIdx; qi++) {
    var qiSnap = await quiz.sessionRef.child('answers/' + qi).get();
    if (qi === qIdx) currentQSnap = qiSnap;
    if (!qiSnap.exists()) continue;
    var qiQ = quiz.questions[qi];
    qiSnap.forEach(function(child) {
      var code = child.key;
      if (!scores[code]) scores[code] = 0;
      scores[code] += quizAnswerPoints(qiQ, child);
    });
  }

  // ── Answer distribution ──────────────────────────────────────
  var distEl = document.createElement('div');
  distEl.className = 'flex flex-col gap-2 min-w-48';
  var colours = ['bg-red-600','bg-blue-600','bg-yellow-500','bg-green-600'];
  if (isCodeQuestion || isTextInput || isWidget || isScratch || isPyBot || isBlockbench || isSpreadsheet) {
    var codeCorrect = 0, codeTotal = 0;
    var pyBotPoints = 0;
    if (currentQSnap && currentQSnap.exists()) {
      currentQSnap.forEach(function(child) {
        codeTotal++;
        if (isPyBot) {
          pyBotPoints += quizAnswerPoints(q, child);
        } else if (child.child('correct').val() === true) {
          codeCorrect++;
        }
      });
    }
    var chip = document.createElement('div');
    chip.className = 'rounded-lg px-4 py-2 text-center text-sm bg-green-600 font-bold';
    chip.textContent = isPyBot
      ? pyBotPoints + ' points / ' + codeTotal + ' completed'
      : codeCorrect + ' correct / ' + codeTotal + ' submitted';
    distEl.appendChild(chip);
  } else {
    var answerCounts = [0,0,0,0];
    if (currentQSnap && currentQSnap.exists()) {
      currentQSnap.forEach(function(child) {
        var a = child.child('answer').val();
        if (typeof a === 'number' && a >= 0 && a < 4) answerCounts[a]++;
      });
    }
    var maxCount = Math.max.apply(null, answerCounts);
    q.options.forEach(function(opt, i) {
      var isMostCommon = maxCount > 0 && answerCounts[i] === maxCount;
      var isCorrect = i === q.answer;
      var chip = document.createElement('div');
      chip.className = 'rounded-lg px-4 py-2 text-sm flex items-center justify-between gap-3 ' +
        (isCorrect ? colours[i] + ' font-bold' : 'bg-gray-700' + (isMostCommon ? '' : ' opacity-60'));
      chip.innerHTML =
        '<span class="truncate">' + opt + '</span>' +
        '<span class="shrink-0 font-bold' + (isMostCommon ? ' text-white' : ' text-gray-400') + '">' +
        answerCounts[i] + (isMostCommon && !isCorrect ? ' ★' : '') + '</span>';
      distEl.appendChild(chip);
    });
  }
  statsEl.appendChild(distEl);

  // ── Top-5 leaderboard ────────────────────────────────────────
  var playersSnap2 = await quiz.sessionRef.child('players').get();
  if (playersSnap2.exists()) {
    playersSnap2.forEach(function(child) { if (!scores[child.key]) scores[child.key] = 0; });
  }
  var topFive = Object.keys(scores)
    .map(function(code) { return { code: code, score: scores[code] }; })
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, 5);

  var lbEl = document.createElement('div');
  lbEl.className = 'flex flex-col gap-2 min-w-48';
  var lbMedals = ['🥇', '🥈', '🥉', '4.', '5.'];
  topFive.forEach(function(entry, i) {
    var row = document.createElement('div');
    row.className = 'flex items-center gap-3 rounded-lg px-4 py-2 bg-gray-800';
    row.innerHTML =
      '<span class="text-lg w-8 text-center shrink-0">' + lbMedals[i] + '</span>' +
      '<span class="font-mono flex-1 text-gray-200 text-sm truncate">' + (studentName(entry.code) || entry.code) + '</span>' +
      '<span class="font-bold text-yellow-400 shrink-0">' + entry.score + ' / ' + quizMaxScore(quiz.questions, qIdx + 1) + '</span>';
    lbEl.appendChild(row);
  });
  statsEl.appendChild(lbEl);

  setQuizHostView('reveal');

  var revealDuration = Math.max(5000, (q.duration / 2) * 1000);
  var elapsed = revealStart ? Date.now() - revealStart : 0;
  var remaining = revealDuration - elapsed;
  if (remaining > 0) {
    quiz.revealTimer = setTimeout(async function() {
      quiz.revealTimer = null;
      await startNextQuestion();
    }, remaining);
  }
}

// ── Voting phase (canvas questions) ───────────────────────────

async function startVotingPhase(qIdx) {
  var answersSnap = await quiz.sessionRef.child('answers/' + qIdx).get();
  var answers = answersSnap.exists() ? answersSnap.val() : {};

  // Build votingItems array from answers; get name from answer record (saved during submit)
  var votingItems = [];
  Object.keys(answers).forEach(function(uid) {
    var ans = answers[uid];
    if (!ans || !ans.fileId) return;
    var name = ans.name || ans.emailKey || uid;
    votingItems.push({ uid: uid, fileId: ans.fileId, name: name });
  });

  // Write votingItems as Firebase object with numeric keys
  var votingItemsObj = {};
  votingItems.forEach(function(item, i) { votingItemsObj[i] = item; });
  await quiz.sessionRef.child('votingItems/' + qIdx).set(votingItemsObj);
  await quiz.sessionRef.update({ state: 'voting', votingQIdx: qIdx });
}

function renderHostVotingView(qIdx) {
  clearHostQuestionTimer();
  clearRevealTimer();
  setQuizHostView('voting');

  var countEl = document.getElementById('qh-voting-count');
  // Live vote count listener
  if (quiz._votingCountRef) quiz._votingCountRef.off('value', quiz._votingCountListener);
  quiz._votingCountRef = quiz.sessionRef.child('votes/' + qIdx);
  quiz._votingCountListener = quiz._votingCountRef.on('value', function(snap) {
    var votes = snap.val() || {};
    var voterCount = Object.keys(votes).length;
    var totalStudents = Object.keys(quiz.hostPlayers || {}).filter(function(c) {
      return quiz.hostPlayers[c] && !quiz.hostPlayers[c].kicked;
    }).length;
    if (countEl) countEl.textContent = voterCount + ' / ' + totalStudents + ' voted';
  });
  quiz.unsubscribers.push(function() {
    if (quiz._votingCountRef) quiz._votingCountRef.off('value', quiz._votingCountListener);
    quiz._votingCountRef = null;
  });

  var skipBtn = document.getElementById('btn-qh-skip-to-results');
  skipBtn.onclick = async function() { await startShowcasePhase(qIdx); };
}

async function startShowcasePhase(qIdx) {
  // Read all votes for this question
  var votesSnap = await quiz.sessionRef.child('votes/' + qIdx).get();
  var votes = votesSnap.exists() ? votesSnap.val() : {};
  // votes structure: { voterUid: { submitterUid: starRating } }

  // Aggregate per submitter (ignore self-votes)
  var totals = {};   // submitterUid → { sum, count }
  Object.keys(votes).forEach(function(voterUid) {
    var voterVotes = votes[voterUid] || {};
    Object.keys(voterVotes).forEach(function(submitterUid) {
      if (voterUid === submitterUid) return; // ignore self-votes
      var rating = Number(voterVotes[submitterUid]);
      if (!isFinite(rating)) return;
      if (!totals[submitterUid]) totals[submitterUid] = { sum: 0, count: 0 };
      totals[submitterUid].sum += rating;
      totals[submitterUid].count++;
    });
  });

  // Read votingItems to get fileId and name
  var itemsSnap = await quiz.sessionRef.child('votingItems/' + qIdx).get();
  var itemsObj = itemsSnap.exists() ? itemsSnap.val() : {};
  var itemsArr = Object.values(itemsObj);
  var itemMap = {};
  itemsArr.forEach(function(item) { if (item && item.uid) itemMap[item.uid] = item; });

  // Build ranked list
  var ranked = Object.keys(totals).map(function(uid) {
    var t = totals[uid];
    var item = itemMap[uid] || {};
    var avg = t.count > 0 ? Math.round((t.sum / t.count) * 10) / 10 : 0;
    return {
      uid: uid,
      fileId: item.fileId || null,
      name: item.name || uid,
      avg: avg,
      voteCount: t.count
    };
  }).sort(function(a, b) { return b.avg - a.avg; }).slice(0, 3);

  // Write vote averages back to each student's answer record so buildLeaderboard
  // can award points for canvas questions (scored 0–5 based on peer vote average).
  // Also include students who submitted but received no votes (score 0).
  var scoreWrites = [];
  itemsArr.forEach(function(item) {
    if (!item || !item.uid) return;
    var t = totals[item.uid];
    var avg = t ? (t.count > 0 ? Math.round((t.sum / t.count) * 10) / 10 : 0) : 0;
    scoreWrites.push(
      quiz.sessionRef.child('answers/' + qIdx + '/' + item.uid + '/score').set(avg)
    );
  });
  await Promise.all(scoreWrites);

  // Write showcase items
  var showcaseObj = {};
  ranked.forEach(function(item, i) { showcaseObj[i] = item; });
  await quiz.sessionRef.child('showcaseItems/' + qIdx).set(showcaseObj);
  await quiz.sessionRef.update({ state: 'showcase' });
}

async function renderHostShowcaseView(qIdx) {
  setQuizHostView('showcase');
  var listEl = document.getElementById('qh-showcase-list');
  listEl.innerHTML = '<p class="text-gray-400 text-sm text-center">Loading results…</p>';

  var snap = await quiz.sessionRef.child('showcaseItems/' + qIdx).get();
  var items = snap.exists() ? Object.values(snap.val()).filter(Boolean) : [];
  var medals = ['🥇', '🥈', '🥉'];
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = '<p class="text-gray-400 text-sm text-center">No votes were cast.</p>';
  } else {
    items.forEach(function(item, i) {
      var row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-4 bg-gray-800 rounded-lg px-5 py-3';
      var avg = typeof item.avg === 'number' ? item.avg.toFixed(1) : '–';
      row.innerHTML =
        '<span class="text-2xl shrink-0">' + (medals[i] || (i+1)+'.') + '</span>' +
        '<span class="font-semibold text-gray-100 flex-1 truncate">' + escapeHtml(item.name) + '</span>' +
        '<span class="text-yellow-400 font-bold shrink-0">' + avg + ' &#x2B50; (' + (item.voteCount || 0) + ' vote' + (item.voteCount === 1 ? '' : 's') + ')</span>';
      listEl.appendChild(row);
    });
  }

  var continueBtn = document.getElementById('btn-qh-showcase-continue');
  continueBtn.onclick = async function() { await startNextQuestion(); };
}

async function endQuiz() {
  clearAllQuizTimers();
  localStorage.removeItem('pylearn_host_quiz');
  await clearForcedQuizForCurrentClass();
  // Cancel the onDisconnect removal BEFORE writing finished state,
  // otherwise Firebase deletes the session immediately after the write
  // causing WebSocket errors on connected clients.
  if (quiz.sessionRef) {
    quiz.sessionRef.onDisconnect().cancel();
  }
  // Compute leaderboard before marking finished
  var leaderboard = await buildLeaderboard();
  await quiz.sessionRef.update({ state: 'finished', leaderboard: leaderboard });
  renderHostLeaderboard(leaderboard);
  setQuizHostView('finished');
  // Clean up listeners
  quiz.unsubscribers.forEach(function(fn) { fn(); });
  quiz.unsubscribers = [];

  // ── Save permanent quiz history ──────────────────────────────
  try {
    if (quiz.className) {
      var lessonTitle = quiz.lessonTitle || ((quizLessonById(quiz.lessonId) || { data: { title: quiz.lessonId || '' } }).data.title);
      // Collect all answers across questions
      var historyResults = {};
      for (var qi = 0; qi < quiz.questions.length; qi++) {
        var aSnap = await quiz.sessionRef.child('answers/' + qi).get();
        if (!aSnap.exists()) continue;
        aSnap.forEach(function(child) {
          var code = child.key;
        if (!historyResults[code]) historyResults[code] = [];
          var hq = quiz.questions[qi];
          var hPoints = quizAnswerPoints(hq, child);
          historyResults[code][qi] = {
            correct: hPoints > 0,
            points: hPoints,
            medal: child.child('medal').val() || '',
            completed: child.child('completed').val() === true,
            answerText: child.child('answerText').val() || child.child('medal').val() || String(child.child('answer').val() !== null ? child.child('answer').val() : '')
          };
        });
      }
      // Include players who participated but answered nothing
      leaderboard.forEach(function(entry) {
        if (!historyResults[entry.code]) historyResults[entry.code] = [];
      });
      var historyRecord = {
        timestamp: Date.now(),
        lessonId: quiz.lessonId || '',
        lessonTitle: lessonTitle,
        lobbyCode: quiz.lobbyCode,
        questions: quiz.questions.map(function(q) { return { q: q.q || '', type: q.type || 'mcq', answer: q.answer != null ? q.answer : 0 }; }),
        results: historyResults
      };
      await state.db.ref('classes/' + quiz.className + '/quizHistory').push(historyRecord);
    }
  } catch(e) { console.warn('Quiz history save failed:', e); }

  // Delete this finished session after a delay so students see the leaderboard.
  // Capture the ref now: a later quiz may replace quiz.sessionRef before this fires.
  var finishedSessionRef = quiz.sessionRef;
  quiz.cleanupTimer = setTimeout(function() {
    if (finishedSessionRef) finishedSessionRef.remove().catch(function(){});
    if (quiz.cleanupTimer) quiz.cleanupTimer = null;
  }, 30000);
}

async function clearForcedQuizForCurrentClass() {
  if (!quiz.className || !quiz.lobbyCode || !state.db) return;
  try {
    var forcedRef = state.db.ref('classes/' + quiz.className + '/forcedQuiz');
    var snap = await forcedRef.get();
    if (snap.child('lobbyCode').val() === quiz.lobbyCode) {
      await forcedRef.update({ active: false, endedAt: Date.now() });
    }
  } catch(e) {
    console.warn('Could not clear forced quiz:', e.message);
  }
}

function pyBotMedalPoints(medal, completed) {
  medal = String(medal || '').trim();
  if (medal === '🥇') return 5;
  if (medal === '🥈') return 3;
  if (medal === '🥉') return 2;
  return completed ? 1 : 0;
}

function pyBotMedalLabel(medal) {
  medal = String(medal || '').trim();
  return medal === '🥇' || medal === '🥈' || medal === '🥉' ? medal : 'No medal';
}

function quizQuestionMaxPoints(q) {
  if (!q) return 0;
  if (q.type === 'pybot_level') return 5;
  if (q.type === 'canvas') return 5; // scored 0–5 by peer vote average
  return 1;
}

function quizMaxScore(questions, endExclusive) {
  questions = questions || [];
  var end = endExclusive == null ? questions.length : Math.min(endExclusive, questions.length);
  var total = 0;
  for (var i = 0; i < end; i++) total += quizQuestionMaxPoints(questions[i]);
  return total;
}

function quizAnswerPoints(q, answerSnap) {
  if (!q || !answerSnap || !answerSnap.exists()) return 0;
  if (q.type === 'pybot_level') {
    var stored = answerSnap.child('points').val();
    if (typeof stored === 'number' && isFinite(stored)) return stored;
    return pyBotMedalPoints(answerSnap.child('medal').val(), answerSnap.child('completed').val() === true || answerSnap.exists());
  }
  // Canvas: scored 0–5 by peer vote average (written back by startShowcasePhase)
  if (q.type === 'canvas') {
    var score = answerSnap.child('score').val();
    return (typeof score === 'number' && isFinite(score)) ? score : 0;
  }
  if (q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq') {
    return answerSnap.child('correct').val() === true ? 1 : 0;
  }
  return answerSnap.child('answer').val() === q.answer ? 1 : 0;
}

async function buildLeaderboard() {
  var scores = {};
  for (var qIdx = 0; qIdx < quiz.questions.length; qIdx++) {
    var q = quiz.questions[qIdx];
    var snap = await quiz.sessionRef.child('answers/' + qIdx).get();
    if (!snap.exists()) continue;
    snap.forEach(function(child) {
      var code = child.key;
      if (!scores[code]) scores[code] = 0;
      scores[code] += quizAnswerPoints(q, child);
    });
  }
  // Add players who answered nothing
  var playersSnap = await quiz.sessionRef.child('players').get();
  if (playersSnap.exists()) {
    playersSnap.forEach(function(child) {
      if (!scores[child.key]) scores[child.key] = 0;
    });
  }
  // Sort descending
  return Object.keys(scores)
    .map(function(code) { return { code: code, score: scores[code] }; })
    .sort(function(a, b) { return b.score - a.score; });
}

function renderHostLeaderboard(leaderboard) {
  var el = document.getElementById('qh-final-scores');
  el.innerHTML = '';
  var maxScore = quizMaxScore(quiz.questions);
  var medals = ['🥇','🥈','🥉'];
  leaderboard.forEach(function(entry, i) {
    var row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-6 bg-gray-800 rounded-lg px-6 py-3 min-w-64';
    row.innerHTML =
      '<span class="text-lg">' + (medals[i] || (i+1)+'.') + '</span>' +
      '<span class="font-mono text-gray-300 flex-1 text-left ml-2">' + (studentName(entry.code) || entry.code) + '</span>' +
      '<span class="font-bold text-yellow-400 text-lg">' + entry.score + ' / ' + maxScore + '</span>';
    el.appendChild(row);
  });
}
