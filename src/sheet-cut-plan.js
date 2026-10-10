/**
 * Executable guillotine nesting. Coordinates are millimetres from the stock's
 * upper-left corner. Each cut crosses one currently detached parent rectangle;
 * x1/y1/x2/y2 describe the blade CENTRE, and kerfBand describes its full width.
 * The blade may overhang a stock/offcut edge when trimming less than its kerf.
 * Part dimensions are raw blanks and are never reduced by the saw width.
 */

const EPS = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = value => Number.isFinite(value) && value > 0;
const near = (a, b) => Math.abs(a - b) <= EPS;
const area = rectangle => rectangle.width * rectangle.height;
const label = part => `${part.cabinetName ?? ''} · ${part.name ?? part.id}`;
const earlier = (a, b) => a.some((value, index) => value < b[index] - EPS && a.slice(0, index).every((prior, i) => near(prior, b[i])));

function partCode(codes, part, index) {
  return (codes instanceof Map ? codes.get(part.id) : codes?.[part.id]) ?? `P${String(index + 1).padStart(4, '0')}`;
}

function addRegion(sheet, rectangle, parentRegionId = null, state = 'free') {
  const region = { id: `${sheet.id}-R${String(sheet.regions.length + 1).padStart(4, '0')}`, ...rectangle, parentRegionId, state };
  sheet.regions.push(region);
  return region;
}

/** Split along [start,start+kerf], including any blade overhang in the record. */
function split(sheet, parent, axis, start, { kind = 'separate', keep = 'low', stage } = {}) {
  const horizontal = axis === 'y', coordinate = horizontal ? 'y' : 'x', dimension = horizontal ? 'height' : 'width';
  const low = parent[coordinate], high = low + parent[dimension], end = start + sheet.kerf;
  const center = start + sheet.kerf / 2;
  const band = horizontal
    ? { x: parent.x, y: start, width: parent.width, height: sheet.kerf }
    : { x: start, y: parent.y, width: sheet.kerf, height: parent.height };
  const intersectionStart = Math.max(low, start), intersectionEnd = Math.min(high, end);
  const actualBand = { ...band, [coordinate]: intersectionStart, [dimension]: Math.max(0, intersectionEnd - intersectionStart) };
  const regions = [];
  let lowRegion, highRegion;
  if (start - low > EPS) {
    lowRegion = addRegion(sheet, { x: parent.x, y: parent.y, width: parent.width, height: parent.height, [dimension]: Math.min(high, start) - low }, parent.id, kind === 'trim' && keep === 'high' ? 'waste' : 'free');
    regions.push(lowRegion);
  }
  if (high - end > EPS) {
    highRegion = addRegion(sheet, { x: parent.x, y: parent.y, width: parent.width, height: parent.height, [coordinate]: Math.max(low, end), [dimension]: high - Math.max(low, end) }, parent.id, kind === 'trim' && keep === 'low' ? 'waste' : 'free');
    regions.push(highRegion);
  }
  const cutId = `${sheet.id}-C${String(sheet.cuts.length + 1).padStart(4, '0')}`;
  const cut = {
    id: cutId, cutId, sequence: sheet.cuts.length + 1, axis,
    x1: horizontal ? parent.x : center, y1: horizontal ? center : parent.y,
    x2: horizontal ? parent.x + parent.width : center, y2: horizontal ? center : parent.y + parent.height,
    kerf: sheet.kerf, kerfBand: band, actualKerfBand: actualBand,
    parentRegionId: parent.id, resultRegionIds: regions.map(region => region.id),
    kind, stage: stage ?? kind,
    retainedEdge: horizontal ? (keep === 'low' ? 'top' : 'bottom') : (keep === 'low' ? 'left' : 'right')
  };
  parent.state = 'split'; parent.cutId = cutId; parent.children = cut.resultRegionIds;
  sheet.cuts.push(cut);
  return keep === 'low' ? lowRegion : highRegion;
}

function makeSheet(stock, thickness, margin, kerf, index) {
  const sheet = {
    id: `sheet-${index}`, sheetId: `sheet-${index}`,
    materialId: stock.id, materialName: stock.name, thickness,
    width: Number(stock.sheetWidth), height: Number(stock.sheetHeight), margin, kerf,
    coordinateOrigin: 'stock-top-left', cutCoordinateReference: 'blade-centerline',
    grainAxis: 'y', placements: [], cuts: [], regions: [], usedArea: 0, blankArea: 0
  };
  let usable = addRegion(sheet, { x: 0, y: 0, width: sheet.width, height: sheet.height });
  sheet.rootRegionId = usable.id;
  if (margin > 0) {
    usable = split(sheet, usable, 'x', margin - kerf, { kind: 'trim', keep: 'high', stage: 'trim-left' });
    usable = split(sheet, usable, 'x', sheet.width - margin, { kind: 'trim', keep: 'low', stage: 'trim-right' });
    usable = split(sheet, usable, 'y', margin - kerf, { kind: 'trim', keep: 'high', stage: 'trim-top' });
    usable = split(sheet, usable, 'y', sheet.height - margin, { kind: 'trim', keep: 'low', stage: 'trim-bottom' });
  }
  sheet.usableRegionId = usable.id;
  return sheet;
}

