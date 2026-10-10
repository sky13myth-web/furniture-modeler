/** Validate imported project data before it reaches templates and geometry. */
import { polygonIsSimple } from './room-geometry.js';
import { isDefaultBackMaterial } from './material-defaults.js';
import { validatePartEdgeBandingOverrides } from './part-edge-banding-model.js';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };
const record = (value, label) => { if (!isRecord(value)) fail(`Неверный формат: ${label}.`); };
const text = (value, label, max = 120) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label}: ожидается текст от 1 до ${max} символов.`);
};
const finite = (value, label, max, positive = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive ? value <= 0 : value < 0) || value > max) {
    fail(`${label}: ожидается число ${positive ? 'больше 0' : 'от 0'} до ${max}.`);
  }
};
const boolean = (value, label) => { if (typeof value !== 'boolean') fail(`${label}: ожидается логическое значение.`); };
const collection = (value, label, limit) => {
  if (!Array.isArray(value)) fail(`${label}: ожидается список.`);
  if (value.length > limit) fail(`${label}: допустимо не более ${limit} объектов.`);
};
const uniqueId = (value, ids, label) => {
  text(value, `${label}: идентификатор`);
  if (ids.has(value)) fail(`${label}: повторяющийся идентификатор.`);
  ids.add(value);
};
const materialRef = (value, ids, label, optional = false) => {
  if (optional && value === undefined) return;
  if (typeof value !== 'string' || !ids.has(value)) fail(`${label}: материал не найден.`);
};

const validateRearBraces = (braces, { label, itemLabel, positionLabel, materialIds, limit }) => {
  collection(braces, label, limit);
  const ids = new Set();
  for (const brace of braces) {
    record(brace, itemLabel); uniqueId(brace.id, ids, itemLabel);
    finite(brace.y, positionLabel, 6000);
    finite(brace.height, `${itemLabel}: высота`, 6000, true);
    if (materialIds) materialRef(brace.materialId, materialIds, itemLabel, true);
    else if (brace.materialId !== undefined) text(brace.materialId, `${itemLabel}: материал`);
  }
};

export function validateRodsSchema(rods) {
  if (rods === undefined) return;
  collection(rods, 'Гардеробные штанги', 12);
  const ids = new Set();
  for (const rod of rods) {
    record(rod, 'гардеробная штанга'); uniqueId(rod.id, ids, 'Гардеробная штанга');
    finite(rod.y, 'Штанга: высота оси от низа проёма', 6000);
    finite(rod.frontInset, 'Штанга: отступ оси от фасада', 3000);
    if (rod.length !== undefined && rod.length !== null) finite(rod.length, 'Штанга: длина', 6000, true);
    if (rod.diameter !== undefined) finite(rod.diameter, 'Штанга: диаметр', 100, true);
  }
}

export function validateDoorOpenings(openings, count) {
  if (openings === undefined) return;
  collection(openings, 'Направления открывания дверей', 8);
  if (openings.length !== count) fail('Число направлений открывания должно совпадать с числом дверей.');
  if (Array.from(openings).some(opening => !['left', 'right', 'up'].includes(opening))) fail('Направление двери должно быть left, right или up.');
}

export function validateHingesPerDoor(value, hasDoors) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 2 || value > 12) fail('Петель на дверь: ожидается целое число от 2 до 12.');
  if (!hasDoors) fail('Количество петель можно задать только для секции с дверями.');
}

export function validateLayoutSchema(layout, { materialIds } = {}) {
  const ids = new Set(); let count = 0;
  const visit = (node, depth = 0, interior = false) => {
    if (++count > 80 || depth > 10) fail('Секции: допустимо не более 80 узлов и 10 уровней.');
    record(node, 'секция'); uniqueId(node.id, ids, 'Секция');
    if (node.name !== undefined) text(node.name, 'Название секции');
    validateHingesPerDoor(node.hingesPerDoor, node.kind === 'section' && node.front === 'doors');
    if (interior) {
      if (node.appliance !== undefined) fail('Внутренний отсек не может содержать технику.');
      if (node.interiorLayout !== undefined) fail('Внутреннее наполнение нельзя вкладывать в другое внутреннее наполнение.');
      if (node.depth !== undefined && node.depth !== null) finite(node.depth, 'Внутренний отсек: глубина', 3000, true);
    } else if (node.interiorLayout !== undefined && node.kind !== 'section') fail('Внутреннее наполнение возможно только у открытой секции или секции с дверями.');
    if (node.kind === 'split') {
      if (node.rods !== undefined) fail('Гардеробные штанги задаются в отдельном проёме, а не в разделителе.');
      if (!['horizontal', 'vertical'].includes(node.axis)) fail('Секции: неверная ось разделения.');
      collection(node.children, 'Дочерние секции', 20);
      if (node.children.length < 2) fail('Секции: разделитель должен содержать хотя бы две секции.');
      collection(node.sizes, 'Пропорции секций', 20);
      if (node.sizes.length !== node.children.length || node.sizes.some(size => typeof size !== 'number' || !Number.isFinite(size) || size <= 0)) fail('Секции: пропорции должны быть положительными и соответствовать числу секций.');
      for (const child of node.children) visit(child, depth + 1, interior);
    } else if (node.kind === 'section') {
      validateRodsSchema(node.rods);
      if (interior && !['open', 'drawers'].includes(node.front)) fail('Внутренний отсек: допустимы только открытые отсеки и ящики.');
      if (!['open', 'doors', 'drawers'].includes(node.front)) fail('Секция: неверный тип фасада.');
      for (const [key, max] of [['doors', 8], ['drawers', 12], ['shelves', 20]]) {
        if (node[key] !== undefined && (!Number.isInteger(node[key]) || node[key] < 0 || node[key] > max)) fail(`Секция: ${key} должно быть целым числом от 0 до ${max}.`);
      }
      if (node.front === 'doors' && node.doors === 0 || node.front === 'drawers' && node.drawers === 0) fail('Секция: число используемых фасадов должно быть больше нуля.');
      validateDoorOpenings(node.doorOpenings, node.doors ?? 2);
      if (node.internalDrawerCount !== undefined && (!Number.isInteger(node.internalDrawerCount) || node.internalDrawerCount < 0 || node.internalDrawerCount > 12)) fail('Внутренние ящики: число должно быть целым от 0 до 12.');
      if (node.internalDrawerCount > 0 && !['doors', 'open'].includes(node.front)) fail('Внутренние ящики размещаются в открытой секции или секции с дверями.');
      if (node.internalDrawerHingeGap !== undefined) finite(node.internalDrawerHingeGap, 'Отступ внутренних ящиков от петель', 200);
      if (node.openingMechanism !== undefined && !['handle', 'push'].includes(node.openingMechanism)) fail('Механизм открывания должен быть handle или push.');
      if (node.depth !== undefined && node.depth !== null) finite(node.depth, 'Секция: глубина', 3000, true);
      if (node.back !== undefined && !['inherit', 'none', 'panel', 'solid', 'braces'].includes(node.back)) fail('Секция: неверный тип задней стенки.');
      if (node.plinthHeight !== undefined && node.plinthHeight !== null) finite(node.plinthHeight, 'Секция: высота цоколя', 6000);
      if (node.rearBraces !== undefined) validateRearBraces(node.rearBraces, { label: 'Поперечины секции', itemLabel: 'Поперечина секции', positionLabel: 'Поперечина секции: высота от дна секции', materialIds, limit: 40 });
      if (node.floor !== undefined && !['inherit', 'open'].includes(node.floor)) fail('Секция: неверный тип основания.');
      if (node.pullOutShelf !== undefined) boolean(node.pullOutShelf, 'Секция: выдвижная полка');
      if (node.drawerHeights !== undefined) {
        collection(node.drawerHeights, 'Высоты фасадов ящиков', 12);
        if (node.drawerHeights.length !== (node.drawers ?? 2)) fail('Секция: число высот должно совпадать с числом ящиков.');
        for (const value of node.drawerHeights) finite(value, 'Секция: высота фасада', 6000, true);
      }
      if (node.appliance !== undefined && node.appliance !== null) {
        record(node.appliance, 'техника');
        if (!['washer', 'dryer', 'boiler', 'custom'].includes(node.appliance.type)) fail('Секция: неизвестный тип техники.');
        for (const key of ['width', 'height', 'depth']) finite(node.appliance[key], `Техника: ${key}`, 6000, true);
        if (node.appliance.label !== undefined) text(node.appliance.label, 'Техника: название');
        if (node.appliance.useClearances !== undefined) boolean(node.appliance.useClearances, 'Техника: учитывать монтажные зазоры');
        if (node.appliance.clearances !== undefined || node.appliance.useClearances === true) {
          record(node.appliance.clearances, 'монтажные зазоры техники');
          for (const key of ['side', 'top', 'rear']) finite(node.appliance.clearances[key], `Монтажный зазор: ${key}`, 1000);
        }
      }
      if (!interior && node.interiorLayout !== undefined) {
        if (!['doors', 'open'].includes(node.front)) fail('Внутреннее наполнение возможно только у открытой секции или секции с дверями.');
        visit(node.interiorLayout, depth + 1, true);
      }
    } else fail('Секции: неверный тип узла.');
  };
  visit(layout);
  return layout;
}

/**
 * Validate the app's project object, without changing it. File wrappers such as
 * { version, project } are unwrapped by the caller. Physical layout conflicts
 * remain the geometry engine's responsibility and are not import errors.
 */
export function checkImport(project) {
  record(project, 'проект');
  text(project.name, 'Название проекта', 100);
  if (project.namingLanguage !== undefined && !['ru', 'tr', 'en'].includes(project.namingLanguage)) fail('Язык новых названий должен быть ru, tr или en.');
  record(project.room, 'помещение');
  record(project.settings, 'настройки');
  collection(project.cabinets, 'Модули', 150);
  // A single reserved slot restores the default 3 mm back in a full legacy
  // catalogue without deleting stock or changing existing cabinet references.
  const materialLimit = Array.isArray(project.materials) && project.materials.some(isDefaultBackMaterial) ? 101 : 100;
  collection(project.materials, 'Материалы', materialLimit);
  collection(project.room.windows, 'Окна', 30);

  for (const [key, label] of [['width', 'ширина'], ['depth', 'глубина'], ['height', 'высота'], ['wallThickness', 'толщина стен']]) {
    const limit = project.room.outline && (key === 'width' || key === 'depth') ? 40000 : 20000;
    finite(project.room[key], `Помещение: ${label}`, limit, true);
  }
  if (project.room.installationClearance !== undefined) {
    record(project.room.installationClearance, 'монтажные отступы комнаты');
    for (const key of ['walls', 'ceiling']) finite(project.room.installationClearance[key], `Монтажный отступ комнаты: ${key}`, 1000);
  }
  if (project.room.outline !== undefined) {
    collection(project.room.outline, 'Контур комнаты', 40);
    if (project.room.outline.length < 3) fail('Контур комнаты: требуется хотя бы 3 вершины.');
    for (const point of project.room.outline) {
      record(point, 'вершина комнаты');
      for (const key of ['x', 'z']) if (typeof point[key] !== 'number' || !Number.isFinite(point[key]) || Math.abs(point[key]) > 20000) fail('Контур комнаты: неверные координаты.');
    }
    if (!polygonIsSimple(project.room.outline)) fail('Контур комнаты: пересечения или нулевая площадь.');
  }

  const materialIds = new Set();
  for (const material of project.materials) {
    record(material, 'материал');
    uniqueId(material.id, materialIds, 'Материал');
    text(material.name, 'Название материала');
    text(material.type, 'Тип материала');
    if (typeof material.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(material.color)) fail('Материал: цвет должен иметь формат #RRGGBB.');
    finite(material.thickness, 'Материал: толщина', 60, true);
    finite(material.sheetWidth, 'Материал: ширина листа', 10000, true);
    finite(material.sheetHeight, 'Материал: длина листа', 10000, true);
    boolean(material.grain, 'Материал: направление текстуры');
    if (material.edgeBand !== undefined) finite(material.edgeBand, 'Материал: кромка', 3);
    if (material.pricePerSheet !== undefined) finite(material.pricePerSheet, 'Материал: цена за лист, TRY', 1e9);
  }

  const cabinetIds = new Set();
  for (const cabinet of project.cabinets) {
    record(cabinet, 'модуль');
    uniqueId(cabinet.id, cabinetIds, 'Модуль');
    text(cabinet.name, 'Название модуля');
    if (!['base', 'wall', 'tall'].includes(cabinet.type)) fail('Модуль: неизвестный тип.');
    finite(cabinet.width, 'Модуль: ширина', 6000, true);
    finite(cabinet.height, 'Модуль: высота', 6000, true);
    finite(cabinet.depth, 'Модуль: глубина', 3000, true);
    for (const key of ['x', 'y', 'z']) {
      if (project.room.outline && key !== 'y') {
        if (typeof cabinet[key] !== 'number' || !Number.isFinite(cabinet[key]) || Math.abs(cabinet[key]) > 20000) fail(`Модуль: координата ${key} вне допустимого диапазона.`);
      } else finite(cabinet[key], `Модуль: координата ${key}`, 20000);
    }
    for (const [key, limit, label] of [['doors', 8, 'число дверей'], ['drawers', 12, 'число ящиков'], ['shelves', 20, 'число полок']]) {
      if (cabinet.layout && cabinet[key] === undefined) continue;
      if (!Number.isInteger(cabinet[key]) || cabinet[key] < 0 || cabinet[key] > limit) fail(`Модуль: ${label} должно быть целым числом от 0 до ${limit}.`);
    }
    validateDoorOpenings(cabinet.doorOpenings, cabinet.doors ?? 0);
    for (const [key, limit, label] of [['plinth', 6000, 'высота цоколя'], ['gap', 10, 'зазор фасадов'], ['drawerSlideGap', 40, 'зазор направляющей'], ['edgeBand', 3, 'толщина кромки']]) finite(cabinet[key], `Модуль: ${label}`, limit);
    validatePartEdgeBandingOverrides(cabinet.partEdgeBanding);
    for (const [key, label] of [['backThickness', 'толщина задней стенки'], ['drawerBottomThickness', 'толщина дна ящика']]) finite(cabinet[key], `Модуль: ${label}`, 60, true);
    for (const [key, label] of [['materialId', 'материал корпуса'], ['frontMaterialId', 'материал фасадов'], ['backMaterialId', 'материал задней стенки']]) materialRef(cabinet[key], materialIds, `Модуль: ${label}`);
    const layout = cabinet.layout;
    if (layout !== undefined) validateLayoutSchema(layout, { materialIds });
    const containsDoors = node => node.kind === 'section' ? node.front === 'doors' : node.children.some(containsDoors);
    validateHingesPerDoor(cabinet.hingesPerDoor, layout ? containsDoors(layout) : cabinet.doors > 0);
    const containsDrawers = node => node.kind === 'section' ? node.front === 'drawers' || (node.interiorLayout ? containsDrawers(node.interiorLayout) : node.internalDrawerCount > 0) : node.children.some(containsDrawers);
    const drawers = layout ? containsDrawers(layout) : cabinet.drawers > 0;
    for (const [key, label] of [['drawerMaterialId', 'материал короба ящика'], ['drawerBottomMaterialId', 'материал дна ящика']]) materialRef(cabinet[key], materialIds, `Модуль: ${label}`, !drawers);
    if (cabinet.includeBack !== undefined) boolean(cabinet.includeBack, 'Модуль: задняя стенка');
    if (cabinet.includeBottom !== undefined) boolean(cabinet.includeBottom, 'Модуль: нижняя панель');
    if (cabinet.sidesToFloor !== undefined) boolean(cabinet.sidesToFloor, 'Модуль: боковины до пола');
    if (cabinet.openingMechanism !== undefined && !['handle', 'push'].includes(cabinet.openingMechanism)) fail('Механизм открывания должен быть handle или push.');
    if (cabinet.rearBraces !== undefined) {
      validateRearBraces(cabinet.rearBraces, { label: 'Задние перемычки', itemLabel: 'Задняя перемычка', positionLabel: 'Перемычка: от низа шкафа', materialIds, limit: 20 });
    }
    if (cabinet.rotation !== undefined && (typeof cabinet.rotation !== 'number' || !Number.isFinite(cabinet.rotation) || Math.abs(cabinet.rotation) > 180)) fail('Модуль: поворот должен быть от −180 до 180 градусов.');
    if (cabinet.cutout !== undefined && cabinet.cutout !== null) {
      record(cabinet.cutout, 'вырез');
      if (!['back-left', 'back-right'].includes(cabinet.cutout.corner)) fail('Модуль: неизвестный угол выреза.');
      finite(cabinet.cutout.width, 'Вырез: ширина', 6000, true);
      finite(cabinet.cutout.depth, 'Вырез: глубина', 3000, true);
      if (cabinet.cutout.width >= cabinet.width || cabinet.cutout.depth >= cabinet.depth) fail('Вырез должен быть меньше габаритов корпуса.');
    }
  }

  const windowIds = new Set();
  for (const window of project.room.windows) {
    record(window, 'окно');
    uniqueId(window.id, windowIds, 'Окно');
    if (window.kind !== undefined && !['window', 'door'].includes(window.kind)) fail('Проём: неизвестный вид.');
    if (window.wallIndex !== undefined) {
      if (!Number.isInteger(window.wallIndex) || window.wallIndex < 0 || window.wallIndex >= (project.room.outline?.length ?? 4)) fail('Окно: неизвестная стена.');
    } else if (!['back', 'left', 'right', 'front'].includes(window.wall)) fail('Окно: неизвестная стена.');
    for (const [key, label] of [['width', 'ширина'], ['height', 'высота']]) finite(window[key], `Окно: ${label}`, 20000, true);
    if (typeof window.offset !== 'number' || !Number.isFinite(window.offset) || Math.abs(window.offset) > 20000) fail('Окно: отступ от угла вне допустимого диапазона.');
    finite(window.sill, 'Окно: высота подоконника', 20000);
  }

  finite(project.settings.kerf, 'Раскрой: ширина пропила', 20);
  finite(project.settings.margin, 'Раскрой: отступ от края', 100);
  boolean(project.settings.allowRotate, 'Раскрой: разрешение поворота');
  boolean(project.settings.deductEdge, 'Раскрой: вычитание кромки');
  if (project.settings.printLanguage !== undefined && !['ru', 'tr', 'en'].includes(project.settings.printLanguage)) fail('Язык печати должен быть ru, tr или en.');
  if (project.settings.drilling !== undefined) {
    record(project.settings.drilling, 'сверловка');
    const drilling = project.settings.drilling;
    if (drilling.enabled !== undefined) boolean(drilling.enabled, 'Сверловка: включена');
    if (drilling.measureFromFinishedEdge !== undefined) boolean(drilling.measureFromFinishedEdge, 'Сверловка: отсчёт от готового края');
    if (drilling.screwsPerJoint !== undefined && drilling.screwsPerJoint !== 'auto' && drilling.screwsPerJoint !== 2) fail('Сверловка: число винтов на стык должно быть auto или 2.');
    // Legacy whole-mm spacing is accepted for import only. Drilling settings
    // normalization discards this retired flag and always uses exact stations.
    if (drilling.integerSpacing !== undefined) boolean(drilling.integerSpacing, 'Сверловка: прежний параметр отступов');
    for (const [key, limit] of [['screwDiameter', 20], ['screwLength', 150], ['clearanceDiameter', 25], ['pilotDiameter', 20], ['countersinkDiameter', 35], ['endOffset', 500], ['maxSpacing', 1000], ['rearScrewDiameter', 20], ['rearScrewLength', 150], ['rearClearanceDiameter', 25], ['rearPilotDiameter', 20], ['rearEndOffset', 500], ['rearMaxSpacing', 1000]]) {
      if (drilling[key] !== undefined) finite(drilling[key], `Сверловка: ${key}`, limit, true);
    }
    if (drilling.pilotExtraDepth !== undefined) finite(drilling.pilotExtraDepth, 'Сверловка: pilotExtraDepth', 20);
    if (drilling.rearPilotExtraDepth !== undefined) finite(drilling.rearPilotExtraDepth, 'Сверловка: rearPilotExtraDepth', 20);
    if (drilling.countersinkDepth !== undefined && drilling.countersinkDepth !== null) finite(drilling.countersinkDepth, 'Сверловка: countersinkDepth', 10, true);
  }
  if (project.settings.pricing !== undefined) {
    record(project.settings.pricing, 'цены фурнитуры');
    for (const [key, label] of [['handlePrice', 'ручка'], ['guideSetPrice', 'направляющие, комплект'], ['hingePrice', 'петля'], ['edgeBandPricePerMeter', 'кромка за метр'], ['rodPricePerMeter', 'штанга за метр'], ['rodHolderPrice', 'держатель штанги'], ['rearScrewPrice', 'винт задника'], ['rearNailPrice', 'гвоздь задника']]) {
      if (project.settings.pricing[key] !== undefined) finite(project.settings.pricing[key], `Цена: ${label}, TRY`, 1e9);
    }
  }
  return project;
}

/** Quote one semicolon-delimited CSV cell and neutralise spreadsheet formulas. */
export function csvCell(value) {
  let content = String(value ?? '');
  // Spreadsheet importers may ignore whitespace/control characters before =.
  if (/^[\s\u0000-\u001f\u007f-\u009f]*[=+@-]/u.test(content)) content = `'${content}`;
  return `"${content.replaceAll('"', '""')}"`;
}
