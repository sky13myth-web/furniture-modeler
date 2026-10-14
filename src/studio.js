import {createDefaultProject,createCabinet,duplicateCabinet,createSection,convertLegacyLayout,getCabinetLayout,getSectionMountingAxes,getFrontLayout,getInternalDrawerLayout,getApplianceFit,getRodLayout,findFreeRodPosition,findLayoutNode,splitSection,removeSection,deleteMaterial,getMaterialUsage,extendCabinetSide,canPlaceCabinet,canEditCabinetPlacement,syncMezzanines,getPartEdgeBanding,getEdgeBandingSummary,generateParts,optimizeCutting,validateProject} from './engine.js';
import {applyQuickFix,adjustCabinetToFitAppliance} from './quick-fix.js';
import {getApplianceDefaultDimensions,getApplianceGapDefaults,APPLIANCE_PRESETS} from './kitchen-appliances.js';
import {constrainCabinetEdit,resizeApplianceSection,resizeApplianceDivider,setApplianceSectionDepth,resizeConstrainedInteriorSection,resizeConstrainedInteriorDivider} from './appliance-constraints.js';
import {resizeCabinetOnPlan} from './cabinet-plan-resize.js';
import {getInteriorLayout,createInteriorFromSection,findInteriorNode,splitInteriorSection,removeInteriorSection} from './cabinet-interior.js';
import {getInteriorDrawerHardwareOwner,setInteriorDrawerHingeGap} from './interior-hardware.js';
import {checkImport,csvCell} from './project-io.js';
import {FurnitureViewport,createDrawingSvg,createAssemblySvg,generateDrawingHTML,createPartSvg,describePartEdges,generateCabinet3DHTML,generateRoom3DHTML,generateHardwareHTML,generateCostPrintHTML,HANDLE_STYLES,HANDLE_FINISHES,HINGE_STYLES,DRAWER_RAILING_STYLES,ROD_STYLES} from './renderer.js';
import {generateRoomPlanHTML} from './room-print.js';
import {generateRoomPresentationHTML} from './room-presentation.js';
import {generateRoomOBJ,downloadRoomOBJ} from './room-obj.js';
import {RoomWebGLRenderer,RENDER_QUALITY,FLOOR_STYLES} from './room-renderer-webgl.js';
import {RoomEditor} from './room-editor.js';
import {getRoomOutline,roomBounds,wallLength,remapWindows,polygonIsSimple} from './room-geometry.js';
import {CabinetEditor} from './cabinet-editor.js';
import {isObstacle,createObstacle,normalizeObstacle,setPipeOrientation,findObstacleConflicts,PIPE_DIAMETERS} from './room-obstacles.js';
import {STANDARDS,MATERIAL_PRESETS,DEFAULT_MATERIAL_PRESETS} from './standards.js';
import {isKapakMatt,isKapakGloss} from './yildiz-catalog.js';
import {createLaundryExample,createInteriorExample,createRodsExample} from './examples.js';
import {applyTranslations,translateText,localizeMaterialPreset} from './i18n.js';
import {printNumber,translatePrintText,translatePartName,translateMaterialName,translateBuiltInName} from './print-i18n.js';
import {DrawingZoom,drawingZoomMarkup} from './drawing-zoom.js';
import {defaultHingesPerDoor} from './hardware.js';
import {getMaterialPrice,getPriceSettings,getProjectCostEstimate,generateCostHTML} from './pricing.js';
import {getPricingPreferences,applyPricingPreferences} from './pricing-preferences.js';
import {ensureDefaultBackMaterial} from './material-defaults.js';
import {checkFactoryProject,generateFactoryCSV,generateFactoryZip,generateFactoryXLSX} from './factory-export.js';
import {createSheetLayoutDxf} from './factory-sheet-export.js';
import {createCuttingSheetSvg,createCuttingSheetPrintPages} from './cutting-sheet.js';
import {getDocumentInfo} from './print-document.js';
import {productionPartCode} from './production-id.js';
import {normalizeDrillingSettings} from './drilling.js';
import {checkDrillingExport,generateDrillingCSV,generateDrillingZip} from './drilling-export.js';
import {getDrillingDrawingSet} from './drilling-view.js';
import {exportBaseName} from './export-filename.js';
import {inspectCabinetPart} from './part-inspection.js';
import {createPartInspectionSvg} from './part-inspection-diagram.js';
import {setPartEdgeBanding,getPartEdgeBandingOverride} from './part-edge-banding.js';

