/**
 * fileshare-drive-module.js
 *
 * Google Drive backbone for quiz file-sharing activities (e.g. canvas art competition).
 *
 * ── Permission model ────────────────────────────────────────────────────────
 *
 *   JHNCC Computing/           teacher-only (not shared)
 *     Session XXXX/            all students → reader  (so they can see the gallery)
 *       John Smith/            John → writer           (so he can upload his own work)
 *       Jane Doe/              Jane → writer
 *       ...
 *
 * This costs 2N Drive API calls (N reader grants on session + N writer grants on
 * individual subfolders) rather than N² cross-grants.
 *
 * Students CANNOT write to each other's subfolders — they only have reader there.
 * Students CANNOT see JHNCC Computing (not shared with them).
 * Students CANNOT see the teacher's Drive — they only see what's explicitly shared.
 *
 * ── Student OAuth scopes ────────────────────────────────────────────────────
 *
 *   drive.file     — create/upload their own PNG (write to their subfolder)
 *   drive.readonly — read gallery (list files in subfolders shared with them)
 *   userinfo.email — identify which subfolder belongs to them
 *
 * ── Firebase (metadata only, no file content) ───────────────────────────────
 *
 *   quizSessions/{code}/
 *     driveFolderId:   session subfolder ID
 *     studentFolders/
 *       {studentCode}: Drive folder ID for this student
 */

