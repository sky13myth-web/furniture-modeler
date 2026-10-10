import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, generateParts } from '../src/engine.js';
import { createAssemblySvg, getAssemblyPageCount, generateDrawingHTML } from '../src/renderer.js';
import { productionPartCode } from '../src/production-id.js';
import { translatePartName, translatePrintText } from '../src/print-i18n.js';
import { createInteriorExample } from '../src/examples.js';

function twoCabinets() {
  const project=createDefaultProject('en'),first=project.cabinets[0];
  first.includeBack=false;
  first.layout.children[0].internalDrawerCount=2;
  first.layout.children[0].back='solid';
  first.layout.children[2].back='braces';
  first.layout.children[2].rearBraces=[{id:'assembly-local-brace',y:120,height:100}];
  const second=structuredClone(first);
  Object.assign(second,{id:'second-cabinet',name:'Second cabinet',x:2600,rotation:90,y:300,plinth:137.5,cutout:{corner:'back-left',width:180,depth:150}});
  project.cabinets.push(second);
  return project;
}

test('each cabinet assembly group includes every actual panel once under its project-wide production code',()=>{
  const project=twoCabinets(),before=structuredClone(project),parts=generateParts(project);
  assert.ok(parts.some(part=>part.component==='section-back'));
  assert.ok(parts.some(part=>part.component==='brace'));
  assert.ok(parts.some(part=>part.component==='internal-drawer-front'));
  for(const cabinet of project.cabinets){
    const expected=parts.flatMap((part,index)=>part.cabinetId===cabinet.id?[productionPartCode(index)]:[]),actual=[];
    for(let page=1;page<=getAssemblyPageCount(project,{cabinetId:cabinet.id});page++){
      const svg=createAssemblySvg(project,{cabinetId:cabinet.id,language:'en',page});
      assert.ok(svg.includes(`data-assembly-group="${page}" data-assembly-group-count="${getAssemblyPageCount(project,{cabinetId:cabinet.id})}"`));
      const codes=[...svg.matchAll(/data-assembly-callout="(P\d+)"/g)].map(match=>match[1]);
      assert.ok(codes.length<=12);
      for(const code of codes)assert.ok(svg.includes(`data-assembly-part="${code}"`),'every callout has corresponding real panel geometry');
      actual.push(...codes);
    }
    assert.deepEqual(actual.sort(),expected.sort(),'local back panels, brace panels and all internal box components stay in the set');
  }
  assert.deepEqual(project,before,'assembly groups never alter saved geometry, room position or rotation');
});

test('assembly leaders have separate reserved text boxes and use the finished panel origin including the plinth once',()=>{
  const project=twoCabinets(),parts=generateParts(project);
  for(const cabinet of project.cabinets)for(let page=1;page<=getAssemblyPageCount(project,{cabinetId:cabinet.id});page++){
    const svg=createAssemblySvg(project,{cabinetId:cabinet.id,page,language:'en'});
    const boxes=[...svg.matchAll(/data-assembly-callout="(P\d+)" data-label-x="([\d.]+)" data-label-y="([\d.]+)" data-label-width="([\d.]+)" data-label-height="([\d.]+)" data-assembled-origin="([^"]+)"/g)].map(([,code,x,y,w,h,origin])=>({code,x:Number(x),y:Number(y),w:Number(w),h:Number(h),origin:origin.split(',').map(Number)}));
    for(const box of boxes){
      assert.ok(box.x>=0&&box.y>=150&&box.x+box.w<=1120&&box.y+box.h<730,'labels stay inside the page, clear of the title and reading notes');
      const part=parts[Number(box.code.slice(1))-1],expected=[part.position.x,cabinet.plinth+part.position.y,part.position.z];
      box.origin.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<.0011,'assembly XYZ are local to the cabinet, independent of its room pivot/height'));
    }
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];
      assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'leader text boxes cannot overlap even for twelve panels');
    }
  }
});

