import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, generateParts, getFrontLayout, getInternalDrawerLayout, getCabinetLayout, getSectionMountingAxes, getCabinetFootprint, createSection, convertLegacyLayout, findLayoutNode, splitSection, mergeSection, resizeSection, resizeDivider, resizeSectionAdjacent, removeSection, extendCabinetSide, getPartEdgeBanding, getEdgeBandingSummary, getApplianceClearances, getApplianceFit, getRoomInstallationClearance, validateCabinetPlacement, canPlaceCabinet, canEditCabinetPlacement, validateProject, optimizeCutting, getProjectStats } from '../src/engine.js';

const cabinetProject = overrides => {
  const project = createDefaultProject();
  delete project.room.outline;
  delete project.room.installationClearance;
  // These tests model an explicitly saved workshop stock, not new catalog
  // defaults. Changing confirmed factory presets must not reinterpret it.
  const gauges = { 'mdf-drawer': 16, 'hdf-back': 3, 'hdf-bottom': 6 };
  project.materials = project.materials.map(material => gauges[material.id] ? { id: material.id, name: 'Пользовательская тестовая плита', type: 'Пользовательский материал', thickness: gauges[material.id], color: material.color, sheetWidth: 2100, sheetHeight: 2800, grain: false, edgeBand: 0 } : material);
  for (const [id, thickness] of Object.entries(gauges)) if (!project.materials.some(material => material.id === id)) project.materials.push({ id, name: 'Пользовательская тестовая плита', type: 'Пользовательский материал', thickness, color: '#eeeee9', sheetWidth: 2100, sheetHeight: 2800, grain: false, edgeBand: 0 });
  project.room.windows = [{ id: 'legacy-window', wall: 'right', offset: 1300, width: 1400, height: 1200, sill: 900 }];
  const { layout, ...cabinet } = project.cabinets[0];
  project.cabinets = [{ ...cabinet, type: 'base', width: 800, height: 860, depth: 580, x: 300, z: 0, sidesToFloor: false, backThickness: 3, drawerBottomThickness: 6, drawerMaterialId: 'mdf-drawer', drawerBottomMaterialId: 'hdf-bottom', doors: 2, drawers: 0, shelves: 1, frontMaterialId: 'mdf-sage', ...overrides }];
  return project;
};
const part = (id, width, height, overrides = {}) => ({ id, name: id, cabinetName: 'Test', materialId: 'stock', thickness: 18, width, height, quantity: 1, grain: false, ...overrides });
const stock = { id: 'stock', name: 'MDF', thickness: 18, sheetWidth: 1000, sheetHeight: 1000 };

test('carcass dimensions preserve outer dimensions and applied back', () => {
  const project = cabinetProject();
  const parts = generateParts(project);
  assert.equal(parts.length, 9);
  const side = parts.find(item => item.name === 'Боковина левая');
  assert.deepEqual([side.width, side.height, side.thickness], [577, 760, 18]);
  const top = parts.find(item => item.name === 'Крышка');
  assert.deepEqual([top.width, top.height], [764, 577]);
  const shelf = parts.find(item => item.name === 'Полка 1');
  assert.deepEqual([shelf.width, shelf.height], [760, 557]);
  const back = parts.find(item => item.name === 'Задняя стенка');
  assert.deepEqual([back.width, back.height, back.thickness], [800, 760, 3]);
  const doors = parts.filter(item => item.name.startsWith('Дверь'));
  assert.deepEqual(doors.map(item => [item.width, item.height]), [[397, 756], [397, 756]]);
  const plinth = parts.find(item => item.name === 'Цокольная планка');
  assert.deepEqual([plinth.width, plinth.height], [796, 90]);
  assert.equal(parts.find(item => item.name === 'Дверь 1').grain, false);
});

test('drawer boxes use per-side runner clearance and 16 mm stock', () => {
  const project = cabinetProject({ doors: 0, drawers: 3, shelves: 0 });
  const parts = generateParts(project);
  assert.equal(parts.length, 24);
  const front = parts.find(item => item.name === 'Фасад ящика 1');
  assert.deepEqual([front.width, front.height], [796, 250.667]);
  const side = parts.find(item => item.name === 'Ящик 1 · боковина левая');
  assert.deepEqual([side.width, side.height, side.thickness, side.materialId], [537, 204.667, 16, 'mdf-drawer']);
  const drawerFront = parts.find(item => item.name === 'Ящик 1 · передняя стенка');
  assert.deepEqual([drawerFront.width, drawerFront.height], [706, 204.667]);
  const bottom = parts.find(item => item.name === 'Ящик 1 · дно');
  assert.deepEqual([bottom.width, bottom.height, bottom.thickness, bottom.materialId], [738, 537, 6, 'hdf-bottom']);
});

test('mixed doors and drawers share height without overlap or plinth', () => {
  const project = cabinetProject({ doors: 2, drawers: 2 });
  const cabinet = project.cabinets[0];
  const layout = getFrontLayout(cabinet);
  const doors = layout.filter(item => item.kind === 'door');
  const drawers = layout.filter(item => item.kind === 'drawer');
  assert.equal(doors[0].height, 451.2);
  assert.equal(drawers[0].height, 150.4);
  assert.equal(drawers[0].y, doors[0].y + doors[0].height + cabinet.gap);
  assert.equal(drawers[1].y + drawers[1].height, cabinet.height - cabinet.plinth - cabinet.gap);
  assert.equal(layout.every(item => item.y >= cabinet.gap && item.y + item.height <= 760 - cabinet.gap + 0.001), true);
});

test('shelves cannot cross pure drawer boxes and mixed shelves use door-zone height', () => {
  const pureDrawer = cabinetProject({ doors: 0, drawers: 3, shelves: 1 });
  assert.equal(validateProject(pureDrawer).some(item => item.level === 'error' && item.message.includes('полки пересекают короба')), true);
  assert.equal(generateParts(pureDrawer).some(item => item.name === 'Полка 1'), true);
  pureDrawer.cabinets[0].shelves = 0;
  assert.deepEqual(validateProject(pureDrawer), []);
  const mixed = cabinetProject({ doors: 2, drawers: 2, shelves: 5 });
  assert.equal(validateProject(mixed).some(item => item.level === 'error' && item.message.includes('полки пересекают короба')), false);
  assert.equal(validateProject(mixed).some(item => item.level === 'warning' && item.message.includes('менее 80 мм')), true);
});

test('edge band deductions are optional and preserve finished size', () => {
  const project = cabinetProject();
  project.settings.deductEdge = true;
  const door = generateParts(project).find(item => item.name === 'Дверь 1');
  assert.deepEqual([door.width, door.height, door.finishedWidth, door.finishedHeight], [395, 754, 397, 756]);
  assert.equal(getProjectStats(project).edgeLength > 0, true);
});

test('validation rejects invalid geometry, missing material, collision, windows and counts', () => {
  const project = cabinetProject({ width: 20, drawers: 100, materialId: 'missing', x: -20 });
  project.room.windows[0].sill = 2500;
  const warnings = validateProject(project);
  assert.equal(warnings.some(item => item.level === 'error' && item.message.includes('внутреннего пространства')), true);
  assert.equal(warnings.some(item => item.message.includes('отсутствующий материал')), true);
  assert.equal(warnings.some(item => item.message.includes('число ящиков')), true);
  assert.equal(warnings.some(item => item.message.includes('Оконный проём выходит')), true);
  const collision = cabinetProject();
  collision.cabinets.push({ ...collision.cabinets[0], id: 'duplicate-position' });
  assert.equal(validateProject(collision).some(item => item.message.includes('пересекается')), true);
  assert.doesNotThrow(() => validateProject(null));
});

test('valid default project has no errors, correct stock thicknesses and can be cut', () => {
  const project = createDefaultProject();
  assert.equal(project.cabinets.length, 1);
  assert.deepEqual(validateProject(project), []);
  const parts = generateParts(project);
  for (const item of parts) assert.equal(item.thickness, project.materials.find(material => material.id === item.materialId).thickness);
  const stats = getProjectStats(project);
  assert.equal(stats.cabinetCount, 1);
  assert.equal(stats.cutting.unplaced.length, 0);
  assert.equal(stats.totalArea > 0 && stats.sheetCount > 0 && stats.utilization <= 100, true);
  assert.equal(createCabinet('wall', project).plinth, 0);
  assert.equal(createCabinet('tall', project).drawerMaterialId, 'mdf-white');
});

test('library dimensions are applied before safe free placement', () => {
  const project = createDefaultProject();
  const added = createCabinet('tall', project, { id: 'shelf', name: 'Стеллаж', width: 800, height: 1800, depth: 350, doors: 0, drawers: 0, shelves: 4 });
  assert.notEqual(added.id, 'shelf');
  assert.deepEqual([added.width, added.height, added.depth, added.doors], [800, 1800, 350, 0]);
  project.cabinets.push(added);
  assert.deepEqual(validateProject(project).filter(item => item.level === 'error'), []);
  const lowRoom = createDefaultProject();
  lowRoom.room.height = 2000;
  lowRoom.cabinets = [];
  assert.equal(createCabinet('wall', lowRoom).y, 1260);
});

test('fractional counts, wall proportions and front protrusion are validated', () => {
  const project = cabinetProject({ doors: 1.5, drawers: 2.25, shelves: 1.1 });
  const warnings = validateProject(project);
  assert.equal(warnings.filter(item => item.message.includes('должно быть целым')).length, 3);
  const smallRoom = cabinetProject();
  smallRoom.room.width = 500;
  smallRoom.room.wallThickness = 300;
  assert.equal(validateProject(smallRoom).some(item => item.message.includes('Толщина стен слишком велика')), true);
  const outer = cabinetProject({ z: 2820 });
  assert.equal(validateProject(outer).some(item => item.message.includes('с учётом толщины фасада')), true);
  outer.cabinets[0].doors = 0;
  assert.equal(validateProject(outer).some(item => item.message.includes('с учётом толщины фасада')), false);
  const collision = cabinetProject({ z: 0 });
  collision.cabinets.push({ ...collision.cabinets[0], id: 'behind-front', z: 580, doors: 0 });
  assert.equal(validateProject(collision).some(item => item.message.includes('пересекается')), true);
});

