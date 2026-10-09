/** A fabrication handoff, not a saw/CNC program. Importers map the stable CSV
 * columns; DXF files contain one uncompensated closed cut outline in mm. */
import { generateParts, getPartEdgeBanding, optimizeCutting, validateProject } from './engine.js';
import { checkImport, csvCell } from './project-io.js';
import { polygonIsSimple, polygonArea } from './room-geometry.js';
import { createPartSvg, generateDrawingHTML, describePartEdges } from './renderer.js';
import { translatePrintText, translateMaterialName, translateBuiltInName } from './print-i18n.js';
import { createStoredZip } from './zip-store.js';
import { productionPartCode } from './production-id.js';
import { createCuttingSheetSvg } from './cutting-sheet.js';

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
export function checkFactoryProject(project) {
  checkImport(project);
  const production = { ...project, settings: { ...project.settings, deductEdge: true } };
  const parts = generateParts(production), issues = [...validateProject(production)];
  if (!parts.length) issues.push({ level: 'error', message: 'В проекте нет деталей для раскроя.' });
  for (const part of parts) {
    const stock = production.materials.find(material => material.id === part.materialId);
    const label = `${part.cabinetName} · ${part.name}`;
    if (![part.width, part.height, part.thickness, part.finishedWidth, part.finishedHeight].every(value => Number.isFinite(value) && value > 0)) issues.push({ level: 'error', message: `${label}: Некорректные размеры детали.` });
    if (!stock || Math.abs(stock.thickness - part.thickness) > EPS) issues.push({ level: 'error', message: `${label}: Толщина детали не совпадает с материалом.` });
    const outline = contourOf(part), polygon = outline.map(point => ({ x: point.x, z: point.y }));
    if (!polygonIsSimple(polygon) || Math.abs(polygonArea(polygon)) <= EPS || outline.some(point => point.x < -EPS || point.y < -EPS || point.x > part.width + EPS || point.y > part.height + EPS)) issues.push({ level: 'error', message: `${label}: Некорректный контур детали.` });
  }
  const cutting = optimizeCutting(parts, production.materials, production.settings);
  for (const rejected of cutting.unplaced) issues.push({ level: 'error', message: `${rejected.label}: ${rejected.reason}` });
  return { production, parts, cutting, issues, valid: !issues.some(issue => issue.level === 'error') };
}

function requireValid(project) {
  const result = checkFactoryProject(project);
  if (!result.valid) {
    const error = new Error('Исправьте ошибки проекта перед экспортом.');
    error.issues = result.issues; throw error;
  }
  return result;
}

function panelRows(parts, production, language) {
  const t = text => translatePrintText(text, language);
  return parts.map((part, index) => {
    const stock = production.materials.find(material => material.id === part.materialId), bands = getPartEdgeBanding(part).edges;
    const band = side => bands[side].lengthMm > 0 ? bands[side].thickness : 0;
    return [partCode(index), part.id, translateBuiltInName(part.cabinetName, language, 'cabinet'), part.sectionId ?? '', t(part.name), stockCode(part.materialId, part.thickness), translateMaterialName(stock.name, language), stock.decorCode ?? '', n(part.thickness), part.quantity ?? 1,
      n(part.height), n(part.width), n(part.finishedHeight), n(part.finishedWidth), part.grain ? 'LENGTH' : 'NONE', production.settings.allowRotate !== false && !part.grain ? 1 : 0,
      band('left'), band('right'), band('top'), band('bottom'), n(getPartEdgeBanding(part).lengthMeters), describePartEdges(part, { language }), part.outline ? 'CONTOUR' : 'RECTANGLE', `dxf/${partCode(index)}.dxf`, 'CUT_BLANK_EDGE_ALREADY_DEDUCTED'];
  });
}

