import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, translateText, applyTranslations, translateAppDOM, defaultName, localizeMaterialPreset } from '../src/i18n.js';
import { MATERIAL_PRESETS } from '../src/standards.js';

class TextNode {
  constructor(text) { this.nodeType = 3; this.current = text; this.writes = 0; }
  get nodeValue() { return this.current; }
  set nodeValue(value) { this.current = value; this.writes++; }
  get textContent() { return this.current; }
}
class Element {
  constructor(tag = 'div', attrs = {}, children = []) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.childNodes = children; this.writes = 0;
    for (const child of children) child.parentElement = this;
  }
  get id() { return this.attrs.id; }
  get firstChild() { return this.childNodes[0]; }
  get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  getAttribute(name) { return this.attrs[name]; }
  setAttribute(name, value) { this.attrs[name] = value; this.writes++; }
  matches() {
    return this.hasAttribute('data-user-text') || this.attrs['data-i18n'] === 'off' ||
      ['project-name', 'room-cabinet-label'].includes(this.attrs.class) || this.hasAttribute('data-room-cabinet') ||
      this.tagName === 'OPTION' && this.parentElement?.tagName === 'SELECT' && /(?:materialId|MaterialId)$/.test(this.parentElement.attrs['data-field'] || '');
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
}
const text = value => new TextNode(value);

test('UI dictionaries cover navigation, dialogs and dynamic dimensions in both target languages', () => {
  assert.deepEqual(LANGUAGES, ['ru', 'tr', 'en']);
  assert.equal(translateAppDOM, applyTranslations);
  assert.equal(translateText('Добавить шкаф', 'tr'), 'Dolap ekle');
  assert.equal(translateText('Открытая ниша для техники', 'en'), 'Open appliance niche');
  assert.equal(translateText('Секция 2 · 600 мм', 'en'), 'Section 2 · 600 mm');
  assert.equal(translateText('  Ширина проёма  ', 'tr'), '  Açıklık genişliği  ');
  assert.equal(translateText('Слева', 'en'), 'Left view');
  assert.equal(translateText('слева 100 · справа 200 мм', 'en'), 'left 100 · right 200 mm');
  assert.equal(translateText('Шкафчик', 'en'), 'Шкафчик');
  assert.equal(translateText('Незнакомое название', 'en'), 'Незнакомое название');
  assert.equal(translateText('Раскрой', 'unknown'), 'Раскрой');
});

test('long contextual hints and generated part names have no untranslated Russian fragments', () => {
  const phrases = [
    'Выберите секцию · перетаскивайте перегородки · колесо — масштаб',
    'Глубина корпуса в мм · фасад добавляется снаружи',
    'Без дна и цоколя под этой секцией. Соседние секции сохраняют свою конструкцию.',
    'Тяните стену целиком, угол — по одной оси. Alt — свободный угол. Проём двигается вдоль стены. Шаг 10 мм.',
    'Шкаф должен оставаться внутри комнаты с монтажными отступами от стен и потолка. Перемещение не сохранено.',
    'Небольшие виды компонуются на одном листе. Сложные чертежи получают дополнительные страницы.',
    'Начальные значения для планирования. Требования конкретной модели из её инструкции имеют приоритет. Глубину техники указывайте полностью, включая выступающие части.',
    'Боковина левая', 'Боковина правая', 'Дно корпуса · участок 2', 'Вертикальная перегородка',
    'Горизонтальная перегородка', 'полка 1', 'Задняя перемычка',
    'Секции: пропорции должны быть положительными и соответствовать числу секций.',
    'Контур комнаты: пересечения или нулевая площадь.',
    'Дверной проём должен начинаться от пола: задайте высоту подоконника 0 мм.',
  ];
  for (const language of ['tr', 'en']) for (const phrase of phrases) {
    assert.doesNotMatch(translateText(phrase, language), /[А-Яа-яЁё]/u, `${language}: ${phrase}`);
  }
});

