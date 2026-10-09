/**
 * Millimetre cabinet construction and cutting engine. All geometry is derived
 * from the project; it never mutates the user's model.
 */

import { getRoomOutline, polygonIsSimple, pointInPolygon, polygonContained, polygonBoundaryDistance, polygonsOverlap, polygonArea, roomBounds, wallLength, cabinetFootprint, getCabinetFootprint as localFootprint } from './room-geometry.js';
import { validateLayoutSchema, validateDoorOpenings } from './project-io.js';
import { MATERIAL_PRESETS, THIN_BACK_PRESET } from './standards.js';
import { defaultName, localizeMaterialPreset } from './i18n.js';
import { getInteriorLayout } from './cabinet-interior.js';
import { buildRodLayout, getRodLimits, rodIntersectsPart, rodIntersectsBox, rodsIntersect } from './cabinet-rods.js';
import { isDefaultBackMaterial } from './material-defaults.js';

export const ENGINE_ASSUMPTIONS = [
  'Все размеры в миллиметрах. Общая высота включает цоколь; открытая нижняя секция может продолжаться до низа шкафа с удалением своего дна и участка цоколя.',
  'Боковины полноразмерные; крышка, дно и полки находятся между боковинами. Глубина корпуса включает накладную заднюю стенку; накладной фасад добавляется к этой глубине.',
  'Полки имеют боковой зазор 2 мм с каждой стороны и отступ спереди 20 мм.',
  'Фасады накладные. Каждая секция имеет собственное наполнение и размеры; перегородки вычитаются из проёмов, а габариты секций задаются пропорциями или перетаскиванием.',
  'В старых файлах без дерева секций сохранена прежняя геометрия фасадов до явного редактирования схемы.',
  'Короба ящиков: зазор направляющих указан на одну сторону, глубина меньше полезной глубины своей секции на 40 мм; передняя и задняя стенки между боковинами; дно накладное.',
  'Внутренние ящики за дверями имеют отдельный отступ для петель (исходно 20 мм с каждой стороны) и свободные 50 мм сверху. Ручка модели выступает на 16 мм: внутренний фасад и короб отодвинуты на этот размер, а push-to-open не требует такого отступа. Настройки нужно сверить с выбранной фурнитурой.',
  'Высота короба ящика на 40 мм меньше фасада, включая толщину дна. Цокольная планка на 10 мм ниже цоколя; регулируемые опоры и фурнитура не входят в раскрой.',
  'Нижние секции могут иметь отдельную высоту цоколя; открытый проём до пола удаляет своё дно и цоколь. Полный задник имеет приоритет над локальными задниками и перемычками. Локальные перемычки задаются от чистого низа своей секции, старые общие — от низа всего шкафа.',
  'Внутренние отсеки за общими дверями имеют собственные перегородки, полки и ящики. Выдвижная полка — отдельная панель с боковыми зазорами направляющих; крепления и прочность не рассчитываются.',
  'Гардеробные штанги — отдельная фурнитура. Высота оси задаётся от чистого низа проёма, отступ — от передней плоскости секции; автоматическая длина оставляет по 2 мм на торцах. Диаметр, держатели, нагрузка и крепление проверяются по выбранному изделию.',
  'Направление текстуры идёт вдоль высоты детали; детали с текстурой не поворачиваются. Раскрой эвристический, использует ограничивающие прямоугольники фигурных деталей и не гарантирует минимальное число листов.',
  'Метраж кромки считается по выбранным внешним сторонам готовой детали. У фигурных деталей внутренние ступени выреза автоматически не оклеиваются.',
  'Типовые параметры производства в Турции — настраиваемые. Соответствие конкретным TS/EN, классу эмиссии и требованиям фурнитуры подтверждается поставщиком и технологом.'
];

const EPSILON = 0.001;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
// Invalid imported counts must not turn into an unbounded generation loop.
const integer = (value, fallback = 0) => Math.min(40, Math.max(0, Math.floor(number(value, fallback))));
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;
const round = value => Math.round(value * 1000) / 1000;
const doorOpening = (owner, index) => ['left', 'right', 'up'].includes(owner.doorOpenings?.[index]) ? owner.doorOpenings[index] : index % 2 === 1 ? 'right' : 'left';
const openingMechanism = owner => owner?.openingMechanism === 'push' ? 'push' : 'handle';
const stockById = (project, id) => (project.materials ?? []).find(material => material.id === id);
const bodyThickness = (cabinet, project) => number(stockById(project, cabinet.materialId)?.thickness, 18);
const backThickness = (cabinet, project) => cabinet.includeBack === false ? 0 : number(cabinet.backThickness, number(stockById(project, cabinet.backMaterialId)?.thickness, 3));
const drawerThickness = (cabinet, project) => number(stockById(project, cabinet.drawerMaterialId ?? cabinet.materialId)?.thickness, bodyThickness(cabinet, project));
const bottomThickness = (cabinet, project) => number(cabinet.drawerBottomThickness, number(stockById(project, cabinet.drawerBottomMaterialId)?.thickness, 6));
const frontThickness = (cabinet, project) => {
  const thickness = number(stockById(project, cabinet.frontMaterialId ?? cabinet.materialId)?.thickness, bodyThickness(cabinet, project));
  if (!cabinet.layout) return integer(cabinet.doors) + integer(cabinet.drawers) > 0 ? thickness : 0;
  const depth = number(cabinet.depth) - backThickness(cabinet, project);
  const projection = getFrontLayout(cabinet, project).reduce((maximum, front) => Math.max(maximum, front.depth + thickness - depth), 0);
  return Math.max(0, projection);
};
const physicalCabinet = (cabinet, project) => ({ ...cabinet, depth: number(cabinet.depth) + frontThickness(cabinet, project) });

/** Room installation allowances are explicit; legacy rooms default to zero. */
export function getRoomInstallationClearance(room) {
  return { walls: Math.max(0, number(room?.installationClearance?.walls)), ceiling: Math.max(0, number(room?.installationClearance?.ceiling)) };
}

/** Closed physical plan contour, including outer facade projection. */
export function getCabinetPlacementFootprint(cabinet, project) {
  return cabinetFootprint(physicalCabinet(cabinet, project ?? { materials: [] }));
}

export function validateCabinetPlacement(cabinet, project) {
  const room = project?.room ?? {}, required = getRoomInstallationClearance(room);
  const footprint = getCabinetPlacementFootprint(cabinet, project);
  const outline = getRoomOutline(room), contained = polygonContained(footprint, outline);
  const wallClearance = polygonBoundaryDistance(footprint, outline);
  const ceilingClearance = number(room.height, Infinity) - number(cabinet.y) - number(cabinet.height);
  const deficits = { walls: Math.max(0, round(required.walls - wallClearance)), ceiling: Math.max(0, round(required.ceiling - ceilingClearance)) };
  const collisions = (project?.cabinets ?? []).filter(other => other !== cabinet &&
    !(cabinet.id !== undefined && other.id === cabinet.id) && verticalOverlap(cabinet, other) &&
    polygonsOverlap(footprint, cabinetFootprint(physicalCabinet(other, project ?? { materials: [] })))).map(other => other.id);
  return { fits: contained && number(cabinet.y) >= 0 && deficits.walls <= EPSILON && deficits.ceiling <= EPSILON && !collisions.length, contained, wallClearance, ceilingClearance, required, deficits, footprint, collisions };
}

export function canPlaceCabinet(cabinet, project) {
  return validateCabinetPlacement(cabinet, project).fits;
}

// Disjoint ear triangles allow exact intersection areas for concave room/L
// footprints. This is only an edit guard; placement itself uses containment.
function footprintTriangles(points) {
  const list = points.map(point => ({ ...point }));
  if (polygonArea(list) < 0) list.reverse();
  const result = [], cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const inTriangle = (p, a, b, c) => cross(a, b, p) >= -1e-7 && cross(b, c, p) >= -1e-7 && cross(c, a, p) >= -1e-7;
  while (list.length > 3) {
    let found = false;
    for (let i = 0; i < list.length; i++) {
      const a = list[(i + list.length - 1) % list.length], b = list[i], c = list[(i + 1) % list.length];
      if (Math.abs(cross(a, b, c)) <= 1e-7) { list.splice(i, 1); found = true; break; }
      if (cross(a, b, c) < 0 || list.some(p => p !== a && p !== b && p !== c && inTriangle(p, a, b, c))) continue;
      result.push([a, b, c]); list.splice(i, 1); found = true; break;
    }
    if (!found) return [];
  }
  if (list.length === 3) result.push(list);
  return result;
}

function footprintIntersectionArea(a, b) {
  const trianglesA = footprintTriangles(a), trianglesB = footprintTriangles(b);
  let area = 0;
  for (const first of trianglesA) for (const second of trianglesB) {
    let polygon = first;
    for (let i = 0; i < 3 && polygon.length; i++) {
      const start = second[i], end = second[(i + 1) % 3];
      const side = p => (end.x - start.x) * (p.z - start.z) - (end.z - start.z) * (p.x - start.x);
      const clipped = [];
      for (let j = 0; j < polygon.length; j++) {
        const p = polygon[j], q = polygon[(j + 1) % polygon.length], d1 = side(p), d2 = side(q), insideP = d1 >= -1e-7, insideQ = d2 >= -1e-7;
        if (insideP) clipped.push(p);
        if (insideP !== insideQ) { const fraction = d1 / (d1 - d2); clipped.push({ x: p.x + (q.x - p.x) * fraction, z: p.z + (q.z - p.z) * fraction }); }
      }
      polygon = clipped;
    }
    area += Math.abs(polygonArea(polygon));
  }
  return area;
}

function placementMetrics(cabinet, project, placement) {
  const outsideArea = placement.contained ? 0 : Math.max(0, Math.abs(polygonArea(placement.footprint)) - footprintIntersectionArea(placement.footprint, getRoomOutline(project.room)));
  const collisionVolumes = Object.fromEntries(placement.collisions.map(id => {
    const other = project.cabinets.find(item => item.id === id);
    const height = Math.max(0, Math.min(number(cabinet.y) + number(cabinet.height), number(other.y) + number(other.height)) - Math.max(number(cabinet.y), number(other.y)));
    return [id, footprintIntersectionArea(placement.footprint, getCabinetPlacementFootprint(other, project)) * height];
  }));
  return { fits: placement.fits, outsideArea, collisionVolumes, deficits: { ...placement.deficits, floor: Math.max(0, -number(cabinet.y)) } };
}

/** Continuous motion guards use exact area/volume deficits between contacts. */
export function getCabinetPlacementMetrics(cabinet, project) {
  return placementMetrics(cabinet, project, validateCabinetPlacement(cabinet, project));
}

/** A saved invalid placement may improve, but cannot acquire larger deficits. */
export function canEditCabinetPlacement(current, proposed, project, { baselineProject = project } = {}) {
  const before = validateCabinetPlacement(current, baselineProject), after = validateCabinetPlacement(proposed, project);
  if (after.fits) return true;
  if (before.fits) return false;
  if (after.deficits.walls > before.deficits.walls + EPSILON || after.deficits.ceiling > before.deficits.ceiling + EPSILON || Math.max(0, -number(proposed.y)) > Math.max(0, -number(current.y)) + EPSILON) return false;
  const prior = placementMetrics(current, baselineProject, before), next = placementMetrics(proposed, project, after);
  if (next.outsideArea > prior.outsideArea + EPSILON) return false;
  for (const [id, volume] of Object.entries(next.collisionVolumes)) if (!Object.hasOwn(prior.collisionVolumes, id) || volume > prior.collisionVolumes[id] + EPSILON) return false;
  return true;
}

export function createSection(front = 'open') {
  return { id: uid('section'), kind: 'section', front: ['open', 'doors', 'drawers'].includes(front) ? front : 'open', doors: 2, drawers: 2, shelves: 0, depth: null, back: 'inherit', floor: 'inherit', pullOutShelf: false };
}

/** Clearances are opt-in; old projects keep the appliance's physical envelope. */
export function getApplianceClearances(appliance) {
  if (appliance?.useClearances !== true) return { side: 0, top: 0, rear: 0 };
  return Object.fromEntries(['side', 'top', 'rear'].map(axis => [axis, Math.max(0, number(appliance.clearances?.[axis]))]));
}

/** Requirements use the actual opening, including its available rear depth. */
export function getApplianceFit(section, appliance) {
  const clearances = getApplianceClearances(appliance);
  const physical = { width: number(appliance?.width), height: number(appliance?.height), depth: number(appliance?.depth) };
  const required = { width: physical.width + 2 * clearances.side, height: physical.height + clearances.top, depth: physical.depth + clearances.rear };
  const available = { width: number(section?.width), height: number(section?.height), depth: number(section?.usableDepth, number(section?.depth)) };
  const deficits = Object.fromEntries(['width', 'height', 'depth'].map(axis => [axis, Math.max(0, round(required[axis] - available[axis]))]));
  return { required, available, deficits, clearances, fits: Object.values(deficits).every(value => value <= EPSILON), physicalFits: Object.keys(physical).every(axis => physical[axis] <= available[axis] + EPSILON) };
}

/** Converting is explicit: legacy models retain their original unsplit geometry. */
export function convertLegacyLayout(cabinet) {
  const section = (suffix, front) => ({ ...createSection(front), id: `${cabinet.id}-${suffix}`, doors: integer(cabinet.doors) || 2, drawers: integer(cabinet.drawers) || 2, shelves: front === 'drawers' ? 0 : integer(cabinet.shelves), ...(front === 'doors' && Array.isArray(cabinet.doorOpenings) ? { doorOpenings: [...cabinet.doorOpenings] } : {}), ...(cabinet.openingMechanism !== undefined ? { openingMechanism: cabinet.openingMechanism } : {}) });
  if (integer(cabinet.drawers) > 0 && integer(cabinet.doors) > 0) {
    return { id: `${cabinet.id}-layout`, kind: 'split', axis: 'horizontal', sizes: [0.4, 0.6], children: [section('drawers', 'drawers'), section('doors', 'doors')] };
  }
  return section('layout', integer(cabinet.drawers) > 0 ? 'drawers' : integer(cabinet.doors) > 0 ? 'doors' : 'open');
}

export function findLayoutNode(layout, id) {
  if (!layout || !id) return null;
  const stack = [layout]; let count = 0;
  while (stack.length && count++ < 80) {
    const node = stack.pop();
    if (node.id === id) return node;
    if (node.kind === 'split' && Array.isArray(node.children)) stack.push(...node.children);
  }
  return null;
}

