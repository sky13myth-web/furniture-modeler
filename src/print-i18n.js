import { MATERIAL_PRESETS } from './standards.js';
import { localizeMaterialPreset, defaultName } from './i18n.js';

/** Print vocabulary only. Callers keep user-entered names separate. */
export function printLanguage(language, fallback = 'ru') {
  return ['ru', 'tr', 'en'].includes(language) ? language : fallback;
}

export function printNumber(value, language = 'ru') {
  return Number(value).toLocaleString({ ru: 'ru-RU', tr: 'tr-TR', en: 'en-US' }[printLanguage(language)], { maximumFractionDigits: 3 });
}

const materialNames = MATERIAL_PRESETS.map(material => {
  const localized = Object.fromEntries(['ru','tr','en'].map(language => [language,localizeMaterialPreset(material,language).name]));
  // Older catalogue entries mixed a translated decor with a Russian unit.
  // Recognise those exact factory spellings without matching arbitrary names.
  const aliases = Object.values(localized).flatMap(name => ['мм','mm'].map(unit => name.replace(/(?:мм|mm)$/,unit)));
  return { aliases:new Set([material.name,...aliases]),localized };
});

/** Match whole verified catalogue names, including saved names in any supported
 * language. Merely resembling a factory name never renames a custom material. */
export function translateMaterialName(name, language = 'ru') {
  const value = String(name ?? ''), entry = materialNames.find(material => material.aliases.has(value));
  return entry ? entry.localized[printLanguage(language)] : translateBuiltInName(value,language,'material');
}

const builtInNames = [
  ['project','Шкаф · İstanbul','Dolap · İstanbul','Cabinet · İstanbul'],
  ['project','Напольная ниша · пример','Zemine açık niş · örnek','Floor niche · example'],
  ['project','Новый проект','Yeni proje','New project'],
  ['cabinet','Шкаф с ящиками в середине','Ortası çekmeceli dolap','Cabinet with middle drawers'],
  ['cabinet','Новая тумба','Yeni alt dolap','New base cabinet'],
  ['cabinet','Новый навесной шкаф','Yeni duvar dolabı','New wall cabinet'],
  ['cabinet','Новый пенал','Yeni boy dolabı','New tall cabinet'],
  ['cabinet','Ниша для техники и боковые шкафы','Cihaz nişi ve yan dolaplar','Appliance niche and side cabinets'],
  ['section','Верхняя секция','Üst bölme','Upper section'],
  ['section','Ящики в середине','Orta çekmeceler','Middle drawers'],
  ['section','Нижняя секция','Alt bölme','Lower section'],
  ['section','Левый шкаф','Sol dolap','Left cabinet'],
  ['section','Правый шкаф','Sağ dolap','Right cabinet'],
  ['section','Верхний шкаф','Üst dolap','Upper cabinet'],
  ['section','Выдвижная полка','Çekilir raf','Pull-out shelf'],
  ['section','Техника на полу','Zemindeki cihaz','Appliance on floor'],
  ['section','Открытая секция','Açık bölme','Open section'],
  ['appliance','Стиральная машина','Çamaşır makinesi','Washing machine'],
  ['appliance','Сушильная машина','Kurutma makinesi','Dryer'],
  ['appliance','Бойлер','Boyler','Boiler'],
  ['appliance','Своё оборудование','Özel cihaz','Custom appliance'],
  ['material','Новый МДФ','Yeni MDF','New MDF'],
].map(([kind,ru,tr,en]) => ({ kind, aliases:new Set([ru,tr,en,defaultName(ru,'tr'),defaultName(ru,'en')]), localized:{ru,tr:defaultName(ru,'tr'),en:defaultName(ru,'en')} }));

