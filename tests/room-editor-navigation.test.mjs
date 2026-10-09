import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomEditor} from '../src/room-editor.js';
import {canPlaceCabinet,createDefaultProject,getCabinetLayout,validateProject} from '../src/engine.js';

// The actual editor subscribes to a small DOM surface. SVG mapping uses its
// real fallback projection, including letterboxing, instead of identity mm.
function fixture(){
  const rootListeners=new Map(),windowListeners=new Map(),moves=[],changes=[];
  const bounds={left:50,top:100,width:800,height:500};
  let removed=false,disconnected=false;
  const svg={getBoundingClientRect:()=>bounds};
  const root={clientWidth:800,clientHeight:580,innerHTML:'',focus(){},contains:()=>true,setPointerCapture(){},releasePointerCapture(){},
    querySelector:selector=>selector==='svg'||selector==='.room-plan'?svg:null,
    addEventListener:(name,callback)=>rootListeners.set(name,callback),removeEventListener:name=>rootListeners.delete(name),remove(){removed=true;}};
  const window={ResizeObserver:class{observe(){}disconnect(){disconnected=true;}},addEventListener:(name,callback)=>windowListeners.set(name,callback),removeEventListener:name=>windowListeners.delete(name)};
  const document={createElement:()=>root,defaultView:window,documentElement:{lang:'ru'}};
  root.ownerDocument=document;
  const container={ownerDocument:document,append(){},clientWidth:800,clientHeight:580};
  const editor=new RoomEditor(container,{onChange:(points,metadata)=>changes.push({points,metadata}),onMoveCabinet:(id,position)=>moves.push({id,position})});
  editor.setProject({room:{width:4000,depth:3000,height:2700,windows:[]},cabinets:[{id:'cab',name:'Мой шкаф для мастерской',x:100,z:100,y:0,width:600,depth:400,height:800}],materials:[]});
  editor.fitView();
  const target=(dataset={})=>{
    const result={dataset};
    result.closest=selector=>selector==='svg'?svg:selector==='button'?dataset.roomZoom?result:null:selector.startsWith('[data-room-')&&Object.keys(dataset).length?result:null;
    return result;
  };
  const pointer=(x,y,extra={})=>({clientX:x,clientY:y,pointerId:1,button:0,target:target(),preventDefault(){},...extra});
  const worldEvent=(point,extra={})=>{
    const b=editor.viewBox,s=Math.min(bounds.width/b.width,bounds.height/b.depth);
    return pointer(bounds.left+(bounds.width-b.width*s)/2+(point.x-b.x)*s,bounds.top+(bounds.height-b.depth*s)/2+(point.z-b.z)*s,extra);
  };
  return {editor,root,svg,bounds,moves,changes,target,pointer,worldEvent,rootListeners,windowListeners,
    cleanup(){editor.destroy();assert.equal(rootListeners.size,0);assert.equal(windowListeners.size,0);assert.equal(removed,true);assert.equal(disconnected,true);}};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≈ ${b}`);

test('wheel zoom keeps the world point under the cursor, including SVG letterboxing',()=>{
  const f=fixture();
  try{
    const before=structuredClone(f.editor.project),event=f.pointer(625,340,{deltaY:-240}),anchor=f.editor.toPlan(event),box={...f.editor.viewBox};
    let prevented=0;event.preventDefault=()=>prevented++;
    f.rootListeners.get('wheel')(event);
    const after=f.editor.toPlan(event);
    near(after.x,anchor.x);near(after.z,anchor.z);
    assert.ok(f.editor.zoom>1&&f.editor.viewBox.width<box.width);assert.equal(prevented,1);
    assert.match(f.root.innerHTML,/data-room-zoom="in"/);assert.match(f.root.innerHTML,/data-room-scale/);
    f.editor.zoomBy(1e10,event);assert.equal(f.editor.zoom,16);
    f.editor.zoomBy(1e-20,event);assert.equal(f.editor.zoom,.25);
    assert.deepEqual(f.editor.project,before);assert.equal(f.changes.length,0);
  }finally{f.cleanup();}
});

test('zoom buttons and keyboard fit restore the full plan without changing geometry or capturing text input',()=>{
  const f=fixture();
  try{
    const initial={...f.editor.viewBox},before=structuredClone(f.editor.project);
    f.rootListeners.get('click')({target:f.target({roomZoom:'in'})});assert.equal(f.editor.zoom,1.25);
    f.rootListeners.get('keydown')({key:'-',target:f.target(),preventDefault(){}});near(f.editor.zoom,1);
    f.editor.zoomBy(2);
    f.rootListeners.get('keydown')({key:'0',target:{closest:()=>({tagName:'INPUT'})},preventDefault(){throw Error('input must retain its key');}});
    assert.equal(f.editor.zoom,2);
    f.rootListeners.get('keydown')({key:'0',target:f.target(),preventDefault(){}});
    assert.equal(f.editor.zoom,1);assert.deepEqual(f.editor.viewBox,initial);assert.deepEqual(f.editor.project,before);
  }finally{f.cleanup();}
});

test('camera remains stable through project updates and geometry previews until explicit fit',()=>{
  const f=fixture();
  try{
    f.editor.zoomBy(3);const camera={...f.editor.viewBox};
    const next=structuredClone(f.editor.project);next.room.width=8000;next.room.depth=5000;f.editor.setProject(next);
    assert.deepEqual(f.editor.viewBox,camera);assert.equal(f.editor.zoom,3);
    const original=structuredClone(f.editor.outline),draft=structuredClone(original);draft[0].x=-3000;
    f.editor.drag={type:'corner',original,draft,pointerId:1,moved:true};f.editor.render();
    assert.deepEqual(f.editor.viewBox,camera);assert.equal(f.editor.zoomBy(2),false,'a geometry gesture cannot silently change its mapping');
    f.editor.pointerCancel({pointerId:1});f.editor.fitView();
    assert.equal(f.editor.zoom,1);assert.ok(f.editor.viewBox.width>camera.width*3);
  }finally{f.cleanup();}
});

test('middle-button pan changes only the camera, freezes SVG height and rolls back on cancellation',()=>{
  const f=fixture();
  try{
    f.editor.setSelectedCorners([0,1],false);
    const before=structuredClone(f.editor.project),camera={...f.editor.viewBox},scale=f.editor.planMetrics(camera).scale;
    f.editor.pointerDown(f.pointer(400,300,{button:1,target:f.target({roomCabinet:'cab'})}));
    assert.equal(f.editor.drag.type,'pan');assert.equal(f.editor.drag.planHeight,500);
    f.editor.pointerMove(f.pointer(500,360));
    near(f.editor.camera.x,camera.x-100/scale);near(f.editor.camera.z,camera.z-60/scale);
    assert.match(f.root.innerHTML,/height:500px;flex:0 0 500px/);assert.match(f.root.className,/is-panning/);
    assert.deepEqual(f.editor.getSelectedCorners(),[0,1]);assert.equal(f.moves.length,0);assert.equal(f.changes.length,0);
    f.editor.pointerCancel({pointerId:1});assert.deepEqual(f.editor.viewBox,camera);
    assert.doesNotMatch(f.root.innerHTML,/flex:0 0 500px/);assert.deepEqual(f.editor.project,before);
  }finally{f.cleanup();}
});

test('Space drag pans while an ordinary empty left drag remains corner selection',()=>{
  const f=fixture();
  try{
    f.rootListeners.get('keydown')({key:' ',code:'Space',target:f.target(),preventDefault(){}});
    assert.equal(f.editor.spacePressed,true);assert.match(f.root.className,/pan-ready/);
    f.editor.pointerDown(f.pointer(400,300));assert.equal(f.editor.drag.type,'pan');
    f.editor.pointerMove(f.pointer(450,300));f.editor.pointerUp({pointerId:1});
    const panned={...f.editor.viewBox};
    f.windowListeners.get('keyup')({key:' ',code:'Space'});assert.equal(f.editor.spacePressed,false);
    f.editor.pointerDown(f.pointer(400,300));assert.equal(f.editor.drag.type,'selection');
    f.editor.pointerCancel({pointerId:1});assert.deepEqual(f.editor.viewBox,panned);assert.equal(f.moves.length,0);
  }finally{f.cleanup();}
});

test('zoomed cabinet drag resolves each pointer step, preserves precision and commits only once',()=>{
  const f=fixture();
  try{
    f.editor.project.room.installationClearance={walls:50,ceiling:0};f.editor.zoomBy(3);
    const initial=structuredClone(f.editor.project),start={x:300,z:300};
    f.editor.pointerDown(f.worldEvent(start,{target:f.target({roomCabinet:'cab'})}));
    f.editor.pointerMove(f.worldEvent({x:4100,z:600}));
    const contact={...f.editor.drag.draft};
    assert.ok(contact.x>3349.9&&contact.x<3350);near(contact.z,400);
    assert.equal(canPlaceCabinet({...f.editor.project.cabinets[0],...contact},f.editor.project),true);
    assert.equal(f.moves.length,0);assert.match(f.root.innerHTML,/height:500px;flex:0 0 500px/);
    f.editor.pointerMove(f.worldEvent({x:4090,z:600}));near(f.editor.drag.draft.x,contact.x-10);
    const accepted={...f.editor.drag.draft};f.editor.pointerUp({pointerId:1});
    assert.deepEqual(f.moves,[{id:'cab',position:accepted}]);assert.deepEqual(f.editor.project,initial);
    assert.doesNotMatch(f.root.innerHTML,/flex:0 0 500px/);f.editor.pointerUp({pointerId:1});assert.equal(f.moves.length,1);
  }finally{f.cleanup();}
});

test('Delete cabinet uses the owner callback, restores rejected selection and yields to openings, corners and inputs',()=>{
  const f=fixture();
  try{
    const deleted=[],key={key:'Delete',target:f.target(),preventDefault(){}};
    f.editor.callbacks.onDeleteCabinet=id=>{deleted.push(id);return false;};f.editor.selectedCabinetId='cab';
    f.editor.render();assert.match(f.root.innerHTML,/<span data-i18n="off">Мой шкаф для мастерской<\/span>/);
    f.editor.keyDown({...key,target:{closest:()=>({tagName:'INPUT'})}});assert.equal(deleted.length,0);
    f.editor.keyDown(key);assert.deepEqual(deleted,['cab']);assert.equal(f.editor.selectedCabinetId,'cab');
    f.editor.callbacks.onDeleteOpening=id=>deleted.push(id);f.editor.selectedWindowId='window';
    f.editor.keyDown(key);assert.deepEqual(deleted,['cab','window']);assert.equal(f.editor.selectedCabinetId,'cab');
    f.editor.setSelectedCorners([0],false);f.editor.selectedCabinetId='cab';
    f.editor.keyDown(key);assert.equal(deleted.length,2);assert.equal(f.changes.length,1);
    f.editor.callbacks.onDeleteCabinet=id=>deleted.push(id);f.editor.selectedCabinetId='cab';
    f.editor.keyDown({...key,key:'Backspace'});assert.equal(f.editor.selectedCabinetId,null);assert.equal(deleted.at(-1),'cab');
    f.editor.selectedCabinetId='cab';f.editor.setSelectedWall(f.editor.selectedWall);assert.equal(f.editor.selectedCabinetId,null);
    f.editor.selectedCabinetId='cab';f.editor.pointerDown(f.worldEvent({x:1000,z:0},{target:f.target({roomWall:'0'})}));
    assert.equal(f.editor.selectedCabinetId,null,'clicking a wall cannot leave a cabinet selected for Delete');
    f.editor.pointerCancel({pointerId:1});
  }finally{f.cleanup();}
});

test('selected resize grips project width and depth along rotated cabinet axes without moving its origin',()=>{
  for(const axis of ['width','depth']){
    const f=fixture();
    try{
      const project=createDefaultProject(),cabinet=project.cabinets[0],commits=[];
      Object.assign(cabinet,{x:1000,z:500,width:900,depth:700,rotation:90});
      f.editor.setProject(project,cabinet.id);f.editor.fitView();
      f.editor.callbacks.onResizeCabinet=(id,sizes)=>commits.push({id,sizes});
      const original=structuredClone(project),start=axis==='width'?{x:650,z:1400}:{x:300,z:950};
      assert.equal((f.root.innerHTML.match(/data-room-resize=/g)||[]).length,2);
      const grip=f.target({roomResize:axis,roomCabinet:cabinet.id});
      f.editor.pointerDown(f.worldEvent(start,{target:grip}));
      assert.equal(f.editor.drag.type,'cabinet-resize','a resize grip takes priority over its cabinet group');
      const end=axis==='width'?{x:start.x,y:0,z:start.z+100}:{x:start.x-100,z:start.z};
      f.editor.pointerMove(f.worldEvent(end));
      near(f.editor.drag.draft[axis],cabinet[axis]+100);
      assert.deepEqual([f.editor.drag.draft.x,f.editor.drag.draft.z,f.editor.drag.draft.rotation],[1000,500,90]);
      assert.equal(commits.length,0);assert.deepEqual(project,original);
      const accepted={width:f.editor.drag.draft.width,depth:f.editor.drag.draft.depth};
      f.editor.pointerUp({pointerId:1});assert.deepEqual(commits,[{id:cabinet.id,sizes:accepted}]);
      f.editor.pointerUp({pointerId:1});assert.equal(commits.length,1);assert.deepEqual(project,original);
    }finally{f.cleanup();}
  }
});

test('plan resize preview clamps at appliance clearances and cancellation leaves the project untouched',()=>{
  const f=fixture();
  try{
    const project=createDefaultProject(),cabinet=project.cabinets[0],commits=[];
    Object.assign(cabinet,{x:100,z:100,width:900,height:1000,depth:700,plinth:0,includeBottom:false,layout:{id:'machine',kind:'section',front:'open',shelves:0,appliance:{type:'washer',width:600,height:850,depth:600,useClearances:true,clearances:{side:25,top:25,rear:50}}}});
    assert.deepEqual(validateProject(project).filter(item=>item.level==='error'),[]);
    f.editor.setProject(project,cabinet.id);f.editor.fitView();f.editor.callbacks.onResizeCabinet=(id,sizes)=>commits.push({id,sizes});
    const before=structuredClone(project),start={x:1000,z:450};
    f.editor.pointerDown(f.worldEvent(start,{target:f.target({roomResize:'width',roomCabinet:cabinet.id})}));
    f.editor.pointerMove(f.worldEvent({x:200,z:450}));
    const draft=f.editor.drag.draft,opening=getCabinetLayout(draft,project).sections[0];
    assert.ok(draft.width>=685.999&&draft.width<686.01);assert.ok(opening.width>=649.999);
    assert.deepEqual([draft.x,draft.z,draft.depth],[100,100,700]);assert.equal(commits.length,0);
    assert.deepEqual(validateProject({...project,cabinets:[draft]}).filter(item=>item.level==='error'),[]);
    f.editor.pointerCancel({pointerId:1});assert.equal(commits.length,0);assert.deepEqual(project,before);
    assert.doesNotMatch(f.root.innerHTML,/flex:0 0 500px/);
  }finally{f.cleanup();}
});