test('packing preserves margins and minimum saw gap without overlaps', () => {
  const parts = [part('a', 470, 470), part('b', 470, 470), part('c', 470, 470), part('d', 470, 470), part('e', 150, 300), part('f', 400, 210), part('g', 280, 210)];
  const result = optimizeCutting(parts, [stock], { kerf: 3, margin: 10, allowRotate: true });
  assert.equal(result.unplaced.length, 0);
  assert.equal(result.placedParts, parts.length);
  for (const sheet of result.sheets) {
    for (const placement of sheet.placements) {
      assert.equal(placement.x >= 10 && placement.y >= 10, true);
      assert.equal(placement.x + placement.width <= 990.001 && placement.y + placement.height <= 990.001, true);
    }
    for (let index = 0; index < sheet.placements.length; index++) {
      for (let next = index + 1; next < sheet.placements.length; next++) {
        const a = sheet.placements[index], b = sheet.placements[next];
        const separated = a.x + a.width + 3 <= b.x + 0.001 || b.x + b.width + 3 <= a.x + 0.001 || a.y + a.height + 3 <= b.y + 0.001 || b.y + b.height + 3 <= a.y + 0.001;
        assert.equal(separated, true, `${a.partId} overlaps ${b.partId}`);
      }
    }
  }
});

test('exact usable-size panel fits despite kerf and edge margins', () => {
  const result = optimizeCutting([part('full', 980, 980)], [stock], { kerf: 3, margin: 10 });
  assert.equal(result.totalSheets, 1);
  assert.equal(result.unplaced.length, 0);
  assert.deepEqual(result.sheets[0].placements[0] && [result.sheets[0].placements[0].x, result.sheets[0].placements[0].y], [10, 10]);
});

test('grain and disabled rotation reject an oversized orientation', () => {
  const rectangularStock = { ...stock, sheetWidth: 500, sheetHeight: 1000 };
  const rotated = optimizeCutting([part('rotates', 800, 400)], [rectangularStock], { margin: 10, allowRotate: true });
  assert.equal(rotated.sheets[0].placements[0].rotated, true);
  assert.equal(optimizeCutting([part('grain', 800, 400, { grain: true })], [rectangularStock], { margin: 10 }).unplaced.length, 1);
  assert.equal(optimizeCutting([part('locked', 800, 400)], [rectangularStock], { margin: 10, allowRotate: false }).unplaced.length, 1);
});

test('stock groups isolate material ID and panel thickness', () => {
  const result = optimizeCutting([
    part('a', 100, 100), part('b', 100, 100, { materialId: 'second' }), part('c', 100, 100, { thickness: 16 })
  ], [stock, { ...stock, id: 'second' }], { margin: 10, kerf: 3 });
  assert.equal(result.totalSheets, 3);
  assert.deepEqual(result.sheets.map(sheet => [sheet.materialId, sheet.thickness]), [['stock', 18], ['second', 18], ['stock', 16]]);
});

test('oversized and malformed panels are unplaced, never scaled to fit', () => {
  const result = optimizeCutting([part('large', 2000, 2000), part('missing', 100, 100, { materialId: 'none' }), part('invalid', -10, 100)], [stock], { margin: 10 });
  assert.equal(result.totalSheets, 0);
  assert.equal(result.unplaced.length, 3);
  assert.equal(result.totalParts, 3);
  assert.equal(result.utilization, 0);
  assert.equal(result.wasteArea, 0);
});

test('packing does not mutate inputs and handles a deterministic larger sample', () => {
  const source = Array.from({ length: 80 }, (_, index) => part(`panel-${index}`, 80 + (index * 113) % 410, 90 + (index * 79) % 440, { grain: index % 4 === 0 }));
  const snapshot = JSON.stringify(source);
  const settings = { margin: 15, kerf: 4, allowRotate: true };
  const result = optimizeCutting(source, [stock], settings);
  assert.equal(JSON.stringify(source), snapshot);
  assert.equal(result.unplaced.length, 0);
  assert.equal(new Set(result.sheets.flatMap(sheet => sheet.placements.map(item => item.partId))).size, source.length);
  for (const sheet of result.sheets) {
    for (const a of sheet.placements) for (const b of sheet.placements) {
      if (a.partId === b.partId) continue;
      assert.equal(a.x + a.width + 4 <= b.x + 0.001 || b.x + b.width + 4 <= a.x + 0.001 || a.y + a.height + 4 <= b.y + 0.001 || b.y + b.height + 4 <= a.y + 0.001, true);
    }
  }
});

test('wardrobe has independent top doors, middle drawers and bottom doors with real dividers', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  const layout = getCabinetLayout(cabinet, project);
  assert.deepEqual(layout.sections.map(section => [section.id, section.y, section.height]), [['section-top', 1182, 900], ['section-middle', 684, 480], ['section-bottom', 18, 648]]);
  assert.equal(layout.partitions.length, 2);
  assert.equal(layout.partitions[0].parentId, 'wardrobe-layout');
  assert.equal(layout.partitions[0].beforeChildId, 'section-top');
  const fronts = getFrontLayout(cabinet, project);
  assert.equal(fronts.filter(front => front.kind === 'drawer').length, 2);
  assert.equal(fronts.filter(front => front.kind === 'door').length, 4);
  const middle = fronts.filter(front => front.sectionId === 'section-middle');
  assert.equal(fronts.filter(front => front.sectionId === 'section-top').every(front => front.y > middle[0].y + middle[0].height), true);
  assert.equal(fronts.filter(front => front.sectionId === 'section-bottom').every(front => front.y + front.height < middle[1].y), true);
  const parts = generateParts(project);
  const drawerBottom = parts.find(item => item.sectionId === 'section-middle' && item.name.endsWith('Ящик 1 · дно'));
  assert.deepEqual([drawerBottom.width, drawerBottom.height, drawerBottom.thickness], [1138, 572, 8]);
  const drawerSide = parts.find(item => item.sectionId === 'section-middle' && item.name.endsWith('Ящик 1 · боковина левая'));
  assert.deepEqual([drawerSide.width, drawerSide.height], [572, 199]);
  assert.equal(parts.filter(item => item.sectionId === 'section-middle').length, 12);
});

test('side-by-side sections have independent dimensions and drawer widths', () => {
  const project = cabinetProject({ width: 1200, height: 2200, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = { id: 'root', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [{ ...createSection('drawers'), id: 'left', depth: 500 }, { ...createSection('doors'), id: 'right' }] };
  const layout = getCabinetLayout(cabinet, project);
  assert.deepEqual(layout.sections.map(section => [section.x, section.width]), [[18, 573], [609, 573]]);
  assert.deepEqual([layout.partitions[0].x, layout.partitions[0].width], [591, 18]);
  const leftBottom = generateParts(project).find(item => item.sectionId === 'left' && item.name.endsWith('Ящик 1 · дно'));
  assert.deepEqual([leftBottom.width, leftBottom.height], [547, 460]);
  const leftFront = getFrontLayout(cabinet, project).find(front => front.sectionId === 'left');
  assert.deepEqual([leftFront.x, leftFront.width, leftFront.depth], [2, 597, 500]);
  cabinet.layout = { ...createSection('doors'), id: 'setback', depth: 400 };
  cabinet.z = project.room.depth - cabinet.depth;
  assert.equal(validateProject(project).some(item => item.message.includes('границы помещения')), false);
  cabinet.layout.depth = null;
  assert.equal(validateProject(project).some(item => item.message.includes('границы помещения')), true);
});

test('nested resizing finds an ancestor axis, preserves siblings and scales with the whole cabinet', () => {
  const project = cabinetProject({ width: 1500, shelves: 0 });
  const cabinet = project.cabinets[0];
  const rows = { id: 'rows', kind: 'split', axis: 'horizontal', sizes: [1, 1], children: [{ ...createSection(), id: 'leaf' }, { ...createSection(), id: 'leaf2' }] };
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 2, 3], children: [rows, { ...createSection(), id: 'b' }, { ...createSection(), id: 'c' }] };
  assert.equal(resizeSection(cabinet, 'leaf', 'vertical', 400, project), true);
  let layout = getCabinetLayout(cabinet, project);
  assert.equal(layout.sections.find(section => section.id === 'leaf').width, 400);
  const b = layout.sections.find(section => section.id === 'b'), c = layout.sections.find(section => section.id === 'c');
  assert.ok(Math.abs(b.width / c.width - 2 / 3) < 1e-9);
  assert.equal(resizeSection(cabinet, 'leaf', 'vertical', 1400, project), false);
  assert.equal(resizeSection(cabinet, 'columns', 'vertical', 400, project), false);
  cabinet.width = 1800;
  layout = getCabinetLayout(cabinet, project);
  assert.ok(layout.sections.find(section => section.id === 'leaf').width > 400);
  assert.ok(Math.abs(layout.sections.find(section => section.id === 'b').width / layout.sections.find(section => section.id === 'c').width - 2 / 3) < 1e-9);
});