test('assembly retains a shaped panel finished contour rather than depicting the smaller cutting blank',()=>{
  const project=twoCabinets(),cabinet=project.cabinets[1],parts=generateParts(project),index=parts.findIndex(part=>part.cabinetId===cabinet.id&&part.orientation==='horizontal'&&part.finishedOutline);
  assert.ok(index>=0);
  const part=parts[index],cabinetIndex=parts.filter(p=>p.cabinetId===cabinet.id).findIndex(p=>p.id===part.id),svg=createAssemblySvg(project,{cabinetId:cabinet.id,page:Math.floor(cabinetIndex/12)+1,language:'en'});
  assert.notEqual(part.height,part.finishedHeight,'band thickness is deducted only in the cutting blank');
  const shapes=[...svg.matchAll(new RegExp(`<polygon data-assembly-part="${productionPartCode(index)}"[^>]*points="([^"]+)"`,'g'))].map(match=>match[1].split(' '));
  assert.ok(shapes.some(points=>points.length===part.finishedOutline.length),'the finished L outline remains a shaped face in the exploded diagram');
});

test('deep L panel callouts point to material rather than the removed bounding-box centre',()=>{
  const inside=(x,y,outline)=>{let result=false;for(let i=0,j=outline.length-1;i<outline.length;j=i++){const a=outline[i],b=outline[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;};
  for(const corner of ['back-left','back-right']){
    const project=createDefaultProject('en'),cabinet=project.cabinets[0];
    cabinet.cutout={corner,width:800,depth:560};
    const parts=generateParts(project),index=parts.findIndex(part=>part.finishedOutline),part=parts[index];
    assert.equal(inside(part.finishedWidth/2,part.finishedHeight/2,part.finishedOutline),false,'fixture removes the rectangle centre');
    const svg=createAssemblySvg(project,{cabinetId:cabinet.id,page:Math.floor(index/12)+1,language:'en'});
    const marker=svg.match(new RegExp(`data-assembly-callout="${productionPartCode(index)}"[^>]*data-assembly-marker-ab="([^"]+)"`))[1].split(',').map(Number);
    assert.ok(inside(...marker,part.finishedOutline),'the arrow anchor lies inside the finished L panel');
  }
});

test('every cabinet passport includes the complete assembly and full installation names in all output languages',()=>{
  const project=twoCabinets(),parts=generateParts(project),cabinet=project.cabinets[1];
  cabinet.name='My <custom> cabinet & workshop';
  for(const language of ['ru','tr','en']){
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    const installation=[...html.matchAll(/<section class="sheet schedule installation-schedule"[\s\S]*?<\/section>/g)].map(match=>match[0]).join('');
    const actual=[...installation.matchAll(/<td>(P\d+)<\/td>/g)].map(match=>match[1]),expected=parts.flatMap((part,index)=>part.cabinetId===cabinet.id?[productionPartCode(index)]:[]);
    assert.deepEqual(actual,expected);
    for(const part of parts.filter(part=>part.cabinetId===cabinet.id))assert.ok(installation.includes(translatePartName(part.name,language)));
    assert.match(html,/My &lt;custom&gt; cabinet &amp; workshop/);
    assert.doesNotMatch(html,/<custom>/);
    assert.equal((html.match(/data-assembly-callout=/g)||[]).length,expected.length);
  }
  const projectBook=generateDrawingHTML(project,{language:'en'});
  assert.ok(project.cabinets.every(c=>projectBook.includes(`class="sheet schedule installation-schedule" data-assembly-cabinet="${c.id}"`)),'whole-project export includes a separate installation schedule for every cabinet');
});

test('assembly navigation is one-based, clamps both ends and explains an unknown cabinet',()=>{
  const project=createDefaultProject('en'),count=getAssemblyPageCount(project);
  assert.match(createAssemblySvg(project,{page:0,language:'en'}),/data-assembly-group="1"/);
  assert.match(createAssemblySvg(project,{page:999,language:'en'}),new RegExp(`data-assembly-group="${count}"`));
  assert.throws(()=>createAssemblySvg(project,{cabinetId:'missing',language:'en'}),{message:translatePrintText('Шкаф не найден.','en')});
});

test('each assembly card uses exactly one straight segment ending on its panel, with cards ordered by anchor height',()=>{
  const project=twoCabinets(),parts=generateParts(project);
  for(const cabinet of project.cabinets)for(let page=1;page<=getAssemblyPageCount(project,{cabinetId:cabinet.id});page++){
    const svg=createAssemblySvg(project,{cabinetId:cabinet.id,page,language:'en'}),columns=[[],[]];
    const groups=[...svg.matchAll(/<g data-assembly-callout="(P\d+)"([^>]*)>([\s\S]*?)<\/g>/g)];
    assert.ok(groups.length>0);
    for(const [,code,attributes,content] of groups){
      const attribute=name=>attributes.match(new RegExp(`${name}="([^"]+)"`))[1],anchor=attribute('data-assembly-anchor').split(',').map(Number),connection=attribute('data-assembly-connection').split(',').map(Number);
      const x=Number(attribute('data-label-x')),y=Number(attribute('data-label-y')),width=Number(attribute('data-label-width')),height=Number(attribute('data-label-height'));
      const paths=[...content.matchAll(/<path\b[^>]*>/g)];
      assert.equal(paths.length,1,'there is no elbow or second dashed connector behind a card');
      assert.ok(paths[0][0].includes(`data-assembly-leader="${code}"`));
      assert.equal(paths[0][0].match(/ d="([^"]+)"/)[1],`M${connection.join(',')} L${anchor.join(',')}`,'one M and one L identify the actual card and panel endpoints');
      assert.doesNotMatch(paths[0][0],/stroke-dasharray/);
      assert.deepEqual(connection,[x<560?x+width:x,y+height/2],'the line starts at the inner card edge');
      const dot=content.match(/<circle\b[^>]*>/)[0];
      assert.ok(dot.includes(`data-assembly-anchor-dot="${code}"`));
      assert.equal(Number(dot.match(/ cx="([^"]+)"/)[1]),anchor[0]);
      assert.equal(Number(dot.match(/ cy="([^"]+)"/)[1]),anchor[1]);
      assert.ok(Number(dot.match(/ r="([^"]+)"/)[1])>=3,'the panel endpoint remains distinguishable');
      assert.match(dot,/stroke="white"/);
      columns[x<560?0:1].push({y,anchorY:anchor[1]});
    }
    for(const column of columns){
      const ordered=column.sort((a,b)=>a.y-b.y);
      for(let i=1;i<ordered.length;i++)assert.ok(ordered[i].anchorY>=ordered[i-1].anchorY,'card and anchor order agree on each side');
    }
  }
});

test('assembly separates fully hidden small panels so every leader ends on an exposed face of its own part',()=>{
  const inside=(point,vertices)=>{let result=false;for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){const a=vertices[i],b=vertices[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
  for(const project of [twoCabinets(),createDefaultProject('en')]){
    const parts=generateParts(project);
    for(const cabinet of project.cabinets)for(let page=1;page<=getAssemblyPageCount(project,{cabinetId:cabinet.id});page++){
      const svg=createAssemblySvg(project,{cabinetId:cabinet.id,page,language:'tr'});
      const faces=[...svg.matchAll(/<polygon data-assembly-part="(P\d+)"[^>]*points="([^"]+)"/g)].map(([,code,points])=>({code,points:points.split(' ').map(point=>point.split(',').map(Number))}));
      for(const [,code,point] of svg.matchAll(/data-assembly-callout="(P\d+)"[^>]*data-assembly-anchor="([^"]+)"/g)){
        const anchor=point.split(',').map(Number);
        const own=faces.flatMap((face,index)=>face.code===code&&inside(anchor,face.points)?[index]:[]);
        assert.ok(own.length,`${code}: the dot is inside the identified finished panel`);
        assert.ok(own.some(index=>!faces.slice(index+1).some(face=>face.code!==code&&inside(anchor,face.points))),`${code}: a later-painted door or divider cannot cover the chosen endpoint`);
      }
    }
  }
});

test('the five drawer box panels and matching facade stay on one assembly sheet for external, internal, tree and legacy drawers',()=>{
  const legacy=createDefaultProject('en');delete legacy.cabinets[0].layout;Object.assign(legacy.cabinets[0],{drawers:3,doors:0,shelves:0});
  let drawerCount=0;
  for(const project of [createDefaultProject('en'),twoCabinets(),createInteriorExample('en'),legacy]){
    const parts=generateParts(project),before=structuredClone(project);
    for(const cabinet of project.cabinets){
      const pageByCode=new Map(),count=getAssemblyPageCount(project,{cabinetId:cabinet.id});
      for(let page=1;page<=count;page++){
        const svg=createAssemblySvg(project,{cabinetId:cabinet.id,page,language:'en'}),codes=[...svg.matchAll(/data-assembly-callout="(P\d+)"/g)].map(match=>match[1]);
        assert.ok(codes.length<=12,'complete boxes retain the twelve-panel readability limit');
        for(const code of codes){assert.ok(!pageByCode.has(code),'each production panel appears on one sheet');pageByCode.set(code,page);}
      }
      const expected=parts.flatMap((part,index)=>part.cabinetId===cabinet.id?[productionPartCode(index)]:[]);
      assert.deepEqual([...pageByCode.keys()].sort(),expected.sort());
      const boxes=new Map();
      parts.forEach((part,index)=>{
        if(part.cabinetId!==cabinet.id||part.role!=='external-drawer-box'&&!part.role?.startsWith('internal-drawer'))return;
        const internal=part.role.startsWith('internal-drawer'),key=JSON.stringify([internal,part.sectionId,part.interiorSectionId,internal?part.internalDrawerIndex:part.drawerIndex]);
        const box=boxes.get(key)||[];box.push({part,index});boxes.set(key,box);
      });
      for(const box of boxes.values()){
        const internal=box[0].part.role.startsWith('internal-drawer');
        assert.equal(box.length,internal?6:5,'every emitted box has both sides, front, rear and bottom');
        assert.ok(box.some(({part})=>part.name.endsWith(' · дно')),'drawer bottom remains an actual production part');
        if(!internal){
          const index=box[0].index-1,facade=parts[index];
          assert.match(facade.name,new RegExp(`Фасад ящика ${box[0].part.drawerIndex+1}$`));
          box.unshift({part:facade,index});
        }
        const pages=new Set(box.map(({index})=>pageByCode.get(productionPartCode(index))));
        assert.equal(pages.size,1,'bottom, all four walls and facade are visible on the same assembly sheet');drawerCount++;
      }
    }
    assert.deepEqual(project,before,'semantic grouping never changes production geometry');
  }
  assert.ok(drawerCount>=10,'fixtures cover several drawer indices and all placement variants');
});

test('straight assembly leaders avoid intersections, merged dots and passing through another panel dot',()=>{
  const orientation=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
  for(const project of [createDefaultProject('en'),twoCabinets(),createInteriorExample('en')])for(const cabinet of project.cabinets)for(let page=1;page<=getAssemblyPageCount(project,{cabinetId:cabinet.id});page++){
    const svg=createAssemblySvg(project,{cabinetId:cabinet.id,page,language:'en'});
    const leaders=[...svg.matchAll(/data-assembly-callout="(P\d+)"[^>]*data-assembly-anchor="([^"]+)" data-assembly-connection="([^"]+)"/g)].map(([,code,anchor,connection])=>({code,a:connection.split(',').map(Number),b:anchor.split(',').map(Number)}));
    for(let i=0;i<leaders.length;i++)for(let j=i+1;j<leaders.length;j++){
      const a=leaders[i],b=leaders[j],crossing=orientation(a.a,a.b,b.a)*orientation(a.a,a.b,b.b)<-.001&&orientation(b.a,b.b,a.a)*orientation(b.a,b.b,a.b)<-.001;
      assert.equal(crossing,false,`${a.code}/${b.code}: the two straight segments cannot cross`);
      assert.ok(Math.hypot(a.b[0]-b.b[0],a.b[1]-b.b[1])>=7.6,'panel dots cannot merge');
      assert.ok(distance(a.b,b.a,b.b)>=3.8&&distance(b.b,a.a,a.b)>=3.8,'a leader cannot pass through another panel dot');
    }
  }
});

test('ordinary assembly names wrap at word boundaries in Turkish, Russian and English instead of splitting panel names',()=>{
  const project=createInteriorExample('en'),parts=generateParts(project);
  for(const language of ['tr','ru','en'])for(let page=1;page<=getAssemblyPageCount(project);page++){
    const svg=createAssemblySvg(project,{page,language});
    for(const [,code,body] of svg.matchAll(/<g data-assembly-callout="(P\d+)"[^>]*>([\s\S]*?)<\/g>/g)){
      const labels=[...body.matchAll(/<text[^>]*font-size="13"[^>]*>([^<]*)<\/text>/g)].map(match=>match[1]);
      assert.ok(labels.length<=2,'a name keeps the reserved two-line height');
      const part=parts[Number(code.slice(1))-1],words=new Set(translatePartName(part.name,language).match(/[\p{L}\p{N}]+/gu));
      for(const label of labels)for(const word of label.match(/[\p{L}\p{N}]+/gu)||[])assert.ok(words.has(word),`${language}/${code}: ${word} must be a complete name word`);
      assert.ok(body.includes(translatePartName(part.name,language)),'the full name remains in the accessible card title');
    }
  }
});