test('sides-to-floor setting and its construction hint translate and restore', () => {
  const hint = 'Боковины опираются на пол. Дно остаётся над цоколем; спереди — цокольная планка.';
  assert.equal(translateText('Боковины до пола', 'tr'), 'Zemine kadar yan paneller');
  assert.equal(translateText('Боковины до пола', 'en'), 'Sides to floor');
  assert.equal(translateText(hint, 'en'), 'The side panels rest on the floor. The bottom remains above the plinth, with a plinth panel at the front.');
  const label = text('Боковины до пола'), explanation = text(hint);
  const root = new Element('div', {}, [label, explanation]);
  for (const language of ['tr', 'en']) {
    applyTranslations(root, language);
    assert.doesNotMatch(explanation.nodeValue, /[А-Яа-яЁё]/u);
  }
  applyTranslations(root, 'ru');
  assert.equal(label.nodeValue, 'Боковины до пола');
  assert.equal(explanation.nodeValue, hint);
});

test('drawing zoom, 3D print and fixing-center controls translate in both languages', () => {
  const controls = [
    ['Приблизить чертёж', 'Çizimi yakınlaştır', 'Zoom in drawing'],
    ['Отдалить чертёж', 'Çizimi uzaklaştır', 'Zoom out drawing'],
    ['Уместить чертёж', 'Çizimi ekrana sığdır', 'Fit drawing'],
    ['Печать 3D-вида', '3B görünümü yazdır', 'Print 3D view'],
    ['Сохранить лист 3D', '3B sayfasını kaydet', 'Save 3D sheet'],
    ['3D-вид шкафа', 'Dolabın 3B görünümü', 'Cabinet 3D view'],
    ['Текущий ракурс', 'Mevcut görünüş', 'Current viewpoint'],
    ['Фасады открыты', 'Ön paneller açık', 'Fronts open'],
    ['Фасады закрыты', 'Ön paneller kapalı', 'Fronts closed'],
    ['Масштаб чертежа', 'Çizim ölçeği', 'Drawing zoom'],
    ['Между осями крепления', 'Bağlantı eksenleri arası', 'Between fixing centers'],
    ['Высота чистого проёма', 'Net açıklık yüksekliği', 'Clear opening height'],
    ['Область чертежа', 'Çizim alanı', 'Drawing area'],
    ['Колесо — масштаб · перетаскивание — перемещение', 'Tekerlek — yakınlaştırma · sürükleme — kaydırma', 'Scroll to zoom · drag to pan'],
  ];
  for (const [ru, tr, en] of controls) {
    assert.equal(translateText(ru, 'tr'), tr);
    assert.equal(translateText(ru, 'en'), en);
    assert.equal(translateText(ru, 'ru'), ru);
  }
  const label = text('Высота чистого проёма');
  const button = new Element('button', { 'aria-label': 'Приблизить чертёж', title: 'Уместить чертёж' }, [label]);
  applyTranslations(button, 'tr');
  applyTranslations(button, 'en');
  applyTranslations(button, 'ru');
  assert.equal(label.nodeValue, 'Высота чистого проёма');
  assert.equal(button.attrs['aria-label'], 'Приблизить чертёж');
  assert.equal(button.attrs.title, 'Уместить чертёж');
});

test('fixing-axis explanations distinguish center distances from a clear opening', () => {
  const hints = [
    'Оси винтов проходят по центру толщины горизонтальных плит. Это расстояние между осями, а не высота проёма.',
    'Снизу нет плиты — нижней оси крепления нет.',
  ];
  assert.equal(translateText(hints[1], 'en'), 'No bottom panel — no lower fixing axis.');
  assert.equal(translateText(hints[1], 'tr'), 'Altta panel yok — alt bağlantı ekseni yok.');
  for (const hint of hints) for (const language of ['tr', 'en']) assert.doesNotMatch(translateText(hint, language), /[А-Яа-яЁё]/u);
  const explanation = text(hints[0]), root = new Element('p', {}, [explanation]);
  for (const language of ['tr', 'en', 'ru']) applyTranslations(root, language);
  assert.equal(explanation.nodeValue, hints[0]);
});

