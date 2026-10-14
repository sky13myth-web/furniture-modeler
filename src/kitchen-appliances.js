/**
 * Kitchen Appliances Module
 * Complete 3D CAD/visual geometry and specifications for built-in and
 * freestanding kitchen appliances:
 * - Oven (Духовой шкаф, built-in)
 * - Cooktop / Hob (Плита / Варочная панель)
 * - Microwave oven (Микроволновая печь, built-in & freestanding)
 * - Refrigerator (Холодильник: встраиваемый и отдельностоящий)
 * - Dishwasher (Посудомоечная машина: встраиваемая и отдельностоящая)
 * - Sink (Раковина: круглая и прямоугольная с настраиваемыми размерами)
 * - Range hood (Вытяжка: встраиваемая и настенная купольная)
 */

export const APPLIANCE_PRESETS = {
  oven: {
    type: 'oven',
    name: 'Духовой шкаф',
    nameTr: 'Ankastre fırın',
    nameEn: 'Built-in oven',
    width: 595,
    height: 595,
    depth: 550,
    builtin: true,
    clearances: { side: 5, top: 5, rear: 30 }
  },
  cooktop: {
    type: 'cooktop',
    name: 'Варочная панель',
    nameTr: 'Ocak',
    nameEn: 'Cooktop',
    width: 590,
    height: 45,
    depth: 520,
    builtin: true,
    clearances: { side: 20, top: 10, rear: 20 }
  },
  microwave: {
    type: 'microwave',
    name: 'Микроволновая печь',
    nameTr: 'Mikrodalga fırın',
    nameEn: 'Microwave oven',
    width: 595,
    height: 382,
    depth: 320,
    builtin: true,
    clearances: { side: 5, top: 5, rear: 20 }
  },
  'fridge-builtin': {
    type: 'fridge-builtin',
    name: 'Встраиваемый холодильник',
    nameTr: 'Ankastre buzdolabı',
    nameEn: 'Built-in refrigerator',
    width: 560,
    height: 1775,
    depth: 550,
    builtin: true,
    clearances: { side: 10, top: 20, rear: 50 }
  },
  'fridge-freestanding': {
    type: 'fridge-freestanding',
    name: 'Отдельностоящий холодильник',
    nameTr: 'Solo buzdolabı',
    nameEn: 'Freestanding refrigerator',
    width: 600,
    height: 1850,
    depth: 650,
    builtin: false,
    clearances: { side: 25, top: 30, rear: 50 }
  },
  'dishwasher-builtin': {
    type: 'dishwasher-builtin',
    name: 'Встраиваемая посудомоечная машина',
    nameTr: 'Ankastre bulaşık makinesi',
    nameEn: 'Built-in dishwasher',
    width: 598,
    height: 815,
    depth: 550,
    builtin: true,
    clearances: { side: 2, top: 5, rear: 25 }
  },
  'dishwasher-freestanding': {
    type: 'dishwasher-freestanding',
    name: 'Отдельностоящая посудомоечная машина',
    nameTr: 'Solo bulaşık makinesi',
    nameEn: 'Freestanding dishwasher',
    width: 600,
    height: 850,
    depth: 600,
    builtin: false,
    clearances: { side: 10, top: 10, rear: 30 }
  },
  'sink-round': {
    type: 'sink-round',
    name: 'Раковина круглая',
    nameTr: 'Yuvarlak evye',
    nameEn: 'Round sink',
    width: 510,
    height: 180,
    depth: 510,
    diameter: 510,
    bowlDiameter: 410,
    builtin: true,
    sinkShape: 'round',
    clearances: { side: 30, top: 0, rear: 30 }
  },
  'sink-rectangular': {
    type: 'sink-rectangular',
    name: 'Раковина прямоугольная',
    nameTr: 'Dikdörtgen evye',
    nameEn: 'Rectangular sink',
    width: 780,
    height: 190,
    depth: 500,
    builtin: true,
    sinkShape: 'rectangular',
    bowlWidth: 400,
    bowlDepth: 400,
    hasDrainer: true,
    drainerSide: 'right',
    clearances: { side: 30, top: 0, rear: 30 }
  },
  'hood-builtin': {
    type: 'hood-builtin',
    name: 'Встраиваемая вытяжка',
    nameTr: 'Ankastre davlumbaz',
    nameEn: 'Built-in range hood',
    width: 600,
    height: 380,
    depth: 300,
    builtin: true,
    clearances: { side: 0, top: 0, rear: 0 }
  }
};

/** Get default clearance rules for any appliance type */
export function getApplianceGapDefaults(type) {
  if (APPLIANCE_PRESETS[type]?.clearances) {
    return { ...APPLIANCE_PRESETS[type].clearances };
  }
  if (type === 'washer') return { side: 25, top: 25, rear: 50 };
  if (type === 'dryer') return { side: 30, top: 25, rear: 50 };
  if (type === 'boiler') return { side: 15, top: 30, rear: 20 };
  return { side: 0, top: 0, rear: 0 };
}

/** Get default dimensions for any appliance type */
export function getApplianceDefaultDimensions(type) {
  const p = APPLIANCE_PRESETS[type];
  if (p) {
    return {
      type,
      label: p.name,
      width: p.width,
      height: p.height,
      depth: p.depth,
      ...(p.sinkShape ? { sinkShape: p.sinkShape, bowlDiameter: p.bowlDiameter, bowlWidth: p.bowlWidth, bowlDepth: p.bowlDepth, hasDrainer: p.hasDrainer, drainerSide: p.drainerSide } : {})
    };
  }
  if (type === 'washer') return { type, label: 'Стиральная машина', width: 600, height: 850, depth: 600 };
  if (type === 'dryer') return { type, label: 'Сушильная машина', width: 600, height: 850, depth: 600 };
  if (type === 'boiler') return { type, label: 'Бойлер', width: 450, height: 750, depth: 450 };
  return { type, label: 'Своё оборудование', width: 600, height: 600, depth: 550 };
}

/** Helper to generate 2D circle points on XY plane */
function circle2D(cx, cy, r, segments = 24) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const rad = (i * 2 * Math.PI) / segments;
    pts.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad)]);
  }
  return pts;
}

/**
 * Render detailed, realistic 3D geometry for any kitchen appliance.
 */
