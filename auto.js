/* ==========================================================================
   Modda — Admin panel logic
   Frontend-only UI gate + local catalog editor. See the login-note in
   admin.html for the honest security disclosure: this does not provide
   server-side protection on GitHub Pages.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (window.Modda && window.Modda.escapeHtml) || ((s) => String(s ?? ''));
  const sanitize = (window.Modda && window.Modda.sanitizeHtml) || ((s) => s || '');

  const CREDS_KEY = 'modda-admin-creds';
  const SESSION_KEY = 'modda-session';
  const CATALOG_KEY = 'modda-catalog';
  const SESSION_MINUTES = 120;
  const DATA_URL = 'data/apps.json';

  let catalog = { config: {}, apps: [] };
  let editingId = null; // null = creating a new entry
  let pendingDeleteId = null;
  let uploadsCache = [];

  /* ---------- Crypto helpers ---------- */
  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function ensureDefaultCreds() {
    if (!localStorage.getItem(CREDS_KEY)) {
      const hash = await sha256('modda-admin');
      localStorage.setItem(CREDS_KEY, JSON.stringify({ username: 'admin', hash }));
    }
  }

  /* ---------- Toasts (self-contained, mirrors app.js) ---------- */
  function toast(message, type = 'success') {
    const stack = $('#toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'status');
    const icon = type === 'success'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg>';
    el.innerHTML = `${icon}<span></span>`;
    el.querySelector('span').textContent = message;
    stack.appendChild(el);
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 200); }, 2600);
  }

  function copyText(text, msg = 'Copied to clipboard') {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast(msg)).catch(() => toast('Could not copy', 'error'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(msg); } catch { toast('Could not copy', 'error'); }
      document.body.removeChild(ta);
    }
  }

  /* ---------- Session ---------- */
  function isSessionValid() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const { expires } = JSON.parse(raw);
      return Date.now() < expires;
    } catch { return false; }
  }
  function startSession() {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ expires: Date.now() + SESSION_MINUTES * 60 * 1000 }));
  }
  function endSession() { sessionStorage.removeItem(SESSION_KEY); }

  function showAdmin() {
    $('#loginView').hidden = true;
    $('#adminShell').hidden = false;
    renderAll();
  }
  function showLogin(message) {
    $('#adminShell').hidden = true;
    $('#loginView').hidden = false;
    if (message) {
      $('#loginAlert').innerHTML = `<div class="alert-banner error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><span>${esc(message)}</span></div>`;
    } else {
      $('#loginAlert').innerHTML = '';
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    await ensureDefaultCreds();
    const user = $('#loginUser').value.trim();
    const pass = $('#loginPass').value;
    const stored = JSON.parse(localStorage.getItem(CREDS_KEY));
    const hash = await sha256(pass);
    if (user === stored.username && hash === stored.hash) {
      startSession();
      loadCatalog();
      showAdmin();
      toast(`Welcome back, ${user}`);
    } else {
      showLogin('Incorrect username or password.');
    }
  }

  function checkSessionLoop() {
    setInterval(() => {
      if (!$('#adminShell').hidden && !isSessionValid()) {
        showLogin('Your session expired. Please sign in again.');
      }
    }, 15000);
  }

  /* ---------- Catalog storage ---------- */
  async function loadCatalog() {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (raw) {
      try { catalog = JSON.parse(raw); return; } catch { /* fall through to reseed */ }
    }
    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      const json = await res.json();
      catalog = { config: json.config || {}, apps: Array.isArray(json.apps) ? json.apps : [] };
    } catch {
      catalog = { config: {}, apps: [] };
    }
    saveCatalog();
  }
  function saveCatalog() { localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog)); }

  /* ---------- Download URL builder (mirrors public app.js logic) ---------- */
  function buildDownloadUrl(app) {
    if (app.directDownloadUrl && app.directDownloadUrl.trim()) return app.directDownloadUrl.trim();
    const cfg = catalog.config || {};
    const user = cfg.githubUsername || 'your-username';
    const repo = cfg.githubRepo || 'modda';
    const path = app.filePath || `${cfg.uploadsPath || 'uploads'}/${app.fileName || ''}`;
    if (!path) return '#';
    return `https://${user}.github.io/${repo}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  /* ---------- View switching ---------- */
  function switchView(name) {
    $$('.admin-view').forEach((v) => { v.hidden = v.dataset.view !== name; });
    $$('.admin-nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
    $('#adminSidebar')?.classList.remove('open');
    if (name === 'importexport') refreshExportPreview();
    if (name === 'settings') fillSettingsForm();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function initNav() {
    $$('.admin-nav a').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.id === 'navAddApp') startCreate();
      switchView(a.dataset.view);
    }));
    $$('[data-goto]').forEach((btn) => btn.addEventListener('click', () => {
      if (btn.dataset.goto === 'editor') startCreate();
      switchView(btn.dataset.goto);
    }));
    $('#adminNavToggle')?.addEventListener('click', () => $('#adminSidebar').classList.toggle('open'));
    $('#logoutBtn')?.addEventListener('click', () => { endSession(); showLogin(); });
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    const apps = catalog.apps || [];
    $('#dashTotal').textContent = apps.length;
    $('#dashFeatured').textContent = apps.filter((a) => a.featured).length;
    $('#dashTypes').textContent = new Set(apps.map((a) => a.fileType).filter(Boolean)).size;
    $('#dashDrafts').textContent = apps.filter((a) => a.status === 'draft').length;

    const recent = [...apps].sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0)).slice(0, 5);
    const tbody = $('#recentTable tbody');
    if (!recent.length) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-tertiary);padding:24px;">No applications yet. <a href="#" data-goto="editor" style="color:var(--accent-1);">Add your first one</a>.</td></tr>`;
      $('[data-goto="editor"]', tbody)?.addEventListener('click', (e) => { e.preventDefault(); startCreate(); switchView('editor'); });
      return;
    }
    tbody.innerHTML = recent.map((a) => `
      <tr>
        <td><div class="row-app">${iconImg(a, 32)}<div><div class="name">${esc(a.name)}</div><div class="pkg">${esc(a.package || '')}</div></div></div></td>
        <td>${esc(a.category || '—')}</td>
        <td><span class="status-pill ${esc(a.status || 'draft')}">${esc(a.status || 'draft')}</span></td>
      </tr>`).join('');
  }

  function iconImg(app, size) {
    const src = app.icon || '';
    return `<img src="${esc(src)}" width="${size}" height="${size}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  }

  /* ---------- Applications table ---------- */
  let tableQuery = '';
  function renderTable() {
    const tbody = $('#appsTable tbody');
    let list = catalog.apps || [];
    if (tableQuery.trim()) {
      const q = tableQuery.toLowerCase();
      list = list.filter((a) => [a.name, a.package, a.category, a.developer].join(' ').toLowerCase().includes(q));
    }
    $('#tableCount').textContent = `${list.length} entr${list.length === 1 ? 'y' : 'ies'}`;
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary);padding:32px;">No matching applications.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map((a) => `
      <tr data-id="${esc(a.id)}">
        <td><div class="row-app">${iconImg(a, 32)}<div><div class="name">${esc(a.name)}</div><div class="pkg">${esc(a.package || '')}</div></div></div></td>
        <td>${esc(a.category || '—')}</td>
        <td style="font-family:var(--font-mono);font-size:12px;">${esc(a.version || '—')}</td>
        <td style="font-family:var(--font-mono);font-size:12px;">${esc(a.fileSize || '—')}</td>
        <td><span class="status-pill ${esc(a.status || 'draft')}">${esc(a.status || 'draft')}</span></td>
        <td>${a.featured ? '<svg class="icon-star" viewBox="0 0 24 24" fill="currentColor"><path d="m12 17.27 5.7 3.46-1.5-6.5 5-4.33-6.61-.57L12 3l-2.6 6.33-6.6.57 5 4.33-1.5 6.5z"/></svg>' : '<span style="color:var(--text-tertiary);">—</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-act="edit" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button class="btn btn-ghost btn-sm" data-act="duplicate" title="Duplicate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
            <button class="btn btn-ghost btn-sm" data-act="copy" title="Copy direct link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg></button>
            <button class="btn btn-ghost btn-sm" data-act="delete" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" style="color:var(--danger);"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></button>
          </div>
        </td>
      </tr>`).join('');
  }

  function initTable() {
    $('#tableSearch')?.addEventListener('input', (e) => { tableQuery = e.target.value; renderTable(); });
    $('#appsTable')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.closest('tr').dataset.id;
      const app = catalog.apps.find((a) => a.id === id);
      if (!app) return;
      const act = btn.dataset.act;
      if (act === 'edit') { startEdit(app); switchView('editor'); }
      if (act === 'duplicate') { startDuplicate(app); switchView('editor'); }
      if (act === 'copy') copyText(buildDownloadUrl(app), 'Direct link copied');
      if (act === 'delete') { pendingDeleteId = id; $('#deleteModal').hidden = false; }
    });
    $('#cancelDeleteBtn')?.addEventListener('click', () => { $('#deleteModal').hidden = true; pendingDeleteId = null; });
    $('#confirmDeleteBtn')?.addEventListener('click', () => {
      catalog.apps = catalog.apps.filter((a) => a.id !== pendingDeleteId);
      saveCatalog();
      $('#deleteModal').hidden = true;
      pendingDeleteId = null;
      renderAll();
      toast('Application deleted');
    });
  }

  /* ---------- Editor form ---------- */
  const FIELD_MAP = {
    f_name: 'name', f_slug: 'slug', f_package: 'package', f_developer: 'developer', f_icon: 'icon',
    f_category: 'category', f_version: 'version', f_versionCode: 'versionCode', f_fileName: 'fileName',
    f_filePath: 'filePath', f_fileSize: 'fileSize', f_fileType: 'fileType', f_directUrl: 'directDownloadUrl',
    f_description: 'description', f_htmlInfo: 'htmlInfo', f_requirements: 'requirements',
    f_androidVersion: 'androidVersion', f_architecture: 'architecture', f_releaseDate: 'releaseDate',
    f_websiteUrl: 'websiteUrl', f_telegramUrl: 'telegramUrl', f_status: 'status', f_downloadCount: 'downloadCount',
  };

  function slugify(str) {
    return String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function clearForm() {
    $('#appForm').reset();
    $('#f_id').value = '';
    $('#f_status').value = 'published';
    $('#f_downloadCount').value = 0;
    $$('.field.has-error', $('#appForm')).forEach((f) => f.classList.remove('has-error'));
    $$('.invalid', $('#appForm')).forEach((f) => f.classList.remove('invalid'));
    $('#f_directUrl').value = '';
    $('#duplicateBtn').hidden = true;
    updateDirectUrlPreview();
  }

  function startCreate() {
    editingId = null;
    clearForm();
    $('#editorTitle').textContent = 'Add application';
    $('#editorAlert').innerHTML = '';
  }

  function startEdit(app) {
    editingId = app.id;
    clearForm();
    $('#editorTitle').textContent = `Edit — ${app.name}`;
    $('#f_id').value = app.id;
    Object.entries(FIELD_MAP).forEach(([fid, key]) => { const el = $('#' + fid); if (el) el.value = app[key] ?? ''; });
    $('#f_featured').checked = !!app.featured;
    $('#f_tags').value = (app.tags || []).join(', ');
    $('#f_screenshots').value = (app.screenshots || []).join('\n');
    $('#duplicateBtn').hidden = false;
    updateDirectUrlPreview();
  }

  function startDuplicate(app) {
    const copy = JSON.parse(JSON.stringify(app));
    copy.id = null;
    copy.name = copy.name + ' (copy)';
    copy.slug = '';
    copy.featured = false;
    copy.status = 'draft';
    copy.downloadCount = 0;
    editingId = null;
    clearForm();
    $('#editorTitle').textContent = 'Add application';
    Object.entries(FIELD_MAP).forEach(([fid, key]) => { const el = $('#' + fid); if (el) el.value = copy[key] ?? ''; });
    $('#f_featured').checked = false;
    $('#f_tags').value = (copy.tags || []).join(', ');
    $('#f_screenshots').value = (copy.screenshots || []).join('\n');
    updateDirectUrlPreview();
    toast('Duplicated — review and save as a new entry');
  }

  function updateDirectUrlPreview() {
    const draft = {
      directDownloadUrl: '',
      filePath: $('#f_filePath').value.trim() || (($('#f_fileName').value.trim()) ? `${catalog.config.uploadsPath || 'uploads'}/${$('#f_fileName').value.trim()}` : ''),
    };
    $('#f_directUrl').value = draft.filePath ? buildDownloadUrl(draft) : '';
  }

  function validateForm() {
    const required = ['f_name', 'f_package', 'f_category', 'f_version', 'f_fileName', 'f_description'];
    let ok = true;
    required.forEach((fid) => {
      const el = $('#' + fid);
      const field = el.closest('.field');
      const empty = !el.value.trim();
      field.classList.toggle('has-error', empty);
      el.classList.toggle('invalid', empty);
      if (empty) ok = false;
    });
    return ok;
  }

  function collectForm() {
    const name = $('#f_name').value.trim();
    const slug = slugify($('#f_slug').value.trim() || name);
    const tags = $('#f_tags').value.split(',').map((t) => t.trim()).filter(Boolean);
    const screenshots = $('#f_screenshots').value.split('\n').map((s) => s.trim()).filter(Boolean);
    const app = {
      id: editingId || `app_${Date.now().toString(36)}`,
      name, slug,
      package: $('#f_package').value.trim(),
      developer: $('#f_developer').value.trim(),
      icon: $('#f_icon').value.trim(),
      category: $('#f_category').value.trim(),
      version: $('#f_version').value.trim(),
      versionCode: Number($('#f_versionCode').value) || 0,
      fileName: $('#f_fileName').value.trim(),
      filePath: $('#f_filePath').value.trim() || `${catalog.config.uploadsPath || 'uploads'}/${$('#f_fileName').value.trim()}`,
      fileSize: $('#f_fileSize').value.trim(),
      fileType: ($('#f_fileType').value.trim() || ($('#f_fileName').value.split('.').pop() || 'apk')).toLowerCase(),
      directDownloadUrl: '',
      description: $('#f_description').value.trim(),
      htmlInfo: $('#f_htmlInfo').value.trim(),
      requirements: $('#f_requirements').value.trim(),
      androidVersion: $('#f_androidVersion').value.trim(),
      architecture: $('#f_architecture').value.trim() || 'universal',
      screenshots,
      releaseDate: $('#f_releaseDate').value || new Date().toISOString().slice(0, 10),
      tags,
      featured: $('#f_featured').checked,
      status: $('#f_status').value,
      downloadCount: Number($('#f_downloadCount').value) || 0,
      websiteUrl: $('#f_websiteUrl').value.trim(),
      telegramUrl: $('#f_telegramUrl').value.trim(),
      changelog: [],
    };
    const existing = catalog.apps.find((a) => a.id === app.id);
    app.changelog = existing ? (existing.changelog || []) : [];
    if (existing && existing.version !== app.version) {
      app.changelog = [{ version: app.version, date: app.releaseDate, notes: `Updated to version ${app.version}.` }, ...app.changelog];
    } else if (!existing) {
      app.changelog = [{ version: app.version, date: app.releaseDate, notes: 'Initial release.' }];
    }
    return app;
  }

  function handleSave(e) {
    e.preventDefault();
    if (!validateForm()) {
      $('#editorAlert').innerHTML = `<div class="alert-banner error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><span>Fix the highlighted fields before saving.</span></div>`;
      return;
    }
    const app = collectForm();
    // Duplicate ID guard (shouldn't happen given generation, but validate slug uniqueness)
    const slugClash = catalog.apps.find((a) => a.slug === app.slug && a.id !== app.id);
    if (slugClash) app.slug = `${app.slug}-${Math.random().toString(36).slice(2, 6)}`;

    const idx = catalog.apps.findIndex((a) => a.id === app.id);
    if (idx >= 0) catalog.apps[idx] = app; else catalog.apps.push(app);
    saveCatalog();
    editingId = app.id;
    $('#editorAlert').innerHTML = `<div class="alert-banner info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><span>Saved. Export the JSON and commit it to publish this change.</span></div>`;
    toast('Application saved');
    renderAll();
  }

  function initEditor() {
    $('#appForm').addEventListener('submit', handleSave);
    $('#resetFormBtn').addEventListener('click', () => { startCreate(); });
    $('#duplicateBtn').addEventListener('click', () => {
      const app = catalog.apps.find((a) => a.id === editingId);
      if (app) startDuplicate(app);
    });
    ['f_fileName', 'f_filePath'].forEach((id) => $('#' + id).addEventListener('input', updateDirectUrlPreview));
    $('#copyDirectUrl').addEventListener('click', () => {
      const url = $('#f_directUrl').value;
      if (url) copyText(url, 'Direct URL copied');
    });
    $('#previewBtn').addEventListener('click', showPreview);
    $('#closePreviewBtn').addEventListener('click', () => { $('#previewModal').hidden = true; });
  }

  function showPreview() {
    const draft = collectForm();
    const dlUrl = buildDownloadUrl(draft);
    const iconSrc = draft.icon || '';
    $('#previewCardWrap').innerHTML = `
      <article class="app-card" style="cursor:default;">
        <div class="card-top">
          <img class="app-icon" width="56" height="56" src="${esc(iconSrc)}" alt="" onerror="this.style.visibility='hidden'">
          <div class="card-titles"><h3>${esc(draft.name || 'Untitled app')}</h3><div class="pkg">${esc(draft.package || '')}</div></div>
        </div>
        <div class="card-meta"><span>${esc(draft.category || 'App')}</span><span>${esc(draft.fileSize || '—')}</span><span>${esc((draft.fileType || 'apk').toUpperCase())}</span></div>
        <p class="card-desc">${esc(draft.description || '')}</p>
        <div class="card-footer"><span class="version">v${esc(draft.version || '1.0')}</span>
          <a class="card-dl-btn" href="${esc(dlUrl)}" onclick="return false;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>Download</a>
        </div>
      </article>`;
    $('#previewModal').hidden = false;
  }

  /* ---------- GitHub uploads browser ---------- */
  function fmtBytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 ** 2) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 ** 2).toFixed(1) + ' MB';
  }

  async function refreshUploads() {
    const list = $('#fileBrowserList');
    list.innerHTML = `<p class="muted" style="padding:12px;">Loading files from GitHub…</p>`;
    const cfg = catalog.config || {};
    const user = cfg.githubUsername, repo = cfg.githubRepo, branch = cfg.githubBranch || 'main', path = cfg.uploadsPath || 'uploads';
    if (!user || !repo || user === 'your-username') {
      list.innerHTML = `<p class="muted" style="padding:12px;">Set your GitHub username and repository in <strong>Site settings</strong> first.</p>`;
      return;
    }
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });

      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch { /* ignore non-JSON error bodies */ }
        const remaining = res.headers.get('x-ratelimit-remaining');
        const resetHeader = res.headers.get('x-ratelimit-reset');

        if (res.status === 403 && remaining === '0') {
          const resetTime = resetHeader ? new Date(Number(resetHeader) * 1000) : null;
          const waitMsg = resetTime
            ? `Resets around ${resetTime.toLocaleTimeString()} (in ${Math.max(1, Math.round((resetTime - Date.now()) / 60000))} min).`
            : 'It resets on a rolling basis, usually within the hour.';
          throw new Error(`GitHub's unauthenticated API limit (60 requests/hour, shared by everyone on your network) is used up. ${waitMsg} Use "manual path entry" below in the meantime.`);
        }
        if (res.status === 403) {
          throw new Error(body.message ? `GitHub blocked this request: ${body.message}` : 'GitHub blocked this request (403) — the repository may be private, or access was denied. This browser call only works for public repositories.');
        }
        if (res.status === 404) {
          throw new Error(`No "${path}/" folder found in ${user}/${repo} on branch "${branch}" — check Site settings, or create the folder and push a file to it first.`);
        }
        throw new Error(body.message ? `GitHub API error (${res.status}): ${body.message}` : `GitHub API error (${res.status})`);
      }

      const items = await res.json();
      uploadsCache = Array.isArray(items) ? items.filter((i) => i.type === 'file') : [];
      if (!uploadsCache.length) {
        list.innerHTML = `<p class="muted" style="padding:12px;">No files found in <code>${esc(path)}/</code> yet. Push files there via GitHub first.</p>`;
        return;
      }
      list.innerHTML = uploadsCache.map((f) => `
        <div class="file-row" data-name="${esc(f.name)}" data-path="${esc(f.path)}" tabindex="0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
          <span class="fname">${esc(f.name)}</span>
          <span class="fsize">${fmtBytes(f.size)}</span>
        </div>`).join('');
    } catch (err) {
      list.innerHTML = `<p class="muted" style="padding:12px;color:var(--danger);">${esc(err.message)}</p>`;
    }
  }

  function initUploadsBrowser() {
    $('#refreshUploadsBtn').addEventListener('click', refreshUploads);
    $('#fileBrowserList').addEventListener('click', (e) => {
      const row = e.target.closest('.file-row');
      if (!row) return;
      $$('.file-row').forEach((r) => r.classList.toggle('selected', r === row));
      selectUploadFile(row.dataset.name, row.dataset.path);
    });
    $('#useManualPathBtn').addEventListener('click', () => {
      const p = $('#manualPath').value.trim();
      if (!p) return;
      selectUploadFile(p.split('/').pop(), p);
    });
  }

  function selectUploadFile(name, path) {
    startCreate();
    switchView('editor');
    $('#f_fileName').value = name;
    $('#f_filePath').value = path;
    const item = uploadsCache.find((f) => f.path === path);
    if (item && item.size) $('#f_fileSize').value = fmtBytes(item.size);
    const ext = name.split('.').pop();
    if (ext) $('#f_fileType').value = ext.toLowerCase();
    updateDirectUrlPreview();
    toast(`Selected ${name} — fill in the remaining details`);
  }

  /* ---------- Import / Export ---------- */
  function refreshExportPreview() {
    $('#exportPreview').value = JSON.stringify(catalog, null, 2);
  }

  function initImportExport() {
    $('#downloadJsonBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'apps.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('apps.json downloaded');
    });
    $('#copyJsonBtn').addEventListener('click', () => copyText(JSON.stringify(catalog, null, 2), 'JSON copied to clipboard'));

    $('#importFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      $('#importTextarea').value = await file.text();
    });

    $('#importBtn').addEventListener('click', () => {
      const alertBox = $('#importAlert');
      let parsed;
      try {
        parsed = JSON.parse($('#importTextarea').value);
      } catch (err) {
        alertBox.innerHTML = `<div class="alert-banner error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><span>Invalid JSON: ${esc(err.message)}</span></div>`;
        return;
      }
      if (!parsed || !Array.isArray(parsed.apps)) {
        alertBox.innerHTML = `<div class="alert-banner error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><span>Missing or invalid "apps" array — check the file structure.</span></div>`;
        return;
      }
      const invalid = parsed.apps.find((a) => !a.id || !a.name);
      if (invalid) {
        alertBox.innerHTML = `<div class="alert-banner error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><span>Every entry needs at least an "id" and "name" field.</span></div>`;
        return;
      }
      catalog = { config: parsed.config || catalog.config || {}, apps: parsed.apps };
      saveCatalog();
      alertBox.innerHTML = `<div class="alert-banner info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><span>Imported ${parsed.apps.length} application${parsed.apps.length === 1 ? '' : 's'}.</span></div>`;
      toast('Catalog imported');
      renderAll();
    });
  }

  /* ---------- Settings ---------- */
  function fillSettingsForm() {
    const cfg = catalog.config || {};
    $('#s_user').value = cfg.githubUsername || '';
    $('#s_repo').value = cfg.githubRepo || '';
    $('#s_branch').value = cfg.githubBranch || 'main';
    $('#s_uploadsPath').value = cfg.uploadsPath || 'uploads';
    $('#s_siteTitle').value = cfg.siteTitle || 'Modda';
  }

  function initSettings() {
    $('#saveSettingsBtn').addEventListener('click', () => {
      catalog.config = {
        ...catalog.config,
        githubUsername: $('#s_user').value.trim(),
        githubRepo: $('#s_repo').value.trim(),
        githubBranch: $('#s_branch').value.trim() || 'main',
        uploadsPath: $('#s_uploadsPath').value.trim() || 'uploads',
        siteTitle: $('#s_siteTitle').value.trim() || 'Modda',
      };
      saveCatalog();
      toast('Settings saved');
    });
    $('#saveCredsBtn').addEventListener('click', async () => {
      const user = $('#s_newUser').value.trim();
      const pass = $('#s_newPass').value;
      if (!user || !pass) { toast('Enter both a username and password', 'error'); return; }
      const hash = await sha256(pass);
      localStorage.setItem(CREDS_KEY, JSON.stringify({ username: user, hash }));
      $('#s_newPass').value = '';
      toast('Credentials updated');
    });
  }

  /* ---------- Render orchestration ---------- */
  function renderAll() {
    renderDashboard();
    renderTable();
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    await ensureDefaultCreds();
    $('#loginForm').addEventListener('submit', handleLogin);
    initNav();
    initTable();
    initEditor();
    initUploadsBrowser();
    initImportExport();
    initSettings();

    // Theme: reuse the same variable app.js sets, default dark.
    const savedTheme = localStorage.getItem('modda-theme');
    document.documentElement.setAttribute('data-theme', savedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

    if (isSessionValid()) {
      await loadCatalog();
      showAdmin();
    } else {
      showLogin();
    }
    checkSessionLoop();
  });
})();
