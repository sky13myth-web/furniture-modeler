import * as engine from './engine.js';
import { getRoomOutline } from './room-geometry.js';
import { printLanguage, printNumber, translatePrintText, translatePartName, translateMaterialName, translateBuiltInName } from './print-i18n.js';
import { getProjectHardwareSchedule } from './hardware.js';
import { generateCostHTML as renderCostSummary } from './pricing.js';
const { getFrontLayout } = engine;

const VIEWS = {
  '3d': { yaw: Math.PI / 5, elevation: Math.PI / 6, name: 'Перспектива' },
  front: { yaw: 0, elevation: 0, name: 'Вид спереди' },
  back: { yaw: Math.PI, elevation: 0, name: 'Вид сзади' },
  left: { yaw: -Math.PI / 2, elevation: 0, name: 'Вид слева' },
  right: { yaw: Math.PI / 2, elevation: 0, name: 'Вид справа' },
  top: { yaw: 0, elevation: Math.PI / 2, name: 'План сверху' },
  interior: { yaw: 0, elevation: 0, name: 'Внутренние секции' },
};
const ACCENT = '#17a6a4';
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const point = (x, y, z) => [x, y, z];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, v) => a.map(n => n * v);
const average = points => points.reduce((sum, p) => add(sum, mul(p, 1 / points.length)), [0, 0, 0]);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fmt = value => Math.round(number(value)).toLocaleString('ru-RU');
const mm = value => number(value).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const round = value => Math.round(value * 100) / 100;
const sizeText = (dimensions, language = 'ru') => ['width', 'height', 'depth'].map(axis => printNumber(number(dimensions[axis]), language)).join(' × ');
const doorOpening = front => ['left','right','up'].includes(front.opening) ? front.opening : number(front.index)%2===1 ? 'right' : 'left';
const doorOpeningText = opening => ({left:'Влево',right:'Вправо',up:'Вверх'}[opening] || 'Влево');

function colorShade(color, factor = 1) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || '');
  if (!match) return color || '#c5b694';
  const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
  return `#${[0, 2, 4].map(i => Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * factor))).toString(16).padStart(2, '0')).join('')}`;
}

function basis(yaw, elevation) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw), se = Math.sin(elevation), ce = Math.cos(elevation);
  return { right: [cy, 0, -sy], up: [-sy * se, ce, -cy * se], direction: [sy * ce, se, cy * ce] };
}

function material(project, id) {
  return (project.materials || []).find(m => m.id === id) || { color: '#d6c4a4', thickness: 18 };
}

function cabinetData(project, source) {
  const mat = material(project, source.materialId);
  return {
    ...source,
    x: number(source.x), y: number(source.y), z: number(source.z),
    width: Math.max(40, number(source.width, 600)),
    height: Math.max(40, number(source.height, 720)),
    depth: Math.max(40, number(source.depth, 560)),
    plinth: Math.max(0, number(source.plinth)),
    thickness: Math.max(3, number(mat.thickness, 18)),
    bodyColor: mat.color || '#d6c4a4',
    frontColor: material(project, source.frontMaterialId || source.materialId).color || '#d6c4a4',
    frontThickness: Math.max(3, number(material(project, source.frontMaterialId || source.materialId).thickness, 18)),
    backColor: material(project, source.backMaterialId || source.materialId).color || '#d6c4a4',
    backThickness: source.includeBack === false ? 0 : Math.max(1, number(source.backThickness, number(material(project, source.backMaterialId).thickness, 3))),
  };
}

function roomData(project) {
  const room = project.room || {};
  return { width: Math.max(500, number(room.width, 4200)), depth: Math.max(500, number(room.depth, 3000)), height: Math.max(500, number(room.height, 2600)), wallThickness: Math.max(10, number(room.wallThickness, 120)), windows: room.windows || [] };
}

function rotateCabinetPoint(c, p) {
  const angle = number(c.rotation) * Math.PI / 180, co = Math.cos(angle), si = Math.sin(angle), x = p[0] - c.x, z = p[2] - c.z;
  return [c.x + x * co - z * si, p[1], c.z + x * si + z * co];
}

function rotateCabinetNormal(c, n) {
  const angle = number(c.rotation) * Math.PI / 180, co = Math.cos(angle), si = Math.sin(angle);
  return [n[0] * co - n[2] * si, n[1], n[0] * si + n[2] * co];
}

function modelLayout(c, project) {
  if (engine.getCabinetLayout) return engine.getCabinetLayout(c, project);
  const t = number(material(project, c.materialId).thickness, 18), h = number(c.height) - number(c.plinth), d = number(c.depth) - (c.includeBack === false ? 0 : number(c.backThickness, 3));
  return { sections: [{ id: 'legacy', node: c, x: t, y: t, width: number(c.width) - t * 2, height: h - t * 2, depth: d, frontX: 0, frontY: 0, frontWidth: number(c.width), frontHeight: h }], partitions: [], thickness: t, bodyHeight: h, bodyDepth: d };
}

function projectRoomOutline(project) {
  return getRoomOutline(project.room || {});
}

function signedArea(outline) {
  return outline.reduce((sum, p, i) => { const q = outline[(i + 1) % outline.length]; return sum + p.x * q.z - q.x * p.z; }, 0) / 2;
}

