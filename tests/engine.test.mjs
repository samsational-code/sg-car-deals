import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rateAll, prepare, roadTaxPerYear, coeCategory, matchModel, coeScale, looksCommercial, DEFAULT_SETTINGS, REFERENCE } from '../lib/engine.js';
import { parseListingPage } from '../lib/parse.js';
import { buildPage } from './helpers.mjs';

const models = JSON.parse(fs.readFileSync(new URL('../data/models.json', import.meta.url), 'utf8')).models;
const guide = JSON.parse(fs.readFileSync(new URL('../data/price_guide.json', import.meta.url), 'utf8')).rows;
const TODAY = '2026-11-14';
const sample = () => parseListingPage(buildPage()).listings.map((l) => ({ ...l, last_seen: TODAY }));
const rate = (listings, settings = {}) => rateAll(listings, { settings: { ...DEFAULT_SETTINGS, ...settings }, models, guide, today: TODAY });

test('road tax follows the LTA formula', () => {
  assert.equal(roadTaxPerYear('petrol', 1496, null, 5), 681.9);          // [250 + 0.375 x 496] x 0.782 x 2
  assert.equal(roadTaxPerYear('petrol', 1984, null, 5), 1193.33);        // [475 + 0.75 x 384] x 0.782 x 2
  assert.equal(roadTaxPerYear('electric', null, 150, 2), 1794.8);        // ([250 + 3.75 x 120] x 0.782 + 350) x 2
  assert.equal(roadTaxPerYear('petrol', 1496, null, 11.5), 818.28);      // 20% surcharge in the 12th year
  assert.equal(roadTaxPerYear('petrol', null, null, 5), null);
});

test('years of COE left: first COE, and a renewed COE', () => {
  const first = prepare({ price: 16000, reg: '2018-05-17', coe_left_m: 18, last_seen: TODAY }, TODAY);
  assert.equal(first.ok, true);
  assert.equal(first.renewed, false);
  assert.ok(Math.abs(first.years_left - 1.503) < 0.005, String(first.years_left));     // ends 16 May 2028
  const renewed = prepare({ price: 30000, reg: '2012-03-01', coe_left_m: 64, last_seen: TODAY }, TODAY);
  assert.equal(renewed.renewed, true);
  assert.ok(Math.abs(renewed.years_left - 64.5 / 12) < 0.001);
  assert.equal(prepare({ price: 15800, reg: '2018-05-17', coe_left_m: 18, type: 'Van' }, TODAY).reason, 'commercial');
  assert.equal(prepare({ price: null, reg: '2018-05-17', coe_left_m: 18 }, TODAY).ok, false);
});

test('COE category of the car', () => {
  const ref = (title, extra = {}) => matchModel({ title, ...extra }, models);
  assert.equal(coeCategory({ title: 'Toyota Vios 1.5A G', cc: 1496, fuel: 'petrol' }, ref('Toyota Vios 1.5A G')).cat, 'A');
  assert.equal(coeCategory({ title: 'Mercedes-Benz C-Class C180', cc: 1595, fuel: 'petrol' }, ref('Mercedes-Benz C-Class C180')).cat, 'B');   // 1.6 turbo over 97 kW
  assert.equal(coeCategory({ title: 'Toyota Harrier 2.0A', cc: 1986, fuel: 'petrol' }, ref('Toyota Harrier 2.0A')).cat, 'B');
  assert.equal(coeCategory({ title: 'BYD Atto 3 Electric 100 kW 49.92 kWh', fuel: 'electric' }, ref('BYD Atto 3 Electric 100 kW 49.92 kWh')).cat, 'A');
  assert.equal(coeCategory({ title: 'BYD Atto 3 Electric', fuel: 'electric' }, ref('BYD Atto 3 Electric')).cat, 'B');
  assert.equal(matchModel({ title: 'BYD Sealion 7 Electric' }, models).model, 'Sealion 7');
  assert.equal(matchModel({ title: 'Proton Saga 1.3A', make: 'Proton', model: 'Saga' }, models).known, false);
});

test('real sample at the reference COE: Attrage is a deal, van is not rated', () => {
  const out = rate(sample());
  const [attrage, note, mazda2, van] = out.map((o) => o.v);
  assert.equal(attrage.rating, 'Exceptional');
  assert.equal(attrage.depn, 10640);
  assert.equal(attrage.fair_depn, 12040);
  assert.equal(attrage.gap_pct, 10.0);
  assert.equal(attrage.max_price, 17000);
  assert.equal(attrage.coe_cat, 'A');
  assert.equal(attrage.parity, 13900);
  assert.ok(Math.abs(attrage.parity_ratio - 0.765) < 0.005);
  assert.ok(attrage.why.includes('High mileage'));
  assert.equal(note.rating, 'Attractive');
  assert.equal(mazda2.confidence, 'low');           // no benchmark for a 2018 Mazda 2
  assert.equal(mazda2.gap_pct, null);
  assert.equal(van.rated, false);
  assert.equal(van.reason, 'commercial');
});

