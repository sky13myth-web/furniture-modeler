import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,createCabinet,generateParts} from '../src/engine.js';
import {ensureDefaultBackMaterial} from '../src/material-defaults.js';
import {checkImport} from '../src/project-io.js';
import {defaultName} from '../src/i18n.js';
import {getMaterialPrice} from '../src/pricing.js';

test('old projects acquire a 3 mm default for new cabinets while existing manually chosen 8 mm backs stay unchanged',()=>{
 const project=createDefaultProject('ru');
 project.materials=project.materials.filter(material=>material.id!=='thin-back-3');
 Object.assign(project.cabinets[0],{backMaterialId:'hdf-back',backThickness:8});
 const cabinets=structuredClone(project.cabinets),count=project.materials.length;
 const stock=ensureDefaultBackMaterial(project);
 assert.equal(project.materials.length,count+1);
 assert.equal(stock.thickness,3);
 assert.equal(stock.type,defaultName('thinBackType','ru'));
 assert.deepEqual(project.cabinets,cabinets);
 const cabinet=createCabinet('base',project,{name:'New test cabinet'});
 assert.equal(cabinet.backMaterialId,stock.id);
 assert.equal(cabinet.backThickness,3);
 project.cabinets=[cabinet];checkImport(project);
 assert.equal(generateParts(project).find(part=>part.name==='Задняя стенка').thickness,3);
 assert.equal(ensureDefaultBackMaterial(project),stock);
 assert.equal(project.materials.length,count+1);
});

test('a customized default ID remains intact and cannot prevent a valid new default stock from being added',()=>{
 const project=createDefaultProject('en'),custom=project.materials.find(material=>material.id==='thin-back-3');
 Object.assign(custom,{thickness:8,name:'My own special board',type:'My stock',pricePerSheet:100});
 const before=structuredClone(custom),stock=ensureDefaultBackMaterial(project);
 assert.equal(stock.id,'thin-back-3-default');
 assert.equal(stock.thickness,3);
 assert.deepEqual(custom,before);
 assert.equal(createCabinet('base',project).backMaterialId,stock.id);
});

test('an unrelated raw MDF or particleboard renamed to the default ID is preserved and is not the hardboard default',()=>{
 for(const type of ['MDF','Particleboard']){
  const project=createDefaultProject('en'),custom=project.materials.find(material=>material.id==='thin-back-3');
  Object.assign(custom,{name:'Custom 3 mm stock',type,pricePerSheet:500});
  const before=structuredClone(custom),stock=ensureDefaultBackMaterial(project);
  assert.equal(stock.id,'thin-back-3-default');
  assert.equal(stock.type,'Hardboard');
  assert.equal(createCabinet('base',project).backMaterialId,stock.id);
  assert.deepEqual(custom,before);
 }
});

test('manual hardboard quotes stay editable and raw MDF prices are never silently applied to hardboard',()=>{
 for(const language of ['ru','tr','en']){
  const project=createDefaultProject(language),stock=ensureDefaultBackMaterial(project);
  assert.equal(stock.type,defaultName('thinBackType',language));
  assert.equal(getMaterialPrice(stock).pricePerSheet,null);
  assert.equal(getMaterialPrice({...stock,pricePerSheet:0}).pricePerSheet,0);
 }
 assert.equal(getMaterialPrice({id:'raw-mdf',type:'MDF',thickness:3,sheetWidth:2100,sheetHeight:2800}).pricePerSheet,730);
});