function pointInOutline(x, z, outline) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i], b = outline[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function cabinetExtent(c) {
  const points = corners({ min: [c.x, c.y, c.z], max: [c.x + c.width, c.y + c.height, c.z + c.depth + c.frontThickness] }).map(p => rotateCabinetPoint(c, p));
  return { min: [0, 1, 2].map(axis => Math.min(...points.map(p => p[axis]))), max: [0, 1, 2].map(axis => Math.max(...points.map(p => p[axis]))) };
}

function extent(project, cabinetId, showRoom = true) {
  const cabinets = (project.cabinets || []).filter(c => !cabinetId || c.id === cabinetId).map(c => cabinetExtent(cabinetData(project, c)));
  if (!cabinetId && showRoom) {
    const r = roomData(project), outline = projectRoomOutline(project);
    return { min: [Math.min(...outline.map(p => p.x), ...cabinets.map(c => c.min[0])), Math.min(0, ...cabinets.map(c => c.min[1])), Math.min(...outline.map(p => p.z), ...cabinets.map(c => c.min[2]))], max: [Math.max(...outline.map(p => p.x), ...cabinets.map(c => c.max[0])), Math.max(r.height, ...cabinets.map(c => c.max[1])), Math.max(...outline.map(p => p.z), ...cabinets.map(c => c.max[2]))] };
  }
  if (!cabinets.length) return { min: [0, 0, 0], max: [1200, 1000, 800] };
  return { min: [0, 1, 2].map(axis => Math.min(...cabinets.map(c => c.min[axis]))), max: [0, 1, 2].map(axis => Math.max(...cabinets.map(c => c.max[axis]))) };
}

function corners(bounds) {
  const [x, y, z] = bounds.min, [X, Y, Z] = bounds.max;
  return [[x, y, z], [X, y, z], [X, Y, z], [x, Y, z], [x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]];
}

function projection(bounds, axes, width, height, zoom = 1, pan = { x: 0, y: 0 }, padding = 48) {
  const values = corners(bounds).map(p => [dot(p, axes.right), -dot(p, axes.up)]);
  const left = Math.min(...values.map(p => p[0])), right = Math.max(...values.map(p => p[0]));
  const top = Math.min(...values.map(p => p[1])), bottom = Math.max(...values.map(p => p[1]));
  const paddingX=typeof padding==='object'?padding.x:padding, paddingY=typeof padding==='object'?padding.y:padding;
  const scale = Math.max(.00001, Math.min((width - paddingX * 2) / Math.max(1, right - left), (height - paddingY * 2) / Math.max(1, bottom - top))) * zoom;
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const project = p => [width / 2 + (dot(p, axes.right) - cx) * scale + pan.x, height / 2 + (-dot(p, axes.up) - cy) * scale + pan.y, dot(p, axes.direction)];
  return { project, scale, width, height };
}

function applianceCalloutBand(width) {
  return Math.min(260, Math.max(144, width * .29), width * .47);
}

function wrapCalloutText(text, maxWidth, measure) {
  const lines = [];
  let line = '';
  for (const word of String(text ?? '').trim().split(/\s+/u)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const character of word) {
      if (line && measure(line + character) > maxWidth) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Lay out projected appliance annotations in a reserved side strip, in CSS
 * pixels. Anchor order is preserved so adjacent leaders do not swap targets.
 * The full caption remains in `text`, even in an unusually crowded viewport. */
export function layoutApplianceCallouts(annotations, { width, height, modelWidth = width - applianceCalloutBand(width), measureText = (text, font) => String(text).length * font * .56, bottomInset = 12 } = {}) {
  const padding = Math.min(12, width * .025, height * .04);
  const x = modelWidth + padding, cardWidth = Math.max(1, width - x - padding);
  const top = padding, bottom = Math.max(top + 1, height - bottomInset);
  const available = bottom - top;
  const labels = annotations.filter(label => Array.isArray(label.anchor) && label.anchor.slice(0, 2).every(Number.isFinite)).map(label => ({ ...label, anchor: [Math.max(6, Math.min(modelWidth - 6, label.anchor[0])), Math.max(6, Math.min(height - 6, label.anchor[1]))] })).sort((a, b) => a.anchor[1] - b.anchor[1]);
  if (!labels.length) return { cards: [], modelWidth, band: { x: modelWidth, width: width - modelWidth }, fontSize: 11 };
  const gap = Math.min(8, height * .02, available / (labels.length * 6));
  let fontSize = width < 420 ? 10 : 11, cards;
  const build = () => labels.map(label => {
    const measure = text => measureText(text, fontSize);
    const lines = [...wrapCalloutText(label.name, Math.max(1, cardWidth - padding * 2), measure), ...wrapCalloutText(label.dimensions, Math.max(1, cardWidth - padding * 2), measure)];
    return { ...label, text: label.text || `${label.name} · ${label.dimensions}`, lines, height: lines.length * (fontSize + 3) + padding * 2 };
  });
  cards = build();
  const totalHeight = () => cards.reduce((sum, card) => sum + card.height, 0) + Math.max(0, cards.length - 1) * gap;
  while (fontSize > 8 && totalHeight() > available) { fontSize--; cards = build(); }
  // A dense legacy model may contain more appliances than full captions can
  // physically fit. Keep every leader and a compact caption inside the canvas.
  if (totalHeight() > available) {
    const row = Math.max(1, (available - Math.max(0, cards.length - 1) * gap) / cards.length);
    const rowPadding = Math.min(padding, row * .1);
    fontSize = Math.max(1, Math.min(fontSize, row - rowPadding * 2 - 3));
    const lineCount = Math.max(1, Math.floor((row - rowPadding * 2) / (fontSize + 3)));
    cards = cards.map(card => {
      let lines = card.lines.slice(0, lineCount);
      if (lines.length < card.lines.length) {
        let last = lines.at(-1) || '';
        while (last && measureText(`${last}…`, fontSize) > cardWidth - padding * 2) last = [...last].slice(0, -1).join('');
        lines[lines.length - 1] = `${last}…`;
      }
      return { ...card, lines, height: row, padding: rowPadding };
    });
  }
  let nextY = top;
  cards = cards.map((card, index) => {
    const remaining = cards.slice(index + 1).reduce((sum, item) => sum + item.height + gap, 0);
    const y = Math.max(nextY, Math.min(bottom - remaining - card.height, card.anchor[1] - card.height / 2));
    nextY = y + card.height + gap;
    const centerY = y + card.height / 2;
    return { ...card, x, y, width: cardWidth, fontSize, padding: card.padding ?? padding, leader: [[x, centerY], [modelWidth + padding * .35, centerY], card.anchor] };
  });
  return { cards, modelWidth, band: { x: modelWidth, width: width - modelWidth }, fontSize };
}

function makeScene(project, options, direction) {
  const faces = [], lines = [], shadows = [], labels = [];
  let currentCabinet = null, currentLayout = null;
  const face = (points, color, normal, id = null, extras = {}) => {
    if (currentCabinet) {
      points = points.map(p => rotateCabinetPoint(currentCabinet, p));
      if (normal) normal = rotateCabinetNormal(currentCabinet, normal);
    }
    if (normal && dot(normal, direction) < .00001) return;
    const shade = normal ? .82 + Math.max(0, normal[1]) * .23 + Math.max(0, normal[2]) * .14 : 1;
    faces.push({ points, color: colorShade(color, shade), id, ...extras });
  };
  const line = (a, b, color = '#6c6559', width = 1, id = null, extras = {}) => lines.push({ points: currentCabinet ? [a, b].map(p => rotateCabinetPoint(currentCabinet, p)) : [a, b], color, width, id, ...extras });
  const rawBox = (x, y, z, w, h, d, color, id, extras = {}) => {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const p = [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z], [x, y, z + d], [x + w, y, z + d], [x + w, y + h, z + d], [x, y + h, z + d]];
    [[0, 3, 2, 1, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]], [0, 4, 7, 3, [-1, 0, 0]], [1, 2, 6, 5, [1, 0, 0]], [3, 7, 6, 2, [0, 1, 0]], [0, 1, 5, 4, [0, -1, 0]]].forEach(f => face(f.slice(0, 4).map(i => p[i]), color, f[4], id, extras));
  };
  const cylinderX=(x,y,z,length,diameter,color,id,extras={})=>{
    if(length<=0||diameter<=0)return;
    const radius=diameter/2,count=20,ring=Array.from({length:count},(_,index)=>[y+radius*Math.cos(index*Math.PI*2/count),z+radius*Math.sin(index*Math.PI*2/count)]);
    const metadata={...extras,stroke:'transparent'};
    face(ring.map(([y,z])=>[x,y,z]),color,[-1,0,0],id,metadata);face(ring.map(([y,z])=>[x+length,y,z]),color,[1,0,0],id,metadata);
    ring.forEach(([py,pz],index)=>{const [qy,qz]=ring[(index+1)%count],angle=(index+.5)*Math.PI*2/count;face([[x,py,pz],[x+length,py,pz],[x+length,qy,qz],[x,qy,qz]],color,[0,Math.cos(angle),Math.sin(angle)],id,metadata);});
  };
  const box = (x, y, z, w, h, d, color, id, extras = {}) => {
    const c = currentCabinet, notch = c?.cutout;
    if (!notch || extras.noCutout || number(notch.width) <= 0 || number(notch.depth) <= 0) return rawBox(x, y, z, w, h, d, color, id, extras);
    const nx = c.x + (notch.corner === 'back-right' ? c.width - number(notch.width) : 0), nz = c.z;
    const ix = Math.max(x, nx), iz = Math.max(z, nz), iX = Math.min(x + w, nx + number(notch.width)), iZ = Math.min(z + d, nz + number(notch.depth));
    if (ix >= iX || iz >= iZ) return rawBox(x, y, z, w, h, d, color, id, extras);
    rawBox(x, y, z, ix - x, h, d, color, id, extras);
    rawBox(iX, y, z, x + w - iX, h, d, color, id, extras);
    rawBox(ix, y, z, iX - ix, h, iz - z, color, id, extras);
    rawBox(ix, y, iZ, iX - ix, h, z + d - iZ, color, id, extras);
  };
  const productionPanel = (part, c) => {
    const position = part.position, pw = number(part.finishedWidth, part.width), ph = number(part.finishedHeight, part.height), pt = number(part.thickness);
    if (!position || !part.orientation || /(?:Дверь \d+|Фасад ящика \d+)$/i.test(part.name)) return;
    const component = part.component || part.role || (/полка \d+$/i.test(part.name) ? 'shelf' : /задняя стенка(?: выреза)?$/i.test(part.name) ? 'back' : /^Возвратная/i.test(part.name) ? 'cutout-return' : part.partitionId || /перегородка \d+$/i.test(part.name) ? 'partition' : 'body');
    const layout=currentLayout||modelLayout(c,project),section=part.interiorSectionId?layout.internalSections?.find(s=>s.id===part.interiorSectionId):layout.sections.find(s => s.id === part.sectionId);
    if (component === 'shelf' && (!c.layout || section?.node.front === 'drawers')) return;
    const extras = { component, sectionId: part.sectionId, interiorSectionId:part.interiorSectionId, parentSectionId:part.parentSectionId, partId: part.id, braceId: part.braceId, internalDrawerIndex:part.internalDrawerIndex, noCutout: true };
    const internal=component.startsWith('internal-drawer')?engine.getInternalDrawerLayout(c,project).find(drawer=>drawer.sectionId===part.sectionId&&drawer.index===part.internalDrawerIndex):null;
    const slide = internal&&options.doorsOpen&&options.internalDrawersOpen ? Math.min(internal.box.depth*.48,260) : component === 'pull-out-shelf' && options.doorsOpen ? Math.min(number(section?.usableDepth, number(section?.depth, c.depth)) * .48, 260) : 0;
    const x = c.x + position.x, y = c.y + c.plinth + position.y, z = c.z + position.z + slide, color = material(project, part.materialId).color;
    if (part.orientation === 'horizontal') {
      const outline = part.outline || [{ x: 0, y: 0 }, { x: pw, y: 0 }, { x: pw, y: ph }, { x: 0, y: ph }];
      const bottom = outline.map(p => [x + p.x, y, z + p.y]), top = outline.map(p => [x + p.x, y + pt, z + p.y]);
      const area = outline.reduce((sum, p, i) => { const q = outline[(i + 1) % outline.length]; return sum + p.x * q.y - q.x * p.y; }, 0), sign = area >= 0 ? 1 : -1;
      face(bottom, color, [0, -1, 0], c.id, extras); face(top, color, [0, 1, 0], c.id, extras);
      outline.forEach((p, i) => {
        const j = (i + 1) % outline.length, q = outline[j], length = Math.hypot(q.x - p.x, q.y - p.y);
        if (length) face([bottom[i], bottom[j], top[j], top[i]], color, [(q.y - p.y) / length * sign, 0, -(q.x - p.x) / length * sign], c.id, extras);
      });
    } else if (part.orientation === 'vertical-depth') rawBox(x, y, z, pt, ph, pw, color, c.id, extras);
    else rawBox(x, y, z, pw, ph, pt, color, c.id, extras);
  };
  const r = roomData(project);
  if (options.room) {
    const outline = projectRoomOutline(project), orientation = signedArea(outline) >= 0 ? 1 : -1;
    face(outline.map(p => [p.x, -3, p.z]), '#e8e5dc', [0, 1, 0], null, { room: true, floor: true, stroke: '#cbc8bd' });
    const spacing = 500;
    const grid = (axis, value) => {
      const crossings = [];
      outline.forEach((a, i) => {
        const b = outline[(i + 1) % outline.length], av = axis === 'x' ? a.x : a.z, bv = axis === 'x' ? b.x : b.z;
        if (Math.abs(bv - av) < .00001 || value < Math.min(av, bv) || value > Math.max(av, bv)) return;
        const t = (value - av) / (bv - av);
        crossings.push(axis === 'x' ? a.z + (b.z - a.z) * t : a.x + (b.x - a.x) * t);
      });
      const sorted = [...new Set(crossings.map(round))].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        const mid = (sorted[i] + sorted[i + 1]) / 2;
        if (!pointInOutline(axis === 'x' ? value : mid, axis === 'x' ? mid : value, outline)) continue;
        const a = axis === 'x' ? [value, -2, sorted[i]] : [sorted[i], -2, value], b = axis === 'x' ? [value, -2, sorted[i + 1]] : [sorted[i + 1], -2, value];
        line(a, b, value % 1000 === 0 ? '#cac9c0' : '#d7d5cc', .65);
      }
    };
    for (let x = Math.ceil(Math.min(...outline.map(p => p.x)) / spacing) * spacing; x <= Math.max(...outline.map(p => p.x)); x += spacing) grid('x', x);
    for (let z = Math.ceil(Math.min(...outline.map(p => p.z)) / spacing) * spacing; z <= Math.max(...outline.map(p => p.z)); z += spacing) grid('z', z);
    for (let wallIndex = 0; wallIndex < outline.length; wallIndex++) {
      const a = outline[wallIndex], b = outline[(wallIndex + 1) % outline.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < .001) continue;
      const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length, inward = [-uz * orientation, 0, ux * orientation];
      const nearWall = dot(inward, direction) < -.00001;
      const wallLookup = { back: 0, right: 1, front: 2, left: 3 };
      const windows = r.windows.filter(w => (w.wallIndex !== undefined ? number(w.wallIndex) : wallLookup[w.wall]) === wallIndex).map(w => {
        const bottom = w.kind === 'door' ? 0 : Math.max(0, number(w.sill));
        return { kind: w.kind === 'door' ? 'door' : 'window', start: Math.max(0, number(w.offset)), end: Math.min(length, number(w.offset) + number(w.width)), bottom, top: Math.min(r.height, bottom + number(w.height)) };
      }).filter(w => w.end > w.start && w.top > w.bottom);
      const xs = [...new Set([0, length, ...windows.flatMap(w => [w.start, w.end])])].sort((a, b) => a - b);
      const ys = [...new Set([0, r.height, ...windows.flatMap(w => [w.bottom, w.top])])].sort((a, b) => a - b);
      const fixedPoint = (u, y, inset = 0) => [a.x + ux * u - inward[0] * inset, y, a.z + uz * u - inward[2] * inset];
      if (!nearWall) for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
        const midX = (xs[i] + xs[i + 1]) / 2, midY = (ys[j] + ys[j + 1]) / 2;
        if (windows.some(w => midX > w.start && midX < w.end && midY > w.bottom && midY < w.top)) continue;
        face([fixedPoint(xs[i], ys[j], .5), fixedPoint(xs[i + 1], ys[j], .5), fixedPoint(xs[i + 1], ys[j + 1], .5), fixedPoint(xs[i], ys[j + 1], .5)], Math.abs(inward[2]) > .5 ? '#efede6' : '#e3e3dc', null, null, { room: true, wallIndex, stroke: 'transparent' });
      }
      for (const w of windows) {
        const frame = [fixedPoint(w.start, w.bottom), fixedPoint(w.end, w.bottom), fixedPoint(w.end, w.top), fixedPoint(w.start, w.top)];
        const outside = [fixedPoint(w.start, w.bottom, r.wallThickness), fixedPoint(w.end, w.bottom, r.wallThickness), fixedPoint(w.end, w.top, r.wallThickness), fixedPoint(w.start, w.top, r.wallThickness)];
        if (!nearWall) frame.forEach((p, i) => {
          if (w.kind !== 'door' || i !== 0) face([p, frame[(i + 1) % 4], outside[(i + 1) % 4], outside[i]], '#d4d5cc', null, null, { room: true, stroke: '#bcc4bb' });
        });
        if (w.kind === 'door') {
          face(frame, '#e8dfce', null, null, { room: true, door: true, openingKind: 'door', openingSill: 0, wallIndex, opacity: .08, stroke: 'transparent' });
          [[0, 3], [3, 2], [2, 1]].forEach(([a, b]) => line(frame[a], frame[b], '#aaae9d', 2.5));
          // A light angled leaf distinguishes a doorway; the wall aperture
          // itself reaches the floor and has no glazed mullion or sill board.
          const openAngle = Math.PI / 3, doorWidth = w.end - w.start, hinge = fixedPoint(w.start, 0);
          const free = [hinge[0] + ux * doorWidth * Math.cos(openAngle) + inward[0] * doorWidth * Math.sin(openAngle), 0, hinge[2] + uz * doorWidth * Math.cos(openAngle) + inward[2] * doorWidth * Math.sin(openAngle)];
          face([hinge, free, [free[0], w.top, free[2]], [hinge[0], w.top, hinge[2]]], '#cdbf9f', null, null, { room: true, doorLeaf: true, opacity: nearWall ? .15 : .25, stroke: '#b7ad91' });
          labels.push({ point: fixedPoint((w.start + w.end) / 2, w.top + 35), text: `Дверной проём · ${mm(doorWidth)} × ${mm(w.top)} мм`, room: true });
        } else {
          // Open inspection walls retain their window location as a light ghost.
          face(frame, '#d5e7e7', null, null, { room: true, window: true, openingKind: 'window', openingSill: w.bottom, wallIndex, opacity: nearWall ? .24 : .55, stroke: '#a7b6b1' });
          frame.forEach((p, i) => line(p, frame[(i + 1) % 4], '#afb9b4', 3));
          line(fixedPoint((w.start + w.end) / 2, w.bottom), fixedPoint((w.start + w.end) / 2, w.top), '#b5c0b9', 2);
          line(fixedPoint(w.start, w.bottom), fixedPoint(w.end, w.bottom), '#f8f7ed', 5);
        }
      }
      for (let i = 0; i < xs.length - 1; i++) {
        const mid = (xs[i] + xs[i + 1]) / 2;
        if (!windows.some(w => w.kind === 'door' && mid > w.start && mid < w.end)) line(fixedPoint(xs[i], 0), fixedPoint(xs[i + 1], 0), '#c7c7be', 1.1);
      }
      if (!nearWall) {
        face([fixedPoint(0, r.height), fixedPoint(length, r.height), fixedPoint(length, r.height, r.wallThickness), fixedPoint(0, r.height, r.wallThickness)], '#f5f3eb', null, null, { room: true, stroke: '#d4d2c8' });
        line(fixedPoint(0, r.height), fixedPoint(length, r.height), '#d4d2c8', .8);
      }
    }
    if (options.ceiling) face(outline.map(p => [p.x, r.height, p.z]), '#e7e5db', null, null, { opacity: .14, room: true, ceiling: true, stroke: '#aaa89f' });
  }
  for (const raw of project.cabinets || []) {
    const c = cabinetData(project, raw), { x, y, z, width: w, height: h, depth: d, thickness: t, plinth: p, id } = c;
    currentCabinet = c;
    const layout = modelLayout(raw, project);
    currentLayout=layout;
    const bodyY = y + p, bodyH = Math.max(t * 2, h - p), backT = c.backThickness, bodyZ = z + backT, bodyD = Math.max(t, d - backT), frontT = c.frontThickness;
    if (y <= .1) {
      const footprint = engine.getCabinetFootprint?.(raw) || [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
      shadows.push({ points: footprint.map(a => rotateCabinetPoint(c, [x + a.x + 15, -1, z + a.z + 25])), color: '#55574e', opacity: .11 });
    }
    const modelParts = engine.generateParts({ ...project, settings: { ...project.settings, deductEdge: false }, cabinets: [raw] });
    modelParts.forEach(part => productionPanel(part, c));
    for(const rod of engine.getRodLayout?.(raw,project)||[]){
      const rx=x+rod.x,ry=bodyY+rod.y,rz=z+rod.z,extras={component:'rod',rodId:rod.rodId||rod.id,sectionId:rod.sectionId,interiorSectionId:rod.interiorSectionId,rodLength:rod.length,rodDiameter:rod.diameter};
      cylinderX(rx,ry,rz,rod.length,rod.diameter,'#647874',id,extras);
      const highlight=rod.diameter/2*Math.SQRT1_2;
      line([rx,ry+highlight,rz+highlight],[rx+rod.length,ry+highlight,rz+highlight],'#c8d5cf',.65,id,{...extras,component:'rod-highlight'});
      const holderLength=Math.min(6,rod.length/4);
      cylinderX(rx,ry,rz,holderLength,rod.diameter+.6,'#435b55',id,{...extras,component:'rod-holder',holderIndex:0});
      cylinderX(rx+rod.length-holderLength,ry,rz,holderLength,rod.diameter+.6,'#435b55',id,{...extras,component:'rod-holder',holderIndex:1});
    }
    for(const internal of engine.getInternalDrawerLayout(raw,project)){
      if(internal.openingMechanism==='push')continue;
      const slide=options.doorsOpen&&options.internalDrawersOpen?Math.min(internal.box.depth*.48,260):0;
      const handleWidth=Math.min(160,internal.width*.38), iz=bodyZ+internal.depth+internal.frontThickness+7+slide;
      box(x+internal.x+(internal.width-handleWidth)/2,bodyY+internal.y+internal.height*.65,iz,handleWidth,7,9,'#6a655b',id,{component:'internal-drawer-handle',sectionId:internal.sectionId,internalDrawerIndex:internal.index,handle:true,noCutout:true});
    }
    let fronts = [];
    try { fronts = getFrontLayout(raw, project) || []; } catch { /* Empty fronts keep partially edited models usable. */ }
    const doorFronts = fronts.filter(front => front.kind === 'door');
    const hasDrawers = fronts.some(front => front.kind === 'drawer');
    const requestedShelves = Array.isArray(raw.shelves) ? raw.shelves.length : Math.max(0, Math.floor(number(raw.shelves)));
    // Mixed cabinets reserve the upper zone for drawer boxes. Upstream
    // validation rejects shelves in pure drawer cabinets; omit them here too.
    const shelfZone = hasDrawers && doorFronts.length ? Math.max(...doorFronts.map(front => number(front.y) + number(front.height))) : bodyH;
    if (!raw.layout) {
      const shelves = hasDrawers && !doorFronts.length ? 0 : requestedShelves;
      for (let i = 1; i <= shelves; i++) box(x + t + 2, bodyY + t + Math.max(0, shelfZone - t * 2) * i / (shelves + 1), bodyZ, w - t * 2 - 4, t, bodyD - 20, c.bodyColor, id, { component: 'shelf' });
    }
    for (const s of layout.sections) {
      const appliance = s.node.appliance;
      if (!appliance) continue;
      const aw = Math.max(1, number(appliance.width, 600)), ah = Math.max(1, number(appliance.height, 850)), ad = Math.max(1, number(appliance.depth, 550));
      const ax = x + s.x + (s.width - aw) / 2, ay = bodyY + s.y, az = bodyZ + number(s.rearOffset) + Math.max(0, number(s.usableDepth, s.depth) - ad);
      const extras = { component: 'appliance', sectionId: s.id, noCutout: true };
      box(ax, ay, az, aw, ah, ad, '#d8dddb', id, extras);
      const detailExtras = { ...extras, component: 'appliance-detail' };
      if (['washer', 'dryer'].includes(appliance.type)) {
        const radius = Math.min(aw, ah) * .28, cx = ax + aw / 2, cy = ay + ah * .44;
        const circle = Array.from({ length: 32 }, (_, i) => [cx + radius * Math.cos(i * Math.PI / 16), cy + radius * Math.sin(i * Math.PI / 16), az + ad + 1]);
        face(circle, '#697a7a', [0, 0, 1], id, detailExtras);
        box(ax + aw * .1, ay + ah * .83, az + ad + .1, aw * .8, ah * .075, .2, '#b7c2be', id, detailExtras);
      } else if (appliance.type === 'boiler') box(ax + aw * .25, ay + ah * .08, az + ad + .1, aw * .5, ah * .07, .2, '#a9b6b0', id, detailExtras);
      const applianceBounds = corners({ min: [ax, ay, az], max: [ax + aw, ay + ah, az + ad] }).map(p => rotateCabinetPoint(c, p));
      const anchorFaces = [
        [[ax + aw / 2, ay + ah / 2, az + ad], [0, 0, 1]],
        [[ax + aw / 2, ay + ah / 2, az], [0, 0, -1]],
        [[ax, ay + ah / 2, az + ad / 2], [-1, 0, 0]],
        [[ax + aw, ay + ah / 2, az + ad / 2], [1, 0, 0]],
        [[ax + aw / 2, ay + ah, az + ad / 2], [0, 1, 0]],
      ].map(([p, normal]) => ({ point: rotateCabinetPoint(c, p), normal: rotateCabinetNormal(c, normal) }));
      labels.push({ point: rotateCabinetPoint(c, [ax + aw / 2, ay + ah + 28, az + ad]), anchorFaces, applianceBounds, text: `${appliance.label || ({ washer: 'Стиральная машина', dryer: 'Сушильная машина', boiler: 'Бойлер' }[appliance.type] || 'Оборудование')} · ${mm(aw)} × ${mm(ah)} × ${mm(ad)} мм`, id, appliance, section: s });
    }
    if (p > 0) {
      const portals = layout.sections.filter(s => s.floorOpen || (s.node.floor === 'open' && s.y <= 0));
      // Positional section panels define the support geometry. The old visual
      // feet remain only for uniform legacy carcasses; local bases may be at
      // different heights and must not receive invented full-height supports.
      const localBases = layout.sections.some(s => s.floorEligible && s.node.plinthHeight != null);
      for (const [footX, footZ] of raw.sidesToFloor === true || localBases ? [] : [[35, 35], [w - 70, 35], [35, d - 75], [w - 70, d - 75]]) {
        if (portals.some(s => footX < s.x + s.width && footX + 35 > s.x)) continue;
        box(x + footX, y + 4, z + footZ, 35, Math.max(5, p - 4), 35, '#6e6b61', id, { component: 'leg' });
      }
      const plinthGap = number(raw.gap, 2);
      if (!raw.layout && !modelParts.some(part => part.position && (part.role === 'plinth' || part.component === 'plinth' || /^Цокольная/i.test(part.name)))) {
        // Legacy files without positional plinth metadata still use their
        // original slab. Floor portals are excluded even in that fallback.
        const intervals = [plinthGap, w - plinthGap, ...portals.flatMap(s => [s.frontX, s.frontX + s.frontWidth])].sort((a, b) => a - b);
        for (let i = 0; i < intervals.length - 1; i++) {
          const mid = (intervals[i] + intervals[i + 1]) / 2;
          if (!portals.some(s => mid >= s.frontX && mid <= s.frontX + s.frontWidth)) box(x + intervals[i], y, z + d - 65, intervals[i + 1] - intervals[i], Math.max(2, p - 10), t, colorShade(c.bodyColor, .8), id, { component: 'plinth' });
        }
      }
    }
    for (const f of fronts) {
      const section = layout.sections.find(s => s.id === f.sectionId), fd = number(f.depth, bodyD);
      const fx = x + number(f.x), fy = bodyY + number(f.y), fw = number(f.width), fh = number(f.height), fz = bodyZ + fd;
      const opening=f.kind==='door'?doorOpening(f):null;
      const frontExtras = { component: 'front', sectionId: f.sectionId, frontIndex:f.index, openingMechanism:f.openingMechanism||'handle', ...(opening?{doorOpening:opening}:{}) };
      if (fw <= 0 || fh <= 0) continue;
      if (f.kind === 'drawer') {
        const usableDepth = number(section?.usableDepth, fd), rearOffset = number(section?.rearOffset);
        const slide = options.doorsOpen ? Math.min(usableDepth * .48, 260) : 0;
        {
          const drawerMaterial = material(project, raw.drawerMaterialId || raw.materialId);
          const bottomMaterial = material(project, raw.drawerBottomMaterialId || raw.backMaterialId);
          const drawerT = Math.max(3, number(drawerMaterial.thickness, 16));
          const bottomT = Math.max(2, number(raw.drawerBottomThickness, number(bottomMaterial.thickness, 6)));
          const sliderGap = Math.max(0, number(raw.drawerSlideGap, 13));
          const dw = (section?.width ?? w - 2 * t) - 2 * sliderGap, dd = usableDepth - 40, dh = Math.max(10, fh - 40 - bottomT);
          const dx = x + (section?.x ?? t) + sliderGap, dy = fy + 20, dz = bodyZ + rearOffset + 20 + slide;
          const drawerExtras = { component: 'drawer-box', sectionId: f.sectionId };
          box(dx, dy, dz, dw, bottomT, dd, bottomMaterial.color, id, drawerExtras);
          box(dx, dy + bottomT, dz, drawerT, dh, dd, drawerMaterial.color, id, drawerExtras);
          box(dx + dw - drawerT, dy + bottomT, dz, drawerT, dh, dd, drawerMaterial.color, id, drawerExtras);
          box(dx + drawerT, dy + bottomT, dz, dw - 2 * drawerT, dh, drawerT, drawerMaterial.color, id, drawerExtras);
          box(dx + drawerT, dy + bottomT, dz + dd - drawerT, dw - 2 * drawerT, dh, drawerT, drawerMaterial.color, id, drawerExtras);
        }
        if (options.interior) continue;
        box(fx, fy, fz + slide, fw, fh, frontT, c.frontColor, id, frontExtras);
        const handleW = Math.min(160, fw * .38);
        if(f.openingMechanism!=='push')box(fx + (fw - handleW) / 2, fy + fh * .65, fz + slide + frontT + 7, handleW, 7, 9, '#6a655b', id, { handle: true,component:'drawer-handle',sectionId:f.sectionId,frontIndex:f.index });
      } else if (options.interior) {
        continue;
      } else if (options.doorsOpen) {
        const rightHinge = opening==='right', topHinge=opening==='up';
        const hingeX = rightHinge ? fx + fw : fx, angle = Math.PI * .44;
        const sign = rightHinge ? -1 : 1, cos=Math.cos(angle), sin=Math.sin(angle);
        const u = topHinge?[1,0,0]:[sign*cos,0,sin], v=topHinge?[0,-cos,sin]:[0,1,0], n=topHinge?[0,sin,cos]:[-sign*sin,0,cos];
        const origin=[hingeX,topHinge?fy+fh:fy,fz];
        const transform = (a, b, depth) => add(origin,add(mul(u,a),add(mul(v,b),mul(n,depth))));
        const doorPoints = [[0, 0, 0], [fw, 0, 0], [fw, fh, 0], [0, fh, 0], [0, 0, frontT], [fw, 0, frontT], [fw, fh, frontT], [0, fh, frontT]].map(v => transform(...v));
        [[0, 1, 2, 3], [4, 5, 6, 7], [3, 2, 6, 7], [1, 5, 6, 2], [0, 4, 7, 3], [0,1,5,4]].forEach((indices, i) => face(indices.map(j => doorPoints[j]), colorShade(c.frontColor, i === 2 ? 1.03 : .94), null, id, frontExtras));
        const handleExtras={component:'door-handle',handle:true,sectionId:f.sectionId,frontIndex:f.index,doorOpening:opening};
        if(f.openingMechanism==='push')continue;
        if(topHinge){
          const handleW=Math.min(160,fw*.38);
          line(transform((fw-handleW)/2,fh-30,frontT+10),transform((fw+handleW)/2,fh-30,frontT+10),'#676358',3,id,handleExtras);
        } else line(transform(fw - 32, fh * .43, frontT + 10), transform(fw - 32, fh * .43 + Math.min(160, fh * .25), frontT + 10), '#676358', 3, id,handleExtras);
      } else {
        box(fx, fy, fz, fw, fh, frontT, c.frontColor, id, frontExtras);
        const rightHinge = opening==='right', topHinge=opening==='up';
        const handleX = rightHinge ? fx + 26 : fx + fw - 34;
        const handleExtras={component:'door-handle',handle:true,sectionId:f.sectionId,frontIndex:f.index,doorOpening:opening};
        if(f.openingMechanism==='push')continue;
        if(topHinge){
          const handleW=Math.min(160,fw*.38);
          box(fx+(fw-handleW)/2,fy+26,fz+frontT+7,handleW,7,9,'#6a655b',id,handleExtras);
        } else box(handleX, fy + fh * .43, fz + frontT + 7, 7, Math.min(160, fh * .25), 9, '#6a655b', id, handleExtras);
      }
    }
    if (raw.countertop || raw.worktop) box(x - 4, y + h, z - 2, w + 8, number(raw.worktopThickness, 28), d + 30, '#ece6d8', id);
  }
  return { faces, lines, shadows, labels };
}

