import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, validateProject } from '../src/engine.js';
import { checkImport, csvCell } from '../src/project-io.js';
import { remapWindows } from '../src/room-geometry.js';

const changed = mutator => {
  const project = createDefaultProject();
  // Preserve legacy project fixtures alongside the new explicit-layout default.
  delete project.room.outline;
  project.room.windows = [{ id: 'legacy-window', wall: 'right', offset: 1300, width: 1400, height: 1200, sill: 900 }];
  delete project.cabinets[0].layout;
  Object.assign(project.cabinets[0], { doors: 2, drawers: 0, shelves: 1 });
  project.cabinets.push({ ...project.cabinets[0], id: 'cabinet-2', name: 'Ящики', type: 'base', x: 2000, width: 800, height: 860, doors: 0, drawers: 3, shelves: 0 });
  mutator(project);
  return project;
};
const rejects = (mutator, pattern) => assert.throws(() => checkImport(changed(mutator)), pattern);
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

test('default engine project validates without mutation', () => {
  const project = createDefaultProject();
  const snapshot = structuredClone(project);
  freeze(project);
  assert.equal(checkImport(project), project);
  assert.deepEqual(project, snapshot);
});

test('shape validation rejects malformed project structures', () => {
  for (const value of [null, undefined, true, [], 'project']) assert.throws(() => checkImport(value), /проект/);
  rejects(p => { p.room = []; }, /помещение/);
  rejects(p => { p.settings = null; }, /настройки/);
  rejects(p => { p.cabinets = {}; }, /Модули/);
  rejects(p => { p.materials[0] = null; }, /материал/);
  rejects(p => { p.room.windows = '[]'; }, /Окна/);
});

test('names and IDs have bounded nonempty string contracts while custom types survive', () => {
  const project = changed(p => { p.materials[0].type = 'МДФ · авторский материал'; });
  assert.doesNotThrow(() => checkImport(project));
  assert.equal(project.materials[0].type, 'МДФ · авторский материал');
  rejects(p => { p.name = 'x'.repeat(101); }, /Название проекта/);
  rejects(p => { p.materials[0].name = 'x'.repeat(121); }, /Название материала/);
  rejects(p => { p.materials[0].type = null; }, /Тип материала/);
  rejects(p => { p.materials[0].id = ' '; }, /идентификатор/);
  rejects(p => { p.cabinets[0].name = {}; }, /Название модуля/);
});

test('duplicate material, cabinet and window IDs are rejected', () => {
  rejects(p => { p.materials[1].id = p.materials[0].id; }, /Материал: повторяющийся/);
  rejects(p => { p.cabinets[1].id = p.cabinets[0].id; }, /Модуль: повторяющийся/);
  rejects(p => { p.room.windows.push({ ...p.room.windows[0] }); }, /Окно: повторяющийся/);
});

test('dimensions accept finite numeric millimetres and reject coercion or impossible bounds', () => {
  for (const value of ['600', NaN, Infinity, -1, 0]) rejects(p => { p.cabinets[0].width = value; }, /ширина/);
  rejects(p => { p.cabinets[0].width = 6001; }, /ширина/);
  rejects(p => { p.cabinets[0].depth = 3001; }, /глубина/);
  rejects(p => { p.materials[0].thickness = 60.1; }, /толщина/);
  rejects(p => { p.materials[0].sheetWidth = 10001; }, /ширина листа/);
  rejects(p => { p.room.width = 0; }, /Помещение/);
  rejects(p => { p.room.windows[0].height = 0; }, /Окно/);
  rejects(p => { p.cabinets[0].x = -1; }, /координата x/);
  assert.doesNotThrow(() => checkImport(changed(p => { p.materials[0].thickness = 18.5; p.cabinets[0].x = 0; })));
});

test('geometry conflicts remain a separate engine concern', () => {
  assert.doesNotThrow(() => checkImport(changed(p => {
    p.cabinets[1].x = p.cabinets[0].x;
    p.cabinets[0].x = 19000;
    p.cabinets[0].plinth = 2000;
    p.room.windows[0].offset = 19000;
  })));
});

