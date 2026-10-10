/** Compact interactive diagram in the inspection's selected measurement frame. */
import { printLanguage, printNumber } from './print-i18n.js';

const vocabulary = {
  ru: { raw:'Заготовка', left:'слева', right:'справа', rear:'сзади', front:'спереди', bottom:'снизу', top:'сверху', lower:'низ', upper:'верх', leftFace:'слева', rightFace:'справа', rearFace:'сзади', frontFace:'спереди', notch:'вырез', view:'Вид', off:'Сверловка выключена', invalid:'Сверловка недоступна', none:'Нет отверстий', depth:'гл.', clearance:'сквозное', pilot:'торец', countersink:'головка', setup:'* настроить', section:'Сечение' },
  tr: { raw:'Ham', left:'sol', right:'sağ', rear:'arka', front:'ön', bottom:'alt', top:'üst', lower:'alt', upper:'üst', leftFace:'sol', rightFace:'sağ', rearFace:'arka', frontFace:'ön', notch:'oyuk', view:'Bakış', off:'Delme kapalı', invalid:'Delme uygun değil', none:'Delik yok', depth:'der.', clearance:'geçiş', pilot:'kenar', countersink:'baş', setup:'* ayarla', section:'Kesit' },
  en: { raw:'Blank', left:'left', right:'right', rear:'rear', front:'front', bottom:'bottom', top:'top', lower:'lower', upper:'upper', leftFace:'left', rightFace:'right', rearFace:'rear', frontFace:'front', notch:'notch', view:'View', off:'Drilling off', invalid:'Drilling unavailable', none:'No holes', depth:'depth', clearance:'through', pilot:'edge', countersink:'head', setup:'* set up', section:'Section' }
};
const physicalEdges = {
  horizontal: ['left','right','rear','front','lower','upper'],
  'vertical-depth': ['rear','front','bottom','top','leftFace','rightFace'],
  'vertical-width': ['left','right','bottom','top','rearFace','frontFace']
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));
const n = value => String(Math.round(value * 1e6) / 1e6);
const outlineOf = part => part.drillingOutline ?? part.outline ?? [{x:0,y:0},{x:part.width,y:0},{x:part.width,y:part.height},{x:0,y:part.height}];
const text = (x,y,value,attributes='') => `<text x="${n(x)}" y="${n(y)}" ${attributes}>${escape(value)}</text>`;
const line = (x1,y1,x2,y2,attributes='') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${attributes}/>`;
const rectOverlap = (a,b) => a.x < b.x+b.width+4 && a.x+a.width+4 > b.x && a.y < b.y+b.height+4 && a.y+a.height+4 > b.y;
const viewFaceOf = part => part.orientation==='vertical-depth'?0:part.thickness;
const verticalPart = part => part.orientation!=='horizontal';
const edgeCaption = (x,y,value,physical,attributes='') => text(x,y,value,`data-inspection-physical-edge="${escape(physical)}" ${attributes}`);
const displayPrepared=Symbol('measurement display frame');
function displayInspection(info) {
  if(info[displayPrepared])return info;
  const frame=info.measurement;
  return {...info,[displayPrepared]:true,part:{...info.part,_rawWidth:info.part.width,_rawHeight:info.part.height,
    ...(frame?{width:frame.width,height:frame.height,drillingOutline:frame.outline}:{})},
    operations:(info.operations??[]).map(hole=>({...hole,_rawA:hole.a,_rawB:hole.b,...(hole.measurement??{})}))};
}
const rawA=hole=>hole._rawA??hole.a,rawB=hole=>hole._rawB??hole.b;
const basisOf=info=>info.measurement?.basis??'raw';
const basisTitle=(info,w)=>basisOf(info)==='finished'?{ru:'Готовая деталь',tr:'Bitmiş',en:'Finished'}[printLanguage(info.language,'tr')]:w.raw;
function edgeEntrySymbol(group,x,y,naturalVertical,reserve) {
  const hole=group.operations.find(h=>h.kind==='pilot'&&h.localDirection);
  if(!hole)return '';
  const da=hole.localDirection.a,db=hole.localDirection.b*(naturalVertical?-1:1);
  if(Math.hypot(da,db)<.5)return '';
  const cx=x(group.a),cy=y(group.b),x1=cx,y1=cy,x2=cx+da*32,y2=cy+db*32;
  if(reserve)reserve.push({x:Math.min(x1,x2)-5,y:Math.min(y1,y2)-5,width:Math.abs(x2-x1)+10,height:Math.abs(y2-y1)+10});
  return `<g data-inspection-edge-entry="${escape(group.id)}" data-edge-operation-id="${escape(hole.id)}" data-direction-a="${escape(hole.localDirection.a)}" data-direction-b="${escape(hole.localDirection.b)}">${line(x1,y1,x2,y2,'class="edge-entry" marker-end="url(#inspection-bore-arrow)"')}${line(cx-db*6,cy+da*6,cx+db*6,cy-da*6,'class="edge-entry"')}</g>`;
}

function referenceMetadata(group,hole,edge,axis) {
  const reference=axis==='T'?`data-reference-t="${escape(edge.coordinate)}"`:`data-reference-a="${escape(edge.point.a)}" data-reference-b="${escape(edge.point.b)}"`;
  return `<g data-inspection-reference-marker="${escape(group.id)}" data-hole-a="${escape(rawA(hole))}" data-hole-b="${escape(rawB(hole))}" data-hole-t="${escape(hole.thicknessCoordinate)}" data-measurement-a="${escape(hole.a)}" data-measurement-b="${escape(hole.b)}" ${reference}/>`;
}

/** Crowded dimensions use datum spines and exact ordinate ticks. Opposite
 * datums may share a lane only when their measured spans and labels are disjoint. */
function ordinateLayout(dimensions,axis,scale,number) {
  if(dimensions.length<10)return null;
  const lanes=[],placements=new Map(),labelWidth=Math.max(90,...dimensions.map(d=>number(d.edge.distance).length*14+16));
  for(const dimension of [...dimensions].sort((a,b)=>a.target-b.target)){
    const {target,edge}=dimension,key=JSON.stringify([edge.coordinate,edge.side,edge.physicalEdge,edge.notch,edge.segmentIndex??null]);
    const position=target*scale,labelHalf=axis==='B'?18:(number(edge.distance).length*14+16)/2;
    const label={low:position-labelHalf-4,high:position+labelHalf+4},extent={low:Math.min(target,edge.coordinate)*scale,high:Math.max(target,edge.coordinate)*scale};
    let index=lanes.findIndex(lane=>!lane.labels.some(other=>label.low<other.high&&label.high>other.low)&&[...lane.spines].every(([datum,span])=>datum===key||extent.low>=span.high+8||extent.high<=span.low-8));
    if(index<0){index=lanes.length;lanes.push({labels:[],spines:new Map()});}
    const lane=lanes[index],span=lane.spines.get(key);
    lane.labels.push(label);lane.spines.set(key,span?{...span,low:Math.min(span.low,extent.low),high:Math.max(span.high,extent.high),members:[...span.members,dimension]}:{...extent,coordinate:edge.coordinate,members:[dimension]});
    placements.set(dimension,index);
  }
  return {lanes,placements,pitch:axis==='B'?labelWidth+28:52};
}

function createAllPartInspectionSvg(info,{markerId}={}) {
  // Reuse validation and visual vocabulary of the single-marker view.
  const single=createPartInspectionSvg(info,{markerId}),part=info.part,outline=outlineOf(part),language=printLanguage(info.language,'tr'),w=vocabulary[language],number=value=>printNumber(value,language);
  const operations=info.drilling?.enabled&&info.drilling.valid?(info.operations??[]):[],groups=new Map();
  for(const hole of operations){
    const id=hole.markerId??`G${String(groups.size+1).padStart(2,'0')}`;
    if(!groups.has(id))groups.set(id,{id,a:hole.a,b:hole.b,operations:[]});
    groups.get(id).operations.push(hole);
  }
  const selected=groups.get(markerId)??groups.values().next().value,measurements={A:new Map(),B:new Map(),T:new Map()};
  for(const group of groups.values())for(const axis of ['A','B','T']){
    const hole=axis==='T'?group.operations.find(h=>h.kind==='pilot'):group.operations[0];
    if(!hole)continue;
    const edge=hole.nearestEdges?.[axis.toLowerCase()];if(!edge)continue;
    const target=axis==='A'?hole.a:axis==='B'?hole.b:hole.thicknessCoordinate;
    const key=JSON.stringify([axis,target,edge.coordinate,edge.side,edge.physicalEdge,edge.notch,edge.segmentIndex??null]);
    if(!measurements[axis].has(key))measurements[axis].set(key,{axis,target,edge,members:[]});
    measurements[axis].get(key).members.push({group,hole});
  }
  const dimsA=[...measurements.A.values()],dimsB=[...measurements.B.values()],dimsT=[...measurements.T.values()];
  const minA=Math.min(...outline.map(p=>p.x)),maxA=Math.max(...outline.map(p=>p.x)),minB=Math.min(...outline.map(p=>p.y)),maxB=Math.max(...outline.map(p=>p.y));
  const naturalVertical=verticalPart(part),spanA=maxA-minA,spanB=maxB-minB,plotHeight=dimsB.length>=10?650:470,scale=Math.min(450/spanA,plotHeight/spanB),width=spanA*scale,height=spanB*scale;
  const ordinateA=ordinateLayout(dimsA,'A',scale,number),ordinateB=ordinateLayout(dimsB,'B',scale,number);
  const bLaneWidth=ordinateB?ordinateB.lanes.length*ordinateB.pitch:dimsB.length*44;
  const frameLeft=110+bLaneWidth,left=frameLeft+(450-width)/2,top=125+(plotHeight-height)/2,right=left+width,bottom=top+height,profileLeft=frameLeft+450+95,canvasWidth=Math.max(900,profileLeft+245);
  const x=a=>left+(a-minA)*scale,y=b=>top+(naturalVertical?maxB-b:b-minB)*scale;
  const [aMinus,aPlus,bMinus,bPlus]=physicalEdges[part.orientation]??physicalEdges['vertical-width'],topEdge=naturalVertical?bPlus:bMinus,bottomEdge=naturalVertical?bMinus:bPlus;
  const reserved=[],reserve=(cx,baseline,value,size=18,rotate=false)=>{
    const estimatedWidth=String(value).length*size*.65+12;
    reserved.push(rotate?{x:cx-size,y:baseline-estimatedWidth/2,width:size+9,height:estimatedWidth}:{x:cx-estimatedWidth/2,y:baseline-size,width:estimatedWidth,height:size+8});
  };
  let dimensions='';
  for(const [axis,layout] of [['A',ordinateA],['B',ordinateB]])if(layout)for(const [index,lane] of layout.lanes.entries())for(const span of lane.spines.values()){
    const coordinate=axis==='A'?bottom+76+index*layout.pitch:left-82-index*layout.pitch;
    const points=span.members.flatMap(d=>[d.target,d.edge.coordinate]),low=Math.min(...points),high=Math.max(...points),datum=axis==='A'?x(span.coordinate):y(span.coordinate);
    const edge=span.members[0].edge,caption=`${axis} · ${w[edge.physicalEdge]??edge.physicalEdge}${edge.notch?` · ${w.notch}`:''}`;
    dimensions+=`<g class="dimension ordinate-spine" data-inspection-ordinate-axis="${axis}" data-ordinate-datum="${escape(span.coordinate)}" data-ordinate-physical-edge="${escape(edge.physicalEdge)}" data-ordinate-notch="${edge.notch}"><title>${escape(caption)}</title>${axis==='A'?line(x(low),coordinate,x(high),coordinate):line(coordinate,y(low),coordinate,y(high))}${axis==='A'?line(datum,coordinate-7,datum,coordinate+7):line(coordinate-7,datum,coordinate+7,datum)}</g>`;
  }
  for(const [index,dimension] of dimsA.entries()){
    const {edge,target,members}=dimension,dx1=x(edge.coordinate),dx2=x(target),dy=bottom+76+(ordinateA?ordinateA.placements.get(dimension)*ordinateA.pitch:index*48),middle=ordinateA?dx2:(dx1+dx2)/2;
    const ids=members.map(member=>member.group.id).join(' '),references=members.map(({group,hole})=>referenceMetadata(group,hole,hole.nearestEdges.a,'A')).join('');
    const extensions=members.map(({hole})=>`${line(x(hole.nearestEdges.a.point.a),y(hole.nearestEdges.a.point.b),dx1,dy,'class="extension"')}${line(x(hole.a),y(hole.b),dx2,dy,'class="extension"')}`).join('');
    dimensions+=`<g class="dimension" data-inspection-edge="A" data-distance="${escape(edge.distance)}" data-dimension-style="${ordinateA?'ordinate':'linear'}" data-edge-coordinate="${escape(edge.coordinate)}" data-edge-physical="${escape(edge.physicalEdge)}" data-edge-notch="${edge.notch}" data-inspection-markers="${escape(ids)}" data-inspection-selected="${members.some(m=>m.group===selected)}"><title>${escape(`A · ${number(edge.distance)} · ${ids}`)}</title>${extensions}${ordinateA?'':line(dx1,dy,dx2,dy)+line(dx1-4,dy+5,dx1+4,dy-5)}${line(dx2-4,dy+5,dx2+4,dy-5)}${text(middle,dy-10,number(edge.distance),'class="measurement" text-anchor="middle"')}${references}</g>`;
    reserve(middle,dy-10,number(edge.distance),25);
  }
  for(const [index,dimension] of dimsB.entries()){
    const {edge,target,members}=dimension,dy1=y(edge.coordinate),dy2=y(target),dx=left-82-(ordinateB?ordinateB.placements.get(dimension)*ordinateB.pitch:index*44),middle=ordinateB?dy2:(dy1+dy2)/2;
    const ids=members.map(member=>member.group.id).join(' '),references=members.map(({group,hole})=>referenceMetadata(group,hole,hole.nearestEdges.b,'B')).join('');
    const extensions=members.map(({hole})=>`${line(x(hole.nearestEdges.b.point.a),y(hole.nearestEdges.b.point.b),dx,dy1,'class="extension"')}${line(x(hole.a),y(hole.b),dx,dy2,'class="extension"')}`).join('');
    dimensions+=`<g class="dimension" data-inspection-edge="B" data-distance="${escape(edge.distance)}" data-dimension-style="${ordinateB?'ordinate':'linear'}" data-edge-coordinate="${escape(edge.coordinate)}" data-edge-physical="${escape(edge.physicalEdge)}" data-edge-notch="${edge.notch}" data-inspection-markers="${escape(ids)}" data-inspection-selected="${members.some(m=>m.group===selected)}"><title>${escape(`B · ${number(edge.distance)} · ${ids}`)}</title>${extensions}${ordinateB?'':line(dx,dy1,dx,dy2)+line(dx-5,dy1+4,dx+5,dy1-4)}${line(dx-5,dy2+4,dx+5,dy2-4)}${text(dx-12,ordinateB?middle+8:middle,number(edge.distance),ordinateB?'class="measurement" text-anchor="end"':`class="measurement" text-anchor="middle" transform="rotate(-90 ${n(dx-12)} ${n(middle)})"`)}${references}</g>`;
    if(ordinateB)reserved.push({x:dx-12-number(edge.distance).length*16,y:middle-18,width:number(edge.distance).length*16,height:34});
    else reserve(dx-12,middle,number(edge.distance),25,true);
  }
  const profiles=new Map();
  for(const group of groups.values())for(const hole of group.operations){
    const key=JSON.stringify([hole.kind,hole.diameter,hole.depth,hole.face,hole.thicknessCoordinate]);
    if(!profiles.has(key))profiles.set(key,{hole,members:[]});profiles.get(key).members.push({hole,group});
  }
  let profileMarkup='';
  for(const [index,profile] of [...profiles.values()].entries()){
    const {hole,members}=profile,entry=hole.face==='face-t-min'?'T=0':hole.face==='face-t-max'?`T=${number(part.thickness)}`:({'edge-a-min':'A+','edge-a-max':'A−','edge-b-min':'B+','edge-b-max':'B−'}[hole.face]??hole.face),row=index*96;
    profileMarkup+=`<g data-inspection-profile="${index+1}" data-operation-kind="${escape(hole.kind)}" data-diameter="${escape(hole.diameter)}" data-depth="${hole.depth===null?'':escape(hole.depth)}" data-entry-face="${escape(hole.face)}" data-inspection-markers="${escape([...new Set(members.map(m=>m.group.id))].join(' '))}">${text(profileLeft,155+row,`${w[hole.kind]??hole.kind} · ${entry}`,'class="small"')}${text(profileLeft,181+row,`Ø${number(hole.diameter)}`,'class="operation-size"')}${text(profileLeft,207+row,`${w.depth} ${hole.depth===null?'*':number(hole.depth)}`,'class="operation-size"')}${members.map(({hole:operation})=>`<g data-inspection-operation="${escape(operation.id)}"/>`).join('')}</g>`;
  }
  if(operations.some(h=>h.depth===null))profileMarkup+=text(profileLeft,138+profiles.size*96,w.setup,'class="small"');
  const sectionTop=Math.max(390,175+profiles.size*96+(operations.some(h=>h.depth===null)?36:0));let sections='';
  for(const [index,dimension] of dimsT.entries()){
    const ids=dimension.members.map(m=>m.group.id).join(' '),references=dimension.members.map(({group,hole})=>referenceMetadata(group,hole,hole.nearestEdges.t,'T')).join('');
    sections+=thicknessSection(part,dimension.members[0].hole,w,number,{left:profileLeft,top:sectionTop+index*185,attributes:`data-inspection-markers="${escape(ids)}"`,references});
  }
  const physical=`${edgeCaption(left+width/2,top-12,`${w[topEdge]} · ${naturalVertical?'B+':'B=0'}`,topEdge,'class="small halo" text-anchor="middle"')}${edgeCaption(left+width/2,bottom+30,`${w[bottomEdge]} · ${naturalVertical?'B=0':'B+'}`,bottomEdge,'class="small halo" text-anchor="middle"')}${edgeCaption(right+20,top+height/2,`${w[aPlus]} · A+`,aPlus,`class="small halo" text-anchor="middle" transform="rotate(90 ${n(right+20)} ${n(top+height/2)})"`)}`;
  reserve(left+width/2,top-12,`${w[topEdge]} · ${naturalVertical?'B+':'B=0'}`);reserve(left+width/2,bottom+30,`${w[bottomEdge]} · ${naturalVertical?'B=0':'B+'}`);reserve(right+20,top+height/2,`${w[aPlus]} · A+`,18,true);
  const outerDimensions=`<g class="dimension" data-inspection-blank-dimension="A" data-distance="${escape(part.width)}">${line(left,top,left,top-52,'class="extension"')}${line(right,top,right,top-52,'class="extension"')}${line(left,top-44,right,top-44)}${line(left-4,top-39,left+4,top-49)}${line(right-4,top-39,right+4,top-49)}${text(left+width/2,top-54,number(part.width),'class="measurement" text-anchor="middle"')}</g><g class="dimension" data-inspection-blank-dimension="B" data-distance="${escape(part.height)}">${line(left,top,left-46,top,'class="extension"')}${line(left,bottom,left-46,bottom,'class="extension"')}${line(left-38,top,left-38,bottom)}${line(left-43,top+4,left-33,top-4)}${line(left-43,bottom+4,left-33,bottom-4)}${text(left-53,top+height/2,number(part.height),`class="measurement" text-anchor="middle" transform="rotate(-90 ${n(left-53)} ${n(top+height/2)})"`)}</g>`;
  reserve(left+width/2,top-54,number(part.width),25);reserve(left-53,top+height/2,number(part.height),25,true);
  const entrySymbols=new Map([...groups.values()].map(group=>[group.id,edgeEntrySymbol(group,x,y,naturalVertical,reserved)]));
  const labels=new Map(),boxes=[...reserved],points=[...groups.values()].map(group=>({x:x(group.a),y:y(group.b)}));let labelBottom=bottom;
  const candidates=[];for(const dy of [-12,25,-36,49,-60,73,-84,97,-108,121])for(const direction of [1,-1])candidates.push([direction,dy]);
  for(const group of groups.values()){
    const cx=x(group.a),cy=y(group.b),labelWidth=group.id.length*11+5;let box;
    for(const [direction,dy] of candidates){
      const candidate={x:cx+(direction>0?13:-labelWidth-13),y:cy+dy-18,width:labelWidth,height:23};
      if(candidate.x<frameLeft-20||candidate.x+candidate.width>profileLeft-20||candidate.y<83||boxes.some(other=>rectOverlap(candidate,other))||points.some(point=>point.x>candidate.x-5&&point.x<candidate.x+candidate.width+5&&point.y>candidate.y-5&&point.y<candidate.y+candidate.height+5))continue;
      box=candidate;break;
    }
    if(!box){
      let baseline=top+25;do{box={x:right+42,y:baseline-18,width:labelWidth,height:23};baseline+=28;}while(boxes.some(other=>rectOverlap(box,other)));
    }
    boxes.push(box);labelBottom=Math.max(labelBottom,box.y+box.height);
    const baseline=box.y+18,far=Math.abs(baseline-cy)>32||Math.abs(box.x-cx)>65;
    labels.set(group.id,`${far?line(cx,cy,box.x+labelWidth/2,baseline-8,'class="marker-label-leader"'):''}${text(box.x,baseline,group.id,`class="marker-label${group===selected?' chosen':''}" data-inspection-marker-label="${escape(group.id)}"`)}`);
  }
  const markers=[...groups.values()].map(group=>{
    const cx=x(group.a),cy=y(group.b),active=group===selected;
    return `<g class="inspection-marker${active?' selected':''}" data-inspection-marker="${escape(group.id)}" data-inspection-selected="${active}" data-a-mm="${escape(rawA(group.operations[0]))}" data-b-mm="${escape(rawB(group.operations[0]))}" data-measurement-a="${escape(group.a)}" data-measurement-b="${escape(group.b)}" role="button" tabindex="0" aria-label="${escape(group.id)}"><title>${escape(`${group.id} · A=${number(group.a)} · B=${number(group.b)}`)}</title><circle class="hit-target" cx="${n(cx)}" cy="${n(cy)}" r="14" fill="transparent" pointer-events="all"/>${group.operations.map(hole=>`<circle class="hole ${hole.kind==='pilot'?'pilot':'face'}" cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.max(3,hole.diameter*scale/2))}" data-operation-id="${escape(hole.id)}" data-diameter-mm="${escape(hole.diameter)}"/>`).join('')}${active?`<circle class="selection-ring" cx="${n(cx)}" cy="${n(cy)}" r="10"/>`:''}${entrySymbols.get(group.id)}${labels.get(group.id)}</g>`;
  }).join('');
  const contentBottom=Math.max(bottom+90+(ordinateA?ordinateA.lanes.length*ordinateA.pitch:dimsA.length*48),labelBottom+30,sections?sectionTop+dimsT.length*185:130+profiles.size*96),canvasHeight=Math.max(750,contentBottom+70);
  const status=!info.drilling?.enabled?w.off:!info.drilling.valid?w.invalid:!groups.size?w.none:'',style=single.match(/<style>[\s\S]*?<\/style>/)?.[0]??'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(canvasWidth)} ${n(canvasHeight)}" width="${n(canvasWidth)}" height="${n(canvasHeight)}" data-part-inspection-diagram="${escape(info.partCode)}" data-part-code="${escape(info.partCode)}" data-inspection-all-holes="true" data-raw-width="${escape(part._rawWidth??part.width)}" data-raw-height="${escape(part._rawHeight??part.height)}" data-measurement-basis="${basisOf(info)}" data-measurement-width="${escape(part.width)}" data-measurement-height="${escape(part.height)}" data-thickness="${escape(part.thickness)}" data-view-face="${escape(viewFaceOf(part))}" data-view-b-direction="${naturalVertical?'up':'down'}" data-selected-marker="${escape(selected?.id??'')}" data-operation-count="${operations.length}" data-marker-count="${groups.size}" data-marker-label-mode="all" role="img" aria-label="${escape(`${info.partCode} ${basisTitle(info,w)}`)}"><defs><marker id="inspection-bore-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#155e75"/></marker></defs>${style}<style>.marker-label-leader{stroke:#91a4aa;stroke-width:1;pointer-events:none}.dimension[data-inspection-selected="true"]{stroke:#155e75;stroke-width:1.7}</style><rect width="${n(canvasWidth)}" height="${n(canvasHeight)}" fill="#fff"/>${text(35,38,info.partCode,'font-size="28" font-weight="700"')}${text(150,38,`${basisTitle(info,w)} · ${number(part.width)} × ${number(part.height)} × ${number(part.thickness)} mm`)}${text(profileLeft,75,`${w.view} T=${number(viewFaceOf(part))}`,'class="small"')}<path class="part-contour" data-inspection-contour="${basisOf(info)}" d="M${outline.map(p=>`${n(x(p.x))} ${n(y(p.y))}`).join(' L')} Z"/>${outerDimensions}${physical}${dimensions}${markers}${profileMarkup}${sections}${status?text(profileLeft,140,status,'class="small"'):''}${text(frameLeft,canvasHeight-25,`A → ${w[aPlus]} · B ${naturalVertical?'↑':'↓'} ${w[bPlus]}`,'class="small"')}</svg>`;
}

