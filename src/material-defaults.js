import {THIN_BACK_PRESET} from './standards.js';
import {defaultName} from './i18n.js';

const hardboardTypes=new Set(['ru','tr','en'].map(language=>defaultName('thinBackType',language)));
export const isDefaultBackMaterial=material=>/^thin-back-3(?:-default(?:-\d+)?)?$/.test(material?.id??'')&&material.thickness===3&&hardboardTypes.has(material.type);

/** Restore the missing default stock in older catalogues. Existing panels,
 * names, manual quotes and selected cabinet materials remain intact. */
export function ensureDefaultBackMaterial(project){
 const materials=project.materials;
 const existing=materials.find(isDefaultBackMaterial);
 if(existing)return existing;
 if(materials.length>=100)return null;
 const language=['ru','tr','en'].includes(project.namingLanguage)?project.namingLanguage:'tr';
 let id=THIN_BACK_PRESET.id;
 if(materials.some(material=>material.id===id)){
  id=`${THIN_BACK_PRESET.id}-default`;
  for(let index=2;materials.some(material=>material.id===id);index++)id=`${THIN_BACK_PRESET.id}-default-${index}`;
 }
 const material={...THIN_BACK_PRESET,id,name:defaultName('thinBack',language),type:defaultName('thinBackType',language)};
 materials.push(material);
 return material;
}
