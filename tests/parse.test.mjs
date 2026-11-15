import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseListingPage, parseEmbedded, parseCards, toIsoDate, coeLeftMonths, toNumber, idFromUrl, pageKind, looksLikeChallenge } from '../lib/parse.js';
import { buildPage, sampleRecords, shiftedRecords } from './helpers.mjs';

test('small helpers', () => {
  assert.equal(toIsoDate('17-May-2018'), '2018-05-17');
  assert.equal(toIsoDate('N.A.'), null);
  assert.equal(coeLeftMonths('1y 6m'), 18);
  assert.equal(coeLeftMonths('2y '), 24);
  assert.equal(coeLeftMonths('8m'), 8);
  assert.equal(coeLeftMonths('1yr 6mths 2days'), 18);
  assert.equal(toNumber('1,193 cc'), 1193);
  assert.equal(toNumber('N.A.'), null);
  assert.equal(idFromUrl('https://www.sgcarmart.com/used-cars/info/mazda-2-hb-15a-1540572/?dl=3350'), 1540572);
});

test('embedded records: four real listings read correctly', () => {
  const r = parseListingPage(buildPage({ lastPage: 49, total: 970 }));
  assert.equal(r.basis, 'embedded');
  assert.deepEqual(r.meta, { current_page: 1, last_page: 49, per_page: 20, total: 970 });
  assert.equal(r.listings.length, 4);
  const a = r.listings[0];
  assert.deepEqual(
    { id: a.id, title: a.title, make: a.make, model: a.model, price: a.price, depn: a.depn, reg: a.reg, coe: a.coe_left_m, km: a.mileage, cc: a.cc, fuel: a.fuel, type: a.type, owners: a.owners, dealer: a.dealer, posted: a.posted },
    { id: 1546357, title: 'Mitsubishi Attrage 1.2A', make: 'Mitsubishi', model: 'Attrage', price: 16000, depn: 10640, reg: '2018-02-21', coe: 15, km: 210000, cc: 1193, fuel: 'petrol', type: 'Sedan', owners: 1, dealer: 'Platinum Motoring', posted: '2026-11-12' });
  assert.equal(a.url, 'https://www.sgcarmart.com/used-cars/info/mitsubishi-attrage-12a-1546357/?dl=3283');
  assert.equal(r.listings[3].type, 'Van');
});

test('visible cards give the same figures as the embedded records', () => {
  const html = buildPage();
  const cards = parseCards(html), emb = parseEmbedded(html).listings;
  assert.equal(cards.length, 4);
  for (const c of cards) {
    const e = emb.find((x) => x.id === c.id);
    for (const k of ['url', 'title', 'price', 'depn', 'reg', 'coe_left_m', 'mileage', 'cc', 'owners', 'posted', 'fuel']) assert.deepEqual(c[k], e[k], `${c.title} ${k}`);
  }
});

test('page with cards only (no embedded data) is still read', () => {
  const r = parseListingPage(buildPage({ embedded: false, page: 3, lastPage: 49, total: 970 }));
  assert.equal(r.basis, 'cards');
  assert.equal(r.listings.length, 4);
  assert.equal(r.meta.current_page, 3);
  assert.equal(r.meta.last_page, 49);
  assert.equal(r.meta.total, 970);
});

test('page saved after moving to another results page: the cards win', () => {
  // Scripts still hold the first page's records; the cards on screen are different cars.
  const html = buildPage({ records: shiftedRecords(1000) });
  const r = parseListingPage(html);
  assert.equal(r.basis, 'cards');
  assert.deepEqual(r.listings.map((l) => l.id), sampleRecords.map((x) => x.id));
  assert.equal(r.warnings.length, 1);
});

test("a single car's page is recognised and not read as a search", () => {
  const html = buildPage({ canonical: 'https://www.sgcarmart.com/used-cars/info/suzuki-every-turbo-1551168' });
  assert.equal(pageKind(html), 'detail');
  const r = parseListingPage(html);
  assert.equal(r.basis, 'none');
  assert.equal(r.listings.length, 0);
});

test('a page that is not SGCarMart results gives nothing and says so', () => {
  const r = parseListingPage('<html><body><h1>Hello</h1></body></html>');
  assert.equal(r.basis, 'none');
  assert.ok(r.warnings[0].includes('No listings found'));
});

test('a search with no results is not an error', () => {
  const r = parseListingPage(buildPage({ records: [], cards: '', total: 0 }));
  assert.equal(r.basis, 'embedded');
  assert.equal(r.listings.length, 0);
  assert.equal(r.meta.total, 0);
});

test('bot-check pages are recognised', () => {
  assert.equal(looksLikeChallenge('<html><title>Attention Required</title>Please complete the CAPTCHA</html>'), true);
  assert.equal(looksLikeChallenge(buildPage()), false);
});

// Optional: point SGCM_REAL_PAGE at a results page saved from your browser to check the reader against the live layout.
test('real saved page (only when SGCM_REAL_PAGE is set)', { skip: !process.env.SGCM_REAL_PAGE }, () => {
  const r = parseListingPage(fs.readFileSync(process.env.SGCM_REAL_PAGE, 'utf8'));
  assert.ok(r.listings.length > 0, 'no listings read');
  for (const l of r.listings) { assert.ok(l.id && l.url && l.title, 'id, url, title'); assert.ok(l.reg, `registration date for ${l.title}`); }
  console.log(`  read ${r.listings.length} listings (${r.basis}); page ${r.meta?.current_page} of ${r.meta?.last_page}; total ${r.meta?.total}`);
});
