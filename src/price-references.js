/** Observed public Turkish retail prices, not a nationwide market average.
 * Arkut quotes below are bank-transfer prices including VAT. References use
 * the exact listed sheet dimensions; other sheet sizes are derived by area.
 * Unknown thicknesses and finishes deliberately have no fallback multiplier.
 */
export const PRICING_SNAPSHOT = {
  date: '2026-10-09', currency: 'TRY',
  notes: [
    'Ориентиры — выборка опубликованных предложений поставщиков, а не средняя цена по всей Турции. Декор, способ оплаты и выбранная модель меняют цену.',
    'Цена материала пересчитывается по площади листа. Цена другой толщины или отделки автоматически не выводится.',
    'Для фурнитуры указан расход по проекту; минимальные упаковки поставщика не учитываются. Исходная цена кромки приведена с НДС 20%.',
  ],
};

const date = PRICING_SNAPSHOT.date;
const sheetSample = (label, price, width, height, url, includesVat = true) => ({
  label, price, areaSquareMeters: width * height / 1e6, url, includesVat, date,
});
const meanPerSquareMeter = samples => samples.reduce((sum, sample) => sum + sample.price / sample.areaSquareMeters, 0) / samples.length;

const mdflam18 = [
  sheetSample('Arkut · Yıldız Entegre Smartlam 1. grup · 18 × 2800 × 2100 mm', 2715, 2800, 2100, 'https://www.arkutorman.com/urun/mdflam-yildiz-entegre-1-grup-18-2800-2100-smartlam'),
  sheetSample('Arkut · Yıldız Entegre Smartlam 2. grup · 18 × 2800 × 2100 mm', 3255, 2800, 2100, 'https://www.arkutorman.com/urun/mdflam-yildiz-entegre-2-grup-18-2800-2100-smartlam'),
  sheetSample('Arkut · Yıldız Entegre Smartlam 3. grup · 18 × 2800 × 2100 mm', 3450, 2800, 2100, 'https://www.arkutorman.com/urun/mdflam-yildiz-entegre-3-grup-18-2800-2100-smartlam'),
];
const mdflam8 = [
  sheetSample('Arkut · Yıldız Entegre VT-068 Beyaz MDFLAM · 8 × 2800 × 2100 mm', 2410, 2800, 2100, 'https://www.arkutorman.com/urun/vt-068-beyaz-mdflam-08-2800-2100'),
  sheetSample('Arkut · Yıldız Entegre VT-010 Bej MDFLAM · 8 × 2800 × 2100 mm', 2295, 2800, 2100, 'https://www.arkutorman.com/urun/vt-010-bej-08-2800-2100'),
];
const matt18 = [sheetSample('Arkut · Yıldız MAT-068 Beyaz · 18 × 1220 × 2800 mm', 2450, 1220, 2800, 'https://www.arkutorman.com/urun/mat-068-beyaz')];
const gloss18 = [sheetSample('Arkut · Yıldız HG-068 Parlak Beyaz · 18 × 1220 × 2800 mm', 2450, 1220, 2800, 'https://www.arkutorman.com/urun/hg-068-parlak-beyaz')];
// Generic raw thin MDF reference. The seller does not identify it as Yıldız,
// HDF, particleboard or a melamine-coated back panel.
const thinBack3 = [sheetSample('Balkotrade · Ham MDF · 3 × 2100 × 2800 mm · üretici belirtilmemiş', 730, 2100, 2800, 'https://balkotrade.com/mdf-levha-3mm-x-210cm-x-280cm')];

