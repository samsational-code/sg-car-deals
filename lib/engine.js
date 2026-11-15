// Valuation and deal rating. No dependencies; runs in the browser and in Node (tests).
//
// The method, in one paragraph: a used car's price is mostly prepaid depreciation. Each listing's
// yearly depreciation is compared with what that model normally depreciates at, and that norm is
// scaled to the COE price you enter. COE parity (COE price / 10 per year) is shown as a
// yardstick only. Reliability, running costs, PARF and how long the COE has left make up the
// rest of the 0-100 score.

/** COE prices on the day the benchmark table (data/price_guide.json) was read. */
export const REFERENCE = { asOf: '2026-11-13', coe: { A: 139001, B: 132334 }, coeResultDate: '2026-11-04' };

export const DEFAULT_SETTINGS = {
  coeA: REFERENCE.coe.A,     // S$, Category A 10-year COE price: you update this
  coeB: REFERENCE.coe.B,     // S$, Category B
  passThrough: 1.0,          // ASSUMPTION: share of a COE move that feeds through to used-car depreciation
  rate: 0.03,                // return forgone on money tied up in the car (try 0.08)
  annualKm: 12000,
  petrol: 2.90,              // S$ per litre
  electricity: 0.60,         // S$ per kWh, ASSUMPTION
  erpPerYear: 242,
  parkingPerYear: 0,
};

export const RULES = {
  targetDiscount: 0.05,      // maximum price = depreciation 5% below the model's norm
  minComparables: 5,         // same model, +/- 1 registration year, needed to trust a live median
  comparableWeight: 0.5,
  oldCarAge: 10, oldCarMaintenanceFactor: 1.4, oldCarReserveFactor: 2.0,
  batteryWarrantyYears: 8, batteryWarrantyKm: 160000,          // ASSUMPTION: check each car's warranty
  weights: { price: 30, depreciation: 15, reliability: 15, maintenance: 10, coe_window: 10, parts: 5, parf: 5, mileage: 5, battery: 5 },
  priceGapFullMarks: 0.125,
  depreciationBest: 11000, depreciationWorst: 20000,           // at the reference COE; scaled with your COE input
  maintenanceBest: 1000, maintenanceWorst: 4500,
  parfShareFullMarks: 0.30,
  coeWindow: [[1.0, 40], [1.5, 75], [3.0, 100], [5.0, 70], [7.0, 50], [99, 35]],
  exceptional: { minScore: 80, minGap: 0.08 }, attractive: { minScore: 70, minGap: 0 },
  overpricedGap: -0.08, avoidReliabilityBelow: 50,
  minScale: 0.3,
};

export const COMMERCIAL_TYPES = ['van', 'truck', 'bus', 'bus/mini bus', 'others'];
// Result cards do not show the vehicle type, so when it is missing, common van and truck names are
// recognised by name. Not exhaustive: filter your search to passenger cars on the site as well.
const COMMERCIAL_NAMES = new RegExp('\\b(' + ['nv200', 'nv350', 'nv100', 'vanette', 'cabstar', 'nt100', 'hiace', 'liteace', 'townace', 'dyna', 'hilux',
  'proace', 'every', 'carry', 'hijet', 'gran max', 'fuso', 'canter', 'isuzu', 'hino', 'ud trucks', 'scania', 'berlingo', 'dispatch', 'jumpy', 'partner',
  'expert', 'boxer', 'kangoo', 'trafic', 'master', 'combo', 'vivaro', 'movano', 'caddy', 'transporter', 'crafter', 'fiorino', 'doblo', 'ducato', 'scudo',
  'transit', 'ranger', 'vito', 'sprinter', 'citan', 'k2700', 'bongo', 'porter', 'h-?1', 'n-?van', 'maxus', 'dfsk', 'foton', 'farizon', 'sokon', 'golden dragon',
  'byd t3', 'e-?nv200', 'triton', 'navara', 'd-?max', 'cargo', 'panel van', 'lorry'].join('|') + ')\\b', 'i');
export const looksCommercial = (listing) => {
  const type = String(listing.type || '').toLowerCase();
  if (type) return COMMERCIAL_TYPES.includes(type);
  return COMMERCIAL_NAMES.test(String(listing.title || ''));
};

const UNKNOWN_MODEL = { fuel: 'petrol', engine_cc: null, power_kw: null, consumption: 7.0, maint_per_year: 1300,
  repair_reserve: 900, insurance: 1400, reliability: 65, parts: 65, flag: 'unknown', coe_cat: null,
  notes: 'Model not in the reference table; reliability and running costs are generic.' };
