/** Reviewable sheet geometry and saw passes from the shared guillotine plan. */
import { csvCell } from './project-io.js';
import { translateMaterialName } from './print-i18n.js';
import { contourMarkerRegions } from './contour-markers.js';

const n = value => String(Math.round(Number(value)*1e9)/1e9);
const num = value => Number(n(value));
const shortRegion = value => String(value).split('-').at(-1);
const cutCode = cut => `C${String(cut.sequence).padStart(3,'0')}`;
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dxfText = value => String(value).replace(/[^\x20-\x7e]/g,c=>`\\U+${c.charCodeAt(0).toString(16).padStart(4,'0').toUpperCase()}`);
const asciiJSON = value => JSON.stringify(value).replace(/[^\x20-\x7e]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);
const csv = rows => '\ufeff'+rows.map(row=>row.map(value=>typeof value==='number'&&Number.isFinite(value)?`"${n(value)}"`:csvCell(value)).join(';')).join('\r\n')+'\r\n';
const stockCode = sheet => `${sheet.materialId}@${n(sheet.thickness)}mm`;
const sheetCode = index => `S${String(index+1).padStart(3,'0')}`;
const outlineOf = placement => placement.outline??[{x:0,y:0},{x:placement.width,y:0},{x:placement.width,y:placement.height},{x:0,y:placement.height}];
const words = {
 ru:{sheets:'Листы',cuts:'Последовательность резов',vertical:'Вертикально',horizontal:'Горизонтально',trim:'Обрезка поля',separate:'Разделение',guillotine:'Гильотинный раскрой',origin:'Координаты от верхнего левого угла листа: X вправо, Y вниз. Проходы заданы по оси полотна; пропил указан отдельно.',instruction:'Выполняйте проходы по порядку на указанном исходном участке. Это последовательность для проверки оператором, а не управляющая программа станка.',secondary:'Фигурные детали сначала выпиливаются прямоугольными заготовками. Вырезы обрабатываются отдельно по контурам Pxxxx.',sheetHeaders:['Лист','Материал','Декор','Толщина (мм)','Ширина листа (мм)','Длина листа (мм)','Поле (мм)','Пропил (мм)','Деталей','Проходов','Способ','ID листа'],cutHeaders:['Лист','Проход','ID реза','Направление','Начало X (мм)','Начало Y (мм)','Конец X (мм)','Конец Y (мм)','Пропил (мм)','Операция','Исходный участок','Полученные участки','Сохранённая сторона']},
 tr:{sheets:'Levhalar',cuts:'Kesim sırası',vertical:'Dikey',horizontal:'Yatay',trim:'Kenar düzeltme',separate:'Ayırma',guillotine:'Giyotin kesim',origin:'Koordinatlar levhanın sol üst köşesinden: X sağa, Y aşağı. Geçişler bıçak merkez çizgisidir; testere payı ayrıca belirtilir.',instruction:'Geçişleri belirtilen başlangıç bölgesinde sırayla uygulayın. Bu operatörün kontrol edeceği kesim sırasıdır; makine kumanda programı değildir.',secondary:'Şekilli parçalar önce dikdörtgen ham parçalar olarak ayrılır. Oyuklar Pxxxx konturlarına göre ayrıca işlenir.',sheetHeaders:['Levha','Malzeme','Dekor','Kalınlık (mm)','Levha eni (mm)','Levha boyu (mm)','Kenar boşluğu (mm)','Testere payı (mm)','Parça','Geçiş','Yöntem','Levha ID'],cutHeaders:['Levha','Geçiş','Kesim ID','Yön','Başlangıç X (mm)','Başlangıç Y (mm)','Bitiş X (mm)','Bitiş Y (mm)','Testere payı (mm)','İşlem','Başlangıç bölgesi','Sonuç bölgeleri','Korunan taraf']},
 en:{sheets:'Sheets',cuts:'Cut sequence',vertical:'Vertical',horizontal:'Horizontal',trim:'Margin trim',separate:'Separate',guillotine:'Guillotine cutting',origin:'Coordinates start at the sheet top-left: X right, Y down. Passes follow the blade centerline; kerf is specified separately.',instruction:'Apply passes in sequence to the specified parent region. This is an operator-reviewed cut sequence, not a machine control program.',secondary:'Shaped parts are first isolated as rectangular blanks. Notches require separate machining using the Pxxxx contours.',sheetHeaders:['Sheet','Material','Decor','Thickness (mm)','Sheet width (mm)','Sheet length (mm)','Margin (mm)','Kerf (mm)','Parts','Passes','Method','Source sheet ID'],cutHeaders:['Sheet','Pass','Cut ID','Direction','Start X (mm)','Start Y (mm)','End X (mm)','End Y (mm)','Kerf (mm)','Operation','Parent region','Result regions','Retained side']}
};

