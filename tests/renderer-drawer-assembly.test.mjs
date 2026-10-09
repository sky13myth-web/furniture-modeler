import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, getCabinetLayout, getFrontLayout, getExternalDrawerLayout, getInternalDrawerLayout, generateParts, validateProject } from '../src/engine.js';
import { FurnitureViewport } from '../src/renderer.js';

function viewportFor(project) {
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: String(text).length * 6 }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = { style: {}, getContext: () => context, getBoundingClientRect: () => ({ width: 900, height: 700, left: 0, top: 0 }), setAttribute() {}, addEventListener() {}, removeEventListener() {} };
  const viewport = new FurnitureViewport(canvas);
  viewport.setProject(project, project.cabinets[0].id);
  viewport.setOptions({ room: false, focusCabinet: true, doorsOpen: false });
  return viewport;
}
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < .001, `${message}: ${actual} vs ${expected}`);

test('ordinary drawer boxes meet the inside of the facade and match the finished manufacturing wall depth', () => {
  for (const kind of ['normal', 'L', 'reduced-depth', 'legacy']) {
    const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
    Object.assign(cabinet, { width: 900, height: 860, depth: 580, x: 100, y: 40, z: 250, rotation: 0, plinth: 100,
      layout: { ...createSection('drawers'), id: 'drawer-section', drawers: 2 } });
    if (kind === 'L') cabinet.cutout = { corner: 'back-left', width: 200, depth: 150 };
    if (kind === 'reduced-depth') cabinet.layout.depth = 400;
    if (kind === 'legacy') { delete cabinet.layout; cabinet.doors = 0; cabinet.drawers = 2; cabinet.shelves = 0; }
    const parts = generateParts(project), front = getFrontLayout(cabinet, project).find(front => front.kind === 'drawer');
    const section = getCabinetLayout(cabinet, project).sections.find(section => section.id === front.sectionId);
    const side = parts.find(part => /Ящик 1 · боковина левая$/.test(part.name));
    const before = structuredClone(project), viewport = viewportFor(project);
    try {
      const vertices = viewport.hits.filter(face => face.component === 'drawer-box' && face.sectionId === front.sectionId).flatMap(face => face.points);
      assert.ok(vertices.length, `${kind}: actual drawer box faces are present`);
      const rear = Math.min(...vertices.map(point => point[2])), end = Math.max(...vertices.map(point => point[2]));
      const facadeInside = cabinet.z + cabinet.backThickness + (front.depth ?? cabinet.depth - cabinet.backThickness);
      close(end, facadeInside, `${kind}: box front must touch the inner facade plane`);
      close(end - rear, side.finishedWidth, `${kind}: visible box depth must equal finished side stock depth`);
      close(rear, cabinet.z + cabinet.backThickness + (section?.rearOffset ?? 0) + 40, `${kind}: rear clearance is 40 mm`);
      viewport.setOptions({ doorsOpen: true });
      const opened = viewport.hits.filter(face => face.component === 'drawer-box' && face.sectionId === front.sectionId).flatMap(face => face.points);
      const openedFacade = viewport.hits.filter(face => face.component === 'front' && face.sectionId === front.sectionId).flatMap(face => face.points);
      close(Math.max(...opened.map(point => point[2])), Math.min(...openedFacade.map(point => point[2])), `${kind}: sliding preserves facade-to-box contact`);
    } finally { viewport.destroy(); }
    assert.deepEqual(project, before);
  }
});

