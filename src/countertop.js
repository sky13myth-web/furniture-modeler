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

      // Group cabinets within this connected component by orientation (full 360° rotation)
      const orientationMap = new Map();
      for (const cab of component) {
        const rot = Math.round(number(cab.rotation, 0) % 360 + 360) % 360;
        let matchedRot = null;
        for (const r of orientationMap.keys()) {
          if (Math.abs(r - rot) <= 2 || Math.abs(r - rot) >= 358) {
            matchedRot = r;
            break;
          }
        }
        const key = matchedRot ?? rot;
        if (!orientationMap.has(key)) orientationMap.set(key, []);
        orientationMap.get(key).push(cab);
      }

      // Partition disconnected parallel cabinet clusters into separate wings
      const wingGroups = [];
      for (const cabs of orientationMap.values()) {
        if (cabs.length <= 1) {
          wingGroups.push(cabs);
          continue;
        }
        const visitedCabs = new Set();
        for (let i = 0; i < cabs.length; i++) {
          if (visitedCabs.has(i)) continue;
          const cluster = [cabs[i]];
          visitedCabs.add(i);
          const queue = [i];
          while (queue.length) {
            const curr = queue.shift();
            const currFp = footprints[group.indexOf(cabs[curr])];
            for (let j = 0; j < cabs.length; j++) {
              if (!visitedCabs.has(j)) {
                const otherFp = footprints[group.indexOf(cabs[j])];
                if (polygonBoundaryDistance(currFp, otherFp) <= 35) {
                  visitedCabs.add(j);
                  cluster.push(cabs[j]);
                  queue.push(j);
                }
              }
            }
          }
          wingGroups.push(cluster);
        }
      }

      const wings = [];
      for (const wingCabinets of wingGroups) {
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
        if (wingGroups.length > 1) {
          for (const otherCabs of wingGroups) {
            if (otherCabs === wingCabinets) continue;
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
    const cabW = positiveNumber(cab.width, 800);
    const cabD = positiveNumber(cab.depth, 600);
    const backT = Math.max(0, number(cab.backThickness, 3));
    const bodyD = Math.max(18, cabD - backT);
    let sections = [];
    if (cab.layout) {
      try {
        const layout = getCabinetLayout(cab, project);
        sections = layout?.sections || [];
      } catch {
        sections = [];
      }
    }
    let hasSectionCooktop = false;
    let hasSectionSink = false;
    for (const sec of sections) {
      const node = sec.node || {};
      const ct = node.cooktop || (node.appliance?.type === 'cooktop' ? node.appliance : null);
      if (ct) {
        hasSectionCooktop = true;
        const w = positiveNumber(ct.width, 590), d = positiveNumber(ct.depth, 520);
        const cutW = Math.max(100, w - 30), cutD = Math.max(100, d - 30);
        const appLocalX = sec.x + Math.max(0, (sec.width - w) / 2);
        const appLocalZ = backT + Math.max(0, (bodyD - d) / 2);
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
          localCutX: appLocalX + (w - cutW) / 2,
          localCutZ: appLocalZ + (d - cutD) / 2,
          x: number(cab.x, 0) + sec.x + (sec.width - cutW) / 2,
          y: number(cab.y, 0) + positiveNumber(cab.height, 860),
          z: number(cab.z, 0) + (cabD - cutD) / 2
        });
      }
      const sink = node.sink || ((node.appliance?.type === 'sink-round' || node.appliance?.type === 'sink-rectangular') ? node.appliance : null);
      if (sink) {
        hasSectionSink = true;
        const isRound = sink.shape === 'round' || sink.sinkShape === 'round' || sink.type === 'sink-round';
        if (isRound) {
          const diam = positiveNumber(sink.diameter || sink.width, 510);
          const cutDiam = Math.max(100, diam - 20);
          const sw = positiveNumber(sink.width || diam, diam);
          const sd = positiveNumber(sink.depth || diam, 500);
          const appLocalX = sec.x + Math.max(0, (sec.width - sw) / 2);
          const appLocalZ = backT + Math.max(0, (bodyD - sd) / 2);
          cutouts.push({
            cabinetId: cab.id,
            cabinetName: cab.name,
            sectionId: sec.id,
            applianceType: 'sink-round',
            label: sink.label || 'Раковина круглая',
            shape: 'round',
            diameter: cutDiam,
            applianceDiameter: diam,
            localCenterX: appLocalX + sw / 2,
            localCenterZ: appLocalZ + sd / 2,
            x: number(cab.x, 0) + sec.x + sec.width / 2,
            y: number(cab.y, 0) + positiveNumber(cab.height, 860),
            z: number(cab.z, 0) + cabD / 2
          });
        } else {
          const w = positiveNumber(sink.width, 780), d = positiveNumber(sink.depth, 500);
          const cutW = Math.max(100, w - 20), cutD = Math.max(100, d - 20);
          const appLocalX = sec.x + Math.max(0, (sec.width - w) / 2);
          const appLocalZ = backT + Math.max(0, (bodyD - d) / 2);
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
            localCutX: appLocalX + (w - cutW) / 2,
            localCutZ: appLocalZ + (d - cutD) / 2,
            x: number(cab.x, 0) + sec.x + (sec.width - cutW) / 2,
            y: number(cab.y, 0) + positiveNumber(cab.height, 860),
            z: number(cab.z, 0) + (cabD - cutD) / 2
          });
        }
      }
    }
    if (!hasSectionCooktop && cab.cooktop) {
      const ct = cab.cooktop;
      const w = positiveNumber(ct.width, 590), d = positiveNumber(ct.depth, 520);
      const cutW = Math.max(100, w - 30), cutD = Math.max(100, d - 30);
      const appLocalX = (cabW - w) / 2;
      const appLocalZ = backT + (bodyD - d) / 2;
      cutouts.push({
        cabinetId: cab.id,
        cabinetName: cab.name,
        sectionId: null,
        applianceType: 'cooktop',
        label: ct.label || 'Варочная панель',
        shape: 'rect',
        width: cutW,
        depth: cutD,
        applianceWidth: w,
        applianceDepth: d,
        localCutX: appLocalX + (w - cutW) / 2,
        localCutZ: appLocalZ + (d - cutD) / 2,
        x: number(cab.x, 0) + (cabW - cutW) / 2,
        y: number(cab.y, 0) + positiveNumber(cab.height, 860),
        z: number(cab.z, 0) + (cabD - cutD) / 2
      });
    }
    if (!hasSectionSink && cab.sink) {
      const sink = cab.sink;
      const isRound = sink.shape === 'round' || sink.sinkShape === 'round' || sink.type === 'sink-round';
      if (isRound) {
        const diam = positiveNumber(sink.diameter || sink.width, 510);
        const cutDiam = Math.max(100, diam - 20);
        const sw = positiveNumber(sink.width || diam, diam);
        const sd = positiveNumber(sink.depth || diam, 500);
        const appLocalX = (cabW - sw) / 2;
        const appLocalZ = backT + (bodyD - sd) / 2;
        cutouts.push({
          cabinetId: cab.id,
          cabinetName: cab.name,
          sectionId: null,
          applianceType: 'sink-round',
          label: sink.label || 'Раковина круглая',
          shape: 'round',
          diameter: cutDiam,
          applianceDiameter: diam,
          localCenterX: appLocalX + sw / 2,
          localCenterZ: appLocalZ + sd / 2,
          x: number(cab.x, 0) + cabW / 2,
          y: number(cab.y, 0) + positiveNumber(cab.height, 860),
          z: number(cab.z, 0) + cabD / 2
        });
      } else {
        const w = positiveNumber(sink.width, 780), d = positiveNumber(sink.depth, 500);
        const cutW = Math.max(100, w - 20), cutD = Math.max(100, d - 20);
        const appLocalX = (cabW - w) / 2;
        const appLocalZ = backT + (bodyD - d) / 2;
        cutouts.push({
          cabinetId: cab.id,
          cabinetName: cab.name,
          sectionId: null,
          applianceType: 'sink-rectangular',
          label: sink.label || 'Раковина прямоугольная',
          shape: 'rect',
          width: cutW,
          depth: cutD,
          applianceWidth: w,
          applianceDepth: d,
          localCutX: appLocalX + (w - cutW) / 2,
          localCutZ: appLocalZ + (d - cutD) / 2,
          x: number(cab.x, 0) + (cabW - cutW) / 2,
          y: number(cab.y, 0) + positiveNumber(cab.height, 860),
          z: number(cab.z, 0) + (cabD - cutD) / 2
        });
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
 * Render unified continuous countertops into the 3D scene (faces, edges, bevels, euro-miters, and CNC cutouts).
 */
export function renderUnifiedCountertops(box, rawBox, face, line, project, options = {}) {
  if (options.countertop === false || options.exploded) return;
  const runs = getCountertopRuns(project);
  if (!runs.length) return;

  for (const run of runs) {
    const { topY, thickness, color, wings, id: runId, isCorner, cabinets, cutouts = [] } = run;
    const primaryCabinetId = cabinets[0]?.id || null;

    for (const wing of wings) {
      const { minU, maxU, minV, maxV, cos, sin, cabinetIds } = wing;
      const wingCabId = cabinetIds[0] || primaryCabinetId;
      const w = maxU - minU;
      const d = maxV - minV;
      if (w <= 0 || d <= 0) continue;

      const toWorld = (u, v) => ({ x: u * cos - v * sin, z: u * sin + v * cos });
      const p00 = toWorld(minU, minV);
      const p10 = toWorld(maxU, minV);
      const p11 = toWorld(maxU, maxV);
      const p01 = toWorld(minU, maxV);

      const yBottom = topY;
      const yTop = topY + thickness;

      const cab = cabinets.find(c => c.id === wingCabId) || cabinets[0];
      const topMat = cab ? (project.materials || []).find(m => m.id === (cab.countertopMaterialId || cab.materialId)) : null;
      const extras = { component: 'countertop', runId, noCutout: true, materialId: topMat?.id, textureUrl: topMat?.textureUrl || topMat?.previewUrl };

      // Collect cutouts belonging to cabinets in this wing
      const wingCutouts = [];
      for (const cut of cutouts) {
        if (!cabinetIds.includes(cut.cabinetId)) continue;
        const cutCab = cabinets.find(c => c.id === cut.cabinetId);
        if (!cutCab) continue;
        const cabU = number(cutCab.x, 0) * cos + number(cutCab.z, 0) * sin;
        const cabV = -number(cutCab.x, 0) * sin + number(cutCab.z, 0) * cos;
        if (cut.shape === 'round') {
          const r = positiveNumber(cut.diameter, 490) / 2;
          const cu = cabU + number(cut.localCenterX, positiveNumber(cutCab.width, 800) / 2);
          const cv = cabV + number(cut.localCenterZ, positiveNumber(cutCab.depth, 600) / 2);
          wingCutouts.push({
            shape: 'round',
            r,
            cu,
            cv,
            u0: Math.max(minU + 5, cu - r),
            u1: Math.min(maxU - 5, cu + r),
            v0: Math.max(minV + 5, cv - r),
            v1: Math.min(maxV - 5, cv + r),
            cabinetId: cut.cabinetId
          });
        } else {
          const cw = positiveNumber(cut.width, 560);
          const cd = positiveNumber(cut.depth, 480);
          const u0 = cabU + number(cut.localCutX, (positiveNumber(cutCab.width, 800) - cw) / 2);
          const v0 = cabV + number(cut.localCutZ, (positiveNumber(cutCab.depth, 600) - cd) / 2);
          wingCutouts.push({
            shape: 'rect',
            u0: Math.max(minU + 5, u0),
            u1: Math.min(maxU - 5, u0 + cw),
            v0: Math.max(minV + 5, v0),
            v1: Math.min(maxV - 5, v0 + cd),
            cabinetId: cut.cabinetId
          });
        }
      }

      // Subtract cutout bounding boxes from wing slab in (u, v) space
      let pieces = [{ u0: minU, u1: maxU, v0: minV, v1: maxV }];
      for (const cut of wingCutouts) {
        if (cut.u1 <= cut.u0 || cut.v1 <= cut.v0) continue;
        const nextPieces = [];
        for (const p of pieces) {
          const iu0 = Math.max(p.u0, cut.u0), iv0 = Math.max(p.v0, cut.v0);
          const iu1 = Math.min(p.u1, cut.u1), iv1 = Math.min(p.v1, cut.v1);
          if (iu0 >= iu1 || iv0 >= iv1) {
            nextPieces.push(p);
            continue;
          }
          if (iu0 > p.u0) nextPieces.push({ u0: p.u0, u1: iu0, v0: p.v0, v1: p.v1 });
          if (p.u1 > iu1) nextPieces.push({ u0: iu1, u1: p.u1, v0: p.v0, v1: p.v1 });
          if (iv0 > p.v0) nextPieces.push({ u0: iu0, u1: iu1, v0: p.v0, v1: iv0 });
          if (p.v1 > iv1) nextPieces.push({ u0: iu0, u1: iu1, v0: iv1, v1: p.v1 });
        }
        pieces = nextPieces;
      }

      // Render top and bottom faces for each countertop piece
      for (const piece of pieces) {
        const q00 = toWorld(piece.u0, piece.v0);
        const q10 = toWorld(piece.u1, piece.v0);
        const q11 = toWorld(piece.u1, piece.v1);
        const q01 = toWorld(piece.u0, piece.v1);
        face([[q00.x, yTop, q00.z], [q01.x, yTop, q01.z], [q11.x, yTop, q11.z], [q10.x, yTop, q10.z]], color, [0, 1, 0], wingCabId, extras);
        face([[q00.x, yBottom, q00.z], [q10.x, yBottom, q10.z], [q11.x, yBottom, q11.z], [q01.x, yBottom, q01.z]], color, [0, -1, 0], wingCabId, extras);
      }

      // Render inner cutout walls (and corner fillets for round cutouts)
      const cutCoreColor = '#c9beaa';
      for (const cut of wingCutouts) {
        if (cut.u1 <= cut.u0 || cut.v1 <= cut.v0) continue;
        if (cut.shape === 'round') {
          const segsPerQuad = 6;
          const totalSegs = segsPerQuad * 4;
          const corners = [
            [cut.u1, cut.v1],
            [cut.u0, cut.v1],
            [cut.u0, cut.v0],
            [cut.u1, cut.v0]
          ];
          for (let q = 0; q < 4; q++) {
            const [cornerU, cornerV] = corners[q];
            const cwPt = toWorld(cornerU, cornerV);
            for (let s = 0; s < segsPerQuad; s++) {
              const a0 = (q * segsPerQuad + s) * (Math.PI * 2 / totalSegs);
              const a1 = (q * segsPerQuad + s + 1) * (Math.PI * 2 / totalSegs);
              const c0 = toWorld(cut.cu + cut.r * Math.cos(a0), cut.cv + cut.r * Math.sin(a0));
              const c1 = toWorld(cut.cu + cut.r * Math.cos(a1), cut.cv + cut.r * Math.sin(a1));
              face([[c0.x, yTop, c0.z], [c1.x, yTop, c1.z], [cwPt.x, yTop, cwPt.z]], color, [0, 1, 0], wingCabId, extras);
              face([[c0.x, yBottom, c0.z], [cwPt.x, yBottom, cwPt.z], [c1.x, yBottom, c1.z]], color, [0, -1, 0], wingCabId, extras);
              const midA = (a0 + a1) / 2;
              const nu = -Math.cos(midA), nv = -Math.sin(midA);
              const wn = [nu * cos - nv * sin, 0, nu * sin + nv * cos];
              face([[c0.x, yBottom, c0.z], [c1.x, yBottom, c1.z], [c1.x, yTop, c1.z], [c0.x, yTop, c0.z]], cutCoreColor, wn, wingCabId, extras);
            }
          }
        } else {
          const c00 = toWorld(cut.u0, cut.v0);
          const c10 = toWorld(cut.u1, cut.v0);
          const c11 = toWorld(cut.u1, cut.v1);
          const c01 = toWorld(cut.u0, cut.v1);
          // Inner left wall (faces +u)
          face([[c00.x, yBottom, c00.z], [c00.x, yTop, c00.z], [c01.x, yTop, c01.z], [c01.x, yBottom, c01.z]], cutCoreColor, [cos, 0, sin], wingCabId, extras);
          // Inner right wall (faces -u)
          face([[c11.x, yBottom, c11.z], [c11.x, yTop, c11.z], [c10.x, yTop, c10.z], [c10.x, yBottom, c10.z]], cutCoreColor, [-cos, 0, -sin], wingCabId, extras);
          // Inner back wall (faces +v)
          face([[c10.x, yBottom, c10.z], [c10.x, yTop, c10.z], [c00.x, yTop, c00.z], [c00.x, yBottom, c00.z]], cutCoreColor, [-sin, 0, cos], wingCabId, extras);
          // Inner front wall (faces -v)
          face([[c01.x, yBottom, c01.z], [c01.x, yTop, c01.z], [c11.x, yTop, c11.z], [c11.x, yBottom, c11.z]], cutCoreColor, [sin, 0, -cos], wingCabId, extras);
        }
      }

      // Outer perimeter vertical faces
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