test('each furniture door opening direction translates without changing room-door terminology', () => {
  const directions = [
    ['Направление открытия', 'Açılma yönü', 'Opening direction'],
    ['Влево', 'Sola', 'To the left'], ['Вправо', 'Sağa', 'To the right'], ['Вверх', 'Yukarı', 'Upwards'],
    ['Петли слева', 'Sol menteşeler', 'Hinges on the left'],
    ['Петли справа', 'Sağ menteşeler', 'Hinges on the right'],
    ['Петли сверху', 'Üst menteşeler', 'Hinges at the top'],
  ];
  for (const [ru, tr, en] of directions) {
    assert.equal(translateText(ru, 'tr'), tr);
    assert.equal(translateText(ru, 'en'), en);
  }
  for (const index of [1, 2, 8]) {
    assert.equal(translateText(`Дверь ${index} · открывание`, 'tr'), `Kapak ${index} · açılma`);
    assert.equal(translateText(`Дверь ${index} · открывание`, 'en'), `Door ${index} · opening`);
    assert.equal(translateText(`Дверь ${index}`, 'en'), `Door ${index}`);
  }
  assert.equal(translateText('Дверь', 'tr'), 'Kapı');
  const label = text('Дверь 2 · открывание'), root = new Element('span', {}, [label]);
  for (const language of ['tr', 'en', 'ru']) applyTranslations(root, language);
  assert.equal(label.nodeValue, 'Дверь 2 · открывание');
});

test('room corner selection and appliance constraint feedback translate in both languages', () => {
  const phrases = [
    'Выделите углы рамкой на пустом плане. Shift + щелчок — добавить угол. Delete — удалить выбранные углы или проём.',
    'В плане должны остаться минимум три угла.',
    'После удаления углов стены пересекаются. Изменение не сохранено.',
    'Очистить выделение',
    'Размер ограничен конструкцией, техникой и монтажными зазорами.',
    'Техника и монтажные зазоры не помещаются в секции.',
    'Введите допустимые размеры шкафа и секций.',
    'Введите допустимый размер секции.',
    'Эту перегородку нельзя переместить.',
    'Секция не найдена.', 'Перегородка не найдена.',
    'Введите допустимую глубину секции.',
    'Удаление уберёт все выбранные углы одним действием. Контур должен оставаться корректным.',
  ];
  for (const phrase of phrases) for (const language of ['tr', 'en']) assert.doesNotMatch(translateText(phrase, language), /[А-Яа-яЁё]/u);
  assert.equal(translateText('Размер ограничен конструкцией, техникой и монтажными зазорами.', 'tr'), 'Ölçü, dolap yapısı, cihaz boyutları ve montaj boşluklarıyla sınırlandırıldı.');
  assert.equal(translateText('Размер ограничен конструкцией, техникой и монтажными зазорами.', 'en'), 'The dimension is limited by the cabinet construction, appliance size and installation clearances.');
  for (const count of [1, 4, 40]) {
    assert.equal(translateText(`Выбрано углов: ${count}`, 'tr'), `Seçili köşe sayısı: ${count}`);
    assert.equal(translateText(`Выбрано углов: ${count}`, 'en'), `Selected corners: ${count}`);
    assert.equal(translateText(`Углов выбрано: ${count}`, 'tr'), `Seçili köşe sayısı: ${count}`);
    assert.equal(translateText(`Углов выбрано: ${count}`, 'en'), `Selected corners: ${count}`);
  }
});

