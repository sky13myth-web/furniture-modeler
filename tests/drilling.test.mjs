import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, generateParts } from '../src/engine.js';
import { DRILLING_DEFAULTS, generateDrillingPlan, normalizeDrillingSettings } from '../src/drilling.js';

const near = (actual, expected, tolerance = .004) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
function fixture(overrides = {}, settings = {}) {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 2200, depth: 620, plinth: 100, sidesToFloor: true,
    layout: { ...createSection('open'), id: 'opening', shelves: 0 }, ...overrides });
  project.settings.drilling = { enabled: true, ...settings };
  return { project, cabinet };
}
function assertPaired(plan) {
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  const groups = Map.groupBy(plan.holes, hole => hole.pairId), parts = new Map(plan.parts.map(part => [part.id, part]));
  for (const pair of groups.values()) {
    assert.equal(pair.length, 3);
    const through = pair.find(hole => hole.kind === 'clearance'), pilot = pair.find(hole => hole.kind === 'pilot'), sink = pair.find(hole => hole.kind === 'countersink');
    assert.notEqual(through.partId, pilot.partId);
    assert.equal(through.partId, sink.partId);
    assert.deepEqual(through.direction, pilot.direction);
    for (const axis of ['x', 'y', 'z']) {
      near(through.worldEntry[axis] + through.direction[axis] * through.depth, pilot.worldEntry[axis]);
      near(through.worldEntry[axis], sink.worldEntry[axis]);
    }
    near(pilot.thicknessCoordinate, parts.get(pilot.partId).thickness / 2);
    for (const hole of pair) {
      const part = parts.get(hole.partId);
      assert.equal(hole.partCode, part.partCode);
      assert.ok(hole.a >= -.002 && hole.a <= part.width + .002);
      assert.ok(hole.b >= -.002 && hole.b <= part.height + .002);
      for (const axis of ['x', 'y', 'z']) {
        near(part.drillingWorldOrigin[axis] + part.drillingBasis.a[axis] * hole.a + part.drillingBasis.b[axis] * hole.b + part.drillingBasis.t[axis] * hole.thicknessCoordinate, hole.worldEntry[axis]);
      }
    }
  }
}

test('drilling is an optional nonmutating feature; incomplete countersink setup stays explicit', () => {
  const { project } = fixture();
  delete project.settings.drilling;
  const before = structuredClone(project), disabled = generateDrillingPlan(project);
  assert.equal(disabled.settings.enabled, false);
  assert.deepEqual(disabled.holes, []);
  assert.deepEqual(disabled.errors, []);
  assert.deepEqual(project, before);
  project.settings.drilling = { enabled: true };
  const plan = generateDrillingPlan(project);
  assertPaired(plan);
  assert.equal(plan.joints.length, 4);
  assert.equal(plan.holes.length, 36);
  assert.equal(plan.holes.filter(h => h.kind === 'countersink').every(h => h.depth === null && h.requiresSetup === true), true);
  assert.ok(plan.warnings.some(w => w.code === 'countersink-setup'));
  assert.equal(DRILLING_DEFAULTS.screwDiameter, 7);
  assert.equal(normalizeDrillingSettings({ enabled: true, screwLength: '60' }).screwLength, 60);
  assert.ok(!Object.hasOwn(DRILLING_DEFAULTS, 'integerSpacing'));
  for (const integerSpacing of [true, false]) assert.ok(!Object.hasOwn(normalizeDrillingSettings({ integerSpacing }), 'integerSpacing'));
});