function remainder(rectangle, width, height, kerf, axis) {
  const right = Math.max(0, rectangle.width - width - kerf), bottom = Math.max(0, rectangle.height - height - kerf);
  const freeAreas = axis === 'x' ? [right * rectangle.height, width * bottom] : [rectangle.width * bottom, right * height];
  const blankArea = width * height;
  const cutArea = area(rectangle) - blankArea - freeAreas[0] - freeAreas[1];
  return { largest: Math.max(...freeAreas), cutArea };
}

function findPlacement(sheet, part, allowRotate) {
  const orientations = [{ width: part.width, height: part.height, rotated: false }];
  if (allowRotate && !part.grain && !near(part.width, part.height)) orientations.push({ width: part.height, height: part.width, rotated: true });
  let best;
  for (const region of sheet.regions) {
    if (region.state !== 'free') continue;
    for (const orientation of orientations) {
      const w = orientation.width, h = orientation.height;
      if (w > region.width + EPS || h > region.height + EPS) continue;
      for (const axis of ['x', 'y']) {
        const residual = remainder(region, w, h, sheet.kerf, axis);
        const score = [Math.min(region.width - w, region.height - h), Math.max(region.width - w, region.height - h), -residual.largest, residual.cutArea, region.y, region.x, Number(orientation.rotated), Number(axis === 'y')];
        if (!best || earlier(score, best.score)) best = { ...orientation, x: region.x, y: region.y, region, axis, score };
      }
    }
  }
  return best;
}

function placePart(sheet, candidate, part) {
  let region = candidate.region;
  for (const axis of candidate.axis === 'x' ? ['x', 'y'] : ['y', 'x']) {
    const dimension = axis === 'x' ? 'width' : 'height', coordinate = axis === 'x' ? 'x' : 'y';
    if (!near(region[dimension], candidate[dimension])) region = split(sheet, region, axis, region[coordinate] + candidate[dimension]);
  }
  region.state = 'part'; region.partId = part.id; region.partCode = part.partCode; region.instanceIndex = part.instanceIndex;
  const placement = {
    partId: part.id, partCode: part.partCode, instanceIndex: part.instanceIndex, quantity: 1,
    label: label(part), materialId: part.materialId, thickness: part.thickness,
    regionId: region.id, x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height,
    rotated: candidate.rotated, grain: Boolean(part.grain), grainAxis: part.grain ? 'y' : null,
    ...(Array.isArray(part.outline) ? { outline: part.outline.map(point => candidate.rotated ? { x: part.height - point.y, y: point.x } : { x: point.x, y: point.y }), requiresContourMachining: true } : {})
  };
  sheet.placements.push(placement);
  sheet.usedArea += positive(Number(part.area)) ? Number(part.area) : part.width * part.height;
  sheet.blankArea += part.width * part.height;
}

function finishSheet(sheet) {
  const map = new Map(sheet.regions.map(region => [region.id, region]));
  const tree = id => { const region = map.get(id); return { ...region, ...(region.children ? { children: region.children.map(tree) } : {}) }; };
  sheet.tree = tree(sheet.rootRegionId);
  sheet.residuals = sheet.regions.filter(region => region.state === 'free' || region.state === 'waste').map(region => ({ ...region }));
  sheet.kerfArea = sheet.cuts.reduce((sum, cut) => sum + area(cut.actualKerfBand), 0);
  sheet.trimWasteArea = sheet.residuals.filter(region => region.state === 'waste').reduce((sum, region) => sum + area(region), 0);
  sheet.residualArea = sheet.residuals.filter(region => region.state === 'free').reduce((sum, region) => sum + area(region), 0);
  sheet.secondaryWasteArea = Math.max(0, sheet.blankArea - sheet.usedArea);
  return sheet;
}

/**
 * Returns the optimizeCutting-compatible result plus replayable cut trees.
 * partCodes can be a Map of source IDs to the full-project P codes when parts
 * have been filtered to a cabinet. Multiple quantities remain separate blanks.
 */
