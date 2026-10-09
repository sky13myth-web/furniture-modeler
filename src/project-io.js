/** Validate imported project data before it reaches templates and geometry. */
import { polygonIsSimple } from './room-geometry.js';
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

export function validateDoorOpenings(openings, count) {
  if (openings === undefined) return;
  collection(openings, 'Направления открывания дверей', 8);
  if (openings.length !== count) fail('Число направлений открывания должно совпадать с числом дверей.');
  if (Array.from(openings).some(opening => !['left', 'right', 'up'].includes(opening))) fail('Направление двери должно быть left, right или up.');
}

export function validateLayoutSchema(layout) {
  const ids = new Set(); let count = 0;
  const visit = (node, depth = 0) => {
    if (++count > 80 || depth > 10) fail('Секции: допустимо не более 80 узлов и 10 уровней.');
    record(node, 'секция'); uniqueId(node.id, ids, 'Секция');
    if (node.name !== undefined) text(node.name, 'Название секции');
    if (node.kind === 'split') {
      if (!['horizontal', 'vertical'].includes(node.axis)) fail('Секции: неверная ось разделения.');
      collection(node.children, 'Дочерние секции', 20);
      if (node.children.length < 2) fail('Секции: разделитель должен содержать хотя бы две секции.');
      collection(node.sizes, 'Пропорции секций', 20);
      if (node.sizes.length !== node.children.length || node.sizes.some(size => typeof size !== 'number' || !Number.isFinite(size) || size <= 0)) fail('Секции: пропорции должны быть положительными и соответствовать числу секций.');
      for (const child of node.children) visit(child, depth + 1);
    } else if (node.kind === 'section') {
      if (!['open', 'doors', 'drawers'].includes(node.front)) fail('Секция: неверный тип фасада.');
      for (const [key, max] of [['doors', 8], ['drawers', 12], ['shelves', 20]]) {
        if (node[key] !== undefined && (!Number.isInteger(node[key]) || node[key] < 0 || node[key] > max)) fail(`Секция: ${key} должно быть целым числом от 0 до ${max}.`);
      }
      if (node.front === 'doors' && node.doors === 0 || node.front === 'drawers' && node.drawers === 0) fail('Секция: число используемых фасадов должно быть больше нуля.');
      validateDoorOpenings(node.doorOpenings, node.doors ?? 2);
      if (node.internalDrawerCount !== undefined && (!Number.isInteger(node.internalDrawerCount) || node.internalDrawerCount < 0 || node.internalDrawerCount > 12)) fail('Внутренние ящики: число должно быть целым от 0 до 12.');
      if (node.internalDrawerCount > 0 && node.front !== 'doors') fail('Внутренние ящики размещаются в секции с дверями.');
      if (node.internalDrawerHingeGap !== undefined) finite(node.internalDrawerHingeGap, 'Отступ внутренних ящиков от петель', 200);
      if (node.openingMechanism !== undefined && !['handle', 'push'].includes(node.openingMechanism)) fail('Механизм открывания должен быть handle или push.');
      if (node.depth !== undefined && node.depth !== null) finite(node.depth, 'Секция: глубина', 3000, true);
      if (node.back !== undefined && !['inherit', 'none', 'panel'].includes(node.back)) fail('Секция: неверный тип задней стенки.');
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
  collection(project.materials, 'Материалы', 100);
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
    for (const [key, label] of [['backThickness', 'толщина задней стенки'], ['drawerBottomThickness', 'толщина дна ящика']]) finite(cabinet[key], `Модуль: ${label}`, 60, true);
    for (const [key, label] of [['materialId', 'материал корпуса'], ['frontMaterialId', 'материал фасадов'], ['backMaterialId', 'материал задней стенки']]) materialRef(cabinet[key], materialIds, `Модуль: ${label}`);
    const layout = cabinet.layout;
    if (layout !== undefined) validateLayoutSchema(layout);
    const containsDrawers = node => node.kind === 'section' ? node.front === 'drawers' || node.internalDrawerCount > 0 : node.children.some(containsDrawers);
    const drawers = layout ? containsDrawers(layout) : cabinet.drawers > 0;
    for (const [key, label] of [['drawerMaterialId', 'материал короба ящика'], ['drawerBottomMaterialId', 'материал дна ящика']]) materialRef(cabinet[key], materialIds, `Модуль: ${label}`, !drawers);
    if (cabinet.includeBack !== undefined) boolean(cabinet.includeBack, 'Модуль: задняя стенка');
    if (cabinet.includeBottom !== undefined) boolean(cabinet.includeBottom, 'Модуль: нижняя панель');
    if (cabinet.sidesToFloor !== undefined) boolean(cabinet.sidesToFloor, 'Модуль: боковины до пола');
    if (cabinet.openingMechanism !== undefined && !['handle', 'push'].includes(cabinet.openingMechanism)) fail('Механизм открывания должен быть handle или push.');
    if (cabinet.rearBraces !== undefined) {
      collection(cabinet.rearBraces, 'Задние перемычки', 20);
      const braceIds = new Set();
      for (const brace of cabinet.rearBraces) {
        record(brace, 'задняя перемычка'); uniqueId(brace.id, braceIds, 'Задняя перемычка');
        finite(brace.y, 'Перемычка: от низа шкафа', 6000);
        finite(brace.height, 'Перемычка: высота', 6000, true);
        materialRef(brace.materialId, materialIds, 'Перемычка', true);
      }
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
  return project;
}

/** Quote one semicolon-delimited CSV cell and neutralise spreadsheet formulas. */
export function csvCell(value) {
  let content = String(value ?? '');
  // Spreadsheet importers may ignore whitespace/control characters before =.
  if (/^[\s\u0000-\u001f\u007f-\u009f]*[=+@-]/u.test(content)) content = `'${content}`;
  return `"${content.replaceAll('"', '""')}"`;
}