test('raw references account for only the physical band sides; screw axes follow actual plate centres', () => {
  const { project, cabinet } = fixture({ edgeBand: 2 });
  const before = structuredClone(project), plan = generateDrillingPlan(project);
  assertPaired(plan);
  assert.deepEqual(project, before);
  const left = plan.parts.find(p => p.name === 'Боковина левая');
  assert.equal(left.finishedWidth - left.width, 2);
  assert.deepEqual(left.rawOrigin, { a: 0, b: 0 });
  const top = plan.parts.find(p => p.name === 'Крышка');
  assert.equal(top.finishedHeight - top.height, 2);
  assert.deepEqual(top.rawOrigin, { a: 0, b: 0 });
  const leftThrough = plan.holes.filter(h => h.partId === left.id && h.kind === 'clearance');
  near(Math.max(...leftThrough.map(h => h.b)), cabinet.height - 9);
  near(Math.min(...leftThrough.map(h => h.b)), cabinet.plinth + 9);
  assert.deepEqual([...new Set(leftThrough.map(h => h.a))].sort((a, b) => a - b), [50, 307.5, 565]);
});

test('legacy integer-spacing flags cannot change exact paired drilling stations', () => {
  const { project } = fixture({ depth: 623 });
  const exact = generateDrillingPlan(project);
  assertPaired(exact);
  const left = exact.parts.find(part => part.name === 'Боковина левая');
  const stations = plan => [...new Set(plan.holes.filter(hole => hole.partId === left.id && hole.kind === 'clearance').map(hole => hole.a))].sort((a,b)=>a-b);
  assert.deepEqual(stations(exact), [50, 309.5, 569]);
  for (const integerSpacing of [true, false]) {
    project.settings.drilling.integerSpacing = integerSpacing;
    const before = structuredClone(project), restored = generateDrillingPlan(project);
    assertPaired(restored); assert.deepEqual(project, before);
    assert.deepEqual(restored, exact);
    assert.ok(!Object.hasOwn(restored.settings, 'integerSpacing'));
  }
});

test('two-screw mode uses exactly two safe shared stations while automatic mode preserves legacy coordinates',()=>{
  const {project}=fixture({depth:623}),before=structuredClone(project),automatic=generateDrillingPlan(project);
  project.settings.drilling.screwsPerJoint='auto';assert.deepEqual(generateDrillingPlan(project),automatic);
  assert.equal(normalizeDrillingSettings({screwsPerJoint:'2'}).screwsPerJoint,2);
  project.settings.drilling.screwsPerJoint=2;
  const two=generateDrillingPlan(project);assertPaired(two);assert.equal(two.settings.screwsPerJoint,2);
  assert.ok(two.joints.every(joint=>joint.pairIds.length===2));assert.equal(two.holes.length,two.joints.length*6);
  const left=two.parts.find(part=>part.name==='Боковина левая');
  assert.deepEqual([...new Set(two.holes.filter(h=>h.partId===left.id&&h.kind==='clearance').map(h=>h.a))].sort((a,b)=>a-b),[50,569]);
  for(const hole of two.holes){if(hole.kind==='pilot')assert.equal(hole.depth,34);if(hole.kind==='countersink')assert.equal(hole.depth,null);}
  project.settings.drilling=before.settings.drilling;assert.deepEqual(project,before);
});

test('exactly two screws retain fractional stations, raw edges and 18/25 mm centres through mirrored L rotations',()=>{
  for(const thickness of [18,25])for(const corner of ['back-left','back-right'])for(const rotation of [90,-90,37]) {
    const {project,cabinet}=fixture({width:913.7654321,depth:620.1234567,height:2200.9876543,rotation,x:1342.17,z:2123.91,y:350.25,cutout:{corner,width:300.1234567,depth:200.1234567}},{screwsPerJoint:2,endOffset:50.5,maxSpacing:20.1,countersinkDepth:1.234,pilotExtraDepth:2.25});
    project.materials.find(m=>m.id===cabinet.materialId).thickness=thickness;
    const before=structuredClone(project),plan=generateDrillingPlan(project);assertPaired(plan);assert.equal(plan.joints.length,6);
    assert.ok(plan.joints.every(joint=>joint.pairIds.length===2));assert.equal(plan.holes.length,36);
    assert.ok(plan.holes.some(h=>h.a%1!==0||h.b%1!==0));
    for(const hole of plan.holes){if(hole.kind==='pilot'){assert.equal(hole.thicknessCoordinate,thickness/2);assert.equal(hole.depth,52.25-thickness);}if(hole.kind==='countersink')assert.equal(hole.depth,1.234);}
    assert.deepEqual(project,before);
  }
});

