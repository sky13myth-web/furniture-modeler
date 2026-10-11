/**
 * Kitchen Features Module
 * Provides:
 * 1. Continuous kitchen plinth (Общий цоколь для кухонных шкафов)
 *    - Seamless, unbroken plinth panels across adjacent base cabinets
 *    - Return side plinths at exposed ends
 *    - 45° euro-miter corner plinth connectors in L-shaped kitchens
 * 2. Continuous wall cabinet bottom finish panels (Фальш-панели для скрытия стыков подвесных шкафов)
 *    - Seamless decorative panels spanning adjacent wall cabinet bottoms to conceal carcass joints
 * 3. LED under-cabinet task lighting (ЛЕД подсветка)
 *    - Continuous aluminum LED profile with opal diffuser and warm task illumination
 */

import { isBaseCabinet, getCabinetCorners } from './countertop.js';
import { polygonBoundaryDistance } from './room-geometry.js';

function number(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value, fallback = 0) {
  const n = number(value, fallback);
  return n > 0 ? n : fallback;
}

/** Check if a cabinet is an upper / wall cabinet */
export function isWallCabinet(c) {
  if (!c || typeof c !== 'object') return false;
  if (['wall', 'corner-wall'].includes(c.type)) return true;
  if (number(c.y, 0) >= 1000 && number(c.height, 0) <= 1400 && !c.countertop) return true;
  return false;
}

/**
 * Group adjacent base cabinets into continuous plinth runs.
 */
export function getPlinthRuns(project, { plinthSetback = 65, thickness = 18 } = {}) {
  const cabinets = (project?.cabinets || []).filter(c => isBaseCabinet(c) && number(c.plinth, 0) > 10 && c.sidesToFloor !== true);
  if (!cabinets.length) return [];

  // Group by matching plinth height (within 5mm)
  const plinthGroups = new Map();
  for (const c of cabinets) {
    const p = Math.round(number(c.plinth, 100));
    let matchedKey = null;
    for (const key of plinthGroups.keys()) {
      if (Math.abs(key - p) <= 5) {
        matchedKey = key;
        break;
      }
    }
    const groupKey = matchedKey ?? p;
    if (!plinthGroups.has(groupKey)) plinthGroups.set(groupKey, []);
    plinthGroups.get(groupKey).push(c);
  }

  const runs = [];
  let runIdCounter = 1;

  for (const [plinthHeight, group] of plinthGroups.entries()) {
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
          if (dist <= 35) {
            adj[i].push(j);
            adj[j].push(i);
          }
        }
      }
    }

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

      // Group cabinets within this run by orientation
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
          for (const pt of getCabinetCorners(c)) {
            const u = pt.x * cos + pt.z * sin;
            const v = -pt.x * sin + pt.z * cos;
            minU = Math.min(minU, u);
            maxU = Math.max(maxU, u);
            minV = Math.min(minV, v);
            maxV = Math.max(maxV, v);
          }
        }

        // Check corner connections with other wings
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

        wings.push({
          rotation: refRot,
          cabinetIds: wingCabinets.map(c => c.id),
          cabinets: wingCabinets,
          minU,
          maxU,
          minV,
          maxV,
          hasCornerMin,
          hasCornerMax,
          cos,
          sin
        });
      }

      runs.push({
        id: `plinth-run-${runIdCounter++}`,
        plinthHeight,
        cabinets: component,
        wings,
        isCorner: wings.length > 1
      });
    }
  }

  return runs;
}

/**
 * Render unified continuous kitchen plinths in 3D.
 */
