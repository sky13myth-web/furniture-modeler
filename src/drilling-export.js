/** Separate, annotated carcass-drilling handoff. These files are operation
 * schedules, never a CNC program or holes injected into the CUT contours. */
import { checkFactoryProject } from './factory-export.js';
import { generateDrillingPlan } from './drilling.js';
import { csvCell } from './project-io.js';
import { translatePrintText, translateBuiltInName, translateMaterialName } from './print-i18n.js';
import { createStoredZip } from './zip-store.js';

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

export const DRILLING_COLUMNS = [
  'PART_ID', 'SOURCE_PART_ID', 'CABINET', 'OPERATION_ID', 'JOINT_ID', 'DESCRIPTION', 'FACE', 'A_MM', 'B_MM', 'THICKNESS_COORD_MM',
  'LOCAL_DIRECTION_A', 'LOCAL_DIRECTION_B', 'LOCAL_DIRECTION_T', 'WORLD_ENTRY_X_MM', 'WORLD_ENTRY_Y_MM', 'WORLD_ENTRY_Z_MM',
  'DIRECTION_X', 'DIRECTION_Y', 'DIRECTION_Z', 'DIAMETER_MM', 'DEPTH_MM', 'OPERATION', 'REQUIRES_SETUP',
  'RAW_A_SIZE_MM', 'RAW_B_SIZE_MM', 'PANEL_THICKNESS_MM', 'SCREW_DIAMETER_MM', 'SCREW_LENGTH_MM', 'DIMENSION_BASIS',
  'PANEL_ORIENTATION', 'PANEL_AXES', 'ENTRY_FACE_REFERENCE', 'GRAIN_AXIS'
];

/** One validation result is shared by all standalone drilling formats. */
export function checkDrillingExport(project) {
  const factory = checkFactoryProject(project), plan = generateDrillingPlan(factory.production, { parts: factory.parts });
  const errors = [...factory.issues.filter(issue => issue.level === 'error'), ...(plan.errors ?? [])];
  return { factory, plan, errors, valid: factory.valid && plan.valid && plan.settings.enabled && plan.holes.length > 0 && !errors.length };
}

function requirePlan(project, language) {
  const result = checkDrillingExport(project), text = labels[language];
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
    return [hole.partCode, hole.partId, translateBuiltInName(part.cabinetName, language, 'cabinet'), hole.id, hole.pairId, translatePrintText(part.name, language), hole.face,
      hole.a, hole.b, hole.thicknessCoordinate, hole.localDirection.a, hole.localDirection.b, hole.localDirection.t,
      hole.worldEntry.x, hole.worldEntry.y, hole.worldEntry.z, exact(hole.direction.x), exact(hole.direction.y), exact(hole.direction.z), hole.diameter, hole.depth ?? '', hole.kind, hole.requiresSetup || hole.depth === null ? 1 : 0,
      part.width, part.height, part.thickness, plan.settings.screwDiameter, plan.settings.screwLength, 'RAW_BLANK_EDGE_ALREADY_DEDUCTED', part.orientation, physicalBasis(part.orientation, language), labels[language][hole.face] ?? hole.face, part.grain ? 'B' : 'NONE'];
  });
}

export function generateDrillingCSV(project, { language } = {}) {
  const lang = languageOf(project, language), { plan } = requirePlan(project, lang);
  return csv([DRILLING_COLUMNS, ...operationRows(plan, lang)]);
}

