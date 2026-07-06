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

function isQuizShareQuestion(q) {
  return !!q && (q.type === 'canvas' || q.type === 'pyscratch_share' || q.type === 'blockbench_share' || q.type === 'pixel_art' || q.type === 'tshirt');
}

function isTshirtContestQuestion(q) {
  return !!q && q.type === 'tshirt_contest';
}

function isBlockbenchContestQuestion(q) {
  return !!q && q.type === 'blockbench_contest';
}

function isBracketContestQuestion(q) {
  return isTshirtContestQuestion(q) || isBlockbenchContestQuestion(q);
}

function isQuizDriveQuestion(q) {
  return isQuizShareQuestion(q) || isBracketContestQuestion(q);
}

function validateTshirtContestSelection(selectedQs) {
  var hasContest = (selectedQs || []).some(isBracketContestQuestion);
  if (hasContest && selectedQs.length !== 1) {
    alert('Choose one bracket contest option at a time. The contest runs as a full quiz by itself.');
    return false;
  }
  return true;
}

function refreshQuizSetupQuestions() {
  var lesson = getSelectedQuizLesson();
  var allQs = lesson && lesson.data.quizQuestions ? lesson.data.quizQuestions : [];
  document.getElementById('quiz-setup-lesson-name').textContent = lesson ? (lesson.data.title || lesson.meta.title || lesson.meta.id) : 'No quiz available';
  var defaultCount = allQs.some(isBracketContestQuestion) ? 1 : Math.min(5, Math.max(1, allQs.length));
  document.getElementById('quiz-q-count').max = Math.max(1, allQs.length);
  document.getElementById('quiz-q-count').value = defaultCount;
  document.getElementById('btn-quiz-start-host').disabled = !allQs.length;
  document.getElementById('btn-quiz-start-host').classList.toggle('opacity-60', !allQs.length);

  // Show Drive setup panel if any question requires it
  var hasCanvas = allQs.some(isQuizDriveQuestion);
  var drivePanel = document.getElementById('quiz-drive-setup');
  if (drivePanel) {
    drivePanel.classList.toggle('hidden', !hasCanvas);
    if (hasCanvas) {
      populateDriveClassPicker();
      // Reset button and status every time the drive panel is shown so it's
      // clickable again after a previous quiz session confirmed a class.
      var _connectBtn    = document.getElementById('btn-quiz-drive-connect');
      var _connectStatus = document.getElementById('quiz-drive-status');
      if (_connectBtn) {
        _connectBtn.disabled    = false;
        _connectBtn.textContent = window.classroomState && window.classroomState.token
          ? 'Confirm Class'
          : 'Connect Google Drive & Set Up Folder';
      }
      if (_connectStatus) {
        _connectStatus.textContent = 'Select a class and click Confirm.';
        _connectStatus.style.color = '#1d4ed8';
      }
    }
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
      '<input type="number" class="quiz-custom-time w-16 border border-gray-300 rounded px-2 py-0.5 text-xs" value="' + (q.duration || (isBracketContestQuestion(q) ? 180 : 60)) + '" min="' + (isBracketContestQuestion(q) ? 180 : 10) + '" max="300" />';
    customList.appendChild(row);
  });
  var quickTime = document.getElementById('quiz-q-time');
  if (quickTime && allQs.length === 1 && isBracketContestQuestion(allQs[0])) {
    quickTime.value = allQs[0].duration || 180;
    quickTime.min = 180;
    quickTime.max = 300;
  } else if (quickTime) {
    quickTime.min = 10;
    quickTime.max = 300;
  }
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
    selectedQs = shuffled.slice(0, count).map(function(q) {
      if (isBracketContestQuestion(q)) {
        return Object.assign({}, q, { duration: Math.max(180, Math.min(300, timeEach || q.duration || 180)) });
      }
      return Object.assign({}, q, { duration: timeEach });
    });
  } else {
    var checks = document.querySelectorAll('.quiz-custom-check:checked');
    checks.forEach(function(cb) {
      var idx = parseInt(cb.dataset.idx);
      var time = parseInt(cb.closest('div').querySelector('.quiz-custom-time').value) || 60;
      selectedQs.push(Object.assign({}, allQs[idx], { duration: time }));
    });
    if (!selectedQs.length) { alert('Select at least one question.'); return; }
  }

  if (!validateTshirtContestSelection(selectedQs)) return;

  document.getElementById('modal-quiz-setup').classList.add('hidden');

  // Resolve generated question templates — host generates random values so all students see the same question
  selectedQs = selectedQs.map(function(q) {
    if (q.type !== 'generated') return q;
    var gen = BinaryLesson.genQuestion(q.mode) || genPyQuestion(q.mode);
    return gen ? Object.assign({}, gen, { duration: q.duration || 60 }) : q;
  });

  // If any canvas or pyscratch_share questions are included, Drive setup must have completed first
  var hasCanvas = selectedQs.some(isQuizDriveQuestion);
  if (hasCanvas && !quiz._driveClassId) {
    alert('This quiz includes a shared submission activity. Please click "Connect Google Drive" and select a class before starting.');
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
  if (window.drivePruneQuizFolderCache) window.drivePruneQuizFolderCache(lobbyCode);
  quiz.questions  = selectedQs;
  quiz.lessonId   = lesson.meta.id;
  quiz.lessonTitle = lesson.data.title || lesson.meta.title || lesson.meta.id;
  quiz.forced = !!forceClass;
  quiz.hostPlayers = {};
  quiz.sessionRef = state.db.ref('quizSessions/' + lobbyCode);

  // Now that we have the real lobby code, create Drive folders if needed
  var hasCanvas = selectedQs.some(isQuizDriveQuestion);
  if (hasCanvas && quiz._driveClassId) {

    // ── Drive setup loading overlay ──────────────────────────────
    var driveOverlay = document.createElement('div');
    driveOverlay.style.cssText =
      'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(0,0,0,0.75)';
    driveOverlay.innerHTML =
      '<div style="background:#1e293b;border-radius:14px;padding:2rem 2.25rem;' +
      'max-width:420px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.6)">' +
        '<div style="font-size:2.25rem;margin-bottom:0.75rem">📁</div>' +
        '<h2 style="color:#f1f5f9;font-size:1.1rem;font-weight:700;margin-bottom:0.5rem">' +
          'Setting up Google Drive…' +
        '</h2>' +
        '<p style="color:#94a3b8;font-size:0.82rem;margin-bottom:1.25rem">' +
          'Creating a folder for each student. This may take up to a minute for large classes.' +
        '</p>' +
        // Spinner
        '<div style="display:flex;justify-content:center;margin-bottom:1.1rem">' +
          '<div id="drive-setup-spinner" style="width:36px;height:36px;border-radius:50%;' +
          'border:4px solid #334155;border-top-color:#3b82f6;' +
          'animation:drive-spin 0.8s linear infinite"></div>' +
        '</div>' +
        // Progress message
        '<p id="drive-setup-msg" style="color:#cbd5e1;font-size:0.88rem;min-height:1.4em;' +
        'transition:color .2s">Initialising…</p>' +
      '</div>';

    // Inject the keyframe once
    if (!document.getElementById('drive-spin-style')) {
      var spinStyle = document.createElement('style');
      spinStyle.id = 'drive-spin-style';
      spinStyle.textContent = '@keyframes drive-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(spinStyle);
    }
    document.body.appendChild(driveOverlay);

    var msgEl = driveOverlay.querySelector('#drive-setup-msg');

    function setDriveMsg(text, colour) {
      if (msgEl) { msgEl.textContent = text; msgEl.style.color = colour || '#cbd5e1'; }
    }

    // Add a retry sub-section below the spinner (hidden until needed)
    var retryRow = document.createElement('div');
    retryRow.id = 'drive-setup-retry-row';
    retryRow.style.cssText = 'display:none;margin-top:0.9rem;display:none';
    retryRow.innerHTML =
      '<button id="drive-setup-retry-btn" style="background:#3b82f6;color:#fff;border:none;' +
      'border-radius:6px;padding:0.4rem 1.2rem;font-size:0.85rem;font-weight:600;cursor:pointer">' +
      'Retry now</button>';
    driveOverlay.querySelector('div').appendChild(retryRow);

    // driveAttempt: tries driveSetupSession, retries with countdown on failure.
    // RETRY_DELAYS: seconds to wait before each retry (index = attempt number, 0-based).
    var RETRY_DELAYS = [10, 20, 40, 60];

    async function driveAttempt(attempt) {
      // Hide retry button, restore spinner colour
      retryRow.style.display = 'none';
      var spinner = driveOverlay.querySelector('#drive-setup-spinner');
      if (spinner) spinner.style.borderTopColor = '#3b82f6';
      setDriveMsg(attempt > 0 ? 'Retrying…' : 'Initialising…');

      try {
        var result = await window.driveSetupSession(quiz._driveClassId, lobbyCode, function(msg) {
          setDriveMsg(msg);
        });
        return result; // success — caller handles
      } catch (e) {
        console.error('[Drive] Setup attempt ' + (attempt + 1) + ' failed:', e.message);
        var errText = e.message || 'unknown error';

        if (attempt >= RETRY_DELAYS.length) {
          // All retries exhausted
          if (spinner) { spinner.style.borderTopColor = '#f87171'; spinner.style.animation = 'none'; }
          setDriveMsg('⚠ Setup failed after ' + (attempt + 1) + ' attempts: ' + errText, '#f87171');
          await new Promise(function(r) { setTimeout(r, 3000); });
          return null; // caller continues without Drive
        }

        // Countdown with manual-retry button
        if (spinner) spinner.style.borderTopColor = '#fbbf24';
        var delaySecs = RETRY_DELAYS[attempt];
        var retryBtn = retryRow.querySelector('#drive-setup-retry-btn');

        // Promise that resolves when countdown ends OR retry button clicked
        await new Promise(function(resolve) {
          var remaining = delaySecs;
          retryRow.style.display = 'block';

          function tick() {
            setDriveMsg(
              '⚠ ' + errText + '\nRetrying in ' + remaining + ' second' + (remaining === 1 ? '' : 's') + '…',
              '#fbbf24'
            );
            if (remaining <= 0) { clearInterval(interval); resolve(); return; }
            remaining--;
          }
          tick();
          var interval = setInterval(tick, 1000);
          retryBtn.onclick = function() { clearInterval(interval); resolve(); };
        });

        return driveAttempt(attempt + 1);
      }
    }

    try {
      var driveResult = await driveAttempt(0);
      if (driveResult) {
        quiz._driveFolderId       = driveResult.sessionFolderId;
        quiz._driveStudentFolders = driveResult.studentFolders;
        if (window.driveSaveQuizFolders) {
          window.driveSaveQuizFolders(quiz.lobbyCode, {
            sessionFolderId: driveResult.sessionFolderId,
            studentFolders:  driveResult.studentFolders
          });
        }
        var count = Object.keys(driveResult.studentFolders || {}).length;
        setDriveMsg('✓ ' + count + ' folder' + (count === 1 ? '' : 's') + ' created.', '#4ade80');
        await new Promise(function(r) { setTimeout(r, 800); });
      }
    } finally {
      document.body.removeChild(driveOverlay);
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
        starterCode: q.starterCode || null,
        binarySeconds: q.binarySeconds || null,
        topicSeconds: q.topicSeconds || null,
        topicVoteSeconds: q.topicVoteSeconds || null,
        bracketVoteSeconds: q.bracketVoteSeconds || null,
        topicSlots: q.topicSlots || null,
        itemType: q.itemType || q.clothingType || q.garmentType || null,
        templateUrl: q.templateUrl || null,
        fileSlug: q.fileSlug || null,
        itemLabel: q.itemLabel || null,
        itemLabelLower: q.itemLabelLower || null,
        itemPluralLabel: q.itemPluralLabel || null,
        itemDesignLabel: q.itemDesignLabel || null,
        modelLabel: q.modelLabel || null,
        modelLabelLower: q.modelLabelLower || null,
        modelPluralLabel: q.modelPluralLabel || null,
        modelDesignLabel: q.modelDesignLabel || null,
        contestTitle: q.contestTitle || null
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
  var contestRound = snap.child('tshirtContest/roundIndex').val();
  var blockbenchContestRound = snap.child('blockbenchContest/roundIndex').val();
  var renderKey = [stateVal, qIdx, questionStart, answerRevealStart, contestRound, blockbenchContestRound].join(':');
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
  if (isTshirtContestState(stateVal)) {
    renderHostTshirtContestView(stateVal, snap);
    return;
  }
  if (isBlockbenchContestState(stateVal)) {
    renderHostBlockbenchContestView(stateVal, snap);
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
  ['lobby','question','reveal','voting','showcase','contest','finished'].forEach(function(v) {
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
  if (quiz.currentState === 'contest') {
    var stateSnap = quiz.sessionRef ? await quiz.sessionRef.child('state').get() : null;
    var stateVal = stateSnap ? stateSnap.val() : '';
    if (isBlockbenchContestState(stateVal)) await advanceBlockbenchContest();
    else await advanceTshirtContest();
    return;
  }
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
  var selectedQs = shuffled.slice(0, count).map(function(q) {
    if (isBracketContestQuestion(q)) {
      return Object.assign({}, q, { duration: Math.max(180, Math.min(300, timeEach || q.duration || 180)) });
    }
    return Object.assign({}, q, { duration: timeEach });
  });
  selectedQs = selectedQs.map(function(q) {
    if (q.type !== 'generated') return q;
    var gen = BinaryLesson.genQuestion(q.mode) || genPyQuestion(q.mode);
    return gen ? Object.assign({}, gen, { duration: q.duration || 60 }) : q;
  });
  if (!validateTshirtContestSelection(selectedQs)) return;
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
  if (isTshirtContestQuestion(q)) {
    await startTshirtContestQuestion(nextIdx, q);
    return;
  }
  if (isBlockbenchContestQuestion(q)) {
    await startBlockbenchContestQuestion(nextIdx, q);
    return;
  }
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
  var isBlockbench = q.type === 'blockbench_build' || q.type === 'blockbench_share';
  var isSpreadsheet = q.type === 'spreadsheet_task';
  var isPyScratch = q.type === 'pyscratch_build';
  var isPixelArt = q.type === 'pixel_art';
  var isTshirt = q.type === 'tshirt';
  var isCodeQuestion = q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq' && !isTextInput && !isWidget && !isScratch && !isPyBot && !isBlockbench && !isSpreadsheet && !isPyScratch && !isPixelArt && !isTshirt;
  var hostOptions = ['qh-opt-0','qh-opt-1','qh-opt-2','qh-opt-3'].map(function(id) { return document.getElementById(id); });
  if (isCodeQuestion || isTextInput || isWidget || isScratch || isPyBot || isBlockbench || isSpreadsheet || isPyScratch || isPixelArt || isTshirt) {
    var label = isWidget ? 'Interactive answer'
      : isTextInput ? 'Typed answer'
      : isScratch ? 'Scratch build'
      : isPyBot ? 'PyBot level'
      : isBlockbench ? (q.type === 'blockbench_share' ? 'Blockbench model' : 'Blockbench build')
      : isSpreadsheet ? 'Spreadsheet task'
      : isPyScratch ? 'PyScratch build'
      : isPixelArt ? 'Pixel Art drawing'
      : isTshirt ? 'T-shirt design'
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
  if (typeof clearHostTshirtContestProgressListener === 'function') clearHostTshirtContestProgressListener();
  if (typeof clearHostBlockbenchContestProgressListener === 'function') clearHostBlockbenchContestProgressListener();
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

  if (isQuizShareQuestion(q)) {
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
  var isBlockbench = q.type === 'blockbench_build' || q.type === 'blockbench_share';
  var isSpreadsheet = q.type === 'spreadsheet_task';
  var isPyScratch = q.type === 'pyscratch_build';
  var isPixelArt = q.type === 'pixel_art';
  var isTshirt = q.type === 'tshirt';
  var isCodeQuestion = q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq' && !isTextInput && !isWidget && !isScratch && !isPyBot && !isBlockbench && !isSpreadsheet && !isPyScratch && !isPixelArt && !isTshirt;
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

// T-shirt contest: binary sprint -> topics -> topic votes -> drawing bracket.
function isTshirtContestState(stateVal) {
  return [
    'tshirt_binary',
    'tshirt_topics',
    'tshirt_topic_vote',
    'tshirt_draw',
    'tshirt_bracket_vote'
  ].indexOf(stateVal) !== -1;
}

function hostTshirtContestItemConfig(q) {
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

function tshirtContestConfig(q) {
  q = q || {};
  var item = hostTshirtContestItemConfig(q);
  return {
    binarySeconds: Number(q.binarySeconds) || 30,
    topicSeconds: Number(q.topicSeconds) || 60,
    topicVoteSeconds: Number(q.topicVoteSeconds) || 45,
    drawSeconds: Math.max(180, Math.min(300, Number(q.duration) || 180)),
    bracketVoteSeconds: Number(q.bracketVoteSeconds) || 45,
    itemType: item.itemType,
    templateUrl: item.templateUrl,
    fileSlug: item.fileSlug,
    itemLabel: item.itemLabel,
    itemLabelLower: item.itemLabelLower,
    itemPluralLabel: item.itemPluralLabel,
    itemDesignLabel: item.itemDesignLabel,
    contestTitle: item.contestTitle
  };
}

function tshirtTopicSlots(correct) {
  correct = Math.max(0, Number(correct) || 0);
  return Math.max(0, Math.floor(Math.log(correct + 1) / Math.log(2)));
}

function tshirtActivePlayerCodes(players) {
  players = players || {};
  return Object.keys(players).filter(function(code) {
    return players[code] && players[code].kicked !== true;
  });
}

function tshirtArrayToFirebaseObj(arr) {
  var obj = {};
  (arr || []).forEach(function(item, i) { obj[i] = item; });
  return obj;
}

function tshirtObjValues(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj.filter(function(x) { return x != null; }) : Object.keys(obj).map(function(k) { return obj[k]; }).filter(function(x) { return x != null; });
}

function tshirtSubmissionBlocked(submission) {
  return !!(submission && submission.blocked === true);
}

function renderHostTshirtBlockedSquare(container) {
  if (!container) return;
  container.innerHTML = '<span style="font-weight:700;letter-spacing:0;color:#f8fafc">Blocked by teacher</span>';
  container.style.background = '#000';
  container.style.color = '#f8fafc';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.textAlign = 'center';
  container.style.minHeight = container.style.minHeight || '220px';
}

function tshirtShuffle(arr) {
  arr = (arr || []).slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function tshirtMakeBrackets(codes) {
  var remaining = (codes || []).slice();
  var brackets = [];
  while (remaining.length > 0) {
    var size = remaining.length === 3 ? 3 : Math.min(2, remaining.length);
    var entrants = remaining.splice(0, size);
    brackets.push({ id: 'b' + brackets.length, entrants: entrants, winner: null });
  }
  return brackets;
}

function tshirtFallbackTopics() {
  return [
    { key: 'fallback_0', text: 'Computing', score: 0, up: 0, down: 0 },
    { key: 'fallback_1', text: 'Binary', score: 0, up: 0, down: 0 },
    { key: 'fallback_2', text: 'JHNCC', score: 0, up: 0, down: 0 }
  ];
}

async function startTshirtContestQuestion(qIdx, q) {
  clearHostQuestionTimer();
  clearRevealTimer();
  var cfg = tshirtContestConfig(q);
  var now = Date.now();
  await quiz.sessionRef.child('tshirtContest').set({
    qIdx: qIdx,
    config: cfg,
    roundIndex: -1,
    createdAt: now
  });
  await quiz.sessionRef.update({
    state: 'tshirt_binary',
    questionIdx: qIdx,
    questionStart: now,
    questionDuration: cfg.binarySeconds,
    answerRevealStart: null
  });
  renderHostTshirtContestView('tshirt_binary', await quiz.sessionRef.get());
}

function clearHostTshirtContestProgressListener() {
  if (quiz._tshirtContestProgressRef && quiz._tshirtContestProgressListener) {
    quiz._tshirtContestProgressRef.off('value', quiz._tshirtContestProgressListener);
  }
  quiz._tshirtContestProgressRef = null;
  quiz._tshirtContestProgressListener = null;
}

function startHostTshirtContestTimer(duration, startedAt) {
  clearHostQuestionTimer();
  quiz.hostTimerToken++;
  var timerToken = quiz.hostTimerToken;
  var timerEl = document.getElementById('qhc-timer');
  var barEl = document.getElementById('qhc-timer-bar');
  var end = (startedAt || Date.now()) + duration * 1000;

  function tick() {
    if (timerToken !== quiz.hostTimerToken || quiz.currentState !== 'contest') return;
    var remainingMs = Math.max(0, end - Date.now());
    var remaining = Math.ceil(remainingMs / 1000);
    if (timerEl) timerEl.textContent = remaining;
    if (barEl) {
      var pct = duration > 0 ? remainingMs / (duration * 1000) * 100 : 0;
      barEl.style.width = Math.max(0, pct) + '%';
      barEl.className = 'h-2 transition-all ' + (pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500');
    }
    if (remaining <= 0) {
      clearHostQuestionTimer();
      advanceTshirtContest().catch(function(e) { console.warn('[T-shirt contest] auto-advance failed:', e); });
    }
  }
  tick();
  quiz.timerInterval = setInterval(tick, 500);
}

function renderHostTshirtContestView(stateVal, snap) {
  clearRevealTimer();
  clearHostTshirtContestProgressListener();
  setQuizHostView('contest');

  var qIdx = Number(snap.child('questionIdx').val());
  var q = quiz.questions[qIdx] || {};
  var cfg = snap.child('tshirtContest/config').val() || tshirtContestConfig(q);
  var startedAt = snap.child('questionStart').val() || Date.now();
  var duration = Number(snap.child('questionDuration').val()) || cfg.binarySeconds || 30;
  var roundIndex = Number(snap.child('tshirtContest/roundIndex').val());
  var titleEl = document.getElementById('qhc-title');
  var subEl = document.getElementById('qhc-subtitle');
  var bodyEl = document.getElementById('qhc-body');
  var progressEl = document.getElementById('qhc-progress');
  var btn = document.getElementById('btn-qh-contest-next');
  if (!titleEl || !subEl || !bodyEl || !progressEl || !btn) return;

  var item = hostTshirtContestItemConfig(cfg);
  var title = item.contestTitle || 'Design Contest';
  var subtitle = '';
  var buttonText = 'Next';
  if (stateVal === 'tshirt_binary') {
    title = 'Binary Sprint';
    subtitle = 'Students answer 4-bit binary to denary questions to earn topic slots.';
    buttonText = 'End sprint';
  } else if (stateVal === 'tshirt_topics') {
    title = 'Topic Writing';
    subtitle = 'Students submit the topics they earned during the sprint.';
    buttonText = 'Start topic vote';
  } else if (stateVal === 'tshirt_topic_vote') {
    title = 'Topic Voting';
    subtitle = 'Students upvote and downvote topics. Scores stay hidden.';
    buttonText = 'Start drawing round';
  } else if (stateVal === 'tshirt_draw') {
    title = 'Drawing Round ' + (roundIndex + 1);
    subtitle = 'Students in each bracket are drawing their ' + item.itemDesignLabel + '.';
    buttonText = 'Start bracket vote';
  } else if (stateVal === 'tshirt_bracket_vote') {
    title = 'Bracket Voting';
    subtitle = 'Students choose the best ' + item.itemLabelLower + ' in brackets they are not part of.';
    buttonText = 'Resolve round';
  }

  titleEl.textContent = title;
  subEl.textContent = subtitle;
  btn.textContent = buttonText + ' ->';
  btn.onclick = function() { advanceTshirtContest().catch(function(e) { alert(e.message || 'Could not advance contest.'); }); };
  startHostTshirtContestTimer(duration, startedAt);

  var round = snap.child('tshirtContest/rounds/' + roundIndex).val() || {};
  var topic = round.topic || '';
  bodyEl.innerHTML = '';
  if (topic) {
    var topicBox = document.createElement('div');
    topicBox.className = 'rounded-lg border border-yellow-500/40 bg-yellow-900/20 px-4 py-3 text-center mb-4';
    topicBox.innerHTML =
      '<div class="text-xs uppercase tracking-wide text-yellow-300 mb-1">Round topic</div>' +
      '<div class="text-2xl font-bold text-yellow-100">' + escapeHtml(topic) + '</div>';
    bodyEl.appendChild(topicBox);
  }

  var bracketWrap = document.createElement('div');
  bracketWrap.className = 'grid gap-3 w-full max-w-3xl';
  var brackets = tshirtObjValues(round.brackets);
  if (brackets.length) {
    brackets.forEach(function(bracket, i) {
      var entrants = tshirtObjValues(bracket.entrants);
      var row = document.createElement('div');
      row.className = 'rounded-lg bg-gray-800 border border-gray-700 px-4 py-3';
      row.innerHTML =
        '<div class="text-xs text-gray-500 mb-1">Bracket ' + (i + 1) + '</div>' +
        '<div class="flex flex-wrap gap-2">' +
        entrants.map(function(code) {
          var winner = bracket.winner === code;
          return '<span class="rounded-full px-3 py-1 text-sm ' + (winner ? 'bg-green-700 text-green-100' : 'bg-gray-700 text-gray-100') + '">' +
            escapeHtml(studentName(code) || code) + (winner ? ' (winner)' : '') + '</span>';
        }).join('') +
        '</div>';
      bracketWrap.appendChild(row);
    });
  }
  bodyEl.appendChild(bracketWrap);

  renderHostTshirtContestProgress(stateVal, roundIndex, progressEl);
}

function renderHostTshirtContestProgress(stateVal, roundIndex, progressEl) {
  if (!quiz.sessionRef || !progressEl) return;
  var path =
    stateVal === 'tshirt_binary' ? 'tshirtContest/binary' :
    stateVal === 'tshirt_topics' ? 'tshirtContest/topics' :
    stateVal === 'tshirt_topic_vote' ? 'tshirtContest/topicVotes' :
    stateVal === 'tshirt_draw' ? 'tshirtContest/submissions/' + roundIndex :
    stateVal === 'tshirt_bracket_vote' ? 'tshirtContest/bracketVotes/' + roundIndex :
    'tshirtContest';
  var ref = quiz.sessionRef.child(path);
  quiz._tshirtContestProgressRef = ref;
  quiz._tshirtContestProgressListener = ref.on('value', function(snap) {
    var val = snap.val() || {};
    var players = quiz.hostPlayers || {};
    var active = tshirtActivePlayerCodes(players);
    if (stateVal === 'tshirt_binary') {
      var rows = active.map(function(code) {
        var rec = val[code] || {};
        return { code: code, correct: Number(rec.correct) || 0, slots: Number(rec.slots) || 0 };
      }).sort(function(a, b) { return b.correct - a.correct; });
      progressEl.innerHTML =
        '<div class="text-sm text-gray-400 mb-2">' + rows.filter(function(r) { return r.correct > 0; }).length + ' / ' + active.length + ' students have answered at least one.</div>' +
        '<div class="grid gap-2">' + rows.map(function(r) {
          return '<div class="flex items-center justify-between rounded bg-gray-800 px-3 py-2 text-sm">' +
            '<span class="truncate">' + escapeHtml(studentName(r.code) || r.code) + '</span>' +
            '<span class="text-yellow-300 font-bold">' + r.correct + ' correct, ' + r.slots + ' slot' + (r.slots === 1 ? '' : 's') + '</span>' +
          '</div>';
        }).join('') + '</div>';
      return;
    }
    if (stateVal === 'tshirt_topics') {
      var totalTopics = 0;
      var studentCount = 0;
      Object.keys(val).forEach(function(code) {
        var count = Object.keys(val[code] || {}).length;
        if (count) studentCount++;
        totalTopics += count;
      });
      progressEl.innerHTML =
        '<div class="text-yellow-300 font-bold">' + totalTopics + ' topic' + (totalTopics === 1 ? '' : 's') + ' submitted</div>' +
        '<div class="text-sm text-gray-400">' + studentCount + ' / ' + active.length + ' students have submitted at least one topic.</div>';
      return;
    }
    if (stateVal === 'tshirt_topic_vote') {
      progressEl.innerHTML =
        '<div class="text-yellow-300 font-bold">' + Object.keys(val).length + ' / ' + active.length + ' students have voted on topics.</div>';
      return;
    }
    if (stateVal === 'tshirt_draw') {
      progressEl.innerHTML =
        '<div class="text-yellow-300 font-bold">' + Object.keys(val).length + ' design' + (Object.keys(val).length === 1 ? '' : 's') + ' submitted this round.</div>';
      return;
    }
    if (stateVal === 'tshirt_bracket_vote') {
      progressEl.innerHTML =
        '<div class="text-yellow-300 font-bold">' + Object.keys(val).length + ' / ' + active.length + ' students have cast bracket votes.</div>';
    }
  });
}

async function advanceTshirtContest() {
  if (!quiz.sessionRef || quiz._tshirtContestAdvancing) return;
  quiz._tshirtContestAdvancing = true;
  try {
    var snap = await quiz.sessionRef.get();
    if (!snap.exists()) return;
    var stateVal = snap.child('state').val();
    var qIdx = Number(snap.child('questionIdx').val());
    var q = quiz.questions[qIdx] || {};
    var cfg = snap.child('tshirtContest/config').val() || tshirtContestConfig(q);
    if (stateVal === 'tshirt_binary') {
      await startTshirtTopicWriting(cfg);
    } else if (stateVal === 'tshirt_topics') {
      await startTshirtTopicVotingOrRound(cfg);
    } else if (stateVal === 'tshirt_topic_vote') {
      await startTshirtFirstDrawingRound(cfg);
    } else if (stateVal === 'tshirt_draw') {
      await startTshirtBracketVoteOrResolve(cfg);
    } else if (stateVal === 'tshirt_bracket_vote') {
      await resolveTshirtRoundAndContinue(cfg);
    }
  } finally {
    quiz._tshirtContestAdvancing = false;
  }
}

async function startTshirtTopicWriting(cfg) {
  var now = Date.now();
  await quiz.sessionRef.update({
    state: 'tshirt_topics',
    questionStart: now,
    questionDuration: cfg.topicSeconds || 60
  });
}

async function startTshirtTopicVotingOrRound(cfg) {
  var topicsSnap = await quiz.sessionRef.child('tshirtContest/topics').get();
  var topicCount = 0;
  if (topicsSnap.exists()) {
    topicsSnap.forEach(function(studentSnap) {
      studentSnap.forEach(function(topicSnap) {
        if (String(topicSnap.child('text').val() || '').trim()) topicCount++;
      });
    });
  }
  if (!topicCount) {
    await quiz.sessionRef.child('tshirtContest/topicRankings').set(tshirtArrayToFirebaseObj(tshirtFallbackTopics()));
    await startTshirtFirstDrawingRound(cfg);
    return;
  }
  var now = Date.now();
  await quiz.sessionRef.update({
    state: 'tshirt_topic_vote',
    questionStart: now,
    questionDuration: cfg.topicVoteSeconds || 45
  });
}

async function rankTshirtTopics() {
  var snaps = await Promise.all([
    quiz.sessionRef.child('tshirtContest/topics').get(),
    quiz.sessionRef.child('tshirtContest/topicVotes').get()
  ]);
  var topicSnap = snaps[0];
  var votes = snaps[1].val() || {};
  var topics = [];
  if (topicSnap.exists()) {
    topicSnap.forEach(function(studentSnap) {
      studentSnap.forEach(function(child) {
        var text = String(child.child('text').val() || '').trim().slice(0, 60);
        if (!text) return;
        var key = child.child('key').val() || (studentSnap.key + '_' + child.key);
        topics.push({
          key: key,
          text: text,
          submittedAt: Number(child.child('submittedAt').val()) || 0,
          score: 0,
          up: 0,
          down: 0
        });
      });
    });
  }
  var byKey = {};
  topics.forEach(function(t) { byKey[t.key] = t; });
  Object.keys(votes).forEach(function(voter) {
    var voterVotes = votes[voter] || {};
    Object.keys(voterVotes).forEach(function(topicKey) {
      var t = byKey[topicKey];
      if (!t) return;
      var v = Number(voterVotes[topicKey]);
      if (v > 0) { t.score++; t.up++; }
      else if (v < 0) { t.score--; t.down++; }
    });
  });
  topics.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (b.up !== a.up) return b.up - a.up;
    return a.submittedAt - b.submittedAt;
  });
  if (!topics.length) topics = tshirtFallbackTopics();
  await quiz.sessionRef.child('tshirtContest/topicRankings').set(tshirtArrayToFirebaseObj(topics));
  return topics;
}

async function startTshirtFirstDrawingRound(cfg) {
  var rankings = await rankTshirtTopics();
  var playersSnap = await quiz.sessionRef.child('players').get();
  var participants = tshirtShuffle(tshirtActivePlayerCodes(playersSnap.val() || {}));
  await quiz.sessionRef.child('tshirtContest/participants').set(tshirtArrayToFirebaseObj(participants));
  await startTshirtDrawingRound(0, participants, rankings, cfg);
}

async function startTshirtDrawingRound(roundIndex, participants, rankings, cfg) {
  participants = (participants || []).filter(Boolean);
  if (participants.length <= 1) {
    await finishTshirtContest(participants[0] || null);
    return;
  }
  if (!rankings) {
    var rankSnap = await quiz.sessionRef.child('tshirtContest/topicRankings').get();
    rankings = rankSnap.exists() ? tshirtObjValues(rankSnap.val()) : tshirtFallbackTopics();
  }
  var topic = (rankings[roundIndex] && rankings[roundIndex].text) ||
              (rankings.length ? rankings[roundIndex % rankings.length].text : 'Computing');
  var brackets = tshirtMakeBrackets(participants);
  var bracketObj = {};
  brackets.forEach(function(bracket) { bracketObj[bracket.id] = bracket; });
  var now = Date.now();
  await quiz.sessionRef.child('tshirtContest/rounds/' + roundIndex).set({
    index: roundIndex,
    topic: topic,
    startedAt: now,
    brackets: bracketObj
  });
  await quiz.sessionRef.update({
    state: 'tshirt_draw',
    questionStart: now,
    questionDuration: cfg.drawSeconds || 180
  });
  await quiz.sessionRef.child('tshirtContest/roundIndex').set(roundIndex);
}

async function startTshirtBracketVoteOrResolve(cfg) {
  var contestSnap = await quiz.sessionRef.child('tshirtContest').get();
  var roundIndex = Number(contestSnap.child('roundIndex').val()) || 0;
  var round = contestSnap.child('rounds/' + roundIndex).val() || {};
  var brackets = tshirtObjValues(round.brackets);
  var submissions = contestSnap.child('submissions/' + roundIndex).val() || {};
  var playersSnap = await quiz.sessionRef.child('players').get();
  var activeSet = {};
  tshirtActivePlayerCodes(playersSnap.val() || {}).forEach(function(code) { activeSet[code] = true; });
  var hasVoteableBracket = brackets.some(function(bracket) {
    return tshirtObjValues(bracket.entrants).filter(function(code) {
      return activeSet[code] && submissions[code] && submissions[code].fileId && !tshirtSubmissionBlocked(submissions[code]);
    }).length >= 2;
  });
  if (!hasVoteableBracket) {
    await resolveTshirtRoundAndContinue(cfg);
    return;
  }
  var now = Date.now();
  await quiz.sessionRef.update({
    state: 'tshirt_bracket_vote',
    questionStart: now,
    questionDuration: cfg.bracketVoteSeconds || 45
  });
}

async function resolveTshirtRoundAndContinue(cfg) {
  var snaps = await Promise.all([
    quiz.sessionRef.child('tshirtContest').get(),
    quiz.sessionRef.child('players').get()
  ]);
  var contest = snaps[0].val() || {};
  var roundIndex = Number(contest.roundIndex) || 0;
  var round = contest.rounds && contest.rounds[roundIndex] ? contest.rounds[roundIndex] : {};
  var brackets = tshirtObjValues(round.brackets);
  var submissions = contest.submissions && contest.submissions[roundIndex] ? contest.submissions[roundIndex] : {};
  var votes = contest.bracketVotes && contest.bracketVotes[roundIndex] ? contest.bracketVotes[roundIndex] : {};
  var activeSet = {};
  tshirtActivePlayerCodes(snaps[1].val() || {}).forEach(function(code) { activeSet[code] = true; });

  var winners = [];
  var winnerWrites = [];
  brackets.forEach(function(bracket) {
    var entrants = tshirtObjValues(bracket.entrants);
    var activeEntrants = entrants.filter(function(code) { return activeSet[code]; });
    var submittedActive = entrants.filter(function(code) {
      return activeSet[code] && submissions[code] && submissions[code].fileId && !tshirtSubmissionBlocked(submissions[code]);
    });
    var winner = null;
    if (entrants.length === 1) {
      winner = activeEntrants[0] || entrants[0];
    } else if (activeEntrants.length === 1) {
      winner = activeEntrants[0];
    } else if (submittedActive.length === 1) {
      winner = submittedActive[0];
    } else if (submittedActive.length === 0) {
      winner = activeEntrants[0] || entrants[0] || null;
    } else {
      var score = {};
      submittedActive.forEach(function(code) { score[code] = 0; });
      Object.keys(votes).forEach(function(voter) {
        if (entrants.indexOf(voter) !== -1) return;
        var selected = votes[voter] && votes[voter][bracket.id];
        if (score[selected] != null) score[selected]++;
      });
      winner = submittedActive.slice().sort(function(a, b) {
        if (score[b] !== score[a]) return score[b] - score[a];
        var ta = Number(submissions[a] && submissions[a].submittedAt) || 0;
        var tb = Number(submissions[b] && submissions[b].submittedAt) || 0;
        if (ta !== tb) return ta - tb;
        return entrants.indexOf(a) - entrants.indexOf(b);
      })[0];
    }
    if (winner) winners.push(winner);
    winnerWrites.push(quiz.sessionRef.child('tshirtContest/rounds/' + roundIndex + '/brackets/' + bracket.id + '/winner').set(winner || null));
  });
  await Promise.all(winnerWrites);
  await quiz.sessionRef.child('tshirtContest/rounds/' + roundIndex + '/winners').set(tshirtArrayToFirebaseObj(winners));
  if (winners.length <= 1) {
    await finishTshirtContest(winners[0] || null);
    return;
  }
  var rankSnap = await quiz.sessionRef.child('tshirtContest/topicRankings').get();
  var rankings = rankSnap.exists() ? tshirtObjValues(rankSnap.val()) : tshirtFallbackTopics();
  await startTshirtDrawingRound(roundIndex + 1, winners, rankings, cfg);
}

async function buildTshirtContestLeaderboard(champion) {
  var contestSnap = await quiz.sessionRef.child('tshirtContest').get();
  var contest = contestSnap.val() || {};
  var wins = {};
  tshirtObjValues(contest.participants).forEach(function(code) { if (code) wins[code] = 0; });
  if (contest.rounds) {
    Object.keys(contest.rounds).forEach(function(roundKey) {
      var round = contest.rounds[roundKey] || {};
      tshirtObjValues(round.brackets).forEach(function(bracket) {
        tshirtObjValues(bracket.entrants).forEach(function(code) { if (code && wins[code] == null) wins[code] = 0; });
        if (bracket.winner) wins[bracket.winner] = (wins[bracket.winner] || 0) + 1;
      });
    });
  }
  if (champion && wins[champion] == null) wins[champion] = 0;
  return Object.keys(wins).map(function(code) {
    var winCount = wins[code] || 0;
    return {
      code: code,
      score: winCount,
      champion: code === champion,
      label: code === champion ? 'Champion' : (winCount + ' bracket win' + (winCount === 1 ? '' : 's'))
    };
  }).sort(function(a, b) {
    if (a.champion !== b.champion) return a.champion ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return String(studentName(a.code) || a.code).localeCompare(String(studentName(b.code) || b.code));
  });
}

async function finishTshirtContest(champion) {
  var leaderboard = await buildTshirtContestLeaderboard(champion);
  await quiz.sessionRef.child('tshirtContest/champion').set(champion || null);
  await quiz.sessionRef.child('tshirtContest/finalLeaderboard').set(tshirtArrayToFirebaseObj(leaderboard));
  await endQuiz();
}

// Blockbench contest: topics -> topic votes -> modelling bracket.
function isBlockbenchContestState(stateVal) {
  return [
    'blockbench_topics',
    'blockbench_topic_vote',
    'blockbench_draw',
    'blockbench_bracket_vote'
  ].indexOf(stateVal) !== -1;
}

function blockbenchContestConfig(q) {
  q = q || {};
  return {
    topicSeconds: Number(q.topicSeconds) || 60,
    topicVoteSeconds: Number(q.topicVoteSeconds) || 45,
    drawSeconds: Math.max(180, Math.min(300, Number(q.duration) || 180)),
    bracketVoteSeconds: Number(q.bracketVoteSeconds) || 45,
    topicSlots: Number(q.topicSlots) || 2,
    modelLabel: q.modelLabel || 'Blockbench Model',
    modelLabelLower: q.modelLabelLower || 'Blockbench model',
    modelPluralLabel: q.modelPluralLabel || 'Blockbench models',
    modelDesignLabel: q.modelDesignLabel || 'Blockbench model',
    contestTitle: q.contestTitle || q.q || 'Blockbench Bracket Contest'
  };
}

function blockbenchFallbackTopics() {
  return [
    { key: 'fallback_0', text: 'Game asset', score: 0, up: 0, down: 0 },
    { key: 'fallback_1', text: 'Fantasy object', score: 0, up: 0, down: 0 },
    { key: 'fallback_2', text: 'Minecraft build', score: 0, up: 0, down: 0 }
  ];
}

function blockbenchSubmissionBlocked(submission) {
  return !!(submission && submission.blocked === true);
}

async function startBlockbenchContestQuestion(qIdx, q) {
  clearHostQuestionTimer();
  clearRevealTimer();
  var cfg = blockbenchContestConfig(q);
  var now = Date.now();
  await quiz.sessionRef.child('blockbenchContest').set({
    qIdx: qIdx,
    config: cfg,
    roundIndex: -1,
    createdAt: now
  });
  await quiz.sessionRef.update({
    state: 'blockbench_topics',
    questionIdx: qIdx,
    questionStart: now,
    questionDuration: cfg.topicSeconds,
    answerRevealStart: null
  });
  renderHostBlockbenchContestView('blockbench_topics', await quiz.sessionRef.get());
}

function clearHostBlockbenchContestProgressListener() {
  if (quiz._blockbenchContestProgressRef && quiz._blockbenchContestProgressListener) {
    quiz._blockbenchContestProgressRef.off('value', quiz._blockbenchContestProgressListener);
  }
  quiz._blockbenchContestProgressRef = null;
  quiz._blockbenchContestProgressListener = null;
}

function startHostBlockbenchContestTimer(duration, startedAt) {
  clearHostQuestionTimer();
  quiz.hostTimerToken++;
  var timerToken = quiz.hostTimerToken;
  var timerEl = document.getElementById('qhc-timer');
  var barEl = document.getElementById('qhc-timer-bar');
  var end = (startedAt || Date.now()) + duration * 1000;

  function tick() {
    if (timerToken !== quiz.hostTimerToken || quiz.currentState !== 'contest') return;
    var remainingMs = Math.max(0, end - Date.now());
    var remaining = Math.ceil(remainingMs / 1000);
    if (timerEl) timerEl.textContent = remaining;
    if (barEl) {
      var pct = duration > 0 ? remainingMs / (duration * 1000) * 100 : 0;
      barEl.style.width = Math.max(0, pct) + '%';
      barEl.className = 'h-2 transition-all ' + (pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500');
    }
    if (remaining <= 0) {
      clearHostQuestionTimer();
      advanceBlockbenchContest().catch(function(e) { console.warn('[Blockbench contest] auto-advance failed:', e); });
    }
  }
  tick();
  quiz.timerInterval = setInterval(tick, 500);
}

function renderHostBlockbenchContestView(stateVal, snap) {
  clearRevealTimer();
  clearHostBlockbenchContestProgressListener();
  setQuizHostView('contest');

  var qIdx = Number(snap.child('questionIdx').val());
  var q = quiz.questions[qIdx] || {};
  var cfg = snap.child('blockbenchContest/config').val() || blockbenchContestConfig(q);
  var startedAt = snap.child('questionStart').val() || Date.now();
  var duration = Number(snap.child('questionDuration').val()) || cfg.topicSeconds || 30;
  var roundIndex = Number(snap.child('blockbenchContest/roundIndex').val());
  var titleEl = document.getElementById('qhc-title');
  var subEl = document.getElementById('qhc-subtitle');
  var bodyEl = document.getElementById('qhc-body');
  var progressEl = document.getElementById('qhc-progress');
  var btn = document.getElementById('btn-qh-contest-next');
  if (!titleEl || !subEl || !bodyEl || !progressEl || !btn) return;

  var title = cfg.contestTitle || 'Blockbench Bracket Contest';
  var subtitle = '';
  var buttonText = 'Next';
  if (stateVal === 'blockbench_topics') {
    title = 'Topic Writing';
    subtitle = 'Students submit two modelling topics each.';
    buttonText = 'Start topic vote';
  } else if (stateVal === 'blockbench_topic_vote') {
    title = 'Topic Voting';
    subtitle = 'Students upvote and downvote topics. Scores stay hidden.';
    buttonText = 'Start modelling round';
  } else if (stateVal === 'blockbench_draw') {
    title = 'Modelling Round ' + (roundIndex + 1);
    subtitle = 'Students in each bracket are building their Blockbench model.';
    buttonText = 'Start bracket vote';
  } else if (stateVal === 'blockbench_bracket_vote') {
    title = 'Bracket Voting';
    subtitle = 'Students choose the best model in brackets they are not part of.';
    buttonText = 'Resolve round';
  }

  titleEl.textContent = title;
  subEl.textContent = subtitle;
  btn.textContent = buttonText + ' ->';
  btn.onclick = function() { advanceBlockbenchContest().catch(function(e) { alert(e.message || 'Could not advance contest.'); }); };
  startHostBlockbenchContestTimer(duration, startedAt);

  var round = snap.child('blockbenchContest/rounds/' + roundIndex).val() || {};
  var topic = round.topic || '';
  bodyEl.innerHTML = '';
  if (topic) {
    var topicBox = document.createElement('div');
    topicBox.className = 'rounded-lg border border-yellow-500/40 bg-yellow-900/20 px-4 py-3 text-center mb-4';
    topicBox.innerHTML =
      '<div class="text-xs uppercase tracking-wide text-yellow-300 mb-1">Round topic</div>' +
      '<div class="text-2xl font-bold text-yellow-100">' + escapeHtml(topic) + '</div>';
    bodyEl.appendChild(topicBox);
  }

  var bracketWrap = document.createElement('div');
  bracketWrap.className = 'grid gap-3 w-full max-w-3xl';
  var brackets = tshirtObjValues(round.brackets);
  if (brackets.length) {
    brackets.forEach(function(bracket, i) {
      var entrants = tshirtObjValues(bracket.entrants);
      var row = document.createElement('div');
      row.className = 'rounded-lg bg-gray-800 border border-gray-700 px-4 py-3';
      row.innerHTML =
        '<div class="text-xs text-gray-500 mb-1">Bracket ' + (i + 1) + '</div>' +
        '<div class="flex flex-wrap gap-2">' +
        entrants.map(function(code) {
          var winner = bracket.winner === code;
          return '<span class="rounded-full px-3 py-1 text-sm ' + (winner ? 'bg-green-700 text-green-100' : 'bg-gray-700 text-gray-100') + '">' +
            escapeHtml(studentName(code) || code) + (winner ? ' (winner)' : '') + '</span>';
        }).join('') +
        '</div>';
      bracketWrap.appendChild(row);
    });
  }
  bodyEl.appendChild(bracketWrap);

  renderHostBlockbenchContestProgress(stateVal, roundIndex, progressEl);
}

function renderHostBlockbenchContestProgress(stateVal, roundIndex, progressEl) {
  if (!quiz.sessionRef || !progressEl) return;
  var path =
    stateVal === 'blockbench_topics' ? 'blockbenchContest/topics' :
    stateVal === 'blockbench_topic_vote' ? 'blockbenchContest/topicVotes' :
    stateVal === 'blockbench_draw' ? 'blockbenchContest/submissions/' + roundIndex :
    stateVal === 'blockbench_bracket_vote' ? 'blockbenchContest/bracketVotes/' + roundIndex :
    'blockbenchContest';
  var ref = quiz.sessionRef.child(path);
  quiz._blockbenchContestProgressRef = ref;
  quiz._blockbenchContestProgressListener = ref.on('value', function(snap) {
    var val = snap.val() || {};
    var players = quiz.hostPlayers || {};
    var active = tshirtActivePlayerCodes(players);
    if (stateVal === 'blockbench_topics') {
      var totalTopics = 0;
      var studentCount = 0;
      Object.keys(val).forEach(function(code) {
        var count = Object.keys(val[code] || {}).length;
        if (count) studentCount++;
        totalTopics += count;
      });
      progressEl.innerHTML =
        '<div class="text-yellow-300 font-bold">' + totalTopics + ' topic' + (totalTopics === 1 ? '' : 's') + ' submitted</div>' +
        '<div class="text-sm text-gray-400">' + studentCount + ' / ' + active.length + ' students have submitted at least one topic.</div>';
      return;
    }
    if (stateVal === 'blockbench_topic_vote') {
      progressEl.innerHTML =
        '<div class="text-yellow-300 font-bold">' + Object.keys(val).length + ' / ' + active.length + ' students have voted on topics.</div>';
      return;
    }
    if (stateVal === 'blockbench_draw') {
      progressEl.innerHTML =
        '<div class="text-yellow-300 font-bold">' + Object.keys(val).length + ' model' + (Object.keys(val).length === 1 ? '' : 's') + ' submitted this round.</div>';
      return;
    }
    if (stateVal === 'blockbench_bracket_vote') {
      progressEl.innerHTML =
        '<div class="text-yellow-300 font-bold">' + Object.keys(val).length + ' / ' + active.length + ' students have cast bracket votes.</div>';
    }
  });
}

async function advanceBlockbenchContest() {
  if (!quiz.sessionRef || quiz._blockbenchContestAdvancing) return;
  quiz._blockbenchContestAdvancing = true;
  try {
    var snap = await quiz.sessionRef.get();
    if (!snap.exists()) return;
    var stateVal = snap.child('state').val();
    var qIdx = Number(snap.child('questionIdx').val());
    var q = quiz.questions[qIdx] || {};
    var cfg = snap.child('blockbenchContest/config').val() || blockbenchContestConfig(q);
    if (stateVal === 'blockbench_topics') {
      await startBlockbenchTopicVotingOrRound(cfg);
    } else if (stateVal === 'blockbench_topic_vote') {
      await startBlockbenchFirstDrawingRound(cfg);
    } else if (stateVal === 'blockbench_draw') {
      await startBlockbenchBracketVoteOrResolve(cfg);
    } else if (stateVal === 'blockbench_bracket_vote') {
      await resolveBlockbenchRoundAndContinue(cfg);
    }
  } finally {
    quiz._blockbenchContestAdvancing = false;
  }
}

async function startBlockbenchTopicVotingOrRound(cfg) {
  var topicsSnap = await quiz.sessionRef.child('blockbenchContest/topics').get();
  var topicCount = 0;
  if (topicsSnap.exists()) {
    topicsSnap.forEach(function(studentSnap) {
      studentSnap.forEach(function(topicSnap) {
        if (String(topicSnap.child('text').val() || '').trim()) topicCount++;
      });
    });
  }
  if (!topicCount) {
    await quiz.sessionRef.child('blockbenchContest/topicRankings').set(tshirtArrayToFirebaseObj(blockbenchFallbackTopics()));
    await startBlockbenchFirstDrawingRound(cfg);
    return;
  }
  var now = Date.now();
  await quiz.sessionRef.update({
    state: 'blockbench_topic_vote',
    questionStart: now,
    questionDuration: cfg.topicVoteSeconds || 45
  });
}

async function rankBlockbenchTopics() {
  var snaps = await Promise.all([
    quiz.sessionRef.child('blockbenchContest/topics').get(),
    quiz.sessionRef.child('blockbenchContest/topicVotes').get()
  ]);
  var topicSnap = snaps[0];
  var votes = snaps[1].val() || {};
  var topics = [];
  if (topicSnap.exists()) {
    topicSnap.forEach(function(studentSnap) {
      studentSnap.forEach(function(child) {
        var text = String(child.child('text').val() || '').trim().slice(0, 60);
        if (!text) return;
        var key = child.child('key').val() || (studentSnap.key + '_' + child.key);
        topics.push({
          key: key,
          text: text,
          submittedAt: Number(child.child('submittedAt').val()) || 0,
          score: 0,
          up: 0,
          down: 0
        });
      });
    });
  }
  var byKey = {};
  topics.forEach(function(t) { byKey[t.key] = t; });
  Object.keys(votes).forEach(function(voter) {
    var voterVotes = votes[voter] || {};
    Object.keys(voterVotes).forEach(function(topicKey) {
      var t = byKey[topicKey];
      if (!t) return;
      var v = Number(voterVotes[topicKey]);
      if (v > 0) { t.score++; t.up++; }
      else if (v < 0) { t.score--; t.down++; }
    });
  });
  topics.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (b.up !== a.up) return b.up - a.up;
    return a.submittedAt - b.submittedAt;
  });
  if (!topics.length) topics = blockbenchFallbackTopics();
  await quiz.sessionRef.child('blockbenchContest/topicRankings').set(tshirtArrayToFirebaseObj(topics));
  return topics;
}

async function startBlockbenchFirstDrawingRound(cfg) {
  var rankings = await rankBlockbenchTopics();
  var playersSnap = await quiz.sessionRef.child('players').get();
  var participants = tshirtShuffle(tshirtActivePlayerCodes(playersSnap.val() || {}));
  await quiz.sessionRef.child('blockbenchContest/participants').set(tshirtArrayToFirebaseObj(participants));
  await startBlockbenchDrawingRound(0, participants, rankings, cfg);
}

async function startBlockbenchDrawingRound(roundIndex, participants, rankings, cfg) {
  participants = (participants || []).filter(Boolean);
  if (participants.length <= 1) {
    await finishBlockbenchContest(participants[0] || null);
    return;
  }
  if (!rankings) {
    var rankSnap = await quiz.sessionRef.child('blockbenchContest/topicRankings').get();
    rankings = rankSnap.exists() ? tshirtObjValues(rankSnap.val()) : blockbenchFallbackTopics();
  }
  var topic = (rankings[roundIndex] && rankings[roundIndex].text) ||
              (rankings.length ? rankings[roundIndex % rankings.length].text : 'Game asset');
  var brackets = tshirtMakeBrackets(participants);
  var bracketObj = {};
  brackets.forEach(function(bracket) { bracketObj[bracket.id] = bracket; });
  var now = Date.now();
  await quiz.sessionRef.child('blockbenchContest/rounds/' + roundIndex).set({
    index: roundIndex,
    topic: topic,
    startedAt: now,
    brackets: bracketObj
  });
  await quiz.sessionRef.update({
    state: 'blockbench_draw',
    questionStart: now,
    questionDuration: cfg.drawSeconds || 180
  });
  await quiz.sessionRef.child('blockbenchContest/roundIndex').set(roundIndex);
}

async function startBlockbenchBracketVoteOrResolve(cfg) {
  var contestSnap = await quiz.sessionRef.child('blockbenchContest').get();
  var roundIndex = Number(contestSnap.child('roundIndex').val()) || 0;
  var round = contestSnap.child('rounds/' + roundIndex).val() || {};
  var brackets = tshirtObjValues(round.brackets);
  var submissions = contestSnap.child('submissions/' + roundIndex).val() || {};
  var playersSnap = await quiz.sessionRef.child('players').get();
  var activeSet = {};
  tshirtActivePlayerCodes(playersSnap.val() || {}).forEach(function(code) { activeSet[code] = true; });
  var hasVoteableBracket = brackets.some(function(bracket) {
    return tshirtObjValues(bracket.entrants).filter(function(code) {
      return activeSet[code] && submissions[code] && submissions[code].fileId && !blockbenchSubmissionBlocked(submissions[code]);
    }).length >= 2;
  });
  if (!hasVoteableBracket) {
    await resolveBlockbenchRoundAndContinue(cfg);
    return;
  }
  var now = Date.now();
  await quiz.sessionRef.update({
    state: 'blockbench_bracket_vote',
    questionStart: now,
    questionDuration: cfg.bracketVoteSeconds || 45
  });
}

async function resolveBlockbenchRoundAndContinue(cfg) {
  var snaps = await Promise.all([
    quiz.sessionRef.child('blockbenchContest').get(),
    quiz.sessionRef.child('players').get()
  ]);
  var contest = snaps[0].val() || {};
  var roundIndex = Number(contest.roundIndex) || 0;
  var round = contest.rounds && contest.rounds[roundIndex] ? contest.rounds[roundIndex] : {};
  var brackets = tshirtObjValues(round.brackets);
  var submissions = contest.submissions && contest.submissions[roundIndex] ? contest.submissions[roundIndex] : {};
  var votes = contest.bracketVotes && contest.bracketVotes[roundIndex] ? contest.bracketVotes[roundIndex] : {};
  var activeSet = {};
  tshirtActivePlayerCodes(snaps[1].val() || {}).forEach(function(code) { activeSet[code] = true; });

  var winners = [];
  var winnerWrites = [];
  brackets.forEach(function(bracket) {
    var entrants = tshirtObjValues(bracket.entrants);
    var activeEntrants = entrants.filter(function(code) { return activeSet[code]; });
    var submittedActive = entrants.filter(function(code) {
      return activeSet[code] && submissions[code] && submissions[code].fileId && !blockbenchSubmissionBlocked(submissions[code]);
    });
    var winner = null;
    if (entrants.length === 1) {
      winner = activeEntrants[0] || entrants[0];
    } else if (activeEntrants.length === 1) {
      winner = activeEntrants[0];
    } else if (submittedActive.length === 1) {
      winner = submittedActive[0];
    } else if (submittedActive.length === 0) {
      winner = activeEntrants[0] || entrants[0] || null;
    } else {
      var score = {};
      submittedActive.forEach(function(code) { score[code] = 0; });
      Object.keys(votes).forEach(function(voter) {
        if (entrants.indexOf(voter) !== -1) return;
        var selected = votes[voter] && votes[voter][bracket.id];
        if (score[selected] != null) score[selected]++;
      });
      winner = submittedActive.slice().sort(function(a, b) {
        if (score[b] !== score[a]) return score[b] - score[a];
        var ta = Number(submissions[a] && submissions[a].submittedAt) || 0;
        var tb = Number(submissions[b] && submissions[b].submittedAt) || 0;
        if (ta !== tb) return ta - tb;
        return entrants.indexOf(a) - entrants.indexOf(b);
      })[0];
    }
    if (winner) winners.push(winner);
    winnerWrites.push(quiz.sessionRef.child('blockbenchContest/rounds/' + roundIndex + '/brackets/' + bracket.id + '/winner').set(winner || null));
  });
  await Promise.all(winnerWrites);
  await quiz.sessionRef.child('blockbenchContest/rounds/' + roundIndex + '/winners').set(tshirtArrayToFirebaseObj(winners));
  if (winners.length <= 1) {
    await finishBlockbenchContest(winners[0] || null);
    return;
  }
  var rankSnap = await quiz.sessionRef.child('blockbenchContest/topicRankings').get();
  var rankings = rankSnap.exists() ? tshirtObjValues(rankSnap.val()) : blockbenchFallbackTopics();
  await startBlockbenchDrawingRound(roundIndex + 1, winners, rankings, cfg);
}

async function buildBlockbenchContestLeaderboard(champion) {
  var contestSnap = await quiz.sessionRef.child('blockbenchContest').get();
  var contest = contestSnap.val() || {};
  var wins = {};
  tshirtObjValues(contest.participants).forEach(function(code) { if (code) wins[code] = 0; });
  if (contest.rounds) {
    Object.keys(contest.rounds).forEach(function(roundKey) {
      var round = contest.rounds[roundKey] || {};
      tshirtObjValues(round.brackets).forEach(function(bracket) {
        tshirtObjValues(bracket.entrants).forEach(function(code) { if (code && wins[code] == null) wins[code] = 0; });
        if (bracket.winner) wins[bracket.winner] = (wins[bracket.winner] || 0) + 1;
      });
    });
  }
  if (champion && wins[champion] == null) wins[champion] = 0;
  return Object.keys(wins).map(function(code) {
    var winCount = wins[code] || 0;
    return {
      code: code,
      score: winCount,
      champion: code === champion,
      label: code === champion ? 'Champion' : (winCount + ' bracket win' + (winCount === 1 ? '' : 's'))
    };
  }).sort(function(a, b) {
    if (a.champion !== b.champion) return a.champion ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return String(studentName(a.code) || a.code).localeCompare(String(studentName(b.code) || b.code));
  });
}

async function finishBlockbenchContest(champion) {
  var leaderboard = await buildBlockbenchContestLeaderboard(champion);
  await quiz.sessionRef.child('blockbenchContest/champion').set(champion || null);
  await quiz.sessionRef.child('blockbenchContest/finalLeaderboard').set(tshirtArrayToFirebaseObj(leaderboard));
  await endQuiz();
}

async function startVotingPhase(qIdx) {
  var q = quiz.questions[qIdx] || {};
  var answersSnap = await quiz.sessionRef.child('answers/' + qIdx).get();
  var answers = answersSnap.exists() ? answersSnap.val() : {};

  // Build votingItems array from answers. Blockbench share questions keep model
  // file discovery in Google Drive, so Firebase stores only the platform code.
  var votingItems = [];
  Object.keys(answers).forEach(function(code) {
    var ans = answers[code];
    if (!ans) return;
    if (q.type === 'blockbench_share') {
      if (ans.submitted) votingItems.push({ code: code });
      return;
    }
    if (ans.fileId) votingItems.push({ code: code, fileId: ans.fileId });
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
  if (countEl) countEl.innerHTML = '<p style="color:#94a3b8;font-size:0.8rem">Loading…</p>';

  // Fetch voting items once so we know total per student and who submitted
  quiz.sessionRef.child('votingItems/' + qIdx).get().then(function(snap) {
    var itemsObj = snap.exists() ? snap.val() : {};
    var items    = Object.values(itemsObj).filter(Boolean);
    var totalItems = items.length;

    // Track which UIDs submitted (they skip their own, so their total = totalItems - 1)
    var submitterSet = {};
    items.forEach(function(item) {
      var code = item && (item.code || item.uid);
      if (code) submitterSet[code] = true;
    });

    // Live votes listener
    if (quiz._votingCountRef) quiz._votingCountRef.off('value', quiz._votingCountListener);
    quiz._votingCountRef = quiz.sessionRef.child('votes/' + qIdx);
    quiz._votingCountListener = quiz._votingCountRef.on('value', function(vSnap) {
      var votes   = vSnap.val() || {};
      var players = quiz.hostPlayers || {};
      var active  = Object.keys(players).filter(function(c) {
        return players[c] && !players[c].kicked;
      });

      if (!countEl) return;
      if (!active.length) {
        countEl.innerHTML = '<p style="color:#94a3b8;font-size:0.8rem">No students in lobby.</p>';
        return;
      }

      var rows = active.map(function(code) {
        var name   = studentName(code) || code;
        var myVotes = votes[code] ? Object.keys(votes[code]).length : 0;
        var total   = totalItems - (submitterSet[code] ? 1 : 0);
        var done    = total > 0 && myVotes >= total;
        return { name: name, myVotes: myVotes, total: total, done: done };
      }).sort(function(a, b) {
        // Finished students sink to bottom; within each group sort by progress desc
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (b.total > 0 ? b.myVotes / b.total : 0) - (a.total > 0 ? a.myVotes / a.total : 0);
      });

      var finishedCount = rows.filter(function(r) { return r.done; }).length;

      countEl.innerHTML =
        '<p style="color:#94a3b8;font-size:0.78rem;margin-bottom:0.5rem;text-align:center">' +
          finishedCount + ' / ' + rows.length + ' finished' +
        '</p>' +
        '<div style="display:flex;flex-direction:column;gap:0.3rem;max-height:260px;overflow-y:auto;width:100%">' +
          rows.map(function(r) {
            var pct = r.total > 0 ? Math.round((r.myVotes / r.total) * 100) : 100;
            var barColour = r.done ? '#4ade80' : (pct > 50 ? '#fbbf24' : '#60a5fa');
            return '<div style="background:#0f172a;border-radius:6px;padding:0.3rem 0.6rem">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.2rem">' +
                '<span style="font-size:0.8rem;color:' + (r.done ? '#4ade80' : '#e2e8f0') + ';' +
                  'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">' +
                  escapeHtml(r.name) + (r.done ? ' ✓' : '') + '</span>' +
                '<span style="font-size:0.75rem;color:' + barColour + ';font-variant-numeric:tabular-nums;flex-shrink:0;margin-left:0.5rem">' +
                  r.myVotes + ' / ' + r.total + '</span>' +
              '</div>' +
              '<div style="height:3px;background:#1e293b;border-radius:2px;overflow:hidden">' +
                '<div style="height:100%;width:' + pct + '%;background:' + barColour + ';transition:width .4s"></div>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>';
    });

    quiz.unsubscribers.push(function() {
      if (quiz._votingCountRef) quiz._votingCountRef.off('value', quiz._votingCountListener);
      quiz._votingCountRef = null;
    });
  }).catch(function() {
    if (countEl) countEl.innerHTML = '<p style="color:#f87171;font-size:0.8rem">Could not load voting items.</p>';
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
  itemsArr.forEach(function(item) {
    var code = item && (item.code || item.uid);
    if (code) itemMap[code] = item;
  });

  // Build ranked list
  var ranked = Object.keys(totals).map(function(uid) {
    var t = totals[uid];
    var item = itemMap[uid] || {};
    var avg = t.count > 0 ? Math.round((t.sum / t.count) * 10) / 10 : 0;
    return {
      code: uid,
      fileId: item.fileId || null,
      avg: avg,
      voteCount: t.count
    };
  }).sort(function(a, b) { return b.avg - a.avg; }).slice(0, 3);

  // Write vote averages back to each student's answer record so buildLeaderboard
  // can award points for canvas questions (scored 0–5 based on peer vote average).
  // Also include students who submitted but received no votes (score 0).
  var scoreWrites = [];
  itemsArr.forEach(function(item) {
    var code = item && (item.code || item.uid);
    if (!code) return;
    var t = totals[code];
    var avg = t ? (t.count > 0 ? Math.round((t.sum / t.count) * 10) / 10 : 0) : 0;
    scoreWrites.push(
      quiz.sessionRef.child('answers/' + qIdx + '/' + code + '/score').set(avg)
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
      var code = item.code || item.uid || '';
      var displayName = studentName(code) || item.name || code;
      row.innerHTML =
        '<span class="text-2xl shrink-0">' + (medals[i] || (i+1)+'.') + '</span>' +
        '<span class="font-semibold text-gray-100 flex-1 truncate">' + escapeHtml(displayName) + '</span>' +
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
  // Ensure canvas/pyscratch_share questions have had their scores computed.
  // startShowcasePhase writes per-student averages back to answers/{qIdx}/{uid}/score.
  // If the teacher exited the quiz early (skipping showcase), scores won't exist yet.
  for (var _qi = 0; _qi < quiz.questions.length; _qi++) {
    var _qq = quiz.questions[_qi];
    if (isQuizShareQuestion(_qq)) {
      try {
        var _scSnap = await quiz.sessionRef.child('showcaseItems/' + _qi).get();
        if (!_scSnap.exists()) {
          await startShowcasePhase(_qi);
        }
      } catch(_e) {
        console.warn('[endQuiz] Could not compute canvas scores for Q' + _qi + ':', _e);
      }
    }
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
  if (isQuizShareQuestion(q)) return 5; // scored 0-5 by peer vote average
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
  // Canvas / pyscratch_share: scored 0–5 by peer vote average (written back by startShowcasePhase)
  if (isQuizShareQuestion(q)) {
    var score = answerSnap.child('score').val();
    return (typeof score === 'number' && isFinite(score)) ? score : 0;
  }
  if (q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq') {
    return answerSnap.child('correct').val() === true ? 1 : 0;
  }
  return answerSnap.child('answer').val() === q.answer ? 1 : 0;
}

async function buildLeaderboard() {
  if ((quiz.questions || []).some(isTshirtContestQuestion) && quiz.sessionRef) {
    try {
      var contestLbSnap = await quiz.sessionRef.child('tshirtContest/finalLeaderboard').get();
      if (contestLbSnap.exists()) return tshirtObjValues(contestLbSnap.val());
    } catch(_e) {}
  }
  if ((quiz.questions || []).some(isBlockbenchContestQuestion) && quiz.sessionRef) {
    try {
      var bbContestLbSnap = await quiz.sessionRef.child('blockbenchContest/finalLeaderboard').get();
      if (bbContestLbSnap.exists()) return tshirtObjValues(bbContestLbSnap.val());
    } catch(_e2) {}
  }
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
  var isTshirtContest = (quiz.questions || []).some(isTshirtContestQuestion);
  var isBlockbenchContest = (quiz.questions || []).some(isBlockbenchContestQuestion);
  var isContest = isTshirtContest || isBlockbenchContest;
  var medals = ['🥇','🥈','🥉'];

  // If any question has peer-submitted media, make rows clickable to preview work
  var hasMedia = (quiz.questions || []).some(function(q) {
    return isQuizShareQuestion(q);
  }) || isContest;

  leaderboard.forEach(function(entry, i) {
    var row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-6 bg-gray-800 rounded-lg px-6 py-3 min-w-64' +
      (hasMedia ? ' cursor-pointer hover:bg-gray-700 transition-colors select-none' : '');
    row.innerHTML =
      '<span class="text-lg">' + (medals[i] || (i+1)+'.') + '</span>' +
      '<span class="font-mono text-gray-300 flex-1 text-left ml-2">' + escapeHtml(studentName(entry.code) || entry.code) + '</span>' +
      (hasMedia ? '<span class="text-gray-500 text-xs shrink-0 mr-2">👁 view</span>' : '') +
      '<span class="font-bold text-yellow-400 text-lg shrink-0">' + (isContest ? escapeHtml(entry.label || (entry.score + ' wins')) : (entry.score + ' / ' + maxScore)) + '</span>';
    if (hasMedia) {
      row.title = 'Click to view this student\'s submission';
      row.onclick = function() { showStudentWorkModal(entry.code); };
    }
    el.appendChild(row);
  });
  if (isTshirtContest) appendHostTshirtContestSummary(el);
  if (isBlockbenchContest) appendHostBlockbenchContestSummary(el);
}

function appendHostTshirtContestSummary(el) {
  if (!quiz.sessionRef || !el) return;
  var holder = document.createElement('div');
  holder.className = 'mt-6 w-full max-w-2xl text-left';
  holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-gray-400 text-sm text-center">Loading bracket results...</p>';
  el.appendChild(holder);
  quiz.sessionRef.child('tshirtContest/rounds').get().then(function(snap) {
    var rounds = tshirtObjValues(snap.val()).sort(function(a, b) { return (a.index || 0) - (b.index || 0); });
    if (!rounds.length) {
      holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-gray-400 text-sm text-center">No bracket results recorded.</p>';
      return;
    }
    holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3>';
    rounds.forEach(function(round) {
      var section = document.createElement('div');
      section.className = 'rounded-lg bg-gray-800 border border-gray-700 p-4 mb-3';
      var brackets = tshirtObjValues(round.brackets);
      section.innerHTML =
        '<div class="font-bold text-yellow-300 mb-2">Round ' + ((round.index || 0) + 1) + ': ' + escapeHtml(round.topic || 'Computing') + '</div>' +
        '<div class="space-y-2">' + brackets.map(function(bracket, idx) {
          var entrants = tshirtObjValues(bracket.entrants).map(function(code) { return studentName(code) || code; }).join(' vs ');
          var winner = bracket.winner ? (studentName(bracket.winner) || bracket.winner) : 'No winner';
          return '<div class="flex items-center justify-between gap-3 text-sm bg-gray-900 rounded px-3 py-2">' +
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

function appendHostBlockbenchContestSummary(el) {
  if (!quiz.sessionRef || !el) return;
  var holder = document.createElement('div');
  holder.className = 'mt-6 w-full max-w-2xl text-left';
  holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-gray-400 text-sm text-center">Loading bracket results...</p>';
  el.appendChild(holder);
  quiz.sessionRef.child('blockbenchContest/rounds').get().then(function(snap) {
    var rounds = tshirtObjValues(snap.val()).sort(function(a, b) { return (a.index || 0) - (b.index || 0); });
    if (!rounds.length) {
      holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3><p class="text-gray-400 text-sm text-center">No bracket results recorded.</p>';
      return;
    }
    holder.innerHTML = '<h3 class="text-lg font-bold text-white mb-3 text-center">Bracket winners</h3>';
    rounds.forEach(function(round) {
      var section = document.createElement('div');
      section.className = 'rounded-lg bg-gray-800 border border-gray-700 p-4 mb-3';
      var brackets = tshirtObjValues(round.brackets);
      section.innerHTML =
        '<div class="font-bold text-yellow-300 mb-2">Round ' + ((round.index || 0) + 1) + ': ' + escapeHtml(round.topic || 'Game asset') + '</div>' +
        '<div class="space-y-2">' + brackets.map(function(bracket, idx) {
          var entrants = tshirtObjValues(bracket.entrants).map(function(code) { return studentName(code) || code; }).join(' vs ');
          var winner = bracket.winner ? (studentName(bracket.winner) || bracket.winner) : 'No winner';
          return '<div class="flex items-center justify-between gap-3 text-sm bg-gray-900 rounded px-3 py-2">' +
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

async function showHostTshirtContestWorkModal(code) {
  var name = studentName(code) || code;
  var initialItem = hostTshirtContestItemConfig((quiz.questions || []).find(isTshirtContestQuestion) || {});
  var token = window.classroomState && window.classroomState.token;
  if (!token) {
    try { await getClassroomToken(); token = window.classroomState && window.classroomState.token; } catch(e) {}
  }

  var overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.9);' +
    'display:flex;flex-direction:column;align-items:center;overflow-y:auto;padding:2rem 1rem';

  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:760px';

  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;gap:1rem';
  var title = document.createElement('h2');
  title.style.cssText = 'color:#f1f5f9;font-size:1.25rem;font-weight:700;margin:0';
  title.textContent = name + "'s " + initialItem.itemPluralLabel;
  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'background:#334155;color:#f1f5f9;border:none;border-radius:6px;' +
    'padding:0.4rem 1rem;cursor:pointer;font-size:0.9rem;font-weight:600';
  closeBtn.onclick = function() { document.body.removeChild(overlay); };
  header.appendChild(title);
  header.appendChild(closeBtn);
  inner.appendChild(header);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  if (!token) {
    var noToken = document.createElement('div');
    noToken.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;color:#f87171;text-align:center';
    noToken.textContent = 'Drive is not connected, so the designs cannot be loaded.';
    inner.appendChild(noToken);
    return;
  }

  var contestSnap = await quiz.sessionRef.child('tshirtContest').get();
  var contest = contestSnap.val() || {};
  var item = hostTshirtContestItemConfig(contest.config || initialItem);
  title.textContent = name + "'s " + item.itemPluralLabel;
  var submissions = contest.submissions || {};
  var rounds = tshirtObjValues(contest.rounds).sort(function(a, b) {
    return (a.index || 0) - (b.index || 0);
  });

  var shown = 0;
  rounds.forEach(function(round) {
    var roundIndex = Number(round.index) || 0;
    var bracket = tshirtObjValues(round.brackets).find(function(b) {
      return tshirtObjValues(b.entrants).indexOf(code) !== -1;
    });
    var sub = submissions[roundIndex] && submissions[roundIndex][code];
    if (!bracket && !sub) return;
    shown++;

    var section = document.createElement('div');
    section.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;border:1px solid #334155';
    var entrants = bracket ? tshirtObjValues(bracket.entrants).map(function(uid) { return studentName(uid) || uid; }).join(' vs ') : 'No bracket recorded';
    var status = bracket && bracket.winner
      ? (bracket.winner === code ? 'Won this bracket' : 'Winner: ' + (studentName(bracket.winner) || bracket.winner))
      : 'No result recorded';
    var blocked = tshirtSubmissionBlocked(sub);
    section.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:0.75rem">' +
        '<div>' +
          '<div style="color:#fbbf24;font-weight:700">Round ' + (roundIndex + 1) + ': ' + escapeHtml(round.topic || 'Computing') + '</div>' +
          '<div style="color:#94a3b8;font-size:0.78rem;margin-top:0.2rem">' + escapeHtml(entrants) + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.45rem;flex-shrink:0">' +
          '<div style="color:' + (bracket && bracket.winner === code ? '#4ade80' : '#cbd5e1') + ';font-size:0.78rem;font-weight:700;text-align:right">' + escapeHtml(status) + '</div>' +
          (sub && sub.fileId ? '<button type="button" class="tsc-contest-block-btn" style="background:' + (blocked ? '#334155' : '#7f1d1d') + ';color:#f8fafc;border:1px solid ' + (blocked ? '#64748b' : '#ef4444') + ';border-radius:6px;padding:0.3rem 0.65rem;font-size:0.75rem;font-weight:700;cursor:pointer">' + (blocked ? 'Unblock image' : 'Block image') + '</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="tsc-contest-shirt-img" style="min-height:220px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:0.85rem">Loading design...</div>';
    inner.appendChild(section);

    var imgWrap = section.querySelector('.tsc-contest-shirt-img');
    var blockBtn = section.querySelector('.tsc-contest-block-btn');
    function refreshHostDesignImage() {
      imgWrap.innerHTML = '';
      imgWrap.style.cssText = 'min-height:220px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:0.85rem';
      if (!sub || !sub.fileId) {
        imgWrap.textContent = 'No design submitted for this round.';
        return;
      }
      if (tshirtSubmissionBlocked(sub)) {
        renderHostTshirtBlockedSquare(imgWrap);
        return;
      }
      imgWrap.textContent = 'Loading design...';
      window.driveFetchFileAsDataUrl(sub.fileId, token).then(function(dataUrl) {
        if (tshirtSubmissionBlocked(sub)) return;
        imgWrap.innerHTML = '';
        var img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = 'display:block;width:100%;max-width:420px;margin:0 auto;background:#334155;border-radius:8px;padding:6px;box-sizing:border-box';
        imgWrap.appendChild(img);
      }).catch(function(e) {
        if (!tshirtSubmissionBlocked(sub)) imgWrap.textContent = 'Could not load design: ' + (e.message || 'Drive error');
      });
    }
    if (blockBtn) {
      blockBtn.onclick = function() {
        var nextBlocked = !tshirtSubmissionBlocked(sub);
        blockBtn.disabled = true;
        quiz.sessionRef.child('tshirtContest/submissions/' + roundIndex + '/' + code).update({
          blocked: nextBlocked,
          blockedAt: nextBlocked ? Date.now() : null
        }).then(function() {
          sub.blocked = nextBlocked;
          if (nextBlocked) sub.blockedAt = Date.now(); else delete sub.blockedAt;
          blockBtn.textContent = nextBlocked ? 'Unblock image' : 'Block image';
          blockBtn.style.background = nextBlocked ? '#334155' : '#7f1d1d';
          blockBtn.style.borderColor = nextBlocked ? '#64748b' : '#ef4444';
          blockBtn.disabled = false;
          refreshHostDesignImage();
        }).catch(function(e) {
          alert('Could not update moderation state: ' + (e.message || e));
          blockBtn.disabled = false;
        });
      };
    }
    refreshHostDesignImage();
  });

  if (!shown) {
    var empty = document.createElement('div');
    empty.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;color:#94a3b8;text-align:center';
    empty.textContent = 'No ' + item.itemPluralLabel + ' were recorded for this student.';
    inner.appendChild(empty);
  }
}

async function showHostBlockbenchContestWorkModal(code) {
  var name = studentName(code) || code;
  var token = window.classroomState && window.classroomState.token;
  if (!token) {
    try { await getClassroomToken(); token = window.classroomState && window.classroomState.token; } catch(e) {}
  }

  var overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.9);' +
    'display:flex;flex-direction:column;align-items:center;overflow-y:auto;padding:2rem 1rem';

  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:820px';

  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;gap:1rem';
  var title = document.createElement('h2');
  title.style.cssText = 'color:#f1f5f9;font-size:1.25rem;font-weight:700;margin:0';
  title.textContent = name + "'s Blockbench models";
  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'background:#334155;color:#f1f5f9;border:none;border-radius:6px;' +
    'padding:0.4rem 1rem;cursor:pointer;font-size:0.9rem;font-weight:600';
  closeBtn.onclick = function() { document.body.removeChild(overlay); };
  header.appendChild(title);
  header.appendChild(closeBtn);
  inner.appendChild(header);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  if (!token) {
    var noToken = document.createElement('div');
    noToken.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;color:#f87171;text-align:center';
    noToken.textContent = 'Drive is not connected, so the models cannot be loaded.';
    inner.appendChild(noToken);
    return;
  }

  var contestSnap = await quiz.sessionRef.child('blockbenchContest').get();
  var contest = contestSnap.val() || {};
  var submissions = contest.submissions || {};
  var rounds = tshirtObjValues(contest.rounds).sort(function(a, b) {
    return (a.index || 0) - (b.index || 0);
  });

  var shown = 0;
  rounds.forEach(function(round) {
    var roundIndex = Number(round.index) || 0;
    var bracket = tshirtObjValues(round.brackets).find(function(b) {
      return tshirtObjValues(b.entrants).indexOf(code) !== -1;
    });
    var sub = submissions[roundIndex] && submissions[roundIndex][code];
    if (!bracket && !sub) return;
    shown++;

    var section = document.createElement('div');
    section.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;border:1px solid #334155';
    var entrants = bracket ? tshirtObjValues(bracket.entrants).map(function(uid) { return studentName(uid) || uid; }).join(' vs ') : 'No bracket recorded';
    var status = bracket && bracket.winner
      ? (bracket.winner === code ? 'Won this bracket' : 'Winner: ' + (studentName(bracket.winner) || bracket.winner))
      : 'No result recorded';
    var blocked = blockbenchSubmissionBlocked(sub);
    section.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:0.75rem">' +
        '<div>' +
          '<div style="color:#fbbf24;font-weight:700">Round ' + (roundIndex + 1) + ': ' + escapeHtml(round.topic || 'Game asset') + '</div>' +
          '<div style="color:#94a3b8;font-size:0.78rem;margin-top:0.2rem">' + escapeHtml(entrants) + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.45rem;flex-shrink:0">' +
          '<div style="color:' + (bracket && bracket.winner === code ? '#4ade80' : '#cbd5e1') + ';font-size:0.78rem;font-weight:700;text-align:right">' + escapeHtml(status) + '</div>' +
          (sub && sub.fileId ? '<button type="button" class="bbc-contest-block-btn" style="background:' + (blocked ? '#334155' : '#7f1d1d') + ';color:#f8fafc;border:1px solid ' + (blocked ? '#64748b' : '#ef4444') + ';border-radius:6px;padding:0.3rem 0.65rem;font-size:0.75rem;font-weight:700;cursor:pointer">' + (blocked ? 'Unblock model' : 'Block model') + '</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="bbc-contest-model" style="min-height:260px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:0.85rem">Loading model...</div>';
    inner.appendChild(section);

    var modelWrap = section.querySelector('.bbc-contest-model');
    var blockBtn = section.querySelector('.bbc-contest-block-btn');
    function refreshHostBlockbenchModel() {
      modelWrap.innerHTML = '';
      modelWrap.style.cssText = 'min-height:260px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:0.85rem';
      if (!sub || !sub.fileId) {
        modelWrap.textContent = 'No model submitted for this round.';
        return;
      }
      if (blockbenchSubmissionBlocked(sub)) {
        renderHostTshirtBlockedSquare(modelWrap);
        return;
      }
      modelWrap.textContent = 'Loading model...';
      window.driveFetchFileAsText(sub.fileId, token).then(function(text) {
        if (blockbenchSubmissionBlocked(sub)) return;
        renderBlockbenchModelViewer(modelWrap, text, { height: 460, spin: true });
      }).catch(function(e) {
        if (!blockbenchSubmissionBlocked(sub)) modelWrap.textContent = 'Could not load model: ' + (e.message || 'Drive error');
      });
    }
    if (blockBtn) {
      blockBtn.onclick = function() {
        var nextBlocked = !blockbenchSubmissionBlocked(sub);
        blockBtn.disabled = true;
        quiz.sessionRef.child('blockbenchContest/submissions/' + roundIndex + '/' + code).update({
          blocked: nextBlocked,
          blockedAt: nextBlocked ? Date.now() : null
        }).then(function() {
          sub.blocked = nextBlocked;
          if (nextBlocked) sub.blockedAt = Date.now(); else delete sub.blockedAt;
          blockBtn.textContent = nextBlocked ? 'Unblock model' : 'Block model';
          blockBtn.style.background = nextBlocked ? '#334155' : '#7f1d1d';
          blockBtn.style.borderColor = nextBlocked ? '#64748b' : '#ef4444';
          blockBtn.disabled = false;
          refreshHostBlockbenchModel();
        }).catch(function(e) {
          alert('Could not update moderation state: ' + (e.message || e));
          blockBtn.disabled = false;
        });
      };
    }
    refreshHostBlockbenchModel();
  });

  if (!shown) {
    var empty = document.createElement('div');
    empty.style.cssText = 'background:#1e293b;border-radius:12px;padding:1.25rem;color:#94a3b8;text-align:center';
    empty.textContent = 'No Blockbench models were recorded for this student.';
    inner.appendChild(empty);
  }
}

async function showStudentWorkModal(code) {
  var name = studentName(code) || code;
  var isTshirtContest = (quiz.questions || []).some(isTshirtContestQuestion);
  var isBlockbenchContest = (quiz.questions || []).some(isBlockbenchContestQuestion);
  if (isTshirtContest) {
    await showHostTshirtContestWorkModal(code);
    return;
  }
  if (isBlockbenchContest) {
    await showHostBlockbenchContestWorkModal(code);
    return;
  }

  // Find questions with peer-submitted media
  var mediaQs = (quiz.questions || []).map(function(q, i) {
    return { q: q, idx: i };
  }).filter(function(item) {
    return isQuizShareQuestion(item.q);
  });
  if (!mediaQs.length) return;

  // Ensure we have a Drive/Classroom token (teacher context)
  var token = window.classroomState && window.classroomState.token;
  if (!token) {
    try { await getClassroomToken(); token = window.classroomState && window.classroomState.token; } catch(e) {}
  }

  // ── Build overlay ────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.9);' +
    'display:flex;flex-direction:column;align-items:center;overflow-y:auto;padding:2rem 1rem';

  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:680px';

  // Header row
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem';
  var title = document.createElement('h2');
  title.style.cssText = 'color:#f1f5f9;font-size:1.25rem;font-weight:700;margin:0';
  title.textContent = name + '’s Work';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ Close';
  closeBtn.style.cssText =
    'background:#334155;color:#f1f5f9;border:none;border-radius:6px;' +
    'padding:0.4rem 1rem;cursor:pointer;font-size:0.9rem;font-weight:600';
  closeBtn.onclick = function() {
    // Revoke any blob URLs attached to iframes
    overlay.querySelectorAll('iframe[data-bloburl]').forEach(function(iframe) {
      try { URL.revokeObjectURL(iframe.dataset.bloburl); } catch(e) {}
    });
    document.body.removeChild(overlay);
  };
  header.appendChild(title);
  header.appendChild(closeBtn);
  inner.appendChild(header);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  // ── Load each media question ─────────────────────────────────
  mediaQs.forEach(function(mq) {
    var section = document.createElement('div');
    section.style.cssText =
      'background:#1e293b;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem';

    var qLabel = document.createElement('p');
    qLabel.style.cssText = 'color:#64748b;font-size:0.78rem;margin:0 0 0.75rem';
    qLabel.textContent = 'Q' + (mq.idx + 1) + ': ' + (mq.q.q || '');
    section.appendChild(qLabel);

    var contentEl = document.createElement('div');
    contentEl.innerHTML = '<p style="color:#64748b;font-size:0.85rem">Loading…</p>';
    section.appendChild(contentEl);
    inner.appendChild(section);

    // Async load — uses Drive folder lookup with localStorage fallback so it
    // still works after the Firebase session is cleaned up (30 s after end).
    (function(mq, contentEl) {
      var qType = mq.q.type;
      getQuizStudentFolderId(code).then(async function(folderId) {
        if (!folderId) {
          contentEl.innerHTML = '<p style="color:#64748b;font-size:0.85rem;text-align:center;padding:1rem 0">No Drive folder found for this student.</p>';
          return;
        }
        if (!token) {
          contentEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem">Drive not connected — cannot load file.</p>';
          return;
        }
        try {
          if (qType === 'blockbench_share') {
            var loaded = await loadBlockbenchShareModelText(mq.idx, code, token);
            renderBlockbenchModelViewer(contentEl, loaded.text, { height: 480, spin: true });
            return;
          }
          var filename =
            qType === 'pixel_art'       ? code + '-pixel-art.png' :
            qType === 'tshirt'          ? code + '-tshirt.png' :
            qType === 'pyscratch_share' ? code + '.sb3' :
            code + '.png'; // canvas
          var file = await window.driveFindLatestFileByName(folderId, filename, token);
          if (!file) {
            contentEl.innerHTML = '<p style="color:#64748b;font-size:0.85rem;text-align:center;padding:1rem 0">No submission from this student.</p>';
            return;
          }
          var resp = await fetch(
            'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media',
            { headers: { Authorization: 'Bearer ' + token } }
          );
          if (!resp.ok) throw new Error('Drive error ' + resp.status);
          var blob = await resp.blob();

          if (qType === 'canvas') {
            var imgUrl = URL.createObjectURL(blob);
            var img = document.createElement('img');
            img.src = imgUrl;
            img.style.cssText = 'width:100%;border-radius:8px;display:block';
            img.onload = function() { URL.revokeObjectURL(imgUrl); };
            img.onerror = function() { contentEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem">Could not display image.</p>'; };
            contentEl.innerHTML = '';
            contentEl.appendChild(img);
          } else if (qType === 'pyscratch_share') {
            var blobUrl = URL.createObjectURL(blob);
            var iframe = document.createElement('iframe');
            iframe.src = 'scratch/editor.html?pyscratch=1&project_url=' + encodeURIComponent(blobUrl);
            iframe.style.cssText = 'width:100%;height:480px;border:none;border-radius:8px;display:block;background:#000';
            iframe.dataset.bloburl = blobUrl;
            iframe.allow = 'microphone; camera';
            contentEl.innerHTML = '';
            contentEl.appendChild(iframe);
            setTimeout(function() {
              try { iframe.contentWindow.postMessage({ type: 'PS_PLAYER_MODE' }, '*'); } catch(e) {}
            }, 2500);
          } else if (qType === 'pixel_art') {
            var paUrl = URL.createObjectURL(blob);
            var paImg = document.createElement('img');
            paImg.src = paUrl;
            paImg.style.cssText = 'display:block;width:100%;max-width:512px;image-rendering:pixelated;image-rendering:crisp-edges;background:#000;border-radius:8px';
            paImg.onload = function() { URL.revokeObjectURL(paUrl); };
            paImg.onerror = function() { contentEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem">Could not display pixel art.</p>'; };
            contentEl.innerHTML = '';
            contentEl.appendChild(paImg);
          } else if (qType === 'tshirt') {
            var tUrl = URL.createObjectURL(blob);
            var tImg = document.createElement('img');
            tImg.src = tUrl;
            tImg.style.cssText = 'display:block;width:100%;max-width:420px;margin:0 auto;background:#334155;border-radius:8px;padding:6px;box-sizing:border-box';
            tImg.onload = function() { URL.revokeObjectURL(tUrl); };
            tImg.onerror = function() { contentEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem">Could not display design.</p>'; };
            contentEl.innerHTML = '';
            contentEl.appendChild(tImg);
          }
        } catch(e) {
          contentEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem">Could not load: ' + escapeHtml(e.message) + '</p>';
        }
      }).catch(function(e) {
        contentEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem">Error: ' + escapeHtml(e.message) + '</p>';
      });
    })(mq, contentEl);
  });
}