function thicknessSection(part,hole,w,number,{left=675,top=370,attributes='',references=''}={}) {
  const edge=hole.nearestEdges.t,[,,,,tMinus,tPlus]=physicalEdges[part.orientation]??physicalEdges['vertical-width'];
  const horizontal=part.orientation==='horizontal',bottom=top+110,right=left+190;
  let bore,dimension,captions;
  if(horizontal){
    const entryY=bottom-hole.thicknessCoordinate/part.thickness*110,edgeY=edge.side==='minus'?bottom:top,tx=left+75;
    bore=`${line(left-17,entryY,right-37,entryY,'class="bore" marker-end="url(#inspection-bore-arrow)"')}<circle cx="${left}" cy="${n(entryY)}" r="4" fill="#155e75"/>`;
    dimension=`${line(tx,entryY,tx,edgeY)}${line(tx-5,entryY+4,tx+5,entryY-4)}${line(tx-5,edgeY+4,tx+5,edgeY-4)}${text(tx+12,(entryY+edgeY)/2+8,number(edge.distance),'class="measurement"')}`;
    captions=`${edgeCaption(left,top-10,`T=${number(part.thickness)} · ${w[tPlus]}`,tPlus,'class="small"')}${edgeCaption(left,bottom+26,`T=0 · ${w[tMinus]}`,tMinus,'class="small"')}`;
  }else{
    const entryX=left+hole.thicknessCoordinate/part.thickness*190,edgeX=edge.side==='minus'?left:right,ty=top+72;
    bore=`${line(entryX,top-17,entryX,bottom-10,'class="bore" marker-end="url(#inspection-bore-arrow)"')}<circle cx="${n(entryX)}" cy="${top}" r="4" fill="#155e75"/>`;
    dimension=`${line(entryX,ty,edgeX,ty)}${line(entryX-4,ty+5,entryX+4,ty-5)}${line(edgeX-4,ty+5,edgeX+4,ty-5)}${text((entryX+edgeX)/2,ty-12,number(edge.distance),'class="measurement" text-anchor="middle"')}`;
    captions=`${edgeCaption(left,top-10,`T=0 · ${w[tMinus]}`,tMinus,'class="small"')}${edgeCaption(right,bottom+26,`T=${number(part.thickness)} · ${w[tPlus]}`,tPlus,'class="small" text-anchor="end"')}`;
  }
  return `<g data-inspection-section="T">${text(left,top-36,`${w.section} · T=${number(part.thickness)}`,'class="small"')}<rect x="${left}" y="${top}" width="190" height="110" class="section-panel"/>${bore}${captions}<g class="dimension selected-dimension" data-inspection-edge="T" data-distance="${escape(edge.distance)}" data-edge-coordinate="${escape(edge.coordinate)}" ${attributes}>${dimension}${references}</g></g>`;
}

