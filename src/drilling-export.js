/** Separate, annotated carcass-drilling handoff. These files are operation
 * schedules, never a CNC program or holes injected into the CUT contours. */
import { checkFactoryProject } from './factory-export.js';
import { generateDrillingPlan, DRILLING_DEFAULTS, getDrillingMeasurementFrame } from './drilling.js';
import { csvCell } from './project-io.js';
import { translatePrintText, translateBuiltInName, translateMaterialName } from './print-i18n.js';
import { createStoredZip } from './zip-store.js';
import { getDocumentInfo, printDocumentText, documentMetadataLine } from './print-document.js';

const n = (value, precision = 3) => String(Math.round(Number(value) * 10 ** precision) / 10 ** precision);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const languageOf = (project, language) => ['ru', 'tr', 'en'].includes(language ?? project.settings?.printLanguage) ? language ?? project.settings.printLanguage : 'tr';
// Text is formula-neutralised. Finite numeric cells (including signed direction
// vectors) stay numbers: the textual formula guard must not turn -1 into '-1.
const exact = value => ({ numeric: value, precision: 12 });
const cell = value => typeof value === 'number' ? (Number.isFinite(value) ? `"${n(value)}"` : '""') : value?.precision === 12 && Number.isFinite(value.numeric) ? `"${n(value.numeric, 12)}"` : csvCell(value);
const csv = rows => '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
const labels = {
  ru: { title: 'Сверловка корпуса', raw: 'Координаты заготовки без кромки', axis: 'Оси помещения: X/Z — план, Y — вверх; поворот шкафа учтён.', origin: 'A=0, B=0 — угол габаритного прямоугольника. A вправо, B вниз.', basis: 'Направления осей в собранном проекте', thickness: 'Толщина', diagram: 'Схема расположения отверстий; символы не задают диаметр инструмента.', op: 'Операция', marker: 'Метка', face: 'Сторона входа', diameter: 'Диаметр', depth: 'Глубина', axisLocal: 'Вектор A/B/T', pair: 'Соединение', setup: 'Задать в мастерской', clearance: 'Сквозное', pilot: 'Торцевое', countersink: 'Посадка головки', 'face-t-min': 'Пласть T=0', 'face-t-max': 'Пласть T=толщина', 'edge-a-min': 'Торец, сверление A+', 'edge-a-max': 'Торец, сверление A−', 'edge-b-min': 'Торец, сверление B+', 'edge-b-max': 'Торец, сверление B−', page: 'Лист', screw: 'Мебельный винт (конфирмат)', disabled: 'Включите опцию сверловки корпуса перед экспортом.', invalid: 'Исправьте ошибки проекта или сверловки перед экспортом.', empty: 'Нет соединений корпуса для сверловки.', heading: 'Отдельный комплект сверловки', material: 'Материал', settings: 'Параметры', remaining: 'Другие операции находятся на следующих листах этой детали.' },
  tr: { title: 'Gövde delik planı', raw: 'Bantsız ham parça koordinatları', axis: 'Oda eksenleri: X/Z plan düzlemi, Y yukarı; dolap dönüşü uygulanmıştır.', origin: 'A=0, B=0 dış sınır dikdörtgeninin köşesidir. A sağa, B aşağı.', basis: 'Monte edilmiş projedeki eksen yönleri', thickness: 'Kalınlık', diagram: 'Delik konum şeması; sembol boyutu takım çapını belirtmez.', op: 'İşlem', marker: 'İşaret', face: 'Giriş yüzeyi', diameter: 'Çap', depth: 'Derinlik', axisLocal: 'A/B/T vektörü', pair: 'Bağlantı', setup: 'Atölyede belirleyin', clearance: 'Geçiş deliği', pilot: 'Kenar deliği', countersink: 'Vida başı yuvası', 'face-t-min': 'Yüzey T=0', 'face-t-max': 'Yüzey T=kalınlık', 'edge-a-min': 'Kenar, delme A+', 'edge-a-max': 'Kenar, delme A−', 'edge-b-min': 'Kenar, delme B+', 'edge-b-max': 'Kenar, delme B−', page: 'Sayfa', screw: 'Mobilya vidası (konfirmat)', disabled: 'Dışa aktarmadan önce gövde delik planını etkinleştirin.', invalid: 'Dışa aktarmadan önce proje veya delik planı hatalarını düzeltin.', empty: 'Delik açılacak gövde bağlantısı yok.', heading: 'Ayrı delik planı paketi', material: 'Malzeme', settings: 'Ayarlar', remaining: 'Bu parçanın diğer işlemleri sonraki sayfalardadır.' },
  en: { title: 'Carcass drilling', raw: 'Unbanded cut-blank coordinates', axis: 'Room axes: X/Z are the floor plan, Y points up; cabinet rotation is applied.', origin: 'A=0, B=0 is the marked bounding-box corner. A points right and B down.', basis: 'Axis directions in the assembled project', thickness: 'Thickness', diagram: 'Hole location diagram; symbol sizes do not specify tool diameters.', op: 'Operation', marker: 'Marker', face: 'Entry surface', diameter: 'Diameter', depth: 'Depth', axisLocal: 'A/B/T vector', pair: 'Joint', setup: 'Set at workshop', clearance: 'Through hole', pilot: 'Edge pilot', countersink: 'Head seat', 'face-t-min': 'Face T=0', 'face-t-max': 'Face T=thickness', 'edge-a-min': 'Edge, drilling A+', 'edge-a-max': 'Edge, drilling A−', 'edge-b-min': 'Edge, drilling B+', 'edge-b-max': 'Edge, drilling B−', page: 'Page', screw: 'Furniture screw (confirmat)', disabled: 'Enable carcass drilling before exporting.', invalid: 'Correct project or drilling errors before exporting.', empty: 'No carcass joints to drill.', heading: 'Separate drilling package', material: 'Material', settings: 'Settings', remaining: 'Further operations for this part are on its following pages.' }
};

const mapWords = {
  ru: { project: 'Проект', kind: 'Тип', joint: 'Стык', screws: 'Винтов на деталь', kitScrews: 'Винтов в комплекте', operations: 'Операций', clearance: 'Сквозное', pilot: 'Торцевое', countersink: 'Головка', left: 'Слева', right: 'Справа', rear: 'Сзади', front: 'Спереди', bottom: 'Снизу', top: 'Сверху', view: 'Вид с пласти', tableFaces: 'Вход сверла с обеих пластей указан в таблице.', headProfile: 'Глубину и профиль посадки головки согласовать с винтом и инструментом.', edgeLegend: 'Внешние края', rawOnly: 'Размеры и координаты — для заготовки без кромки; повторно кромку не вычитать.', coverScope: 'Неподвижные стыки корпуса и крепление задников МДФ. Петли, направляющие и другие виды фурнитуры требуют отдельных схем.', coverPairs: 'Один идентификатор стыка J объединяет операции одного винта. Количество операций не равно количеству винтов.', coverFiles: 'Pxxxx совпадает с раскроем. Эти схемы имеют собственные оси; не накладывать их на схему раскроя и не зеркалить.', coverNotCnc: 'Ведомость и схемы для мастерской; не программа для станка.' },
  tr: { project: 'Proje', kind: 'Tür', joint: 'Bağlantı', screws: 'Parçadaki vida', kitScrews: 'Takımdaki vida', operations: 'İşlem', clearance: 'Geçiş', pilot: 'Kenar pilotu', countersink: 'Baş yuvası', left: 'Sol', right: 'Sağ', rear: 'Arka', front: 'Ön', bottom: 'Alt', top: 'Üst', view: 'Bakış yüzeyi', tableFaces: 'Her iki yüzeyden delme girişi tabloda belirtilmiştir.', headProfile: 'Baş yuvası derinliğini ve profilini vida ve takıma göre belirleyin.', edgeLegend: 'Dış kenarlar', rawOnly: 'Ölçüler ve koordinatlar bantsız ham parça içindir; bandı tekrar düşmeyin.', coverScope: 'Sabit gövde levhası birleşimleri ve MDF arkalık bağlantıları. Menteşeler, raylar ve diğer donanımlar ayrı delik şemaları gerektirir.', coverPairs: 'Bir J bağlantı kimliği aynı vidanın işlemlerini eşleştirir. İşlem sayısı vida sayısı değildir.', coverFiles: 'Pxxxx kesim listesiyle aynıdır. Bu şemaların kendi eksenleri vardır; kesim şeması üzerine bindirmeyin ve aynalamayın.', coverNotCnc: 'Atölye için işlem listesi ve şemalardır; makine programı değildir.' },
  en: { project: 'Project', kind: 'Type', joint: 'Joint', screws: 'Screws on part', kitScrews: 'Screws in set', operations: 'Operations', clearance: 'Through', pilot: 'Edge pilot', countersink: 'Head seat', left: 'Left', right: 'Right', rear: 'Rear', front: 'Front', bottom: 'Bottom', top: 'Top', view: 'View from face', tableFaces: 'Entry from either broad face is identified in the table.', headProfile: 'Agree head-seat depth and profile with the selected screw and tooling.', edgeLegend: 'Outer edges', rawOnly: 'Dimensions and coordinates refer to the unbanded cut blank; do not deduct banding again.', coverScope: 'Fixed carcass panel joints and MDF back attachments. Hinges, slides and other hardware need separate drilling patterns.', coverPairs: 'One J joint identifier links the operations for one screw. Operation count is not screw count.', coverFiles: 'Pxxxx matches cutting. These maps have their own axes; do not overlay a cutting drawing or mirror these maps.', coverNotCnc: 'Workshop schedules and maps; not a machine program.' }
};
const scopeWords = {
  ru: { cabinet: 'Шкаф', cabinets: 'Шкафы комплекта', selected: 'Выбранный шкаф', open: 'Открыть схемы' },
  tr: { cabinet: 'Dolap', cabinets: 'Takımdaki dolaplar', selected: 'Seçilen dolap', open: 'Şemaları aç' },
  en: { cabinet: 'Cabinet', cabinets: 'Cabinets in this set', selected: 'Selected cabinet', open: 'Open maps' }
};

