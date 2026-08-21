/* Modda Admin Auth & Logic — auto.js */
(() => {
  'use strict';

  // ====== Config (must match apps.json) ======
  const CONFIG = {
    githubUser: 'modda',
    githubRepo: 'modda',
    branch: 'main',
    // SHA-256 of default password "admin123" — replace with your own
    // Generate via: crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpass'))
    passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
    sessionDuration: 1000 * 60 * 60 * 8 // 8 hours
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ====== State ======
  const STATE = {
    apps: [],
    editingId: null,
    config: { ...CONFIG }
  };

  // ====== Utilities ======
  function toast(msg, type = 'success') {
    const container = $('#toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function slugify(s) {
    return String(s || '').toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60);
  }

  function genId() {
    return 'app-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function buildDownloadUrl(filePath) {
    if (!filePath) return '';
    if (/^https?:\/\//.test(filePath)) return filePath;
    const { githubUser, githubRepo } = STATE.config;
    const encoded = filePath.split('/').map(encodeURIComponent).join('/');
    return `https://${githubUser}.github.io/${githubRepo}/${encoded}`;
  }

  // ====== Session ======
  const SESSION_KEY = 'modda-admin-session';
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function setSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, exp: Date.now() + CONFIG.sessionDuration }));
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }
  function isValidSession() {
    const s = getSession();
    if (!s) return false;
    if (s.exp < Date.now()) { clearSession(); return false; }
    return true;
  }

  // ====== Login Gate ======
  async function attemptLogin(user, pass) {
    const hash = await sha256(pass);
    if (hash === CONFIG.passwordHash) {
      setSession({ user, loggedIn: true });
      return true;
    }
    return false;
  }

  // ====== Data persistence (admin working copy) ======
  const WORK_KEY = 'modda-admin-apps';
  function loadWork() {
    try {
      const raw = localStorage.getItem(WORK_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }
  function saveWork() {
    localStorage.setItem(WORK_KEY, JSON.stringify(STATE.apps));
  }

  async function loadCatalog() {
    try {
      const res = await fetch('apps.json?t=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data.apps)) throw new Error('Invalid');
      STATE.apps = data.apps;
      if (data.config) STATE.config = { ...STATE.config, ...data.config };
      // Merge any unsaved work
      const work = loadWork();
      if (work && Array.isArray(work)) {
        if (confirm('You have unsaved changes from a previous session. Restore them?')) {
          STATE.apps = work;
        }
      }
    } catch (err) {
      toast('Failed to load catalog: ' + err.message, 'error');
    }
  }

  // ====== Auth UI ======
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const user = $('#loginUser').value.trim();
    const pass = $('#loginPass').value;
    const btn = $('#loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    const ok = await attemptLogin(user, pass);
    btn.disabled = false;
    btn.textContent = 'Sign In';
    if (ok) {
      toast('Welcome back, ' + user, 'success');
      showDashboard();
    } else {
      toast('Invalid credentials', 'error');
    }
  });

  function showDashboard() {
    $('#loginView').classList.add('hidden');
    $('#dashboardView').classList.remove('hidden');
    initDashboard();
  }
  function showLogin() {
    $('#loginView').classList.remove('hidden');
    $('#dashboardView').classList.add('hidden');
  }

  $('#logoutBtn').addEventListener('click', () => {
    clearSession();
    toast('Signed out', 'success');
    showLogin();
  });

  // ====== Views ======
  function switchView(view) {
    ['dashboard', 'apps', 'editor', 'io'].forEach(v => {
      const el = $('#view-' + v);
      if (el) el.classList.toggle('hidden', v !== view);
    });
    $$('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    if (view === 'io') refreshJsonPreview();
    if (view === 'apps') renderAppsTable();
    if (view === 'dashboard') renderDashboard();
    if (window.innerWidth <= 900) $('#sidebar').classList.remove('open');
  }
  $$('.nav-item[data-view]').forEach(n => n.addEventListener('click', () => switchView(n.dataset.view)));

  // ====== Dashboard ======
  function renderDashboard() {
    const pub = STATE.apps.filter(a => a.status === 'published');
    const stats = [
      ['Total', STATE.apps.length],
      ['Published', pub.length],
      ['Drafts', STATE.apps.length - pub.length],
      ['Featured', pub.filter(a => a.featured).length],
      ['Categories', new Set(STATE.apps.map(a => a.category).filter(Boolean)).size],
      ['Downloads', pub.reduce((s, a) => s + (a.downloadCount || 0), 0)]
    ];
    $('#adminStats').innerHTML = stats.map(([l, v]) => `
      <div class="stat-card">
        <div class="stat-value">${typeof v === 'number' && v > 999 ? (v/1000).toFixed(1) + 'k' : v}</div>
        <div class="stat-label">${l}</div>
      </div>`).join('');

    const recent = [...STATE.apps].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '')).slice(0, 5);
    $('#recentList').innerHTML = recent.length
      ? `<div class="app-table">${recent.map(appRow).join('')}</div>`
      : `<div class="empty"><p>No apps yet. Click "+ Add App" to start.</p></div>`;
    attachRowHandlers($('#recentList'));
  }

  // ====== Apps Table ======
  function appRow(app) {
    const icon = app.icon
      ? `<img src="${app.icon}" alt="" onerror="this.style.display='none'">`
      : `<div style="width:48px;height:48px;border-radius:8px;background:var(--accent-grad);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;">${(app.name || '?')[0].toUpperCase()}</div>`;
    return `
      <div class="app-row" data-id="${app.id}">
        ${icon}
        <div class="app-row-info">
          <strong>${escape(app.name)}</strong>
          <span>${escape(app.package || '—')} · v${escape(app.version || '')} · ${escape(app.status || '')}</span>
        </div>
        <span class="tag">${escape(app.category || '')}</span>
        <div class="app-row-actions">
          <button class="btn btn-sm btn-ghost" data-action="edit" title="Edit">✏️</button>
          <button class="btn btn-sm btn-ghost" data-action="duplicate" title="Duplicate">📄</button>
          <button class="btn btn-sm btn-ghost" data-action="copy-link" title="Copy link" data-url="${buildDownloadUrl(app.filePath)}">🔗</button>
          <button class="btn btn-sm btn-ghost" data-action="delete" title="Delete" style="color: var(--danger);">🗑</button>
        </div>
      </div>`;
  }

  function renderAppsTable() {
    const q = ($('#adminSearch').value || '').toLowerCase();
    const status = $('#adminFilter').value;
    let list = STATE.apps;
    if (status !== 'all') list = list.filter(a => a.status === status);
    if (q) list = list.filter(a => (a.name + ' ' + (a.package || '') + ' ' + (a.category || '')).toLowerCase().includes(q));
    list = [...list].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
    $('#appsTable').innerHTML = list.length
      ? list.map(appRow).join('')
      : `<div class="empty"><p>No apps match your filters.</p></div>`;
    attachRowHandlers($('#appsTable'));
  }

  function attachRowHandlers(container) {
    $$('[data-action]', container).forEach(btn => {
      btn.onclick = () => {
        const row = btn.closest('[data-id]');
        if (!row) return;
        const id = row.dataset.id;
        const action = btn.dataset.action;
        const app = STATE.apps.find(a => a.id === id);
        if (!app) return;

        if (action === 'edit') { loadForm(app); switchView('editor'); }
        else if (action === 'duplicate') {
          const dup = { ...app, id: genId(), slug: slugify(app.name) + '-' + Date.now().toString(36), name: app.name + ' (copy)' };
          STATE.apps.push(dup);
          saveWork();
          renderAppsTable();
          toast('Duplicated', 'success');
        }
        else if (action === 'copy-link') {
          const url = btn.dataset.url;
          navigator.clipboard.writeText(url).then(() => toast('Link copied', 'success'));
        }
        else if (action === 'delete') {
          if (confirm(`Delete "${app.name}"? This cannot be undone.`)) {
            STATE.apps = STATE.apps.filter(a => a.id !== id);
            saveWork();
            renderAppsTable();
            toast('Deleted', 'success');
          }
        }
      };
    });
  }

  $('#adminSearch').addEventListener('input', renderAppsTable);
  $('#adminFilter').addEventListener('change', renderAppsTable);

  // ====== Editor ======
  $('#newAppBtn').addEventListener('click', () => { resetForm(); switchView('editor'); });

  function resetForm() {
    STATE.editingId = null;
    $('#editorTitle').textContent = 'New Application';
    $('#editorSub').textContent = 'Fill in the details below';
    $('#appForm').reset();
    $('#f-id').value = '';
    $('#f-slug').value = '';
    $$('.form-field').forEach(f => f.classList.remove('invalid'));
    updateGeneratedUrl();
  }
  $('#resetFormBtn').addEventListener('click', () => {
    if (confirm('Reset form? Unsaved changes will be lost.')) resetForm();
  });

  function loadForm(app) {
    STATE.editingId = app.id;
    $('#editorTitle').textContent = 'Edit: ' + app.name;
    $('#editorSub').textContent = app.package || '';
    $('#f-id').value = app.id;
    $('#f-slug').value = app.slug || '';
    $('#f-name').value = app.name || '';
    $('#f-package').value = app.package || '';
    $('#f-version').value = app.version || '';
    $('#f-versionCode').value = app.versionCode || '';
    $('#f-category').value = app.category || '';
    $('#f-developer').value = app.developer || '';
    $('#f-icon').value = app.icon || '';
    $('#f-releaseDate').value = app.releaseDate || '';
    $('#f-description').value = app.description || '';
    $('#f-htmlInfo').value = app.htmlInfo || '';
    $('#f-androidVersion').value = app.androidVersion || '';
    $('#f-architecture').value = app.architecture || '';
    $('#f-requirements').value = app.requirements || '';
    $('#f-changelog').value = app.changelog || '';
    $('#f-tags').value = (app.tags || []).join(', ');
    $('#f-screenshots').value = (app.screenshots || []).join('\n');
    $('#f-fileName').value = app.fileName || '';
    $('#f-fileSize').value = app.fileSize || '';
    $('#f-fileType').value = app.fileType || 'apk';
    $('#f-filePath').value = app.filePath || '';
    $('#f-downloadCount').value = app.downloadCount || 0;
    $('#f-status').value = app.status || 'draft';
    $('#f-featured').checked = !!app.featured;
    $('#f-websiteUrl').value = app.websiteUrl || '';
    $('#f-telegramUrl').value = app.telegramUrl || '';
    updateGeneratedUrl();
  }

  $('#f-filePath').addEventListener('input', updateGeneratedUrl);
  function updateGeneratedUrl() {
    const path = $('#f-filePath').value.trim();
    const url = buildDownloadUrl(path);
    $('#generatedUrl').innerHTML = url
      ? `🔗 <code style="word-break: break-all;">${escape(url)}</code>`
      : '';
  }

  function validateForm() {
    let ok = true;
    $$('#appForm .form-field').forEach(f => f.classList.remove('invalid'));
    ['name', 'version', 'category', 'description', 'fileName', 'filePath'].forEach(field => {
      const input = $('#f-' + field);
      if (!input.value.trim()) {
        input.closest('.form-field').classList.add('invalid');
        ok = false;
      }
    });
    return ok;
  }

  function formToApp() {
    return {
      id: $('#f-id').value || genId(),
      slug: $('#f-slug').value || slugify($('#f-name').value),
      name: $('#f-name').value.trim(),
      package: $('#f-package').value.trim(),
      version: $('#f-version').value.trim(),
      versionCode: parseInt($('#f-versionCode').value) || 0,
      category: $('#f-category').value.trim(),
      developer: $('#f-developer').value.trim(),
      icon: $('#f-icon').value.trim(),
      releaseDate: $('#f-releaseDate').value,
      description: $('#f-description').value.trim(),
      htmlInfo: $('#f-htmlInfo').value.trim(),
      androidVersion: $('#f-androidVersion').value.trim(),
      architecture: $('#f-architecture').value.trim(),
      requirements: $('#f-requirements').value.trim(),
      changelog: $('#f-changelog').value.trim(),
      tags: $('#f-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      screenshots: $('#f-screenshots').value.split('\n').map(s => s.trim()).filter(Boolean),
      fileName: $('#f-fileName').value.trim(),
      fileSize: $('#f-fileSize').value.trim(),
      fileType: $('#f-fileType').value,
      filePath: $('#f-filePath').value.trim(),
      directDownloadUrl: buildDownloadUrl($('#f-filePath').value.trim()),
      downloadCount: parseInt($('#f-downloadCount').value) || 0,
      status: $('#f-status').value,
      featured: $('#f-featured').checked,
      websiteUrl: $('#f-websiteUrl').value.trim(),
      telegramUrl: $('#f-telegramUrl').value.trim()
    };
  }

  $('#saveBtn').addEventListener('click', () => {
    if (!validateForm()) {
      toast('Please fill required fields', 'error');
      return;
    }
    const app = formToApp();
    if (STATE.editingId) {
      const i = STATE.apps.findIndex(a => a.id === STATE.editingId);
      if (i >= 0) STATE.apps[i] = app;
      toast('Updated', 'success');
    } else {
      STATE.apps.push(app);
      toast('Created', 'success');
    }
    saveWork();
    switchView('apps');
  });

  $('#previewBtn').addEventListener('click', () => {
    if (!validateForm()) { toast('Fill required fields first', 'error'); return; }
    const app = formToApp();
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast('Allow popups for preview', 'warning'); return; }
    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview: ${escape(app.name)}</title>
      <style>body{font-family:system-ui;max-width:640px;margin:2rem auto;padding:1rem;background:#0A0A0F;color:#f5f5f7;}
      h1{margin:.5rem 0} .meta{color:#9A9AA8;font-family:monospace;font-size:.85rem}
      .dl{display:inline-block;padding:.75rem 1.25rem;background:linear-gradient(135deg,#00D9FF,#7C3AED);color:white;border-radius:12px;text-decoration:none;margin-top:1rem;}</style>
      </head><body>
      <h1>${escape(app.name)}</h1>
      <div class="meta">${escape(app.package)} · v${escape(app.version)} · ${escape(app.fileSize || '—')}</div>
      <p>${escape(app.description)}</p>
      ${app.htmlInfo ? `<div>${app.htmlInfo}</div>` : ''}
      <a href="${buildDownloadUrl(app.filePath)}" class="dl" download="${escape(app.fileName)}">Download ${escape(app.fileName)}</a>
      <p style="margin-top:2rem;color:#60606C;font-size:.8rem;">Preview mode — changes not yet saved.</p>
      </body></html>`);
    w.document.close();
  });

  // ====== GitHub File Browser ======
  $('#browseBtn').addEventListener('click', async () => {
    const browser = $('#fileBrowser');
    browser.style.display = 'block';
    browser.innerHTML = '<p style="color: var(--text-muted);">Loading files…</p>';
    try {
      const { githubUser, githubRepo, branch } = STATE.config;
      const url = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/uploads?ref=${branch}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' — check repo config');
      const files = await res.json();
      if (!Array.isArray(files) || files.length === 0) {
        browser.innerHTML = '<p style="color: var(--text-muted);">No files found in <code>uploads/</code>. Upload files via GitHub first.</p>';
        return;
      }
      browser.innerHTML = files.filter(f => f.type === 'file').map(f => {
        const size = f.size ? ' · ' + (f.size / 1024).toFixed(1) + ' KB' : '';
        return `<div class="file-item" data-path="uploads/${f.name}" data-name="${escape(f.name)}" data-size="${f.size || ''}">
          <span class="file-item-name">${escape(f.name)}</span>
          <span class="file-item-size">${size}</span>
        </div>`;
      }).join('');
      $$('.file-item', browser).forEach(item => {
        item.onclick = () => {
          $$('.file-item', browser).forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          $('#f-fileName').value = item.dataset.name;
          $('#f-filePath').value = item.dataset.path;
          if (item.dataset.size) {
            $('#f-fileSize').value = (item.dataset.size / (1024 * 1024)).toFixed(2) + ' MB';
          }
          updateGeneratedUrl();
          toast('File selected', 'success');
        };
      });
    } catch (err) {
      browser.innerHTML = `<p style="color: var(--danger);">Failed to load: ${escape(err.message)}</p>
        <p class="form-hint">Enter path manually: <code>uploads/yourfile.apk</code></p>`;
    }
  });

  // ====== Import / Export ======
  function refreshJsonPreview() {
    const data = { apps: STATE.apps, config: STATE.config };
    $('#jsonPreview').value = JSON.stringify(data, null, 2);
  }

  $('#copyJsonBtn').addEventListener('click', async () => {
    const json = JSON.stringify({ apps: STATE.apps, config: STATE.config }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      toast('JSON copied to clipboard', 'success');
    } catch { toast('Copy failed', 'error'); }
  });

  $('#downloadJsonBtn').addEventListener('click', () => {
    const json = JSON.stringify({ apps: STATE.apps, config: STATE.config }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'apps.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Download started', 'success');
  });

  $('#importBtn').addEventListener('click', () => {
    const text = $('#importArea').value.trim();
    if (!text) { toast('Paste JSON or upload a file', 'warning'); return; }
    tryImport(text);
  });
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => tryImport(reader.result);
    reader.readAsText(f);
  });

  function tryImport(text) {
    try {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.apps)) throw new Error('Missing "apps" array');
      if (!confirm(`Import ${data.apps.length} app(s)? This will replace your current catalog.`)) return;
      STATE.apps = data.apps;
      if (data.config) STATE.config = { ...STATE.config, ...data.config };
      saveWork();
      refreshJsonPreview();
      toast('Imported successfully', 'success');
    } catch (err) {
      toast('Invalid JSON: ' + err.message, 'error');
    }
  }

  function escape(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  // ====== Init ======
  async function initDashboard() {
    await loadCatalog();
    renderDashboard();
  }

  if (isValidSession()) {
    showDashboard();
  } else {
    showLogin();
  }

  // Security note — printed once for visibility
  console.info('%c🔒 Modda Admin', 'font-weight: bold; font-size: 14px;');
  console.info('This login is a UI gate only. For true security, deploy GitHub OAuth, GitHub Apps, or a backend with signed commits. Never commit plaintext credentials.');
})();
