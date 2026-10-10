/** A fabrication handoff with a shared guillotine layout and a numbered saw
 * sequence. DXF/CSV remain reviewable geometry, never machine-specific code. */
import { generateParts, getPartEdgeBanding, optimizeCutting, validateProject } from './engine.js';
import { checkImport, csvCell } from './project-io.js';
import { polygonIsSimple, polygonArea } from './room-geometry.js';
import { createPartSvg, generateDrawingHTML, describePartEdges } from './renderer.js';
import { translatePrintText, translateMaterialName, translateBuiltInName } from './print-i18n.js';
import { createStoredZip } from './zip-store.js';
import { productionPartCode } from './production-id.js';
import { createCuttingSheetPrintPages } from './cutting-sheet.js';
import { getDocumentInfo, documentMetadataLine, printDocumentText } from './print-document.js';
import { createWorkshopXlsx } from './workshop-xlsx.js';
import { getSheetPlanTables, createSheetLayoutDxf, createCutSequenceDxf, createCutSequenceCSV, createRegionsCSV, createSheetLayoutCSV, createCutSequenceHTML } from './factory-sheet-export.js';

const EPS = .001;
const n = value => String(Math.round(Number(value) * 1000) / 1000);
const languageOf = (project, language) => ['ru', 'tr', 'en'].includes(language ?? project.settings?.printLanguage) ? language ?? project.settings.printLanguage : 'tr';
const contourOf = part => part.outline ?? [{ x: 0, y: 0 }, { x: part.width, y: 0 }, { x: part.width, y: part.height }, { x: 0, y: part.height }];
const csv = rows => '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
const partCode = productionPartCode;
const stockCode = (materialId, thickness) => `${materialId}@${n(thickness)}mm`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export const FACTORY_COLUMNS = [
  'PART_ID', 'SOURCE_PART_ID', 'CABINET', 'SECTION_ID', 'DESCRIPTION', 'MATERIAL_CODE', 'MATERIAL', 'DECOR_CODE', 'THICKNESS_MM',
  'QUANTITY', 'CUT_LENGTH_MM', 'CUT_WIDTH_MM', 'FINISHED_LENGTH_MM', 'FINISHED_WIDTH_MM', 'GRAIN_AXIS', 'ROTATABLE',
  'INFO_EDGE_LENGTH_1_MM', 'INFO_EDGE_LENGTH_2_MM', 'INFO_EDGE_WIDTH_1_MM', 'INFO_EDGE_WIDTH_2_MM', 'INFO_EDGE_METERS',
  'EDGE_DESCRIPTION', 'SHAPE', 'DXF_FILE', 'DIMENSION_BASIS'
];

/** Validate the actual manufacturing draft, even for a legacy deductEdge=false
 * file. The source project and its selected materials are never changed. */
export function checkFactoryProject(project, { cabinetId = null } = {}) {
  checkImport(project);
  const production = { ...project, settings: { ...project.settings, deductEdge: true } };
  // Full order remains the source of production IDs, including in a cabinet
  // export. Validation/cutting scope must not renumber the selected parts.
  const parts = generateParts(production), selectedCabinet = cabinetId === null ? null : production.cabinets.find(cabinet => cabinet.id === cabinetId);
  const selectedParts = cabinetId === null ? parts : parts.filter(part => part.cabinetId === cabinetId);
  const partCodes = new Map(parts.map((part, index) => [part.id, partCode(index)]));
  // Pairwise placement errors are attributed to the first cabinet in a pair.
  // Put the selection first for validation only, so a collision involving it
  // remains visible in either project order. Part IDs use the untouched order.
  const validationProject = selectedCabinet ? { ...production, cabinets: [selectedCabinet, ...production.cabinets.filter(cabinet => cabinet !== selectedCabinet)] } : production;
  const issues = validateProject(validationProject).filter(issue => cabinetId === null || !issue.cabinetId || issue.cabinetId === cabinetId);
  if (cabinetId !== null && !selectedCabinet) issues.push({ level: 'error', message: 'Шкаф не найден.', cabinetId });
  if (!selectedParts.length) issues.push({ level: 'error', message: 'В проекте нет деталей для раскроя.', ...(cabinetId !== null ? { cabinetId } : {}) });
  for (const part of selectedParts) {
    const stock = production.materials.find(material => material.id === part.materialId);
    const label = `${part.cabinetName} · ${part.name}`;
    if (![part.width, part.height, part.thickness, part.finishedWidth, part.finishedHeight].every(value => Number.isFinite(value) && value > 0)) issues.push({ level: 'error', message: `${label}: Некорректные размеры детали.` });
    if (!stock || Math.abs(stock.thickness - part.thickness) > EPS) issues.push({ level: 'error', message: `${label}: Толщина детали не совпадает с материалом.` });
    const outline = contourOf(part), polygon = outline.map(point => ({ x: point.x, z: point.y }));
    if (!polygonIsSimple(polygon) || Math.abs(polygonArea(polygon)) <= EPS || outline.some(point => point.x < -EPS || point.y < -EPS || point.x > part.width + EPS || point.y > part.height + EPS)) issues.push({ level: 'error', message: `${label}: Некорректный контур детали.` });
  }
  const cutting = optimizeCutting(selectedParts, production.materials, production.settings, { partCodes });
  for (const rejected of cutting.unplaced) issues.push({ level: 'error', message: `${rejected.label}: ${rejected.reason}` });
  for (const error of cutting.errors ?? []) issues.push({ level:'error', message:error.message ?? String(error) });
  return { production, parts, selectedParts, partCodes, cabinetId, selectedCabinet, cutting, issues, valid: !issues.some(issue => issue.level === 'error') };
}

