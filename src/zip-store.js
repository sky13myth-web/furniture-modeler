// Small, dependency-free ZIP writer. Stored entries keep this usable offline
// in a browser; UTF-8 names and central-directory records follow ZIP 2.0.
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size, fields) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  for (const [offset, value, width = 4] of fields) width === 2 ? view.setUint16(offset, value, true) : view.setUint32(offset, value, true);
  return bytes;
}
export function createStoredZip(files) {
  if (!Array.isArray(files) || files.length > 65535) throw new Error('ZIP entry limit exceeded.');
  const local = [], central = [], paths = new Set(); let offset = 0;
  for (const file of files) {
    const path = String(file.path);
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(segment => !segment || segment === '..' || segment === '.') || paths.has(path)) throw new Error('Invalid or repeated ZIP path.');
    paths.add(path);
    const name = encoder.encode(path), data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    if (!(data instanceof Uint8Array) || name.length > 65535 || data.length > 0xffffffff) throw new Error('Invalid ZIP entry.');
    const crc = crc32(data), flags = 0x800;
    // Fixed 1980-01-01 timestamps make exports reproducible.
    const lh = header(30, [[0, 0x04034b50], [4, 20, 2], [6, flags, 2], [12, 33, 2], [14, crc], [18, data.length], [22, data.length], [26, name.length, 2]]);
    local.push(lh, name, data);
    const ch = header(46, [[0, 0x02014b50], [4, 20, 2], [6, 20, 2], [8, flags, 2], [14, 33, 2], [16, crc], [20, data.length], [24, data.length], [28, name.length, 2], [42, offset]]);
    central.push(ch, name); offset += lh.length + name.length + data.length;
  }
  const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0), size = offset + centralSize + 22;
  if (size > 0xffffffff) throw new Error('ZIP64 is not supported.');
  const end = header(22, [[0, 0x06054b50], [8, files.length, 2], [10, files.length, 2], [12, centralSize], [16, offset]]);
  const result = new Uint8Array(size); let cursor = 0;
  for (const bytes of [...local, ...central, end]) { result.set(bytes, cursor); cursor += bytes.length; }
  return result;
}
