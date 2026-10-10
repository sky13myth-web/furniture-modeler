import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,createSection,generateParts} from '../src/engine.js';
import {generateDrillingPlan,normalizeDrillingSettings,getDrillingMeasurementFrame} from '../src/drilling.js';
import {inspectCabinetPart,getPartEdgeMeasurements} from '../src/part-inspection.js';
import {createPartInspectionSvg} from '../src/part-inspection-diagram.js';
import {buildDrillingFiles,generateDrillingCSV} from '../src/drilling-export.js';
import {setPartEdgeBanding} from '../src/part-edge-banding.js';
import {checkImport} from '../src/project-io.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);
const attr=(tag,key)=>tag.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1];
function fixture(thickness=25,corner=null,rotation=37,count='auto'){
 const project=createDefaultProject('tr'),cabinet=project.cabinets[0];
 project.room.width=6000;project.room.depth=6000;project.room.outline=[{x:0,z:0},{x:6000,z:0},{x:6000,z:6000},{x:0,z:6000}];
 Object.assign(cabinet,{width:900.7654,height:2200.9876,depth:623.1234,x:2000,z:2000,rotation,layout:{id:'columns',kind:'split',axis:'vertical',sizes:[1,1],children:[{...createSection('open'),id:'a',shelves:0},{...createSection('open'),id:'b',shelves:0}]}});
 if(corner)cabinet.cutout={corner,width:300.1234,depth:200.1234};
 project.materials.find(m=>m.id===cabinet.materialId).thickness=thickness;
 project.settings.drilling={enabled:true,screwsPerJoint:count,countersinkDepth:null};
 const side=generateParts(project).find(p=>p.name==='Боковина левая');setPartEdgeBanding(project,side.id,{right:2,bottom:1.5});
 return project;
}

test('measurement datum is an optional strict boolean, survives JSON, and legacy default remains RAW',()=>{
 assert.equal(normalizeDrillingSettings().measureFromFinishedEdge,false);
 assert.equal(normalizeDrillingSettings({measureFromFinishedEdge:true}).measureFromFinishedEdge,true);
 assert.equal(normalizeDrillingSettings({measureFromFinishedEdge:'true'}).measureFromFinishedEdge,false);
 const project=fixture();project.settings.drilling.measureFromFinishedEdge=true;
 assert.equal(checkImport(JSON.parse(JSON.stringify(project))).settings.drilling.measureFromFinishedEdge,true);
 for(const value of ['true',1,null,{}]){project.settings.drilling.measureFromFinishedEdge=value;assert.throws(()=>checkImport(project),/готового края/);}
});

test('finished-edge selection preserves every physical bore, mate, panel, gauge and fractional station in rotated mirrored 18/25 mm cabinets',()=>{
 for(const thickness of [18,25])for(const corner of [null,'back-left','back-right'])for(const rotation of [90,-90])for(const count of ['auto',2]){
  const project=fixture(thickness,corner,rotation,count),before=structuredClone(project),raw=generateDrillingPlan(project);
  assert.equal(raw.valid,true);project.settings.drilling.measureFromFinishedEdge=true;
  const finished=generateDrillingPlan(project);assert.equal(finished.valid,true);
  assert.deepEqual(finished.holes,raw.holes);assert.deepEqual(finished.joints,raw.joints);assert.deepEqual(finished.parts,raw.parts);
  for(const part of finished.parts.filter(p=>finished.holes.some(h=>h.partId===p.id))){
   const info=inspectCabinetPart(project,part.id,{language:'en'}),frame=info.measurement;
   assert.equal(frame.basis,'finished');assert.equal(frame.width,part.finishedWidth);assert.equal(frame.height,part.finishedHeight);
   assert.deepEqual(frame.offset,part.rawOrigin);
   const displayPart={...part,width:frame.width,height:frame.height,drillingOutline:frame.outline};
   for(const hole of info.operations){
    const original=raw.holes.find(h=>h.id===hole.id);for(const key of Object.keys(original))assert.deepEqual(hole[key],original[key]);
    near(hole.measurement.a,hole.a+part.rawOrigin.a);near(hole.measurement.b,hole.b+part.rawOrigin.b);
    assert.deepEqual(hole.nearestEdges,getPartEdgeMeasurements(displayPart,{...hole,...hole.measurement},{language:'en'}).nearestEdges);
    assert.deepEqual(hole.rawNearestEdges,getPartEdgeMeasurements(part,hole,{language:'en'}).nearestEdges);
    if(hole.kind==='pilot')assert.equal(hole.thicknessCoordinate,thickness/2);
   }
  }
  delete project.settings.drilling.measureFromFinishedEdge;assert.deepEqual(project,before);
 }
});

test('finished L-notch distances end on the actual finished contour, never on the bounding rectangle',()=>{
 const part={width:896,height:617,finishedWidth:900,finishedHeight:620,thickness:25,orientation:'horizontal',rawOrigin:{a:1.5,b:.8},finishedOutline:[{x:300,y:0},{x:900,y:0},{x:900,y:620},{x:0,y:620},{x:0,y:200},{x:300,y:200}]};
 const frame=getDrillingMeasurementFrame(part,{measureFromFinishedEdge:true}),raw={a:323.5,b:99.2,thicknessCoordinate:12.5},measurement={a:raw.a+frame.offset.a,b:raw.b+frame.offset.b};
 const edges=getPartEdgeMeasurements({...part,width:frame.width,height:frame.height,drillingOutline:frame.outline},{...raw,...measurement},{language:'en'});
 assert.equal(edges.nearestEdges.a.distance,25);assert.equal(edges.nearestEdges.a.coordinate,300);assert.equal(edges.nearestEdges.a.notch,true);assert.deepEqual(edges.nearestEdges.a.point,{a:300,b:100});
});

