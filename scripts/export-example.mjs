import {mkdir,writeFile} from 'node:fs/promises';
import {createDefaultProject,generateParts,optimizeCutting} from '../src/engine.js';
import {checkImport} from '../src/project-io.js';
import {createDrawingSvg,generateDrawingHTML} from '../src/renderer.js';
import {createLaundryExample} from '../src/examples.js';

const project=createDefaultProject();
checkImport(project);
const directory=new URL('../examples/',import.meta.url);
await mkdir(directory,{recursive:true});
const save=(name,content)=>writeFile(new URL(name,directory),content,'utf8');
const cabinetId=project.cabinets[0].id;
const parts=generateParts(project);
await save('wardrobe.atolye.json',JSON.stringify({application:'ATÖLYE',version:2,project},null,2));
for(const view of ['front','interior','back','left','right','top'])
  await save(`wardrobe-${view}.svg`,createDrawingSvg(project,view,{cabinetId}));
await save('wardrobe-drawings.html',generateDrawingHTML(project,{cabinetId}));
await save('wardrobe-cutting.json',JSON.stringify(optimizeCutting(parts,project.materials,project.settings),null,2));
console.log(`Example exported: ${parts.length} parts, 6 views, print document and cutting plan.`);
const laundry=createLaundryExample();
checkImport(laundry);
await save('laundry.atolye.json',JSON.stringify({application:'ATÖLYE',version:2,project:laundry},null,2));
for(const view of ['front','interior','back','left','right','top'])
  await save(`laundry-${view}.svg`,createDrawingSvg(laundry,view,{cabinetId:laundry.cabinets[0].id}));
await save('laundry-drawings.html',generateDrawingHTML(laundry,{cabinetId:laundry.cabinets[0].id}));
await save('laundry-cutting.json',JSON.stringify(optimizeCutting(generateParts(laundry),laundry.materials,laundry.settings),null,2));

const internal=createDefaultProject();
internal.cabinets[0].name='Dolap 1';
Object.assign(internal.cabinets[0].layout.children[0],{
  doorOpenings:['up','right'],internalDrawerCount:2,internalDrawerHingeGap:20,openingMechanism:'handle'
});
checkImport(internal);
await save('internal-drawers.atolye.json',JSON.stringify({application:'ATÖLYE',version:2,project:internal},null,2));
await save('internal-drawers.html',generateDrawingHTML(internal,{cabinetId:internal.cabinets[0].id}));
for(const view of ['front','interior'])
  await save(`internal-drawers-${view}.svg`,createDrawingSvg(internal,view,{cabinetId:internal.cabinets[0].id}));
