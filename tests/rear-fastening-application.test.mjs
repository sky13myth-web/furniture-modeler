import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,createSection,generateParts} from '../src/engine.js';
import {getProjectHardwareSchedule} from '../src/hardware.js';
import {getProjectCostEstimate} from '../src/pricing.js';
import {getPricingPreferences,applyPricingPreferences} from '../src/pricing-preferences.js';
import {checkImport} from '../src/project-io.js';
import {inspectCabinetPart} from '../src/part-inspection.js';
import {generateHardwareHTML} from '../src/renderer.js';

const fixture=()=>{
  const p=createDefaultProject('tr'),c=p.cabinets[0];
  Object.assign(c,{width:900,height:2200,depth:620,plinth:100,sidesToFloor:true,includeBack:true,layout:{...createSection('open'),id:'open',shelves:0}});
  p.materials.forEach(m=>m.pricePerSheet=0);
  p.settings.pricing={handlePrice:0,guideSetPrice:0,hingePrice:0,edgeBandPricePerMeter:0};
  return p;
};

test('a nailed 3 mm back has a real quantity and remains unpriced until a manual nail quote is given',()=>{
  const p=fixture(),before=structuredClone(p),schedule=getProjectHardwareSchedule(p),unpriced=getProjectCostEstimate(p);
  assert.equal(schedule.rearTotals.nails,32);
  assert.equal(schedule.rearTotals.screws,0);
  assert.equal(schedule.rows.filter(r=>r.kind==='rear-nail').length,1);
  assert.equal(schedule.rows.find(r=>r.kind==='rear-nail').quantity,32);
  assert.deepEqual(unpriced.missingPrices.map(r=>r.id),['rearNails']);
  assert.equal(unpriced.total,null);
  assert.deepEqual(p,before);
  p.settings.pricing.rearNailPrice=.5;
  const quoted=getProjectCostEstimate(p);
  assert.equal(quoted.complete,true);assert.equal(quoted.total,16);
  const back=generateParts(p).find(part=>part.role==='back'),info=inspectCabinetPart(p,back.id,{language:'tr'});
  assert.equal(info.rearFastening.method,'nail');assert.equal(info.operations.length,0);
  const html=generateHardwareHTML(p,{language:'tr'});
  assert.match(html,/Arkalık çivileri/);assert.doesNotMatch(html,/[А-Яа-яЁё]/u);
});

test('thick MDF screws use the same physical station quantity in hardware, estimate and part inspection',()=>{
  const p=fixture(),c=p.cabinets[0];
  c.backMaterialId=c.materialId;c.backThickness=18;
  p.settings.drilling={enabled:true,rearScrewDiameter:4,rearScrewLength:30,rearPilotDiameter:2.5,rearClearanceDiameter:4.5,rearEndOffset:50,rearMaxSpacing:200};
  p.settings.pricing.rearScrewPrice=2;
  const before=structuredClone(p),hardware=getProjectHardwareSchedule(p),estimate=getProjectCostEstimate(p),back=generateParts(p).find(part=>part.role==='back');
  const info=inspectCabinetPart(p,back.id,{language:'tr'});
  assert.equal(hardware.rearTotals.nails,0);assert.equal(hardware.rearTotals.screws,32);
  assert.equal(estimate.rows.find(row=>row.id==='rearScrews').quantity,32);
  assert.equal(estimate.rows.find(row=>row.id==='rearScrews').cost,64);
  assert.equal(new Set(info.operations.map(h=>h.pairId)).size,32);
  assert.equal(info.operations.every(h=>h.fastenerType==='rear-screw'&&h.screwDiameter===4&&h.screwLength===30),true);
  assert.deepEqual(p,before);
});

test('rear screw setup and manual unit prices survive project files and new-project preferences without accepting invalid input',()=>{
  const p=fixture();p.settings.drilling={enabled:true,rearScrewDiameter:4,rearScrewLength:35,rearClearanceDiameter:4.5,rearPilotDiameter:2.5,rearPilotExtraDepth:2,rearEndOffset:60,rearMaxSpacing:250};
  p.settings.pricing={rearScrewPrice:1.25,rearNailPrice:0};
  const restored=checkImport(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored.settings.drilling,p.settings.drilling);
  const preferences=getPricingPreferences(p),next=applyPricingPreferences(fixture(),preferences);
  assert.equal(next.settings.pricing.rearScrewPrice,1.25);assert.equal(next.settings.pricing.rearNailPrice,0);
  for(const [key,value]of[['rearScrewLength',-30],['rearPilotExtraDepth',21],['rearMaxSpacing',Infinity]]){
    const bad=structuredClone(p);bad.settings.drilling[key]=value;
    assert.throws(()=>checkImport(JSON.parse(JSON.stringify(bad))),/Сверловка/);
  }
  const bad=structuredClone(p);bad.settings.pricing.rearNailPrice=-1;
  assert.throws(()=>checkImport(JSON.parse(JSON.stringify(bad))),/Цена/);
});