const referenceWords = {ru:{parent:'Исходный участок',parentWidth:'Ширина участка (мм)',parentHeight:'Длина участка (мм)',retained:'Сохранённая сторона',retainedSize:'Размер сохраняемой части (мм)',bladeOffset:'Ось полотна от левого/верхнего края (мм)',left:'Слева',right:'Справа',top:'Сверху',bottom:'Снизу',fence:'Размер сохраняемой части задан до ближней грани пропила; ось полотна отличается на половину пропила. После отделения участка отсчитывайте от его левого/верхнего края.'},tr:{parent:'Başlangıç bölgesi',parentWidth:'Bölge eni (mm)',parentHeight:'Bölge boyu (mm)',retained:'Korunan taraf',retainedSize:'Korunan parça ölçüsü (mm)',bladeOffset:'Bıçak ekseni, sol/üst kenardan (mm)',left:'Sol',right:'Sağ',top:'Üst',bottom:'Alt',fence:'Korunan parça ölçüsü testere payının yakın yüzüne kadardır; bıçak ekseni yarım testere payı kadar farklıdır. Ayrılmış bölgede sol/üst kenardan ölçün.'},en:{parent:'Parent region',parentWidth:'Parent width (mm)',parentHeight:'Parent length (mm)',retained:'Retained edge',retainedSize:'Retained piece size (mm)',bladeOffset:'Blade center from left/top (mm)',left:'Left',right:'Right',top:'Top',bottom:'Bottom',fence:'Retained piece size ends at the near kerf face; the blade center differs by half the kerf. Measure from the detached region left/top edge.'}};

function cutReference(sheet,cut) {
 const parent=sheet.regions.find(region=>region.id===cut.parentRegionId);
 if(!parent)throw new Error('Cut parent region is missing.');
 const horizontal=cut.axis==='y',origin=horizontal?parent.y:parent.x,length=horizontal?parent.height:parent.width,center=horizontal?cut.y1:cut.x1;
 const keepLow=cut.retainedEdge==='left'||cut.retainedEdge==='top';
 return {parentX:parent.x,parentY:parent.y,parentWidth:parent.width,parentHeight:parent.height,bladeCenterOffsetMm:center-origin,retainedSizeMm:Math.max(0,keepLow?center-cut.kerf/2-origin:origin+length-center-cut.kerf/2)};
}

export const CUT_SEQUENCE_COLUMNS = ['DOCUMENT_ID','SHEET_ID','SOURCE_SHEET_ID','MATERIAL_CODE','DECOR_CODE','THICKNESS_MM','SEQUENCE','CUT_ID','AXIS','START_X_MM','START_Y_MM','END_X_MM','END_Y_MM','SAW_KERF_MM','CUT_KIND','PARENT_REGION_ID','RESULT_REGION_IDS','RETAINED_EDGE','COORDINATE_BASIS','PARENT_X_MM','PARENT_Y_MM','PARENT_WIDTH_MM','PARENT_LENGTH_MM','BLADE_CENTER_OFFSET_MM','RETAINED_SIZE_MM'];
export const REGION_COLUMNS = ['DOCUMENT_ID','SHEET_ID','SOURCE_SHEET_ID','REGION_ID','X_MM','Y_MM','WIDTH_MM','LENGTH_MM','STATE','PARENT_REGION_ID','CUT_ID','CHILD_REGION_IDS','PART_ID','COORDINATE_BASIS'];
export const SHEET_LAYOUT_COLUMNS = ['DOCUMENT_ID','SHEET_ID','SOURCE_SHEET_ID','MATERIAL_CODE','DECOR_CODE','THICKNESS_MM','SHEET_WIDTH_MM','SHEET_LENGTH_MM','PART_ID','SOURCE_PART_ID','X_MM','Y_MM','PLACED_WIDTH_MM','PLACED_LENGTH_MM','ROTATED_90','RAW_WIDTH_A_MM','RAW_LENGTH_B_MM','SHAPE','DXF_FILE','COORDINATE_BASIS'];

