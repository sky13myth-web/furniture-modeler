/**
 * Unified Kitchen Countertop Module
 * Automatically merges adjacent and L-shaped kitchen base cabinets into
 * seamless, continuous countertops with standard overhangs (38mm postforming drip),
 * 45° euro-miter seams at corners, and full CAD/3D/OBJ integration.
 */

import { polygonBoundaryDistance } from './room-geometry.js';
import { getCabinetLayout } from './engine.js';

function number(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value, fallback = 0) {
  const n = number(value, fallback);
  return n > 0 ? n : fallback;
}

/** Check if a cabinet is a kitchen base cabinet eligible for a continuous countertop. */
export function isBaseCabinet(c) {
  if (!c || typeof c !== 'object') return false;
  if (c.countertop === false || c.worktop === false) return false;
  if (c.countertop === true || c.worktop === true) return true;
  if (['base', 'corner-base', 'corner'].includes(c.type)) return true;
  return false;
}

/** 4 world footprint corners of a cabinet in XZ plane. */
export function getCabinetCorners(c) {
  const x = number(c.x, 0), z = number(c.z, 0);
  const w = positiveNumber(c.width, 800), d = positiveNumber(c.depth, 580);
  const rot = number(c.rotation, 0);
  const rad = rot * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return [
    { x: x, z: z },
    { x: x + w * cos, z: z + w * sin },
    { x: x + w * cos - d * sin, z: z + w * sin + d * cos },
    { x: x - d * sin, z: z + d * cos }
  ];
}

/**
 * Identify clusters of adjacent base cabinets that share a top working plane
 * and form continuous kitchen runs (linear or L-shaped).
 */
export function getCountertopRuns(project, { defaultThickness = 38, frontOverhang = 38, sideOverhang = 15 } = {}) {
  const cabinets = (project?.cabinets || []).filter(isBaseCabinet);
  if (!cabinets.length) return [];

  // Group by matching top elevation (y + height within 25mm)
  const heightGroups = new Map();
  for (const c of cabinets) {
    const topY = Math.round(number(c.y, 0) + number(c.height, 860));
    let matchedKey = null;
    for (const key of heightGroups.keys()) {
      if (Math.abs(key - topY) <= 25) {
        matchedKey = key;
        break;
      }
    }
    const groupKey = matchedKey ?? topY;
    if (!heightGroups.has(groupKey)) heightGroups.set(groupKey, []);
    heightGroups.get(groupKey).push(c);
  }

  const runs = [];
  let runIdCounter = 1;

  for (const [topY, group] of heightGroups.entries()) {
    const n = group.length;
    const footprints = group.map(getCabinetCorners);
    const adj = Array.from({ length: n }, () => []);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const c1 = group[i], c2 = group[j];
        const rot1 = Math.round(number(c1.rotation, 0) % 360 + 360) % 360;
        const rot2 = Math.round(number(c2.rotation, 0) % 360 + 360) % 360;
        const diffRot = Math.abs(rot1 - rot2) % 180;
        const isColinear = diffRot === 0;
        const isPerpendicular = Math.abs(diffRot - 90) <= 2;

        if (isColinear || isPerpendicular) {
          const dist = polygonBoundaryDistance(footprints[i], footprints[j]);
          // Within 35mm counts as touching or flush adjacent
          if (dist <= 35) {
            adj[i].push(j);
            adj[j].push(i);
          }
        }
      }
    }

    // Find connected components
    const visited = new Set();
    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;
      const component = [];
      const queue = [i];
      visited.add(i);

      while (queue.length) {
        const u = queue.shift();
        component.push(group[u]);
        for (const v of adj[u]) {
          if (!visited.has(v)) {
            visited.add(v);
            queue.push(v);
          }
        }
      }

      const thickness = Math.max(20, Math.min(60, number(project.settings?.worktopThickness ?? component[0]?.worktopThickness, defaultThickness)));
      const color = project.settings?.worktopColor || '#e8e2d5';

      // Group cabinets within this connected component by orientation (modulo 180°)
      const orientationMap = new Map();
      for (const cab of component) {
        const rot = Math.round(number(cab.rotation, 0) % 360 + 360) % 360;
        const normRot = rot % 180;
        let matchedRot = null;
        for (const r of orientationMap.keys()) {
          if (Math.abs(r - normRot) <= 2) {
            matchedRot = r;
            break;
          }
        }
        const key = matchedRot ?? normRot;
        if (!orientationMap.has(key)) orientationMap.set(key, []);
        orientationMap.get(key).push(cab);
      }

      const wings = [];
      for (const [normRot, wingCabinets] of orientationMap.entries()) {
        const refRot = Math.round(number(wingCabinets[0].rotation, 0) % 360 + 360) % 360;
        const rad = refRot * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);

        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        for (const c of wingCabinets) {
          const corners = getCabinetCorners(c);
          for (const pt of corners) {
            // Unrotate by refRot into wing-local coords
            const u = pt.x * cos + pt.z * sin;
            const v = -pt.x * sin + pt.z * cos;
            minU = Math.min(minU, u);
            maxU = Math.max(maxU, u);
            minV = Math.min(minV, v);
            maxV = Math.max(maxV, v);
          }
        }

        // Check if ends meet another wing in this run
        let hasCornerMin = false;
        let hasCornerMax = false;
        if (orientationMap.size > 1) {
          for (const [otherRot, otherCabs] of orientationMap.entries()) {
            if (otherRot === normRot) continue;
            for (const oc of otherCabs) {
              for (const pt of getCabinetCorners(oc)) {
                const u = pt.x * cos + pt.z * sin;
                const v = -pt.x * sin + pt.z * cos;
                if (Math.abs(u - minU) <= 60 && v >= minV - 20 && v <= maxV + 50) hasCornerMin = true;
                if (Math.abs(u - maxU) <= 60 && v >= minV - 20 && v <= maxV + 50) hasCornerMax = true;
              }
            }
          }
        }

        const leftOverhang = hasCornerMin ? 0 : sideOverhang;
        const rightOverhang = hasCornerMax ? 0 : sideOverhang;

        wings.push({
          rotation: refRot,
          cabinetIds: wingCabinets.map(c => c.id),
          cabinets: wingCabinets,
          minU: minU - leftOverhang,
          maxU: maxU + rightOverhang,
          minV: minV - 2, // 2mm wall clearance
          maxV: maxV + frontOverhang,
          hasCornerMin,
          hasCornerMax,
          length: (maxU - minU) + leftOverhang + rightOverhang,
          depth: (maxV - minV) + frontOverhang,
          cos,
          sin,
        });
      }

      runs.push({
        id: `countertop-run-${runIdCounter++}`,
        topY,
        thickness,
        color,
        cabinets: component,
        wings,
        isCorner: wings.length > 1,
        cutouts: getCountertopCutoutsForCabinets(component, project),
      });
    }
  }

  return runs;
}

