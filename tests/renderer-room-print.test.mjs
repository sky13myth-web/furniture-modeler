import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject} from '../src/engine.js';
import {FurnitureViewport,generateRoom3DHTML} from '../src/renderer.js';
import {defaultName} from '../src/i18n.js';

function canvas(paths=[],texts=[]){
  let path=[];
  const context=new Proxy({
    createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),measureText:text=>({width:String(text).length*6}),
    createLinearGradient:()=>({addColorStop(){}}),beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},fill(){paths.push(path.map(p=>[...p]));},fillText:text=>texts.push(String(text))
  },{get:(target,key)=>key in target?target[key]:()=>{}});
  return {style:{},getContext:()=>context,getBoundingClientRect:()=>({width:900,height:700,left:0,top:0}),setAttribute(){},addEventListener(){},removeEventListener(){},toDataURL:()=> 'data:image/png;base64,aW1hZ2U='};
}

test('room capture preserves the live camera and includes the actual concave room and every open cabinet',()=>{
  const project=createDefaultProject(),cabinet=project.cabinets[0],outline=[{x:0,z:0},{x:4700,z:0},{x:4700,z:1800},{x:3500,z:1800},{x:3500,z:3200},{x:0,z:3200}];
  project.room.outline=outline;project.room.windows=[];
  cabinet.layout={id:'doors',kind:'section',front:'doors',doors:2,shelves:0,internalDrawerCount:2};
  project.cabinets.push({...structuredClone(cabinet),id:'neighbour',x:2000});
  const live=canvas(),viewport=new FurnitureViewport(live);
  viewport.setProject(project,cabinet.id);viewport.yaw=.43;viewport.elevation=.29;viewport.zoom=1.25;viewport.pan={x:17,y:-12};
  viewport.setOptions({room:false,focusCabinet:true,doorsOpen:true,internalDrawersOpen:true,dimensions:true,selectedSectionId:'doors'});
  const before={project:structuredClone(project),options:structuredClone(viewport.options),yaw:viewport.yaw,elevation:viewport.elevation,zoom:viewport.zoom,pan:{...viewport.pan},camera:viewport.camera,depthFrame:viewport.depthFrame,hits:viewport.hits,selectedId:viewport.selectedId,width:live.width,height:live.height};
  const paths=[],texts=[],captures=[],draw=FurnitureViewport.prototype.drawDepthFurniture;
  FurnitureViewport.prototype.drawDepthFurniture=function(items,scale){const result=draw.call(this,items,scale);captures.push({project:this.project,options:{...this.options},selectedId:this.selectedId,camera:this.camera,frame:this.depthFrame,faces:this.hits});return result;};
  try{
    const snapshot=viewport.captureRoom3D({width:1200,language:'en',canvasFactory:()=>canvas(paths,texts)}),capture=captures[0];
    assert.equal(snapshot.width,1200);assert.equal(snapshot.height,Math.round(1200*700/900));
    assert.deepEqual(snapshot.camera,{yaw:.43,elevation:.29,zoom:1.25,pan:{x:17,y:-12}});
    assert.equal(snapshot.doorsOpen,true);assert.equal(snapshot.internalDrawersOpen,true);
    assert.equal(capture.project,project);assert.equal(capture.selectedId,null);
    assert.equal(capture.options.room,true);assert.equal(capture.options.focusCabinet,false);assert.equal(capture.options.hud,false);assert.equal(capture.options.selection,false);assert.equal(capture.options.selectedSectionId,null);assert.equal(capture.options.dimensions,false);
    assert.equal(capture.frame.width,1200);
    assert.deepEqual(new Set(capture.faces.map(face=>face.id)),new Set(project.cabinets.map(c=>c.id)));
    for(const c of project.cabinets){
      assert.ok(capture.faces.some(face=>face.id===c.id&&face.component==='front'&&face.points.some(p=>p[2]>c.z+c.depth+100)));
      assert.ok(capture.faces.some(face=>face.id===c.id&&face.component==='internal-drawer-front'&&face.points.some(p=>p[2]>c.z+c.depth+100)));
    }
    const floor=paths.find(path=>path.length===outline.length),expected=outline.map(p=>capture.camera.project([p.x,-3,p.z]).slice(0,2));
    assert.ok(floor,'the actual six-sided floor is painted into the snapshot');
    floor.forEach((point,index)=>point.forEach((value,axis)=>assert.ok(Math.abs(value-expected[index][axis])<1e-8)));
    assert.deepEqual(texts,[],'there are no selection callouts, compass, scale or dimension overlays');
    assert.deepEqual(project,before.project);assert.deepEqual(viewport.options,before.options);assert.deepEqual(viewport.pan,before.pan);
    for(const key of ['yaw','elevation','zoom','camera','depthFrame','hits','selectedId'])assert.equal(viewport[key],before[key]);
    assert.equal(live.width,before.width);assert.equal(live.height,before.height);
  }finally{FurnitureViewport.prototype.drawDepthFurniture=draw;viewport.destroy();}
});

