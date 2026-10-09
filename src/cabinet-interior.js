/** Internal compartments behind one outer door section. All coordinates use
 * the enclosing cabinet body's X/Y and rear depth origin, in millimetres.
 * This module has no engine dependency and never modifies its input trees. */
const EPSILON = .001;
const MIN_OPENING = 50;
const number = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clone = value => structuredClone(value);
const axisSize = (entry, axis) => !entry ? NaN : axis === 'horizontal' ? entry.height : entry.width;

export function getInteriorLayout(outerSection, thickness = 18) {
  const t = Math.max(0, number(thickness, 18)), parentSectionId = outerSection?.id;
  const sections = [], partitions = [], nodes = [], seen = new Set();
  const root = outerSection?.node?.interiorLayout;
  const visit = (node, bounds, parentId = null, level = 0) => {
    if (!node || typeof node !== 'object' || seen.has(node) || nodes.length >= 80 || level > 10) return;
    seen.add(node);
    const depth = node.depth == null ? bounds.depth : Math.min(bounds.depth, Math.max(0, number(node.depth, bounds.depth)));
    const rect = { ...bounds, depth, usableDepth: Math.max(0, Math.min(bounds.usableDepth - (bounds.depth - depth), depth - bounds.rearOffset)) };
    const entry = { id: node.id, node, parentId, parentSectionId, ...rect };
    nodes.push(entry);
    if (node.kind !== 'split' || !Array.isArray(node.children) || node.children.length < 2) {
      sections.push(entry); return;
    }
    const horizontal = node.axis === 'horizontal', dimension = horizontal ? rect.height : rect.width;
    const available = Math.max(0, dimension - t * (node.children.length - 1));
    const weights = node.children.map((_, index) => Math.max(EPSILON, number(node.sizes?.[index], 1)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let cursor = horizontal ? rect.y + rect.height : rect.x;
    node.children.forEach((child, index) => {
      const size = available * weights[index] / total;
      const childBounds = horizontal ? { ...rect, y: cursor - size, height: size } : { ...rect, x: cursor, width: size };
      visit(child, childBounds, node.id, level + 1);
      cursor += horizontal ? -size : size;
      if (index === node.children.length - 1) return;
      partitions.push({ id: `${node.id}-divider-${index}`, parentId: node.id, parentSectionId, beforeChildId: child.id, axis: node.axis, ...rect,
        ...(horizontal ? { y: cursor - t, height: t } : { x: cursor, width: t }) });
      cursor += horizontal ? -t : t;
    });
  };
  if (root) {
    const depth = Math.max(0, number(outerSection.depth));
    const rearOffset = Math.max(0, number(outerSection.rearOffset));
    visit(root, { x: number(outerSection.x), y: number(outerSection.y), width: Math.max(0, number(outerSection.width)), height: Math.max(0, number(outerSection.height)), depth, rearOffset, usableDepth: Math.max(0, number(outerSection.usableDepth, depth - rearOffset)) });
  }
  return { sections, partitions, nodes, thickness: t, parentSectionId };
}

function findParent(layout, id) {
  const stack = [{ node: layout, parent: null }], seen = new Set();
  while (stack.length && seen.size < 80) {
    const entry = stack.pop();
    if (!entry.node || typeof entry.node !== 'object' || seen.has(entry.node)) continue;
    seen.add(entry.node);
    if (entry.node.id === id) return entry;
    if (entry.node.kind === 'split' && Array.isArray(entry.node.children)) stack.push(...entry.node.children.map(node => ({ node, parent: entry.node })));
  }
  return null;
}

export function findInteriorNode(layout, id) {
  return findParent(layout, id)?.node || null;
}

function treeIds(layout) {
  const ids = new Set(), stack = [layout], seen = new Set();
  while (stack.length && seen.size < 80) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node); ids.add(node.id);
    if (node.kind === 'split' && Array.isArray(node.children)) stack.push(...node.children);
  }
  return ids;
}

function freshId(ids, base) {
  const stem = String(base).slice(0, 100); let id = stem, index = 1;
  while (ids.has(id)) id = `${stem}-${index++}`;
  ids.add(id); return id;
}

/** Return a cloned tree; null denotes an unsupported edit. The old leaf's ID
 * becomes the split ID, just as it does in the cabinet's outer layout. */
export function splitInteriorSection(layout, id, axis, { firstId, secondId } = {}) {
  if (!['horizontal', 'vertical'].includes(axis) || !layout) return null;
  const result = clone(layout), found = findParent(result, id);
  if (!found || found.node.kind !== 'section') return null;
  const ids = treeIds(result);
  if ([firstId, secondId].some(value => value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 120 || ids.has(value))) || firstId !== undefined && firstId === secondId) return null;
  if (firstId !== undefined) ids.add(firstId);
  if (secondId !== undefined) ids.add(secondId);
  firstId ??= freshId(ids, `${id}-a`); ids.add(firstId);
  secondId ??= freshId(ids, `${id}-b`);
  if (firstId === secondId) return null;
  const replacement = { id, kind: 'split', axis, sizes: [1, 1], children: [{ ...found.node, id: firstId }, { id: secondId, kind: 'section', front: 'open', shelves: 0, depth: null, pullOutShelf: false }] };
  if (found.parent) found.parent.children[found.parent.children.indexOf(found.node)] = replacement;
  else return replacement;
  return result;
}