/** All coordinates are local to the body above the plinth; depths start at B. */
export function getCabinetLayout(cabinet, project = { materials: [] }) {
  const thickness = bodyThickness(cabinet, project);
  const bodyHeight = number(cabinet.height) - number(cabinet.plinth);
  const bodyDepth = number(cabinet.depth) - backThickness(cabinet, project);
  const width = number(cabinet.width);
  const gap = Math.max(0, number(cabinet.gap, 2));
  const bottomOrigin = cabinet.includeBottom === false ? 0 : thickness;
  const sections = [], partitions = [], nodes = [];
  const explicit = Boolean(cabinet.layout);
  const layout = cabinet.layout ?? convertLegacyLayout(cabinet);
  const divider = explicit ? thickness : 0;
  const visit = (node, bounds, level = 0) => {
    if (!node || level > 10 || nodes.length >= 80) return;
    const depth = node.depth === null || node.depth === undefined ? bounds.depth : Math.min(bounds.depth, Math.max(0, number(node.depth)));
    const rect = { ...bounds, depth };
    nodes.push({ id: node.id, node, ...rect });
    if (node.kind !== 'split' || !Array.isArray(node.children) || node.children.length < 2) {
      const floorEligible = Math.abs(rect.y - bottomOrigin) < EPSILON;
      const floorOpen = floorEligible && node.floor === 'open';
      const effectivePlinth = floorOpen ? 0 : floorEligible && node.plinthHeight !== null && node.plinthHeight !== undefined ? Math.max(0, number(node.plinthHeight)) : number(cabinet.plinth);
      const bottomPanelY = effectivePlinth - number(cabinet.plinth);
      const hasBottom = floorEligible && !floorOpen && (cabinet.includeBottom !== false || effectivePlinth > 0);
      const actualY = floorOpen ? -number(cabinet.plinth) : floorEligible ? bottomPanelY + (hasBottom ? thickness : 0) : rect.y;
      const floorExtra = rect.y - actualY;
      const sectionRect = { ...rect, y: actualY || 0, height: rect.height + floorExtra };
      const left = Math.abs(rect.x - thickness) < EPSILON ? gap : rect.x - thickness / 2 + gap / 2;
      const bottom = floorOpen ? sectionRect.y + gap : floorEligible ? bottomPanelY + gap : rect.y - thickness / 2 + gap / 2;
      const right = Math.abs(rect.x + rect.width - width + thickness) < EPSILON ? width - gap : rect.x + rect.width + thickness / 2 - gap / 2;
      const top = Math.abs(rect.y + rect.height - bodyHeight + thickness) < EPSILON ? bodyHeight - gap : rect.y + rect.height + thickness / 2 - gap / 2;
      const cutout = cabinet.cutout;
      const overlapsNotch = cutout && (cutout.corner === 'back-right' ? rect.x + rect.width > width - number(cutout.width) - thickness : rect.x < number(cutout.width) + thickness);
      const notchRearOffset = overlapsNotch ? Math.max(0, number(cutout.depth)) : 0;
      const backMode = cabinet.includeBack !== false ? 'global' : ['solid', 'panel'].includes(node.back) ? 'solid' : node.back === 'braces' ? 'braces' : 'none';
      const rearPanelThickness = backMode === 'global' ? backThickness(cabinet, project) : backMode === 'solid' ? number(cabinet.backThickness, number(stockById(project, cabinet.backMaterialId)?.thickness, 8)) : 0;
      const rearInset = backMode === 'solid' ? rearPanelThickness : 0;
      const rearOffset = notchRearOffset + rearInset;
      sections.push({ id: node.id, node, ...sectionRect, floorEligible, floorOpen, floorExtra, effectivePlinth, bottomPanelY, hasBottom, backMode, rearPanelThickness, rearInset, notchRearOffset, rearOffset, usableDepth: Math.max(0, depth - rearOffset), frontX: left, frontY: bottom, frontWidth: right - left, frontHeight: top - bottom });
      return;
    }
    const horizontal = node.axis === 'horizontal';
    const dimension = horizontal ? rect.height : rect.width;
    const available = Math.max(0, dimension - divider * (node.children.length - 1));
    const weights = node.children.map((_, index) => Math.max(EPSILON, number(node.sizes?.[index], 1)));
    const sum = weights.reduce((a, b) => a + b, 0);
    let cursor = horizontal ? rect.y + rect.height : rect.x;
    node.children.forEach((child, index) => {
      const size = available * weights[index] / sum;
      const childBounds = horizontal ? { x: rect.x, y: cursor - size, width: rect.width, height: size, depth } : { x: cursor, y: rect.y, width: size, height: rect.height, depth };
      visit(child, childBounds, level + 1);
      cursor += horizontal ? -size : size;
      if (index < node.children.length - 1) {
        if (divider > 0) partitions.push(horizontal
          ? { id: `${node.id}-divider-${index}`, parentId: node.id, beforeChildId: child.id, axis: 'horizontal', x: rect.x, y: cursor - divider, width: rect.width, height: divider, depth }
          : { id: `${node.id}-divider-${index}`, parentId: node.id, beforeChildId: child.id, axis: 'vertical', x: cursor, y: rect.y, width: divider, height: rect.height, depth });
        cursor += horizontal ? -divider : divider;
      }
    });
  };
  visit(layout, { x: thickness, y: bottomOrigin, width: Math.max(0, width - 2 * thickness), height: Math.max(0, bodyHeight - thickness - bottomOrigin), depth: bodyDepth });
  for (const partition of partitions) {
    if (partition.axis !== 'vertical' || Math.abs(partition.y - bottomOrigin) > EPSILON) continue;
    const adjacent = sections.filter(section => section.floorEligible && (Math.abs(section.x + section.width - partition.x) < EPSILON || Math.abs(section.x - partition.x - partition.width) < EPSILON));
    if (adjacent.length) {
      const bottom = Math.min(...adjacent.map(section => section.y));
      partition.height += partition.y - bottom;
      partition.floorExtended = bottom < partition.y - EPSILON;
      partition.y = bottom || 0;
    }
  }
  const internalSections = [], internalPartitions = [], internalNodes = [];
  for (const section of sections) if (['doors', 'open'].includes(section.node.front) && section.node.interiorLayout) {
    const interior = getInteriorLayout(section, thickness);
    internalSections.push(...interior.sections); internalPartitions.push(...interior.partitions); internalNodes.push(...interior.nodes);
  }
  return { sections, partitions, nodes, internalSections, internalPartitions, internalNodes, thickness, bodyHeight, bodyDepth };
}

/** Wardrobe hardware, separate from the MDF cutting parts. */
export function getRodLayout(cabinet, project = { materials: [] }) {
  return buildRodLayout(getCabinetLayout(cabinet, project), { cabinetId: cabinet.id, backThickness: backThickness(cabinet, project) });
}

function rodOccupiedBoxes(cabinet, project, layout) {
  const back = backThickness(cabinet, project), boxes = [];
  for (const section of layout.sections) if (section.node.appliance) {
    const a = section.node.appliance;
    boxes.push({ id: `appliance-${section.id}`, kind: 'appliance', x: section.x + (section.width - a.width) / 2,
      y: section.y, z: back + section.rearOffset + Math.max(0, section.usableDepth - a.depth), width: a.width, height: a.height, depth: a.depth });
  }
  for (const front of getFrontLayout(cabinet, project)) if (front.kind === 'drawer') {
    const section = layout.sections.find(item => item.id === front.sectionId);
    if (!section) continue;
    const runner = number(cabinet.drawerSlideGap, 13);
    boxes.push({ id: `drawer-${section.id}-${front.index}`, kind: 'drawer', x: section.x + runner,
      y: front.y + 20, z: back + section.rearOffset + 20, width: section.width - 2 * runner,
      height: front.height - 40, depth: section.usableDepth - 40 });
  }
  for (const front of getInternalDrawerLayout(cabinet, project)) boxes.push({ ...front.box,
    id: `internal-drawer-${front.sectionId}-${front.index}`, kind: 'drawer', height: front.box.height + front.box.bottomThickness });
  return boxes;
}

function rodCollisions(rods, parts, occupied) {
  const collisions = [];
  for (const rod of rods) {
    const metadata = { rodId: rod.rodId, sectionId: rod.sectionId, ...(rod.interiorSectionId ? { interiorSectionId: rod.interiorSectionId } : {}) };
    for (const part of parts) if (rodIntersectsPart(rod, part)) collisions.push({ ...metadata, kind: 'panel', otherId: part.id });
    for (const box of occupied) if (rodIntersectsBox(rod, box)) collisions.push({ ...metadata, kind: box.kind, otherId: box.id });
  }
  for (let i = 0; i < rods.length; i++) for (let j = i + 1; j < rods.length; j++) if (rodsIntersect(rods[i], rods[j])) collisions.push({ rodId: rods[i].rodId, sectionId: rods[i].sectionId,
    ...(rods[i].interiorSectionId ? { interiorSectionId: rods[i].interiorSectionId } : {}), kind: 'rod', otherId: rods[j].id });
  return collisions;
}

/** Physical collisions against finished panels and occupied appliance/drawer
 * envelopes. Back cutouts and local plinth levels use the same production data. */
export function getRodCollisions(cabinet, project = { materials: [] }) {
  const rods = getRodLayout(cabinet, project);
  if (!rods.length) return [];
  const layout = getCabinetLayout(cabinet, project);
  return rodCollisions(rods, generateParts({ ...project, cabinets: [cabinet] }), rodOccupiedBoxes(cabinet, project, layout));
}

/** Find a usable starter position without changing the user's cabinet. The
 * suggested offsets are geometric conveniences, not hanger/load standards. */
export function findFreeRodPosition(cabinet, project, sectionId, { interior, diameter = 25 } = {}) {
  const layout = getCabinetLayout(cabinet, project);
  const section = (interior === undefined ? [...layout.sections, ...layout.internalSections] : interior ? layout.internalSections : layout.sections).find(item => item.id === sectionId);
  if (!section || section.node.appliance || section.node.front === 'drawers' || section.node.interiorLayout || !Number.isFinite(diameter) || diameter <= 0) return null;
  const radius = diameter / 2;
  if (section.width <= 4 || section.height < diameter || section.usableDepth < diameter) return null;
  const rods = getRodLayout(cabinet, project), parts = generateParts({ ...project, cabinets: [cabinet] });
  const boxes = rodOccupiedBoxes(cabinet, project, layout), back = backThickness(cabinet, project);
  const heights = new Set([Math.max(radius, section.height - 150), section.height - radius, radius]);
  const insets = new Set([section.usableDepth / 2, radius, section.usableDepth - radius]);
  const yBoundary = (start, end) => { heights.add(start - section.y - radius - .01); heights.add(end - section.y + radius + .01); };
  const zBoundary = (start, end) => { insets.add(back + section.depth - start + radius + .01); insets.add(back + section.depth - end - radius - .01); };
  for (const part of parts) {
    if (!part.position) continue;
    const p = part.position, horizontal = part.orientation === 'horizontal', depthPanel = part.orientation === 'vertical-depth';
    yBoundary(p.y, p.y + (horizontal ? part.thickness : part.finishedHeight));
    zBoundary(p.z, p.z + (horizontal ? part.finishedHeight : depthPanel ? part.finishedWidth : part.thickness));
  }
  for (const box of boxes) { yBoundary(box.y, box.y + box.height); zBoundary(box.z, box.z + box.depth); }
  for (const rod of rods) { yBoundary(rod.y - rod.diameter / 2, rod.y + rod.diameter / 2); zBoundary(rod.z - rod.diameter / 2, rod.z + rod.diameter / 2); }
  for (const frontInset of insets) for (const y of heights) {
    if (y < radius || y > section.height - radius || frontInset < radius || frontInset > section.usableDepth - radius) continue;
    const trial = { ...section, node: { ...section.node, rods: [{ id: 'candidate', y, frontInset, diameter }] } };
    const [rod] = buildRodLayout({ sections: [trial] }, { cabinetId: cabinet.id, backThickness: back });
    if (!rodCollisions([rod], parts, boxes).length && !rods.some(other => rodsIntersect(rod, other))) return { y, frontInset, diameter, length: null };
  }
  return null;
}

/**
 * Joint centre lines of the horizontal panels bounding each opening. Heights
 * are measured from the whole cabinet base (including the plinth), without its
 * installation Y. Missing panels have no fastening axis. This is not a hole
 * pattern: it supplies the panel midline for the selected end fastening.
 */
export function getSectionMountingAxes(cabinet, project = { materials: [] }) {
  const layout = getCabinetLayout(cabinet, project);
  const panels = generateParts({ ...project, cabinets: [cabinet] }).filter(part =>
    part.orientation === 'horizontal' && (part.partitionId || part.name === 'Крышка' || part.name.startsWith('Дно корпуса')));
  const plinth = number(cabinet.plinth), back = backThickness(cabinet, project);
  return [...layout.sections, ...layout.internalSections].map(section => {
    const covers = panel => panel.position.x <= section.x + EPSILON &&
      panel.position.x + panel.finishedWidth >= section.x + section.width - EPSILON &&
      panel.position.z < back + section.depth + EPSILON &&
      panel.position.z + panel.finishedHeight >= back + section.depth - EPSILON;
    const bottomPanel = panels.find(panel => covers(panel) && Math.abs(panel.position.y + panel.thickness - section.y) < EPSILON);
    const topPanel = panels.find(panel => covers(panel) && Math.abs(panel.position.y - section.y - section.height) < EPSILON);
    const bottom = bottomPanel ? round(plinth + bottomPanel.position.y + bottomPanel.thickness / 2) : null;
    const top = topPanel ? round(plinth + topPanel.position.y + topPanel.thickness / 2) : null;
    return {
      id: section.id, ...(section.parentSectionId ? { parentSectionId: section.parentSectionId } : {}), bottom, top,
      height: bottom !== null && top !== null ? round(top - bottom) : null,
      openingHeight: round(section.height),
      bottomThickness: bottomPanel?.thickness ?? null,
      topThickness: topPanel?.thickness ?? null
    };
  });
}

function layoutParent(layout, id, parent = null) {
  if (layout?.id === id) return { node: layout, parent };
  for (const child of layout?.children ?? []) { const found = layoutParent(child, id, layout); if (found) return found; }
  return null;
}