const rearWords = {
  ru:{title:'Крепление задников',screw:'Саморез задника',nail:'Гвоздь задника',unsupported:'Требуется отдельное решение',partial:'Часть контактов пропущена',omitted:'Пропущены',review:'Проверьте замечания в checks.csv и ISSUES_JSON / OMITTED_CONTACTS_JSON в rear-fastening.csv.',method:'Крепёж',quantity:'Количество',receivers:'Опорные детали',part:'Задник',diameter:'Диаметр',length:'Длина',note:'Задник МДФ: саморезы и отдельные отверстия по схемам. Накладной задник ДВП 3 мм: гвозди, без автоматической сверловки. Количество крепежа не равно количеству операций.'},
  tr:{title:'Arkalık bağlantıları',screw:'Arkalık vidası',nail:'Arkalık çivisi',unsupported:'Ayrı çözüm gerekir',partial:'Bazı temaslar atlandı',omitted:'Atlanan',review:'checks.csv içindeki uyarıları ve rear-fastening.csv içindeki ISSUES_JSON / OMITTED_CONTACTS_JSON alanlarını kontrol edin.',method:'Bağlantı elemanı',quantity:'Adet',receivers:'Destek parçaları',part:'Arkalık',diameter:'Çap',length:'Boy',note:'MDF arkalık: vidalar ve ayrı şemalardaki delikler. Bindirme 3 mm sert lif arkalık: çiviler, otomatik delik yok. Bağlantı elemanı adedi işlem sayısı değildir.'},
  en:{title:'Back-panel fastenings',screw:'Back-panel screw',nail:'Back-panel nail',unsupported:'Separate solution required',partial:'Some contacts omitted',omitted:'Omitted',review:'Review checks.csv and the ISSUES_JSON / OMITTED_CONTACTS_JSON fields in rear-fastening.csv.',method:'Fastener',quantity:'Quantity',receivers:'Receiving parts',part:'Back panel',diameter:'Diameter',length:'Length',note:'MDF backs use screws and the separately mapped holes. Applied 3 mm hardboard backs use nails without automatic drilling. Fastener count is not operation count.'}
};
const fastenerType = hole => hole.fastenerType ?? 'confirmat';
function fastenerSpecification(hole,settings,language) {
  const type=fastenerType(hole),label=type==='rear-screw'?rearWords[language].screw:labels[language].screw;
  return `${label} ${n(hole.screwDiameter??settings.screwDiameter)} × ${n(hole.screwLength??settings.screwLength)} mm`;
}
function specificationLines(holes,settings,language) {
  return [...new Set(holes.map(hole=>fastenerSpecification(hole,settings,language)))];
}
export const REAR_FASTENING_COLUMNS=['DOCUMENT_ID','PART_ID','SOURCE_PART_ID','CABINET_ID','CABINET','DESCRIPTION','METHOD','FASTENER_TYPE','QUANTITY','DIAMETER_MM','LENGTH_MM','RECEIVING_PART_IDS','RECEIVING_SOURCE_PART_IDS','CONTACTS_JSON','REVIEW_STATUS','ISSUES_JSON','OMITTED_CONTACTS_JSON'];
function rearRows(plan,language,documentInfo) {
  const parts=new Map(plan.parts.map(part=>[part.id,part]));
  return (plan.rearFastenings??[]).map(rear=>{
    const part=parts.get(rear.partId),contacts=rear.contacts??[],issues=rear.issues??[],omitted=rear.omittedContacts??[];
    const review=rear.unsupported||rear.method==='unsupported'?'UNSUPPORTED':issues.length||omitted.length?'PARTIAL':'COMPLETE';
    return [documentInfo.id,rear.partCode,rear.partId,rear.cabinetId,translateBuiltInName(part?.cabinetName??rear.cabinetId,language,'cabinet'),translatePrintText(part?.name??'',language),rear.method,rear.method==='screw'?'rear-screw':rear.method==='nail'?'rear-nail':'unsupported',rear.quantity,rear.screwDiameter??'',rear.screwLength??'',[...new Set(contacts.map(contact=>contact.receivingPartCode))].filter(Boolean).join('|'),[...new Set(contacts.map(contact=>contact.receivingPartId))].filter(Boolean).join('|'),JSON.stringify(contacts),review,JSON.stringify(issues),JSON.stringify(omitted)];
  });
}
function createRearPages(plan,language,documentInfo,projectName,{firstPage=2,pageCount=1}={}) {
  const rows=rearRows(plan,language,documentInfo),w=rearWords[language],pages=[];
  for(let at=0;at<rows.length;at+=12){
    const batch=rows.slice(at,at+12),metadata=documentMetadataLine(documentInfo,{language,page:firstPage+pages.length,pageCount});
    const reviewNeeded=batch.some(row=>row[14]!=='COMPLETE');
    pages.push(`<section class="rear-fastening-page"><h1>${escape(w.title)}</h1><p>${escape(projectName)}</p><p>${escape(metadata)}</p><p>${escape(w.note)}</p><table><thead><tr>${[w.part,scopeWords[language].cabinet,w.method,w.quantity,w.receivers].map(text=>`<th>${escape(text)}</th>`).join('')}</tr></thead><tbody>${batch.map(row=>{
      const omittedCodes=[...new Set(JSON.parse(row[16]).map(contact=>contact.receivingPartCode))].filter(Boolean);
      return `<tr data-rear-part-id="${escape(row[2])}" data-rear-part-code="${escape(row[1])}" data-rear-method="${escape(row[6])}" data-rear-quantity="${row[8]}" data-rear-review-status="${row[14]}"><td>${escape(row[1])}<br>${escape(row[5])}</td><td>${escape(row[4])}</td><td>${escape(w[row[6]]??row[6])}${row[9]!==''&&row[10]!==''?`<br>${n(row[9])} × ${n(row[10])} mm`:''}${row[14]==='PARTIAL'?`<br>${escape(w.partial)}`:''}</td><td>${row[8]}</td><td>${escape(row[11].replaceAll('|',' / '))}${omittedCodes.length?`<br>${escape(w.omitted)}: ${escape(omittedCodes.join(' / '))}`:''}</td></tr>`;
    }).join('')}</tbody></table>${reviewNeeded?`<p>${escape(w.review)}</p>`:''}</section>`);
  }
  return pages;
}

