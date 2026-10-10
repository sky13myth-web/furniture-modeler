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
  const run = source => {
    try { new Function(source); } catch (error) { throw new Error(`Invalid smoke JavaScript: ${source.slice(0, 1200)}`, { cause: error }); }
    return window.webContents.executeJavaScript(source, true);
  };
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

  assert.equal(await run(`window.atolyeFiles?.version`), 1);
  const explicitFiles = [
    { name: 'native-export.csv', data: '\ufeffŞкаф;18\r\n' },
    { name: 'native-export.svg', data: '<svg xmlns="http://www.w3.org/2000/svg"><text>Şкаф</text></svg>' },
    { name: 'native-export.html', data: '<!doctype html><html><body>Şкаф</body></html>' },
    { name: 'native-export.json', data: '{"cabinet":"Şкаф"}' }
  ];
  for (const file of explicitFiles) {
    const result = await run(`window.atolyeFiles.saveFile(${JSON.stringify(file)})`);
    assert.equal(result.status, 'saved'); assert.equal(result.bytes, Buffer.byteLength(file.data));
    assert.equal(result.path, path.join(output, file.name));
    assert.equal(await readFile(result.path, 'utf8'), file.data);
    assert.equal((await run(`window.atolyeFiles.revealFile(${JSON.stringify(result.token)})`)).status, 'revealed');
  }
  for (const extension of ['zip', 'xlsx']) {
    const binary = await run(`window.atolyeFiles.saveFile({name:'native-export.${extension}',data:new Uint8Array([80,75,3,4,0,255])})`);
    assert.equal(binary.status, 'saved'); assert.equal(binary.bytes, 6);
    assert.deepEqual(await readFile(binary.path), Buffer.from([80,75,3,4,0,255]));
  }
  assert.equal((await run(`window.atolyeFiles.saveFile({name:'../unsafe.csv',data:'x'})`)).code, 'INVALID_NAME');
  assert.equal((await run(`window.atolyeFiles.saveFile({name:'unsafe.exe',data:'x'})`)).code, 'UNSUPPORTED_TYPE');
  assert.equal((await run(`window.atolyeFiles.saveFile({name:'export.csv',data:'x',path:'C:/unsafe.csv'})`)).code, 'INVALID_REQUEST');
  assert.equal((await run(`window.atolyeFiles.revealFile('C:/Windows/win.ini')`)).code, 'UNKNOWN_FILE');
  await run(`window.__exportFrame=document.createElement('iframe');window.__exportFrame.srcdoc='<html><body>Export IPC isolation</body></html>';document.body.append(window.__exportFrame);`);
  await eventually(() => run(`window.__exportFrame.contentDocument?.body?.textContent === 'Export IPC isolation'`), 'export isolation frame');
  assert.equal(await run(`typeof window.__exportFrame.contentWindow.atolyeFiles`), 'undefined');
  await run(`window.__exportFrame.remove();delete window.__exportFrame;`);
  checks.push('Explicit native save IPC persists UTF-8 CSV/SVG/HTML/JSON and exact ZIP/XLSX bytes, reports their paths, permits folder reveal only for saved tokens, and rejects paths, executables and embedded frames');

  await run(`document.querySelector('[data-action="file"]').click(); document.querySelector('[data-action="save"]').click();`);
  const projectDownload = await eventually(() => downloads.find(item => item.filename === 'ATOLYE desktop smoke.json' && item.state === 'completed'), 'project download');
  const savedFile = JSON.parse(await readFile(projectDownload.path, 'utf8'));
  assert.equal(savedFile.project.name, 'ATOLYE desktop smoke');
  assert.ok(savedFile.project.cabinets.length);
  checks.push('The Save project action produces a complete JSON project download');

  await run(`document.querySelector('[data-mode="cutting"]').click(); document.querySelector('[data-action="factory"]').click(); if(document.querySelector('#factory-zip').disabled) throw new Error('Factory export unexpectedly disabled'); document.querySelector('#factory-zip').click();`);
  const factoryDownload = await eventually(() => downloads.find(item => item.filename.endsWith('-factory.zip') && item.state === 'completed'), 'factory ZIP download');
  const factoryBytes = await readFile(factoryDownload.path);
  assert.equal(factoryBytes.readUInt32LE(0), 0x04034b50);
  assert.ok(factoryBytes.includes(Buffer.from('cut-list.csv')));
  assert.ok(factoryBytes.includes(Buffer.from('assembly.html')));
  assert.ok(factoryBytes.includes(Buffer.from('dxf/P0001.dxf')));
  assert.ok(factoryBytes.includes(Buffer.from('kesim-listesi.xlsx')));
  for(const filename of ['dxf/sheets-all.dxf','sheet-layout.csv','cuts/cut-sequence.csv','cuts/regions.csv','cuts/cuts-all.dxf','cuts/cut-sequence.html']) assert.ok(factoryBytes.includes(Buffer.from(filename)),filename);
  checks.push('The factory export action downloads a ZIP with grouped Excel, stock sheet layouts, cut sequence CSV/DXF/HTML, parent regions, assembly instructions and individual DXF contours');

  await run(`document.querySelector('#factory-dxf').click();`);
  const dxfDownload = await eventually(() => downloads.find(item => item.filename.endsWith('-sheets-all.dxf') && item.state === 'completed'), 'DXF button saves actual sheet layout');
  const dxfBytes = await readFile(dxfDownload.path);
  const expectedDxf=await run(`(async()=>{const {checkFactoryProject}=await import('./src/factory-export.js'),{createSheetLayoutDxf}=await import('./src/factory-sheet-export.js'),project=JSON.parse(localStorage.getItem('atolye.project.v1')).project,result=checkFactoryProject(project);return createSheetLayoutDxf(result.cutting,result.partCodes,{language:project.settings.printLanguage??'tr',materials:project.materials});})()`);
  assert.equal(dxfBytes.toString('utf8'),expectedDxf);
  assert.ok(dxfBytes.includes(Buffer.from('GUILLOTINE SHEET LAYOUT')));
  assert.ok(dxfBytes.includes(Buffer.from('S001_PART_P0001')));
  await run(`document.querySelector('#factory-xlsx').click();`);
  const excelDownload = await eventually(() => downloads.find(item => item.filename.endsWith('-kesim-listesi.xlsx') && item.state === 'completed'), 'Excel button XLSX save');
  const excelBytes = await readFile(excelDownload.path);
  assert.equal(excelBytes.readUInt32LE(0), 0x04034b50);
  for (const file of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) assert.ok(excelBytes.includes(Buffer.from(file)), file);
  const expectedExcel=await run(`(async()=>{const {generateFactoryXLSX}=await import('./src/factory-export.js'),project=JSON.parse(localStorage.getItem('atolye.project.v1')).project;return Array.from(generateFactoryXLSX(project,{language:project.settings.printLanguage??'tr'}));})()`);
  assert.deepEqual(excelBytes,Buffer.from(expectedExcel));
  await eventually(() => run(`document.querySelector('.file-result .hint')?.textContent.includes(${JSON.stringify(excelDownload.path)}) && Boolean(document.querySelector('.file-result [data-reveal-file]'))`), 'visible saved Excel path and folder action');
  assert.equal(excelDownload.method, 'save-dialog');
  await run(`document.querySelector('.file-result [data-reveal-file]').click();`);
  checks.push('The DXF button saves the exact actual sheet-layout DXF, the Excel button saves the exact material-grouped OOXML workbook, and the result visibly reports the completed file path with Show in folder');

  await run(`document.querySelector('[data-drilling="enabled"]').click(); if(document.querySelector('#drilling-csv').disabled) throw new Error('Drilling unexpectedly disabled'); document.querySelector('#drilling-csv').click(); document.querySelector('#drilling-zip').click();`);
  const drillingCsvDownload = await eventually(() => downloads.find(item => item.filename.endsWith('-drilling.csv') && item.state === 'completed'), 'separate drilling CSV');
  const drillingCsv = await readFile(drillingCsvDownload.path, 'utf8');
  assert.ok(drillingCsv.includes('JOINT_ID'));
  assert.ok(drillingCsv.includes('RAW_BLANK_EDGE_ALREADY_DEDUCTED'));
  assert.ok(drillingCsv.includes('countersink'));
  const drillingZipDownload = await eventually(() => downloads.find(item => item.filename.endsWith('-drilling.zip') && item.state === 'completed'), 'separate drilling ZIP');
  const drillingBytes = await readFile(drillingZipDownload.path);
  assert.equal(drillingBytes.readUInt32LE(0), 0x04034b50);
  assert.ok(drillingBytes.includes(Buffer.from('drilling.csv')));
  assert.match(drillingBytes.toString('utf8'), /maps\/P0001(?:-\d+)?\.svg/);
  assert.ok(drillingBytes.includes(Buffer.from('drilling-reference.html')));
  assert.ok(drillingBytes.includes(Buffer.from('rear-fastening.csv')));
  assert.ok(drillingCsv.includes('FASTENER_TYPE'));
  await run(`(async()=>{const {generateDrillingPlan}=await import('./src/drilling.js'),project=JSON.parse(localStorage.getItem('atolye.project.v1')).project,plan=generateDrillingPlan(project);for(const row of plan.rearFastenings.filter(row=>row.method==='nail')){if(row.quantity<=0||plan.holes.some(hole=>hole.partId===row.partId))throw Error('Nail schedule must have quantity and no invented back holes');}})()`);
  assert.ok(!drillingBytes.includes(Buffer.from('dxf/P0001.dxf')));
  assert.equal(await run(`JSON.parse(localStorage.getItem('atolye.project.v1')).project.settings.drilling.enabled`), true);
  checks.push('The optional drilling action persists its settings and downloads separate coordinate CSV and printable SVG maps without changing cutting DXFs');
  await run(`document.querySelector('.factory-drilling details').open=true; const drillDepth=document.querySelector('[data-drilling="countersinkDepth"]'); drillDepth.value='1.5'; drillDepth.dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.equal(await run(`JSON.parse(localStorage.getItem('atolye.project.v1')).project.settings.drilling.countersinkDepth`), 1.5);
  assert.equal(await run(`document.querySelector('.factory-drilling details').open`), true);
  assert.equal(await run(`document.querySelector('[data-drilling="countersinkDepth"]').value`), '1.5');

  const priorDownloads = downloads.length;
  await run(`const button=document.querySelector('#factory-zip'); const offset=document.querySelector('[data-drilling="endOffset"]'); offset.value='51'; offset.dispatchEvent(new Event('change',{bubbles:true})); if(!button.isConnected)throw new Error('An input commit removed the export button before its click'); button.click();`);
  await eventually(() => downloads.slice(priorDownloads).some(item => item.filename.endsWith('-factory.zip') && item.state === 'completed'), 'first factory click after editing drilling');
  await eventually(() => run(`Boolean(document.querySelector('.export-download a[download]')?.href.startsWith('blob:') && document.querySelector('.file-result [data-reveal-file]'))`), 'visible completed file actions');
  const retryDownloads = downloads.length;
  await run(`document.querySelector('.export-download a').click();`);
  await eventually(() => downloads.slice(retryDownloads).some(item => item.state === 'completed' && item.method === 'save-dialog'), 'visible Save file retry');
  checks.push('Changing drilling parameters preserves the export button, its first click saves a ZIP, and the persistent Save file action saves it again through the native dialog');

  await run(`const select=document.querySelector('#factory-cabinet'); select.value=select.options[1].value; select.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#factory-zip').click(); document.querySelector('#drilling-zip').click();`);
  const oneFactory = await eventually(() => downloads.find(item => item.filename.endsWith('-cabinet-001-factory.zip') && item.state === 'completed'), 'individual cabinet assembly package');
  const oneDrilling = await eventually(() => downloads.find(item => item.filename.endsWith('-cabinet-001-drilling.zip') && item.state === 'completed'), 'individual cabinet drilling package');
  const oneFactoryBytes = await readFile(oneFactory.path), oneDrillingBytes = await readFile(oneDrilling.path);
  assert.ok(oneFactoryBytes.includes(Buffer.from('assembly/cabinet-001.html')));
  assert.ok(oneFactoryBytes.includes(Buffer.from('document-set.csv')));
  assert.ok(oneDrillingBytes.includes(Buffer.from('cabinets/cabinet-001/drilling.html')));
  assert.ok(oneDrillingBytes.includes(Buffer.from('cabinets.csv')));
  checks.push('Selecting a cabinet downloads its own assembly and drilling files while preserving the original cabinet and part numbering');

  await run(`document.querySelector('[data-action="close-modal"]').click(); document.querySelector('[data-mode="cabinet"]').click(); document.querySelector('[data-cabinet-view="drawings"]').click(); document.querySelector('[data-drawing-view="assembly"]').click();`);
  const assemblyState = await run(`({cabinet:document.querySelector('#drawings-shell svg[data-assembly-cabinet]')?.getAttribute('data-assembly-cabinet'),groups:Number(document.querySelector('#drawings-shell svg[data-assembly-group-count]')?.getAttribute('data-assembly-group-count')),zoom:Boolean(document.querySelector('#drawings-shell .drawing-zoom')),labels:[...document.querySelectorAll('#drawings-shell [data-assembly-label]')].map(e=>e.getAttribute('data-assembly-label'))})`);
  assert.ok(assemblyState.cabinet); assert.ok(assemblyState.groups > 1);
  assert.equal(await run(`document.querySelector('[data-mode="cabinet"]').classList.contains('active') && document.querySelector('[data-cabinet-view="drawings"]').classList.contains('active') && !document.querySelector('[data-mode="drawings"]')`), true);
  await run(`document.querySelector('[data-assembly-page="2"]').click();`);
  assert.equal(await run(`document.querySelector('#drawings-shell svg').getAttribute('data-assembly-group')`), '2');
  checks.push('The Assembly drawing view shows identified cabinet panels and lets the user select the next readable sheet');

  await run(`document.querySelector('[data-drawing-view="drilling"]').click();`);
  const drillView = await run(`({code:document.querySelector('#drawings-shell svg')?.getAttribute('data-part-code'),options:[...document.querySelector('#drawing-drilling-part').options].map(option=>option.value),scale:document.querySelector('[data-drawing-scale]').textContent,viewBox:document.querySelector('#drawings-shell svg').getAttribute('viewBox'),diagram:document.querySelector('#drawings-shell svg').getAttribute('data-part-inspection-diagram'),allHoles:document.querySelector('#drawings-shell svg').getAttribute('data-inspection-all-holes'),operations:Number(document.querySelector('#drawings-shell svg').getAttribute('data-operation-count')),drawn:document.querySelectorAll('#drawings-shell svg [data-operation-id]').length})`);
  assert.ok(drillView.options.length > 1); assert.ok(drillView.options.includes(drillView.code)); assert.equal(drillView.scale, '100%');
  assert.equal(drillView.diagram, drillView.code); assert.equal(drillView.drawn, drillView.operations); assert.equal(drillView.allHoles, 'true');
  await run(`document.querySelector('[data-zoom="in"]').click();`);
  assert.equal(await run(`document.querySelector('[data-drawing-scale]').textContent`), '125%');
  assert.equal(await run(`document.querySelector('#drawings-shell svg').getAttribute('viewBox')`), drillView.viewBox);
  await run(`(()=>{const select=document.querySelector('#drawing-drilling-part');select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await run(`document.querySelector('#drawings-shell svg').getAttribute('data-part-code')`), drillView.options[1]);
  assert.equal(await run(`document.querySelector('[data-drawing-scale]').textContent`), '125%');
  const selectedDrillCode = drillView.options[1];
  assert.equal(await run(`document.querySelectorAll('#drawings-shell [data-assembly-page]').length`), 0);
  const drawingMarkers = await run(`[...document.querySelectorAll('#drawings-shell [data-inspection-marker]')].map(marker=>marker.dataset.inspectionMarker)`);
  assert.ok(drawingMarkers.length > 1);
  const drawingDimensions = await run(`[...document.querySelectorAll('#drawings-shell [data-inspection-edge]')].map(edge=>({axis:edge.dataset.inspectionEdge,distance:edge.dataset.distance,markers:edge.dataset.inspectionMarkers}))`);
  for (const marker of drawingMarkers) for (const axis of ['A','B']) assert.ok(drawingDimensions.some(edge=>edge.axis===axis&&edge.markers.split(' ').includes(marker)), 'cabinet drawing shows nearest dimensions for every hole at once');
  await run(`document.querySelector('#drawings-shell [data-inspection-marker="${drawingMarkers[1]}"] .hit-target').dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
  assert.equal(await run(`document.querySelector('#drawings-shell svg').dataset.selectedMarker`), drawingMarkers[1]);
  assert.equal(await run(`document.querySelector('[data-drawing-scale]').textContent`), '125%');
  assert.deepEqual(await run(`[...document.querySelectorAll('#drawings-shell [data-inspection-edge]')].map(edge=>({axis:edge.dataset.inspectionEdge,distance:edge.dataset.distance,markers:edge.dataset.inspectionMarkers}))`), drawingDimensions, 'cabinet drawing highlight preserves all dimensions');
  assert.ok(await run(`document.querySelectorAll('#drawings-shell svg [data-inspection-edge]').length >= 2`));
  assert.equal(await run(`document.querySelectorAll('#drawings-shell svg [data-operation-id]').length === Number(document.querySelector('#drawings-shell svg').dataset.operationCount)`), true);
  await run(`document.querySelector('[data-zoom="in"]').click();document.querySelector('[data-zoom="fit"]').click();`);
  assert.equal(await run(`document.querySelector('[data-drawing-scale]').textContent`), '100%');
  await run(`document.querySelector('[data-action="drawing-svg"]').click();`);
  const drillSvg = await eventually(() => downloads.find(item => item.filename.endsWith('.svg') && !item.filename.startsWith('native-export') && item.state === 'completed'), 'selected drilling SVG save');
  assert.ok((await readFile(drillSvg.path, 'utf8')).includes(`data-part-code="${selectedDrillCode}"`));
  assert.ok((await readFile(drillSvg.path, 'utf8')).includes(`data-selected-marker="${drawingMarkers[1]}"`));
  checks.push('The cabinet drilling view shows all markers and nearest-edge dimensions at once, preserves every dimension and zoom while highlighting another marker, and saves the selected SVG');

  // Exercise the real Print/PDF action. Replace only its final OS print-dialog
  // call so unattended validation cannot leave a printer dialog on the desktop.
  await run(`window.__originalOpen=window.open.bind(window); window.open=(...args)=>{const popup=window.__originalOpen(...args); if(popup){window.__smokePrint=popup;popup.print=()=>{window.__smokePrintCalled=true;};}return popup;}; document.querySelector('[data-action="drawing-print"]').click();document.querySelector('#print-room-sheet')?.click();`);
  const popup = await eventually(() => popups.find(item => !item.isDestroyed()), 'inherited about:blank print popup');
  assert.equal(await popup.webContents.executeJavaScript(`typeof window.atolyeFiles`), 'undefined');
  await eventually(() => run(`window.__smokePrintCalled === true`), 'real app print call');
  assert.ok(await run(`Boolean(window.__smokePrint.document.querySelector('svg'))`));
  assert.ok(await run(`Boolean(window.__smokePrint.document.querySelector('svg[data-part-code]'))`));
  await run(`document.querySelector('#save-room-sheet').click();`);
  const drillHtml = await eventually(() => downloads.find(item => item.filename.endsWith('-drilling-reference.html') && item.state === 'completed'), 'drilling print HTML save');
  assert.ok((await readFile(drillHtml.path, 'utf8')).includes('data-part-code='));
  const pdf = await popup.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  await writeFile(path.join(output, 'print-proof.pdf'), pdf);
  popup.close();
  await run(`window.open=window.__originalOpen; void 0;`);
  checks.push('The drilling Print/PDF preview saves its printable HTML and generates a native PDF without granting its popup file-save IPC');

  await run(`document.querySelector('[data-action="close-modal"]')?.click(); document.querySelector('[data-cabinet-view="3d"]').click(); document.querySelector('[data-action="explode-parts"]').click();`);
  await eventually(() => run(`Boolean(document.querySelector('#part-inspector') && document.querySelector('[data-action="explode-parts"].active') && !document.querySelector('#cabinet-viewport').hidden)`), 'exploded cabinet viewport and inspector');
  const nativeWindowWasVisible = window.isVisible();
  if (!nativeWindowWasVisible) window.show();
  window.focus();
  await eventually(() => window.isFocused(), 'focused smoke window for native input');
  await new Promise(resolve => setTimeout(resolve, 200));
  // Compute a visible real panel pixel with the renderer's public class in a
  // detached canvas at the actual viewport dimensions. The actual selection
  // below still travels through native mouse events in the application canvas.
  const picked = await run(`(async()=>{
    const {FurnitureViewport}=await import('./src/renderer.js'),{generateDrillingPlan}=await import('./src/drilling.js'),{inspectCabinetPart}=await import('./src/part-inspection.js'),{createPartInspectionSvg}=await import('./src/part-inspection-diagram.js');
    const project=JSON.parse(localStorage.getItem('atolye.project.v1')).project,live=document.querySelector('#cabinet-viewport'),rect=live.getBoundingClientRect();
    const cabinetId=document.querySelector('[data-cabinet].active')?.dataset.cabinet||project.cabinets[0].id,language=document.querySelector('#interface-language').value;
    const canvas=document.createElement('canvas');canvas.getBoundingClientRect=()=>({width:rect.width,height:rect.height,left:0,top:0});
    const viewport=new FurnitureViewport(canvas);
    try {
      viewport.setProject(project,cabinetId);viewport.setLanguage(language);viewport.setOptions({room:false,dimensions:true,focusCabinet:true,exploded:true,selectedPartId:null});viewport.resetCamera();
      const frame=viewport.depthFrame,eligible=new Set(generateDrillingPlan(project).holes.map(h=>h.partId)),counts=new Map();
      for(let pixel=0;pixel<frame.owners.length;pixel++){const owner=frame.owners[pixel],id=frame.ownerPartIds[owner];if(!eligible.has(id))continue;const item=counts.get(owner)||{owner,count:0,x:0,y:0};item.count++;item.x+=pixel%frame.width;item.y+=Math.floor(pixel/frame.width);counts.set(owner,item);}
      const visible=[...counts.values()].sort((a,b)=>b.count-a.count).find(item=>inspectCabinetPart(project,frame.ownerPartIds[item.owner],{language}).part.orientation!=='horizontal');if(!visible||visible.count<100)throw Error('No visible vertical production panel with drilling operations');
      const center=[visible.x/visible.count,visible.y/visible.count];let best=null,score=Infinity;
      for(let y=4;y<frame.height-4;y++)for(let x=4;x<frame.width-4;x++){
        if(frame.owners[y*frame.width+x]!==visible.owner)continue;
        if([[-3,0],[3,0],[0,-3],[0,3]].some(([dx,dy])=>frame.owners[(y+dy)*frame.width+x+dx]!==visible.owner))continue;
        const distance=(x-center[0])**2+(y-center[1])**2;if(distance<score){best=[x,y];score=distance;}
      }
      if(!best)throw Error('No interior pixel of visible production panel');
      const id=frame.ownerPartIds[visible.owner],info=inspectCabinetPart(project,id,{language}),n=v=>Number(v).toLocaleString({ru:'ru-RU',tr:'tr-TR',en:'en-US'}[language],{maximumFractionDigits:3}),size=d=>[d.width,d.height,d.thickness].map(n).join(' × ')+(language==='ru'?' мм':' mm');
      const parsed=document.createElement('div');parsed.innerHTML=createPartInspectionSvg(info,{allHoles:true});
      return {x:Math.round(rect.left+(best[0]+.5)/frame.scale),y:Math.round(rect.top+(best[1]+.5)/frame.scale),id,code:frame.ownerPartCodes[visible.owner],orientation:info.part.orientation,dimensions:info.dimensions,rawText:size(info.dimensions.raw),finishedText:size(info.dimensions.finished),operations:info.operations.map(h=>({id:h.id,markerId:h.markerId,kind:h.kind,a:h.nearestEdges.a,b:h.nearestEdges.b,t:h.nearestEdges.t})),mapDom:parsed.firstElementChild.outerHTML};
    } finally {viewport.destroy();}
  })()`);
  window.webContents.sendInputEvent({ type: 'mouseMove', x: picked.x, y: picked.y });
  window.webContents.sendInputEvent({ type: 'mouseDown', x: picked.x, y: picked.y, button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: picked.x, y: picked.y, button: 'left', clickCount: 1 });
  await eventually(() => run(`document.querySelector('#part-inspector')?.dataset.partId === ${JSON.stringify(picked.id)}`), 'native click selects its real production panel');
  const inspectorState = await run(`(()=>{const section=document.querySelector('#part-inspector');return {id:section.dataset.partId,code:section.dataset.partCode,width:Number(section.dataset.rawWidth),height:Number(section.dataset.rawHeight),thickness:Number(section.dataset.rawThickness),finished:section.querySelector('[data-inspection-finished]').textContent,raw:section.querySelector('[data-inspection-raw]').textContent};})()`);
  assert.equal(inspectorState.code, picked.code); assert.equal(inspectorState.finished, picked.finishedText); assert.equal(inspectorState.raw, picked.rawText);
  assert.deepEqual([inspectorState.width, inspectorState.height, inspectorState.thickness], [picked.dimensions.raw.width, picked.dimensions.raw.height, picked.dimensions.raw.thickness]);
  assert.equal(await run(`Boolean(document.querySelector('.part-inspection-modal'))`),false,'a single click selects without opening the schema');
  assert.equal(await run(`document.querySelectorAll('#part-inspector input[data-part-edge]').length`),4,'selected real part exposes its four edge controls in the sidebar');
  window.webContents.sendInputEvent({type:'mouseDown',x:picked.x,y:picked.y,button:'left',clickCount:2});
  window.webContents.sendInputEvent({type:'mouseUp',x:picked.x,y:picked.y,button:'left',clickCount:2});
  await eventually(()=>run(`Boolean(document.querySelector('.part-inspection-modal'))`),'native double click opens the selected production part schema');
  assert.equal(await run(`document.querySelector('[data-part-inspection]').dataset.partInspection`), picked.code);
  assert.equal(await run(`document.querySelector('.part-inspection-modal svg').getAttribute('data-part-code')`), picked.code);
  assert.equal(await run(`document.querySelector('.part-inspection-modal svg').outerHTML`), picked.mapDom);
  const naturalView = await run(`(()=>{const svg=document.querySelector('.part-inspection-modal svg');return {direction:svg.dataset.viewBDirection,allHoles:svg.dataset.inspectionAllHoles,top:Number(svg.querySelector('[data-inspection-physical-edge="top"]').getAttribute('y')),bottom:Number(svg.querySelector('[data-inspection-physical-edge="bottom"]').getAttribute('y')),markers:[...svg.querySelectorAll('[data-inspection-marker]')].map(group=>({b:Number(group.dataset.bMm),y:Number(group.querySelector('.hit-target').getAttribute('cy'))}))};})()`);
  assert.equal(naturalView.direction, 'up'); assert.equal(naturalView.allHoles, 'true'); assert.ok(naturalView.top < naturalView.bottom, 'physical top is drawn above the bottom on a real vertical panel');
  let differentB = false;
  for (const first of naturalView.markers) for (const second of naturalView.markers) if (first.b < second.b) { assert.ok(first.y > second.y, 'larger raw B is higher on the vertical drawing'); differentB = true; }
  assert.ok(differentB, 'natural view checks two distinct real hole heights');
  assert.deepEqual((await run(`[...document.querySelectorAll('.part-inspection-modal [data-operation-id]')].map(row=>row.dataset.operationId)`)).sort(), picked.operations.map(h=>h.id).sort());
  const markers = await run(`[...document.querySelectorAll('.part-inspection-modal [data-inspection-marker]')].map(marker=>marker.dataset.inspectionMarker)`);
  assert.deepEqual(markers, [...new Set(picked.operations.map(h=>h.markerId))]); assert.ok(markers.length > 1);
  const allDimensions = await run(`[...document.querySelectorAll('.part-inspection-modal svg [data-inspection-edge]')].map(edge=>({axis:edge.dataset.inspectionEdge,distance:Number(edge.dataset.distance),coordinate:Number(edge.dataset.edgeCoordinate),markers:(edge.dataset.inspectionMarkers??'').match(/G\\d+/g)||[]}))`);
  for (const markerId of markers) {
    const group = picked.operations.filter(h=>h.markerId===markerId), hole=group.find(h=>h.kind==='pilot')||group[0];
    for (const axis of hole.kind==='pilot'?['A','B','T']:['A','B']) assert.ok(allDimensions.some(d=>d.axis===axis&&d.markers.includes(markerId)), `${markerId}: every nearest-edge dimension appears together`);
  }
  await run(`document.querySelector('.part-inspection-modal [data-zoom="in"]').click();`);
  const markerPoint = await run(`(()=>{const target=document.querySelector('.part-inspection-modal [data-inspection-marker="${markers[1]}"] .hit-target');target.scrollIntoView({block:'center',inline:'center'});const rect=target.getBoundingClientRect();return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};})()`);
  window.webContents.sendInputEvent({ type: 'mouseMove', x: markerPoint.x, y: markerPoint.y });
  window.webContents.sendInputEvent({ type: 'mouseDown', x: markerPoint.x, y: markerPoint.y, button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: markerPoint.x, y: markerPoint.y, button: 'left', clickCount: 1 });
  await eventually(() => run(`document.querySelector('.part-inspection-modal svg')?.dataset.selectedMarker === ${JSON.stringify(markers[1])}`), 'native circle click selects its drilling marker');
  const diagramState = await run(`(()=>{const svg=document.querySelector('.part-inspection-modal svg');return {selected:svg.dataset.selectedMarker,scale:document.querySelector('.part-inspection-modal [data-drawing-scale]').textContent,operations:[...svg.querySelectorAll('[data-inspection-operation]')].map(row=>row.dataset.inspectionOperation),edges:[...svg.querySelectorAll('[data-inspection-edge]')].map(edge=>({axis:edge.dataset.inspectionEdge,distance:Number(edge.dataset.distance),coordinate:Number(edge.dataset.edgeCoordinate),markers:(edge.dataset.inspectionMarkers??'').match(/G\\d+/g)||[]})),all:[...svg.querySelectorAll('[data-operation-id]')].map(row=>row.dataset.operationId)};})()`);
  assert.equal(diagramState.selected, markers[1]); assert.equal(diagramState.scale, '125%');
  assert.deepEqual(diagramState.operations.sort(), picked.operations.map(h=>h.id).sort());
  assert.deepEqual(diagramState.all.sort(), picked.operations.map(h=>h.id).sort());
  assert.deepEqual(diagramState.edges.map(edge=>JSON.stringify(edge)).sort(), allDimensions.map(edge=>JSON.stringify(edge)).sort(), 'all dimensions stay unchanged when another marker is highlighted');
  for (const edge of diagramState.edges) for (const markerId of edge.markers) {
    const group=picked.operations.filter(h=>h.markerId===markerId),hole=group.find(h=>h.kind==='pilot')||group[0];
    assert.equal(edge.distance, hole[edge.axis.toLowerCase()].distance);
  }
  const saveMap = await run(`(async()=>{const {inspectCabinetPart}=await import('./src/part-inspection.js'),{createPartInspectionSvg}=await import('./src/part-inspection-diagram.js'),project=JSON.parse(localStorage.getItem('atolye.project.v1')).project;return createPartInspectionSvg(inspectCabinetPart(project,${JSON.stringify(picked.id)},{language:project.settings.printLanguage??'tr'}),{markerId:${JSON.stringify(markers[1])},allHoles:true});})()`);
  const partDownloads = downloads.length;
  await run(`document.querySelector('#save-part').click();`);
  const selectedPartSvg = await eventually(() => downloads.slice(partDownloads).find(item=>item.filename.endsWith('-'+picked.code+'-drilling.svg')&&item.state==='completed'), 'selected exploded part diagram SVG save');
  assert.equal(await readFile(selectedPartSvg.path,'utf8'), saveMap);
  const edgeSnapshot = () => run(`(async()=>{
    const {inspectCabinetPart}=await import('./src/part-inspection.js'),{checkFactoryProject,getWorkshopTable}=await import('./src/factory-export.js'),{generateDrillingPlan}=await import('./src/drilling.js');
    const project=JSON.parse(localStorage.getItem('atolye.project.v1')).project,info=inspectCabinetPart(project,${JSON.stringify(picked.id)},{language:'en'}),factory=checkFactoryProject(project),part=factory.parts.find(part=>part.id===info.sourcePartId),placement=factory.cutting.sheets.flatMap(sheet=>sheet.placements).find(item=>item.partId===info.sourcePartId),row=getWorkshopTable(project,{language:'en'}).rows.find(row=>row[3]===info.partCode),cabinet=project.cabinets.find(cabinet=>cabinet.id===part.cabinetId),stock=project.materials.find(stock=>stock.id===part.materialId);
    return {id:info.sourcePartId,code:info.partCode,raw:info.dimensions.raw,finished:info.dimensions.finished,top:part.edges.top,band:[part.edges.top,cabinet.edgeBand,stock.edgeBand,1].find(value=>Number.isFinite(value)&&value>0),factory:{width:part.width,height:part.height},workshop:{width:row[0],height:row[1]},placement,entries:generateDrillingPlan(project).holes.filter(hole=>hole.partId===info.sourcePartId).map(hole=>({id:hole.id,entry:hole.cabinetEntry})),diagramRaw:{width:Number(document.querySelector('.part-inspection-modal svg').dataset.rawWidth),height:Number(document.querySelector('.part-inspection-modal svg').dataset.rawHeight)}};
  })()`);
  const edgeBefore = await edgeSnapshot(), manualTop = edgeBefore.top > 0 ? 0 : edgeBefore.band;
  assert.equal(await run(`document.querySelectorAll('.part-inspection-modal [data-part-edge-editor="${picked.id}"] [data-part-edge]').length`), 4);
  const edgePoint = await run(`(()=>{const input=document.querySelector('.part-inspection-modal input[data-part-edge="top"][data-part-edge-id="${picked.id}"]');window.__smokeEdgeInput=input;input.scrollIntoView({block:'center'});const rect=input.getBoundingClientRect();return {type:input.type,checked:input.checked,x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};})()`);
  assert.equal(edgePoint.type,'checkbox'); assert.equal(edgePoint.checked,edgeBefore.top>0);
  window.webContents.sendInputEvent({type:'mouseMove',x:edgePoint.x,y:edgePoint.y});
  window.webContents.sendInputEvent({type:'mouseDown',x:edgePoint.x,y:edgePoint.y,button:'left',clickCount:1});
  window.webContents.sendInputEvent({type:'mouseUp',x:edgePoint.x,y:edgePoint.y,button:'left',clickCount:1});
  await eventually(() => run(`Number(document.querySelector('#part-inspector').dataset.rawHeight) === ${Math.round((edgeBefore.raw.height + edgeBefore.top - manualTop)*1000)/1000}`), 'manual edge recalculates the selected cut blank');
  assert.equal(await run(`window.__smokeEdgeInput.isConnected && document.querySelector('.part-inspection-modal input[data-part-edge="top"]') === window.__smokeEdgeInput && document.activeElement === window.__smokeEdgeInput`), true, 'edge toggle preserves its actual focused input');
  assert.equal(await run(`document.querySelector('.part-inspection-modal [data-drawing-scale]').textContent`),'125%','edge refresh preserves zoom');
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
  try {
    await eventually(()=>run(`document.activeElement?.dataset.partEdge === 'bottom' && document.activeElement?.dataset.partEdgeId === ${JSON.stringify(picked.id)} && document.activeElement.isConnected`),'Tab advances from top to the next live bottom edge input',1500);
  } catch(error) {
    const focus=await run(`({tag:document.activeElement?.tagName,id:document.activeElement?.id,edge:document.activeElement?.dataset.partEdge,source:document.activeElement?.dataset.partEdgeId,hasFocus:document.hasFocus(),connected:document.activeElement?.isConnected})`);
    throw new Error('Native edge Tab focus: '+JSON.stringify(focus),{cause:error});
  }
  const edgeAfter = await edgeSnapshot();
  assert.equal(edgeAfter.id,picked.id); assert.equal(edgeAfter.code,picked.code); assert.equal(edgeAfter.top,manualTop); assert.deepEqual(edgeAfter.finished,edgeBefore.finished);
  assert.equal(edgeAfter.raw.width,edgeBefore.raw.width); assert.equal(edgeAfter.raw.height,Math.round((edgeBefore.raw.height+edgeBefore.top-manualTop)*1000)/1000);
  assert.deepEqual(edgeAfter.factory,{width:edgeAfter.raw.width,height:edgeAfter.raw.height}); assert.deepEqual(edgeAfter.workshop,edgeAfter.factory); assert.deepEqual(edgeAfter.diagramRaw,edgeAfter.factory);
  assert.deepEqual(edgeAfter.placement.rotated?[edgeAfter.placement.height,edgeAfter.placement.width]:[edgeAfter.placement.width,edgeAfter.placement.height],[edgeAfter.raw.width,edgeAfter.raw.height]);
  assert.deepEqual(edgeAfter.entries,edgeBefore.entries,'changing bands updates local blanks while keeping the real joint axes');
  await window.loadURL('atolye://app/');
  await eventually(() => run(`Boolean(document.querySelector('[data-cabinet-view="3d"]'))`), 'reload after manual edge save');
  await run(`document.querySelector('[data-mode="cabinet"]').click();document.querySelector('[data-cabinet-view="3d"]').click();if(!document.querySelector('[data-action="explode-parts"].active'))document.querySelector('[data-action="explode-parts"]').click();document.querySelector('[data-inspect-part="${picked.id}"]').click();`);
  const edgeReloaded = await edgeSnapshot();
  assert.deepEqual(edgeReloaded.raw,edgeAfter.raw); assert.equal(edgeReloaded.top,manualTop); assert.equal(edgeReloaded.code,picked.code);
  await run(`document.querySelector('.part-inspection-modal [data-part-edge-reset="${picked.id}"]').click();`);
  const edgeReset = await edgeSnapshot();
  assert.deepEqual(edgeReset.raw,edgeBefore.raw); assert.equal(edgeReset.top,edgeBefore.top); assert.deepEqual(edgeReset.finished,edgeBefore.finished);
  checks.push('Toggling one edge checkbox preserves its focused node and 125% zoom; Tab reaches the next edge, raw blank/diagram/workshop/cutting update without moving joint axes, reload retains the edit, and Reset restores automatic bands');
  const datumSnapshot = () => run(`(async()=>{const {generateDrillingPlan}=await import('./src/drilling.js'),{generateFactoryCSV,checkFactoryProject}=await import('./src/factory-export.js'),{inspectCabinetPart}=await import('./src/part-inspection.js'),project=JSON.parse(localStorage.getItem('atolye.project.v1')).project,info=inspectCabinetPart(project,${JSON.stringify(picked.id)},{language:'en'}),svg=document.querySelector('.part-inspection-modal svg');return {enabled:project.settings.drilling.measureFromFinishedEdge??false,holes:generateDrillingPlan(project).holes,raw:info.dimensions.raw,measurement:info.measurement,factoryCsv:generateFactoryCSV(project),placements:checkFactoryProject(project).cutting.sheets.flatMap(sheet=>sheet.placements),basis:svg.dataset.measurementBasis,width:Number(svg.dataset.measurementWidth),height:Number(svg.dataset.measurementHeight)};})()`);
  const datumBefore=await datumSnapshot();assert.equal(datumBefore.basis,'raw');
  await run(`document.querySelector('.part-inspection-modal [data-zoom="in"]').click();`);
  const datumPoint=await run(`(()=>{const input=document.querySelector('.part-inspection-modal input[data-drilling="measureFromFinishedEdge"]');window.__smokeDatumInput=input;input.scrollIntoView({block:'center'});const rect=input.getBoundingClientRect();return {checked:input.checked,x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};})()`);assert.equal(datumPoint.checked,false);
  window.webContents.sendInputEvent({type:'mouseMove',x:datumPoint.x,y:datumPoint.y});window.webContents.sendInputEvent({type:'mouseDown',x:datumPoint.x,y:datumPoint.y,button:'left',clickCount:1});window.webContents.sendInputEvent({type:'mouseUp',x:datumPoint.x,y:datumPoint.y,button:'left',clickCount:1});
  await eventually(()=>run(`document.querySelector('.part-inspection-modal svg')?.dataset.measurementBasis === 'finished'`),'finished-edge datum updates the actual part diagram');
  assert.equal(await run(`window.__smokeDatumInput.isConnected && document.activeElement===window.__smokeDatumInput`),true,'datum checkbox keeps its focused input');
  assert.equal(await run(`document.querySelector('.part-inspection-modal [data-drawing-scale]').textContent`),'125%');
  const datumAfter=await datumSnapshot();assert.equal(datumAfter.enabled,true);assert.deepEqual(datumAfter.holes,datumBefore.holes);assert.deepEqual(datumAfter.raw,datumBefore.raw);assert.equal(datumAfter.factoryCsv,datumBefore.factoryCsv);assert.deepEqual(datumAfter.placements,datumBefore.placements);assert.deepEqual([datumAfter.width,datumAfter.height],[picked.dimensions.finished.width,picked.dimensions.finished.height]);assert.equal(datumAfter.measurement.basis,'finished');
  const finishedSave=await run(`(async()=>{const {inspectCabinetPart}=await import('./src/part-inspection.js'),{createPartInspectionSvg}=await import('./src/part-inspection-diagram.js'),project=JSON.parse(localStorage.getItem('atolye.project.v1')).project,markerId=document.querySelector('.part-inspection-modal svg').dataset.selectedMarker;return createPartInspectionSvg(inspectCabinetPart(project,${JSON.stringify(picked.id)},{language:project.settings.printLanguage??'tr'}),{markerId,allHoles:true});})()`);
  const datumDownloads=downloads.length;await run(`document.querySelector('#save-part').click();`);
  const finishedSvg=await eventually(()=>downloads.slice(datumDownloads).find(item=>item.filename.endsWith('-'+picked.code+'-drilling.svg')&&item.state==='completed'),'finished-edge part diagram SVG save');assert.equal(await readFile(finishedSvg.path,'utf8'),finishedSave);
  await run(`document.querySelector('.part-inspection-modal input[data-drilling="measureFromFinishedEdge"]').click();`);const datumRestored=await datumSnapshot();assert.equal(datumRestored.basis,'raw');assert.equal(datumRestored.enabled,false);assert.deepEqual(datumRestored.holes,datumBefore.holes);
  checks.push('A native finished-edge datum toggle preserves focus and 125% zoom, changes only displayed dimensions, saves the exact finished-basis SVG, and leaves physical holes, raw cutting CSV and sheet placements unchanged');
  const screwSnapshot = () => run(`(async()=>{const {generateDrillingPlan}=await import('./src/drilling.js'),project=JSON.parse(localStorage.getItem('atolye.project.v1')).project,plan=generateDrillingPlan(project),svg=document.querySelector('.part-inspection-modal svg');return {mode:project.settings.drilling.screwsPerJoint??'auto',errors:plan.errors,joints:plan.joints.map(joint=>({id:joint.id,pairs:joint.pairIds,fastenerType:joint.fastenerType})),holes:plan.holes,drawn:[...svg.querySelectorAll('[data-operation-id]')].map(operation=>operation.dataset.operationId),markers:[...svg.querySelectorAll('[data-inspection-marker]')].map(marker=>marker.dataset.inspectionMarker),dimensions:[...svg.querySelectorAll('[data-inspection-edge]')].map(edge=>({axis:edge.dataset.inspectionEdge,markers:edge.dataset.inspectionMarkers.split(' ')})),all:svg.dataset.inspectionAllHoles};})()`);
  const autoScrews = await screwSnapshot();
  assert.ok(autoScrews.joints.some(joint=>joint.pairs.length >= 3), 'native fixture exercises an automatic joint with three axes');
  await run(`(()=>{const select=document.querySelector('.part-inspection-modal [data-drilling="screwsPerJoint"]');select.value='2';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const twoScrews = await screwSnapshot();
  assert.equal(twoScrews.mode,2); assert.deepEqual(twoScrews.errors,[]); assert.equal(twoScrews.all,'true');
  for (const joint of twoScrews.joints) {
    if(joint.fastenerType==='rear-screw'){assert.equal(twoScrews.holes.filter(hole=>joint.pairs.includes(hole.pairId)).length,joint.pairs.length*2);continue;}
    assert.equal(joint.pairs.length,2);
    assert.equal(twoScrews.holes.filter(hole=>joint.pairs.includes(hole.pairId)).length,6);
    for (const pair of joint.pairs) {
      const operations=twoScrews.holes.filter(hole=>hole.pairId===pair),clearance=operations.find(hole=>hole.kind==='clearance'),pilot=operations.find(hole=>hole.kind==='pilot');
      assert.ok(clearance&&pilot);
      for (const axis of ['x','y','z']) assert.ok(Math.abs(clearance.worldEntry[axis]+clearance.direction[axis]*clearance.depth-pilot.worldEntry[axis])<.0015,'two-screw counterparts share the actual world axis');
    }
  }
  assert.deepEqual(twoScrews.drawn.sort(),twoScrews.holes.filter(hole=>hole.partId===picked.id).map(hole=>hole.id).sort());
  for (const marker of twoScrews.markers) for (const axis of ['A','B']) assert.ok(twoScrews.dimensions.some(edge=>edge.axis===axis&&edge.markers.includes(marker)), 'new two-screw diagram retains every nearest-edge dimension');
  await run(`(()=>{const select=document.querySelector('.part-inspection-modal [data-drilling="screwsPerJoint"]');select.value='auto';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const restoredScrews = await screwSnapshot();
  assert.equal(restoredScrews.mode,'auto'); assert.deepEqual(restoredScrews.holes,autoScrews.holes);
  checks.push('The selected-part screw count control switches automatic joints to exactly two shared axes and six operations, updates all graphical holes and dimensions, and restores the original exact positions in Auto');
  await run(`document.querySelector('[data-action="close-modal"]').click(); document.querySelector('[data-action="explode-parts"]').click();`);
  assert.equal(await run(`Boolean(document.querySelector('[data-action="explode-parts"].active'))`), false);
  checks.push('Cabinet drawings stay under the Cabinet tab; a native click selects a real exploded vertical panel and its exact global P/raw/finished dimensions, opens all-hole dimensions with physical top above bottom, highlights another hole without changing dimensions at 125% zoom, and saves the exact diagram in the print language');

  assert.deepEqual(rendererErrors, []);
  for (const pathname of ['/package.json', '/.tools/credentials.json', '/desktop/main.cjs']) assert.equal(await run(`fetch(${JSON.stringify('atolye://app' + pathname)}).then(response=>response.status)`), 404);
  assert.equal(await run(`window.open('https://example.org','_blank') === null`), true);
  assert.equal(await run(`window.open('file:///C:/Windows/win.ini','_blank') === null`), true);
  checks.push('Private bundle paths, external embedded windows and file URLs are blocked');
  const blockedResourceMessages = rendererErrors.filter(message => message === 'Not allowed to load local resource: file:///C:/Windows/win.ini');
  assert.deepEqual(rendererErrors.filter(message => !blockedResourceMessages.includes(message)), []);
  console.log('Desktop smoke: native graphical panel/marker checks passed; capturing final page.');
  const screenshot = await window.webContents.capturePage();
  await writeFile(path.join(output, 'desktop.png'), screenshot.toPNG());
  if (!nativeWindowWasVisible) window.hide();
  console.log('Desktop smoke: final page captured; clearing isolated test storage.');
  await appSession.clearStorageData();
  return { passed: true, version: app.getVersion(), electron: process.versions.electron, packaged: app.isPackaged, checks, downloads, modelInspection:{partCode:picked.code,orientation:picked.orientation,rawDimensions:picked.dimensions.raw,defaultTopBand:edgeBefore.top,toggledTopBand:manualTop,automaticAxesPerJoint:autoScrews.joints.map(joint=>joint.pairs.length),forcedAxesPerJoint:twoScrews.joints.map(joint=>joint.pairs.length)}, rendererErrors: [], blockedResourceMessages };
}

module.exports = { runSmoke };
