import {generateParts,optimizeCutting,getEdgeBandingSummary} from './engine.js';
import {getProjectHardwareSchedule} from './hardware.js';
import {PRICING_SNAPSHOT,MATERIAL_PRICE_REFERENCES,HARDWARE_PRICE_REFERENCES} from './price-references.js';
import {translatePrintText,translateMaterialName,translateBuiltInName} from './print-i18n.js';

const money=value=>Math.round((value+Number.EPSILON)*100)/100;
const validPrice=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const category=material=>{
  if(material.type==='MDFLAM')return 'mdflam';
  if(material.id==='thin-back-3')return 'thin-back';
  if(material.decorCode==='MAT_068')return 'front-matt';
  if(material.decorCode==='HG_068')return 'front-gloss';
  return null;
};

/** A manual quote is for this entire sheet; a sampled reference is per m². */
export function getMaterialPrice(material,{thickness=material.thickness}={}){
  if(Number(thickness)!==Number(material.thickness))return {pricePerSheet:null,manual:false,reference:null};
  if(validPrice(material.pricePerSheet))return {pricePerSheet:money(material.pricePerSheet),manual:true,reference:null};
  const reference=MATERIAL_PRICE_REFERENCES.find(ref=>ref.type===category(material)&&ref.thickness===Number(material.thickness));
  const area=Number(material.sheetWidth)*Number(material.sheetHeight)/1e6;
  return {pricePerSheet:reference&&area>0?money(reference.pricePerSquareMeter*area):null,manual:false,reference:reference??null};
}

export function getPriceSettings(project){
  return Object.fromEntries(['handlePrice','guideSetPrice','hingePrice','edgeBandPricePerMeter'].map(key=>{
    const manual=validPrice(project.settings?.pricing?.[key]);
    const value=manual?project.settings.pricing[key]:HARDWARE_PRICE_REFERENCES[key]?.price??null;
    return [key,{price:value===null?null:money(value),manual,reference:manual?null:HARDWARE_PRICE_REFERENCES[key]??null}];
  }));
}

/** Purchase sheets follow the actual cutting plan, including offcuts and kerf. */
export function getProjectCostEstimate(project,{cabinetId=null}={}){
  const source=cabinetId?{...project,cabinets:project.cabinets.filter(c=>c.id===cabinetId)}:project;
  const parts=generateParts(source),cutting=optimizeCutting(parts,project.materials,project.settings);
  const hardware=getProjectHardwareSchedule(source),edge=getEdgeBandingSummary(parts),prices=getPriceSettings(project),rows=[];
  const sheets=new Map();
  for(const sheet of cutting.sheets){const key=JSON.stringify([sheet.materialId,sheet.thickness]),group=sheets.get(key)??{id:sheet.materialId,thickness:sheet.thickness,quantity:0};group.quantity++;sheets.set(key,group);}
  for(const {id,thickness,quantity} of sheets.values()){
    const material=project.materials.find(m=>m.id===id),rate=getMaterialPrice(material,{thickness});
    rows.push({kind:'material',id,label:material.name,thickness,materialMismatch:Number(thickness)!==Number(material.thickness),quantity,unit:'sheet',unitPrice:rate.pricePerSheet,manual:rate.manual,reference:rate.reference});
  }
  const add=(id,label,quantity,unit,rate)=>{if(quantity>0)rows.push({kind:'hardware',id,label,quantity,unit,unitPrice:rate.price,manual:rate.manual,reference:rate.reference});};
  add('handles','Ручки',hardware.totals.handles,'pcs',prices.handlePrice);
  add('guideSets','Комплекты направляющих',hardware.totals.guideSets,'pair',prices.guideSetPrice);
  add('hinges','Петли',hardware.totals.hinges,'pcs',prices.hingePrice);
  add('edge','Кромка',edge.lengthMeters,'meter',prices.edgeBandPricePerMeter);
  for(const row of rows)row.cost=row.unitPrice===null?null:money(row.quantity*row.unitPrice);
  const knownTotal=money(rows.reduce((sum,row)=>sum+(row.cost??0),0));
  const missingPrices=rows.filter(row=>row.cost===null),complete=!missingPrices.length&&!cutting.unplaced.length;
  return {currency:'TRY',date:PRICING_SNAPSHOT.date,rows,hardware:hardware.totals,plannedHinges:hardware.rows.some(row=>row.kind==='hinge'&&row.planned),knownTotal,total:complete?knownTotal:null,complete,missingPrices,unplacedCount:cutting.unplaced.length,totalSheets:cutting.totalSheets};
}

