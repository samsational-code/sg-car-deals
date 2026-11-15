// Scheduled scan: reads the SGCarMart searches listed in searches.txt and updates data/listings.json.
//
// What it will and will not do:
//   * reads only search-results pages on www.sgcarmart.com/used-cars/listing - never individual
//     car pages, never anything behind a login;
//   * reads robots.txt first and skips anything that file disallows;
//   * waits between requests (scanner.config.json "delay_seconds", never under 5 seconds, longer
//     if robots.txt asks for it) and never makes more than "max_requests_per_run" requests;
//   * identifies itself honestly in the User-Agent header;
//   * stops the whole run, without retrying, if the site answers 401, 403 or 429 or shows a
//     bot check. data/status.json then says so and the dashboard shows it.
//
// Run by .github/workflows/scan.yml. To run it yourself: `node scripts/fetch.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListingPage, looksLikeChallenge } from '../lib/parse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'www.sgcarmart.com';
const LISTING_PATH = '/used-cars/listing';
const MIN_DELAY_SECONDS = 5;
const STOP_CODES = new Set([401, 403, 429]);
export const UA_TOKEN = 'sg-car-deals';

export const DEFAULT_CONFIG = {
  max_pages_per_search: 10,
  max_requests_per_run: 30,
  delay_seconds: 8,
  page_param: 'page',
  keep_days: 14,
  timeout_seconds: 30,
};

// ---------- robots.txt ----------

export function parseRobots(text) {
  const groups = [];
  let current = null, lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { current = { agents: [], rules: [], crawlDelay: null }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'disallow' || key === 'allow') { if (value) current.rules.push({ allow: key === 'allow', path: value }); }
    else if (key === 'crawl-delay') { const n = Number(value); if (Number.isFinite(n)) current.crawlDelay = n; }
  }
  return groups;
}

function groupFor(groups, token) {
  const t = token.toLowerCase();
  let best = null, bestLen = -1;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a !== '*' && t.includes(a) && a.length > bestLen) { best = g; bestLen = a.length; }
    }
  }
  return best || groups.find((g) => g.agents.includes('*')) || null;
}

function ruleMatches(pattern, target) {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + body + (anchored ? '$' : '')).test(target);
}

/** Longest matching rule wins; Allow wins a tie. `target` is path plus query string. */
export function robotsAllows(groups, token, target) {
  const g = groupFor(groups, token);
  if (!g) return true;
  let verdict = true, len = -1;
  for (const r of g.rules) {
    if (!ruleMatches(r.path, target)) continue;
    if (r.path.length > len || (r.path.length === len && r.allow)) { verdict = r.allow; len = r.path.length; }
  }
  return verdict;
}

export function crawlDelay(groups, token) {
  const g = groupFor(groups, token);
  return g && g.crawlDelay ? g.crawlDelay : 0;
}

// ---------- searches ----------

export function readSearches(text) {
  const urls = [], rejected = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let u;
    try { u = new URL(line); } catch { rejected.push(line); continue; }
    if (u.protocol !== 'https:' || u.hostname !== HOST || !u.pathname.startsWith(LISTING_PATH)) { rejected.push(line); continue; }
    u.hash = '';
    if (!urls.includes(u.href)) urls.push(u.href);
  }
  return { urls, rejected };
}

function pageUrl(search, page, pageParam) {
  const u = new URL(search);
  if (page > 1) u.searchParams.set(pageParam, String(page));
  return u.href;
}

// ---------- merge ----------

const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** Adds this scan's listings to the stored ones, keeping first-seen dates and price history. */
export function mergeListings(existing, found, today, keepDays) {
  const byId = new Map(existing.map((l) => [l.id, { ...l, in_last_scan: false }]));
  for (const f of found) {
    if (f.id == null) continue;
    const old = byId.get(f.id);
    if (!old) {
      byId.set(f.id, { ...f, first_seen: today, last_seen: today, prices: f.price ? [[today, f.price]] : [], in_last_scan: true });
      continue;
    }
    const prices = Array.isArray(old.prices) ? [...old.prices] : [];
    const lastPrice = prices.length ? prices[prices.length - 1][1] : null;
    if (f.price && f.price !== lastPrice) prices.push([today, f.price]);
    // A value the site left out this time must not erase one read earlier.
    const merged = { ...old };
    for (const [k, v] of Object.entries(f)) if (v !== null && v !== undefined && v !== '') merged[k] = v;
    byId.set(f.id, { ...merged, first_seen: old.first_seen || today, last_seen: today, prices, in_last_scan: true });
  }
  return [...byId.values()]
    .filter((l) => daysBetween(l.last_seen, today) <= keepDays)
    .sort((a, b) => a.id - b.id);
}

