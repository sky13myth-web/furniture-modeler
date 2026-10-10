import {readFile,writeFile} from 'node:fs/promises';
import {generateParts,getCabinetRearReservation} from '../src/engine.js';
import {generateDrillingPlan} from '../src/drilling.js';
import {createDrawingSvg,generateDrawingHTML} from '../src/renderer.js';

const base=new URL('../examples/',import.meta.url);
const wrapper=JSON.parse(await readFile(new URL('wardrobe.atolye.json',base),'utf8'));
const project=wrapper.project,cabinet=project.cabinets[0];
project.name='Bölme arkalıkları · örnek';
project.cabinets=[cabinet];
Object.assign(cabinet,{id:'section-backs-cabinet',name:'Dolap · bölme arkalıkları',width:1400,height:1800,depth:620,x:400,z:20,plinth:100,includeBack:false,backMaterialId:'thin-back-3',backThickness:3,sidesToFloor:true,rearBraces:[],layout:{id:'back-columns',kind:'split',axis:'vertical',sizes:[1,1],children:[
  {id:'back-left',kind:'split',axis:'horizontal',sizes:[1,1],children:[
    {id:'back-left-top',kind:'section',front:'open',shelves:0,back:'solid'},
    {id:'back-left-bottom',kind:'section',front:'open',shelves:0,back:'solid'},
  ]},
  {id:'back-right',kind:'split',axis:'horizontal',sizes:[1,2],children:[
    {id:'back-right-top',kind:'section',front:'open',shelves:0,back:'solid'},
    {id:'back-right-bottom',kind:'section',front:'open',shelves:0,back:'none'},
  ]},
]}});
delete cabinet.partEdgeBanding;
project.settings.drilling={...project.settings.drilling,enabled:true};
const parts=generateParts(project),backs=parts.filter(part=>part.role==='section-back');
if(backs.length!==2||!backs.some(part=>part.sourceSectionIds.length===2)||getCabinetRearReservation(cabinet,project)!==3)throw Error('Example requires one merged back and one half-overlap joint.');
const drilling=generateDrillingPlan(project);
if(!drilling.valid)throw Error(JSON.stringify(drilling.errors));
await writeFile(new URL('section-backs.atolye.json',base),JSON.stringify(wrapper,null,2)+'\n');
for(const view of ['front','back','3d'])await writeFile(new URL(`section-backs-${view}.svg`,base),createDrawingSvg(project,view,{cabinetId:cabinet.id,language:'tr'}));
await writeFile(new URL('section-backs-drawings.html',base),generateDrawingHTML(project,{cabinetId:cabinet.id,language:'tr'}));
console.log(JSON.stringify({backs:backs.map(part=>({sourceSections:part.sourceSectionIds,width:part.finishedWidth,height:part.finishedHeight,position:part.position})),rearFastenings:drilling.rearFastenings.map(row=>({quantity:row.quantity,method:row.method})),valid:drilling.valid}));
