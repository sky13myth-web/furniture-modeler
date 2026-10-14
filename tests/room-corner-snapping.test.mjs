import test from 'node:test';
import assert from 'node:assert/strict';
import { snapCabinetToNeighbour } from '../src/room-geometry.js';
import { validateProject } from '../src/engine.js';

function baseProject(cabinets = []) {
  return {
    settings: { kerf: 3, margin: 10 },
    materials: [
      { id: 'm1', name: 'ЛДСП 16', thickness: 16, sheetWidth: 2800, sheetHeight: 2070 }
    ],
    room: {
      width: 4000,
      depth: 4000,
      height: 2700,
      wallThickness: 150,
      windows: []
    },
    cabinets
  };
}

test('snapCabinetToNeighbour applies default 50 mm corner filler post for Candidate 3 (L-Corner Right)', () => {
  const existing = [
    { id: 'c-base', x: 1000, z: 500, width: 800, depth: 600, rotation: 0 }
  ];

  // Dragging incoming cabinet near the right perpendicular corner (1000 + 800 = 1800, 500 + 650 = 1150)
  const incoming = { id: 'c-right', x: 1810, z: 1145, width: 600, depth: 600, rotation: 0 };
  const snapped = snapCabinetToNeighbour(incoming, existing);

  // Position should be offset by 50 mm corner filler allowance
  assert.equal(snapped.x, 1800);
  assert.equal(snapped.z, 500 + 600 + 50); // 1150
  assert.equal(snapped.rotation, 90);
});

test('snapCabinetToNeighbour supports explicit options.cornerFillerWidth for Candidate 3', () => {
  const existing = [
    { id: 'c-base', x: 1000, z: 500, width: 800, depth: 600, rotation: 0 }
  ];

  const incoming = { id: 'c-right', x: 1810, z: 1160, width: 600, depth: 600, rotation: 0 };
  const snapped = snapCabinetToNeighbour(incoming, existing, { cornerFillerWidth: 65 });

  assert.equal(snapped.x, 1800);
  assert.equal(snapped.z, 500 + 600 + 65); // 1165
  assert.equal(snapped.rotation, 90);
});

test('snapCabinetToNeighbour applies default 50 mm corner filler post for Candidate 4 (L-Corner Left)', () => {
  const existing = [
    { id: 'c-base', x: 1000, z: 500, width: 800, depth: 600, rotation: 0 }
  ];

  // For Candidate 4 on left side:
  // candCornerLeftX = oX - (dA + wB + cornerFillerWidth) * sinA = 1000 - 0 = 1000
  // candCornerLeftZ = oZ + (dA + wB + cornerFillerWidth) * cosA = 500 + (600 + 600 + 50) = 1750
  const incoming = { id: 'c-left', x: 1010, z: 1740, width: 600, depth: 600, rotation: 0 };
  const snapped = snapCabinetToNeighbour(incoming, existing);

  assert.equal(snapped.x, 1000);
  assert.equal(snapped.z, 1750);
  assert.equal(snapped.rotation, 270);
});

test('snapCabinetToNeighbour retains flush 0 mm offset against blind corner cabinet', () => {
  const existing = [
    { id: 'c-corner', x: 0, z: 0, width: 1000, depth: 580, rotation: 0, cornerType: 'blind', blindSide: 'right' }
  ];

  const incoming = { id: 'c-new', x: 1010, z: 575, width: 800, depth: 580, rotation: 0 };
  const snapped = snapCabinetToNeighbour(incoming, existing, 40);

  // Blind corner cabinet includes its own blind panel, so filler offset is 0
  assert.equal(snapped.x, 1000);
  assert.equal(snapped.z, 580);
  assert.equal(snapped.rotation, 90);
});

test('DRC validates corner filler clearance and warns when clearance is < 40 mm', () => {
  // Two standard base cabinets placed at 90° with 0 filler clearance
  // Cabinet A: x = 0, z = 0, width = 800, depth = 600, rot = 0 (front at z = 600)
  // Cabinet B: x = 800, z = 600, width = 600, depth = 600, rot = 90 (starts right at z = 600 -> clearance = 0)
  const project = baseProject([
    {
      id: 'cab-a',
      name: 'Тумба ряд А',
      type: 'base',
      x: 0,
      z: 0,
      width: 800,
      height: 850,
      depth: 600,
      rotation: 0
    },
    {
      id: 'cab-b',
      name: 'Тумба ряд Б',
      type: 'base',
      x: 800,
      z: 600,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 90
    }
  ]);

  const warnings = validateProject(project);
  const cornerWarning = warnings.find(w => w.code === 'corner-filler-clearance');
  assert.ok(cornerWarning, 'Must emit corner-filler-clearance warning for 0mm clearance corner');
  assert.equal(cornerWarning.clearance, 0);
});

test('DRC passes when 90° corner has adequate filler clearance (>= 40 mm)', () => {
  // Cabinet B placed with 50 mm corner filler post: z = 650 (clearance = 50 mm >= 40 mm)
  const project = baseProject([
    {
      id: 'cab-a',
      name: 'Тумба ряд А',
      type: 'base',
      x: 0,
      z: 0,
      width: 800,
      height: 850,
      depth: 600,
      rotation: 0
    },
    {
      id: 'cab-b',
      name: 'Тумба ряд Б',
      type: 'base',
      x: 800,
      z: 650,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 90
    }
  ]);

  const warnings = validateProject(project);
  const cornerWarning = warnings.find(w => w.code === 'corner-filler-clearance');
  assert.equal(cornerWarning, undefined, '50mm filler post clearance must not emit warning');
});

test('DRC ignores corner filler check when junction uses a blind corner cabinet', () => {
  const project = baseProject([
    {
      id: 'cab-corner',
      name: 'Угловой шкаф',
      type: 'corner-base',
      cornerType: 'blind',
      x: 0,
      z: 0,
      width: 1000,
      height: 850,
      depth: 600,
      rotation: 0
    },
    {
      id: 'cab-adj',
      name: 'Примыкающая тумба',
      type: 'base',
      x: 1000,
      z: 600,
      width: 600,
      height: 850,
      depth: 600,
      rotation: 90
    }
  ]);

  const warnings = validateProject(project);
  const cornerWarning = warnings.find(w => w.code === 'corner-filler-clearance');
  assert.equal(cornerWarning, undefined, 'Blind corner cabinet must not trigger corner filler clearance warning');
});
