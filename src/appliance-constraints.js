/**
 * Pure guards for numeric cabinet edits. Panel, front, drawer and appliance
 * minimums are derived from the engine. Installation allowances never use a
 * universal washer/dryer size. Existing invalid openings may improve without
 * worsening another axis; they remain invalid until completely repaired.
 */
import { getCabinetLayout, getApplianceFit, getFrontLayout, getInternalDrawerLayout, validateProject, findLayoutNode, resizeSectionAdjacent, resizeDivider } from './engine.js';
import { getInteriorLayout, resizeInteriorSection, resizeInteriorDivider } from './cabinet-interior.js';

const AXES = ['width', 'height', 'depth'];
const TOLERANCE = 1e-7;
// Engine dimensions are rounded to 0.001 mm. This keeps rounded panels positive;
// it is a numerical boundary, not a workshop or hardware specification.
const POSITIVE_MINIMUM = 0.001;
const clone = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const lerp = (a, b, fraction) => a + (b - a) * fraction;

/** Actual clear openings, including open floors, back panels and rear notches. */
export function getApplianceRequirements(cabinet, project) {
  return getCabinetLayout(cabinet, project).sections.filter(section => section.node.appliance).map(section => {
    const fit = getApplianceFit(section, section.node.appliance);
    const deficits = Object.fromEntries(AXES.map(axis => [axis, Math.max(0, fit.required[axis] - fit.available[axis])]));
    return {
      sectionId: section.id, appliance: clone(section.node.appliance), ...fit, deficits,
      fits: AXES.every(axis => deficits[axis] <= TOLERANCE),
      floorOpen: section.floorOpen, rearOffset: section.rearOffset
    };
  });
}

function validGeometry(cabinet) {
  if (!cabinet || AXES.some(axis => !finite(cabinet[axis]))) return false;
  if (cabinet.plinth !== undefined && (!finite(cabinet.plinth) || cabinet.plinth < 0)) return false;
  const pending = cabinet.layout ? [cabinet.layout] : [];
  let count = 0;
  while (pending.length) {
    const node = pending.pop();
    if (!node || ++count > 80) return false;
    if (node.depth !== undefined && node.depth !== null && (!finite(node.depth) || node.depth < 0)) return false;
    if (node.plinthHeight !== undefined && node.plinthHeight !== null && (!finite(node.plinthHeight) || node.plinthHeight < 0)) return false;
    if (node.interiorLayout) pending.push(node.interiorLayout);
    if (node.kind === 'split') {
      if (!['horizontal', 'vertical'].includes(node.axis) || !Array.isArray(node.children) || node.children.length < 2) return false;
      if (node.sizes !== undefined && (!Array.isArray(node.sizes) || node.sizes.length !== node.children.length || node.sizes.some(size => !finite(size) || size <= 0))) return false;
      pending.push(...node.children);
    }
  }
  return true;
}

