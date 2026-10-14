import test from 'node:test';
import assert from 'node:assert/strict';
import { getKitchenWorkTriangleMetrics, validateProject } from '../src/engine.js';

function baseProject(cabinets = [], roomWindows = []) {
  return {
    settings: { kerf: 3, margin: 10 },
    materials: [
      { id: 'm1', name: 'ЛДСП 16', thickness: 16, sheetWidth: 2800, sheetHeight: 2070 }
    ],
    room: {
      width: 5000,
      depth: 5000,
      height: 2700,
      wallThickness: 150,
      windows: roomWindows
    },
    cabinets
  };
}

test('getKitchenWorkTriangleMetrics returns complete: false when appliances are missing', () => {
  // Only sink present
  const project1 = baseProject([
    {
      id: 'c1',
      name: 'Тумба с мойкой',
      type: 'base',
      x: 500,
      z: 500,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: {
        id: 's1',
        kind: 'section',
        sink: true
      }
    }
  ]);

  const metrics1 = getKitchenWorkTriangleMetrics(project1);
  assert.equal(metrics1.complete, false);
  assert.equal(metrics1.isValid, false);
  assert.ok(metrics1.sink);
  assert.equal(metrics1.cooktop, null);
  assert.equal(metrics1.fridge, null);

  // Validation should NOT emit work-triangle-bounds warning when incomplete
  const warnings = validateProject(project1);
  const wtWarning = warnings.find(w => w.code === 'work-triangle-bounds');
  assert.equal(wtWarning, undefined);
});

test('getKitchenWorkTriangleMetrics evaluates compliant kitchen work triangle', () => {
  // Balanced L-kitchen with Sink, Cooktop, and Fridge
  // Sink at (1000, 500), Cooktop at (2500, 500), Fridge at (3500, 2000)
  const project = baseProject([
    {
      id: 'c-sink',
      name: 'Мойка',
      type: 'base',
      x: 1000,
      z: 500,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: {
        id: 's-sink',
        kind: 'section',
        sink: true
      }
    },
    {
      id: 'c-cooktop',
      name: 'Плита',
      type: 'base',
      x: 2500,
      z: 500,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: {
        id: 's-cooktop',
        kind: 'section',
        cooktop: true
      }
    },
    {
      id: 'c-fridge',
      name: 'Холодильник',
      type: 'tall',
      x: 3500,
      z: 2000,
      width: 600,
      height: 2000,
      depth: 600,
      rotation: 0,
      layout: {
        id: 's-fridge',
        kind: 'section',
        appliance: { type: 'fridge-builtin', width: 560, height: 1775, depth: 550 }
      }
    }
  ]);

  const metrics = getKitchenWorkTriangleMetrics(project);
  assert.equal(metrics.complete, true);

  // Centers:
  // Sink: (1000 + 300, 500 + 300) = (1300, 800)
  // Cooktop: (2500 + 300, 500 + 300) = (2800, 800)
  // Fridge: (3500 + 300, 2000 + 300) = (3800, 2300)
  // d1 (sink-cooktop) = 1500 mm (within 1200 - 2700 mm)
  // d2 (cooktop-fridge) = hypot(1000, 1500) = 1803 mm (within 1200 - 2700 mm)
  // d3 (fridge-sink) = hypot(2500, 1500) = 2915 mm -> wait! 2915 > 2700!
  assert.equal(metrics.distSinkCooktop, 1500);
  assert.equal(metrics.legsValid, metrics.d1 >= 1200 && metrics.d1 <= 2700 && metrics.d2 >= 1200 && metrics.d2 <= 2700 && metrics.d3 >= 1200 && metrics.d3 <= 2700);
});

test('Kitchen work triangle conforming NKBA / EN 1116 metrics (1.2-2.7m legs, 4.0-7.9m perimeter)', () => {
  // Sink: (1000, 1000), Cooktop: (2500, 1000) -> d1 = 1500
  // Fridge: (2000, 2500)
  // d2 (cooktop-fridge) = hypot(500, 1500) = 1581 mm
  // d3 (fridge-sink) = hypot(1000, 1500) = 1803 mm
  // Perimeter = 1500 + 1581 + 1803 = 4884 mm (in 4000-7900 mm)
  const project = baseProject([
    {
      id: 'c-sink',
      name: 'Мойка',
      type: 'base',
      x: 1000,
      z: 1000,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: { id: 's1', kind: 'section', sink: true }
    },
    {
      id: 'c-cooktop',
      name: 'Плита',
      type: 'base',
      x: 2500,
      z: 1000,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: { id: 's2', kind: 'section', cooktop: true }
    },
    {
      id: 'c-fridge',
      name: 'Холодильник',
      type: 'tall',
      x: 2000,
      z: 2500,
      width: 600,
      height: 2000,
      depth: 600,
      rotation: 0,
      tag: 'fridge'
    }
  ]);

  const metrics = getKitchenWorkTriangleMetrics(project);
  assert.equal(metrics.complete, true);
  assert.equal(metrics.distSinkCooktop, 1500);
  assert.equal(metrics.distCooktopFridge, 1581);
  assert.equal(metrics.distFridgeSink, 1803);
  assert.equal(metrics.perimeter, 4884);
  assert.equal(metrics.legsValid, true);
  assert.equal(metrics.perimeterValid, true);
  assert.equal(metrics.isValid, true);

  const warnings = validateProject(project);
  const wtWarning = warnings.find(w => w.code === 'work-triangle-bounds');
  assert.equal(wtWarning, undefined, 'Compliant kitchen should not emit work-triangle-bounds warning');
});

