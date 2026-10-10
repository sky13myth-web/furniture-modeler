'use strict';
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isAppUrl } = require('./policy.cjs');

const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const EXPORT_EXTENSIONS = new Set(['zip', 'csv', 'svg', 'html', 'json', 'dxf', 'xlsx']);
const errorResult = (code, message) => ({ status: 'error', code, message });

/** The renderer supplies export bytes and a basename, never a filesystem path. */
function validateExportFile(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['name', 'data'].includes(key))) return errorResult('INVALID_REQUEST', 'Invalid export request.');
  const name = request.name;
  if (typeof name !== 'string' || !name || name.length > 180 || name !== name.trim() || /[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) || /[. ]$/.test(name) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) return errorResult('INVALID_NAME', 'Use a valid export filename without a directory.');
  const extension = path.extname(name).slice(1).toLowerCase();
  if (!EXPORT_EXTENSIONS.has(extension)) return errorResult('UNSUPPORTED_TYPE', 'This export file type is not supported.');
  const data = request.data;
  if (typeof data !== 'string' && !(data instanceof Uint8Array)) return errorResult('INVALID_REQUEST', 'Export data must be text or bytes.');
  const byteLength = typeof data === 'string' ? data.length > MAX_EXPORT_BYTES ? data.length : Buffer.byteLength(data, 'utf8') : data.byteLength;
  if (!byteLength || byteLength > MAX_EXPORT_BYTES) return errorResult('TOO_LARGE', 'The export must contain between 1 byte and 64 MiB.');
  return { name, extension, bytes: Buffer.from(data), byteLength };
}

/** Restrict save IPC to this window's current top-level application document. */
function isTrustedExportEvent(event, window) {
  if (!window || window.isDestroyed() || event?.sender !== window.webContents || !event.senderFrame || event.senderFrame !== window.webContents.mainFrame) return false;
  const rawUrl = event.senderFrame.url;
  if (!isAppUrl(rawUrl)) return false;
  return ['/', '/index.html'].includes(new URL(rawUrl).pathname);
}

function createExportService({ chooseDestination, writeFile, reveal }) {
  const saved = new Map(), pending = new Set();
  return {
    async saveFile(request, senderId) {
      const file = validateExportFile(request);
      if (file.status === 'error') return file;
      if (pending.has(senderId)) return errorResult('SAVE_BUSY', 'A save dialog is already open.');
      pending.add(senderId);
      try {
        const destination = await chooseDestination(file);
        if (destination.canceled || !destination.filePath) return { status: 'cancelled' };
        const filePath = path.resolve(destination.filePath);
        await writeFile(filePath, file.bytes);
        const token = randomUUID();
        saved.set(token, { path: filePath, senderId });
        if (saved.size > 64) saved.delete(saved.keys().next().value);
        return { status: 'saved', name: path.basename(filePath), path: filePath, token, bytes: file.byteLength };
      } catch {
        return errorResult('SAVE_FAILED', 'The file could not be saved. Choose another location and try again.');
      } finally {
        pending.delete(senderId);
      }
    },
    async revealFile(token, senderId) {
      const file = typeof token === 'string' && token.length <= 80 ? saved.get(token) : null;
      if (!file || file.senderId !== senderId) return errorResult('UNKNOWN_FILE', 'Only a file saved by this window can be shown.');
      try {
        await reveal(file.path);
        return { status: 'revealed' };
      } catch {
        return errorResult('REVEAL_FAILED', 'The saved file could not be shown in its folder.');
      }
    }
  };
}

module.exports = { MAX_EXPORT_BYTES, validateExportFile, isTrustedExportEvent, createExportService, errorResult };
