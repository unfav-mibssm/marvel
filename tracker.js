// tracker.js — best-effort download-click tracking. The website NEVER depends on this file.
// On a click we fire the request and do nothing else: no waiting, no retries, no stored queue, no errors shown.
(function () {
  'use strict';
  try {
    var MV = window.MV;
    if (!MV || !MV.firebase || !MV.firebase.projectId) return;
    var CFG = MV.firebase, DEBUG = /[?&]trackdebug/.test(location.search), mem = null, TIMEOUT = 8000;
    var DOCS = 'projects/' + CFG.projectId + '/databases/(default)/documents';
    var URL_ = 'https://firestore.googleapis.com/v1/' + DOCS + ':commit?key=' + encodeURIComponent(CFG.apiKey);

    function rnd(n) {
      var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '', i, b;
      try { b = new Uint8Array(n); crypto.getRandomValues(b); for (i = 0; i < n; i++) s += a[b[i] % a.length]; return s; }
      catch (e) { for (i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
    }
    function uuid() { try { return crypto.randomUUID(); } catch (e) { return rnd(8) + '-' + rnd(4) + '-' + rnd(4) + '-' + rnd(4) + '-' + rnd(12); } }
    function visitorId() {
      try { var v = localStorage.getItem('mv_vid'); if (v && v.length >= 16) return v; v = uuid(); localStorage.setItem('mv_vid', v); return v; }
      catch (e) { return mem || (mem = uuid()); }
    }
    function seenGet() { try { return JSON.parse(localStorage.getItem('mv_seen') || '{}') || {}; } catch (e) { return {}; } }
    function seenAdd(k) { try { var s = seenGet(); s[k] = 1; localStorage.setItem('mv_seen', JSON.stringify(s)); } catch (e) {} }

    var chip = null;
    function dbg(msg) {
      if (!DEBUG) return;
      try {
        if (!chip) { chip = document.createElement('div'); chip.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:#111;color:#9f9;font:11px monospace;padding:6px 9px;border-radius:6px;max-width:90vw;white-space:pre-wrap'; document.body.appendChild(chip); }
        chip.textContent += msg + '\n';
      } catch (e) {}
    }
    function fv(v) { return typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v) }; }

    // One Firestore write over plain HTTPS. keepalive lets it finish even if the phone switches to the Telegram app.
    function write(path, fields, tsField, label, done) {
      var body = JSON.stringify({ writes: [{ update: { name: DOCS + '/' + path, fields: fields },
        updateTransforms: [{ fieldPath: tsField, setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } }] });
      function post(keepalive) {
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var t = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
        return fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: keepalive, signal: ctl ? ctl.signal : undefined })
          .then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
      }
      post(true).catch(function () { return post(false); }).then(function (r) {
        dbg(label + ' → HTTP ' + r.status);
        if (DEBUG && r.status >= 400) r.json().then(function (j) { dbg('   ' + ((j.error && j.error.message) || '')); }, function () {});
        if (done) done(r.status);
      }).catch(function (e) { dbg(label + ' → failed (' + (e && e.message) + ')'); });
    }

    function track(title, label, audio) {
      var meta = (window.META || {})[title];
      var d = MV.describe(title, label, audio, meta), now = new Date(), p = MV.istParts(now), vid = visitorId();
      var f = { contentId: fv(d.contentId), title: fv(d.title), contentType: fv(d.contentType), kind: fv(d.kind), visitorId: fv(vid),
                clientTs: fv(now.getTime()), date: fv(p.day), time: fv(p.time), hour: fv(p.hour) };
      if (d.show) f.show = fv(d.show);
      if (d.season != null) f.season = fv(d.season);
      if (d.episode != null) f.episode = fv(d.episode);
      if (d.quality) f.quality = fv(d.quality);
      if (d.language) f.language = fv(d.language);
      if (d.buttonLabel) f.buttonLabel = fv(d.buttonLabel);
      write('downloads/' + rnd(20), f, 'ts', 'click', null);          // 1) every click is its own record

      // 2) approximate unique visitors: one tiny record per visitor per item, only the first time this browser sees it
      var keys = ['all__all', 'type__' + (d.contentType === 'Series' ? 'series' : 'movie'), 'content__' + d.contentId];
      if (d.show) keys.push('show__' + MV.slug(d.show));
      if (d.episode != null) keys.push('episode__' + d.contentId + '__e' + d.episode);
      var seen = seenGet();
      keys.forEach(function (k) {
        if (seen[k]) return;
        var i = k.indexOf('__'), scope = k.slice(0, i), key = k.slice(i + 2);
        write('uniqueVisitors/' + scope + '__' + key + '__' + vid,
          { scope: fv(scope), key: fv(key), visitorId: fv(vid) }, 'firstSeen', 'visitor:' + scope,
          function (st) { if (st === 200 || st === 409) seenAdd(k); });
      });
    }
    window.MVTrack = track;

    function onClick(ev) {
      try {
        if (ev.type === 'auxclick' && ev.button !== 1) return;
        var a = ev.target && ev.target.closest ? ev.target.closest('a[data-mv-title]') : null;
        if (a) track(a.getAttribute('data-mv-title'), a.getAttribute('data-mv-label'), a.getAttribute('data-mv-audio'));
      } catch (e) { /* never interfere with the link */ }
    }
    document.addEventListener('click', onClick, true);      // capture phase: starts before navigation, never preventDefault
    document.addEventListener('auxclick', onClick, true);
  } catch (e) { /* tracking is optional */ }
})();
