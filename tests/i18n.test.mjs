import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, translateText, applyTranslations, translateAppDOM, defaultName, localizeMaterialPreset } from '../src/i18n.js';
import { MATERIAL_PRESETS } from '../src/standards.js';
import { translatePrintText } from '../src/print-i18n.js';

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

test('section plinth and back brace controls localize and restore without rewriting user text', () => {
  const phrases = [
    ['Цоколь в этой секции', 'Bu bölmedeki baza', 'Plinth in this section'],
    ['Высота цоколя секции', 'Bölme baza yüksekliği', 'Section plinth height'],
    ['Без цоколя', 'Bazasız', 'No plinth'],
    ['Как у шкафа', 'Dolap ayarıyla aynı', 'Use cabinet setting'],
    ['Общий задник на весь шкаф', 'Tüm dolabı kaplayan arka panel', 'Full cabinet back panel'],
    ['Выключите общий задник, чтобы настроить заднюю стенку или поперечины секции.', 'Bölmenin arka panelini veya kayıtlarını ayarlamak için dolabın ortak arka panelini kapatın.', 'Turn off the full cabinet back panel to configure a section back panel or braces.'],
    ['Поперечины секции', 'Bölme kayıtları', 'Section braces'],
    ['Добавить поперечину', 'Kayıt ekle', 'Add brace'],
    ['Высота от дна секции', 'Bölme tabanından yükseklik', 'Height from section bottom'],
    ['Толщина поперечины', 'Kayıt kalınlığı', 'Brace thickness'],
    ['Отсек до пола', 'Zemine kadar bölme', 'Floor-level section'],
    ['Сзади секции', 'Bölmenin arkasında', 'At the back of the section'],
    ['Нет свободного места для поперечины в секции.', 'Bölmede kayıt için boş yer yok.', 'No free space for a brace in this section.'],
  ];
  for (const [ru, tr, en] of phrases) {
    assert.equal(translateText(ru, 'tr'), tr); assert.equal(translateText(ru, 'en'), en);
    const label = text(ru), root = new Element('label', { title: ru }, [label]);
    applyTranslations(root, 'tr'); assert.equal(root.textContent, tr);
    applyTranslations(root, 'en'); assert.equal(root.textContent, en);
    applyTranslations(root, 'ru'); assert.equal(root.textContent, ru); assert.equal(root.getAttribute('title'), ru);
  }
  for (const phrase of [
    'Секция: высота цоколя: ожидается число от 0 до 6000.',
    'Поперечины секции: допустимо не более 40 объектов.',
    'Поперечина секции: высота от дна секции: ожидается число от 0 до 6000.',
    'Поперечина секции: материал не найден.',
  ]) for (const language of ['tr', 'en']) assert.doesNotMatch(translateText(phrase, language), /[А-Яа-яЁё]/u);
});

