import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePayload, toRows, FIELDS } from '../lib/capture.js';
import { decodePayload, sanitise } from '../lib/transfer.js';
import { parseListingPage } from '../lib/parse.js';
import { buildPage } from './helpers.mjs';

const listings = parseListingPage(buildPage()).listings;
const payload = () => ({ v: 1, at: '2026-11-15T04:00:00.000Z', url: 'https://www.sgcarmart.com/used-cars/listing?pr2=50000', pages: 2, last_page: 49, total: 970, note: '', fields: FIELDS, rows: toRows(listings) });

test('captured listings survive the trip to the dashboard unchanged', async () => {
  const packed = await encodePayload(payload());
  assert.ok(packed.startsWith('z.'));
  assert.match(packed, /^[a-z]\.[A-Za-z0-9_-]+$/);                 // safe inside a web address
  const { listings: back, info } = sanitise(await decodePayload(packed));
  assert.equal(back.length, 4);
  for (const [i, l] of listings.entries()) for (const f of FIELDS) assert.deepEqual(back[i][f], l[f] ?? null, `${l.title} ${f}`);
  assert.deepEqual(info, { url: 'https://www.sgcarmart.com/used-cars/listing?pr2=50000', pages: 2, last_page: 49, total: 970, note: null, at: '2026-11-15T04:00:00.000Z' });
});

test('uncompressed form is read too', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload()));
  const packed = 'j.' + Buffer.from(bytes).toString('base64url');
  assert.equal(sanitise(await decodePayload(packed)).listings.length, 4);
});

test('200 listings fit comfortably in a web address', async () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ ...listings[i % 4], id: 2000000 + i, url: listings[i % 4].url.replace(/-\d+\//, `-${2000000 + i}/`), price: 15000 + i * 37 }));
  const packed = await encodePayload({ ...payload(), rows: toRows(many) });
  assert.ok(packed.length < 30000, `packed length ${packed.length}`);
});

test('anything malformed or pointing off-site is dropped', async () => {
  const p = payload();
  const bad = (change) => { const row = [...p.rows[0]]; change(row); return row; };
  const idx = (f) => FIELDS.indexOf(f);
  p.rows = [
    p.rows[0],
    bad((r) => { r[idx('url')] = 'javascript:alert(1)'; }),
    bad((r) => { r[idx('url')] = 'https://evil.example/used-cars/info/x-1/'; }),
    bad((r) => { r[idx('id')] = 'abc'; }),
    bad((r) => { r[idx('title')] = ''; }),
    'not a row',
    bad((r) => { r[idx('id')] = 5; r[idx('price')] = '16000'; r[idx('reg')] = '21-Feb-2018'; r[idx('title')] = 'x'.repeat(500); r[idx('status')] = '<b>'; }),
  ];
  p.url = 'https://evil.example/';
  const { listings: out, info } = sanitise(p);
  assert.equal(out.length, 2);
  assert.equal(out[1].price, null);                                // wrong type: blanked, not trusted
  assert.equal(out[1].reg, null);
  assert.equal(out[1].title.length, 160);
  assert.equal(out[1].status, 'available');
  assert.equal(info.url, null);
  assert.throws(() => sanitise({ v: 2 }));
  await assert.rejects(decodePayload('q.AAAA'));
});

test('the bookmark script is one self-contained, valid script', async () => {
  const fs = await import('node:fs');
  const { bookmarkletCode, bookmarkletHref } = await import('../lib/bookmarklet.js');
  const read = (f) => fs.readFileSync(new URL('../lib/' + f, import.meta.url), 'utf8');
  const code = bookmarkletCode(read('parse.js'), read('capture.js'), 'https://example.github.io/sg-car-deals/');
  assert.ok(!/^\s*(import|export)\s/m.test(code), 'module syntax left in');
  assert.doesNotThrow(() => new Function(code));                    // parses as a plain script
  assert.ok(code.includes('runCapture(window, "https://example.github.io/sg-car-deals/")'));
  const href = bookmarkletHref(read('parse.js'), read('capture.js'), 'https://example.github.io/sg-car-deals/');
  assert.ok(href.startsWith('javascript:void'));
  assert.equal(decodeURIComponent(href.slice('javascript:'.length)), code);
  console.log(`  bookmark length: ${href.length} characters`);
});
