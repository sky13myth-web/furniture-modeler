import test from 'node:test';
import assert from 'node:assert/strict';
import { createCabinet, generateParts, createDefaultProject, isTraverseRailCabinet, getSectionMountingAxes } from '../src/engine.js';
import { makeScene } from '../src/renderer.js';
import { translatePartName } from '../src/print-i18n.js';
import { validateProjectSchema } from '../src/project-io.js';

test('isTraverseRailCabinet determines when traverse rails are active', () => {
  assert.equal(isTraverseRailCabinet(null), false);
  assert.equal(isTraverseRailCabinet({ type: 'wall', countertop: false }), false);
  assert.equal(isTraverseRailCabinet({ type: 'base', countertop: true }), true);
  assert.equal(isTraverseRailCabinet({ type: 'corner-base', countertop: true }), true);
  assert.equal(isTraverseRailCabinet({ type: 'base', countertop: false }), false);
  assert.equal(isTraverseRailCabinet({ type: 'base', countertop: true, topType: 'solid' }), false);
  assert.equal(isTraverseRailCabinet({ type: 'base', countertop: true, topRailMode: false }), false);
  assert.equal(isTraverseRailCabinet({ type: 'wall', topType: 'rails' }), true);
  assert.equal(isTraverseRailCabinet({ type: 'wall', topRailMode: true }), true);
});

test('createCabinet base preset generates dual traverse rails instead of solid top', () => {
  const project = createDefaultProject();
  const baseCab = createCabinet('base', project);
  project.cabinets = [baseCab];

  assert.equal(baseCab.topType, 'rails');
  assert.equal(baseCab.topRailWidth, 80);

  const parts = generateParts(project);
  const topPanel = parts.find(p => p.name === 'Крышка');
  assert.equal(topPanel, undefined, 'Base cabinet with rails should not generate Крышка');

  const frontRail = parts.find(p => p.name === 'Царга передняя');
  const rearRail = parts.find(p => p.name === 'Царга задняя');
  assert.ok(frontRail, 'Front rail should exist');
  assert.ok(rearRail, 'Rear rail should exist');

  const thickness = 18;
  const expectedWidth = baseCab.width - 2 * thickness; // 800 - 36 = 764
  assert.equal(frontRail.finishedWidth, expectedWidth);
  assert.equal(frontRail.finishedHeight, 80);
  assert.equal(frontRail.thickness, thickness);
  assert.equal(frontRail.role, 'top-rail');
  assert.equal(frontRail.component, 'top');

  assert.equal(rearRail.finishedWidth, expectedWidth);
  assert.equal(rearRail.finishedHeight, 80);
  assert.equal(rearRail.thickness, thickness);
  assert.equal(rearRail.role, 'top-rail');
  assert.equal(rearRail.component, 'top');

  // Verify coordinates
  const bodyHeight = baseCab.height - baseCab.plinth; // 860 - 100 = 760
  const expectedY = bodyHeight - thickness; // 760 - 18 = 742
  assert.equal(frontRail.position.y, expectedY);
  assert.equal(rearRail.position.y, expectedY);

  const backThick = baseCab.backThickness; // 3
  assert.equal(rearRail.position.z, backThick);
  const bodyDepth = baseCab.depth - backThick; // 580 - 3 = 577
  assert.equal(frontRail.position.z, backThick + bodyDepth - 80);
});

test('base cabinet with topType: solid generates full Крышка and zero stretchers', () => {
  const project = createDefaultProject();
  const baseCab = createCabinet('base', project, { topType: 'solid' });
  project.cabinets = [baseCab];

  const parts = generateParts(project);
  const topPanel = parts.find(p => p.name === 'Крышка');
  assert.ok(topPanel, 'Solid top panel must be generated');
  assert.equal(parts.find(p => p.name === 'Царга передняя'), undefined);
  assert.equal(parts.find(p => p.name === 'Царга задняя'), undefined);
  assert.equal(topPanel.finishedWidth, baseCab.width - 36);
  assert.equal(topPanel.finishedHeight, baseCab.depth - baseCab.backThickness);
});

test('corner-base cabinet preset generates dual traverse rails', () => {
  const project = createDefaultProject();
  const cornerCab = createCabinet('corner-base', project);
  project.cabinets = [cornerCab];

  const parts = generateParts(project);
  assert.equal(parts.find(p => p.name === 'Крышка'), undefined);
  const frontRail = parts.find(p => p.name === 'Царга передняя');
  const rearRail = parts.find(p => p.name === 'Царга задняя');
  assert.ok(frontRail);
  assert.ok(rearRail);
  assert.equal(frontRail.finishedHeight, 80);
  assert.equal(rearRail.finishedHeight, 80);
});

test('wall and tall cabinets retain solid top panel by default', () => {
  const project = createDefaultProject();
  const wallCab = createCabinet('wall', project);
  const tallCab = createCabinet('tall', project);

  project.cabinets = [wallCab];
  let parts = generateParts(project);
  assert.ok(parts.find(p => p.name === 'Крышка'), 'Wall cabinet should have Крышка');
  assert.equal(parts.find(p => p.name === 'Царга передняя'), undefined);

  project.cabinets = [tallCab];
  parts = generateParts(project);
  assert.ok(parts.find(p => p.name === 'Крышка'), 'Tall cabinet should have Крышка');
  assert.equal(parts.find(p => p.name === 'Царга передняя'), undefined);
});

