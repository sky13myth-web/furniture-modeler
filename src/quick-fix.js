import {
  getCabinetLayout,
  convertLegacyLayout,
  findLayoutNode,
  splitSection,
  getApplianceFit
} from './engine.js';
import { suggestCabinetCutout } from './room-obstacles.js';

const num = v => Number(v) || 0;

/**
 * Splits a section that has an excessive shelf span into two equal sections
 * with a vertical partition, preserving shelves and door symmetry.
 */
export function quickFixSplitShelfSpan(cabinet, sectionId) {
  cabinet.layout ??= convertLegacyLayout(cabinet);
  const node = findLayoutNode(cabinet.layout, sectionId);
  if (!node) return false;
  const originalShelves = node.shelves ?? 0;
  const originalFront = node.front ?? 'open';
  const originalDoors = node.doors ?? 2;

  const ok = splitSection(cabinet, sectionId, 'vertical');
  if (!ok) return false;

  const parentSplit = findLayoutNode(cabinet.layout, sectionId);
  if (parentSplit?.children && parentSplit.children.length === 2) {
    const [c1, c2] = parentSplit.children;
    if (originalShelves > 0) {
      c1.shelves = originalShelves;
      c2.shelves = originalShelves;
    }
    if (originalFront === 'doors') {
      c1.front = 'doors';
      c1.doors = Math.max(1, Math.floor(originalDoors / 2));
      c2.front = 'doors';
      c2.doors = Math.max(1, Math.ceil(originalDoors / 2));
    }
  }
  return true;
}

/**
 * Adjusts cabinet width to satisfy wall clearance deficit.
 */
export function quickFixAdjustCabinetWidth(cabinet, options = 10) {
  const opts = typeof options === 'number' ? { deficit: options } : options || {};
  if (opts.targetWidth != null) {
    const w = Math.max(150, Math.round(num(opts.targetWidth)));
    if (w === num(cabinet.width)) return false;
    cabinet.width = w;
    return true;
  }
  const dec = Math.max(1, Math.ceil(num(opts.deficit || 10)));
  const newWidth = Math.max(150, Math.round(num(cabinet.width) - dec));
  if (newWidth === num(cabinet.width)) return false;
  cabinet.width = newWidth;
  return true;
}

/**
 * Adjusts cabinet height to satisfy ceiling clearance deficit.
 */
export function quickFixAdjustCabinetHeight(cabinet, options = 10) {
  const opts = typeof options === 'number' ? { deficit: options } : options || {};
  if (opts.targetHeight != null) {
    const h = Math.max(200, Math.round(num(opts.targetHeight)));
    if (h === num(cabinet.height)) return false;
    cabinet.height = h;
    return true;
  }
  const dec = Math.max(1, Math.ceil(num(opts.deficit || 10)));
  const newHeight = Math.max(200, Math.round(num(cabinet.height) - dec));
  if (newHeight === num(cabinet.height)) return false;
  cabinet.height = newHeight;
  return true;
}

/**
 * Adjusts cabinet depth to satisfy rear ventilation requirement for built-in appliances.
 */
export function quickFixAdjustCabinetDepth(cabinet, options = 50) {
  const opts = typeof options === 'number' ? { deficit: options } : options || {};
  if (opts.targetDepth != null) {
    const d = Math.max(200, Math.round(num(opts.targetDepth)));
    if (d === num(cabinet.depth)) return false;
    cabinet.depth = d;
    return true;
  }
  const inc = Math.max(10, Math.ceil(num(opts.deficit || 50)));
  cabinet.depth = Math.round(num(cabinet.depth) + inc);
  return true;
}

function containsNode(parent, targetId) {
  if (!parent || !targetId) return false;
  if (parent.id === targetId) return true;
  if (parent.kind === 'split' && Array.isArray(parent.children)) {
    return parent.children.some(child => containsNode(child, targetId));
  }
  return false;
}

/**
 * Adjusts cabinet and section layout dimensions so an appliance fits with required clearances.
 */