export function renderUnifiedPlinths(box, rawBox, face, line, project, options = {}) {
  if (options.plinth === false || options.exploded) return;
  const runs = getPlinthRuns(project);
  if (!runs.length) return;

  const plinthColor = '#9fa9ad'; // Brushed aluminum / neutral kitchen plinth
  const plinthThickness = 16;
  const plinthSetback = 65;

  for (const run of runs) {
    const { plinthHeight, wings, cabinets, id: runId } = run;
    const primaryCabId = cabinets[0]?.id || null;
    const h = Math.max(10, plinthHeight - 10);
    const y0 = 0, y1 = h;

    for (const wing of wings) {
      const { minU, maxU, maxV, minV, cos, sin, hasCornerMin, hasCornerMax, cabinetIds } = wing;
      const wingCabId = cabinetIds[0] || primaryCabId;
      const frontV = maxV - plinthSetback;
      const rearV = frontV - plinthThickness;

      // Front plinth board corners in XZ plane
      const p00 = { x: minU * cos - rearV * sin, z: minU * sin + rearV * cos };
      const p10 = { x: maxU * cos - rearV * sin, z: maxU * sin + rearV * cos };
      const p11 = { x: maxU * cos - frontV * sin, z: maxU * sin + frontV * cos };
      const p01 = { x: minU * cos - frontV * sin, z: minU * sin + frontV * cos };

      const extras = { component: 'unified-plinth', runId, noCutout: true };

      // Front face
      face([[p01.x, y0, p01.z], [p11.x, y0, p11.z], [p11.x, y1, p11.z], [p01.x, y1, p01.z]], plinthColor, [sin, 0, cos], wingCabId, extras);
      // Top face
      face([[p00.x, y1, p00.z], [p01.x, y1, p01.z], [p11.x, y1, p11.z], [p10.x, y1, p10.z]], plinthColor, [0, 1, 0], wingCabId, extras);
      // Bottom face
      face([[p00.x, y0, p00.z], [p10.x, y0, p10.z], [p11.x, y0, p11.z], [p01.x, y0, p01.z]], plinthColor, [0, -1, 0], wingCabId, extras);

      // Silicone floor seal strip line
      line([p01.x, y0 + 1, p01.z], [p11.x, y0 + 1, p11.z], '#535d61', 1.5, wingCabId, { ...extras, component: 'plinth-seal' });
      // Top highlight line
      line([p01.x, y1, p01.z], [p11.x, y1, p11.z], '#c2ccd0', 1.1, wingCabId, { ...extras, component: 'plinth-highlight' });

      // Side return plinths at exposed ends (if not connected to a corner)
      if (!hasCornerMin) {
        const sideP0 = { x: minU * cos - (minV + 20) * sin, z: minU * sin + (minV + 20) * cos };
        face([[sideP0.x, y0, sideP0.z], [p01.x, y0, p01.z], [p01.x, y1, p01.z], [sideP0.x, y1, sideP0.z]], plinthColor, [-cos, 0, -sin], wingCabId, extras);
        line([sideP0.x, y0 + 1, sideP0.z], [p01.x, y0 + 1, p01.z], '#535d61', 1.5, wingCabId, extras);
      }
      if (!hasCornerMax) {
        const sideP1 = { x: maxU * cos - (minV + 20) * sin, z: maxU * sin + (minV + 20) * cos };
        face([[p11.x, y0, p11.z], [sideP1.x, y0, sideP1.z], [sideP1.x, y1, sideP1.z], [p11.x, y1, p11.z]], plinthColor, [cos, 0, sin], wingCabId, extras);
        line([p11.x, y0 + 1, p11.z], [sideP1.x, y0 + 1, sideP1.z], '#535d61', 1.5, wingCabId, extras);
      }
    }
  }
}

/**
 * Group adjacent wall cabinets into continuous horizontal runs.
 */
export function getWallCabinetRuns(project) {
  const cabinets = (project?.cabinets || []).filter(isWallCabinet);
  if (!cabinets.length) return [];

  // Group by matching bottom elevation (y within 25mm)
  const elevGroups = new Map();
  for (const c of cabinets) {
    const bottomY = Math.round(number(c.y, 1400));
    let matchedKey = null;
    for (const key of elevGroups.keys()) {
      if (Math.abs(key - bottomY) <= 25) {
        matchedKey = key;
        break;
      }
    }
    const groupKey = matchedKey ?? bottomY;
    if (!elevGroups.has(groupKey)) elevGroups.set(groupKey, []);
    elevGroups.get(groupKey).push(c);
  }

  const runs = [];
  let runIdCounter = 1;

  for (const [bottomY, group] of elevGroups.entries()) {
    const n = group.length;
    const footprints = group.map(getCabinetCorners);
    const adj = Array.from({ length: n }, () => []);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const c1 = group[i], c2 = group[j];
        const rot1 = Math.round(number(c1.rotation, 0) % 360 + 360) % 360;
        const rot2 = Math.round(number(c2.rotation, 0) % 360 + 360) % 360;
        const diffRot = Math.abs(rot1 - rot2) % 180;
        if (diffRot === 0 || Math.abs(diffRot - 90) <= 2) {
          const dist = polygonBoundaryDistance(footprints[i], footprints[j]);
          if (dist <= 35) {
            adj[i].push(j);
            adj[j].push(i);
          }
        }
      }
    }

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

      // Group cabinets within this run by orientation
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
          for (const pt of getCabinetCorners(c)) {
            const u = pt.x * cos + pt.z * sin;
            const v = -pt.x * sin + pt.z * cos;
            minU = Math.min(minU, u);
            maxU = Math.max(maxU, u);
            minV = Math.min(minV, v);
            maxV = Math.max(maxV, v);
          }
        }

        wings.push({
          rotation: refRot,
          cabinetIds: wingCabinets.map(c => c.id),
          cabinets: wingCabinets,
          minU,
          maxU,
          minV,
          maxV,
          cos,
          sin
        });
      }

      runs.push({
        id: `wall-run-${runIdCounter++}`,
        bottomY,
        cabinets: component,
        wings
      });
    }
  }

  return runs;
}

/**
 * Render continuous decorative bottom finish panels (фальш-панели для скрытия стыков подвесных шкафов).
 * Spans seamlessly under adjacent wall cabinets to conceal joints between carcasses.
 */
