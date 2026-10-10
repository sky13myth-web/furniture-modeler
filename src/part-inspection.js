/** Read-only inspection in the same raw local frame as the drilling handoff. */
import { generateParts } from './engine.js';
import { getDrillingDrawingSet } from './drilling-view.js';
import { productionPartCode } from './production-id.js';
import { getDrillingMeasurementFrame } from './drilling.js';
import { classifyRearPanel, isRearPanel } from './rear-fastening.js';
import { printLanguage, printNumber, translatePrintText } from './print-i18n.js';

const EPS = .002;
const words = {
  ru: { left:'левого края', right:'правого края', rear:'заднего края', front:'переднего края', bottom:'нижнего края', top:'верхнего края', notch:'границы выреза', contour:'границы контура', lower:'нижняя пласть', upper:'верхняя пласть', leftFace:'левая пласть', rightFace:'правая пласть', rearFace:'задняя пласть', frontFace:'передняя пласть', from:'От', clearance:'Сквозное отверстие', pilot:'Торцевое отверстие', countersink:'Посадка головки', scope:'Автоматически рассчитаны неподвижные стыки корпуса и винтовое крепление задников. ДВП 3 мм крепится гвоздями без сверловки. Петли и направляющие требуют схем выбранной фурнитуры.', datum:'A/B и расстояния даны от заготовки без кромки. Кромку повторно не вычитать.', aRight:'A: слева → направо', aFront:'A: сзади → к фасаду', bFront:'B: сзади → к фасаду', bUp:'B: снизу → вверх', view:'На схеме A направлена вправо, B вниз. Вид со стороны', face:'Пласть', edge:'Торец, сверление' },
  tr: { left:'sol kenardan', right:'sağ kenardan', rear:'arka kenardan', front:'ön kenardan', bottom:'alt kenardan', top:'üst kenardan', notch:'oyuk sınırı', contour:'kontur sınırı', lower:'alt yüzey', upper:'üst yüzey', leftFace:'sol yüzey', rightFace:'sağ yüzey', rearFace:'arka yüzey', frontFace:'ön yüzey', from:'Mesafe:', clearance:'Geçiş deliği', pilot:'Kenar deliği', countersink:'Vida başı yuvası', scope:'Sabit gövde bağlantıları ve vidalı arkalık bağlantıları otomatik hesaplanır. 3 mm sert lif arkalık delmeden çivilenir. Menteşe ve raylar seçilen donanımın şemasını gerektirir.', datum:'A/B ve mesafeler bantsız ham parçaya göredir. Bandı tekrar düşmeyin.', aRight:'A: soldan → sağa', aFront:'A: arkadan → öne', bFront:'B: arkadan → öne', bUp:'B: alttan → üste', view:'Şemada A sağa, B aşağı yönelir. Bakış yüzeyi:', face:'Yüzey', edge:'Kenar, delme' },
  en: { left:'left edge', right:'right edge', rear:'rear edge', front:'front edge', bottom:'bottom edge', top:'top edge', notch:'notch boundary', contour:'contour boundary', lower:'underside', upper:'upper side', leftFace:'left face', rightFace:'right face', rearFace:'rear face', frontFace:'front face', from:'From', clearance:'Through hole', pilot:'Edge pilot', countersink:'Head seat', scope:'Fixed carcass joints and screwed back-panel connections are calculated automatically. 3 mm hardboard backs use nails without drilling. Hinges and slides require the selected hardware template.', datum:'A/B and distances refer to the unbanded cut blank. Do not deduct banding again.', aRight:'A: left → right', aFront:'A: rear → front', bFront:'B: rear → front', bUp:'B: bottom → top', view:'On the map A points right and B down. View from', face:'Face', edge:'Edge, drilling' }
};
const physicalEdges = {
  horizontal: { aMinus:'left', aPlus:'right', bMinus:'rear', bPlus:'front', tMinus:'lower', tPlus:'upper' },
  'vertical-depth': { aMinus:'rear', aPlus:'front', bMinus:'bottom', bPlus:'top', tMinus:'leftFace', tPlus:'rightFace' },
  'vertical-width': { aMinus:'left', aPlus:'right', bMinus:'bottom', bPlus:'top', tMinus:'rearFace', tPlus:'frontFace' }
};
const record = value => Math.round(value * 1e12) / 1e12;
const contourOf = part => part.drillingOutline ?? part.outline ?? [{x:0,y:0},{x:part.width,y:0},{x:part.width,y:part.height},{x:0,y:part.height}];
const contourBounds = outline => ({aMinus:Math.min(...outline.map(p=>p.x)),aPlus:Math.max(...outline.map(p=>p.x)),bMinus:Math.min(...outline.map(p=>p.y)),bPlus:Math.max(...outline.map(p=>p.y))});

