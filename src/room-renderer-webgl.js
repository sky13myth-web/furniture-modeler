import { makeScene } from './renderer.js';
import { pointInPolygon } from './room-geometry.js';
import { triangulateFace } from './room-obj.js';

/** Render quality presets: shadow resolution, PCF taps and supersampling. */
export const RENDER_QUALITY = {
  low:    { label: 'Низкое',  shadowSize: 1024, sunShadows: false, overheadSamples: 8,  sunSamples: 6,  pixelRatio: 1 },
  medium: { label: 'Среднее', shadowSize: 2048, sunShadows: true,  overheadSamples: 12, sunSamples: 10, pixelRatio: 1.5 },
  high:   { label: 'Высокое', shadowSize: 2048, sunShadows: true,  overheadSamples: 16, sunSamples: 16, pixelRatio: 2 },
  ultra:  { label: 'Ультра',  shadowSize: 4096, sunShadows: true,  overheadSamples: 24, sunSamples: 24, pixelRatio: 3 },
};

/** Procedural floor styles for the 3D WebGL room renderer. */
export const FLOOR_STYLES = {
  oak:      { id: 0, label: 'Натуральный дуб' },
  ash:      { id: 1, label: 'Светлый ясень' },
  walnut:   { id: 2, label: 'Тёмный орех' },
  tile:     { id: 3, label: 'Керамогранит' },
  concrete: { id: 4, label: 'Тёплый бетон' },
};

/** Helper for 3D measurement calculations */
export function get3DMeasurementMetrics(p1, p2) {
  const x1 = (Array.isArray(p1) ? p1[0] : p1?.x) ?? 0;
  const y1 = (Array.isArray(p1) ? p1[1] : p1?.y) ?? 0;
  const z1 = (Array.isArray(p1) ? p1[2] : p1?.z) ?? 0;

  const x2 = (Array.isArray(p2) ? p2[0] : p2?.x) ?? 0;
  const y2 = (Array.isArray(p2) ? p2[1] : p2?.y) ?? 0;
  const z2 = (Array.isArray(p2) ? p2[2] : p2?.z) ?? 0;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;

  const distance = Math.round(Math.hypot(dx, dy, dz));
  const distanceHorizontal = Math.round(Math.hypot(dx, dz));

  return { dx, dy, dz, distance, distanceHorizontal };
}

/**
 * Checks whether a 3D ray is occluded by an exterior solid room wall before reaching a cabinet.
 */
export function isRayOccludedByWall(ray, wallBounds, cabinetDist = Infinity) {
  if (!ray || !ray.origin || !ray.dir || !wallBounds) return false;
  let minX, maxX, minY, maxY, minZ, maxZ;
  if (wallBounds.min && wallBounds.max) {
    minX = wallBounds.min[0]; minY = wallBounds.min[1]; minZ = wallBounds.min[2];
    maxX = wallBounds.max[0]; maxY = wallBounds.max[1]; maxZ = wallBounds.max[2];
  } else if (wallBounds.minX !== undefined) {
    minX = wallBounds.minX; maxX = wallBounds.maxX;
    minY = wallBounds.minY ?? 0; maxY = wallBounds.maxY ?? 3000;
    minZ = wallBounds.minZ; maxZ = wallBounds.maxZ;
  } else if (wallBounds.points && wallBounds.points.length >= 3) {
    minX = Math.min(...wallBounds.points.map(p => p[0]));
    maxX = Math.max(...wallBounds.points.map(p => p[0]));
    minY = Math.min(...wallBounds.points.map(p => p[1]));
    maxY = Math.max(...wallBounds.points.map(p => p[1]));
    minZ = Math.min(...wallBounds.points.map(p => p[2]));
    maxZ = Math.max(...wallBounds.points.map(p => p[2]));
  } else if (wallBounds.start && wallBounds.end) {
    const thickness = wallBounds.thickness || 150;
    const ax = wallBounds.start.x ?? wallBounds.start[0] ?? 0;
    const az = wallBounds.start.z ?? wallBounds.start[1] ?? 0;
    const bx = wallBounds.end.x ?? wallBounds.end[0] ?? 0;
    const bz = wallBounds.end.z ?? wallBounds.end[1] ?? 0;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const pts = [
      [ax + nx * thickness * 0.5, az + nz * thickness * 0.5],
      [ax - nx * thickness * 0.5, az - nz * thickness * 0.5],
      [bx + nx * thickness * 0.5, bz + nz * thickness * 0.5],
      [bx - nx * thickness * 0.5, bz - nz * thickness * 0.5],
    ];
    minX = Math.min(...pts.map(p => p[0]));
    maxX = Math.max(...pts.map(p => p[0]));
    minY = wallBounds.bottom ?? 0;
    maxY = wallBounds.top ?? wallBounds.height ?? 2700;
    minZ = Math.min(...pts.map(p => p[1]));
    maxZ = Math.max(...pts.map(p => p[1]));
  } else {
    return false;
  }

  const ox = ray.origin[0], oy = ray.origin[1], oz = ray.origin[2];
  const dx = ray.dir[0], dy = ray.dir[1], dz = ray.dir[2];

  let tmin = -Infinity;
  let tmax = Infinity;

  const bMin = [minX, minY, minZ];
  const bMax = [maxX, maxY, maxZ];
  const origins = [ox, oy, oz];
  const dirs = [dx, dy, dz];

  for (let i = 0; i < 3; i++) {
    if (Math.abs(dirs[i]) < 1e-7) {
      if (origins[i] < bMin[i] || origins[i] > bMax[i]) return false;
    } else {
      let t1 = (bMin[i] - origins[i]) / dirs[i];
      let t2 = (bMax[i] - origins[i]) / dirs[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }

  if (tmax < 0) return false;
  const tHit = tmin >= 0 ? tmin : tmax;
  return tHit > 0 && tHit < cabinetDist;
}

const NON_TEXTURED_COMPONENTS = new Set([
  'appliance',
  'appliance-detail',
  'handle',
  'door-handle',
  'drawer-handle',
  'internal-drawer-handle',
  'hinge',
  'rod',
  'rod-holder',
  'rod-highlight',
  'rod-detail',
  'drawer-railing',
  'drawer-railing-connector',
  'drawer-railing-highlight',
  'drawer-glass',
  'drawer-runner',
  'drawer-runner-highlight',
  'leg',
  'unified-plinth',
  'plinth-seal',
  'plinth-highlight',
  'plinth-seam',
  'led-lighting',
  'led-glow',
  'led-core',
]);

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return [0.8, 0.8, 0.8];
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) / 255,
      parseInt(clean[1] + clean[1], 16) / 255,
      parseInt(clean[2] + clean[2], 16) / 255,
    ];
  }
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255,
    ];
  }
  return [0.8, 0.8, 0.8];
}

export function resolveFaceTexture(f, project) {
  if (!project || !f || f.room || f.floor || f.window || f.obstacle || f.noTexture) return null;
  if (f.handle || f.hingePart || f.runnerPart || NON_TEXTURED_COMPONENTS.has(f.component)) return null;
  if (f.localTextureUrl) return f.localTextureUrl;
  if (f.textureUrl) return f.textureUrl;
  if (f.previewUrl) return f.previewUrl;

  const materials = project.materials || [];
  const getTexture = (mat) => {
    if (!mat) return null;
    if (mat.localTextureUrl) return mat.localTextureUrl;
    if (mat.decorCode) return `./assets/textures/${mat.decorCode}.jpg`;
    return mat.textureUrl || mat.previewUrl || null;
  };

  if (f.materialId) {
    const mat = materials.find(m => m.id === f.materialId);
    const tex = getTexture(mat);
    if (tex) return tex;
  }

  if (f.id && project.cabinets) {
    const cab = project.cabinets.find(c => c.id === f.id);
    if (cab) {
      if (f.component === 'front') {
        const frontMatId = cab.frontMaterialId || cab.materialId;
        const mat = materials.find(m => m.id === frontMatId);
        const tex = getTexture(mat);
        if (tex) return tex;
      } else {
        const mat = materials.find(m => m.id === cab.materialId);
        const tex = getTexture(mat);
        if (tex) return tex;
      }
    }
  }
  return null;
}

export function classifyFaceMaterial(f) {
  if (!f) return MATERIAL.furniture;
  if (f.room && !f.obstacle) return f.floor ? MATERIAL.floor : MATERIAL.wall;
  if (f.component === 'drawer-glass') return MATERIAL.glass;
  if (f.component === 'led-glow' || f.component === 'led-core') return MATERIAL.emissive;
  const col = String(f.rawColor || f.color || '').toLowerCase();
  if (col === '#4fc3f7' || col === '#ff5722' || col === '#fffde7' || col === '#fff9e6' || col === '#fff3cf') {
    return MATERIAL.emissive;
  }
  if (
    f.handle ||
    f.hingePart ||
    f.runnerPart ||
    f.component === 'rod' ||
    f.component === 'rod-holder' ||
    f.component === 'rod-detail' ||
    f.component === 'drawer-railing' ||
    f.component === 'drawer-railing-connector' ||
    f.component === 'drawer-runner' ||
    f.component === 'unified-plinth' ||
    f.component === 'led-lighting'
  ) {
    return MATERIAL.metal;
  }
  if (f.component === 'appliance' || f.component === 'appliance-detail') {
    if (
      col === '#181b1d' ||
      col === '#1f2427' ||
      col === '#0f1112' ||
      col === '#0b0d0e' ||
      col === '#0e1011' ||
      col === '#1e2124'
    ) {
      return MATERIAL.ceramic;
    }
    return MATERIAL.metal;
  }
  return MATERIAL.furniture;
}

function mat4Perspective(out, fovyRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovyRad / 2);
  const nf = 1.0 / (near - far);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
  return out;
}

function mat4Ortho(out, left, right, bottom, top, near, far) {
  const lr = 1.0 / (left - right), bt = 1.0 / (bottom - top), nf = 1.0 / (near - far);
  out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
  out[12] = (left + right) * lr; out[13] = (top + bottom) * bt; out[14] = (far + near) * nf; out[15] = 1;
  return out;
}

function mat4LookAt(out, eye, target, up = [0, 1, 0]) {
  let z0 = eye[0] - target[0], z1 = eye[1] - target[1], z2 = eye[2] - target[2];
  let len = Math.hypot(z0, z1, z2) || 1;
  z0 /= len; z1 /= len; z2 /= len;
  let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2) || 1;
  x0 /= len; x1 /= len; x2 /= len;
  let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
  out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
  out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
  out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

function mat4Multiply(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

function mat4Invert(out, a) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return false;
  const invDet = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * invDet;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * invDet;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * invDet;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * invDet;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * invDet;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * invDet;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * invDet;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * invDet;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;

  return true;
}

function vec4Transform(v, m) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
  ];
}

// Material ids passed per vertex (aMaterial):
// 0 = furniture / frames (satin), 1 = floor, 2 = walls & ceiling (matte),
// 3 = glass, 4 = emissive light diffuser, 5 = brushed / chrome metal, 6 = ceramic glass.
export const MATERIAL = Object.freeze({ furniture: 0, floor: 1, wall: 2, glass: 3, emissive: 4, metal: 5, ceramic: 6 });

export const VERTEX_SHADER_SOURCE = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec4 aColor;
attribute float aMaterial;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec4 vColor;
varying float vMaterial;

