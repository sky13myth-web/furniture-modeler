import { makeScene } from './renderer.js';

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return [0.8, 0.8, 0.8];
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [r, g, b];
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [r, g, b];
  }
  return [0.8, 0.8, 0.8];
}

function sanitizeName(str) {
  return String(str || 'item').replace(/[^a-zA-Z0-9_\u0400-\u04FF-]/g, '_').slice(0, 40);
}

function triangulateFace(points) {
  if (points.length < 3) return [];
  if (points.length === 3) return [[0, 1, 2]];
  if (points.length === 4) return [[0, 1, 2], [0, 2, 3]];
  // Convex / simple fan triangulation for planar polygons
  const triangles = [];
  for (let i = 1; i < points.length - 1; i++) {
    triangles.push([0, i, i + 1]);
  }
  return triangles;
}

/**
 * Generates Wavefront OBJ and MTL content for the complete room and all cabinets.
 * Coordinates are in millimeters with Y-up orientation (standard CAD / 3D).
 */
export function generateRoomOBJ(project, { doorsOpen = false } = {}) {
  const scene = makeScene(project, { room: true, allFaces: true, doorsOpen }, null);
  const faces = scene.faces || [];

  const baseName = sanitizeName(project?.name || 'Room_Plan');
  const mtlFilename = `${baseName}.mtl`;
  const objLines = [
    `# ATÖLYE Furniture Studio - 3D Room & Cabinets Wavefront OBJ Export`,
    `# Project: ${project?.name || 'Untitled'}`,
    `# Units: millimeters`,
    `mtllib ${mtlFilename}`,
    '',
  ];

  const mtlMap = new Map();
  const getMtlName = (hex, label = 'Mat') => {
    const key = (hex || '#cccccc').toLowerCase();
    if (!mtlMap.has(key)) {
      const idx = mtlMap.size + 1;
      const rgb = hexToRgb(key);
      const name = `${sanitizeName(label)}_${idx}_${key.replace('#', '')}`;
      mtlMap.set(key, { name, rgb });
    }
    return mtlMap.get(key).name;
  };

  // Pre-seed known project materials
  for (const m of project?.materials || []) {
    if (m?.color) getMtlName(m.color, m.name || 'Stock');
  }

  // Group faces by object: Room, or Cabinet Name
  const cabinetMap = new Map((project?.cabinets || []).map(c => [c.id, c]));
  const groups = new Map();

  for (const f of faces) {
    let groupKey = 'Room';
    let groupName = 'Room';
    if (f.room) {
      groupKey = f.floor ? 'Room_Floor' : f.door || f.doorLeaf || f.window ? 'Room_Openings' : 'Room_Walls';
      groupName = groupKey;
    } else if (f.id) {
      const cab = cabinetMap.get(f.id);
      const cabName = cab ? sanitizeName(cab.name) : sanitizeName(f.id);
      const comp = sanitizeName(f.component || 'body');
      groupKey = `Cabinet_${cabName}`;
      groupName = `${groupKey}_${comp}`;
    }
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push(f);
  }

  let vertexCount = 0;
  let normalCount = 0;

  for (const [groupName, gFaces] of groups.entries()) {
    objLines.push(`o ${groupName}`);
    objLines.push(`g ${groupName}`);

    // Group by material inside this object
    let currentMtl = null;
    for (const f of gFaces) {
      if (!f.points || f.points.length < 3) continue;
      const mtlName = getMtlName(f.rawColor || f.color, groupName);
      if (mtlName !== currentMtl) {
        objLines.push(`usemtl ${mtlName}`);
        currentMtl = mtlName;
      }

      // Normal
      let norm = f.normal;
      if (!norm || norm.length < 3) {
        // Compute polygon normal from first three vertices
        const p0 = f.points[0], p1 = f.points[1], p2 = f.points[2];
        const v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const nx = v1[1] * v2[2] - v1[2] * v2[1];
        const ny = v1[2] * v2[0] - v1[0] * v2[2];
        const nz = v1[0] * v2[1] - v1[1] * v2[0];
        const len = Math.hypot(nx, ny, nz) || 1;
        norm = [nx / len, ny / len, nz / len];
      }

      normalCount++;
      objLines.push(`vn ${norm[0].toFixed(4)} ${norm[1].toFixed(4)} ${norm[2].toFixed(4)}`);
      const normalIndex = normalCount;

      const rgb = hexToRgb(f.rawColor || f.color);
      const vIndices = [];
      for (const p of f.points) {
        vertexCount++;
        // Output extended OBJ vertex with vertex color (v x y z r g b)
        objLines.push(`v ${p[0].toFixed(2)} ${p[1].toFixed(2)} ${p[2].toFixed(2)} ${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)}`);
        vIndices.push(vertexCount);
      }

      const triangles = triangulateFace(f.points);
      for (const [i0, i1, i2] of triangles) {
        objLines.push(`f ${vIndices[i0]}//${normalIndex} ${vIndices[i1]}//${normalIndex} ${vIndices[i2]}//${normalIndex}`);
      }
    }
    objLines.push('');
  }

  // Build MTL content
  const mtlLines = [
    `# ATÖLYE Furniture Studio - Material Library`,
    `# Project: ${project?.name || 'Untitled'}`,
    '',
  ];
  for (const { name, rgb } of mtlMap.values()) {
    mtlLines.push(`newmtl ${name}`);
    mtlLines.push(`Ka 0.200 0.200 0.200`);
    mtlLines.push(`Kd ${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)}`);
    mtlLines.push(`Ks 0.150 0.150 0.150`);
    mtlLines.push(`Ns 20.0`);
    mtlLines.push(`d 1.0`);
    mtlLines.push(`illum 2`);
    mtlLines.push('');
  }

  return {
    obj: objLines.join('\n'),
    mtl: mtlLines.join('\n'),
    filename: `${baseName}-3d.obj`,
    mtlFilename,
  };
}

/**
 * Triggers browser download of the generated 3D OBJ file and MTL file.
 */
export function downloadRoomOBJ(project, options = {}) {
  const { obj, mtl, filename, mtlFilename } = generateRoomOBJ(project, options);

  const downloadBlob = (text, name, mime = 'text/plain') => {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  downloadBlob(obj, filename);
  if (mtl) downloadBlob(mtl, mtlFilename);
}
