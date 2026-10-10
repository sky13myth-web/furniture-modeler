import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,createSection} from '../src/engine.js';
import {generateDrillingPlan} from '../src/drilling.js';
import {generateFactoryCSV} from '../src/factory-export.js';
import {DRILLING_COLUMNS,REAR_FASTENING_COLUMNS,checkDrillingExport,generateDrillingCSV,buildDrillingFiles} from '../src/drilling-export.js';

function parseCsv(text){
  const rows=[],row=[];let cell='',quoted=false;text=text.replace(/^\ufeff/,'');
  for(let index=0;index<text.length;index++){
    const char=text[index];
    if(char==='"'){if(quoted&&text[index+1]==='"'){cell+='"';index++;}else quoted=!quoted;}
    else if(char===';'&&!quoted){row.push(cell);cell='';}
    else if(char==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push([...row]);row.length=0;cell='';}
    else cell+=char;
  }
  return rows;
}
function records(text){const [columns,...rows]=parseCsv(text);return rows.map(row=>Object.fromEntries(columns.map((column,index)=>[column,row[index]])));}
function mixedProject(language='en'){
  const project=createDefaultProject(language),first=project.cabinets[0];
  project.cabinets=[first];
  Object.assign(first,{x:20,z:20,rotation:0,width:900,height:1000,depth:620,includeBack:true,backThickness:18,backMaterialId:'mdf-white',layout:{id:'rear-mdf',kind:'section',front:'open',shelves:1},name:'MDF back; =name'});
  const second=structuredClone(first);Object.assign(second,{id:'qa-thin-back',name:'Thin back',x:1300,backThickness:3,backMaterialId:project.materials.find(stock=>stock.thickness===3).id});second.layout.id='rear-thin';project.cabinets.push(second);
  project.settings.drilling={enabled:true,countersinkDepth:2};
  return project;
}

test('rear screw operations export their own 4×30 spec, preserve raw geometry and global IDs, and add no nail holes',()=>{
  const project=mixedProject(),before=structuredClone(project),plan=generateDrillingPlan(project),files=buildDrillingFiles(project,{language:'en'});
  assert.equal(plan.valid,true,JSON.stringify(plan.errors));
  const rear=plan.holes.filter(hole=>hole.fastenerType==='rear-screw'),core=plan.holes.filter(hole=>hole.fastenerType==='confirmat');
  assert.ok(rear.length&&core.length);
  const csv=files.find(file=>file.path==='drilling.csv').content,rows=records(csv),parts=records(generateFactoryCSV(project,{language:'en'}));
  assert.deepEqual(parseCsv(csv)[0],DRILLING_COLUMNS);assert.equal(DRILLING_COLUMNS.at(-1),'FASTENER_TYPE');
  assert.equal(rows.length,plan.holes.length);
  for(const hole of plan.holes){
    const row=rows.find(row=>row.OPERATION_ID===hole.id),part=parts.find(part=>part.SOURCE_PART_ID===hole.partId);
    assert.equal(row.PART_ID,hole.partCode);assert.equal(row.PART_ID,part.PART_ID);assert.equal(row.JOINT_ID,hole.pairId);
    assert.deepEqual([row.A_MM,row.B_MM,row.THICKNESS_COORD_MM].map(Number),[hole.a,hole.b,hole.thicknessCoordinate]);
    assert.equal(row.FASTENER_TYPE,hole.fastenerType);
    assert.equal(Number(row.SCREW_DIAMETER_MM),hole.screwDiameter);assert.equal(Number(row.SCREW_LENGTH_MM),hole.screwLength);
    if(hole.fastenerType==='rear-screw')assert.deepEqual([Number(row.SCREW_DIAMETER_MM),Number(row.SCREW_LENGTH_MM)],[4,30]);
    else assert.deepEqual([Number(row.SCREW_DIAMETER_MM),Number(row.SCREW_LENGTH_MM)],[7,50]);
  }
  const schedule=records(files.find(file=>file.path==='rear-fastening.csv').content);
  assert.deepEqual(parseCsv(files.find(file=>file.path==='rear-fastening.csv').content)[0],REAR_FASTENING_COLUMNS);
  assert.deepEqual(schedule.map(row=>row.PART_ID).sort(),plan.rearFastenings.map(row=>row.partCode).sort());
  for(const item of plan.rearFastenings){
    const row=schedule.find(row=>row.SOURCE_PART_ID===item.partId);assert.equal(Number(row.QUANTITY),item.quantity);assert.equal(row.METHOD,item.method);assert.equal(row.CABINET_ID,item.cabinetId);
    assert.deepEqual(JSON.parse(row.CONTACTS_JSON),item.contacts);
    assert.deepEqual(JSON.parse(row.ISSUES_JSON),item.issues);assert.deepEqual(JSON.parse(row.OMITTED_CONTACTS_JSON),item.omittedContacts);
    assert.equal(row.REVIEW_STATUS,item.unsupported?'UNSUPPORTED':item.issues.length||item.omittedContacts.length?'PARTIAL':'COMPLETE');
    if(item.method==='nail'){assert.equal(row.FASTENER_TYPE,'rear-nail');assert.ok(!plan.holes.some(hole=>hole.partId===item.partId));assert.ok(!files.some(file=>file.path.startsWith(`maps/${item.partCode}`)));}
  }
  const nail=plan.rearFastenings.find(row=>row.method==='nail');assert.ok(nail?.quantity>0);
  const back=plan.rearFastenings.find(row=>row.method==='screw');assert.ok(back?.quantity>0);
  const manifest=records(files.find(file=>file.path==='document-info.csv').content)[0];assert.equal(Number(manifest.REAR_NAIL_COUNT),nail.quantity);assert.equal(Number(manifest.REAR_SCREW_COUNT),back.quantity);
  assert.deepEqual(project,before);
});