test('the COE price you enter moves the benchmark', () => {
  const base = rate(sample())[0].v;
  const lower = rate(sample(), { coeA: 110000 })[0].v;
  assert.equal(lower.fair_depn, Math.round(12040 * 110000 / REFERENCE.coe.A));
  assert.equal(lower.parity, 11000);
  assert.equal(lower.rating, 'Overpriced');
  assert.ok(lower.score < base.score);
  const higher = rate(sample(), { coeA: 160000 })[0].v;
  assert.ok(higher.gap_pct > base.gap_pct);
  // Cat B input does not touch a Cat A car.
  assert.deepEqual(rate(sample(), { coeB: 90000 })[0].v.fair_depn, base.fair_depn);
  // Pass-through 0: the benchmark ignores the COE input; the parity yardstick still moves.
  const none = rate(sample(), { coeA: 110000, passThrough: 0 })[0].v;
  assert.equal(none.fair_depn, 12040);
  assert.equal(none.parity, 11000);
  assert.equal(coeScale('A', { ...DEFAULT_SETTINGS, coeA: 10000 }).f, 0.3);     // floor
});

test('an 8% return on capital raises total cost, not the rating inputs', () => {
  const a = rate(sample())[0].v, b = rate(sample(), { rate: 0.08 })[0].v;
  assert.ok(b.tco > a.tco);
  assert.equal(b.costs.capital, Math.round(0.08 * (16000 + a.paper_value) / 2));
  assert.equal(a.score, b.score);
});

test('five or more similar cars listed now are blended into the benchmark', () => {
  const mk = (id, depn) => ({ id, title: 'Mitsubishi Attrage 1.2A', make: 'Mitsubishi', model: 'Attrage', price: 3000 + depn * 1.3, depn,
    reg: '2018-02-28', coe_left_m: 15, mileage: 80000, cc: 1193, fuel: 'petrol', type: 'Sedan', owners: 1, status: 'available', last_seen: TODAY });
  const out = rate([mk(1, 10000), mk(2, 11000), mk(3, 11500), mk(4, 12000), mk(5, 12500), mk(6, 13000)]);
  const v = out[0].v;                                    // comparables for car 1: 11000..13000, median 12000
  assert.equal(v.n_comparables, 5);
  assert.equal(v.fair_basis, 'blend');
  assert.equal(v.fair_depn, Math.round(0.5 * 12000 + 0.5 * 12040));
  // A model with no price-guide row is judged on the live comparables alone.
  const saga = (id, depn) => ({ ...mk(id, depn), title: 'Proton Saga 1.3A', make: 'Proton', model: 'Saga' });
  const o2 = rate([saga(1, 9000), saga(2, 10000), saga(3, 10500), saga(4, 11000), saga(5, 11500), saga(6, 12000)]);
  assert.equal(o2[0].v.fair_basis, 'comparables');
  assert.equal(o2[0].v.fair_depn, 11000);
  assert.equal(o2[0].v.confidence, 'low');               // unknown model: generic reliability and costs
});

test('electric car: battery cover scored, kW read from the title', () => {
  const ev = { id: 9, title: 'BYD Atto 3 Electric 100 kW 49.92 kWh', price: 119888, depn: 17100, reg: '2024-06-10', coe_left_m: 90,
    mileage: 30000, fuel: 'electric', type: 'SUV', owners: 1, status: 'available', last_seen: TODAY };
  const v = rate([ev])[0].v;
  assert.equal(v.coe_cat, 'A');
  assert.ok(v.scores.battery > 30 && v.scores.battery < 100);
  assert.equal(v.costs.road_tax, Math.round(((250 + 3.75 * 70) * 0.782 + 350) * 2));
  assert.ok(v.why.includes('Battery health'));
});

test('vans and trucks are recognised by name when the vehicle type is not shown', () => {
  const real = JSON.parse(fs.readFileSync(new URL('../data/listings.json', import.meta.url), 'utf8')).listings;   // 20 real listings, 14 commercial
  for (const l of real) {
    const truth = ['Van', 'Truck'].includes(l.type);
    assert.equal(looksCommercial({ title: l.title, type: null }), truth, l.title);       // by name alone
    assert.equal(looksCommercial(l), truth, l.title);                                    // with the type
  }
  for (const car of ['Toyota Vios 1.5A E', 'Honda Fit 1.3A G', 'Mercedes-Benz E-Class E200', 'BYD Atto 3 Electric', 'Kia Carnival 2.2A', 'Toyota Corolla Altis 1.6A', 'Volkswagen Golf 1.4A TSI'])
    assert.equal(looksCommercial({ title: car, type: null }), false, car);
  assert.equal(looksCommercial({ title: 'Toyota Hiace 3.0M', type: 'MPV' }), false);     // the site's own type always wins
});
