// why tf are you reading this dumbass
// These are PUBLIC identifiers, not secrets. The real protection is firestore.rules.
(function () {
  'use strict';
  function slug(s) { return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  // India Standard Time (UTC+5:30, no daylight saving) — used for every date/time bucket
  function istParts(d) {
    var t = new Date(d.getTime() + 19800000);
    return { day: t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate()), hour: t.getUTCHours(),
             time: p2(t.getUTCHours()) + ':' + p2(t.getUTCMinutes()) + ':' + p2(t.getUTCSeconds()) };
  }
  // Turns one download button (title + label + audio from your sheet) into the facts we record. Nothing is invented:
  // anything the sheet does not say stays empty (e.g. episode titles).
  function describe(title, label, audio, meta) {
    var type = (meta && meta.type) || '';
    var isSeries = type === 'Series' || type === 'Animated Series';
    var clean = String(title).replace(/\s*\(\d{4}\)\s*$/, '');
    var show = clean, season = null, episode = null, kind = isSeries ? 'pack' : 'movie';
    var lab = String(label || '').trim();
    if (isSeries) {
      var m = clean.match(/^(.*?)\s+(?:season\s+(\d+)|S0*(\d+))\s*$/i);
      if (m) { show = m[1].trim(); season = parseInt(m[2] || m[3], 10); }
      var em = lab.match(/^(?:episode|ep\.?)\s*(\d+)\b/i);
      if (em) { episode = parseInt(em[1], 10); kind = 'episode'; }
      if (season == null) { var sm = lab.match(/^S0*(\d+)\b/i); if (sm) season = parseInt(sm[1], 10); }
    }
    var qm = lab.match(/\b\d{3,4}p\b.*$/i);
    var lang = String(audio || '').trim();
    return { contentId: slug(title), title: String(title), contentType: isSeries ? 'Series' : 'Movie', kind: kind,
             show: isSeries ? show : null, season: season, episode: episode, quality: qm ? qm[0].trim() : null,
             language: lang || null, buttonLabel: lab || null };
  }
  window.MV = {
    firebase: {
      apiKey: "AIzaSyAN4_rYFCjNCu_4OKf-osEqOHXqlTtHhbA",
      authDomain: "marvelmibsam.firebaseapp.com",
      projectId: "marvelmibsam",
      storageBucket: "marvelmibsam.firebasestorage.app",
      messagingSenderId: "960409941620",
      appId: "1:960409941620:web:4b082ee43014a51af84321",
      measurementId: "G-G8T1KMG4JS"
    },
    adminEmail: 'mibsamonline@gmail.com',   // only used to show/hide the UI. The real lock is in firestore.rules
    slug: slug, contentId: slug, istParts: istParts, describe: describe
  };
})();
