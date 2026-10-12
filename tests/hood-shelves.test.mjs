import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, validateProject, getCabinetLayout, convertLegacyLayout } from '../src/engine.js';

function hoodProject(shelves, front = 'doors') {
  const project = createDefaultProject('ru');
  const cabinet = createCabinet('wall', project, { x: 0, z: 0 });
  cabinet.layout ??= convertLegacyLayout(cabinet);
  project.cabinets = [cabinet];
  const section = getCabinetLayout(cabinet, project).sections[0];
  const find = node => node.id === section.id ? node : (node.children || []).map(find).find(Boolean);
  const node = find(cabinet.layout);
  node.front = front;
  node.shelves = shelves;
  node.appliance = { type: 'hood-builtin', label: 'Вытяжка', width: 500, height: 200, depth: 280 };
  return project;
}
const messages = result => (Array.isArray(result) ? result : [...(result.errors || []), ...(result.warnings || [])]).map(m => typeof m === 'string' ? m : m.message || JSON.stringify(m)).join('\n');

test('built-in hood allows doors and a shelf above the hood body', () => {
  const text = messages(validateProject(hoodProject(1)));
  assert.doesNotMatch(text, /открытая ниша без полок/);
  assert.doesNotMatch(text, /пересекает встроенную вытяжку/);
  assert.match(text, /вырез под воздуховод/);
});

test('built-in hood rejects shelves cutting into the hood', () => {
  const text = messages(validateProject(hoodProject(4)));
  assert.match(text, /пересекает встроенную вытяжку/);
});