function requireValid(project, options = {}) {
  const result = checkFactoryProject(project, options);
  if (!result.valid) {
    const error = new Error('Исправьте ошибки проекта перед экспортом.');
    error.issues = result.issues; throw error;
  }
  return result;
}

function panelRows(parts, production, language, partCodes) {
  const t = text => translatePrintText(text, language);
  return parts.map((part) => {
    const code = partCodes.get(part.id);
    const stock = production.materials.find(material => material.id === part.materialId), bands = getPartEdgeBanding(part).edges;
    const band = side => bands[side].lengthMm > 0 ? bands[side].thickness : 0;
    return [code, part.id, translateBuiltInName(part.cabinetName, language, 'cabinet'), part.sectionId ?? '', t(part.name), stockCode(part.materialId, part.thickness), translateMaterialName(stock.name, language), stock.decorCode ?? '', n(part.thickness), part.quantity ?? 1,
      n(part.height), n(part.width), n(part.finishedHeight), n(part.finishedWidth), part.grain ? 'LENGTH' : 'NONE', production.settings.allowRotate !== false && !part.grain ? 1 : 0,
      band('left'), band('right'), band('top'), band('bottom'), n(getPartEdgeBanding(part).lengthMeters), describePartEdges(part, { language }), part.outline ? 'CONTOUR' : 'RECTANGLE', `dxf/${code}.dxf`, 'CUT_BLANK_EDGE_ALREADY_DEDUCTED'];
  });
}

export function generateFactoryCSV(project, { language, cabinetId = null } = {}) {
  const { production, selectedParts, partCodes } = requireValid(project, { cabinetId });
  return csv([FACTORY_COLUMNS, ...panelRows(selectedParts, production, languageOf(project, language), partCodes)]);
}

const WORKSHOP_FIELDS = ['CUT_WIDTH_MM', 'CUT_LENGTH_MM', 'QUANTITY', 'PART_ID', 'DESCRIPTION', 'CABINET', 'MATERIAL', 'DECOR_CODE', 'THICKNESS_MM', 'INFO_EDGE_LENGTH_1_MM', 'INFO_EDGE_LENGTH_2_MM', 'INFO_EDGE_WIDTH_1_MM', 'INFO_EDGE_WIDTH_2_MM', 'GRAIN_AXIS', 'ROTATABLE', 'SHAPE', 'FINISHED_WIDTH_MM', 'FINISHED_LENGTH_MM', 'DXF_FILE'];
const WORKSHOP_GROUP_FIELDS = ['CUT_WIDTH_MM', 'CUT_LENGTH_MM', 'QUANTITY', 'PART_ID', 'DESCRIPTION', 'CABINET', 'INFO_EDGE_LENGTH_1_MM', 'INFO_EDGE_LENGTH_2_MM', 'INFO_EDGE_WIDTH_1_MM', 'INFO_EDGE_WIDTH_2_MM', 'GRAIN_AXIS', 'SHAPE'];
const WORKSHOP_WORDS = {
  ru: { headers: ['Распил ширина A (мм), кромка вычтена', 'Распил длина B (мм), кромка вычтена', 'Количество', 'Код детали', 'Деталь', 'Шкаф', 'Материал', 'Код декора', 'Толщина (мм)', 'E1 Слева кромка (мм)', 'E2 Справа кромка (мм)', 'E3 Сверху кромка (мм)', 'E4 Снизу кромка (мм)', 'Направление текстуры', 'Поворот на 90°', 'Форма', 'Готовая ширина A (мм), с кромкой', 'Готовая длина B (мм), с кромкой', 'DXF отдельной детали'], grain: ['Без направления', 'Вдоль B (длины)'], rotation: ['Нет', 'Да'], shape: ['Прямоугольная', 'Фигурная'] },
  tr: { headers: ['Ham kesim en A (mm), bant düşülmüş', 'Ham kesim boy B (mm), bant düşülmüş', 'Adet', 'Parça kodu', 'Parça', 'Dolap', 'Malzeme', 'Dekor kodu', 'Kalınlık (mm)', 'E1 Sol bant (mm)', 'E2 Sağ bant (mm)', 'E3 Üst bant (mm)', 'E4 Alt bant (mm)', 'Damar yönü', '90° dönebilir', 'Şekil', 'Bitmiş en A (mm), bant dahil', 'Bitmiş boy B (mm), bant dahil', 'Tek parça DXF'], grain: ['Yönsüz', 'B boyunca (boy)'], rotation: ['Hayır', 'Evet'], shape: ['Dikdörtgen', 'Şekilli'] },
  en: { headers: ['Raw cut width A (mm), bands deducted', 'Raw cut length B (mm), bands deducted', 'Quantity', 'Part code', 'Part', 'Cabinet', 'Material', 'Decor code', 'Thickness (mm)', 'E1 Left band (mm)', 'E2 Right band (mm)', 'E3 Top band (mm)', 'E4 Bottom band (mm)', 'Grain direction', '90° rotation allowed', 'Shape', 'Finished width A (mm), with bands', 'Finished length B (mm), with bands', 'Individual part DXF'], grain: ['None', 'Along B (length)'], rotation: ['No', 'Yes'], shape: ['Rectangle', 'Contour'] }
};

