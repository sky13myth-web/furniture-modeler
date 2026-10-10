/** Schematic hinge geometry. These symbols do not define hardware drilling. */
export function createDoorHingeSymbols({ width, height, thickness = 18, opening = 'left', opened = false, count = 2 }) {
  if (![width, height, thickness].every(value => Number.isFinite(value) && value > 0) || !Number.isInteger(count) || count < 1 || count > 12) return [];
  const right = opening === 'right', up = opening === 'up';
  const angle = opened ? up ? Math.PI * .44 : Math.PI / 2 : 0, cosine = Math.cos(angle), sine = Math.sin(angle), sign = right ? -1 : 1;
  const origin = [right ? width : 0, up ? height : 0, 0];
  const u = up ? [1, 0, 0] : [sign * cosine, 0, sine], v = up ? [0, -cosine, sine] : [0, 1, 0], normal = up ? [0, sine, cosine] : [-sign * sine, 0, cosine];
  const transform = (a, b, depth) => origin.map((value, axis) => value + u[axis] * a + v[axis] * b + normal[axis] * depth);
  const span = up ? width : height, margin = Math.min(100, span * .2), inset = Math.min(23, (up ? height : width) * .25);
  const radius = Math.min(17.5, inset * .72, span / (count * 3));
  return Array.from({ length: count }, (_, index) => {
    const station = count === 1 ? span / 2 : margin + index * (span - 2 * margin) / (count - 1);
    const a = up ? station : inset, b = up ? inset : station, cup = transform(a, b, -1.5);
    const cupOutline = Array.from({ length: 20 }, (_, step) => transform(a + Math.cos(step * Math.PI / 10) * radius, b + Math.sin(step * Math.PI / 10) * radius, -1.5));
    const plateCenter = up ? [station, height - 4, -25] : [right ? width - 4 : 4, station, -25];
    const plate = up ? [[station - 14, height - 4, -43], [station + 14, height - 4, -43], [station + 14, height - 4, -7], [station - 14, height - 4, -7]] : [[plateCenter[0], station - 14, -43], [plateCenter[0], station + 14, -43], [plateCenter[0], station + 14, -7], [plateCenter[0], station - 14, -7]];
    const pivot = up ? [station, height - 4, -1] : [right ? width - 4 : 4, station, -1];
    return { index, opening, schematic: true, cup, cupOutline, plate, arm: [plateCenter, pivot, cup], doorNormal: normal };
  });
}
