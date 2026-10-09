import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/engine.js';
import { getRoomPlanGeometry, createRoomPlanSvg, generateRoomPlanHTML } from '../src/room-print.js';
import { polygonArea } from '../src/room-geometry.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const fixture = () => {
  const project = createDefaultProject();
  project.name = 'My room';
  project.room = { ...project.room, width: 4000, depth: 3800, height: 2800,
    outline: [{ x: -500, z: -400 }, { x: 3500, z: -400 }, { x: 3500, z: 2200 }, { x: 1400, z: 2200 }, { x: 1400, z: 3400 }, { x: -500, z: 3400 }],
    windows: [{ id: 'window', wallIndex: 0, offset: 800, width: 1200, height: 1100, sill: 900 }, { id: 'door', kind: 'door', wallIndex: 5, offset: 700, width: 800, height: 2100, sill: 0 }] };
  const cabinet = { ...project.cabinets[0], id: 'rotated', name: 'Rotated base', x: 900, z: 400, y: 0, width: 900, depth: 500, height: 860, rotation: 90, doors: 2, drawers: 0, shelves: 1, cutout: { corner: 'back-left', width: 200, depth: 100 } };
  delete cabinet.layout;
  project.cabinets = [cabinet, { ...cabinet, id: 'raised', name: 'Raised wall cabinet', y: 1000, height: 700, cutout: null }];
  return project;
};
const freeze = object => {
  if (object && typeof object === 'object') { Object.values(object).forEach(freeze); Object.freeze(object); }
  return object;
};

test('L-shaped room print preserves signed vertices, every real wall and area rather than a bounding rectangle', () => {
  const project = fixture(), geometry = getRoomPlanGeometry(project), svg = createRoomPlanSvg(project, { language: 'en' });
  assert.deepEqual(geometry.outline, project.room.outline);
  assert.equal(geometry.walls.length, 6);
  close(geometry.areaSquareMeters, 12.68);
  assert.deepEqual(geometry.walls.map(wall => wall.length), [4000, 2600, 2100, 1200, 1900, 3800]);
  assert.equal((svg.match(/data-wall-index=/gu) ?? []).length, 6);
  assert.match(svg, /data-length-mm="2100"/u);
  assert.doesNotMatch(svg, /data-room-(?:corner|resize)|room-zoom|room-selection/u);
});

test('rotated rear-notch footprints include closed fronts while elevated cabinets retain real installation height', () => {
  const project = fixture(), geometry = getRoomPlanGeometry(project);
  const floor = geometry.cabinets[0], raised = geometry.cabinets[1];
  assert.equal(floor.footprint.length, 6);
  assert.equal(floor.carcassFootprint.length, 6);
  close(Math.abs(polygonArea(floor.carcassFootprint)), 900 * 500 - 200 * 100);
  close(Math.abs(polygonArea(floor.footprint)), 900 * 518 - 200 * 100);
  close(Math.min(...floor.carcassFootprint.map(point => point.x)), 400);
  close(Math.min(...floor.footprint.map(point => point.x)), 382);
  close(Math.max(...floor.footprint.map(point => point.z)), 1300);
  assert.equal(raised.y, 1000);
  const svg = createRoomPlanSvg(project, { language: 'en' }), html = generateRoomPlanHTML(project, { language: 'en' });
  assert.match(svg, /class="cabinet elevated" data-cabinet-id="raised"/u);
  assert.match(svg, /Y=1,000 mm/u);
  assert.match(html, /<td>1,000<\/td><td>90°<\/td>/u);
  assert.match(html, /Furniture outlines include closed fronts/u);
});

test('window and door endpoints lie along an angled wall at exact offsets and preserve both end distances', () => {
  const project = fixture();
  project.room.outline = [{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 4200, z: 1600 }, { x: 4200, z: 3600 }, { x: 0, z: 3600 }];
  project.room.windows = [{ id: 'diagonal-window', wallIndex: 1, offset: 500, width: 900, height: 1000, sill: 800 }, { id: 'entrance', kind: 'door', wallIndex: 0, offset: 750, width: 850, height: 2100, sill: 0 }];
  const [window, door] = getRoomPlanGeometry(project).openings;
  assert.deepEqual(window.start, { x: 3300, z: 400 });
  assert.deepEqual(window.end, { x: 3840, z: 1120 });
  assert.equal(window.right, 600);
  assert.equal(window.number, 'W1');
  assert.equal(door.number, 'D1');
  assert.equal(door.sill, 0);
  const html = generateRoomPlanHTML(project, { language: 'en' });
  assert.match(html, /<td>W1<\/td><td>Window<\/td><td>S2<\/td><td>500<\/td><td>900<\/td><td>600<\/td>/u);
  assert.match(html, /data-offset-mm="750" data-width-mm="850"/u);
  assert.match(html, /From wall start, mm/u);
  assert.match(html, /To wall end, mm/u);
});

test('invalid openings retain their actual overrun and shifted data instead of silently clamping the print', () => {
  const project = fixture();
  project.room.windows = [{ id: 'overrun', kind: 'door', wallIndex: 3, offset: 900, width: 800, height: 2100, sill: 0 }];
  const geometry = getRoomPlanGeometry(project), opening = geometry.openings[0];
  assert.equal(opening.offset, 900);
  assert.equal(opening.width, 800);
  assert.equal(opening.right, -500);
  assert.equal(opening.invalid, true);
  const html = generateRoomPlanHTML(project, { language: 'en' });
  assert.match(html, /class="invalid-row"/u);
  assert.match(html, /<td>-500<\/td>/u);
  assert.match(html, /marked in red/u);
});

