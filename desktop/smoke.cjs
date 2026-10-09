'use strict';
const assert = require('node:assert/strict');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

async function eventually(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}`);
}

async function runSmoke({ app, window, appSession, output, downloads, popups, rendererErrors }) {
  const checks = [];
  const run = source => window.webContents.executeJavaScript(source, true);
  await eventually(() => run(`Boolean(document.querySelector('#interface-language') && document.querySelector('#cabinet-editor svg'))`), 'app ES modules and cabinet editor');
  const state = await run(`({ origin: location.origin, secure: isSecureContext, node: typeof process, require: typeof require, cabinets: document.querySelectorAll('[data-cabinet]').length, saved: JSON.parse(localStorage.getItem('atolye.project.v1')) })`);
  assert.equal(state.origin, 'atolye://app');
  assert.equal(state.secure, true);
  assert.equal(state.node, 'undefined');
  assert.equal(state.require, 'undefined');
  assert.ok(state.saved?.project?.cabinets?.length > 0);
  checks.push('Bundled ES modules, cabinet editor and initial autosave load on the secure stable origin without Node.js access');

  // Use the real application language and save actions, then restore from storage.
  await run(`document.querySelector('#interface-language').value='en'; document.querySelector('#interface-language').dispatchEvent(new Event('change',{bubbles:true})); const saved=JSON.parse(localStorage.getItem('atolye.project.v1')); saved.project.name='ATOLYE desktop smoke'; localStorage.setItem('atolye.project.v1',JSON.stringify(saved));`);
  await window.loadURL('atolye://app/');
  await eventually(() => run(`document.querySelector('.project-name')?.textContent === 'ATOLYE desktop smoke'`), 'autosave restoration');
  assert.equal(await run(`document.querySelector('#interface-language').value`), 'en');
  checks.push('Project autosave and interface language survive renderer reload at the same origin');

  await run(`document.querySelector('[data-action="file"]').click(); document.querySelector('[data-action="save"]').click();`);
  const projectDownload = await eventually(() => downloads.find(item => item.filename.endsWith('.json') && item.state === 'completed'), 'project download');
  const savedFile = JSON.parse(await readFile(projectDownload.path, 'utf8'));
  assert.equal(savedFile.project.name, 'ATOLYE desktop smoke');
  assert.ok(savedFile.project.cabinets.length);
  checks.push('The Save project action produces a complete JSON project download');

  await run(`document.querySelector('[data-mode="cutting"]').click(); document.querySelector('[data-action="factory"]').click(); if(document.querySelector('#factory-zip').disabled) throw new Error('Factory export unexpectedly disabled'); document.querySelector('#factory-zip').click();`);
  const factoryDownload = await eventually(() => downloads.find(item => item.filename.endsWith('.zip') && item.state === 'completed'), 'factory ZIP download');
  const factoryBytes = await readFile(factoryDownload.path);
  assert.equal(factoryBytes.readUInt32LE(0), 0x04034b50);
  assert.ok(factoryBytes.includes(Buffer.from('cut-list.csv')));
  assert.ok(factoryBytes.includes(Buffer.from('assembly.html')));
  assert.ok(factoryBytes.includes(Buffer.from('dxf/P0001.dxf')));
  checks.push('The factory export action downloads a ZIP with CSV, assembly instructions and DXF contours');

  // Exercise the real Print/PDF action. Replace only its final OS print-dialog
  // call so unattended validation cannot leave a printer dialog on the desktop.
  await run(`document.querySelector('[data-action="close-modal"]').click(); document.querySelector('[data-mode="drawings"]').click(); window.__originalOpen=window.open.bind(window); window.open=(...args)=>{const popup=window.__originalOpen(...args); if(popup){window.__smokePrint=popup;popup.print=()=>{window.__smokePrintCalled=true;};}return popup;}; document.querySelector('[data-action="drawing-print"]').click();`);
  const popup = await eventually(() => popups.find(item => !item.isDestroyed()), 'inherited about:blank print popup');
  await eventually(() => run(`window.__smokePrintCalled === true`), 'real app print call');
  assert.ok(await run(`Boolean(window.__smokePrint.document.querySelector('svg'))`));
  const pdf = await popup.webContents.printToPDF({ printBackground: true });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  await writeFile(path.join(output, 'print-proof.pdf'), pdf);
  popup.close();
  await run(`window.open=window.__originalOpen; void 0;`);
  checks.push('The existing window.open + document.write print flow retains opener access and generates a native PDF');

  assert.deepEqual(rendererErrors, []);
  for (const pathname of ['/package.json', '/.tools/credentials.json', '/desktop/main.cjs']) assert.equal(await run(`fetch(${JSON.stringify('atolye://app' + pathname)}).then(response=>response.status)`), 404);
  assert.equal(await run(`window.open('https://example.org','_blank') === null`), true);
  assert.equal(await run(`window.open('file:///C:/Windows/win.ini','_blank') === null`), true);
  checks.push('Private bundle paths, external embedded windows and file URLs are blocked');
  const blockedResourceMessages = rendererErrors.filter(message => message === 'Not allowed to load local resource: file:///C:/Windows/win.ini');
  assert.deepEqual(rendererErrors.filter(message => !blockedResourceMessages.includes(message)), []);
  const screenshot = await window.webContents.capturePage();
  await writeFile(path.join(output, 'desktop.png'), screenshot.toPNG());
  await appSession.clearStorageData();
  return { passed: true, version: app.getVersion(), electron: process.versions.electron, packaged: app.isPackaged, checks, downloads, rendererErrors: [], blockedResourceMessages };
}

module.exports = { runSmoke };