const continuationWords = {
  ru: 'Продолжение таблицы. Все отверстия показаны на первом листе детали.',
  tr: 'Tablo devamı. Parçanın tüm delikleri ilk sayfada gösterilir.',
  en: 'Table continuation. All holes appear on the first sheet of this part.'
};
const screwCountWords = {
  ru: { two:'2 винта на стык', note:'Режим количества: 2 конфирмата на каждый поддерживаемый стык корпуса; крепёж задников имеет собственный шаг. Минимальные отступы сохраняются; максимальный шаг применяется только в автоматическом режиме.' },
  tr: { two:'Bağlantı başına 2 vida', note:'Adet modu: desteklenen her gövde birleşiminde 2 konfirmat; arkalık bağlantılarının aralığı ayrıdır. Minimum uç mesafeleri korunur; maksimum aralık yalnızca otomatik modda kullanılır.' },
  en: { two:'2 screws per joint', note:'Count mode: 2 confirmats per supported carcass joint; back attachments use their own spacing. Minimum end offsets are retained; maximum spacing applies only in automatic mode.' }
};
const measurementWords = {
  ru: {finished:'От готового края',note:'MEASUREMENT_A_MM/B_MM и таблицы схем используют выбранный отсчёт: RAW — заготовка без кромки, FINISHED — готовый край с кромкой. A_MM/B_MM, физические отверстия и машинные RAW-контуры не меняются.'},
  tr: {finished:'Bitmiş kenardan',note:'MEASUREMENT_A_MM/B_MM ve şema tabloları seçilen başlangıcı kullanır: RAW bantsız ham parça, FINISHED bantlı bitmiş kenar. A_MM/B_MM, gerçek delikler ve ham makine konturları değişmez.'},
  en: {finished:'From finished edge',note:'MEASUREMENT_A_MM/B_MM and map tables use the selected datum: RAW is the unbanded blank, FINISHED is the finished banded edge. A_MM/B_MM, physical holes and RAW machine contours are unchanged.'}
};
const denseWords = {
  ru: 'Плотная схема: отверстия находите по координатам A/B в таблице.',
  tr: 'Yoğun şema: delikleri tablodaki A/B koordinatlarıyla bulun.',
  en: 'Dense map: locate holes using the table A/B coordinates.'
};

const PAPER_WIDTH_MM = 190, PAGE_MAX_MM = 267, CANVAS_WIDTH = 1000, SMALL_FONT = 19, ROW_HEIGHT = 34;
// A conservative character limit also fits wide Latin capitals in Arial.
// Wrapping names avoids silently clipping the identity of a printed part.
function wrapText(value, limit = 52) {
  const lines = [];
  for (const paragraph of String(value ?? '').split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const chunks = [...word.matchAll(new RegExp(`.{1,${limit}}`, 'gu'))].map(match => match[0]);
      for (const chunk of chunks) {
        if (line && [...line + ' ' + chunk].length > limit) { lines.push(line); line = ''; }
        line = line ? line + ' ' + chunk : chunk;
      }
    }
    lines.push(line);
  }
  return lines;
}

function mapContext(part, language, options = {}) {
  const w = mapWords[language], l = labels[language], settings = { ...DRILLING_DEFAULTS, ...options.settings };
  const frame = getDrillingMeasurementFrame(part, settings);
  const showDiagram = options.showDiagram ?? (options.page ?? 1) === 1;
  const groupCount = new Set((options.allHoles ?? []).map(hole => `${n(hole.a)}:${n(hole.b)}`)).size;
  const edgeKeys = part.orientation === 'horizontal' ? ['left', 'right', 'rear', 'front'] : part.orientation === 'vertical-depth' ? ['rear', 'front', 'bottom', 'top'] : ['left', 'right', 'bottom', 'top'];
  // A/right and B/down are a view from +T for H/VD (A×B = −T),
  // and from −T for VW (A×B = +T). Calling every map T=0 would mirror it.
  const viewFace = part.orientation === 'vertical-width' ? '0' : n(part.thickness);
  const edges = ['A−', 'A+', 'B−', 'B+'].map((axis, index) => `${axis}: ${w[edgeKeys[index]]}`).join(' · ');
  const broadSides = part.orientation === 'horizontal' ? [w.bottom, w.top] : part.orientation === 'vertical-depth' ? [w.left, w.right] : [w.rear, w.front];
  const physicalFaces = `${language === 'ru' ? 'В шкафу' : language === 'tr' ? 'Dolap içinde' : 'In the cabinet'}: T=0 ${broadSides[0]}; T=${n(part.thickness)} ${broadSides[1]}.`;
  const info = options.documentInfo ?? { id: '—', date: '—' };
  const rows = [
    { text: `${options.code ?? part.partCode} · ${translatePrintText(part.name, language)}`, size: 22, limit: 43, step: 26, className: 'title' },
    { text: translateBuiltInName(part.cabinetName, language, 'cabinet') + ' · ' + l.title + ((options.pageCount ?? 1) > 1 ? ` · ${l.page} ${options.page ?? 1}/${options.pageCount}` : '') },
    { text: `${w.project}: ${options.projectName ?? '—'}` },
    { text: documentMetadataLine(info, { language, page: options.documentPage ?? options.page ?? 1, pageCount: options.documentPageCount ?? options.pageCount ?? 1 }) },
    { text: `${l.material}: ${options.materialName ?? '—'}` },
    ...specificationLines(options.allHoles??[],settings,language).map(text=>({text})),
    { text: `${w.screws}: ${options.screwCount ?? '—'} · ${w.kitScrews}: ${options.kitScrewCount ?? '—'}` },
    ...(settings.screwsPerJoint===2?[{text:screwCountWords[language].two}]:[]),
    { text: `${l.raw}: A ${n(part.width)} × B ${n(part.height)} × T ${n(part.thickness)} mm` },
    ...(settings.measureFromFinishedEdge?[{text:`${measurementWords[language].finished}: A ${n(frame.width)} × B ${n(frame.height)} mm`}]:[]),
    { text: { ru: '0,0 отмечен на схеме. A вправо, B вниз.', tr: '0,0 şemada işaretlidir. A sağa, B aşağı.', en: '0,0 is marked on the map. A right, B down.' }[language] },
    { text: physicalFaces },
    { text: `${w.view} T=${viewFace}.`, viewFace },
    { text: `${w.edgeLegend}: ${edges}`, edgeKeys },
    { text: printDocumentText('notToScale', language) },
    { text: printDocumentText('nominalTolerances', language) }
  ];
  let cursor = 30;
  const header = rows.flatMap(row => wrapText(row.text, row.limit ?? 52).map(text => {
    const item = { ...row, text, y: cursor, size: row.size ?? SMALL_FONT };
    cursor += row.step ?? 24;
    return item;
  }));
  const diagramY = cursor + 28, diagramEnd = diagramY + (showDiagram ? 300 : 0);
  const notes = [
    ...(!showDiagram ? [continuationWords[language]] : groupCount > 22 ? [denseWords[language]] : []),
    w.tableFaces, `${l.clearance}: T± · ${l.pilot}: A± / B± · ${l.countersink}: T±`, '* ' + w.headProfile
  ].flatMap(line => wrapText(line).map(text => ({ text })));
  notes.forEach((note, index) => { note.y = diagramEnd + 32 + index * 24; });
  const tableTop = notes.at(-1).y + 25, baseHeight = tableTop + 68;
  const capacity = Math.floor((PAGE_MAX_MM * CANVAS_WIDTH / PAPER_WIDTH_MM - baseHeight) / ROW_HEIGHT);
  const rowsPerPage = showDiagram ? Math.min(14, capacity) : capacity;
  if (rowsPerPage < 1) throw new Error('Drilling document header does not fit A4.');
  return { header, notes, diagramY, tableTop, baseHeight, rowsPerPage, viewFace, settings, edges, info, showDiagram };
}

export const DRILLING_COLUMNS = [
  'PART_ID', 'SOURCE_PART_ID', 'CABINET', 'OPERATION_ID', 'JOINT_ID', 'DESCRIPTION', 'FACE', 'A_MM', 'B_MM', 'THICKNESS_COORD_MM',
  'LOCAL_DIRECTION_A', 'LOCAL_DIRECTION_B', 'LOCAL_DIRECTION_T', 'WORLD_ENTRY_X_MM', 'WORLD_ENTRY_Y_MM', 'WORLD_ENTRY_Z_MM',
  'DIRECTION_X', 'DIRECTION_Y', 'DIRECTION_Z', 'DIAMETER_MM', 'DEPTH_MM', 'OPERATION', 'REQUIRES_SETUP',
  'RAW_A_SIZE_MM', 'RAW_B_SIZE_MM', 'PANEL_THICKNESS_MM', 'SCREW_DIAMETER_MM', 'SCREW_LENGTH_MM', 'DIMENSION_BASIS',
  'PANEL_ORIENTATION', 'PANEL_AXES', 'ENTRY_FACE_REFERENCE', 'GRAIN_AXIS', 'MEASUREMENT_A_MM', 'MEASUREMENT_B_MM', 'MEASUREMENT_BASIS', 'FASTENER_TYPE'
];