test('finished-edge measurement and two-confirmat mode keep rear bores at their actual raw positions and map mating axes',()=>{
  const project=mixedProject('tr');
  for(const [index,cabinet] of project.cabinets.entries()){cabinet.rotation=37;cabinet.y=212.125;cabinet.x=1000+index*1700;cabinet.z=1300;}
  const rawPlan=generateDrillingPlan(project),rawRows=records(generateDrillingCSV(project));
  const physical=hole=>({id:hole.id,pairId:hole.pairId,partId:hole.partId,partCode:hole.partCode,a:hole.a,b:hole.b,t:hole.thicknessCoordinate,entry:hole.worldEntry,direction:hole.direction,kind:hole.kind,diameter:hole.diameter,depth:hole.depth,fastenerType:hole.fastenerType});
  project.settings.drilling.measureFromFinishedEdge=true;
  const finishedPlan=generateDrillingPlan(project),finishedRows=records(generateDrillingCSV(project));
  assert.deepEqual(finishedPlan.holes.map(physical),rawPlan.holes.map(physical));
  assert.deepEqual(finishedPlan.rearFastenings,rawPlan.rearFastenings);
  const invariant=['PART_ID','SOURCE_PART_ID','OPERATION_ID','JOINT_ID','A_MM','B_MM','THICKNESS_COORD_MM','WORLD_ENTRY_X_MM','WORLD_ENTRY_Y_MM','WORLD_ENTRY_Z_MM','DIRECTION_X','DIRECTION_Y','DIRECTION_Z','DIAMETER_MM','DEPTH_MM','FASTENER_TYPE'];
  for(const row of finishedRows){const raw=rawRows.find(raw=>raw.OPERATION_ID===row.OPERATION_ID);for(const key of invariant)assert.equal(row[key],raw[key]);assert.equal(row.MEASUREMENT_BASIS,'FINISHED');}
  project.settings.drilling.screwsPerJoint=2;
  const twoPlan=generateDrillingPlan(project);assert.equal(twoPlan.valid,true,JSON.stringify(twoPlan.errors));
  for(const joint of twoPlan.joints){
    const holes=twoPlan.holes.filter(hole=>joint.pairIds.includes(hole.pairId));
    if(joint.fastenerType!=='rear-screw'){assert.equal(joint.pairIds.length,2);assert.equal(holes.length,6);}
    else assert.equal(holes.length,joint.pairIds.length*2);
    for(const pairId of joint.pairIds){
      const pair=holes.filter(hole=>hole.pairId===pairId),through=pair.find(hole=>hole.kind==='clearance'),pilot=pair.find(hole=>hole.kind==='pilot');
      for(const axis of ['x','y','z'])assert.ok(Math.abs(through.worldEntry[axis]+through.direction[axis]*through.depth-pilot.worldEntry[axis])<=.004,`${pairId}/${axis} mating bores share an axis`);
    }
  }
  const twoRows=records(generateDrillingCSV(project));assert.equal(twoRows.length,twoPlan.holes.length);
  for(const hole of twoPlan.holes){const row=twoRows.find(row=>row.OPERATION_ID===hole.id);assert.equal(row.PART_ID,hole.partCode);assert.equal(row.FASTENER_TYPE,hole.fastenerType);}
});