const $=s=>typeof document!=='undefined'?document.querySelector(s):null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:d});
const rounded=v=>Math.round(Number(v)*10)/10;
const uid=p=>`${p}-${crypto.randomUUID().slice(0,8)}`;
const clone=v=>structuredClone(v);
const key='atolye.project.v1',pricingKey='atolye.pricing.v1';
const locSearch=typeof location!=='undefined'?location.search:'';
const demoMode=new URLSearchParams(locSearch).has('demo');
let interfaceLanguage='tr';try{const language=typeof localStorage!=='undefined'?localStorage.getItem('atolye.ui.language'):null;if(['ru','tr','en'].includes(language))interfaceLanguage=language;}catch{}
const paths={plus:'M12 5v14M5 12h14',cube:'m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 10v8M3 8l9 5 9-5',room:'M3 3h18v18H3V3Zm9 0v8h9',drawing:'M4 3h16v18H4V3Zm4 5h8m-8 4h5m-5 4h8',cut:'M3 3h18v18H3V3Zm7 0v18m0-12h11m-11 6h11',undo:'m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v3',redo:'m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v3',close:'m6 6 12 12M6 18 18 6',menu:'M4 6h16M4 12h16M4 18h16',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',settings:'M4 7h16M4 17h16M8 4v6M16 14v6',copy:'M8 8h13v13H8V8Zm0 8H3V3h13v5',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15',reset:'M3 10a9 9 0 1 1 2 8M3 3v7h7',door:'M4 3h16v18H4V3Zm8 0v18m-3-10v3m6-3v3',drawer:'M3 4h18v16H3V4Zm0 8h18M9 8h6m-6 8h6',open:'M3 3h18v18H3V3Zm0 9h18',splitH:'M3 3h18v18H3V3Zm0 9h18m-6-6 3 3 3-3m-6 12 3-3 3 3',splitV:'M3 3h18v18H3V3Zm9 0v18M6 9l3 3-3 3m12-6-3 3 3 3',print:'M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6v-7Z',check:'m5 12 4 4L19 6',info:'M12 11v6m0-10v1',measure:'M3 17l4 4L21 7l-4-4L3 17Zm4 4l-4-4m8-8l-2 2m4-2l-2 2m4-2l-2 2',camera:'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.cube}"/></svg>`;
let project=(new Map([['laundry',createLaundryExample],['interior',createInteriorExample],['rods',createRodsExample]]).get(new URLSearchParams(locSearch).get('demo'))??createDefaultProject)(interfaceLanguage),restored=false;
if(!demoMode)applyApplicationPricing(project);
try{const saved=demoMode?null:(typeof localStorage!=='undefined'?JSON.parse(localStorage.getItem(key)):null);if(saved?.project){checkImport(saved.project);project=saved.project;restored=true;}}catch{}
function prepare(p){ensureDefaultBackMaterial(p);if(p.settings.drilling)p.settings.drilling=normalizeDrillingSettings(p.settings.drilling);p.settings.deductEdge=true;p.room.outline??=getRoomOutline(p.room);p.cabinets.forEach(c=>{c.includeBack??=true;c.rotation??=0;});syncMezzanines(p);p.version=2;return p;}
prepare(project);
let cabinetId=project.cabinets[0]?.id,sectionId=null,mode='cabinet',cabinetView='scheme',drawingView='front',selectedWall=0,factoryCabinetId=null,drawingAssemblyPage=1;
let history=[],future=[],parts=[],cutting={sheets:[],unplaced:[],totalSheets:0,utilization:0},warnings=[];
let expanded=new Set(['hardware-design']),toastTimer,roomView='plan';
let propertyContext='';
let interiorParentId=null;
let drawingZoom,partZoom,drawingZoomView=null;
let drillingPartCode=null,drillingDrawingCache=null,drillingMarkerId=null;
let roomFocus='wall',selectedWindowId=null,selectedLightId=null;
let inspectionPartId=null;
let inspectionMarkerId=null;
let inspectionCache=null;
let refreshPartModal=null;

let cabinetEditor=null,viewport=null,roomViewport=null,roomRenderer=null,roomEditor=null;

if(typeof document!=='undefined'&&$('#app')){
$('#app').innerHTML=`<header class="studio-header"><a class="brand" href="#" aria-label="ATÖLYE"><span class="brand-mark">A</span><strong>ATÖLYE</strong></a><button class="project-name" data-action="rename"></button><div class="mode-tabs" role="tablist"><button data-mode="cabinet">${icon('cube')}Шкаф</button><button data-mode="room">${icon('room')}Помещение</button><button data-mode="cutting">${icon('cut')}Раскрой</button></div><span class="local-state">На вашем компьютере</span><div class="header-right"><button class="text-button" data-action="help">Как работать</button><span class="units">мм</span><button class="icon-button" data-action="undo" aria-label="Отменить" title="Ctrl+Z">${icon('undo')}</button><button class="icon-button" data-action="redo" aria-label="Повторить" title="Ctrl+Y">${icon('redo')}</button><button class="button" data-action="file">${icon('menu')}Проект</button></div></header>
<main class="studio-workspace"><aside class="project-sidebar"><div class="sidebar-heading">ШКАФЫ ПРОЕКТА <span id="cabinet-count"></span></div><div id="cabinet-list"></div><button class="add-cabinet" data-action="add-cabinet">${icon('plus')}Добавить шкаф</button><div class="sidebar-bottom"><button class="text-button" data-action="materials">${icon('settings')}Материалы</button></div></aside>
<section class="studio-stage"><div class="stage-header"><div class="stage-title-wrap"><span class="eyebrow" id="stage-eyebrow"></span><h1 id="stage-title"></h1></div><div class="stage-center-tools"><div class="view-switch" id="cabinet-view-switch" role="toolbar" aria-label="Виды шкафа"><button data-cabinet-view="scheme">Схема</button><button data-cabinet-view="3d">3D</button><button data-cabinet-view="drawings">Чертежи</button><button type="button" class="raytrace-tab-btn" data-action="open-raytrace-3d" title="Открыть реалистичный 3D-рендер с трассировкой лучей">✨ Фото-рендер 3D</button></div><div class="cabinet-3d-toolbar" id="cabinet-3d-tools" hidden><button class="button" data-action="explode-parts">Раздвинуть детали</button><button class="button quiet" data-action="open-fronts">Открыть фасады</button><label class="render-color open-slider-wrap" title="Плавное открытие дверей и ящиков"><span id="cabinet-open-label">Открытие: 0%</span><input type="range" min="0" max="100" step="1" data-action="cabinet-open-slider" id="cabinet-open-slider" value="0"></label><button class="button quiet" data-action="open-internal" hidden>Открыть внутренние ящики</button><button class="button quiet" data-action="cabinet-3d-print">Печать 3D-вида</button></div></div><div id="stage-actions"></div></div>
<div class="design-canvas" id="design-shell"><div class="canvas-top"><div class="canvas-edit-tools" id="cabinet-tools" role="toolbar" aria-label="Инструменты секции"><button class="button" data-split="horizontal" title="Разделить выбранную секцию по высоте">${icon('splitH')}По высоте</button><button class="button" data-split="vertical" title="Разделить выбранную секцию по ширине">${icon('splitV')}По ширине</button><button class="icon-button" data-action="extend-left" title="Добавить секцию слева" aria-label="Добавить секцию слева">←${icon('plus')}</button><button class="icon-button" data-action="extend-right" title="Добавить секцию справа" aria-label="Добавить секцию справа">${icon('plus')}→</button><button class="icon-button" data-action="delete-section" title="Удалить выбранную секцию, расширив соседнюю" aria-label="Удалить секцию">${icon('trash')}</button></div><button class="icon-button" data-action="reset-view" title="Уместить на экране" aria-label="Уместить на экране">${icon('reset')}</button></div><div id="cabinet-editor"></div><canvas id="cabinet-viewport" hidden></canvas></div>
<div class="room-canvas" id="room-shell" hidden><div class="room-tools" id="room-tools" role="toolbar" aria-label="Инструменты помещения"><button class="button" data-action="add-window">${icon('plus')}Окно</button><button class="button" data-action="add-door">${icon('door')}Дверь</button><button class="button" data-action="add-pipe" title="Труба у выбранной стены">Труба</button><button class="button" data-action="add-box" title="Короб, колонна или вентканал у выбранной стены">Короб</button><button class="button" data-action="room-niche">Ниша</button><button class="button" data-action="room-protrusion">Выступ</button><button class="button" data-action="add-light" title="Добавить источник света для 3D-рендера (не отображается в чертежах)">💡 Свет</button><button class="button" data-action="toggle-measure" title="Рулетка: измерение расстояний">${icon('measure')}Рулетка</button><button class="icon-button" data-action="add-corner" title="Добавить угол на выбранной стене" aria-label="Добавить угол">${icon('plus')}</button><button class="icon-button" data-action="remove-corner" title="Удалить выбранный угол" aria-label="Удалить угол">${icon('trash')}</button></div><div id="room-editor"></div><canvas id="room-viewport" hidden></canvas><canvas id="room-render-viewport" hidden></canvas><div class="render-hud-overlay" id="render-hud" hidden></div></div>
<div class="drawing-stage" id="drawings-shell" hidden></div><div class="cutting-stage" id="cutting-shell" hidden></div><div class="stage-status" id="stage-status"></div></section>
<aside class="properties"><div id="properties-content"></div></aside></main><footer class="studio-footer"><span id="footer-info"></span><button class="text-button" data-action="validation" id="validation-button"></button></footer>`;

$('[data-action="undo"]')?.insertAdjacentHTML('beforebegin',`<select id="interface-language" aria-label="Язык интерфейса"><option value="ru">Русский</option><option value="tr">Türkçe</option><option value="en">English</option></select>`);
if($('#interface-language'))$('#interface-language').value=interfaceLanguage;
cabinetEditor=new CabinetEditor($('#cabinet-editor'),{onSelect:id=>{sectionId=id;render();},onResize:(id,axis,mm)=>change(()=>{const c=selectedCabinet();return applyCabinetResult(c,interiorParentId?resizeConstrainedInteriorDivider(c,interiorParentId,id,axis,mm,project):resizeApplianceDivider(c,id,axis,mm,project));})});
viewport=new FurnitureViewport($('#cabinet-viewport'),{onSelect:id=>{if(id){if(id!==cabinetId)interiorParentId=null;cabinetId=id;sectionId=null;render();}else{viewport.setProject(project,null);renderProperties();}},onPartSelect:id=>{if(inspectionPartId!==id)inspectionMarkerId=null;inspectionPartId=id;viewport.setOptions({selectedPartId:id});renderProperties();},onPartOpen:id=>{if(id)showPart(id);}});
roomViewport=new FurnitureViewport($('#room-viewport'),{onSelect:id=>{if(id){if(id!==cabinetId){interiorParentId=null;sectionId=null;}cabinetId=id;roomFocus='cabinet';selectedWindowId=null;selectedLightId=null;roomViewport.setProject(project,cabinetId);renderProperties();renderList();}else if(roomFocus==='cabinet'){roomFocus='wall';roomViewport.setProject(project,null);renderProperties();renderList();}}});
roomRenderer=new RoomWebGLRenderer($('#room-render-viewport'),{onSelect:id=>{if(id){if(id!==cabinetId)interiorParentId=null;cabinetId=id;sectionId=null;roomFocus='cabinet';selectedWindowId=null;selectedLightId=null;renderProperties();renderList();renderHud();}else if(roomFocus==='cabinet'){roomFocus='wall';renderProperties();renderList();renderHud();}}});
try{const savedQuality=localStorage.getItem('atolye.render.quality');if(RENDER_QUALITY[savedQuality])roomRenderer.quality=savedQuality;}catch{}
try{const savedFloor=localStorage.getItem('atolye.render.floorStyle');if(FLOOR_STYLES[savedFloor])roomRenderer.floorStyle=savedFloor;}catch{}
try{const sun=JSON.parse(localStorage.getItem('atolye.render.sun')||'null');if(sun){if(Number.isFinite(sun.azimuth))roomRenderer.sunAzimuth=sun.azimuth;if(Number.isFinite(sun.elevation))roomRenderer.sunElevation=Math.max(5,Math.min(85,sun.elevation));if(sun.wallShadows===false)roomRenderer.wallShadows=false;}}catch{}
const saveSun=()=>{try{localStorage.setItem('atolye.render.sun',JSON.stringify({azimuth:roomRenderer.sunAzimuth,elevation:roomRenderer.sunElevation,wallShadows:roomRenderer.wallShadows!==false}));}catch{}};
document.addEventListener('input',e=>{
 const a=e.target?.dataset?.action;
 if(a==='cabinet-open-slider'){
  const pct=Number(e.target.value);
  viewport.setOpenProgress(pct/100);
  const lbl=$('#cabinet-open-label');if(lbl)lbl.textContent=`${translateText('Открытие',interfaceLanguage)}: ${Math.round(pct)}%`;
  $('[data-action="open-fronts"]').textContent=viewport.options.doorsOpen?translateText('Закрыть фасады',interfaceLanguage):translateText('Открыть фасады',interfaceLanguage);
  return;
 }
 if(a==='render-open-slider'){
  const pct=Number(e.target.value);
  roomRenderer.setOpenProgress(pct/100);
  const lbl=$('#render-open-label');if(lbl)lbl.textContent=`${Math.round(pct)}%`;
  return;
 }
 if(a==='render-wall-color'||a==='render-ceiling-color'){
  const key=a==='render-wall-color'?'wallColor':'ceilingColor',val=e.target.value;
  if(/^#[0-9a-f]{6}$/i.test(val)){project.room[key]=val.toLowerCase();roomRenderer.buildGeometry({force:true});roomRenderer.render();}
  return;
 }
 if(a!=='render-sun-azimuth'&&a!=='render-sun-elevation')return;
 const v=Number(e.target.value);roomRenderer.setSunAngles(a==='render-sun-azimuth'?{azimuth:v}:{elevation:v});const s=e.target.previousElementSibling;if(s)s.textContent=(a==='render-sun-azimuth'?'☀ ':'↑ ')+Math.round(v)+'°';saveSun();
});
roomEditor=new RoomEditor($('#room-editor'),{
 onChange:(outline,metadata)=>change(()=>{project.room.windows=remapWindows(project.room,outline,metadata);project.room.outline=outline;const b=roomBounds(project.room);project.room.width=b.width;project.room.depth=b.depth;selectedWall=Math.min(selectedWall,outline.length-1);}),
 onSelectWall:index=>{selectedWall=index;roomFocus='wall';selectedWindowId=null;selectedLightId=null;roomEditor.setSelectedWindow(null);renderProperties();},
 onSelectCorner:index=>{roomFocus='corner';selectedWindowId=null;selectedLightId=null;renderProperties();},
 onSelectCorners:indices=>{roomFocus=indices.length?'corner':'wall';selectedWindowId=null;selectedLightId=null;renderProperties();},
 onDeleteOpening:id=>deleteOpening(id),
 onDeleteCabinet:id=>deleteCabinet(id),
 onDeleteLight:id=>deleteLight(id),
 onSelectWindow:id=>{selectedWindowId=id;selectedLightId=null;roomFocus='window';const w=selectedOpening();if(w)selectedWall=w.wallIndex??legacyWall(w.wall);renderProperties();},
 onMoveWindow:(id,pos)=>change(()=>{const w=project.room.windows.find(w=>w.id===id);if(w)w.offset=rounded(pos.offset);}),
 onSelectLight:id=>{selectedLightId=id;selectedWindowId=null;roomFocus='light';renderProperties();},
 onMoveLight:(id,pos)=>change(()=>{const l=(project.room.lights||[]).find(l=>l.id===id);if(l){l.x=rounded(pos.x);l.z=rounded(pos.z);}}),
 onSelectCabinet:id=>{if(id!==cabinetId)interiorParentId=null;cabinetId=id;sectionId=null;roomFocus='cabinet';selectedWindowId=null;selectedLightId=null;renderProperties();renderList();},
 // Keep the solved contact position: rounding can push a corner into a wall.
 onMoveCabinet:(id,pos)=>change(()=>{const c=project.cabinets.find(c=>c.id===id);if(c){c.x=pos.x;c.z=pos.z;}}),
 onResizeCabinet:(id,dimensions)=>change(()=>{const c=project.cabinets.find(c=>c.id===id);return c?applyCabinetResult(c,resizeCabinetOnPlan(c,dimensions,project)):false;})
});
}
function selectedCabinet(){return project.cabinets.find(c=>c.id===cabinetId);}
function selectedOpening(){return project.room.windows.find(w=>w.id===selectedWindowId);}
function selectedLight(){return (project.room.lights||[]).find(l=>l.id===selectedLightId);}
function editableSection(){const c=selectedCabinet();if(c)c.layout??=convertLegacyLayout(c);return selectedSection();}
function layout(){const c=selectedCabinet();return c?getCabinetLayout(c,project):null;}
function selectedSection(){const g=layout();if(!g)return null;let sections=g.sections;if(interiorParentId){const outer=sections.find(s=>s.id===interiorParentId);if(['doors','open'].includes(outer?.node.front)&&outer.node.interiorLayout)sections=getInteriorLayout(outer,g.thickness).sections;else interiorParentId=null;}let s=sections.find(s=>s.id===sectionId);if(!s){s=sections[0];sectionId=s?.id;}return s;}
function editorLayout(){const g=layout(),outer=g?.sections.find(s=>s.id===interiorParentId);return outer?getInteriorLayout(outer,g.thickness):g;}
function calculate(){parts=generateParts(project);cutting=optimizeCutting(parts,project.materials,project.settings);warnings=validateProject(project);if(demoMode){$('.local-state').textContent='Пример · без автосохранения';return;}try{localStorage.setItem(key,JSON.stringify({version:2,project}));$('.local-state').textContent='Сохранено на компьютере';}catch{$('.local-state').textContent='Сохраните файл проекта';}}
function applyCabinetResult(c,result){if(!result.possible)throw Error(result.reason||'Техника и монтажные зазоры не помещаются в секции.');Object.assign(c,result.cabinet);if(result.clamped)toast(result.reason||'Размер ограничен конструкцией, техникой и монтажными зазорами.');return true;}
function change(fn){
 const original=project,before=clone(project),selection={cabinetId,sectionId,roomFocus,selectedWindowId,selectedLightId,interiorParentId};let clamped=false;
 try{
  if(fn()===false)throw Error('Размер не помещается. Уменьшите его или измените общий габарит шкафа.');
  syncMezzanines(project);checkImport(project);
  if(project===original){
   for(const prior of before.cabinets){const next=project.cabinets.find(c=>c.id===prior.id);if(!next)continue;const result=constrainCabinetEdit(prior,next,project,{baselineProject:before});if(!result.possible)throw Error(result.reason);Object.assign(next,result.cabinet);clamped||=result.clamped;}
   syncMezzanines(project);checkImport(project);
   for(const next of project.cabinets){const prior=before.cabinets.find(c=>c.id===next.id);if(prior?!canEditCabinetPlacement(prior,next,project,{baselineProject:before}):!canPlaceCabinet(next,project))throw Error('Размещение пересекает другой шкаф или нарушает границы помещения и монтажные отступы.');}
  }
 }catch(error){project=before;({cabinetId,sectionId,roomFocus,selectedWindowId,selectedLightId,interiorParentId}=selection);toast(`Изменение не сохранено: ${error.message}`);render();return false;}
 if(JSON.stringify(project)===JSON.stringify(before)){render();return true;}
 history.push(before);if(history.length>50)history.shift();future=[];calculate();render();if(clamped)toast('Размер ограничен конструкцией, техникой и монтажными зазорами.');return true;
}
function deleteOpening(id){return change(()=>{if(!project.room.windows.some(w=>w.id===id))return false;project.room.windows=project.room.windows.filter(w=>w.id!==id);selectedWindowId=null;roomEditor.selectedWindowId=null;roomFocus='wall';});}
function deleteLight(id){return change(()=>{if(!(project.room.lights||[]).some(l=>l.id===id))return false;project.room.lights=project.room.lights.filter(l=>l.id!==id);selectedLightId=null;if(roomEditor)roomEditor.selectedLightId=null;roomFocus='wall';});}
function addLight(){
 project.room.lights??=[];
 if(project.room.lights.length>=16){toast('В помещении уже 16 источников света');return;}
 const b=roomBounds(project.room);
 const idx=project.room.lights.length;
 const offset=((idx%4)-1.5)*350;
 const light={id:uid('light'),kind:'pendant',label:`Светильник ${idx+1}`,x:rounded(b.minX+b.width/2+offset),z:rounded(b.minZ+b.depth/2),y:Math.max(1800,(project.room.height||2700)-450),intensity:1.2,color:'#fff4dc',enabled:true};
 change(()=>{project.room.lights.push(light);selectedLightId=light.id;selectedWindowId=null;roomFocus='light';});
}
function deleteCabinet(id){return change(()=>{const index=project.cabinets.findIndex(c=>c.id===id);if(index<0)return false;const toDelete=new Set([id]);for(const c of project.cabinets)if(toDelete.has(c.parentId))toDelete.add(c.id);project.cabinets=project.cabinets.filter(c=>!toDelete.has(c.id));cabinetId=project.cabinets[Math.min(index,project.cabinets.length-1)]?.id??null;interiorParentId=null;sectionId=null;selectedWindowId=null;selectedLightId=null;roomFocus='wall';roomEditor.selectedCabinetId=null;roomEditor.hint='';});}
let cabinetClipboard=null;
function duplicateCabinetAction(sourceCab=selectedCabinet()){
 if(!sourceCab)return false;
 if(sourceCab.parentId){toast(translateText('Антресоль привязана к основному шкафу. Перемещайте основной шкаф.',interfaceLanguage));return false;}
 const ok=change(()=>{
  const result=duplicateCabinet(sourceCab,project);
  if(!result)return false;
  for(const cab of result.cabinets)project.cabinets.push(cab);
  cabinetId=result.copy.id;interiorParentId=null;sectionId=result.copy.layout?.id??null;
  syncMezzanines(project);
  toast(translateText('Шкаф продублирован',interfaceLanguage));
 });
 if(ok)closeModal();
 return ok;
}

let measureToolActive = false;

export function setMeasureTool(active, studioContext = null) {
  const next = Boolean(active);
  const re = studioContext?.roomEditor ?? (typeof roomEditor !== 'undefined' ? roomEditor : null);
  const rr = studioContext?.roomRenderer ?? (typeof roomRenderer !== 'undefined' ? roomRenderer : null);
  if (re && typeof re.setTool === 'function') {
    re.setTool(next ? 'measure' : 'select');
  }
  if (rr && typeof rr.setMeasureTool === 'function') {
    rr.setMeasureTool(next);
  }
  if (studioContext) {
    studioContext.measureToolActive = next;
  } else {
    measureToolActive = next;
  }
  if (typeof $ === 'function') {
    const btn = $('[data-action="toggle-measure"]') || $('[data-action="measure"]');
    if (btn) btn.classList.toggle('active', next);
  }
  return next;
}

export function getMeasureToolActive(studioContext = null) {
  if (studioContext && 'measureToolActive' in studioContext) return Boolean(studioContext.measureToolActive);
  return measureToolActive;
}

export function getDrcStatus(p = null) {
  const proj = p ?? (typeof project !== 'undefined' ? project : null);
  if (!proj) return { count: 0, errors: 0, warnings: 0, issues: [] };
  const issues = validateProject(proj);
  const errors = issues.filter(i => i.level === 'error').length;
  const warns = issues.filter(i => i.level === 'warning').length;
  return { count: issues.length, errors, warnings: warns, issues };
}

export function renderDrcStatusBadge(issuesOrCount, language = 'ru') {
  const issues = Array.isArray(issuesOrCount) ? issuesOrCount : null;
  const count = issues ? issues.length : Number(issuesOrCount || 0);
  const errors = issues ? issues.filter(i => i.level === 'error').length : 0;
  const level = errors ? 'error' : count ? 'warning' : 'ok';
  const label = errors
    ? `${errors} ${translateText('ошибок', language)}`
    : count
    ? `${count} ${translateText('замечаний', language)}`
    : translateText('DRC: норма', language);
  const title = count ? `${count} ${translateText('замечаний DRC', language)}` : translateText('Ошибок не обнаружено', language);
  return `<button class="drc-status-badge text-button ${level}" data-action="validation" data-action-drc="true" title="${esc(title)}"><span>${esc(label)}</span></button>`;
}

export function switchMode(newMode, studioContext = null) {
  if (!['cabinet', 'room', 'cutting', 'drawings'].includes(newMode)) return false;
  if (studioContext) {
    studioContext.mode = newMode;
    if (typeof studioContext.onModeChange === 'function') studioContext.onModeChange(newMode);
  } else {
    mode = newMode;
    if (typeof render === 'function') render();
  }
  return true;
}

export function switchRoomView(newView, studioContext = null) {
  if (!['plan', '3d', 'render'].includes(newView)) return false;
  if (studioContext) {
    studioContext.roomView = newView;
    if (typeof studioContext.onRoomViewChange === 'function') studioContext.onRoomViewChange(newView);
  } else {
    roomView = newView;
    if (typeof render === 'function') render();
  }
  return true;
}

export function switchCabinetView(newView, studioContext = null) {
  if (!['scheme', '3d', 'drawings'].includes(newView)) return false;
  if (studioContext) {
    studioContext.cabinetView = newView;
    if (typeof studioContext.onCabinetViewChange === 'function') studioContext.onCabinetViewChange(newView);
  } else {
    cabinetView = newView;
    if (typeof render === 'function') render();
  }
  return true;
}

function renderList(){$('#cabinet-count').textContent=project.cabinets.length;$('#cabinet-list').innerHTML=project.cabinets.map((c,i)=>`<button class="cabinet-list-item ${c.id===cabinetId?'active':''}" data-cabinet="${esc(c.id)}"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${esc(c.name)}</strong><small>${fmt(c.width)} × ${fmt(c.height)} × ${fmt(c.depth)}${c.parentId?' · '+translateText('антресоль',interfaceLanguage):''}</small></div></button>`).join('');}
function renderHud(){
 const hud=$('#render-hud');if(!hud)return;
 if(mode!=='room'||roomView!=='render'){hud.hidden=true;return;}
 hud.hidden=false;
 const c=selectedCabinet();
 const openPct=Math.round((roomRenderer.openProgress??(roomRenderer.doorsOpen?1:0))*100);
 const lm=roomRenderer.lightingMode||'day';
 const rt=roomRenderer.rayTracing!==false;
 hud.innerHTML=`<div class="render-hud-bar">
  <button type="button" class="hud-pill raytrace-pill ${rt?'active':''}" data-action="render-raytracing" title="${esc(translateText('Трассировка лучей и отражений',interfaceLanguage))}">✨ Ray Tracing ${rt?'ON':'OFF'}</button>
  <div class="hud-divider"></div>
  <div class="hud-group" role="group" aria-label="${esc(translateText('Освещение',interfaceLanguage))}">
   <button type="button" class="hud-pill ${lm==='day'?'active':''}" data-action="render-set-lighting" data-value="day">☀️ ${esc(translateText('День',interfaceLanguage))}</button>
   <button type="button" class="hud-pill ${lm==='evening'?'active':''}" data-action="render-set-lighting" data-value="evening">🌙 ${esc(translateText('Вечер',interfaceLanguage))}</button>
   <button type="button" class="hud-pill ${lm==='studio'?'active':''}" data-action="render-set-lighting" data-value="studio">💎 ${esc(translateText('Студия',interfaceLanguage))}</button>
   <button type="button" class="hud-pill ${lm==='night-led'?'active':''}" data-action="render-set-lighting" data-value="night-led">✨ ${esc(translateText('Ночь LED',interfaceLanguage))}</button>
  </div>
  <div class="hud-divider"></div>
  <div class="hud-group">
   <button type="button" class="hud-pill ${roomRenderer.doorsOpen?'active':''}" data-action="render-doors">${esc(translateText(roomRenderer.doorsOpen?'Закрыть фасады':'Открыть фасады',interfaceLanguage))}</button>
   <label class="hud-slider-wrap" title="${esc(translateText('Плавное открытие дверей и ящиков',interfaceLanguage))}">
    <input type="range" min="0" max="100" step="1" data-action="render-open-slider" id="render-open-slider" value="${openPct}">
    <span id="render-open-label">${openPct}%</span>
   </label>
  </div>
  ${c?`<div class="hud-divider"></div>
  <div class="hud-group hud-hw-group">
   <select class="hud-select" data-action="hud-handle-style" title="${esc(translateText('Вариант ручки',interfaceLanguage))}">
    ${Object.entries(HANDLE_STYLES).map(([id,h])=>`<option value="${id}" ${(c.handleStyle||'bar')===id?'selected':''}>${esc(translateText('Ручка',interfaceLanguage))}: ${esc(translateText(h.label,interfaceLanguage))}</option>`).join('')}
   </select>
   <div class="hud-swatches" title="${esc(translateText('Цвет фурнитуры',interfaceLanguage))}">
    ${Object.entries(HANDLE_FINISHES).map(([id,f])=>`<button type="button" class="hud-swatch ${(c.handleFinish||'chrome')===id?'active':''}" data-action="set-cabinet-hw" data-field="handleFinish" data-value="${id}" title="${esc(translateText(f.label,interfaceLanguage))}" style="background:${f.swatch||f.bar}"></button>`).join('')}
   </div>
  </div>`:''}
 </div>`;
}
function hardwareDesignCardMarkup(c,s=null){
 if(!c)return '';
 const curHandle=s?.node?.handleStyle||c.handleStyle||'bar';
 const curFinish=s?.node?.handleFinish||c.handleFinish||'chrome';
 const curHinge=s?.node?.hingeStyle||c.hingeStyle||'soft-close';
 const curRailing=s?.node?.drawerRailingStyle||c.drawerRailingStyle||'single-round';
 const curRod=s?.node?.rodStyle||c.rodStyle||'round';
 const handleIcons={bar:'━', 'slim-arch':'∏', bow:'⌒', knob:'●', gola:'▤', recessed:'▭', push:'⚡'};
 const body=`<div class="hardware-design-card">
  <div class="hw-section">
   <span class="eyebrow">${esc(translateText('ВАРИАНТ РУЧЕК ФАСАДОВ',interfaceLanguage))}</span>
   <div class="hw-pill-grid">
    ${Object.entries(HANDLE_STYLES).map(([id,h])=>`<button type="button" class="hw-style-pill ${curHandle===id?'active':''}" data-action="set-cabinet-hw" data-field="handleStyle" data-value="${id}"><span class="hw-pill-icon">${handleIcons[id]||'━'}</span><span>${esc(translateText(h.label,interfaceLanguage))}</span></button>`).join('')}
   </div>
  </div>
  <div class="hw-section">
   <span class="eyebrow">${esc(translateText('ЦВЕТ И ПОКРЫТИЕ РУЧЕК',interfaceLanguage))}</span>
   <div class="hw-finish-swatches">
    ${Object.entries(HANDLE_FINISHES).map(([id,f])=>`<button type="button" class="hw-finish-chip ${curFinish===id?'active':''}" data-action="set-cabinet-hw" data-field="handleFinish" data-value="${id}" title="${esc(translateText(f.label,interfaceLanguage))}"><i class="hw-finish-dot" style="background:${f.swatch||f.bar}"></i><span>${esc(translateText(f.label,interfaceLanguage))}</span></button>`).join('')}
   </div>
  </div>
  <div class="hw-section">
   <span class="eyebrow">${esc(translateText('ТИП МЕБЕЛЬНЫХ ПЕТЕЛЬ (3D)',interfaceLanguage))}</span>
   <div class="hw-pill-grid hw-two-col">
    ${Object.entries(HINGE_STYLES).map(([id,h])=>`<button type="button" class="hw-style-pill ${curHinge===id?'active':''}" data-action="set-cabinet-hw" data-field="hingeStyle" data-value="${id}"><span>🔩 ${esc(translateText(h.label,interfaceLanguage))}</span></button>`).join('')}
   </div>
  </div>
  <div class="hw-section">
   <span class="eyebrow">${esc(translateText('БОКОВИНЫ И РЕЙЛИНГИ ЯЩИКОВ (3D)',interfaceLanguage))}</span>
   <div class="hw-pill-grid hw-two-col">
    ${Object.entries(DRAWER_RAILING_STYLES).map(([id,r])=>`<button type="button" class="hw-style-pill ${curRailing===id?'active':''}" data-action="set-cabinet-hw" data-field="drawerRailingStyle" data-value="${id}"><span>轨 ${esc(translateText(r.label,interfaceLanguage))}</span></button>`).join('')}
   </div>
  </div>
  <div class="hw-section">
   <span class="eyebrow">${esc(translateText('ТИП ШТАНГ И ПАНТОГРАФОВ (3D)',interfaceLanguage))}</span>
   <div class="hw-pill-grid hw-two-col">
    ${Object.entries(ROD_STYLES).map(([id,r])=>`<button type="button" class="hw-style-pill ${curRod===id?'active':''}" data-action="set-cabinet-hw" data-field="rodStyle" data-value="${id}"><span>🧥 ${esc(translateText(r.label,interfaceLanguage))}</span></button>`).join('')}
   </div>
  </div>
  ${mode!=='room'||roomView!=='render'?`<button type="button" class="button primary full raytrace-cta-btn" data-action="open-raytrace-3d">✨ ${esc(translateText('Открыть 3D фото-рендер с трассировкой',interfaceLanguage))}</button>`:''}
 </div>`;
 return disclosure('hardware-design',translateText('✨ Фурнитура, ручки и 3D-дизайн',interfaceLanguage),body);
}
function render(){
 if(mode==='cabinet'&&cabinetView==='drawings')mode='drawings';
 viewport.language=interfaceLanguage;roomViewport.language=interfaceLanguage;
 if(!selectedCabinet())cabinetId=project.cabinets[0]?.id;
 const c=selectedCabinet();selectedSection();$('.project-name').textContent=project.name;renderList();
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode||(mode==='drawings'&&b.dataset.mode==='cabinet')));
 $('#cabinet-view-switch').hidden=!['cabinet','drawings'].includes(mode);$('#cabinet-3d-tools').hidden=mode!=='cabinet'||cabinetView!=='3d';document.querySelectorAll('[data-cabinet-view]').forEach(b=>b.classList.toggle('active',b.dataset.cabinetView===(mode==='drawings'?'drawings':cabinetView)));
 if(inspectionPartId&&!parts.some(part=>part.id===inspectionPartId&&part.cabinetId===cabinetId))inspectionPartId=null;
 $('[data-action="undo"]').disabled=!history.length;$('[data-action="redo"]').disabled=!future.length;
 $('#design-shell').hidden=mode!=='cabinet';$('#room-shell').hidden=mode!=='room';$('#drawings-shell').hidden=mode!=='drawings';$('#cutting-shell').hidden=mode!=='cutting';
 $('#stage-eyebrow').textContent={cabinet:'ВАША КОНСТРУКЦИЯ',room:'ПОМЕЩЕНИЕ ЛЮБОЙ ФОРМЫ',drawings:'РАЗМЕРЫ ДЛЯ ПРОИЗВОДСТВА',cutting:'ДЕТАЛИ И МАТЕРИАЛ'}[mode];
 $('#stage-title').textContent=['cabinet','drawings'].includes(mode)?(c?.name||'Новый шкаф'):{room:'Контур помещения',drawings:'Чертёж шкафа',cutting:'Карта раскроя'}[mode];
    $('#stage-actions').innerHTML=mode==='cabinet'&&c?`<button class="text-button" data-action="duplicate" title="${esc(translateText('Дублировать шкаф (Ctrl+D)',interfaceLanguage))}">${icon('copy')}${translateText('Дублировать',interfaceLanguage)}</button><button class="text-button" data-action="cabinet-options">${icon('settings')}Шкаф</button>`:mode==='room'?`<div class="view-switch"><button data-room-view="plan" class="${roomView==='plan'?'active':''}">План</button><button data-room-view="3d" class="${roomView==='3d'?'active':''}">3D</button><button data-room-view="render" class="${roomView==='render'?'active':''}">Рендер</button></div>${roomView==='3d'?`<button class="button" data-action="room-open-fronts">${roomViewport.options.doorsOpen?'Закрыть все фасады':'Открыть все фасады'}</button>`:''}${roomView==='render'?`<select class="render-preset-select" data-action="render-preset" title="${esc(translateText('Ракурс камеры',interfaceLanguage))}"><option value="front" ${roomRenderer.cameraPreset==='front'?'selected':''}>${esc(translateText('Спереди',interfaceLanguage))}</option><option value="door" ${roomRenderer.cameraPreset==='door'?'selected':''}>${esc(translateText('От двери',interfaceLanguage))}</option><option value="corner-1" ${roomRenderer.cameraPreset==='corner-1'?'selected':''}>${esc(translateText('Угол 1',interfaceLanguage))}</option><option value="corner-2" ${roomRenderer.cameraPreset==='corner-2'?'selected':''}>${esc(translateText('Угол 2',interfaceLanguage))}</option><option value="top" ${roomRenderer.cameraPreset==='top'?'selected':''}>${esc(translateText('Сверху',interfaceLanguage))}</option></select><select class="render-preset-select" data-action="render-quality" title="${esc(translateText('Качество рендера',interfaceLanguage))}">${Object.entries(RENDER_QUALITY).map(([k,q])=>`<option value="${k}" ${roomRenderer.quality===k?'selected':''}>${esc(translateText('Качество',interfaceLanguage))}: ${esc(translateText(q.label,interfaceLanguage))}</option>`).join('')}</select><select class="render-preset-select" data-action="render-floor-style" title="Покрытие пола">${Object.entries(FLOOR_STYLES).map(([k,f])=>`<option value="${k}" ${roomRenderer.floorStyle===k?'selected':''}>Пол: ${esc(translateText(f.label,interfaceLanguage))}</option>`).join('')}</select><button class="button ${roomRenderer.showCeiling?'active':''}" data-action="render-ceiling" title="${esc(translateText('Показывать потолок',interfaceLanguage))}">${esc(translateText('Потолок',interfaceLanguage))}</button><label class="render-color" title="${esc(translateText('Цвет стен',interfaceLanguage))}"><span>${esc(translateText('Стены',interfaceLanguage))}</span><input type="color" data-action="render-wall-color" value="${esc(project.room.wallColor||'#efede6')}"></label><label class="render-color" title="${esc(translateText('Цвет потолка',interfaceLanguage))}"><span>${esc(translateText('Потолок',interfaceLanguage))}</span><input type="color" data-action="render-ceiling-color" value="${esc(project.room.ceilingColor||'#f5f4f0')}"></label>${roomRenderer.lightingMode==='day'?`<label class="render-color" title="Азимут солнца"><span>☀ ${Math.round(roomRenderer.sunAzimuth??127)}°</span><input type="range" min="0" max="359" step="1" data-action="render-sun-azimuth" value="${Math.round(roomRenderer.sunAzimuth??127)}"></label><label class="render-color" title="Высота солнца"><span>↑ ${Math.round(roomRenderer.sunElevation??50)}°</span><input type="range" min="5" max="85" step="1" data-action="render-sun-elevation" value="${Math.round(roomRenderer.sunElevation??50)}"></label><button class="button${roomRenderer.wallShadows!==false?' active':''}" data-action="render-wall-shadows" title="Тени от стен">▦ ${esc(translateText('Тени от стен',interfaceLanguage))}</button>`:''}<button class="button" data-action="render-lighting" title="${esc(translateText('Освещение',interfaceLanguage))}">${roomRenderer.lightingMode==='day'?'☀️ '+esc(translateText('День',interfaceLanguage)):roomRenderer.lightingMode==='studio'?'💎 '+esc(translateText('Студия',interfaceLanguage)):roomRenderer.lightingMode==='night-led'?'✨ '+esc(translateText('Ночь LED',interfaceLanguage)):'🌙 '+esc(translateText('Вечер',interfaceLanguage))}</button><button class="button" data-action="render-doors">${roomRenderer.doorsOpen?'Закрыть фасады':'Открыть фасады'}</button><button class="button" data-action="render-walls" title="Срезать ближние стены или показать все стены">${roomRenderer.wallMode==='cutaway'?'Стены: Срез':'Стены: Все'}</button>${c?`<button class="button" data-action="render-focus-cabinet" title="Сфокусировать камеру на выбранном шкафе (F или двойной клик)">🎯 Фокус</button>`:''}<button class="button" data-action="render-reset" title="Сбросить камеру">${icon('reset')}Сброс камеры</button><button class="button" data-action="render-screenshot" title="Снимок рендера">${icon('camera')}Снимок</button>`:''}<button class="button" data-action="room-obj" title="Экспорт плана и шкафов в OBJ">${icon('download')}OBJ</button><button class="button" data-action="${roomView==='3d'?'room-3d-print':'room-plan-print'}" title="${roomView==='3d'?'Печать 3D-вида помещения':'Печать плана помещения'}">${icon('print')}Печать / PDF</button><button class="button" data-action="room-presentation" title="${esc(translateText('Буклет-презентация проекта для клиента',interfaceLanguage))}">${icon('print')}${translateText('Презентация',interfaceLanguage)}</button>`:mode==='drawings'?`<button class="button" data-action="drawing-svg">${icon('download')}SVG</button><button class="button primary" data-action="drawing-print">${icon('print')}Печать / PDF</button>`:mode==='cutting'?`<button class="button" data-action="factory">${icon('download')}Для фабрики</button><button class="button" data-action="cutting-print">${icon('print')}Печать</button>`:'';
 if(mode==='cabinet'&&c)$('#stage-actions').insertAdjacentHTML('beforeend',`<button class="icon-button" data-action="delete-cabinet" aria-label="Удалить шкаф" title="Удалить шкаф">${icon('trash')}</button>`);
 if(mode==='cutting')$('#stage-actions').insertAdjacentHTML('afterbegin','<button class="button" data-action="prices">Цены и смета</button>');
 if(mode==='cabinet'){
  $('#cabinet-editor').hidden=cabinetView!=='scheme';$('#cabinet-viewport').hidden=cabinetView!=='3d';$('#cabinet-3d-tools').hidden=cabinetView!=='3d';document.querySelectorAll('[data-cabinet-view]').forEach(b=>b.classList.toggle('active',b.dataset.cabinetView===cabinetView));
  $('#cabinet-tools').hidden=cabinetView!=='scheme'||!c;
  $('#cabinet-tools [data-action="delete-section"]').disabled=!c||editorLayout().sections.length<2;
  $('#cabinet-tools [data-action="extend-left"]').disabled=Boolean(interiorParentId);$('#cabinet-tools [data-action="extend-right"]').disabled=Boolean(interiorParentId);
  cabinetEditor.setProject(project,cabinetId,sectionId,warnings);cabinetEditor.setInteriorParent(interiorParentId);viewport.setProject(project,cabinetId);viewport.setView('3d');viewport.setOptions({room:false,dimensions:true,focusCabinet:true,selectedSectionId:viewport.options.exploded?null:sectionId||interiorParentId,selectedPartId:inspectionPartId});viewport.resize();
  $('[data-action="explode-parts"]').textContent=viewport.options.exploded?'Собрать детали':'Раздвинуть детали';$('[data-action="explode-parts"]').classList.toggle('active',Boolean(viewport.options.exploded));$('[data-action="open-fronts"]').disabled=Boolean(viewport.options.exploded);$('[data-action="open-internal"]').disabled=Boolean(viewport.options.exploded);
  $('[data-action="open-fronts"]').textContent=viewport.options.doorsOpen?'Закрыть фасады':'Открыть фасады';
  const openPct=Math.round((viewport.options.openProgress??(viewport.options.doorsOpen?1:0))*100);
  const cabSlider=$('#cabinet-open-slider'),cabLbl=$('#cabinet-open-label');
  if(cabSlider){cabSlider.value=String(openPct);cabSlider.disabled=Boolean(viewport.options.exploded);}
  if(cabLbl)cabLbl.textContent=`${translateText('Открытие',interfaceLanguage)}: ${openPct}%`;
  $('[data-action="open-internal"]').hidden=!c||!getInternalDrawerLayout(c,project).length;
  $('[data-action="open-internal"]').textContent=viewport.options.internalDrawersOpen?'Закрыть внутренние ящики':'Открыть внутренние ящики';
 }
 renderHud();
 if(mode==='room'){
  $('#room-editor').hidden=roomView!=='plan';
  $('#room-tools').hidden=roomView!=='plan';
  $('#room-viewport').hidden=roomView!=='3d';
  $('#room-render-viewport').hidden=roomView!=='render';
  if(roomView==='plan'){
   roomEditor.setProject(project,roomFocus==='cabinet'?cabinetId:null,warnings);
   if(roomFocus==='wall'&&roomEditor.selectedWall!==selectedWall)roomEditor.setSelectedWall(selectedWall);
   if(roomFocus==='window'&&selectedOpening())roomEditor.setSelectedWindow(selectedWindowId);
   if(roomFocus==='light'&&selectedLight())roomEditor.setSelectedLight(selectedLightId);
  }else if(roomView==='3d'){
   roomViewport.setProject(project,roomFocus==='cabinet'?cabinetId:null);
   roomViewport.setOptions({room:true,dimensions:false});
   roomViewport.resize();
  }else if(roomView==='render'){
   roomRenderer.setProject(project,roomFocus==='cabinet'?cabinetId:null);
   roomRenderer.resize();
  }
 }
 if(mode==='drawings')renderDrawings();if(mode==='cutting'){renderCutting();$('#cutting-shell').insertAdjacentHTML('afterbegin',`<div class="estimate-panel">${generateCostHTML(project,{language:interfaceLanguage})}${generateHardwareHTML(project,{language:interfaceLanguage})}</div>`);}renderProperties();
  const drcStatusHtml = renderDrcStatusBadge(warnings, interfaceLanguage);
  $('#stage-status').innerHTML=mode==='cabinet'?`<span>${c?`${editorLayout().sections.length} секций · `:''}${parts.filter(p=>!c||p.cabinetId===c.id).length} деталей</span><span>${viewport.options.exploded&&cabinetView==='3d'?'Клик — выбрать деталь · двойной клик — сверловка':'Глубина корпуса в мм · фасад добавляется снаружи'}</span>`:mode==='room'?(roomView==='render'?`<span>PBR WebGL-рендер · трассировка лучей, металл, керамика, текстуры и тени</span><span>ЛКМ — вращение · ПКМ — сдвиг · Двойной клик / F — фокус на шкаф · W,A,S,D — полёт</span>${drcStatusHtml}`:`<span>${getRoomOutline(project.room).length} стен · высота ${fmt(project.room.height)} мм</span><span>Тяните углы и мебель на плане</span>${drcStatusHtml}`):mode==='drawings'?'<span>Проёмы, фасады и детали имеют отдельные размеры</span>':`<span>${cutting.totalSheets} листов · ${fmt(cutting.utilization,1)}% заполнение</span><span>Пропил ${project.settings.kerf} мм</span>`;
 $('#footer-info').textContent=`${project.cabinets.length} шкафов · ${parts.length} деталей · миллиметры`;
 const errors=warnings.filter(w=>w.level==='error');$('#validation-button').innerHTML=`${icon(errors.length?'info':'check')}${errors.length?`${errors.length} ошибок`:warnings.length?`${warnings.length} замечаний`:'Геометрия проверена'}`;$('#validation-button').classList.toggle('error',!!errors.length);
}
function input(label,field,value,{min=0,max=20000,step=1,unit='мм',scope='cabinet',disabled=false}={}){return `<label class="field"><span>${label}</span><div class="input-with-unit"><input type="number" data-scope="${scope}" data-field="${field}" value="${rounded(value)}" min="${min}" max="${max}" step="${step}" ${disabled?'disabled':''}><small>${unit}</small></div></label>`;}
function materialSwatchStyle(m){
 if(!m)return 'background-color:#ccc;';
 const url=m.localTextureUrl||(m.decorCode?`./assets/textures/${m.decorCode}.jpg`:null)||m.textureUrl||m.previewUrl;
 const col=m.color||'#deddd9';
 if(url){
  return `background-color:${esc(col)};background-image:url('${esc(url)}');background-size:cover;background-position:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.15);`;
 }
 return `background-color:${esc(col)};box-shadow:inset 0 0 0 1px rgba(0,0,0,0.15);`;
}
function materialOptions(current){return project.materials.map(m=>`<option value="${esc(m.id)}" ${m.id===current?'selected':''}>${esc(m.name)} · ${m.thickness} мм</option>`).join('');}
function selectMaterial(label,field,current){
 const curMat=project.materials.find(m=>m.id===current)||project.materials[0];
 const swatch=materialSwatchStyle(curMat);
 return `<label class="field material-field"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><span>${label}</span><span class="material-swatch-badge" style="${swatch}" title="${esc(curMat?.name||'')}"></span></div><select data-scope="cabinet" data-field="${field}">${materialOptions(current)}</select></label>`;
}
function disclosure(key,label,body){return `<details class="property-details" data-detail="${key}" ${expanded.has(key)?'open':''}><summary>${label}</summary><div>${body}</div></details>`;}
function renderProperties(){
 const c=selectedCabinet(),s=selectedSection();let html='';
 if(mode==='cabinet'&&cabinetView==='3d'&&viewport.options.exploded&&c){$('#properties-content').innerHTML=partInspectorMarkup();return;}
 const relevantWarnings=(mode==='cabinet'&&c)?warnings.filter(w=>w.cabinetId===c.id):mode==='room'?warnings.filter(w=>!w.cabinetId||(c&&w.cabinetId===c.id)||w.type==='en1116-cooktop-sink'||w.type?.startsWith('appliance')||w.type?.startsWith('obstacle')): [];
 if(relevantWarnings.length){
  html+=`<div class="property-block warning-block" style="border:1px solid #f59e0b;background:rgba(245,158,11,.08);border-radius:8px;padding:12px;margin-bottom:12px;"><h3 style="display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:13px;color:#b45309;">${icon('info')} Внимание: нормы и предупреждения (${relevantWarnings.length})</h3><ul class="warning-list" style="margin:0;padding-left:18px;font-size:12px;display:flex;flex-direction:column;gap:6px;">${relevantWarnings.map(w=>{const gIdx=warnings.indexOf(w);return `<li class="${w.level}"><div style="display:flex;flex-direction:column;gap:4px;"><span>${esc(w.message)}</span>${w.fix?`<button type="button" class="button small primary" data-action="apply-quick-fix" data-fix-idx="${gIdx}" style="align-self:flex-start;padding:2px 8px;font-size:11px;">⚡ ${esc(w.fix.label||'Исправить')}</button>`:''}</div></li>`;}).join('')}</ul></div>`;
 }
 if(mode==='cabinet'&&c){
    const isMezzanine=Boolean(c.parentId),parentCab=isMezzanine?project.cabinets.find(p=>p.id===c.parentId):null;html=`<div class="property-block"><h2>Габариты шкафа</h2><div class="fields three">${input('Ширина','width',c.width,{min:100,max:6000,disabled:isMezzanine})}${input('Высота','height',c.height,{min:100,max:6000})}${input('Глубина','depth',c.depth,{min:100,max:3000,disabled:isMezzanine})}</div>${isMezzanine?`<p class="hint">${esc(translateText(parentCab?`Ширина и глубина привязаны к шкафу «${parentCab.name}».`:'Ширина и глубина антресоли привязаны к основному шкафу.',interfaceLanguage))}</p>`:''}<div class="fields">${input('Высота цоколя','plinth',c.plinth,{max:c.height-60,disabled:isMezzanine})}<label class="check-row compact-check"><input type="checkbox" data-scope="cabinet" data-field="includeBottom" ${c.includeBottom!==false?'checked':''}>Дно корпуса</label></div><label class="check-row"><input type="checkbox" data-scope="cabinet" data-field="includeBack" ${c.includeBack!==false?'checked':''}>Общий задник на весь шкаф</label><label class="check-row"><input type="checkbox" data-scope="cabinet" data-field="sidesToFloor" ${c.sidesToFloor===true?"checked":""} ${isMezzanine?'disabled':''}>Боковины до пола</label><label class="check-row"><input type="checkbox" data-scope="cabinet" data-field="countertop" ${c.countertop?'checked':''}>Единая столешница (кухня)</label><p class="hint">Боковины опираются на пол. Дно остаётся над цоколем; спереди — цокольная планка.</p></div>`;
     const isCorner=c.cornerType==='blind'||String(c.type).startsWith('corner');
     const blindSide=c.blindSide==='left'?'left':'right';
     const defaultBlindW=c.type==='corner-wall'?340:600;
     const rawBlindW=Math.max(100,Math.min(c.width-200,Number(c.blindWidth)||defaultBlindW));
     const cleanDoorW=Math.max(0,Math.round(c.width-rawBlindW));
     if(isCorner){
       html+=`<div class="property-block corner-settings"><h2>Настройки углового модуля</h2><div class="fields"><label class="field"><span>Сторона глухого угла</span><select data-scope="cabinet" data-field="blindSide"><option value="right" ${blindSide==='right'?'selected':''}>Справа</option><option value="left" ${blindSide==='left'?'selected':''}>Слева</option></select></label>${input('Ширина глухой планки','blindWidth',rawBlindW,{min:100,max:c.width-200})}</div><button class="button full" data-action="flip-corner-side">Зеркально сменить сторону угла (${blindSide==='right'?'Справа ➔ Слева':'Слева ➔ Справа'})</button><p class="hint">Чистый проём двери: <strong>${fmt(cleanDoorW)} мм</strong>. К глухой стороне под прямым углом примыкает соседний модуль.</p></div>`;
     }
  if(!c.layout)html+=`<div class="property-block"><button class="button primary full" data-action="edit-sections">Редактировать секции</button><p class="hint">Сохранённый шкаф пока имеет прежнюю конструкцию. Между областями будут добавлены перегородки.</p></div>`;
  if(s){const node=s.node,inside=Boolean(interiorParentId);
   const geom=editorLayout(),fronts=(inside?getInternalDrawerLayout(c,project).filter(f=>f.interiorSectionId===s.id):getFrontLayout(c,project).filter(f=>f.sectionId===s.id));
   const drawerHardware=getInteriorDrawerHardwareOwner(c,project,s.id,{parentSectionId:interiorParentId});
   const index=geom.sections.findIndex(e=>e.id===s.id)+1;
   const cabFrontMat=project.materials.find(m=>m.id===c.frontMaterialId)||project.materials[0];
   const secFrontMat=node.frontMaterialId?project.materials.find(m=>m.id===node.frontMaterialId):null;
   const frontMatOptions=(current,defaultLabel)=>`<option value="" ${!current?'selected':''}>${defaultLabel}</option>`+project.materials.map(m=>`<option value="${esc(m.id)}" ${m.id===current?'selected':''}>${esc(m.name)} · ${m.thickness} мм</option>`).join('');
   html+=`<div class="property-block selected-section"><div class="section-title"><span class="eyebrow">ВЫБРАНО НА СХЕМЕ</span><h2><span>${inside?'Внутренний отсек':'Секция'}</span> ${index}</h2></div>${inside?`<button class="button full" data-action="return-doors">${icon('undo')}${layout().sections.find(s=>s.id===interiorParentId)?.node.front==='doors'?'Вернуться к дверям':'Вернуться к секции'}</button>`:''}<div class="fill-options">${(inside?[['drawers','drawer','Ящики внутри'],['open','open','Открыто']]:[['doors','door','Двери'],['drawers','drawer','Ящики'],['open','open','Открыто']]).map(([v,i,l])=>`<button class="${node.front===v?'active':''}" data-front="${v}">${icon(i)}${l}</button>`).join('')}</div>`;
   const curMount=node.frontMount||(c.frontMount==='inset'?'inset':'overlay');
   const mountMarkup=inside?'':`<div style="margin:8px 0"><span class="eyebrow" style="display:block;margin-bottom:4px">НАВЕСКА (ВНУТРЬ / НАРУЖУ)</span><div class="row" style="gap:6px"><button type="button" class="button full ${curMount==='overlay'?'primary':''}" data-action="set-front-mount" data-value="overlay">Наружу (накладные)</button><button type="button" class="button full ${curMount==='inset'?'primary':''}" data-action="set-front-mount" data-value="inset">Внутрь (вкладные)</button></div></div>`;
   if(node.front==='doors'){
     html+=mountMarkup;
     html+=`<label class="field"><span>Материал фасадов секции</span><select data-scope="section" data-field="frontMaterialId">${frontMatOptions(node.frontMaterialId,`Как у шкафа (${esc(cabFrontMat?.name||'Основной')})`)}</select></label>`;
     if(isCorner){
       const doorFront=fronts.find(f=>f.kind==='door');
       const curDoorMat=node.doorMaterialIds?.[0]||'';
       const defName=secFrontMat?.name||cabFrontMat?.name||'Основной';
       html+=`<label class="field"><span>Материал распашной двери</span><select data-scope="section" data-field="door-material-0">${frontMatOptions(curDoorMat,`Как у секции (${esc(defName)})`)}</select></label>`;
       const curOpening=doorFront?.opening??c.doorOpening??(blindSide==='left'?'right':'left');
       html+=`<p class="hint">Фасад угловой секции: <strong>1 глухая планка + 1 распашная дверь</strong>.</p>`;
       html+=disclosure('door-hardware','Фурнитура двери',`${input('Петель на дверь','hingesPerDoor',node.hingesPerDoor??defaultHingesPerDoor(doorFront?.height??s.height),{min:2,max:12,unit:'шт.',scope:'section'})}<button class="text-button" data-action="auto-hinges">Рассчитать по высоте</button><p class="hint">Количество петель по высоте — предварительная оценка. Уточните его по массе двери и выбранной фурнитуре.</p>`);
       html+=`<div style="margin:8px 0"><span class="eyebrow" style="display:block;margin-bottom:4px">ОТКРЫВАНИЕ ДВЕРИ (ЛЕВО / ПРАВО)</span><div class="row" style="gap:6px"><button type="button" class="button full ${curOpening==='left'?'primary':''}" data-action="set-door-opening" data-value="left">← Влево</button><button type="button" class="button full ${curOpening==='right'?'primary':''}" data-action="set-door-opening" data-value="right">Вправо →</button><button type="button" class="button full ${curOpening==='up'?'primary':''}" data-action="set-door-opening" data-value="up">↑ Вверх</button></div></div>`;
       html+=`<div class="fields"><label class="field"><span>Открывание двери</span><select data-scope="cabinet" data-field="doorOpening"><option value="left" ${curOpening==='left'?'selected':''}>Влево</option><option value="right" ${curOpening==='right'?'selected':''}>Вправо</option><option value="up" ${curOpening==='up'?'selected':''}>Вверх</option></select></label></div>`;
     }else{
      const doorCount=Math.max(1,node.doors||2);
      html+=input('Дверей в секции','doors',node.doors||2,{min:1,max:8,unit:'шт.',scope:'section'});
      if(doorCount>1){
        const defName=secFrontMat?.name||cabFrontMat?.name||'Основной';
        html+=disclosure('door-materials','Материалы отдельных дверей',fronts.filter(f=>f.kind==='door').map(f=>{
          const curMat=node.doorMaterialIds?.[f.index]||'';
          return `<label class="field"><span>Дверь ${f.index+1}</span><select data-scope="section" data-field="door-material-${f.index}">${frontMatOptions(curMat,`Как у секции (${esc(defName)})`)}</select></label>`;
        }).join(''));
      }
      html+=disclosure('door-hardware','Фурнитура дверей',`${input('Петель на дверь','hingesPerDoor',node.hingesPerDoor??defaultHingesPerDoor(fronts.find(f=>f.kind==='door')?.height??s.height),{min:2,max:12,unit:'шт.',scope:'section'})}<button class="text-button" data-action="auto-hinges">Рассчитать по высоте</button><p class="hint">Количество петель по высоте — предварительная оценка. Уточните его по массе двери и выбранной фурнитуре.</p>`);
      if(doorCount===1){
        const curOpening=fronts.find(f=>f.kind==='door')?.opening??node.doorOpening??'left';
        html+=`<div style="margin:8px 0"><span class="eyebrow" style="display:block;margin-bottom:4px">ОТКРЫВАНИЕ ДВЕРИ (ЛЕВО / ПРАВО)</span><div class="row" style="gap:6px"><button type="button" class="button full ${curOpening==='left'?'primary':''}" data-action="set-door-opening" data-value="left">← Влево</button><button type="button" class="button full ${curOpening==='right'?'primary':''}" data-action="set-door-opening" data-value="right">Вправо →</button><button type="button" class="button full ${curOpening==='up'?'primary':''}" data-action="set-door-opening" data-value="up">↑ Вверх</button></div></div>`;
        html+=`<div class="fields"><label class="field"><span>Открывание двери</span><select data-scope="section" data-field="door-opening-0"><option value="left" ${curOpening==='left'?'selected':''}>Влево</option><option value="right" ${curOpening==='right'?'selected':''}>Вправо</option><option value="up" ${curOpening==='up'?'selected':''}>Вверх</option></select></label></div>`;
      }else{
        html+=`<button type="button" class="button full" data-action="flip-doors-opening" style="margin:8px 0">Поменять открывание (лево ⇄ право)</button>`;
        html+=`<div class="fields">${fronts.filter(f=>f.kind==='door').map(f=>{
          const op=f.opening??(f.index%2?'right':'left');
          return `<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span class="eyebrow">ДВЕРЬ ${f.index+1}</span><small style="color:var(--muted,#64748b)">${op==='left'?'Петли слева':op==='right'?'Петли справа':'Петли сверху'}</small></div><div class="row" style="gap:4px"><button type="button" class="button full ${op==='left'?'primary':''}" data-action="set-door-index-opening" data-index="${f.index}" data-value="left">← Влево</button><button type="button" class="button full ${op==='right'?'primary':''}" data-action="set-door-index-opening" data-index="${f.index}" data-value="right">Вправо →</button><button type="button" class="button full ${op==='up'?'primary':''}" data-action="set-door-index-opening" data-index="${f.index}" data-value="up">↑ Вверх</button></div></div>`;
        }).join('')}</div>`;
      }
     }
    if(!node.interiorLayout)html+=input('Внутренние ящики за дверками','internalDrawerCount',node.internalDrawerCount||0,{min:0,max:12,unit:'шт.',scope:'section'});
    html+='<button class="button full" data-action="edit-interior">Внутреннее наполнение</button><p class="hint">Одни двери закрывают все внутренние отсеки. Полки и ящики настраиваются внутри.</p>';
   }
   if(node.front==='drawers'){
     html+=mountMarkup;
     html+=`<label class="field"><span>Материал фасадов ящиков</span><select data-scope="section" data-field="frontMaterialId">${frontMatOptions(node.frontMaterialId,`Как у шкафа (${esc(cabFrontMat?.name||'Основной')})`)}</select></label>`;
     html+=input('Ящиков в секции','drawers',node.drawers||2,{min:1,max:12,unit:'шт.',scope:'section'});
     if(fronts.length>1){
       const defName=secFrontMat?.name||cabFrontMat?.name||'Основной';
       html+=disclosure('drawer-materials','Материалы отдельных ящиков',fronts.map((f,i)=>{
         const curMat=node.drawerMaterialIds?.[i]||'';
         return `<label class="field"><span>Фасад ящика ${i+1}</span><select data-scope="section" data-field="drawer-material-${i}">${frontMatOptions(curMat,`Как у секции (${esc(defName)})`)}</select></label>`;
       }).join(''));
     }
   }
   if(!inside&&node.front==='open'&&(node.interiorLayout||node.internalDrawerCount>0))html+=`${!node.interiorLayout?input('Ящики внутри','internalDrawerCount',node.internalDrawerCount,{min:0,max:12,unit:'шт.',scope:'section'}):''}<button class="button full" data-action="edit-interior">Внутреннее наполнение</button><p class="hint">Снятие дверей сохраняет внутреннее наполнение.</p>`;
   if(drawerHardware&&(inside?node.front==='drawers':node.internalDrawerCount>0||node.interiorLayout))html+=input('Отступ под петли / сторона','internalDrawerHingeGap',drawerHardware.hingeGap,{max:200,scope:'interior-hardware'})+'<p class="hint">Общий отступ для ящиков за этими дверями. Применяется у левой и правой стенок; внутренние перегородки этот отступ не получают. Размер уточните по выбранным петлям.</p>';
   if(node.front!=='drawers'&&!node.interiorLayout)html+=input(inside?'Полки внутри отсека':'Полки внутри','shelves',node.shelves||0,{max:20,unit:'шт.',scope:'section',disabled:node.internalDrawerCount>0});
   if(node.front==='open'&&!node.interiorLayout)html+=`<label class="check-row"><input type="checkbox" data-scope="section" data-field="pullOutShelf" ${node.pullOutShelf?'checked':''}>Выдвижная полка</label>`;
   if(node.rods?.length||node.front!=='drawers'&&!node.appliance&&!node.interiorLayout&&!node.internalDrawerCount)html+=disclosure('section-rods','Штанги для одежды',sectionRodsMarkup(c,s));
   if(node.front!=='open'||node.pullOutShelf)html+=`<label class="field"><span>Тип открытия</span><select data-scope="section" data-field="openingMechanism"><option value="handle" ${node.openingMechanism!=='push'?'selected':''}>Ручка</option><option value="push" ${node.openingMechanism==='push'?'selected':''}>Push-to-open</option></select></label>`;
   html+=`<div class="fields">${input('Ширина проёма','section-width',s.width,{min:1,max:6000,scope:'section'})}${input('Высота проёма','section-height',s.height,{min:1,max:6000,scope:'section'})}</div>`;
   const mounting=getSectionMountingAxes(c,project).find(axis=>axis.id===s.id);
   if(mounting?.height!==null&&mounting?.height!==undefined)html+=input('Между осями крепления','mounting-height',mounting.height,{min:1,max:6000,scope:'section'})+'<p class="hint">Оси винтов проходят по центру толщины горизонтальных плит. Это расстояние между осями, а не высота проёма.</p>';
   else if(mounting?.bottom===null)html+='<p class="hint">Снизу нет плиты — нижней оси крепления нет.</p>';
   const atFloor=!inside&&(s.floorEligible??(node.floor==='open'||Math.abs(s.y-(c.includeBottom===false?0:geom.thickness))<.1));
   if(atFloor){const plinth=s.effectivePlinth??(node.floor==='open'?0:node.plinthHeight??c.plinth);html+=`<label class="check-row floor-check"><input type="checkbox" data-scope="section" data-field="floor-open" ${node.floor==='open'?'checked':''}>Открытый проём до пола</label><p class="hint">Без дна и цоколя под этой секцией. Соседние секции сохраняют свою конструкцию.</p><label class="check-row"><input type="checkbox" data-scope="section" data-field="section-plinth" ${plinth>0?'checked':''} ${node.floor==='open'?'disabled':''}>Цоколь в этой секции</label>${node.floor!=='open'&&plinth>0?input('Высота цоколя секции','plinthHeight',plinth,{max:c.height-60,scope:'section'}):''}`;}
   const backValue=['solid','panel'].includes(node.back)?'solid':node.back==='braces'?'braces':'none';
   if(atFloor&&s.effectivePlinth>0)html+='<p class="hint">Секция с цоколем всегда имеет собственное дно.</p>';
   if(inside)html+=input('Глубина секции','depth',s.depth,{min:1,max:3000,scope:'section'});
    else {
      const hasCooktop = Boolean(node.cooktop);
      const hasSink = Boolean(node.sink);
      const hasAppliance = Boolean(node.appliance);
      const isCombined = hasCooktop && node.appliance?.type === 'oven';
      let applianceBadge = '';
      if (hasCooktop) applianceBadge += `<div class="appliance-status-pill" style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:11px;font-weight:600;margin-bottom:6px;"><span>🔥 Варочная панель: ${node.cooktop.width||590} × ${node.cooktop.depth||520} мм</span></div>`;
      if (hasSink) applianceBadge += `<div class="appliance-status-pill" style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;background:#f0f9ff;border:1px solid #bae6fd;color:#0369a1;font-size:11px;font-weight:600;margin-bottom:6px;"><span>💧 Мойка: ${node.sink.shape==='round'||node.sink.sinkShape==='round' ? `Ø${node.sink.diameter||node.sink.width||510}` : `${node.sink.width||780} × ${node.sink.depth||500}`} мм</span></div>`;
      if (hasAppliance) {
        const symbol = node.appliance.type?.includes('fridge') ? '❄️' : node.appliance.type === 'oven' ? '♨️' : node.appliance.type === 'microwave' ? '📻' : node.appliance.type === 'hood-builtin' ? '💨' : '⚙️';
        applianceBadge += `<div class="appliance-status-pill" style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;background:#fdf4ff;border:1px solid #f0abfc;color:#86198f;font-size:11px;font-weight:600;margin-bottom:6px;"><span>${symbol} ${esc(node.appliance.label)} (${node.appliance.width} × ${node.appliance.height} × ${node.appliance.depth} мм)</span></div>`;
      }
      const cooktopMarkup = hasCooktop
        ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border,#e2e8f0)"><span class="eyebrow">ВАРОЧНАЯ ПАНЕЛЬ НА СТОЛЕШНИЦЕ</span><p class="hint">${esc(node.cooktop.label||'Варочная панель')} · ${node.cooktop.width||590} × ${node.cooktop.depth||520} мм</p><button class="button danger full" data-action="remove-section-cooktop">${icon('trash')}Убрать варочную панель</button></div>`
        : cabinetMountKind(c)!=='base'?'':`<button class="button full" data-action="add-section-cooktop">${icon('plus')}Варочная панель на столешнице</button>`;
      const sinkMarkup = hasSink
        ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border,#e2e8f0)"><span class="eyebrow">РАКОВИНА НА СТОЛЕШНИЦЕ</span><p class="hint">${esc(node.sink.label||'Раковина')} · ${node.sink.shape==='round'||node.sink.sinkShape==='round' ? `Ø${node.sink.diameter||node.sink.width||510}` : `${node.sink.width||780} × ${node.sink.depth||500}`} мм</p><div class="row" style="gap:6px"><button class="button full" data-action="edit-section-sink">${icon('settings')}Настроить раковину</button><button class="button danger full" data-action="remove-section-sink">${icon('trash')}Убрать</button></div></div>`
        : cabinetMountKind(c)!=='base'?'':`<button class="button full" data-action="add-section-sink">${icon('plus')}Раковина на столешнице</button>`;
      const applianceMarkup = `<button class="button full" data-action="appliance">${hasAppliance?'Изменить технику в нише':'Ниша для встроенной техники'}</button>${hasAppliance?`<p class="hint">${esc(node.appliance.label)} · ${node.appliance.width} × ${node.appliance.height} × ${node.appliance.depth} мм</p><button class="button danger full" data-action="remove-appliance">${icon('trash')}Убрать технику из секции</button>`:''}`;
      const combinedMarkup = isCombined ? `<p class="hint" style="color:#059669;font-weight:600">⚡ Совмещение: варочная панель + духовой шкаф (учтён зазор 30 мм для вентиляции).</p>` : '';
      html+=disclosure('section-options','Глубина, задник и техника',`${applianceBadge}${input('Глубина секции','depth',s.depth,{min:1,max:3000,scope:'section'})}<label class="field"><span>Сзади секции</span><select data-scope="section" data-field="back" ${c.includeBack!==false?'disabled':''}>${c.includeBack!==false?'<option value="inherit">Общий задник на весь шкаф</option>':[['none','Без задней стенки'],['solid','Отдельная панель'],['braces','Поперечины секции']].map(([value,label])=>`<option value="${value}" ${backValue===value?'selected':''}>${label}</option>`).join('')}</select></label>${c.includeBack!==false?'<p class="hint">Выключите общий задник, чтобы настроить заднюю стенку или поперечины секции.</p>':backValue==='braces'?sectionBracesMarkup(c,s):''}${cooktopMarkup}${sinkMarkup}${applianceMarkup}${combinedMarkup}`);
    }
   if(!inside&&node.front==='drawers'&&fronts.length>1)html+=disclosure('drawer-heights','Высоты отдельных фасадов',fronts.map((f,i)=>input(`Фасад ${i+1}`,'drawer-height-'+i,f.height,{min:60,max:s.frontHeight,scope:'section'})).join(''));
   html+='</div>';
  }
  html+=hardwareDesignCardMarkup(c,s);
  let cabMultiFronts='';
  if(!c.layout){
    const cabDefMat=project.materials.find(m=>m.id===(c.frontMaterialId||c.materialId))||project.materials[0];
    const cabFrontOpts=(cur)=>`<option value="" ${!cur?'selected':''}>Как у шкафа (${esc(cabDefMat?.name||'Основной')})</option>`+project.materials.map(m=>`<option value="${esc(m.id)}" ${m.id===cur?'selected':''}>${esc(m.name)} · ${m.thickness} мм</option>`).join('');
    if((c.doors||0)>1){
      cabMultiFronts+=disclosure('cabinet-door-materials','Материалы отдельных дверей',Array.from({length:c.doors},(_,i)=>{
        const cur=c.doorMaterialIds?.[i]||'';
        return `<label class="field"><span>Дверь ${i+1}</span><select data-scope="cabinet" data-field="door-material-${i}">${cabFrontOpts(cur)}</select></label>`;
      }).join(''));
    }
    if((c.drawers||0)>1){
      cabMultiFronts+=disclosure('cabinet-drawer-materials','Материалы отдельных ящиков',Array.from({length:c.drawers},(_,i)=>{
        const cur=c.drawerMaterialIds?.[i]||'';
        return `<label class="field"><span>Фасад ящика ${i+1}</span><select data-scope="cabinet" data-field="drawer-material-${i}">${cabFrontOpts(cur)}</select></label>`;
      }).join(''));
    }
  }
  html+=disclosure('cabinet-materials','Материалы и отделка',`${selectMaterial('Корпус','materialId',c.materialId)}${selectMaterial('Фасады','frontMaterialId',c.frontMaterialId)}${selectMaterial('Короб ящика','drawerMaterialId',c.drawerMaterialId)}${selectMaterial('Дно ящика','drawerBottomMaterialId',c.drawerBottomMaterialId)}${selectMaterial('Задник','backMaterialId',c.backMaterialId)}${cabMultiFronts}<p class="hint">МДФ-задник крепится винтами. ДВП 3 мм — гвоздями без сверловки.</p><button class="text-button" data-action="materials">Изменить цвет или добавить материал</button>`);
  if(c.rearBraces?.length)html+=disclosure('rear-braces','Задние поперечины',`${c.rearBraces.map((b,i)=>`<div class="brace-row"><div class="row"><strong>Поперечина ${i+1}</strong><button class="icon-button" data-delete-brace="${esc(b.id)}" aria-label="Удалить поперечину ${i+1}">${icon('trash')}</button></div><div class="fields">${braceInput(b,'y','От низа шкафа')}${braceInput(b,'height','Высота планки')}</div><label class="field"><span>Материал</span><select data-brace="${esc(b.id)}" data-field="materialId">${materialOptions(b.materialId||c.materialId)}</select></label></div>`).join('')}`);
    const cutoutInputs = !c.cutout ? '' : c.cutout.corner === 'both' ? `
<div class="fields">${input('Ширина выреза слева','cutout-leftWidth',c.cutout.leftWidth??c.cutout.width,{min:10,max:c.width-60,disabled:isMezzanine})}${input('Глубина выреза слева','cutout-leftDepth',c.cutout.leftDepth??c.cutout.depth,{min:10,max:c.depth-60,disabled:isMezzanine})}</div>
<div class="fields">${input('Ширина выреза справа','cutout-rightWidth',c.cutout.rightWidth??c.cutout.width,{min:10,max:c.width-60,disabled:isMezzanine})}${input('Глубина выреза справа','cutout-rightDepth',c.cutout.rightDepth??c.cutout.depth,{min:10,max:c.depth-60,disabled:isMezzanine})}</div>
<p class="hint">${isMezzanine?'Вырезы привязаны к основному шкафу.':'Вырезы проходят на всю высоту. Контуры плит передаются в деталировку.'}</p>`
: `<div class="fields">${input('Ширина выреза','cutout-width',c.cutout.width,{min:10,max:c.width-60,disabled:isMezzanine})}${input('Глубина выреза','cutout-depth',c.cutout.depth,{min:10,max:c.depth-60,disabled:isMezzanine})}</div><p class="hint">${isMezzanine?'Вырез привязан к основному шкафу.':'Вырез проходит на всю высоту. Контуры плит передаются в деталировку.'}</p>`;
    html+=disclosure('cabinet-shape','Форма и монтаж',`<label class="field"><span>Форма корпуса</span><select data-scope="cabinet" data-field="cutout-corner" ${isMezzanine?'disabled':''}><option value="none" ${!c.cutout?'selected':''}>Прямой</option><option value="back-left" ${c.cutout?.corner==='back-left'?'selected':''}>Вырез сзади слева</option><option value="back-right" ${c.cutout?.corner==='back-right'?'selected':''}>Вырез сзади справа</option><option value="both" ${c.cutout?.corner==='both'?'selected':''}>Вырезы с двух сторон</option></select></label>${cutoutInputs}<label class="field"><span>Навеска фасадов шкафа</span><select data-scope="cabinet" data-field="frontMount"><option value="overlay" ${c.frontMount!=='inset'?'selected':''}>Наружу (накладные)</option><option value="inset" ${c.frontMount==='inset'?'selected':''}>Внутрь (вкладные)</option></select></label>${input('Зазор фасадов','gap',c.gap,{max:10,step:.1})}${input('Кромка','edgeBand',c.edgeBand,{max:3,step:.1})}${input('Зазор направляющей / сторона','drawerSlideGap',c.drawerSlideGap,{max:40,step:.1})}`);
 }else if(mode==='room'){
  const outline=getRoomOutline(project.room);selectedWall=Math.min(selectedWall,outline.length-1);
  const w=selectedOpening();if(roomFocus==='window'&&!w)roomFocus='wall';
  const l=selectedLight();if(roomFocus==='light'&&!l)roomFocus='wall';
  html=`<div class="property-block"><h2>Помещение</h2>${input('Высота потолка','height',project.room.height,{min:500,max:10000,scope:'room'})}${disclosure('installation-clearance','Посадочные допуски',`${input('От стен','installation-walls',project.room.installationClearance?.walls??0,{min:0,max:1000,scope:'room'})}${input('До потолка','installation-ceiling',project.room.installationClearance?.ceiling??0,{min:0,max:1000,scope:'room'})}<p class="hint">Запас для монтажа шкафа. Перемещение на плане учитывает стены и эти отступы.</p>`)}</div>`;
  if(roomFocus==='light'&&l){
   const kind=l.kind||'pendant';
   const roomH=project.room.height||2700;
   const lY=Number.isFinite(l.y)?l.y:(kind==='spot'?roomH:kind==='floor'?1650:Math.max(1800,roomH-450));
   html+=`<div class="property-block light-block"><span class="eyebrow">ВЫБРАН ИСТОЧНИК СВЕТА · 3D</span><div class="row"><h2>💡 ${esc(l.label||'Светильник')}</h2><button class="icon-button" data-delete-light="${esc(l.id)}" aria-label="Удалить источник света">${icon('trash')}</button></div><label class="field"><span>Тип светильника</span><select data-scope="light" data-field="kind"><option value="pendant" ${kind==='pendant'?'selected':''}>Подвесной светильник (люстра)</option><option value="spot" ${kind==='spot'?'selected':''}>Потолочный спот</option><option value="sconce" ${kind==='sconce'?'selected':''}>Настенное бра</option><option value="floor" ${kind==='floor'?'selected':''}>Торшер (напольный)</option></select></label><div class="fields">${input('По горизонтали X','x',l.x,{min:-20000,max:20000,scope:'light'})}${input('В глубину Z','z',l.z,{min:-20000,max:20000,scope:'light'})}</div><div class="fields">${input('Высота Y от пола','y',lY,{min:200,max:10000,scope:'light'})}${input('Яркость света','intensity',l.intensity??1.2,{min:0.1,max:3,step:0.1,unit:'×',scope:'light'})}</div><label class="field"><span>Оттенок свечения</span><input type="color" data-scope="light" data-field="color" value="${esc(l.color||'#fff4dc')}" style="height:34px;padding:2px;cursor:pointer;"></label><p class="hint">Перетаскивайте светильник мышью на плане помещения. Источники света улучшают 3D-рендер и не отображаются на рабочих чертежах.</p></div>`;
  }else if(roomFocus==='window'&&w&&isObstacle(w)){html+=obstaclePanel(w);
   }else if(roomFocus==='window'&&w){const wall=w.wallIndex??legacyWall(w.wall),length=wallLength(project.room,wall),door=w.kind==='door';
   const curSwing=w.swing||'inward',curHinge=w.hinge||'left';
   const doorControls=door?`<div style="margin:10px 0"><span class="eyebrow" style="display:block;margin-bottom:4px">ОТКРЫВАНИЕ ДВЕРИ (ВНУТРЬ / НАРУЖУ)</span><div class="row" style="gap:6px"><button type="button" class="button full ${curSwing==='inward'?'primary':''}" data-action="set-room-door-swing" data-value="inward">Внутрь комнаты</button><button type="button" class="button full ${curSwing==='outward'?'primary':''}" data-action="set-room-door-swing" data-value="outward">Наружу</button></div></div><div style="margin:10px 0"><span class="eyebrow" style="display:block;margin-bottom:4px">ПЕТЛИ ДВЕРИ (ЛЕВО / ПРАВО)</span><div class="row" style="gap:6px"><button type="button" class="button full ${curHinge==='left'?'primary':''}" data-action="set-room-door-hinge" data-value="left">← Петли слева</button><button type="button" class="button full ${curHinge==='right'?'primary':''}" data-action="set-room-door-hinge" data-value="right">Петли справа →</button></div></div>`:'';
   html+=`<div class="property-block window-block"><span class="eyebrow">ВЫБРАНО НА ПЛАНЕ · СТЕНА ${wall+1}</span><div class="row"><h2>${door?'Дверной проём':'Окно'}</h2><button class="icon-button" data-delete-window="${esc(w.id)}" aria-label="Удалить ${door?'дверной проём':'окно'}">${icon('trash')}</button></div><div class="fields">${windowInput(w,'width','Ширина проёма')}${windowInput(w,'height','Высота проёма')}${!door?windowInput(w,'sill','Нижний край от пола'):''}</div>${doorControls}<div class="opening-distances"><div><small>До начала стены</small><strong>${fmt(w.offset,1)} мм</strong></div><div><small>До конца стены</small><strong>${fmt(length-w.offset-w.width,1)} мм</strong></div></div><p class="hint">Тяните выделенный проём вдоль стены. Расстояния на плане меняются сразу.</p>${disclosure('opening-position','Точное положение',windowInput(w,'offset','От начала стены'))}</div>`;
   }else if(roomFocus==='cabinet'&&c){
    const isMezzanine=Boolean(c.parentId);
    const isCorner=c.cornerType==='blind'||String(c.type).startsWith('corner');
    const blindSide=c.blindSide==='left'?'left':'right';
    const defaultBlindW=c.type==='corner-wall'?340:600;
    const rawBlindW=Math.max(100,Math.min(c.width-200,Number(c.blindWidth)||defaultBlindW));
    const cleanDoorW=Math.max(0,Math.round(c.width-rawBlindW));
    html+=`<div class="property-block"><span class="eyebrow">ВЫБРАН ШКАФ НА ПЛАНЕ${isMezzanine?' · '+translateText('АНТРЕСОЛЬ',interfaceLanguage):isCorner?' · '+translateText('УГЛОВОЙ МОДУЛЬ',interfaceLanguage):''}</span><h2 data-user-text>${esc(c.name)}</h2>${isMezzanine?`<p class="hint">${esc(translateText('Антресоль привязана к основному шкафу. Перемещайте основной шкаф.',interfaceLanguage))}</p>`:''}<div class="fields">${input('По горизонтали X','x',c.x,{min:-20000,max:20000,disabled:isMezzanine})}${input('В глубину Z','z',c.z,{min:-20000,max:20000,disabled:isMezzanine})}</div>${input('Низ шкафа от пола','y',c.y,{max:10000,disabled:isMezzanine})}${input('Поворот','rotation',c.rotation||0,{min:-180,max:180,step:.1,unit:'°',disabled:isMezzanine})}<button class="button full" data-action="rotate-cabinet" ${isMezzanine?'disabled':''}>Повернуть на 90°</button>${isCorner?`<button class="button full" data-action="flip-corner-side">Зеркально сменить сторону угла (${blindSide==='right'?'Справа ➔ Слева':'Слева ➔ Справа'})</button>`:''}${isMezzanine?'':obstacleCutoutMarkup(c)}<button class="button full" data-action="design-selected">Редактировать этот шкаф</button></div>${hardwareDesignCardMarkup(c,null)}`;
  }else if(roomFocus==='corner'&&roomEditor.getSelectedCorners().length>1){
   const count=roomEditor.getSelectedCorners().length;html+=`<div class="property-block"><span class="eyebrow">ВЫБРАНО НА ПЛАНЕ</span><h2>Углов выбрано: ${count}</h2><p class="hint">Удаление уберёт все выбранные углы одним действием. Контур должен оставаться корректным.</p><button class="button full" data-action="remove-corner">Удалить выбранные углы</button></div>`;
  }else if(roomFocus==='corner'&&Number.isInteger(roomEditor.selectedCorner)&&outline[roomEditor.selectedCorner]){
   const i=roomEditor.selectedCorner,p=outline[i];html+=`<div class="property-block"><span class="eyebrow">ВЫБРАН УГОЛ НА ПЛАНЕ</span><h2>Угол ${i+1}</h2><div class="fields">${input('X','x',p.x,{scope:'corner',min:-20000,max:20000})}${input('Z','z',p.z,{scope:'corner',min:-20000,max:20000})}</div><p class="hint">Тяните угол по горизонтали или вертикали. Alt позволяет двигать его свободно.</p><button class="button full" data-action="remove-corner">Убрать этот угол</button></div>`;
  }else{
   html+=`<div class="property-block"><span class="eyebrow">ВЫБРАНА СТЕНА НА ПЛАНЕ</span><h2>Стена ${selectedWall+1}</h2>${input('Длина стены','wall-length',wallLength(project.room,selectedWall),{min:100,max:20000,scope:'room'})}<p class="hint">Тяните стену, чтобы сдвинуть её целиком. Ниша и выступ добавляются на выбранной стене кнопками над планом.</p></div>`;
   const openings=project.room.windows.filter(w=>(w.wallIndex??legacyWall(w.wall))===selectedWall);
   if(openings.length)html+=`<div class="property-block"><h2>Проёмы этой стены</h2><div class="opening-list">${openings.map((w,i)=>`<button data-select-window="${esc(w.id)}">${w.kind==='door'?'Дверной проём':w.kind==='pipe'?'Труба':w.kind==='box'?'Короб':'Окно'} ${i+1}<small>${fmt(w.width)} × ${fmt(w.height)} мм</small></button>`).join('')}</div></div>`;
   const roomLights=project.room.lights||[];
   html+=`<div class="property-block"><h2>💡 Освещение 3D-сцены</h2>${roomLights.length?`<div class="opening-list" style="margin-bottom:8px">${roomLights.map((lt,i)=>`<button data-select-light="${esc(lt.id)}">${esc(lt.label||`Светильник ${i+1}`)}<small>${lt.kind==='spot'?'Спот':lt.kind==='sconce'?'Бра':lt.kind==='floor'?'Торшер':'Подвес'} · ${fmt(lt.x)}×${fmt(lt.z)} мм</small></button>`).join('')}</div>`:'<p class="hint">Добавьте светильники на план помещения для красивой подсветки мебели в 3D-рендере. На чертежи они не влияют.</p>'}<button class="button full" data-action="add-light">💡 Добавить светильник</button></div>`;
  }
 }else if(mode==='drawings'){
  const list=parts.filter(p=>p.cabinetId===cabinetId);
  const fronts=c?getFrontLayout(c,project):[],sections=c?getCabinetLayout(c,project).sections:[],mountingAxes=c?getSectionMountingAxes(c,project):[];
  html=`<div class="property-block"><h2>Фасады и проёмы</h2><div class="dimension-list">${fronts.map((f,i)=>`<div><strong>F${i+1} · ${f.kind==='door'?'Дверь':'Фасад ящика'}</strong><span>${fmt(f.width,1)} × ${fmt(f.height,1)} мм</span></div>`).join('')}${sections.map((s,i)=>{const axes=mountingAxes.find(a=>a.id===s.id);return `<div><strong>S${i+1} · Проём секции</strong><span>${fmt(s.width,1)} × ${fmt(s.height,1)} мм</span>${axes?.height!=null?`<small>Между осями крепления: ${fmt(axes.height,1)} мм</small>`:''}</div>`;}).join('')}</div></div><div class="property-block"><h2>Детали конструкции</h2><p class="hint">Нажмите на деталь, чтобы открыть её чертёж.</p><div class="drawing-parts">${list.map((p,i)=>`<button data-part="${esc(p.id)}"><span>${String(i+1).padStart(2,'0')}</span><div><strong data-i18n="off">${esc(translatePrintText(p.name,interfaceLanguage))}</strong><small>${fmt(p.width,1)} × ${fmt(p.height,1)} × ${p.thickness} мм${p.outline?' · с вырезом':''}</small></div></button>`).join('')}</div></div>`;
 }else if(mode==='cutting'){
  const rotationHint='Разрешает поворачивать детали на листе на 90°, чтобы уменьшить отходы. Детали с направлением текстуры не поворачиваются.';
  html=`<div class="property-block"><h2>Раскрой</h2>${input('Пропил','kerf',project.settings.kerf,{max:20,step:.1,scope:'settings'})}${input('Отступ от края листа','margin',project.settings.margin,{max:100,scope:'settings'})}<label class="check-row" title="${esc(rotationHint)}"><input type="checkbox" data-scope="settings" data-field="allowRotate" aria-describedby="cutting-rotation-hint" ${project.settings.allowRotate?'checked':''}>Поворот без текстуры</label><p class="hint" id="cutting-rotation-hint">${rotationHint}</p><p class="hint">В чертежах сборки указан готовый размер. В раскрое толщина кромки вычитается только с оклеиваемых сторон.</p><p class="hint">У обычных полок кромка только спереди. На скрытых стыках кромка не нужна.</p><p class="hint">Листы разделены по материалу и толщине. Фигурные детали размещаются по охватывающему прямоугольнику.</p><button class="button full" data-action="materials">Размеры листов и материалы</button></div>`;
 }else html='<div class="empty-properties">Добавьте шкаф, чтобы начать проектирование.</div>';
 if(mode==='drawings')html+=edgeSummaryMarkup(parts.filter(p=>p.cabinetId===cabinetId));
 if(mode==='drawings'||mode==='cutting'||mode==='room')html+=printOptions();
 $('#properties-content').innerHTML=html;updateRoomDeleteTool();
  if(mode==='room'&&roomFocus==='cabinet'&&c){
    const block=$('[data-action="design-selected"]').closest('.property-block');
    const isCorner=c.cornerType==='blind'||String(c.type).startsWith('corner');
    const blindSide=c.blindSide==='left'?'left':'right';
    const defaultBlindW=c.type==='corner-wall'?340:600;
    const rawBlindW=Math.max(100,Math.min(c.width-200,Number(c.blindWidth)||defaultBlindW));
    const cleanDoorW=Math.max(0,Math.round(c.width-rawBlindW));
    block.querySelector('h2').insertAdjacentHTML('afterend',`<div class="fields">${input('Ширина','width',c.width,{min:100,max:6000})}${input('Глубина','depth',c.depth,{min:100,max:3000})}</div>${isCorner?`<div class="fields"><label class="field"><span>Сторона глухого угла</span><select data-scope="cabinet" data-field="blindSide"><option value="right" ${blindSide==='right'?'selected':''}>Справа</option><option value="left" ${blindSide==='left'?'selected':''}>Слева</option></select></label>${input('Ширина глухой планки','blindWidth',rawBlindW,{min:100,max:c.width-200})}</div><p class="hint">Чистый проём двери: <strong>${fmt(cleanDoorW)} мм</strong>.</p>`:'<p class="hint">Тяните ручки на плане, чтобы изменить ширину и глубину.</p>'}`);
    block.insertAdjacentHTML('beforeend',`<button class="button full" data-action="duplicate">${icon('copy')}${translateText('Дублировать шкаф',interfaceLanguage)}</button><button class="button full cabinet-delete" data-action="delete-cabinet">${icon('trash')}Удалить шкаф</button>`);
  }
 if(mode==='drawings')for(const button of $('#properties-content').querySelectorAll('[data-part]')){const index=parts.findIndex(p=>p.id===button.dataset.part),part=parts[index];if(part){button.querySelector('span').textContent=productionPartCode(index);button.querySelector('small').textContent=`${fmt(part.width,3)} × ${fmt(part.height,3)} × ${part.thickness} мм${part.outline?' · с вырезом':''}`;button.querySelector('div').insertAdjacentHTML('beforeend',`<small data-i18n="off">${esc(translatePrintText('Кромка, м',interfaceLanguage))}: ${fmt(getPartEdgeBanding(part).lengthMeters,3)}</small>`);}}
 const nextContext=`${mode}:${cabinetId}:${mode==='cabinet'?sectionId:mode==='room'?`${roomFocus}:${selectedWindowId}:${selectedLightId}:${roomEditor.selectedCorner??selectedWall}`:''}`;if(propertyContext!==nextContext){$('.properties').scrollTop=0;propertyContext=nextContext;}
}
function legacyWall(w){return{back:0,right:1,front:2,left:3}[w]??0;}
function obstacleInput(w,field,label,{min=0,max=20000}={}){return `<label class="field"><span>${label}</span><div class="input-with-unit"><input type="number" data-window="${esc(w.id)}" data-field="${field}" value="${w[field]??''}" min="${min}" max="${max}"><small>мм</small></div></label>`;}
function obstaclePanel(w){
 const wall=w.wallIndex??legacyWall(w.wall),length=wallLength(project.room,wall),pipe=w.kind==='pipe',vertical=w.orientation!=='horizontal';
 const fields=pipe?`<label class="field"><span>Направление</span><select data-window="${esc(w.id)}" data-field="orientation"><option value="vertical" ${vertical?'selected':''}>Вертикальная (стояк)</option><option value="horizontal" ${!vertical?'selected':''}>Горизонтальная</option></select></label><div class="pipe-diameters" role="group" aria-label="Диаметр трубы">${PIPE_DIAMETERS.map(d=>`<button class="pipe-chip${Number(w.diameter)===d?' is-active':''}" data-pipe-diameter="${d}" data-i18n="off">Ø${d}</button>`).join('')}</div><div class="fields">${obstacleInput(w,'diameter','Диаметр',{min:10,max:1000})}${obstacleInput(w,'standoff','Отступ от стены',{min:0,max:2000})}</div><div class="fields">${vertical?obstacleInput(w,'height','Высота трубы',{min:50,max:20000}):obstacleInput(w,'width','Длина трубы',{min:50,max:20000})}${obstacleInput(w,'sill',vertical?'Низ от пола':'Низ трубы от пола',{min:0,max:20000})}</div>`
  :`<div class="fields">${obstacleInput(w,'width','Ширина вдоль стены',{min:20,max:20000})}${obstacleInput(w,'depth','Выступ от стены',{min:10,max:5000})}</div><div class="fields">${obstacleInput(w,'height','Высота',{min:20,max:20000})}${obstacleInput(w,'sill','Низ от пола',{min:0,max:20000})}</div>`;
 const conflicts=findObstacleConflicts(project).filter(x=>x.obstacle.element.id===w.id);
 return `<div class="property-block window-block"><span class="eyebrow">ВЫБРАНО НА ПЛАНЕ · СТЕНА ${wall+1}</span><div class="row"><h2>${pipe?'Труба':'Короб / выступ'}</h2><button class="icon-button" data-delete-window="${esc(w.id)}" aria-label="${pipe?'Удалить трубу':'Удалить короб'}">${icon('trash')}</button></div>${fields}<div class="opening-distances"><div><small>До начала стены</small><strong>${fmt(w.offset,1)} мм</strong></div><div><small>До конца стены</small><strong>${fmt(length-w.offset-w.width,1)} мм</strong></div></div>${conflicts.length?`<div class="obstacle-conflicts"><strong>Мешает шкафам:</strong>${conflicts.map(x=>`<span data-user-text>${esc(x.cabinet.name)}</span>`).join('')}</div>`:''}<p class="hint">Тяните элемент вдоль стены. Шкаф, который его задевает, получает предупреждение и кнопку выреза корпуса.</p>${disclosure('opening-position','Точное положение',obstacleInput(w,'offset','От начала стены',{min:0,max:20000}))}</div>`;
}
function obstacleCutoutMarkup(c){
 const conflicts=findObstacleConflicts(project).filter(x=>x.cabinet.id===c.id);if(!conflicts.length)return '';
 const suggestions=conflicts.map(x=>x.suggestion).filter(Boolean);
 const leftSugg=suggestions.find(s=>s.corner==='back-left');
 const rightSugg=suggestions.find(s=>s.corner==='back-right');
 const cur=c.cutout;
 const hasLeft=cur?.corner==='back-left'||cur?.corner==='both';
 const hasRight=cur?.corner==='back-right'||cur?.corner==='both';
 const willHaveBoth=(leftSugg&&rightSugg)||(leftSugg&&hasRight)||(rightSugg&&hasLeft);

 let details='';
 if(willHaveBoth){
  const lw=leftSugg?.width||cur?.leftWidth||cur?.width||0;
  const ld=leftSugg?.depth||cur?.leftDepth||cur?.depth||0;
  const rw=rightSugg?.width||cur?.rightWidth||cur?.width||0;
  const rd=rightSugg?.depth||cur?.rightDepth||cur?.depth||0;
  details=`<small>Вырезы с двух сторон: слева ${fmt(lw)} × ${fmt(ld)} мм, справа ${fmt(rw)} × ${fmt(rd)} мм</small>`;
 } else if(suggestions.length){
  const s=suggestions[0];
  details=`<small>${s.corner==='back-left'?'Вырез сзади слева':'Вырез сзади справа'} · ${fmt(s.width)} × ${fmt(s.depth)} мм</small>`;
 } else {
  details='<small>Сдвиньте шкаф или уменьшите его глубину.</small>';
 }

 const btnText=willHaveBoth?(cur&&cur.corner!=='both'?'Добавить вырез со второй стороны':'Сделать вырезы с двух сторон'):'Сделать вырез под препятствие';

 return `<div class="obstacle-conflicts"><strong>${conflicts.some(x=>x.obstacle.kind==='pipe')?'Шкаф упирается в трубу':'Шкаф упирается в короб'}</strong>${details}</div>${suggestions.length?`<button class="button full" data-action="fit-obstacle-cutout">${btnText}</button>`:''}`;
}
function fitObstacleCutout(c){
 const conflicts=findObstacleConflicts(project).filter(x=>x.cabinet.id===c.id);
 const suggestions=conflicts.map(x=>x.suggestion).filter(Boolean);
 if(!suggestions.length){toast('Вырез не требуется или невозможен');return;}
 change(()=>{
  let left=null,right=null;
  const cur=c.cutout;
  if(cur){
   if(cur.corner==='back-left')left={width:cur.width,depth:cur.depth};
   else if(cur.corner==='back-right')right={width:cur.width,depth:cur.depth};
   else if(cur.corner==='both'){
    left={width:cur.leftWidth??cur.width,depth:cur.leftDepth??cur.depth};
    right={width:cur.rightWidth??cur.width,depth:cur.rightDepth??cur.depth};
   }
  }
  for(const s of suggestions){
   if(s.corner==='back-left'){
    left=left?{width:Math.max(left.width,s.width),depth:Math.max(left.depth,s.depth)}:{...s};
   } else if(s.corner==='back-right'){
    right=right?{width:Math.max(right.width,s.width),depth:Math.max(right.depth,s.depth)}:{...s};
   }
  }
  if(left&&right){
   c.cutout={corner:'both',leftWidth:left.width,leftDepth:left.depth,rightWidth:right.width,rightDepth:right.depth,width:left.width,depth:left.depth};
  } else if(left){
   c.cutout={corner:'back-left',width:left.width,depth:left.depth};
  } else if(right){
   c.cutout={corner:'back-right',width:right.width,depth:right.depth};
  }
  for(const m of project.cabinets)if(m.parentId===c.id)m.cutout=clone(c.cutout);
 });
}
function addObstacle(kind){
 if(project.room.windows.length>=30){toast('В проекте уже 30 проёмов');return;}
 if(roomFocus==='corner'&&Number.isInteger(roomEditor.selectedCorner))selectedWall=roomEditor.selectedCorner;
 const length=wallLength(project.room,selectedWall);if(length<100){toast('Для проёма нужна стена длиной хотя бы 100 мм');return;}
 const o=createObstacle(kind,{id:uid(kind),wallIndex:selectedWall,wallLength:length,roomHeight:project.room.height});
 change(()=>{project.room.windows.push(o);selectedWindowId=o.id;roomFocus='window';});
}
function windowInput(w,field,label){return `<label class="field"><span>${label}</span><div class="input-with-unit"><input type="number" data-window="${esc(w.id)}" data-field="${field}" value="${w[field]}" min="${field==='width'||field==='height'?100:0}" max="20000"><small>мм</small></div></label>`;}
function braceInput(b,field,label,sectionId=null){return `<label class="field"><span>${label}</span><div class="input-with-unit"><input type="number" data-brace="${esc(b.id)}" ${sectionId?`data-brace-section="${esc(sectionId)}"`:''} data-field="${field}" value="${b[field]}" min="${field==='height'?10:0}" max="6000"><small>мм</small></div></label>`;}
function sectionRodsMarkup(c,s){
 const items=getRodLayout(c,project).filter(rod=>(rod.interiorSectionId??rod.sectionId)===s.id);
 const rodInput=(rod,field,label,value,{min=0,max=6000,placeholder=''}={})=>`<label class="field"><span>${label}</span><div class="input-with-unit"><input type="number" data-rod="${esc(rod.id)}" data-rod-section="${esc(s.id)}" data-field="${field}" value="${value??''}" min="${min}" max="${max}" step="0.1" placeholder="${placeholder}"><small>мм</small></div></label>`;
 return `${(s.node.rods||[]).map((rod,i)=>{const physical=items.find(r=>r.rodId===rod.id),curStyle=rod.style||s.node.rodStyle||c.rodStyle||'round';return `<div class="brace-row rod-row"><div class="row"><strong>Штанга ${i+1}</strong><button class="icon-button" data-delete-rod="${esc(rod.id)}" data-rod-section="${esc(s.id)}" aria-label="Удалить штангу">${icon('trash')}</button></div><label class="field" style="margin-bottom:6px"><span>Тип штанги / пантографа</span><select data-rod="${esc(rod.id)}" data-rod-section="${esc(s.id)}" data-field="style">${Object.entries(ROD_STYLES).map(([id,st])=>`<option value="${id}" ${curStyle===id?'selected':''}>${esc(translateText(st.label,interfaceLanguage))}</option>`).join('')}</select></label><div class="fields">${rodInput(rod,'y','Высота оси от дна секции',rod.y,{min:(rod.diameter??25)/2,max:s.height-(rod.diameter??25)/2})}${rodInput(rod,'frontInset','Отступ оси от переднего края',rod.frontInset,{min:(rod.diameter??25)/2,max:(s.usableDepth??s.depth)-(rod.diameter??25)/2})}${rodInput(rod,'length','Длина штанги',rod.length,{min:1,max:s.width-4,placeholder:'Длина автоматически'})}${rodInput(rod,'diameter','Диаметр штанги',rod.diameter??25,{min:10,max:60})}</div>${rod.length==null?`<p class="hint">Длина автоматически: ${fmt(physical?.length,1)} мм</p>`:`<button class="text-button" data-auto-rod="${esc(rod.id)}" data-rod-section="${esc(s.id)}">Длина автоматически</button>`}</div>`;}).join('')}<button class="button full" data-action="add-rod" ${(s.node.rods||[]).length>=12||s.node.front==='drawers'||s.node.appliance||s.node.interiorLayout||s.node.internalDrawerCount>0?'disabled':''}>${icon('plus')}Добавить штангу</button><p class="hint">Штанги считаются отдельно от листовых материалов.</p>`;
}
function sectionBracesMarkup(c,s){return `<div class="section-braces">${(s.node.rearBraces||[]).map((b,i)=>`<div class="brace-row"><div class="row"><strong>Поперечина ${i+1}</strong><button class="icon-button" data-delete-brace="${esc(b.id)}" data-brace-section="${esc(s.id)}" aria-label="Удалить поперечину ${i+1}">${icon('trash')}</button></div><div class="fields">${braceInput(b,'y','Высота от дна секции',s.id)}${braceInput(b,'height','Высота планки',s.id)}</div><label class="field"><span>Материал</span><select data-brace="${esc(b.id)}" data-brace-section="${esc(s.id)}" data-field="materialId">${materialOptions(b.materialId||c.materialId)}</select></label></div>`).join('')}<button class="button full" data-action="add-section-brace">${icon('plus')}Добавить поперечину</button></div>`;}

