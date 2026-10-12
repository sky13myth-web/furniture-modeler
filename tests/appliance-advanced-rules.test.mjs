import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProject } from '../src/engine.js';
import { getHardwareSchedule } from '../src/hardware.js';
import { getCountertopRuns, getCountertopCutouts } from '../src/countertop.js';
import { applyQuickFix } from '../src/quick-fix.js';

function baseProject(cabinets = [], extraRoom = {}) {
  return {
    room: { width: 3000, depth: 3000, height: 2700, wallThickness: 150, ...extraRoom },
    settings: { kerf: 4, margin: 10 },
    materials: [{ id: 'mat1', name: 'MDF 18', thickness: 18, sheetWidth: 2800, sheetHeight: 2070 }],
    cabinets
  };
}

function baseCab(id, name, overrides = {}) {
  return {
    id,
    name,
    type: 'base',
    width: 800,
    height: 860,
    depth: 600,
    plinth: 100,
    gap: 2,
    drawerSlideGap: 13,
    edgeBand: 1,
    backThickness: 3,
    x: 100,
    y: 0,
    z: 100,
    materialId: 'mat1',
    backMaterialId: 'mat1',
    ...overrides
  };
}

test('Countertop module exports cutouts for cooktops and sinks', () => {
  const project = baseProject([
    baseCab('base-sink', 'Шкаф с мойкой', {
      x: 100,
      layout: {
        id: 'sec-sink',
        kind: 'section',
        front: 'doors',
        sink: { shape: 'rectangular', width: 780, depth: 500, label: 'Мойка гранитная' }
      }
    }),
    baseCab('base-cooktop', 'Шкаф с плитой', {
      x: 900,
      layout: {
        id: 'sec-cooktop',
        kind: 'section',
        front: 'open',
        cooktop: { width: 590, depth: 520, label: 'Индукционная панель' }
      }
    })
  ]);

  const cutouts = getCountertopCutouts(project);
  assert.equal(cutouts.length, 2, 'Should find 2 cutouts');

  const sinkCutout = cutouts.find(c => c.applianceType === 'sink-rectangular');
  assert.ok(sinkCutout);
  assert.equal(sinkCutout.shape, 'rect');
  assert.equal(sinkCutout.width, 760); // 780 - 20
  assert.equal(sinkCutout.depth, 480); // 500 - 20

  const ctCutout = cutouts.find(c => c.applianceType === 'cooktop');
  assert.ok(ctCutout);
  assert.equal(ctCutout.shape, 'rect');
  assert.equal(ctCutout.width, 560); // 590 - 30
  assert.equal(ctCutout.depth, 490); // 520 - 30

  const runs = getCountertopRuns(project);
  assert.ok(runs.length > 0);
  assert.ok(runs[0].cutouts.length >= 2, 'Countertop run should include cutouts');
});

test('Hardware schedule includes plinth ventilation grille for built-in refrigerator', () => {
  const cabinet = baseCab('cab-fridge', 'Пенал с холодильником', {
    type: 'tall',
    width: 600,
    height: 2100,
    layout: {
      id: 'sec-f',
      kind: 'section',
      front: 'open',
      appliance: { type: 'fridge-builtin', label: 'Встраиваемый холодильник', width: 560, height: 1775, depth: 550 }
    }
  });
  const project = baseProject([cabinet]);

  const schedule = getHardwareSchedule(cabinet, project);
  const ventRow = schedule.rows.find(r => r.kind === 'vent-grille');
  assert.ok(ventRow, 'Vent grille row should be added for fridge-builtin');
  assert.equal(ventRow.quantity, 1);
  assert.equal(schedule.totals.ventGrilles, 1);
});

test('Cooktop width exceeding section width triggers error', () => {
  const project = baseProject([
    baseCab('cab1', 'Шкаф 450', {
      width: 450,
      layout: {
        id: 'sec1',
        kind: 'section',
        front: 'open',
        cooktop: { width: 600, depth: 520, label: 'Широкая варочная панель' }
      }
    })
  ]);

  const warnings = validateProject(project);
  const w = warnings.find(msg => msg.message.includes('ширина варочной панели (600 мм) превышает ширину секции'));
  assert.ok(w, 'Should produce error for cooktop wider than section');
  assert.equal(w.level, 'error');
});