test('split/merge editing is explicit and legacy front dimensions survive until conversion', () => {
  const project = cabinetProject({ doors: 2, drawers: 2, shelves: 1 });
  const cabinet = project.cabinets[0];
  const old = getFrontLayout(cabinet);
  const converted = convertLegacyLayout(cabinet);
  assert.equal(cabinet.layout, undefined);
  assert.deepEqual(getFrontLayout(cabinet), old);
  assert.equal(getCabinetLayout(cabinet, project).partitions.length, 0);
  cabinet.layout = converted;
  assert.equal(getCabinetLayout(cabinet, project).partitions.length, 1);
  const leaf = converted.children[1];
  assert.equal(findLayoutNode(converted, leaf.id), leaf);
  assert.equal(splitSection(cabinet, leaf.id, 'vertical'), true);
  assert.equal(getCabinetLayout(cabinet, project).sections.length, 3);
  assert.equal(mergeSection(cabinet, leaf.id), true);
  assert.equal(findLayoutNode(cabinet.layout, leaf.id).kind, 'section');
});

test('L rear cutout creates bounded contours, shortened sides and return panels', () => {
  const project = cabinetProject({ width: 1200, height: 2200, depth: 620, cutout: { corner: 'back-left', width: 300, depth: 180 } });
  const parts = generateParts(project);
  const top = parts.find(item => item.name === 'Крышка');
  assert.equal(top.outline.length, 6);
  assert.equal(top.area, 1164 * 617 - 300 * 180);
  assert.deepEqual(parts.filter(item => item.name.startsWith('Боковина')).map(item => item.width), [440, 617]);
  assert.equal(parts.find(item => item.name === 'Возвратная боковина выреза').width, 177);
  assert.deepEqual(parts.filter(item => item.name.startsWith('Задняя стенка')).map(item => item.width), [900, 300]);
  assert.equal(getCabinetFootprint(project.cabinets[0]).length, 6);
  const actualArea = parts.reduce((sum, item) => sum + item.area, 0);
  assert.equal(getProjectStats(project).totalArea, actualArea / 1e6);
  const cutting = optimizeCutting(parts, project.materials, project.settings);
  assert.equal(cutting.unplaced.length, 0);
  assert.equal(cutting.sheets.flatMap(sheet => sheet.placements).some(item => item.outline?.length === 6), true);
  project.cabinets[0].layout = { ...createSection('drawers'), id: 'cutout-drawers', drawers: 3 };
  const section = getCabinetLayout(project.cabinets[0], project).sections[0];
  assert.deepEqual([section.rearOffset, section.usableDepth], [180, 437]);
  const bottom = generateParts(project).find(item => item.name.endsWith('Ящик 1 · дно'));
  assert.equal(bottom.height, 397);
});

test('whole-back and per-section rear omissions generate only retained panels', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  cabinet.includeBack = false;
  assert.equal(getCabinetLayout(cabinet, project).bodyDepth, 620);
  const backPanels = () => generateParts(project).filter(item => item.orientation === 'vertical-width' && item.name.toLowerCase().includes('задняя стенка'));
  assert.equal(backPanels().length, 0);
  cabinet.layout.children[0].back = 'panel';
  let backs = backPanels();
  assert.equal(backs.length, 1);
  assert.equal(backs[0].sectionId, 'section-top');
  cabinet.includeBack = true;
  cabinet.layout.children[0].back = 'none';
  backs = backPanels();
  assert.deepEqual(backs.map(item => item.sectionId), ['section-middle', 'section-bottom']);
});

test('appliance niche checks actual editable dimensions against its opening', () => {
  const project = cabinetProject({ width: 800, height: 1000, shelves: 0, doors: 0 });
  const cabinet = project.cabinets[0];
  cabinet.includeBack = false;
  cabinet.layout = { ...createSection('open'), id: 'washer', back: 'none', appliance: { type: 'washer', width: 600, height: 850, depth: 550, label: 'Стиральная машина' } };
  assert.deepEqual(validateProject(project).filter(item => item.level === 'error'), []);
  cabinet.layout.appliance.width = 900;
  assert.equal(validateProject(project).some(item => item.message.includes('не помещается в секцию')), true);
  cabinet.layout.appliance.width = 600;
  cabinet.layout.front = 'doors';
  assert.equal(validateProject(project).some(item => item.message.includes('открытая ниша без полок')), true);
});

test('containment and collision use rotated polygons and permit an empty L notch', () => {
  const project = cabinetProject({ x: 1000, z: 1000, rotation: 90, shelves: 0 });
  assert.deepEqual(validateProject(project).filter(item => item.level === 'error'), []);
  project.cabinets[0].x = 0;
  assert.equal(validateProject(project).some(item => item.message.includes('границы помещения')), true);
  const cut = cabinetProject({ x: 300, z: 300, shelves: 0, cutout: { corner: 'back-left', width: 300, depth: 180 } });
  cut.cabinets.push({ ...cut.cabinets[0], id: 'in-notch', x: 310, z: 310, width: 150, depth: 100, height: 400, plinth: 0, doors: 0, cutout: null });
  assert.equal(validateProject(cut).some(item => item.message.includes('пересекается')), false);
  const concave = cabinetProject({ x: 800, z: 500, width: 1500, depth: 2000, shelves: 0 });
  concave.room.width = concave.room.depth = 3000;
  concave.room.windows = [];
  concave.room.outline = [{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 3000 }, { x: 2000, z: 3000 }, { x: 2000, z: 1000 }, { x: 1000, z: 1000 }, { x: 1000, z: 3000 }, { x: 0, z: 3000 }];
  assert.equal(validateProject(concave).some(item => item.message.includes('границы помещения')), true);
});

test('polygon coordinates may be negative and automatic placement uses its actual origin', () => {
  const project = createDefaultProject();
  project.room.outline = project.room.outline.map(point => ({ x: point.x - 5000, z: point.z - 1000 }));
  project.room.windows = [];
  project.cabinets[0].x -= 5000;
  project.cabinets[0].z -= 1000;
  assert.deepEqual(validateProject(project), []);
  const added = createCabinet('base', project, { width: 600, height: 860, depth: 580 });
  project.cabinets.push(added);
  assert.equal(added.x < 0, true);
  assert.deepEqual(validateProject(project).filter(item => item.level === 'error'), []);
});

const leaf = (id, extras = {}) => ({ ...createSection('open'), id, ...extras });
const split = (id, axis, sizes, children) => ({ id, kind: 'split', axis, sizes, children });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);
const sectionBounds = section => [section.x, section.y, section.width, section.height];