// ---------- the scan ----------

function sgToday(now) {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);   // Singapore is UTC+8
}

/**
 * Runs one scan. Everything that touches the outside world is passed in, so tests can replace it.
 * Returns {status, listings}.
 */
export async function runScan({ searchesText, config = {}, existing = [], fetchImpl = fetch, sleep, now = new Date(), userAgent, log = () => {} }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  sleep = sleep || ((s) => new Promise((r) => setTimeout(r, s * 1000)));
  const today = sgToday(now);
  const status = { started: now.toISOString(), finished: null, today, ok: false, requests: 0, robots: null,
    stopped: null, searches: [], messages: [], listings_found: 0, user_agent: userAgent };
  const { urls, rejected } = readSearches(searchesText);
  for (const r of rejected) status.messages.push(`Ignored a line in searches.txt that is not an SGCarMart used-car search: ${r.slice(0, 120)}`);
  if (!urls.length) {
    status.messages.push('searches.txt has no search links. Paste at least one SGCarMart used-car search address into it.');
    return finish(status, existing, [], today, cfg);
  }

  const get = async (url) => {
    status.requests++;
    const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow', signal: AbortSignal.timeout(cfg.timeout_seconds * 1000) });
    return { code: res.status, text: await res.text() };
  };

  // robots.txt first
  let robots;
  try {
    const r = await get(`https://${HOST}/robots.txt`);
    if (r.code === 200) { robots = parseRobots(r.text); status.robots = 'read'; }
    else if (r.code === 401 || r.code === 403) { status.robots = `refused (HTTP ${r.code})`; status.stopped = `robots.txt answered HTTP ${r.code}: the site is refusing this scanner`; }
    else if (r.code >= 400 && r.code < 500) { robots = []; status.robots = `none (HTTP ${r.code})`; }
    else { status.robots = `unreadable (HTTP ${r.code})`; status.stopped = 'robots.txt could not be read, so nothing was requested'; }
  } catch (e) {
    status.robots = 'unreachable'; status.stopped = `could not reach ${HOST} (${e.name || 'error'})`;
  }
  if (status.stopped) return finish(status, existing, [], today, cfg);

  const delay = Math.max(MIN_DELAY_SECONDS, cfg.delay_seconds, crawlDelay(robots, UA_TOKEN));
  const found = new Map();

  outer:
  for (const search of urls) {
    const s = { url: search, pages_read: 0, last_page: null, total: null, listings: 0, basis: null, note: null };
    status.searches.push(s);
    let firstIds = null;
    for (let page = 1; page <= cfg.max_pages_per_search; page++) {
      if (status.requests >= cfg.max_requests_per_run) { s.note = `Stopped at the limit of ${cfg.max_requests_per_run} requests per run.`; break outer; }
      const url = pageUrl(search, page, cfg.page_param);
      const u = new URL(url);
      if (!robotsAllows(robots, UA_TOKEN, u.pathname + u.search)) { s.note = 'robots.txt does not allow this address, so it was not requested.'; break; }
      await sleep(delay);
      let r;
      try { r = await get(url); } catch (e) { s.note = `Request failed (${e.name || 'error'}).`; break; }
      if (STOP_CODES.has(r.code) || (r.code === 200 && looksLikeChallenge(r.text))) {
        status.stopped = r.code === 200 ? 'the site showed a bot check' : `the site answered HTTP ${r.code}`;
        s.note = 'Refused by the site.';
        break outer;
      }
      if (r.code !== 200) { s.note = `HTTP ${r.code}.`; break; }
      const parsed = parseListingPage(r.text);
      s.basis = parsed.basis;
      if (parsed.basis === 'none') { s.note = parsed.warnings.join(' '); break; }
      const ids = parsed.listings.map((l) => l.id).join(',');
      if (page === 1) {
        firstIds = ids;
        s.last_page = parsed.meta?.last_page ?? null;
        s.total = parsed.meta?.total ?? null;
      } else if ((parsed.meta?.current_page != null && parsed.meta.current_page !== page) || ids === firstIds) {
        // The site ignored our page number and sent page 1 again.
        s.note = `Only the first page could be read: the site did not recognise "${cfg.page_param}=${page}". See README, "If only the first page is read".`;
        break;
      }
      s.pages_read = page;
      for (const l of parsed.listings) { if (l.id != null && !found.has(l.id)) { found.set(l.id, l); s.listings++; } }
      log(`${search} page ${page}: ${parsed.listings.length} listings (${parsed.basis})`);
      if (!parsed.listings.length || (s.last_page != null && page >= s.last_page)) break;
    }
    if (!s.note && s.last_page != null && s.pages_read < s.last_page) {
      s.note = `Read ${s.pages_read} of ${s.last_page} pages (limit "max_pages_per_search"). Narrow the search or raise the limit.`;
    }
  }
  return finish(status, existing, [...found.values()], today, cfg);
}

