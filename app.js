// ═══════════════════════════════════════════════════════
//  MarvelVault — app.js
// ═══════════════════════════════════════════════════════

/* ─── STATE ─── */
const State = {
  watchlist: JSON.parse(localStorage.getItem('mv_watchlist') || '[]'),
  currentPage: 'home',
  searchQuery: '',
  searchFilter: 'all',
  heroIndex: 0,

  saveWatchlist() {
    localStorage.setItem('mv_watchlist', JSON.stringify(this.watchlist));
  },
  inWatchlist(title) { return this.watchlist.includes(title); },
  addToWatchlist(title) {
    if (!this.inWatchlist(title)) { this.watchlist.push(title); this.saveWatchlist(); return true; }
    return false;
  },
  removeFromWatchlist(title) {
    const i = this.watchlist.indexOf(title);
    if (i > -1) { this.watchlist.splice(i, 1); this.saveWatchlist(); return true; }
    return false;
  },
  toggleWatchlist(title) {
    return this.inWatchlist(title) ? (this.removeFromWatchlist(title), false) : (this.addToWatchlist(title), true);
  }
};

/* ─── HERO TITLES (featured rotation) ─── */
const HERO_TITLES = [
  "Avengers: Endgame (2019)",
  "Avengers: Infinity War (2018)",
  "Spider-Man: No Way Home (2021)",
  "Thor: Ragnarok (2017)",
  "Black Panther (2018)",
  "Guardians of the Galaxy (2014)",
  "Captain America: Civil War (2016)",
  "Logan (2017)",
  "Deadpool & Wolverine (2024)",
  "Loki season 2 (2023)"
];

/* ─── HELPERS ─── */
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function getTypeBadge(type) {
  if (type === 'Movie') return '<span class="card-type-badge badge-movie">Movie</span>';
  if (type === 'Series') return '<span class="card-type-badge badge-series">Series</span>';
  if (type === 'Animated Series') return '<span class="card-type-badge badge-animated">Animated</span>';
  if (type === 'Special Presentation') return '<span class="card-type-badge badge-special">Special</span>';
  return '';
}

function starSVG(size=12) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
}