test('internal positioned drawer panels meet their own inner front and preserve exact source-part dimensions', () => {
  for (const openingMechanism of ['handle', 'push']) {
    const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
    Object.assign(cabinet, { width: 900, height: 860, depth: 580, x: 100, y: 40, z: 250, rotation: 0, plinth: 100,
      layout: { ...createSection('doors'), id: 'behind-doors', doors: 2, internalDrawerCount: 2, openingMechanism } });
    const drawers = getInternalDrawerLayout(cabinet, project), parts = generateParts(project), before = structuredClone(project), viewport = viewportFor(project);
    assert.equal(validateProject(project).filter(issue => issue.level === 'error').length, 0);
    try {
      viewport.setOptions({ doorsOpen: true, internalDrawersOpen: false });
      for (const drawer of drawers) {
        const plane = cabinet.z + cabinet.backThickness + drawer.depth;
        close(cabinet.z + drawer.box.z + drawer.box.depth, plane, `${openingMechanism}: box metadata meets its inner front`);
        const vertices = viewport.hits.filter(face => face.component === 'internal-drawer-box' && face.sectionId === drawer.sectionId && face.internalDrawerIndex === drawer.index).flatMap(face => face.points);
        assert.ok(vertices.length);
        close(Math.max(...vertices.map(point => point[2])), plane, `${openingMechanism}: actual source panels end at the front`);
        close(Math.min(...vertices.map(point => point[2])), cabinet.z + drawer.box.z, `${openingMechanism}: source panels start at box.z`);
        const side = parts.find(part => part.component === 'internal-drawer-box' && part.internalDrawerIndex === drawer.index && /боковина левая$/.test(part.name));
        close(side.finishedWidth, drawer.box.depth, `${openingMechanism}: internal side is cut from the real box depth`);
      }
      viewport.setOptions({ internalDrawersOpen: true });
      for (const drawer of drawers) {
        const box = viewport.hits.filter(face => face.component === 'internal-drawer-box' && face.internalDrawerIndex === drawer.index).flatMap(face => face.points);
        const front = viewport.hits.filter(face => face.component === 'internal-drawer-front' && face.internalDrawerIndex === drawer.index).flatMap(face => face.points);
        close(Math.max(...box.map(point => point[2])), Math.min(...front.map(point => point[2])), `${openingMechanism}: inner fronts and boxes slide as one assembly`);
      }
    } finally { viewport.destroy(); }
    assert.deepEqual(project, before);
  }
});

test('legacy, explicit and interior shelves render the real panel positions with equal clear gaps and no slab intersections', () => {
  for (const kind of ['legacy', 'explicit', 'interior', 'legacy-mixed', 'legacy-L']) {
    const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
    Object.assign(cabinet, { width: 900, height: 200, depth: 580, x: 100, y: 40, z: 250, rotation: 0, plinth: 30,
      layout: { ...createSection('open'), id: 'shelf-opening', shelves: 7 } });
    if (kind.startsWith('legacy')) {
      delete cabinet.layout; cabinet.doors = 2; cabinet.drawers = 0; cabinet.shelves = 7;
    }
    if (kind === 'interior') cabinet.layout = { ...createSection('doors'), id: 'outer-door', shelves: 0,
      interiorLayout: { ...createSection('open'), id: 'inner-shelves', shelves: 7 } };
    if (kind === 'legacy-mixed') Object.assign(cabinet, { height: 860, plinth: 100, drawers: 2, shelves: 3 });
    if (kind === 'legacy-L') Object.assign(cabinet, { height: 2200, plinth: 100, shelves: 5, cutout: { corner: 'back-left', width: 200, depth: 150 } });
    const parts = generateParts(project).filter(part => /полка \d+$/i.test(part.name)), before = structuredClone(project), viewport = viewportFor(project);
    assert.equal(validateProject(project).filter(issue => issue.level === 'error').length, 0, `${kind}: the source fixture is physically valid`);
    try {
      for (const part of parts) {
        const faces = viewport.hits.filter(face => face.partId === part.id), vertices = faces.flatMap(face => face.points);
        assert.ok(vertices.length, `${kind}: shelf ${part.id} is drawn directly from its production part`);
        const outline = part.finishedOutline ?? [{ x: 0, y: 0 }, { x: part.finishedWidth, y: 0 }, { x: part.finishedWidth, y: part.finishedHeight }, { x: 0, y: part.finishedHeight }];
        const expectedX = outline.map(point => cabinet.x + part.position.x + point.x), expectedZ = outline.map(point => cabinet.z + part.position.z + point.y);
        close(Math.min(...vertices.map(point => point[0])), Math.min(...expectedX), `${kind}: finished X minimum`);
        close(Math.max(...vertices.map(point => point[0])), Math.max(...expectedX), `${kind}: finished X maximum`);
        close(Math.min(...vertices.map(point => point[2])), Math.min(...expectedZ), `${kind}: finished Z minimum`);
        close(Math.max(...vertices.map(point => point[2])), Math.max(...expectedZ), `${kind}: finished Z maximum`);
        close(Math.min(...vertices.map(point => point[1])), cabinet.y + cabinet.plinth + part.position.y, `${kind}: shelf lower face`);
        close(Math.max(...vertices.map(point => point[1])), cabinet.y + cabinet.plinth + part.position.y + part.thickness, `${kind}: shelf upper face`);
      }
      if (['legacy', 'explicit', 'interior'].includes(kind)) {
        const shelfFaces = viewport.hits.filter(face => ['shelf', 'interior-shelf'].includes(face.component));
        assert.ok(shelfFaces.length > 0);
        const ordered = [...parts].sort((a, b) => a.position.y - b.position.y), thickness = parts[0].thickness;
        const gaps = [ordered[0].position.y - thickness,
          ...ordered.slice(1).map((part, index) => part.position.y - ordered[index].position.y - thickness),
          cabinet.height - cabinet.plinth - thickness - ordered.at(-1).position.y - thickness];
        assert.ok(gaps.every(gap => gap > 0), `${kind}: every clear gap remains positive`);
        gaps.forEach(gap => close(gap, 1, `${kind}: seven 18 mm shelves occupy a 134 mm opening with eight equal 1 mm gaps`));
      }
    } finally { viewport.destroy(); }
    assert.deepEqual(project, before);
  }
});