test('two-screw mode places two total across separate accessible ranges of one joint',()=>{
  const {project}=fixture({depth:623}),parts=generateParts({...project,settings:{...project.settings,deductEdge:true}});
  const left=parts.find(part=>part.name==='Боковина левая');
  // A real plate outside the head-entry face closes only the middle of the
  // joint. Supplied geometry isolates access handling from layout generation.
  parts.push({...structuredClone(left),id:'qa-access-blocker',name:'QA access blocker',width:200,finishedWidth:200,height:2200,finishedHeight:2200,
    position:{x:-18,y:0,z:200},edges:{left:0,right:0,top:0,bottom:0}});
  const before=structuredClone(parts),automatic=generateDrillingPlan(project,{parts});assertPaired(automatic);
  assert.ok(automatic.joints.filter(joint=>joint.throughPartId===left.id).every(joint=>joint.pairIds.length===4));
  project.settings.drilling.screwsPerJoint=2;
  const two=generateDrillingPlan(project,{parts});assertPaired(two);
  assert.equal(two.joints.length,4);assert.equal(two.holes.length,24);assert.ok(two.joints.every(joint=>joint.pairIds.length===2));
  for(const joint of two.joints.filter(joint=>joint.throughPartId===left.id)) {
    const stations=two.holes.filter(hole=>joint.pairIds.includes(hole.pairId)&&hole.kind==='clearance').map(hole=>hole.cabinetEntry.z);
    assert.deepEqual(stations,[53,572]);assert.ok(stations.every(z=>z<=150||z>=450));
  }
  assert.deepEqual(parts,before);
});

test('two-screw mode blocks invalid counts and joints that cannot hold two safe distinct holes',()=>{
  for(const screwsPerJoint of [0,1,3,'invalid',null,true]) {
    const plan=generateDrillingPlan(fixture({}, {screwsPerJoint}).project);
    assert.equal(plan.valid,false);assert.deepEqual(plan.holes,[]);assert.ok(plan.errors.some(e=>e.code==='invalid-setting'&&e.field==='screwsPerJoint'));
  }
  const plan=generateDrillingPlan(fixture({depth:110},{screwsPerJoint:2}).project);
  assert.equal(plan.valid,false);assert.ok(plan.errors.some(e=>e.code==='joint-too-short'));assert.ok(plan.joints.every(j=>j.pairIds.length===2));
});

test('exact stations preserve 18/25 mm plate centres and decimal mirrored L boundaries after rotation', () => {
  for (const thickness of [18,25]) for (const corner of ['back-left','back-right']) for (const rotation of [90,-90,37]) {
    const { project,cabinet } = fixture({ width: 913.7654321, depth: 620.1234567, height: 2200.9876543, rotation, x:1342.17,z:2123.91,y:350.25,
      cutout:{corner,width:300.1234567,depth:200.1234567} }, {countersinkDepth:1.5,pilotExtraDepth:2.25});
    project.materials.find(material => material.id === cabinet.materialId).thickness=thickness;
    const exact=generateDrillingPlan(project);
    project.settings.drilling.integerSpacing=true;
    const restored=generateDrillingPlan(project);
    assertPaired(restored); assert.equal(restored.joints.length,6);
    assert.deepEqual(restored,exact);
    assert.ok(!restored.warnings.some(warning=>warning.code==='fractional-references'));
    for(const hole of restored.holes){
      if(hole.kind==='pilot')assert.equal(hole.thicknessCoordinate,thickness/2);
      if(hole.kind==='countersink')assert.equal(hole.depth,1.5);
    }
  }
});