export function splitSection(cabinet, id, axis) {
  if (!['horizontal', 'vertical'].includes(axis)) return false;
  cabinet.layout ??= convertLegacyLayout(cabinet);
  const found = layoutParent(cabinet.layout, id);
  if (!found || found.node.kind !== 'section') return false;
  const first = { ...found.node, id: uid('section') };
  const second = createSection('open');
  if (axis === 'horizontal' && first.plinthHeight !== undefined) { second.plinthHeight = first.plinthHeight; delete first.plinthHeight; }
  if (axis === 'horizontal' && first.floor === 'open') {
    first.floor = 'inherit'; second.floor = 'open';
    second.back = first.back ?? 'inherit'; second.depth = first.depth ?? null;
    if (first.appliance) { second.appliance = first.appliance; delete first.appliance; }
  }
  const split = { id: found.node.id, kind: 'split', axis, sizes: [1, 1], children: [first, second] };
  if (found.parent) found.parent.children[found.parent.children.indexOf(found.node)] = split; else cabinet.layout = split;
  return true;
}

export function mergeSection(cabinet, id) {
  if (!cabinet.layout) return false;
  const found = layoutParent(cabinet.layout, id);
  if (!found) return false;
  const target = found.node.kind === 'split' ? found.node : found.parent;
  if (!target) return false;
  const targetParent = layoutParent(cabinet.layout, target.id)?.parent;
  const merged = { ...createSection('open'), id: target.id };
  if (targetParent) targetParent.children[targetParent.children.indexOf(target)] = merged; else cabinet.layout = merged;
  return true;
}

/** Append one full-height opening while retaining the existing subtree sizes. */
export function extendCabinetSide(cabinet, side, addedWidth = 300, project = { materials: [] }) {
  const thickness = bodyThickness(cabinet, project), openingWidth = Number(addedWidth);
  const originalWidth = number(cabinet.width), nextWidth = originalWidth + openingWidth + thickness;
  if (!['left', 'right'].includes(side) || !Number.isFinite(openingWidth) || openingWidth < 50 ||
      nextWidth > 6000 || originalWidth - 2 * thickness < 50) return false;
  // Extending this edge would move its existing rear notch into the interior,
  // which cannot be represented by the supported rear L-corner shape.
  if (cabinet.cutout?.corner === `back-${side}`) return false;
  const previous = structuredClone(cabinet.layout ?? convertLegacyLayout(cabinet));
  const added = createSection('open');
  const sizes = [originalWidth - 2 * thickness, openingWidth];
  const nextLayout = { id: uid('layout'), kind: 'split', axis: 'vertical',
    sizes: side === 'left' ? sizes.reverse() : sizes,
    children: side === 'left' ? [added, previous] : [previous, added] };
  try { validateLayoutSchema(nextLayout); } catch { return false; }
  if (side === 'left') {
    const shift = openingWidth + thickness, angle = number(cabinet.rotation) * Math.PI / 180;
    cabinet.x = round(number(cabinet.x) - shift * Math.cos(angle));
    cabinet.z = round(number(cabinet.z) - shift * Math.sin(angle));
  }
  cabinet.width = nextWidth;
  cabinet.layout = nextLayout;
  return added.id;
}

export function resizeSection(cabinet, id, axis, mm, project) {
  if (!cabinet.layout || !Number.isFinite(Number(mm)) || Number(mm) <= 0) return false;
  let found = layoutParent(cabinet.layout, id);
  while (found?.parent && found.parent.axis !== axis) found = layoutParent(cabinet.layout, found.parent.id);
  if (!found?.parent || found.parent.axis !== axis) return false;
  const geometry = getCabinetLayout(cabinet, project);
  const bounds = geometry.nodes.find(item => item.id === found.parent.id);
  if (!bounds) return false;
  const available = (axis === 'horizontal' ? bounds.height : bounds.width) - geometry.thickness * (found.parent.children.length - 1);
  if (Number(mm) < 50 || Number(mm) >= available - EPSILON) return false;
  const index = found.parent.children.indexOf(found.node);
  const sizes = found.parent.children.map((_, childIndex) => Math.max(EPSILON, number(found.parent.sizes?.[childIndex], 1)));
  const others = sizes.reduce((sum, size, childIndex) => sum + (childIndex === index ? 0 : size), 0);
  const resized = sizes.map((size, childIndex) => childIndex === index ? Number(mm) : (available - Number(mm)) * size / others);
  if (resized.some(size => size < 50)) return false;
  found.parent.sizes = resized;
  return true;
}

const openingSize = (entry, axis) => axis === 'horizontal' ? (entry.baseHeight ?? entry.height) : entry.width;

function edgeResizePatches(node, axis, delta, edge, geometry, patches) {
  const entry = geometry.nodes.find(item => item.id === node.id);
  if (!entry || openingSize(entry, axis) + delta < 50 - EPSILON) return false;
  if (node.kind !== 'split') return true;
  if (node.axis !== axis) return node.children.every(child => edgeResizePatches(child, axis, delta, edge, geometry, patches));
  const sizes = node.children.map(child => openingSize(geometry.nodes.find(item => item.id === child.id), axis));
  const index = edge === 'start' ? 0 : sizes.length - 1;
  sizes[index] += delta;
  if (sizes[index] < 50 - EPSILON || !edgeResizePatches(node.children[index], axis, delta, edge, geometry, patches)) return false;
  patches.push({ node, sizes });
  return true;
}

function resizeAdjacentPair(cabinet, parent, beforeIndex, mm, project) {
  const geometry = getCabinetLayout(cabinet, project), axis = parent.axis;
  if (beforeIndex < 0 || beforeIndex >= parent.children.length - 1 || !Number.isFinite(mm)) return false;
  const sizes = parent.children.map(child => openingSize(geometry.nodes.find(item => item.id === child.id), axis));
  const delta = mm - sizes[beforeIndex];
  sizes[beforeIndex] = mm; sizes[beforeIndex + 1] -= delta;
  if (sizes[beforeIndex] < 50 - EPSILON || sizes[beforeIndex + 1] < 50 - EPSILON) return false;
  const patches = [];
  if (!edgeResizePatches(parent.children[beforeIndex], axis, delta, 'end', geometry, patches) || !edgeResizePatches(parent.children[beforeIndex + 1], axis, -delta, 'start', geometry, patches)) return false;
  for (const patch of patches) patch.node.sizes = patch.sizes;
  parent.sizes = sizes;
  return true;
}

/** mm is the new top/left opening size before this physical divider. */
export function resizeDivider(cabinet, id, axis, mm, project) {
  if (!cabinet.layout || !['horizontal', 'vertical'].includes(axis)) return false;
  const geometry = getCabinetLayout(cabinet, project);
  const divider = geometry.partitions.find(item => item.id === id || item.beforeChildId === id);
  if (!divider || divider.axis !== axis) return false;
  const parent = findLayoutNode(cabinet.layout, divider.parentId);
  return parent ? resizeAdjacentPair(cabinet, parent, parent.children.findIndex(child => child.id === divider.beforeChildId), Number(mm), project) : false;
}

/** Numeric size editing changes the nearest neighbour, preserving far edges. */
export function resizeSectionAdjacent(cabinet, id, axis, mm, project) {
  if (!cabinet.layout || !Number.isFinite(Number(mm)) || !['horizontal', 'vertical'].includes(axis)) return false;
  let found = layoutParent(cabinet.layout, id);
  while (found?.parent && found.parent.axis !== axis) found = layoutParent(cabinet.layout, found.parent.id);
  if (!found?.parent) return false;
  const geometry = getCabinetLayout(cabinet, project);
  const leaf = geometry.sections.find(section => section.id === id);
  const requested = Number(mm) - (axis === 'horizontal' ? number(leaf?.floorExtra) : 0);
  const index = found.parent.children.indexOf(found.node);
  if (index < found.parent.children.length - 1) return resizeAdjacentPair(cabinet, found.parent, index, requested, project);
  const before = geometry.nodes.find(item => item.id === found.parent.children[index - 1].id);
  const current = geometry.nodes.find(item => item.id === found.node.id);
  return resizeAdjacentPair(cabinet, found.parent, index - 1, openingSize(before, axis) + openingSize(current, axis) - requested, project);
}

export function removeSection(cabinet, id, project) {
  if (!cabinet.layout) return false;
  const found = layoutParent(cabinet.layout, id);
  if (!found?.parent || found.node.kind !== 'section') return false;
  const parent = found.parent, index = parent.children.indexOf(found.node);
  if (parent.children.length === 2) {
    const sibling = parent.children[1 - index];
    const grandparent = layoutParent(cabinet.layout, parent.id)?.parent;
    if (grandparent) grandparent.children[grandparent.children.indexOf(parent)] = sibling; else cabinet.layout = sibling;
    return true;
  }
  const geometry = getCabinetLayout(cabinet, project);
  const sizes = parent.children.map(child => openingSize(geometry.nodes.find(entry => entry.id === child.id), parent.axis));
  const neighbourIndex = index < parent.children.length - 1 ? index + 1 : index - 1;
  const freed = sizes[index] + geometry.thickness;
  const patches = [];
  if (!edgeResizePatches(parent.children[neighbourIndex], parent.axis, freed, neighbourIndex > index ? 'start' : 'end', geometry, patches)) return false;
  for (const patch of patches) patch.node.sizes = patch.sizes;
  sizes[neighbourIndex] += freed;
  parent.children.splice(index, 1); sizes.splice(index, 1); parent.sizes = sizes;
  return true;
}

export function getCabinetFootprint(cabinet) {
  return localFootprint(cabinet);
}

export function createDefaultProject(language = 'tr') {
  const namingLanguage = ['ru', 'tr', 'en'].includes(language) ? language : 'tr';
  const project = {
    version: 2,
    name: defaultName('defaultProject', namingLanguage), namingLanguage,
    room: {
      width: 4200, depth: 3400, height: 2700, wallThickness: 150,
      installationClearance: { walls: 10, ceiling: 20 },
      outline: [{ x: 0, z: 0 }, { x: 4200, z: 0 }, { x: 4200, z: 2400 }, { x: 3200, z: 2400 }, { x: 3200, z: 3400 }, { x: 0, z: 3400 }],
      windows: [{ id: 'window-1', wallIndex: 3, offset: 100, width: 800, height: 1200, sill: 900 }]
    },
    materials: (() => {
      // IDs are stable internal roles. Display names, thicknesses and sources
      // belong to the confirmed factory article, never to an assumed HDF/MDF.
      const aliases = { 'yildiz-white-18': 'mdf-white', 'yildiz-oak-18': 'mdf-oak', 'yildiz-black-18': 'mdf-sage', 'yildiz-white-8': 'hdf-back' };
      return [...MATERIAL_PRESETS.map(material => ({ ...localizeMaterialPreset(material, namingLanguage), id: aliases[material.id] ?? material.id })), { ...THIN_BACK_PRESET, name: defaultName('thinBack', namingLanguage), type: defaultName('thinBackType', namingLanguage) }];
    })(),
    cabinets: [],
    settings: { kerf: 3, margin: 10, allowRotate: true, deductEdge: true, printLanguage: 'tr' }
  };
  const common = {
    materialId: 'mdf-white', backMaterialId: 'thin-back-3', drawerMaterialId: 'mdf-white', drawerBottomMaterialId: 'hdf-back',
    doors: 0, drawers: 0, shelves: 0, plinth: 100, gap: 2, backThickness: 3, drawerSlideGap: 13, drawerBottomThickness: 8, edgeBand: 1,
    y: 0, z: 10, rotation: 0, includeBack: true, includeBottom: true, sidesToFloor: true, rearBraces: []
  };
  project.cabinets = [
    { ...common, id: 'cabinet-1', name: defaultName('defaultCabinet', namingLanguage), type: 'tall', width: 1200, height: 2200, depth: 620, x: 450, frontMaterialId: 'mdf-oak', layout: {
      id: 'wardrobe-layout', kind: 'split', axis: 'horizontal', sizes: [900, 480, 648], children: [
        { ...createSection('doors'), id: 'section-top', name: defaultName('upperSection', namingLanguage), shelves: 0 },
        { ...createSection('drawers'), id: 'section-middle', name: defaultName('drawerSection', namingLanguage), drawers: 2 },
        { ...createSection('doors'), id: 'section-bottom', name: defaultName('lowerSection', namingLanguage), shelves: 0 }
      ]
    } }
  ];
  return project;
}

export function createCabinet(type = 'base', project = createDefaultProject(), overrides = {}) {
  const supportedType = ['base', 'wall', 'tall'].includes(type) ? type : 'base';
  const namingLanguage = ['ru', 'tr', 'en'].includes(project.namingLanguage) ? project.namingLanguage : 'ru';
  const basePreset = {
    base: { name: defaultName('base', namingLanguage), width: 800, height: 860, depth: 580, y: 0, plinth: 100, shelves: 1 },
    wall: { name: defaultName('wall', namingLanguage), width: 800, height: 720, depth: 340, y: 1510, plinth: 0, shelves: 2 },
    tall: { name: defaultName('tall', namingLanguage), width: 600, height: 2200, depth: 580, y: 0, plinth: 100, shelves: 5 }
  }[supportedType];
  const preset = { ...basePreset };
  // Library presets can affect dimensions before automatic placement. IDs and
  // coordinates are generated here, so a preset cannot discard a safe position.
  for (const key of ['name', 'width', 'height', 'depth', 'y', 'plinth', 'shelves', 'doors', 'drawers', 'gap', 'includeBottom', 'includeBack', 'sidesToFloor']) {
    if (overrides[key] !== undefined) preset[key] = overrides[key];
  }
  const roomAllowance = getRoomInstallationClearance(project.room);
  preset.y = Math.max(0, Math.min(number(preset.y), number(project.room?.height, 2700) - roomAllowance.ceiling - number(preset.height)));
  const materials = project.materials ?? [];
  const material = materials.find(item => number(item.thickness) === 18) ?? materials[0];
  const exactThickness = thickness => materials.find(item => number(item.thickness) === thickness)?.id;
  const fibreTypes = new Set(['ru', 'tr', 'en'].map(language => defaultName('thinBackType', language)));
  const thinBack = materials.find(isDefaultBackMaterial) ??
    materials.find(item => number(item.thickness) === 3 && fibreTypes.has(item.type));
  const backMaterialId = thinBack?.id ?? exactThickness(3) ?? materials.find(item => item.id === 'hdf-back')?.id ?? exactThickness(8) ?? material?.id;
  const drawerMaterialId = exactThickness(16) ?? material?.id;
  const drawerBottomMaterialId = exactThickness(6) ?? exactThickness(8) ?? backMaterialId;
  const existing = project.cabinets ?? [];
  const cabinet = {
    id: uid('cabinet'), type: supportedType, doors: 2, drawers: 0, gap: 2, ...preset,
    materialId: material?.id ?? '', frontMaterialId: material?.id ?? '', backMaterialId: backMaterialId ?? '',
    drawerMaterialId: drawerMaterialId ?? '', drawerBottomMaterialId: drawerBottomMaterialId ?? '',
    backThickness: number(stockById(project, backMaterialId)?.thickness, 8), drawerSlideGap: 13, drawerBottomThickness: number(stockById(project, drawerBottomMaterialId)?.thickness, 8), edgeBand: 1, rotation: 0, includeBack: preset.includeBack ?? true, includeBottom: preset.includeBottom ?? true, sidesToFloor: preset.sidesToFloor ?? true, rearBraces: []
  };
  const bounds = roomBounds(project.room);
  const insetX = Math.max(100, roomAllowance.walls);
  const candidatesX = [...new Set([bounds.minX + insetX, ...getRoomOutline(project.room).map(point => point.x + insetX), ...existing.map(item => number(item.x) + number(item.width) + 100)])].sort((a, b) => a - b);
  const candidatesZ = [...new Set([bounds.minZ + roomAllowance.walls, ...getRoomOutline(project.room).map(point => point.z + roomAllowance.walls), ...existing.map(item => number(item.z) + number(item.depth) + 150)])].sort((a, b) => a - b);
  let position = { x: bounds.minX + insetX, z: bounds.minZ + roomAllowance.walls };
  let found = false;
  for (const z of candidatesZ) {
    for (const x of candidatesX) {
      const candidate = physicalCabinet({ ...cabinet, x, z }, project);
      if (!canPlaceCabinet({ ...cabinet, x, z }, project)) continue;
      if (!existing.some(item => verticalOverlap(candidate, item) && polygonsOverlap(cabinetFootprint(candidate), cabinetFootprint(physicalCabinet(item, project))))) {
        position = { x, z }; found = true; break;
      }
    }
    if (found) break;
  }
  cabinet.layout = { ...createSection(integer(cabinet.drawers) > 0 ? 'drawers' : integer(cabinet.doors) > 0 ? 'doors' : 'open'), doors: integer(cabinet.doors) || 2, drawers: integer(cabinet.drawers) || 2, shelves: integer(cabinet.drawers) > 0 ? 0 : integer(cabinet.shelves) };
  return { ...cabinet, ...position };
}

