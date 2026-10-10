/** Manual per-panel production edges, persisted in the project rather than view state. */
import { generateParts } from './engine.js';
import { validatePartEdgeBandPatch, validatePartEdgeBandingOverrides } from './part-edge-banding-model.js';

export function getPartEdgeBandingOverride(project, sourcePartId) {
  const part = generateParts(project).find(part => part.id === sourcePartId);
  if (!part) return null;
  const cabinet = project.cabinets.find(cabinet => cabinet.id === part.cabinetId);
  return Object.hasOwn(cabinet.partEdgeBanding ?? {}, part.edgeBandKey) ? { ...cabinet.partEdgeBanding[part.edgeBandKey] } : null;
}

/** A partial edit retains every other resolved edge. null restores automatic defaults. */
export function setPartEdgeBanding(project, sourcePartId, patch) {
  const parts = generateParts(project), part = parts.find(part => part.id === sourcePartId);
  if (!part) throw new Error('Деталь не найдена.');
  const cabinet = project.cabinets.find(cabinet => cabinet.id === part.cabinetId);
  validatePartEdgeBandingOverrides(cabinet.partEdgeBanding);
  if (patch === null) {
    if (!Object.hasOwn(cabinet.partEdgeBanding ?? {}, part.edgeBandKey)) return true;
    const next = { ...cabinet.partEdgeBanding }; delete next[part.edgeBandKey];
    if (Object.keys(next).length) cabinet.partEdgeBanding = next; else delete cabinet.partEdgeBanding;
    return true;
  }
  validatePartEdgeBandPatch(patch);
  if (parts.filter(candidate => candidate.cabinetId === part.cabinetId && candidate.edgeBandKey === part.edgeBandKey).length !== 1) throw new Error('Кромки детали: неоднозначный идентификатор детали.');
  const edges = { ...part.edges, ...patch };
  if (part.finishedWidth - edges.left - edges.right < .001 || part.finishedHeight - edges.top - edges.bottom < .001) {
    throw new Error('Кромки детали: толщина кромок превышает размер заготовки.');
  }
  const next = { ...cabinet.partEdgeBanding, [part.edgeBandKey]: edges };
  validatePartEdgeBandingOverrides(next);
  cabinet.partEdgeBanding = next;
  return true;
}
