import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,createSection,generateParts} from '../src/engine.js';
import {generateDrillingPlan} from '../src/drilling.js';
import {productionPartCode} from '../src/production-id.js';
import {getDrillingDrawingSet} from '../src/drilling-view.js';
import {inspectCabinetPart,getPartEdgeMeasurements} from '../src/part-inspection.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.002,`${actual} versus ${expected}`);
function fixture({thickness=18,rotation=0,corner=null,enabled=true}={}) {
  const project=createDefaultProject('ru'),cabinet=project.cabinets[0];
  project.room.width=6000;project.room.depth=6000;project.room.outline=[{x:0,z:0},{x:6000,z:0},{x:6000,z:6000},{x:0,z:6000}];
  Object.assign(cabinet,{width:900,height:2200,depth:623,x:2000,z:2000,rotation,layout:{...createSection('open'),id:'qa-open',shelves:0}});
  if(corner)cabinet.cutout={corner,width:300,depth:200};
  project.materials.find(stock=>stock.id===cabinet.materialId).thickness=thickness;
  project.settings.drilling={enabled,countersinkDepth:null,integerSpacing:true};
  return {project,cabinet};
}

test('inspection preserves global production codes, raw/finished dimensions, exact operations and export maps',()=>{
  const {project,cabinet}=fixture();project.settings.deductEdge=false;
  const second=structuredClone(cabinet);Object.assign(second,{id:'qa-second',x:4000,z:3500});second.layout.id='qa-second-open';project.cabinets.push(second);
  const source=structuredClone(project),parts=generateParts(project),plan=generateDrillingPlan(project),target=plan.holes.find(h=>h.cabinetId===second.id).partId;
  const item=inspectCabinetPart(project,target,{language:'en'}),index=parts.findIndex(p=>p.id===target);
  assert.ok(item);assert.equal(item.partCode,productionPartCode(index));assert.equal(item.sourcePartId,target);
  assert.deepEqual(item.sourcePart,parts[index]);assert.equal(item.drilling.enabled,true);assert.equal(item.drilling.valid,true);
  assert.equal(item.dimensions.raw.width,item.part.width);assert.equal(item.dimensions.finished.width,item.part.finishedWidth);
  assert.ok(item.dimensions.raw.width<item.dimensions.finished.width);
  assert.deepEqual(item.operations.map(h=>h.id),plan.holes.filter(h=>h.partId===target).map(h=>h.id));
  const exported=getDrillingDrawingSet(project,{cabinetId:second.id,language:'en'}).drawings.find(d=>d.part.id===target);
  assert.deepEqual(item.maps.map(({page,...map})=>map),exported.pages);assert.ok(item.maps.length>0);
  for(const hole of item.operations){
    const original=plan.holes.find(h=>h.id===hole.id);
    for(const key of Object.keys(original))assert.deepEqual(hole[key],original[key]);
    assert.ok(hole.kindLabel&&hole.faceLabel);assert.match(hole.markerId,/^G\d+$/);
    assert.ok(hole.nearestEdges.a&&hole.nearestEdges.b&&hole.nearestEdges.t);
    for(const edge of [hole.nearestEdges.a,hole.nearestEdges.b])assert.ok(Number.isFinite(edge.coordinate)&&Number.isFinite(edge.distance)&&typeof edge.notch==='boolean'&&edge.label);
  }
  assert.deepEqual(project,source);assert.equal(inspectCabinetPart(project,'unknown-part'),null);
});

test('disabled inspection never enables drilling and unsupported drawer parts get no invented hardware holes',()=>{
  const {project}=fixture({enabled:false}),part=generateParts(project)[0],before=structuredClone(project);
  const item=inspectCabinetPart(project,part.id,{language:'en'});
  assert.equal(item.drilling.enabled,false);assert.equal(item.drilling.valid,false);assert.deepEqual(item.operations,[]);assert.deepEqual(item.maps,[]);assert.deepEqual(project,before);
  const drawers=createDefaultProject('ru');drawers.settings.drilling={enabled:true};
  const bottom=generateParts(drawers).find(p=>p.component==='external-drawer-box'&&p.name.endsWith(' · дно'));
  const bottomInfo=inspectCabinetPart(drawers,bottom.id,{language:'en'});
  assert.deepEqual(bottomInfo.operations,[]);assert.deepEqual(bottomInfo.maps,[]);
  assert.match(bottomInfo.drilling.scope,/Fixed carcass joints and screwed back-panel connections/);
  assert.match(bottomInfo.drilling.scope,/3 mm hardboard backs use nails without drilling/);
});