export function generateCostHTML(project,{cabinetId=null,language=project.settings?.printLanguage??'tr'}={}){
  const estimate=getProjectCostEstimate(project,{cabinetId}),t=text=>escape(translatePrintText(text,language));
  const number=(value,digits=2)=>Number(value).toLocaleString({ru:'ru-RU',tr:'tr-TR',en:'en-US'}[language]??'tr-TR',{maximumFractionDigits:digits,minimumFractionDigits:digits});
  const units={sheet:'лист',pcs:'шт.',pair:'компл. (пара)',meter:'м'};
  const sources=new Map();
  for(const row of estimate.rows)for(const sample of row.reference?.samples??[])if(/^https?:\/\//.test(sample.url))sources.set(sample.url,sample);
  const title=translateBuiltInName(project.cabinets.find(c=>c.id===cabinetId)?.name??project.name,language,cabinetId?'cabinet':'project');
  return `<section class="cost-summary" data-i18n="off" lang="${escape(language)}"><h2>${t('Смета материалов и фурнитуры')} · ${escape(title)}</h2><p>${t('Ориентиры цен в Турции')} · ${estimate.date} · TRY (₺)</p><table><thead><tr>${['Материал / фурнитура','Количество','Ед.','Цена за единицу, ₺','Сумма, ₺'].map(label=>`<th>${t(label)}</th>`).join('')}</tr></thead><tbody>${estimate.rows.map(row=>`<tr><td>${row.kind==='material'?escape(translateMaterialName(row.label,language))+(row.thickness!==Number(project.materials.find(m=>m.id===row.id)?.thickness)?` · ${t('Толщина, мм')}: ${number(row.thickness,1)}`:''):t(row.label)}${row.manual?` <small>(${t('Вручную')})</small>`:''}</td><td>${number(row.quantity,row.unit==='meter'?3:0)}</td><td>${t(units[row.unit])}</td><td>${row.unitPrice===null?'—':number(row.unitPrice)}</td><td>${row.cost===null?'—':number(row.cost)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="4">${t(estimate.complete?'Итого':'Учтённая сумма')}${estimate.complete?'':` · ${t('Смета неполная')}`}</th><th>${number(estimate.knownTotal)} ₺</th></tr></tfoot></table>${estimate.missingPrices.some(row=>!row.materialMismatch)?`<p class="cost-notice">${t('Для строк с «—» задайте цену вручную.')}</p>`:''}${estimate.rows.some(row=>row.materialMismatch)?`<p class="cost-notice">${t('Толщина детали отличается от выбранного материала. Выберите материал нужной толщины; цена другого листа не применяется.')}</p>`:''}${estimate.plannedHinges?`<p class="hint">${t('Количество петель по высоте — предварительный расчёт. Нагрузку и механизм подъёмной двери проверьте по выбранной фурнитуре.')}</p>`:''}${estimate.unplacedCount?`<p class="cost-notice">${t('Не все детали размещены на листах; итоговая стоимость ещё не определена.')}</p>`:''}<p class="hint">${t('Листы считаются целиком по карте раскроя. Цены — среднее доступных предложений, а не гарантированная цена покупки. Доставка, работа и монтаж не включены.')}</p><p class="hint">${t('Для фурнитуры указан расход по проекту; минимальные упаковки поставщика не учитываются. Исходная цена кромки приведена с НДС 20%.')}</p>${sources.size?`<details><summary>${t('Источники цен')}</summary><ul>${Array.from(sources,([url,sample])=>`<li><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(sample.label)}</a> · ${sample.date??estimate.date}${sample.includesVat===false?` · ${t('Без НДС')}`:sample.includesVat===true?` · ${t('С НДС')}`:` · ${t('НДС не указан')}`}</li>`).join('')}</ul></details>`:''}</section>`;
}