export function renderKitchenAppliance({
  appliance,
  bounds: { x, y, z, width: w, height: h, depth: d },
  cabinetId,
  sectionId,
  renderContext: { box, rawBox, face, line, cylinderX, cylinderY, cylinderZ, cylinderAxis }
}) {
  const type = appliance.type;
  const extras = { component: 'appliance', sectionId, cabinetId, applianceType: type, noCutout: true };
  const detailExtras = { ...extras, component: 'appliance-detail' };

  // Base appliance materials
  const darkSteel = '#2b2e30';
  const inox = '#d2dada';
  const inoxBright = '#e8eff2';
  const blackGlass = '#16191b';
  const tintedGlass = '#1e2428';
  const ledCyan = '#4fc3f7';
  const ledRed = '#ff5722';

  // Helper: 3D tube segment between two arbitrary 3D points (works in both Canvas & WebGL)
  const tube3D = (p0, p1, radius, color, ext = detailExtras, segs = 12) => {
    if (typeof cylinderAxis === 'function') {
      cylinderAxis(p0, p1, radius, color, ext, cabinetId, segs);
      return;
    }
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 0) || !(radius > 0)) return;
    const kx = dx / len, ky = dy / len, kz = dz / len;
    const rx = Math.abs(ky) < 0.9 ? 0 : 1, ry = Math.abs(ky) < 0.9 ? 1 : 0, rz = 0;
    let ux = ky * rz - kz * ry, uy = kz * rx - kx * rz, uz = kx * ry - ky * rx;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen; uy /= uLen; uz /= uLen;
    const vx = ky * uz - kz * uy, vy = kz * ux - kx * uz, vz = kx * uy - ky * ux;
    const ring0 = [], ring1 = [];
    for (let i = 0; i < segs; i++) {
      const a = (i * 2 * Math.PI) / segs;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = ux * ca + vx * sa, ny = uy * ca + vy * sa, nz = uz * ca + vz * sa;
      ring0.push([p0[0] + nx * radius, p0[1] + ny * radius, p0[2] + nz * radius, nx, ny, nz]);
      ring1.push([p1[0] + nx * radius, p1[1] + ny * radius, p1[2] + nz * radius]);
    }
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      const r0i = ring0[i], r0j = ring0[j], r1i = ring1[i], r1j = ring1[j];
      face([[r0i[0], r0i[1], r0i[2]], [r0j[0], r0j[1], r0j[2]], r1j, r1i], color, [r0i[3], r0i[4], r0i[5]], cabinetId, ext);
    }
  };

  // Helper: 3D flat or raised annular ring on horizontal XZ plane (y to y + hRing)
  const ring3DY = (cx, yBase, cz, rInner, rOuter, hRing, color, ext = detailExtras, segs = 24) => {
    const yTop = yBase + hRing;
    for (let i = 0; i < segs; i++) {
      const a0 = (i * 2 * Math.PI) / segs;
      const a1 = ((i + 1) * 2 * Math.PI) / segs;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p0i = [cx + rInner * c0, yTop, cz + rInner * s0];
      const p1i = [cx + rInner * c1, yTop, cz + rInner * s1];
      const p1o = [cx + rOuter * c1, yTop, cz + rOuter * s1];
      const p0o = [cx + rOuter * c0, yTop, cz + rOuter * s0];
      face([p0i, p0o, p1o, p1i], color, [0, 1, 0], cabinetId, ext);
      if (hRing >= 1.2) {
        const b0o = [cx + rOuter * c0, yBase, cz + rOuter * s0];
        const b1o = [cx + rOuter * c1, yBase, cz + rOuter * s1];
        face([b0o, b1o, p1o, p0o], color, [(c0 + c1) / 2, 0, (s0 + s1) / 2], cabinetId, ext);
        const b0i = [cx + rInner * c0, yBase, cz + rInner * s0];
        const b1i = [cx + rInner * c1, yBase, cz + rInner * s1];
        face([b1i, b0i, p0i, p1i], color, [-(c0 + c1) / 2, 0, -(s0 + s1) / 2], cabinetId, ext);
      }
    }
  };

  // Helper: 3D circular bezel ring on vertical XY front plane (zBase to zBase + dRing)
  const ring3DZ = (cx, cy, zBase, rInner, rOuter, dRing, color, ext = detailExtras, segs = 28) => {
    const zFront = zBase + dRing;
    for (let i = 0; i < segs; i++) {
      const a0 = (i * 2 * Math.PI) / segs;
      const a1 = ((i + 1) * 2 * Math.PI) / segs;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p0i = [cx + rInner * c0, cy + rInner * s0, zFront];
      const p1i = [cx + rInner * c1, cy + rInner * s1, zFront];
      const p1o = [cx + rOuter * c1, cy + rOuter * s1, zFront];
      const p0o = [cx + rOuter * c0, cy + rOuter * s0, zFront];
      face([p0i, p0o, p1o, p1i], color, [0, 0, 1], cabinetId, ext);
      if (dRing >= 1.5) {
        const b0o = [cx + rOuter * c0, cy + rOuter * s0, zBase];
        const b1o = [cx + rOuter * c1, cy + rOuter * s1, zBase];
        face([b0o, b1o, p1o, p0o], color, [(c0 + c1) / 2, (s0 + s1) / 2, 0], cabinetId, ext);
        const b0i = [cx + rInner * c0, cy + rInner * s0, zBase];
        const b1i = [cx + rInner * c1, cy + rInner * s1, zBase];
        face([b1i, b0i, p0i, p1i], color, [-(c0 + c1) / 2, -(s0 + s1) / 2, 0], cabinetId, ext);
      }
    }
  };

  // Helper: 3D high-arc gooseneck mixer faucet (Смеситель)
  const renderGooseneckFaucet = (tapX, tapY, tapZ) => {
    // Escutcheon base collar
    cylinderY(tapX, tapY, tapZ, 8, 44, inox, cabinetId, detailExtras);
    cylinderY(tapX, tapY + 8, tapZ, 12, 36, inoxBright, cabinetId, detailExtras);
    // Vertical mixer column
    cylinderY(tapX, tapY + 20, tapZ, 135, 24, inoxBright, cabinetId, detailExtras);
    // Side single-lever cartridge housing + angled lever handle
    cylinderX(tapX + 10, tapY + 42, tapZ, 18, 20, inox, cabinetId, detailExtras);
    tube3D([tapX + 26, tapY + 42, tapZ], [tapX + 34, tapY + 82, tapZ + 18], 4.2, inoxBright, detailExtras, 10);
    // Multi-segment smooth 3D gooseneck arch curving forward (+Z) over bowl
    const spoutBaseY = tapY + 152;
    const arcPts = [
      [tapX, spoutBaseY, tapZ],
      [tapX, spoutBaseY + 34, tapZ + 12],
      [tapX, spoutBaseY + 56, tapZ + 38],
      [tapX, spoutBaseY + 58, tapZ + 72],
      [tapX, spoutBaseY + 38, tapZ + 102],
      [tapX, spoutBaseY + 4, tapZ + 116],
      [tapX, spoutBaseY - 22, tapZ + 118]
    ];
    for (let i = 0; i < arcPts.length - 1; i++) {
      tube3D(arcPts[i], arcPts[i + 1], 10.5, inoxBright, detailExtras, 12);
      line(arcPts[i], arcPts[i + 1], inoxBright, 5, cabinetId, detailExtras);
    }
    // Aerator nozzle at spout tip
    cylinderY(tapX, spoutBaseY - 30, tapZ + 118, 9, 21, inox, cabinetId, detailExtras);
    cylinderY(tapX, spoutBaseY - 31.5, tapZ + 118, 2, 16, '#2b3033', cabinetId, detailExtras);
    line([tapX + 12, tapY + 42, tapZ], [tapX + 34, tapY + 82, tapZ + 18], inoxBright, 4.5, cabinetId, detailExtras);
  };

  if (type === 'oven') {
    // ----------------------------------------------------
    // Built-in Oven (Духовой шкаф)
    // ----------------------------------------------------
    // Main chassis inside niche
    box(x, y, z, w, h, d - 18, darkSteel, cabinetId, extras);

    const doorH = Math.max(200, h - 108);
    const fasciaH = h - doorH;
    const frontZ = z + d - 18;

    // Upper stainless + black glass control fascia
    box(x + 2, y + doorH + 2, frontZ, w - 4, fasciaH - 2, 18, '#32373b', cabinetId, detailExtras);
    box(x + 2, y + h - 22, frontZ + 18, w - 4, 20, 2, inox, cabinetId, detailExtras);
    box(x + 2, y + doorH + 2, frontZ + 18, w - 4, fasciaH - 24, 2, blackGlass, cabinetId, detailExtras);

    // Center OLED display with 3D glowing clock digits & icons
    const dispW = Math.min(130, w * 0.24), dispH = 38;
    const dispX = x + (w - dispW) / 2, dispY = y + doorH + (fasciaH - dispH) / 2 - 2;
    box(dispX - 2, dispY - 2, frontZ + 19.5, dispW + 4, dispH + 4, 1.5, '#454c50', cabinetId, detailExtras);
    box(dispX, dispY, frontZ + 20.5, dispW, dispH, 1.2, '#0a0c0e', cabinetId, detailExtras);
    // 3D glowing digital clock bars ("12:30")
    const cyDisp = dispY + dispH / 2;
    for (const dx of [-24, -10, 8, 22]) {
      box(dispX + dispW / 2 + dx - 4, cyDisp - 6, frontZ + 21.8, 8, 12, 0.8, ledCyan, cabinetId, detailExtras);
    }
    box(dispX + dispW / 2 - 1, cyDisp + 2, frontZ + 21.8, 2.5, 2.5, 0.8, ledCyan, cabinetId, detailExtras);
    box(dispX + dispW / 2 - 1, cyDisp - 5, frontZ + 21.8, 2.5, 2.5, 0.8, ledCyan, cabinetId, detailExtras);
    line([dispX + 15, cyDisp, frontZ + 22.2], [dispX + dispW - 15, cyDisp, frontZ + 22.2], ledCyan, 2.5, cabinetId, detailExtras);

    // Touch sensor buttons beside display
    for (const bx of [dispX - 38, dispX - 20, dispX + dispW + 14, dispX + dispW + 32]) {
      box(bx, cyDisp - 3, frontZ + 20.6, 8, 6, 0.8, '#78848a', cabinetId, detailExtras);
    }

    // Pop-out rotary selector knobs (left & right) with illuminated collar
    for (const kx of [x + 68, x + w - 68]) {
      cylinderZ(kx, cyDisp, frontZ + 19.5, 3, 38, '#555e63', cabinetId, detailExtras);
      cylinderZ(kx, cyDisp, frontZ + 22.5, 15, 32, inoxBright, cabinetId, detailExtras);
      cylinderZ(kx, cyDisp, frontZ + 37.5, 1.5, 28, '#262b2e', cabinetId, detailExtras);
      box(kx - 1.5, cyDisp + 4, frontZ + 38, 3, 10, 1.5, inoxBright, cabinetId, detailExtras);
      line([kx, cyDisp + 4, frontZ + 39.5], [kx, cyDisp + 13, frontZ + 39.5], '#1a1a1a', 1.8, cabinetId, detailExtras);
    }

    // Lower double-glazed oven door with stainless side trims
    const winW = Math.max(120, w - 110);
    const winH = Math.max(100, doorH - 96);
    const winX = x + (w - winW) / 2;
    const winY = y + 42;

    // Dark recessed baking cavity behind window
    box(winX - 4, winY - 4, frontZ - 6, winW + 8, winH + 8, 6, '#141719', cabinetId, detailExtras);
    // Warm amber interior oven glow strip at top of cavity + grilling element
    box(winX + 12, winY + winH - 12, frontZ - 2, winW - 24, 5, 4, '#ffb74d', cabinetId, detailExtras);
    // 3D baking tray (противень) and 3D wire rack inside cavity
    const rackY1 = winY + winH * 0.32;
    const rackY2 = winY + winH * 0.62;
    box(winX + 8, rackY1, frontZ - 3, winW - 16, 8, 12, '#3c4246', cabinetId, detailExtras);
    box(winX + 8, rackY2, frontZ - 2, winW - 16, 3.5, 10, '#9aa4a8', cabinetId, detailExtras);
    for (let gy = winY + 25; gy < winY + winH - 15; gy += 40) {
      line([winX + 15, gy, frontZ + 19], [winX + winW - 15, gy, frontZ + 19], '#5c6366', 1.2, cabinetId, detailExtras);
    }

    // Door frame around window (4 segments so cavity depth shows through)
    box(x + 2, y + 2, frontZ, w - 4, winY - (y + 2), 20, blackGlass, cabinetId, detailExtras);
    box(x + 2, winY + winH, frontZ, w - 4, (y + doorH - 2) - (winY + winH), 20, blackGlass, cabinetId, detailExtras);
    box(x + 2, winY, frontZ, winX - (x + 2), winH, 20, blackGlass, cabinetId, detailExtras);
    box(winX + winW, winY, frontZ, (x + w - 2) - (winX + winW), winH, 20, blackGlass, cabinetId, detailExtras);
    // Stainless vertical edge trims on door
    box(x + 2, y + 2, frontZ + 18.5, 22, doorH - 4, 2, inox, cabinetId, detailExtras);
    box(x + w - 24, y + 2, frontZ + 18.5, 22, doorH - 4, 2, inox, cabinetId, detailExtras);
    // Inner window glass pane + bevel trim
    box(winX, winY, frontZ + 16, winW, winH, 2, tintedGlass, cabinetId, detailExtras);

    // Wide brushed-steel bar handle + standoffs
    const handleW = w * 0.78;
    const handleY = y + doorH - 26;
    const handleZ = frontZ + 44;
    for (const hx of [x + (w - handleW) / 2 + 18, x + (w + handleW) / 2 - 18]) {
      box(hx - 7, handleY - 7, frontZ + 20, 14, 14, 24, '#889296', cabinetId, detailExtras);
    }
    box(x + (w - handleW) / 2, handleY - 7, handleZ - 4, handleW, 14, 10, inoxBright, cabinetId, detailExtras);
  } else if (type === 'cooktop') {
    // ----------------------------------------------------
    // Cooktop / Hob (Плита / Варочная панель)
    // ----------------------------------------------------
    // Sub-countertop induction chassis (drops into countertop cutout)
    box(x + 20, y - 34, z + 20, Math.max(60, w - 40), 34, Math.max(60, d - 40), darkSteel, cabinetId, extras);

    // Ceramic glass top plate sitting on countertop with stainless bevel frame
    const plateH = 6;
    box(x - 1.5, y, z - 1.5, w + 3, plateH - 1, d + 3, inox, cabinetId, detailExtras);
    box(x, y + 0.5, z, w, plateH, d, blackGlass, cabinetId, extras);
    const topY = y + plateH + 0.6;

    // Beveled perimeter lines
    line([x, topY, z], [x + w, topY, z], '#4a5054', 1.2, cabinetId, detailExtras);
    line([x + w, topY, z], [x + w, topY, z + d], '#4a5054', 1.2, cabinetId, detailExtras);
    line([x + w, topY, z + d], [x, topY, z + d], '#4a5054', 1.2, cabinetId, detailExtras);
    line([x, topY, z + d], [x, topY, z], '#4a5054', 1.2, cabinetId, detailExtras);

    // 4 3D Induction / Ceramic cooking zones (visible in both WebGL and Canvas)
    const burners = [
      { cx: x + w * 0.27, cz: z + d - 145, r: Math.min(82, w * 0.14), dual: true, active: true },
      { cx: x + w * 0.27, cz: z + 130, r: Math.min(64, w * 0.11), dual: false, active: false },
      { cx: x + w * 0.73, cz: z + 140, r: Math.min(76, w * 0.13), dual: true, active: false },
      { cx: x + w * 0.73, cz: z + d - 140, r: Math.min(56, w * 0.095), dual: false, active: true }
    ];

    for (const b of burners) {
      // 3D outer ceramic ring
      ring3DY(b.cx, topY, b.cz, b.r - 3.5, b.r, 0.7, '#6d777c', detailExtras, 24);
      // Subtle glowing inner ring on active zones
      if (b.active) {
        ring3DY(b.cx, topY, b.cz, b.r * 0.74, b.r * 0.82, 0.5, '#b8331a', detailExtras, 20);
      }
      if (b.dual) {
        ring3DY(b.cx, topY, b.cz, b.r * 0.56 - 2.5, b.r * 0.56, 0.6, '#566065', detailExtras, 20);
      }
      // 3D induction crosshair bars
      box(b.cx - 12, topY, b.cz - 1.2, 24, 0.7, 2.4, '#7c878c', cabinetId, detailExtras);
      box(b.cx - 1.2, topY, b.cz - 12, 2.4, 0.7, 24, '#7c878c', cabinetId, detailExtras);

      // 2D lines for schematic compatibility
      const ringOuter = circle2D(b.cx, b.cz, b.r, 24);
      for (let i = 0; i < ringOuter.length; i++) {
        const p1 = ringOuter[i], p2 = ringOuter[(i + 1) % ringOuter.length];
        line([p1[0], topY + 0.2, p1[1]], [p2[0], topY + 0.2, p2[1]], '#7a858a', 1.5, cabinetId, detailExtras);
      }
    }

    // 3D Touch control panel along front edge
    const tcX = x + w / 2, tcZ = z + d - 30;
    // Power button ring + red LED indicator
    ring3DY(tcX - 70, topY, tcZ, 5, 8, 0.7, ledRed, detailExtras, 14);
    // 4 zone heat level LED bars + touch slider bar
    box(tcX - 45, topY, tcZ - 1.5, 95, 0.6, 3, '#6e797e', cabinetId, detailExtras);
    box(tcX - 45, topY + 0.1, tcZ - 1.5, 42, 0.7, 3, ledRed, cabinetId, detailExtras);
    for (let i = 0; i < 4; i++) {
      const bx = tcX + 62 + i * 16;
      box(bx, topY, tcZ - 4, 8, 0.7, 8, i === 0 || i === 3 ? ledRed : '#4e565a', cabinetId, detailExtras);
    }
    line([tcX - 45, topY + 0.3, tcZ], [tcX + 50, topY + 0.3, tcZ], '#909ba0', 2, cabinetId, detailExtras);
  } else if (type === 'microwave') {
    // ----------------------------------------------------
    // Microwave Oven (Микроволновая печь)
    // ----------------------------------------------------
    box(x, y, z, w, h, d - 14, darkSteel, cabinetId, extras);
    const frontZ = z + d - 14;
    // Stainless outer trim frame (рамка встраивания)
    box(x, y, frontZ, w, 18, 14, inox, cabinetId, detailExtras);
    box(x, y + h - 18, frontZ, w, 18, 14, inox, cabinetId, detailExtras);
    box(x, y + 18, frontZ, 18, h - 36, 14, inox, cabinetId, detailExtras);
    box(x + w - 18, y + 18, frontZ, 18, h - 36, 14, inox, cabinetId, detailExtras);

    // Left door & inspection window
    const doorW = (w - 36) * 0.73;
    const doorX = x + 18, doorY = y + 18, doorH = h - 36;
    box(doorX, doorY, frontZ + 2, doorW, doorH, 12, blackGlass, cabinetId, detailExtras);
    // Dark recessed microwave cavity & glass window
    const mwWinW = Math.max(80, doorW - 56), mwWinH = Math.max(60, doorH - 52);
    box(doorX + 28, doorY + 26, frontZ + 14, mwWinW, mwWinH, 1.5, '#262d32', cabinetId, detailExtras);
    box(doorX + 34, doorY + 32, frontZ + 15.6, mwWinW - 12, mwWinH - 12, 0.8, '#121619', cabinetId, detailExtras);
    // Vertical door handle bar
    cylinderY(doorX + doorW - 16, doorY + 28, frontZ + 28, doorH - 56, 12, inoxBright, cabinetId, detailExtras);
    box(doorX + doorW - 21, doorY + 32, frontZ + 14, 10, 12, 14, inox, cabinetId, detailExtras);
    box(doorX + doorW - 21, doorY + doorH - 44, frontZ + 14, 10, 12, 14, inox, cabinetId, detailExtras);

    // Right control column
    const colX = doorX + doorW + 3;
    const colW = (x + w - 18) - colX;
    box(colX, doorY, frontZ + 2, colW, doorH, 12, blackGlass, cabinetId, detailExtras);
    // Digital LED display
    const dispH = 36;
    box(colX + 10, doorY + doorH - 60, frontZ + 14.2, Math.max(24, colW - 20), dispH, 1.2, '#090b0d', cabinetId, detailExtras);
    box(colX + 18, doorY + doorH - 46, frontZ + 15.6, Math.max(12, colW - 36), 8, 0.8, ledCyan, cabinetId, detailExtras);
    line([colX + 14, doorY + doorH - 42, frontZ + 16], [colX + colW - 14, doorY + doorH - 42, frontZ + 16], ledCyan, 2.5, cabinetId, detailExtras);

    // 6 touch function pads
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const bx = colX + 14 + col * ((colW - 28) / 2.6);
        const by = doorY + doorH - 96 - row * 18;
        box(bx, by, frontZ + 14.2, 12, 8, 1, '#586268', cabinetId, detailExtras);
      }
    }
    // Rotary dial knob
    cylinderZ(colX + colW / 2, doorY + doorH * 0.36, frontZ + 14.2, 12, 30, inoxBright, cabinetId, detailExtras);
    // Door release push button at bottom
    box(colX + 10, doorY + 14, frontZ + 14.2, Math.max(24, colW - 20), 26, 4, inox, cabinetId, detailExtras);
  } else if (type === 'fridge-builtin') {
    // ----------------------------------------------------
    // Built-in Refrigerator (Встраиваемый холодильник)
    // ----------------------------------------------------
    box(x, y, z, w, h, d - 8, '#e6ebed', cabinetId, extras);
    const frontZ = z + d - 8;

    // Plinth ventilation grille at bottom with 3D louvers
    const grilleH = 54;
    box(x + 12, y + 2, frontZ, w - 24, grilleH, 8, '#383d40', cabinetId, detailExtras);
    for (let gy = y + 10; gy < y + grilleH - 6; gy += 10) {
      box(x + 24, gy, frontZ + 8, w - 48, 3.5, 2, '#1e2224', cabinetId, detailExtras);
      line([x + 24, gy, frontZ + 9], [x + w - 24, gy, frontZ + 9], '#1e2122', 2, cabinetId, detailExtras);
    }

    // Split doors: lower freezer (32%) and upper refrigerator (68%)
    const splitY = y + h * 0.33;
    // Top digital thermostat strip visible at top of upper compartment
    box(x + 10, y + h - 34, frontZ, w - 20, 28, 8, '#282d30', cabinetId, detailExtras);
    box(x + w / 2 - 22, y + h - 25, frontZ + 8.2, 44, 10, 1, ledCyan, cabinetId, detailExtras);

    // Lower freezer door with magnetic gasket & slider rails
    box(x + 4, y + grilleH + 6, frontZ, w - 8, splitY - (y + grilleH + 10), 10, '#f2f6f8', cabinetId, detailExtras);
    // Upper fridge door
    box(x + 4, splitY + 6, frontZ, w - 8, y + h - splitY - 44, 10, '#f2f6f8', cabinetId, detailExtras);
    // 3D horizontal separation channel
    box(x + 4, splitY - 3, frontZ, w - 8, 8, 6, '#7a8489', cabinetId, detailExtras);
    line([x + 4, splitY, frontZ + 10.5], [x + w - 4, splitY, frontZ + 10.5], '#7c868a', 1.8, cabinetId, detailExtras);
  } else if (type === 'fridge-freestanding') {
    // ----------------------------------------------------
    // Freestanding Refrigerator (Отдельностоящий холодильник Inox)
    // ----------------------------------------------------
    // Dark anthracite side carcass + leveled feet
    box(x + 18, y, z + d - 45, 36, 16, 36, '#222528', cabinetId, detailExtras);
    box(x + w - 54, y, z + d - 45, 36, 16, 36, '#222528', cabinetId, detailExtras);
    box(x, y + 14, z, w, h - 14, d - 28, '#4a5156', cabinetId, extras);
    const frontZ = z + d - 28;
    const splitY = y + h * 0.36;

    // Lower freezer door (cambered stainless front)
    const fzH = splitY - (y + 18) - 6;
    box(x + 2, y + 18, frontZ, w - 4, fzH, 24, inox, cabinetId, detailExtras);
    box(x + 10, y + 22, frontZ + 24, w - 20, fzH - 8, 4, inoxBright, cabinetId, detailExtras);

    // Recessed horizontal pocket groove between freezer and fridge doors
    box(x + 2, splitY - 6, frontZ, w - 4, 14, 16, '#262b2e', cabinetId, detailExtras);
    line([x + 2, splitY, frontZ + 28.2], [x + w - 2, splitY, frontZ + 28.2], '#2c3033', 2, cabinetId, detailExtras);

    // Upper refrigerator door
    const upY = splitY + 8;
    const upH = y + h - upY - 6;
    box(x + 2, upY, frontZ, w - 4, upH, 24, inox, cabinetId, detailExtras);
    box(x + 10, upY + 4, frontZ + 24, w - 20, upH - 8, 4, inoxBright, cabinetId, detailExtras);

    // Long vertical brushed-steel bar handles on left side of doors
    const hndX = x + w - 46;
    // Upper handle
    cylinderY(hndX, upY + 90, frontZ + 48, Math.max(180, upH - 220), 14, inoxBright, cabinetId, detailExtras);
    box(hndX - 6, upY + 100, frontZ + 28, 12, 14, 20, '#7c868b', cabinetId, detailExtras);
    box(hndX - 6, upY + upH - 150, frontZ + 28, 12, 14, 20, '#7c868b', cabinetId, detailExtras);
    // Lower handle
    cylinderY(hndX, y + 80, frontZ + 48, Math.max(120, fzH - 140), 14, inoxBright, cabinetId, detailExtras);
    box(hndX - 6, y + 90, frontZ + 28, 12, 14, 20, '#7c868b', cabinetId, detailExtras);
    box(hndX - 6, y + fzH - 65, frontZ + 28, 12, 14, 20, '#7c868b', cabinetId, detailExtras);

    // Touch LED temperature control panel on upper door
    const dispW = 64, dispH = 135;
    const dispX = x + (w - dispW) / 2, dispY = y + h * 0.72;
    box(dispX - 2, dispY - 2, frontZ + 28, dispW + 4, dispH + 4, 1.5, '#353b3f', cabinetId, detailExtras);
    box(dispX, dispY, frontZ + 29.5, dispW, dispH, 1, '#111417', cabinetId, detailExtras);
    box(dispX + 14, dispY + 92, frontZ + 30.6, dispW - 28, 10, 0.8, ledCyan, cabinetId, detailExtras);
    box(dispX + 14, dispY + 52, frontZ + 30.6, dispW - 28, 10, 0.8, ledCyan, cabinetId, detailExtras);
    line([dispX + 10, dispY + 85, frontZ + 31], [dispX + dispW - 10, dispY + 85, frontZ + 31], ledCyan, 2.2, cabinetId, detailExtras);
  } else if (type === 'dishwasher-builtin') {
    // ----------------------------------------------------
    // Built-in Dishwasher (Встраиваемая посудомоечная машина)
    // ----------------------------------------------------
    box(x, y + 60, z, w, h - 60, d - 6, darkSteel, cabinetId, extras);
    // Recessed plinth base for kitchen toe-kick
    box(x + 8, y, z, w - 16, 60, d - 55, '#202325', cabinetId, extras);
    const frontZ = z + d - 6;

    // Stainless steel inner door sheet + furniture front mounting brackets
    box(x + 2, y + 64, frontZ, w - 4, h - 92, 6, '#cfd6d9', cabinetId, detailExtras);

    // Top-edge stainless control panel (visible along top edge of door)
    box(x + 2, y + h - 28, frontZ - 2, w - 4, 26, 8, '#2b3033', cabinetId, detailExtras);
    box(x + w / 2 - 28, y + h - 22, frontZ + 6.2, 56, 14, 1, '#0d1012', cabinetId, detailExtras);
    box(x + w / 2 - 16, y + h - 18, frontZ + 7.4, 32, 6, 0.8, ledRed, cabinetId, detailExtras);
    for (let bx = x + 36; bx < x + w - 36; bx += 34) {
      if (Math.abs(bx - (x + w / 2)) < 45) continue;
      box(bx, y + h - 20, frontZ + 6.2, 16, 10, 1.2, inoxBright, cabinetId, detailExtras);
    }

    // "TimeLight / Red Beam on floor" LED projection spot
    cylinderY(x + w / 2, y + 0.5, frontZ + 40, 1.5, 18, ledRed, cabinetId, detailExtras);
  } else if (type === 'dishwasher-freestanding') {
    // ----------------------------------------------------
    // Freestanding Dishwasher (Отдельностоящая посудомоечная машина)
    // ----------------------------------------------------
    box(x, y + 55, z, w, h - 55, d - 16, '#484f54', cabinetId, extras);
    const frontZ = z + d - 16;

    // Plinth kickplate at bottom
    box(x + 4, y, frontZ - 18, w - 8, 55, d - 26, '#2d3235', cabinetId, detailExtras);

    // Stainless front door
    const fasciaH = 105;
    box(x + 2, y + 57, frontZ, w - 4, h - 57 - fasciaH - 2, 14, inox, cabinetId, detailExtras);
    box(x + 8, y + 62, frontZ + 14, w - 16, h - 65 - fasciaH, 2, inoxBright, cabinetId, detailExtras);

    // Upper control fascia with recessed pocket handle
    box(x + 2, y + h - fasciaH, frontZ, w - 4, fasciaH, 16, '#2f3438', cabinetId, detailExtras);
    box(x + 2, y + h - 22, frontZ + 16, w - 4, 20, 2, inoxBright, cabinetId, detailExtras);
    // Pocket handle recess in center
    const pockW = Math.min(180, w * 0.34);
    box(x + (w - pockW) / 2, y + h - fasciaH + 12, frontZ + 14, pockW, 26, 2.5, '#181b1d', cabinetId, detailExtras);
    box(x + (w - pockW) / 2, y + h - fasciaH + 36, frontZ + 15.5, pockW, 4, 2, inoxBright, cabinetId, detailExtras);

    // Digital display + 3D program buttons
    const dispX = x + w / 2 - 42, dispY = y + h - 62;
    box(dispX, dispY, frontZ + 16.2, 84, 32, 1.2, '#0b0d0f', cabinetId, detailExtras);
    box(dispX + 16, dispY + 11, frontZ + 17.5, 52, 10, 0.8, ledRed, cabinetId, detailExtras);
    line([dispX + 16, dispY + 16, frontZ + 18], [dispX + 68, dispY + 16, frontZ + 18], ledRed, 2.2, cabinetId, detailExtras);

    for (const bx of [x + 38, x + 68, x + 98, x + w - 98, x + w - 68, x + w - 38]) {
      cylinderZ(bx, dispY + 16, frontZ + 16.2, 4, 14, inoxBright, cabinetId, detailExtras);
    }
  } else if (type === 'sink-round') {
    // ----------------------------------------------------
    // Round Sink (Раковина круглая — полая чаша с вырезом в столешнице)
    // ----------------------------------------------------
    const topY = y + h;
    const outerDiam = Math.min(w, d, Number(appliance.diameter || appliance.width || w));
    const rOuter = outerDiam / 2 - 4;
    const innerDiam = Math.min(outerDiam - 56, Number(appliance.bowlDiameter || (outerDiam - 100)));
    const rInner = Math.max(80, innerDiam / 2);
    const bowlDepth = Math.max(120, Math.min(260, Number(appliance.bowlDepth || appliance.height || h || 180)));
    const cx = x + w / 2;
    const cz = z + d / 2;

    // 1. 3D Annular top flange sitting cleanly on top of countertop (with open center!)
    ring3DY(cx, topY, cz, rInner, rOuter, 3.5, inox, extras, 28);
    ring3DY(cx, topY + 3.5, cz, rOuter - 5, rOuter, 1.2, inoxBright, detailExtras, 28);
    ring3DY(cx, topY + 3.5, cz, rInner, rInner + 4.5, 1.0, inoxBright, detailExtras, 28);

    // 2. Hollow cylindrical basin (inner walls facing inward + outer walls facing outward + recessed floor)
    if (!cylinderAxis && cylinderY) {
      cylinderY(cx, topY - bowlDepth, cz, bowlDepth, rInner * 2, '#484e52', cabinetId, extras);
    }
    const segs = 28;
    const yBot = topY - bowlDepth;
    const botPtsUp = [], botPtsDown = [];
    for (let i = 0; i < segs; i++) {
      const a0 = (i * 2 * Math.PI) / segs;
      const a1 = ((i + 1) * 2 * Math.PI) / segs;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const midC = Math.cos((a0 + a1) / 2), midS = Math.sin((a0 + a1) / 2);

      const x0i = cx + rInner * c0, z0i = cz + rInner * s0;
      const x1i = cx + rInner * c1, z1i = cz + rInner * s1;
      botPtsUp.push([x0i, yBot + 1.5, z0i]);
      botPtsDown.unshift([x0i, yBot - 1.5, z0i]);

      // Inner basin wall (normal points INWARD towards bowl center so it is visible & shaded from above)
      face(
        [[x0i, yBot + 1.5, z0i], [x1i, yBot + 1.5, z1i], [x1i, topY + 3.5, z1i], [x0i, topY + 3.5, z0i]],
        '#687378',
        [-midC, 0.08, -midS],
        cabinetId,
        extras
      );
      // Outer basin shell (normal points OUTWARD into cabinet carcass)
      const rShell = rInner + 3;
      const x0o = cx + rShell * c0, z0o = cz + rShell * s0;
      const x1o = cx + rShell * c1, z1o = cz + rShell * s1;
      face(
        [[x1o, yBot - 1.5, z1o], [x0o, yBot - 1.5, z0o], [x0o, topY, z0o], [x1o, topY, z1o]],
        '#4c5458',
        [midC, 0, midS],
        cabinetId,
        extras
      );
    }
    // Recessed basin bottom floor (upward face + downward face)
    face(botPtsUp, '#586267', [0, 1, 0], cabinetId, extras);
    face(botPtsDown, '#464e52', [0, -1, 0], cabinetId, extras);

    // 3. Waste strainer basket + siphon trap under bowl
    cylinderY(cx, yBot + 1.6, cz, 2.2, 86, inoxBright, cabinetId, detailExtras);
    cylinderY(cx, yBot + 3.0, cz, 2.0, 54, '#24292c', cabinetId, detailExtras);
    cylinderY(cx, yBot + 4.2, cz, 2.5, 20, inoxBright, cabinetId, detailExtras);
    cylinderY(cx, yBot - 65, cz, 64, 48, '#383e42', cabinetId, detailExtras);

    // 2D schematic lines for rim
    const outerRim = circle2D(cx, cz, rOuter, 28);
    const innerRim = circle2D(cx, cz, rInner, 28);
    for (let i = 0; i < outerRim.length; i++) {
      const p1 = outerRim[i], p2 = outerRim[(i + 1) % outerRim.length];
      line([p1[0], topY + 4, p1[1]], [p2[0], topY + 4, p2[1]], inoxBright, 1.6, cabinetId, detailExtras);
      const q1 = innerRim[i], q2 = innerRim[(i + 1) % innerRim.length];
      line([q1[0], topY + 3.8, q1[1]], [q2[0], topY + 3.8, q2[1]], '#959fa3', 1.4, cabinetId, detailExtras);
    }

    // 4. 3D Chrome Mixer Faucet at rear deck
    const tapX = cx;
    const tapZ = cz - (rInner + rOuter) * 0.5;
    renderGooseneckFaucet(tapX, topY + 3.5, tapZ);
  } else if (type === 'sink-rectangular') {
    // ----------------------------------------------------
    // Rectangular Sink (Раковина прямоугольная — полая чаша с крылом и вырезом)
    // ----------------------------------------------------
    const topY = y + h;
    const hasDrainer = appliance.hasDrainer !== false && w >= 600;
    const isDrainerRight = appliance.drainerSide !== 'left';

    // Bowl dimensions
    const bowlMargin = 35;
    const defaultBowlW = hasDrainer ? Math.min(w * 0.52, w - 240) : w - 2 * bowlMargin;
    const bowlW = Math.max(220, Math.min(w - 2 * bowlMargin, Number(appliance.bowlWidth || defaultBowlW)));
    const bowlD = Math.max(220, Math.min(d - 86, Number(appliance.bowlDepth || (d - 90))));
    const bowlH = Math.max(120, Math.min(240, Number(appliance.bowlHeight || 190)));

    const bowlX = hasDrainer
      ? (isDrainerRight ? x + bowlMargin : x + w - bowlMargin - bowlW)
      : x + (w - bowlW) / 2;
    // Leave 62mm rear deck for mixer faucet
    const bowlZ = z + Math.min(62, Math.max(28, (d - bowlD) * 0.68));
    const deckH = 3.5;

    // 1. 4-piece top deck around the open bowl [bowlX, bowlX + bowlW] x [bowlZ, bowlZ + bowlD]
    // Rear faucet deck (between z and bowlZ)
    if (bowlZ > z) {
      rawBox(x, topY, z, w, deckH, bowlZ - z, inox, cabinetId, extras);
    }
    // Front rim strip (between bowlZ + bowlD and z + d)
    const frontStripD = (z + d) - (bowlZ + bowlD);
    if (frontStripD > 0) {
      rawBox(x, topY, bowlZ + bowlD, w, deckH, frontStripD, inox, cabinetId, extras);
    }
    // Left deck / drainer (between x and bowlX)
    if (bowlX > x) {
      rawBox(x, topY, bowlZ, bowlX - x, deckH, bowlD, inox, cabinetId, extras);
    }
    // Right deck / drainer (between bowlX + bowlW and x + w)
    const rightDeckW = (x + w) - (bowlX + bowlW);
    if (rightDeckW > 0) {
      rawBox(bowlX + bowlW, topY, bowlZ, rightDeckW, deckH, bowlD, inox, cabinetId, extras);
    }

    // Raised perimeter lip around outer sink frame (prevents water spill)
    const lipT = 5, lipH = 1.6;
    rawBox(x, topY + deckH, z, w, lipH, lipT, inoxBright, cabinetId, detailExtras);
    rawBox(x, topY + deckH, z + d - lipT, w, lipH, lipT, inoxBright, cabinetId, detailExtras);
    rawBox(x, topY + deckH, z + lipT, lipT, lipH, Math.max(2, d - 2 * lipT), inoxBright, cabinetId, detailExtras);
    rawBox(x + w - lipT, topY + deckH, z + lipT, lipT, lipH, Math.max(2, d - 2 * lipT), inoxBright, cabinetId, detailExtras);

    // 2. Hollow 3D recessed sink basin (4 thin vertical wall slabs + 1 bottom floor slab)
    const wallT = 3;
    const yBot = topY - bowlH;
    // Basin bottom slab
    rawBox(bowlX - wallT, yBot - wallT, bowlZ - wallT, bowlW + 2 * wallT, wallT, bowlD + 2 * wallT, '#586268', cabinetId, extras);
    // Left basin wall
    rawBox(bowlX - wallT, yBot, bowlZ - wallT, wallT, bowlH + deckH, bowlD + 2 * wallT, '#6c767c', cabinetId, extras);
    // Right basin wall
    rawBox(bowlX + bowlW, yBot, bowlZ - wallT, wallT, bowlH + deckH, bowlD + 2 * wallT, '#6c767c', cabinetId, extras);
    // Back basin wall
    rawBox(bowlX, yBot, bowlZ - wallT, bowlW, bowlH + deckH, wallT, '#646e74', cabinetId, extras);
    // Front basin wall
    rawBox(bowlX, yBot, bowlZ + bowlD, bowlW, bowlH + deckH, wallT, '#646e74', cabinetId, extras);

    // Overflow slot plate (перелив) on upper rear wall of basin
    const ovfX = bowlX + bowlW / 2;
    rawBox(ovfX - 18, topY - 46, bowlZ + 0.2, 36, 16, 1.5, inoxBright, cabinetId, detailExtras);
    rawBox(ovfX - 11, topY - 41, bowlZ + 1.8, 22, 6, 0.8, '#1d2124', cabinetId, detailExtras);

    // 3. Bowl bottom waste strainer & siphon trap under basin
    const wasteX = bowlX + bowlW / 2, wasteZ = bowlZ + bowlD / 2;
    cylinderY(wasteX, yBot + 0.4, wasteZ, 2.2, 90, inoxBright, cabinetId, detailExtras);
    cylinderY(wasteX, yBot + 1.8, wasteZ, 2.0, 56, '#23282b', cabinetId, detailExtras);
    cylinderY(wasteX, yBot + 3.0, wasteZ, 2.5, 22, inoxBright, cabinetId, detailExtras);
    cylinderY(wasteX, yBot - 65, wasteZ, 62, 50, '#383e42', cabinetId, detailExtras);

    // 4. 3D Drainer board ribs & recessed grooves (крыло раковины)
    if (hasDrainer) {
      const drainerX = isDrainerRight ? bowlX + bowlW + 14 : x + bowlMargin;
      const drainerW = isDrainerRight ? x + w - bowlMargin - drainerX : bowlX - 14 - drainerX;
      if (drainerW > 60) {
        const numGrooves = 5;
        const spacing = (bowlD - 36) / (numGrooves + 1);
        for (let i = 1; i <= numGrooves; i++) {
          const gz = bowlZ + 18 + i * spacing;
          rawBox(drainerX + 10, topY + deckH, gz - 2.5, drainerW - 20, 1.3, 5, '#8c969b', cabinetId, detailExtras);
          line([drainerX + 12, topY + deckH + 1.4, gz], [drainerX + drainerW - 12, topY + deckH + 1.4, gz], '#95a1a6', 1.8, cabinetId, detailExtras);
        }
      }
    }

    // Rim bevel lines for 2D/schematic views
    line([x, topY + deckH, z], [x + w, topY + deckH, z], inoxBright, 1.4, cabinetId, detailExtras);
    line([x + w, topY + deckH, z], [x + w, topY + deckH, z + d], inoxBright, 1.4, cabinetId, detailExtras);
    line([x + w, topY + deckH, z + d], [x, topY + deckH, z + d], inoxBright, 1.4, cabinetId, detailExtras);
    line([x, topY + deckH, z + d], [x, topY + deckH, z], inoxBright, 1.4, cabinetId, detailExtras);

    // 5. 3D Chrome Mixer Faucet on rear deck behind bowl
    const tapX = bowlX + bowlW / 2;
    const tapZ = z + Math.max(22, (bowlZ - z) * 0.5);
    renderGooseneckFaucet(tapX, topY + deckH, tapZ);
  } else if (type === 'hood-builtin') {
    // ----------------------------------------------------
    // Built-in Range Hood (Встраиваемая вытяжка в навесной шкаф)
    // ----------------------------------------------------
    const bottomY = y;

    // 1. Bottom perimeter mounting flange
    box(x, bottomY - 3, z, w, 3, d, inox, cabinetId, detailExtras);

    // 2. Telescopic pull-out visor / front fascia along front edge (z + d)
    box(x + 2, bottomY - 4, z + d - 34, w - 4, 4, 34, inoxBright, cabinetId, detailExtras);
    box(x + 2, bottomY - 22, z + d - 4, w - 4, 22, 4, inoxBright, cabinetId, detailExtras);
    // Control buttons on right side of front visor
    for (let i = 0; i < 4; i++) {
      box(x + w - 90 + i * 16, bottomY - 14, z + d + 0.2, 10, 6, 1.5, i === 0 ? ledCyan : '#444b4f', cabinetId, detailExtras);
    }
    line([x + 25, bottomY - 10, z + d + 0.4], [x + w - 25, bottomY - 10, z + d + 0.4], '#7c868a', 1.8, cabinetId, detailExtras);

    // 3. Dual aluminum grease filter cassettes on underside with 3D mesh ribs
    const filterZ = z + 20;
    const filterD = Math.max(80, d - 56);
    const filterW = w - 36;
    const halfW = filterW / 2;
    const f1X = x + 18;
    const f2X = f1X + halfW + 3;
    box(f1X, bottomY - 2.5, filterZ, halfW - 3, 2.5, filterD, '#a6b0b4', cabinetId, detailExtras);
    box(f2X, bottomY - 2.5, filterZ, halfW - 3, 2.5, filterD, '#a6b0b4', cabinetId, detailExtras);
    for (const fx of [f1X, f2X]) {
      for (let rz = filterZ + 16; rz < filterZ + filterD - 14; rz += 22) {
        box(fx + 10, bottomY - 3.2, rz, halfW - 23, 0.8, 6, '#848e93', cabinetId, detailExtras);
      }
      const latchW = 28, latchD = 18;
      box(fx + (halfW - latchW) / 2, bottomY - 4, filterZ + (filterD - latchD) / 2, latchW, 2, latchD, '#25292b', cabinetId, detailExtras);
    }

    // 4. Dual warm-white LED spotlight discs illuminating cooktop below
    const spotZ = z + 38;
    for (const sx of [x + w * 0.22, x + w * 0.78]) {
      cylinderY(sx, bottomY - 3.8, spotZ, 1.5, 42, inoxBright, cabinetId, detailExtras);
      cylinderY(sx, bottomY - 4.5, spotZ, 1.2, 34, '#fff8e1', cabinetId, detailExtras);
    }

    // 5. Internal Motor Housing inside cabinet
    const motorH = Math.min(220, Math.max(140, h * 0.45));
    const motorD = Math.min(260, d - 20);
    const motorW = Math.min(460, w - 24);
    const motorX = x + (w - motorW) / 2;
    const motorZ = z + 12;
    box(motorX, y, motorZ, motorW, motorH, motorD, darkSteel, cabinetId, extras);

    // 6. Round ventilation exhaust duct pipe (Ø 130mm) with 3D corrugated rings
    const ductH = h - motorH;
    if (ductH > 10) {
      const ductX = x + w / 2;
      const ductZ = motorZ + motorD / 2;
      const ductR = 60;
      cylinderY(ductX, y + motorH, ductZ, ductH, ductR * 2, '#dbe2e6', cabinetId, extras);
      for (let dy = y + motorH + 22; dy < y + h - 12; dy += 36) {
        cylinderY(ductX, dy, ductZ, 4, (ductR + 2.5) * 2, '#b2bcc2', cabinetId, detailExtras);
      }
    }
  } else if (type === 'washer' || type === 'dryer') {
    // ----------------------------------------------------
    // Washing Machine / Tumble Dryer (Стиральная / Сушильная машина)
    // ----------------------------------------------------
    const isDryer = type === 'dryer';
    const bodyCol = '#f2f5f7';
    const frontZ = z + d - 22;

    // 4 Rubber anti-vibration leveling feet at exact floor level y
    for (const fx of [x + 16, x + w - 52]) {
      for (const fz of [z + 16, frontZ - 44]) {
        box(fx, y, fz, 36, 8, 36, '#23272a', cabinetId, extras);
      }
    }

    // Main enameled steel cabinet + overhanging top worktop cover within [x..x+w, y..y+h, z..z+d]
    box(x, y + 8, z, w, h - 24, d - 22, bodyCol, cabinetId, extras);
    box(x, y + h - 16, z, w, 16, d - 10, '#e3e8eb', cabinetId, extras);

    // Front face lower panel + upper control fascia
    const fasciaH = Math.min(125, h * 0.16);
    box(x + 2, y + 10, frontZ, w - 4, h - 26 - fasciaH - 2, 8, bodyCol, cabinetId, detailExtras);
    box(x + 2, y + h - 16 - fasciaH, frontZ, w - 4, fasciaH, 10, '#ecf0f2', cabinetId, detailExtras);

    // Left detergent / condenser water drawer with recessed pull handle
    const drwW = w * 0.34;
    const drwY = y + h - 16 - fasciaH + 10;
    const drwH = fasciaH - 20;
    box(x + 12, drwY, frontZ + 10, drwW, drwH, 2, '#f7f9fa', cabinetId, detailExtras);
    box(x + 24, drwY + 8, frontZ + 9.5, drwW - 24, 14, 3, '#b8c2c7', cabinetId, detailExtras);

    // Center rotary program selector dial with chrome ring
    const dialX = x + w * 0.52, dialY = drwY + drwH / 2;
    cylinderZ(dialX, dialY, frontZ + 10, 3, 44, inox, cabinetId, detailExtras);
    cylinderZ(dialX, dialY, frontZ + 13, 7, 36, '#ffffff', cabinetId, detailExtras);
    cylinderZ(dialX, dialY, frontZ + 20, 1.5, 32, darkSteel, cabinetId, detailExtras);
    box(dialX - 1.5, dialY + 4, frontZ + 20.5, 3, 11, 1.5, ledCyan, cabinetId, detailExtras);

    // Right LED display screen
    const dispX = x + w * 0.64, dispW = w * 0.31;
    box(dispX, drwY + 6, frontZ + 10, dispW, drwH - 12, 2, '#14181b', cabinetId, detailExtras);
    box(dispX + 14, dialY - 4, frontZ + 12.2, Math.max(18, dispW * 0.45), 10, 0.8, ledCyan, cabinetId, detailExtras);

    // 3D Front-loading Porthole Door (Люк барабана)
    const cx = x + w / 2, cy = y + (h - fasciaH) * 0.48;
    const rOuter = Math.min(w, h) * 0.31;
    const rInner = rOuter * 0.74;

    // Recessed dark stainless inner drum + 3 laundry paddles
    cylinderZ(cx, cy, frontZ + 2, 6, rInner * 2, '#424a4f', cabinetId, detailExtras);
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 + 0.4;
      const px = cx + Math.cos(a) * (rInner * 0.55);
      const py = cy + Math.sin(a) * (rInner * 0.55);
      box(px - 10, py - 10, frontZ + 5, 20, 20, 3, '#6e787e', cabinetId, detailExtras);
    }
    // Tinted glass porthole bowl
    cylinderZ(cx, cy, frontZ + 8, 4, (rInner + 6) * 2, isDryer ? '#2c3338' : '#1b2429', cabinetId, detailExtras);
    // 3D sculpted outer porthole bezel ring (chrome / anthracite)
    ring3DZ(cx, cy, frontZ + 8, rInner, rOuter, 11, isDryer ? '#353c40' : inox, detailExtras, 28);
    ring3DZ(cx, cy, frontZ + 19, rInner + 2, rOuter - 4, 3, inoxBright, detailExtras, 28);
    // Door handle grip at 3 o'clock position (touches frontZ + 22 = z + d)
    box(cx + rInner + 2, cy - 28, frontZ + 18, rOuter - rInner - 4, 56, 4, '#23282b', cabinetId, extras);

    // Lower right drain pump filter flap
    if (!isDryer) {
      box(x + w - 95, y + 24, frontZ + 8, 72, 56, 2, '#dfe5e8', cabinetId, detailExtras);
      ring3DZ(x + w - 59, y + 52, frontZ + 9.5, 16, 19, 1.5, '#b0bac0', detailExtras, 18);
    }
  } else if (type === 'boiler') {
    // ----------------------------------------------------
    // Electric Water Heater / Boiler (Бойлер / Водонагреватель)
    // ----------------------------------------------------
    const cx = x + w / 2, cz = z + d / 2;
    const diam = Math.min(w, d) - 8;
    // Cylindrical insulated tank body with top & bottom domed caps
    cylinderY(cx, y + 35, cz, Math.max(100, h - 55), diam, '#f4f7f8', cabinetId, extras);
    cylinderY(cx, y + 25, cz, 12, diam * 0.88, '#dce2e6', cabinetId, detailExtras);
    cylinderY(cx, y + h - 22, cz, 10, diam * 0.88, '#dce2e6', cabinetId, detailExtras);

    // Wall mounting brackets on rear
    box(x + w * 0.2, y + h * 0.72, z, w * 0.6, 28, d * 0.35, '#8c969b', cabinetId, detailExtras);
    box(x + w * 0.2, y + h * 0.25, z, w * 0.6, 28, d * 0.35, '#8c969b', cabinetId, detailExtras);

    // Front thermometer dial & lower digital thermostat controller
    const frontTankZ = cz + diam / 2;
    ring3DZ(cx, y + h * 0.74, frontTankZ - 2, 16, 24, 6, inox, detailExtras, 20);
    cylinderZ(cx, y + h * 0.74, frontTankZ - 1, 4, 34, '#1c2226', cabinetId, detailExtras);
    box(cx - 12, y + h * 0.74, frontTankZ + 3.5, 14, 3, 1, ledRed, cabinetId, detailExtras);

    // Lower thermostat housing + rotary temperature knob + heating indicator
    box(cx - 55, y + 48, frontTankZ - 12, 110, 58, 18, '#2b3135', cabinetId, detailExtras);
    cylinderZ(cx, y + 76, frontTankZ + 6, 12, 28, inoxBright, cabinetId, detailExtras);
    box(cx + 26, y + 72, frontTankZ + 6.2, 14, 8, 1.5, ledRed, cabinetId, detailExtras);

    // Hot (red) and Cold (blue) bottom water inlet/outlet pipes
    cylinderY(cx - 50, y, cz, 35, 22, inox, cabinetId, detailExtras);
    cylinderY(cx - 50, y + 14, cz, 8, 28, '#e53935', cabinetId, detailExtras);
    cylinderY(cx + 50, y, cz, 35, 22, inox, cabinetId, detailExtras);
    cylinderY(cx + 50, y + 14, cz, 8, 28, '#1e88e5', cabinetId, detailExtras);
  } else {
    // Fallback for custom equipment
    box(x, y, z, w, h, d, '#d8dddb', cabinetId, extras);
  }
}
