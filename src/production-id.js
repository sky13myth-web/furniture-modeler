/** Shared, project-wide production code from the zero-based generated-parts order. */
export function productionPartCode(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Invalid production part index');
  return `P${String(index + 1).padStart(4, '0')}`;
}
