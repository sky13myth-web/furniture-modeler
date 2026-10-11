import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet } from '../src/engine.js';
import { getCountertopRuns, renderUnifiedCountertops, isBaseCabinet } from '../src/countertop.js';
import { makeScene } from '../src/renderer.js';

test('isBaseCabinet correctly identifies kitchen base cabinets', () => {
  assert.equal(isBaseCabinet({ type: 'base' }), true);
  assert.equal(isBaseCabinet({ type: 'corner-base' }), true);
  assert.equal(isBaseCabinet({ type: 'tall', countertop: true }), true);
  assert.equal(isBaseCabinet({ type: 'base', countertop: false }), false);
  assert.equal(isBaseCabinet({ type: 'tall' }), false);
  assert.equal(isBaseCabinet({ type: 'wall' }), false);
});

test('merges adjacent collinear base cabinets into a single continuous countertop run', () => {
  const project = createDefaultProject();
  project.cabinets = [
    createCabinet('base', project, { id: 'cab-1', x: 0, y: 0, z: 0, width: 600, height: 860, depth: 580, rotation: 0, countertop: true }),
    createCabinet('base', project, { id: 'cab-2', x: 600, y: 0, z: 0, width: 800, height: 860, depth: 580, rotation: 0, countertop: true }),
    createCabinet('base', project, { id: 'cab-3', x: 1400, y: 0, z: 0, width: 400, height: 860, depth: 580, rotation: 0, countertop: true }),
  ];

  const runs = getCountertopRuns(project);
  assert.equal(runs.length, 1, 'Should group all 3 adjacent cabinets into 1 unified run');
  assert.equal(runs[0].isCorner, false);
  assert.equal(runs[0].wings.length, 1);

  const wing = runs[0].wings[0];
  // Total carcass span is 1800mm (0 to 1800).
  // Side overhangs: 15mm on left (minU = -15), 15mm on right (maxU = 1815).
  // Total length = 1830mm.
  assert.equal(wing.minU, -15);
  assert.equal(wing.maxU, 1815);
  assert.equal(wing.length, 1830);

  // Front overhang: carcass depth 580mm, overhang 38mm -> maxV = 618.
  assert.equal(wing.maxV, 618);
  assert.equal(runs[0].thickness, 38, 'Default thickness should be 38mm postforming');
});

test('handles L-shaped kitchen corner run with euro-miter cut', () => {
  const project = createDefaultProject();
  // Corner cabinet along wall 1: X in [0, 1000], Z in [0, 580], rotation 0
  const c1 = createCabinet('corner-base', project, { id: 'c-corner', x: 0, y: 0, z: 0, width: 1000, height: 860, depth: 580, rotation: 0 });
  // Perpendicular cabinet along wall 2: meets corner at X = 1000, Z = 580, rotation 90
  const c2 = createCabinet('base', project, { id: 'c-wing', x: 1000, y: 0, z: 580, width: 800, height: 860, depth: 580, rotation: 90 });
  project.cabinets = [c1, c2];

  const runs = getCountertopRuns(project);
  assert.equal(runs.length, 1, 'L-shaped cabinets form a single unified run');
  assert.equal(runs[0].isCorner, true, 'Run should be marked as corner');
  assert.equal(runs[0].wings.length, 2, 'Should have 2 wings meeting at corner');

  const scene = makeScene(project, { room: false, countertop: true });
  const euroMiterLine = scene.lines.find(l => l.component === 'countertop-euro-miter');
  assert.ok(euroMiterLine, 'Scene should render 45° euro-miter joint seam line');
  assert.ok(scene.faces.some(f => f.component === 'countertop'), 'Scene should render countertop 3D faces');
});