const withTree = (outer, layout) => ({ ...outer, node: { ...outer.node, interiorLayout: layout } });

function edgePatches(node, axis, delta, edge, geometry, patches) {
  const entry = geometry.nodes.find(item => item.id === node.id);
  if (!entry || axisSize(entry, axis) + delta < MIN_OPENING - EPSILON) return false;
  if (node.kind !== 'split') return true;
  if (node.axis !== axis) return node.children.every(child => edgePatches(child, axis, delta, edge, geometry, patches));
  const sizes = node.children.map(child => axisSize(geometry.nodes.find(item => item.id === child.id), axis));
  const index = edge === 'start' ? 0 : sizes.length - 1;
  sizes[index] += delta;
  if (sizes[index] < MIN_OPENING - EPSILON || !edgePatches(node.children[index], axis, delta, edge, geometry, patches)) return false;
  patches.push({ node, sizes }); return true;
}

function resizePair(outer, layout, parent, beforeIndex, value, thickness) {
  const geometry = getInteriorLayout(withTree(outer, layout), thickness), axis = parent.axis;
  if (beforeIndex < 0 || beforeIndex >= parent.children.length - 1 || !Number.isFinite(value)) return null;
  const sizes = parent.children.map(child => axisSize(geometry.nodes.find(item => item.id === child.id), axis));
  if (sizes.some(size => !Number.isFinite(size))) return null;
  const delta = value - sizes[beforeIndex];
  sizes[beforeIndex] = value; sizes[beforeIndex + 1] -= delta;
  if (sizes[beforeIndex] < MIN_OPENING - EPSILON || sizes[beforeIndex + 1] < MIN_OPENING - EPSILON) return null;
  const patches = [];
  if (!edgePatches(parent.children[beforeIndex], axis, delta, 'end', geometry, patches) || !edgePatches(parent.children[beforeIndex + 1], axis, -delta, 'start', geometry, patches)) return null;
  for (const patch of patches) patch.node.sizes = patch.sizes;
  parent.sizes = sizes; return layout;
}

/** value is the top/left opening size before the chosen physical divider. */
export function resizeInteriorDivider(outerSection, id, axis, value, thickness = 18) {
  if (!['horizontal', 'vertical'].includes(axis) || typeof value !== 'number' || !Number.isFinite(value) || !outerSection?.node?.interiorLayout) return null;
  const layout = clone(outerSection.node.interiorLayout), geometry = getInteriorLayout(withTree(outerSection, layout), thickness);
  const divider = geometry.partitions.find(item => item.id === id || item.beforeChildId === id);
  if (!divider || divider.axis !== axis) return null;
  const parent = findInteriorNode(layout, divider.parentId);
  return parent ? resizePair(outerSection, layout, parent, parent.children.findIndex(child => child.id === divider.beforeChildId), value, thickness) : null;
}

/** Resize an opening against its nearest neighbour, retaining distant edges. */
export function resizeInteriorSection(outerSection, id, axis, value, thickness = 18) {
  if (!['horizontal', 'vertical'].includes(axis) || typeof value !== 'number' || !Number.isFinite(value) || !outerSection?.node?.interiorLayout) return null;
  const layout = clone(outerSection.node.interiorLayout);
  let found = findParent(layout, id);
  if (!found || found.node.kind !== 'section') return null;
  while (found.parent && found.parent.axis !== axis) found = findParent(layout, found.parent.id);
  if (!found.parent) return null;
  const index = found.parent.children.indexOf(found.node);
  if (index < found.parent.children.length - 1) return resizePair(outerSection, layout, found.parent, index, value, thickness);
  const geometry = getInteriorLayout(withTree(outerSection, layout), thickness);
  const before = geometry.nodes.find(item => item.id === found.parent.children[index - 1].id), current = geometry.nodes.find(item => item.id === found.node.id);
  return resizePair(outerSection, layout, found.parent, index - 1, axisSize(before, axis) + axisSize(current, axis) - value, thickness);
}

export function removeInteriorSection(outerSection, id, thickness = 18) {
  if (!outerSection?.node?.interiorLayout) return null;
  let layout = clone(outerSection.node.interiorLayout);
  const found = findParent(layout, id);
  if (!found?.parent || found.node.kind !== 'section') return null;
  const parent = found.parent, index = parent.children.indexOf(found.node);
  if (parent.children.length === 2) {
    const sibling = parent.children[1 - index], grandparent = findParent(layout, parent.id)?.parent;
    if (grandparent) grandparent.children[grandparent.children.indexOf(parent)] = sibling; else layout = sibling;
    return layout;
  }
  const geometry = getInteriorLayout(withTree(outerSection, layout), thickness);
  const sizes = parent.children.map(child => axisSize(geometry.nodes.find(entry => entry.id === child.id), parent.axis));
  if (sizes.some(size => !Number.isFinite(size))) return null;
  const neighbour = index < parent.children.length - 1 ? index + 1 : index - 1, freed = sizes[index] + geometry.thickness, patches = [];
  if (!edgePatches(parent.children[neighbour], parent.axis, freed, neighbour > index ? 'start' : 'end', geometry, patches)) return null;
  for (const patch of patches) patch.node.sizes = patch.sizes;
  sizes[neighbour] += freed; parent.children.splice(index, 1); sizes.splice(index, 1); parent.sizes = sizes;
  return layout;
}
