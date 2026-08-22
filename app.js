/* ==========================================================================
   Modda — Public panel logic
   Reads data/apps.json and renders everything dynamically. No backend.
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- State ---------- */
  const state = {
    config: null,
    apps: [],
    filtered: [],
    query: '',
    category: 'All',
    sort: 'newest',
    loading: true,
    loadError: null,
  };

  const DATA_URL = 'data/apps.json';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Utilities ---------- */

  // Minimal, deny-list-first HTML sanitizer for the "htmlInfo" rich field.
  // Strips script/style/iframe/object/embed tags and any on*="" / javascript: attributes.
  function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return '';
    const template = document.createElement('template');
    template.innerHTML = html;
    const BLOCKED_TAGS = ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'BASE'];
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 1) {
          if (BLOCKED_TAGS.includes(child.tagName)) {
            child.remove();
            return;
          }
          Array.from(child.attributes).forEach((attr) => {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
            if (name.startsWith('on') || value.startsWith('javascript:') || value.startsWith('data:text/html')) {
              child.removeAttribute(attr.name);
            }
          });
          walk(child);
        }
      });
    };
    walk(template.content);
    return template.innerHTML;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function encodePathSegments(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  // Builds the public GitHub Pages download URL for a repo-relative file path,
  // using the site config (username / repo / branch). Falls back gracefully
  // if a fully-formed directDownloadUrl was already supplied on the entry.
  function buildDownloadUrl(app) {
    if (app.directDownloadUrl && app.directDownloadUrl.trim()) return app.directDownloadUrl.trim();
    const cfg = state.config || {};
    const user = cfg.githubUsername || 'your-username';
    const repo = cfg.githubRepo || 'modda';
    const path = app.filePath || `${cfg.uploadsPath || 'uploads'}/${app.fileName || ''}`;
    if (!path) return '#';
    return `https://${user}.github.io/${repo}/${encodePathSegments(path)}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function initials(name) {
    if (!name) return '?';
    return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  function parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    const m = String(sizeStr).match(/([\d.]+)\s*(KB|MB|GB|B)/i);
    if (!m) return 0;
    const num = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[unit] || 1;
    return num * mult;
  }

  /* ---------- Toasts ---------- */
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
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    }, 2600);
  }

  function copyToClipboard(text, successMsg = 'Link copied') {
    const done = () => toast(successMsg, 'success');
    const fail = () => toast('Could not copy — copy the link manually', 'error');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(fail);
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) { fail(); }
    }
  }

  /* ---------- Theme ---------- */
  function initTheme() {
    const saved = localStorage.getItem('modda-theme');
    const system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    setTheme(saved || system);
    $('#themeToggle')?.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }
  function setTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('modda-theme', mode);
    $('#themeToggle')?.setAttribute('aria-label', mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  /* ---------- Mobile nav ---------- */
  function initNavToggle() {
    const btn = $('#navToggle');
    const nav = $('#mainNav');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---------- Data loading ---------- */
  async function loadData() {
    state.loading = true;
    renderSkeletons();
    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || !Array.isArray(json.apps)) throw new Error('Malformed catalog: "apps" must be an array');
      state.config = json.config || {};
      state.apps = json.apps.filter((a) => a && a.id && a.status !== 'archived');
      state.loading = false;
      state.loadError = null;
    } catch (err) {
      state.loading = false;
      state.loadError = err.message || 'Unknown error';
      state.apps = [];
      console.error('[Modda] Failed to load catalog:', err);
    }
    afterDataReady();
  }

  function afterDataReady() {
    populateCategories();
    applyDeepLinkOrGrid();
    renderStats();
    renderFeatured();
  }

  /* ---------- Categories & filtering ---------- */
  function populateCategories() {
    const row = $('#filterRow');
    if (!row) return;
    const cats = ['All', ...new Set(state.apps.filter(a=>a.status==='published').map((a) => a.category).filter(Boolean))];
    row.innerHTML = cats.map((c) =>
      `<button class="chip${c === state.category ? ' active' : ''}" data-cat="${escapeHtml(c)}" type="button">${escapeHtml(c)}</button>`
    ).join('');
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.category = btn.dataset.cat;
      $$('.chip', row).forEach((c) => c.classList.toggle('active', c === btn));
      renderGrid();
    }, { once: false });
  }

  function getPublished() {
    return state.apps.filter((a) => a.status === 'published');
  }

  function computeFiltered() {
    let list = getPublished();
    if (state.category && state.category !== 'All') {
      list = list.filter((a) => a.category === state.category);
    }
    if (state.query.trim()) {
      const q = state.query.trim().toLowerCase();
      list = list.filter((a) => {
        const hay = [a.name, a.package, a.developer, a.category, ...(a.tags || [])].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    list = [...list];
    switch (state.sort) {
      case 'name-asc': list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name-desc': list.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'size': list.sort((a, b) => parseSizeToBytes(b.fileSize) - parseSizeToBytes(a.fileSize)); break;
      case 'newest':
      default: list.sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0));
    }
    state.filtered = list;
    return list;
  }

  /* ---------- Rendering: skeletons / states ---------- */
  function renderSkeletons() {
    const grid = $('#appGrid');
    if (!grid) return;
    grid.innerHTML = Array.from({ length: 6 }).map(() => `
      <div class="skeleton-card">
        <div style="display:flex;gap:12px;align-items:center;">
          <div class="skeleton" style="width:48px;height:48px;border-radius:10px;"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
            <div class="skeleton skeleton-line" style="width:70%;"></div>
            <div class="skeleton skeleton-line" style="width:40%;"></div>
          </div>
        </div>
        <div class="skeleton skeleton-line" style="width:100%;"></div>
        <div class="skeleton skeleton-line" style="width:60%;"></div>
      </div>
    `).join('');
  }

  function errorStateHtml(message) {
    return `
      <div class="state-block">
        <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
        <h3>Couldn't load the catalog</h3>
        <p>${escapeHtml(message)}</p>
        <button class="btn btn-secondary" id="retryLoad" type="button">Try again</button>
      </div>`;
  }

  function emptyStateHtml() {
    return `
      <div class="state-block">
        <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <h3>No apps match your search</h3>
        <p>Try a different keyword or clear the category filter.</p>
        <button class="btn btn-secondary" id="clearFilters" type="button">Clear filters</button>
      </div>`;
  }

  /* ---------- Rendering: grid ---------- */
  function appIconHtml(app, size = 56, cssClass = 'app-icon') {
    const src = app.icon || '';
    return `<img class="${cssClass}" width="${size}" height="${size}" src="${escapeHtml(src)}" alt=""
      loading="lazy"
      onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'${cssClass} fallback',style:'width:${size}px;height:${size}px',textContent:'${escapeHtml(initials(app.name))}'}))">`;
  }

  function cardHtml(app) {
    const dlUrl = buildDownloadUrl(app);
    return `
    <article class="app-card" data-id="${escapeHtml(app.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(app.name)} details">
      ${app.featured ? '<span class="badge-featured">Featured</span>' : ''}
      <div class="card-top">
        ${appIconHtml(app)}
        <div class="card-titles">
          <h3>${escapeHtml(app.name)}</h3>
          <div class="pkg">${escapeHtml(app.package || '')}</div>
        </div>
      </div>
      <div class="card-meta">
        <span>${escapeHtml(app.category || 'App')}</span>
        <span>${escapeHtml(app.fileSize || '—')}</span>
        <span>${escapeHtml((app.fileType || 'apk').toUpperCase())}</span>
      </div>
      <p class="card-desc">${escapeHtml(app.description || '')}</p>
      <div class="card-footer">
        <span class="version">v${escapeHtml(app.version || '1.0')}</span>
        <a class="card-dl-btn" href="${escapeHtml(dlUrl)}" data-role="dl" download>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>
          Download
        </a>
      </div>
    </article>`;
  }

  function renderGrid() {
    const grid = $('#appGrid');
    if (!grid) return;
    if (state.loadError) { grid.innerHTML = errorStateHtml(state.loadError); bindStateButtons(); return; }
    const list = computeFiltered();
    updateResultCount(list.length);
    if (!list.length) { grid.innerHTML = emptyStateHtml(); bindStateButtons(); return; }
    grid.innerHTML = list.map(cardHtml).join('');
  }

  function bindStateButtons() {
    $('#retryLoad')?.addEventListener('click', loadData);
    $('#clearFilters')?.addEventListener('click', () => {
      state.query = '';
      state.category = 'All';
      const input = $('#searchInput'); if (input) input.value = '';
      $$('.chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === 'All'));
      renderGrid();
    });
  }

  function updateResultCount(n) {
    const el = $('#resultCount');
    if (!el) return;
    el.textContent = state.loading ? 'Loading…' : `${n} application${n === 1 ? '' : 's'}`;
  }

  function renderStats() {
    const total = getPublished().length;
    const cats = new Set(getPublished().map((a) => a.category)).size;
    const totalDownloads = getPublished().reduce((s, a) => s + (a.downloadCount || 0), 0);
    const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setStat('statTotal', total);
    setStat('statCategories', cats);
    setStat('statDownloads', totalDownloads >= 1000 ? (totalDownloads / 1000).toFixed(1) + 'k' : totalDownloads);
  }

  function renderFeatured() {
    const wrap = $('#featuredGrid');
    if (!wrap) return;
    const list = getPublished().filter((a) => a.featured).slice(0, 3);
    if (!list.length) { wrap.closest('.featured-section')?.classList.add('visually-hidden'); return; }
    wrap.innerHTML = list.map(cardHtml).join('');
  }

  /* ---------- Detail view ---------- */
  function findApp(idOrSlug) {
    return state.apps.find((a) => a.id === idOrSlug || a.slug === idOrSlug);
  }

  function renderDetail(app) {
    const view = $('#detailView');
    const home = $('#homeView');
    if (!view || !home) return;
    home.hidden = true;
    view.hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

    if (!app) {
      view.innerHTML = `
        <div class="container detail-wrap">
          <a class="back-link" href="index.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>Back to catalog</a>
          <div class="state-block">
            <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
            <h3>Application not found</h3>
            <p>This app may have been removed, renamed, or the link is incorrect.</p>
            <a class="btn btn-primary" href="index.html">Browse all apps</a>
          </div>
        </div>`;
      $('.back-link', view)?.addEventListener('click', (e) => { e.preventDefault(); goHome(); });
      return;
    }

    const dlUrl = buildDownloadUrl(app);
    const shots = (app.screenshots || []).map((s) => `<img src="${escapeHtml(s)}" alt="${escapeHtml(app.name)} screenshot" loading="lazy" onerror="this.style.display='none'">`).join('');
    const changelog = (app.changelog || []).map((c) => `
      <div class="changelog-item">
        <span class="cl-ver">v${escapeHtml(c.version)}</span><span class="cl-date">${formatDate(c.date)}</span>
        <p>${escapeHtml(c.notes)}</p>
      </div>`).join('') || '<p class="prose">No changelog yet.</p>';
    const tags = (app.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');

    view.innerHTML = `
      <div class="container detail-wrap">
        <a class="back-link" href="index.html" id="detailBack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>Back to catalog</a>
        <div class="detail-header">
          ${appIconHtml(app, 96, 'detail-icon')}
          <div class="detail-titles">
            <h1>${escapeHtml(app.name)}</h1>
            <div class="pkg">${escapeHtml(app.package || '')}</div>
            <div class="detail-tags">
              <span class="tag">${escapeHtml(app.category || 'App')}</span>
              ${tags}
            </div>
          </div>
          <div class="detail-actions">
            <a class="btn btn-primary btn-block" href="${escapeHtml(dlUrl)}" download>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>
              Download ${escapeHtml(app.fileSize || '')}
            </a>
            <button class="btn btn-secondary btn-block" id="copyLinkBtn" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy direct link
            </button>
            <button class="btn btn-ghost btn-block" id="shareLinkBtn" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-3.9M8.6 13.5l6.8 3.9"/></svg>
              Copy page link
            </button>
            <div class="file-meta">${escapeHtml(app.fileName || '')}</div>
          </div>
        </div>

        <div class="detail-grid">
          <div>
            <div class="detail-card">
              <h2>About this app</h2>
              <div class="prose">${sanitizeHtml(app.htmlInfo) || `<p>${escapeHtml(app.description || '')}</p>`}</div>
            </div>
            ${shots ? `<div class="detail-card"><h2>Screenshots</h2><div class="shot-strip">${shots}</div></div>` : ''}
            <div class="detail-card">
              <h2>Changelog</h2>
              ${changelog}
            </div>
          </div>
          <div>
            <div class="detail-card">
              <h2>Details</h2>
              <div class="kv-list">
                <div class="kv-row"><span class="k">Version</span><span class="v">${escapeHtml(app.version || '—')}</span></div>
                <div class="kv-row"><span class="k">Version code</span><span class="v">${escapeHtml(app.versionCode ?? '—')}</span></div>
                <div class="kv-row"><span class="k">Developer</span><span class="v">${escapeHtml(app.developer || '—')}</span></div>
                <div class="kv-row"><span class="k">Requires</span><span class="v">${escapeHtml(app.androidVersion || '—')}</span></div>
                <div class="kv-row"><span class="k">Architecture</span><span class="v">${escapeHtml(app.architecture || 'universal')}</span></div>
                <div class="kv-row"><span class="k">File size</span><span class="v">${escapeHtml(app.fileSize || '—')}</span></div>
                <div class="kv-row"><span class="k">Released</span><span class="v">${formatDate(app.releaseDate)}</span></div>
                <div class="kv-row"><span class="k">Downloads</span><span class="v">${escapeHtml(app.downloadCount ?? 0)}</span></div>
              </div>
            </div>
            ${app.requirements ? `<div class="detail-card"><h2>Requirements</h2><div class="prose">${escapeHtml(app.requirements)}</div></div>` : ''}
          </div>
        </div>
      </div>`;

    $('#detailBack')?.addEventListener('click', (e) => { e.preventDefault(); goHome(); });
    $('#copyLinkBtn')?.addEventListener('click', () => copyToClipboard(dlUrl, 'Direct download link copied'));
    $('#shareLinkBtn')?.addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?app=${encodeURIComponent(app.slug || app.id)}`;
      copyToClipboard(url, 'Page link copied');
    });
  }

  function goHome() {
    history.pushState({}, '', location.pathname);
    $('#detailView').hidden = true;
    $('#homeView').hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function openApp(app, pushState = true) {
    if (pushState) history.pushState({}, '', `${location.pathname}?app=${encodeURIComponent(app.slug || app.id)}`);
    renderDetail(app);
  }

  function applyDeepLinkOrGrid() {
    const params = new URLSearchParams(location.search);
    const appParam = params.get('app');
    if (appParam) {
      const app = findApp(appParam);
      renderDetail(app || null);
    } else {
      renderGrid();
    }
  }

  /* ---------- Event wiring ---------- */
  function initGridEvents() {
    document.addEventListener('click', (e) => {
      const dlBtn = e.target.closest('[data-role="dl"]');
      if (dlBtn) { e.stopPropagation(); return; } // allow native download, don't open detail
      const card = e.target.closest('.app-card');
      if (card) {
        const app = findApp(card.dataset.id);
        if (app) openApp(app);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.app-card');
      if (!card) return;
      e.preventDefault();
      const app = findApp(card.dataset.id);
      if (app) openApp(app);
    });
    window.addEventListener('popstate', applyDeepLinkOrGrid);
  }

  function initSearch() {
    const input = $('#searchInput');
    if (!input) return;
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { state.query = input.value; renderGrid(); }, 140);
    });
    const sort = $('#sortSelect');
    sort?.addEventListener('change', () => { state.sort = sort.value; renderGrid(); });

    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.target.matches('input, textarea, select')) return;
      e.preventDefault();
      input.focus();
    });
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavToggle();
    initGridEvents();
    initSearch();
    loadData();
    const year = $('#year'); if (year) year.textContent = new Date().getFullYear();
  });

  // Expose a couple of helpers for admin preview iframe / debugging.
  window.Modda = { buildDownloadUrl, sanitizeHtml, escapeHtml };
})();
