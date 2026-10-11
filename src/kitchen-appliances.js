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
    builtin: true,
    sinkShape: 'round',
    bowlDiameter: 410,
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
    height: 260,
    depth: 300,
    builtin: true,
    clearances: { side: 5, top: 10, rear: 10 }
  },
  'hood-wall': {
    type: 'hood-wall',
    name: 'Настенная вытяжка',
    nameTr: 'Duvar tipi davlumbaz',
    nameEn: 'Wall chimney hood',
    width: 600,
    height: 750,
    depth: 480,
    builtin: false,
    clearances: { side: 20, top: 0, rear: 0 }
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
  renderContext: { box, rawBox, face, line, cylinderX, cylinderY, cylinderZ }
}) {
  const type = appliance.type;
  const extras = { component: 'appliance', sectionId, cabinetId, applianceType: type, noCutout: true };
  const detailExtras = { ...extras, component: 'appliance-detail' };

  // Base appliance body housing
  const darkSteel = '#2b2e30';
  const inox = '#d8dede';
  const inoxBright = '#eaf0f2';
  const blackGlass = '#181b1d';
  const tintedGlass = '#1f2427';
  const ledCyan = '#4fc3f7';
  const ledRed = '#ff5722';

  if (type === 'oven') {
    // ----------------------------------------------------
    // Built-in Oven (Духовой шкаф)
    // ----------------------------------------------------
    // Main body inside niche
    box(x, y, z, w, h, d, darkSteel, cabinetId, extras);

    // Front door frame (black glass + stainless trim)
    const doorH = h - 110;
    const fasciaH = 110;
    const frontZ = z + d;

    // Control fascia (upper panel)
    box(x, y + doorH, frontZ, w, fasciaH, 2, '#3a3e42', cabinetId, detailExtras);
    // Display in center of fascia
    const dispW = 100, dispH = 34;
    box(x + (w - dispW) / 2, y + doorH + (fasciaH - dispH) / 2, frontZ + 2.2, dispW, dispH, 1, '#0f1112', cabinetId, detailExtras);
    // LED clock text line / digits
    line([x + (w - dispW) / 2 + 15, y + doorH + fasciaH / 2, frontZ + 3.4], [x + (w - dispW) / 2 + dispW - 15, y + doorH + fasciaH / 2, frontZ + 3.4], ledCyan, 2.5, cabinetId, detailExtras);

    // Rotary dial knobs (left and right)
    for (const kx of [x + 50, x + w - 50]) {
      cylinderZ(kx, y + doorH + fasciaH / 2, frontZ + 2.5, 14, 32, inox, cabinetId, detailExtras);
      line([kx, y + doorH + fasciaH / 2 + 4, frontZ + 16.5], [kx, y + doorH + fasciaH / 2 + 13, frontZ + 16.5], '#1a1a1a', 1.8, cabinetId, detailExtras);
    }

    // Lower glass door
    box(x, y, frontZ, w, doorH, 2, blackGlass, cabinetId, detailExtras);
    // Glass inspection window with inner frame
    const winMargin = 45;
    box(x + winMargin, y + winMargin, frontZ + 2.2, w - 2 * winMargin, doorH - 2 * winMargin, 0.5, tintedGlass, cabinetId, detailExtras);

    // Oven interior grid rack lines behind glass
    for (let gy = y + winMargin + 25; gy < y + doorH - winMargin - 15; gy += 40) {
      line([x + winMargin + 15, gy, frontZ + 1], [x + w - winMargin - 15, gy, frontZ + 1], '#5c6366', 1.2, cabinetId, detailExtras);
    }

    // Wide horizontal bar handle
    const handleW = w * 0.76;
    const handleY = y + doorH - 24;
    const handleZ = frontZ + 28;
    cylinderX(x + (w - handleW) / 2, handleY, handleZ, handleW, 14, inoxBright, cabinetId, detailExtras);
    // Handle standoffs
    for (const hx of [x + (w - handleW) / 2 + 20, x + (w + handleW) / 2 - 20]) {
      cylinderZ(hx, handleY, frontZ + 2, 26, 12, '#889296', cabinetId, detailExtras);
    }
  } else if (type === 'cooktop') {
    // ----------------------------------------------------
    // Cooktop / Hob (Плита / Варочная панель)
    // ----------------------------------------------------
    // Ultra-slim ceramic glass plate sitting on countertop
    const plateH = 5;
    box(x, y, z, w, plateH, d, blackGlass, cabinetId, extras);
    // Beveled perimeter facet
    line([x, y + plateH, z], [x + w, y + plateH, z], '#4a5054', 1.2, cabinetId, detailExtras);
    line([x + w, y + plateH, z], [x + w, y + plateH, z + d], '#4a5054', 1.2, cabinetId, detailExtras);
    line([x + w, y + plateH, z + d], [x, y + plateH, z + d], '#4a5054', 1.2, cabinetId, detailExtras);
    line([x, y + plateH, z + d], [x, y + plateH, z], '#4a5054', 1.2, cabinetId, detailExtras);

    // 4 Cooking zones (burners / induction crosshairs)
    // Z-axis: z is rear (wall side), z + d is front (cook standing side)
    const burners = [
      { cx: x + w * 0.28, cz: z + d - 145, r: 80, dual: true },   // Front-left (large dual zone near front)
      { cx: x + w * 0.26, cz: z + 130, r: 65, dual: false },       // Rear-left (medium zone near wall)
      { cx: x + w * 0.74, cz: z + 140, r: 75, dual: true },        // Rear-right (large zone near wall)
      { cx: x + w * 0.74, cz: z + d - 140, r: 55, dual: false }    // Front-right (simmer zone near front)
    ];

    for (const b of burners) {
      const topY = y + plateH + 0.3;
      // Outer ring
      const ringOuter = circle2D(b.cx, b.cz, b.r, 28);
      for (let i = 0; i < ringOuter.length; i++) {
        const p1 = ringOuter[i], p2 = ringOuter[(i + 1) % ringOuter.length];
        line([p1[0], topY, p1[1]], [p2[0], topY, p2[1]], '#7a858a', 1.5, cabinetId, detailExtras);
      }
      if (b.dual) {
        const ringInner = circle2D(b.cx, b.cz, b.r * 0.62, 20);
        for (let i = 0; i < ringInner.length; i++) {
          const p1 = ringInner[i], p2 = ringInner[(i + 1) % ringInner.length];
          line([p1[0], topY, p1[1]], [p2[0], topY, p2[1]], '#555f63', 1.1, cabinetId, detailExtras);
        }
      }
      // Induction crosshair centre
      line([b.cx - 10, topY, b.cz], [b.cx + 10, topY, b.cz], '#8a9499', 1.5, cabinetId, detailExtras);
      line([b.cx, topY, b.cz - 10], [b.cx, topY, b.cz + 10], '#8a9499', 1.5, cabinetId, detailExtras);
    }

    // Touch control panel along front edge (closest to cook)
    const touchTop = y + plateH + 0.4;
    const tcX = x + w / 2, tcZ = z + d - 28;
    // Power symbol circle
    const powerPts = circle2D(tcX - 55, tcZ, 7, 12);
    for (let i = 0; i < powerPts.length; i++) {
      const p1 = powerPts[i], p2 = powerPts[(i + 1) % powerPts.length];
      line([p1[0], touchTop, p1[1]], [p2[0], touchTop, p2[1]], ledRed, 1.8, cabinetId, detailExtras);
    }
    // Slider / step indicators
    line([tcX - 30, touchTop, tcZ], [tcX + 45, touchTop, tcZ], '#909ba0', 2, cabinetId, detailExtras);
    line([tcX + 20, touchTop, tcZ - 4], [tcX + 20, touchTop, tcZ + 4], ledRed, 2.5, cabinetId, detailExtras);
  } else if (type === 'microwave') {
    // ----------------------------------------------------
    // Microwave Oven (Микроволновая печь)
    // ----------------------------------------------------
    box(x, y, z, w, h, d, darkSteel, cabinetId, extras);
    const frontZ = z + d;
    // Front fascia
    box(x, y, frontZ, w, h, 2, blackGlass, cabinetId, detailExtras);

    // Left door window
    const doorW = w * 0.72;
    box(x + 12, y + 16, frontZ + 2.2, doorW - 24, h - 32, 0.5, tintedGlass, cabinetId, detailExtras);

    // Right control column
    const colX = x + doorW + 6;
    const colW = w - doorW - 16;
    // Display screen
    box(colX, y + h - 70, frontZ + 2.2, colW, 40, 0.8, '#0b0d0e', cabinetId, detailExtras);
    line([colX + 8, y + h - 50, frontZ + 3.2], [colX + colW - 8, y + h - 50, frontZ + 3.2], ledCyan, 2.5, cabinetId, detailExtras);

    // Rotary dial / buttons
    cylinderZ(colX + colW / 2, y + h - 120, frontZ + 2.2, 10, 24, inox, cabinetId, detailExtras);
    // Push open button at bottom
    box(colX, y + 20, frontZ + 2.2, colW, 30, 3, '#4a5054', cabinetId, detailExtras);
  } else if (type === 'fridge-builtin') {
    // ----------------------------------------------------
    // Built-in Refrigerator (Встраиваемый холодильник)
    // ----------------------------------------------------
    // Appliance body inside cabinet housing
    box(x, y, z, w, h, d, '#e8ecee', cabinetId, extras);
    const frontZ = z + d;

    // Plinth ventilation grille at the bottom
    const grilleH = 50;
    box(x + 15, y, frontZ - 2, w - 30, grilleH, 4, '#404547', cabinetId, detailExtras);
    for (let gy = y + 10; gy < y + grilleH - 5; gy += 8) {
      line([x + 25, gy, frontZ + 2.2], [x + w - 25, gy, frontZ + 2.2], '#1e2122', 2, cabinetId, detailExtras);
    }

    // Split doors: 70% upper fridge, 30% lower freezer
    const splitY = y + h * 0.32;
    // Lower freezer door outline
    box(x + 4, y + grilleH + 4, frontZ, w - 8, splitY - (y + grilleH + 6), 2, '#dbe2e5', cabinetId, detailExtras);
    // Upper fridge door outline
    box(x + 4, splitY + 4, frontZ, w - 8, y + h - splitY - 8, 2, '#dbe2e5', cabinetId, detailExtras);
    // Horizontal separation seam
    line([x + 4, splitY, frontZ + 2.5], [x + w - 4, splitY, frontZ + 2.5], '#7c868a', 1.8, cabinetId, detailExtras);
  } else if (type === 'fridge-freestanding') {
    // ----------------------------------------------------
    // Freestanding Refrigerator (Отдельностоящий холодильник)
    // ----------------------------------------------------
    // Stainless steel body
    box(x, y, z, w, h, d, '#50565a', cabinetId, extras);
    const frontZ = z + d;
    const splitY = y + h * 0.35;

    // Lower freezer door
    box(x + 2, y + 15, frontZ, w - 4, splitY - y - 17, 10, inox, cabinetId, detailExtras);
    // Upper fridge door
    box(x + 2, splitY + 2, frontZ, w - 4, y + h - splitY - 6, 10, inox, cabinetId, detailExtras);

    // Seam line
    line([x + 2, splitY, frontZ + 10.2], [x + w - 2, splitY, frontZ + 10.2], '#2c3033', 2, cabinetId, detailExtras);

    // Vertical recessed handle pockets or bar handles
    box(x + w - 40, splitY - 70, frontZ + 10.2, 18, 55, 3, '#33373a', cabinetId, detailExtras);
    box(x + w - 40, splitY + 15, frontZ + 10.2, 18, 55, 3, '#33373a', cabinetId, detailExtras);

    // Digital temperature display on upper door
    const dispW = 70, dispH = 120;
    box(x + (w - dispW) / 2, y + h * 0.72, frontZ + 10.2, dispW, dispH, 1, '#1e2124', cabinetId, detailExtras);
    line([x + (w - dispW) / 2 + 10, y + h * 0.72 + 85, frontZ + 11.4], [x + (w - dispW) / 2 + dispW - 10, y + h * 0.72 + 85, frontZ + 11.4], ledCyan, 2.2, cabinetId, detailExtras);
    line([x + (w - dispW) / 2 + 10, y + h * 0.72 + 45, frontZ + 11.4], [x + (w - dispW) / 2 + dispW - 10, y + h * 0.72 + 45, frontZ + 11.4], ledCyan, 2.2, cabinetId, detailExtras);
  } else if (type === 'dishwasher-builtin') {
    // ----------------------------------------------------
    // Built-in Dishwasher (Встраиваемая посудомоечная машина)
    // ----------------------------------------------------
    box(x, y, z, w, h, d, darkSteel, cabinetId, extras);
    const frontZ = z + d;

    // Fully integrated door front plate
    box(x, y + 8, frontZ, w, h - 8, 2, '#cdd4d7', cabinetId, detailExtras);

    // Concealed top control panel on top edge of the open door
    box(x + 20, y + h - 25, frontZ - 10, w - 40, 20, 10, '#3a3f42', cabinetId, detailExtras);
    for (let bx = x + 40; bx < x + w - 40; bx += 35) {
      box(bx, y + h - 18, frontZ - 8, 18, 12, 1, '#828e93', cabinetId, detailExtras);
    }

    // "TimeLight / Beam on floor" info dot projected on the floor below
    cylinderY(x + w / 2, y + 0.5, frontZ + 45, 1, 14, ledCyan, cabinetId, detailExtras);
  } else if (type === 'dishwasher-freestanding') {
    // ----------------------------------------------------
    // Freestanding Dishwasher (Отдельностоящая посудомоечная машина)
    // ----------------------------------------------------
    box(x, y, z, w, h, d, darkSteel, cabinetId, extras);
    const frontZ = z + d;

    // Plinth recess at bottom
    box(x + 10, y, frontZ - 30, w - 20, 60, 30, '#424749', cabinetId, detailExtras);

    // Front door
    box(x + 2, y + 62, frontZ, w - 4, h - 64, 8, inox, cabinetId, detailExtras);

    // Upper control fascia
    const fasciaH = 110;
    box(x + 2, y + h - fasciaH, frontZ + 8.2, w - 4, fasciaH, 2, '#353a3d', cabinetId, detailExtras);

    // Digital display + program buttons
    box(x + w / 2 - 35, y + h - 65, frontZ + 10.4, 70, 30, 1, '#0e1011', cabinetId, detailExtras);
    line([x + w / 2 - 20, y + h - 50, frontZ + 11.6], [x + w / 2 + 20, y + h - 50, frontZ + 11.6], ledRed, 2.2, cabinetId, detailExtras);

    // Program selector buttons
    for (const bx of [x + 35, x + 65, x + 95, x + w - 95, x + w - 65, x + w - 35]) {
      cylinderZ(bx, y + h - 50, frontZ + 10.4, 3, 14, '#9ca6ab', cabinetId, detailExtras);
    }
  } else if (type === 'sink-round') {
    // ----------------------------------------------------
    // Round Sink (Раковина круглая)
    // ----------------------------------------------------
    // Sink outer circular rim sitting on countertop
    const topY = y + h;
    const rOuter = Math.min(w, d) / 2 - 15;
    const rInner = rOuter - 35;
    const cx = x + w / 2;
    const cz = z + d / 2;

    // Outer rim profile
    const outerRim = circle2D(cx, cz, rOuter, 32);
    for (let i = 0; i < outerRim.length; i++) {
      const p1 = outerRim[i], p2 = outerRim[(i + 1) % outerRim.length];
      line([p1[0], topY + 2, p1[1]], [p2[0], topY + 2, p2[1]], inoxBright, 2, cabinetId, detailExtras);
    }

    // Inner bowl rim
    const innerRim = circle2D(cx, cz, rInner, 32);
    for (let i = 0; i < innerRim.length; i++) {
      const p1 = innerRim[i], p2 = innerRim[(i + 1) % innerRim.length];
      line([p1[0], topY + 0.5, p1[1]], [p2[0], topY + 0.5, p2[1]], '#959fa3', 1.5, cabinetId, detailExtras);
    }

    // Sink bowl volume inside the carcass
    cylinderY(cx, topY - 180, cz, 180, rInner * 2, '#484e52', cabinetId, extras);

    // Waste strainer basket at bowl bottom
    cylinderY(cx, topY - 179, cz, 2, 85, inox, cabinetId, detailExtras);
    cylinderY(cx, topY - 178, cz, 3, 30, '#2b3033', cabinetId, detailExtras);

    // Chrome Mixer Faucet (Смеситель) at the rear near wall
    const tapX = cx;
    const tapZ = cz - rInner - 12;
    const tapY = topY + 2;
    // Tap base collar
    cylinderY(tapX, tapY, tapZ, 12, 38, inoxBright, cabinetId, detailExtras);
    // Vertical tap stem
    cylinderY(tapX, tapY + 12, tapZ, 140, 24, inoxBright, cabinetId, detailExtras);
    // High-arc gooseneck spout curving forward (+Z) into bowl towards cook
    const spoutTopY = tapY + 152;
    cylinderX(tapX, spoutTopY, tapZ, 8, 22, inoxBright, cabinetId, detailExtras);
    line([tapX, spoutTopY, tapZ], [tapX, spoutTopY + 45, tapZ + 40], inoxBright, 6, cabinetId, detailExtras);
    line([tapX, spoutTopY + 45, tapZ + 40], [tapX, spoutTopY + 30, tapZ + 95], inoxBright, 6, cabinetId, detailExtras);
    line([tapX, spoutTopY + 30, tapZ + 95], [tapX, spoutTopY - 15, tapZ + 115], inoxBright, 6, cabinetId, detailExtras);
    // Aerator tip
    cylinderY(tapX, spoutTopY - 25, tapZ + 115, 10, 18, '#33373a', cabinetId, detailExtras);

    // Single lever handle on side
    line([tapX + 12, tapY + 40, tapZ], [tapX + 45, tapY + 65, tapZ + 25], inoxBright, 4.5, cabinetId, detailExtras);
  } else if (type === 'sink-rectangular') {
    // ----------------------------------------------------
    // Rectangular Sink with Custom Dimensions (Раковина прямоугольная)
    // ----------------------------------------------------
    const topY = y + h;
    const hasDrainer = appliance.hasDrainer !== false && w >= 600;
    const isDrainerRight = appliance.drainerSide !== 'left';

    // Outer rim on countertop
    box(x, topY, z, w, 2.5, d, inox, cabinetId, extras);
    // Rim bevel line
    line([x, topY + 2.5, z], [x + w, topY + 2.5, z], inoxBright, 1.4, cabinetId, detailExtras);
    line([x + w, topY + 2.5, z], [x + w, topY + 2.5, z + d], inoxBright, 1.4, cabinetId, detailExtras);
    line([x + w, topY + 2.5, z + d], [x, topY + 2.5, z + d], inoxBright, 1.4, cabinetId, detailExtras);
    line([x, topY + 2.5, z + d], [x, topY + 2.5, z], inoxBright, 1.4, cabinetId, detailExtras);

    // Bowl dimensions
    const bowlMargin = 35;
    const defaultBowlW = hasDrainer ? Math.min(w * 0.52, w - 240) : w - 2 * bowlMargin;
    const bowlW = Math.max(250, Math.min(w - 2 * bowlMargin, Number(appliance.bowlWidth || defaultBowlW)));
    const bowlD = Math.max(250, Math.min(d - 90, Number(appliance.bowlDepth || (d - 90))));
    const bowlH = Math.max(120, Math.min(240, Number(appliance.bowlHeight || 190)));

    const bowlX = hasDrainer
      ? (isDrainerRight ? x + bowlMargin : x + w - bowlMargin - bowlW)
      : x + (w - bowlW) / 2;
    // Bowl positioned to leave rear faucet deck between z and z + 62
    const bowlZ = z + 62;

    // Bowl cavity down into cabinet
    box(bowlX, topY - bowlH, bowlZ, bowlW, bowlH, bowlD, '#484f54', cabinetId, extras);
    // Bowl bottom waste strainer
    const wasteX = bowlX + bowlW / 2, wasteZ = bowlZ + bowlD / 2;
    cylinderY(wasteX, topY - bowlH + 1, wasteZ, 2, 88, inoxBright, cabinetId, detailExtras);
    cylinderY(wasteX, topY - bowlH + 2, wasteZ, 3, 32, '#202326', cabinetId, detailExtras);

    // Drainer board with grooves (if present)
    if (hasDrainer) {
      const drainerX = isDrainerRight ? bowlX + bowlW + 15 : x + bowlMargin;
      const drainerW = isDrainerRight ? x + w - bowlMargin - drainerX : bowlX - 15 - drainerX;
      if (drainerW > 60) {
        // Grooves sloped towards bowl
        const numGrooves = 5;
        const spacing = (bowlD - 40) / (numGrooves + 1);
        for (let i = 1; i <= numGrooves; i++) {
          const gz = bowlZ + 20 + i * spacing;
          line([drainerX + 15, topY + 1.2, gz], [drainerX + drainerW - 15, topY + 1.2, gz], '#95a1a6', 1.8, cabinetId, detailExtras);
        }
      }
    }

    // Faucet mounted on rear deck behind the bowl (near the wall, z side)
    const tapX = bowlX + bowlW / 2;
    const tapZ = z + 32;
    const tapY = topY + 2.5;

    cylinderY(tapX, tapY, tapZ, 12, 38, inoxBright, cabinetId, detailExtras);
    cylinderY(tapX, tapY + 12, tapZ, 150, 24, inoxBright, cabinetId, detailExtras);
    const spoutTopY = tapY + 162;
    line([tapX, spoutTopY, tapZ], [tapX, spoutTopY + 50, tapZ + 45], inoxBright, 6, cabinetId, detailExtras);
    line([tapX, spoutTopY + 50, tapZ + 45], [tapX, spoutTopY + 35, tapZ + 105], inoxBright, 6, cabinetId, detailExtras);
    line([tapX, spoutTopY + 35, tapZ + 105], [tapX, spoutTopY - 20, tapZ + 125], inoxBright, 6, cabinetId, detailExtras);
    cylinderY(tapX, spoutTopY - 30, tapZ + 125, 10, 18, '#33373a', cabinetId, detailExtras);
    line([tapX + 12, tapY + 45, tapZ], [tapX + 48, tapY + 70, tapZ + 25], inoxBright, 4.5, cabinetId, detailExtras);
  } else if (type === 'hood-builtin') {
    // ----------------------------------------------------
    // Built-in Range Hood (Встраиваемая вытяжка)
    // ----------------------------------------------------
    // Housing in cabinet bottom
    box(x, y, z, w, h, d, darkSteel, cabinetId, extras);
    // Telescopic pull-out visor / grease filter cassettes on underside
    const bottomY = y;
    box(x + 15, bottomY - 3, z + 15, w - 30, 3, d - 30, inox, cabinetId, detailExtras);
    // Aluminum grease filter mesh panels
    const halfW = (w - 40) / 2;
    box(x + 18, bottomY - 2, z + 20, halfW - 4, 1.5, d - 40, '#a2acb0', cabinetId, detailExtras);
    box(x + 18 + halfW, bottomY - 2, z + 20, halfW - 4, 1.5, d - 40, '#a2acb0', cabinetId, detailExtras);
    // Two LED spotlight discs
    cylinderY(x + w * 0.28, bottomY - 3.5, z + 35, 1, 40, '#fff9c4', cabinetId, detailExtras);
    cylinderY(x + w * 0.72, bottomY - 3.5, z + 35, 1, 40, '#fff9c4', cabinetId, detailExtras);
  } else if (type === 'hood-wall') {
    // ----------------------------------------------------
    // Wall Chimney Hood (Настенная купольная вытяжка)
    // ----------------------------------------------------
    // Lower horizontal canopy
    const canopyH = 65;
    box(x, y, z, w, canopyH, d, inox, cabinetId, extras);
    // Canopy beveled bottom edge
    line([x, y + canopyH, z + d], [x + w, y + canopyH, z + d], inoxBright, 1.5, cabinetId, detailExtras);

    // Grease filters on underside
    const halfW = (w - 30) / 2;
    box(x + 12, y - 2, z + 15, halfW - 4, 2, d - 30, '#a6b0b5', cabinetId, detailExtras);
    box(x + 12 + halfW, y - 2, z + 15, halfW - 4, 2, d - 30, '#a6b0b5', cabinetId, detailExtras);

    // Front control buttons
    for (let i = 0; i < 4; i++) {
      const bx = x + w / 2 - 30 + i * 20;
      cylinderZ(bx, y + canopyH / 2, z + d + 1, 3, 10, '#42484b', cabinetId, detailExtras);
    }

    // Vertical telescopic chimney duct rising upwards to ceiling/cabinet height
    const chimneyW = Math.min(260, w * 0.45);
    const chimneyD = Math.min(240, d * 0.52);
    const chimneyX = x + (w - chimneyW) / 2;
    const chimneyZ = z + 10;
    const chimneyH = h - canopyH;
    box(chimneyX, y + canopyH, chimneyZ, chimneyW, chimneyH, chimneyD, inox, cabinetId, extras);
    line([chimneyX, y + canopyH, chimneyZ + chimneyD], [chimneyX, y + h, chimneyZ + chimneyD], inoxBright, 1.2, cabinetId, detailExtras);
    line([chimneyX + chimneyW, y + canopyH, chimneyZ + chimneyD], [chimneyX + chimneyW, y + h, chimneyZ + chimneyD], inoxBright, 1.2, cabinetId, detailExtras);
  } else {
    // Fallback for generic washer / dryer / boiler / custom equipment
    box(x, y, z, w, h, d, '#d8dddb', cabinetId, extras);
    if (['washer', 'dryer'].includes(type)) {
      const radius = Math.min(w, h) * 0.28, cx = x + w / 2, cy = y + h * 0.44;
      const circlePts = circle2D(cx, cy, radius, 32).map(p => [p[0], p[1], z + d + 1]);
      face(circlePts, '#697a7a', [0, 0, 1], cabinetId, detailExtras);
      box(x + w * 0.1, y + h * 0.83, z + d + 0.1, w * 0.8, h * 0.075, 0.2, '#b7c2be', cabinetId, detailExtras);
    } else if (type === 'boiler') {
      box(x + w * 0.25, y + h * 0.08, z + d + 0.1, w * 0.5, h * 0.07, 0.2, '#a9b6b0', cabinetId, detailExtras);
    }
  }
}
