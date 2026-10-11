import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { MATERIAL_PRESETS, DEFAULT_MATERIAL_PRESETS } from '../src/standards.js';
import {
  YILDIZ_MATERIAL_PRESETS,
  classifyDecorCategory,
  isKapakPanel,
  isKapakGloss,
  isKapakMatt
} from '../src/yildiz-catalog.js';
import { handleTextureRequest, FALLBACK_JPEG } from '../server.mjs';
import {
  resolveFaceTexture,
  RoomWebGLRenderer,
  FRAGMENT_SHADER_SOURCE
} from '../src/room-renderer-webgl.js';
import { createDefaultProject } from '../src/engine.js';

test('all presets have collection, category, previewUrl, and textureUrl', () => {
  const allowedCategories = new Set(['wood', 'marble', 'concrete', 'solid', 'metal', 'textile']);
  const allowedCollections = new Set(['front-panel', 'mdflam']);

  assert.ok(MATERIAL_PRESETS.length > 200);

  for (const p of MATERIAL_PRESETS) {
    assert.ok(p.previewUrl, `Preset ${p.id} must have previewUrl`);
    assert.ok(p.textureUrl, `Preset ${p.id} must have textureUrl`);
    assert.ok(allowedCollections.has(p.collection), `Preset ${p.id} has valid collection: ${p.collection}`);
    assert.ok(allowedCategories.has(p.category), `Preset ${p.id} has valid category: ${p.category}`);

    assert.ok(
      p.textureUrl.startsWith('/textures/yildiz/') || p.textureUrl.startsWith('/api/texture/'),
      `Preset ${p.id} textureUrl format: ${p.textureUrl}`
    );
  }

  for (const p of DEFAULT_MATERIAL_PRESETS) {
    assert.ok(p.previewUrl, `Default preset ${p.id} must have previewUrl`);
    assert.ok(p.textureUrl, `Default preset ${p.id} must have textureUrl`);
    assert.ok(allowedCollections.has(p.collection));
    assert.ok(allowedCategories.has(p.category));
  }
});

test('decor classification helpers classify decor types accurately', () => {
  assert.equal(isKapakPanel({ decorCode: 'HG_068' }), true);
  assert.equal(isKapakPanel({ decorCode: 'MAT_068' }), true);
  assert.equal(isKapakPanel({ decorCode: 'L_204' }), true);
  assert.equal(isKapakPanel({ decorCode: 'VT_068', sheetWidth: 2100 }), false);

  assert.equal(isKapakGloss({ decorCode: 'HG_068' }), true);
  assert.equal(isKapakGloss({ decorCode: 'MAT_068' }), false);
  assert.equal(isKapakMatt({ decorCode: 'MAT_068' }), true);
  assert.equal(isKapakMatt({ decorCode: 'HG_068' }), false);

  // Matt acrylic panel must be matt, NOT gloss
  assert.equal(isKapakMatt({ decorCode: 'L_ACR_MAT_263', type: 'MDF с матовым покрытием' }), true);
  assert.equal(isKapakGloss({ decorCode: 'L_ACR_MAT_263', type: 'MDF с матовым покрытием' }), false);
  assert.equal(isKapakGloss({ decorCode: 'L_ACR_237', type: 'MDF с глянцевым покрытием' }), true);

  assert.equal(classifyDecorCategory({ name: 'Meşe Valley', decorCode: 'YT_10E' }), 'wood');
  assert.equal(classifyDecorCategory({ name: 'Mermer Calacatta', decorCode: 'MR_001' }), 'marble');
  assert.equal(classifyDecorCategory({ name: 'Beton Gri', decorCode: 'BT_002' }), 'concrete');
  assert.equal(classifyDecorCategory({ name: 'Beyaz Düz', decorCode: 'VT_068' }), 'solid');
  assert.equal(classifyDecorCategory({ name: 'Keten Metalik', decorCode: 'TX_003' }), 'metal');
  assert.equal(classifyDecorCategory({ name: 'Dacron Grey', decorCode: 'YT_39C' }), 'textile');
});

