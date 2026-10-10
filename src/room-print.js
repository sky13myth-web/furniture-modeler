import { getRoomOutline, cabinetFootprint, polygonArea } from './room-geometry.js';
import { getCabinetPlacementFootprint } from './engine.js';
import { printLanguage, printNumber, translateBuiltInName, translatePrintText } from './print-i18n.js';
import { translateText } from './i18n.js';
import { getDocumentInfo, documentMetadataLine, documentPageCSS, printDocumentText } from './print-document.js';

const escape = value => String(value ?? '').replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const coordinate = value => Math.round(finite(value) * 10000) / 10000;
const color = value => /^#[0-9a-f]{6}$/iu.test(value ?? '') ? value : '#a7b9ad';
const positive = value => Math.max(0, finite(value));
const legacyWall = { back: 0, right: 1, front: 2, left: 3 };
const shortName = (value, max = 24) => [...String(value)].length > max ? [...String(value)].slice(0, max - 1).join('') + '…' : String(value);
const word = (text, language) => {
  const translated = translateText(text, language);
  return translated !== text ? translated : translatePrintText(text, language);
};

/** Independent, cloned print geometry. X/Z are world coordinates in mm.
 * Physical footprints include closed overlay fronts; carcass dimensions stay
 * separate. An invalid opening is reported without moving or shortening it.
 */