/**
 * Calculate CNC cutouts for sinks and cooktops on countertop slabs.
 */
export function getCountertopCutoutsForCabinets(cabinets = [], project = {}) {
  const cutouts = [];
  for (const cab of cabinets) {
    if (!cab || !isBaseCabinet(cab)) continue;
    let sections = [];
    if (cab.layout) {
      try {
        const layout = getCabinetLayout(cab, project);
        sections = layout?.sections || [];
      } catch {
        sections = [];
      }
    }
    for (const sec of sections) {
      const node = sec.node;
      if (node.cooktop) {
        const ct = node.cooktop;
        const w = positiveNumber(ct.width, 590), d = positiveNumber(ct.depth, 520);
        const cutW = Math.max(100, w - 30), cutD = Math.max(100, d - 30);
        cutouts.push({
          cabinetId: cab.id,
          cabinetName: cab.name,
          sectionId: sec.id,
          applianceType: 'cooktop',
          label: ct.label || 'Варочная панель',
          shape: 'rect',
          width: cutW,
          depth: cutD,
          applianceWidth: w,
          applianceDepth: d,
          x: number(cab.x, 0) + sec.x + (sec.width - cutW) / 2,
          y: number(cab.y, 0) + positiveNumber(cab.height, 860),
          z: number(cab.z, 0) + (positiveNumber(cab.depth, 600) - cutD) / 2
        });
      }
      if (node.sink) {
        const sink = node.sink;
        const isRound = sink.shape === 'round' || sink.sinkShape === 'round';
        if (isRound) {
          const diam = positiveNumber(sink.diameter || sink.width, 510);
          const cutDiam = Math.max(100, diam - 20);
          cutouts.push({
            cabinetId: cab.id,
            cabinetName: cab.name,
            sectionId: sec.id,
            applianceType: 'sink-round',
            label: sink.label || 'Раковина круглая',
            shape: 'round',
            diameter: cutDiam,
            applianceDiameter: diam,
            x: number(cab.x, 0) + sec.x + sec.width / 2,
            y: number(cab.y, 0) + positiveNumber(cab.height, 860),
            z: number(cab.z, 0) + positiveNumber(cab.depth, 600) / 2
          });
        } else {
          const w = positiveNumber(sink.width, 780), d = positiveNumber(sink.depth, 500);
          const cutW = Math.max(100, w - 20), cutD = Math.max(100, d - 20);
          cutouts.push({
            cabinetId: cab.id,
            cabinetName: cab.name,
            sectionId: sec.id,
            applianceType: 'sink-rectangular',
            label: sink.label || 'Раковина прямоугольная',
            shape: 'rect',
            width: cutW,
            depth: cutD,
            applianceWidth: w,
            applianceDepth: d,
            x: number(cab.x, 0) + sec.x + (sec.width - cutW) / 2,
            y: number(cab.y, 0) + positiveNumber(cab.height, 860),
            z: number(cab.z, 0) + (positiveNumber(cab.depth, 600) - cutD) / 2
          });
        }
      }
    }
  }
  return cutouts;
}