/** Front coordinates are relative to the body, above the plinth. */
export function getFrontLayout(cabinet, project = { materials: [] }) {
  if (cabinet.layout) {
    const fronts = [];
    for (const section of getCabinetLayout(cabinet, project).sections) {
      const { node, frontX: x, frontY: y, frontWidth: width, frontHeight: height, depth, id: sectionId } = section;
      const gap = Math.max(0, number(cabinet.gap, 2));
      if (node.front === 'doors') {
        const count = Math.max(1, integer(node.doors, 2));
        const doorWidth = (width - (count - 1) * gap) / count;
        for (let index = 0; index < count; index++) fronts.push({ kind: 'door', index, sectionId, opening: doorOpening(node, index), openingMechanism: openingMechanism(node), x: x + index * (doorWidth + gap), y, width: round(doorWidth), height: round(height), depth });
      } else if (node.front === 'drawers') {
        const count = Math.max(1, integer(node.drawers, 2));
        const available = height - (count - 1) * gap;
        const weights = Array.from({ length: count }, (_, index) => Math.max(EPSILON, number(node.drawerHeights?.[index], 1)));
        const sum = weights.reduce((a, b) => a + b, 0);
        let cursor = y + height;
        weights.forEach((weight, index) => {
          const drawerHeight = available * weight / sum;
          cursor -= drawerHeight;
          fronts.push({ kind: 'drawer', index, sectionId, openingMechanism: openingMechanism(node), x, y: round(cursor), width: round(width), height: round(drawerHeight), depth });
          cursor -= gap;
        });
      }
    }
    return fronts;
  }
  const width = number(cabinet.width);
  const height = number(cabinet.height) - number(cabinet.plinth);
  const gap = Math.max(0, number(cabinet.gap, 2));
  const doors = integer(cabinet.doors);
  const drawers = integer(cabinet.drawers);
  const result = [];
  if (width <= 0 || height <= 0) return result;
  const usableHeight = height - gap * (drawers + (doors > 0 ? 2 : 1));
  const drawerZone = drawers > 0 ? usableHeight * (doors > 0 ? 0.4 : 1) : 0;
  const doorHeight = doors > 0 ? (drawers > 0 ? usableHeight - drawerZone : height - 2 * gap) : 0;
  if (doors > 0) {
    const doorWidth = (width - gap * (doors + 1)) / doors;
    for (let index = 0; index < doors; index++) {
      result.push({ kind: 'door', index, opening: doorOpening(cabinet, index), openingMechanism: openingMechanism(cabinet), x: gap + index * (doorWidth + gap), y: gap, width: round(doorWidth), height: round(doorHeight) });
    }
  }
  if (drawers > 0) {
    const drawerHeight = drawerZone / drawers;
    const start = doors > 0 ? gap + doorHeight + gap : gap;
    for (let index = 0; index < drawers; index++) {
      result.push({ kind: 'drawer', index, openingMechanism: openingMechanism(cabinet), x: gap, y: round(start + index * (drawerHeight + gap)), width: round(width - 2 * gap), height: round(drawerHeight) });
    }
  }
  return result;
}

/** Internal fronts and boxes are inset behind the outer doors, never facades. */
export function getInternalDrawerLayout(cabinet, project = { materials: [] }) {
  if (!cabinet.layout) return [];
  const panels = drawerThickness(cabinet, project), bottom = bottomThickness(cabinet, project);
  const back = backThickness(cabinet, project), gap = Math.max(0, number(cabinet.gap, 2));
  const runner = Math.max(0, number(cabinet.drawerSlideGap, 13));
  const result = [];
  const layout = getCabinetLayout(cabinet, project);
  for (const outer of layout.sections) {
    if (!['doors', 'open'].includes(outer.node.front)) continue;
    const openings = outer.node.interiorLayout ? layout.internalSections.filter(section => section.parentSectionId === outer.id && section.node.front === 'drawers') : [outer];
    let globalIndex = 0;
    for (const section of openings) {
      const internal = section !== outer;
      const count = Math.min(12, internal ? integer(section.node.drawers, 2) : integer(section.node.internalDrawerCount));
      if (!count) continue;
      const hingeGap = outer.node.front === 'doors' ? Math.max(0, number(outer.node.internalDrawerHingeGap, 20)) : 0;
      const leftHinge = Math.abs(section.x - outer.x) < EPSILON ? hingeGap : 0;
      const rightHinge = Math.abs(section.x + section.width - outer.x - outer.width) < EPSILON ? hingeGap : 0;
      const mechanism = openingMechanism(internal ? section.node : outer.node), handleProjection = mechanism === 'handle' ? 16 : 0;
      const availableHeight = section.height - 50 - gap * (count + 1);
      const weights = Array.isArray(section.node.drawerHeights) && section.node.drawerHeights.length === count ? section.node.drawerHeights.map(value => Math.max(EPSILON, number(value, 1))) : Array(count).fill(1);
      const sum = weights.reduce((sum, value) => sum + value, 0);
      let cursor = section.y + section.height - 50 - gap;
      for (let index = 0; index < count; index++) {
        const height = availableHeight * weights[index] / sum;
        cursor -= height;
        result.push({
          kind: 'internal-drawer', index: globalIndex++, sectionId: outer.id, ...(internal ? { interiorSectionId: section.id } : {}),
          x: round(section.x + leftHinge + gap), y: round(cursor),
          width: round(section.width - leftHinge - rightHinge - 2 * gap), height: round(height),
          depth: round(section.depth - panels - gap - handleProjection), frontThickness: panels,
          hingeGap, handleProjection, openingMechanism: mechanism,
          box: { x: round(section.x + leftHinge + runner), y: round(cursor + 20), z: round(back + section.rearOffset + 20),
            width: round(section.width - leftHinge - rightHinge - 2 * runner), height: round(height - 40 - bottom),
            depth: round(section.usableDepth - 40 - panels - gap - handleProjection), panelThickness: panels, bottomThickness: bottom }
        });
        cursor -= gap;
      }
    }
  }
  return result;
}