test('a cabinet without bottom and plinth gives an appliance a true floor opening', () => {
  const project = cabinetProject({ width: 800, height: 1200, depth: 650, plinth: 0, includeBack: false, includeBottom: false, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = leaf('floor-machine', { back: 'none', appliance: { type: 'washer', width: 600, height: 850, depth: 620 } });
  const section = getCabinetLayout(cabinet, project).sections[0];
  assert.deepEqual([section.y, section.height, section.floorEligible, section.floorExtra], [0, 1182, true, 0]);
  const parts = generateParts(project);
  assert.equal(parts.some(item => item.name.startsWith('Дно корпуса') || item.role === 'plinth'), false);
  assert.equal(parts.find(item => item.name === 'Крышка').position.y, 1182);
  assert.equal(parts.some(item => item.name.includes('задняя стенка')), false);
  assert.deepEqual(validateProject(project), []);
});

test('a central portal reaches the floor while side columns retain bottoms and plinths', () => {
  const project = cabinetProject({ width: 2400, height: 2200, depth: 650, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = split('columns', 'vertical', [1, 2, 1], [
    leaf('left-cupboard', { front: 'doors' }),
    split('central-rows', 'horizontal', [500, 1546], [leaf('over-bed', { front: 'doors' }), leaf('bed-portal', { floor: 'open', back: 'none' })]),
    leaf('right-cupboard', { front: 'doors' })
  ]);
  const layout = getCabinetLayout(cabinet, project);
  const portal = layout.sections.find(section => section.id === 'bed-portal');
  assert.deepEqual([portal.y, portal.height, portal.floorExtra, portal.floorEligible, portal.floorOpen], [-100, 1664, 118, true, true]);
  assert.equal(cabinet.y + cabinet.plinth + portal.y, 0);
  const vertical = layout.partitions.filter(item => item.axis === 'vertical');
  assert.equal(vertical.every(item => item.y === -100 && item.height === 2182 && item.floorExtended), true);
  const parts = generateParts(project);
  const bottoms = parts.filter(item => item.name.startsWith('Дно корпуса'));
  assert.deepEqual(bottoms.map(item => [item.position.x, item.width]), [[18, 582], [1800, 582]]);
  const plinths = parts.filter(item => item.role === 'plinth');
  assert.equal(plinths.length, 2);
  assert.equal(plinths.every(item => item.orientation === 'vertical-width' && item.position.y === -100), true);
  assert.equal(plinths.every(item => item.position.x + item.width <= portal.x || item.position.x >= portal.x + portal.width), true);
  const dividerParts = parts.filter(item => item.orientation === 'vertical-depth' && item.partitionId);
  assert.equal(dividerParts.every(item => item.position.y === -100 && item.height === 2182), true);
  assert.equal(parts.filter(item => item.name.startsWith('Боковина')).every(item => item.position.y === 0 && item.height === 2100), true);
  assert.equal(parts.some(item => item.sectionId === 'bed-portal' && item.name.includes('задняя стенка')), false);
  assert.deepEqual(validateProject(project), []);
});

test('opening the outer floor extends its outer side and rejects floor mode on an upper leaf', () => {
  const project = cabinetProject({ width: 1200, height: 2200, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = split('outer-columns', 'vertical', [1, 1], [leaf('outer-portal', { floor: 'open' }), leaf('closed')]);
  let parts = generateParts(project);
  assert.deepEqual([parts.find(item => item.name === 'Боковина левая').position.y, parts.find(item => item.name === 'Боковина левая').height], [-100, 2200]);
  assert.deepEqual([parts.find(item => item.name === 'Боковина правая').position.y, parts.find(item => item.name === 'Боковина правая').height], [0, 2100]);
  cabinet.layout = split('rows', 'horizontal', [1, 1], [leaf('upper', { floor: 'open' }), leaf('lower')]);
  const upper = getCabinetLayout(cabinet, project).sections.find(section => section.id === 'upper');
  assert.equal(upper.floorOpen, false);
  assert.equal(upper.floorExtra, 0);
  assert.equal(validateProject(project).some(item => item.level === 'warning' && item.message.includes('не касается основания')), true);
});

test('rear brace positions use the whole cabinet bottom and detect actual machine overlap', () => {
  const project = cabinetProject({ width: 800, height: 1200, depth: 650, includeBack: false, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = leaf('washer-floor', { floor: 'open', back: 'none', appliance: { type: 'washer', width: 600, height: 850, depth: 650 } });
  cabinet.rearBraces = [{ id: 'rail-upper', y: 1000, height: 100, materialId: 'mdf-oak' }];
  const brace = generateParts(project).find(item => item.braceId === 'rail-upper');
  assert.deepEqual([brace.width, brace.height, brace.thickness, brace.materialId, brace.role, brace.orientation], [764, 100, 18, 'mdf-oak', 'brace', 'vertical-width']);
  assert.deepEqual(brace.position, { x: 18, y: 900, z: 0 });
  assert.deepEqual(validateProject(project), []);
  cabinet.rearBraces[0].y = 700;
  assert.equal(validateProject(project).some(item => item.message.includes('перемычка пересекает технику')), true);
  cabinet.rearBraces[0].y = 1150;
  assert.equal(validateProject(project).some(item => item.message.includes('перемычка выходит за высоту')), true);
  cabinet.rearBraces[0] = { id: 'rail-default', y: 1000, height: 100 };
  assert.equal(generateParts(project).find(item => item.braceId).materialId, cabinet.materialId);
  cabinet.rearBraces.push({ id: 'rail-duplicate-space', y: 1050, height: 100 });
  assert.equal(validateProject(project).some(item => item.message.includes('перемычки пересекаются')), true);
  cabinet.rearBraces[1].y = 1100;
  assert.equal(validateProject(project).some(item => item.message.includes('перемычки пересекаются')), false);
});

test('a laundry pull-out shelf is one real panel in its own opening without drawer boxes', () => {
  const project = cabinetProject({ width: 800, height: 2000, depth: 650, plinth: 0, includeBack: false, includeBottom: false, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = split('laundry', 'horizontal', [1004, 60, 882], [
    leaf('dryer', { back: 'none', appliance: { type: 'dryer', width: 600, height: 850, depth: 600 } }),
    leaf('laundry-shelf', { back: 'none', pullOutShelf: true }),
    leaf('washer', { back: 'none', appliance: { type: 'washer', width: 600, height: 850, depth: 600 } })
  ]);
  const section = getCabinetLayout(cabinet, project).sections.find(item => item.id === 'laundry-shelf');
  const parts = generateParts(project);
  const shelfParts = parts.filter(item => item.sectionId === 'laundry-shelf');
  assert.equal(shelfParts.length, 1);
  const shelf = shelfParts[0];
  assert.deepEqual([shelf.width, shelf.height, shelf.thickness, shelf.component, shelf.orientation], [738, 610, 18, 'pull-out-shelf', 'horizontal']);
  assert.deepEqual(shelf.position, { x: 31, y: section.y + 5, z: 20 });
  assert.equal(parts.some(item => item.name.includes('Ящик') || item.name.includes('Фасад ящика')), false);
  assert.equal(getCabinetLayout(cabinet, project).sections.find(item => item.id === 'washer').y, 0);
  assert.deepEqual(validateProject(project), []);
  cabinet.layout.children[1].appliance = { type: 'custom', width: 100, height: 10, depth: 50 };
  assert.equal(validateProject(project).some(item => item.message.includes('поместите её в отдельный проём')), true);
});

test('divider movement changes only its two physical neighbours through nested same-axis branches', () => {
  const project = cabinetProject({ width: 1800, height: 1000, plinth: 0, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = split('root-columns', 'vertical', [700, 500, 528], [
    split('left-subcolumns', 'vertical', [1, 1], [leaf('a'), leaf('b')]),
    split('middle-subcolumns', 'vertical', [200, 282], [leaf('d'), leaf('e')]),
    leaf('far')
  ]);
  const before = getCabinetLayout(cabinet, project), old = Object.fromEntries(before.sections.map(item => [item.id, item]));
  assert.equal(resizeDivider(cabinet, 'root-columns-divider-0', 'vertical', 800, project), true);
  const after = Object.fromEntries(getCabinetLayout(cabinet, project).sections.map(item => [item.id, item]));
  for (const id of ['a', 'e', 'far']) assert.deepEqual(sectionBounds(after[id]), sectionBounds(old[id]));
  near(after.b.width, old.b.width + 100);
  near(after.b.x, old.b.x);
  near(after.d.width, old.d.width - 100);
  near(after.d.x, old.d.x + 100);
  const snapshot = JSON.stringify(cabinet.layout);
  assert.equal(resizeDivider(cabinet, 'root-columns-divider-0', 'vertical', 900, project), false);
  assert.equal(JSON.stringify(cabinet.layout), snapshot);
  assert.equal(resizeDivider(cabinet, 'missing', 'vertical', 800, project), false);
});

test('numeric floor-opening height subtracts its floor extension and preserves unrelated rows', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  cabinet.layout.children[2].floor = 'open';
  const before = getCabinetLayout(cabinet, project);
  assert.equal(before.sections.find(item => item.id === 'section-bottom').height, 766);
  assert.equal(resizeSectionAdjacent(cabinet, 'section-bottom', 'horizontal', 800, project), true);
  const after = getCabinetLayout(cabinet, project);
  const bottom = after.sections.find(item => item.id === 'section-bottom');
  near(bottom.height, 800);
  near(bottom.floorExtra, 118);
  near(after.nodes.find(item => item.id === 'section-bottom').height, 682);
  assert.deepEqual(sectionBounds(after.sections[0]), sectionBounds(before.sections[0]));
  near(after.sections[1].height, before.sections[1].height - 34);
});

test('numeric width editing crosses a row parent and changes the adjacent column only', () => {
  const project = cabinetProject({ width: 1800, height: 1000, plinth: 0, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = split('columns', 'vertical', [700, 500, 528], [split('rows', 'horizontal', [1, 1], [leaf('top'), leaf('bottom')]), leaf('adjacent'), leaf('far')]);
  const before = getCabinetLayout(cabinet, project);
  assert.equal(resizeSectionAdjacent(cabinet, 'top', 'vertical', 750, project), true);
  const after = getCabinetLayout(cabinet, project);
  near(after.sections.find(item => item.id === 'top').width, 750);
  near(after.sections.find(item => item.id === 'bottom').width, 750);
  near(after.sections.find(item => item.id === 'adjacent').width, 450);
  assert.deepEqual(sectionBounds(after.sections.find(item => item.id === 'far')), sectionBounds(before.sections.find(item => item.id === 'far')));
});

test('deleting a leaf preserves remaining contents and the third opening geometry', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  const top = cabinet.layout.children[0], bottom = cabinet.layout.children[2];
  const before = getCabinetLayout(cabinet, project).sections[0];
  assert.equal(removeSection(cabinet, 'section-middle', project), true);
  assert.equal(cabinet.layout.children[0], top);
  assert.equal(cabinet.layout.children[1], bottom);
  assert.deepEqual(cabinet.layout.children.map(item => item.front), ['doors', 'doors']);
  assert.deepEqual(sectionBounds(getCabinetLayout(cabinet, project).sections[0]), sectionBounds(before));
  near(getCabinetLayout(cabinet, project).sections[1].height, 1146);
  assert.equal(removeSection(cabinet, 'section-top', project), true);
  assert.equal(cabinet.layout, bottom);
  assert.equal(cabinet.layout.doors, 2);
  assert.equal(getCabinetLayout(cabinet, project).partitions.length, 0);
  assert.equal(removeSection(cabinet, 'section-bottom', project), false);
});

test('deleting next to a nested branch grows its nearest edge without changing far openings', () => {
  const project = cabinetProject({ width: 1800, height: 1000, plinth: 0, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = split('columns', 'vertical', [300, 700, 728], [leaf('remove'), split('nested', 'vertical', [250, 432], [leaf('grow', { front: 'doors' }), leaf('keep', { front: 'drawers' })]), leaf('far', { front: 'doors' })]);
  const before = Object.fromEntries(getCabinetLayout(cabinet, project).sections.map(item => [item.id, item]));
  assert.equal(removeSection(cabinet, 'remove', project), true);
  const after = Object.fromEntries(getCabinetLayout(cabinet, project).sections.map(item => [item.id, item]));
  assert.deepEqual(sectionBounds(after.keep), sectionBounds(before.keep));
  assert.deepEqual(sectionBounds(after.far), sectionBounds(before.far));
  near(after.grow.width, before.grow.width + 318);
  assert.equal(findLayoutNode(cabinet.layout, 'grow').front, 'doors');
  assert.equal(findLayoutNode(cabinet.layout, 'keep').front, 'drawers');
});

test('horizontal splitting keeps a floor opening and its machine in the lower child', () => {
  const project = cabinetProject({ width: 800, height: 2200, depth: 650, includeBack: false, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  const machine = { type: 'washer', width: 600, height: 850, depth: 620 };
  cabinet.layout = leaf('machine-portal', { floor: 'open', back: 'none', appliance: machine });
  assert.equal(splitSection(cabinet, 'machine-portal', 'horizontal'), true);
  const [upper, lower] = cabinet.layout.children;
  assert.equal(upper.floor, 'inherit');
  assert.equal(upper.appliance, undefined);
  assert.equal(lower.floor, 'open');
  assert.deepEqual(lower.appliance, machine);
  assert.equal(lower.back, 'none');
  const section = getCabinetLayout(cabinet, project).sections.find(item => item.id === lower.id);
  assert.equal(section.y + cabinet.plinth, 0);
  assert.equal(generateParts(project).some(item => item.name.startsWith('Дно корпуса') || item.role === 'plinth'), false);
  assert.deepEqual(validateProject(project), []);
});

test('installation clearances are opt-in and calculate separate opening requirements', () => {
  const appliance = { type: 'washer', width: 600, height: 850, depth: 600, clearances: { side: 25, top: 25, rear: 50 } };
  const section = { width: 625, height: 850, depth: 700, usableDepth: 620 };
  assert.deepEqual(getApplianceClearances(appliance), { side: 0, top: 0, rear: 0 });
  let fit = getApplianceFit(section, appliance);
  assert.deepEqual(fit.required, { width: 600, height: 850, depth: 600 });
  assert.equal(fit.fits, true);
  appliance.useClearances = true;
  fit = getApplianceFit(section, appliance);
  assert.deepEqual(fit.required, { width: 650, height: 875, depth: 650 });
  assert.deepEqual(fit.available, { width: 625, height: 850, depth: 620 });
  assert.deepEqual(fit.deficits, { width: 25, height: 25, depth: 30 });
  assert.equal(fit.fits, false);
  assert.equal(fit.physicalFits, true);
  const exact = getApplianceFit({ width: 650, height: 875, usableDepth: 650 }, appliance);
  assert.equal(exact.fits, true);
  assert.deepEqual(exact.deficits, { width: 0, height: 0, depth: 0 });
  appliance.useClearances = false;
  assert.deepEqual(getApplianceClearances(appliance), { side: 0, top: 0, rear: 0 });
  assert.equal(getApplianceFit(section, appliance).fits, true);
});

test('enabled clearance diagnostics report each exact deficit without changing actual construction', () => {
  const project = cabinetProject({ width: 661, height: 868, depth: 620, plinth: 0, includeBottom: false, includeBack: false, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = leaf('washer', { back: 'none', appliance: { type: 'washer', label: 'Стиральная машина', width: 600, height: 850, depth: 600, useClearances: true, clearances: { side: 25, top: 25, rear: 50 } } });
  const partsBefore = generateParts(project);
  const diagnostics = validateProject(project);
  assert.equal(diagnostics.length, 3);
  assert.equal(diagnostics.every(item => item.level === 'warning'), true);
  for (const phrase of ['по ширине не хватает 25 мм', 'по высоте не хватает 25 мм', 'по глубине не хватает 30 мм']) assert.equal(diagnostics.some(item => item.message.includes(phrase)), true);
  cabinet.layout.appliance.useClearances = false;
  assert.deepEqual(validateProject(project), []);
  assert.deepEqual(generateParts(project), partsBefore);
  delete cabinet.layout.appliance.useClearances;
  delete cabinet.layout.appliance.clearances;
  assert.deepEqual(validateProject(project), []);
});

test('physical appliance excess remains per-axis errors while installation deficits are warnings', () => {
  const project = cabinetProject({ width: 600, height: 850, depth: 500, plinth: 0, includeBottom: false, includeBack: false, doors: 0, shelves: 0 });
  const cabinet = project.cabinets[0];
  cabinet.layout = leaf('oversize-machine', { back: 'none', appliance: { type: 'washer', width: 600, height: 850, depth: 600, useClearances: true, clearances: { side: 25, top: 25, rear: 50 } } });
  const diagnostics = validateProject(project);
  assert.equal(diagnostics.length, 3);
  assert.equal(diagnostics.every(item => item.level === 'error'), true);
  for (const phrase of ['по ширине: не хватает 36 мм', 'по высоте: не хватает 18 мм', 'по глубине: не хватает 100 мм']) assert.equal(diagnostics.some(item => item.message.includes(phrase)), true);
  assert.equal(diagnostics.some(item => item.message.endsWith('не помещается в секцию «oversize-machine».')), false);
  assert.equal(getApplianceFit(getCabinetLayout(cabinet, project).sections[0], cabinet.layout.appliance).physicalFits, false);
});

test('new project uses confirmed catalog stocks while explicit workshop gauges remain unchanged', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  assert.equal(project.materials.every(material => material.manufacturer === 'Yıldız Entegre' && material.sourceUrl.startsWith('https://www.yildizentegre.com/')), true);
  assert.equal(project.materials.every(material => [8, 18, 25].includes(material.thickness)), true);
  assert.equal(project.materials.some(material => /ХДФ|HDF|16 мм|3 мм|6 мм/i.test(material.name)), false);
  assert.deepEqual([cabinet.backThickness, cabinet.drawerBottomThickness], [8, 8]);
  assert.equal(project.materials.find(material => material.id === cabinet.drawerMaterialId).thickness, 18);
  const added = createCabinet('base', project);
  assert.deepEqual([added.backThickness, added.drawerBottomThickness], [8, 8]);
  assert.equal(project.materials.find(material => material.id === added.drawerMaterialId).thickness, 18);
  const legacy = cabinetProject({ doors: 0, drawers: 2, shelves: 0 });
  const legacyAdded = createCabinet('base', legacy);
  assert.deepEqual([legacyAdded.backThickness, legacyAdded.drawerBottomThickness], [3, 6]);
  assert.equal(legacy.materials.find(material => material.id === legacyAdded.drawerMaterialId).thickness, 16);
});

test('new identical white carcass/drawer and back/bottom roles share cutting stock IDs', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  assert.equal(project.materials.some(material => material.id === 'mdf-drawer' || material.id === 'hdf-bottom'), false);
  assert.equal(new Set(project.materials.map(material => `${material.decorCode}:${material.type}:${material.thickness}:${material.sheetWidth}:${material.sheetHeight}`)).size, project.materials.length);
  assert.equal(cabinet.drawerMaterialId, cabinet.materialId);
  assert.equal(cabinet.drawerBottomMaterialId, cabinet.backMaterialId);
  const parts = generateParts(project);
  assert.equal(parts.filter(item => item.name.includes(' · Ящик ') && !item.name.endsWith('дно')).every(item => item.materialId === cabinet.materialId), true);
  assert.equal(parts.filter(item => item.name.includes(' · Ящик ') && item.name.endsWith('дно')).every(item => item.materialId === cabinet.backMaterialId), true);
  const cutting = optimizeCutting(parts, project.materials, project.settings);
  assert.deepEqual(new Set(cutting.sheets.map(sheet => sheet.materialId)), new Set(['mdf-white', 'mdf-oak', 'hdf-back']));
  const added = createCabinet('base', project);
  assert.equal(added.drawerMaterialId, added.materialId);
  assert.equal(added.drawerBottomMaterialId, added.backMaterialId);
});

test('room allowances preserve legacy zero insets and keep a new default cabinet valid', () => {
  assert.deepEqual(getRoomInstallationClearance({}), { walls: 0, ceiling: 0 });
  const project = createDefaultProject();
  assert.deepEqual(project.room.installationClearance, { walls: 10, ceiling: 20 });
  assert.equal(project.cabinets[0].z, 10);
  assert.equal(canPlaceCabinet(project.cabinets[0], project), true);
  assert.deepEqual(validateProject(project), []);
  const legacy = cabinetProject({ z: 0 });
  assert.equal(canPlaceCabinet(legacy.cabinets[0], legacy), true);
  assert.deepEqual(validateProject(legacy), []);
});

test('all-wall inset measures physical facade projection, rotation and exact ceiling clearance', () => {
  const project = cabinetProject({ width: 200, height: 980, depth: 200, plinth: 0, shelves: 0, x: 790, z: 772 });
  project.room.width = project.room.depth = project.room.height = 1000;
  project.room.windows = [];
  project.room.installationClearance = { walls: 10, ceiling: 20 };
  const cabinet = project.cabinets[0];
  let placement = validateCabinetPlacement(cabinet, project);
  assert.deepEqual(placement.deficits, { walls: 0, ceiling: 0 });
  near(placement.wallClearance, 10);
  near(placement.ceilingClearance, 20);
  assert.equal(placement.fits, true);
  cabinet.z = 773; cabinet.height = 981;
  placement = validateCabinetPlacement(cabinet, project);
  assert.deepEqual(placement.deficits, { walls: 1, ceiling: 1 });
  assert.equal(placement.contained, true);
  assert.equal(canPlaceCabinet(cabinet, project), false);
  const warnings = validateProject(project).filter(item => item.message.includes('монтажного отступа'));
  assert.equal(warnings.length, 2);
  assert.equal(warnings.every(item => item.level === 'warning' && item.message.includes('не хватает 1 мм')), true);
  cabinet.x = 228; cabinet.z = 10; cabinet.height = 980; cabinet.rotation = 90;
  assert.equal(canPlaceCabinet(cabinet, project), true);
  cabinet.x = 227;
  near(validateCabinetPlacement(cabinet, project).wallClearance, 9);
  assert.equal(canPlaceCabinet(cabinet, project), false);
  cabinet.height = 1001;
  assert.equal(validateProject(project).some(item => item.level === 'error' && item.message.includes('границы помещения')), true);
});

test('placement refuses a concave-room bridge even when every footprint corner is inside', () => {
  const project = cabinetProject({ x: 800, z: 500, width: 1500, depth: 2000, shelves: 0, doors: 0 });
  project.room.width = project.room.depth = 3000; project.room.windows = [];
  project.room.outline = [{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 3000 }, { x: 2000, z: 3000 }, { x: 2000, z: 1000 }, { x: 1000, z: 1000 }, { x: 1000, z: 3000 }, { x: 0, z: 3000 }];
  project.room.installationClearance = { walls: 10, ceiling: 20 };
  assert.equal(validateCabinetPlacement(project.cabinets[0], project).contained, false);
  assert.equal(canPlaceCabinet(project.cabinets[0], project), false);
});

test('new floor-length outer sides retain the raised bottom, plinth front and section dimensions', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  assert.equal(cabinet.sidesToFloor, true);
  const layout = getCabinetLayout(cabinet, project);
  const parts = generateParts(project);
  const sideParts = parts.filter(item => item.name.startsWith('Боковина'));
  assert.deepEqual(sideParts.map(item => [item.height, item.position.y]), [[2200, -100], [2200, -100]]);
  const retained = parts.filter(item => !item.name.startsWith('Боковина'));
  cabinet.sidesToFloor = false;
  const shorter = generateParts(project);
  assert.deepEqual(shorter.filter(item => item.name.startsWith('Боковина')).map(item => [item.height, item.position.y]), [[2100, 0], [2100, 0]]);
  assert.deepEqual(shorter.filter(item => !item.name.startsWith('Боковина')), retained);
  assert.deepEqual(getCabinetLayout(cabinet, project), layout);
  assert.equal(shorter.find(item => item.name === 'Дно корпуса').position.y, 0);
  assert.equal(shorter.find(item => item.role === 'plinth').position.y, -100);
  assert.deepEqual(validateProject(project), []);
  delete cabinet.sidesToFloor;
  assert.deepEqual(generateParts(project), shorter);
  assert.equal(createCabinet('base', project).sidesToFloor, true);
  assert.equal(createCabinet('base', project, { sidesToFloor: false }).sidesToFloor, false);
});

test('floor-length L return sides follow the option and zero plinth does not change geometry', () => {
  const project = cabinetProject({ width: 1200, height: 2200, depth: 620, sidesToFloor: true, shelves: 0, cutout: { corner: 'back-right', width: 300, depth: 180 } });
  const cabinet = project.cabinets[0];
  const structuralSides = () => generateParts(project).filter(item => item.name.startsWith('Боковина') || item.name === 'Возвратная боковина выреза');
  let sides = structuralSides();
  assert.equal(sides.length, 3);
  assert.equal(sides.every(item => item.height === 2200 && item.position.y === -100), true);
  assert.deepEqual(sides.map(item => item.width), [617, 440, 177]);
  cabinet.sidesToFloor = false;
  sides = structuralSides();
  assert.equal(sides.every(item => item.height === 2100 && item.position.y === 0), true);
  cabinet.plinth = 0;
  const without = generateParts(project);
  cabinet.sidesToFloor = true;
  assert.deepEqual(generateParts(project), without);
});

test('floor-length outer sides leave ordinary vertical dividers above the plinth', () => {
  const project = cabinetProject({ width: 1200, height: 2200, sidesToFloor: true, shelves: 0 });
  project.cabinets[0].layout = split('columns', 'vertical', [1, 1], [leaf('a'), leaf('b')]);
  const parts = generateParts(project);
  assert.equal(parts.filter(item => item.name.startsWith('Боковина')).every(item => item.position.y === -100 && item.height === 2200), true);
  const divider = parts.find(item => item.partitionId);
  assert.deepEqual([divider.height, divider.position.y], [2064, 18]);
  project.cabinets[0].layout.children[0].floor = 'open';
  const extendedDivider = generateParts(project).find(item => item.partitionId);
  assert.deepEqual([extendedDivider.height, extendedDivider.position.y], [2182, -100]);
});

test('new names are saved in the creation language with Turkish as the default', () => {
  const expected = {
    ru: ['Шкаф · İstanbul', 'Шкаф с ящиками в середине', 'Верхняя секция', 'Yıldız MDFLAM · Белый VT_068 · 18 мм', 'MDF с матовым покрытием'],
    tr: ['Dolap · İstanbul', 'Ortada çekmeceli dolap', 'Üst bölme', 'Yıldız MDFLAM · Beyaz VT_068 · 18 mm', 'Mat kaplamalı MDF'],
    en: ['Cabinet · İstanbul', 'Cabinet with drawers in the middle', 'Upper section', 'Yıldız MDFLAM · White VT_068 · 18 mm', 'MDF with matt finish']
  };
  const geometry = project => generateParts(project).map(item => [item.id, item.width, item.height, item.thickness, item.materialId, item.position]);
  const reference = createDefaultProject('ru');
  for (const language of ['ru', 'tr', 'en']) {
    const project = createDefaultProject(language);
    assert.equal(project.namingLanguage, language);
    assert.deepEqual([project.name, project.cabinets[0].name, project.cabinets[0].layout.children[0].name, project.materials[0].name, project.materials.find(item => item.decorCode === 'MAT_068').type], expected[language]);
    assert.deepEqual(geometry(project), geometry(reference));
    assert.deepEqual(project.materials.map(item => [item.id, item.decorCode, item.thickness, item.sheetWidth, item.sheetHeight, item.sourceUrl]), reference.materials.map(item => [item.id, item.decorCode, item.thickness, item.sheetWidth, item.sheetHeight, item.sourceUrl]));
    assert.deepEqual(validateProject(project), []);
  }
  assert.equal(createDefaultProject().name, expected.tr[0]);
  assert.equal(createDefaultProject('unsupported').namingLanguage, 'tr');
});

test('new cabinet default names follow the project language and explicit custom names remain exact', () => {
  const expected = {
    ru: ['Новая тумба', 'Новый навесной шкаф', 'Новый пенал'],
    tr: ['Yeni alt dolap', 'Yeni duvar dolabı', 'Yeni boy dolabı'],
    en: ['New base cabinet', 'New wall cabinet', 'New tall cabinet']
  };
  const custom = 'Шкаф Айşe · özel 7';
  for (const language of ['ru', 'tr', 'en']) {
    const project = createDefaultProject(language), before = JSON.stringify(project);
    assert.deepEqual(['base', 'wall', 'tall'].map(type => createCabinet(type, project).name), expected[language]);
    assert.equal(createCabinet('tall', project, { name: custom }).name, custom);
    assert.equal(JSON.stringify(project), before);
  }
  const legacy = createDefaultProject('ru');
  delete legacy.namingLanguage;
  assert.equal(createCabinet('tall', legacy).name, 'Новый пенал');
});

test('a 900 mm standalone drawer cabinet distinguishes facade, opening and outer box widths', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 860, depth: 580, layout: leaf('drawers', { front: 'drawers', drawers: 2 }) });
  const fronts = getFrontLayout(cabinet, project);
  assert.equal(getCabinetLayout(cabinet, project).sections[0].width, 864);
  assert.deepEqual(fronts.map(front => [front.x, front.width]), [[2, 896], [2, 896]]);
  let parts = generateParts(project);
  const facade = parts.find(item => item.name.endsWith('Фасад ящика 1'));
  const bottom = parts.find(item => item.name.endsWith('Ящик 1 · дно'));
  const wall = parts.find(item => item.name.endsWith('Ящик 1 · передняя стенка'));
  const side = parts.find(item => item.name.endsWith('Ящик 1 · боковина левая'));
  assert.deepEqual([facade.width, bottom.width, wall.width, side.thickness], [896, 838, 802, 18]);
  assert.deepEqual([bottom.height, bottom.thickness], [532, 8]);
  assert.equal(wall.width + 2 * side.thickness, bottom.width);
  assert.deepEqual(validateProject(project), []);
  const neighbor = structuredClone(cabinet);
  neighbor.id = 'adjacent-cabinet'; neighbor.layout.id = 'adjacent-drawers'; neighbor.x += cabinet.width;
  project.cabinets.push(neighbor);
  assert.deepEqual(generateParts(project).filter(item => item.cabinetId === cabinet.id), parts);
  const otherFront = getFrontLayout(neighbor, project)[0];
  assert.equal(neighbor.x + otherFront.x - cabinet.x - fronts[0].x - fronts[0].width, 4);
  cabinet.drawerSlideGap = 13.5;
  parts = generateParts(project).filter(item => item.cabinetId === cabinet.id);
  assert.equal(parts.find(item => item.name.endsWith('Фасад ящика 1')).width, 896);
  assert.equal(parts.find(item => item.name.endsWith('Ящик 1 · дно')).width, 837);
});

test('900 mm drawer facade band deductions change the cut blank while retaining finished geometry', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 860, depth: 580, layout: leaf('drawers', { front: 'drawers', drawers: 2 }) });
  const fronts = getFrontLayout(cabinet, project);
  project.settings.deductEdge = true;
  const parts = generateParts(project);
  const facade = parts.find(item => item.name.endsWith('Фасад ящика 1'));
  const bottom = parts.find(item => item.name.endsWith('Ящик 1 · дно'));
  assert.deepEqual([facade.width, facade.finishedWidth, facade.height, facade.finishedHeight], [894, 896, 375, 377]);
  assert.deepEqual([bottom.width, bottom.finishedWidth, bottom.height, bottom.finishedHeight], [838, 838, 532, 532]);
  assert.deepEqual(getFrontLayout(cabinet, project), fronts);
  const cutting = optimizeCutting(parts, project.materials, project.settings);
  const blank = cutting.sheets.flatMap(sheet => sheet.placements).find(item => item.partId === facade.id);
  assert.deepEqual([blank.width, blank.height].sort((a, b) => a - b), [375, 894]);
});

test('mounting axes use horizontal panel midlines for nested sections, without shelf axes', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  cabinet.y = 125;
  cabinet.layout = split('columns', 'vertical', [1, 1], [
    split('left-rows', 'horizontal', [1, 1], [leaf('upper'), leaf('lower')]),
    leaf('full-height', { shelves: 2 })
  ]);
  const snapshot = JSON.stringify(project);
  const axes = getSectionMountingAxes(cabinet, project);
  const sections = getCabinetLayout(cabinet, project).sections;
  for (const section of sections) {
    const measurement = axes.find(item => item.id === section.id);
    near(measurement.bottom, cabinet.plinth + section.y - 9);
    near(measurement.top, cabinet.plinth + section.y + section.height + 9);
    near(measurement.height, section.height + 18);
    near(measurement.openingHeight, section.height);
    assert.deepEqual([measurement.bottomThickness, measurement.topThickness], [18, 18]);
  }
  assert.equal(axes.find(item => item.id === 'upper').bottom, axes.find(item => item.id === 'lower').top);
  assert.deepEqual([axes.find(item => item.id === 'full-height').bottom, axes.find(item => item.id === 'full-height').top], [109, 2191]);
  assert.equal(JSON.stringify(project), snapshot);
  project.settings.deductEdge = true;
  assert.deepEqual(getSectionMountingAxes(cabinet, project), axes);
});

test('open-floor and missing-bottom sections have no invented lower fastening axis', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  cabinet.layout = split('columns', 'vertical', [1, 1], [leaf('floor-niche', { floor: 'open' }), leaf('closed-column')]);
  let axes = getSectionMountingAxes(cabinet, project);
  assert.deepEqual(axes.find(item => item.id === 'floor-niche'), { id: 'floor-niche', bottom: null, top: 2191, height: null, openingHeight: 2182, bottomThickness: null, topThickness: 18 });
  assert.deepEqual(axes.find(item => item.id === 'closed-column'), { id: 'closed-column', bottom: 109, top: 2191, height: 2082, openingHeight: 2064, bottomThickness: 18, topThickness: 18 });
  cabinet.layout = leaf('no-bottom'); cabinet.includeBottom = false;
  axes = getSectionMountingAxes(cabinet, project);
  assert.deepEqual(axes[0], { id: 'no-bottom', bottom: null, top: 2191, height: null, openingHeight: 2082, bottomThickness: null, topThickness: 18 });
});

test('mounting axes follow the actual body gauge and preserve divider-free legacy construction', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  cabinet.layout = leaf('thick-body'); cabinet.materialId = 'yildiz-white-25';
  assert.deepEqual(getSectionMountingAxes(cabinet, project)[0], { id: 'thick-body', bottom: 112.5, top: 2187.5, height: 2075, openingHeight: 2050, bottomThickness: 25, topThickness: 25 });
  const legacy = cabinetProject({ doors: 2, drawers: 2 });
  const axes = getSectionMountingAxes(legacy.cabinets[0], legacy);
  assert.equal(axes.length, 2);
  assert.equal(axes.every(item => item.height === null), true);
  assert.deepEqual(axes.map(item => [item.bottom !== null, item.top !== null]), [[false, true], [true, false]]);
});

test('per-door left, right and upward openings preserve all manufacturing dimensions', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  cabinet.layout = split('rows', 'horizontal', [1, 1], [leaf('doors', { front: 'doors', doors: 3 }), leaf('drawers', { front: 'drawers', drawers: 2 })]);
  const parts = generateParts(project), original = getFrontLayout(cabinet, project);
  assert.deepEqual(original.filter(front => front.kind === 'door').map(front => front.opening), ['left', 'right', 'left']);
  const section = findLayoutNode(cabinet.layout, 'doors');
  section.doorOpenings = ['right', 'left', 'up'];
  const fronts = getFrontLayout(cabinet, project);
  assert.deepEqual(fronts.filter(front => front.kind === 'door').map(front => front.opening), ['right', 'left', 'up']);
  assert.equal(fronts.filter(front => front.kind === 'drawer').every(front => front.opening === undefined), true);
  assert.deepEqual(fronts.map(({ opening, ...geometry }) => geometry), original.map(({ opening, ...geometry }) => geometry));
  assert.deepEqual(generateParts(project), parts);
  assert.deepEqual(validateProject(project), []);
  section.doorOpenings[1] = 'down';
  assert.equal(validateProject(project).some(warning => warning.level === 'error' && warning.message.includes('Направление двери')), true);
});

test('legacy door openings survive explicit conversion and defaults retain the old alternating hinges', () => {
  const project = cabinetProject({ doors: 3, drawers: 0 }), cabinet = project.cabinets[0];
  assert.deepEqual(getFrontLayout(cabinet, project).map(front => front.opening), ['left', 'right', 'left']);
  const parts = generateParts(project);
  cabinet.doorOpenings = ['up', 'right', 'right'];
  assert.deepEqual(getFrontLayout(cabinet, project).map(front => front.opening), cabinet.doorOpenings);
  assert.deepEqual(generateParts(project), parts);
  const layout = convertLegacyLayout(cabinet);
  assert.deepEqual(layout.doorOpenings, cabinet.doorOpenings);
  assert.notEqual(layout.doorOpenings, cabinet.doorOpenings);
  cabinet.layout = layout;
  assert.deepEqual(getFrontLayout(cabinet, project).map(front => front.opening), ['up', 'right', 'right']);
  delete layout.doorOpenings;
  assert.deepEqual(getFrontLayout(cabinet, project).map(front => front.opening), ['left', 'right', 'left']);
});

test('full-height side extensions preserve the old subtree openings and contents without proportional shrinkage', () => {
  for (const side of ['left', 'right']) {
    const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
    cabinet.layout.children[0].doorOpenings = ['up', 'right'];
    cabinet.x = 1200; cabinet.z = 700; cabinet.rotation = 30;
    const before = getCabinetLayout(cabinet, project), contents = structuredClone(cabinet.layout);
    const oldPosition = { x: cabinet.x, z: cabinet.z }, originalWidth = cabinet.width;
    const addedId = extendCabinetSide(cabinet, side, 300, project);
    assert.equal(typeof addedId, 'string');
    assert.equal(cabinet.width, originalWidth + 318);
    const after = getCabinetLayout(cabinet, project);
    assert.equal(after.sections.find(section => section.id === addedId).width, 300);
    assert.equal(after.sections.find(section => section.id === addedId).height, before.nodes[0].height);
    assert.deepEqual(cabinet.layout.children[side === 'left' ? 1 : 0], contents);
    for (const previous of before.sections) {
      const current = after.sections.find(section => section.id === previous.id);
      near(current.x, previous.x + (side === 'left' ? 318 : 0));
      near(current.y, previous.y); near(current.width, previous.width); near(current.height, previous.height);
      const angle = cabinet.rotation * Math.PI / 180;
      near(cabinet.x + current.x * Math.cos(angle), oldPosition.x + previous.x * Math.cos(angle));
      near(cabinet.z + current.x * Math.sin(angle), oldPosition.z + previous.x * Math.sin(angle));
    }
    assert.equal(after.partitions.filter(partition => partition.axis === 'vertical').length, 1);
  }
});

test('side extension rejects unsupported growth atomically and preserves the opposite rear L notch', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  cabinet.cutout = { corner: 'back-right', width: 250, depth: 150 };
  const snapshot = JSON.stringify(cabinet);
  for (const [side, amount] of [['right', 300], ['left', 49], ['left', Infinity], ['up', 300], ['left', 6000]]) {
    assert.equal(extendCabinetSide(cabinet, side, amount, project), false);
    assert.equal(JSON.stringify(cabinet), snapshot);
  }
  const previousNotchX = cabinet.x + cabinet.width - cabinet.cutout.width;
  assert.equal(typeof extendCabinetSide(cabinet, 'left', 300, project), 'string');
  assert.equal(cabinet.x + cabinet.width - cabinet.cutout.width, previousNotchX);
});

test('placement blocks furniture overlap, permits touching stacked units and measures rotated faces', () => {
  const project = cabinetProject({ width: 600, height: 600, depth: 400, plinth: 0, doors: 0, shelves: 0, x: 300, z: 300 });
  const cabinet = project.cabinets[0], other = { ...cabinet, id: 'neighbour', x: 900 };
  project.cabinets.push(other);
  assert.equal(canPlaceCabinet(cabinet, project), true);
  assert.equal(canPlaceCabinet({ ...cabinet, x: 301 }, project), false);
  assert.deepEqual(validateCabinetPlacement({ ...cabinet, x: 301 }, project).collisions, ['neighbour']);
  other.x = cabinet.x; other.y = 600;
  assert.equal(canPlaceCabinet(cabinet, project), true);
  other.y = 599;
  assert.equal(canPlaceCabinet(cabinet, project), false);
  other.y = 0; other.x = 600; other.z = 900;
  assert.equal(canPlaceCabinet({ ...cabinet, x: 1000, z: 300, rotation: 90 }, project), true);
  assert.equal(canPlaceCabinet({ ...cabinet, x: 1000, z: 301, rotation: 90 }, project), false);
  other.x = 300; other.z = 718; other.doors = 2;
  cabinet.doors = 2;
  assert.equal(canPlaceCabinet(cabinet, project), true);
  other.z = 717;
  assert.equal(canPlaceCabinet(cabinet, project), false);
});

test('physical collision keeps an empty rear L cutout available without accepting intersecting panels', () => {
  const project = cabinetProject({ width: 1200, depth: 620, height: 1000, doors: 0, shelves: 0, cutout: { corner: 'back-right', width: 300, depth: 200 }, x: 500, z: 500 });
  const cabinet = project.cabinets[0];
  const other = { ...cabinet, id: 'inside-notch', width: 200, depth: 100, x: 1450, z: 510, cutout: undefined };
  project.cabinets.push(other);
  assert.equal(canPlaceCabinet(cabinet, project), true);
  assert.equal(canPlaceCabinet(other, project), true);
  other.x = 1350;
  assert.equal(canPlaceCabinet(other, project), false);
});

test('edge metres count selected finished edges, quantities and separate stock gauges', () => {
  const panel = { materialId: 'white', width: 894, height: 395, finishedWidth: 896, finishedHeight: 397, quantity: 2, edges: { top: 1, bottom: 1, left: 0, right: 2 } };
  const edging = getPartEdgeBanding(panel);
  assert.deepEqual([edging.lengthMm, edging.lengthMeters], [4378, 4.378]);
  assert.deepEqual(edging.edges.top, { thickness: 1, lengthMm: 1792, lengthMeters: 1.792 });
  assert.deepEqual(edging.edges.right, { thickness: 2, lengthMm: 794, lengthMeters: .794 });
  assert.equal(getPartEdgeBanding({ width: 600, height: 400 }).lengthMeters, 0);
  assert.equal(getPartEdgeBanding({ ...panel, quantity: 0 }).lengthMeters, 0);
  const summary = getEdgeBandingSummary([panel, { ...panel, materialId: 'oak', quantity: 1 }]);
  assert.deepEqual([summary.lengthMm, summary.lengthMeters], [6567, 6.567]);
  assert.deepEqual(summary.groups.map(group => [group.materialId, group.thickness, group.lengthMm, group.partCount]), [['white', 1, 3584, 2], ['white', 2, 794, 2], ['oak', 1, 1792, 1], ['oak', 2, 397, 1]]);
});

test('L edge banding uses actual external segments and remains exact when cut blanks deduct edging', () => {
  const outlined = { width: 1000, height: 600, edges: { top: 1, bottom: 1, left: 1, right: 1 }, outline: [{ x: 300, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }, { x: 0, y: 200 }, { x: 300, y: 200 }] };
  const bands = getPartEdgeBanding(outlined);
  assert.deepEqual(Object.values(bands.edges).map(edge => edge.lengthMm), [700, 1000, 400, 600]);
  assert.equal(bands.lengthMm, 2700);
  const project = cabinetProject({ width: 1200, height: 2200, depth: 620, shelves: 1, cutout: { corner: 'back-left', width: 300, depth: 180 } });
  const before = getEdgeBandingSummary(generateParts(project));
  project.settings.deductEdge = true;
  const cutParts = generateParts(project);
  assert.deepEqual(getEdgeBandingSummary(cutParts), before);
  const top = cutParts.find(item => item.name === 'Крышка');
  assert.notDeepEqual(top.finishedOutline, top.outline);
  assert.equal(getProjectStats(project).edgeLength, before.lengthMeters);
});

test('internal drawers remain behind outer doors and produce real inset fronts plus independent boxes', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 860, depth: 580, layout: leaf('behind-doors', { front: 'doors', doors: 2 }) });
  const outerFronts = getFrontLayout(cabinet, project), originalParts = generateParts(project);
  cabinet.layout.internalDrawerCount = 2;
  const inside = getInternalDrawerLayout(cabinet, project);
  assert.deepEqual(getFrontLayout(cabinet, project), outerFronts);
  assert.equal(inside.length, 2);
  assert.deepEqual(inside.map(front => [front.x, front.y, front.width, front.height, front.depth]), [[40, 356, 820, 334, 536], [40, 20, 820, 334, 536]]);
  assert.deepEqual(inside[0].box, { x: 51, y: 376, z: 28, width: 798, height: 286, depth: 496, panelThickness: 18, bottomThickness: 8 });
  const parts = generateParts(project), innerParts = parts.filter(part => part.internalDrawerIndex !== undefined);
  assert.equal(parts.length, originalParts.length + 12);
  assert.equal(innerParts.every(part => part.sectionId === 'behind-doors' && part.position && part.orientation), true);
  const frontPart = innerParts.find(part => part.internalDrawerIndex === 0 && part.component === 'internal-drawer-front');
  assert.deepEqual([frontPart.width, frontPart.height, frontPart.thickness, frontPart.position.z], [820, 334, 18, 544]);
  assert.equal(frontPart.position.z + frontPart.thickness + inside[0].handleProjection + cabinet.gap, cabinet.depth);
  assert.equal(innerParts.find(part => part.internalDrawerIndex === 0 && part.name.endsWith('передняя стенка')).width, 762);
  const bottom = innerParts.find(part => part.internalDrawerIndex === 0 && part.name.endsWith('дно'));
  assert.deepEqual([bottom.width, bottom.height, bottom.thickness, bottom.materialId], [798, 496, 8, cabinet.drawerBottomMaterialId]);
  assert.deepEqual(validateProject(project), []);
  cabinet.layout.internalDrawerHingeGap = 25;
  assert.deepEqual(getInternalDrawerLayout(cabinet, project).map(front => [front.width, front.box.width]), [[810, 788], [810, 788]]);
});

test('internal drawer construction rejects intersecting shelves and boxes that do not fit their opening', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  cabinet.layout = leaf('internal', { front: 'doors', internalDrawerCount: 2, shelves: 1 });
  assert.equal(validateProject(project).some(item => item.level === 'error' && item.message.includes('пересекают внутренние ящики')), true);
  cabinet.layout.shelves = 0;
  cabinet.height = 300; cabinet.layout.internalDrawerCount = 12;
  assert.equal(validateProject(project).some(item => item.level === 'error' && item.message.includes('внутренний ящик за дверями не помещается')), true);
  cabinet.height = 2200; cabinet.layout.internalDrawerCount = 2; cabinet.width = 300; cabinet.layout.internalDrawerHingeGap = 200;
  assert.equal(validateProject(project).some(item => item.level === 'error' && item.message.includes('внутренний ящик за дверями не помещается')), true);
  cabinet.layout.front = 'open';
  assert.deepEqual(getInternalDrawerLayout(cabinet, project), []);
  assert.equal(validateProject(project).some(item => item.message.includes('Внутренние ящики размещаются')), true);
});

