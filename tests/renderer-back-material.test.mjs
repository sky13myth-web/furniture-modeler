import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,generateParts,getInternalDrawerLayout} from '../src/engine.js';
import {generateDrawingHTML,createPartSvg} from '../src/renderer.js';
import {translateMaterialName,translatePrintText} from '../src/print-i18n.js';
import {localizeMaterialPreset} from '../src/i18n.js';

const hardboard={ru:'ДВП · задник · 3 мм',tr:'Sert lif levha · arkalık · 3 mm',en:'Hardboard · back panel · 3 mm'};
const generic={ru:'Тонкий задник · 3 мм',tr:'Arkalık levhası · 3 mm',en:'Thin back panel · 3 mm'};

test('new hardboard back prints at the actual 3 mm while the separate 8 mm stock remains MDFLAM',()=>{
  const project=createDefaultProject('tr'),cabinet=project.cabinets[0],backStock=project.materials.find(material=>material.id===cabinet.backMaterialId),eight=project.materials.find(material=>material.id==='hdf-back');
  assert.equal(backStock.name,hardboard.tr);assert.equal(backStock.type.toLocaleLowerCase('tr'),'sert lif levha');assert.equal(backStock.thickness,3);assert.equal(cabinet.backThickness,3);
  assert.equal(eight.thickness,8);assert.equal(eight.type,'MDFLAM');
  const back=generateParts(project).find(part=>part.component==='back'||part.role==='back');assert.equal(back.thickness,3);assert.equal(back.materialId,backStock.id);
  const before=structuredClone(project);
  for(const language of ['ru','tr','en']){
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language}),svg=createPartSvg(back,project,{language});
    assert.ok(html.includes(hardboard[language]));assert.ok(svg.includes(hardboard[language]));
    assert.ok(html.includes(localizeMaterialPreset(eight,language).name),'drawer bottoms keep their independent factory MDFLAM8 identity');
    assert.ok(!svg.includes(`Yıldız ${hardboard[language]}`),'the generic hardboard has no manufacturer attribution');
    assert.doesNotMatch(svg,/Arkalık levhası|Thin back panel|Тонкий задник/);
  }
  assert.deepEqual(project,before);
});

test('historical generic back aliases retain their generic identity and custom fibreboard names stay untouched',()=>{
  for(const language of ['ru','tr','en']){
    for(const name of Object.values(hardboard))assert.equal(translateMaterialName(name,language),hardboard[language]);
    for(const name of Object.values(generic))assert.equal(translateMaterialName(name,language),generic[language]);
    assert.equal(translateMaterialName('ДВП · мой задник · 3 мм',language),'ДВП · мой задник · 3 мм');
    assert.equal(translateMaterialName('Thin back panel · my workshop · 3 mm',language),'Thin back panel · my workshop · 3 mm');
  }
  assert.equal(translatePrintText('ДВП','tr'),'Sert lif levha');assert.equal(translatePrintText('ДВП','en'),'Hardboard');
  assert.equal(translatePrintText('Тонкая древесноволокнистая панель','en'),'Fibreboard');
});

test('print schedules do not describe retained interior contents as behind doors after the outer fronts are removed',()=>{
  const project=createDefaultProject('ru'),cabinet=project.cabinets[0];
  cabinet.layout={id:'outer',kind:'section',front:'open',shelves:0,interiorLayout:{id:'inner',kind:'section',front:'drawers',drawers:2}};
  assert.equal(getInternalDrawerLayout(cabinet,project).length,2);
  for(const language of ['ru','tr','en']){
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    assert.ok(html.includes(translatePrintText('Внутреннее наполнение',language)));
    assert.ok(html.includes(translatePrintText('I обозначает внутренние фасады ящиков; F — наружные фасады. Размеры коробов приведены в деталировке.',language)));
    assert.ok(!html.includes(translatePrintText('Наполнение за общими дверями',language)));
    assert.ok(!html.includes(translatePrintText('Внутренние фасады и короба находятся за дверями. I соответствует внутреннему чертежу; F обозначает только наружные фасады.',language)));
    assert.match(html,/>I1<\/td>/);assert.match(html,/>I2<\/td>/);
  }
});