test('fractional minimum offsets and maximum gaps are preserved without duplicate stations', () => {
  const {project}=fixture({depth:623},{endOffset:50.5,maxSpacing:149.5,countersinkDiameter:10.5});
  project.settings.drilling.integerSpacing=true;
  const plan=generateDrillingPlan(project);assertPaired(plan);
  for(const joint of plan.joints){
    const positions=joint.pairIds.map(pairId=>plan.holes.find(hole=>hole.pairId===pairId).cabinetEntry.z).sort((a,b)=>a-b);
    // Cabinet Z includes the existing 3 mm rear origin of this fixture.
    assert.deepEqual(positions,[53.5,183,312.5,442,571.5]);
    assert.equal(new Set(positions).size,positions.length);
    assert.ok(positions.every((position,index)=>index===0||position-positions[index-1]<=149.5));
  }
});

test('hole pairs and raw bases remain coaxial after cabinet rotation, room placement and elevation', () => {
  for (const rotation of [0, 37, 90, 180, 270]) {
    const { project } = fixture({ rotation, x: 1342.17, z: 2123.91, y: 350 });
    assertPaired(generateDrillingPlan(project));
  }
});

test('submillimetre model dimensions retain right-hand joints after cut-size recording', () => {
  for (const width of [913.7654321, 913.7645679, 900.00049, 900.00051]) {
    const { project } = fixture({ width, height: 2200.9876543, depth: 620.1234567, rotation: 37 });
    const before = structuredClone(project), source = generateParts(project), plan = generateDrillingPlan(project);
    assertPaired(plan);
    assert.deepEqual(project, before);
    assert.equal(plan.joints.length, 4);
    assert.equal(plan.holes.length, 36);
    for (const part of plan.parts) {
      const cutPart = source.find(item => item.id === part.id);
      assert.equal(part.width, cutPart.width);
      assert.equal(part.height, cutPart.height);
      assert.deepEqual(part.position, cutPart.position);
    }
    const rightPilots = plan.holes.filter(hole => hole.kind === 'pilot' && hole.face === 'edge-a-max');
    assert.equal(rightPilots.length, 6);
    for (const hole of rightPilots) {
      const part = plan.parts.find(item => item.id === hole.partId);
      assert.equal(hole.a, part.width);
    }
  }
});

test('recording tolerance does not accept a larger real gap at a receiving edge', () => {
  const { project } = fixture(), source = generateParts(project);
  source.find(part => part.name === 'Боковина правая').position.x += .00075;
  const before = structuredClone(source), plan = generateDrillingPlan(project, { parts: source });
  assert.equal(plan.valid, false);
  assert.equal(plan.errors.filter(error => error.code === 'pilot-outside').length, 2);
  assert.deepEqual(source, before);
});

test('decimal L-notch joints use contour extrema when the blank width rounds up or down', () => {
  for (const width of [900.00049, 900.00051]) for (const corner of ['back-left', 'back-right']) {
    const { project } = fixture({ width, cutout: { corner, width: 300, depth: 200 } });
    const plan = generateDrillingPlan(project);
    assertPaired(plan);
    assert.equal(plan.joints.length, 6);
    assert.equal(plan.joints.filter(joint => joint.throughPartId === plan.parts.find(part => part.name === 'Боковина правая').id).length, 2);
  }
});

test('seeded decimal L cabinets preserve all six outer joints without moving recorded panels', () => {
  let seed = 17421;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let index = 0; index < 100; index++) {
    const width = 600 + random() * 1000, height = 900 + random() * 1200, depth = 500 + random() * 350;
    const { project } = fixture({ width, height, depth, cutout: {
      corner: index % 2 ? 'back-left' : 'back-right', width: width * (.2 + random() * .25), depth: depth * (.3 + random() * .15)
    } });
    const source = generateParts(project), plan = generateDrillingPlan(project);
    assertPaired(plan);
    assert.equal(plan.joints.length, 6, `seeded cabinet ${index}`);
    assert.deepEqual(plan.parts.map(part => [part.width, part.height, part.position, part.outline]), source.map(part => [part.width, part.height, part.position, part.outline]));
  }
});

