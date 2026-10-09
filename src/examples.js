import {createDefaultProject,createSection,getCabinetLayout} from './engine.js';
import {translateBuiltInName} from './print-i18n.js';

/** A floor opening between ordinary side cabinets, with a pull-out shelf. */
export function createLaundryExample(language='tr'){
 const project=createDefaultProject(language);project.name='Напольная ниша · пример';
 const cabinet=project.cabinets[0];Object.assign(cabinet,{name:'Ниша для техники и боковые шкафы',width:1600,height:2200,depth:650,x:200,z:10,includeBack:false,includeBottom:true,plinth:100});
 const leaf=(id,front,extra={})=>({...createSection(front),id,...extra});
 cabinet.layout={id:'laundry-layout',kind:'split',axis:'vertical',sizes:[300,928,300],children:[
  leaf('laundry-left','doors',{shelves:3,name:'Левый шкаф'}),
  {id:'laundry-center',kind:'split',axis:'horizontal',sizes:[520,140,1368],children:[
   leaf('laundry-upper','doors',{name:'Верхний шкаф'}),
   leaf('laundry-shelf','open',{pullOutShelf:true,name:'Выдвижная полка'}),
   leaf('laundry-floor','open',{floor:'open',back:'none',name:'Техника на полу',appliance:{type:'washer',label:'Стиральная машина',width:600,height:850,depth:600,useClearances:true,clearances:{side:25,top:25,rear:50}}})
  ]},
  leaf('laundry-right','doors',{shelves:3,name:'Правый шкаф'})
 ]};
 // Rear rails belong to the floor opening, between its real column sides.
 // Full-cabinet rails would pass through those floor-reaching dividers.
 const floorOpening=getCabinetLayout(cabinet,project).sections.find(section=>section.id==='laundry-floor');
 floorOpening.node.back='braces';
 floorOpening.node.rearBraces=[{id:'laundry-brace-upper',y:floorOpening.height-150,height:100,materialId:cabinet.materialId},{id:'laundry-brace-lower',y:300,height:100,materialId:cabinet.materialId}];
 cabinet.rearBraces=[];
 project.name=translateBuiltInName(project.name,language,'project');
 cabinet.name=translateBuiltInName(cabinet.name,language,'cabinet');
 const localize=node=>{if(node.name)node.name=translateBuiltInName(node.name,language,'section');if(node.appliance?.label)node.appliance.label=translateBuiltInName(node.appliance.label,language,'appliance');node.children?.forEach(localize);};
 localize(cabinet.layout);
 return project;
}

/** One pair of tall doors covers shelves and a separate drawer compartment. */
export function createInteriorExample(language='tr'){
 const project=createDefaultProject(language),cabinet=project.cabinets[0];
 project.name=({ru:'Внутреннее наполнение · пример',tr:'İç düzen · örnek',en:'Interior compartments · example'})[language]??'İç düzen · örnek';
 Object.assign(cabinet,{name:({ru:'Шкаф с общими дверями',tr:'Ortak kapaklı dolap',en:'Cabinet with shared doors'})[language]??'Ortak kapaklı dolap',width:900,height:2200,depth:620,x:450,z:10,plinth:100,includeBack:false});
 cabinet.layout={...createSection('doors'),id:'interior-outer',back:'braces',internalDrawerHingeGap:20,rearBraces:[{id:'interior-brace-bottom',y:0,height:100,materialId:cabinet.materialId},{id:'interior-brace-top',y:1964,height:100,materialId:cabinet.materialId}],interiorLayout:{id:'interior-layout',kind:'split',axis:'horizontal',sizes:[3,2],children:[{...createSection('open'),id:'interior-shelves',shelves:3},{...createSection('drawers'),id:'interior-drawers',drawers:2}]}};
 return project;
}

/** Two independently placed clothes rods behind full-height doors. */
export function createRodsExample(language='tr'){
 const project=createDefaultProject(language),cabinet=project.cabinets[0];
 project.name=({ru:'Штанги и план помещения · пример',tr:'Askı boruları ve oda planı · örnek',en:'Clothes rods and room plan · example'})[language]??'Askı boruları ve oda planı · örnek';
 cabinet.name=({ru:'Шкаф для одежды',tr:'Gardırop',en:'Wardrobe'})[language]??'Gardırop';
 Object.assign(cabinet,{width:900,frontMaterialId:cabinet.materialId,layout:{...createSection('doors'),id:'rods-section',rods:[{id:'rod-upper',y:1900,frontInset:300,diameter:25},{id:'rod-lower',y:900,frontInset:300,diameter:25}]}});
 return project;
}