/** Exact known defaults only; custom titles never undergo word replacement. */
export function translateBuiltInName(name, language = 'ru', kind = 'any') {
  const value = String(name ?? ''), lang = printLanguage(language);
  let base = value, copies = 0;
  if (kind==='any'||kind==='cabinet') {
    let match;
    while ((match=/^(.+) · (?:копия|kopya|copy)$/.exec(base))) { base=match[1];copies++; }
  }
  const entry = builtInNames.find(entry => (kind==='any'||kind===entry.kind) && (!copies||entry.kind==='cabinet') && entry.aliases.has(base));
  const numbered = /^(?:Шкаф|Dolap|Cabinet) ([1-9]\d*)$/.exec(base);
  const translated = entry ? entry.localized[lang] : numbered && (kind==='any'||kind==='cabinet') ? `${{ru:'Шкаф',tr:'Dolap',en:'Cabinet'}[lang]} ${numbered[1]}` : null;
  return translated === null ? value : translated + ` · ${defaultName('copy',lang)}`.repeat(copies);
}

const phrases = [
  ['Перспектива','Perspektif','Perspective'],
  ['3D-вид шкафа','Dolabın 3B görünümü','Cabinet 3D view'],['Текущий ракурс','Mevcut görünüş','Current viewpoint'],
  ['Фасады открыты','Ön paneller açık','Fronts open'],['Фасады закрыты','Ön paneller kapalı','Fronts closed'],
  ['Направление открытия','Açılma yönü','Opening direction'],['Влево','Sola','To the left'],['Вправо','Sağa','To the right'],['Вверх','Yukarı','Upwards'],
  ['Петли слева','Sol menteşeler','Hinges on the left'],['Петли справа','Sağ menteşeler','Hinges on the right'],['Петли сверху','Üst menteşeler','Hinges at the top'],
  ['Механизм открытия','Açılma mekanizması','Opening mechanism'],['Ручка','Kulp','Handle'],['Нажимной push-to-open','Bas-aç (push-to-open)','Push-to-open'],
  ['Внутренний ящик','İç çekmece','Internal drawer'],['Внутренний фасад','İç çekmece önü','Internal drawer front'],
  ['внутренние ящики','iç çekmeceler','internal drawers'],['Внутренние ящики выдвинуты','İç çekmeceler dışarıda','Internal drawers extended'],['Внутренние ящики закрыты','İç çekmeceler kapalı','Internal drawers closed'],
  ['Расход кромки, м','Kenar bandı tüketimi, m','Edge band length, m'],['Всего кромки','Toplam kenar bandı','Total edge band'],['м','m','m'],
  ['Деталей с кромкой','Kenar bantlı parça sayısı','Parts with edge band'],['Расход кромки рассчитан по готовым размерам и выбранным сторонам каждой детали.','Kenar bandı tüketimi bitmiş ölçüler ve her parçanın seçilen kenarları üzerinden hesaplanır.','Edge band length is calculated from finished dimensions and the selected edges of each part.'],
  ['Внутренние фасады и короба находятся за дверями. I соответствует внутреннему чертежу; F обозначает только наружные фасады.','İç ön paneller ve kutular kapakların arkasındadır. I iç çizimle eşleşir; F yalnızca dış ön panelleri belirtir.','Internal fronts and boxes sit behind the doors. I references the interior drawing; F identifies only external fronts.'],
  ['Выберите шкаф для печати 3D-вида.','3B görünümü yazdırmak için bir dolap seçin.','Select a cabinet to print its 3D view.'],
  ['Не удалось создать изображение для печати.','Yazdırma görüntüsü oluşturulamadı.','Could not create the print image.'],
  ['Между осями крепления','Bağlantı eksenleri arası','Between fixing centers'],
  ['Между осями крепления, мм','Bağlantı eksenleri arası, mm','Between fixing centers, mm'],
  ['Высота чистого проёма','Net açıklık yüksekliği','Clear opening height'],
  ['Нет нижней оси крепления','Alt bağlantı ekseni yok','No lower fixing axis'],
  ['Нет пары осей крепления','İki bağlantı ekseni yok','No pair of fixing axes'],
  ['Оси винтов проходят по центру толщины горизонтальных плит. Это расстояние между осями, а не высота проёма.','Vida eksenleri yatay panellerin kalınlık merkezinden geçer. Bu, açıklık yüksekliği değil, eksenler arası mesafedir.','Screw axes pass through the thickness centers of horizontal panels. This is the distance between fixing centers, not the opening height.'],
  ['Нет нижней плиты — нет нижней оси крепления.','Altta panel yok — alt bağlantı ekseni yok.','No bottom panel — no lower fixing axis.'],
  ['Вид спереди','Ön görünüş','Front view'],['Вид сзади','Arka görünüş','Back view'],
  ['Вид слева','Sol görünüş','Left view'],['Вид справа','Sağ görünüş','Right view'],
  ['План сверху','Üst görünüş','Top view'],['Внутренние секции','İç bölmeler','Internal sections'],
  ['Проект корпусной мебели','Panel mobilya projesi','Cabinet furniture project'],
  ['Корпус','Gövde','Carcass'],['Секция','Bölme','Section'],['секция','bölme','section'],
  ['Оборудование','Cihaz','Appliance'],['Стиральная машина','Çamaşır makinesi','Washing machine'],
  ['Сушильная машина','Kurutma makinesi','Dryer'],['Бойлер','Boyler','Boiler'],
  ['Двери','Kapaklar','Doors'],['Дверь','Kapak','Door'],['дверь','kapak','door'],
  ['Ящики','Çekmeceler','Drawers'],['ящик','çekmece','drawer'],['Открытая','Açık','Open'],
  ['Фасад ящика','Çekmece önü','Drawer front'],['Фасад','Ön panel','Front'],['Фасады','Ön paneller','Fronts'],
  ['Тип','Tür','Type'],['Название','Ad','Name'],['Содержимое','İç düzen','Contents'],
  ['Ширина, мм','Genişlik, mm','Width, mm'],['Высота, мм','Yükseklik, mm','Height, mm'],
  ['Глубина, мм','Derinlik, mm','Depth, mm'],['Толщина, мм','Kalınlık, mm','Thickness, mm'],
  ['Материал','Malzeme','Material'],['МДФ','MDF','MDF'],['Проём: Ш × В, мм','Açıklık: G × Y, mm','Opening: W × H, mm'],
  ['Полезная глубина, мм','Kullanılabilir derinlik, mm','Usable depth, mm'],
  ['Оборудование: Ш × В × Г, мм','Cihaz: G × Y × D, mm','Appliance: W × H × D, mm'],
  ['Требуемая ниша: Ш × В × Г, мм','Gerekli niş: G × Y × D, mm','Required niche: W × H × D, mm'],
  ['Боковой / сторона, мм','Yan boşluk / her yan, mm','Side clearance / each side, mm'],
  ['Сверху, мм','Üst boşluk, mm','Top clearance, mm'],['Сзади, мм','Arka boşluk, mm','Rear clearance, mm'],
  ['Проверка','Kontrol','Fit check'],['Помещается','Sığıyor','Fits'],['Не помещается','Sığmıyor','Does not fit'],
  ['Поперечина','Kuşak','Brace'],['Ш × В × Толщина, мм','G × Y × Kalınlık, mm','W × H × Thickness, mm'],
  ['Низ от основания, мм','Dolap tabanından alt kenar, mm','Bottom edge above cabinet base, mm'],
  ['Деталь / секция','Parça / bölme','Part / section'],['Раскрой: Ш × В, мм','Kesim: G × Y, mm','Cut size: W × H, mm'],
  ['Кромка, мм','Kenar bandı, mm','Edge band, mm'],['верх','üst','top'],['низ','alt','bottom'],['лево','sol','left'],['право','sağ','right'],
  ['Все размеры в миллиметрах','Tüm ölçüler milimetredir','All dimensions are in millimetres'],
  ['все размеры в миллиметрах','tüm ölçüler milimetredir','all dimensions are in millimetres'],
  ['все размеры в мм','tüm ölçüler mm','all dimensions in mm'],
  ['F = размеры фасада; внешние цепочки = проёмы','F = ön panel ölçüleri; dış ölçü zincirleri = açıklıklar','F = front dimensions; outer dimension chains = openings'],
  ['внутренние секции','iç bölmeler','internal sections'],['фасады','ön paneller','fronts'],
  ['задние поперечины','arka kuşaklar','rear braces'],['техника и монтажные зазоры','cihazlar ve montaj boşlukları','appliances and installation clearances'],
  ['детали и короба ящиков','parçalar ve çekmece kutuları','parts and drawer boxes'],
  ['чертежи, фасады и детали','çizimler, ön paneller ve parçalar','drawings, fronts and parts'],
  ['чертежи','çizimler','drawings'],['Печать / сохранить PDF','Yazdır / PDF kaydet','Print / save PDF'],
  ['Ортогональные виды','Dik izdüşüm görünüşleri','Orthographic views'],
  ['Размеры проёмов, фасадов и деталей — в ведомостях','Açıklık, ön panel ve parça ölçüleri listelerde','Opening, front and part dimensions are in the schedules'],
  ['Деталь раскроя','Kesim parçası','Cutting part'],['Деталь','Parça','Part'],['толщина','kalınlık','thickness'],
  ['Лист','Levha','Sheet'],['Раскрой','Kesim planı','Cutting plan'],['Пропил','Testere kesim payı','Saw kerf'],
  ['Отступ от края листа','Levha kenar boşluğu','Sheet edge margin'],
  ['Номера деталей приведены в ведомости','Parça numaraları listede verilmiştir','Part numbers are listed in the schedule'],
  ['Размер, мм','Ölçü, mm','Size, mm'],['Не размещено','Yerleştirilemedi','Unplaced'],['деталей','parça','parts'],
  ['Шкаф','Dolap','Cabinet'],['Ширина заготовки мм','Kesim genişliği mm','Blank width mm'],['Высота заготовки мм','Kesim yüksekliği mm','Blank height mm'],
  ['Толщина мм','Kalınlık mm','Thickness mm'],['Готовая ширина мм','Bitmiş genişlik mm','Finished width mm'],['Готовая высота мм','Bitmiş yükseklik mm','Finished height mm'],
  ['Текстура','Desen yönü','Grain'],['Кромка сверху','Üst kenar bandı','Top edge band'],['Кромка снизу','Alt kenar bandı','Bottom edge band'],
  ['Кромка слева','Sol kenar bandı','Left edge band'],['Кромка справа','Sağ kenar bandı','Right edge band'],['Контур JSON','Kontur JSON','Outline JSON'],['Да','Evet','Yes'],['Нет','Hayır','No'],
  ['Чистый геометрический проём между панелями. Полезная глубина учитывает задний вырез; монтажные зазоры оборудования задаются отдельно.','Paneller arasındaki net açıklık. Kullanılabilir derinlik arka köşe kesimini dikkate alır; cihaz montaj boşlukları ayrıca ayarlanır.','Clear opening between panels. Usable depth accounts for the rear cutout; appliance installation clearances are specified separately.'],
  ['Обозначения F соответствуют фронтальному чертежу. Размеры фасадов учитывают заданный зазор и накладку.','F işaretleri ön görünüşle eşleşir. Ön panel ölçüleri ayarlanan boşluğu ve bindirmeyi içerir.','F references match the front drawing. Front sizes account for the specified gap and overlay.'],
  ['Ведомость корпусов. Глубина корпуса указана без накладного фасада.','Gövde listesi. Gövde derinliği bindirme ön panel olmadan belirtilmiştir.','Carcass schedule. Carcass depth excludes the overlay front.'],
  ['Требуемая ниша: ширина техники + два боковых зазора; высота + зазор сверху; глубина + зазор сзади. Проверка использует чистый проём и его полезную глубину. «—» означает, что монтажные зазоры отключены. Все размеры и зазоры задаются для выбранной техники.','Gerekli niş: cihaz genişliği + iki yan boşluk; yükseklik + üst boşluk; derinlik + arka boşluk. Kontrol net açıklığı ve kullanılabilir derinliği kullanır. «—» montaj boşluklarının kapalı olduğunu belirtir. Ölçüler ve boşluklar seçilen cihaz için ayarlanır.','Required niche: appliance width + two side clearances; height + top clearance; depth + rear clearance. Fit uses the clear opening and its usable depth. «—» means installation clearances are disabled. Dimensions and clearances are specified for the selected appliance.'],
  ['Высота монтажа измеряется от общего основания шкафа, включая цоколь. Обозначения C соответствуют виду сзади.','Montaj yüksekliği baza dahil dolabın toplam tabanından ölçülür. C işaretleri arka görünüşle eşleşir.','Mounting height is measured from the complete cabinet base, including the plinth. C references match the back view.'],
  ['Точные размеры каждой детали раскроя из инженерной модели. Короба ящиков перечислены отдельно от фасадов. Для L-деталей далее приведён контур.','Mühendislik modelinden her kesim parçasının gerçek ölçüleri. Çekmece kutuları ön panellerden ayrı listelenir. L biçimli parçaların konturları sonraki sayfalardadır.','Exact cutting dimensions for each part from the engineering model. Drawer boxes are listed separately from fronts. Outlines for L-shaped parts follow.'],
];
const vocabulary = new Map(phrases.map(([ru,tr,en]) => [ru,{tr,en}]));
const prefixes = [
  ['Низ от основания шкафа:','Dolap tabanından alt kenar:','Bottom edge above cabinet base:'],
  ['Ниша с зазорами:','Boşluklar dahil niş:','Niche including clearances:'],
  ['Проём','Açıklık','Opening'],['Полезная глубина','Kullanılabilir derinlik','Usable depth'],
  ['Корпус без фасада:','Ön panelsiz gövde:','Carcass excluding front:'],['Помещение:','Oda:','Room:'],
  ['Дверной проём','Kapı açıklığı','Door opening'],['Раскрой','Kesim','Cut size'],
  ['после кромки','kenar bandı sonrası','after edge banding'],['Масштаб ≈','Ölçek ≈','Scale ≈'],
  ['при печати 100%','%100 baskıda','at 100% print size'],
];

