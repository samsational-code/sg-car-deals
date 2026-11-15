// Builds a results page in the same shape SGCarMart serves: listings as Next.js "flight" rows
// inside self.__next_f.push(...) script tags, plus the visible cards.
// The four sample records and cards were cut from a real results page saved on 14 Nov 2026
// (seller descriptions and photos removed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const sampleRecords = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'sample_records.json'), 'utf8'));
export const sampleCards = fs.readFileSync(path.join(here, 'fixtures', 'sample_cards.html'), 'utf8');

export function flightScripts(records, { page = 1, lastPage = 1, total = records.length, perPage = 20 } = {}) {
  let next = 0x100;
  const id = () => (next++).toString(16);
  const rows = [];
  const note = 'Fuel économe – très bon état\nsecond line';             // a length-prefixed text row with multi-byte characters
  rows.push(`${id()}:T${Buffer.byteLength(note).toString(16)},${note}`);
  const refs = [];
  for (const rec of records) {
    const flat = { ...rec };
    for (const key of ['dealer_lead', 'additional_statuses', 'buysafe', 'star_ad', 'spotlight', 'instalment', 'deals']) {
      if (flat[key] && typeof flat[key] === 'object') { const rid = id(); rows.push(`${rid}:${JSON.stringify(flat[key])}\n`); flat[key] = '$' + rid; }
    }
    const rid = id(); rows.push(`${rid}:${JSON.stringify(flat)}\n`); refs.push('$' + rid);
  }
  const dataId = id(); rows.push(`${dataId}:${JSON.stringify(refs)}\n`);
  const metaId = id(); rows.push(`${metaId}:${JSON.stringify({ current_page: page, from: 1, last_page: lastPage, links: [], path: 'x', per_page: perPage, to: records.length, total })}\n`);
  const linksId = id(); rows.push(`${linksId}:{"first":"x","last":"x","prev":null,"next":null}\n`);
  rows.push(`${id()}:{"data":"$${dataId}","links":"$${linksId}","meta":"$${metaId}"}\n`);
  rows.push(`${id()}:{"value":"$$10,001","text":"a filter option, not a listing"}\n`);
  rows.push(`${id()}:I[89408,["8038","static/chunks/x.js"],""]\n`);
  const data = rows.join('');
  // Split at awkward places, as the real page does.
  const cut1 = Math.floor(data.length / 3), cut2 = Math.floor((data.length * 2) / 3);
  return [data.slice(0, cut1), data.slice(cut1, cut2), data.slice(cut2)]
    .map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c).replace(/</g, '\\u003c')}])</script>`).join('');
}

export function buildPage({ records = sampleRecords, cards = sampleCards, page = 1, lastPage = 1, total, embedded = true, canonical = 'https://www.sgcarmart.com/used-cars/listing' } = {}) {
  return `<!DOCTYPE html><html><head><title>Browse ${total ?? records.length} Used Cars in Singapore - Sgcarmart</title>` +
    `<link rel="canonical" href="${canonical}"></head><body><script>(self.__next_f=self.__next_f||[]).push([0])</script>` +
    `<div>${total ?? records.length} Vehicles</div>${cards}` +
    `<div id="desktopPaginationContainer"><ul><li><span data-value="${page}">${page}<span>(current)</span></span></li>` +
    `<li><a data-value="${lastPage}" role="button" href="#">${lastPage}</a></li></ul></div>` +
    '<div><a data-value="100" role="button" href="#">100</a></div>' +      // results-per-page menu: must not be mistaken for a page link
    (embedded ? flightScripts(records, { page, lastPage, total: total ?? records.length }) : '') +
    '<p>' + 'x'.repeat(31000) + '</p></body></html>';
}

/** Copies of the sample records with new ids, for building a "page 2". */
export function shiftedRecords(offset) {
  return sampleRecords.map((r) => ({ ...r, id: r.id + offset, link: r.link.replace(String(r.id), String(r.id + offset)) }));
}