/** One validation result is shared by all standalone drilling formats. */
export function checkDrillingExport(project, { cabinetId = null } = {}) {
  const factory = checkFactoryProject(project, { cabinetId }), fullPlan = generateDrillingPlan(factory.production, { parts: factory.parts });
  // Solve in the full project order first: Pxxxx, operation and screw IDs must
  // still match the project-wide documents. A neighbouring cabinet's failed
  // joint is not a failure of the selected cabinet.
  let plan = fullPlan;
  if (cabinetId !== null) {
    const partIds = new Set(fullPlan.parts.filter(part => part.cabinetId === cabinetId).map(part => part.id));
    const applies = item => item.cabinetId !== undefined ? item.cabinetId === cabinetId : item.partId || item.receivingPartId || item.throughPartId
      ? [item.partId, item.receivingPartId, item.throughPartId].some(id => partIds.has(id)) : true;
    const scopedErrors = fullPlan.errors.filter(applies);
    plan = { ...fullPlan, parts: fullPlan.parts.filter(part => partIds.has(part.id)), holes: fullPlan.holes.filter(hole => hole.cabinetId === cabinetId), joints: fullPlan.joints.filter(applies),
      rearFastenings:(fullPlan.rearFastenings??[]).filter(rear=>rear.cabinetId===cabinetId), warnings: fullPlan.warnings.filter(applies), errors: scopedErrors, valid: scopedErrors.length === 0 };
  }
  const errors = [...factory.issues.filter(issue => issue.level === 'error'), ...(plan.errors ?? [])];
  return { factory, plan, cabinetId, errors, valid: factory.valid && plan.valid && plan.settings.enabled && (plan.holes.length > 0 || (plan.rearFastenings??[]).some(rear=>rear.quantity>0)) && !errors.length };
}

function requirePlan(project, language, options = {}) {
  const result = checkDrillingExport(project, options), text = labels[language];
  if (!result.plan.settings.enabled) throw new Error(text.disabled);
  if (!result.valid) {
    const error = new Error(result.factory.valid && result.plan.valid && !result.plan.holes.length ? text.empty : text.invalid);
    error.issues = result.errors; throw error;
  }
  return result;
}

function operationRows(plan, language) {
  const parts = new Map(plan.parts.map(part => [part.id, part]));
  return plan.holes.map(hole => {
    const part = parts.get(hole.partId);
    const frame = getDrillingMeasurementFrame(part, plan.settings);
    return [hole.partCode, hole.partId, translateBuiltInName(part.cabinetName, language, 'cabinet'), hole.id, hole.pairId, translatePrintText(part.name, language), hole.face,
      hole.a, hole.b, hole.thicknessCoordinate, hole.localDirection.a, hole.localDirection.b, hole.localDirection.t,
      hole.worldEntry.x, hole.worldEntry.y, hole.worldEntry.z, exact(hole.direction.x), exact(hole.direction.y), exact(hole.direction.z), hole.diameter, hole.depth ?? '', hole.kind, hole.requiresSetup || hole.depth === null ? 1 : 0,
      part.width, part.height, part.thickness, hole.screwDiameter??plan.settings.screwDiameter, hole.screwLength??plan.settings.screwLength, 'RAW_BLANK_EDGE_ALREADY_DEDUCTED', part.orientation, physicalBasis(part.orientation, language), labels[language][hole.face] ?? hole.face, part.grain ? 'B' : 'NONE',hole.a+frame.offset.a,hole.b+frame.offset.b,frame.basis.toUpperCase(),fastenerType(hole)];
  });
}

export function generateDrillingCSV(project, { language, cabinetId = null } = {}) {
  const lang = languageOf(project, language), { plan } = requirePlan(project, lang, { cabinetId });
  return csv([DRILLING_COLUMNS, ...operationRows(plan, lang)]);
}

const contourOf = part => part.drillingOutline ?? part.outline ?? [{ x: 0, y: 0 }, { x: part.width, y: 0 }, { x: part.width, y: part.height }, { x: 0, y: part.height }];
function physicalBasis(orientation, language) {
  return {
    ru: { horizontal: 'В самом шкафу: A слева→направо; B сзади→к фасаду; T=0 снизу, T=толщина сверху.', 'vertical-depth': 'В самом шкафу: A сзади→к фасаду; B снизу→вверх; T=0 слева, T=толщина справа.', 'vertical-width': 'В самом шкафу: A слева→направо; B снизу→вверх; T=0 сзади, T=толщина спереди.' },
    tr: { horizontal: 'Dolap içinde: A soldan→sağa; B arkadan→öne; T=0 alt yüzey, T=kalınlık üst yüzey.', 'vertical-depth': 'Dolap içinde: A arkadan→öne; B alttan→üste; T=0 sol yüzey, T=kalınlık sağ yüzey.', 'vertical-width': 'Dolap içinde: A soldan→sağa; B alttan→üste; T=0 arka yüzey, T=kalınlık ön yüzey.' },
    en: { horizontal: 'In the cabinet: A left→right; B rear→front; T=0 underside, T=thickness upper side.', 'vertical-depth': 'In the cabinet: A rear→front; B bottom→top; T=0 left side, T=thickness right side.', 'vertical-width': 'In the cabinet: A left→right; B bottom→top; T=0 rear side, T=thickness front side.' }
  }[language][orientation];
}

/** Keep callout text in two reserved columns outside the largest possible
 * panel contour. Hole coordinates are untouched. Sorting each column by Y
 * and spreading clustered entries prevents tall narrow panels from piling
 * all labels onto the same row. */
export function layoutDrillingCallouts(points, { low = 210, high = 475 } = {}) {
  const width = 38, height = 22, gap = 26;
  if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Invalid drilling label point.');
  const byX = [...points].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id)), split = Math.ceil(byX.length / 2), result = [];
  for (const [side, column] of [['left', byX.slice(0, split)], ['right', byX.slice(split)]]) {
    if ((column.length - 1) * gap > high - low) throw new Error('Drilling map must be paginated.');
    column.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
    const centers = column.map(point => Math.max(low, Math.min(high, point.y)));
    for (let index = 1; index < centers.length; index++) centers[index] = Math.max(centers[index], centers[index - 1] + gap);
    if (centers.length) centers[centers.length - 1] = Math.min(high, centers.at(-1));
    for (let index = centers.length - 2; index >= 0; index--) centers[index] = Math.min(centers[index], centers[index + 1] - gap);
    column.forEach((point, index) => result.push({ ...point, side, labelX: side === 'left' ? 40 : 912, labelY: centers[index] - height / 2, labelWidth: width, labelHeight: height, centerY: centers[index] }));
  }
  return result;
}

/** Local A/B coordinates are projected without mirroring. B is down on this
 * page regardless of the panel's orientation in the assembled cabinet. */