test('legacy front and left offsets follow the same directed edges as the room editor', () => {
  const project = { room: { width: 4200, depth: 3400, height: 2700, windows: [
    { id: 'front', wall: 'front', offset: 300, width: 1000, height: 1200, sill: 800 },
    { id: 'left', wall: 'left', kind: 'door', offset: 600, width: 900, height: 2100, sill: 0 },
  ] }, cabinets: [], materials: [] };
  const geometry = getRoomPlanGeometry(project);
  assert.deepEqual(geometry.openings[0].start, { x: 3900, z: 3400 });
  assert.deepEqual(geometry.openings[0].end, { x: 2900, z: 3400 });
  assert.deepEqual(geometry.openings[1].start, { x: 0, z: 2800 });
  assert.deepEqual(geometry.openings[1].end, { x: 0, z: 1900 });
  assert.equal(geometry.openings[0].right, 2900);
  assert.equal(geometry.openings[1].right, 1900);
});

test('clockwise room outlines retain their vertex order and outward wall dimensions', () => {
  const project = fixture();
  project.room.outline = [{ x: 0, z: 0 }, { x: 0, z: 3400 }, { x: 4200, z: 3400 }, { x: 4200, z: 0 }];
  project.room.windows = [];
  const geometry = getRoomPlanGeometry(project);
  assert.deepEqual(geometry.outline, project.room.outline);
  assert.equal(geometry.areaSquareMeters, 14.28);
  const directions = geometry.walls.map(wall => [wall.outward.x || 0, wall.outward.z || 0]);
  assert.deepEqual(directions, [[-1, 0], [0, 1], [1, 0], [0, -1]]);
  assert.match(createRoomPlanSvg(project, { language: 'tr' }), /data-length-mm="3400"/u);
});

test('room print is localized in all three languages, preserves custom names and uses a fixed independent paper scale', () => {
  const project = fixture();
  for (const [language, title, schedule] of [['ru', 'План помещения', 'Ведомость мебели'], ['tr', 'Oda planı', 'Mobilya listesi'], ['en', 'Room plan', 'Furniture schedule']]) {
    const html = generateRoomPlanHTML(project, { language });
    assert.ok(html.includes(`<h1>${title}</h1>`));
    assert.ok(html.includes(schedule));
    assert.ok(html.includes('Raised wall cabinet'));
    assert.match(html, /@page\{size:A4 landscape/u);
    if (language !== 'ru') assert.doesNotMatch(html, /[А-Яа-яЁё]/u);
  }
  assert.match(generateRoomPlanHTML(project), /<html lang="tr">/u);
  assert.match(generateRoomPlanHTML(project, { language: 'unsupported' }), /<html lang="tr">/u);
  const svg = createRoomPlanSvg(project, { language: 'en' });
  assert.match(svg, /width="270mm" height="126mm" viewBox="0 0 1080 504"/u);
  project.room.zoom = 16; project.room.camera = { x: 500000, z: 500000, width: 1, depth: 1 };
  project.selectedCabinetId = 'raised'; project.settings.roomZoom = .25;
  assert.equal(createRoomPlanSvg(project, { language: 'en' }), svg);
});

test('paper-space wall, cabinet and opening label boxes stay inside the canvas without overlapping', () => {
  const project = fixture(), svg = createRoomPlanSvg(project, { language: 'en' });
  const boxes = Array.from(svg.matchAll(/class="print-label [^"]*"><title>.*?<\/title><rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/gu), match => ({ x: +match[1], y: +match[2], width: +match[3], height: +match[4] }));
  assert.equal(boxes.length, 10);
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1080 && box.y + box.height <= 504);
    for (let j = 0; j < i; j++) {
      const other = boxes[j];
      assert.equal(box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y, false, `${i} overlaps ${j}`);
    }
  }
});

test('empty and legacy rooms print without mutation, while every user string is escaped', () => {
  const legacy = { name: 'Empty room', room: { width: 4200, depth: 3400, height: 2700, windows: [{ id: 'old', wall: 'right', offset: 100, width: 900, height: 1200, sill: 800 }] }, cabinets: [], materials: [] };
  assert.equal(getRoomPlanGeometry(legacy).walls.length, 4);
  assert.deepEqual(getRoomPlanGeometry(legacy).openings[0].start, { x: 4200, z: 100 });
  assert.match(generateRoomPlanHTML(legacy, { language: 'en' }), /No furniture added/u);
  const project = fixture();
  project.name = '<img src=x onerror="alert(1)">';
  project.cabinets[0].name = '</text><script>alert(2)</script>';
  project.cabinets[0].id = 'cab" onload="alert(3)';
  project.materials.find(material => material.id === project.cabinets[0].materialId).color = 'url(javascript:evil)';
  project.room.windows[0].id = 'window"><script>alert(4)</script>';
  const original = structuredClone(project); freeze(project);
  for (const html of [createRoomPlanSvg(project, { language: 'en' }), generateRoomPlanHTML(project, { language: 'en' })]) {
    assert.doesNotMatch(html, /<script|<img|\sonload="alert|url\(javascript/u);
    assert.match(html, /&lt;script&gt;alert/u);
    assert.doesNotMatch(html, /\bNaN\b|\bInfinity\b/u);
  }
  assert.deepEqual(project, original);
});
