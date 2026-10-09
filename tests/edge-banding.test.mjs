import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, getCabinetLayout, getFrontLayout, generateParts, getPartEdgeBanding, getEdgeBandingSummary, optimizeCutting, validateProject, findFreeRodPosition } from '../src/engine.js';
import { getProjectHardwareSchedule } from '../src/hardware.js';
import { getProjectCostEstimate } from '../src/pricing.js';
import { constrainCabinetEdit } from '../src/appliance-constraints.js';

function fixture(overrides = {}) {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 2200, depth: 600, plinth: 100, includeBack: true, sidesToFloor: true,
    edgeBand: 1, layout: { ...createSection('open'), id: 'opening', shelves: 1 }, ...overrides });
  return { project, cabinet };
}
const edges = part => ['top', 'bottom', 'left', 'right'].map(edge => part.edges[edge]);
const panel = (project, name) => generateParts(project).find(part => part.name.includes(name));

test('new projects cut ordinary shelves with one front band, preserving width and finished assembly dimensions', () => {
  const { project, cabinet } = fixture(), before = structuredClone(project);
  assert.equal(project.settings.deductEdge, true);
  const shelf = panel(project, 'полка 1');
  assert.deepEqual(edges(shelf), [0, 1, 0, 0]);
  assert.deepEqual([shelf.width, shelf.height, shelf.finishedWidth, shelf.finishedHeight], [860, 576, 860, 577]);
  assert.equal(getPartEdgeBanding(shelf).lengthMeters, .86);
  const geometry = getCabinetLayout(cabinet, project);
  project.settings.deductEdge = false;
  const uncut = panel(project, 'полка 1');
  assert.deepEqual([uncut.width, uncut.height], [860, 577]);
  assert.deepEqual(uncut.position, shelf.position);
  assert.deepEqual(getCabinetLayout(cabinet, project), geometry);
  assert.deepEqual(getPartEdgeBanding(uncut), getPartEdgeBanding(shelf));
  project.settings.deductEdge = true;
  assert.deepEqual(project, before);
});

test('floor-length sides cover both plinth ends while raised sides leave them exposed', () => {
  const { project, cabinet } = fixture();
  let plinth = panel(project, 'Цокольная');
  assert.deepEqual(edges(plinth), [1, 0, 0, 0]);
  assert.deepEqual([plinth.width, plinth.height, plinth.finishedWidth, plinth.finishedHeight], [864, 89, 864, 90]);
  assert.equal(getPartEdgeBanding(plinth).lengthMm, 864);
  assert.equal(plinth.position.x, 18);
  cabinet.sidesToFloor = false;
  plinth = panel(project, 'Цокольная');
  assert.deepEqual(edges(plinth), [1, 0, 1, 1]);
  assert.deepEqual([plinth.width, plinth.height, plinth.finishedWidth, plinth.finishedHeight], [894, 89, 896, 90]);
  assert.equal(getPartEdgeBanding(plinth).lengthMm, 1076);
  assert.equal(plinth.position.x, 2);
});

test('an extended floor-opening divider closes only the adjacent plinth end in either column order', () => {
  for (const portalOnLeft of [true, false]) {
    const { project } = fixture({ sidesToFloor: false });
    const portal = { ...createSection('open'), id: 'portal', floor: 'open' }, closed = { ...createSection('open'), id: 'closed' };
    project.cabinets[0].layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: portalOnLeft ? [portal, closed] : [closed, portal] };
    const plinth = panel(project, 'Цокольная');
    assert.deepEqual(edges(plinth), portalOnLeft ? [1, 0, 0, 1] : [1, 0, 1, 0]);
    assert.equal(plinth.finishedWidth - plinth.width, 1);
  }
});

test('a low local bottom and its divider jointly cover the neighbouring raised plinth end', () => {
  const { project, cabinet } = fixture({ sidesToFloor: false });
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { ...createSection('open'), id: 'low', plinthHeight: 0 }, { ...createSection('open'), id: 'raised', plinthHeight: 100 }
  ] };
  const plinth = panel(project, 'Цокольная');
  assert.deepEqual(edges(plinth), [1, 0, 0, 1]);
  const divider = panel(project, 'Вертикальная перегородка');
  assert.equal(cabinet.plinth + divider.position.y, 18);
  assert.equal(cabinet.plinth + panel(project, 'Дно корпуса').position.y, 0);
});

test('rear braces omit only the horizontal edges covered by their bottom or roof joints', () => {
  const { project, cabinet } = fixture({ includeBack: false });
  Object.assign(cabinet.layout, { shelves: 0, back: 'braces', rearBraces: [{ id: 'rail', y: 0, height: 100 }] });
  let rail = generateParts(project).find(part => part.role === 'brace');
  assert.deepEqual(edges(rail), [1, 0, 0, 0]);
  assert.equal(rail.finishedHeight - rail.height, 1);
  cabinet.layout.rearBraces[0].y = 100;
  rail = generateParts(project).find(part => part.role === 'brace');
  assert.deepEqual(edges(rail), [1, 1, 0, 0]);
  assert.equal(rail.finishedHeight - rail.height, 2);
  cabinet.layout.rearBraces[0].y = 0;
  cabinet.layout.rearBraces[0].height = getCabinetLayout(cabinet, project).sections[0].height;
  rail = generateParts(project).find(part => part.role === 'brace');
  assert.deepEqual(edges(rail), [0, 0, 0, 0]);
  assert.equal(getPartEdgeBanding(rail).lengthMm, 0);
});