function screenItems(scene, project) {
  // Room planes are backgrounds; sorting a floor by its centre would wrongly
  // cover cabinets at the back of a large room. Furniture is depth-sorted next.
  const layer = item => item.ceiling ? 6 : item.shadow ? 4 : item.floor ? 0 : item.line && !item.id ? (item.points.every(p => p[1] < 0) ? 1 : 3) : item.room ? 2 : 5;
  return [...scene.shadows.map(s => ({ ...s, shadow: true })), ...scene.faces, ...scene.lines.map(l => ({ ...l, line: true }))].map(item => ({ ...item, layer: layer(item), screen: item.points.map(project), depth: dot(average(item.points), project.axes.direction) + (item.line ? .7 : 0) })).sort((a, b) => a.layer - b.layer || a.depth - b.depth);
}

function pointInPolygon(x, y, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function dimensionPairs(project, id, view, showRoom) {
  const source = (project.cabinets || []).find(c => c.id === id), c = source ? cabinetData(project, source) : null;
  const b = c ? { min: [c.x, c.y, c.z], max: [c.x + c.width, c.y + c.height, c.z + c.depth] } : extent(project, id, showRoom), [x, y, z] = b.min, [X, Y, Z] = b.max;
  const finish = pairs => c ? pairs.map(pair => ({ ...pair, a: rotateCabinetPoint(c, pair.a), b: rotateCabinetPoint(c, pair.b) })) : pairs;
  if (view === 'top') return finish([{ a: [x, y, Z], b: [X, y, Z], label: fmt(X - x), offset: 27 }, { a: [X, y, z], b: [X, y, Z], label: fmt(Z - z), offset: -28 }]);
  if (view === 'left' || view === 'right') {
    const side = view === 'right' ? X : x;
    return finish([{ a: [side, y, z], b: [side, y, Z], label: fmt(Z - z), offset: view === 'right' ? -28 : 28 }, { a: [side, y, z], b: [side, Y, z], label: fmt(Y - y), offset: view === 'right' ? 28 : -28 }]);
  }
  if (view === '3d') return finish([{ a: [x, y, Z], b: [X, y, Z], label: fmt(X - x), offset: 28 }, { a: [X, y, z], b: [X, y, Z], label: fmt(Z - z), offset: -28 }, { a: [x, y, Z], b: [x, Y, Z], label: fmt(Y - y), offset: -30 }]);
  const frontZ = view === 'back' ? z : Z;
  return finish([{ a: [x, y, frontZ], b: [X, y, frontZ], label: fmt(X - x), offset: view === 'back' ? -28 : 28 }, { a: [x, y, frontZ], b: [x, Y, frontZ], label: fmt(Y - y), offset: view === 'back' ? 30 : -30 }]);
}

function dimensionGeometry(a, b, offset) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  if (len < 5) return null;
  const normal = [-dy / len, dx / len], v = normal.map(n => n * offset);
  return { a: [a[0] + v[0], a[1] + v[1]], b: [b[0] + v[0], b[1] + v[1]], normal, center: [(a[0] + b[0]) / 2 + v[0], (a[1] + b[1]) / 2 + v[1]] };
}

/** Orthographic software depth buffer. Each face may span a different depth:
 * sorting by a face centre cannot determine which panel is visible at a pixel.
 * The independently testable rasterizer also supplies exact object picking. */
function triangulate(vertices) {
  if (vertices.length === 3) return [[0, 1, 2]];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const area = vertices.reduce((sum, p, i) => { const q = vertices[(i + 1) % vertices.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (Math.abs(area) < .000001) return [];
  const sign = area >= 0 ? 1 : -1;
  if (vertices.every((p, i) => cross(p, vertices[(i + 1) % vertices.length], vertices[(i + 2) % vertices.length]) * sign >= -.000001)) return Array.from({ length: vertices.length - 2 }, (_, i) => [0, i + 1, i + 2]);
  const remaining = vertices.map((_, i) => i), result = [];
  let guard = vertices.length * vertices.length;
  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length], b = remaining[i], c = remaining[(i + 1) % remaining.length];
      if (cross(vertices[a], vertices[b], vertices[c]) * sign <= .000001) continue;
      const contains = remaining.some(index => index !== a && index !== b && index !== c && cross(vertices[a], vertices[b], vertices[index]) * sign >= -.000001 && cross(vertices[b], vertices[c], vertices[index]) * sign >= -.000001 && cross(vertices[c], vertices[a], vertices[index]) * sign >= -.000001);
      if (contains) continue;
      result.push([a, b, c]); remaining.splice(i, 1); clipped = true; break;
    }
    if (!clipped) return result;
  }
  if (remaining.length === 3) result.push([...remaining]);
  return result;
}

export function rasterizeFaces(faces, width, height, scale = 1, wireframe = false) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const depth = new Float32Array(width * height);
  const owners = new Uint32Array(width * height);
  depth.fill(-Infinity);
  const ownerIds = [null], ownerIndex = new Map();
  const colors = new Map();
  for (const face of faces) {
    let owner = ownerIndex.get(face.id);
    if (owner === undefined) { owner = ownerIds.length; ownerIndex.set(face.id, owner); ownerIds.push(face.id); }
    const color = wireframe ? '#e6e4da' : face.color;
    let rgb = colors.get(color);
    if (!rgb) {
      const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || '');
      const hex = match ? (match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1]) : 'c5b694';
      rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
      colors.set(color, rgb);
    }
    const vertices = face.screen.map(p => [p[0] * scale, p[1] * scale, p[2]]);
    for (const triangle of triangulate(vertices)) {
      const [a, b, c] = triangle.map(index => vertices[index]);
      const divisor = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(divisor) < .00001) continue;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      const w0dx = (b[1] - c[1]) / divisor, w0dy = (c[0] - b[0]) / divisor;
      const w1dx = (c[1] - a[1]) / divisor, w1dy = (a[0] - c[0]) / divisor;
      let rowW0 = ((b[1] - c[1]) * (minX + .5 - c[0]) + (c[0] - b[0]) * (minY + .5 - c[1])) / divisor;
      let rowW1 = ((c[1] - a[1]) * (minX + .5 - c[0]) + (a[0] - c[0]) * (minY + .5 - c[1])) / divisor;
      const zdx = (a[2] - c[2]) * w0dx + (b[2] - c[2]) * w1dx;
      const zdy = (a[2] - c[2]) * w0dy + (b[2] - c[2]) * w1dy;
      let rowZ = c[2] + (a[2] - c[2]) * rowW0 + (b[2] - c[2]) * rowW1;
      const alpha = wireframe ? 56 : Math.round(255 * (face.opacity ?? 1));
      for (let y = minY; y <= maxY; y++, rowW0 += w0dy, rowW1 += w1dy, rowZ += zdy) {
        let w0 = rowW0, w1 = rowW1, z = rowZ, offset = y * width + minX;
        for (let x = minX; x <= maxX; x++, offset++, w0 += w0dx, w1 += w1dx, z += zdx) {
          if (w0 < -.0000001 || w1 < -.0000001 || w0 + w1 > 1.0000001 || z < depth[offset] - .0001) continue;
          depth[offset] = z; owners[offset] = owner;
          const pixel = offset * 4;
          pixels[pixel] = rgb[0]; pixels[pixel + 1] = rgb[1]; pixels[pixel + 2] = rgb[2]; pixels[pixel + 3] = alpha;
        }
      }
    }
  }
  return { pixels, depth, owners, ownerIds, width, height, scale };
}

/** A dependency-free furniture viewport. Coordinates and all dimensions are millimetres. */
export class FurnitureViewport {
  constructor(canvas, { onSelect = () => {}, onChange = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.project = { cabinets: [], materials: [], room: {} };
    this.selectedId = null;
    this.options = { dimensions: true, room: true, wireframe: false, doorsOpen: false, ceiling: false };
    this.view = '3d';
    this.yaw = VIEWS['3d'].yaw;
    this.elevation = VIEWS['3d'].elevation;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.hits = [];
    this.width = 800;
    this.height = 600;
    this.listeners = [];
    this.rasterCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : canvas.ownerDocument?.createElement('canvas');
    this.rasterCtx = this.rasterCanvas?.getContext('2d');
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    canvas.setAttribute('aria-label', 'Трёхмерный проект мебели. Перетаскивание — поворот, Shift и перетаскивание — панорама, колесо — масштаб.');
    canvas.setAttribute('role', 'img');
    this.listen('pointerdown', event => this.pointerDown(event));
    this.listen('pointermove', event => this.pointerMove(event));
    this.listen('pointerup', event => this.pointerUp(event));
    this.listen('pointercancel', () => { this.drag = null; canvas.style.cursor = 'grab'; });
    this.listen('wheel', event => {
      event.preventDefault();
      this.zoom = Math.max(.28, Math.min(5, this.zoom * Math.exp(-event.deltaY * .0012)));
      this.draw();
    }, { passive: false });
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(canvas.parentElement || canvas);
    this.resize();
  }

  listen(type, fn, options) {
    this.canvas.addEventListener(type, fn, options);
    this.listeners.push([type, fn, options]);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const parent = this.canvas.parentElement?.getBoundingClientRect();
    this.width = Math.max(1, rect.width || parent?.width || 800);
    this.height = Math.max(1, rect.height || parent?.height || 600);
    const ratio = Math.min(3, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  setProject(project, selectedId = null) {
    this.project = project || { cabinets: [], materials: [] };
    this.selectedId = selectedId;
    this.draw();
  }

  setView(view) {
    if (!VIEWS[view]) return;
    if (this.view === view) return;
    this.view = view;
    this.yaw = VIEWS[view].yaw;
    this.elevation = VIEWS[view].elevation;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.draw();
  }

  setOptions(options) {
    Object.assign(this.options, options);
    this.draw();
  }

  setLanguage(language) {
    this.language = printLanguage(language);
    this.draw();
  }

  /** Render the current camera into a separate high-resolution print canvas.
   * No listeners, resize observers or state changes touch the visible viewport.
   * canvasFactory permits non-DOM hosts to supply an equivalent Canvas surface. */
  captureCabinet3D({ cabinetId = this.selectedId, language = this.language ?? this.project.settings?.printLanguage ?? 'tr', width = 2400, height = null, dimensions = this.options.dimensions, canvasFactory = null } = {}) {
    const cabinet = (this.project.cabinets || []).find(item => item.id === cabinetId);
    if (!cabinet) throw new Error(translatePrintText('Выберите шкаф для печати 3D-вида.',language));
    const createCanvas = canvasFactory || (() => (this.canvas.ownerDocument || globalThis.document)?.createElement('canvas'));
    const canvas = createCanvas();
    if (!canvas?.getContext || typeof canvas.toDataURL !== 'function') throw new Error(translatePrintText('Не удалось создать изображение для печати.',language));
    const imageWidth = Math.round(Math.max(300,Math.min(3600,number(width,2400))));
    const imageHeight = Math.round(Math.max(200,Math.min(3600,height == null ? imageWidth * this.height / this.width : number(height,imageWidth * this.height / this.width))));
    canvas.width=imageWidth;canvas.height=imageHeight;
    const context=canvas.getContext('2d');
    if (!context) throw new Error(translatePrintText('Не удалось создать изображение для печати.',language));
    const ratio=imageWidth/this.width;
    context.setTransform(ratio,0,0,ratio,0,0);
    const render=Object.create(FurnitureViewport.prototype);
    Object.assign(render,{
      canvas,ctx:context,project:{...this.project,cabinets:[cabinet]},selectedId:cabinetId,
      language:printLanguage(language),view:'3d',yaw:this.yaw,elevation:this.elevation,zoom:this.zoom,pan:{...this.pan},
      width:this.width,height:imageHeight/ratio,hits:[],
      options:{...this.options,room:false,ceiling:false,interior:false,focusCabinet:true,selectedSectionId:null,dimensions,selection:false,hud:false,background:'#ffffff',rasterResolution:ratio,rasterPixelBudget:imageWidth*imageHeight}
    });
    render.rasterCanvas=typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1,1) : createCanvas();
    render.rasterCtx=render.rasterCanvas?.getContext('2d');
    if (!render.rasterCtx) throw new Error(translatePrintText('Не удалось создать изображение для печати.',language));
    render.draw();
    return {imageDataUrl:canvas.toDataURL('image/png'),cabinetId,width:imageWidth,height:imageHeight,doorsOpen:Boolean(this.options.doorsOpen),internalDrawersOpen:Boolean(this.options.doorsOpen&&this.options.internalDrawersOpen),camera:{yaw:this.yaw,elevation:this.elevation,zoom:this.zoom,pan:{...this.pan}}};
  }

  /** Snapshot the whole room without the selection frame, appliance callouts
   * or HUD. The independent canvas retains the live rotation, pan and zoom. */
  captureRoom3D({language=this.language??this.project.settings?.printLanguage??'tr',width=2400,height=null,dimensions=false,canvasFactory=null}={}){
    const createCanvas=canvasFactory||(()=>(this.canvas.ownerDocument||globalThis.document)?.createElement('canvas'));
    const canvas=createCanvas(),failure=()=>new Error(translatePrintText('Не удалось создать изображение для печати.',language));
    if(!canvas?.getContext||typeof canvas.toDataURL!=='function')throw failure();
    const imageWidth=Math.round(Math.max(300,Math.min(3600,number(width,2400)))),imageHeight=Math.round(Math.max(200,Math.min(3600,height==null?imageWidth*this.height/this.width:number(height,imageWidth*this.height/this.width))));
    canvas.width=imageWidth;canvas.height=imageHeight;
    const context=canvas.getContext('2d');if(!context)throw failure();
    const ratio=imageWidth/this.width;context.setTransform(ratio,0,0,ratio,0,0);
    const render=Object.create(FurnitureViewport.prototype);
    Object.assign(render,{
      canvas,ctx:context,project:this.project,selectedId:null,language:printLanguage(language),view:'3d',yaw:this.yaw,elevation:this.elevation,zoom:this.zoom,pan:{...this.pan},width:this.width,height:imageHeight/ratio,hits:[],
      options:{...this.options,room:true,interior:false,focusCabinet:false,selectedSectionId:null,dimensions,selection:false,hud:false,background:'#ffffff',rasterResolution:ratio,rasterPixelBudget:imageWidth*imageHeight}
    });
    render.rasterCanvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1,1):createCanvas();
    render.rasterCtx=render.rasterCanvas?.getContext('2d');if(!render.rasterCtx)throw failure();
    render.draw();
    return {imageDataUrl:canvas.toDataURL('image/png'),width:imageWidth,height:imageHeight,doorsOpen:Boolean(this.options.doorsOpen),internalDrawersOpen:Boolean(this.options.doorsOpen&&this.options.internalDrawersOpen),camera:{yaw:this.yaw,elevation:this.elevation,zoom:this.zoom,pan:{...this.pan}}};
  }

  resetCamera() {
    this.yaw = VIEWS[this.view].yaw;
    this.elevation = VIEWS[this.view].elevation;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.draw();
  }

  pointerDown(event) {
    if (event.button !== 0 && event.button !== 1) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, pan: event.shiftKey || event.button === 1, moved: false };
    this.canvas.style.cursor = 'grabbing';
  }

