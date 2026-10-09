import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,createSection} from '../src/engine.js';
import {getHardwareSchedule,getProjectHardwareSchedule} from '../src/hardware.js';
import {getProjectCostEstimate} from '../src/pricing.js';
import {generateDrawingHTML,generateHardwareHTML,generateCostPrintHTML} from '../src/renderer.js';
import {translatePrintText,translateMaterialName,printNumber} from '../src/print-i18n.js';

function fixture(){
  const project=createDefaultProject('ru'),cabinet=project.cabinets[0];
  Object.assign(cabinet,{width:1800,height:2200,depth:700,name:'Workshop cabinet'});
  cabinet.layout={id:'outer-columns',kind:'split',axis:'vertical',sizes:[2,1,1],children:[
    {...createSection('doors'),id:'outer',doors:2,hingesPerDoor:4,openingMechanism:'push',internalDrawerCount:12,interiorLayout:{id:'interior-columns',kind:'split',axis:'vertical',sizes:[1,1],children:[
      {id:'inner-boxes',kind:'section',front:'drawers',drawers:2,openingMechanism:'handle'},
      {id:'inner-pullout',kind:'section',front:'open',pullOutShelf:true,openingMechanism:'push'},
    ]}},
    {...createSection('drawers'),id:'outer-boxes',drawers:2,openingMechanism:'push'},
    {...createSection('open'),id:'outer-pullout',pullOutShelf:true,openingMechanism:'handle'},
  ]};
  return {project,cabinet};
}

function hardwareRows(html,language){
  html=html.split('<section class="sheet schedule cost-sheet"')[0];
  const t=text=>translatePrintText(text,language);
  return [t('Ручки'),t('Комплекты направляющих'),t('Петли')].map(name=>{
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return [...html.matchAll(new RegExp(`<td>${escaped}<\\/td><td>([^<]+)<\\/td><td>([^<]+)<\\/td>`,'g'))].map(match=>[match[1],match[2]]);
  });
}

test('printed BOM counts mixed internal drawers, push fronts and pull-out shelves once in pairs',()=>{
  const {project,cabinet}=fixture(),before=structuredClone(project),schedule=getHardwareSchedule(cabinet,project);
  assert.deepEqual(schedule.totals,{handles:3,guideSets:6,hinges:8});
  for(const language of ['ru','tr','en']){
    const html=generateHardwareHTML(project,{cabinetId:cabinet.id,language});
    assert.deepEqual(hardwareRows(html,language),[
      [[printNumber(3,language),translatePrintText('шт.',language)]],
      [[printNumber(6,language),translatePrintText('Комплект (пара)',language)]],
      [[printNumber(8,language),translatePrintText('шт.',language)]],
    ]);
    assert.ok(html.includes(translatePrintText('Один комплект направляющих — пара для одного ящика или выдвижной полки.',language)));
    assert.doesNotMatch(html,/предварительный|preliminary|ön hesaptır/,'explicit per-door hinges do not pretend to be an automatic estimate');
    assert.ok(html.includes(translatePrintText('Единицы указаны в ведомости.',language)));
    assert.ok(!html.includes(translatePrintText('все размеры в миллиметрах',language)),'quantity-only BOM does not claim millimetre units');
    const drawings=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    assert.deepEqual(hardwareRows(drawings,language),hardwareRows(html,language));
  }
  assert.deepEqual(project,before);
});

test('selected and project BOMs preserve scope, custom names and planned lift-door counts',()=>{
  const {project,cabinet}=fixture(),copy=structuredClone(cabinet);
  Object.assign(copy,{id:'copy',name:'Мой шкаф <custom>',x:2100});
  copy.layout={...createSection('doors'),id:'lift',doors:1,doorOpenings:['up'],openingMechanism:'handle'};
  project.cabinets.push(copy);
  assert.deepEqual(getProjectHardwareSchedule(project).totals,{handles:4,guideSets:6,hinges:13});
  const html=generateHardwareHTML(project,{language:'en'});
  assert.deepEqual(hardwareRows(html,'en'),[
    [['3','pcs.'],['1','pcs.'],['4','pcs.']],
    [['6','Set (pair)'],['0','Set (pair)'],['6','Set (pair)']],
    [['8','pcs.'],['5','pcs.'],['13','pcs.']],
  ]);
  assert.match(html,/Мой шкаф &lt;custom&gt;/);
  assert.match(html,/Project total · Hardware/);
  assert.match(html,/Hinge quantities based on height are preliminary/);
  const selected=generateHardwareHTML(project,{cabinetId:cabinet.id,language:'en'});
  assert.doesNotMatch(selected,/Project total|Мой шкаф/);
  assert.deepEqual(hardwareRows(selected,'en')[0],[['3','pcs.']]);
});

