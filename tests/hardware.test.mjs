import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, getInternalDrawerLayout } from '../src/engine.js';
import { getHardwareSchedule, getProjectHardwareSchedule, defaultHingesPerDoor } from '../src/hardware.js';

function fixture() {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 1200, height: 2400, depth: 700 });
  return { project, cabinet };
}
const withoutRods = values => ({ ...values, rods: 0, rodHolders: 0, rodLengthMeters: 0 });

test('mixed sections count actual handles, guide pairs and explicit hinges without counting push handles', () => {
  const { project, cabinet } = fixture();
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1, 1], children: [
    { ...createSection('doors'), id: 'doors', doors: 2, hingesPerDoor: 4, internalDrawerCount: 2 },
    { ...createSection('drawers'), id: 'drawers', drawers: 2, openingMechanism: 'push' },
    { ...createSection('open'), id: 'pull-out', pullOutShelf: true, openingMechanism: 'push' }
  ] };
  const before = structuredClone(project), schedule = getHardwareSchedule(cabinet, project);
  assert.deepEqual(schedule.totals, withoutRods({ handles: 4, guideSets: 5, hinges: 8 }));
  assert.equal(schedule.rows.filter(row => row.kind === 'guide-set').every(row => row.quantity === 1 && row.unit === 'sets'), true);
  assert.equal(schedule.rows.filter(row => row.kind === 'hinge').every(row => !row.planned && row.quantity === 4), true);
  assert.deepEqual(new Set(schedule.rows.filter(row => row.kind === 'handle').map(row => row.source)), new Set(['door', 'internal-drawer']));
  assert.deepEqual(project, before);
});

test('the editable preliminary hinge estimate has explicit bounds and labels automatic rows as planned', () => {
  assert.deepEqual([750, 751, 1500, 1501, 2000, 2001, 2400, 2401, 2600, 2601, 2800, 2801, 3201, 6000].map(defaultHingesPerDoor), [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 12]);
  assert.equal(defaultHingesPerDoor(NaN), 2);
  const { project, cabinet } = fixture();
  cabinet.layout = { ...createSection('doors'), id: 'doors', doorOpenings: ['up', 'right'] };
  const schedule = getHardwareSchedule(cabinet, project);
  assert.deepEqual(schedule.totals, withoutRods({ handles: 2, guideSets: 0, hinges: 10 }));
  assert.equal(schedule.rows.filter(row => row.kind === 'hinge').every(row => row.planned), true);
  assert.equal(schedule.rows.find(row => row.kind === 'hinge').opening, 'up');
});

test('interior trees preserve outer door quantities and count each internal drawer and pull-out source once', () => {
  const { project, cabinet } = fixture();
  cabinet.layout = { ...createSection('doors'), id: 'outer', openingMechanism: 'push', internalDrawerCount: 12, interiorLayout: {
    id: 'inner-columns', kind: 'split', axis: 'vertical', sizes: [1, 1, 1], children: [
      { id: 'inner-left', kind: 'section', front: 'drawers', drawers: 2 },
      { id: 'inner-middle', kind: 'section', front: 'drawers', drawers: 2, openingMechanism: 'push' },
      { id: 'inner-right', kind: 'section', front: 'open', pullOutShelf: true }
    ]
  } };
  const schedule = getHardwareSchedule(cabinet, project);
  assert.deepEqual(schedule.totals, withoutRods({ handles: 3, guideSets: 5, hinges: 10 }));
  assert.equal(schedule.rows.filter(row => row.kind === 'guide-set' && row.source === 'internal-drawer').length, 4);
  assert.equal(schedule.rows.filter(row => row.source === 'internal-drawer').every(row => row.sectionId === 'outer' && row.interiorSectionId), true);
  assert.deepEqual(getInternalDrawerLayout(cabinet, project).map(front => [front.interiorSectionId, front.width, front.box.width]), [['inner-left', 352, 330], ['inner-left', 352, 330], ['inner-middle', 372, 350], ['inner-middle', 372, 350]]);
  assert.equal(getInternalDrawerLayout(cabinet, project)[0].box.x, 18 + 20 + 13);
  assert.equal(getInternalDrawerLayout(cabinet, project)[2].box.x, 412 + 13);
});

test('legacy mixed cabinets and project totals remain immutable and guide sets are not doubled', () => {
  const { project, cabinet } = fixture(); delete cabinet.layout;
  Object.assign(cabinet, { doors: 2, drawers: 2, shelves: 0, hingesPerDoor: 5 });
  const copy = structuredClone(cabinet); copy.id = 'push-legacy'; copy.name = 'Push'; copy.x = 2000; copy.openingMechanism = 'push';
  project.cabinets.push(copy);
  const before = structuredClone(project), summary = getProjectHardwareSchedule(project);
  assert.deepEqual(summary.cabinets.map(c => c.totals), [withoutRods({ handles: 4, guideSets: 2, hinges: 10 }), withoutRods({ handles: 0, guideSets: 2, hinges: 10 })]);
  assert.deepEqual(summary.totals, withoutRods({ handles: 4, guideSets: 4, hinges: 20 }));
  assert.equal(summary.rows.length, summary.cabinets.reduce((sum, c) => sum + c.rows.length, 0));
  assert.equal(new Set(summary.rows.map(row => row.id)).size, summary.rows.length);
  summary.rows[0].quantity = 999;
  assert.deepEqual(project, before);
  assert.deepEqual(getProjectHardwareSchedule({ ...project, cabinets: [] }).totals, withoutRods({ handles: 0, guideSets: 0, hinges: 0 }));
});
