/* Modda Public Logic */
(() => {
  'use strict';

  // ====== Config ======
  const STATE = {
    apps: [],
    filtered: [],
    currentCategory: 'all',
    currentSort: 'newest',
    currentSearch: '',
    config: {
      githubUser: 'modda',
      githubRepo: 'modda',
      branch: 'main'
    }
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ====== Theme ======
  const themeToggle = $('#themeToggle');
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('modda-theme', theme);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#0A0A0F' : '#FAFAFB');
  };
  const savedTheme = localStorage.getItem('modda-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(savedTheme);
  themeToggle?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ====== Toast ======
  function toast(message, type = 'success') {
    const container = $('#toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ====== Sanitizer ======
  function sanitizeHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Strip dangerous tags
    const dangerous = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'style'];
    dangerous.forEach(tag => {
      tmp.querySelectorAll(tag).forEach(n => n.remove());
    });
    // Strip event handlers
    tmp.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        if (attr.name.startsWith('on') || /^javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      });
      // Sanitize hrefs
      if (el.hasAttribute('href')) {
        const href = el.getAttribute('href');
        if (/^javascript:/i.test(href)) el.removeAttribute('href');
      }
    });
    return tmp.innerHTML;
  }

  // ====== URL helpers ======
  function buildDownloadUrl(filePath) {
    if (!filePath) return '';
    if (/^https?:\/\//.test(filePath)) return filePath;
    const { githubUser, githubRepo, branch } = STATE.config;
    const encoded = filePath.split('/').map(encodeURIComponent).join('/');
    return `https://${githubUser}.github.io/${githubRepo}/${encoded}`;
  }

  // ====== Skeleton ======
  function showSkeletons(container, count = 6) {
    container.innerHTML = Array.from({ length: count },
      () => `<div class="skel-card skeleton"></div>`).join('');
  }

  // ====== App Card ======
  function appCard(app) {
    const iconHtml = app.icon
      ? `<img src="${app.icon}" alt="${app.name}" class="card-icon" loading="lazy" onerror="this.outerHTML='<div class=\\'card-icon fallback\\'>${(app.name || '?')[0].toUpperCase()}</div>'">`
      : `<div class="card-icon fallback">${(app.name || '?')[0].toUpperCase()}</div>`;
    const featured = app.featured ? `<div class="badge-featured">★ Featured</div>` : '';
    return `
      <article class="card" data-id="${app.id}" data-slug="${app.slug}" tabindex="0" role="button" aria-label="View ${app.name}">
        ${featured}
        <div class="card-top">
          ${iconHtml}
          <div class="card-meta">
            <h3 class="card-title">${escape(app.name)}</h3>
            <div class="card-pkg">${escape(app.package || '')}</div>
          </div>
        </div>
        <p class="card-desc">${escape(app.description || '')}</p>
        <div class="card-stats">
          <span class="card-stat"><strong>${escape(app.fileSize || '—')}</strong> · ${escape(app.category || 'Other')}</span>
          <span class="btn btn-sm btn-primary">Download</span>
        </div>
      </article>`;
  }

  function escape(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  // ====== App Detail Modal ======
  function openAppModal(app) {
    if (!app) { toast('Application not found', 'error'); return; }
    const modal = $('#modal');
    const iconHtml = app.icon
      ? `<img src="${app.icon}" alt="${app.name}" class="modal-icon" onerror="this.outerHTML='<div class=\\'modal-icon fallback\\'>${(app.name || '?')[0].toUpperCase()}</div>'">`
      : `<div class="modal-icon fallback">${(app.name || '?')[0].toUpperCase()}</div>`;

    const tags = (app.tags || []).map(t => `<span class="tag">#${escape(t)}</span>`).join('');
    const screenshots = (app.screenshots || []).map(s =>
      `<img src="${s}" alt="Screenshot" class="screenshot" loading="lazy" onerror="this.style.display='none'">`
    ).join('');

    const downloadUrl = buildDownloadUrl(app.filePath);
    const htmlInfo = app.htmlInfo ? sanitizeHtml(app.htmlInfo) : `<p>${escape(app.description || '')}</p>`;

    modal.innerHTML = `
      <div class="modal-head">
        ${iconHtml}
        <div class="modal-meta">
          <h2 class="modal-title" id="modalTitle">${escape(app.name)}</h2>
          <div class="modal-pkg">${escape(app.package || '')} · v${escape(app.version || '')}</div>
          <div class="modal-tags">${tags}</div>
        </div>
        <button class="modal-close" id="modalClose" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item"><label>Category</label><div>${escape(app.category || '—')}</div></div>
          <div class="detail-item"><label>Version</label><div>${escape(app.version || '—')}</div></div>
          <div class="detail-item"><label>Size</label><div>${escape(app.fileSize || '—')}</div></div>
          <div class="detail-item"><label>Architecture</label><div>${escape(app.architecture || '—')}</div></div>
          <div class="detail-item"><label>Android</label><div>${escape(app.androidVersion || '—')}</div></div>
          <div class="detail-item"><label>Released</label><div>${escape(app.releaseDate || '—')}</div></div>
          <div class="detail-item"><label>Developer</label><div>${escape(app.developer || '—')}</div></div>
          <div class="detail-item"><label>Downloads</label><div>${app.downloadCount != null ? app.downloadCount.toLocaleString() : '—'}</div></div>
        </div>

        <div class="detail-section">
          <h3>About</h3>
          <div>${htmlInfo}</div>
        </div>

        ${app.requirements ? `<div class="detail-section"><h3>Requirements</h3><p>${escape(app.requirements)}</p></div>` : ''}

        ${app.changelog ? `<div class="detail-section"><h3>Changelog</h3><p>${escape(app.changelog)}</p></div>` : ''}

        ${screenshots ? `
          <div class="detail-section">
            <h3>Screenshots</h3>
            <div class="screenshots">${screenshots}</div>
          </div>` : ''}

        <div class="download-box">
          <div class="download-filename">${escape(app.fileName || 'Unknown file')}</div>
          <div class="download-actions">
            <a href="${downloadUrl}" download="${escape(app.fileName || '')}" class="btn btn-primary" id="downloadBtn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </a>
            <button class="btn btn-secondary" id="copyLinkBtn" data-url="${downloadUrl}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy Link
            </button>
            ${app.websiteUrl ? `<a href="${escape(app.websiteUrl)}" target="_blank" rel="noopener" class="btn btn-ghost">Website</a>` : ''}
            ${app.telegramUrl ? `<a href="${escape(app.telegramUrl)}" target="_blank" rel="noopener" class="btn btn-ghost">Telegram</a>` : ''}
          </div>
        </div>
      </div>`;

    $('#modalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';

    $('#modalClose').onclick = closeModal;
    $('#copyLinkBtn').onclick = async () => {
      try {
        await navigator.clipboard.writeText(downloadUrl);
        toast('Direct link copied!', 'success');
      } catch {
        toast('Failed to copy link', 'error');
      }
    };
    $('#downloadBtn').onclick = () => {
      // Update URL to reflect visit
      history.replaceState(null, '', `?app=${encodeURIComponent(app.slug)}`);
    };
  }

  function closeModal() {
    $('#modalOverlay').classList.remove('active');
    document.body.style.overflow = '';
    // Clear URL parameter if it was from a share
    const url = new URL(location.href);
    if (url.searchParams.has('app')) {
      url.searchParams.delete('app');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }
  $('#modalOverlay').addEventListener('click', e => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ====== Rendering ======
  function renderFeatured() {
    const grid = $('#featuredGrid');
    const featured = STATE.apps.filter(a => a.featured && a.status === 'published').slice(0, 6);
    grid.innerHTML = featured.length
      ? featured.map(appCard).join('')
      : `<div class="empty" style="grid-column: 1/-1;"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><p>No featured apps yet.</p></div>`;
    attachCardHandlers(grid);
  }

  function renderLatest() {
    const grid = $('#latestGrid');
    if (STATE.filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty" style="grid-column: 1/-1;">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <h3>No results found</h3>
          <p>Try different keywords or reset filters.</p>
        </div>`;
      return;
    }
    grid.innerHTML = STATE.filtered.slice(0, 18).map(appCard).join('');
    attachCardHandlers(grid);
    $('#resultCount').textContent = `Showing ${Math.min(STATE.filtered.length, 18)} of ${STATE.filtered.length} apps`;
  }

  function attachCardHandlers(container) {
    $$('.card', container).forEach(card => {
      const handler = () => {
        const slug = card.dataset.slug;
        const app = STATE.apps.find(a => a.slug === slug);
        if (app) {
          history.replaceState(null, '', `?app=${encodeURIComponent(slug)}`);
          openAppModal(app);
        }
      };
      card.addEventListener('click', handler);
      card.addEventListener('keydown', e => { if (e.key === 'Enter') handler(); });
    });
  }

  function renderFilters() {
    const cats = ['all', ...new Set(STATE.apps.map(a => a.category).filter(Boolean))];
    $('#filters').innerHTML = cats.map(c =>
      `<button class="chip ${c === STATE.currentCategory ? 'active' : ''}" data-cat="${escape(c)}">${escape(c === 'all' ? 'All' : c)}</button>`
    ).join('');
    $$('#filters .chip').forEach(btn => {
      btn.addEventListener('click', () => {
        STATE.currentCategory = btn.dataset.cat;
        applyFilters();
        renderFilters();
      });
    });
  }

  function renderStats() {
    const pub = STATE.apps.filter(a => a.status === 'published');
    $('#statTotal').textContent = pub.length;
    $('#statFeatured').textContent = pub.filter(a => a.featured).length;
    $('#statCategories').textContent = new Set(pub.map(a => a.category).filter(Boolean)).size;
    const total = pub.reduce((s, a) => s + (a.downloadCount || 0), 0);
    $('#statDownloads').textContent = total > 999 ? (total / 1000).toFixed(1) + 'k' : total;
  }

  function applyFilters() {
    let list = STATE.apps.filter(a => a.status === 'published');
    if (STATE.currentCategory !== 'all') {
      list = list.filter(a => a.category === STATE.currentCategory);
    }
    const q = STATE.currentSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(a => {
        const hay = [a.name, a.package, a.developer, a.category, a.description, ...(a.tags || [])].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    switch (STATE.currentSort) {
      case 'name-asc': list.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
      case 'name-desc': list.sort((a, b) => (b.name || '').localeCompare(a.name || '')); break;
      case 'popular': list.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0)); break;
      default: list.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
    }
    STATE.filtered = list;
    renderLatest();
  }

  // ====== Data Load ======
  async function loadData() {
    const grid = $('#latestGrid');
    const featGrid = $('#featuredGrid');
    showSkeletons(grid);
    showSkeletons(featGrid, 3);
    try {
      const res = await fetch('apps.json?t=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data.apps)) throw new Error('Invalid data');
      STATE.apps = data.apps;
      if (data.config) STATE.config = { ...STATE.config, ...data.config };
      renderFilters();
      renderStats();
      renderFeatured();
      applyFilters();
    } catch (err) {
      grid.innerHTML = `<div class="empty" style="grid-column: 1/-1;"><h3>Failed to load catalog</h3><p>${escape(err.message)}</p></div>`;
      featGrid.innerHTML = '';
    }
  }

  // ====== Events ======
  $('#searchInput').addEventListener('input', e => {
    STATE.currentSearch = e.target.value;
    applyFilters();
  });
  $('#sortSelect').addEventListener('change', e => {
    STATE.currentSort = e.target.value;
    applyFilters();
  });

  // ====== Deep link ======
  function handleDeepLink() {
    const params = new URLSearchParams(location.search);
    const slug = params.get('app');
    if (slug) {
      const app = STATE.apps.find(a => a.slug === slug);
      if (app) openAppModal(app);
      else toast('Application not found', 'error');
    }
  }

  // ====== Init ======
  (async () => {
    await loadData();
    handleDeepLink();
  })();
})();