test('rear attachment schedule and mixed-spec map headers are localized and strictly scoped without renumbering',()=>{
  for(const language of ['tr','ru','en']){
    const project=mixedProject(language),full=buildDrillingFiles(project,{language}),fullRows=records(full.find(file=>file.path==='drilling.csv').content);
    for(const cabinet of project.cabinets){
      const result=checkDrillingExport(project,{cabinetId:cabinet.id}),files=buildDrillingFiles(project,{language,cabinetId:cabinet.id});assert.equal(result.valid,true);
      assert.ok(result.plan.rearFastenings.length);assert.ok(result.plan.rearFastenings.every(rear=>rear.cabinetId===cabinet.id));
      const rows=records(files.find(file=>file.path==='drilling.csv').content),rear=records(files.find(file=>file.path==='rear-fastening.csv').content),reference=files.find(file=>file.path==='drilling-reference.html').content;
      assert.deepEqual(rows,fullRows.filter(row=>result.plan.parts.some(part=>part.id===row.SOURCE_PART_ID)));
      assert.ok(rear.every(row=>row.CABINET_ID===cabinet.id));assert.ok(rear.every(row=>row.PART_ID===result.plan.parts.find(part=>part.id===row.SOURCE_PART_ID).partCode));
      assert.equal((reference.match(/data-rear-part-code=/g)??[]).length,rear.length);
      for(const row of rear){assert.ok(reference.includes(`data-rear-method="${row.METHOD}"`));assert.ok(reference.includes(`data-rear-quantity="${row.QUANTITY}"`));}
      const localized={tr:'Arkalık bağlantıları',ru:'Крепление задников',en:'Back-panel fastenings'}[language];assert.ok(reference.includes(localized));assert.match(files.find(file=>file.path==='README.txt').content,/rear-fastening\.csv/);
      if(language!=='ru')assert.doesNotMatch(files.find(file=>file.path==='README.txt').content,/[А-Яа-яЁё]/);
      for(const part of result.plan.parts){
        const holes=result.plan.holes.filter(hole=>hole.partId===part.id);if(!holes.length)continue;
        const maps=files.filter(file=>file.path.startsWith('maps/')&&file.content.includes(`data-part-id="${part.id}"`));assert.ok(maps.length);
        for(const map of maps){
          if(holes.some(hole=>hole.fastenerType==='rear-screw'))assert.ok(map.content.includes('4 × 30 mm'));
          if(holes.some(hole=>hole.fastenerType==='confirmat'))assert.ok(map.content.includes('7 × 50 mm'));
          const listed=[...map.content.matchAll(/data-table-operation-id="([^"]+)"[^>]*data-fastener-type="([^"]+)"/g)];
          for(const [,id,type] of listed)assert.equal(type,holes.find(hole=>hole.id===id).fastenerType);
        }
      }
    }
  }
});