function constraints(cabinet, project) {
  const rows = [];
  const add = (key, kind, sectionId, axis, available, required) => rows.push({ key, kind, sectionId, axis, available, required, deficit: Math.max(0, required - available) });
  for (const item of getApplianceRequirements(cabinet, project)) for (const axis of AXES) add(`appliance/${item.sectionId}/${axis}`, 'appliance', item.sectionId, axis, item.available[axis], item.required[axis]);
  const layout = getCabinetLayout(cabinet, project), t = layout.thickness;
  const stockThickness = (id, fallback) => Number(project?.materials?.find(material => material.id === id)?.thickness ?? fallback);
  const panels = stockThickness(cabinet.drawerMaterialId ?? cabinet.materialId, t);
  const bottom = Number(cabinet.drawerBottomThickness ?? stockThickness(cabinet.drawerBottomMaterialId, 6));
  const runner = Number(cabinet.drawerSlideGap ?? 13), edge = project?.settings?.deductEdge ? Number(cabinet.edgeBand ?? project?.materials?.find(material => material.id === cabinet.materialId)?.edgeBand ?? 1) : 0;
  for (const axis of AXES) add(`cabinet/${axis}`, 'carcass', null, axis, cabinet[axis], POSITIVE_MINIMUM);
  add('cabinet/body-height', 'carcass', null, 'height', layout.bodyHeight, t * (cabinet.includeBottom === false ? 1 : 2) + POSITIVE_MINIMUM);
  add('cabinet/body-depth', 'carcass', null, 'depth', layout.bodyDepth, 20 + POSITIVE_MINIMUM);
  if (cabinet.cutout) {
    add('cabinet/cutout-width', 'carcass', null, 'width', cabinet.width - 2 * t - cabinet.cutout.width, POSITIVE_MINIMUM);
    add('cabinet/cutout-depth', 'carcass', null, 'depth', cabinet.depth - 2 * t - cabinet.cutout.depth, POSITIVE_MINIMUM);
  }
  for (const section of [...layout.sections, ...layout.internalSections]) {
    for (const axis of AXES) add(`section/${section.id}/${axis}`, 'section', section.id, axis, axis === 'depth' ? section.usableDepth : section[axis], 50);
    const depthCap = section.parentSectionId ? layout.sections.find(item => item.id === section.parentSectionId).depth : layout.bodyDepth;
    if (section.node.depth !== null && section.node.depth !== undefined) add(`section/${section.id}/depth-cap`, 'section', section.id, 'depth', depthCap - section.node.depth, 0);
    if (section.node.shelves > 0) add(`shelf/${section.id}/depth`, 'shelf', section.id, 'depth', section.usableDepth - 20, POSITIVE_MINIMUM);
    if (section.node.pullOutShelf) {
      add(`pull-out/${section.id}/width`, 'pull-out-shelf', section.id, 'width', section.width - 2 * runner, 50);
      add(`pull-out/${section.id}/depth`, 'pull-out-shelf', section.id, 'depth', section.usableDepth - 40, 50);
      add(`pull-out/${section.id}/height`, 'pull-out-shelf', section.id, 'height', section.height, t + 5);
    }
    if (section.backMode === 'braces') for (const brace of section.node.rearBraces ?? []) add(`brace/${section.id}/${brace.id}/height`, 'brace', section.id, 'height', section.height - brace.y, brace.height);
  }
  for (const front of getFrontLayout(cabinet, project)) {
    const key = `front/${front.sectionId ?? 'legacy'}/${front.kind}/${front.index}`;
    add(`${key}/width`, 'front', front.sectionId, 'width', front.width, 2 * edge + POSITIVE_MINIMUM);
    add(`${key}/height`, 'front', front.sectionId, 'height', front.height, 2 * edge + POSITIVE_MINIMUM);
    if (front.kind !== 'drawer') continue;
    const section = layout.sections.find(item => item.id === front.sectionId);
    add(`${key}/box-height`, 'drawer', front.sectionId, 'height', front.height - 40 - bottom, edge + POSITIVE_MINIMUM);
    add(`${key}/box-width`, 'drawer', front.sectionId, 'width', (section?.width ?? cabinet.width - 2 * t) - 2 * runner - 2 * panels, POSITIVE_MINIMUM);
    add(`${key}/box-depth`, 'drawer', front.sectionId, 'depth', (section?.usableDepth ?? layout.bodyDepth - Number(cabinet.cutout?.depth ?? 0)) - 40 - 2 * panels, POSITIVE_MINIMUM);
  }
  for (const front of getInternalDrawerLayout(cabinet, project)) {
    const key = `internal/${front.sectionId}/${front.index}`;
    for (const axis of AXES) add(`${key}/front-${axis}`, 'internal-drawer', front.sectionId, axis, front[axis], (axis === 'depth' ? 0 : 2 * edge) + POSITIVE_MINIMUM);
    add(`${key}/box-height`, 'internal-drawer', front.sectionId, 'height', front.box.height, edge + POSITIVE_MINIMUM);
    add(`${key}/box-width`, 'internal-drawer', front.sectionId, 'width', front.box.width - 2 * front.box.panelThickness, POSITIVE_MINIMUM);
    add(`${key}/box-depth`, 'internal-drawer', front.sectionId, 'depth', front.box.depth - 2 * front.box.panelThickness, POSITIVE_MINIMUM);
  }
  for (const brace of cabinet.rearBraces ?? []) add(`brace/${brace.id}/height`, 'brace', null, 'height', cabinet.height - brace.y, brace.height);
  return rows;
}

