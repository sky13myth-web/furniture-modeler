/** Screen-only SVG navigation. Document dimensions and exports stay in mm. */
export class DrawingZoom {
  constructor(root) {
    this.root=root; this.viewport=root.querySelector('.drawing-viewport');
    this.paper=root.querySelector('.drawing-paper'); this.scale=1;
    this.output=root.querySelector('[data-drawing-scale]');
    this.onClick=e=>{const button=e.target.closest('[data-zoom]');if(!button)return;const action=button.dataset.zoom;action==='fit'?this.fit():this.zoom(this.scale*(action==='in'?1.25:.8));};
    this.onWheel=e=>{if(!this.paper.querySelector('svg'))return;e.preventDefault();this.zoom(this.scale*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);};
    this.onDown=e=>{if(e.button!==0||!this.paper.querySelector('svg')||e.target.closest('[data-inspection-marker]'))return;this.drag={x:e.clientX,y:e.clientY,left:this.viewport.scrollLeft,top:this.viewport.scrollTop};this.viewport.setPointerCapture(e.pointerId);this.viewport.classList.add('dragging');};
    this.onMove=e=>{if(this.drag){this.viewport.scrollLeft=this.drag.left+this.drag.x-e.clientX;this.viewport.scrollTop=this.drag.top+this.drag.y-e.clientY;}};
    this.onUp=()=>{this.drag=null;this.viewport.classList.remove('dragging');};
    this.onKey=e=>{if(['+','=','-','0'].includes(e.key)){e.preventDefault();e.key==='0'?this.fit():this.zoom(this.scale*(e.key==='-'?.8:1.25));}};
    root.addEventListener('click',this.onClick); this.viewport.addEventListener('wheel',this.onWheel,{passive:false});
    for(const [event,handler] of [['pointerdown',this.onDown],['pointermove',this.onMove],['pointerup',this.onUp],['pointercancel',this.onUp],['keydown',this.onKey]])this.viewport.addEventListener(event,handler);
    this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(this.viewport);this.layout();
  }
  layout() {
    const svg=this.paper.querySelector('svg'),box=svg?.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
    const ratio=box?.[2]>0&&box?.[3]>0?box[2]/box[3]:1;
    const availableWidth=Math.max(1,this.viewport.clientWidth-20),availableHeight=Math.max(1,this.viewport.clientHeight-20);
    const width=Math.min(availableWidth,availableHeight*ratio)*this.scale;
    this.paper.style.width=`${width}px`;this.paper.style.height=`${width/ratio}px`;
    if(this.output)this.output.textContent=`${Math.round(this.scale*100)}%`;
    for(const button of this.root.querySelectorAll('[data-zoom]'))button.disabled=!svg||(button.dataset.zoom==='in'&&this.scale>=8)||(button.dataset.zoom==='out'&&this.scale<=.5);
  }
  zoom(value,clientX,clientY) {
    const viewport=this.viewport.getBoundingClientRect(),before=this.paper.getBoundingClientRect();
    clientX??=viewport.left+this.viewport.clientWidth/2;clientY??=viewport.top+this.viewport.clientHeight/2;
    const x=(clientX-before.left)/Math.max(1,before.width),y=(clientY-before.top)/Math.max(1,before.height);
    this.scale=Math.max(.5,Math.min(8,value));this.layout();
    const after=this.paper.getBoundingClientRect();
    this.viewport.scrollLeft+=after.left+x*after.width-clientX;
    this.viewport.scrollTop+=after.top+y*after.height-clientY;
  }
  fit(){this.scale=1;this.layout();this.viewport.scrollLeft=0;this.viewport.scrollTop=0;}
  destroy(){this.observer.disconnect();this.root.removeEventListener('click',this.onClick);this.viewport.removeEventListener('wheel',this.onWheel);for(const [event,handler] of [['pointerdown',this.onDown],['pointermove',this.onMove],['pointerup',this.onUp],['pointercancel',this.onUp],['keydown',this.onKey]])this.viewport.removeEventListener(event,handler);}
}

export function drawingZoomMarkup(svg) {
  return `<div class="drawing-navigation"><div class="drawing-zoom-tools" role="toolbar" aria-label="Масштаб чертежа"><button class="button" data-zoom="out" aria-label="Отдалить чертёж">−</button><output data-drawing-scale>100%</output><button class="button" data-zoom="in" aria-label="Приблизить чертёж">+</button><button class="button" data-zoom="fit">Уместить чертёж</button></div><div class="drawing-viewport" tabindex="0" role="region" aria-label="Область чертежа"><div class="drawing-paper">${svg}</div></div><p class="drawing-navigation-hint">Колесо — масштаб · перетаскивание — перемещение</p></div>`;
}