test('merged local applied backs have one global production row and preserve actual screw or nail contacts in every language',()=>{
  for(const language of ['tr','ru','en'])for(const thin of [false,true]){
    const project=mixedProject(language),cabinet=project.cabinets[0];cabinet.includeBack=false;
    if(thin){cabinet.backThickness=3;cabinet.backMaterialId=project.cabinets[1].backMaterialId;}
    cabinet.layout={id:'local-root',kind:'split',axis:'vertical',sizes:[1,1],children:['local-left','local-right'].map(id=>({...createSection('open'),id,back:'solid'}))};
    const plan=generateDrillingPlan(project);assert.equal(plan.valid,true,JSON.stringify(plan.errors));
    const merged=plan.parts.filter(part=>part.cabinetId===cabinet.id&&part.role==='section-back');assert.equal(merged.length,1);
    const part=merged[0];assert.equal(part.rearMount,'lap');assert.deepEqual(part.sourceSectionIds,['local-left','local-right']);
    const code=`P${String(plan.parts.indexOf(part)+1).padStart(4,'0')}`,files=buildDrillingFiles(project,{language,cabinetId:cabinet.id});
    const rear=records(files.find(file=>file.path==='rear-fastening.csv').content),cuts=records(generateFactoryCSV(project,{language,cabinetId:cabinet.id}));
    assert.equal(rear.length,1);assert.equal(rear[0].PART_ID,code);assert.equal(rear[0].SOURCE_PART_ID,part.id);assert.equal(rear[0].METHOD,thin?'nail':'screw');
    const cut=cuts.find(row=>row.SOURCE_PART_ID===part.id);assert.equal(cut.PART_ID,code);assert.deepEqual([Number(cut.CUT_WIDTH_MM),Number(cut.CUT_LENGTH_MM)],[part.width,part.height]);
    const contacts=JSON.parse(rear[0].CONTACTS_JSON);assert.ok(contacts.length>=2);assert.ok(contacts.every(contact=>contact.attachment==='lap'));
    assert.equal(Number(rear[0].QUANTITY),contacts.reduce((sum,contact)=>sum+contact.quantity,0));
    assert.equal(rear[0].REVIEW_STATUS,'COMPLETE');assert.equal((files.find(file=>file.path==='drilling-reference.html').content.match(/data-rear-part-code=/g)??[]).length,1);
    if(language!=='ru')assert.doesNotMatch(rear[0].DESCRIPTION,/[А-Яа-яЁё]/);
    const rows=records(files.find(file=>file.path==='drilling.csv').content),backHoles=rows.filter(row=>row.SOURCE_PART_ID===part.id);
    if(thin){assert.equal(backHoles.length,0);assert.equal(rear[0].DIAMETER_MM,'');assert.equal(rear[0].LENGTH_MM,'');}
    else {assert.equal(backHoles.length,Number(rear[0].QUANTITY));assert.ok(backHoles.every(row=>row.FASTENER_TYPE==='rear-screw'&&row.PART_ID===code));}
  }
});

test('a real short applied back visibly preserves omitted-contact review, global receiving IDs and localized warnings',()=>{
  for(const language of ['tr','ru','en']){
    const project=createDefaultProject(language),cabinet=project.cabinets[0];Object.assign(cabinet,{includeBack:false,width:900,height:2300,depth:620,plinth:0,backMaterialId:'hdf-back',backThickness:8});
    cabinet.layout={id:'rows',kind:'split',axis:'horizontal',sizes:[1089,50,1089],children:[0,1,2].map(index=>({...createSection('open'),id:'r'+index,back:index===1?'solid':'none'}))};project.settings.drilling={enabled:true};
    const plan=generateDrillingPlan(project);assert.equal(plan.valid,true,JSON.stringify(plan.errors));const item=plan.rearFastenings[0];assert.equal(item.quantity,10);assert.equal(item.contacts.length,2);assert.equal(item.omittedContacts.length,2);
    const files=buildDrillingFiles(project,{language,cabinetId:cabinet.id}),rows=records(files.find(file=>file.path==='rear-fastening.csv').content),checks=records(files.find(file=>file.path==='checks.csv').content),html=files.find(file=>file.path==='drilling-reference.html').content;
    assert.equal(rows.length,1);assert.equal(rows[0].REVIEW_STATUS,'PARTIAL');assert.deepEqual(JSON.parse(rows[0].ISSUES_JSON),item.issues);assert.deepEqual(JSON.parse(rows[0].OMITTED_CONTACTS_JSON),item.omittedContacts);
    for(const omitted of item.omittedContacts){const warning=checks.find(row=>row.CODE===omitted.code&&row.RECEIVING_SOURCE_PART_ID===omitted.receivingPartId);assert.equal(warning.PART_ID,item.partCode);assert.equal(warning.SOURCE_PART_ID,item.partId);assert.equal(warning.CABINET_ID,cabinet.id);assert.equal(warning.RECEIVING_PART_ID,omitted.receivingPartCode);assert.ok(html.includes(omitted.receivingPartCode));}
    assert.match(html,/data-rear-review-status="PARTIAL"/);assert.ok(html.includes({ru:'Часть контактов пропущена',tr:'Bazı temaslar atlandı',en:'Some contacts omitted'}[language]));
    if(language!=='ru')assert.doesNotMatch(checks.map(row=>row.DESCRIPTION).join('\n'),/[А-Яа-яЁё]/);
    const actual=records(files.find(file=>file.path==='drilling.csv').content);assert.equal(actual.filter(row=>row.SOURCE_PART_ID===item.partId).length,10);for(const omitted of item.omittedContacts)assert.ok(!plan.joints.some(joint=>joint.fastenerType==='rear-screw'&&joint.partId===item.partId&&joint.receivingPartId===omitted.receivingPartId));
  }
});