test('push opening preserves outer dimensions and reserves the actual internal handle projection', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  cabinet.layout = split('rows', 'horizontal', [1, 1, 1], [
    leaf('doors', { front: 'doors', internalDrawerCount: 1 }), leaf('drawers', { front: 'drawers' }), leaf('pull-out', { pullOutShelf: true })
  ]);
  const geometry = parts => parts.map(part => [part.id, part.width, part.height, part.thickness, part.position, part.materialId]);
  const original = geometry(generateParts(project).filter(part => part.internalDrawerIndex === undefined));
  const insideWithHandles = getInternalDrawerLayout(cabinet, project);
  assert.equal(getFrontLayout(cabinet, project).every(front => front.openingMechanism === 'handle'), true);
  for (const node of cabinet.layout.children) node.openingMechanism = 'push';
  assert.equal(getFrontLayout(cabinet, project).every(front => front.openingMechanism === 'push'), true);
  assert.equal(getInternalDrawerLayout(cabinet, project).every(front => front.openingMechanism === 'push'), true);
  assert.equal(generateParts(project).find(part => part.pullOutShelf).openingMechanism, 'push');
  assert.deepEqual(geometry(generateParts(project).filter(part => part.internalDrawerIndex === undefined)), original);
  const insidePush = getInternalDrawerLayout(cabinet, project);
  insidePush.forEach((front, index) => {
    assert.deepEqual([front.width, front.height, front.box.width, front.box.height], [insideWithHandles[index].width, insideWithHandles[index].height, insideWithHandles[index].box.width, insideWithHandles[index].box.height]);
    assert.equal(front.depth - insideWithHandles[index].depth, 16);
    assert.equal(front.box.depth - insideWithHandles[index].box.depth, 16);
    assert.equal(front.handleProjection, 0);
  });
  assert.deepEqual(validateProject(project), []);
});