function workshopTable(rows, language, documentInfo, production, cutting) {
  const words = WORKSHOP_WORDS[language];
  const numeric = new Set(['THICKNESS_MM', 'QUANTITY', 'CUT_LENGTH_MM', 'CUT_WIDTH_MM', 'FINISHED_LENGTH_MM', 'FINISHED_WIDTH_MM', 'INFO_EDGE_LENGTH_1_MM', 'INFO_EDGE_LENGTH_2_MM', 'INFO_EDGE_WIDTH_1_MM', 'INFO_EDGE_WIDTH_2_MM']);
  const records = rows.map(values => {
    const row = Object.fromEntries(FACTORY_COLUMNS.map((key, index) => [key, values[index]]));
    row.GRAIN_AXIS = words.grain[Number(row.GRAIN_AXIS === 'LENGTH')];
    row.ROTATABLE = words.rotation[Number(row.ROTATABLE === 1)];
    row.SHAPE = words.shape[Number(row.SHAPE === 'CONTOUR')];
    return row;
  });
  const sorted = [...records].sort((a,b) => String(a.MATERIAL).localeCompare(String(b.MATERIAL),language) || String(a.DECOR_CODE).localeCompare(String(b.DECOR_CODE),language) || Number(a.THICKNESS_MM)-Number(b.THICKNESS_MM) || String(a.PART_ID).localeCompare(String(b.PART_ID)));
  const values = (row, fields) => fields.map(key => numeric.has(key) ? Number(row[key]) : row[key]);
  const columns = fields => fields.map(key => words.headers[WORKSHOP_FIELDS.indexOf(key)]);
  const grouped = new Map();
  for (const row of sorted) {
    const source = production.materials.find(stock => stockCode(stock.id,Number(row.THICKNESS_MM)) === row.MATERIAL_CODE), key = JSON.stringify([source.id,row.DECOR_CODE,Number(row.THICKNESS_MM)]);
    if (!grouped.has(key)) grouped.set(key,{key,name:`${row.MATERIAL} · ${row.DECOR_CODE ? row.DECOR_CODE+' · ' : ''}${n(row.THICKNESS_MM)} mm`,materialId:source.id,materialName:row.MATERIAL,decorCode:row.DECOR_CODE,thickness:Number(row.THICKNESS_MM),sheetWidth:source.sheetWidth,sheetHeight:source.sheetHeight,columns:columns(WORKSHOP_GROUP_FIELDS),rows:[],columnWidths:[18,18,9,11,30,22,11,11,11,11,18,17]});
    grouped.get(key).rows.push(values(row,WORKSHOP_GROUP_FIELDS));
  }
  return {language,columns:[...words.headers],documentInfo,rows:sorted.map(row=>values(row,WORKSHOP_FIELDS)),groups:[...grouped.values()],sheets:getSheetPlanTables(cutting,production,{language})};
}

/** Shared typed workshop table for CSV and Excel exports. */
export function getWorkshopTable(project, { language, cabinetId = null } = {}) {
  const { production, selectedParts, partCodes, cutting } = requireValid(project, { cabinetId });
  const lang = languageOf(project, language);
  return workshopTable(panelRows(selectedParts, production, lang, partCodes), lang, getDocumentInfo(production), production, cutting);
}

/** Readable workshop list with the same raw dimensions as the machine CSV. */
export function generateWorkshopCSV(project, options = {}) {
  const table = getWorkshopTable(project, options);
  return csv([table.columns, ...table.rows]);
}

export function generateFactoryXLSX(project, options = {}) {
  return createWorkshopXlsx(getWorkshopTable(project, options));
}

/** AutoCAD 2000 ASCII DXF. Only CUT geometry is an entity: band annotations
 * stay in the CSV/SVG, so a CAM importer cannot mistake them for more cuts.
 * The SVG's down-positive Y is reflected to DXF's up-positive Y. */
export function createPartDxf(part, { code = 'PART' } = {}) {
  if (![part.width, part.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid DXF dimensions.');
  const outline = contourOf(part), points = outline.map(point => ({ x: point.x, z: point.y }));
  if (!polygonIsSimple(points) || Math.abs(polygonArea(points)) <= EPS || outline.some(point => point.x < -EPS || point.y < -EPS || point.x > part.width + EPS || point.y > part.height + EPS)) throw new Error('Invalid DXF contour.');
  const lines = [], pair = (group, value) => lines.push(String(group), String(value));
  pair(0, 'SECTION'); pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, 'AC1015'); pair(9, '$INSUNITS'); pair(70, 4); pair(9, '$MEASUREMENT'); pair(70, 1);
  pair(9, '$LUNITS'); pair(70, 2); pair(9, '$LUPREC'); pair(70, 3);
  pair(9, '$EXTMIN'); pair(10, 0); pair(20, 0); pair(30, 0);
  pair(9, '$EXTMAX'); pair(10, n(part.width)); pair(20, n(part.height)); pair(30, 0); pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'TABLES'); pair(0, 'TABLE'); pair(2, 'LAYER'); pair(5, '10'); pair(100, 'AcDbSymbolTable'); pair(70, 1);
  pair(0, 'LAYER'); pair(5, '11'); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbLayerTableRecord'); pair(2, 'CUT'); pair(70, 0); pair(62, 7); pair(6, 'CONTINUOUS'); pair(0, 'ENDTAB'); pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  pair(999, `${String(code).replace(/[^A-Za-z0-9_-]/g, '_')} CUT_BLANK MM; NO TOOL COMPENSATION; NO DRILLING`);
  pair(0, 'LWPOLYLINE'); pair(5, '12'); pair(100, 'AcDbEntity'); pair(8, 'CUT'); pair(100, 'AcDbPolyline'); pair(90, outline.length); pair(70, 1);
  for (const point of outline) { pair(10, n(point.x)); pair(20, n(part.height - point.y)); }
  pair(0, 'ENDSEC'); pair(0, 'EOF');
  return lines.join('\r\n') + '\r\n';
}