test('nearest distances use real L-notch edges on both mirrored contours and retain edge-entry zero',()=>{
  const left=[{x:300,y:0},{x:900,y:0},{x:900,y:620},{x:0,y:620},{x:0,y:200},{x:300,y:200}];
  const right=[{x:0,y:0},{x:600,y:0},{x:600,y:200},{x:900,y:200},{x:900,y:620},{x:0,y:620}];
  for(const reverse of [false,true])for(const [outline,a,side,coordinate] of [[left,325,'aMinus',300],[right,575,'aPlus',600]]){
    const part={width:900,height:620,thickness:25,orientation:'horizontal',drillingOutline:reverse?[...outline].reverse():outline};
    const distances=getPartEdgeMeasurements(part,{a,b:100,thicknessCoordinate:12.5},{language:'en'});
    assert.equal(distances.edgeDistances[side].distance,25);assert.equal(distances.edgeDistances[side].coordinate,coordinate);assert.equal(distances.edgeDistances[side].notch,true);
    assert.equal(distances.nearestEdges.a.distance,25);assert.equal(distances.nearestContour.distance,25);assert.equal(distances.nearestContour.notch,true);
    assert.equal(distances.nearestEdges.t.distance,12.5);
    const entry=getPartEdgeMeasurements(part,{a:coordinate,b:75,thicknessCoordinate:12.5},{language:'en'});
    assert.equal(entry.nearestContour.distance,0);assert.equal(entry.nearestEdges.a.distance,0);
    near(side==='aMinus'?entry.edgeDistances.aPlus.distance:entry.edgeDistances.aMinus.distance,600);
  }
  const leg=getPartEdgeMeasurements({width:900,height:620,thickness:18,orientation:'horizontal',drillingOutline:left},{a:100,b:250,thicknessCoordinate:9},{language:'en'});
  assert.equal(leg.edgeDistances.bMinus.coordinate,200);assert.equal(leg.edgeDistances.bMinus.distance,50);assert.equal(leg.edgeDistances.bMinus.notch,true);
  assert.match(leg.edgeDistances.bMinus.label,/notch/);
});

test('physical edge and T labels match H/VD/VW handedness in RU/TR/EN without losing fractional centres',()=>{
  for(const language of ['ru','tr','en'])for(const [orientation,aEdge,bEdge,tEdge] of [['horizontal','left','rear','lower'],['vertical-depth','rear','bottom','leftFace'],['vertical-width','left','bottom','rearFace']]){
    const result=getPartEdgeMeasurements({width:900,height:620,thickness:25,orientation},{a:50,b:307.5,thicknessCoordinate:12.5},{language});
    assert.equal(result.nearestEdges.a.physicalEdge,aEdge);assert.equal(result.nearestEdges.b.physicalEdge,bEdge);assert.equal(result.nearestEdges.t.physicalEdge,tEdge);
    assert.equal(result.nearestEdges.a.distance,50);assert.equal(result.nearestEdges.b.distance,307.5);assert.equal(result.nearestEdges.t.distance,12.5);
    if(language!=='ru')for(const edge of Object.values(result.nearestEdges))assert.doesNotMatch(edge.label,/[А-Яа-яЁё]/);
  }
});

test('18/25 mm rotated mirrored L parts keep paired world bores, exact local centres and unset head-seat depth',()=>{
  for(const thickness of [18,25])for(const rotation of [90,-90])for(const corner of ['back-left','back-right']){
    const {project}=fixture({thickness,rotation,corner});
    const plan=generateDrillingPlan(project);assert.equal(plan.valid,true);
    const target=plan.holes.find(h=>h.kind==='pilot').partId,item=inspectCabinetPart(project,target,{language:'en'});
    assert.equal(item.drilling.valid,true);assert.equal(item.partCode,plan.parts.find(p=>p.id===target).partCode);
    for(const hole of item.operations){
      const original=plan.holes.find(h=>h.id===hole.id);assert.deepEqual(hole.worldEntry,original.worldEntry);assert.deepEqual(hole.direction,original.direction);
      if(hole.kind==='pilot'){
        assert.equal(hole.thicknessCoordinate,thickness/2);assert.equal(hole.nearestEdges.t.distance,thickness/2);
        const mate=plan.holes.find(h=>h.pairId===hole.pairId&&h.kind==='clearance');
        for(const axis of ['x','y','z'])near(mate.worldEntry[axis]+mate.direction[axis]*mate.depth,hole.worldEntry[axis]);
      }
      if(hole.kind==='countersink'){assert.equal(hole.depth,null);assert.equal(hole.requiresSetup,true);}
    }
  }
});

test('inspection scopes neighbour failures while retaining selected and shared drilling errors',()=>{
  const {project,cabinet}=fixture(),first=generateParts(project)[0],other=structuredClone(cabinet);
  Object.assign(other,{id:'qa-invalid-neighbour',x:7000,z:7000});other.layout.id='qa-other-open';project.cabinets.push(other);
  assert.equal(inspectCabinetPart(project,first.id,{language:'en'}).drilling.valid,true);
  const neighbour=generateParts(project).find(p=>p.cabinetId===other.id),invalid=inspectCabinetPart(project,neighbour.id,{language:'en'});
  assert.equal(invalid.drilling.valid,false);assert.ok(invalid.drilling.errors.length);assert.deepEqual(invalid.maps,[]);
  project.settings.drilling.pilotDiameter=8;
  const shared=inspectCabinetPart(project,first.id,{language:'en'});assert.equal(shared.drilling.valid,false);assert.ok(shared.drilling.errors.some(e=>e.code==='diameter-order'));assert.deepEqual(shared.maps,[]);
});
