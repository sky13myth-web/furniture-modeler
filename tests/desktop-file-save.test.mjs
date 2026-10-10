import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import files from '../desktop/file-save.cjs';

test('desktop exports accept exact UTF-8 and byte views but reject paths, executables and oversized data', () => {
  const text = '\ufeffŞкаф;18\r\n', accepted = files.validateExportFile({ name: 'Şкаф-cut-list.csv', data: text });
  assert.equal(accepted.byteLength, Buffer.byteLength(text));
  assert.deepEqual(accepted.bytes, Buffer.from(text));
  const bytes = Uint8Array.from([0, 80, 75, 3, 4, 255]);
  assert.deepEqual(files.validateExportFile({ name: 'factory.zip', data: bytes.subarray(1, 5) }).bytes, Buffer.from([80, 75, 3, 4]));
  const excel = files.validateExportFile({ name: 'kesim-listesi.XLSX', data: bytes.subarray(1) });
  assert.equal(excel.extension, 'xlsx'); assert.equal(excel.byteLength, 5);
  assert.deepEqual(excel.bytes, Buffer.from([80, 75, 3, 4, 255]));
  for (const name of ['../export.zip', 'C:\\secret.csv', 'folder/file.svg', 'CON.csv', 'LPT1.html', 'export.html ', 'export.exe', 'export.xlsm', 'export.xls', 'x'.repeat(181) + '.csv']) assert.equal(files.validateExportFile({ name, data: 'x' }).status, 'error', name);
  for (const data of [null, new ArrayBuffer(4), new Float64Array(2), { length: 4 }, '']) assert.equal(files.validateExportFile({ name: 'export.csv', data }).status, 'error');
  assert.equal(files.validateExportFile({ name: 'export.csv', data: 'x', path: 'C:\\secret.csv' }).code, 'INVALID_REQUEST');
  assert.equal(files.validateExportFile({ name: 'export.zip', data: new Uint8Array(files.MAX_EXPORT_BYTES + 1) }).code, 'TOO_LARGE');
});

test('only the current application main frame in the main window can use export IPC', () => {
  const frame = { url: 'atolye://app/?demo=1' }, sender = { mainFrame: frame }, window = { webContents: sender, isDestroyed: () => false };
  assert.equal(files.isTrustedExportEvent({ sender, senderFrame: frame }, window), true);
  for (const url of ['https://example.org/', 'about:blank', 'blob:atolye://app/id', 'atolye://evil/', 'atolye://user:password@app/', 'atolye://app/src/studio.js', 'file:///C:/secret']) {
    frame.url = url;
    assert.equal(files.isTrustedExportEvent({ sender, senderFrame: frame }, window), false, url);
  }
  frame.url = 'atolye://app/';
  assert.equal(files.isTrustedExportEvent({ sender, senderFrame: { url: frame.url } }, window), false, 'same-origin subframe');
  assert.equal(files.isTrustedExportEvent({ sender: { mainFrame: frame }, senderFrame: frame }, window), false, 'another window');
  assert.equal(files.isTrustedExportEvent({ sender, senderFrame: frame }, { ...window, isDestroyed: () => true }), false);
});

test('saving reports completed bytes and reveals only dialog-chosen files owned by this window', async () => {
  const written = [], revealed = [], chosen = path.resolve('.tools', 'qa', 'dialog-chosen.csv');
  const service = files.createExportService({ chooseDestination: async () => ({ canceled: false, filePath: chosen }), writeFile: async (...args) => written.push(args), reveal: async value => revealed.push(value) });
  const result = await service.saveFile({ name: 'requested.csv', data: 'Şкаф;18' }, 7);
  assert.equal(result.status, 'saved'); assert.equal(result.path, chosen); assert.equal(result.name, 'dialog-chosen.csv');
  assert.equal(result.bytes, Buffer.byteLength('Şкаф;18')); assert.deepEqual(written, [[chosen, Buffer.from('Şкаф;18')]]);
  assert.equal((await service.revealFile(chosen, 7)).code, 'UNKNOWN_FILE');
  assert.equal((await service.revealFile(result.token, 8)).code, 'UNKNOWN_FILE');
  assert.equal((await service.revealFile(result.token, 7)).status, 'revealed'); assert.deepEqual(revealed, [chosen]);
});

test('cancel, disk failure and reveal failure are explicit results without false saved state', async () => {
  let writes = 0;
  const cancelled = files.createExportService({ chooseDestination: async () => ({ canceled: true }), writeFile: async () => writes++, reveal: async () => {} });
  assert.deepEqual(await cancelled.saveFile({ name: 'export.svg', data: '<svg/>' }, 1), { status: 'cancelled' }); assert.equal(writes, 0);
  const failed = files.createExportService({ chooseDestination: async () => ({ canceled: false, filePath: '.tools/qa/export.svg' }), writeFile: async () => { throw new Error('Disk failure'); }, reveal: async () => {} });
  assert.equal((await failed.saveFile({ name: 'export.svg', data: '<svg/>' }, 1)).code, 'SAVE_FAILED');
  const missing = files.createExportService({ chooseDestination: async () => ({ canceled: false, filePath: '.tools/qa/export.svg' }), writeFile: async () => {}, reveal: async () => { throw new Error('File removed'); } });
  const result = await missing.saveFile({ name: 'export.svg', data: '<svg/>' }, 1);
  assert.equal((await missing.revealFile(result.token, 1)).code, 'REVEAL_FAILED');
});

test('a repeated click cannot open a second save dialog while the first is pending', async () => {
  let finish;
  const service = files.createExportService({ chooseDestination: () => new Promise(resolve => { finish = resolve; }), writeFile: async () => {}, reveal: async () => {} });
  const first = service.saveFile({ name: 'export.json', data: '{}' }, 1);
  assert.equal((await service.saveFile({ name: 'export.json', data: '{}' }, 1)).code, 'SAVE_BUSY');
  finish({ canceled: true }); assert.equal((await first).status, 'cancelled');
  const next = service.saveFile({ name: 'export.json', data: '{}' }, 1);
  finish({ canceled: true }); assert.equal((await next).status, 'cancelled');
});
