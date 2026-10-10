import { buildDrillingFiles, checkDrillingExport } from './drilling-export.js';

/** The screen uses the same paginated maps and IDs as the workshop export. */
export function getDrillingDrawingSet(project, { cabinetId, language = 'tr' } = {}) {
  const result = checkDrillingExport(project, { cabinetId });
  if (!result.valid) return { ...result, drawings: [], html: null };
  const files = buildDrillingFiles(project, { cabinetId, language });
  const drawings = result.plan.parts.flatMap(part => {
    const pages = files.filter(file => file.path === `maps/${part.partCode}.svg` || file.path.startsWith(`maps/${part.partCode}-`) && file.path.endsWith('.svg'));
    return pages.length ? [{ part, pages: pages.map(file => ({ svg: file.content, filename: file.path.slice(5) })) }] : [];
  });
  return { ...result, drawings, html: files.find(file => file.path === 'drilling-reference.html')?.content ?? null };
}
