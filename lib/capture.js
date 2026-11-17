// One-click capture: the code behind the "Scan for SG Car Deals" button the extension adds.
//
// It runs in YOUR browser, on an SGCarMart search you have open. It asks the site for that same
// search, 100 cars a page, page by page (with a pause between pages), exactly as your browser
// does when you page through the results yourself. It hands the listings to your dashboard when
// you press "Send to my dashboard". Nothing is sent anywhere else.
//
// Checked on the live site on 17 Nov 2026: result pages are addressed with page=N and limit=100,
// and clicking the site's Next button reloads the whole page (so clicking through cannot work).

import { parseListingPage } from './parse.js';

export const FIELDS = ['id', 'url', 'title', 'make', 'model', 'price', 'depn', 'reg', 'first_reg', 'coe_left_m', 'mileage', 'cc',
  'fuel', 'type', 'trans', 'owners', 'dealer', 'posted', 'scheme', 'status', 'imported_used'];
const MAX_LISTINGS = 1000;
const PER_PAGE = 100;

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Packs the captured listings into text that fits in a web address. "z." = compressed, "j." = plain. */
export async function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return 'z.' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
    } catch { /* fall through to plain */ }
  }
  return 'j.' + b64url(bytes);
}

export function toRows(listings) {
  return listings.slice(0, MAX_LISTINGS).map((l) => FIELDS.map((f) => (l[f] === undefined ? null : l[f])));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Styles are set through the style object, not style attributes: a site's security policy can drop the latter.
function panel(doc) {
  const old = doc.getElementById('scd-capture');
  if (old) old.remove();
  const box = doc.createElement('div');
  box.id = 'scd-capture';
  box.style.cssText = ('position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;max-width:calc(100% - 32px);' +
    'background:#0b5d4f;color:#fff;font:15px/1.45 system-ui,sans-serif;padding:16px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);text-align:left');
  const title = doc.createElement('div'); title.textContent = 'SG Car Deals'; title.style.cssText = 'font-weight:700;margin-bottom:6px';
  const msg = doc.createElement('div'); msg.id = 'scd-capture-msg';
  const row = doc.createElement('div'); row.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap';
  box.append(title, msg, row);
  doc.body.appendChild(box);
  const button = (label, primary) => {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'font:inherit;font-weight:600;padding:8px 12px;border-radius:8px;cursor:pointer;border:1px solid #fff;' +
      (primary ? 'background:#fff;color:#0b5d4f' : 'background:transparent;color:#fff');
    row.appendChild(b); return b;
  };
  return { say: (t) => { msg.textContent = t; }, button, clear: () => { row.textContent = ''; }, close: () => box.remove() };
}

/**
 * Reads the search open in this window and offers to send the listings to the dashboard at dashUrl.
 * opts: maxPages (default 10), pauseMs between pages (default 3000, never under 2000).
 */
export async function runCapture(win, dashUrl, opts = {}) {
  const doc = win.document;
  if (win.__scdBusy) return null;
  const ui = panel(doc);
  const onSite = win.location.hostname === 'www.sgcarmart.com' && win.location.pathname.startsWith('/used-cars/listing');
  if (!onSite) {
    ui.say('Open a used-car search on sgcarmart.com first, then try again.');
    ui.button('Close').onclick = ui.close;
    return null;
  }
  win.__scdBusy = true;
  const maxPages = opts.maxPages || 10;
  const pauseMs = Math.max(2000, opts.pauseMs || 3000);
  const found = new Map();
  let stopped = false, pages = 0, lastPage = null, total = null, note = '';
  const stop = ui.button('Stop'); stop.onclick = () => { stopped = true; ui.say('Stopping after this page…'); };
  const add = (listings) => { let fresh = 0; for (const l of listings) if (l.id != null && !found.has(l.id)) { found.set(l.id, l); fresh++; } return fresh; };

  // The same search, from its first page, 100 cars a page.
  const search = new URL(win.location.href);
  search.hash = ''; search.searchParams.delete('page'); search.searchParams.set('limit', String(PER_PAGE));
  const readPage = async (n) => {
    const u = new URL(search.href);
    if (n > 1) u.searchParams.set('page', String(n));
    const res = await win.fetch(u.href, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
    if (!res.ok) throw new Error('the site answered ' + res.status);
    return parseListingPage(await res.text());
  };

  try {
    for (let n = 1; n <= maxPages && !stopped && found.size < MAX_LISTINGS; n++) {
      ui.say(n === 1 ? 'Reading page 1…' : `Read ${found.size} cars. Reading page ${n}${lastPage ? ` of ${lastPage}` : ''}…`);
      if (n > 1) await wait(pauseMs);
      if (stopped) break;
      let r;
      try { r = await readPage(n); } catch (e) { note = `Page ${n} could not be read (${e.message}).`; break; }
      if (!r.listings.length) { if (n === 1) note = r.warnings[0] || 'The site returned no cars for this search.'; break; }
      if (r.meta && r.meta.current_page != null && r.meta.current_page !== n) { note = `The site did not return page ${n}.`; break; }
      if (n === 1 && r.meta) { lastPage = r.meta.last_page; total = r.meta.total; }
      if (!add(r.listings) && n > 1) break;                 // nothing new: the site repeated a page
      pages = n;
      if (lastPage != null && n >= lastPage) break;
    }
    if (!found.size) {
      // Could not fetch anything: fall back to the cars on screen.
      const r = parseListingPage(doc.documentElement.outerHTML);
      if (add(r.listings)) { pages = 1; note = `Only the page on screen could be read. ${note}`; if (r.meta) { lastPage = r.meta.last_page; total = r.meta.total; } }
    }
  } finally {
    win.__scdBusy = false;
  }

  ui.clear();
  if (!found.size) {
    ui.say(note || 'No cars were read.');
    ui.button('Close').onclick = ui.close;
    return { listings: [], pages, note };
  }
  if (!note && total && found.size < total) note = 'Narrow the search to read the rest.';
  const payload = { v: 1, at: new Date().toISOString(), url: win.location.href.split('#')[0], pages, last_page: lastPage,
    total, note, fields: FIELDS, rows: toRows([...found.values()]) };
  const packed = await encodePayload(payload);
  ui.say(`Read ${found.size} cars${total ? ` of ${total}` : ''}. ${note}`);
  const send = ui.button('Send to my dashboard', true);
  send.onclick = () => { win.open(dashUrl + '#import=' + packed, 'sgcardeals'); ui.say('Sent. You can close this box.'); };
  ui.button('Close').onclick = ui.close;
  return { listings: [...found.values()], pages, note, packed };
}
