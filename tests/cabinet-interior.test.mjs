import test from 'node:test';
import assert from 'node:assert/strict';
import { getInteriorLayout, findInteriorNode, splitInteriorSection, removeInteriorSection, resizeInteriorSection, resizeInteriorDivider } from '../src/cabinet-interior.js';

const leaf = (id, extra = {}) => ({ id, kind: 'section', front: 'open', shelves: 0, ...extra });
const split = (id, axis, children, sizes = children.map(() => 1)) => ({ id, kind: 'split', axis, children, sizes });
const outer = layout => ({ id: 'outer-doors', x: 18, y: 118, width: 764, height: 2064, depth: 650, rearOffset: 18, usableDepth: 632, node: { id: 'outer-doors', kind: 'section', front: 'doors', interiorLayout: layout } });
const withTree = (section, layout) => ({ ...section, node: { ...section.node, interiorLayout: layout } });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} ≈ ${expected}`);

test('internal geometry uses outer body coordinates, real divider thickness and top-to-bottom order', () => {
  const section = outer(split('inner-root', 'horizontal', [leaf('upper', { shelves: 2 }), leaf('drawers', { front: 'drawers', drawers: 2 })], [3, 1]));
  const before = structuredClone(section), result = getInteriorLayout(section, 18);
  assert.equal(result.sections.length, 2); assert.equal(result.partitions.length, 1); assert.equal(result.nodes.length, 3);
  const [upper, drawers] = result.sections, divider = result.partitions[0];
  close(upper.height, (2064 - 18) * .75); close(drawers.height, (2064 - 18) * .25);
  close(drawers.y, 118); close(upper.y + upper.height, 2182);
  close(divider.y, drawers.y + drawers.height); close(divider.height, 18); close(divider.y + 18, upper.y);
  assert.equal(divider.axis, 'horizontal'); assert.equal(divider.id, 'inner-root-divider-0');
  assert.equal(divider.beforeChildId, 'upper'); assert.equal(divider.parentId, 'inner-root');
  for (const entry of [...result.sections, ...result.partitions, ...result.nodes]) {
    assert.equal(entry.parentSectionId, 'outer-doors'); assert.equal(entry.depth, 650);
    assert.equal(entry.rearOffset, 18); assert.equal(entry.usableDepth, 632);
  }
  assert.deepEqual(section, before, 'geometry never changes the saved tree');
});

test('nested vertical and horizontal dividers conserve the clean rectangle and inherit bounded usable depths', () => {
  const section = outer(split('root', 'vertical', [leaf('left'), split('right', 'horizontal', [leaf('right-top', { depth: 400 }), leaf('right-bottom', { depth: 900 })], [1, 2])], [1, 2]));
  const geometry = getInteriorLayout(section, 18), left = geometry.sections.find(s => s.id === 'left'), right = geometry.nodes.find(s => s.id === 'right');
  close(left.width + 18 + right.width, section.width); close(left.x, section.x); close(right.x + right.width, section.x + section.width);
  assert.equal(geometry.sections.find(s => s.id === 'right-top').depth, 400);
  assert.equal(geometry.sections.find(s => s.id === 'right-top').usableDepth, 382);
  assert.equal(geometry.sections.find(s => s.id === 'right-bottom').depth, 650, 'child depth cannot exceed its enclosing opening');
  assert.equal(geometry.partitions.find(p => p.parentId === 'right').rearOffset, 18);
  const boxesArea = geometry.sections.reduce((sum, s) => sum + s.width * s.height, 0), dividerArea = geometry.partitions.reduce((sum, p) => sum + p.width * p.height, 0);
  close(boxesArea + dividerArea, section.width * section.height);
  const reduced = withTree(section, { ...section.node.interiorLayout, depth: 500 });
  assert.ok(getInteriorLayout(reduced, 18).nodes.every(entry => entry.depth <= 500 && entry.usableDepth <= 482));
});

test('missing interior remains empty and geometry traversal is bounded for a hostile cyclic tree', () => {
  const legacy = outer(undefined); legacy.node.internalDrawerCount = 4;
  assert.deepEqual(getInteriorLayout(legacy, 18).sections, [], 'legacy drawers remain the engine responsibility');
  const cyclic = split('loop', 'vertical', [leaf('child'), leaf('other')]); cyclic.children[1] = cyclic;
  const layout = getInteriorLayout(outer(cyclic), 18);
  assert.ok(layout.nodes.length <= 80); assert.ok(layout.sections.length > 0);
  assert.ok(layout.nodes.every(entry => ['x', 'y', 'width', 'height', 'depth', 'usableDepth'].every(key => Number.isFinite(entry[key]))));
});

test('splitting returns an independent tree, retains contents and generates collision-free bounded IDs', () => {
  const tree = split('root', 'vertical', [leaf('a', { shelves: 3 }), leaf('a-a'), leaf('a-b')]), before = structuredClone(tree);
  const result = splitInteriorSection(tree, 'a', 'horizontal');
  assert.notEqual(result, tree); assert.deepEqual(tree, before);
  const innerSplit = findInteriorNode(result, 'a'); assert.equal(innerSplit.kind, 'split');
  assert.equal(innerSplit.children[0].shelves, 3); assert.equal(innerSplit.children[1].shelves, 0);
  const ids = getInteriorLayout(outer(result), 18).nodes.map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  const explicit = splitInteriorSection(leaf('single'), 'single', 'horizontal', { secondId: 'single-a' });
  assert.equal(explicit.children[1].id, 'single-a'); assert.notEqual(explicit.children[0].id, 'single-a');
  assert.equal(splitInteriorSection(tree, 'a', 'vertical', { firstId: 'a-b' }), null);
  assert.equal(splitInteriorSection(tree, 'a', 'vertical', { firstId: 'same', secondId: 'same' }), null);
  assert.equal(splitInteriorSection(tree, 'root', 'horizontal'), null);
  assert.equal(splitInteriorSection(tree, 'missing', 'vertical'), null);
});

test('resizing a three-way divider moves only its nearest pair and retains the distant opening', () => {
  const section = outer(split('root', 'horizontal', [leaf('top'), leaf('middle'), leaf('bottom')], [1, 1, 1]));
  const before = structuredClone(section), initial = getInteriorLayout(section, 18);
  const tree = resizeInteriorDivider(section, 'root-divider-0', 'horizontal', 800, 18);
  assert.ok(tree); const next = getInteriorLayout(withTree(section, tree), 18);
  close(next.sections[0].height, 800);
  close(next.sections[2].height, initial.sections[2].height); close(next.sections[2].y, initial.sections[2].y);
  close(next.sections[1].height, initial.sections[0].height + initial.sections[1].height - 800);
  assert.deepEqual(section, before);
  const alternate = resizeInteriorDivider(section, 'top', 'horizontal', 800, 18);
  assert.deepEqual(alternate, tree, 'before-child ID selects the same physical divider');
  for (const value of [0, 49, Infinity, NaN, '800', 10000]) assert.equal(resizeInteriorDivider(section, 'top', 'horizontal', value, 18), null);
  assert.equal(resizeInteriorDivider(section, 'top', 'vertical', 800, 18), null);
});

test('nested adjacent resizing preserves far edges inside subtrees and handles the last child', () => {
  const nested = split('right-stack', 'vertical', [leaf('near'), leaf('far')]);
  const section = outer(split('root', 'vertical', [leaf('left'), nested], [1, 1])), initial = getInteriorLayout(section, 18);
  const farBefore = initial.sections.find(s => s.id === 'far');
  const result = resizeInteriorSection(section, 'left', 'vertical', 300, 18);
  const next = getInteriorLayout(withTree(section, result), 18), farAfter = next.sections.find(s => s.id === 'far');
  close(farAfter.width, farBefore.width); close(farAfter.x, farBefore.x);
  close(next.sections.find(s => s.id === 'left').width, 300);
  const last = resizeInteriorSection(section, 'far', 'vertical', 100, 18);
  assert.ok(last); close(getInteriorLayout(withTree(section, last), 18).sections.find(s => s.id === 'far').width, 100);
  assert.equal(resizeInteriorSection(section, 'left', 'vertical', 720, 18), null, 'a nested opening cannot be squeezed below 50 mm');
  assert.equal(resizeInteriorSection(section, 'left', 'horizontal', 100, 18), null, 'no matching parent divider exists');
});

test('resizing across perpendicular descendants changes every affected opening while preserving remote branches', () => {
  const section = outer(split('root', 'horizontal', [split('top-halves', 'vertical', [leaf('top-left'), leaf('top-right')]), leaf('bottom')], [1, 1]));
  const result = resizeInteriorSection(section, 'top-left', 'horizontal', 700, 18);
  assert.ok(result); const next = getInteriorLayout(withTree(section, result), 18);
  close(next.sections.find(s => s.id === 'top-left').height, 700); close(next.sections.find(s => s.id === 'top-right').height, 700);
  close(next.sections.find(s => s.id === 'bottom').height, section.height - 18 - 700);
  close(next.sections.find(s => s.id === 'bottom').y, section.y);
});

test('removing an internal leaf merges a two-way split or expands only the nearest edge of a three-way neighbour', () => {
  const two = outer(split('root', 'horizontal', [leaf('upper', { shelves: 3 }), leaf('lower')]));
  const merged = removeInteriorSection(two, 'lower', 18);
  assert.equal(merged.id, 'upper'); assert.equal(merged.shelves, 3); assert.equal(getInteriorLayout(withTree(two, merged), 18).sections[0].height, two.height);
  const section = outer(split('root', 'vertical', [leaf('left'), split('middle', 'vertical', [leaf('near'), leaf('far')]), leaf('last')], [1, 2, 1])), before = structuredClone(section), initial = getInteriorLayout(section, 18);
  const result = removeInteriorSection(section, 'left', 18); assert.ok(result);
  const next = getInteriorLayout(withTree(section, result), 18);
  for (const id of ['far', 'last']) {
    const old = initial.sections.find(s => s.id === id), current = next.sections.find(s => s.id === id);
    close(current.x, old.x); close(current.width, old.width);
  }
  close(next.sections.find(s => s.id === 'near').x, section.x);
  assert.deepEqual(section, before); assert.equal(removeInteriorSection(section, 'root', 18), null);
  assert.equal(removeInteriorSection(outer(leaf('single')), 'single', 18), null);
});