const UNKNOWN_EV = { ...UNKNOWN_MODEL, fuel: 'electric', consumption: 16.5, maint_per_year: 600, repair_reserve: 500, insurance: 1900, parts: 55 };

export const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
export const scale = (x, best, worst) => clamp((100 * (worst - x)) / (worst - best));
const DAY = 86400000;
const toDate = (iso) => new Date(iso + 'T00:00:00Z');
export const yearsBetween = (a, b) => (toDate(b) - toDate(a)) / DAY / 365.25;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const money = (x) => 'S$' + Math.round(x).toLocaleString('en-SG');

/** Annual road tax (two six-monthly payments) with the age surcharge. LTA formulas read 13 Nov 2026. */
export function roadTaxPerYear(fuel, cc, kw, ageYears = 0) {
  let six;
  if (fuel === 'electric') {
    if (kw == null) return null;
    let base;
    if (kw <= 7.5) base = 200;                               // band not re-checked against LTA
    else if (kw <= 30) base = 200 + 2 * (kw - 7.5);          // band not re-checked against LTA
    else if (kw <= 230) base = 250 + 3.75 * (kw - 30);
    else base = 1525 + 10 * (kw - 230);
    six = base * 0.782 + 350;
  } else {
    if (cc == null) return null;
    let base;
    if (cc <= 600) base = 200;                               // band not re-checked against LTA
    else if (cc <= 1000) base = 200 + 0.125 * (cc - 600);
    else if (cc <= 1600) base = 250 + 0.375 * (cc - 1000);
    else if (cc <= 3000) base = 475 + 0.75 * (cc - 1600);
    else base = 1525 + 1.0 * (cc - 3000);                    // band not re-checked against LTA
    six = base * 0.782;
  }
  const surcharge = ageYears > 10 ? Math.min(0.5, 0.1 * (Math.floor(ageYears - 10) + 1)) : 0;
  return Math.round(six * 2 * (1 + surcharge) * 100) / 100;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Longest alias found in the title wins, so "byd sealion 7" beats "byd seal". */
export function matchModel(listing, models) {
  const text = String(listing.title || '').toLowerCase().replace(/\s+/g, ' ');
  let best = null, bestLen = 0;
  for (const ref of models) {
    for (const alias of ref.aliases) {
      if (alias.length > bestLen && new RegExp('(?<![a-z0-9])' + escapeRe(alias) + '(?![a-z0-9])').test(text)) { best = ref; bestLen = alias.length; }
    }
  }
  if (best) return { ...best, known: true };
  const words = String(listing.title || 'Unknown').split(/\s+/);
  const base = listing.fuel === 'electric' ? UNKNOWN_EV : UNKNOWN_MODEL;
  return { ...base, make: listing.make || words[0] || 'Unknown', model: listing.model || words[1] || '', aliases: [], known: false };
}

export function guideLookup(guide, make, model, regYear) {
  if (regYear == null) return null;
  for (const year of [regYear, regYear - 1, regYear + 1]) {
    const hit = guide.find((g) => g.make.toLowerCase() === make.toLowerCase() && g.model.toLowerCase() === model.toLowerCase() && g.reg_year === year);
    if (hit) return { ...hit, year, exact: year === regYear };
  }
  return null;
}

/** Power in kW when the listing title states it ("... Electric 100 kW 49.9 kWh"). */
export function powerFromTitle(title) {
  const m = String(title || '').match(/(\d{2,3}(?:\.\d)?)\s?kW(?!h)/i);
  return m ? Number(m[1]) : null;
}

/**
 * COE category of the car itself. A: up to 1,600cc and 97 kW (electric: up to 110 kW). B: the rest.
 * A listing shows engine size but not power, so this is an estimate unless the title states kW.
 */
export function coeCategory(listing, ref) {
  const fuel = listing.fuel || ref.fuel;
  if (fuel === 'electric') {
    const kw = powerFromTitle(listing.title);
    if (kw != null) return { cat: kw <= 110 ? 'A' : 'B', basis: 'power in the title' };
    if (ref.known && ref.coe_cat) return { cat: ref.coe_cat, basis: 'model table' };
    return { cat: 'B', basis: 'assumed (power not shown)' };
  }
  const cc = listing.cc ?? ref.engine_cc;
  if (cc != null && cc > 1600) return { cat: 'B', basis: 'engine size' };
  if (ref.known && ref.coe_cat) return { cat: ref.coe_cat, basis: 'model table' };
  if (cc != null) return { cat: 'A', basis: 'engine size (power not shown)' };
  return { cat: null, basis: 'unknown' };
}

/** Years of COE left, and whether the COE has been renewed. `today` is an ISO date. */
export function prepare(listing, today) {
  if (listing.override) return { ok: listing.override.years_left > 0.05 && !!listing.price, ...listing.override };
  if (looksCommercial(listing)) return { ok: false, reason: 'commercial' };
  if (!listing.price) return { ok: false, reason: 'no price' };
  const age = listing.reg ? yearsBetween(listing.reg, today) : null;
  const regYear = listing.reg ? Number(listing.reg.slice(0, 4)) : null;
  // A first COE runs 10 years from registration and ends the day before the anniversary.
  let left10 = null;
  if (listing.reg) {
    const d = toDate(listing.reg);
    const expiry = Date.UTC(d.getUTCFullYear() + 10, d.getUTCMonth(), d.getUTCDate()) - DAY;
    left10 = (expiry - toDate(today)) / DAY / 365.25;
  }
  // The site's "1y 6m" drops the days, so add half a month; then age it from the day it was read.
  let siteLeft = null;
  if (listing.coe_left_m != null) {
    siteLeft = (listing.coe_left_m + 0.5) / 12 - (listing.last_seen ? Math.max(0, yearsBetween(listing.last_seen, today)) : 0);
  }
  let yearsLeft, renewed = false, note = null;
  if (left10 != null && left10 > 0 && (siteLeft == null || Math.abs(left10 - siteLeft) <= 0.2)) {
    yearsLeft = left10;
  } else if (siteLeft != null) {
    yearsLeft = siteLeft;
    renewed = age != null && age > 10;
    if (!renewed) note = 'COE term does not run 10 years from the registration date shown (imported used, or a different COE term).';
  } else {
    return { ok: false, reason: 'COE left not shown' };
  }
  if (yearsLeft <= 0.05) return { ok: false, reason: 'COE about to end' };
  return { ok: true, years_left: yearsLeft, renewed, age, reg_year: regYear, note };
}

function firstPass(listing, prep) {
  let paper, basis;
  if (prep.renewed) { paper = 0; basis = 'none (renewed COE)'; }
  else if (listing.depn) { paper = Math.max(0, listing.price - listing.depn * prep.years_left); basis = 'stated depreciation'; }
  else return null;
  paper = Math.min(paper, listing.price);
  return { paper, basis, depn: (listing.price - paper) / prep.years_left };
}

function batteryScore(listing, fuel, age) {
  if (fuel !== 'electric') return null;
  if (age == null) return 40;
  const years = Math.max(0, RULES.batteryWarrantyYears - age) / RULES.batteryWarrantyYears;
  const km = Math.max(0, RULES.batteryWarrantyKm - (listing.mileage || 0)) / RULES.batteryWarrantyKm;
  const cover = Math.min(years, km);
  return cover <= 0 ? 10 : 30 + 70 * cover;      // battery health is never shown in a listing, so never full marks
}

function coeWindowScore(yearsLeft) {
  for (const [upTo, score] of RULES.coeWindow) if (yearsLeft <= upTo) return score;
  return 35;
}

/** How much the reference benchmarks are scaled for the COE price entered. 1.0 at the reference COE. */
export function coeScale(cat, settings) {
  const now = cat === 'B' ? settings.coeB : cat === 'A' ? settings.coeA : Math.min(settings.coeA, settings.coeB);
  const ref = cat === 'B' ? REFERENCE.coe.B : cat === 'A' ? REFERENCE.coe.A : Math.min(REFERENCE.coe.A, REFERENCE.coe.B);
  return { now, f: Math.max(RULES.minScale, 1 + settings.passThrough * (now / ref - 1)) };
}

export function valueListing(listing, prep, base, ref, g, comparables, settings) {
  const R = RULES;
  const { years_left: yearsLeft, age } = prep;
  const { paper, depn } = base;
  const price = listing.price;
  const fuel = listing.fuel || ref.fuel;
  const { cat, basis: catBasis } = coeCategory(listing, ref);
  const { now: coeNow, f } = coeScale(cat, settings);
  const parity = coeNow / 10;

  // ---- fair depreciation: the model's norm scaled to today's COE, and/or live comparable listings ----
  const compMedian = comparables.length >= R.minComparables ? median(comparables) : null;
  const guideDepn = g ? g.typical_depn * f : null;
  let fairDepn = null, fairBasis = 'none';
  if (guideDepn != null && compMedian != null) { fairDepn = R.comparableWeight * compMedian + (1 - R.comparableWeight) * guideDepn; fairBasis = 'blend'; }
  else if (guideDepn != null) { fairDepn = guideDepn; fairBasis = 'price_guide'; }
  else if (compMedian != null) { fairDepn = compMedian; fairBasis = 'comparables'; }

  let fairValue = null, gap = null, maxPrice = null;
  if (fairDepn != null) {
    fairValue = paper + fairDepn * yearsLeft;
    gap = (fairValue - price) / fairValue;
    maxPrice = Math.floor((paper + fairDepn * (1 - R.targetDiscount) * yearsLeft) / 100) * 100;
  }

  // ---- running costs ----
  const old = age != null && age > R.oldCarAge;
  const maint = ref.maint_per_year * (old ? R.oldCarMaintenanceFactor : 1);
  const reserve = ref.repair_reserve * (old ? R.oldCarReserveFactor : 1);
  const cc = listing.cc ?? ref.engine_cc;
  const kw = powerFromTitle(listing.title) ?? ref.power_kw;
  const roadTax = roadTaxPerYear(fuel, cc, kw, age || 0);
  const energy = (settings.annualKm * ref.consumption) / 100 * (fuel === 'electric' ? settings.electricity : settings.petrol);
  const capital = settings.rate * (price + paper) / 2;
  const tco = depn + maint + reserve + ref.insurance + (roadTax || 0) + energy + capital + settings.erpPerYear + settings.parkingPerYear;

  // ---- component scores (0-100) ----
  const scPrice = gap == null ? 50 : clamp(50 + (gap / R.priceGapFullMarks) * 50);
  const scDepn = scale(depn, R.depreciationBest * f, R.depreciationWorst * f);
  let reliability = ref.reliability - (old ? 10 : 0);
  const kmPerYear = listing.mileage && age ? listing.mileage / Math.max(age, 0.5) : null;
  if (kmPerYear != null && kmPerYear > 20000) reliability -= 5;
  reliability = clamp(reliability);
  const scMaint = scale(maint + reserve, R.maintenanceBest, R.maintenanceWorst);
  const scWindow = coeWindowScore(yearsLeft);
  const scParf = clamp((100 * (paper / price)) / R.parfShareFullMarks);
  let scMileage;
  if (kmPerYear == null) scMileage = 50;
  else if (kmPerYear <= 10000) scMileage = 100;
  else if (kmPerYear <= 15000) scMileage = 100 - ((kmPerYear - 10000) / 5000) * 30;
  else scMileage = clamp(70 - ((kmPerYear - 15000) / 10000) * 50);
  const scBattery = batteryScore(listing, fuel, age);

  const parts = { price: scPrice, depreciation: scDepn, reliability, maintenance: scMaint, coe_window: scWindow,
    parts: ref.parts, parf: scParf, mileage: scMileage };
  if (scBattery != null) parts.battery = scBattery;
  let wsum = 0, total = 0;
  for (const k of Object.keys(parts)) { wsum += R.weights[k]; total += parts[k] * R.weights[k]; }
  const score = total / wsum;

  // ---- confidence ----
  const thinGuide = g != null && (g.basis !== 'price_guide' || g.listings < 5 || !g.exact);
  let confidence;
  if (fairDepn == null || !ref.known) confidence = 'low';
  else if (fairBasis === 'price_guide' && thinGuide) confidence = 'medium';
  else confidence = 'high';

  // ---- rating ----
  let rating;
  if (ref.flag === 'avoid' || reliability < R.avoidReliabilityBelow || (scBattery != null && scBattery <= 10)) rating = 'Avoid';
  else if (gap != null && gap <= R.overpricedGap) rating = 'Overpriced';
  else if (gap != null && score >= R.exceptional.minScore && gap >= R.exceptional.minGap && confidence !== 'low' && ref.flag === 'ok') rating = 'Exceptional';
  else if (score >= R.attractive.minScore && (gap == null || gap >= R.attractive.minGap)) rating = 'Attractive';
  else rating = 'Fair';

  const v = {
    rated: true, rating, score: Math.round(score * 10) / 10, confidence,
    years_left: yearsLeft, renewed: !!prep.renewed, age,
    paper_value: Math.round(paper), paper_basis: base.basis, depn: Math.round(depn),
    coe_cat: cat, coe_cat_basis: catBasis, parity: Math.round(parity), parity_ratio: depn / parity, coe_scale: f,
    fair_depn: fairDepn == null ? null : Math.round(fairDepn), fair_basis: fairBasis, n_comparables: comparables.length,
    guide: g ? { depn: g.typical_depn, year: g.year, listings: g.listings, exact: g.exact } : null,
    fair_value: fairValue == null ? null : Math.round(fairValue), gap_pct: gap == null ? null : Math.round(gap * 1000) / 10, max_price: maxPrice,
    costs: { depreciation: Math.round(depn), servicing: Math.round(maint), repairs: Math.round(reserve), insurance: Math.round(ref.insurance),
      road_tax: roadTax == null ? null : Math.round(roadTax), energy: Math.round(energy), capital: Math.round(capital),
      erp: Math.round(settings.erpPerYear), parking: Math.round(settings.parkingPerYear) },
    tco: Math.round(tco), remaining_cost: Math.round(tco * yearsLeft),
    scores: Object.fromEntries(Object.entries(parts).map(([k, x]) => [k, Math.round(x)])),
    km_per_year: kmPerYear == null ? null : Math.round(kmPerYear),
    model_known: ref.known, model_flag: ref.flag, model_name: `${ref.make} ${ref.model}`.trim(),
  };
  v.why = explain(listing, prep, ref, v, fuel);
  return v;
}

function explain(listing, prep, ref, v, fuel) {
  const bits = [];
  if (v.gap_pct == null) {
    bits.push('No benchmark for this model and year yet, so the price is judged on depreciation alone.');
  } else {
    const src = { price_guide: "the model's norm at this COE price", comparables: 'similar cars listed now', blend: "the model's norm and similar cars listed now" }[v.fair_basis];
    bits.push(`Asking is ${Math.abs(v.gap_pct).toFixed(1)}% ${v.gap_pct >= 0 ? 'below' : 'above'} fair value: depreciation ${money(v.depn)}/yr against ${money(v.fair_depn)} from ${src}.`);
  }
  bits.push(`${v.parity_ratio.toFixed(2)}× COE parity (Cat ${v.coe_cat || '?'}: ${money(v.parity)}/yr).`);
  if (v.renewed) bits.push('COE has been renewed, so nothing comes back at the end.');
  else bits.push(`About ${money(v.paper_value)} comes back as PARF when the COE ends (${Math.round((v.paper_value / listing.price) * 100)}% of the price).`);
  if (prep.note) bits.push(prep.note);
  if (ref.flag === 'caution' || ref.flag === 'avoid') bits.push(ref.notes);
  if (!ref.known) bits.push(ref.notes);
  if (fuel === 'electric') bits.push('Battery health is not in the listing: get a diagnostic report before paying.');
  if (fuel === 'diesel') bits.push('Diesel: road tax here leaves out the diesel special tax.');
  if (listing.scheme) bits.push(`Scheme: ${listing.scheme}.`);
  if (listing.imported_used) bits.push('Imported used.');
  if ((listing.owners || 0) >= 3) bits.push(`${listing.owners} owners.`);
  if (v.km_per_year != null && v.km_per_year > 20000) bits.push(`High mileage: about ${Math.round(v.km_per_year / 1000)},000 km a year.`);
  if (v.max_price && (v.rating === 'Exceptional' || v.rating === 'Attractive')) bits.push(`Pay no more than ${money(v.max_price)}.`);
  if (v.confidence !== 'high') bits.push(`Confidence ${v.confidence}.`);
  return bits.join(' ');
}

/**
 * Rates every listing. Returns [{listing, v}] in the input order; v.rated is false (with v.reason)
 * for listings that cannot be rated (vans and trucks, no price, COE left not shown).
 */
export function rateAll(listings, { settings = DEFAULT_SETTINGS, models, guide, today }) {
  const prepared = listings.map((l) => {
    const prep = prepare(l, today);
    if (!prep.ok) return { l, prep, base: null, ref: null };
    const base = firstPass(l, prep);
    const ref = matchModel(l, models);
    return { l, prep, base, ref };
  });
  const groups = new Map();
  for (const p of prepared) {
    if (!p.base || p.l.status === 'sold' || p.prep.reg_year == null) continue;
    const key = `${p.ref.make}|${p.ref.model}|${p.prep.renewed ? 1 : 0}`.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return prepared.map((p) => {
    if (!p.prep.ok) return { listing: p.l, v: { rated: false, reason: p.prep.reason } };
    if (!p.base) return { listing: p.l, v: { rated: false, reason: 'depreciation not shown' } };
    const key = `${p.ref.make}|${p.ref.model}|${p.prep.renewed ? 1 : 0}`.toLowerCase();
    const comps = (groups.get(key) || [])
      .filter((q) => q !== p && p.prep.reg_year != null && Math.abs(q.prep.reg_year - p.prep.reg_year) <= 1)
      .map((q) => q.base.depn);
    const g = guideLookup(guide, p.ref.make, p.ref.model, p.prep.reg_year);
    return { listing: p.l, v: valueListing(p.l, p.prep, p.base, p.ref, g, comps, settings) };
  });
}