const views={front:'Спереди',interior:'Внутри',back:'Сзади',left:'Слева',right:'Справа',top:'Сверху',assembly:'Сборка',drilling:'Сверловка'};
function drillingDrawings(language=interfaceLanguage){
 const c=selectedCabinet(),key=`${getDocumentInfo(project).id}:${c.id}:${language}`;
 if(drillingDrawingCache?.key!==key)drillingDrawingCache={key,set:getDrillingDrawingSet(project,{cabinetId:c.id,language})};
 return drillingDrawingCache.set;
}
function selectedDrillingDrawing(language=interfaceLanguage){const set=drillingDrawings(language),item=set.drawings.find(item=>item.part.partCode===drillingPartCode)||set.drawings[0];if(!item)return null;drillingPartCode=item.part.partCode;drawingAssemblyPage=Math.max(1,Math.min(drawingAssemblyPage,item.pages.length));return {...item,page:item.pages[drawingAssemblyPage-1]};}
function selectedDrawingSvg(language=interfaceLanguage){const c=selectedCabinet();if(drawingView==='drilling'){const item=selectedDrillingDrawing(language);return item?createPartInspectionSvg(inspectCabinetPart(project,item.part.id,{language}),{markerId:drillingMarkerId,allHoles:true}):'';}return drawingView==='assembly'?createAssemblySvg(project,{cabinetId:c.id,language,page:drawingAssemblyPage}):createDrawingSvg(project,drawingView,{cabinetId:c.id,dimensions:true,frontDetails:true,language,annotationPage:drawingAssemblyPage});}
function renderDrawings(){
 const c=selectedCabinet(),zoomState=drawingZoom&&drawingZoomView===drawingView?{scale:drawingZoom.scale,left:drawingZoom.viewport.scrollLeft,top:drawingZoom.viewport.scrollTop}:null;drawingZoom?.destroy();const svg=c?selectedDrawingSvg():'';
 const drill=c&&drawingView==='drilling'?drillingDrawings():null,item=drill?.drawings.find(item=>item.part.partCode===drillingPartCode);
 const count=item?1:Number(svg.match(/data-(?:assembly-group|annotation-page)-count="(\d+)"/)?.[1]??1),page=item?1:Number(svg.match(/data-(?:assembly-group|annotation-page)="(\d+)"/)?.[1]??1);drawingAssemblyPage=page;
 const pages=count>1?`<div class="drawing-views" data-i18n="off"><button data-assembly-page="${page-1}" ${page===1?'disabled':''} aria-label="${esc(translateText('Предыдущий лист',interfaceLanguage))}">←</button><span>${esc(translatePrintText('Лист',interfaceLanguage))} ${page}/${count}</span><button data-assembly-page="${page+1}" ${page===count?'disabled':''} aria-label="${esc(translateText('Следующий лист',interfaceLanguage))}">→</button></div>`:'';
 const words={ru:{part:'Деталь',enable:'Включить сверловку корпуса',settings:'Настройки сверловки',disabled:'Сверловка выключена. Включите её для расчёта соединений корпуса под конфирматы.',empty:'В этом шкафу нет неподвижных соединений для автоматической сверловки.',invalid:'Сверловка заблокирована. Исправьте ошибки конструкции или параметры крепежа.',scope:'Здесь показаны отверстия неподвижных соединений корпуса. Петли и направляющие сверлятся по схеме выбранной фурнитуры.'},tr:{part:'Parça',enable:'Gövde deliklerini etkinleştir',settings:'Delik ayarları',disabled:'Delikler kapalı. Confirmat gövde bağlantılarını hesaplamak için etkinleştirin.',empty:'Bu dolapta otomatik delik oluşturulacak sabit bağlantı yok.',invalid:'Delikler engellendi. Yapı veya bağlantı ayarlarını düzeltin.',scope:'Sabit gövde bağlantıları gösterilir. Menteşe ve ray delikleri seçilen donanımın şemasına göre açılır.'},en:{part:'Part',enable:'Enable carcass drilling',settings:'Drilling settings',disabled:'Drilling is disabled. Enable it to calculate carcass joints for confirmat screws.',empty:'This cabinet has no fixed joints for automatic drilling.',invalid:'Drilling is blocked. Correct the construction or fastener settings.',scope:'Fixed carcass joints are shown. Hinge and slide drilling follows the selected hardware template.'}}[interfaceLanguage];
 const drillControls=drill?`<div class="drawing-drilling-controls" data-i18n="off">${drill.valid?`<label class="field"><span>${words.part}</span><select id="drawing-drilling-part">${drill.drawings.map(item=>`<option value="${item.part.partCode}" ${item.part.partCode===drillingPartCode?'selected':''}>${item.part.partCode} · ${esc(translatePrintText(item.part.name,interfaceLanguage))}</option>`).join('')}</select></label>`:''}<button class="button" data-action="drawing-drilling-settings">${words.settings}</button></div>${drill.valid?'':`<div class="notice ${drill.plan.settings.enabled?'error':''}" data-i18n="off"><p>${!drill.plan.settings.enabled?words.disabled:drill.errors.length?words.invalid:words.empty}</p>${drill.errors.length?`<ul>${drill.errors.map(issue=>`<li>${esc(translatePrintText(issue.message,interfaceLanguage))}</li>`).join('')}</ul>`:''}${!drill.plan.settings.enabled?`<button class="button primary" data-action="drawing-enable-drilling">${words.enable}</button>`:''}</div>`}`:'';
 $('#drawings-shell').innerHTML=`<div class="drawing-views">${Object.entries(views).map(([v,l])=>`<button class="${drawingView===v?'active':''}" data-drawing-view="${v}">${l}</button>`).join('')}</div>${drillControls}${pages}${c?(svg?drawingZoomMarkup(svg):''):'<div class="empty-state">Добавьте шкаф для создания чертежей.</div>'}`;drawingZoom=svg?new DrawingZoom($('#drawings-shell')):null;
 for(const button of $('#stage-actions').querySelectorAll('button'))button.disabled=!svg;
 drawingZoomView=drawingView;if(drawingZoom&&zoomState){drawingZoom.zoom(zoomState.scale);drawingZoom.viewport.scrollLeft=zoomState.left;drawingZoom.viewport.scrollTop=zoomState.top;}
 const select=$('#drawing-drilling-part');if(select)select.onchange=()=>{drillingPartCode=select.value;drillingMarkerId=null;drawingAssemblyPage=1;renderDrawings();};
 for(const marker of $('#drawings-shell').querySelectorAll('[data-inspection-marker]')){const pick=()=>{drillingMarkerId=marker.dataset.inspectionMarker;renderDrawings();};marker.onclick=pick;marker.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}};}
}
function sheetSvg(sheet,language=interfaceLanguage){return createCuttingSheetSvg(sheet,parts,{language});}
function renderCutting(){$('#cutting-shell').innerHTML=`<div class="cutting-totals"><span><strong>${cutting.totalSheets}</strong> листов</span><span><strong>${fmt(cutting.utilization,1)}%</strong> заполнение</span><span>${parts.length} деталей</span><span><strong>${fmt(getEdgeBandingSummary(parts).lengthMeters,3)}</strong> м кромки</span></div>${edgeSummaryMarkup(parts)}${cutting.unplaced.length?`<div class="notice error">Не размещено ${cutting.unplaced.length} деталей. Проверьте формат и толщину листа.</div>`:''}<div class="sheet-grid">${cutting.sheets.map((s,i)=>`<article class="sheet-card"><header><span class="sheet-number">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(project.materials.find(m=>m.id===s.materialId)?.name)}</strong><small>${s.thickness} мм · ${s.width} × ${s.height}</small></div></header>${sheetSvg(s)}<button class="text-button" data-sheet="${i}">${s.placements.length} деталей · посмотреть</button></article>`).join('')||'<div class="empty-state">Раскрой появится после добавления шкафа.</div>'}</div>`;}