void main() {
  vPosition = aPosition;
  vNormal = aNormal;
  vColor = aColor;
  vMaterial = aMaterial;
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition, 1.0);
}
`;

export const FRAGMENT_SHADER_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec3 vPosition;
varying vec3 vNormal;
varying vec4 vColor;
varying float vMaterial;

uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform vec3 uCameraPos;
uniform mat4 uLightSpaceMatrix;
uniform sampler2D uShadowMap;
uniform bool uUseShadows;
uniform int uLightingMode;
uniform int uFloorStyle;
uniform vec2 uResolution;
uniform float uRoomHeight;
uniform float uShadowTexel;
uniform sampler2D uMaterialTexture;
uniform bool uHasTexture;
uniform sampler2D uSunShadowMap;
uniform mat4 uSunLightSpace;
uniform vec3 uSunDir;
uniform float uSunShadowTexel;
uniform bool uUseSunShadows;
uniform float uRoughnessOverride;
uniform int uOverheadSamples;
uniform int uSunSamples;
uniform bool uRayTracing;
uniform vec3 uRoomMin;
uniform vec3 uRoomMax;
uniform int uExtraLightCount;
uniform vec3 uExtraLightPos[6];
uniform vec3 uExtraLightColor[6];

const float PI = 3.14159265;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float unpackDepth(vec4 c) {
  return c.r + c.g / 255.0;
}

// Overhead light-space visibility. The light looks straight down, so a wide
// rotated spiral kernel doubles as soft contact shadow / ambient occlusion
// under and around furniture, inside carcasses and below shelves.
float shadowVisibility(vec3 worldPos, vec3 norm, float radiusTexels) {
  vec4 ls = uLightSpaceMatrix * vec4(worldPos + norm * 8.0, 1.0);
  vec3 p = ls.xyz / ls.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float current = p.z - 0.0008;
  float rot = hash12(gl_FragCoord.xy) * 6.2831853;
  float lit = 0.0;
  float n = float(uOverheadSamples);
  for (int i = 0; i < 24; i++) {
    if (i >= uOverheadSamples) break;
    float fi = float(i);
    float r = sqrt((fi + 0.5) / n) * radiusTexels;
    float a = fi * 2.39996323 + rot;
    vec2 off = vec2(cos(a), sin(a)) * r * uShadowTexel;
    float d = unpackDepth(texture2D(uShadowMap, p.xy + off));
    lit += (current <= d) ? 1.0 : 0.0;
  }
  return lit / n;
}

// Fast single-tap shadow lookup for ray-traced reflection hit points
float fastShadowTap(vec3 worldPos) {
  vec4 ls = uLightSpaceMatrix * vec4(worldPos + vec3(0.0, 12.0, 0.0), 1.0);
  vec3 p = ls.xyz / ls.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float d = unpackDepth(texture2D(uShadowMap, p.xy));
  return (p.z - 0.0015 <= d) ? 1.0 : 0.25;
}

// Directional sun / key-light shadow with rotated Poisson PCF (soft penumbra).
float sunShadow(vec3 worldPos, vec3 norm) {
  if (!uUseSunShadows) return 1.0;
  float NdL = dot(norm, uSunDir);
  if (NdL <= 0.0) return 0.0;
  vec3 offsetPos = worldPos + norm * mix(14.0, 4.0, NdL);
  vec4 ls = uSunLightSpace * vec4(offsetPos, 1.0);
  vec3 p = ls.xyz / ls.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float current = p.z - 0.0012;
  float rot = hash12(gl_FragCoord.yx + 17.0) * 6.2831853;
  float lit = 0.0;
  float n = float(uSunSamples);
  for (int i = 0; i < 24; i++) {
    if (i >= uSunSamples) break;
    float fi = float(i);
    float r = sqrt((fi + 0.5) / n) * 2.6;
    float a = fi * 2.39996323 + rot;
    vec2 off = vec2(cos(a), sin(a)) * r * uSunShadowTexel;
    float d = unpackDepth(texture2D(uSunShadowMap, p.xy + off));
    lit += (current <= d) ? 1.0 : 0.0;
  }
  return lit / n;
}

// Analytical + shadow-mapped Ray-Traced environment & interior reflection
vec3 traceRayEnv(vec3 ro, vec3 rd, vec3 skyCol, vec3 groundCol, float roughness) {
  vec3 bMin = uRoomMin;
  vec3 bMax = uRoomMax;
  vec3 invDir = 1.0 / (rd + vec3(1e-6));
  vec3 t0 = (bMin - ro) * invDir;
  vec3 t1 = (bMax - ro) * invDir;
  vec3 tmaxV = max(t0, t1);
  float tHit = min(min(tmaxV.x, tmaxV.y), tmaxV.z);
  tHit = max(tHit, 0.0);
  vec3 hitPos = ro + rd * tHit;

  // Base gradient environment
  vec3 env = mix(groundCol, skyCol * 1.38, smoothstep(-0.25, 0.65, rd.y));

  // Ceiling luminaire reflection (glowing disc at uLightPos only when no user-placed lights exist)
  if (rd.y > 0.02 && uExtraLightCount == 0) {
    float tCeil = (uLightPos.y - 30.0 - ro.y) / max(rd.y, 1e-4);
    if (tCeil > 0.0) {
      vec3 ceilHit = ro + rd * tCeil;
      float dLight = length(ceilHit.xz - uLightPos.xz);
      float disc = 1.0 - smoothstep(140.0, 260.0 + roughness * 450.0, dLight);
      env += vec3(1.65, 1.55, 1.38) * disc * (1.0 - roughness * 0.55);
    }
  }

  // Studio softbox & architectural window reflections
  float softboxLeft = smoothstep(0.55, 0.92, dot(rd, normalize(vec3(-0.65, 0.48, 0.58))));
  float softboxRight = smoothstep(0.60, 0.94, dot(rd, normalize(vec3(0.72, 0.42, 0.55))));
  float windowPortal = 0.0;
  if (hitPos.y > 750.0 && hitPos.y < 2250.0) {
    float nearWallX = min(abs(hitPos.x - bMin.x), abs(hitPos.x - bMax.x));
    float nearWallZ = min(abs(hitPos.z - bMin.z), abs(hitPos.z - bMax.z));
    if (nearWallX < 35.0 || nearWallZ < 35.0) {
      float wStripe = sin(hitPos.x * 0.0035 + hitPos.z * 0.0035);
      windowPortal = smoothstep(0.25, 0.75, wStripe) * (uLightingMode == 1 ? 1.15 : 0.42);
    }
  }
  env += vec3(1.15, 1.22, 1.35) * windowPortal * (1.0 - roughness * 0.5);
  env += vec3(1.10, 1.06, 1.00) * (softboxLeft * 0.55 + softboxRight * 0.42) * (uLightingMode == 2 ? 1.45 : 0.65);

  // Floor reflection with furniture shadow map projection (real contact reflections on floor & lower panels)
  if (rd.y < -0.01 && ro.y > 1.0) {
    float tFloor = -ro.y / min(rd.y, -1e-4);
    if (tFloor > 0.0 && tFloor < 3500.0) {
      vec3 fHit = ro + rd * tFloor;
      float fVis = uUseShadows ? fastShadowTap(fHit) : 1.0;
      float fade = exp(-tFloor * 0.00065);
      env = mix(env, groundCol * fVis * 1.15, fade * 0.72);
    }
  } else if (ro.y <= 3.0 && rd.y > 0.01) {
    // Ray from floor upwards hitting cabinet undersides / room
    vec3 probePos = ro + rd * min(tHit, 550.0);
    float upVis = uUseShadows ? fastShadowTap(probePos) : 1.0;
    env *= mix(0.32, 1.08, upVis);
  }

  // Warm LED strip accent reflection in interior / night-led modes
  if (uLightingMode == 3 || uLightingMode == 0) {
    float ledBand = exp(-abs(hitPos.y - 1420.0) * 0.006) + exp(-abs(hitPos.y - 860.0) * 0.008) * 0.6;
    env += vec3(1.25, 0.92, 0.52) * ledBand * (uLightingMode == 3 ? 0.85 : 0.28);
  }

  return env;
}

float distributionGGX(float NdH, float a) {
  float a2 = a * a;
  float d = NdH * NdH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-5);
}

float visibilitySmith(float NdL, float NdV, float a) {
  return 0.5 / max(mix(2.0 * NdL * NdV, NdL + NdV, a), 1e-4);
}

vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float vignette() {
  vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  float d = length((uv - 0.5) * vec2(1.12, 1.0)) * 1.32;
  return clamp(1.0 - 0.30 * pow(d, 2.6), 0.0, 1.0);
}

void main() {
  vec3 norm = normalize(vNormal);
  vec3 viewDir = normalize(uCameraPos - vPosition);
  if (dot(norm, viewDir) < 0.0) norm = -norm;
  bool evening = uLightingMode != 1;
  bool isStudio = uLightingMode == 2;
  bool isNightLed = uLightingMode == 3;

  bool isFloorMat = vMaterial > 0.5 && vMaterial < 1.5;
  bool isWall = vMaterial > 1.5 && vMaterial < 2.5;
  bool isGlass = vMaterial > 2.5 && vMaterial < 3.5;
  bool isEmissive = vMaterial > 3.5 && vMaterial < 4.5;
  bool isMetal = vMaterial > 4.5 && vMaterial < 5.5;
  bool isCeramic = vMaterial > 5.5;
  // Floor faces: tagged floor material, or any room surface at floor level (vPosition.y < 2.0)
  bool isFloor = isFloorMat || (isWall && vPosition.y < 2.0 && norm.y > 0.5);

  if (isEmissive) {
    float lum = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 glow = (lum < 0.85) ? (vColor.rgb * (isNightLed ? 1.45 : 1.18)) : (evening ? vec3(1.0, 0.96, 0.88) : vec3(0.96, 0.96, 0.94));
    gl_FragColor = vec4(clamp(glow, 0.0, 1.0) * vignette(), 1.0);
    return;
  }

  vec3 albedo = pow(vColor.rgb, vec3(2.2));
  float roughness = 0.46;
  float f0 = 0.045;
  if (isWall) roughness = 0.92;
  if (isMetal) {
    roughness = uRayTracing ? 0.16 : 0.22;
    f0 = 0.78;
    // Subtle brushed stainless steel micro-grain along horizontal axis
    float brush = sin(vPosition.x * 1.8 + vPosition.z * 1.8) * 0.025 + sin(vPosition.y * 0.9) * 0.015;
    albedo *= (1.0 + brush);
  } else if (isCeramic) {
    roughness = 0.08;
    f0 = 0.11;
  }

  if (uHasTexture && !isFloor && !isWall && !isGlass && !isEmissive && !isMetal && !isCeramic) {
    vec2 uv;
    if (abs(norm.y) > 0.6) {
      uv = vPosition.xz;
    } else if (abs(norm.x) > 0.6) {
      uv = vec2(vPosition.z, vPosition.y);
    } else {
      uv = vec2(vPosition.x, vPosition.y);
    }
    vec2 texCoord = uv / 1200.0;
    vec4 texel = texture2D(uMaterialTexture, texCoord);
    albedo = pow(texel.rgb, vec3(2.2));
    roughness = uRayTracing ? 0.34 : 0.42;
  }
  if (uRoughnessOverride >= 0.0 && !isFloor && !isWall && !isGlass && !isMetal && !isCeramic) roughness = uRoughnessOverride;

  // Painted plaster: low-frequency tonal variation keeps large walls from looking flat
  if (isWall && !isFloor) {
    vec2 wp = vec2(vPosition.x + vPosition.z, vPosition.y);
    float n = hash12(floor(wp / 40.0)) * 0.5 + hash12(floor(wp / 9.0) + 3.1) * 0.5;
    albedo *= 0.985 + n * 0.03;
  }

  // Procedural floor styles: 0 = oak, 1 = ash, 2 = walnut, 3 = porcelain tile, 4 = warm concrete
  if (isFloor) {
    if (uFloorStyle == 3) {
      // Large-format 600x600mm porcelain stoneware tiles with fine grout joints
      float tileSize = 600.0;
      vec2 tCell = mod(vPosition.xz, tileSize);
      vec2 tId = floor(vPosition.xz / tileSize);
      float edge = min(min(tCell.x, tileSize - tCell.x), min(tCell.y, tileSize - tCell.y));
      float grout = 1.0 - smoothstep(1.2, 3.2, edge);
      float tileRand = hash12(tId * 1.73);
      float vein = sin(vPosition.x * 0.006 + sin(vPosition.z * 0.008 + tileRand * 6.0) * 2.5);
      vec3 stone = pow(vec3(0.79, 0.77, 0.74), vec3(2.2)) * (0.94 + tileRand * 0.10 + vein * 0.03);
      vec3 groutCol = pow(vec3(0.52, 0.50, 0.48), vec3(2.2));
      albedo = mix(stone, groutCol, grout * 0.75);
      roughness = mix(uRayTracing ? 0.15 : 0.24, 0.85, grout);
      f0 = 0.06;
    } else if (uFloorStyle == 4) {
      // Architectural warm micro-cement / polished concrete floor
      float n1 = hash12(floor(vPosition.xz / 120.0));
      float n2 = hash12(floor(vPosition.xz / 28.0) + 5.7);
      float cloud = sin(vPosition.x * 0.0025) * cos(vPosition.z * 0.0025) * 0.04;
      vec3 conc = pow(vec3(0.68, 0.66, 0.63), vec3(2.2)) * (0.94 + n1 * 0.06 + n2 * 0.04 + cloud);
      albedo = conc;
      roughness = uRayTracing ? 0.30 : 0.44;
    } else {
      // Wood plank floor (0 = natural oak, 1 = light ash, 2 = dark walnut)
      float plankWidth = 190.0;
      float plankLength = 1400.0;
      float row = floor(vPosition.z / plankWidth);
      float stagger = hash12(vec2(row, 7.0)) * plankLength;
      vec2 pCoord = vec2(vPosition.x + stagger, vPosition.z);
      float col = floor(pCoord.x / plankLength);
      vec2 cell = vec2(mod(pCoord.x, plankLength), mod(pCoord.y, plankWidth));
      float edgeX = min(cell.x, plankLength - cell.x);
      float edgeZ = min(cell.y, plankWidth - cell.y);
      float seam = 1.0 - smoothstep(0.6, 2.6, min(edgeX, edgeZ));
      float plankRand = hash12(vec2(row * 1.37, col * 2.11));
      vec3 baseWood = vec3(0.70, 0.54, 0.38);
      if (uFloorStyle == 1) baseWood = vec3(0.83, 0.75, 0.64);
      else if (uFloorStyle == 2) baseWood = vec3(0.42, 0.29, 0.20);
      vec3 oak = pow(baseWood, vec3(2.2));
      oak *= 0.86 + plankRand * 0.26;
      float rings = sin(cell.y * 0.11 + sin(cell.x * 0.0045 + plankRand * 20.0) * 6.0 + plankRand * 40.0);
      float fibre = sin(cell.y * 0.95 + cell.x * 0.002 + plankRand * 13.0);
      oak *= 1.0 + rings * 0.06 + fibre * 0.025;
      albedo = mix(albedo, oak, 0.92) * (1.0 - seam * 0.45);
      roughness = uRayTracing ? 0.24 : 0.34;
      f0 = 0.05;
    }
  }

  // Subtle procedural grain on wood-coloured furniture decors
  bool isWood = (!isFloor && !isWall && !isGlass && !isMetal && !isCeramic && vColor.a > 0.9 &&
                 vColor.r > vColor.b * 1.08 && (vColor.r - vColor.b) > 0.045 &&
                 vColor.r > 0.22 && vColor.b < 0.88);
  if (isWood && !uHasTexture) {
    float u = (abs(norm.y) < 0.5) ? dot(vPosition.xz, vec2(-norm.z, norm.x)) : vPosition.x;
    float v = (abs(norm.y) < 0.5) ? vPosition.y : vPosition.z;
    float grainWave = sin(u * 0.45 + sin(v * 0.015) * 3.5);
    float fineGrain = sin(u * 1.8 + sin(v * 0.04) * 4.0);
    float microFibers = sin(u * 6.0 + v * 0.2) * 0.5 + 0.5;
    float grain = grainWave * 0.05 + fineGrain * 0.025 + (microFibers - 0.5) * 0.02;
    albedo *= (1.0 + grain);
    roughness = uRayTracing ? 0.44 : 0.58;
  }

  // Hemispheric ambient (restrained fill so directional/point lights sculpt real 3D form)
  vec3 skyCol = isNightLed ? vec3(0.05, 0.06, 0.10) : isStudio ? vec3(0.18, 0.19, 0.22) : evening ? vec3(0.13, 0.12, 0.11) : vec3(0.20, 0.23, 0.28);
  vec3 groundCol = isNightLed ? vec3(0.02, 0.02, 0.015) : isStudio ? vec3(0.07, 0.065, 0.06) : evening ? vec3(0.045, 0.038, 0.032) : vec3(0.07, 0.065, 0.055);
  float hemiFactor = norm.y * 0.5 + 0.5;
  // Subtle directional orientation shading so perpendicular walls and cabinet sides never merge into flat ambient
  float dirContrast = 0.72 + 0.28 * max(0.0, dot(norm, normalize(vec3(0.42, 0.58, 0.70))));
  vec3 ambient = mix(groundCol, skyCol, hemiFactor) * dirContrast;

  // Ambient occlusion & overhead shadow: retain real shadow depth on both horizontal and vertical surfaces
  float upFacing = smoothstep(0.25, 0.85, norm.y);
  float rawVis = uUseShadows ? shadowVisibility(vPosition, norm, mix(14.0, 175.0, upFacing)) : 1.0;
  float vis = mix(mix(0.32, 1.0, rawVis), rawVis * rawVis, smoothstep(0.15, 0.75, abs(norm.y)));
  float ao = mix(mix(0.42, 1.0, vis), mix(0.16, 1.0, vis), upFacing);
  float vertical = 1.0 - abs(norm.y);
  ao *= mix(1.0, mix(0.48, 1.0, smoothstep(0.0, 380.0, vPosition.y)), vertical * (isWall ? 1.0 : 0.75));
  if (isWall) ao *= mix(1.0, mix(0.68, 1.0, smoothstep(0.0, 320.0, uRoomHeight - vPosition.y)), vertical);
  // Ceiling receives soft bounced light from the room below
  bool isCeiling = isWall && norm.y < -0.5 && vPosition.y > uRoomHeight - 5.0;
  if (isCeiling) ambient = mix(ambient, skyCol, 0.50) * (evening ? 1.15 : 1.05);

  // Ray-Traced Multi-Bounce Global Illumination (GI): warm floor bounce & under-cabinet LED bounce
  if (uRayTracing && !isFloor) {
    float floorBounce = max(0.0, -norm.y * 0.5 + 0.5) * exp(-max(0.0, vPosition.y) * 0.0014);
    vec3 floorTint = (uFloorStyle == 2) ? vec3(0.26, 0.17, 0.11) : (uFloorStyle >= 3) ? vec3(0.36, 0.35, 0.33) : vec3(0.42, 0.31, 0.20);
    ambient += floorTint * floorBounce * 0.12 * vis;
    if (isNightLed || uLightingMode == 0) {
      float ledProx = exp(-abs(vPosition.y - 1400.0) * 0.004) * (1.0 - float(isWall) * 0.55);
      ambient += vec3(0.92, 0.64, 0.32) * ledProx * (isNightLed ? 0.34 : 0.10);
    }
  }

  float NdV = max(dot(norm, viewDir), 1e-3);
  float alpha = roughness * roughness;

  // Primary ceiling light (warm point light, active only when no user-placed lights exist)
  vec3 diffuse = vec3(0.0);
  vec3 specular = vec3(0.0);
  if (uExtraLightCount == 0) {
    vec3 toLight = uLightPos - vPosition;
    float dist = length(toLight);
    vec3 L = toLight / max(dist, 1.0);
    float dM = dist * 0.001;
    float atten = 1.25 / (1.0 + 0.42 * dM * dM + 0.08 * dM * dM * dM);
    float lightBoost = (isStudio ? 1.15 : isNightLed ? 0.55 : evening ? 1.32 : 0.85);
    vec3 lightCol = uLightColor * lightBoost * atten * mix(0.22, 1.0, vis);
    float NdL = max(dot(norm, L), 0.0);
    vec3 H = normalize(L + viewDir);
    float NdH = max(dot(norm, H), 0.0);
    float VdH = max(dot(viewDir, H), 0.0);
    float F = f0 + (1.0 - f0) * pow(1.0 - VdH, 5.0);
    float specTerm = distributionGGX(NdH, alpha) * visibilitySmith(NdL, NdV, alpha) * F * PI;
    diffuse = lightCol * NdL;
    specular = lightCol * NdL * specTerm;
  }

  // User-placed room light sources from the 2D floor plan (up to 6 active lights)
  for (int i = 0; i < 6; i++) {
    if (i >= uExtraLightCount) break;
    vec3 toEL = uExtraLightPos[i] - vPosition;
    float elDist = length(toEL);
    vec3 elL = toEL / max(elDist, 1.0);
    float elDM = elDist * 0.001;
    float elAtten = 1.45 / (1.0 + 0.48 * elDM * elDM + 0.14 * elDM * elDM * elDM);
    float elNdL = max(dot(norm, elL), 0.0);
    if (elNdL > 0.0) {
      vec3 elH = normalize(elL + viewDir);
      float elNdH = max(dot(norm, elH), 0.0);
      float elVdH = max(dot(viewDir, elH), 0.0);
      float elF = f0 + (1.0 - f0) * pow(1.0 - elVdH, 5.0);
      float elSpec = distributionGGX(elNdH, alpha) * visibilitySmith(elNdL, NdV, alpha) * elF * PI;
      vec3 elCol = uExtraLightColor[i] * elAtten * mix(0.30, 1.0, vis);
      diffuse += elCol * elNdL;
      specular += elCol * elNdL * elSpec;
    }
  }

  float sunVis = sunShadow(vPosition, norm);
  if (uLightingMode == 1) {
    // Daylight sun through the windows, with real cast shadows
    vec3 sunDir = uSunDir;
    vec3 sunCol = vec3(1.22, 1.16, 1.06) * mix(0.38, 1.0, vis) * mix(0.12, 1.0, sunVis);
    float sNdL = max(dot(norm, sunDir), 0.0);
    vec3 sH = normalize(sunDir + viewDir);
    float sF = f0 + (1.0 - f0) * pow(1.0 - max(dot(viewDir, sH), 0.0), 5.0);
    float sSpec = distributionGGX(max(dot(norm, sH), 0.0), alpha) * visibilitySmith(sNdL, NdV, alpha) * sF * PI;
    diffuse += sunCol * sNdL;
    specular += sunCol * sNdL * sSpec;
  } else if (isStudio) {
    // 3-Point Studio Lighting: Key light + Cool Rim light + Soft Fill
    vec3 keyDir = normalize(vec3(0.45, 0.72, 0.52));
    float kNdL = max(dot(norm, keyDir), 0.0);
    vec3 kH = normalize(keyDir + viewDir);
    float kF = f0 + (1.0 - f0) * pow(1.0 - max(dot(viewDir, kH), 0.0), 5.0);
    float kSpec = distributionGGX(max(dot(norm, kH), 0.0), alpha) * visibilitySmith(kNdL, NdV, alpha) * kF * PI;
    vec3 keyCol = vec3(0.64, 0.62, 0.58) * ao * mix(0.20, 1.0, sunVis);
    diffuse += keyCol * kNdL;
    specular += keyCol * kNdL * kSpec;

    vec3 rimDir = normalize(vec3(-0.62, 0.48, 0.62));
    float rNdL = max(dot(norm, rimDir), 0.0);
    vec3 rH = normalize(rimDir + viewDir);
    float rSpec = distributionGGX(max(dot(norm, rH), 0.0), alpha) * visibilitySmith(rNdL, NdV, alpha) * f0 * PI;
    diffuse += vec3(0.20, 0.24, 0.30) * rNdL * ao;
    specular += vec3(0.45, 0.52, 0.62) * rNdL * rSpec;
  } else {
    // Soft warm key light to model furniture volumes, also shadowed
    vec3 keyDir = uSunDir;
    float kNdL = max(dot(norm, keyDir), 0.0);
    vec3 kH = normalize(keyDir + viewDir);
    float kF = f0 + (1.0 - f0) * pow(1.0 - max(dot(viewDir, kH), 0.0), 5.0);
    float kSpec = distributionGGX(max(dot(norm, kH), 0.0), alpha) * visibilitySmith(kNdL, NdV, alpha) * kF * PI;
    vec3 keyCol = (isNightLed ? vec3(0.18, 0.14, 0.11) : vec3(0.28, 0.25, 0.21)) * ao * mix(0.18, 1.0, sunVis);
    diffuse += keyCol * kNdL;
    specular += keyCol * kNdL * kSpec;
  }

  // Environment reflection: Ray-Traced multi-sample reflection when uRayTracing is active
  vec3 R = reflect(-viewDir, norm);
  vec3 env;
  if (uRayTracing && (!isWall || isFloor)) {
    vec3 env0 = traceRayEnv(vPosition, R, skyCol, groundCol, roughness);
    if (roughness < 0.45) {
      vec2 xi = hash22(gl_FragCoord.xy) - 0.5;
      vec3 jitterR = normalize(R + vec3(xi.x, xi.y * 0.5, -xi.x) * roughness * 0.35);
      vec3 env1 = traceRayEnv(vPosition, jitterR, skyCol, groundCol, roughness);
      env = mix(env0, env1, 0.45);
    } else {
      env = env0;
    }
  } else {
    env = mix(groundCol, skyCol * 1.25, smoothstep(-0.2, 0.6, R.y));
  }
  float fresnelV = f0 + (1.0 - f0) * pow(1.0 - NdV, 5.0);
  float reflBoost = uRayTracing ? (isMetal ? 1.55 : isCeramic ? 1.35 : isFloor ? 1.15 : 0.95) : (isMetal ? 1.25 : isCeramic ? 1.15 : 0.75);
  vec3 envSpec = env * fresnelV * (1.0 - roughness) * reflBoost * ao;

  vec3 color;
  float outAlpha = vColor.a;
  if (isGlass) {
    float gF = 0.05 + 0.95 * pow(1.0 - NdV, 5.0);
    color = albedo * ambient * 0.28 + env * (0.15 + gF * 0.65) + min(specular, vec3(0.70));
    outAlpha = clamp(vColor.a + gF * 0.48, 0.0, 0.94);
  } else if (isMetal) {
    // Conductive metal tinting on reflections and reduced diffuse
    color = albedo * (ambient * ao * 0.34 + diffuse * 0.40) + mix(vec3(1.0), albedo, 0.72) * (specular + envSpec);
  } else {
    color = albedo * (ambient * ao + diffuse) + specular + envSpec;
  }

  // Filmic ACES tone mapping, gamma, light warm grade and lens vignette
  float exposure = isNightLed ? 0.96 : isStudio ? 0.88 : evening ? 0.90 : 0.86;
  vec3 mapped = acesFilm(color * exposure);
  vec3 finalColor = pow(mapped, vec3(1.0 / 2.2));
  if (evening && !isStudio) finalColor *= vec3(1.015, 1.0, 0.975);
  finalColor *= vignette();
  // Triangular dither (±1/255) removes banding in soft gradients and shadows
  finalColor += (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 71.3) - 1.0) / 255.0;
  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), outAlpha);
}
`;

