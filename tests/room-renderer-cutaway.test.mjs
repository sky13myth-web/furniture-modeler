import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/engine.js';
import { makeScene } from '../src/renderer.js';
import { isRayOccludedByWall, RoomWebGLRenderer } from '../src/room-renderer-webgl.js';

test('makeScene retains freestanding obstacles during cutaway wall culling', () => {
  const project = {
    room: {
      width: 4000,
      depth: 3000,
      height: 2700,
      wallThickness: 150,
      outline: [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 4000, z: 3000 }, { x: 0, z: 3000 }],
      windows: [
        // Attached obstacle on wall 0 (front wall)
        {
          id: 'wall-pipe',
          kind: 'pipe',
          wallIndex: 0,
          offset: 1000,
          diameter: 110,
          freestanding: false
        },
        // Freestanding obstacle in room center
        {
          id: 'freestanding-pillar',
          kind: 'box',
          wallIndex: -1,
          x: 2000,
          z: 1500,
          width: 400,
          depth: 400,
          height: 2700,
          freestanding: true
        }
      ]
    },
    cabinets: []
  };

  // Camera direction pointing from front to back (+Z direction)
  // Wall 0 has inward normal [0, 0, 1]. In cutaway mode with direction [0, 0, -1],
  // dot(inward, direction) < 0, so Wall 0 is culled as the near wall.
  const cutawayDirection = [0, 0.45, -1];
  const options = { room: true, allFaces: false };

  const scene = makeScene(project, options, cutawayDirection);

  // Attached obstacle on the cut wall should be culled
  const hasWallPipe = scene.faces.some(f => f.obstacleId === 'wall-pipe');
  assert.equal(hasWallPipe, false, 'Attached obstacle on cut wall should be culled');

  // Freestanding obstacle should be RETAINED and visible
  const hasFreestandingPillar = scene.faces.some(f => f.obstacleId === 'freestanding-pillar');
  assert.equal(hasFreestandingPillar, true, 'Freestanding obstacle must remain visible in cutaway mode');
});

test('isRayOccludedByWall accurately detects wall occlusion along ray path', () => {
  // Scenario 1: AABB wall between camera (origin) and cabinet
  const rayTowardWall = {
    origin: [2000, 1000, -1000],
    dir: [0, 0, 1] // shooting along +Z
  };

  const wallAABB = {
    min: [1000, 0, 0],
    max: [3000, 2700, 200]
  };

  // Cabinet at z = 1500 (behind the wall) -> Wall is at z=0..200 (in front of cabinet)
  assert.equal(isRayOccludedByWall(rayTowardWall, wallAABB, 2500), true, 'Wall between camera and cabinet should occlude');

  // Cabinet at z = -500 (in front of the wall) -> Ray reaches cabinet before wall
  assert.equal(isRayOccludedByWall(rayTowardWall, wallAABB, 500), false, 'Cabinet in front of wall should not be occluded');

  // Ray shooting away (-Z)
  const rayAway = {
    origin: [2000, 1000, -1000],
    dir: [0, 0, -1]
  };
  assert.equal(isRayOccludedByWall(rayAway, wallAABB, 2500), false, 'Ray pointing away should not be occluded');

  // Ray missing horizontally
  const rayMiss = {
    origin: [5000, 1000, -1000],
    dir: [0, 0, 1]
  };
  assert.equal(isRayOccludedByWall(rayMiss, wallAABB, 2500), false, 'Ray missing wall should not be occluded');

  // Scenario 2: Wall segment format { start, end, bottom, top, thickness }
  const wallSegment = {
    start: { x: 0, z: 0 },
    end: { x: 4000, z: 0 },
    bottom: 0,
    top: 2700,
    thickness: 150
  };

  assert.equal(isRayOccludedByWall(rayTowardWall, wallSegment, 2500), true, 'Wall segment between camera and cabinet should occlude');
  assert.equal(isRayOccludedByWall(rayTowardWall, wallSegment, 200), false, 'Cabinet in front of wall segment should not be occluded');
});