export function generateParts(project) {
  const parts = [];
  for (const cabinet of project?.cabinets ?? []) {
    const firstPart = parts.length;
    const width = number(cabinet.width);
    const bodyHeight = number(cabinet.height) - number(cabinet.plinth);
    const thickness = bodyThickness(cabinet, project);
    const back = backThickness(cabinet, project);
    const bodyDepth = number(cabinet.depth) - back;
    const insideWidth = width - 2 * thickness;
    let sequence = 0;
    const addPart = (name, panelWidth, panelHeight, panelThickness, materialId, edgeNames = [], extras = {}) => {
      const material = stockById(project, materialId);
      const edgeSize = number(cabinet.edgeBand, number(material?.edgeBand, 1));
      const edges = Object.fromEntries(['top', 'bottom', 'left', 'right'].map(edge => [edge, edgeNames.includes(edge) ? edgeSize : 0]));
      const finishedWidth = panelWidth;
      const finishedHeight = panelHeight;
      sequence++;
      if (![panelWidth, panelHeight, panelThickness].every(value => Number.isFinite(value) && value > 0)) return;
      const outline = extras.outline?.map(point => ({ ...point }));
      parts.push({
        id: `${cabinet.id}-part-${sequence}`, cabinetId: cabinet.id, cabinetName: cabinet.name,
        name, width: round(panelWidth), height: round(panelHeight), thickness: panelThickness,
        finishedWidth: round(finishedWidth), finishedHeight: round(finishedHeight), materialId, quantity: 1,
        grain: Boolean(material?.grain), edges, ...extras, ...(outline ? { outline, finishedOutline: extras.outline.map(point => ({ ...point })), area: contourArea(outline) } : { area: panelWidth * panelHeight })
      });
    };
    if (width <= 0 || bodyHeight <= 0 || bodyDepth <= 0 || thickness <= 0) continue;
    const cutout = cabinet.cutout;
    const cutWidth = number(cutout?.width), cutDepth = number(cutout?.depth);
    const hasCutout = cutWidth > 0 && cutDepth > 0;
    const rightCutout = cutout?.corner === 'back-right';
    const layout = cabinet.layout ? getCabinetLayout(cabinet, project) : null;
    const floorSections = layout?.sections.filter(section => section.floorOpen) ?? [];
    const horizontal = (name, x, z, panelWidth, panelDepth, y, sectionId, extra = {}) => {
      const { clipRearInset = 0, ...metadata } = extra;
      const shapeCabinet = clipRearInset > 0 && cabinet.cutout ? { ...cabinet, cutout: { ...cabinet.cutout, depth: number(cabinet.cutout.depth) + clipRearInset } } : cabinet;
      const shape = horizontalContour(shapeCabinet, x, z, panelWidth, panelDepth, thickness, back);
      addPart(name, shape.width, shape.height, thickness, cabinet.materialId, ['bottom'], { ...(sectionId ? { sectionId } : {}), ...(shape.outline ? { outline: shape.outline } : {}), position: { x: shape.x, y, z: shape.z }, orientation: 'horizontal', ...metadata });
    };
    const leftDepth = hasCutout && !rightCutout ? number(cabinet.depth) - cutDepth : bodyDepth;
    const rightDepth = hasCutout && rightCutout ? number(cabinet.depth) - cutDepth : bodyDepth;
    const floorY = -number(cabinet.plinth) || 0;
    const lowerSide = match => cabinet.sidesToFloor === true ? floorY : Math.min(0, ...(layout?.sections ?? []).filter(section => section.floorEligible && match(section)).map(section => section.hasBottom ? section.bottomPanelY : section.y));
    const leftY = lowerSide(section => Math.abs(section.x - thickness) < EPSILON), rightY = lowerSide(section => Math.abs(section.x + section.width - width + thickness) < EPSILON);
    addPart('Боковина левая', leftDepth, bodyHeight - leftY, thickness, cabinet.materialId, ['left'], { position: { x: 0, y: leftY, z: hasCutout && !rightCutout ? cutDepth : back }, orientation: 'vertical-depth' });
    addPart('Боковина правая', rightDepth, bodyHeight - rightY, thickness, cabinet.materialId, ['left'], { position: { x: width - thickness, y: rightY, z: hasCutout && rightCutout ? cutDepth : back }, orientation: 'vertical-depth' });
    horizontal('Крышка', thickness, back, insideWidth, bodyDepth, bodyHeight - thickness);
    if (cabinet.includeBottom !== false || layout?.sections.some(section => section.hasBottom) || !layout && number(cabinet.plinth) > 0) {
      const intervals = retainedFloorIntervals(cabinet, layout, thickness);
      intervals.forEach((interval, index) => horizontal(intervals.length === 1 && !floorSections.length ? 'Дно корпуса' : `Дно корпуса · участок ${index + 1}`, interval.x, back, interval.width, bodyDepth, interval.y ?? 0, interval.sectionId, { role: 'bottom', component: 'bottom' }));
    }
    const returnY = lowerSide(section => section.x <= (rightCutout ? width - cutWidth : cutWidth) && section.x + section.width >= (rightCutout ? width - cutWidth : cutWidth));
    if (hasCutout) addPart('Возвратная боковина выреза', Math.max(0, cutDepth - back), bodyHeight - returnY, thickness, cabinet.materialId, ['left'], { position: { x: rightCutout ? width - cutWidth - thickness : cutWidth, y: returnY, z: back }, orientation: 'vertical-depth' });
    const label = section => `Секция ${layout.sections.indexOf(section) + 1}${section.node.name ? ` · ${section.node.name}` : ''}`;
    if (back > 0 && cabinet.includeBack !== false) {
      const rearY = Math.min(0, ...(layout?.sections ?? []).filter(section => section.floorEligible).map(section => section.floorOpen ? section.y : section.bottomPanelY));
      addPart('Задняя стенка', hasCutout ? width - cutWidth : width, bodyHeight - rearY, back, cabinet.backMaterialId, [], { role: 'back', component: 'back', position: { x: hasCutout && !rightCutout ? cutWidth : 0, y: rearY, z: 0 }, orientation: 'vertical-width' });
      if (hasCutout) addPart('Задняя стенка выреза', cutWidth, bodyHeight - rearY, back, cabinet.backMaterialId, [], { role: 'back', component: 'back', position: { x: rightCutout ? width - cutWidth : 0, y: rearY, z: cutDepth }, orientation: 'vertical-width' });
    } else if (layout) {
      for (const section of layout.sections.filter(section => section.backMode === 'solid')) {
        for (const [index, segment] of sectionRearSegments(cabinet, section, thickness, back).entries()) addPart(`${label(section)} · задняя стенка${index ? ' выреза' : ''}`, segment.width, section.height, section.rearPanelThickness, cabinet.backMaterialId, [], { sectionId: section.id, role: 'section-back', component: 'section-back', position: { x: segment.x, y: section.y, z: segment.z }, orientation: 'vertical-width' });
      }
    }
    if (layout) {
      for (const partition of layout.partitions) {
        const index = layout.partitions.filter(item => item.axis === partition.axis).indexOf(partition) + 1;
        if (partition.axis === 'horizontal') horizontal(`Горизонтальная перегородка ${index}`, partition.x, back, partition.width, partition.depth, partition.y, undefined, { partitionId: partition.id });
        else {
          const notchAt = hasCutout && (rightCutout ? partition.x + partition.width > width - cutWidth : partition.x < cutWidth);
          const start = notchAt ? Math.max(back, cutDepth) : back;
          addPart(`Вертикальная перегородка ${index}`, partition.depth - (start - back), partition.height, thickness, cabinet.materialId, ['left'], { position: { x: partition.x, y: partition.y, z: start }, orientation: 'vertical-depth', partitionId: partition.id });
        }
      }
      for (const section of layout.sections) {
        if (section.node.interiorLayout) continue;
        for (let index = 0; index < integer(section.node.shelves); index++) horizontal(`${label(section)} · полка ${index + 1}`, section.x + 2, back + section.rearInset, section.width - 4, section.depth - section.rearInset - 20, section.y + section.height * (index + 1) / (integer(section.node.shelves) + 1), section.id, { clipRearInset: section.rearInset });
        if (section.node.pullOutShelf) {
          const slide = number(cabinet.drawerSlideGap, 13);
          addPart(`${label(section)} · выдвижная полка`, section.width - 2 * slide, section.usableDepth - 40, thickness, cabinet.materialId, ['bottom', 'left', 'right'], { sectionId: section.id, role: 'pull-out-shelf', component: 'pull-out-shelf', pullOutShelf: true, openingMechanism: openingMechanism(section.node), position: { x: section.x + slide, y: section.y + 5, z: back + section.rearOffset + 20 }, orientation: 'horizontal' });
        }
      }
      for (const partition of layout.internalPartitions) {
        const outer = layout.sections.find(section => section.id === partition.parentSectionId);
        const index = layout.internalPartitions.filter(item => item.parentSectionId === outer.id && item.axis === partition.axis).indexOf(partition) + 1;
        const extras = { sectionId: outer.id, interiorSectionId: partition.parentId, parentSectionId: outer.id, partitionId: partition.id, component: 'interior-partition', role: 'interior-partition' };
        if (partition.axis === 'horizontal') horizontal(`${label(outer)} · внутренняя горизонтальная перегородка ${index}`, partition.x, back + outer.rearInset, partition.width, partition.depth - outer.rearInset, partition.y, outer.id, { ...extras, clipRearInset: outer.rearInset });
        else {
          const overlapsNotch = hasCutout && (rightCutout ? partition.x + partition.width > width - cutWidth : partition.x < cutWidth + thickness);
          const start = back + outer.rearInset + (overlapsNotch ? cutDepth : 0);
          addPart(`${label(outer)} · внутренняя вертикальная перегородка ${index}`, partition.depth - (start - back), partition.height, thickness, cabinet.materialId, ['left'], { ...extras, position: { x: partition.x, y: partition.y, z: start }, orientation: 'vertical-depth' });
        }
      }
      for (const section of layout.internalSections) {
        const outer = layout.sections.find(item => item.id === section.parentSectionId);
        const prefix = `${label(outer)} · внутренний отсек ${layout.internalSections.filter(item => item.parentSectionId === outer.id).indexOf(section) + 1}`;
        const extras = { sectionId: outer.id, interiorSectionId: section.id, parentSectionId: outer.id };
        for (let index = 0; index < integer(section.node.shelves); index++) horizontal(`${prefix} · полка ${index + 1}`, section.x + 2, back + outer.rearInset, section.width - 4, section.depth - outer.rearInset - 20, section.y + section.height * (index + 1) / (integer(section.node.shelves) + 1), outer.id, { ...extras, role: 'interior-shelf', component: 'interior-shelf', clipRearInset: outer.rearInset });
        if (section.node.pullOutShelf) {
          const slide = number(cabinet.drawerSlideGap, 13);
          addPart(`${prefix} · выдвижная полка`, section.width - 2 * slide, section.usableDepth - 40, thickness, cabinet.materialId, ['bottom', 'left', 'right'], { ...extras, role: 'pull-out-shelf', component: 'pull-out-shelf', pullOutShelf: true, openingMechanism: openingMechanism(section.node), position: { x: section.x + slide, y: section.y + 5, z: back + section.rearOffset + 20 }, orientation: 'horizontal' });
        }
      }
    } else for (let index = 0; index < integer(cabinet.shelves); index++) horizontal(`Полка ${index + 1}`, thickness + 2, back, insideWidth - 4, bodyDepth - 20, thickness + (bodyHeight - 2 * thickness) * (index + 1) / (integer(cabinet.shelves) + 1));
    if (number(cabinet.plinth) > 10 || layout?.sections.some(section => section.floorEligible && section.effectivePlinth > 10)) {
      const gap = number(cabinet.gap, 2);
      const sources = layout ? layout.sections.filter(section => section.floorEligible && !section.floorOpen && section.effectivePlinth > 10).map(section => ({ x: section.frontX, width: section.frontWidth, y: section.effectivePlinth, sectionIds: [section.id] })) : [{ x: gap, width: width - 2 * gap, y: number(cabinet.plinth), sectionIds: [] }];
      const intervals = mergeLevelIntervals(sources, gap + EPSILON);
      intervals.forEach((interval, index) => addPart(intervals.length === 1 && !floorSections.length ? 'Цокольная планка' : `Цокольная планка · участок ${index + 1}`, interval.width, interval.y - 10, thickness, cabinet.materialId, ['top', 'left', 'right'], { ...(interval.sectionIds.length === 1 ? { sectionId: interval.sectionIds[0] } : {}), role: 'plinth', component: 'plinth', position: { x: interval.x, y: -number(cabinet.plinth) || 0, z: number(cabinet.depth) - 65 }, orientation: 'vertical-width' }));
    }
    for (const [index, panel] of rearBracePanels(cabinet, project, layout).entries()) {
      const section = panel.sectionId ? layout.sections.find(section => section.id === panel.sectionId) : null;
      addPart(section ? `${label(section)} · задняя перемычка ${panel.localIndex + 1}` : `Задняя перемычка ${index + 1}`, panel.width, panel.height, panel.thickness, panel.materialId, ['top', 'bottom'], { ...(panel.sectionId ? { sectionId: panel.sectionId } : {}), braceId: panel.braceId, braceBaseY: panel.braceBaseY, role: 'brace', component: 'brace', position: { x: panel.x, y: panel.y, z: panel.z }, orientation: 'vertical-width' });
    }
    for (const front of getFrontLayout(cabinet, project)) {
      const section = layout?.sections.find(item => item.id === front.sectionId);
      const prefix = section ? `${label(section)} · ` : '';
      const extras = section ? { sectionId: section.id } : {};
      const frontStock = stockById(project, cabinet.frontMaterialId ?? cabinet.materialId);
      const frontThickness = number(frontStock?.thickness, thickness);
      const frontLabel = front.kind === 'door' ? `Дверь ${front.index + 1}` : `Фасад ящика ${front.index + 1}`;
      addPart(prefix + frontLabel, front.width, front.height, frontThickness, cabinet.frontMaterialId ?? cabinet.materialId, ['top', 'bottom', 'left', 'right'], { ...extras, position: { x: front.x, y: front.y, z: back + (front.depth ?? bodyDepth) }, orientation: 'vertical-width' });
      if (front.kind !== 'drawer') continue;
      const drawerPanelThickness = drawerThickness(cabinet, project);
      const drawerBottom = bottomThickness(cabinet, project);
      const outerWidth = (section?.width ?? insideWidth) - 2 * number(cabinet.drawerSlideGap, 13);
      const outerDepth = (section?.usableDepth ?? (bodyDepth - (hasCutout ? cutDepth : 0))) - 40;
      const boxHeight = front.height - 40 - drawerBottom;
      const drawerMaterialId = cabinet.drawerMaterialId ?? cabinet.materialId;
      const bottomMaterialId = cabinet.drawerBottomMaterialId ?? cabinet.backMaterialId;
      addPart(`${prefix}Ящик ${front.index + 1} · боковина левая`, outerDepth, boxHeight, drawerPanelThickness, drawerMaterialId, ['top'], extras);
      addPart(`${prefix}Ящик ${front.index + 1} · боковина правая`, outerDepth, boxHeight, drawerPanelThickness, drawerMaterialId, ['top'], extras);
      addPart(`${prefix}Ящик ${front.index + 1} · передняя стенка`, outerWidth - 2 * drawerPanelThickness, boxHeight, drawerPanelThickness, drawerMaterialId, ['top'], extras);
      addPart(`${prefix}Ящик ${front.index + 1} · задняя стенка`, outerWidth - 2 * drawerPanelThickness, boxHeight, drawerPanelThickness, drawerMaterialId, ['top'], extras);
      addPart(`${prefix}Ящик ${front.index + 1} · дно`, outerWidth, outerDepth, drawerBottom, bottomMaterialId, [], extras);
    }
    for (const front of getInternalDrawerLayout(cabinet, project)) {
      const section = layout.sections.find(item => item.id === front.sectionId), box = front.box;
      const prefix = `${label(section)} · Внутренний ящик ${front.index + 1} · `;
      const panelMaterialId = cabinet.drawerMaterialId ?? cabinet.materialId;
      const extras = { sectionId: front.sectionId, ...(front.interiorSectionId ? { interiorSectionId: front.interiorSectionId, parentSectionId: front.sectionId } : {}), internalDrawerIndex: front.index, openingMechanism: front.openingMechanism, component: 'internal-drawer-box', role: 'internal-drawer-box' };
      addPart(prefix + 'фасад', front.width, front.height, front.frontThickness, panelMaterialId, ['top', 'bottom', 'left', 'right'], { ...extras, component: 'internal-drawer-front', role: 'internal-drawer-front', position: { x: front.x, y: front.y, z: back + front.depth }, orientation: 'vertical-width' });
      addPart(prefix + 'боковина левая', box.depth, box.height, box.panelThickness, panelMaterialId, ['top'], { ...extras, position: { x: box.x, y: box.y + box.bottomThickness, z: box.z }, orientation: 'vertical-depth' });
      addPart(prefix + 'боковина правая', box.depth, box.height, box.panelThickness, panelMaterialId, ['top'], { ...extras, position: { x: box.x + box.width - box.panelThickness, y: box.y + box.bottomThickness, z: box.z }, orientation: 'vertical-depth' });
      addPart(prefix + 'передняя стенка', box.width - 2 * box.panelThickness, box.height, box.panelThickness, panelMaterialId, ['top'], { ...extras, position: { x: box.x + box.panelThickness, y: box.y + box.bottomThickness, z: box.z + box.depth - box.panelThickness }, orientation: 'vertical-width' });
      addPart(prefix + 'задняя стенка', box.width - 2 * box.panelThickness, box.height, box.panelThickness, panelMaterialId, ['top'], { ...extras, position: { x: box.x + box.panelThickness, y: box.y + box.bottomThickness, z: box.z }, orientation: 'vertical-width' });
      addPart(prefix + 'дно', box.width, box.depth, box.bottomThickness, cabinet.drawerBottomMaterialId ?? cabinet.backMaterialId, [], { ...extras, position: { x: box.x, y: box.y, z: box.z }, orientation: 'horizontal' });
    }
    const cabinetParts = parts.slice(firstPart);
    assignContactEdgeBands(cabinetParts);
    for (const part of cabinetParts) finishCutBlank(part, project.settings?.deductEdge === true);
  }
  return parts;
}

function finishedPanelBounds(part) {
  const p = part.position;
  if (!p || !part.orientation) return null;
  const width = part.finishedWidth, height = part.finishedHeight;
  return { x: p.x, y: p.y, z: p.z,
    width: part.orientation === 'vertical-depth' ? part.thickness : width,
    height: part.orientation === 'horizontal' ? part.thickness : height,
    depth: part.orientation === 'horizontal' ? height : part.orientation === 'vertical-depth' ? width : part.thickness };
}

function finishedHorizontalPolygon(part) {
  if (part.orientation !== 'horizontal' || !part.position) return null;
  const p = part.position, outline = part.finishedOutline ?? part.outline ?? [
    { x: 0, y: 0 }, { x: part.finishedWidth, y: 0 },
    { x: part.finishedWidth, y: part.finishedHeight }, { x: 0, y: part.finishedHeight }
  ];
  return outline.map(point => ({ x: p.x + point.x, z: p.z + point.y }));
}

function intervalsCover(start, length, intervals) {
  let cursor = start;
  const end = start + length;
  for (const [low, high] of intervals.sort((a, b) => a[0] - b[0])) {
    if (high < cursor - EPSILON) continue;
    if (low > cursor + EPSILON) return false;
    cursor = Math.max(cursor, high);
    if (cursor >= end - EPSILON) return true;
  }
  return false;
}

/** Contacts use finished assembly geometry. Door closure does not hide an
 * accessible edge; only structural joints cover plinth/brace/return ends.
 * A partly exposed edge keeps a continuous band, rather than a stepped blank. */
