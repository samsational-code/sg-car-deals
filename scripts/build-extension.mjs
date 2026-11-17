// Builds extension/content.js from lib/parse.js and lib/capture.js.
// Usage: node scripts/build-extension.mjs https://YOUR-NAME.github.io/sg-car-deals/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extensionCode } from '../lib/bookmarklet.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dash = process.argv[2];
if (!dash || !/^https?:\/\/.+\/$/.test(dash)) { console.error('Give the dashboard address, ending in /'); process.exit(1); }
const read = (f) => fs.readFileSync(path.join(root, 'lib', f), 'utf8');
fs.mkdirSync(path.join(root, 'extension'), { recursive: true });
fs.writeFileSync(path.join(root, 'extension', 'content.js'), extensionCode(read('parse.js'), read('capture.js'), dash));
for (const size of ['192', '512']) fs.copyFileSync(path.join(root, 'icons', `icon-${size}.png`), path.join(root, 'extension', `icon-${size}.png`));
console.log('extension/content.js written for', dash);
