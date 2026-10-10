import { makeScene } from './renderer.js';

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

function mat4Identity(out) {
  for (let i = 0; i < 16; i++) out[i] = i % 5 === 0 ? 1 : 0;
  return out;
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

const VERTEX_SHADER_SOURCE = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uLightSpaceMatrix;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying vec4 vLightSpacePos;

void main() {
  vPosition = aPosition;
  vNormal = aNormal;
  vColor = aColor;
  vLightSpacePos = uLightSpaceMatrix * vec4(aPosition, 1.0);
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying vec4 vLightSpacePos;

uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform vec3 uAmbientLight;
uniform vec3 uCameraPos;
uniform sampler2D uShadowMap;
uniform bool uUseShadows;

float sampleShadow(vec4 lightSpacePos) {
  vec3 projCoords = lightSpacePos.xyz / lightSpacePos.w;
  projCoords = projCoords * 0.5 + 0.5;

  if (projCoords.x < 0.0 || projCoords.x > 1.0 ||
      projCoords.y < 0.0 || projCoords.y > 1.0 ||
      projCoords.z < 0.0 || projCoords.z > 1.0) {
    return 1.0;
  }

  float currentDepth = projCoords.z - 0.005;
  float shadow = 0.0;
  vec2 texelSize = vec2(1.0 / 1024.0);

  // 3x3 PCF filter for soft shadow edges
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec4 packedZ = texture2D(uShadowMap, projCoords.xy + vec2(float(x), float(y)) * texelSize);
      float pDepth = packedZ.r + packedZ.g / 255.0;
      shadow += currentDepth <= pDepth ? 1.0 : 0.28;
    }
  }
  return shadow / 9.0;
}

void main() {
  vec3 norm = normalize(vNormal);
  vec3 lightDir = normalize(uLightPos - vPosition);
  float dist = length(uLightPos - vPosition);

  // Point light distance attenuation
  float atten = 1.0 / (1.0 + 0.00018 * dist + 0.0000003 * dist * dist);
  float diff = max(dot(norm, lightDir), 0.0);

  // Blinn-phong subtle specular highlight
  vec3 viewDir = normalize(uCameraPos - vPosition);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(norm, halfDir), 0.0), 24.0) * 0.18;

  float shadowFactor = uUseShadows ? sampleShadow(vLightSpacePos) : 1.0;

  // Floor subtle contact darkening near 0 elevation
  float contact = (vPosition.y < 2.0) ? 0.92 : 1.0;

  vec3 lighting = uAmbientLight + (diff * uLightColor * atten * shadowFactor + spec * atten * shadowFactor) * contact;
  vec3 finalColor = vColor * lighting;

  gl_FragColor = vec4(finalColor, 1.0);
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

