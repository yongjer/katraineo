// A wood grain texture for the "wood" board style, drawn once on a canvas: straight grain running from top to bottom,
// as on a kaya board. Drawn rather than shipped as an image, and as a bitmap rather than an SVG filter, which the
// board would otherwise recompute every time it repaints (several times a second while analysis comes in).

const SIZE = 512;

/** A small deterministic pseudo-random generator, so the board looks the same every time. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise over [0, n) with `n` random knots, wrapping around. */
function noise1d(n: number, random: () => number) {
  const knots = Array.from({ length: n }, random);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = knots[((i % n) + n) % n];
    const b = knots[(((i + 1) % n) + n) % n];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

let cached: string | null | undefined;

/** The texture as a data URL, or null where there is no canvas (tests). */
export function woodTexture(): string | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (typeof document === "undefined") return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return cached;
  const random = mulberry32(19);
  const waviness = noise1d(8, random); // how the grain lines bend along their length
  const density = noise1d(64, random); // ring width varies across the board
  const fine = noise1d(SIZE, random);
  const image = ctx.createImageData(SIZE, SIZE);
  const light = [226, 184, 116];
  const dark = [203, 150, 86];
  for (let y = 0; y < SIZE; y++) {
    const bend = 8 * (waviness((y / SIZE) * 8) - 0.5);
    for (let x = 0; x < SIZE; x++) {
      const u = x + bend + 6 * (density((x / SIZE) * 64) - 0.5);
      const rings = 0.5 + 0.5 * Math.sin((u / SIZE) * Math.PI * 2 * 23 + 3 * density((u / SIZE) * 16));
      const grain = Math.pow(rings, 3) * 0.75 + 0.25 * fine(x + y * 0.02) * 0.5;
      const i = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) image.data[i + c] = Math.round(light[c] + (dark[c] - light[c]) * grain);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  cached = canvas.toDataURL("image/png");
  return cached;
}