test('side-hinged open doors clear extended internal fronts and handles without changing the closed manufacturing model', () => {
  for (const openingMechanism of ['handle', 'push']) for (const doorOpenings of [['left'], ['right'], ['left', 'right']]) {
    const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
    Object.assign(cabinet, { width: 900, height: 860, depth: 580, x: 100, y: 40, z: 250, rotation: 0, plinth: 100,
      layout: { ...createSection('doors'), id: 'drawers-behind-door', doors: doorOpenings.length, doorOpenings, internalDrawerCount: 2, openingMechanism } });
    const manufacturing = generateParts(project), before = structuredClone(project), viewport = viewportFor(project);
    try {
      viewport.setOptions({ doorsOpen: true, internalDrawersOpen: true });
      const internal = viewport.hits.filter(face => ['internal-drawer-front', 'internal-drawer-box', 'internal-drawer-handle'].includes(face.component)).flatMap(face => face.points);
      assert.ok(internal.length);
      const innerLeft = Math.min(...internal.map(point => point[0])), innerRight = Math.max(...internal.map(point => point[0]));
      for (const front of getFrontLayout(cabinet, project)) {
        const door = viewport.hits.filter(face => face.component === 'front' && face.frontIndex === front.index).flatMap(face => face.points);
        assert.ok(door.length);
        const x = door.map(point => point[0]);
        if (front.opening === 'left') assert.ok(Math.max(...x) < innerLeft, 'the left-hinged door slab lies wholly outside the drawer travel envelope');
        else assert.ok(Math.min(...x) > innerRight, 'the right-hinged door slab lies wholly outside the drawer travel envelope');
        const free = door.filter(point => Math.abs(point[2] - (cabinet.z + cabinet.depth + front.width)) < .001);
        assert.ok(free.length > 0, 'the side-hinged door reaches a full 90-degree quarter-turn');
      }
      assert.equal(viewport.hits.some(face => face.component === 'internal-drawer-handle'), openingMechanism === 'handle');
    } finally { viewport.destroy(); }
    assert.deepEqual(project, before);
    assert.deepEqual(generateParts(project), manufacturing, 'only preview motion changes; closed panels, cut contours and edge-band counts remain identical');
  }
});

