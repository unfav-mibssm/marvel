// admin.js — the dashboard. Only mibsamonline@gmail.com can read anything (enforced by firestore.rules, not just this file).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, onSnapshot, runTransaction, increment, Timestamp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import * as C from './admin-core.js';

const MV = window.MV, VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = n => Math.round(Number(n || 0)).toLocaleString('en-IN');
const S = { days: {}, contents: {}, range: 'all', custom: {}, live: [], liveOk: false, liveErr: '', lastRollup: null, rollupErr: '', loadErr: '', loaded: false,
            tab: 'overview', liveType: 'all', liveQ: '', rankTab: 'movies', seen: null, denied: '', keyByCid: {}, timers: [], unsub: null, sel: null, q: '' };
let auth, db, rolling = false, started = false;

function errMsg(e) {
  const c = e && e.code || '';
  if (c.includes('permission-denied')) return 'Permission denied. Publish firestore.rules in the Firebase console and sign in with the admin Gmail.';
  if (c.includes('unavailable') || c.includes('network')) return 'Cannot reach Firebase right now (offline or blocked).';
  if (c.includes('resource-exhausted')) return 'Firebase free daily quota reached. It resets automatically (around 1 PM IST).';
  return (e && e.message) || String(e);
}
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); };

/* ---------------- sign-in ---------------- */
function showGate(msg) { $('#app').hidden = true; $('#gate').hidden = false; $('#gate-msg').innerHTML = msg || 'Private dashboard. Sign in with the owner Google account.'; }
$('#btn-login').onclick = async () => {
  S.denied = '';
  try { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); await signInWithPopup(auth, p); }
  catch (e) {
    const c = e.code || '';
    showGate('Sign-in failed: ' + esc(c === 'auth/unauthorized-domain' ? 'this website address is not listed in Firebase → Authentication → Settings → Authorized domains.'
      : c === 'auth/popup-blocked' ? 'your browser blocked the popup. Allow popups for this page and try again.'
      : c === 'auth/popup-closed-by-user' ? 'the sign-in window was closed.' : (c || e.message)));
  }
};
$('#btn-logout').onclick = () => signOut(auth);
try {
  const app = initializeApp(MV.firebase); auth = getAuth(app); db = getFirestore(app);
  onAuthStateChanged(auth, user => {
    if (!user) { stop(); return showGate(S.denied); }
    if (user.email !== MV.adminEmail || !user.emailVerified) { S.denied = '<b>Access Denied</b><br>' + esc(user.email) + ' is not allowed to view this dashboard.'; signOut(auth); return; }
    S.denied = ''; start(user);
  });
} catch (e) { showGate('Could not start Firebase: ' + esc(e.message)); }
function stop() { started = false; S.timers.forEach(clearInterval); S.timers = []; if (S.unsub) { S.unsub(); S.unsub = null; } S.loaded = false; S.live = []; S.seen = null; }

async function start(user) {
  if (started) return; started = true;
  $('#gate').hidden = true; $('#app').hidden = false; S.user = user;
  renderActive();
  try { await (window.DATA_READY || Promise.resolve()); } catch (e) {}
  Object.keys(window.META || {}).forEach(k => { S.keyByCid[MV.contentId(k)] = k; });
  try { await loadAll(); S.loadErr = ''; } catch (e) { S.loadErr = errMsg(e); }
  S.loaded = true; renderActive();
  startLive(); runRollup(false);
  S.timers.push(setInterval(() => { if (!document.hidden && started) runRollup(false); }, 120000), setInterval(tickRel, 30000));
}

