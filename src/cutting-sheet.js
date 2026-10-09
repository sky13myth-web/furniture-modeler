import { productionPartCode } from './production-id.js';
import { translatePrintText, translateBuiltInName } from './print-i18n.js';
import { contourMarkerRegions } from './contour-markers.js';

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