test('rear corner cutout clips rear rail while leaving front rail intact', () => {
  const project = createDefaultProject();
  const baseCab = createCabinet('base', project, {
    cutout: { corner: 'back-left', width: 150, depth: 120 }
  });
  project.cabinets = [baseCab];

  const parts = generateParts(project);
  const frontRail = parts.find(p => p.name === 'Царга передняя');
  const rearRail = parts.find(p => p.name === 'Царга задняя');

  assert.ok(frontRail);
  assert.ok(rearRail);

  // Front rail is unaffected by rear cutout
  assert.equal(frontRail.outline, undefined, 'Front rail should be a full simple rectangle');
  assert.equal(frontRail.finishedHeight, 80);

  // Rear rail has cutout clipping
  assert.ok(rearRail.outline !== undefined || rearRail.width < baseCab.width - 36, 'Rear rail must reflect notch');
});

test('traverse rails have grain along length and front edge banding', () => {
  const project = createDefaultProject();
  const baseCab = createCabinet('base', project);
  baseCab.materialId = 'mdf-oak';
  project.cabinets = [baseCab];

  const parts = generateParts(project);
  const frontRail = parts.find(p => p.name === 'Царга передняя');
  const rearRail = parts.find(p => p.name === 'Царга задняя');

  assert.equal(frontRail.grainAlongLength, true);
  assert.equal(frontRail.grainAxis, 'width');
  assert.equal(rearRail.grainAlongLength, true);
  assert.equal(rearRail.grainAxis, 'width');

  // Contact ends are raw (0 edge band), front face edge is banded
  assert.equal(frontRail.edges.left, 0);
  assert.equal(frontRail.edges.right, 0);
  assert.ok(frontRail.edges.bottom > 0, 'Front edge of front rail must be banded');

  assert.equal(rearRail.edges.left, 0);
  assert.equal(rearRail.edges.right, 0);
  assert.ok(rearRail.edges.bottom > 0, 'Interior edge of rear rail must be banded');
});

test('getSectionMountingAxes supports base cabinets with traverse rails', () => {
  const project = createDefaultProject();
  const baseCab = createCabinet('base', project);
  project.cabinets = [baseCab];

  const axes = getSectionMountingAxes(baseCab, project);
  assert.ok(axes.length > 0);
  const mainSection = axes[0];
  assert.notEqual(mainSection.top, null, 'Top mounting axis must not be null');
  assert.notEqual(mainSection.bottom, null, 'Bottom mounting axis must not be null');
  assert.ok(mainSection.height > 0);
});

test('makeScene renders 3D mesh with traverse rails without errors', () => {
  const project = createDefaultProject();
  const baseCab = createCabinet('base', project);
  project.cabinets = [baseCab];

  const scene = makeScene(project, { room: false, allFaces: true });
  assert.ok(scene.faces.length > 0);
  for (const face of scene.faces) {
    assert.ok(Array.isArray(face.points));
    for (const point of face.points) {
      assert.ok(Number.isFinite(point[0]));
      assert.ok(Number.isFinite(point[1]));
      assert.ok(Number.isFinite(point[2]));
    }
  }
});

test('localization translates stretcher names into TR and EN', () => {
  assert.equal(translatePartName('Царга передняя', 'ru'), 'Царга передняя');
  assert.equal(translatePartName('Царга передняя', 'tr'), 'Ön üst kuşak');
  assert.equal(translatePartName('Царга передняя', 'en'), 'Front stretcher');

  assert.equal(translatePartName('Царга задняя', 'ru'), 'Царга задняя');
  assert.equal(translatePartName('Царга задняя', 'tr'), 'Arka üst kuşak');
  assert.equal(translatePartName('Царга задняя', 'en'), 'Rear stretcher');
});

test('project-io validates topType, topRailMode, and topRailWidth', () => {
  const project = createDefaultProject();
  project.cabinets = [createCabinet('base', project, { topType: 'rails', topRailWidth: 90, topRailMode: true })];

  assert.doesNotThrow(() => validateProjectSchema(project));

  project.cabinets[0].topType = 'invalid-type';
  assert.throws(() => validateProjectSchema(project), /тип верха корпуса/);

  project.cabinets[0].topType = 'rails';
  project.cabinets[0].topRailWidth = -10;
  assert.throws(() => validateProjectSchema(project), /ширина царги/);

  project.cabinets[0].topRailWidth = 80;
  project.cabinets[0].topRailMode = 'not-a-bool';
  assert.throws(() => validateProjectSchema(project), /планки вместо крышки/);
});

test('traverse rails prevent 3D bounding box overlap under high topRailWidth on shallow base cabinet', () => {
  const project = createDefaultProject();
  const baseCab = createCabinet('base', project, { depth: 183, topRailWidth: 100 });
  project.cabinets = [baseCab];

  const parts = generateParts(project);
  const frontRail = parts.find(p => p.name === 'Царга передняя');
  const rearRail = parts.find(p => p.name === 'Царга задняя');

  assert.ok(frontRail, 'Front rail should be generated');
  assert.ok(rearRail, 'Rear rail should be generated');

  const rearZMin = rearRail.position.z;
  const rearZMax = rearRail.position.z + rearRail.finishedHeight;
  const frontZMin = frontRail.position.z;
  const frontZMax = frontRail.position.z + frontRail.finishedHeight;

  // Assert rear rail finishes before front rail starts (zero Z-axis overlap with >= 20mm physical gap)
  assert.ok(rearZMax <= frontZMin, `Rear rail [${rearZMin}, ${rearZMax}] overlaps front rail [${frontZMin}, ${frontZMax}]`);
  assert.ok(frontZMin - rearZMax >= 20, `Expected at least 20mm gap between rails, got ${frontZMin - rearZMax}mm`);
});

