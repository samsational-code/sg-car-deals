// Dashboard: loads the listings the scan saved, rates them in the browser, and re-rates
// whenever you change the COE price or an assumption. Nothing you type leaves this device.

import { rateAll, DEFAULT_SETTINGS, REFERENCE } from './lib/engine.js';
import { parseListingPage } from './lib/parse.js';

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
  if (!s) { $('scan-line').textContent = n ? `${n} listings stored` : 'No scan has run yet'; return; }
  const when = s.finished ? new Date(s.finished).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' }) : '';
  $('scan-line').textContent = s.seed ? 'Starter data from 14 Nov 2026. Run a scan to load live listings.'
    : `Last scan ${when} SGT · ${s.listings_found} listings read`;
  const notes = (s.searches || []).filter((x) => x.note).map((x) => esc(x.note));
  if (s.seed) { showBanner('info', 'Showing starter data: one page saved by hand on 14 Nov 2026, mostly vans. Set up the scan (see the README in your repository) to load live listings.'); return; }
  if (s.stopped) { showBanner('bad', `The last scan was refused: ${esc(s.stopped)}. Nothing was retried. The listings below are from the last scan that worked. You can still add listings by hand, below.`); return; }
  if (!s.ok) { showBanner('bad', `The last scan read no listings. ${[...(s.messages || []).map(esc), ...notes].join(' ')}`); return; }
  const age = state.updated ? daysBetween(state.updated.slice(0, 10), today) : 0;
  if (age > 2) { showBanner('warn', `The listings are ${age} days old. The daily scan may have stopped: check the Actions tab of your repository.`); return; }
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

  if (!shown.length) {
    $('list').innerHTML = `<p class="empty">${rated.length ? 'No cars match these filters.' : 'No rated cars yet. Run a scan, or add listings from a saved page below.'}</p>`;
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
  if (l.origin === 'import') tags.push('<span class="tag">Added by hand</span>');
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

  // On GitHub Pages the address tells us which repository this is, so we can link to its scan.
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  if (m && repo) { const a = $('run-scan'); a.href = `https://github.com/${m[1]}/${repo}/actions/workflows/scan.yml`; a.hidden = false; }
}

// Typing in the search box must not rebuild the box itself.
function renderListOnly() { const q = $('q'), pos = q.selectionStart; render(); q.focus(); try { q.setSelectionRange(pos, pos); } catch { /* not supported for this input type */ } }

async function importFiles(e) {
  const files = [...e.target.files];
  const today = sgToday();
  let added = 0; const notes = [];
  const byId = new Map(state.imported.map((l) => [l.id, l]));
  for (const f of files) {
    const r = parseListingPage(await f.text());
    if (!r.listings.length) { notes.push(`${f.name}: ${r.warnings[0] || 'no listings found'}`); continue; }
    for (const l of r.listings) {
      if (l.id == null) continue;
      const old = byId.get(l.id);
      const prices = old && Array.isArray(old.prices) ? [...old.prices] : [];
      if (l.price && (!prices.length || prices[prices.length - 1][1] !== l.price)) prices.push([today, l.price]);
      byId.set(l.id, { ...l, first_seen: old ? old.first_seen : today, last_seen: today, prices, in_last_scan: true });
      added++;
    }
    notes.push(`${f.name}: ${r.listings.length} listings${r.basis === 'cards' ? ' (read from the visible cards; vans cannot be told apart this way)' : ''}`);
  }
  state.imported = [...byId.values()];
  store.set('imported', state.imported);
  $('import-msg').textContent = notes.join(' · ') || 'No files chosen.';
  e.target.value = '';
  if (added) toast(`${added} listings added.`);
  rerate();
}

wire();
loadData();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it */ });
}