  pointerMove(event) {
    if (!this.drag) return;
    const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
    if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 4) this.drag.moved = true;
    if (this.drag.pan || event.shiftKey || this.view !== '3d') {
      this.pan.x += dx;
      this.pan.y += dy;
    } else {
      this.yaw -= dx * .008;
      this.elevation = Math.max(.035, Math.min(Math.PI * .47, this.elevation + dy * .006));
    }
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
    this.draw();
  }

  pointerUp(event) {
    if (!this.drag) return;
    if (!this.drag.moved) {
      const rect = this.canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      if (this.view === '3d' && this.camera?.width < this.width && x >= this.camera.width) {
        // An annotation is not a model face, and must not pick a clipped face.
      } else if (this.depthFrame) {
        const frame = this.depthFrame, px = Math.floor(x * frame.scale), py = Math.floor(y * frame.scale);
        const owner = px >= 0 && py >= 0 && px < frame.width && py < frame.height ? frame.owners[py * frame.width + px] : 0;
        this.onSelect(frame.ownerIds[owner] || null);
      } else {
        const hit = [...this.hits].reverse().find(item => pointInPolygon(x, y, item.screen));
        this.onSelect(hit?.id || null);
      }
    }
    this.drag = null;
    this.canvas.style.cursor = 'grab';
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const language = printLanguage(this.language), t = text => translatePrintText(text,language), unit = language === 'ru' ? 'мм' : 'mm';
    ctx.clearRect(0, 0, this.width, this.height);
    const background = this.options.background || ctx.createLinearGradient(0, 0, 0, this.height);
    if (!this.options.background) { background.addColorStop(0, '#f5f6f2'); background.addColorStop(1, '#e8eae3'); }
    ctx.fillStyle = background; ctx.fillRect(0, 0, this.width, this.height);
    const axes = basis(this.yaw, this.elevation);
    const focused = this.options.focusCabinet ? (this.project.cabinets || []).find(c => c.id === this.selectedId) : null;
    const displayProject = focused ? { ...this.project, cabinets: [focused] } : this.project;
    const showRoom = this.options.room && !focused;
    const scene = makeScene(displayProject, { ...this.options, room: showRoom, interior: this.view === 'interior' || this.options.interior }, axes.direction);
    const calloutLabels = this.view === '3d' ? scene.labels.filter(label => label.appliance && (!showRoom || label.id === this.selectedId)) : [];
    const modelWidth = calloutLabels.length ? this.width - applianceCalloutBand(this.width) : this.width;
    let bounds = extent(displayProject, focused?.id, showRoom);
    if (focused) {
      const points = scene.faces.filter(face => face.id).flatMap(face => face.points);
      if (points.length) bounds = { min: [0, 1, 2].map(axis => Math.min(...points.map(p => p[axis]))), max: [0, 1, 2].map(axis => Math.max(...points.map(p => p[axis]))) };
    }
    const margin = Math.min(this.options.dimensions ? (this.selectedId ? 44 : 58) : 36, modelWidth * .2, this.height * .2);
    const camera = projection(bounds, axes, modelWidth, this.height, this.zoom, this.pan, margin);
    camera.project.axes = axes;
    this.camera = camera;
    const items = screenItems(scene, camera.project);
    this.hits = [];
    this.applianceCallouts = [];
    // This strip stays outside the model, including during zoom and panning.
    // Callouts themselves are painted after the engineering dimensions.
    ctx.save();
    if (calloutLabels.length) { ctx.beginPath(); ctx.rect(0, 0, modelWidth, this.height); ctx.clip(); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const paint = item => {
      ctx.save();
      ctx.globalAlpha = item.opacity ?? 1;
      ctx.beginPath();
      item.screen.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      if (item.line) {
        ctx.strokeStyle = item.color; ctx.lineWidth = item.width; ctx.stroke();
      } else {
        ctx.closePath();
        ctx.fillStyle = this.options.wireframe && item.id ? '#e6e4da' : item.color;
        if (this.options.wireframe && item.id) ctx.globalAlpha = .22;
        ctx.fill();
        if (!item.shadow && item.stroke !== 'transparent') {
          ctx.globalAlpha = item.opacity ?? 1;
          ctx.strokeStyle = item.stroke || (item.id === this.selectedId ? '#537f77' : '#686458');
          ctx.lineWidth = item.id ? .8 : .6;
          ctx.stroke();
        }
        if (item.id && !item.shadow) this.hits.push(item);
      }
      ctx.restore();
    };
    items.filter(item => item.layer < 5).forEach(paint);
    const furniture = items.filter(item => item.layer === 5);
    if (!this.drawDepthFurniture(furniture, camera.scale)) furniture.forEach(paint);
    items.filter(item => item.layer > 5).forEach(paint);
    if (this.options.selection !== false && this.selectedId) this.drawSelection(camera.project);
    if (this.options.selection !== false && this.options.selectedSectionId) this.drawSectionSelection(camera.project);
    for (const label of scene.labels || []) {
      if (this.view === '3d' && label.appliance) continue;
      const position = camera.project(label.point);
      const appliance = label.appliance, fallbackName = ({ washer:'Стиральная машина',dryer:'Сушильная машина',boiler:'Бойлер' }[appliance?.type] || 'Оборудование');
      const text = appliance ? `${translateBuiltInName(appliance.label,language,'appliance') || t(fallbackName)} · ${sizeText(appliance,language)} ${unit}` : t(label.text);
      ctx.save(); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const size = ctx.measureText(text).width + 14;
      ctx.fillStyle = '#f7f9f3ee'; ctx.fillRect(position[0] - size / 2, position[1] - 10, size, 20);
      ctx.fillStyle = '#53675e'; ctx.fillText(text, position[0], position[1]); ctx.restore();
    }
    if (this.options.dimensions) {
      for (const dim of dimensionPairs(displayProject, this.selectedId, this.view, showRoom)) this.drawDimension(camera.project(dim.a), camera.project(dim.b), dim.label, dim.offset);
    }
    ctx.restore();
    if (calloutLabels.length) {
      const annotations = calloutLabels.flatMap(label => {
        const projected = label.applianceBounds.map(camera.project);
        if (Math.max(...projected.map(p => p[0])) < 0 || Math.min(...projected.map(p => p[0])) > modelWidth || Math.max(...projected.map(p => p[1])) < 0 || Math.min(...projected.map(p => p[1])) > this.height) return [];
        const appliance = label.appliance, fallbackName = ({ washer: 'Стиральная машина', dryer: 'Сушильная машина', boiler: 'Бойлер' }[appliance.type] || 'Оборудование');
        const name = translateBuiltInName(appliance.label, language, 'appliance') || t(fallbackName), dimensions = `${sizeText(appliance, language)} ${unit}`;
        const visible = label.anchorFaces.filter(face => dot(face.normal, axes.direction) > .00001);
        // Prefer the recognisable front; use a visible side/top when looking
        // from behind so the arrow still ends on the appliance's own surface.
        const front = label.anchorFaces[0];
        const anchorFace = visible.includes(front) ? front : visible.sort((a, b) => dot(b.normal, axes.direction) - dot(a.normal, axes.direction))[0] || front;
        return [{ id: label.id, sectionId: label.section.id, name, dimensions, text: `${name} · ${dimensions}`, anchor: camera.project(anchorFace.point), worldAnchor: anchorFace.point }];
      });
      const layout = layoutApplianceCallouts(annotations, { width: this.width, height: this.height, modelWidth, bottomInset: this.options.hud === false ? 12 : 88, measureText: (text, font) => { ctx.font = `${font}px system-ui, sans-serif`; return ctx.measureText(text).width; } });
      this.applianceCallouts = layout.cards;
      this.drawApplianceCallouts(layout);
    }
    if (this.options.hud !== false) this.drawCompass(axes);
    // A calibrated scale, not a camera-dependent nominal scale number.
    if (this.options.hud !== false && camera.scale > 0 && this.width > 200) {
      const candidates = [50, 100, 200, 500, 1000, 2000];
      const mm = candidates.reduce((best, value) => Math.abs(value * camera.scale - 75) < Math.abs(best * camera.scale - 75) ? value : best, 500);
      const size = mm * camera.scale;
      ctx.strokeStyle = '#87918a'; ctx.fillStyle = '#737c76'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(22, this.height - 30); ctx.lineTo(22 + size, this.height - 30);
      ctx.moveTo(22, this.height - 34); ctx.lineTo(22, this.height - 26);
      ctx.moveTo(22 + size, this.height - 34); ctx.lineTo(22 + size, this.height - 26); ctx.stroke();
      ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${printNumber(mm,language)} ${unit}`, 22, this.height - 41);
    }
  }

  drawApplianceCallouts({ cards, band }) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = this.options.background || '#f4f6f1';
    ctx.fillRect(band.x, 0, band.width, this.height);
    ctx.strokeStyle = '#779088'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(band.x, 12); ctx.lineTo(band.x, this.height - 12); ctx.stroke();
    for (const card of cards) {
      const [start, elbow, anchor] = card.leader;
      ctx.strokeStyle = '#53796f'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...elbow); ctx.lineTo(...anchor); ctx.stroke();
      const angle = Math.atan2(anchor[1] - elbow[1], anchor[0] - elbow[0]);
      const arrowSize = 5;
      ctx.fillStyle = '#53796f'; ctx.beginPath(); ctx.moveTo(...anchor);
      ctx.lineTo(anchor[0] - arrowSize * Math.cos(angle - .45), anchor[1] - arrowSize * Math.sin(angle - .45));
      ctx.lineTo(anchor[0] - arrowSize * Math.cos(angle + .45), anchor[1] - arrowSize * Math.sin(angle + .45));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffffed'; ctx.strokeStyle = '#c4d1c9'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.rect(card.x, card.y, card.width, card.height); ctx.fill(); ctx.stroke();
      ctx.font = `${card.fontSize}px system-ui, sans-serif`; ctx.fillStyle = '#334a40'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      card.lines.forEach((line, index) => ctx.fillText(line, card.x + card.padding, card.y + card.padding + (card.fontSize + 3) * (index + .5)));
    }
    ctx.restore();
  }

  drawDepthFurniture(items, cameraScale) {
    if (!this.rasterCtx) { this.depthFrame = null; return false; }
    const resolution = Math.min(number(this.options.rasterResolution,Math.min(1.5,globalThis.devicePixelRatio || 1)),Math.sqrt(number(this.options.rasterPixelBudget,1500000) / (this.width * this.height)));
    const width = Math.max(1, Math.ceil(this.width * resolution)), height = Math.max(1, Math.ceil(this.height * resolution));
    const faces = items.filter(item => !item.line);
    this.depthFrame = rasterizeFaces(faces, width, height, resolution, this.options.wireframe);
    this.hits = faces;
    if (this.rasterCanvas.width !== width) this.rasterCanvas.width = width;
    if (this.rasterCanvas.height !== height) this.rasterCanvas.height = height;
    const image = this.rasterCtx.createImageData(width, height);
    image.data.set(this.depthFrame.pixels);
    this.rasterCtx.putImageData(image, 0, 0);
    this.ctx.drawImage(this.rasterCanvas, 0, 0, this.width, this.height);
    const tolerance = .45 / Math.max(.01, cameraScale);
    for (const item of items) {
      if(!item.line&&item.stroke==='transparent'&&!this.options.wireframe)continue;
      const color = item.line ? item.color : this.options.selection !== false && item.id === this.selectedId ? '#537f77' : '#686458';
      const width = item.line ? item.width : .8;
      this.drawVisibleEdges(item.screen, !item.line, color, width, tolerance);
    }
    return true;
  }

  drawVisibleEdges(points, close, color, lineWidth, tolerance) {
    const ctx = this.ctx, frame = this.depthFrame;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.beginPath();
    const edgeCount = close ? points.length : points.length - 1;
    for (let edge = 0; edge < edgeCount; edge++) {
      const a = points[edge], b = points[(edge + 1) % points.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.5));
      let previousVisible = false;
      for (let step = 0; step <= steps; step++) {
        const t = step / steps, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
        const px = Math.floor(x * frame.scale), py = Math.floor(y * frame.scale);
        const visible = px >= 0 && py >= 0 && px < frame.width && py < frame.height && z >= frame.depth[py * frame.width + px] - tolerance;
        if (visible) { if (previousVisible) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        previousVisible = visible;
      }
    }
    ctx.stroke(); ctx.restore();
  }

  drawSelection(projectPoint) {
    const raw = (this.project.cabinets || []).find(c => c.id === this.selectedId);
    if (!raw) return;
    const c = cabinetData(this.project, raw), pts = corners({ min: [c.x, c.y, c.z], max: [c.x + c.width, c.y + c.height, c.z + c.depth + c.frontThickness] }).map(p => projectPoint(rotateCabinetPoint(c, p)));
    const ctx = this.ctx;
    ctx.save(); ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5;
    ctx.beginPath();
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => { ctx.moveTo(...pts[a].slice(0, 2)); ctx.lineTo(...pts[b].slice(0, 2)); });
    ctx.stroke(); ctx.restore();
  }

  drawSectionSelection(projectPoint) {
    const raw = (this.project.cabinets || []).find(c => c.id === this.selectedId);
    if (!raw) return;
    const layout=modelLayout(raw,this.project), section=[...layout.sections,...(layout.internalSections||[])].find(s => s.id === this.options.selectedSectionId);
    if (!section) return;
    const c = cabinetData(this.project, raw), sy = c.y + c.plinth + section.y, sx = c.x + section.x, sz = c.z + c.backThickness + number(section.rearOffset);
    const pts = corners({ min: [sx, sy, sz], max: [sx + section.width, sy + section.height, sz + number(section.usableDepth,section.depth)] }).map(p => projectPoint(rotateCabinetPoint(c, p)));
    const ctx = this.ctx;
    ctx.save(); ctx.strokeStyle = '#00b8a8'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    [[4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => { ctx.moveTo(...pts[a].slice(0, 2)); ctx.lineTo(...pts[b].slice(0, 2)); });
    ctx.stroke(); ctx.restore();
  }

  drawDimension(start, end, label, offset) {
    label = printNumber(Number(String(label).replace(/[\s\u00a0\u202f]/g,'')),printLanguage(this.language));
    const d = dimensionGeometry(start, end, offset);
    if (!d) return;
    const ctx = this.ctx, color = this.selectedId ? '#168780' : '#6d7971';
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = .85; ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]); ctx.lineTo(d.a[0] + d.normal[0] * 4, d.a[1] + d.normal[1] * 4);
    ctx.moveTo(end[0], end[1]); ctx.lineTo(d.b[0] + d.normal[0] * 4, d.b[1] + d.normal[1] * 4);
    ctx.moveTo(...d.a); ctx.lineTo(...d.b);
    [d.a, d.b].forEach(p => { ctx.moveTo(p[0] - 4, p[1] + 4); ctx.lineTo(p[0] + 4, p[1] - 4); });
    ctx.stroke();
    ctx.font = '500 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const width = ctx.measureText(label).width + 14;
    ctx.fillStyle = '#f5f7f1';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(d.center[0] - width / 2, d.center[1] - 10, width, 20, 5);
    else ctx.rect(d.center[0] - width / 2, d.center[1] - 10, width, 20);
    ctx.fill(); ctx.fillStyle = color; ctx.fillText(label, d.center[0], d.center[1]); ctx.restore();
  }

  drawCompass(axes) {
    const ctx = this.ctx, origin = [this.width - 43, this.height - 44];
    ctx.save(); ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [[35, 0, 0, '#bc7869', 'X'], [0, 35, 0, '#8d9c73', 'Y'], [0, 0, 35, '#738fac', 'Z']].forEach(axis => {
      const p = [origin[0] + dot(axis, axes.right), origin[1] - dot(axis, axes.up)];
      ctx.strokeStyle = axis[3]; ctx.fillStyle = axis[3]; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(...origin); ctx.lineTo(...p); ctx.stroke();
      ctx.fillText(axis[4], p[0] + (p[0] - origin[0]) * .22, p[1] + (p[1] - origin[1]) * .22);
    });
    ctx.restore();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.listeners.forEach(([type, fn, options]) => this.canvas.removeEventListener(type, fn, options));
    this.listeners = [];
    this.drag = null;
  }
}

function svgDimension(a, b, label, offset) {
  const d = dimensionGeometry(a, b, offset);
  if (!d) return '';
  const line = (p, q) => `<path d="M${round(p[0])},${round(p[1])} L${round(q[0])},${round(q[1])}"/>`;
  const textWidth = String(label).length * 7 + 14;
  return `<g fill="none" stroke="#53605b" stroke-width="1">${line(a, add(d.a, mul(d.normal, 5)))}${line(b, add(d.b, mul(d.normal, 5)))}${line(d.a, d.b)}${[d.a, d.b].map(p => line([p[0] - 4, p[1] + 4], [p[0] + 4, p[1] - 4])).join('')}</g><rect x="${round(d.center[0] - textWidth / 2)}" y="${round(d.center[1] - 10)}" width="${textWidth}" height="20" fill="white"/><text x="${round(d.center[0])}" y="${round(d.center[1] + 4)}" text-anchor="middle" font-size="12" fill="#35433d">${escape(label)}</text>`;
}

function svgTextBlock(position, lines, fontSize = 11, maxWidth = 210) {
  const width = Math.min(maxWidth, Math.max(42, ...lines.map(line => String(line).length * fontSize * .57 + 14))), height = lines.length * (fontSize + 3) + 8;
  return `<g><rect x="${round(position[0] - width / 2)}" y="${round(position[1] - height / 2)}" width="${round(width)}" height="${height}" rx="3" fill="white" fill-opacity=".92"/>${lines.map((line, i) => `<text x="${round(position[0])}" y="${round(position[1] - height / 2 + 7 + fontSize + i * (fontSize + 3))}" text-anchor="middle" font-size="${fontSize}" fill="#334a40">${escape(line)}</text>`).join('')}</g>`;
}

function interiorSectionMark(layout,section){
  if(!section)return '—';
  const outer=layout.sections.findIndex(item=>item.id===section.parentSectionId),siblings=(layout.internalSections||[]).filter(item=>item.parentSectionId===section.parentSectionId);
  return `S${outer+1}.${siblings.findIndex(item=>item.id===section.id)+1}`;
}

function rodDrawingAnnotations(source,cabinet,view,camera,dimensions,language,compact){
  if(!['front','interior','top'].includes(view))return '';
  const t=text=>translatePrintText(text,language),n=value=>printNumber(value,language),unit=language==='ru'?'мм':'mm';
  return (engine.getRodLayout?.(cabinet,source)||[]).map((rod,index)=>{
    const a=camera.project([number(cabinet.x)+rod.x,number(cabinet.y)+number(cabinet.plinth)+rod.y,number(cabinet.z)+rod.z]),b=camera.project([number(cabinet.x)+rod.x+rod.length,number(cabinet.y)+number(cabinet.plinth)+rod.y,number(cabinet.z)+rod.z]);
    const label=`R${index+1} · ${n(rod.length)} · Ø${n(rod.diameter)}`,point=[(a[0]+b[0])/2,(a[1]+b[1])/2-(compact?10:15)];
    return `<g data-rod-id="${escape(rod.rodId||rod.id)}" data-section-id="${escape(rod.sectionId)}"${rod.interiorSectionId?` data-interior-section-id="${escape(rod.interiorSectionId)}"`:''} data-rod-length-mm="${round(rod.length)}" data-rod-diameter-mm="${round(rod.diameter)}" data-rod-axis-height-mm="${round(number(cabinet.plinth)+rod.y)}"><title>${escape(t('Штанга'))} R${index+1} · ${n(rod.length)} ${unit} · Ø${n(rod.diameter)}</title><path d="M${round(a[0])},${round(a[1])} L${round(b[0])},${round(b[1])}" fill="none" stroke="#5c797b" stroke-width="1.5"${view==='interior'?'':` stroke-dasharray="${compact?'4 3':'7 4'}"`}/>${svgTextBlock(point,[label],compact?9.2:10,Math.max(65,Math.abs(b[0]-a[0])-4))}${dimensions&&!compact?svgDimension(a,b,n(rod.length),view==='top'?20:-20):''}</g>`;
  }).join('');
}

function cabinetDrawingAnnotations(source, cabinet, view, camera, dimensions, language = 'ru', compact = false) {
  const t = text => translatePrintText(text, language), n = value => printNumber(number(value), language), unit = language === 'ru' ? 'мм' : 'mm';
  const layout = modelLayout(cabinet, source), bodyY = number(cabinet.y) + number(cabinet.plinth), x = number(cabinet.x), z = number(cabinet.z) + cabinetData(source, cabinet).backThickness;
  const mountingAxes=engine.getSectionMountingAxes(cabinet,source), mountingById=new Map(mountingAxes.map(axis=>[axis.id,axis]));
  if (view === 'back') {
    return engine.generateParts(source).filter(part => part.braceId || part.role === 'brace' || part.component === 'brace').map((part, i) => {
      const position = part.position, bottom = number(cabinet.plinth) + number(position.y);
      const point = camera.project([x + position.x + number(part.finishedWidth, part.width) / 2, bodyY + position.y + number(part.finishedHeight, part.height) / 2, number(cabinet.z) + position.z]);
      const sectionIndex=layout.sections.findIndex(section=>section.id===part.sectionId), localBottom=!part.sectionId||part.braceBaseY == null ? null : number(position.y)-number(part.braceBaseY);
      const mark=`C${i+1}${sectionIndex<0?'':` · S${sectionIndex+1}`}`;
      return `<g data-brace-id="${escape(part.braceId||part.id)}"${part.sectionId?` data-section-id="${escape(part.sectionId)}"`:''} data-mount-cabinet-mm="${round(bottom)}"${localBottom==null?'':` data-mount-section-mm="${round(localBottom)}"`}>${svgTextBlock(point, compact ? [`${mark} · ${n(bottom)} ${unit}`] : [`${mark} · ${n(part.width)} × ${n(part.height)} × ${n(part.thickness)} ${unit}`, `${t('Низ от основания шкафа:')} ${n(bottom)} ${unit}`, ...(localBottom==null?[]:[`${t('Низ от основания секции:')} ${n(localBottom)} ${unit}`])], compact ? 9.2 : 10, 310)}</g>`;
    }).join('');
  }
  if (!['front', 'interior'].includes(view)) return '';
  const fronts=getFrontLayout(cabinet,source);
  let output = fronts.filter(front=>front.kind==='door').map(front=>{
    const opening=doorOpening(front), title=t({left:'Петли слева',right:'Петли справа',up:'Петли сверху'}[opening]);
    const p=(a,b)=>camera.project([x+front.x+front.width*a,bodyY+front.y+front.height*b,z+number(front.depth,layout.bodyDepth)]).slice(0,2).map(round);
    const vertices=opening==='left'?[[.92,.94],[.06,.5],[.92,.06]]:opening==='right'?[[.08,.94],[.94,.5],[.08,.06]]:[[.06,.08],[.5,.94],[.94,.08]];
    const marks=opening==='up'?[[[.15,.94],[.28,.94]],[[.72,.94],[.85,.94]]]:[[[opening==='left'?.06:.94,.15],[opening==='left'?.06:.94,.28]],[[opening==='left'?.06:.94,.72],[opening==='left'?.06:.94,.85]]];
    return `<g data-opening-symbol="true" data-door-opening="${opening}" data-front-index="${number(front.index)+1}"${front.sectionId?` data-section-id="${escape(front.sectionId)}"`:''}><title>${escape(title)}</title><polyline points="${vertices.map(vertex=>p(...vertex).join(',')).join(' ')}" fill="none" stroke="#52736a" stroke-width=".9" stroke-dasharray="${compact?'3 3':'6 4'}" opacity=".72"/>${marks.map(([a,b])=>`<path d="M${p(...a).join(',')} L${p(...b).join(',')}" fill="none" stroke="#52736a" stroke-width="1.8"/>`).join('')}</g>`;
  }).join('');
  if (view === 'front') {
    fronts.forEach((front, i) => {
      const position = camera.project([x + front.x + front.width / 2, bodyY + front.y + front.height / 2, z + number(front.depth, layout.bodyDepth)]);
      const availableWidth = front.width * camera.scale, availableHeight = front.height * camera.scale;
      const font = compact ? 9.2 : Math.min(12, Math.max(8, Math.min(availableWidth / 13, availableHeight / 3.1)));
      if (!compact || availableHeight >= 19) output += svgTextBlock(position, compact ? [`F${i + 1} ${n(front.width)}×${n(front.height)}`] : [`F${i + 1} · ${t(front.kind === 'door' ? 'дверь' : 'ящик')}`, `${n(front.width)} × ${n(front.height)} ${unit}`], font, Math.max(40, availableWidth - 6));
    });
  } else {
    layout.sections.forEach((section, i) => {
      const hasInternal=number(section.node.internalDrawerCount)>0||Boolean(section.node.interiorLayout);
      const position = camera.project([x + section.x + section.width / 2, bodyY + section.y + (hasInternal?section.height+16:section.height/2), z + section.depth]);
      const axis=mountingById.get(section.id), axisLine=axis?.height == null ? t(axis?.bottom == null?'Нет нижней оси крепления':'Нет пары осей крепления') : `A ${n(axis.height)} ${unit}`;
      if (!compact || section.height * camera.scale >= 19) output += svgTextBlock(position, compact||hasInternal ? [`S${i + 1} ${n(section.width)}×${n(section.height)}`] : [`S${i + 1} · ${translateBuiltInName(section.node.name,language,'section') || t('секция')}`, `${t('Проём')} ${n(section.width)} × ${n(section.height)} ${unit}`, `${t('Полезная глубина')} ${n(section.usableDepth ?? section.depth)} ${unit}`, ...(dimensions?[axisLine]:[])], compact||hasInternal ? 9.2 : Math.min(11, Math.max(8, section.width * camera.scale / 23)), 230);
    });
    (layout.internalSections||[]).forEach(section=>{
      const mark=interiorSectionMark(layout,section),drawers=section.node.front==='drawers',position=camera.project([x+section.x+section.width/2,bodyY+section.y+(drawers?section.height+12:section.height/2),z+section.depth]);
      const lines=compact||drawers?[`${mark} ${n(section.width)}×${n(section.height)}`]:[`${mark} · ${translateBuiltInName(section.node.name,language,'section')||t('секция')}`,`${t('Проём')} ${n(section.width)} × ${n(section.height)} ${unit}`,`${t('Полезная глубина')} ${n(section.usableDepth??section.depth)} ${unit}`];
      output+=`<g data-interior-section="${escape(section.id)}" data-parent-section-id="${escape(section.parentSectionId)}" data-section-mark="${mark}" data-opening-width-mm="${round(section.width)}" data-opening-height-mm="${round(section.height)}">${svgTextBlock(position,lines,9.2,230)}</g>`;
    });
    engine.getInternalDrawerLayout(cabinet,source).forEach((drawer,index)=>{
      const position=camera.project([x+drawer.x+drawer.width/2,bodyY+drawer.y+drawer.height/2,z+drawer.depth]);
      output+=`<g data-internal-front="${index+1}" data-section-id="${escape(drawer.sectionId)}">${svgTextBlock(position,compact||drawer.height*camera.scale<34?[`I${index+1} ${n(drawer.width)}×${n(drawer.height)}`]:[`I${index+1} · ${t('Внутренний фасад')}`,`${n(drawer.width)} × ${n(drawer.height)} ${unit}`],9.2,240)}</g>`;
    });
  }
  if (dimensions) {
    layout.sections.filter(section=>section.floorEligible&&section.node.plinthHeight!=null&&number(section.effectivePlinth)!==number(cabinet.plinth)).forEach((section,index)=>{
      const height=number(section.effectivePlinth), sx=x+section.x+section.width/2, sy=number(cabinet.y);
      if(height<=0)return;
      const a=camera.project([sx,sy,z+section.depth]), b=camera.project([sx,sy+height,z+section.depth]);
      output+=`<g data-local-plinth="${escape(section.id)}" data-plinth-height-mm="${round(height)}"><title>${escape(t('Высота цоколя, мм'))}: ${n(height)}</title>${svgDimension(a,b,`P${n(height)}`,compact?10:14)}</g>`;
    });
    const lanes=[[],[],[]];
    mountingAxes.forEach((axis,index)=>{
      const section=[...layout.sections,...(view==='interior'?layout.internalSections||[]:[])].find(section=>section.id===axis.id);
      if (!section) return;
      const mark=section.parentSectionId?interiorSectionMark(layout,section):`S${layout.sections.findIndex(item=>item.id===section.id)+1}`;
      const attributes=`data-section-axis="${escape(axis.id)}" data-axis-bottom-mm="${axis.bottom ?? 'missing'}" data-axis-top-mm="${axis.top ?? 'missing'}" data-axis-height-mm="${axis.height ?? 'missing'}"`;
      if (axis.height == null) {
        const p=camera.project([x+number(cabinet.width),bodyY+section.y+section.height/2,z+layout.bodyDepth]);
        output+=`<g ${attributes}><text x="${round(p[0]+(compact?24:48))}" y="${round(p[1]+3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${compact?9.2:11}" fill="#586b63">${mark} A—</text></g>`;
        return;
      }
      const lane=lanes.findIndex(intervals=>intervals.every(interval=>axis.top<=interval.bottom+.001 || axis.bottom>=interval.top-.001));
      if (lane<0) return;
      lanes[lane].push(axis);
      const a=camera.project([x+number(cabinet.width),number(cabinet.y)+axis.bottom,z+layout.bodyDepth]), b=camera.project([x+number(cabinet.width),number(cabinet.y)+axis.top,z+layout.bodyDepth]);
      output+=`<g ${attributes}>${svgDimension(a,b,`${mark} A${n(axis.height)}`,(compact?15:48)+lane*(compact?15:28))}</g>`;
    });
    output+=`<text x="${compact?10:camera.width-8}" y="${compact?camera.height-1:18}" text-anchor="${compact?'start':'end'}" font-family="Arial, sans-serif" font-size="${compact?9.2:10}" fill="#586b63">A · ${escape(t('Между осями крепления'))}, ${unit}</text>`;
  }
  if (!dimensions || compact) return output;
  for (const axis of ['width', 'height']) {
    const intervals = [...new Map(layout.sections.map(section => {
      const start = axis === 'width' ? section.x : section.y, length = section[axis];
      return [`${round(start)}:${round(length)}`, { start, end: start + length, length }];
    })).values()].sort((a, b) => a.start - b.start || a.end - b.end);
    const occupied = [[], []];
    for (const interval of intervals) {
      const lane = occupied.findIndex(items => items.every(item => interval.end <= item.start + .01 || interval.start >= item.end - .01));
      if (lane < 0) continue;
      occupied[lane].push(interval);
      const a = axis === 'width' ? [x + interval.start, number(cabinet.y), z + layout.bodyDepth] : [x, bodyY + interval.start, z + layout.bodyDepth];
      const b = axis === 'width' ? [x + interval.end, number(cabinet.y), z + layout.bodyDepth] : [x, bodyY + interval.end, z + layout.bodyDepth];
      output += svgDimension(camera.project(a), camera.project(b), n(interval.length), (axis === 'width' ? 1 : -1) * (53 + lane * 23));
    }
  }
  return output;
}

/** Standalone, vector, landscape A4 drawing with millimetre dimensions. */
export function createDrawingSvg(project, view = 'front', { cabinetId = null, dimensions = true, language = 'ru', compact = false } = {}) {
  language = printLanguage(language);
  const t = text => translatePrintText(text, language), n = value => printNumber(number(value), language), unit = language === 'ru' ? 'мм' : 'mm';
  if (!VIEWS[view] || view === '3d') view = 'front';
  const selected = (project.cabinets || []).find(c => c.id === cabinetId);
  if (cabinetId && !selected) cabinetId = null;
  // A cabinet manufacturing drawing follows its own axes regardless of its
  // position or rotation in a room. Room drawings preserve the actual placement.
  const drawingCabinet = selected ? { ...selected, x: 0, y: 0, z: 0, rotation: 0 } : null;
  const source = cabinetId ? { ...project, cabinets: [drawingCabinet] } : project;
  const axes = basis(VIEWS[view].yaw, VIEWS[view].elevation);
  const panel = typeof compact === 'object' ? compact : { width: 350, height: 335, padding: 35 };
  const compactPadding=selected&&dimensions&&['front','interior'].includes(view)?{x:panel.padding+48,y:panel.padding}:panel.padding;
  const camera = projection(extent(source, cabinetId, !cabinetId), axes, compact ? panel.width : 1000, compact ? panel.height - 50 : 640, 1, { x: 0, y: 0 }, compact ? compactPadding : dimensions ? (selected && ['front', 'interior'].includes(view) ? 100 : 80) : 50);
  camera.project.axes = axes;
  const scene = makeScene(source, { room: !cabinetId, dimensions, doorsOpen: false, ceiling: false, interior: view === 'interior' }, axes.direction);
  const items = screenItems(scene, camera.project).filter(item => !item.shadow);
  const geometry = items.map(item => {
    const points = item.screen.map(p => `${round(p[0])},${round(p[1])}`).join(' ');
    if (item.line) return `<polyline points="${points}" fill="none" stroke="${escape(item.color)}" stroke-width="${item.width}"/>`;
    return `<polygon points="${points}"${item.component ? ` data-component="${escape(item.component)}"` : ''}${item.partId ? ` data-part-id="${escape(item.partId)}"` : ''}${item.sectionId ? ` data-section-id="${escape(item.sectionId)}"` : ''}${item.interiorSectionId?` data-interior-section-id="${escape(item.interiorSectionId)}"`:''}${item.doorOpening ? ` data-door-opening="${item.doorOpening}" data-front-index="${number(item.frontIndex)+1}"` : ''}${item.wallIndex !== undefined ? ` data-wall-index="${item.wallIndex}"` : ''}${item.window ? ' data-window="true"' : ''}${item.openingKind ? ` data-opening-kind="${item.openingKind}" data-sill-mm="${number(item.openingSill)}"` : ''}${item.doorLeaf ? ' data-door-leaf="true"' : ''} fill="${escape(item.room ? colorShade(item.color, 1.025) : item.color)}" fill-opacity="${item.opacity ?? 1}" stroke="${item.stroke === 'transparent' ? 'none' : '#55594f'}" stroke-width="${item.id ? .9 : .55}"/>`;
  }).join('');
  const labels = selected ? cabinetDrawingAnnotations(source, drawingCabinet, view, camera, dimensions, language, compact)+rodDrawingAnnotations(source,drawingCabinet,view,camera,dimensions,language,compact) : (source.cabinets || []).map(c => {
    const cabinet = cabinetData(source, c);
    const p = camera.project(rotateCabinetPoint(cabinet, [cabinet.x + cabinet.width / 2, cabinet.y + cabinet.height / 2, cabinet.z + cabinet.depth]));
    return `<g><rect x="${round(p[0] - 15)}" y="${round(p[1] - 9)}" width="30" height="18" rx="3" fill="white" fill-opacity=".88"/><text x="${round(p[0])}" y="${round(p[1] + 4)}" text-anchor="middle" font-size="10" fill="#33403a">${escape((project.cabinets || []).findIndex(raw => raw.id === c.id) + 1)}</text></g>`;
  }).join('');
  const applianceLabels = view === 'interior' || !cabinetId ? (scene.labels || []).map(label => {
    const appliance = label.appliance;
    const fallbackName = ({ washer: 'Стиральная машина', dryer: 'Сушильная машина', boiler: 'Бойлер' }[appliance?.type] || 'Оборудование');
    const lines = [appliance ? `${translateBuiltInName(appliance.label,language,'appliance') || t(fallbackName)} · ${sizeText(appliance, language)} ${unit}` : t(label.text)];
    if (!compact && cabinetId && view === 'interior' && appliance?.useClearances === true) {
      const fit = engine.getApplianceFit(label.section, label.appliance), gaps = fit.clearances;
      lines.push(`${t('Ниша с зазорами:')} ${sizeText(fit.required, language)} ${unit}`, t(`Зазоры: бок/сторона ${n(gaps.side)} · сверху ${n(gaps.top)} · сзади ${n(gaps.rear)} ${unit}`));
    }
    return svgTextBlock(camera.project(label.point), lines, lines.length > 1 ? 9 : 10, 410);
  }).join('') : '';
  const dims = dimensions ? dimensionPairs(source, cabinetId, view, !cabinetId).map(dim => svgDimension(camera.project(dim.a), camera.project(dim.b), n(Number(dim.label.replace(/[\s\u00a0\u202f]/g,''))), compact ? Math.sign(dim.offset) * 22 : dim.offset)).join('') : '';
  const title = selected ? translateBuiltInName(selected.name,language,'cabinet') || t('Корпус') : translateBuiltInName(project.name || project.title,language,'project') || t('Проект корпусной мебели');
  const viewName = t(VIEWS[view].name);
  if (compact) return `<svg xmlns="http://www.w3.org/2000/svg" data-i18n="off" lang="${language}" width="${panel.width}" height="${panel.height}" viewBox="0 0 ${panel.width} ${panel.height}" role="img" aria-label="${escape(title)}: ${escape(viewName)}" data-compact-view="${view}" data-min-font="9.2"><title>${escape(title)} — ${escape(viewName)}</title><rect width="${panel.width}" height="${panel.height}" fill="white"/><g font-family="Arial, sans-serif"><text x="10" y="18" font-size="13" font-weight="600" fill="#233c34">${escape(viewName)}</text><g transform="translate(0,28)">${geometry}${labels}${applianceLabels}${dims}</g><text x="10" y="${panel.height - 7}" font-size="10" fill="#617268">${selected ? `${sizeText(selected, language)} ${unit}` : `${t('Все размеры в миллиметрах')}`}</text></g></svg>`;
  const scaleDenominator = Math.max(1, Math.round(1000 / 265 / camera.scale));
  return `<svg xmlns="http://www.w3.org/2000/svg" data-i18n="off" lang="${language}" width="297mm" height="210mm" viewBox="0 0 1120 792" role="img" aria-label="${escape(title)}: ${escape(viewName)}"><title>${escape(title)} — ${escape(viewName)}</title><rect width="1120" height="792" fill="white"/><g font-family="Arial, sans-serif"><text x="60" y="44" font-size="20" font-weight="600" fill="#233c34">${escape(title)}</text><text x="60" y="67" font-size="12" fill="#617268">${escape(viewName)} · ${escape(t('Все размеры в миллиметрах'))}${selected && view === 'front' ? ` · ${escape(t('F = размеры фасада; внешние цепочки = проёмы'))}` : ''}</text><path d="M60,83 H1060" stroke="#c3cec6"/><g transform="translate(60,90)">${geometry}${labels}${applianceLabels}${dims}</g><path d="M60,741 H1060" stroke="#c3cec6"/><text x="60" y="764" font-size="11" fill="#617268">${selected ? `${t('Корпус без фасада:')} ${sizeText(selected, language)} ${unit}` : `${t('Помещение:')} ${sizeText(roomData(project), language)} ${unit}`}</text><text x="1060" y="764" text-anchor="end" font-size="11" fill="#617268">${t('Масштаб ≈')} 1:${scaleDenominator} ${t('при печати 100%')} · A4</text></g></svg>`;
}

/** Outline of a real production panel, including the exact L-notch dimensions. */
export function createPartSvg(part, project = { materials: [] }, { language = 'ru' } = {}) {
  language = printLanguage(language);
  const t = text => translatePrintText(text, language), n = value => printNumber(number(value), language), unit = language === 'ru' ? 'мм' : 'mm';
  const width = Math.max(1, number(part.width)), height = Math.max(1, number(part.height));
  const outline = part.outline || [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const scale = Math.min(800 / width, 430 / height);
  const projectPoint = p => [500 + (p.x - width / 2) * scale, 320 + (p.y - height / 2) * scale];
  const polygon = outline.map(p => projectPoint(p).map(round).join(',')).join(' ');
  let dimensions = svgDimension(projectPoint({ x: 0, y: height }), projectPoint({ x: width, y: height }), n(width), 32) + svgDimension(projectPoint({ x: 0, y: 0 }), projectPoint({ x: 0, y: height }), n(height), 34);
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length];
    const onBoundary = Math.abs(p.x - q.x) < .001 ? Math.abs(p.x) < .001 || Math.abs(p.x - width) < .001 : Math.abs(p.y) < .001 || Math.abs(p.y - height) < .001;
    if (!onBoundary) dimensions += svgDimension(projectPoint(p), projectPoint(q), n(Math.hypot(q.x - p.x, q.y - p.y)), -25);
  });
  const stock = material(project, part.materialId), title = `${translateBuiltInName(part.cabinetName,language,'cabinet') || t('Корпус')} · ${part.name ? translatePartName(part.name,language) : t('Деталь')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" data-i18n="off" lang="${language}" width="297mm" height="210mm" viewBox="0 0 1120 792" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><rect width="1120" height="792" fill="white"/><g font-family="Arial, sans-serif"><text x="60" y="45" font-size="16" font-weight="600" fill="#233c34">${escape(title)}</text><text x="60" y="68" font-size="12" fill="#607268">${t('Деталь раскроя')} · ${escape(stock.name ? translateMaterialName(stock.name,language) : t('МДФ'))} · ${t('толщина')} ${n(part.thickness)} ${unit} · ${t('все размеры в мм')}</text><path d="M60,83 H1060" stroke="#c3cec6"/><g transform="translate(60,90)"><polygon points="${polygon}" fill="${escape(stock.color || '#e1d6c4')}" stroke="#44574b" stroke-width="1.5"/>${dimensions}</g><path d="M60,741 H1060" stroke="#c3cec6"/><text x="60" y="764" font-size="11" fill="#617268">${t('Раскрой')} ${n(width)} × ${n(height)} ${unit} · ${t('после кромки')} ${n(part.finishedWidth ?? width)} × ${n(part.finishedHeight ?? height)} ${unit}</text><text x="1060" y="764" text-anchor="end" font-size="11" fill="#617268">${escape(part.id || '')} · A4</text></g></svg>`;
}

function tableSheets(title, intro, headings, rows, limit = 14, language = 'ru') {
  let html = '';
  for (let offset = 0; offset < Math.max(1, rows.length); offset += limit) {
    html += `<section class="sheet schedule"><h1>${escape(title)}</h1><p>${escape(translatePrintText(intro,language))}</p><table><thead><tr>${headings.map(heading => `<th>${escape(translatePrintText(heading,language))}</th>`).join('')}</tr></thead><tbody>${rows.slice(offset, offset + limit).map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><small>${translatePrintText(`${offset + 1}–${Math.min(rows.length, offset + limit)} из ${rows.length}`,language)} · ${translatePrintText('все размеры в миллиметрах',language)}</small></section>`;
  }
  return html;
}

// These dimensions match the compact schedule CSS at 96 CSS pixels per inch.
// Budget the actual wrapped rows and captions, keeping the existing 7.5 pt type.
const COMPACT_SCHEDULE_GAP = 5 * 96 / 25.4;
const COMPACT_SCHEDULE_BUDGET = (210 - 18) * 96 / 25.4 - 40;
function compactScheduleHeight(block, language) {
  const tableWidth = (297 - 28) * 96 / 25.4;
  const lines = (text, width, font) => Math.max(1, Math.ceil(String(text).length * font * .62 / Math.max(1, width)));
  const columnWidth = index => tableWidth * (index === 0 ? .06 : index === 1 ? .28 : index === 2 ? .18 : .48 / Math.max(1, block.headings.length - 3));
  const rowHeight = row => 11 + 12.5 * Math.max(1, ...row.map((cell,index) => lines(cell,columnWidth(index) - 12,10)));
  return lines(block.title,tableWidth,16) * 19.2 + 7
    + lines(translatePrintText(block.intro,language),tableWidth,11) * 16.5 + 10
    + rowHeight(block.headings.map(heading => translatePrintText(heading,language)))
    + block.rows.reduce((height,row) => height + rowHeight(row),0);
}

function compactScheduleSheets(blocks, language) {
  const inner = page => page.replace(/^<section[^>]*>/,'').replace(/<\/section>$/,'').replace(/<small>[^<]*<\/small>/g,'');
  const pageFor = block => tableSheets(block.title,block.intro,block.headings,block.rows,14,language);
  let html = '', group = [], height = 0;
  const flush = () => {
    if (!group.length) return;
    html += `<section class="sheet schedule combined-schedule" data-estimated-content-height="${Math.ceil(height + 28)}" data-content-height-limit="${Math.floor((210 - 18) * 96 / 25.4)}">${group.map(block => `<article data-schedule-kind="${block.kind}">${inner(pageFor(block))}</article>`).join('')}<small>${translatePrintText('все размеры в миллиметрах',language)}</small></section>`;
    group = []; height = 0;
  };
  for (const block of blocks) {
    const blockHeight = compactScheduleHeight(block,language);
    if (block.rows.length > 14 || blockHeight > COMPACT_SCHEDULE_BUDGET) {
      flush();
      html += pageFor(block).replaceAll('class="sheet schedule"',`class="sheet schedule" data-schedule-kind="${block.kind}"`);
      continue;
    }
    if (group.length && height + COMPACT_SCHEDULE_GAP + blockHeight > COMPACT_SCHEDULE_BUDGET) flush();
    if (group.length) height += COMPACT_SCHEDULE_GAP;
    group.push(block); height += blockHeight;
  }
  flush();
  return html;
}

function hardwarePrintBlocks(project,{cabinetId=null,language='tr'}={}){
  const t=text=>translatePrintText(text,language),n=value=>printNumber(value,language);
  const selected=(project.cabinets||[]).find(cabinet=>cabinet.id===cabinetId),source=selected?{...project,cabinets:[selected]}:project,schedule=getProjectHardwareSchedule(source);
  const block=(name,totals,rows,kind='hardware')=>({kind,title:`${name} · ${t('Фурнитура')}`,intro:`${t('Один комплект направляющих — пара для одного ящика или выдвижной полки.')}${rows.some(row=>row.kind==='hinge'&&row.planned)?` ${t('Количество петель по высоте — предварительный расчёт. Нагрузку и механизм подъёмной двери проверьте по выбранной фурнитуре.')}`:''}`,headings:['№','Фурнитура','Количество','Ед.'],rows:[
    ['1',t('Ручки'),n(totals.handles),t('шт.')],['2',t('Комплекты направляющих'),n(totals.guideSets),t('Комплект (пара)')],['3',t('Петли'),n(totals.hinges),t('шт.')],
    ...(totals.rods>0?[['4',t('Штанги для одежды'),n(totals.rods),t('шт.')]]:[]),...(totals.rodHolders>0?[['5',t('Держатели штанг'),n(totals.rodHolders),t('шт.')]]:[]),
  ]});
  const listed=selected||schedule.cabinets.length<2?schedule.cabinets:schedule.cabinets.filter(cabinet=>Object.values(cabinet.totals).some(quantity=>quantity>0));
  const blocks=listed.map(cabinet=>block(translateBuiltInName(cabinet.cabinetName,language,'cabinet')||t('Корпус'),cabinet.totals,cabinet.rows));
  if(!selected&&schedule.cabinets.length>1)blocks.push(block(t('Всего по проекту'),schedule.totals,schedule.rows,'hardware-total'));
  if(!blocks.length)blocks.push(block(t('Всего по проекту'),schedule.totals,[], 'hardware-total'));
  return blocks;
}

const HARDWARE_PRINT_CSS='.hardware-schedule{padding:9mm 14mm}.hardware-schedule h1{font:600 16px Arial,sans-serif;margin:0 0 7px}.hardware-schedule p{font:11px/1.5 Arial,sans-serif;margin:0 0 10px}.hardware-schedule table{width:100%;border-collapse:collapse;table-layout:fixed}.hardware-schedule td,.hardware-schedule th{font:10px/1.25 Arial,sans-serif;text-align:left;padding:5px 6px;border-bottom:1px solid #dce4de;overflow-wrap:anywhere}.hardware-schedule td:nth-child(1),.hardware-schedule th:nth-child(1){width:6%}.hardware-schedule td:nth-child(2),.hardware-schedule th:nth-child(2){width:28%}.hardware-schedule td:nth-child(3),.hardware-schedule th:nth-child(3){width:18%}.hardware-schedule article+article{margin-top:5mm}.hardware-schedule small{font:10px Arial,sans-serif;color:#718477}';

/** Ready landscape sheets for the cutting/export document, using the exact
 * same quantity schedule as the drawings and estimate. Runner quantity is
 * measured in pairs; it is never multiplied into individual rails. */
export function generateHardwareHTML(project,{cabinetId=null,language=project.settings?.printLanguage??'tr',compact=project.settings?.compactPrint!==false}={}){
  language=printLanguage(language,'tr');
  const blocks=hardwarePrintBlocks(project,{cabinetId,language}),html=compact?compactScheduleSheets(blocks,language):blocks.map(block=>tableSheets(block.title,block.intro,block.headings,block.rows,14,language)).join('');
  return `<style>${HARDWARE_PRINT_CSS}</style>${html.replaceAll('class="sheet schedule','class="sheet schedule hardware-schedule').replaceAll(translatePrintText('все размеры в миллиметрах',language),translatePrintText('Единицы указаны в ведомости.',language))}`;
}

const COST_PRINT_CSS='.cost-sheet{padding:9mm 14mm}.cost-sheet .cost-summary h2,.cost-sheet .cost-sources h2{font:600 18px/1.2 Arial,sans-serif;margin:0 0 9px}.cost-sheet p{font:11px/1.5 Arial,sans-serif;margin:0 0 10px}.cost-sheet table{width:100%;border-collapse:collapse;table-layout:fixed}.cost-sheet .cost-summary td,.cost-sheet .cost-summary th{padding:5px 6px;text-align:left;border-bottom:1px solid #dce4de;font:10px/1.35 Arial,sans-serif;overflow-wrap:anywhere}.cost-sheet .cost-summary td:nth-child(1),.cost-sheet .cost-summary th:nth-child(1){width:45%}.cost-sheet .cost-summary td:nth-child(2),.cost-sheet .cost-summary th:nth-child(2){width:12%}.cost-sheet .cost-summary td:nth-child(3),.cost-sheet .cost-summary th:nth-child(3){width:13%}.cost-sheet .cost-summary td:nth-child(4),.cost-sheet .cost-summary th:nth-child(4),.cost-sheet .cost-summary td:nth-child(5),.cost-sheet .cost-summary th:nth-child(5){width:15%}.cost-sheet .cost-summary tfoot th{font-weight:600;background:#f0f5ef}.cost-sheet .cost-summary small{font-size:9px;display:inline;margin:0}.cost-sheet .cost-sources h3{font:600 12px Arial,sans-serif;margin:10px 0 7px}.cost-sheet .cost-sources ul{padding-left:5mm;margin:0}.cost-sheet .cost-sources li{font:10px/1.35 Arial,sans-serif;margin:0 0 6px;overflow-wrap:anywhere}.cost-sheet a{color:#167e75}.cost-sheet>.cost-page-number{font:10px Arial,sans-serif;color:#718477;display:block;margin-top:12px}';

function costPrintSheets(project,{cabinetId=null,language='tr'}={}){
  const html=renderCostSummary(project,{cabinetId,language}),body=/<tbody>([\s\S]*?)<\/tbody>/.exec(html);
  if(!body)return '';
  const rows=body[1].match(/<tr>[\s\S]*?<\/tr>/g)||[],prefix=html.slice(0,body.index)+'<tbody>';
  let tail=html.slice(body.index+body[0].length),sourcePages='',details=/<details>[\s\S]*?<\/details>/.exec(tail)?.[0];
  const text=html=>html.replace(/<[^>]*>/g,'');
  const sourceRows=details?.match(/<li>[\s\S]*?<\/li>/g)||[],sourceRowHeight=row=>Math.max(1,Math.ceil(text(row).length/150))*13.5+6,sourceHeight=sourceRows.reduce((height,row)=>height+sourceRowHeight(row),25);
  const noteHeight=[...tail.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].reduce((height,match)=>height+Math.max(1,Math.ceil(text(match[1]).length*6.82/1016))*16.5+10,0);
  const titleLength=text(/<h2>([\s\S]*?)<\/h2>/.exec(prefix)?.[1]||'').length,headerHeight=120+Math.max(0,Math.ceil(titleLength*18*.62/1016)-1)*22;
  if(details){
    // Keep the references beside a short estimate whenever a readable final
    // row, total and notes still fit. Source count alone is not a page break.
    if(sourceHeight+noteHeight+headerHeight+50>690){
      tail=tail.replace(details,'');
      let list=[],height=0;
      const flush=()=>{if(!list.length)return;sourcePages+=`<section class="sheet schedule cost-sheet" data-schedule-kind="price-sources" data-estimated-content-height="${Math.ceil(height+60)}" data-content-height-limit="725"><article class="cost-sources"><h2>${escape(translatePrintText('Источники цен',language))}</h2><ul>${list.join('')}</ul></article></section>`;list=[];height=0;};
      for(const row of sourceRows){const next=sourceRowHeight(row);if(list.length&&height+next>640)flush();list.push(row);height+=next;}flush();
    }else tail=tail.replace(details,details.replace('<details>','<div class="cost-sources">').replace('</details>','</div>').replace('<summary>','<h3>').replace('</summary>','</h3>'));
  }
  const widths=[.45,.12,.13,.15,.15],rowHeight=row=>10+13.5*Math.max(1,...[...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell,index)=>Math.ceil(text(cell[1]).length*6.2/(1016*widths[index]-12))));
  const footerHeight=noteHeight+(tail.includes('cost-sources')?sourceHeight:0),lastBudget=Math.max(40,690-headerHeight-footerHeight),chunks=[];
  let chunk=[],height=0;
  for(const row of rows){const next=rowHeight(row);if(chunk.length&&height+next>710-headerHeight){chunks.push(chunk);chunk=[];height=0;}chunk.push(row);height+=next;}
  chunks.push(chunk);
  const last=chunks[chunks.length-1],lastHeight=()=>last.reduce((height,row)=>height+rowHeight(row),0),overflow=[];
  while(last.length>1&&lastHeight()>lastBudget)overflow.push(last.shift());
  if(overflow.length)chunks.splice(chunks.length-1,0,overflow);
  return chunks.map((rows,index)=>{
    const final=index===chunks.length-1,content=prefix+rows.join('')+'</tbody>'+(final?tail:'</table></section>'),estimated=headerHeight+rows.reduce((height,row)=>height+rowHeight(row),0)+(final?footerHeight:0);
    return `<section class="sheet schedule cost-sheet" data-schedule-kind="cost" data-cost-row-count="${rows.length}" data-estimated-content-height="${Math.ceil(estimated)}" data-content-height-limit="725">${content}${chunks.length>1?`<small class="cost-page-number">${index+1} / ${chunks.length}</small>`:''}</section>`;
  }).join('')+sourcePages;
}

/** Reusable cost sheets for both drawings and the cutting export. Long tables
 * retain their rows, and the total appears only on the final estimate sheet. */
export function generateCostPrintHTML(project,{cabinetId=null,language=project.settings?.printLanguage??'tr'}={}){
  language=printLanguage(language,'tr');
  return `<style>${COST_PRINT_CSS}</style>${costPrintSheets(project,{cabinetId,language})}`;
}

/** Five projections, opening/facade measurements and actual cutting components. */
function buildDrawingHTML(project, { cabinetId = null, language = project.settings?.printLanguage ?? 'tr', compact = project.settings?.compactPrint !== false } = {}) {
  language = printLanguage(language,'tr');
  const t = text => translatePrintText(text, language), n = value => printNumber(number(value), language), unit = language === 'ru' ? 'мм' : 'mm';
  const schedule = (title,intro,headings,rows,limit=14) => tableSheets(title,intro,headings,rows,limit,language);
  const selected = (project.cabinets || []).find(c => c.id === cabinetId);
  if (cabinetId && !selected) cabinetId = null;
  const source = selected ? { ...project, cabinets: [selected] } : project;
  const title = translateBuiltInName(selected?.name,language,'cabinet') || translateBuiltInName(project.name || project.title,language,'project') || t('Проект корпусной мебели');
  const views = ['front', 'back', 'left', 'right', 'top', ...(selected ? ['interior'] : [])];
  let sheets = '';
  if (compact) {
    const geometry = selected ? modelLayout(selected,project) : null, fronts = selected ? getFrontLayout(selected,project) : [];
    const scale = selected ? Math.min(184 / (selected.width + 18),215 / selected.height) : 0;
    const readable = (width,height,label) => height * scale >= 22 && width * scale >= label.length * 9.2 * .54 + 2;
    const six = selected && geometry.sections.length <= 6 && fronts.length <= 8 && !geometry.internalSections?.length && !selected.rearBraces?.length && !engine.getInternalDrawerLayout(selected,project).length && !geometry.sections.some(s=>s.node.appliance||s.node.rearBraces?.length||(s.floorEligible&&s.node.plinthHeight!=null&&number(s.effectivePlinth)!==number(selected.plinth))) && geometry.sections.every((s,i)=>readable(s.width,s.height,`S${i+1} ${n(s.width)}×${n(s.height)}`)) && fronts.every((f,i)=>readable(f.width,f.height,`F${i+1} ${n(f.width)}×${n(f.height)}`));
    const count = six ? 6 : 2, columns = six ? 3 : 2, panel = six ? { width:350,height:335,padding:35 } : { width:530,height:676,padding:55 };
    for (let offset=0;offset<views.length;offset+=count) sheets += `<section class="sheet projection-sheet" data-projections="${Math.min(count,views.length-offset)}"><header><h1>${escape(title)} · ${t('Ортогональные виды')}</h1><p>${t('Все размеры в миллиметрах')} · ${t('Размеры проёмов, фасадов и деталей — в ведомостях')}</p></header><div class="projection-grid" style="grid-template-columns:repeat(${columns},1fr);grid-template-rows:repeat(${six?2:1},1fr)">${views.slice(offset,offset+count).map(view=>`<div class="projection-panel">${createDrawingSvg(project,view,{cabinetId,dimensions:true,language,compact:panel})}</div>`).join('')}</div></section>`;
  } else sheets = views.map(view => `<section class="sheet">${createDrawingSvg(project, view, { cabinetId, dimensions: true, language })}</section>`).join('');
  if (selected) {
    const layout = modelLayout(selected, project);
    const mountingById=new Map(engine.getSectionMountingAxes(selected,project).map(axis=>[axis.id,axis]));
    const localBases=layout.sections.some(section=>section.floorEligible&&section.node.plinthHeight!=null);
    const openings = layout.sections.map((section, index) => [`S${index + 1}`, translateBuiltInName(section.node.name,language,'section') || t('Секция'), `${n(section.width)} × ${n(section.height)}`, mountingById.get(section.id)?.height == null ? '—' : n(mountingById.get(section.id).height), n(section.usableDepth ?? section.depth), t(section.node.front === 'doors' ? 'Двери' : section.node.front === 'drawers' ? 'Ящики' : 'Открытая'), section.node.appliance ? `${translateBuiltInName(section.node.appliance.label,language,'appliance') || t('Оборудование')} ${sizeText(section.node.appliance,language)}` : '—', ...(localBases?[section.floorEligible?n(section.effectivePlinth):'—',n(number(selected.plinth)+section.y)]:[])]);
    const openingIntro=`${t('Чистый геометрический проём между панелями. Полезная глубина учитывает задний вырез; монтажные зазоры оборудования задаются отдельно.')} ${t('Оси винтов проходят по центру толщины горизонтальных плит. Это расстояние между осями, а не высота проёма.')} ${t('Нет нижней плиты — нет нижней оси крепления.')}`;
    const openingBlock = {kind:'openings',title:`${title} · ${t('внутренние секции')}`,intro:openingIntro,headings:['Секция', 'Название', 'Проём: Ш × В, мм', 'Между осями крепления, мм', 'Полезная глубина, мм', 'Содержимое', 'Оборудование: Ш × В × Г, мм',...(localBases?['Высота цоколя, мм','Низ проёма от основания, мм']:[])],rows:openings};
    const fronts = getFrontLayout(selected, project).map((front, index) => [`F${index + 1}`, t(front.kind === 'door' ? 'Дверь' : 'Фасад ящика'), `S${Math.max(0, layout.sections.findIndex(section => front.sectionId ? section.id === front.sectionId : section.node.front === (front.kind === 'door' ? 'doors' : 'drawers'))) + 1}`, n(front.width), n(front.height), n(cabinetData(project, selected).frontThickness), front.kind==='door'?t(doorOpeningText(doorOpening(front))):'—',t(front.openingMechanism==='push'?'Нажимной push-to-open':'Ручка')]);
    const frontBlock = {kind:'fronts',title:`${title} · ${t('фасады')}`,intro:'Обозначения F соответствуют фронтальному чертежу. Размеры фасадов учитывают заданный зазор и накладку.',headings:['Фасад', 'Тип', 'Секция', 'Ширина, мм', 'Высота, мм', 'Толщина, мм','Направление открытия','Механизм открытия'],rows:fronts};
    const blocks=[openingBlock,frontBlock];
    if(layout.internalSections?.length)blocks.push({kind:'interior-openings',title:`${title} · ${t(layout.internalSections.every(section=>layout.sections.find(outer=>outer.id===section.parentSectionId)?.node.front==='doors')?'Наполнение за общими дверями':'Внутреннее наполнение')}`,intro:'Внутренние проёмы обозначены номером наружной секции и отсека: S1.1, S1.2. Наружные фасады обозначены F, внутренние фасады ящиков — I.',headings:['Секция','Название','Проём: Ш × В, мм','Между осями крепления, мм','Полезная глубина, мм','Содержимое'],rows:layout.internalSections.map(section=>[interiorSectionMark(layout,section),translateBuiltInName(section.node.name,language,'section')||t('Секция'),`${n(section.width)} × ${n(section.height)}`,mountingById.get(section.id)?.height==null?'—':n(mountingById.get(section.id).height),n(section.usableDepth??section.depth),t(section.node.front==='drawers'?'Ящики':'Открытая')])});
    const internal=engine.getInternalDrawerLayout(selected,project);
    if(internal.length)blocks.push({kind:'internal-fronts',title:`${title} · ${t('внутренние ящики')}`,intro:internal.every(drawer=>layout.sections.find(section=>section.id===drawer.sectionId)?.node.front==='doors')?'Внутренние фасады и короба находятся за дверями. I соответствует внутреннему чертежу; F обозначает только наружные фасады.':'I обозначает внутренние фасады ящиков; F — наружные фасады. Размеры коробов приведены в деталировке.',headings:['Фасад','Секция','Ширина, мм','Высота, мм','Толщина, мм','Механизм открытия'],rows:internal.map((drawer,index)=>[`I${index+1}`,drawer.interiorSectionId?interiorSectionMark(layout,layout.internalSections.find(section=>section.id===drawer.interiorSectionId)):`S${Math.max(0,layout.sections.findIndex(section=>section.id===drawer.sectionId))+1}`,n(drawer.width),n(drawer.height),n(drawer.frontThickness),t(drawer.openingMechanism==='push'?'Нажимной push-to-open':'Ручка')])});
    blocks.push(...hardwarePrintBlocks(project,{cabinetId,language}));
    sheets += compact ? compactScheduleSheets(blocks,language) : blocks.map(block=>schedule(block.title,block.intro,block.headings,block.rows)).join('');
  } else {
    const cabinets = (project.cabinets || []).map((c, index) => [index + 1, translateBuiltInName(c.name,language,'cabinet') || t('Корпус'), n(c.width), n(c.height), n(c.depth), translateMaterialName(material(project, c.materialId).name,language) || t('МДФ')]);
    sheets += schedule(title, 'Ведомость корпусов. Глубина корпуса указана без накладного фасада.', ['№', 'Корпус', 'Ширина, мм', 'Высота, мм', 'Глубина, мм', 'Материал'], cabinets);
    sheets += generateHardwareHTML(project,{language,compact});
  }
  const appliances = (source.cabinets || []).flatMap(cabinet => modelLayout(cabinet, source).sections.flatMap((section, index) => {
    const appliance = section.node.appliance;
    if (!appliance) return [];
    const fit = engine.getApplianceFit(section, appliance);
    const gap = axis => appliance.useClearances === true ? n(fit.clearances[axis]) : '—';
    return [[selected ? `S${index + 1}` : `${translateBuiltInName(cabinet.name,language,'cabinet') || t('Корпус')} · S${index + 1}`, `${translateBuiltInName(appliance.label,language,'appliance') || t('Оборудование')} · ${sizeText(appliance,language)}`, sizeText(fit.required,language), gap('side'), gap('top'), gap('rear'), t(fit.fits ? 'Помещается' : 'Не помещается')]];
  }));
  if (appliances.length) sheets += schedule(`${title} · ${t('техника и монтажные зазоры')}`, 'Требуемая ниша: ширина техники + два боковых зазора; высота + зазор сверху; глубина + зазор сзади. Проверка использует чистый проём и его полезную глубину. «—» означает, что монтажные зазоры отключены. Все размеры и зазоры задаются для выбранной техники.', ['Секция', 'Оборудование: Ш × В × Г, мм', 'Требуемая ниша: Ш × В × Г, мм', 'Боковой / сторона, мм', 'Сверху, мм', 'Сзади, мм', 'Проверка'], appliances, 12);
  const parts = engine.generateParts(source);
  const rods=(source.cabinets||[]).flatMap(cabinet=>(engine.getRodLayout?.(cabinet,source)||[]).map((rod,index)=>{
    const layout=modelLayout(cabinet,source),section=rod.interiorSectionId?interiorSectionMark(layout,layout.internalSections.find(s=>s.id===rod.interiorSectionId)):`S${layout.sections.findIndex(s=>s.id===rod.sectionId)+1}`;
    return [selected?`R${index+1}`:`${translateBuiltInName(cabinet.name,language,'cabinet')||t('Корпус')} · R${index+1}`,section,n(rod.length),n(rod.diameter),n(number(cabinet.plinth)+rod.y),n(rod.frontInset),n(rod.holders)];
  }));
  if(rods.length)sheets+=schedule(`${title} · ${t('Штанги для одежды')}`,'Штанги считаются отдельно от листовых материалов.',['Штанга','Секция','Длина реза, мм','Диаметр, мм','Высота установки, мм','Отступ от фасада, мм','Держатели штанги, шт.'],rods);
  const braces = parts.filter(part => part.braceId || part.role === 'brace' || part.component === 'brace');
  if (selected && braces.length) {
    const layout=modelLayout(selected,project), localBraces=braces.some(part=>part.sectionId);
    const braceRows = braces.map((part, index) => [`C${index + 1}`, translatePartName(part.name,language), `${n(part.width)} × ${n(part.height)} × ${n(part.thickness)}`, n(number(selected.plinth) + number(part.position.y)), translateMaterialName(material(project, part.materialId).name,language) || t('МДФ'),...(localBraces?[part.sectionId?`S${layout.sections.findIndex(section=>section.id===part.sectionId)+1}`:'—',!part.sectionId||part.braceBaseY==null?'—':n(number(part.position.y)-number(part.braceBaseY))]:[])]);
    const intro='Высота монтажа измеряется от общего основания шкафа, включая цоколь. Обозначения C соответствуют виду сзади.';
    sheets += schedule(`${title} · ${t('задние поперечины')}`, `${t(intro)}${localBraces?` ${t('Высота местной поперечины измеряется от нижнего чистого уровня её секции.')}`:''}`, ['Поперечина', 'Название', 'Ш × В × Толщина, мм', 'Низ от основания, мм', 'Материал',...(localBraces?['Секция','Низ от основания секции, мм']:[])], braceRows);
  }
  const cutRows = parts.map((part, index) => [index + 1, translatePartName(part.name,language), `${n(part.width)} × ${n(part.height)}`, n(part.thickness), translateMaterialName(material(project, part.materialId).name,language) || t('МДФ'), Object.entries(part.edges || {}).filter(([, edge]) => number(edge) > 0).map(([side, edge]) => `${t({ top: 'верх', bottom: 'низ', left: 'лево', right: 'право' }[side] || side)} ${n(edge)}`).join('; ') || '—',n(engine.getPartEdgeBanding(part).lengthMeters)]);
  const partTitle = `${title} · ${t('детали и короба ящиков')}`, partIntro = 'Точные размеры каждой детали раскроя из инженерной модели. Короба ящиков перечислены отдельно от фасадов. Для L-деталей далее приведён контур.', partHeadings = ['№', 'Деталь / секция', 'Раскрой: Ш × В, мм', 'Толщина, мм', 'Материал', 'Кромка, мм','Расход кромки, м'];
  const edgeSummary=engine.getEdgeBandingSummary(parts), edgeRows=edgeSummary.groups.map(group=>[translateMaterialName(material(project,group.materialId).name,language)||t('МДФ'),n(group.thickness),n(group.partCount),n(group.lengthMeters)]);
  const edgePage=schedule(`${t('Всего кромки')}: ${n(edgeSummary.lengthMeters)} ${t('м')}`,'Расход кромки рассчитан по готовым размерам и выбранным сторонам каждой детали.',['Материал','Кромка, мм','Деталей с кромкой','Расход кромки, м'],edgeRows);
  let edgeAttached=false;
  if (compact) {
    // Rows are budgeted by their wrapped text, rather than a blind fixed count.
    // A normal 24-part wardrobe fits one sheet at 7.5 pt; long custom names
    // consume more vertical space and cause an earlier page break.
    const capacities = [4,60,24,10,52,16,9];
    let offset=0;
    while(offset<cutRows.length){
      let count=0,height=0;
      while(offset+count<cutRows.length && count<24){
        const lines=Math.max(1,...cutRows[offset+count].map((cell,i)=>Math.ceil(String(cell).length/capacities[i]))), rowHeight=7+11*lines;
        if(count&&height+rowHeight>590)break;
        height+=rowHeight;count++;
      }
      let page=schedule(partTitle,partIntro,partHeadings,cutRows.slice(offset,offset+count),24).replace('class="sheet schedule"','class="sheet schedule parts-schedule"');
      page=page.replace(/<small>[^<]*<\/small>/,`<small>${t(`${offset+1}–${offset+count} из ${cutRows.length}`)} · ${t('все размеры в миллиметрах')}</small>`);
      if(offset+count===cutRows.length && edgeRows.length<=4 && height+55+edgeRows.length*20<=620){
        const inner=edgePage.replace(/^<section[^>]*>/,'').replace(/<\/section>$/,'').replace(/<small>[^<]*<\/small>/g,'');
        page=page.replace(/<small>/,`<article class="edge-summary">${inner}</article><small>`);edgeAttached=true;
      }
      sheets+=page;offset+=count;
    }
  } else sheets += schedule(partTitle,partIntro,partHeadings,cutRows,12);
  if(!edgeAttached)sheets+=edgePage;
  if (selected) for (const part of parts.filter(part => part.outline)) sheets += `<section class="sheet">${createPartSvg(part, project, {language})}</section>`;
  sheets += costPrintSheets(project,{cabinetId,language});
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escape(title)} — чертежи</title><style>@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;background:#e8ece7;font:14px Arial,sans-serif;color:#263e35}.toolbar{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;background:#fff;position:sticky;top:0;box-shadow:0 1px 8px #0001}.toolbar button{background:#167e75;color:#fff;border:0;border-radius:6px;padding:10px 18px;cursor:pointer;font:inherit}.sheet{width:297mm;height:210mm;margin:16px auto;background:#fff;break-after:page;page-break-after:always}.sheet svg{display:block;width:100%;height:100%}.schedule{padding:12mm 16mm}.schedule h1{font-size:20px;line-height:1.2;margin:0 0 10px}.schedule p{color:#607468;font-size:11px;line-height:1.5;margin:0 0 18px}.schedule table{width:100%;border-collapse:collapse;table-layout:fixed}.schedule th{text-align:left;color:#496156;font-size:10px}.schedule td,.schedule th{padding:8px 6px;border-bottom:1px solid #dce4de;font-size:10px;line-height:1.35;overflow-wrap:anywhere;vertical-align:top}.schedule th:nth-child(1),.schedule td:nth-child(1){width:6%}.schedule th:nth-child(2),.schedule td:nth-child(2){width:28%}.schedule th:nth-child(3),.schedule td:nth-child(3){width:18%}.schedule small{display:block;margin-top:16px;font-size:10px;color:#718477}.sheet:last-child{break-after:auto;page-break-after:auto}@media print{body{background:#fff}.toolbar{display:none}.sheet{margin:0;box-shadow:none}}@media screen and (max-width:1150px){.sheet{width:94vw;height:auto;aspect-ratio:297/210}.schedule{height:auto;min-height:70vw}}</style></head><body><div class="toolbar"><span>${escape(title)} · чертежи, фасады и детали · мм</span><button onclick="window.print()">Печать / сохранить PDF</button></div>${sheets}</body></html>`;
}

/** Production print defaults to Turkish; screen SVG callers select their own
 * language. Compact SVG text is drawn at the panel's actual size, not reduced
 * from a complete A4 sheet, so the smallest grid label prints above 6.5 pt. */
export function generateDrawingHTML(project, options = {}) {
  const language = printLanguage(options.language ?? project.settings?.printLanguage ?? 'tr','tr');
  const t = text => translatePrintText(text,language);
  const edgeCSS='.sheet.parts-schedule td,.sheet.parts-schedule th{font-size:9px;padding:3.5px 6px}.sheet.parts-schedule th:nth-child(2),.sheet.parts-schedule td:nth-child(2){width:31%}.sheet.parts-schedule th:nth-child(5),.sheet.parts-schedule td:nth-child(5){width:27%}.sheet.parts-schedule th:nth-child(6),.sheet.parts-schedule td:nth-child(6){width:8%}.sheet.parts-schedule th:nth-child(7),.sheet.parts-schedule td:nth-child(7){width:7%}.edge-summary{margin-top:3mm}.edge-summary h1{font-size:12px;margin:0 0 4px}.edge-summary p{font-size:9px;margin:0 0 4px}.sheet.parts-schedule .edge-summary th:nth-child(1),.sheet.parts-schedule .edge-summary td:nth-child(1){width:50%}.sheet.parts-schedule .edge-summary th:nth-child(2),.sheet.parts-schedule .edge-summary td:nth-child(2){width:15%}.sheet.parts-schedule .edge-summary th:nth-child(3),.sheet.parts-schedule .edge-summary td:nth-child(3){width:15%}.sheet.parts-schedule .edge-summary th:nth-child(4),.sheet.parts-schedule .edge-summary td:nth-child(4){width:20%}';
  const gridCSS = '.sheet.combined-schedule{padding:9mm 14mm}.sheet.combined-schedule article+article{margin-top:5mm}.sheet.combined-schedule h1{font-size:16px;margin:0 0 7px}.sheet.combined-schedule p{margin-bottom:10px}.sheet.combined-schedule td,.sheet.combined-schedule th{padding:5px 6px;font-size:10px;line-height:1.25}.sheet.parts-schedule{padding:8mm 12mm}.sheet.parts-schedule td,.sheet.parts-schedule th{padding:4px 6px;font-size:10px;line-height:1.2}.sheet.parts-schedule th:nth-child(1),.sheet.parts-schedule td:nth-child(1){width:6%}.sheet.parts-schedule th:nth-child(2),.sheet.parts-schedule td:nth-child(2){width:34%}.sheet.parts-schedule th:nth-child(3),.sheet.parts-schedule td:nth-child(3){width:15%}.sheet.parts-schedule th:nth-child(4),.sheet.parts-schedule td:nth-child(4){width:6%}.sheet.parts-schedule th:nth-child(5),.sheet.parts-schedule td:nth-child(5){width:30%}.sheet.parts-schedule th:nth-child(6),.sheet.parts-schedule td:nth-child(6){width:9%}.sheet.projection-sheet{padding:8mm}.projection-sheet header{height:16mm}.projection-sheet h1{margin:0 0 2mm;font-size:4mm;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.projection-sheet p{margin:0;font-size:2.5mm;color:#617268;line-height:1.3}.projection-grid{display:grid;gap:4mm;height:176mm}.projection-panel{min-width:0;min-height:0;border:1px solid #dce4de;overflow:hidden}.projection-panel svg{display:block;width:100%;height:100%}@media screen and (max-width:1150px){.projection-sheet header{height:auto;margin-bottom:3mm}.projection-grid{height:58vw;min-height:350px}}@media print{.projection-sheet header{height:16mm}.projection-grid{height:176mm;min-height:0}}';
  return buildDrawingHTML(project,{...options,language})
    .replace('<html lang="ru">',`<html lang="${language}">`)
    .replace(' — чертежи</title>',` — ${t('чертежи')}</title>`)
    .replace(' · чертежи, фасады и детали · мм</span>',` · ${t('чертежи, фасады и детали')} · ${language==='ru'?'мм':'mm'}</span>`)
    .replace('>Печать / сохранить PDF</button>',`>${t('Печать / сохранить PDF')}</button>`)
    .replace('<style>',`<style>${gridCSS}${edgeCSS}`)
    .replace('</style>',`${HARDWARE_PRINT_CSS}${COST_PRINT_CSS}</style>`);
}

/** One landscape A4 sheet of the selected cabinet's captured current 3D view.
 * The image is a self-contained Canvas PNG/JPEG/WebP, never an external URL. */
export function generateCabinet3DHTML(project, {cabinetId,imageDataUrl,language=project.settings?.printLanguage ?? 'tr',doorsOpen=false,internalDrawersOpen=false,camera=null} = {}) {
  language=printLanguage(language,'tr');
  const t=text=>translatePrintText(text,language), unit=language==='ru'?'мм':'mm';
  const cabinet=(project.cabinets || []).find(item=>item.id===cabinetId);
  if (!cabinet) throw new Error(t('Выберите шкаф для печати 3D-вида.'));
  if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(String(imageDataUrl ?? ''))) throw new Error(t('Не удалось создать изображение для печати.'));
  const name=translateBuiltInName(cabinet.name,language,'cabinet') || t('Корпус'), title=`${name} · ${t('3D-вид шкафа')}`;
  const state=t(doorsOpen?'Фасады открыты':'Фасады закрыты')+(engine.getInternalDrawerLayout(cabinet,project).length?` · ${t(doorsOpen&&internalDrawersOpen?'Внутренние ящики выдвинуты':'Внутренние ящики закрыты')}`:'');
  const cameraAttributes=camera ? ` data-camera-yaw="${number(camera.yaw)}" data-camera-elevation="${number(camera.elevation)}" data-camera-zoom="${number(camera.zoom,1)}"` : '';
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${escape(title)}</title><style>@page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0}body{background:#e8ece7;color:#263e35;font:12px Arial,sans-serif}.sheet{width:297mm;height:210mm;padding:10mm 12mm;margin:16px auto;background:white;display:flex;flex-direction:column;gap:4mm;overflow:hidden}.sheet header{flex:none}.sheet h1{font-size:18px;line-height:1.25;margin:0 0 2mm;overflow-wrap:anywhere}.sheet p{font-size:11px;color:#607468;margin:0;line-height:1.35}.sheet figure{margin:0;flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.sheet img{display:block;width:100%;height:100%;object-fit:contain}.sheet footer{flex:none;display:flex;justify-content:space-between;gap:5mm;border-top:1px solid #dce4de;padding-top:3mm;font-size:10px;color:#607468;line-height:1.35}@media print{body{background:white}.sheet{margin:0;break-after:auto;page-break-after:auto}}@media screen and (max-width:1150px){.sheet{width:94vw;height:66.46vw;padding:3vw;gap:1vw}.sheet h1{font-size:16px}}</style></head><body><section class="sheet cabinet-3d-sheet" data-cabinet-id="${escape(cabinet.id)}" data-doors-open="${Boolean(doorsOpen)}"${cameraAttributes}><header><h1>${escape(title)}</h1><p>${escape(t('Текущий ракурс'))} · ${escape(state)}</p></header><figure><img src="${escape(imageDataUrl)}" alt="${escape(title)}"/></figure><footer><span>${escape(t('Корпус без фасада:'))} ${escape(sizeText(cabinet,language))} ${unit}</span><span>${escape(t('Все размеры в миллиметрах'))} · A4</span></footer></section></body></html>`;
}