if(typeof document!=='undefined'){
document.addEventListener('click',e=>{
 const edgeReset=e.target.closest('[data-part-edge-reset]');if(edgeReset){updatePartEdges(edgeReset.dataset.partEdgeReset,null);return;}
 const preview=e.target.closest('[data-inspection-open]');if(preview){showPart(preview.dataset.inspectionOpen);return;}
 const b=e.target.closest('button,a');if(!b)return;
 if(b.dataset.mode){mode=b.dataset.mode==='cabinet'&&cabinetView==='drawings'?'drawings':b.dataset.mode;render();}
 if(b.dataset.cabinet){if(b.dataset.cabinet!==cabinetId)interiorParentId=null;cabinetId=b.dataset.cabinet;sectionId=null;drawingAssemblyPage=1;drillingPartCode=null;if(mode==='room'){roomFocus='cabinet';selectedWindowId=null;selectedLightId=null;}render();}
 if(b.dataset.cabinetView){cabinetView=b.dataset.cabinetView;mode=cabinetView==='drawings'?'drawings':'cabinet';render();}
 if(b.dataset.roomView){roomView=b.dataset.roomView;render();}
 if(b.dataset.drawingView){drawingView=b.dataset.drawingView;drawingAssemblyPage=1;renderDrawings();}
 if(b.dataset.assemblyPage){drawingAssemblyPage=Number(b.dataset.assemblyPage);renderDrawings();}
 if(b.dataset.front){change(()=>{const c=selectedCabinet(),isCorner=c?.cornerType==='blind'||String(c?.type).startsWith('corner'),node=editableSection()?.node;if(node){node.front=b.dataset.front;if(node.front==='doors'){if(isCorner)node.doors=1;else if(!(node.doors>0))node.doors=2;if(node.doorOpenings){node.doorOpenings=Array.from({length:node.doors},(_,i)=>node.doorOpenings[i]??(i%2?'right':'left'));}}else{delete node.doorOpenings;}if(node.front!=='open')delete node.pullOutShelf;if(node.front!=='doors')delete node.hingesPerDoor;if(node.front==='drawers'){delete node.internalDrawerCount;delete node.interiorLayout;if(!(node.drawers>0))node.drawers=2;node.shelves=0;delete node.rods;}delete node.appliance;if(!getFrontLayout(c,project).some(front=>front.kind==='door'))delete c.hingesPerDoor;}});}
 if(b.dataset.split){const s=selectedSection();if(s)change(()=>{const c=selectedCabinet();if(interiorParentId){const outer=layout().sections.find(s=>s.id===interiorParentId),next=splitInteriorSection(outer.node.interiorLayout,s.id,b.dataset.split);if(!next)return false;outer.node.interiorLayout=next;sectionId=findInteriorNode(next,s.id)?.children?.[0]?.id;return;}if(!splitSection(c,s.id,b.dataset.split,project))return false;sectionId=findLayoutNode(c.layout,s.id)?.children?.[0]?.id;});}
 if(b.dataset.deleteWindow)deleteOpening(b.dataset.deleteWindow);
 if(b.dataset.deleteLight)deleteLight(b.dataset.deleteLight);
 if(b.dataset.pipeDiameter){const w=selectedOpening();if(w&&w.kind==='pipe')change(()=>Object.assign(w,normalizeObstacle({...w,diameter:Number(b.dataset.pipeDiameter)})));return;}
 if(b.dataset.selectWindow){selectedWindowId=b.dataset.selectWindow;selectedLightId=null;roomFocus='window';const w=selectedOpening();if(w)selectedWall=w.wallIndex??legacyWall(w.wall);render();}
 if(b.dataset.selectLight){selectedLightId=b.dataset.selectLight;selectedWindowId=null;roomFocus='light';render();}
 if(b.dataset.deleteBrace)change(()=>{const c=selectedCabinet(),owner=b.dataset.braceSection?findLayoutNode(c.layout,b.dataset.braceSection):c;if(!owner||b.dataset.braceSection&&c.includeBack!==false)return false;owner.rearBraces=(owner.rearBraces||[]).filter(a=>a.id!==b.dataset.deleteBrace);});
 if(b.dataset.deleteRod||b.dataset.autoRod)change(()=>{const s=editableSection();if(s?.id!==b.dataset.rodSection)return false;const id=b.dataset.deleteRod||b.dataset.autoRod;if(b.dataset.deleteRod)s.node.rods=(s.node.rods||[]).filter(r=>r.id!==id);else{const rod=s.node.rods?.find(r=>r.id===id);if(rod)delete rod.length;}});
 if(b.dataset.deleteMaterial){deleteMaterialAction(b.dataset.deleteMaterial);return;}if(b.dataset.material)editMaterial(b.dataset.material);
 if(b.dataset.part)showPart(b.dataset.part);
 if(b.dataset.inspectPart){inspectionMarkerId=null;inspectionPartId=b.dataset.inspectPart;viewport.setOptions({selectedPartId:inspectionPartId});renderProperties();showPart(inspectionPartId);}
 if(b.dataset.sheet)showSheet(Number(b.dataset.sheet));
 if(b.dataset.action)action(b.dataset.action, b);
 if(b.classList.contains('brand')){e.preventDefault();mode='cabinet';render();}
});
document.addEventListener('toggle',e=>{if(e.target.matches('details[data-detail]')){const name=e.target.dataset.detail;if(e.target.open)expanded.add(name);else expanded.delete(name);}},true);
document.addEventListener('change',e=>{
 if(e.target.dataset.action==='render-preset'){roomRenderer.setCameraPreset(e.target.value);return;}
 if(e.target.dataset.action==='render-quality'){roomRenderer.setQuality(e.target.value);try{localStorage.setItem('atolye.render.quality',e.target.value);}catch{}return;}
 if(e.target.dataset.action==='render-floor-style'){roomRenderer.setFloorStyle(e.target.value);try{localStorage.setItem('atolye.render.floorStyle',e.target.value);}catch{}return;}
 if(e.target.dataset.action==='render-wall-color'||e.target.dataset.action==='render-ceiling-color'){const key=e.target.dataset.action==='render-wall-color'?'wallColor':'ceilingColor',value=e.target.value;if(/^#[0-9a-f]{6}$/i.test(value))change(()=>{project.room[key]=value.toLowerCase();});return;}
 if(e.target.dataset.partEdge){const el=e.target,value=el.checked?partBandThickness(el.dataset.partEdgeId,el.dataset.partEdge):0;updatePartEdges(el.dataset.partEdgeId,{[el.dataset.partEdge]:value});return;}
 if(['screwsPerJoint','measureFromFinishedEdge'].includes(e.target.dataset.drilling)){
  const field=e.target.dataset.drilling,value=e.target.type==='checkbox'?e.target.checked:e.target.value==='auto'?'auto':Number(e.target.value),panel=$('.modal [data-part-inspection]'),reopen=Boolean(panel&&inspectionPartId),initialView=panel?.querySelector('[data-inspection-view].active')?.dataset.inspectionView??'drilling';
  const initialZoom=reopen&&partZoom?{scale:partZoom.scale,left:partZoom.viewport.scrollLeft,top:partZoom.viewport.scrollTop}:null,bodyScroll=$('.modal-body')?.scrollTop??0,isFactory=Boolean($('.factory-drilling'));
  const saved=change(()=>{project.settings.drilling={...normalizeDrillingSettings(project.settings.drilling),[field]:value};});
  if(saved){if(isFactory)factoryDialog();else if(reopen){if(refreshPartModal)refreshPartModal();else{showPart(inspectionPartId,{initialView,initialZoom});$('.modal-body').scrollTop=bodyScroll;}}}return;
 }
 if(e.target.dataset.drilling){const el=e.target,field=el.dataset.drilling,value=el.type==='checkbox'?el.checked:field==='countersinkDepth'&&el.value===''?null:field==='crossJointFastener'?el.value:Number(el.value);if(el.type==='number'&&value!==null&&(el.value===''||!validNumber(el,value)))return;change(()=>{project.settings.drilling={...normalizeDrillingSettings(project.settings.drilling),[field]:value};});factoryDialog({refreshOnly:el.type==='number'});return;}
 if(e.target.dataset.priceMaterial||e.target.dataset.priceRate){const el=e.target,value=Number(el.value);if(el.value!==''&&!validNumber(el,value))return;change(()=>{if(el.dataset.priceMaterial){const m=project.materials.find(m=>m.id===el.dataset.priceMaterial);if(!m)return false;if(el.value==='')delete m.pricePerSheet;else m.pricePerSheet=value;}else{project.settings.pricing??={};if(el.value==='')delete project.settings.pricing[el.dataset.priceRate];else project.settings.pricing[el.dataset.priceRate]=value;}});rememberPricing();updatePricingSummary();return;}
 if(e.target.id==='interface-language'){interfaceLanguage=e.target.value;try{localStorage.setItem('atolye.ui.language',interfaceLanguage);}catch{}render();applyLanguage();return;}
 if(e.target.id==='print-turkish'){change(()=>project.settings.printLanguage=e.target.checked?'tr':interfaceLanguage==='en'?'en':'ru');return;}
 if(e.target.dataset.action==='hud-handle-style'){const val=e.target.value,c=selectedCabinet();if(c&&val)change(()=>{c.handleStyle=val;const s=selectedSection();if(s?.node?.handleStyle)s.node.handleStyle=val;});return;}
 const rodEl=e.target;if(rodEl.dataset.rod){if(rodEl.dataset.field==='style'){const val=rodEl.value;change(()=>{const s=editableSection();if(s?.id!==rodEl.dataset.rodSection)return false;const rod=s.node.rods?.find(r=>r.id===rodEl.dataset.rod);if(!rod)return false;rod.style=val;});return;}const value=Number(rodEl.value),auto=rodEl.dataset.field==='length'&&rodEl.value==='';if(!auto&&!validNumber(rodEl,value)){renderProperties();return;}change(()=>{const s=editableSection();if(s?.id!==rodEl.dataset.rodSection)return false;const rod=s.node.rods?.find(r=>r.id===rodEl.dataset.rod);if(!rod)return false;if(auto)delete rod.length;else rod[rodEl.dataset.field]=value;});return;}
 const braceEl=e.target;if(braceEl.dataset.brace){const value=braceEl.type==='number'?Number(braceEl.value):braceEl.value;if(braceEl.type==='number'&&!validNumber(braceEl,value)){renderProperties();return;}change(()=>{const c=selectedCabinet(),owner=braceEl.dataset.braceSection?findLayoutNode(c.layout,braceEl.dataset.braceSection):c;if(!owner||braceEl.dataset.braceSection&&c.includeBack!==false)return false;const b=owner.rearBraces?.find(b=>b.id===braceEl.dataset.brace);if(b)b[braceEl.dataset.field]=value;});return;}
 const el=e.target;if(el.dataset.window&&el.dataset.field==='orientation'){change(()=>{const w=project.room.windows.find(w=>w.id===el.dataset.window);if(!w)return false;const wall=w.wallIndex??legacyWall(w.wall);Object.assign(w,setPipeOrientation(w,el.value,{wallLength:wallLength(project.room,wall),roomHeight:project.room.height}));});return;}if(el.dataset.window){const value=Number(el.value);if(!validNumber(el,value)){renderProperties();return;}change(()=>{const w=project.room.windows.find(w=>w.id===el.dataset.window);if(w){w[el.dataset.field]=value;if(isObstacle(w))Object.assign(w,normalizeObstacle(w));}});return;}
 if(!el.dataset.scope)return;const field=el.dataset.field,scope=el.dataset.scope;
 const value=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;
 if(el.type==='number'&&!validNumber(el,value)){renderProperties();return;}
 change(()=>{
  const c=selectedCabinet(),s=scope==='section'?editableSection():selectedSection();
  if(scope==='interior-hardware'){
   const proposal=c&&s?setInteriorDrawerHingeGap(c,project,s.id,value,{parentSectionId:interiorParentId}):null;
   if(!proposal)return false;
   Object.assign(c,proposal);return;
  }
  if(scope==='cabinet'&&c){
   if(c.parentId&&['width','depth','plinth','sidesToFloor','x','y','z','rotation'].includes(field)){toast(translateText('Антресоль привязана к основному шкафу. Перемещайте основной шкаф.',interfaceLanguage));return false;}
   if(c.parentId&&field.startsWith('cutout-')){return false;}
   if(mode==='room'&&['width','depth'].includes(field))return applyCabinetResult(c,resizeCabinetOnPlan(c,{[field]:value},project));
   if(field==='cutout-corner'){
     if(value==='none')c.cutout=undefined;
     else if(value==='both'){
       const curW=c.cutout?.width||150,curD=c.cutout?.depth||150;
       c.cutout={corner:'both',leftWidth:c.cutout?.leftWidth??curW,leftDepth:c.cutout?.leftDepth??curD,rightWidth:c.cutout?.rightWidth??curW,rightDepth:c.cutout?.rightDepth??curD,width:c.cutout?.leftWidth??curW,depth:c.cutout?.leftDepth??curD};
     } else {
       const curW=(value==='back-left'?c.cutout?.leftWidth:c.cutout?.rightWidth)??c.cutout?.width??150;
       const curD=(value==='back-left'?c.cutout?.leftDepth:c.cutout?.rightDepth)??c.cutout?.depth??150;
       c.cutout={corner:value,width:curW,depth:curD};
     }
   }
   else if(field.startsWith('cutout-')){
     const prop=field.slice(7);
     if(c.cutout){
       c.cutout[prop]=value;
       if(c.cutout.corner==='both'&&(prop==='leftWidth'||prop==='leftDepth'))c.cutout[prop==='leftWidth'?'width':'depth']=value;
     }
   }
   else if(field==='rotation')setCabinetRotation(c,value);
    else if(field==='blindSide'){c.blindSide=value;c.doorOpening=value==='left'?'right':'left';const targetNode=s?.node??(c.layout?.kind==='section'?c.layout:c.layout?.children?.[0]);if(targetNode){targetNode.doors=1;targetNode.doorOpenings=[c.doorOpening];}}
    else if(field==='doorOpening'){c.doorOpening=value;const targetNode=s?.node??(c.layout?.kind==='section'?c.layout:c.layout?.children?.[0]);if(targetNode){targetNode.doors=1;targetNode.doorOpenings=[value];}}
    else if(field.startsWith('door-material-')){const index=Number(field.slice(14));c.doorMaterialIds??=[];c.doorMaterialIds[index]=value||null;if(c.doorMaterialIds.every(m=>!m))delete c.doorMaterialIds;}
    else if(field.startsWith('drawer-material-')){const index=Number(field.slice(16));c.drawerMaterialIds??=[];c.drawerMaterialIds[index]=value||null;if(c.drawerMaterialIds.every(m=>!m))delete c.drawerMaterialIds;}
   else {c[field]=value;if(field==='backMaterialId')c.backThickness=project.materials.find(m=>m.id===value)?.thickness||3;if(field==='drawerBottomMaterialId')c.drawerBottomThickness=project.materials.find(m=>m.id===value)?.thickness||6;}
   syncMezzanines(project);
   if(['x','y','z','rotation'].includes(field)&&!canPlaceCabinet(c,project))throw Error('Размещение пересекает другой шкаф или нарушает границы помещения и монтажные отступы.');
  }
  if(scope==='section'&&s){
   if(field==='frontMaterialId'){if(value)s.node.frontMaterialId=value;else delete s.node.frontMaterialId;return;}
   if(field.startsWith('door-material-')){const index=Number(field.slice(14));s.node.doorMaterialIds??=[];s.node.doorMaterialIds[index]=value||null;if(s.node.doorMaterialIds.every(m=>!m))delete s.node.doorMaterialIds;return;}
   if(field.startsWith('drawer-material-')){const index=Number(field.slice(16));s.node.drawerMaterialIds??=[];s.node.drawerMaterialIds[index]=value||null;if(s.node.drawerMaterialIds.every(m=>!m))delete s.node.drawerMaterialIds;return;}
   if(field.startsWith('door-opening-')){const index=Number(field.slice(13)),isCorner=c?.cornerType==='blind'||String(c?.type).startsWith('corner'),count=isCorner?1:(s.node.doors||2);s.node.doors=count;s.node.doorOpenings=Array.from({length:count},(_,i)=>i===index?value:s.node.doorOpenings?.[i]??(i%2?'right':'left'));return;}
   if(field==='floor-open'){s.node.floor=value?'open':'inherit';return;}
   if(field==='section-plinth'){s.node.plinthHeight=value?(s.node.plinthHeight>0?s.node.plinthHeight:c.plinth>0?c.plinth:100):0;return;}
   if(field==='back'&&c.includeBack!==false)return false;
   if(field==='mounting-height'){const axes=getSectionMountingAxes(c,project).find(axis=>axis.id===s.id);return axes?.height==null?false:resizeOpening(c,s.id,'horizontal',value-(axes.height-s.height));}
   if(field==='section-width'||field==='section-height')return resizeOpening(c,s.id,field==='section-width'?'vertical':'horizontal',value);
   if(field==='depth'){if(interiorParentId){s.node.depth=Math.min(value,layout().sections.find(s=>s.id===interiorParentId).depth);return;}return applyCabinetResult(c,setApplianceSectionDepth(c,s.id,value,project));}
   if(field.startsWith('drawer-height-')){
    const fs=getFrontLayout(c,project).filter(f=>f.sectionId===s.id&&f.kind==='drawer'),index=Number(field.slice(14));const available=fs.reduce((sum,f)=>sum+f.height,0),rest=available-fs[index].height;const heights=fs.map((f,i)=>i===index?value:(available-value)*f.height/rest);if(heights.some(h=>!Number.isFinite(h)||h<60))return false;s.node.drawerHeights=heights;
   }else{s.node[field]=value;if(field==='drawers'){s.node.drawerHeights=undefined;s.node.shelves=0;}if(field==='doors'&&s.node.doorOpenings)s.node.doorOpenings=Array.from({length:value},(_,i)=>s.node.doorOpenings[i]??(i%2?'right':'left'));if(field==='internalDrawerCount'&&value>0)s.node.shelves=0;}
  }
  if(scope==='settings')project.settings[field]=value;
  if(scope==='light'){
   const l=selectedLight();if(!l)return false;
   if(field==='kind'){
    l.kind=value;
    const roomH=project.room.height||2700;
    if(value==='spot')l.y=roomH;
    else if(value==='pendant')l.y=Math.max(1800,roomH-450);
    else if(value==='floor')l.y=1650;
    else if(value==='sconce')l.y=1800;
   }else{
    l[field]=value;
   }
  }
  if(scope==='corner'){const index=roomEditor.selectedCorner,outline=clone(getRoomOutline(project.room));if(!outline[index])return false;outline[index][field]=value;if(!polygonIsSimple(outline))return false;project.room.windows=remapWindows(project.room,outline,{kind:'drag',index});project.room.outline=outline;const bounds=roomBounds(project.room);project.room.width=bounds.width;project.room.depth=bounds.depth;}
  if(scope==='room'){
   if(field.startsWith('installation-')){project.room.installationClearance??={walls:0,ceiling:0};project.room.installationClearance[field.slice(13)]=value;return;}
   if(field==='wall-length'){const outline=clone(getRoomOutline(project.room)),a=outline[selectedWall],b=outline[(selectedWall+1)%outline.length],length=Math.hypot(b.x-a.x,b.z-a.z);b.x=rounded(a.x+(b.x-a.x)*value/length);b.z=rounded(a.z+(b.z-a.z)*value/length);if(!polygonIsSimple(outline)||outline.some(p=>Math.abs(p.x)>20000||Math.abs(p.z)>20000))return false;project.room.windows=remapWindows(project.room,outline,{kind:'drag'});project.room.outline=outline;const bounds=roomBounds(project.room);project.room.width=bounds.width;project.room.depth=bounds.depth;}
   else project.room[field]=value;
  }
 });
});
}
function validNumber(el,value){const integer=['doors','drawers','shelves','internalDrawerCount','hingesPerDoor'].includes(el.dataset.field);if(!Number.isFinite(value)||value<Number(el.min)||value>Number(el.max)||(integer&&!Number.isInteger(value))){toast(`Введите ${integer?'целое ':''}число от ${el.min} до ${el.max}`);return false;}return true;}
function resizeOpening(c,id,axis,value){return applyCabinetResult(c,interiorParentId?resizeConstrainedInteriorSection(c,interiorParentId,id,axis,value,project):resizeApplianceSection(c,id,axis,value,project));}
function setCabinetRotation(c,degrees){const old=(c.rotation||0)*Math.PI/180,next=degrees*Math.PI/180,center={x:c.x+c.width/2*Math.cos(old)-c.depth/2*Math.sin(old),z:c.z+c.width/2*Math.sin(old)+c.depth/2*Math.cos(old)};c.rotation=degrees;c.x=Math.round((center.x-c.width/2*Math.cos(next)+c.depth/2*Math.sin(next))*1000)/1000;c.z=Math.round((center.z-c.width/2*Math.sin(next)-c.depth/2*Math.cos(next))*1000)/1000;}
function updateRoomDeleteTool(){const button=$('#room-tools [data-action="remove-corner"]');if(!button)return;const opening=roomFocus==='window'?selectedOpening():null,light=roomFocus==='light'?selectedLight():null,indices=roomEditor.getSelectedCorners();const label=light?'Удалить источник света':opening?opening.kind==='door'?'Удалить дверной проём':'Удалить окно':indices.length>1?`Удалить выбранные углы (${indices.length})`:'Удалить выбранный угол';button.title=label;button.setAttribute('aria-label',label);button.disabled=!light&&!opening&&!indices.length;}
function action(name, el=null){const c=selectedCabinet();
 if(name==='open-raytrace-3d'){
  mode='room';roomView='render';
  if(c){roomFocus='cabinet';selectedWindowId=null;selectedLightId=null;}
  roomRenderer.setRayTracing(true);
  render();
  if(c)roomRenderer.focusOnCabinet(c.id);
  return;
 }
 if(name==='set-cabinet-hw'&&c){
  const field=el?.dataset.field,val=el?.dataset.value;
  if(field&&val){
   change(()=>{
    c[field]=val;
    const s=editableSection();
    if(s?.node){
     if(s.node[field])s.node[field]=val;
     if(field==='rodStyle'&&Array.isArray(s.node.rods)){
      s.node.rods.forEach(r=>{r.style=val;});
     }
    }
   });
   if( (field==='hingeStyle'||field==='drawerRailingStyle') && mode==='cabinet' && cabinetView==='scheme' ){
    cabinetView='3d';
    viewport.setOptions({doorsOpen:true,openProgress:1});
    render();
   }
  }
  return;
 }
 if(name==='render-raytracing'){
  roomRenderer.toggleRayTracing();
  renderHud();
  toast(roomRenderer.rayTracing?translateText('Трассировка лучей включена',interfaceLanguage):translateText('Трассировка лучей выключена',interfaceLanguage));
  return;
 }
 if(name==='render-set-lighting'){
  const val=el?.dataset.value;
  if(val){roomRenderer.setLightingMode(val);render();}
  return;
 }
 if(name==='toggle-measure'||name==='measure'){
  const next = !getMeasureToolActive();
  setMeasureTool(next);
  toast(next ? translateText('Рулетка включена', interfaceLanguage) : translateText('Рулетка выключена', interfaceLanguage));
  return;
 }
 if(name==='view-drc'){action('validation');return;}
 if(name==='apply-quick-fix'){const idx=Number(el?.dataset.fixIdx),fix=warnings[idx]?.fix;if(fix){change(()=>{const ok=applyQuickFix(project,fix);if(ok)toast(`Применено: ${fix.label||'Автоисправление'}`);});if($('.modal'))closeModal();}return;}
 if(name==='set-room-door-swing'){const w=selectedOpening(),val=el?.dataset.value;if(w&&w.kind==='door'&&val)change(()=>{w.swing=val;});}
 if(name==='set-room-door-hinge'){const w=selectedOpening(),val=el?.dataset.value;if(w&&w.kind==='door'&&val)change(()=>{w.hinge=val;});}
 if(name==='set-front-mount'&&c){const s=editableSection(),val=el?.dataset.value;if(val&&s?.node)change(()=>{s.node.frontMount=val;});}
 if(name==='set-door-opening'&&c){const s=editableSection(),val=el?.dataset.value;if(val){change(()=>{const isCorner=c.cornerType==='blind'||String(c.type).startsWith('corner');if(isCorner)c.doorOpening=val;if(s?.node){s.node.doorOpening=val;const count=s.node.doors||1;s.node.doorOpenings=Array.from({length:count},(_,i)=>i===0?val:(s.node.doorOpenings?.[i]??(i%2?'right':'left')));}});}}
 if(name==='set-door-index-opening'&&c){const s=editableSection(),val=el?.dataset.value,index=Number(el?.dataset.index);if(val!=null&&!Number.isNaN(index)&&s?.node){change(()=>{const count=Math.max(1,s.node.doors||2);s.node.doorOpenings=Array.from({length:count},(_,i)=>i===index?val:(s.node.doorOpenings?.[i]??(i%2?'right':'left')));if(index===0)s.node.doorOpening=val;});}}
 if(name==='flip-doors-opening'&&c){const s=editableSection();if(s?.node){change(()=>{const isCorner=c.cornerType==='blind'||String(c.type).startsWith('corner'),count=isCorner?1:Math.max(1,s.node.doors||2);const curOpenings=Array.from({length:count},(_,i)=>s.node.doorOpenings?.[i]??(count===1?(s.node.doorOpening??(isCorner?(c.doorOpening??(c.blindSide==='left'?'right':'left')):'left')):(i%2?'right':'left')));const flipped=curOpenings.map(op=>op==='left'?'right':op==='right'?'left':op);s.node.doorOpenings=flipped;if(count===1){s.node.doorOpening=flipped[0];if(isCorner)c.doorOpening=flipped[0];}});}}
 if(name==='prices'){pricingDialog();return;}
 if(name==='reset-prices'){change(()=>{project.materials.forEach(m=>delete m.pricePerSheet);delete project.settings.pricing;});rememberPricing();pricingDialog();return;}
 if(name==='auto-hinges')change(()=>{const s=editableSection();if(s?.node.front==='doors')delete s.node.hingesPerDoor;});
 if(name==='help'){queueMicrotask(()=>{const body=$('.modal-body');if(body){body.insertAdjacentHTML('beforeend','<p>Внутри секции с дверями нажмите «Внутреннее наполнение»: разделите отсеки и разместите полки и ящики за общими дверями.</p><p>Цоколь и задняя конструкция настраиваются для выбранной секции.</p>');applyLanguage();}});}
 if(name==='return-doors'){sectionId=interiorParentId;interiorParentId=null;render();}
 if(name==='edit-interior'&&c){const s=selectedSection();if(['doors','open'].includes(s?.node.front)){if(!s.node.interiorLayout)change(()=>{const inner=createInteriorFromSection(s,layout().thickness);if(!inner)throw Error('Для внутренних отсеков сначала измените положение штанг или удалите их.');s.node.interiorLayout=inner;s.node.shelves=0;delete s.node.pullOutShelf;delete s.node.internalDrawerCount;delete s.node.rods;});if(s.node.interiorLayout){interiorParentId=s.id;sectionId=s.node.interiorLayout.id;cabinetView='scheme';render();}}}
 if(name==='design-selected'){mode='cabinet';cabinetView='scheme';render();}
 if(name==='edit-sections'&&c)change(()=>{c.layout=convertLegacyLayout(c);});
 if(name==='undo'&&history.length){future.push(clone(project));project=history.pop();calculate();render();}
 if(name==='redo'&&future.length){history.push(clone(project));project=future.pop();calculate();render();}
 if(name==='undo'||name==='redo')rememberPricing();
 if(name==='add-cabinet')addCabinetDialog();
 if((name==='extend-left'||name==='extend-right')&&c)change(()=>{const added=extendCabinetSide(c,name==='extend-left'?'left':'right',300,project);if(!added)throw Error('Эту сторону нельзя расширить: проверьте задний вырез, ширину шкафа и число секций.');sectionId=added;});
  if(name==='flip-corner-side'&&c){change(()=>{const isCorner=c.cornerType==='blind'||String(c.type).startsWith('corner');if(!isCorner)return false;c.blindSide=c.blindSide==='left'?'right':'left';c.doorOpening=c.blindSide==='left'?'right':'left';const targetNode=editableSection()?.node??selectedSection()?.node??(c.layout?.kind==='section'?c.layout:c.layout?.children?.[0]??c.layout);if(targetNode){targetNode.doors=1;targetNode.doorOpenings=[c.doorOpening];}});}
 if(name==='rotate-cabinet'&&c){if(c.parentId){toast(translateText('Антресоль привязана к основному шкафу. Перемещайте основной шкаф.',interfaceLanguage));return;}change(()=>{setCabinetRotation(c,(((c.rotation||0)+90+180)%360+360)%360-180);syncMezzanines(project);if(!canPlaceCabinet(c,project))throw Error('Размещение пересекает другой шкаф или нарушает границы помещения и монтажные отступы.');});}
 if(name==='reset-view'){cabinetEditor.reset();viewport.resetCamera();}
 if(name==='open-fronts'){const open=!viewport.options.doorsOpen;viewport.setOptions({doorsOpen:open,openProgress:open?1:0,...(!open?{internalDrawersOpen:false}:{})});render();}
 if(name==='open-internal'){viewport.setOptions({doorsOpen:true,openProgress:1,internalDrawersOpen:!viewport.options.internalDrawersOpen});render();}
 if(name==='room-open-fronts'){const open=!roomViewport.options.doorsOpen;roomViewport.setOptions({doorsOpen:open,openProgress:open?1:0,internalDrawersOpen:open});render();}
 if(name==='render-doors'){roomRenderer.toggleDoors();render();}
 if(name==='render-walls'){roomRenderer.toggleWallMode();render();}
 if(name==='render-ceiling'){roomRenderer.setShowCeiling();render();}
 if(name==='render-lighting'){const order=['day','evening','studio','night-led'];const next=order[(order.indexOf(roomRenderer.lightingMode)+1)%order.length];roomRenderer.setLightingMode(next);render();}
 if(name==='render-wall-shadows'){roomRenderer.setWallShadows();saveSun();render();}
 if(name==='render-focus-cabinet'&&c){roomRenderer.focusOnCabinet(c.id);return;}
 if(name==='render-reset')roomRenderer.resetCamera();
 if(name==='render-screenshot'){const url=roomRenderer.captureScreenshot();if(url){const a=document.createElement('a');a.href=url;a.download=`${exportBaseName(project)}-render.png`;a.click();}}
 if(name==='room-obj')downloadRoomOBJ(project,{doorsOpen:roomRenderer?.doorsOpen||roomViewport?.options?.doorsOpen});
 if(name==='room-plan-print'){const language=project.settings.printLanguage??'tr';showPrintPreview('Печать плана помещения',generateRoomPlanHTML(project,{language}),'room-plan','План помещения','Сохранить план помещения');}
 if(name==='room-3d-print'){const language=project.settings.printLanguage??'tr',snapshot=roomViewport.captureRoom3D({language});showPrintPreview('Печать 3D-вида помещения',generateRoom3DHTML(project,{...snapshot,language}),'room-3d','3D','Сохранить 3D помещения');}
 if(name==='room-presentation'){const language=project.settings.printLanguage??interfaceLanguage??'tr';let snapshot=null;if(roomView==='render'&&roomRenderer){snapshot=roomRenderer.captureScreenshot();}else if(roomViewport){const snap=roomViewport.captureRoom3D({language});snapshot=snap?.image||null;}const html=generateRoomPresentationHTML(project,{language,snapshot});showPrintPreview(translateText('Презентация проекта',interfaceLanguage),html,'presentation',translateText('Презентация проекта',interfaceLanguage),translateText('Сохранить буклет HTML',interfaceLanguage));}
 if(name==='delete-section'&&c){change(()=>{const s=editableSection(),sections=editorLayout().sections,index=sections.findIndex(a=>a.id===s.id),nextId=sections[index+1]?.id??sections[index-1]?.id;if(interiorParentId){const outer=layout().sections.find(s=>s.id===interiorParentId),next=removeInteriorSection(outer,s.id,layout().thickness);if(!next)return false;outer.node.interiorLayout=next;sectionId=nextId;return true;}const ok=removeSection(c,s.id,project);sectionId=nextId;return ok;});}
 if(name==='add-corner')roomEditor.addCorner();
 if(name==='remove-corner'){if(roomFocus==='light'&&selectedLight())deleteLight(selectedLightId);else if(roomFocus==='window'&&selectedOpening())deleteOpening(selectedWindowId);else roomEditor.removeSelectedCorners();}
 if(name==='room-niche')roomEditor.addFeature('niche');
 if(name==='room-protrusion')roomEditor.addFeature('protrusion');
 if(name==='add-light')addLight();
 if(name==='add-window'||name==='add-door')addOpening(name==='add-door'?'door':'window');
  if(name==='add-pipe'||name==='add-box')addObstacle(name==='add-pipe'?'pipe':'box');
  if(name==='fit-obstacle-cutout'&&c)fitObstacleCutout(c);
 if(name==='add-brace'&&c)change(()=>{c.rearBraces??=[];const height=Math.min(100,Math.max(10,c.height-(c.plinth||0)-36));let y=Math.max(c.plinth||0,c.height-height-18);for(const brace of [...c.rearBraces].sort((a,b)=>b.y-a.y)){if(y<brace.y+brace.height+10&&y+height>brace.y-10)y=brace.y-height-10;}if(y<(c.plinth||0)){toast('Нет свободного места для поперечины. Измените положение существующих.');return false;}c.rearBraces.push({id:uid('brace'),y,height,materialId:c.materialId});expanded.add('rear-braces');});
 if(name==='add-section-brace'&&c)change(()=>{const s=editableSection();if(!s||c.includeBack!==false||s.node.back!=='braces')return false;s.node.rearBraces??=[];if(s.node.rearBraces.length>=40)return false;const height=Math.min(100,s.height);let y=Math.max(0,s.height-height);for(const b of [...s.node.rearBraces].sort((a,b)=>b.y-a.y))if(y<b.y+b.height+10&&y+height>b.y-10)y=b.y-height-10;if(y<0)throw Error('Нет свободного места для поперечины в секции.');s.node.rearBraces.push({id:uid('brace'),y,height,materialId:c.materialId});expanded.add('section-options');});
 if(name==='add-rod'&&c)change(()=>{const s=editableSection();if(!s||s.node.front==='drawers'||s.node.appliance||s.node.interiorLayout||s.node.internalDrawerCount>0||(s.node.rods||[]).length>=12)return false;const position=findFreeRodPosition(c,project,s.id);if(!position)throw Error('Нет свободного места для штанги в секции.');s.node.rods??=[];s.node.rods.push({id:uid('rod'),...position,diameter:25});expanded.add('section-rods');});
 if(name==='appliance')applianceDialog();
 if(name==='remove-appliance')change(()=>{const s=editableSection();if(s?.node)delete s.node.appliance;});
 if(name==='remove-section-cooktop')change(()=>{const s=editableSection();if(s?.node)delete s.node.cooktop;});
 if((name==='add-section-cooktop'||name==='add-section-sink')&&cabinetMountKind(selectedCabinet())!=='base'){toast(applianceRuleMessage('cooktop'));return;}
 if(name==='add-section-cooktop')change(()=>{const s=editableSection();if(s?.node){s.node.cooktop={width:590,depth:520,height:45,label:translateText('Варочная панель',interfaceLanguage)};expanded.add('section-options');}});
 if(name==='remove-section-sink')change(()=>{const s=editableSection();if(s?.node)delete s.node.sink;});
 if(name==='edit-section-sink')applianceDialog();
 if(name==='add-section-sink')applianceDialog('sink-rectangular');
 if(name==='rename')textDialog('Название проекта',project.name,value=>change(()=>project.name=value));
 if(name==='cabinet-options'&&c)modal('Шкаф',`<div class="menu-actions"><button data-action="rename-cabinet">Переименовать</button><button data-action="duplicate">${icon('copy')}Дублировать</button><button data-action="delete-cabinet" class="danger">${icon('trash')}Удалить шкаф</button></div>`);
 if(name==='rename-cabinet'&&c)textDialog('Название шкафа',c.name,value=>change(()=>c.name=value));
 if(name==='duplicate'&&c){duplicateCabinetAction(c);return;}
 if(name==='delete-cabinet'&&c){deleteCabinet(c.id);closeModal();}
 if(name==='file')modal('Проект',`<div class="menu-actions"><button data-action="save">${icon('download')}Сохранить файл проекта</button><button data-action="import">Открыть файл проекта</button><button data-action="new">${icon('plus')}Новый пустой проект</button><button data-action="example">Открыть пример конструкции</button><button data-action="standards">Материалы и турецкие нормы</button></div>`);
 if(name==='save'){download(JSON.stringify({version:2,application:'ATÖLYE',project},null,2),`${filename()}.json`,'application/json');closeModal();}
 if(name==='file')$('.menu-actions').insertAdjacentHTML('beforeend','<button data-action="prices">Цены и смета</button>');
 if(name==='import'){$('#project-file').click();}
 if(name==='new'){change(()=>{project=createDefaultProject(interfaceLanguage);if(!demoMode)applyApplicationPricing(project);project.name=translateText('Новый проект',interfaceLanguage);project.cabinets=[];cabinetId=null;interiorParentId=null;sectionId=null;mode='room';});closeModal();}
 if(name==='example'){change(()=>{project=createDefaultProject(interfaceLanguage);if(!demoMode)applyApplicationPricing(project);cabinetId=project.cabinets[0]?.id;interiorParentId=null;sectionId=null;mode='cabinet';});closeModal();}
 if(name==='materials')materialsDialog();
 if(name==='add-material')editMaterial(null);
 if(name==='yildiz-gallery')openYildizGalleryModal(preset=>{
  change(()=>{
   const newMat = {
    ...clone(preset),
    id: uid('material'),
    name: translateMaterialName(preset.name, interfaceLanguage),
    type: translateText(preset.type, interfaceLanguage)
   };
   project.materials.push(newMat);
  });
  materialsDialog();
 });
 if(name==='drawing-enable-drilling')change(()=>{project.settings.drilling={...normalizeDrillingSettings(project.settings.drilling),enabled:true};});
 if(name==='drawing-drilling-settings'&&c){factoryCabinetId=c.id;factoryDialog();}
 if(name==='drawing-svg'&&c){const language=project.settings.printLanguage??'tr',svg=selectedDrawingSvg(language),suffix=drawingView==='drilling'?selectedDrillingDrawing(language)?.page.filename:`${drawingView}-${drawingAssemblyPage}.svg`;if(svg)download(svg,`${filename()}-${suffix}`,'image/svg+xml');}
 if(name==='drawing-print'&&c){const language=project.settings.printLanguage??'tr',html=drawingView==='drilling'?drillingDrawings(language).html:generateDrawingHTML(project,{cabinetId:c.id,language});if(html)showPrintPreview('Чертежи',html,drawingView==='drilling'?'drilling-reference':'drawings','Чертежи','Сохранить чертёж HTML');}
 if(name==='cabinet-3d-print'&&c){const language=project.settings.printLanguage??'tr';const snapshot=viewport.captureCabinet3D({cabinetId:c.id,language});const html=generateCabinet3DHTML(project,{...snapshot,language});modal('Печать 3D-вида',`<iframe class="print-3d-preview" title="3D" srcdoc="${esc(html)}"></iframe><div class="print-3d-actions"><button class="button primary" id="print-current-3d">${icon('print')}Печать / PDF</button><button class="button" id="save-current-3d">${icon('download')}Сохранить лист 3D</button></div>`,true);$('#print-current-3d').onclick=()=>printHTML(html);$('#save-current-3d').onclick=()=>download(html,`${filename()}-3d.html`,'text/html;charset=utf-8');}
 if(name==='csv')exportCSV();
 if(name==='factory')factoryDialog();
 if(name==='cutting-print')printHTML(cuttingHTML());
 if(name==='validation'){const content=warnings.length?`<ul class="warning-list">${warnings.map((w,idx)=>`<li class="${w.level}"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;"><span style="flex:1;">${esc(w.message)}</span>${w.fix?`<button type="button" class="button small primary" data-action="apply-quick-fix" data-fix-idx="${idx}" style="white-space:nowrap;padding:4px 10px;font-size:12px;">⚡ ${esc(w.fix.label||'Исправить')}</button>`:''}</div></li>`).join('')}</ul>`:'<p>Габариты, размещение и детали прошли геометрическую проверку.</p>';modal('Проверка конструкции',content);}
 if(name==='standards')modal('Материалы и турецкие нормы',`<p class="hint">Форматы МДФ взяты из турецких каталогов. Зазоры и монтаж выбираются под конкретную фурнитуру и технику.</p>${STANDARDS.map(s=>`<article class="standard"><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p><a href="${esc(s.url)}" target="_blank" rel="noopener">Источник</a></article>`).join('')}<p class="hint">Проект не заменяет испытания готовой мебели и сертификацию TSE.</p>`,true);
 if(name==='help')modal('Три шага к своей конструкции',`<ol class="help-list"><li><strong>Создайте шкаф.</strong> Габариты меняются справа. Щёлкните по секции на схеме.</li><li><strong>Разделите и заполните.</strong> Кнопки над схемой делят и удаляют выбранную секцию. Выбирайте двери, ящики или открытый проём. Перемещение перегородки меняет только два соседних проёма.</li><li><strong>Проверьте и передайте.</strong> Чертежи содержат размеры проёмов, фасадов и деталей. Раскрой и CSV обновляются вместе с конструкцией.</li></ol><p>В помещении выберите стену и добавьте окно, дверь, нишу или выступ кнопками над планом. Окна и двери перемещаются вдоль стены мышью; расстояния видны на плане. Стена перемещается поперёк своей оси, угол — по одной оси; Alt позволяет двигать угол свободно.</p><p class="hint">Для техники создайте открытую секцию и выберите «Глубина, задник и техника». Флажок «Открытый проём до пола» убирает дно и цоколь только здесь. Задние поперечины добавляются отдельно. Размеры и сервисные зазоры задавайте по паспорту своей техники. Ctrl+Z — отмена, Ctrl+S — файл проекта.</p>`);
 if(name==='explode-parts'){inspectionPartId=null;viewport.setOptions({exploded:!viewport.options.exploded,selectedPartId:null});viewport.resetCamera();render();}
 if(name==='clear-part'){inspectionPartId=null;viewport.setOptions({selectedPartId:null});renderProperties();}
 if(name==='inspect-part'&&inspectionPartId)showPart(inspectionPartId);
 if(name==='part-enable-drilling'){change(()=>{project.settings.drilling={...normalizeDrillingSettings(project.settings.drilling),enabled:true};});if($('.modal [data-part-inspection]')&&inspectionPartId)showPart(inspectionPartId);}
 if(name==='close-modal')closeModal();
}
function addOpening(kind){
 if(project.room.windows.length>=30){toast('В проекте уже 30 проёмов');return;}
 if(roomFocus==='corner'&&Number.isInteger(roomEditor.selectedCorner))selectedWall=roomEditor.selectedCorner;
 const length=wallLength(project.room,selectedWall);if(length<100){toast('Для проёма нужна стена длиной хотя бы 100 мм');return;}
 let width=Math.min(kind==='door'?800:1200,length);const sill=kind==='door'?0:Math.min(900,Math.max(0,project.room.height-100));
 const occupied=project.room.windows.filter(w=>(w.wallIndex??legacyWall(w.wall))===selectedWall).map(w=>({start:Math.max(0,w.offset-50),end:Math.min(length,w.offset+w.width+50)})).sort((a,b)=>a.start-b.start);
 const gaps=[];let cursor=0;for(const o of occupied){if(o.start>cursor)gaps.push({start:cursor,end:o.start});cursor=Math.max(cursor,o.end);}if(cursor<length)gaps.push({start:cursor,end:length});
 let gap=gaps.filter(g=>g.end-g.start>=width).sort((a,b)=>Math.abs((a.start+a.end)/2-length/2)-Math.abs((b.start+b.end)/2-length/2))[0];if(!gap){gap=gaps.sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0];if(!gap||gap.end-gap.start<100){toast('На этой стене нет свободного места для нового проёма');return;}width=rounded(Math.min(width,gap.end-gap.start));}
 const w={id:uid(kind),kind,wallIndex:selectedWall,offset:rounded((gap.start+gap.end-width)/2),width,height:Math.min(kind==='door'?2000:1200,project.room.height-sill),sill};
 change(()=>{project.room.windows.push(w);selectedWindowId=w.id;roomFocus='window';});
}
function addCabinetDialog(){
 if(project.cabinets.length>=150){toast('В проекте уже 150 шкафов');return;}
 const anchor=selectedCabinet(),ceiling=project.room.height-(project.room.installationClearance?.ceiling??0);
 const bodyStock=project.materials.find(m=>m.thickness===18)??project.materials[0],floorHeightMin=Math.ceil(100+2*(bodyStock?.thickness??18)+50);
 const aboveHeight=anchor?Math.min(720,ceiling-anchor.y-anchor.height):0;
 modal('Добавить шкаф',`<form id="cabinet-form"><label class="field"><span>Тип шкафа</span><select name="type"><option value="floor">Напольный шкаф (гардеробная)</option><option value="base">Кухонная тумба</option><option value="corner-base">Угловая тумба (кухня)</option><option value="wall">Навесной шкаф</option><option value="corner-wall">Угловой навесной шкаф</option><option value="corner-tall">Угловой шкаф (гардеробная)</option><option value="mezzanine" ${!anchor||aboveHeight<100?'disabled':''}>Антресоль над выбранным шкафом</option></select></label><div class="fields three">${[['width','Ширина',900,6000],['height','Высота',2200,6000],['depth','Глубина',620,3000]].map(([field,label,value,max])=>`<label class="field"><span>${label}, мм</span><input name="${field}" type="number" min="100" max="${max}" value="${value}" required></label>`).join('')}</div><p class="hint" id="cabinet-placement-hint"></p><button class="button primary full">Добавить шкаф</button></form>`);
 const form=$('#cabinet-form');
 const selectType=()=>{const type=form.elements.type.value,preset=type==='wall'?{width:800,height:Math.min(720,ceiling),depth:340}:type==='corner-wall'?{width:600,height:Math.min(720,ceiling),depth:340}:type==='base'?{width:800,height:860,depth:580}:type==='corner-base'?{width:1000,height:860,depth:580}:type==='corner-tall'?{width:1000,height:2200,depth:580}:type==='mezzanine'?{width:anchor.width,height:aboveHeight,depth:anchor.depth}:{width:900,height:2200,depth:620};for(const field of ['width','height','depth'])form.elements[field].value=Math.floor(preset[field]);form.elements.height.min=['floor','base','corner-base','corner-tall'].includes(type)?floorHeightMin:100;form.elements.width.disabled=type==='mezzanine';form.elements.depth.disabled=type==='mezzanine';$('#cabinet-placement-hint').textContent=type==='mezzanine'?translateText('Антресоль привязана к основному шкафу: ширина, глубина и положение зависят от него.',interfaceLanguage):['wall','corner-wall'].includes(type)?'Высота установки навесного шкафа — 1510 мм или ниже, если ограничивает потолок.':type==='corner-base'?'Угловая тумба с глухой планкой 600 мм для перпендикулярного примыкания кухонной тумбы.':'Шкаф размещается в свободном месте на полу. Секции можно заполнить после добавления.';};
 form.elements.type.onchange=selectType;selectType();
 form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;const type=form.elements.type.value,values=Object.fromEntries(['width','height','depth'].map(field=>[field,type==='mezzanine'&&['width','depth'].includes(field)?anchor[field]:form.elements[field].valueAsNumber]));const saved=change(()=>{
  ensureDefaultBackMaterial(project);
  const isWall=['wall','corner-wall','mezzanine'].includes(type),isBase=['base','corner-base'].includes(type),isCorner=['corner-base','corner-wall','corner-tall'].includes(type);
  const defaultName=type==='mezzanine'?`${translateText('Антресоль',interfaceLanguage)} (${anchor?.name||project.cabinets.length+1})`:type==='base'?translateText('Кухонная тумба',interfaceLanguage):type==='corner-base'?translateText('Угловая тумба',interfaceLanguage):type==='corner-wall'?translateText('Угловой навесной шкаф',interfaceLanguage):type==='corner-tall'?translateText('Угловой шкаф',interfaceLanguage):translateText(`Шкаф ${project.cabinets.length+1}`,interfaceLanguage);
  const engineType=['base','corner-base','corner-wall','corner-tall','wall','tall'].includes(type)?type:(type==='mezzanine'?'wall':'tall');
  const next=createCabinet(engineType,project,{...values,name:defaultName,shelves:isWall?2:isBase?1:0,plinth:isWall?0:100,parentId:type==='mezzanine'?anchor.id:undefined,...(isBase?{countertop:true}:{}),...(isCorner?{cornerType:'blind',blindSide:'right',blindWidth:type==='corner-wall'?340:600}:{})});next.layout={...createSection('open'),doors:isCorner?1:2,shelves:isWall?2:isBase?1:0};
  if(type==='mezzanine'){if(!anchor)throw Error('Выберите шкаф для установки антресоли.');Object.assign(next,{parentId:anchor.id,width:anchor.width,depth:anchor.depth,x:anchor.x,z:anchor.z,y:anchor.y+anchor.height,rotation:anchor.rotation||0,...(anchor.cutout?{cutout:clone(anchor.cutout)}:{})});}
  const invalid=validateProject({...project,cabinets:[next]}).find(w=>w.level==='error'&&w.cabinetId===next.id);if(invalid)throw Error(invalid.message);
  if(!canPlaceCabinet(next,project))throw Error('Размещение пересекает другой шкаф или нарушает границы помещения и монтажные отступы.');
  project.cabinets.push(next);cabinetId=next.id;interiorParentId=null;sectionId=next.layout.id;mode='cabinet';
 });if(saved)closeModal();};
}
function replaceMaterialDialog(id){
 const m=project.materials.find(material=>material.id===id);
 if(!m)return;
 const usage=getMaterialUsage(project,id);
 const names=[...new Set(usage.map(u=>u.cabinetName))].map(name=>`«${name}»`).join(', ');
 const remaining=project.materials.filter(material=>material.id!==id);
 modal(translateText('Замена материала',interfaceLanguage),`
  <form id="replace-material-form">
   <p class="hint">${translateText('Материал используется в шкафах',interfaceLanguage)}: <strong>${esc(names)}</strong>.</p>
   <label class="field">
    <span>${translateText('Заменить на материал',interfaceLanguage)}</span>
    <select name="replacementId" required>
     ${remaining.map(mat=>`<option value="${esc(mat.id)}">${esc(translateMaterialName(mat.name,interfaceLanguage))} (${mat.thickness} мм)</option>`).join('')}
    </select>
   </label>
   <button class="button primary full" style="margin-top:14px">${icon('trash')}${translateText('Заменить и удалить',interfaceLanguage)}</button>
   <button type="button" class="button full quiet" data-action="materials" style="margin-top:7px">${translateText('Отмена',interfaceLanguage)}</button>
  </form>
 `);
 const form=$('#replace-material-form');
 if(form){
  form.onsubmit=e=>{
   e.preventDefault();
   const data=new FormData(form);
   const replacementId=data.get('replacementId');
   if(!replacementId)return;
   const saved=change(()=>{
    return deleteMaterial(project,id,replacementId);
   });
   if(saved)materialsDialog();
  };
 }
}
function deleteMaterialAction(id){
 const m=project.materials.find(material=>material.id===id);
 if(!m)return;
 if(project.materials.length<=1){
  toast(translateText('В проекте должен оставаться хотя бы один материал.',interfaceLanguage));
  return;
 }
 const usage=getMaterialUsage(project,id);
 if(usage.length>0){
  replaceMaterialDialog(id);
  return;
 }
 const saved=change(()=>{
  return deleteMaterial(project,id);
 });
 if(saved)materialsDialog();
}
function openYildizGalleryModal(onSelectMaterial){
 let currentPill='all';
 let currentQuery='';

 function renderCards(){
  const q=currentQuery.trim().toLowerCase();
  const list=MATERIAL_PRESETS.filter(p=>{
   if(currentPill==='wood'){
    if(p.category!=='wood'&&!p.grain)return false;
   }else if(currentPill==='marble-stone'){
    if(p.category!=='marble')return false;
   }else if(currentPill==='concrete-textile'){
    if(p.category!=='concrete'&&p.category!=='metal'&&p.category!=='textile')return false;
   }else if(currentPill==='kapak-matt'){
    if(!isKapakMatt(p))return false;
   }else if(currentPill==='kapak-gloss'){
    if(!isKapakGloss(p))return false;
   }
   if(q){
    const locName=translateMaterialName(p.name,interfaceLanguage).toLowerCase();
    const rawName=(p.name||'').toLowerCase();
    const decorCode=(p.decorCode||'').toLowerCase();
    const type=(p.type||'').toLowerCase();
    if(!locName.includes(q)&&!rawName.includes(q)&&!decorCode.includes(q)&&!type.includes(q))return false;
   }
   return true;
  });

  const countEl=$('#yildiz-gallery-count');
  if(countEl)countEl.textContent=`${translateText('Найдено декоров:',interfaceLanguage)} ${list.length}`;

  const gridEl=$('#yildiz-cards-grid');
  if(!gridEl)return;

  if(list.length===0){
   gridEl.innerHTML=`<div class="yildiz-empty">${translateText('Декоры не найдены',interfaceLanguage)}</div>`;
   return;
  }

  const unit=interfaceLanguage==='ru'?'мм':'mm';
  gridEl.innerHTML=list.map(p=>{
   const originalIdx=MATERIAL_PRESETS.indexOf(p);
   const name=translateMaterialName(p.name,interfaceLanguage);
   const badgeCls=p.collection==='front-panel'?'badge-kapak':'badge-mdflam';
   const badgeText=p.collection==='front-panel'?'Kapak Panel':'MDFLAM';
   const localSrc=p.decorCode?`./assets/textures/${esc(p.decorCode)}.jpg`:p.textureUrl;
   const cdnSrc=p.previewUrl||(p.decorCode?`https://app.yildiz.com/Bundles/onizleme/${esc(p.decorCode)}.jpg`:null);
   const fallbackColor=p.color||'#cbd5e1';
   return `<div role="button" tabindex="0" class="yildiz-card" data-preset-idx="${originalIdx}" title="${esc(name)}"><div class="yildiz-card-img-wrap" style="background-color:${esc(fallbackColor)};background-image:url('${esc(localSrc)}');"><img src="${esc(localSrc)}" loading="lazy" alt="${esc(name)}" onerror="if(!this._triedCdn&&'${esc(cdnSrc||'')}'&&this.src!=='${esc(cdnSrc||'')}'){this._triedCdn=true;this.src='${esc(cdnSrc||'')}';}else{this.style.opacity='0';}">${p.decorCode?`<span class="yildiz-card-code">${esc(p.decorCode)}</span>`:''}</div><div class="yildiz-card-info"><div class="yildiz-card-name">${esc(name)}</div><div class="yildiz-card-format">${p.sheetWidth} × ${p.sheetHeight} ${unit}, ${p.thickness} ${unit}</div><span class="yildiz-card-collection-badge ${badgeCls}">${badgeText}</span></div></div>`;
  }).join('');
 }

 const pills=[
  {id:'all',label:'Все'},
  {id:'wood',label:'Дерево'},
  {id:'marble-stone',label:'Мрамор и камень'},
  {id:'concrete-textile',label:'Бетон и текстиль'},
  {id:'kapak-matt',label:'Kapak Panel (матовые)'},
  {id:'kapak-gloss',label:'Kapak Panel (глянцевые)'}
 ];

 const pillsHtml=pills.map(p=>`<button type="button" class="yildiz-pill ${p.id==='all'?'active':''}" data-pill-id="${p.id}">${esc(translateText(p.label,interfaceLanguage))}</button>`).join('');

 const html=`<div class="yildiz-gallery-container"><div class="yildiz-gallery-header"><input type="search" class="yildiz-gallery-search" id="yildiz-gallery-search" placeholder="${esc(translateText('Поиск декора по названию или коду…',interfaceLanguage))}"><div class="yildiz-filter-pills" id="yildiz-filter-pills">${pillsHtml}</div><div class="yildiz-gallery-count" id="yildiz-gallery-count"></div></div><div class="yildiz-cards-grid" id="yildiz-cards-grid"></div></div>`;

 modal(translateText('Каталог декоров и текстур Yıldız Entegre',interfaceLanguage),html,true);
 renderCards();

 const searchEl=$('#yildiz-gallery-search');
 if(searchEl){
  searchEl.addEventListener('input',e=>{
   currentQuery=e.target.value;
   renderCards();
  });
 }

 const pillsWrap=$('#yildiz-filter-pills');
 if(pillsWrap){
  pillsWrap.addEventListener('click',e=>{
   const btn=e.target.closest('.yildiz-pill');
   if(!btn)return;
   pillsWrap.querySelectorAll('.yildiz-pill').forEach(b=>b.classList.remove('active'));
   btn.classList.add('active');
   currentPill=btn.dataset.pillId;
   renderCards();
  });
 }

 const gridEl=$('#yildiz-cards-grid');
 if(gridEl){
  gridEl.addEventListener('click',e=>{
   const card=e.target.closest('.yildiz-card');
   if(!card)return;
   const idx=Number(card.dataset.presetIdx);
   const preset=MATERIAL_PRESETS[idx];
   if(!preset)return;
   const localized=localizeMaterialPreset(preset,interfaceLanguage);
   closeModal();
   if(typeof onSelectMaterial==='function')onSelectMaterial(localized);
  });
  gridEl.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){
    const card=e.target.closest('.yildiz-card');
    if(card){
     e.preventDefault();
     card.click();
    }
   }
  });
 }
}
function materialsDialog(){
 const canDelete=project.materials.length>1;
 modal('Материалы',`<div class="materials-list">${project.materials.map(m=>`<div class="materials-list-row"><button class="materials-list-item" data-material="${esc(m.id)}"><i style="${materialSwatchStyle(m)}"></i><span><strong>${esc(m.name)}</strong><small>${m.thickness} мм · лист ${m.sheetWidth} × ${m.sheetHeight}${m.grain?' · текстура':''}</small></span></button><button type="button" class="icon-button danger" data-delete-material="${esc(m.id)}" ${canDelete?'':'disabled'} title="${esc(translateText(canDelete?'Удалить материал':'В проекте должен оставаться хотя бы один материал',interfaceLanguage))}">${icon('trash')}</button></div>`).join('')}</div><button class="button full" data-action="add-material">${icon('plus')}Добавить материал</button><button type="button" class="button full yildiz-gallery-btn" data-action="yildiz-gallery" style="background:#1e3a8a;color:#fff;margin-top:8px">${icon('cube')} ${translateText('Каталог декоров и текстур Yıldız Entegre',interfaceLanguage)}</button><a href="https://www.yildizentegre.com/tr/kartela" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;margin-top:10px;color:var(--accent,#2563eb);text-decoration:none">${icon('cube')}${translateText('Каталог Yıldız Entegre',interfaceLanguage)} ↗</a>`);
}
function materialPresetOptionsMarkup(query=''){
 const needle=query.trim().toLowerCase();
 const groups=[
  {label:translateText('Основные пресеты',interfaceLanguage),items:[]},
  {label:translateText('Yıldız MDFLAM (2100 × 2800 мм)',interfaceLanguage),items:[]},
  {label:translateText('Yıldız Kapak Panel · Матовые (1220 × 2800 мм)',interfaceLanguage),items:[]},
  {label:translateText('Yıldız Kapak Panel · Глянцевые (1220 × 2800 мм)',interfaceLanguage),items:[]},
 ];
 MATERIAL_PRESETS.forEach((mat,i)=>{
  if(needle){
   const localized=translateMaterialName(mat.name,interfaceLanguage).toLowerCase();
   const code=(mat.decorCode||'').toLowerCase();
   const raw=(mat.name||'').toLowerCase();
   if(!localized.includes(needle)&&!code.includes(needle)&&!raw.includes(needle))return;
  }
  if(i<DEFAULT_MATERIAL_PRESETS.length)groups[0].items.push({mat,i});
  else if(mat.type.includes('глянцевым')||mat.decorCode?.startsWith('HG_'))groups[3].items.push({mat,i});
  else if(mat.type.includes('матовым')||mat.decorCode?.startsWith('MAT_')||mat.decorCode?.startsWith('L_'))groups[2].items.push({mat,i});
  else groups[1].items.push({mat,i});
 });
 return groups.filter(g=>g.items.length>0).map(g=>`<optgroup label="${esc(g.label)}">${g.items.map(({mat,i})=>`<option value="${i}">${esc(translateMaterialName(mat.name,interfaceLanguage))}</option>`).join('')}</optgroup>`).join('');
}
function editMaterial(id, initialPreset = null){
 const old=project.materials.find(material=>material.id===id);
 const base=old?clone(old):{id:uid('material'),name:translateText('Новый МДФ',interfaceLanguage),type:'MDF',color:'#c5b38e',thickness:18,sheetWidth:2100,sheetHeight:2800,grain:false,edgeBand:1};
 const m=initialPreset?{
  ...base,
  ...clone(initialPreset),
  name:translateMaterialName(initialPreset.name,interfaceLanguage),
  type:translateText(initialPreset.type,interfaceLanguage)
 }:base;
 const canDelete=project.materials.length>1;
 const linkHref=m.sourceUrl||'https://www.yildizentegre.com/tr/kartela';
 const linkLabel=m.sourceUrl?'Смотреть на сайте':'Каталог Yıldız Entegre';
 modal('Материал и цвет',`<form id="material-form"><button type="button" class="button full yildiz-gallery-btn" id="material-yildiz-gallery-btn" style="background:#1e3a8a;color:#fff;margin-bottom:12px">${icon('cube')} ${translateText('Каталог декоров и текстур Yıldız Entegre',interfaceLanguage)}</button><div class="field"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span>${translateText(old?'Выбрать из каталога':'Начать с пресета',interfaceLanguage)}</span><a href="${esc(linkHref)}" id="material-source-link" target="_blank" rel="noopener" style="font-size:12px;color:var(--accent,#2563eb);text-decoration:none;display:inline-flex;align-items:center;gap:4px">${translateText(linkLabel,interfaceLanguage)} ↗</a></div><input type="search" id="material-preset-search" placeholder="${esc(translateText('Поиск декора (название или код)…',interfaceLanguage))}"><select name="preset"><option value="">${translateText(old?'Не изменять':'Свой материал',interfaceLanguage)}</option>${materialPresetOptionsMarkup()}</select></div><label class="field"><span>Название</span><input name="name" value="${esc(m.name)}" maxlength="120" required></label><div class="fields"><label class="field"><span>Цвет</span><input name="color" type="color" value="${esc(m.color)}"></label><label class="field"><span>Толщина, мм</span><input name="thickness" type="number" value="${m.thickness}" min="1" max="60" step=".1" required></label></div><div class="fields"><label class="field"><span>Лист X, мм</span><input name="sheetWidth" type="number" value="${m.sheetWidth}" min="100" max="10000" required></label><label class="field"><span>Лист Y, мм</span><input name="sheetHeight" type="number" value="${m.sheetHeight}" min="100" max="10000" required></label></div><label class="check-row"><input name="grain" type="checkbox" ${m.grain?'checked':''}>Текстура вдоль высоты детали</label><button class="button primary full">Сохранить материал</button>${old?`<button type="button" class="button full danger" data-delete-material="${esc(id)}" ${canDelete?'':'disabled'} style="margin-top:8px" title="${esc(translateText(canDelete?'Удалить материал':'В проекте должен оставаться хотя бы один материал',interfaceLanguage))}">${icon('trash')}${translateText('Удалить материал',interfaceLanguage)}</button>`:''}</form>`);
 const form=$('#material-form');
 const galleryBtn=$('#material-yildiz-gallery-btn');
 if(galleryBtn){
  galleryBtn.onclick=()=>{
   openYildizGalleryModal(preset=>{
    editMaterial(id, preset);
   });
  };
 }
 const searchInput=$('#material-preset-search');
 if(searchInput){
  searchInput.addEventListener('input',e=>{
   const query=e.target.value;
   const current=form.elements.preset.value;
   form.elements.preset.innerHTML=`<option value="">${translateText(old?'Не изменять':'Свой материал',interfaceLanguage)}</option>${materialPresetOptionsMarkup(query)}`;
   if(current)form.elements.preset.value=current;
  });
 }
 form.elements.preset?.addEventListener('change',e=>{
  const link=$('#material-source-link');
  if(e.target.value===''){
   if(link){
    link.href=m.sourceUrl||'https://www.yildizentegre.com/tr/kartela';
    link.textContent=`${translateText(m.sourceUrl?'Смотреть на сайте':'Каталог Yıldız Entegre',interfaceLanguage)} ↗`;
   }
   return;
  }
  const preset=localizeMaterialPreset(MATERIAL_PRESETS[Number(e.target.value)],interfaceLanguage);
  Object.assign(m,{
   type:translateText(preset.type,interfaceLanguage),
   edgeBand:preset.edgeBand,
   manufacturer:preset.manufacturer,
   decorCode:preset.decorCode,
   sourceUrl:preset.sourceUrl,
   textureUrl:preset.textureUrl,
   previewUrl:preset.previewUrl,
   collection:preset.collection,
   category:preset.category
  });
  for(const field of ['name','color','thickness','sheetWidth','sheetHeight'])form.elements[field].value=field==='name'?translateMaterialName(preset[field],interfaceLanguage):preset[field];
  form.elements.grain.checked=preset.grain;
  if(link&&preset.sourceUrl){
   link.href=preset.sourceUrl;
   link.textContent=`${translateText('Смотреть на сайте',interfaceLanguage)} ↗`;
  }
 });
 form.onsubmit=e=>{
  e.preventDefault();if(!form.reportValidity())return;const data=new FormData(form);
  const saved=change(()=>{
   const next={...m,name:String(data.get('name')).trim(),color:data.get('color'),thickness:Number(data.get('thickness')),sheetWidth:Number(data.get('sheetWidth')),sheetHeight:Number(data.get('sheetHeight')),grain:data.has('grain')};
   if(old&&['thickness','sheetWidth','sheetHeight'].some(key=>next[key]!==old[key]))delete next.pricePerSheet;
   if(old){const current=project.materials.find(material=>material.id===id);if(next.pricePerSheet===undefined)delete current.pricePerSheet;Object.assign(current,next);project.cabinets.forEach(c=>{if(c.backMaterialId===id)c.backThickness=next.thickness;if(c.drawerBottomMaterialId===id)c.drawerBottomThickness=next.thickness;});}else project.materials.push(next);
  });if(saved)materialsDialog();
 };
}
function edgeSummaryMarkup(list,language=interfaceLanguage){const summary=getEdgeBandingSummary(list),t=text=>esc(translatePrintText(text,language));return `<section class="edge-summary" data-i18n="off"><p><strong>${t('Всего кромки')}: ${fmt(summary.lengthMeters,3)} ${t('м')}</strong></p>${summary.groups.length?`<table><thead><tr><th>${t('Кромка по материалам')}</th><th>${t('Толщина мм')}</th><th>${t('Кромка, м')}</th></tr></thead><tbody>${summary.groups.map(group=>`<tr><td>${esc(translateMaterialName(project.materials.find(material=>material.id===group.materialId)?.name??'',language))}</td><td>${fmt(group.thickness,2)}</td><td>${fmt(group.lengthMeters,3)}</td></tr>`).join('')}</tbody></table>`:''}</section>`;}
function partsTable(list){return `<table><thead><tr><th>№</th><th>Деталь</th><th>Заготовка без кромки, мм</th><th>Материал</th><th>Количество</th><th>Кромка, мм</th><th>Кромка, м</th></tr></thead><tbody>${list.map(p=>`<tr><td>${productionPartCode(parts.findIndex(part=>part.id===p.id))}</td><td data-i18n="off">${esc(translatePrintText(p.name,interfaceLanguage))}${p.outline?' · '+esc(translatePrintText('с вырезом',interfaceLanguage)):''}</td><td>${fmt(p.width,3)} × ${fmt(p.height,3)} × ${p.thickness}</td><td data-i18n="off">${esc(translateMaterialName(project.materials.find(m=>m.id===p.materialId)?.name,interfaceLanguage))}</td><td>${p.quantity??1}</td><td data-i18n="off">${esc(describePartEdges(p,{language:interfaceLanguage}))}</td><td>${fmt(getPartEdgeBanding(p).lengthMeters,3)}</td></tr>`).join('')}</tbody></table>${edgeSummaryMarkup(list)}`;}
const inspectionWords={
 ru:{selected:'Выбрана деталь',select:'Нажмите на деталь в 3D',hint:'Клик — выбрать деталь. Двойной клик — открыть схему. Раздвижение не меняет размеры.',clear:'Снять выделение',finished:'Готовая деталь с кромкой',raw:'Заготовка без кромки',detail:'Деталь',drilling:'Сверловка',nearest:'От ближайших краёв',depth:'Глубина',setup:'Задать в мастерской',off:'Сверловка корпуса выключена.',blocked:'Сверловка заблокирована: исправьте ошибки.',none:'Для этой детали автоматических отверстий нет.',enable:'Включить сверловку корпуса',open:'Размеры и карта сверловки',all:'Все отверстия — в полной карте',save:'Сохранить схему SVG',edge:'Кромки',unit:'мм'},
 tr:{selected:'Seçilen parça',select:'3B görünümde bir parçaya tıklayın',hint:'Tıklayın: parça seçimi. Çift tıklayın: delik şeması. Ayırma ölçüleri değiştirmez.',clear:'Seçimi kaldır',finished:'Bantlı bitmiş parça',raw:'Bantsız ham parça',detail:'Parça',drilling:'Delikler',nearest:'En yakın kenarlardan',depth:'Derinlik',setup:'Atölyede belirleyin',off:'Gövde delikleri kapalı.',blocked:'Delikler engellendi: hataları düzeltin.',none:'Bu parçada otomatik delik yok.',enable:'Gövde deliklerini etkinleştir',open:'Ölçüler ve delik şeması',all:'Tüm delikler tam şemadadır',save:'SVG şemasını kaydet',edge:'Bantlar',unit:'mm'},
 en:{selected:'Selected part',select:'Click a part in 3D',hint:'Click to select a part. Double-click to open its diagram. Exploding does not change dimensions.',clear:'Clear selection',finished:'Finished part with banding',raw:'Unbanded cut blank',detail:'Part',drilling:'Drilling',nearest:'From nearest edges',depth:'Depth',setup:'Set in the workshop',off:'Carcass drilling is disabled.',blocked:'Drilling is blocked: correct the errors.',none:'This part has no automatically calculated holes.',enable:'Enable carcass drilling',open:'Dimensions and drilling map',all:'All holes are in the full map',save:'Save SVG map',edge:'Edges',unit:'mm'}
};
function partInspection(id){const cacheKey=`${getDocumentInfo(project).id}:${id}:${interfaceLanguage}`;if(inspectionCache?.key!==cacheKey)inspectionCache={key:cacheKey,value:inspectCabinetPart(project,id,{language:interfaceLanguage})};return inspectionCache.value;}
function inspectionNumber(value){return Number(value).toLocaleString({ru:'ru-RU',tr:'tr-TR',en:'en-US'}[interfaceLanguage],{maximumFractionDigits:3});}
function partDimensionsMarkup(info){const w=inspectionWords[interfaceLanguage],size=d=>`${inspectionNumber(d.width)} × ${inspectionNumber(d.height)} × ${inspectionNumber(d.thickness)} ${w.unit}`;return `<div class="dimension-list"><div><strong>${w.finished}</strong><span data-inspection-finished="true">${size(info.dimensions.finished)}</span></div><div><strong>${w.raw}</strong><span data-inspection-raw="true">${size(info.dimensions.raw)}</span></div></div>`;}
function drillingCountMarkup(){
 const value=normalizeDrillingSettings(project.settings.drilling).screwsPerJoint;
 const w={ru:['Конфирматы на соединение','Автоматически по шагу','2 на соединение'],tr:['Birleşim başına konfirmat','Aralığa göre otomatik','Birleşim başına 2'],en:['Confirmats per joint','Automatic by spacing','2 per joint']}[interfaceLanguage];
 return `<label class="field drilling-count-field" data-i18n="off"><span>${w[0]}</span><select data-drilling="screwsPerJoint"><option value="auto" ${value==='auto'?'selected':''}>${w[1]}</option><option value="2" ${value===2?'selected':''}>${w[2]}</option></select></label>`;
}
function drillingMeasurementMarkup(){
 const checked=normalizeDrillingSettings(project.settings.drilling).measureFromFinishedEdge===true;
 const w={ru:['Размеры сверловки с учётом кромки','Включено: от готового края. Выключено: от заготовки.'],tr:['Delik ölçüleri kenar bandı dahil','Açık: bitmiş kenardan. Kapalı: ham parçadan.'],en:['Drilling dimensions include edge banding','On: from the finished edge. Off: from the raw blank.']}[interfaceLanguage];
 return `<div data-i18n="off"><label class="check-row"><input type="checkbox" data-drilling="measureFromFinishedEdge" ${checked?'checked':''}>${w[0]}</label><p class="hint">${w[1]}</p></div>`;
}
function partDrillingStatus(info){const w=inspectionWords[interfaceLanguage];if(info.rearFastening?.method==='nail')return `<p class="hint" data-i18n="off">${esc(translatePrintText('ДВП 3 мм: гвозди, без сверловки.',interfaceLanguage))}</p>`;if(!info.drilling.enabled)return `<p class="hint">${w.off}</p><button class="button full" data-action="part-enable-drilling">${w.enable}</button>`;if(!info.drilling.valid)return `<div class="notice error"><p>${w.blocked}</p><ul>${info.drilling.errors.map(error=>`<li>${esc(error.message)}</li>`).join('')}</ul></div>`;return info.operations.length?'':`<p class="hint">${w.none}</p>`;}
const partEdgeWords={
 ru:{title:'Кромки этой детали',note:'Отметьте края, которые нужно оклеить. Толщина берётся из настройки шкафа.',reset:'Вернуть автоматические кромки',custom:'Настроены вручную',auto:'Автоматически',top:'Сверху',bottom:'Снизу',front:'Спереди',rear:'Сзади',left:'Слева',right:'Справа'},
 tr:{title:'Bu parçanın kenar bantları',note:'Bantlanacak kenarları işaretleyin. Kalınlık dolap ayarından alınır.',reset:'Otomatik bantlara dön',custom:'Elle ayarlandı',auto:'Otomatik',top:'Üst',bottom:'Alt',front:'Ön',rear:'Arka',left:'Sol',right:'Sağ'},
 en:{title:'Edge banding for this part',note:'Tick the edges to band. Thickness comes from the cabinet setting.',reset:'Restore automatic banding',custom:'Set manually',auto:'Automatic',top:'Top',bottom:'Bottom',front:'Front',rear:'Rear',left:'Left',right:'Right'}
};
function partBandThickness(id,side){
 const info=partInspection(id),cabinet=project.cabinets.find(c=>c.id===info?.cabinetId),stock=project.materials.find(m=>m.id===info?.sourcePart.materialId);
 return [info?.sourcePart.edges?.[side],cabinet?.edgeBand,stock?.edgeBand,1].find(value=>Number.isFinite(value)&&value>0)??1;
}
function partEdgeEditorMarkup(info){
 const w=partEdgeWords[interfaceLanguage],orientation=info.sourcePart.orientation;
 const names=orientation==='horizontal'?{top:'rear',bottom:'front',left:'left',right:'right'}:orientation==='vertical-depth'?{top:'top',bottom:'bottom',left:'front',right:'rear'}:{top:'top',bottom:'bottom',left:'left',right:'right'};
 const custom=Boolean(getPartEdgeBandingOverride(project,info.sourcePartId));
 return `<section class="part-edge-editor" data-i18n="off" data-part-edge-editor="${esc(info.sourcePartId)}"><div class="part-edge-heading"><strong>${w.title}</strong><small>${custom?w.custom:w.auto}</small></div><div class="part-edge-scheme" role="group" aria-label="${w.title}">${['top','bottom','left','right'].map(side=>`<label class="edge-choice edge-choice-${side}"><input type="checkbox" data-part-edge="${side}" data-part-edge-id="${esc(info.sourcePartId)}" ${info.sourcePart.edges[side]>0?'checked':''}><span>${w[names[side]]}</span></label>`).join('')}<div class="edge-panel ${['top','bottom','left','right'].filter(side=>info.sourcePart.edges[side]>0).map(side=>'band-'+side).join(' ')}" aria-hidden="true"><span>${info.partCode}</span></div></div><p class="hint">${w.note}</p><button class="text-button" data-part-edge-reset="${esc(info.sourcePartId)}" ${custom?'':'disabled'}>${w.reset}</button></section>`;
}
function updatePartEdges(id,edges){
 const panel=$('.modal [data-part-inspection]'),reopen=Boolean(panel&&inspectionPartId===id),initialView=panel?.querySelector('[data-inspection-view].active')?.dataset.inspectionView??'drilling';
 const initialZoom=reopen&&partZoom?{scale:partZoom.scale,left:partZoom.viewport.scrollLeft,top:partZoom.viewport.scrollTop}:null,bodyScroll=$('.modal-body')?.scrollTop??0;
 const saved=change(()=>{setPartEdgeBanding(project,id,edges);});
 if(saved&&reopen){if(refreshPartModal)refreshPartModal();else{showPart(id,{initialView,initialZoom});$('.modal-body').scrollTop=bodyScroll;}}
}
function partInspectorMarkup(){const w=inspectionWords[interfaceLanguage],info=inspectionPartId?partInspection(inspectionPartId):null;
 if(!info)return `<section id="part-inspector" class="part-inspector" data-i18n="off"><h2>${w.select}</h2><p class="hint">${w.hint}</p><div class="part-list">${parts.filter(p=>p.cabinetId===cabinetId).map(p=>`<button data-inspect-part="${esc(p.id)}">${productionPartCode(parts.findIndex(item=>item.id===p.id))} · ${esc(translatePrintText(p.name,interfaceLanguage))}</button>`).join('')}</div></section>`;
 const stock=project.materials.find(m=>m.id===info.sourcePart.materialId);
 return `<section id="part-inspector" class="part-inspector" data-i18n="off" data-part-id="${esc(info.sourcePartId)}" data-part-code="${info.partCode}" data-raw-width="${info.dimensions.raw.width}" data-raw-height="${info.dimensions.raw.height}" data-raw-thickness="${info.dimensions.raw.thickness}"><span class="eyebrow">${w.selected} · ${info.partCode}</span><h2>${esc(info.name)}</h2>${partDimensionsMarkup(info)}${partEdgeEditorMarkup(info)}<p class="hint">${esc(translateMaterialName(stock?.name??'',interfaceLanguage))}</p>${info.drilling.enabled?drillingCountMarkup()+drillingMeasurementMarkup():''}<div class="inspection-preview" data-inspection-open="${esc(info.sourcePartId)}">${createPartInspectionSvg(info,{markerId:inspectionMarkerId,allHoles:true})}</div><button class="button full" data-action="inspect-part">${w.open}</button>${partDrillingStatus(info)}<button class="button full" data-action="clear-part">${w.clear}</button></section>`;
}
function showPart(id,{initialView='drilling',initialZoom=null}={}){let info=partInspection(id);if(!info)return;if(inspectionPartId!==id)inspectionMarkerId=null;inspectionPartId=id;const w=inspectionWords[interfaceLanguage];
 const renderMap=(view='drilling',keepZoom=false)=>{
  const zoomState=keepZoom&&partZoom?{scale:partZoom.scale,left:partZoom.viewport.scrollLeft,top:partZoom.viewport.scrollTop}:null;
  info=partInspection(id);const drilling=view==='drilling',svg=drilling?createPartInspectionSvg(info,{markerId:inspectionMarkerId,allHoles:true}):createPartSvg(info.part,project,{language:interfaceLanguage});
  modal(`${info.partCode} · ${info.name}`,`<div class="part-inspection-modal" data-part-inspection="${info.partCode}">${partDimensionsMarkup(info)}${partEdgeEditorMarkup(info)}${info.drilling.enabled?drillingCountMarkup()+drillingMeasurementMarkup():''}<div class="drawing-views"><button data-inspection-view="detail" class="${drilling?'':'active'}">${w.detail}</button><button data-inspection-view="drilling" class="${drilling?'active':''}">${w.drilling}</button></div>${drawingZoomMarkup(svg)}<div data-inspection-status>${drilling?partDrillingStatus(info):`<p class="hint" data-i18n="off">${w.edge}: ${esc(describePartEdges(info.part,{language:interfaceLanguage}))}</p>`}</div><button class="button full" id="save-part">${icon('download')}${w.save}</button></div>`,true);
  partZoom=new DrawingZoom($('.part-inspection-modal'));
  if(zoomState){partZoom.zoom(zoomState.scale);partZoom.viewport.scrollLeft=zoomState.left;partZoom.viewport.scrollTop=zoomState.top;}
  for(const button of document.querySelectorAll('[data-inspection-view]'))button.onclick=()=>renderMap(button.dataset.inspectionView);
  const bindMarkers=()=>{for(const marker of $('.part-inspection-modal').querySelectorAll('[data-inspection-marker]')){
   const select=()=>{inspectionMarkerId=marker.dataset.inspectionMarker;renderProperties();renderMap('drilling',true);};
   marker.onclick=select;marker.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};
  }};bindMarkers();
  refreshPartModal=()=>{
   info=partInspection(id);const root=$('.part-inspection-modal');if(!info||!root)return;
   root.querySelector('.dimension-list').outerHTML=partDimensionsMarkup(info);
   for(const input of root.querySelectorAll('[data-part-edge]'))input.checked=info.sourcePart.edges[input.dataset.partEdge]>0;
   const editor=root.querySelector('[data-part-edge-editor]'),custom=Boolean(getPartEdgeBandingOverride(project,id));
   editor.querySelector('.part-edge-heading small').textContent=custom?partEdgeWords[interfaceLanguage].custom:partEdgeWords[interfaceLanguage].auto;editor.querySelector('[data-part-edge-reset]').disabled=!custom;
   editor.querySelector('.edge-panel').className='edge-panel '+['top','bottom','left','right'].filter(side=>info.sourcePart.edges[side]>0).map(side=>'band-'+side).join(' ');
   const count=root.querySelector('[data-drilling="screwsPerJoint"]');if(count)count.value=String(normalizeDrillingSettings(project.settings.drilling).screwsPerJoint);
   const basis=root.querySelector('[data-drilling="measureFromFinishedEdge"]');if(basis)basis.checked=normalizeDrillingSettings(project.settings.drilling).measureFromFinishedEdge===true;
   const left=partZoom.viewport.scrollLeft,top=partZoom.viewport.scrollTop;partZoom.paper.innerHTML=drilling?createPartInspectionSvg(info,{markerId:inspectionMarkerId,allHoles:true}):createPartSvg(info.part,project,{language:interfaceLanguage});partZoom.layout();partZoom.viewport.scrollLeft=left;partZoom.viewport.scrollTop=top;
   root.querySelector('[data-inspection-status]').innerHTML=drilling?partDrillingStatus(info):`<p class="hint" data-i18n="off">${w.edge}: ${esc(describePartEdges(info.part,{language:interfaceLanguage}))}</p>`;bindMarkers();
  };
  $('#save-part').onclick=()=>{const language=project.settings.printLanguage??'tr',savedInfo=inspectCabinetPart(project,id,{language}),savedSvg=drilling?createPartInspectionSvg(savedInfo,{markerId:inspectionMarkerId,allHoles:true}):createPartSvg(info.part,project,{language});if(savedSvg)download(savedSvg,`${filename()}-${info.partCode}-${drilling?'drilling':'part'}.svg`,'image/svg+xml');};
 };renderMap(initialView);if(initialZoom){partZoom.zoom(initialZoom.scale);partZoom.viewport.scrollLeft=initialZoom.left;partZoom.viewport.scrollTop=initialZoom.top;}
}
function showSheet(i){const s=cutting.sheets[i];if(!s)return;modal(`Лист ${i+1}`,sheetSvg(s)+partsTable(s.placements.map(p=>parts.find(a=>a.id===p.partId)).filter(Boolean)),true);}
function factoryDialog({refreshOnly=false}={}){
 if(factoryCabinetId&&!project.cabinets.some(c=>c.id===factoryCabinetId))factoryCabinetId=null;
 const detailOpen=$('.factory-drilling details')?.open??false,scroll=$('.modal-body')?.scrollTop??0,focusField=document.activeElement?.dataset?.drilling;
 const scope={cabinetId:factoryCabinetId},result=checkFactoryProject(project,scope),language=interfaceLanguage,t=text=>esc(translateText(translatePrintText(text,language),language));
 const drilling=normalizeDrillingSettings(project.settings.drilling),drillResult=drilling.enabled?checkDrillingExport(project,scope):null;
 const drillProblem=issue=>{if(typeof issue==='string')return t(issue);const partLabel=id=>{const p=drillResult?.plan.parts.find(p=>p.id===id);return p?`${translateBuiltInName(p.cabinetName,language,'cabinet')} · ${p.partCode} · ${translatePrintText(p.name,language)}`:'';};const pair=[partLabel(issue.partId),partLabel(issue.receivingPartId)].filter(Boolean).join(' ↔ ');return `${pair?`${esc(pair)}: `:''}${t(issue.message)}`;};
  const bracketCount=drillResult?.plan?.joints?.filter(j=>j.fastenerType==='bracket').reduce((s,j)=>s+(j.quantity??2),0)??0;
  const drillStatus=`<p data-i18n="off">${esc(translateText('Операций сверления',language))}: ${drillResult?.plan?.holes.length??0}</p>${bracketCount>0?`<p class="hint" data-i18n="off">${esc(translateText('Крепление уголком специальным',language))}: ${bracketCount} ${esc(translateText('шт.',language))}</p>`:''}${drillResult?.errors?.length?`<ul class="warning-list" data-i18n="off">${drillResult.errors.map(issue=>`<li class="error">${drillProblem(issue)}</li>`).join('')}</ul>`:''}${drilling.countersinkDepth===null?'<p class="hint">Глубина зенковки не задана: в ведомости она отмечена для настройки в мастерской.</p>':''}`;
  const drillField=(label,field,min,max,{nullable=false}={})=>`<label class="field"><span>${label}</span><div class="input-with-unit"><input type="number" data-drilling="${field}" value="${drilling[field]??''}" min="${min}" max="${max}" step="0.1" ${nullable?'placeholder="По выбранной фурнитуре"':''}><small>мм</small></div></label>`;
  const drillMarkup=`<section class="factory-drilling"><label class="checkbox-row"><input type="checkbox" data-drilling="enabled" ${drilling.enabled?'checked':''}>Сверловка корпуса под конфирматы</label><p class="hint">Корпус — конфирматы; МДФ-задник — отдельные винты. ДВП 3 мм — гвозди без сверловки.</p>${drilling.enabled?`${drillingCountMarkup()}${drillingMeasurementMarkup()}<details><summary>Параметры сверления</summary><div class="field-grid">${drillField('Диаметр винта','screwDiameter',1,20)}${drillField('Длина винта','screwLength',10,150)}${drillField('Сквозное отверстие','clearanceDiameter',1,25)}${drillField('Отверстие в торце','pilotDiameter',1,20)}${drillField('Запас глубины в торце','pilotExtraDepth',0,20)}${drillField('Диаметр зенковки','countersinkDiameter',1,35)}${drillField('Глубина зенковки','countersinkDepth',0.1,10,{nullable:true})}${drillField('Отступ от края стыка','endOffset',5,500)}${drillField('Максимальный шаг винтов','maxSpacing',20,1000)}<label class="field"><span>Крепление перекрестных стыков</span><select data-drilling="crossJointFastener"><option value="bracket" ${drilling.crossJointFastener!=='error'?'selected':''}>Уголок мебельный специальный</option><option value="error" ${drilling.crossJointFastener==='error'?'selected':''}>Запретить (ошибка)</option></select></label></div><h4>Винты для задника</h4><p class="hint">Начальные параметры — винт 4 × 30 мм с широкой головкой, без автоматической зенковки.</p><div class="field-grid">${drillField('Диаметр винта задника','rearScrewDiameter',1,20)}${drillField('Длина винта задника','rearScrewLength',10,150)}${drillField('Сквозное отверстие задника','rearClearanceDiameter',1,25)}${drillField('Пилотное отверстие задника','rearPilotDiameter',1,20)}${drillField('Запас глубины винта задника','rearPilotExtraDepth',0,20)}${drillField('Отступ крепежа задника','rearEndOffset',5,500)}${drillField('Шаг крепежа задника','rearMaxSpacing',20,1000)}</div><p class="hint">Отверстия задника размещаются только в местах контакта с неподвижными плитами корпуса. Размер винта и диаметр сверла можно изменить.</p><p class="hint">Глубина в торце = длина винта − толщина первой плиты + запас. Отступ и шаг — редактируемая схема размещения.</p><p class="hint">Глубину зенковки задаёт мастерская по головке и сверлу. Пустое поле означает, что параметр ещё не задан.</p></details><div class="drilling-status">${drillStatus}</div><p class="hint">Отдельные файлы сверловки: CSV с координатами и ZIP со схемами деталей. Коды деталей совпадают с раскроем.</p><button class="button full" id="drilling-csv" ${drillResult?.valid?'':'disabled'}>Сверловка CSV</button><button class="button full" id="drilling-zip" ${drillResult?.valid?'':'disabled'}>Схемы сверловки ZIP</button>`:''}</section>`;
 if(refreshOnly&&$('.factory-drilling')){const status=$('.drilling-status');if(status)status.innerHTML=drillStatus;for(const id of ['drilling-csv','drilling-zip']){const button=$('#'+id);if(button)button.disabled=!drillResult?.valid;}return;}
 const scopeText={ru:['Комплект для','Весь проект','Схема сборки / Печать'],tr:['Takım kapsamı','Tüm proje','Montaj şeması / Yazdır'],en:['Document scope','Whole project','Assembly scheme / Print']}[language];
 const scopeMarkup=`<label class="field" data-i18n="off"><span>${scopeText[0]}</span><select id="factory-cabinet"><option value="">${scopeText[1]}</option>${project.cabinets.map((c,i)=>`<option value="${esc(c.id)}" ${c.id===factoryCabinetId?'selected':''}>${String(i+1).padStart(2,'0')} · ${esc(translateBuiltInName(c.name,language,'cabinet'))}</option>`).join('')}</select></label>`;
 modal('Заказ на раскрой',`${scopeMarkup}<p class="hint">В комплекте: листы с деталями DXF, отдельная схема резов с пропилом и Excel по материалам.</p><p class="hint">DXF: раскладка на листах 1:1 в мм. Пропил задаётся в настройках раскроя, по умолчанию 3 мм.</p><p>Размеры заготовок уже уменьшены на кромку. Повторно вычитать её толщину не нужно.</p><h3>Проверка перед раскроем</h3>${result.valid?'<p>Готовые размеры и заготовки проверены</p>':'<p>Исправьте ошибки проекта перед экспортом.</p>'}${result.issues.length?`<ul class="warning-list" data-i18n="off">${result.issues.map(issue=>`<li class="${issue.level}">${t(issue.message)}</li>`).join('')}</ul>`:''}<div class="menu-actions"><button class="button primary full" id="factory-zip" ${result.valid?'':'disabled'}>Скачать комплект ZIP</button><button class="button full" id="factory-csv" ${result.valid?'':'disabled'}>Ведомость деталей CSV</button><button class="button full" id="factory-dxf" ${result.valid?'':'disabled'}>Листы с деталями DXF</button><button class="button full" id="factory-assembly" data-i18n="off">${scopeText[2]}</button></div>${drillMarkup}`);
 const save=(kind)=>{try{const options={language:project.settings.printLanguage??'tr',...scope},base=factoryFilename();if(kind==='csv')download(generateFactoryCSV(project,options),`${base}-cut-list.csv`,'text/csv;charset=utf-8');else if(kind==='dxf'){const order=checkFactoryProject(project,scope);if(!order.valid)throw Error('Исправьте ошибки проекта перед экспортом.');download(createSheetLayoutDxf(order.cutting,order.partCodes,{language:options.language,materials:project.materials}),`${base}-sheets-all.dxf`,'application/dxf');}else download(generateFactoryZip(project,options),`${base}-factory.zip`,'application/zip');}catch(error){toast(translatePrintText(error.message,interfaceLanguage));factoryDialog();}};
 $('#factory-cabinet').onchange=e=>{factoryCabinetId=e.target.value||null;factoryDialog();};
 $('#factory-assembly').onclick=()=>{const html=generateDrawingHTML(project,{...scope,language:project.settings.printLanguage??'tr'});showPrintPreview(scopeText[2],html,'assembly',scopeText[2],translateText('Сохранить чертёж HTML',language));};
 $('#factory-zip').onclick=()=>save('zip');$('#factory-csv').onclick=()=>save('csv');$('#factory-dxf').onclick=()=>save('dxf');
 $('#factory-csv').insertAdjacentHTML('beforebegin',`<button class="button full" id="factory-xlsx" ${result.valid?'':'disabled'}>Заказ мастерской Excel</button>`);
 $('#factory-xlsx').onclick=()=>{try{download(generateFactoryXLSX(project,{language:project.settings.printLanguage??'tr',...scope}),`${factoryFilename()}-kesim-listesi.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}catch(error){toast(translatePrintText(error.message,interfaceLanguage));}};
 const saveDrilling=kind=>{try{const options={language:project.settings.printLanguage??'tr',...scope};download(kind==='csv'?generateDrillingCSV(project,options):generateDrillingZip(project,options),`${factoryFilename()}-drilling.${kind}`,kind==='csv'?'text/csv;charset=utf-8':'application/zip');}catch(error){toast(translatePrintText(error.message,interfaceLanguage));factoryDialog();}};
 if($('#drilling-csv'))$('#drilling-csv').onclick=()=>saveDrilling('csv');if($('#drilling-zip'))$('#drilling-zip').onclick=()=>saveDrilling('zip');
 if($('.factory-drilling details'))$('.factory-drilling details').open=detailOpen;
 if(focusField)$(`[data-drilling="${focusField}"]`)?.focus();$('.modal-body').scrollTop=scroll;
}
function exportCSV(){
 const language=project.settings.printLanguage??'tr',t=text=>translatePrintText(text,language),summary=getEdgeBandingSummary(parts);
 const rows=[['Шкаф','Секция','Деталь','Ширина заготовки мм','Высота заготовки мм','Толщина мм','Готовая ширина мм','Готовая высота мм','Материал','Текстура','Кромка сверху, мм','Кромка снизу, мм','Кромка слева, мм','Кромка справа, мм','Контур JSON','Количество','Кромка, м'].map(t),...parts.map(p=>[translateBuiltInName(p.cabinetName,language,'cabinet'),p.sectionId||'',t(p.name),p.width,p.height,p.thickness,p.finishedWidth,p.finishedHeight,translateMaterialName(project.materials.find(m=>m.id===p.materialId)?.name,language),t(p.grain?'Да':'Нет'),p.edges?.top||0,p.edges?.bottom||0,p.edges?.left||0,p.edges?.right||0,p.outline?JSON.stringify(p.outline):'',p.quantity??1,getPartEdgeBanding(p).lengthMeters])];
 rows.push([],[t('Всего кромки'),'','','','','','','','','','','','','','','',summary.lengthMeters]);
 for(const group of summary.groups)rows.push([t('Кромка по материалам'),'','','','',group.thickness,'','',translateMaterialName(project.materials.find(m=>m.id===group.materialId)?.name??'',language),'','','','','','',group.partCount,group.lengthMeters]);
 const estimate=getProjectCostEstimate(project);
 rows.push([],['Фурнитура','Количество','Ед.'].map(t),[t('Ручки'),estimate.hardware.handles,t('шт.')],[t('Комплекты направляющих'),estimate.hardware.guideSets,t('компл. (пара)')],[t('Петли'),estimate.hardware.hinges,t('шт.')]);
 if(estimate.rearHardware.screws)rows.push([t('Винты задника'),estimate.rearHardware.screws,t('шт.')]);
 if(estimate.rearHardware.nails)rows.push([t('Гвозди задника'),estimate.rearHardware.nails,t('шт.')]);
 if(estimate.hardware.rods){
  rows.push([t('Штанги для одежды'),estimate.hardware.rods,t('шт.')],[t('Держатели штанг'),estimate.hardware.rodHolders,t('шт.')],[t('Суммарная длина штанг'),estimate.hardware.rodLengthMeters,t('м')],[],['Шкаф','Секция','Штанга','Длина, мм','Диаметр, мм','Высота оси от дна секции','Отступ оси от переднего края'].map(t));
  for(const c of project.cabinets)for(const rod of getRodLayout(c,project))rows.push([translateBuiltInName(c.name,language,'cabinet'),rod.interiorSectionId??rod.sectionId,rod.rodId,rod.length,rod.diameter,rod.axisHeight,rod.frontInset]);
 }
 rows.push([],['Материал / фурнитура','Количество','Ед.','Цена за единицу, ₺','Сумма, ₺'].map(t),...estimate.rows.map(row=>[row.kind==='material'?translateMaterialName(row.label,language):t(row.label),row.quantity,t({sheet:'лист',pcs:'шт.',pair:'компл. (пара)',meter:'м'}[row.unit]),row.unitPrice??'',row.cost??'']),[t(estimate.complete?'Итого':'Учтённая сумма'),'','','',estimate.knownTotal],[t('Ориентиры цен в Турции'),estimate.date,'TRY']);
 download('\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),`${filename()}-детали.csv`,'text/csv;charset=utf-8');
}
function modal(title,body,wide=false){refreshPartModal=null;releaseExportDownload();partZoom?.destroy();partZoom=null;$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Закрыть">${icon('close')}</button></header><div class="modal-body">${body}</div></section></div>`;$('#app').inert=true;$('.modal-backdrop').onclick=e=>{if(e.target===e.currentTarget)closeModal();};$('.modal input:not([type=checkbox])')?.focus();}
function closeModal(){refreshPartModal=null;releaseExportDownload();partZoom?.destroy();partZoom=null;$('#modal-root').innerHTML='';$('#app').inert=false;}
function textDialog(title,value,onSave){modal(title,`<form id="text-form"><label class="field"><span>${esc(title)}</span><input name="text" value="${esc(value)}" maxlength="100" required></label><button class="button primary full">Сохранить</button></form>`);$('#text-form').onsubmit=e=>{e.preventDefault();const v=String(new FormData(e.target).get('text')).trim();if(v){onSave(v);closeModal();}};}
function filename(){return exportBaseName(project.name);}
function factoryFilename(){const index=project.cabinets.findIndex(c=>c.id===factoryCabinetId);return filename()+(index<0?'':`-cabinet-${String(index+1).padStart(3,'0')}`);}
function releaseExportDownload(){for(const link of document.querySelectorAll('.modal-body .export-download a'))URL.revokeObjectURL(link.href);}
let nativeSaveQueue=Promise.resolve();
async function download(content,name,type){
 const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
 const previous=$('.file-result');if(previous){const oldUrl=previous.querySelector('a')?.href;if(oldUrl)setTimeout(()=>URL.revokeObjectURL(oldUrl),300000);previous.remove();}
 const labels={ru:{ready:'Файл подготовлен. Браузер сохраняет его в загрузки или предлагает выбрать папку.',save:'Сохранить файл',saving:'Выберите папку в окне сохранения…',saved:'Файл сохранён',cancelled:'Сохранение отменено. Можно повторить.',error:'Не удалось сохранить файл',folder:'Показать в папке',close:'Закрыть уведомление'},tr:{ready:'Dosya hazır. Tarayıcı İndirilenler klasörüne kaydeder veya bir klasör seçmenizi ister.',save:'Dosyayı kaydet',saving:'Kaydetme penceresinde bir klasör seçin…',saved:'Dosya kaydedildi',cancelled:'Kaydetme iptal edildi. Yeniden deneyebilirsiniz.',error:'Dosya kaydedilemedi',folder:'Klasörde göster',close:'Bildirimi kapat'},en:{ready:'File prepared. Your browser saves it to Downloads or asks you to choose a folder.',save:'Save file',saving:'Choose a folder in the save dialog…',saved:'File saved',cancelled:'Save cancelled. You can try again.',error:'Could not save the file',folder:'Show in folder',close:'Close notification'}}[interfaceLanguage];
 const result=document.createElement('aside');result.className='export-download file-result';result.dataset.i18n='off';result.setAttribute('role','status');
 const header=document.createElement('div');header.className='row';const title=document.createElement('strong');title.textContent=`${name} · ${fmt(blob.size/1024,1)} KB`;header.append(title);
 const close=document.createElement('button');close.className='icon-button';close.setAttribute('aria-label',labels.close);close.textContent='×';close.onclick=()=>{result.remove();setTimeout(()=>URL.revokeObjectURL(url),300000);};header.append(close);result.append(header);
 const note=document.createElement('p');note.className='hint';result.append(note);a.className='button full';a.textContent=labels.save;result.append(a);document.body.append(result);
 const bridge=window.atolyeFiles;
 if(!bridge?.saveFile){note.textContent=labels.ready;a.click();return;}
 const save=async()=>{
  note.textContent=labels.saving;a.setAttribute('aria-disabled','true');
  const data=typeof content==='string'?content:new Uint8Array(await blob.arrayBuffer());
  const pending=nativeSaveQueue.then(()=>bridge.saveFile({name,data}));nativeSaveQueue=pending.catch(()=>{});
  try{const outcome=await pending;if(!result.isConnected)return;
   if(outcome.status==='saved'){note.textContent=`${labels.saved}: ${outcome.path}`;title.textContent=`${outcome.name} · ${fmt(outcome.bytes/1024,1)} KB`;let reveal=result.querySelector('[data-reveal-file]');if(!reveal){reveal=document.createElement('button');reveal.className='button full';reveal.dataset.revealFile='true';result.append(reveal);}reveal.textContent=labels.folder;reveal.onclick=async()=>{const shown=await bridge.revealFile(outcome.token);if(shown.status==='error')note.textContent=`${labels.error}: ${shown.message}`;};}
   else note.textContent=outcome.status==='cancelled'?labels.cancelled:`${labels.error}: ${outcome.message}`;
  }catch(error){if(result.isConnected)note.textContent=`${labels.error}: ${error.message}`;}finally{a.removeAttribute('aria-disabled');}
 };
 a.onclick=e=>{e.preventDefault();if(a.getAttribute('aria-disabled')!=='true')save();};await save();
}
function printHTML(html){const w=window.open('','_blank');if(!w){toast('Разрешите окно печати в браузере');return;}let printed=false;const print=()=>{if(printed||w.closed)return;printed=true;w.focus();w.print();};w.onload=print;w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{if(w.document.readyState==='complete')print();},700);}
function showPrintPreview(title,html,suffix,previewTitle,saveLabel){modal(title,`<iframe class="print-3d-preview" title="${esc(previewTitle)}" srcdoc="${esc(html)}"></iframe><div class="print-3d-actions"><button class="button primary" id="print-room-sheet">${icon('print')}Печать / PDF</button><button class="button" id="save-room-sheet">${icon('download')}${saveLabel}</button></div>`,true);$('#print-room-sheet').onclick=()=>printHTML(html);$('#save-room-sheet').onclick=()=>download(html,`${filename()}-${suffix}.html`,'text/html;charset=utf-8');}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
export function handleGlobalKeydown(event, studioContext = null) {
  if (!event || event.defaultPrevented) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  const key = event.key;
  if (key !== 'Delete' && key !== 'Backspace') return false;

  const target = event.target;
  if (target) {
    const tagName = target.tagName ? String(target.tagName).toUpperCase() : '';
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
      return false;
    }
    if (target.isContentEditable || (typeof target.matches === 'function' && target.matches('input, select, textarea, [contenteditable]'))) {
      return false;
    }
  }

  const doc = typeof document !== 'undefined' ? document : null;
  const activeEl = doc?.activeElement;
  if (activeEl && activeEl !== target) {
    const activeTag = activeEl.tagName ? String(activeEl.tagName).toUpperCase() : '';
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || activeEl.isContentEditable) {
      return false;
    }
  }

  const modalOpen = studioContext?.modalOpen ?? (typeof $ === 'function' && !!$('.modal'));
  if (modalOpen) return false;

  const currentMode = studioContext && 'mode' in studioContext ? studioContext.mode : (typeof mode !== 'undefined' ? mode : null);
  const currentCabView = studioContext && 'cabinetView' in studioContext ? studioContext.cabinetView : (typeof cabinetView !== 'undefined' ? cabinetView : null);
  const currentRoomView = studioContext && 'roomView' in studioContext ? studioContext.roomView : (typeof roomView !== 'undefined' ? roomView : null);
  const currentCabinetId = studioContext && 'cabinetId' in studioContext ? studioContext.cabinetId : (typeof cabinetId !== 'undefined' ? cabinetId : null);
  const doDeleteCabinet = studioContext && 'deleteCabinet' in studioContext ? studioContext.deleteCabinet : (typeof deleteCabinet === 'function' ? deleteCabinet : null);

  const canDeleteInCabinet = (currentMode === 'cabinet' && currentCabView === 'scheme');
  const canDeleteInRoom3D = (currentMode === 'room' && (currentRoomView === '3d' || currentRoomView === 'render'));

  if ((canDeleteInCabinet || canDeleteInRoom3D) && currentCabinetId && typeof doDeleteCabinet === 'function') {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    doDeleteCabinet(currentCabinetId);
    return true;
  }

  return false;
}