function finish(status, existing, found, today, cfg) {
  status.listings_found = found.length;
  status.ok = !status.stopped && found.length > 0;
  if (!status.stopped && !found.length && !status.messages.length) status.messages.push('No listings were read. Check the notes for each search.');
  status.finished = new Date().toISOString();
  // If nothing was read, leave the stored listings exactly as they were.
  const listings = found.length ? mergeListings(existing, found, today, cfg.keep_days) : existing;
  return { status, listings };
}

export function serialiseListings(listings, status) {
  const head = { updated: status.finished, today: status.today, source: 'https://www.sgcarmart.com/used-cars/listing', count: listings.length };
  return '{\n' + Object.entries(head).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n') +
    '\n "listings": [\n' + listings.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n ]\n}\n';
}

// ---------- command line ----------

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function main() {
  const statusFile = path.join(ROOT, 'data', 'status.json');
  if (process.argv.includes('--check-status')) {
    const s = readJson(statusFile, null);
    if (!s || !s.ok) { console.error('The last scan did not complete:', s ? (s.stopped || s.messages.join(' ') || 'no listings read') : 'no status file'); process.exit(1); }
    console.log(`Last scan OK: ${s.listings_found} listings, ${s.requests} requests.`);
    return;
  }
  const config = readJson(path.join(ROOT, 'scanner.config.json'), {});
  const searchesText = fs.existsSync(path.join(ROOT, 'searches.txt')) ? fs.readFileSync(path.join(ROOT, 'searches.txt'), 'utf8') : '';
  const stored = readJson(path.join(ROOT, 'data', 'listings.json'), { listings: [] });
  const repo = process.env.GITHUB_REPOSITORY;
  const userAgent = `${UA_TOKEN}/1.0 (personal used-car dashboard${repo ? `; +https://github.com/${repo}` : ''})`;
  const { status, listings } = await runScan({ searchesText, config, existing: stored.listings || [], userAgent, log: console.log });
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(statusFile, JSON.stringify(status, null, 1) + '\n');
  if (status.listings_found) fs.writeFileSync(path.join(ROOT, 'data', 'listings.json'), serialiseListings(listings, status));
  console.log(`Requests: ${status.requests}. Listings read: ${status.listings_found}. Stored: ${listings.length}.`);
  for (const s of status.searches) console.log(` - ${s.url}\n   pages ${s.pages_read}${s.last_page ? '/' + s.last_page : ''}, listings ${s.listings}${s.note ? '. ' + s.note : ''}`);
  for (const m of status.messages) console.log(' ! ' + m);
  if (status.stopped) console.log(' STOPPED: ' + status.stopped + '. Nothing is retried; see README, "If the scan is refused".');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
