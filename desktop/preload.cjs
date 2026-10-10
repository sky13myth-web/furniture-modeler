'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Print popups and embedded previews receive no filesystem capability. Main
// repeats these checks against the actual sender before accepting any IPC.
if (process.isMainFrame && location.protocol === 'atolye:' && location.hostname === 'app' && !location.port && ['/', '/index.html'].includes(location.pathname)) {
  contextBridge.exposeInMainWorld('atolyeFiles', Object.freeze({
    version: 1,
    maxBytes: 64 * 1024 * 1024,
    saveFile: request => ipcRenderer.invoke('atolye:save-file', request),
    revealFile: token => ipcRenderer.invoke('atolye:reveal-file', token)
  }));
}