function assignContactEdgeBands(parts) {
  const structural = parts.filter(part => part.position && part.orientation &&
    part.role !== 'plinth' && !part.role?.startsWith('internal-drawer') &&
    !/(?:Дверь \d+|Фасад ящика \d+)$/.test(part.name));
  for (const part of parts) {
    const bounds = finishedPanelBounds(part);
    if (!bounds) continue;
    if (part.role === 'plinth') {
      for (const edge of ['left', 'right']) {
        const x = bounds.x + (edge === 'right' ? bounds.width : 0), covered = [];
        for (const other of structural) {
          const b = finishedPanelBounds(other);
          if (other.orientation === 'horizontal') {
            const polygon = finishedHorizontalPolygon(other);
            // Generated horizontal contours are rectangles or rear L-notches;
            // an axis-aligned line is contained when both ends are contained.
            if (pointInPolygon({ x, z: bounds.z }, polygon) && pointInPolygon({ x, z: bounds.z + bounds.depth }, polygon)) covered.push([b.y, b.y + b.height]);
          } else if (x >= b.x - EPSILON && x <= b.x + b.width + EPSILON && bounds.z >= b.z - EPSILON && bounds.z + bounds.depth <= b.z + b.depth + EPSILON) covered.push([b.y, b.y + b.height]);
        }
        if (intervalsCover(bounds.y, bounds.height, covered)) part.edges[edge] = 0;
      }
    } else if (part.role === 'brace') {
      const rectangle = [{ x: bounds.x, z: bounds.z }, { x: bounds.x + bounds.width, z: bounds.z },
        { x: bounds.x + bounds.width, z: bounds.z + bounds.depth }, { x: bounds.x, z: bounds.z + bounds.depth }];
      for (const edge of ['top', 'bottom']) {
        const y = bounds.y + (edge === 'top' ? bounds.height : 0);
        const covered = structural.some(other => {
          if (other === part || other.orientation !== 'horizontal') return false;
          const b = finishedPanelBounds(other), surface = edge === 'top' ? b.y : b.y + b.height;
          return Math.abs(surface - y) <= EPSILON && polygonContained(rectangle, finishedHorizontalPolygon(other));
        });
        if (covered) part.edges[edge] = 0;
      }
    } else if (part.name === 'Возвратная боковина выреза') {
      // For vertical-depth panels the existing part convention names the
      // front long edge "left". A rear return ends at the recessed rear wall.
      const z = bounds.z + bounds.depth, covered = [];
      for (const other of structural) {
        if (other === part) continue;
        const b = finishedPanelBounds(other);
        if (['back', 'section-back'].includes(other.role) && Math.abs(b.z - z) <= EPSILON && b.x <= bounds.x + EPSILON && b.x + b.width >= bounds.x + bounds.width - EPSILON) covered.push([b.y, b.y + b.height]);
        else if (other.orientation === 'horizontal') {
          const polygon = finishedHorizontalPolygon(other);
          if (pointInPolygon({ x: bounds.x, z }, polygon) && pointInPolygon({ x: bounds.x + bounds.width, z }, polygon)) covered.push([b.y, b.y + b.height]);
        }
      }
      if (intervalsCover(bounds.y, bounds.height, covered)) part.edges.left = 0;
    }
  }
}

function finishCutBlank(part, deductEdge) {
  const left = deductEdge ? part.edges.left : 0, right = deductEdge ? part.edges.right : 0;
  const top = deductEdge ? part.edges.top : 0, bottom = deductEdge ? part.edges.bottom : 0;
  part.width = round(part.finishedWidth - left - right);
  part.height = round(part.finishedHeight - top - bottom);
  if (part.finishedOutline) {
    // Only selected exterior bounds move inward. Internal rear-notch
    // coordinates stay unchanged apart from the blank's translated origin.
    part.outline = part.finishedOutline.map(point => ({ x: Math.max(0, Math.min(part.width, point.x - left)), y: Math.max(0, Math.min(part.height, point.y - top)) }));
    part.area = contourArea(part.outline);
  } else part.area = Math.max(0, part.width) * Math.max(0, part.height);
}

function contourArea(outline) {
  return Math.abs(outline.reduce((sum, point, index) => { const next = outline[(index + 1) % outline.length]; return sum + point.x * next.y - next.x * point.y; }, 0)) / 2;
}

function mergeIntervals(intervals, tolerance = EPSILON) {
  const merged = [];
  for (const source of intervals.filter(interval => interval.width > EPSILON).sort((a, b) => a.x - b.x)) {
    const last = merged.at(-1);
    if (last && source.x <= last.x + last.width + tolerance) last.width = Math.max(last.width, source.x + source.width - last.x);
    else merged.push({ ...source });
  }
  return merged;
}

function mergeLevelIntervals(intervals, tolerance = EPSILON) {
  const merged = [];
  for (const source of intervals.filter(item => item.width > EPSILON).sort((a, b) => a.x - b.x)) {
    const last = merged.at(-1), ids = source.sectionIds ?? [];
    if (last && Math.abs(last.y - source.y) < EPSILON && source.x <= last.x + last.width + tolerance) {
      last.width = Math.max(last.width, source.x + source.width - last.x);
      last.sectionIds = [...new Set([...last.sectionIds, ...ids])];
    } else merged.push({ ...source, sectionIds: [...ids] });
  }
  return merged.map(item => ({ ...item, ...(item.sectionIds.length === 1 ? { sectionId: item.sectionIds[0] } : {}) }));
}

function retainedFloorIntervals(cabinet, layout, thickness) {
  const left = thickness, right = number(cabinet.width) - thickness;
  const cuts = mergeIntervals((layout?.sections ?? []).filter(section => section.floorEligible && !section.hasBottom).map(section => {
    const before = layout.partitions.some(partition => partition.axis === 'vertical' && partition.y <= section.y + EPSILON && Math.abs(partition.x + partition.width - section.x) < EPSILON) ? thickness : 0;
    const after = layout.partitions.some(partition => partition.axis === 'vertical' && partition.y <= section.y + EPSILON && Math.abs(partition.x - section.x - section.width) < EPSILON) ? thickness : 0;
    const x = Math.max(left, section.x - before), end = Math.min(right, section.x + section.width + after);
    return { x, width: end - x };
  }));
  const result = []; let cursor = left;
  for (const cut of cuts) { if (cut.x > cursor + EPSILON) result.push({ x: cursor, width: cut.x - cursor }); cursor = Math.max(cursor, cut.x + cut.width); }
  if (cursor < right - EPSILON) result.push({ x: cursor, width: right - cursor });
  if (!layout) return result;
  const closed = layout.sections.filter(section => section.hasBottom);
  const strips = [];
  for (const interval of result) {
    const end = interval.x + interval.width;
    const breaks = [...new Set([interval.x, end, ...closed.flatMap(section => [section.x, section.x + section.width])].filter(x => x >= interval.x && x <= end))].sort((a, b) => a - b);
    for (let index = 0; index < breaks.length - 1; index++) {
      const x = breaks[index], width = breaks[index + 1] - x, center = x + width / 2;
      let sections = closed.filter(section => center >= section.x - EPSILON && center <= section.x + section.width + EPSILON);
      if (!sections.length) sections = closed.filter(section => Math.abs(section.x - breaks[index + 1]) < EPSILON || Math.abs(section.x + section.width - x) < EPSILON);
      const y = sections.length ? Math.min(...sections.map(section => section.bottomPanelY)) : 0;
      strips.push({ x, width, y, sectionIds: sections.filter(section => Math.abs(section.bottomPanelY - y) < EPSILON).map(section => section.id) });
    }
  }
  return mergeLevelIntervals(strips);
}

function sectionRearSegments(cabinet, section, thickness, back) {
  if (!cabinet.cutout) return [{ x: section.x, width: section.width, z: back }];
  const width = number(cabinet.width), cw = number(cabinet.cutout.width), cd = number(cabinet.cutout.depth);
  const left = section.x, right = section.x + section.width;
  const spans = cabinet.cutout.corner === 'back-right'
    ? [[left, Math.min(right, width - cw - thickness), back], [Math.max(left, width - cw), right, cd + back]]
    : [[Math.max(left, cw + thickness), right, back], [left, Math.min(right, cw), cd + back]];
  return spans.filter(([a, b]) => b - a > EPSILON).map(([a, b, z]) => ({ x: a, width: b - a, z }));
}

function rearBracePanels(cabinet, project, layout = cabinet.layout ? getCabinetLayout(cabinet, project) : null) {
  const panels = [], thickness = bodyThickness(cabinet, project), width = number(cabinet.width), back = backThickness(cabinet, project);
  const braces = Array.isArray(cabinet.rearBraces) ? cabinet.rearBraces.slice(0, 20) : [];
  for (const brace of braces) {
    if (!brace || !positive(brace.height)) continue;
    const materialId = brace.materialId ?? cabinet.materialId;
    const panelThickness = number(stockById(project, materialId)?.thickness, thickness);
    const common = { braceId: brace.id, braceBaseY: -number(cabinet.plinth), y: number(brace.y) - number(cabinet.plinth), height: number(brace.height), thickness: panelThickness, materialId };
    if (!cabinet.cutout) panels.push({ ...common, x: thickness, z: back, width: width - 2 * thickness });
    else {
      const cw = number(cabinet.cutout.width), cd = number(cabinet.cutout.depth), right = cabinet.cutout.corner === 'back-right';
      panels.push({ ...common, x: right ? thickness : cw + thickness, z: back, width: width - cw - 2 * thickness });
      panels.push({ ...common, x: right ? width - cw : thickness, z: cd + back, width: cw - thickness });
    }
  }
  for (const section of layout?.sections ?? []) {
    if (section.backMode !== 'braces') continue;
    for (const [localIndex, brace] of (Array.isArray(section.node.rearBraces) ? section.node.rearBraces.slice(0, 40) : []).entries()) {
      if (!brace || !positive(brace.height)) continue;
      const materialId = brace.materialId ?? cabinet.materialId;
      const common = { sectionId: section.id, localIndex, braceId: brace.id, braceBaseY: section.y, y: section.y + number(brace.y), height: number(brace.height), thickness: number(stockById(project, materialId)?.thickness, thickness), materialId };
      for (const segment of sectionRearSegments(cabinet, section, thickness, back)) panels.push({ ...common, ...segment });
    }
  }
  return panels.filter(panel => panel.width > 0);
}

function horizontalContour(cabinet, x, z, width, height, thickness, back) {
  const cutout = cabinet.cutout;
  if (!cutout || !positive(cutout.width) || !positive(cutout.depth)) return { x, z, width, height };
  const right = cutout.corner === 'back-right';
  const notchWidth = Math.max(0, Math.min(width, right ? x + width - (number(cabinet.width) - number(cutout.width) - thickness) : number(cutout.width) + thickness - x));
  const notchDepth = Math.max(0, Math.min(height, number(cutout.depth) + back - z));
  if (notchWidth <= 0 || notchDepth <= 0) return { x, z, width, height };
  if (notchWidth >= width - EPSILON) return { x, z: z + notchDepth, width, height: height - notchDepth };
  if (notchDepth >= height - EPSILON) return { x: x + (right ? 0 : notchWidth), z, width: width - notchWidth, height };
  const outline = right
    ? [{ x: 0, y: 0 }, { x: width - notchWidth, y: 0 }, { x: width - notchWidth, y: notchDepth }, { x: width, y: notchDepth }, { x: width, y: height }, { x: 0, y: height }]
    : [{ x: notchWidth, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }, { x: 0, y: notchDepth }, { x: notchWidth, y: notchDepth }];
  return { x, z, width, height, outline };
}

function boxesOverlap(a, b) {
  return number(a.x) < number(b.x) + number(b.width) - EPSILON && number(a.x) + number(a.width) > number(b.x) + EPSILON &&
    number(a.y) < number(b.y) + number(b.height) - EPSILON && number(a.y) + number(a.height) > number(b.y) + EPSILON &&
    number(a.z) < number(b.z) + number(b.depth) - EPSILON && number(a.z) + number(a.depth) > number(b.z) + EPSILON;
}

function verticalOverlap(a, b) {
  return number(a.y) < number(b.y) + number(b.height) - EPSILON && number(a.y) + number(a.height) > number(b.y) + EPSILON;
}