if(typeof document!=='undefined'){
$('#project-file')?.addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>3e6)throw Error('Файл больше 3 МБ');const data=JSON.parse(await file.text()),p=data.project||data;checkImport(p);change(()=>{project=prepare(p);cabinetId=project.cabinets[0]?.id;interiorParentId=null;sectionId=null;mode='cabinet';});closeModal();toast('Проект открыт');}catch(err){toast(`Не удалось открыть: ${err.message}`);}e.target.value='';});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();return;}const modalOpen=!!$('.modal');if(modalOpen)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();action('save');}if(handleGlobalKeydown(e))return;if(e.target.matches('input,select,textarea'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateCabinetAction();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){if(window.getSelection()?.toString())return;const c=selectedCabinet();if(c){e.preventDefault();cabinetClipboard=clone(c);toast(translateText('Шкаф скопирован в буфер',interfaceLanguage));}return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){if(cabinetClipboard){e.preventDefault();duplicateCabinetAction(cabinetClipboard);}return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();action(e.shiftKey?'redo':'undo');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();action('redo');}});
calculate();render();
if(restored)toast('Ваш проект открыт в редакторе секций');
}

const APPLIANCE_CHOICES = [
  ['oven', 'Духовой шкаф'],
  ['cooktop', 'Варочная панель / плита'],
  ['microwave', 'Микроволновая печь'],
  ['fridge-builtin', 'Холодильник (встраиваемый)'],
  ['fridge-freestanding', 'Холодильник (отдельностоящий)'],
  ['dishwasher-builtin', 'Посудомоечная машина (встраиваемая)'],
  ['dishwasher-freestanding', 'Посудомоечная машина (отдельностоящая)'],
  ['sink-round', 'Раковина (круглая)'],
  ['sink-rectangular', 'Раковина (прямоугольная)'],
  ['hood-builtin', 'Вытяжка (встраиваемая)'],
  ['washer', 'Стиральная машина'],
  ['dryer', 'Сушильная машина'],
  ['boiler', 'Бойлер'],
  ['custom', 'Своё оборудование']
];
function cabinetMountKind(c){return ['wall','corner-wall'].includes(c?.type)?'wall':(!c?.type||['base','corner-base'].includes(c.type))?'base':'tall';}
function applianceAllowed(c,type){return type==='hood-builtin'?cabinetMountKind(c)==='wall':['cooktop','sink-round','sink-rectangular'].includes(type)?cabinetMountKind(c)==='base':true;}
function applianceRuleMessage(type){return type==='hood-builtin'?'Вытяжку можно встроить только в навесной шкаф.':'Варочную панель и раковину можно поставить только в напольный шкаф.';}

