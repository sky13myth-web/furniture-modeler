import { defaultName, translateText } from './i18n.js';

/** Reusable manual quotes belong to an exact stock, rather than a historical
 * material ID alone. All stored values are data; unknown fields are ignored. */
const PRICE_KEYS = ['handlePrice', 'guideSetPrice', 'hingePrice', 'edgeBandPricePerMeter', 'rodPricePerMeter', 'rodHolderPrice'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validPrice = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const own = (value, key) => record(value) && Object.hasOwn(value, key);
const languages = ['ru', 'tr', 'en'];
const factoryTypes = new Map([
  ['MAT_068', 'MDF с матовым покрытием'],
  ['HG_068', 'MDF с глянцевым покрытием']
].map(([decor, type]) => [decor, { type, labels: new Set(languages.map(language => translateText(type, language))) }]));
const thinBackType = defaultName('thinBackType', 'ru');
const thinBackLabels = new Set(languages.map(language => defaultName('thinBackType', language)));

// Translate only exact built-in labels with their article identity. A custom
// type stays strict even when the material retains a factory ID or decor code.
function canonicalStockType(material) {
  const factory = factoryTypes.get(material.decorCode);
  if (factory?.labels.has(material.type)) return factory.type;
  if (material.id === 'thin-back-3' && thinBackLabels.has(material.type)) return thinBackType;
  return material.type;
}

function stockKey(material) {
  if (!record(material) || ['id', 'thickness', 'sheetWidth', 'sheetHeight', 'type'].some(key => !own(material, key))) return null;
  if (typeof material.id !== 'string' || !material.id.trim() || typeof material.type !== 'string' || !material.type.trim()) return null;
  if (![material.thickness, material.sheetWidth, material.sheetHeight].every(positive)) return null;
  if (material.decorCode != null && (!own(material, 'decorCode') || typeof material.decorCode !== 'string')) return null;
  return JSON.stringify([material.id, material.thickness, material.sheetWidth, material.sheetHeight, canonicalStockType(material), material.decorCode ?? null]);
}

function cleanRates(value) {
  return Object.fromEntries(PRICE_KEYS.filter(key => own(value, key) && validPrice(value[key])).map(key => [key, value[key]]));
}

export function getPricingPreferences(project) {
  const materials = (Array.isArray(project?.materials) ? project.materials : []).filter(material => stockKey(material) && own(material, 'pricePerSheet') && validPrice(material.pricePerSheet)).map(material => ({
    id: material.id, thickness: material.thickness, sheetWidth: material.sheetWidth, sheetHeight: material.sheetHeight, type: canonicalStockType(material),
    ...(material.decorCode != null ? { decorCode: material.decorCode } : {}), pricePerSheet: material.pricePerSheet
  }));
  return { materials, rates: cleanRates(project?.settings?.pricing) };
}

/** Existing project-specific manual prices (including zero) take precedence.
 * Old ID→price maps have no gauge/size identity and are deliberately discarded. */
export function applyPricingPreferences(project, preferences) {
  const next = structuredClone(project), quotes = new Map();
  for (const material of own(preferences, 'materials') && Array.isArray(preferences.materials) ? preferences.materials : []) {
    const key = stockKey(material);
    if (key && own(material, 'pricePerSheet') && validPrice(material.pricePerSheet) && !quotes.has(key)) quotes.set(key, material.pricePerSheet);
  }
  for (const material of Array.isArray(next?.materials) ? next.materials : []) {
    const key = stockKey(material);
    if (key && !validPrice(material.pricePerSheet) && quotes.has(key)) material.pricePerSheet = quotes.get(key);
  }
  const rates = cleanRates(own(preferences, 'rates') ? preferences.rates : null);
  for (const [key, value] of Object.entries(rates)) {
    if (validPrice(next?.settings?.pricing?.[key])) continue;
    next.settings ??= {}; next.settings.pricing ??= {};
    next.settings.pricing[key] = value;
  }
  return next;
}