test('handleTextureRequest handles routes, local cache, and offline fallback', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'yildiz-test-'));

  try {
    // 1. Non-matching path returns false
    const mockRes1 = {
      writeHead() {},
      end() {}
    };
    const handled1 = await handleTextureRequest('/other/path.js', mockRes1, tmpDir);
    assert.equal(handled1, false);

    // 2. Empty / invalid code returns 400
    let status400 = 0;
    const mockRes2 = {
      writeHead(status) { status400 = status; },
      end() {}
    };
    const handled2 = await handleTextureRequest('/textures/yildiz/???.jpg', mockRes2, tmpDir);
    assert.equal(handled2, true);
    assert.equal(status400, 400);

    // 3. Local cache hit
    const dummyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await writeFile(path.join(tmpDir, 'TEST_DECOR.jpg'), dummyJpeg);

    let status200 = 0;
    let headers200 = {};
    let body200 = null;
    const mockRes3 = {
      writeHead(status, headers) {
        status200 = status;
        headers200 = headers;
      },
      end(data) {
        body200 = data;
      }
    };
    const handled3 = await handleTextureRequest('/textures/yildiz/TEST_DECOR.jpg', mockRes3, tmpDir);
    assert.equal(handled3, true);
    assert.equal(status200, 200);
    assert.equal(headers200['Content-Type'], 'image/jpeg');
    assert.equal(headers200['Access-Control-Allow-Origin'], '*');
    assert.deepEqual(body200, dummyJpeg);

    // 4. Offline / non-existent decor falls back to neutral 1x1 JPEG with 200 status and CORS
    let statusFallback = 0;
    let headersFallback = {};
    let bodyFallback = null;
    const mockRes4 = {
      writeHead(status, headers) {
        statusFallback = status;
        headersFallback = headers;
      },
      end(data) {
        bodyFallback = data;
      }
    };
    const handled4 = await handleTextureRequest('/api/texture/NON_EXISTENT_DECOR_9999.jpg', mockRes4, tmpDir);
    assert.equal(handled4, true);
    assert.equal(statusFallback, 200);
    assert.equal(headersFallback['Content-Type'], 'image/jpeg');
    assert.equal(headersFallback['Access-Control-Allow-Origin'], '*');
    assert.deepEqual(bodyFallback, FALLBACK_JPEG);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('resolveFaceTexture correctly resolves textures from faces, materials, and cabinets', () => {
  const project = createDefaultProject();
  project.materials = [
    { id: 'mat-carcass', name: 'Oak Carcass', textureUrl: '/textures/yildiz/YT_10E.jpg' },
    { id: 'mat-front', name: 'High Gloss White', textureUrl: '/textures/yildiz/HG_068.jpg' },
    { id: 'mat-plain', name: 'Plain No Texture' }
  ];

  const cab = project.cabinets[0];
  cab.materialId = 'mat-carcass';
  cab.frontMaterialId = 'mat-front';

  // 1. Direct textureUrl on face
  const faceDirect = { textureUrl: '/textures/custom.jpg' };
  assert.equal(resolveFaceTexture(faceDirect, project), '/textures/custom.jpg');

  // 2. Material ID on face
  const faceMat = { materialId: 'mat-carcass' };
  assert.equal(resolveFaceTexture(faceMat, project), '/textures/yildiz/YT_10E.jpg');

  // 3. Cabinet front face
  const faceFront = { id: cab.id, component: 'front' };
  assert.equal(resolveFaceTexture(faceFront, project), '/textures/yildiz/HG_068.jpg');

  // 4. Cabinet carcass face
  const faceBody = { id: cab.id, component: 'side' };
  assert.equal(resolveFaceTexture(faceBody, project), '/textures/yildiz/YT_10E.jpg');

  // 5. Room wall or obstacle returns null
  assert.equal(resolveFaceTexture({ room: true }, project), null);
  assert.equal(resolveFaceTexture({ floor: true }, project), null);
  assert.equal(resolveFaceTexture({ window: true }, project), null);
  assert.equal(resolveFaceTexture({ obstacle: true }, project), null);
});

test('WebGL fragment shader and RoomWebGLRenderer support texture mapping and uniforms', () => {
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('uniform sampler2D uMaterialTexture;'));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('uniform bool uHasTexture;'));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('texture2D(uMaterialTexture'));

  const renderer = new RoomWebGLRenderer(null);
  assert.ok(typeof renderer.loadTexture === 'function');
  assert.ok(renderer.textureCache instanceof Map);

  // In simulated environment with mock gl
  const mockGl = {
    createTexture() { return {}; },
    bindTexture() {},
    texImage2D() {},
    texParameteri() {}
  };
  renderer.gl = mockGl;
  const tex = renderer.loadTexture('/textures/yildiz/YT_10E.jpg');
  assert.ok(tex);
  assert.equal(typeof tex.loaded, 'boolean');
});

test('local downloaded texture samples exist in assets/textures and are linked in presets', async () => {
  const fs = await import('node:fs');
  const cacheDirPath = path.resolve('assets', 'textures');
  assert.ok(fs.existsSync(cacheDirPath), 'assets/textures directory must exist');

  const files = fs.readdirSync(cacheDirPath);
  assert.ok(files.length >= 230, `Expected at least 230 texture files, found ${files.length}`);

  // Check key decors exist
  assert.ok(fs.existsSync(path.join(cacheDirPath, 'VT_068.jpg')), 'VT_068.jpg exists');
  assert.ok(fs.existsSync(path.join(cacheDirPath, 'YT_10E.jpg')), 'YT_10E.jpg exists');
  assert.ok(fs.existsSync(path.join(cacheDirPath, 'VT_037.jpg')), 'VT_037.jpg exists');
  assert.ok(fs.existsSync(path.join(cacheDirPath, 'MAT_068.jpg')), 'MAT_068.jpg exists');

  for (const p of DEFAULT_MATERIAL_PRESETS) {
    assert.ok(p.localTextureUrl, `Default preset ${p.id} must have localTextureUrl`);
    assert.ok(p.localTextureUrl.startsWith('./assets/textures/'));
  }
});


