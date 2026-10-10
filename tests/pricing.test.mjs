import test from 'node:test';
import assert from 'node:assert/strict';
import {createInteriorExample,createRodsExample} from '../src/examples.js';
import {getMaterialPrice,getProjectCostEstimate,generateCostHTML} from '../src/pricing.js';
import {validateProject} from '../src/engine.js';

function quotedProject(){
  const project=createInteriorExample('en');
  project.materials.forEach(material=>material.pricePerSheet=100);
  project.settings.pricing={handlePrice:10,guideSetPrice:50,hingePrice:5,edgeBandPricePerMeter:0};
  return project;
}

test('purchase estimate includes full sheets and hidden-drawer hardware without double counting',()=>{
  const project=quotedProject(),before=structuredClone(project),estimate=getProjectCostEstimate(project);
  assert.deepEqual(estimate.hardware,{handles:4,guideSets:2,hinges:10,rods:0,rodHolders:0,rodLengthMeters:0});
  assert.equal(estimate.complete,true);
  assert.equal(estimate.total,estimate.totalSheets*100+190);
  assert.ok(estimate.totalSheets>0);
  assert.equal(estimate.rows.filter(row=>row.kind==='material').reduce((sum,row)=>sum+row.quantity,0),estimate.totalSheets);
  assert.deepEqual(project,before,'calculating prices must not change geometry or saved rates');
});

test('rod lengths and two holders each are quoted separately without MDF sheet or hardware duplication',()=>{
  const project=createRodsExample('tr');
  project.materials.forEach(material=>material.pricePerSheet=0);
  project.settings.pricing={handlePrice:0,guideSetPrice:0,hingePrice:0,edgeBandPricePerMeter:0,rearNailPrice:0};
  const before=structuredClone(project),missing=getProjectCostEstimate(project);
  assert.equal(missing.hardware.rods,2);
  assert.equal(missing.hardware.rodHolders,4);
  assert.equal(missing.hardware.rodLengthMeters,1.72);
  assert.equal(missing.complete,false);
  assert.deepEqual(missing.missingPrices.map(row=>row.id),['rods','rodHolders']);
  assert.deepEqual(project,before);
  Object.assign(project.settings.pricing,{rodPricePerMeter:100,rodHolderPrice:20});
  const quoted=getProjectCostEstimate(project);
  assert.equal(quoted.complete,true);
  assert.equal(quoted.total,252);
  assert.equal(quoted.rows.find(row=>row.id==='rods').unit,'meter');
  assert.equal(quoted.rows.find(row=>row.id==='rodHolders').quantity,4);
  assert.ok(!quoted.rows.some(row=>row.kind==='material'&&row.label.includes('rod')));
  const html=generateCostHTML(project,{language:'tr'});
  assert.ok(html.includes('Askı'));
  assert.ok(!/[А-Яа-яЁё]/u.test(html));
});

test('manual zero price means existing inventory, while an unknown material remains unpriced',()=>{
  const material={id:'custom',type:'Custom',name:'Custom stock',thickness:19,sheetWidth:2100,sheetHeight:2800};
  assert.equal(getMaterialPrice(material).pricePerSheet,null);
  assert.deepEqual(getMaterialPrice({...material,pricePerSheet:0}),{pricePerSheet:0,manual:true,reference:null});
  const project=quotedProject();project.materials.forEach(m=>m.pricePerSheet=0);
  project.settings.pricing={handlePrice:0,guideSetPrice:0,hingePrice:0,edgeBandPricePerMeter:0};
  assert.equal(getProjectCostEstimate(project).total,0);
});

test('missing prices and unplaced parts produce a partial estimate, not a fabricated full total',()=>{
  const project=quotedProject();
  const stock=project.materials.find(m=>m.id===project.cabinets[0].materialId);
  stock.type='Custom';delete stock.pricePerSheet;
  const incomplete=getProjectCostEstimate(project);
  assert.equal(incomplete.total,null);assert.equal(incomplete.complete,false);
  assert.ok(incomplete.missingPrices.some(row=>row.id===stock.id));
  stock.pricePerSheet=100;stock.sheetWidth=100;stock.sheetHeight=100;
  const unplaced=getProjectCostEstimate(project);
  assert.ok(unplaced.unplacedCount>0);assert.equal(unplaced.total,null);
});

test('cabinet-scoped estimate excludes other cabinets and unsafe names are escaped in documents',()=>{
  const project=quotedProject(),first=project.cabinets[0];
  const second=structuredClone(first);second.id='second';second.name='<script>bad</script>';project.cabinets.push(second);
  const one=getProjectCostEstimate(project,{cabinetId:first.id}),both=getProjectCostEstimate(project);
  assert.equal(both.hardware.handles,one.hardware.handles*2);
  assert.equal(both.hardware.guideSets,one.hardware.guideSets*2);
  assert.equal(both.hardware.hinges,one.hardware.hinges*2);
  const html=generateCostHTML(project,{cabinetId:second.id,language:'en'});
  assert.ok(!html.includes('<script>bad</script>'));
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes('TRY'));
});

test('different actual rear gauges never share the selected 3 mm stock price, even with a manual quote',()=>{
  const project=quotedProject(),first=project.cabinets[0];
  Object.assign(first,{includeBack:true,backMaterialId:'thin-back-3',backThickness:8});
  const second=structuredClone(first);Object.assign(second,{id:'three-mm-back',name:'Actual 3 mm back',x:2000,backThickness:3});
  project.cabinets.push(second);
  const stock=project.materials.find(material=>material.id==='thin-back-3');
  assert.equal(stock.thickness,3);
  assert.ok(validateProject(project).some(item=>item.level==='warning'&&item.cabinetId===first.id&&item.message.includes('толщина задней стенки отличается')));
  for(const manualQuote of [undefined,1234.56]){
    if(manualQuote===undefined)delete stock.pricePerSheet;else stock.pricePerSheet=manualQuote;
    const before=structuredClone(project),estimate=getProjectCostEstimate(project);
    const rearRows=estimate.rows.filter(row=>row.kind==='material'&&row.id===stock.id).sort((a,b)=>a.thickness-b.thickness);
    assert.deepEqual(rearRows.map(row=>[row.thickness,row.quantity]),[[3,1],[8,1]]);
    assert.equal(rearRows[0].unitPrice,manualQuote??null);
    assert.equal(rearRows[0].cost,manualQuote??null);
    assert.equal(rearRows[1].unitPrice,null);
    assert.equal(rearRows[1].cost,null);
    assert.equal(estimate.complete,false);assert.equal(estimate.total,null);
    assert.ok(estimate.missingPrices.some(row=>row.id===stock.id&&row.thickness===8));
    assert.equal(estimate.missingPrices.some(row=>row.id===stock.id&&row.thickness===3),manualQuote===undefined);
    assert.equal(estimate.rows.filter(row=>row.kind==='material').reduce((sum,row)=>sum+row.quantity,0),estimate.totalSheets);
    assert.deepEqual(project,before);
  }
});