export function validateProject(project) {
  const warnings = [];
  const add = (level, message, cabinetId) => warnings.push({ level, message, ...(cabinetId ? { cabinetId } : {}) });
  const room = project?.room ?? {};
  for (const [key, label] of [['width', 'ширина'], ['depth', 'глубина'], ['height', 'высота']]) {
    if (!positive(room[key])) add('error', `Помещение: ${label} должна быть больше нуля.`);
  }
  if (!Number.isFinite(Number(room.wallThickness)) || number(room.wallThickness) <= 0) add('error', 'Толщина стен должна быть больше нуля.');
  if (number(room.wallThickness) * 2 >= Math.min(number(room.width), number(room.depth))) add('error', 'Толщина стен слишком велика относительно ширины или глубины помещения.');
  if (room.installationClearance !== undefined && (!room.installationClearance || typeof room.installationClearance !== 'object' || Array.isArray(room.installationClearance) || ['walls', 'ceiling'].some(key => !Number.isFinite(room.installationClearance[key]) || room.installationClearance[key] < 0 || room.installationClearance[key] > 1000))) add('error', 'Монтажные отступы комнаты от стен и потолка должны быть числами от 0 до 1000 мм.');
  const roomOutline = getRoomOutline(room);
  if (room.outline !== undefined && (!Array.isArray(room.outline) || room.outline.length < 3 || room.outline.length > 40 || !polygonIsSimple(room.outline))) add('error', 'Контур помещения должен быть простым многоугольником из 3–40 вершин без пересечений.');
  const materials = project?.materials ?? [];
  const materialIds = new Set();
  for (const material of materials) {
    if (!material.id || materialIds.has(material.id)) add('error', 'У каждого материала должен быть уникальный идентификатор.');
    materialIds.add(material.id);
    if (!positive(material.thickness) || !positive(material.sheetWidth) || !positive(material.sheetHeight)) add('error', `Материал «${material.name}»: проверьте толщину и размеры листа.`);
    if (material.edgeBand !== undefined && (!Number.isFinite(Number(material.edgeBand)) || number(material.edgeBand) < 0)) add('error', `Материал «${material.name}»: толщина кромки должна быть неотрицательной.`);
  }
  if (!materials.length) add('error', 'Добавьте хотя бы один листовой материал.');
  const settings = project?.settings ?? {};
  for (const [key, label] of [['kerf', 'Пропил'], ['margin', 'Отступ от края листа']]) {
    if (!Number.isFinite(Number(settings[key])) || number(settings[key]) < 0) add('error', `${label} должен быть неотрицательным числом.`);
  }
  for (const material of materials) {
    if (2 * number(settings.margin) >= Math.min(number(material.sheetWidth), number(material.sheetHeight))) add('error', `Отступ от края исключает полезную площадь листа «${material.name}».`);
  }
  const cabinets = project?.cabinets ?? [];
  const cabinetIds = new Set();
  for (const cabinet of cabinets) {
    const prefix = `«${cabinet.name ?? 'Шкаф'}»`;
    const error = message => add('error', `${prefix}: ${message}`, cabinet.id);
    const warn = message => add('warning', `${prefix}: ${message}`, cabinet.id);
    if (!cabinet.id || cabinetIds.has(cabinet.id)) error('идентификатор должен быть уникальным.');
    cabinetIds.add(cabinet.id);
    if (!['base', 'wall', 'tall'].includes(cabinet.type)) error('выбран неизвестный тип шкафа.');
    if (cabinet.rotation !== undefined && (!Number.isFinite(cabinet.rotation) || Math.abs(cabinet.rotation) > 180)) error('поворот должен быть от −180 до 180 градусов.');
    if (cabinet.includeBack !== undefined && typeof cabinet.includeBack !== 'boolean') error('состояние задней стенки должно быть логическим.');
    if (cabinet.includeBottom !== undefined && typeof cabinet.includeBottom !== 'boolean') error('состояние нижней панели должно быть логическим.');
    if (cabinet.sidesToFloor !== undefined && typeof cabinet.sidesToFloor !== 'boolean') error('боковины до пола должны быть включены или выключены.');
    if (cabinet.openingMechanism !== undefined && !['handle', 'push'].includes(cabinet.openingMechanism)) error('механизм открывания должен быть handle или push.');
    if (cabinet.hingesPerDoor !== undefined && (!Number.isInteger(cabinet.hingesPerDoor) || cabinet.hingesPerDoor < 2 || cabinet.hingesPerDoor > 12)) error('число петель на дверь должно быть целым числом от 2 до 12.');
    let layoutValid = true;
    if (cabinet.layout) { try { validateLayoutSchema(cabinet.layout, { materialIds }); } catch (problem) { error(problem.message); layoutValid = false; } }
    try { validateDoorOpenings(cabinet.doorOpenings, cabinet.doors ?? 0); } catch (problem) { error(problem.message); }
    const layout = cabinet.layout && layoutValid ? getCabinetLayout(cabinet, project) : null;
    const hasDrawers = layout ? layout.sections.some(section => section.node.front === 'drawers' || !section.node.interiorLayout && section.node.internalDrawerCount > 0) || layout.internalSections.some(section => section.node.front === 'drawers') : integer(cabinet.drawers) > 0;
    for (const [key, label] of [['width', 'ширина'], ['height', 'высота'], ['depth', 'глубина']]) {
      if (!positive(cabinet[key])) error(`${label} должна быть больше нуля.`);
    }
    for (const [key, label] of [['x', 'X'], ['y', 'высота установки'], ['z', 'Z'], ['plinth', 'цоколь'], ['gap', 'зазор'], ['drawerSlideGap', 'зазор направляющей'], ['edgeBand', 'толщина кромки']]) {
      const signedCoordinate = room.outline && (key === 'x' || key === 'z');
      if (!Number.isFinite(Number(cabinet[key])) || !signedCoordinate && number(cabinet[key]) < 0) error(`${label} должен быть ${signedCoordinate ? 'конечным' : 'неотрицательным'} числом.`);
    }
    for (const [key, limit, label] of [['doors', 12, 'число дверей'], ['drawers', 20, 'число ящиков'], ['shelves', 40, 'число полок']]) {
      if (cabinet.layout && cabinet[key] === undefined) continue;
      const value = Number(cabinet[key]);
      if (!Number.isInteger(value) || value < 0 || value > limit) error(`${label} должно быть целым числом от 0 до ${limit}.`);
    }
    if (!cabinet.layout && integer(cabinet.drawers) > 0 && integer(cabinet.doors) === 0 && integer(cabinet.shelves) > 0) error('в секции только с ящиками полки пересекают короба; установите число полок 0.');
    for (const key of ['materialId', 'backMaterialId', 'frontMaterialId']) {
      if (!materialIds.has(cabinet[key] ?? (key === 'frontMaterialId' ? cabinet.materialId : undefined))) error('выбран отсутствующий материал.');
    }
    if (hasDrawers) {
      for (const key of ['drawerMaterialId', 'drawerBottomMaterialId']) {
        const id = cabinet[key] ?? (key === 'drawerMaterialId' ? cabinet.materialId : cabinet.backMaterialId);
        if (!materialIds.has(id)) error('выбран отсутствующий материал ящика.');
      }
    }
    const thickness = bodyThickness(cabinet, project ?? {});
    const bodyHeight = number(cabinet.height) - number(cabinet.plinth);
    const insideWidth = number(cabinet.width) - 2 * thickness;
    const bodyDepth = number(cabinet.depth) - backThickness(cabinet, project ?? {});
    if (insideWidth <= 4 || bodyHeight <= thickness * (cabinet.includeBottom === false ? 1 : 2) || bodyDepth <= 20) error('для такой толщины материала недостаточно внутреннего пространства.');
    if (cabinet.rearBraces !== undefined && (!Array.isArray(cabinet.rearBraces) || cabinet.rearBraces.length > 20)) error('допустимо не более 20 задних перемычек.');
    const braceIds = new Set();
    for (const brace of Array.isArray(cabinet.rearBraces) ? cabinet.rearBraces : []) {
      if (!brace || typeof brace.id !== 'string' || !brace.id.trim() || braceIds.has(brace.id)) { error('у задних перемычек должны быть уникальные идентификаторы.'); continue; }
      braceIds.add(brace.id);
      if (!Number.isFinite(brace.y) || brace.y < 0 || !positive(brace.height) || brace.y + brace.height > number(cabinet.height) + EPSILON) error('задняя перемычка выходит за высоту шкафа; положение задаётся от низа всего шкафа.');
      if (!materialIds.has(brace.materialId ?? cabinet.materialId)) error('материал задней перемычки не найден.');
    }
    for (const section of layout?.sections ?? []) if (section.backMode === 'braces') {
      for (const brace of section.node.rearBraces ?? []) {
        if (brace.y + brace.height > section.height + EPSILON) error(`задняя перемычка выходит за высоту секции «${section.node.name ?? section.id}»; положение задаётся от низа чистого проёма.`);
        if (!materialIds.has(brace.materialId ?? cabinet.materialId)) error('материал задней перемычки не найден.');
      }
    }
    const bracePanels = rearBracePanels(cabinet, project, layout);
    for (const panel of bracePanels) {
      const section = layout?.sections.find(item => item.id === panel.sectionId);
      if (panel.z + panel.thickness > (section ? backThickness(cabinet, project) + section.depth : number(cabinet.depth)) + EPSILON) error('задняя перемычка не помещается по глубине корпуса или секции.');
    }
    for (let index = 0; index < bracePanels.length; index++) for (let next = index + 1; next < bracePanels.length; next++) {
      const a = bracePanels[index], b = bracePanels[next];
      if ((a.braceId !== b.braceId || a.sectionId !== b.sectionId) && boxesOverlap({ ...a, depth: a.thickness }, { ...b, depth: b.thickness })) error('задние перемычки пересекаются; измените их положение или высоту.');
    }
    if (!positive(cabinet.backThickness)) error('толщина задней стенки должна быть больше нуля.');
    const placement = validateCabinetPlacement(cabinet, project);
    if (number(cabinet.y) + number(cabinet.height) > number(room.height) + EPSILON || !placement.contained) error('мебель выходит за границы помещения с учётом толщины фасада, поворота и выреза.');
    if (placement.contained && placement.deficits.walls > EPSILON) warn(`до стены не хватает ${placement.deficits.walls} мм монтажного отступа (нужно ${placement.required.walls}, доступно ${round(placement.wallClearance)} мм).`);
    if (placement.ceilingClearance >= -EPSILON && placement.deficits.ceiling > EPSILON) warn(`до потолка не хватает ${placement.deficits.ceiling} мм монтажного отступа (нужно ${placement.required.ceiling}, доступно ${round(placement.ceilingClearance)} мм).`);
    if (cabinet.cutout && (!['back-left', 'back-right'].includes(cabinet.cutout.corner) || !positive(cabinet.cutout.width) || !positive(cabinet.cutout.depth) || cabinet.cutout.width >= number(cabinet.width) - 2 * thickness || cabinet.cutout.depth >= number(cabinet.depth) - 2 * thickness)) error('вырез должен быть меньше корпуса с сохранением толщины боковин.');
    const shelfAreaHeight = integer(cabinet.drawers) > 0 && integer(cabinet.doors) > 0 ? number(getFrontLayout(cabinet).find(front => front.kind === 'door')?.height) : bodyHeight;
    if (integer(cabinet.shelves) > 0 && (shelfAreaHeight - 2 * thickness) / (integer(cabinet.shelves) + 1) < 80) warn('между полками остаётся менее 80 мм; проверьте полезную высоту секции дверей.');
    if (!layout && integer(cabinet.shelves) > 0 && insideWidth > 1000) warn('пролёт полки больше 1000 мм; требуется проверить прогиб и предусмотреть перегородку или опоры.');
    for (const section of [...layout?.sections ?? [], ...layout?.internalSections ?? []]) {
      const sectionName = section.node.name ?? section.id;
      if (section.width < 50 || section.height < 50 || section.usableDepth < 50) error(`секция «${sectionName}» слишком мала; требуется хотя бы 50 мм полезного размера.`);
      const depthLimit = section.parentSectionId ? layout.sections.find(item => item.id === section.parentSectionId).depth : bodyDepth;
      if (section.node.depth !== null && section.node.depth !== undefined && section.node.depth > depthLimit) error(`глубина секции «${sectionName}» превышает корпус или внешний проём.`);
      if (section.node.floor === 'open' && !section.floorEligible) warn(`секция «${sectionName}» не касается основания корпуса; открытый проём до пола применяется только к нижней секции.`);
      if (section.node.plinthHeight != null && !section.floorEligible) warn(`секция «${sectionName}» не касается основания корпуса; собственный цоколь применяется только к нижней секции.`);
      if (section.node.pullOutShelf && (section.node.front !== 'open' || section.width - 2 * number(cabinet.drawerSlideGap, 13) < 50 || section.usableDepth - 40 < 50 || section.height < thickness + 5)) error(`выдвижная полка не помещается в открытую секцию «${sectionName}».`);
      if (section.node.front === 'drawers' && integer(section.node.shelves) > 0) error(`полки секции «${sectionName}» пересекают короба ящиков.`);
      if (!section.node.interiorLayout && section.node.internalDrawerCount > 0 && integer(section.node.shelves) > 0) error(`полки секции «${sectionName}» пересекают внутренние ящики за дверями.`);
      if (section.node.interiorLayout && (integer(section.node.shelves) > 0 || section.node.pullOutShelf)) error(`полки секции «${sectionName}» пересекают внутреннее наполнение; задайте их во внутренних отсеках.`);
      if (section.node.rods?.length && (section.node.front === 'drawers' || section.node.appliance || section.node.interiorLayout)) error(`штанги в секции «${sectionName}» требуют открытого или дверного проёма без техники; при внутреннем наполнении задайте штангу во внутреннем отсеке.`);
      if (integer(section.node.shelves) > 0 && section.width > 1000) warn(`пролёт полки секции «${sectionName}» больше 1000 мм; проверьте прогиб и опоры.`);
      if (integer(section.node.shelves) > 0 && section.height / (integer(section.node.shelves) + 1) < 80) warn(`между полками секции «${sectionName}» остаётся менее 80 мм.`);
      if (section.node.appliance) {
        const appliance = section.node.appliance;
        const fit = getApplianceFit(section, appliance);
        for (const [axis, label] of [['width', 'ширине'], ['height', 'высоте'], ['depth', 'глубине']]) {
          if (fit.deficits[axis] <= EPSILON) continue;
          const physicalDeficit = round(number(appliance[axis]) - fit.available[axis]);
          if (physicalDeficit > EPSILON) error(`техника «${appliance.label ?? appliance.type}» не помещается в секцию «${sectionName}» по ${label}: не хватает ${physicalDeficit} мм (нужно ${round(number(appliance[axis]))}, доступно ${round(fit.available[axis])} мм).`);
          else warn(`для монтажного зазора техники «${appliance.label ?? appliance.type}» в секции «${sectionName}» по ${label} не хватает ${fit.deficits[axis]} мм (нужно ${round(fit.required[axis])}, доступно ${round(fit.available[axis])} мм).`);
        }
        if (section.node.front !== 'open' || integer(section.node.shelves) > 0) error(`для техники в секции «${sectionName}» требуется открытая ниша без полок.`);
        if (section.node.pullOutShelf) error(`выдвижная полка секции «${sectionName}» пересекает основание техники; поместите её в отдельный проём.`);
        const machineX = section.x + (section.width - appliance.width) / 2;
        const machineZ = backThickness(cabinet, project) + section.rearOffset + Math.max(0, section.usableDepth - appliance.depth);
        for (const panel of bracePanels) if (machineX < panel.x + panel.width - EPSILON && machineX + appliance.width > panel.x + EPSILON && section.y < panel.y + panel.height - EPSILON && section.y + appliance.height > panel.y + EPSILON && machineZ < panel.z + panel.thickness - EPSILON && machineZ + appliance.depth > panel.z + EPSILON) error(`задняя перемычка пересекает технику «${appliance.label ?? appliance.type}» в секции «${sectionName}».`);
      }
    }
    for (const front of getFrontLayout(cabinet, project)) {
      const section = layout?.sections.find(item => item.id === front.sectionId);
      if (front.width <= 0 || front.height <= 0) error('фасады не помещаются при заданном числе и зазорах.');
      if (front.kind === 'drawer' && (front.height <= 40 + bottomThickness(cabinet, project ?? {}) || (section?.width ?? insideWidth) - 2 * number(cabinet.drawerSlideGap, 13) <= 2 * drawerThickness(cabinet, project ?? {}) || (section?.usableDepth ?? bodyDepth - number(cabinet.cutout?.depth)) - 40 <= 2 * drawerThickness(cabinet, project ?? {}))) error('короб ящика не помещается; увеличьте размеры или уменьшите число ящиков.');
    }
    if (layout) for (const front of getInternalDrawerLayout(cabinet, project)) {
      if (front.width <= 0 || front.height <= 0 || front.depth <= 0 || front.box.width <= 2 * front.box.panelThickness || front.box.height <= 0 || front.box.depth <= 2 * front.box.panelThickness) error('внутренний ящик за дверями не помещается с учётом отступа для петель; увеличьте проём или уменьшите число ящиков.');
    }
    if (layout) {
      const rods = getRodLayout(cabinet, project), rodIssues = getRodLimits(rods).filter(limit => limit.required > limit.available + EPSILON);
      for (const sectionId of new Set(rodIssues.map(issue => issue.sectionId))) {
        const section = [...layout.sections, ...layout.internalSections].find(item => item.id === sectionId);
        error(`штанга не помещается в секцию «${section?.node.name ?? sectionId}» с учётом диаметра и торцевых зазоров 2 мм; проверьте длину, высоту и отступ от фасада.`);
      }
      const collisions = getRodCollisions(cabinet, project);
      const reported = new Set();
      for (const collision of collisions) {
        const key = `${collision.interiorSectionId ?? collision.sectionId}/${collision.kind}`;
        if (reported.has(key)) continue;
        reported.add(key);
        const section = [...layout.sections, ...layout.internalSections].find(item => item.id === (collision.interiorSectionId ?? collision.sectionId));
        const target = { panel: 'панелью', appliance: 'техникой', drawer: 'коробом ящика', rod: 'другой штангой' }[collision.kind];
        error(`штанга в секции «${section?.node.name ?? section?.id}» пересекается с ${target}; измените её высоту, длину или отступ от фасада.`);
      }
    }
    const backStock = stockById(project ?? {}, cabinet.backMaterialId);
    if (cabinet.includeBack !== false && backStock && Math.abs(number(backStock.thickness) - backThickness(cabinet, project ?? {})) > EPSILON) warn('толщина задней стенки отличается от выбранного материала; потребуется отдельный лист этой толщины.');
    if (hasDrawers) {
      if (!positive(cabinet.drawerBottomThickness)) error('толщина дна ящика должна быть больше нуля.');
      const bottomStock = stockById(project ?? {}, cabinet.drawerBottomMaterialId ?? cabinet.backMaterialId);
      if (bottomStock && Math.abs(number(bottomStock.thickness) - bottomThickness(cabinet, project ?? {})) > EPSILON) warn('толщина дна ящика отличается от выбранного материала; потребуется отдельный лист этой толщины.');
    }
    if (project?.settings?.deductEdge && generateParts({ ...project, cabinets: [cabinet] }).some(part => !positive(part.width) || !positive(part.height))) error('для такой толщины материала недостаточно внутреннего пространства.');
  }
  for (let index = 0; index < cabinets.length; index++) {
    for (let next = index + 1; next < cabinets.length; next++) {
      if (verticalOverlap(cabinets[index], cabinets[next]) && polygonsOverlap(cabinetFootprint(physicalCabinet(cabinets[index], project)), cabinetFootprint(physicalCabinet(cabinets[next], project)))) add('error', `«${cabinets[index].name}» пересекается с «${cabinets[next].name}».`, cabinets[index].id);
    }
  }
  for (const window of room.windows ?? []) {
    if (window.kind !== undefined && !['window', 'door'].includes(window.kind)) add('error', 'Проём: неизвестный вид.');
    if (window.kind === 'door' && number(window.sill) !== 0) add('warning', 'Дверной проём должен начинаться от пола: задайте высоту подоконника 0 мм.');
    const wallIndex = window.wallIndex ?? ({ back: 0, right: 1, front: 2, left: 3 })[window.wall];
    if (wallIndex !== undefined) {
      if (!Number.isInteger(wallIndex) || wallIndex < 0 || wallIndex >= roomOutline.length) { add('error', 'У оконного проёма должна быть выбрана существующая стена.'); continue; }
      const length = wallLength(room, wallIndex);
      if (!positive(window.width) || !positive(window.height) || !Number.isFinite(Number(window.offset)) || number(window.offset) < 0 || !Number.isFinite(Number(window.sill)) || number(window.sill) < 0) add('error', 'Оконный проём: проверьте размеры, отступ и высоту подоконника.');
      if (number(window.offset) + number(window.width) > length + EPSILON || number(window.sill) + number(window.height) > number(room.height) + EPSILON) add('error', 'Оконный проём выходит за границы стены.');
      const a = roomOutline[wallIndex], b = roomOutline[(wallIndex + 1) % roomOutline.length];
      const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
      for (const cabinet of cabinets) {
        const points = cabinetFootprint(physicalCabinet(cabinet, project));
        const projections = points.map(point => (point.x - a.x) * ux + (point.z - a.z) * uz);
        const near = points.some(point => Math.abs((point.x - a.x) * uz - (point.z - a.z) * ux) < 50);
        if (near && Math.min(...projections) < number(window.offset) + number(window.width) && Math.max(...projections) > number(window.offset) && number(cabinet.y) < number(window.sill) + number(window.height) && number(cabinet.y) + number(cabinet.height) > number(window.sill)) add('warning', `«${cabinet.name}» перекрывает оконный проём.`, cabinet.id);
      }
      continue;
    }
    add('error', 'У оконного проёма должна быть выбрана стена.');
  }
  return warnings;
}

