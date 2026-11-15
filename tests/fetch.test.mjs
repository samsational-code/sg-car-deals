import test from 'node:test';
import assert from 'node:assert/strict';
import { runScan, parseRobots, robotsAllows, crawlDelay, readSearches, mergeListings, serialiseListings, UA_TOKEN } from '../scripts/fetch.mjs';
import { buildPage, shiftedRecords, sampleRecords } from './helpers.mjs';

const SEARCH = 'https://www.sgcarmart.com/used-cars/listing?pr2=50000&dp2=16000&fr=2018&to=2019&ord=DEP_ASC';
const UA = `${UA_TOKEN}/1.0 (test)`;

/** A stand-in for the website: `routes` maps a URL test to a response. Records every request. */
function fakeSite(routes) {
  const calls = [], sleeps = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, ua: opts.headers['User-Agent'] });
    for (const [match, respond] of routes) {
      if (match(url)) { const r = respond(url); return { status: r.status ?? 200, text: async () => r.body ?? '' }; }
    }
    return { status: 404, text: async () => 'not found' };
  };
  return { fetchImpl, calls, sleeps, sleep: async (s) => { sleeps.push(s); } };
}
const robots = (body, status = 200) => [(u) => u.endsWith('/robots.txt'), () => ({ status, body })];
const pageNo = (u) => Number(new URL(u).searchParams.get('page') || 1);
const scan = (site, extra = {}) => runScan({ searchesText: SEARCH, fetchImpl: site.fetchImpl, sleep: site.sleep, userAgent: UA, now: new Date('2026-11-14T02:00:00Z'), ...extra });

test('robots.txt rules', () => {
  const g = parseRobots('User-agent: *\nDisallow: /member/\nDisallow: /used-cars/listing?*dl=\nAllow: /used-cars/\nCrawl-delay: 12\n\nUser-agent: badbot\nDisallow: /\n');
  assert.equal(robotsAllows(g, UA_TOKEN, '/used-cars/listing?pr2=50000'), true);
  assert.equal(robotsAllows(g, UA_TOKEN, '/used-cars/listing?dl=1005'), false);
  assert.equal(robotsAllows(g, UA_TOKEN, '/member/login'), false);
  assert.equal(robotsAllows(g, 'badbot', '/used-cars/listing'), false);
  assert.equal(crawlDelay(g, UA_TOKEN), 12);
  assert.equal(robotsAllows(parseRobots(`User-agent: ${UA_TOKEN}\nDisallow: /\n\nUser-agent: *\nAllow: /\n`), UA_TOKEN, '/used-cars/listing'), false);
  assert.equal(robotsAllows(parseRobots(''), UA_TOKEN, '/anything'), true);
});

test('searches.txt: only SGCarMart used-car searches are accepted', () => {
  const r = readSearches(`# my searches\n${SEARCH}\n${SEARCH}#\nhttps://www.sgcarmart.com/member/login\nhttps://carma.sg/cars\nnot a link\n`);
  assert.deepEqual(r.urls, [SEARCH]);
  assert.equal(r.rejected.length, 3);
});

test('reads every page of a search, politely', async () => {
  const site = fakeSite([robots('User-agent: *\nAllow: /\n'),
    [(u) => u.includes('/used-cars/listing'), (u) => ({ body: buildPage({ records: shiftedRecords((pageNo(u) - 1) * 1000), cards: '', page: pageNo(u), lastPage: 3, total: 12 }) })]]);
  const { status, listings } = await scan(site);
  assert.equal(status.ok, true);
  assert.equal(status.requests, 4);                                   // robots.txt + 3 pages
  assert.equal(site.calls[0].url, 'https://www.sgcarmart.com/robots.txt');
  assert.equal(site.calls[1].url, SEARCH);                            // page 1 is your address, untouched
  assert.ok(site.calls[2].url.endsWith('&page=2'));
  assert.ok(site.calls.every((c) => c.ua === UA));
  assert.deepEqual(site.sleeps, [8, 8, 8]);                           // a wait before every page
  assert.equal(listings.length, 12);
  assert.deepEqual(status.searches[0], { url: SEARCH, pages_read: 3, last_page: 3, total: 12, listings: 12, basis: 'embedded', note: null });
  assert.equal(listings[0].first_seen, '2026-11-14');                 // Singapore date
  assert.deepEqual(listings[0].prices, [['2026-11-14', listings[0].price]]);
});

test('stops at the page limit and says so', async () => {
  const site = fakeSite([robots(''), [(u) => u.includes('/listing'), (u) => ({ body: buildPage({ records: shiftedRecords(pageNo(u) * 1000), cards: '', page: pageNo(u), lastPage: 49, total: 970 }) })]]);
  const { status } = await scan(site, { config: { max_pages_per_search: 2 } });
  assert.equal(status.searches[0].pages_read, 2);
  assert.ok(status.searches[0].note.includes('Read 2 of 49 pages'));
  assert.equal(status.ok, true);
});