test('Cooktop fire clearance to adjacent tall cabinet (<100mm) triggers warning', () => {
  const project = baseProject([
    baseCab('tall1', 'Пенал', {
      type: 'tall',
      width: 600,
      height: 2100,
      x: 100,
      z: 100
    }),
    baseCab('base-cook', 'База с плитой', {
      width: 600,
      x: 710, // 10mm gap between tall1 (x:100..700) and base-cook (x:710..1310)
      z: 100,
      layout: {
        id: 'sec-cook',
        kind: 'section',
        front: 'open',
        cooktop: { width: 590, depth: 520 }
      }
    })
  ]);

  const warnings = validateProject(project);
  const w = warnings.find(msg => msg.type === 'cooktop-fire-clearance');
  assert.ok(w, 'Should warn about cooktop too close to tall cabinet');
  assert.match(w.message, /термозазор ≥ 100 мм/);
});

test('Sink bowl colliding with shelves produces error and quick-fix removes shelves', () => {
  const project = baseProject([
    baseCab('cab-sink', 'Тумба мойки', {
      width: 800,
      layout: {
        id: 'sec-sink',
        kind: 'section',
        front: 'doors',
        shelves: 2, // Shelves placed in upper sink zone
        sink: { shape: 'rectangular', width: 780, depth: 500, bowlWidth: 400, bowlDepth: 400 }
      }
    })
  ]);

  const warnings = validateProject(project);
  const shelfError = warnings.find(w => w.message.includes('полка в секции') && w.message.includes('пересекает чашу раковины'));
  assert.ok(shelfError, 'Should report error for shelf colliding with sink bowl/siphon');
  assert.ok(shelfError.fix, 'Should offer quick-fix');
  assert.equal(shelfError.fix.type, 'remove-shelves');

  // Apply quick-fix
  const applied = applyQuickFix(project, shelfError.fix);
  assert.ok(applied);
  assert.equal(project.cabinets[0].layout.shelves, 0);

  // Validate again
  const warningsAfter = validateProject(project);
  assert.ok(!warningsAfter.some(w => w.message.includes('пересекает чашу раковины')));
});

test('Microwave above 1500mm triggers ergonomic burn hazard warning', () => {
  const project = baseProject([
    baseCab('cab-tall', 'Пенал с СВЧ', {
      type: 'tall',
      width: 600,
      height: 2200,
      layout: {
        id: 'sec-root',
        kind: 'split',
        axis: 'horizontal',
        children: [
          {
            id: 'sec-mw',
            kind: 'section',
            front: 'open',
            appliance: { type: 'microwave', width: 560, height: 382, depth: 320, label: 'Микроволновка' }
          },
          { id: 'sec-bottom', kind: 'section', front: 'open' }
        ],
        sizes: [450, 1550] // sec-mw at top: y is ~1620mm + plinth 100mm = 1720mm (> 1500mm)
      }
    })
  ]);

  const warnings = validateProject(project);
  const mwWarning = warnings.find(w => w.type === 'microwave-height');
  assert.ok(mwWarning, 'Should warn about microwave placed too high');
  assert.match(mwWarning.message, /1500 мм/);
});

test('Obstacle pipe cutting through built-in oven triggers error', () => {
  const project = baseProject(
    [
      baseCab('cab-oven', 'Шкаф с духовкой', {
        width: 800,
        height: 860,
        depth: 600,
        x: 300,
        y: 0,
        z: 0, // at wall 0 (back wall)
        layout: {
          id: 'sec-oven',
          kind: 'section',
          front: 'open',
          appliance: { type: 'oven', width: 595, height: 595, depth: 550, label: 'Духовой шкаф' }
        }
      })
    ],
    {
      windows: [
        {
          id: 'pipe-1',
          kind: 'pipe',
          wallIndex: 0,
          wall: 'back',
          offset: 400, // x: 400..450 inside cabinet x: 300..1100
          width: 50,
          diameter: 50,
          standoff: 20,
          sill: 0,
          height: 2700
        }
      ]
    }
  );

  const warnings = validateProject(project);
  const colWarning = warnings.find(w => w.type === 'obstacle-appliance-collision');
  assert.ok(colWarning, 'Should produce error that pipe collides with appliance');
  assert.equal(colWarning.level, 'error');
});