test('recording tolerance does not expand an internal notch boundary', () => {
  const { project } = fixture({ cutout: { corner: 'back-left', width: 300, depth: 200 } }), source = generateParts(project);
  source.find(part => part.name === 'Возвратная боковина выреза').position.x -= .0004;
  const plan = generateDrillingPlan(project, { parts: source });
  assert.equal(plan.valid, false);
  assert.equal(plan.errors.filter(error => error.code === 'pilot-outside').length, 2);
});

test('pilot depth follows the actual through plate gauge, with editable tip allowance', () => {
  for (const thickness of [15, 18, 25, 30]) {
    const { project, cabinet } = fixture();
    const material = project.materials.find(m => m.id === cabinet.materialId);
    material.thickness = thickness;
    const plan = generateDrillingPlan(project);
    assertPaired(plan);
    for (const joint of plan.joints) { near(joint.pilotDepth, 50 - thickness + 2); near(joint.engagement, 50 - thickness); }
    for (const hole of plan.holes.filter(h => h.kind === 'pilot')) near(hole.depth, 50 - thickness + 2);
  }
});

test('vertical fixed dividers are drilled through top and bottom rather than omitted', () => {
  const { project, cabinet } = fixture();
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { ...createSection(), id: 'left' }, { ...createSection(), id: 'right' }
  ] };
  const plan = generateDrillingPlan(project);
  assertPaired(plan);
  const divider = plan.parts.find(p => p.partitionId);
  const joints = plan.joints.filter(j => j.receivingPartId === divider.id);
  assert.equal(joints.length, 2);
  assert.deepEqual(new Set(joints.map(j => j.receivingFace)), new Set(['edge-b-min', 'edge-b-max']));
});

test('top and bottom attach to all real outer and return sides of both L-notch directions', () => {
  for (const corner of ['back-left', 'back-right']) {
    const { project } = fixture({ cutout: { corner, width: 300, depth: 200 } });
    const plan = generateDrillingPlan(project);
    assertPaired(plan);
    assert.equal(plan.joints.length, 6);
    const side = plan.parts.find(p => p.name === 'Возвратная боковина выреза');
    assert.equal(plan.joints.filter(j => j.throughPartId === side.id).length, 2);
    for (const hole of plan.holes.filter(h => h.partId === side.id && h.kind === 'clearance')) assert.ok(hole.a >= 50 && hole.a <= 147);
  }
});

test('loose shelves, backs, fronts, braces and moving drawer boxes do not acquire carcass screw holes', () => {
  const { project, cabinet } = fixture();
  Object.assign(cabinet.layout, { front: 'doors', internalDrawers: 2, shelves: 2 });
  const plan = generateDrillingPlan(project);
  assertPaired(plan);
  const excluded = plan.parts.filter(p => p.role === 'back' || p.name.includes('полка') || p.name.includes('Дверь') || p.component?.startsWith('internal-drawer'));
  assert.ok(excluded.length >= 3);
  assert.equal(plan.holes.some(h => excluded.some(p => p.id === h.partId)), false);
});

test('thin plates, screws without engagement and too short joints are blocked explicitly', () => {
  const thin = fixture();
  thin.project.materials.find(m => m.id === thin.cabinet.materialId).thickness = 8;
  const thinPlan = generateDrillingPlan(thin.project);
  assert.equal(thinPlan.valid, false);
  assert.ok(thinPlan.errors.every(e => e.code === 'panel-too-thin'));
  const thick = fixture();
  thick.project.materials.find(m => m.id === thick.cabinet.materialId).thickness = 50;
  assert.ok(generateDrillingPlan(thick.project).errors.some(e => e.code === 'no-engagement'));
  assert.ok(generateDrillingPlan(fixture({ depth: 80 }).project).errors.some(e => e.code === 'joint-too-short'));
});