const SHADOW_VS = `
attribute vec3 aPosition;
uniform mat4 uLightSpaceMatrix;

void main() {
  gl_Position = uLightSpaceMatrix * vec4(aPosition, 1.0);
}
`;

// Depth packed into two 8-bit channels (16-bit precision) for WebGL1.
const SHADOW_FS = `
precision mediump float;

void main() {
  float depth = gl_FragCoord.z;
  float hi = floor(depth * 255.0) / 255.0;
  float lo = fract(depth * 255.0);
  gl_FragColor = vec4(hi, lo, 0.0, 1.0);
}
`;

// Studio backdrop: soft vertical gradient with vignette behind the room.
const BACKGROUND_VS = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.999, 1.0);
}
`;

const BACKGROUND_FS = `
precision mediump float;
uniform vec2 uResolution;
uniform int uLightingMode;
void main() {
  vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  vec3 top = uLightingMode == 1 ? vec3(0.86, 0.90, 0.95) : uLightingMode == 3 ? vec3(0.18, 0.20, 0.25) : uLightingMode == 2 ? vec3(0.91, 0.92, 0.94) : vec3(0.88, 0.88, 0.87);
  vec3 bottom = uLightingMode == 1 ? vec3(0.72, 0.75, 0.79) : uLightingMode == 3 ? vec3(0.09, 0.10, 0.13) : uLightingMode == 2 ? vec3(0.74, 0.76, 0.79) : vec3(0.69, 0.67, 0.64);
  vec3 c = mix(bottom, top, smoothstep(0.0, 1.0, uv.y));
  float d = length((uv - 0.5) * vec2(1.12, 1.0)) * 1.32;
  c *= clamp(1.0 - 0.30 * pow(d, 2.6), 0.0, 1.0);
  gl_FragColor = vec4(c, 1.0);
}
`;

// Thin darkened outlines on furniture panel edges for crisp joinery reading.
const EDGE_VS = `
attribute vec3 aPosition;
attribute vec4 aColor;
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition, 1.0);
}
`;

const EDGE_FS = `
precision mediump float;
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
}
`;

export function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

export function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${info}`);
  }
  return prog;
}

export class RoomWebGLRenderer {
  constructor(canvas, { onSelect = () => {}, onChange = () => {} } = {}) {
    this.canvas = canvas;
    this._defaultOnSelect = onSelect;
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.project = null;
    this.selectedCabinetId = null;
    this.doorsOpen = false;
    this.openProgress = 0;
    this._doorAnimRaf = null;
    this.rayTracing = true;
    this.wallMode = 'cutaway'; // 'cutaway' | 'all'
    this.lightingMode = 'evening'; // 'day' | 'evening' | 'studio' | 'night-led'
    this.floorStyle = 'oak'; // 'oak' | 'ash' | 'walnut' | 'tile' | 'concrete'
    this.cameraPreset = 'corner-1';
    this.quality = 'high';
    this.showCeiling = true;

    // Camera parameters
    this.target = [2000, 1000, 1500];
    this.yaw = Math.PI * 0.28;
    this.pitch = 0.32;
    this.distance = 3800;

    // Room light from ceiling center (balanced warm lighting)
    this.lightPos = [2000, 2600, 1500];
    this.lightColor = [0.82, 0.80, 0.75];

    this.drag = null;
    this.casterVertexCount = 0;
    this.opaqueOffset = 0;
    this.opaqueVertexCount = 0;
    this.transparentOffset = 0;
    this.transparentVertexCount = 0;
    this.textureCache = new Map();
    this.opaqueBatches = [];

    // Decoupled VBO caching for cutaway orbit optimization
    this.wallBuffer = null;
    this.furnitureBuffer = null;
    this._cachedFurnitureFloats = null;
    this._cachedFurnitureKey = null;
    this._lastCulledWallsKey = null;
    this._lastWallMode = this.wallMode;

    // 3D Interactive Measurement Tape State
    this.measureState = {
      active: false,
      start: null,
      end: null,
      distance: 0,
      distanceHorizontal: 0,
    };

    this.initGL();
    this.attachEvents();
  }

