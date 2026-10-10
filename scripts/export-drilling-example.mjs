import { readFile, writeFile } from 'node:fs/promises';
import { DRILLING_DEFAULTS } from '../src/drilling.js';
import { checkDrillingExport, generateDrillingCSV, generateDrillingZip, buildDrillingFiles } from '../src/drilling-export.js';

const project = JSON.parse(await readFile(new URL('../examples/wardrobe.atolye.json', import.meta.url), 'utf8')).project;
project.settings.drilling = { ...DRILLING_DEFAULTS, enabled: true };
const result = checkDrillingExport(project);
if (!result.valid) throw new Error(JSON.stringify(result.errors));
await writeFile(new URL('../examples/wardrobe-drilling.csv', import.meta.url), generateDrillingCSV(project, { language: 'tr' }));
await writeFile(new URL('../examples/wardrobe-drilling.zip', import.meta.url), generateDrillingZip(project, { language: 'tr' }));
const firstMap = buildDrillingFiles(project, { language: 'tr' }).find(file => file.path.startsWith('maps/P0001'));
await writeFile(new URL('../examples/wardrobe-drilling-P0001.svg', import.meta.url), firstMap.content);
console.log(`Drilling example: ${result.plan.joints.length} contacts, ${result.plan.holes.length} operations.`);
