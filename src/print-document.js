/** Shared identity and reading notes for workshop documents. The content code
 * identifies an exported project revision; it is not a certification or approval. */
const words = {
  ru: { kit: 'Комплект', date: 'Дата', sheet: 'Лист', notToScale: 'Не измерять по изображению. Использовать указанные размеры.', nominalTolerances: 'Размеры номинальные. Допуски изготовления согласовать с мастерской.', illustration: 'Иллюстрация. Рабочие размеры — в чертежах и ведомостях.' },
  tr: { kit: 'Takım', date: 'Tarih', sheet: 'Sayfa', notToScale: 'Çizim üzerinden ölçmeyin. Yazılı ölçüleri kullanın.', nominalTolerances: 'Ölçüler nominaldir. Üretim toleranslarını atölyeyle belirleyin.', illustration: 'Görseldir. Üretim ölçüleri çizimlerde ve listelerdedir.' },
  en: { kit: 'Document set', date: 'Date', sheet: 'Sheet', notToScale: 'Do not measure the image. Use the stated dimensions.', nominalTolerances: 'Dimensions are nominal. Agree manufacturing tolerances with the workshop.', illustration: 'Illustration. Working dimensions are in the drawings and schedules.' }
};

export function printDocumentText(key, language = 'tr') {
  return (words[language] ?? words.tr)[key] ?? key;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}

export function getDocumentInfo(project, { issuedAt = new Date() } = {}) {
  const model = canonical(project);
  // Viewing state does not create a different manufacturing revision.
  if (model?.room) { delete model.room.zoom; delete model.room.camera; }
  if (model?.settings) delete model.settings.roomZoom;
  // Retired settings do not alter either the drilling geometry or its revision.
  if (model?.settings?.drilling) delete model.settings.drilling.integerSpacing;
  if (model) delete model.selectedCabinetId;
  const content = JSON.stringify(model);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < content.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(content.charCodeAt(i))) * 0x100000001b3n);
  const date = new Date(issuedAt);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid document issue date');
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return { id: `AT-${hash.toString(16).padStart(16, '0').toUpperCase()}`, date: `${fields.year}-${fields.month}-${fields.day}` };
}

export function documentMetadataLine(info, { language = 'tr', page = 1, pageCount = 1 } = {}) {
  const t = key => printDocumentText(key, language);
  return `${t('kit')}: ${info.id} · ${t('date')}: ${info.date} · ${t('sheet')}: ${page}/${pageCount}`;
}

/** Chromium's printed-page margin boxes repeat identity on flowing schedules. */
export function documentPageCSS(info, language = 'tr', { size = 'A4 landscape', margin = '9mm' } = {}) {
  const value = JSON.stringify(`${printDocumentText('kit', language)}: ${info.id} · ${printDocumentText('date', language)}: ${info.date}`);
  const sheet = JSON.stringify(`${printDocumentText('sheet', language)} `);
  return `@page{size:${size};margin:${margin};@bottom-left{content:${value};font:8pt Arial;color:#333}@bottom-right{content:${sheet} counter(page) " / " counter(pages);font:8pt Arial;color:#333}}`;
}
