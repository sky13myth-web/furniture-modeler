// Published scopes and manufacturer examples. These are not certification rules.
// Millimetres throughout; editable workshop values are separate from standards.
export const STANDARDS = [
  {
    id: 'ts-en-14749',
    title: 'TS EN 14749 + A1 · безопасность шкафов',
    description: 'Безопасность и испытания готовых домашних и кухонных шкафов и столешниц. Программа помогает подготовить проект; устойчивость и прочность подтверждаются испытаниями изделия.',
    url: 'https://files.tse.org.tr/2023/06/MART-1.pdf',
  },
  {
    id: 'ts-en-1116',
    title: 'TS EN 1116 · сопряжение кухонных размеров',
    description: 'Координация размеров кухонной мебели и техники. Размеры конкретной техники и её монтажные отступы берутся из инструкции производителя.',
    url: 'https://files.tse.org.tr/2023/06/MART-1.pdf',
  },
  {
    id: 'ts-en-622-5',
    title: 'TS EN 622-5 · MDF',
    description: 'Требования к древесноволокнистым плитам сухого способа производства. Тип для сухих или влажных условий и характеристики проверяются по документам выбранной плиты.',
    url: 'https://www.yildizentegre.com/uploads/products/documents/levha-kullanim-kilavuzu.pdf?modified=20251019222139',
  },
  {
    id: 'en-14322',
    title: 'EN 14322 / TS EN 14322 · меламиновые панели',
    description: 'Определения, требования и классификация плит с меламиновой облицовкой для интерьера. Применимость к конкретному MDFLAM подтверждается поставщиком.',
    url: 'https://www.dinmedia.de/en/standard/din-en-14322/342677365',
  },
  {
    id: 'en-717-1',
    title: 'EN 717-1 · выделение формальдегида',
    description: 'Камерный метод измерения выделения формальдегида древесными плитами. Цвет и геометрия модели не определяют класс эмиссии; требуется документ производителя.',
    url: 'https://www.dinmedia.de/en/standard/din-en-717-1/72155632',
  },
];

export const MATERIAL_PRESETS = [
  { id: 'yildiz-white-18', name: 'Yıldız MDFLAM · Beyaz VT_068 · 18 мм', type: 'MDFLAM', color: '#eeeee9', thickness: 18, sheetWidth: 2100, sheetHeight: 2800, grain: false, edgeBand: 1, manufacturer: 'Yıldız Entegre', decorCode: 'VT_068', sourceUrl: 'https://www.yildizentegre.com/urunler/mdflam-suntalam/beyaz-vt-068' },
  { id: 'yildiz-oak-18', name: 'Yıldız MDFLAM · Valley Oak YT_10E · 18 мм', type: 'MDFLAM', color: '#bb9268', thickness: 18, sheetWidth: 2100, sheetHeight: 2800, grain: true, edgeBand: 1, manufacturer: 'Yıldız Entegre', decorCode: 'YT_10E', sourceUrl: 'https://www.yildizentegre.com/en/products/melamine-faced-mdfpb/valley-oak-yt-10e' },
  { id: 'yildiz-black-18', name: 'Yıldız MDFLAM · Siyah VT_037 · 18 мм', type: 'MDFLAM', color: '#303433', thickness: 18, sheetWidth: 2100, sheetHeight: 2800, grain: false, edgeBand: 1, manufacturer: 'Yıldız Entegre', decorCode: 'VT_037', sourceUrl: 'https://www.yildizentegre.com/en/products/melamine-faced-mdfpb/black-vt-037' },
  { id: 'yildiz-white-8', name: 'Yıldız MDFLAM · Beyaz VT_068 · 8 мм', type: 'MDFLAM', color: '#eeeee9', thickness: 8, sheetWidth: 2100, sheetHeight: 2800, grain: false, edgeBand: 0, manufacturer: 'Yıldız Entegre', decorCode: 'VT_068', sourceUrl: 'https://www.yildizentegre.com/urunler/mdflam-suntalam/beyaz-vt-068' },
  { id: 'yildiz-white-25', name: 'Yıldız MDFLAM · Beyaz VT_068 · 25 мм', type: 'MDFLAM', color: '#eeeee9', thickness: 25, sheetWidth: 2100, sheetHeight: 2800, grain: false, edgeBand: 1, manufacturer: 'Yıldız Entegre', decorCode: 'VT_068', sourceUrl: 'https://www.yildizentegre.com/urunler/mdflam-suntalam/beyaz-vt-068' },
  { id: 'yildiz-matt-white-18', name: 'Yıldız Kapak Panel · Matt White MAT_068 · 18 мм', type: 'MDF с матовым покрытием', color: '#ecebe6', thickness: 18, sheetWidth: 1220, sheetHeight: 2800, grain: false, edgeBand: 1, manufacturer: 'Yıldız Entegre', decorCode: 'MAT_068', sourceUrl: 'https://www.yildizentegre.com/en/products/front-panel/mat-white-mat-068' },
  { id: 'yildiz-gloss-white-18', name: 'Yıldız Kapak Panel · High Gloss White HG_068 · 18 мм', type: 'MDF с глянцевым покрытием', color: '#f1f1eb', thickness: 18, sheetWidth: 1220, sheetHeight: 2800, grain: false, edgeBand: 1, manufacturer: 'Yıldız Entegre', decorCode: 'HG_068', sourceUrl: 'https://www.yildizentegre.com/en/products/front-panel/hg-white-hg-068' },
];

