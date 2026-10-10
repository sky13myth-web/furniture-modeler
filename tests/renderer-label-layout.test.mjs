import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, getInternalDrawerLayout, getSectionMountingAxes } from '../src/engine.js';
import { createDrawingSvg, generateDrawingHTML } from '../src/renderer.js';
import { printNumber } from '../src/print-i18n.js';
import { createInteriorExample } from '../src/examples.js';

function denseProject() {
  const project=createDefaultProject('en');
  Object.assign(project.cabinets[0], { width:3600, height:2600, layout:{ id:'columns', kind:'split', axis:'vertical', sizes:[1,1,1,1], children:Array.from({length:4},(_,index)=>({id:`column-${index}`,kind:'section',front:'doors',doors:2,shelves:0,internalDrawerCount:12})) } });
  return project;
}
function pages(project, view, language) {
  const options={cabinetId:project.cabinets[0].id,language};
  const first=createDrawingSvg(project,view,options),count=Number(first.match(/data-annotation-page-count="(\d+)"/)[1]);
  return Array.from({length:count},(_,index)=>index?createDrawingSvg(project,view,{...options,annotationPage:index+1}):first);
}
function labels(svg) {
  return [...svg.matchAll(/<g data-callout-index="(\d+)" data-callout-page="(\d+)" data-label-x="([\d.-]+)" data-label-y="([\d.-]+)" data-label-width="([\d.]+)" data-label-height="([\d.]+)" data-label-kind="([^"]+)" data-source-anchor-x="([\d.-]+)" data-source-anchor-y="([\d.-]+)">([\s\S]*?)<\/g>/g)].map(([,index,page,x,y,w,h,kind,ax,ay,html])=>({index:Number(index),page:Number(page),x:Number(x),y:Number(y),w:Number(w),h:Number(h),kind,ax:Number(ax),ay:Number(ay),html,title:html.match(/<title>(.*?)<\/title>/s)[1]}));
}

test('dense construction pages retain all 48 drawer sizes and four concurrent fixing axes without small fonts or overlapping label boxes',()=>{
  const project=denseProject(),before=structuredClone(project),cabinet=project.cabinets[0];
  assert.equal(getInternalDrawerLayout(cabinet,project).length,48);
  for(const language of ['ru','tr','en']) {
    const svgPages=pages(project,'interior',language),all=svgPages.flatMap(labels);
    assert.ok(svgPages.length>1,'annotation density produces additional pages, not skipped sizes');
    const count=Number(svgPages[0].match(/data-annotation-label-count="(\d+)"/)[1]);
    assert.equal(all.length,count);assert.equal(new Set(all.map(label=>label.index)).size,count);
    for(let index=1;index<=48;index++)assert.equal(all.filter(label=>new RegExp(`^I${index}(?: · | )`).test(label.title)).length,1);
    const axes=getSectionMountingAxes(cabinet,project);
    for(const height of new Set(axes.map(axis=>axis.height)))assert.equal(all.filter(label=>label.title===`A=${printNumber(height,language)}`).length,axes.filter(axis=>axis.height===height).length,'every simultaneous mounting dimension survives occupied dimension lanes');
    for(const [pageIndex,svg] of svgPages.entries()) {
      assert.match(svg,new RegExp(`data-annotation-page="${pageIndex+1}" data-annotation-page-count="${svgPages.length}"`));
      assert.ok([...svg.matchAll(/font-size="([\d.]+)"/g)].every(match=>Number(match[1])>=14));
      const boxes=labels(svg);
      assert.ok(svg.indexOf('data-label-leaders="true"')<svg.indexOf('data-callout-index='),'leaders are drawn before opaque label boxes');
      for(const box of boxes){
        const sceneY=Number(svg.match(/data-drawing-scene="true" transform="translate\(60,([\d.]+)\)"/)[1]);
        assert.ok(box.x>=0&&box.x+box.w<=1000&&box.y>=0&&box.y+box.h+sceneY<700);
        for(const other of boxes)if(box.index!==other.index)assert.ok(box.x+box.w<=other.x||other.x+other.w<=box.x||box.y+box.h<=other.y||other.y+other.h<=box.y);
        if(box.kind==='name')assert.match(svg,new RegExp(`data-label-leader="${box.index}"`));
        else assert.doesNotMatch(svg,new RegExp(`data-label-leader="${box.index}"`),'numeric measurements do not receive a side leader');
        if(box.kind==='dimension'){assert.ok(Math.abs(box.x+box.w/2-box.ax)<.02);assert.ok(Math.abs(box.y+box.h/2-box.ay)<.02);}
      }
    }
    for(const compact of [true,false]){
      const passport=generateDrawingHTML(project,{cabinetId:cabinet.id,language,compact});
      for(let page=1;page<=svgPages.length;page++)assert.match(passport,new RegExp(`data-drawing-view="interior" data-annotation-page="${page}"`),'printed passport includes every annotation page');
    }
  }
  assert.deepEqual(project,before);
});

test('decimal dimensions remain complete in annotation titles and navigation clamps to a real page',()=>{
  const project=denseProject(),cabinet=project.cabinets[0];
  Object.assign(cabinet,{width:1300.820691,height:1290.012628,depth:602.431066,layout:{id:'decimal',kind:'section',front:'open',shelves:3,name:'Щ'.repeat(100)}});
  for(const language of ['ru','tr','en'])for(const view of ['front','left','top','interior']) {
    const svgPages=pages(project,view,language),joined=svgPages.join('');
    for(const value of view==='left'?[cabinet.height,cabinet.depth]:view==='top'?[cabinet.width,cabinet.depth]:[cabinet.width,cabinet.height])assert.ok(labels(joined).some(label=>label.title===printNumber(value,language)),`${view} retains ${value}`);
    const options={cabinetId:cabinet.id,language};
    assert.equal(createDrawingSvg(project,view,{...options,annotationPage:0}),svgPages[0]);
    assert.equal(createDrawingSvg(project,view,{...options,annotationPage:999}),svgPages.at(-1));
    assert.doesNotMatch(joined, /<text[^>]*>[^<]*…/,'measurement annotations wrap rather than elide values');
  }
});

test('a simple 900 by 2200 two-door cabinet keeps both facade sizes and both overall dimensions on the first sheet',()=>{
  const project=createDefaultProject('tr'),cabinet=project.cabinets[0];
  Object.assign(cabinet,{name:'Dolap',width:900,height:2200,layout:{id:'two-doors',kind:'section',front:'doors',doors:2,shelves:2}});
  for(const language of ['ru','tr','en'])for(const sample of [project,createInteriorExample(language)]){
    const svg=createDrawingSvg(sample,'front',{cabinetId:sample.cabinets[0].id,language});
    assert.match(svg,/data-annotation-page-count="1"/);
    const entries=labels(svg);
    for(const code of ['F1','F2'])assert.ok(entries.some(entry=>entry.title.startsWith(`${code} · `)));
    for(const value of [900,2200])assert.ok(entries.some(entry=>entry.title===printNumber(value,language)));
    for(const entry of entries)if(entry.kind==='dimension')assert.doesNotMatch(svg,new RegExp(`data-label-leader="${entry.index}"`));
  }
});