test('drawer cabinet imports require both resolvable drawer materials', () => {
  rejects(p => { delete p.cabinets[1].drawerMaterialId; }, /материал короба ящика: материал не найден/);
  rejects(p => { delete p.cabinets[1].drawerBottomMaterialId; }, /материал дна ящика: материал не найден/);
  rejects(p => { p.cabinets[1].drawerMaterialId = 'absent'; }, /материал короба ящика: материал не найден/);
  rejects(p => { p.cabinets[1].drawerBottomMaterialId = null; }, /материал дна ящика: материал не найден/);
  assert.doesNotThrow(() => checkImport(changed(p => {
    delete p.cabinets[0].drawerMaterialId;
    delete p.cabinets[0].drawerBottomMaterialId;
  })));
  rejects(p => { p.cabinets[0].drawerMaterialId = 'absent'; }, /материал короба ящика: материал не найден/);
  rejects(p => { p.cabinets[0].backMaterialId = 'absent'; }, /материал задней стенки: материал не найден/);
});

test('booleans and counts cannot silently change cutting or construction behavior', () => {
  for (const value of ['false', 0, null, undefined]) {
    rejects(p => { p.materials[0].grain = value; }, /направление текстуры/);
    rejects(p => { p.settings.allowRotate = value; }, /разрешение поворота/);
    rejects(p => { p.settings.deductEdge = value; }, /вычитание кромки/);
  }
  for (const key of ['doors', 'drawers', 'shelves']) rejects(p => { p.cabinets[0][key] = 1.5; }, /целым числом/);
  rejects(p => { p.cabinets[0].doors = 9; }, /число дверей/);
  rejects(p => { p.cabinets[0].drawers = 13; }, /число ящиков/);
  rejects(p => { p.cabinets[0].shelves = 21; }, /число полок/);
});

test('object limits, coordinate enums and production settings are checked', () => {
  rejects(p => { p.cabinets = Array(151).fill(p.cabinets[0]); }, /не более 150/);
  rejects(p => { p.materials = Array(101).fill(p.materials[0]); }, /не более 100/);
  rejects(p => { p.room.windows = Array(31).fill(p.room.windows[0]); }, /не более 30/);
  rejects(p => { p.cabinets[0].type = 'corner'; }, /неизвестный тип/);
  rejects(p => { p.room.windows[0].wall = 'ceiling'; }, /неизвестная стена/);
  rejects(p => { p.materials[0].color = '#fff'; }, /#RRGGBB/);
  rejects(p => { p.settings.kerf = 21; }, /ширина пропила/);
  rejects(p => { p.settings.margin = -1; }, /отступ от края/);
  rejects(p => { p.cabinets[0].gap = 11; }, /зазор фасадов/);
  rejects(p => { p.cabinets[0].drawerSlideGap = 41; }, /зазор направляющей/);
});

test('CSV quoting preserves semicolons, double quotes, Unicode and line breaks', () => {
  assert.equal(csvCell('Дуб; "İstanbul"'), '"Дуб; ""İstanbul"""');
  assert.equal(csvCell('Полка\nкухня'), '"Полка\nкухня"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(18.5), '"18.5"');
  assert.equal(csvCell('обычный материал'), '"обычный материал"');
});

test('CSV formulas are neutralised including whitespace and control prefixes', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1', '\t=1', '\r\n+1', '\u0000=1', '\ufeff=1', '\u009f@A1']) {
    assert.equal(csvCell(value), `"'${value}"`);
  }
  assert.equal(csvCell('Дверь =1'), '"Дверь =1"');
  assert.equal(csvCell('  дуб'), '"  дуб"');
});

test('explicit layouts import without obsolete global counts and validate bounded tree structure', () => {
  const project = createDefaultProject();
  for (const key of ['doors', 'drawers', 'shelves']) delete project.cabinets[0][key];
  assert.doesNotThrow(() => checkImport(project));
  const broken = structuredClone(project);
  broken.cabinets[0].layout.children[1].drawers = 1.5;
  assert.throws(() => checkImport(broken), /целым числом/);
  broken.cabinets[0].layout.children[1].drawers = 2;
  broken.cabinets[0].layout.sizes = [1];
  assert.throws(() => checkImport(broken), /пропорции/);
  const duplicate = createDefaultProject();
  duplicate.cabinets[0].layout.children[1].id = duplicate.cabinets[0].layout.children[0].id;
  assert.throws(() => checkImport(duplicate), /повторяющийся/);
  const recursive = createDefaultProject();
  recursive.cabinets[0].layout.children[0] = recursive.cabinets[0].layout;
  assert.throws(() => checkImport(recursive), /повторяющийся/);
});