export function translatePrintText(text, language = 'ru') {
  const value = String(text ?? ''), lang = printLanguage(language);
  if (lang === 'ru') return translatePartName(value,lang);
  if (vocabulary.has(value)) return vocabulary.get(value)[lang];
  const part = translatePartName(value,lang);
  if (part !== value) return part;
  if (/^Зазоры: бок\/сторона /.test(value)) return value.replace('Зазоры: бок/сторона',lang==='tr'?'Boşluklar: her yan':'Clearances: each side').replace('сверху',lang==='tr'?'üst':'top').replace('сзади',lang==='tr'?'arka':'rear').replaceAll('мм','mm');
  let translated = value;
  for (const phrase of ['Лист','Пропил','Отступ от края листа','деталей']) translated = translated.replaceAll(phrase,vocabulary.get(phrase)[lang]);
  for (const [ru,tr,en] of prefixes) translated = translated.replaceAll(ru,lang==='tr'?tr:en);
  translated = translated.replace(/\b(F\d+) · (дверь|ящик)/g, (_,id,kind) => `${id} · ${vocabulary.get(kind)[lang]}`);
  return translated.replaceAll('мм','mm').replace(/(\d+)–(\d+) из (\d+)/g, lang==='tr'?'$1–$2 / $3':'$1–$2 of $3');
}