(function () {

  // ── Drive API helper ───────────────────────────────────────────

  function driveReq(url, options, token) {
    return fetch(url, Object.assign({}, options || {}, {
      headers: Object.assign({}, (options && options.headers) || {}, {
        Authorization: 'Bearer ' + token
      })
    })).then(function (resp) {
      return resp.json().then(function (body) {
        if (!resp.ok) {
          var msg = body && body.error && (body.error.message || body.error.status);
          throw new Error(msg || ('Drive API error ' + resp.status));
        }
        return body;
      });
    });
  }

  // Keep Firebase keys valid without storing personal identifiers.
  function safeFirebaseKey(value) {
    return String(value || '').trim().replace(/[.#$/[\]]/g, '_');
  }

  async function loadCodeRecordsByEmail() {
    if (typeof classroomFindCodeSpreadsheetOnly !== 'function' ||
        typeof classroomReadConsolidatedRecords !== 'function') {
      return {};
    }
    var spreadsheet = await classroomFindCodeSpreadsheetOnly();
    if (!spreadsheet || !spreadsheet.id) return {};
    var records = await classroomReadConsolidatedRecords(spreadsheet.id);
    return (records && records.byEmail) || {};
  }

  // ── Folder helpers (teacher token) ────────────────────────────

  async function findOrCreateFolder(name, parentId, token) {
    var q = 'mimeType="application/vnd.google-apps.folder"' +
            ' and name=' + JSON.stringify(name) +
            ' and trashed=false' +
            (parentId ? ' and "' + parentId + '" in parents' : '');
    var res = await driveReq(
      'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent(q) + '&fields=files(id)&pageSize=5',
      { method: 'GET' }, token
    );
    if (res.files && res.files.length) return res.files[0].id;

    var meta = { name: name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) meta.parents = [parentId];
    var created = await driveReq(
      'https://www.googleapis.com/drive/v3/files?fields=id',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) },
      token
    );
    return created.id;
  }

  async function grantPermission(fileId, email, role, token) {
    await driveReq(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
      '/permissions?sendNotificationEmail=false',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', role: role, emailAddress: email })
      },
      token
    );
  }

  // ── Teacher: full session setup ────────────────────────────────

  /**
   * driveSetupSession(courseId, lobbyCode, onProgress)
   *
   * Requires classroomState.token (call getClassroomToken() first).
   *
   * Creates:
   *   JHNCC Computing/ (reused if exists)
   *     Session {lobbyCode}/
   *       {Student Name}/  — per student
   *
   * Permissions:
   *   Session folder: every student → reader
   *   Student subfolder: that student → writer
   *
   * Returns { rootFolderId, sessionFolderId, studentFolders }
   * where studentFolders is { studentCode: folderId }
   */
  window.driveSetupSession = async function (courseId, lobbyCode, onProgress) {
    var token = window.classroomState && window.classroomState.token;
    if (!token) throw new Error('No Drive token — authenticate first.');
    onProgress = onProgress || function () {};

    onProgress('Creating JHNCC Computing folder…');
    var rootId = await findOrCreateFolder('JHNCC Computing', null, token);

    onProgress('Creating session folder…');
    var sessionId = await findOrCreateFolder('Session ' + lobbyCode, rootId, token);

    onProgress('Fetching class roster…');
    var students = await classroomListStudents(courseId);
    // classroomListStudents returns objects with .name and .email (see admin-module)
    students = students.filter(function (s) { return s.email; });

    var studentFolders = {}; // studentCode -> Drive folderId
    var total = students.length;
    var done  = 0;
    onProgress('Matching Drive roster to platform codes...');
    var codeRecordsByEmail = await loadCodeRecordsByEmail();
    var skipped = 0;

    // Pass 1: create a subfolder per student and give them writer on it
    onProgress('Creating student folders (0/' + total + ')…');
    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      var rec = codeRecordsByEmail[String(s.email || '').toLowerCase()];
      var code = rec && rec.code ? String(rec.code).trim() : '';
      if (!code) {
        skipped++;
        onProgress('Creating student folders (' + (++done) + '/' + total + ')...');
        continue;
      }
      var displayName = s.fullName || ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || s.email;
      var fid = await findOrCreateFolder(displayName, sessionId, token);
      try { await grantPermission(fid, s.email, 'writer', token); } catch (e) {
        console.warn('[Drive] writer grant failed for', s.email, e.message);
      }
      studentFolders[safeFirebaseKey(code)] = fid;
      onProgress('Creating student folders (' + (++done) + '/' + total + ')…');
    }

    // Pass 2: grant every student reader on the session folder
    // (so they can see the gallery — all subfolders — but not write outside their own)
    onProgress('Granting gallery access…');
    for (var j = 0; j < students.length; j++) {
      try { await grantPermission(sessionId, students[j].email, 'reader', token); } catch (e) {
        console.warn('[Drive] reader grant failed for', students[j].email, e.message);
      }
    }

    onProgress('Done — ' + total + ' student folder(s) ready.');
    return { rootFolderId: rootId, sessionFolderId: sessionId, studentFolders: studentFolders };
  };

  // ── Student: token management with retry ──────────────────────

  var _studentToken = null;
  var _studentEmail = null;

  var STUDENT_SCOPES = [
    'https://www.googleapis.com/auth/drive.file',     // upload to their own folder
    'https://www.googleapis.com/auth/drive.readonly', // read gallery (others' folders)
    'https://www.googleapis.com/auth/userinfo.email', // identify their folder
    'https://www.googleapis.com/auth/userinfo.profile'
  ].join(' ');

  /**
   * driveEnsureStudentToken(statusEl)
   *
   * Shows a full-screen modal prompting the student to sign in with Google.
   * If any scope is denied the modal stays open with an error and a "Try Again"
   * button — never resolves until all scopes are granted.
   * statusEl (optional) receives a small status line once connected.
   * Returns the access token string.
   *
   * Every call to requestAccessToken() comes from a direct button click inside
   * the modal, which satisfies the browser's user-gesture requirement and avoids
   * the Cross-Origin-Opener-Policy "window.closed blocked" error.
   */
  window.driveEnsureStudentToken = function (statusEl) {
    return new Promise(function (resolve, reject) {

      function setStatus(html, err) {
        if (!statusEl) return;
        statusEl.innerHTML = html;
        statusEl.style.color = err ? '#f87171' : '#94a3b8';
      }

      // ── Build or reuse the auth modal ─────────────────────────────────────
      var overlay = document.getElementById('fs-drive-auth-modal');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fs-drive-auth-modal';
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
          'justify-content:center;background:rgba(0,0,0,0.8)';
        overlay.innerHTML =
          '<div style="background:#1e293b;border-radius:14px;padding:2rem 1.75rem;' +
          'max-width:400px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.6)">' +
            '<div style="font-size:2.75rem;margin-bottom:0.75rem">🔐</div>' +
            '<h2 id="fs-auth-title" style="color:#f1f5f9;font-size:1.15rem;font-weight:700;margin-bottom:0.6rem">' +
              'Google Drive sign-in needed' +
            '</h2>' +
            '<p id="fs-auth-msg" style="color:#94a3b8;font-size:0.88rem;line-height:1.6;margin-bottom:1.1rem"></p>' +
            '<div style="background:#0f172a;border:1px solid #fbbf24;border-radius:8px;' +
            'padding:0.7rem 0.9rem;margin-bottom:1.25rem;text-align:left">' +
              '<p style="color:#fbbf24;font-size:0.8rem;font-weight:700;margin-bottom:0.3rem">⚠ Important</p>' +
              '<p style="color:#cbd5e1;font-size:0.82rem;line-height:1.55">' +
                'When the Google window opens, tick <strong style="color:#f1f5f9">every checkbox</strong> ' +
                'or click <strong style="color:#f1f5f9">"Select all"</strong> — then click Continue.<br>' +
                'The activity will not work if any permission is left unticked.' +
              '</p>' +
            '</div>' +
            '<button id="fs-auth-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;' +
            'padding:0.65rem 0;font-size:0.97rem;font-weight:600;cursor:pointer;width:100%;' +
            'transition:opacity .15s">Sign in with Google</button>' +
            '<p id="fs-auth-err" style="color:#f87171;font-size:0.8rem;margin-top:0.75rem;min-height:1.1em"></p>' +
          '</div>';
        document.body.appendChild(overlay);
      }

      var modalMsg = overlay.querySelector('#fs-auth-msg');
      var modalBtn = overlay.querySelector('#fs-auth-btn');
      var modalErr = overlay.querySelector('#fs-auth-err');

      function showModal(infoMsg, errMsg) {
        if (modalMsg) modalMsg.textContent = infoMsg || '';
        if (modalErr) modalErr.textContent = errMsg  || '';
        if (modalBtn) { modalBtn.disabled = false; modalBtn.textContent = 'Sign in with Google'; }
        overlay.style.display = 'flex';
      }

      function hideModal() {
        overlay.style.display = 'none';
      }

      // ── OAuth attempt — must always be called from a button click ─────────
      function attempt() {
        var clientId = window.state && window.state.config && window.state.config.googleClientId;
        if (!clientId) { hideModal(); reject(new Error('Google client ID not configured.')); return; }
        if (!window.google || !google.accounts || !google.accounts.oauth2) {
          hideModal(); reject(new Error('Google Identity Services not loaded.')); return;
        }

        if (modalBtn) { modalBtn.disabled = true; modalBtn.textContent = 'Opening Google…'; }
        if (modalErr) modalErr.textContent = '';
        setStatus('Waiting for Google sign-in…', false);

        google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: STUDENT_SCOPES,
          callback: function (resp) {
            if (!resp || resp.error) {
              var msg = resp && resp.error === 'access_denied'
                ? 'You did not grant access. Please try again and accept all permissions.'
                : ((resp && resp.error_description) || 'Sign-in failed — please try again.');
              showModal(null, msg);
              return;
            }
            var granted  = String(resp.scope || '').split(' ');
            var required = STUDENT_SCOPES.split(' ');
            var missing  = required.filter(function (s) {
              return !granted.some(function (g) { return g === s; });
            });
            if (missing.length) {
              showModal(
                null,
                'Some permissions were not ticked. Please try again and make sure ' +
                'you click "Select all" before pressing Continue.'
              );
              return;
            }
            // All scopes granted ✓
            hideModal();
            _studentToken = resp.access_token;
            setStatus('✓ Google Drive connected', false);
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: 'Bearer ' + _studentToken }
            }).then(function (r) { return r.json(); }).then(function (profile) {
              _studentEmail = String(profile.email || '').toLowerCase().trim();
              resolve(_studentToken);
            }).catch(function () { resolve(_studentToken); });
          },
          error_callback: function (err) {
            var msg = err.type === 'popup_closed'
              ? 'You closed the sign-in window. Please try again.'
              : (err.type || 'A sign-in error occurred. Please try again.');
            showModal(null, msg);
          }
        }).requestAccessToken({ prompt: 'consent' });
      }

      // Wire up the button (replace previous handler if modal was reused)
      if (modalBtn) modalBtn.onclick = attempt;

      // Already authenticated — skip the modal entirely
      if (_studentToken) {
        setStatus('✓ Google Drive connected', false);
        resolve(_studentToken);
        return;
      }

      // Show modal with info message; student clicks the button to start OAuth
      showModal(
        'This activity saves your work to Google Drive so the class can see everyone\'s submissions.'
      );
    });
  };

  /** Returns the email address of the signed-in student (null if not yet signed in). */
  window.driveStudentEmail = function () { return _studentEmail; };

  /** Clear cached credentials (call on quiz exit). */
  window.driveClearStudentToken = function () { _studentToken = null; _studentEmail = null; };

  /** Pre-fill credentials from the student login flow so Drive activities need no extra prompt. */
  window.drivePreloadStudentToken = function (token, email) {
    _studentToken = token;
    _studentEmail = String(email || '').toLowerCase().trim();
  };

  // ── Student: find their folder from Firebase ───────────────────

  /**
   * driveLookupStudentFolder(sessionRef)
   * Returns the Drive folder ID for the student, or null if not found.
   */
  window.driveLookupStudentFolder = async function (sessionRef) {
    var code = window.state && window.state.uid;
    if (!code) return null;
    var snap = await sessionRef.child('studentFolders/' + safeFirebaseKey(code)).get();
    return snap.exists() ? snap.val() : null;
  };

  // ── Student: upload file ───────────────────────────────────────

  /**
   * driveUploadFile(folderId, filename, blob, mimeType, token)
   * Multipart upload. Returns { id, name }.
   */
  window.driveUploadFile = async function (folderId, filename, blob, mimeType, token) {
    mimeType = mimeType || 'image/png';
    var meta  = JSON.stringify({ name: filename, parents: [folderId] });
    var boundary = 'jhncc_' + Math.random().toString(36).slice(2);

    var enc       = new TextEncoder();
    var metaPart  = enc.encode('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n');
    var dataPart  = enc.encode('--' + boundary + '\r\nContent-Type: ' + mimeType + '\r\n\r\n');
    var endPart   = enc.encode('\r\n--' + boundary + '--');
    var fileBytes = new Uint8Array(await blob.arrayBuffer());

    var body = new Uint8Array(metaPart.length + dataPart.length + fileBytes.length + endPart.length);
    var off  = 0;
    [metaPart, dataPart, fileBytes, endPart].forEach(function (c) { body.set(c, off); off += c.length; });

    return driveReq(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body },
      token
    );
  };

  // ── Student: fetch file as data URL (for gallery) ─────────────

  /**
   * driveFetchFileAsDataUrl(fileId, token)
   * Downloads via Drive API (requires drive.readonly or drive.file on that specific file).
   */
  window.driveFetchFileAsDataUrl = async function (fileId, token) {
    var resp = await fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!resp.ok) throw new Error('Could not fetch file ' + fileId + ' (' + resp.status + ')');
    var blob = await resp.blob();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload  = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * driveFetchFileAsText(fileId, token)
   * Downloads a small text/JSON file via Drive API.
   */
  window.driveFetchFileAsText = async function (fileId, token) {
    var resp = await fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!resp.ok) throw new Error('Could not fetch file ' + fileId + ' (' + resp.status + ')');
    return resp.text();
  };

  /**
   * driveListFolderFiles(folderId, token)
   * Returns array of { id, name } for files inside a folder.
   */
  window.driveListFolderFiles = async function (folderId, token) {
    var res = await driveReq(
      'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent('"' + folderId + '" in parents and trashed=false') +
      '&fields=files(id,name,modifiedTime)&pageSize=100',
      { method: 'GET' }, token
    );
    return (res.files || []);
  };

  window.driveFindLatestFileByName = async function (folderId, filename, token) {
    var files = await window.driveListFolderFiles(folderId, token);
    return files.filter(function(file) {
      return file && file.name === filename;
    }).sort(function(a, b) {
      return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || ''));
    })[0] || null;
  };

  // ── Utility ───────────────────────────────────────────────────

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

})();