export const MATERIAL_PRICE_REFERENCES = [
  { id: 'yildiz-mdflam-18-retail', label: 'Yıldız MDFLAM 18 mm · Smartlam 1–3 · Arkut', thickness: 18, type: 'mdflam', pricePerSquareMeter: meanPerSquareMeter(mdflam18), samples: mdflam18 },
  { id: 'yildiz-mdflam-8-retail', label: 'Yıldız MDFLAM 8 mm · VT-068 / VT-010 · Arkut', thickness: 8, type: 'mdflam', pricePerSquareMeter: meanPerSquareMeter(mdflam8), samples: mdflam8 },
  { id: 'yildiz-matt-18-retail', label: 'Yıldız MAT-068 · 18 mm · Arkut', thickness: 18, type: 'front-matt', pricePerSquareMeter: meanPerSquareMeter(matt18), samples: matt18 },
  { id: 'yildiz-gloss-18-retail', label: 'Yıldız HG-068 · 18 mm · Arkut', thickness: 18, type: 'front-gloss', pricePerSquareMeter: meanPerSquareMeter(gloss18), samples: gloss18 },
  { id: 'generic-raw-thin-mdf-3-retail', label: 'Ham MDF · 3 mm · Balkotrade', thickness: 3, type: 'thin-back', pricePerSquareMeter: meanPerSquareMeter(thinBack3), samples: thinBack3 },
];

const hardwareSample = (label, price, url, includesVat = true, extra = {}) => ({ label, price, url, includesVat, date, ...extra });
const averageVatIncluded = samples => Number((samples.reduce((sum, sample) => sum + sample.price * (sample.includesVat === false ? 1 + sample.vatRate : 1), 0) / samples.length).toFixed(6));
const handles = [
  hardwareSample('Eymen · İnci · 128 mm · 1 adet', 76.78, 'https://eymenyapimarket.com/urun/inci-mobilya-dolap-cekmece-kulp-128-mm-antik-sari/'),
  hardwareSample('ArzuHome · Umut 450 krom · 96–128 mm · 1 adet', 195, 'https://www.arzuhome.com/umut-model-450-cekme-kulplar-96-128-mm-krom-4117'),
];
const guideSets = [
  hardwareSample('ErveHome · Häfele BALL43 420.50.814 · 450 mm · 1 çift', 294, 'https://ervehome.com/mobilya-hirdavati/hafele-ball-43-bilyali-ray-tam-acilim-30-kg-43-450-mm-cinko'),
  hardwareSample('Dinler · Häfele BALL43 420.50.814 · 450 mm · 1 çift', 240.82, 'https://www.dinlermobilya.com.tr/urun/hafele-ball-43-bilyali-ray-tam-acilim-43-450mm-30kg'),
];
// Published unit price includes its mounting plate; supplier sells by box/carton.
const hinges = [hardwareSample('Projefiyat · Samet Star + taban · 1 adet · kutu/koli satışı', 40.80, 'https://www.projefiyat.com/samet-star-mentese-1389')];
// Vendor explicitly states price per metre and VAT +20%, with 150 m rolls.
// Samples retain the quoted net price; the default rate includes that stated VAT.
const edgeBands = [
  hardwareSample('PVC Kenar Bandı · 22 × 0.80 mm · Yıldız Kül Grisi · 4.20 TRY/m +20% KDV → 5.04 TRY/m · 150 m/top', 4.20, 'https://www.pvckenarbandi.com/22-0-80-mm-pvc-kenar-bantlari.html', false, { vatRate: 0.20 }),
  hardwareSample('PVC Kenar Bandı · 22 × 0.80 mm · Yıldız Antik Meşe · 6.06 TRY/m +20% KDV → 7.272 TRY/m · 150 m/top', 6.06, 'https://www.pvckenarbandi.com/22-0-80-mm-pvc-kenar-bantlari.html', false, { vatRate: 0.20 }),
];
export const HARDWARE_PRICE_REFERENCES = {
  handlePrice: { price: averageVatIncluded(handles), samples: handles },
  guideSetPrice: { price: averageVatIncluded(guideSets), samples: guideSets },
  hingePrice: { price: averageVatIncluded(hinges), samples: hinges },
  edgeBandPricePerMeter: { price: averageVatIncluded(edgeBands), samples: edgeBands },
};