test('polygon rooms, edge windows, rotation, cutouts and appliance schema are validated', () => {
  const project = createDefaultProject();
  project.cabinets[0].rotation = -90;
  project.cabinets[0].cutout = { corner: 'back-right', width: 200, depth: 150 };
  project.cabinets[0].includeBack = false;
  assert.doesNotThrow(() => checkImport(project));
  project.room.outline = [{ x: 0, z: 0 }, { x: 1000, z: 1000 }, { x: 0, z: 1000 }, { x: 1000, z: 0 }];
  assert.throws(() => checkImport(project), /Контур комнаты/);
  project.room.outline = createDefaultProject().room.outline;
  project.room.windows[0].wallIndex = 90;
  assert.throws(() => checkImport(project), /неизвестная стена/);
  project.room.windows[0].wallIndex = 0;
  project.cabinets[0].rotation = 181;
  assert.throws(() => checkImport(project), /поворот/);
  project.cabinets[0].rotation = 0;
  project.cabinets[0].layout.children[0].appliance = { type: 'washer', width: 600, height: 850, depth: 550 };
  assert.doesNotThrow(() => checkImport(project));
  project.cabinets[0].layout.children[0].appliance.type = 'unknown';
  assert.throws(() => checkImport(project), /неизвестный тип техники/);
});

test('tree depth and total node limits prevent unbounded imported construction', () => {
  const section = id => ({ id, kind: 'section', front: 'open', shelves: 0 });
  const project = createDefaultProject();
  let node = section('deep-leaf');
  for (let index = 0; index < 11; index++) node = { id: `split-${index}`, kind: 'split', axis: 'vertical', sizes: [1, 1], children: [node, section(`side-${index}`)] };
  project.cabinets[0].layout = node;
  assert.throws(() => checkImport(project), /10 уровней/);
  const many = { id: 'many-root', kind: 'split', axis: 'horizontal', sizes: [1, 1, 1, 1, 1], children: Array.from({ length: 5 }, (_, index) => ({ id: `group-${index}`, kind: 'split', axis: 'vertical', sizes: Array(16).fill(1), children: Array.from({ length: 16 }, (_, leaf) => section(`leaf-${index}-${leaf}`)) })) };
  project.cabinets[0].layout = many;
  assert.throws(() => checkImport(project), /80 узлов/);
});

test('an opening crossing a newly inserted corner survives JSON save/restore with its geometric error', () => {
  const project = createDefaultProject();
  project.cabinets = [];
  project.room.width = 2000;
  project.room.depth = 1000;
  project.room.outline = [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 }, { x: 0, z: 1000 }];
  project.room.windows = [{ id: 'crossing', wallIndex: 0, offset: 900, width: 300, height: 500, sill: 700 }];
  const next = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 }, { x: 0, z: 1000 }];
  project.room.windows = remapWindows(project.room, next, { kind: 'insert' });
  project.room.outline = next;
  assert.equal(project.room.windows[0].offset, -100);
  const restored = JSON.parse(JSON.stringify(project));
  assert.equal(checkImport(restored), restored);
  assert.equal(restored.room.windows[0].offset, -100);
  assert.equal(validateProject(restored).some(item => item.message.includes('Оконный проём: проверьте')), true);
});

test('floor portals, absent bottoms, rear braces and pull-out shelves roundtrip as explicit editable data', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  cabinet.includeBottom = false;
  cabinet.rearBraces = [{ id: 'rear-rail', y: 2000, height: 100, materialId: 'mdf-oak' }];
  cabinet.layout.children[2].front = 'open';
  cabinet.layout.children[2].floor = 'open';
  cabinet.layout.children[0].front = 'open';
  cabinet.layout.children[0].pullOutShelf = true;
  const restored = JSON.parse(JSON.stringify(project));
  assert.equal(checkImport(restored), restored);
  assert.deepEqual(restored, project);
  for (const [mutate, pattern] of [
    [p => { p.cabinets[0].includeBottom = 'false'; }, /нижняя панель/],
    [p => { p.cabinets[0].layout.children[2].floor = 'deleted'; }, /тип основания/],
    [p => { p.cabinets[0].layout.children[0].pullOutShelf = 1; }, /выдвижная полка/],
    [p => { p.cabinets[0].rearBraces[0].y = -1; }, /от низа шкафа/],
    [p => { p.cabinets[0].rearBraces[0].materialId = 'missing'; }, /материал не найден/],
    [p => { p.cabinets[0].rearBraces = Array(21).fill(p.cabinets[0].rearBraces[0]); }, /не более 20/],
    [p => { p.cabinets[0].rearBraces.push({ ...p.cabinets[0].rearBraces[0] }); }, /повторяющийся/]
  ]) {
    const broken = structuredClone(project); mutate(broken);
    assert.throws(() => checkImport(broken), pattern);
  }
});

