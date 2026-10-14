import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, createSection } from '../src/engine.js';
import { getProjectCostEstimate, generateCostHTML, getPriceSettings } from '../src/pricing.js';
import { getPricingPreferences, applyPricingPreferences } from '../src/pricing-preferences.js';
import { getCountertopRuns } from '../src/countertop.js';

test('linear-meter countertop pricing calculates runs and applies default rate', () => {
  const project = createDefaultProject('ru');
  const cab1 = createCabinet('base', project, { width: 600, height: 820, depth: 560, x: 0, z: 0, rotation: 0 });
  const cab2 = createCabinet('base', project, { width: 600, height: 820, depth: 560, x: 600, z: 0, rotation: 0 });
  project.cabinets = [cab1, cab2];

  const estimate = getProjectCostEstimate(project);
  const slabRow = estimate.rows.find(r => r.id === 'countertopSlab');
  assert.ok(slabRow, 'countertopSlab row should be present');
  assert.equal(slabRow.kind, 'countertop');
  assert.equal(slabRow.unit, 'meter');
  // Total length = 1200 + 2 * 15 (side overhangs) = 1230mm = 1.23m
  assert.equal(slabRow.quantity, 1.23);
  assert.equal(slabRow.unitPrice, 1385);
  assert.equal(slabRow.cost, Math.round(1.23 * 1385 * 100) / 100);
});

test('square-meter countertop pricing calculates area and applies sqm rate', () => {
  const project = createDefaultProject('ru');
  const cab1 = createCabinet('base', project, { width: 800, height: 820, depth: 560, x: 0, z: 0, rotation: 0 });
  project.cabinets = [cab1];
  project.settings.pricing = { countertopPricingMode: 'square-meter' };

  const estimate = getProjectCostEstimate(project);
  const slabRow = estimate.rows.find(r => r.id === 'countertopSlab');
  assert.ok(slabRow);
  assert.equal(slabRow.unit, 'sqm');
  assert.equal(slabRow.unitPrice, 2250);
  // Length = 800 + 30 = 830mm, Depth = 560 + 38 = 598mm. Area = 830 * 598 = 496340 mm² = 0.496 m²
  assert.equal(slabRow.quantity, 0.496);
  assert.equal(slabRow.cost, Math.round(0.496 * 2250 * 100) / 100);
});

test('appliance cutouts for sink and cooktop are priced as service rows', () => {
  const project = createDefaultProject('ru');
  const cab1 = createCabinet('base', project, {
    width: 800,
    height: 820,
    depth: 560,
    x: 0,
    z: 0,
    rotation: 0,
    appliance: { type: 'cooktop' }
  });
  const cab2 = createCabinet('base', project, {
    width: 800,
    height: 820,
    depth: 560,
    x: 800,
    z: 0,
    rotation: 0,
    appliance: { type: 'sink-rectangular' }
  });
  project.cabinets = [cab1, cab2];

  const estimate = getProjectCostEstimate(project);
  const cooktopRow = estimate.rows.find(r => r.id === 'cooktopCutouts');
  const sinkRow = estimate.rows.find(r => r.id === 'sinkCutouts');

  assert.ok(cooktopRow, 'cooktopCutouts row should exist');
  assert.equal(cooktopRow.kind, 'service');
  assert.equal(cooktopRow.quantity, 1);
  assert.equal(cooktopRow.unitPrice, 350);
  assert.equal(cooktopRow.cost, 350);

  assert.ok(sinkRow, 'sinkCutouts row should exist');
  assert.equal(sinkRow.kind, 'service');
  assert.equal(sinkRow.quantity, 1);
  assert.equal(sinkRow.unitPrice, 350);
  assert.equal(sinkRow.cost, 350);
});

test('missing countertop price invalidates completeness', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, { width: 600, height: 820, depth: 560 });
  project.cabinets = [cab];
  project.settings.pricing = { countertopPricePerMeter: null };

  const estimate = getProjectCostEstimate(project);
  assert.equal(estimate.complete, false);
  assert.equal(estimate.total, null);
  assert.ok(estimate.missingPrices.some(r => r.id === 'countertopSlab'));
});