const partTerms = [
  ['Боковина левая','Sol yan panel','Left side'],['Боковина правая','Sağ yan panel','Right side'],
  ['Крышка','Üst panel','Top panel'],['Дно корпуса','Gövde tabanı','Carcass bottom'],
  ['Возвратная боковина выреза','Köşe kesimi dönüş yan paneli','Cutout return side'],
  ['Задняя стенка выреза','Köşe kesimi arka paneli','Cutout rear panel'],['Задняя стенка','Arka panel','Back panel'],
  ['задняя стенка выреза','köşe kesimi arka paneli','cutout rear panel'],['задняя стенка','arka panel','back panel'],
  ['Горизонтальная перегородка','Yatay ara panel','Horizontal divider'],['Вертикальная перегородка','Dikey ara panel','Vertical divider'],
  ['Цокольная планка','Baza ön paneli','Plinth front'],['Задняя перемычка','Arka kuşak','Rear brace'],
  ['выдвижная полка','çekilir raf','pull-out shelf'],['Полка','Raf','Shelf'],['полка','raf','shelf'],
  ['Фасад ящика','Çekmece önü','Drawer front'],['Дверь','Kapak','Door'],
  ['боковина левая','sol yan panel','left side'],['боковина правая','sağ yan panel','right side'],
  ['передняя стенка','ön panel','front panel'],['задняя стенка','arka panel','back panel'],['дно','taban','bottom'],
];

