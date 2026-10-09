/** Annotation regions inside the actual cut contour; geometry is never changed. */
const inside = (x, y, outline) => {
  let result = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i], b = outline[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
};

/** Stock contours are axis-aligned rectangles or L outlines. Checking every
 * interior grid cell excludes a removed notch even when a candidate rectangle
 * contains several polygon vertices. Also works with orthogonal stepped shapes. */
export function contourMarkerRegions(outline, width, height) {
  const shape = outline?.length > 2 ? outline : [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const xs = [...new Set(shape.map(p => p.x))].sort((a, b) => a - b), ys = [...new Set(shape.map(p => p.y))].sort((a, b) => a - b);
  const regions = [];
  for (let left = 0; left < xs.length - 1; left++) for (let right = left + 1; right < xs.length; right++) {
    for (let top = 0; top < ys.length - 1; top++) for (let bottom = top + 1; bottom < ys.length; bottom++) {
      let contained = true;
      for (let x = left; x < right && contained; x++) for (let y = top; y < bottom; y++) {
        if (!inside((xs[x] + xs[x + 1]) / 2, (ys[y] + ys[y + 1]) / 2, shape)) { contained = false; break; }
      }
      if (!contained) continue;
      const w = xs[right] - xs[left], h = ys[bottom] - ys[top];
      if (w <= 0 || h <= 0) continue;
      regions.push({ left: xs[left], top: ys[top], right: xs[right], bottom: ys[bottom], width: w, height: h,
        x: (xs[left] + xs[right]) / 2, y: (ys[top] + ys[bottom]) / 2, area: w * h });
    }
  }
  const distance = region => Math.hypot(region.x - width / 2, region.y - height / 2);
  const label = [...regions].sort((a, b) => b.area - a.area || distance(a) - distance(b))[0] ?? null;
  const grain = [...regions].sort((a, b) => b.height - a.height || b.width - a.width || distance(a) - distance(b))[0] ?? null;
  return { grain, label };
}
