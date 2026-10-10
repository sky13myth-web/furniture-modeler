import { productionPartCode } from './production-id.js';
import { translatePrintText, translateBuiltInName } from './print-i18n.js';
import { contourMarkerRegions } from './contour-markers.js';
import { documentMetadataLine, printDocumentText } from './print-document.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => Math.round(Number(value) * 1000) / 1000;

/** Use the optimiser's oriented contour unchanged. Part codes are project-wide,
 * so the sheet, manufacturing list, SVG and factory files refer to one part. */
export function createCuttingSheetSvg(sheet, parts, { language = 'ru' } = {}) {
  const colors = ['#dce5d4', '#e8dbc8', '#d6e2e3', '#e3dfc8'];
  const entries = sheet.placements.map((placement, index) => {
    const partIndex = parts.findIndex(part => part.id === placement.partId), original = parts[partIndex];
    const shape = placement.outline ?? original?.outline?.map(point => placement.rotated ? { x: original.height - point.y, y: point.x } : point);
    const code = partIndex >= 0 ? productionPartCode(partIndex) : placement.partId;
    const points = shape?.map(point => `${number(placement.x + point.x)},${number(placement.y + point.y)}`).join(' ');
    const label = original ? `${translateBuiltInName(original.cabinetName, language, 'cabinet')} · ${translatePrintText(original.name, language)}` : placement.label;
    const regions = contourMarkerRegions(shape, placement.width, placement.height), region = regions.label ?? { x: placement.width / 2, y: placement.height / 2, width: placement.width, height: placement.height };
    const centerX = placement.x + region.x, centerY = placement.y + region.y;
    const codeFont = Math.min(30, region.width / 7, region.height / 3.5), sizeFont = Math.min(22, region.width / 12, region.height / 4.5);
    // Keep the arrow toward a real material edge, clear of the central P code.
    const span = regions.grain, gx = span ? placement.x + span.left + span.width * .16 : 0, gy = span ? placement.y + span.y : 0;
    const half = span ? span.height * .25 : 0, head = span ? Math.min(10, span.width * .1) : 0, headHeight = Math.min(15, half * .6);
    const grain = original?.grain && span ? `<path data-grain-axis="B" d="M${number(gx)},${number(gy-half)} L${number(gx)},${number(gy+half)} M${number(gx-head)},${number(gy+half-headHeight)} L${number(gx)},${number(gy+half)} L${number(gx+head)},${number(gy+half-headHeight)}" fill="none" stroke="#5b7650" stroke-width="3"/>` : '';
    return `<g data-production-part="${escape(code)}"><rect x="${placement.x}" y="${placement.y}" width="${placement.width}" height="${placement.height}" fill="${shape ? '#f0f1e9' : colors[index % 4]}" stroke="#a7b09a" stroke-width="2" ${shape ? 'stroke-dasharray="10 6"' : ''}/>${points ? `<polygon data-cut-contour="true" points="${points}" fill="${colors[index % 4]}" stroke="#7c936e" stroke-width="3"/>` : ''}<title>${escape(code)} · ${escape(label)} · ${number(placement.width)} × ${number(placement.height)}</title>${grain}<text x="${number(centerX)}" y="${number(centerY-sizeFont*.45)}" text-anchor="middle" fill="#5b7650" font-size="${codeFont}">${escape(code)}</text><text x="${number(centerX)}" y="${number(centerY+codeFont*.65)}" text-anchor="middle" fill="#6e8562" font-size="${sizeFont}">${number(placement.width)} × ${number(placement.height)}</text></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" data-i18n="off" viewBox="-25 -25 ${sheet.width + 50} ${sheet.height + 50}" class="sheet-plan"><rect width="${sheet.width}" height="${sheet.height}" fill="#f8f9f3" stroke="#a7b59b" stroke-width="3"/>${entries.join('')}</svg>`;
}

/** A physical A4 frame with a fixed-size legend. Narrow strips are identified
 * with leader lines instead of making their text smaller than the printed
 * minimum. Dense stock layouts repeat on further pages, preserving every ID. */
export function createCuttingSheetPrintPages(sheet, parts, { language = 'tr', sheetNumber = 1, documentInfo = null, configuration = '', maxRows = 18 } = {}) {
  const labels = {
    ru: { title: 'Карта раскроя', stock: 'Лист', page: 'Страница', nominal: 'Размеры заготовки A × B, мм', grain: 'Текстура B', rotated: 'Поворот 90°', note: 'Справочное размещение. Порядок резов задаёт фабрика.', continuation: 'На этой странице выделены детали из ведомости справа.' },
    tr: { title: 'Kesim yerleşimi', stock: 'Levha', page: 'Sayfa', nominal: 'Ham parça A × B ölçüleri, mm', grain: 'Desen B', rotated: '90° dönüş', note: 'Referans yerleşim. Kesim sırasını fabrika belirler.', continuation: 'Bu sayfada sağ listedeki parçalar vurgulanmıştır.' },
    en: { title: 'Cutting layout', stock: 'Sheet', page: 'Page', nominal: 'Cut blank A × B dimensions, mm', grain: 'Grain B', rotated: '90° rotation', note: 'Reference layout. The factory determines the cut sequence.', continuation: 'This page highlights the parts in the legend on the right.' }
  }[language] ?? null;
  if (!labels) throw new Error('Invalid cutting print language.');
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 18) throw new Error('Invalid cutting print row limit.');
  const scale = Math.min(665 / sheet.width, 530 / sheet.height), px = 28 + (665 - sheet.width * scale) / 2, py = 162 + (530 - sheet.height * scale) / 2;
  const pageCount = Math.max(1, Math.ceil(sheet.placements.length / maxRows));
  if (Array.isArray(sheet.cuts)) labels.note = {
    ru: `Прямые резы · пропил ${number(sheet.kerf)} мм. Порядок проходов — в отдельной схеме резов.`,
    tr: `Düz kesimler · testere payı ${number(sheet.kerf)} mm. Geçiş sırası ayrı kesim planındadır.`,
    en: `Straight cuts · kerf ${number(sheet.kerf)} mm. Pass sequence is in the separate cut plan.`
  }[language];
  const point = (x, y) => `${number(px + x * scale)},${number(py + y * scale)}`;
  return Array.from({ length: pageCount }, (_, page) => {
    const metadata = documentInfo ? documentMetadataLine(documentInfo, { language, page: page + 1, pageCount }) : '';
    const current = sheet.placements.slice(page * maxRows, (page + 1) * maxRows), selected = new Set(current);
    const geometry = sheet.placements.map(placement => {
      const index = parts.findIndex(part => part.id === placement.partId), part = parts[index];
      const shape = placement.outline ?? part?.outline?.map(p => placement.rotated ? { x: part.height - p.y, y: p.x } : p);
      const points = shape?.map(p => point(placement.x + p.x, placement.y + p.y)).join(' ');
      const code = index >= 0 ? productionPartCode(index) : placement.partId, active = selected.has(placement);
      const attrs = `fill="${active ? '#dce5d4' : '#f3f4f0'}" stroke="${active ? '#3e5248' : '#9da99f'}" stroke-width="1"`;
      return `<g data-production-part="${escape(code)}" data-listed-on-page="${active}">${points ? `<polygon data-cut-contour="true" points="${points}" ${attrs}/>` : `<rect x="${number(px + placement.x * scale)}" y="${number(py + placement.y * scale)}" width="${number(placement.width * scale)}" height="${number(placement.height * scale)}" ${attrs}/>`}</g>`;
    }).join('');
    const legend = current.map((placement, row) => {
      const index = parts.findIndex(part => part.id === placement.partId), part = parts[index], code = index >= 0 ? productionPartCode(index) : placement.partId;
      const shape = placement.outline ?? part?.outline?.map(p => placement.rotated ? { x: part.height - p.y, y: p.x } : p);
      const region = contourMarkerRegions(shape, placement.width, placement.height).label ?? { x: placement.width / 2, y: placement.height / 2, width: placement.width, height: placement.height };
      const x = px + (placement.x + region.x) * scale, y = py + (placement.y + region.y) * scale, ry = 183 + row * 30;
      const fits = region.width * scale >= String(code).length * 14 * .64 + 6 && region.height * scale >= 22;
      const title = part ? `${translateBuiltInName(part.cabinetName, language, 'cabinet')} · ${translatePrintText(part.name, language)}` : placement.label ?? code;
      const width = part?.width ?? (placement.rotated ? placement.height : placement.width), height = part?.height ?? (placement.rotated ? placement.width : placement.height);
      const annotation = [part?.grain ? labels.grain : '', placement.rotated ? labels.rotated : ''].filter(Boolean).join(' · ');
      const marker = fits
        ? `<text data-map-label="${escape(code)}" x="${number(x)}" y="${number(y + 5)}" text-anchor="middle" font-size="14">${escape(code)}</text>`
        : `<path data-label-leader="${escape(code)}" d="M${number(x)},${number(y)} L704,${ry - 4} H726" fill="none" stroke="#42574b" stroke-width=".7"/><circle cx="${number(x)}" cy="${number(y)}" r="2" fill="#42574b"/>`;
      return `${marker}<g data-print-legend-part="${escape(code)}"><title>${escape(title)}</title><text x="734" y="${ry}" font-size="14" font-weight="bold">${escape(code)}</text><text x="803" y="${ry}" font-size="14">${number(width)} × ${number(height)}</text>${annotation ? `<text x="803" y="${ry + 13}" font-size="14">${escape(annotation)}</text>` : ''}</g>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" lang="${language}" data-i18n="off" data-print-cutting="true" data-min-font-mm="3.71" data-sheet-number="${sheetNumber}" data-page="${page + 1}" data-page-count="${pageCount}" width="297mm" height="210mm" viewBox="0 0 1120 792" role="img" aria-label="${escape(labels.title)} ${sheetNumber}"><title>${escape(labels.title)} ${sheetNumber} · ${labels.page} ${page + 1}/${pageCount}</title><rect width="1120" height="792" fill="#fff"/><g font-family="Arial,sans-serif" fill="#263e35"><text x="28" y="35" font-size="20" font-weight="bold">${escape(labels.title)} · ${escape(labels.stock)} ${sheetNumber}</text><text x="28" y="58" font-size="14">${escape(sheet.materialName ?? '')} · ${number(sheet.thickness ?? 0)} mm · ${number(sheet.width)} × ${number(sheet.height)} mm</text>${metadata ? `<text x="28" y="80" font-size="14">${escape(metadata)}</text>` : ''}<text x="28" y="105" font-size="14">${escape(labels.note)}</text>${pageCount > 1 ? `<text x="28" y="128" font-size="14">${escape(labels.continuation)}</text>` : ''}<text x="734" y="155" font-size="14" font-weight="bold">${escape(labels.nominal)}</text><rect x="${number(px)}" y="${number(py)}" width="${number(sheet.width * scale)}" height="${number(sheet.height * scale)}" fill="#fbfcf9" stroke="#3e5248" stroke-width="1.2"/>${geometry}${legend}<path d="M28,717 H1092" stroke="#b7c5b9"/><text x="28" y="739" font-size="14">${escape(printDocumentText('notToScale', language))}</text><text x="28" y="759" font-size="14">${escape(printDocumentText('nominalTolerances', language))}</text>${configuration ? `<text x="28" y="779" font-size="14">${escape(configuration)}</text>` : ''}<text x="1092" y="779" font-size="14" text-anchor="end">${escape(labels.page)} ${page + 1}/${pageCount} · A4</text></g></svg>`;
  });
}