test('external drawers render exactly five positioned production panels inside thick-body openings and slide with their facade', () => {
  for (const bodyThickness of [18, 30]) for (const legacy of [false, true]) {
    const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
    project.materials.find(stock => stock.id === cabinet.materialId).thickness = bodyThickness;
    Object.assign(cabinet, { width: 800, height: 860, depth: 580, x: 100, y: 40, z: 250, rotation: 0, plinth: 100,
      layout: { ...createSection('drawers'), id: 'external', drawers: 1 } });
    if (legacy) { delete cabinet.layout; cabinet.doors = 0; cabinet.drawers = 1; cabinet.shelves = 0; }
    const [drawer] = getExternalDrawerLayout(cabinet, project), layout = getCabinetLayout(cabinet, project), parts = generateParts(project);
    const panels = parts.filter(part => part.component === 'external-drawer-box'), before = structuredClone(project), viewport = viewportFor(project);
    assert.equal(validateProject(project).filter(issue => issue.level === 'error').length, 0);
    assert.equal(panels.length, 5);
    assert.equal(drawer.box.y, bodyThickness === 30 ? 32 : 22);
    assert.equal(drawer.box.height + drawer.box.bottomThickness, bodyThickness === 30 ? 696 : 716);
    const panelBounds = part => {
      const vertices = viewport.hits.filter(face => face.partId === part.id).flatMap(face => face.points);
      assert.ok(vertices.length, `source panel ${part.name} is visible`);
      return [0, 1, 2].map(axis => [Math.min(...vertices.map(point => point[axis])), Math.max(...vertices.map(point => point[axis]))]);
    };
    try {
      const faces = viewport.hits.filter(face => face.component === 'drawer-box');
      assert.equal(new Set(faces.map(face => face.partId)).size, 5, 'each manufacturing panel is drawn once without manual duplicate boxes');
      assert.ok(faces.every(face => face.partId && face.drawerIndex === drawer.index));
      const stored = new Map();
      for (const part of panels) {
        const bounds = panelBounds(part), size = part.orientation === 'horizontal' ? [part.finishedWidth, part.thickness, part.finishedHeight] : part.orientation === 'vertical-depth' ? [part.thickness, part.finishedHeight, part.finishedWidth] : [part.finishedWidth, part.finishedHeight, part.thickness];
        const position = [cabinet.x + part.position.x, cabinet.y + cabinet.plinth + part.position.y, cabinet.z + part.position.z];
        bounds.forEach(([low, high], axis) => { close(low, position[axis], 'actual panel origin'); close(high - low, size[axis], 'actual finished panel extent'); });
        assert.ok(bounds[1][0] >= cabinet.y + cabinet.plinth + bodyThickness + cabinet.gap);
        assert.ok(bounds[1][1] <= cabinet.y + cabinet.height - bodyThickness - cabinet.gap);
        stored.set(part.id, bounds);
      }
      viewport.setOptions({ doorsOpen: true });
      const section = layout.sections.find(section => section.id === drawer.sectionId), stroke = Math.min((section?.usableDepth ?? drawer.depth ?? layout.bodyDepth) * .48, 260);
      for (const part of panels) {
        const actual = panelBounds(part), previous = stored.get(part.id);
        actual.forEach(([low, high], axis) => { close(low, previous[axis][0] + (axis === 2 ? stroke : 0), 'panel slides with facade'); close(high, previous[axis][1] + (axis === 2 ? stroke : 0), 'panel retains its finished geometry'); });
      }
      const boxVertices = viewport.hits.filter(face => face.component === 'drawer-box').flatMap(face => face.points), facadeVertices = viewport.hits.filter(face => face.component === 'front').flatMap(face => face.points);
      close(Math.max(...boxVertices.map(point => point[2])), Math.min(...facadeVertices.map(point => point[2])), 'extended box front touches facade');
    } finally { viewport.destroy(); }
    assert.deepEqual(project, before);
  }
});
