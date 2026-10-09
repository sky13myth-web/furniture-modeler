import {mkdir,writeFile} from 'node:fs/promises';
import {createRodsExample} from '../src/examples.js';
import {checkImport} from '../src/project-io.js';
import {generateDrawingHTML,createDrawingSvg} from '../src/renderer.js';
import {generateRoomPlanHTML,createRoomPlanSvg} from '../src/room-print.js';

const project=createRodsExample('tr'),directory=new URL('../examples/',import.meta.url);
checkImport(project);
await mkdir(directory,{recursive:true});
const save=(name,content)=>writeFile(new URL(name,directory),content,'utf8');
await save('clothes-rods.atolye.json',JSON.stringify({application:'ATÖLYE',version:2,project},null,2));
await save('clothes-rods.html',generateDrawingHTML(project,{cabinetId:project.cabinets[0].id}));
await save('clothes-rods-interior.svg',createDrawingSvg(project,'interior',{cabinetId:project.cabinets[0].id,language:'tr'}));
await save('room-plan.html',generateRoomPlanHTML(project,{language:'tr'}));
await save('room-plan.svg',createRoomPlanSvg(project,{language:'tr'}));
console.log('Exported a wardrobe with clothes rods and a printable room plan.');