test('all and selected graphical dimensions use chosen datum while retaining canonical RAW metadata and natural direction',()=>{
 const project=fixture();project.settings.drilling.measureFromFinishedEdge=true;const plan=generateDrillingPlan(project);
 for(const language of ['ru','tr','en'])for(const part of plan.parts.filter(p=>plan.holes.some(h=>h.partId===p.id))){
  const info=inspectCabinetPart(project,part.id,{language}),before=structuredClone(info);
  for(const allHoles of [false,true]){
   const svg=createPartInspectionSvg(info,{allHoles});assert.equal(attr(svg,'data-measurement-basis'),'finished');assert.equal(Number(attr(svg,'data-raw-width')),part.width);assert.equal(Number(attr(svg,'data-measurement-width')),part.finishedWidth);
   assert.match(svg,/data-inspection-contour="finished"/);
   for(const [tag] of svg.matchAll(/<g\b[^>]*data-inspection-marker="[^"]+"[^>]*>/g)){
    const hole=info.operations.find(h=>h.markerId===attr(tag,'data-inspection-marker'));assert.equal(Number(attr(tag,'data-a-mm')),hole.a);assert.equal(Number(attr(tag,'data-b-mm')),hole.b);assert.equal(Number(attr(tag,'data-measurement-a')),hole.measurement.a);assert.equal(Number(attr(tag,'data-measurement-b')),hole.measurement.b);
   }
  }
  assert.deepEqual(info,before);
 }
});

test('CSV keeps RAW operation columns and adds explicitly chosen measurement columns; map tables and settings agree',()=>{
 const project=fixture(25,'back-left',-90,2),rawCSV=generateDrillingCSV(project);project.settings.drilling.measureFromFinishedEdge=true;
 const csv=generateDrillingCSV(project),rows=value=>value.trim().split(/\r?\n/).map(line=>[...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m=>m[1].replaceAll('""','"'))),raw=rows(rawCSV),finished=rows(csv),header=finished[0],index=key=>header.indexOf(key),plan=generateDrillingPlan(project);
 assert.deepEqual(finished[0],raw[0]);
 for(let i=1;i<finished.length;i++){
  const hole=plan.holes.find(h=>h.id===finished[i][index('OPERATION_ID')]),part=plan.parts.find(p=>p.id===hole.partId);
  for(const key of ['A_MM','B_MM','THICKNESS_COORD_MM','WORLD_ENTRY_X_MM','WORLD_ENTRY_Y_MM','WORLD_ENTRY_Z_MM','DEPTH_MM','DIMENSION_BASIS'])assert.equal(finished[i][index(key)],raw[i][index(key)]);
  near(Number(finished[i][index('MEASUREMENT_A_MM')]),Math.round((hole.a+part.rawOrigin.a)*1000)/1000);near(Number(finished[i][index('MEASUREMENT_B_MM')]),Math.round((hole.b+part.rawOrigin.b)*1000)/1000);assert.equal(finished[i][index('MEASUREMENT_BASIS')],'FINISHED');
 }
 const files=buildDrillingFiles(project,{language:'tr'});assert.match(files.find(f=>f.path==='settings.csv').content,/"measureFromFinishedEdge";"1"/);assert.match(files.find(f=>f.path==='README.txt').content,/MEASUREMENT_A_MM\/B_MM/);
 const sheets=files.filter(f=>f.path.startsWith('maps/'));assert.ok(sheets.every(f=>f.content.includes('data-measurement-basis="finished"')));
 assert.deepEqual(sheets.flatMap(f=>[...f.content.matchAll(/data-table-operation-id="([^"]+)"/g)].map(m=>m[1])).sort(),plan.holes.map(h=>h.id).sort());
});

test('edge-entry arrows are graphical in all and selected modes, point into the actual drilling axis and never appear on face-only groups',()=>{
 for(const measureFromFinishedEdge of [false,true]){
  const project=fixture();project.settings.drilling.measureFromFinishedEdge=measureFromFinishedEdge;const plan=generateDrillingPlan(project);
  for(const part of plan.parts.filter(p=>plan.holes.some(h=>h.partId===p.id))){
   const info=inspectCabinetPart(project,part.id,{language:'en'}),pilotGroups=[...new Set(info.operations.filter(h=>h.kind==='pilot').map(h=>h.markerId))];
   for(const allHoles of [false,true]){
    const svg=createPartInspectionSvg(info,{allHoles});const arrows=[...svg.matchAll(/<g data-inspection-edge-entry="([^"]+)"[^>]*><line\b[^>]*>/g)];
    assert.deepEqual(arrows.map(m=>m[1]).sort(),pilotGroups.sort());
    for(const [tag,id] of arrows){const hole=info.operations.find(h=>h.markerId===id&&h.kind==='pilot'),dx=Number(attr(tag,'x2'))-Number(attr(tag,'x1')),dy=Number(attr(tag,'y2'))-Number(attr(tag,'y1'));near(dx,32*hole.localDirection.a);near(dy,32*hole.localDirection.b*(part.orientation==='horizontal'?1:-1));assert.match(tag,/marker-end="url\(#inspection-bore-arrow\)"/);}
   }
  }
  const maps=buildDrillingFiles(project,{language:'en'}).filter(f=>f.path.startsWith('maps/'));const arrows=maps.flatMap(f=>[...f.content.matchAll(/data-edge-operation-id="([^"]+)"/g)].map(m=>m[1]));assert.deepEqual(arrows.sort(),plan.holes.filter(h=>h.kind==='pilot').map(h=>h.id).sort());
 }
});