/* ---------------- data: totals are calculated here by the admin and saved in statsDaily ---------------- */
async function loadAll() {
  const [ds, cs] = await Promise.all([getDocs(collection(db, 'statsDaily')), getDoc(doc(db, 'meta', 'contents'))]);
  S.days = {}; ds.forEach(d => { S.days[d.id] = d.data(); }); S.contents = cs.exists() ? cs.data() : {};
}
async function rollupStream(name, tsField, cursorKey, aggregate) {
  const metaRef = doc(db, 'meta', 'rollup'), touched = new Set(); let processed = 0;
  for (let guard = 0; guard < 25; guard++) {
    const m = (await getDoc(metaRef)).data() || {}, lastId = m[cursorKey] || '';
    // only records older than 90 s, so a slow in-flight write can never be skipped
    const cons = [where(tsField, '<=', Timestamp.fromMillis(Date.now() - 90000)), orderBy(tsField, 'asc')];
    if (lastId) { const ls = await getDoc(doc(db, name, lastId)); if (ls.exists()) cons.push(startAfter(ls)); }
    const snap = await getDocs(query(collection(db, name), ...cons, limit(400)));
    if (snap.empty) break;
    const res = aggregate(snap.docs.map(d => ({ ...d.data(), _ts: d.data()[tsField].toDate() })));
    const newLast = snap.docs[snap.docs.length - 1].id;
    await runTransaction(db, async tx => {                      // atomic: totals + bookmark move together, a second tab cannot double count
      const cur = (await tx.get(metaRef)).data() || {};
      if ((cur[cursorKey] || '') !== lastId) throw new Error('Another dashboard tab updated the totals first. Fine, nothing was double counted.');
      for (const [day, agg] of Object.entries(res.days)) { const inc = C.toIncrements(agg, increment); if (Object.keys(inc).length) tx.set(doc(db, 'statsDaily', day), inc, { merge: true }); }
      if (res.contents && Object.keys(res.contents).length) tx.set(doc(db, 'meta', 'contents'), res.contents, { merge: true });
      tx.set(metaRef, { [cursorKey]: newLast, updatedAt: Timestamp.now() }, { merge: true });
    });
    Object.keys(res.days).forEach(d => touched.add(d)); processed += snap.size;
    if (snap.size < 400) break;
  }
  return { touched, processed };
}
async function runRollup(manual) {
  if (rolling || !started) return; rolling = true; updatePill();
  try {
    const a = await rollupStream('downloads', 'ts', 'dl', C.aggregateClicks);
    const b = await rollupStream('uniqueVisitors', 'firstSeen', 'uv', C.aggregateUniques);
    const touched = new Set([...a.touched, ...b.touched]);
    for (const d of touched) { const s = await getDoc(doc(db, 'statsDaily', d)); if (s.exists()) S.days[d] = s.data(); }
    if (a.processed) { const c = await getDoc(doc(db, 'meta', 'contents')); if (c.exists()) S.contents = c.data(); }
    S.lastRollup = new Date(); S.rollupErr = '';
    if (touched.size || manual) renderActive();
    if (manual) toast(touched.size ? 'Statistics updated' : 'Already up to date');
  } catch (e) { S.rollupErr = errMsg(e); if (manual) toast('Update failed'); renderActive(); }
  finally { rolling = false; updatePill(); }
}
$('#btn-refresh').onclick = () => runRollup(true);

function startLive() {
  const q = query(collection(db, 'downloads'), orderBy('ts', 'desc'), limit(100));      // limited live window, never the whole history
  S.unsub = onSnapshot(q, snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data(), _ts: d.data().ts ? d.data().ts.toDate() : new Date() }));
    const fresh = S.seen ? new Set(rows.filter(r => !S.seen.has(r.id)).map(r => r.id)) : new Set();
    S.seen = new Set(rows.map(r => r.id)); S.live = rows; S.liveOk = true; S.liveErr = ''; updatePill(); if (S.tab === 'live') renderLiveList(fresh);
  }, e => { S.liveOk = false; S.liveErr = errMsg(e); updatePill(); if (S.tab === 'live') renderLiveList(new Set()); });
}
function updatePill() {
  const p = $('#live-pill'), b = $('b', p);
  p.className = 'pill ' + (S.liveOk ? 'on' : S.liveErr ? 'err' : 'off'); b.textContent = S.liveOk ? (rolling ? 'LIVE · UPDATING' : 'LIVE') : S.liveErr ? 'OFFLINE' : 'CONNECTING';
}
function tickRel() { $$('[data-ts]').forEach(el => { el.textContent = C.relTime(Date.now() - +el.dataset.ts); }); }