function importNotes(language, dxfOnly = false, singleCabinet = false) {
  const notes = {
    ru: [
      'ATÖLYE — заказ на раскрой. Все размеры в мм.',
      'cut-list.csv: UTF-8 BOM; разделитель ;, десятичная точка. Первая строка — названия колонок. Только детали, без итоговых строк. Одна строка — одна идентифицированная деталь; QUANTITY — количество.',
      'Размеры распила: CUT_LENGTH_MM и CUT_WIDTH_MM. Кромка УЖЕ ВЫЧТЕНА. Отключите автоматическое вычитание кромки в импортёре. INFO_EDGE_* — справочные поля для кромления, не повторное уменьшение размеров.',
      'Если фабрика принимает готовые размеры и сама вычитает кромку, сопоставьте FINISHED_LENGTH_MM и FINISHED_WIDTH_MM вместо CUT_* и согласуйте кромление. Используйте только одну пару размеров: полка готовая 600, кромка 1, распил 599, а не 598.',
      'LENGTH = B (высота чертежа детали); WIDTH = A (ширина). Размеры не сортируются по большей стороне. GRAIN_AXIS=LENGTH фиксирует B вдоль оси SHEET_LENGTH_MM; NONE означает отсутствие направленной текстуры. ROTATABLE=1 разрешает 90°, 0 запрещает.',
      'INFO_EDGE_LENGTH_1/2 — левый/правый торец на SVG (вдоль B); INFO_EDGE_WIDTH_1/2 — верхний/нижний торец SVG (вдоль A). Значение — толщина кромки мм, 0 — не кромить. Для фигурных деталей смотрите соответствующий SVG: внутренние края выреза не включены в эти четыре стороны.',
      'materials.csv: отдельный код для каждого материала и фактической толщины. Толщина должна совпадать с выбранным листом. DXF_FILE и Pxxxx связывают ведомость с файлами.',
      'dxf/Pxxxx.dxf: один замкнутый контур заготовки, слой CUT, AutoCAD 2000, 1 единица = 1 мм. Координата Y отражена относительно SVG для одинакового вида; никаких размеров, сверловки, припусков или компенсации фрезы в DXF нет. Количество берётся из CSV, не из числа файлов.',
      'parts/Pxxxx.svg — чертежи деталей с размерами и кромимыми торцами. assembly.html — обзор проекта; assembly/cabinet-xxx.html — подробные виды, проёмы, фасады и внутреннее наполнение каждого шкафа. Печать / сохранение PDF из браузера. cutting-reference.html и cutting/sheet-xxx.svg — справочная карта размещения деталей; не программа резов станка.',
      'Раскладка и последовательность гильотинных резов рассчитаны с пропилом и полями из настроек проекта. Сопоставление колонок, допустимость порядка и управляющую программу конкретного станка проверяет фабрика в своём ПО. Прямоугольные резы не заменяют обработку фигурного выреза.',
      'Опциональная сверловка корпуса под конфирматы выгружается отдельным пакетом и в этот архив не включена. Отверстия под конкретные петли и направляющие не моделируются. Направляющие боковые; их зазоры и длину, отступы петель и число петель нужно сверить с выбранной фурнитурой. Накладное дно ящика и накладной задник — выбранная здесь конструкция; не переносите эти размеры на ящики с пазовым дном или скрытыми направляющими.'
    ],
    tr: [
      'ATÖLYE — kesim siparişi. Tüm ölçüler mm.',
      'cut-list.csv: UTF-8 BOM; ayırıcı ;, ondalık nokta. İlk satır sütun adlarıdır. Yalnızca parçalar, toplam satırı yok. Her satır kimlikli bir parça; QUANTITY adet.',
      'Kesim ölçüleri: CUT_LENGTH_MM ve CUT_WIDTH_MM. Kenar bandı ZATEN DÜŞÜLMÜŞTÜR. İçe aktarmada otomatik bant düşümünü kapatın. INFO_EDGE_* bantlama için bilgi alanıdır; ölçüyü tekrar küçültmez.',
      'Fabrika bitmiş ölçü kabul edip bandı kendisi düşüyorsa CUT_* yerine FINISHED_LENGTH_MM ve FINISHED_WIDTH_MM alanlarını eşleştirin ve bantlamayı onaylayın. Yalnızca bir ölçü çifti kullanın: bitmiş raf 600, bant 1, kesim 599; 598 değil.',
      'LENGTH = B (parça çiziminin yüksekliği); WIDTH = A (genişliği). Ölçüler büyük kenara göre sıralanmaz. GRAIN_AXIS=LENGTH, B yönünü SHEET_LENGTH_MM eksenine sabitler; NONE yönsüz dekor. ROTATABLE=1 ile 90° dönüş serbest, 0 ile yasak.',
      'INFO_EDGE_LENGTH_1/2 SVG sol/sağ kenarları (B boyunca); INFO_EDGE_WIDTH_1/2 üst/alt kenarları (A boyunca). Değer bant kalınlığı mm, 0 bant yok. Şekilli parçada ilgili SVG dosyasına bakın; iç oyuk kenarları bu dört kenara dahil değildir.',
      'materials.csv her malzeme ve gerçek kalınlık için ayrı kod içerir. Kalınlık seçili levhayla aynı olmalıdır. DXF_FILE ve Pxxxx dosyaları listeyle eşleştirir.',
      'dxf/Pxxxx.dxf: tek kapalı ham parça konturu, CUT katmanı, AutoCAD 2000, 1 birim = 1 mm. SVG ile aynı görünüş için Y yansıtılmıştır. DXF içinde ölçülendirme, delik, pay veya freze telafisi yoktur. Adet CSV listesinden alınır; dosya sayısından değil.',
      'parts/Pxxxx.svg: ölçüler ve bantlanacak kenarların çizimleri. assembly.html: proje genel görünümü; assembly/cabinet-xxx.html: her dolabın ayrıntılı görünümleri, açıklıkları, kapakları ve iç bölmeleri. Tarayıcıdan yazdırılabilir / PDF kaydedilebilir. cutting-reference.html ve cutting/sheet-xxx.svg parça yerleşim referansıdır; makine kesim programı değildir.',
      'Yerleşim ve giyotin kesim sırası proje ayarlarındaki testere payı ve kenar boşluklarıyla hesaplanır. Fabrika sütun eşleştirmesini, sıranın uygunluğunu ve kendi makine programını kontrol eder. Dikdörtgen kesim, şekilli oyuğun işlenmesini kapsamaz.',
      'Konfirmat için isteğe bağlı gövde delik planı ayrı paket olarak indirilir; bu arşive dahil değildir. Seçilen menteşe ve rayların delikleri modellenmez. Yan ray boşluğunu ve boyunu, menteşe boşluklarını ve adedini seçilen donanımla kontrol edin. Çekmece tabanı ve arkalık bindirmelidir; bu ölçüleri kanallı tabana veya gizli raylara doğrudan uygulamayın.'
    ],
    en: [
      'ATÖLYE — cutting order. All dimensions in mm.',
      'cut-list.csv: UTF-8 BOM; semicolon separator, decimal point. First row is column names. Parts only, no total rows. Each row is one identified part; QUANTITY is its count.',
      'Cut dimensions: CUT_LENGTH_MM and CUT_WIDTH_MM. Edge bands are ALREADY DEDUCTED. Disable automatic edge deduction in the importer. INFO_EDGE_* are informational banding fields, not another deduction.',
      'If the factory accepts finished sizes and deducts bands itself, map FINISHED_LENGTH_MM and FINISHED_WIDTH_MM instead of CUT_* and confirm banding. Use only one size pair: finished shelf 600, band 1, cut 599, never 598.',
      'LENGTH = B (height in the part drawing); WIDTH = A (width). Dimensions are not sorted by the longer side. GRAIN_AXIS=LENGTH fixes B along the SHEET_LENGTH_MM axis; NONE means no directional grain. ROTATABLE=1 permits 90° rotation, 0 prohibits it.',
      'INFO_EDGE_LENGTH_1/2 are SVG left/right edges (along B); INFO_EDGE_WIDTH_1/2 are top/bottom edges (along A). Values are band thickness in mm, 0 means no band. For shaped parts refer to the matching SVG; inner notch edges are outside these four sides.',
      'materials.csv has a separate code for each material and actual gauge. The gauge must match the selected sheet. DXF_FILE and Pxxxx link files to the list.',
      'dxf/Pxxxx.dxf: one closed cut-blank contour, CUT layer, AutoCAD 2000, 1 unit = 1 mm. Y is reflected from the SVG to retain the same visual orientation. No dimensions, drilling, allowances or cutter compensation in the DXF. Quantity comes from the CSV, not the file count.',
      'parts/Pxxxx.svg: part drawings with sizes and banded edges. assembly.html: project overview; assembly/cabinet-xxx.html: detailed views, openings, fronts and internal compartments for each cabinet. Print / save PDF through a browser. cutting-reference.html and cutting/sheet-xxx.svg are reference part layouts, not machine cut programs.',
      'The layout and guillotine cut sequence use the project kerf and margins. The factory checks column mapping, sequence suitability and its machine program in its own software. Rectangular sawing does not perform a shaped notch.',
      'Optional confirmat carcass drilling is downloaded as a separate package and is not included in this archive. Holes for specific hinges and slides are not modelled. Check side-mount slide clearance and length, hinge allowances and hinge count against the selected hardware. Drawer bottoms and backs are applied panels here; these sizes do not apply directly to grooved bottoms or undermount slides.'
    ]
  };
  if (singleCabinet && !dxfOnly) {
    const overview = {
      ru: ['assembly.html — обзор проекта', 'assembly.html — сборочная схема выбранного шкафа'],
      tr: ['assembly.html: proje genel görünümü', 'assembly.html: seçilen dolabın ayrıntılı montaj şeması'],
      en: ['assembly.html: project overview', 'assembly.html: detailed assembly of the selected cabinet']
    }[language];
    notes[language][8] = notes[language][8].replace(overview[0], overview[1]);
  }
  if (dxfOnly) {
    const small = {
      ru: ['INFO_EDGE_LENGTH_1/2: торцы DXF при X=0 / X=CUT_WIDTH_MM. INFO_EDGE_WIDTH_1/2: Y=CUT_LENGTH_MM / Y=0. Толщина кромки в мм, 0 — без кромки. Внутренние края выреза в эти четыре стороны не входят.', 'Материал и толщина указаны в cut-list.csv. Полный комплект с ведомостью листов и сборочными видами скачивается отдельно.', 'В этом архиве: cut-list.csv, sheet-layout.csv, README.txt, dxf/sheets-all.dxf, отдельные листы dxf/sheets/, dxf/Pxxxx.dxf и последовательность резов cuts/.'],
      tr: ['INFO_EDGE_LENGTH_1/2: DXF kenarları X=0 / X=CUT_WIDTH_MM. INFO_EDGE_WIDTH_1/2: Y=CUT_LENGTH_MM / Y=0. Bant kalınlığı mm, 0 bant yok. İç oyuk kenarları bu dört kenara dahil değildir.', 'Malzeme ve kalınlık cut-list.csv içindedir. Levha listesi ve montaj görünümleri için tam paketi indirin.', 'Bu arşiv: cut-list.csv, sheet-layout.csv, README.txt, dxf/sheets-all.dxf, dxf/sheets/ ayrı levhaları, dxf/Pxxxx.dxf ve cuts/ kesim sırası içerir.'],
      en: ['INFO_EDGE_LENGTH_1/2: DXF edges at X=0 / X=CUT_WIDTH_MM. INFO_EDGE_WIDTH_1/2: Y=CUT_LENGTH_MM / Y=0. Values are band thickness in mm, 0 means no band. Inner notch edges are outside these four sides.', 'Material and gauge are in cut-list.csv. Download the full package for sheet specifications and assembly views.', 'This archive contains cut-list.csv, sheet-layout.csv, README.txt, dxf/sheets-all.dxf, individual sheets in dxf/sheets/, dxf/Pxxxx.dxf and the cuts/ sequence.']
    }[language];
    notes[language][5] = small[0]; notes[language][6] = small[1]; notes[language][8] = small[2];
  }
  const planNotes = {
    ru: ['dxf/sheets-all.dxf — фактическая раскладка выбранных деталей на листах, сгруппированных по материалу и толщине. Каждый лист Sxxx сдвинут вправо в общем DXF; dxf/sheets/sheet-xxx.dxf содержит один лист без сдвига. Замкнутые контуры Sxxx_PART_Pxxxx — размеры заготовок 1:1 в мм, кромка уже вычтена. Sxxx_STOCK, Sxxx_LABELS и Sxxx_BLANK_Pxxxx — справочные слои, не дополнительные контуры реза. BLANK — прямоугольная заготовка фигурной детали; внутренний вырез обрабатывается отдельно по dxf/Pxxxx.dxf.', 'sheet-layout.csv: координаты деталей от верхнего левого угла листа, X вправо, Y вниз; RAW_* — исходные размеры A/B, PLACED_* учитывают поворот. cuts/cut-sequence.csv и cuts/cut-sequence.html: нумерованные проходы по порядку на указанном исходном участке; ширина пропила SAW_KERF_MM указана отдельно. Координаты проходов — ось полотна от верхнего левого угла. cuts/cuts-all.dxf и cuts/sheet-xxx-cuts.dxf отражают Y для вида в CAD; LINE — ось прохода, STOCK и LABELS — справочные слои. Это последовательность для проверки оператором, а не программа ЧПУ или G-code.'],
    tr: ['dxf/sheets-all.dxf: seçili parçaların malzeme ve kalınlığa göre gerçek levha yerleşimi. Birleşik DXF içinde her Sxxx levhası sağa kaydırılmıştır; dxf/sheets/sheet-xxx.dxf tek levhayı kaydırmadan içerir. Kapalı Sxxx_PART_Pxxxx konturları 1:1 mm ham kesim ölçüleridir; bant zaten düşülmüştür. Sxxx_STOCK, Sxxx_LABELS ve Sxxx_BLANK_Pxxxx bilgi katmanlarıdır, ek kesim konturları değildir. BLANK, şekilli parçanın dikdörtgen ham parçasıdır; iç oyuk dxf/Pxxxx.dxf ile ayrıca işlenir.', 'sheet-layout.csv: parça koordinatları levhanın sol üstünden, X sağa/Y aşağı; RAW_* ilk A/B ölçülerini, PLACED_* dönüşü dikkate alan ölçüleri verir. cuts/cut-sequence.csv ve cuts/cut-sequence.html: belirtilen başlangıç bölgesinde numaralı geçiş sırası; testere payı SAW_KERF_MM ayrıca belirtilir. Geçiş koordinatları sol üstten bıçak merkez çizgisidir. cuts/cuts-all.dxf ve cuts/sheet-xxx-cuts.dxf CAD görünümü için Y eksenini yansıtır; LINE geçiş eksenidir, STOCK ve LABELS bilgi katmanlarıdır. Bu operatörün kontrol edeceği sıradır, CNC veya G-code programı değildir.'],
    en: ['dxf/sheets-all.dxf: actual selected-part sheet layouts grouped by material and gauge. Each Sxxx sheet is offset right in the combined DXF; dxf/sheets/sheet-xxx.dxf contains one sheet without the offset. Closed Sxxx_PART_Pxxxx contours are 1:1 raw cut sizes in mm; bands are already deducted. Sxxx_STOCK, Sxxx_LABELS and Sxxx_BLANK_Pxxxx are reference layers, not additional cut contours. BLANK is the rectangular sawn blank for a shaped part; its notch is machined separately using dxf/Pxxxx.dxf.', 'sheet-layout.csv: part coordinates from the sheet top-left, X right/Y down; RAW_* retains original A/B sizes and PLACED_* accounts for rotation. cuts/cut-sequence.csv and cuts/cut-sequence.html: numbered passes in sequence on the specified parent region; SAW_KERF_MM specifies the blade width separately. Pass coordinates are the blade centerline from the top-left. cuts/cuts-all.dxf and cuts/sheet-xxx-cuts.dxf reflect Y for CAD viewing; LINE is the pass axis, STOCK and LABELS are references. This is an operator-reviewed sequence, not a CNC or G-code program.']
  }[language];
  notes[language].splice(8, 0, ...planNotes);
  if (!dxfOnly) notes[language].splice(2, 0, {
    ru: 'kesim-listesi.xlsx — отдельная вкладка каждого материала, декора и толщины: первыми указаны ширина A и длина B заготовки, далее количество, код, деталь, шкаф, четыре кромки, текстура и форма; материал и размеры листа указаны в заголовке. Вкладки «Листы» и «Последовательность резов» соответствуют DXF. kesim-listesi.csv — общая читаемая ведомость с материалом и отдельными готовыми размерами. E1/E2 — левый/правый, E3/E4 — верхний/нижний торец SVG. Для распила используйте только колонки «Распил»; готовые размеры даны для сверки. Ось B — длина, A — ширина; значения не сортируются по большей стороне. Заголовки соответствуют языку печати. cut-list.csv сохраняет стабильные машинные колонки.',
    tr: 'kesim-listesi.xlsx: her malzeme, dekor ve kalınlık için ayrı sekme; önce ham en A ve boy B, sonra adet, kod, parça, dolap, dört bant, damar ve şekil. Malzeme ve levha ölçüsü başlıktadır. Levhalar ve Kesim sırası sekmeleri DXF ile aynıdır. kesim-listesi.csv malzeme ve ayrı bitmiş ölçülerle birleşik okunabilir listedir. E1/E2 SVG sol/sağ, E3/E4 üst/alt kenarıdır. Kesim için yalnızca «Ham kesim» sütunlarını kullanın; bitmiş ölçüler kontrol içindir. B boy, A en; değerler büyük kenara göre sıralanmaz. Başlıklar yazdırma dilindedir. cut-list.csv sabit makine sütunlarını korur.',
    en: 'kesim-listesi.xlsx: one tab for each material, decor and gauge, with raw width A and length B first, then quantity, code, part, cabinet, four bands, grain and shape; material and stock sizes are in the header. Sheets and Cut sequence tabs match the DXF. kesim-listesi.csv is the combined readable list with material and separate finished sizes. E1/E2 are SVG left/right, E3/E4 top/bottom edges. Use only the Raw cut columns for sawing; finished sizes are for checking. B is length, A is width; values are not sorted by the longer side. Headers use the print language. cut-list.csv retains stable machine columns.'
  }[language]);
  return notes[language].join('\r\n\r\n') + '\r\n';
}