export function createDrillingPartSvg(part, holes, options = {}) {
  const { language = 'tr', code = part.partCode, page = 1, pageCount = 1 } = options;
  const lang = ['ru', 'tr', 'en'].includes(language) ? language : 'tr', l = labels[lang], w = mapWords[lang];
  if (!part.drillingBasis || ![part.width, part.height, part.thickness].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid drilling part frame.');
  let allHoles = options.allHoles ?? holes;
  if ([...holes, ...allHoles].some(hole => hole.partId !== part.id || ![hole.a, hole.b, hole.thicknessCoordinate, hole.diameter].every(Number.isFinite))) throw new Error('Invalid drilling operation.');
  const context = mapContext(part, lang, { ...options, allHoles, code, page, pageCount });
  const frame=getDrillingMeasurementFrame(part,context.settings);
  const display=hole=>({...hole,rawA:hole.a,rawB:hole.b,a:hole.a+frame.offset.a,b:hole.b+frame.offset.b});
  holes=holes.map(display);allHoles=allHoles.map(display);
  part={...part,width:frame.width,height:frame.height,drillingOutline:frame.outline};
  if (holes.length > context.rowsPerPage) throw new Error('Drilling map must be paginated to remain readable on A4.');
  const scale = Math.min(820 / part.width, 300 / part.height), dx = 85 + (820 - part.width * scale) / 2, dy = context.diagramY + (300 - part.height * scale) / 2;
  const height = context.baseHeight + holes.length * ROW_HEIGHT, paperHeight = height * PAPER_WIDTH_MM / CANVAS_WIDTH;
  const t = (x, y, text, attrs = '') => `<text x="${n(x)}" y="${n(y)}" ${attrs}>${escape(text)}</text>`;
  const groups = new Map();
  for (const hole of allHoles) { const key = `${n(hole.a)}:${n(hole.b)}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(hole); }
  const marks = new Map([...groups].map(([key], index) => [key, `G${String(index + 1).padStart(2, '0')}`]));
  const callouts = new Map(context.showDiagram && groups.size <= 22 ? layoutDrillingCallouts([...groups].map(([key, operations]) => ({ id: marks.get(key), key, x: dx + operations[0].a * scale, y: dy + operations[0].b * scale })), { low: context.diagramY + 25, high: context.diagramY + 290 }).map(callout => [callout.key, callout]) : []);
  const graphics = !context.showDiagram ? '' : [...groups].map(([key, operations]) => {
    const first = operations[0], x = dx + first.a * scale, y = dy + first.b * scale;
    const circles = operations.map(hole => `<circle class="${hole.kind === 'pilot' ? 'edge-hole' : 'face-hole'}" cx="${n(x)}" cy="${n(y)}" r="${n(Math.max(3, hole.diameter * scale / 2))}" data-operation-id="${escape(hole.id)}" data-fastener-type="${escape(fastenerType(hole))}" data-screw-diameter-mm="${n(hole.screwDiameter??context.settings.screwDiameter)}" data-screw-length-mm="${n(hole.screwLength??context.settings.screwLength)}" data-marker-id="${escape(marks.get(key))}" data-a-mm="${n(hole.rawA)}" data-b-mm="${n(hole.rawB)}" data-measurement-a-mm="${n(hole.a)}" data-measurement-b-mm="${n(hole.b)}" data-face="${escape(hole.face)}"/>`).join('');
    const edge = operations.find(hole => hole.face.startsWith('edge-'));
    const arrow = edge ? `<path data-drilling-edge-entry="${escape(marks.get(key))}" data-edge-operation-id="${escape(edge.id)}" data-direction-a="${edge.localDirection.a}" data-direction-b="${edge.localDirection.b}" d="M ${n(x - edge.localDirection.a * 18)} ${n(y - edge.localDirection.b * 18)} L ${n(x + edge.localDirection.a * 12)} ${n(y + edge.localDirection.b * 12)}" stroke="#b15d21" stroke-width="1.5" marker-end="url(#entry-arrow)"/>` : '';
    const label = callouts.get(key);
    if (!label) return `<g data-drilling-marker="${escape(marks.get(key))}">${circles}${arrow}</g>`;
    const targetX = label.side === 'left' ? label.labelX + label.labelWidth : label.labelX;
    const leader = `<path d="M ${n(x)} ${n(y)} L ${n(targetX)} ${n(label.centerY)}" fill="none" stroke="#9eb7a5" stroke-width="1" data-callout-for="${escape(label.id)}"/>`;
    const caption = `<g data-label-id="${escape(label.id)}" data-label-x="${n(label.labelX)}" data-label-y="${n(label.labelY)}" data-label-width="${label.labelWidth}" data-label-height="${label.labelHeight}"><rect x="${n(label.labelX)}" y="${n(label.labelY)}" width="${label.labelWidth}" height="${label.labelHeight}" rx="3" fill="#fff" stroke="#c1d5c4"/>${t(label.labelX + label.labelWidth / 2, label.centerY + 5, label.id, 'class="marker" text-anchor="middle"')}</g>`;
    return `${leader}${circles}${arrow}${caption}`;
  }).join('');
  const columns = [15, 95, 225, 290, 480, 565, 650, 720, 785, 910];
  const headers = ['ID', w.kind, l.marker, l.face, 'A mm', 'B mm', 'T mm', 'Ø mm', l.depth + ' mm', w.joint];
  const rows = holes.map((hole, index) => {
    const y = context.tableTop + 50 + index * ROW_HEIGHT, values = [hole.id, w[hole.kind], marks.get(`${n(hole.a)}:${n(hole.b)}`), l[hole.face] ?? hole.face, n(hole.a), n(hole.b), n(hole.thicknessCoordinate), n(hole.diameter), hole.depth === null ? '— *' : n(hole.depth), hole.pairId];
    return `<g data-table-operation-id="${escape(hole.id)}" data-fastener-type="${escape(fastenerType(hole))}" data-screw-diameter-mm="${n(hole.screwDiameter??context.settings.screwDiameter)}" data-screw-length-mm="${n(hole.screwLength??context.settings.screwLength)}" data-raw-a-mm="${n(hole.rawA)}" data-raw-b-mm="${n(hole.rawB)}" data-measurement-a-mm="${n(hole.a)}" data-measurement-b-mm="${n(hole.b)}" data-operation-kind="${escape(hole.kind)}" data-marker-id="${escape(marks.get(`${n(hole.a)}:${n(hole.b)}`))}"><rect x="8" y="${y - 18}" width="984" height="${ROW_HEIGHT}" fill="${index % 2 ? '#f4f7f4' : '#fff'}"/>${values.map((value, column) => t(columns[column], y, value, `class="table${column === 8 && hole.depth === null ? ' setup' : ''}"`)).join('')}</g>`;
  }).join('');
  const title = `${code} · ${translatePrintText(part.name, lang)}`;
  const header = context.header.map(row => t(15, row.y, row.text, `class="${row.className ?? 'small'}"${row.viewFace === undefined ? '' : ` data-view-from-t-mm="${row.viewFace}"`}${row.edgeKeys ? ' data-physical-edge-captions="true"' : ''}`)).join('');
  const grainMid = context.diagramY + 145;
  const grain = context.showDiagram && part.grain ? `<path d="M 960 ${context.diagramY + 30} L 960 ${context.diagramY + 245}" fill="none" stroke="#355b47" stroke-width="2" marker-start="url(#grain-arrow)" marker-end="url(#grain-arrow)" data-grain-axis="B"/>${t(990, grainMid, { ru: 'Текстура B', tr: 'Desen B', en: 'Grain B' }[lang], `font-weight="bold" text-anchor="middle" transform="rotate(-90 990 ${grainMid})"`)}` : '';
  const originLabelY = context.diagramY - 24;
  const diagram = !context.showDiagram ? '' : `<path data-drilling-contour="true" d="${contourOf(part).map((point, index) => `${index ? 'L' : 'M'} ${n(dx + point.x * scale)} ${n(dy + point.y * scale)}`).join(' ')} Z" fill="#f6f8f5" stroke="#355b47" stroke-width="1.5"/><path d="M ${n(dx)} ${n(dy)} h 30 M ${n(dx)} ${n(dy)} v 30" fill="none" stroke="#1b3e2b" stroke-width="2"/><path d="M ${n(dx)} ${n(dy)} L 108 ${originLabelY + 20}" fill="none" stroke="#9eb7a5" stroke-width="1"/><g data-label-id="origin" data-label-x="85" data-label-y="${originLabelY}" data-label-width="45" data-label-height="20">${t(108, originLabelY + 15, '0,0', 'text-anchor="middle" class="small"')}</g><g data-label-id="axes" data-label-x="800" data-label-y="${originLabelY}" data-label-width="112" data-label-height="20">${t(810, originLabelY + 15, 'A+ → B+ ↓', 'class="small"')}</g>${graphics}${grain}`;
  const definitions = !context.showDiagram ? '' : '<defs><marker id="entry-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#b15d21"/></marker><marker id="grain-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6Z" fill="#355b47"/></marker></defs>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAPER_WIDTH_MM}mm" height="${n(paperHeight)}mm" viewBox="0 0 1000 ${height}" role="img" aria-label="${escape(title + ' · ' + l.title)}" data-document-id="${escape(context.info.id)}" data-document-date="${escape(context.info.date)}" data-paper-width-mm="${PAPER_WIDTH_MM}" data-paper-height-mm="${n(paperHeight)}" data-font-em-mm="${n(SMALL_FONT * PAPER_WIDTH_MM / CANVAS_WIDTH)}" data-part-id="${escape(part.id)}" data-part-code="${escape(code)}" data-measurement-basis="${frame.basis}" data-map-role="${context.showDiagram ? 'diagram' : 'table'}" data-marker-mode="${groups.size <= 22 ? 'callouts' : 'coordinates'}" data-part-operation-count="${allHoles.length}" data-raw-origin-a-mm="${n(part.rawOrigin.a)}" data-raw-origin-b-mm="${n(part.rawOrigin.b)}" data-diagram-top="${context.diagramY}" data-diagram-scale="${n(scale, 12)}" data-diagram-x="${n(dx, 12)}" data-diagram-y="${n(dy, 12)}"><title>${escape(title + ' · ' + l.title)}</title>${definitions}<style>text{font-family:Arial,sans-serif;fill:#253d35;font-size:19px}.title{font-size:22px;font-weight:bold}.small{font-size:19px}.marker{font-size:19px;font-weight:bold;fill:#24523c}.table{font-size:19px}.setup{font-size:19px;fill:#9a4f11}.face-hole{fill:none;stroke:#287451;stroke-width:1.5}.edge-hole{fill:#fff4e9;stroke:#b15d21;stroke-width:1.5}</style><rect width="1000" height="${height}" fill="#fff"/>${header}${diagram}${context.notes.map(note => t(15, note.y, note.text, 'class="small"')).join('')}<rect x="8" y="${context.tableTop}" width="984" height="26" fill="#e8f0e5"/>${headers.map((heading, index) => t(columns[index], context.tableTop + 17, heading, 'class="table" font-weight="bold"')).join('')}${rows}</svg>`;
}

function readme(plan, language) {
  const s = plan.settings, common = `CONFIRMAT_PROFILE: SCREW=${n(s.screwDiameter)}×${n(s.screwLength)} mm; CLEARANCE=${n(s.clearanceDiameter)} mm; PILOT=${n(s.pilotDiameter)} mm; PILOT_EXTRA_DEPTH=${n(s.pilotExtraDepth)} mm; END_OFFSET=${n(s.endOffset)} mm; MAX_SPACING=${n(s.maxSpacing)} mm; SCREWS_PER_JOINT=${s.screwsPerJoint===2?'2':'AUTO'}; HEAD_SEAT_DIAMETER=${n(s.countersinkDiameter)} mm; HEAD_SEAT_DEPTH=${s.countersinkDepth === null ? 'UNSET' : n(s.countersinkDepth)} mm.`;
  const paragraphs = {
    ru: ['ATÖLYE — отдельная сверловка корпуса. Все размеры в мм.', 'Распознанные стыки несущих плит корпуса под конфирматы и крепление задников МДФ саморезами. Накладные задники ДВП 3 мм получают ведомость гвоздей без автоматической сверловки. Двери, ящики, съёмные полки, петли и направляющие не получают автоматическую сверловку.', 'drilling.csv: UTF-8 BOM, разделитель ;, десятичная точка. Одна строка — одна операция. PART_ID совпадает с Pxxxx в раскрое. SOURCE_PART_ID — внутренний идентификатор. JOINT_ID связывает сквозное отверстие, торцевое отверстие и посадку головки одного винта.', 'A_MM, B_MM и THICKNESS_COORD_MM — координаты точки входа на ЗАГОТОВКЕ без кромки. Размеры и отступы кромки уже учтены; повторно вычитать кромку нельзя. A и B на отдельных схемах идут вправо и вниз; не зеркальте схемы. Числа в таблице определяют положение отверстия, символы показывают его условно.', 'FACE: face-t-min / face-t-max — пласти при T=0 / T=толщина; edge-a-min / edge-a-max — вход в торец в направлении A+ / A−; edge-b-min / edge-b-max — вход в торец в направлении B+ / B−. Точка входа задаётся A_MM/B_MM: на фигурной детали это может быть край внутреннего выреза. LOCAL_DIRECTION_A/B/T — направление сверления от поверхности в плиту. Торцевые отверстия сверлят с указанного торца, а не с пласти.', 'WORLD_ENTRY_* и DIRECTION_* относятся к осям помещения с учётом размещения и поворота шкафа. В parts.csv оси A/B/T указаны векторами X/Y/Z; на схемах обозначены физические края и пласти. Эти столбцы служат проверке сопряжения; их нельзя принимать за координаты станка.', 'clearance — сквозное отверстие; pilot — торцевое пилотное отверстие; countersink — посадка головки. Пустая DEPTH_MM и REQUIRES_SETUP=1 означают, что глубину посадки головки и профиль инструмента должна задать мастерская по выбранному винту. Не выполнять такую операцию как отверстие с нулевой глубиной.', 'Это ведомость и схемы для мастерской, не программа CNC и не универсальная схема конкретной фурнитуры. Вылет винта, диаметр пилотного отверстия, глубину и профиль посадки головки согласуйте с крепежом и материалом. Настройки сохраняются в settings.csv.'],
    tr: ['ATÖLYE — ayrı gövde delik planı. Tüm ölçüler mm.', 'Konfirmat için tanımlanmış taşıyıcı gövde birleşimleri ve MDF arkalık vida bağlantıları. Bindirme 3 mm sert lif arkalıklar çivi listesi alır, otomatik delinmez. Kapaklar, çekmeceler, sökülebilir raflar, menteşeler ve raylar için otomatik delik açılmaz.', 'drilling.csv: UTF-8 BOM, ayırıcı ;, ondalık nokta. Her satır bir işlemdir. PART_ID kesim listesindeki Pxxxx koduyla aynıdır. SOURCE_PART_ID uygulama kimliğidir. JOINT_ID aynı vidanın geçiş deliğini, kenar deliğini ve baş yuvasını eşleştirir.', 'A_MM, B_MM ve THICKNESS_COORD_MM bantsız HAM PARÇADAKİ giriş noktası koordinatlarıdır. Bant ölçü ve payları zaten uygulanmıştır; kenar bandını tekrar düşmeyin. Şemalarda A sağa, B aşağı yönelir; şemayı aynalamayın. Tablo koordinatları kesin konumu verir, semboller şematiktir.', 'FACE: face-t-min / face-t-max T=0 / T=kalınlık yüzeyleridir; edge-a-min / edge-a-max A+ / A− yönünde kenar girişidir; edge-b-min / edge-b-max B+ / B− yönünde kenar girişidir. Giriş noktası A_MM/B_MM ile belirtilir; şekilli parçada iç oyuk kenarı olabilir. LOCAL_DIRECTION_A/B/T giriş yüzeyinden levhaya doğru delme yönüdür. Kenar deliği belirtilen kenardan açılır, geniş yüzeyden değil.', 'WORLD_ENTRY_* ve DIRECTION_* dolabın konumu ve dönüşü uygulanmış oda eksenlerini kullanır. parts.csv dosyasında A/B/T eksenleri X/Y/Z vektörleriyle belirtilir; şemalarda fiziksel kenarlar ve yüzeyler gösterilir. Bu sütunlar bağlantı doğrulama içindir; makine koordinatı olarak kullanmayın.', 'clearance geçiş deliğidir; pilot kenar pilot deliğidir; countersink vida başı yuvasıdır. Boş DEPTH_MM ve REQUIRES_SETUP=1 baş yuvası derinliğinin ve takım profilinin seçilen vidaya göre atölyede belirlenmesi gerektiğini gösterir. İşlemi sıfır derinlikli delik olarak uygulamayın.', 'Bu dosyalar atölye için işlem listesi ve şemalardır; CNC programı veya donanıma özel evrensel delik planı değildir. Vida çıkıntısını, pilot çapını, baş yuvası derinliğini ve profilini seçilen bağlantı elemanı ve malzemeyle doğrulayın. Ayarlar settings.csv dosyasındadır.'],
    en: ['ATÖLYE — separate carcass drilling schedule. All dimensions in mm.', 'Recognised load-bearing carcass butt joints use confirmats, and MDF backs use screws. Applied 3 mm hardboard backs receive a nail schedule without automatic drilling. Doors, drawer assemblies, removable shelves, hinges and slides do not receive automatic drilling.', 'drilling.csv: UTF-8 BOM, semicolon separator, decimal point. One row per operation. PART_ID matches Pxxxx in the cutting list. SOURCE_PART_ID is the internal identifier. JOINT_ID links the through hole, edge pilot and head seat for one screw.', 'A_MM, B_MM and THICKNESS_COORD_MM locate the entry point on the UNBANDED CUT BLANK. Band dimensions and offsets are already applied; never deduct them again. A is right and B down on the individual maps; do not mirror them. Table coordinates specify the location; symbols are schematic.', 'FACE: face-t-min / face-t-max are broad faces at T=0 / T=thickness; edge-a-min / edge-a-max enter an edge in the A+ / A− direction; edge-b-min / edge-b-max enter in the B+ / B− direction. A_MM/B_MM locate the entry, which may lie on an inner notch edge of a shaped panel. LOCAL_DIRECTION_A/B/T points from the entry surface into the panel. Edge pilots enter from the stated edge, not from a broad face.', 'WORLD_ENTRY_* and DIRECTION_* use room axes after cabinet placement and rotation. parts.csv gives A/B/T as X/Y/Z vectors; maps identify physical edges and broad faces. These columns verify mating holes and are not machine coordinates.', 'clearance is a through hole; pilot is an edge pilot; countersink is the head seat. Blank DEPTH_MM and REQUIRES_SETUP=1 mean the workshop must set head-seat depth and tool profile for the selected screw. Do not treat it as a zero-depth operation.', 'These are workshop schedules and maps, not a CNC program or a universal hardware drilling pattern. Confirm screw penetration, pilot diameter, head-seat depth and profile against the selected fastener and material. Settings are in settings.csv.']
  }[language];
  paragraphs.push({ ru: 'Код Pxxxx общий для раскроя и сверловки, но эти схемы используют собственные явно отмеченные оси. Их ориентация может отличаться от чертежа раскроя. Для сверления используйте координаты именно схемы сверловки. Размеры округлены до 0,001 мм, вектора в CSV — до 12 десятичных знаков; это точность записи, а не допуск изготовления. Сторона обзора отмечена на каждом SVG; сторона входа сверла дана отдельно для каждой операции.', tr: 'Pxxxx kodu kesim ve delik planında aynıdır; delik şemalarının kendi açıkça işaretli eksenleri vardır. Yönü kesim çiziminden farklı olabilir. Delme işlemlerinde delik şemasının koordinatlarını kullanın. Ölçüler 0,001 mm, CSV vektörleri 12 ondalık basamak hassasiyetindedir; bu kayıt hassasiyetidir, üretim toleransı değildir. Her SVG bakış yüzeyini gösterir; delme giriş yüzeyi her işlem için ayrı belirtilir.', en: 'Pxxxx codes are shared with cutting, but these maps have their own explicitly marked axes. Their orientation may differ from a cut-only drawing. Drill using the drilling-map coordinates. Dimensions are rounded to 0.001 mm and CSV vectors to 12 decimal places; this is recording precision, not a manufacturing tolerance. Each SVG identifies its viewing face; the drilling entry face is separately specified for every operation.' }[language]);
  paragraphs.push({ru:'FASTENER_TYPE и SCREW_DIAMETER_MM/SCREW_LENGTH_MM задают крепёж конкретной операции, а не общий винт для всего комплекта. rear-fastening.csv содержит способ, количество, размеры крепежа и опорные детали каждого задника; гвозди не создают строки отверстий в drilling.csv. Профиль CONFIRMAT_PROFILE относится только к стыкам корпуса.',tr:'FASTENER_TYPE ve SCREW_DIAMETER_MM/SCREW_LENGTH_MM her işlemin bağlantı elemanını belirtir, tüm takımın tek vidasını değil. rear-fastening.csv her arkalığın yöntemini, adedini, bağlantı elemanı ölçülerini ve destek parçalarını verir; çiviler drilling.csv içinde delik satırı oluşturmaz. CONFIRMAT_PROFILE yalnızca gövde birleşimlerine aittir.',en:'FASTENER_TYPE and SCREW_DIAMETER_MM/SCREW_LENGTH_MM specify the fastener for each operation, not one screw for the whole kit. rear-fastening.csv lists each back method, quantity, fastener dimensions and receiving parts; nails create no hole records in drilling.csv. CONFIRMAT_PROFILE applies only to carcass joints.'}[language]);
  paragraphs.push(continuationWords[language]);
  if(s.screwsPerJoint===2)paragraphs.push(screwCountWords[language].note);
  paragraphs.push(measurementWords[language].note);
  return paragraphs.join('\r\n\r\n') + '\r\n\r\n' + common + '\r\n';
}

function createReferenceHtml({ language, projectName, documentInfo, plan, pages, scopeName = '', navigation = [] }) {
  const l = labels[language], w = mapWords[language], s = scopeWords[language];
  const screwCount = new Set(plan.holes.map(hole => hole.pairId)).size, metadata = documentMetadataLine(documentInfo, { language, page: 1, pageCount: pages.length + 1 });
  const coverNotes = [rearWords[language].note,w.rawOnly, w.coverPairs, w.coverFiles, w.headProfile, w.coverScope, w.coverNotCnc, continuationWords[language], printDocumentText('notToScale', language), printDocumentText('nominalTolerances', language)];
  const links = navigation.length ? `<nav><ul>${navigation.map(link => `<li><a href="${escape(link.path)}">${escape(link.name)}</a></li>`).join('')}</ul></nav>` : '';
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${escape(l.heading)}</title><style>@page{size:A4 portrait;margin:10mm}body{font:3mm Arial;color:#253d35;margin:0}.cover{break-after:page;line-height:1.45;overflow-wrap:anywhere}section{break-after:page;break-inside:avoid}section:last-child{break-after:auto}.rear-fastening-page table{border-collapse:collapse;width:100%;table-layout:fixed}.rear-fastening-page th,.rear-fastening-page td{border:1px solid #cad6ce;text-align:left;padding:2mm;overflow-wrap:anywhere}.rear-fastening-page th{background:#edf3e9}.rear-fastening-page th:nth-child(1){width:17%}.rear-fastening-page th:nth-child(4){width:10%}.rear-fastening-page tr{break-inside:avoid}svg{display:block;width:190mm;height:auto;max-width:100%}h1{font-size:5mm}h2{font-size:4mm}p{margin:3mm 0}li{margin:3mm 0}a{color:inherit}@media screen{body{max-width:850px;margin:24px auto}section{margin:24px 0;border:1px solid #dde6db}}@media print{body{width:190mm}section{margin:0;border:0}nav{display:none}}</style></head><body><article class="cover" data-document-id="${escape(documentInfo.id)}"><h1>${escape(projectName)} · ${escape(l.heading)}</h1><p>${escape(metadata)}</p>${scopeName ? `<h2>${escape(s.selected)}: ${escape(scopeName)}</h2>` : ''}${specificationLines(plan.holes,plan.settings,language).map(text=>`<h2>${escape(text)}</h2>`).join('')}${(plan.rearFastenings??[]).some(rear=>rear.method==='nail')?`<h2>${escape(rearWords[language].nail)}: ${(plan.rearFastenings??[]).filter(rear=>rear.method==='nail').reduce((sum,rear)=>sum+rear.quantity,0)}</h2>`:''}<p>${escape(w.kitScrews)}: ${screwCount} · ${escape(w.operations)}: ${plan.holes.length}</p>${!plan.holes.length ? `<p>${escape(l.empty)}</p>` : ''}${links}<ul>${coverNotes.map(note => `<li>${escape(note)}</li>`).join('')}</ul><p>${escape(l.raw + '. ' + l.axis)}</p></article>${pages.join('')}</body></html>`;
}

export function buildDrillingFiles(project, { language, issuedAt, cabinetId = null } = {}) {
  const lang = languageOf(project, language), { plan, factory } = requirePlan(project, lang, { cabinetId }), l = labels[lang], w = mapWords[lang], s = scopeWords[lang];
  const documentInfo = getDocumentInfo(project, { issuedAt }), projectName = translateBuiltInName(project.name, lang, 'project'), kitScrewCount = new Set(plan.holes.map(hole => hole.pairId)).size;
  const files = [{ path:'rear-fastening.csv',content:csv([REAR_FASTENING_COLUMNS,...rearRows(plan,lang,documentInfo)]) }, { path: 'drilling.csv', content: csv([DRILLING_COLUMNS, ...operationRows(plan, lang)]) }, { path: 'README.txt', content: readme(plan, lang) },
    { path: 'settings.csv', content: csv([['PARAMETER', 'VALUE'], ...Object.entries(plan.settings).map(([key, value]) => [key, value === null ? 'UNSET' : typeof value === 'boolean' ? Number(value) : value])]) },
    { path: 'document-info.csv', content: csv([['DOCUMENT_ID', 'ISSUE_DATE', 'PROJECT', 'SCREW_COUNT', 'OPERATION_COUNT', 'SELECTED_CABINET_ID','REAR_SCREW_COUNT','REAR_NAIL_COUNT'], [documentInfo.id, documentInfo.date, projectName, kitScrewCount, plan.holes.length, cabinetId ?? '',(plan.rearFastenings??[]).filter(rear=>rear.method==='screw').reduce((sum,rear)=>sum+rear.quantity,0),(plan.rearFastenings??[]).filter(rear=>rear.method==='nail').reduce((sum,rear)=>sum+rear.quantity,0)]]) }];
  const pages = [], jobs = [];
  for (const part of plan.parts) {
    const holes = plan.holes.filter(hole => hole.partId === part.id);
    if (!holes.length) continue;
    const options = { language: lang, documentInfo, projectName, materialName: translateMaterialName(factory.production.materials.find(stock => stock.id === part.materialId)?.name, lang), settings: plan.settings, screwCount: new Set(holes.map(hole => hole.pairId)).size, kitScrewCount };
    // Page numbers themselves can add one wrapped metadata line. Reserve the
    // longest count before pagination so the final sheet can never shrink.
    const reserved = { ...options, allHoles: holes, page: 999, pageCount: 999, documentPage: 999, documentPageCount: 999 };
    const firstCapacity = mapContext(part, lang, { ...reserved, showDiagram: true }).rowsPerPage;
    const followingCapacity = mapContext(part, lang, { ...reserved, showDiagram: false }).rowsPerPage;
    const pageCount = 1 + Math.ceil(Math.max(0, holes.length - firstCapacity) / followingCapacity);
    let offset = 0;
    for (let page = 1; page <= pageCount; page++) {
      const suffix = pageCount === 1 ? '' : `-${String(page).padStart(2, '0')}`;
      const capacity = page === 1 ? firstCapacity : followingCapacity;
      jobs.push({ path: `maps/${part.partCode}${suffix}.svg`, part, holes: holes.slice(offset, offset + capacity), options: { ...options, allHoles: holes, showDiagram: page === 1, page, pageCount } });
      offset += capacity;
    }
  }
  const rearPageCount=Math.ceil((plan.rearFastenings??[]).length/12),totalPageCount=jobs.length+rearPageCount+1;
  pages.push(...createRearPages(plan,lang,documentInfo,projectName,{firstPage:2,pageCount:totalPageCount}));
  for (const [index, job] of jobs.entries()) {
    const svg = createDrillingPartSvg(job.part, job.holes, { ...job.options, documentPage: index + 2 + rearPageCount, documentPageCount: totalPageCount });
    files.push({ path: job.path, content: svg }); pages.push(`<section class="drilling-page">${svg}</section>`);
  }
  const metadata = documentMetadataLine(documentInfo, { language: lang, page: 1, pageCount: totalPageCount });
  const scopeName = cabinetId === null ? '' : translateBuiltInName(factory.selectedCabinet.name, lang, 'cabinet');
  files.find(file => file.path === 'README.txt').content = `${projectName}\r\n${metadata}\r\n${scopeName ? s.selected + ': ' + scopeName + '\r\n' : ''}\r\n` + files.find(file => file.path === 'README.txt').content;
  files.push({ path: 'parts.csv', content: csv([['PART_ID', 'SOURCE_PART_ID', 'CABINET', 'DESCRIPTION', 'MATERIAL', 'RAW_A_MM', 'RAW_B_MM', 'THICKNESS_MM', 'RAW_ORIGIN_A_FROM_FINISHED_MM', 'RAW_ORIGIN_B_FROM_FINISHED_MM', 'A_WORLD_X', 'A_WORLD_Y', 'A_WORLD_Z', 'B_WORLD_X', 'B_WORLD_Y', 'B_WORLD_Z', 'T_WORLD_X', 'T_WORLD_Y', 'T_WORLD_Z', 'GRAIN_AXIS', 'OPERATION_COUNT'], ...plan.parts.filter(part => plan.holes.some(hole => hole.partId === part.id)).map(part => [part.partCode, part.id, translateBuiltInName(part.cabinetName, lang, 'cabinet'), translatePrintText(part.name, lang), translateMaterialName(factory.production.materials.find(stock => stock.id === part.materialId)?.name, lang), part.width, part.height, part.thickness, part.rawOrigin.a, part.rawOrigin.b, ...['a', 'b', 't'].flatMap(axis => ['x', 'y', 'z'].map(world => exact(part.drillingBasis[axis][world]))), part.grain ? 'B' : 'NONE', plan.holes.filter(hole => hole.partId === part.id).length])]) });
  files.push({ path: 'drilling-reference.html', content: createReferenceHtml({ language: lang, projectName, documentInfo, plan, pages, scopeName, navigation: [{ path: 'cabinets/index.html', name: s.cabinets }] }) });
  const cabinetRows = [];
  for (const [index, cabinet] of project.cabinets.entries()) {
    if (cabinetId !== null && cabinet.id !== cabinetId) continue;
    const folder = `cabinet-${String(index + 1).padStart(3, '0')}`, path = `cabinets/${folder}/drilling.html`;
    const cabinetName = translateBuiltInName(cabinet.name, lang, 'cabinet'), cabinetJobs = jobs.filter(job => job.part.cabinetId === cabinet.id);
    const cabinetHoles = plan.holes.filter(hole => hole.cabinetId === cabinet.id), cabinetScrews = new Set(cabinetHoles.map(hole => hole.pairId)).size;
    const cabinetPlan={...plan,holes:cabinetHoles,rearFastenings:(plan.rearFastenings??[]).filter(rear=>rear.cabinetId===cabinet.id)},cabinetRearPageCount=Math.ceil(cabinetPlan.rearFastenings.length/12);
    const cabinetPages = [...createRearPages(cabinetPlan,lang,documentInfo,projectName,{firstPage:2,pageCount:cabinetJobs.length+cabinetRearPageCount+1}),...cabinetJobs.map((job, pageIndex) => `<section class="drilling-page">${createDrillingPartSvg(job.part, job.holes, { ...job.options, documentPage: pageIndex + 2 + cabinetRearPageCount, documentPageCount: cabinetJobs.length + cabinetRearPageCount + 1, kitScrewCount: cabinetScrews })}</section>`)];
    files.push({ path, content: createReferenceHtml({ language: lang, projectName, documentInfo, plan: cabinetPlan, pages: cabinetPages, scopeName: cabinetName }) });
    cabinetRows.push([cabinet.id, cabinetName, cabinetScrews, cabinetHoles.length, cabinetJobs.length, path, documentInfo.id]);
  }
  files.push({ path: 'cabinets.csv', content: csv([['CABINET_ID', 'CABINET', 'SCREW_COUNT', 'OPERATION_COUNT', 'MAP_PAGE_COUNT', 'REFERENCE_HTML', 'DOCUMENT_ID'], ...cabinetRows]) });
  files.push({ path: 'cabinets/index.html', content: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escape(s.cabinets)}</title><style>@page{size:A4 portrait;margin:10mm}body{font:3.5mm Arial;color:#253d35;max-width:190mm;margin:5mm auto;overflow-wrap:anywhere}h1{font-size:5mm}table{width:100%;border-collapse:collapse}td,th{padding:3mm;text-align:left;border-bottom:1px solid #cad6ce}tr{break-inside:avoid}a{color:inherit}</style></head><body><h1>${escape(projectName)} · ${escape(s.cabinets)}</h1><p>${escape(documentMetadataLine(documentInfo, { language: lang }))}</p><table><thead><tr><th>${escape(s.cabinet)}</th><th>${escape(w.kitScrews)}</th><th>${escape(w.operations)}</th><th>${escape(l.page)}</th><th>${escape(s.open)}</th></tr></thead><tbody>${cabinetRows.map(row => `<tr><td>${escape(row[1])}</td><td>${row[2]}</td><td>${row[3]}</td><td>${row[4]}</td><td><a href="${escape(row[5].slice('cabinets/'.length))}">${escape(s.open)}</a></td></tr>`).join('')}</tbody></table></body></html>` });
  const warningText = {
    ru: { scope: rearWords.ru.note+' Петли, направляющие, свободные полки и ящики не сверлятся автоматически.', 'countersink-setup': 'Глубину и профиль посадки головки необходимо согласовать с выбранным винтом и инструментом.', 'workshop-values': 'Отступы, шаг и запас глубины являются редактируемыми настройками мастерской.' },
    tr: { scope: rearWords.tr.note+' Menteşeler, raylar, serbest raflar ve çekmeceler otomatik delinmez.', 'countersink-setup': 'Vida başı yuvasının derinliği ve profili seçilen vida ve takıma göre belirlenmelidir.', 'workshop-values': 'Kenar mesafesi, delik aralığı ve ek derinlik atölyeye göre düzenlenebilir.' },
    en: { scope: rearWords.en.note+' Hinges, slides, loose shelves and drawers are not drilled automatically.', 'countersink-setup': 'Confirm the head-seat depth and profile against the selected screw and tool.', 'workshop-values': 'Edge distances, spacing and depth allowance are editable workshop settings.' }
  }[lang];
  if (plan.warnings.length) files.push({ path: 'checks.csv', content: csv([['LEVEL','CODE','DESCRIPTION','PART_ID','SOURCE_PART_ID','CABINET_ID','RECEIVING_PART_ID','RECEIVING_SOURCE_PART_ID'], ...plan.warnings.map(warning => ['warning',warning.code,warningText[warning.code]??translatePrintText(warning.message??warning.code,lang),warning.partCode??'',warning.partId??'',warning.cabinetId??'',warning.receivingPartCode??'',warning.receivingPartId??''])]) });
  return files;
}

export function generateDrillingZip(project, options = {}) {
  return createStoredZip(buildDrillingFiles(project, options));
}
