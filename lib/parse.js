// Reads an SGCarMart used-car search-results page (https://www.sgcarmart.com/used-cars/listing?...).
//
// The page carries its listings twice:
//   1. as structured records embedded in the page's scripts (Next.js "flight" data) - preferred;
//   2. as the visible result cards - used when the embedded data is missing or belongs to a
//      different page (that happens when a page is saved after clicking to page 2, 3, ...).
//
// No dependencies; runs unchanged in Node (the scheduled scan) and in the browser (file import).
// Written against pages saved on 14 Nov 2026. If SGCarMart changes its page layout, this file
// is the one to update; `npm test` shows at once whether it still reads the sample page.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function toNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** "17-May-2018" -> "2018-05-17". Returns null for anything else. */
export function toIsoDate(v) {
  if (!v) return null;
  const m = String(v).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "1y 6m", "2y", "8m", "1yr 6mths 2days" -> whole months (days are dropped). */
export function coeLeftMonths(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  const y = s.match(/(\d+)\s*y/), mo = s.match(/(\d+)\s*m/);
  if (!y && !mo) return null;
  return (y ? Number(y[1]) * 12 : 0) + (mo ? Number(mo[1]) : 0);
}

function normFuel(v) {
  const s = String(v || '').toLowerCase();
  if (!s) return null;
  if (s.includes('-electric')) return 'hybrid';
  if (s.includes('electric')) return 'electric';
  if (s.includes('diesel')) return 'diesel';
  if (s.includes('petrol')) return 'petrol';
  return s;
}

function cleanUrl(link) {
  if (!link) return null;
  let u = String(link).replace(/&amp;/g, '&');
  if (u.startsWith('/')) u = 'https://www.sgcarmart.com' + u;
  return u;
}

export function idFromUrl(url) {
  const m = String(url || '').match(/\/used-cars\/info\/[^/?#]*?-(\d{5,})(?:[/?#]|$)/);
  return m ? Number(m[1]) : null;
}

// ---------- 1. embedded records ----------

/** Joins the page's `self.__next_f.push([1,"..."])` chunks into one string. */
export function decodeFlight(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = '', m;
  while ((m = re.exec(html)) !== null) {
    try { out += JSON.parse('"' + m[1] + '"'); } catch { /* skip a damaged chunk */ }
  }
  return out;
}

/** Splits flight data into rows: Map of row id -> parsed JSON (rows that are not JSON are skipped). */
export function flightRows(data) {
  const bytes = new TextEncoder().encode(data);
  const dec = new TextDecoder();
  const rows = new Map();
  let pos = 0;
  const n = bytes.length;
  while (pos < n) {
    let c = pos;
    while (c < n && c - pos < 12 && isHex(bytes[c])) c++;
    if (c === pos || bytes[c] !== 58 /* : */) {           // not the start of a row: skip the line
      const nl = bytes.indexOf(10, pos);
      if (nl < 0) break;
      pos = nl + 1;
      continue;
    }
    const id = dec.decode(bytes.subarray(pos, c));
    let p = c + 1;
    if (bytes[p] === 84 /* T: length-prefixed text, may contain line breaks */) {
      const comma = bytes.indexOf(44, p);
      const len = parseInt(dec.decode(bytes.subarray(p + 1, comma)), 16);
      if (comma > 0 && Number.isFinite(len)) {
        rows.set(id, dec.decode(bytes.subarray(comma + 1, comma + 1 + len)));
        pos = comma + 1 + len;
        continue;
      }
    }
    let nl = bytes.indexOf(10, p);
    if (nl < 0) nl = n;
    const first = bytes[p];
    if (first === 123 || first === 91 || first === 34) {  // { [ "
      try { rows.set(id, JSON.parse(dec.decode(bytes.subarray(p, nl)))); } catch { /* not JSON */ }
    }
    pos = nl + 1;
  }
  return rows;
}

function isHex(b) { return (b >= 48 && b <= 57) || (b >= 97 && b <= 102); }

/** Follows "$1a2" references between rows. */
export function resolveRefs(v, rows, depth = 0) {
  if (depth > 10) return v;
  if (typeof v === 'string') {
    if (/^\$[0-9a-f]+$/.test(v) && rows.has(v.slice(1))) return resolveRefs(rows.get(v.slice(1)), rows, depth + 1);
    if (v.startsWith('$$')) return v.slice(1);
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => resolveRefs(x, rows, depth + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = resolveRefs(x, rows, depth + 1);
    return o;
  }
  return v;
}

const looksLikeAdvert = (o) => o && typeof o === 'object' && !Array.isArray(o) &&
  'car_model' in o && 'price' in o && typeof o.link === 'string' && o.link.includes('/used-cars/info/');

export function normaliseRecord(rec) {
  const url = cleanUrl(rec.link);
  const dealer = rec.dealer_lead && typeof rec.dealer_lead === 'object' ? rec.dealer_lead.name || null : null;
  const st = rec.additional_statuses && typeof rec.additional_statuses === 'object' ? rec.additional_statuses : {};
  return {
    id: toNumber(rec.id) ?? idFromUrl(url),
    url,
    title: String(rec.car_model || '').trim(),
    make: rec.make || null,
    model: rec.model || null,
    price: toNumber(rec.price),
    depn: toNumber(rec.depreciation),
    reg: toIsoDate(rec.registration_date),
    first_reg: toIsoDate(rec.first_registration_date),
    coe_left_m: coeLeftMonths(rec.coeLeft),
    mileage: toNumber(rec.mileage),
    cc: /cc/i.test(String(rec.engine_capacity || '')) ? toNumber(rec.engine_capacity) : null,
    fuel: normFuel(rec.fuel_type),
    type: rec.type || null,
    trans: rec.transmission || null,
    owners: toNumber(rec.owners),
    dealer,
    posted: toIsoDate(rec.date),
    scheme: rec.vehicle_scheme || null,
    status: rec.status === 's' ? 'sold' : 'available',
    imported_used: st.is_imported_used === true,
  };
}

/** Listings and paging info from the embedded data, or null when the page has none. */
export function parseEmbedded(html) {
  const data = decodeFlight(html);
  if (!data) return null;
  const rows = flightRows(data);
  // The search result is a row shaped {data: [...adverts], links: {...}, meta: {current_page, last_page, total}}.
  for (const row of rows.values()) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !('data' in row) || !('meta' in row)) continue;
    const meta = resolveRefs(row.meta, rows);
    const list = resolveRefs(row.data, rows);
    if (!meta || typeof meta !== 'object' || !('current_page' in meta) || !Array.isArray(list)) continue;
    if (list.length && !list.some(looksLikeAdvert)) continue;
    return {
      listings: list.filter(looksLikeAdvert).map(normaliseRecord),
      meta: { current_page: toNumber(meta.current_page), last_page: toNumber(meta.last_page),
              per_page: toNumber(meta.per_page), total: toNumber(meta.total) },
    };
  }
  return null;
}

// ---------- 2. visible result cards ----------

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function textLines(fragment) {
  return decodeEntities(fragment.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, '\n'))
    .split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function parseCards(html) {
  const starts = [];
  const re = /id="listing_(\d+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) starts.push(m.index);
  const out = [], seen = new Set();
  for (let i = 0; i < starts.length; i++) {
    const block = html.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : Math.min(html.length, starts[i] + 20000));
    const link = block.match(/href="([^"]*\/used-cars\/info\/[^"]*)"/);
    if (!link) continue;
    const url = cleanUrl(link[1]);
    const id = idFromUrl(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const titleM = block.match(/<a[^>]*href="[^"]*\/used-cars\/info\/[^"]*"[^>]*>([^<]+)<\/a>/);
    const dealerM = block.match(/<a[^>]*href="[^"]*\/used-cars\/listing\?dl=\d+[^"]*"[^>]*>([^<]+)<\/a>/);
    const lines = textLines(block);
    const find = (rx) => { for (const l of lines) { const mm = l.match(rx); if (mm) return mm; } return null; };
    const fuelIdx = lines.findIndex((l) => /^Fuel Type:?$/i.test(l));
    const title = titleM ? decodeEntities(titleM[1]).trim() : '';
    out.push({
      id, url, title,
      make: null, model: null,
      price: toNumber((find(/^\$([\d,]+)$/) || [])[1]),
      depn: toNumber((find(/^\$([\d,]+)\s*\/\s*yr$/i) || [])[1]),
      reg: toIsoDate((find(/^(\d{1,2}-[A-Za-z]{3}-\d{4})$/) || [])[1]),
      first_reg: null,
      coe_left_m: coeLeftMonths((find(/\(([^)]*?)\s*COE left\)/i) || [])[1]),
      mileage: toNumber((find(/^([\d,]+)\s*km$/i) || [])[1]),
      cc: toNumber((find(/^([\d,]+)\s*cc$/i) || [])[1]),
      // Cards show a fuel line only when the car is not petrol.
      fuel: fuelIdx >= 0 && lines[fuelIdx + 1] ? normFuel(lines[fuelIdx + 1]) : (find(/^([\d,]+)\s*cc$/i) ? 'petrol' : null),
      type: null, trans: null,
      owners: toNumber((find(/^(\d+)\s*Owners?$/i) || [])[1]),
      dealer: dealerM ? decodeEntities(dealerM[1]).trim() : null,
      posted: toIsoDate((find(/^Posted (\d{1,2}-[A-Za-z]{3}-\d{4})$/i) || [])[1]),
      scheme: null, status: 'available', imported_used: false,
    });
  }
  return out;
}

function cardsMeta(html) {
  const cur = html.match(/data-value="(\d+)"[^>]*>\s*\d+\s*<span[^>]*>\(current\)/);
  const total = html.match(/>\s*([\d,]+)\s*Vehicles?\s*</);
  let last = null;
  const i = html.indexOf('id="desktopPaginationContainer"');
  if (i >= 0) {
    for (const mm of html.slice(i, i + 8000).matchAll(/data-value="(\d+)"[^>]*role="button"/g)) last = Math.max(last ?? 0, Number(mm[1]));
  }
  if (!cur && !total) return null;
  const current = cur ? Number(cur[1]) : null;
  return { current_page: current, last_page: last === null ? current : Math.max(last, current ?? 0), per_page: null, total: total ? toNumber(total[1]) : null };
}

// ---------- combined ----------

/** "detail" for a single car's page, "listing" for search results, "unknown" otherwise. */
export function pageKind(html) {
  const head = html.slice(0, 200000);
  const canon = head.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i) || head.match(/<link[^>]*href="([^"]+)"[^>]*rel="canonical"/i);
  const url = canon ? canon[1] : '';
  if (url.includes('/used-cars/info/')) return 'detail';
  if (url.includes('/used-cars/listing')) return 'listing';
  return 'unknown';
}