export const HARDWARE_PRESETS = [
  {
    id: 'side-13', name: 'Боковые направляющие · 13 мм', drawerSlideGap: 13, gap: 2,
    description: 'Зазор с каждой стороны ящика. Настройка мастерской для боковых направляющих; например DZ4505 задаёт 12.7 мм +0.2…+0.5 мм. Перед изготовлением сверить выбранную модель.',
    url: 'https://www.accuride-europe.com/en/products/full-extension-slide-with-bayonet-fixings-dz4505',
  },
  {
    id: 'side-13-5', name: 'Боковые направляющие · 13.5 мм', drawerSlideGap: 13.5, gap: 2,
    description: 'Пример Accuride 3832EHDSC: рекомендованная ширина ящика на 27 мм меньше проёма. Применять только после проверки паспорта выбранной направляющей.',
    url: 'https://www.accuride.com/media/amasty/amfile/attach/91be7740fabfd08cc4270dcf3f0d7add.pdf',
  },
  {
    id: 'custom', name: 'Своя фурнитура · настроить', drawerSlideGap: 13, gap: 2,
    description: 'Введите отступы выбранной фурнитуры. Скрытые направляющие и металлические боковины рассчитываются по схемам производителя и могут требовать другую конструкцию ящика.',
    url: 'https://www.blum.com/us/en/products/runnersystems/tandem/downloads-videos/',
  },
];

export const TECHNICAL_NOTES = [
  'Все размеры — в мм. Толщина 18 мм, зазор фасада 2 мм и параметры распила являются редактируемыми настройками мастерской, а не обязательными значениями TSE.',
  'Заводской каталог содержит только проверенные варианты Yıldız Entegre: MDFLAM 8/18/25 мм, 2100 × 2800 мм; матовые и глянцевые Kapak Panel 18 мм, 1220 × 2800 мм. Наличие конкретной основы и декора подтверждается поставщиком.',
  'Цвет на экране условный: для заказа используйте образец и артикул декора. MDF 16 мм и HDF 3/6 мм не добавлены в заводской каталог без подтверждения точного изделия; пользовательские материалы старых проектов сохраняются.',
  'Зазор направляющей указывается с каждой стороны. Скрытые системы Blum и аналогичные требуют расчёта и подготовки ящика по паспорту конкретной фурнитуры.',
  'Размеры деталей относятся к выбранной конструкции. До производства согласуйте припуски на кромку, реальную толщину материала, ширину пропила и технологию соединений.',
  'Справочник стандартов описывает области применения. Проект и раскрой не подтверждают сертификат TSE, нагрузочную способность, устойчивость или класс эмиссии.',
];