export function createSheetCutPlan(parts = [], materials = [], settings = {}, { partCodes } = {}) {
  const margin = Math.max(0, finite(settings.margin, 10)), kerf = Math.max(0, finite(settings.kerf, 3));
  const allowRotate = settings.allowRotate !== false, stockMap = new Map(materials.map(stock => [stock.id, stock]));
  const groups = new Map(), sheets = [], unplaced = [], warnings = [];
  let totalParts = 0;
  const reject = (part, reason) => unplaced.push({ partId: part.id, partCode: part.partCode, instanceIndex: part.instanceIndex, quantity: 1, label: label(part), materialId: part.materialId, thickness: part.thickness, width: part.width, height: part.height, reason });
  for (let index = 0; index < parts.length; index++) {
    const source = parts[index], quantity = source.quantity === undefined ? 1 : Number(source.quantity);
    const prototype = { ...source, width: Number(source.width), height: Number(source.height), thickness: Number(source.thickness), partCode: partCode(partCodes, source, index) };
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10000) {
      totalParts++; reject({ ...prototype, instanceIndex: 1 }, 'Некорректное количество деталей (целое число от 0 до 10000).'); continue;
    }
    totalParts += quantity;
    if (!quantity) continue;
    const stock = stockMap.get(prototype.materialId);
    let reason;
    if (!stock) reason = 'Материал не найден.';
    else if (![prototype.width, prototype.height, prototype.thickness].every(positive)) reason = 'Некорректные размеры детали.';
    else if (![Number(stock.sheetWidth), Number(stock.sheetHeight)].every(positive) || Number(stock.sheetWidth) <= 2 * margin || Number(stock.sheetHeight) <= 2 * margin) reason = 'Некорректные размеры листа или отступ от края.';
    else {
      const usableWidth = Number(stock.sheetWidth) - 2 * margin, usableHeight = Number(stock.sheetHeight) - 2 * margin;
      const fits = prototype.width <= usableWidth + EPS && prototype.height <= usableHeight + EPS;
      const rotatedFits = allowRotate && !prototype.grain && prototype.height <= usableWidth + EPS && prototype.width <= usableHeight + EPS;
      if (!fits && !rotatedFits) reason = 'Деталь не помещается на листе с учётом отступа и направления текстуры.';
    }
    if (reason) { for (let instanceIndex = 1; instanceIndex <= quantity; instanceIndex++) reject({ ...prototype, instanceIndex }, reason); continue; }
    const key = `${prototype.materialId}\u0000${prototype.thickness}`;
    if (!groups.has(key)) groups.set(key, { stock, thickness: prototype.thickness, parts: [] });
    for (let instanceIndex = 1; instanceIndex <= quantity; instanceIndex++) groups.get(key).parts.push({ ...prototype, instanceIndex });
    if (Array.isArray(prototype.outline)) warnings.push({ code: 'secondary-contour', partId: prototype.id, partCode: prototype.partCode, message: 'Фигурная деталь: прямые резы отделяют прямоугольную заготовку; внутренний вырез обрабатывается отдельно по контуру.' });
  }
  for (const group of groups.values()) {
    const groupSheets = [];
    group.parts.sort((a, b) => b.width * b.height - a.width * a.height || Math.max(b.width, b.height) - Math.max(a.width, a.height) || String(a.id).localeCompare(String(b.id)) || a.instanceIndex - b.instanceIndex);
    for (const part of group.parts) {
      let selectedSheet, candidate;
      for (const sheet of groupSheets) {
        const next = findPlacement(sheet, part, allowRotate);
        if (next && (!candidate || earlier(next.score, candidate.score))) { selectedSheet = sheet; candidate = next; }
      }
      if (!selectedSheet) {
        selectedSheet = makeSheet(group.stock, group.thickness, margin, kerf, sheets.length + 1);
        candidate = findPlacement(selectedSheet, part, allowRotate);
        if (!candidate) { reject(part, 'Деталь не помещается на листе.'); continue; }
        groupSheets.push(selectedSheet); sheets.push(selectedSheet);
      }
      placePart(selectedSheet, candidate, part);
    }
  }
  const completeSheets = sheets.map(finishSheet), stockArea = sheets.reduce((sum, sheet) => sum + sheet.width * sheet.height, 0), usedArea = sheets.reduce((sum, sheet) => sum + sheet.usedArea, 0);
  return {
    method: 'guillotine', guillotine: true, valid: unplaced.length === 0,
    coordinateOrigin: 'stock-top-left', cutCoordinateReference: 'blade-centerline', margin, kerf,
    errors: unplaced.map(part => ({ code: 'unplaced', partId: part.partId, instanceIndex: part.instanceIndex, message: part.reason })), warnings,
    sheets: completeSheets, unplaced, totalSheets: sheets.length, sourcePartCount: parts.length, totalParts, placedParts: totalParts - unplaced.length,
    utilization: stockArea > 0 ? Math.round(usedArea / stockArea * 100000) / 1000 : 0,
    wasteArea: Math.max(0, stockArea - usedArea), usedArea, stockArea,
    kerfArea: sheets.reduce((sum, sheet) => sum + sheet.kerfArea, 0)
  };
}