// Engine validation catches discrete failures not represented by an opening
// inequality (for example a brace intersecting an appliance). Placement is
// intentionally excluded; the studio applies its separate placement policy.
function constructionErrors(cabinet, project) {
  const geometryError = /недостаточно внутреннего пространства|вырез должен быть меньше|слишком мала|глубина секции.*превышает корпус|выдвижная полка не помещается|фасады не помещаются|короб ящика не помещается|внутренний ящик за дверями не помещается|задняя перемычка (выходит|не помещается|пересекает)|задние перемычки пересекаются|полки секции.*пересекают/u;
  return validateProject({ ...project, cabinets: [cabinet] }).filter(item => item.level === 'error' && item.cabinetId === cabinet.id && geometryError.test(item.message)).map(item => item.message.replace(/^«[^»]*»:\s*/u, '').replace(/«[^»]*»/gu, '«объект»'));
}

function baselineFor(cabinet, project) {
  return { constraints: constraints(cabinet, project), errors: new Set(constructionErrors(cabinet, project)) };
}

function violations(cabinet, project, baseline) {
  const previous = new Map(baseline.constraints.map(item => [item.key, item]));
  const result = constraints(cabinet, project).flatMap(item => {
    const allowedDeficit = previous.get(item.key)?.deficit ?? 0;
    return item.deficit > allowedDeficit + TOLERANCE ? [{ ...item, minimum: item.required - allowedDeficit, allowedDeficit }] : [];
  });
  for (const message of constructionErrors(cabinet, project)) if (!baseline.errors.has(message)) result.push({ kind: 'construction', message });
  return result;
}

function outcome(cabinet, { clamped = false, possible = true, fraction = 1, diagnostics = [], reason } = {}, project) {
  const requirements = getApplianceRequirements(cabinet, project);
  return { cabinet, clamped, possible, fraction, fits: requirements.every(item => item.fits) && constraints(cabinet, project).every(item => item.deficit <= TOLERANCE) && !constructionErrors(cabinet, project).length, requirements, diagnostics, ...(reason ? { reason } : {}) };
}

function sameLayout(a, b) {
  if (!a || !b) return !a && !b;
  if (a.id !== b.id || a.kind !== b.kind || a.axis !== b.axis) return false;
  if (a.kind !== 'split') return sameLayout(a.interiorLayout, b.interiorLayout);
  return a.children.length === b.children.length && a.children.every((child, i) => sameLayout(child, b.children[i]));
}

function geometryInterpolator(current, proposed, project, baselineProject) {
  if (!sameLayout(current.layout, proposed.layout)) return null;
  const oldGeometry = getCabinetLayout(current, baselineProject), newGeometry = getCabinetLayout(proposed, project);
  const oldNodes = new Map([...oldGeometry.nodes, ...oldGeometry.internalNodes].map(node => [node.id, node]));
  const newNodes = new Map([...newGeometry.nodes, ...newGeometry.internalNodes].map(node => [node.id, node]));
  const interpolateNodes = (before, after, target, fraction) => {
    // Inherited and explicit depth changes use their effective depth at each
    // endpoint so the first intermediate model has the original opening.
    if (before.depth !== after.depth) target.depth = lerp(oldNodes.get(before.id).depth, newNodes.get(after.id).depth, fraction);
    if (before.plinthHeight !== after.plinthHeight) target.plinthHeight = lerp(before.plinthHeight ?? current.plinth ?? 0, after.plinthHeight ?? proposed.plinth ?? 0, fraction);
    if (after.interiorLayout) interpolateNodes(before.interiorLayout, after.interiorLayout, target.interiorLayout, fraction);
    if (after.kind !== 'split') return;
    const dimension = after.axis === 'horizontal' ? 'height' : 'width';
    // Normalize arbitrary proportional weights to millimetres before blending.
    target.sizes = after.children.map((child, index) => lerp(oldNodes.get(before.children[index].id)[dimension], newNodes.get(child.id)[dimension], fraction));
    after.children.forEach((child, index) => interpolateNodes(before.children[index], child, target.children[index], fraction));
  };
  return fraction => {
    if (fraction === 0) {
      const first = clone(proposed);
      for (const key of ['width', 'height', 'depth', 'plinth']) if (current[key] !== proposed[key]) first[key] = current[key] ?? 0;
      if (current.cutout && proposed.cutout) for (const key of ['width', 'depth']) first.cutout[key] = current.cutout[key];
      if (current.layout) interpolateNodes(current.layout, proposed.layout, first.layout, fraction);
      return first;
    }
    if (fraction === 1) return clone(proposed);
    const next = clone(proposed);
    for (const key of ['width', 'height', 'depth', 'plinth']) if (current[key] !== proposed[key]) next[key] = lerp(current[key] ?? 0, proposed[key] ?? 0, fraction);
    if (current.cutout && proposed.cutout) for (const key of ['width', 'depth']) next.cutout[key] = lerp(current.cutout[key], proposed.cutout[key], fraction);
    if (current.layout) interpolateNodes(current.layout, proposed.layout, next.layout, fraction);
    return next;
  };
}

