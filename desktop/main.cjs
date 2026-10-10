'use strict';
const { app, BrowserWindow, Menu, protocol, session, shell, dialog, ipcMain } = require('electron');
const { readFile, mkdir, writeFile, stat } = require('node:fs/promises');
const path = require('node:path');
const { APP_ORIGIN, CONTENT_SECURITY_POLICY, bundledFile, isAppUrl, isPrintUrl, externalLink } = require('./policy.cjs');
const { isTrustedExportEvent, createExportService, errorResult } = require('./file-save.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'atolye', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('ATÖLYE');
app.setAppUserModelId('com.atolye.furniture.studio');

// This name and origin stay constant across releases, preserving local autosave.
const smokeMode = process.argv.includes('--smoke-test');
let smokeOutput;
if (smokeMode) {
  const argument = process.argv.find(value => value.startsWith('--smoke-output='));
  smokeOutput = path.resolve(argument?.slice('--smoke-output='.length) || path.join(process.cwd(), '.tools', 'desktop-smoke'));
  const permitted = path.resolve(process.cwd(), '.tools');
  const relative = path.relative(permitted, smokeOutput);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Smoke output must be a subdirectory of the workspace .tools directory.');
  app.setPath('userData', path.join(smokeOutput, 'user-data'));
  app.setPath('sessionData', path.join(smokeOutput, 'session-data'));
} else {
  app.setPath('userData', path.join(app.getPath('appData'), 'ATOLYE-Furniture-Studio'));
}

const hasLock = smokeMode || app.requestSingleInstanceLock();
let mainWindow;
let appSession;
const downloads = [];
const popups = [];
const rendererErrors = [];

const preferences = () => ({ sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, session: appSession, preload: path.join(__dirname, 'preload.cjs') });

const exportService = createExportService({
  chooseDestination: file => smokeMode
    ? Promise.resolve({ canceled: false, filePath: path.join(smokeOutput, file.name) })
    : dialog.showSaveDialog(mainWindow, { title: 'ATÖLYE · Save / Сохранить / Kaydet', defaultPath: path.join(app.getPath('downloads'), file.name), filters: [{ name: file.extension.toUpperCase(), extensions: [file.extension] }], properties: ['showOverwriteConfirmation', 'createDirectory'] }),
  writeFile: async (filePath, bytes) => {
    await writeFile(filePath, bytes);
    downloads.push({ filename: path.basename(filePath), path: filePath, state: 'completed', method: 'save-dialog', bytes: bytes.length });
  },
  reveal: async filePath => {
    if (!(await stat(filePath)).isFile()) throw new Error('Saved export is no longer a file.');
    if (!smokeMode) shell.showItemInFolder(filePath);
  }
});
ipcMain.handle('atolye:save-file', (event, request) => isTrustedExportEvent(event, mainWindow)
  ? exportService.saveFile(request, event.sender.id)
  : errorResult('ACCESS_DENIED', 'This window cannot save application exports.'));
ipcMain.handle('atolye:reveal-file', (event, token) => isTrustedExportEvent(event, mainWindow)
  ? exportService.revealFile(token, event.sender.id)
  : errorResult('ACCESS_DENIED', 'This window cannot show saved exports.'));
function openExternal(url) {
  const target = externalLink(url);
  if (target && !smokeMode) shell.openExternal(target).catch(() => {});
}

function protectContents(contents) {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url) && !isPrintUrl(url)) { event.preventDefault(); openExternal(url); }
  });
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url) && !isPrintUrl(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isPrintUrl(url)) return { action: 'allow', overrideBrowserWindowOptions: { title: 'ATÖLYE · Print / PDF', width: 1000, height: 800, show: !smokeMode, autoHideMenuBar: true, webPreferences: preferences() } };
    openExternal(url);
    return { action: 'deny' };
  });
  contents.on('did-create-window', window => {
    popups.push(window);
    window.setMenu(null);
    protectContents(window.webContents);
  });
  if (smokeMode) {
    contents.on('console-message', details => { if (details.level === 'error') rendererErrors.push(details.message); });
    contents.on('render-process-gone', (_event, details) => rendererErrors.push(`Renderer exited: ${details.reason}`));
  }
}