test('hardware pagination retains every cabinet and keeps typography scoped to print sheets',()=>{
  const {project,cabinet}=fixture();
  project.cabinets=Array.from({length:18},(_,index)=>({...structuredClone(cabinet),id:`cab-${index}`,name:`Custom cabinet ${index+1} with a workshop description `.repeat(2).trim()}));
  const html=generateHardwareHTML(project,{language:'en'}),pages=[...html.matchAll(/<section class="sheet [\s\S]*?<\/section>/g)].map(match=>match[0]);
  assert.ok(pages.length>1);
  assert.equal((html.match(/data-schedule-kind="hardware"/g)||[]).length,18);
  assert.equal((html.match(/data-schedule-kind="hardware-total"/g)||[]).length,1);
  for(const page of pages){
    const height=Number(page.match(/data-estimated-content-height="(\d+)"/)[1]),limit=Number(page.match(/data-content-height-limit="(\d+)"/)[1]);
    assert.ok(height<=limit);
  }
  const style=html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.ok(style.split('}').filter(Boolean).every(rule=>rule.trim().startsWith('.hardware-schedule')),'export CSS leaves application tables and controls unchanged');
  assert.match(style,/font:10px\/1\.25/,'quantities retain 7.5 pt text');
});

function manualPrices(project){
  for(const material of project.materials)material.pricePerSheet=100;
  project.settings.pricing={handlePrice:10,guideSetPrice:40,hingePrice:5,edgeBandPricePerMeter:2};
}

test('drawing cost sheets use actual quantities and manual rates with one localized final total',()=>{
  const {project,cabinet}=fixture();manualPrices(project);
  const before=structuredClone(project),estimate=getProjectCostEstimate(project,{cabinetId:cabinet.id});
  assert.equal(estimate.complete,true);
  assert.deepEqual(estimate.hardware,{handles:3,guideSets:6,hinges:8});
  assert.equal(estimate.rows.find(row=>row.id==='guideSets').cost,240,'one pair is priced once, not as two separate rails');
  for(const language of ['ru','tr','en']){
    const html=generateCostPrintHTML(project,{cabinetId:cabinet.id,language});
    assert.equal((html.match(/data-schedule-kind="cost"/g)||[]).length,1);
    assert.equal((html.match(/<tfoot>/g)||[]).length,1);
    assert.ok(html.includes(translatePrintText('Итого',language)));
    assert.ok(html.includes(`${estimate.knownTotal.toLocaleString({ru:'ru-RU',tr:'tr-TR',en:'en-US'}[language],{maximumFractionDigits:2,minimumFractionDigits:2})} ₺`));
    assert.match(html,/<td>set \(çift\)<\/td>|<td>set \(pair\)<\/td>|<td>компл\. \(пара\)<\/td>/);
    assert.doesNotMatch(html,/<details>|href=/,'manual quotes do not acquire unrelated reference sources');
    assert.ok(html.includes(translatePrintText('Для фурнитуры указан расход по проекту; минимальные упаковки поставщика не учитываются. Исходная цена кромки приведена с НДС 20%.',language)));
    const drawing=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    assert.equal((drawing.match(/data-schedule-kind="cost"/g)||[]).length,1);
  }
  assert.deepEqual(project,before);
});

test('reference prices and editable hinge-planning notes stay visible and readable on the compact estimate',()=>{
  const project=createDefaultProject(),cabinet=project.cabinets[0];
  for(const language of ['ru','tr','en']){
    const html=generateCostPrintHTML(project,{cabinetId:cabinet.id,language});
    assert.equal((html.match(/data-schedule-kind="cost"/g)||[]).length,1);
    assert.doesNotMatch(html,/<details>|data-schedule-kind="price-sources"/,'the twelve short references need no separate page or collapsed print disclosure');
    assert.match(html,/<div class="cost-sources">/);
    assert.ok((html.match(/<a href="https:\/\//g)||[]).length>=10);
    assert.ok(html.includes(translatePrintText('Источники цен',language)));
    assert.ok(html.includes(translatePrintText('Количество петель по высоте — предварительный расчёт. Нагрузку и механизм подъёмной двери проверьте по выбранной фурнитуре.',language)));
    assert.ok(Number(html.match(/data-estimated-content-height="(\d+)"/)[1])<=725);
    if(language!=='ru')assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,''),/[А-Яа-яЁё]/);
  }
  for(const language of ['tr','en'])for(const label of ['Кромка по материалам','Кромка, м','Толщина мм','Толщина детали отличается от выбранного материала. Выберите материал нужной толщины; цена другого листа не применяется.']){
    assert.doesNotMatch(translatePrintText(label,language),/[А-Яа-яЁё]/);
  }
});

test('long purchase estimates keep all material rows in order and put the grand total only on the last page',()=>{
  const {project,cabinet}=fixture();manualPrices(project);
  const stock=project.materials.find(material=>material.id===cabinet.materialId);
  project.cabinets=Array.from({length:44},(_,index)=>{
    const id=`stock-${index}`,name=`Custom material ${String(index+1).padStart(2,'0')} with a deliberately long quotation description`;
    project.materials.push({...stock,id,name,pricePerSheet:100+index});
    return {...structuredClone(cabinet),id:`cab-${index}`,name:`Workshop ${index+1}`,materialId:id};
  });
  const estimate=getProjectCostEstimate(project),html=generateCostPrintHTML(project,{language:'en'});
  const pages=[...html.matchAll(/<section class="sheet schedule cost-sheet"[\s\S]*?<\/section>\s*(?:<small[^>]*>[\s\S]*?<\/small>)?<\/section>/g)].map(match=>match[0]);
  assert.ok(pages.length>=3);
  assert.equal(pages.reduce((sum,page)=>sum+Number(page.match(/data-cost-row-count="(\d+)"/)[1]),0),estimate.rows.length);
  assert.equal((html.match(/<tfoot>/g)||[]).length,1);
  assert.ok(pages.at(-1).includes('<tfoot>'));
  let offset=-1;
  for(const row of estimate.rows.filter(row=>row.kind==='material')){const next=html.indexOf(translateMaterialName(row.label,'en'),offset+1);assert.ok(next>offset);offset=next;}
  for(const page of pages){
    const height=Number(page.match(/data-estimated-content-height="(\d+)"/)[1]),limit=Number(page.match(/data-content-height-limit="(\d+)"/)[1]);
    assert.ok(height<=limit,`${height} exceeds ${limit}`);
  }
  assert.match(html,/font:10px\/1\.35/);
});