export function getSheetPlanTables(cutting,production,{language='tr'}={}) {
 const w=words[language],r=referenceWords[language],stocks=new Map(production.materials.map(stock=>[stock.id,stock]));
 return [
  {name:w.sheets,kind:'sheets',columns:[...w.sheetHeaders],rows:cutting.sheets.map((sheet,index)=>[sheetCode(index),translateMaterialName(sheet.materialName,language),stocks.get(sheet.materialId)?.decorCode??'',sheet.thickness,sheet.width,sheet.height,sheet.margin,sheet.kerf,sheet.placements.length,sheet.cuts.length,w.guillotine,sheet.sheetId??sheet.id])},
  {name:w.cuts,kind:'cuts',description:w.origin,note:r.fence,columns:[w.cutHeaders[0],w.cutHeaders[1],w.cutHeaders[2],w.cutHeaders[3],r.parentWidth,r.parentHeight,r.retained,r.retainedSize,r.bladeOffset,w.cutHeaders[8],w.cutHeaders[9],w.cutHeaders[10],w.cutHeaders[11],w.cutHeaders[4],w.cutHeaders[5]],rows:cutting.sheets.flatMap((sheet,index)=>sheet.cuts.map(cut=>{const ref=cutReference(sheet,cut);return [sheetCode(index),cut.sequence,cutCode(cut),cut.axis==='x'?w.vertical:w.horizontal,ref.parentWidth,ref.parentHeight,r[cut.retainedEdge],ref.retainedSizeMm,ref.bladeCenterOffsetMm,cut.kerf,cut.kind==='trim'?w.trim:w.separate,shortRegion(cut.parentRegionId),(cut.resultRegionIds??[]).map(shortRegion).join(', '),ref.parentX,ref.parentY];}))}
 ];
}

export function createCutSequenceCSV(cutting,production,documentInfo) {
 const stocks=new Map(production.materials.map(stock=>[stock.id,stock]));
 return csv([CUT_SEQUENCE_COLUMNS,...cutting.sheets.flatMap((sheet,index)=>sheet.cuts.map(cut=>{const ref=cutReference(sheet,cut);return [documentInfo.id,sheetCode(index),sheet.sheetId??sheet.id,stockCode(sheet),stocks.get(sheet.materialId)?.decorCode??'',num(sheet.thickness),cut.sequence,cut.cutId??cut.id,cut.axis.toUpperCase(),num(cut.x1),num(cut.y1),num(cut.x2),num(cut.y2),num(cut.kerf),cut.kind,cut.parentRegionId,(cut.resultRegionIds??[]).join('|'),cut.retainedEdge??'','STOCK_TOP_LEFT_X_RIGHT_Y_DOWN_BLADE_CENTERLINE',num(ref.parentX),num(ref.parentY),num(ref.parentWidth),num(ref.parentHeight),num(ref.bladeCenterOffsetMm),num(ref.retainedSizeMm)];}))]);
}

export function createRegionsCSV(cutting,partCodes,documentInfo) {
 return csv([REGION_COLUMNS,...cutting.sheets.flatMap((sheet,index)=>sheet.regions.map(region=>[documentInfo.id,sheetCode(index),sheet.sheetId??sheet.id,region.id,num(region.x),num(region.y),num(region.width),num(region.height),region.state,region.parentRegionId??'',region.cutId??'',(region.children??[]).join('|'),region.partId?partCodes.get(region.partId)??'':'','STOCK_TOP_LEFT_X_RIGHT_Y_DOWN']))]);
}

