/**
 * fileshare-drive-module.js
 *
 * Google Drive backbone for quiz file-sharing activities (e.g. canvas art competition).
 *
 * Teacher flow  — uses the existing classroomState.token (already has drive scope).
 *   driveSetupSession(courseId, lobbyCode)
 *     → creates / reuses "JHNCC Computing" root folder (teacher-only)
 *     → creates session subfolder named by lobbyCode
 *     → fetches student emails from Classroom
 *     → grants each student writer permission on the session folder
 *     → returns { rootFolderId, sessionFolderId }
 *
 * Student flow  — separate drive.file token, re-prompted until all scopes granted.
 *   driveEnsureStudentToken(statusEl)
 *     → returns a valid access token, retrying with clear UI until user accepts
 *   driveUploadFile(folderId, filename, blob, mimeType, token)
 *     → multipart upload, returns { id, name }
 *   driveFetchFileAsDataUrl(fileId, token)
 *     → returns a data-URL string for gallery display
 *
 * Firebase stores ONLY metadata (folder IDs, file IDs) — no file content.
 */

(function () {

  // ── Helpers ────────────────────────────────────────────────────

  function driveRequest(url, options, token) {
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

  // Find or create a folder with a given name inside parentId.
  // Returns the folder's Drive ID.
  async function driveCreateOrReuseFolder(name, parentId, token) {
    var q = 'mimeType="application/vnd.google-apps.folder"' +
            ' and name=' + JSON.stringify(name) +
            ' and trashed=false' +
            (parentId ? ' and "' + parentId + '" in parents' : '');
    var search = await driveRequest(
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
      '&fields=files(id,name)&pageSize=10',
      { method: 'GET' },
      token
    );
    if (search.files && search.files.length) return search.files[0].id;

    var meta = { name: name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) meta.parents = [parentId];
    var created = await driveRequest(
      'https://www.googleapis.com/drive/v3/files?fields=id,name',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meta)
      },
      token
    );
    return created.id;
  }

  // Grant a single email address writer access to a Drive file/folder.
  async function driveGrantPermission(fileId, email, token) {
    await driveRequest(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
      '/permissions?sendNotificationEmail=false',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email })
      },
      token
    );
  }

  // ── Teacher: full session setup ────────────────────────────────

  /**
   * driveSetupSession(courseId, lobbyCode)
   *
   * Requires classroomState.token to already be set (call getClassroomToken() first).
   * Returns { rootFolderId, sessionFolderId, studentCount }.
   */
  window.driveSetupSession = async function (courseId, lobbyCode, onProgress) {
    var token = window.classroomState && window.classroomState.token;
    if (!token) throw new Error('No classroom/Drive token. Please authenticate first.');

    onProgress = onProgress || function () {};

    // 1. Root folder
    onProgress('Creating JHNCC Computing folder…');
    var rootId = await driveCreateOrReuseFolder('JHNCC Computing', null, token);

    // 2. Session subfolder
    onProgress('Creating session folder…');
    var sessionId = await driveCreateOrReuseFolder('Session ' + lobbyCode, rootId, token);

    // 3. Fetch students from Classroom
    onProgress('Fetching class roster…');
    var students = await classroomListStudents(courseId);
    var emails = students
      .map(function (s) { return s.email || (s.profile && s.profile.emailAddress); })
      .filter(Boolean);

    // 4. Grant permissions
    onProgress('Granting access to ' + emails.length + ' student(s)…');
    var granted = 0;
    for (var i = 0; i < emails.length; i++) {
      try {
        await driveGrantPermission(sessionId, emails[i], token);
        granted++;
        onProgress('Granting access… (' + granted + '/' + emails.length + ')');
      } catch (e) {
        console.warn('[Drive] Could not grant access to', emails[i], e.message);
      }
    }

    onProgress('Done — ' + granted + ' student(s) granted access.');
    return { rootFolderId: rootId, sessionFolderId: sessionId, studentCount: granted };
  };

  // ── Student: token management with retry UI ────────────────────

  var _studentDriveToken = null;
  var STUDENT_DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  /**
   * driveEnsureStudentToken(statusEl)
   *
   * Requests a drive.file token for the student.  If the user declines any scope,
   * shows an error inside statusEl and returns a Promise that resolves only after
   * the user successfully grants all permissions (re-prompting each time they click
   * "Try Again").
   *
   * statusEl: a DOM element used to show status/error messages.
   * Returns the access token string.
   */
  window.driveEnsureStudentToken = function (statusEl) {
    return new Promise(function (resolve, reject) {

      function setStatus(html, isError) {
        if (!statusEl) return;
        statusEl.innerHTML = html;
        statusEl.style.color = isError ? '#f87171' : '#94a3b8';
      }

      function attempt() {
        var clientId = window.state && window.state.config && window.state.config.googleClientId;
        if (!clientId) { reject(new Error('Google client ID not configured.')); return; }
        if (!window.google || !google.accounts || !google.accounts.oauth2) {
          reject(new Error('Google Identity Services not loaded.')); return;
        }

        setStatus('Waiting for Google sign-in…', false);

        var client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: STUDENT_DRIVE_SCOPES.join(' '),
          callback: function (resp) {
            if (!resp || resp.error) {
              var msg = (resp && resp.error_description) || 'Sign-in cancelled.';
              setStatus(
                '<span>' + escHtml(msg) + '</span> ' +
                '<button id="drive-retry-btn" style="margin-left:8px;padding:2px 10px;' +
                'background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem">' +
                'Try Again</button>',
                true
              );
              var btn = statusEl && statusEl.querySelector('#drive-retry-btn');
              if (btn) btn.onclick = attempt;
              return;
            }

            // Verify scopes
            var granted = String(resp.scope || '').split(' ');
            var missing = STUDENT_DRIVE_SCOPES.filter(function (s) {
              return !granted.some(function (g) { return g === s; });
            });
            if (missing.length) {
              setStatus(
                '⚠️ Some permissions were not granted. Drive upload requires Google Drive access. ' +
                '<button id="drive-retry-btn" style="margin-left:8px;padding:2px 10px;' +
                'background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem">' +
                'Try Again</button>',
                true
              );
              var btn2 = statusEl && statusEl.querySelector('#drive-retry-btn');
              if (btn2) btn2.onclick = attempt;
              return;
            }

            _studentDriveToken = resp.access_token;
            setStatus('✓ Google Drive connected', false);
            resolve(_studentDriveToken);
          },
          error_callback: function (err) {
            setStatus(
              '⚠️ ' + escHtml(err.type || 'OAuth error') + '. ' +
              '<button id="drive-retry-btn" style="margin-left:8px;padding:2px 10px;' +
              'background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem">' +
              'Try Again</button>',
              true
            );
            var btn3 = statusEl && statusEl.querySelector('#drive-retry-btn');
            if (btn3) btn3.onclick = attempt;
          }
        });
        client.requestAccessToken({ prompt: 'consent' });
      }

      // If we already have a valid token, reuse it
      if (_studentDriveToken) {
        setStatus('✓ Google Drive connected', false);
        resolve(_studentDriveToken);
        return;
      }
      attempt();
    });
  };

  // Clear cached student token (call on sign-out / quiz exit)
  window.driveClearStudentToken = function () { _studentDriveToken = null; };

  // ── Student: file upload ───────────────────────────────────────

  /**
   * driveUploadFile(folderId, filename, blob, mimeType, token)
   * Multipart upload to Drive. Returns { id, name }.
   */
  window.driveUploadFile = async function (folderId, filename, blob, mimeType, token) {
    mimeType = mimeType || 'application/octet-stream';
    var meta = JSON.stringify({ name: filename, parents: [folderId] });
    var boundary = 'jhncc_' + Math.random().toString(36).slice(2);
    var metaPart =
      '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      meta + '\r\n';
    var dataPart =
      '--' + boundary + '\r\n' +
      'Content-Type: ' + mimeType + '\r\n\r\n';
    var ending = '\r\n--' + boundary + '--';

    var metaBytes = new TextEncoder().encode(metaPart);
    var dataPartBytes = new TextEncoder().encode(dataPart);
    var endBytes = new TextEncoder().encode(ending);
    var fileBytes = new Uint8Array(await blob.arrayBuffer());

    var body = new Uint8Array(
      metaBytes.length + dataPartBytes.length + fileBytes.length + endBytes.length
    );
    var offset = 0;
    [metaBytes, dataPartBytes, fileBytes, endBytes].forEach(function (chunk) {
      body.set(chunk, offset); offset += chunk.length;
    });

    return driveRequest(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: body
      },
      token
    );
  };

  // ── Student: fetch file as data URL ───────────────────────────

  /**
   * driveFetchFileAsDataUrl(fileId, token)
   * Downloads a Drive file and returns a data-URL (for gallery display).
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
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // ── Utility ───────────────────────────────────────────────────

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

})();