test('saved outside placements may be repaired gradually while room edits cannot grow their actual outside area', () => {
  const before = createDefaultProject(), c = before.cabinets[0];
  before.room = { width: 1000, depth: 1000, height: 2500, windows: [] };
  Object.assign(c, { width: 500, height: 700, depth: 400, x: 800, y: 0, z: 100, plinth: 0, layout: leaf('open') });
  const old = structuredClone(c), after = structuredClone(before), next = after.cabinets[0];
  assert.equal(canPlaceCabinet(old, before), false);
  next.name = 'Custom saved name';
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), true);
  next.x = 700;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), true, 'a smaller remaining outside area is a useful repair');
  next.x = 900;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), false);
  next.x = old.x; after.room.width = 1100;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), true);
  after.room.width = 900;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), false);
  after.room.width = 1000; after.room.height = 600;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), false, 'an existing wall problem cannot gain a ceiling problem');
});

test('legacy overlap repairs compare real shared volumes and never permit a new neighbour collision', () => {
  const before = createDefaultProject(), c = before.cabinets[0];
  before.room = { width: 3000, depth: 2000, height: 2500, windows: [] };
  Object.assign(c, { width: 500, height: 700, depth: 400, x: 400, y: 0, z: 100, plinth: 0, layout: leaf('open') });
  before.cabinets.push({ ...structuredClone(c), id: 'neighbour', width: 300, x: 800 });
  const old = structuredClone(c), after = structuredClone(before), next = after.cabinets[0];
  next.x = 350;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), true);
  next.x = 450;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), false);
  next.x = old.x; next.y = 300;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), true, 'less shared height is a partial repair');
  after.cabinets.push({ ...structuredClone(c), id: 'new-neighbour', x: 600, y: 800 });
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), false);
});

test('outside-area repair is measured through concave room bridges even when cabinet corners stay inside', () => {
  const before = createDefaultProject(), c = before.cabinets[0];
  before.room = { width: 1000, depth: 1000, height: 2500, windows: [], outline: [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }, { x: 700, z: 1000 }, { x: 700, z: 300 }, { x: 300, z: 300 }, { x: 300, z: 1000 }, { x: 0, z: 1000 }] };
  Object.assign(c, { width: 600, height: 700, depth: 400, x: 200, y: 0, z: 200, plinth: 0, layout: leaf('open') });
  const old = structuredClone(c), after = structuredClone(before), next = after.cabinets[0];
  next.z = 100;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), true);
  next.z = 300;
  assert.equal(canEditCabinetPlacement(old, next, after, { baselineProject: before }), false);
});