export function generateFactoryCSV(project, { language } = {}) {
  const { production, parts } = requireValid(project);
  return csv([FACTORY_COLUMNS, ...panelRows(parts, production, languageOf(project, language))]);
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

function importNotes(language, dxfOnly = false) {
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
      'parts/Pxxxx.svg — чертежи деталей с размерами и кромимыми торцами. assembly.html — сборочные виды и ведомости, печать / сохранение PDF из браузера. cutting-reference.html и cutting/sheet-xxx.svg — справочная карта размещения деталей; не программа резов станка.',
      'Это задание фабрике. Сопоставление колонок, окончательную карту резов, пропил, поля и управляющую программу станка задаёт фабрика в своём ПО. Прямоугольные резы не заменяют обработку фигурного выреза.',
      'Схемы сверловки и конкретные монтажные узлы фурнитуры не моделируются. Направляющие боковые; их зазоры и длину, отступы петель и число петель нужно сверить с выбранной фурнитурой. Накладное дно ящика и накладной задник — выбранная здесь конструкция; не переносите эти размеры на ящики с пазовым дном или скрытыми направляющими.'
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
      'parts/Pxxxx.svg: ölçüler ve bantlanacak kenarların çizimleri. assembly.html: montaj görünümleri ve listeler; tarayıcıdan yazdırılabilir / PDF kaydedilebilir. cutting-reference.html ve cutting/sheet-xxx.svg parça yerleşim referansıdır; makine kesim programı değildir.',
      'Bu bir fabrika iş listesidir. Sütun eşleştirme, nihai kesim planı, testere payı, kenar boşlukları ve makine programını fabrika kendi yazılımında belirler. Dikdörtgen kesim, şekilli oyuğun işlenmesini kapsamaz.',
      'Delik planı ve donanımın özel montaj bağlantıları modellenmez. Yan ray boşluğunu ve boyunu, menteşe boşluklarını ve adedini seçilen donanımla kontrol edin. Çekmece tabanı ve arkalık bindirmelidir; bu ölçüleri kanallı tabana veya gizli raylara doğrudan uygulamayın.'
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
      'parts/Pxxxx.svg: part drawings with sizes and banded edges. assembly.html: assembly views and schedules; print / save PDF through a browser. cutting-reference.html and cutting/sheet-xxx.svg are reference part layouts, not machine cut programs.',
      'This is a factory handoff. The factory maps columns and generates the final cut sequence, kerf, margins and machine program in its own software. Rectangular sawing does not perform a shaped notch.',
      'Drilling patterns and hardware-specific joints are not modelled. Check side-mount slide clearance and length, hinge allowances and hinge count against the selected hardware. Drawer bottoms and backs are applied panels here; these sizes do not apply directly to grooved bottoms or undermount slides.'
    ]
  };
  if (dxfOnly) {
    const small = {
      ru: ['INFO_EDGE_LENGTH_1/2: торцы DXF при X=0 / X=CUT_WIDTH_MM. INFO_EDGE_WIDTH_1/2: Y=CUT_LENGTH_MM / Y=0. Толщина кромки в мм, 0 — без кромки. Внутренние края выреза в эти четыре стороны не входят.', 'Материал и толщина указаны в cut-list.csv. Полный комплект с ведомостью листов и сборочными видами скачивается отдельно.', 'Этот архив содержит только cut-list.csv, README.txt и dxf/Pxxxx.dxf.'],
      tr: ['INFO_EDGE_LENGTH_1/2: DXF kenarları X=0 / X=CUT_WIDTH_MM. INFO_EDGE_WIDTH_1/2: Y=CUT_LENGTH_MM / Y=0. Bant kalınlığı mm, 0 bant yok. İç oyuk kenarları bu dört kenara dahil değildir.', 'Malzeme ve kalınlık cut-list.csv içindedir. Levha listesi ve montaj görünümleri için tam paketi indirin.', 'Bu arşiv yalnızca cut-list.csv, README.txt ve dxf/Pxxxx.dxf içerir.'],
      en: ['INFO_EDGE_LENGTH_1/2: DXF edges at X=0 / X=CUT_WIDTH_MM. INFO_EDGE_WIDTH_1/2: Y=CUT_LENGTH_MM / Y=0. Values are band thickness in mm, 0 means no band. Inner notch edges are outside these four sides.', 'Material and gauge are in cut-list.csv. Download the full package for sheet specifications and assembly views.', 'This archive contains only cut-list.csv, README.txt and dxf/Pxxxx.dxf.']
    }[language];
    notes[language][5] = small[0]; notes[language][6] = small[1]; notes[language][8] = small[2];
  }
  return notes[language].join('\r\n\r\n') + '\r\n';
}

