import { makeScene } from './renderer.js';
import { pointInPolygon } from './room-geometry.js';

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

export const VERTEX_SHADER_SOURCE = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec4 aColor;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uLightSpaceMatrix;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec4 vColor;
varying vec4 vLightSpacePos;

void main() {
  vPosition = aPosition;
  vNormal = aNormal;
  vColor = aColor;
  vLightSpacePos = uLightSpaceMatrix * vec4(aPosition, 1.0);
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition, 1.0);
}
`;

export const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec4 vColor;
varying vec4 vLightSpacePos;

uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform vec3 uCameraPos;
uniform sampler2D uShadowMap;
uniform bool uUseShadows;
uniform int uLightingMode;

float sampleShadow(vec4 lightSpacePos, vec3 norm, vec3 lightDir) {
  vec3 projCoords = lightSpacePos.xyz / lightSpacePos.w;
  projCoords = projCoords * 0.5 + 0.5;

  if (projCoords.x < 0.0 || projCoords.x > 1.0 ||
      projCoords.y < 0.0 || projCoords.y > 1.0 ||
      projCoords.z < 0.0 || projCoords.z > 1.0) {
    return 1.0;
  }

  // Slope-scaled depth bias to eliminate acne completely
  float cosTheta = max(dot(norm, lightDir), 0.0);
  float bias = max(0.0035 * (1.0 - cosTheta), 0.0012);
  float currentDepth = projCoords.z - bias;

  float shadow = 0.0;
  vec2 texelSize = vec2(1.0 / 2048.0);

  // 4x4 PCF filter for soft, natural shadow edges
  for (int x = -1; x <= 2; x++) {
    for (int y = -1; y <= 2; y++) {
      vec4 packedZ = texture2D(uShadowMap, projCoords.xy + vec2(float(x), float(y)) * texelSize);
      float pDepth = packedZ.r + packedZ.g / 255.0;
      shadow += (currentDepth <= pDepth) ? 1.0 : 0.32;
    }
  }
  return shadow / 16.0;
}

void main() {
  vec3 norm = normalize(vNormal);
  vec3 lightDir = normalize(uLightPos - vPosition);
  float dist = length(uLightPos - vPosition);

  // Distance falloff in meters (smooth, natural gradient from ceiling to floor)
  float dMeters = dist * 0.001;
  float atten = 1.0 / (1.0 + 0.22 * dMeters + 0.06 * dMeters * dMeters);

  // Direct ceiling light
  float diff = max(dot(norm, lightDir), 0.0);

  // Camera view direction
  vec3 viewDir = normalize(uCameraPos - vPosition);
  vec3 halfDir = normalize(lightDir + viewDir);

  // Blinn-phong specular
  float isGlass = (vColor.a < 0.9) ? 1.0 : 0.0;
  float shininess = (isGlass > 0.5) ? 48.0 : 28.0;
  float specStrength = (isGlass > 0.5) ? 0.42 : 0.16;
  float spec = pow(max(dot(norm, halfDir), 0.0), shininess) * specStrength;

  // Convert input sRGB color to linear space for physically accurate lighting
  vec3 albedoLinear = pow(vColor.rgb, vec3(2.2));

  // Ambient lighting setup based on lighting mode (day vs evening)
  vec3 skyColor;
  vec3 groundColor;
  if (uLightingMode == 1) {
    skyColor = vec3(0.68, 0.72, 0.78);
    groundColor = vec3(0.46, 0.44, 0.41);
  } else {
    skyColor = vec3(0.50, 0.52, 0.56);
    groundColor = vec3(0.36, 0.34, 0.32);
  }
  float hemi = norm.y * 0.5 + 0.5;
  vec3 ambient = mix(groundColor, skyColor, hemi);

  // Soft shadow from ceiling chandelier
  float shadowFactor = uUseShadows ? sampleShadow(vLightSpacePos, norm, lightDir) : 1.0;

  // Direct ceiling light contribution
  float directScale = (uLightingMode == 1) ? 1.0 : 1.45;
  vec3 directDiffuse = diff * uLightColor * directScale * atten * shadowFactor;
  vec3 directSpec = spec * uLightColor * atten * shadowFactor;

  // Day mode bright sunlight entering at an angle
  vec3 sunContrib = vec3(0.0);
  vec3 sunSpecContrib = vec3(0.0);
  if (uLightingMode == 1) {
    vec3 sunDir = normalize(vec3(0.55, 0.82, -0.42));
    float sunDiff = max(dot(norm, sunDir), 0.0) * 0.90;
    vec3 sunHalfDir = normalize(sunDir + viewDir);
    float sunSpec = pow(max(dot(norm, sunHalfDir), 0.0), shininess) * specStrength * 0.85;
    vec3 sunColor = vec3(1.10, 1.08, 1.02);
    sunContrib = sunDiff * sunColor;
    sunSpecContrib = sunSpec * sunColor;
  }

  // Directional key / angle light for 3D depth and shape definition
  vec3 keyDir = normalize(vec3(0.35, 0.85, 0.4));
  float keyDiff = (uLightingMode == 1) ? 0.0 : (max(dot(norm, keyDir), 0.0) * 0.28);

  // Indirect interior diffuse bounce (room walls reflecting light back)
  float bounce = 0.14;
  float camFill = max(dot(norm, viewDir), 0.0) * 0.10;

  // Composite lighting for surfaces
  vec3 lighting = ambient + directDiffuse + sunContrib + keyDiff + camFill + bounce;
  vec3 totalSpec = directSpec + sunSpecContrib;

  // Floor subtle contact darkening near base
  if (vPosition.y < 4.0) {
    lighting *= 0.95;
  }

  vec3 surfaceColor;
  if (isGlass > 0.5) {
    // Glass has high transparency and specular highlights
    surfaceColor = albedoLinear * (ambient * 0.6 + totalSpec * 1.5) + totalSpec;
  } else {
    surfaceColor = albedoLinear * lighting + totalSpec;

    // Floor procedural texture: for floor faces (where vPosition.y < 2.0)
    if (vPosition.y < 2.0 && norm.y > 0.5) {
      float plankWidth = 200.0;
      float plankLength = 1200.0;
      float row = floor(vPosition.z / plankWidth);
      float stagger = mod(row * 400.0, plankLength);
      vec2 pCoord = vec2(vPosition.x + stagger, vPosition.z);
      vec2 cell = mod(pCoord, vec2(plankLength, plankWidth));
      float edgeX = min(cell.x, plankLength - cell.x);
      float edgeZ = min(cell.y, plankWidth - cell.y);
      float seam = 1.0 - smoothstep(0.8, 3.2, min(edgeX, edgeZ));

      // Subtle per-plank tone variation
      float plankId = sin(row * 127.1 + floor(pCoord.x / plankLength) * 311.7);
      float plankTone = fract(plankId * 43758.5453) * 0.05 - 0.025;
      surfaceColor = surfaceColor * (1.0 + plankTone) * (1.0 - seam * 0.16);
    }

    // Wood grain: for wooden materials / decors, add subtle procedural micro-grain along length of parts
    bool isWood = (vPosition.y >= 2.0 && vColor.a > 0.9 &&
                   vColor.r > vColor.b * 1.08 && (vColor.r - vColor.b) > 0.045 &&
                   vColor.r > 0.22 && vColor.b < 0.88);
    if (isWood) {
      float u = (abs(norm.y) < 0.5) ? dot(vPosition.xz, vec2(-norm.z, norm.x)) : vPosition.x;
      float v = (abs(norm.y) < 0.5) ? vPosition.y : vPosition.z;

      float grainWave = sin(u * 0.45 + sin(v * 0.015) * 3.5);
      float fineGrain = sin(u * 1.8 + sin(v * 0.04) * 4.0);
      float microFibers = sin(u * 6.0 + v * 0.2) * 0.5 + 0.5;

      float grain = grainWave * 0.035 + fineGrain * 0.02 + (microFibers - 0.5) * 0.02;
      surfaceColor *= (1.0 + grain);
    }
  }

  // Extended Reinhard tone mapping with white point calibration:
  // Maps linear HDR light smoothly into displayable range, keeping white pure and crisp (RGB 240-255)
  // while preventing blowout or flat clipping.
  vec3 exposed = surfaceColor * 1.20;
  float whitePoint = 2.2;
  vec3 mapped = (exposed * (vec3(1.0) + exposed / (whitePoint * whitePoint))) / (vec3(1.0) + exposed);
  mapped = clamp(mapped, 0.0, 1.0);

  // Gamma correction to sRGB
  vec3 finalColor = pow(mapped, vec3(1.0 / 2.2));

  gl_FragColor = vec4(finalColor, vColor.a);
}
`;

