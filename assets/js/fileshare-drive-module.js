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
 *       {emailKey}/    (email with dots→commas to satisfy Firebase key rules)
 *         folderId:    Drive folder ID for this student
 *         name:        display name
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

  // Normalise an email to a safe Firebase key (dots → commas).
  function emailKey(email) {
    return String(email || '').toLowerCase().trim().replace(/\./g, ',');
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
   * where studentFolders is { emailKey: { folderId, name, email } }
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

    var studentFolders = {}; // emailKey → { folderId, name, email }
    var total = students.length;
    var done  = 0;

    // Pass 1: create a subfolder per student and give them writer on it
    onProgress('Creating student folders (0/' + total + ')…');
    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      var displayName = s.fullName || ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || s.email;
      var fid = await findOrCreateFolder(displayName, sessionId, token);
      try { await grantPermission(fid, s.email, 'writer', token); } catch (e) {
        console.warn('[Drive] writer grant failed for', s.email, e.message);
      }
      studentFolders[emailKey(s.email)] = { folderId: fid, name: displayName, email: s.email };
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
   * Requests a student Drive token. If any scope is denied, shows an inline
   * error with a "Try Again" button and waits — never resolves until all
   * scopes are granted. statusEl is a DOM element for status messages.
   * Returns the access token string.
   */
  window.driveEnsureStudentToken = function (statusEl) {
    return new Promise(function (resolve, reject) {
      function setMsg(html, err) {
        if (!statusEl) return;
        statusEl.innerHTML = html;
        statusEl.style.color = err ? '#f87171' : '#94a3b8';
      }

      function attempt() {
        var clientId = window.state && window.state.config && window.state.config.googleClientId;
        if (!clientId) { reject(new Error('Google client ID not configured.')); return; }
        if (!window.google || !google.accounts || !google.accounts.oauth2) {
          reject(new Error('Google Identity Services not loaded.')); return;
        }
        setMsg('Waiting for Google sign-in…', false);

        google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: STUDENT_SCOPES,
          callback: function (resp) {
            if (!resp || resp.error) {
              return showRetry((resp && resp.error_description) || 'Sign-in cancelled or failed.');
            }
            var granted = String(resp.scope || '').split(' ');
            var required = STUDENT_SCOPES.split(' ');
            var missing  = required.filter(function (s) {
              return !granted.some(function (g) { return g === s; });
            });
            if (missing.length) {
              return showRetry(
                'Some permissions were not granted. ' +
                'Google Drive access is required to upload and view submissions. ' +
                'Please allow all permissions when prompted.'
              );
            }
            _studentToken = resp.access_token;
            setMsg('✓ Google Drive connected', false);
            // Fetch email so we can look up the student's folder
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: 'Bearer ' + _studentToken }
            }).then(function (r) { return r.json(); }).then(function (profile) {
              _studentEmail = String(profile.email || '').toLowerCase().trim();
              resolve(_studentToken);
            }).catch(function () { resolve(_studentToken); });
          },
          error_callback: function (err) {
            showRetry(err.type || 'OAuth error');
          }
        }).requestAccessToken({ prompt: 'consent' });
      }

      function showRetry(msg) {
        setMsg(
          '<span>' + escHtml(msg) + '</span>' +
          ' <button id="fs-retry-btn" style="margin-left:8px;padding:2px 10px;' +
          'background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem">' +
          'Try Again</button>', true
        );
        var btn = statusEl && statusEl.querySelector('#fs-retry-btn');
        if (btn) btn.onclick = function () { _studentToken = null; attempt(); };
      }

      if (_studentToken) { setMsg('✓ Google Drive connected', false); resolve(_studentToken); return; }
      attempt();
    });
  };

  /** Returns the email address of the signed-in student (null if not yet signed in). */
  window.driveStudentEmail = function () { return _studentEmail; };

  /** Clear cached credentials (call on quiz exit). */
  window.driveClearStudentToken = function () { _studentToken = null; _studentEmail = null; };

  // ── Student: find their folder from Firebase ───────────────────

  /**
   * driveLookupStudentFolder(sessionRef, email)
   * Returns the Drive folder ID for the student, or null if not found.
   */
  window.driveLookupStudentFolder = async function (sessionRef, email) {
    var snap = await sessionRef.child('studentFolders/' + emailKey(email)).get();
    return snap.exists() ? snap.child('folderId').val() : null;
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
   * driveListFolderFiles(folderId, token)
   * Returns array of { id, name } for files inside a folder.
   */
  window.driveListFolderFiles = async function (folderId, token) {
    var res = await driveReq(
      'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent('"' + folderId + '" in parents and trashed=false') +
      '&fields=files(id,name)&pageSize=10',
      { method: 'GET' }, token
    );
    return (res.files || []);
  };

  // ── Utility ───────────────────────────────────────────────────

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

})();
