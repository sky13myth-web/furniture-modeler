import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, createSection, validateProject, generateParts } from '../src/engine.js';
import {
  quickFixSplitShelfSpan,
  quickFixAdjustCabinetWidth,
  quickFixAdjustCabinetHeight,
  quickFixAdjustCabinetDepth,
  quickFixFitAppliance,
  quickFixObstacleCutout,
  applyQuickFix
} from '../src/quick-fix.js';
import { createPartSvg, createAssemblySvg } from '../src/renderer.js';

test('quickFixSplitShelfSpan splits an over-wide shelf section vertically', () => {
  const project = createDefaultProject();
  const cab = project.cabinets[0];
  cab.width = 1200;
  cab.layout = { ...createSection('open'), shelves: 2 };

  const warningsBefore = validateProject(project);
  const shelfWarning = warningsBefore.find(w => w.fix?.type === 'split-vertical');
  assert.ok(shelfWarning, 'Warning with split-vertical fix exists');

  const ok = applyQuickFix(project, shelfWarning.fix);
  assert.ok(ok, 'applyQuickFix returned true');
  assert.equal(cab.layout.kind, 'split', 'Layout was converted to vertical split');
  assert.equal(cab.layout.axis, 'vertical');
  assert.equal(cab.layout.children.length, 2);
  assert.equal(cab.layout.children[0].shelves, 2);
  assert.equal(cab.layout.children[1].shelves, 2);

  const warningsAfter = validateProject(project);
  assert.ok(!warningsAfter.some(w => w.fix?.type === 'split-vertical'), 'Shelf span warning resolved after split');
});

test('quickFixAdjustCabinet dimensions adjust width, height, and depth', () => {
  const project = createDefaultProject();
  const cab = project.cabinets[0];

  assert.ok(applyQuickFix(project, { type: 'adjust-cabinet-width', cabinetId: cab.id, targetWidth: 750 }));
  assert.equal(cab.width, 750);

  assert.ok(applyQuickFix(project, { type: 'adjust-cabinet-height', cabinetId: cab.id, targetHeight: 900 }));
  assert.equal(cab.height, 900);

  assert.ok(applyQuickFix(project, { type: 'adjust-cabinet-depth', cabinetId: cab.id, targetDepth: 560 }));
  assert.equal(cab.depth, 560);
});

test('quickFixFitAppliance widens and deepens cabinet/section to fit built-in appliance', () => {
  const project = createDefaultProject();
  const cab = project.cabinets[0];
  cab.width = 500;
  cab.depth = 500;
  cab.layout = {
    ...createSection('open'),
    id: 'oven-sec',
    appliance: {
      type: 'oven',
      width: 595,
      height: 595,
      depth: 550,
      minWidth: 560,
      minHeight: 585,
      minDepth: 550
    }
  };

  const warnings = validateProject(project);
  const fitWarning = warnings.find(w => w.fix?.type === 'fit-appliance');
  assert.ok(fitWarning, 'Appliance fit warning exists');

  const ok = applyQuickFix(project, fitWarning.fix);
  assert.ok(ok, 'Appliance fit quick-fix applied');
  assert.ok(cab.width >= 560 + 36, 'Cabinet width expanded to house appliance');
  assert.ok(cab.depth >= 550, 'Cabinet depth expanded to house appliance');
});

test('quickFixObstacleCutout configures cabinet rear cutout notch', () => {
  const project = createDefaultProject();
  const cab = project.cabinets[0];

  const fix = {
    type: 'obstacle-cutout',
    cabinetId: cab.id,
    cutout: { corner: 'left', width: 120, depth: 80 }
  };
  assert.ok(applyQuickFix(project, fix));
  assert.deepEqual(cab.cutout, { corner: 'left', width: 120, depth: 80 });
});

test('EN 1116 safety distance check flags cooktop too close to sink and rear ventilation for ovens', () => {
  const project = createDefaultProject();
  const cabCooktop = project.cabinets[0];
  cabCooktop.type = 'base';
  cabCooktop.x = 10;
  cabCooktop.z = 10;
  cabCooktop.width = 600;
  cabCooktop.layout = {
    ...createSection('open'),
    appliance: { type: 'cooktop', width: 560, height: 50, depth: 520 }
  };

  const cabSink = createCabinet('base', project, {
    x: 620,
    z: 10,
    width: 600
  });
  cabSink.layout = {
    ...createSection('open'),
    appliance: { type: 'sink-round', width: 500, height: 200, depth: 500 }
  };
  project.cabinets.push(cabSink);

  const warnings = validateProject(project);
  const en1116Warning = warnings.find(w => w.type === 'en1116-cooktop-sink');
  assert.ok(en1116Warning, 'EN 1116 clearance warning detected between cooktop and sink (< 400 mm)');
  assert.ok(en1116Warning.message.includes('EN 1116') || en1116Warning.message.includes('400 мм'));
});

test('oven rear ventilation gap rule triggers warning and provides fix if rear gap < 45mm', () => {
  const project = createDefaultProject();
  const cab = project.cabinets[0];
  cab.depth = 580;
  cab.layout = {
    ...createSection('open'),
    appliance: {
      type: 'oven',
      width: 560,
      height: 590,
      depth: 550
    }
  };

  const warnings = validateProject(project);
  const ventWarning = warnings.find(w => w.type === 'appliance-oven-ventilation');
  assert.ok(ventWarning, 'Oven rear ventilation gap warning detected');
  assert.ok(ventWarning.fix, 'Ventilation quick-fix is provided');
  assert.equal(ventWarning.fix.type, 'adjust-cabinet-depth');
});

test('grain direction indicators are rendered in part SVG and assembly drawings', () => {
  const project = createDefaultProject('tr');
  const parts = generateParts(project);
  const grained = parts.find(p => p.grain);
  assert.ok(grained, 'Found a part with grain: true');

  const partSvg = createPartSvg(grained, project, { language: 'ru' });
  assert.match(partSvg, /data-grain-axis="B"/);
  assert.ok(partSvg.includes('Текстура') || partSvg.includes('Doku'));

  const assemblySvg = createAssemblySvg(project, { cabinetId: project.cabinets[0].id, language: 'ru' });
  assert.ok(assemblySvg.includes('Текстура') || assemblySvg.includes('Doku') || assemblySvg.includes('Grain'));
});
