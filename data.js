// ═══════════════════════════════════════════════════════
//  MarvelVault — data.js
//  Reads everything from YOUR GOOGLE SHEET.
// ═══════════════════════════════════════════════════════

/* ▼▼▼  PASTE YOUR GOOGLE SHEET LINK BETWEEN THE QUOTES  ▼▼▼ */
var SHEET_LINK = "https://docs.google.com/spreadsheets/d/1s0mSZsvLvDHRTmc97cC_uQQUBo2wsFzG/edit?usp=drivesdk&ouid=104794084731317752145&rtpof=true&sd=true";
/* ▲▲▲  This is the only line you ever need to change.  ▲▲▲ */

(function () {
  'use strict';

  var TABS = { titles: 'Titles', links: 'Links', sections: 'Collections' };
  var CACHE_KEY = 'mv_sheet_cache_v1';
  var TIMEOUT_MS = 7000;
  var TYPES = ['Movie', 'Series', 'Animated Series', 'Animated Movie', 'Special Presentation'];
  var SERIES_TYPES = ['Series', 'Animated Series', 'Special Presentation'];
  var COLORS = { orange: '#e8a020', cyan: '#3dbdd9', red: '#d94040', purple: '#9b59d4', green: '#29c97e', gold: '#f0c040',
                 yellow: '#f5c842', crimson: '#e01818', 'dark red': '#8b0000', blue: '#3d7bd9', pink: '#d94f9b',
                 white: '#e8e8f0', gray: '#8888a0', grey: '#8888a0' };

  /* t.me → telegram.me */
  function tg(url) {
    url = String(url || '').trim();
    if (!url) return '#';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url.replace(/^https?:\/\/(www\.)?t\.me\//i, 'https://telegram.me/');
  }
  window.tg = tg;

  /* poster / backdrop file names (same rule as always) */
  window.posterPath = function (title) {
    var s = String(title)
      .replace(/\.\.\./g, '').replace(/\*/g, '')
      .replace(/\s*\(\d{4}\)$/, '')
      .replace(/\bseason\s+(\d+)\b/gi, 'season-$1')
      .replace(/\bS0*(\d+)\b/g, 's$1')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
      .toLowerCase();
    return 'posters/' + s + '.png';
  };
  window.backdropPath = function (title) {
    return window.posterPath(title).replace(/^posters\//, 'backdrops/').replace(/\.png$/, '.jpg');
  };

  /* ---------- CSV reading ---------- */
  function parseCSV(text) {
    var rows = [], row = [], field = '', inQ = false, i, c;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function toObjects(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    return rows.slice(1).map(function (r) {
      var o = {};
      head.forEach(function (h, i) { if (h) o[h] = (r[i] == null ? '' : String(r[i])).trim(); });
      return o;
    });
  }

  function sheetId() {
    var m = String(SHEET_LINK).match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];
    var bare = String(SHEET_LINK).trim();
    return /^[a-zA-Z0-9_-]{30,}$/.test(bare) ? bare : '';
  }

  function fetchTab(id, tab) {
    var url = 'https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(tab);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('Google answered ' + res.status + ' for the "' + tab + '" tab.');
        return res.text();
      })
      .then(function (txt) {
        clearTimeout(timer);
        if (/^\s*</.test(txt)) throw new Error('The sheet is private. Click Share → General access → "Anyone with the link" → Viewer.');
        return toObjects(parseCSV(txt));
      }, function (err) { clearTimeout(timer); throw err; });
  }

  /* ---------- turn sheet rows into what the site uses ---------- */
  function isYes(v) { return /^(yes|y|true|1|x|✓)$/i.test(String(v || '').trim()); }
  function isNo(v) { return /^(no|n|false|0)$/i.test(String(v || '').trim()); }
  function normType(t) {
    var l = String(t || '').trim().toLowerCase(), i;
    for (i = 0; i < TYPES.length; i++) if (TYPES[i].toLowerCase() === l) return TYPES[i];
    return t ? String(t).trim() : 'Movie';
  }

  function build(raw, source, error) {
    var warn = [], META = {}, DL = {}, info = {}, order = [], lc = {}, linkCount = 0;

    (raw.titles || []).forEach(function (r) {
      if (!r.title) return;
      var key = r.year ? r.title + ' (' + r.year + ')' : r.title;
      if (META[key]) { warn.push('Same post twice in Titles: ' + key); return; }
      META[key] = {
        type: normType(r.type), phase: r.tag || null, year: r.year || '', runtime: r.runtime || '', rating: r.rating || '',
        genres: (r.genres || '').split(',').map(function (g) { return g.trim(); }).filter(Boolean),
        plot: r.plot || '', cast: r.cast || '', director: r.director || ''
      };
      info[key] = {
        idx: order.length, banner: isYes(r.banner),
        sections: [r['section 1'], r['section 2'], r['section 3']]
          .map(function (s) { return String(s || '').trim().toLowerCase(); }).filter(Boolean)
      };
      lc[key.toLowerCase()] = key;
      order.push(key);
    });

    (raw.links || []).forEach(function (r) {
      if (!r.post && !r.link) return;
      var key = META[r.post] ? r.post : lc[String(r.post || '').toLowerCase()];
      if (!r.post || !r.link) { warn.push('Links row skipped, ' + (r.post ? 'no link' : 'no post') + ': ' + (r.post || r.link)); return; }
      if (!key) { warn.push('Links row names a post that does not exist: "' + r.post + '"'); return; }
      (DL[key] = DL[key] || []).push({ q: r['button label'] || 'Download', audio: r.audio || '', url: tg(r.link) });
      linkCount++;
    });

    function yearOf(k) { var y = parseInt(META[k].year, 10); return isNaN(y) ? 99999 : y; }
    function byYear(a, b) { return yearOf(a) - yearOf(b) || info[a].idx - info[b].idx; }

    var secs = (raw.sections || []).filter(function (r) { return r['section name']; }).map(function (r, i) {
      var c = String(r.color || '').trim(), page = String(r['also on page'] || '').toLowerCase().replace(/[^a-z]/g, '');
      return {
        name: r['section name'], _i: i, order: parseFloat(r['home order']),
        color: COLORS[c.toLowerCase()] || (/^#[0-9a-f]{3,8}$/i.test(c) ? c : '#8888a0'),
        home: !isNo(r['show on home']),
        page: page === 'phases' ? 'Phases' : (page === 'xmen' ? 'X-Men' : ''),
        auto: /series/i.test(r['auto rule'] || '')
      };
    });
    secs.sort(function (a, b) {
      var ao = isNaN(a.order) ? 9999 : a.order, bo = isNaN(b.order) ? 9999 : b.order;
      return ao - bo || a._i - b._i;
    });

    var known = {}, used = {};
    secs.forEach(function (s) { known[s.name.toLowerCase()] = true; });
    var SECTIONS = secs.map(function (s, i) {
      var nm = s.name.toLowerCase();
      var list = order.filter(function (k) {
        return s.auto ? SERIES_TYPES.indexOf(META[k].type) > -1 : info[k].sections.indexOf(nm) > -1;
      }).sort(byYear);
      list.forEach(function (k) { used[k] = true; });
      return { id: 'sec-' + i, label: s.name, color: s.color, home: s.home, page: s.page, titles: list };
    });

    order.forEach(function (k) {
      info[k].sections.forEach(function (n) { if (!known[n]) warn.push('"' + k + '" uses a section that is not in the Collections tab: ' + n); });
      if (!used[k]) warn.push('"' + k + '" is not in any section, so it only shows in Search.');
    });

    window.META = META;
    window.DOWNLOADS = DL;
    window.SECTIONS = SECTIONS;
    window.ALL_TITLES = order.slice();
    window.HERO_POOL = order.filter(function (k) { return info[k].banner; });
    window.DATA_STATUS = { source: source, titles: order.length, links: linkCount, sections: SECTIONS.length, warnings: warn, error: error || '' };
    return window.DATA_STATUS;
  }

  function readCache() {
    try { var c = JSON.parse(localStorage.getItem(CACHE_KEY)); return c && c.titles && c.titles.length ? c : null; }
    catch (e) { return null; }
  }

  /* ---------- load: Google Sheet → last saved copy → built-in backup ---------- */
  window.DATA_READY = (async function () {
    var id = sheetId(), err = '';
    if (id) {
      try {
        var res = await Promise.all([fetchTab(id, TABS.titles), fetchTab(id, TABS.links), fetchTab(id, TABS.sections)]);
        var raw = { titles: res[0], links: res[1], sections: res[2] };
        if (!raw.titles.length || !('title' in raw.titles[0])) throw new Error('The "Titles" tab is empty or its header row (row 1) was changed.');
        if (!raw.sections.length || !('section name' in raw.sections[0])) throw new Error('The "Collections" tab is empty or its header row (row 1) was changed.');
        if (raw.links.length && !('post' in raw.links[0])) throw new Error('The "Links" tab header row (row 1) was changed.');
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(raw)); } catch (e) { /* storage full or blocked: fine */ }
        return build(raw, 'sheet');
      } catch (e) {
        err = (e && e.message) || String(e);
        console.warn('[MarvelVault] Could not read the Google Sheet:', err);
      }
      var cached = readCache();
      if (cached) return build(cached, 'cache', err);
    } else {
      err = 'Google Sheet link is not set in data.js yet.';
    }
    return build(window.BACKUP_DATA || { titles: [], links: [], sections: [] }, 'backup', err);
  })();
})();