test('door wall openings roundtrip while untyped older openings remain windows', () => {
  const project = createDefaultProject();
  assert.equal(project.room.windows[0].kind, undefined);
  project.room.windows.push({ id: 'door', kind: 'door', wallIndex: 0, offset: 2000, width: 800, height: 2000, sill: 0 });
  const restored = JSON.parse(JSON.stringify(project));
  assert.equal(checkImport(restored), restored);
  assert.equal(restored.room.windows[0].kind, undefined);
  assert.equal(restored.room.windows[1].kind, 'door');
  assert.deepEqual(validateProject(restored), []);
  restored.room.windows[1].kind = 'arch';
  assert.throws(() => checkImport(restored), /неизвестный вид/);
});

test('signed polygon vertices can derive forty-metre room bounds without breaking save/restore', () => {
  const project = createDefaultProject();
  project.cabinets = []; project.room.windows = [];
  project.room.outline = [{ x: -20000, z: -20000 }, { x: 20000, z: -20000 }, { x: 20000, z: 20000 }, { x: -20000, z: 20000 }];
  project.room.width = 40000; project.room.depth = 40000;
  assert.doesNotThrow(() => checkImport(JSON.parse(JSON.stringify(project))));
  assert.deepEqual(validateProject(project), []);
  project.room.width = 40001;
  assert.throws(() => checkImport(project), /Помещение: ширина/);
  delete project.room.outline;
  project.room.width = 20001;
  assert.throws(() => checkImport(project), /Помещение: ширина/);
});

test('installation clearance settings roundtrip while legacy appliances need no migration', () => {
  const project = createDefaultProject();
  const node = project.cabinets[0].layout.children[0];
  node.appliance = { type: 'washer', width: 600, height: 850, depth: 600 };
  assert.doesNotThrow(() => checkImport(project));
  node.appliance.useClearances = true;
  assert.throws(() => checkImport(project), /монтажные зазоры техники/);
  node.appliance.clearances = { side: 25, top: 25, rear: 50 };
  const restored = JSON.parse(JSON.stringify(project));
  assert.equal(checkImport(restored), restored);
  assert.deepEqual(restored.cabinets[0].layout.children[0].appliance, node.appliance);
  for (const [key, value, pattern] of [
    ['useClearances', 1, /учитывать монтажные зазоры/],
    ['clearances', null, /монтажные зазоры техники/],
    ['clearances', { side: -1, top: 25, rear: 50 }, /Монтажный зазор/],
    ['clearances', { side: 25, top: 1001, rear: 50 }, /Монтажный зазор/],
    ['clearances', { side: 25, top: 25, rear: '50' }, /Монтажный зазор/],
    ['clearances', { side: 25, rear: 50 }, /Монтажный зазор/]
  ]) {
    const broken = structuredClone(project);
    broken.cabinets[0].layout.children[0].appliance[key] = value;
    assert.throws(() => checkImport(broken), pattern);
  }
  node.appliance.useClearances = false;
  node.appliance.clearances = { side: 0, top: 1000, rear: 50 };
  assert.doesNotThrow(() => checkImport(project));
  delete node.appliance.clearances;
  assert.doesNotThrow(() => checkImport(project));
});

test('room installation allowances and optional print language validate without changing legacy projects', () => {
  const project = createDefaultProject();
  assert.deepEqual(project.room.installationClearance, { walls: 10, ceiling: 20 });
  assert.equal(project.settings.printLanguage, 'tr');
  assert.doesNotThrow(() => checkImport(JSON.parse(JSON.stringify(project))));
  for (const language of ['ru', 'tr', 'en']) {
    project.settings.printLanguage = language;
    assert.equal(checkImport(project).settings.printLanguage, language);
  }
  project.settings.printLanguage = 'de';
  assert.throws(() => checkImport(project), /Язык печати/);
  delete project.settings.printLanguage;
  delete project.room.installationClearance;
  assert.equal(checkImport(project), project);
  assert.equal(project.room.installationClearance, undefined);
  for (const allowance of [null, { walls: -1, ceiling: 20 }, { walls: 10, ceiling: 1001 }, { walls: '10', ceiling: 20 }, { walls: 10 }]) {
    project.room.installationClearance = allowance;
    assert.throws(() => checkImport(project), /монтажные отступы комнаты|Монтажный отступ комнаты/);
  }
});

