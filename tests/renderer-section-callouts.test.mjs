import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,getCabinetLayout,createSection} from '../src/engine.js';
import {createInteriorExample,createLaundryExample} from '../src/examples.js';
import {createDrawingSvg,generateDrawingHTML} from '../src/renderer.js';
import {printNumber,translatePrintText} from '../src/print-i18n.js';

function pages(project,language,view='interior'){
 const options={cabinetId:project.cabinets[0].id,language},first=createDrawingSvg(project,view,options),count=Number(first.match(/data-annotation-page-count="(\d+)"/)[1]);
 return Array.from({length:count},(_,index)=>index?createDrawingSvg(project,view,{...options,annotationPage:index+1}):first);
}
const attr=(html,name)=>html.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const plain=value=>String(value).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ');
function cards(svg){
 return [...svg.matchAll(/<g data-callout-index="[^"]+"[^>]*data-label-kind="section"[^>]*>([\s\S]*?)<\/g>/g)].map(match=>{
  const html=match[0],text=[...html.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m=>plain(m[1]));
  return {html,text,mark:attr(html,'data-section-callout'),id:attr(html,'data-section-source-id'),a:[Number(attr(html,'data-source-anchor-x')),Number(attr(html,'data-source-anchor-y'))]};
 });
}

test('S cards preserve actual outer and internal opening width, height and usable depth with a straight leader to their centre',()=>{
 for(const thickness of [18,25])for(const corner of ['back-left','back-right'])for(const language of ['ru','tr','en']){
  const project=createInteriorExample(language),cabinet=project.cabinets[0];
  Object.assign(cabinet,{width:1300.820691,height:2290.012628,depth:702.431066,x:831,y:173,z:342,rotation:37,cutout:{corner,width:303.703596,depth:194.620925}});
  project.materials.find(m=>m.id===cabinet.materialId).thickness=thickness;
  const before=structuredClone(project),layout=getCabinetLayout(cabinet,project),expected=[...layout.sections,...layout.internalSections],svgs=pages(project,language),actual=svgs.flatMap(cards);
  assert.equal(actual.length,expected.length);assert.equal(new Set(actual.map(c=>c.id)).size,expected.length);
  for(const section of expected){
   const card=actual.find(c=>c.id===section.id);assert.ok(card);assert.equal(attr(card.html,'data-section-cabinet'),cabinet.id);
   assert.equal(Number(attr(card.html,'data-opening-width-mm')),section.width);assert.equal(Number(attr(card.html,'data-opening-height-mm')),section.height);assert.equal(Number(attr(card.html,'data-usable-depth-mm')),section.usableDepth??section.depth);
   const text=card.text.join(' ');assert.ok(text.includes(plain(`${translatePrintText('Проём',language)} ${printNumber(section.width,language)} × ${printNumber(section.height,language)}`)));assert.ok(text.includes(plain(printNumber(section.usableDepth??section.depth,language))));
   assert.equal(card.text[0],card.mark);assert.ok(!card.text.some(t=>/^A(?:[ =]|$)/.test(t)),'fixing-axis dimension is not repeated in the opening card');
   assert.ok([...card.html.matchAll(/font-size="([\d.]+)"/g)].every(m=>Number(m[1])===14));
   for(const [axis,coordinate] of [['x',0],['y',1]]){
    const start=Number(attr(card.html,`data-opening-screen-${axis}`)),size=Number(attr(card.html,`data-opening-screen-${axis==='x'?'width':'height'}`));
    assert.ok(Math.abs(card.a[coordinate]-start-size/2)<.015,'endpoint is at this actual opening centre');
   }
   const containing=svgs.find(svg=>svg.includes(`data-section-source-id="${section.id}"`)),leader=containing.match(new RegExp(`<path data-section-leader="${card.mark.replace('.','\\.')}" d="([^"]+)"`));
   assert.ok(leader);assert.match(leader[1],/^M[-\d.,]+ L[-\d.,]+$/,'one direct segment, no elbow');
   assert.equal((containing.match(new RegExp(`data-section-leader="${card.mark.replace('.','\\.')}"`,'g'))||[]).length,1);
  }
  assert.deepEqual(project,before);
 }
});

test('crowded section leaders paginate without crossings or passing through another opening dot',()=>{
 for(const project of [createLaundryExample('en'),createInteriorExample('en')])for(const svg of pages(project,'en')){
  const leaders=[...svg.matchAll(/<path data-section-leader="([^"]+)" d="M([-\d.,]+) L([-\d.,]+)"/g)].map(([,mark,a,b])=>({mark,a:a.split(',').map(Number),b:b.split(',').map(Number)}));
  const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
  for(let i=0;i<leaders.length;i++)for(let j=i+1;j<leaders.length;j++){
   const a=leaders[i],b=leaders[j],r=[a.b[0]-a.a[0],a.b[1]-a.a[1]],s=[b.b[0]-b.a[0],b.b[1]-b.a[1]],d=[b.a[0]-a.a[0],b.a[1]-a.a[1]],cross=(u,v)=>u[0]*v[1]-u[1]*v[0],den=cross(r,s);
   if(Math.abs(den)>1e-8){const t=cross(d,s)/den,u=cross(d,r)/den;assert.ok(!(t>.001&&t<.999&&u>.001&&u<.999),'direct leaders do not cross');}
   assert.ok(distance(a.b,b.a,b.b)>=4.15&&distance(b.b,a.a,a.b)>=4.15,'a leader cannot identify another opening dot');
  }
 }
});

test('every front opening has an S card even behind doors, equipment and internal fronts',()=>{
 for(const project of [createLaundryExample('tr'),createInteriorExample('tr')]){
  const cabinet=project.cabinets[0],layout=getCabinetLayout(cabinet,project),expected=[...layout.sections,...layout.internalSections],svgs=pages(project,'tr','front'),actual=svgs.flatMap(cards);
  assert.deepEqual(actual.map(c=>c.id).sort(),expected.map(s=>s.id).sort());
  assert.equal(actual.length,expected.length);
  for(const section of expected){const card=actual.find(c=>c.id===section.id);assert.equal(Number(attr(card.html,'data-opening-width-mm')),section.width);assert.equal(Number(attr(card.html,'data-opening-height-mm')),section.height);assert.equal(Number(attr(card.html,'data-usable-depth-mm')),section.usableDepth??section.depth);}
  assert.match(svgs.join(''),/F1/,'facade labels remain alongside opening cards');
  if(project.cabinets[0].id===createLaundryExample('tr').cabinets[0].id&&layout.sections.length===5)assert.equal(cards(svgs[0]).length,5,'all five ordinary laundry openings fit the first front sheet');
 }
});

test('compact passports retain all six projections and readable S cards on full front and interior sheets',()=>{
 const project=createDefaultProject('tr'),cabinet=project.cabinets[0];Object.assign(cabinet,{height:1000,layout:{...createSection('open'),id:'one',shelves:0}});
 const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language:'tr',compact:true});
 assert.deepEqual([...new Set([...html.matchAll(/data-drawing-view="([^"]+)"/g)].map(m=>m[1]))],['front','back','left','right','top','interior']);
 assert.match(html,/data-section-callout="S1"/);assert.match(html,/Açıklık/);assert.match(html,/Derinlik/);
 assert.match(createDrawingSvg(project,'front',{cabinetId:cabinet.id}),/data-section-callout="S1"/);
});