test('narrow cabinets stagger opposed pilot bores without intersecting receiving holes', () => {
  const { project } = fixture({ width: 100 });
  const plan = generateDrillingPlan(project);
  assertPaired(plan);
  const top = plan.parts.find(p => p.name === 'Крышка'), pilots = plan.holes.filter(h => h.partId === top.id && h.kind === 'pilot');
  const left = pilots.filter(h => h.face === 'edge-a-min'), right = pilots.filter(h => h.face === 'edge-a-max');
  for (const first of left) for (const second of right) assert.ok(Math.abs(first.b - second.b) >= 7);
});

test('separate 5 mm pilot bores also reserve their wider 7 mm screw threads', () => {
  const { project } = fixture({ width: 100 });
  const source = generateParts({ ...project, settings: { ...project.settings, deductEdge: true } });
  const rightSide = source.find(part => part.name === 'Боковина правая');
  rightSide.width -= 6; rightSide.finishedWidth -= 6;
  const plan = generateDrillingPlan(project, { parts: source });
  assertPaired(plan);
  const top = plan.parts.find(part => part.name === 'Крышка'), pilots = plan.holes.filter(hole => hole.partId === top.id && hole.kind === 'pilot');
  const left = pilots.filter(hole => hole.face === 'edge-a-min'), right = pilots.filter(hole => hole.face === 'edge-a-max');
  for (const first of left) for (const second of right) assert.ok(Math.abs(first.b - second.b) >= 7, 'wider screw threads must not meet');
});

test('aligned vertical dividers on both sides of one separator report inaccessible screw heads', () => {
  const { project, cabinet } = fixture();
  const row = id => ({ id, kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { ...createSection(), id: `${id}-left` }, { ...createSection(), id: `${id}-right` }
  ] });
  cabinet.layout = { id: 'rows', kind: 'split', axis: 'horizontal', sizes: [1, 1], children: [row('upper'), row('lower')] };
  const plan = generateDrillingPlan(project);
  assert.equal(plan.valid, false);
  assert.equal(plan.errors.filter(e => e.code === 'unsupported-cross-joint').length, 2);
});

test('numeric settings are checked before generating manufacturing operations', () => {
  for (const settings of [{ endOffset: -1 }, { pilotExtraDepth: -1 }, { clearanceDiameter: 6 }, { pilotDiameter: 7 }, { countersinkDepth: 18 }]) {
    const { project } = fixture({}, settings), plan = generateDrillingPlan(project);
    assert.equal(plan.valid, false, JSON.stringify(settings));
    assert.ok(plan.errors.length);
  }
  const explicit = generateDrillingPlan(fixture({}, { countersinkDepth: 1.5, pilotExtraDepth: 3 }).project);
  assertPaired(explicit);
  assert.ok(explicit.holes.filter(h => h.kind === 'countersink').every(h => h.depth === 1.5 && !h.requiresSetup));
  assert.ok(explicit.holes.filter(h => h.kind === 'pilot').every(h => h.depth === 35));
});

test('supplied production parts keep global P identifiers across cabinets', () => {
  const { project, cabinet } = fixture();
  project.cabinets.push({ ...structuredClone(cabinet), id: 'second', x: 2500, rotation: 90 });
  const source = generateParts({ ...project, settings: { ...project.settings, deductEdge: true } });
  const plan = generateDrillingPlan(project, { parts: source });
  assertPaired(plan);
  assert.deepEqual(plan.parts.map(p => p.partCode), source.map((_, index) => `P${String(index + 1).padStart(4, '0')}`));
  assert.equal(new Set(plan.holes.map(h => h.id)).size, plan.holes.length);
  assert.equal(plan.joints.length, 8);
});