test('floor-length side option imports as a boolean and absent legacy data remains absent', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  assert.equal(cabinet.sidesToFloor, true);
  assert.equal(checkImport(JSON.parse(JSON.stringify(project))).cabinets[0].sidesToFloor, true);
  cabinet.sidesToFloor = false;
  assert.equal(checkImport(project).cabinets[0].sidesToFloor, false);
  cabinet.sidesToFloor = 'true';
  assert.throws(() => checkImport(project), /боковины до пола/);
  delete cabinet.sidesToFloor;
  assert.equal(checkImport(project).cabinets[0].sidesToFloor, undefined);
});

test('creation language and custom saved names roundtrip without any import-time translation', () => {
  for (const language of ['ru', 'tr', 'en']) {
    const project = createDefaultProject(language);
    project.name = 'Мастерская · Özel';
    project.cabinets[0].name = 'Şule — мой шкаф';
    project.materials[0].name = 'Белый декор по заказу';
    project.materials[0].type = 'Özel kaplama';
    const restored = JSON.parse(JSON.stringify(project));
    assert.equal(checkImport(restored), restored);
    assert.deepEqual(restored, project);
    assert.equal(restored.namingLanguage, language);
  }
  const legacy = createDefaultProject('ru');
  delete legacy.namingLanguage;
  const snapshot = JSON.stringify(legacy);
  assert.equal(checkImport(legacy), legacy);
  assert.equal(JSON.stringify(legacy), snapshot);
  assert.equal(legacy.namingLanguage, undefined);
  legacy.namingLanguage = 'de';
  assert.throws(() => checkImport(legacy), /Язык новых названий/);
});

test('per-door opening directions roundtrip with exact counts and legacy absence stays absent', () => {
  const project = createDefaultProject();
  project.cabinets[0].layout.children[0].doorOpenings = ['left', 'up'];
  project.cabinets[0].layout.children[2].doorOpenings = ['right', 'right'];
  const restored = JSON.parse(JSON.stringify(project));
  assert.deepEqual(checkImport(restored), project);
  delete project.cabinets[0].layout.children[0].doorOpenings;
  assert.equal(checkImport(project).cabinets[0].layout.children[0].doorOpenings, undefined);
  const legacy = changed(p => { p.cabinets[0].doorOpenings = ['up', 'left']; });
  assert.deepEqual(checkImport(JSON.parse(JSON.stringify(legacy))).cabinets[0].doorOpenings, ['up', 'left']);
  for (const value of [null, 'left', ['left'], ['left', 'up', 'right'], ['left', 'down'], ['left', null], new Array(2)]) {
    const explicit = createDefaultProject();
    explicit.cabinets[0].layout.children[0].doorOpenings = value;
    assert.throws(() => checkImport(explicit), /открывания|Направление двери/);
    rejects(p => { p.cabinets[0].doorOpenings = value; }, /открывания|Направление двери/);
  }
});

test('internal drawers, configurable hinge allowance and push opening roundtrip as optional section data', () => {
  const project = createDefaultProject(), node = project.cabinets[0].layout.children[0];
  Object.assign(node, { internalDrawerCount: 2, internalDrawerHingeGap: 25, openingMechanism: 'push' });
  assert.deepEqual(checkImport(JSON.parse(JSON.stringify(project))), project);
  for (const value of [-1, 1.5, 13, '2']) {
    node.internalDrawerCount = value;
    assert.throws(() => checkImport(project), /Внутренние ящики/);
  }
  node.internalDrawerCount = 2;
  for (const value of [-1, 201, '20', Infinity]) {
    node.internalDrawerHingeGap = value;
    assert.throws(() => checkImport(project), /Отступ внутренних ящиков/);
  }
  node.internalDrawerHingeGap = 20; node.front = 'drawers';
  assert.throws(() => checkImport(project), /Внутренние ящики размещаются/);
  node.front = 'doors'; node.openingMechanism = 'motor';
  assert.throws(() => checkImport(project), /Механизм открывания/);
  node.openingMechanism = 'handle';
  delete project.cabinets[0].drawerMaterialId;
  assert.throws(() => checkImport(project), /материал короба ящика/);
});
