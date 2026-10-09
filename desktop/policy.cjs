'use strict';
const path = require('node:path');

const APP_ORIGIN = 'atolye://app';
const CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' about: blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

function bundledFile(root, rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'atolye:' || url.hostname !== 'app' || url.port || url.username || url.password) return null;
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (relative !== 'index.html' && !/^src\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:js|css)$/.test(relative)) return null;
    const file = path.resolve(root, relative);
    const inside = path.relative(root, file);
    return inside && !inside.startsWith('..') && !path.isAbsolute(inside) ? file : null;
  } catch { return null; }
}

function isAppUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'atolye:' && url.hostname === 'app' && !url.port && !url.username && !url.password;
  } catch { return false; }
}

function isPrintUrl(url) {
  return url === '' || url === 'about:blank' || (url.startsWith('blob:') && isAppUrl(url.slice(5)));
}

function externalLink(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

module.exports = { APP_ORIGIN, CONTENT_SECURITY_POLICY, bundledFile, isAppUrl, isPrintUrl, externalLink };