export function getCountertopCutouts(project = {}) {
  const cabinets = (project?.cabinets || []).filter(isBaseCabinet);
  return getCountertopCutoutsForCabinets(cabinets, project);
}

/**
 * Render unified continuous countertops into the 3D scene (faces, edges, bevels, euro-miters).
 */
export function renderUnifiedCountertops(box, rawBox, face, line, project, options = {}) {
  if (options.countertop === false || options.exploded) return;
  const runs = getCountertopRuns(project);
  if (!runs.length) return;

  for (const run of runs) {
    const { topY, thickness, color, wings, id: runId, isCorner, cabinets } = run;
    const primaryCabinetId = cabinets[0]?.id || null;

    for (const wing of wings) {
      const { minU, maxU, minV, maxV, cos, sin, cabinetIds } = wing;
      const wingCabId = cabinetIds[0] || primaryCabinetId;
      const w = maxU - minU;
      const d = maxV - minV;
      if (w <= 0 || d <= 0) continue;

      // 4 corners of countertop slab in 2D world plane (X, Z)
      const p00 = { x: minU * cos - minV * sin, z: minU * sin + minV * cos };
      const p10 = { x: maxU * cos - minV * sin, z: maxU * sin + minV * cos };
      const p11 = { x: maxU * cos - maxV * sin, z: maxU * sin + maxV * cos };
      const p01 = { x: minU * cos - maxV * sin, z: minU * sin + maxV * cos };

      const yBottom = topY;
      const yTop = topY + thickness;

      const cab = cabinets.find(c => c.id === wingCabId) || cabinets[0];
      const topMat = cab ? (project.materials || []).find(m => m.id === (cab.countertopMaterialId || cab.materialId)) : null;
      const extras = { component: 'countertop', runId, noCutout: true, materialId: topMat?.id, textureUrl: topMat?.textureUrl || topMat?.previewUrl };

      // Top face
      face([[p00.x, yTop, p00.z], [p01.x, yTop, p01.z], [p11.x, yTop, p11.z], [p10.x, yTop, p10.z]], color, [0, 1, 0], wingCabId, extras);
      // Bottom face
      face([[p00.x, yBottom, p00.z], [p10.x, yBottom, p10.z], [p11.x, yBottom, p11.z], [p01.x, yBottom, p01.z]], color, [0, -1, 0], wingCabId, extras);
      // Front face (with overhang)
      face([[p01.x, yBottom, p01.z], [p11.x, yBottom, p11.z], [p11.x, yTop, p11.z], [p01.x, yTop, p01.z]], color, [sin, 0, cos], wingCabId, extras);
      // Back face
      face([[p10.x, yBottom, p10.z], [p00.x, yBottom, p00.z], [p00.x, yTop, p00.z], [p10.x, yTop, p10.z]], color, [-sin, 0, -cos], wingCabId, extras);
      // Left side face
      face([[p00.x, yBottom, p00.z], [p01.x, yBottom, p01.z], [p01.x, yTop, p01.z], [p00.x, yTop, p00.z]], color, [-cos, 0, -sin], wingCabId, extras);
      // Right side face
      face([[p11.x, yBottom, p11.z], [p10.x, yBottom, p10.z], [p10.x, yTop, p10.z], [p11.x, yTop, p11.z]], color, [cos, 0, sin], wingCabId, extras);

      // Postforming front edge highlight line
      line([p01.x, yTop - 0.5, p01.z], [p11.x, yTop - 0.5, p11.z], '#f5f0e6', 1.4, wingCabId, { ...extras, component: 'countertop-bevel' });
      // Front bottom drip edge line
      line([p01.x, yBottom + 0.5, p01.z], [p11.x, yBottom + 0.5, p11.z], '#b5ad9e', 0.9, wingCabId, { ...extras, component: 'countertop-edge' });
    }

    // If this is an L-shaped corner run, render the 45° euro-miter seam between wings
    if (isCorner && wings.length >= 2) {
      const w1 = wings[0], w2 = wings[1];
      // Junction point on the top plane
      const pCornerInner = {
        x: (w1.maxU * w1.cos - w1.maxV * w1.sin + w2.minU * w2.cos - w2.maxV * w2.sin) / 2,
        z: (w1.maxU * w1.sin + w1.maxV * w1.cos + w2.minU * w2.sin + w2.maxV * w2.cos) / 2
      };
      // Euro-miter 45° seam extending into carcass junction
      const pCornerOuter = {
        x: pCornerInner.x + (w1.maxV - w1.minV) * (w1.cos - w1.sin) * 0.707,
        z: pCornerInner.z + (w1.maxV - w1.minV) * (w1.sin + w1.cos) * 0.707
      };
      line([pCornerInner.x, topY + thickness + 0.2, pCornerInner.z], [pCornerOuter.x, topY + thickness + 0.2, pCornerOuter.z], '#7a7265', 1.5, primaryCabinetId, { component: 'countertop-euro-miter', runId });
    }
  }
}
