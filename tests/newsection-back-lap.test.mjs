import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, generateParts, getCabinetLayout, getCabinetRearReservation, getSectionBackPanels, getFrontLayout, getRodLayout, validateProject } from '../src/engine.js';
import { generateDrillingPlan } from '../src/drilling.js';
import { setPartEdgeBanding, getPartEdgeBandingOverride } from '../src/part-edge-banding.js';
import { checkImport } from '../src/project-io.js';
import { polygonsOverlap } from '../src/room-geometry.js';

const near = (a,b) => assert.ok(Math.abs(a-b) < .004, `${a} != ${b}`);
const leaf = (id, changes = {}) => ({ ...createSection('open'), id, back: 'solid', ...changes });
function fixture({ bodyGauge = 18, rearGauge = 8, ...changes } = {}) {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  project.materials.find(stock => stock.id === cabinet.materialId).thickness = bodyGauge;
  if (rearGauge !== 3) {
    const stock = project.materials.find(stock => stock.id === cabinet.backMaterialId);
    project.materials.push({ ...stock,id:'local-test-rear',name:`MDF rear ${rearGauge}`,type:'MDF',thickness:rearGauge });
    cabinet.backMaterialId = 'local-test-rear';
  }
  Object.assign(cabinet, { width: 1218, height: 2400, depth: 700, plinth: 0, x: 500, z: 40, y: 0,
    includeBack: false, backThickness: rearGauge,
    layout: { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1,1], children: [leaf('left'), leaf('right')] }, ...changes });
  project.settings.drilling = { enabled: true };
  return { project, cabinet };
}
const backs = project => generateParts(project).filter(part => part.role === 'section-back');
function bounds(part) {
  return { ...part.position, width: part.orientation === 'vertical-depth' ? part.thickness : part.finishedWidth,
    height: part.orientation === 'horizontal' ? part.thickness : part.finishedHeight,
    depth: part.orientation === 'horizontal' ? part.finishedHeight : part.orientation === 'vertical-depth' ? part.finishedWidth : part.thickness };
}
function footprint(part) {
  const b = bounds(part);
  return part.orientation === 'horizontal' && part.finishedOutline
    ? part.finishedOutline.map(point => ({ x: b.x + point.x, z: b.z + point.y }))
    : [{ x:b.x,z:b.z },{ x:b.x+b.width,z:b.z },{ x:b.x+b.width,z:b.z+b.depth },{ x:b.x,z:b.z+b.depth }];
}
function assertNoRearIntersection(parts) {
  for (const rear of parts.filter(part => part.role === 'section-back')) for (const other of parts) {
    if (rear.id === other.id || !other.position) continue;
    const a = bounds(rear), b = bounds(other), sharedY = Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
    assert.equal(sharedY > .002 && polygonsOverlap(footprint(rear),footprint(other)), false, `${rear.name} / ${other.name}`);
  }
}
function assertMatchedRearPairs(plan) {
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  for (const pair of Map.groupBy(plan.holes.filter(hole => hole.fastenerType === 'rear-screw'), hole => hole.pairId).values()) {
    assert.equal(pair.length, 2); const through = pair.find(hole => hole.kind === 'clearance'), pilot = pair.find(hole => hole.kind === 'pilot');
    assert.deepEqual(through.direction, { x:0,y:0,z:1 }); assert.deepEqual(pilot.direction,through.direction);
    for (const axis of ['x','y','z']) near(through.worldEntry[axis]+through.direction[axis]*through.depth,pilot.worldEntry[axis]);
  }
}

test('a local back reserves its real gauge for every body member while no-back cabinets reserve nothing', () => {
  const { project,cabinet } = fixture(), before = structuredClone(project);
  near(getCabinetRearReservation(cabinet,project),8); near(getCabinetLayout(cabinet,project).bodyDepth,692);
  assert.equal(generateParts(project).some(part => part.role === 'back'),false);
  for (const part of generateParts(project).filter(part => part.orientation === 'vertical-depth' && !part.component?.includes('drawer'))) near(part.position.z,8);
  cabinet.layout.children[0].back = 'none'; cabinet.layout.children[1].back = 'braces';
  near(getCabinetRearReservation(cabinet,project),0); near(getCabinetLayout(cabinet,project).bodyDepth,700); assert.deepEqual(getSectionBackPanels(cabinet,project),[]);
  cabinet.includeBack = true; near(getCabinetRearReservation(cabinet,project),8); assert.deepEqual(getSectionBackPanels(cabinet,project),[]);
  assert.deepEqual(before.cabinets[0].layout.children.map(section => section.back),['solid','solid']);
});