/** Distances to actual contour exits along A/B, plus the nearest real segment.
 * A notch is never replaced with its bounding-rectangle datum. No exploded
 * transform or extra band deduction is applied to the recorded operation. */
export function getPartEdgeMeasurements(part, hole, {language='tr'}={}) {
  language=printLanguage(language,'tr');
  const w=words[language],edges=physicalEdges[part.orientation]??physicalEdges['vertical-width'];
  const outline=contourOf(part),bounds=contourBounds(outline);
  const area=outline.reduce((sum,p,i)=>{const q=outline[(i+1)%outline.length];return sum+p.x*q.y-q.x*p.y;},0),winding=area>=0?1:-1;
  const edgeDistances={};
  for(const [axis,pointCoordinate,otherCoordinate] of [['a',hole.a,hole.b],['b',hole.b,hole.a]]) {
    const value=axis==='a'?'x':'y',other=axis==='a'?'y':'x';
    for(const [suffix,direction] of [['Minus',-1],['Plus',1]]) {
      const key=axis+suffix,candidates=[];
      outline.forEach((p,index)=>{
        const q=outline[(index+1)%outline.length],delta=q[other]-p[other];
        if(Math.abs(delta)<1e-12)return;
        const normal=(axis==='a'?q.y-p.y:-(q.x-p.x))*winding;
        if(normal*direction<=0)return;
        const along=(otherCoordinate-p[other])/delta;
        if(along< -1e-9||along>1+1e-9)return;
        const coordinate=p[value]+(q[value]-p[value])*Math.max(0,Math.min(1,along));
        const distance=(coordinate-pointCoordinate)*direction;
        if(distance< -EPS)return;
        const notch=Math.abs(coordinate-bounds[key])>EPS,physicalEdge=edges[key];
        const label=notch?`${w.notch} (${w[physicalEdge]})`:`${w.from} ${w[physicalEdge]}`;
        candidates.push({axis:axis.toUpperCase(),side:direction<0?'minus':'plus',distance:record(Math.max(0,distance)),coordinate:record(coordinate),notch,physicalEdge,label,point:{a:record(axis==='a'?coordinate:otherCoordinate),b:record(axis==='b'?coordinate:otherCoordinate)},segmentIndex:index});
      });
      candidates.sort((a,b)=>a.distance-b.distance||a.segmentIndex-b.segmentIndex);
      edgeDistances[key]=candidates[0]??null;
    }
  }
  const nearer=(a,b)=>!a?b:!b?a:a.distance<=b.distance?a:b;
  const thicknessEdges={
    minus:{axis:'T',side:'minus',distance:record(Math.max(0,hole.thicknessCoordinate)),coordinate:0,notch:false,physicalEdge:edges.tMinus,label:`T=0 · ${w[edges.tMinus]}`},
    plus:{axis:'T',side:'plus',distance:record(Math.max(0,part.thickness-hole.thicknessCoordinate)),coordinate:part.thickness,notch:false,physicalEdge:edges.tPlus,label:`T=${printNumber(part.thickness,language)} · ${w[edges.tPlus]}`}
  };
  const nearest=[];
  outline.forEach((p,index)=>{
    const q=outline[(index+1)%outline.length],dx=q.x-p.x,dy=q.y-p.y,den=dx*dx+dy*dy;
    if(!den)return;
    const t=Math.max(0,Math.min(1,((hole.a-p.x)*dx+(hole.b-p.y)*dy)/den)),point={a:p.x+t*dx,b:p.y+t*dy};
    const outer=(Math.abs(p.x-bounds.aMinus)<EPS&&Math.abs(q.x-bounds.aMinus)<EPS)||(Math.abs(p.x-bounds.aPlus)<EPS&&Math.abs(q.x-bounds.aPlus)<EPS)||(Math.abs(p.y-bounds.bMinus)<EPS&&Math.abs(q.y-bounds.bMinus)<EPS)||(Math.abs(p.y-bounds.bPlus)<EPS&&Math.abs(q.y-bounds.bPlus)<EPS);
    nearest.push({distance:record(Math.hypot(point.a-hole.a,point.b-hole.b)),point:{a:record(point.a),b:record(point.b)},segmentIndex:index,notch:!outer,label:outer?w.contour:w.notch});
  });
  nearest.sort((a,b)=>a.distance-b.distance||a.segmentIndex-b.segmentIndex);
  return {nearestEdges:{a:nearer(edgeDistances.aMinus,edgeDistances.aPlus),b:nearer(edgeDistances.bMinus,edgeDistances.bPlus),t:nearer(thicknessEdges.minus,thicknessEdges.plus)},edgeDistances,thicknessEdges,nearestContour:nearest[0]??null};
}