const vector = direction => ['x', 'y', 'z'].map(key => n(direction[key])).join(' / ');
const localVector = direction => ['a', 'b', 't'].map(key => n(direction[key])).join(' / ');
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
export function layoutDrillingCallouts(points) {
  const width = 38, height = 22, gap = 26, low = 210, high = 475;
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
export function createDrillingPartSvg(part, holes, { language = 'tr', code = part.partCode, page = 1, pageCount = 1 } = {}) {
  const lang = ['ru', 'tr', 'en'].includes(language) ? language : 'tr', l = labels[lang];
  if (!part.drillingBasis || ![part.width, part.height, part.thickness].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid drilling part frame.');
  if (holes.some(hole => hole.partId !== part.id || ![hole.a, hole.b, hole.thicknessCoordinate, hole.diameter].every(Number.isFinite))) throw new Error('Invalid drilling operation.');
  const scale = Math.min(820 / part.width, 300 / part.height), dx = 85 + (820 - part.width * scale) / 2, dy = 185 + (300 - part.height * scale) / 2;
  const height = 660 + holes.length * 28, t = (x, y, text, attrs = '') => `<text x="${n(x)}" y="${n(y)}" ${attrs}>${escape(text)}</text>`;
  const groups = new Map();
  for (const hole of holes) { const key = `${n(hole.a)}:${n(hole.b)}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(hole); }
  const marks = new Map([...groups].map(([key], index) => [key, `G${String(index + 1).padStart(2, '0')}`]));
  const callouts = new Map(layoutDrillingCallouts([...groups].map(([key, operations]) => ({ id: marks.get(key), key, x: dx + operations[0].a * scale, y: dy + operations[0].b * scale }))).map(callout => [callout.key, callout]));
  const graphics = [...groups].map(([key, operations]) => {
    const first = operations[0], x = dx + first.a * scale, y = dy + first.b * scale;
    const circles = operations.map(hole => `<circle class="${hole.kind === 'pilot' ? 'edge-hole' : 'face-hole'}" cx="${n(x)}" cy="${n(y)}" r="${n(Math.max(3, hole.diameter * scale / 2))}" data-operation-id="${escape(hole.id)}" data-a-mm="${n(hole.a)}" data-b-mm="${n(hole.b)}" data-face="${escape(hole.face)}"/>`).join('');
    const edge = operations.find(hole => hole.face.startsWith('edge-'));
    const arrow = edge ? `<path d="M ${n(x - edge.localDirection.a * 18)} ${n(y - edge.localDirection.b * 18)} L ${n(x + edge.localDirection.a * 12)} ${n(y + edge.localDirection.b * 12)}" stroke="#b15d21" stroke-width="1.5" marker-end="url(#entry-arrow)"/>` : '';
    const label = callouts.get(key), targetX = label.side === 'left' ? label.labelX + label.labelWidth : label.labelX;
    const leader = `<path d="M ${n(x)} ${n(y)} L ${n(targetX)} ${n(label.centerY)}" fill="none" stroke="#9eb7a5" stroke-width="1" data-callout-for="${escape(label.id)}"/>`;
    const caption = `<g data-label-id="${escape(label.id)}" data-label-x="${n(label.labelX)}" data-label-y="${n(label.labelY)}" data-label-width="${label.labelWidth}" data-label-height="${label.labelHeight}"><rect x="${n(label.labelX)}" y="${n(label.labelY)}" width="${label.labelWidth}" height="${label.labelHeight}" rx="3" fill="#fff" stroke="#c1d5c4"/>${t(label.labelX + label.labelWidth / 2, label.centerY + 5, label.id, 'class="marker" text-anchor="middle"')}</g>`;
    return `${leader}${circles}${arrow}${caption}`;
  }).join('');
  const columns = [15, 120, 175, 335, 420, 505, 565, 645, 780, 895];
  const headers = [l.op, l.marker, l.face, 'A mm', 'B mm', 'T mm', 'Ø mm', l.depth + ' mm', l.axisLocal, l.pair];
  const rows = holes.map((hole, index) => {
    const y = 650 + index * 28, values = [hole.id, marks.get(`${n(hole.a)}:${n(hole.b)}`), l[hole.face] ?? hole.face, n(hole.a), n(hole.b), n(hole.thicknessCoordinate), n(hole.diameter), hole.depth === null ? '— *' : n(hole.depth), localVector(hole.localDirection), hole.pairId];
    return `<rect x="8" y="${y - 18}" width="984" height="28" fill="${index % 2 ? '#f4f7f4' : '#fff'}"/>${values.map((value, column) => t(columns[column], y, value, `class="table${column === 7 && hole.depth === null ? ' setup' : ''}"`)).join('')}`;
  }).join('');
  const title = `${code} · ${translatePrintText(part.name, lang)}`, cabinet = translateBuiltInName(part.cabinetName, lang, 'cabinet');
  const basis = ['a', 'b', 't'].map(axis => `${axis.toUpperCase()}=[${vector(part.drillingBasis[axis])}]`).join('    ');
  const grain = part.grain ? `<path d="M 960 215 L 960 430" fill="none" stroke="#355b47" stroke-width="2" marker-start="url(#grain-arrow)" marker-end="url(#grain-arrow)" data-grain-axis="B"/>${t(990, 322, { ru: 'Текстура B', tr: 'Desen B', en: 'Grain B' }[lang], 'font-weight="bold" text-anchor="middle" transform="rotate(-90 990 322)"')}` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}" role="img" aria-label="${escape(title + ' · ' + l.title)}" data-part-id="${escape(part.id)}" data-part-code="${escape(code)}" data-raw-origin-a-mm="${n(part.rawOrigin.a)}" data-raw-origin-b-mm="${n(part.rawOrigin.b)}" data-diagram-scale="${n(scale, 12)}" data-diagram-x="${n(dx, 12)}" data-diagram-y="${n(dy, 12)}"><title>${escape(title + ' · ' + l.title)}</title><defs><marker id="entry-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#b15d21"/></marker><marker id="grain-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6Z" fill="#355b47"/></marker></defs><style>text{font-family:Arial,sans-serif;fill:#253d35;font-size:13px}.title{font-size:22px;font-weight:bold}.small{font-size:13px}.marker{font-size:13px;font-weight:bold;fill:#24523c}.table{font-size:15px}.setup{font-size:15px;fill:#9a4f11}.face-hole{fill:none;stroke:#287451;stroke-width:1.5}.edge-hole{fill:#fff4e9;stroke:#b15d21;stroke-width:1.5}</style><rect width="1000" height="${height}" fill="#fff"/>${t(15, 30, title, 'class="title"')}${t(15, 53, cabinet + ' · ' + l.title + (pageCount > 1 ? ` · ${l.page} ${page}/${pageCount}` : ''))}${t(15, 75, `${l.raw} · A ${n(part.width)} × B ${n(part.height)} mm · ${l.thickness} T ${n(part.thickness)} mm`)}${t(15, 95, l.origin, 'class="small"')}${t(15, 115, l.basis + ': ' + basis, 'class="small"')}${t(15, 135, physicalBasis(part.orientation, lang), 'class="small"')}${t(15, 155, l.axis, 'class="small"')}<path d="${contourOf(part).map((point, index) => `${index ? 'L' : 'M'} ${n(dx + point.x * scale)} ${n(dy + point.y * scale)}`).join(' ')} Z" fill="#f6f8f5" stroke="#355b47" stroke-width="1.5"/><path d="M ${n(dx)} ${n(dy)} h 30 M ${n(dx)} ${n(dy)} v 30" fill="none" stroke="#1b3e2b" stroke-width="2"/><path d="M ${n(dx)} ${n(dy)} L 108 181" fill="none" stroke="#9eb7a5" stroke-width="1"/><g data-label-id="origin" data-label-x="85" data-label-y="161" data-label-width="45" data-label-height="20">${t(108, 176, '0,0', 'text-anchor="middle" class="small"')}</g><g data-label-id="axes" data-label-x="800" data-label-y="161" data-label-width="112" data-label-height="20">${t(810, 176, 'A+ →   B+ ↓', 'class="small"')}</g>${graphics}${grain}${t(15, 520, l.diagram, 'class="small"')}${t(15, 540, `${l.clearance}: T± · ${l.pilot}: A± / B± · ${l.countersink}: T±`, 'class="small"')}${t(15, 560, 'T=0 → T=' + n(part.thickness) + ' mm; ' + l.axisLocal + ': ' + (lang === 'ru' ? 'от поверхности внутрь плиты' : lang === 'tr' ? 'giriş yüzeyinden levhanın içine' : 'from the entry surface into the panel'), 'class="small"')}${t(15, 580, '* ' + l.setup + (pageCount > 1 ? ' · ' + l.remaining : ''), 'class="small"')}<rect x="8" y="605" width="984" height="26" fill="#e8f0e5"/>${headers.map((header, index) => t(columns[index], 622, header, 'class="table" font-weight="bold"')).join('')}${rows}</svg>`;
}

function readme(plan, language) {
  const s = plan.settings, common = `SCREW=${n(s.screwDiameter)}×${n(s.screwLength)} mm; CLEARANCE=${n(s.clearanceDiameter)} mm; PILOT=${n(s.pilotDiameter)} mm; PILOT_EXTRA_DEPTH=${n(s.pilotExtraDepth)} mm; END_OFFSET=${n(s.endOffset)} mm; MAX_SPACING=${n(s.maxSpacing)} mm; HEAD_SEAT_DIAMETER=${n(s.countersinkDiameter)} mm; HEAD_SEAT_DEPTH=${s.countersinkDepth === null ? 'UNSET' : n(s.countersinkDepth)} mm.`;
  const paragraphs = {
    ru: ['ATÖLYE — отдельная сверловка корпуса. Все размеры в мм.', 'Только распознанные стыки несущих плит корпуса под мебельный винт (конфирмат). Двери, ящики, съёмные полки, тонкие задники, петли и направляющие не получают автоматическую сверловку.', 'drilling.csv: UTF-8 BOM, разделитель ;, десятичная точка. Одна строка — одна операция. PART_ID совпадает с Pxxxx в раскрое. SOURCE_PART_ID — внутренний идентификатор. JOINT_ID связывает сквозное отверстие, торцевое отверстие и посадку головки одного винта.', 'A_MM, B_MM и THICKNESS_COORD_MM — координаты точки входа на ЗАГОТОВКЕ без кромки. Размеры и отступы кромки уже учтены; повторно вычитать кромку нельзя. A и B на отдельных схемах идут вправо и вниз; не зеркальте схемы. Числа в таблице определяют положение отверстия, символы показывают его условно.', 'FACE: face-t-min / face-t-max — пласти при T=0 / T=толщина; edge-a-min / edge-a-max — вход в торец в направлении A+ / A−; edge-b-min / edge-b-max — вход в торец в направлении B+ / B−. Точка входа задаётся A_MM/B_MM: на фигурной детали это может быть край внутреннего выреза. LOCAL_DIRECTION_A/B/T — направление сверления от поверхности в плиту. Торцевые отверстия сверлят с указанного торца, а не с пласти.', 'WORLD_ENTRY_* и DIRECTION_* относятся к осям помещения с учётом размещения и поворота шкафа. На каждой схеме A/B/T показаны векторами X/Y/Z. Эти столбцы служат проверке сопряжения; их нельзя принимать за координаты станка.', 'clearance — сквозное отверстие; pilot — торцевое пилотное отверстие; countersink — посадка головки. Пустая DEPTH_MM и REQUIRES_SETUP=1 означают, что глубину посадки головки и профиль инструмента должна задать мастерская по выбранному винту. Не выполнять такую операцию как отверстие с нулевой глубиной.', 'Это ведомость и схемы для мастерской, не программа CNC и не универсальная схема конкретной фурнитуры. Вылет винта, диаметр пилотного отверстия, глубину и профиль посадки головки согласуйте с крепежом и материалом. Настройки сохраняются в settings.csv.'],
    tr: ['ATÖLYE — ayrı gövde delik planı. Tüm ölçüler mm.', 'Yalnızca mobilya vidası (konfirmat) için tanımlanmış taşıyıcı gövde levhası birleşimleri. Kapaklar, çekmeceler, sökülebilir raflar, ince arkalıklar, menteşeler ve raylar için otomatik delik açılmaz.', 'drilling.csv: UTF-8 BOM, ayırıcı ;, ondalık nokta. Her satır bir işlemdir. PART_ID kesim listesindeki Pxxxx koduyla aynıdır. SOURCE_PART_ID uygulama kimliğidir. JOINT_ID aynı vidanın geçiş deliğini, kenar deliğini ve baş yuvasını eşleştirir.', 'A_MM, B_MM ve THICKNESS_COORD_MM bantsız HAM PARÇADAKİ giriş noktası koordinatlarıdır. Bant ölçü ve payları zaten uygulanmıştır; kenar bandını tekrar düşmeyin. Şemalarda A sağa, B aşağı yönelir; şemayı aynalamayın. Tablo koordinatları kesin konumu verir, semboller şematiktir.', 'FACE: face-t-min / face-t-max T=0 / T=kalınlık yüzeyleridir; edge-a-min / edge-a-max A+ / A− yönünde kenar girişidir; edge-b-min / edge-b-max B+ / B− yönünde kenar girişidir. Giriş noktası A_MM/B_MM ile belirtilir; şekilli parçada iç oyuk kenarı olabilir. LOCAL_DIRECTION_A/B/T giriş yüzeyinden levhaya doğru delme yönüdür. Kenar deliği belirtilen kenardan açılır, geniş yüzeyden değil.', 'WORLD_ENTRY_* ve DIRECTION_* dolabın konumu ve dönüşü uygulanmış oda eksenlerini kullanır. Her çizimde A/B/T eksenleri X/Y/Z vektörleriyle belirtilir. Bu sütunlar bağlantı doğrulama içindir; makine koordinatı olarak kullanmayın.', 'clearance geçiş deliğidir; pilot kenar pilot deliğidir; countersink vida başı yuvasıdır. Boş DEPTH_MM ve REQUIRES_SETUP=1 baş yuvası derinliğinin ve takım profilinin seçilen vidaya göre atölyede belirlenmesi gerektiğini gösterir. İşlemi sıfır derinlikli delik olarak uygulamayın.', 'Bu dosyalar atölye için işlem listesi ve şemalardır; CNC programı veya donanıma özel evrensel delik planı değildir. Vida çıkıntısını, pilot çapını, baş yuvası derinliğini ve profilini seçilen bağlantı elemanı ve malzemeyle doğrulayın. Ayarlar settings.csv dosyasındadır.'],
    en: ['ATÖLYE — separate carcass drilling schedule. All dimensions in mm.', 'Recognised load-bearing carcass panel butt joints for furniture screws (confirmats) only. Doors, drawer assemblies, removable shelves, thin backs, hinges and slides do not receive automatic drilling.', 'drilling.csv: UTF-8 BOM, semicolon separator, decimal point. One row per operation. PART_ID matches Pxxxx in the cutting list. SOURCE_PART_ID is the internal identifier. JOINT_ID links the through hole, edge pilot and head seat for one screw.', 'A_MM, B_MM and THICKNESS_COORD_MM locate the entry point on the UNBANDED CUT BLANK. Band dimensions and offsets are already applied; never deduct them again. A is right and B down on the individual maps; do not mirror them. Table coordinates specify the location; symbols are schematic.', 'FACE: face-t-min / face-t-max are broad faces at T=0 / T=thickness; edge-a-min / edge-a-max enter an edge in the A+ / A− direction; edge-b-min / edge-b-max enter in the B+ / B− direction. A_MM/B_MM locate the entry, which may lie on an inner notch edge of a shaped panel. LOCAL_DIRECTION_A/B/T points from the entry surface into the panel. Edge pilots enter from the stated edge, not from a broad face.', 'WORLD_ENTRY_* and DIRECTION_* use room axes after cabinet placement and rotation. Every map gives A/B/T as X/Y/Z vectors. These columns verify mating holes and are not machine coordinates.', 'clearance is a through hole; pilot is an edge pilot; countersink is the head seat. Blank DEPTH_MM and REQUIRES_SETUP=1 mean the workshop must set head-seat depth and tool profile for the selected screw. Do not treat it as a zero-depth operation.', 'These are workshop schedules and maps, not a CNC program or a universal hardware drilling pattern. Confirm screw penetration, pilot diameter, head-seat depth and profile against the selected fastener and material. Settings are in settings.csv.']
  }[language];
  paragraphs.push({ ru: 'Код Pxxxx общий для раскроя и сверловки, но эти схемы используют собственные явно отмеченные оси. Их ориентация может отличаться от чертежа раскроя. Для сверления используйте координаты именно схемы сверловки. Размеры округлены до 0,001 мм, вектора в CSV — до 12 десятичных знаков; краткие вектора на SVG служат пояснением направления.', tr: 'Pxxxx kodu kesim ve delik planında aynıdır; delik şemalarının kendi açıkça işaretli eksenleri vardır. Yönü kesim çiziminden farklı olabilir. Delme işlemlerinde delik şemasının koordinatlarını kullanın. Ölçüler 0,001 mm, CSV vektörleri 12 ondalık basamak hassasiyetindedir; SVG üzerindeki kısa vektörler yalnızca yönü açıklar.', en: 'Pxxxx codes are shared with cutting, but these maps have their own explicitly marked axes. Their orientation may differ from a cut-only drawing. Drill using the drilling-map coordinates. Dimensions are rounded to 0.001 mm and CSV vectors to 12 decimal places; abbreviated SVG vectors explain direction only.' }[language]);
  return paragraphs.join('\r\n\r\n') + '\r\n\r\n' + common + '\r\n';
}

export function buildDrillingFiles(project, { language } = {}) {
  const lang = languageOf(project, language), { plan, factory } = requirePlan(project, lang), l = labels[lang];
  const files = [{ path: 'drilling.csv', content: csv([DRILLING_COLUMNS, ...operationRows(plan, lang)]) }, { path: 'README.txt', content: readme(plan, lang) },
    { path: 'settings.csv', content: csv([['PARAMETER', 'VALUE'], ...Object.entries(plan.settings).map(([key, value]) => [key, value === null ? 'UNSET' : typeof value === 'boolean' ? Number(value) : value])]) }];
  const pages = [];
  for (const part of plan.parts) {
    const holes = plan.holes.filter(hole => hole.partId === part.id);
    if (!holes.length) continue;
    const pageCount = Math.ceil(holes.length / 14);
    for (let page = 1; page <= pageCount; page++) {
      const svg = createDrillingPartSvg(part, holes.slice((page - 1) * 14, page * 14), { language: lang, page, pageCount }), suffix = pageCount === 1 ? '' : `-${String(page).padStart(2, '0')}`;
      files.push({ path: `maps/${part.partCode}${suffix}.svg`, content: svg });
      pages.push(`<section>${svg}</section>`);
    }
  }
  files.push({ path: 'parts.csv', content: csv([['PART_ID', 'SOURCE_PART_ID', 'CABINET', 'DESCRIPTION', 'MATERIAL', 'RAW_A_MM', 'RAW_B_MM', 'THICKNESS_MM', 'RAW_ORIGIN_A_FROM_FINISHED_MM', 'RAW_ORIGIN_B_FROM_FINISHED_MM', 'A_WORLD_X', 'A_WORLD_Y', 'A_WORLD_Z', 'B_WORLD_X', 'B_WORLD_Y', 'B_WORLD_Z', 'T_WORLD_X', 'T_WORLD_Y', 'T_WORLD_Z', 'GRAIN_AXIS', 'OPERATION_COUNT'], ...plan.parts.filter(part => plan.holes.some(hole => hole.partId === part.id)).map(part => [part.partCode, part.id, translateBuiltInName(part.cabinetName, lang, 'cabinet'), translatePrintText(part.name, lang), translateMaterialName(factory.production.materials.find(stock => stock.id === part.materialId)?.name, lang), part.width, part.height, part.thickness, part.rawOrigin.a, part.rawOrigin.b, ...['a', 'b', 't'].flatMap(axis => ['x', 'y', 'z'].map(world => exact(part.drillingBasis[axis][world]))), part.grain ? 'B' : 'NONE', plan.holes.filter(hole => hole.partId === part.id).length])]) });
  files.push({ path: 'drilling-reference.html', content: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escape(l.heading)}</title><style>@page{size:A4 portrait;margin:10mm}body{font:12px Arial;color:#253d35;margin:0}section{break-after:page}section:last-child{break-after:auto}svg{display:block;width:100%;height:auto;max-height:252mm}h1{font-size:18px}@media screen{body{max-width:850px;margin:24px auto}section{margin:24px 0;border:1px solid #dde6db}}</style></head><body><h1>${escape(translateBuiltInName(project.name, lang, 'project'))} · ${escape(l.heading)}</h1><p>${escape(l.raw + '. ' + l.axis)}</p>${pages.join('')}</body></html>` });
  const warningText = {
    ru: { scope: 'Только неподвижные соединения корпуса. Петли, направляющие, задники, свободные полки и ящики не сверлятся автоматически.', 'countersink-setup': 'Глубину и профиль посадки головки необходимо согласовать с выбранным винтом и инструментом.', 'workshop-values': 'Отступы, шаг и запас глубины являются редактируемыми настройками мастерской.' },
    tr: { scope: 'Yalnızca sabit gövde bağlantıları. Menteşeler, raylar, arkalıklar, serbest raflar ve çekmeceler otomatik delinmez.', 'countersink-setup': 'Vida başı yuvasının derinliği ve profili seçilen vida ve takıma göre belirlenmelidir.', 'workshop-values': 'Kenar mesafesi, delik aralığı ve ek derinlik atölyeye göre düzenlenebilir.' },
    en: { scope: 'Fixed carcass joints only. Hinges, slides, backs, loose shelves and drawers are not drilled automatically.', 'countersink-setup': 'Confirm the head-seat depth and profile against the selected screw and tool.', 'workshop-values': 'Edge distances, spacing and depth allowance are editable workshop settings.' }
  }[lang];
  if (plan.warnings.length) files.push({ path: 'checks.csv', content: csv([['LEVEL', 'CODE', 'DESCRIPTION'], ...plan.warnings.map(warning => ['warning', warning.code, warningText[warning.code] ?? warning.code])]) });
  return files;
}

export function generateDrillingZip(project, options = {}) {
  return createStoredZip(buildDrillingFiles(project, options));
}