test('room plan zoom controls and modifier hint translate and restore', () => {
  for (const [ru, tr, en] of [
    ['Приблизить', 'Yakınlaştır', 'Zoom in'],
    ['Отдалить', 'Uzaklaştır', 'Zoom out'],
    ['Вписать план', 'Planı sığdır', 'Fit plan'],
    ['Изменить ширину шкафа', 'Dolap genişliğini değiştir', 'Resize cabinet width'],
    ['Изменить глубину шкафа', 'Dolap derinliğini değiştir', 'Resize cabinet depth'],
    ['Тяните ручки на плане, чтобы изменить ширину и глубину.', 'Genişliği ve derinliği değiştirmek için plandaki tutamaçları sürükleyin.', 'Drag the handles in the plan to change the width and depth.'],
    ['Размер шкафа ограничен техникой, соседней мебелью и границами помещения.', 'Dolap ölçüsü, cihazlar, komşu mobilyalar ve oda sınırlarıyla sınırlandırıldı.', 'The cabinet size is limited by appliances, neighbouring furniture and the room boundaries.'],
    ['Размер ограничен стеной, соседним шкафом или монтажным отступом.', 'Ölçü, duvar, komşu dolap veya montaj boşluğuyla sınırlandırıldı.', 'The dimension is limited by a wall, a neighbouring cabinet or an installation clearance.'],
    ['Размер ограничен габаритами техники и конструкцией шкафа.', 'Ölçü, cihaz boyutları ve dolap yapısıyla sınırlandırıldı.', 'The dimension is limited by the appliance size and cabinet construction.'],
    ['Введите допустимую ширину или глубину шкафа.', 'Geçerli bir dolap genişliği veya derinliği girin.', 'Enter a valid cabinet width or depth.'],
    ['Масштаб плана', 'Plan ölçeği', 'Plan zoom'],
    ['Шкаф скользит вдоль препятствия. Монтажные отступы сохранены.', 'Dolap engel boyunca kayıyor. Montaj boşlukları korunuyor.', 'The cabinet slides along the obstacle. Installation clearances are preserved.'],
    ['Колесо — масштаб; средняя кнопка или Space + перетаскивание — сдвиг плана', 'Tekerlek — yakınlaştırma; orta düğme veya Space + sürükleme — planı kaydırma', 'Scroll to zoom; middle button or Space + drag to pan the plan'],
  ]) {
    assert.equal(translateText(ru, 'tr'), tr);
    assert.equal(translateText(ru, 'en'), en);
    const label = text(ru), root = new Element('span', {}, [label]);
    for (const language of ['tr', 'en', 'ru']) applyTranslations(root, language);
    assert.equal(label.nodeValue, ru);
  }
});

test('dynamic errors translate their template and preserve quoted custom project names', () => {
  const message = '«Левый шкаф»: техника «Новая сушилка» не помещается в секцию «Моя секция» по глубине: не хватает 50 мм (нужно 650, доступно 600 мм).';
  for (const language of ['tr', 'en']) {
    const result = translateText(message, language);
    for (const name of ['«Левый шкаф»', '«Новая сушилка»', '«Моя секция»']) assert.ok(result.includes(name));
    assert.doesNotMatch(result.replace(/«[^»]*»/gu, ''), /[А-Яа-яЁё]/u);
    assert.ok(result.includes('50 mm'));
  }
  assert.equal(translateText(message, 'ru'), message);
});