export function adjustCabinetToFitAppliance(cabinet, sectionId, appliance, project) {
  if (!cabinet || !sectionId || !appliance) return false;
  cabinet.layout ??= convertLegacyLayout(cabinet);
  const geom = getCabinetLayout(cabinet, project);
  const section = geom.sections.find(s => s.id === sectionId);
  if (!section) return false;
  const fit = getApplianceFit(section, appliance);
  const defW = Math.ceil(Math.max(0, fit.deficits.width || 0));
  const defH = Math.ceil(Math.max(0, fit.deficits.height || 0));
  const defD = Math.ceil(Math.max(0, fit.deficits.depth || 0));
  if (!defW && !defH && !defD) return false;

  const expandTree = (node, axis, delta) => {
    if (!node || node.kind !== 'split' || !delta) return;
    if (node.axis === axis && Array.isArray(node.children)) {
      node.sizes = node.children.map(child => {
        const childGeom = geom.nodes.find(n => n.id === child.id);
        const curSize = childGeom ? (node.axis === 'horizontal' ? childGeom.height : childGeom.width) : 1;
        return Math.round(curSize + (containsNode(child, sectionId) ? delta : 0));
      });
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (containsNode(child, sectionId)) expandTree(child, axis, delta);
      }
    }
  };

  if (defW > 0) {
    cabinet.width = Math.round(Number(cabinet.width) + defW);
    expandTree(cabinet.layout, 'vertical', defW);
  }
  if (defH > 0) {
    cabinet.height = Math.round(Number(cabinet.height) + defH);
    expandTree(cabinet.layout, 'horizontal', defH);
  }
  if (defD > 0) {
    cabinet.depth = Math.round(Number(cabinet.depth) + defD);
    const secNode = findLayoutNode(cabinet.layout, sectionId);
    if (secNode && secNode.depth != null) secNode.depth = Math.round(Number(secNode.depth) + defD);
  }
  return true;
}

/**
 * Adjusts cabinet dimensions so that the appliance fits with required manufacturer clearances.
 */
export function quickFixFitAppliance(cabinet, sectionId, project) {
  const layout = getCabinetLayout(cabinet, project);
  const section = layout.sections.find(s => s.id === sectionId);
  if (!section || !section.node.appliance) return false;
  return adjustCabinetToFitAppliance(cabinet, sectionId, section.node.appliance, project);
}

/**
 * Applies a suggested cutout when cabinet conflicts with a pipe or box obstacle.
 */
export function quickFixObstacleCutout(cabinet, obstacleId, project) {
  const obstacle = (project.room?.windows || []).find(w => w.id === obstacleId && (w.kind === 'pipe' || w.kind === 'box'));
  if (!obstacle) return false;
  const suggested = suggestCabinetCutout(cabinet, obstacle);
  if (!suggested) return false;
  cabinet.cutout = suggested;
  return true;
}

/**
 * Master dispatcher for applying quick-fixes to a project.
 * Returns true if a mutation was made, false otherwise.
 */
export function applyQuickFix(project, fix) {
  if (!project || !fix || !fix.type) return false;
  const cabinet = (project.cabinets || []).find(c => c.id === fix.cabinetId);

  switch (fix.type) {
    case 'split-vertical':
      if (!cabinet || !fix.sectionId) return false;
      return quickFixSplitShelfSpan(cabinet, fix.sectionId);

    case 'adjust-cabinet-width':
      if (!cabinet) return false;
      return quickFixAdjustCabinetWidth(cabinet, fix);

    case 'adjust-cabinet-height':
      if (!cabinet) return false;
      return quickFixAdjustCabinetHeight(cabinet, fix);

    case 'adjust-cabinet-depth':
      if (!cabinet) return false;
      return quickFixAdjustCabinetDepth(cabinet, fix);

    case 'fit-appliance':
      if (!cabinet || !fix.sectionId) return false;
      return quickFixFitAppliance(cabinet, fix.sectionId, project);

    case 'obstacle-cutout':
      if (!cabinet) return false;
      if (fix.cutout) {
        cabinet.cutout = structuredClone(fix.cutout);
        return true;
      }
      return quickFixObstacleCutout(cabinet, fix.obstacleId, project);

    default:
      return false;
  }
}
