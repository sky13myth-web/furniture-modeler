import {createDefaultProject,createSection} from './engine.js';
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
 cabinet.rearBraces=[{id:'laundry-brace-upper',y:2000,height:100,materialId:cabinet.materialId},{id:'laundry-brace-lower',y:300,height:100,materialId:cabinet.materialId}];
 project.name=translateBuiltInName(project.name,language,'project');
 cabinet.name=translateBuiltInName(cabinet.name,language,'cabinet');
 const localize=node=>{if(node.name)node.name=translateBuiltInName(node.name,language,'section');if(node.appliance?.label)node.appliance.label=translateBuiltInName(node.appliance.label,language,'appliance');node.children?.forEach(localize);};
 localize(cabinet.layout);
 return project;
}
