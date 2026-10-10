import { getRoomOutline, polygonArea, polygonIsSimple, cabinetFootprint } from './room-geometry.js';
import { applyTranslations } from './i18n.js';
import { resolveCabinetMovement, canApplyCabinetMovement } from './cabinet-motion.js';
import { canPlaceCabinet } from './engine.js';
import { resizeCabinetOnPlan } from './cabinet-plan-resize.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clonePoints = points => points.map(({ x, z }) => ({ x, z }));
const snap = value => Math.max(-20000, Math.min(20000, Math.round(value / 10) * 10));
const number = value => Number.isFinite(value) ? value : 0;
const fmt = value => Math.round(value).toLocaleString('ru-RU');
const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#bfcdbf';
const legacyWalls = { back: 0, right: 1, front: 2, left: 3 };

/** Small, independent 2D room plan. A pointer gesture commits only on release. */
export class RoomEditor {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.project = { room: { width: 4200, depth: 3400, windows: [] }, cabinets: [], materials: [] };
    this.outline = getRoomOutline(this.project.room);
    this.selectedWall = 0;
    this.selectedCorner = null;
    this.selectedCorners = new Set();
    this.selectedCabinetId = null;
    this.selectedWindowId = null;
    this.drag = null;
    this.hint = '';
    this.zoom = 1;
    this.camera = null;
    this.spacePressed = false;
    this.root = container.ownerDocument.createElement('div');
    this.root.className = 'room-editor';
    this.root.tabIndex = 0;
    this.container.append(this.root);
    this.window = container.ownerDocument.defaultView;
    this._pointerDown = event => this.pointerDown(event);
    this._pointerMove = event => this.pointerMove(event);
    this._pointerUp = event => this.pointerUp(event);
    this._pointerCancel = event => this.pointerCancel(event);
    this._click = event => this.click(event);
    this._keyDown = event => this.keyDown(event);
    this._keyUp = event => this.keyUp(event);
    this._blur = () => {this.spacePressed=false;if(this.drag?.type==='pan')this.pointerCancel({pointerId:this.drag.pointerId});else if(!this.destroyed)this.render();};
    this._wheel = event => this.wheel(event);
    this.root.addEventListener('pointerdown', this._pointerDown);
    this.root.addEventListener('click', this._click);
    this.root.addEventListener('keydown', this._keyDown);
    this.root.addEventListener('wheel', this._wheel, {passive:false});
    this.window.addEventListener('pointermove', this._pointerMove, { passive: false });
    this.window.addEventListener('pointerup', this._pointerUp);
    this.window.addEventListener('pointercancel', this._pointerCancel);
    this.window.addEventListener('keyup', this._keyUp);
    this.window.addEventListener('blur', this._blur);
    this.render();
    const Observer = this.window?.ResizeObserver || globalThis.ResizeObserver;
    if (typeof Observer === 'function') {
      this.resizeObserver = new Observer(() => { if (!this.destroyed) this.render(); });
      this.resizeObserver.observe(this.root);
    }
  }

  setProject(project, selectedCabinetId) {
    this.project = project || this.project;
    this.outline = getRoomOutline(this.project.room);
    if (selectedCabinetId !== undefined) this.selectedCabinetId = selectedCabinetId;
    if (this.selectedWall >= this.outline.length) this.selectedWall = 0;
    if (this.selectedCorner >= this.outline.length) this.selectedCorner = null;
    this.selectedCorners = new Set(this.getSelectedCorners().filter(index=>index<this.outline.length));
    if (!(this.project.room?.windows || []).some(w => w.id === this.selectedWindowId)) this.selectedWindowId = null;
    this.render();
  }

  setSelectedWall(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.outline.length) return;
    this.selectedCabinetId = null;
    if (index !== this.selectedWall) { this.selectedCorner = null; this.selectedCorners=new Set();this.selectedWindowId = null; }
    this.selectedWall = index;
    this.render();
  }

  setSelectedWindow(id) {
    const window = (this.project.room?.windows || []).find(w => w.id === id);
    this.selectedWindowId = window?.id || null;
    if (window) {
      const index = Number.isInteger(window.wallIndex) ? window.wallIndex : legacyWalls[window.wall];
      if (Number.isInteger(index)) this.selectedWall = index;
      this.selectedCorner = null;
      this.selectedCorners = new Set();
    }
    this.render();
  }

  addCorner() {
    if (this.outline.length >= 40) { this.hint = 'В плане может быть не более 40 углов.'; this.render(); return false; }
    const index = this.selectedWall, a = this.outline[index], b = this.outline[(index + 1) % this.outline.length];
    const next = clonePoints(this.outline);
    next.splice(index + 1, 0, { x: snap((a.x + b.x) / 2), z: snap((a.z + b.z) / 2) });
    if (!this.applyOutline(next, { kind: 'insert', index: index + 1, wallIndex: index })) return false;
    this.selectedCorner = index + 1;
    this.selectedCorners = new Set([index+1]);
    this.selectedWall = index + 1;
    this.hint = 'Перетяните новый угол, чтобы сделать нишу или выступ.';
    this.callbacks.onSelectCorner?.(index + 1);
    this.render();
    return true;
  }

  removeCorner() {
    return this.removeSelectedCorners();
  }

  getSelectedCorners() {
    const indices=this.selectedCorners?.size?[...this.selectedCorners]:Number.isInteger(this.selectedCorner)?[this.selectedCorner]:[];
    return [...new Set(indices)].filter(index=>Number.isInteger(index)&&index>=0&&index<this.outline.length).sort((a,b)=>a-b);
  }

  setSelectedCorners(indices, notify = true) {
    this.selectedCorners=new Set(indices.filter(index=>Number.isInteger(index)&&index>=0&&index<this.outline.length));
    this.selectedCorner=[...this.selectedCorners].sort((a,b)=>a-b)[0] ?? null;
    this.selectedWindowId=null;this.selectedCabinetId=null;
    if(this.selectedCorner!==null)this.selectedWall=this.selectedCorner;
    if(notify){
      this.callbacks.onSelectCorners?.(this.getSelectedCorners());
      if(this.selectedCorner!==null)this.callbacks.onSelectCorner?.(this.selectedCorner);
      else this.callbacks.onSelectWall?.(this.selectedWall);
    }
    this.render();
  }

  removeSelectedCorners() {
    const indices=this.getSelectedCorners();
    if(!indices.length)return false;
    if(this.outline.length-indices.length<3){this.hint='В плане должны остаться минимум три угла.';this.render();return false;}
    const selected=new Set(indices), next=clonePoints(this.outline).filter((_,index)=>!selected.has(index));
    if(!polygonIsSimple(next)){this.hint='После удаления углов стены пересекаются. Изменение не сохранено.';this.render();return false;}
    const index=indices[0], previous=this.getSelectedCorners();
    this.selectedCorner = null;
    this.selectedCorners=new Set();
    const metadata=indices.length===1?{kind:'remove',index,wallIndex:(index+next.length-1)%next.length}:{kind:'remove-many',indices,wallIndex:Math.max(0,index-1)};
    if (!this.applyOutline(next,metadata)) {this.selectedCorners=new Set(previous);this.selectedCorner=previous[0];this.render();return false;}
    this.selectedWall = Math.min(index, next.length - 1);
    this.callbacks.onSelectWall?.(this.selectedWall);
    this.render();
    return true;
  }

  keyDown(event) {
    if(event.defaultPrevented || this.drag || event.ctrlKey || event.metaKey || event.altKey)return;
    const target=event.target;
    if(target?.isContentEditable || target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]'))return;
    if((event.key===' '||event.code==='Space')&&!target?.closest?.('button')){this.spacePressed=true;event.preventDefault();this.render();return;}
    if(['+','=','-','0'].includes(event.key)){event.key==='0'?this.fitView():this.zoomBy(event.key==='-'?.8:1.25);event.preventDefault();return;}
    if(event.key==='Escape'){this.setSelectedCorners([]);event.preventDefault();return;}
    if(event.key!=='Delete' && event.key!=='Backspace')return;
    if(this.selectedWindowId && this.callbacks.onDeleteOpening){
      const id=this.selectedWindowId;
      this.selectedWindowId=null;
      if(this.callbacks.onDeleteOpening(id)===false)this.selectedWindowId=id;
      this.render();event.preventDefault();return;
    }
    if(this.getSelectedCorners().length){this.removeSelectedCorners();event.preventDefault();}
    else if(this.selectedCabinetId&&this.callbacks.onDeleteCabinet){
      const id=this.selectedCabinetId;
      this.selectedCabinetId=null;
      if(this.callbacks.onDeleteCabinet(id)===false)this.selectedCabinetId=id;
      this.render();event.preventDefault();
    }
  }

  keyUp(event) {
    if(event.key===' '||event.code==='Space'){
      this.spacePressed=false;
      if(!this.destroyed)this.render();
    }
  }

  applyOutline(next, metadata) {
    if (next.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > 20000 || Math.abs(p.z) > 20000) || !polygonIsSimple(next)) {
      this.hint = 'Стены пересекаются или угол совпал с другим. Переместите угол в свободное место.';
      this.render();
      return false;
    }
    const oldOutline = clonePoints(this.outline);
    this.outline = clonePoints(next);
    this.hint = '';
    if(this.callbacks.onChange?.(clonePoints(next), { ...metadata, oldOutline })===false){
      // The owner may reject a valid polygon when it would invalidate installed
      // cabinets. Preserve the edit's contour as well as its selection contract.
      this.outline=oldOutline;
      this.render();
      return false;
    }
    this.render();
    return true;
  }

  addFeature(kind = 'niche') {
    if (!['niche', 'protrusion'].includes(kind) || this.outline.length > 36) { this.hint = 'Для этой детали нужно место и не более 36 исходных углов.'; this.render(); return false; }
    const index = this.selectedCorner === null ? this.selectedWall : this.selectedCorner;
    const a = this.outline[index], b = this.outline[(index + 1) % this.outline.length], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 100) { this.hint = 'Для ниши или выступа выберите более длинную стену.'; this.render(); return false; }
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, inward = polygonArea(this.outline) >= 0 ? 1 : -1;
    const nx = -dz * inward, nz = dx * inward, direction = kind === 'niche' ? -1 : 1;
    const margin = Math.min(100, length * 0.15), limit = length - margin;
    const occupied = (this.project.room.windows || [])
      .filter(w => (Number.isInteger(w.wallIndex) ? w.wallIndex : legacyWalls[w.wall]) === index)
      .map(w => ({ start: Math.max(margin, w.offset - 50), end: Math.min(limit, w.offset + w.width + 50) }))
      .filter(w => w.end > w.start).sort((u, v) => u.start - v.start);
    const gaps = [];
    let cursor = margin;
    for (const span of occupied) {
      if (span.start > cursor) gaps.push({ start: cursor, end: span.start });
      cursor = Math.max(cursor, span.end);
    }
    if (cursor < limit) gaps.push({ start: cursor, end: limit });
    const candidates = gaps.filter(gap => gap.end - gap.start >= 100).map(gap => {
      const width = Math.min(600, gap.end - gap.start);
      const preferred = this.selectedCorner === null ? (length - width) / 2 : margin;
      const start = Math.max(gap.start, Math.min(gap.end - width, preferred));
      return { start, width, distance: Math.abs(start - preferred) };
    }).sort((u, v) => v.width - u.width || u.distance - v.distance);
    if (!candidates.length) { this.hint = 'На выбранной стене нет свободного места: ниша или выступ пересекли бы проём.'; this.render(); return false; }
    for (const { start, width } of candidates) {
      const p = { x: a.x + dx * start, z: a.z + dz * start }, q = { x: a.x + dx * (start + width), z: a.z + dz * (start + width) };
      for (let depth = Math.min(300, width / 2); depth >= 10; depth = Math.floor(depth / 20) * 10) {
        const next = clonePoints(this.outline);
        next.splice(index + 1, 0, p, { x: p.x + nx * depth * direction, z: p.z + nz * depth * direction }, { x: q.x + nx * depth * direction, z: q.z + nz * depth * direction }, q);
        if (next.every(v => Math.abs(v.x) <= 20000 && Math.abs(v.z) <= 20000) && polygonIsSimple(next)) {
          const newWall = index + 2;
          this.selectedCorner = null; this.selectedCorners=new Set();this.selectedWindowId = null;
          const applied = this.applyOutline(next, { kind: 'feature', feature: kind, wallIndex: index, index: index + 1 });
          if (applied) { this.selectedWall = newWall; this.callbacks.onSelectWall?.(newWall); this.render(); }
          return applied;
        }
      }
    }
    this.hint = 'Здесь ниша или выступ пересекается с другой стеной. Выберите другую стену.'; this.render(); return false;
  }

  preset(kind) {
    const points = this.outline, width = snap(Math.max(500, Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))));
    const depth = snap(Math.max(500, Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z))));
    const x = snap(width * 0.6), z = snap(depth * 0.6), niche = Math.max(100, snap(depth * 0.2));
    let next;
    if (kind === 'l') next = [{ x: 0, z: 0 }, { x: width, z: 0 }, { x: width, z }, { x, z }, { x, z: depth }, { x: 0, z: depth }];
    else if (kind === 'niche') {
      const left = snap(width / 3), right = snap(width * 2 / 3);
      next = [{ x: 0, z: niche }, { x: left, z: niche }, { x: left, z: 0 }, { x: right, z: 0 }, { x: right, z: niche }, { x: width, z: niche }, { x: width, z: depth }, { x: 0, z: depth }];
    } else next = [{ x: 0, z: 0 }, { x: width, z: 0 }, { x: width, z: depth }, { x: 0, z: depth }];
    this.selectedCorner = null;
    this.selectedCorners=new Set();
    this.selectedWall = 0;
    if (this.applyOutline(next, { kind: 'preset', preset: kind })) this.callbacks.onSelectWall?.(0);
  }

  click(event) {
    const button = event.target.closest('button');
    if (!button || !this.root.contains(button)) return;
    if(button.dataset.roomZoom){this.root.focus?.({preventScroll:true});button.dataset.roomZoom==='fit'?this.fitView():this.zoomBy(button.dataset.roomZoom==='in'?1.25:.8);return;}
    if (button.dataset.roomAction === 'add-corner') this.addCorner();
    if (button.dataset.roomAction === 'remove-corner') this.removeCorner();
    if (button.dataset.roomPreset) this.preset(button.dataset.roomPreset);
  }

  toPlan(event) {
    const svg = this.root.querySelector('svg');
    if (!svg) return null;
    const matrix = svg.getScreenCTM?.();
    if (matrix && typeof svg.createSVGPoint === 'function') {
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const transformed = point.matrixTransform(matrix.inverse());
      return { x: transformed.x, z: transformed.y };
    }
    const bounds = svg.getBoundingClientRect(), box = this.viewBox;
    if (!bounds.width || !bounds.height) return null;
    const scale = Math.min(bounds.width / box.width, bounds.height / box.depth);
    return { x: (event.clientX - bounds.left - (bounds.width - box.width * scale) / 2) / scale + box.x, z: (event.clientY - bounds.top - (bounds.height - box.depth * scale) / 2) / scale + box.z };
  }

  fitView() {
    if(this.drag)return false;
    this.zoom=1;this.camera=null;
    this.render();
    return true;
  }

  zoomBy(factor,event=null) {
    if(this.drag||!Number.isFinite(factor)||factor<=0)return false;
    const box=this.camera||this.viewBox;
    if(!box)return false;
    const before=this.zoom||1,next=Math.max(.25,Math.min(16,before*factor));
    if(Math.abs(next-before)<1e-10)return false;
    const anchor=event?this.toPlan(event):{x:box.x+box.width/2,z:box.z+box.depth/2};
    if(!anchor)return false;
    const ratio=before/next;
    this.camera={x:anchor.x+(box.x-anchor.x)*ratio,z:anchor.z+(box.z-anchor.z)*ratio,width:box.width*ratio,depth:box.depth*ratio};
    this.zoom=next;
    this.render();
    return true;
  }

  wheel(event) {
    const plan=event.target?.closest?.('svg');
    if(!plan||!this.root.contains(plan))return;
    event.preventDefault();
    this.root.focus?.({preventScroll:true});
    if(!this.drag)this.zoomBy(Math.exp(-event.deltaY*.0015),event);
  }

  pointerDown(event) {
    if (![0,1].includes(event.button) || this.drag) return;
    const target = event.target.closest('[data-room-resize],[data-room-corner],[data-room-cabinet],[data-room-window],[data-room-wall]');
    const plan=event.target.closest('svg');
    if ((!target&&!plan) || !this.root.contains(target || plan)) return;
    event.preventDefault();
    this.root.focus?.({preventScroll:true});
    const point = this.toPlan(event);
    if (!point) return;
    const planHeight=this.root.querySelector?.('.room-plan')?.getBoundingClientRect?.().height;
    if(event.button===1||this.spacePressed){
      const box=this.camera||this.viewBox;
      if(!box)return;
      this.drag={type:'pan',pointerId:event.pointerId,startScreen:{x:event.clientX,y:event.clientY},original:{...box},scale:this.planMetrics(box).scale,moved:false};
    } else if(target?.dataset.roomResize){
      const axis=target.dataset.roomResize,id=target.dataset.roomCabinet,cabinet=this.project.cabinets.find(c=>c.id===id);
      if(!cabinet||!['width','depth'].includes(axis)||cabinet.parentId)return;
      const angle=number(cabinet.rotation)*Math.PI/180;
      this.selectedCabinetId=id;this.selectedCorner=null;this.selectedCorners=new Set();this.selectedWindowId=null;
      this.drag={type:'cabinet-resize',id,axis,pointerId:event.pointerId,start:point,originalCabinet:structuredClone(cabinet),draft:structuredClone(cabinet),direction:axis==='width'?{x:Math.cos(angle),z:Math.sin(angle)}:{x:-Math.sin(angle),z:Math.cos(angle)},moved:false};
      this.hint='';this.callbacks.onSelectCabinet?.(id);
    } else if(!target){
      this.drag={type:'selection',pointerId:event.pointerId,start:point,end:point,startScreen:{x:event.clientX,y:event.clientY},previous:this.getSelectedCorners(),draftIndices:this.getSelectedCorners(),additive:Boolean(event.shiftKey),viewBox:{...this.viewBox},moved:false};
      this.hint='';
    } else if (target.dataset.roomCorner !== undefined) {
      const index = Number(target.dataset.roomCorner);
      if(event.shiftKey){
        const selected=new Set(this.getSelectedCorners());
        if(selected.has(index))selected.delete(index);else selected.add(index);
        this.selectedCorner=null;this.selectedCorners=new Set();this.setSelectedCorners([...selected]);return;
      }
      this.selectedCorner = index;
      this.selectedCorners=new Set([index]);this.selectedCabinetId=null;
      this.selectedWall = index;
      this.selectedWindowId = null;
      this.drag = { type: 'corner', index, pointerId: event.pointerId, start: point, original: clonePoints(this.outline), draft: clonePoints(this.outline), viewBox: { ...this.viewBox }, moved: false, axis: null };
      this.hint = '';
      this.callbacks.onSelectCorner?.(index);
    } else if (target.dataset.roomWindow !== undefined) {
      const id = target.dataset.roomWindow, window = (this.project.room.windows || []).find(w => w.id === id);
      if (!window) return;
      const index = Number.isInteger(window.wallIndex) ? window.wallIndex : legacyWalls[window.wall];
      if (!Number.isInteger(index) || index < 0 || index >= this.outline.length) return;
      const a = this.outline[index], b = this.outline[(index + 1) % this.outline.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!length) return;
      this.selectedWindowId = id; this.selectedCorner = null;this.selectedCorners=new Set();this.selectedCabinetId=null;this.selectedWall = index;
      this.drag = { type: 'window', id, index, pointerId: event.pointerId, start: point, original: number(window.offset), draft: number(window.offset), direction: { x: (b.x - a.x) / length, z: (b.z - a.z) / length }, max: Math.max(0, length - number(window.width)), viewBox: { ...this.viewBox }, moved: false };
      this.callbacks.onSelectWindow?.(id);
    } else if (target.dataset.roomCabinet !== undefined) {
      const id = target.dataset.roomCabinet, cabinet = (this.project.cabinets || []).find(c => c.id === id);
      if (!cabinet) return;
      this.selectedCabinetId = id;
      this.selectedCorner = null;
      this.selectedCorners=new Set();
      this.selectedWindowId = null;
      this.callbacks.onSelectCabinet?.(id);
      if (cabinet.parentId) {
        this.hint = 'Антресоль привязана к основному шкафу. Перемещайте основной шкаф.';
        this.render();
        return;
      }
      this.hint = '';
      this.drag = { type: 'cabinet', id, pointerId: event.pointerId, start: point, lastPoint:point, original: { x: number(cabinet.x), z: number(cabinet.z) }, draft: { x: number(cabinet.x), z: number(cabinet.z) }, initialFits:canPlaceCabinet(cabinet,{...this.project,room:{...this.project.room,outline:this.outline}}), viewBox: { ...this.viewBox }, moved: false };
    } else {
      this.selectedWall = Number(target.dataset.roomWall);
      this.selectedCabinetId = null;
      this.selectedCorner = null;
      this.selectedCorners=new Set();
      this.selectedWindowId = null;
      const a = this.outline[this.selectedWall], b = this.outline[(this.selectedWall + 1) % this.outline.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!length) return;
      this.drag = { type: 'wall', index: this.selectedWall, pointerId: event.pointerId, start: point, original: clonePoints(this.outline), draft: clonePoints(this.outline), normal: { x: -(b.z - a.z) / length, z: (b.x - a.x) / length }, viewBox: { ...this.viewBox }, moved: false };
      this.callbacks.onSelectWall?.(this.selectedWall);
    }
    if (this.drag) {
      this.drag.planHeight=planHeight;
      try { this.root.setPointerCapture(event.pointerId); } catch { /* window listeners still finish the gesture */ }
    }
    this.render();
  }

  pointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    if(drag.type==='pan'){
      const dx=(event.clientX-drag.startScreen.x)/drag.scale,dz=(event.clientY-drag.startScreen.y)/drag.scale;
      this.camera={...drag.original,x:drag.original.x-dx,z:drag.original.z-dz};
      drag.moved=Math.hypot(dx,dz)>1e-6;
      this.render();return;
    }
    const point = this.toPlan(event);
    if (!point) return;
    const deltaX = point.x - drag.start.x, deltaZ = point.z - drag.start.z;
    if(drag.type==='cabinet-resize'){
      const displacement=deltaX*drag.direction.x+deltaZ*drag.direction.z;
      const result=resizeCabinetOnPlan(drag.originalCabinet,{[drag.axis]:drag.originalCabinet[drag.axis]+displacement},{...this.project,room:{...this.project.room,outline:this.outline}});
      if(result.possible){drag.draft=result.cabinet;this.hint=result.clamped?result.reason||'Размер шкафа ограничен техникой, соседней мебелью и границами помещения.':'';}
      else this.hint=result.reason||'Размер шкафа ограничен техникой, соседней мебелью и границами помещения.';
      drag.moved=Math.abs(drag.draft.width-drag.originalCabinet.width)>1e-7||Math.abs(drag.draft.depth-drag.originalCabinet.depth)>1e-7;
    } else if(drag.type==='selection'){
      drag.end=point;drag.moved=Math.hypot(event.clientX-drag.startScreen.x,event.clientY-drag.startScreen.y)>4;
      const minX=Math.min(drag.start.x,point.x),maxX=Math.max(drag.start.x,point.x),minZ=Math.min(drag.start.z,point.z),maxZ=Math.max(drag.start.z,point.z);
      const selected=this.outline.map((p,index)=>p.x>=minX&&p.x<=maxX&&p.z>=minZ&&p.z<=maxZ?index:null).filter(index=>index!==null);
      drag.draftIndices=drag.additive?[...new Set([...drag.previous,...selected])]:selected;
    } else if (drag.type === 'corner') {
      const source = drag.original[drag.index];
      if (!drag.axis && (Math.abs(deltaX) > 5 || Math.abs(deltaZ) > 5)) drag.axis = Math.abs(deltaX) >= Math.abs(deltaZ) ? 'x' : 'z';
      drag.draft[drag.index] = { x: event.altKey || drag.axis === 'x' ? snap(source.x + deltaX) : source.x, z: event.altKey || drag.axis === 'z' ? snap(source.z + deltaZ) : source.z };
      if (!event.altKey && drag.axis && (Math.abs(deltaX) > 5 || Math.abs(deltaZ) > 5)) {
        const threshold = 12 / Math.max(0.001, this.planMetrics(drag.viewBox || this.viewBox || { width: 4000, depth: 3000 }).scale);
        const axis = drag.axis, value = drag.draft[drag.index][axis];
        const neighbours = [drag.original[(drag.index + drag.original.length - 1) % drag.original.length], drag.original[(drag.index + 1) % drag.original.length]];
        const closest = neighbours.map(point => point[axis]).filter(coordinate => Math.abs(coordinate - value) <= threshold).sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
        if (closest !== undefined) drag.draft[drag.index][axis] = closest;
      }
      drag.moved = drag.draft[drag.index].x !== source.x || drag.draft[drag.index].z !== source.z;
    } else if (drag.type === 'wall') {
      const indices = [drag.index, (drag.index + 1) % drag.original.length], normal = drag.normal;
      let shift = Math.round((deltaX * normal.x + deltaZ * normal.z) / 10) * 10, min = -Infinity, max = Infinity;
      for (const index of indices) for (const axis of ['x', 'z']) {
        if (Math.abs(normal[axis]) < 1e-9) continue;
        const limits = [(-20000 - drag.original[index][axis]) / normal[axis], (20000 - drag.original[index][axis]) / normal[axis]];
        min = Math.max(min, Math.min(...limits)); max = Math.min(max, Math.max(...limits));
      }
      shift = Math.max(min, Math.min(max, shift));
      for (const index of indices) drag.draft[index] = { x: drag.original[index].x + normal.x * shift, z: drag.original[index].z + normal.z * shift };
      drag.moved = Math.abs(shift) > 1e-6;
    } else if (drag.type === 'window') {
      const along = deltaX * drag.direction.x + deltaZ * drag.direction.z;
      drag.draft = Math.max(0, Math.min(drag.max, Math.round((drag.original + along) / 10) * 10));
      drag.moved = drag.draft !== drag.original;
    } else {
      const cabinet = (this.project.cabinets || []).find(item => item.id === drag.id);
      const placementProject = { ...this.project, room: { ...this.project.room, outline: this.outline } };
      const lastPoint=drag.lastPoint||drag.start;
      const candidate={x:drag.draft.x+point.x-lastPoint.x,z:drag.draft.z+point.z-lastPoint.z};
      drag.lastPoint=point;
      const result=cabinet&&resolveCabinetMovement({...cabinet,...drag.draft},candidate,placementProject);
      if(result?.valid&&(drag.initialFits===false||result.fits)){
        drag.draft={x:result.x,z:result.z};
        this.hint=result.blocked?'Шкаф скользит вдоль препятствия. Монтажные отступы сохранены.':'';
      } else this.hint = 'Шкаф должен оставаться внутри комнаты с монтажными отступами от стен и потолка. Сохранено последнее допустимое положение.';
      drag.moved = drag.draft.x !== drag.original.x || drag.draft.z !== drag.original.z;
    }
    this.render();
  }

  pointerUp(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    try { this.root.releasePointerCapture(event.pointerId); } catch { /* optional pointer capture */ }
    if(drag.type==='selection'){this.setSelectedCorners(drag.moved?drag.draftIndices:drag.additive?drag.previous:[]);return;}
    if(drag.type==='pan'){this.render();return;}
    if (drag.moved) {
      if(drag.type==='cabinet-resize'){
        const cabinet=this.project.cabinets.find(c=>c.id===drag.id);
        const result=cabinet&&resizeCabinetOnPlan(cabinet,{width:drag.draft.width,depth:drag.draft.depth},{...this.project,room:{...this.project.room,outline:this.outline}});
        if(result?.possible)this.callbacks.onResizeCabinet?.(drag.id,{width:result.cabinet.width,depth:result.cabinet.depth});
        else this.hint=result?.reason||'Размер шкафа ограничен техникой, соседней мебелью и границами помещения.';
      } else if (drag.type === 'corner' || drag.type === 'wall') this.applyOutline(drag.draft, { kind: 'drag', index: drag.index, wallIndex: drag.type === 'wall' ? drag.index : undefined });
      else if (drag.type === 'window') this.callbacks.onMoveWindow?.(drag.id, { offset: drag.draft });
      else {
        const cabinet = (this.project.cabinets || []).find(item => item.id === drag.id);
        const placementProject={ ...this.project, room: { ...this.project.room, outline: this.outline } };
        const allowed=cabinet&&(drag.initialFits===false?canApplyCabinetMovement(cabinet,drag.draft,placementProject):canPlaceCabinet({...cabinet,...drag.draft},placementProject));
        if (allowed) this.callbacks.onMoveCabinet?.(drag.id, { ...drag.draft });
        else this.hint = 'Шкаф должен оставаться внутри комнаты с монтажными отступами от стен и потолка. Перемещение не сохранено.';
      }
    }
    this.render();
  }

  pointerCancel(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    if(this.drag.type==='pan')this.camera={...this.drag.original};
    this.drag = null;
    this.render();
  }

  planMetrics(box) {
    // SVG font sizes and radii use floor millimetres, so convert screen pixels
    // using the actual fitted scale rather than a fraction of the room width.
    const rootWidth = this.root.clientWidth || this.container?.clientWidth || 640;
    const rootHeight = this.root.clientHeight || this.container?.clientHeight || 480;
    const chrome = [['.room-toolbar', 34], ['.room-plan-hint', 42]]
      .reduce((sum, [selector, fallback]) => sum + (this.root.querySelector?.(selector)?.offsetHeight || fallback), 0);
    const rect = this.root.querySelector?.('.room-plan')?.getBoundingClientRect?.();
    const width = rect?.width > 0 ? rect.width : rootWidth;
    const height = rect?.height > 0 ? rect.height : Math.max(100, rootHeight - chrome);
    const scale = Math.max(0.001, Math.min(width / box.width, height / box.depth));
    return { scale, font: 12 / scale, cabinetFont: 11 / scale, handle: 6 / scale };
  }

  render() {
    const outline = this.drag?.type === 'corner' || this.drag?.type === 'wall' ? this.drag.draft : this.outline;
    const cabinetData = (this.project.cabinets || []).map(c => {
      if (['cabinet','cabinet-resize'].includes(this.drag?.type) && c.id === this.drag.id) return { ...c, ...this.drag.draft };
      if (this.drag?.type === 'cabinet' && c.parentId === this.drag.id) return { ...c, x: this.drag.draft.x, z: this.drag.draft.z };
      if (this.drag?.type === 'cabinet-resize' && c.parentId === this.drag.id) return { ...c, width: this.drag.draft.width, depth: this.drag.draft.depth };
      return c;
    });
    const ordered = [...cabinetData.filter(c => c.id !== this.selectedCabinetId), ...cabinetData.filter(c => c.id === this.selectedCabinetId)];
    const all = [...outline, ...cabinetData.flatMap(cabinetFootprint)];
    const minX = Math.min(0, ...all.map(p => p.x)), minZ = Math.min(0, ...all.map(p => p.z)), maxX = Math.max(500, ...all.map(p => p.x)), maxZ = Math.max(500, ...all.map(p => p.z));
    const padding = Math.max(180, Math.max(maxX - minX, maxZ - minZ) * 0.08);
    if(!this.camera){this.camera={ x: minX - padding, z: minZ - padding, width: maxX - minX + 2 * padding, depth: maxZ - minZ + 2 * padding };this.zoom=1;}
    this.viewBox = {...this.camera};
    const box = this.viewBox, { font, cabinetFont, handle } = this.planMetrics(box), outside = polygonArea(outline) >= 0 ? 1 : -1;
    const pointsText = points => points.map(p => `${p.x},${p.z}`).join(' ');
    const walls = outline.map((a, index) => {
      const b = outline[(index + 1) % outline.length], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      const nx = length ? dz / length * outside : 0, nz = length ? -dx / length * outside : 0;
      let angle = Math.atan2(dz, dx) * 180 / Math.PI;
      if (angle > 90 || angle < -90) angle += 180;
      return `<g data-room-wall="${index}" class="room-wall${index === this.selectedWall ? ' is-selected' : ''}" tabindex="0" role="button" aria-label="Стена ${index + 1}, ${fmt(length)} мм"><line class="room-wall-hit" x1="${a.x}" y1="${a.z}" x2="${b.x}" y2="${b.z}" stroke="transparent" stroke-width="20" vector-effect="non-scaling-stroke"/><line class="room-wall-line" x1="${a.x}" y1="${a.z}" x2="${b.x}" y2="${b.z}" stroke="${index === this.selectedWall ? '#16877c' : '#52695b'}" stroke-width="6" vector-effect="non-scaling-stroke"/><text class="room-length-label" transform="translate(${(a.x + b.x) / 2 + nx * font * 1.4} ${(a.z + b.z) / 2 + nz * font * 1.4}) rotate(${angle})" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="#52695b">${fmt(length)}</text></g>`;
    }).join('');
    const openings = (this.project.room?.windows || []).map(w => this.drag?.type === 'window' && w.id === this.drag.id ? { ...w, offset: this.drag.draft } : w);
    const selectedOpening = openings.find(w => w.id === this.selectedWindowId);
    let openingDistances = null;
    const windows = openings.map(window => {
      const index = Number.isInteger(window.wallIndex) ? window.wallIndex : legacyWalls[window.wall];
      if (!Number.isInteger(index) || index < 0 || index >= outline.length) return '';
      const a = outline[index], b = outline[(index + 1) % outline.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!length) return '';
      const start = Math.max(0, Math.min(length, number(window.offset))), end = Math.max(0, Math.min(length, number(window.offset) + number(window.width)));
      const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, sx = a.x + dx * start, sz = a.z + dz * start, ex = a.x + dx * end, ez = a.z + dz * end;
      const selected = window.id === this.selectedWindowId, door = window.kind === 'door', openingColor = selected ? '#157f72' : door ? '#b18b64' : '#79aebb';
      let swing = '', distances = '';
      if (door) {
        const nx = -dz * outside, nz = dx * outside, width = end - start;
        swing = `<path d="M${sx} ${sz}L${sx + nx * width} ${sz + nz * width}M${ex} ${ez}A${width} ${width} 0 0 ${outside > 0 ? 1 : 0} ${sx + nx * width} ${sz + nz * width}" stroke="${openingColor}" fill="none" stroke-dasharray="5 4" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
      }
      if (selected) {
        openingDistances = { left: number(window.offset), right: length - number(window.offset) - number(window.width) };
        const nx = dz * outside, nz = -dx * outside;
        distances = `<g class="room-opening-distances" pointer-events="none" fill="#486956" font-size="${font}"><text x="${a.x + dx * start / 2 + nx * font * 1.6}" y="${a.z + dz * start / 2 + nz * font * 1.6}" text-anchor="middle">${fmt(openingDistances.left)} мм</text><text x="${a.x + dx * (end + length) / 2 + nx * font * 1.6}" y="${a.z + dz * (end + length) / 2 + nz * font * 1.6}" text-anchor="middle">${fmt(openingDistances.right)} мм</text></g>`;
      }
      return `<g data-room-window="${escape(window.id)}" class="room-window-gap${door ? ' room-door-gap' : ''}${selected ? ' is-selected' : ''}" aria-label="${door ? 'Дверь' : 'Окно'} ${escape(window.id)}" style="cursor:ew-resize"><title>${door ? 'Дверь' : 'Окно'} · перетяните вдоль стены</title><line x1="${sx}" y1="${sz}" x2="${ex}" y2="${ez}" stroke="transparent" stroke-width="22" vector-effect="non-scaling-stroke"/><line x1="${sx}" y1="${sz}" x2="${ex}" y2="${ez}" stroke="#fbfcf8" stroke-width="9" vector-effect="non-scaling-stroke"/><line x1="${sx}" y1="${sz}" x2="${ex}" y2="${ez}" stroke="${openingColor}" stroke-width="${selected ? 5 : 3}" vector-effect="non-scaling-stroke"/>${swing}</g>${distances}`;
    }).join('');
    let resizeHandles='';
    const cabinets = ordered.map(c => {
      const points = cabinetFootprint(c); if (!points.length) return '';
      const selected = c.id === this.selectedCabinetId, material = (this.project.materials || []).find(m => m.id === c.materialId);
      const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length, cz = points.reduce((sum, p) => sum + p.z, 0) / points.length;
      const angle = (number(c.rotation) || 0) * Math.PI / 180, co = Math.cos(angle), si = Math.sin(angle);
      const fl = { x: number(c.x) - number(c.depth) * si, z: number(c.z) + number(c.depth) * co };
      const fr = { x: number(c.x) + number(c.width) * co - number(c.depth) * si, z: number(c.z) + number(c.width) * si + number(c.depth) * co };
      const inward = { x: si, z: -co };
      const fThick = Math.min(22, Math.max(12, number(c.depth) * 0.08));
      const ifl = { x: fl.x + inward.x * fThick, z: fl.z + inward.z * fThick };
      const ifr = { x: fr.x + inward.x * fThick, z: fr.z + inward.z * fThick };
      const mx = (fl.x + fr.x) / 2, mz = (fl.z + fr.z) / 2;
      const hWidth = Math.min(42, Math.max(18, number(c.width) * 0.16));
      const h1 = { x: mx - co * hWidth, z: mz - si * hWidth };
      const h2 = { x: mx + co * hWidth, z: mz + si * hWidth };
      const frontMark = `<g class="room-cabinet-facade" pointer-events="none"><line x1="${fl.x}" y1="${fl.z}" x2="${fr.x}" y2="${fr.z}" stroke="${selected ? '#148b7c' : '#2d4739'}" stroke-width="${selected ? 4 : 2.5}" stroke-linecap="round" vector-effect="non-scaling-stroke"/><line x1="${ifl.x}" y1="${ifl.z}" x2="${ifr.x}" y2="${ifr.z}" stroke="${selected ? '#169b8b' : '#617a6c'}" stroke-width="1.2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/><line x1="${h1.x}" y1="${h1.z}" x2="${h2.x}" y2="${h2.z}" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></g>`;
      if(selected && !c.parentId){
        for(const axis of ['width','depth']){
          const lx=axis==='width'?c.width:c.width/2,lz=axis==='depth'?c.depth:c.depth/2,px=number(c.x)+lx*co-lz*si,pz=number(c.z)+lx*si+lz*co;
          const label=axis==='width'?'Изменить ширину шкафа':'Изменить глубину шкафа';
          resizeHandles+=`<g class="room-resize-handle ${axis}" data-room-resize="${axis}" data-room-cabinet="${escape(c.id)}" role="button" tabindex="0" aria-label="${label}" style="cursor:crosshair"><title>${label}</title><rect x="${px-handle}" y="${pz-handle}" width="${handle*2}" height="${handle*2}" rx="${handle*.25}" fill="#fff" stroke="#148b7c" stroke-width="2" vector-effect="non-scaling-stroke"/><text data-room-size-label="${axis}" x="${px+handle*2}" y="${pz-handle*1.5}" fill="#148b7c" font-size="${font}" pointer-events="none">${fmt(c[axis])} мм</text></g>`;
        }
      }
      const hasMezzanine = ordered.some(item => item.parentId === c.id);
      const isMezzanine = Boolean(c.parentId);
      const textY = hasMezzanine ? cz - cabinetFont * 0.65 : isMezzanine ? cz + cabinetFont * 0.75 : cz;
      const labelSize = isMezzanine ? cabinetFont * 0.84 : cabinetFont;
      const labelColor = isMezzanine ? '#546e61' : '#27473a';
      return `<g data-room-cabinet="${escape(c.id)}" data-i18n="off" class="room-cabinet${selected ? ' is-selected' : ''}" role="button" aria-label="${escape(c.name)}" style="${c.parentId ? 'cursor:pointer' : 'cursor:move'}"><title>${escape(c.name)}${c.parentId ? ' · привязана к основному шкафу' : ''} · лицевая сторона спереди</title><polygon points="${pointsText(points)}" fill="${color(material?.color)}" fill-opacity="${selected ? 0.9 : 0.6}" stroke="${selected ? '#148b7c' : '#788a7b'}" stroke-width="${selected ? 3 : 1}" vector-effect="non-scaling-stroke"/>${frontMark}<text x="${cx}" y="${textY}" class="room-cabinet-label" fill="${labelColor}" text-anchor="middle" dominant-baseline="middle" font-size="${labelSize}" font-weight="${isMezzanine ? 'normal' : '500'}" pointer-events="none">${escape((c.name || 'Модуль').slice(0, 25))}</text></g>`;
    }).join('');
    const selectedCorners=new Set(this.drag?.type==='selection'?this.drag.draftIndices:this.getSelectedCorners());
    const corners = outline.map((p, i) => `<circle class="room-corner${selectedCorners.has(i) ? ' is-selected' : ''}" data-room-corner="${i}" cx="${p.x}" cy="${p.z}" r="${handle}" fill="${selectedCorners.has(i) ? '#15897d' : '#ffffff'}" stroke="#15897d" stroke-width="2" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="Угол ${i + 1}, перетяните для изменения плана"/>`).join('');
    const rubberBand=this.drag?.type==='selection'?`<rect data-room-selection="true" x="${Math.min(this.drag.start.x,this.drag.end.x)}" y="${Math.min(this.drag.start.z,this.drag.end.z)}" width="${Math.abs(this.drag.end.x-this.drag.start.x)}" height="${Math.abs(this.drag.end.z-this.drag.start.z)}" fill="#17a695" fill-opacity=".08" stroke="#16877c" stroke-width="1.4" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" pointer-events="none"/>`:'';
    const selectedLength = Math.hypot(outline[(this.selectedWall + 1) % outline.length].x - outline[this.selectedWall].x, outline[(this.selectedWall + 1) % outline.length].z - outline[this.selectedWall].z);
    const invalid = !polygonIsSimple(outline), hint = invalid ? 'Стены пересекаются. Отпустите, чтобы вернуть прежний план.' : this.hint || 'Выделите углы рамкой на пустом плане. Shift + щелчок — добавить угол. Delete — удалить выбранные углы или проём.';
    const captionCabinet=!selectedCorners.size&&!selectedOpening?cabinetData.find(c=>c.id===this.selectedCabinetId):null;
    const caption = selectedCorners.size>1?`Выбрано углов: ${selectedCorners.size}`:selectedOpening && openingDistances ? `${selectedOpening.kind === 'door' ? 'Дверь' : 'Окно'} · слева ${fmt(openingDistances.left)} · справа ${fmt(openingDistances.right)} мм` : captionCabinet?captionCabinet.name||'Модуль':this.selectedCorner === null ? `Стена ${this.selectedWall + 1} · ${fmt(selectedLength)} мм` : `Угол ${this.selectedCorner + 1}`;
    this.root.className=`room-editor${this.drag?.type==='pan'?' is-panning':this.spacePressed?' pan-ready':''}`;
    const displayCaption=captionCabinet?`<span data-i18n="off">${escape(caption)}</span>`:escape(caption);
    const frozenHeight=this.drag?.planHeight>0?`;height:${this.drag.planHeight}px;flex:0 0 ${this.drag.planHeight}px`:'';
    this.root.innerHTML = `<div class="room-toolbar"><span class="room-selection-label">${displayCaption}</span><div class="room-zoom-tools" role="toolbar" aria-label="Масштаб плана"><button class="room-corner-action" data-room-zoom="out" aria-label="Отдалить" title="Отдалить"${this.zoom<=.25?' disabled':''}>−</button><output data-room-scale>${Math.round(this.zoom*100)}%</output><button class="room-corner-action" data-room-zoom="in" aria-label="Приблизить" title="Приблизить"${this.zoom>=16?' disabled':''}>+</button><button class="room-corner-action" data-room-zoom="fit" title="Вписать план">Вписать план</button></div></div><svg class="room-plan${invalid ? ' is-invalid' : ''}" viewBox="${box.x} ${box.z} ${box.width} ${box.depth}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="План помещения, размеры в миллиметрах" style="touch-action:none${frozenHeight}"><polygon class="room-floor" points="${pointsText(outline)}" fill="${invalid ? '#f7ddd4' : '#edf1e8'}"/>${cabinets}${walls}${windows}${corners}${rubberBand}${resizeHandles}</svg><p class="room-plan-hint${invalid || this.hint ? ' is-notice' : ''}" role="status"><span>${escape(hint)}</span> <span class="room-navigation-hint">Колесо — масштаб; средняя кнопка или Space + перетаскивание — сдвиг плана</span></p>`;
    if(typeof this.root.querySelectorAll==='function')applyTranslations(this.root,this.language||this.root.ownerDocument?.documentElement?.lang||'ru');
  }

  destroy() {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.drag = null;
    this.root.removeEventListener('pointerdown', this._pointerDown);
    this.root.removeEventListener('click', this._click);
    this.root.removeEventListener('keydown', this._keyDown);
    this.root.removeEventListener('wheel', this._wheel);
    this.window.removeEventListener('pointermove', this._pointerMove);
    this.window.removeEventListener('pointerup', this._pointerUp);
    this.window.removeEventListener('pointercancel', this._pointerCancel);
    this.window.removeEventListener('keyup', this._keyUp);
    this.window.removeEventListener('blur', this._blur);
    this.root.remove();
  }
}
