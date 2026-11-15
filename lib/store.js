// How listings are stored in data/listings.json. Shared by the scheduled scan (Node) and the
// dashboard (browser), so both keep first-seen dates and price history the same way.

export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** Today's date in Singapore (UTC+8) as YYYY-MM-DD. */
export const sgToday = (now = new Date()) => new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

/** Adds newly read listings to the stored ones, keeping first-seen dates and price history. */
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

/** The text of data/listings.json: valid JSON with one listing per line. */
export function serialiseListings(listings, status) {
  const head = { updated: status.finished, today: status.today, source: 'https://www.sgcarmart.com/used-cars/listing', count: listings.length };
  return '{\n' + Object.entries(head).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n') +
    '\n "listings": [\n' + listings.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n ]\n}\n';
}