export function buildFactoryFiles(project, { language, dxfOnly = false, cabinetId = null } = {}) {
  const { production, parts: allParts, selectedParts: parts, partCodes, selectedCabinet, issues, cutting } = requireValid(project, { cabinetId });
  const lang = languageOf(project, language), documentInfo = getDocumentInfo(production), cabinetName = selectedCabinet ? translateBuiltInName(selectedCabinet.name, lang, 'cabinet') : '';
  const cabinetNumber = selectedCabinet ? production.cabinets.indexOf(selectedCabinet) + 1 : '';
  const scopeLine = {
    ru: selectedCabinet ? `Комплект одного шкафа: ${cabinetName} · № ${cabinetNumber} · ${selectedCabinet.id}` : 'Комплект всех шкафов проекта.',
    tr: selectedCabinet ? `Tek dolap takımı: ${cabinetName} · No ${cabinetNumber} · ${selectedCabinet.id}` : 'Projedeki tüm dolapların takımı.',
    en: selectedCabinet ? `Single cabinet package: ${cabinetName} · No ${cabinetNumber} · ${selectedCabinet.id}` : 'All cabinets in the project.'
  }[lang];
  const sheetOptions = {language:lang,materials:production.materials};
  const files = parts.map(part => ({ path: `dxf/${partCodes.get(part.id)}.dxf`, content: createPartDxf(part, { code: partCodes.get(part.id) }) }));
  const rows = panelRows(parts, production, lang, partCodes);
  files.unshift({ path: 'cut-list.csv', content: csv([FACTORY_COLUMNS, ...rows]) });
  files.push({ path: 'dxf/sheets-all.dxf', content: createSheetLayoutDxf(cutting,partCodes,sheetOptions) });
  files.push({ path: 'sheet-layout.csv', content: createSheetLayoutCSV(cutting,production,parts,partCodes,documentInfo) });
  files.push({ path: 'cuts/regions.csv', content: createRegionsCSV(cutting,partCodes,documentInfo) });
  files.push({ path: 'cuts/cut-sequence.csv', content: createCutSequenceCSV(cutting,production,documentInfo) });
  files.push({ path: 'cuts/cuts-all.dxf', content: createCutSequenceDxf(cutting,sheetOptions) });
  files.push({ path: 'cuts/cut-sequence.html', content: createCutSequenceHTML(cutting,production,documentInfo,{language:lang}) });
  for(const [index] of cutting.sheets.entries()){
    const id=String(index+1).padStart(3,'0');
    files.push({ path:`dxf/sheets/sheet-${id}.dxf`,content:createSheetLayoutDxf(cutting,partCodes,{...sheetOptions,sheetIndex:index}) });
    files.push({ path:`cuts/sheet-${id}-cuts.dxf`,content:createCutSequenceDxf(cutting,{...sheetOptions,sheetIndex:index}) });
  }
  files.push({ path: 'README.txt', content: [documentMetadataLine(documentInfo, { language: lang }), scopeLine, printDocumentText('notToScale', lang), printDocumentText('nominalTolerances', lang), '', importNotes(lang, dxfOnly, cabinetId !== null)].join('\r\n') });
  if (!dxfOnly) {
    const table = workshopTable(rows, lang, documentInfo, production, cutting);
    files.push({ path: 'kesim-listesi.csv', content: csv([table.columns, ...table.rows]) });
    files.push({ path: 'kesim-listesi.xlsx', content: createWorkshopXlsx(table) });
    const stocks = new Map();
    for (const part of parts) {
      const code = stockCode(part.materialId, part.thickness);
      if (!stocks.has(code)) stocks.set(code, { stock: production.materials.find(material => material.id === part.materialId), thickness: part.thickness });
    }
    files.push({ path: 'materials.csv', content: csv([['MATERIAL_CODE', 'MATERIAL', 'MANUFACTURER', 'DECOR_CODE', 'THICKNESS_MM', 'SHEET_LENGTH_MM', 'SHEET_WIDTH_MM', 'GRAIN_AXIS'], ...[...stocks].map(([code, { stock, thickness }]) => [code, translateMaterialName(stock.name, lang), stock.manufacturer ?? '', stock.decorCode ?? '', n(thickness), stock.sheetHeight, stock.sheetWidth, stock.grain ? 'LENGTH' : 'NONE'])]) });
    files.push(...parts.map(part => ({ path: `parts/${partCodes.get(part.id)}.svg`, content: createPartSvg(part, production, { language: lang, partCode: partCodes.get(part.id) }) })));
    files.push({ path: 'assembly.html', content: generateDrawingHTML(production, { language: lang, cabinetId }) });
    files.push(...production.cabinets.flatMap((cabinet, index) => cabinetId !== null && cabinet.id !== cabinetId ? [] : [{ path: `assembly/cabinet-${String(index + 1).padStart(3, '0')}.html`, content: generateDrawingHTML(production, { cabinetId: cabinet.id, language: lang }) }]));
    files.push({ path: 'document-set.csv', content: csv([['DOCUMENT_SET_ID', 'ISSUE_DATE_ISTANBUL', 'PROJECT', 'DIMENSION_BASIS', 'EXPORT_SCOPE', 'CABINET_ID', 'CABINET', 'CABINET_NUMBER'], [documentInfo.id, documentInfo.date, translateBuiltInName(production.name, lang, 'project'), 'NOMINAL_CUT_BLANK_EDGE_ALREADY_DEDUCTED', cabinetId === null ? 'ALL_CABINETS' : 'SINGLE_CABINET', selectedCabinet?.id ?? '', cabinetName, cabinetNumber]]) });
    const t = text => escape(translatePrintText(text, lang));
    const configuration = `${translatePrintText('Пропил', lang)} ${n(production.settings.kerf)} mm · ${translatePrintText('Отступ от края листа', lang)} ${n(production.settings.margin)} mm`;
    const sheets = cutting.sheets.flatMap((sheet, index) => {
      const pages = createCuttingSheetPrintPages({ ...sheet, materialName: translateMaterialName(sheet.materialName, lang) }, allParts, { language: lang, sheetNumber: index + 1, documentInfo, configuration });
      return pages.map((svg, page) => {
        const suffix = pages.length > 1 ? `-${String(page + 1).padStart(2, '0')}` : '';
        files.push({ path: `cutting/sheet-${String(index + 1).padStart(3, '0')}${suffix}.svg`, content: svg });
        return `<section class="sheet">${svg}</section>`;
      });
    });
    files.push({ path: 'cutting-reference.html', content: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${t('Раскрой')}</title><style>@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{font:12px Arial;color:#233c34;margin:0;background:#e8ece7}.sheet{width:297mm;height:210mm;break-after:page;page-break-after:always;margin:16px auto;background:white}.sheet:last-child{break-after:auto;page-break-after:auto}.sheet svg{display:block;width:100%;height:100%}@media screen and (max-width:1150px){.sheet{width:94vw;height:auto;aspect-ratio:297/210}}@media print{body{background:white}.sheet{margin:0}}</style></head><body>${sheets.join('')}</body></html>` });
    if (issues.length) files.push({ path: 'checks.txt', content: issues.map(issue => `${issue.level}: ${translatePrintText(issue.message, lang)}`).join('\r\n') + '\r\n' });
  }
  return files;
}

export function generateFactoryZip(project, options = {}) {
  return createStoredZip(buildFactoryFiles(project, options));
}
