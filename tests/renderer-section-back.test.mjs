import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,createSection,generateParts,getCabinetRearReservation} from '../src/engine.js';
import {FurnitureViewport} from '../src/renderer.js';

function withViewport(project,run) {
  const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),measureText:text=>({width:String(text).length*6})},{get:(target,key)=>key in target?target[key]:()=>{}});
  const canvas={style:{},getContext:()=>context,getBoundingClientRect:()=>({width:900,height:700,left:0,top:0}),setAttribute(){},addEventListener(){},removeEventListener(){}};
  const viewport=new FurnitureViewport(canvas);
  try {viewport.setProject(project,project.cabinets[0].id);viewport.setOptions({room:false,focusCabinet:true,interior:true});viewport.setView('3d');run(viewport);} finally {viewport.destroy();}
}

test('local lap backs use the same reserved depth in the manufacturing panels and live appliance preview',()=>{
  for(const thickness of [3,18]) {
    const p=createDefaultProject('tr'),c=p.cabinets[0];
    Object.assign(c,{width:1400,height:2200,depth:620,plinth:100,x:400,z:200,includeBack:false,backThickness:thickness,backMaterialId:thickness===18?c.materialId:c.backMaterialId,rearBraces:[],layout:{id:'columns',kind:'split',axis:'vertical',sizes:[1,1],children:[
      {...createSection('open'),id:'closed-back',back:'solid',shelves:1},
      {...createSection('open'),id:'machine',back:'none',shelves:0,appliance:{type:'washer',label:'Machine',width:600,height:850,depth:500}},
    ]}});
    const before=structuredClone(p),parts=generateParts(p);
    assert.equal(getCabinetRearReservation(c,p),thickness);
    assert.equal(parts.filter(part=>part.role==='section-back').length,1);
    withViewport(p,viewport=>{
      const machine=viewport.hits.filter(face=>face.component==='appliance').flatMap(face=>face.points);
      assert.ok(machine.length);
      assert.equal(Math.min(...machine.map(point=>point[2])),c.z+c.depth-500,'machine is placed relative to the true front of the reserved carcass');
      for(const panel of parts.filter(part=>part.role==='section-back')) {
        const points=viewport.hits.filter(face=>face.partId===panel.id).flatMap(face=>face.points);
        assert.ok(points.length);
        assert.equal(Math.min(...points.map(point=>point[0])),c.x+panel.position.x);
        assert.equal(Math.max(...points.map(point=>point[0])),c.x+panel.position.x+panel.finishedWidth);
        assert.equal(Math.min(...points.map(point=>point[2])),c.z+panel.position.z);
        assert.equal(Math.max(...points.map(point=>point[2])),c.z+panel.position.z+panel.thickness);
      }
    });
    assert.deepEqual(p,before,'preview cannot change the project or rear geometry');
  }
});