test('cabinet extensions, internal drawer controls and edge totals use consistent terms', () => {
  const phrases = [
    ['Расширить слева', 'Sola genişlet', 'Extend to the left'],
    ['Расширить справа', 'Sağa genişlet', 'Extend to the right'],
    ['Напольный шкаф', 'Alt dolap', 'Base cabinet'],
    ['Подвесной шкаф', 'Duvar dolabı', 'Wall cabinet'],
    ['Антресоль', 'Üst dolap', 'Top cabinet'],
    ['Внутренние ящики за дверками', 'Kapakların arkasındaki iç çekmeceler', 'Internal drawers behind doors'],
    ['Зазор под петли', 'Menteşe boşluğu', 'Hinge clearance'],
    ['Выдвинуть внутренние ящики', 'İç çekmeceleri dışarı çek', 'Extend internal drawers'],
    ['Задвинуть внутренние ящики', 'İç çekmeceleri kapat', 'Close internal drawers'],
    ['Открыть все фасады', 'Tüm ön panelleri aç', 'Open all fronts'],
    ['Закрыть все фасады', 'Tüm ön panelleri kapat', 'Close all fronts'],
    ['Поворот +90°', 'Döndür +90°', 'Rotate +90°'],
    ['Удалить проём', 'Açıklığı sil', 'Delete opening'],
    ['Удалить выбранные точки', 'Seçili noktaları sil', 'Delete selected points'],
    ['Механизм открытия', 'Açılma mekanizması', 'Opening mechanism'],
    ['Ручка', 'Kulp', 'Handle'],
    ['Нажимной push-to-open', 'Bas-aç (push-to-open)', 'Push-to-open'],
    ['Внутренний фасад', 'İç çekmece önü', 'Internal drawer front'],
    ['Внутренние ящики выдвинуты', 'İç çekmeceler dışarıda', 'Internal drawers extended'],
    ['Внутренние ящики закрыты', 'İç çekmeceler kapalı', 'Internal drawers closed'],
    ['Кромление', 'Kenar bantlama', 'Edge banding'],
    ['Расход кромки, м', 'Kenar bandı tüketimi, m', 'Edge band length, m'],
    ['Всего кромки', 'Toplam kenar bandı', 'Total edge band'],
    ['Общий метраж', 'Toplam uzunluk', 'Total length'],
    ['Группы кромки', 'Kenar bandı grupları', 'Edge band groups'],
    ['Антресоль над выбранным шкафом', 'Seçili dolabın üstüne üst dolap', 'Top cabinet above the selected cabinet'],
    ['Повернуть на 90°', '90° döndür', 'Rotate by 90°'],
    ['Открыть внутренние ящики', 'İç çekmeceleri aç', 'Open internal drawers'],
    ['Закрыть внутренние ящики', 'İç çekmeceleri kapat', 'Close internal drawers'],
    ['Отступ от петель / сторона', 'Menteşe boşluğu / yan', 'Hinge clearance / side'],
    ['Кромка, м', 'Kenar bandı, m', 'Edge band, m'],
    ['Кромка по материалам', 'Malzemeye göre kenar bandı', 'Edge band by material'],
  ];
  for (const [ru, tr, en] of phrases) {
    assert.equal(translateText(ru, 'tr'), tr);
    assert.equal(translateText(ru, 'en'), en);
    assert.equal(translateText(ru, 'ru'), ru);
  }
  const label = text('Внутренние ящики за дверками'), root = new Element('label', {}, [label]);
  for (const language of ['tr', 'en', 'ru']) applyTranslations(root, language);
  assert.equal(label.nodeValue, 'Внутренние ящики за дверками');
  for (const phrase of [
    'Внутренние ящики: число должно быть целым от 0 до 12.',
    'Внутренние ящики размещаются в секции с дверями.',
    'Механизм открывания должен быть handle или push.',
    'внутренний ящик за дверями не помещается с учётом отступа для петель; увеличьте проём или уменьшите число ящиков.',
    'Метраж кромки считается по выбранным внешним сторонам готовой детали. У фигурных деталей внутренние ступени выреза автоматически не оклеиваются.',
    'Размещение пересекает другой шкаф или нарушает границы помещения и монтажные отступы.',
    'Выделите углы рамкой или с Shift. Delete удаляет выбранное.',
    'Эту сторону нельзя расширить: проверьте задний вырез, ширину шкафа и число секций.',
    'Антресоль размещается над выбранным шкафом с тем же поворотом.',
    'Высота установки навесного шкафа — 1510 мм или ниже, если ограничивает потолок.',
    'Шкаф размещается в свободном месте на полу. Секции можно заполнить после добавления.',
    'Выберите шкаф для установки антресоли.',
    'Отступ для петель задайте по их паспорту. Ручка внутреннего ящика учитывается отдельным отступом в глубину.',
  ]) for (const language of ['tr', 'en']) assert.doesNotMatch(translateText(phrase, language), /[А-Яа-яЁё]/u);
  assert.equal(translateText('Количество', 'tr'), 'Adet');
  assert.equal(translateText('м', 'en'), 'm');
});

