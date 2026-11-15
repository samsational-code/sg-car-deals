// One-click capture. This code becomes the "Scan SGCarMart" bookmark the dashboard gives you.
//
// It runs in YOUR browser, on an SGCarMart search you have open. It reads the result cards on
// the page, presses the site's own "Next" button to walk through the following pages (with a
// pause between pages, like a person browsing), and hands the listings to your dashboard when
// you press "Send to my dashboard". Nothing is sent anywhere else.

import { parseListingPage } from './parse.js';

export const FIELDS = ['id', 'url', 'title', 'make', 'model', 'price', 'depn', 'reg', 'first_reg', 'coe_left_m', 'mileage', 'cc',
  'fuel', 'type', 'trans', 'owners', 'dealer', 'posted', 'scheme', 'status', 'imported_used'];
const MAX_LISTINGS = 800;

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

/** The ids of the cars on screen now, in order: changes when the site shows another page. */
function cardSignature(doc) {
  return [...doc.querySelectorAll('[id^="listing_"]')].filter((c) => /^listing_\d+$/.test(c.id)).map((c) => {
    const a = c.querySelector('a[href*="/used-cars/info/"]');
    return a ? a.getAttribute('href').split('?')[0] : '';
  }).join('|');
}

function nextButton(doc) {
  const box = doc.getElementById('desktopPaginationContainer');
  if (!box) return null;
  const btn = [...box.querySelectorAll('button')].find((b) => /next/i.test(b.textContent));
  return btn && !btn.disabled ? btn : null;
}

function panel(doc) {
  const old = doc.getElementById('scd-capture');
  if (old) old.remove();
  const box = doc.createElement('div');
  box.id = 'scd-capture';
  box.setAttribute('style', 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;max-width:calc(100% - 32px);' +
    'background:#0b5d4f;color:#fff;font:15px/1.45 system-ui,sans-serif;padding:16px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35)');
  const title = doc.createElement('div'); title.textContent = 'SG Car Deals'; title.setAttribute('style', 'font-weight:700;margin-bottom:6px');
  const msg = doc.createElement('div'); msg.id = 'scd-capture-msg';
  const row = doc.createElement('div'); row.setAttribute('style', 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap');
  box.append(title, msg, row);
  doc.body.appendChild(box);
  const button = (label, primary) => {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = label;
    b.setAttribute('style', `font:inherit;font-weight:600;padding:8px 12px;border-radius:8px;cursor:pointer;border:1px solid #fff;` +
      (primary ? 'background:#fff;color:#0b5d4f' : 'background:transparent;color:#fff'));
    row.appendChild(b); return b;
  };
  return { say: (t) => { msg.textContent = t; }, button, clear: () => { row.textContent = ''; }, close: () => box.remove() };
}

/**
 * Reads the search results in this window and offers to send them to the dashboard at dashUrl.
 * opts: maxPages (default 10), pauseMs between pages (default 3000, never under 2000).
 */
export async function runCapture(win, dashUrl, opts = {}) {
  const doc = win.document;
  if (win.__scdBusy) return null;
  const ui = panel(doc);
  const onSite = win.location.hostname === 'www.sgcarmart.com' && win.location.pathname.startsWith('/used-cars/listing');
  if (!onSite) {
    ui.say('Open a used-car search on sgcarmart.com first, then press this bookmark again.');
    ui.button('Close').onclick = ui.close;
    return null;
  }
  win.__scdBusy = true;
  const maxPages = opts.maxPages || 10;
  const pauseMs = Math.max(2000, opts.pauseMs || 3000);
  const found = new Map();
  let stopped = false, pages = 0, meta = null, note = '';
  const stop = ui.button('Stop'); stop.onclick = () => { stopped = true; ui.say('Stopping after this page…'); };

  const readPage = () => {
    const r = parseListingPage(doc.documentElement.outerHTML);
    if (r.meta && (!meta || r.meta.last_page)) meta = { ...(meta || {}), ...r.meta, total: r.meta.total ?? (meta && meta.total) ?? null };
    for (const l of r.listings) if (l.id != null && !found.has(l.id)) found.set(l.id, l);
    return r.listings.length;
  };

  try {
    if (!readPage()) { note = 'No result cards found on this page.'; }
    else {
      pages = 1;
      while (!stopped && pages < maxPages && found.size < MAX_LISTINGS) {
        const next = nextButton(doc);
        if (!next) break;                                   // last page
        ui.say(`Read ${found.size} cars from ${pages} page${pages > 1 ? 's' : ''}. Moving to the next page…`);
        await wait(pauseMs);
        if (stopped) break;
        const before = cardSignature(doc);
        next.click();
        let changed = false, last = before, steady = 0;
        for (let i = 0; i < 50 && !changed; i++) {          // up to 20 seconds for the site to show the page
          await wait(400);
          const now = cardSignature(doc);
          if (now && now !== before) { steady = now === last ? steady + 1 : 0; if (steady >= 2) changed = true; }
          last = now;
        }
        if (!changed) { note = 'The site did not show the next page, so only the pages read so far are included.'; break; }
        readPage();
        pages++;
      }
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
  const lastPage = meta && meta.last_page ? meta.last_page : null;
  const payload = { v: 1, at: new Date().toISOString(), url: win.location.href.split('#')[0], pages, last_page: lastPage,
    total: meta ? meta.total : null, note, fields: FIELDS, rows: toRows([...found.values()]) };
  const packed = await encodePayload(payload);
  ui.say(`Read ${found.size} cars from ${pages} page${pages > 1 ? 's' : ''}${lastPage && lastPage > pages ? ` of ${lastPage}` : ''}. ${note}`);
  const send = ui.button('Send to my dashboard', true);
  send.onclick = () => { win.open(dashUrl + '#import=' + packed, 'sgcardeals'); ui.say('Sent. You can close this box.'); };
  ui.button('Close').onclick = ui.close;
  return { listings: [...found.values()], pages, note, packed };
}