function installMenu() {
  const language = app.getLocale().split('-')[0];
  const labels = {
    ru: ['Приложение', 'Закрыть', 'Правка', 'Вид', 'На весь экран', 'Масштаб по умолчанию', 'Увеличить', 'Уменьшить'],
    tr: ['Uygulama', 'Kapat', 'Düzen', 'Görünüm', 'Tam ekran', 'Varsayılan yakınlaştırma', 'Yakınlaştır', 'Uzaklaştır'],
    en: ['Application', 'Close', 'Edit', 'View', 'Full screen', 'Reset zoom', 'Zoom in', 'Zoom out']
  }[language] || ['Application', 'Close', 'Edit', 'View', 'Full screen', 'Reset zoom', 'Zoom in', 'Zoom out'];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: labels[0], submenu: [{ label: labels[1], role: 'quit' }] },
    { label: labels[2], submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: labels[3], submenu: [{ label: labels[5], role: 'resetZoom' }, { label: labels[6], role: 'zoomIn' }, { label: labels[7], role: 'zoomOut' }, { type: 'separator' }, { label: labels[4], role: 'togglefullscreen' }] }
  ]));
}

async function createWindow() {
  mainWindow = new BrowserWindow({ title: 'ATÖLYE', width: 1440, height: 960, minWidth: 1000, minHeight: 700, show: false, backgroundColor: '#f5f6f2', icon: path.join(app.getAppPath(), 'build', 'icon.ico'), autoHideMenuBar: true, webPreferences: preferences() });
  protectContents(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => { if (!smokeMode) mainWindow.show(); });
  await mainWindow.loadURL(`${APP_ORIGIN}/`);
  return mainWindow;
}

async function configureSession() {
  // The smoke session is in memory and never touches installed application data.
  appSession = smokeMode ? session.fromPartition('atolye-smoke') : session.defaultSession;
  appSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  appSession.setPermissionCheckHandler(() => false);
  appSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isAppUrl(details.url) || isPrintUrl(details.url) || details.url.startsWith('data:') || details.url === 'about:srcdoc';
    callback({ cancel: !allowed });
  });
  const root = app.getAppPath();
  appSession.protocol.handle('atolye', async request => {
    const file = bundledFile(root, request.url);
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
    try {
      const data = await readFile(file);
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }[path.extname(file)];
      return new Response(request.method === 'HEAD' ? null : data, { headers: { 'Content-Type': type, 'Content-Security-Policy': CONTENT_SECURITY_POLICY, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  appSession.on('will-download', (_event, item) => {
    const filename = path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    if (smokeMode) item.setSavePath(path.join(smokeOutput, filename));
    else item.setSaveDialogOptions({ title: 'ATÖLYE · Save / Сохранить / Kaydet', defaultPath: path.join(app.getPath('documents'), filename), properties: ['showOverwriteConfirmation', 'createDirectory'] });
    const download = { filename, path: item.getSavePath(), state: 'started' };
    downloads.push(download);
    item.once('done', (_event, state) => { download.path = item.getSavePath(); download.state = state; });
  });
}

async function smokeTest(window) {
  const { runSmoke } = require('./smoke.cjs');
  try {
    const report = await runSmoke({ app, window, appSession, output: smokeOutput, downloads, popups, rendererErrors });
    await writeFile(path.join(smokeOutput, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`Desktop smoke passed (${report.checks.length} checks). Report: ${path.join(smokeOutput, 'report.json')}`);
    app.exit(0);
  } catch (error) {
    await writeFile(path.join(smokeOutput, 'report.json'), JSON.stringify({ passed: false, error: error.stack, rendererErrors, downloads }, null, 2));
    console.error(error.stack);
    app.exit(1);
  }
}

if (!hasLock) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    if (smokeMode) await mkdir(smokeOutput, { recursive: true });
    await configureSession();
    installMenu();
    const window = await createWindow();
    if (smokeMode) await smokeTest(window);
  }).catch(error => { console.error(error); if (!smokeMode) dialog.showErrorBox('ATÖLYE', `Не удалось запустить приложение / Uygulama başlatılamadı / Unable to start.\n${error.message}`); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