export function createSheetLayoutCSV(cutting,production,parts,partCodes,documentInfo) {
 const sources=new Map(parts.map(part=>[part.id,part])),stocks=new Map(production.materials.map(stock=>[stock.id,stock]));
 return csv([SHEET_LAYOUT_COLUMNS,...cutting.sheets.flatMap((sheet,index)=>sheet.placements.map(placement=>{
  const part=sources.get(placement.partId),code=partCodes.get(part.id);
  return [documentInfo.id,sheetCode(index),sheet.sheetId??sheet.id,stockCode(sheet),stocks.get(sheet.materialId)?.decorCode??'',num(sheet.thickness),num(sheet.width),num(sheet.height),code,part.id,num(placement.x),num(placement.y),num(placement.width),num(placement.height),placement.rotated?1:0,num(part.width),num(part.height),part.outline?'CONTOUR':'RECTANGLE',`dxf/${code}.dxf`,'STOCK_TOP_LEFT_X_RIGHT_Y_DOWN'];
 }))]);
}

function dxfDocument(entries,layers,extents,comment) {
 const lines=[],pair=(code,value)=>lines.push(String(code),String(value));let handle=0x11;
 const next=()=> (handle++).toString(16).toUpperCase();
 pair(0,'SECTION');pair(2,'HEADER');pair(9,'$ACADVER');pair(1,'AC1015');pair(9,'$INSUNITS');pair(70,4);pair(9,'$MEASUREMENT');pair(70,1);pair(9,'$LUNITS');pair(70,2);pair(9,'$LUPREC');pair(70,3);
 pair(9,'$EXTMIN');pair(10,extents.minX);pair(20,extents.minY);pair(30,0);pair(9,'$EXTMAX');pair(10,n(extents.maxX));pair(20,n(extents.maxY));pair(30,0);pair(0,'ENDSEC');
 pair(0,'SECTION');pair(2,'TABLES');pair(0,'TABLE');pair(2,'LAYER');pair(5,'10');pair(100,'AcDbSymbolTable');pair(70,layers.length);
 for(const layer of layers){pair(0,'LAYER');pair(5,next());pair(100,'AcDbSymbolTableRecord');pair(100,'AcDbLayerTableRecord');pair(2,layer.name);pair(70,0);pair(62,layer.color??7);pair(6,'CONTINUOUS');}
 pair(0,'ENDTAB');pair(0,'ENDSEC');pair(0,'SECTION');pair(2,'ENTITIES');pair(999,comment);
 for(const entry of entries){
  if(entry.comment){pair(999,entry.comment);continue;}
  pair(0,entry.type);pair(5,next());pair(100,'AcDbEntity');pair(8,entry.layer);
  if(entry.type==='LWPOLYLINE'){
   pair(100,'AcDbPolyline');pair(90,entry.points.length);pair(70,1);for(const point of entry.points){pair(10,n(point.x));pair(20,n(point.y));}
  }else if(entry.type==='LINE'){
   pair(100,'AcDbLine');pair(10,n(entry.x1));pair(20,n(entry.y1));pair(30,0);pair(11,n(entry.x2));pair(21,n(entry.y2));pair(31,0);
  }else{
   pair(100,'AcDbText');pair(10,n(entry.x));pair(20,n(entry.y));pair(30,0);pair(40,n(entry.height??18));pair(1,dxfText(entry.value));pair(50,entry.rotation??0);pair(7,'STANDARD');pair(72,1);pair(11,n(entry.x));pair(21,n(entry.y));pair(31,0);pair(100,'AcDbText');pair(73,2);
  }
 }
 pair(0,'ENDSEC');pair(0,'EOF');return lines.join('\r\n')+'\r\n';
}

