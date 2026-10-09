import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');
const files = asar.listPackage(archive).map(file => file.replace(/\\/g, '/').replace(/^\//, ''));
const permitted = /^(?:index\.html|LICENSE|package\.json|src(?:\/|\/.*\.(?:js|css))?|desktop(?:\/|\/[^/]+\.cjs)?|build(?:\/|\/icon\.ico)?)$/;
for (const file of files) assert.match(file, permitted, `Unexpected packaged file: ${file}`);
for (const file of ['index.html', 'src/app.js', 'src/studio.css', 'desktop/main.cjs', 'desktop/policy.cjs', 'build/icon.ico', 'LICENSE']) assert.ok(files.includes(file), `Missing packaged file: ${file}`);
const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString());
assert.equal(metadata.version, '2.1.0');
assert.equal(metadata.main, 'desktop/main.cjs');
console.log(`Verified app.asar allowlist (${files.length} entries), application assets and version ${metadata.version}.`);