function intersects(a, b) {
  return a.x < b.x + b.width - EPSILON && a.x + a.width > b.x + EPSILON && a.y < b.y + b.height - EPSILON && a.y + a.height > b.y + EPSILON;
}

function contains(a, b) {
  return b.x >= a.x - EPSILON && b.y >= a.y - EPSILON && b.x + b.width <= a.x + a.width + EPSILON && b.y + b.height <= a.y + a.height + EPSILON;
}

function occupy(sheet, footprint) {
  const free = [];
  for (const rectangle of sheet.freeRects) {
    if (!intersects(rectangle, footprint)) { free.push(rectangle); continue; }
    if (footprint.x > rectangle.x + EPSILON) free.push({ x: rectangle.x, y: rectangle.y, width: footprint.x - rectangle.x, height: rectangle.height });
    if (footprint.x + footprint.width < rectangle.x + rectangle.width - EPSILON) free.push({ x: footprint.x + footprint.width, y: rectangle.y, width: rectangle.x + rectangle.width - footprint.x - footprint.width, height: rectangle.height });
    if (footprint.y > rectangle.y + EPSILON) free.push({ x: rectangle.x, y: rectangle.y, width: rectangle.width, height: footprint.y - rectangle.y });
    if (footprint.y + footprint.height < rectangle.y + rectangle.height - EPSILON) free.push({ x: rectangle.x, y: footprint.y + footprint.height, width: rectangle.width, height: rectangle.y + rectangle.height - footprint.y - footprint.height });
  }
  sheet.freeRects = free.filter((rectangle, index) => rectangle.width > EPSILON && rectangle.height > EPSILON && !free.some((other, otherIndex) => otherIndex !== index && contains(other, rectangle) && (!contains(rectangle, other) || otherIndex < index)));
}

function findPlacement(sheet, part, allowRotate, kerf) {
  let best;
  const orientations = [{ width: part.width, height: part.height, rotated: false }];
  if (allowRotate && !part.grain && Math.abs(part.width - part.height) > EPSILON) orientations.push({ width: part.height, height: part.width, rotated: true });
  for (const rectangle of sheet.freeRects) {
    for (const orientation of orientations) {
      const width = orientation.width + kerf;
      const height = orientation.height + kerf;
      if (width > rectangle.width + EPSILON || height > rectangle.height + EPSILON) continue;
      const score = [Math.min(rectangle.width - width, rectangle.height - height), Math.max(rectangle.width - width, rectangle.height - height), rectangle.y, rectangle.x, Number(orientation.rotated)];
      if (!best || score.some((value, index) => value < best.score[index] - EPSILON && score.slice(0, index).every((previous, priorIndex) => Math.abs(previous - best.score[priorIndex]) <= EPSILON))) best = { ...orientation, x: rectangle.x, y: rectangle.y, score };
    }
  }
  return best;
}

/** MaxRects nesting with explicit kerf footprints and material/thickness groups. */
export function optimizeCutting(parts = [], materials = [], settings = {}) {
  const margin = Math.max(0, number(settings.margin, 10));
  const kerf = Math.max(0, number(settings.kerf, 3));
  const allowRotate = settings.allowRotate !== false;
  const materialMap = new Map(materials.map(material => [material.id, material]));
  const groups = new Map();
  const sheets = [];
  const unplaced = [];
  const reject = (part, reason) => unplaced.push({ partId: part.id, label: `${part.cabinetName ?? ''} · ${part.name ?? part.id}`, materialId: part.materialId, thickness: part.thickness, width: part.width, height: part.height, reason });
  for (const source of parts) {
    const part = { ...source, width: Number(source.width), height: Number(source.height), thickness: Number(source.thickness) };
    const stock = materialMap.get(part.materialId);
    if (!stock) { reject(part, 'Материал не найден.'); continue; }
    if (![part.width, part.height, part.thickness].every(positive)) { reject(part, 'Некорректные размеры детали.'); continue; }
    const usableWidth = number(stock.sheetWidth) - 2 * margin;
    const usableHeight = number(stock.sheetHeight) - 2 * margin;
    const fits = part.width <= usableWidth + EPSILON && part.height <= usableHeight + EPSILON;
    const rotatedFits = allowRotate && !part.grain && part.height <= usableWidth + EPSILON && part.width <= usableHeight + EPSILON;
    if (!fits && !rotatedFits) { reject(part, 'Деталь не помещается на листе с учётом отступа и направления текстуры.'); continue; }
    const key = `${part.materialId}\u0000${part.thickness}`;
    if (!groups.has(key)) groups.set(key, { stock, thickness: part.thickness, parts: [] });
    groups.get(key).parts.push(part);
  }
  for (const group of groups.values()) {
    const groupSheets = [];
    group.parts.sort((a, b) => b.width * b.height - a.width * a.height || Math.max(b.width, b.height) - Math.max(a.width, a.height) || String(a.id).localeCompare(String(b.id)));
    for (const part of group.parts) {
      let selectedSheet;
      let placement;
      for (const sheet of groupSheets) {
        const candidate = findPlacement(sheet, part, allowRotate, kerf);
        if (candidate) { selectedSheet = sheet; placement = candidate; break; }
      }
      if (!selectedSheet) {
        const width = number(group.stock.sheetWidth);
        const height = number(group.stock.sheetHeight);
        selectedSheet = {
          id: `sheet-${sheets.length + 1}`, materialId: group.stock.id, materialName: group.stock.name, thickness: group.thickness,
          width, height, placements: [], usedArea: 0,
          freeRects: [{ x: margin, y: margin, width: width - 2 * margin + kerf, height: height - 2 * margin + kerf }]
        };
        placement = findPlacement(selectedSheet, part, allowRotate, kerf);
        if (!placement) { reject(part, 'Деталь не помещается на листе.'); continue; }
        groupSheets.push(selectedSheet);
        sheets.push(selectedSheet);
      }
      selectedSheet.placements.push({ partId: part.id, label: `${part.cabinetName ?? ''} · ${part.name ?? part.id}`, x: round(placement.x), y: round(placement.y), width: round(placement.width), height: round(placement.height), rotated: placement.rotated, ...(part.outline ? { outline: part.outline.map(point => placement.rotated ? { x: part.height - point.y, y: point.x } : { ...point }) } : {}) });
      selectedSheet.usedArea += part.area ?? part.width * part.height;
      occupy(selectedSheet, { x: placement.x, y: placement.y, width: placement.width + kerf, height: placement.height + kerf });
    }
  }
  const stockArea = sheets.reduce((sum, sheet) => sum + sheet.width * sheet.height, 0);
  const usedArea = sheets.reduce((sum, sheet) => sum + sheet.usedArea, 0);
  return {
    sheets: sheets.map(({ freeRects, ...sheet }) => sheet), unplaced,
    totalSheets: sheets.length, totalParts: parts.length, placedParts: parts.length - unplaced.length,
    utilization: stockArea > 0 ? round(usedArea / stockArea * 100) : 0,
    wasteArea: Math.max(0, stockArea - usedArea), usedArea, stockArea
  };
}

/** Selected external edges only; internal notch edges need explicit detailing. */
export function getPartEdgeBanding(part) {
  const width = Math.max(0, number(part.finishedWidth, number(part.width)));
  const height = Math.max(0, number(part.finishedHeight, number(part.height)));
  const quantity = Math.max(0, number(part.quantity, 1));
  const outline = part.finishedOutline ?? part.outline;
  const meters = mm => mm / 1000;
  const edges = {};
  for (const edge of ['top', 'bottom', 'left', 'right']) {
    const thickness = Math.max(0, number(part.edges?.[edge]));
    let length = thickness > 0 ? (edge === 'top' || edge === 'bottom' ? width : height) : 0;
    if (thickness > 0 && Array.isArray(outline) && outline.length > 2) {
      const horizontal = edge === 'top' || edge === 'bottom';
      const coordinate = horizontal ? 'y' : 'x';
      const bound = edge === 'top' || edge === 'left' ? 0 : horizontal ? height : width;
      length = outline.reduce((sum, a, index) => {
        const b = outline[(index + 1) % outline.length];
        return Math.abs(a[coordinate] - bound) <= EPSILON && Math.abs(b[coordinate] - bound) <= EPSILON
          ? sum + Math.hypot(b.x - a.x, b.y - a.y) : sum;
      }, 0);
    }
    const lengthMm = round(length * quantity);
    edges[edge] = { thickness, lengthMm, lengthMeters: meters(lengthMm) };
  }
  const lengthMm = round(Object.values(edges).reduce((sum, edge) => sum + edge.lengthMm, 0));
  return { lengthMm, lengthMeters: meters(lengthMm), edges };
}

/** Separate stocks by panel material and the actual applied band thickness. */
export function getEdgeBandingSummary(parts) {
  const groups = new Map();
  for (const part of parts ?? []) {
    const result = getPartEdgeBanding(part), counted = new Set();
    for (const edge of Object.values(result.edges)) {
      if (edge.lengthMm <= 0) continue;
      const key = `${part.materialId}\u0000${edge.thickness}`;
      if (!groups.has(key)) groups.set(key, { materialId: part.materialId, thickness: edge.thickness, lengthMm: 0, lengthMeters: 0, partCount: 0 });
      const group = groups.get(key);
      group.lengthMm += edge.lengthMm;
      if (!counted.has(key)) { group.partCount += Math.max(0, number(part.quantity, 1)); counted.add(key); }
    }
  }
  const list = [...groups.values()].map(group => ({ ...group, lengthMm: round(group.lengthMm), lengthMeters: round(group.lengthMm) / 1000 }));
  const lengthMm = round(list.reduce((sum, group) => sum + group.lengthMm, 0));
  return { lengthMm, lengthMeters: lengthMm / 1000, groups: list };
}

export function getProjectStats(project) {
  const parts = generateParts(project);
  const cutting = optimizeCutting(parts, project?.materials ?? [], project?.settings ?? {});
  const edgeBanding = getEdgeBandingSummary(parts);
  return {
    cabinetCount: project?.cabinets?.length ?? 0, partCount: parts.length, totalParts: parts.length,
    totalArea: parts.reduce((sum, part) => sum + (part.area ?? part.width * part.height), 0) / 1e6,
    volume: parts.reduce((sum, part) => sum + (part.area ?? part.width * part.height) * part.thickness, 0) / 1e9,
    edgeLength: edgeBanding.lengthMeters, edgeBanding, sheetCount: cutting.totalSheets, totalSheets: cutting.totalSheets,
    utilization: cutting.utilization, wasteArea: cutting.wasteArea, parts, cutting, warnings: validateProject(project)
  };
}
