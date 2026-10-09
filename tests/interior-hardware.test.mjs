import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, getCabinetLayout, getFrontLayout, getInternalDrawerLayout } from '../src/engine.js';
import { getInteriorDrawerHardwareOwner, setInteriorDrawerHingeGap } from '../src/interior-hardware.js';
import { checkImport } from '../src/project-io.js';
import { constrainCabinetEdit } from '../src/appliance-constraints.js';

function fixture() {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 740, height: 902, depth: 620,
    layout: { ...createSection('doors'), id: 'outer', doors: 2, interiorLayout: { ...createSection('drawers'), id: 'inside', drawers: 2 } } });
  return { project, cabinet };
}

test('a selected 704 by 766 inner drawer opening resolves the actual enclosing doors and writes only their shared hinge gap', () => {
  const { project, cabinet } = fixture(), before = structuredClone(project);
  const inner = getCabinetLayout(cabinet, project).internalSections[0];
  assert.deepEqual([inner.width, inner.height], [704, 766]);
  const owner = getInteriorDrawerHardwareOwner(cabinet, project, inner.id, { parentSectionId: 'outer' });
  assert.deepEqual([owner.id, owner.isInterior, owner.hingeGap, owner.affectedSectionIds, owner.affectedDrawerCount], ['outer', true, 20, ['inside'], 2]);
  const proposed = setInteriorDrawerHingeGap(cabinet, project, 'inside', 25, { parentSectionId: 'outer' });
  assert.equal(proposed.layout.internalDrawerHingeGap, 25);
  assert.equal(proposed.layout.interiorLayout.internalDrawerHingeGap, undefined);
  assert.deepEqual(getFrontLayout(proposed, project), getFrontLayout(cabinet, project));
  assert.deepEqual(getInternalDrawerLayout(proposed, project).map(drawer => [drawer.hingeGap, drawer.width, drawer.box.width]), [[25, 650, 628], [25, 650, 628]]);
  assert.equal(getCabinetLayout(proposed, project).internalSections[0].width, 704);
  assert.doesNotThrow(() => checkImport({ ...project, cabinets: [proposed] }));
  assert.deepEqual(project, before);
});

test('edits from any nested drawer leaf affect only the two outer hinge edges, leaving inner partition clearances unchanged', () => {
  const { project, cabinet } = fixture(); cabinet.width = 1200;
  cabinet.layout.interiorLayout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [300, 528, 300], children: [
    { ...createSection('drawers'), id: 'left', drawers: 2 },
    { id: 'middle-stack', kind: 'split', axis: 'horizontal', sizes: [1, 1], children: [
      { ...createSection('drawers'), id: 'middle-top', drawers: 1 }, { ...createSection('drawers'), id: 'middle-bottom', drawers: 1 }
    ] },
    { ...createSection('drawers'), id: 'right', drawers: 2 }
  ] };
  const before = structuredClone(project), old = getInternalDrawerLayout(cabinet, project);
  for (const selected of ['left', 'middle-top', 'middle-bottom', 'right']) {
    const owner = getInteriorDrawerHardwareOwner(cabinet, project, selected);
    assert.equal(owner.id, 'outer');
    assert.deepEqual(owner.affectedSectionIds, ['left', 'middle-top', 'middle-bottom', 'right']);
    const proposed = setInteriorDrawerHingeGap(cabinet, project, selected, 25);
    const drawers = getInternalDrawerLayout(proposed, project);
    assert.deepEqual(drawers.filter(d => d.interiorSectionId === 'left').map(d => [d.x, d.width, d.box.x, d.box.width]), [[45, 271, 56, 249], [45, 271, 56, 249]]);
    assert.deepEqual(drawers.filter(d => d.interiorSectionId === 'right').map(d => [d.x, d.width, d.box.x, d.box.width]), [[884, 271, 895, 249], [884, 271, 895, 249]]);
    for (const drawer of drawers.filter(d => d.interiorSectionId.startsWith('middle-'))) {
      const prior = old.find(d => d.interiorSectionId === drawer.interiorSectionId);
      assert.deepEqual([drawer.x, drawer.width, drawer.box.x, drawer.box.width], [prior.x, prior.width, prior.box.x, prior.box.width]);
      assert.deepEqual([drawer.width, drawer.box.width], [524, 502]);
    }
  }
  assert.deepEqual(project, before);
});

test('the shared gap belongs to one outer door section and never changes a sibling door section', () => {
  const { project, cabinet } = fixture(); cabinet.width = 1800;
  const left = cabinet.layout;
  cabinet.layout = { id: 'cabinet-columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [left,
    { ...createSection('doors'), id: 'other-doors', internalDrawerCount: 1, internalDrawerHingeGap: 35 }
  ] };
  const unrelated = getInternalDrawerLayout(cabinet, project).filter(d => d.sectionId === 'other-doors');
  const proposed = setInteriorDrawerHingeGap(cabinet, project, 'inside', 30);
  assert.equal(proposed.layout.children[0].internalDrawerHingeGap, 30);
  assert.equal(proposed.layout.children[1].internalDrawerHingeGap, 35);
  assert.deepEqual(getInternalDrawerLayout(proposed, project).filter(d => d.sectionId === 'other-doors'), unrelated);
  assert.equal(getInteriorDrawerHardwareOwner(cabinet, project, 'inside', { parentSectionId: 'other-doors' }), null);
  assert.equal(setInteriorDrawerHingeGap(cabinet, project, 'inside', 25, { parentSectionId: 'other-doors' }), null);
});

test('outer legacy internal drawers share the same setting, zero is explicit, and removing doors disables the setting', () => {
  const { project, cabinet } = fixture(); delete cabinet.layout.interiorLayout;
  cabinet.layout.internalDrawerCount = 2;
  assert.equal(getInteriorDrawerHardwareOwner(cabinet, project, 'outer').isInterior, false);
  const proposed = setInteriorDrawerHingeGap(cabinet, project, 'outer', 0);
  assert.equal(getInteriorDrawerHardwareOwner(proposed, project, 'outer').hingeGap, 0);
  assert.equal(getInternalDrawerLayout(proposed, project).every(d => d.hingeGap === 0), true);
  cabinet.layout.front = 'open';
  assert.equal(getInteriorDrawerHardwareOwner(cabinet, project, 'outer'), null);
  assert.equal(setInteriorDrawerHingeGap(cabinet, project, 'outer', 30), null);
  assert.equal(getInternalDrawerLayout(cabinet, project).every(d => d.hingeGap === 0), true);
});

test('invalid values and stale selections do not mutate inputs, while an oversized valid value is rejected by the usual geometry guard', () => {
  const { project, cabinet } = fixture(), before = structuredClone(project);
  for (const value of [-1, 201, NaN, Infinity, '25', null]) assert.equal(setInteriorDrawerHingeGap(cabinet, project, 'inside', value), null);
  for (const selected of [null, 'missing', 'former-inner-section']) {
    assert.equal(getInteriorDrawerHardwareOwner(cabinet, project, selected), null);
    assert.equal(setInteriorDrawerHingeGap(cabinet, project, selected, 25), null);
  }
  cabinet.width = 200;
  const proposed = setInteriorDrawerHingeGap(cabinet, project, 'inside', 200);
  assert.equal(proposed.layout.internalDrawerHingeGap, 200);
  const guarded = constrainCabinetEdit(cabinet, proposed, project);
  assert.equal(guarded.possible, false);
  assert.equal(cabinet.layout.internalDrawerHingeGap, undefined);
  cabinet.width = before.cabinets[0].width;
  assert.deepEqual(project, before);
});
