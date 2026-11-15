// Receives listings handed over by the capture bookmark (lib/capture.js) and checks them
// before the dashboard uses them. Everything from another site is treated as untrusted.

function fromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Reverses encodePayload. Throws if the text is damaged. */
export async function decodePayload(packed) {
  const kind = packed.slice(0, 2), bytes = fromB64url(packed.slice(2));
  let raw = bytes;
  if (kind === 'z.') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    raw = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (kind !== 'j.') throw new Error('unknown format');
  return JSON.parse(new TextDecoder().decode(raw));
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max = 160) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const date = (v) => (typeof v === 'string' && ISO.test(v) ? v : null);

/** Keeps only well-formed listings that link to an SGCarMart car page. Returns {listings, info}. */
export function sanitise(payload) {
  if (!payload || payload.v !== 1 || !Array.isArray(payload.fields) || !Array.isArray(payload.rows)) throw new Error('not a capture');
  const listings = [];
  for (const row of payload.rows.slice(0, 2000)) {
    if (!Array.isArray(row)) continue;
    const o = {};
    payload.fields.forEach((f, i) => { o[f] = row[i]; });
    const id = num(o.id, 1, 1e12);
    const url = typeof o.url === 'string' && /^https:\/\/www\.sgcarmart\.com\/used-cars\/info\/[^\s"'<>]+$/.test(o.url) ? o.url.slice(0, 300) : null;
    const title = str(o.title);
    if (!id || !url || !title) continue;
    listings.push({
      id, url, title, make: str(o.make, 60), model: str(o.model, 60),
      price: num(o.price, 1, 1e8), depn: num(o.depn, 1, 1e7), reg: date(o.reg), first_reg: date(o.first_reg),
      coe_left_m: num(o.coe_left_m, 0, 240), mileage: num(o.mileage, 0, 5e6), cc: num(o.cc, 1, 20000),
      fuel: str(o.fuel, 20), type: str(o.type, 40), trans: str(o.trans, 20), owners: num(o.owners, 0, 99),
      dealer: str(o.dealer, 120), posted: date(o.posted), scheme: str(o.scheme, 40),
      status: o.status === 'sold' ? 'sold' : 'available', imported_used: o.imported_used === true,
    });
  }
  const searchUrl = typeof payload.url === 'string' && payload.url.startsWith('https://www.sgcarmart.com/used-cars/listing') ? payload.url.slice(0, 600) : null;
  return { listings, info: { url: searchUrl, pages: num(payload.pages, 0, 1000), last_page: num(payload.last_page, 0, 100000),
    total: num(payload.total, 0, 1e7), note: str(payload.note, 300), at: str(payload.at, 40) } };
}