test('never exceeds the request limit', async () => {
  const site = fakeSite([robots(''), [(u) => u.includes('/listing'), (u) => ({ body: buildPage({ records: shiftedRecords(pageNo(u) * 1000), cards: '', page: pageNo(u), lastPage: 49, total: 970 }) })]]);
  const { status } = await scan(site, { config: { max_pages_per_search: 40, max_requests_per_run: 5 } });
  assert.equal(site.calls.length, 5);
  assert.ok(status.searches[0].note.includes('limit of 5 requests'));
});

test('notices when the site ignores the page number', async () => {
  const site = fakeSite([robots(''), [(u) => u.includes('/listing'), () => ({ body: buildPage({ page: 1, lastPage: 49, total: 970 }) })]]);
  const { status, listings } = await scan(site);
  assert.equal(status.searches[0].pages_read, 1);
  assert.ok(status.searches[0].note.includes('Only the first page could be read'));
  assert.equal(site.calls.length, 3);                                 // robots, page 1, one failed try at page 2, then stop
  assert.equal(listings.length, 4);
});

test('a refusal stops the whole run and keeps what is stored', async () => {
  for (const refusal of [{ status: 403 }, { status: 429 }, { status: 200, body: '<html>Please complete the CAPTCHA to continue</html>' }]) {
    const site = fakeSite([robots(''), [(u) => u.includes('/listing'), () => refusal]]);
    const existing = [{ id: 1, price: 20000, last_seen: '2026-11-13', first_seen: '2026-11-10', prices: [['2026-11-10', 20000]] }];
    const { status, listings } = await scan(site, { searchesText: SEARCH + '\n' + SEARCH + '&x=1', existing });
    assert.equal(status.ok, false);
    assert.ok(status.stopped);
    assert.equal(site.calls.length, 2);                               // robots + the refused page; the second search is never requested
    assert.deepEqual(listings, existing);
  }
});

test('robots.txt is obeyed', async () => {
  const blocked = fakeSite([robots('User-agent: *\nDisallow: /used-cars/\n'), [(u) => u.includes('/listing'), () => ({ body: buildPage() })]]);
  const a = await scan(blocked);
  assert.equal(blocked.calls.length, 1);
  assert.equal(a.status.ok, false);
  assert.ok(a.status.searches[0].note.includes('robots.txt does not allow'));
  const refused = fakeSite([robots('', 403)]);
  const b = await scan(refused);
  assert.equal(refused.calls.length, 1);
  assert.ok(b.status.stopped.includes('robots.txt'));
  const slow = fakeSite([robots('User-agent: *\nCrawl-delay: 20\n'), [(u) => u.includes('/listing'), () => ({ body: buildPage() })]]);
  await scan(slow);
  assert.deepEqual(slow.sleeps, [20]);
  const eager = fakeSite([robots(''), [(u) => u.includes('/listing'), () => ({ body: buildPage() })]]);
  await scan(eager, { config: { delay_seconds: 0 } });
  assert.deepEqual(eager.sleeps, [5]);                                // never under 5 seconds
});

test('price history across scans; old listings dropped after keep_days', () => {
  const car = (price) => ({ id: 7, title: 'Toyota Vios 1.5A', price, depn: 13000, mileage: 80000 });
  let stored = mergeListings([], [car(30000)], '2026-11-14', 14);
  stored = mergeListings(stored, [car(30000)], '2026-11-15', 14);
  stored = mergeListings(stored, [{ ...car(28800), mileage: null }], '2026-11-16', 14);
  assert.deepEqual(stored[0].prices, [['2026-11-14', 30000], ['2026-11-16', 28800]]);
  assert.equal(stored[0].first_seen, '2026-11-14');
  assert.equal(stored[0].last_seen, '2026-11-16');
  assert.equal(stored[0].mileage, 80000);                             // a blank does not erase an earlier value
  stored = mergeListings(stored, [{ id: 8, title: 'Other', price: 1 }], '2026-11-20', 14);
  assert.equal(stored.find((l) => l.id === 7).in_last_scan, false);
  stored = mergeListings(stored, [{ id: 8, title: 'Other', price: 1 }], '2026-12-05', 14);
  assert.deepEqual(stored.map((l) => l.id), [8]);
});

test('listings file is valid JSON, one listing per line', async () => {
  const site = fakeSite([robots(''), [(u) => u.includes('/listing'), () => ({ body: buildPage() })]]);
  const { status, listings } = await scan(site);
  const text = serialiseListings(listings, status);
  const back = JSON.parse(text);
  assert.equal(back.count, 4);
  assert.equal(back.listings[0].id, Math.min(...sampleRecords.map((r) => r.id)));
  assert.equal(text.split('\n').filter((l) => l.includes('"id"')).length, 4);
});

test('empty searches.txt is reported, nothing is requested', async () => {
  const site = fakeSite([]);
  const { status } = await scan(site, { searchesText: '# nothing yet\n' });
  assert.equal(site.calls.length, 0);
  assert.equal(status.ok, false);
  assert.ok(status.messages[0].includes('searches.txt has no search links'));
});