export function renderUnifiedWallBottomPanels(box, rawBox, face, line, project, options = {}) {
  if (options.wallBottomPanels === false || options.exploded) return;
  const runs = getWallCabinetRuns(project);
  if (!runs.length) return;

  const panelThickness = 18;

  for (const run of runs) {
    const { bottomY, wings, cabinets, id: runId } = run;
    const primaryCabId = cabinets[0]?.id || null;
    const bodyColor = project.settings?.bodyColor || '#e8ecea';
    const yTop = bottomY;
    const yBottom = bottomY - panelThickness;

    for (const wing of wings) {
      const { minU, maxU, minV, maxV, cos, sin, cabinetIds } = wing;
      const wingCabId = cabinetIds[0] || primaryCabId;

      const p00 = { x: minU * cos - minV * sin, z: minU * sin + minV * cos };
      const p10 = { x: maxU * cos - minV * sin, z: maxU * sin + minV * cos };
      const p11 = { x: maxU * cos - maxV * sin, z: maxU * sin + maxV * cos };
      const p01 = { x: minU * cos - maxV * sin, z: minU * sin + maxV * cos };

      const extras = { component: 'wall-bottom-panel', runId, noCutout: true };

      // Bottom face
      face([[p00.x, yBottom, p00.z], [p10.x, yBottom, p10.z], [p11.x, yBottom, p11.z], [p01.x, yBottom, p01.z]], bodyColor, [0, -1, 0], wingCabId, extras);
      // Front face
      face([[p01.x, yBottom, p01.z], [p11.x, yBottom, p11.z], [p11.x, yTop, p11.z], [p01.x, yTop, p01.z]], bodyColor, [sin, 0, cos], wingCabId, extras);
      // Left side face
      face([[p00.x, yBottom, p00.z], [p01.x, yBottom, p01.z], [p01.x, yTop, p01.z], [p00.x, yTop, p00.z]], bodyColor, [-cos, 0, -sin], wingCabId, extras);
      // Right side face
      face([[p11.x, yBottom, p11.z], [p10.x, yBottom, p10.z], [p10.x, yTop, p10.z], [p11.x, yTop, p11.z]], bodyColor, [cos, 0, sin], wingCabId, extras);

      // Edge bevel highlight line
      line([p01.x, yBottom, p01.z], [p11.x, yBottom, p11.z], '#c8d2d6', 1.2, wingCabId, extras);
    }
  }
}

/**
 * Render continuous LED under-cabinet task lighting (ЛЕД подсветка).
 * Aluminum profile channel + frosted opal diffuser + glowing warm illumination line.
 */
export function renderUnifiedLEDLighting(box, rawBox, face, line, project, options = {}) {
  if (options.ledLighting === false || options.exploded) return;
  const runs = getWallCabinetRuns(project);
  if (!runs.length) return;

  const profileW = 16;
  const profileH = 7;
  const setback = 70; // 70mm from front edge of wall cabinets

  for (const run of runs) {
    const { bottomY, wings, cabinets, id: runId } = run;
    const primaryCabId = cabinets[0]?.id || null;
    const hasBottomPanel = options.wallBottomPanels !== false;
    const yBase = hasBottomPanel ? bottomY - 18 : bottomY;

    for (const wing of wings) {
      const { minU, maxU, maxV, cos, sin, cabinetIds } = wing;
      const wingCabId = cabinetIds[0] || primaryCabId;
      const length = maxU - minU;
      if (length <= 40) continue;

      const profileV0 = maxV - setback;
      const profileV1 = profileV0 - profileW;

      const p00 = { x: (minU + 15) * cos - profileV1 * sin, z: (minU + 15) * sin + profileV1 * cos };
      const p10 = { x: (maxU - 15) * cos - profileV1 * sin, z: (maxU - 15) * sin + profileV1 * cos };
      const p11 = { x: (maxU - 15) * cos - profileV0 * sin, z: (maxU - 15) * sin + profileV0 * cos };
      const p01 = { x: (minU + 15) * cos - profileV0 * sin, z: (minU + 15) * sin + profileV0 * cos };

      const yBot = yBase - profileH;
      const extras = { component: 'led-lighting', runId, noCutout: true };

      // Aluminum profile channel
      face([[p00.x, yBot, p00.z], [p10.x, yBot, p10.z], [p11.x, yBot, p11.z], [p01.x, yBot, p01.z]], '#8b969a', [0, -1, 0], wingCabId, extras);

      // Opal diffuser strip in center
      const diffV = (profileV0 + profileV1) / 2;
      const l0 = { x: (minU + 18) * cos - diffV * sin, z: (minU + 18) * sin + diffV * cos };
      const l1 = { x: (maxU - 18) * cos - diffV * sin, z: (maxU - 18) * sin + diffV * cos };

      // Glowing warm LED emission strip (3000K warm white)
      line([l0.x, yBot - 0.5, l0.z], [l1.x, yBot - 0.5, l1.z], '#fff9e6', 3.0, wingCabId, { ...extras, component: 'led-glow' });
      // Inner highlight line
      line([l0.x, yBot - 0.8, l0.z], [l1.x, yBot - 0.8, l1.z], '#ffffff', 1.5, wingCabId, { ...extras, component: 'led-core' });
    }
  }
}