test('generateCostHTML outputs localized countertop rows without Cyrillic in foreign languages', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, {
    width: 800,
    height: 820,
    depth: 560,
    appliance: { type: 'sink-rectangular' }
  });
  project.cabinets = [cab];

  const htmlRu = generateCostHTML(project, { language: 'ru' });
  assert.ok(htmlRu.includes('Столешница (погонные метры)'));
  assert.ok(htmlRu.includes('Вырез под мойку'));

  const htmlTr = generateCostHTML(project, { language: 'tr' });
  assert.ok(htmlTr.includes('Tezgah (tül metre)'));
  assert.ok(htmlTr.includes('Evye yeri kesimi'));

  const htmlEn = generateCostHTML(project, { language: 'en' });
  assert.ok(htmlEn.includes('Countertop (linear meters)'));
  assert.ok(htmlEn.includes('Sink cutout'));
});

test('pricing-preferences saves and restores countertop rates', () => {
  const project = createDefaultProject('ru');
  project.settings.pricing = {
    countertopPricePerMeter: 1500,
    countertopPricePerSquareMeter: 2400,
    sinkCutoutPrice: 400,
    cooktopCutoutPrice: 450
  };

  const prefs = getPricingPreferences(project);
  assert.equal(prefs.rates.countertopPricePerMeter, 1500);
  assert.equal(prefs.rates.countertopPricePerSquareMeter, 2400);
  assert.equal(prefs.rates.sinkCutoutPrice, 400);
  assert.equal(prefs.rates.cooktopCutoutPrice, 450);

  const newProject = createDefaultProject('ru');
  const restored = applyPricingPreferences(newProject, prefs);
  assert.equal(restored.settings.pricing.countertopPricePerMeter, 1500);
  assert.equal(restored.settings.pricing.countertopPricePerSquareMeter, 2400);
  assert.equal(restored.settings.pricing.sinkCutoutPrice, 400);
  assert.equal(restored.settings.pricing.cooktopCutoutPrice, 450);
});

test('projects without base cabinets or countertops have zero countertop rows (backward compatible)', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('tall', project, { width: 600, height: 2200, depth: 560 });
  project.cabinets = [cab];

  const estimate = getProjectCostEstimate(project);
  assert.equal(estimate.rows.some(r => r.id === 'countertopSlab'), false);
  assert.equal(estimate.rows.some(r => r.id === 'sinkCutouts'), false);
  assert.equal(estimate.rows.some(r => r.id === 'cooktopCutouts'), false);
});

test('U-shaped kitchen produces 3 distinct countertop wings and accurate linear and square-meter pricing', () => {
  const project = createDefaultProject('ru');
  project.cabinets = [
    createCabinet('base', project, { id: 'c1', width: 800, height: 820, depth: 600, x: 0, z: 0, rotation: 0 }),
    createCabinet('base', project, { id: 'c2', width: 800, height: 820, depth: 600, x: 800, z: 0, rotation: 0 }),
    createCabinet('base', project, { id: 'c3', width: 800, height: 820, depth: 600, x: 1600, z: 600, rotation: 90 }),
    createCabinet('base', project, { id: 'c4', width: 800, height: 820, depth: 600, x: 1600, z: 1400, rotation: 90 }),
    createCabinet('base', project, { id: 'c5', width: 800, height: 820, depth: 600, x: 1600, z: 2000, rotation: 180 }),
    createCabinet('base', project, { id: 'c6', width: 800, height: 820, depth: 600, x: 800, z: 2000, rotation: 180 })
  ];

  const runs = getCountertopRuns(project);
  assert.equal(runs.length, 1, 'U-shaped cabinets should form 1 continuous run');
  assert.equal(runs[0].isCorner, true);
  assert.equal(runs[0].wings.length, 3, 'U-shaped kitchen should have 3 distinct wings without collapsing opposing parallel runs');

  // Verify linear-meter pricing
  const estLinear = getProjectCostEstimate(project);
  const linearRow = estLinear.rows.find(r => r.id === 'countertopSlab');
  assert.ok(linearRow, 'Countertop slab row should exist');
  assert.equal(linearRow.unit, 'meter');
  assert.equal(linearRow.quantity, 4.85, 'Linear meters should reflect all 3 wings (~4.85m)');

  // Verify square-meter pricing
  project.settings.pricing = { countertopPricingMode: 'square-meter' };
  const estSqm = getProjectCostEstimate(project);
  const sqmRow = estSqm.rows.find(r => r.id === 'countertopSlab');
  assert.ok(sqmRow);
  assert.equal(sqmRow.unit, 'sqm');
  assert.equal(sqmRow.quantity, 3.091, 'Square meters should reflect actual countertop surface area without walkway inflation');
});

