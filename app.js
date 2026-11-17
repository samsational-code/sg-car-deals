// Dashboard: loads the listings the scan saved, rates them in the browser, and re-rates
// whenever you change the COE price or an assumption. Nothing you type leaves this device.

import { rateAll, DEFAULT_SETTINGS, REFERENCE } from './lib/engine.js';
import { parseListingPage } from './lib/parse.js';
import { mergeListings, serialiseListings } from './lib/store.js';
import { decodePayload, sanitise } from './lib/transfer.js';
import { FIELDS } from './lib/capture.js';

const $ = (id) => document.getElementById(id);
const RATINGS = ['Exceptional', 'Attractive', 'Fair', 'Overpriced', 'Avoid'];
const FRESH_DAYS = 3;          // listings not seen by a scan for longer than this are hidden

const store = {
  get(key, fallback) { try { const v = localStorage.getItem('scd.' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('scd.' + key, JSON.stringify(value)); } catch { /* private mode: carry on without saving */ } },
};

const state = {
  settings: { ...DEFAULT_SETTINGS, ...store.get('settings', {}) },
  view: { ratings: [], q: '', sort: 'score', hideLow: false, ...store.get('view', {}) },
  imported: store.get('imported', []),
  lastCapture: store.get('lastCapture', null),
  token: store.get('token', ''), autoPublish: store.get('autoPublish', false),
  models: [], guide: [], scanned: [], status: null, updated: null,
  rated: [],
};

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (x) => (x == null ? '–' : 'S$' + Math.round(x).toLocaleString('en-SG'));
const sgToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const niceDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const safeUrl = (u) => (typeof u === 'string' && u.startsWith('https://www.sgcarmart.com/') ? u : null);

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

async function getJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

// ---------- data ----------

async function loadData({ announce = false } = {}) {
  try {
    const [models, guide, listings, status] = await Promise.all([
      getJson('data/models.json'), getJson('data/price_guide.json'),
      getJson('data/listings.json').catch(() => ({ listings: [] })),
      getJson('data/status.json').catch(() => null),
    ]);
    state.models = models.models; state.guide = guide.rows;
    state.scanned = listings.listings || []; state.updated = listings.updated || null; state.status = status;
    if (announce) toast('Listings reloaded.');
  } catch (e) {
    showBanner('bad', `Could not load the data files (${e.message}). If you are offline, the last copy is shown when there is one.`);
  }
  rerate();
}

function allListings() {
  const today = sgToday();
  const byId = new Map();
  for (const l of state.scanned) byId.set(l.id, { ...l, origin: 'scan' });
  for (const l of state.imported) {
    const old = byId.get(l.id);
    if (!old || (l.last_seen || '') > (old.last_seen || '')) byId.set(l.id, { ...l, origin: 'import' });
  }
  const starter = !!(state.status && state.status.seed);       // starter data is shown however old it is
  return [...byId.values()].filter((l) => l.status !== 'sold' && l.last_seen && (starter || daysBetween(l.last_seen, today) <= FRESH_DAYS));
}

function rerate() {
  const listings = allListings();
  state.rated = rateAll(listings, { settings: state.settings, models: state.models, guide: state.guide, today: sgToday() });
  render();
}

// ---------- rendering ----------

function showBanner(kind, html) {
  const b = $('banner');
  if (!html) { b.hidden = true; return; }
  b.className = 'banner ' + kind; b.innerHTML = html; b.hidden = false;
}

function renderStatus() {
  const s = state.status, today = sgToday();
  const n = state.scanned.length;
  const mine = state.imported.filter((l) => daysBetween(l.last_seen, today) <= FRESH_DAYS).length;
  const local = mine ? ` · ${mine} on this device, not yet published` : '';
  if (!s) { $('scan-line').textContent = (n ? `${n} listings stored` : 'No listings yet') + local; showBanner(null); return; }
  const when = s.finished ? new Date(s.finished).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' }) : '';
  const fromBrowser = s.source === 'browser';
  $('scan-line').textContent = (s.seed ? 'Starter data from 14 Nov 2026.'
    : s.ok ? `Updated ${when} SGT${fromBrowser ? ' from your browser' : ''} · ${s.listings_found} cars read` : `Shared listings: ${n}`) + local;
  const notes = (s.searches || []).filter((x) => x.note).map((x) => esc(x.note));
  const how = 'Open <b>Get new listings</b> below for the one-click way to load them from your own browser.';
  if (mine && !s.ok) { showBanner(null); return; }
  if (s.seed) { showBanner('info', `Showing starter data: one page saved by hand on 14 Nov 2026, mostly vans. ${how}`); return; }
  if (s.stopped || (s.github_job && s.github_job.stopped && !s.ok)) { showBanner('warn', `SGCarMart refuses the automatic scan from GitHub's servers (${esc(s.stopped || s.github_job.stopped)}). ${how}`); return; }
  if (!s.ok) { showBanner('bad', `The last update read no listings. ${[...(s.messages || []).map(esc), ...notes].join(' ')}`); return; }
  const age = state.updated ? daysBetween(state.updated.slice(0, 10), today) : 0;
  if (age > 2) { showBanner('warn', `The shared listings are ${age} days old. ${how}`); return; }
  if (notes.length) { showBanner('info', notes.join(' ')); return; }
  showBanner(null);
}

function renderCoe() {
  const s = state.settings;
  if (document.activeElement !== $('coeA')) $('coeA').value = s.coeA;
  if (document.activeElement !== $('coeB')) $('coeB').value = s.coeB;
  $('parityA').textContent = `Parity ${money(s.coeA / 10)} a year`;
  $('parityB').textContent = `Parity ${money(s.coeB / 10)} a year`;
  $('coe-reset').hidden = s.coeA === REFERENCE.coe.A && s.coeB === REFERENCE.coe.B;
}

function renderSettings() {
  const s = state.settings;
  const set = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
  set('s-rate', +(s.rate * 100).toFixed(2)); set('s-km', s.annualKm); set('s-petrol', s.petrol); set('s-elec', s.electricity);
  set('s-erp', s.erpPerYear); set('s-park', s.parkingPerYear); set('s-pass', Math.round(s.passThrough * 100));
}

const SORTS = {
  score: (a, b) => b.v.score - a.v.score,
  gap: (a, b) => (b.v.gap_pct ?? -999) - (a.v.gap_pct ?? -999),
  depn: (a, b) => a.v.depn - b.v.depn,
  tco: (a, b) => a.v.tco - b.v.tco,
  price: (a, b) => a.listing.price - b.listing.price,
  new: (a, b) => (b.listing.posted || b.listing.first_seen || '').localeCompare(a.listing.posted || a.listing.first_seen || ''),
};

function render() {
  renderStatus(); renderCoe(); renderSettings();
  const view = state.view;
  const rated = state.rated.filter((r) => r.v.rated);
  const unrated = state.rated.length - rated.length;
  const commercial = state.rated.filter((r) => !r.v.rated && r.v.reason === 'commercial').length;

  const pool = rated.filter((r) => !(view.hideLow && r.v.confidence === 'low'));
  const counts = Object.fromEntries(RATINGS.map((k) => [k, pool.filter((r) => r.v.rating === k).length]));
  $('chips').innerHTML = RATINGS.map((k) => `<button type="button" class="chip r-${k.toLowerCase()}" aria-pressed="${view.ratings.includes(k)}" data-rating="${k}"><span class="dot"></span>${k} <b>${counts[k]}</b></button>`).join('');

  const q = view.q.trim().toLowerCase();
  let shown = pool.filter((r) => (!view.ratings.length || view.ratings.includes(r.v.rating)) &&
    (!q || `${r.listing.title} ${r.listing.dealer || ''} ${r.v.model_name}`.toLowerCase().includes(q)));
  shown.sort(SORTS[view.sort] || SORTS.score);

  const bits = [`${shown.length} of ${rated.length} rated cars`];
  if (commercial) bits.push(`${commercial} vans and trucks not rated`);
  if (unrated - commercial > 0) bits.push(`${unrated - commercial} skipped (no price, depreciation or COE shown)`);
  $('count').textContent = bits.join(' · ');

  $('q').value = view.q; $('sort').value = view.sort; $('hide-low').checked = view.hideLow;
  $('import-clear').hidden = !state.imported.length;
  renderShare();

  if (!shown.length) {
    $('list').innerHTML = `<p class="empty">${rated.length ? 'No cars match these filters.' : 'No rated cars yet. Open "Get new listings from SGCarMart" below.'}</p>`;
    return;
  }
  $('list').innerHTML = shown.slice(0, 300).map(card).join('');
}

function card({ listing: l, v }) {
  const url = safeUrl(l.url);
  const today = sgToday();
  const facts = [
    l.reg ? `Reg ${niceDate(l.reg)}` : null,
    `${v.years_left.toFixed(1)} yrs COE left${v.renewed ? ' (renewed)' : ''}`,
    l.mileage ? `${l.mileage.toLocaleString('en-SG')} km` : 'Mileage not shown',
    l.owners ? `${l.owners} owner${l.owners > 1 ? 's' : ''}` : null,
    l.dealer ? esc(l.dealer) : null,
  ].filter(Boolean);
  const tags = [];
  if (l.first_seen && l.first_seen === today && !(state.status && state.status.seed)) tags.push('<span class="tag new">New today</span>');
  const p = l.prices || [];
  if (p.length > 1) {
    const prev = p[p.length - 2][1], diff = l.price - prev;
    tags.push(`<span class="tag ${diff < 0 ? 'drop' : 'rise'}">${diff < 0 ? 'Price cut' : 'Price up'} ${money(Math.abs(diff))} on ${niceDate(p[p.length - 1][0])}</span>`);
  }
  if (l.origin === 'import') tags.push('<span class="tag">Not yet published</span>');
  if (!l.in_last_scan && l.origin === 'scan') tags.push(`<span class="tag">Last seen ${niceDate(l.last_seen)}</span>`);
  if (v.confidence !== 'high') tags.push(`<span class="tag">${v.confidence === 'low' ? 'Low' : 'Medium'} confidence</span>`);

  const gap = v.gap_pct == null ? '<span class="muted">no benchmark</span>'
    : `<b class="${v.gap_pct >= 0 ? 'good' : 'bad'}">${Math.abs(v.gap_pct).toFixed(1)}% ${v.gap_pct >= 0 ? 'below' : 'above'}</b>`;
  const c = v.costs;
  const costRows = [['Depreciation', c.depreciation], ['Servicing', c.servicing], ['Repair reserve', c.repairs], ['Insurance', c.insurance],
    ['Road tax', c.road_tax], [l.fuel === 'electric' ? 'Electricity' : 'Fuel', c.energy], ['Return forgone on the money', c.capital], ['ERP', c.erp], ['Parking', c.parking]]
    .map(([k, x]) => `<tr><td>${k}</td><td>${x == null ? 'not known' : money(x)}</td></tr>`).join('');
  const scoreNames = { price: 'Price vs fair value', depreciation: 'Depreciation', reliability: 'Reliability', maintenance: 'Servicing and repairs',
    coe_window: 'COE left', parts: 'Parts', parf: 'PARF', mileage: 'Mileage', battery: 'Battery cover' };
  const scoreRows = Object.entries(v.scores).map(([k, x]) => `<tr><td>${scoreNames[k]}</td><td><span class="bar"><i style="width:${x}%"></i></span>${x}</td></tr>`).join('');
  const history = p.length > 1 ? `<p class="hist">Price history: ${p.map(([d, x]) => `${niceDate(d)} ${money(x)}`).join(' → ')}</p>` : '';

  return `<article class="card r-${v.rating.toLowerCase()}">
  <div class="card-top">
    <span class="badge"><span class="dot"></span>${v.rating}</span>
    <span class="score" title="Deal score, 0 to 100">${Math.round(v.score)}<small>/100</small></span>
  </div>
  <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(l.title)}</a>` : esc(l.title)}</h3>
  <p class="facts">${facts.join(' · ')}</p>
  ${tags.length ? `<p class="tags">${tags.join('')}</p>` : ''}
  <dl class="nums">
    <div><dt>Asking</dt><dd>${money(l.price)}</dd></div>
    <div><dt>Depreciation</dt><dd>${money(v.depn)}<small>/yr</small></dd></div>
    <div><dt>Model norm</dt><dd>${v.fair_depn == null ? '–' : money(v.fair_depn)}${v.fair_depn == null ? '' : '<small>/yr</small>'}</dd></div>
    <div><dt>Vs fair value</dt><dd>${gap}</dd></div>
    <div><dt>Pay at most</dt><dd>${v.max_price == null ? '–' : money(v.max_price)}</dd></div>
    <div><dt>COE parity</dt><dd>${v.parity_ratio.toFixed(2)}×<small> Cat ${v.coe_cat || '?'}</small></dd></div>
  </dl>
  <p class="why">${esc(v.why)}</p>
  <details class="more">
    <summary>Cost and score detail</summary>
    <div class="cols">
      <table><caption>Cost per year: ${money(v.tco)}</caption>${costRows}</table>
      <table><caption>Score parts (0 to 100 each)</caption>${scoreRows}</table>
    </div>
    <p class="hist">Fair value ${money(v.fair_value)} · PARF value at COE end ${money(v.paper_value)} · Cost to the end of the COE ${money(v.remaining_cost)}
      · COE category ${v.coe_cat || 'unknown'} (${esc(v.coe_cat_basis)})${v.guide ? ` · Norm at 4 Nov 2026 COE ${money(v.guide.depn)}/yr from ${v.guide.listings} cars` : ''}${v.n_comparables ? ` · ${v.n_comparables} similar cars listed now` : ''}</p>
    ${history}
  </details>
</article>`;
}

// ---------- events ----------

function saveSettings() { store.set('settings', state.settings); rerate(); }
function saveView() { store.set('view', state.view); render(); }

function numInput(id, apply, { min = 0, max = Infinity } = {}) {
  $(id).addEventListener('input', () => {
    const x = Number($(id).value);
    if ($(id).value === '' || !Number.isFinite(x) || x < min || x > max) return;   // wait for a sensible number
    apply(x); saveSettings();
  });
}

function wire() {
  numInput('coeA', (x) => { state.settings.coeA = x; }, { min: 10000, max: 400000 });
  numInput('coeB', (x) => { state.settings.coeB = x; }, { min: 10000, max: 400000 });
  $('coe-reset').addEventListener('click', () => { state.settings.coeA = REFERENCE.coe.A; state.settings.coeB = REFERENCE.coe.B; saveSettings(); });
  numInput('s-rate', (x) => { state.settings.rate = x / 100; }, { max: 20 });
  numInput('s-km', (x) => { state.settings.annualKm = x; }, { max: 100000 });
  numInput('s-petrol', (x) => { state.settings.petrol = x; }, { max: 10 });
  numInput('s-elec', (x) => { state.settings.electricity = x; }, { max: 5 });
  numInput('s-erp', (x) => { state.settings.erpPerYear = x; }, { max: 20000 });
  numInput('s-park', (x) => { state.settings.parkingPerYear = x; }, { max: 20000 });
  numInput('s-pass', (x) => { state.settings.passThrough = x / 100; }, { max: 150 });
  document.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => { state.settings.rate = Number(b.dataset.rate) / 100; saveSettings(); }));
  $('s-reset').addEventListener('click', () => { state.settings = { ...DEFAULT_SETTINGS, coeA: state.settings.coeA, coeB: state.settings.coeB }; saveSettings(); toast('Assumptions reset.'); });

  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rating]'); if (!b) return;
    const k = b.dataset.rating, r = state.view.ratings;
    state.view.ratings = r.includes(k) ? r.filter((x) => x !== k) : [...r, k];
    saveView();
  });
  $('q').addEventListener('input', () => { state.view.q = $('q').value; store.set('view', state.view); renderListOnly(); });
  $('sort').addEventListener('change', () => { state.view.sort = $('sort').value; saveView(); });
  $('hide-low').addEventListener('change', () => { state.view.hideLow = $('hide-low').checked; saveView(); });
  $('refresh').addEventListener('click', async () => { $('refresh').disabled = true; await loadData({ announce: true }); $('refresh').disabled = false; });

  $('files').addEventListener('change', importFiles);
  $('import-clear').addEventListener('click', () => { state.imported = []; store.set('imported', []); $('import-msg').textContent = 'Removed.'; rerate(); });

  $('get-new').addEventListener('click', () => { $('get').open = true; $('get').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('gh-token').addEventListener('change', () => { state.token = $('gh-token').value.trim(); store.set('token', state.token); renderShare(); });
  $('gh-repo').addEventListener('change', () => { store.set('repo', $('gh-repo').value.trim()); renderShare(); });
  $('auto-publish').addEventListener('change', () => { state.autoPublish = $('auto-publish').checked; store.set('autoPublish', state.autoPublish); });
  $('publish').addEventListener('click', () => publish());
}

// Typing in the search box must not rebuild the box itself.
function renderListOnly() { const q = $('q'), pos = q.selectionStart; render(); q.focus(); try { q.setSelectionRange(pos, pos); } catch { /* not supported for this input type */ } }

/** Adds listings read on this device (scanner or saved page) to the local, unpublished set. */
function addLocal(listings) {
  const today = sgToday();
  const byId = new Map(state.imported.map((l) => [l.id, l]));
  let added = 0;
  for (const l of listings) {
    if (l.id == null) continue;
    const old = byId.get(l.id);
    const prices = old && Array.isArray(old.prices) ? [...old.prices] : [];
    if (l.price && (!prices.length || prices[prices.length - 1][1] !== l.price)) prices.push([today, l.price]);
    byId.set(l.id, { ...l, first_seen: old ? old.first_seen : today, last_seen: today, prices, in_last_scan: true });
    added++;
  }
  state.imported = [...byId.values()].filter((l) => daysBetween(l.last_seen, today) <= FRESH_DAYS);
  store.set('imported', state.imported);
  return added;
}

async function importFiles(e) {
  const files = [...e.target.files];
  let added = 0; const notes = [];
  for (const f of files) {
    const r = parseListingPage(await f.text());
    if (!r.listings.length) { notes.push(`${f.name}: ${r.warnings[0] || 'no listings found'}`); continue; }
    added += addLocal(r.listings);
    notes.push(`${f.name}: ${r.listings.length} listings${r.basis === 'cards' ? ' (read from the visible cards; vans cannot be told apart this way)' : ''}`);
  }
  $('import-msg').textContent = notes.join(' · ') || 'No files chosen.';
  e.target.value = '';
  if (added) toast(`${added} listings added on this device.`);
  rerate();
  if (added && state.autoPublish && state.token) publish();
}

/** Listings handed over by the scanner arrive in the address as #import=... */
async function importFromAddress() {
  const m = location.hash.match(/^#import=([a-z]\.[A-Za-z0-9_-]+)$/);
  if (!location.hash.startsWith('#import=')) return;
  history.replaceState(null, '', location.pathname + location.search);       // do not keep the data in the address bar
  try {
    if (!m) throw new Error('damaged');
    const { listings, info } = sanitise(await decodePayload(m[1]));
    if (!listings.length) { toast('The scan held no usable listings.'); return; }
    const added = addLocal(listings);
    state.lastCapture = { ...info, count: listings.length };
    store.set('lastCapture', state.lastCapture);
    const pages = info.pages ? ` from ${info.pages} page${info.pages > 1 ? 's' : ''}${info.last_page && info.last_page > info.pages ? ` of ${info.last_page}` : ''}` : '';
    toast(`${added} cars received from SGCarMart${pages}.`);
    $('import-msg').textContent = info.note || '';
    rerate();
    if (state.autoPublish && state.token) publish();
  } catch {
    toast('Could not read the listings sent by the scanner. Try the scan again.');
  }
}

// ---------- publishing to the family ----------

function repoInfo() {
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  const first = location.pathname.split('/').filter(Boolean)[0];
  if (m && first) return { owner: m[1], repo: first, fixed: true };
  const [owner, repo] = String(store.get('repo', '') || '').split('/');
  return owner && repo ? { owner, repo, fixed: false } : { owner: null, repo: null, fixed: false };
}

function renderShare() {
  const info = repoInfo(), today = sgToday();
  if (document.activeElement !== $('gh-token')) $('gh-token').value = state.token;
  $('gh-repo-label').hidden = info.fixed;
  if (!info.fixed && document.activeElement !== $('gh-repo')) $('gh-repo').value = store.get('repo', '');
  $('auto-publish').checked = state.autoPublish;
  const ready = state.imported.filter((l) => l.last_seen === today).length;
  $('publish').disabled = !state.token || !info.owner || !ready || publish.busy;
  $('publish').textContent = ready ? `Publish ${ready} cars for my family` : 'Publish for my family';
  const url = state.lastCapture && state.lastCapture.url;
  $('last-search').innerHTML = safeUrl(url) ? ` (<a href="${esc(url)}" target="_blank" rel="noopener">your last search</a>)` : '';
}

const utf8ToB64 = (text) => { const b = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function ghFile(info, path, body) {
  const res = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}/contents/${path}`, {
    method: body ? 'PUT' : 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${state.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 && !body) return null;
  if (!res.ok) { const e = new Error(`GitHub answered ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

async function ghRaw(info, path) {
  const res = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}/contents/${path}`, { cache: 'no-store',
    headers: { Authorization: `Bearer ${state.token}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!res.ok) { const e = new Error(`GitHub answered ${res.status}`); e.status = res.status; throw e; }
  return res.text();
}

/** Saves today's locally scanned listings into data/listings.json in the repository, for everyone. */
async function publish() {
  if (publish.busy) return;
  const info = repoInfo(), today = sgToday();
  const fresh = state.imported.filter((l) => l.last_seen === today)
    .map((l) => Object.fromEntries(FIELDS.map((f) => [f, l[f] ?? null])));
  if (!state.token || !info.owner || !fresh.length) return;
  publish.busy = true; renderShare();
  const say = (t) => { $('publish-msg').textContent = t; };
  say('Publishing…');
  try {
    let merged, status;
    for (let attempt = 0; ; attempt++) {
      try {
        const cur = await ghFile(info, 'data/listings.json');
        let existing = [];
        if (cur) {
          // GitHub leaves the content out of this answer for files over 1 MB; fetch the text separately then.
          const text = cur.content ? b64ToUtf8(cur.content) : await ghRaw(info, 'data/listings.json');
          existing = JSON.parse(text).listings || [];
        }
        const wasStarter = state.status && state.status.seed;
        merged = mergeListings(wasStarter ? [] : existing, fresh, today, 14);
        const now = new Date().toISOString(), c = state.lastCapture || {};
        status = { started: now, finished: now, today, ok: true, source: 'browser', requests: null, robots: null, stopped: null,
          searches: [{ url: c.url || null, pages_read: c.pages ?? null, last_page: c.last_page ?? null, total: c.total ?? null, listings: fresh.length, basis: 'browser', note: c.note || null }],
          messages: [], listings_found: fresh.length };
        await ghFile(info, 'data/listings.json', { message: `Listings from browser scan ${today}`, content: utf8ToB64(serialiseListings(merged, status)), sha: cur ? cur.sha : undefined });
        break;
      } catch (e) { if (e.status === 409 && attempt === 0) continue; throw e; }      // someone else saved in between: read again once
    }
    const st = await ghFile(info, 'data/status.json');
    await ghFile(info, 'data/status.json', { message: `Status ${today}`, content: utf8ToB64(JSON.stringify(status, null, 1) + '\n'), sha: st ? st.sha : undefined });
    state.scanned = merged; state.status = status; state.updated = status.finished;
    const sent = new Set(fresh.map((l) => l.id));
    state.imported = state.imported.filter((l) => !sent.has(l.id)); store.set('imported', state.imported);
    say(`Published ${fresh.length} cars at ${new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}. Other devices see them after about a minute: press Refresh there.`);
    toast('Published for your family.');
  } catch (e) {
    say(e.status === 401 ? 'GitHub rejected the token. Check it was pasted whole and has not expired.'
      : e.status === 403 || e.status === 404 ? 'The token cannot write to this repository. It needs access to this repository with "Contents: Read and write".'
      : `Could not publish (${e.message}). Your listings are still on this device; try again.`);
  } finally {
    publish.busy = false; rerate();
  }
}

wire();
loadData().then(importFromAddress);
window.addEventListener('hashchange', importFromAddress);     // a second scan sent to this already-open tab

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it */ });
}
