import { getRoomPlanGeometry, createRoomPlanSvg } from './room-print.js';
import { generateParts } from './engine.js';
import { getProjectCostEstimate } from './pricing.js';
import { printLanguage, printNumber, translateBuiltInName, translateMaterialName, translatePrintText } from './print-i18n.js';
import { getDocumentInfo, printDocumentText } from './print-document.js';

const escape = value => String(value ?? '').replace(/[&<>"']/gu, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const positive = value => Math.max(0, finite(value));

const isSafeSnapshot = url => {
  if (typeof url !== 'string' || !url.trim()) return false;
  const trimmed = url.trim();
  if (/^\s*javascript:/i.test(trimmed)) return false;
  return /^(data:image\/[a-zA-Z0-9+.-]+;base64,|https?:\/\/|blob:|\/|\.\/|[a-zA-Z0-9_\-./]+\.(png|jpe?g|webp|svg|gif))/i.test(trimmed);
};

const DICTIONARY = {
  clientPresentation: {
    ru: 'Презентация проекта',
    tr: 'Müşteri Sunumu',
    en: 'Client Presentation'
  },
  presentationBooklet: {
    ru: 'Презентационный буклет проекта',
    tr: 'Müşteri Sunum Kitapçığı',
    en: 'Client Presentation Booklet'
  },
  projectOverview: {
    ru: 'Общие сведения о проекте',
    tr: 'Proje Genel Bakışı',
    en: 'Project Overview'
  },
  roomOverview: {
    ru: 'Параметры помещения',
    tr: 'Oda Parametreleri',
    en: 'Room Parameters'
  },
  furnitureOverview: {
    ru: 'Обзор мебели',
    tr: 'Mobilya Özeti',
    en: 'Furniture Overview'
  },
  documentId: {
    ru: 'Документ',
    tr: 'Belge No',
    en: 'Document ID'
  },
  date: {
    ru: 'Дата',
    tr: 'Tarih',
    en: 'Date'
  },
  roomDimensions: {
    ru: 'Габариты помещения (Ш × Г × В)',
    tr: 'Oda Ölçüleri (G × D × Y)',
    en: 'Room Dimensions (W × D × H)'
  },
  floorArea: {
    ru: 'Площадь пола',
    tr: 'Taban Alanı',
    en: 'Floor Area'
  },
  wallCount: {
    ru: 'Количество стен',
    tr: 'Duvar Sayısı',
    en: 'Wall Count'
  },
  totalCabinets: {
    ru: 'Всего шкафов',
    tr: 'Toplam Dolap',
    en: 'Total Cabinets'
  },
  totalParts: {
    ru: 'Всего деталей',
    tr: 'Toplam Parça',
    en: 'Total Parts'
  },
  preview3D: {
    ru: '3D-визуализация проекта',
    tr: '3B Proje Görseli',
    en: '3D Project Visualization'
  },
  previewPlaceholder: {
    ru: '3D-модель интерьера и расстановки мебели',
    tr: 'Oda içi 3B mobilya modeli ve yerleşim',
    en: '3D interior model and furniture layout'
  },
  roomHeight: {
    ru: 'Высота потолка',
    tr: 'Tavan Yüksekliği',
    en: 'Ceiling Height'
  },
  floorPlanTitle: {
    ru: '2D-план помещения и расстановка',
    tr: '2B Kat Planı ve Yerleşim',
    en: '2D Floor Plan & Layout'
  },
  floorPlanSubtitle: {
    ru: 'Размеры стен, проёмов и габаритные контуры мебели',
    tr: 'Duvar ölçüleri, açıklıklar ve mobilya yerleşimi',
    en: 'Wall dimensions, openings and furniture layout'
  },
  wallsList: {
    ru: 'Ведомость стен',
    tr: 'Duvar Listesi',
    en: 'Walls Schedule'
  },
  wallNumber: {
    ru: 'Стена',
    tr: 'Duvar',
    en: 'Wall'
  },
  wallLength: {
    ru: 'Длина, мм',
    tr: 'Uzunluk, mm',
    en: 'Length, mm'
  },
  openingsList: {
    ru: 'Ведомость проёмов',
    tr: 'Açıklık Listesi',
    en: 'Openings Schedule'
  },
  openingNumber: {
    ru: '№',
    tr: 'No',
    en: 'No.'
  },
  openingType: {
    ru: 'Тип',
    tr: 'Tip',
    en: 'Type'
  },
  openingWall: {
    ru: 'Стена',
    tr: 'Duvar',
    en: 'Wall'
  },
  width: {
    ru: 'Ширина, мм',
    tr: 'Genişlik, mm',
    en: 'Width, mm'
  },
  height: {
    ru: 'Высота, мм',
    tr: 'Yükseklik, mm',
    en: 'Height, mm'
  },
  sill: {
    ru: 'Подоконник, мм',
    tr: 'Parapet, mm',
    en: 'Sill Height, mm'
  },
  offset: {
    ru: 'Отступ от угла, мм',
    tr: 'Köşe Mesafesi, mm',
    en: 'Offset, mm'
  },
  noOpenings: {
    ru: 'В помещении нет дверей и окон',
    tr: 'Odada kapı veya pencere açıklığı bulunmuyor',
    en: 'No door or window openings in room'
  },
  door: {
    ru: 'Дверной проём',
    tr: 'Kapı açıklığı',
    en: 'Door opening'
  },
  window: {
    ru: 'Окно',
    tr: 'Pencere',
    en: 'Window'
  },
  furnitureSpecsTitle: {
    ru: 'Спецификация мебели и материалов',
    tr: 'Mobilya ve Malzeme Özellikleri',
    en: 'Furniture & Material Specifications'
  },
  cabinetSchedule: {
    ru: 'Ведомость шкафов',
    tr: 'Dolap Listesi',
    en: 'Cabinet Schedule'
  },
  cabinetNumber: {
    ru: 'Поз.',
    tr: 'No',
    en: 'Pos.'
  },
  cabinetName: {
    ru: 'Наименование шкафа',
    tr: 'Dolap Adı',
    en: 'Cabinet Name'
  },
  dimensions: {
    ru: 'Ш × В × Г, мм',
    tr: 'G × Y × D, mm',
    en: 'W × H × D, mm'
  },
  elevationY: {
    ru: 'Высота установки Y, мм',
    tr: 'Montaj Yüksekliği Y, mm',
    en: 'Installation Height Y, mm'
  },
  carcassMaterial: {
    ru: 'Материал корпуса',
    tr: 'Gövde Malzemesi',
    en: 'Carcass Material'
  },
  frontMaterial: {
    ru: 'Материал фасада',
    tr: 'Kapak Malzemesi',
    en: 'Front Material'
  },
  noCabinets: {
    ru: 'Мебель не добавлена',
    tr: 'Dolap eklenmedi',
    en: 'No cabinets added'
  },
  materialsPaletteTitle: {
    ru: 'Палитра материалов и декоров',
    tr: 'Malzeme ve Dekor Paleti',
    en: 'Materials & Decors Palette'
  },
  swatch: {
    ru: 'Образец',
    tr: 'Renk',
    en: 'Swatch'
  },
  materialName: {
    ru: 'Название материала',
    tr: 'Malzeme Adı',
    en: 'Material Name'
  },
  decorCode: {
    ru: 'Код декора',
    tr: 'Dekor Kodu',
    en: 'Decor Code'
  },
  manufacturer: {
    ru: 'Производитель',
    tr: 'Üretici',
    en: 'Manufacturer'
  },
  sheetSize: {
    ru: 'Размер листа, мм',
    tr: 'Plaka Boyutu, mm',
    en: 'Sheet Size, mm'
  },
  thickness: {
    ru: 'Толщина, мм',
    tr: 'Kalınlık, mm',
    en: 'Thickness, mm'
  },
  grain: {
    ru: 'Текстура',
    tr: 'Damar Yönü',
    en: 'Grain'
  },
  grainYes: {
    ru: 'Есть',
    tr: 'Var',
    en: 'Yes'
  },
  grainNo: {
    ru: 'Нет',
    tr: 'Yok',
    en: 'None'
  },
  noMaterials: {
    ru: 'Материалы не определены',
    tr: 'Malzeme tanımlanmadı',
    en: 'No materials defined'
  },
  commercialSummaryTitle: {
    ru: 'Коммерческая смета и фурнитура',
    tr: 'Maliyet ve Donanım Özeti',
    en: 'Commercial Cost & Hardware Summary'
  },
  sheetCount: {
    ru: 'Всего плит / листов',
    tr: 'Toplam Plaka',
    en: 'Total Sheets'
  },
  edgeBandingLength: {
    ru: 'Длина кромки, м',
    tr: 'Kenar Bandı, m',
    en: 'Edge Banding, m'
  },
  hardwareSummary: {
    ru: 'Фурнитура и комплектующие',
    tr: 'Donanım ve Aksesuarlar',
    en: 'Hardware & Fittings'
  },
  hinges: {
    ru: 'Петли',
    tr: 'Menteşeler',
    en: 'Hinges'
  },
  drawerSlides: {
    ru: 'Направляющие ящиков',
    tr: 'Çekmece Rayları',
    en: 'Drawer Slides'
  },
  handles: {
    ru: 'Ручки',
    tr: 'Kulplar',
    en: 'Handles'
  },
  fasteners: {
    ru: 'Крепёж (винты / гвозди)',
    tr: 'Bağlantı Elemanları (vida / çivi)',
    en: 'Fasteners (screws / nails)'
  },
  screws: {
    ru: 'винты',
    tr: 'vida',
    en: 'screws'
  },
  nails: {
    ru: 'гвозди',
    tr: 'çivi',
    en: 'nails'
  },
  wardrobeRods: {
    ru: 'Штанги для одежды',
    tr: 'Giysi Askı Boruları',
    en: 'Wardrobe Rails'
  },
  costBreakdown: {
    ru: 'Детализация сметы',
    tr: 'Maliyet Tablosu',
    en: 'Cost Breakdown'
  },
  item: {
    ru: 'Позиция',
    tr: 'Kalem / Açıklama',
    en: 'Item / Description'
  },
  quantity: {
    ru: 'Количество',
    tr: 'Miktar',
    en: 'Quantity'
  },
  unit: {
    ru: 'Ед. изм.',
    tr: 'Birim',
    en: 'Unit'
  },
  unitPrice: {
    ru: 'Цена за ед., ₺',
    tr: 'Birim Fiyatı, ₺',
    en: 'Unit Price, ₺'
  },
  total: {
    ru: 'Сумма, ₺',
    tr: 'Toplam, ₺',
    en: 'Total, ₺'
  },
  grandTotal: {
    ru: 'Итоговая сумма',
    tr: 'Genel Toplam',
    en: 'Grand Total'
  },
  totalKnown: {
    ru: 'Учтённая сумма',
    tr: 'Hesaplanan Tutar',
    en: 'Subtotal'
  },
  estimateNotice: {
    ru: 'Цены носят справочный характер для рынка Турции (TRY / ₺). Раскрой включает припуски и пропилы.',
    tr: 'Fiyatlar Türkiye piyasası perakende referanslarıdır (TRY / ₺). Plakalar kesim optimizasyonuna göre tam hesaplanmıştır.',
    en: 'Prices are retail reference values for Turkey (TRY / ₺). Sheet counts follow layout optimization with saw kerf.'
  },
  page: {
    ru: 'Стр.',
    tr: 'Sayfa',
    en: 'Page'
  },
  mm: {
    ru: 'мм',
    tr: 'mm',
    en: 'mm'
  },
  m2: {
    ru: 'м²',
    tr: 'm²',
    en: 'm²'
  },
  pcs: {
    ru: 'шт.',
    tr: 'adet',
    en: 'pcs.'
  },
  pair: {
    ru: 'компл. (пара)',
    tr: 'çift',
    en: 'pair'
  },
  sheet: {
    ru: 'лист',
    tr: 'plaka',
    en: 'sheet'
  },
  meter: {
    ru: 'м',
    tr: 'm',
    en: 'm'
  },
  manualTag: {
    ru: 'вручную',
    tr: 'manuel',
    en: 'manual'
  },
  thicknessNote: {
    ru: 'Толщина, мм',
    tr: 'Kalınlık, mm',
    en: 'Thickness, mm'
  }
};

const getT = lang => key => DICTIONARY[key]?.[lang] ?? DICTIONARY[key]?.tr ?? key;

const formatNumber = (value, lang, digits = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString({ ru: 'ru-RU', tr: 'tr-TR', en: 'en-US' }[lang] ?? 'tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
};

/**
 * Generate a comprehensive Client Presentation Booklet (multi-page printable HTML).
 *
 * @param {Object} project - The cabinet project configuration.
 * @param {Object} [options]
 * @param {'ru'|'tr'|'en'} [options.language='tr'] - Document language.
 * @param {string|null} [options.snapshot=null] - Optional 3D perspective snapshot URL/data URL.
 * @returns {string} - Clean, standalone, printable HTML document.
 */
export function generateRoomPresentationHTML(project = {}, { language = 'tr', snapshot = null } = {}) {
  const lang = printLanguage(language, 'tr');
  const t = getT(lang);

  const projectName = translateBuiltInName(String(project?.name ?? ''), lang, 'project');
  const docInfo = getDocumentInfo(project);
  const geometry = getRoomPlanGeometry(project);
  const parts = generateParts(project);
  const estimate = getProjectCostEstimate(project);

  const roomWidth = positive(project?.room?.width) || geometry.bounds.width;
  const roomDepth = positive(project?.room?.depth) || geometry.bounds.depth;
  const roomHeight = positive(project?.room?.height) || geometry.height;
  const areaM2 = geometry.areaSquareMeters;
  const wallCount = geometry.walls.length;

  const cabinets = project?.cabinets ?? [];
  const cabinetsCount = cabinets.length;
  const partsCount = parts.length;

  // Materials palette list
  const materials = project?.materials ?? [];

  // Edge banding meters
  const edgeRow = estimate.rows.find(row => row.id === 'edge');
  const edgeMeters = edgeRow ? edgeRow.quantity : 0;

  // Unit translator
  const translateUnit = unit => {
    if (unit === 'sheet') return t('sheet');
    if (unit === 'pcs') return t('pcs');
    if (unit === 'pair') return t('pair');
    if (unit === 'meter') return t('meter');
    return String(unit ?? '');
  };

  const allCabinets = geometry.cabinets ?? [];
  const specPagesCount = Math.max(1, Math.ceil(allCabinets.length / 8));
  const totalPages = 1 + 1 + specPagesCount + 1;

  // Header template for pages 2..N
  const pageHeader = pageNum => `
    <header class="page-header">
      <div class="header-left">
        <span class="header-brand">ATÖLYE</span>
        <span class="header-sep">/</span>
        <span class="header-proj">${escape(projectName)}</span>
      </div>
      <div class="header-right">
        <span class="header-id">${escape(docInfo.id)}</span>
        <span class="header-sep">·</span>
        <span class="header-date">${escape(docInfo.date)}</span>
      </div>
    </header>
  `;

  // Footer template for each page
  const pageFooter = pageNum => `
    <footer class="page-footer">
      <div class="footer-left">ATÖLYE Furniture Studio · ${t('clientPresentation')}</div>
      <div class="footer-center">${t('page')} ${pageNum} / ${totalPages}</div>
      <div class="footer-right">${escape(printDocumentText('notToScale', lang))}</div>
    </footer>
  `;

  // --- PAGE 1: Cover & Project Overview ---
  const snapshotSafe = isSafeSnapshot(snapshot);
  const snapshotHTML = snapshotSafe
    ? `<div class="snapshot-card"><img class="snapshot-image" src="${escape(snapshot)}" alt="${escape(projectName)}"></div>`
    : `<div class="snapshot-card snapshot-placeholder">
        <div class="placeholder-icon-wrap">
          <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="placeholder-title">${t('preview3D')}</div>
        <div class="placeholder-desc">${t('previewPlaceholder')}</div>
      </div>`;

  const page1 = `
    <section class="page page-1 cover-page">
      <header class="cover-header">
        <div class="brand-pill">
          <span class="brand-name">ATÖLYE</span>
          <span class="brand-subtitle">STUDIO</span>
        </div>
        <div class="doc-badge">
          <span class="badge-label">${t('documentId')}</span>
          <span class="badge-value">${escape(docInfo.id)}</span>
          <span class="badge-sep">·</span>
          <span class="badge-date">${escape(docInfo.date)}</span>
        </div>
      </header>

      <div class="cover-hero">
        <div class="hero-tag">${t('clientPresentation')}</div>
        <h1 class="hero-title">${escape(projectName)}</h1>
        <p class="hero-subtitle">${t('presentationBooklet')}</p>
      </div>

      <div class="cover-main-grid">
        <div class="cover-stats-column">
          <div class="stats-card room-stats-card">
            <div class="card-header">
              <span class="card-icon">📐</span>
              <h2 class="card-title">${t('roomOverview')}</h2>
            </div>
            <div class="stats-list">
              <div class="stat-row">
                <span class="stat-label">${t('roomDimensions')}</span>
                <span class="stat-value">${formatNumber(roomWidth, lang)} × ${formatNumber(roomDepth, lang)} × ${formatNumber(roomHeight, lang)} ${t('mm')}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">${t('floorArea')}</span>
                <span class="stat-value font-highlight">${formatNumber(areaM2, lang, 2)} ${t('m2')}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">${t('wallCount')}</span>
                <span class="stat-value">${wallCount}</span>
              </div>
            </div>
          </div>

          <div class="stats-card furniture-stats-card">
            <div class="card-header">
              <span class="card-icon">🪑</span>
              <h2 class="card-title">${t('furnitureOverview')}</h2>
            </div>
            <div class="stats-list">
              <div class="stat-row">
                <span class="stat-label">${t('totalCabinets')}</span>
                <span class="stat-value font-highlight">${cabinetsCount}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">${t('totalParts')}</span>
                <span class="stat-value">${partsCount}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">${t('sheetCount')}</span>
                <span class="stat-value">${estimate.totalSheets}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="cover-snapshot-column">
          ${snapshotHTML}
        </div>
      </div>

      ${pageFooter(1)}
    </section>
  `;

  // --- PAGE 2: 2D Floor Plan & Layout ---
  const floorPlanSvg = createRoomPlanSvg(project, { language: lang });

  const wallsRows = geometry.walls.map(wall => `
    <tr>
      <td class="col-code">${wall.number}</td>
      <td class="col-num">${formatNumber(wall.length, lang)} ${t('mm')}</td>
    </tr>
  `).join('');

  const openingsRows = geometry.openings.length > 0
    ? geometry.openings.map(opening => {
        const typeLabel = opening.kind === 'door' ? t('door') : t('window');
        const wallLabel = opening.wallIndex < 0 ? '—' : `S${opening.wallIndex + 1}`;
        return `
          <tr${opening.invalid ? ' class="row-invalid"' : ''}>
            <td class="col-code">${opening.number}</td>
            <td>${typeLabel}</td>
            <td class="col-center">${wallLabel}</td>
            <td class="col-num">${formatNumber(opening.width, lang)}</td>
            <td class="col-num">${formatNumber(opening.height, lang)}</td>
            <td class="col-num">${formatNumber(opening.sill, lang)}</td>
            <td class="col-num">${formatNumber(opening.offset, lang)}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="7" class="empty-cell">${t('noOpenings')}</td></tr>`;

  const page2 = `
    <section class="page page-2 layout-page">
      ${pageHeader(2)}

      <div class="page-title-bar">
        <h2>${t('floorPlanTitle')}</h2>
        <p class="subtitle">${t('floorPlanSubtitle')} · ${t('roomHeight')}: ${formatNumber(geometry.height, lang)} ${t('mm')} · ${t('floorArea')}: ${formatNumber(areaM2, lang, 2)} ${t('m2')}</p>
      </div>

      <figure class="plan-svg-figure">
        ${floorPlanSvg}
      </figure>

      <div class="layout-schedules-grid">
        <div class="schedule-block walls-schedule">
          <h3>${t('wallsList')}</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="col-code">${t('wallNumber')}</th>
                  <th class="col-num">${t('wallLength')}</th>
                </tr>
              </thead>
              <tbody>
                ${wallsRows}
              </tbody>
            </table>
          </div>
        </div>

        <div class="schedule-block openings-schedule">
          <h3>${t('openingsList')}</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="col-code">${t('openingNumber')}</th>
                  <th>${t('openingType')}</th>
                  <th class="col-center">${t('openingWall')}</th>
                  <th class="col-num">${t('width')}</th>
                  <th class="col-num">${t('height')}</th>
                  <th class="col-num">${t('sill')}</th>
                  <th class="col-num">${t('offset')}</th>
                </tr>
              </thead>
              <tbody>
                ${openingsRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      ${pageFooter(2)}
    </section>
  `;

  // --- PAGE 3..: Furniture & Material Specifications ---
  const materialRows = materials.length > 0
    ? materials.map(mat => {
        const localizedName = translateMaterialName(mat.name, lang);
        const decorCode = mat.decorCode ? escape(mat.decorCode) : '—';
        const manufacturer = mat.manufacturer ? escape(mat.manufacturer) : '—';
        const sheetSize = (mat.sheetWidth && mat.sheetHeight)
          ? `${formatNumber(mat.sheetWidth, lang)} × ${formatNumber(mat.sheetHeight, lang)}`
          : '—';
        const thicknessStr = mat.thickness ? `${formatNumber(mat.thickness, lang)} ${t('mm')}` : '—';
        const grainStr = mat.grain ? t('grainYes') : t('grainNo');
        const swatchColor = mat.color ? escape(mat.color) : '#cccccc';

        return `
          <tr>
            <td class="col-swatch">
              <span class="color-swatch-box" style="background-color: ${swatchColor};" title="${swatchColor}"></span>
            </td>
            <td class="col-title">${escape(localizedName)}</td>
            <td class="col-center"><code>${decorCode}</code></td>
            <td>${manufacturer}</td>
            <td class="col-num">${sheetSize}</td>
            <td class="col-num">${thicknessStr}</td>
            <td class="col-center">${grainStr}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="7" class="empty-cell">${t('noMaterials')}</td></tr>`;

  const specPages = [];
  for (let pageIdx = 0; pageIdx < specPagesCount; pageIdx++) {
    const pageNum = 3 + pageIdx;
    const startIndex = pageIdx * 8;
    const sliceCabinets = allCabinets.slice(startIndex, startIndex + 8);
    const isLastSpecPage = pageIdx === specPagesCount - 1;

    const sliceRows = (sliceCabinets.length > 0 || (allCabinets.length === 0 && pageIdx === 0))
      ? (sliceCabinets.length > 0
          ? sliceCabinets.map((cab, localIdx) => {
              const globalIndex = startIndex + localIdx;
              const rawCab = cabinets[globalIndex] ?? cab;
              const carcassMat = materials.find(m => m.id === rawCab.materialId);
              const frontMat = materials.find(m => m.id === (rawCab.frontMaterialId ?? rawCab.materialId));

              const cabName = translateBuiltInName(cab.name, lang, 'cabinet');
              const carcassName = carcassMat ? translateMaterialName(carcassMat.name, lang) : '—';
              const frontName = frontMat ? translateMaterialName(frontMat.name, lang) : '—';

              return `
          <tr>
            <td class="col-code">${cab.number}</td>
            <td class="col-title">${escape(cabName)}</td>
            <td class="col-num">${formatNumber(cab.width, lang)} × ${formatNumber(cab.height, lang)} × ${formatNumber(cab.depth, lang)}</td>
            <td class="col-num">${formatNumber(cab.y, lang)}</td>
            <td>${escape(carcassName)}</td>
            <td>${escape(frontName)}</td>
          </tr>
        `;
            }).join('')
          : `<tr><td colspan="6" class="empty-cell">${t('noCabinets')}</td></tr>`)
      : '';

    const materialsBlock = isLastSpecPage
      ? `
      <div class="specs-section">
        <div class="section-title-row">
          <h3>${t('materialsPaletteTitle')}</h3>
          <span class="count-badge">${materials.length}</span>
        </div>
        <div class="table-wrap">
          <table class="data-table materials-table">
            <thead>
              <tr>
                <th class="col-swatch">${t('swatch')}</th>
                <th>${t('materialName')}</th>
                <th class="col-center">${t('decorCode')}</th>
                <th>${t('manufacturer')}</th>
                <th class="col-num">${t('sheetSize')}</th>
                <th class="col-num">${t('thickness')}</th>
                <th class="col-center">${t('grain')}</th>
              </tr>
            </thead>
            <tbody>
              ${materialRows}
            </tbody>
          </table>
        </div>
      </div>`
      : '';

    const specPage = `
    <section class="page page-${pageNum} specs-page">
      ${pageHeader(pageNum)}

      <div class="page-title-bar">
        <h2>${t('furnitureSpecsTitle')}</h2>
      </div>

      <div class="specs-section">
        <div class="section-title-row">
          <h3>${t('cabinetSchedule')}</h3>
          <span class="count-badge">${allCabinets.length}</span>
        </div>
        <div class="table-wrap">
          <table class="data-table cabinet-table">
            <thead>
              <tr>
                <th class="col-code">${t('cabinetNumber')}</th>
                <th>${t('cabinetName')}</th>
                <th class="col-num">${t('dimensions')}</th>
                <th class="col-num">${t('elevationY')}</th>
                <th>${t('carcassMaterial')}</th>
                <th>${t('frontMaterial')}</th>
              </tr>
            </thead>
            <tbody>
              ${sliceRows}
            </tbody>
          </table>
        </div>
      </div>

      ${materialsBlock}

      ${pageFooter(pageNum)}
    </section>
  `;
    specPages.push(specPage);
  }

  // --- PAGE Cost: Commercial Cost & Hardware Summary ---
  const costPageNum = 3 + specPagesCount;
  const fastenersCount = (estimate.rearHardware?.screws ?? 0) + (estimate.rearHardware?.nails ?? 0);

  const costRows = estimate.rows.map(row => {
    let label = '';
    if (row.kind === 'material') {
      label = escape(translateMaterialName(row.label, lang));
      if (row.materialMismatch) {
        label += ` <span class="tag-warn">· ${t('thicknessNote')}: ${formatNumber(row.thickness, lang, 1)}</span>`;
      }
    } else {
      label = escape(translatePrintText(row.label, lang));
    }
    if (row.manual) {
      label += ` <span class="tag-manual">(${t('manualTag')})</span>`;
    }

    const qty = formatNumber(row.quantity, lang, row.unit === 'meter' ? 2 : 0);
    const unit = translateUnit(row.unit);
    const unitPrice = row.unitPrice !== null ? `${formatNumber(row.unitPrice, lang, 2)} ₺` : '—';
    const totalCost = row.cost !== null ? `${formatNumber(row.cost, lang, 2)} ₺` : '—';

    return `
      <tr>
        <td class="col-title">${label}</td>
        <td class="col-num font-mono">${qty}</td>
        <td class="col-center">${unit}</td>
        <td class="col-num font-mono">${unitPrice}</td>
        <td class="col-num font-mono font-bold">${totalCost}</td>
      </tr>
    `;
  }).join('');

  const totalLabel = estimate.complete ? t('grandTotal') : t('totalKnown');
  const totalAmount = `${formatNumber(estimate.knownTotal, lang, 2)} ₺`;

  const pageCost = `
    <section class="page page-${costPageNum} cost-page">
      ${pageHeader(costPageNum)}

      <div class="page-title-bar">
        <h2>${t('commercialSummaryTitle')}</h2>
      </div>

      <!-- KPI Summary Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">${t('sheetCount')}</div>
          <div class="kpi-value">${estimate.totalSheets}</div>
          <div class="kpi-sub">${t('sheet')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">${t('edgeBandingLength')}</div>
          <div class="kpi-value">${formatNumber(edgeMeters, lang, 1)}</div>
          <div class="kpi-sub">${t('meter')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">${t('hinges')}</div>
          <div class="kpi-value">${estimate.hardware?.hinges ?? 0}</div>
          <div class="kpi-sub">${t('pcs')}</div>
        </div>
        <div class="kpi-card highlight-card">
          <div class="kpi-label">${totalLabel}</div>
          <div class="kpi-value font-primary">${totalAmount}</div>
          <div class="kpi-sub">TRY (₺)</div>
        </div>
      </div>

      <!-- Hardware Breakdown Cards -->
      <div class="hardware-quantities-bar">
        <div class="hw-item">
          <span class="hw-icon">🔩</span>
          <span class="hw-name">${t('hinges')}:</span>
          <strong class="hw-val">${estimate.hardware?.hinges ?? 0} ${t('pcs')}</strong>
        </div>
        <div class="hw-item">
          <span class="hw-icon">↔️</span>
          <span class="hw-name">${t('drawerSlides')}:</span>
          <strong class="hw-val">${estimate.hardware?.guideSets ?? 0} ${t('pair')}</strong>
        </div>
        <div class="hw-item">
          <span class="hw-icon">🚪</span>
          <span class="hw-name">${t('handles')}:</span>
          <strong class="hw-val">${estimate.hardware?.handles ?? 0} ${t('pcs')}</strong>
        </div>
        <div class="hw-item">
          <span class="hw-icon">📌</span>
          <span class="hw-name">${t('fasteners')}:</span>
          <strong class="hw-val">${fastenersCount} ${t('pcs')}</strong>
          <span class="hw-detail">(${estimate.rearHardware?.screws ?? 0} ${t('screws')} / ${estimate.rearHardware?.nails ?? 0} ${t('nails')})</span>
        </div>
      </div>

      <!-- Cost Table -->
      <div class="cost-table-section">
        <div class="section-title-row">
          <h3>${t('costBreakdown')}</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table cost-table">
            <thead>
              <tr>
                <th>${t('item')}</th>
                <th class="col-num">${t('quantity')}</th>
                <th class="col-center">${t('unit')}</th>
                <th class="col-num">${t('unitPrice')}</th>
                <th class="col-num">${t('total')}</th>
              </tr>
            </thead>
            <tbody>
              ${costRows}
            </tbody>
            <tfoot>
              <tr>
                <th colspan="4" class="tfoot-label">${totalLabel}</th>
                <th class="col-num tfoot-amount">${totalAmount}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p class="commercial-disclaimer">${t('estimateNotice')}</p>

      ${pageFooter(costPageNum)}
    </section>
  `;

  // Master HTML template
  return `<!doctype html>
<html lang="${escape(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(projectName)} · ${t('presentationBooklet')}</title>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1c2b21;
      background: #edf1ed;
      font-size: 9pt;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }

    .presentation-document {
      max-width: 297mm;
      margin: 0 auto;
    }

    .page {
      background: #ffffff;
      margin: 20px auto 40px;
      padding: 12mm 15mm;
      box-shadow: 0 4px 20px rgba(18, 38, 26, 0.08);
      border-radius: 4px;
      border: 1px solid #dce5dd;
      min-height: 195mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }

    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 2mm;
      border-bottom: 0.3mm solid #dce5dd;
      margin-bottom: 3mm;
      font-size: 8pt;
      color: #556b5d;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .header-brand {
      font-weight: 700;
      color: #1f4a35;
      letter-spacing: 0.5px;
    }
    .header-sep {
      color: #a4b5aa;
    }
    .header-proj {
      font-weight: 600;
      color: #2c3e33;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: monospace;
      font-size: 8pt;
    }

    /* Page Footer */
    .page-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 2mm;
      border-top: 0.3mm solid #dce5dd;
      margin-top: 3mm;
      font-size: 7.5pt;
      color: #63776b;
    }
    .footer-center {
      font-weight: 600;
    }

    /* Titles */
    .page-title-bar {
      margin-bottom: 3mm;
    }
    .page-title-bar h2 {
      font-size: 13pt;
      font-weight: 700;
      color: #163625;
      letter-spacing: -0.2px;
    }
    .page-title-bar .subtitle {
      font-size: 8pt;
      color: #586f62;
      margin-top: 1mm;
    }

    /* COVER PAGE (Page 1) */
    .cover-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 3mm;
      border-bottom: 0.4mm solid #1f4a35;
      margin-bottom: 5mm;
    }
    .brand-pill {
      display: flex;
      align-items: baseline;
      gap: 5px;
    }
    .brand-name {
      font-size: 16pt;
      font-weight: 800;
      color: #1f4a35;
      letter-spacing: 1px;
    }
    .brand-subtitle {
      font-size: 8.5pt;
      font-weight: 600;
      color: #556b5d;
      letter-spacing: 1.5px;
    }
    .doc-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #f0f5f1;
      padding: 3px 10px;
      border-radius: 20px;
      border: 1px solid #d3e0d6;
      font-size: 8pt;
      color: #3b5043;
    }
    .badge-label {
      text-transform: uppercase;
      font-size: 7pt;
      font-weight: 600;
      color: #60796b;
    }
    .badge-value {
      font-family: monospace;
      font-weight: 700;
    }
    .badge-sep {
      color: #9cb1a4;
    }

    .cover-hero {
      margin-bottom: 6mm;
    }
    .hero-tag {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #276245;
      background: #e4eee7;
      padding: 2px 8px;
      border-radius: 4px;
      margin-bottom: 2mm;
    }
    .hero-title {
      font-size: 22pt;
      font-weight: 800;
      color: #143021;
      line-height: 1.2;
      margin-bottom: 1mm;
    }
    .hero-subtitle {
      font-size: 11pt;
      color: #4a6153;
      font-weight: 500;
    }

    .cover-main-grid {
      display: grid;
      grid-template-columns: 1fr 1.35fr;
      gap: 8mm;
      flex: 1;
      align-items: stretch;
      margin-bottom: 4mm;
    }
    .cover-stats-column {
      display: flex;
      flex-direction: column;
      gap: 5mm;
      justify-content: center;
    }
    .stats-card {
      background: #f8faf8;
      border: 1px solid #dce5dd;
      border-radius: 8px;
      padding: 4mm 5mm;
      box-shadow: 0 2px 8px rgba(18, 38, 26, 0.04);
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3mm;
      padding-bottom: 2mm;
      border-bottom: 1px solid #e5ede7;
    }
    .card-icon {
      font-size: 11pt;
    }
    .card-title {
      font-size: 9.5pt;
      font-weight: 700;
      color: #1f4a35;
    }
    .stats-list {
      display: flex;
      flex-direction: column;
      gap: 2.5mm;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 8.5pt;
    }
    .stat-label {
      color: #556b5d;
    }
    .stat-value {
      font-weight: 600;
      color: #163625;
      text-align: right;
    }
    .font-highlight {
      font-size: 10.5pt;
      color: #1b5e3a;
      font-weight: 700;
    }

    .cover-snapshot-column {
      display: flex;
      flex-direction: column;
      min-height: 80mm;
    }
    .snapshot-card {
      background: #f4f7f4;
      border: 1px solid #dce5dd;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(18, 38, 26, 0.1);
      overflow: hidden;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .snapshot-image {
      width: 100%;
      height: 100%;
      max-height: 95mm;
      object-fit: cover;
      display: block;
    }
    .snapshot-placeholder {
      padding: 8mm 6mm;
      text-align: center;
      color: #63776b;
      border: 1.5px dashed #b8c9bd;
    }
    .placeholder-icon-wrap {
      color: #276245;
      margin-bottom: 3mm;
    }
    .placeholder-title {
      font-size: 11pt;
      font-weight: 700;
      color: #1c3d2c;
      margin-bottom: 1.5mm;
    }
    .placeholder-desc {
      font-size: 8.5pt;
      max-width: 80%;
      line-height: 1.35;
    }

    /* 2D PLAN PAGE (Page 2) */
    .plan-svg-figure {
      background: #fafbfa;
      border: 1px solid #dce5dd;
      border-radius: 6px;
      padding: 3mm;
      margin-bottom: 4mm;
      text-align: center;
    }
    .plan-svg-figure svg {
      max-width: 100%;
      height: auto;
      max-height: 98mm;
      display: block;
      margin: 0 auto;
    }

    .layout-schedules-grid {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 5mm;
    }
    .schedule-block h3 {
      font-size: 9pt;
      font-weight: 700;
      color: #1f4a35;
      margin-bottom: 2mm;
    }

    /* TABLES (Shared) */
    .table-wrap {
      overflow-x: auto;
      border: 1px solid #dce5dd;
      border-radius: 5px;
      background: #ffffff;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      text-align: left;
    }
    .data-table thead {
      background: #edf3ee;
      display: table-header-group;
    }
    .data-table tr, .stats-card, .kpi-card {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .data-table th, .data-table td {
      padding: 1.8mm 2.2mm;
      border-bottom: 1px solid #e2ebe4;
      vertical-align: middle;
      overflow-wrap: anywhere;
    }
    .data-table th {
      font-weight: 700;
      color: #264b38;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .data-table tbody tr:last-child td {
      border-bottom: none;
    }
    .data-table tbody tr:hover {
      background: #f7faf7;
    }
    .row-invalid {
      color: #b22929;
      background: #fdf5f5;
    }
    .empty-cell {
      text-align: center;
      color: #7a8e81;
      padding: 4mm;
      font-style: italic;
    }

    .col-code {
      width: 10mm;
      font-weight: 700;
      color: #1f4a35;
    }
    .col-num {
      text-align: right;
    }
    .col-center {
      text-align: center;
    }
    .col-title {
      font-weight: 600;
    }
    .col-swatch {
      width: 12mm;
      text-align: center;
    }

    /* SPECS PAGE (Page 3) */
    .specs-section {
      margin-bottom: 4mm;
    }
    .section-title-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 2mm;
    }
    .section-title-row h3 {
      font-size: 9.5pt;
      font-weight: 700;
      color: #1f4a35;
    }
    .count-badge {
      background: #e2ebe4;
      color: #204c37;
      font-size: 7pt;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 10px;
    }
    .color-swatch-box {
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 3px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      vertical-align: middle;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    /* COST PAGE (Page 4) */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4mm;
      margin-bottom: 4mm;
    }
    .kpi-card {
      background: #f8faf8;
      border: 1px solid #dce5dd;
      border-radius: 6px;
      padding: 3mm 4mm;
      text-align: center;
    }
    .kpi-label {
      font-size: 7.5pt;
      font-weight: 600;
      color: #556b5d;
      text-transform: uppercase;
      margin-bottom: 1mm;
    }
    .kpi-value {
      font-size: 15pt;
      font-weight: 800;
      color: #183d29;
      line-height: 1.1;
    }
    .kpi-sub {
      font-size: 7pt;
      color: #7b9183;
      margin-top: 1mm;
    }
    .highlight-card {
      background: #eef5f0;
      border-color: #bad3c2;
    }
    .font-primary {
      color: #166534;
    }

    .hardware-quantities-bar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 3mm;
      background: #fafcfa;
      border: 1px solid #dce5dd;
      border-radius: 6px;
      padding: 2.5mm 4mm;
      margin-bottom: 4mm;
      font-size: 8pt;
    }
    .hw-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .hw-icon {
      font-size: 9.5pt;
    }
    .hw-name {
      color: #556b5d;
    }
    .hw-val {
      color: #163625;
    }
    .hw-detail {
      font-size: 7pt;
      color: #788d7f;
    }

    .cost-table-section {
      margin-bottom: 3mm;
    }
    .cost-table tfoot {
      background: #eaf1ec;
    }
    .tfoot-label {
      text-align: right;
      font-weight: 800;
      font-size: 8.5pt;
      color: #163625;
    }
    .tfoot-amount {
      font-size: 10pt;
      font-weight: 800;
      color: #1b5e3a;
    }
    .font-mono {
      font-family: "SF Mono", Consolas, Menlo, monospace;
    }
    .font-bold {
      font-weight: 700;
    }
    .tag-manual {
      font-size: 7pt;
      color: #758a7d;
      font-style: italic;
    }
    .tag-warn {
      font-size: 7pt;
      color: #b22929;
    }
    .commercial-disclaimer {
      font-size: 7.5pt;
      color: #6d8275;
      font-style: italic;
      line-height: 1.35;
      margin-top: 2mm;
    }

    /* Print Optimization */
    @media print {
      body {
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .presentation-document {
        max-width: 100%;
        margin: 0;
      }
      .page {
        break-after: page;
        page-break-after: always;
        box-shadow: none;
        margin: 0;
        padding: 8mm 10mm;
        border: none;
        width: 100%;
        min-height: 190mm;
      }
    }

    @page {
      size: A4 landscape;
      margin: 8mm;
    }
  </style>
</head>
<body>
  <main class="presentation-document" data-i18n="off" lang="${escape(lang)}">
    ${page1}
    ${page2}
    ${specPages.join('\n')}
    ${pageCost}
  </main>
</body>
</html>`;
}