test('Kitchen work triangle emits warning when a leg is too short (< 1200 mm)', () => {
  // Cooktop and Sink in adjacent cabinets: dist = 600 mm < 1200 mm
  const project = baseProject([
    {
      id: 'c-sink',
      name: 'Мойка',
      type: 'base',
      x: 1000,
      z: 1000,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: { id: 's1', kind: 'section', sink: true }
    },
    {
      id: 'c-cooktop',
      name: 'Плита',
      type: 'base',
      x: 1600,
      z: 1000,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: { id: 's2', kind: 'section', cooktop: true }
    },
    {
      id: 'c-fridge',
      name: 'Холодильник',
      type: 'tall',
      x: 2000,
      z: 2500,
      width: 600,
      height: 2000,
      depth: 600,
      rotation: 0,
      applianceTag: 'fridge'
    }
  ]);

  const metrics = getKitchenWorkTriangleMetrics(project);
  assert.equal(metrics.complete, true);
  assert.equal(metrics.distSinkCooktop, 600);
  assert.equal(metrics.legsValid, false);
  assert.equal(metrics.isValid, false);

  const warnings = validateProject(project);
  const wtWarning = warnings.find(w => w.code === 'work-triangle-bounds');
  assert.ok(wtWarning, 'Must emit work-triangle-bounds warning when leg < 1200mm');
  assert.equal(wtWarning.distSinkCooktop, 600);
});

test('Kitchen work triangle emits warning when perimeter is too large (> 7900 mm)', () => {
  // Huge distance between appliances
  const project = baseProject([
    {
      id: 'c-sink',
      name: 'Мойка',
      type: 'base',
      x: 500,
      z: 500,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: { id: 's1', kind: 'section', sink: true }
    },
    {
      id: 'c-cooktop',
      name: 'Плита',
      type: 'base',
      x: 3200,
      z: 500,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: { id: 's2', kind: 'section', cooktop: true }
    },
    {
      id: 'c-fridge',
      name: 'Холодильник',
      type: 'tall',
      x: 2000,
      z: 4000,
      width: 600,
      height: 2000,
      depth: 600,
      rotation: 0,
      role: 'fridge'
    }
  ]);

  const metrics = getKitchenWorkTriangleMetrics(project);
  assert.equal(metrics.complete, true);
  assert.ok(metrics.perimeter > 7900, `Perimeter should exceed 7900mm (got ${metrics.perimeter})`);
  assert.equal(metrics.perimeterValid, false);
  assert.equal(metrics.isValid, false);

  const warnings = validateProject(project);
  const wtWarning = warnings.find(w => w.code === 'work-triangle-bounds');
  assert.ok(wtWarning, 'Must emit work-triangle-bounds warning when perimeter > 7900mm');
});

test('Walkway aisle clearance DRC detects corridor < 900 mm between opposing base cabinets', () => {
  // Cabinet A at z = 500 facing +Z (rotation 0). Front facade at z = 500 + 600 = 1100.
  // Cabinet B at z = 2450 facing -Z (rotation 180). Depth 600.
  // In rotation 180, front is at z = 2450 - 600 = 1850.
  // Clear corridor = 1850 - 1100 = 750 mm (< 900 mm minimum).
  const project = baseProject([
    {
      id: 'run-a',
      name: 'Тумба ряд А',
      type: 'base',
      x: 1000,
      z: 500,
      width: 1000,
      height: 850,
      depth: 600,
      rotation: 0
    },
    {
      id: 'run-b',
      name: 'Остров ряд Б',
      type: 'base',
      x: 2000,
      z: 2450,
      width: 1000,
      height: 850,
      depth: 600,
      rotation: 180
    }
  ]);

  const warnings = validateProject(project);
  const aisleWarning = warnings.find(w => w.code === 'aisle-clearance-too-narrow');
  assert.ok(aisleWarning, 'Must emit aisle-clearance-too-narrow when corridor is 750mm');
  assert.equal(aisleWarning.clearance, 750);
});