function sheetDXF(cutting,partCodes,{cutsOnly=false,sheetIndex=null,language='tr',materials=[]}={}) {
 const entries=[],layerMap=new Map(),layers=(name,color=7)=>{if(!layerMap.has(name))layerMap.set(name,{name,color});return name;};let offset=0,maxHeight=0,minX=0,minY=0;
 for(const [index,sheet] of cutting.sheets.entries()){
  if(sheetIndex!==null&&sheetIndex!==index)continue;
  const code=sheetCode(index),x=offset,y=value=>sheet.height-value,border=layers(`${code}_STOCK`,8),labels=layers(`${code}_LABELS`,2);
  entries.push({comment:`${code} SHEET_JSON ${asciiJSON({id:sheet.sheetId??sheet.id,materialId:sheet.materialId,thickness:sheet.thickness,width:sheet.width,height:sheet.height,margin:sheet.margin,kerf:sheet.kerf,offsetX:x})}`});
  entries.push({type:'LWPOLYLINE',layer:border,points:[{x,y:0},{x:x+sheet.width,y:0},{x:x+sheet.width,y:sheet.height},{x,y:sheet.height}]});
  const material=materials.find(stock=>stock.id===sheet.materialId), heading=[translateMaterialName(sheet.materialName,language),material?.decorCode??'',`${n(sheet.thickness)} mm`].filter(Boolean).join(' / ');
  entries.push({type:'TEXT',layer:labels,value:`${code} ${n(sheet.width)}x${n(sheet.height)} T${n(sheet.thickness)} K${n(sheet.kerf)}`,x:x+sheet.width/2,y:sheet.height+35,height:20});
  entries.push({type:'TEXT',layer:labels,value:heading,x:x+sheet.width/2,y:sheet.height+65,height:Math.min(20,sheet.width/Math.max(1,heading.length*.8))});
  if(cutsOnly){
   for(const cut of sheet.cuts){
    const cutCode=`C${String(cut.sequence).padStart(3,'0')}`,layer=layers(`${code}_${cutCode}_${cut.kind==='trim'?'TRIM':'CUT'}`,1);
    entries.push({comment:`${code} ${cutCode} CUT_JSON ${asciiJSON({...cut,...cutReference(sheet,cut)})}`});
    entries.push({type:'LINE',layer,x1:x+cut.x1,y1:y(cut.y1),x2:x+cut.x2,y2:y(cut.y2)});
    entries.push({type:'TEXT',layer:labels,value:cutCode,x:x+(cut.x1+cut.x2)/2+(cut.axis==='x'?15:0),y:y((cut.y1+cut.y2)/2)+(cut.axis==='y'?15:0),height:12});
    minX=Math.min(minX,x+cut.x1,x+cut.x2);minY=Math.min(minY,y(cut.y1),y(cut.y2));
   }
  }else for(const placement of sheet.placements){
   const partCode=partCodes.get(placement.partId),outline=outlineOf(placement),layer=layers(`${code}_PART_${partCode}`);
   entries.push({comment:`${code} ${partCode} PLACEMENT_JSON ${asciiJSON({partId:placement.partId,instanceIndex:placement.instanceIndex,quantity:placement.quantity??1,x:placement.x,y:placement.y,width:placement.width,height:placement.height,rotated:placement.rotated})}`});
   entries.push({type:'LWPOLYLINE',layer,points:outline.map(point=>({x:x+placement.x+point.x,y:y(placement.y+point.y)}))});
   if(placement.outline)entries.push({type:'LWPOLYLINE',layer:layers(`${code}_BLANK_${partCode}`,8),points:[{x:x+placement.x,y:y(placement.y)},{x:x+placement.x+placement.width,y:y(placement.y)},{x:x+placement.x+placement.width,y:y(placement.y+placement.height)},{x:x+placement.x,y:y(placement.y+placement.height)}]});
   const region=contourMarkerRegions(outline,placement.width,placement.height).label,rotation=region&&region.width<80&&region.height>region.width?90:0;
   const textHeight=region?Math.min(18,(rotation?region.width:region.height)/3,(rotation?region.height:region.width)/(partCode.length*.8)):8;
   entries.push({type:'TEXT',layer:labels,value:partCode,x:x+placement.x+(region?.x??placement.width/2),y:y(placement.y+(region?.y??placement.height/2)),height:textHeight,rotation});
  }
  maxHeight=Math.max(maxHeight,sheet.height+90);offset+=sheet.width+100;
 }
 return dxfDocument(entries,[...layerMap.values()],{minX:n(minX),minY:n(minY),maxX:offset,maxY:maxHeight},cutsOnly?'SAW PASS CENTERLINES; MM; FOLLOW CSV SEQUENCE AND PARENT REGIONS; KERF SEPARATE; NOT CNC GCODE; STOCK AND LABELS ARE REFERENCES':'GUILLOTINE SHEET LAYOUT; RAW CUT CONTOURS MM; EDGE ALREADY DEDUCTED; BLANK LAYERS ARE RECTANGULAR SAW BLANKS; SHAPED NOTCHES REQUIRE SECONDARY MACHINING; STOCK AND LABELS ARE NOT CUTS');
}
export const createSheetLayoutDxf = (cutting,partCodes,options={}) => sheetDXF(cutting,partCodes,options);
export const createCutSequenceDxf = (cutting,options={}) => sheetDXF(cutting,new Map(),{...options,cutsOnly:true});