/** Translate generated construction terms while preserving the custom middle
 * of "Секция N · user name · component" exactly, even if it contains dots. */
export function translatePartName(name, language = 'ru') {
  const value = String(name ?? ''), lang = printLanguage(language);
  const sectionDrawer = /^Секция (\d+)(?: · (.*))? · ((?:Ящик|Внутренний ящик) \d+ · (?:боковина левая|боковина правая|передняя стенка|задняя стенка|дно|фасад))$/.exec(value);
  if (sectionDrawer) return `${{ru:'Секция',tr:'Bölme',en:'Section'}[lang]} ${sectionDrawer[1]}${sectionDrawer[2] ? ` · ${translateBuiltInName(sectionDrawer[2],lang,'section')}` : ''} · ${translatePartName(sectionDrawer[3],lang)}`;
  const section = /^Секция (\d+)(?: · (.*))? · ([^·]+)$/.exec(value);
  if (section) return `${{ru:'Секция',tr:'Bölme',en:'Section'}[lang]} ${section[1]}${section[2] ? ` · ${translateBuiltInName(section[2],lang,'section')}` : ''} · ${translatePartName(section[3],lang)}`;
  const internal = /^Внутренний ящик (\d+) · (.*)$/.exec(value);
  if(internal)return `${{ru:'Внутренний ящик',tr:'İç çekmece',en:'Internal drawer'}[lang]} ${internal[1]} · ${internal[2]==='фасад'?{ru:'фасад',tr:'ön panel',en:'front'}[lang]:translatePartName(internal[2],lang)}`;
  const drawer = /^Ящик (\d+) · (.*)$/.exec(value);
  if (drawer) return `${{ru:'Ящик',tr:'Çekmece',en:'Drawer'}[lang]} ${drawer[1]} · ${translatePartName(drawer[2],lang)}`;
  const segment = /^(.*) · участок (\d+)$/.exec(value);
  if (segment) return `${translatePartName(segment[1],lang)} · ${{ru:'участок',tr:'bölüm',en:'segment'}[lang]} ${segment[2]}`;
  for (const [ru,tr,en] of partTerms) {
    if (value === ru) return {ru,tr,en}[lang];
    if (value.startsWith(`${ru} `) && /^\d+$/.test(value.slice(ru.length+1))) return `${{ru,tr,en}[lang]} ${value.slice(ru.length+1)}`;
  }
  return value;
}