test('RoomWebGLRenderer manages decoupled wall and furniture buffers and cleans up on destroy', () => {
  const buffersCreated = [];
  const buffersDeleted = [];

  const mockGL = {
    createBuffer: () => {
      const buf = { id: `buf-${buffersCreated.length + 1}` };
      buffersCreated.push(buf);
      return buf;
    },
    deleteBuffer: (buf) => {
      buffersDeleted.push(buf);
    },
    bindBuffer: () => {},
    bufferData: () => {},
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    deleteProgram: () => {},
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    useProgram: () => {},
    viewport: () => {},
    enable: () => {},
    disable: () => {},
    cullFace: () => {},
    depthFunc: () => {},
    blendFunc: () => {},
    clearColor: () => {},
    clear: () => {},
    drawArrays: () => {},
    createTexture: () => ({}),
    deleteTexture: () => {},
    bindTexture: () => {},
    texParameteri: () => {},
    texImage2D: () => {},
    createRenderbuffer: () => ({}),
    bindRenderbuffer: () => {},
    renderbufferStorage: () => {},
    deleteRenderbuffer: () => {},
    createFramebuffer: () => ({}),
    bindFramebuffer: () => {},
    framebufferTexture2D: () => {},
    framebufferRenderbuffer: () => {},
    deleteFramebuffer: () => {},
    getExtension: () => null,
    STATIC_DRAW: 35044,
    ARRAY_BUFFER: 34962,
    COLOR_ATTACHMENT0: 36064,
    DEPTH_ATTACHMENT: 36096,
    FRAMEBUFFER: 36160,
    RENDERBUFFER: 36161,
    DEPTH_COMPONENT16: 33189,
    TEXTURE_2D: 3553,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    NEAREST: 9728,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    CLAMP_TO_EDGE: 33071
  };

  const canvas = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    getContext: () => mockGL,
    width: 800,
    height: 600
  };

  const renderer = new RoomWebGLRenderer(canvas);

  // Both buffers should be allocated in initGL
  assert.ok(renderer.wallBuffer !== null, 'wallBuffer should be created');
  assert.ok(renderer.furnitureBuffer !== null, 'furnitureBuffer should be created');
  assert.ok(renderer.vbo !== null, 'vbo should be created');

  const wallBuf = renderer.wallBuffer;
  const furnBuf = renderer.furnitureBuffer;
  const vbo = renderer.vbo;

  // Verify buffers are cleaned up in destroy()
  renderer.destroy();
  assert.ok(buffersDeleted.includes(wallBuf), 'wallBuffer should be deleted on destroy');
  assert.ok(buffersDeleted.includes(furnBuf), 'furnitureBuffer should be deleted on destroy');
  assert.ok(buffersDeleted.includes(vbo), 'vbo should be deleted on destroy');
});

test('RoomWebGLRenderer pickCabinet blocks selection when cabinet is occluded by uncut wall', () => {
  const project = createDefaultProject();
  const mockCanvas = {
    width: 800,
    height: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: () => {},
  };
  const renderer = new RoomWebGLRenderer(mockCanvas);
  renderer.setProject(project);

  const cab = project.cabinets[0];
  renderer.target = [cab.x + cab.width / 2, cab.y + cab.height / 2, cab.z + cab.depth / 2];

  // Camera outside room behind Wall 0 (yaw = Math.PI, looking from z < 0 towards cabinet at z=10)
  // Wall 0 (at z = 0) is solid and uncut ('none')
  renderer.wallMode = 'none';
  renderer.distance = 2500;
  renderer.pitch = 0;
  renderer.yaw = Math.PI;

  // Ray hits the uncut front wall (z=0) before reaching the cabinet (z=10)
  const hitId = renderer.pickCabinet(400, 300);
  assert.equal(hitId, null, 'Solid uncut exterior wall should occlude cabinet click-through');
});