function applianceDialog(forcedType=null){
 let section=selectedSection();if(!section)return;
 let c=selectedCabinet(),g=getCabinetLayout(c,project),atFloor=section.floorEligible;
 const a=section.node.appliance || (section.node.sink ? {
  type: (section.node.sink.shape==='round'||section.node.sink.sinkShape==='round') ? 'sink-round' : 'sink-rectangular',
  label: section.node.sink.label || ((section.node.sink.shape==='round'||section.node.sink.sinkShape==='round') ? 'Раковина круглая' : 'Раковина прямоугольная'),
  width: section.node.sink.width || 510,
  height: section.node.sink.height || 180,
  depth: section.node.sink.depth || 510,
  diameter: section.node.sink.diameter || section.node.sink.width || 510,
  bowlDiameter: section.node.sink.bowlDiameter || 410,
  bowlWidth: section.node.sink.bowlWidth || 400,
  bowlDepth: section.node.sink.bowlDepth || 400,
  hasDrainer: section.node.sink.hasDrainer !== false,
  drainerSide: section.node.sink.drainerSide || 'right'
 } : (section.node.cooktop ? {
  type: 'cooktop',
  label: section.node.cooktop.label || 'Варочная панель',
  width: section.node.cooktop.width || 600,
  height: 50,
  depth: section.node.cooktop.depth || 520
 } : {
  type: forcedType||'washer',
  label: translateText(forcedType==='sink-round'?'Раковина круглая':forcedType==='sink-rectangular'?'Раковина прямоугольная':'Стиральная машина',interfaceLanguage),
  width: forcedType==='sink-round'?510:forcedType==='sink-rectangular'?780:600,
  height: forcedType?.startsWith('sink')?180:850,
  depth: forcedType==='sink-round'?510:forcedType==='sink-rectangular'?500:600,
  diameter: 510,
  bowlDiameter: 410,
  bowlWidth: 400,
  bowlDepth: 400,
  hasDrainer: true,
  drainerSide: 'right'
 }));
 if(forcedType && !section.node.appliance && !section.node.sink && !section.node.cooktop){
  a.type=forcedType;
  if(forcedType==='sink-round'){a.width=510;a.depth=510;a.height=180;a.diameter=510;a.bowlDiameter=410;a.label='Раковина круглая';}
  else if(forcedType==='sink-rectangular'){a.width=780;a.depth=500;a.height=190;a.bowlWidth=400;a.bowlDepth=400;a.label='Раковина прямоугольная';}
 }
 const gaps={...getApplianceGapDefaults(a.type),...a.clearances};
 const enabled=a.useClearances??(!section.node.appliance&&['washer','dryer','fridge-builtin','fridge-freestanding'].includes(a.type));
  modal('Открытая ниша для техники',`<form id="appliance-form" novalidate><label class="field"><span>Что размещаем</span><select name="type">${APPLIANCE_CHOICES.filter(([v])=>applianceAllowed(c,v)||a.type===v).map(([v,t])=>`<option value="${v}" ${a.type===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="field"><span>Название</span><input name="label" value="${esc(a.label)}" maxlength="100" required></label><div id="appliance-presets" style="margin:4px 0 10px 0;"></div><div id="generic-dims" class="fields three" ${a.type==='sink-round'?'hidden':''}>${['width','height','depth'].map((k,i)=>`<label class="field"><span>${['Ширина','Высота','Глубина'][i]} техники, мм</span><input name="${k}" type="number" value="${a[k]}" min="10" max="6000" required></label>`).join('')}</div><div id="sink-round-fields" class="fields three" ${a.type==='sink-round'?'':'hidden'}><label class="field"><span>Диаметр раковины, мм</span><input name="sinkDiameter" type="number" min="200" max="1500" value="${a.diameter||a.width||510}"></label><label class="field"><span>Диаметр чаши, мм</span><input name="sinkBowlDiameter" type="number" min="150" max="1400" value="${a.bowlDiameter||410}"></label><label class="field"><span>Глубина чаши, мм</span><input name="sinkBowlDepth" type="number" min="80" max="400" value="${a.height||180}"></label></div><div id="sink-rect-fields" class="fields" ${a.type==='sink-rectangular'?'':'hidden'}><label class="field"><span>Ширина чаши, мм</span><input name="bowlWidth" type="number" min="100" max="2000" value="${a.bowlWidth||400}"></label><label class="field"><span>Глубина чаши, мм</span><input name="bowlDepth" type="number" min="100" max="1000" value="${a.bowlDepth||400}"></label><label class="check-row"><input name="hasDrainer" type="checkbox" ${a.hasDrainer!==false?'checked':''}>Крыло для сушки</label><label class="field"><span>Сторона крыла</span><select name="drainerSide"><option value="right" ${a.drainerSide!=='left'?'selected':''}>Крыло справа</option><option value="left" ${a.drainerSide==='left'?'selected':''}>Крыло слева</option></select></label></div><div id="cooktop-banner" class="hint" style="background:#f0fdf4;border:1px solid #bbf7d0;padding:10px 12px;border-radius:6px;margin:8px 0;color:#166534" ${a.type==='cooktop'?'':'hidden'}><strong>Врезка в столешницу над секцией</strong><p style="margin:4px 0">Варочная панель устанавливается сверху в столешницу на всю ширину секции, а не внутрь корпуса. Ниша секции свободна для духового шкафа или ящиков.</p><label class="check-row" style="margin-top:6px;font-weight:600"><input name="combineWithOven" type="checkbox" checked> Совместить с духовым шкафом в этой секции</label><p class="hint" style="margin-top:2px">Автоматически учитывает зазор 30 мм под варочной панелью для вентиляции и охлаждения духового шкафа.</p></div><div id="sink-banner" class="hint" style="background:#f0f9ff;border:1px solid #bae6fd;padding:10px 12px;border-radius:6px;margin:8px 0;color:#0369a1" ${a.type==='sink-round'||a.type==='sink-rectangular'?'':'hidden'}><strong>Врезка в столешницу над секцией</strong><p style="margin:4px 0">Раковина со смесителем монтируется сверху в столешницу на всю ширину секции, а чаша опускается в корпус шкафа. Под чашей остаётся свободное место для сифона, фильтров и моющих средств.</p></div><div id="hood-banner" class="hint" style="background:#fefce8;border:1px solid #fef08a;padding:10px 12px;border-radius:6px;margin:8px 0;color:#854d0e" ${a.type==='hood-builtin'?'':'hidden'}><strong>Встраивание снизу в навесной шкаф</strong><p style="margin:4px 0">Вытяжка монтируется снизу в нижний горизонт навесного шкафа: жироулавливающие фильтры и LED-подсветка обращены вниз на варочную панель, а корпус мотора и воздуховод уходят вверх внутри шкафа за закрытыми дверцами.</p></div>${atFloor?`<label class="check-row"><input name="onFloor" type="checkbox" ${!section.node.appliance||section.node.floor==='open'?'checked':''}>Стоит на полу — убрать дно и цоколь этой секции</label>`:''}<label class="check-row"><input name="useClearances" type="checkbox" ${enabled?'checked':''}>Учитывать монтажные зазоры и отступ от стены</label><div id="appliance-gap-fields" class="fields three">${[['side','С каждой стороны'],['top','Сверху'],['rear','Сзади: трубы и кабели']].map(([key,label])=>`<label class="field"><span>${label}, мм</span><input name="gap-${key}" type="number" min="0" max="1000" value="${gaps[key]}" required></label>`).join('')}</div><p class="hint">Начальные значения для планирования. Требования конкретной модели из её инструкции имеют приоритет. Глубину техники указывайте полностью, включая выступающие части.</p><div id="appliance-fit" class="appliance-fit" role="status" aria-live="polite"></div><details><summary>Откуда взяты зазоры</summary><p class="hint"><a href="https://www.samsung.com/ca/home-appliances/buying-guide/what-size-washing-machine-do-i-need/" target="_blank" rel="noopener">Samsung: размещение стиральных и сушильных машин</a>; <a href="https://download.beko.com/Download.UsageManualsBeko/AE/en_US_2960310556_EN.pdf" target="_blank" rel="noopener">Beko: пример инструкции сушильной машины</a>. Для сушилки начальный боковой запас увеличен до 30 мм. Эти параметры не являются универсальной нормой для любой техники. Для колонны нужен совместимый монтажный комплект, вентиляция и доступ спереди проверяются по инструкции.</p></details><div class="row" style="gap:8px;margin-top:12px"><button type="submit" class="button primary" style="flex:1">Поместить в секцию</button>${Boolean(section.node.appliance||section.node.cooktop||section.node.sink)?`<button type="button" class="button danger" id="dialog-remove-appliance-btn" style="flex:1">Убрать технику</button>`:''}</div></form>`);
  const form=$('#appliance-form');
  const APPLIANCE_DIMENSION_PRESETS={
   cooktop:[{label:'60 см (4 конф. 590×520)',width:590,depth:520,height:45},{label:'45 см (3 конф. 450×520)',width:450,depth:520,height:45},{label:'30 см Домино (290×520)',width:290,depth:520,height:45},{label:'90 см (5 конф. 880×520)',width:880,depth:520,height:45}],
   oven:[{label:'60 см стандарт (595×595)',width:595,height:595,depth:550},{label:'45 см компакт (595×455)',width:595,height:455,depth:550}],
   'dishwasher-builtin':[{label:'60 см полноразмерная (598×815)',width:598,height:815,depth:550},{label:'45 см узкая (448×815)',width:448,height:815,depth:550}],
   'dishwasher-freestanding':[{label:'60 см стандарт (600×850)',width:600,height:850,depth:600},{label:'45 см узкая (450×850)',width:450,height:850,depth:600}],
   'fridge-builtin':[{label:'178 см стандарт (560×1775)',width:560,height:1775,depth:550},{label:'194 см высокий (560×1935)',width:560,height:1935,depth:550},{label:'82 см под столешницу (598×820)',width:598,height:820,depth:550}],
   'hood-builtin':[{label:'60 см (600×380)',width:600,height:380,depth:300},{label:'52 см (520×280)',width:520,height:280,depth:280},{label:'90 см (900×380)',width:900,height:380,depth:300}],
   'sink-rectangular':[{label:'78×50 с крылом (чаша 40×40)',width:780,depth:500,height:190,bowlWidth:400,bowlDepth:400,hasDrainer:true},{label:'60×50 с крылом (чаша 34×40)',width:600,depth:500,height:180,bowlWidth:340,bowlDepth:400,hasDrainer:true},{label:'50×50 без крыла (чаша 45×40)',width:500,depth:500,height:200,bowlWidth:450,bowlDepth:400,hasDrainer:false},{label:'40×40 компакт (чаша 35×35)',width:400,depth:400,height:180,bowlWidth:350,bowlDepth:350,hasDrainer:false}],
   'sink-round':[{label:'Ø 51 см (чаша 41 см)',diameter:510,bowlDiameter:410,height:180},{label:'Ø 45 см (чаша 37 см)',diameter:450,bowlDiameter:370,height:170}],
   microwave:[{label:'Встраиваемая 38 см (595×382)',width:595,height:382,depth:320},{label:'Компакт 36 см (490×360)',width:490,height:360,depth:320}],
   washer:[{label:'60 см полноразмерная (600×850)',width:600,height:850,depth:600},{label:'60×45 см узкая (600×850×450)',width:600,height:850,depth:450}]
  };
  const updatePresetsUI=(t)=>{
   const container=$('#appliance-presets');if(!container)return;
   const presets=APPLIANCE_DIMENSION_PRESETS[t]||[];
   if(!presets.length){container.innerHTML='';return;}
   container.innerHTML=`<span style="display:block;font-size:11px;color:var(--muted,#64748b);margin-bottom:4px;font-weight:600">Стандартные типоразмеры:</span><div style="display:flex;gap:6px;flex-wrap:wrap;">`+
    presets.map((p,idx)=>`<button type="button" class="button small" data-preset-idx="${idx}" style="font-size:11px;padding:3px 8px;border-radius:12px;background:var(--bg-subtle,#f1f5f9);border:1px solid var(--border,#cbd5e1);cursor:pointer;">${esc(p.label)}</button>`).join('')+
    `</div>`;
   container.querySelectorAll('button[data-preset-idx]').forEach(btn=>{
    btn.onclick=()=>{
     const p=presets[Number(btn.dataset.presetIdx)];if(!p)return;
     if(p.width!=null&&form.elements.width)form.elements.width.value=p.width;
     if(p.height!=null&&form.elements.height)form.elements.height.value=p.height;
     if(p.depth!=null&&form.elements.depth)form.elements.depth.value=p.depth;
     if(p.diameter!=null&&form.elements.sinkDiameter)form.elements.sinkDiameter.value=p.diameter;
     if(p.bowlDiameter!=null&&form.elements.sinkBowlDiameter)form.elements.sinkBowlDiameter.value=p.bowlDiameter;
     if(p.bowlWidth!=null&&form.elements.bowlWidth)form.elements.bowlWidth.value=p.bowlWidth;
     if(p.bowlDepth!=null&&form.elements.bowlDepth)form.elements.bowlDepth.value=p.bowlDepth;
     if(p.hasDrainer!=null&&form.elements.hasDrainer)form.elements.hasDrainer.checked=p.hasDrainer;
     preview();
    };
   });
  };
  updatePresetsUI(a.type);
 const read=()=>{
  const t=form.elements.type.value;
  const isRound=t==='sink-round';
  const roundDiam=form.elements.sinkDiameter?form.elements.sinkDiameter.valueAsNumber:(form.elements.width?.valueAsNumber||510);
  const roundBowlDiam=form.elements.sinkBowlDiameter?form.elements.sinkBowlDiameter.valueAsNumber:410;
  const roundBowlDepth=form.elements.sinkBowlDepth?form.elements.sinkBowlDepth.valueAsNumber:(form.elements.height?.valueAsNumber||180);
  return {
   type:t,
   label:form.elements.label.value.trim(),
   width:isRound?roundDiam:form.elements.width.valueAsNumber,
   height:isRound?roundBowlDepth:form.elements.height.valueAsNumber,
   depth:isRound?roundDiam:form.elements.depth.valueAsNumber,
   diameter:isRound?roundDiam:undefined,
   bowlDiameter:isRound?roundBowlDiam:undefined,
   bowlDepth:isRound?roundBowlDepth:Number(form.elements.bowlDepth?.value||400),
   useClearances:form.elements.useClearances.checked,
   clearances:Object.fromEntries(['side','top','rear'].map(k=>{const v=form.elements[`gap-${k}`].valueAsNumber;return [k,Number.isFinite(v)&&v>=0&&v<=1000?v:gaps[k]];})),
   ...(t==='sink-rectangular'?{
     sinkShape:'rectangular',
     bowlWidth:Number(form.elements.bowlWidth?.value||400),
     bowlDepth:Number(form.elements.bowlDepth?.value||400),
     hasDrainer:form.elements.hasDrainer?.checked??true,
     drainerSide:form.elements.drainerSide?.value||'right'
   }:{}),
   ...(isRound?{
     sinkShape:'round',
     diameter:roundDiam,
     bowlDiameter:roundBowlDiam,
     bowlDepth:roundBowlDepth
   }:{})
  };
 };
 const preview=()=>{
  $('#appliance-gap-fields').hidden=!form.elements.useClearances.checked;
  for(const k of ['side','top','rear'])form.elements[`gap-${k}`].disabled=!form.elements.useClearances.checked;
  if([...form.querySelectorAll('input[type="number"]')].some(el=>!el.disabled&&!el.closest('[hidden]')&&!el.checkValidity())){$('#appliance-fit').classList.add('has-warning');$('#appliance-fit').textContent='Заполните размеры и зазоры допустимыми числами.';return;}
  const draft=clone(c);draft.layout??=convertLegacyLayout(draft);const node=findLayoutNode(draft.layout,section.id);
  const isBuiltinHood=form.elements.type.value==='hood-builtin';
  if(node){if(!isBuiltinHood){node.front='open';node.back='none';node.shelves=0;}if(atFloor)node.floor=form.elements.onFloor.checked?'open':'inherit';}
  const opening=getCabinetLayout(draft,project).sections.find(s=>s.id===section.id)||section;
  const fit=getApplianceFit(opening,read());
  const labels={width:'ширине',height:'высоте',depth:'глубине'};
  const failed=Object.keys(labels).filter(k=>fit.deficits[k]>.001);
  $('#appliance-fit').classList.toggle('has-warning',failed.length>0);
  $('#appliance-fit').innerHTML=`<strong>Нужна ниша: ${fmt(fit.required.width,1)} × ${fmt(fit.required.height,1)} × ${fmt(fit.required.depth,1)} мм</strong><small>Доступно: ${fmt(fit.available.width,1)} × ${fmt(fit.available.height,1)} × ${fmt(fit.available.depth,1)} мм</small>${failed.length?failed.map(k=>`<p>Не помещается по ${labels[k]}: не хватает ${fmt(fit.deficits[k],1)} мм.</p>`).join('')+`<button type="button" class="button" id="appliance-auto-fit-btn" style="margin-top:10px;width:100%;font-weight:600;">Изменить размер</button>`:'<p>Техника помещается с указанными зазорами.</p>'}`;
  const fitBtn=$('#appliance-auto-fit-btn');
  if(fitBtn){
   fitBtn.onclick=()=>{
    const app=read();
    const ok=change(()=>{
     const targetCabinet=project.cabinets.find(cab=>cab.id===c.id);
     if(!targetCabinet)return false;
     return adjustCabinetToFitAppliance(targetCabinet,section.id,app,project);
    });
    if(ok){
     c=selectedCabinet();
     g=getCabinetLayout(c,project);
     section=g.sections.find(s=>s.id===section.id)||g.sections[0]||section;
     toast('Размер шкафа изменён под технику');
     preview();
    }
   };
  }
 };
 form.addEventListener('input',preview);
 if(form.elements.sinkDiameter){
  form.elements.sinkDiameter.addEventListener('input',()=>{
   const d=form.elements.sinkDiameter.valueAsNumber;
   if(d>100&&form.elements.sinkBowlDiameter)form.elements.sinkBowlDiameter.value=Math.max(150,d-100);
   if(form.elements.width)form.elements.width.value=d;
   if(form.elements.depth)form.elements.depth.value=d;
  });
 }
 form.elements.type.onchange=()=>{
  const t=form.elements.type.value;
  form.elements.label.value=form.elements.type.selectedOptions[0].textContent;
  const defaults=getApplianceDefaultDimensions(t);
  form.elements.width.value=defaults.width;
  form.elements.height.value=defaults.height;
  form.elements.depth.value=defaults.depth;
  const g=getApplianceGapDefaults(t);
  for(const k of ['side','top','rear'])form.elements[`gap-${k}`].value=g[k];
  form.elements.useClearances.checked=['washer','dryer','fridge-builtin','fridge-freestanding'].includes(t);
  const isRound=t==='sink-round', isRect=t==='sink-rectangular';
  const genDims=$('#generic-dims');if(genDims)genDims.hidden=isRound;
  const roundFields=$('#sink-round-fields');if(roundFields)roundFields.hidden=!isRound;
  const sinkFields=$('#sink-rect-fields');if(sinkFields)sinkFields.hidden=!isRect;
  if(isRound){
   if(form.elements.sinkDiameter)form.elements.sinkDiameter.value=defaults.width||510;
   if(form.elements.sinkBowlDiameter)form.elements.sinkBowlDiameter.value=defaults.bowlDiameter||410;
   if(form.elements.sinkBowlDepth)form.elements.sinkBowlDepth.value=defaults.height||180;
  }
  const ctBanner=$('#cooktop-banner');if(ctBanner)ctBanner.hidden=t!=='cooktop';
  const sBanner=$('#sink-banner');if(sBanner)sBanner.hidden=!(isRound||isRect);
  const hBanner=$('#hood-banner');if(hBanner)hBanner.hidden=t!=='hood-builtin';
  if(t==='oven'&&(section.node.cooktop||c.cooktop)){form.elements['gap-top'].value=30;form.elements.useClearances.checked=true;}
  updatePresetsUI(t);
  preview();
 };
 form.onsubmit=e=>{
  e.preventDefault();
  {const hiddenInputs=[...form.querySelectorAll('[hidden] input')].filter(el=>!el.disabled);hiddenInputs.forEach(el=>{el.disabled=true;});const valid=form.reportValidity();hiddenInputs.forEach(el=>{el.disabled=false;});if(!valid)return;}
  const t=form.elements.type.value;
  if(!applianceAllowed(c,t)){toast(applianceRuleMessage(t));return;}
   if(t==='cooktop'){
   const cw=form.elements.width.valueAsNumber,cd=form.elements.depth.valueAsNumber;
   const combine=form.elements.combineWithOven?.checked??true;
   const saved=change(()=>{
    const s=editableSection();
    s.node.cooktop={width:cw,depth:cd,height:45,label:form.elements.label.value.trim()||'Варочная панель'};
    if(combine){
     s.node.appliance={type:'oven',label:translateText('Духовой шкаф',interfaceLanguage),width:595,height:595,depth:550,useClearances:true,clearances:{side:5,top:30,rear:30}};
     s.node.front='open';s.node.shelves=0;s.node.back='none';delete s.node.pullOutShelf;delete s.node.internalDrawerCount;delete s.node.interiorLayout;delete s.node.hingesPerDoor;delete s.node.rods;
    }else{delete s.node.appliance;}
    if(!getFrontLayout(c,project).some(front=>front.kind==='door'))delete c.hingesPerDoor;
    if(atFloor)s.node.floor=form.elements.onFloor.checked?'open':'inherit';
   });
   if(saved)closeModal();
   return;
  }
  if(t==='sink-round'||t==='sink-rectangular'){
   const app=read();
   const saved=change(()=>{
    const s=editableSection();
    s.node.sink={
     shape:t==='sink-round'?'round':'rectangular',
     sinkShape:t==='sink-round'?'round':'rectangular',
     width:app.width,
     depth:app.depth,
     height:app.height,
     ...(t==='sink-round'?{diameter:app.diameter||app.width,bowlDiameter:app.bowlDiameter||410,bowlDepth:app.height}:{bowlWidth:app.bowlWidth||400,bowlDepth:app.bowlDepth||400,hasDrainer:app.hasDrainer??true,drainerSide:app.drainerSide||'right'}),
     label:app.label||(t==='sink-round'?'Раковина (круглая)':'Раковина (прямоугольная)')
    };
    delete s.node.appliance;
    s.node.shelves=0;
    delete s.node.pullOutShelf;delete s.node.internalDrawerCount;delete s.node.interiorLayout;delete s.node.rods;
   });
   if(saved)closeModal();
   return;
  }
  const appliance=read();
  const saved=change(()=>{
   const s=editableSection();s.node.appliance=appliance;
   if(t!=='hood-builtin'){s.node.front='open';s.node.back='none';}
   if(t==='hood-builtin'){const th=Number(g.thickness)||18,h=Number(appliance.height)||0,maxN=Math.max(0,Math.floor((section.height-h)/(h+th)));s.node.shelves=Math.min(Number(s.node.shelves)||0,maxN);}else s.node.shelves=0;
   delete s.node.pullOutShelf;delete s.node.internalDrawerCount;delete s.node.interiorLayout;if(t!=='hood-builtin')delete s.node.hingesPerDoor;delete s.node.rods;
   if(!getFrontLayout(c,project).some(front=>front.kind==='door'))delete c.hingesPerDoor;
   if(atFloor)s.node.floor=form.elements.onFloor.checked?'open':'inherit';
  });
  if(saved)closeModal();
 };
 const removeBtn=$('#dialog-remove-appliance-btn');
 if(removeBtn){
  removeBtn.onclick=()=>{
   change(()=>{
    const s=editableSection();
    if(s?.node){delete s.node.appliance;delete s.node.cooktop;delete s.node.sink;}
   });
   closeModal();
   toast(translateText('Техника убрана',interfaceLanguage));
  };
 }
 preview();
}

function printOptions(){const language=project.settings.printLanguage??'tr';return `<div class="property-block"><h2>Язык документов</h2><label class="check-row"><input id="print-turkish" type="checkbox" ${language==='tr'?'checked':''}>Печать на турецком</label>${language!=='tr'?`<label class="field"><span>Язык чертежей и раскроя</span><select data-scope="settings" data-field="printLanguage"><option value="ru" ${language==='ru'?'selected':''}>Русский</option><option value="en" ${language==='en'?'selected':''}>English</option></select></label>`:''}<p class="hint">Небольшие виды компонуются на одном листе. Сложные чертежи получают дополнительные страницы.</p></div>`;}
function applyLanguage(){if(typeof document==='undefined')return;document.documentElement.lang=interfaceLanguage;$('#interface-language')?.setAttribute('aria-label',{ru:'Язык интерфейса',tr:'Arayüz dili',en:'Interface language'}[interfaceLanguage]);for(const element of [$('#app'),$('#modal-root'),$('#toast')])if(element)applyTranslations(element,interfaceLanguage);}
let languageObserver=null;
if(typeof MutationObserver!=='undefined'){
 languageObserver=new MutationObserver(()=>applyLanguage());
 for(const element of [$('#app'),$('#modal-root'),$('#toast')])if(element)languageObserver.observe(element,{childList:true,subtree:true,characterData:true});
 applyLanguage();
}

function cuttingHTML(){
 const language=project.settings.printLanguage??'tr',t=text=>esc(translatePrintText(text,language)),n=val=>esc(printNumber(val,language));
 const materialName=name=>esc(translateMaterialName(name,language));
 const info=getDocumentInfo(project),configuration=`${translatePrintText('Пропил',language)} ${project.settings.kerf} mm · ${translatePrintText('Отступ от края листа',language)} ${project.settings.margin} mm`;
 const pages=cutting.sheets.flatMap((sheet,index)=>createCuttingSheetPrintPages({...sheet,materialName:translateMaterialName(project.materials.find(m=>m.id===sheet.materialId)?.name??sheet.materialName??'',language)},parts,{language,sheetNumber:index+1,documentInfo:info,configuration}).map(svg=>`<section class="plan-page">${svg}</section>`));
 const tables=cutting.sheets.map((sheet,index)=>`<section class="details"><h2>${t('Лист')} ${index+1}</h2><table><thead><tr><th>№</th><th>${t('Деталь')}</th><th>${t('Заготовка без кромки, мм')}</th><th>${t('Материал')}</th><th>${t('Количество')}</th><th>${t('Кромка, мм')}</th><th>${t('Кромка, м')}</th></tr></thead><tbody>${sheet.placements.map(placement=>{const part=parts.find(p=>p.id===placement.partId);return `<tr><td>${productionPartCode(parts.findIndex(p=>p.id===placement.partId))}</td><td>${esc(translatePartName(part?.name??placement.label,language))}</td><td>${n(part?.width)} × ${n(part?.height)} × ${n(part?.thickness)}</td><td>${materialName(project.materials.find(m=>m.id===part?.materialId)?.name??'')}</td><td>${n(part?.quantity??1)}</td><td>${esc(part?describePartEdges(part,{language}):'—')}</td><td>${n(part?getPartEdgeBanding(part).lengthMeters:0)}</td></tr>`;}).join('')}</tbody></table></section>`).join('');
 return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${esc(translateBuiltInName(project.name,language,'project'))} · ${t('Раскрой')}</title><style>@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{font:10pt Arial;color:#233c34;margin:0}h1{font-size:14pt;margin:0 0 3mm}h2{font-size:9pt;margin:0 0 2mm}p{margin:0 0 4mm}.plan-page{width:297mm;height:210mm;break-after:page}.plan-page svg{display:block;width:297mm;height:210mm}.sheet{break-inside:avoid}.sheet.schedule{height:auto;margin:5mm 0;break-inside:avoid}.cost-summary{margin:5mm 0}.cost-summary h2{font-size:12pt}.cost-summary details{display:none}.cost-summary tfoot{font-weight:bold}.details{padding:8mm 12mm;margin:0}thead{display:table-header-group}table{border-collapse:collapse;width:100%;font-size:10pt;table-layout:fixed}td,th{padding:1.3mm;border-bottom:1px solid #ccc;text-align:left;overflow-wrap:anywhere;vertical-align:top}.details th:nth-child(1),.details td:nth-child(1){width:7%}.details th:nth-child(2),.details td:nth-child(2){width:27%}.details th:nth-child(3),.details td:nth-child(3){width:18%}.details th:nth-child(4),.details td:nth-child(4){width:22%}.details th:nth-child(5),.details td:nth-child(5){width:9%}.details th:nth-child(6),.details td:nth-child(6){width:10%}.details th:nth-child(7),.details td:nth-child(7){width:7%}tr,.edge-summary{break-inside:avoid}.edge-summary{padding:8mm 12mm;margin-top:5mm}</style></head><body>${pages.join('')}${tables}${generateHardwareHTML(project,{language})}${generateCostPrintHTML(project,{language})}${edgeSummaryMarkup(parts,language)}${cutting.unplaced.length?`<p>${t('Не размещено')} ${cutting.unplaced.length} ${t('деталей')}</p>`:''}</body></html>`;
}

function pricingDialog(){
 const rates=getPriceSettings(project),labels={handlePrice:'Цена ручки',guideSetPrice:'Цена комплекта направляющих',hingePrice:'Цена петли',edgeBandPricePerMeter:'Цена кромки за метр',rodPricePerMeter:'Цена штанги за метр',rodHolderPrice:'Цена держателя штанги',rearScrewPrice:'Цена винта задника',rearNailPrice:'Цена гвоздя задника',pushLatchPrice:'Цена толкателя push-to-open',confirmatPrice:'Цена конфирмата',plinthLegPrice:'Цена опоры цоколя',shelfSupportPrice:'Цена полкодержателя',cornerBracketPrice:'Цена уголка'};
 modal('Цены и смета',`<p class="hint">Цены сохраняются в файле проекта и используются для новых проектов на этом компьютере. Нулевая цена допустима для имеющихся запасов.</p><h3>Материалы</h3><p class="hint">Цена за целый лист указанного размера.</p>${project.materials.map(m=>{const rate=getMaterialPrice(m);return `<div class="pricing-row"><div><strong data-user-text>${esc(m.name)}</strong><small>${m.sheetWidth} × ${m.sheetHeight} × ${m.thickness} мм · ${rate.manual?'Вручную':rate.pricePerSheet===null?'Цена не задана':'Ориентир'}</small></div><label class="field"><span>Цена листа</span><div class="input-with-unit"><input type="number" data-price-material="${esc(m.id)}" value="${rate.pricePerSheet??''}" min="0" max="1000000000" step="0.01"><small>₺</small></div></label></div>`;}).join('')}<h3>Фурнитура</h3><div class="fields">${Object.entries(labels).map(([key,label])=>`<label class="field"><span>${label}</span><div class="input-with-unit"><input type="number" data-price-rate="${key}" value="${rates[key].price??''}" min="0" max="1000000000" step="0.01"><small>₺</small></div></label>`).join('')}</div><button class="button" data-action="reset-prices">${icon('reset')}Вернуть ориентиры</button><div id="pricing-summary"></div>`,true);
 updatePricingSummary();
}
function updatePricingSummary(){const target=$('#pricing-summary');if(target)target.innerHTML=generateCostHTML(project,{language:interfaceLanguage});for(const el of document.querySelectorAll('[data-price-material]')){const m=project.materials.find(m=>m.id===el.dataset.priceMaterial),note=el.closest('.pricing-row')?.querySelector('div>small');if(m&&note){const rate=getMaterialPrice(m);note.textContent=`${m.sheetWidth} × ${m.sheetHeight} × ${m.thickness} мм · ${rate.manual?'Вручную':rate.pricePerSheet===null?'Цена не задана':'Ориентир'}`;}}}
function rememberPricing(){if(demoMode)return;try{localStorage.setItem(pricingKey,JSON.stringify(getPricingPreferences(project)));}catch{}}
function applyApplicationPricing(p){try{Object.assign(p,applyPricingPreferences(p,JSON.parse(localStorage.getItem(pricingKey))));}catch{}}

if(typeof window!=='undefined'){
 window.addEventListener('resize',()=>{
  if(mode==='cabinet'&&cabinetView==='3d')viewport?.resize();
  else if(mode==='room'){
   if(roomView==='3d')roomViewport?.resize();
   else if(roomView==='render')roomRenderer?.resize();
  }
 });
 window.addEventListener('keydown',e=>handleGlobalKeydown(e));
}

