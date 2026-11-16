// admin-core.js — pure calculation helpers for the dashboard (no Firebase, no page). All dates are India time (IST).
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const p2 = n => (n < 10 ? '0' : '') + n;

export function istParts(d) {
  const t = new Date(d.getTime() + 19800000);
  return { day: t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate()), hour: t.getUTCHours(),
           time: p2(t.getUTCHours()) + ':' + p2(t.getUTCMinutes()) + ':' + p2(t.getUTCSeconds()) };
}
export const todayKey = (now = new Date()) => istParts(now).day;
export function addDays(key, n) { const d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const dayStart = key => new Date(key + 'T00:00:00+05:30');
export const monthStart = key => key.slice(0, 7) + '-01';
export const showKeyOf = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function rangeFor(name, now = new Date(), custom = {}) {
  const t = todayKey(now);
  switch (name) {
    case 'today': return { from: t, to: t };
    case 'yesterday': { const y = addDays(t, -1); return { from: y, to: y }; }
    case 'last7': return { from: addDays(t, -6), to: t };
    case 'last30': return { from: addDays(t, -29), to: t };
    case 'thisMonth': return { from: monthStart(t), to: t };
    case 'lastMonth': { const e = addDays(monthStart(t), -1); return { from: monthStart(e), to: e }; }
    case 'custom': return { from: custom.from || null, to: custom.to || null };
    default: return { from: null, to: null };
  }
}

/* ---------- aggregation (what the rollup saves) ---------- */
export function newAgg() {
  return { total: 0, movie: 0, episode: 0, pack: 0, byContent: {}, byEpisode: {}, byQuality: {}, byLanguage: {}, byHour: {},
           cq: {}, cl: {}, uAll: 0, uMovie: 0, uSeries: 0, uByContent: {}, uByShow: {}, uByEpisode: {} };
}
export function aggregateClicks(rows) {
  const days = {}, contents = {};
  rows.forEach(r => {
    const p = istParts(r._ts), a = days[p.day] || (days[p.day] = newAgg());
    a.total++;
    if (r.kind === 'episode') a.episode++; else if (r.kind === 'pack') a.pack++; else a.movie++;
    inc(a.byContent, r.contentId); inc(a.byHour, String(p.hour));
    if (r.kind === 'episode' && r.episode != null) inc(a.byEpisode, r.contentId + '__e' + r.episode);
    if (r.quality) { inc(a.byQuality, r.quality); inc(a.cq, r.contentId + '~' + r.quality); }
    if (r.language) { inc(a.byLanguage, r.language); inc(a.cl, r.contentId + '~' + r.language); }
    const c = { title: r.title, type: r.contentType };
    if (r.show) { c.show = r.show; c.showKey = showKeyOf(r.show); }
    if (r.season != null) c.season = r.season;
    contents[r.contentId] = c;
  });
  return { days, contents };
}
export function aggregateUniques(rows) {
  const days = {};
  rows.forEach(r => {
    const k = istParts(r._ts).day, a = days[k] || (days[k] = newAgg());
    if (r.scope === 'all') a.uAll++;
    else if (r.scope === 'type') { if (r.key === 'movie') a.uMovie++; else if (r.key === 'series') a.uSeries++; }
    else if (r.scope === 'content') inc(a.uByContent, r.key);
    else if (r.scope === 'show') inc(a.uByShow, r.key);
    else if (r.scope === 'episode') inc(a.uByEpisode, r.key);
  });
  return { days, contents: null };
}
// numbers -> increment(n); zeros and empty maps are dropped so we only write what changed
export function toIncrements(obj, incFn) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') { if (v !== 0) out[k] = incFn(v); }
    else if (v && typeof v === 'object') { const s = toIncrements(v, incFn); if (Object.keys(s).length) out[k] = s; }
  }
  return out;
}
export function mergeAgg(dst, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (typeof v === 'number') dst[k] = (dst[k] || 0) + v;
    else if (v && typeof v === 'object') mergeAgg(dst[k] || (dst[k] = {}), v);
  }
  return dst;
}
export function sumRange(days, { from, to }) {
  const out = newAgg();
  for (const k of Object.keys(days)) if ((!from || k >= from) && (!to || k <= to)) mergeAgg(out, days[k]);
  return out;
}