test('a single local back covers the exterior and half the shared divider, with its screw safely at a quarter of the board', () => {
  for (const bodyGauge of [18,25]) {
    const { project,cabinet } = fixture({ bodyGauge }); cabinet.layout.children[1].back = 'none';
    const rear = backs(project)[0], divider = generateParts(project).find(part => part.partitionId);
    assert.deepEqual(rear.position,{ x:0,y:0,z:0 }); near(rear.finishedWidth,cabinet.width/2); near(rear.finishedHeight,2400); assert.equal(rear.rearMount,'lap');
    near(rear.position.x+rear.finishedWidth,divider.position.x+bodyGauge/2);
    const plan = generateDrillingPlan(project); assertMatchedRearPairs(plan);
    const pilots = plan.holes.filter(hole => hole.fastenerType === 'rear-screw' && hole.kind === 'pilot' && hole.partId === divider.id);
    assert.ok(pilots.length > 0); for (const hole of pilots) near(hole.thicknessCoordinate,bodyGauge/4);
    assertNoRearIntersection(generateParts(project));
  }
});

test('an upper local back covers half the horizontal divider and puts its screw at the other quarter', () => {
  const { project,cabinet } = fixture();
  cabinet.layout = { id:'rows',kind:'split',axis:'horizontal',sizes:[1,1],children:[leaf('upper'),leaf('lower',{ back:'none' })] };
  const parts = generateParts(project), rear = backs(project)[0], divider = parts.find(part => part.partitionId);
  near(rear.position.y,divider.position.y+9); near(rear.position.y+rear.finishedHeight,2400);
  const plan = generateDrillingPlan(project); assertMatchedRearPairs(plan);
  const holes = plan.holes.filter(hole => hole.fastenerType === 'rear-screw' && hole.kind === 'pilot' && hole.partId === divider.id);
  assert.ok(holes.length > 0); for (const hole of holes) near(hole.thicknessCoordinate,13.5);
  assertNoRearIntersection(parts);
});

test('compatible touching rows, columns and a rectangular grid become exactly one stock board with stable members', () => {
  for (const axis of ['vertical','horizontal','grid']) {
    const { project,cabinet } = fixture();
    if (axis === 'grid') cabinet.layout = { id:'grid',kind:'split',axis:'vertical',sizes:[1,1],children:[0,1].map(col => ({ id:`col${col}`,kind:'split',axis:'horizontal',sizes:[1,1],children:[0,1].map(row => leaf(`cell${col}${row}`)) })) };
    else cabinet.layout.axis = axis;
    const before = structuredClone(project), panels = backs(project); assert.equal(panels.length,1);
    assert.deepEqual([panels[0].finishedWidth,panels[0].finishedHeight,panels[0].thickness],[1218,2400,8]);
    assert.deepEqual(panels[0].sourceSectionIds,axis === 'grid' ? ['cell00','cell01','cell10','cell11'] : ['left','right']);
    assert.equal(panels[0].quantity,1); assert.deepEqual(project,before); assertNoRearIntersection(generateParts(project));
  }
});

test('a missing middle back and unequal raised bottoms do not acquire invented covering material', () => {
  const { project,cabinet } = fixture();
  cabinet.layout = { id:'columns',kind:'split',axis:'vertical',sizes:[1,1,1],children:[leaf('left'),leaf('gap',{ back:'none' }),leaf('right')] };
  const gap = getCabinetLayout(cabinet,project).sections.find(section => section.id === 'gap'), panels = backs(project);
  assert.equal(panels.length,2); for (const panel of panels) assert.ok(panel.position.x+panel.finishedWidth <= gap.x || panel.position.x >= gap.x+gap.width);
  cabinet.layout = { id:'columns',kind:'split',axis:'vertical',sizes:[1,1],children:[leaf('floor',{ floor:'open' }),leaf('raised',{ plinthHeight:100 })] };
  const unequal = backs(project); assert.equal(unequal.length,2); assert.deepEqual(unequal.map(part => part.position.y),[0,100]); assertNoRearIntersection(generateParts(project));
});

test('separate manual edges survive a neighbour back, RAW screw axes use the actual surviving overlap, and reset permits merging', () => {
  const { project,cabinet } = fixture(); cabinet.layout.children[1].back = 'none';
  const first = backs(project)[0]; setPartEdgeBanding(project,first.id,{ right:3 });
  cabinet.layout.children[1].back = 'solid';
  const panels = backs(project); assert.equal(panels.length,2); const preserved = panels.find(part => part.id === first.id);
  assert.ok(preserved); assert.equal(preserved.edges.right,3); near(preserved.finishedWidth,609); near(preserved.width,606);
  const plan = generateDrillingPlan(project); assertMatchedRearPairs(plan); const divider = plan.parts.find(part => part.partitionId);
  const leftRow = plan.rearFastenings.find(row => row.partId === first.id), pairs = new Set(leftRow.contacts.flatMap(contact => contact.pairIds));
  const shared = plan.holes.filter(hole => pairs.has(hole.pairId) && hole.partId === divider.id && hole.kind === 'pilot');
  assert.ok(shared.length > 0); for (const hole of shared) near(hole.thicknessCoordinate,3);
  const loaded = checkImport(JSON.parse(JSON.stringify(project))); assert.equal(backs(loaded).find(part => part.id === first.id).edges.right,3);
  setPartEdgeBanding(project,first.id,null); assert.equal(getPartEdgeBandingOverride(project,first.id),null); assert.equal(backs(project).length,1);
});