function telegramSVG(size=15) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`;
}

function heartSVG(filled=false) {
  if (filled) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#e8192c"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
}

function plusSVG() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
}

function checkSVG() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function showToast(msg, icon='✓') {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${icon}</span> ${esc(msg)}`;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ─── CARD BUILDER ─── */
function buildCard(title, opts = {}) {
  const meta = window.META[title] || {};
  const poster = window.posterPath(title);
  const inList = State.inWatchlist(title);
  const displayTitle = title.replace(/\s*\(\d{4}\)$/, '');
  const type = meta.type || 'Movie';
  const year = meta.year || (title.match(/\((\d{4})\)/)||[])[1] || '';
  const rating = meta.rating || '';
  const titleKey = encodeURIComponent(title);

  return `
  <div class="card" data-title="${esc(title)}" onclick="openModal('${titleKey}')">
    <div class="card-poster-wrap">
      <img src="${esc(poster)}" alt="${esc(displayTitle)}" loading="lazy"
           onerror="this.src='posters/placeholder.png'" class="loading"
           onload="this.classList.remove('loading')">
      ${getTypeBadge(type)}
      <button class="card-wl-btn ${inList?'in-list':''}" onclick="toggleWLFromCard(event,'${esc(title)}')" title="${inList?'Remove from':'Add to'} Watchlist" aria-label="Watchlist">
        ${heartSVG(inList)}
      </button>
      <div class="card-hover-overlay">
        <div class="card-hover-title">${esc(displayTitle)}</div>
        <div class="card-hover-meta">
          ${rating ? `<span class="card-hover-rating">${starSVG(10)} ${rating}</span>` : ''}
          ${rating && year ? '<span>·</span>' : ''}
          ${year ? `<span>${year}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="card-info">
      <div class="card-info-title">${esc(displayTitle)}</div>
      <div class="card-info-year">${year}${rating ? ` · ${starSVG(10)} ${rating}` : ''}</div>
    </div>
  </div>`;
}

function toggleWLFromCard(event, title) {
  event.stopPropagation();
  const added = State.toggleWatchlist(title);
  showToast(added ? `Added to Watchlist` : `Removed from Watchlist`, added ? '♥' : '✕');
  refreshAllWLUI();
}

/* ─── REFRESH WATCHLIST UI ─── */
function refreshAllWLUI() {
  // Update all card WL buttons
  document.querySelectorAll('.card').forEach(card => {
    const title = card.dataset.title;
    const btn = card.querySelector('.card-wl-btn');
    if (!btn || !title) return;
    const inList = State.inWatchlist(title);
    btn.className = `card-wl-btn ${inList ? 'in-list' : ''}`;
    btn.innerHTML = heartSVG(inList);
    btn.title = inList ? 'Remove from Watchlist' : 'Add to Watchlist';
  });

  // Update hero watchlist button
  const heroWL = document.querySelector('.btn-hero-watchlist');
  if (heroWL) {
    const heroTitle = HERO_TITLES[State.heroIndex];
    const inList = State.inWatchlist(heroTitle);
    heroWL.className = `btn-hero-watchlist ${inList ? 'in-list' : ''}`;
    heroWL.innerHTML = `
      <span class="plus">${plusSVG()}</span>
      <span class="check">${checkSVG()}</span>
      ${inList ? 'In Watchlist' : 'Add to Watchlist'}`;
  }

  // Update nav badge
  const count = State.watchlist.length;
  const badge = document.querySelector('.watchlist-nav-btn .wl-count');
  if (badge) {
    badge.textContent = count;
    badge.className = `wl-count ${count > 0 ? 'visible' : ''}`;
  }

  // Update bottom nav badge
  document.querySelectorAll('.bnav-badge').forEach(b => {
    if (b.closest('[data-page="watchlist"]')) {
      b.textContent = count;
      b.className = `bnav-badge ${count > 0 ? 'visible' : ''}`;
    }
  });

  // Update modal WL button if open
  const modalWL = document.querySelector('.modal-wl-btn');
  if (modalWL && modalWL.dataset.title) {
    const inList = State.inWatchlist(modalWL.dataset.title);
    modalWL.className = `modal-wl-btn ${inList ? 'in-list' : ''}`;
    modalWL.innerHTML = `
      <span class="plus">${plusSVG()}</span>
      <span class="check">${checkSVG()}</span>
      ${inList ? 'In Watchlist' : 'Add to Watchlist'}`;
  }

  // Re-render watchlist page if visible
  if (State.currentPage === 'watchlist') renderWatchlistPage();
}

/* ═══════════════════════════════════════════════════
   HERO BANNER
═══════════════════════════════════════════════════ */
let heroTimer = null;

function renderHero(index) {
  State.heroIndex = index;
  const title = HERO_TITLES[index];
  const meta = window.META[title] || {};
  const poster = window.posterPath(title);
  const inList = State.inWatchlist(title);
  const displayTitle = title.replace(/\s*\(\d{4}\)$/, '');
  const titleKey = encodeURIComponent(title);

  const hero = document.getElementById('hero');
  hero.innerHTML = `
    <img class="hero-bg-img" src="${esc(poster)}" alt="" onerror="this.src='posters/placeholder.png'" aria-hidden="true">
    <div class="hero-overlay"></div>
    <div class="hero-noise"></div>
    <div class="hero-content">
      <div class="hero-eyebrow">
        <span class="hero-badge">Featured</span>
        ${meta.phase ? `<span class="hero-phase-tag">${esc(meta.phase)}</span>` : ''}
        <span class="hero-phase-tag">${esc(meta.type||'Movie')}</span>
      </div>
      <h1 class="hero-title">${esc(displayTitle)}</h1>
      <div class="hero-meta-row">
        ${meta.year ? `<span>${esc(meta.year)}</span><span class="dot">●</span>` : ''}
        ${meta.runtime ? `<span>${esc(meta.runtime)}</span>` : ''}
        ${meta.rating ? `<span class="dot">●</span><span class="hero-rating-badge">${starSVG(13)} ${esc(meta.rating)} IMDb</span>` : ''}
      </div>
      ${meta.genres && meta.genres.length ? `
      <div class="hero-genres">
        ${meta.genres.map(g=>`<span class="hero-genre-tag">${esc(g)}</span>`).join('')}
      </div>` : ''}
      <p class="hero-plot">${esc(meta.plot||'')}</p>
      <div class="hero-actions">
        <button class="btn-hero-primary" onclick="openModal('${titleKey}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          More Details
        </button>
        <button class="btn-hero-watchlist ${inList?'in-list':''}" onclick="toggleHeroWL('${esc(title)}')">
          <span class="plus">${plusSVG()}</span>
          <span class="check">${checkSVG()}</span>
          ${inList ? 'In Watchlist' : 'Add to Watchlist'}
        </button>
      </div>
    </div>
    <div class="hero-scroll-hint" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>`;
}

function toggleHeroWL(title) {
  const added = State.toggleWatchlist(title);
  showToast(added ? 'Added to Watchlist' : 'Removed from Watchlist', added ? '♥' : '✕');
  refreshAllWLUI();
}

function startHeroRotation() {
  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    const next = (State.heroIndex + 1) % HERO_TITLES.length;
    renderHero(next);
  }, 8000);
}

/* ═══════════════════════════════════════════════════
   HOME PAGE ROWS
═══════════════════════════════════════════════════ */
function renderHome() {
  const container = document.getElementById('home-rows');
  if (container._rendered) return;
  container._rendered = true;

  let html = '';

  // Watchlist row (dynamic, skip if empty – will be rebuilt on watchlist changes)
  html += `<div class="content-section" id="wl-row-section" style="display:none">
    <div class="section-header">
      <div class="section-title-wrap">
        <div class="section-phase-dot" style="background:#e8192c"></div>
        <span class="section-title">My Watchlist</span>
      </div>
      <button class="section-see-all" onclick="showPage('watchlist')">See All →</button>
    </div>
    <div class="poster-row" id="home-wl-row"></div>
  </div>
  <div class="section-divider" id="wl-divider" style="display:none"></div>`;

  // Phase rows
  window.PHASES.forEach((phase, pi) => {
    html += `
    <div class="content-section" id="section-${phase.id}">
      <div class="section-header">
        <div class="section-title-wrap">
          <div class="section-phase-dot" style="background:${phase.color}"></div>
          <span class="section-title">${esc(phase.label)}</span>
          <span class="section-count">${phase.titles.length}</span>
        </div>
      </div>
      <div class="poster-row">
        ${phase.titles.map(t => buildCard(t)).join('')}
      </div>
    </div>
    <div class="section-divider"></div>`;
  });

  // Series row
  const seriesTitles = window.ALL_TITLES.filter(t => {
    const m = window.META[t];
    return m && (m.type === 'Series' || m.type === 'Animated Series' || m.type === 'Special Presentation');
  });
  html += `
  <div class="content-section" id="section-series">
    <div class="section-header">
      <div class="section-title-wrap">
        <div class="section-phase-dot" style="background:#3dbdd9"></div>
        <span class="section-title">Marvel Series & Specials</span>
        <span class="section-count">${seriesTitles.length}</span>
      </div>
    </div>
    <div class="poster-row">
      ${seriesTitles.map(t => buildCard(t)).join('')}
    </div>
  </div>
  <div class="section-divider"></div>`;

  // X-Men row
  html += `
  <div class="content-section" id="section-xmen">
    <div class="section-header">
      <div class="section-title-wrap">
        <div class="section-phase-dot" style="background:#f5c842"></div>
        <span class="section-title">X-Men Collection</span>
        <span class="section-count">${window.XMEN_TITLES.length}</span>
      </div>
      <button class="section-see-all" onclick="showPage('xmen')">See All →</button>
    </div>
    <div class="poster-row">
      ${window.XMEN_TITLES.map(t => buildCard(t)).join('')}
    </div>
  </div>
  <div class="section-divider"></div>`;

  // Deadpool row
  html += `
  <div class="content-section" id="section-deadpool">
    <div class="section-header">
      <div class="section-title-wrap">
        <div class="section-phase-dot" style="background:#e8192c"></div>
        <span class="section-title">Deadpool Collection</span>
        <span class="section-count">${window.DEADPOOL_TITLES.length}</span>
      </div>
    </div>
    <div class="poster-row">
      ${window.DEADPOOL_TITLES.map(t => buildCard(t)).join('')}
    </div>
  </div>`;

  container.innerHTML = html;

  // Intersection observer for fade-in
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    });
  }, { threshold: 0.06 });
  container.querySelectorAll('.content-section').forEach(s => io.observe(s));
}

function updateHomeWatchlistRow() {
  const section = document.getElementById('wl-row-section');
  const divider = document.getElementById('wl-divider');
  const row = document.getElementById('home-wl-row');
  if (!section || !row) return;

  if (State.watchlist.length === 0) {
    section.style.display = 'none';
    if (divider) divider.style.display = 'none';
  } else {
    section.style.display = 'block';
    section.classList.add('visible');
    if (divider) divider.style.display = 'block';
    row.innerHTML = State.watchlist.map(t => buildCard(t)).join('');
  }
}

/* ═══════════════════════════════════════════════════
   SEARCH PAGE
═══════════════════════════════════════════════════ */
let searchDebounce = null;

function renderSearch(query, filter) {
  const q = (query || '').trim().toLowerCase();
  State.searchQuery = q;
  State.searchFilter = filter || 'all';

  const input = document.getElementById('nav-search');
  if (input && input.value !== query) input.value = query || '';

  document.getElementById('search-page-heading').textContent =
    q ? `Results for "${query}"` : 'Browse All Titles';

  let results = [...window.ALL_TITLES];

  // filter by type
  if (State.searchFilter !== 'all') {
    results = results.filter(t => {
      const m = window.META[t];
      if (!m) return false;
      if (State.searchFilter === 'movie') return m.type === 'Movie';
      if (State.searchFilter === 'series') return m.type === 'Series';
      if (State.searchFilter === 'animated') return m.type === 'Animated Series';
      if (State.searchFilter === 'special') return m.type === 'Special Presentation';
      return true;
    });
  }

  // filter by query
  if (q) {
    results = results.filter(t => {
      const m = window.META[t] || {};
      return (
        t.toLowerCase().includes(q) ||
        (m.cast || '').toLowerCase().includes(q) ||
        (m.director || '').toLowerCase().includes(q) ||
        (m.genres || []).join(' ').toLowerCase().includes(q) ||
        (m.plot || '').toLowerCase().includes(q) ||
        (m.phase || '').toLowerCase().includes(q)
      );
    });
  }

  const grid = document.getElementById('search-grid');
  const empty = document.getElementById('search-empty');
  const countEl = document.getElementById('search-result-count');
  if (countEl) countEl.textContent = `${results.length} title${results.length !== 1 ? 's' : ''}`;

  if (results.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
  } else {
    grid.innerHTML = results.map(t => buildCard(t)).join('');
    empty.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════════
   PHASES PAGE
═══════════════════════════════════════════════════ */
function renderPhasesPage() {
  const container = document.getElementById('phases-content');
  if (container._rendered) return;
  container._rendered = true;

  let html = '';
  window.PHASES.forEach((phase, i) => {
    const movies = phase.titles.filter(t => window.META[t]?.type === 'Movie').length;
    const series = phase.titles.filter(t => ['Series','Animated Series','Special Presentation'].includes(window.META[t]?.type)).length;

    html += `
    <div class="phase-block">
      <div class="phase-block-header">
        <div class="phase-block-number" style="color:${phase.color}">${String(i+1).padStart(2,'0')}</div>
        <div class="phase-block-info">
          <div class="phase-block-name" style="color:${phase.color}">${esc(phase.label)}</div>
          <div class="phase-block-count">${movies} Movie${movies!==1?'s':''} · ${series} Series/Special${series!==1?'s':''}</div>
        </div>
      </div>
      <div class="phase-grid">
        ${phase.titles.map(t => buildCard(t)).join('')}
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

/* ═══════════════════════════════════════════════════
   XMEN PAGE
═══════════════════════════════════════════════════ */
function renderXmenPage() {
  const container = document.getElementById('xmen-content');
  if (container._rendered) return;
  container._rendered = true;
  container.innerHTML = `
    <div class="phase-grid" style="margin-bottom:32px">
      ${window.XMEN_TITLES.map(t => buildCard(t)).join('')}
    </div>
    <div style="margin-top:16px; padding-top:24px; border-top:1px solid var(--border)">
      <div style="font-family:'Oswald',sans-serif;font-size:16px;font-weight:500;letter-spacing:1px;margin-bottom:14px;color:var(--text-2)">DEADPOOL COLLECTION</div>
      <div class="phase-grid">
        ${window.DEADPOOL_TITLES.map(t => buildCard(t)).join('')}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   WATCHLIST PAGE
═══════════════════════════════════════════════════ */
function renderWatchlistPage() {
  const container = document.getElementById('watchlist-content');
  const empty = document.getElementById('watchlist-empty');

  if (State.watchlist.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    container.innerHTML = `<div class="search-results-grid">${State.watchlist.map(t => buildCard(t)).join('')}</div>`;
  }
}

/* ═══════════════════════════════════════════════════
   PAGE NAVIGATION
═══════════════════════════════════════════════════ */
function showPage(name) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Deactivate all nav links + bnav buttons
  document.querySelectorAll('.nav-links li a, .nav-links li button').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));

  State.currentPage = name;

  const pageEl = document.getElementById(name + '-page');
  if (pageEl) {
    pageEl.classList.add('active', 'page-enter');
    setTimeout(() => pageEl.classList.remove('page-enter'), 400);
  }

  // Activate nav links
  const navMap = { home: 'nav-home', phases: 'nav-phases', xmen: 'nav-xmen', watchlist: 'nav-watchlist', search: 'nav-search-link' };
  if (navMap[name]) document.getElementById(navMap[name])?.classList.add('active');

  // Activate bnav
  const bnavBtn = document.querySelector(`.bnav-btn[data-page="${name}"]`);
  if (bnavBtn) bnavBtn.classList.add('active');

  // Render pages on demand
  if (name === 'home') { renderHome(); renderHero(State.heroIndex); updateHomeWatchlistRow(); }
  if (name === 'phases') renderPhasesPage();
  if (name === 'xmen') renderXmenPage();
  if (name === 'watchlist') renderWatchlistPage();
  if (name === 'search') renderSearch(State.searchQuery, State.searchFilter);

  // Focus search input when navigating to search
  if (name === 'search') {
    setTimeout(() => document.getElementById('nav-search')?.focus(), 100);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════
   MODAL
═══════════════════════════════════════════════════ */
let currentModalTitle = null;

function openModal(titleKey) {
  const title = decodeURIComponent(titleKey);
  currentModalTitle = title;
  const meta = window.META[title] || {};
  const downloads = window.DOWNLOADS[title] || [];
  const poster = window.posterPath(title);
  const displayTitle = title.replace(/\s*\(\d{4}\)$/, '');
  const inList = State.inWatchlist(title);

  // Build downloads HTML
  let dlHTML = '';
  if (downloads.length === 0) {
    dlHTML = `<p style="font-size:13px;color:var(--text-3)">No download links available.</p>`;
  } else if (downloads.length === 1 && downloads[0].q === 'Download') {
    dlHTML = `<a class="tg-dl-btn-large" href="${esc(downloads[0].url)}" target="_blank" rel="noopener noreferrer">${telegramSVG(18)} Download on Telegram</a>`;
  } else {
    dlHTML = `<div class="downloads-grid">
      ${downloads.map(d => `
        <div class="download-item">
          <div class="download-item-info">
            <div class="download-quality">${esc(d.q)}</div>
            ${d.audio ? `<div class="download-audio"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>${esc(d.audio)}</div>` : ''}
          </div>
          <a class="tg-dl-btn" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${telegramSVG(13)} Get</a>
        </div>`).join('')}
    </div>`;
  }

  // Build details grid
  let detailsHTML = '';
  if (meta.director) detailsHTML += `<div class="modal-detail-item"><div class="modal-detail-label">Director / Creator</div><div class="modal-detail-value">${esc(meta.director)}</div></div>`;
  if (meta.cast) detailsHTML += `<div class="modal-detail-item"><div class="modal-detail-label">Cast</div><div class="modal-detail-value">${esc(meta.cast)}</div></div>`;
  if (meta.phase) detailsHTML += `<div class="modal-detail-item"><div class="modal-detail-label">MCU Phase</div><div class="modal-detail-value">${esc(meta.phase)}</div></div>`;
  if (meta.type) detailsHTML += `<div class="modal-detail-item"><div class="modal-detail-label">Format</div><div class="modal-detail-value">${esc(meta.type)}</div></div>`;

  document.getElementById('modal').innerHTML = `
    <div class="modal-art">
      <img class="modal-art-img" src="${esc(poster)}" alt="" onerror="this.src='posters/placeholder.png'" loading="lazy">
      <div class="modal-art-gradient"></div>
      <button class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-top">
        <div class="modal-poster">
          <img src="${esc(poster)}" alt="${esc(displayTitle)}" onerror="this.src='posters/placeholder.png'" loading="lazy">
        </div>
        <div class="modal-info">
          <div class="modal-type-label">${esc(meta.type || 'Movie')}</div>
          <h2 class="modal-title">${esc(displayTitle)}</h2>
          <div class="modal-meta-pills">
            ${meta.year ? `<span class="meta-pill">${esc(meta.year)}</span>` : ''}
            ${meta.runtime ? `<span class="meta-pill">${esc(meta.runtime)}</span>` : ''}
            ${meta.rating ? `<span class="meta-pill meta-pill-rating">${starSVG(12)} ${esc(meta.rating)} IMDb</span>` : ''}
            ${meta.phase ? `<span class="meta-pill">${esc(meta.phase)}</span>` : ''}
          </div>
          ${meta.genres && meta.genres.length ? `<div class="modal-genres">${meta.genres.map(g=>`<span class="modal-genre-tag">${esc(g)}</span>`).join('')}</div>` : ''}
          <div class="modal-actions">
            <button class="modal-wl-btn ${inList?'in-list':''}" data-title="${esc(title)}" onclick="toggleModalWL('${esc(title)}')">
              <span class="plus">${plusSVG()}</span>
              <span class="check">${checkSVG()}</span>
              ${inList ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
          </div>
        </div>
      </div>

      ${meta.plot ? `
      <div class="modal-section">
        <div class="modal-section-title">Synopsis</div>
        <p class="modal-plot-text">${esc(meta.plot)}</p>
      </div>` : ''}

      ${detailsHTML ? `
      <div class="modal-section">
        <div class="modal-section-title">Details</div>
        <div class="modal-details-grid">${detailsHTML}</div>
      </div>` : ''}

      <div class="modal-divider"></div>

      <div class="modal-section">
        <div class="modal-section-title">Download via Telegram</div>
        ${dlHTML}
      </div>
    </div>`;

  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  currentModalTitle = null;
}

function toggleModalWL(title) {
  const added = State.toggleWatchlist(title);
  showToast(added ? 'Added to Watchlist' : 'Removed from Watchlist', added ? '♥' : '✕');
  refreshAllWLUI();
  updateHomeWatchlistRow();
}

/* ═══════════════════════════════════════════════════
   NAV SCROLL EFFECT
═══════════════════════════════════════════════════ */
function handleNavScroll() {
  const nav = document.getElementById('topnav');
  if (window.scrollY > 40) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
}

/* ═══════════════════════════════════════════════════
   SEARCH HANDLER
═══════════════════════════════════════════════════ */
function handleSearchInput(value) {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    if (State.currentPage !== 'search') showPage('search');
    renderSearch(value, State.searchFilter);
  }, 180);
}

function setSearchFilter(filter) {
  State.searchFilter = filter;
  document.querySelectorAll('.filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.filter === filter);
  });
  renderSearch(State.searchQuery, filter);
}

function clearWatchlist() {
  if (!confirm('Clear your entire watchlist?')) return;
  State.watchlist = [];
  State.saveWatchlist();
  refreshAllWLUI();
  updateHomeWatchlistRow();
  showToast('Watchlist cleared', '✕');
}

/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Render hero immediately
  renderHero(0);
  startHeroRotation();

  // Render home rows
  renderHome();
  updateHomeWatchlistRow();

  // Nav scroll listener
  window.addEventListener('scroll', handleNavScroll, { passive: true });

  // Close modal on overlay click
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Escape key closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Search input handler
  const searchInput = document.getElementById('nav-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => handleSearchInput(e.target.value));
    searchInput.addEventListener('focus', () => {
      if (State.currentPage !== 'search') showPage('search');
    });
  }

  // Refresh watchlist UI on init
  refreshAllWLUI();

  // Show home
  showPage('home');
});