/** Self-contained landscape sheet of the whole room's captured current view. */
export function generateRoom3DHTML(project,{imageDataUrl,language=project.settings?.printLanguage??'tr',doorsOpen=false,internalDrawersOpen=false,camera=null}={}){
  language=printLanguage(language,'tr');
  const t=text=>translatePrintText(text,language),unit=language==='ru'?'мм':'mm';
  if(!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(String(imageDataUrl??'')))throw new Error(t('Не удалось создать изображение для печати.'));
  const name=translateBuiltInName(project.name||project.title,language,'project')||t('Проект корпусной мебели'),title=`${name} · ${t('3D-вид помещения')}`,outline=projectRoomOutline(project),room={...roomData(project),width:Math.max(...outline.map(p=>p.x))-Math.min(...outline.map(p=>p.x)),depth:Math.max(...outline.map(p=>p.z))-Math.min(...outline.map(p=>p.z))};
  const state=t(doorsOpen?'Фасады открыты':'Фасады закрыты')+((project.cabinets||[]).some(c=>engine.getInternalDrawerLayout(c,project).length)?` · ${t(doorsOpen&&internalDrawersOpen?'Внутренние ящики выдвинуты':'Внутренние ящики закрыты')}`:'');
  // The first sheet keeps a large useful image even for a room with hundreds
  // of cabinets. A compact inventory is explicitly a preview of eight names.
  const shownCabinets=(project.cabinets||[]).slice(0,8),remaining=Math.max(0,(project.cabinets||[]).length-shownCabinets.length);
  const cabinets=shownCabinets.map((cabinet,index)=>`<li><span>${index+1} · ${escape(translateBuiltInName(cabinet.name,language,'cabinet')||t('Корпус'))}</span><small>${escape(sizeText(cabinet,language))} ${unit}</small></li>`).join('')+(remaining?`<li class="remaining-cabinets" data-remaining-cabinets="${remaining}">${escape(t('Ещё шкафов:'))} ${printNumber(remaining,language)}</li>`:'');
  const cameraAttributes=camera?` data-camera-yaw="${number(camera.yaw)}" data-camera-elevation="${number(camera.elevation)}" data-camera-zoom="${number(camera.zoom,1)}"`:'';
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${escape(title)}</title><style>@page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0}body{background:#e8ece7;color:#263e35;font:12px Arial,sans-serif}.sheet{width:297mm;height:210mm;padding:9mm 12mm;margin:16px auto;background:white;display:flex;flex-direction:column;gap:3mm;overflow:hidden}.sheet header{flex:none}.sheet h1{font-size:18px;line-height:1.25;margin:0 0 2mm;overflow-wrap:anywhere}.sheet p{font-size:11px;color:#607468;margin:0;line-height:1.35}.sheet figure{margin:0;flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.sheet img{display:block;width:100%;height:100%;object-fit:contain}.room-cabinet-list{flex:none;list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2mm 4mm;padding:0;margin:0;font-size:9px;line-height:1.25}.room-cabinet-list li{min-width:0}.room-cabinet-list span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.room-cabinet-list small{font:9px Arial,sans-serif;color:#607468}.sheet footer{flex:none;display:flex;justify-content:space-between;gap:5mm;border-top:1px solid #dce4de;padding-top:3mm;font-size:10px;color:#607468;line-height:1.35}@media print{body{background:white}.sheet{margin:0;break-after:auto;page-break-after:auto}}@media screen and (max-width:1150px){.sheet{width:94vw;height:66.46vw;padding:3vw;gap:1vw}.sheet h1{font-size:16px}}</style></head><body><section class="sheet room-3d-sheet" data-cabinet-count="${(project.cabinets||[]).length}" data-doors-open="${Boolean(doorsOpen)}" data-internal-drawers-open="${Boolean(doorsOpen&&internalDrawersOpen)}"${cameraAttributes}><header><h1>${escape(title)}</h1><p>${escape(t('Текущий ракурс'))} · ${escape(state)}</p></header><figure><img src="${escape(imageDataUrl)}" alt="${escape(title)}"/></figure>${cabinets?`<ul class="room-cabinet-list" aria-label="${escape(t('Ведомость корпусов'))}">${cabinets}</ul>`:''}<footer><span>${escape(t('Помещение:'))} ${escape(sizeText(room,language))} ${unit}</span><span>${escape(t('Все размеры в миллиметрах'))} · A4</span></footer></section></body></html>`;
}