export function getRoomPlanGeometry(project = {}) {
  const room = project.room ?? {}, outline = getRoomOutline(room);
  const orientation = polygonArea(outline) >= 0 ? 1 : -1;
  const walls = outline.map((start, index) => {
    const end = outline[(index + 1) % outline.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    const direction = { x: (end.x - start.x) / (length || 1), z: (end.z - start.z) / (length || 1) };
    return { index, number: `S${index + 1}`, start: { ...start }, end: { ...end }, length, direction, outward: { x: direction.z * orientation, z: -direction.x * orientation } };
  });
  const cabinets = (project.cabinets ?? []).map((cabinet, index) => ({
    id: String(cabinet.id ?? ''), number: `C${index + 1}`, name: String(cabinet.name ?? ''),
    width: positive(cabinet.width), height: positive(cabinet.height), depth: positive(cabinet.depth),
    x: finite(cabinet.x), y: finite(cabinet.y), z: finite(cabinet.z), rotation: finite(cabinet.rotation),
    color: color((project.materials ?? []).find(material => material.id === cabinet.materialId)?.color),
    footprint: getCabinetPlacementFootprint(cabinet, project).map(point => ({ ...point })),
    carcassFootprint: cabinetFootprint(cabinet).map(point => ({ ...point })),
  }));
  let windowIndex = 0, doorIndex = 0;
  const openings = (room.windows ?? []).map(opening => {
    const wallIndex = Number.isInteger(opening.wallIndex) ? opening.wallIndex : legacyWall[opening.wall];
    const wall = walls[wallIndex], door = opening.kind === 'door', width = positive(opening.width), offset = finite(opening.offset);
    const start = wall ? { x: wall.start.x + wall.direction.x * offset, z: wall.start.z + wall.direction.z * offset } : null;
    const end = wall ? { x: wall.start.x + wall.direction.x * (offset + width), z: wall.start.z + wall.direction.z * (offset + width) } : null;
    const height = positive(opening.height), sill = finite(opening.sill), right = wall ? wall.length - offset - width : null;
    return { id: String(opening.id ?? ''), number: door ? `D${++doorIndex}` : `W${++windowIndex}`, kind: door ? 'door' : 'window', wallIndex: wall?.index ?? -1, width, height, sill, offset, right, start, end,
      invalid: !wall || width <= 0 || height <= 0 || offset < 0 || right < -1e-6 || sill < 0 || sill + height > positive(room.height) + 1e-6 };
  });
  const points = [...outline, ...cabinets.flatMap(cabinet => cabinet.footprint), ...openings.flatMap(opening => opening.start ? [opening.start, opening.end] : [])];
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
  const minZ = Math.min(...points.map(point => point.z)), maxZ = Math.max(...points.map(point => point.z));
  return { outline, walls, cabinets, openings, height: positive(room.height), areaSquareMeters: Math.abs(polygonArea(outline)) / 1e6, bounds: { minX, minZ, maxX, maxZ, width: Math.max(1, maxX - minX), depth: Math.max(1, maxZ - minZ) } };
}

const PAGE = { width: 1080, height: 504, printedWidthMM: 270, printedHeightMM: 126, left: 86, right: 86, top: 58, bottom: 76 };

/** Paper-space labels use bounded collision-free boxes instead of edit handles.
 * Distant/stacked cabinets retain a leader and their full name in the schedule.
 */
function labelPlacer(reserveHeader = false) {
  const boxes = reserveHeader ? [{ x: 0, y: 0, width: PAGE.width, height: 60 }] : [];
  const inside = box => box.x >= 5 && box.y >= 5 && box.x + box.width <= PAGE.width - 5 && box.y + box.height <= PAGE.height - 31;
  const overlaps = box => boxes.some(other => box.x < other.x + other.width + 3 && box.x + box.width + 3 > other.x && box.y < other.y + other.height + 3 && box.y + box.height + 3 > other.y);
  return (text, anchor, preferred = anchor, { size = 14, className = '', full = text } = {}) => {
    const width = Math.max(26, [...text].length * size * .64 + 10), height = size + 8;
    const bounded = (x, y) => ({ x: Math.max(5, Math.min(PAGE.width - 5 - width, x - width / 2)), y: Math.max(5, Math.min(PAGE.height - 31 - height, y - height / 2)), width, height });
    let chosen = bounded(preferred.x, preferred.y);
    if (overlaps(chosen)) {
      let found = false;
      for (let radius = 16; radius <= 384 && !found; radius += 16) {
        for (let step = 0; step < 16; step++) {
          const angle = step * Math.PI / 8;
          const box = bounded(preferred.x + Math.cos(angle) * radius, preferred.y + Math.sin(angle) * radius);
          if (inside(box) && !overlaps(box)) { chosen = box; found = true; break; }
        }
      }
      if (!found) {
        for (let y = 14; y < PAGE.height - 40 && !found; y += 24) for (let x = 20; x < PAGE.width - 20; x += 32) {
          const box = bounded(x, y);
          if (!overlaps(box)) { chosen = box; found = true; break; }
        }
      }
    }
    boxes.push(chosen);
    const x = chosen.x + chosen.width / 2, y = chosen.y + chosen.height / 2;
    const moved = Math.hypot(x - anchor.x, y - anchor.y) > 15;
    const leader = moved ? `<path class="label-leader" d="M${coordinate(anchor.x)} ${coordinate(anchor.y)}L${coordinate(x)} ${coordinate(y)}"/>` : '';
    return `${leader}<g class="print-label ${className}"><title>${escape(full)}</title><rect x="${coordinate(chosen.x)}" y="${coordinate(chosen.y)}" width="${coordinate(chosen.width)}" height="${coordinate(chosen.height)}" rx="2"/><text x="${coordinate(x)}" y="${coordinate(y + size * .34)}" font-size="${size}" text-anchor="middle">${escape(text)}</text></g>`;
  };
}

function planFigure(geometry, language, { documentInfo = null, projectName = '' } = {}) {
  const number = value => printNumber(Math.round(finite(value) * 10) / 10, language);
  const mm = word('мм', language), bounds = geometry.bounds;
  const top = documentInfo ? 94 : PAGE.top;
  const scale = Math.min((PAGE.width - PAGE.left - PAGE.right) / bounds.width, (PAGE.height - top - PAGE.bottom) / bounds.depth);
  const ox = (PAGE.width - bounds.width * scale) / 2 - bounds.minX * scale;
  const oz = top + (PAGE.height - top - PAGE.bottom - bounds.depth * scale) / 2 - bounds.minZ * scale;
  const screen = point => ({ x: point.x * scale + ox, y: point.z * scale + oz });
  const points = polygon => polygon.map(point => { const value = screen(point); return `${coordinate(value.x)},${coordinate(value.y)}`; }).join(' ');
  const label = labelPlacer(Boolean(documentInfo)), geometryLayers = [], annotationLayers = [];
  const floor = `<polygon class="room-floor" points="${points(geometry.outline)}"/>`;
  geometryLayers.push(floor);
  for (const cabinet of [...geometry.cabinets].sort((a, b) => a.y - b.y)) {
    const name = translateBuiltInName(cabinet.name, language, 'cabinet');
    const polygon = cabinet.footprint.map(screen);
    const cx = polygon.reduce((sum, point) => sum + point.x, 0) / (polygon.length || 1), cy = polygon.reduce((sum, point) => sum + point.y, 0) / (polygon.length || 1);
    const span = Math.max(...polygon.map(point => point.x)) - Math.min(...polygon.map(point => point.x));
    const title = `${cabinet.number} · ${name} · ${number(cabinet.width)} × ${number(cabinet.height)} × ${number(cabinet.depth)} ${mm} · Y=${number(cabinet.y)} ${mm} · ${number(cabinet.rotation)}°`;
    const angle = (Number.isFinite(cabinet.rotation) ? cabinet.rotation : 0) * Math.PI / 180;
    const co = Math.cos(angle), si = Math.sin(angle);
    const fl = screen({ x: cabinet.x - cabinet.depth * si, z: cabinet.z + cabinet.depth * co });
    const fr = screen({ x: cabinet.x + cabinet.width * co - cabinet.depth * si, z: cabinet.z + cabinet.width * si + cabinet.depth * co });
    const frontLine = `<line class="cabinet-front" x1="${coordinate(fl.x)}" y1="${coordinate(fl.y)}" x2="${coordinate(fr.x)}" y2="${coordinate(fr.y)}"/>`;
    geometryLayers.push(`<g class="cabinet ${cabinet.y > 0 ? 'elevated' : 'floor-cabinet'}" data-cabinet-id="${escape(cabinet.id)}"><title>${escape(title)}</title><polygon class="cabinet-physical" points="${points(cabinet.footprint)}" fill="${cabinet.color}"/><polygon class="cabinet-carcass" points="${points(cabinet.carcassFootprint)}"/>${frontLine}</g>`);
    const nameText = shortName(name, 20), text = span >= (nameText.length + cabinet.number.length + 3) * 8 ? `${cabinet.number} · ${nameText}` : cabinet.number;
    annotationLayers.push(label(text, { x: cx, y: cy }, undefined, { className: 'cabinet-label', full: title }));
  }
  for (const wall of geometry.walls) {
    const a = screen(wall.start), b = screen(wall.end), normal = { x: wall.outward.x, y: wall.outward.z };
    const p = { x: a.x + normal.x * 27, y: a.y + normal.y * 27 }, q = { x: b.x + normal.x * 27, y: b.y + normal.y * 27 };
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const preferred = { x: midpoint.x + normal.x * 44, y: midpoint.y + normal.y * 44 };
    const dx = wall.direction.x, dy = wall.direction.z;
    geometryLayers.push(`<g class="wall-dimension" data-wall-index="${wall.index}" data-length-mm="${coordinate(wall.length)}"><path d="M${coordinate(a.x + normal.x * 5)} ${coordinate(a.y + normal.y * 5)}L${coordinate(p.x + normal.x * 5)} ${coordinate(p.y + normal.y * 5)}M${coordinate(b.x + normal.x * 5)} ${coordinate(b.y + normal.y * 5)}L${coordinate(q.x + normal.x * 5)} ${coordinate(q.y + normal.y * 5)}M${coordinate(p.x)} ${coordinate(p.y)}L${coordinate(q.x)} ${coordinate(q.y)}M${coordinate(p.x - dx * 3 - normal.x * 4)} ${coordinate(p.y - dy * 3 - normal.y * 4)}l${coordinate(dx * 6 + normal.x * 8)} ${coordinate(dy * 6 + normal.y * 8)}M${coordinate(q.x - dx * 3 - normal.x * 4)} ${coordinate(q.y - dy * 3 - normal.y * 4)}l${coordinate(dx * 6 + normal.x * 8)} ${coordinate(dy * 6 + normal.y * 8)}"/><path class="wall-direction" d="M${coordinate(a.x + (b.x - a.x) * .2 - normal.x * 8)} ${coordinate(a.y + (b.y - a.y) * .2 - normal.y * 8)}l${coordinate(dx * 18)} ${coordinate(dy * 18)}" marker-end="url(#room-plan-arrow)"/></g>`);
    annotationLayers.push(label(`${wall.number} · ${number(wall.length)}`, midpoint, preferred, { size: 14, className: 'wall-label' }));
  }
  for (const opening of geometry.openings) {
    if (!opening.start) continue;
    const a = screen(opening.start), b = screen(opening.end), wall = geometry.walls[opening.wallIndex], nx = wall.outward.x, ny = wall.outward.z;
    const type = word(opening.kind === 'door' ? 'Дверной проём' : 'Окно', language);
    const title = `${opening.number} · ${type} · ${wall.number} · ${number(opening.width)} × ${number(opening.height)} ${mm}`;
    const lines = opening.kind === 'door' ? `<line class="door-gap" x1="${coordinate(a.x)}" y1="${coordinate(a.y)}" x2="${coordinate(b.x)}" y2="${coordinate(b.y)}"/>` : [-2, 2].map(delta => `<line class="window-glass" x1="${coordinate(a.x + nx * delta)}" y1="${coordinate(a.y + ny * delta)}" x2="${coordinate(b.x + nx * delta)}" y2="${coordinate(b.y + ny * delta)}"/>`).join('');
    geometryLayers.push(`<g class="opening ${opening.kind}${opening.invalid ? ' invalid' : ''}" data-opening-id="${escape(opening.id)}" data-offset-mm="${coordinate(opening.offset)}" data-width-mm="${coordinate(opening.width)}"><title>${escape(title)}</title><line class="opening-erase" x1="${coordinate(a.x)}" y1="${coordinate(a.y)}" x2="${coordinate(b.x)}" y2="${coordinate(b.y)}"/>${lines}<path class="opening-jamb" d="M${coordinate(a.x - nx * 5)} ${coordinate(a.y - ny * 5)}L${coordinate(a.x + nx * 5)} ${coordinate(a.y + ny * 5)}M${coordinate(b.x - nx * 5)} ${coordinate(b.y - ny * 5)}L${coordinate(b.x + nx * 5)} ${coordinate(b.y + ny * 5)}"/></g>`);
    const anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    annotationLayers.push(label(`${opening.number} · ${number(opening.width)}`, anchor, { x: anchor.x + nx * 20, y: anchor.y + ny * 20 }, { className: opening.invalid ? 'invalid-label' : 'opening-label', full: title }));
  }
  const bar = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].filter(value => value * scale <= 132).at(-1) ?? 1;
  const x = PAGE.width - 30 - bar * scale, y = PAGE.height - 22;
  const ruler = `<g class="scale-bar" data-length-mm="${bar}"><path d="M${coordinate(x)} ${y - 4}V${y + 4}M${coordinate(x)} ${y}h${coordinate(bar * scale)}M${PAGE.width - 30} ${y - 4}V${y + 4}"/><text x="${coordinate(x + bar * scale / 2)}" y="${y - 8}" text-anchor="middle">${number(bar)} ${escape(mm)}</text></g>`;
  const documentHeader = documentInfo ? `<g class="document-identity"><text x="24" y="18" font-size="12">${escape(shortName(projectName, 40))}</text><text x="24" y="34" font-size="10">${escape(documentMetadataLine(documentInfo, { language }))}</text><text x="24" y="49" font-size="10">${escape(printDocumentText('notToScale', language))}</text></g>` : '';
  const ratio = PAGE.width / PAGE.printedWidthMM / scale;
  const scaleLabel = `${word('Масштаб ≈', language)} 1:${number(ratio)} · ${word('при печати 100%', language)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.printedWidthMM}mm" height="${PAGE.printedHeightMM}mm" viewBox="0 0 ${PAGE.width} ${PAGE.height}" data-i18n="off" lang="${escape(language)}" role="img" aria-labelledby="room-plan-title"><title id="room-plan-title">${escape(word('План помещения', language))}</title><desc>${escape(word('Размеры стен, расположение мебели и проёмов', language))}</desc><defs><marker id="room-plan-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="#52665b"/></marker></defs><style>svg{font-family:Arial,Helvetica,sans-serif}.room-floor{fill:#f9faf7;stroke:#25372c;stroke-width:3;stroke-linejoin:round}.cabinet-physical{fill-opacity:.3;stroke:#1c4a36;stroke-width:1.6;stroke-linejoin:round}.cabinet-carcass{fill:none;stroke:#5c7566;stroke-width:.7}.cabinet-front{stroke:#164230;stroke-width:2.4;stroke-linecap:round}.elevated .cabinet-physical{stroke-dasharray:6 3;fill-opacity:.12}.wall-dimension{fill:none;stroke:#5d675f;stroke-width:.9}.wall-direction{stroke:#74877b}.opening-erase{stroke:#fff;stroke-width:7}.window-glass{stroke:#236886;stroke-width:1.8}.door-gap{stroke:#94653b;stroke-width:1.8;stroke-dasharray:4 3}.opening-jamb{stroke:#25372c;stroke-width:1.2;fill:none}.invalid .window-glass,.invalid .door-gap{stroke:#b22929}.label-leader{stroke:#87928b;stroke-width:.7;fill:none}.print-label rect{fill:#fff;fill-opacity:.94}.print-label text{fill:#1c3022}.opening-label text{fill:#236886}.invalid-label text{fill:#b22929}.scale-bar{fill:none;stroke:#263c2d;stroke-width:1.5}.scale-bar text{fill:#263c2d;stroke:none;font-size:14}.print-scale{font-size:12;fill:#59675d}</style>${geometryLayers.join('')}${annotationLayers.join('')}${documentHeader}<text class="print-scale" x="24" y="${PAGE.height - 16}">${escape(scaleLabel)}</text>${ruler}</svg>`;
}