function inspectionAxes(part,language) {
  const w=words[language],edges=physicalEdges[part.orientation]??physicalEdges['vertical-width'];
  const aLabel=part.orientation==='vertical-depth'?w.aFront:w.aRight,bLabel=part.orientation==='horizontal'?w.bFront:w.bUp;
  const thicknessLabel=`T=0: ${w[edges.tMinus]}; T=${printNumber(part.thickness,language)}: ${w[edges.tPlus]}`;
  const viewFace=part.orientation==='vertical-width'?0:part.thickness,viewDescription=`${w.view} T=${printNumber(viewFace,language)}.`;
  return {aLabel,bLabel,thicknessLabel,viewDescription,viewFace,a:aLabel,b:bLabel,thickness:thicknessLabel};
}

function entryFaceLabel(hole,part,language) {
  const w=words[language],edges=physicalEdges[part.orientation]??physicalEdges['vertical-width'];
  if(hole.face==='face-t-min')return `${w.face} T=0 · ${w[edges.tMinus]}`;
  if(hole.face==='face-t-max')return `${w.face} T=${printNumber(part.thickness,language)} · ${w[edges.tPlus]}`;
  return `${w.edge} ${{'edge-a-min':'A+','edge-a-max':'A−','edge-b-min':'B+','edge-b-max':'B−'}[hole.face]??hole.face}`;
}

/** Inspect one globally identified production part without changing the model. */
export function inspectCabinetPart(project,sourcePartId,{language=project.settings?.printLanguage??'tr'}={}) {
  language=printLanguage(language,'tr');
  const sourceParts=generateParts(project),index=sourceParts.findIndex(part=>part.id===sourcePartId);
  if(index<0)return null;
  const sourcePart=sourceParts[index],partCode=productionPartCode(index),cabinetId=sourcePart.cabinetId;
  const set=getDrillingDrawingSet(project,{cabinetId,language}),part=set.plan.parts.find(part=>part.id===sourcePartId)??sourcePart;
  const item=set.drawings.find(item=>item.part.id===sourcePartId),maps=(item?.pages??[]).map((page,index)=>({...page,page:index+1}));
  const markers=new Map();
  for(const [tag] of (maps[0]?.svg??'').matchAll(/<circle\b[^>]*data-operation-id="[^"]+"[^>]*>/g)){
    const operation=tag.match(/data-operation-id="([^"]+)"/)?.[1],marker=tag.match(/data-marker-id="([^"]+)"/)?.[1];if(operation&&marker)markers.set(operation,marker);
  }
  const measurement=getDrillingMeasurementFrame(part,set.plan.settings),displayPart={...part,width:measurement.width,height:measurement.height,drillingOutline:measurement.outline};
  const operations=set.plan.holes.filter(hole=>hole.partId===sourcePartId).map(hole=>{
    const coordinates={a:record(hole.a+measurement.offset.a),b:record(hole.b+measurement.offset.b)};
    const raw=getPartEdgeMeasurements(part,hole,{language}),display=getPartEdgeMeasurements(displayPart,{...hole,...coordinates},{language});
    return {...hole,measurement:coordinates,kindLabel:words[language][hole.kind]??hole.kind,faceLabel:entryFaceLabel(hole,part,language),markerId:markers.get(hole.id)??null,...display,rawNearestEdges:raw.nearestEdges};
  });
  const localized=issue=>({...issue,message:translatePrintText(issue.message,language)});
  const datum=measurement.basis==='finished'?{ru:'Расстояния от готового края с кромкой. Физические отверстия и машинные координаты RAW не изменены.',tr:'Mesafeler bantlı bitmiş kenara göredir. Delikler ve ham makine koordinatları değişmez.',en:'Distances use the finished, banded edge. Physical holes and RAW machine coordinates are unchanged.'}[language]:words[language].datum;
  const rearFastening=isRearPanel(sourcePart)?set.plan.rearFastenings.find(row=>row.partId===sourcePartId)??classifyRearPanel(sourcePart,project.materials):null;
  return {sourcePartId,partCode,cabinetId,language,sourcePart,part,measurement,name:translatePrintText(sourcePart.name,language),dimensions:{finished:{width:part.finishedWidth,height:part.finishedHeight,thickness:part.thickness},raw:{width:part.width,height:part.height,thickness:part.thickness}},axes:inspectionAxes(part,language),datumNote:datum,
    rearFastening,drilling:{enabled:set.plan.settings.enabled,valid:set.valid,measureFromFinishedEdge:set.plan.settings.measureFromFinishedEdge,errors:set.errors.map(localized),warnings:set.plan.warnings.map(localized),scope:words[language].scope},operations,maps};
}