/* ---------- rankings ---------- */
export const cleanTitle = t => String(t || '').replace(/\s*\(\d{4}\)\s*$/, '');
const nameOf = (c, cid) => cleanTitle(c && c.title ? c.title : cid);
export function moviesRanking(A, contents) {
  const total = A.total || 0;
  return Object.entries(A.byContent).filter(([cid]) => (contents[cid] || {}).type === 'Movie')
    .map(([cid, n]) => ({ cid, title: nameOf(contents[cid], cid), clicks: n, unique: A.uByContent[cid] || 0, pct: total ? n / total * 100 : 0 }))
    .sort((a, b) => b.clicks - a.clicks || a.title.localeCompare(b.title));
}
export function seriesRanking(A, contents) {
  const shows = {}, keyOf = c => c.showKey || showKeyOf(c.show || c.title);
  for (const [cid, n] of Object.entries(A.byContent)) {
    const c = contents[cid]; if (!c || c.type !== 'Series') continue;
    const key = keyOf(c);
    const s = shows[key] || (shows[key] = { key, name: c.show || nameOf(c, cid), clicks: 0, episodeClicks: 0, unique: A.uByShow[key] || 0, seasons: {}, episodes: [], cids: [] });
    s.clicks += n; s.cids.push(cid);
    const sn = c.season == null ? 0 : c.season;
    (s.seasons[sn] || (s.seasons[sn] = { season: c.season == null ? null : c.season, clicks: 0, episodes: [] })).clicks += n;
  }
  for (const [ek, n] of Object.entries(A.byEpisode)) {
    const m = ek.match(/^(.*)__e(\d+)$/); if (!m) continue;
    const c = contents[m[1]]; if (!c || c.type !== 'Series') continue;
    const s = shows[keyOf(c)]; if (!s) continue;
    const ep = { cid: m[1], episode: +m[2], season: c.season == null ? null : c.season, clicks: n, unique: A.uByEpisode[ek] || 0 };
    s.episodeClicks += n; s.episodes.push(ep); s.seasons[c.season == null ? 0 : c.season].episodes.push(ep);
  }
  return Object.values(shows).map(s => {
    s.episodes.sort((a, b) => b.clicks - a.clicks); s.top = s.episodes[0] || null;
    s.seasonList = Object.values(s.seasons).sort((a, b) => (a.season || 0) - (b.season || 0));
    s.seasonList.forEach(x => x.episodes.sort((a, b) => a.episode - b.episode));
    return s;
  }).sort((a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name));
}
export function episodesRanking(A, contents) {
  const out = [];
  for (const [ek, n] of Object.entries(A.byEpisode)) {
    const m = ek.match(/^(.*)__e(\d+)$/); if (!m) continue;
    const c = contents[m[1]] || {};
    out.push({ key: ek, cid: m[1], show: c.show || nameOf(c, m[1]), season: c.season == null ? null : c.season, episode: +m[2], clicks: n, unique: A.uByEpisode[ek] || 0 });
  }
  return out.sort((a, b) => b.clicks - a.clicks || a.show.localeCompare(b.show) || a.episode - b.episode);
}
export function prefixed(map, cid) {      // cq / cl maps -> [{name, n}] for one content
  const p = cid + '~';
  return Object.entries(map).filter(([k]) => k.startsWith(p)).map(([k, n]) => ({ name: k.slice(p.length), n })).sort((a, b) => b.n - a.n);
}

/* ---------- chart series ---------- */
export function dayList(from, to) { const o = []; for (let k = from; k <= to; k = addDays(k, 1)) o.push(k); return o; }
export const dailySeries = (days, from, to, pick) => dayList(from, to).map(k => ({ key: k, v: days[k] ? pick(days[k]) || 0 : 0 }));
export function weekStart(k) { const dow = (new Date(k + 'T00:00:00Z').getUTCDay() + 6) % 7; return addDays(k, -dow); }
export function groupSeries(series, keyFn) {
  const m = new Map(); series.forEach(p => { const g = keyFn(p.key); m.set(g, (m.get(g) || 0) + p.v); });
  return [...m].map(([key, v]) => ({ key, v }));
}
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function weekdaySeries(series) {
  const t = [0, 0, 0, 0, 0, 0, 0]; series.forEach(p => { t[(new Date(p.key + 'T00:00:00Z').getUTCDay() + 6) % 7] += p.v; });
  return t.map((v, i) => ({ key: WEEKDAYS[i], v }));
}
export const hourSeries = A => Array.from({ length: 24 }, (_, h) => ({ key: p2(h) + ':00', v: A.byHour[String(h)] || 0 }));

/* ---------- filters + formatting ---------- */
export function matchHistory(r, f) {
  const q = (f.q || '').trim().toLowerCase();
  if (q && !(String(r.title || '').toLowerCase().includes(q) || String(r.show || '').toLowerCase().includes(q))) return false;
  if (f.type === 'Movie' && r.contentType !== 'Movie') return false;
  if (f.type === 'Series' && r.contentType !== 'Series') return false;
  if (f.type === 'Episode' && r.kind !== 'episode') return false;
  if (f.quality && r.quality !== f.quality) return false;
  if (f.language && r.language !== f.language) return false;
  if (f.season !== '' && f.season != null && r.season !== Number(f.season)) return false;
  if (f.episode !== '' && f.episode != null && r.episode !== Number(f.episode)) return false;
  return true;
}
export function relTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return 'Just now';
  const m = Math.round(s / 60); if (m < 60) return m <= 1 ? '1 minute ago' : m + ' minutes ago';
  const h = Math.round(m / 60); if (h < 24) return h === 1 ? '1 hour ago' : h + ' hours ago';
  const d = Math.round(h / 24); return d === 1 ? 'Yesterday' : d + ' days ago';
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(d) { const t = new Date(d.getTime() + 19800000); return p2(t.getUTCDate()) + ' ' + MON[t.getUTCMonth()] + ' ' + t.getUTCFullYear(); }
export function fmtTime(d) {
  const t = new Date(d.getTime() + 19800000), h = t.getUTCHours();
  return p2(h % 12 || 12) + ':' + p2(t.getUTCMinutes()) + ':' + p2(t.getUTCSeconds()) + ' ' + (h < 12 ? 'AM' : 'PM');
}
export const fmtDayKey = k => { const [y, m, d] = k.split('-'); return d + ' ' + MON[+m - 1] + (k.length ? ' ' + y.slice(2) : ''); };
