import { readFile, writeFile } from 'node:fs/promises';
import { generateFactoryCSV, generateFactoryZip, generateFactoryXLSX, buildFactoryFiles } from '../src/factory-export.js';

const project = JSON.parse(await readFile(new URL('../examples/wardrobe.atolye.json', import.meta.url), 'utf8')).project;
await writeFile(new URL('../examples/wardrobe-factory.csv', import.meta.url), generateFactoryCSV(project));
await writeFile(new URL('../examples/wardrobe-factory.zip', import.meta.url), generateFactoryZip(project));
const files = buildFactoryFiles(project);
const first = files.find(file => file.path === 'dxf/P0001.dxf');
await writeFile(new URL('../examples/wardrobe-part-P0001.dxf', import.meta.url), first.content);
for (const [name, source] of [['wardrobe-sheets-all.dxf','dxf/sheets-all.dxf'],['wardrobe-cuts-all.dxf','cuts/cuts-all.dxf'],['wardrobe-cut-sequence.csv','cuts/cut-sequence.csv'],['wardrobe-cut-sequence.html','cuts/cut-sequence.html'],['wardrobe-sheet-layout.csv','sheet-layout.csv']]) await writeFile(new URL(`../examples/${name}`, import.meta.url), files.find(file => file.path === source).content);
await writeFile(new URL('../examples/wardrobe-kesim-listesi.xlsx', import.meta.url), generateFactoryXLSX(project));
process.stdout.write('Factory CSV, ZIP, Excel and millimetre DXF examples exported from the saved demo project.\n');