test('the exposed lower portion of a floor-length L-return keeps its continuous band, while the horizontal rear notch stays unbanded', () => {
  for (const corner of ['back-left', 'back-right']) for (const includeBack of [true, false]) {
    const { project, cabinet } = fixture({ includeBack, cutout: { corner, width: 300, depth: 180 } });
    const parts = generateParts(project), top = parts.find(part => part.name === 'Крышка'), shelf = parts.find(part => part.name.includes('полка 1'));
    const side = parts.find(part => part.name === 'Возвратная боковина выреза');
    assert.deepEqual(edges(side), [0, 0, 1, 0]);
    assert.equal(side.finishedWidth - side.width, 1);
    assert.equal(getPartEdgeBanding(side).lengthMm, side.finishedHeight);
    for (const horizontal of [top, shelf]) {
      assert.deepEqual(edges(horizontal), [0, 1, 0, 0]);
      assert.equal(horizontal.width, horizontal.finishedWidth);
      assert.equal(horizontal.finishedHeight - horizontal.height, 1);
      assert.equal(getPartEdgeBanding(horizontal).lengthMm, horizontal.finishedWidth);
      assert.equal(horizontal.outline.length, 6);
      assert.equal(horizontal.finishedOutline.length, 6);
      assert.equal(Math.max(...horizontal.finishedOutline.map(point => point.y)) - Math.max(...horizontal.outline.map(point => point.y)), 1);
    }
    const assembly = parts.map(part => [part.id, part.finishedWidth, part.finishedHeight, part.position, part.finishedOutline]);
    project.settings.deductEdge = false;
    assert.deepEqual(generateParts(project).map(part => [part.id, part.finishedWidth, part.finishedHeight, part.position, part.finishedOutline]), assembly);
    assert.equal(getCabinetLayout(cabinet, project).bodyDepth, cabinet.depth - (includeBack ? 3 : 0));
  }
});

test('facades keep all four open edges, drawer joints and backs remain raw, and pull-out shelves keep accessible sides', () => {
  const { project, cabinet } = fixture();
  Object.assign(cabinet.layout, { front: 'doors', doors: 2, shelves: 0, internalDrawerCount: 2 });
  const fronts = getFrontLayout(cabinet, project), parts = generateParts(project);
  for (const facade of parts.filter(part => /Дверь \d+/.test(part.name) || part.role === 'internal-drawer-front')) assert.deepEqual(edges(facade), [1, 1, 1, 1]);
  for (const wall of parts.filter(part => part.role === 'internal-drawer-box' && !part.name.endsWith('дно'))) assert.deepEqual(edges(wall), [1, 0, 0, 0]);
  for (const raw of parts.filter(part => part.role === 'back' || part.name.endsWith('дно'))) assert.deepEqual(edges(raw), [0, 0, 0, 0]);
  const hardware = getProjectHardwareSchedule(project);
  project.settings.deductEdge = false;
  assert.deepEqual(getFrontLayout(cabinet, project), fronts);
  assert.deepEqual(getProjectHardwareSchedule(project), hardware);
  Object.assign(cabinet.layout, { front: 'open', internalDrawerCount: 0, pullOutShelf: true });
  project.settings.deductEdge = true;
  const pullOut = generateParts(project).find(part => part.role === 'pull-out-shelf');
  assert.deepEqual(edges(pullOut), [0, 1, 1, 1]);
  assert.equal(pullOut.finishedWidth - pullOut.width, 2);
  assert.equal(pullOut.finishedHeight - pullOut.height, 1);
});

test('edge quotes follow exposed finished lengths and stock packing follows the reduced blanks', () => {
  const { project } = fixture();
  project.materials.forEach(material => { material.pricePerSheet = 0; });
  project.settings.pricing = { handlePrice: 0, guideSetPrice: 0, hingePrice: 0, edgeBandPricePerMeter: 10 };
  const parts = generateParts(project), summary = getEdgeBandingSummary(parts), estimate = getProjectCostEstimate(project);
  assert.equal(estimate.complete, true);
  assert.equal(estimate.total, Math.round(summary.lengthMeters * 1000) / 100);
  const cutting = optimizeCutting(parts, project.materials, project.settings), shelf = parts.find(part => part.name.includes('полка 1'));
  const packed = cutting.sheets.flatMap(sheet => sheet.placements).find(placement => placement.partId === shelf.id);
  assert.deepEqual([packed.width, packed.height].sort((a, b) => a - b), [shelf.width, shelf.height].sort((a, b) => a - b));
  project.settings.deductEdge = false;
  assert.deepEqual(getEdgeBandingSummary(generateParts(project)), summary);
  assert.equal(getProjectCostEstimate(project).total, estimate.total);
});

test('an impossible edged return blank stays visible to validation and packing without corrupting physical geometry or area', () => {
  const { project, cabinet } = fixture({ cutout: { corner: 'back-left', width: 300, depth: 3.5 } });
  const side = panel(project, 'Возвратная');
  assert.equal(side.finishedWidth, .5);
  assert.equal(side.width, -.5);
  assert.equal(side.area, 0);
  assert.ok(validateProject(project).some(item => item.level === 'error' && item.message.includes('недостаточно внутреннего пространства')));
  assert.ok(optimizeCutting(generateParts(project), project.materials, project.settings).unplaced.some(part => part.partId === side.id));
  assert.doesNotThrow(() => findFreeRodPosition(cabinet, project, 'opening'));
  const valid = structuredClone(cabinet); valid.cutout.depth = 180;
  const result = constrainCabinetEdit(valid, cabinet, { ...project, cabinets: [valid] });
  assert.ok(!result.possible || result.clamped);
  assert.ok(generateParts({ ...project, cabinets: [result.cabinet] }).every(part => part.width > 0 && part.height > 0));
});