test('room 3D sheet localizes its caption, lists all cabinets and uses polygon bounds without trusting stale width fields',()=>{
  const project=createDefaultProject('tr'),cabinet=project.cabinets[0],imageDataUrl='data:image/png;base64,aW1hZ2U=';
  project.room.outline=[{x:100,z:300},{x:4700,z:300},{x:4400,z:3500},{x:100,z:3500}];project.room.width=999;project.room.depth=999;project.room.height=2800;
  project.cabinets.push({...structuredClone(cabinet),id:'copy',name:'Custom cabinet'});
  for(const language of ['ru','tr','en']){
    const html=generateRoom3DHTML(project,{imageDataUrl,language,doorsOpen:true,camera:{yaw:.4,elevation:.3,zoom:1.2}});
    assert.match(html,new RegExp(`<html lang="${language}">`));assert.equal((html.match(/<section /g)||[]).length,1);
    assert.ok(html.includes(defaultName('defaultProject',language)));assert.ok(html.includes(defaultName('defaultCabinet',language)));assert.ok(html.includes('Custom cabinet'));
    assert.match(html,/data-cabinet-count="2"/);assert.match(html,/data-camera-yaw="0.4"/);assert.match(html,/data-doors-open="true"/);
    assert.equal((html.match(/<li>/g)||[]).length,2);
    assert.doesNotMatch(html,/999|<canvas|<script|<button|window\.print/);
    if(language!=='ru')assert.doesNotMatch(html,/[А-Яа-яЁё]/);
    assert.match(html,/@page\{size:A4 landscape;margin:0\}/);
  }
  project.name='<script>room</script> & order';cabinet.name='<img src=x onerror="bad">';
  const escaped=generateRoom3DHTML(project,{imageDataUrl,language:'en'});
  assert.match(escaped,/&lt;script&gt;room&lt;\/script&gt; &amp; order/);assert.match(escaped,/&lt;img src=x onerror=&quot;bad&quot;&gt;/);assert.doesNotMatch(escaped,/<script>|<img src=x/);
  for(const invalid of ['https://example.com/view.png','data:image/svg+xml;base64,aW1hZ2U=','data:text/html;base64,aW1hZ2U=','data:image/png;base64,aW1hZ2U=" onerror="bad'])assert.throws(()=>generateRoom3DHTML(project,{imageDataUrl:invalid,language:'en'}),/Could not create/);
});

test('large room print keeps a short explicit cabinet preview instead of squeezing the current image away',()=>{
  const project=createDefaultProject(),template=project.cabinets[0];
  project.cabinets=Array.from({length:150},(_,index)=>({...structuredClone(template),id:`c-${index}`,name:`Custom ${index+1}`}));
  const html=generateRoom3DHTML(project,{imageDataUrl:'data:image/png;base64,aW1hZ2U=',language:'en'});
  assert.match(html,/data-cabinet-count="150"/);assert.match(html,/data-remaining-cabinets="142">More cabinets: 142/);
  assert.equal((html.match(/<li>/g)||[]).length,8);
  assert.match(html,/Custom 8<\/span>/);assert.doesNotMatch(html,/Custom 9<\/span>/);
  assert.equal((html.match(/<figure>/g)||[]).length,1);assert.equal((html.match(/<section /g)||[]).length,1);
});