/**
 * Guard a numeric edit of the same section tree (dimensions, split sizes and
 * section depths). A valid proposal is copied verbatim. Otherwise the nearest
 * allowed position along the edit is returned. Structural/material/clearance
 * changes that cannot be repaired by numeric interpolation return possible:false.
 * Pass {baselineProject: before} when an edit also changes project materials:
 * the original opening must use the original board gauges. Both inputs and
 * projects remain unchanged. Room placement is a separate guard.
 */
export function constrainCabinetEdit(currentCabinet, proposedCabinet, project, { baselineProject = project } = {}) {
  if (!validGeometry(currentCabinet) || !validGeometry(proposedCabinet)) {
    return outcome(clone(currentCabinet), { possible: false, fraction: 0, reason: 'Введите допустимые размеры шкафа и секций.' }, project);
  }
  const baseline = baselineFor(currentCabinet, baselineProject);
  const diagnostics = violations(proposedCabinet, project, baseline);
  if (!diagnostics.length) return outcome(clone(proposedCabinet), {}, project);
  const interpolate = geometryInterpolator(currentCabinet, proposedCabinet, project, baselineProject);
  const start = interpolate?.(0);
  if (!start || !validGeometry(start) || violations(start, project, baseline).length) {
    return outcome(clone(currentCabinet), { possible: false, clamped: true, fraction: 0, diagnostics, reason: 'Техника и монтажные зазоры не помещаются в секции.' }, project);
  }
  let low = 0, high = 1, accepted = start;
  for (let iteration = 0; iteration < 48; iteration++) {
    const fraction = (low + high) / 2, next = interpolate(fraction);
    if (validGeometry(next) && !violations(next, project, baseline).length) { low = fraction; accepted = next; }
    else high = fraction;
  }
  return outcome(accepted, { clamped: true, fraction: low, diagnostics, reason: 'Размер ограничен конструкцией, техникой и монтажными зазорами.' }, project);
}

function guardedResize(cabinet, project, value, originalValue, operation) {
  if (!finite(value) || !finite(originalValue)) return outcome(clone(cabinet), { possible: false, fraction: 0, reason: 'Введите допустимый размер секции.' }, project);
  const baseline = baselineFor(cabinet, project);
  const propose = fraction => {
    const next = clone(cabinet);
    return operation(next, lerp(originalValue, value, fraction)) && validGeometry(next) ? next : null;
  };
  const target = propose(1);
  if (target && !violations(target, project, baseline).length) return outcome(target, {}, project);
  // The requested value may be below the engine's 50 mm opening limit. Search
  // before calling the mutating engine helper, rather than losing the edit.
  const start = propose(0);
  if (!start) return outcome(clone(cabinet), { possible: false, fraction: 0, reason: 'Эту перегородку нельзя переместить.' }, project);
  let low = 0, high = 1, accepted = start;
  for (let iteration = 0; iteration < 48; iteration++) {
    const fraction = (low + high) / 2, next = propose(fraction);
    if (next && !violations(next, project, baseline).length) { low = fraction; accepted = next; }
    else high = fraction;
  }
  return outcome(accepted, { clamped: true, fraction: low, diagnostics: target ? violations(target, project, baseline) : [], reason: 'Размер ограничен конструкцией, техникой и монтажными зазорами.' }, project);
}

/** Same horizontal/vertical axis and displayed opening millimetres as the UI. */
export function resizeApplianceSection(cabinet, id, axis, value, project) {
  const geometry = getCabinetLayout(cabinet, project), section = geometry.sections.find(item => item.id === id);
  if (!section || !['horizontal', 'vertical'].includes(axis)) return outcome(clone(cabinet), { possible: false, fraction: 0, reason: 'Секция не найдена.' }, project);
  const dimension = axis === 'horizontal' ? 'height' : 'width';
  let matchingAncestor = false;
  const walk = (node, hasAxis = false) => {
    if (node.id === id) { matchingAncestor = hasAxis; return true; }
    return node.kind === 'split' && node.children.some(child => walk(child, hasAxis || node.axis === axis));
  };
  if (cabinet.layout) walk(cabinet.layout);
  return guardedResize(cabinet, project, value, section[dimension], (next, requested) => {
    if (matchingAncestor) return resizeSectionAdjacent(next, id, axis, requested, project);
    next[dimension] += requested - section[dimension];
    return next[dimension] >= 100 && next[dimension] <= 6000;
  });
}