function createShader(gl, type, source) {
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

function createProgram(gl, vsSource, fsSource) {
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
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.project = null;
    this.doorsOpen = false;

    // Camera parameters
    this.target = [2000, 1000, 1500];
    this.yaw = Math.PI * 0.28;
    this.pitch = 0.32;
    this.distance = 3800;

    // Room light from ceiling center
    this.lightPos = [2000, 2600, 1500];
    this.lightColor = [1.0, 0.98, 0.92];
    this.ambientLight = [0.38, 0.40, 0.42];

    this.drag = null;
    this.keyState = new Set();
    this.vertexCount = 0;

    this.initGL();
    this.attachEvents();
  }

  initGL() {
    try {
      this.gl = this.canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }) ||
                this.canvas.getContext('experimental-webgl', { antialias: true, preserveDrawingBuffer: true });
    } catch {
      this.gl = null;
    }
    if (!this.gl) return;

    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

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
        ambientLight: gl.getUniformLocation(this.mainProgram, 'uAmbientLight'),
        cameraPos: gl.getUniformLocation(this.mainProgram, 'uCameraPos'),
        shadowMap: gl.getUniformLocation(this.mainProgram, 'uShadowMap'),
        useShadows: gl.getUniformLocation(this.mainProgram, 'uUseShadows'),
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
    this.shadowSize = 1024;
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
    const cy = Math.max(1200, (room.height || 2700) - 100);

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
    this.render();
  }

  buildGeometry() {
    if (!this.gl || !this.project) return;
    const scene = makeScene(this.project, { room: true, allFaces: true, doorsOpen: this.doorsOpen }, null);
    const faces = scene.faces || [];

    const bufferData = [];
    const pushVertex = (p, n, c) => {
      bufferData.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]);
    };

    for (const f of faces) {
      if (!f.points || f.points.length < 3) continue;
      const rgb = hexToRgb(f.rawColor || f.color);
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

      if (f.points.length === 3) {
        pushVertex(f.points[0], norm, rgb);
        pushVertex(f.points[1], norm, rgb);
        pushVertex(f.points[2], norm, rgb);
      } else if (f.points.length === 4) {
        pushVertex(f.points[0], norm, rgb);
        pushVertex(f.points[1], norm, rgb);
        pushVertex(f.points[2], norm, rgb);

        pushVertex(f.points[0], norm, rgb);
        pushVertex(f.points[2], norm, rgb);
        pushVertex(f.points[3], norm, rgb);
      } else {
        // N-gon fan
        for (let i = 1; i < f.points.length - 1; i++) {
          pushVertex(f.points[0], norm, rgb);
          pushVertex(f.points[i], norm, rgb);
          pushVertex(f.points[i + 1], norm, rgb);
        }
      }
    }

    // Add glowing ceiling chandelier / room light fixture
    if (this.lightPos) {
      const lx = this.lightPos[0], ly = this.lightPos[1], lz = this.lightPos[2];
      const r = 45;
      const count = 12;
      const lightColor = [1.0, 0.98, 0.85];
      for (let i = 0; i < count; i++) {
        const a1 = (i / count) * Math.PI * 2, a2 = ((i + 1) / count) * Math.PI * 2;
        const p0 = [lx, ly + 20, lz];
        const p1 = [lx + Math.cos(a1) * r, ly, lz + Math.sin(a1) * r];
        const p2 = [lx + Math.cos(a2) * r, ly, lz + Math.sin(a2) * r];
        const norm = [0, -1, 0];
        pushVertex(p0, norm, lightColor);
        pushVertex(p1, norm, lightColor);
        pushVertex(p2, norm, lightColor);
      }
    }

    this.vertexCount = bufferData.length / 9;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bufferData), gl.STATIC_DRAW);
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
    const pad = 300;
    const orthoProj = new Float32Array(16);
    mat4Ortho(orthoProj, b.minX - pad, b.maxX + pad, b.minZ - pad, b.maxZ + pad, 10, (b.height || 2700) + 1200);

    const lightView = new Float32Array(16);
    const eye = [this.lightPos[0], (b.height || 2700) + 500, this.lightPos[2]];
    const target = [this.lightPos[0], 0, this.lightPos[2]];
    mat4LookAt(lightView, eye, target, [0, 0, -1]);

    const lightSpace = new Float32Array(16);
    mat4Multiply(lightSpace, orthoProj, lightView);
    return lightSpace;
  }

  render() {
    if (!this.gl) return;
    const gl = this.gl;
    if (!this.vertexCount) return;

    const lightSpaceMatrix = this.computeLightSpaceMatrix();

    // 1. Render Shadow Depth Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.shadowProgram);
    gl.uniformMatrix4fv(this.shadowUniforms.lightSpace, false, lightSpaceMatrix);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const stride = 9 * 4;
    gl.enableVertexAttribArray(this.shadowAttribs.position);
    gl.vertexAttribPointer(this.shadowAttribs.position, 3, gl.FLOAT, false, stride, 0);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.disableVertexAttribArray(this.shadowAttribs.position);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 2. Render Main Perspective Pass
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.93, 0.94, 0.91, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.mainProgram);

    // Camera view & projection
    const eye = [
      this.target[0] + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw),
      this.target[1] + this.distance * Math.sin(this.pitch),
      this.target[2] + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw),
    ];

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
    gl.uniform3fv(this.mainUniforms.ambientLight, this.ambientLight);
    gl.uniform3fv(this.mainUniforms.cameraPos, eye);
    gl.uniform1i(this.mainUniforms.useShadows, 1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.uniform1i(this.mainUniforms.shadowMap, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(this.mainAttribs.position);
    gl.enableVertexAttribArray(this.mainAttribs.normal);
    gl.enableVertexAttribArray(this.mainAttribs.color);

    gl.vertexAttribPointer(this.mainAttribs.position, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(this.mainAttribs.normal, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.vertexAttribPointer(this.mainAttribs.color, 3, gl.FLOAT, false, stride, 6 * 4);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    gl.disableVertexAttribArray(this.mainAttribs.position);
    gl.disableVertexAttribArray(this.mainAttribs.normal);
    gl.disableVertexAttribArray(this.mainAttribs.color);
  }

  attachEvents() {
    if (!this.canvas) return;

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
        this.render();
      } else {
        // Pan (Right click or Shift + drag)
        const forward = [Math.sin(this.yaw), 0, Math.cos(this.yaw)];
        const right = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
        const panSpeed = this.distance * 0.001;

        this.target[0] = this.drag.startTarget[0] - right[0] * dx * panSpeed;
        this.target[1] = this.drag.startTarget[1] + dy * panSpeed;
        this.target[2] = this.drag.startTarget[2] - right[2] * dx * panSpeed;
        this.render();
      }
    });

    window.addEventListener('pointerup', e => {
      if (this.drag) {
        this.canvas.releasePointerCapture?.(e.pointerId);
        this.drag = null;
      }
    });

    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const zoomFactor = Math.exp(e.deltaY * 0.0015);
      this.distance = Math.max(300, Math.min(25000, this.distance * zoomFactor));
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
      this.render();
    });
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
