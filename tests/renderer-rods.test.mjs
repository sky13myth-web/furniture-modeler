import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,getRodLayout,getCabinetLayout,generateParts,validateProject} from '../src/engine.js';
import {getHardwareSchedule} from '../src/hardware.js';
import {FurnitureViewport,createDrawingSvg,generateDrawingHTML,generateHardwareHTML} from '../src/renderer.js';
import {translatePrintText,printNumber} from '../src/print-i18n.js';

function fixture(){
  const project=createDefaultProject('ru'),cabinet=project.cabinets[0];
  Object.assign(cabinet,{width:1200,height:2200,depth:650,plinth:100,x:200,y:50,z:100,name:'Wardrobe',layout:{id:'rail-opening',kind:'section',front:'open',shelves:0,rods:[{id:'rail',y:1800,frontInset:300,diameter:25,length:null}]}});
  return {project,cabinet};
}

function viewportFor(project){
  const previous=globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas=class{constructor(width,height){this.width=width;this.height=height;}getContext(){return{createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData(){}};}};
  const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),measureText:text=>({width:String(text).length*6})},{get:(target,key)=>key in target?target[key]:()=>{}});
  const canvas={style:{},getContext:()=>context,getBoundingClientRect:()=>({width:900,height:700,left:0,top:0}),setAttribute(){},addEventListener(){},removeEventListener(){}};
  const viewport=new FurnitureViewport(canvas);viewport.setOptions({room:false,dimensions:false,focusCabinet:true});viewport.setProject(project,project.cabinets[0].id);
  return {viewport,cleanup(){viewport.destroy();if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}};
}

test('clothes rail cylinders use engine axis coordinates and real length while remaining outside MDF production parts',()=>{
  const {project,cabinet}=fixture(),before=structuredClone(project),rod=getRodLayout(cabinet,project)[0],parts=generateParts(project);
  assert.deepEqual(validateProject(project).filter(issue=>issue.level==='error'),[]);
  assert.equal(rod.length,1160);assert.equal(rod.y,1818);assert.equal(rod.z,350);
  const f=viewportFor(project);
  try{
    const faces=f.viewport.hits.filter(face=>face.component==='rod'&&face.rodId==='rail'),points=faces.flatMap(face=>face.points),ranges=[0,1,2].map(axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);
    assert.ok(faces.length>=10);
    assert.deepEqual(ranges,[[220,1380],[1955.5,1980.5],[437.5,462.5]]);
    assert.deepEqual(new Set(f.viewport.hits.filter(face=>face.component==='rod-holder').map(face=>face.holderIndex)),new Set([0,1]));
    assert.ok(faces.every(face=>face.rodLength===1160&&face.rodDiameter===25&&face.sectionId==='rail-opening'));
    assert.ok(parts.every(part=>part.component!=='rod'&&part.role!=='rod'));
    assert.deepEqual(generateParts(project),parts);
  }finally{f.cleanup();}
  assert.deepEqual(project,before);
});

test('rotated wardrobes transform rail and holder geometry with the same cabinet pivot',()=>{
  const {project,cabinet}=fixture();cabinet.rotation=90;
  const f=viewportFor(project);
  try{
    const points=f.viewport.hits.filter(face=>face.component==='rod').flatMap(face=>face.points),minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minZ=Math.min(...points.map(p=>p[2])),maxZ=Math.max(...points.map(p=>p[2]));
    assert.ok(Math.abs(minX-(-162.5))<1e-8);assert.ok(Math.abs(maxX-(-137.5))<1e-8);assert.ok(Math.abs(minZ-120)<1e-8);assert.ok(Math.abs(maxZ-1280)<1e-8);
    assert.ok(f.viewport.hits.filter(face=>face.component==='rod-holder').every(face=>face.rodId==='rail'));
  }finally{f.cleanup();}
});

test('rail CAD symbols and manufacturing schedule preserve cut length, diameter and cabinet-base installation height in all languages',()=>{
  const {project,cabinet}=fixture(),before=structuredClone(project);
  for(const language of ['ru','tr','en']){
    for(const view of ['front','interior','top']){
      const svg=createDrawingSvg(project,view,{cabinetId:cabinet.id,language});
      assert.match(svg,/data-rod-id="rail" data-section-id="rail-opening" data-rod-length-mm="1160" data-rod-diameter-mm="25" data-rod-axis-height-mm="1918"/);
      assert.ok(svg.includes(`R1 · ${printNumber(1160,language)} · Ø25`));
      assert.match(svg,view==='interior'?/<path[^>]+stroke-width="1.5"\/>/:/<path[^>]+stroke-width="1.5" stroke-dasharray="7 4"\/>/);
      const compact=createDrawingSvg(project,view,{cabinetId:cabinet.id,language,compact:true});
      assert.match(compact,/data-rod-id="rail"/);assert.match(compact,/data-min-font="9.2"/);
    }
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language}),hardware=generateHardwareHTML(project,{cabinetId:cabinet.id,language});
    assert.ok(html.includes(translatePrintText('Штанги считаются отдельно от листовых материалов.',language)));
    for(const heading of ['Длина реза, мм','Диаметр, мм','Высота установки, мм'])assert.ok(html.includes(`<th>${translatePrintText(heading,language)}</th>`));
    assert.ok(html.includes(`<td>R1</td><td>S1</td><td>${printNumber(1160,language)}</td><td>25</td><td>${printNumber(1918,language)}</td><td>300</td><td>2</td>`));
    assert.ok(hardware.includes(`<td>${translatePrintText('Штанги для одежды',language)}</td><td>1</td>`));
    assert.ok(hardware.includes(`<td>${translatePrintText('Держатели штанг',language)}</td><td>2</td>`));
  }
  assert.deepEqual(getHardwareSchedule(cabinet,project).totals,{handles:0,guideSets:0,hinges:0,rods:1,rodHolders:2,rodLengthMeters:1.16});
  assert.deepEqual(project,before);
});

test('an internal clothes rail retains its inner compartment reference behind unchanged shared outer doors',()=>{
  const {project,cabinet}=fixture();cabinet.layout={id:'outer',kind:'section',front:'doors',doors:2,shelves:0,interiorLayout:{id:'inside',kind:'split',axis:'vertical',sizes:[1,1],children:[{id:'rail-side',kind:'section',front:'open',shelves:0,rods:[{id:'inner-rail',y:1600,frontInset:300,diameter:25,length:400}]},{id:'shelf-side',kind:'section',front:'open',shelves:2}]}};
  const layout=getCabinetLayout(cabinet,project),rod=getRodLayout(cabinet,project)[0];assert.equal(rod.sectionId,'outer');assert.equal(rod.interiorSectionId,'rail-side');
  const svg=createDrawingSvg(project,'interior',{cabinetId:cabinet.id,language:'en'});assert.match(svg,/data-interior-section-id="rail-side"/);
  const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language:'en'});assert.match(html,/<td>R1<\/td><td>S1\.1<\/td><td>400<\/td><td>25<\/td>/);
  assert.equal(layout.sections[0].node.doors,2);
});