test('shared-door interior controls, schema feedback and the unbranded thin back preset localize consistently', () => {
  const phrases = [
    ['Внутреннее наполнение', 'İç düzen', 'Internal layout'],
    ['Внутреннее наполнение секции', 'Bölmenin iç düzeni', 'Section internal layout'],
    ['Выберите внутреннюю секцию · перетаскивайте перегородки · колесо — масштаб', 'İç bölme seçin · bölme panellerini sürükleyin · tekerlek ile yakınlaştırın', 'Select an internal section · drag partitions · scroll to zoom'],
    ['Цоколь и задняя конструкция настраиваются для выбранной секции.', 'Baza ve arka yapı, seçili bölme için ayarlanır.', 'The plinth and rear construction are configured for the selected section.'],
    ['Внутри секции с дверями нажмите «Внутреннее наполнение»: разделите отсеки и разместите полки и ящики за общими дверями.', 'Kapaklı bölmede «İç düzen» düğmesine basın: ortak kapakların arkasındaki bölmeleri ayırın, rafları ve çekmeceleri yerleştirin.', 'In a door section, choose «Internal layout»: divide the compartments and arrange shelves and drawers behind the shared doors.'],
    ['Вернуться к дверям', 'Kapaklara dön', 'Back to doors'],
    ['Создать внутренние отсеки', 'İç bölmeler oluştur', 'Create internal compartments'],
    ['Настроить внутренние отсеки', 'İç bölmeleri düzenle', 'Configure internal compartments'],
    ['Внутренний отсек', 'İç bölme', 'Internal compartment'],
    ['Одни двери закрывают все внутренние отсеки. Полки и ящики настраиваются внутри.', 'Ortak kapaklar tüm iç bölmeleri kapatır. Raflar ve çekmeceler içeride düzenlenir.', 'One set of doors covers all internal compartments. Shelves and drawers are configured inside.'],
    ['Удалить внутренний отсек', 'İç bölmeyi sil', 'Delete internal compartment'],
    ['Секция с общими дверями', 'Ortak kapaklı bölme', 'Section with shared doors'],
    ['Ящики внутри', 'İç çekmeceler', 'Drawers inside'],
    ['Полки внутри отсека', 'İç bölmedeki raflar', 'Shelves inside compartment'],
  ];
  for (const [ru, tr, en] of phrases) {
    assert.equal(translateText(ru, 'tr'), tr); assert.equal(translateText(ru, 'en'), en);
    const root = new Element('button', { 'aria-label': ru }, [text(ru)]);
    applyTranslations(root, 'tr'); assert.equal(root.textContent, tr);
    applyTranslations(root, 'en'); assert.equal(root.textContent, en);
    applyTranslations(root, 'ru'); assert.equal(root.textContent, ru); assert.equal(root.getAttribute('aria-label'), ru);
  }
  assert.equal(defaultName('thinBack', 'ru'), 'ДВП · задник · 3 мм');
  assert.equal(defaultName('thinBack', 'tr'), 'Sert lif levha · arkalık · 3 mm');
  assert.equal(defaultName('thinBack', 'en'), 'Hardboard · back panel · 3 mm');
  assert.equal(defaultName('thinBackType', 'ru'), 'ДВП');
  assert.equal(defaultName('thinBackType', 'tr'), 'Sert lif levha');
  assert.equal(defaultName('thinBackType', 'en'), 'Hardboard');
  for (const phrase of [
    'Внутренний отсек не может содержать технику.',
    'Внутреннее наполнение нельзя вкладывать в другое внутреннее наполнение.',
    'Внутреннее наполнение возможно только у секции с дверями.',
    'Внутренний отсек: допустимы только открытые отсеки и ящики.',
    'Внутренний отсек: глубина: ожидается число больше 0 до 3000.',
  ]) for (const language of ['tr', 'en']) assert.doesNotMatch(translateText(phrase, language), /[А-Яа-яЁё]/u);
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

test('section back, plinth and interior geometry messages translate while preserving the exact quoted section name', () => {
  const name = '«Моя секция Özel»', messages = [
    `задняя перемычка выходит за высоту секции ${name}; положение задаётся от низа чистого проёма.`,
    'задняя перемычка не помещается по глубине корпуса или секции.',
    `глубина секции ${name} превышает корпус или внешний проём.`,
    `секция ${name} не касается основания корпуса; собственный цоколь применяется только к нижней секции.`,
    `полки секции ${name} пересекают внутреннее наполнение; задайте их во внутренних отсеках.`,
  ];
  for (const message of messages) for (const language of ['tr', 'en']) {
    const translated = translateText(message, language);
    assert.doesNotMatch(translated.replace(/«[^»]*»/gu, ''), /[А-Яа-яЁё]/u, `${language}: ${message}`);
    if (message.includes(name)) assert.ok(translated.includes(name), 'user section text is kept verbatim');
    assert.equal(translateText(message, 'ru'), message);
  }
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

test('door hardware and price controls translate completely while preserving numeric prices and user materials', () => {
  const phrases = ['Фурнитура дверей', 'Петель на дверь', 'Рассчитать по высоте', 'Количество петель по высоте — предварительная оценка. Уточните его по массе двери и выбранной фурнитуре.', 'Секция с цоколем всегда имеет собственное дно.', 'шт.', 'компл. (пара)', 'Цены и смета', 'Цена листа', 'Цена ручки', 'Цена комплекта направляющих', 'Цена петли', 'Цена кромки за метр', 'Ориентир', 'Вручную', 'Цена не задана', 'Вернуть ориентиры', 'Цены сохраняются в файле проекта. Нулевая цена допустима для имеющихся запасов.', 'Цена за целый лист указанного размера.', 'Толщина детали отличается от выбранного материала. Выберите материал нужной толщины; цена другого листа не применяется.', 'Цены сохраняются в файле проекта и используются для новых проектов на этом компьютере. Нулевая цена допустима для имеющихся запасов.', 'Для фурнитуры указан расход по проекту; минимальные упаковки поставщика не учитываются. Исходная цена кромки приведена с НДС 20%.', 'число петель на дверь должно быть целым числом от 2 до 12.'];
  for (const phrase of phrases) for (const language of ['tr', 'en']) {
    const result = translateText(phrase, language);
    assert.notEqual(result, phrase, `${language}: ${phrase}`);
    assert.doesNotMatch(result, /[А-Яа-яЁё]/u, `${language}: ${phrase}`);
  }
  assert.equal(translateText('Цены и смета', 'tr'), 'Fiyatlar ve maliyet hesabı');
  assert.equal(translateText('Петель на дверь', 'en'), 'Hinges per door');
  const custom = new Element('strong', { 'data-user-text': '' }, [text('Моя белая плита')]);
  const amount = new Element('input', { type: 'number', value: '0' });
  const caption = new Element('span', {}, [text('Цены и смета')]);
  const root = new Element('div', {}, [caption, custom, amount]);
  for (const language of ['tr', 'en', 'ru', 'tr']) {
    applyTranslations(root, language);
    assert.equal(caption.textContent, translateText('Цены и смета', language));
    assert.equal(custom.textContent, 'Моя белая плита');
    assert.equal(amount.getAttribute('value'), '0');
  }
  const writes = caption.firstChild.writes;
  applyTranslations(root, 'tr');
  assert.equal(caption.firstChild.writes, writes, 'repeated observer passes do not rewrite unchanged prices dialog text');
});

test('clothes rail controls, diagram numbers, automatic length and room printing translate completely', () => {
  const phrases = ['Штанги для одежды', 'Гардеробные штанги', 'Штанга', 'Добавить штангу', 'Удалить штангу', 'Высота оси от дна секции', 'Отступ оси от переднего края', 'Длина штанги', 'Длина автоматически', 'Диаметр штанги', 'Держатели штанги', 'Держатели перекладин', 'Длина реза, мм', 'Диаметр, мм', 'Высота установки, мм', 'Штанги считаются отдельно от листовых материалов.', 'Цена штанги за метр', 'Цена держателя штанги', 'Нет свободного места для штанги в секции.', 'План помещения', 'Печать плана помещения', 'Сохранить план помещения', '3D-вид помещения', 'Печать 3D-вида помещения', 'Сохранить 3D помещения'];
  for (const phrase of phrases) for (const language of ['tr', 'en']) assert.doesNotMatch(translateText(phrase, language), /[А-Яа-яЁё]/u, `${language}: ${phrase}`);
  assert.equal(translateText('Штанга 1', 'tr'), 'Askı borusu 1');
  assert.equal(translateText('Штанга 1160 · Ø25', 'en'), 'Clothes rail 1160 · Ø25');
  assert.equal(translateText('Штанга · 1160 мм · Ø25', 'tr'), 'Askı borusu · 1160 mm · Ø25');
  assert.equal(translateText('Длина автоматически: 860 мм', 'tr'), 'Otomatik uzunluk: 860 mm');
  const caption = new Element('p', {}, [text('Длина автоматически: 860 мм')]);
  for (const language of ['tr', 'en', 'ru']) { applyTranslations(caption, language); assert.equal(caption.textContent, translateText('Длина автоматически: 860 мм', language)); }
});

test('clothes rail diagnostics translate engineering templates while preserving quoted user section names', () => {
  const custom = 'Мой открытый отсек';
  const messages = [`штанги в секции «${custom}» требуют открытого или дверного проёма без техники; при внутреннем наполнении задайте штангу во внутреннем отсеке.`, `штанга не помещается в секцию «${custom}» с учётом диаметра и торцевых зазоров 2 мм; проверьте длину, высоту и отступ от фасада.`, ...['панелью', 'техникой', 'коробом ящика', 'другой штангой'].map(target => `штанга в секции «${custom}» пересекается с ${target}; измените её высоту, длину или отступ от фасада.`)];
  for (const message of messages) for (const language of ['tr', 'en']) {
    const translated = translateText(message, language);
    assert.ok(translated.includes(`«${custom}»`));
    assert.doesNotMatch(translated.replace(`«${custom}»`, ''), /[А-Яа-яЁё]/u);
  }
});

test('removing outer doors preserves internal contents and the new hardboard labels translate without changing old aliases', () => {
  const phrases = [
    'Снятие дверей сохраняет внутреннее наполнение.',
    'Вернуться к секции',
    'Для внутренних отсеков сначала измените положение штанг или удалите их.',
    'ДВП · задник · 3 мм', 'ДВП',
  ];
  for (const phrase of phrases) for (const language of ['tr', 'en']) assert.doesNotMatch(translateText(phrase, language), /[А-Яа-яЁё]/u);
  assert.equal(translateText('Тонкий задник · 3 мм', 'en'), 'Thin back panel · 3 mm');
  assert.equal(translateText('Тонкая древесноволокнистая панель', 'tr'), 'Lif levha');
  const caption = new Element('p', {}, [text('Снятие дверей сохраняет внутреннее наполнение.')]);
  for (const language of ['tr', 'en', 'ru']) { applyTranslations(caption, language); assert.equal(caption.textContent, translateText(phrases[0], language)); }
});

test('factory diagnostics translate after part IDs and custom names without rewriting their labels', () => {
  const diagnostics = [
    ['Толщина детали не совпадает с материалом.', 'Parça kalınlığı malzemeyle uyuşmuyor.', 'Part thickness does not match the material.'],
    ['Некорректный контур детали.', 'Geçersiz parça konturu.', 'Invalid part outline.'],
    ['Некорректные размеры детали.', 'Geçersiz parça ölçüleri.', 'Invalid part dimensions.'],
  ];
  for (const label of ['S1', 'Мой шкаф · Левая: особая деталь']) for (const [ru, tr, en] of diagnostics) {
    const source = `${label}: ${ru}`;
    for (const [language, expected] of [['ru', ru], ['tr', tr], ['en', en]]) {
      assert.equal(translateText(source, language), `${label}: ${expected}`);
      assert.equal(translatePrintText(source, language), `${label}: ${expected}`);
    }
    const caption = new Element('p', {}, [text(source)]);
    for (const language of ['tr', 'en', 'ru']) {
      applyTranslations(caption, language);
      assert.equal(caption.textContent, translateText(source, language));
    }
  }
  assert.equal(translateText('Мой шкаф: неизвестная заметка.', 'en'), 'Мой шкаф: неизвестная заметка.');
});

test('internal drawer hinge clearance controls translate and restore while keeping the legacy label', () => {
  const label = 'Отступ под петли / сторона';
  const hint = 'Общий отступ для ящиков за этими дверями. Применяется у левой и правой стенок; внутренние перегородки этот отступ не получают. Размер уточните по выбранным петлям.';
  const caption = new Element('label', { title: hint }, [text(label)]);
  const help = new Element('p', {}, [text(hint)]);
  const value = new Element('input', { type: 'number', value: '17.5' });
  const root = new Element('div', {}, [caption, help, value]);
  for (const language of ['ru', 'tr', 'en', 'ru']) {
    applyTranslations(root, language);
    assert.equal(caption.textContent, translateText(label, language));
    assert.equal(caption.getAttribute('title'), translateText(hint, language));
    assert.equal(help.textContent, translateText(hint, language));
    assert.equal(value.getAttribute('value'), '17.5');
    if (language !== 'ru') {
      assert.equal(translateText(label, language), translateText('Отступ от петель / сторона', language));
      assert.doesNotMatch(help.textContent, /[А-Яа-яЁё]/u);
    }
  }
  assert.equal(translateText(label, 'en'), 'Hinge clearance / side');
  assert.match(translateText(hint, 'en'), /internal partitions do not receive this clearance/);
  assert.match(translateText(hint, 'tr'), /iç bölme panellerinde bu boşluk bırakılmaz/);
});