export function createCutSequenceHTML(cutting,production,documentInfo,{language='tr'}={}) {
 const w=words[language],r=referenceWords[language],format=value=>Number(n(value)).toLocaleString({ru:'ru-RU',tr:'tr-TR',en:'en-US'}[language],{maximumFractionDigits:9}),stocks=new Map(production.materials.map(stock=>[stock.id,stock]));let pages='';
 const batchSize=12;
 for(const [index,sheet] of cutting.sheets.entries())for(let start=0;start<sheet.cuts.length||start===0;start+=batchSize){
  const batch=sheet.cuts.slice(start,start+batchSize),rows=batch.map(cut=>{const ref=cutReference(sheet,cut);return [cut.sequence,cutCode(cut),`${cut.axis==='x'?w.vertical:w.horizontal} / ${cut.kind==='trim'?w.trim:w.separate}`,`${shortRegion(cut.parentRegionId)}\n${format(ref.parentWidth)} × ${format(ref.parentHeight)} mm`,`${r[cut.retainedEdge]}: ${format(ref.retainedSizeMm)}`,format(ref.bladeCenterOffsetMm),format(cut.kerf),(cut.resultRegionIds??[]).map(shortRegion).join(', ')];});
  const headings=[w.cutHeaders[1],w.cutHeaders[2],w.cutHeaders[3],r.parent,r.retainedSize,r.bladeOffset,w.cutHeaders[8],w.cutHeaders[11]];
  pages+=`<section data-cut-sheet="${sheetCode(index)}" data-cut-page="${Math.floor(start/batchSize)+1}"><h1>${escape(w.cuts)} · ${sheetCode(index)} · ${Math.floor(start/batchSize)+1}/${Math.max(1,Math.ceil(sheet.cuts.length/batchSize))}</h1><p>${escape(translateMaterialName(sheet.materialName,language))} · ${escape(stocks.get(sheet.materialId)?.decorCode??'')} · ${format(sheet.thickness)} mm · ${format(sheet.width)} × ${format(sheet.height)} mm · ${escape(documentInfo.id)} · ${escape(documentInfo.date)}</p><p>${escape(w.origin)}</p><p>${escape(w.instruction)}</p><p>${escape(r.fence)}</p><table><thead><tr>${headings.map(title=>`<th>${escape(title)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr data-cut-id="${escape(batch[i].cutId??batch[i].id)}" data-cut-parent-region="${escape(batch[i].parentRegionId)}" data-cut-sequence="${batch[i].sequence}">${row.map(value=>`<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="secondary">${escape(w.secondary)}</p></section>`;
 }
 return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${escape(w.cuts)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#182f29;margin:0}section{break-after:page;page-break-after:always}section:last-child{break-after:auto;page-break-after:auto}h1{font-size:19px;margin:0 0 7px}p{margin:5px 0}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:9px 0}th,td{border:1px solid #8b9d96;padding:4px;overflow-wrap:anywhere;white-space:pre-line;text-align:left}th{background:#edf2ef}th:first-child,td:first-child{width:7%}th:nth-child(4),td:nth-child(4){width:19%}thead{display:table-header-group}tr{break-inside:avoid}.secondary{font-size:11px}@media screen{body{background:#e6ece7}section{width:273mm;min-height:186mm;padding:12mm;margin:15px auto;background:white}}</style></head><body>${pages}</body></html>`;
}
