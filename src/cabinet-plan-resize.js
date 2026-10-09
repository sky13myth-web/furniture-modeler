/** Pure width/depth editing for numeric inputs and plan-handle previews. */
import { constrainCabinetEdit } from './appliance-constraints.js';
import { canEditCabinetPlacement } from './engine.js';

const clone = value => structuredClone(value);
const LIMITS = { width: [100, 6000], depth: [100, 3000] };
const PLACEMENT_REASON = 'Размер ограничен стеной, соседним шкафом или монтажным отступом.';
const CONSTRUCTION_REASON = 'Размер ограничен габаритами техники и конструкцией шкафа.';

/**
 * Keep the cabinet origin, rotation and section contents. The owner commits
 * the returned cabinet on release; this helper never toasts or mutates data.
 */
export function resizeCabinetOnPlan(cabinet, target, project) {
  const proposed = clone(cabinet); let bounded = false;
  for (const [axis, [minimum, maximum]] of Object.entries(LIMITS)) {
    if (target?.[axis] === undefined) continue;
    if (!Number.isFinite(target[axis])) return { cabinet: clone(cabinet), possible: false, clamped: false, reason: 'Введите допустимую ширину или глубину шкафа.' };
    proposed[axis] = Math.max(minimum, Math.min(maximum, target[axis]));
    bounded ||= proposed[axis] !== target[axis];
  }
  const structural = constrainCabinetEdit(cabinet, proposed, project);
  if (!structural.possible) return { cabinet: clone(cabinet), possible: false, clamped: true, reason: structural.reason ?? CONSTRUCTION_REASON };
  const accepted = structural.cabinet;
  if (canEditCabinetPlacement(cabinet, accepted, project)) return { cabinet: accepted, possible: true, clamped: bounded || structural.clamped, ...((bounded || structural.clamped) ? { reason: structural.reason ?? CONSTRUCTION_REASON } : {}) };
  const at = fraction => ({ ...clone(accepted), width: cabinet.width + (accepted.width - cabinet.width) * fraction, depth: cabinet.depth + (accepted.depth - cabinet.depth) * fraction });
  let low = 0, high = 1;
  for (let iteration = 0; iteration < 48; iteration++) {
    const fraction = (low + high) / 2, next = at(fraction);
    if (canEditCabinetPlacement(cabinet, next, project)) low = fraction;
    else high = fraction;
  }
  const sizeChange = Math.max(Math.abs(accepted.width - cabinet.width), Math.abs(accepted.depth - cabinet.depth));
  const result = at(Math.max(0, low - .01 / Math.max(.01, sizeChange)));
  return { cabinet: result, possible: true, clamped: true, reason: PLACEMENT_REASON };
}