export function buildFactoryFiles(project, { language, dxfOnly = false } = {}) {
  const { production, parts, issues, cutting } = requireValid(project), lang = languageOf(project, language);
  const files = parts.map((part, index) => ({ path: `dxf/${partCode(index)}.dxf`, content: createPartDxf(part, { code: partCode(index) }) }));
  files.unshift({ path: 'cut-list.csv', content: csv([FACTORY_COLUMNS, ...panelRows(parts, production, lang)]) });
  files.push({ path: 'README.txt', content: importNotes(lang, dxfOnly) });
  if (!dxfOnly) {
    const stocks = new Map();
    for (const part of parts) {
      const code = stockCode(part.materialId, part.thickness);
      if (!stocks.has(code)) stocks.set(code, { stock: production.materials.find(material => material.id === part.materialId), thickness: part.thickness });
    }
    files.push({ path: 'materials.csv', content: csv([['MATERIAL_CODE', 'MATERIAL', 'MANUFACTURER', 'DECOR_CODE', 'THICKNESS_MM', 'SHEET_LENGTH_MM', 'SHEET_WIDTH_MM', 'GRAIN_AXIS'], ...[...stocks].map(([code, { stock, thickness }]) => [code, translateMaterialName(stock.name, lang), stock.manufacturer ?? '', stock.decorCode ?? '', n(thickness), stock.sheetHeight, stock.sheetWidth, stock.grain ? 'LENGTH' : 'NONE'])]) });
    files.push(...parts.map((part, index) => ({ path: `parts/${partCode(index)}.svg`, content: createPartSvg(part, production, { language: lang, partCode: partCode(index) }) })));
    files.push({ path: 'assembly.html', content: generateDrawingHTML(production, { language: lang }) });
    const t = text => escape(translatePrintText(text, lang));
    const reference = { ru: 'Справочная карта размещения — фабрика формирует последовательность резов в своём ПО.', tr: 'Referans parça yerleşimi — kesim sırasını fabrika kendi yazılımında oluşturur.', en: 'Reference part layout — the factory generates the cut sequence in its own software.' }[lang];
    const sheets = cutting.sheets.map((sheet, index) => {
      const svg = createCuttingSheetSvg(sheet, parts, { language: lang });
      files.push({ path: `cutting/sheet-${String(index + 1).padStart(3, '0')}.svg`, content: svg });
      return `<section><h2>${t('Лист')} ${index + 1} · ${escape(translateMaterialName(sheet.materialName, lang))} · ${n(sheet.thickness)} mm · ${sheet.width} × ${sheet.height} mm</h2>${svg}</section>`;
    });
    files.push({ path: 'cutting-reference.html', content: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${t('Раскрой')}</title><style>@page{size:A4 landscape;margin:10mm}body{font:12px Arial;color:#233c34;margin:0}h1{font-size:18px}h2{font-size:12px;margin:0 0 3mm}.plans{display:grid;grid-template-columns:1fr 1fr;gap:6mm}section{break-inside:avoid}svg{width:100%;height:145mm}@media screen{body{max-width:1200px;margin:24px auto;padding:20px}}@media print{h1,p{margin:0 0 4mm}}</style></head><body><h1>${escape(translateBuiltInName(project.name, lang, 'project'))} · ${t('Раскрой')}</h1><p>${escape(reference)} · ${t('Пропил')} ${n(production.settings.kerf)} mm · ${t('Отступ от края листа')} ${n(production.settings.margin)} mm</p><div class="plans">${sheets.join('')}</div></body></html>` });
    if (issues.length) files.push({ path: 'checks.txt', content: issues.map(issue => `${issue.level}: ${translatePrintText(issue.message, lang)}`).join('\r\n') + '\r\n' });
  }
  return files;
}

export function generateFactoryZip(project, options = {}) {
  return createStoredZip(buildFactoryFiles(project, options));
}