test('DOM language switching is reversible and repeated calls do not mutate nodes or attributes', () => {
  const label = text('Габариты шкафа');
  const button = new Element('button', { title: 'Удалить секцию', 'aria-label': 'Добавить шкаф' }, [label]);
  const root = new Element('div', {}, [button]);
  applyTranslations(root, 'tr');
  assert.equal(label.nodeValue, 'Dolap ölçüleri');
  assert.equal(button.attrs.title, 'Bölmeyi sil');
  const writes = [label.writes, button.writes];
  applyTranslations(root, 'tr');
  assert.deepEqual([label.writes, button.writes], writes);
  applyTranslations(root, 'en');
  assert.equal(label.nodeValue, 'Cabinet dimensions');
  assert.equal(button.attrs['aria-label'], 'Add cabinet');
  applyTranslations(root, 'ru');
  assert.equal(label.nodeValue, 'Габариты шкафа');
  assert.equal(button.attrs.title, 'Удалить секцию');
});

test('reused nodes adopt freshly rendered source text and attribute changes', () => {
  const label = text('Ширина');
  const root = new Element('div', { title: 'Полки' }, [label]);
  applyTranslations(root, 'en');
  label.nodeValue = 'Высота';
  root.setAttribute('title', 'Двери');
  applyTranslations(root, 'tr');
  assert.equal(label.nodeValue, 'Yükseklik');
  assert.equal(root.attrs.title, 'Kapaklar');
  applyTranslations(root, 'ru');
  assert.equal(label.nodeValue, 'Высота');
  assert.equal(root.attrs.title, 'Двери');
});

test('custom names, input values, document SVG and material choices remain untouched', () => {
  const custom = new Element('strong', { 'data-user-text': '' }, [text('Шкаф')]);
  const svg = new Element('svg', { 'data-i18n': 'off' }, [text('Полки')]);
  const input = new Element('input', { placeholder: 'Название проекта' }); input.value = 'Шкаф';
  const textarea = new Element('textarea', {}, [text('Секция')]); textarea.value = 'Мой текст';
  const option = new Element('option', {}, [text('Материал')]);
  const select = new Element('select', { 'data-field': 'backMaterialId' }, [option]);
  const root = new Element('div', {}, [custom, svg, input, textarea, select]);
  for (const language of ['tr', 'en', 'ru']) applyTranslations(root, language);
  assert.equal(custom.textContent, 'Шкаф');
  assert.equal(svg.textContent, 'Полки');
  assert.equal(input.value, 'Шкаф');
  assert.equal(textarea.value, 'Мой текст');
  assert.equal(textarea.textContent, 'Секция');
  assert.equal(option.textContent, 'Материал');
  applyTranslations(custom.firstChild, 'en');
  assert.equal(custom.textContent, 'Шкаф');
  applyTranslations(input, 'en');
  assert.equal(input.attrs.placeholder, 'Project name');
  assert.equal(input.value, 'Шкаф');
});

test('language selector translates its accessible label while retaining language endonyms', () => {
  const selector = new Element('select', { id: 'interface-language', 'aria-label': 'Язык интерфейса' }, [new Element('option', {}, [text('Русский')])]);
  applyTranslations(selector, 'en');
  assert.equal(selector.attrs['aria-label'], 'Interface language');
  assert.equal(selector.textContent, 'Русский');
  applyTranslations(selector, 'ru');
  assert.equal(selector.attrs['aria-label'], 'Язык интерфейса');
});

