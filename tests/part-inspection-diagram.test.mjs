import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,createSection,generateParts} from '../src/engine.js';
import {generateDrillingPlan} from '../src/drilling.js';
import {inspectCabinetPart,getPartEdgeMeasurements} from '../src/part-inspection.js';
import {createPartInspectionSvg} from '../src/part-inspection-diagram.js';

function fixture({thickness=25,corner='back-left',rotation=90,enabled=true}={}) {
  const project=createDefaultProject('tr'),cabinet=project.cabinets[0];
  project.room.width=6000;project.room.depth=6000;project.room.outline=[{x:0,z:0},{x:6000,z:0},{x:6000,z:6000},{x:0,z:6000}];
  Object.assign(cabinet,{width:900.00049,height:2200,depth:623,x:2000,z:2000,rotation,layout:{...createSection('open'),id:'diagram-open',shelves:0}});
  if(corner)cabinet.cutout={corner,width:300,depth:200};
  project.materials.find(material=>material.id===cabinet.materialId).thickness=thickness;
  project.settings.drilling={enabled,countersinkDepth:null};
  return project;
}
const selectedDistance=(svg,axis)=>Number(svg.match(new RegExp(`data-inspection-edge="${axis}" data-distance="([^"]+)"`))?.[1]);

test('compact RAW diagram preserves all global operations and marker IDs without modifying inspection',()=>{
  const project=fixture(),plan=generateDrillingPlan(project),target=plan.holes.find(h=>h.kind==='clearance').partId;
  const info=inspectCabinetPart(project,target,{language:'tr'}),before=structuredClone(info),svg=createPartInspectionSvg(info);
  const markers=[...new Set(info.operations.map(h=>h.markerId))];
  assert.match(svg,/viewBox="0 0 900 700"/);assert.match(svg,new RegExp(`data-part-code="${info.partCode}"`));
  assert.match(svg,new RegExp(`data-raw-width="${info.part.width}"`));assert.match(svg,new RegExp(`data-raw-height="${info.part.height}"`));
  assert.equal(svg.match(/data-inspection-marker="/g).length,markers.length);
  assert.deepEqual([...svg.matchAll(/data-operation-id="([^"]+)"/g)].map(m=>m[1]).sort(),info.operations.map(h=>h.id).sort());
  assert.match(svg,new RegExp(`data-selected-marker="${markers[0]}"`));
  assert.equal(svg.match(/class="hit-target"/g).length,markers.length);
  assert.doesNotMatch(svg,/NaN|Infinity|<table|scope/);assert.deepEqual(info,before);
});

test('selected G retains every through/head operation, exact reference points and unset head depth',()=>{
  const project=fixture({corner:null}),plan=generateDrillingPlan(project),info=inspectCabinetPart(project,plan.holes.find(h=>h.kind==='clearance').partId,{language:'en'});
  const hole=info.operations.find(h=>h.b%1!==0&&h.kind==='clearance')??info.operations.find(h=>h.kind==='clearance'),svg=createPartInspectionSvg(info,{markerId:hole.markerId});
  assert.equal(selectedDistance(svg,'A'),hole.nearestEdges.a.distance);assert.equal(selectedDistance(svg,'B'),hole.nearestEdges.b.distance);
  for(const axis of ['a','b']){
    const edge=hole.nearestEdges[axis];
    assert.match(svg,new RegExp(`data-inspection-edge="${axis.toUpperCase()}" data-distance="${edge.distance}" data-edge-coordinate="${edge.coordinate}"`));
    assert.match(svg,new RegExp(`data-reference-a="${edge.point.a}" data-reference-b="${edge.point.b}"`));
  }
  const group=info.operations.filter(h=>h.markerId===hole.markerId);
  assert.equal(svg.match(/data-inspection-operation="/g).length,group.length);
  for(const op of group)assert.match(svg,new RegExp(`data-inspection-operation="${op.id}"`));
  assert.ok(group.some(op=>op.kind==='countersink'&&op.depth===null));
  assert.match(svg,/data-operation-kind="countersink" data-diameter="[^"]+" data-depth=""/);
  assert.match(svg,/depth \*/);assert.match(svg,/View T=/);assert.match(svg,/T=0|T=25/);
});

test('edge pilot section measures actual 18/25 mm thickness centres for rotated mirrored L parts',()=>{
  for(const thickness of [18,25])for(const corner of ['back-left','back-right'])for(const rotation of [90,-90]) {
    const project=fixture({thickness,corner,rotation}),plan=generateDrillingPlan(project);
    assert.equal(plan.valid,true);
    const original=plan.holes.find(h=>h.kind==='pilot'),info=inspectCabinetPart(project,original.partId,{language:'en'}),hole=info.operations.find(h=>h.id===original.id);
    const svg=createPartInspectionSvg(info,{markerId:hole.markerId});
    assert.equal(selectedDistance(svg,'T'),thickness/2);assert.equal(selectedDistance(svg,'A'),hole.nearestEdges.a.distance);assert.equal(selectedDistance(svg,'B'),hole.nearestEdges.b.distance);
    assert.match(svg,/data-inspection-section="T"/);assert.match(svg,new RegExp(`data-thickness-coordinate="${thickness/2}"`));
    assert.match(svg,new RegExp(`Section · T=${thickness}`));assert.match(svg,new RegExp(`T=${thickness}`));
    assert.equal(hole.depth,original.depth);assert.equal(hole.diameter,original.diameter);
  }
});

test('notch dimensions terminate on the actual contour rather than its rectangular envelope',()=>{
  const part={width:900,height:620,thickness:25,orientation:'horizontal',drillingOutline:[{x:300,y:0},{x:900,y:0},{x:900,y:620},{x:0,y:620},{x:0,y:200},{x:300,y:200}]};
  const hole={id:'H0001',markerId:'G01',a:325,b:100,thicknessCoordinate:0,kind:'clearance',diameter:7,depth:25,face:'face-t-min',...getPartEdgeMeasurements(part,{a:325,b:100,thicknessCoordinate:0},{language:'en'})};
  const info={part,partCode:'P0042',language:'en',axes:{viewFace:25},drilling:{enabled:true,valid:true},operations:[hole]};
  const svg=createPartInspectionSvg(info);
  assert.equal(selectedDistance(svg,'A'),25);assert.match(svg,/data-inspection-edge="A" data-distance="25" data-edge-coordinate="300" data-edge-notch="true" data-reference-a="300" data-reference-b="100"/);
  assert.match(svg,/A · left · notch/);
  // The same unmirrored transform maps A from left to right and B down.
  const marker=svg.match(/data-a-mm="325" data-b-mm="100"[\s\S]*?class="hit-target" cx="([^"]+)" cy="([^"]+)"/);
  assert.ok(marker);assert.ok(Number(marker[1])>120&&Number(marker[1])<600);assert.ok(Number(marker[2])>115&&Number(marker[2])<555);
});

test('disabled, invalid and unsupported parts show real contours and dimensions with no invented holes',()=>{
  const project=fixture({enabled:false}),part=generateParts(project)[0],info=inspectCabinetPart(project,part.id,{language:'tr'});
  for(const [drilling,status] of [[{enabled:false,valid:false},'Delme kapalı'],[{enabled:true,valid:false},'Delme uygun değil'],[{enabled:true,valid:true},'Delik yok']]) {
    const svg=createPartInspectionSvg({...info,drilling,operations:[]});
    assert.match(svg,/data-inspection-contour="raw"/);assert.match(svg,/data-inspection-blank-dimension="A"/);assert.match(svg,/data-inspection-blank-dimension="B"/);
    assert.match(svg,new RegExp(status));assert.doesNotMatch(svg,/data-inspection-marker="|data-operation-id="|data-inspection-edge="/);
  }
});

test('all three locales use compact labels, escape identities and preserve selectable dense markers',()=>{
  const part={width:900,height:620,thickness:25,orientation:'horizontal'};
  for(const language of ['ru','tr','en']) {
    const operations=Array.from({length:80},(_,i)=>{
      const hole={id:`H${i}`,markerId:`G${String(i+1).padStart(2,'0')}`,a:50+i*.1,b:250+i*.1,thicknessCoordinate:12.5,kind:'pilot',face:'edge-a-min',diameter:5,depth:32};
      return {...hole,...getPartEdgeMeasurements(part,hole,{language})};
    });
    const info={part,partCode:'P<script>&',language,drilling:{enabled:true,valid:true},operations,axes:{viewFace:25}},svg=createPartInspectionSvg(info,{markerId:'G80'});
    assert.equal(svg.match(/data-inspection-marker="/g).length,80);assert.equal(svg.match(/data-operation-id="/g).length,80);
    assert.match(svg,/data-selected-marker="G80"/);assert.match(svg,/data-marker-label-mode="spaced"/);assert.match(svg,/P&lt;script&gt;&amp;/);assert.doesNotMatch(svg,/<script>/);
    assert.equal(selectedDistance(svg,'T'),12.5);
    if(language!=='ru')assert.doesNotMatch(svg,/[А-Яа-яЁё]/);
  }
});

test('allowed fractional diameters and depths retain their exact values in readable separate lines',()=>{
  const project=fixture({corner:null});
  Object.assign(project.settings.drilling,{screwDiameter:7.125,screwLength:50.789,clearanceDiameter:7.125,pilotDiameter:5.123,pilotExtraDepth:2.987,countersinkDiameter:10.234,countersinkDepth:1.234});
  const plan=generateDrillingPlan(project);assert.equal(plan.valid,true);
  for(const kind of ['clearance','pilot']) {
    const original=plan.holes.find(h=>h.kind===kind),info=inspectCabinetPart(project,original.partId,{language:'en'}),selected=info.operations.find(h=>h.id===original.id);
    const svg=createPartInspectionSvg(info,{markerId:selected.markerId});
    for(const operation of info.operations.filter(h=>h.markerId===selected.markerId)) {
      const group=svg.match(new RegExp(`<g data-inspection-operation="${operation.id}"[\\s\\S]*?</g>`))?.[0];
      assert.ok(group);assert.match(group,new RegExp(`data-diameter="${operation.diameter}" data-depth="${operation.depth}"`));
      assert.match(group,new RegExp(`data-inspection-measurement="diameter">Ø${operation.diameter}</text>`));
      assert.match(group,new RegExp(`data-inspection-measurement="depth">depth ${operation.depth}</text>`));
      assert.doesNotMatch(group,/>Ø[^<]+ · depth/);
    }
  }
});

const attribute=(tag,key)=>tag.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1];
const measuredGroups=svg=>[...svg.matchAll(/<g\b[^>]*data-inspection-edge="([ABT])"[^>]*>[\s\S]*?<\/g>/g)].map(([body,axis])=>({axis,body,ids:attribute(body,'data-inspection-markers')?.split(' ')??[],distance:Number(attribute(body,'data-distance')),coordinate:Number(attribute(body,'data-edge-coordinate'))}));

test('all-hole diagrams cover every exact A/B and pilot T reference while selection preserves all dimensions',()=>{
  for(const thickness of [18,25])for(const corner of ['back-left','back-right'])for(const language of ['ru','tr','en']) {
    const project=fixture({thickness,corner}),plan=generateDrillingPlan(project);
    for(const part of plan.parts.filter(p=>plan.holes.some(h=>h.partId===p.id))) {
      const info=inspectCabinetPart(project,part.id,{language}),before=structuredClone(info),first=createPartInspectionSvg(info,{allHoles:true});
      const ids=[...new Set(info.operations.map(h=>h.markerId))],last=createPartInspectionSvg(info,{allHoles:true,markerId:ids.at(-1)}),dimensions=measuredGroups(first);
      assert.match(first,/data-inspection-all-holes="true"/);assert.equal(first.match(/data-inspection-marker-label="/g).length,ids.length);
      assert.equal(first.match(/data-operation-id="/g).length,info.operations.length);
      assert.deepEqual(measuredGroups(last).map(({body,...d})=>d),dimensions.map(({body,...d})=>d));
      for(const id of ids) {
        const operations=info.operations.filter(h=>h.markerId===id),hole=operations[0];
        for(const axis of ['A','B',...(operations.some(h=>h.kind==='pilot')?['T']:[])]) {
          const target=axis==='T'?operations.find(h=>h.kind==='pilot'):hole,edge=target.nearestEdges[axis.toLowerCase()];
          const matching=dimensions.filter(d=>d.axis===axis&&d.ids.includes(id));assert.equal(matching.length,1);
          assert.equal(matching[0].distance,edge.distance);assert.equal(matching[0].coordinate,edge.coordinate);
          const reference=matching[0].body.match(new RegExp(`<g data-inspection-reference-marker="${id}"[^>]*/>`))?.[0];assert.ok(reference);
          assert.equal(Number(attribute(reference,'data-hole-a')),target.a);assert.equal(Number(attribute(reference,'data-hole-b')),target.b);
          if(axis==='T')assert.equal(Number(attribute(reference,'data-reference-t')),edge.coordinate);
          else {assert.equal(Number(attribute(reference,'data-reference-a')),edge.point.a);assert.equal(Number(attribute(reference,'data-reference-b')),edge.point.b);}
        }
      }
      assert.deepEqual(info,before);
    }
  }
});

test('shared grid dimensions retain opposite edge datums and compact profiles are counted once',()=>{
  const part={width:600,height:600,thickness:25,orientation:'horizontal'},operations=[];
  for(const b of [50,300,550])for(const a of [50,300,550]) {
    const hole={id:`H${operations.length+1}`,markerId:`G${String(operations.length+1).padStart(2,'0')}`,a,b,thicknessCoordinate:0,face:'face-t-min',kind:'clearance',diameter:7,depth:25};
    operations.push({...hole,...getPartEdgeMeasurements(part,hole,{language:'en'})});
  }
  const svg=createPartInspectionSvg({part,partCode:'P0010',language:'en',drilling:{enabled:true,valid:true},operations},{allHoles:true}),dimensions=measuredGroups(svg);
  assert.equal(dimensions.filter(d=>d.axis==='A').length,3);assert.equal(dimensions.filter(d=>d.axis==='B').length,3);
  const opposite=dimensions.filter(d=>d.axis==='A'&&d.distance===50);assert.equal(opposite.length,2);assert.deepEqual(opposite.map(d=>d.coordinate).sort((a,b)=>a-b),[0,600]);
  assert.equal(svg.match(/data-inspection-profile="/g).length,1);assert.equal(svg.match(/data-inspection-operation="/g).length,9);
  assert.equal(svg.match(/data-inspection-marker-label="/g).length,9);
});

test('crowded rear ordinate chains keep every absolute nearest-edge distance and distinct physical datums',()=>{
  for(const language of ['ru','tr','en']) {
    const part={width:1000,height:2100,thickness:8,orientation:'vertical-width'},operations=[];
    for(const b of [12.5,50,250,450,650,850,1050,1250,1450,1650,1850,2050,2087.5])for(const a of [12.5,987.5]) {
      const hole={id:`H${operations.length+1}`,markerId:`G${String(operations.length+1).padStart(2,'0')}`,a,b,thicknessCoordinate:0,face:'face-t-min',kind:'clearance',diameter:4.5,depth:8};
      operations.push({...hole,...getPartEdgeMeasurements(part,hole,{language})});
    }
    const info={part,partCode:'P0005',language,drilling:{enabled:true,valid:true},operations},before=structuredClone(info),svg=createPartInspectionSvg(info,{allHoles:true}),dimensions=measuredGroups(svg);
    assert.ok(Number(attribute(svg,'width'))<1400,'dense rear uses shared chains instead of one lane per station');
    assert.match(svg,/data-inspection-ordinate-axis="B" data-ordinate-datum="0"/);
    assert.match(svg,/data-inspection-ordinate-axis="B" data-ordinate-datum="2100"/);
    assert.equal(svg.match(/data-inspection-marker-label="/g).length,operations.length);
    for(const hole of operations)for(const axis of ['A','B']) {
      const edge=hole.nearestEdges[axis.toLowerCase()],dimension=dimensions.find(d=>d.axis===axis&&d.ids.includes(hole.markerId));
      assert.ok(dimension);assert.equal(dimension.distance,edge.distance);assert.equal(dimension.coordinate,edge.coordinate);
      const reference=dimension.body.match(new RegExp(`<g data-inspection-reference-marker="${hole.markerId}"[^>]*/>`))?.[0];
      assert.equal(Number(attribute(reference,'data-reference-a')),edge.point.a);assert.equal(Number(attribute(reference,'data-reference-b')),edge.point.b);
      assert.equal(Number(attribute(reference,'data-hole-a')),hole.a);assert.equal(Number(attribute(reference,'data-hole-b')),hole.b);
    }
    assert.deepEqual(info,before);
    const highlighted=createPartInspectionSvg(info,{allHoles:true,markerId:operations.at(-1).markerId});
    assert.deepEqual(measuredGroups(highlighted).map(({body,...d})=>d),dimensions.map(({body,...d})=>d));
  }
});

test('natural drawings place vertical B upward and horizontal B downward without changing raw coordinates',()=>{
  for(const orientation of ['horizontal','vertical-depth','vertical-width']) {
    const part={width:600,height:900,thickness:25,orientation},operations=[100,800].map((b,index)=>{
      const hole={id:`H${index+1}`,markerId:`G0${index+1}`,a:100,b,thicknessCoordinate:12.5,face:'edge-a-min',kind:'pilot',diameter:5,depth:32};
      return {...hole,...getPartEdgeMeasurements(part,hole,{language:'en'})};
    });
    for(const allHoles of [false,true]) {
      const svg=createPartInspectionSvg({part,partCode:'P0001',language:'en',axes:{viewFace:123},drilling:{enabled:true,valid:true},operations},{allHoles});
      const cy=marker=>Number(svg.match(new RegExp(`data-inspection-marker="${marker}"[\\s\\S]*?class="hit-target" cx="[^"]+" cy="([^"]+)"`))?.[1]);
      const vertical=orientation!=='horizontal';assert.equal(cy('G02')<cy('G01'),vertical);
      assert.equal(attribute(svg,'data-view-b-direction'),vertical?'up':'down');assert.equal(Number(attribute(svg,'data-view-face')),orientation==='vertical-depth'?0:25);
      assert.match(svg,new RegExp(`B ${vertical?'↑':'↓'}`));assert.match(svg,/data-a-mm="100" data-b-mm="800"/);
      if(allHoles&&vertical) {
        const top=Number(svg.match(/<text x="[^"]+" y="([^"]+)" data-inspection-physical-edge="top"/)?.[1]),bottom=Number(svg.match(/<text x="[^"]+" y="([^"]+)" data-inspection-physical-edge="bottom"/)?.[1]);
        assert.ok(top<bottom);
      }
      const section=svg.slice(svg.indexOf('<g data-inspection-section="T">'));
      if(orientation==='horizontal')assert.ok(section.indexOf('T=25 · upper')<section.indexOf('T=0 · lower'));
      else {
        const near=orientation==='vertical-depth'?'left':'rear',far=orientation==='vertical-depth'?'right':'front';
        assert.ok(section.indexOf(`>T=0 · ${near}</text>`)<section.indexOf(`>T=25 · ${far}</text>`));
      }
      const localized=createPartInspectionSvg({part,partCode:'P0001',language:'ru',drilling:{enabled:true,valid:true},operations},{allHoles});
      const localizedSection=localized.slice(localized.indexOf('<g data-inspection-section="T">'));
      const captionY=[...localizedSection.matchAll(/<text x="[^"]+" y="([^"]+)" data-inspection-physical-edge=/g)].map(match=>Number(match[1]));
      assert.equal(captionY.length,2);assert.ok(Math.abs(captionY[1]-captionY[0])>=25,'opposite physical T captions retain separate rows in Russian');
    }
  }
});