  initGL() {
    try {
      this.gl = this.canvas ? (this.canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }) ||
                this.canvas.getContext('experimental-webgl', { antialias: true, preserveDrawingBuffer: true })) : null;
    } catch {
      this.gl = null;
    }
    if (!this.gl) return;

    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    try {
      this.mainProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
      this.mainAttribs = {
        position: gl.getAttribLocation(this.mainProgram, 'aPosition'),
        normal: gl.getAttribLocation(this.mainProgram, 'aNormal'),
        color: gl.getAttribLocation(this.mainProgram, 'aColor'),
        material: gl.getAttribLocation(this.mainProgram, 'aMaterial'),
      };
      this.mainUniforms = {
        projection: gl.getUniformLocation(this.mainProgram, 'uProjectionMatrix'),
        view: gl.getUniformLocation(this.mainProgram, 'uViewMatrix'),
        lightSpace: gl.getUniformLocation(this.mainProgram, 'uLightSpaceMatrix'),
        lightPos: gl.getUniformLocation(this.mainProgram, 'uLightPos'),
        lightColor: gl.getUniformLocation(this.mainProgram, 'uLightColor'),
        cameraPos: gl.getUniformLocation(this.mainProgram, 'uCameraPos'),
        shadowMap: gl.getUniformLocation(this.mainProgram, 'uShadowMap'),
        useShadows: gl.getUniformLocation(this.mainProgram, 'uUseShadows'),
        lightingMode: gl.getUniformLocation(this.mainProgram, 'uLightingMode'),
        floorStyle: gl.getUniformLocation(this.mainProgram, 'uFloorStyle'),
        resolution: gl.getUniformLocation(this.mainProgram, 'uResolution'),
        roomHeight: gl.getUniformLocation(this.mainProgram, 'uRoomHeight'),
        shadowTexel: gl.getUniformLocation(this.mainProgram, 'uShadowTexel'),
        materialTexture: gl.getUniformLocation(this.mainProgram, 'uMaterialTexture'),
        hasTexture: gl.getUniformLocation(this.mainProgram, 'uHasTexture'),
        sunShadowMap: gl.getUniformLocation(this.mainProgram, 'uSunShadowMap'),
        sunLightSpace: gl.getUniformLocation(this.mainProgram, 'uSunLightSpace'),
        sunDir: gl.getUniformLocation(this.mainProgram, 'uSunDir'),
        sunShadowTexel: gl.getUniformLocation(this.mainProgram, 'uSunShadowTexel'),
        useSunShadows: gl.getUniformLocation(this.mainProgram, 'uUseSunShadows'),
        roughnessOverride: gl.getUniformLocation(this.mainProgram, 'uRoughnessOverride'),
        overheadSamples: gl.getUniformLocation(this.mainProgram, 'uOverheadSamples'),
        sunSamples: gl.getUniformLocation(this.mainProgram, 'uSunSamples'),
        rayTracing: gl.getUniformLocation(this.mainProgram, 'uRayTracing'),
        roomMin: gl.getUniformLocation(this.mainProgram, 'uRoomMin'),
        roomMax: gl.getUniformLocation(this.mainProgram, 'uRoomMax'),
        extraLightCount: gl.getUniformLocation(this.mainProgram, 'uExtraLightCount'),
        extraLightPos: gl.getUniformLocation(this.mainProgram, 'uExtraLightPos'),
        extraLightColor: gl.getUniformLocation(this.mainProgram, 'uExtraLightColor'),
      };
      this.anisotropy = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') || null;
      this.maxAnisotropy = this.anisotropy ? Math.min(8, gl.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1) : 1;

      this.shadowProgram = createProgram(gl, SHADOW_VS, SHADOW_FS);
      this.shadowAttribs = {
        position: gl.getAttribLocation(this.shadowProgram, 'aPosition'),
      };
      this.shadowUniforms = {
        lightSpace: gl.getUniformLocation(this.shadowProgram, 'uLightSpaceMatrix'),
      };

      this.bgProgram = createProgram(gl, BACKGROUND_VS, BACKGROUND_FS);
      this.bgAttribs = { pos: gl.getAttribLocation(this.bgProgram, 'aPos') };
      this.bgUniforms = {
        resolution: gl.getUniformLocation(this.bgProgram, 'uResolution'),
        lightingMode: gl.getUniformLocation(this.bgProgram, 'uLightingMode'),
      };
      this.bgVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bgVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      this.edgeProgram = createProgram(gl, EDGE_VS, EDGE_FS);
      this.edgeAttribs = {
        position: gl.getAttribLocation(this.edgeProgram, 'aPosition'),
        color: gl.getAttribLocation(this.edgeProgram, 'aColor'),
      };
      this.edgeUniforms = {
        projection: gl.getUniformLocation(this.edgeProgram, 'uProjectionMatrix'),
        view: gl.getUniformLocation(this.edgeProgram, 'uViewMatrix'),
      };
      this.edgeVbo = gl.createBuffer();
      this.edgeVertexCount = 0;

      this.initShadowFBO();
      this.vbo = gl.createBuffer();
      this.wallBuffer = gl.createBuffer();
      this.furnitureBuffer = gl.createBuffer();

      this.textureCache = new Map();
      this.defaultTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.defaultTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([240, 240, 240, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } catch (e) {
      console.warn('WebGL initialization failed, falling back:', e);
      this.gl = null;
    }
  }

  loadTexture(url) {
    if (!this.gl || !url) return null;
    if (this.textureCache.has(url)) return this.textureCache.get(url);
    const gl = this.gl;
    const tex = gl.createTexture();
    tex.loaded = false;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([235, 235, 235, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.textureCache.set(url, tex);

    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!this.gl) return;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        let source = img;
        if (typeof document !== 'undefined' && document.createElement) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 1024, 1024);
            source = canvas;
          } catch {}
        }
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          if (this.anisotropy) gl.texParameterf(gl.TEXTURE_2D, this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAnisotropy);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        } catch {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        tex.loaded = true;
        this.render();
      };
      img.onerror = () => {
        if (!img._retried && url.startsWith('/textures/yildiz/') && !url.startsWith('http')) {
          img._retried = true;
          const code = url.replace('/textures/yildiz/', '').replace('.jpg', '');
          const cdnUrl = `https://app.yildiz.com/Bundles/onizleme/${code}.jpg`;
          if (cdnUrl !== url) {
            img.src = cdnUrl;
          }
        }
      };
      img.src = url;
    }
    return tex;
  }


  createDepthTarget(size) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // Packed depth must not be interpolated between texels.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { texture, rb, fbo };
  }

  getQualitySettings() {
    return RENDER_QUALITY[this.quality] || RENDER_QUALITY.high;
  }

  initShadowFBO() {
    const q = this.getQualitySettings();
    let size = q.shadowSize;
    const maxSize = this.gl.getParameter?.(this.gl.MAX_TEXTURE_SIZE);
    if (Number.isFinite(maxSize) && maxSize > 0) size = Math.min(size, maxSize);
    this.shadowSize = size;
    const overhead = this.createDepthTarget(this.shadowSize);
    this.shadowTexture = overhead.texture;
    this.shadowDepthRB = overhead.rb;
    this.shadowFBO = overhead.fbo;
    this.sunShadowSize = size;
    const sun = this.createDepthTarget(this.sunShadowSize);
    this.sunShadowTexture = sun.texture;
    this.sunShadowDepthRB = sun.rb;
    this.sunShadowFBO = sun.fbo;
  }

  releaseShadowFBO() {
    const gl = this.gl;
    if (!gl) return;
    for (const k of ['shadowFBO', 'sunShadowFBO']) if (this[k]) gl.deleteFramebuffer(this[k]);
    for (const k of ['shadowTexture', 'sunShadowTexture']) if (this[k]) gl.deleteTexture(this[k]);
    for (const k of ['shadowDepthRB', 'sunShadowDepthRB']) if (this[k]) gl.deleteRenderbuffer(this[k]);
    this.shadowFBO = this.sunShadowFBO = this.shadowTexture = this.sunShadowTexture = this.shadowDepthRB = this.sunShadowDepthRB = null;
  }

  /** 'low' | 'medium' | 'high' | 'ultra' */
  setQuality(name) {
    if (!RENDER_QUALITY[name]) return this.quality;
    const prevSize = this.getQualitySettings().shadowSize;
    this.quality = name;
    if (this.gl && this.getQualitySettings().shadowSize !== prevSize) {
      this.releaseShadowFBO();
      this.initShadowFBO();
    }
    this.resize();
    return this.quality;
  }

  /** 'oak' | 'ash' | 'walnut' | 'tile' | 'concrete' */
  setFloorStyle(style) {
    if (!FLOOR_STYLES[style]) return this.floorStyle;
    this.floorStyle = style;
    this.render();
    return this.floorStyle;
  }

  setMeasureTool(active = true) {
    this.measureState.active = Boolean(active);
    if (!active) {
      this.clearMeasure();
    }
    return this.measureState;
  }

  setMeasureState(p1, p2) {
    const metrics = get3DMeasurementMetrics(p1, p2);
    this.measureState = {
      active: true,
      start: p1,
      end: p2,
      distance: metrics.distance,
      distanceHorizontal: metrics.distanceHorizontal,
    };
    this.render();
    return this.measureState;
  }

  clearMeasure() {
    this.measureState = {
      active: this.measureState.active,
      start: null,
      end: null,
      distance: 0,
      distanceHorizontal: 0,
    };
    this.render();
    return this.measureState;
  }

  setSelectedCabinet(cabinetId) {
    const next = cabinetId || null;
    if (this.selectedCabinetId === next) return this.selectedCabinetId;
    this.selectedCabinetId = next;
    this.buildGeometry();
    this.render();
    return this.selectedCabinetId;
  }

  focusOnCabinet(cabinetId = this.selectedCabinetId) {
    if (!this.project?.cabinets?.length) return false;
    const cab = this.project.cabinets.find(c => c.id === cabinetId) || this.project.cabinets[0];
    if (!cab) return false;

    const w = Number(cab.width) || 600;
    const h = Number(cab.height) || 800;
    const d = Number(cab.depth) || 560;
    const angle = ((Number(cab.rotation) || 0) * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Local center of the cabinet rotated into world space
    const locX = w / 2;
    const locZ = d / 2;
    const cx = (Number(cab.x) || 0) + locX * cosA - locZ * sinA;
    const cy = (Number(cab.y) || 0) + h * 0.5;
    const cz = (Number(cab.z) || 0) + locX * sinA + locZ * cosA;

    this.target = [cx, cy, cz];
    // Position camera slightly angled in front of the cabinet's front face (+Z in cabinet local coords)
    this.yaw = -angle + 0.25;
    this.pitch = 0.22;
    this.distance = Math.max(950, Math.max(w, h, d) * 1.65);
    this.selectedCabinetId = cab.id;
    this.buildGeometry();
    this.render();
    return true;
  }

  setShowCeiling(value) {
    this.showCeiling = value === undefined ? !this.showCeiling : Boolean(value);
    this.buildGeometry({ force: true });
    this.render();
    return this.showCeiling;
  }

  /** Daylight sun from azimuth (0° = +Z, 90° = +X, clockwise on plan) and elevation above the horizon. */
  getSunDirection() {
    if (this.lightingMode !== 'day') {
      const d = [0.35, 0.85, 0.4], l = Math.hypot(...d);
      return d.map(v => v / l);
    }
    const az = (Number.isFinite(this.sunAzimuth) ? this.sunAzimuth : 127) * Math.PI / 180;
    const el = Math.max(5, Math.min(85, Number.isFinite(this.sunElevation) ? this.sunElevation : 50)) * Math.PI / 180;
    return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  }

  setSunAngles({ azimuth, elevation } = {}) {
    if (Number.isFinite(azimuth)) this.sunAzimuth = ((azimuth % 360) + 360) % 360;
    if (Number.isFinite(elevation)) this.sunElevation = Math.max(5, Math.min(85, elevation));
    this.render();
    return { azimuth: this.sunAzimuth, elevation: this.sunElevation };
  }

  setWallShadows(value) {
    this.wallShadows = value === undefined ? this.wallShadows === false : Boolean(value);
    this.render();
    return this.wallShadows;
  }

  computeSunLightSpaceMatrix() {
    const b = this.roomBounds || { minX: 0, maxX: 4000, minZ: 0, maxZ: 3000, height: 2700 };
    const H = b.height || 2700;
    const center = [(b.minX + b.maxX) / 2, H / 2, (b.minZ + b.maxZ) / 2];
    const radius = Math.hypot(b.maxX - b.minX, H, b.maxZ - b.minZ) / 2 + 300;
    const dir = this.getSunDirection();
    const eye = center.map((c, i) => c + dir[i] * radius * 2);
    const view = new Float32Array(16), proj = new Float32Array(16), out = new Float32Array(16);
    mat4LookAt(view, eye, center, [0, 1, 0]);
    mat4Ortho(proj, -radius, radius, -radius, radius, radius * 0.5, radius * 3.5);
    mat4Multiply(out, proj, view);
    return out;
  }

  /** High-gloss (HG_) fronts mirror the room, matt (MAT_) panels stay diffuse. */
  roughnessForTexture(url) {
    if (!url) return -1;
    const code = String(url).split('/').pop().toUpperCase();
    if (code.startsWith('HG_')) return 0.12;
    if (code.startsWith('MAT_')) return 0.72;
    return -1;
  }

  setProject(project, selectedCabinetId = this.selectedCabinetId) {
    this.project = project;
    if (selectedCabinetId !== undefined) this.selectedCabinetId = selectedCabinetId;
    this.updateRoomLighting();
    this.buildGeometry({ force: true });
    this.render();
  }

  getCameraEye() {
    return [
      this.target[0] + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw),
      this.target[1] + this.distance * Math.sin(this.pitch),
      this.target[2] + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw),
    ];
  }

  isPointInsideRoom(x, z) {
    if (!this.project?.room) return false;
    const outline = this.project.room.outline || [];
    if (outline.length < 3) return false;
    return pointInPolygon({ x, z }, outline);
  }

  updateRoomLighting() {
    if (!this.project?.room) return;
    const room = this.project.room;
    const outline = room.outline || [{ x: 0, z: 0 }, { x: room.width || 4000, z: 0 }, { x: room.width || 4000, z: room.depth || 3000 }, { x: 0, z: room.depth || 3000 }];
    const minX = Math.min(...outline.map(p => p.x));
    const maxX = Math.max(...outline.map(p => p.x));
    const minZ = Math.min(...outline.map(p => p.z));
    const maxZ = Math.max(...outline.map(p => p.z));

    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const cy = Math.max(1200, (room.height || 2700) - 50);

    this.roomCenter = [cx, (room.height || 2700) * 0.45, cz];
    this.roomBounds = { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ, height: room.height || 2700 };
    this.lightPos = [cx, cy, cz];
  }

  resetCamera() {
    if (!this.roomCenter) this.updateRoomLighting();
    const b = this.roomBounds || { width: 4000, depth: 3000, height: 2700 };
    this.target = [...(this.roomCenter || [2000, 1000, 1500])];
    this.yaw = Math.PI * 0.28;
    this.pitch = 0.32;
    this.distance = Math.max(b.width, b.depth) * 0.95;
    this.cameraPreset = 'corner-1';
    this.buildGeometry();
    this.render();
  }

  setCameraPreset(name) {
    if (!this.roomCenter) this.updateRoomLighting();
    const bounds = this.roomBounds || {
      width: 4000, depth: 3000, height: 2700,
      minX: 0, maxX: 4000, minZ: 0, maxZ: 3000
    };
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const cy = (bounds.height || 2700) * 0.45;

    switch (name) {
      case 'top': {
        this.target = [cx, cy, cz];
        this.yaw = 0;
        this.pitch = Math.PI * 0.47;
        this.distance = Math.max(bounds.width, bounds.depth) * 1.05;
        break;
      }
      case 'door': {
        const room = this.project?.room;
        const outline = room?.outline || [
          { x: bounds.minX, z: bounds.minZ },
          { x: bounds.maxX, z: bounds.minZ },
          { x: bounds.maxX, z: bounds.maxZ },
          { x: bounds.minX, z: bounds.maxZ }
        ];
        const wallLookup = { back: 0, right: 1, front: 2, left: 3 };
        const door = (room?.windows || []).find(w => w.kind === 'door');

        let eyeX = cx;
        let eyeY = 1500;
        let eyeZ = bounds.maxZ;

        if (door) {
          const wallIdx = door.wallIndex !== undefined ? Number(door.wallIndex) : wallLookup[door.wall];
          const safeIdx = (wallIdx >= 0 && wallIdx < outline.length) ? wallIdx : 0;
          const a = outline[safeIdx];
          const b = outline[(safeIdx + 1) % outline.length];
          const wallLen = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const ux = (b.x - a.x) / wallLen;
          const uz = (b.z - a.z) / wallLen;
          const offset = Math.max(0, Math.min(wallLen, (Number(door.offset) || 0) + (Number(door.width) || 800) / 2));
          const doorX = a.x + ux * offset;
          const doorZ = a.z + uz * offset;

          const toCx = cx - doorX;
          const toCz = cz - doorZ;
          const toLen = Math.hypot(toCx, toCz) || 1;
          eyeX = doorX + (toCx / toLen) * 200;
          eyeZ = doorZ + (toCz / toLen) * 200;
          eyeY = 1500;
        }

        const targetX = cx;
        const targetY = 1400;
        const targetZ = cz;
        this.target = [targetX, targetY, targetZ];

        const dx = eyeX - targetX;
        const dy = eyeY - targetY;
        const dz = eyeZ - targetZ;
        this.distance = Math.hypot(dx, dy, dz);
        this.pitch = Math.asin(Math.max(-1, Math.min(1, dy / (this.distance || 1))));
        this.yaw = Math.atan2(dx, dz);
        break;
      }
      case 'corner-1': {
        this.target = [cx, cy, cz];
        this.yaw = Math.PI * 0.28;
        this.pitch = 0.28;
        this.distance = Math.max(bounds.width, bounds.depth) * 0.95;
        break;
      }
      case 'corner-2': {
        this.target = [cx, cy, cz];
        this.yaw = -Math.PI * 0.28;
        this.pitch = 0.28;
        this.distance = Math.max(bounds.width, bounds.depth) * 0.95;
        break;
      }
      case 'front': {
        this.target = [cx, cy, cz];
        this.yaw = 0;
        this.pitch = 0.18;
        this.distance = Math.max(bounds.width, bounds.depth) * 1.0;
        break;
      }
      default: {
        this.target = [cx, cy, cz];
        this.yaw = Math.PI * 0.28;
        this.pitch = 0.28;
        this.distance = Math.max(bounds.width, bounds.depth) * 0.95;
        break;
      }
    }

    this.cameraPreset = name;
    this.buildGeometry();
    this.render();
    return this.cameraPreset;
  }

  setLightingMode(mode) {
    if (mode === 'day' || mode === 'evening' || mode === 'studio' || mode === 'night-led') {
      this.lightingMode = mode;
    } else {
      this.lightingMode = this.lightingMode === 'day' ? 'evening' : 'day';
    }
    if (this.lightingMode === 'day') {
      this.lightColor = [0.35, 0.35, 0.35];
    } else if (this.lightingMode === 'studio') {
      this.lightColor = [0.92, 0.90, 0.88];
    } else if (this.lightingMode === 'night-led') {
      this.lightColor = [0.28, 0.25, 0.22];
    } else {
      this.lightColor = [0.82, 0.80, 0.75];
    }
    this.buildGeometry();
    this.render();
    return this.lightingMode;
  }

  setRayTracing(value) {
    this.rayTracing = value === undefined ? !this.rayTracing : Boolean(value);
    this.render();
    return this.rayTracing;
  }

  toggleRayTracing() {
    return this.setRayTracing(!this.rayTracing);
  }

  setOpenProgress(progress) {
    const p = Math.max(0, Math.min(1, Number.isFinite(Number(progress)) ? Number(progress) : 0));
    this.openProgress = p;
    this.doorsOpen = p > 0.005;
    this.buildGeometry({ force: true });
    this.render();
    return this.openProgress;
  }

  animateDoors(targetOpen = !this.doorsOpen, durationMs = 400, onTick = null) {
    const target = targetOpen ? 1 : 0;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function' || durationMs <= 0) {
      this.setOpenProgress(target);
      onTick?.(this.openProgress);
      return this.doorsOpen;
    }
    if (this._doorAnimRaf) {
      window.cancelAnimationFrame?.(this._doorAnimRaf);
      this._doorAnimRaf = null;
    }
    const startVal = Number.isFinite(this.openProgress) ? this.openProgress : (this.doorsOpen ? 1 : 0);
    if (Math.abs(target - startVal) < 0.01) {
      this.setOpenProgress(target);
      onTick?.(this.openProgress);
      return this.doorsOpen;
    }
    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const step = (now) => {
      const curr = Number.isFinite(now) ? now : Date.now();
      const t = Math.max(0, Math.min(1, (curr - startTime) / durationMs));
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const val = startVal + (target - startVal) * eased;
      this.openProgress = val;
      this.doorsOpen = val > 0.005;
      this.buildGeometry({ force: true });
      this.render();
      onTick?.(this.openProgress);
      if (t < 1) {
        this._doorAnimRaf = window.requestAnimationFrame(step);
      } else {
        this._doorAnimRaf = null;
      }
    };
    this._doorAnimRaf = window.requestAnimationFrame(step);
    return Boolean(targetOpen);
  }

  toggleWallMode() {
    this.wallMode = this.wallMode === 'cutaway' ? 'all' : 'cutaway';
    this.buildGeometry();
    this.render();
    return this.wallMode;
  }

  buildGeometry(options = {}) {
    if (!this.project) return;

    const eye = this.getCameraEye();
    const isInside = this.isPointInsideRoom(eye[0], eye[2]) && eye[1] < (this.project.room?.height || 2700);
    const useCutaway = (this.wallMode === 'cutaway') && !isInside;

    let dir = null;
    let culledWallsKey = '';
    const room = this.project.room || {};
    const outline = room.outline && room.outline.length >= 3 ? room.outline : [{ x: 0, z: 0 }, { x: room.width || 4000, z: 0 }, { x: room.width || 4000, z: room.depth || 3000 }, { x: 0, z: room.depth || 3000 }];
    const signedArea = outline.reduce((s, p, i) => { const q = outline[(i + 1) % outline.length]; return s + p.x * q.z - q.x * p.z; }, 0) / 2;
    const orient = signedArea >= 0 ? 1 : -1;

    if (useCutaway) {
      const dx = eye[0] - this.target[0];
      const dz = eye[2] - this.target[2];
      const dLen = Math.hypot(dx, dz) || 1;
      dir = [dx / dLen, 0.45, dz / dLen];
      culledWallsKey = outline.map((a, i) => {
        const b = outline[(i + 1) % outline.length];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (!len) return '0';
        const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
        const inward = [-uz * orient, 0, ux * orient];
        return (inward[0] * dir[0] + inward[2] * dir[2] < -0.00001) ? '1' : '0';
      }).join('');
    } else {
      culledWallsKey = 'all';
    }
    const lightsSig = (room.lights || []).map(l => `${l.id}:${l.kind}:${l.x}:${l.y}:${l.z}:${l.intensity}:${l.color || ''}:${l.enabled !== false}`).join(',');
    culledWallsKey += `:ceil=${this.showCeiling && eye[1] < (room.height || 2700) - 20 ? 1 : 0}:wc=${room.wallColor || ''}:cc=${room.ceilingColor || ''}:rh=${room.height || 2700}:lights=${lightsSig}`;

    const hwSig = (this.project.cabinets || []).map(c => `${c.id}:${c.width}:${c.height}:${c.depth}:${c.x}:${c.y}:${c.z}:${c.rotation || 0}:${c.materialId || ''}:${c.frontMaterialId || ''}:${c.countertopMaterialId || ''}:${c.sink || ''}:${c.cooktop || ''}:${c.handleStyle || ''}:${c.handleFinish || ''}:${c.hingeStyle || ''}:${c.drawerRailingStyle || ''}:${c.rodStyle || ''}`).join('|');
    const matSig = (this.project.materials || []).map(m => `${m.id}:${m.color || ''}:${m.textureUrl || ''}:${m.previewUrl || ''}`).join('|');
    const effOpenProgress = Number.isFinite(this.openProgress) && (this.openProgress > 0 || !this.doorsOpen) ? this.openProgress : (this.doorsOpen ? 1 : 0);
    const currentFurnitureKey = `${this.project.name || ''}:${this.project.cabinets?.length || 0}:${this.doorsOpen}:${effOpenProgress.toFixed(3)}:${this.selectedCabinetId}:${this.floorStyle}:${this.lightingMode}:${hwSig}:${matSig}`;

    // Fast-path: When orbiting within the same cutaway quadrant with unchanged walls and unchanged furniture, skip rebuild completely
    if (!options?.force && this._cachedFurnitureFloats && this._cachedFurnitureKey === currentFurnitureKey && this._lastCulledWallsKey === culledWallsKey && this._lastWallMode === this.wallMode) {
      return;
    }

    const FLOATS = 11; // pos(3) normal(3) color(4) material(1)

    const pushPoly = (targetArray, points, normal, colorRGBA, materialId = MATERIAL.furniture) => {
      if (points.length < 3) return;
      const pushV = p => {
        targetArray.push(p[0], p[1], p[2], normal[0], normal[1], normal[2], colorRGBA[0], colorRGBA[1], colorRGBA[2], colorRGBA[3], materialId);
      };
      if (points.length > 4) {
        for (const [a, b, c] of triangulateFace(points)) { pushV(points[a]); pushV(points[b]); pushV(points[c]); }
        return;
      }
      for (let i = 1; i < points.length - 1; i++) {
        pushV(points[0]); pushV(points[i]); pushV(points[i + 1]);
      }
    };

    const pushGlowingCabinetContour = (edgeFloats, cab) => {
      if (!cab) return;
      const cx = Number(cab.x) || 0;
      const cy = Number(cab.y) || 0;
      const cz = Number(cab.z) || 0;
      const w = Number(cab.width) || 600;
      const h = Number(cab.height) || 800;
      const frontMat = (this.project?.materials || []).find(m => m.id === (cab.frontMaterialId || cab.materialId));
      const frontT = Math.max(3, Number(frontMat?.thickness || cab.frontThickness || 18));
      const d = (Number(cab.depth) || 400) + frontT;
      const angle = ((Number(cab.rotation) || 0) * Math.PI) / 180;
      const co = Math.cos(angle), si = Math.sin(angle);
      const rotPt = (lx, ly, lz) => [
        cx + lx * co - lz * si,
        cy + ly,
        cz + lx * si + lz * co,
      ];
      const boxEdges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];
      // Multi-pass glowing neon contour (core + inner glow + soft halo)
      const glowPasses = [
        { pad: 6.0, col: [0.06, 0.80, 0.74, 0.24] },
        { pad: 3.8, col: [0.10, 0.90, 0.82, 0.55] },
        { pad: 2.0, col: [0.22, 1.00, 0.92, 0.98] },
      ];
      for (const { pad, col } of glowPasses) {
        const pts = [
          rotPt(-pad, -pad, -pad),
          rotPt(w + pad, -pad, -pad),
          rotPt(w + pad, h + pad, -pad),
          rotPt(-pad, h + pad, -pad),
          rotPt(-pad, -pad, d + pad),
          rotPt(w + pad, -pad, d + pad),
          rotPt(w + pad, h + pad, d + pad),
          rotPt(-pad, h + pad, d + pad),
        ];
        for (const [ia, ib] of boxEdges) {
          const a = pts[ia], b = pts[ib];
          edgeFloats.push(a[0], a[1], a[2], ...col, b[0], b[1], b[2], ...col);
        }
      }
    };

    const isWallFace = f => Boolean(f.room && !f.floor && !(f.obstacle && (f.freestanding || f.component === 'obstacle' && f.element?.freestanding)));

    // 1. Build or reuse cached static furniture & floor geometry
    let furnitureCasters = [];
    let furnitureOpaqueGroups = new Map();
    let furnitureTransparent = [];
    let furnitureEdges = [];

    const getFurnOpaque = url => {
      const k = url || '';
      if (!furnitureOpaqueGroups.has(k)) furnitureOpaqueGroups.set(k, []);
      return furnitureOpaqueGroups.get(k);
    };

    if (!options?.force && this._cachedFurnitureFloats && this._cachedFurnitureKey === currentFurnitureKey) {
      furnitureCasters = this._cachedFurnitureFloats.casterFloats;
      furnitureOpaqueGroups = this._cachedFurnitureFloats.opaqueGroups;
      furnitureTransparent = this._cachedFurnitureFloats.transparentFloats;
      furnitureEdges = this._cachedFurnitureFloats.edgeFloats;
    } else {
      const furnScene = makeScene(this.project, { room: true, allFaces: true, doorsOpen: this.doorsOpen, openProgress: effOpenProgress, internalDrawersOpen: this.doorsOpen || effOpenProgress > 0.01 }, null);
      for (const f of (furnScene.faces || [])) {
        if (!f.points || f.points.length < 3) continue;
        if (isWallFace(f)) continue;

        let norm = f.normal;
        if (!norm || norm.length < 3) {
          const p0 = f.points[0], p1 = f.points[1], p2 = f.points[2];
          const v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
          const v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
          const nx = v1[1] * v2[2] - v1[2] * v2[1];
          const ny = v1[2] * v2[0] - v1[0] * v2[2];
          const nz = v1[0] * v2[1] - v1[1] * v2[0];
          const len = Math.hypot(nx, ny, nz) || 1;
          norm = [nx / len, ny / len, nz / len];
        }

        let rgb = hexToRgb(f.rawColor || f.color);
        const isTransparent = f.doorLeaf || (f.opacity !== undefined && f.opacity < 0.9);
        const alpha = isTransparent ? (f.opacity ?? 0.85) : 1.0;
        const materialId = classifyFaceMaterial(f);
        const rgba = [rgb[0], rgb[1], rgb[2], alpha];

        const isFurnitureCaster = (!f.room || f.obstacle) && !isTransparent;
        if (isFurnitureCaster) {
          pushPoly(furnitureCasters, f.points, norm, rgba, materialId);
        }

        if (isTransparent) {
          pushPoly(furnitureTransparent, f.points, norm, rgba, materialId);
        } else {
          const texUrl = (materialId === MATERIAL.furniture) ? (resolveFaceTexture(f, this.project) || '') : '';
          pushPoly(getFurnOpaque(texUrl), f.points, norm, rgba, materialId);
        }
      }

      if (this.selectedCabinetId) {
        const selCab = (this.project?.cabinets || []).find(c => c.id === this.selectedCabinetId);
        if (selCab) pushGlowingCabinetContour(furnitureEdges, selCab);
      }

      this._cachedFurnitureFloats = {
        casterFloats: furnitureCasters,
        opaqueGroups: furnitureOpaqueGroups,
        transparentFloats: furnitureTransparent,
        edgeFloats: furnitureEdges,
      };
      this._cachedFurnitureKey = currentFurnitureKey;

      if (this.furnitureBuffer && this.gl) {
        const furnTotal = new Float32Array(furnitureCasters.length + furnitureTransparent.length);
        furnTotal.set(furnitureCasters, 0);
        furnTotal.set(furnitureTransparent, furnitureCasters.length);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.furnitureBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, furnTotal, this.gl.STATIC_DRAW);
      }
    }

    // 2. Build dynamic wall geometry for current camera cutaway
    let scene;
    if (useCutaway) {
      scene = makeScene(this.project, { room: true, allFaces: false, doorsOpen: this.doorsOpen, openProgress: effOpenProgress }, dir);
    } else {
      scene = makeScene(this.project, { room: true, allFaces: true, doorsOpen: this.doorsOpen, openProgress: effOpenProgress }, null);
    }

    const wallFaces = (scene.faces || []).filter(isWallFace);
    const wallRgb = /^#[0-9a-f]{6}$/i.test(room.wallColor || '') ? hexToRgb(room.wallColor) : null;
    const wallCasterFloats = [];
    const wallOpaqueGroups = new Map();
    const getWallOpaque = url => {
      const k = url || '';
      if (!wallOpaqueGroups.has(k)) wallOpaqueGroups.set(k, []);
      return wallOpaqueGroups.get(k);
    };
    const wallTransparentFloats = [];
    const visibleWallIndices = new Set();

    for (const f of wallFaces) {
      if (!f.points || f.points.length < 3) continue;

      let norm = f.normal;
      if (!norm || norm.length < 3) {
        const p0 = f.points[0], p1 = f.points[1], p2 = f.points[2];
        const v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const nx = v1[1] * v2[2] - v1[2] * v2[1];
        const ny = v1[2] * v2[0] - v1[0] * v2[2];
        const nz = v1[0] * v2[1] - v1[1] * v2[0];
        const len = Math.hypot(nx, ny, nz) || 1;
        norm = [nx / len, ny / len, nz / len];
      }

      if (f.room && Number.isInteger(f.wallIndex) && !f.window && !f.door) {
        visibleWallIndices.add(f.wallIndex);
      }

      if (f.window && f.points.length === 4) {
        const [p0, p1, , p3] = f.points;
        const wLen = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
        const hLen = Math.abs(p3[1] - p0[1]);
        if (wLen > 50 && hLen > 50) {
          const ux = (p1[0] - p0[0]) / wLen, uz = (p1[2] - p0[2]) / wLen;
          const fw = Math.min(45, wLen * 0.08);
          const frameColor = [0.93, 0.93, 0.92, 1.0];
          const sillColor = [0.90, 0.89, 0.86, 1.0];
          const glassColor = [0.70, 0.82, 0.92, 0.22];

          const sillExt = 40;
          const s0 = [p0[0] - ux * 25 + norm[0] * sillExt, p0[1], p0[2] - uz * 25 + norm[2] * sillExt];
          const s1 = [p1[0] + ux * 25 + norm[0] * sillExt, p1[1], p1[2] + uz * 25 + norm[2] * sillExt];
          pushPoly(getWallOpaque(''), [s0, s1, [s1[0], s1[1] - 22, s1[2]], [s0[0], s0[1] - 22, s0[2]]], norm, sillColor);
          pushPoly(getWallOpaque(''), [s0, s1, [p1[0] + ux * 25, p1[1], p1[2] + uz * 25], [p0[0] - ux * 25, p0[1], p0[2] - uz * 25]], [0, 1, 0], sillColor);

          const pt = (u, v, inset = 0) => [p0[0] + ux * u + norm[0] * inset, p0[1] + v, p0[2] + uz * u + norm[2] * inset];
          pushPoly(getWallOpaque(''), [pt(0, 0, 8), pt(wLen, 0, 8), pt(wLen, fw, 8), pt(0, fw, 8)], norm, frameColor);
          pushPoly(getWallOpaque(''), [pt(0, hLen - fw, 8), pt(wLen, hLen - fw, 8), pt(wLen, hLen, 8), pt(0, hLen, 8)], norm, frameColor);
          pushPoly(getWallOpaque(''), [pt(0, fw, 8), pt(fw, fw, 8), pt(fw, hLen - fw, 8), pt(0, hLen - fw, 8)], norm, frameColor);
          pushPoly(getWallOpaque(''), [pt(wLen - fw, fw, 8), pt(wLen, fw, 8), pt(wLen, hLen - fw, 8), pt(wLen - fw, hLen - fw, 8)], norm, frameColor);

          if (wLen > 750) {
            const mw = 30, mx = wLen * 0.5;
            pushPoly(getWallOpaque(''), [pt(mx - mw / 2, fw, 8), pt(mx + mw / 2, fw, 8), pt(mx + mw / 2, hLen - fw, 8), pt(mx - mw / 2, hLen - fw, 8)], norm, frameColor);
          }

          const g0 = pt(fw, fw, -10), g1 = pt(wLen - fw, fw, -10), g2 = pt(wLen - fw, hLen - fw, -10), g3 = pt(fw, hLen - fw, -10);
          pushPoly(wallTransparentFloats, [g0, g1, g2, g3], norm, glassColor, MATERIAL.glass);
        }
        continue;
      }

      if (f.door) continue;

      let rgb = hexToRgb(f.rawColor || f.color);
      const isTransparent = f.doorLeaf || (f.opacity !== undefined && f.opacity < 0.9);
      const alpha = isTransparent ? (f.opacity ?? 0.85) : 1.0;
      const materialId = classifyFaceMaterial(f);
      if (materialId === MATERIAL.wall && wallRgb && !isTransparent) {
        const shade = (rgb[0] + rgb[1] + rgb[2]) / 3 / 0.93;
        rgb = wallRgb.map(v => Math.min(1, v * shade));
      }
      const rgba = [rgb[0], rgb[1], rgb[2], alpha];

      if (materialId === MATERIAL.wall && !isTransparent && !(norm[1] > 0.5 && Math.max(...f.points.map(p => p[1])) < 5)) {
        pushPoly(wallCasterFloats, f.points, norm, rgba, materialId);
      }

      if (isTransparent) {
        pushPoly(wallTransparentFloats, f.points, norm, rgba, materialId);
      } else {
        pushPoly(getWallOpaque(''), f.points, norm, rgba, materialId);
      }
    }

    // Skirting along visible walls
    const wallLookup = { back: 0, right: 1, front: 2, left: 3 };
    const skirtColor = [0.95, 0.94, 0.92, 1.0];
    const skirtH = 65, skirtD = 14;
    for (const wallIdx of visibleWallIndices) {
      if (wallIdx < 0 || wallIdx >= outline.length) continue;
      const a = outline[wallIdx], b = outline[(wallIdx + 1) % outline.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 50) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      const inX = -uz * orient, inZ = ux * orient;
      const doors = (room.windows || []).filter(w => w.kind === 'door' && ((w.wallIndex !== undefined ? Number(w.wallIndex) : wallLookup[w.wall]) === wallIdx)).map(w => ({
        start: Math.max(0, Number(w.offset) || 0),
        end: Math.min(len, (Number(w.offset) || 0) + (Number(w.width) || 800))
      }));
      const cuts = [...new Set([0, len, ...doors.flatMap(d => [d.start, d.end])])].sort((x, y) => x - y);
      for (let i = 0; i < cuts.length - 1; i++) {
        const u0 = cuts[i], u1 = cuts[i + 1];
        if (u1 - u0 < 10) continue;
        const mid = (u0 + u1) / 2;
        if (doors.some(d => mid > d.start && mid < d.end)) continue;
        const p00 = [a.x + ux * u0, 0, a.z + uz * u0];
        const p10 = [a.x + ux * u1, 0, a.z + uz * u1];
        const p01 = [p00[0] + inX * skirtD, 0, p00[2] + inZ * skirtD];
        const p11 = [p10[0] + inX * skirtD, 0, p10[2] + inZ * skirtD];
        pushPoly(getWallOpaque(''), [p01, p11, [p11[0], skirtH, p11[2]], [p01[0], skirtH, p01[2]]], [inX, 0, inZ], skirtColor, MATERIAL.furniture);
        pushPoly(getWallOpaque(''), [[p00[0], skirtH, p00[2]], [p01[0], skirtH, p01[2]], [p11[0], skirtH, p11[2]], [p10[0], skirtH, p10[2]]], [0, 1, 0], skirtColor, MATERIAL.furniture);
      }
    }

    // Ceiling slab
    const roomH = room.height || 2700;
    if (this.showCeiling && eye[1] < roomH - 20) {
      const ceilRgb = /^#[0-9a-f]{6}$/i.test(room.ceilingColor || '') ? hexToRgb(room.ceilingColor) : [0.96, 0.955, 0.94];
      const ceilingPoints = outline.map(p => [p.x, roomH, p.z]);
      pushPoly(getWallOpaque(''), ceilingPoints, [0, -1, 0], [...ceilRgb, 1.0], MATERIAL.wall);
      pushPoly(wallCasterFloats, ceilingPoints, [0, -1, 0], [...ceilRgb, 1.0], MATERIAL.wall);
    }

    // User-placed 3D light fixtures (from 2D room plan)
    const userLights = (room.lights || []).filter(l => l && l.enabled !== false).slice(0, 6);

    // Default center luminaire (only rendered when no user lights are placed)
    if (this.lightPos && userLights.length === 0) {
      const lx = this.lightPos[0], ly = this.lightPos[1], lz = this.lightPos[2];
      const r = 180;
      const count = 32;
      const trimColor = [0.90, 0.90, 0.88, 1.0];
      const glowColor = [1.0, 0.98, 0.94, 1.0];

      for (let i = 0; i < count; i++) {
        const a1 = (i / count) * Math.PI * 2, a2 = ((i + 1) / count) * Math.PI * 2;
        const down = [0, -1, 0];
        const c0 = [lx, ly - 30, lz];
        const p1 = [lx + Math.cos(a1) * (r - 18), ly - 30, lz + Math.sin(a1) * (r - 18)];
        const p2 = [lx + Math.cos(a2) * (r - 18), ly - 30, lz + Math.sin(a2) * (r - 18)];
        pushPoly(getWallOpaque(''), [c0, p1, p2], down, glowColor, MATERIAL.emissive);

        const t1 = [lx + Math.cos(a1) * r, ly - 30, lz + Math.sin(a1) * r];
        const t2 = [lx + Math.cos(a2) * r, ly - 30, lz + Math.sin(a2) * r];
        pushPoly(getWallOpaque(''), [p1, t1, t2, p2], down, trimColor);
        const u1 = [t1[0], ly, t1[2]], u2 = [t2[0], ly, t2[2]];
        const mid = (a1 + a2) / 2;
        pushPoly(getWallOpaque(''), [t1, u1, u2, t2], [Math.cos(mid), 0, Math.sin(mid)], trimColor);
      }
    }

    for (const l of userLights) {
      const kind = l.kind || 'spot';
      const lx = Number(l.x) || 2000;
      const lz = Number(l.z) || 1500;
      const defaultY = kind === 'pendant' ? roomH - 550 : kind === 'sconce' ? 1800 : kind === 'floor' ? 1650 : roomH - 40;
      const ly = Number.isFinite(Number(l.y)) ? Number(l.y) : defaultY;
      const lRgb = /^#[0-9a-f]{6}$/i.test(l.color || '') ? hexToRgb(l.color) : [1.0, 0.94, 0.84];
      const glowRgba = [Math.min(1, lRgb[0] * 1.05), Math.min(1, lRgb[1] * 1.05), Math.min(1, lRgb[2] * 1.05), 1.0];
      const darkMetal = [0.18, 0.19, 0.21, 1.0];
      const brassMetal = [0.76, 0.62, 0.36, 1.0];
      const segs = 20;

      if (kind === 'pendant') {
        const cordTop = roomH;
        const shadeTop = ly + 130;
        const rTop = 38, rBot = 145;
        for (let i = 0; i < segs; i++) {
          const a1 = (i / segs) * Math.PI * 2, a2 = ((i + 1) / segs) * Math.PI * 2;
          const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
          const mid = (a1 + a2) / 2;
          const nOut = [Math.cos(mid), 0.25, Math.sin(mid)];
          const cr = 3.5;
          pushPoly(getWallOpaque(''), [
            [lx + c1 * cr, shadeTop, lz + s1 * cr],
            [lx + c2 * cr, shadeTop, lz + s2 * cr],
            [lx + c2 * cr, cordTop, lz + s2 * cr],
            [lx + c1 * cr, cordTop, lz + s1 * cr],
          ], [Math.cos(mid), 0, Math.sin(mid)], darkMetal, MATERIAL.metal);
          const pT1 = [lx + c1 * rTop, shadeTop, lz + s1 * rTop];
          const pT2 = [lx + c2 * rTop, shadeTop, lz + s2 * rTop];
          const pB1 = [lx + c1 * rBot, ly, lz + s1 * rBot];
          const pB2 = [lx + c2 * rBot, ly, lz + s2 * rBot];
          pushPoly(getWallOpaque(''), [pB1, pB2, pT2, pT1], nOut, darkMetal, MATERIAL.metal);
          pushPoly(getWallOpaque(''), [[lx, ly + 8, lz], pB1, pB2], [0, -1, 0], glowRgba, MATERIAL.emissive);
        }
      } else if (kind === 'floor') {
        const rBase = 145, rStem = 9, rShade = 175, shadeH = 220;
        for (let i = 0; i < segs; i++) {
          const a1 = (i / segs) * Math.PI * 2, a2 = ((i + 1) / segs) * Math.PI * 2;
          const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
          const mid = (a1 + a2) / 2;
          const nSide = [Math.cos(mid), 0, Math.sin(mid)];
          pushPoly(getWallOpaque(''), [[lx, 18, lz], [lx + c2 * rBase, 18, lz + s2 * rBase], [lx + c1 * rBase, 18, lz + s1 * rBase]], [0, 1, 0], darkMetal, MATERIAL.metal);
          pushPoly(getWallOpaque(''), [
            [lx + c1 * rStem, 18, lz + s1 * rStem],
            [lx + c2 * rStem, 18, lz + s2 * rStem],
            [lx + c2 * rStem, ly, lz + s2 * rStem],
            [lx + c1 * rStem, ly, lz + s1 * rStem],
          ], nSide, brassMetal, MATERIAL.metal);
          const sB1 = [lx + c1 * rShade, ly - shadeH * 0.5, lz + s1 * rShade];
          const sB2 = [lx + c2 * rShade, ly - shadeH * 0.5, lz + s2 * rShade];
          const sT1 = [lx + c1 * rShade, ly + shadeH * 0.5, lz + s1 * rShade];
          const sT2 = [lx + c2 * rShade, ly + shadeH * 0.5, lz + s2 * rShade];
          pushPoly(getWallOpaque(''), [sB1, sB2, sT2, sT1], nSide, [0.95, 0.92, 0.86, 1.0], MATERIAL.furniture);
          pushPoly(getWallOpaque(''), [[lx, ly - shadeH * 0.5 + 10, lz], sB1, sB2], [0, -1, 0], glowRgba, MATERIAL.emissive);
          pushPoly(getWallOpaque(''), [[lx, ly + shadeH * 0.5 - 10, lz], sT2, sT1], [0, 1, 0], glowRgba, MATERIAL.emissive);
        }
      } else if (kind === 'sconce') {
        const rSconce = 48, hSconce = 180;
        for (let i = 0; i < segs; i++) {
          const a1 = (i / segs) * Math.PI * 2, a2 = ((i + 1) / segs) * Math.PI * 2;
          const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
          const mid = (a1 + a2) / 2;
          const nSide = [Math.cos(mid), 0, Math.sin(mid)];
          pushPoly(getWallOpaque(''), [
            [lx + c1 * rSconce, ly - hSconce * 0.5, lz + s1 * rSconce],
            [lx + c2 * rSconce, ly - hSconce * 0.5, lz + s2 * rSconce],
            [lx + c2 * rSconce, ly + hSconce * 0.5, lz + s2 * rSconce],
            [lx + c1 * rSconce, ly + hSconce * 0.5, lz + s1 * rSconce],
          ], nSide, glowRgba, MATERIAL.emissive);
        }
      } else {
        const rSpot = 75, spotTop = Math.min(roomH, ly + 35);
        for (let i = 0; i < segs; i++) {
          const a1 = (i / segs) * Math.PI * 2, a2 = ((i + 1) / segs) * Math.PI * 2;
          const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
          const mid = (a1 + a2) / 2;
          const p1 = [lx + c1 * (rSpot - 12), ly, lz + s1 * (rSpot - 12)];
          const p2 = [lx + c2 * (rSpot - 12), ly, lz + s2 * (rSpot - 12)];
          pushPoly(getWallOpaque(''), [[lx, ly, lz], p1, p2], [0, -1, 0], glowRgba, MATERIAL.emissive);
          const t1 = [lx + c1 * rSpot, ly, lz + s1 * rSpot];
          const t2 = [lx + c2 * rSpot, ly, lz + s2 * rSpot];
          const u1 = [t1[0], spotTop, t1[2]], u2 = [t2[0], spotTop, t2[2]];
          pushPoly(getWallOpaque(''), [t1, u1, u2, t2], [Math.cos(mid), 0, Math.sin(mid)], darkMetal, MATERIAL.metal);
        }
      }
    }

    if (this.wallBuffer && this.gl) {
      const wallTotal = new Float32Array(wallCasterFloats.length + wallTransparentFloats.length);
      wallTotal.set(wallCasterFloats, 0);
      wallTotal.set(wallTransparentFloats, wallCasterFloats.length);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.wallBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, wallTotal, this.gl.STATIC_DRAW);
    }

    // 3. Combine furniture + walls into single unified render VBO
    const combinedCasters = [...furnitureCasters, ...wallCasterFloats];
    const combinedOpaqueGroups = new Map();
    for (const [k, v] of furnitureOpaqueGroups.entries()) {
      combinedOpaqueGroups.set(k, [...v]);
    }
    for (const [k, v] of wallOpaqueGroups.entries()) {
      if (!combinedOpaqueGroups.has(k)) combinedOpaqueGroups.set(k, []);
      combinedOpaqueGroups.get(k).push(...v);
    }
    const combinedTransparent = [...furnitureTransparent, ...wallTransparentFloats];

    const furnitureCasterCount = furnitureCasters.length / FLOATS;
    const opaqueBatches = [];
    const allOpaqueFloats = [];
    let currentBatchOffset = combinedCasters.length / FLOATS;

    for (const [texUrl, floats] of combinedOpaqueGroups.entries()) {
      const count = floats.length / FLOATS;
      if (count > 0) {
        opaqueBatches.push({ textureUrl: texUrl || null, offset: currentBatchOffset, count });
        currentBatchOffset += count;
        for (let i = 0; i < floats.length; i++) allOpaqueFloats.push(floats[i]);
      }
    }

    this.opaqueBatches = opaqueBatches;
    this.casterVertexCount = furnitureCasterCount;
    this.sunCasterVertexCount = combinedCasters.length / FLOATS;
    this.opaqueOffset = combinedCasters.length / FLOATS;
    this.opaqueVertexCount = allOpaqueFloats.length / FLOATS;
    this.transparentOffset = (combinedCasters.length + allOpaqueFloats.length) / FLOATS;
    this.transparentVertexCount = combinedTransparent.length / FLOATS;

    const fullBuffer = new Float32Array(combinedCasters.length + allOpaqueFloats.length + combinedTransparent.length);
    fullBuffer.set(combinedCasters, 0);
    fullBuffer.set(allOpaqueFloats, combinedCasters.length);
    fullBuffer.set(combinedTransparent, combinedCasters.length + allOpaqueFloats.length);
    const gl = this.gl;
    if (gl) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, fullBuffer, gl.STATIC_DRAW);
    }

    this.edgeVertexCount = furnitureEdges.length / 7;
    if (gl) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(furnitureEdges), gl.STATIC_DRAW);
    }

    this._lastCulledWallsKey = culledWallsKey;
    this._lastWallMode = this.wallMode;
  }


  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const q = this.getQualitySettings();
    const device = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const dpr = this.quality === 'ultra' ? Math.min(q.pixelRatio, Math.max(device, 1) * 1.5) : Math.min(device, q.pixelRatio);
    const w = Math.max(100, Math.floor((rect.width || this.canvas.clientWidth || 800) * dpr));
    const h = Math.max(100, Math.floor((rect.height || this.canvas.clientHeight || 600) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.render();
  }

  computeLightSpaceMatrix() {
    const b = this.roomBounds || { minX: 0, maxX: 4000, minZ: 0, maxZ: 3000, height: 2700 };
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const H = b.height || 2700;

    // Full symmetrical room coverage with generous padding so the shadow NEVER cuts off
    const halfSpan = Math.max((b.maxX - b.minX) * 0.5, (b.maxZ - b.minZ) * 0.5) + 600;

    const orthoProj = new Float32Array(16);
    mat4Ortho(orthoProj, -halfSpan, halfSpan, -halfSpan, halfSpan, 10, H + 2500);

    const lightView = new Float32Array(16);
    const eye = [cx, H + 400, cz];
    const target = [cx, 0, cz];
    mat4LookAt(lightView, eye, target, [0, 0, -1]);

    const lightSpace = new Float32Array(16);
    mat4Multiply(lightSpace, orthoProj, lightView);
    return lightSpace;
  }

  render() {
    if (!this.gl) return;
    const gl = this.gl;
    const totalVertices = this.opaqueVertexCount + this.transparentVertexCount;
    if (!totalVertices) return;

    const stride = 11 * 4; // 11 floats per vertex: pos(3), norm(3), color(4), material(1)
    const lightSpaceMatrix = this.computeLightSpaceMatrix();

    // 1. Render Shadow Depth Pass (furniture casters only)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (this.casterVertexCount > 0) {
      gl.useProgram(this.shadowProgram);
      gl.uniformMatrix4fv(this.shadowUniforms.lightSpace, false, lightSpaceMatrix);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(this.shadowAttribs.position);
      gl.vertexAttribPointer(this.shadowAttribs.position, 3, gl.FLOAT, false, stride, 0);

      gl.drawArrays(gl.TRIANGLES, 0, this.casterVertexCount);
      gl.disableVertexAttribArray(this.shadowAttribs.position);
    }

    // 1b. Directional sun / key light depth pass. In daylight walls and ceiling
    // also cast, so sun patches enter only through windows and open doors.
    const sunLightSpace = this.computeSunLightSpaceMatrix();
    const sunCasterCount = this.lightingMode === 'day' && this.wallShadows !== false
      ? (this.sunCasterVertexCount || this.casterVertexCount)
      : this.casterVertexCount;
    if (this.sunShadowFBO && this.getQualitySettings().sunShadows) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sunShadowFBO);
      gl.viewport(0, 0, this.sunShadowSize, this.sunShadowSize);
      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (sunCasterCount > 0) {
        gl.useProgram(this.shadowProgram);
        gl.uniformMatrix4fv(this.shadowUniforms.lightSpace, false, sunLightSpace);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.enableVertexAttribArray(this.shadowAttribs.position);
        gl.vertexAttribPointer(this.shadowAttribs.position, 3, gl.FLOAT, false, stride, 0);
        gl.drawArrays(gl.TRIANGLES, 0, sunCasterCount);
        gl.disableVertexAttribArray(this.shadowAttribs.position);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 2. Main Render Pass
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const modeInt = this.lightingMode === 'day' ? 1 : this.lightingMode === 'studio' ? 2 : this.lightingMode === 'night-led' ? 3 : 0;
    // Fallback clear colour (overdrawn by the gradient backdrop)
    if (this.lightingMode === 'day') {
      gl.clearColor(0.92, 0.94, 0.96, 1.0);
    } else if (this.lightingMode === 'night-led') {
      gl.clearColor(0.14, 0.16, 0.20, 1.0);
    } else {
      gl.clearColor(0.86, 0.88, 0.87, 1.0);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 2-pre. Studio gradient backdrop
    if (this.bgProgram && this.bgVbo) {
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.bgProgram);
      gl.uniform2f(this.bgUniforms.resolution, this.canvas.width, this.canvas.height);
      gl.uniform1i(this.bgUniforms.lightingMode, modeInt);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bgVbo);
      gl.enableVertexAttribArray(this.bgAttribs.pos);
      gl.vertexAttribPointer(this.bgAttribs.pos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(this.bgAttribs.pos);
      gl.enable(gl.DEPTH_TEST);
    }

    gl.useProgram(this.mainProgram);

    // Perspective Camera setup
    const eye = this.getCameraEye();
    const aspect = this.canvas.width / (this.canvas.height || 1);
    const projMatrix = new Float32Array(16);
    mat4Perspective(projMatrix, Math.PI / 3, aspect, 50, 45000);

    const viewMatrix = new Float32Array(16);
    mat4LookAt(viewMatrix, eye, this.target, [0, 1, 0]);

    const rb = this.roomBounds || { minX: 0, maxX: 4000, minZ: 0, maxZ: 3000, height: 2700 };
    gl.uniformMatrix4fv(this.mainUniforms.projection, false, projMatrix);
    gl.uniformMatrix4fv(this.mainUniforms.view, false, viewMatrix);
    gl.uniformMatrix4fv(this.mainUniforms.lightSpace, false, lightSpaceMatrix);
    gl.uniform3fv(this.mainUniforms.lightPos, this.lightPos);
    gl.uniform3fv(this.mainUniforms.lightColor, this.lightColor);
    gl.uniform3fv(this.mainUniforms.cameraPos, eye);
    gl.uniform1i(this.mainUniforms.useShadows, 1);
    gl.uniform1i(this.mainUniforms.lightingMode, modeInt);
    gl.uniform1i(this.mainUniforms.floorStyle, FLOOR_STYLES[this.floorStyle]?.id ?? 0);
    gl.uniform2f(this.mainUniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.mainUniforms.roomHeight, rb.height || 2700);
    gl.uniform1f(this.mainUniforms.shadowTexel, 1 / (this.shadowSize || 2048));
    if (this.mainUniforms.rayTracing) gl.uniform1i(this.mainUniforms.rayTracing, this.rayTracing !== false ? 1 : 0);
    if (this.mainUniforms.roomMin) gl.uniform3f(this.mainUniforms.roomMin, rb.minX || 0, 0, rb.minZ || 0);
    if (this.mainUniforms.roomMax) gl.uniform3f(this.mainUniforms.roomMax, rb.maxX || 4000, rb.height || 2700, rb.maxZ || 3000);

    const roomLights = (this.project?.room?.lights || []).filter(l => l && l.enabled !== false).slice(0, 6);
    if (this.mainUniforms.extraLightCount) {
      gl.uniform1i(this.mainUniforms.extraLightCount, roomLights.length);
    }
    if (roomLights.length > 0) {
      const posArr = new Float32Array(18);
      const colArr = new Float32Array(18);
      const roomH = rb.height || 2700;
      for (let i = 0; i < roomLights.length; i++) {
        const l = roomLights[i];
        const kind = l.kind || 'spot';
        const defaultY = kind === 'pendant' ? roomH - 550 : kind === 'sconce' ? 1800 : kind === 'floor' ? 1650 : roomH - 80;
        posArr[i * 3] = Number(l.x) || 2000;
        posArr[i * 3 + 1] = Number.isFinite(Number(l.y)) ? Number(l.y) : defaultY;
        posArr[i * 3 + 2] = Number(l.z) || 1500;
        const rgb = /^#[0-9a-f]{6}$/i.test(l.color || '') ? hexToRgb(l.color) : [1.0, 0.93, 0.82];
        const intensity = Math.max(0, Math.min(3, Number.isFinite(Number(l.intensity)) ? Number(l.intensity) : 1.0));
        colArr[i * 3] = rgb[0] * intensity;
        colArr[i * 3 + 1] = rgb[1] * intensity;
        colArr[i * 3 + 2] = rgb[2] * intensity;
      }
      if (this.mainUniforms.extraLightPos) gl.uniform3fv(this.mainUniforms.extraLightPos, posArr);
      if (this.mainUniforms.extraLightColor) gl.uniform3fv(this.mainUniforms.extraLightColor, colArr);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.uniform1i(this.mainUniforms.shadowMap, 0);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.sunShadowTexture || this.shadowTexture);
    gl.uniform1i(this.mainUniforms.sunShadowMap, 2);
    gl.uniformMatrix4fv(this.mainUniforms.sunLightSpace, false, sunLightSpace);
    gl.uniform3fv(this.mainUniforms.sunDir, this.getSunDirection());
    gl.uniform1f(this.mainUniforms.sunShadowTexel, 1 / (this.sunShadowSize || 2048));
    const quality = this.getQualitySettings();
    gl.uniform1i(this.mainUniforms.useSunShadows, this.sunShadowFBO && quality.sunShadows ? 1 : 0);
    gl.uniform1i(this.mainUniforms.overheadSamples, quality.overheadSamples);
    gl.uniform1i(this.mainUniforms.sunSamples, quality.sunSamples);
    gl.uniform1f(this.mainUniforms.roughnessOverride, -1);

    const hasMaterial = this.mainAttribs.material >= 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(this.mainAttribs.position);
    gl.enableVertexAttribArray(this.mainAttribs.normal);
    gl.enableVertexAttribArray(this.mainAttribs.color);
    if (hasMaterial) gl.enableVertexAttribArray(this.mainAttribs.material);

    gl.vertexAttribPointer(this.mainAttribs.position, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(this.mainAttribs.normal, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.vertexAttribPointer(this.mainAttribs.color, 4, gl.FLOAT, false, stride, 6 * 4);
    if (hasMaterial) gl.vertexAttribPointer(this.mainAttribs.material, 1, gl.FLOAT, false, stride, 10 * 4);

    // 2a. Opaque Pass (furniture, walls, floor, frames); polygon offset keeps edge lines crisp
    if (this.opaqueBatches && this.opaqueBatches.length > 0) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      for (const batch of this.opaqueBatches) {
        if (batch.count === 0) continue;
        const tex = batch.textureUrl ? this.loadTexture(batch.textureUrl) : null;
        const hasTex = Boolean(batch.textureUrl && tex && (tex.loaded || typeof Image === 'undefined'));
        if (hasTex) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(this.mainUniforms.materialTexture, 1);
          gl.uniform1i(this.mainUniforms.hasTexture, 1);
        } else {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, this.defaultTexture);
          gl.uniform1i(this.mainUniforms.materialTexture, 1);
          gl.uniform1i(this.mainUniforms.hasTexture, 0);
        }
        gl.uniform1f(this.mainUniforms.roughnessOverride, this.roughnessForTexture(batch.textureUrl));
        gl.drawArrays(gl.TRIANGLES, batch.offset, batch.count);
      }
      gl.uniform1f(this.mainUniforms.roughnessOverride, -1);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    } else if (this.opaqueVertexCount > 0) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      gl.drawArrays(gl.TRIANGLES, this.opaqueOffset, this.opaqueVertexCount);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    gl.disableVertexAttribArray(this.mainAttribs.position);
    gl.disableVertexAttribArray(this.mainAttribs.normal);
    gl.disableVertexAttribArray(this.mainAttribs.color);
    if (hasMaterial) gl.disableVertexAttribArray(this.mainAttribs.material);

    // 2b. Panel edge outlines (separate seams between boards)
    if (this.edgeProgram && this.edgeVertexCount > 0) {
      gl.useProgram(this.edgeProgram);
      gl.uniformMatrix4fv(this.edgeUniforms.projection, false, projMatrix);
      gl.uniformMatrix4fv(this.edgeUniforms.view, false, viewMatrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeVbo);
      gl.enableVertexAttribArray(this.edgeAttribs.position);
      gl.enableVertexAttribArray(this.edgeAttribs.color);
      gl.vertexAttribPointer(this.edgeAttribs.position, 3, gl.FLOAT, false, 7 * 4, 0);
      gl.vertexAttribPointer(this.edgeAttribs.color, 4, gl.FLOAT, false, 7 * 4, 3 * 4);
      gl.depthMask(false);
      gl.drawArrays(gl.LINES, 0, this.edgeVertexCount);
      gl.depthMask(true);
      gl.disableVertexAttribArray(this.edgeAttribs.position);
      gl.disableVertexAttribArray(this.edgeAttribs.color);
    }

    // 2c. Transparent Pass (window glass, door leaves) with alpha blending
    if (this.transparentVertexCount > 0) {
      gl.useProgram(this.mainProgram);
      gl.uniform1i(this.mainUniforms.hasTexture, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(this.mainAttribs.position);
      gl.enableVertexAttribArray(this.mainAttribs.normal);
      gl.enableVertexAttribArray(this.mainAttribs.color);
      if (hasMaterial) gl.enableVertexAttribArray(this.mainAttribs.material);
      gl.vertexAttribPointer(this.mainAttribs.position, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(this.mainAttribs.normal, 3, gl.FLOAT, false, stride, 3 * 4);
      gl.vertexAttribPointer(this.mainAttribs.color, 4, gl.FLOAT, false, stride, 6 * 4);
      if (hasMaterial) gl.vertexAttribPointer(this.mainAttribs.material, 1, gl.FLOAT, false, stride, 10 * 4);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, this.transparentOffset, this.transparentVertexCount);
      gl.depthMask(true);
      gl.disableVertexAttribArray(this.mainAttribs.position);
      gl.disableVertexAttribArray(this.mainAttribs.normal);
      gl.disableVertexAttribArray(this.mainAttribs.color);
      if (hasMaterial) gl.disableVertexAttribArray(this.mainAttribs.material);
    }
  }

  attachEvents() {
    if (!this.canvas || typeof window === 'undefined') return;

    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    this.canvas.addEventListener('dblclick', e => {
      const pickedId = this.pickCabinet(e.clientX, e.clientY);
      if (pickedId) {
        this.focusOnCabinet(pickedId);
      }
    });

    this.canvas.addEventListener('pointerdown', e => {
      this.canvas.setPointerCapture?.(e.pointerId);
      this.drag = {
        button: e.button,
        startX: e.clientX,
        startY: e.clientY,
        startYaw: this.yaw,
        startPitch: this.pitch,
        startTarget: [...this.target],
      };
    });

    window.addEventListener('pointermove', e => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.startX;
      const dy = e.clientY - this.drag.startY;

      if (this.drag.button === 0 && !e.shiftKey) {
        // Orbit (Yaw & Pitch)
        this.yaw = this.drag.startYaw - dx * 0.005;
        this.pitch = Math.max(-Math.PI * 0.42, Math.min(Math.PI * 0.42, this.drag.startPitch + dy * 0.005));
        if (this.wallMode === 'cutaway') this.buildGeometry();
        this.render();
      } else {
        // Pan (Right click or Shift + drag)
        const forward = [Math.sin(this.yaw), 0, Math.cos(this.yaw)];
        const right = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
        const panSpeed = this.distance * 0.001;

        this.target[0] = this.drag.startTarget[0] - right[0] * dx * panSpeed;
        this.target[1] = this.drag.startTarget[1] + dy * panSpeed;
        this.target[2] = this.drag.startTarget[2] - right[2] * dx * panSpeed;
        if (this.wallMode === 'cutaway') this.buildGeometry();
        this.render();
      }
    });

    window.addEventListener('pointerup', e => {
      if (this.drag) {
        const dx = e.clientX - this.drag.startX;
        const dy = e.clientY - this.drag.startY;
        const dist = Math.hypot(dx, dy);
        const wasClick = dist < 5 && this.drag.button === 0;

        this.canvas.releasePointerCapture?.(e.pointerId);
        this.drag = null;

        if (wasClick) {
          const pickedId = this.pickCabinet(e.clientX, e.clientY);
          if (pickedId && (!this.onSelect || this.onSelect === this._defaultOnSelect)) {
            this.toggleDoors();
          }
        }
      }
    });

    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const zoomFactor = Math.exp(e.deltaY * 0.0015);
      this.distance = Math.max(300, Math.min(25000, this.distance * zoomFactor));
      if (this.wallMode === 'cutaway') this.buildGeometry();
      this.render();
    }, { passive: false });

    // Keyboard WASD walk controls
    window.addEventListener('keydown', e => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const code = e.code;
      if (code === 'Escape') {
        if (this.selectedCabinetId !== null) {
          this.setSelectedCabinet(null);
          this.onSelect?.(null);
        }
        return;
      }
      if (code === 'KeyF' && this.selectedCabinetId) {
        this.focusOnCabinet(this.selectedCabinetId);
        return;
      }
      if (!['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'KeyQ', 'KeyC', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) return;

      const forward = [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
      const right = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
      const step = Math.max(60, this.distance * 0.04);

      if (code === 'KeyW' || code === 'ArrowUp') {
        this.target[0] += forward[0] * step;
        this.target[2] += forward[2] * step;
      } else if (code === 'KeyS' || code === 'ArrowDown') {
        this.target[0] -= forward[0] * step;
        this.target[2] -= forward[2] * step;
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        this.target[0] -= right[0] * step;
        this.target[2] -= right[2] * step;
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        this.target[0] += right[0] * step;
        this.target[2] += right[2] * step;
      } else if (code === 'KeyE' || code === 'Space') {
        this.target[1] += step;
      } else if (code === 'KeyQ' || code === 'KeyC') {
        this.target[1] = Math.max(100, this.target[1] - step);
      }
      if (this.wallMode === 'cutaway') this.buildGeometry();
      this.render();
    });
  }

  getRayFromScreen(clientX, clientY) {
    const canvas = this.canvas;
    const rect = canvas?.getBoundingClientRect ? canvas.getBoundingClientRect() : {
      left: 0,
      top: 0,
      width: canvas?.width || 800,
      height: canvas?.height || 600,
    };
    const width = rect.width || canvas?.width || 800;
    const height = rect.height || canvas?.height || 600;

    const ndcX = ((clientX - rect.left) / width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / height) * 2;

    const eye = this.getCameraEye();
    const aspect = (canvas?.width || width) / ((canvas?.height || height) || 1);
    const projMatrix = new Float32Array(16);
    mat4Perspective(projMatrix, Math.PI / 3, aspect, 50, 45000);

    const viewMatrix = new Float32Array(16);
    mat4LookAt(viewMatrix, eye, this.target, [0, 1, 0]);

    const viewProj = new Float32Array(16);
    mat4Multiply(viewProj, projMatrix, viewMatrix);

    const invViewProj = new Float32Array(16);
    if (!mat4Invert(invViewProj, viewProj)) return null;

    const nearPoint = vec4Transform([ndcX, ndcY, -1, 1], invViewProj);
    const farPoint = vec4Transform([ndcX, ndcY, 1, 1], invViewProj);

    if (Math.abs(nearPoint[3]) < 1e-6 || Math.abs(farPoint[3]) < 1e-6) return null;

    const pNear = [nearPoint[0] / nearPoint[3], nearPoint[1] / nearPoint[3], nearPoint[2] / nearPoint[3]];
    const pFar = [farPoint[0] / farPoint[3], farPoint[1] / farPoint[3], farPoint[2] / farPoint[3]];

    const dir = [pFar[0] - pNear[0], pFar[1] - pNear[1], pFar[2] - pNear[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    return {
      origin: pNear,
      dir: [dir[0] / len, dir[1] / len, dir[2] / len],
    };
  }

  intersectCabinet(ray, c) {
    const angle = ((Number(c.rotation) || 0) * Math.PI) / 180;
    const cosA = Math.cos(-angle);
    const sinA = Math.sin(-angle);

    const ox = ray.origin[0] - c.x;
    const oy = ray.origin[1] - (c.y || 0);
    const oz = ray.origin[2] - c.z;

    const locOx = ox * cosA - oz * sinA;
    const locOy = oy;
    const locOz = ox * sinA + oz * cosA;

    const locDx = ray.dir[0] * cosA - ray.dir[2] * sinA;
    const locDy = ray.dir[1];
    const locDz = ray.dir[0] * sinA + ray.dir[2] * cosA;

    const w = Number(c.width) || 600;
    const h = Number(c.height) || 800;
    const d = (Number(c.depth) || 400) + (Number(c.frontThickness) || 18);

    const boxMin = [-5, -5, -5];
    const boxMax = [w + 5, h + 5, d + 5];

    let tmin = -Infinity, tmax = Infinity;
    const origins = [locOx, locOy, locOz];
    const dirs = [locDx, locDy, locDz];

    for (let i = 0; i < 3; i++) {
      if (Math.abs(dirs[i]) < 1e-6) {
        if (origins[i] < boxMin[i] || origins[i] > boxMax[i]) return null;
      } else {
        let t1 = (boxMin[i] - origins[i]) / dirs[i];
        let t2 = (boxMax[i] - origins[i]) / dirs[i];
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    if (tmax < 0) return null;
    return tmin >= 0 ? tmin : tmax;
  }

  pickCabinet(clientX, clientY) {
    if (!this.project?.cabinets?.length) {
      if (this.selectedCabinetId !== null) this.setSelectedCabinet(null);
      this.onSelect?.(null);
      return null;
    }
    const ray = this.getRayFromScreen(clientX, clientY);
    if (!ray) return null;

    let closestDist = Infinity;
    let closestId = null;

    for (const c of this.project.cabinets) {
      const t = this.intersectCabinet(ray, c);
      if (t !== null && t < closestDist) {
        closestDist = t;
        closestId = c.id;
      }
    }

    if (closestId) {
      // Check wall occlusion
      const room = this.project?.room || {};
      const outline = room.outline && room.outline.length >= 3
        ? room.outline
        : [{ x: 0, z: 0 }, { x: room.width || 4000, z: 0 }, { x: room.width || 4000, z: room.depth || 3000 }, { x: 0, z: room.depth || 3000 }];
      const roomHeight = room.height || 2700;
      const wallThickness = room.wallThickness || 150;
      const eye = this.getCameraEye();
      const isInside = this.isPointInsideRoom(eye[0], eye[2]) && eye[1] < roomHeight;
      const useCutaway = (this.wallMode === 'cutaway') && !isInside;

      let dir = null;
      if (useCutaway) {
        const dx = eye[0] - this.target[0];
        const dz = eye[2] - this.target[2];
        const dLen = Math.hypot(dx, dz) || 1;
        dir = [dx / dLen, 0.45, dz / dLen];
      }

      const signedArea = outline.reduce((s, p, i) => { const q = outline[(i + 1) % outline.length]; return s + p.x * q.z - q.x * p.z; }, 0) / 2;
      const orient = signedArea >= 0 ? 1 : -1;

      for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 1) continue;

        if (useCutaway && dir) {
          const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
          const inward = [-uz * orient, 0, ux * orient];
          const isNearWall = (inward[0] * dir[0] + inward[2] * dir[2] < -0.00001);
          if (isNearWall) continue; // This wall is cut away
        }

        const wallBounds = { start: a, end: b, bottom: 0, top: roomHeight, thickness: wallThickness };
        if (isRayOccludedByWall(ray, wallBounds, closestDist)) {
          if (this.selectedCabinetId !== null) this.setSelectedCabinet(null);
          this.onSelect?.(null);
          return null; // Occluded by solid wall
        }
      }

      this.setSelectedCabinet(closestId);
      this.onSelect?.(closestId);
      return closestId;
    }

    if (this.selectedCabinetId !== null) {
      this.setSelectedCabinet(null);
    }
    this.onSelect?.(null);
    return null;
  }

  toggleDoors() {
    this.doorsOpen = !this.doorsOpen;
    this.openProgress = this.doorsOpen ? 1 : 0;
    this.buildGeometry();
    this.render();
    return this.doorsOpen;
  }

  captureScreenshot() {
    if (!this.canvas) return null;
    this.render();
    return this.canvas.toDataURL('image/png');
  }

  destroy() {
    if (this.gl) {
      if (this.vbo) this.gl.deleteBuffer(this.vbo);
      if (this.wallBuffer) this.gl.deleteBuffer(this.wallBuffer);
      if (this.furnitureBuffer) this.gl.deleteBuffer(this.furnitureBuffer);
      if (this.shadowFBO) this.gl.deleteFramebuffer(this.shadowFBO);
      if (this.shadowTexture) this.gl.deleteTexture(this.shadowTexture);
      if (this.shadowDepthRB) this.gl.deleteRenderbuffer(this.shadowDepthRB);
      if (this.sunShadowFBO) this.gl.deleteFramebuffer(this.sunShadowFBO);
      if (this.sunShadowTexture) this.gl.deleteTexture(this.sunShadowTexture);
      if (this.sunShadowDepthRB) this.gl.deleteRenderbuffer(this.sunShadowDepthRB);
      if (this.bgVbo) this.gl.deleteBuffer(this.bgVbo);
      if (this.edgeVbo) this.gl.deleteBuffer(this.edgeVbo);
      if (this.bgProgram) this.gl.deleteProgram(this.bgProgram);
      if (this.edgeProgram) this.gl.deleteProgram(this.edgeProgram);
    }
  }
}