/** Standalone SVG has a fixed paper size and never reads screen/camera state. */
export function createRoomPlanSvg(project, { language = 'tr' } = {}) {
  const lang = printLanguage(language, 'tr');
  return planFigure(getRoomPlanGeometry(project), lang, { documentInfo: getDocumentInfo(project), projectName: translateBuiltInName(project.name, lang, 'project') });
}

/** Complete printable document; tables flow onto additional landscape pages. */
export function generateRoomPlanHTML(project, { language = 'tr' } = {}) {
  const lang = printLanguage(language, 'tr'), geometry = getRoomPlanGeometry(project);
  const t = value => escape(word(value, lang)), number = value => escape(printNumber(Math.round(finite(value) * 10) / 10, lang));
  const name = translateBuiltInName(String(project?.name ?? ''), lang, 'project');
  const documentInfo = getDocumentInfo(project);
  const headers = labels => labels.map(label => `<th>${t(label)}</th>`).join('');
  const cabinets = geometry.cabinets.map(cabinet => `<tr><td>${cabinet.number}</td><td>${escape(translateBuiltInName(cabinet.name, lang, 'cabinet'))}</td><td>${number(cabinet.width)} × ${number(cabinet.height)} × ${number(cabinet.depth)}</td><td>${number(cabinet.x)} / ${number(cabinet.z)}</td><td>${number(cabinet.y)}</td><td>${number(cabinet.rotation)}°</td></tr>`).join('');
  const openings = geometry.openings.map(opening => `<tr${opening.invalid ? ' class="invalid-row"' : ''}><td>${opening.number}</td><td>${t(opening.kind === 'door' ? 'Дверной проём' : 'Окно')}</td><td>${opening.wallIndex < 0 ? '—' : `S${opening.wallIndex + 1}`}</td><td>${number(opening.offset)}</td><td>${number(opening.width)}</td><td>${opening.right === null ? '—' : number(opening.right)}</td><td>${number(opening.height)}</td><td>${number(opening.sill)}</td></tr>`).join('');
  return `<!doctype html><html lang="${escape(lang)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('План помещения')} · ${escape(name)}</title><style>${documentPageCSS(documentInfo, lang)}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#203628;font-size:9pt}.document{max-width:279mm;margin:0 auto;padding:0}.document-header{display:flex;justify-content:space-between;gap:8mm;border-bottom:.3mm solid #28593f;padding:2mm 0 3mm;margin-bottom:2mm}.document-header h1{font-size:15pt;margin:0;line-height:1.25}.project-title{font-size:10pt;margin:1mm 0 0;overflow-wrap:anywhere}.room-summary{font-size:8.5pt;text-align:right;line-height:1.5;white-space:nowrap}.plan-figure{margin:0;text-align:center;break-inside:avoid;page-break-inside:avoid}.plan-figure svg{display:block;width:270mm;height:126mm;margin:0 auto}.legend,.note{font-size:8pt;line-height:1.35;margin:2mm 0}.schedules h2{font-size:10pt;margin:3mm 0 1mm;break-after:avoid;page-break-after:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:.15mm solid #aebcaf;padding:1.2mm 1.5mm;vertical-align:top;overflow-wrap:anywhere}th{text-align:left;background:#edf2ec}th:first-child,td:first-child{width:13mm}.invalid-row{color:#a52323}.empty{color:#68796b;font-size:8pt}.wall-list{display:flex;flex-wrap:wrap;gap:1mm 5mm;font-size:8pt;margin-top:2mm}.wall-list span{white-space:nowrap}footer{margin:3mm 0;font-size:7.5pt;color:#58685d}@media screen{body{background:#e9ede6}.document{background:white;padding:7mm;margin:5mm auto;box-shadow:0 1mm 5mm #0002}.plan-figure svg{max-width:100%;height:auto}}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.document{padding:0}.document-header{break-inside:avoid}}</style></head><body><main class="document" data-i18n="off"><header class="document-header"><div><h1>${t('План помещения')}</h1><p class="project-title">${escape(name)}</p><p class="note">${escape(documentInfo.id)} · ${escape(documentInfo.date)}</p></div><div class="room-summary">${t('Высота помещения')}: ${number(geometry.height)} ${t('мм')}<br>${t('Площадь помещения')}: ${number(geometry.areaSquareMeters)} ${t('м²')}<br>${t('Все размеры в миллиметрах')}</div></header><figure class="plan-figure">${planFigure(geometry, lang)}</figure><p class="legend">${t('S — стены; C — шкафы; W — окна; D — дверные проёмы.')} ${t('Пунктирный контур — шкаф над полом; высота установки указана в ведомости.')}</p><p class="note">${t('Контур мебели включает закрытые фасады. В ведомости указаны габариты корпуса.')} ${t('Отступ проёма измеряется от начала стены по направлению стрелки.')}</p><div class="wall-list">${geometry.walls.map(wall => `<span>${wall.number}: ${number(wall.length)} ${t('мм')}</span>`).join('')}</div><section class="schedules"><h2>${t('Ведомость мебели')}</h2>${geometry.cabinets.length ? `<table class="cabinet-schedule"><thead><tr>${headers(['№', 'Шкаф', 'Ш × В × Г, мм', 'X / Z, мм', 'Высота установки, мм', 'Поворот, °'])}</tr></thead><tbody>${cabinets}</tbody></table>` : `<p class="empty">${t('Мебель не добавлена.')}</p>`}<h2>${t('Ведомость проёмов')}</h2>${geometry.openings.length ? `<table class="opening-schedule"><thead><tr>${headers(['№', 'Проём', 'Стена', 'От начала стены, мм', 'Ширина, мм', 'До конца стены, мм', 'Высота, мм', 'Низ от пола, мм'])}</tr></thead><tbody>${openings}</tbody></table>` : `<p class="empty">${t('Проёмы не добавлены.')}</p>`}</section>${geometry.openings.some(opening => opening.invalid) ? `<p class="note invalid-row">${t('Красным отмечены проёмы с неверными размерами или выходом за границы стены.')}</p>` : ''}<footer>ATÖLYE · ${t('План печатается независимо от масштаба и выделения на экране.')}<br>${escape(printDocumentText('notToScale', lang))} ${escape(printDocumentText('nominalTolerances', lang))}</footer></main></body></html>`;
}