test('generated stage headings reverse correctly while custom cabinet titles are protected', () => {
  const generated = new Element('h1', { id: 'stage-title' }, [text('Контур помещения')]);
  applyTranslations(generated, 'tr');
  assert.equal(generated.textContent, 'Oda konturu');
  applyTranslations(generated, 'en');
  assert.equal(generated.textContent, 'Room outline');
  applyTranslations(generated, 'ru');
  assert.equal(generated.textContent, 'Контур помещения');
  const custom = new Element('h1', { id: 'stage-title', 'data-user-text': '' }, [text('Контур помещения')]);
  applyTranslations(custom, 'en');
  assert.equal(custom.textContent, 'Контур помещения');
});

test('new project, cabinet, section and material names use the chosen language with Turkish as default', () => {
  assert.equal(defaultName('project'), 'Yeni proje');
  assert.equal(defaultName('cabinet', 'tr', 3), 'Dolap 3');
  assert.equal(defaultName('cabinet', 'en', 3), 'Cabinet 3');
  assert.equal(defaultName('cabinet', 'ru', 3), 'Шкаф 3');
  assert.equal(defaultName('defaultProject', 'tr'), 'Dolap · İstanbul');
  assert.equal(defaultName('defaultCabinet', 'en'), 'Cabinet with drawers in the middle');
  assert.equal(defaultName('base', 'tr'), 'Yeni alt dolap');
  assert.equal(defaultName('wall', 'en'), 'New wall cabinet');
  assert.equal(defaultName('tall', 'ru'), 'Новый пенал');
  assert.equal(defaultName('material', 'tr'), 'Yeni MDF');
  assert.equal(defaultName('material', 'en'), 'New MDF');
  assert.equal(defaultName('upperSection', 'tr'), 'Üst bölme');
  assert.equal(defaultName('drawerSection', 'en'), 'Middle drawers');
  assert.equal(defaultName('lowerSection', 'en'), 'Lower section');
  assert.equal(defaultName('project', 'unsupported'), 'Yeni proje');
  assert.equal(defaultName('Личный шкаф', 'en'), 'Личный шкаф');
});

test('factory material naming preserves article identity, real gauges and sources without mutating presets', () => {
  const original = structuredClone(MATERIAL_PRESETS);
  for (const preset of MATERIAL_PRESETS) for (const language of ['ru', 'tr', 'en']) {
    const material = localizeMaterialPreset(preset, language);
    for (const key of ['id', 'decorCode', 'manufacturer', 'sourceUrl', 'thickness', 'sheetWidth', 'sheetHeight', 'grain']) assert.equal(material[key], preset[key]);
    assert.ok(material.name.includes(preset.decorCode));
    assert.ok(material.name.endsWith(`${preset.thickness} ${language === 'ru' ? 'мм' : 'mm'}`));
    if (language !== 'ru') {
      assert.doesNotMatch(material.name, /[А-Яа-яЁё]/u);
      assert.doesNotMatch(material.type, /[А-Яа-яЁё]/u);
    }
  }
  assert.deepEqual(MATERIAL_PRESETS, original);
  assert.match(localizeMaterialPreset(MATERIAL_PRESETS[0], 'en').name, /White VT_068/);
  assert.match(localizeMaterialPreset(MATERIAL_PRESETS[0], 'ru').name, /Белый VT_068/);
  assert.equal(localizeMaterialPreset(MATERIAL_PRESETS.find(p => p.decorCode === 'MAT_068'), 'tr').type, 'Mat kaplamalı MDF');
  const custom = { ...MATERIAL_PRESETS[0], name: 'Моя белая плита' };
  assert.deepEqual(localizeMaterialPreset(custom, 'en'), custom);
  const renamedFactory = { ...MATERIAL_PRESETS[0], name: 'Yıldız MDFLAM · Мой материал VT_068 · 18 мм' };
  assert.deepEqual(localizeMaterialPreset(renamedFactory, 'en'), renamedFactory);
});
