// Deterministic rasterisation of build/icon.svg's simple vector mark.
// No image generation, remote assets or image libraries are required.
import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const table = Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, checksum]); }
function distance(x, y, ax, ay, bx, by) { const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2))); return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)); }
function png(size) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const totals = [0, 0, 0, 0];
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const vx = (x + (sx + .5) / 4) * 256 / size, vy = (y + (sy + .5) / 4) * 256 / size;
      const dx = Math.max(Math.abs(vx - 128) - 66, 0), dy = Math.max(Math.abs(vy - 128) - 66, 0);
      if (Math.hypot(dx, dy) > 54) continue;
      const white = Math.min(distance(vx, vy, 65, 188, 128, 66), distance(vx, vy, 128, 66, 191, 188), distance(vx, vy, 87, 147, 169, 147)) <= 9.5;
      const color = white ? [255, 255, 255] : [33, 91, 76];
      for (let channel = 0; channel < 3; channel++) totals[channel] += color[channel];
      totals[3] += 255;
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    for (let channel = 0; channel < 3; channel++) rows[offset + channel] = totals[3] ? Math.round(totals[channel] * 255 / totals[3]) : 0;
    rows[offset + 3] = Math.round(totals[3] / 16);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const sizes = [16, 24, 32, 48, 64, 128, 256], images = sizes.map(png);
const header = Buffer.alloc(6); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + sizes.length * 16;
const entries = sizes.map((size, index) => { const entry = Buffer.alloc(16); entry[0] = entry[1] = size === 256 ? 0 : size; entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6); entry.writeUInt32LE(images[index].length, 8); entry.writeUInt32LE(offset, 12); offset += images[index].length; return entry; });
await mkdir(path.join(root, 'build'), { recursive: true });
await writeFile(path.join(root, 'build', 'icon.ico'), Buffer.concat([header, ...entries, ...images]));
await writeFile(path.join(root, 'build', 'icon.png'), images.at(-1));
console.log('Created multi-resolution Windows icon from the ATÖLYE vector mark.');
