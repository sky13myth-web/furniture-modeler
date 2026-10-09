import { writeFile } from 'node:fs/promises';
import { createDefaultProject } from '../src/engine.js';
import { generateFactoryCSV, generateFactoryZip, buildFactoryFiles } from '../src/factory-export.js';

const project = createDefaultProject('tr');
await writeFile(new URL('../examples/wardrobe-factory.csv', import.meta.url), generateFactoryCSV(project));
await writeFile(new URL('../examples/wardrobe-factory.zip', import.meta.url), generateFactoryZip(project));
const first = buildFactoryFiles(project).find(file => file.path === 'dxf/P0001.dxf');
await writeFile(new URL('../examples/wardrobe-part-P0001.dxf', import.meta.url), first.content);
process.stdout.write('Factory CSV, ZIP and a 1:1 millimetre DXF example exported.\n');
