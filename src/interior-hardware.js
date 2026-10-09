/** UI ownership of the shared hinge reserve. An inner leaf never owns this
 * parameter: the enclosing outer door section supplies it to every drawer.
 * Reads are pure; updates return a cloned cabinet for the usual edit guard. */
import { getCabinetLayout, getInternalDrawerLayout, findLayoutNode } from './engine.js';

export function getInteriorDrawerHardwareOwner(cabinet, project, sectionId, { parentSectionId } = {}) {
  if (!cabinet?.layout || typeof sectionId !== 'string') return null;
  const layout = getCabinetLayout(cabinet, project);
  const inner = layout.internalSections.find(section => section.id === sectionId);
  const outer = layout.sections.find(section => section.id === (inner?.parentSectionId ?? sectionId));
  if (!outer || outer.node.front !== 'doors' || parentSectionId != null && parentSectionId !== outer.id) return null;
  const drawers = getInternalDrawerLayout(cabinet, project).filter(drawer => drawer.sectionId === outer.id);
  return { ...outer, selectedSectionId: sectionId, isInterior: Boolean(inner),
    hingeGap: outer.node.internalDrawerHingeGap ?? 20,
    affectedSectionIds: [...new Set(drawers.map(drawer => drawer.interiorSectionId ?? drawer.sectionId))],
    affectedDrawerCount: drawers.length };
}

/** No per-leaf gap is introduced. Geometry validity and history remain the
 * caller's responsibility, using its existing cabinet transaction guard. */
export function setInteriorDrawerHingeGap(cabinet, project, sectionId, value, options = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 200) return null;
  const owner = getInteriorDrawerHardwareOwner(cabinet, project, sectionId, options);
  if (!owner) return null;
  const next = structuredClone(cabinet);
  const node = findLayoutNode(next.layout, owner.id);
  if (!node) return null;
  node.internalDrawerHingeGap = value;
  return next;
}