/** The requested size is the top/left opening before this physical divider. */
export function resizeApplianceDivider(cabinet, id, axis, value, project) {
  const geometry = getCabinetLayout(cabinet, project), divider = geometry.partitions.find(item => item.id === id || item.beforeChildId === id);
  const opening = divider && geometry.nodes.find(item => item.id === divider.beforeChildId);
  if (!opening || divider.axis !== axis) return outcome(clone(cabinet), { possible: false, fraction: 0, reason: 'Перегородка не найдена.' }, project);
  const originalValue = axis === 'horizontal' ? opening.height : opening.width;
  return guardedResize(cabinet, project, value, originalValue, (next, requested) => resizeDivider(next, id, axis, requested, project));
}

// Pure interior edits enforce their adjacent-opening limits before a proposed
// tree exists. Locate that limit first, then apply the full construction guard
// so drawer boxes, rails and already-invalid saved data use the same policy.
function constrainedInteriorResize(cabinet, parentId, id, axis, value, project, dividerEdit) {
  const geometry = getCabinetLayout(cabinet, project), outer = geometry.sections.find(item => item.id === parentId);
  const interior = outer && getInteriorLayout(outer, geometry.thickness);
  const divider = dividerEdit && interior?.partitions.find(item => item.id === id || item.beforeChildId === id);
  const opening = interior?.nodes.find(item => item.id === (dividerEdit ? divider?.beforeChildId : id));
  if (!outer?.node.interiorLayout || !opening || !['horizontal', 'vertical'].includes(axis) || dividerEdit && divider.axis !== axis || !dividerEdit && opening.node.kind !== 'section' || !finite(value)) {
    return outcome(clone(cabinet), { possible: false, fraction: 0, reason: dividerEdit ? 'Перегородка не найдена.' : 'Секция не найдена.' }, project);
  }
  const originalValue = axis === 'horizontal' ? opening.height : opening.width;
  const propose = fraction => {
    const next = clone(cabinet), nextOuter = getCabinetLayout(next, project).sections.find(item => item.id === parentId);
    const tree = (dividerEdit ? resizeInteriorDivider : resizeInteriorSection)(nextOuter, id, axis, lerp(originalValue, value, fraction), geometry.thickness);
    if (!tree) return null;
    nextOuter.node.interiorLayout = tree;
    return next;
  };
  let proposed = propose(1), fraction = 1, geometricClamp = false;
  if (!proposed) {
    proposed = propose(0);
    if (!proposed) return outcome(clone(cabinet), { possible: false, fraction: 0, reason: 'Эту перегородку нельзя переместить.' }, project);
    let low = 0, high = 1;
    for (let iteration = 0; iteration < 48; iteration++) {
      const mid = (low + high) / 2, next = propose(mid);
      if (next) { low = mid; proposed = next; } else high = mid;
    }
    fraction = low; geometricClamp = true;
  }
  const result = constrainCabinetEdit(cabinet, proposed, project);
  return geometricClamp ? { ...result, clamped: true, fraction: fraction * result.fraction, reason: result.reason ?? 'Размер ограничен конструкцией, техникой и монтажными зазорами.' } : result;
}

/** Displayed internal opening width/height; unrelated openings keep their edges. */
export function resizeConstrainedInteriorSection(cabinet, parentId, id, axis, mm, project) {
  return constrainedInteriorResize(cabinet, parentId, id, axis, mm, project, false);
}

/** mm is the top/left opening size before the physical interior divider. */
export function resizeConstrainedInteriorDivider(cabinet, parentId, id, axis, mm, project) {
  return constrainedInteriorResize(cabinet, parentId, id, axis, mm, project, true);
}

export function setApplianceSectionDepth(cabinet, id, value, project) {
  if (!finite(value) || value <= 0 || !findLayoutNode(cabinet.layout, id)) return outcome(clone(cabinet), { possible: false, fraction: 0, reason: 'Введите допустимую глубину секции.' }, project);
  const proposed = clone(cabinet);
  findLayoutNode(proposed.layout, id).depth = value;
  return constrainCabinetEdit(cabinet, proposed, project);
}