/* ---------------- tabs + period filter ---------------- */
$('#tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); };
function setTab(t) {
  S.tab = t; $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + t; });
  $('#filters').hidden = !['overview', 'rank', 'trends', 'content'].includes(t); renderActive();
}
$('#range').onchange = e => { S.range = e.target.value; $('#custom').hidden = S.range !== 'custom'; renderActive(); };
$('#c-from').onchange = e => { S.custom.from = e.target.value; renderActive(); };
$('#c-to').onchange = e => { S.custom.to = e.target.value; renderActive(); };
const curRange = () => C.rangeFor(S.range, new Date(), S.custom);
const curAgg = () => C.sumRange(S.days, curRange());
function effRange() { const r = curRange(), k = Object.keys(S.days).sort(), t = C.todayKey(); return { from: r.from || k[0] || t, to: r.to || t }; }
const rangeLabel = () => S.range === 'all' ? 'All time' : { today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', last30: 'Last 30 days', thisMonth: 'This month', lastMonth: 'Last month', custom: 'Custom range' }[S.range];
function renderActive() {
  ({ overview: renderOverview, live: renderLive, rank: renderRank, trends: renderTrends, history: renderHistory, content: renderContent, settings: renderSettings }[S.tab] || renderOverview)();
}

/* ---------------- small UI pieces ---------------- */
const skeleton = () => '<div class="skg">' + '<div class="sk"></div>'.repeat(8) + '</div>';
const card = (l, v, s, cls = '') => `<div class="card"><div class="l">${l}</div><div class="v ${cls}">${v}</div><div class="s2">${s || '&nbsp;'}</div></div>`;
const errBanner = () => (S.loadErr || S.rollupErr) ? `<div class="err"><b>Something needs attention:</b><br>${esc(S.loadErr || S.rollupErr)}</div>` : '';
const noData = () => Object.keys(S.days).length ? '' : '<div class="empty">No download clicks have been counted yet.<br>Open your website, click a Download button, then press ↻ (statistics update about every 2 minutes; the Live tab is instant).</div>';
const lab = k => /^\d{4}-\d{2}-\d{2}$/.test(k) ? C.fmtDayKey(k) : /^\d{4}-\d{2}$/.test(k) ? k : k;
function barChart(pts, h = 140) {
  if (!pts.length || pts.every(p => !p.v)) return '<div class="empty" style="margin:0">No activity in this period</div>';
  const max = Math.max(1, ...pts.map(p => p.v)), w = 100 / pts.length;
  const bars = pts.map((p, i) => `<rect x="${(i * w + w * .12).toFixed(2)}" y="${(100 - p.v / max * 100).toFixed(2)}" width="${(w * .76).toFixed(2)}" height="${(p.v / max * 100).toFixed(2)}" rx=".5" fill="currentColor"><title>${esc(lab(p.key))}: ${nf(p.v)}</title></rect>`).join('');
  return `<svg class="svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="height:${h}px">${bars}</svg><div class="axis"><span>${esc(lab(pts[0].key))}</span><span>peak ${nf(max)}</span><span>${esc(lab(pts[pts.length - 1].key))}</span></div>`;
}
function hbars(items, empty = 'No data yet') {
  if (!items.length) return `<div class="empty" style="margin:0">${empty}</div>`;
  const max = Math.max(1, ...items.map(i => i.n));
  return items.slice(0, 10).map(i => `<div class="hb"><span title="${esc(i.name)}">${esc(i.name)}</span><div class="t"><i style="width:${(i.n / max * 100).toFixed(1)}%"></i></div><b>${nf(i.n)}</b></div>`).join('');
}
function seriesFor(eff, pick) {
  let s = C.dailySeries(S.days, eff.from, eff.to, a => typeof pick === 'string' ? a[pick] : pick(a));
  if (s.length > 120) s = C.groupSeries(s, C.weekStart); return s;
}
const poster = cid => (S.keyByCid[cid] && window.posterPath) ? window.posterPath(S.keyByCid[cid]) : 'posters/placeholder.png';
const tagsOf = r => [r.contentType === 'Series' ? '<span class="tag r">Series</span>' : '<span class="tag r">Movie</span>',
  r.season != null ? `<span class="tag">Season ${r.season}</span>` : '', r.episode != null ? `<span class="tag g">Episode ${r.episode}</span>` : '',
  r.quality ? `<span class="tag">${esc(r.quality)}</span>` : '', r.language ? `<span class="tag">🔊 ${esc(r.language)}</span>` : ''].join('');
const rowHTML = (r, isNew) => `<div class="row ${isNew ? 'new' : ''}"><div><b>${esc(C.cleanTitle(r.title))}</b><div class="tags">${tagsOf(r)}</div></div>
  <div class="tm">${C.fmtDate(r._ts)} · ${C.fmtTime(r._ts)}<em data-ts="${r._ts.getTime()}">${C.relTime(Date.now() - r._ts.getTime())}</em></div></div>`;

/* ---------------- Overview ---------------- */
function renderOverview() {
  const el = $('#tab-overview'); if (!S.loaded) return el.innerHTML = skeleton();
  const A = curAgg(), eff = effRange(), n = C.daysBetween(eff.from, eff.to) + 1, t = C.todayKey();
  const tA = S.days[t] || {}, yA = S.days[C.addDays(t, -1)] || {}, mv = C.moviesRanking(A, S.contents)[0], sr = C.seriesRanking(A, S.contents)[0];
  const u = S.range === 'all' ? '' : 'New ';
  el.innerHTML = errBanner() + noData() + '<div class="cards">' +
    card('Total Download Clicks', nf(A.total), rangeLabel()) + card("Today's Clicks", nf(tA.total), 'India time') + card("Yesterday's Clicks", nf(yA.total), 'India time') +
    card('Movie Clicks', nf(A.movie), rangeLabel()) + card('Episode Clicks', nf(A.episode), nf(A.pack) + ' full-season clicks') +
    card(u + 'Unique Visitors', nf(A.uAll), 'approximate') + card(u + 'Unique Movie Visitors', nf(A.uMovie), 'approximate') + card(u + 'Unique Series Visitors', nf(A.uSeries), 'approximate') +
    card('Average Daily Clicks', (A.total / n).toFixed(1), n + ' day' + (n === 1 ? '' : 's')) +
    card('Most Downloaded Movie', mv ? esc(mv.title) : '—', mv ? nf(mv.clicks) + ' clicks' : 'no data yet', 's') +
    card('Most Downloaded Series', sr ? esc(sr.name) : '—', sr ? nf(sr.clicks) + ' clicks' : 'no data yet', 's') + '</div>' +
    `<div class="panel"><h3>Daily download activity</h3>${barChart(seriesFor(eff, 'total'))}</div>` +
    (S.range === 'all' ? '' : '<div class="s2" style="color:var(--dim);font-size:11px">“New” unique visitors = people whose first click happened in this period.</div>');
}

/* ---------------- Live activity ---------------- */
function renderLive() {
  const el = $('#tab-live'); if (!S.loaded) return el.innerHTML = skeleton();
  if (!$('#live-list')) {
    el.innerHTML = `<div class="bar"><span class="pill on"><i></i><b>LIVE</b></span>${['all:All', 'Movie:Movies', 'Series:Series', 'Episode:Episodes'].map(x => { const [v, l] = x.split(':'); return `<button class="chip ${S.liveType === v ? 'on' : ''}" data-lt="${v}">${l}</button>`; }).join('')}
      <input type="search" id="live-q" placeholder="Search title…" value="${esc(S.liveQ)}" style="flex:1;min-width:140px"></div><div id="live-list"></div>
      <div class="s2" style="color:var(--dim);font-size:11px;text-align:center">Shows the latest 100 clicks, newest first. Full history is in the History tab.</div>`;
    el.onclick = e => { const b = e.target.closest('[data-lt]'); if (b) { S.liveType = b.dataset.lt; $$('[data-lt]', el).forEach(x => x.classList.toggle('on', x === b)); renderLiveList(new Set()); } };
    $('#live-q').oninput = e => { S.liveQ = e.target.value; renderLiveList(new Set()); };
  }
  renderLiveList(new Set());
}
function renderLiveList(fresh) {
  const box = $('#live-list'); if (!box) return;
  const rows = S.live.filter(r => C.matchHistory(r, { q: S.liveQ, type: S.liveType }));
  box.innerHTML = (S.liveErr ? `<div class="err">${esc(S.liveErr)}</div>` : '') +
    (rows.length ? rows.map(r => rowHTML(r, fresh.has(r.id))).join('') : '<div class="empty">No clicks to show yet. They appear here the moment someone presses a Download button.</div>');
}

/* ---------------- Rankings ---------------- */
function renderRank() {
  const el = $('#tab-rank'); if (!S.loaded) return el.innerHTML = skeleton();
  const A = curAgg(), tab = S.rankTab; let body = '';
  if (tab === 'movies') {
    const r = C.moviesRanking(A, S.contents);
    body = r.length ? r.map((m, i) => `<div class="row"><div class="rk" style="flex:1;min-width:0"><span class="n">${i + 1}</span><img src="${esc(poster(m.cid))}" alt="" loading="lazy" onerror="this.src='posters/placeholder.png'"><div class="m"><b>${esc(m.title)}</b><small>${nf(m.unique)} unique visitors · ${m.pct.toFixed(1)}% of all clicks</small></div></div><div class="c">${nf(m.clicks)}<small>clicks</small></div></div>`).join('') : '<div class="empty">No movie clicks in this period.</div>';
  } else if (tab === 'series') {
    const r = C.seriesRanking(A, S.contents);
    body = r.length ? r.map((s, i) => `<details class="row"><summary><div class="rk"><span class="n">${i + 1}</span><div class="m"><b>${esc(s.name)}</b><small>${nf(s.episodeClicks)} episode clicks · ${nf(s.unique)} unique visitors${s.top ? ' · top: S' + (s.top.season ?? '?') + ' E' + s.top.episode : ''}</small></div><div class="c">${nf(s.clicks)}<small>clicks · tap to expand</small></div></div></summary>
      <div class="sub">${s.seasonList.map(se => `<div><b style="color:var(--text)">${se.season == null ? 'Season not stated' : 'Season ' + se.season}</b><span>${nf(se.clicks)} clicks</span></div>` +
        se.episodes.map(e => `<div style="padding-left:14px"><span>Episode ${e.episode}</span><span>${nf(e.clicks)} clicks · ${nf(e.unique)} visitors</span></div>`).join('')).join('')}</div></details>`).join('') : '<div class="empty">No series clicks in this period.</div>';
  } else {
    const r = C.episodesRanking(A, S.contents);
    body = r.length ? r.map((e, i) => `<div class="row"><div class="rk"><span class="n">${i + 1}</span><div class="m"><b>${esc(e.show)}</b><small>${e.season != null ? 'Season ' + e.season + ' · ' : ''}Episode ${e.episode} · title not in sheet · ${nf(e.unique)} unique visitors</small></div></div><div class="c">${nf(e.clicks)}<small>clicks</small></div></div>`).join('') : '<div class="empty">No episode clicks in this period.</div>';
  }
  el.innerHTML = errBanner() + `<div class="bar">${['movies:Movies', 'series:Series', 'episodes:Episodes'].map(x => { const [v, l] = x.split(':'); return `<button class="chip ${tab === v ? 'on' : ''}" data-rt="${v}">${l}</button>`; }).join('')}<small style="color:var(--dim)">${rangeLabel()} · sorted by download clicks</small></div>` + body;
  el.onclick = e => { const b = e.target.closest('[data-rt]'); if (b) { S.rankTab = b.dataset.rt; renderRank(); } };
}

/* ---------------- Trends ---------------- */
function renderTrends() {
  const el = $('#tab-trends'); if (!S.loaded) return el.innerHTML = skeleton();
  const A = curAgg(), eff = effRange(), daily = C.dailySeries(S.days, eff.from, eff.to, a => a.total);
  const weekly = C.groupSeries(daily, C.weekStart).map(p => ({ key: p.key, v: p.v })), monthly = C.groupSeries(daily, k => k.slice(0, 7));
  const tot = A.movie + A.episode + A.pack || 1, pc = n => (n / tot * 100).toFixed(1), a1 = A.movie / tot * 100, a2 = a1 + A.episode / tot * 100;
  el.innerHTML = errBanner() + noData() + `<div class="panel"><h3>Daily download activity</h3>${barChart(daily.length > 120 ? C.groupSeries(daily, C.weekStart) : daily)}</div>
  <div class="grid2"><div class="panel"><h3>Weekly activity (weeks start Monday)</h3>${barChart(weekly, 110)}</div><div class="panel"><h3>Monthly trend</h3>${barChart(monthly, 110)}</div></div>
  <div class="grid2"><div class="panel"><h3>Movie clicks vs episode clicks</h3><div class="dwrap"><div class="donut" style="background:conic-gradient(var(--red) 0 ${a1}%,var(--gold) ${a1}% ${a2}%,var(--cyan) ${a2}% 100%)"></div>
    <div class="leg"><div><span class="dot" style="background:var(--red)"></span>Movies <b>${nf(A.movie)}</b> (${pc(A.movie)}%)</div><div><span class="dot" style="background:var(--gold)"></span>Episodes <b>${nf(A.episode)}</b> (${pc(A.episode)}%)</div><div><span class="dot" style="background:var(--cyan)"></span>Full-season links <b>${nf(A.pack)}</b> (${pc(A.pack)}%)</div></div></div></div>
  <div class="panel"><h3>Peak hours (India time)</h3>${barChart(C.hourSeries(A), 110)}</div></div>
  <div class="grid2"><div class="panel"><h3>Most popular video quality</h3>${hbars(Object.entries(A.byQuality).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n), 'Quality is only known for links that state it')}</div>
  <div class="panel"><h3>Most popular language</h3>${hbars(Object.entries(A.byLanguage).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n), 'No language data yet')}</div></div>
  <div class="panel"><h3>Busiest days of the week</h3>${barChart(C.weekdaySeries(daily), 100)}</div>`;
}

/* ---------------- History (cursor pagination, newest first) ---------------- */
const H = { rows: [], cursor: null, done: false, page: 0, busy: false, err: '', scanned: 0, f: {} };
const pageSize = () => matchMedia('(max-width:700px)').matches ? 25 : 50;
function opts(map) { return '<option value="">Any</option>' + Object.keys(map).sort().map(k => `<option>${esc(k)}</option>`).join(''); }
function renderHistory() {
  const el = $('#tab-history'); if (!S.loaded) return el.innerHTML = skeleton();
  if (!$('#h-form')) {
    const A = C.sumRange(S.days, { from: null, to: null });
    el.innerHTML = `<form id="h-form" class="form"><label>Title<input type="search" id="h-q" placeholder="Search…"></label>
      <label>Type<select id="h-type"><option value="">All</option><option value="Movie">Movies</option><option value="Series">Series</option><option value="Episode">Episodes</option></select></label>
      <label>From<input type="date" id="h-from"></label><label>To<input type="date" id="h-to"></label>
      <label>Quality<select id="h-quality">${opts(A.byQuality)}</select></label><label>Language<select id="h-lang">${opts(A.byLanguage)}</select></label>
      <label>Season<input type="number" id="h-season" min="0" placeholder="Any"></label><label>Episode<input type="number" id="h-ep" min="0" placeholder="Any"></label>
      <label>&nbsp;<button class="btn red" type="submit">Apply</button></label></form><div id="h-out"></div>`;
    $('#h-form').onsubmit = e => { e.preventDefault(); histReset(); };
    histReset();
  } else histDraw();
}
function histReset() {
  H.f = { q: $('#h-q').value, type: $('#h-type').value, from: $('#h-from').value, to: $('#h-to').value, quality: $('#h-quality').value, language: $('#h-lang').value, season: $('#h-season').value, episode: $('#h-ep').value };
  Object.assign(H, { rows: [], cursor: null, done: false, page: 0, err: '', scanned: 0 }); histMore(pageSize());
}
async function histMore(need) {
  if (H.busy) return; H.busy = true; histDraw();
  try {
    let scanned = 0;
    while (H.rows.length < need && !H.done && scanned < 600) {
      const cons = [];
      if (H.f.from) cons.push(where('ts', '>=', Timestamp.fromDate(C.dayStart(H.f.from))));
      if (H.f.to) cons.push(where('ts', '<', Timestamp.fromDate(C.dayStart(C.addDays(H.f.to, 1)))));
      cons.push(orderBy('ts', 'desc')); if (H.cursor) cons.push(startAfter(H.cursor));
      const snap = await getDocs(query(collection(db, 'downloads'), ...cons, limit(100)));
      scanned += snap.size; H.scanned += snap.size; if (snap.size < 100) H.done = true; if (snap.size) H.cursor = snap.docs[snap.size - 1];
      snap.docs.forEach(d => { const r = { id: d.id, ...d.data(), _ts: d.data().ts.toDate() }; if (C.matchHistory(r, H.f)) H.rows.push(r); });
    }
  } catch (e) { H.err = errMsg(e); }
  H.busy = false; histDraw();
}
function histDraw() {
  const out = $('#h-out'); if (!out) return; const n = pageSize(), rows = H.rows.slice(H.page * n, (H.page + 1) * n), more = H.rows.length > (H.page + 1) * n || !H.done;
  out.innerHTML = (H.err ? `<div class="err">${esc(H.err)}</div>` : '') + (rows.length ? rows.map(r => rowHTML(r, false)).join('') : H.busy ? skeleton() : '<div class="empty">No matching download clicks.</div>') +
    `<div class="pg"><button class="btn" id="h-prev" ${H.page === 0 || H.busy ? 'disabled' : ''}>← Newer</button><span>Page ${H.page + 1} · scanned ${nf(H.scanned)} records</span><button class="btn" id="h-next" ${!more || H.busy ? 'disabled' : ''}>Older →</button></div>`;
  $('#h-prev').onclick = () => { H.page--; histDraw(); };
  $('#h-next').onclick = async () => { await histMore((H.page + 2) * n); if (H.rows.length > (H.page + 1) * n) { H.page++; histDraw(); } };
}

/* ---------------- Individual content ---------------- */
function searchIndex() {
  const m = new Map();
  Object.entries(S.contents).forEach(([cid, c]) => { if (c.type === 'Series') { const k = c.showKey || C.showKeyOf(c.show); m.set('s:' + k, { kind: 'show', id: k, label: c.show || C.cleanTitle(c.title) }); } else m.set('m:' + cid, { kind: 'movie', id: cid, label: C.cleanTitle(c.title) }); });
  Object.keys(window.META || {}).forEach(key => { const d = MV.describe(key, '', '', window.META[key]);
    if (d.contentType === 'Series') { const k = C.showKeyOf(d.show); if (!m.has('s:' + k)) m.set('s:' + k, { kind: 'show', id: k, label: d.show }); } else if (!m.has('m:' + d.contentId)) m.set('m:' + d.contentId, { kind: 'movie', id: d.contentId, label: C.cleanTitle(key) }); });
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
}
function renderContent() {
  const el = $('#tab-content'); if (!S.loaded) return el.innerHTML = skeleton();
  if (!$('#c-q')) {
    el.innerHTML = `<div class="bar"><input type="search" id="c-q" placeholder="Search a movie or series…" style="flex:1;min-width:200px"></div><div id="c-sug" class="sug"></div><div id="c-out"></div>`;
    $('#c-q').oninput = e => { S.q = e.target.value; contentSug(); };
    el.onclick = e => { const b = e.target.closest('[data-pick]'); if (b) { S.sel = b.dataset.pick; contentDetail(); } };
  }
  contentSug(); contentDetail();
}
function contentSug() {
  const q = (S.q || '').toLowerCase(), list = searchIndex().filter(i => !q || i.label.toLowerCase().includes(q)).slice(0, q ? 14 : 10);
  $('#c-sug').innerHTML = list.map(i => `<button class="chip ${S.sel === i.kind + ':' + i.id ? 'on' : ''}" data-pick="${esc(i.kind + ':' + i.id)}">${esc(i.label)}${i.kind === 'show' ? ' · series' : ''}</button>`).join('') || '<span class="s2">No match</span>';
}
const dayAgg = (from, to) => C.sumRange(S.days, { from, to });
function contentDetail() {
  const out = $('#c-out'); if (!out) return;
  if (!S.sel) return out.innerHTML = '<div class="empty">Pick a title above to see its own statistics.</div>';
  const [kind, id] = [S.sel.slice(0, S.sel.indexOf(':')), S.sel.slice(S.sel.indexOf(':') + 1)], t = C.todayKey(), eff = effRange();
  const all = dayAgg(null, null), wk = dayAgg(C.addDays(t, -6), t), mo = dayAgg(C.monthStart(t), t);
  let cids, name, unique, extra = '';
  if (kind === 'movie') { cids = [id]; name = (S.contents[id] ? C.cleanTitle(S.contents[id].title) : (S.keyByCid[id] ? C.cleanTitle(S.keyByCid[id]) : id)); unique = all.uByContent[id] || 0; }
  else {
    cids = Object.entries(S.contents).filter(([, v]) => v.type === 'Series' && (v.showKey || C.showKeyOf(v.show)) === id).map(([c]) => c);
    const sr = C.seriesRanking(all, S.contents).find(s => s.key === id); name = (sr && sr.name) || id; unique = all.uByShow[id] || 0;
    if (sr) { const topSeason = [...sr.seasonList].sort((a, b) => b.clicks - a.clicks)[0];
      extra = `<div class="grid2"><div class="panel"><h3>Season-wise clicks</h3>${hbars(sr.seasonList.map(s => ({ name: s.season == null ? 'Season not stated' : 'Season ' + s.season, n: s.clicks })))}</div>
        <div class="panel"><h3>Episode-wise clicks</h3>${hbars(sr.episodes.map(e => ({ name: (e.season != null ? 'S' + e.season + ' ' : '') + 'Episode ' + e.episode, n: e.clicks })), 'No episode clicks yet')}</div></div>
        <div class="cards">${card('Most popular episode', sr.top ? (sr.top.season != null ? 'S' + sr.top.season + ' ' : '') + 'E' + sr.top.episode : '—', sr.top ? nf(sr.top.clicks) + ' clicks' : '', 's')}${card('Most popular season', topSeason ? (topSeason.season == null ? 'Not stated' : 'Season ' + topSeason.season) : '—', topSeason ? nf(topSeason.clicks) + ' clicks' : '', 's')}</div>`; }
  }
  const pick = a => cids.reduce((s, c) => s + ((a.byContent || {})[c] || 0), 0), sum = A => cids.reduce((s, c) => s + (A.byContent[c] || 0), 0);
  const sumPref = map => { const m = {}; cids.forEach(c => C.prefixed(map, c).forEach(x => { m[x.name] = (m[x.name] || 0) + x.n; })); return Object.entries(m).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n); };
  let trend = C.dailySeries(S.days, eff.from, eff.to, pick); if (trend.length > 120) trend = C.groupSeries(trend, C.weekStart);
  out.innerHTML = `<h2 style="font:600 24px Oswald,sans-serif;margin:16px 0 12px">${esc(name)}</h2><div class="cards">${card('Total clicks (all time)', nf(sum(all)), '')}${card('Unique visitors', nf(unique), 'approximate')}${card("Today's clicks", nf(((S.days[t] || {}).byContent ? sum(S.days[t]) : 0)), '')}${card('This week', nf(sum(wk)), 'last 7 days')}${card('This month', nf(sum(mo)), '')}</div>${extra}
    <div class="panel"><h3>Activity — ${rangeLabel()}</h3>${barChart(trend)}</div>
    <div class="grid2"><div class="panel"><h3>Popular qualities</h3>${hbars(sumPref(all.cq), 'No quality data for this title')}</div><div class="panel"><h3>Popular languages</h3>${hbars(sumPref(all.cl), 'No language data for this title')}</div></div>`;
  contentSug();
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  const el = $('#tab-settings');
  el.innerHTML = `<div class="panel"><h3>Settings</h3><div class="kv"><span>Signed in as</span><b>${esc(S.user ? S.user.email : '')}</b>
    <span>Firebase connection</span><b>${S.liveOk ? '🟢 Connected (live)' : S.liveErr ? '🔴 ' + esc(S.liveErr) : '🟡 Connecting…'}</b>
    <span>Dashboard version</span><b>${VERSION}</b><span>Totals last updated</span><b>${S.lastRollup ? C.fmtDate(S.lastRollup) + ' · ' + C.fmtTime(S.lastRollup) + ' IST' : 'not yet'}</b>
    <span>Days of data</span><b>${nf(Object.keys(S.days).length)}</b><span>Time zone</span><b>India (IST, UTC+5:30)</b></div>
    ${S.rollupErr ? `<div class="err" style="margin-top:14px">${esc(S.rollupErr)}</div>` : ''}
    <p style="margin:16px 0;font-size:12px;color:var(--mut);line-height:1.6">The only authorised account is fixed in <code>firestore.rules</code> and cannot be changed from this page.</p>
    <button class="btn red" id="s-out">Logout</button></div>`;
  $('#s-out').onclick = () => signOut(auth);
}