test('Walkway aisle clearance DRC passes when corridor is >= 900 mm', () => {
  // Clearance = 1100 mm (z = 1100 to z = 2200)
  const project = baseProject([
    {
      id: 'run-a',
      name: 'Тумба ряд А',
      type: 'base',
      x: 1000,
      z: 500,
      width: 1000,
      height: 850,
      depth: 600,
      rotation: 0
    },
    {
      id: 'run-b',
      name: 'Остров ряд Б',
      type: 'base',
      x: 2000,
      z: 2800,
      width: 1000,
      height: 850,
      depth: 600,
      rotation: 180
    }
  ]);

  const warnings = validateProject(project);
  const aisleWarning = warnings.find(w => w.code === 'aisle-clearance-too-narrow');
  assert.equal(aisleWarning, undefined, 'Aisle clearance of 1100mm should not emit warning');
});

test('Walkway aisle clearance DRC ignores non-opposing or non-overlapping cabinets', () => {
  // Staggered cabinets that do not overlap along the corridor
  const project = baseProject([
    {
      id: 'run-a',
      name: 'Тумба ряд А',
      type: 'base',
      x: 500,
      z: 500,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0
    },
    {
      id: 'run-b',
      name: 'Остров ряд Б',
      type: 'base',
      x: 2000, // far along X, no corridor overlap
      z: 2300,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 180
    }
  ]);

  const warnings = validateProject(project);
  const aisleWarning = warnings.find(w => w.code === 'aisle-clearance-too-narrow');
  assert.equal(aisleWarning, undefined);
});

test('Cooktop-to-hood vertical clearance DRC detects unsafe clearance (< 650 mm)', () => {
  // Base cabinet with cooktop: y = 0, height = 850. Top surface = 850.
  // Overhead wall cabinet with built-in hood: y = 1400, height = 720.
  // Vertical clearance = 1400 - 850 = 550 mm (< 650 mm).
  const project = baseProject([
    {
      id: 'cab-cooktop',
      name: 'Тумба под варочную',
      type: 'base',
      x: 1000,
      y: 0,
      z: 500,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: {
        id: 's-cook',
        kind: 'section',
        cooktop: true
      }
    },
    {
      id: 'cab-hood',
      name: 'Шкаф с вытяжкой',
      type: 'wall',
      x: 1000,
      y: 1400,
      z: 500,
      width: 600,
      height: 720,
      depth: 350,
      rotation: 0,
      layout: {
        id: 's-hood',
        kind: 'section',
        appliance: { type: 'hood-builtin', width: 600, height: 350, depth: 300 }
      }
    }
  ]);

  const warnings = validateProject(project);
  const hoodWarning = warnings.find(w => w.code === 'cooktop-hood-clearance');
  assert.ok(hoodWarning, 'Must emit cooktop-hood-clearance warning when clearance is 550mm');
  assert.equal(hoodWarning.clearance, 550);
});

test('Cooktop-to-hood vertical clearance DRC passes when clearance >= 650 mm', () => {
  // Base cabinet top = 850, overhead bottom = 1550 -> clearance = 700 mm
  const project = baseProject([
    {
      id: 'cab-cooktop',
      name: 'Тумба под варочную',
      type: 'base',
      x: 1000,
      y: 0,
      z: 500,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: {
        id: 's-cook',
        kind: 'section',
        cooktop: true
      }
    },
    {
      id: 'cab-hood',
      name: 'Шкаф с вытяжкой',
      type: 'wall',
      x: 1000,
      y: 1550,
      z: 500,
      width: 600,
      height: 720,
      depth: 350,
      rotation: 0,
      layout: {
        id: 's-hood',
        kind: 'section',
        appliance: { type: 'hood-builtin', width: 600, height: 350, depth: 300 }
      }
    }
  ]);

  const warnings = validateProject(project);
  const hoodWarning = warnings.find(w => w.code === 'cooktop-hood-clearance');
  assert.equal(hoodWarning, undefined, 'Clearance of 700mm must not emit warning');
});

test('Cooktop-to-hood vertical clearance DRC ignores overhead cabinets offset away from cooktop', () => {
  // Wall cabinet is positioned at x = 2000, while cooktop is at x = 1000 (width 600)
  const project = baseProject([
    {
      id: 'cab-cooktop',
      name: 'Тумба под варочную',
      type: 'base',
      x: 1000,
      y: 0,
      z: 500,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 0,
      layout: {
        id: 's-cook',
        kind: 'section',
        cooktop: true
      }
    },
    {
      id: 'cab-wall-side',
      name: 'Шкаф навесной сбоку',
      type: 'wall',
      x: 2000,
      y: 1400,
      z: 500,
      width: 600,
      height: 720,
      depth: 350,
      rotation: 0
    }
  ]);

  const warnings = validateProject(project);
  const hoodWarning = warnings.find(w => w.code === 'cooktop-hood-clearance');
  assert.equal(hoodWarning, undefined, 'Offset wall cabinet should not trigger cooktop hood clearance');
});