/** All holes remain selectable; a G combines the operations at one A/B point.
 * Dimension extensions end at the actual contour exits supplied by inspection,
 * including notch edges. The SVG never recomputes or rounds drilling positions. */
export function createPartInspectionSvg(info, {markerId,allHoles=false}={}) {
  if (!info?.part) throw new TypeError('Part inspection is required.');
  info=displayInspection(info);
  if(allHoles)return createAllPartInspectionSvg(info,{markerId});
  const part=info.part, outline=outlineOf(part), language=printLanguage(info.language,'tr'), w=vocabulary[language];
  if (!outline.length || !outline.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)) || ![part.width,part.height,part.thickness].every(value=>Number.isFinite(value)&&value>0)) throw new TypeError('Invalid inspection contour.');
  const number=value=>printNumber(value,language), bounds={minA:Math.min(...outline.map(p=>p.x)),maxA:Math.max(...outline.map(p=>p.x)),minB:Math.min(...outline.map(p=>p.y)),maxB:Math.max(...outline.map(p=>p.y))};
  const spanA=bounds.maxA-bounds.minA,spanB=bounds.maxB-bounds.minB;
  if (spanA<=0 || spanB<=0) throw new TypeError('Invalid inspection contour.');
  const scale=Math.min(440/spanA,430/spanB), width=spanA*scale,height=spanB*scale,left=140+(440-width)/2,top=115+(430-height)/2;
  const naturalVertical=verticalPart(part),x=a=>left+(a-bounds.minA)*scale,y=b=>top+(naturalVertical?bounds.maxB-b:b-bounds.minB)*scale;
  const [aMinus,aPlus,bMinus,bPlus,tMinus,tPlus]=physicalEdges[part.orientation]??physicalEdges['vertical-width'];
  const holes=info.drilling?.enabled&&info.drilling.valid?(info.operations??[]):[];
  const groups=new Map();
  for (const hole of holes) {
    if (![hole.a,hole.b,hole.diameter,hole.thicknessCoordinate].every(Number.isFinite)) throw new TypeError('Invalid inspection operation.');
    const id=hole.markerId??`G${String(groups.size+1).padStart(2,'0')}`;
    if (!groups.has(id)) groups.set(id,{id,a:hole.a,b:hole.b,operations:[]});
    const group=groups.get(id);
    if (Math.abs(group.a-hole.a)>.001||Math.abs(group.b-hole.b)>.001) throw new TypeError('Inspection marker has different positions.');
    group.operations.push(hole);
  }
  const selected=groups.get(markerId)??groups.values().next().value, selectedHole=selected?.operations.find(h=>h.kind==='pilot')??selected?.operations[0];
  const nearest=selectedHole?.nearestEdges;
  let dimensions='', detail='', section='';
  const reservedLabels=[];
  const reserveText=(cx,baseline,value,fontSize=18,rotation=false)=>{
    const estimatedWidth=String(value).length*fontSize*.64+10;
    reservedLabels.push(rotation?{x:cx-fontSize,y:baseline-estimatedWidth/2,width:fontSize+8,height:estimatedWidth}:{x:cx-estimatedWidth/2,y:baseline-fontSize,width:estimatedWidth,height:fontSize+7});
  };
  // Place selected dimensions outside the panel even for tiny offsets. Their
  // extension lines still end at the selected point and its real contour exit.
  const edgeName=edge=>`${w[edge.physicalEdge]??edge.physicalEdge}${edge.notch?` · ${w.notch}`:''}`;
  if (selectedHole&&nearest) {
    const sx=x(selected.a),sy=y(selected.b);
    if (nearest.a) {
      const edge=nearest.a,ex=x(edge.point?.a??edge.coordinate),ey=y(edge.point?.b??selected.b),dy=top+height+70,middle=(sx+ex)/2;
      dimensions+=`<g class="dimension selected-dimension" data-inspection-edge="A" data-distance="${escape(edge.distance)}" data-edge-coordinate="${escape(edge.coordinate)}" data-edge-notch="${edge.notch}" data-reference-a="${escape(edge.point?.a??edge.coordinate)}" data-reference-b="${escape(edge.point?.b??selected.b)}">${line(ex,ey,ex,dy,'class="extension"')}${line(sx,sy,sx,dy,'class="extension"')}${line(ex,dy,sx,dy)}${line(ex-4,dy+5,ex+4,dy-5)}${line(sx-4,dy+5,sx+4,dy-5)}${text(middle,dy-10,number(edge.distance),'class="measurement" text-anchor="middle"')}${text(middle,dy+24,`A · ${edgeName(edge)}`,'class="small halo" text-anchor="middle"')}</g>`;
      reserveText(middle,dy-10,number(edge.distance),25);reserveText(middle,dy+24,`A · ${edgeName(edge)}`);
    }
    if (nearest.b) {
      const edge=nearest.b,ex=x(edge.point?.a??selected.a),ey=y(edge.point?.b??edge.coordinate),dx=left-76,middle=(sy+ey)/2;
      dimensions+=`<g class="dimension selected-dimension" data-inspection-edge="B" data-distance="${escape(edge.distance)}" data-edge-coordinate="${escape(edge.coordinate)}" data-edge-notch="${edge.notch}" data-reference-a="${escape(edge.point?.a??selected.a)}" data-reference-b="${escape(edge.point?.b??edge.coordinate)}">${line(ex,ey,dx,ey,'class="extension"')}${line(sx,sy,dx,sy,'class="extension"')}${line(dx,ey,dx,sy)}${line(dx-5,ey+4,dx+5,ey-4)}${line(dx-5,sy+4,dx+5,sy-4)}${text(dx-12,middle,number(edge.distance),`class="measurement" text-anchor="middle" transform="rotate(-90 ${n(dx-12)} ${n(middle)})"`)}${text(dx-39,middle,`B · ${edgeName(edge)}`,`class="small halo" text-anchor="middle" transform="rotate(-90 ${n(dx-39)} ${n(middle)})"`)}</g>`;
      reserveText(dx-12,middle,number(edge.distance),25,true);reserveText(dx-39,middle,`B · ${edgeName(edge)}`,18,true);
    }
    detail=text(675,125,selected.id,'class="group-title"');
    selected.operations.forEach((hole,index)=>{
      const entry=hole.face==='face-t-min'?'T=0':hole.face==='face-t-max'?`T=${number(part.thickness)}`:({'edge-a-min':'A+','edge-a-max':'A−','edge-b-min':'B+','edge-b-max':'B−'}[hole.face]??hole.face);
      const diameter=`Ø${number(hole.diameter)}`,depth=`${w.depth} ${hole.depth===null?'*':number(hole.depth)}`,combined=`${diameter} · ${depth}`,row=index*90;
      const sizes=combined.length*23*.64>210
        ? `${text(675,190+row,diameter,'class="operation-size" data-inspection-measurement="diameter"')}${text(675,216+row,depth,'class="operation-size" data-inspection-measurement="depth"')}`
        : text(675,190+row,combined,'class="operation-size"');
      detail+=`<g data-inspection-operation="${escape(hole.id)}" data-operation-kind="${escape(hole.kind)}" data-diameter="${escape(hole.diameter)}" data-depth="${hole.depth===null?'':escape(hole.depth)}" data-entry-face="${escape(hole.face)}" data-thickness-coordinate="${escape(hole.thicknessCoordinate)}">${text(675,164+row,`${w[hole.kind]??hole.kind} · ${entry}`,'class="small"')}${sizes}</g>`;
    });
    if (selected.operations.some(h=>h.depth===null)) detail+=text(675,174+selected.operations.length*90,w.setup,'class="small"');
    if (selectedHole.kind==='pilot'&&nearest.t) {
      section=thicknessSection(part,selectedHole,w,number);
    }
  }
  // A large invisible target is separate from the true diameter marker. Dense
  // unselected labels may be omitted, while their G IDs remain on each target
  // and in its native tooltip; selecting one always exposes its full label.
  const topEdge=naturalVertical?bPlus:bMinus,bottomEdge=naturalVertical?bMinus:bPlus;
  reserveText(left+width/2,top-12,`${w[topEdge]} · ${naturalVertical?'B+':'B=0'}`);reserveText(left+width/2,top+height+31,`${w[bottomEdge]} · ${naturalVertical?'B=0':'B+'}`);
  reserveText(left+width/2,top-49,number(part.width),25);reserveText(left-53,top+height/2,number(part.height),25,true);
  reserveText(left+width+17,top+height/2,`${w[aPlus]} · A+`,18,true);
  const entrySymbols=new Map([...groups.values()].map(group=>[group.id,edgeEntrySymbol(group,x,y,naturalVertical,reservedLabels)]));
  const labelBoxes=[...reservedLabels],points=[...groups.values()].map(group=>({x:x(group.a),y:y(group.b)})),labels=new Map();
  const labelOrder=[...groups.values()].sort((a,b)=>(b===selected)-(a===selected));
  for (const group of labelOrder) {
    const cx=x(group.a),cy=y(group.b),labelWidth=group.id.length*11+4;
    for (const [dx,dy] of [[13,-12],[13,25],[-labelWidth-13,-12],[-labelWidth-13,25],[13,-34],[13,47],[-labelWidth-13,-34],[-labelWidth-13,47]]) {
      const box={x:cx+dx,y:cy+dy-18,width:labelWidth,height:22};
      if (box.x<75||box.x+box.width>643||box.y<82||box.y+box.height>590||labelBoxes.some(other=>rectOverlap(box,other))||points.some(point=>point.x>box.x-5&&point.x<box.x+box.width+5&&point.y>box.y-5&&point.y<box.y+box.height+5)) continue;
      labels.set(group.id,text(box.x,box.y+18,group.id,`class="marker-label${group===selected?' chosen':''}" data-inspection-marker-label="${escape(group.id)}"`));labelBoxes.push(box);break;
    }
  }
  const markers=[...groups.values()].map(group=>{
    const cx=x(group.a),cy=y(group.b),active=group===selected;
    return `<g class="inspection-marker${active?' selected':''}" data-inspection-marker="${escape(group.id)}" data-inspection-selected="${active}" data-a-mm="${escape(rawA(group.operations[0]))}" data-b-mm="${escape(rawB(group.operations[0]))}" data-measurement-a="${escape(group.a)}" data-measurement-b="${escape(group.b)}" role="button" tabindex="0" aria-label="${escape(group.id)}"><title>${escape(group.id)} · A=${escape(number(group.a))} · B=${escape(number(group.b))}</title><circle class="hit-target" cx="${n(cx)}" cy="${n(cy)}" r="14" fill="transparent" pointer-events="all"/>${group.operations.map(hole=>`<circle class="hole ${hole.kind==='pilot'?'pilot':'face'}" cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.max(3,hole.diameter*scale/2))}" data-operation-id="${escape(hole.id)}" data-diameter-mm="${escape(hole.diameter)}"/>`).join('')}${active?`<circle class="selection-ring" cx="${n(cx)}" cy="${n(cy)}" r="10"/>`:''}${entrySymbols.get(group.id)}${labels.get(group.id)??''}</g>`;
  }).join('');
  const status=!info.drilling?.enabled?w.off:!info.drilling.valid?w.invalid:!groups.size?w.none:'';
  const outerDimensions=`<g class="dimension" data-inspection-blank-dimension="A" data-distance="${escape(part.width)}">${line(left,top,left,top-48,'class="extension"')}${line(left+width,top,left+width,top-48,'class="extension"')}${line(left,top-40,left+width,top-40)}${line(left-4,top-35,left+4,top-45)}${line(left+width-4,top-35,left+width+4,top-45)}${text(left+width/2,top-49,number(part.width),'class="measurement" text-anchor="middle"')}</g><g class="dimension" data-inspection-blank-dimension="B" data-distance="${escape(part.height)}">${line(left,top,left-46,top,'class="extension"')}${line(left,top+height,left-46,top+height,'class="extension"')}${line(left-38,top,left-38,top+height)}${line(left-43,top+4,left-33,top-4)}${line(left-43,top+height+4,left-33,top+height-4)}${text(left-53,top+height/2,number(part.height),`class="measurement" text-anchor="middle" transform="rotate(-90 ${n(left-53)} ${n(top+height/2)})"`)}</g>`;
  const viewFace=viewFaceOf(part);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 700" width="900" height="700" data-part-inspection-diagram="${escape(info.partCode)}" data-part-code="${escape(info.partCode)}" data-raw-width="${escape(part._rawWidth??part.width)}" data-raw-height="${escape(part._rawHeight??part.height)}" data-measurement-basis="${basisOf(info)}" data-measurement-width="${escape(part.width)}" data-measurement-height="${escape(part.height)}" data-thickness="${escape(part.thickness)}" data-view-face="${escape(viewFace)}" data-view-b-direction="${naturalVertical?'up':'down'}" data-selected-marker="${escape(selected?.id??'')}" data-operation-count="${holes.length}" data-marker-count="${groups.size}" data-marker-label-mode="${labels.size===groups.size?'all':'spaced'}" role="img" aria-label="${escape(`${info.partCode} ${basisTitle(info,w)}`)}"><defs><marker id="inspection-bore-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#155e75"/></marker></defs><style>text{font-family:Arial,sans-serif;fill:#17252d;font-size:20px}.small{font-size:18px}.measurement{font-size:25px;font-weight:700;paint-order:stroke;stroke:white;stroke-width:7px;stroke-linejoin:round}.halo,.marker-label{paint-order:stroke;stroke:white;stroke-width:5px;stroke-linejoin:round}.marker-label{font-size:19px;font-weight:700}.chosen,.group-title{fill:#155e75}.group-title{font-size:30px;font-weight:700}.operation-size{font-size:23px;font-weight:700}.dimension{stroke:#354f59;stroke-width:1.4;fill:none}.dimension text{stroke-width:7px;fill:#17252d}.dimension .small{stroke-width:5px}.extension{stroke:#91a4aa;stroke-dasharray:4 3}.selected-dimension{stroke:#155e75;stroke-width:1.7}.part-contour{fill:#f6f7f5;stroke:#263b43;stroke-width:2}.hole{fill:#fff;stroke:#44585e;stroke-width:1.4}.pilot{fill:#e5f0f3}.selected .hole{stroke:#155e75;stroke-width:2}.selection-ring{fill:none;stroke:#155e75;stroke-width:2;pointer-events:none}.inspection-marker{cursor:pointer}.inspection-marker:focus .hit-target{stroke:#155e75;stroke-width:2}.section-panel{fill:#e8eeeb;stroke:#354f59;stroke-width:1.5}.edge-entry{stroke:#b15d21;stroke-width:2.5;fill:none}.bore{stroke:#155e75;stroke-width:2;stroke-dasharray:5 3}</style><rect width="900" height="700" fill="#fff"/>${text(35,38,info.partCode,'font-size="28" font-weight="700"')}${text(150,38,`${basisTitle(info,w)} · ${number(part.width)} × ${number(part.height)} × ${number(part.thickness)} mm`)}${text(675,70,`${w.view} T=${number(viewFace)}`,'class="small"')}<path class="part-contour" data-inspection-contour="${basisOf(info)}" d="M${outline.map(p=>`${n(x(p.x))} ${n(y(p.y))}`).join(' L')} Z"/>${outerDimensions}${text(left+width/2,top-12,`${w[topEdge]} · ${naturalVertical?'B+':'B=0'}`,'class="small halo" text-anchor="middle"')}${text(left+width/2,top+height+31,`${w[bottomEdge]} · ${naturalVertical?'B=0':'B+'}`,'class="small halo" text-anchor="middle"')}${text(left+width+17,top+height/2,`${w[aPlus]} · A+`,`class="small halo" text-anchor="middle" transform="rotate(90 ${n(left+width+17)} ${n(top+height/2)})"`)}${text(120,674,`A → ${w[aPlus]} · B ${naturalVertical?'↑':'↓'} ${w[bPlus]}`,'class="small"')}${dimensions}${markers}${detail}${section}${status?text(675,125,status,'class="small"'):''}</svg>`;
}