const SHADOW_VS = `
attribute vec3 aPosition;
uniform mat4 uLightSpaceMatrix;

void main() {
  gl_Position = uLightSpaceMatrix * vec4(aPosition, 1.0);
}
`;

const SHADOW_FS = `
precision mediump float;

void main() {
  float depth = gl_FragCoord.z;
  gl_FragColor = vec4(depth, fract(depth * 255.0), 0.0, 1.0);
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
    this.doorsOpen = false;
    this.wallMode = 'cutaway'; // 'cutaway' | 'all'
    this.lightingMode = 'evening'; // 'day' | 'evening'
    this.cameraPreset = 'corner-1';

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
      };

      this.shadowProgram = createProgram(gl, SHADOW_VS, SHADOW_FS);
      this.shadowAttribs = {
        position: gl.getAttribLocation(this.shadowProgram, 'aPosition'),
      };
      this.shadowUniforms = {
        lightSpace: gl.getUniformLocation(this.shadowProgram, 'uLightSpaceMatrix'),
      };

      this.initShadowFBO();
      this.vbo = gl.createBuffer();
    } catch (e) {
      console.warn('WebGL initialization failed, falling back:', e);
      this.gl = null;
    }
  }

  initShadowFBO() {
    const gl = this.gl;
    this.shadowSize = 2048;
    this.shadowTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.shadowSize, this.shadowSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.shadowDepthRB = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.shadowDepthRB);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.shadowSize, this.shadowSize);

    this.shadowFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.shadowDepthRB);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  setProject(project) {
    this.project = project;
    this.updateRoomLighting();
    this.buildGeometry();
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
    if (mode === 'day' || mode === 'evening') {
      this.lightingMode = mode;
    } else {
      this.lightingMode = this.lightingMode === 'day' ? 'evening' : 'day';
    }
    if (this.lightingMode === 'day') {
      this.lightColor = [0.35, 0.35, 0.35];
    } else {
      this.lightColor = [0.82, 0.80, 0.75];
    }
    this.buildGeometry();
    this.render();
    return this.lightingMode;
  }

  toggleWallMode() {
    this.wallMode = this.wallMode === 'cutaway' ? 'all' : 'cutaway';
    this.buildGeometry();
    this.render();
    return this.wallMode;
  }

  buildGeometry() {
    if (!this.gl || !this.project) return;

    const eye = this.getCameraEye();
    const isInside = this.isPointInsideRoom(eye[0], eye[2]) && eye[1] < (this.project.room?.height || 2700);
    const useCutaway = (this.wallMode === 'cutaway') && !isInside;

    let scene;
    if (useCutaway) {
      // Vector pointing from room target towards eye (towards the camera)
      const dx = eye[0] - this.target[0];
      const dz = eye[2] - this.target[2];
      const dLen = Math.hypot(dx, dz) || 1;
      const dir = [dx / dLen, 0.45, dz / dLen];
      scene = makeScene(this.project, { room: true, allFaces: false, doorsOpen: this.doorsOpen }, dir);
    } else {
      scene = makeScene(this.project, { room: true, allFaces: true, doorsOpen: this.doorsOpen }, null);
    }

    const faces = scene.faces || [];

    const casterFloats = [];
    const opaqueFloats = [];
    const transparentFloats = [];

    const pushPoly = (targetArray, points, normal, colorRGBA) => {
      if (points.length < 3) return;
      const pushV = p => {
        targetArray.push(p[0], p[1], p[2], normal[0], normal[1], normal[2], colorRGBA[0], colorRGBA[1], colorRGBA[2], colorRGBA[3]);
      };
      if (points.length === 3) {
        pushV(points[0]); pushV(points[1]); pushV(points[2]);
      } else if (points.length === 4) {
        pushV(points[0]); pushV(points[1]); pushV(points[2]);
        pushV(points[0]); pushV(points[2]); pushV(points[3]);
      } else {
        for (let i = 1; i < points.length - 1; i++) {
          pushV(points[0]); pushV(points[i]); pushV(points[i + 1]);
        }
      }
    };

    for (const f of faces) {
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

      // Handle window glass and architectural window framing
      if (f.window && f.points.length === 4) {
        const [p0, p1, p2, p3] = f.points;
        const wLen = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
        const hLen = Math.abs(p3[1] - p0[1]);

        if (wLen > 50 && hLen > 50) {
          const ux = (p1[0] - p0[0]) / wLen, uz = (p1[2] - p0[2]) / wLen;
          const fw = Math.min(45, wLen * 0.08); // frame border width

          // Clean architectural window frame colors (warm neutral graphite & sill)
          const frameColor = [0.82, 0.83, 0.82, 1.0];
          const sillColor = [0.86, 0.85, 0.81, 1.0];
          const glassColor = [0.68, 0.80, 0.90, 0.28]; // Transparent glass

          // 1. Window Sill at bottom
          const sillExt = 40;
          const s0 = [p0[0] - ux * 25 + norm[0] * sillExt, p0[1], p0[2] - uz * 25 + norm[2] * sillExt];
          const s1 = [p1[0] + ux * 25 + norm[0] * sillExt, p1[1], p1[2] + uz * 25 + norm[2] * sillExt];
          pushPoly(opaqueFloats, [s0, s1, [s1[0], s1[1] - 22, s1[2]], [s0[0], s0[1] - 22, s0[2]]], norm, sillColor);
          pushPoly(opaqueFloats, [s0, s1, [p1[0] + ux * 25, p1[1], p1[2] + uz * 25], [p0[0] - ux * 25, p0[1], p0[2] - uz * 25]], [0, 1, 0], sillColor);

          // 2. Outer 4-edge Window Frame
          const pt = (u, v, inset = 0) => [p0[0] + ux * u + norm[0] * inset, p0[1] + v, p0[2] + uz * u + norm[2] * inset];
          // Bottom rail
          pushPoly(opaqueFloats, [pt(0, 0, 8), pt(wLen, 0, 8), pt(wLen, fw, 8), pt(0, fw, 8)], norm, frameColor);
          // Top rail
          pushPoly(opaqueFloats, [pt(0, hLen - fw, 8), pt(wLen, hLen - fw, 8), pt(wLen, hLen, 8), pt(0, hLen, 8)], norm, frameColor);
          // Left stile
          pushPoly(opaqueFloats, [pt(0, fw, 8), pt(fw, fw, 8), pt(fw, hLen - fw, 8), pt(0, hLen - fw, 8)], norm, frameColor);
          // Right stile
          pushPoly(opaqueFloats, [pt(wLen - fw, fw, 8), pt(wLen, fw, 8), pt(wLen, hLen - fw, 8), pt(wLen - fw, hLen - fw, 8)], norm, frameColor);

          // 3. Central Mullion Bar for wider windows
          if (wLen > 750) {
            const mw = 30, mx = wLen * 0.5;
            pushPoly(opaqueFloats, [pt(mx - mw / 2, fw, 8), pt(mx + mw / 2, fw, 8), pt(mx + mw / 2, hLen - fw, 8), pt(mx - mw / 2, hLen - fw, 8)], norm, frameColor);
          }

          // 4. Transparent Glass Pane recessed inside frame
          const g0 = pt(fw, fw, -10), g1 = pt(wLen - fw, fw, -10), g2 = pt(wLen - fw, hLen - fw, -10), g3 = pt(fw, hLen - fw, -10);
          pushPoly(transparentFloats, [g0, g1, g2, g3], norm, glassColor);
          pushPoly(transparentFloats, [g3, g2, g1, g0], [-norm[0], -norm[1], -norm[2]], glassColor);
        }
        continue;
      }

      // Skip empty door openings so the door opening is an open portal
      if (f.door) continue;

      const rgb = hexToRgb(f.rawColor || f.color);
      const isTransparent = f.doorLeaf || (f.opacity !== undefined && f.opacity < 0.9);
      const alpha = isTransparent ? (f.opacity ?? 0.85) : 1.0;
      const rgba = [rgb[0], rgb[1], rgb[2], alpha];

      // Furniture casters (only cabinets, drawers, doors, shelves cast shadows!)
      // Room walls and floor DO NOT cast shadows onto the floor.
      const isFurnitureCaster = !f.room && !isTransparent;
      if (isFurnitureCaster) {
        pushPoly(casterFloats, f.points, norm, rgba);
      }

      if (isTransparent) {
        pushPoly(transparentFloats, f.points, norm, rgba);
      } else {
        pushPoly(opaqueFloats, f.points, norm, rgba);
      }
    }

    // Modern glowing ceiling chandelier fixture
    if (this.lightPos) {
      const lx = this.lightPos[0], ly = this.lightPos[1], lz = this.lightPos[2];
      const r = 55;
      const count = 16;
      const trimColor = [0.82, 0.82, 0.80, 1.0];
      const glowColor = this.lightingMode === 'day' ? [0.85, 0.85, 0.82, 1.0] : [0.98, 0.96, 0.90, 1.0];

      for (let i = 0; i < count; i++) {
        const a1 = (i / count) * Math.PI * 2, a2 = ((i + 1) / count) * Math.PI * 2;
        const norm = [0, -1, 0];
        // Inner glowing diffuser
        const p0 = [lx, ly, lz];
        const p1 = [lx + Math.cos(a1) * (r - 12), ly, lz + Math.sin(a1) * (r - 12)];
        const p2 = [lx + Math.cos(a2) * (r - 12), ly, lz + Math.sin(a2) * (r - 12)];
        pushPoly(opaqueFloats, [p0, p1, p2], norm, glowColor);

        // Outer trim ring
        const t1 = [lx + Math.cos(a1) * r, ly - 2, lz + Math.sin(a1) * r];
        const t2 = [lx + Math.cos(a2) * r, ly - 2, lz + Math.sin(a2) * r];
        pushPoly(opaqueFloats, [p1, t1, t2, p2], norm, trimColor);
      }
    }

    // Pack single unified VBO:
    // [0 .. casterFloats] -> used for shadow map depth pass
    // [casterFloats .. opaqueFloats] -> used for opaque pass
    // [opaqueFloats .. transparentFloats] -> used for transparent pass
    this.casterVertexCount = casterFloats.length / 10;
    this.opaqueOffset = casterFloats.length / 10;
    this.opaqueVertexCount = opaqueFloats.length / 10;
    this.transparentOffset = (casterFloats.length + opaqueFloats.length) / 10;
    this.transparentVertexCount = transparentFloats.length / 10;

    const fullBuffer = new Float32Array([...casterFloats, ...opaqueFloats, ...transparentFloats]);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, fullBuffer, gl.STATIC_DRAW);
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

    const stride = 10 * 4; // 10 floats per vertex: pos(3), norm(3), color(4)
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 2. Main Render Pass
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // Soft architectural neutral backdrop (studio lighting)
    if (this.lightingMode === 'day') {
      gl.clearColor(0.92, 0.94, 0.96, 1.0);
    } else {
      gl.clearColor(0.86, 0.88, 0.87, 1.0);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.mainProgram);

    // Perspective Camera setup
    const eye = this.getCameraEye();
    const aspect = this.canvas.width / (this.canvas.height || 1);
    const projMatrix = new Float32Array(16);
    mat4Perspective(projMatrix, Math.PI / 3, aspect, 50, 45000);

    const viewMatrix = new Float32Array(16);
    mat4LookAt(viewMatrix, eye, this.target, [0, 1, 0]);

    gl.uniformMatrix4fv(this.mainUniforms.projection, false, projMatrix);
    gl.uniformMatrix4fv(this.mainUniforms.view, false, viewMatrix);
    gl.uniformMatrix4fv(this.mainUniforms.lightSpace, false, lightSpaceMatrix);
    gl.uniform3fv(this.mainUniforms.lightPos, this.lightPos);
    gl.uniform3fv(this.mainUniforms.lightColor, this.lightColor);
    gl.uniform3fv(this.mainUniforms.cameraPos, eye);
    gl.uniform1i(this.mainUniforms.useShadows, 1);
    gl.uniform1i(this.mainUniforms.lightingMode, this.lightingMode === 'day' ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.uniform1i(this.mainUniforms.shadowMap, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(this.mainAttribs.position);
    gl.enableVertexAttribArray(this.mainAttribs.normal);
    gl.enableVertexAttribArray(this.mainAttribs.color);

    gl.vertexAttribPointer(this.mainAttribs.position, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(this.mainAttribs.normal, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.vertexAttribPointer(this.mainAttribs.color, 4, gl.FLOAT, false, stride, 6 * 4);

    // 2a. Opaque Pass (furniture, walls, floor, frames)
    if (this.opaqueVertexCount > 0) {
      gl.drawArrays(gl.TRIANGLES, this.opaqueOffset, this.opaqueVertexCount);
    }

    // 2b. Transparent Pass (window glass, door leaves) with alpha blending
    if (this.transparentVertexCount > 0) {
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, this.transparentOffset, this.transparentVertexCount);
      gl.depthMask(true);
    }

    gl.disableVertexAttribArray(this.mainAttribs.position);
    gl.disableVertexAttribArray(this.mainAttribs.normal);
    gl.disableVertexAttribArray(this.mainAttribs.color);
  }

  attachEvents() {
    if (!this.canvas || typeof window === 'undefined') return;

    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

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
    if (!this.project?.cabinets?.length) return null;
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
      this.onSelect?.(closestId);
    }
    return closestId;
  }

  toggleDoors() {
    this.doorsOpen = !this.doorsOpen;
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
      if (this.shadowFBO) this.gl.deleteFramebuffer(this.shadowFBO);
      if (this.shadowTexture) this.gl.deleteTexture(this.shadowTexture);
      if (this.shadowDepthRB) this.gl.deleteRenderbuffer(this.shadowDepthRB);
    }
  }
}