/**
 * Reads one results page.
 * Returns {listings, meta, basis, warnings}; basis is "embedded", "cards" or "none".
 */
export function parseListingPage(html) {
  const warnings = [];
  if (pageKind(html) === 'detail') {
    warnings.push("This is a single car's page. Save and import the search-results page instead.");
    return { listings: [], meta: null, basis: 'none', warnings };
  }
  const emb = parseEmbedded(html);
  const cards = parseCards(html);
  if (emb && emb.listings.length && cards.length) {
    const embIds = new Set(emb.listings.map((l) => l.id));
    const same = cards.length === emb.listings.length && cards.every((c) => embIds.has(c.id));
    if (same) return { listings: emb.listings, meta: emb.meta, basis: 'embedded', warnings };
    // The cards on screen are not the embedded page (saved after moving to another page). Trust the cards.
    const byId = new Map(emb.listings.map((l) => [l.id, l]));
    warnings.push('Embedded data belongs to a different results page; read the visible cards instead (vehicle type is not shown on cards).');
    return { listings: cards.map((c) => byId.get(c.id) || c), meta: cardsMeta(html), basis: 'cards', warnings };
  }
  if (emb && emb.listings.length) return { listings: emb.listings, meta: emb.meta, basis: 'embedded', warnings };
  if (cards.length) return { listings: cards, meta: cardsMeta(html), basis: 'cards', warnings };
  if (emb) return { listings: [], meta: emb.meta, basis: 'embedded', warnings };   // a search with no results
  warnings.push('No listings found. This does not look like an SGCarMart used-car results page, or the page layout has changed.');
  return { listings: [], meta: null, basis: 'none', warnings };
}

/** True when a response looks like a bot check rather than a results page. */
export function looksLikeChallenge(html) {
  const low = html.slice(0, 20000).toLowerCase();
  return html.length < 30000 && ['captcha', 'are you a robot', 'verify you are human', 'access denied', 'attention required'].some((w) => low.includes(w));
}