test('a merged override and source ID survive a new shelf, resizing, save/import and a temporarily absent member', () => {
  const { project,cabinet } = fixture(), merged = backs(project)[0]; setPartEdgeBanding(project,merged.id,{ top:1.5,bottom:1 });
  cabinet.layout.children[0].shelves = 3; cabinet.height = 2300;
  let next = backs(project)[0]; assert.equal(next.id,merged.id); assert.equal(next.edgeBandKey,merged.edgeBandKey); near(next.height,2297.5);
  cabinet.layout.children[1].back = 'none'; assert.equal(backs(project)[0].edges.top,0);
  cabinet.layout.children[1].back = 'solid'; next = backs(project)[0]; assert.equal(next.id,merged.id); near(next.edges.top,1.5);
  const loaded = checkImport(JSON.parse(JSON.stringify(project))); assert.deepEqual(backs(loaded)[0],next);
});

test('all-local straight and mirrored L backs equal full-back finished geometry and never penetrate real shaped boards', () => {
  for (const bodyGauge of [18,25]) for (const rearGauge of [3,8,18]) for (const corner of [null,'back-left','back-right']) {
    const { project,cabinet } = fixture({ bodyGauge,rearGauge,...(corner ? { cutout:{ corner,width:300,depth:180 } } : {}) });
    const local = generateParts(project), localBacks = local.filter(part => part.role === 'section-back'); assertNoRearIntersection(local);
    cabinet.includeBack = true; const full = generateParts(project), globalBacks = full.filter(part => part.role === 'back');
    const shape = part => ({ position:part.position,width:part.finishedWidth,height:part.finishedHeight,thickness:part.thickness });
    assert.deepEqual(localBacks.map(shape),globalBacks.map(shape));
    const body = parts => parts.filter(part => !['section-back','back'].includes(part.role)).map(({ id,...part }) => part);
    assert.deepEqual(body(local),body(full));
  }
});

test('rod, full-depth front and shelf all use one body rear reservation without moving the physical front', () => {
  const { project,cabinet } = fixture(); cabinet.layout.children[0].front = 'doors'; cabinet.layout.children[0].doors = 1;
  cabinet.layout.children[1].back = 'none'; cabinet.layout.children[1].shelves = 1; cabinet.layout.children[1].rods = [{ id:'rail',y:1500,frontInset:200 }];
  const layout = getCabinetLayout(cabinet,project); assert.ok(layout.sections.every(section => section.rearInset === 0 && section.usableDepth === 692));
  for (const front of getFrontLayout(cabinet,project)) near(getCabinetRearReservation(cabinet,project)+front.depth,700);
  const shelf = generateParts(project).find(part => part.sectionId === 'right' && part.name.endsWith('полка 1'));
  near(shelf.position.z,8); near(shelf.position.z+shelf.finishedHeight,680);
  const rod = getRodLayout(cabinet,project)[0]; near(rod.z,500); assert.equal(rod.opening.rearOffset,0);
});

test('a short local strip keeps its two real horizontal supports and explicitly records skipped short side contacts', () => {
  const { project,cabinet } = fixture({ width:900,height:2300,depth:620 });
  cabinet.layout = { id:'rows',kind:'split',axis:'horizontal',sizes:[1089,50,1089],children:[leaf('lower',{ back:'none' }),leaf('strip'),leaf('upper',{ back:'none' })] };
  const plan = generateDrillingPlan(project); assertMatchedRearPairs(plan); const row = plan.rearFastenings[0];
  assert.equal(row.quantity,10); assert.equal(row.contacts.length,2); assert.equal(row.omittedContacts.length,2); assert.equal(row.unsupported,false);
  assert.ok(row.issues.every(issue => issue.code === 'rear-contact-too-short'));
});

test('a cutout shall not place overlapping rear slabs when shallower than the actual reserved gauge', () => {
  for (const includeBack of [false,true]) for (const rearGauge of [3,8,25]) {
    const { project,cabinet } = fixture({ includeBack,rearGauge,cutout:{ corner:'back-left',width:300,depth:rearGauge-1 } });
    assert.ok(validateProject(project).some(item => item.level === 'error' && item.message.includes('зарезервированной толщины задника')));
    cabinet.cutout.depth = rearGauge;
    assert.ok(!validateProject(project).some(item => item.message.includes('зарезервированной толщины задника')));
    if (!includeBack) assertNoRearIntersection(generateParts(project));
  }
  const { project,cabinet } = fixture({ cutout:{ corner:'back-left',width:300,depth:1 } }); cabinet.layout.children.forEach(section => { section.back = 'none'; });
  assert.equal(getCabinetRearReservation(cabinet,project),0);
  assert.ok(!validateProject(project).some(item => item.message.includes('зарезервированной толщины задника')));
});
