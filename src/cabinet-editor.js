import { getCabinetLayout, getFrontLayout, generateParts } from './engine.js';
import { resizeApplianceDivider } from './appliance-constraints.js';

const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = v => Math.round(Number(v) * 10) / 10;
const labels = {open:'Открытая секция',doors:'Двери',drawers:'Ящики'};

/** Direct front elevation editor; all hit targets use real millimetres. */
export class CabinetEditor {
  constructor(container, {onSelect=()=>{}, onResize=()=>{}}={}) {
    this.container=container; this.onSelect=onSelect; this.onResize=onResize;
    this.zoom=1; this.pan={x:0,y:0}; this.selectedId=null;
    this.onDown=e=>this.pointerDown(e);this.onMove=e=>this.pointerMove(e);this.onUp=e=>this.pointerUp(e);
    this.onCancel=()=>{this.drag=null;this.draft=null;this.render();};
    container.addEventListener('pointerdown',this.onDown);
    container.addEventListener('pointermove',this.onMove);
    container.addEventListener('pointerup',this.onUp);
    container.addEventListener('pointercancel',this.onCancel);
    this.onWheel=e=>{if(!this.cabinet)return;e.preventDefault();this.zoom=Math.max(.65,Math.min(4,this.zoom*Math.exp(-e.deltaY*.001)));this.render();};
    container.addEventListener('wheel',this.onWheel,{passive:false});
    this.resizeObserver=new ResizeObserver(()=>this.render());this.resizeObserver.observe(container);
  }
  setProject(project,cabinetId,selectedId) {
    if(cabinetId!==this.cabinet?.id){this.zoom=1;this.pan={x:0,y:0};}
    this.project=project;this.cabinet=project.cabinets.find(c=>c.id===cabinetId);this.selectedId=selectedId;
    this.render();
  }
  reset(){this.zoom=1;this.pan={x:0,y:0};this.render();}
  screenPoint(e){const svg=this.container.querySelector('svg');const matrix=svg?.getScreenCTM();if(!matrix)return{x:0,y:0};const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return{x:point.x,y:point.y};}
  render(){
    const c=this.draft?.cabinets.find(c=>c.id===this.cabinet?.id)||this.cabinet;
    const project=this.draft||this.project;
    if(!c){this.container.innerHTML='<div class="empty-state"><h2>Начните со шкафа</h2><p>Нажмите «Добавить шкаф» слева, затем разделите его на секции.</p></div>';return;}
    const layout=getCabinetLayout(c,project), H=c.height,W=c.width;
    this.layout=layout;
    const padding=Math.max(160,H*.10,W*.09);
    const viewW=(W+padding*2)/this.zoom,viewH=(H+padding*2)/this.zoom;
    const vx=W/2-viewW/2+this.pan.x,vy=H/2-viewH/2+this.pan.y;
    const scale=Math.min(Math.max(100,this.container.clientWidth)/viewW,Math.max(100,this.container.clientHeight)/viewH);
    const font=Math.max(15,12/Math.max(.04,scale));
    const y=(local,h=0)=>H-c.plinth-local-h;
    const fronts=getFrontLayout(c,project);
    let content=`<defs><pattern id="designer-paper" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" stroke="#e6e9e2" stroke-width="${1/scale}" fill="none"/></pattern></defs>`;
    content+=`<rect x="${vx}" y="${vy}" width="${viewW}" height="${viewH}" fill="#f5f6f0"/><rect x="0" y="0" width="${W}" height="${H}" fill="#fffef9" stroke="#617061" stroke-width="${1.3/scale}"/>`;
    const t=layout.thickness;
    const actualParts=generateParts({...project,cabinets:[c]});
    for(const p of actualParts.filter(p=>/^(Боковина|Крышка|Дно корпуса|Цокольная|Возвратная)/.test(p.name))){
      if(!p.position){if(/^Цокольная/.test(p.name))content+=`<rect x="${c.gap||2}" y="${H-c.plinth}" width="${W-2*(c.gap||2)}" height="${p.finishedHeight??p.height}" fill="#d6dccf"/>`;continue;}
      const pw=p.finishedWidth??p.width,ph=p.finishedHeight??p.height;
      const w=p.orientation==='vertical-depth'?p.thickness:pw,h=p.orientation==='horizontal'?p.thickness:ph;
      content+=`<rect x="${p.position.x}" y="${y(p.position.y,h)}" width="${w}" height="${h}" fill="${/^Цокольная/.test(p.name)?'#d6dccf':'#dce1d5'}"/>`;
    }
    layout.sections.forEach((s,i)=>{
      const selected=s.id===this.selectedId, node=s.node;
      const fill=selected?'#e4eedf':node.front==='drawers'?'#ede7da':'#fbfcf5';
      content+=`<g data-node="${escape(s.id)}" class="cabinet-section ${selected?'is-selected':''}" tabindex="0" role="button" aria-label="Секция ${i+1}: ${escape(labels[node.front]||labels.open)}, ${n(s.width)} на ${n(s.height)} мм"><rect x="${s.x}" y="${y(s.y,s.height)}" width="${s.width}" height="${s.height}" fill="${fill}" stroke="${selected?'#3d7957':'#d2dacf'}" stroke-width="${(selected?2:1)/scale}"/>`;
      if(node.front==='doors'){
        const doors=fronts.filter(f=>f.sectionId===s.id&&f.kind==='door');
        doors.forEach(f=>{const opening=f.opening??(f.index%2?'right':'left'),x=f.x,yy=y(f.y,f.height),w=f.width,h=f.height,pad=Math.min(20,w*.08,h*.08);const points=opening==='up'?`${x+pad},${yy+h-pad} ${x+w/2},${yy+pad} ${x+w-pad},${yy+h-pad}`:opening==='right'?`${x+pad},${yy+pad} ${x+w-pad},${yy+h/2} ${x+pad},${yy+h-pad}`:`${x+w-pad},${yy+pad} ${x+pad},${yy+h/2} ${x+w-pad},${yy+h-pad}`;content+=`<polyline data-door-opening="${opening}" points="${points}" fill="none" stroke="#a9b99c" stroke-width="${.8/scale}" stroke-dasharray="${5/scale} ${4/scale}" opacity=".7"/>`;});
      }
      if(node.front==='drawers'){
        fronts.filter(f=>f.sectionId===s.id&&f.kind==='drawer').forEach(f=>{
          const yy=y(f.y,f.height);
          content+=`<rect x="${s.x+4}" y="${yy}" width="${s.width-8}" height="${f.height}" fill="none" stroke="#b5bfaa" stroke-width="${.8/scale}"/><path d="M${s.x+s.width*.4} ${yy+f.height*.3}h${s.width*.2}" stroke="#96a087" stroke-width="${1.6/scale}"/>`;
        });
      }
      const shelfCount=Math.min(20,Number(node.shelves)||0);
      for(let j=1;j<=shelfCount;j++)content+=`<path d="M${s.x} ${y(s.y+s.height*j/(shelfCount+1))}h${s.width}" stroke="#ccd4c4" stroke-width="${Math.max(1/scale,t*.5)}"/>`;
      const title=node.appliance?.label||(node.front==='drawers'?`${node.drawers||1} ящика`:node.front==='doors'?`${node.doors||1} двери`:(shelfCount?'Полки':'Открыто'));
      if(s.height*scale>42&&s.width*scale>62){
        const midY=y(s.y,s.height)+s.height/2;
        content+=`<rect x="${s.x+s.width*.06}" y="${midY-font*1.2}" width="${s.width*.88}" height="${font*2.5}" rx="${font*.25}" fill="${fill}" opacity=".94"/><text x="${s.x+s.width/2}" y="${midY-font*.15}" font-size="${font}" text-anchor="middle" fill="${selected?'#2d6848':'#7e8d73'}">${escape(title)}</text><text x="${s.x+s.width/2}" y="${midY+font*1.15}" font-size="${font*.82}" text-anchor="middle" fill="#97a58a">Проём ${n(s.width)} × ${n(s.height)}</text>`;
      }
      if(node.back==='none'||(c.includeBack===false&&node.back!=='panel'))content+=`<text x="${s.x+font*.5}" y="${y(s.y,s.height)+font}" font-size="${font*.7}" fill="#a1aa94">без задника</text>`;
      if(node.floor==='open')content+=`<text x="${s.x+s.width/2}" y="${y(s.y)-font*.4}" font-size="${font*.7}" text-anchor="middle" fill="#718d63">Открыто до пола</text>`;
      if(node.pullOutShelf)content+=`<path d="M${s.x+font*.3} ${y(s.y)-font*.7}h${Math.max(0,s.width-font*.6)}" stroke="#a7875d" stroke-width="${3/scale}"/><text x="${s.x+s.width/2}" y="${y(s.y)-font*1.05}" font-size="${font*.7}" text-anchor="middle" fill="#a7875d">Выдвижная полка</text>`;
      content+='</g>';
    });
    // A divider is a generous hit target with a thin visible handle.
    layout.partitions.forEach(p=>{
      const data=this.dividerData(p,layout);
      if(!data)return;
      const x=p.x,yy=y(p.y,p.height),hit=9/scale;
      content+=`<g data-divider="${escape(p.id)}" data-resize-node="${escape(data.nodeId)}" data-axis="${p.axis}" class="cabinet-divider ${p.axis==='horizontal'?'horizontal':'vertical'}"><rect x="${x}" y="${yy}" width="${p.width}" height="${p.height}" fill="#ced8c4"/>${p.axis==='horizontal'?`<rect x="${x}" y="${yy-hit/2}" width="${p.width}" height="${p.height+hit}" fill="transparent"/><path d="M${x+p.width*.45} ${yy+p.height/2}h${p.width*.1}" stroke="#7f9772" stroke-width="${2/scale}"/>`:`<rect x="${x-hit/2}" y="${yy}" width="${p.width+hit}" height="${p.height}" fill="transparent"/><path d="M${x+p.width/2} ${yy+p.height*.45}v${p.height*.1}" stroke="#7f9772" stroke-width="${2/scale}"/>`}</g>`;
    });
    const off=font*2.5;
    content+=`<g stroke="#9aab8a" stroke-width="${.8/scale}" fill="none"><path d="M0 ${H+off*.35}v${off*.8}M${W} ${H+off*.35}v${off*.8}M0 ${H+off*.75}H${W}"/><path d="M${-off*.35} 0H${-off*1.1}M${-off*.35} ${H}H${-off*1.1}M${-off*.75} 0V${H}"/></g><text x="${W/2}" y="${H+off*.72}" font-size="${font}" fill="#768d65" text-anchor="middle" paint-order="stroke" stroke="#f5f6f0" stroke-width="${font*.45}">${n(W)} мм</text><text x="${-off*.75}" y="${H/2}" font-size="${font}" fill="#768d65" text-anchor="middle" transform="rotate(-90 ${-off*.75} ${H/2})" paint-order="stroke" stroke="#f5f6f0" stroke-width="${font*.45}">${n(H)} мм</text>`;
    this.container.innerHTML=`<svg class="cabinet-plan" viewBox="${vx} ${vy} ${viewW} ${viewH}" aria-label="Редактор секций шкафа" xmlns="http://www.w3.org/2000/svg">${content}</svg><div class="editor-hint">${c.layout?'Выберите секцию · перетаскивайте перегородки · колесо — масштаб':'Для свободной схемы нажмите «Редактировать секции»'}</div>`;
  }
  dividerData(partition,layout){
    if(partition.beforeChildId){const entry=layout.nodes.find(n=>n.id===partition.beforeChildId);if(entry)return{nodeId:entry.id,entry};}
    // Find the split whose divider sits on this exact geometric boundary.
    for(const entry of layout.nodes){
      const node=entry.node;if(node.kind!=='split'||node.axis!==partition.axis)continue;
      const children=node.children.map(child=>layout.nodes.find(e=>e.id===child.id)).filter(Boolean);
      for(let i=0;i<children.length-1;i++){
        const child=children[i],pos=node.axis==='horizontal'?child.y-layout.thickness:child.x+child.width;
        if(Math.abs(pos-(node.axis==='horizontal'?partition.y:partition.x))<.1)return{nodeId:child.id,entry:child};
      }
    }
    return null;
  }
  pointerDown(e){
    if(!this.cabinet)return;
    const target=e.target.closest('[data-divider],[data-node]');
    if(target?.dataset.divider){
      e.preventDefault();this.container.setPointerCapture(e.pointerId);
      const entry=this.layout.nodes.find(s=>s.id===target.dataset.resizeNode);if(!entry)return;
      this.drag={kind:'divider',id:entry.id,axis:target.dataset.axis,initial:this.screenPoint(e),size:target.dataset.axis==='horizontal'?entry.height:entry.width};
      this.draft=structuredClone(this.project);
    }else if(e.shiftKey||e.button===1){e.preventDefault();this.container.setPointerCapture(e.pointerId);this.drag={kind:'pan',initial:this.screenPoint(e),matrix:this.container.querySelector('svg').getScreenCTM().inverse(),pan:{...this.pan}};}
    else if(target?.dataset.node)this.onSelect(target.dataset.node);
  }
  pointerMove(e){
    if(!this.drag)return;const point=this.drag.kind==='pan'?new DOMPoint(e.clientX,e.clientY).matrixTransform(this.drag.matrix):this.screenPoint(e);
    if(this.drag.kind==='pan'){this.pan.x=this.drag.pan.x-(point.x-this.drag.initial.x);this.pan.y=this.drag.pan.y-(point.y-this.drag.initial.y);this.render();return;}
    const delta=this.drag.axis==='horizontal'?point.y-this.drag.initial.y:point.x-this.drag.initial.x;
    const size=Math.round((this.drag.size+delta)/5)*5;
    this.draft=structuredClone(this.project);
    const c=this.draft.cabinets.find(c=>c.id===this.cabinet.id);
    const result=resizeApplianceDivider(c,this.drag.id,this.drag.axis,size,this.draft);
    if(result.possible){Object.assign(c,result.cabinet);const accepted=getCabinetLayout(c,this.draft).nodes.find(node=>node.id===this.drag.id);this.drag.value=accepted?.[this.drag.axis==='horizontal'?'height':'width'];this.render();}
    else {this.draft=null;this.render();}
  }
  pointerUp(){if(!this.drag)return;const drag=this.drag;this.drag=null;this.draft=null;if(drag.kind==='divider'&&Number.isFinite(drag.value))this.onResize(drag.id,drag.axis,drag.value);else this.render();}
  destroy(){this.resizeObserver.disconnect();this.container.removeEventListener('pointerdown',this.onDown);this.container.removeEventListener('pointermove',this.onMove);this.container.removeEventListener('pointerup',this.onUp);this.container.removeEventListener('pointercancel',this.onCancel);this.container.removeEventListener('wheel',this.onWheel);}
}
