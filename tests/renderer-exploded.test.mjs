import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,generateParts} from '../src/engine.js';
import {createInteriorExample,createLaundryExample,createRodsExample} from '../src/examples.js';
import {FurnitureViewport,rasterizeFaces} from '../src/renderer.js';
import {productionPartCode} from '../src/production-id.js';

function canvas(){
  const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),measureText:text=>({width:String(text).length*6})},{get:(target,key)=>key in target?target[key]:()=>{}});
  return {style:{},getContext:()=>context,getBoundingClientRect:()=>({width:850,height:650,left:17,top:23}),setAttribute(){},addEventListener(){},removeEventListener(){},setPointerCapture(){},hasPointerCapture:()=>false};
}
function softwareViewport(project,options,callbacks,work){
  const previous=globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas=class{constructor(width,height){this.width=width;this.height=height;}getContext(){return {createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData(){}};}};
  const viewport=new FurnitureViewport(canvas(),callbacks);
  try{viewport.setProject(project,project.cabinets.at(-1).id);viewport.setOptions(options);work(viewport);}finally{viewport.destroy();if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
}
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} != ${b}`);

test('exploded panels preserve every real finished contour, dimension, origin and global P code including rotated cabinets',()=>{
  for(const project of [createDefaultProject('en'),createInteriorExample('en'),createLaundryExample('en')]){
    const first=project.cabinets[0],second=structuredClone(first);
    Object.assign(second,{id:'exploded-second',x:2300,y:310,z:870,rotation:37,plinth:137.5,cutout:{corner:'back-left',width:180,depth:150}});project.cabinets.push(second);
    const parts=generateParts(project),selected=parts.filter(part=>part.cabinetId===second.id),before=structuredClone(project);
    const viewport=new FurnitureViewport(canvas());viewport.setProject(project,second.id);viewport.setOptions({exploded:true,focusCabinet:true,doorsOpen:true,internalDrawersOpen:true});
    try{
      assert.deepEqual(new Set(viewport.hits.map(hit=>hit.partId)),new Set(selected.map(part=>part.id)),'all production panels, including outer facades and both drawer bottoms, appear once as identifiable solids');
      for(const part of selected){
        const faces=viewport.hits.filter(hit=>hit.partId===part.id),index=parts.findIndex(candidate=>candidate.id===part.id),angle=second.rotation*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle);
        const points=faces.flatMap(face=>face.points.map(p=>{const x=p[0]-second.x,z=p[2]-second.z;return [x*co+z*si-face.displayDisplacement[0],p[1]-second.y-face.displayDisplacement[1],-x*si+z*co-face.displayDisplacement[2]];}));
        const min=[0,1,2].map(axis=>Math.min(...points.map(p=>p[axis]))),max=[0,1,2].map(axis=>Math.max(...points.map(p=>p[axis]))),w=part.finishedWidth,h=part.finishedHeight,t=part.thickness;
        const dimensions=part.orientation==='horizontal'?[w,t,h]:part.orientation==='vertical-depth'?[t,h,w]:[w,h,t],origin=[part.position.x,second.plinth+part.position.y,part.position.z];
        for(let axis=0;axis<3;axis++){near(min[axis],origin[axis],`${part.id} origin ${axis}`);near(max[axis]-min[axis],dimensions[axis],`${part.id} finished dimension ${axis}`);near(faces[0].productionOrigin[axis],origin[axis],`${part.id} stored production origin`);}
        assert.ok(faces.every(face=>face.partCode===productionPartCode(index)&&face.id===second.id));
        assert.ok(faces.some(face=>face.displayDisplacement.some(value=>value!==0)),'explosion moves only the display geometry');
        if(part.finishedOutline)assert.ok(faces.some(face=>face.points.length===part.finishedOutline.length),'the finished L contour remains shaped');
      }
      assert.deepEqual(project,before);
    }finally{viewport.destroy();}
  }
});

test('part depth ownership identifies the painted panel at intersections regardless of face order',()=>{
  const door={id:'cabinet',partId:'real-door',partCode:'P0042',color:'#008877',screen:[[0,0,100],[100,0,100],[100,100,100],[0,100,100]]};
  const side={id:'cabinet',partId:'real-side',partCode:'P0041',color:'#eeeeee',screen:[[0,0,0],[100,0,200],[100,100,200],[0,100,0]]};
  for(const faces of [[door,side],[side,door]]){
    const frame=rasterizeFaces(faces,100,100,1,false,{partPicking:true}),left=frame.owners[50*100+25],right=frame.owners[50*100+75];
    assert.equal(frame.ownerIds[left],'cabinet');assert.equal(frame.ownerIds[right],'cabinet');
    assert.equal(frame.ownerPartIds[left],'real-door');assert.equal(frame.ownerPartIds[right],'real-side');
    assert.equal(frame.ownerPartCodes[left],'P0042');assert.equal(frame.ownerPartCodes[right],'P0041');
  }
});

test('exploded clicks select a source part, highlighting preserves geometry and normal clicks still select the cabinet',()=>{
  const project=createInteriorExample('en'),parts=generateParts(project),partSelections=[],cabinetSelections=[];
  softwareViewport(project,{exploded:true,focusCabinet:true},{onPartSelect:id=>partSelections.push(id),onSelect:id=>cabinetSelections.push(id)},viewport=>{
    const frame=viewport.depthFrame,index=frame.owners.findIndex(owner=>frame.ownerPartIds[owner]),owner=frame.owners[index],partId=frame.ownerPartIds[owner],part=parts.find(part=>part.id===partId);
    assert.ok(part);assert.equal(frame.ownerPartCodes[owner],productionPartCode(parts.indexOf(part)));
    const click=index=>{const f=viewport.depthFrame,event={button:0,pointerId:1,clientX:17+(index%f.width+.5)/f.scale,clientY:23+(Math.floor(index/f.width)+.5)/f.scale};viewport.pointerDown(event);viewport.pointerUp(event);};
    click(index);assert.deepEqual(partSelections,[partId]);assert.deepEqual(cabinetSelections,[]);
    const geometry=viewport.hits.filter(hit=>hit.partId===partId).map(hit=>hit.points),colors=viewport.hits.filter(hit=>hit.partId===partId).map(hit=>hit.color);
    viewport.setOptions({selectedPartId:partId});
    assert.deepEqual(viewport.hits.filter(hit=>hit.partId===partId).map(hit=>hit.points),geometry);
    assert.notDeepEqual(viewport.hits.filter(hit=>hit.partId===partId).map(hit=>hit.color),colors,'selection is visibly highlighted');
    const allGeometry=viewport.hits.map(hit=>({id:hit.partId,points:hit.points}));
    viewport.setOptions({doorsOpen:true,internalDrawersOpen:true});assert.deepEqual(viewport.hits.map(hit=>({id:hit.partId,points:hit.points})),allGeometry,'facade opening cannot alter a production panel in exploded mode');
    const gap=viewport.depthFrame.owners.findIndex(owner=>!owner);click(gap);assert.equal(partSelections.at(-1),null);
    viewport.setOptions({exploded:false});const cabinetPixel=viewport.depthFrame.owners.findIndex(owner=>viewport.depthFrame.ownerIds[owner]);click(cabinetPixel);
    assert.deepEqual(cabinetSelections,[project.cabinets[0].id]);assert.equal(partSelections.length,2);
  });
});

test('exploded model does not invent selectable production IDs for rods, appliances, handles or support feet',()=>{
  for(const project of [createRodsExample('en'),createLaundryExample('en')])softwareViewport(project,{exploded:true,focusCabinet:true},{},viewport=>{
    const ids=new Set(generateParts(project).map(part=>part.id));
    assert.ok(viewport.hits.every(hit=>ids.has(hit.partId)));
    assert.ok(viewport.depthFrame.ownerPartIds.filter(Boolean).every(id=>ids.has(id)));
    assert.equal(viewport.applianceCallouts.length,0);
  });
});

test('single exploded clicks select only, while native double-click opens the same painted real panel and never a gap or drag',()=>{
  const project=createInteriorExample('en'),selected=[],opened=[];
  softwareViewport(project,{exploded:true,focusCabinet:true},{onPartSelect:id=>selected.push(id),onPartOpen:id=>opened.push(id)},viewport=>{
    const frame=viewport.depthFrame,index=frame.owners.findIndex(owner=>frame.ownerPartIds[owner]),partId=frame.ownerPartIds[frame.owners[index]];
    const event={button:0,pointerId:1,clientX:17+(index%frame.width+.5)/frame.scale,clientY:23+(Math.floor(index/frame.width)+.5)/frame.scale};
    const double=viewport.listeners.find(([type])=>type==='dblclick')[1];
    viewport.pointerDown(event);viewport.pointerUp(event);assert.deepEqual(selected,[partId]);assert.deepEqual(opened,[]);
    viewport.pointerDown(event);viewport.pointerUp(event);double(event);assert.deepEqual(selected,[partId,partId]);assert.deepEqual(opened,[partId]);
    const gap=frame.owners.findIndex(owner=>!owner),empty={...event,clientX:17+(gap%frame.width+.5)/frame.scale,clientY:23+(Math.floor(gap/frame.width)+.5)/frame.scale};
    viewport.pointerDown(empty);viewport.pointerUp(empty);double(empty);assert.deepEqual(opened,[partId]);
    viewport.pointerDown(event);viewport.pointerMove({...event,clientX:event.clientX+30});viewport.pointerUp(event);double(event);assert.deepEqual(opened,[partId],'a drag cannot become a part-open gesture');
    viewport.setOptions({exploded:false});viewport.pointerDown(event);viewport.pointerUp(event);double(event);assert.deepEqual(opened,[partId]);
  });
});
